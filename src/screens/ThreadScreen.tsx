import { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { FormScrollView } from '../components/FormScrollView';
import { CommentTools, type Verb } from '../components/CommentTools';
import { Composer } from '../components/Composer';
import { Details } from '../components/Details';
import { IconButton, IconPill } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { OverlayFrame, SavedNote } from '../components/Overlay';
import { Reactions } from '../components/Reactions';
import { Spoken } from '../components/Spoken';
import { Squiggle } from '../components/Squiggle';
import { StateChip } from '../components/StateChip';
import { Body, Data, Heading, Label, Micro } from '../components/Type';
import { wasJustCreated } from '../hooks/usePullDetail';
import { useRemote } from '../hooks/useRemote';
import { demoThread } from '../lib/demo';
import { eventually } from '../lib/eventually';
import { GitHubError } from '../lib/github';
import { useNav } from '../lib/nav';
import { fetchThread, type Thread, type ThreadComment } from '../lib/thread';
import {
  addComment,
  addDiscussionComment,
  closeIssue,
  editDiscussion,
  replyInDiscussion,
  setAnswer,
  setDiscussionOpen,
  setIssueState,
  setUpvote,
} from '../lib/writes';
import { colors, fonts, radii, space, themed } from '../theme';
import { ago } from './shared';

/**
 * An issue or a discussion, opened — and answered — without leaving.
 *
 * The shape is the pull request's `talk` tab without the diff: the opening
 * post, the replies on wavy spines, and a box at the bottom. An issue can be
 * closed from here as well, since closing is what most triage of an issue
 * actually is.
 */
export function ThreadScreen({
  repo,
  number,
  type,
}: {
  repo: string;
  number: number;
  type: 'issue' | 'discussion';
}) {
  const nav = useNav();
  const { width } = useWindowDimensions();
  const body = width - space.gutter * 2;

  const demo = useMemo(
    () => (nav.demo ? demoThread(repo, number, type) : undefined),
    [nav.demo, number, repo, type],
  );
  const state = useRemote(
    nav.token ? `${nav.token}|${type}|${repo}#${number}` : null,
    async (signal) => {
      // One started a second ago can still read as missing.
      const thread = await eventually(
        () => fetchThread(nav.token ?? '', repo, number, type, signal),
        { signal, recent: wasJustCreated(type, repo, number) },
      );
      if (!thread) throw new GitHubError('missing', 'Not found.');
      return thread;
    },
    {
      cacheKey: nav.login ? `${nav.login.toLowerCase()}-${type}2-${repo}-${number}` : null,
      demo,
    },
  );

  const thread = state.status === 'ready' ? state.data : null;
  const kind = type === 'issue' ? 'issues' : 'discussions';
  const [editing, setEditing] = useState(false);
  const openOnGitHub = () =>
    Linking.openURL(`https://github.com/${repo}/${kind}/${number}`).catch(() => {});

  return (
    <OverlayFrame onBack={nav.close} where={`${repo} ${type === 'issue' ? '#' : '§'}${number}`}>
      {state.status === 'ready' && <SavedNote offline={state.offline} savedAt={state.savedAt} />}

      {state.status === 'loading' && <Label style={styles.note}>opening the thread…</Label>}
      {state.status === 'error' && (
        <View style={styles.errorStack}>
          <Body style={styles.error}>
            {state.error instanceof GitHubError && state.error.kind === 'forbidden'
              ? `this token cannot read ${type === 'discussion' ? 'discussions · it needs read:discussion' : 'this issue'}`
              : `could not open this ${type}`}
          </Body>
          <IconPill icon="external" label="open it on github" onPress={openOnGitHub} />
        </View>
      )}

      {thread && (
        <FormScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleRow}>
            <View style={styles.titleTop}>
              <StateChip
                text={thread.state.toLowerCase()}
                tone={
                  thread.state === 'CLOSED'
                    ? colors.ink40
                    : thread.state === 'ANSWERED'
                      ? colors.yes
                      : colors.ink
                }
              />
              <View style={styles.titleTools}>
                {thread.canUpdate && (
                  <IconButton
                    icon={editing ? 'close' : 'edit'}
                    label={editing ? 'close the editor' : `edit the title and ${type === 'issue' ? 'description' : 'post'}`}
                    on={editing}
                    onPress={() => setEditing(!editing)}
                  />
                )}
                <IconButton icon="external" label="open it on github" onPress={openOnGitHub} />
              </View>
            </View>
            <Heading style={styles.title}>{thread.title}</Heading>
          </View>

          <View style={styles.meta}>
            <Pressable
              accessibilityRole="link"
              hitSlop={6}
              onPress={() => nav.open({ kind: 'user', login: thread.author })}
            >
              <Data style={styles.metaText}>~{thread.author}</Data>
            </Pressable>
            <Data style={styles.metaText}>{ago(thread.createdAt)}</Data>
            {thread.category && <Data style={styles.metaText}>{thread.category}</Data>}
            {thread.labels.map((label) => (
              <View key={label.name} style={styles.label}>
                <Micro>{label.name}</Micro>
              </View>
            ))}
          </View>

          <Squiggle amplitude={2.6} length={body} opacity={0.4} style={styles.rule} wavelength={14} />

          <Bounded href={thread.url} source={thread.body} width={body} />

          <View style={styles.bodyTools}>
            {type === 'discussion' && (
              <Composer
                actions={[
                  {
                    key: 'vote',
                    label: `▲ ${thread.upvotes}`,
                    on: thread.upvoted,
                    disabled: !thread.canUpvote,
                  },
                ]}
                bare
                demo={nav.demo}
                doing="that vote"
                onSubmit={async () => {
                  await setUpvote(nav.token ?? '', thread.id, !thread.upvoted);
                  state.reload();
                  return thread.upvoted ? 'vote taken back' : 'voted up';
                }}
                quiet
              />
            )}
            <Reactions onChanged={state.reload} reactions={thread.reactions} subjectId={thread.id} />
          </View>

          {type === 'issue' ? (
            <Details
              assignees={thread.assignees}
              body={thread.body}
              canUpdate={thread.canUpdate}
              kind="issue"
              labels={thread.labels.map((label) => label.name)}
              locked={thread.locked}
              milestone={thread.milestone}
              nodeId={thread.id}
              number={number}
              onChanged={state.reload}
              pinned={thread.pinned}
              onTextClose={() => setEditing(false)}
              repo={repo}
              textOpen={editing}
              title={thread.title}
            />
          ) : (
            thread.canUpdate &&
            editing && (
              <DiscussionEditor
                onChanged={state.reload}
                onClose={() => setEditing(false)}
                thread={thread}
              />
            )
          )}

          {thread.comments.length > 0 && <View style={styles.gap} />}
          {thread.moreComments > 0 && (
            <Label style={styles.more}>
              {thread.moreComments} earlier {thread.moreComments === 1 ? 'reply is' : 'replies are'} on github
            </Label>
          )}

          {thread.comments.map((comment, index) => (
            <View key={comment.id}>
              {index > 0 && (
                <Squiggle
                  amplitude={2.2}
                  length={body}
                  opacity={0.3}
                  phase={index * 5}
                  style={styles.between}
                  wavelength={12}
                />
              )}
              <Spoken
                at={comment.createdAt}
                author={comment.author}
                body={comment.body.length > 4000 ? comment.body.slice(0, 4000) + '\n\n... cut, the rest is on github' : comment.body}
                kind={comment.isAnswer ? 'the answer' : 'replied'}
                seed={comment.id}
                tone={comment.isAnswer ? colors.yes : colors.ink70}
                width={body}
              >
                <CommentTools
                  body={comment.body}
                  canDelete={comment.canDelete}
                  canEdit={comment.canEdit}
                  editKind={type}
                  onChanged={state.reload}
                  reactions={comment.reactions}
                  reply={
                    type === 'discussion'
                      ? {
                          label: 'reply to this',
                          send: (text) =>
                            replyInDiscussion(nav.token ?? '', thread.id, comment.id, text),
                        }
                      : undefined
                  }
                  subjectId={comment.id}
                  verbs={discussionVerbs(nav.token ?? '', type, comment)}
                />
                {comment.replies.map((reply) => (
                  <Spoken
                    at={reply.createdAt}
                    author={reply.author}
                    body={reply.body}
                    key={reply.id}
                    kind="replied"
                    reply
                    seed={reply.id}
                    tone={colors.ink40}
                    width={body - 20}
                  >
                    <CommentTools
                      body={reply.body}
                      canDelete={reply.canDelete}
                      canEdit={reply.canEdit}
                      editKind="discussion"
                      onChanged={state.reload}
                      reactions={reply.reactions}
                      subjectId={reply.id}
                      verbs={discussionVerbs(nav.token ?? '', type, reply, false)}
                    />
                  </Spoken>
                ))}
              </Spoken>
            </View>
          ))}

          <Composer
            actions={
              type === 'issue'
                ? [
                    { key: 'comment', label: 'comment', primary: true, icon: 'send' as const },
                    ...(thread.state === 'CLOSED'
                      ? [{ key: 'reopen', label: 'reopen', allowEmpty: true, icon: 'reopen' as const }]
                      : [
                          { key: 'close', label: 'done', allowEmpty: true, icon: 'done' as const },
                          { key: 'not-planned', label: 'not planned', allowEmpty: true, icon: 'notPlanned' as const },
                        ]),
                  ]
                : [
                    { key: 'reply', label: 'reply', primary: true, icon: 'send' as const },
                    ...(thread.canUpdate
                      ? [
                          thread.closed
                            ? { key: 'reopen', label: 'reopen', allowEmpty: true, icon: 'reopen' as const }
                            : { key: 'close', label: 'close', allowEmpty: true, icon: 'done' as const },
                        ]
                      : []),
                  ]
            }
            demo={nav.demo}
            doing={type === 'issue' ? 'that comment' : 'that reply'}
            
 draftKey={{ account: nav.login, kind: `${type}-comment`, id: `${repo}#${number}` }}
 onCheck={async () => {
 state.reload();
 return 'could not confirm it was sent - the draft is still here';
 }}
 onSubmit={async (action, text) => {
              const token = nav.token ?? '';
              if (text) {
                if (type === 'issue') await addComment(token, thread.id, text);
                else await addDiscussionComment(token, thread.id, text);
              }
              if (type === 'discussion' && (action === 'close' || action === 'reopen')) {
                await setDiscussionOpen(token, thread.id, action === 'reopen');
              } else if (action === 'close' || action === 'not-planned') {
                await closeIssue(token, repo, number, action === 'close' ? 'completed' : 'not_planned');
              } else if (action === 'reopen') {
                await setIssueState(token, repo, number, 'open');
              }
              state.reload();
              return action === 'close' || action === 'not-planned'
                ? 'closed'
                : action === 'reopen'
                  ? 'reopened'
                  : 'sent · it is on github now';
            }}
            placeholder={type === 'issue' ? 'leave a comment' : 'write a reply'}
          />
        </FormScrollView>
      )}
    </OverlayFrame>
  );
}

