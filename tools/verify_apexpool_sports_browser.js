#!/usr/bin/env node
'use strict';
const fs=require('fs'),{chromium}=require('playwright');
const BASE=(process.env.ARCADE_BASE_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const games=(JSON.parse(fs.readFileSync(process.env.APEXPOOL_GAMES_FILE||'games.json','utf8')).games||[]);
let pass=0,fail=0;const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function ok(name,condition,detail=''){console.log((condition?'  PASS  ':'  FAIL  ')+name+(detail?'   '+detail:''));condition?pass++:fail++}
(async()=>{let browser;try{browser=await chromium.launch({headless:true});
 for(const vp of [{name:'phone',width:390,height:844},{name:'desktop',width:1180,height:900}]){
  const context=await browser.newContext({viewport:{width:vp.width,height:vp.height},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],bad=[];
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});page.on('pageerror',e=>errors.push('page: '+e.message));
  page.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url())});
  const response=await page.goto(BASE+'/games/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('#sportsRail .gcard').length===4&&document.querySelectorAll('#allGrid .gcard').length===34,{timeout:10000});
  await page.waitForFunction(()=>{const imgs=[...document.querySelectorAll('#sportsRail img')];return imgs.length===4&&imgs.every(x=>x.complete&&x.naturalWidth>0)},{timeout:10000});
  const s=await page.evaluate(()=>{const title=e=>(e.querySelector('h3')||e.querySelector('h4 span'))?.textContent.trim()||'';const cards=q=>[...document.querySelectorAll(q)].map(e=>({title:title(e),href:new URL(e.getAttribute('href'),location.href).pathname}));return{sports:cards('#sportsRail .gcard'),top:cards('#topRail .pick'),shelf:cards('#allGrid .gcard'),all:cards('.pick,.gcard'),chips:[...document.querySelectorAll('#chips .chip')].map(x=>x.textContent.trim()),count:document.getElementById('countline').textContent.trim(),copy:document.querySelector('#sports .sub').textContent.trim(),hidden:document.getElementById('sports').hidden,scrollW:document.documentElement.scrollWidth,innerW:innerWidth,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,art:[...document.querySelectorAll('#sportsRail img')].map(x=>({src:new URL(x.src).pathname,complete:x.complete,w:x.naturalWidth}))};});
  const n=(name)=>s.all.filter(x=>x.title===name).length;
  const top=['Apex Kick','Voxel Frontier','Off-Brand','Glitch Clash','Hold the Mark','Orbital','Slipstream - GP','Grid Chase'];
  const sports=['Apex Kick','Apex Pool','Apex Golf','Apex Tennis'];
  ok(vp.name+'-page-200',response&&response.status()===200,response?String(response.status()):'none');
  ok(vp.name+'-sports-four-adjacent',!s.hidden&&same(s.sports.map(x=>x.title),sports),JSON.stringify(s.sports));
  ok(vp.name+'-sports-links',same(s.sports.map(x=>x.href),['/apexkick/','/apexpool/','/apexgolf/','/apextennis/']));
  ok(vp.name+'-top-exact',same(s.top.map(x=>x.title),top),s.top.map(x=>x.title).join(' | '));
  ok(vp.name+'-whole-shelf-complete',s.shelf.length===34&&sports.every(t=>s.shelf.filter(x=>x.title===t).length===1),String(s.shelf.length));
  ok(vp.name+'-surface-counts',n('Apex Kick')===3&&n('Apex Pool')===2&&n('Apex Golf')===2&&n('Apex Tennis')===2,`${n('Apex Kick')}/${n('Apex Pool')}/${n('Apex Golf')}/${n('Apex Tennis')}`);
  ok(vp.name+'-tennis-art-loaded',s.art.some(x=>x.src==='/assets/cards/apex-tennis.svg'&&x.complete&&x.w>0),JSON.stringify(s.art));
  ok(vp.name+'-copy-and-count',s.copy.includes('Four Apex games')&&s.copy.includes('Apex Tennis')&&/13 curated favourites of 34 games/.test(s.count),s.copy+' | '+s.count);
  ok(vp.name+'-tag-vocabulary',!s.chips.includes('SPORT')&&s.chips.includes('PHYSICS'),s.chips.join(' | '));
  ok(vp.name+'-reduced-no-overflow',s.reduced&&s.scrollW===s.innerW,`${s.scrollW}/${s.innerW}`);
  ok(vp.name+'-zero-errors',errors.length===0&&bad.length===0,[...errors,...bad].join(' | ')||'none');
  await context.close();
 }
 }catch(e){fail++;console.error(e.stack||e)}finally{if(browser)await browser.close()}
 console.log('='.repeat(68));console.log(fail?pass+' passed, '+fail+' FAILED':'ALL '+pass+' APEX TENNIS SPORTS BROWSER CHECKS PASSED');process.exit(fail?1:0);
})();
