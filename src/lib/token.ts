import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'github_pat';

/** On-device token storage backed by iOS Keychain / Android Keystore. */
export const tokenStore = {
  get: (): Promise<string | null> => SecureStore.getItemAsync(TOKEN_KEY),

  set: (token: string): Promise<void> =>
    SecureStore.setItemAsync(TOKEN_KEY, token),

  clear: (): Promise<void> => SecureStore.deleteItemAsync(TOKEN_KEY),
};
