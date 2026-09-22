import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ago } from '../screens/shared';
import { colors, fonts } from '../theme';
import { Markdown } from './Markdown';
import { Squiggle } from './Squiggle';
import { Data, Micro } from './Type';

/**
 * One thing someone said, drawn the way this app draws talk: a wavy spine in
 * the tone of what kind of saying it was, a byline, and the words rendered.
 * Replies nest under their own spine. The spine is measured after layout,
 * because an SVG cannot be asked to be as tall as its sibling.
 */
export function Spoken({
  author,
  kind,
  tone,
  at,
  body,
  width,
  seed,
  reply = false,
  children,
}: {
  author: string;
  kind: string;
  tone: string;
  at: string;
  body: string;
  width: number;
  seed: string;
  reply?: boolean;
  children?: ReactNode;
}) {
  const [height, setHeight] = useState(48);

  return (
    <View style={[styles.row, reply && styles.reply]}>
      <Squiggle
        amplitude={2}
        color={tone}
        length={height}
        opacity={0.75}
        phase={seed.length}
        vertical
        wavelength={11}
      />
      <View
        onLayout={(event) => {
          const measured = Math.max(24, event.nativeEvent.layout.height);
          setHeight((current) => (Math.abs(current - measured) < 1 ? current : measured));
        }}
        style={styles.body}
      >
        <View style={styles.byline}>
          <Data style={styles.author}>~{author}</Data>
          <Micro style={[styles.kind, { color: tone }]}>{kind}</Micro>
          <Micro style={styles.when}>{ago(at)}</Micro>
        </View>
        <Markdown source={body} width={width - 34} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  reply: {
    marginTop: 12,
  },
  body: {
    flex: 1,
  },
  byline: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 2,
  },
  author: {
    color: colors.ink,
    fontSize: 12,
  },
  kind: {
    fontFamily: fonts.monoMedium,
  },
  when: {
    color: colors.ink40,
    marginLeft: 'auto',
  },
});
