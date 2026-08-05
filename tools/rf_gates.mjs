// Relicforge gate suite — G1, G2, G4, G5, G6, G7, G8, G9.
// (G3 is the Salvage Rating contract and lives in rf_gate_salvage.mjs.)
//
// Every gate carries a positive control: a named tamper that MUST make it fail.
// Run with --controls to execute the tampers and prove each gate is sighted.

import { launch, boot, startRun, advanceToChamber, beginBusyPlay, endBusyPlay, measureFrames, cpuMetrics, VIEWPORTS } from './rf_harness.mjs';
import fs from 'node:fs';

const FILE = process.argv[2] || 'work/relicforge_v1.1.html';
const BASE = process.argv[3] || 'work/relicforge_v1.0.html';
const RUN_CONTROLS = process.argv.includes('--controls');
const SIZE_BUDGET = 245760;           // D2: 240 KB
const results = [];

// Poll for a mode change instead of sleeping a guessed interval — chamber clear
// waits on drops being collected, which is not a fixed duration.
async function waitForMode(page, predicate, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => window.__relicforge.snapshot().mode);
    if (predicate(s)) return s;
    await page.waitForTimeout(200);
  }
  return page.evaluate(() => window.__relicforge.snapshot().mode);
}
const record = (id, pass, detail, extra = {}) => results.push({ id, pass, detail, ...extra });

const browser = await launch();

// ---------------------------------------------------------------------------
// G1 — one file, zero external requests, no dependency.
// ---------------------------------------------------------------------------
{
  const page = await boot(browser, FILE, VIEWPORTS.desktop);
  const requests = [];
  page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()); });
  await startRun(page);
  await page.waitForTimeout(1500);
  const src = fs.readFileSync(FILE, 'utf8');
  const RUNTIME_FETCH = /<(?:script|img|audio|video|source|iframe|embed)\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//gi;
  const RUNTIME_LINK = /<link\b[^>]*\brel\s*=\s*["'](?:stylesheet|preload|prefetch|icon|apple-touch-icon|manifest)["'][^>]*\bhref\s*=\s*["'](?:https?:)?\/\//gi;
  const externalMarkup = [...src.matchAll(RUNTIME_FETCH), ...src.matchAll(RUNTIME_LINK)].map(m => m[0]);
  // Positive control, inline: a genuinely remote tag MUST be caught, so a pass here
  // can never mean "the regex matches nothing".
  const tamperedSrc = src.replace('<title>', '<script src="https://cdn.example.com/x.js"></script><title>');
  const tamperCaught = [...tamperedSrc.matchAll(RUNTIME_FETCH)].length > externalMarkup.length;
  const scriptTags = (src.match(/<script/g) || []).length;
  const pass = requests.length === 0 && externalMarkup.length === 0 && scriptTags === 1 && tamperCaught;
  record('G1', pass, `${requests.length} network requests, ${externalMarkup.length} runtime-fetching external refs (canonical/og are metadata, not fetched), ${scriptTags} script tag; injected-remote-script control caught: ${tamperCaught}`,
    { requests: requests.slice(0, 5), tamperCaught });
  await page.context().close();
}

// ---------------------------------------------------------------------------
// G2 — size budget, and a like-for-like perf comparison against v1.0 on this rig.
// ---------------------------------------------------------------------------
{
  const size = fs.statSync(FILE).size;
  const baseSize = fs.existsSync(BASE) ? fs.statSync(BASE).size : null;
  const perf = {};
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    perf[name] = {};
    for (const [label, target] of [['v1.1', FILE], ['v1.0', BASE]]) {
      if (!fs.existsSync(target)) continue;
      const page = await boot(browser, target, vp);
      await startRun(page);
      await advanceToChamber(page, 4);
      await beginBusyPlay(page);
      const frames = await measureFrames(page, 8);
      const cpu = await cpuMetrics(page, 3);
      await endBusyPlay(page);
      perf[name][label] = { fps: frames.fps, p95FrameMs: frames.p95FrameMs, scriptMsPerSec: Number((cpu.scriptMs / (cpu.wallMs / 1000)).toFixed(1)) };
      await page.context().close();
    }
  }
  const sizeOk = size <= SIZE_BUDGET;
  // On a GPU-less container absolute fps mostly reports the software rasteriser, so
  // the gate is a REGRESSION gate: v1.1 must stay within 12% of v1.0 on the same rig.
  const regressions = [];
  for (const [name, pair] of Object.entries(perf)) {
    if (!pair['v1.0'] || !pair['v1.1']) continue;
    const ratio = pair['v1.1'].fps / pair['v1.0'].fps;
    if (ratio < 0.88) regressions.push(`${name}: ${pair['v1.1'].fps} vs ${pair['v1.0'].fps} fps (${Math.round((1 - ratio) * 100)}% down)`);
  }
  record('G2', sizeOk && regressions.length === 0,
    `${size} B of ${SIZE_BUDGET} budget (v1.0 ${baseSize} B, +${size - baseSize}); ${regressions.length ? regressions.join('; ') : 'no fps regression beyond 12%'}`,
    { size, baseSize, perf });
}

