import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';
import open from 'open';
import pkg from '@freshbooks/api';
const { Client } = pkg;
import { saveClientCredentials, saveTokens } from './config.js';

const DEFAULT_PORT = 8315;
const DEFAULT_REDIRECT_URI = `http://localhost:${DEFAULT_PORT}/callback`;

const SUCCESS_HTML = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
  <div style="text-align: center;">
    <h1>Authenticated!</h1>
    <p>You can close this tab and return to the terminal.</p>
  </div>
</body>
</html>
`;

export interface OAuthFlowOptions {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
  manual?: boolean;
}

/**
 * Exchanges an authorization code for tokens and saves everything.
 * Shared by both the local-server and manual flows.
 */
async function exchangeCodeAndSave(
  fbClient: InstanceType<typeof Client>,
  code: string
): Promise<void> {
  const tokenData = await fbClient.getAccessToken(code);
  if (!tokenData) {
    throw new Error('Token exchange returned undefined');
  }

  const userResponse = await fbClient.users.me();
  if (!userResponse.data) {
    throw new Error('Could not fetch user info');
  }

  const user = userResponse.data;
  const accountId = user.roles?.[0]?.accountId;

  if (!accountId) {
    throw new Error('User has no account ID in roles');
  }

  saveTokens({
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresAt: tokenData.accessTokenExpiresAt,
    accountId,
  });

  console.log(`\nAuthenticated as ${user.firstName} ${user.lastName} (${user.email})`);
  console.log(`Account ID: ${accountId}`);
}

/**
 * Manual flow: opens browser, user copies the code from the redirect URL
 * and pastes it into the terminal. Uses urn:ietf:wg:oauth:2.0:oob as redirect
 * URI so FreshBooks shows the code directly, or the user can copy it from
 * the URL bar of the redirect page.
 */
async function runManualFlow(
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<void> {
  const fbClient = new Client(clientId, {
    clientSecret,
    redirectUri,
  });

  const authUrl = fbClient.getAuthRequestUrl();

  console.log('Opening browser for authorization...\n');
  console.log(`If the browser doesn't open, visit this URL manually:\n${authUrl}\n`);
  open(authUrl);

  console.log('After authorizing, you will be redirected to a page.');
  console.log('Copy the "code" parameter from the URL bar and paste it below.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>((resolve) => {
    rl.question('Authorization code: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!code) {
    throw new Error('No authorization code provided');
  }

  await exchangeCodeAndSave(fbClient, code);
}

/**
 * Automatic flow: starts a local HTTP server to catch the OAuth callback.
 */
async function runServerFlow(
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<void> {
  const parsedUri = new URL(redirectUri);
  const port = parseInt(parsedUri.port, 10) || DEFAULT_PORT;

  const fbClient = new Client(clientId, {
    clientSecret,
    redirectUri,
  });

  const authUrl = fbClient.getAuthRequestUrl();

  console.log(`Authorization URL:\n${authUrl}\n`);

  return new Promise<void>((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url!, `http://localhost:${port}`);

        if (url.pathname !== parsedUri.pathname) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Missing authorization code');
          reject(new Error('No authorization code received'));
          server.close();
          return;
        }

        await exchangeCodeAndSave(fbClient, code);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SUCCESS_HTML);

        server.close();
        resolve();
      } catch (err) {
        res.writeHead(500);
        res.end('Internal error during authentication');
        server.close();
        reject(err);
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `Port ${port} is in use. Close the process using it and run \`freshbooks auth login\` again.`
        );
        process.exit(1);
      }
      reject(err);
    });

    server.listen(port, () => {
      console.log(`Listening on http://localhost:${port}${parsedUri.pathname}`);
      console.log('Opening browser...\n');
      open(authUrl);
    });
  });
}

/**
 * Runs the OAuth2 authorization code flow.
 * If --manual is passed, uses the paste-the-code flow.
 * Otherwise, starts a local server to catch the redirect.
 */
export async function runOAuthFlow(options: OAuthFlowOptions): Promise<void> {
  const { clientId, clientSecret } = options;

  // Persist client credentials so all future commands can use them
  saveClientCredentials(clientId, clientSecret);

  if (options.manual) {
    const redirectUri = options.redirectUri ?? 'urn:ietf:wg:oauth:2.0:oob';
    await runManualFlow(clientId, clientSecret, redirectUri);
  } else {
    const redirectUri = options.redirectUri ?? DEFAULT_REDIRECT_URI;
    await runServerFlow(clientId, clientSecret, redirectUri);
  }
}
