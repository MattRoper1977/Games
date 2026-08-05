// U1 proof + G7 flash census, one rig.
// Proves (a) the wavefront actually brightens fragments, (b) the reduced-flash path
// is genuinely dimmer AND still reveals, (c) flash rate and luminance swing are within D4.
import { launch, boot, startRun, VIEWPORTS } from './ev_harness.mjs';

const FILE = process.argv[2] || 'work/echovault_v1.1.html';
const TAMPER = process.argv.includes('--tamper');

async function sample(page, { reducedFlash, pings }) {
  await page.evaluate((rf) => {
    window.__ev_saveSet = rf;
    // drive the setting directly through the game's own state
  }, reducedFlash);
  if (reducedFlash !== null) {
    await page.evaluate((rf) => {
      const btn = document.getElementById('start-flash-btn');
      // toggle until it matches the requested state
      for (let i = 0; i < 3; i++) {
        const label = btn.textContent;
        const isFull = /Full/.test(label);
        if (isFull === !rf) break;
        btn.click();
      }
    }, reducedFlash);
  }
  return page.evaluate(async (doPings) => {
    const canvas = document.querySelector('canvas');
    const probe = document.createElement('canvas');
    probe.width = 80; probe.height = 45;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    const lums = [], stamps = [];
    for (let i = 0; i < 70; i++) {
      if (doPings && i % 18 === 3) { try { window.__echoVault.ping(); } catch (_) {} }
      await new Promise(r => requestAnimationFrame(r));
      pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
      const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
      let sum = 0;
      for (let j = 0; j < d.length; j += 4) sum += 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
      lums.push(sum / (d.length / 4) / 255);
      stamps.push(performance.now());
    }
    // Flash = a PAIR OF OPPOSING CHANGES of >=10% relative luminance (the
    // photosensitivity definition). Scene motion is not flashing.
    const AMP = 0.10;
    let worst = 0;
    for (let i = 1; i < lums.length; i++) worst = Math.max(worst, Math.abs(lums[i] - lums[i - 1]));
    let flashes = 0, anchor = lums[0], dir = 0;
    for (let i = 1; i < lums.length; i++) {
      const delta = lums[i] - anchor;
      if (Math.abs(delta) >= AMP) { const s = Math.sign(delta); if (s !== dir) { flashes++; dir = s; } anchor = lums[i]; }
    }
    const secs = (stamps[stamps.length - 1] - stamps[0]) / 1000;
    return {
      peak: Math.max(...lums), floor: Math.min(...lums),
      mean: lums.reduce((a, b) => a + b, 0) / lums.length,
      range: Math.max(...lums) - Math.min(...lums),
      worstFrameSwing: +worst.toFixed(4),
      flashHz: +(flashes / 2 / secs).toFixed(2),
      seconds: +secs.toFixed(2), frames: lums.length
    };
  }, pings);
}

const browser = await launch();
const page = await boot(browser, FILE, VIEWPORTS.phone);
await startRun(page);
await page.waitForTimeout(600);

// The control is INTRINSIC, not a separate mode. v1.0 already brightened the room on
// a ping via the per-object uEcho memory term, which U1 deliberately preserves — so
// "pinging lights the room" is TRUE ON v1.0 and proves nothing about U1. The gate
// therefore measures the scene with the U1 shader path ON and OFF in the same run
// and requires a material difference. (The first version of this gate asserted only
// the lift; switching U1 off left it passing, which is how the hole was found.)
const quiet = await sample(page, { reducedFlash: null, pings: false });
const full = await sample(page, { reducedFlash: false, pings: true });
await page.evaluate(() => window.__echoVault.setPulseGain(0));
const noWave = await sample(page, { reducedFlash: false, pings: true });
// --tamper puts the wavefront BACK for the control sample, so the isolation
// assertion must fail: that proves this comparison is sighted.
await page.evaluate((t) => window.__echoVault.setPulseGain(t ? 1 : null), TAMPER);
if (TAMPER) Object.assign(noWave, await sample(page, { reducedFlash: false, pings: true }));
await page.evaluate(() => window.__echoVault.setPulseGain(null));
const reduced = await sample(page, { reducedFlash: true, pings: true });

await browser.close();

const failures = [];
const lift = full.peak - quiet.mean;
// (a) U1 ISOLATED: the shader wavefront must contribute materially beyond the
// per-object uEcho reveal that v1.0 already had.
const ratio = noWave.range > 0 ? full.range / noWave.range : Infinity;
if (!(ratio >= 1.5)) {
  failures.push(`U1 not isolated: luminance range with the wavefront ${full.range.toFixed(4)} vs without ${noWave.range.toFixed(4)} (ratio ${ratio.toFixed(2)}, need >=1.5)`);
}
if (!(lift > 0.004)) failures.push(`pinging did not brighten the scene at all (peak ${full.peak.toFixed(4)} vs quiet mean ${quiet.mean.toFixed(4)})`);
// (b) reduced-flash must be dimmer than full, but still reveal something
if (!(full.range > reduced.range)) failures.push(`reduced-flash range ${reduced.range.toFixed(4)} is not below full ${full.range.toFixed(4)}`);
if (!(reduced.range > 0)) failures.push('reduced-flash path reveals nothing at all — it must still light the room');
// (c) D4 limits, on the FULL path (the worst case)
if (!(full.flashHz < 3)) failures.push(`flash rate ${full.flashHz} Hz is not below 3 Hz`);
if (!(full.worstFrameSwing <= 0.25)) failures.push(`worst per-frame luminance swing ${(full.worstFrameSwing * 100).toFixed(1)}% exceeds 25%`);

console.log(JSON.stringify({ quiet, full, noWave, reduced, lift: +lift.toFixed(4), u1Ratio: +ratio.toFixed(2) }, null, 2));
console.error(`\nPULSE/G7 ${TAMPER ? '[TAMPERED] ' : ''}${failures.length ? 'FAIL' : 'PASS'} — ` +
  `U1 isolation ${full.range.toFixed(4)} with vs ${noWave.range.toFixed(4)} without (x${ratio.toFixed(2)}); lift ${lift.toFixed(4)}; reduced ${reduced.range.toFixed(4)}; ` +
  `flash ${full.flashHz} Hz (<3); worst swing ${(full.worstFrameSwing * 100).toFixed(1)}% (<=25%)`);
if (failures.length) console.error(failures.map(f => '  - ' + f).join('\n'));
process.exit(TAMPER ? (failures.length ? 0 : 1) : (failures.length ? 1 : 0));
