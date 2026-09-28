import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card } from '../components/Card';
import { dot } from '../components/DotField';
import { DotRow } from '../components/DotRow';
import { Data, Label, Micro } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import { colors, levels, space, themed } from '../theme';
import { fmt, Page } from './shared';

/**
 * Today, at a glance, on the widget's cards: today's count lit up in the
 * widget's own dots, the week and the last thirty days as rows of them, and
 * the languages you write most.
 */
export function NowScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const derived = insights(model);
  const inner = width - space.gutter * 2 - space.card * 2;
  const half = (width - space.gutter * 2 - 10) / 2 - space.card * 2;

  const days = model.columns.flat();
  const todayAt = days.findIndex((day) => day.isToday);
  const upTo = todayAt >= 0 ? days.slice(0, todayAt + 1) : days;
  const week = upTo.slice(-7);
  const month = upTo.slice(-30);

  return (
    <Page>
      <Card
        figure={`yesterday ${fmt(derived.yesterdayCount)} · best ${fmt(derived.bestDay)}`}
        title="today"
      >
        <Numerals count={model.todayCount} width={inner} />
      </Card>

      <View style={styles.row}>
        <Card style={styles.half} title="this week">
          <DotRow
            height={26}
            labels={week.map((day) => WEEKDAY_INITIALS[new Date(`${day.date}T00:00:00`).getDay()])}
            today={week.length - 1}
            values={week.map((day) => day.count)}
            width={half}
          />
          <Micro style={styles.foot}>
            {fmt(week.reduce((sum, day) => sum + day.count, 0))} in seven days
          </Micro>
        </Card>

        <Card style={styles.half} title="languages">
          {model.languages.slice(0, 4).map((language) => (
            <View key={language.name} style={styles.language}>
              <Data numberOfLines={1} style={styles.languageName}>
                {language.name.toLowerCase()}
              </Data>
              <Micro style={styles.share}>{Math.round(language.share * 100)}%</Micro>
            </View>
          ))}
          {model.languages.length === 0 && <Micro>no languages yet</Micro>}
        </Card>
      </View>

      <Card figure={`${fmt(month.reduce((sum, day) => sum + day.count, 0))}`} title="last 30 days">
        <DotRow
          height={24}
          quiet={7}
          today={month.length - 1}
          values={month.map((day) => day.count)}
          width={inner}
        />
      </Card>
    </Page>
  );
}

const WEEKDAY_INITIALS = ['s', 'm', 't', 'w', 't', 'f', 's'] as const;

/** 5 × 7 digits — only the digits, which is all the readout ever shows. */
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

/**
 * Today's count set in the widget's dots: lit cells are full peak dots, the
 * rest the grid's ghost, so the number is drawn *in* the field rather than on
 * top of it. Two paths, however many cells.
 */
function Numerals({ count, width }: { count: number; width: number }) {
  const digits = String(count).split('');
  const rows = 11;
  const glyph = 6; // five columns and one of tracking
  const cols = Math.max(digits.length * glyph + 3, Math.floor(width / 14));
  const pitch = width / cols;
  const originCol = Math.floor((cols - (digits.length * glyph - 1)) / 2);
  const originRow = 2;

  const lit = new Set<string>();
  digits.forEach((digit, index) => {
    (GLYPHS[digit] ?? GLYPHS['0']).forEach((bits, r) => {
      [...bits].forEach((bit, c) => {
        if (bit === '1') lit.add(`${originCol + index * glyph + c},${originRow + r}`);
      });
    });
  });

  let on = '';
  let off = '';
  const cell = pitch * 0.7;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * pitch + pitch / 2;
      const cy = r * pitch + pitch / 2;
      if (lit.has(`${c},${r}`)) on += dot(cx, cy, cell * levels.scale[3], false);
      else off += dot(cx, cy, cell * levels.scale[0], false);
    }
  }

  return (
    <View style={styles.numerals}>
      <Svg height={rows * pitch} width={cols * pitch}>
        <Path d={off} fill={colors.ink} opacity={levels.alpha[0] * 0.55} />
        <Path d={on} fill={colors.ink} />
      </Svg>
      <Label style={styles.numeralsCaption}>
        {count === 1 ? 'contribution' : 'contributions'} so far today
      </Label>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    numerals: {
      alignItems: 'center',
      gap: 6,
    },
    numeralsCaption: {
      color: colors.ink40,
    },
    row: {
      flexDirection: 'row',
      gap: 10,
    },
    half: {
      flex: 1,
    },
    foot: {
      color: colors.ink40,
      marginTop: 8,
    },
    language: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 3,
    },
    languageName: {
      color: colors.ink,
      flex: 1,
    },
    share: {
      color: colors.ink40,
    },
  }),
);
