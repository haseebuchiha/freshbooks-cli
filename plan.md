# FreshBooks CLI + OpenClaw Skill

## Research Findings (key changes from original plan)

1. **Official SDK exists**: `@freshbooks/api` v4.1.0 -- typed, handles HTTP/retries. Errors are **thrown** (not returned), caught via try/catch with `{ name, message, statusCode, errors[] }`. Eliminates the need for a custom axios-based API layer entirely.
2. **OAuth2 is the only auth method**: No personal access tokens. Bearer tokens are JWTs (12h lifetime). Refresh tokens are forever but one-time-use. The CLI must handle the full OAuth2 authorization code grant flow.
3. **FreshBooks API surface is larger than planned**: Includes Estimates, Projects, Services, Items, Taxes, Journal Entries, Webhooks, Staff/Team, and 6+ report types (General Ledger, Expense Details, Chart of Accounts, Cash Flow, Balance Sheet, Account Aging).
4. **SDK provides query builders**: `PaginationQueryBuilder`, `SearchQueryBuilder`, `IncludesQueryBuilder` -- no custom pagination needed.
5. **Money values are strings**: SDK returns `{ amount: string, code: string }` -- need `decimal.js` for any calculations.
6. **Commander.js extra typings**: `@commander-js/extra-typings` provides full TypeScript inference for `.opts()` and `.action()`.

---

## Part 1: CLI Tool (`~/PersonalProjects/freshbooks-cli`)

### Tech Stack

- **Runtime**: Node.js 18+ / TypeScript 5.x
- **CLI Framework**: `@commander-js/extra-typings` -- Commander.js with full TS inference
- **FreshBooks API**: `@freshbooks/api` v4.1.0 (official SDK, MIT license)
- **Input Validation**: `zod` -- validate command inputs before hitting the API
- **Output Formatting**: `cli-table3` for table output, raw JSON as default
- **Token Storage**: `conf` package -- persists tokens to `~/.config/freshbooks-cli/config.json` (plaintext, 0600 file permissions). Client ID and secret are read from env vars (`FRESHBOOKS_CLIENT_ID`, `FRESHBOOKS_CLIENT_SECRET`), not stored on disk.
- **OAuth2 Callback**: `node:http` -- zero-dependency temporary server for the OAuth callback during `freshbooks auth login`
- **Browser Launch**: `open` package -- opens the OAuth authorization URL
- **Build**: `tsup` -- bundles to a single ESM entry for fast startup
- **Decimal Math**: `decimal.js` for monetary calculations if needed in reports

### Authentication Flow (OAuth2)

FreshBooks requires OAuth2 authorization code grant. The CLI handles this with a local callback server:

```
freshbooks auth login          # Opens browser -> FreshBooks OAuth -> local callback -> stores tokens
freshbooks auth logout         # Revokes tokens and clears config
freshbooks auth status         # Shows current auth state (user, account, token expiry)
freshbooks auth refresh        # Manually refreshes the access token
```

**How `freshbooks auth login` works:**

1. CLI reads `FRESHBOOKS_CLIENT_ID` and `FRESHBOOKS_CLIENT_SECRET` from environment variables (errors if missing)
2. CLI starts a temporary `node:http` server on `http://localhost:8315/callback` (clear error if port occupied)
3. CLI opens the FreshBooks authorization URL in the browser:
   `https://auth.freshbooks.com/oauth/authorize?response_type=code&client_id=<id>&redirect_uri=http://localhost:8315/callback`
4. User authorizes in browser, FreshBooks redirects to `localhost:8315/callback?code=XXX`
5. CLI exchanges the code for access token + refresh token via `client.getAccessToken(code)`
6. CLI persists: `{ accessToken, refreshToken, expiresAt, accountId }` to `conf` config (0600 permissions)
7. CLI calls `client.users.me()` to get the account ID and stores it
8. Local server shuts down, CLI prints success

**Auto-refresh**: A `getAuthenticatedClient()` factory function checks token expiry before every command. If expired or within 5 minutes of expiry, it uses the refresh token to get a new pair and persists them.

### Directory Structure

