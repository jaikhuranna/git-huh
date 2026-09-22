import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GitHubError, verifyToken } from '../lib/github';
import { DEMO_TOKEN } from '../lib/token';
import { colors, fallbacks, fonts, radii, space } from '../theme';

import { CrossField } from './CrossField';
import { Body, Display, Label, Serif } from './Type';
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
 * works on less — each screen says what its missing scope costs.
 */
export const TOKEN_SETTINGS_URL =
  'https://github.com/settings/tokens/new?scopes=read:user,repo,read:discussion,write:discussion,security_events&description=git-huh';

/**
 * Sign-in, given the pin04 treatment: serif greeting, the cross field as
 * texture, and a hairline-underlined mono input. One box, one button.
 */
export function PatForm({ onTokenVerified, onCancel }: PatFormProps) {
  const { width } = useWindowDimensions();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const canSubmit = token.trim().length > 0 && !checking;

  const submit = async () => {
    const candidate = token.trim();
    if (!candidate || checking) return;

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

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        <View style={styles.header}>
          <Wordmark size={20} />
          {onCancel ? (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={onCancel}>
              <Label style={{ color: colors.ink }}>cancel</Label>
            </Pressable>
          ) : (
            <Label>3.1</Label>
          )}
        </View>

        <View style={styles.stack}>
          <Display>Hey,</Display>
          <Serif style={styles.sub}>paste a token and I&apos;ll read the year.</Serif>

          <CrossField height={130} style={styles.field} width={width - 40} />

          <TextInput
            accessibilityLabel="GitHub personal access token"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!checking}
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

          {error ? (
            <Body style={styles.error}>{error}</Body>
          ) : (
            <Label style={styles.hint}>
              needs read:user and repo · stored in the keystore, never sent
              anywhere but github
            </Label>
          )}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={submit}
              style={[styles.pill, styles.solid, !canSubmit && styles.muted]}
            >
              {checking ? (
                <ActivityIndicator color={colors.onBlack} size="small" />
              ) : (
                <Label style={styles.solidLabel}>connect</Label>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => onTokenVerified(DEMO_TOKEN)}
              style={styles.pill}
            >
              <Label style={styles.pillLabel}>try the demo</Label>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(TOKEN_SETTINGS_URL).catch(() => {})}
          >
            <Label style={styles.link}>make a token on github →</Label>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
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
    marginBottom: 4,
  },
  input: {
    borderBottomColor: colors.hairStrong,
    borderBottomWidth: 1,
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: 15,
    paddingBottom: 10,
    paddingTop: 6,
  },
  hint: {
    lineHeight: 16,
  },
  error: {
    color: colors.red,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
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
});

/** Kept next to the input so the fallback family is discoverable here. */
PatForm.monoFallback = fallbacks.mono;
