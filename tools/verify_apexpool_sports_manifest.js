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
const expectedGolf = {
  icon: '⛳', title: 'Apex Golf',
  desc: 'A top-down golf game about reading the hole and knowing your own game. Call your stroke count, play nine seeded holes with honest wind and slope, then earn a Call Rating. Works offline.',
  href: '/apexgolf/', tag: 'Physics', hue: '#7C5CFC', featured: false, hero: false,
  art: '/assets/cards/apex-golf.svg', collection: 'Sports'
};
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function census(games) { const out = {}; games.forEach((g) => { out[g.tag] = (out[g.tag] || 0) + 1; }); return out; }
function selfCheck() {
  const source = fs.readFileSync(FILE, 'utf8');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'games-golf-sports-'));
  const cases = [
    ['membership', 'sports-membership-exact', (s) => s.replace('"art": "/assets/cards/apex-golf.svg",\n      "collection": "Sports"', '"art": "/assets/cards/apex-golf.svg",\n      "collection": "Other"')],
    ['art', 'all-entries-carry-art', (s) => s.replace('"art": "/assets/cards/apex-golf.svg"', '"art": ""')],
    ['tag', 'tag-vocabulary-unchanged', (s) => s.replace('"tag": "Physics",\n      "hue": "#7C5CFC"', '"tag": "Sport",\n      "hue": "#7C5CFC"')],
    ['hue', 'golf-hue-distinct-and-new', (s) => s.replace('"hue": "#7C5CFC"', '"hue": "#2F8F6B"')],
    ['duplicate', 'golf-title-and-href-unique', (s) => s.replace('"title": "Apex Golf"', '"title": "Apex Pool"')]
  ];
  let missed = 0;
  console.log('== Apex Golf Sports manifest non-vacuity ==');
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
let pass = 0, fail = 0;
function ok(name, condition, detail = '') {
  if (condition) { pass++; console.log('  PASS  ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); }
}
const golfRows = after.filter((g) => g.title === 'Apex Golf');
const golfHrefs = after.filter((g) => g.href === '/apexgolf/');
const sportsBefore = before.filter((g) => g.collection === 'Sports');
const sportsAfter = after.filter((g) => g.collection === 'Sports');
const survivorsAfter = after.filter((g) => g.title !== 'Apex Golf');
const tagsBefore = census(before), tagsAfter = census(after);
const kick = before.find((g) => g.title === 'Apex Kick');
const pool = before.find((g) => g.title === 'Apex Pool');
console.log('== Apex Golf Sports manifest contract ==');
ok('baseline-entry-count-measured', before.length === 32, String(before.length));
ok('candidate-entry-count-derived', after.length === before.length + 1, `${before.length} -> ${after.length}`);
ok('baseline-sports-membership-preserved', same(sportsBefore.map((g) => g.title), ['Apex Kick', 'Apex Pool']), sportsBefore.map((g) => g.title).join(' | '));
ok('sports-membership-exact', same(sportsAfter.map((g) => g.title), ['Apex Kick', 'Apex Pool', 'Apex Golf']), sportsAfter.map((g) => g.title).join(' | '));
ok('golf-title-and-href-unique', golfRows.length === 1 && golfHrefs.length === 1 && golfRows[0] === golfHrefs[0]);
ok('golf-schema-and-copy-exact', golfRows.length === 1 && same(golfRows[0], expectedGolf));
ok('all-existing-entries-byte-equivalent', same(before, survivorsAfter));
ok('golf-appended-after-pool', after[after.length - 2].title === 'Apex Pool' && after[after.length - 1].title === 'Apex Golf');
ok('all-entries-carry-art', after.every((g) => typeof g.art === 'string' && g.art.length > 0));
ok('tag-vocabulary-unchanged', same(Object.keys(tagsBefore).sort(), Object.keys(tagsAfter).sort()), `${JSON.stringify(tagsBefore)} -> ${JSON.stringify(tagsAfter)}`);
ok('physics-count-increases-by-one', tagsBefore.Physics === 6 && tagsAfter.Physics === 7, `${tagsBefore.Physics} -> ${tagsAfter.Physics}`);
ok('golf-hue-distinct-and-new', golfRows.length === 1 && golfRows[0].hue !== kick.hue && golfRows[0].hue !== pool.hue && !before.some((g) => g.hue.toUpperCase() === golfRows[0].hue.toUpperCase()), golfRows.length ? golfRows[0].hue : 'missing');
ok('site-relative-house-link', golfRows.length === 1 && golfRows[0].href === '/apexgolf/');
ok('description-is-shipped-meta-copy', golfRows.length === 1 && golfRows[0].desc === expectedGolf.desc);
ok('no-lessons-contamination', !afterRaw.includes('Apex_Golf') && !afterRaw.includes('/Lessons/Apex_Golf/'));
console.log('='.repeat(64));
console.log(fail === 0 ? `ALL ${pass} APEX GOLF MANIFEST CHECKS PASSED` : `${pass} passed, ${fail} FAILED`);
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
