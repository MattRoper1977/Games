#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const args=process.argv.slice(2),selfTest=args.includes('--self-test');
const FILE=args.find(x=>x!=='--self-test')||process.env.AT_MANIFEST||path.join(ROOT,'games.json');
const BASELINE=process.env.APEXPOOL_GAMES_BASELINE||process.env.APEXTENNIS_GAMES_BASELINE||'';
const ART=process.env.APEXTENNIS_ART_FILE||'';
const REQUIRE_ART=Boolean(ART);
const EXPECT={icon:'🎾',title:'Apex Tennis',desc:'Call the point before the serve, then build it on court. A complete offline tennis game with real rules, three rival styles and an honest Plan Rating.',href:'/apextennis/',tag:'Physics',hue:'#3B6FD4',featured:false,hero:false,art:'/assets/cards/apex-tennis.svg',collection:'Sports'};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function rgb(h){return[h.slice(1,3),h.slice(3,5),h.slice(5,7)].map(x=>parseInt(x,16))}
function dist(a,b){a=rgb(a);b=rgb(b);return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function census(games){const out={};for(const g of games)out[g.tag]=(out[g.tag]||0)+1;return out}
function validate(doc,artText,baseline){
 const errors=[],games=doc.games||[],before=baseline?.games||null;
 const hits=games.filter(g=>g.title===EXPECT.title||g.href===EXPECT.href),tennis=hits[0]||{};
 if(games.length!==(before?before.length+1:34))errors.push('candidate-entry-count-derived');
 if(hits.length!==1)errors.push('tennis-title-and-href-unique');
 if(!same(tennis,EXPECT))errors.push('tennis-schema-and-copy-exact');
 if(!games.every(g=>typeof g.art==='string'&&g.art))errors.push('all-entries-carry-art');
 if(new Set(games.map(g=>g.title)).size!==games.length||new Set(games.map(g=>g.href)).size!==games.length)errors.push('all-titles-and-hrefs-unique');
 if(!same(games.filter(g=>g.collection==='Sports').map(g=>g.title),['Apex Kick','Apex Pool','Apex Golf','Apex Tennis']))errors.push('sports-membership-exact');
 const siblingHues=['#2F8F6B','#F2A24A','#7C5CFC'];
 if(!siblingHues.every(h=>dist(EXPECT.hue,h)>70)||(before&&before.some(g=>String(g.hue).toUpperCase()===EXPECT.hue)))errors.push('tennis-hue-distinct-and-new');
 if(REQUIRE_ART&&(!artText||!/viewBox="0 0 120 96"/.test(artText)||!/#3B6FD4/.test(artText)||/<script|(?:xlink:)?href="https?:/i.test(artText)))errors.push('art-contract');
 if(before){
  if(!same(before,games.filter(g=>g.title!==EXPECT.title)))errors.push('all-existing-entries-byte-equivalent');
  if(games.at(-2)?.title!=='Apex Golf'||games.at(-1)?.title!=='Apex Tennis')errors.push('tennis-appended-after-golf');
  const cb=census(before),ca=census(games);
  if(!same(Object.keys(cb).sort(),Object.keys(ca).sort()))errors.push('tag-vocabulary-unchanged');
  if((ca.Physics||0)!==(cb.Physics||0)+1)errors.push('physics-count-increases-by-one');
 }
 const raw=JSON.stringify(doc);
 if(raw.includes('Apex_Tennis')||raw.includes('/Lessons/Apex_Tennis/'))errors.push('no-lessons-contamination');
 return [...new Set(errors)];
}
const doc=JSON.parse(fs.readFileSync(FILE,'utf8'));
const art=REQUIRE_ART&&fs.existsSync(ART)?fs.readFileSync(ART,'utf8'):'';
const baseline=BASELINE&&fs.existsSync(BASELINE)?JSON.parse(fs.readFileSync(BASELINE,'utf8')):null;
if(selfTest){
 const families=[
  ['membership','sports-membership-exact',d=>d.games.find(g=>g.title===EXPECT.title).collection='Other'],
  ['description','tennis-schema-and-copy-exact',d=>d.games.find(g=>g.title===EXPECT.title).desc='rewritten'],
  ['href','tennis-schema-and-copy-exact',d=>d.games.find(g=>g.title===EXPECT.title).href='/Lessons/Apex_Tennis/'],
  ['art','all-entries-carry-art',d=>d.games.find(g=>g.title===EXPECT.title).art=''],
  ['hue','tennis-hue-distinct-and-new',d=>d.games.find(g=>g.title===EXPECT.title).hue='#2F8F6B'],
  ['duplicate','tennis-title-and-href-unique',d=>d.games.push({...EXPECT})]
 ];
 let caught=0;console.log('== Apex Tennis manifest non-vacuity ==');
 for(const [family,expected,mutate] of families){const copy=JSON.parse(JSON.stringify(doc));mutate(copy);const errors=validate(copy,art,baseline);if(errors.includes(expected)){caught++;console.log('  PASS  '+family+': rejected by '+expected)}else console.log('  FAIL  '+family+': '+errors.join(','))}
 if(caught===families.length)console.log('ALL '+caught+' MANIFEST MUTATION FAMILIES REJECTED');
 else console.log(caught+' detected, '+(families.length-caught)+' missed');
 process.exit(caught===families.length?0:1);
}
const errors=validate(doc,art,baseline);let pass=0,fail=0;
function ok(name,condition,detail=''){console.log((condition?'  PASS  ':'  FAIL  ')+name+(detail?'   '+detail:''));condition?pass++:fail++}
console.log('== Apex Tennis Sports manifest contract ==');
ok('baseline-entry-count-measured',!baseline||baseline.games.length===33,baseline?String(baseline.games.length):'not supplied');
ok('candidate-entry-count-derived',!errors.includes('candidate-entry-count-derived'),baseline?baseline.games.length+' -> '+doc.games.length:String(doc.games.length));
ok('sports-membership-exact',!errors.includes('sports-membership-exact'),doc.games.filter(g=>g.collection==='Sports').map(g=>g.title).join(' | '));
ok('tennis-title-and-href-unique',!errors.includes('tennis-title-and-href-unique'));
ok('tennis-schema-and-copy-exact',!errors.includes('tennis-schema-and-copy-exact'));
ok('all-existing-entries-byte-equivalent',!errors.includes('all-existing-entries-byte-equivalent'));
ok('tennis-appended-after-golf',!errors.includes('tennis-appended-after-golf'));
ok('all-entries-carry-art',!errors.includes('all-entries-carry-art'));
ok('all-titles-and-hrefs-unique',!errors.includes('all-titles-and-hrefs-unique'));
ok('tag-vocabulary-unchanged',!errors.includes('tag-vocabulary-unchanged'));
ok('physics-count-increases-by-one',!errors.includes('physics-count-increases-by-one'));
ok('tennis-hue-distinct-and-new',!errors.includes('tennis-hue-distinct-and-new'),'distances '+['#2F8F6B','#F2A24A','#7C5CFC'].map(h=>dist(EXPECT.hue,h).toFixed(1)).join('/'));
ok('art-contract',!errors.includes('art-contract'),REQUIRE_ART?ART:'checked in rendered gate');
ok('site-relative-house-link',doc.games.find(g=>g.title===EXPECT.title)?.href==='/apextennis/');
ok('description-is-shipped-meta-copy',doc.games.find(g=>g.title===EXPECT.title)?.desc===EXPECT.desc);
ok('no-lessons-contamination',!errors.includes('no-lessons-contamination'));
console.log('='.repeat(68));
console.log(fail?pass+' passed, '+fail+' FAILED':'ALL '+pass+' APEX TENNIS MANIFEST CHECKS PASSED');
process.exit(fail?1:0);
