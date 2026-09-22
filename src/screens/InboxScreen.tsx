import { SocialFeed } from '../components/SocialFeed';
import { Micro } from '../components/Type';
import type { SocialState } from '../hooks/useSocial';
import type { Triage } from '../hooks/useTriage';
import type { SocialEvent } from '../lib/social';
import { savedAge } from '../lib/store';
import { colors } from '../theme';
import { Page, ScreenHead } from './shared';

/**
 * The `inbox` section: everything on GitHub that is addressed to you.
 *
 * Triage is the thing people actually open a GitHub app for, so it is a
 * destination of its own with the whole page and its own tab count. Every
 * row opens in the app — a pull request, an issue, a discussion — and every
 * row can be put away: `done`, or `snoozed` until the morning, both of which
 * undo themselves the moment someone writes on the thread again.
 *
 * Read state is the app's own and lives on the phone; no `notifications`
 * scope is asked for, so GitHub's inbox is never touched.
 */
export function InboxScreen({
  state,
  triage,
  onOpen,
}: {
  state: SocialState;
  triage: Triage;
  onOpen: (event: SocialEvent) => void;
}) {
  const count = state.status === 'ready' ? state.events.length : null;

  return (
    <Page>
      <ScreenHead
        left="what wants you"
        right={count == null ? '' : `${count} events`}
      />
      {state.status === 'ready' && state.offline && state.savedAt != null && (
        <Micro style={{ color: colors.ink40 }}>offline · saved {savedAge(state.savedAt)}</Micro>
      )}
      <SocialFeed onOpen={onOpen} state={state} triage={triage} />
    </Page>
  );
}
