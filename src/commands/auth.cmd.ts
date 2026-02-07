import type { Command } from '@commander-js/extra-typings';
import { withErrorHandling } from '../utils/errors.js';
import { getTokens, clearTokens, getConfigPath, getClientCredentials } from '../auth/config.js';
import { runOAuthFlow } from '../auth/oauth.js';
import pkg from '@freshbooks/api';
const { Client } = pkg;

export function registerAuthCommand(program: Command) {
  const auth = program.command('auth').description('Manage FreshBooks authentication');

  auth
    .command('login')
    .description('Authenticate with FreshBooks via OAuth2')
    .requiredOption('--client-id <id>', 'FreshBooks OAuth app client ID')
    .requiredOption('--client-secret <secret>', 'FreshBooks OAuth app client secret')
    .option('--redirect-uri <uri>', 'Custom redirect URI', 'http://localhost:8315/callback')
    .option('--manual', 'Manually paste the authorization code instead of using a local server')
    .action(
      withErrorHandling(async (opts) => {
        await runOAuthFlow({
          clientId: opts.clientId,
          clientSecret: opts.clientSecret,
          redirectUri: opts.redirectUri,
          manual: opts.manual,
        });
      })
    );

  auth
    .command('logout')
    .description('Clear stored authentication tokens and credentials')
    .action(
      withErrorHandling(async () => {
        clearTokens();
        console.log('Logged out. Tokens and credentials cleared.');
      })
    );

  auth
    .command('status')
    .description('Show current authentication status')
    .action(
      withErrorHandling(async () => {
        const tokens = getTokens();
        if (!tokens) {
          console.log('Not authenticated. Run `freshbooks auth login --client-id <id> --client-secret <secret>` to connect.');
          return;
        }

        const expiresAt = new Date(tokens.expiresAt);
        const now = new Date();
        const expired = expiresAt <= now;

        console.log(`Account ID: ${tokens.accountId}`);
        console.log(`Client ID:  ${tokens.clientId.slice(0, 8)}...`);
        console.log(`Token expires: ${expiresAt.toISOString()}`);
        console.log(`Status: ${expired ? 'EXPIRED' : 'Active'}`);
        console.log(`Config: ${getConfigPath()}`);
      })
    );

  auth
    .command('refresh')
    .description('Manually refresh the access token')
    .action(
      withErrorHandling(async () => {
        const tokens = getTokens();
        if (!tokens) {
          console.error('Not authenticated. Run `freshbooks auth login --client-id <id> --client-secret <secret>` first.');
          process.exit(1);
        }

        const { clientId, clientSecret } = getClientCredentials();

        const fbClient = new Client(clientId, {
          clientSecret,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });

        const refreshed = await fbClient.refreshAccessToken(tokens.refreshToken);

        if (!refreshed) {
          console.error('Failed to refresh token. Run `freshbooks auth login` to re-authenticate.');
          process.exit(1);
        }

        const { saveTokens } = await import('../auth/config.js');
        saveTokens({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: refreshed.accessTokenExpiresAt,
          accountId: tokens.accountId,
        });

        console.log('Token refreshed successfully.');
        console.log(`New expiry: ${refreshed.accessTokenExpiresAt.toISOString()}`);
      })
    );
}
