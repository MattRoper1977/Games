'use strict';
// rg (Tue 13 Oct 2026) red-first proof: the Pin release workflow opens PRs and
// never merges; merging is a ruled action by a person. A pin whose PR was closed
// unmerged is held: the run opens nothing, updates nothing and stays green.
// Usage: node tools/pin_release_guard.test.cjs [ROOT]   (ROOT holds .github/ and
// tools/; default: the repository this file sits in)
//
// Static: no merge call or merge path anywhere in the workflow or the helper it
// loads, no merge input, and closed PRs consulted before any PR is created or
// updated. Unit: refusedRelease. Replay: the PR step's script is cut verbatim
// from the workflow and run against recorded GitHub state with a mocked API:
//   R1  run 38328916870 (schedule): #111 closed unmerged at a09fad23, no open PR
//       -> opens nothing, merges nothing, not red.
//   R2  schedule, nothing closed, full green, ruleset would allow a merge
//       -> no merge, not red.
//   R3  workflow_dispatch (even with an injected merge=true) -> no merge.
//   R4  control: a fresh pin, no closed PR -> the PR IS opened, exactly once.
//   R5  #113 open at a09fad23 (the pin closed as #111) -> not updated, not
//       merged, not red (rg-4: held PRs stay untouched).
// Hold (decision under rg): an OPEN pin-release PR on the source's branch holds
// the whole run before anything is built, staged or force-pushed. The first
// step's script is cut verbatim and run against a mocked API:
//   H1  #113 open on pin-release/lessons, Lessons main moved -> go=false, held.
//   H2  control: no open PR, Lessons main moved -> go=true (a release runs).
//   H3  pin current, no open PR -> go=false, as before.
//   H4  #112 open on pin-release/site only, Lessons main moved -> the lessons
//       run is not held by the other source's PR (go=true).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const wfPath = path.join(root, '.github/workflows/pin-release.yml');
const helperPath = path.join(root, 'tools/pin_release_evidence.cjs');
const wf = fs.readFileSync(wfPath, 'utf8');
const helperText = fs.readFileSync(helperPath, 'utf8');
const results = [];
function check(name, fn) {
  try { fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name + ' :: ' + String(e.message).split('\n')[0]]); }
}
async function checkAsync(name, fn) {
  try { await fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name + ' :: ' + String(e.message).split('\n')[0]]); }
}

// ---- the PR step's script, cut from the workflow exactly as shipped ----
const lines = wf.split('\n');
const stepAt = lines.findIndex(l => /^      - name: Create the PR if none is open/.test(l));
assert(stepAt > 0, 'the PR step ("Create the PR if none is open ...") was not found');
let i = stepAt; while (i < lines.length && !/^\s+script: \|\s*$/.test(lines[i])) i++;
assert(i < lines.length, 'the PR step has no script block');
const body = [];
for (i = i + 1; i < lines.length; i++) {
  if (lines[i].trim() && !lines[i].startsWith('            ')) break;
  body.push(lines[i].slice(12));
}
const script = body.join('\n');
assert(script.includes('github.rest.pulls.create('), 'the cut script does not create PRs; extraction is wrong');

