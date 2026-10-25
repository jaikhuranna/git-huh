/**
 * The file the editor started from, kept together so a later refresh cannot
 * split it.
 *
 * The screen reads a file and then lets the person change it. A background
 * refresh can deliver a newer copy while they are still typing. Saving that
 * newer blob sha with the older draft would pass GitHub's stale check and
 * overwrite a revision the draft was never based on. The snapshot is the
 * text, sha, ref, repository and path captured together; the save uses only
 * those, and a newer file is offered as an explicit reload rather than
 * applied underneath the draft.
 */

export interface FileSnapshot {
  text: string;
  sha: string;
  ref: string;
  repo: string;
  path: string;
}

export function captureFileSnapshot(
  file: { text: string | null; sha: string; ref: string; path: string },
  repo: string,
): FileSnapshot | null {
  if (file.text == null) return null;
  return { text: file.text, sha: file.sha, ref: file.ref, repo, path: file.path };
}

/** A delivered file is newer than the snapshot when its blob sha differs. */
export function fileMovedOn(snapshot: FileSnapshot, file: { sha: string } | null): boolean {
  return file != null && file.sha !== snapshot.sha;
}
