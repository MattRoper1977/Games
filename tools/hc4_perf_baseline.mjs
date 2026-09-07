#!/usr/bin/env node
/* hc4_perf_baseline — timing baseline of the Play tree as served from current main.
 *
 * Order HC4 §6.3. This harness REPORTS numbers; it enforces nothing. There are
 * no thresholds, no verdicts and no non-zero exit for a slow route — GS1 owns
 * thresholds. The output is a current-main baseline (not historical): a set of
 * measurements taken on one machine, on one day, against the tree built from
 * the pins Play currently serves, so that a later run on the same machine has
 * something to be compared with.
 *
 * Measurement is lifted from tools/play_perf_gate.mjs (HC3 §3.2) so the two
 * agree on what a frame is: a requestAnimationFrame callback that actually ran,
 * counted by wrapping rAF before any page script executes. Every window is
 * timed INSIDE the page (setTimeout in page.evaluate), so a busy main thread
 * stretches the wall clock without stretching the window; a page that cannot
 * answer within STAGE_MS is recorded as 'unresponsive' and the sweep moves on.
 * The gate's thresholds and judge() are deliberately not carried over.
 *
 * Per route, per run:
 *   nav.responseEnd / nav.domContentLoaded / nav.load   ms from timeOrigin,
 *       from performance.getEntriesByType('navigation')[0]
 *   transfer.document / transfer.total                  bytes (navigation
 *       entry transferSize; plus every resource entry's transferSize)
 *   idle_raf    rAF callbacks invoked in a 3000 ms in-page window that opens
 *               1000 ms after the load event
 *   fps         rAF callbacks per second over a 3000 ms in-page window while
 *               ArrowRight is held down
 *   longtasks   PerformanceObserver 'longtask' entries seen from before first
 *               script to the end of the fps window (null where unsupported)
 *   errors      pageerror events
 *
 * Three-run recipe: the whole route list is swept three times in the same
 * process (runs 1..3) and the median of each numeric metric is recorded per
 * route. Median of n values = the middle value (mean of the two middles when
 * n is even); a run in which the route did not load or was unresponsive
 * contributes nothing to the medians and is counted instead.
 *
 * Self-test (--self-test, also run at the head of every baseline): one scratch
 * route measured real → planted → restored, where "planted" is the same page
 * carrying a deliberate idle re-arm loop (four rAF chains instead of one). The
 * harness must REPORT a higher idle_raf for the planted page than for the
 * clean one; it does not fail the baseline run either way, it records what it
 * saw. Standalone --self-test exits 1 only when the defect was not visible.
 *
 * Usage
 *   node tools/hc4_perf_baseline.mjs --origin URL --routes build-report.json --out FILE [--runs 3] [--games-root DIR]
 *   node tools/hc4_perf_baseline.mjs --self-test
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const spec of ['playwright', process.env.PLAYWRIGHT_MODULE, '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try { return { pw: require(spec), version: require(spec + '/package.json').version }; } catch { /* next */ }
  }
  throw new Error('playwright not resolvable: install it or set PLAYWRIGHT_MODULE');
}

export const LABEL = 'label: current-main baseline (not historical)';
export const SETTLE_MS = 1000, IDLE_MS = 3000, FPS_MS = 3000, LOAD_TIMEOUT = 30000, STAGE_MS = 30000, RUNS = 3;
export const HOLD_KEY = 'ArrowRight';
export const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

function arg(name, dflt) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; }

export function routesFrom(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(j)) return { routes: j, source_heads: null, counts: null };
  if (Array.isArray(j.payloads)) return { routes: j.payloads.map(p => p.route), source_heads: j.source_heads || null, counts: j.counts || null, source_census_sha256: j.source_census_sha256 || null };
  if (Array.isArray(j.games)) return { routes: j.games.map(g => g.route), source_heads: null, counts: null };
  throw new Error('routes file holds neither a list, build-report payloads nor play-discovery games');
}

