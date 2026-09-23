import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Label } from '../components/Type';
import { colors, fallbacks, fonts, themed } from '../theme';

const PITCH = 26;
const FONT = 13;
const MARGIN = 16;
/** Clear of the status bar at the top and the caption at the bottom. */
const TOP = 62;
const BOTTOM = 58;
/**
 * Depth of the ripple. The warp stays monotonic below 1, but letters also have
 * width: at this amplitude the tightest gap still clears a capital M.
 */
const AMPLITUDE = 0.38;
/** How far the wave slips between one row and the next. */
const ROW_SLIP = 0.05;
/** Seconds for the wave to travel one full cycle. */
const CYCLE_MS = 5000;
const MAX_GLYPHS = 20;
/**
 * Rows per message. pin11 reads as a wave because it is one phrase over and
 * over — the eye follows a letter from row to row. A different message on
 * every row destroys that and the field turns into a word search, so each
 * message holds for a band of rows before the next one takes over.
 */
const BAND = 5;
/**
 * Phases the wave is sampled at before it is handed to the native animation
 * driver, which interpolates linearly between them. Sixteen samples of a sine
 * are accurate to about a sixth of a pixel at this amplitude — far below the
 * point where a letter looks like it is in the wrong place.
 */
const SAMPLES = 16;
const PHASES = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);

/**
 * pin11 — one phrase set again and again, its tracking warped line by line
 * until the block bends into a wave.
 *
 * Here the phrase is not one phrase: every row is one of your own commit
 * messages, taken from across your whole history. Loading is the only moment
 * in the app with nothing to show, so it shows what you have already written.
 *
 * **Nothing about this animation runs in JavaScript.** Every glyph is its own
 * `Animated.Text`, and the whole track it will travel — its x at sixteen
 * phases of the wave — is computed once at mount and handed to the native
 * driver as an interpolation. One looping value drives all of them, on the
 * UI thread, so the letters keep sliding at the display's refresh rate even
 * while the first GitHub request is parsing on the JS thread.
 *
 * The two versions before this one both animated from JS: a timer stepping a
 * counter (visibly steppy at ~16 fps), then `requestAnimationFrame` (correct
 * timing, still slow). Both re-rendered the whole field every frame and made
 * react-native-svg re-shape thirty rows of text with it, which no amount of
 * scheduling makes cheap. Plain text views and a transform each cost nothing
 * per frame, because per frame there is nothing left to do.
 */
