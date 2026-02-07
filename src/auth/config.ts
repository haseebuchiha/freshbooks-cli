import Conf from 'conf';
import { chmodSync } from 'node:fs';

interface ConfigStore {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO date string
  accountId: string;
}

const config = new Conf<Partial<ConfigStore>>({
  projectName: 'freshbooks-cli',
});

// Set restrictive file permissions (owner read/write only)
try {
  chmodSync(config.path, 0o600);
} catch {
  // May fail on Windows -- non-critical
}

/**
 * Save client credentials to config.
 * Called during `auth login` so they persist for all future commands.
 */
export function saveClientCredentials(clientId: string, clientSecret: string): void {
  config.set('clientId', clientId);
  config.set('clientSecret', clientSecret);
}

/**
 * Read client credentials.
 * Priority: env vars > stored config > error.
 */
export function getClientCredentials(): { clientId: string; clientSecret: string } {
  // Env vars take priority (allow override)
  const envClientId = process.env.FRESHBOOKS_CLIENT_ID;
  const envClientSecret = process.env.FRESHBOOKS_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  // Fall back to stored config
  const storedClientId = config.get('clientId');
  const storedClientSecret = config.get('clientSecret');

  if (storedClientId && storedClientSecret) {
    return { clientId: storedClientId, clientSecret: storedClientSecret };
  }

  console.error(
    'Missing client credentials.\n' +
      'Run `freshbooks auth login --client-id <id> --client-secret <secret>` to authenticate,\n' +
      'or set FRESHBOOKS_CLIENT_ID and FRESHBOOKS_CLIENT_SECRET environment variables.'
  );
  process.exit(1);
}

export function getTokens(): ConfigStore | null {
  const accessToken = config.get('accessToken');
  const refreshToken = config.get('refreshToken');
  const expiresAt = config.get('expiresAt');
  const accountId = config.get('accountId');
  const clientId = config.get('clientId');
  const clientSecret = config.get('clientSecret');

  if (!accessToken || !refreshToken || !expiresAt || !accountId || !clientId || !clientSecret) {
    return null;
  }

  return { accessToken, refreshToken, expiresAt, accountId, clientId, clientSecret };
}

export function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  accountId: string;
}): void {
  config.set('accessToken', tokens.accessToken);
  config.set('refreshToken', tokens.refreshToken);
  config.set('expiresAt', tokens.expiresAt.toISOString());
  config.set('accountId', tokens.accountId);
}

export function clearTokens(): void {
  config.clear();
}

export function getConfigPath(): string {
  return config.path;
}
