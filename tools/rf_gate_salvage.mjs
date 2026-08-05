// G3 — Salvage Rating contract.
// Runs against window.RF.salvageRating inside the shipped file: the gate tests the
// function the game scores with, not a re-implementation of it.
//
// Non-vacuity: --tamper injects a broken rating (drops the clean-strip floor) and the
// same assertions must FAIL. A gate that has never failed has never been tested.

import { launch, boot, VIEWPORTS } from './rf_harness.mjs';

const FILE = process.argv[2] || 'work/relicforge_v1.1.html';
const TAMPER = process.argv.includes('--tamper');

// 8 authored rows: input -> expected band behaviour.
const FIXTURES = [
  { name: 'perfect strip, no stray, no waste',  run: { stripped: 5, coreDamage: 0,    overkill: 0,    threat: 0.6, meleeShare: 0.2 }, expect: 100 },
  { name: 'clean strip, sloppy core fire',      run: { stripped: 5, coreDamage: 0.5,  overkill: 0.2,  threat: 0.6, meleeShare: 0.2 }, expect: 85 },
  { name: 'clean strip, wasteful and sloppy',   run: { stripped: 5, coreDamage: 1,    overkill: 1,    threat: 0.6, meleeShare: 0.2 }, expect: 60 },
  { name: 'safe-play cap: trivial + melee',     run: { stripped: 5, coreDamage: 0,    overkill: 0,    threat: 0.1, meleeShare: 0.9 }, expect: 60 },
  { name: 'same strip at range is uncapped',    run: { stripped: 5, coreDamage: 0,    overkill: 0,    threat: 0.1, meleeShare: 0.3 }, expect: 100 },
  { name: 'four off then core burned',          run: { stripped: 4, coreDamage: 1,    overkill: 0,    threat: 0.6, meleeShare: 0.2 }, expect: 47 },
  { name: 'straight to the core',               run: { stripped: 0, coreDamage: 1,    overkill: 0.5,  threat: 0.6, meleeShare: 0.2 }, expect: 0 },
  { name: 'two off, tidy, core burned',         run: { stripped: 2, coreDamage: 0.3,  overkill: 0.1,  threat: 0.6, meleeShare: 0.2 }, expect: 22 }
];

const browser = await launch();
const page = await boot(browser, FILE, VIEWPORTS.desktop);

// Two independent tampers, so each assertion family is separately proven sighted:
//   scale  — halves every rating; the fixtures and the safe-play cap must catch it.
//   bands  — leaves the fixtures alone but lets a spectacular core-burn punch into
//            the clean band; ONLY the disjointness assertion can catch this one.
const TAMPER_MODE = (process.argv.find(a => a.startsWith('--tamper=')) || '--tamper=scale').split('=')[1];

if (TAMPER) {
  await page.evaluate((mode) => {
    const real = window.RF.salvageRating;
    if (mode === 'bands') {
      window.RF.salvageRating = (run) => {
        const v = real(run);
        const stripped = Math.round(Number(run && run.stripped) || 0);
        // "Reward near-misses" — the plausible-sounding change that silently
        // destroys the one property the whole twist rests on.
        return stripped === 4 ? Math.min(100, v + 30) : v;
      };
    } else {
      window.RF.salvageRating = (run) => Math.round(real(run) * 0.5);
    }
  }, TAMPER_MODE);
}

