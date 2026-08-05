// Live behaviour of the twist: does a clean strip actually out-score a core-burn
// IN THE GAME, not just in the pure function? Drives real damage through
// damageEnemyComponent via __relicforge.strike.

import { launch, boot, startRun, VIEWPORTS } from './rf_harness.mjs';

const FILE = process.argv[2] || 'work/relicforge_v1.1.html';
const browser = await launch();
const page = await boot(browser, FILE, VIEWPORTS.desktop);
await startRun(page);

const result = await page.evaluate(async () => {
  const rf = window.__relicforge;
  const externals = rf.externals();
  const out = { externals, kills: [] };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Kill 1 — surgical: every external off, core untouched.
  let t = rf.targets();
  const a = t[0];
  for (const key of externals) rf.strike(a.id, key, 1e9);
  await wait(120);
  let snap = rf.snapshot();
  out.kills.push({ style: 'clean strip', best: snap.salvageRun.best, clean: snap.salvageRun.cleanStrips, streak: snap.salvageRun.streak });
  out.afterStripLitter = snap.litter + snap.debris;

  // Kill 2 — straight to the core, externals left on.
  t = rf.targets().filter(x => x.id !== a.id);
  const b = t[0];
  rf.strike(b.id, 'core', 1e9);
  await wait(120);
  snap = rf.snapshot();
  out.kills.push({ style: 'core burn', mean: snap.salvageRun.mean, clean: snap.salvageRun.cleanStrips, streak: snap.salvageRun.streak });
  out.rated = snap.salvageRun.rated;
  out.cleanStrips = snap.salvageRun.cleanStrips;
  out.bestStreak = snap.salvageRun.bestStreak;
  out.hitStopFired = snap.hitStop >= 0;
  return out;
});

await browser.close();

const failures = [];
if (result.rated !== 2) failures.push(`expected 2 rated kills, got ${result.rated}`);
if (result.cleanStrips !== 1) failures.push(`expected exactly 1 clean strip, got ${result.cleanStrips}`);
if (result.kills[0].best < 60) failures.push(`clean strip scored ${result.kills[0].best}, below the clean band floor`);
if (result.kills[1].streak !== 0) failures.push('core burn did not reset the salvage streak');
if (!(result.afterStripLitter > 0)) failures.push('stripping five components left no debris or litter on the floor');

console.log(JSON.stringify(result, null, 2));
console.error(`\nSTRIP ${failures.length ? 'FAIL' : 'PASS'} — clean strip scored ${result.kills[0].best}, ` +
  `core burn left streak at ${result.kills[1].streak}, floor litter ${result.afterStripLitter}`);
if (failures.length) console.error(failures.map(f => '  - ' + f).join('\n'));
process.exit(failures.length ? 1 : 0);
