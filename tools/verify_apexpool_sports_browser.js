#!/usr/bin/env node
'use strict';
const fs=require('fs');
const{chromium}=require('playwright');
const BASE=(process.env.ARCADE_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const games=(JSON.parse(fs.readFileSync(process.env.APEXPOOL_GAMES_FILE||'games.json','utf8')).games||[]);
const before=(JSON.parse(fs.readFileSync(process.env.APEXPOOL_GAMES_BASELINE,'utf8')).games||[]);
let pass=0,fail=0;
function ok(n,c,d=''){if(c){pass++;console.log('  PASS  '+n+(d?'   '+d:''));}else{fail++;console.log('  FAIL  '+n+(d?'   '+d:''));}}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
(async()=>{let browser;try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1180,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 const response=await page.goto(BASE+'/games/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('#sportsRail .gcard').length===2&&!/Loading|could not load/.test(document.getElementById('countline').textContent));
 const s=await page.evaluate(()=>{function t(e){const n=e.querySelector('h3')||e.querySelector('h4 span');return n?n.textContent.trim():''}function cs(q){return[...document.querySelectorAll(q)].map(e=>({title:t(e),href:new URL(e.getAttribute('href'),location.href).pathname}))}return{sports:cs('#sportsRail .gcard'),top:cs('#topRail .pick'),themes:cs('#tgrids .gcard'),classroom:cs('#classRail .gcard'),shelf:cs('#allGrid .gcard'),all:cs('.pick,.gcard'),chips:[...document.querySelectorAll('#chips .chip')].map(b=>b.textContent.trim()),count:document.getElementById('countline').textContent.trim(),hidden:document.getElementById('sports').hidden,overflow:document.documentElement.scrollWidth>innerWidth,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}});
 const occ=n=>s.all.filter(c=>c.title===n).length;
 const top=['Voxel Frontier','Off-Brand','Glitch Clash','Hold the Mark','Orbital','Slipstream - GP','Grid Chase'];
 const themes=['Orbital','Marble','Trail Runner','Trekkers Trail Runner — Tees Coast','Grid Chase','Neon Garden','Neon Siege'];
 const classroom=before.filter(g=>g.tag==='Class game').map(g=>g.title);
 const curated=['Apex Kick','Voxel Frontier','Off-Brand','Glitch Clash','Hold the Mark','Orbital','Slipstream - GP','Grid Chase','Marble','Trail Runner','Trekkers Trail Runner — Tees Coast','Neon Garden','Neon Siege'];
 const shelf=games.filter(g=>g.collection!=='Sports').slice().sort((a,b)=>(curated.includes(a.title)?0:1)-(curated.includes(b.title)?0:1)||a.title.localeCompare(b.title)).map(g=>g.title);
 console.log('== Rendered Apex Pool Sports gates ==');
 ok('arcade-responds-200',response&&response.status()===200,response?String(response.status()):'none');
 ok('B2-sports-exactly-two-adjacent',!s.hidden&&same(s.sports.map(c=>c.title),['Apex Kick','Apex Pool']),JSON.stringify(s.sports));
 ok('B3-apex-kick-once',occ('Apex Kick')===1,String(occ('Apex Kick')));ok('B3-apex-pool-once',occ('Apex Pool')===1,String(occ('Apex Pool')));
 ok('B4-top-survivors-exact',same(s.top.map(c=>c.title),top));ok('B4-themed-exact',same(s.themes.map(c=>c.title),themes));ok('B4-classroom-exact',same(s.classroom.map(c=>c.title),classroom));ok('B4-shelf-exact',same(s.shelf.map(c=>c.title),shelf));
 ok('B5-no-sport-chip',!s.chips.includes('SPORT')&&s.chips.includes('PHYSICS'),s.chips.join(' | '));ok('B7-links-exact',same(s.sports.map(c=>c.href),['/apexkick/','/apexpool/']));
 ok('B7-count-derived',s.count.includes(String(games.length))&&s.count.includes(String(games.length-2)),s.count);ok('reduced-motion-no-overflow',s.reduced&&!s.overflow);ok('zero-console-errors',errors.length===0,errors.join(' | ')||'none');
 await context.close();
 }catch(e){fail++;console.error(e.stack||e)}finally{if(browser)await browser.close()}
 console.log('='.repeat(64));console.log(fail===0?`ALL ${pass} SPORTS BROWSER CHECKS PASSED`:`${pass} passed, ${fail} FAILED`);console.log('='.repeat(64));process.exit(fail?1:0);
})();