```
freshbooks-cli/
  src/
    index.ts                   # CLI entry point -- registers all command groups, parses args
    auth/
      config.ts                # Config read/write (conf package) -- tokens + account. Client creds via env vars.
      oauth.ts                 # OAuth2 flow: start node:http callback server, open browser, exchange code
      client-factory.ts        # getAuthenticatedClient() -- creates @freshbooks/api Client with auto-refresh
    commands/
      auth.cmd.ts              # `freshbooks auth login|logout|status|refresh`
      clients.cmd.ts           # `freshbooks clients list|get|create|update|archive`
      invoices.cmd.ts          # `freshbooks invoices list|get|create|update|archive|send`
      expenses.cmd.ts          # `freshbooks expenses list|get|create|update|archive`
      time-entries.cmd.ts      # `freshbooks time list|get|log|update|archive`
      payments.cmd.ts          # `freshbooks payments list|get|record`
      estimates.cmd.ts         # `freshbooks estimates list|get|create|update|archive|send`
      projects.cmd.ts          # `freshbooks projects list|get|create|update|archive`
      reports.cmd.ts           # `freshbooks reports expense-details|balance-sheet|account-aging|...`
    utils/
      formatter.ts             # Output switching: --format json|table
      errors.ts                # Unified error handler: maps SDK errors to friendly CLI messages
      validators.ts            # Zod schemas for command inputs (invoice create payload, etc.)
  package.json
  tsconfig.json
  tsup.config.ts
  README.md
  .gitignore
```

**Why no `api/` directory?** The `@freshbooks/api` SDK already provides typed methods for every resource (`client.invoices.list()`, `client.clients.create()`, etc.). Each command file directly calls the SDK. No wrapper needed.

### Command Surface

Each resource follows a consistent CRUD pattern via the SDK:

- **Auth**: `freshbooks auth login`, `logout`, `status`, `refresh`
- **Clients**: `freshbooks clients list [--search <term>] [--page <n>]`, `get <id>`, `create --fname <> --lname <> --email <>`, `update <id> [fields]`, `archive <id>`
- **Invoices**: `freshbooks invoices list`, `get <id>`, `create --client-id <> --lines <json>`, `update <id>`, `archive <id>`, `send <id> [--email]`
- **Expenses**: `freshbooks expenses list [--date-from] [--date-to]`, `get <id>`, `create`, `update <id>`, `archive <id>`
- **Time Entries**: `freshbooks time list [--project-id]`, `get <id>`, `log --duration <> --client-id <>`, `update <id>`, `archive <id>`
- **Payments**: `freshbooks payments list`, `get <id>`, `record --invoice-id <> --amount <>`
- **Estimates**: `freshbooks estimates list`, `get <id>`, `create`, `update <id>`, `archive <id>`, `send <id>`
- **Projects**: `freshbooks projects list`, `get <id>`, `create --title <>`, `update <id>`, `archive <id>`
- **Reports**: `freshbooks reports expense-details [--start-date] [--end-date]`, `balance-sheet`, `account-aging`, `cash-flow`, `general-ledger`, `chart-of-accounts`

Note: FreshBooks does not support permanent deletion. `archive` sets `vis_state = 1`. Use `--include-archived` on `list` commands to show archived resources.

**Global flags**: `--format json|table` (default: json), `--account <id>` (override default), `--include-archived`

### SDK Client Pattern

Every command follows the same pattern. The SDK **throws** on errors (not returned in the response):

```typescript
// Inside any command action handler:
try {
  const fb = await getAuthenticatedClient();         // Auto-refreshes if needed
  const { data } = await fb.invoices.list(accountId, [paginator, search]);
  output(data, options.format);                       // formatter handles json/table
} catch (err) {
  handleError(err);                                   // maps SDK errors to friendly CLI messages
}
```

A `withErrorHandling(fn)` wrapper in `utils/errors.ts` wraps every command action to avoid repeating try/catch boilerplate.

### Error Handling

- **Not authenticated** -> "Run `freshbooks auth login` to connect your FreshBooks account"
- **Missing env vars** -> "Set FRESHBOOKS_CLIENT_ID and FRESHBOOKS_CLIENT_SECRET environment variables"
- **Token expired + refresh fails** -> "Session expired. Run `freshbooks auth login` to re-authenticate"
- **401 from API** -> "Authentication failed. Your token may have been revoked. Run `freshbooks auth login`"
- **404** -> "Resource not found: <resource> #<id>"
- **422 (validation)** -> Show SDK's `errors[]` array with field-level detail
- **Network error** -> "Cannot reach FreshBooks API. Check your internet connection."
- **Port 8315 occupied** -> "Port 8315 is in use. Close the process using it and run `freshbooks auth login` again."

---

## Part 2: OpenClaw Skill (`~/.cursor/skills/freshbooks-cli/`)

A thin skill that teaches the Cursor agent when and how to invoke the CLI.

### Skill Structure

