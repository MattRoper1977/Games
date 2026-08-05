// Relicforge harness — shared browser rig.
// Drives window.__relicforge (start + snapshot + targets), never the DOM.
// Used by the §2 baseline, the G2 perf gate, the G7 motion gate and the G8 campaign.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const VIEWPORTS = {
  desktop: { width: 1366, height: 768, label: '1366x768' },
  phone: { width: 390, height: 844, label: '390x844', isMobile: true, hasTouch: true }
};

export async function launch(opts = {}) {
  return chromium.launch({
    args: ['--disable-frame-rate-limit', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'],
    ...opts
  });
}

// Boot the game file and wait for the diagnostic surface to exist.
export async function boot(browser, file, viewport, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: !!viewport.isMobile,
    hasTouch: !!viewport.hasTouch,
    deviceScaleFactor: 1,
    reducedMotion: opts.reducedMotion || 'no-preference'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__relicforge, null, { timeout: 15000 });
  page._rfErrors = errors;
  return page;
}

export async function startRun(page, chassis, { skipStory = true } = {}) {
  await page.evaluate((c) => window.__relicforge.start(c), chassis);
  if (skipStory) await dismissStory(page);
  await page.waitForFunction(() => window.__relicforge.snapshot().mode === 'playing', null, { timeout: 10000 });
}

// v1.1 opens every chamber on an interstitial. Players read it; the rig steps past it.
// v1.1 opens every chamber on an interstitial; v1.0 has none. Tolerating both keeps
// the same rig usable for the before/after perf comparison.
export async function dismissStory(page) {
  const hasStory = await page.evaluate(() => typeof window.__relicforge.skipStory === 'function');
  if (!hasStory) return;
  await page.waitForFunction(() => window.__relicforge.snapshot().mode === 'story', null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => window.__relicforge.skipStory());
}

// Advance to a target chamber by clearing and taking the first forge draft.
export async function advanceToChamber(page, target) {
  for (let guard = 0; guard < 40; guard++) {
    const s = await page.evaluate(() => window.__relicforge.snapshot());
    if (s.chamber >= target && s.mode === 'playing') return s;
    if (s.mode === 'story') {
      await page.evaluate(() => window.__relicforge.skipStory());
    } else if (s.mode === 'forge') {
      await page.evaluate(() => window.__relicforge.install(0));
      await dismissStory(page);
    } else if (s.mode === 'playing') {
      await page.evaluate(() => window.__relicforge.clearChamber());
      await page.waitForTimeout(1600); // clear timer -> forge
    } else {
      throw new Error('unexpected mode while advancing: ' + s.mode);
    }
    await page.waitForTimeout(250);
  }
  throw new Error('could not reach chamber ' + target);
}

// Synthetic busy play: hold movement, sweep aim, fire continuously.
export async function beginBusyPlay(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, bubbles: true, clientX: x, clientY: y, isPrimary: true
    }));
    window.__rfBusy = { t: 0 };
    const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
    let ki = 0;
    window.__rfBusyTimer = setInterval(() => {
      const b = window.__rfBusy;
      b.t += 1;
      window.dispatchEvent(new KeyboardEvent('keyup', { code: keys[ki % 4] }));
      ki += 1;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: keys[ki % 4] }));
      const r = canvas.getBoundingClientRect();
      const cx = r.left + r.width / 2 + Math.cos(b.t * 0.31) * r.width * 0.3;
      const cy = r.top + r.height / 2 + Math.sin(b.t * 0.27) * r.height * 0.3;
      fire('pointermove', cx, cy);
      fire('pointerdown', cx, cy);
    }, 220);
    const r = canvas.getBoundingClientRect();
    fire('pointerdown', r.left + r.width * 0.7, r.top + r.height * 0.4);
  });
}

export async function endBusyPlay(page) {
  await page.evaluate(() => { clearInterval(window.__rfBusyTimer); });
}

// Measure real rAF cadence plus per-frame main-thread cost.
export async function measureFrames(page, seconds) {
  await page.evaluate(() => {
    window.__rfProbe = { stamps: [], running: true };
    const tick = (t) => {
      if (!window.__rfProbe.running) return;
      window.__rfProbe.stamps.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(seconds * 1000);
  return page.evaluate(() => {
    const p = window.__rfProbe;
    p.running = false;
    const s = p.stamps;
    const deltas = [];
    for (let i = 1; i < s.length; i++) deltas.push(s[i] - s[i - 1]);
    deltas.sort((a, b) => a - b);
    const span = s.length > 1 ? (s[s.length - 1] - s[0]) / 1000 : 0;
    const pick = q => deltas.length ? deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))] : 0;
    const mean = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
    return {
      frames: s.length,
      seconds: Number(span.toFixed(2)),
      fps: span > 0 ? Number(((s.length - 1) / span).toFixed(1)) : 0,
      meanFrameMs: Number(mean.toFixed(3)),
      p50FrameMs: Number(pick(0.5).toFixed(3)),
      p95FrameMs: Number(pick(0.95).toFixed(3)),
      worstFrameMs: Number(pick(0.999).toFixed(3))
    };
  });
}

export const fmt = (o) => JSON.stringify(o, null, 2);

// Main-thread cost via CDP — the honest before/after measure on a GPU-less container,
// where absolute fps mostly reports the software rasteriser rather than our changes.
export async function cpuMetrics(page, seconds) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const a = await read();
  await page.waitForTimeout(seconds * 1000);
  const b = await read();
  const d = k => Number(((b[k] - a[k]) * 1000).toFixed(1));
  await cdp.detach();
  return { wallMs: d('Timestamp'), scriptMs: d('ScriptDuration'), layoutMs: d('LayoutDuration'), recalcMs: d('RecalcStyleDuration'), taskMs: d('TaskDuration') };
}
