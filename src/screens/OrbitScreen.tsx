import type { ReactElement } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { LanguageChip } from '../components/LanguageChip';
import { Data, Label } from '../components/Type';
import type { GitHubModel, LanguageShare } from '../lib/contributions';
import { languageMark } from '../lib/languageMarks';
import { colors, fonts } from '../theme';
import { onColor, Page, ScreenHead } from './shared';

/**
 * pin06 — letters strung along concentric arcs, a handful of them lifted out
 * into filled colour chips. The letters are your languages; the chip colour
 * is GitHub's own colour for that language, and the ring is its rank.
 */
export function OrbitScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 360);
  const languages = model.languages.slice(0, 14);

  return (
    <Page>
      <ScreenHead left="languages" right={`${model.languages.length} in play`} />

      <View style={styles.stage}>
        <Svg height={size} width={size}>
          <Arcs languages={languages} size={size} />
        </Svg>
      </View>

      <View style={styles.legend}>
        {model.languages.slice(0, 8).map((language) => (
          <View key={language.name} style={styles.legendRow}>
            <LanguageChip
              color={language.color}
              name={language.name}
              size={20}
            />
            <Data style={styles.legendName}>{language.name}</Data>
            <Data style={styles.legendShare}>
              {(language.share * 100).toFixed(1)}%
            </Data>
          </View>
        ))}
        {model.languages.length === 0 && (
          <Label>no language data on these repos</Label>
        )}
      </View>
    </Page>
  );
}

/** Three broken rings, walked outward as rank falls — the pin's spiral. */
function Arcs({ languages, size }: { languages: LanguageShare[]; size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const rings = [size * 0.15, size * 0.30, size * 0.45];

  const nodes: ReactElement[] = [];
  const arcs: ReactElement[] = [];

  rings.forEach((radius, ringIndex) => {
    // Each ring is an open arc, not a closed circle.
    const start = -120 + ringIndex * 28;
    const sweep = 250;
    arcs.push(
      <Path
        d={arcPath(cx, cy, radius, start, start + sweep)}
        fill="none"
        key={`ring-${ringIndex}`}
        opacity={0.35}
        stroke={colors.ink}
        strokeWidth={1}
      />,
    );

    const onRing = languages.filter((_, index) => index % 3 === ringIndex);
    onRing.forEach((language, index) => {
      const t = onRing.length > 1 ? index / (onRing.length - 1) : 0.5;
      const angle = ((start + 20 + t * (sweep - 40)) * Math.PI) / 180;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const rank = languages.indexOf(language);
      const letter = language.name.slice(0, 2);

      if (rank < 6) {
        // Top languages become filled chips — squares and circles alternating,
        // exactly as the pin alternates them. Kept small enough that a chip on
        // one ring can never reach the next.
        const chip = 13;
        nodes.push(
          rank % 2 === 0 ? (
            <Rect
              fill={language.color}
              height={chip * 2}
              key={`chip-${language.name}`}
              width={chip * 2}
              x={x - chip}
              y={y - chip}
            />
          ) : (
            <Circle
              cx={x}
              cy={y}
              fill={language.color}
              key={`chip-${language.name}`}
              r={chip}
            />
          ),
        );
        nodes.push(
          mark(language.name, x, y, chip * 1.05, onColor(language.color)),
        );
      } else {
        // Off-chip languages get the mark in ink, or their initials when
        // devicon has no icon for them.
        nodes.push(mark(language.name, x, y, 17, colors.ink, letter));
      }
    });
  });

  return (
    <>
      {arcs}
      {nodes}
    </>
  );
}

/**
 * A language's devicon mark placed on the arc. Icons are authored on their own
 * viewBox, so they are scaled and translated into position rather than drawn
 * at absolute coordinates.
 */
function mark(
  name: string,
  cx: number,
  cy: number,
  size: number,
  tint: string,
  fallbackLetter?: string,
): ReactElement {
  const icon = languageMark(name);
  if (!icon) {
    return (
      <SvgText
        fill={tint}
        fontFamily={fonts.sansBold}
        fontSize={11}
        key={`letter-${name}`}
        textAnchor="middle"
        x={cx}
        y={cy + 4}
      >
        {fallbackLetter ?? name.slice(0, 2)}
      </SvgText>
    );
  }
  const box = icon.viewBox.split(/\s+/).map(Number);
  const span = Math.max(box[2] || 128, box[3] || 128);
  const scale = size / span;
  return (
    <G
      key={`mark-${name}`}
      transform={`translate(${cx - size / 2}, ${cy - size / 2}) scale(${scale})`}
    >
      <Path d={icon.d} fill={tint} />
    </G>
  );
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const toPoint = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${cx + Math.cos(rad) * r} ${cy + Math.sin(rad) * r}`;
  };
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${toPoint(startDeg)} A${r} ${r} 0 ${large} 1 ${toPoint(endDeg)}`;
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
  },
  legend: {
    gap: 2,
    marginTop: 18,
  },
  legendRow: {
    alignItems: 'center',
    borderTopColor: colors.hair,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 7,
  },
  legendName: {
    flex: 1,
  },
  legendShare: {
    color: colors.ink40,
  },
});