```
~/.cursor/skills/freshbooks-cli/
  SKILL.md                   # Entry point: triggers, quick-start, command overview
  references/
    commands.md              # Full command reference with examples for every subcommand
    workflows.md             # Common multi-step workflows (e.g., "invoice a client")
```

### SKILL.md Content

- **Triggers**: "freshbooks", "invoice", "billing", "time tracking", "expenses", "accounting", "estimates", "projects"
- **Quick start**: How to verify the CLI is installed (`freshbooks auth status`) and configured
- **Command overview**: Grouped by resource, one-liner per command with key flags
- **Agent guidance**: When to use `--format json` (for parsing output) vs `--format table` (for user display)

### references/commands.md

Full reference for every command with:

- Syntax and all flags
- Required vs optional parameters
- Example invocations with expected JSON output shape
- Error scenarios and how to handle them

### references/workflows.md

Multi-step recipes the agent can follow:

- **Onboard a new client**: `clients create` -> `invoices create` -> `invoices send`
- **End of month billing**: `time list --date-from --date-to` -> `invoices create` -> `invoices send`
- **Expense report**: `expenses list --date-from --date-to` -> `reports expense-details`
- **Project billing**: `projects get <id>` -> `time list --project-id` -> `invoices create`
- **Financial overview**: `reports balance-sheet` + `reports account-aging` + `reports cash-flow`

---

## Implementation Order

Phases are sequential; steps within a phase can be parallelized where noted.

### Phase 1: Project Scaffolding

- `npm init` with `package.json` (name: `freshbooks-cli`, `"type": "module"`, bin entry, scripts: `build`, `dev`, `start`)
- Install deps: `@freshbooks/api`, `@commander-js/extra-typings`, `zod`, `conf`, `open`, `cli-table3`, `decimal.js`, `chalk`
- Install dev deps: `typescript`, `tsup`, `@types/node`
- Create `tsconfig.json` (target ES2022, module NodeNext, strict)
- Create `tsup.config.ts` (entry: `src/index.ts`, format: esm, clean)
- Create directory structure with placeholder files
- Wire up `src/index.ts` with Commander program skeleton

### Phase 2: OAuth2 Authentication (critical path)

- Implement `auth/config.ts` -- `conf`-based store (no encryption, 0600 perms). Reads `FRESHBOOKS_CLIENT_ID` / `FRESHBOOKS_CLIENT_SECRET` from env.
- Implement `auth/oauth.ts` -- start `node:http` server on port 8315, handle callback, exchange code, shutdown. Clear error on EADDRINUSE.
- Implement `auth/client-factory.ts` -- `getAuthenticatedClient()` that reads config, checks expiry, auto-refreshes
- Implement `commands/auth.cmd.ts` -- login, logout, status, refresh subcommands
- **Test end-to-end**: `freshbooks auth login` should open browser and complete the OAuth flow

### Phase 3: Core Infrastructure (parallelizable)

- Implement `utils/formatter.ts` -- json (default), table (cli-table3) output modes
- Implement `utils/errors.ts` -- map SDK errors to user-friendly messages, exit codes
- Implement `utils/validators.ts` -- Zod schemas for each resource's create/update payloads

### Phase 4: Resource Commands (parallelizable -- each command is independent)

- `commands/clients.cmd.ts` -- list, get, create, update, archive. Simplest resource, good first target.
- `commands/invoices.cmd.ts` -- list, get, create, update, archive, send. Most complex (line items).
- `commands/expenses.cmd.ts` -- list, get, create, update, archive. Includes category support.
- `commands/time-entries.cmd.ts` -- list, get, log, update, archive. Includes project association.
- `commands/payments.cmd.ts` -- list, get, record. Tied to invoices.
- `commands/estimates.cmd.ts` -- list, get, create, update, archive, send. Similar to invoices.
- `commands/projects.cmd.ts` -- list, get, create, update, archive. Includes services.
- `commands/reports.cmd.ts` -- expense-details, balance-sheet, account-aging, cash-flow, general-ledger, chart-of-accounts. May require raw HTTP if SDK doesn't cover reports.

### Phase 5: Polish

- Wire up `--format`, `--account`, `--include-archived` global flags
- Add `bin` field to `package.json` pointing to `dist/index.mjs` with shebang
- Test `npm link` for local global install
- Write README (install, env var setup, auth flow, usage examples)
- Add `.gitignore` (node_modules, dist, .env)

### Phase 6: OpenClaw Skill

- Create `~/.cursor/skills/freshbooks-cli/SKILL.md` with frontmatter, triggers, and command overview
- Create `references/commands.md` with full command reference
- Create `references/workflows.md` with multi-step agent recipes
