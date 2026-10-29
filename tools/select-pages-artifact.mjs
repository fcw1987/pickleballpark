// Select only a successful Quality main-push run and its immutable Pages tar.
// This module performs no writes to GitHub and never executes artifact code.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const QUALITY_JOBS = Object.freeze(['Checks', 'Chromium', 'WebKit', 'Package', 'Rally calibration', 'Quality gate']);
const validSha = value => /^[0-9a-f]{40}$/.test(value || '');

export function validatePublicationSelection({ repository, defaultBranch, currentMain, revision, workflowId, run, jobs, artifacts }) {
  if (defaultBranch !== 'main' || !validSha(revision) || revision !== currentMain) throw Error('Publication requires the exact current main commit');
  if (!Number.isSafeInteger(run.id) || run.id <= 0 || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || run.event !== 'push' || run.head_branch !== 'main' || run.head_sha !== revision
    || run.status !== 'completed' || run.conclusion !== 'success'
    || run.path !== '.github/workflows/quality.yml' || run.workflow_id !== workflowId) throw Error('Quality run is not a trusted successful main push for this commit');
  for (const name of QUALITY_JOBS) {
    const matching = jobs.filter(job => job.name === name);
    if (matching.length !== 1 || matching[0].status !== 'completed' || matching[0].conclusion !== 'success') throw Error(`Required Quality job is not uniquely successful: ${name}`);
  }
  const candidates = artifacts.filter(artifact => artifact.name === 'github-pages');
  if (candidates.length !== 1) throw Error('Exactly one verified Pages artifact is required');
  const artifact = candidates[0];
  if (artifact.expired !== false || !Number.isSafeInteger(artifact.id) || artifact.id <= 0
    || artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== revision
    || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest || '')) throw Error('Pages artifact identity, expiry or digest is invalid');
  return { commit_sha: revision, quality_run_id: String(run.id), artifact_id: String(artifact.id), artifact_digest: artifact.digest };
}

const api = route => JSON.parse(execFileSync('gh', ['api', '--method', 'GET', route], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 }));
const pages = (route, field) => {
  const values = [];
  for (let page = 1; ; page++) {
    const result = api(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    values.push(...result[field]);
    if (result[field].length < 100) return values;
  }
};

export function selectPagesArtifact({ confirm = false, env = process.env } = {}) {
  if (env.GITHUB_REF !== 'refs/heads/main') throw Error('Deployment workflow must execute on main');
  const repository = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw Error('Invalid repository identity');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH));
  const repo = api(`repos/${repository}`);
  const currentMain = api(`repos/${repository}/git/ref/heads/main`).object.sha;
  let revision, runId;
  if (confirm) {
    revision = env.TARGET_SHA;
    runId = env.QUALITY_RUN_ID;
  } else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    revision = event.inputs?.commit_sha;
  } else if (env.GITHUB_EVENT_NAME === 'workflow_run') {
    const trigger = event.workflow_run;
    if (event.action !== 'completed' || trigger?.event !== 'push' || trigger.head_branch !== 'main'
      || trigger.conclusion !== 'success' || trigger.head_repository?.full_name !== repository) throw Error('Untrusted workflow completion event');
    revision = trigger.head_sha;
    runId = String(trigger.id);
  } else throw Error('Unsupported deployment trigger');
  if (repo.default_branch !== 'main' || !validSha(revision) || revision !== currentMain) throw Error('Publication requires the exact current main commit');
  const workflow = api(`repos/${repository}/actions/workflows/quality.yml`);
  if (!runId) {
    const query = new URLSearchParams({ branch: 'main', event: 'push', status: 'success', head_sha: revision, per_page: '100' });
    const runs = api(`repos/${repository}/actions/workflows/quality.yml/runs?${query}`).workflow_runs;
    const selected = runs.find(run => run.head_sha === revision && run.head_branch === 'main' && run.event === 'push' && run.conclusion === 'success');
    if (!selected) throw Error('No successful main-push Quality run exists for the requested commit');
    runId = String(selected.id);
  }
  if (!/^[1-9]\d*$/.test(runId || '')) throw Error('Invalid Quality run ID');
  const run = api(`repos/${repository}/actions/runs/${runId}`);
  const jobs = pages(`repos/${repository}/actions/runs/${runId}/jobs?filter=latest`, 'jobs');
  const artifacts = pages(`repos/${repository}/actions/runs/${runId}/artifacts`, 'artifacts');
  const selection = validatePublicationSelection({ repository, defaultBranch: repo.default_branch, currentMain, revision, workflowId: workflow.id, run, jobs, artifacts });
  if (confirm && (selection.artifact_id !== env.PAGES_ARTIFACT_ID || selection.artifact_digest !== env.PAGES_ARTIFACT_DIGEST)) throw Error('Verified artifact identity changed before deployment');
  return selection;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const selection = selectPagesArtifact({ confirm: process.argv.includes('--confirm') });
  if (process.env.GITHUB_OUTPUT) for (const [key, value] of Object.entries(selection)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  console.log(JSON.stringify(selection));
}
