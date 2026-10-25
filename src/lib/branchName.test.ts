import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { firstFreePatchName, PATCH_NAME_LIMIT, patchStem, timestampPatchName } from './branchName';
import { BRANCH_ATTEMPTS, referenceExists } from './proposalWrites';
import { GitHubError } from './github';

describe('firstFreePatchName', () => {
  const stem = patchStem('Ada');

  it('starts at 1 when nothing exists', () => {
    assert.equal(firstFreePatchName(stem, []), 'ada-patch-1');
  });

  it('skips names that matching-refs already returned, full ref or bare', () => {
    const existing = ['refs/heads/ada-patch-1', 'ada-patch-2', 'refs/heads/ada-patch-4'];
    assert.equal(firstFreePatchName(stem, existing), 'ada-patch-3');
  });

  it('ignores other stems and non-numeric suffixes', () => {
    const existing = ['refs/heads/other-patch-1', 'refs/heads/ada-patch-notes', 'refs/heads/ada-patch-01'];
    assert.equal(firstFreePatchName(stem, existing), 'ada-patch-1');
  });

  it('does not walk past the limit, however many branches exist', () => {
    const existing = Array.from({ length: 30 }, (_, index) => `refs/heads/${stem}-${index + 1}`);
    assert.equal(firstFreePatchName(stem, existing), null);
    assert.equal(timestampPatchName(stem, 1_700_000_000_000).startsWith('ada-patch-'), true);
  });

  it('keeps collision retries inside the name ceiling', () => {
    assert.ok(BRANCH_ATTEMPTS <= PATCH_NAME_LIMIT);
    assert.ok(BRANCH_ATTEMPTS > 0);
  });

  it('treats only a rejected "reference already exists" as a collision', () => {
    assert.equal(
      referenceExists(new GitHubError('api', 'Reference already exists', 'rejected')),
      true,
    );
    assert.equal(
      referenceExists(new GitHubError('api', 'GitHub responded with 500.', 'unknown')),
      false,
    );
    assert.equal(
      referenceExists(new GitHubError('api', 'API rate limit exceeded', 'rate-limited')),
      false,
    );
    assert.equal(
      referenceExists(new GitHubError('forbidden', 'Resource not accessible by integration')),
      false,
    );
    assert.equal(
      referenceExists(new GitHubError('network', 'GitHub did not answer in time.', 'timeout')),
      false,
    );
    assert.equal(
      referenceExists(new GitHubError('api', 'Validation failed', 'rejected')),
      false,
    );
  });
});
