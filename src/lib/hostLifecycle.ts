/**
 * Host connection identity, poll gating, and the one retained sample per
 * resource. Pure: no React Native and no Connect client, so the lifecycle
 * rules are tested on Node. The live client and the disk stay in hostClient
 * and useHost, which call these.
 *
 * There is no sample ring and no server delta. A host answers the whole
 * snapshot, and only the last body per connection and resource is kept so an
 * unchanged poll is not written again. A ring or a delta protocol waits on
 * measured payload evidence that this one-sample bound is costly and that
 * hostd can serve a safe delta.
 */

import { normalizeUrl, type HostSettings } from './host';

/** One host plus one credential generation. The token itself is never stored. */
export function hostConnectionIdentity(url: string, credentialGeneration: string): string {
  return `${normalizeUrl(url)}#${credentialGeneration}`;
}

export function hostIdentity(settings: HostSettings, credentialGeneration: (token: string) => string): string {
  return hostConnectionIdentity(settings.url, credentialGeneration(settings.token));
}

export interface HostPollGate {
  /** True while the section is on screen. */
  visible: boolean;
  /** True while a poll for this screen is already in flight. */
  inFlight: boolean;
}

/**
 * A hidden screen does not start or continue a poll. A visible screen with a
 * poll already in flight does not start another, so repeated foregrounding
 * cannot stack requests.
 */
export function hostPollMayStart(gate: HostPollGate): boolean {
  return gate.visible && !gate.inFlight;
}

export interface HostBackoff {
  /** Failures in a row that were not a refused token. */
  failures: number;
  /** Epoch ms when the next ordinary call may leave. */
  retryAt: number;
  /** The host refused this token; only a credential change may ask again. */
  refused: boolean;
}

export const HOST_BACKOFF_INITIAL_MS = 2_000;
export const HOST_BACKOFF_CAP_MS = 60_000;

export function initialHostBackoff(): HostBackoff {
  return { failures: 0, retryAt: 0, refused: false };
}

/** 2s, 4s, 8s … capped at a minute. */
export function hostBackoffDelay(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(HOST_BACKOFF_CAP_MS, HOST_BACKOFF_INITIAL_MS * 2 ** Math.min(failures - 1, 5));
}

export function hostBackoffAfterSuccess(): HostBackoff {
  return initialHostBackoff();
}

export function hostBackoffAfterFailure(current: HostBackoff, refused: boolean, now: number): HostBackoff {
  if (refused) return { ...current, refused: true };
  const failures = current.failures + 1;
  return { failures, retryAt: now + hostBackoffDelay(failures), refused: false };
}

/** A probe always goes out. An ordinary poll waits out a refusal or a backoff. */
export function hostCallBlocked(backoff: HostBackoff | null, now: number, connectionProbe: boolean): 'refused' | 'waiting' | null {
  if (connectionProbe || !backoff) return null;
  if (backoff.refused) return 'refused';
  if (backoff.retryAt > now) return 'waiting';
  return null;
}

/**
 * The last sample for one connection and one resource. One entry, not a ring:
 * the previous body is what an unchanged poll is compared against.
 */
export interface SettledSample<T extends object> {
  body: string;
  value: T;
}

export function settleSample<T extends object>(
  previous: SettledSample<T> | undefined,
  value: T,
  encode: (value: T) => string = stableJson as (value: T) => string,
): { sample: SettledSample<T>; unchanged: boolean } {
  let body: string;
  try {
    body = encode(value);
  } catch {
    return { sample: { body: '', value }, unchanged: false };
  }
  if (previous && previous.body === body) {
    return { sample: previous, unchanged: true };
  }
  return { sample: { body, value }, unchanged: false };
}

/**
 * JSON with object keys in a fixed order. A host that answers the same
 * numbers with fields in a different order must still count as the same
 * sample, or the snapshot is rewritten on every poll.
 */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}
