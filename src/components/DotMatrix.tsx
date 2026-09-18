import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '../theme';


interface DotMatrixProps {
  /** Week columns, 7 days each, column-major like GitHub's graph. */
  columns: { level: number; isToday: boolean }[][];
  /** Cell width available for the grid, in px. */
  width: number;
  /** Gap between cells, in px. */
  gap?: number;
  /** Stagger the column entrance, in ms per column. */
  stagger?: boolean;
  style?: ViewStyle;
}

/**
 * The contribution matrix, Nothing-card style: intensity drives both dot
 * SIZE (small seed → full cell) and brightness; the peak shape squares off
 * like the reference cards. Today is the single red cell.
 */
export function DotMatrix({
  columns,
  width,
  gap = 4,
  stagger = true,
  style,
}: DotMatrixProps) {
  const cell = Math.min(
    18,
    Math.max(
      6,
      Math.floor(
        (width - gap * (columns.length - 1)) / Math.max(columns.length, 1),
      ),
    ),
  );

  return (
    <View style={[styles.row, { gap }, style]}>
      {columns.map((column, col) => (
        <DotColumn key={col} index={col} cell={cell} gap={gap} stagger={stagger}>
          {column.map((day, row) => (
            <DotCell key={row} cell={cell} day={day} />
          ))}
        </DotColumn>
      ))}
    </View>
  );
}

function DotColumn({
  index,
  cell,
  gap,
  stagger,
  children,
}: {
  index: number;
  cell: number;
  gap: number;
  stagger: boolean;
  children: React.ReactNode;
}) {
  const [progress] = useState(() => new Animated.Value(stagger ? 0 : 1));

  useEffect(() => {
    if (!stagger) return;
    Animated.timing(progress, {
      toValue: 1,
      delay: index * 16,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, index, stagger]);

  return (
    <Animated.View
      style={[
        styles.column,
        { gap, width: cell, opacity: stagger ? progress : 1 },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function DotCell({
  cell,
  day,
}: {
  cell: number;
  day: { level: number; isToday: boolean };
}) {
  if (day.isToday) {
    return (
      <View style={styles.cell}>
        <View
          style={{
            width: cell,
            height: cell,
            borderRadius: 2,
            backgroundColor: colors.accent,
          }}
        />
      </View>
    );
  }

  const scale = colors.dotScale[day.level];
  const alpha = colors.dotAlpha[day.level];
  const size = Math.max(2, Math.round(cell * scale));
  const peak = day.level >= 4;

  return (
    <View style={styles.cell}>
      <View
        style={{
          width: size,
          height: size,
          // Peak days square off, like the reference cards; the rest stay
          // circles of growing diameter.
          borderRadius: peak ? 2 : size / 2,
          backgroundColor: `rgba(255,255,255,${alpha})`,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  column: {
    gap: 4,
    height: '100%',
    justifyContent: 'center',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    aspectRatio: 1,
    width: '100%',
  },
});