const POST_CAP = 4000;

function Bounded({ source, width, href }: { source: string; width: number; href?: string }) {
 const [open, setOpen] = useState(false);
 const cut = !open && source.length > POST_CAP;
 return (
 <View>
 <Markdown href={href} source={cut ? source.slice(0, POST_CAP) : source} width={width} />
 {source.length > POST_CAP && (
 <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
 <Label style={styles.note}>{cut ? 'cut short - show the rest' : 'show less'}</Label>
 </Pressable>
 )}
 </View>
 );
}

/** Vote up, and mark or unmark the answer: what a discussion reply can have done to it. */
function discussionVerbs(
  token: string,
  type: 'issue' | 'discussion',
  comment: ThreadComment,
  answerable = true,
): Verb[] {
  if (type !== 'discussion') return [];
  const verbs: Verb[] = [];
  if (comment.upvotes !== undefined) {
    verbs.push({
      action: {
        key: 'vote',
        label: `▲ ${comment.upvotes}`,
        on: comment.upvoted ?? false,
        disabled: !comment.canUpvote,
      },
      run: async () => {
        await setUpvote(token, comment.id, !comment.upvoted);
        return comment.upvoted ? 'vote taken back' : 'voted up';
      },
    });
  }
  if (answerable && (comment.canMarkAnswer || comment.canUnmarkAnswer)) {
    verbs.push({
      action: { key: 'answer', label: comment.isAnswer ? 'not the answer' : 'mark as answer' },
      run: async () => {
        await setAnswer(token, comment.id, !comment.isAnswer);
        return comment.isAnswer ? 'unmarked' : 'marked as the answer';
      },
    });
  }
  return verbs;
}

