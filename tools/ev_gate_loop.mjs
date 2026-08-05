// U9 + U10 behaviour, driven through the telemetry object.
// Positive controls are intrinsic: each assertion is paired with the opposite condition.
import { launch, boot, startRun, VIEWPORTS } from './ev_harness.mjs';
const FILE = process.argv[2] || 'work/echovault_v1.1.html';
const TAMPER = process.argv.includes('--tamper');
const b = await launch(); const p = await boot(b, FILE, VIEWPORTS.phone);
await startRun(p);

const r = await p.evaluate(async (tamper) => {
  const ev = window.__echoVault;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  // --- U10: loud ping must raise noise AND plant a long-lived lure ---
  const before = ev.breath();
  ev.loudPing();
  await wait(120);
  const afterLoud = ev.breath();
  out.loud = { noiseBefore: before.noise, noiseAfter: afterLoud.noise,
               trailBefore: before.trailTimer, trailAfter: afterLoud.trailTimer,
               loudPings: afterLoud.loudPings };
  // --- U9: hold still and silent; noise must fall and the trail must go cold ---
  const holdStart = ev.breath();
  // tamper: keep making noise, so the breath must NOT engage
  const t0 = performance.now();
  while (performance.now() - t0 < 5200) {
    if (tamper) ev.ping();
    await wait(120);
  }
  const held = ev.breath();
  out.breath = { stillTimer: +held.stillTimer.toFixed(2), held: held.held, best: +held.best.toFixed(2),
                 noiseAtStart: holdStart.noise, noiseAfterHold: held.noise,
                 trailAtStart: holdStart.trailTimer, trailAfterHold: held.trailTimer };
  out.state = ev.getState().state;
  return out;
}, TAMPER);

await b.close();
const f = [];
if (!(r.loud.noiseAfter > r.loud.noiseBefore)) f.push(`loud ping did not raise noise (${r.loud.noiseBefore} -> ${r.loud.noiseAfter})`);
if (!(r.loud.trailAfter > 8)) f.push(`loud ping did not plant a long-lived lure (trail timer ${r.loud.trailAfter})`);
if (!(r.loud.loudPings === 1)) f.push(`loud ping not counted (${r.loud.loudPings})`);
if (TAMPER) {
  if (r.breath.held) f.push('breath engaged while the player kept pinging — the silence condition is not real');
} else {
  if (!r.breath.held) f.push(`breath did not engage after ${r.breath.stillTimer}s still and silent`);
  if (!(r.breath.noiseAfterHold < r.breath.noiseAtStart)) f.push(`noise did not fall while holding breath (${r.breath.noiseAtStart} -> ${r.breath.noiseAfterHold})`);
  if (!(r.breath.trailAfterHold < r.breath.trailAtStart)) f.push(`the trail did not go cold (${r.breath.trailAtStart} -> ${r.breath.trailAfterHold})`);
}
if (r.state !== 'playing') f.push('run did not survive the drive: ' + r.state);
console.log(JSON.stringify(r, null, 2));
console.error(`\nU9/U10 ${TAMPER ? '[TAMPERED] ' : ''}${f.length ? 'FAIL' : 'PASS'} — loud ping noise ${r.loud.noiseBefore}->${r.loud.noiseAfter}, lure ${r.loud.trailAfter}s; breath held=${r.breath.held} after ${r.breath.stillTimer}s, noise ${r.breath.noiseAtStart}->${r.breath.noiseAfterHold}, trail ${r.breath.trailAtStart}->${r.breath.trailAfterHold}`);
if (f.length) console.error(f.map(x => '  - ' + x).join('\n'));
process.exit(TAMPER ? (f.length ? 1 : 0) : (f.length ? 1 : 0));
