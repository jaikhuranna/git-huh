import { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Markdown } from '../components/Markdown';
import { OverlayFrame, SavedNote } from '../components/Overlay';
import { Squiggle } from '../components/Squiggle';
import { Body, Data, Heading, Label, Micro } from '../components/Type';
import { useRemote, type Remote } from '../hooks/useRemote';
import {
  demoAlerts,
  demoDiscussions,
  demoEntries,
  demoIssues,
  demoReleases,
  demoRepoInfo,
  demoSearch,
} from '../lib/demo';
import { GitHubError } from '../lib/github';
import { useNav } from '../lib/nav';
import {
  fetchRepoInfo,
  listAlerts,
  listDirectory,
  listDiscussions,
  listIssues,
  listReleases,
  searchCode,
  type CodeHit,
  type RepoInfo,
} from '../lib/repo';
import { colors, fallbacks, fonts, radii, space, themed } from '../theme';
import { ago, fmt } from './shared';

type Tab = 'code' | 'issues' | 'releases' | 'discussions' | 'security';

/** Where to mint a token that can also read Dependabot alerts. */
const SECURITY_TOKEN_URL =
  'https://github.com/settings/tokens/new?scopes=read:user,repo,read:discussion,write:discussion,security_events&description=git-huh';

/**
 * A repository, from the inside.
 *
 * The repo cards used to be the end of the line — tap one and you were in a
 * browser. This is the other side of the card: the files, a search through
 * the code, the releases, the open issues, the discussions and the security
 * alerts, each of them a named gap in GitHub's own phone app.
 */
export function RepoScreen({ repo }: { repo: string }) {
  const nav = useNav();
  const [tab, setTab] = useState<Tab>('code');
  const owner = nav.login?.toLowerCase() ?? '';

  const infoDemo = useMemo(() => (nav.demo ? demoRepoInfo(repo) : undefined), [nav.demo, repo]);
  const info = useRemote(
    nav.token ? `${nav.token}|info|${repo}` : null,
    async (signal) => {
      const found = await fetchRepoInfo(nav.token ?? '', repo, signal);
      if (!found) throw new GitHubError('missing', 'Not found.');
      return found;
    },
    { cacheKey: owner ? `${owner}-repo-${repo}` : null, demo: infoDemo },
  );
  const repoInfo = info.status === 'ready' ? info.data : null;

  return (
    <OverlayFrame
      footer={
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="link"
            onPress={() => Linking.openURL(`https://github.com/${repo}`).catch(() => {})}
            style={styles.ghost}
          >
            <Label style={styles.ghostLabel}>open on github</Label>
          </Pressable>
          {repoInfo && (
            <Data numberOfLines={1} style={styles.branch}>
              {repoInfo.defaultBranch}
              {repoInfo.permission ? ` · you ${repoInfo.permission.toLowerCase()}` : ''}
            </Data>
          )}
        </View>
      }
      onBack={nav.close}
      where={repo}
    >
      {info.status === 'ready' && <SavedNote offline={info.offline} savedAt={info.savedAt} />}
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Heading style={styles.title}>{repo.split('/')[1]}</Heading>
        {repoInfo?.description ? <Body style={styles.description}>{repoInfo.description}</Body> : null}
        {repoInfo && (
          <View style={styles.stats}>
            <Data style={styles.stat}>★ {fmt(repoInfo.stars)}</Data>
            <Data style={styles.stat}>⑂ {fmt(repoInfo.forks)}</Data>
            {repoInfo.language && (
              <View style={styles.lang}>
                <View style={[styles.swatch, { backgroundColor: repoInfo.language.color }]} />
                <Data style={styles.stat}>{repoInfo.language.name}</Data>
              </View>
            )}
            {repoInfo.isPrivate && <Data style={styles.stat}>private</Data>}
          </View>
        )}
        {info.status === 'error' && (
          <Label style={styles.error}>
            {info.error instanceof GitHubError && info.error.kind === 'missing'
              ? 'github could not find this repository · or this token cannot see it'
              : 'could not read this repository'}
          </Label>
        )}

        <View style={styles.tabs}>
          {(
            [
              ['code', 'code'],
              ['issues', repoInfo ? `issues ${fmt(repoInfo.openIssues)}` : 'issues'],
              ['releases', 'releases'],
              ['discussions', 'discussions'],
              ['security', 'security'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: tab === value }}
              key={value}
              onPress={() => setTab(value)}
              style={[styles.chip, tab === value && styles.chipOn]}
            >
              <Label style={tab === value ? styles.chipLabelOn : undefined}>{label}</Label>
            </Pressable>
          ))}
        </View>

        {tab === 'code' && <Code info={repoInfo} repo={repo} />}
        {tab === 'issues' && <Issues repo={repo} />}
        {tab === 'releases' && <Releases repo={repo} />}
        {tab === 'discussions' && <Discussions info={repoInfo} repo={repo} />}
        {tab === 'security' && <Security repo={repo} />}
      </ScrollView>
    </OverlayFrame>
  );
}