const stage = (promise, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('stuck: ' + what)), STAGE_MS))]);

// In-page window: count rAF callbacks invoked during `ms`, timed by the page's own clock.
const countFrames = ms => new Promise(res => { const a = window.__frames; setTimeout(() => res(window.__frames - a), ms); });

export async function measure(browser, origin, route) {
  // Same context shape as play_perf_gate.measure so the two harnesses see the same page.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(ts => { window.__frames++; return cb(ts); });
    window.__longtasks = null;
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        window.__longtasks = 0;
        new PerformanceObserver(list => { window.__longtasks += list.getEntries().length; }).observe({ type: 'longtask', buffered: true });
      }
    } catch { window.__longtasks = null; }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
  const t0 = Date.now();
  let out;
  try {
    const r = await page.goto(origin + encodeURI(route), { waitUntil: 'load', timeout: LOAD_TIMEOUT });
    const status = r ? r.status() : 0;
    const wall_to_load = Date.now() - t0;
    await page.waitForTimeout(SETTLE_MS);
    const nav = await stage(page.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource');
      const sum = res.reduce((a, e) => a + (e.transferSize || 0), 0);
      return n ? {
        responseEnd: Math.round(n.responseEnd), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd),
        transfer_document: n.transferSize, transfer_total: n.transferSize + sum, resources: res.length,
      } : null;
    }), 'navigation timing');
    const idle_raf = await stage(page.evaluate(countFrames, IDLE_MS), 'idle window');
    await stage(page.keyboard.down(HOLD_KEY).catch(() => {}), 'keydown');
    const held = await stage(page.evaluate(countFrames, FPS_MS), 'fps window');
    await stage(page.keyboard.up(HOLD_KEY).catch(() => {}), 'keyup');
    const longtasks = await stage(page.evaluate(() => window.__longtasks), 'longtask count');
    out = {
      route, state: 'measured', status, wall_to_load_ms: wall_to_load,
      nav: nav ? { responseEnd: nav.responseEnd, domContentLoaded: nav.domContentLoaded, load: nav.load } : null,
      transfer: nav ? { document: nav.transfer_document, total: nav.transfer_total, resources: nav.resources } : null,
      idle_raf, held_frames: held, fps: Math.round(held * 1000 / FPS_MS), longtasks, errors: errors.length, error_messages: errors.slice(0, 5),
    };
  } catch (e) {
    const msg = String(e.message);
    out = msg.startsWith('stuck:') ? { route, state: 'unresponsive', stage: msg.slice(7, 60), wall_ms: Date.now() - t0, errors: errors.length, error_messages: errors.slice(0, 5) }
      : { route, state: 'failed', error: msg.slice(0, 160), wall_ms: Date.now() - t0, errors: errors.length, error_messages: errors.slice(0, 5) };
  }
  await stage(ctx.close(), 'context close').catch(() => {});
  return out;
}

