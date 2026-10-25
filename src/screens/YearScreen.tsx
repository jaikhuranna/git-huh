import { memo, useCallback } from 'react';

import { GitHubGate } from '../shell/SectionScreen';
import { useSessionActions, useSessionData } from '../shell/session';
import { ArchiveScreen } from './ArchiveScreen';
import { FlowScreen } from './FlowScreen';
import { OrbitScreen } from './OrbitScreen';
import { PeopleScreen } from './PeopleScreen';
import { PosterScreen } from './PosterScreen';
import { Page } from './shared';

const Weeks = memo(PosterScreen);
const Split = memo(FlowScreen);
const Languages = memo(OrbitScreen);
const Years = memo(ArchiveScreen);
const People = memo(PeopleScreen);

/**
 * `year` — what the year was — as one page, read like the year-end report it
 * is: the poster of its weeks, where it went, what it was written in, how it
 * compares with the years before, and who it was spent with. Every chart
 * carries its own `share`.
 */
export function YearScreen({ active }: { active: boolean }) {
  const { nav } = useSessionActions();
  const { model, people } = useSessionData();
  const shareWeeks = useCallback(
    (year: number) => nav.open({ kind: 'share', card: 'weeks', year }),
    [nav],
  );
  const shareSplit = useCallback(() => nav.open({ kind: 'share', card: 'split' }), [nav]);
  const shareLanguages = useCallback(() => nav.open({ kind: 'share', card: 'languages' }), [nav]);
  const shareYears = useCallback(() => nav.open({ kind: 'share', card: 'years' }), [nav]);
  const everyone = useCallback(() => nav.open({ kind: 'people' }), [nav]);

  // Archive slices can still be on their way after the rolling year is ready.
  // A missing model is a failed or unfinished read, not an empty year.
  if (!model) {
    return (
      <Page>
        <GitHubGate>{null}</GitHubGate>
      </Page>
    );
  }

  return (
    <Page blocks>
      <Weeks model={model} onShare={shareWeeks} />
      <Split model={model} onShare={shareSplit} />
      <Languages active={active} model={model} onShare={shareLanguages} />
      <Years model={model} onShare={shareYears} />
      <People onMore={everyone} state={people} />
    </Page>
  );
}
