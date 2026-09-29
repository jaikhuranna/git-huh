import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GitHubError, verifyToken } from '../lib/github';
import {
  DeviceFlowError,
  requestDeviceCode,
  spacedCode,
  waitForToken,
  type DeviceCode,
  type DeviceFailure,
} from '../lib/oauth';
import { GITHUB_CLIENT_ID } from '../lib/oauthConfig';
import { DEMO_TOKEN } from '../lib/token';
import { colors, fonts, radii, space, themed } from '../theme';

import { DotField } from './DotField';
import { Body, Display, Label, Micro, Serif } from './Type';
import { Wordmark } from './Wordmark';

interface PatFormProps {
  /** Called with a token GitHub has already accepted. */
  onTokenVerified: (token: string) => void;
  /** Present when this is a second account being added, which can be abandoned. */
  onCancel?: () => void;
}

/**
 * The scopes the app can use, all of them: `repo` for private work and for
 * writing back, the two discussion scopes for reading and answering
 * discussions, and `security_events` for Dependabot alerts. Everything still
 * works on less — each screen says what its missing scope costs. Signing in
 * with GitHub asks for the same list (`OAUTH_SCOPES`).
 */
export const TOKEN_SETTINGS_URL =
  'https://github.com/settings/tokens/new?scopes=read:user,repo,read:discussion,write:discussion,security_events&description=git-huh';

/** Each way a sign-in can stop, in the words that say what to do next. */
const FAILURE: Record<DeviceFailure, string> = {
  expired: 'the code ran out before it was entered · ask for a new one',
  denied: 'github was told no · nothing was stored',
  disabled: 'this build cannot sign in by code · paste a token instead',
  misconfigured: 'github does not recognise this build · paste a token instead',
  network: 'could not reach github · try again',
};

type SignIn =
  | { step: 'idle' }
  | { step: 'asking' }
  | { step: 'code'; code: DeviceCode }
  | { step: 'checking' };

/**
 * Sign-in: `hey,`, the widget's card, and two ways in.
 *
 * **Sign in with github** is the device flow (`lib/oauth.ts`): the card
 * turns into a code, `copy and open github` puts it on the clipboard and
 * opens github.com/login/device, and the page waits for GitHub to say yes.
 * No secret, no server, no redirect back into the app — which is why it can
 * be the default in a public app. **A token** is still under it, for
 * fine-grained tokens, organisations that do not allow the OAuth app, and
 * builds without one.
 */