// ---- static: no run of any event or input can merge ----
// Whole-line comments are prose ("never merges"); everything else is code.
const code = text => text.split('\n').filter(l => !/^\s*(#|\/\/)/.test(l)).join('\n');
const scanned = {'pin-release.yml': code(wf), 'pin_release_evidence.cjs': code(helperText)};
function absent(patterns) {
  const hits = [];
  for (const [file, text] of Object.entries(scanned)) {
    for (const [label, re] of patterns) if (re.test(text)) hits.push(`${label} in ${file}`);
  }
  assert.deepEqual(hits, [], 'merge path present: ' + hits.join('; '));
}
check('S1 no pulls.merge call anywhere', () => absent([['pulls.merge', /\bpulls\s*\.\s*merge\b/]]));
check('S2 no other merge or auto-merge path (REST, GraphQL, gh, git)', () => absent([
  ['REST PUT .../pulls/{n}/merge', /\/pulls\/[^\s'"`]*\/merge\b/],
  ['branch-merge API', /\brepos\s*\.\s*merge\b|\/merges\b/],
  ['GraphQL mergePullRequest', /mergePullRequest/i],
  ['GraphQL enablePullRequestAutoMerge', /enablePullRequestAutoMerge/i],
  ['auto-merge setting or action', /allow_auto_merge|auto-?merge/i],
  ['gh pr merge', /\bgh\s+pr\s+merge\b/],
  ['git merge', /\bgit\s+(?:-\S+\s+)*merge\b/],
]));
check('S3 no merge input on any trigger', () => {
  const on = lines.slice(lines.findIndex(l => /^on:/.test(l)) + 1);
  const end = on.findIndex(l => /^\S/.test(l));
  const triggers = on.slice(0, end < 0 ? on.length : end);
  const keys = triggers.filter(l => /^      [A-Za-z_-]+:/.test(l)).map(l => l.trim().replace(/:.*/, ''));
  assert(!keys.some(k => /merge/i.test(k)), 'trigger input named ' + keys.filter(k => /merge/i.test(k)).join(', '));
  assert(!/inputs\.merge|client_payload\.merge|\bMERGE:/.test(code(wf)), 'a merge input or MERGE env is read');
});
const firstAt = re => { const m = re.exec(script); return m ? m.index : -1; };
check('S4 closed PRs are consulted before pulls.create', () => {
  const ref = script.indexOf('refusedRelease(');
  const listed = firstAt(/state: 'closed'/);
  const create = script.indexOf('github.rest.pulls.create(');
  assert(listed >= 0, 'closed PRs are never listed');
  assert(ref >= 0 && ref < create && listed < ref, 'refusedRelease on the closed list does not precede pulls.create');
});
check('S5 closed PRs are consulted before an open PR is updated', () => {
  const ref = script.indexOf('refusedRelease(');
  const update = script.indexOf('github.rest.pulls.update(');
  assert(ref >= 0 && (update < 0 || ref < update), 'refusedRelease does not precede pulls.update');
});

// ---- unit: refusedRelease on the recorded PRs ----
let helper = {};
try { helper = require(helperPath); } catch (e) { results.push(['FAIL', 'helper loads :: ' + e.message]); }
const SHA = 'a09fad238c08b83a1ebef90cd58658563b2bb6b5';   // #111 and #113 head
const HEAD = 'b0b214e7df24dda0f0cae213bb4a0400309ed992';  // the target Lessons pin
const CURRENT = '52c99679ea7645c725c0d20ff357007a7ee3a30f'; // the Lessons pin on main
const row = (before, after) => `| \`lessons_commit\` | \`${before}\` | \`${after}\` |`;
const pr = (number, extra) => ({number, state: 'closed', merged_at: null, head: {ref: 'pin-release/lessons', sha: SHA},
  title: `Pin release: lessons ${CURRENT.slice(0, 10)} → ${HEAD.slice(0, 10)}`, body: row(CURRENT, HEAD), ...extra});
const pr111 = pr(111);
const pr109 = pr(109, {head: {ref: 'pin-release/lessons', sha: '74de56ef7d7305cbcd3ee85e73401469ba4beac7'},
  title: 'Pin release: lessons ed55c3be55 → 52c99679ea', body: row('ed55c3be55' + '0'.repeat(30), CURRENT)});
const merged = pr(96, {merged_at: '2026-09-17T13:38:45Z', merged: true});
const refused = (...a) => helper.refusedRelease(...a);
check('U1 refusedRelease is exported', () => assert.equal(typeof helper.refusedRelease, 'function'));
check('U2 closed-unmerged #111 at the same head SHA refuses', () => assert.equal(refused([pr109, pr111], SHA, HEAD)?.number, 111));
check('U3 the same target pin at another head SHA refuses', () => assert.equal(refused([pr109, pr111], 'c'.repeat(40), HEAD)?.number, 111));
check('U4 a moved source is not refused', () => assert.equal(refused([pr109, pr111], 'c'.repeat(40), 'd'.repeat(40)), null));
check('U5 a merged PR never refuses, even at the same SHA and pin', () => assert.equal(refused([merged], SHA, HEAD), null));
check('U6 an empty or absent list never refuses', () => { assert.equal(refused([], SHA, HEAD), null); assert.equal(refused(undefined, SHA, HEAD), null); });
check('U7 a retitled closed PR still refuses by the pin row in its body', () =>
  assert.equal(refused([pr(111, {title: 'HELD under a ruling', head: {sha: 'e'.repeat(40)}})], 'c'.repeat(40), HEAD)?.number, 111));
check('U8 an open PR is never read as closed-unmerged', () => assert.equal(refused([pr(113, {state: 'open'})], SHA, HEAD), null));

// ---- replay ----
async function replay({open = [], closed = [], event = 'schedule', inputs = {}, extraEnv = {}, rulesetAllowsMerge = false, head = HEAD, sha = SHA}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-replay-'));
  fs.writeFileSync(path.join(dir, 'moved-payloads.json'), '[]');
  fs.writeFileSync(path.join(dir, 'perf-gate.json'), JSON.stringify({routes: 69, red: [], inconclusive: []}));
  const summaryFile = path.join(dir, 'summary.md'); fs.writeFileSync(summaryFile, '');
  const calls = {list: [], create: [], update: [], merge: [], other: [], dispatch: [], failed: []};
  const env = {GITHUB_WORKSPACE: root, GITHUB_STEP_SUMMARY: summaryFile, BRANCH: 'pin-release/lessons', SHA: sha, HEAD: head, CURRENT,
    KEY: 'lessons_commit', SRC_REPO: 'owner/Lessons', SOURCE: 'lessons', RESTAGED: 'false', ...extraEnv};
  const green = ['contract', 'aggregate'].map((name, n) => ({id: 1000 + n, name, status: 'completed', conclusion: 'success', head_sha: sha, details_url: ''}));
  const refuse405 = () => { const e = new Error('Repository rule violations found\n\n2 of 2 required status checks are expected.'); e.status = 405; throw e; };
  const mergeLike = name => async a => { calls.merge.push({name, ...a}); if (!rulesetAllowsMerge) refuse405(); return {data: {merged: true, sha: 'f'.repeat(40)}}; };
  const rest = {
    pulls: {
      list: async a => { calls.list.push(a.state); return {data: a.state === 'open' ? open : a.state === 'closed' ? closed : [...open, ...closed]}; },
      create: async a => { calls.create.push(a); return {data: {number: 113, html_url: 'pr/113', title: a.title, body: a.body, head: {sha}}}; },
      update: async a => { calls.update.push(a); return {data: {}}; },
      get: async () => ({data: {number: 113, title: 'Pin release', body: '', head: {sha}}}),
      merge: mergeLike('pulls.merge'),
    },
    repos: {getContent: async () => ({data: {type: 'file', sha: '0'}}), merge: mergeLike('repos.merge')},
    actions: {
      createWorkflowDispatch: async a => { calls.dispatch.push(a.workflow_id); },
      listWorkflowRuns: async () => ({data: {workflow_runs: [{id: 9, head_sha: 'f'.repeat(40), status: 'completed', conclusion: 'success', html_url: 'run/9'}]}}),
      getWorkflowRun: async () => ({data: {}}),
    },
    checks: {listForRef: async () => ({data: {total_count: green.length, check_runs: green}})},
    issues: {listForRepo: async () => ({data: []}), update: async () => ({data: {}}), create: async () => ({data: {}})},
  };
  const github = {
    rest, paginate: async (fn, args) => (await fn(args)).data,
    request: async (route, a) => { calls.other.push(route); if (/merge/i.test(route)) return mergeLike(route)(a); return {data: {}}; },
    graphql: async q => { calls.other.push('graphql'); if (/merge/i.test(q)) return mergeLike('graphql')({}); return {}; },
  };
  const core = {info: () => {}, notice: () => {}, warning: () => {}, setFailed: m => calls.failed.push(m)};
  const context = {repo: {owner: 'owner', repo: 'Games'}, runId: 38328916870, serverUrl: 'https://example.invalid',
    eventName: event, payload: {inputs}};
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const prevCwd = process.cwd(); process.chdir(dir);
  let thrown = null;
  try {
    await new AsyncFunction('github', 'context', 'core', 'require', 'process', 'setTimeout', script)(
      github, context, core, require, {env}, r => r());
  } catch (e) { thrown = e; }
  finally { process.chdir(prevCwd); }
  const summary = fs.readFileSync(summaryFile, 'utf8');
  fs.rmSync(dir, {recursive: true, force: true});
  return {calls, thrown, summary};
}
const notRed = r => {
  assert.equal(r.thrown, null, 'step threw: ' + (r.thrown && String(r.thrown.message).split('\n')[0]));
  assert.deepEqual(r.calls.failed, [], 'step set failed');
};
const noMerge = r => assert.equal(r.calls.merge.length, 0, `attempted ${r.calls.merge.length} merge(s): ${r.calls.merge.map(m => m.name).join(', ')}`);

(async () => {
  await checkAsync('R1 replay 38328916870: #111 closed unmerged at a09fad23 -> opens nothing, merges nothing, not red', async () => {
    const r = await replay({closed: [pr109, pr111]});
    assert.equal(r.calls.create.length, 0, 'opened a PR again (as #113)');
    noMerge(r); notRed(r);
    assert.match(r.summary, /held/i, 'the summary does not say held');
  });
  await checkAsync('R2 schedule, nothing closed, full green, ruleset would allow it -> no merge, not red', async () => {
    const r = await replay({rulesetAllowsMerge: true});
    noMerge(r); notRed(r);
    assert.match(r.summary, /not merged/i, 'the summary does not say not merged');
  });
  await checkAsync('R3 workflow_dispatch, even with merge=true injected -> no merge', async () => {
    const r = await replay({event: 'workflow_dispatch', inputs: {source: 'both', merge: 'true'}, extraEnv: {MERGE: 'true'}, rulesetAllowsMerge: true});
    noMerge(r); notRed(r);
  });
  await checkAsync('R4 control: a fresh pin, no closed PR -> the PR is opened, exactly once', async () => {
    const r = await replay({head: 'd'.repeat(40), sha: 'c'.repeat(40)});
    assert.equal(r.calls.create.length, 1, `opened ${r.calls.create.length} PRs`);
    const [c] = r.calls.create;
    assert.equal(c.base, 'main'); assert.equal(c.head, 'pin-release/lessons');
    assert.match(c.title, /→ dddddddddd$/);
  });
  await checkAsync('R5 #113 open at a09fad23 (the pin closed as #111) -> not updated, not merged, not red', async () => {
    const r = await replay({open: [pr(113, {state: 'open'})], closed: [pr109, pr111]});
    assert.equal(r.calls.update.length, 0, 'held PR #113 was updated');
    assert.equal(r.calls.create.length, 0, 'a PR was opened');
    noMerge(r); notRed(r);
  });
  // ---- hold: the first step's script, cut verbatim ----
  const pinAt = lines.findIndex(l => /^      - name: Read the pin and the source HEAD/.test(l));
  let pyFrom = pinAt; while (pyFrom < lines.length && !/python - <<'PY'\s*$/.test(lines[pyFrom])) pyFrom++;
  let pyTo = pyFrom + 1; while (pyTo < lines.length && lines[pyTo].trim() !== 'PY') pyTo++;
  const pinPy = lines.slice(pyFrom + 1, pyTo).map(l => l.slice(10)).join('\n');
  const {spawnSync} = require('node:child_process');
  const pub = JSON.parse(fs.readFileSync(path.join(root, 'play-publication.json'), 'utf8'));
  function pinStep({source, head, open}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-hold-'));
    fs.writeFileSync(path.join(dir, 'play-publication.json'), JSON.stringify(pub));
    const out = path.join(dir, 'out'); fs.writeFileSync(out, '');
    const summary = path.join(dir, 'summary'); fs.writeFileSync(summary, '');
    const prelude = [
      'import io, json, urllib.request, urllib.parse',
      'HEADSHA = ' + JSON.stringify(head) + '; OPEN = json.loads(' + JSON.stringify(JSON.stringify(open)) + ')',
      'def _urlopen(req, timeout=None):',
      '    url = req.full_url if hasattr(req, "full_url") else req',
      '    if "/commits/main" in url: return io.BytesIO(json.dumps({"sha": HEADSHA}).encode())',
      '    if "/pulls" in url:',
      '        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)',
      '        h = (q.get("head") or [""])[0]; st = (q.get("state") or ["open"])[0]',
      '        return io.BytesIO(json.dumps([p for p in OPEN if st == "open" and h.endswith(":" + p["branch"])]).encode())',
      '    raise AssertionError("unmocked URL " + url)',
      'urllib.request.urlopen = _urlopen',
    ].join('\n');
    const r = spawnSync('python3', ['-I', '-c', prelude + '\nexec(compile(open(' + JSON.stringify(path.join(dir, 'step.py')) + ').read(), "step", "exec"))'], {
      cwd: dir, encoding: 'utf8', input: '',
      env: {PATH: process.env.PATH, SOURCE: source, WANTED: 'both', GH_TOKEN: 't', GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: summary, GITHUB_REPOSITORY: 'OWNER/Games'},
      ...(fs.writeFileSync(path.join(dir, 'step.py'), pinPy), {}),
    });
    const o = Object.fromEntries(fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => l.split(/=(.*)/s).slice(0, 2)));
    return {status: r.status, stderr: r.stderr, stdout: r.stdout, out: o, summary: fs.readFileSync(summary, 'utf8')};
  }
  const moved = 'e'.repeat(40);
  const pr113 = {number: 113, branch: 'pin-release/lessons', head: {sha: SHA}, title: 'Pin release: lessons 52c99679ea → b0b214e7df'};
  const pr112 = {number: 112, branch: 'pin-release/site', head: {sha: 'f'.repeat(40)}, title: 'Pin release: site 04ed925201 → 9402e0a85e'};
  check('H0 the first step\'s script was cut', () => assert(pinPy.includes("c[key]") && pinPy.includes('GITHUB_OUTPUT'), 'extraction is wrong'));
  check('H1 #113 open on pin-release/lessons, Lessons main moved -> go=false, held, untouched', () => {
    const r = pinStep({source: 'lessons', head: moved, open: [pr113]});
    assert.equal(r.status, 0, 'step failed: ' + r.stderr.split('\n').slice(-2).join(' '));
    assert.equal(r.out.go, 'false', 'go=' + r.out.go + ': the run would build, stage and force-push pin-release/lessons under open #113');
    assert.match(r.stdout + r.summary, /held/i, 'the step does not say held');
    assert.match(r.stdout + r.summary, /#113/, 'the step does not name #113');
  });
  check('H2 control: no open PR, Lessons main moved -> go=true', () => {
    const r = pinStep({source: 'lessons', head: moved, open: []});
    assert.equal(r.status, 0, 'step failed: ' + r.stderr.split('\n').slice(-2).join(' '));
    assert.equal(r.out.go, 'true');
  });
  check('H3 pin current, no open PR -> go=false, as before', () => {
    const r = pinStep({source: 'lessons', head: pub.lessons_commit, open: []});
    assert.equal(r.status, 0, 'step failed: ' + r.stderr.split('\n').slice(-2).join(' '));
    assert.equal(r.out.go, 'false');
  });
  check('H4 #112 open on pin-release/site only -> the lessons run is not held by it', () => {
    const r = pinStep({source: 'lessons', head: moved, open: [pr112]});
    assert.equal(r.status, 0, 'step failed: ' + r.stderr.split('\n').slice(-2).join(' '));
    assert.equal(r.out.go, 'true', 'held by the other source\'s PR');
  });
  for (const [s, n] of results) console.log(s + ' ' + n);
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails ? `RED: ${fails} of ${results.length} failed (${results.length - fails}/${results.length} pass)` : `GREEN: ${results.length}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
})();
