import { Fragment } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';

import { Label } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import { colors, fonts, themed } from '../theme';
import { fmt, hash, Page, ScreenHead } from './shared';

/**
 * pin01 — the connect-the-dots puzzle. Every active day is a disc sized by
 * its commit count and captioned with it; the longest streak is drawn as a
 * numbered path running 1..N through the calendar, so the year becomes a
 * puzzle you can actually solve.
 */
export function DotsScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const derived = insights(model);
  const days = model.columns.flat();

  const chartWidth = width - 40;
  const chartHeight = 440;
  const cols = model.columns.length || 1;
  const stepX = chartWidth / cols;
  const stepY = chartHeight / 7;

  const { startIndex, endIndex } = derived.longestStreakRange;

  const point = (index: number) => {
    const col = Math.floor(index / 7);
    const row = index % 7;
    // A little stable jitter so the field scatters like the pin's, rather
    // than betraying the grid underneath it.
    const seed = hash(`${index}`);
    const jx = ((seed % 100) / 100 - 0.5) * stepX * 0.5;
    const jy = (((seed >> 8) % 100) / 100 - 0.5) * stepY * 0.45;
    return {
      x: col * stepX + stepX / 2 + jx,
      y: row * stepY + stepY / 2 + jy,
    };
  };

  const streak: string[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const { x, y } = point(i);
    streak.push(`${x},${y}`);
  }

  return (
    <Page>
      <ScreenHead
        left="join the dots"
        right={`streak ${fmt(derived.longestStreak)}`}
      />

      <Svg height={chartHeight} width={chartWidth}>
        {/* The puzzle path first, so discs sit on top of it. */}
        {streak.length > 1 && (
          <Polyline
            fill="none"
            points={streak.join(' ')}
            stroke={colors.ink}
            strokeWidth={1}
          />
        )}

        {days.map((day, index) => {
          const { x, y } = point(index);
          const inStreak = index >= startIndex && index <= endIndex;

          if (day.level === 0) {
            return (
              <Circle
                cx={x}
                cy={y}
                fill={colors.ink}
                key={day.date}
                opacity={0.2}
                r={1.5}
              />
            );
          }

          const r = 3 + day.level;
          return (
            <Fragment key={day.date}>
              <Circle cx={x} cy={y} fill={colors.ink} r={r} />
              {inStreak ? (
                // Streak days are numbered inside the disc, like a puzzle.
                <SvgText
                  fill={colors.onBlack}
                  fontFamily={fonts.mono}
                  fontSize={6}
                  textAnchor="middle"
                  x={x}
                  y={y + 2.2}
                >
                  {index - startIndex + 1}
                </SvgText>
              ) : (
                <SvgText
                  fill={colors.ink70}
                  fontFamily={fonts.mono}
                  fontSize={6}
                  x={x + r + 1.5}
                  y={y + 2}
                >
                  {day.count}
                </SvgText>
              )}
            </Fragment>
          );
        })}
      </Svg>

      <View style={styles.footer}>
        <Label>
          {fmt(model.total)} contributions · best day {fmt(derived.bestDay)} ·{' '}
          {fmt(derived.activeDays)} active days
        </Label>
      </View>
    </Page>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    footer: {
      marginTop: 14,
    },
  }),
);
