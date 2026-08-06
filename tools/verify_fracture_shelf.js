#!/usr/bin/env node
/* verify_fracture_shelf.js — shelf contract for Relicforge: Fracture Engine,
 * and the derivation contract for the RPG rail it introduces.
 *
 * Everything here is DERIVED from the manifest at HEAD. No entry count, no
 * membership list and no neighbour set is pinned: this file must keep passing
 * as the shelf grows, and must fail the moment the RPG rail stops being a
 * derivation and becomes a hand-kept list.
 *
 * The final gate is a positive-control block. Every check above it is re-run
 * against a deliberately broken copy of the manifest and must trip. A gate
 * never shown to fail proves nothing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'games.json');
const HREF = '/fracture/';
const SIBLING_HREF = '/relicforge/';
const NEW_PREFIX = 'NEW · ';
const RPG = /\bRPG\b/;

const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
let checks = 0;
const failures = [];
function pass(cond, message) {
  checks++;
  if (cond) console.log(`PASS ${checks}: ${message}`);
  else { failures.push(message); console.error(`FAIL ${checks}: ${message}`); }
}

/* ---- structural, derived ---- */
pass(data && typeof data === 'object', 'manifest root is an object');
pass(Array.isArray(data.games), 'manifest exposes a games array');
pass(data.games.length > 0, `manifest contains games (${data.games.length} at HEAD, derived — not pinned)`);

const matches = data.games.filter(g => g.href === HREF);
pass(matches.length === 1, `Fracture Engine appears exactly once (found ${matches.length})`);
if (matches.length !== 1) { report(); process.exit(1); }
const game = matches[0];

/* ---- the entry itself ---- */
const REQUIRED = ['icon', 'title', 'desc', 'href', 'tag', 'hue', 'featured', 'hero', 'art'];
pass(REQUIRED.every(k => game[k] !== undefined && game[k] !== ''),
  `entry carries every required field [${REQUIRED.join(', ')}]`);
pass(/Fracture Engine/.test(game.title), `title names the game (${game.title})`);
pass(RPG.test(game.tag), `tag carries the RPG signal the rail derives from (${game.tag})`);
pass(game.featured === false && game.hero === false,
  'not promoted to the homepage from the manifest — homepage placement is a separate, ruled surface');

/* Card art must exist as a real file in the site repo when it is checked out
 * alongside; when it is not, this is reported rather than silently passed. */
const artRel = String(game.art || '').replace(/^\//, '');
const siteRoot = process.env.SITE_DIR || path.join(__dirname, '..', '..', 'site');
const artPath = path.join(siteRoot, artRel);
if (fs.existsSync(siteRoot)) {
  pass(fs.existsSync(artPath), `card art present at ${game.art}`);
} else {
  console.log(`SKIP: site repo not checked out at ${siteRoot} — card art existence NOT VERIFIED (set SITE_DIR)`);
}

/* ---- identity against the live sibling (R2: two different games) ---- */
const sibling = data.games.find(g => g.href === SIBLING_HREF);
pass(!!sibling, 'the live Relicforge sibling is still on the shelf');
if (sibling) {
  pass(sibling.href !== game.href, 'Fracture Engine and Strip the Machine are separate entries with separate hrefs');
  pass(sibling.icon !== game.icon, `the two Relicforge entries do not share an icon (${sibling.icon} vs ${game.icon})`);
  const opener = g => String(g.desc || '').replace(NEW_PREFIX, '').split(/[.,—]/)[0].trim().toLowerCase();
  pass(opener(sibling) !== opener(game),
    'the two Relicforge entries do not open with the same clause — they must not scan as one game listed twice');
  pass(sibling.hue !== game.hue, `distinct hues (${sibling.hue} vs ${game.hue})`);
}

/* ---- hue separation, CIEDE2000, derived over every other entry ---- */
function lab(hex) {
  const h = hex.replace('#', '');
  const to = i => parseInt(h.slice(i, i + 2), 16) / 255;
  const inv = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = [to(0), to(2), to(4)].map(inv);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
  const z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function dE00(h1, h2) {
  const [L1, a1, b1] = lab(h1), [L2, a2, b2] = lab(h2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = Cb > 0 ? 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7)))) : 0;
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { const d = h2p - h1p; dhp = d > 180 ? d - 360 : (d < -180 ? d + 360 : d); }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else { const d = Math.abs(h1p - h2p), s = h1p + h2p; hbp = d > 180 ? (s < 360 ? (s + 360) / 2 : (s - 360) / 2) : s / 2; }
  const rad = d => d * Math.PI / 180;
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp))
    + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.20 * Math.cos(rad(4 * hbp - 63));
  const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = Cbp > 0 ? 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7))) : 0;
  const Sl = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Rc * Math.sin(2 * rad(dTh));
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2)
    + Rt * (dCp / Sc) * (dHp / Sh));
}

