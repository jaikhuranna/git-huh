import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Rect } from 'react-native-svg';

import { LanguageChip } from '../components/LanguageChip';
import { Label, Title } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import { colors, radii } from '../theme';
import { fmt, Page } from './shared';

/**
 * pin02 — Ai OS. The one screen that is allowed a dot matrix, because the pin
 * itself is built on one: an LED readout of today sitting on a dotted field,
 * a dial for the week, and a dock of pastel circles for the languages.
 */
export function NowScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const derived = insights(model);
  const inner = width - 40;

  return (
    <Page background={colors.canvasCool}>
      <Title>Today</Title>
      <Title style={styles.subTitle}>at a glance</Title>

      <View style={styles.hero}>
        <LedField count={model.todayCount} width={inner} />
        <Label style={styles.heroCaption}>
          yesterday {fmt(derived.yesterdayCount)} · best {fmt(derived.bestDay)}
        </Label>
      </View>

      <View style={styles.row}>
        <WeekDial model={model} peak={derived.peakWeekday} size={(inner - 12) / 2} />
        <Dock model={model} size={(inner - 12) / 2} />
      </View>

      <Ruler model={model} width={inner} />
    </Page>
  );
}

/** 5x7 segment font — only the digits, which is all the readout ever shows. */
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

function LedField({ count, width }: { count: number; width: number }) {
  const digits = String(count).split('');
  const height = 188;
  const pitch = 8;
  const dot = 2;

  // The unlit field runs edge to edge; the glyphs are lit cells inside it.
  const cols = Math.floor(width / pitch);
  const rows = Math.floor(height / pitch);

  const glyphWidth = 6; // 5 columns + 1 of tracking
  const scale = Math.min(4, Math.floor((cols - 2) / (digits.length * glyphWidth)));
  const litWidth = digits.length * glyphWidth * scale;
  const originCol = Math.floor((cols - litWidth) / 2);
  const originRow = Math.floor((rows - 7 * scale) / 2);

  const lit = new Set<string>();
  digits.forEach((digit, index) => {
    const rowsOf = GLYPHS[digit] ?? GLYPHS['0'];
    rowsOf.forEach((bits, r) => {
      [...bits].forEach((bit, c) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            lit.add(
              `${originCol + index * glyphWidth * scale + c * scale + dx},${
                originRow + r * scale + dy
              }`,
            );
          }
        }
      });
    });
  });

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const on = lit.has(`${c},${r}`);
      cells.push(
        <Circle
          cx={c * pitch + pitch / 2}
          cy={r * pitch + pitch / 2}
          fill={colors.ink}
          key={`${c}-${r}`}
          opacity={on ? 1 : 0.12}
          r={on ? dot * 1.6 : dot * 0.6}
        />,
      );
    }
  }

  return (
    <Svg height={rows * pitch} width={cols * pitch}>
      {cells}
    </Svg>
  );
}

/** The pin's analog dial, re-read as this week: one rim tick per weekday. */
function WeekDial({
  model,
  peak,
  size,
}: {
  model: GitHubModel;
  peak: number;
  size: number;
}) {
  // Leave room for the caption underneath rather than overlaying it.
  const dial = size - TILE_PADDING * 2 - CAPTION_ROW - 6;
  const r = dial / 2;
  const week = model.columns[model.columns.length - 1] ?? [];
  const todayIndex = Math.max(0, week.findIndex((day) => day.isToday));
  const angle = (todayIndex / 7) * Math.PI * 2 - Math.PI / 2;

  return (
    <View style={[styles.tile, { height: size, width: size }]}>
      <Svg height={dial} width={dial}>
        <Circle cx={r} cy={r} fill={colors.card} r={r - 1} />
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const outer = r - 7;
          const inner = outer - 2.5;
          return (
            <Circle
              cx={r + Math.cos(a) * inner}
              cy={r + Math.sin(a) * inner}
              fill={colors.ink}
              key={i}
              opacity={0.28}
              r={0.8}
            />
          );
        })}
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
          const outer = r - 4;
          const inner = r - 13;
          const isPeak = i === peak;
          return (
            <Line
              key={i}
              stroke={isPeak ? colors.red : colors.ink}
              strokeLinecap="round"
              strokeWidth={isPeak ? 2.4 : 1.6}
              x1={r + Math.cos(a) * inner}
              x2={r + Math.cos(a) * outer}
              y1={r + Math.sin(a) * inner}
              y2={r + Math.sin(a) * outer}
            />
          );
        })}
        <Circle cx={r} cy={r} fill={colors.black} r={r * 0.42} />
        <Line
          stroke={colors.onBlack}
          strokeLinecap="round"
          strokeWidth={2}
          x1={r}
          x2={r + Math.cos(angle) * r * 0.34}
          y1={r}
          y2={r + Math.sin(angle) * r * 0.34}
        />
      </Svg>
      <Label style={styles.caption}>this week</Label>
    </View>
  );
}

/** The pin's app dock, re-read as the four languages you write most. */
const TILE_PADDING = 10;
const DOCK_GAP = 8;
const CAPTION_ROW = 20;

function Dock({ model, size }: { model: GitHubModel; size: number }) {
  const top = model.languages.slice(0, 4);
  const inner = size - TILE_PADDING * 2;
  // Floor, then take a couple of pixels back, so rounding can never make the
  // two-up row wider than the box that holds it.
  const cell = Math.max(
    22,
    Math.floor((Math.min(inner, inner - CAPTION_ROW) - DOCK_GAP) / 2) - 2,
  );

  return (
    <View style={[styles.tile, { height: size, width: size }]}>
      <View style={[styles.dockGrid, { width: inner }]}>
        {top.map((language) => (
          <LanguageChip
            color={language.color}
            key={language.name}
            name={language.name}
            size={cell}
          />
        ))}
      </View>
      {top.length === 0 && <Label>no languages yet</Label>}
      <Label style={styles.caption}>top languages</Label>
    </View>
  );
}

/** The pin's black ruler strip: the last thirty days as tick heights. */
function Ruler({ model, width }: { model: GitHubModel; width: number }) {
  const days = model.columns.flat().slice(-30);
  const height = 62;
  const step = width / days.length;
  const peak = Math.max(1, ...days.map((day) => day.count));

  return (
    <View style={styles.ruler}>
      <Svg height={height} width={width}>
        <Rect fill={colors.black} height={height} rx={radii.tile} width={width} />
        {days.map((day, index) => {
          const tick = 8 + (day.count / peak) * 32;
          const x = index * step + step / 2;
          return (
            <Line
              key={day.date}
              stroke={day.isToday ? colors.red : colors.onBlack}
              strokeWidth={day.isToday ? 2 : 1}
              x1={x}
              x2={x}
              y1={height - 14}
              y2={height - 14 - tick}
            />
          );
        })}
      </Svg>
      <Label style={styles.rulerLabel}>last 30 days</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  subTitle: {
    color: colors.ink40,
    marginTop: -2,
  },
  hero: {
    alignItems: 'center',
    marginTop: 18,
  },
  heroCaption: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  tile: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: TILE_PADDING,
  },
  caption: {
    height: CAPTION_ROW,
    lineHeight: CAPTION_ROW,
    textAlign: 'center',
  },
  dockGrid: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: DOCK_GAP,
    justifyContent: 'center',
  },
  ruler: {
    alignItems: 'center',
    marginTop: 22,
  },
  rulerLabel: {
    marginTop: 8,
  },
});
