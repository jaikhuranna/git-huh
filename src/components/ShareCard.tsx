import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

import { hourHistogram, type Activity } from '../lib/activity';
import { handleOf, insights, type GitHubModel } from '../lib/contributions';
import { quietRuns, wavePath } from '../lib/quiet';
import {
  compact,
  percent,
  recentYears,
  splitOf,
  topLanguages,
  type ShareKind,
} from '../lib/shareData';
import { PixelRain, seriesFor } from '../screens/PosterScreen';
import { colors, fonts, themed } from '../theme';
import { CrossField } from './CrossField';
import { Data, Label, Micro, Numeral, Serif } from './Type';
import { Wordmark } from './Wordmark';

/** The card's own size, in points. 4:3, and captured at 1600 × 1200. */
export const CARD_WIDTH = 640;
export const CARD_HEIGHT = 480;
const PAD = 34;
const INNER = CARD_WIDTH - PAD * 2;
/** What is left for the chart once the head, title and foot have theirs. */
const BODY = 272;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * One view of your year, recomposed as a 4:3 image for a timeline.
 *
 * Every card is the same frame — the wordmark and the handle across the top,
 * a serif title and one figure, the chart, and a line of fact with the date
 * along the foot — so a run of them posted over a year reads as one series.
 * The chart is drawn for this frame, not scaled down from the phone: see
 * `lib/shareData.ts` for the caps that keep any account inside it, and
 * `lib/quiet.ts` for the wave that bridges a silence here as everywhere else.
 */
export const ShareCard = forwardRef<
  View,
  { kind: ShareKind; model: GitHubModel; activity: Activity; year: number }
>(function ShareCard({ kind, model, activity, year }, ref) {
  const content = compose(kind, model, activity, year);
  const now = new Date();
  return (
    <View collapsable={false} ref={ref} style={[styles.card, content.flat && styles.flat]}>
      <View style={styles.top}>
        <Wordmark size={22} />
        <Label numberOfLines={1} style={styles.handle}>
          {handleOf(model)}
        </Label>
      </View>

      <View style={styles.titleRow}>
        <Serif numberOfLines={1} style={styles.title}>
          {content.title}
        </Serif>
        {content.figure ? (
          <View style={styles.figure}>
            <Numeral numberOfLines={1} style={styles.figureValue}>
              {content.figure.value}
            </Numeral>
            <Label style={styles.figureUnit}>{content.figure.unit}</Label>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>{content.body}</View>

      <View style={styles.foot}>
        <Label numberOfLines={1} style={styles.caption}>
          {content.caption}
        </Label>
        <Label style={styles.date}>
          {MONTHS[now.getMonth()]} {now.getFullYear()}
        </Label>
      </View>
    </View>
  );
});

interface Composed {
  title: string;
  figure?: { value: string; unit: string };
  body: ReactNode;
  caption: string;
  /** The poster's flat grey rather than the paper. */
  flat?: boolean;
}

function compose(kind: ShareKind, model: GitHubModel, activity: Activity, year: number): Composed {
  switch (kind) {
    case 'year':
      return yearCard(model);
    case 'weeks':
      return weeksCard(model, year);
    case 'split':
      return splitCard(model);
    case 'languages':
      return languagesCard(model);
    case 'years':
      return yearsCard(model);
    case 'hours':
      return hoursCard(activity);
  }
}

/** The contribution year as crosses, eleven rows deep so a whole year fits, and four figures. */
function yearCard(model: GitHubModel): Composed {
  const derived = insights(model);
  const days = model.columns.flat();
  const todayAt = days.findIndex((day) => day.isToday);
  const levels = (todayAt >= 0 ? days.slice(0, todayAt + 1) : days).map((day) => day.level);
  const stats = [
    { value: compact(derived.activeDays), label: 'active days' },
    { value: compact(derived.longestStreak), label: 'longest streak' },
    { value: compact(derived.bestDay), label: 'best day' },
    { value: derived.avgPerDay.toFixed(1), label: 'per day' },
  ];
  return {
    title: 'A year on github',
    figure: { value: compact(model.total), unit: 'contributions' },
    body: (
      <View style={styles.stack}>
        <View style={styles.stats}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.stat}>
              <Data numberOfLines={1} style={styles.statValue}>
                {stat.value}
              </Data>
              <Micro style={styles.statLabel}>{stat.label}</Micro>
            </View>
          ))}
        </View>
        <CrossField columnsHint={34} days={levels} height={172} rows={11} width={INNER} />
      </View>
    ),
    caption:
      model.total === 0
        ? 'nothing on the calendar yet'
        : `since ${model.since} · busiest on ${derived.busiestWeekday}s`,
  };
}

