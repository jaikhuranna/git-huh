import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { DotRow } from '../components/DotRow';
import { Body, Data, Label, Micro } from '../components/Type';
import type { Remote } from '../hooks/useRemote';
import type { People, Person } from '../lib/people';
import { savedAge } from '../lib/store';
import { colors, fonts, space, themed } from '../theme';
import { Page, ScreenHead, whyNot } from './shared';

/** People drawn as cards; the rest are counted, not listed. */
const SHOWN = 12;

/**
 * `year · people`: who you worked with, measured the one way GitHub records
 * on purpose — review.
 *
 * A sentence first, in the `you` page's voice. Then one of the widget's cards
 * per person, busiest first: their name, a give-and-take rule — a stretched
 * dot to the left for your pull requests they reviewed, one to the right for
 * theirs you reviewed, both on **one scale across every card** (LANGUAGE §8:
 * two charts that look comparable must be) — and a row of the twelve months
 * as the widget's dots, three quiet months the wave. The foot says how much
 * of the year the sample reached.
 */
export function PeopleScreen({ state }: { state: Remote<People> }) {
  const { width } = useWindowDimensions();
  const inner = width - space.gutter * 2 - space.card * 2;
  const data = state.status === 'ready' ? state.data : null;
  const people = data?.people;
  const shown = useMemo(() => people?.slice(0, SHOWN) ?? [], [people]);
  const scale = useMemo(
    () => Math.max(1, ...shown.map((person) => Math.max(person.reviewedYou, person.youReviewed))),
    [shown],
  );

  return (
    <Page>
      <ScreenHead left="who you work with" right="last 12 months" />
      {state.status === 'ready' && state.offline && state.savedAt != null && (
        <Micro style={styles.dim}>offline · saved {savedAge(state.savedAt)}</Micro>
      )}

      {(state.status === 'loading' || state.status === 'idle') && (
        <Label style={styles.note}>reading a year of reviews…</Label>
      )}
      {state.status === 'error' && (
        <Body style={styles.error}>could not read the reviews · {whyNot(state.error)}</Body>
      )}

      {data && data.people.length === 0 && (
        <Label style={styles.note}>no reviews either way in the last twelve months</Label>
      )}

      {data && data.people.length > 0 && (
        <>
          <Summary people={data.people} />
          <View style={styles.legend}>
            <Micro style={styles.dim}>← reviewed yours</Micro>
            <Micro style={styles.dim}>you reviewed theirs →</Micro>
          </View>
          {shown.map((person, index) => (
            <PersonCard
              initials={data.initials}
              key={person.login}
              labels={index === shown.length - 1}
              person={person}
              scale={scale}
              width={inner}
            />
          ))}
          {data.people.length > SHOWN && (
            <Micro style={styles.foot}>
              and {data.people.length - SHOWN} more, a review or two each
            </Micro>
          )}
          <Micro style={styles.foot}>{sampleLine(data.sample)} · bots left out</Micro>
        </>
      )}
    </Page>
  );
}

/** What the sample reached, said plainly when it is less than everything. */
function sampleLine(sample: People['sample']): string {
  const mine =
    sample.mineTotal > sample.mine
      ? `your last ${sample.mine} pull requests of ${sample.mineTotal}`
      : `all ${sample.mine} of your pull requests`;
  const theirs =
    sample.theirsTotal > sample.theirs
      ? `the last ${sample.theirs} of ${sample.theirsTotal} you reviewed`
      : `all ${sample.theirs} you reviewed`;
  return `from ${mine} and ${theirs}`;
}

