# @haseebuchiha/freshbooks-cli

A command-line tool for managing FreshBooks invoices, clients, and billing from the terminal. Built with the official `@freshbooks/api` SDK.

## Prerequisites

- **Node.js 18+**
- A **FreshBooks Developer App** with a client ID and client secret. Create one at [FreshBooks Developer Portal](https://my.freshbooks.com/#/developer).

## Installation

```bash
npm install -g @haseebuchiha/freshbooks-cli
```

> **Note:** This package is published to GitHub Package Registry. You may need to configure your `.npmrc`:
>
> ```
> @haseebuchiha:registry=https://npm.pkg.github.com
> ```

## Authentication

FreshBooks uses OAuth2. The CLI handles the full flow:

```bash
freshbooks auth login \
  --client-id <your-client-id> \
  --client-secret <your-client-secret> \
  --manual
```

The `--manual` flag is **required** -- it uses the out-of-band (OOB) OAuth flow where FreshBooks displays the authorization code on a web page. You copy the code and paste it into the CLI. The localhost redirect flow is not reliably supported by FreshBooks.

After login, credentials and tokens are stored locally in `~/.config/freshbooks-cli/config.json` with restrictive file permissions (0600). Tokens auto-refresh before expiry on every command.

### Verify auth

```bash
freshbooks auth status
```

### Other auth commands

```bash
freshbooks auth refresh   # Manually refresh the access token
freshbooks auth logout    # Clear all stored tokens and credentials
```

## Commands

### Clients

```bash
# List all clients (paginated)
freshbooks clients list
freshbooks clients list --page 2 --per-page 10
freshbooks clients list --search "Acme"

# Get a single client
freshbooks clients get <id>

# Create a client
freshbooks clients create --fname "John" --lname "Doe" --email "john@example.com" --organization "Acme Inc."

# Update a client
freshbooks clients update <id> --data '{"email": "new@example.com"}'
```

### Invoices

```bash
# List all invoices (paginated)
freshbooks invoices list
freshbooks invoices list --page 2 --per-page 10

# Get a single invoice
freshbooks invoices get <id>

# Create an invoice with line items
freshbooks invoices create --client-id 12345 \
  --lines '[{"name":"Web Services","qty":1,"unitCost":{"amount":"5000.00","code":"USD"}},{"name":"App Services","qty":1,"unitCost":{"amount":"3000.00","code":"USD"}}]'

# Create with full JSON payload
freshbooks invoices create --client-id 12345 --data '{"customerId":12345,"createDate":"2026-02-07","lines":[...]}'

# Update an invoice
freshbooks invoices update <id> --data '{"notes": "Updated terms"}'

# Archive an invoice (no permanent delete in FreshBooks)
freshbooks invoices archive <id>

# Get a shareable link
freshbooks invoices share-link <id>
```

## Output Format

All data commands output JSON to stdout. Pipe to `jq` for filtering:

```bash
freshbooks clients list | jq '.clients[].organization'
freshbooks invoices get 12345 | jq '.amount'
```

## Important Notes

- **Money values** are returned as `{"amount": "string", "code": "USD"}`. The amount is always a string (e.g., `"30000.00"`), not a number.
- **Archiving** sets `vis_state = 1`. FreshBooks does not support permanent deletion.
- **Token refresh** is automatic. If a refresh fails, run `freshbooks auth login` again.
- **Credentials** are stored locally with 0600 permissions. Client ID and secret can also be set via `FRESHBOOKS_CLIENT_ID` and `FRESHBOOKS_CLIENT_SECRET` environment variables.

## License

ISC
