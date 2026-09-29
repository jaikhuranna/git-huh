import Constants from 'expo-constants';

/**
 * The OAuth app's client id, from `app.json` → `expo.extra.githubClientId`.
 *
 * A client id is public by design (it is in every sign-in URL), so it is
 * committed; the secret is never needed, because the device flow does not use
 * one. An empty id means this build has no OAuth app behind it, and the
 * sign-in page offers the token field alone rather than a button that fails.
 */
const configured = (Constants.expoConfig?.extra as { githubClientId?: unknown } | undefined)
  ?.githubClientId;

export const GITHUB_CLIENT_ID: string | null =
  typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : null;