export function median(values) {
  const v = values.filter(x => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const METRICS = [
  ['nav.responseEnd', r => r.nav?.responseEnd], ['nav.domContentLoaded', r => r.nav?.domContentLoaded], ['nav.load', r => r.nav?.load],
  ['transfer.document', r => r.transfer?.document], ['transfer.total', r => r.transfer?.total],
  ['wall_to_load_ms', r => r.wall_to_load_ms], ['idle_raf', r => r.idle_raf], ['fps', r => r.fps], ['longtasks', r => r.longtasks], ['errors', r => r.errors],
];

export function summarise(route, runs) {
  const measured = runs.filter(r => r.state === 'measured');
  const med = {};
  for (const [name, get] of METRICS) med[name] = median(measured.map(get));
  return {
    route, runs, measured: measured.length,
    unresponsive: runs.filter(r => r.state === 'unresponsive').length, failed: runs.filter(r => r.state === 'failed').length,
    median: med,
  };
}

const fmt = r => r.state === 'measured'
  ? `load ${r.nav?.load ?? '-'} ms  bytes ${r.transfer?.total ?? '-'}  idle ${r.idle_raf}  fps ${r.fps}  longtasks ${r.longtasks ?? 'n/a'}  errors ${r.errors}`
  : `${r.state.toUpperCase()} (${r.stage || r.error})`;

export async function sweep({ browser, origin, routes, runs = RUNS, log = console.log }) {
  const perRoute = new Map(routes.map(r => [r, []]));
  for (let run = 1; run <= runs; run++) {
    log(`run ${run}/${runs}: ${routes.length} routes`);
    for (const route of routes) {
      const m = await measure(browser, origin, route);
      m.run = run;
      perRoute.get(route).push(m);
      log(`  [${run}] ${route}  ${fmt(m)}`);
    }
  }
  return routes.map(route => summarise(route, perRoute.get(route)));
}

/* ---------- self-test: one scratch route, real → planted → restored ---------- */
const CLEAN = `<!doctype html><title>probe</title><canvas id=c width=200 height=200></canvas>
<script>const x=document.getElementById('c').getContext('2d');let n=0;function loop(){x.fillStyle=n++%2?'#123':'#321';x.fillRect(0,0,200,200);requestAnimationFrame(loop);}requestAnimationFrame(loop);</script>`;
const PLANTED = `<!doctype html><title>probe (planted idle re-arm)</title><canvas id=c width=200 height=200></canvas>
<script>const x=document.getElementById('c').getContext('2d');function loop(){x.fillRect(0,0,200,200);requestAnimationFrame(loop);}
for(let i=0;i<4;i++)requestAnimationFrame(loop);</script>`;

function serve(root) {
  return new Promise(resolve => {
    const s = http.createServer((req, res) => {
      let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(p));
    });
    s.listen(0, '127.0.0.1', () => resolve({ server: s, origin: 'http://127.0.0.1:' + s.address().port }));
  });
}

export async function selfTest(browser, log = console.log) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hc4-perf-'));
  const dir = path.join(tmp, 'probe'); fs.mkdirSync(dir, { recursive: true });
  const put = body => fs.writeFileSync(path.join(dir, 'index.html'), body);
  const { server, origin } = await serve(tmp);
  const pick = r => ({ state: r.state, idle_raf: r.idle_raf ?? null, fps: r.fps ?? null, longtasks: r.longtasks ?? null, errors: r.errors });
  put(CLEAN); const real = pick(await measure(browser, origin, '/probe/'));
  put(PLANTED); const planted = pick(await measure(browser, origin, '/probe/'));
  put(CLEAN); const restored = pick(await measure(browser, origin, '/probe/'));
  server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  const demonstrated = real.state === 'measured' && planted.state === 'measured' && planted.idle_raf > real.idle_raf;
  const result = {
    what: `one scratch route measured real -> planted (four idle rAF chains instead of one) -> restored; idle_raf over ${IDLE_MS} ms`,
    real, planted, restored, demonstrated,
    note: demonstrated ? 'the harness reported the planted idle re-arm as a higher idle_raf count' : 'the planted defect was NOT visible in idle_raf — the measurement is not proved',
  };
  log(`self-test: idle_raf real ${real.idle_raf} -> planted ${planted.idle_raf} -> restored ${restored.idle_raf}  (${demonstrated ? 'defect reported' : 'DEFECT NOT VISIBLE'})`);
  return result;
}

