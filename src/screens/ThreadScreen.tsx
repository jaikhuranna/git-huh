import { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Composer } from '../components/Composer';
import { Markdown } from '../components/Markdown';
import { OverlayFrame, SavedNote } from '../components/Overlay';
import { Spoken } from '../components/Spoken';
import { Squiggle } from '../components/Squiggle';
import { Body, Data, Heading, Label, Micro } from '../components/Type';
import { useRemote } from '../hooks/useRemote';
import { demoThread } from '../lib/demo';
import { GitHubError } from '../lib/github';
import { useNav } from '../lib/nav';
import { fetchThread } from '../lib/thread';
import { addComment, addDiscussionComment, setIssueState } from '../lib/writes';
import { colors, radii, space, themed } from '../theme';
import { ago } from './shared';

/**
 * An issue or a discussion, opened — and answered — without leaving.
 *
 * It used to be the one kind of inbox row that still left for the browser.
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
      const thread = await fetchThread(nav.token ?? '', repo, number, type, signal);
      if (!thread) throw new GitHubError('missing', 'Not found.');
      return thread;
    },
    {
      cacheKey: nav.login ? `${nav.login.toLowerCase()}-${type}-${repo}-${number}` : null,
      demo,
    },
  );

  const thread = state.status === 'ready' ? state.data : null;
  const kind = type === 'issue' ? 'issues' : 'discussions';

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
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              Linking.openURL(`https://github.com/${repo}/${kind}/${number}`).catch(() => {})
            }
          >
            <Label style={styles.underline}>open it on github</Label>
          </Pressable>
        </View>
      )}

      {thread && (
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.titleRow}>
            <Heading style={styles.title}>{thread.title}</Heading>
            <View
              style={[
                styles.state,
                {
                  backgroundColor:
                    thread.state === 'CLOSED'
                      ? colors.purple
                      : thread.state === 'ANSWERED'
                        ? colors.green
                        : colors.blue,
                },
              ]}
            >
              <Data style={styles.stateText}>{thread.state.toLowerCase()}</Data>
            </View>
          </View>

          <View style={styles.meta}>
            <Data style={styles.metaText}>~{thread.author}</Data>
            <Data style={styles.metaText}>{ago(thread.createdAt)}</Data>
            {thread.category && <Data style={styles.metaText}>{thread.category}</Data>}
            {thread.labels.map((label) => (
              <View key={label.name} style={[styles.label, { borderColor: `#${label.color}` }]}>
                <Micro>{label.name}</Micro>
              </View>
            ))}
          </View>

          <Squiggle amplitude={2.6} length={body} opacity={0.4} style={styles.rule} wavelength={14} />

          <Markdown source={thread.body} width={body} />

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
                body={comment.body}
                kind={comment.isAnswer ? 'the answer' : 'replied'}
                seed={comment.id}
                tone={comment.isAnswer ? colors.green : colors.blue}
                width={body}
              >
                {comment.replies.map((reply) => (
                  <Spoken
                    at={reply.createdAt}
                    author={reply.author}
                    body={reply.body}
                    key={reply.id}
                    kind="replied"
                    reply
                    seed={reply.id}
                    tone={colors.purple}
                    width={body - 20}
                  />
                ))}
              </Spoken>
            </View>
          ))}

          <Composer
            actions={
              type === 'issue'
                ? [
                    { key: 'comment', label: 'comment', primary: true },
                    thread.state === 'CLOSED'
                      ? { key: 'reopen', label: 'reopen', allowEmpty: true }
                      : { key: 'close', label: 'close issue', allowEmpty: true },
                  ]
                : [{ key: 'reply', label: 'reply', primary: true }]
            }
            demo={nav.demo}
            doing={type === 'issue' ? 'that comment' : 'that reply'}
            onSubmit={async (action, text) => {
              const token = nav.token ?? '';
              if (text) {
                if (type === 'issue') await addComment(token, thread.id, text);
                else await addDiscussionComment(token, thread.id, text);
              }
              if (action === 'close' || action === 'reopen') {
                await setIssueState(token, repo, number, action === 'close' ? 'closed' : 'open');
              }
              state.reload();
              return action === 'close'
                ? 'closed'
                : action === 'reopen'
                  ? 'reopened'
                  : 'sent · it is on github now';
            }}
            placeholder={type === 'issue' ? 'leave a comment' : 'write a reply'}
          />
        </ScrollView>
      )}
    </OverlayFrame>
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
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 10,
    },
    title: {
      flex: 1,
      fontSize: 18,
      lineHeight: 24,
    },
    state: {
      borderRadius: radii.pill,
      paddingHorizontal: 11,
      paddingVertical: 3,
    },
    stateText: {
      color: colors.onBlack,
      fontSize: 10,
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
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 1,
    },
    rule: {
      marginBottom: 6,
      marginTop: 10,
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
      color: colors.red,
      textAlign: 'center',
    },
    underline: {
      color: colors.ink,
      textDecorationLine: 'underline',
    },
  }),
);
