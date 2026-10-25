import { Code, ConnectError, createClient, type Client, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { HostService } from '../gen/hostd/v1/host_pb';
import { SourceService } from '../gen/hostd/v1/source_pb';
import { GitHubError } from './github';
import { HostError, normalizeUrl, type HostSettings, type Overview, type Panel, type ServiceDetail } from './host';
import {
  hostBackoffAfterFailure,
  hostBackoffAfterSuccess,
  hostCallBlocked,
  hostConnectionIdentity,
  initialHostBackoff,
  settleSample,
  stableJson,
  type HostBackoff,
  type SettledSample,
} from './hostLifecycle';
import { toOverview, toPanel, toServiceDetail } from './hostProto';
import { hostProbeFetch } from './hostProbeFetch';
import { keyOf } from './store';

/**
 * Talking to `hostd`: where it is and its token (in the keystore, beside the
 * GitHub token — the token is a key to a machine), and the calls the `host`
 * section makes. They are gRPC services (`proto/hostd/v1`) spoken in the
 * Connect protocol, which is plain HTTP/1.1 POSTs — what `fetch` can do, with
 * no TLS and no HTTP/2 needed on the tailnet. Each call carries the bearer
 * token and gives up after twenty seconds.
 *
 * A client is reused only for the same host and credential generation. There
 * is no sample ring and no server delta: one settled body is kept per
 * resource so an unchanged poll is not written again. See `hostLifecycle`.
 */

const KEY = 'host_settings';
const memory = { value: null as string | null };
const secure = Platform.OS !== 'web';

export const hostStore = {
  async get(): Promise<HostSettings | null> {
    const raw = secure ? await SecureStore.getItemAsync(KEY) : memory.value;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<HostSettings>;
      return parsed.url ? { url: parsed.url, token: parsed.token ?? '' } : null;
    } catch {
      return null;
    }
  },
  async set(settings: HostSettings): Promise<void> {
    const raw = JSON.stringify(settings);
    if (secure) await SecureStore.setItemAsync(KEY, raw);
    else memory.value = raw;
  },
  async clear(): Promise<void> {
    if (secure) await SecureStore.deleteItemAsync(KEY);
    else memory.value = null;
  },
};

const POINTS = 120;
// A public Funnel address can take several seconds to open a cold connection.
const TIMEOUT = 20_000;

interface HostClients {
  host: Client<typeof HostService>;
  sources: Client<typeof SourceService>;
}

interface LiveConnection {
  identity: string;
  clients: HostClients;
  backoff: HostBackoff;
}

/**
 * One live connection. Polling every few seconds used to build a transport
 * and two clients per call; those are the same objects for as long as the
 * address and the token stay the same. A probe speaks JSON rather than
 * binary, so it opens its own transport and does not replace this one.
 */
let live: LiveConnection | null = null;

function connectionIdentity(settings: HostSettings): string {
  return hostConnectionIdentity(settings.url, keyOf(settings.token));
}

function openClients(settings: HostSettings, connectionProbe: boolean): HostClients {
  const bearer: Interceptor = (next) => (request) => {
    if (settings.token) request.header.set('Authorization', `Bearer ${settings.token}`);
    return next(request);
  };
  const transport = createConnectTransport({
    baseUrl: normalizeUrl(settings.url),
    useBinaryFormat: !connectionProbe,
    fetch: connectionProbe && Platform.OS !== 'web' ? hostProbeFetch : undefined,
    interceptors: [bearer],
  });
  return { host: createClient(HostService, transport), sources: createClient(SourceService, transport) };
}

/** The clients for this address and token. Ordinary polls share them. */
function clients(settings: HostSettings): HostClients {
  return connectionFor(settings).clients;
}

/**
 * Forget a connection whose settings were replaced or cleared. The next call
 * opens a new client and is allowed to try again; a refusal only lasts until
 * the credential changes. Passing the previous settings drops that connection
 * only, so a late invalidation cannot erase the connection that replaced it.
 */
export function invalidateHostConnection(settings?: HostSettings): void {
  if (!settings || !live || live.identity === connectionIdentity(settings)) live = null;
}

const REFUSAL = 'the host refused the token · copy it again from the host';

function connectionFor(settings: HostSettings): LiveConnection {
  const identity = connectionIdentity(settings);
  if (live?.identity === identity) return live;
  live = { identity, clients: openClients(settings, false), backoff: initialHostBackoff() };
  return live;
}

function noteSuccess(settings: HostSettings): void {
  connectionFor(settings).backoff = hostBackoffAfterSuccess();
}

function noteFailure(settings: HostSettings, refused: boolean): void {
  const current = connectionFor(settings);
  current.backoff = hostBackoffAfterFailure(current.backoff, refused, Date.now());
}

