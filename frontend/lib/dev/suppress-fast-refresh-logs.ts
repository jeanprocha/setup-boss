const PATCH_KEY = '__sbFastRefreshLogPatched';

function isNoisyFastRefreshMessage(first: unknown): boolean {
  if (typeof first !== 'string' || !first.startsWith('[Fast Refresh]')) {
    return false;
  }
  return first.includes('rebuilding') || first.includes('done in');
}

/** Silencia logs rotineiros de HMR do Next.js em desenvolvimento. */
export function suppressFastRefreshConsoleLogs(): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (typeof window === 'undefined') return;
  if ((globalThis as Record<string, unknown>)[PATCH_KEY]) return;

  (globalThis as Record<string, unknown>)[PATCH_KEY] = true;

  const originalLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    if (isNoisyFastRefreshMessage(args[0])) return;
    originalLog(...args);
  };
}