// --- code --------------------------------------------------------------------

function Code({ repo, info }: { repo: string; info: RepoInfo | null }) {
  const nav = useNav();
  const [path, setPath] = useState('');
  const [draft, setDraft] = useState('');
  const [terms, setTerms] = useState('');
  const ref = info?.defaultBranch ?? '';
  const owner = nav.login?.toLowerCase() ?? '';

  const listDemo = useMemo(() => (nav.demo ? demoEntries(path) : undefined), [nav.demo, path]);
  const listing = useRemote(
    nav.token && !terms ? `${nav.token}|ls|${repo}|${ref}|${path}` : null,
    (signal) => listDirectory(nav.token ?? '', repo, path, ref, signal),
    { cacheKey: owner ? `${owner}-ls-${repo}-${path || 'root'}` : null, demo: listDemo },
  );

  const searchDemo = useMemo(
    () => (nav.demo && terms ? demoSearch(terms) : undefined),
    [nav.demo, terms],
  );
  const search = useRemote(
    nav.token && terms ? `${nav.token}|search|${repo}|${terms}` : null,
    (signal) => searchCode(nav.token ?? '', terms, { repo }, signal),
    { demo: searchDemo },
  );

  const crumbs = path ? path.split('/') : [];

  return (
    <View>
      <SearchField
        draft={draft}
        onChange={setDraft}
        onClear={() => {
          setDraft('');
          setTerms('');
        }}
        onSubmit={() => setTerms(draft.trim())}
        placeholder={`search the code in ${repo.split('/')[1]}`}
        searching={terms.length > 0}
      />

      {terms ? (
        <SearchResults state={search} terms={terms} />
      ) : (
        <>
          <View style={styles.crumbs}>
            <Pressable accessibilityRole="button" onPress={() => setPath('')}>
              <Data style={crumbs.length === 0 ? styles.crumbOn : styles.crumb}>{repo.split('/')[1]}</Data>
            </Pressable>
            {crumbs.map((crumb, index) => (
              <View key={index} style={styles.crumbPair}>
                <Data style={styles.crumbSlash}>/</Data>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPath(crumbs.slice(0, index + 1).join('/'))}
                >
                  <Data style={index === crumbs.length - 1 ? styles.crumbOn : styles.crumb}>{crumb}</Data>
                </Pressable>
              </View>
            ))}
          </View>

          {listing.status === 'loading' && <Label style={styles.note}>opening the folder…</Label>}
          {listing.status === 'error' && <Label style={styles.error}>could not list this folder</Label>}
          {listing.status === 'ready' &&
            listing.data.map((entry) => (
              <Pressable
                accessibilityRole="button"
                key={entry.path}
                onPress={() =>
                  entry.type === 'dir'
                    ? setPath(entry.path)
                    : nav.open({ kind: 'file', repo, path: entry.path, ref })
                }
                style={styles.entry}
              >
                <Data style={entry.type === 'dir' ? styles.dir : styles.file}>
                  {entry.name}
                  {entry.type === 'dir' ? '/' : ''}
                </Data>
                {entry.type === 'file' && <Micro style={styles.size}>{size(entry.size)}</Micro>}
              </Pressable>
            ))}
        </>
      )}
    </View>
  );
}

export function SearchField({
  draft,
  onChange,
  onSubmit,
  onClear,
  placeholder,
  searching,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  placeholder: string;
  searching: boolean;
}) {
  return (
    <View style={styles.searchRow}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.ink40}
        returnKeyType="search"
        style={styles.search}
        value={draft}
      />
      {searching ? (
        <Pressable accessibilityRole="button" onPress={onClear} style={styles.ghost}>
          <Label style={styles.ghostLabel}>clear</Label>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={!draft.trim()}
          onPress={onSubmit}
          style={[styles.solid, !draft.trim() && styles.disabled]}
        >
          <Label style={styles.solidLabel}>search</Label>
        </Pressable>
      )}
    </View>
  );
}

