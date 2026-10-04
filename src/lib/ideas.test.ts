import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createIdeasStore, type IdeaStorage } from './ideas';

test('ideas survive a new store instance, edits and deletion, including multiline unicode', async () => {
  let disk: string | null = null;
  const storage: IdeaStorage = {
    read: async () => disk,
    write: async (raw) => { disk = raw; },
  };
  const first = createIdeasStore(storage);
  assert.deepEqual(await first.load(), []);
  const ideas = [
    { id: 'one', text: 'garden journal\ntrack 🌱 growth', createdAt: 1 },
    { id: 'two', text: 'offline map', createdAt: 2 },
  ];
  await first.save(ideas);
  const reopened = createIdeasStore(storage);
  assert.deepEqual(await reopened.load(), ideas);
  const edited = [{ ...ideas[0], text: 'shared garden journal' }];
  await reopened.save(edited);
  assert.deepEqual(await createIdeasStore(storage).load(), edited);
  await reopened.save([]);
  assert.deepEqual(await first.load(), []);
});

test('unreadable or malformed notebooks fail instead of appearing empty', async () => {
  for (const raw of ['{', '{}', '{"version":2,"ideas":[]}', '{"version":1,"ideas":[{}]}']) {
    const store = createIdeasStore({ read: async () => raw, write: async () => {} });
    await assert.rejects(store.load());
  }
  const store = createIdeasStore({
    read: async () => { throw new Error('read failed'); },
    write: async () => {},
  });
  await assert.rejects(store.load(), /read failed/);
});

test('failed saves surface the failure and leave the previous notebook intact', async () => {
  let disk: string | null = null;
  let fail = false;
  const store = createIdeasStore({
    read: async () => disk,
    write: async (raw) => {
      if (fail) throw new Error('disk full');
      disk = raw;
    },
  });
  const original = [{ id: 'one', text: 'keep me', createdAt: 1 }];
  await store.save(original);
  fail = true;
  await assert.rejects(store.save([]), /disk full/);
  assert.deepEqual(await store.load(), original);
});

test('blank ideas are rejected before writing to storage', async () => {
  let writes = 0;
  const store = createIdeasStore({ read: async () => null, write: async () => { writes++; } });
  await assert.rejects(store.save([{ id: 'one', text: ' \n ', createdAt: 1 }]));
  assert.equal(writes, 0);
});
