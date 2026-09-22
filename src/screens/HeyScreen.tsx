import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CrossField } from '../components/CrossField';
import { Body, Display, Label, Micro, Serif } from '../components/Type';
import type { Account } from '../lib/accounts';
import { insights, type GitHubModel } from '../lib/contributions';
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
import { colors, fonts, radii } from '../theme';
import { fmt, Page } from './shared';

/**
 * pin04 — Pantom's landing page. A serif greeting, a field of plus glyphs
 * standing in for the contribution year, and one sentence that carries five
 * statistics in five colours.
 *
 * This is also where the account lives: the handle, the link out, and the
 * one destructive action in the app. The activity feed used to sit under all
 * of it and is now the `inbox` section — a feed below the fold of a greeting
 * is a feed nobody reads twice, and the account is not something to hide
 * behind a menu either.
 */
export function HeyScreen({
  model,
  demo,
  onDisconnect,
  accounts,
  onSwitch,
  onAdd,
}: {
  model: GitHubModel;
  /** Demo data is not a connection, so the button says what it undoes. */
  demo: boolean;
  onDisconnect: () => void;
  accounts: Account[];
  onSwitch: (account: Account) => void;
  onAdd: () => void;
}) {
  const { width } = useWindowDimensions();
  const derived = insights(model);

  // Two days per column keeps the crosses far enough apart to read as
  // separate marks rather than merging into bars, the way pin04's do.
  const levels = bucket(model.columns.flat().map((day) => day.level), 2);

  return (
    <Page fill>
      <Display>Hey,</Display>
      <Display style={styles.handle}>~{model.login.toLowerCase()}</Display>

      <CrossField
        days={levels}
        height={132}
        style={styles.field}
        width={width - 40}
      />

      <Body style={styles.sentence}>
        You shipped <Text style={styles.blue}>{fmt(model.breakdown.commits)}</Text>{' '}
        commits across <Text style={styles.green}>{fmt(model.repoCount)}</Text>{' '}
        repos. <Text style={styles.red}>{fmt(model.openPrs)}</Text> pull requests
        are open, <Text style={styles.yellow}>{fmt(model.stars)}</Text> stars
        landed, and <Text style={styles.purple}>{fmt(model.followers)}</Text>{' '}
        people follow along.
      </Body>

      <Serif style={styles.since}>
        since {model.since} · {fmt(derived.activeDays)} active days ·{' '}
        {derived.currentStreak > 0
          ? `${derived.currentStreak} day streak`
          : 'no streak today'}
      </Serif>

      <Accounts
        accounts={accounts}
        current={model.login}
        demo={demo}
        onAdd={onAdd}
        onSwitch={onSwitch}
      />
      <Notify />

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            Linking.openURL(`https://github.com/${model.login}`).catch(() => {})
          }
          style={[styles.pill, styles.solid]}
        >
          <Label style={styles.solidLabel}>open github →</Label>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDisconnect}
          style={styles.pill}
        >
          <Label style={styles.pillLabel}>
            {demo ? 'exit demo' : 'disconnect'}
          </Label>
        </Pressable>
      </View>
    </Page>
  );
}

/**
 * Every account this phone holds, and a way to add one. The one in use is
 * filled black; tapping another switches the whole app to it — sections,
 * inbox, widget and all.
 */
function Accounts({
  accounts,
  current,
  demo,
  onSwitch,
  onAdd,
}: {
  accounts: Account[];
  current: string;
  demo: boolean;
  onSwitch: (account: Account) => void;
  onAdd: () => void;
}) {
  const lower = current.toLowerCase();
  const others = accounts.filter((account) => account.login.toLowerCase() !== lower);
  return (
    <View style={styles.block}>
      <Label style={styles.blockHead}>accounts</Label>
      <View style={styles.chips}>
        <View style={[styles.chip, styles.chipOn]}>
          <Label style={styles.chipLabelOn}>~{lower}{demo ? ' · demo' : ''}</Label>
        </View>
        {others.map((account) => (
          <Pressable
            accessibilityLabel={`switch to ${account.login}`}
            accessibilityRole="button"
            key={account.login}
            onPress={() => onSwitch(account)}
            style={styles.chip}
          >
            <Label style={styles.chipLabel}>~{account.login.toLowerCase()}</Label>
          </Pressable>
        ))}
        {!demo && (
          <Pressable accessibilityRole="button" onPress={onAdd} style={[styles.chip, styles.dashed]}>
            <Label style={styles.chipLabel}>+ add account</Label>
          </Pressable>
        )}
      </View>
    </View>
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
    <View style={styles.block}>
      <Label style={styles.blockHead}>notifications</Label>
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
          <Label style={settings.enabled ? styles.chipLabelOn : styles.chipLabel}>
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
                <Label style={on ? styles.chipLabelOn : styles.chipLabel}>{label}</Label>
              </Pressable>
            );
          })}
      </View>
      {line ? <Micro style={styles.blockNote}>{line}</Micro> : null}
    </View>
  );
}

/** Collapse `size` consecutive days into their peak, preserving intensity. */
function bucket(levels: number[], size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < levels.length; i += size) {
    out.push(Math.max(...levels.slice(i, i + size)));
  }
  return out;
}

const styles = StyleSheet.create({
  handle: {
    marginTop: -6,
  },
  field: {
    alignSelf: 'center',
    marginBottom: 20,
    marginTop: 18,
  },
  sentence: {
    fontSize: 17,
    lineHeight: 26,
  },
  blue: { color: colors.blue },
  green: { color: colors.green },
  red: { color: colors.red },
  yellow: { color: colors.yellow },
  purple: { color: colors.purple },
  since: {
    color: colors.ink40,
    fontFamily: fonts.serifItalic,
    fontSize: 13,
    marginTop: 16,
  },
  block: {
    marginTop: 24,
  },
  blockHead: {
    color: colors.ink,
    marginBottom: 8,
  },
  blockNote: {
    color: colors.ink40,
    lineHeight: 13,
    marginTop: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  chipLabel: {
    color: colors.ink,
  },
  chipLabelOn: {
    color: colors.onBlack,
  },
  dashed: {
    borderStyle: 'dashed',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    // Pushed to the foot of the page: with the feed gone this screen is a
    // title page, and a title page's buttons sit on the bottom margin
    // rather than halfway up an empty sheet.
    marginTop: 'auto',
    paddingTop: 26,
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
  },
  solidLabel: {
    color: colors.onBlack,
  },
});