export function LoadingScreen({
  lines,
  caption,
}: {
  lines: string[];
  caption: string;
}) {
  // Measured from the window rather than onLayout: this screen is full-bleed,
  // and in a release build the first layout event for a freshly mounted root
  // is dropped ("instanceHandle is null, event of type topLayout"), which left
  // the field blank with only the caption drawn.
  const { width, height } = useWindowDimensions();

  const [wave] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(wave, {
        duration: CYCLE_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [wave]);

  // The field arrives rather than appearing — a hard cut to a full page of
  // type is the one moment this screen looks like a crash.
  useEffect(() => {
    Animated.timing(enter, {
      duration: 520,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const source = lines.length > 0 ? lines : PLACEHOLDER;
  const rows = Math.max(1, Math.floor((height - TOP - BOTTOM) / PITCH));
  const field = useMemo(() => build(source, rows, width), [rows, source, width]);

  return (
    <View style={styles.field}>
      <Animated.View style={[styles.block, { opacity: enter }]}>
        {field.map((glyph) => (
          <Animated.Text
            key={glyph.key}
            style={[
              // A font-load failure must still draw readable type, the way
              // every primitive in Type.tsx does.
              { fontFamily: fallbacks.sans },
              styles.glyph,
              {
                top: glyph.top,
                transform: [
                  {
                    translateX: wave.interpolate({
                      inputRange: PHASES,
                      outputRange: glyph.track,
                    }),
                  },
                ],
              },
            ]}
          >
            {glyph.char}
          </Animated.Text>
        ))}
      </Animated.View>

      <View style={styles.caption}>
        <Label style={styles.captionText}>git huh</Label>
        <Label style={styles.captionText}>{caption}</Label>
      </View>
    </View>
  );
}

interface Glyph {
  key: string;
  char: string;
  top: number;
  /** x at each phase in `PHASES`, which is the whole animation. */
  track: number[];
}

/**
 * Every glyph on screen, with the path it will follow.
 *
 * Spaces are dropped rather than laid out: they are a third of some commit
 * messages and a view that draws nothing is still a view to mount.
 */
function build(source: string[], rows: number, width: number): Glyph[] {
  const out: Glyph[] = [];

  for (let row = 0; row < rows; row++) {
    const text = clipped(source[Math.floor(row / BAND) % source.length]);
    const top = TOP + row * PITCH - FONT;

    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === ' ') continue;
      out.push({
        key: `${row}:${index}`,
        char,
        top,
        // Each row's own phase offset is baked in here, which is what makes
        // the wave travel down the block instead of every row moving as one.
        track: PHASES.map((phase) =>
          positionAt(index, text.length, width, phase + row * ROW_SLIP),
        ),
      });
    }
  }

  return out;
}

/**
 * The glyphs of one line, upper case and clipped. Every glyph is placed
 * individually below, so a long message would squeeze the tracking flat and
 * lose the wave.
 */
function clipped(message: string): string {
  const upper = message.toUpperCase().trim();
  return upper.length > MAX_GLYPHS ? upper.slice(0, MAX_GLYPHS) : upper;
}

/**
 * Where one glyph of a row sits at one phase of the wave.
 *
 * Both ends of the row are pinned to the margins and the letters between them
 * are pushed around by one cycle of a sine, so a row is bunched where the
 * previous row is spread. Slipping the phase row by row turns that into a
 * wave travelling down the block — which is the whole of pin11.
 */
function positionAt(
  index: number,
  count: number,
  width: number,
  phase: number,
): number {
  // The last glyph is drawn *from* its x, so the track stops a glyph short of
  // the right margin — otherwise wide rows run off the edge.
  const span = width - MARGIN * 2 - FONT * 0.72;
  if (count <= 1) return MARGIN;

  const t = index / (count - 1);
  const base = Math.sin(-2 * Math.PI * phase);
  const warped =
    t + (AMPLITUDE / (2 * Math.PI)) * (Math.sin(2 * Math.PI * (t - phase)) - base);
  return MARGIN + warped * span;
}

/**
 * First launch, or a token whose history will not search: stand-in commit
 * subjects, so the screen is still a wall of commit messages rather than the
 * app's name six times.
 */
const PLACEHOLDER = [
  'INITIAL COMMIT',
  'FIX THE OBVIOUS THING',
  'REFACTOR THE LAYOUT PASS',
  'ADD A README',
  'REVERT THAT LAST ONE',
  'TIDY UP THE IMPORTS',
  'MAKE IT ACTUALLY BUILD',
  'RENAME EVERYTHING AGAIN',
  'WIP DO NOT MERGE',
  'SHIP IT',
];

const styles = themed(() =>
  StyleSheet.create({
    field: {
      backgroundColor: colors.klein,
      flex: 1,
    },
    block: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    glyph: {
      color: colors.onBlack,
      fontFamily: fonts.sansBold,
      fontSize: FONT,
      // Android pads text views by the font's own ascent, which would put every
      // row a few points below where the wave says it is.
      includeFontPadding: false,
      left: 0,
      lineHeight: FONT * 1.3,
      position: 'absolute',
    },
    caption: {
      bottom: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      left: 0,
      paddingBottom: 18,
      paddingHorizontal: MARGIN,
      position: 'absolute',
      right: 0,
    },
    captionText: {
      color: colors.onBlack55,
    },
  }),
);
