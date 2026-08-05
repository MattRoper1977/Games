// G3 — the Echo Read contract, run against the shipped function.
import { launch, boot, VIEWPORTS } from './ev_harness.mjs';
const FILE = process.argv[2] || 'work/echovault_v1.1.html';
const TAMPER = process.argv.includes('--tamper');
const MODE = (process.argv.find(a => a.startsWith('--tamper=')) || '--tamper=scale').split('=')[1];

const D = Math.PI / 180;
const FIXTURES = [
  { name: 'dead on, right band',            p: { angle: 0, band: 'mid', relative: 1.2 },  a: { angle: 0, distance: 15 },  expect: 100 },
  { name: 'dead on, one band out (far)',    p: { angle: 0, band: 'far', relative: 1.2 },  a: { angle: 0, distance: 15 },  expect: 91 },
  { name: 'dead on, one band out (near)',   p: { angle: 0, band: 'near', relative: 1.2 }, a: { angle: 0, distance: 15 },  expect: 91 },
  { name: '30 deg off, right band',         p: { angle: 30 * D, band: 'mid', relative: 1.2 }, a: { angle: 0, distance: 15 }, expect: 85 },
  { name: 'at the tolerance edge, worst band', p: { angle: 45 * D, band: 'far', relative: 1.2 }, a: { angle: 0, distance: 5 }, expect: 60 },
  { name: 'just outside the cone',          p: { angle: 50 * D, band: 'mid', relative: 1.2 }, a: { angle: 0, distance: 15 }, expect: 45 },
  { name: 'opposite bearing',               p: { angle: Math.PI, band: 'mid', relative: 1.2 }, a: { angle: 0, distance: 15 }, expect: 0 },
  { name: 'safe read: near + straight ahead', p: { angle: 0, band: 'near', relative: 0 }, a: { angle: 0, distance: 5 },  expect: 60 }
];

const browser = await launch();
const page = await boot(browser, FILE, VIEWPORTS.desktop);
if (TAMPER) {
  await page.evaluate((mode) => {
    const real = window.EV.echoRead;
    if (mode === 'bands') {
      // "Reward a near miss" — plausible, and it destroys the one property the twist rests on.
      window.EV.echoRead = (p, a, s) => {
        const v = real(p, a, s);
        const pa = Number(p && p.angle), aa = Number(a && a.angle);
        const err = Math.abs(Math.atan2(Math.sin(aa - pa), Math.cos(aa - pa)));
        return err > Math.PI / 4 && err < Math.PI / 2 ? Math.min(100, v + 30) : v;
      };
    } else {
      window.EV.echoRead = (p, a, s) => Math.round(real(p, a, s) * 0.5);
    }
  }, MODE);
}

