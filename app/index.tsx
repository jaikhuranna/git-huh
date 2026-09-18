import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DotText } from '../src/components/DotText';
import { FadeIn } from '../src/components/FadeIn';
import { PatForm } from '../src/components/PatForm';
import { TabBar, type Tab } from '../src/components/TabBar';
import { useContributions } from '../src/hooks/useContributions';
import { useOpenPrs } from '../src/hooks/useOpenPrs';
import { DEMO_TOKEN, tokenStore } from '../src/lib/token';
import { clearWidget, syncWidget } from '../src/lib/widgetBridge';
import { DotsView } from '../src/screens/DotsView';
import { HomeView } from '../src/screens/HomeView';
import { PrsView } from '../src/screens/PrsView';
import { colors } from '../src/theme';

/** undefined = restoring from Keychain, null = signed out. */
type TokenState = string | null | undefined;

export default function Home() {
  const [token, setToken] = useState<TokenState>(undefined);
  const [tab, setTab] = useState<Tab>('~home');
  const contributions = useContributions(token ?? null);
  const model =
    contributions.status === 'ready' ? contributions.model : null;
  const prs = useOpenPrs(token ?? null, model?.login ?? null, tab === '~prs');

  useEffect(() => {
    tokenStore.get().then(setToken);
  }, []);

  useEffect(() => {
    if (model && token !== DEMO_TOKEN) {
      syncWidget(model).catch(() => {});
    }
  }, [model, token]);

  const connect = async (verifiedToken: string) => {
    await tokenStore.set(verifiedToken);
    setToken(verifiedToken);
  };

  const disconnect = async () => {
    if (token !== DEMO_TOKEN) await clearWidget().catch(() => {});
    await tokenStore.clear();
    setToken(null);
    setTab('~home');
  };

  if (token === undefined) {
    return <View style={styles.screen} />;
  }

  if (token === null) {
    return <PatForm onTokenVerified={connect} />;
  }

  const isDemo = token === DEMO_TOKEN;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <DotText style={styles.wordmark}>
          git-huh<DotText style={styles.wordmarkAccent}>?</DotText>
        </DotText>
        <Pressable accessibilityRole="button" onPress={disconnect}>
          <DotText style={styles.disconnect}>
            {isDemo ? '~demo · exit' : 'disconnect'}
          </DotText>
        </Pressable>
      </View>

      <View style={styles.body}>
        {contributions.status === 'ready' && model && (
          <FadeIn key={tab}>
            {tab === '~home' && <HomeView model={model} />}
            {tab === '~dots' && <DotsView model={model} />}
            {tab === '~prs' && <PrsView state={prs} />}
          </FadeIn>
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
        <TabBar active={tab} onChange={setTab} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  wordmark: {
    fontSize: 15,
    letterSpacing: 1,
  },
  wordmarkAccent: {
    color: colors.accent,
    fontSize: 15,
  },
  disconnect: {
    color: colors.text.faint,
    fontSize: 10,
    letterSpacing: 1,
  },
  body: {
    flex: 1,
  },
  errorStack: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
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
});
