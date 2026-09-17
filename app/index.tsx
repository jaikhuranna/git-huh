import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContributionWidget } from '../src/components/ContributionWidget';
import { DotText } from '../src/components/DotText';
import { PatForm } from '../src/components/PatForm';
import { useContributions } from '../src/hooks/useContributions';
import { tokenStore } from '../src/lib/token';
import { clearWidget, syncWidget } from '../src/lib/widgetBridge';
import { colors } from '../src/theme';

/** undefined = restoring from Keychain, null = signed out. */
type TokenState = string | null | undefined;

export default function Home() {
  const [token, setToken] = useState<TokenState>(undefined);
  const contributions = useContributions(token ?? null);

  useEffect(() => {
    tokenStore.get().then(setToken);
  }, []);

  useEffect(() => {
    if (contributions.status === 'ready') {
      syncWidget(contributions.model).catch(() => {});
    }
  }, [contributions]);

  const connect = async (verifiedToken: string) => {
    await tokenStore.set(verifiedToken);
    setToken(verifiedToken);
  };

  const disconnect = async () => {
    await clearWidget().catch(() => {});
    await tokenStore.clear();
    setToken(null);
  };

  if (token === undefined) {
    return <View style={styles.screen} />;
  }

  if (token === null) {
    return <PatForm onTokenVerified={connect} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        {contributions.status === 'ready' && (
          <ContributionWidget model={contributions.model} />
        )}

        {(contributions.status === 'loading' ||
          contributions.status === 'idle') && (
          <ActivityIndicator color={colors.text.primary} />
        )}

        {contributions.status === 'error' && (
          <View style={styles.errorStack}>
            <DotText style={styles.errorText}>
              {contributions.error.kind === 'invalid-token'
                ? 'token expired or revoked'
                : 'could not reach github'}
            </DotText>
            <Pressable accessibilityRole="button" onPress={disconnect}>
              <DotText style={styles.resetText}>reset token</DotText>
            </Pressable>
          </View>
        )}
      </View>

      {contributions.status === 'ready' && (
        <Pressable
          accessibilityRole="button"
          onPress={disconnect}
          style={styles.disconnect}
        >
          <DotText style={styles.disconnectText}>disconnect</DotText>
        </Pressable>
      )}
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
  },
  errorStack: {
    alignItems: 'center',
    gap: 16,
  },
  errorText: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1,
  },
  resetText: {
    color: colors.text.secondary,
    fontSize: 12,
    letterSpacing: 1,
    textDecorationLine: 'underline',
  },
  disconnect: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  disconnectText: {
    color: colors.text.faint,
    fontSize: 10,
    letterSpacing: 2,
  },
});
