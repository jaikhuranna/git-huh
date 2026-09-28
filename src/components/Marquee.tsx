import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, themed } from '../theme';
import { Squiggle } from './Squiggle';

/** Plex Mono advances every glyph by 0.6 em, so a line's width is arithmetic. */
const ADVANCE = 0.6;
const WAVE = 46;
const GAP = 34;
const MAX_CHARS = 42;
const MAX_ITEMS = 10;

export interface MarqueeItem {
  /** Set in grey before the wave, as the widget sets the repository. */
  lead?: string;
  text: string;
}

/**
 * The widget's top strip, in the app: `repo ~~~ commit message`, one after
 * another, travelling left for as long as it is on screen.
 *
 * It runs on the native driver and nothing else. Every width is known before
 * the first frame — Plex Mono is monospaced, so a line is its length times
 * 0.6 em — which means no `onLayout` (dropped on a freshly mounted root in a
 * release build, see `LoadingScreen`) and no measuring pass: the sequence is
 * drawn twice, side by side, and one looping value slides it exactly one
 * sequence to the left, where the second copy lands on the pixels the first
 * one started from.
 */
export function Marquee({
  items,
  size = 15,
  speed = 26,
  active = true,
  style,
}: {
  items: readonly MarqueeItem[];
  size?: number;
  /** Points per second. */
  speed?: number;
  /** Parked while off screen: only what is being looked at burns frames. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [x] = useState(() => new Animated.Value(0));

  const { pieces, width } = useMemo(() => {
    const char = size * ADVANCE;
    const pieces: { key: string; text: string; lead: string; x: number }[] = [];
    let at = 0;
    for (const [index, item] of items.slice(0, MAX_ITEMS).entries()) {
      const text = clip(item.text);
      const lead = item.lead ? clip(item.lead) : '';
      pieces.push({ key: `${index}`, text, lead, x: at });
      at += (lead ? lead.length * char + 10 + WAVE + 10 : 0) + text.length * char + GAP;
    }
    return { pieces, width: at };
  }, [items, size]);

  useEffect(() => {
    if (!active || width <= 0) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, {
        duration: (width / speed) * 1000,
        easing: Easing.linear,
        toValue: -width,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, speed, width, x]);

  const height = Math.ceil(size * 1.5);
  const line = { fontSize: size, lineHeight: height };

  return (
    <View style={[styles.frame, { height }, style]}>
      <Animated.View style={[styles.track, { width: width * 2, transform: [{ translateX: x }] }]}>
        {[0, width].map((offset) =>
          pieces.map((piece) => (
            <View
              key={`${offset}-${piece.key}`}
              style={[styles.piece, { height, left: offset + piece.x }]}
            >
              {piece.lead ? (
                <>
                  <Text numberOfLines={1} style={[styles.lead, line]}>
                    {piece.lead}
                  </Text>
                  <Squiggle
                    amplitude={size * 0.2}
                    color={colors.ink40}
                    length={WAVE}
                    opacity={1}
                    strokeWidth={1.6}
                    style={styles.wave}
                    wavelength={WAVE / 2.6}
                  />
                </>
              ) : null}
              <Text numberOfLines={1} style={[styles.text, line]}>
                {piece.text}
              </Text>
            </View>
          )),
        )}
      </Animated.View>
    </View>
  );
}

function clip(value: string): string {
  const line = value.trim().split('\n')[0];
  return line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1)}…` : line;
}

const styles = themed(() =>
  StyleSheet.create({
    frame: {
      overflow: 'hidden',
    },
    track: {
      height: '100%',
    },
    piece: {
      alignItems: 'center',
      flexDirection: 'row',
      position: 'absolute',
      top: 0,
    },
    lead: {
      color: colors.ink40,
      fontFamily: fonts.mono,
      includeFontPadding: false,
    },
    wave: {
      marginHorizontal: 10,
    },
    text: {
      color: colors.ink,
      fontFamily: fonts.mono,
      includeFontPadding: false,
    },
  }),
);
