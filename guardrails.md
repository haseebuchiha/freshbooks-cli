# Guardrails -- Lessons Learned Building the FreshBooks CLI

Hard-won knowledge from implementation. Read this before making changes.

---

## 1. `@freshbooks/api` SDK Is CJS -- Named ESM Imports Will Fail

The `@freshbooks/api` package (v4.1.0) is CommonJS. This project is `"type": "module"` (ESM). You **cannot** do:

```typescript
import { Client } from '@freshbooks/api'; // FAILS at runtime
```

You **must** use default import and destructure:

```typescript
import pkg from '@freshbooks/api';
const { Client } = pkg;
```

This applies everywhere the SDK is imported. The TypeScript compiler won't catch this -- it compiles fine but crashes at runtime with `SyntaxError: Named export 'Client' not found`.

For SDK sub-modules (query builders), named imports work because they're deep path imports:

```typescript
import { PaginationQueryBuilder } from '@freshbooks/api/dist/models/builders/PaginationQueryBuilder.js';
// This works fine
```

---

## 2. tsup Bundling -- Do NOT Bundle Everything

Attempting `noExternal: [/.*/]` to bundle all deps into a single file causes `Dynamic require of "events" is not supported` errors. CJS packages like `commander` use `require('events')` internally, and the CJS-to-ESM shim that tsup/esbuild generates cannot resolve Node.js builtins dynamically.

The working tsup config keeps deps external (the default):

```typescript
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  // No noExternal -- let deps stay in node_modules
});
```

Output is ~16KB. Users need `node_modules` present (standard for a `npm link`-ed CLI).

---

## 3. OAuth2 Redirect URI -- `localhost` Does NOT Work

FreshBooks consistently rejects `http://localhost:8315/callback` as a redirect URI during the OAuth authorization step, even when it is correctly registered in the Developer Portal. The exact cause is unknown (possibly a FreshBooks-side validation quirk), but after multiple attempts with different encodings, it always returns:

> "The redirect uri included is not valid."

**What works**: The out-of-band (OOB) redirect URI `urn:ietf:wg:oauth:2.0:oob`. This is a special OAuth2 URI that tells FreshBooks to display the authorization code directly on a web page. The user copies the code and pastes it into the CLI.

The `--manual` flag on `auth login` uses this OOB flow by default. The local HTTP server flow (`--redirect-uri http://localhost:8315/callback`) is still in the code as an option but is not the default.

---

## 4. SDK Error Handling -- It Throws, Not Returns

The SDK type signature shows `Promise<Result<T>>` with `{ ok, data?, error? }`. In practice:

- **Success**: `const { data } = await client.invoices.list(accountId)` works. `data` contains the result.
- **Errors**: The SDK **throws** exceptions. You must use try/catch, not check `ok === false`.

Thrown errors have the shape `{ name, message, statusCode, errors[] }`. The `withErrorHandling()` wrapper in `utils/errors.ts` catches these and maps status codes to friendly CLI messages.

---

## 5. SDK Method Signatures Are Not Consistent

The SDK methods have inconsistent argument ordering. Always check `APIClient.d.ts`:

- `invoices.create(invoice, accountId)` -- payload **first**, then accountId
- `invoices.single(accountId, invoiceId)` -- accountId **first**, then ID
- `invoices.update(accountId, invoiceId, data)` -- accountId, ID, then payload
- `invoices.list(accountId, queryBuilders?)` -- accountId first
- `invoices.delete(accountId, invoiceId)` -- this archives (sets vis_state=1), not deletes

Do not assume consistency. Read the types.

---

## 6. FreshBooks "Delete" Is Actually "Archive"

FreshBooks uses `vis_state` to manage resource lifecycle:
- `0` = active
- `1` = deleted/archived

The SDK's `.delete()` method sets `vis_state = 1`. There is no permanent deletion. The CLI uses the command name `archive` instead of `delete` to make this clear.

---

## 7. Client Credentials Storage

Client ID and secret are stored in the `conf` config file (`~/.config/freshbooks-cli-nodejs/config.json` or platform equivalent) alongside tokens. They are **not encrypted** -- the file has 0600 permissions.

Priority for reading credentials:
1. Environment variables (`FRESHBOOKS_CLIENT_ID`, `FRESHBOOKS_CLIENT_SECRET`) -- highest priority
2. Stored config -- fallback
3. Error with instructions -- if neither exists

The `auth login` command requires `--client-id` and `--client-secret` flags and persists them. All subsequent commands read from config automatically.

---

## 8. Token Refresh -- Refresh Tokens Are One-Time-Use

FreshBooks refresh tokens are single-use. After refreshing, the old refresh token is invalidated and a new one is returned. The `client-factory.ts` handles this:

- Before every command, checks if the access token expires within 5 minutes
- If so, refreshes and **saves both the new access token AND new refresh token** to config
- If refresh fails, the user must re-authenticate with `auth login`

---

## 9. Money Values Are Strings

The SDK returns monetary values as `{ amount: string, code: string }`. The `amount` is a string like `"30000.00"`, not a number. If you ever need to do math on these, use `decimal.js` to avoid floating-point issues. Do not `parseFloat()` money.

---

## 10. The `open` Package and Background Processes

The `open` package opens URLs in the default browser. When a CLI command runs in the background (no TTY), `open` still works but `readline` (used for the manual code paste) gets EOF immediately and returns an empty string. If the auth flow needs to run non-interactively, the code exchange must be done separately.
