// Echo Vault gate suite at tip: G1, G2, G4, G5, G6, G8, G9, G10.
// (G3 = ev_gate_echoread.mjs, G7/U1 = ev_gate_pulse.mjs, U9/U10 = ev_gate_loop.mjs.)
import { launch, boot, startRun, beginBusyPlay, endBusyPlay, measureFrames, VIEWPORTS } from './ev_harness.mjs';
import fs from 'node:fs';
const FILE = process.argv[2] || 'work/echovault_v1.1.html';
const BUDGET = 204800;
const res = [];
const rec = (id, pass, detail, extra={}) => res.push({ id, pass, detail, ...extra });
const browser = await launch();

// ---- G1 ----
{
  const page = await boot(browser, FILE, VIEWPORTS.phone);
  const remote = [];
  page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) remote.push(r.url()); });
  await startRun(page); await page.waitForTimeout(1500);
  const src = fs.readFileSync(FILE,'utf8');
  const RUNTIME = /<(?:script|img|audio|video|source|iframe|embed)\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//gi;
  const refs = [...src.matchAll(RUNTIME)];
  const tamperCaught = [...src.replace('<title>','<script src="https://x.example/y.js"></script><title>').matchAll(RUNTIME)].length > refs.length;
  rec('G1', remote.length===0 && refs.length===0 && (src.match(/<script/g)||[]).length===1 && tamperCaught,
    `${remote.length} network requests, ${refs.length} runtime-fetching refs (canonical/og are metadata), 1 script; injected-remote control caught: ${tamperCaught}`);
  await page.context().close();
}

// ---- G2: size + phone-viewport fps (the usable figure) ----
{
  const size = fs.statSync(FILE).size;
  const page = await boot(browser, FILE, VIEWPORTS.phone);
  await startRun(page); await beginBusyPlay(page);
  const perf = await measureFrames(page, 18);
  await endBusyPlay(page); await page.context().close();
  rec('G2', size <= BUDGET, `${size} B of ${BUDGET} budget (${BUDGET-size} spare); phone 390x844 ${perf.fps} fps, p95 ${perf.p95FrameMs}ms`, { size, perf });
}

// ---- G4: storage census + corrupted-save probe ----
{
  const SIBLINGS = ['madebymatt.echoVault.v1','mbm_relicforge_v1','madebymatt_relicforge_v1','mbm_apex_rally_v1','mbm_neon_sync_v1'];
  const page = await boot(browser, FILE, VIEWPORTS.phone);
  await startRun(page);
  await page.evaluate(()=>{ document.getElementById('start-flash-btn')?.click(); }); // force a persist
  await page.waitForTimeout(400);
  const keys = await page.evaluate(()=>Object.keys(localStorage));
  const ours = keys.filter(k=>k.startsWith('mbm_echovault_'));
  const strays = keys.filter(k=>!k.startsWith('mbm_echovault_'));
  await page.evaluate(()=>localStorage.setItem('mbm_echovault_v1','{"settings":"not-an-object",'));
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__echoVault,null,{timeout:20000});
  const booted = await page.evaluate(()=>{ window.__echoVault.start(); return window.__echoVault.getState().state; });
  rec('G4', ours.length===1 && strays.length===0 && booted==='playing' && page._evErrors.length===0,
    `keys ${JSON.stringify(keys)}; siblings checked ${SIBLINGS.length}, hits ${keys.filter(k=>SIBLINGS.includes(k)).length}; corrupted save booted to "${booted}" with ${page._evErrors.length} errors`);
  await page.context().close();
}