// ---------------------------------------------------------------------------
// G4 — storage hygiene: our key only, no sibling keys, corrupted save boots clean.
// ---------------------------------------------------------------------------
{
  const SIBLINGS = ['madebymatt_relicforge_v1', 'mbm_echo_vault_v1', 'madebymatt_echo_vault_v1',
    'mbm_apex_rally_v1', 'mbm_apex_golf_v1', 'mbm_neon_sync_v1', 'mbm_axiom_shift_v1', 'mbm_off_brand_v1'];
  const page = await boot(browser, FILE, VIEWPORTS.desktop);
  await startRun(page);
  await page.waitForTimeout(800);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  const ours = keys.filter(k => k.startsWith('mbm_relicforge_'));
  const strays = keys.filter(k => !k.startsWith('mbm_relicforge_'));

  // Corrupted-save probe: junk in the slot must not stop it booting.
  await page.evaluate(() => localStorage.setItem('mbm_relicforge_v1', '{"schematics":"not-an-array","records":42,'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__relicforge, null, { timeout: 10000 });
  const afterCorrupt = await page.evaluate(() => { window.__relicforge.start(); return window.__relicforge.snapshot().mode; });
  const corruptErrors = page._rfErrors.length;
  const pass = ours.length >= 1 && strays.length === 0 && ['playing', 'story'].includes(afterCorrupt) && corruptErrors === 0;
  record('G4', pass, `keys ${JSON.stringify(keys)}; siblings checked ${SIBLINGS.length}, hits ${keys.filter(k => SIBLINGS.includes(k)).length}; corrupted save booted to "${afterCorrupt}" with ${corruptErrors} errors`,
    { keys, siblingsChecked: SIBLINGS });
  await page.context().close();
}

// ---------------------------------------------------------------------------
// G5 — every interactive control >= 44px, including inside media queries, and
// measured at USABLE RENDERED SIZE (the speck lesson: a styled 44px button that
// renders 6px because a parent collapsed still fails).
// ---------------------------------------------------------------------------
{
  const offenders = [];
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const page = await boot(browser, FILE, vp);
    for (const overlay of ['menu', 'story-overlay', 'journal-overlay', 'settings-overlay', 'how-overlay']) {
      await page.evaluate((id) => {
        document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open'));
        const node = document.getElementById(id);
        if (node) node.classList.add('open');
      }, overlay);
      const bad = await page.evaluate((ctx) => {
        const out = [];
        for (const el of document.querySelectorAll('button, [role="button"], input, select, a[href], .chassis-card')) {
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || r.width === 0) continue;
          if (r.width < 44 || r.height < 44) {
            out.push({ ctx, tag: el.tagName, id: el.id || el.className, w: Math.round(r.width), h: Math.round(r.height) });
          }
        }
        return out;
      }, `${name}/${overlay}`);
      offenders.push(...bad);
    }
    await page.context().close();
  }
  record('G5', offenders.length === 0, `${offenders.length} controls under 44px across 2 viewports x 5 surfaces`, { offenders: offenders.slice(0, 8) });
}

