import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicationSelection, QUALITY_JOBS } from '../tools/select-pages-artifact.mjs';

const selection = () => ({
  repository: 'example/park', defaultBranch: 'main', currentMain: 'a'.repeat(40), revision: 'a'.repeat(40), workflowId: 11,
  run: { id: 77, repository: { full_name: 'example/park' }, head_repository: { full_name: 'example/park' },
    workflow_id: 11, path: '.github/workflows/quality.yml', event: 'push', head_branch: 'main', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success' },
  jobs: QUALITY_JOBS.map(name => ({ name, status: 'completed', conclusion: 'success' })),
  artifacts: [{ id: 101, name: 'github-pages', expired: false, digest: `sha256:${'b'.repeat(64)}`, workflow_run: { id: 77, head_sha: 'a'.repeat(40) } }]
});

test('selects immutable Pages artifact only after every same-commit main-push job succeeds', () => {
  assert.deepEqual(validatePublicationSelection(selection()), { commit_sha: 'a'.repeat(40), quality_run_id: '77', artifact_id: '101', artifact_digest: `sha256:${'b'.repeat(64)}` });
});

test('rejects stale, malformed or non-main commit selections', () => {
  for (const change of [data => { data.currentMain = 'c'.repeat(40); }, data => { data.defaultBranch = 'release'; }, data => { data.revision = 'main'; }]) {
    const data = selection(); change(data); assert.throws(() => validatePublicationSelection(data), /current main commit/);
  }
});

test('rejects PR, fork, wrong workflow, wrong SHA, non-main and incomplete runs', () => {
  for (const change of [
    data => { data.run.event = 'pull_request'; }, data => { data.run.head_branch = 'feature'; },
    data => { data.run.head_repository.full_name = 'fork/park'; }, data => { data.run.repository.full_name = 'other/park'; },
    data => { data.run.path = '.github/workflows/other.yml'; }, data => { data.run.workflow_id = 12; },
    data => { data.run.head_sha = 'c'.repeat(40); }, data => { data.run.status = 'in_progress'; },
    data => { data.run.conclusion = 'failure'; }
  ]) { const data = selection(); change(data); assert.throws(() => validatePublicationSelection(data), /trusted successful main push/); }
});

test('rejects failed, skipped, neutral, missing or duplicate required jobs', () => {
  for (const conclusion of ['failure', 'skipped', 'neutral', 'cancelled']) {
    const data = selection(); data.jobs[0].conclusion = conclusion; assert.throws(() => validatePublicationSelection(data), /Required Quality job/);
  }
  for (const change of [data => data.jobs.pop(), data => data.jobs.push({ ...data.jobs[0] })]) {
    const data = selection(); change(data); assert.throws(() => validatePublicationSelection(data), /uniquely successful/);
  }
});

test('rejects expired, ambiguous, wrong-run and digestless artifact metadata', () => {
  for (const change of [
    data => { data.artifacts[0].expired = true; }, data => { delete data.artifacts[0].digest; },
    data => { data.artifacts[0].workflow_run.id = 78; }, data => { data.artifacts[0].workflow_run.head_sha = 'c'.repeat(40); },
    data => { data.artifacts[0].id = 0; }
  ]) { const data = selection(); change(data); assert.throws(() => validatePublicationSelection(data), /artifact identity, expiry or digest/); }
  const data = selection(); data.artifacts.push({ ...data.artifacts[0], id: 102 });
  assert.throws(() => validatePublicationSelection(data), /Exactly one/);
});
