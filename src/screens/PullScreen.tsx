import { useEffect, useState } from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { FormScrollView } from '../components/FormScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChecksPanel } from '../components/ChecksPanel';
import { CommentTools } from '../components/CommentTools';
import { Composer } from '../components/Composer';
import { Details } from '../components/Details';
import { IconPill } from '../components/Icon';
import { Diff } from '../components/Diff';
import { Markdown } from '../components/Markdown';
import { MergeBox } from '../components/MergeBox';
import { SavedNote } from '../components/Overlay';
import { PullHeader } from '../components/PullHeader';
import { PullPager } from '../components/PullPager';
import { ReadNotice } from '../components/ReadNotice';
import { Reactions } from '../components/Reactions';
import { Segments } from '../components/Segments';
import { Squiggle } from '../components/Squiggle';
import { Body, Data, Label, Micro } from '../components/Type';
import { usePullDetail, type PullMutation } from '../hooks/usePullDetail';
import { useNav, type PullTab } from '../lib/nav';
import type { PullRef } from '../lib/pullRequest';
import { parsePatch, type PullComment, type PullDetailFull } from '../lib/pullDetail';
import { explain } from '../lib/rest';
import {
  addComment,
  commentOnLine,
  dismissReview,
  replyToThread,
  setThreadResolved,
  submitReview,
} from '../lib/writes';
import { colors, fonts, radii, space, themed } from '../theme';
import { ago } from './shared';

const TABS: readonly (readonly [PullTab, string])[] = [
  ['brief', 'the brief'],
  ['talk', 'talk'],
  ['diff', 'files'],
  ['checks', 'checks'],
];

/**
 * A pull request, opened.
 *
 * The filing index and the brief both stop at the cover of the object: a
 * number, a title, a size. This is the inside — what was written, what
 * people said back, the lines that actually changed, and whether CI agreed.
 * And now the other half: reply, approve or request changes at the end of
 * `talk`, and tap any line in `files` — changed or not — to comment on it.
 *
 * The conversation is drawn in wavy rules throughout. Everything else in
 * this app is ruled and filed and measured, and a review thread is none of
 * those things; the wave is what marks the part of a pull request that is
 * two people arguing rather than a statistic.
 */
