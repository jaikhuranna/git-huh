import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { accountCachePrefixes } from './cacheKey';
import { keyOf, removeSaved, removeSavedPrefixes } from './store';

/**
 * Every account this phone has been given a token for.
 *
 * One token is right for a personal app and wrong for anyone with a work
 * account and a personal one — the second most common reason people give for
 * wanting more from a GitHub app. The current token lives in `tokenStore`;
 * this is the list you can switch between, kept in the keystore beside it
 * because it is made of tokens too.
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
    const previous = index >= 0 ? list[index] : null;
    const next =
      index >= 0
        ? list.map((item, position) => (position === index ? { login, token } : item))
        : [...list, { login, token }];
    await write(next);
    // A replaced token must not keep answering under the old one. The new
    // token's model is a different key, so the old file would otherwise sit
    // until the budget noticed it.
    if (previous && previous.token !== token) {
      await removeSaved(`model-${keyOf(previous.token)}`);
    }
    return next;
  },

  /** Forget an account and everything saved on its behalf. */
  async remove(login: string): Promise<Account[]> {
    const lower = login.toLowerCase();
    const list = await read();
    const gone = list.find((item) => item.login.toLowerCase() === lower);
    const next = list.filter((item) => item.login.toLowerCase() !== lower);
    await write(next);
    await removeSavedPrefixes(accountCachePrefixes(login));
    if (gone) await removeSaved(`model-${keyOf(gone.token)}`);
    return next;
  },
};
