#!/usr/bin/env node
/* play_perf_gate — idle-repaint and frame-rate regression gate for a pin release.
 *
 * Order HC3 §3.2. A pin bump changes which source commit the Play site is built
 * from, so the question is not "is every game fast" (HC1 measured 18 of 69
 * painting nothing at idle and /offbrand/ painting 148 frames in 600 ms — both
 * as authored) but "did THIS pin make any route worse". Two builds are measured
 * on the SAME machine in the same run — the tree at the current pin and the
 * tree at the proposed one — and each route is judged against itself:
 *
 *   idle repaint  frames painted in the idle window after boot. RED when the
 *                 proposed build paints more than max(before × 1.5, before + 10).
 *   frame rate    frames per second after a first input. Judged only where the
 *                 current build already runs at ≥ 30 fps; RED below 70% of it.
 *   page errors   RED when a route that loaded clean now throws.
 *
 * A route that fails to load on BOTH builds is INCONCLUSIVE, not red. A frame
 * is a requestAnimationFrame callback actually invoked — a request that never
 * ran is not a paint.
 *
 * Control (§0.4): --self-test serves a scratch "before" tree and an "after"
 * copy carrying two planted defects — a route that re-arms extra frames at idle
 * and a route that spins 45 ms inside every frame — and must name both; with
 * the defects removed the same gate must be green.
 *
 * Usage
 *   node tools/play_perf_gate.mjs --before URL --after URL --routes build-report.json [--report FILE]
 *   node tools/play_perf_gate.mjs --self-test
 * Exit 0 no regression · 1 a route regressed (named) · 2 INCONCLUSIVE
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const IDLE_MS = 600, FPS_MS = 1000, SETTLE_MS = 2500, LOAD_TIMEOUT = 45000;

function arg(name, dflt) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; }

function routesFrom(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(j)) return j;
  if (Array.isArray(j.payloads)) return j.payloads.map(p => p.route);
  if (Array.isArray(j.games)) return j.games.map(g => g.route);
  throw new Error('routes file holds neither a list, build-report payloads nor play-discovery games');
}

const STAGE_MS = 20000;
const stage = (promise, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('stuck: ' + what)), STAGE_MS))]);

export async function measure(browser, origin, route) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(ts => { window.__frames++; return cb(ts); });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 120)));
  const t0 = Date.now();
  let out;
  try {
    const r = await page.goto(origin + encodeURI(route), { waitUntil: 'load', timeout: LOAD_TIMEOUT });
    const status = r ? r.status() : 0;
    const boot = Date.now() - t0;
    await page.waitForTimeout(SETTLE_MS);
    // Both windows are timed INSIDE the page, so a busy main thread stretches
    // the wall clock without stretching the window; a page that cannot answer
    // within STAGE_MS is recorded as stuck rather than waited on for ever.
    const idle = await stage(page.evaluate(ms => new Promise(res => { const a = window.__frames; setTimeout(() => res(window.__frames - a), ms); }), IDLE_MS), 'idle window');
    await stage(page.mouse.click(195, 600).catch(() => {}), 'click');
    await stage(page.keyboard.press('Space').catch(() => {}), 'keypress');
    const frames = await stage(page.evaluate(ms => new Promise(res => { const a = window.__frames; setTimeout(() => res(window.__frames - a), ms); }), FPS_MS), 'fps window');
    out = { route, status, boot, idle, fps: Math.round(frames * 1000 / FPS_MS), errors: errors.length, loaded: status === 200 };
  } catch (e) {
    const msg = String(e.message);
    out = msg.startsWith('stuck:') ? { route, loaded: true, stuck: true, error: msg.slice(0, 100), errors: errors.length } : { route, loaded: false, error: msg.slice(0, 100) };
  }
  await stage(ctx.close(), 'context close').catch(() => {});
  return out;
}

export function judge(before, after) {
  const reasons = [];
  if (!before.loaded && !after.loaded) return { verdict: 'INCONCLUSIVE', reasons: ['did not load on either build'] };
  if (before.loaded && !after.loaded) return { verdict: 'RED', reasons: ['loaded before, not after: ' + (after.error || after.status)] };
  if (!before.loaded && after.loaded) return { verdict: 'OK', reasons: ['loads now, did not before'] };
  if (before.stuck && after.stuck) return { verdict: 'INCONCLUSIVE', reasons: ['main thread unresponsive on both builds'] };
  if (!before.stuck && after.stuck) return { verdict: 'RED', reasons: ['main thread unresponsive after: ' + after.error] };
  if (before.stuck && !after.stuck) return { verdict: 'OK', reasons: ['answers now, was unresponsive before'] };
  const idleCap = Math.max(before.idle * 1.5, before.idle + 10);
  if (after.idle > idleCap) reasons.push(`idle repaint ${before.idle} → ${after.idle} frames/${IDLE_MS} ms (cap ${Math.round(idleCap)})`);
  if (before.fps >= 30 && after.fps < before.fps * 0.7) reasons.push(`frame rate ${before.fps} → ${after.fps} fps`);
  if (before.errors === 0 && after.errors > 0) reasons.push(`page errors 0 → ${after.errors}`);
  return { verdict: reasons.length ? 'RED' : 'OK', reasons };
}

export async function gate({ before, after, routes, report, browser }) {
  const own = !browser;
  if (own) browser = await chromium.launch({ args: ['--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const rows = [];
  for (const route of routes) {
    const b = await measure(browser, before, route);
    const a = await measure(browser, after, route);
    const j = judge(b, a);
    rows.push({ route, before: b, after: a, ...j });
    const tag = j.verdict === 'RED' ? 'RED ' : j.verdict === 'INCONCLUSIVE' ? '??  ' : 'ok  ';
    console.log(`  ${tag} ${route}  idle ${b.idle ?? '-'}→${a.idle ?? '-'}  fps ${b.fps ?? '-'}→${a.fps ?? '-'}  errors ${b.errors ?? '-'}→${a.errors ?? '-'}${j.reasons.length ? '  [' + j.reasons.join('; ') + ']' : ''}`);
  }
  if (own) await browser.close();
  const red = rows.filter(r => r.verdict === 'RED'), inconclusive = rows.filter(r => r.verdict === 'INCONCLUSIVE');
  const summary = { routes: rows.length, red: red.map(r => ({ route: r.route, reasons: r.reasons })), inconclusive: inconclusive.map(r => r.route), idle_ms: IDLE_MS, fps_ms: FPS_MS, rows };
  if (report) fs.writeFileSync(report, JSON.stringify(summary, null, 1));
  if (!rows.length) { console.log('PERF GATE: INCONCLUSIVE — no routes'); return 2; }
  if (red.length) { console.log(`PERF GATE: RED — ${red.length} route(s) regressed: ${red.map(r => r.route).join(', ')}`); return 1; }
  if (inconclusive.length === rows.length) { console.log('PERF GATE: INCONCLUSIVE — no route loaded on either build'); return 2; }
  console.log(`PERF GATE: CLEAR — ${rows.length} routes, none regressed${inconclusive.length ? `, ${inconclusive.length} inconclusive (named above)` : ''}`);
  return 0;
}

/* ---------- self-test: a scratch estate with planted defects ---------- */
const BENIGN = (title) => `<!doctype html><title>${title}</title><canvas id=c width=200 height=200></canvas>
<script>const x=document.getElementById('c').getContext('2d');let n=0;function loop(){x.fillStyle=n++%2?'#123':'#321';x.fillRect(0,0,200,200);requestAnimationFrame(loop);}requestAnimationFrame(loop);</script>`;
const IDLE_DEFECT = `<!doctype html><title>idle defect</title><canvas id=c width=200 height=200></canvas>
<script>const x=document.getElementById('c').getContext('2d');function loop(){x.fillRect(0,0,200,200);requestAnimationFrame(loop);}
for(let i=0;i<4;i++)requestAnimationFrame(loop);</script>`;
const SPIN_DEFECT = `<!doctype html><title>spin defect</title><canvas id=c width=200 height=200></canvas>
<script>const x=document.getElementById('c').getContext('2d');function loop(){const t=performance.now();while(performance.now()-t<45){}x.fillRect(0,0,200,200);requestAnimationFrame(loop);}requestAnimationFrame(loop);</script>`;