/** One sentence: how many people, and the one you worked with most. */
function Summary({ people }: { people: readonly Person[] }) {
  const reviewers = people.filter((person) => person.reviewedYou > 0).length;
  const reviewed = people.filter((person) => person.youReviewed > 0).length;
  const top = people[0];

  return (
    <Card>
      <View style={styles.faces}>
        {people.slice(0, 6).map((person, index) => (
          <Avatar
            key={person.login}
            login={person.login}
            size={34}
            style={index > 0 ? styles.stacked : undefined}
          />
        ))}
      </View>
      <Body style={styles.sentence}>
        <Text style={styles.figure}>{reviewers}</Text>{' '}
        {reviewers === 1 ? 'person' : 'people'} reviewed your pull requests and you reviewed{' '}
        <Text style={styles.figure}>{reviewed}</Text>
        {reviewed === 1 ? ' person’s' : ' people’s'}. most of it was with{' '}
        <Text style={styles.figure}>~{top.login}</Text>
        {top.reviewedYou > 0 && (
          <>
            , who reviewed <Text style={styles.figure}>{top.reviewedYou}</Text> of yours
          </>
        )}
        {top.youReviewed > 0 && (
          <>
            {top.reviewedYou > 0 ? ' while you reviewed ' : ', whose '}
            <Text style={styles.figure}>{top.youReviewed}</Text>
            {top.reviewedYou > 0 ? ' of theirs' : ' you reviewed'}
          </>
        )}
        .
      </Body>
    </Card>
  );
}

function PersonCard({
  person,
  scale,
  width,
  initials,
  labels,
}: {
  person: Person;
  scale: number;
  width: number;
  initials: readonly string[];
  /** Month initials under the row — on the last card, where the deck ends. */
  labels: boolean;
}) {
  const half = (width - 1) / 2;
  const bar = (value: number) => (value > 0 ? Math.max(6, (value / scale) * (half - 34)) : 0);
  return (
    <Card>
      <View style={styles.personHead}>
        <Avatar login={person.login} size={26} />
        <Data numberOfLines={1} style={styles.login}>
          ~{person.login}
        </Data>
        <Label style={styles.dim}>{person.reviewedYou + person.youReviewed}</Label>
      </View>

      <View
        accessibilityLabel={`reviewed ${person.reviewedYou} of yours, you reviewed ${person.youReviewed} of theirs`}
        style={styles.balance}
      >
        <View style={[styles.side, styles.left]}>
          {person.reviewedYou > 0 && <Micro style={styles.count}>{person.reviewedYou}</Micro>}
          <View style={[styles.bar, styles.theirs, { width: bar(person.reviewedYou) }]} />
        </View>
        <View style={styles.axis} />
        <View style={styles.side}>
          <View style={[styles.bar, styles.yours, { width: bar(person.youReviewed) }]} />
          {person.youReviewed > 0 && <Micro style={styles.count}>{person.youReviewed}</Micro>}
        </View>
      </View>

      <DotRow
        height={16}
        labels={labels ? initials : undefined}
        quiet={3}
        unit="month"
        values={person.months}
        width={width}
      />
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    dim: {
      color: colors.ink40,
    },
    note: {
      marginTop: 18,
      textAlign: 'center',
    },
    error: {
      color: colors.no,
      marginTop: 18,
      textAlign: 'center',
    },
    foot: {
      color: colors.ink40,
      paddingHorizontal: 4,
    },
    faces: {
      flexDirection: 'row',
      marginBottom: 14,
    },
    stacked: {
      marginLeft: -10,
    },
    sentence: {
      color: colors.ink70,
      fontSize: 15,
      lineHeight: 24,
    },
    figure: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
    },
    legend: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingHorizontal: 4,
    },
    personHead: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      marginBottom: 14,
    },
    login: {
      color: colors.ink,
      flex: 1,
    },
    balance: {
      alignItems: 'center',
      flexDirection: 'row',
      height: 18,
      marginBottom: 8,
    },
    side: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: 6,
    },
    left: {
      justifyContent: 'flex-end',
    },
    axis: {
      backgroundColor: colors.hairStrong,
      height: 18,
      width: 1,
    },
    // A stretched dot: the widget's mark pulled into a rule, rounded at both
    // ends. Theirs at the support weight, yours in full ink.
    bar: {
      borderRadius: 4,
      height: 8,
    },
    theirs: {
      backgroundColor: colors.ink70,
      marginRight: 3,
    },
    yours: {
      backgroundColor: colors.ink,
      marginLeft: 3,
    },
    count: {
      color: colors.ink70,
    },
  }),
);
