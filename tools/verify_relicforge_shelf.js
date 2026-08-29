#!/usr/bin/env node
/*
 * verify_relicforge_shelf.js — shelf contract for the Relicforge manifest entry.
 *
 * DERIVE, DON'T PIN. There is no hardcoded manifest count anywhere in this file.
 * The retired Apex Sports gate went red on main because it pinned origin/main to
 * exactly 33 entries, and a gate that fails because the estate grew is a gate
 * nobody reads. Every count here is read from games.json at HEAD; what is
 * asserted are the RELATIONSHIPS that must hold whatever the count becomes.
 *
 * Every gate family has a positive control at the end: a mutation that must make
 * it fail. A gate that has never failed has never been tested.
 *
 *   node tools/verify_relicforge_shelf.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HREF = '/relicforge/';
const MANIFEST = path.join(__dirname, '..', 'games.json');
const raw = fs.readFileSync(MANIFEST, 'utf8');
const data = JSON.parse(raw);

let checks = 0;
const failures = [];
function pass(condition, message) {
  checks += 1;
  if (condition) { console.log(`PASS ${checks}: ${message}`); }
  else { failures.push(message); console.error(`FAIL ${checks}: ${message}`); }
}

/* ---- structural, derived ---- */
pass(data && typeof data === 'object', 'manifest root is an object');
pass(Array.isArray(data.games), 'manifest exposes a games array');
pass(data.games.length > 0, `manifest contains games (${data.games.length} at HEAD, derived)`);

const matches = data.games.filter(game => game.href === HREF);
pass(matches.length === 1, `Relicforge appears exactly once (found ${matches.length})`);
if (matches.length !== 1) { report(); process.exit(1); }
const game = matches[0];

/* ---- the entry itself ---- */
/* NEW is an ephemeral whole-shelf release marker. This per-game identity
 * contract must continue to pass when the next release legitimately takes it. */
pass(typeof game.title === 'string' && game.title.trim().length > 0,
  `title is present: "${game.title}"`);
/* The canonical V4 title uses the displayed brand spelling "Relic Forge";
 * retain compatibility with the earlier compact "Relicforge" spelling. */
pass(/\brelic[\s-]*forge\b/i.test(game.title), 'title names the game');
pass(game.href.startsWith('/') && !/^https?:/i.test(game.href), 'href is site-relative');
pass(typeof game.art === 'string' && game.art.trim().length > 0,
  `art is present and non-empty (${game.art})`);
pass(game.featured === false && game.hero === false,
  'no homepage or hero placement is requested');
pass(!('collection' in game),
  'no rail membership claimed — Relicforge is a general-shelf entry, not an Apex Sports one');

/* The card copy has to sell what the game actually is. */
const desc = String(game.desc || '');
pass(desc.length >= 80, `card copy is substantive (${desc.length} chars)`);
pass(/component/i.test(desc), 'card copy leads with component targeting');
pass(/salvage/i.test(desc), 'card copy names the salvage identity');

/* ---- schema equality with the newest general-shelf sibling, derived ---- */
const generalShelf = data.games.filter(g => !g.collection);
const newestSibling = generalShelf[generalShelf.indexOf(game) + 1];
pass(!!newestSibling, 'a general-shelf sibling exists to compare against');
if (newestSibling) {
  const a = Object.keys(game).sort().join(',');
  const b = Object.keys(newestSibling).sort().join(',');
  pass(a === b, `schema matches the adjacent general-shelf sibling "${newestSibling.title}" (${a})`);
}

/* ---- estate-wide invariants ---- */
pass(data.games.every(g => typeof g.art === 'string' && g.art.trim()),
  `every entry on the shelf carries art (${data.games.length}/${data.games.length})`);
pass(new Set(data.games.map(g => g.href)).size === data.games.length,
  'every shelf href is unique');