export function PullScreen({ repo, number, initialTab = 'brief', sequence }: PullRef & { initialTab?: PullTab; sequence?: readonly PullRef[] }) {
  const nav = useNav();
  const onClose = nav.close;
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<PullTab>(initialTab);
  const state = usePullDetail(nav.token, nav.login, repo, number, {
    details: tab === 'brief' || tab === 'talk',
    conversation: tab === 'talk',
    files: tab === 'diff',
  });
  const [find, setFind] = useState('');
  const body = width - space.gutter * 2;

  // The overlay is not a route, so the system back button has to be told
  // about it — without this it leaves the app from a pull request.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose]);

  const pull = state.pull;
  const token = nav.token ?? '';
  const changed = (effect: PullMutation) => state.afterMutation(effect);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.chrome}>
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={onClose}
          style={styles.back}
        >
          <Label style={styles.backLabel}>← back</Label>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => nav.open({ kind: 'repo', repo })}
          style={styles.chromeRepoHit}
        >
          <Data style={styles.chromeRepo} numberOfLines={1}>
            {repo} #{number}
          </Data>
        </Pressable>
      </View>
      {state.status === 'ready' && <SavedNote offline={state.offline} savedAt={state.savedAt} />}

      {state.status === 'loading' && (
        <Label style={styles.note}>opening the file…</Label>
      )}
      {state.status === 'error' && (
        <View style={styles.errorStack}>
          <Body style={styles.error}>{explain(state.error, 'opening this pull request')}</Body>
          <IconPill icon="refresh" label="try again" onPress={state.reload} />
          <IconPill
            icon="external"
            label="open it on github"
            onPress={() =>
              Linking.openURL(`https://github.com/${repo}/pull/${number}`).catch(() => {})
            }
          />
        </View>
      )}

      {pull && (
        <>
          <View style={styles.header}><PullHeader author={pull.author} pull={pull} /></View>

          <Segments
            current={TABS.findIndex(([value]) => value === tab)}
            items={TABS.map(([value, label]) =>
              value === 'talk'
                ? state.conversation.failure
                  ? `${label} · unavailable`
                  : state.conversation.status === 'ready'
                    ? `${label} ${pull.comments.length}`
                    : label
                : value === 'diff'
                  ? `${label} ${pull.changedFiles}`
                  : label,
            )}
            onSelect={(index) => setTab(TABS[index][0])}
          />

          <FormScrollView
            contentContainerStyle={styles.page}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {tab === 'brief' && (
              <>
                <Markdown href={pull.url} source={pull.body} width={body} />
                <View style={styles.bodyReactions}>
                  <Reactions onChanged={() => changed('reaction')} reactions={pull.reactions} subjectId={pull.id} />
                </View>
                {state.details.status === 'loading' || state.details.status === 'idle' ? (
            <Label style={styles.note}>reading the details…</Label>
          ) : state.details.failure ? (
            <ReadNotice failure={state.details.failure} subject="pull request details and merge controls" onRetry={state.details.reload} />
          ) : <Details
                  assignees={pull.assignees}
                  body={pull.body}
                  canUpdate={pull.canUpdate}
                  kind="pull"
                  labels={pull.labels.map((label) => label.name)}
                  locked={pull.locked}
                  milestone={pull.milestone}
                  nodeId={pull.id}
                  number={number}
                  onChanged={() => changed('details')}
                  repo={repo}
                  reviewers={pull.reviewers}
                  title={pull.title}
                />}
              </>
            )}
            {tab === 'talk' && (
              <>
                {state.conversation.status === 'loading' || state.conversation.status === 'idle' ? (
              <Label style={styles.note}>reading the conversation…</Label>
            ) : state.conversation.failure ? (
              <ReadNotice failure={state.conversation.failure} subject="the conversation" onRetry={state.conversation.reload} />
            ) : <Conversation onChanged={() => changed('comment')} pull={pull} width={body} />}
            {state.details.status === 'loading' || state.details.status === 'idle' ? (
              <Label style={styles.note}>reading the merge controls…</Label>
            ) : state.details.failure ? (
              <ReadNotice failure={state.details.failure} subject="merge controls" onRetry={state.details.reload} />
            ) : <MergeBox onChanged={() => changed('merge')} pull={pull} />}
            <Composer
                  actions={[
                    { key: 'comment', label: 'comment', primary: true, icon: 'send' as const },
                    ...(!pull.viewerIsAuthor && pull.state === 'OPEN'
                      ? [
                          { key: 'approve', label: 'approve', allowEmpty: true, icon: 'approve' as const },
                          { key: 'changes', label: 'request changes', icon: 'edit' as const },
                        ]
                      : []),
                  ]}
                  demo={nav.demo}
                  doing={'that review'}
                  draftKey={{ account: nav.login, kind: 'pull-comment', id: `${repo}#${number}` }}
              onCheck={async (action) => {
                // The write may already have landed. Refresh and keep the
                // draft; sending again would post a second comment.
                state.conversation.reload();
                return action === 'approve'
                  ? 'could not confirm the approval · look before sending again'
                  : 'could not confirm it was sent · the draft is still here';
              }}
              onSubmit={async (action, text) => {
                    if (action === 'comment') await addComment(token, pull.id, text);
                    if (action === 'approve') await submitReview(token, pull.id, 'APPROVE', text);
                    if (action === 'changes') {
                      await submitReview(token, pull.id, 'REQUEST_CHANGES', text);
                    }
                    changed(action === 'comment' ? 'comment' : 'review');
                    return action === 'approve'
                      ? 'approved'
                      : action === 'changes'
                        ? 'changes requested'
                        : 'sent · it is on github now';
                  }}
                  placeholder={
                    pull.viewerIsAuthor ? 'reply to the thread' : 'reply, or say why with your review'
                  }
                />
              </>
            )}
            {tab === 'diff' && (state.files.status === 'loading' || state.files.status === 'idle' ? (
          <Label style={styles.note}>reading the files…</Label>
        ) : state.files.failure ? (
          <ReadNotice failure={state.files.failure} subject="the files" onRetry={state.files.reload} />
        ) : <>
          <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setFind}
                  placeholder="find in these files"
                  placeholderTextColor={colors.ink40}
                  style={styles.find}
                  value={find}
                />
                <Diff
                  demo={nav.demo}
                  files={pull.files}
                  find={find}
                  moreFiles={pull.moreFiles}
                  onComment={async (target, text) => {
                    await commentOnLine(
                      token,
                      repo,
                      number,
                      { commitId: pull.headSha, ...target },
                      text,
                    );
                    changed('comment');
                    return `commented on ${target.side === 'LEFT' ? 'old ' : ''}line ${target.line}`;
                  }}
                  width={body}
                />
              </>
            )}
            {tab === 'checks' && <ChecksPanel repo={repo} sha={pull.headSha} />}
          </FormScrollView>

          <View style={styles.footer}>
            <Squiggle
              amplitude={2.4}
              length={width}
              opacity={0.35}
              style={styles.footerRule}
              wavelength={15}
            />
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(pull.url).catch(() => {})}
              style={[styles.pill, styles.solid]}
            >
              <Label style={styles.solidLabel}>open on github</Label>
            </Pressable>
            <Data style={styles.branch} numberOfLines={1}>
              {pull.headRefName} → {pull.baseRefName}
            </Data>
          </View>
        </>
      )}
      {sequence && <PullPager pull={{ repo, number }} sequence={sequence} />}
    </SafeAreaView>
  );
}

