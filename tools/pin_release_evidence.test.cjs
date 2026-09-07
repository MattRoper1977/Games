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
