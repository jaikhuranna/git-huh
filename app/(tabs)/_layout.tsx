import { StatusBar } from 'expo-status-bar';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { lazy, memo, Suspense, useCallback, useEffect, type ComponentType } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';

import { PatForm } from '../../src/components/PatForm';
import { NavContext, type Route } from '../../src/lib/nav';
import { tokenStore } from '../../src/lib/token';
import { LoadingScreen } from '../../src/screens/LoadingScreen';
import { SECTIONS } from '../../src/shell/sections';
import { useSession } from '../../src/shell/session';
import { colors, fonts, themed } from '../../src/theme';

/**
 * Pushed screens are not part of first paint. Metro's `lazy` evaluates the
 * module the first time that route is actually opened, then keeps it. The
 * shell, the token form and the loading screen stay eager: they are what
 * the first frame is.
 */
const AccountScreen = lazyScreen(() => import('../../src/screens/AccountScreen'), 'AccountScreen');
const AssignedPage = lazyScreen(() => import('../../src/screens/AssignedScreen'), 'AssignedPage');
const NewDiscussionScreen = lazyScreen(
  () => import('../../src/screens/CreateScreen'),
  'NewDiscussionScreen',
);
const NewFileScreen = lazyScreen(() => import('../../src/screens/CreateScreen'), 'NewFileScreen');
const NewGistScreen = lazyScreen(() => import('../../src/screens/CreateScreen'), 'NewGistScreen');
const NewPullScreen = lazyScreen(() => import('../../src/screens/CreateScreen'), 'NewPullScreen');
const NewReleaseScreen = lazyScreen(
  () => import('../../src/screens/CreateScreen'),
  'NewReleaseScreen',
);
const NewRepoScreen = lazyScreen(() => import('../../src/screens/CreateScreen'), 'NewRepoScreen');
const FileScreen = lazyScreen(() => import('../../src/screens/FileScreen'), 'FileScreen');
const GistScreen = lazyScreen(() => import('../../src/screens/GistsScreen'), 'GistScreen');
const GistsScreen = lazyScreen(() => import('../../src/screens/GistsScreen'), 'GistsScreen');
const InboxPage = lazyScreen(() => import('../../src/screens/InboxScreen'), 'InboxPage');
const NewIssueScreen = lazyScreen(() => import('../../src/screens/NewIssueScreen'), 'NewIssueScreen');
const PeoplePage = lazyScreen(() => import('../../src/screens/PeopleScreen'), 'PeoplePage');
const PullScreen = lazyScreen(() => import('../../src/screens/PullScreen'), 'PullScreen');
const QueuePage = lazyScreen(() => import('../../src/screens/QueueScreen'), 'QueuePage');
const RepoScreen = lazyScreen(() => import('../../src/screens/RepoScreen'), 'RepoScreen');
const SearchScreen = lazyScreen(() => import('../../src/screens/SearchScreen'), 'SearchScreen');
const ServiceScreen = lazyScreen(() => import('../../src/screens/ServiceScreen'), 'ServiceScreen');
const ShareScreen = lazyScreen(() => import('../../src/screens/ShareScreen'), 'ShareScreen');
const ThreadScreen = lazyScreen(() => import('../../src/screens/ThreadScreen'), 'ThreadScreen');
const UserScreen = lazyScreen(() => import('../../src/screens/UserScreen'), 'UserScreen');

/**
 * The conditional type keeps this export's props from being unified with
 * its siblings. Several of these modules export more than one screen.
 */
function lazyScreen<M, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): M[K] extends ComponentType<infer P> ? ComponentType<P> : never {
  return lazy(async () => {
    const module = await load();
    const screen = module[name];
    if (typeof screen !== 'function') {
      throw new Error(`pushed screen ${String(name)} did not load`);
    }
    return { default: screen as unknown as ComponentType<any> };
  }) as unknown as M[K] extends ComponentType<infer P> ? ComponentType<P> : never;
}

/**
 * One thing pushed over the sections. Memoised: a page lower in the stack
 * should not redraw because another was pushed on top of it.
 */
const RouteView = memo(function RouteView({ route, active }: { route: Route; active: boolean }) {
  switch (route.kind) {
    case 'pull':
      return <PullScreen key={`${route.repo}#${route.number}`} initialTab={route.tab} number={route.number} repo={route.repo} sequence={route.sequence} />;
    case 'thread':
      return <ThreadScreen number={route.number} repo={route.repo} type={route.type} />;
    case 'repo':
      return <RepoScreen initialTab={route.tab} repo={route.repo} />;
    case 'file':
      return <FileScreen find={route.find} path={route.path} refName={route.ref} repo={route.repo} />;
    case 'new-issue':
      return <NewIssueScreen repo={route.repo} />;
    case 'new-pull':
      return <NewPullScreen head={route.head} repo={route.repo} />;
    case 'new-release':
      return <NewReleaseScreen repo={route.repo} />;
    case 'new-discussion':
      return <NewDiscussionScreen repo={route.repo} />;
    case 'new-file':
      return <NewFileScreen dir={route.dir} refName={route.ref} repo={route.repo} />;
    case 'new-repo':
      return <NewRepoScreen description={route.description} idea={route.idea} name={route.name} />;
    case 'new-gist':
      return <NewGistScreen />;
    case 'user':
      return <UserScreen login={route.login} />;
    case 'search':
      return <SearchScreen query={route.query} />;
    case 'gists':
      return <GistsScreen login={route.login} />;
    case 'gist':
      return <GistScreen id={route.id} />;
    case 'account':
      return <AccountScreen />;
    case 'share':
      return <ShareScreen kind={route.card} year={route.year} />;
    case 'queue':
      return <QueuePage />;
    case 'assigned':
      return <AssignedPage />;
    case 'people':
      return <PeoplePage />;
    case 'inbox':
      return <InboxPage />;
    case 'service':
      return <ServiceScreen id={route.id} name={route.name} active={active} />;
    case 'add-account':
      return null;
  }
});

