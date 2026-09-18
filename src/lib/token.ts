import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'github_pat';

/**
 * expo-secure-store has no web implementation; the browser preview falls
 * back to an in-memory store so the demo mode still works.
 */
const memory = { token: null as string | null };

const secure = Platform.OS !== 'web';

/** On-device token storage backed by iOS Keychain / Android Keystore. */
export const tokenStore = {
  get: (): Promise<string | null> =>
    secure ? SecureStore.getItemAsync(TOKEN_KEY) : Promise.resolve(memory.token),

  set: (token: string): Promise<void> =>
    secure
      ? SecureStore.setItemAsync(TOKEN_KEY, token)
      : ((memory.token = token), Promise.resolve()),

  clear: (): Promise<void> =>
    secure
      ? SecureStore.deleteItemAsync(TOKEN_KEY)
      : ((memory.token = null), Promise.resolve()),
};

export const DEMO_TOKEN = 'demo';
