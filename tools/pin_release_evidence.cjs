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
module.exports = {assessChecks, exactPublication, assertWritable};
