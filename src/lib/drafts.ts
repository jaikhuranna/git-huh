/**
 * Unsent words, kept while their screen is not.
 *
 * A comment half typed, a file half edited: the text is worth more than the
 * screen it was typed on. The screen can be unmounted — a push, a notch
 * change, the system switching between light and dark — and the draft must
 * still be there when it comes back, in the same place. It is keyed by the
 * account and the resource it belongs to, held in memory for the moment and on
 * disk for the process.
 *
 * Kept apart from the read cache: a draft is authored, not reconstructible,
 * so it is never evicted with an answer.
 */

import { composeKey } from './cacheKey';
import { readSaved, removeSaved, writeSaved } from './store';

export interface Draft {
  text: string;
  /** Epoch ms the draft was last written. */
  at: number;
}

const memory = new Map<string, Draft>();

function keyOf(account: string | null, kind: string, id: string): string {
  return composeKey(account, 'draft', kind, id);
}

/** The draft in memory, if the screen has been open this session. */
export function readDraft(
  account: string | null,
  kind: string,
  id: string,
): Draft | null {
  return memory.get(keyOf(account, kind, id)) ?? null;
}

/**
 * Remember a draft. An empty one clears it; an unchanged one writes nothing,
 * so typing back and forth does not keep hitting the disk.
 */
export function saveDraft(
  account: string | null,
  kind: string,
  id: string,
  text: string,
): void {
  const key = keyOf(account, kind, id);
  if (text.length === 0) {
    clearDraft(account, kind, id);
    return;
  }
  const previous = memory.get(key);
  if (previous?.text === text) return;
  const draft: Draft = { text, at: Date.now() };
  memory.set(key, draft);
  // Sending the text is a convenience; the screen already has it.
  writeSaved(key, draft).catch(() => {});
}

export function clearDraft(account: string | null, kind: string, id: string): void {
  const key = keyOf(account, kind, id);
  memory.delete(key);
  removeSaved(key).catch(() => {});
}

/** The draft from memory, or from the disk after a cold start. */
export async function loadDraft(
  account: string | null,
  kind: string,
  id: string,
): Promise<Draft | null> {
  const key = keyOf(account, kind, id);
  const held = memory.get(key);
  if (held) return held;
  const saved = await readSaved<Draft>(key);
  if (!saved) return null;
  memory.set(key, saved.value);
  return saved.value;
}
