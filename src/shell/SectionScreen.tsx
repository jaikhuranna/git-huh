import { useCallback, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { TOKEN_SETTINGS_URL } from '../components/PatForm';
import { Body, Label } from '../components/Type';
import { Wordmark } from '../components/Wordmark';
import { whyNot } from '../screens/shared';
import { savedAge } from '../lib/store';
import { IdeasScreen } from '../screens/IdeasScreen';
import { HostScreen } from '../screens/HostScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { WorkScreen } from '../screens/WorkScreen';
import { YearScreen } from '../screens/YearScreen';
import { colors, radii, space, themed } from '../theme';
import { SECTIONS } from './sections';
import { useSessionActions, useSessionData } from './session';

/**
 * The one thing the app cannot fix for you.
 *
 * A token without `repo` gets the public half of your year and nothing says
 * so: the grid comes back flat, today reads zero and the flow diagram adds up
 * to a handful of contributions. Silence is the worst possible answer, so
 * this strip names the cause and links to a token that has the scope.
 */
function ScopeNotice() {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => Linking.openURL(TOKEN_SETTINGS_URL).catch(() => {})}
      style={styles.notice}
    >
      <View style={styles.noticeDot} />
      <Label style={styles.noticeText}>
        this token has no repo scope · private work is invisible to it
      </Label>
    </Pressable>
  );
}

/**
 * The tabs mount as soon as there is a token, so a GitHub year that has not
 * arrived yet is this section's own state — not a reason to hide Ideas or
 * Host, and not a blank page where the year should be.
 */
export function GitHubGate({ children }: { children: ReactNode }) {
  const { contributions } = useSessionData();
  if (contributions.status === 'ready') return children;
  const waiting = contributions.status === 'idle' || contributions.status === 'loading';
  return (
    <View style={styles.gate}>
      <Label style={styles.gateText}>
        {waiting ? 'reading your year…' : 'could not read your year'}
      </Label>
      {!waiting && <Body style={styles.gateWhy}>{whyNot(contributions.error)}</Body>}
    </View>
  );
}

/**
 * A tab: the wordmark and the account, the scope strip if it applies, and the
 * section's page.
 *
 * A section is **one page**, scrolled, not a row of views to switch between:
 * the bar at the bottom is the only row of tabs in the app. What used to be a
 * section's views are blocks on its page, each opened by the same two-part
 * caption, and a list too long for the page shows its head and pushes the
 * rest (`More`, `Tile`).
 */
export function SectionScreen({ index }: { index: number }) {
  const { nav, stack, tab } = useSessionActions();
  const { contributions, model, scopes } = useSessionData();
  const section = SECTIONS[index];
  // On screen: this section, and nothing pushed over it. Animations park and
  // the feed stops paging in when it is not.
  const active = index === tab && stack.length === 0;
  const openAccount = useCallback(() => nav.open({ kind: 'account' }), [nav]);

  const page = (() => {
    switch (section.key) {
      case 'today':
        return <TodayScreen active={active} />;
      case 'work':
        return <WorkScreen />;
      case 'year':
        return <YearScreen active={active} />;
      case 'ideas':
        return <IdeasScreen active={active} demo={nav.demo} key={nav.demo ? 'demo' : 'local'} />;
      case 'host':
        return <HostScreen active={active} />;
    }
  })();

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.chrome}>
        <Wordmark size={17} />
        <View style={styles.corner}>
          {section.key !== 'ideas' && section.key !== 'host' && contributions.status === 'ready' &&
            contributions.offline &&
            contributions.savedAt != null && (
              <Label numberOfLines={1} style={styles.handle}>
                offline · {savedAge(contributions.savedAt)}
              </Label>
            )}
          {model && (
            <Pressable
              accessibilityLabel="account, notifications and settings"
              accessibilityRole="button"
              hitSlop={8}
              onPress={openAccount}
              style={styles.avatars}
            >
              {(model.accounts ?? [model.login]).slice(0, 3).map((login, position) => (
                <Avatar
                  key={login}
                  login={login}
                  size={28}
                  style={position > 0 ? styles.stacked : undefined}
                />
              ))}
            </Pressable>
          )}
        </View>
      </View>

      {section.key !== 'ideas' && section.key !== 'host' && scopes === 'limited' && <ScopeNotice />}

      <View style={styles.body}>{page}</View>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
      flex: 1,
    },
    chrome: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 8,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    corner: {
      alignItems: 'center',
      flexDirection: 'row',
      flexShrink: 1,
      gap: 10,
    },
    handle: {
      color: colors.ink40,
      flexShrink: 1,
    },
    avatars: {
      flexDirection: 'row',
    },
    stacked: {
      marginLeft: -9,
    },
    notice: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radii.tile,
      flexDirection: 'row',
      gap: 8,
      marginBottom: 6,
      marginHorizontal: space.gutter,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    noticeDot: {
      backgroundColor: colors.no,
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    noticeText: {
      color: colors.ink70,
      flex: 1,
    },
    body: {
      flex: 1,
    },
    gate: {
      gap: 8,
      paddingHorizontal: space.gutter,
      paddingTop: space.row,
    },
    gateText: {
      color: colors.ink70,
    },
    gateWhy: {
      color: colors.ink40,
    },
  }),
);
