import { StatusBar } from 'expo-status-bar';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { memo, useEffect } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';

import { PatForm } from '../../src/components/PatForm';
import { Body, Label } from '../../src/components/Type';
import { NavContext, type Route } from '../../src/lib/nav';
import { tokenStore } from '../../src/lib/token';
import { FileScreen } from '../../src/screens/FileScreen';
import { LoadingScreen } from '../../src/screens/LoadingScreen';
import { NewIssueScreen } from '../../src/screens/NewIssueScreen';
import { PullScreen } from '../../src/screens/PullScreen';
import { RepoScreen } from '../../src/screens/RepoScreen';
import { ThreadScreen } from '../../src/screens/ThreadScreen';
import { SECTIONS } from '../../src/shell/sections';
import { useSession } from '../../src/shell/session';
import { colors, fonts, space, themed } from '../../src/theme';

/**
 * One thing pushed over the sections. Memoised: a page lower in the stack
 * should not redraw because another was pushed on top of it.
 */
const RouteView = memo(function RouteView({ route }: { route: Route }) {
  switch (route.kind) {
    case 'pull':
      return <PullScreen number={route.number} repo={route.repo} />;
    case 'thread':
      return <ThreadScreen number={route.number} repo={route.repo} type={route.type} />;
    case 'repo':
      return <RepoScreen repo={route.repo} />;
    case 'file':
      return <FileScreen find={route.find} path={route.path} refName={route.ref} repo={route.repo} />;
    case 'new-issue':
      return <NewIssueScreen repo={route.repo} />;
    case 'add-account':
      return null;
  }
});

function routeKey(route: Route): string {
  switch (route.kind) {
    case 'pull':
    case 'thread':
      return `${route.kind}:${route.repo}#${route.number}`;
    case 'file':
      return `file:${route.repo}:${route.path}`;
    case 'repo':
    case 'new-issue':
      return `${route.kind}:${route.repo}`;
    case 'add-account':
      return 'add-account';
  }
}

/** The token form as a pushed screen, with the system back button wired to cancel. */
function AddAccount({ onCancel, onVerified }: { onCancel: () => void; onVerified: (token: string) => void }) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel]);
  return <PatForm onCancel={onCancel} onTokenVerified={onVerified} />;
}

/**
 * The five sections on the platform's own tab bar: `UITabBarController` on
 * iOS, which is Liquid Glass on iOS 26, and Material 3's navigation bar on
 * Android. A bar drawn in JavaScript can never look like either system's,
 * and would be the one part of the app that felt like a web page.
 *
 * Nothing is here until there is a year to show: the loading wave, the token
 * form and the error all take the whole screen, with no bar under them.
 */
export default function TabsLayout() {
  const session = useSession();
  const { contributions, model, nav, stack, token } = session;

  if (token === undefined) {
    return (
      <>
        <StatusBar style="light" />
        <LoadingScreen caption="opening the drawer" lines={session.said} />
      </>
    );
  }

  if (token === null) {
    return (
      <PatForm
        onTokenVerified={async (verified) => {
          await tokenStore.set(verified);
          session.setToken(verified);
        }}
      />
    );
  }

  if (contributions.status === 'loading' || contributions.status === 'idle') {
    return (
      <>
        <StatusBar style="light" />
        <LoadingScreen caption="reading your year" lines={session.said} />
      </>
    );
  }

  if (!model) {
    const expired = contributions.status === 'error' && contributions.error.kind === 'invalid-token';
    return (
      <View style={styles.errorStack}>
        <StatusBar style="auto" />
        <Body style={styles.errorText}>
          {expired ? 'that token expired or was revoked' : 'could not reach github'}
        </Body>
        {expired ? (
          <Pressable accessibilityRole="button" onPress={session.disconnect}>
            <Label style={styles.reset}>start over</Label>
          </Pressable>
        ) : (
          // No signal and nothing saved yet is not a reason to forget the
          // token; it is a reason to try again.
          <Pressable accessibilityRole="button" onPress={contributions.reload}>
            <Label style={styles.reset}>try again</Label>
          </Pressable>
        )}
      </View>
    );
  }

  const android = Platform.OS === 'android';

  return (
    <NavContext.Provider value={nav}>
      <StatusBar style="auto" />
      <NativeTabs
        backgroundColor={android ? colors.canvas : undefined}
        badgeBackgroundColor={colors.ink}
        badgeTextColor={colors.canvas}
        iconColor={android ? { default: colors.ink40, selected: colors.onBlack } : undefined}
        // The selected pill is black here as it is everywhere else in the app.
        indicatorColor={colors.black}
        labelStyle={{
          default: {
            color: colors.ink40,
            fontFamily: android ? fonts.monoMedium : undefined,
            fontSize: 11,
          },
          selected: {
            color: colors.ink,
            fontFamily: android ? fonts.monoMedium : undefined,
            fontSize: 11,
          },
        }}
        labelVisibilityMode="labeled"
        minimizeBehavior="onScrollDown"
        rippleColor={colors.hair}
        tintColor={colors.ink}
      >
        {SECTIONS.map((section) => (
          <NativeTabs.Trigger key={section.key} name={section.route}>
            <NativeTabs.Trigger.Label>{section.key}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon md={section.md} sf={section.sf} />
            {section.key === 'inbox' && session.wanting > 0 ? (
              <NativeTabs.Trigger.Badge>
                {session.wanting > 99 ? '99+' : String(session.wanting)}
              </NativeTabs.Trigger.Badge>
            ) : null}
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>

      {/* Over the tabs rather than inside one: the detail pages have their
          own horizontal scrollers, and nested in a pager every one of them
          would lose its drag to the page swipe. Lower pages stay mounted,
          hidden, so back returns to them as they were. */}
      {stack.map((route, index) => (
        <View
          key={`${index}-${routeKey(route)}`}
          style={[styles.overlay, index < stack.length - 1 && styles.hidden]}
        >
          {route.kind === 'add-account' ? (
            <AddAccount
              onCancel={nav.close}
              onVerified={(verified) => {
                session.switchTo(verified).catch(() => {});
              }}
            />
          ) : (
            <RouteView route={route} />
          )}
        </View>
      ))}
    </NavContext.Provider>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    overlay: {
      backgroundColor: colors.canvas,
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    // Kept mounted and off screen: React Native honours `display: none`, so a
    // page that is under another keeps its state without drawing.
    hidden: {
      display: 'none',
    },
    errorStack: {
      alignItems: 'center',
      backgroundColor: colors.canvas,
      flex: 1,
      gap: 16,
      justifyContent: 'center',
      paddingHorizontal: space.gutter,
    },
    errorText: {
      color: colors.red,
      textAlign: 'center',
    },
    reset: {
      color: colors.ink,
      textDecorationLine: 'underline',
    },
  }),
);
