import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  accountCachePrefixes,
  composeKey,
  credentialGeneration,
  escapeName,
  KEY_SEPARATOR,
} from './cacheKey';

describe('escapeName', () => {
  it('keeps plain names as they are', () => {
    assert.equal(escapeName('jaikhuranna'), 'jaikhuranna');
    assert.equal(escapeName('owner-repo.main'), 'owner-repo.main');
  });

  it('escapes a literal underscore, so it cannot be confused with an escape', () => {
    assert.notEqual(escapeName('_47_'), escapeName('/'));
    assert.notEqual(escapeName('a_b'), escapeName('a/b'));
  });

  it('is injective over adversarial names', () => {
    const names = ['a/b', 'a_b', '_47_', 'a_2f_b', 'a2fb', 'x.y', 'x-y', 'x\u0001y', ''];
    const seen = new Map<string, string>();
    for (const name of names) {
      const escaped = escapeName(name);
      assert.equal(seen.get(escaped), undefined, `${name} collided with ${seen.get(escaped)}`);
      seen.set(escaped, name);
    }
  });
});

describe('composeKey', () => {
  it('makes dash-boundary tuples distinct', () => {
    // The finding: branch "a-b" + path "c" must not equal branch "a" + path "b-c".
    assert.notEqual(composeKey('me', 'file', 'a-b', 'c'), composeKey('me', 'file', 'a', 'b-c'));
  });

  it('keeps the account first and lower case', () => {
    assert.equal(composeKey('Me', 'file').startsWith(`me${KEY_SEPARATOR}`), true);
  });

  it('gives an account-less resource a marker no login can make', () => {
    assert.equal(composeKey(null, 'home-settings').startsWith('~'), true);
  });

  it('treats null and undefined parts the same', () => {
    assert.equal(composeKey('me', 'x', null), composeKey('me', 'x', undefined));
  });
});

describe('credentialGeneration', () => {
  it('does not contain the credential and stays stable for one credential', () => {
    const token = 'ghp_super-secret-token';
    const first = credentialGeneration(token);
    assert.equal(first.includes(token), false);
    assert.equal(credentialGeneration(token), first);
    assert.match(first, /^[0-9a-f]+$/);
  });

  it('gives every credential its own name, including tokens one character apart', () => {
    const tokens = [
      'ghp_account-one',
      'ghp_account-two',
      'ghp_account-onf',
      'github_pat_work',
      'github_pat_home',
      '',
      'a',
      'b',
    ];
    const names = tokens.map(credentialGeneration);
    assert.equal(new Set(names).size, names.length);
  });

  it('is longer than a 32-bit hash, so a short digest cannot pass', () => {
    // FNV-1a in hex is 8 characters. A collision-resistant name is much longer.
    assert.ok(credentialGeneration('ghp_account-one').length > 8);
  });

  it('matches the published SHA-256 of the empty credential and of "abc"', () => {
    assert.equal(
      credentialGeneration(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    assert.equal(
      credentialGeneration('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('accountCachePrefixes', () => {
  it('covers both the current key shape and the older login-dash files', () => {
    const [current, legacy] = accountCachePrefixes('Me');
    assert.equal(current, `me${KEY_SEPARATOR}`.replace(KEY_SEPARATOR, `_1_`));
    assert.equal(legacy, 'me-');
    // The current shape as it lands on disk: the separator escaped.
    assert.equal(escapeName(`me${KEY_SEPARATOR}`), current);
  });
});
