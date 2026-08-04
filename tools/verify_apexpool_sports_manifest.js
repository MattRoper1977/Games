#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const supplied = args.find((arg) => arg !== '--self-test');
const FILE = supplied || path.join(__dirname, '..', 'games.json');
const BASELINE = process.env.APEXPOOL_GAMES_BASELINE || path.join(__dirname, '..', 'artifacts', 'apexpool-sports', 'games-before.json');
const expectedPool = {
  icon: '🎱', title: 'Apex Pool',
  desc: "NEW · Call the cue ball's leave, then prove you can read the table. Offline 8-ball with genuine spin, position play, AI, trick shots and an honest Leave Rating.",
  href: '/apexpool/', tag: 'Physics', hue: '#F2A24A', featured: false, hero: false,
  art: '/assets/cards/apex-pool.svg', collection: 'Sports'
};

function selfCheck() {
  const source = fs.readFileSync(FILE, 'utf8');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'games-sports-'));
  const cases = [
    ['membership', 'sports-membership-exact', (s) => s.replace('"collection": "Sports"\n    }\n  ]', '"collection": "Other"\n    }\n  ]')],
    ['art', 'all-entries-carry-art', (s) => s.replace('"art": "/assets/cards/apex-pool.svg"', '"art": ""')],
    ['tag', 'tag-vocabulary-unchanged', (s) => s.replace('"tag": "Physics",\n      "hue": "#F2A24A"', '"tag": "Sport",\n      "hue": "#F2A24A"')],
    ['hue', 'pool-hue-distinct-and-new', (s) => s.replace('"hue": "#F2A24A"', '"hue": "#2F8F6B"')],
    ['duplicate', 'pool-title-and-href-unique', (s) => s.replace('"title": "Apex Pool"', '"title": "Apex Kick"')]
  ];
  let missed = 0;
  console.log('== Apex Pool manifest non-vacuity ==');
  cases.forEach(([family, expected, mutate], index) => {
    const changed = mutate(source);
    const file = path.join(root, `${index}-${family}.json`);
    fs.writeFileSync(file, changed);
    const child = spawnSync(process.execPath, [__filename, file], { encoding: 'utf8', env: process.env });
    const output = `${child.stdout || ''}\n${child.stderr || ''}`;
    if (changed !== source && child.status !== 0 && output.includes(`FAIL  ${expected}`)) console.log(`  PASS  ${family}: rejected by ${expected}`);
    else { missed++; console.log(`  FAIL  ${family}: expected ${expected} to reject the tamper`); }
  });
  fs.rmSync(root, { recursive: true, force: true });
  console.log(missed ? `${cases.length - missed} detected, ${missed} missed` : `ALL ${cases.length} PLANTED FAILURES WERE DETECTED`);
  process.exit(missed ? 1 : 0);
}
if (selfTest) selfCheck();

const beforeRaw = fs.readFileSync(BASELINE, 'utf8');
const afterRaw = fs.readFileSync(FILE, 'utf8');
const before = JSON.parse(beforeRaw).games || [];
const after = JSON.parse(afterRaw).games || [];
let pass = 0;
let fail = 0;
function ok(name, condition, detail = '') {
  if (condition) { pass++; console.log('  PASS  ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function census(games) { const out = {}; games.forEach((g) => { out[g.tag] = (out[g.tag] || 0) + 1; }); return out; }

const poolRows = after.filter((g) => g.title === 'Apex Pool');
const poolHrefs = after.filter((g) => g.href === '/apexpool/');
const kickBefore = before.find((g) => g.title === 'Apex Kick');
const kickAfter = after.find((g) => g.title === 'Apex Kick');
const sports = after.filter((g) => g.collection === 'Sports');
const tagsBefore = census(before);
const tagsAfter = census(after);
const survivorsBefore = before.filter((g) => g.title !== 'Apex Kick');
const survivorsAfter = after.filter((g) => g.title !== 'Apex Kick' && g.title !== 'Apex Pool');
const expectedKick = { ...kickBefore, collection: 'Sports' };

console.log('== Apex Pool Sports manifest contract ==');
ok('baseline-entry-count-measured', before.length === 31, String(before.length));
ok('candidate-entry-count-derived', after.length === before.length + 1, `${before.length} -> ${after.length}`);
ok('pool-title-and-href-unique', poolRows.length === 1 && poolHrefs.length === 1 && poolRows[0] === poolHrefs[0]);
ok('pool-schema-and-copy-exact', poolRows.length === 1 && same(poolRows[0], expectedPool));
ok('sports-membership-exact', same(sports.map((g) => g.title), ['Apex Kick', 'Apex Pool']), sports.map((g) => g.title).join(' | '));
ok('apex-kick-only-gains-collection', same(kickAfter, expectedKick));
ok('all-other-entries-byte-equivalent', same(survivorsBefore, survivorsAfter));
ok('pool-appended-adjacent-to-kick', after[after.length - 2].title === 'Apex Kick' && after[after.length - 1].title === 'Apex Pool');
ok('all-entries-carry-art', after.every((g) => typeof g.art === 'string' && g.art.length > 0));
ok('tag-vocabulary-unchanged', same(Object.keys(tagsBefore).sort(), Object.keys(tagsAfter).sort()), `${JSON.stringify(tagsBefore)} -> ${JSON.stringify(tagsAfter)}`);
ok('physics-count-increases-by-one', tagsBefore.Physics === 5 && tagsAfter.Physics === 6, `${tagsBefore.Physics} -> ${tagsAfter.Physics}`);
ok('pool-hue-distinct-and-new', poolRows.length === 1 && poolRows[0].hue !== kickAfter.hue && !before.some((g) => g.hue.toUpperCase() === poolRows[0].hue.toUpperCase()), poolRows.length ? poolRows[0].hue : 'missing');
ok('site-relative-house-link', poolRows.length === 1 && poolRows[0].href === '/apexpool/');
ok('new-prefix-preserved', poolRows.length === 1 && poolRows[0].desc.startsWith('NEW · '));
ok('no-lessons-contamination', !afterRaw.includes('Apex_Pool') && !afterRaw.includes('/Lessons/Apex_Pool/'));

console.log('='.repeat(64));
console.log(fail === 0 ? `ALL ${pass} APEX POOL MANIFEST CHECKS PASSED` : `${pass} passed, ${fail} FAILED`);
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
