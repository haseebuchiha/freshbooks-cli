/**
 * Wraps a Commander action handler with error handling.
 * Catches SDK errors and maps them to friendly CLI messages.
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<void>>(fn: T): T {
  const wrapped = async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.message?.includes('unauthenticated')) {
        console.error(
          'Authentication failed. Your token may have been revoked.\nRun `freshbooks auth login` to re-authenticate.'
        );
      } else if (err?.statusCode === 404) {
        console.error(`Resource not found: ${err.message ?? 'unknown'}`);
      } else if (err?.statusCode === 422) {
        console.error('Validation error:');
        if (err.errors && Array.isArray(err.errors)) {
          for (const e of err.errors) {
            console.error(`  - ${e.field ?? 'unknown field'}: ${e.message}`);
          }
        } else {
          console.error(`  ${err.message}`);
        }
      } else if (err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
        console.error('Cannot reach FreshBooks API. Check your internet connection.');
      } else {
        console.error(`Error: ${err.message ?? err}`);
      }
      process.exit(1);
    }
  };
  return wrapped as T;
}
