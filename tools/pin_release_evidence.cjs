'use strict';
function assessChecks(runs, required) {
  return {
    failed: runs.filter(run => run.status === 'completed' && run.conclusion !== 'success'),
    missing: required.filter(name => !runs.some(run => run.name === name && run.status === 'completed' && run.conclusion === 'success')),
    pending: runs.filter(run => run.status !== 'completed')
  };
}
function exactPublication(runs, sha) {
  return runs.find(run => run.head_sha === sha) || null;
}
function assertWritable(pr) {
  if (pr && /PARKED|DO NOT MERGE|REFERENCE|\bHELD\b|\bHOLD\b/i.test((pr.title || '') + '\n' + (pr.body || ''))) {
    throw new Error('Protected release PR #' + pr.number + ': preserve its branch and hold');
  }
}
// HC4 §5.2 — the PR-denied path. GitHub's message when the repository setting
// "Allow GitHub Actions to create and approve pull requests" is off. Only this
// exact class of failure is handled green; every other creation error stays red.
const PR_DENIED = /not permitted to create or approve pull requests/i;
function classifyCreateFailure(error) {
  const text = String((error && error.message) || error || '');
  return PR_DENIED.test(text) ? 'pr-denied' : 'other';
}
const TRACKING_TITLE = 'Pin bump staged — awaiting M3';
// The staged pin for `key` inside a play-publication.json text, or '' when the
// file cannot be read as the manifest. Used to leave a current staged branch
// untouched and re-stage only when the source moved.
function stagedPin(text, key) {
  try {
    const value = JSON.parse(text)[key];
    return /^[0-9a-f]{40}$/.test(value) ? value : '';
  } catch (_) {
    return '';
  }
}
function trackingIssue(input) {
  const {source, branch, sha, key, current, head, sourceRepo, runId, runUrl, gates, restaged} = input;
  for (const field of ['source', 'branch', 'sha', 'key', 'current', 'head', 'sourceRepo', 'runId', 'runUrl']) {
    if (!input[field]) throw new Error('trackingIssue: missing ' + field);
  }
  const perf = gates && gates.perf ? gates.perf : {routes: null, red: [], inconclusive: []};
  const moved = gates && Array.isArray(gates.moved) ? gates.moved : [];
  const lines = [
    'Opened and kept current by the **Pin release** workflow (PINS.md). It could not open the release PR because GitHub Actions is not permitted to create or approve pull requests in this repository.',
    '',
    '**Owner click (M3):** Games → Settings → Actions → General → Workflow permissions → tick "Allow GitHub Actions to create and approve pull requests". Nothing in-repo substitutes for it.',
    '',
    `Latest staged state (run ${runId}: ${runUrl})`,
    '',
    '| | |', '|---|---|',
    `| source | \`${source}\` (${sourceRepo}) |`,
    `| staged branch | \`${branch}\` at \`${sha}\` (${restaged ? 're-staged: the source moved' : 'left untouched: already current'}) |`,
    `| \`${key}\` | \`${current}\` → \`${head}\` |`,
    `| gates on the proposed tree | publication contract ${gates && gates.publicationContract || 'n/a'}; save boundaries ${gates && gates.saveBoundaries || 'n/a'}; shelf contracts ${gates && gates.shelfContracts || 'n/a'}; browser acceptance ${gates && gates.browserAcceptance || 'n/a'}; perf gate ${perf.routes === null ? 'n/a' : perf.routes + ' routes, ' + perf.red.length + ' regressed' + (perf.inconclusive.length ? ', ' + perf.inconclusive.length + ' inconclusive' : '')} |`,
    `| payloads whose bytes move | ${moved.length}${moved.length ? ': ' + moved.map(r => '`' + r + '`').join(', ') : ''} |`,
    '',
    `A person can open the PR from \`${branch}\` now; once M3 is ticked the next run opens it unattended. Rollback: \`${key}\` → \`${current}\`.`
  ];
  return {title: TRACKING_TITLE, body: lines.join('\n')};
}
function findTrackingIssue(issues, title) {
  const wanted = title || TRACKING_TITLE;
  const matches = (issues || []).filter(issue => issue && !issue.pull_request && issue.title === wanted);
  if (matches.length > 1) throw new Error('More than one open tracking issue titled "' + wanted + '"; resolve by hand');
  return matches[0] || null;
}
module.exports = {assessChecks, exactPublication, assertWritable, classifyCreateFailure, stagedPin, trackingIssue, findTrackingIssue, TRACKING_TITLE};
