import { escapeName, KEY_SEPARATOR } from './cacheKey';

export interface Saved<T> {
  value: T;
  at: number;
}

/** Raw IDs are physical file names without the .json suffix. */
export interface SavedBackend {
  read(id: string): Promise<string | null>;
  write(id: string, raw: string): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<readonly { id: string; bytes: number; at: number }[]>;
}

interface IndexEntry {
  bytes: number;
  at: number;
  pinned: boolean;
}

interface Options {
  indexId?: string;
  legacyId?: (key: string) => string;
  durable?: (id: string) => boolean;
  now?: () => number;
  budgetBytes?: number;
  debounceMs?: number;
  rememberedBytes?: number;
  onIndexError?: (error: unknown) => void;
}

interface PendingWrite {
  body: string;
  raw: string;
  revision: number;
  resolve(): void;
  reject(error: unknown): void;
}

interface Queue {
  tail: Promise<void>;
  revision: number;
  pending: PendingWrite | null;
}

function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const point = char.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function envelope<T>(raw: string | null): Saved<T> | null {
  if (raw == null) return null;
  try {
    const value = JSON.parse(raw) as Partial<Saved<T>> | null;
    return value && typeof value.at === 'number' && Number.isFinite(value.at) && 'value' in value
      ? (value as Saved<T>)
      : null;
  } catch {
    return null;
  }
}

function authored(id: string): boolean {
  const separator = escapeName(KEY_SEPARATOR);
  return (
    id.includes(`${separator}draft${separator}`) ||
    id.includes(`${separator}proposal${separator}`) ||
    id.includes('home-settings') ||
    id.includes('accounts-together') ||
    id === 'notify-settings' ||
    id.endsWith('-triage') ||
    id.endsWith('-notified') ||
    id.includes('-draft-') ||
    id.includes('-proposal-')
  );
}

