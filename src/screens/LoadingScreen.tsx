import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

import { Label } from '../components/Type';
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
const FRAME_MS = 60;
const MAX_GLYPHS = 20;
/**
 * Rows per message. pin11 reads as a wave because it is one phrase over and
 * over — the eye follows a letter from row to row. A different message on
 * every row destroys that and the field turns into a word search, so each
 * message holds for a band of rows before the next one takes over.
 */
const BAND = 5;

/**
 * pin11 — one phrase set again and again, its tracking warped line by line
 * until the block bends into a wave.
 *
 * Here the phrase is not one phrase: every row is one of your own commit
 * messages, taken from across your whole history. Loading is the only moment
 * in the app with nothing to show, so it shows what you have already written.
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
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setPhase((value) => (value + 0.012) % 1),
      FRAME_MS,
    );
    return () => clearInterval(timer);
  }, []);

  const source = lines.length > 0 ? lines : FALLBACK;
  const rows = Math.max(1, Math.floor((height - TOP - BOTTOM) / PITCH));

  return (
    <View style={styles.field}>
      <Svg height={height} width={width}>
        {Array.from({ length: rows }, (_, row) => {
          const text = glyphs(source[Math.floor(row / BAND) % source.length]);
          return (
            <SvgText
              fill={colors.onBlack}
              fontFamily={fonts.sansBold}
              fontSize={FONT}
              key={row}
              x={positions(text.length, width, phase + row * ROW_SLIP)}
              y={TOP + row * PITCH}
            >
              {text}
            </SvgText>
          );
        })}
      </Svg>

      <View style={styles.caption}>
        <Label style={styles.captionText}>git huh</Label>
        <Label style={styles.captionText}>{caption}</Label>
      </View>
    </View>
  );
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
 * First launch, or a token with no readable history: the app falls back to
 * the pin's own trick and repeats one phrase.
 */
const FALLBACK = [
  'GIT HUH',
  'READING YOUR YEAR',
  'GIT HUH',
  'COMMITS PULLS REVIEWS',
  'GIT HUH',
  'ONE MOMENT',
];

const styles = StyleSheet.create({
  field: {
    backgroundColor: colors.klein,
    flex: 1,
    justifyContent: 'flex-start',
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
