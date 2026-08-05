// P0 baseline: fps both viewports, draw calls in a busy sector, max concurrent pulses.
import { launch, boot, startRun, beginBusyPlay, endBusyPlay, measureFrames, VIEWPORTS, fmt } from './ev_harness.mjs';
const FILE = process.argv[2] || 'work/echovault_v1.0.html';
const SECS = Number(process.argv[3] || 20);
const browser = await launch();
const out = {};
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const page = await boot(browser, FILE, vp);
  // Count drawElements calls per frame, and track peak concurrent pulses.
  await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    window.__evDraw = { calls: 0, frames: 0, peakPulses: 0 };
    if (gl && gl.drawElements) {
      const orig = gl.drawElements.bind(gl);
      gl.drawElements = function (...a) { window.__evDraw.calls++; return orig(...a); };
    }
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => {
      window.__evDraw.frames++;
      try { window.__evDraw.peakPulses = Math.max(window.__evDraw.peakPulses, window.__echoVault.getState().pulses); } catch (_) {}
      return cb(t);
    });
  });
  await startRun(page);
  await beginBusyPlay(page);
  const perf = await measureFrames(page, SECS);
  const draw = await page.evaluate(() => window.__evDraw);
  await endBusyPlay(page);
  const st = await page.evaluate(() => window.__echoVault.getState());
  out[name] = { viewport: vp.label, perf,
    drawCallsPerFrame: draw.frames ? +(draw.calls / draw.frames).toFixed(1) : 0,
    totalDrawCalls: draw.calls, framesObserved: draw.frames,
    peakConcurrentPulses: draw.peakPulses, state: st, errors: page._evErrors.slice(0, 4) };
  console.error(`[${name}] fps=${perf.fps} draws/frame=${out[name].drawCallsPerFrame} peakPulses=${draw.peakPulses} errs=${page._evErrors.length}`);
  await page.context().close();
}
await browser.close();
console.log(fmt(out));