/* ---------- baseline ---------- */
function sha256File(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function gitHead(dir) { try { return execSync('git rev-parse HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } }
function gitBranch(dir) { try { return execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } }

export async function baseline({ origin, routesFile, out, runs = RUNS, gamesRoot }) {
  const { pw, version: playwright } = loadPlaywright();
  const started_utc = new Date().toISOString();
  const rf = routesFrom(routesFile);
  const harnessPath = new URL(import.meta.url).pathname;
  gamesRoot = gamesRoot || path.resolve(path.dirname(harnessPath), '..');
  const browser = await pw.chromium.launch({ args: LAUNCH_ARGS });
  const chromiumVersion = browser.version();
  console.log(`chromium ${chromiumVersion}  node ${process.version}  playwright ${playwright}`);
  const self_test = await selfTest(browser);
  const routes = await sweep({ browser, origin, routes: rf.routes, runs });
  await browser.close();
  const ended_utc = new Date().toISOString();
  const loaded = routes.filter(r => r.median['nav.load'] != null);
  const slowest = [...loaded].sort((a, b) => b.median['nav.load'] - a.median['nav.load']).slice(0, 10)
    .map(r => ({ route: r.route, median_load_ms: r.median['nav.load'], median_transfer_total: r.median['transfer.total'], median_idle_raf: r.median['idle_raf'], median_fps: r.median['fps'] }));
  const report = {
    label: LABEL,
    order: 'HC4 §6.3 — new baseline of current main',
    enforcement: 'none. This file records measurements only; no threshold is applied or implied. GS1 owns thresholds.',
    started_utc, ended_utc,
    harness: { path: path.relative(gamesRoot, harnessPath), sha256: sha256File(harnessPath) },
    versions: { node: process.version, chromium: chromiumVersion, playwright, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpus: os.cpus().length, cpu_model: os.cpus()[0]?.model || null },
    games: { head: gitHead(gamesRoot), branch: gitBranch(gamesRoot) },
    served_tree: { origin, routes_file: routesFile, source_heads: rf.source_heads, counts: rf.counts, source_census_sha256: rf.source_census_sha256 || null },
    recipe: {
      runs, route_order: 'build-report payload order', context: 'viewport 390x844, isMobile, hasTouch, dpr 2, service workers blocked (same as play_perf_gate)',
      launch_args: LAUNCH_ARGS, load: `page.goto waitUntil load, timeout ${LOAD_TIMEOUT} ms`,
      settle_ms: SETTLE_MS, idle_ms: IDLE_MS, fps_ms: FPS_MS, hold_key: HOLD_KEY, stage_timeout_ms: STAGE_MS,
      frame: 'a requestAnimationFrame callback actually invoked (rAF wrapped before first page script)',
      median: 'middle value of the measured runs; mean of the two middles when even; unresponsive/failed runs excluded and counted',
      unresponsive: `a route whose page cannot answer an in-page stage within ${STAGE_MS} ms is recorded as unresponsive for that run and the sweep moves on`,
    },
    self_test,
    summary: {
      routes: routes.length, runs,
      routes_measured_all_runs: routes.filter(r => r.measured === runs).length,
      routes_with_unresponsive_run: routes.filter(r => r.unresponsive > 0).map(r => r.route),
      routes_with_failed_run: routes.filter(r => r.failed > 0).map(r => r.route),
      routes_with_errors: routes.filter(r => r.median.errors > 0).map(r => ({ route: r.route, median_errors: r.median.errors })),
      slowest_by_median_load: slowest,
    },
    routes,
  };
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`baseline written: ${out}  (${routes.length} routes x ${runs} runs, ${started_utc} → ${ended_utc})`);
  console.log('slowest by median load:'); for (const s of slowest) console.log(`  ${String(s.median_load_ms).padStart(6)} ms  ${s.route}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.includes('--self-test')) {
    const { pw } = loadPlaywright();
    const browser = await pw.chromium.launch({ args: LAUNCH_ARGS });
    const r = await selfTest(browser);
    await browser.close();
    console.log(JSON.stringify(r, null, 1));
    process.exit(r.demonstrated ? 0 : 1);
  }
  const origin = arg('--origin'), routesFile = arg('--routes'), out = arg('--out');
  if (!origin || !routesFile || !out) { console.error('usage: --origin URL --routes build-report.json --out FILE [--runs 3] [--games-root DIR] | --self-test'); process.exit(2); }
  await baseline({ origin, routesFile, out, runs: Number(arg('--runs', RUNS)), gamesRoot: arg('--games-root') });
  process.exit(0);
}
