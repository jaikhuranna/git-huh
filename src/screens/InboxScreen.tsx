import { SocialFeed } from '../components/SocialFeed';
import type { SocialState } from '../hooks/useSocial';
import { Page, ScreenHead } from './shared';

/**
 * The `inbox` section: everything on GitHub that is addressed to you.
 *
 * It used to live below the fold on the greeting, which is the one place a
 * person never scrolls to twice. Triage is the thing people actually open a
 * GitHub app for, so it is a destination of its own with the whole page and
 * its own tab count — the counts on the filter chips are the point of the
 * screen, not decoration on it.
 *
 * Nothing here is marked read: this app holds no `notifications` scope and
 * says so rather than pretending to be an inbox it cannot write to.
 */
export function InboxScreen({
  state,
  onOpen,
}: {
  state: SocialState;
  onOpen: (target: { repo: string; number: number }) => void;
}) {
  const count = state.status === 'ready' ? state.events.length : null;

  return (
    <Page>
      <ScreenHead
        left="what wants you"
        right={count == null ? '' : `${count} events`}
      />
      <SocialFeed onOpen={onOpen} state={state} />
    </Page>
  );
}
