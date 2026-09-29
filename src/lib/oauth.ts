/**
 * Signing in with GitHub, without a server: OAuth's **device flow**.
 *
 * The usual web flow ends with the app trading a code for a token using the
 * OAuth app's client *secret*, and a secret compiled into a public app is not
 * a secret. The device flow needs only the client id, which is public by
 * design: the phone asks GitHub for a short code, you type it into
 * github.com (in any browser, already signed in), and the phone polls until
 * GitHub says yes. The token that comes back is stored exactly where a pasted
 * one is, and nothing but GitHub ever sees it.
 *
 * This module is pure apart from `fetch`, which is passed in so the rules can
 * be tested on Node.
 */

/** The same scopes the token form asks for (`TOKEN_SETTINGS_URL`). */
export const OAUTH_SCOPES = 'read:user repo read:discussion write:discussion security_events';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

export interface DeviceCode {
  deviceCode: string;
  /** What you type on github.com, `WDJB-MJHT`. */
  userCode: string;
  /** `https://github.com/login/device`. */
  verificationUri: string;
  /** Epoch ms after which the code is dead. */
  expiresAt: number;
  /** Seconds GitHub wants between polls. */
  interval: number;
}

/**
 * Why a sign-in stopped. Each one is a different sentence on screen, because
 * each asks something different of the person holding the phone.
 */
export type DeviceFailure =
  /** Fifteen minutes passed without the code being entered. */
  | 'expired'
  /** `cancel` was pressed on github.com. */
  | 'denied'
  /** The OAuth app has the device flow switched off. */
  | 'disabled'
  /** The client id is wrong, or GitHub answered something unreadable. */
  | 'misconfigured'
  | 'network';

export class DeviceFlowError extends Error {
  readonly reason: DeviceFailure;

  constructor(reason: DeviceFailure) {
    super(`device flow: ${reason}`);
    this.name = 'DeviceFlowError';
    this.reason = reason;
  }
}

/** What one poll of the token endpoint means. */
export type Poll =
  | { kind: 'token'; token: string; scopes: string[] }
  | { kind: 'wait'; interval: number }
  | { kind: 'failed'; reason: DeviceFailure };

type Fetch = typeof fetch;

async function post(
  url: string,
  params: Record<string, string>,
  fetchFn: Fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new DeviceFlowError('network');
  }
  try {
    return await response.json();
  } catch {
    throw new DeviceFlowError('misconfigured');
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function count(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The answer to "give me a code", read strictly. */
export function readDeviceCode(body: unknown, now: number = Date.now()): DeviceCode {
  const data = (body ?? {}) as Record<string, unknown>;
  const error = text(data.error);
  if (error === 'device_flow_disabled') throw new DeviceFlowError('disabled');
  const deviceCode = text(data.device_code);
  const userCode = text(data.user_code);
  const verificationUri = text(data.verification_uri);
  if (error || !deviceCode || !userCode || !verificationUri) {
    throw new DeviceFlowError('misconfigured');
  }
  return {
    deviceCode,
    userCode,
    verificationUri,
    expiresAt: now + count(data.expires_in, 900) * 1000,
    interval: count(data.interval, 5),
  };
}

/**
 * One poll's answer. `slow_down` is GitHub saying the phone asked too soon;
 * the spec says to add five seconds to the interval and keep going, and GitHub
 * usually says what the new interval is.
 */
export function readPoll(body: unknown, interval: number): Poll {
  const data = (body ?? {}) as Record<string, unknown>;
  const token = text(data.access_token);
  if (token) {
    const scopes = (text(data.scope) ?? '')
      .split(/[\s,]+/)
      .filter((scope) => scope.length > 0);
    return { kind: 'token', token, scopes };
  }
  switch (text(data.error)) {
    case 'authorization_pending':
      return { kind: 'wait', interval };
    case 'slow_down':
      return { kind: 'wait', interval: count(data.interval, interval + 5) };
    case 'expired_token':
      return { kind: 'failed', reason: 'expired' };
    case 'access_denied':
      return { kind: 'failed', reason: 'denied' };
    case 'device_flow_disabled':
      return { kind: 'failed', reason: 'disabled' };
    default:
      return { kind: 'failed', reason: 'misconfigured' };
  }
}

/** Ask GitHub for a code to type in. */
export async function requestDeviceCode(
  clientId: string,
  signal?: AbortSignal,
  fetchFn: Fetch = fetch,
): Promise<DeviceCode> {
  const body = await post(DEVICE_CODE_URL, { client_id: clientId, scope: OAUTH_SCOPES }, fetchFn, signal);
  return readDeviceCode(body);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Poll until GitHub hands over a token, the code expires, or `signal` aborts.
 * A dropped connection mid-wait is not the end of the sign-in — you may be
 * walking between networks with the browser open — so it waits and asks again
 * until the code itself runs out.
 */
export async function waitForToken(
  clientId: string,
  code: DeviceCode,
  signal?: AbortSignal,
  fetchFn: Fetch = fetch,
  now: () => number = Date.now,
): Promise<string> {
  let interval = code.interval;
  for (;;) {
    await sleep(interval * 1000, signal);
    if (now() >= code.expiresAt) throw new DeviceFlowError('expired');
    let poll: Poll;
    try {
      const body = await post(
        TOKEN_URL,
        { client_id: clientId, device_code: code.deviceCode, grant_type: GRANT },
        fetchFn,
        signal,
      );
      poll = readPoll(body, interval);
    } catch (error) {
      if (error instanceof DeviceFlowError && error.reason === 'network') continue;
      throw error;
    }
    if (poll.kind === 'token') return poll.token;
    if (poll.kind === 'failed') throw new DeviceFlowError(poll.reason);
    interval = poll.interval;
  }
}

/**
 * What kind of token this is, from GitHub's own prefixes: `gho_` is an OAuth
 * token (signed in), `ghp_` a classic token and `github_pat_` a fine-grained
 * one (both pasted). Nothing needs storing to know how an account came in.
 */
export function tokenKind(token: string): 'oauth' | 'classic' | 'fine-grained' | 'other' {
  if (token.startsWith('gho_')) return 'oauth';
  if (token.startsWith('ghp_')) return 'classic';
  if (token.startsWith('github_pat_')) return 'fine-grained';
  return 'other';
}

/** `WDJBMJHT` → `WDJB-MJHT`, whichever way GitHub sent it. */
export function spacedCode(code: string): string {
  const bare = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return bare.length === 8 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : code.toUpperCase();
}

/** Where an OAuth sign-in can be revoked, or an organisation asked to allow it. */
export function authorizedAppUrl(clientId: string): string {
  return `https://github.com/settings/connections/applications/${clientId}`;
}