const result = await page.evaluate(({ fixtures }) => {
  const rate = window.RF.salvageRating;
  const K = window.RF.constants;
  const out = { fixtures: [], failures: [] };

  for (const f of fixtures) {
    const got = rate(f.run);
    const pass = got === f.expect;
    out.fixtures.push({ name: f.name, expect: f.expect, got, pass });
    if (!pass) out.failures.push(`fixture "${f.name}": expected ${f.expect}, got ${got}`);
  }

  // --- 20k fuzz: never NaN, always an integer in 0..100 ---
  let fuzz = 0, worstFuzz = null;
  let cleanMin = Infinity, dirtyMax = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const stripped = Math.floor(Math.random() * 7) - 1;      // -1..5, deliberately out of range
    const run = {
      externals: 5,
      stripped,
      coreDamage: Math.random() * 1.4 - 0.2,                  // out-of-range on purpose
      overkill: Math.random() * 1.4 - 0.2,
      threat: Math.random() * 1.2,
      meleeShare: Math.random() * 1.2
    };
    const v = rate(run);
    const ok = Number.isInteger(v) && v >= 0 && v <= 100;
    if (!ok && !worstFuzz) worstFuzz = { run, v };
    if (ok) fuzz++;
    if (stripped >= 5) cleanMin = Math.min(cleanMin, v);
    else if (stripped >= 0) dirtyMax = Math.max(dirtyMax, v);
  }
  out.fuzz = { ran: 20000, valid: fuzz, firstBad: worstFuzz };
  if (fuzz !== 20000) out.failures.push(`fuzz: ${20000 - fuzz} results were NaN or out of range`);

  // Hostile inputs must not throw or produce NaN.
  const junk = [undefined, null, {}, { stripped: NaN, coreDamage: NaN, overkill: NaN },
    { stripped: Infinity }, { stripped: '5', coreDamage: 'x' }];
  out.junk = junk.map(j => { try { return rate(j); } catch (e) { return 'THREW ' + e.message; } });
  if (!out.junk.every(v => Number.isInteger(v) && v >= 0 && v <= 100)) {
    out.failures.push('junk inputs produced a non-integer, out-of-range value or threw');
  }

  // --- Disjoint bands: min over ALL clean strips > max over ALL core-burns ---
  out.bands = { cleanMin, dirtyMax, disjoint: cleanMin > dirtyMax };
  if (!(cleanMin > dirtyMax)) {
    out.failures.push(`bands overlap: cleanest-strip min ${cleanMin} <= dirtiest core-burn max ${dirtyMax}`);
  }

  // --- Monotonicity sweep, each input independently, others held fixed ---
  const mono = { stripped: true, coreDamage: true, overkill: true };
  for (let c = 0; c <= 1.0001; c += 0.1) {
    for (let o = 0; o <= 1.0001; o += 0.1) {
      let prev = -Infinity;
      for (let s = 0; s <= 5; s++) {
        const v = rate({ stripped: s, coreDamage: c, overkill: o, threat: 0.6, meleeShare: 0.1 });
        if (v < prev) mono.stripped = false;
        prev = v;
      }
    }
  }
  for (let s = 0; s <= 5; s++) {
    for (let o = 0; o <= 1.0001; o += 0.25) {
      let prev = Infinity;
      for (let c = 0; c <= 1.0001; c += 0.05) {
        const v = rate({ stripped: s, coreDamage: c, overkill: o, threat: 0.6, meleeShare: 0.1 });
        if (v > prev) mono.coreDamage = false;
        prev = v;
      }
      let prevO = Infinity;
      for (let o2 = 0; o2 <= 1.0001; o2 += 0.05) {
        const v = rate({ stripped: s, coreDamage: 0.3, overkill: o2, threat: 0.6, meleeShare: 0.1 });
        if (v > prevO) mono.overkill = false;
        prevO = v;
      }
    }
  }
  out.monotone = mono;
  for (const [k, v] of Object.entries(mono)) if (!v) out.failures.push(`not monotone in ${k}`);

  // --- Safe-play cap, demonstrated on a real scored example ---
  const farm = { stripped: 5, coreDamage: 0.02, overkill: 0.03, threat: 0.08, meleeShare: 0.95 };
  const skilled = { ...farm, threat: 0.08, meleeShare: 0.25 };
  out.safePlay = {
    farmedRunnerInMelee: rate(farm),
    sameStripFoughtAtRange: rate(skilled),
    capHolds: rate(farm) === K.CLEAN_FLOOR && rate(skilled) > K.CLEAN_FLOOR
  };
  if (!out.safePlay.capHolds) out.failures.push('safe-play cap did not hold on the worked example');

  return out;
}, { fixtures: FIXTURES });

await browser.close();

const passed = result.failures.length === 0;
console.log(JSON.stringify(result, null, 2));
console.error(`\nG3 ${TAMPER ? '[TAMPERED] ' : ''}${passed ? 'PASS' : 'FAIL'} — ` +
  `fixtures ${result.fixtures.filter(f => f.pass).length}/${result.fixtures.length}, ` +
  `fuzz ${result.fuzz.valid}/${result.fuzz.ran}, ` +
  `bands clean>=${result.bands.cleanMin} vs dirty<=${result.bands.dirtyMax}, ` +
  `cap ${result.safePlay.farmedRunnerInMelee} vs ${result.safePlay.sameStripFoughtAtRange}`);
if (result.failures.length) console.error(result.failures.map(f => '  - ' + f).join('\n'));

// Under --tamper the assertions are SUPPOSED to fail; that is the positive control.
process.exit(TAMPER ? (passed ? 1 : 0) : (passed ? 0 : 1));
