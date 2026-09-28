import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { OverlayFrame } from '../components/Overlay';
import { Data, Label, Micro } from '../components/Type';
import { handleOf } from '../lib/contributions';
import { HOME_BLOCKS } from '../lib/home';
import { useNav } from '../lib/nav';
import {
  DEFAULT_SETTINGS,
  disableNotifications,
  enableNotifications,
  NOTIFY_KINDS,
  notifyStatus,
  readSettings,
  writeSettings,
  type NotifySettings,
  type NotifyStatus,
} from '../lib/notify';
import { DEMO_TOKEN } from '../lib/token';
import { useSession } from '../shell/session';
import { colors, radii, space, themed } from '../theme';

/**
 * Everything about *who* is looking, behind the avatar in the top-right
 * corner of every section: the accounts on this phone and which of them are
 * added together, the notifications, and what the `you` page lists.
 *
 * It used to sit at the bottom of the `you` page, which made the page a
 * settings form with a greeting on top. Settings open from the corner on
 * every phone; the page is for your year.
 */
export function AccountScreen() {
  const session = useSession();
  const nav = useNav();
  const { accounts, contributions, model, together, toggleTogether, home, setHome } = session;
  const own = contributions.status === 'ready' ? contributions.model : null;
  const current = (own?.login ?? '').toLowerCase();
  const demo = session.token === DEMO_TOKEN;
  const others = accounts.filter((account) => account.login.toLowerCase() !== current);
  const summed = model?.accounts && model.accounts.length > 1;

  return (
    <OverlayFrame onBack={nav.close} where="account">
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <Label style={styles.head}>accounts</Label>
        <Micro style={styles.note}>
          tap one to switch to it · tick one to add its year into every chart
        </Micro>

        <View style={styles.row}>
          <Avatar login={current || 'demo'} size={34} />
          <View style={styles.rowText}>
            <Data numberOfLines={1}>~{current}{demo ? ' · demo' : ''}</Data>
            <Micro style={styles.dim}>in use · inbox, pull requests and replies</Micro>
          </View>
          <View style={[styles.tag, styles.tagOn]}>
            <Label style={styles.onBlack}>in use</Label>
          </View>
        </View>

        {others.map((account) => {
          const lower = account.login.toLowerCase();
          const ticked = together.includes(lower);
          const missing = session.missing.includes(account.login);
          return (
            <View key={account.login} style={styles.row}>
              <Pressable
                accessibilityLabel={`switch to ${account.login}`}
                accessibilityRole="button"
                onPress={() => session.switchTo(account.token).catch(() => {})}
                style={styles.rowMain}
              >
                <Avatar login={account.login} size={34} />
                <View style={styles.rowText}>
                  <Data numberOfLines={1}>~{lower}</Data>
                  <Micro style={missing ? styles.bad : styles.dim}>
                    {missing
                      ? 'could not be read · left out of the charts'
                      : ticked
                        ? `added into ~${current}'s charts`
                        : 'tap to switch'}
                  </Micro>
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={`show ${account.login} together with ${current}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ticked }}
                hitSlop={8}
                onPress={() => toggleTogether(account.login)}
                style={[styles.tag, ticked && styles.tagOn]}
              >
                <Label style={ticked ? styles.onBlack : styles.ink}>
                  {ticked ? '✓ together' : 'together'}
                </Label>
              </Pressable>
            </View>
          );
        })}

        {!demo && (
          <View style={styles.chips}>
            <Pressable
              accessibilityRole="button"
              onPress={() => nav.open({ kind: 'add-account' })}
              style={[styles.chip, styles.dashed]}
            >
              <Label style={styles.ink}>+ add account</Label>
            </Pressable>
            {others.length > 0 &&
              others.map((account) => (
                <Pressable
                  accessibilityRole="button"
                  key={`forget-${account.login}`}
                  onPress={() => session.forget(account.login).catch(() => {})}
                  style={styles.chip}
                >
                  <Label style={styles.dim}>forget ~{account.login.toLowerCase()}</Label>
                </Pressable>
              ))}
          </View>
        )}
        {summed && model && (
          <Micro style={styles.note}>the charts now read {handleOf(model)}</Micro>
        )}
        {demo && (
          <Micro style={styles.note}>the demo is one account · connect a token to add more</Micro>
        )}

        <Notify />

        <Label style={[styles.head, styles.gap]}>on the you page</Label>
        <Micro style={styles.note}>what is listed under the greeting</Micro>
        <View style={styles.chips}>
          {HOME_BLOCKS.map(({ key, label }) => {
            const on = home.blocks.includes(key);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                key={key}
                onPress={() =>
                  setHome({
                    blocks: on
                      ? home.blocks.filter((item) => item !== key)
                      : [...home.blocks, key],
                  })
                }
                style={[styles.chip, on && styles.chipOn]}
              >
                <Label style={on ? styles.onBlack : styles.ink}>{label}</Label>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              Linking.openURL(`https://github.com/${own?.login ?? ''}`).catch(() => {})
            }
            style={[styles.pill, styles.solid]}
          >
            <Label style={styles.onBlack}>open github →</Label>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={session.disconnect}
            style={styles.pill}
          >
            <Label style={styles.ink}>{demo ? 'exit demo' : `disconnect ~${current}`}</Label>
          </Pressable>
        </View>
      </ScrollView>
    </OverlayFrame>
  );
}

const STATUS_LINE: Record<NotifyStatus['kind'], string> = {
  off: 'off · the inbox only updates while the app is open',
  on: 'on · android checks the inbox every 15 minutes or so, less on a low battery',
  blocked: '',
  unsupported: 'not on this platform',
};

/**
 * Notifications for what wants you, done without a server: a background
 * check of the inbox that posts anything new of the kinds ticked here. The
 * line under the switch says exactly what it does and when it cannot.
 */
function Notify() {
  const [settings, setSettings] = useState<NotifySettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<NotifyStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    readSettings().then(async (read) => {
      const found = await notifyStatus(read);
      if (cancelled) return;
      setSettings(read);
      setStatus(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = async (next: NotifySettings) => {
    setSettings(next);
    setStatus(await notifyStatus(next));
  };

  const line =
    status == null
      ? ''
      : status.kind === 'blocked'
        ? status.why === 'permission'
          ? 'blocked · android is not letting git-huh notify · allow it in settings'
          : 'blocked · background work is restricted for git-huh on this phone'
        : STATUS_LINE[status.kind];

  return (
    <View>
      <Label style={[styles.head, styles.gap]}>notifications</Label>
      <View style={styles.chips}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.enabled }}
          onPress={async () =>
            apply(
              settings.enabled
                ? await disableNotifications(settings)
                : await enableNotifications(settings),
            )
          }
          style={[styles.chip, settings.enabled && styles.chipOn]}
        >
          <Label style={settings.enabled ? styles.onBlack : styles.ink}>
            {settings.enabled ? 'on' : 'turn on'}
          </Label>
        </Pressable>
        {settings.enabled &&
          NOTIFY_KINDS.map(({ kind, label }) => {
            const on = settings.kinds.includes(kind);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                key={kind}
                onPress={() => {
                  const next = {
                    ...settings,
                    kinds: on
                      ? settings.kinds.filter((item) => item !== kind)
                      : [...settings.kinds, kind],
                  };
                  writeSettings(next).catch(() => {});
                  setSettings(next);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Label style={on ? styles.onBlack : styles.ink}>{label}</Label>
              </Pressable>
            );
          })}
      </View>
      {line ? <Micro style={styles.note}>{line}</Micro> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    page: {
      paddingBottom: 40,
      paddingHorizontal: space.gutter,
      paddingTop: 12,
    },
    head: {
      color: colors.ink,
      marginBottom: 6,
    },
    gap: {
      marginTop: 30,
    },
    note: {
      color: colors.ink40,
      lineHeight: 13,
      marginBottom: 10,
      marginTop: 4,
    },
    row: {
      alignItems: 'center',
      borderBottomColor: colors.hair,
      borderBottomWidth: 1,
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 10,
    },
    rowMain: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 12,
    },
    rowText: {
      flex: 1,
      gap: 2,
    },
    dim: {
      color: colors.ink40,
    },
    bad: {
      color: colors.no,
    },
    ink: {
      color: colors.ink,
    },
    onBlack: {
      color: colors.onBlack,
    },
    tag: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    tagOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    chip: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    dashed: {
      borderStyle: 'dashed',
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 36,
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
    solid: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
  }),
);
