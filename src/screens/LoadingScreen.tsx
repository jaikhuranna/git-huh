import { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { Label } from '../components/Type';
import { useTicker } from '../hooks/useTicker';
import { colors, fonts } from '../theme';

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
/** Cycles of the wave per second — one slow breath rather than a flicker. */
const WAVE_HZ = 0.2;
/** Rows the field drifts upward per second. */
const DRIFT = 0.28;
const MAX_GLYPHS = 20;
/**
 * Rows per message. pin11 reads as a wave because it is one phrase over and
 * over — the eye follows a letter from row to row. A different message on
 * every row destroys that and the field turns into a word search, so each
 * message holds for a band of rows before the next one takes over.
 */
const BAND = 5;
/** Rows drawn past each edge so text enters and leaves mid-glyph. */
const OVERSCAN = 2;
/** Depth of the soft edge at the top and bottom of the field. */
const FADE = PITCH * 1.6;

/**
 * pin11 — one phrase set again and again, its tracking warped line by line
 * until the block bends into a wave.
 *
 * Here the phrase is not one phrase: every row is one of your own commit
 * messages, taken from across your whole history. Loading is the only moment
 * in the app with nothing to show, so it shows what you have already written.
 *
 * Two motions, both driven off the same clock: the wave travels across the
 * rows, and the whole block drifts upward so messages you have not seen keep
 * arriving from the bottom. Both are functions of elapsed seconds rather than
 * of frame count, so the speed holds steady when a frame is late — a timer
 * stepping a counter, which is what this used to be, visibly stutters.
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
  const seconds = useTicker();

  // The field arrives rather than appearing — a hard cut to a full page of
  // type is the one moment this screen looks like a crash.
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(enter, {
      duration: 520,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const source = lines.length > 0 ? lines : PLACEHOLDER;
  const visible = Math.max(1, Math.ceil((height - TOP - BOTTOM) / PITCH));
  const rows = visible + OVERSCAN * 2;

  const scroll = seconds * DRIFT;
  const shift = Math.floor(scroll);
  const frac = scroll - shift;
  const phase = seconds * WAVE_HZ;

  // Glyph strings are pure text work and change only when the pool does.
  const texts = useMemo(() => source.map(glyphs), [source]);

  return (
    <View style={styles.field}>
      <Animated.View style={{ opacity: enter }}>
        {/* The sub-row part of the drift is one transform on the stack
            rather than a fresh offset on every row. */}
        <View
          style={[styles.stack, { transform: [{ translateY: -frac * PITCH }] }]}
        >
          {Array.from({ length: rows }, (_, row) => {
            // Which line of the endless scroll this slot is showing.
            const line = row + shift - OVERSCAN;
            const text = texts[mod(Math.floor(line / BAND), texts.length)];
            const y = TOP + (row - OVERSCAN - frac) * PITCH;
            return (
              // One canvas per row rather than one for the whole field.
              // Inside a single <Svg>, react-native-svg shapes every row in
              // one pass, and at a full page of text in a downloaded font
              // that pass corrupts the heap: the app dies with a SIGSEGV
              // inside Fabric's mounting coordinator before it has drawn a
              // frame. Per-row canvases keep each pass small. Same picture.
              <Svg height={PITCH} key={row} width={width}>
                <SvgText
                  fill={colors.onBlack}
                  fontFamily={fonts.sansBold}
                  fontSize={FONT}
                  opacity={edgeFade(y, height)}
                  x={positions(text.length, width, phase + line * ROW_SLIP)}
                  y={FONT}
                >
                  {text}
                </SvgText>
              </Svg>
            );
          })}
        </View>
      </Animated.View>

      <View style={styles.caption}>
        <Label style={styles.captionText}>git huh</Label>
        <Label style={styles.captionText}>{caption}</Label>
      </View>
    </View>
  );
}

/**
 * Positive remainder. Negative lines exist — the field scrolls up, so the
 * slot above the top edge is line −1 — and `%` in JavaScript keeps the sign,
 * which would index off the front of the pool.
 */
function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/**
 * Rows soften out rather than clipping. The field drifts upward, so a line
 * fades up out of the caption at the bottom and dissolves under the status
 * bar at the top; a hard edge at either end turns the drift into a jump.
 */
function edgeFade(y: number, height: number): number {
  const leaving = (y - (TOP - FADE)) / FADE;
  const entering = (height - BOTTOM - y) / FADE;
  return Math.max(0, Math.min(1, leaving, entering));
}

/**
 * The glyphs of one line, upper case and clipped. Every glyph gets its own x
 * below, so a long message would squeeze the tracking flat and lose the wave.
 */
function glyphs(message: string): string {
  const upper = message.toUpperCase().trim();
  return upper.length > MAX_GLYPHS ? upper.slice(0, MAX_GLYPHS) : upper;
}

/**
 * Where each glyph of a row sits.
 *
 * Both ends are pinned to the margins and the letters between them are pushed
 * around by one cycle of a sine, so a row is bunched where the previous row is
 * spread. Slipping the phase row by row turns that into a wave travelling down
 * the block — which is the whole of pin11.
 */
function positions(count: number, width: number, phase: number): number[] {
  // The last glyph is drawn *from* its x, so the track stops a glyph short of
  // the right margin — otherwise wide rows run off the edge.
  const span = width - MARGIN * 2 - FONT * 0.72;
  if (count <= 1) return [MARGIN];

  const base = Math.sin(-2 * Math.PI * phase);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const warped =
      t +
      (AMPLITUDE / (2 * Math.PI)) *
        (Math.sin(2 * Math.PI * (t - phase)) - base);
    return MARGIN + warped * span;
  });
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

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.klein,
    flex: 1,
    justifyContent: 'flex-start',
  },
  stack: {
    // Puts the first visible row's baseline on TOP, with the overscan rows
    // sitting above the screen edge.
    marginTop: TOP - FONT - OVERSCAN * PITCH,
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
});