/** A discussion's title and opening post, edited in place. */
function DiscussionEditor({
  thread,
  onChanged,
  onClose,
}: {
  thread: Thread;
  onChanged: () => void;
  onClose: () => void;
}) {
  const nav = useNav();
  const [title, setTitle] = useState(thread.title);

  return (
    <View>
      <TextInput onChangeText={setTitle} style={styles.titleInput} value={title} />
      <Composer
        actions={[{ key: 'save', label: 'save', primary: true, icon: 'save' }]}
        compact
        demo={nav.demo}
        doing="that edit"
        initial={thread.body}
        onCancel={onClose}
        onSubmit={async (_, text) => {
          await editDiscussion(nav.token ?? '', thread.id, { title: title.trim() || thread.title, body: text });
          onClose();
          onChanged();
          return 'saved';
        }}
        placeholder="the post"
      />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    page: {
      paddingBottom: 30,
      paddingHorizontal: space.gutter,
      paddingTop: 6,
    },
    titleRow: {
      backgroundColor: colors.card,
      borderRadius: radii.card,
      gap: 10,
      marginBottom: 4,
      padding: space.card,
    },
    titleTop: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    titleTools: {
      flexDirection: 'row',
      gap: 8,
    },
    title: {
      fontSize: 16,
      lineHeight: 23,
    },
    meta: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 9,
    },
    metaText: {
      color: colors.ink70,
      fontSize: 11,
    },
    label: {
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 1,
    },
    rule: {
      marginBottom: 6,
      marginTop: 10,
    },
    bodyTools: {
      gap: 4,
      marginTop: 12,
    },
    titleInput: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.tile,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 14,
      marginTop: 18,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    gap: {
      height: 18,
    },
    between: {
      marginVertical: 14,
    },
    more: {
      marginBottom: 14,
    },
    note: {
      marginTop: 26,
      textAlign: 'center',
    },
    errorStack: {
      alignItems: 'center',
      gap: 14,
      marginTop: 30,
      paddingHorizontal: space.gutter,
    },
    error: {
      color: colors.no,
      textAlign: 'center',
    },
  }),
);