/**
 * How many pushed screens stay mounted under the one on top. Deeper ones
 * remain in the session stack and are built again on the way back; drafts
 * and the read cache are what make that return feel like the same page.
 */
const KEEP_OVERLAYS = 3;

function routeKey(route: Route): string {
  switch (route.kind) {
    case 'pull':
    case 'thread':
      return `${route.kind}:${route.repo}#${route.number}`;
    case 'file':
      return `file:${route.repo}:${route.path}`;
    case 'repo':
    case 'new-issue':
    case 'new-pull':
    case 'new-release':
    case 'new-discussion':
      return `${route.kind}:${route.repo}`;
    case 'new-file':
      return `new-file:${route.repo}:${route.dir}`;
    case 'user':
      return `user:${route.login}`;
    case 'search':
      return `search:${route.query ?? ''}`;
    case 'gists':
      return `gists:${route.login ?? ''}`;
    case 'gist':
      return `gist:${route.id}`;
    case 'new-repo':
    case 'new-gist':
      return route.kind;
    case 'add-account':
    case 'account':
    case 'queue':
    case 'assigned':
    case 'people':
    case 'inbox':
      return route.kind;
    case 'share':
      return `share:${route.card}`;
    case 'service':
      return `service:${route.id}`;
  }
}

/** The token form as a pushed screen. Back is handled once, for the whole stack. */
function AddAccount({ onCancel, onVerified }: { onCancel: () => void; onVerified: (token: string) => void }) {
  return <PatForm onCancel={onCancel} onTokenVerified={onVerified} />;
}

/**
 * The five sections on the platform's own tab bar: `UITabBarController` on
 * iOS, which is Liquid Glass on iOS 26, and Material 3's navigation bar on
 * Android. A bar drawn in JavaScript can never look like either system's,
 * and would be the one part of the app that felt like a web page.
 *
 * The bar needs an account, not a year. Ideas and the host are on the device;
 * an unreachable GitHub must not hide them. Today, work and year say so
 * themselves while their data is still coming.
 */
export default function TabsLayout() {
  const session = useSession();
  const { nav, stack, token } = session;
  const close = nav.close;

  const onBack = useCallback(() => {
    if (stack.length === 0) return false;
    close();
    return true;
  }, [close, stack.length]);

  useEffect(() => {
    if (stack.length === 0) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [onBack, stack.length]);

  if (token === undefined) {
    return (
      <>
        <StatusBar style="auto" />
        <LoadingScreen caption="opening the drawer" lines={session.lines} />
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

  const android = Platform.OS === 'android';
  const mountedFrom = Math.max(0, stack.length - KEEP_OVERLAYS);

  return (
    <NavContext.Provider value={nav}>
      <StatusBar style="auto" />
      <NativeTabs
        backgroundColor={android ? colors.canvas : undefined}
        badgeBackgroundColor={colors.ink}
        badgeTextColor={colors.canvas}
        iconColor={android ? { default: colors.ink40, selected: colors.ink } : undefined}
        // The selected pill is the widget's card, lifted off the page — the
        // same surface every screen above it is drawn on.
        indicatorColor={colors.card}
        labelStyle={{
          default: {
            color: colors.ink40,
            fontFamily: android ? fonts.mono : undefined,
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
            {section.key === 'work' && session.wanting > 0 ? (
              <NativeTabs.Trigger.Badge>
                {session.wanting > 99 ? '99+' : String(session.wanting)}
              </NativeTabs.Trigger.Badge>
            ) : null}
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>

      {/* Over the tabs rather than inside one, like a pushed screen on any
          phone: the bar belongs to the sections, and a detail page has its
          own back. Only the top few stay mounted; the rest of the stack is
          remembered and built again on the way back. */}
      {stack.slice(mountedFrom).map((route, offset) => {
        const index = mountedFrom + offset;
        return (
          <View
            key={`${index}-${routeKey(route)}`}
            style={[styles.overlay, index < stack.length - 1 && styles.hidden]}
          >
            {route.kind === 'add-account' ? (
              <AddAccount
                onCancel={close}
                onVerified={(verified) => {
                  session.switchTo(verified).catch(() => {});
                }}
              />
            ) : (
              <Suspense fallback={<LoadingScreen caption="opening" lines={session.lines} />}>
                <RouteView route={route} active={index === stack.length - 1} />
              </Suspense>
            )}
          </View>
        );
      })}
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
    // Under the top page, still mounted, but not drawn. Deeper than
  // KEEP_OVERLAYS is not in the tree at all.
  hidden: {
      display: 'none',
    },
  }),
);