function serve(root) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => resolve({ server: s, origin: 'http://127.0.0.1:' + s.address().port }));
  });
}

async function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'play-perf-'));
  const mk = (dir, files) => { for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.join(dir, f), { recursive: true }); fs.writeFileSync(path.join(dir, f, 'index.html'), body); } };
  const before = path.join(tmp, 'before'), after = path.join(tmp, 'after');
  mk(before, { alpha: BENIGN('alpha'), beta: BENIGN('beta'), gamma: BENIGN('gamma') });
  mk(after, { alpha: IDLE_DEFECT, beta: SPIN_DEFECT, gamma: BENIGN('gamma') });
  const b = await serve(before), a = await serve(after);
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  let ok = true;
  const control = (name, passed, detail = '') => { ok = ok && passed; console.log(`  [${passed ? 'ok' : 'FAIL'}] ${name}${detail ? '  — ' + detail : ''}`); };
  const routes = ['/alpha/', '/beta/', '/gamma/'];
  console.log('run 1: identical trees');
  let rc = await gate({ before: b.origin, after: b.origin, routes, browser });
  control('identical trees are green', rc === 0, 'rc=' + rc);
  console.log('run 2: two planted defects');
  const rep = path.join(tmp, 'r.json');
  rc = await gate({ before: b.origin, after: a.origin, routes, report: rep, browser });
  const r = JSON.parse(fs.readFileSync(rep, 'utf8'));
  const redRoutes = r.red.map(x => x.route).sort();
  control('the idle-repaint defect and the spin defect are both named, gamma is not', rc === 1 && redRoutes.join() === '/alpha/,/beta/', redRoutes.join() || '(none)');
  const alpha = r.red.find(x => x.route === '/alpha/'), beta = r.red.find(x => x.route === '/beta/');
  control('alpha is named for idle repaint', !!alpha && alpha.reasons.some(s => s.startsWith('idle repaint')), alpha?.reasons.join('; '));
  control('beta is named for frame rate', !!beta && beta.reasons.some(s => s.startsWith('frame rate')), beta?.reasons.join('; '));
  console.log('run 3: defects removed');
  mk(after, { alpha: BENIGN('alpha'), beta: BENIGN('beta') });
  rc = await gate({ before: b.origin, after: a.origin, routes, browser });
  control('defects removed, green again', rc === 0, 'rc=' + rc);
  const h = judge({ loaded: true, idle: 30, fps: 60, errors: 0 }, { loaded: true, stuck: true, error: 'stuck: fps window', errors: 0 });
  control('a route whose main thread stops answering is named RED', h.verdict === 'RED' && h.reasons[0].startsWith('main thread unresponsive'), h.reasons.join('; '));
  const j = judge({ loaded: false }, { loaded: false });
  control('a route missing on both builds is INCONCLUSIVE, not red', j.verdict === 'INCONCLUSIVE');
  await browser.close(); b.server.close(); a.server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('self-test', ok ? 'PASS' : 'FAIL');
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--self-test')) process.exit(await selfTest());
  const before = arg('--before'), after = arg('--after'), routesFile = arg('--routes');
  if (!before || !after || !routesFile) { console.error('usage: --before URL --after URL --routes FILE [--report FILE] | --self-test'); process.exit(2); }
  process.exit(await gate({ before, after, routes: routesFrom(routesFile), report: arg('--report') }));
}
