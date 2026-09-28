import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Card } from '../components/Card';
import { Label } from '../components/Type';
import type { GitHubModel, YearSummary } from '../lib/contributions';
import { howLongMonths, quietRuns, wavePath } from '../lib/quiet';
import { colors, fonts, themed } from '../theme';
import { fmt, Page, ScreenHead } from './shared';

const ROW_HEIGHT = 44;

/**
 * Every year as a row of the widget's dots, one per month, sized and
 * weighted by that month's volume, a single vertical line carrying today's date back
 * through every year, and paired before/after bars down the right. Three
 * months or more without a circle is bridged with the app's wave, so a quiet
 * season reads as one stretch rather than as circles that failed to draw.
 */
export function ArchiveScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 36 - 36;

  // The pin runs oldest at the top, newest at the bottom.
  const years = [...model.years].sort((a, b) => a.year - b.year);
  const monthsWidth = chartWidth * 0.56;
  const barsX = chartWidth * 0.62;
  const barsWidth = chartWidth - barsX;

  const peakMonth = Math.max(
    1,
    ...years.flatMap((year) => year.months),
  );
  const peakSplit = Math.max(
    1,
    ...years.map((year) => Math.max(year.beforeToday, year.afterToday)),
  );

  // Top three years get the saturated treatment the pin gives its wettest.
  const ranked = [...years].sort((a, b) => b.total - a.total);
  const highlighted = new Set(ranked.slice(0, 3).map((year) => year.year));

  const now = new Date();
  const todayX = 28 + ((now.getMonth() + now.getDate() / 31) / 12) * (monthsWidth - 34);
  const chartHeight = years.length * ROW_HEIGHT + 12;

  return (
    <Page>
      <ScreenHead left="every year" right={`${years.length} on record`} />

      <Card>
      <View style={styles.heads}>
        <Label style={styles.headYear}>year</Label>
        <Label style={styles.headToday}>today</Label>
        <Label numberOfLines={1} style={styles.headSplit}>
          before · after
        </Label>
      </View>

      <Svg height={chartHeight} width={chartWidth}>
        {/* Today, carried across every year — the pin's centre line. */}
        <Line
          stroke={colors.ink}
          strokeWidth={0.75}
          x1={todayX}
          x2={todayX}
          y1={0}
          y2={years.length * ROW_HEIGHT}
        />

        {years.map((year, index) => (
          <Row
            barsWidth={barsWidth}
            barsX={barsX}
            highlighted={highlighted.has(year.year)}
            key={year.year}
            monthsWidth={monthsWidth}
            peakMonth={peakMonth}
            peakSplit={peakSplit}
            y={index * ROW_HEIGHT}
            year={year}
          />
        ))}
      </Svg>
      </Card>
    </Page>
  );
}

function Row({
  year,
  y,
  monthsWidth,
  barsX,
  barsWidth,
  peakMonth,
  peakSplit,
  highlighted,
}: {
  year: YearSummary;
  y: number;
  monthsWidth: number;
  barsX: number;
  barsWidth: number;
  peakMonth: number;
  peakSplit: number;
  highlighted: boolean;
}) {
  const mid = y + ROW_HEIGHT / 2;
  const median = [...year.months].sort((a, b) => a - b)[6] ?? 0;
  const step = (monthsWidth - 34) / 12;

  const now = new Date();
  const until = year.year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const silences = year.year > now.getFullYear() ? [] : quietRuns(year.months, 3, until);

  const beforeW = (year.beforeToday / peakSplit) * (barsWidth * 0.46);
  const afterW = (year.afterToday / peakSplit) * (barsWidth * 0.46);

  return (
    <>
      <Line
        opacity={0.5}
        stroke={colors.hair}
        strokeWidth={1}
        x1={0}
        x2={barsX + barsWidth}
        y1={y + ROW_HEIGHT}
        y2={y + ROW_HEIGHT}
      />

      <SvgText
        fill={colors.ink70}
        fontFamily={fonts.mono}
        fontSize={10}
        x={0}
        y={mid + 3}
      >
        {year.year}
      </SvgText>

      {year.months.map((value, month) => {
        if (value === 0) return null;
        const r = 1.8 + (value / peakMonth) * Math.min(9, step * 0.48);
        // Quiet months take the pin's olive; busy ones its saturated blue.
        const quiet = value < median;
        return (
          <Circle
            cx={28 + month * step + step / 2}
            cy={mid}
            fill={colors.ink}
            key={month}
            opacity={quiet ? 0.3 : 0.45 + (value / peakMonth) * 0.55}
            r={r}
          />
        );
      })}

      {silences.map((run) => {
        const x1 = 28 + run.start * step + step * 0.3;
        const x2 = 28 + (run.end + 1) * step - step * 0.3;
        return (
          <Path
            d={wavePath(x1, x2, mid, 2, 9)}
            fill="none"
            key={`w${run.start}`}
            opacity={0.45}
            stroke={colors.ink}
            strokeLinecap="round"
            strokeWidth={1.1}
          />
        );
      })}
      {silences.map((run) =>
        (run.end - run.start + 1) * step >= 34 ? (
          <SvgText
            fill={colors.ink70}
            fontFamily={fonts.mono}
            fontSize={7}
            key={`t${run.start}`}
            textAnchor="middle"
            x={28 + ((run.start + run.end + 1) / 2) * step}
            y={mid - 7}
          >
            {howLongMonths(run.end - run.start + 1)}
          </SvgText>
        ) : null,
      )}

      <Rect
        fill={colors.ink}
        height={9}
        opacity={highlighted ? 1 : 0.55}
        rx={4.5}
        width={Math.max(beforeW, 2)}
        x={barsX + barsWidth * 0.46 - Math.max(beforeW, 2)}
        y={mid - 4.5}
      />
      <Rect
        fill={colors.ink}
        height={9}
        opacity={0.26}
        rx={4.5}
        width={Math.max(afterW, 2)}
        x={barsX + barsWidth * 0.5}
        y={mid - 4.5}
      />
      <SvgText
        fill={colors.ink70}
        fontFamily={fonts.mono}
        fontSize={8}
        textAnchor="end"
        x={barsX + barsWidth * 0.46 - Math.max(beforeW, 2) - 3}
        y={mid + 3}
      >
        {fmt(year.beforeToday)}
      </SvgText>
      <SvgText
        fill={colors.ink70}
        fontFamily={fonts.mono}
        fontSize={8}
        x={barsX + barsWidth * 0.5 + Math.max(afterW, 2) + 3}
        y={mid + 3}
      >
        {fmt(year.afterToday)}
      </SvgText>
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    heads: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 8,
    },
    headYear: {
      color: colors.ink40,
    },
    headToday: {
      color: colors.ink40,
    },
    headSplit: {
      color: colors.ink40,
      flexShrink: 0,
      paddingRight: 2,
    },
  }),
);
