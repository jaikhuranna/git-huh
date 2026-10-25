import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { FormScrollView } from '../components/FormScrollView';
import { Composer } from '../components/Composer';
import { OverlayFrame } from '../components/Overlay';
import { Label, Micro } from '../components/Type';
import { noteCreated } from '../hooks/usePullDetail';
import { useRemote } from '../hooks/useRemote';
import { demoRepoInfo } from '../lib/demo';
import { eventually } from '../lib/eventually';
import { listBranches, listCategories } from '../lib/explore';
import { GitHubError } from '../lib/github';
import { update } from '../lib/ideas';
import { ideasStore } from '../lib/ideasStorage';
import { pullRoute, useNav } from '../lib/nav';
import { fetchRepoInfo, listReleases } from '../lib/repo';
import {
  createDiscussion,
  createFile,
  createGist,
  createPull,
  createRelease,
  createRepo,
} from '../lib/writes';
import { colors, fonts, radii, space, themed } from '../theme';
import { Chips } from './shared';

/**
 * The pages that make something new on GitHub: a pull request from a
 * branch, a release, a discussion, a repository, a file, a gist. Each is a
 * few labelled fields over one composer row; the verb names what will exist
 * when it is pressed, and a made thing replaces the form with its own page.
 */

function Form({ where, children }: { where: string; children: ReactNode }) {
  const nav = useNav();
  return (
    <OverlayFrame onBack={nav.close} where={where}>
      <FormScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </FormScrollView>
    </OverlayFrame>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /** Names, paths and tags: no autocorrect, no capitals. */
  mono?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Label style={styles.label}>{label}</Label>
      <TextInput
        autoCapitalize={mono ? 'none' : 'sentences'}
        autoCorrect={!mono}
        multiline={multiline}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.ink40}
        spellCheck={!mono}
        style={[styles.input, multiline && styles.multiline]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Chips
      current={on ? 'on' : 'off'}
      items={[{ key: 'on', label }]}
      onSelect={() => onChange(!on)}
    />
  );
}

// --- a pull request --------------------------------------------------------------

export function NewPullScreen({ repo, head: startHead }: { repo: string; head?: string }) {
  const nav = useNav();
  const [head, setHead] = useState(startHead ?? '');
  const [base, setBase] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const owner = nav.login?.toLowerCase() ?? '';

  const info = useRemote(
    nav.token ? `${nav.token}|info|${repo}` : null,
    async (signal) => {
      const found = await fetchRepoInfo(nav.token ?? '', repo, signal);
      if (!found) throw new GitHubError('missing', 'Not found.');
      return found;
    },
    { cacheKey: owner ? `${owner}-repo2-${repo}` : null, demo: nav.demo ? demoRepoInfo(repo) : undefined },
  );
  const branches = useRemote(
    nav.token ? `${nav.token}|branches|${repo}` : null,
    (signal) => listBranches(nav.token ?? '', repo, signal),
    {
      demo: nav.demo
        ? [
            { name: 'main', protected: true },
            { name: 'monochrome-layer', protected: false },
          ]
        : undefined,
    },
  );
  const defaultBranch = info.status === 'ready' ? info.data.defaultBranch : 'main';
  const into = base ?? defaultBranch;
  const names = branches.status === 'ready' ? branches.data.map((branch) => branch.name) : [];

  return (
    <Form where={`${repo} · new pull request`}>
      <Label style={styles.label}>from</Label>
      {names.length > 0 ? (
        <Chips
          current={head}
          items={names.filter((name) => name !== into).map((name) => ({ key: name, label: name }))}
          onSelect={setHead}
        />
      ) : null}
      <Field
        label="or a branch in a fork"
        mono
        onChange={setHead}
        placeholder="branch, or owner:branch"
        value={head}
      />
      <Label style={styles.label}>into</Label>
      {names.length > 0 ? (
        <Chips
          current={into}
          items={names.filter((name) => name !== head.trim()).map((name) => ({ key: name, label: name }))}
          onSelect={setBase}
        />
      ) : (
        <Micro style={styles.hint}>{into}</Micro>
      )}
      <Field label="title" onChange={setTitle} value={title} />
      <Field label="description" multiline onChange={setBody} placeholder="what and why" value={body} />
      <Toggle label="open as a draft" on={draft} onChange={setDraft} />
      <Composer
        actions={[
          {
            key: 'open',
            label: draft ? 'open draft pull request' : 'open pull request',
            primary: true,
            disabled: !head.trim() || !title.trim() || head.trim() === into,
          },
        ]}
        bare
        demo={nav.demo}
        doing="that pull request"
        onSubmit={async () => {
          const number = await createPull(nav.token ?? '', repo, {
            title: title.trim(),
            body,
            head: head.trim(),
            base: into,
            draft,
          });
          noteCreated('pull', repo, number);
 nav.replace(pullRoute({ repo, number }));
          return `opened #${number}`;
        }}
      />
    </Form>
  );
}