/** Owns ordering, cache accounting, and migration independently of the device filesystem. */
export function createSavedStore(backend: SavedBackend, options: Options = {}) {
  const indexId = options.indexId ?? '~index';
  const legacyId = options.legacyId ?? ((key: string) => key);
  const durable = options.durable ?? authored;
  const now = options.now ?? Date.now;
  const report = options.onIndexError ?? (() => {});
  const index = new Map<string, IndexEntry>();
  const pins = new Map<string, boolean>();
  const queues = new Map<string, Queue>();
  const remembered = new Map<string, { body: string; bytes: number; rawBytes: number }>();
  const rememberLimit = options.rememberedBytes ?? 256 * 1024;
  let rememberedBytes = 0;
  let indexReady = false;
  let indexLoading: Promise<void> | null = null;
  let indexTimer: ReturnType<typeof setTimeout> | null = null;
  let indexTail = Promise.resolve();
  let pruning: Promise<void> | null = null;
  let revision = 0;

  function forgetBody(id: string) {
    const previous = remembered.get(id);
    if (previous) rememberedBytes -= previous.bytes;
    remembered.delete(id);
  }

  function rememberBody(id: string, body: string, rawBytes: number) {
    forgetBody(id);
    const bytes = utf8Bytes(body);
    if (bytes > rememberLimit) return;
    remembered.set(id, { body, bytes, rawBytes });
    rememberedBytes += bytes;
    while (rememberedBytes > rememberLimit || remembered.size > 64) {
      forgetBody(remembered.keys().next().value!);
    }
  }

  function persistIndex(): Promise<void> {
    const writing = indexTail.then(async () => {
      const entries = Object.fromEntries(index);
      await backend.write(indexId, JSON.stringify({ value: { version: 2, entries }, at: now() }));
    });
    indexTail = writing.catch(() => {});
    return writing;
  }

  async function ensureIndex(): Promise<void> {
    if (indexReady) return;
    if (indexLoading) return indexLoading;
    const loading = (async () => {
      const saved = envelope<unknown>(await backend.read(indexId));
      const value = saved?.value;
      const versioned = value != null && typeof value === 'object' && 'version' in value;
      const source = versioned && (value as { version: unknown }).version === 2
        ? (value as { entries?: unknown }).entries
        : value;
      const previous = new Map<string, IndexEntry>();
      if (source != null && typeof source === 'object' && !Array.isArray(source)) {
        for (const [key, candidate] of Object.entries(source)) {
          const entry = candidate as Partial<IndexEntry> | null;
          if (entry && typeof entry.bytes === 'number' && Number.isFinite(entry.bytes) && entry.bytes >= 0 &&
              typeof entry.at === 'number' && Number.isFinite(entry.at)) {
            previous.set(versioned ? key : legacyId(key), {
              bytes: entry.bytes, at: entry.at, pinned: entry.pinned === true,
            });
          }
        }
      }
      const files = await backend.list();
      index.clear();
      for (const file of files) {
        if (file.id === indexId) continue;
        const old = previous.get(file.id);
        index.set(file.id, {
          bytes: Math.max(0, file.bytes),
          at: old?.at ?? file.at,
          pinned: pins.get(file.id) ?? old?.pinned ?? false,
        });
      }
      for (const [id, pinned] of pins) {
        if (!index.has(id)) index.set(id, { bytes: 0, at: now(), pinned });
      }
      // Scanning only metadata includes unindexed legacy/corrupt cache files. The
      // replacement must be durable before prune is allowed to remove anything.
      await persistIndex();
      pins.clear();
      indexReady = true;
    })();
    indexLoading = loading;
    try {
      await loading;
    } finally {
      if (indexLoading === loading) indexLoading = null;
    }
  }

  function scheduleIndex() {
    if (!indexReady) return;
    if (indexTimer) clearTimeout(indexTimer);
    indexTimer = setTimeout(() => {
      indexTimer = null;
      void persistIndex().catch(report);
    }, options.debounceMs ?? 1_500);
  }

  function note(id: string, bytes: number | null) {
    const previous = index.get(id);
    index.set(id, { bytes: bytes ?? previous?.bytes ?? 0, at: now(), pinned: previous?.pinned ?? false });
    scheduleIndex();
  }

  function queueFor(id: string): Queue {
    let queue = queues.get(id);
    if (!queue) {
      queue = { tail: Promise.resolve(), revision: 0, pending: null };
      queues.set(id, queue);
    }
    return queue;
  }

  function enqueue<T>(id: string, queue: Queue, run: () => Promise<T>): Promise<T> {
    const result = queue.tail.then(run, run);
    const tail = result.then(() => {}, () => {});
    queue.tail = tail;
    void tail.then(() => {
      if (queues.get(id) === queue && queue.tail === tail && !queue.pending) queues.delete(id);
    });
    return result;
  }

  async function read<T>(id: string, validate?: (value: unknown) => T | null): Promise<Saved<T> | null> {
    let saved: Saved<T> | null;
    try {
      saved = envelope<T>(await backend.read(id));
    } catch {
      return null;
    }
    if (!saved) return null;
    if (validate) {
      const value = validate(saved.value);
      if (value == null) {
        await remove(id);
        return null;
      }
      saved.value = value;
    }
    try {
      await ensureIndex();
      note(id, null);
    } catch (error) {
      report(error);
    }
    return saved;
  }

  async function write<T>(id: string, value: T): Promise<void> {
    const body = JSON.stringify(value);
    if (body === undefined) throw new TypeError('Saved values must be JSON serializable.');
    const raw = JSON.stringify({ value, at: now() });
    const queue = queueFor(id);
    const currentRevision = ++revision;
    queue.revision = currentRevision;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    queue.pending?.resolve();
    queue.pending = { body, raw, revision: currentRevision, resolve, reject };
    void enqueue(id, queue, async () => {
      const next = queue.pending;
      if (!next) return;
      queue.pending = null;
      try {
        const held = remembered.get(id);
        if (held?.body === next.body) {
          remembered.delete(id);
          remembered.set(id, held);
          note(id, held.rawBytes);
        } else {
          await backend.write(id, next.raw);
          await ensureIndex();
          if (queue.revision === next.revision) {
            const bytes = utf8Bytes(next.raw);
            rememberBody(id, next.body, bytes);
            note(id, bytes);
          }
        }
        next.resolve();
      } catch (error) {
        next.reject(error);
      }
    });
    const tail = queue.tail;
    void tail.then(() => { if (!durable(id)) void prune().catch(report); });
    return promise;
  }

  async function remove(id: string): Promise<void> {
    const queue = queueFor(id);
    queue.revision = ++revision;
    queue.pending?.resolve();
    queue.pending = null;
    await enqueue(id, queue, async () => {
      try { await ensureIndex(); } catch (error) { report(error); }
      await backend.remove(id);
      forgetBody(id);
      index.delete(id);
      pins.delete(id);
      scheduleIndex();
    });
  }

  async function removePrefixes(prefixes: readonly string[]): Promise<void> {
    if (prefixes.length === 0) return;
    try { await ensureIndex(); } catch (error) { report(error); }
    const ids = new Set([...index.keys(), ...queues.keys(), ...(await backend.list()).map((file) => file.id)]);
    await Promise.all([...ids].filter((id) => id !== indexId && prefixes.some((prefix) => id.startsWith(prefix))).map(remove));
  }

  function pin(id: string, pinned: boolean) {
    if (!indexReady) pins.set(id, pinned);
    const previous = index.get(id);
    if (indexReady || previous) {
      index.set(id, { bytes: previous?.bytes ?? 0, at: previous?.at ?? now(), pinned });
    }
    scheduleIndex();
  }

  async function prune(budgetBytes = options.budgetBytes ?? 32 * 1024 * 1024): Promise<void> {
    if (pruning) return pruning;
    const running = (async () => {
      await ensureIndex();
      let total = [...index].reduce((bytes, [id, entry]) => bytes + (durable(id) ? 0 : entry.bytes), 0);
      const order = [...index].filter(([id, entry]) => !durable(id) && !entry.pinned)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, entry] of order) {
        if (total <= Math.max(0, budgetBytes)) break;
        if (queues.has(id) || index.get(id) !== entry) continue;
        await remove(id);
        total -= entry.bytes;
      }
    })();
    pruning = running;
    try { await running; } finally { if (pruning === running) pruning = null; }
  }

  async function flush(): Promise<void> {
    while (queues.size > 0) await Promise.all([...queues.values()].map((queue) => queue.tail));
    await ensureIndex();
    if (indexTimer) clearTimeout(indexTimer);
    indexTimer = null;
    await persistIndex();
    if (pruning) await pruning;
  }

  return { read, write, remove, removePrefixes, pin, prune, flush };
}