/** How many comments are drawn before the rest is a deliberate next page. */
const TALK_PAGE = 25;
/** A single comment longer than this is cut, with the rest one tap away. */
const COMMENT_CAP = 4000;

function Conversation({
  pull,
  width,
  onChanged,
}: {
  pull: PullDetailFull;
  width: number;
  onChanged: () => void;
}) {
  const [shown, setShown] = useState(TALK_PAGE);
  if (pull.comments.length === 0) {
    return <Label style={styles.note}>nobody has said anything yet</Label>;
  }
  const visible = pull.comments.slice(0, shown);
  const rest = pull.comments.length - visible.length;

  return (
    <View>
      {rest > 0 && (
        <Pressable accessibilityRole="button" onPress={() => setShown((n) => n + TALK_PAGE)}>
          <Label style={styles.note}>
            {rest} earlier {rest === 1 ? 'comment is' : 'comments are'} not shown · show more
          </Label>
        </Pressable>
      )}
      {visible.map((comment, index) => (
        <View key={comment.id}>
          {index > 0 && (
            <Squiggle
              amplitude={2.2}
              length={width}
              opacity={0.3}
              phase={index * 5}
              style={styles.between}
              wavelength={12}
            />
          )}
          <Comment comment={comment} onChanged={onChanged} pull={pull} width={width} />
        </View>
      ))}
    </View>
  );
}

const TONE = themed<Record<string, string>>(() => ({
  APPROVED: colors.yes,
  CHANGES_REQUESTED: colors.no,
  COMMENTED: colors.ink70,
}));

const WRITERS = new Set(['ADMIN', 'MAINTAIN', 'WRITE']);

function Comment({
  comment,
  pull,
  width,
  onChanged,
  reply = false,
}: {
  comment: PullComment;
  pull: PullDetailFull;
  width: number;
  onChanged: () => void;
  reply?: boolean;
}) {
  const nav = useNav();
  const token = nav.token ?? '';
  const tone =
    comment.kind === 'review'
      ? (TONE[comment.state ?? ''] ?? colors.ink70)
      : comment.kind === 'thread'
        ? colors.ink70
        : colors.ink40;

  // The spine is sized off the body it runs beside; there is no way to ask
  // an SVG to be "as tall as my sibling", so it is measured after layout.
  const [height, setHeight] = useState(48);

  return (
    <View style={[styles.comment, reply && styles.reply]}>
      <Squiggle
        amplitude={2}
        color={tone}
        length={height}
        opacity={0.75}
        phase={comment.id.length}
        vertical
        wavelength={11}
      />

      <View
        onLayout={(event) => {
          const measured = Math.max(24, event.nativeEvent.layout.height);
          setHeight((current) =>
            Math.abs(current - measured) < 1 ? current : measured,
          );
        }}
        style={styles.commentBody}
      >
        <View style={styles.byline}>
          <Pressable
            accessibilityRole="link"
            hitSlop={6}
            onPress={() => nav.open({ kind: 'user', login: comment.author })}
          >
            <Data style={styles.author}>~{comment.author}</Data>
          </Pressable>
          <Micro style={[styles.kind, { color: tone }]}>{kindOf(comment)}</Micro>
          <Micro style={styles.when}>{ago(comment.createdAt)}</Micro>
        </View>

        {comment.path && (
          <Data style={styles.anchor} numberOfLines={1}>
            on {comment.path}
          </Data>
        )}

        {comment.diffHunk && <Hunk hunk={comment.diffHunk} />}

        <Bounded href={comment.url} source={comment.body} width={width - 34} />

        <CommentTools
          body={comment.body}
          canDelete={comment.canDelete}
          canEdit={comment.canEdit}
          editKind={comment.editKind}
          onChanged={onChanged}
          reactions={comment.reactions}
          reply={
            comment.kind === 'thread' && !reply && comment.canReply
              ? {
                  label: 'reply in thread',
                  send: (text) => replyToThread(token, comment.id, text),
                }
              : undefined
          }
          subjectId={comment.subjectId}
          verbs={[
            ...(comment.kind === 'thread' && !reply && (comment.canResolve || comment.canUnresolve)
              ? [
                  {
                    action: {
                      key: 'resolve',
                      label: comment.resolved ? 'unresolve' : 'resolve',
                    },
                    run: async () => {
                      await setThreadResolved(token, comment.id, !comment.resolved);
                      return comment.resolved ? 'opened again' : 'resolved';
                    },
                  },
                ]
              : []),
            ...(comment.kind === 'review' &&
            WRITERS.has(pull.permission ?? '') &&
            pull.state === 'OPEN' &&
            (comment.state === 'APPROVED' || comment.state === 'CHANGES_REQUESTED')
              ? [
                  {
                    action: { key: 'dismiss', label: 'dismiss review', confirm: 'dismiss it?' },
                    run: async () => {
                      await dismissReview(token, comment.id, 'Dismissed from git-huh.');
                      return 'dismissed';
                    },
                  },
                ]
              : []),
          ]}
        />

        {comment.replies?.map((child) => (
          <Comment
            comment={child}
            key={child.id}
            onChanged={onChanged}
            pull={pull}
            reply
            width={width - 20}
          />
        ))}
      </View>
    </View>
  );
}