// --- a release -------------------------------------------------------------------

export function NewReleaseScreen({ repo }: { repo: string }) {
  const nav = useNav();
  const [tag, setTag] = useState('');
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [prerelease, setPrerelease] = useState(false);
  const [notes, setNotes] = useState(true);
  // The wait after a confirmed create is the only read here that retries.
  // Leaving the form aborts it; an ordinary list of releases stays one attempt.
  const publish = useRef<AbortController | null>(null);
  useEffect(() => () => publish.current?.abort(), []);

  return (
    <Form where={`${repo} · new release`}>
      <Field label="tag" mono onChange={setTag} placeholder="v1.0.0 · made if it does not exist" value={tag} />
      <Field
        label="from"
        mono
        onChange={setTarget}
        placeholder="a branch or commit · the default branch if empty"
        value={target}
      />
      <Field label="title" onChange={setName} placeholder="the tag, if empty" value={name} />
      <Field label="notes" multiline onChange={setBody} value={body} />
      <View style={styles.toggles}>
        <Toggle label="pre-release" on={prerelease} onChange={setPrerelease} />
        <Toggle label="write notes from the pull requests" on={notes} onChange={setNotes} />
      </View>
      <Composer
        actions={[
          { key: 'publish', label: 'publish release', primary: true, disabled: !tag.trim() },
          { key: 'draft', label: 'save as draft', disabled: !tag.trim() },
        ]}
        bare
        demo={nav.demo}
        doing="that release"
        onSubmit={async (key) => {
          const token = nav.token ?? '';
          await createRelease(token, repo, {
            tag: tag.trim(),
            target: target.trim(),
            name: name.trim(),
            body,
            draft: key === 'draft',
            prerelease,
            generateNotes: notes,
          });
          // The create is confirmed, so GitHub's list can lag it. Retry only
          // that propagation, and stop if the form is left. A forbidden,
          // rate-limited, or offline read is not a miss and is not asked again.
          publish.current?.abort();
          const signal = new AbortController();
          publish.current = signal;
          const made = tag.trim();
          await eventually(
            async () =>
              (await listReleases(token, repo, signal.signal)).some((release) => release.tag === made)
                ? true
                : null,
            { signal: signal.signal, recent: true },
          ).catch(() => null);
          nav.replace({ kind: 'repo', repo, tab: 'releases' });
          return key === 'draft' ? 'saved as a draft' : 'published';
        }}
      />
    </Form>
  );
}

// --- a discussion ----------------------------------------------------------------

export function NewDiscussionScreen({ repo }: { repo: string }) {
  const nav = useNav();
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const owner = nav.login?.toLowerCase() ?? '';
  const info = useRemote(
    nav.token ? `${nav.token}|info|${repo}` : null,
    (signal) => fetchRepoInfo(nav.token ?? '', repo, signal),
    { cacheKey: owner ? `${owner}-repo2-${repo}` : null, demo: nav.demo ? demoRepoInfo(repo) : undefined },
  );
  const categories = useRemote(
    nav.token ? `${nav.token}|categories|${repo}` : null,
    (signal) => listCategories(nav.token ?? '', repo, signal),
    {
      demo: nav.demo
        ? [
            { id: 'ideas', name: 'Ideas', answerable: false },
            { id: 'qa', name: 'Q&A', answerable: true },
          ]
        : undefined,
    },
  );
  const repositoryId = info.status === 'ready' ? info.data?.id : undefined;

  return (
    <Form where={`${repo} · new discussion`}>
      <Label style={styles.label}>category</Label>
      {categories.status === 'loading' && <Micro style={styles.hint}>reading the categories…</Micro>}
      {categories.status === 'error' && (
        <Micro style={styles.failed}>could not read the categories · this token may need read:discussion</Micro>
      )}
      {categories.status === 'ready' && (
        <Chips
          current={category}
          items={categories.data.map((item) => ({ key: item.id, label: item.name.toLowerCase() }))}
          onSelect={setCategory}
        />
      )}
      <Field label="title" onChange={setTitle} value={title} />
      <Field label="post" multiline onChange={setBody} value={body} />
      <Composer
        actions={[
          {
            key: 'start',
            label: 'start discussion',
            primary: true,
            disabled: !category || !title.trim() || !body.trim() || (!repositoryId && !nav.demo),
          },
        ]}
        bare
        demo={nav.demo}
        doing="that discussion"
        onSubmit={async () => {
          const number = await createDiscussion(nav.token ?? '', repositoryId ?? '', category, title.trim(), body);
          noteCreated('discussion', repo, number);
 nav.replace({ kind: 'thread', repo, number, type: 'discussion' });
          return 'started';
        }}
      />
    </Form>
  );
}

// --- a repository ----------------------------------------------------------------

