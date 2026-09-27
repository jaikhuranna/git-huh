import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, themed } from '../theme';
import { Label } from './Type';

/**
 * An account's picture, in a circle, over its initial. GitHub serves every
 * login's picture at `github.com/<login>.png` without a request of our own;
 * offline, or for a login that has none, the initial is what shows.
 */
export function Avatar({
  login,
  size = 26,
  style,
}: {
  login: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={[
        styles.circle,
        { borderRadius: size / 2, height: size, width: size },
        style,
      ]}
    >
      <Label style={[styles.initial, { fontSize: size * 0.42, lineHeight: size }]}>
        {login.charAt(0).toLowerCase()}
      </Label>
      {!failed && (
        <Image
          onError={() => setFailed(true)}
          source={{ uri: `https://github.com/${login}.png?size=${Math.round(size * 3)}` }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
        />
      )}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    circle: {
      alignItems: 'center',
      backgroundColor: colors.recess,
      // A border as well as a fill: see the corner-radius trap in CLAUDE.md.
      borderColor: colors.hair,
      borderWidth: 1,
      justifyContent: 'center',
      overflow: 'hidden',
    },
    initial: {
      color: colors.ink70,
      fontFamily: fonts.monoMedium,
      letterSpacing: 0,
      textAlign: 'center',
    },
  }),
);