/** The poster, for one calendar year. */
function weeksCard(model: GitHubModel, year: number): Composed {
  const series = seriesFor(model, year);
  const total = series.values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(1, ...series.values);
  const peakMonth = MONTHS[series.months[series.values.indexOf(peak)] ?? 0];
  const height = BODY - 6;
  return {
    title: `${year}, ${series.unit} by ${series.unit}`,
    figure: { value: compact(total), unit: 'contributions' },
    body: (
      <Svg height={height} width={INNER}>
        <PixelRain height={height - 18} peak={peak} series={series} width={INNER} />
      </Svg>
    ),
    caption:
      total > 0
        ? `busiest ${series.unit} ${compact(peak)}, in ${peakMonth}`
        : `nothing recorded in ${year}`,
    flat: true,
  };
}

/** Where the year went: one ruled bar, and the legend with the figures. */
function splitCard(model: GitHubModel): Composed {
  const slices = splitOf(model.breakdown, {
    commits: colors.blue,
    pullRequests: colors.purple,
    reviews: colors.green,
    issues: colors.yellow,
    private: colors.ink40,
  });
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const gap = 3;
  const usable = INNER - gap * Math.max(0, slices.length - 1);
  let x = 0;
  return {
    title: 'Where the year went',
    figure: { value: compact(total), unit: 'contributions' },
    body:
      slices.length === 0 ? (
        <Empty text="nothing to split yet" />
      ) : (
        <View style={styles.stack}>
          <Svg height={46} width={INNER}>
            {slices.map((slice) => {
              const width = Math.max(3, slice.share * usable);
              const rect = (
                <Rect
                  fill={slice.color}
                  height={46}
                  key={slice.label}
                  rx={3}
                  width={width}
                  x={x}
                  y={0}
                />
              );
              x += width + gap;
              return rect;
            })}
          </Svg>
          <View style={styles.legend}>
            {slices.map((slice) => (
              <View key={slice.label} style={styles.legendRow}>
                <View style={[styles.swatch, { backgroundColor: slice.color }]} />
                <Data style={styles.legendLabel}>{slice.label}</Data>
                <Data style={styles.legendValue}>{compact(slice.value)}</Data>
                <Data style={styles.legendShare}>{percent(slice.share)}</Data>
              </View>
            ))}
          </View>
        </View>
      ),
    caption:
      model.breakdown.private > 0
        ? 'private is work in repositories the profile does not show'
        : `${compact(model.repoCount)} repositories · ${compact(model.stars)} stars`,
  };
}