const out = await page.evaluate(({ fixtures }) => {
  const f = window.EV.echoRead, K = window.EV.constants;
  const res = { fixtures: [], failures: [] };
  for (const x of fixtures) {
    const got = f(x.p, x.a, null);
    const pass = got === x.expect;
    res.fixtures.push({ name: x.name, expect: x.expect, got, pass });
    if (!pass) res.failures.push(`fixture "${x.name}": expected ${x.expect}, got ${got}`);
  }
  // 20k fuzz, hostile inputs included
  let valid = 0, correctMin = Infinity, wrongMax = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const pAng = (Math.random() * 3 - 1) * Math.PI * 2;
    const aAng = (Math.random() * 3 - 1) * Math.PI * 2;
    const p = { angle: pAng, band: ['near','mid','far','nonsense'][Math.floor(Math.random()*4)], relative: Math.random()*4-2 };
    const a = { angle: aAng, distance: Math.random() * 60 - 5 };
    const v = f(p, a, null);
    if (Number.isInteger(v) && v >= 0 && v <= 100) valid++;
    const err = Math.abs(Math.atan2(Math.sin(a.angle - p.angle), Math.cos(a.angle - p.angle)));
    // exclude safe-read caps from the band census: the cap deliberately pulls a
    // correct read down to the floor, and the floor is still >= wrong ceiling.
    const safe = p.band === 'near' && Math.abs(p.relative) <= K.SAFE_CONE;
    if (err <= K.TOLERANCE) { if (!safe) correctMin = Math.min(correctMin, v); }
    else wrongMax = Math.max(wrongMax, v);
  }
  res.fuzz = { ran: 20000, valid };
  if (valid !== 20000) res.failures.push(`fuzz: ${20000 - valid} results were NaN or out of range`);
  res.junk = [undefined, null, {}, { angle: NaN, band: 'mid' }, { angle: Infinity }].map(j => { try { return f(j, j, null); } catch (e) { return 'THREW'; } });
  if (!res.junk.every(v => Number.isInteger(v) && v >= 0 && v <= 100)) res.failures.push('junk input threw or produced an invalid value');
  res.bands = { correctMin, wrongMax, disjoint: correctMin > wrongMax };
  if (!(correctMin > wrongMax)) res.failures.push(`bands overlap: correct-direction min ${correctMin} <= wrong-direction max ${wrongMax}`);

  // monotone in angular error, and independently in band error
  let monoAngle = true, monoBand = true, symmetric = true;
  for (const band of ['near','mid','far']) {
    let prev = Infinity;
    for (let deg = 0; deg <= 180; deg += 2) {
      const v = f({ angle: deg * Math.PI / 180, band, relative: 1.2 }, { angle: 0, distance: 15 }, null);
      if (v > prev + 1e-9) monoAngle = false;
      prev = v;
    }
  }
  for (let deg = 0; deg <= 180; deg += 10) {
    let prev = Infinity;
    for (const band of ['mid','far']) {  // actual is 'mid' at d=15, so mid->far is increasing band error
      const v = f({ angle: deg * Math.PI / 180, band, relative: 1.2 }, { angle: 0, distance: 15 }, null);
      if (v > prev + 1e-9) monoBand = false;
      prev = v;
    }
    const under = f({ angle: deg * Math.PI / 180, band: 'near', relative: 1.2 }, { angle: 0, distance: 15 }, null);
    const over  = f({ angle: deg * Math.PI / 180, band: 'far',  relative: 1.2 }, { angle: 0, distance: 15 }, null);
    if (under !== over) symmetric = false;
  }
  res.monotone = { angle: monoAngle, band: monoBand, symmetricOverUnder: symmetric };
  if (!monoAngle) res.failures.push('not monotone in angular error');
  if (!monoBand) res.failures.push('not monotone in band error');
  if (!symmetric) res.failures.push('over/under band errors are not symmetric');

  const safe = f({ angle: 0, band: 'near', relative: 0 }, { angle: 0, distance: 5 }, null);
  const earned = f({ angle: 0, band: 'near', relative: 1.4 }, { angle: 0, distance: 5 }, null);
  res.safeRead = { straightAhead: safe, sameReadOffYourFacing: earned, capHolds: safe === K.CORRECT_FLOOR && earned > K.CORRECT_FLOOR };
  if (!res.safeRead.capHolds) res.failures.push('safe-read cap did not hold on the worked example');
  return res;
}, { fixtures: FIXTURES });

await browser.close();
const passed = out.failures.length === 0;
console.log(JSON.stringify(out, null, 2));
console.error(`\nG3 ${TAMPER ? '[TAMPERED] ' : ''}${passed ? 'PASS' : 'FAIL'} — fixtures ${out.fixtures.filter(f => f.pass).length}/${out.fixtures.length}, fuzz ${out.fuzz.valid}/${out.fuzz.ran}, bands correct>=${out.bands.correctMin} vs wrong<=${out.bands.wrongMax}, safe-read ${out.safeRead.straightAhead} vs ${out.safeRead.sameReadOffYourFacing}`);
if (out.failures.length) console.error(out.failures.map(f => '  - ' + f).join('\n'));
process.exit(TAMPER ? (passed ? 1 : 0) : (passed ? 0 : 1));