export function NewRepoScreen({
  name: initialName = '',
  description: initialDescription = '',
  idea,
}: {
  name?: string;
  description?: string;
  /** The idea this repository is made from: linked to it once it exists. */
  idea?: string;
} = {}) {
  const nav = useNav();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isPrivate, setPrivate] = useState(true);
  const [readme, setReadme] = useState(true);
  const clean = name.trim().replace(/\s+/g, '-');

  return (
    <Form where="new repository">
      <Field label="name" mono onChange={setName} placeholder="under your account" value={name} />
      {clean && clean !== name && <Micro style={styles.hint}>it will be called {clean}</Micro>}
      <Field label="description" onChange={setDescription} placeholder="optional" value={description} />
      <View style={styles.toggles}>
        <Toggle label="private" on={isPrivate} onChange={setPrivate} />
        <Toggle label="start with a readme" on={readme} onChange={setReadme} />
      </View>
      <Composer
        actions={[{ key: 'make', label: 'create repository', primary: true, disabled: !clean }]}
        bare
        demo={nav.demo}
        doing="that repository"
        onSubmit={async () => {
          const made = await createRepo(nav.token ?? '', {
            name: clean,
            description: description.trim(),
            private: isPrivate,
            readme,
          });
          if (idea) {
            // The notebook is the idea's own; a failure to link it is said, not thrown.
            const store = ideasStore(nav.demo);
            try {
              const ideas = await store.load();
              await store.save(update(ideas, idea, () => ({ repo: made, stage: 'building' }), Date.now()));
            } catch {
              nav.replace({ kind: 'repo', repo: made });
              return `made ${made} · could not link it to the idea`;
            }
          }
          nav.replace({ kind: 'repo', repo: made });
          return `made ${made}`;
        }}
      />
    </Form>
  );
}

// --- a file ----------------------------------------------------------------------

export function NewFileScreen({ repo, dir, refName }: { repo: string; dir: string; refName: string }) {
  const nav = useNav();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const path = [dir, name.trim()].filter(Boolean).join('/');

  return (
    <Form where={`${repo} · new file`}>
      <Field
        label={`name · in ${dir || 'the top folder'}`}
        mono
        onChange={setName}
        placeholder="notes.md · a slash makes folders"
        value={name}
      />
      <Field label="contents" mono multiline onChange={setText} value={text} />
      <Field
        label="commit message"
        onChange={setMessage}
        placeholder={name.trim() ? `create ${name.trim()}` : 'what this adds'}
        value={message}
      />
      <Micro style={styles.hint}>commits straight onto {refName || 'the default branch'}, as you</Micro>
      <Composer
        actions={[{ key: 'commit', label: 'commit new file', primary: true, disabled: !name.trim() }]}
        bare
        demo={nav.demo}
        doing="that commit"
        onSubmit={async () => {
          await createFile(nav.token ?? '', repo, {
            path,
            text,
            message: message.trim() || `Create ${name.trim()}`,
            branch: refName,
          });
          nav.replace({ kind: 'file', repo, path, ref: refName });
          return 'committed';
        }}
      />
    </Form>
  );
}

// --- a gist ----------------------------------------------------------------------

export function NewGistScreen() {
  const nav = useNav();
  const [filename, setFilename] = useState('');
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setPublic] = useState(false);

  return (
    <Form where="new gist">
      <Field label="file name" mono onChange={setFilename} placeholder="snippet.ts" value={filename} />
      <Field label="contents" mono multiline onChange={setText} value={text} />
      <Field label="description" onChange={setDescription} placeholder="optional" value={description} />
      <Toggle label="public · anyone can find it" on={isPublic} onChange={setPublic} />
      <Micro style={styles.hint}>a secret gist is unlisted, not private · anyone with the link can read it</Micro>
      <Composer
        actions={[
          {
            key: 'make',
            label: isPublic ? 'create public gist' : 'create secret gist',
            primary: true,
            disabled: !filename.trim() || !text.trim(),
          },
        ]}
        bare
        demo={nav.demo}
        doing="that gist"
        onSubmit={async () => {
          const id = await createGist(nav.token ?? '', {
            description: description.trim(),
            filename: filename.trim(),
            text,
            public: isPublic,
          });
          nav.replace({ kind: 'gist', id });
          return 'made';
        }}
      />
    </Form>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    page: {
      gap: 4,
      paddingBottom: 40,
      paddingHorizontal: space.gutter,
      paddingTop: 8,
    },
    field: {
      gap: 6,
      marginBottom: 12,
    },
    label: {
      color: colors.ink70,
      marginBottom: 2,
      marginTop: 6,
    },
    input: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.tile,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    multiline: {
      minHeight: 140,
    },
    toggles: {
      gap: 6,
    },
    hint: {
      color: colors.ink40,
      marginBottom: 6,
    },
    failed: {
      color: colors.no,
    },
  }),
);
