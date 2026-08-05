// §2 baseline: fps under sustained busy play at chamber 4+, both viewports.
// Also confirms snapshot() stability across modes (menu/playing/forge/gameover).

import { launch, boot, startRun, advanceToChamber, beginBusyPlay, endBusyPlay, measureFrames, VIEWPORTS, fmt } from './rf_harness.mjs';

const FILE = process.argv[2] || 'work/relicforge_v1.0.html';
const SECONDS = Number(process.argv[3] || 60);

// Keeps play continuous through forge screens and deaths during a measurement.
async function keepPlaying(page, stop) {
  const modes = new Set();
  while (!stop.done) {
    let s;
    try { s = await page.evaluate(() => window.__relicforge.snapshot()); } catch { break; }
    modes.add(s.mode);
    try {
      if (s.mode === 'forge') await page.evaluate(() => window.__relicforge.install(0));
      else if (s.mode === 'gameover' || s.mode === 'victory' || s.mode === 'menu') {
        await page.evaluate(() => window.__relicforge.start());
        await advanceToChamber(page, 4);
        await beginBusyPlay(page);
      }
    } catch { /* transient mode race — retry next tick */ }
    await new Promise(r => setTimeout(r, 400));
  }
  return modes;
}

const browser = await launch();
const results = {};

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const page = await boot(browser, FILE, vp);

  // snapshot() stability across modes — the harness spine (§2 item 3).
  const stability = { menu: await page.evaluate(() => window.__relicforge.snapshot()) };
  await startRun(page);
  stability.playing = await page.evaluate(() => window.__relicforge.snapshot());
  await advanceToChamber(page, 4);
  const atChamber = await page.evaluate(() => window.__relicforge.snapshot());
  const enemyCount = await page.evaluate(() => window.__relicforge.targets().length);

  await beginBusyPlay(page);
  const stop = { done: false };
  const keeper = keepPlaying(page, stop);
  const perf = await measureFrames(page, SECONDS);
  stop.done = true;
  const modesSeen = await keeper;
  await endBusyPlay(page);

  results[name] = {
    viewport: vp.label,
    chamberAtStart: atChamber.chamber,
    enemiesAtStart: enemyCount,
    modesDuringRun: [...modesSeen],
    perf,
    snapshotKeys: {
      menu: Object.keys(stability.menu).sort(),
      playing: Object.keys(stability.playing).sort()
    },
    snapshotStable: JSON.stringify(Object.keys(stability.menu).sort()) === JSON.stringify(Object.keys(stability.playing).sort()),
    pageErrors: page._rfErrors.slice(0, 5)
  };
  console.error(`[${name}] fps=${perf.fps} mean=${perf.meanFrameMs}ms p95=${perf.p95FrameMs}ms modes=${[...modesSeen].join(',')}`);
  await page.context().close();
}

await browser.close();
console.log(fmt(results));