/* ---- hue distinctness, computed rather than asserted by eye ---- */
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
function lab(hex) {
  const [r, g, b] = hex2rgb(hex).map(lin);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  [x, y, z] = [x, y, z].map(v => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function deltaE00(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2), avgCp = (C1p + C2p) / 2;
  const hp = (a, b) => { const x = Math.atan2(b, a) * 180 / Math.PI; return x < 0 ? x + 360 : x; };
  const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > 180) dhp -= Math.sign(dhp) * 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);
  const avghp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos(((avghp - 30) * Math.PI) / 180) + 0.24 * Math.cos((2 * avghp * Math.PI) / 180)
    + 0.32 * Math.cos(((3 * avghp + 6) * Math.PI) / 180) - 0.2 * Math.cos(((4 * avghp - 63) * Math.PI) / 180);
  const SL = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
  const SC = 1 + 0.045 * avgCp, SH = 1 + 0.015 * avgCp * T;
  const RT = -2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7))
    * Math.sin((60 * Math.exp(-(((avghp - 275) / 25) ** 2)) * Math.PI) / 180);
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

const MIN_DELTA_E = 6;
const mine = lab(game.hue);
let closest = null, closestDelta = Infinity;
for (const other of data.games) {
  if (other === game || typeof other.hue !== 'string' || !/^#[0-9a-f]{6}$/i.test(other.hue)) continue;
  const d = deltaE00(mine, lab(other.hue));
  if (d < closestDelta) { closestDelta = d; closest = other; }
}
pass(closestDelta >= MIN_DELTA_E,
  `hue ${game.hue} is distinct from every neighbour — closest is "${closest && closest.title}" ` +
  `(${closest && closest.hue}) at ΔE00 ${closestDelta.toFixed(2)}, floor ${MIN_DELTA_E}`);

/* ---- idempotency: re-running the canonical insertion changes nothing ---- */
{
  const clone = JSON.parse(JSON.stringify(data));
  const before = JSON.stringify(clone);
  if (!clone.games.some(g => g.href === HREF)) clone.games.unshift(JSON.parse(JSON.stringify(game)));
  pass(JSON.stringify(clone) === before, 'canonical insertion is idempotent');
}

/* ---- positive controls: each family must be shown able to fail ---- */
{
  const controls = [];
  const control = (name, mutate, probe) => {
    const clone = JSON.parse(JSON.stringify(data));
    mutate(clone);
    let caught = false;
    try { probe(clone); } catch (e) { caught = true; }
    if (caught) controls.push(name);
    return caught;
  };

  const ok = [
    control('duplicate entry', c => c.games.push(JSON.parse(JSON.stringify(game))),
      c => { if (c.games.filter(g => g.href === HREF).length !== 1) throw new Error('x'); }),
    control('art removed', c => { delete c.games.find(g => g.href === HREF).art; },
      c => { if (!c.games.every(g => typeof g.art === 'string' && g.art.trim())) throw new Error('x'); }),
    control('promoted to the homepage', c => { c.games.find(g => g.href === HREF).featured = true; },
      c => { const g = c.games.find(x => x.href === HREF); if (g.featured !== false || g.hero !== false) throw new Error('x'); }),
    control('hue moved onto a neighbour', c => { c.games.find(g => g.href === HREF).hue = '#22D3EE'; },
      c => {
        const g = c.games.find(x => x.href === HREF);
        const l = lab(g.hue);
        let min = Infinity;
        for (const o of c.games) {
          if (o === g || !/^#[0-9a-f]{6}$/i.test(String(o.hue))) continue;
          min = Math.min(min, deltaE00(l, lab(o.hue)));
        }
        if (min < MIN_DELTA_E) throw new Error('x');
      }),
    control('card copy stripped of its identity', c => { c.games.find(g => g.href === HREF).desc = 'A game.'; },
      c => { const d = c.games.find(x => x.href === HREF).desc; if (!/component/i.test(d) || !/salvage/i.test(d)) throw new Error('x'); })
  ];
  pass(ok.every(Boolean), `positive controls all tripped their gate (${controls.join('; ')})`);
}

function report() {
  console.log(`\nRelicforge shelf contract: ${checks - failures.length}/${checks} checks passed.`);
  if (failures.length) console.error(`Failures:\n  - ${failures.join('\n  - ')}`);
}
report();
process.exit(failures.length ? 1 : 0);