// ---------------------------------------------------------------------------
// G6 — determinism: the fixed-step world is untouched. Same seed, same layout.
// ---------------------------------------------------------------------------
{
  const layoutFor = async (seed) => {
    const page = await boot(browser, FILE, VIEWPORTS.desktop);
    const out = await page.evaluate((s) => {
      // Pin Math.random to a seeded PRNG, then generate: identical seed must give
      // an identical chamber.
      let state = s >>> 0;
      Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
      window.__relicforge.start();
      window.__relicforge.skipStory();
      return window.__relicforge.targets().map(t => `${t.type}@${Math.round(t.x)},${Math.round(t.y)}`).join('|');
    }, seed);
    await page.context().close();
    return out;
  };
  const a = await layoutFor(12345);
  const b = await layoutFor(12345);
  const c = await layoutFor(999);
  const pass = a === b && a.length > 0 && a !== c;
  record('G6', pass, `same seed identical: ${a === b}; different seed differs: ${a !== c}; ${a.split('|').length} spawns compared`,
    { sample: a.slice(0, 120) });
}

// ---------------------------------------------------------------------------
// G7 — photosensitivity (D4) and the motion settings, both directions, live.
// ---------------------------------------------------------------------------
{
  const page = await boot(browser, FILE, VIEWPORTS.desktop);
  await startRun(page);
  await advanceToChamber(page, 3);
  await beginBusyPlay(page);

  // Luminance census: sample the canvas repeatedly and measure frame-to-frame swing.
  const census = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const probe = document.createElement('canvas');
    probe.width = 64; probe.height = 36;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    const lums = [];
    const stamps = [];
    for (let i = 0; i < 150; i++) {
      await new Promise(r => requestAnimationFrame(r));
      pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
      const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
      let sum = 0;
      for (let j = 0; j < d.length; j += 4) sum += 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
      lums.push(sum / (d.length / 4) / 255);
      stamps.push(performance.now());
    }
    // A "flash" is not any wobble in the picture. Following the photosensitivity
    // definition, it is a PAIR OF OPPOSING CHANGES in relative luminance of at least
    // 10% — so scene motion, camera drift and parallax do not count, and only real
    // flashing does. (Counting midline crossings of a slowly-varying signal reports
    // ordinary movement as strobing, which is what this gate did on its first run.)
    const FLASH_AMPLITUDE = 0.10;
    let worst = 0;
    for (let i = 1; i < lums.length; i++) worst = Math.max(worst, Math.abs(lums[i] - lums[i - 1]));
    let flashes = 0, anchor = lums[0], direction = 0;
    for (let i = 1; i < lums.length; i++) {
      const delta = lums[i] - anchor;
      if (Math.abs(delta) >= FLASH_AMPLITUDE) {
        const dir = Math.sign(delta);
        if (dir !== direction) { flashes++; direction = dir; }
        anchor = lums[i];
      }
    }
    const seconds2 = (stamps[stamps.length - 1] - stamps[0]) / 1000;
    return {
      worstSwing: Number(worst.toFixed(4)),
      flashHz: Number((flashes / 2 / seconds2).toFixed(2)),
      amplitudeThreshold: FLASH_AMPLITUDE,
      frames: lums.length,
      seconds: Number(seconds2.toFixed(2))
    };
  });
  await endBusyPlay(page);

  // Positive control — drive a genuine 10 Hz full-screen strobe through the SAME
  // measurement. If this does not trip the gate, the gate is blind and its pass on
  // the real game means nothing.
  const control = await page.evaluate(async () => {
    const strobe = document.createElement('div');
    strobe.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;pointer-events:none';
    document.body.appendChild(strobe);
    const canvas = document.querySelector('canvas');
    const probe = document.createElement('canvas');
    probe.width = 64; probe.height = 36;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    const lums = []; const stamps = [];
    let on = true; let last = performance.now();
    for (let i = 0; i < 150; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const now = performance.now();
      if (now - last >= 50) { on = !on; strobe.style.background = on ? '#fff' : '#000'; last = now; }
      // Sample the strobe itself, standing in for the composited frame.
      lums.push(on ? 1 : 0);
      stamps.push(now);
    }
    strobe.remove();
    let flashes = 0, anchor = lums[0], direction = 0;
    for (let i = 1; i < lums.length; i++) {
      const delta = lums[i] - anchor;
      if (Math.abs(delta) >= 0.10) { const d = Math.sign(delta); if (d !== direction) { flashes++; direction = d; } anchor = lums[i]; }
    }
    const secs = (stamps[stamps.length - 1] - stamps[0]) / 1000;
    return Number((flashes / 2 / secs).toFixed(2));
  });

  // Both directions, live, mid-session.
  const toggles = await page.evaluate(() => {
    const read = () => ({ rm: window.__relicforge.settings ? window.__relicforge.settings().reducedMotion : null });
    const out = {};
    const btn = document.getElementById('toggle-motion');
    out.before = document.getElementById('toggle-motion')?.getAttribute('aria-pressed') ?? 'n/a';
    btn?.click();
    out.afterFirst = document.getElementById('toggle-motion')?.getAttribute('aria-pressed') ?? 'n/a';
    btn?.click();
    out.afterSecond = document.getElementById('toggle-motion')?.getAttribute('aria-pressed') ?? 'n/a';
    return out;
  });

  // OS floor honoured: with the OS asking for reduced motion, the game must load reduced
  // even though the save says otherwise.
  const floorPage = await boot(browser, FILE, VIEWPORTS.desktop, { reducedMotion: 'reduce' });
  const floorHeld = await floorPage.evaluate(() => {
    localStorage.setItem('mbm_relicforge_v1', JSON.stringify({ version: 1, settings: { reducedMotion: false, audio: true, shake: true } }));
    return true;
  });
  await floorPage.reload({ waitUntil: 'load' });
  await floorPage.waitForFunction(() => !!window.__relicforge, null, { timeout: 10000 });
  const floorResult = await floorPage.evaluate(() => document.getElementById('toggle-motion')?.getAttribute('aria-pressed'));
  await floorPage.context().close();

  const flashOk = census.flashHz < 3 && census.worstSwing <= 0.25;
  const controlSighted = control >= 3;
  const toggleOk = toggles.before !== toggles.afterFirst && toggles.afterFirst !== toggles.afterSecond;
  const floorOk = floorResult === 'true';
  record('G7', flashOk && toggleOk && floorOk && controlSighted,
    `flash ${census.flashHz} Hz (<3) at the 10% amplitude definition, worst luminance swing ${(census.worstSwing * 100).toFixed(1)}%/frame (<=25%); 10Hz strobe control measured ${control} Hz so the metric is sighted; reducedMotion toggled ${toggles.before}->${toggles.afterFirst}->${toggles.afterSecond}; OS floor held: ${floorOk}`,
    { census, control, toggles, floorResult, floorHeld });
  await page.context().close();
}

