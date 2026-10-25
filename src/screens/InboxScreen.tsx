import { StyleSheet, View } from 'react-native';

import { OverlayFrame } from '../components/Overlay';
import { SocialFeed } from '../components/SocialFeed';
import { Micro } from '../components/Type';
import { useNav } from '../lib/nav';
import { savedAge } from '../lib/store';
import { useSessionActions, useSessionData } from '../shell/session';
import { colors, space, themed } from '../theme';
import { AssignedTile } from './AssignedScreen';
import { QueueTile } from './QueueScreen';
import { Block, Page, ScreenHead } from './shared';

/** How much of the feed the `work` page shows before offering the rest of the cap. */
const HEAD_ROWS = 6;

/**
 * What used to be the `inbox` section, now the top of `work`: everything on
 * GitHub that is addressed to you.
 *
 * First the two lists that are about *you* rather than about your work —
 * the pull requests waiting on your review and what is assigned to you —
 * folded into a card each, with a dot for every item sized by how long it
 * has waited. Under them, the head of the feed: every row opens in the app,
 * and every row can be put away (`done`, or `snoozed` until the morning),
 * both of which undo themselves the moment someone writes on the thread
 * again. The whole feed is a pushed page (`InboxPage`).
 *
 * Read state is the app's own and lives on the phone; no `notifications`
 * scope is asked for, so GitHub's inbox is never touched.
 */
export function InboxBlocks() {
  const { nav, openEvent } = useSessionActions();
  const { queue, social, tasks, triage } = useSessionData();
  const count = social.status === 'ready' ? social.events.length : null;

  return (
    <>
      <Block>
        <ScreenHead left="what wants you" />
        <View style={styles.tiles}>
          <QueueTile state={queue} />
          <AssignedTile state={tasks} />
        </View>
      </Block>

      <Block>
        <ScreenHead left="inbox" right={count == null ? '' : `${count} events`} />
        {social.status === 'ready' && social.offline && social.savedAt != null && (
          <Micro style={styles.dim}>offline · saved {savedAge(social.savedAt)}</Micro>
        )}
        <SocialFeed
          limit={HEAD_ROWS}
          onMore={() => nav.open({ kind: 'inbox' })}
          onOpen={openEvent}
          state={social}
          triage={triage}
        />
      </Block>
    </>
  );
}

/** The whole feed, pushed from the head of it on `work`. */
export function InboxPage() {
  const nav = useNav();
  const { openEvent } = useSessionActions();
  const { social, triage } = useSessionData();
  return (
    <OverlayFrame onBack={nav.close} where="work · inbox">
      <Page>
        <View style={styles.full}>
          <SocialFeed onOpen={openEvent} state={social} triage={triage} />
        </View>
      </Page>
    </OverlayFrame>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    tiles: {
      flexDirection: 'row',
      gap: 10,
    },
    dim: {
      color: colors.ink40,
    },
    full: {
      paddingTop: space.row - 8,
    },
  }),
);
