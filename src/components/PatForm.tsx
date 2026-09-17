import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GitHubError, verifyToken } from '../lib/github';
import { colors, fonts } from '../theme';

import { DotText } from './DotText';
import { Wordmark } from './Wordmark';

interface PatFormProps {
  /** Called with a token that GitHub has already accepted. */
  onTokenVerified: (token: string) => void;
}

/**
 * The entire app interface: one empty box for a personal access token.
 * Nothing chrome, nothing decoration — the dot font does the talking.
 */
export function PatForm({ onTokenVerified }: PatFormProps) {
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
        <View style={styles.stack}>
          <Wordmark size={28} />

          <TextInput
            accessibilityLabel="GitHub personal access token"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            onChangeText={setToken}
            onSubmitEditing={submit}
            placeholder="personal access token"
            placeholderTextColor={colors.text.faint}
            returnKeyType="go"
            secureTextEntry
            spellCheck={false}
            style={styles.input}
            value={token}
          />

          {error ? (
            <DotText style={styles.error}>{error}</DotText>
          ) : (
            <DotText style={styles.hint}>
              no scopes needed · stored on-device only
            </DotText>
          )}

          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              styles.button,
              !canSubmit && styles.buttonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            {checking ? (
              <ActivityIndicator color={colors.text.primary} size="small" />
            ) : (
              <DotText style={styles.buttonLabel}>connect →</DotText>
            )}
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
    paddingHorizontal: 32,
  },
  stack: {
    gap: 20,
  },
  input: {
    borderColor: colors.outline,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text.primary,
    fontFamily: fonts.dot,
    fontSize: 15,
    letterSpacing: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  hint: {
    color: colors.text.faint,
    fontSize: 11,
    letterSpacing: 1,
  },
  error: {
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 1,
  },
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.text.primary,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 132,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonDisabled: {
    borderColor: colors.outline,
    opacity: 0.5,
  },
  buttonPressed: {
    backgroundColor: colors.outline,
  },
  buttonLabel: {
    fontSize: 14,
    letterSpacing: 2,
  },
});
