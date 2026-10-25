/**
 * Keeps a half-finished file proposal across a restart, so a commit that
 * landed can still open its pull request later.
 *
 * This is the only module that ties `proposals` to the disk box, and only the
 * app imports it (`index.js`), because importing it pulls in
 * `expo-file-system`, which the unit tests cannot load.
 */

import { installProposalStore, type ProposalProgress } from './proposals';
import { readSaved, removeSaved, writeSaved } from './store';

installProposalStore({
  async read(key): Promise<ProposalProgress | null> {
    const saved = await readSaved<ProposalProgress>(key);
    return saved ? saved.value : null;
  },
  write(key, value): Promise<void> {
    return writeSaved(key, value);
  },
  remove(key): Promise<void> {
    return removeSaved(key);
  },
});