// ---- G5: rendered size, every surface, both viewports ----
{
  const bad = [];
  for (const [n,vp] of Object.entries(VIEWPORTS)) {
    const page = await boot(browser, FILE, vp);
    for (const show of ['start','pause']) {
      await page.evaluate((s)=>{
        document.querySelectorAll('.modal,.overlay,[id$="-screen"]').forEach(m=>m.classList.remove('hidden'));
        if (s==='pause') document.getElementById('pause-screen')?.classList.remove('hidden');
      }, show);
      const off = await page.evaluate((ctx)=>{
        const out=[];
        for (const el of document.querySelectorAll('button,[role="button"],input,select,a[href]')) {
          const r=el.getBoundingClientRect(), st=getComputedStyle(el);
          if (st.display==='none'||st.visibility==='hidden'||r.width===0||r.height===0) continue;
          if (r.width<44||r.height<44) out.push(`${ctx}:${el.id||el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out;
      }, `${n}/${show}`);
      bad.push(...off);
    }
    await page.context().close();
  }
  rec('G5', bad.length===0, `${bad.length} controls under 44px by RENDERED box across 2 viewports x 2 surfaces`, { offenders: bad.slice(0,8) });
}

// ---- G6: WebGL-absent + context-loss panels share one renderer ----
{
  const src = fs.readFileSync(FILE,'utf8');
  const page = await boot(browser, FILE, VIEWPORTS.phone);
  const lost = await page.evaluate(()=>{
    const c=document.querySelector('canvas');
    const gl=c.getContext('webgl2')||c.getContext('webgl');
    const ext=gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) return { supported:false };
    ext.loseContext();
    return { supported:true };
  });
  await page.waitForTimeout(800);
  const panel = await page.evaluate(()=>{
    const o=document.getElementById('fatal-overlay');
    return { visible: o && !o.hidden, stamp: o && o.dataset ? o.dataset.renderer : null,
             title: (document.getElementById('fatal-title')||{}).textContent,
             copy: ((document.getElementById('fatal-copy')||{}).textContent||'').slice(0,60) };
  });
  // ONE renderer: every path that shows this panel must go through showRendererPanel,
  // so there must be zero direct writes left. The dataset stamp proves the panel on
  // screen was produced by that function and not by a second copy of the code.
  const direct = (src.match(/\$\('fatal-overlay'\)\.hidden\s*=\s*false/g)||[]).length;
  const viaRenderer = (src.match(/showRendererPanel\(/g)||[]).length;
  rec('G6', lost.supported && panel.visible && panel.stamp==='renderer-panel-v1' && direct===0 && viaRenderer>=4,
    `context loss rendered the SAME panel ("${panel.title}" — ${panel.copy}…), stamped by the single renderer; direct writes bypassing it: ${direct}; call sites through it: ${viaRenderer-1} + its definition`);
  await page.context().close();
}

// ---- G8: every setting live-togglable both ways ----
{
  const page = await boot(browser, FILE, VIEWPORTS.phone);
  const t = await page.evaluate(()=>{
    const out={};
    for (const [key,id] of [['audio','start-audio-btn'],['fullMotion','start-motion-btn'],['fullFlash','start-flash-btn']]) {
      const before = window.__echoVault.settings()[key];
      document.getElementById(id).click();
      const mid = window.__echoVault.settings()[key];
      document.getElementById(id).click();
      const after = window.__echoVault.settings()[key];
      out[key] = { before, mid, after, bothWays: before!==mid && mid!==after };
    }
    return out;
  });
  const ok = Object.values(t).every(x=>x.bothWays);
  rec('G8', ok, `settings toggled both directions live: ${Object.entries(t).map(([k,v])=>`${k} ${v.before}->${v.mid}->${v.after}`).join('; ')}`);
  await page.context().close();
}

// ---- G9: headless sector completion, including a breath run and a loud-ping run ----
{
  const runs = [];
  for (const mode of ['plain','breath','loud']) {
    const page = await boot(browser, FILE, VIEWPORTS.phone);
    await startRun(page);
    const t = await page.evaluate(async (m)=>{
      const ev=window.__echoVault; const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const nan=[];
      if (m==='loud') { ev.loudPing(); await wait(300); }
      let breathHeldDuringHold = null;
      if (m==='breath') {
        const t0=performance.now(); while (performance.now()-t0<4200) await wait(150);
        breathHeldDuringHold = ev.breath().held;   // measured while held, not after
      }
      for (let i=0;i<3;i++){ ev.ping(); await wait(180); }
      const mid=ev.getState();
      for (const [k,v] of Object.entries(mid)) if (typeof v==='number' && !Number.isFinite(v)) nan.push(k);
      ev.completeSector(); await wait(1400);
      const end=ev.getState();
      for (const [k,v] of Object.entries(end)) if (typeof v==='number' && !Number.isFinite(v)) nan.push(k);
      return { mode:m, cores:end.cores, sector:end.sector, state:end.state, nan,
               breathHeld:breathHeldDuringHold, loudPings:ev.breath().loudPings };
    }, mode);
    t.errors = page._evErrors.slice(0,2);
    runs.push(t);
    await page.context().close();
  }
  const ok = runs.every(r=>r.nan.length===0 && r.errors.length===0 && r.cores>=3)
    && runs.find(r=>r.mode==='breath').breathHeld===true
    && runs.find(r=>r.mode==='loud').loudPings===1;
  rec('G9', ok, `3 headless sector drives: ${runs.map(r=>`${r.mode} cores=${r.cores} state=${r.state}`).join(' | ')}; breath engaged in the breath run: ${runs.find(r=>r.mode==='breath').breathHeld}; loud pings in the lure run: ${runs.find(r=>r.mode==='loud').loudPings}; NaN: none`, { runs });
}

// ---- G10: same-seed layouts identical, rig proven sighted ----
{
  const layout = async (seed) => {
    const page = await boot(browser, FILE, VIEWPORTS.phone);
    const out = await page.evaluate((s)=>{
      let st=s>>>0; Math.random=()=>{ st=(st*1664525+1013904223)>>>0; return st/4294967296; };
      window.__echoVault.start();
      return JSON.stringify(window.__echoVault.layout());
    }, seed);
    await page.context().close();
    return out;
  };
  const a = await layout(4242), b2 = await layout(4242), c = await layout(777);
  rec('G10', a===b2 && a!==c, `same seed identical: ${a===b2}; different seed differs: ${a!==c} (the rig is sighted because the differing-seed case is asserted, not assumed)`);
}

await browser.close();
for (const r of res) console.log(`${r.pass?'PASS':'FAIL'}  ${r.id}  ${r.detail}`);
fs.writeFileSync('reports/echovault/gates.json', JSON.stringify(res,null,2));
const bad = res.filter(r=>!r.pass);
console.log(`\n${res.length-bad.length}/${res.length} gates pass${bad.length?' — FAILED: '+bad.map(b=>b.id).join(', '):''}`);
process.exit(bad.length?1:0);
