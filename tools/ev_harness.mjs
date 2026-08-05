// Echo Vault harness — drives window.__echoVault (the telemetry object), never the DOM.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const VIEWPORTS = {
  desktop: { width: 1366, height: 768, label: '1366x768' },
  phone: { width: 390, height: 844, label: '390x844', isMobile: true, hasTouch: true }
};

export async function launch() {
  return chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-frame-rate-limit', '--disable-gpu-vsync', '--autoplay-policy=no-user-gesture-required'] });
}

export async function boot(browser, file, vp, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 1,
    reducedMotion: opts.reducedMotion || 'no-preference'
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__echoVault, null, { timeout: 20000 });
  page._evErrors = errors;
  return page;
}

export async function startRun(page) {
  await page.evaluate(() => window.__echoVault.start());
  await page.waitForFunction(() => window.__echoVault.getState().state === 'playing', null, { timeout: 15000 });
}

// Busy play: move, ping repeatedly, sweep the look direction.
export async function beginBusyPlay(page) {
  await page.evaluate(() => {
    const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
    let i = 0;
    window.__evBusy = setInterval(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: keys[i % 4] }));
      i++;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: keys[i % 4] }));
      try { window.__echoVault.ping(); } catch (_) {}
      const c = document.querySelector('canvas');
      if (c) c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 12, movementY: 3 }));
    }, 260);
  });
}
export async function endBusyPlay(page) { await page.evaluate(() => clearInterval(window.__evBusy)); }

export async function measureFrames(page, seconds) {
  await page.evaluate(() => {
    window.__evProbe = { stamps: [], running: true };
    const tick = (t) => { if (!window.__evProbe.running) return; window.__evProbe.stamps.push(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(seconds * 1000);
  return page.evaluate(() => {
    const p = window.__evProbe; p.running = false;
    const s = p.stamps, d = [];
    for (let i = 1; i < s.length; i++) d.push(s[i] - s[i - 1]);
    d.sort((a, b) => a - b);
    const span = s.length > 1 ? (s[s.length - 1] - s[0]) / 1000 : 0;
    const pick = q => d.length ? d[Math.min(d.length - 1, Math.floor(d.length * q))] : 0;
    return {
      frames: s.length, seconds: +span.toFixed(2),
      fps: span > 0 ? +(((s.length - 1) / span)).toFixed(1) : 0,
      p50FrameMs: +pick(0.5).toFixed(2), p95FrameMs: +pick(0.95).toFixed(2)
    };
  });
}
export const fmt = o => JSON.stringify(o, null, 2);