/** The languages, as bars against the biggest. Six and an `other`. */
function languagesCard(model: GitHubModel): Composed {
  const slices = topLanguages(model.languages, 6, colors.ink20);
  const widest = Math.max(0.0001, ...slices.map((slice) => slice.share));
  return {
    title: 'What I write in',
    figure: { value: String(model.languages.length), unit: 'languages' },
    body:
      slices.length === 0 ? (
        <Empty text="no languages yet" />
      ) : (
        <View style={styles.bars}>
          {slices.map((slice) => (
            <View key={slice.label} style={styles.barRow}>
              <Data numberOfLines={1} style={styles.barName}>
                {slice.label}
              </Data>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: slice.color,
                      width: `${Math.max(1.5, (slice.share / widest) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Data style={styles.barShare}>{percent(slice.share)}</Data>
            </View>
          ))}
        </View>
      ),
    caption: `by bytes, across ${compact(model.repos.length)} repositories`,
  };
}

/** Every year as a column, a wave across any run of empty ones. */
function yearsCard(model: GitHubModel): Composed {
  const years = recentYears(model.years, 12);
  const peak = Math.max(1, ...years.map((year) => year.total));
  const peakIndex = years.findIndex((year) => year.total === peak);
  const total = model.years.reduce((sum, year) => sum + year.total, 0);
  const chart = BODY - 30;
  const pitch = INNER / Math.max(1, years.length);
  const bar = Math.min(34, pitch * 0.62);
  const base = chart - 1;
  const tallest = chart - 22;
  const silences = quietRuns(
    years.map((year) => year.total),
    2,
  );
  return {
    title: 'Every year on github',
    figure: { value: compact(total), unit: 'contributions' },
    body:
      years.length === 0 ? (
        <Empty text="no years on record yet" />
      ) : (
        <View>
          <Svg height={chart} width={INNER}>
            {years.map((year, index) =>
              year.total > 0 ? (
                <Rect
                  fill={index === peakIndex ? colors.ink : colors.ink40}
                  height={Math.max(3, (year.total / peak) * tallest)}
                  key={year.year}
                  rx={2}
                  width={bar}
                  x={index * pitch + (pitch - bar) / 2}
                  y={base - Math.max(3, (year.total / peak) * tallest)}
                />
              ) : null,
            )}
            {silences.map((run) => (
              <Path
                d={wavePath(run.start * pitch + pitch * 0.2, (run.end + 1) * pitch - pitch * 0.2, base - 5)}
                fill="none"
                key={run.start}
                opacity={0.5}
                stroke={colors.ink}
                strokeLinecap="round"
                strokeWidth={1.25}
              />
            ))}
            <SvgText
              fill={colors.ink}
              fontFamily={fonts.mono}
              fontSize={11}
              textAnchor="middle"
              x={peakIndex * pitch + pitch / 2}
              y={base - tallest - 6}
            >
              {compact(peak)}
            </SvgText>
          </Svg>
          <View style={styles.axis}>
            {years.map((year) => (
              <Micro key={year.year} numberOfLines={1} style={[styles.axisLabel, { width: pitch }]}>
                {years.length > 8 ? `’${String(year.year).slice(2)}` : year.year}
              </Micro>
            ))}
          </View>
        </View>
      ),
    caption:
      years.length < model.years.length
        ? `the last ${years.length} of ${model.years.length} years`
        : `since ${model.since}`,
  };
}

/** The day's hours, from the sampled commits. */
function hoursCard(activity: Activity): Composed {
  const hours = hourHistogram(activity.commits);
  const sampled = activity.commits.length;
  const peak = Math.max(1, ...hours);
  const peakHour = hours.indexOf(peak);
  const chart = BODY - 30;
  const pitch = INNER / 24;
  const bar = pitch * 0.6;
  const base = chart - 1;
  const tallest = chart - 22;
  const silences = quietRuns(hours, 4);
  return {
    title: 'When I commit',
    figure: sampled > 0 ? { value: `${String(peakHour).padStart(2, '0')}:00`, unit: 'busiest' } : undefined,
    body:
      sampled === 0 ? (
        <Empty text="no commit times in the sample yet" />
      ) : (
        <View>
          <Svg height={chart} width={INNER}>
            {hours.map((count, hour) =>
              count > 0 ? (
                <Rect
                  fill={hour === peakHour ? colors.ink : colors.ink40}
                  height={Math.max(3, (count / peak) * tallest)}
                  key={hour}
                  rx={2}
                  width={bar}
                  x={hour * pitch + (pitch - bar) / 2}
                  y={base - Math.max(3, (count / peak) * tallest)}
                />
              ) : null,
            )}
            {silences.map((run) => (
              <Path
                d={wavePath(run.start * pitch + pitch * 0.2, (run.end + 1) * pitch - pitch * 0.2, base - 5)}
                fill="none"
                key={run.start}
                opacity={0.5}
                stroke={colors.ink}
                strokeLinecap="round"
                strokeWidth={1.25}
              />
            ))}
            <SvgText
              fill={colors.ink}
              fontFamily={fonts.mono}
              fontSize={11}
              textAnchor="middle"
              x={peakHour * pitch + pitch / 2}
              y={base - tallest - 6}
            >
              {compact(peak)}
            </SvgText>
          </Svg>
          <View style={styles.axis}>
            {[0, 6, 12, 18].map((hour) => (
              <Micro
                key={hour}
                style={[styles.hourLabel, { left: hour * pitch }]}
              >
                {String(hour).padStart(2, '0')}:00
              </Micro>
            ))}
          </View>
        </View>
      ),
    caption: sampled > 0 ? `from ${compact(sampled)} recent commits, local time` : 'the sample reaches recent commits only',
  };
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Label>{text}</Label>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.canvas,
      height: CARD_HEIGHT,
      padding: PAD,
      width: CARD_WIDTH,
    },
    flat: {
      backgroundColor: colors.canvasFlat,
    },
    top: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 16,
      justifyContent: 'space-between',
    },
    handle: {
      color: colors.ink40,
      flexShrink: 1,
    },
    titleRow: {
      alignItems: 'flex-end',
      flexDirection: 'row',
      gap: 16,
      justifyContent: 'space-between',
      marginBottom: 14,
      marginTop: 14,
    },
    title: {
      flexShrink: 1,
      fontSize: 38,
      lineHeight: 44,
    },
    figure: {
      alignItems: 'flex-end',
    },
    figureValue: {
      fontSize: 40,
      lineHeight: 42,
    },
    figureUnit: {
      marginTop: -2,
    },
    body: {
      flex: 1,
      justifyContent: 'center',
      maxHeight: BODY,
      width: INNER,
    },
    foot: {
      alignItems: 'baseline',
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 16,
      justifyContent: 'space-between',
      marginTop: 'auto',
      paddingTop: 10,
    },
    caption: {
      color: colors.ink70,
      flexShrink: 1,
    },
    date: {
      color: colors.ink40,
    },
    stack: {
      gap: 22,
    },
    stats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    stat: {
      flex: 1,
      gap: 2,
    },
    statValue: {
      fontSize: 22,
      lineHeight: 26,
    },
    statLabel: {
      color: colors.ink40,
    },
    legend: {
      gap: 8,
    },
    legendRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
    },
    swatch: {
      borderRadius: 2,
      height: 12,
      width: 12,
    },
    legendLabel: {
      flex: 1,
    },
    legendValue: {
      textAlign: 'right',
      width: 90,
    },
    legendShare: {
      color: colors.ink40,
      textAlign: 'right',
      width: 50,
    },
    bars: {
      gap: 9,
      justifyContent: 'flex-end',
    },
    barRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      height: 24,
    },
    barName: {
      width: 132,
    },
    barTrack: {
      flex: 1,
      height: 14,
    },
    barFill: {
      borderRadius: 2,
      height: 14,
    },
    barShare: {
      color: colors.ink70,
      textAlign: 'right',
      width: 44,
    },
    axis: {
      flexDirection: 'row',
      height: 22,
      marginTop: 6,
    },
    axisLabel: {
      color: colors.ink40,
      textAlign: 'center',
    },
    hourLabel: {
      color: colors.ink40,
      position: 'absolute',
    },
    empty: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
  }),
);