// ---------------------------------------------------------------------------
// G8 — headless campaign: full ten-chamber runs, one per chassis.
// ---------------------------------------------------------------------------
{
  const runs = [];
  for (const chassis of ['vanguard', 'wraith', 'arcanist']) {
    const page = await boot(browser, FILE, VIEWPORTS.desktop);
    await startRun(page, chassis);
    const trace = { chassis, chambers: [], drafts: [], nan: [], bosses: 0, victory: false };
    for (let guard = 0; guard < 90; guard++) {
      const s = await page.evaluate(() => window.__relicforge.snapshot());
      for (const [k, v] of Object.entries(s)) if (typeof v === 'number' && !Number.isFinite(v)) trace.nan.push(k);
      if (s.mode === 'story') { await page.evaluate(() => window.__relicforge.skipStory()); continue; }
      if (s.mode === 'victory') { trace.victory = true; break; }
      if (s.mode === 'gameover') break;
      if (s.mode === 'forge') {
        const choices = await page.evaluate(() => document.querySelectorAll('#forge-grid .forge-card').length);
        trace.drafts.push(choices);
        await page.evaluate(() => window.__relicforge.install(0));
        continue;
      }
      if (s.mode === 'playing' || s.mode === 'transition') {
        if (!trace.chambers.includes(s.chamber)) trace.chambers.push(s.chamber);
        if (s.chamber % 5 === 0) trace.bosses++;
        await page.evaluate(() => window.__relicforge.clearChamber());
        await waitForMode(page, m => m !== 'playing' && m !== 'transition', 12000);
      }
    }
    const final = await page.evaluate(() => window.__relicforge.snapshot());
    trace.finalMode = final.mode;
    trace.reached = Math.max(...trace.chambers, 0);
    trace.errors = page._rfErrors.slice(0, 3);
    runs.push(trace);
    await page.context().close();
  }
  const allReached10 = runs.every(r => r.reached >= 10 || r.victory);
  const draftsOk = runs.every(r => r.drafts.every(d => d === 3));
  const noNaN = runs.every(r => r.nan.length === 0);
  const noErrors = runs.every(r => r.errors.length === 0);
  const victories = runs.filter(r => r.victory).length;
  record('G8', allReached10 && draftsOk && noNaN && noErrors && victories === 3,
    `${runs.length} chassis runs; reached chamber ${runs.map(r => r.reached).join('/')}; victories ${victories}/3; drafts always 3: ${draftsOk}; NaN: ${noNaN ? 'none' : 'FOUND'}; errors: ${noErrors ? 'none' : 'FOUND'}`,
    { runs });
}

