import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';


/**
 * The Nothing-card corner glyph: a 2x2 grid of geometric primitives
 * (quarter circle, dot pair, half circle, full circle), like the
 * decoration on the reference dot cards. Pure Views, no SVG dependency.
 */
export function Glyph({ size = 44 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}
    >
      {/* quarter circle */}
      <View
        style={{
          width: size / 2,
          height: size / 2,
          backgroundColor: colors.text.primary,
          borderBottomRightRadius: size / 2,
        }}
      />
      {/* dot pair */}
      <View style={styles.cell}>
        <View style={dot(size / 8, colors.text.primary)} />
        <View style={dot(size / 8, colors.text.primary)} />
      </View>
      {/* half circle */}
      <View
        style={{
          width: size / 2,
          height: size / 2,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            width: size / 2,
            height: size / 4,
            backgroundColor: colors.text.primary,
            borderTopLeftRadius: size / 4,
            borderTopRightRadius: size / 4,
          }}
        />
      </View>
      {/* full circle */}
      <View style={styles.cell}>
        <View
          style={{
            width: size / 3,
            height: size / 3,
            borderRadius: size / 3,
            backgroundColor: colors.text.primary,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: '50%',
    height: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
});

const dot = (size: number, color: string) => ({
  width: size,
  height: size,
  borderRadius: size / 2,
  backgroundColor: color,
});