function kindOf(comment: PullComment): string {
  if (comment.kind === 'review') {
    return (comment.state ?? 'reviewed').toLowerCase().replace(/_/g, ' ');
  }
  if (comment.kind === 'thread') {
    return comment.resolved ? 'resolved thread' : 'on the diff';
  }
  return 'commented';
}


function Bounded({ source, width, href }: { source: string; width: number; href?: string }) {
  const [open, setOpen] = useState(false);
  const cut = !open && source.length > COMMENT_CAP;
  return (
    <View>
      <Markdown href={href} source={cut ? source.slice(0, COMMENT_CAP) : source} width={width} />
      {source.length > COMMENT_CAP && (
        <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
          <Label style={styles.note}>
            {cut ? `cut at ${COMMENT_CAP} characters · show the rest` : 'show less'}
          </Label>
        </Pressable>
      )}
    </View>
  );
}

/** The few lines a review thread is arguing about, in the diff's own voice. */
function Hunk({ hunk }: { hunk: string }) {
  const { lines } = parsePatch(hunk);
  const shown = lines.slice(-6);
  if (shown.length === 0) return null;

  return (
    <View style={styles.hunk}>
      {shown.map((line, index) => (
        <Data
          key={index}
          numberOfLines={1}
          style={[
            styles.hunkLine,
            line.kind === 'add' && styles.hunkAdd,
            line.kind === 'del' && styles.hunkDel,
          ]}
        >
          {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}
          {line.text}
        </Data>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
      flex: 1,
    },
    chrome: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 14,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    back: {
      paddingVertical: 4,
    },
    backLabel: {
      color: colors.ink,
    },
    chromeRepoHit: {
      flex: 1,
    },
    chromeRepo: {
      color: colors.ink40,
      fontSize: 10,
      textAlign: 'right',
    },
    find: {
      backgroundColor: colors.card,
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 12,
      marginBottom: 10,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    header: {
      marginBottom: 12,
      marginHorizontal: space.gutter,
      marginTop: 10,
    },
    page: {
      paddingBottom: 26,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    between: {
      marginVertical: 14,
    },
    bodyReactions: {
      marginTop: 14,
    },
    comment: {
      flexDirection: 'row',
      gap: 12,
    },
    reply: {
      marginTop: 12,
      opacity: 0.92,
    },
    commentBody: {
      flex: 1,
    },
    byline: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 8,
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
    anchor: {
      color: colors.ink40,
      fontSize: 10,
      marginTop: 5,
    },
    hunk: {
      backgroundColor: colors.recess,
      borderRadius: radii.tile,
      marginTop: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    hunkLine: {
      color: colors.ink70,
      fontSize: 10,
      lineHeight: 14,
    },
    hunkAdd: {
      color: colors.yes,
    },
    hunkDel: {
      color: colors.no,
    },
    footer: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      paddingBottom: 8,
      paddingHorizontal: space.gutter,
      paddingTop: 12,
    },
    footerRule: {
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    pill: {
      alignItems: 'center',
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    solid: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    solidLabel: {
      color: colors.onBlack,
    },
    branch: {
      color: colors.ink40,
      flex: 1,
      fontSize: 10,
    },
    note: {
      marginTop: 26,
      textAlign: 'center',
    },
    errorStack: {
      flex: 1,
      alignItems: 'center',
      gap: 14,
      marginTop: 30,
    },
    error: {
      color: colors.no,
    },
  }),
);
