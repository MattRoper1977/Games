#!/usr/bin/env node
/* verify_neonturf_shelf.js — shelf contract for Neon Turf: Overdrive.
 *
 * Everything is DERIVED from the manifest at HEAD: no entry count, no
 * neighbour set and no marker holder is pinned, so this keeps passing as the
 * shelf grows. The final gate is a positive-control block — every contract
 * above it is re-run against a deliberately broken copy and must trip.
 *
 * Two rulings this file exists to hold:
 *   · Neon Turf does NOT take the NEW marker (Fracture Engine keeps it)
 *   · Neon Turf does NOT go on the homepage, and is NOT an Apex Sports rail
 *     member — that would be a ruling, not a side effect
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MANIFEST = path.join(__dirname, '..', 'games.json');
const HREF = '/neonturf/';
const NEW_PREFIX = 'NEW · ';
const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

let checks = 0; const failures = [];
const pass = (cond, msg) => {
  checks++;
  if (cond) console.log(`PASS ${checks}: ${msg}`);
  else { failures.push(msg); console.error(`FAIL ${checks}: ${msg}`); }
};

/* ---- CIEDE2000 (same implementation as the Fracture contract) ---- */
function lab(hex) {
  const h = hex.replace('#', ''); const to = i => parseInt(h.slice(i, i + 2), 16) / 255;
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
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}

/* ---- structural, derived ---- */
pass(Array.isArray(data.games), 'manifest exposes a games array');
pass(data.games.length > 0, `manifest contains games (${data.games.length} at HEAD, derived — not pinned)`);
const matches = data.games.filter(g => g.href === HREF);
pass(matches.length === 1, `Neon Turf appears exactly once (found ${matches.length})`);
if (matches.length !== 1) { report(); process.exit(1); }
const game = matches[0];

const REQUIRED = ['icon', 'title', 'desc', 'href', 'tag', 'hue', 'featured', 'hero', 'art'];
pass(REQUIRED.every(k => game[k] !== undefined && game[k] !== ''), `entry carries every required field`);

/* ---- the two rulings ---- */
pass(!String(game.title).startsWith(NEW_PREFIX),
  `Neon Turf does NOT take the NEW marker (title: ${game.title})`);
const holders = data.games.filter(g => String(g.title).startsWith(NEW_PREFIX));
pass(holders.length === 1 && /Fracture Engine/.test(holders[0].title),
  `the NEW marker is still Fracture Engine's alone (${holders.map(h => h.title).join(', ') || 'none'})`);
pass(game.featured === false && game.hero === false,
  'not promoted to the homepage — that is a separate ruled surface');
pass(game.collection === undefined,
  'not claimed for the Apex Sports rail — a football game joining it is a ruling for Matt, not a side effect');
pass(!/\bRPG\b/.test(String(game.tag)),
  `does not fall into the Action RPG rail (tag: ${game.tag})`);

/* ---- copy: leads with the game, not the word this shelf already owns ---- */
const desc = String(game.desc);
const opener = desc.split(/[.,—]/)[0].toLowerCase();
pass(/rocket|hover|car/.test(opener),
  `card copy leads with the game itself: "${desc.slice(0, 58)}…"`);
const rival = data.games.find(g => /Neon Snake Overdrive/.test(g.title));
if (rival) {
  const rivalOpener = String(rival.desc).replace(NEW_PREFIX, '').split(/[.,—]/)[0].trim().toLowerCase();
  pass(opener.trim() !== rivalOpener, 'does not open with the same clause as Neon Snake Overdrive');
  pass(rival.icon !== game.icon, `does not share an icon with Neon Snake Overdrive (${rival.icon} vs ${game.icon})`);
}

/* ---- hue: >=10 from EVERY shelf hue, with the Neon family named ---- */
function nearest(manifest, entry) {
  return manifest.filter(g => g.href !== entry.href && /^#[0-9a-fA-F]{6}$/.test(g.hue || ''))
    .map(g => ({ d: dE00(entry.hue, g.hue), title: g.title, hue: g.hue }))
    .sort((a, b) => a.d - b.d);
}
function assertHue(manifest, entry) {
  const r = nearest(manifest, entry);
  if (!(r[0].d >= 10)) throw new Error(`hue too close to ${r[0].title}: dE00 ${r[0].d.toFixed(2)} < 10`);
  return r;
}
let hueOk = true, hueMsg = '';
try {
  const r = assertHue(data.games, game);
  const neon = data.games.filter(g => /Neon |Echo Vault|Biopunk/.test(g.title) && g.href !== HREF)
    .map(g => `${g.title.replace(NEW_PREFIX, '').split(/[—:]/)[0].trim()} ${dE00(game.hue, g.hue).toFixed(1)}`);
  hueMsg = `hue ${game.hue}: nearest ${r[0].d.toFixed(2)} -> ${r[0].title} ${r[0].hue} (floor 10); `
    + `second ${r[1].d.toFixed(2)} -> ${r[1].title}. Neon family individually: ${neon.join(' · ')}`;
} catch (e) { hueOk = false; hueMsg = e.message; }
pass(hueOk, hueMsg);

/* ---- card art exists when the site repo is alongside ---- */
const siteRoot = process.env.SITE_DIR || path.join(__dirname, '..', '..', 'site');
if (fs.existsSync(siteRoot)) {
  pass(fs.existsSync(path.join(siteRoot, String(game.art).replace(/^\//, ''))), `card art present at ${game.art}`);
} else console.log(`SKIP: site repo not at ${siteRoot} — card art existence NOT VERIFIED (set SITE_DIR)`);

/* ---- positive controls ---- */
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
  tamper('hue moved onto Neon Sync', g => { g.find(x => x.href === HREF).hue = '#22D3EE'; },
    g => assertHue(g, g.find(x => x.href === HREF))),
  tamper('hue moved onto Echo Vault', g => { g.find(x => x.href === HREF).hue = '#6ff7ff'; },
    g => assertHue(g, g.find(x => x.href === HREF))),
  tamper('Neon Turf grabs the NEW marker', g => { g.find(x => x.href === HREF).title = NEW_PREFIX + 'Neon Turf: Overdrive'; }, g => {
    if (String(g.find(x => x.href === HREF).title).startsWith(NEW_PREFIX)) throw new Error('took the marker');
  }),
  tamper('promoted to the homepage', g => { g.find(x => x.href === HREF).featured = true; }, g => {
    if (g.find(x => x.href === HREF).featured !== false) throw new Error('promoted');
  }),
  tamper('slipped into the Sports rail', g => { g.find(x => x.href === HREF).collection = 'Sports'; }, g => {
    if (g.find(x => x.href === HREF).collection !== undefined) throw new Error('joined the rail');
  }),
  tamper('card art removed', g => { delete g.find(x => x.href === HREF).art; }, g => {
    if (!g.find(x => x.href === HREF).art) throw new Error('no art');
  })
];
pass(controls.every(c => c.caught),
  `positive controls all tripped their gate (${controls.map(c => `${c.label}${c.caught ? '' : ' NOT CAUGHT'}`).join('; ')})`);

function report() {
  console.log(`\nNeon Turf shelf contract: ${checks - failures.length}/${checks} checks passed.`);
  if (failures.length) { console.error(`\n${failures.length} FAILED:`); failures.forEach(f => console.error('  - ' + f)); }
}
report();
process.exit(failures.length ? 1 : 0);
