import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { createIdeasStore } from './ideas';

/** Outside the account cache, so switching or removing accounts keeps ideas. */
export function ideasStore(demo: boolean) {
  const key = demo ? 'githuh-project-ideas-demo' : 'githuh-project-ideas';
  return createIdeasStore({
    async read() {
      if (Platform.OS === 'web') return localStorage.getItem(key);
      const file = new File(Paths.document, `${key}.json`);
      return file.exists ? file.text() : null;
    },
    async write(raw) {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, raw);
        return;
      }
      const file = new File(Paths.document, `${key}.json`);
      const pending = new File(Paths.document, `${key}.pending.json`);
      pending.write(raw);
      await pending.move(file, { overwrite: true });
    },
  });
}
