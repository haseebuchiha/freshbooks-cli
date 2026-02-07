import pkg from '@freshbooks/api';
const { Client } = pkg;
import { getClientCredentials, getTokens, saveTokens } from './config.js';

type FreshBooksClient = InstanceType<typeof Client>;

/**
 * Creates an authenticated FreshBooks API client.
 * Automatically refreshes the token if expired or within 5 minutes of expiry.
 * Returns both the client and the accountId.
 */
export async function getAuthenticatedClient(): Promise<{
  client: FreshBooksClient;
  accountId: string;
}> {
  const tokens = getTokens();

  if (!tokens) {
    console.error(
      'Not authenticated. Run `freshbooks auth login` to connect your FreshBooks account.'
    );
    process.exit(1);
  }

  const { clientId, clientSecret } = getClientCredentials();

  const fbClient = new Client(clientId, {
    clientSecret,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });

  // Check if token is expired or within 5 minutes of expiry
  const expiresAt = new Date(tokens.expiresAt);
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
    console.error('Token expired or expiring soon. Refreshing...');

    try {
      const refreshed = await fbClient.refreshAccessToken(tokens.refreshToken);

      if (!refreshed) {
        console.error(
          'Session expired. Run `freshbooks auth login` to re-authenticate.'
        );
        process.exit(1);
      }

      saveTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.accessTokenExpiresAt,
        accountId: tokens.accountId,
      });

      console.error('Token refreshed successfully.');
    } catch {
      console.error(
        'Failed to refresh token. Run `freshbooks auth login` to re-authenticate.'
      );
      process.exit(1);
    }
  }

  return { client: fbClient, accountId: tokens.accountId };
}