export function SearchResults({
  state,
  terms,
}: {
  state: Remote<{ total: number; hits: CodeHit[] }>;
  terms: string;
}) {
  const nav = useNav();
  if (state.status === 'loading') return <Label style={styles.note}>searching…</Label>;
  if (state.status === 'error') {
    return (
      <Label style={styles.error}>
        {state.error instanceof GitHubError && state.error.kind === 'forbidden'
          ? 'github is rate-limiting code search · ten a minute · try again shortly'
          : 'the search did not go through'}
      </Label>
    );
  }
  if (state.status !== 'ready') return null;

  return (
    <View>
      <Micro style={styles.hint}>
        {fmt(state.data.total)} {state.data.total === 1 ? 'file matches' : 'files match'} “{terms}” · default branch only
      </Micro>
      {state.data.hits.map((hit) => (
        <Pressable
          accessibilityRole="button"
          key={`${hit.repo}/${hit.path}`}
          onPress={() => nav.open({ kind: 'file', repo: hit.repo, path: hit.path, find: terms })}
          style={styles.hit}
        >
          <Data numberOfLines={1} style={styles.hitPath}>
            {hit.path}
          </Data>
          <Micro style={styles.hitRepo}>{hit.repo}</Micro>
          {hit.fragments.map((fragment, index) => (
            <Data key={index} numberOfLines={3} style={styles.fragment}>
              {fragment.trim()}
            </Data>
          ))}
        </Pressable>
      ))}
    </View>
  );
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kb`;
  return `${(bytes / 1024 / 1024).toFixed(1)} mb`;
}

// --- issues ------------------------------------------------------------------

function Issues({ repo }: { repo: string }) {
  const nav = useNav();
  const demo = useMemo(() => (nav.demo ? demoIssues() : undefined), [nav.demo]);
  const issues = useRemote(
    nav.token ? `${nav.token}|issues|${repo}` : null,
    (signal) => listIssues(nav.token ?? '', repo, signal),
    { cacheKey: nav.login ? `${nav.login.toLowerCase()}-issues-${repo}` : null, demo },
  );

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => nav.open({ kind: 'new-issue', repo })}
        style={[styles.solid, styles.newIssue]}
      >
        <Label style={styles.solidLabel}>new issue</Label>
      </Pressable>
      {issues.status === 'loading' && <Label style={styles.note}>reading the issues…</Label>}
      {issues.status === 'error' && <Label style={styles.error}>could not read the issues</Label>}
      {issues.status === 'ready' && issues.data.length === 0 && (
        <Label style={styles.note}>no open issues · nothing is on fire</Label>
      )}
      {issues.status === 'ready' &&
        issues.data.map((issue) => (
          <Pressable
            accessibilityRole="button"
            key={issue.number}
            onPress={() => nav.open({ kind: 'thread', repo, number: issue.number, type: 'issue' })}
            style={styles.row}
          >
            <View style={styles.rowTop}>
              <Data style={styles.number}>#{issue.number}</Data>
              <Micro style={styles.age}>{ago(issue.createdAt)}</Micro>
            </View>
            <Body numberOfLines={2}>{issue.title}</Body>
            <Micro style={styles.by}>
              ~{issue.author}
              {issue.comments > 0 ? ` · ${issue.comments} ${issue.comments === 1 ? 'comment' : 'comments'}` : ''}
              {issue.labels.length > 0 ? ` · ${issue.labels.map((label) => label.name).join(', ')}` : ''}
            </Micro>
          </Pressable>
        ))}
    </View>
  );
}

// --- releases ----------------------------------------------------------------

function Releases({ repo }: { repo: string }) {
  const nav = useNav();
  const { width } = useWindowDimensions();
  const [openId, setOpenId] = useState<number | null>(null);
  const demo = useMemo(() => (nav.demo ? demoReleases() : undefined), [nav.demo]);
  const releases = useRemote(
    nav.token ? `${nav.token}|releases|${repo}` : null,
    (signal) => listReleases(nav.token ?? '', repo, signal),
    { cacheKey: nav.login ? `${nav.login.toLowerCase()}-releases-${repo}` : null, demo },
  );

  if (releases.status === 'loading') return <Label style={styles.note}>reading the releases…</Label>;
  if (releases.status === 'error') return <Label style={styles.error}>could not read the releases</Label>;
  if (releases.status !== 'ready') return null;
  if (releases.data.length === 0) return <Label style={styles.note}>nothing released yet</Label>;

  return (
    <View>
      {releases.data.map((release, index) => {
        const open = openId === release.id || (openId == null && index === 0);
        return (
          <View key={release.id} style={styles.release}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpenId(open ? -1 : release.id)}
              style={styles.releaseHead}
            >
              <Heading style={styles.releaseName}>{release.name}</Heading>
              <View style={styles.releaseMeta}>
                <Data style={styles.stat}>{release.tag}</Data>
                {release.publishedAt && <Data style={styles.stat}>{ago(release.publishedAt)}</Data>}
                {release.prerelease && <Data style={styles.stat}>pre-release</Data>}
                {release.assets > 0 && (
                  <Data style={styles.stat}>
                    {release.assets} {release.assets === 1 ? 'asset' : 'assets'}
                  </Data>
                )}
                <Micro style={styles.fold}>{open ? '−' : '+'}</Micro>
              </View>
            </Pressable>
            {open && (
              <View style={styles.releaseBody}>
                <Markdown source={release.body} width={width - space.gutter * 2} />
              </View>
            )}
            {index < releases.data.length - 1 && (
              <Squiggle amplitude={2} length={width - space.gutter * 2} opacity={0.25} phase={index * 3} wavelength={12} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// --- discussions -------------------------------------------------------------

function Discussions({ repo, info }: { repo: string; info: RepoInfo | null }) {
  const nav = useNav();
  const enabled = info?.discussionsEnabled ?? true;
  const demo = useMemo(() => (nav.demo ? demoDiscussions() : undefined), [nav.demo]);
  const discussions = useRemote(
    nav.token && enabled ? `${nav.token}|discussions|${repo}` : null,
    (signal) => listDiscussions(nav.token ?? '', repo, signal),
    { cacheKey: nav.login ? `${nav.login.toLowerCase()}-discussions-${repo}` : null, demo },
  );

  if (!enabled) return <Label style={styles.note}>discussions are off for this repository</Label>;
  if (discussions.status === 'loading') return <Label style={styles.note}>reading the discussions…</Label>;
  if (discussions.status === 'error') {
    return (
      <Label style={styles.error}>
        {discussions.error instanceof GitHubError && discussions.error.kind === 'forbidden'
          ? 'this token cannot read discussions · it needs read:discussion'
          : 'could not read the discussions'}
      </Label>
    );
  }
  if (discussions.status !== 'ready') return null;
  if (discussions.data.length === 0) return <Label style={styles.note}>nobody has started one yet</Label>;

  return (
    <View>
      {discussions.data.map((discussion) => (
        <Pressable
          accessibilityRole="button"
          key={discussion.number}
          onPress={() =>
            nav.open({ kind: 'thread', repo, number: discussion.number, type: 'discussion' })
          }
          style={styles.row}
        >
          <View style={styles.rowTop}>
            <Data style={styles.number}>{discussion.category.toLowerCase()}</Data>
            <Micro style={styles.age}>{ago(discussion.updatedAt)}</Micro>
          </View>
          <Body numberOfLines={2}>{discussion.title}</Body>
          <Micro style={styles.by}>
            ~{discussion.author} · {discussion.comments} {discussion.comments === 1 ? 'reply' : 'replies'}
            {discussion.answered ? ' · answered' : ''}
          </Micro>
        </Pressable>
      ))}
    </View>
  );
}

// --- security ----------------------------------------------------------------

const SEVERITY = themed<Record<string, string>>(() => ({
  critical: colors.red,
  high: colors.red,
  medium: colors.yellow,
  low: colors.ink40,
}));

function Security({ repo }: { repo: string }) {
  const nav = useNav();
  const demo = useMemo(() => (nav.demo ? demoAlerts() : undefined), [nav.demo]);
  const alerts = useRemote(
    nav.token ? `${nav.token}|alerts|${repo}` : null,
    (signal) => listAlerts(nav.token ?? '', repo, signal),
    { cacheKey: nav.login ? `${nav.login.toLowerCase()}-alerts-${repo}` : null, demo },
  );

  if (alerts.status === 'loading') return <Label style={styles.note}>reading the alerts…</Label>;
  if (alerts.status === 'error') return <Label style={styles.error}>could not read the alerts</Label>;
  if (alerts.status !== 'ready') return null;
  if (alerts.data === 'disabled') {
    return <Label style={styles.note}>dependabot alerts are off for this repository</Label>;
  }
  if (alerts.data === 'no-scope') {
    return (
      <View style={styles.scope}>
        <Label style={styles.error}>
          this token cannot read security alerts · it needs security_events · no list is not the same as no alerts
        </Label>
        <Pressable
          accessibilityRole="link"
          onPress={() => Linking.openURL(SECURITY_TOKEN_URL).catch(() => {})}
          style={styles.ghost}
        >
          <Label style={styles.ghostLabel}>make a token that can →</Label>
        </Pressable>
      </View>
    );
  }
  if (alerts.data.length === 0) return <Label style={styles.note}>no open alerts</Label>;

  return (
    <View>
      {alerts.data.map((alert) => (
        <View key={alert.number} style={styles.alert}>
          <View style={[styles.alertRule, { backgroundColor: SEVERITY[alert.severity] ?? colors.ink40 }]} />
          <View style={styles.alertBody}>
            <View style={styles.rowTop}>
              <Data style={styles.number}>
                {alert.pkg} · {alert.severity}
              </Data>
              <Micro style={styles.age}>{alert.ecosystem}</Micro>
            </View>
            <Body numberOfLines={3} style={styles.alertSummary}>
              {alert.summary}
            </Body>
            <Micro style={styles.by}>
              {alert.vulnerable}
              {alert.patched ? ` → fixed in ${alert.patched}` : ' · no fix yet'} · {alert.manifest}
            </Micro>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    page: {
      paddingBottom: 30,
      paddingHorizontal: space.gutter,
      paddingTop: 4,
    },
    title: {
      fontSize: 22,
      lineHeight: 28,
    },
    description: {
      color: colors.ink70,
      marginTop: 4,
    },
    stats: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 10,
    },
    stat: {
      color: colors.ink70,
      fontSize: 11,
    },
    lang: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 5,
    },
    swatch: {
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    tabs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
      marginTop: 18,
    },
    chip: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    chipLabelOn: {
      color: colors.onBlack,
    },
    searchRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    search: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      color: colors.ink,
      flex: 1,
      fontFamily: fonts.mono ?? fallbacks.mono,
      fontSize: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    crumbs: {
      alignItems: 'baseline',
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 6,
      marginTop: 14,
    },
    crumbPair: {
      alignItems: 'baseline',
      flexDirection: 'row',
    },
    crumb: {
      color: colors.ink40,
      fontSize: 12,
      textDecorationLine: 'underline',
    },
    crumbOn: {
      color: colors.ink,
      fontSize: 12,
    },
    crumbSlash: {
      color: colors.ink20,
      fontSize: 12,
      marginHorizontal: 4,
    },
    entry: {
      alignItems: 'baseline',
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    dir: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
      fontSize: 12,
    },
    file: {
      color: colors.ink70,
      fontSize: 12,
    },
    size: {
      color: colors.ink40,
    },
    hint: {
      color: colors.ink40,
      marginBottom: 6,
      marginTop: 12,
    },
    hit: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      gap: 3,
      paddingVertical: 10,
    },
    hitPath: {
      color: colors.ink,
      fontSize: 12,
    },
    hitRepo: {
      color: colors.ink40,
    },
    fragment: {
      backgroundColor: colors.recess,
      borderRadius: 6,
      color: colors.ink70,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 3,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    row: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      gap: 3,
      paddingVertical: 11,
    },
    rowTop: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    number: {
      color: colors.ink,
      fontSize: 11,
    },
    age: {
      color: colors.ink40,
    },
    by: {
      color: colors.ink40,
    },
    newIssue: {
      alignSelf: 'flex-start',
      marginBottom: 12,
    },
    release: {
      paddingBottom: 12,
    },
    releaseHead: {
      gap: 4,
      paddingVertical: 8,
    },
    releaseName: {
      fontSize: 15,
    },
    releaseMeta: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    fold: {
      color: colors.ink,
      fontSize: 12,
      marginLeft: 'auto',
    },
    releaseBody: {
      paddingBottom: 12,
    },
    alert: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 11,
    },
    alertRule: {
      borderRadius: 2,
      width: 3,
    },
    alertBody: {
      flex: 1,
      gap: 3,
    },
    alertSummary: {
      fontSize: 13,
      lineHeight: 18,
    },
    scope: {
      alignItems: 'flex-start',
      gap: 12,
    },
    note: {
      marginTop: 16,
    },
    error: {
      color: colors.red,
      lineHeight: 16,
      marginTop: 14,
    },
    footer: {
      alignItems: 'center',
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 12,
      paddingBottom: 8,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    branch: {
      color: colors.ink40,
      flex: 1,
      fontSize: 10,
    },
    ghost: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    ghostLabel: {
      color: colors.ink,
    },
    solid: {
      backgroundColor: colors.black,
      borderColor: colors.black,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    solidLabel: {
      color: colors.onBlack,
    },
    disabled: {
      opacity: 0.4,
    },
  }),
);