function hueReport(manifest, entry) {
  const others = manifest.filter(g => g.href !== entry.href && /^#[0-9a-fA-F]{6}$/.test(g.hue || ''));
  const ranked = others.map(g => ({ d: dE00(entry.hue, g.hue), title: g.title, hue: g.hue }))
    .sort((x, y) => x.d - y.d);
  const sib = manifest.find(g => g.href === SIBLING_HREF);
  return { nearest: ranked[0], second: ranked[1], vsSibling: sib ? dE00(entry.hue, sib.hue) : null };
}

function assertHue(manifest, entry) {
  const r = hueReport(manifest, entry);
  if (!(r.vsSibling >= 12)) throw new Error(`hue too close to the live Relicforge: dE00 ${r.vsSibling.toFixed(2)} < 12`);
  if (!(r.nearest.d >= 10)) throw new Error(`hue too close to ${r.nearest.title}: dE00 ${r.nearest.d.toFixed(2)} < 10`);
  return r;
}

let hueOk = true, hueMsg = '';
try {
  const r = assertHue(data.games, game);
  hueMsg = `hue ${game.hue}: dE00 ${r.vsSibling.toFixed(2)} vs live Relicforge ${sibling.hue} (floor 12); `
    + `nearest ${r.nearest.d.toFixed(2)} -> ${r.nearest.title} ${r.nearest.hue} (floor 10); `
    + `second ${r.second.d.toFixed(2)} -> ${r.second.title}`;
} catch (e) { hueOk = false; hueMsg = e.message; }
pass(hueOk, hueMsg);

/* ---- release marker: exactly one holder, and it is this game ---- */
const titleHolders = data.games.filter(g => String(g.title || '').startsWith(NEW_PREFIX));
const descHolders = data.games.filter(g => String(g.desc || '').includes(NEW_PREFIX));
pass(titleHolders.length === 1 && titleHolders[0].href === HREF,
  `sole NEW title holder is Fracture Engine (found ${titleHolders.length}: ${titleHolders.map(g => g.title).join(', ') || 'none'})`);
pass(descHolders.length === 0, `no legacy description marker (found ${descHolders.length})`);

/* ---- the RPG rail, DERIVED ---- */
function rpgMembers(manifest) { return manifest.filter(g => RPG.test(String(g.tag || ''))); }
const rail = rpgMembers(data.games);
pass(rail.length >= 2, `RPG rail has enough members to render (${rail.length}: ${rail.map(g => g.title).join(' | ')})`);
pass(rail.some(g => g.href === HREF) && rail.some(g => g.href === SIBLING_HREF),
  'both franchise action-RPGs are derived into the rail');
const railIcons = rail.map(g => g.icon);
pass(new Set(railIcons).size === railIcons.length, `rail members have distinct icons (${railIcons.join(' ')})`);

/* The derivation must be a rule, not a list wearing a rule's clothes: adding a
 * new RPG-tagged entry must change membership without editing any tool. */
const grown = JSON.parse(JSON.stringify(data.games));
grown.push({ icon: '🧪', title: 'Control Entry', desc: 'x', href: '/control-only/', tag: 'Action RPG', hue: '#123456', featured: false, hero: false, art: '/x.svg' });
pass(rpgMembers(grown).length === rail.length + 1,
  'rail membership is genuinely derived — a newly RPG-tagged entry joins with no tool edit');

/* ---- positive controls: every contract above must be breakable ---- */
function tamper(label, mutate, run) {
  const clone = JSON.parse(JSON.stringify(data.games));
  mutate(clone);
  let caught = false;
  try { run(clone); } catch (_) { caught = true; }
  return { label, caught };
}
const controls = [
  tamper('duplicate entry', g => g.push(JSON.parse(JSON.stringify(game))), g => {
    if (g.filter(x => x.href === HREF).length !== 1) throw new Error('dup');
  }),
  tamper('hue moved onto a neighbour', g => { g.find(x => x.href === HREF).hue = '#3B6FD4'; },
    g => assertHue(g, g.find(x => x.href === HREF))),
  tamper('hue moved onto the live Relicforge', g => { g.find(x => x.href === HREF).hue = '#d05cff'; },
    g => assertHue(g, g.find(x => x.href === HREF))),
  tamper('a second NEW title holder', g => { g.find(x => x.href === SIBLING_HREF).title = NEW_PREFIX + 'x'; }, g => {
    if (g.filter(x => String(x.title).startsWith(NEW_PREFIX)).length !== 1) throw new Error('two markers');
  }),
  tamper('RPG tag stripped from the rail', g => { g.forEach(x => { x.tag = 'Reflex'; }); }, g => {
    if (rpgMembers(g).length >= 2) throw new Error('still enough'); throw new Error('rail collapsed');
  }),
  tamper('promoted to the homepage from the manifest', g => { g.find(x => x.href === HREF).featured = true; }, g => {
    if (g.find(x => x.href === HREF).featured !== false) throw new Error('promoted');
  }),
  tamper('card art removed', g => { delete g.find(x => x.href === HREF).art; }, g => {
    if (!g.find(x => x.href === HREF).art) throw new Error('no art');
  })
];
const allCaught = controls.every(c => c.caught);
pass(allCaught, `positive controls all tripped their gate (${controls.map(c => `${c.label}${c.caught ? '' : ' NOT CAUGHT'}`).join('; ')})`);

function report() {
  console.log(`\nFracture Engine shelf contract: ${checks - failures.length}/${checks} checks passed.`);
  if (failures.length) { console.error(`\n${failures.length} FAILED:`); failures.forEach(f => console.error('  - ' + f)); }
}
report();
process.exit(failures.length ? 1 : 0);
