import { useEffect, useState } from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChecksPanel } from '../components/ChecksPanel';
import { Composer } from '../components/Composer';
import { Diff } from '../components/Diff';
import { DiffDots } from '../components/DiffDots';
import { Markdown } from '../components/Markdown';
import { SavedNote } from '../components/Overlay';
import { Segments } from '../components/Segments';
import { Squiggle } from '../components/Squiggle';
import { StateChip } from '../components/StateChip';
import { Body, Data, Heading, Label, Micro } from '../components/Type';
import { usePullDetail } from '../hooks/usePullDetail';
import { useNav } from '../lib/nav';
import { parsePatch, type PullComment, type PullDetailFull } from '../lib/pullDetail';
import { explain } from '../lib/rest';
import { addComment, commentOnLine, submitReview } from '../lib/writes';
import { colors, fonts, radii, space, themed } from '../theme';
import { ago, fmt } from './shared';

type Tab = 'brief' | 'talk' | 'diff' | 'checks';

const TABS: readonly (readonly [Tab, string])[] = [
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
export function PullScreen({ repo, number }: { repo: string; number: number }) {
  const nav = useNav();
  const onClose = nav.close;
  const { width } = useWindowDimensions();
  const state = usePullDetail(nav.token, nav.login, repo, number);
  const [tab, setTab] = useState<Tab>('brief');
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

  const pull = state.status === 'ready' ? state.pull : null;
  const token = nav.token ?? '';

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
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              Linking.openURL(`https://github.com/${repo}/pull/${number}`).catch(
                () => {},
              )
            }
          >
            <Label style={styles.underline}>open it on github</Label>
          </Pressable>
        </View>
      )}

      {pull && (
        <>
          <Header pull={pull} />

          <Segments
            current={TABS.findIndex(([value]) => value === tab)}
            items={TABS.map(([value, label]) =>
              value === 'talk'
                ? `${label} ${pull.comments.length}`
                : value === 'diff'
                  ? `${label} ${pull.changedFiles}`
                  : label,
            )}
            onSelect={(index) => setTab(TABS[index][0])}
          />

          <ScrollView
            contentContainerStyle={styles.page}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {tab === 'brief' && <Markdown source={pull.body} width={body} />}
            {tab === 'talk' && (
              <>
                <Conversation pull={pull} width={body} />
                <Composer
                  actions={[
                    { key: 'comment', label: 'comment', primary: true },
                    ...(!pull.viewerIsAuthor && pull.state === 'OPEN'
                      ? [
                          { key: 'approve', label: 'approve', allowEmpty: true },
                          { key: 'changes', label: 'request changes' },
                        ]
                      : []),
                  ]}
                  demo={nav.demo}
                  doing={'that review'}
                  onSubmit={async (action, text) => {
                    if (action === 'comment') await addComment(token, pull.id, text);
                    if (action === 'approve') await submitReview(token, pull.id, 'APPROVE', text);
                    if (action === 'changes') {
                      await submitReview(token, pull.id, 'REQUEST_CHANGES', text);
                    }
                    state.reload();
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
            {tab === 'diff' && (
              <>
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
                    state.reload();
                    return `commented on ${target.side === 'LEFT' ? 'old ' : ''}line ${target.line}`;
                  }}
                  width={body}
                />
              </>
            )}
            {tab === 'checks' && <ChecksPanel repo={repo} sha={pull.headSha} />}
          </ScrollView>

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
    </SafeAreaView>
  );
}

/** The cover of the pull request, on the widget's card. */
function Header({ pull }: { pull: PullDetailFull }) {
  return (
    <View style={styles.header}>
      <PullState pull={pull} />
      <Heading style={styles.title}>{pull.title}</Heading>

      <View style={styles.diff}>
        <DiffDots additions={pull.additions} deletions={pull.deletions} />
      </View>

      <View style={styles.statRow}>
        <Data style={styles.stat}>{fmt(pull.changedFiles)} files</Data>
        <Data style={styles.stat}>{fmt(pull.commits)} commits</Data>
        <Data style={styles.stat}>~{pull.author}</Data>
        <Data style={styles.stat}>{ago(pull.createdAt)}</Data>
      </View>
    </View>
  );
}

function PullState({ pull }: { pull: PullDetailFull }) {
  const [text, tone] = pull.isDraft
    ? ['draft', colors.ink40]
    : pull.state === 'MERGED'
      ? ['merged', colors.ink]
      : pull.state === 'CLOSED'
        ? ['closed', colors.no]
        : pull.reviewDecision === 'APPROVED'
          ? ['approved', colors.yes]
          : pull.reviewDecision === 'CHANGES_REQUESTED'
            ? ['changes', colors.no]
            : ['open', colors.ink];
  return <StateChip text={text} tone={tone} />;
}

function Conversation({ pull, width }: { pull: PullDetailFull; width: number }) {
  if (pull.comments.length === 0) {
    return <Label style={styles.note}>nobody has said anything yet</Label>;
  }

  return (
    <View>
      {pull.comments.map((comment, index) => (
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
          <Comment comment={comment} width={width} />
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

function Comment({
  comment,
  width,
  reply = false,
}: {
  comment: PullComment;
  width: number;
  reply?: boolean;
}) {
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
          <Data style={styles.author}>~{comment.author}</Data>
          <Micro style={[styles.kind, { color: tone }]}>{kindOf(comment)}</Micro>
          <Micro style={styles.when}>{ago(comment.createdAt)}</Micro>
        </View>

        {comment.path && (
          <Data style={styles.anchor} numberOfLines={1}>
            on {comment.path}
          </Data>
        )}

        {comment.diffHunk && <Hunk hunk={comment.diffHunk} />}

        <Markdown source={comment.body} width={width - 34} />

        {comment.replies?.map((child) => (
          <Comment comment={child} key={child.id} reply width={width - 20} />
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
      textDecorationLine: 'underline',
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
      backgroundColor: colors.card,
      borderRadius: radii.card,
      gap: 10,
      marginBottom: 12,
      marginHorizontal: space.gutter,
      marginTop: 10,
      padding: space.card,
    },
    diff: {
      marginTop: 4,
    },
    title: {
      fontSize: 16,
      lineHeight: 23,
    },
    statRow: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    stat: {
      color: colors.ink40,
      fontSize: 11,
    },
    page: {
      paddingBottom: 26,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    between: {
      marginVertical: 14,
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
      alignItems: 'center',
      gap: 14,
      marginTop: 30,
    },
    error: {
      color: colors.no,
    },
    underline: {
      color: colors.ink,
      textDecorationLine: 'underline',
    },
  }),
);
