/**
 * One cooldown per account, so background work does not hammer a limit.
 *
 * GitHub answers a limit with 403 or 429 and a reset time. Each screen used
 * to decide that for itself and try again immediately, which is how a quiet
 * phone spends the rest of the window. The map is the whole scheduler: a
 * primary read may still go (the person is waiting), a background one waits
 * out the window.
 */

export type RequestPriority = 'interactive' | 'background';

interface Window {
  /** Epoch ms after which requests may leave again. */
  until: number;
}

const windows = new Map<string, Window>();

function accountOf(token: string): string {
  // The token is the account we have at the transport. It never leaves this
  // map, and the map is not persisted.
  return token;
}

/** Remember that this account should not send background work until `until`. */
export function noteRateLimit(token: string, until: number): void {
  if (!Number.isFinite(until)) return;
  const key = accountOf(token);
  const current = windows.get(key);
  if (!current || until > current.until) windows.set(key, { until });
}

/** How long a background caller should wait, or 0 when the window has passed. */
export function cooldownRemaining(token: string, now = Date.now()): number {
  const until = windows.get(accountOf(token))?.until ?? 0;
  return Math.max(0, until - now);
}

/**
 * Whether this call may leave now.
 *
 * Interactive work always may: the person asked, and a stale screen is worse
 * than one more request. Background work waits out a known window.
 */
export function maySend(token: string, priority: RequestPriority = 'interactive', now = Date.now()): boolean {
  if (priority === 'interactive') return true;
  return cooldownRemaining(token, now) === 0;
}

/** Drop a window. Tests, and an account that just signed in again. */
export function clearCooldown(token?: string): void {
  if (token == null) windows.clear();
  else windows.delete(accountOf(token));
}
