/**
 * Keeps REST validators on the device, so the last ETag survives a restart
 * and the first read of a resource it already holds is answered 304.
 *
 * This is the only module that ties `httpCache` to the disk box, and only the
 * app imports it (`index.js`), because importing it pulls in
 * `expo-file-system`, which the unit tests cannot load.
 */

import { installValidatorStore, type StoredValidator } from './httpCache';
import { readSaved, writeSaved } from './store';

installValidatorStore({
  async read(key): Promise<StoredValidator | null> {
    const saved = await readSaved<StoredValidator>(key);
    return saved ? saved.value : null;
  },
  write(key, value): void {
    writeSaved(key, value).catch(() => {});
  },
});
