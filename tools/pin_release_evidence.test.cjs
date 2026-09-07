'use strict';
const assert = require('node:assert/strict');
const {assessChecks, exactPublication, assertWritable} = require('./pin_release_evidence.cjs');
const required = ['contract', 'aggregate'];
const real = [...required, 'browser'].map(name => ({name, status: 'completed', conclusion: 'success'}));
const green = rows => Object.values(assessChecks(rows, required)).every(rows => rows.length === 0);
assert(green(real));
for (const conclusion of ['skipped', 'neutral', 'failure', 'cancelled', null]) {
  const scratch = structuredClone(real);scratch[2].conclusion = conclusion;
  assert(!green(scratch), 'Non-success check accepted: ' + conclusion);
  scratch[2].conclusion = 'success';assert(green(scratch));
}
const pending = structuredClone(real);pending[2].status = 'in_progress';pending[2].conclusion = null;
assert(!green(pending));assert(!green(real.slice(1)));assert(!green([]));
const expected = 'a'.repeat(40), other = 'b'.repeat(40);
const publication = {head_sha: expected, status: 'completed', conclusion: 'success'};
assert.equal(exactPublication([publication], expected), publication);
const wrong = {...publication, head_sha: other};
assert.equal(exactPublication([wrong], expected), null, 'Another successful publication accepted');
assert.equal(exactPublication([wrong, publication], expected), publication);
assert.equal(exactPublication([], expected), null);
assertWritable({number: 1, title: 'Pin Site', body: 'Reviewed release'});
for (const marker of ['PARKED', 'DO NOT MERGE', 'REFERENCE', 'HELD', 'HOLD']) {
  for (const field of ['title', 'body']) {
    const pr = {number: 1, title: 'Pin Site', body: 'Reviewed release', [field]: marker};
    assert.throws(() => assertWritable(pr), /Protected release PR/);
    pr[field] = 'Reviewed release';assertWritable(pr);
  }
}
assertWritable(null);
console.log('PASS real / planted non-success, wrong SHA and protected PR rejected / restored; missing and pending rejected');

// HC4 §5.2 — PR-denied path: real → planted → restored on every helper.
const {classifyCreateFailure, stagedPin, trackingIssue, findTrackingIssue, TRACKING_TITLE} = require('./pin_release_evidence.cjs');
const denied = new Error('GitHub Actions is not permitted to create or approve pull requests.');
assert.equal(classifyCreateFailure(denied), 'pr-denied');
assert.equal(classifyCreateFailure(new Error('Validation Failed: A pull request already exists')), 'other', 'An unrelated creation error was treated as the denial');
assert.equal(classifyCreateFailure(new Error('Resource not accessible by integration')), 'other');
assert.equal(classifyCreateFailure(denied), 'pr-denied');
const manifest = JSON.stringify({site_commit: 'c'.repeat(40), lessons_commit: 'd'.repeat(40)});
assert.equal(stagedPin(manifest, 'site_commit'), 'c'.repeat(40));
assert.equal(stagedPin(manifest, 'lessons_commit'), 'd'.repeat(40));
assert.equal(stagedPin('not json', 'site_commit'), '', 'Unreadable staged manifest must read as not-current');
assert.equal(stagedPin(JSON.stringify({site_commit: 'short'}), 'site_commit'), '', 'A malformed pin must read as not-current');
assert.equal(stagedPin(manifest, 'site_commit'), 'c'.repeat(40));
const issueInput = {source: 'site', branch: 'pin-release/site', sha: '1'.repeat(40), key: 'site_commit', current: 'a'.repeat(40), head: 'b'.repeat(40), sourceRepo: 'MattRoper1977/mattroper1977.github.io', runId: 1, runUrl: 'https://example.invalid/run/1', gates: {perf: {routes: 69, red: [], inconclusive: []}, moved: ['/emberwild/'], publicationContract: 'PASS', saveBoundaries: 'PASS', shelfContracts: 'PASS', browserAcceptance: 'PASS'}, restaged: true};
const issue = trackingIssue(issueInput);
assert.equal(issue.title, TRACKING_TITLE);
for (const needle of ['pin-release/site', '1'.repeat(40), 'a'.repeat(40), 'b'.repeat(40), '69 routes, 0 regressed', '/emberwild/', 'Allow GitHub Actions to create and approve pull requests', 're-staged']) {
  assert(issue.body.includes(needle), 'Tracking issue body omits ' + needle);
}
assert(trackingIssue({...issueInput, restaged: false}).body.includes('left untouched'));
assert.throws(() => trackingIssue({...issueInput, head: ''}), /missing head/, 'A tracking issue without the staged HEAD must not be written');
const open = [{number: 3, title: 'Pin bump staged — awaiting M3 (old)'}, {number: 4, title: TRACKING_TITLE}, {number: 5, title: 'Something else'}, {number: 6, title: TRACKING_TITLE, pull_request: {}}];
assert.equal(findTrackingIssue(open).number, 4, 'The exact-title issue must be the ONE updated');
assert.equal(findTrackingIssue(open.filter(i => i.number !== 4)), null, 'No exact match must mean open a new one, never reuse a similar title');
assert.throws(() => findTrackingIssue([...open, {number: 7, title: TRACKING_TITLE}]), /More than one/, 'Two exact matches must stop, not pick one');
assert.equal(findTrackingIssue(open).number, 4);
console.log('PASS HC4 §5.2 denial classified / unrelated errors stay red / staged pin read / tracking issue exact and single');