/** One call, with the app's errors: the host's own words, or "could not reach". */
async function call<T>(
  settings: HostSettings,
  signal: AbortSignal | undefined,
  run: (c: HostClients) => Promise<T>,
  connectionProbe = false,
): Promise<T> {
  if (!connectionProbe) {
    const held = live?.identity === connectionIdentity(settings) ? live : null;
    const blocked = hostCallBlocked(held?.backoff ?? null, Date.now(), false);
    if (blocked === 'refused') throw new HostError(REFUSAL, 401);
    if (blocked === 'waiting') throw new GitHubError('network', 'waiting before asking the host again');
  }
  try {
    const value = await run(connectionProbe ? openClients(settings, true) : clients(settings));
    if (!connectionProbe) noteSuccess(settings);
    return value;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof HostError) {
      if (!connectionProbe && error.status === 401) noteFailure(settings, true);
      throw error;
    }
    const failure = ConnectError.from(error);
    const refused = failure.code === Code.Unauthenticated;
    if (!connectionProbe) noteFailure(settings, refused);
    switch (failure.code) {
      case Code.Unauthenticated:
        throw new HostError(REFUSAL, 401);
      case Code.DeadlineExceeded:
        throw new GitHubError('network', connectionProbe ? `connection timed out after ${TIMEOUT / 1000} seconds` : 'request timed out');
      case Code.Canceled:
        throw new GitHubError('network', 'connection was canceled');
      case Code.Unknown:
      case Code.Unimplemented:
        // No answer at all (fetch threw), or something that is not hostd.
        // Saved answers stay on screen through this, labelled with their
        // age, the same as GitHub being out of reach.
        if (failure.cause instanceof TypeError || /fetch|network/i.test(failure.rawMessage)) {
          const detail = settings.token
            ? failure.rawMessage.split(settings.token).join('[redacted]')
            : failure.rawMessage;
          throw new GitHubError('network', detail || `could not reach ${settings.url}`);
        }
        throw new HostError(
          failure.code === Code.Unimplemented ? 'that answered, but it is not hostd · is this the old address?' : failure.rawMessage,
        );
    }
    throw new HostError(failure.rawMessage || `the host answered ${Code[failure.code]}`);
  }
}

const options = (signal?: AbortSignal) => ({ signal, timeoutMs: TIMEOUT });

/** Is anything there, is it `hostd`, and does it take the token: the connect form's check. */
export async function probe(settings: HostSettings, signal?: AbortSignal): Promise<string> {
  let stage = 'contacting the host';
  try {
    return await call(settings, signal, async ({ host }) => {
      const health = await host.health({}, options(signal));
      if (!health.ok) throw new HostError('that answered, but it is not hostd');
      stage = 'host reached · checking access';
      await host.getOverview({ points: 1 }, options(signal));
      return health.name || 'host';
    }, true);
  } catch (error) {
    if (error instanceof GitHubError && error.kind === 'network') {
      throw new GitHubError('network', `${stage} · ${error.message}`);
    }
    throw error;
  }
}

/**
 * The last overview and service bodies handed to the screen, per connection.
 * `useRemote` writes every successful answer, and a poll whose numbers did
 * not move would rewrite a full snapshot. Returning the same object lets
 * that write see an identical body and skip the disk, while the screen still
 * refreshes on the samples that differ. There is no server delta: the whole
 * answer still travels, and only the persistence is coalesced. One sample
 * per resource — not a ring.
 */
const settled = new Map<string, SettledSample<object>>();
/** Samples handed back because they matched the previous one, so they are not written again. */
const reused = new WeakSet<object>();

/**
 * True when this sample is the object already returned for the connection.
 * The first sample of a connection is new and must be written; a later poll
 * with the same body is the same object and must not be.
 */
export function hostSampleUnchanged(value: object): boolean {
  return reused.has(value);
}

function settle<T extends object>(settings: HostSettings, kind: string, value: T): T {
  const key = `${connectionIdentity(settings)}|${kind}`;
  const previous = settled.get(key) as SettledSample<T> | undefined;
  const next = settleSample(previous, value, stableJson as (sample: T) => string);
  settled.set(key, next.sample);
  if (next.unchanged) reused.add(next.sample.value);
  return next.sample.value;
}

export function forgetSettled(settings: HostSettings): void {
  const prefix = `${connectionIdentity(settings)}|`;
  for (const key of settled.keys()) {
    if (key.startsWith(prefix)) settled.delete(key);
  }
}

export const fetchOverview = (settings: HostSettings, signal?: AbortSignal): Promise<Overview> =>
  call(settings, signal, async ({ host }) =>
    settle(settings, 'overview', toOverview(await host.getOverview({ points: POINTS }, options(signal)))),
  );

export const fetchService = (settings: HostSettings, id: string, signal?: AbortSignal): Promise<ServiceDetail> =>
  call(settings, signal, async ({ host }) => {
    const detail = toServiceDetail(await host.getService({ id, points: POINTS }, options(signal)));
    if (!detail) throw new HostError(`the host has no service called ${id}`, 404);
    return settle(settings, `service:${id}`, detail);
  });

export const fetchLogs = (settings: HostSettings, id: string, lines: number, signal?: AbortSignal) =>
  call(settings, signal, async ({ host }) => {
    const logs = await host.getLogs({ serviceId: id, lines }, options(signal));
    return { lines: logs.lines, at: logs.at ? Number(logs.at.seconds) : Date.now() / 1000 };
  });

/** Reads one panel again now (its `key` is `scope/source/view`). */
export const refreshPanel = (settings: HostSettings, key: string): Promise<Panel> =>
  call(settings, undefined, async ({ sources }) => {
    const [scope, source, view] = key.split('/');
    const read = await sources.readSource({ scope, id: source, fresh: true, points: POINTS }, options());
    const found = read.reading?.views.find((candidate) => candidate.id === view);
    if (!found) throw new HostError(`the host has no panel ${key}`, 404);
    return toPanel(found);
  });

export async function runAction(settings: HostSettings, service: string, action: string): Promise<string> {
  const done = await call(settings, undefined, ({ host }) =>
    host.runAction({ serviceId: service, actionId: action }, { timeoutMs: 60_000 }),
  );
  return done.detail ? done.detail.split('\n')[0].slice(0, 120) : `${action} sent`;
}
