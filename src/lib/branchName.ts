/**
 * Picking a free `login-patch-N` without asking GitHub once per number.
 *
 * The website names a proposed change `login-patch-1`, then 2, and so on.
 * Probing each name with its own GET costs one request per existing patch
 * branch, and a repository that already has thirty of them pays all of them
 * before the new one is created. The matching-refs endpoint returns the
 * names that already exist in one answer; the first free suffix is then a
 * local decision. Creating the branch can still lose a race, so the caller
 * tries the next name a few times and falls back to a timestamp.
 */

/** `login-patch-N`, the website's own naming. */
export function patchStem(login: string): string {
  return `${login.toLowerCase()}-patch`;
}

/**
 * The first `stem-N` whose full ref is not already in `existing`.
 *
 * `existing` is whatever matching-refs returned: full refs
 * (`refs/heads/login-patch-1`) or bare names. A number past `limit` is left
 * alone so a crowded stem does not walk forever; the caller then uses a
 * timestamp instead. `limit` is also the ceiling on collision retries: a
 * caller must not ask for a name further out than this.
 */
export const PATCH_NAME_LIMIT = 30;

export function firstFreePatchName(stem: string, existing: readonly string[], limit = PATCH_NAME_LIMIT): string | null {
  const taken = new Set<number>();
  const prefix = `${stem}-`;
  for (const ref of existing) {
    const name = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
    if (!name.startsWith(prefix)) continue;
    const suffix = name.slice(prefix.length);
    if (/^[1-9]\d*$/.test(suffix)) taken.add(Number(suffix));
  }
  for (let n = 1; n <= limit; n++) {
    if (!taken.has(n)) return `${prefix}${n}`;
  }
  return null;
}

/** A name no sequential probe would have chosen, for when every `-N` is taken. */
export function timestampPatchName(stem: string, now = Date.now()): string {
  return `${stem}-${now.toString(36)}`;
}