export function PatForm({ onTokenVerified, onCancel }: PatFormProps) {
  const { width } = useWindowDimensions();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [signIn, setSignIn] = useState<SignIn>({ step: 'idle' });
  const flow = useRef<AbortController | null>(null);

  // Leaving the page abandons a sign-in in progress.
  useEffect(() => () => flow.current?.abort(), []);

  const busy = checking || signIn.step !== 'idle';
  const canSubmit = token.trim().length > 0 && !busy;

  const submit = async () => {
    const candidate = token.trim();
    if (!candidate || busy) return;

    setChecking(true);
    setError(null);
    try {
      if (candidate === DEMO_TOKEN) {
        onTokenVerified(candidate);
        return;
      }
      await verifyToken(candidate);
      onTokenVerified(candidate);
    } catch (cause) {
      setError(
        cause instanceof GitHubError && cause.kind === 'invalid-token'
          ? 'github rejected this token'
          : 'could not reach github · try again',
      );
    } finally {
      setChecking(false);
    }
  };

  const startSignIn = async () => {
    if (!GITHUB_CLIENT_ID || busy) return;
    const controller = new AbortController();
    flow.current = controller;
    setError(null);
    setSignIn({ step: 'asking' });
    try {
      const code = await requestDeviceCode(GITHUB_CLIENT_ID, controller.signal);
      setSignIn({ step: 'code', code });
      const granted = await waitForToken(GITHUB_CLIENT_ID, code, controller.signal);
      setSignIn({ step: 'checking' });
      await verifyToken(granted);
      onTokenVerified(granted);
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setError(
        cause instanceof DeviceFlowError
          ? FAILURE[cause.reason]
          : cause instanceof GitHubError && cause.kind === 'invalid-token'
            ? 'github gave a token and then refused it · try again'
            : FAILURE.network,
      );
      setSignIn({ step: 'idle' });
    }
  };

  const stopSignIn = () => {
    flow.current?.abort();
    flow.current = null;
    setSignIn({ step: 'idle' });
  };

  const fieldWidth = width - space.gutter * 2 - space.card * 2;

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <View style={styles.header}>
          <Wordmark size={20} />
          {onCancel ? (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={onCancel}>
              <Label style={{ color: colors.ink }}>cancel</Label>
            </Pressable>
          ) : (
            <Label>{Constants.expoConfig?.version ?? ''}</Label>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.center}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.stack}>
            <Display>hey,</Display>
            <Serif style={styles.sub}>
              {GITHUB_CLIENT_ID
                ? 'sign in and i’ll read the year.'
                : 'paste a token and i’ll read the year.'}
            </Serif>

            {signIn.step === 'code' || signIn.step === 'checking' ? (
              <CodeCard
                checking={signIn.step === 'checking'}
                code={signIn.step === 'code' ? signIn.code : null}
              />
            ) : (
              <View style={styles.field}>
                <DotField height={7 * 21} maxPitch={21} width={fieldWidth} />
              </View>
            )}

            {error ? <Body style={styles.error}>{error}</Body> : null}

            <View style={styles.actions}>
              {GITHUB_CLIENT_ID &&
                (signIn.step === 'idle' || signIn.step === 'asking' ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={startSignIn}
                    style={[styles.pill, styles.solid, checking && styles.muted]}
                  >
                    {signIn.step === 'asking' ? (
                      <ActivityIndicator color={colors.onBlack} size="small" />
                    ) : (
                      <Label style={styles.solidLabel}>sign in with github</Label>
                    )}
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" onPress={stopSignIn} style={styles.pill}>
                    <Label style={styles.pillLabel}>stop</Label>
                  </Pressable>
                ))}

              {signIn.step === 'idle' && !onCancel && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onTokenVerified(DEMO_TOKEN)}
                  style={styles.pill}
                >
                  <Label style={styles.pillLabel}>try the demo</Label>
                </Pressable>
              )}
            </View>

            {signIn.step === 'idle' && (
              <>
                {GITHUB_CLIENT_ID && <Label style={styles.or}>or paste a token</Label>}
                <View style={styles.tokenRow}>
                  <TextInput
                    accessibilityLabel="GitHub personal access token"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    onChangeText={(next) => {
                      setToken(next);
                      if (error) setError(null);
                    }}
                    onSubmitEditing={submit}
                    placeholder="ghp_…"
                    placeholderTextColor={colors.ink40}
                    returnKeyType="go"
                    secureTextEntry
                    style={styles.input}
                    value={token}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSubmit}
                    onPress={submit}
                    style={[
                      styles.pill,
                      GITHUB_CLIENT_ID ? null : styles.solid,
                      !canSubmit && styles.muted,
                    ]}
                  >
                    {checking ? (
                      <ActivityIndicator
                        color={GITHUB_CLIENT_ID ? colors.ink : colors.onBlack}
                        size="small"
                      />
                    ) : (
                      <Label style={GITHUB_CLIENT_ID ? styles.pillLabel : styles.solidLabel}>
                        connect
                      </Label>
                    )}
                  </Pressable>
                </View>

                <Label style={styles.hint}>
                  needs read:user and repo · stored in the keystore, never sent anywhere but
                  github
                </Label>

                <Pressable
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(TOKEN_SETTINGS_URL).catch(() => {})}
                >
                  <Label style={styles.link}>make a token on github →</Label>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The widget's card with a code on it instead of dots: the eight letters to
 * type on github.com, how long they are good for, and the one button that
 * copies them and opens the page they go on.
 */
