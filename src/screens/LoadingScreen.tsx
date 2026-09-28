import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Marquee } from '../components/Marquee';
import { Label } from '../components/Type';
import { Wordmark } from '../components/Wordmark';
import type { CommitLine } from '../lib/messageCache';
import { colors, levels, radii, space, themed } from '../theme';

const ROWS = 7;
const PITCH = 22;
/** The gap between two marks, as a share of the pitch — the widget's. */
const GAP_SHARE = 0.3;
/** One sweep of the light across the card. */
const CYCLE_MS = 2600;
/**
 * Phases the sweep is sampled at before it is handed to the native driver,
 * which interpolates linearly between them. Twenty-four samples of a crest
 * this wide are smooth to well under a pixel of dot size.
 */
const SAMPLES = 24;
const PHASES = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
/** Width of the travelling crest, as a share of one sweep. */
const CREST = 0.09;

/**
 * The first thing on screen, and the only moment with nothing to show — so
 * it shows the widget, waiting. The card is the home-screen card: your own
 * commit messages travel across the top, taken from across your history, and
 * under them a field of dots with a light passing through it from the oldest
 * column to today's plus, over and over, until the year arrives.
 *
 * **Nothing about this animation runs in JavaScript.** Every dot's whole
 * track — its size and weight at twenty-four phases of the sweep — is
 * computed once at mount and handed to the native driver as an
 * interpolation of one looping value, so the light keeps moving at the
 * display's rate while the JS thread is parsing the first GitHub response,
 * which is the entire point of this screen. The strip is the same
 * (`Marquee`). A timer or `requestAnimationFrame` was tried on the old
 * version of this page and stuttered exactly then.
 */
export function LoadingScreen({
  lines,
  caption,
}: {
  lines: readonly CommitLine[];
  caption: string;
}) {
  // Measured from the window rather than onLayout: in a release build the
  // first layout event for a freshly mounted root is dropped ("instanceHandle
  // is null, event of type topLayout"), which left the card empty.
  const { width } = useWindowDimensions();
  const inner = width - space.gutter * 2 - space.card * 2;
  const columns = Math.max(8, Math.floor(inner / PITCH));

  const [sweep] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweep, {
        duration: CYCLE_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  // The card arrives rather than appearing — a hard cut reads as a crash.
  useEffect(() => {
    Animated.timing(enter, {
      duration: 520,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // Built with the field, not per render, so a new caption does not hand the
  // native driver a few hundred fresh nodes.
  const dots = useMemo(() => field(columns, sweep), [columns, sweep]);
  const cell = PITCH * (1 - GAP_SHARE);
  const source = lines.length > 0 ? lines : PLACEHOLDER;

  return (
    <View style={styles.screen}>
      <Animated.View style={[styles.stack, { opacity: enter }]}>
        <View style={styles.card}>
          <Marquee
            items={source.map((line) => ({ lead: line.repo, text: line.message }))}
            style={styles.strip}
          />
          <View style={{ height: ROWS * PITCH, width: columns * PITCH }}>
            {dots.map((one) => (
              <Animated.View
                key={one.key}
                style={[
                  styles.dot,
                  {
                    borderRadius: cell / 2,
                    height: cell,
                    left: one.column * PITCH + (PITCH - cell) / 2,
                    opacity: one.opacity,
                    top: one.row * PITCH + (PITCH - cell) / 2,
                    transform: [{ scale: one.scale }],
                    width: cell,
                  },
                ]}
              />
            ))}
            <View
              style={[
                styles.plus,
                { left: (columns - 1) * PITCH + (PITCH - cell) / 2, top: (ROWS - 1) * PITCH + (PITCH - cell) / 2 },
                { height: cell, width: cell },
              ]}
            >
              <View style={[styles.bar, { height: cell * 0.22, width: cell }]} />
              <View style={[styles.bar, { height: cell, width: cell * 0.22 }]} />
            </View>
          </View>
        </View>

        <View style={styles.caption}>
          <Wordmark size={15} />
          <Label>{caption}</Label>
        </View>
      </Animated.View>
    </View>
  );
}

interface Dot {
  key: string;
  column: number;
  row: number;
  scale: Animated.AnimatedInterpolation<number>;
  opacity: Animated.AnimatedInterpolation<number>;
}

/**
 * Every dot with the path it will follow. Each one rests at a level of its
 * own — a stand-in year, so the card is a field and not a blank — and swells
 * to the peak as the crest passes over its column. The crest leans a little
 * down the rows, so it reads as light moving through the field rather than a
 * column flashing.
 */
function field(columns: number, sweep: Animated.Value): Dot[] {
  const out: Dot[] = [];
  let seed = 0x9e3779b9;
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < ROWS; row++) {
      if (column === columns - 1 && row === ROWS - 1) continue; // today's plus
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const roll = seed / 0xffffffff;
      const rest = roll < 0.45 ? 0 : Math.min(3, Math.floor(roll * 4));
      const at = (column / columns) * (1 - CREST * 2) + CREST + row * 0.012;
      const crest = PHASES.map((phase) => {
        const distance = Math.min(Math.abs(phase - at), 1 - Math.abs(phase - at));
        return Math.exp(-(distance * distance) / (2 * CREST * CREST));
      });
      out.push({
        key: `${column}:${row}`,
        column,
        row,
        scale: sweep.interpolate({
          inputRange: PHASES,
          outputRange: crest.map(
            (lift) => levels.scale[rest] + (1 - levels.scale[rest]) * lift,
          ),
        }),
        opacity: sweep.interpolate({
          inputRange: PHASES,
          outputRange: crest.map(
            (lift) => levels.alpha[rest] + (1 - levels.alpha[rest]) * lift,
          ),
        }),
      });
    }
  }
  return out;
}

/**
 * First launch, or a token whose history will not search: stand-in commit
 * subjects, so the strip still reads as commit messages.
 */
const PLACEHOLDER: CommitLine[] = [
  { repo: 'git-huh', message: 'first commit' },
  { repo: 'dotfiles', message: 'fix the obvious thing' },
  { repo: 'git-huh', message: 'refactor the layout pass' },
  { repo: 'notes', message: 'add a readme' },
  { repo: 'git-huh', message: 'revert that last one' },
  { repo: 'scratch', message: 'make it actually build' },
  { repo: 'git-huh', message: 'ship it' },
];

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: space.gutter,
    },
    stack: {
      gap: 14,
    },
    card: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radii.sheet,
      padding: space.card,
    },
    strip: {
      alignSelf: 'stretch',
      marginBottom: 16,
    },
    dot: {
      backgroundColor: colors.ink,
      position: 'absolute',
    },
    plus: {
      alignItems: 'center',
      justifyContent: 'center',
      position: 'absolute',
    },
    bar: {
      backgroundColor: colors.ink,
      position: 'absolute',
    },
    caption: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 6,
    },
  }),
);
