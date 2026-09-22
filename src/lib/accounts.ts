import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { keyOf, removeSaved, removeSavedPrefix } from './store';

/**
 * Every account this phone has been given a token for.
 *
 * The app used to hold exactly one token, which is right for a personal app
 * and wrong for anyone with a work account and a personal one — the second
 * most common reason people give for wanting more from a GitHub app. The
 * current token still lives where it always has (`tokenStore`); this is the
 * list you can switch between, kept in the keystore beside it because it is
 * made of tokens too.
 *
 * Two accounts are the same account when their logins match; adding a login
 * that is already here replaces its token rather than listing it twice.
 */

export interface Account {
  login: string;
  token: string;
}

const KEY = 'github_accounts';
const secure = Platform.OS !== 'web';
const memory = { value: null as string | null };

async function read(): Promise<Account[]> {
  try {
    const raw = secure ? await SecureStore.getItemAsync(KEY) : memory.value;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Account =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as Account).login === 'string' &&
        typeof (item as Account).token === 'string',
    );
  } catch {
    return [];
  }
}

async function write(list: Account[]): Promise<void> {
  const raw = JSON.stringify(list);
  if (secure) await SecureStore.setItemAsync(KEY, raw);
  else memory.value = raw;
}

export const accountStore = {
  list: read,

  /** Add or refresh an account, keeping the list in the order accounts arrived. */
  async upsert(login: string, token: string): Promise<Account[]> {
    const list = await read();
    const lower = login.toLowerCase();
    const index = list.findIndex((item) => item.login.toLowerCase() === lower);
    const next =
      index >= 0
        ? list.map((item, position) => (position === index ? { login, token } : item))
        : [...list, { login, token }];
    await write(next);
    return next;
  },

  /** Forget an account and everything saved on its behalf. */
  async remove(login: string): Promise<Account[]> {
    const lower = login.toLowerCase();
    const list = await read();
    const gone = list.find((item) => item.login.toLowerCase() === lower);
    const next = list.filter((item) => item.login.toLowerCase() !== lower);
    await write(next);
    await removeSavedPrefix(`${lower}-`);
    if (gone) await removeSaved(`model-${keyOf(gone.token)}`);
    return next;
  },
};