function CodeCard({ code, checking }: { code: DeviceCode | null; checking: boolean }) {
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Minutes, not seconds: this is text changing, not a countdown to watch.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const minutes = code ? Math.max(0, Math.ceil((code.expiresAt - now) / 60_000)) : 0;
  const where = code?.verificationUri.replace(/^https?:\/\//, '') ?? '';

  const copyAndOpen = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code.userCode).catch(() => {});
    setCopied(true);
    Linking.openURL(code.verificationUri).catch(() => {});
  };

  return (
    <View style={styles.codeCard}>
      <Label style={styles.codeHead}>{checking ? 'github said yes' : 'type this on github'}</Label>
      <Display
        accessibilityLabel={code ? `code ${code.userCode.split('').join(' ')}` : undefined}
        selectable
        style={styles.code}
      >
        {code ? spacedCode(code.userCode) : '····-····'}
      </Display>
      <Micro style={styles.codeMeta}>
        {checking
          ? 'reading the account…'
          : `${where} · good for ${minutes} min${copied ? ' · copied' : ''}`}
      </Micro>
      {!checking && (
        <Pressable
          accessibilityRole="button"
          onPress={copyAndOpen}
          style={[styles.pill, styles.solid, styles.codeButton]}
        >
          <Label style={styles.solidLabel}>
            {copied ? 'open github again →' : 'copy and open github →'}
          </Label>
        </Pressable>
      )}
      <Label style={styles.waiting}>
        {checking ? '' : 'waiting for github · come back here once it is entered'}
      </Label>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
      flex: 1,
    },
    fill: {
      flex: 1,
    },
    center: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingBottom: 24,
      paddingTop: 48,
    },
    header: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
      left: 0,
      paddingHorizontal: space.gutter,
      position: 'absolute',
      right: 0,
      top: 14,
      zIndex: 1,
    },
    stack: {
      gap: 14,
      paddingHorizontal: space.gutter,
    },
    sub: {
      color: colors.ink70,
      fontSize: 16,
      lineHeight: 22,
    },
    field: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radii.card,
      marginBottom: 4,
      marginTop: 8,
      padding: space.card,
    },
    codeCard: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radii.card,
      gap: 8,
      marginBottom: 4,
      marginTop: 8,
      minHeight: 7 * 21 + space.card * 2,
      padding: space.card,
    },
    codeHead: {
      color: colors.ink70,
    },
    code: {
      fontSize: 38,
      letterSpacing: 3,
      lineHeight: 46,
    },
    codeMeta: {
      color: colors.ink40,
      textAlign: 'center',
    },
    codeButton: {
      marginTop: 6,
    },
    waiting: {
      color: colors.ink40,
      marginTop: 2,
      textAlign: 'center',
    },
    tokenRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: 10,
    },
    input: {
      borderBottomColor: colors.hairStrong,
      borderBottomWidth: 1,
      color: colors.ink,
      flex: 1,
      fontFamily: fonts.mono,
      fontSize: 15,
      paddingBottom: 10,
      paddingTop: 6,
    },
    or: {
      color: colors.ink40,
      marginTop: 10,
    },
    hint: {
      lineHeight: 16,
    },
    error: {
      color: colors.no,
      fontSize: 12,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 4,
    },
    pill: {
      alignItems: 'center',
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 11,
    },
    pillLabel: {
      color: colors.ink,
    },
    solid: {
      backgroundColor: colors.black,
      borderColor: colors.black,
      minWidth: 108,
    },
    solidLabel: {
      color: colors.onBlack,
    },
    muted: {
      opacity: 0.4,
    },
    link: {
      color: colors.ink70,
      marginTop: 2,
    },
  }),
);