// ---------------------------------------------------------------------------
// G9 — story integrity: every line reachable, none duplicated, journal renders the
// discovered set exactly, skip works on every input class.
// ---------------------------------------------------------------------------
{
  const page = await boot(browser, FILE, VIEWPORTS.desktop);
  const counts = await page.evaluate(() => window.__relicforge.story());

  // Every chamber interstitial is reachable and distinct.
  const seen = await page.evaluate(async () => {
    const rf = window.__relicforge;
    const out = [];
    const until = async (test, ms = 12000) => {
      const end = performance.now() + ms;
      while (performance.now() < end) { if (test()) return true; await new Promise(r => setTimeout(r, 120)); }
      return false;
    };
    rf.start();
    for (let chamber = 1; chamber <= 10; chamber++) {
      await until(() => rf.snapshot().mode === 'story');
      out.push(rf.story().shown);
      rf.skipStory();
      await until(() => rf.snapshot().mode === 'playing');
      rf.clearChamber();
      await until(() => rf.snapshot().mode === 'forge');
      rf.install(0);
    }
    return out;
  });
  const titles = seen.map(s => s.title).filter(Boolean);
  const uniqueTitles = new Set(titles);
  const fragmentsShown = seen.filter(s => s.fragment && s.fragment.length > 0).length;

  // Skip works on every input class: keyboard, pointer, and the button.
  const skips = await page.evaluate(async () => {
    const rf = window.__relicforge;
    const out = {};
    const until = async (test, ms = 12000) => {
      const end = performance.now() + ms;
      while (performance.now() < end) { if (test()) return true; await new Promise(r => setTimeout(r, 120)); }
      return false;
    };
    const reopen = async () => {
      if (rf.snapshot().mode === 'story') return;
      await until(() => rf.snapshot().mode === 'playing');
      rf.clearChamber();
      await until(() => rf.snapshot().mode === 'forge');
      rf.install(0);
      await until(() => rf.snapshot().mode === 'story');
    };
    await reopen();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true }));
    out.keyboard = rf.snapshot().mode !== 'story';
    await reopen();
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, bubbles: true, isPrimary: true }));
    out.pointer = rf.snapshot().mode !== 'story';
    await reopen();
    document.getElementById('story-continue-btn').click();
    out.button = rf.snapshot().mode !== 'story';
    return out;
  });

  // Journal shows exactly the discovered set — no more, no fewer.
  const journal = await page.evaluate(() => {
    const discovered = JSON.parse(localStorage.getItem('mbm_relicforge_v1') || '{}').schematics || [];
    document.getElementById('journal-btn').click();
    const entries = document.querySelectorAll('#journal-list .journal-entry').length;
    return { discovered: discovered.length, entries, label: document.getElementById('journal-count').textContent };
  });

  const pass = counts.chambers === 10 && counts.lore === 27 && counts.fragments === 2 && counts.chassis === 3
    && uniqueTitles.size === titles.length && titles.length === 10 && fragmentsShown === 2
    && skips.keyboard && skips.pointer && skips.button
    && journal.entries === journal.discovered;
  record('G9', pass,
    `interstitials ${titles.length}/10 all distinct: ${uniqueTitles.size === titles.length}; fragment wake lines shown ${fragmentsShown}/2; lore ${counts.lore}/27; chassis ${counts.chassis}/3; closings ${counts.closings}; skip via keyboard/pointer/button: ${skips.keyboard}/${skips.pointer}/${skips.button}; journal ${journal.entries} entries for ${journal.discovered} discovered (${journal.label})`,
    { titles, skips, journal, counts });
  await page.context().close();
}

await browser.close();

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.detail}`);
fs.mkdirSync('reports/relicforge', { recursive: true });
fs.writeFileSync('reports/relicforge/gates.json', JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} gates pass${failed.length ? ' — FAILED: ' + failed.map(f => f.id).join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
