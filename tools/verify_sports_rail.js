#!/usr/bin/env node
/*
 * verify_sports_rail.js — the Sports rail's house rules, enforced generally.
 *
 * Deliberately NOT another one-shot landing gate. The Apex Sports manifest gate
 * was retired on 5 August 2026 because it pinned a baseline of 33 entries and a
 * named hue list, so it went stale the moment the estate moved on (see
 * tools/RETIRED_apex_sports_manifest_gate.md). Everything here DERIVES from the
 * manifest at HEAD: the rail's membership, the hues it compares, and the
 * expected counts. Adding a sixth sports game should make this gate check more,
 * not go red.
 *
 * What it enforces:
 *   S1  one rail mechanism, not two — membership is the `collection` field
 *   S2  every rail member is also in the whole-shelf catalogue (Sports is additive)
 *   S3  rail hues are pairwise distinct by CIEDE2000, and distinct from each
 *       member's shelf neighbours
 *   S4  at most one `NEW · ` holder across the whole manifest
 *   S5  rail cards do not read as duplicates of one another
 *
 *   node tools/verify_sports_rail.js [path/to/games.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TARGET = process.argv[2] || path.join(__dirname, '..', 'games.json');
const doc = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
const games = doc.games;
const NEW_PREFIX = 'NEW · ';
/* Below this, two colours read as the same swatch on a card rail. */
const DE_FLOOR = 25;

const results = [];
function assert(x, m) { if (!x) throw new Error(m); }
function gate(id, name, fn) {
  try { const d = fn() || ''; results.push({ id, status: 'PASS' }); console.log(`PASS ${id} ${name}${d ? ' — ' + d : ''}`); }
  catch (e) { results.push({ id, status: 'FAIL' }); console.error(`FAIL ${id} ${name} — ${e.message}`); }
}

/* ---- CIEDE2000 ---------------------------------------------------------- */
function lab(hex) {
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.replace('#', '').substr(i, 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  let X = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  let Y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750);
  let Z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t + 16 / 116);
  X = f(X); Y = f(Y); Z = f(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function de2000(h1, h2) {
  const [L1, a1, b1] = lab(h1), [L2, a2, b2] = lab(h2);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  let hp1 = (b1 === 0 && ap1 === 0) ? 0 : Math.atan2(b1, ap1) * deg; if (hp1 < 0) hp1 += 360;
  let hp2 = (b2 === 0 && ap2 === 0) ? 0 : Math.atan2(b2, ap2) * deg; if (hp2 < 0) hp2 += 360;
  const dL = L2 - L1, dC = Cp2 - Cp1, Cprod = Cp1 * Cp2;
  let dhp = 0;
  if (Cprod !== 0) { dhp = hp2 - hp1; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dH = 2 * Math.sqrt(Cprod) * Math.sin(dhp / 2 * rad);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hpb;
  if (Cprod === 0) hpb = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpb = (hp1 + hp2) / 2;
  else hpb = (hp1 + hp2 < 360) ? (hp1 + hp2 + 360) / 2 : (hp1 + hp2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hpb - 30) * rad) + 0.24 * Math.cos(2 * hpb * rad)
            + 0.32 * Math.cos((3 * hpb + 6) * rad) - 0.20 * Math.cos((4 * hpb - 63) * rad);
  const Rc = 2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T;
  const Rt = -Math.sin(2 * (30 * Math.exp(-Math.pow((hpb - 275) / 25, 2))) * rad) * Rc;
  return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2)
                   + Rt * (dC / Sc) * (dH / Sh));
}

/* ---- derived facts ------------------------------------------------------ */
const rail = games.filter(g => g.collection === 'Sports');

gate('S1', 'one rail mechanism, derived from the manifest', () => {
  assert(rail.length >= 2, `the Sports rail has ${rail.length} member(s); nothing to enforce`);
  /* No second mechanism: no other field may encode rail membership. If someone
   * adds `section`/`rail`/`group`, this surfaces it rather than ignoring it. */
  const rival = new Set();
  games.forEach(g => Object.keys(g).forEach(k => {
    if (/^(section|rail|category|categories|group|collections)$/i.test(k)) rival.add(k);
  }));
  assert(rival.size === 0, 'a second rail mechanism appeared: ' + [...rival].join(', '));
  const values = new Set(games.map(g => g.collection).filter(Boolean));
  return `${rail.length} members via \`collection\`; collection vocabulary: ${[...values].join(', ')}`;
});

gate('S2', 'Sports is additive, not a move', () => {
  /* Every rail member must still be a plain shelf entry — same array, same
   * schema as its non-rail siblings. Exactly-once applies to homepage
   * surfaces, never to the browse-all catalogue. */
  const schema = Object.keys(games.find(g => !g.collection)).sort();
  rail.forEach(g => {
    const keys = Object.keys(g).filter(k => k !== 'collection').sort();
    assert(JSON.stringify(keys) === JSON.stringify(schema),
      `${g.title} schema differs from a plain shelf entry: ${keys.join(',')} vs ${schema.join(',')}`);
    assert(games.includes(g), `${g.title} is not in the whole-shelf catalogue`);
  });
  return `${rail.length} rail members, each a full catalogue entry (schema: ${schema.join(', ')} + collection)`;
});

/* The baseline is DERIVED from the branch point, never pinned. A collision that
 * already exists on main is estate drift: it is reported loudly every run, but
 * it does not fail the gate, because a gate that goes red for something the
 * current change did not cause is a gate nobody reads. A collision this change
 * introduces — a new pair, or either hue edited — fails. Same principle the
 * root-hosted href limb in validate_games_json.sh already uses. */
function baselineHues() {
  /* The base ref is derived, not pinned: a pull request supplies its own base
   * branch, so this keeps working if the default branch is ever renamed. */
  const ref = process.env.SPORTS_BASE_REF ||
              (process.env.GITHUB_BASE_REF ? 'origin/' + process.env.GITHUB_BASE_REF : 'origin/main');
  try {
    const { execSync } = require('child_process');
    const raw = execSync(`git show ${ref}:games.json`, {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    const map = new Map();
    JSON.parse(raw).games.forEach(g => map.set(g.title, g.hue));
    return map;
  } catch (_) { return null; }
}

gate('S3', 'rail hues are pairwise distinct, and distinct from shelf neighbours', () => {
  const base = baselineHues();
  const preexisting = (a, b) =>
    base && base.get(a.title) === a.hue && base.get(b.title) === b.hue;

  const lines = [], drift = [];
  const check = (a, b, kind) => {
    const d = de2000(a.hue, b.hue);
    if (d >= DE_FLOOR) return d;
    if (preexisting(a, b)) {
      drift.push(`${a.title} ${a.hue} / ${b.title} ${b.hue} — ΔE00 ${d.toFixed(2)} (${kind}, pre-existing on main)`);
      return d;
    }
    throw new Error(`${a.title} ${a.hue} and ${b.title} ${b.hue} are ΔE00 ${d.toFixed(2)}, below the ${DE_FLOOR} floor (${kind}, introduced by this change)`);
  };

  for (let i = 0; i < rail.length; i++) {
    for (let j = i + 1; j < rail.length; j++) {
      const d = check(rail[i], rail[j], 'rail pair');
      lines.push(`${rail[i].title.replace('Apex ', '')}/${rail[j].title.replace('Apex ', '')} ${d.toFixed(1)}`);
    }
  }
  /* and each rail member against whoever it actually sits next to on the shelf */
  rail.forEach(g => {
    const ix = games.indexOf(g);
    [ix - 1, ix + 1].forEach(n => {
      if (n < 0 || n >= games.length) return;
      check(g, games[n], 'shelf neighbour');
    });
  });

  if (!base) console.log('       (no origin/main baseline reachable — every collision would fail)');
  drift.forEach(d => console.log('       DRIFT, not caused by this change: ' + d));
  return `${lines.length} rail pairs, floor ΔE00 ${DE_FLOOR}: ${lines.join('; ')}` +
         (drift.length ? ` · ${drift.length} pre-existing collision(s) reported above` : '');
});

gate('S4', 'at most one NEW · holder', () => {
  const holders = games.filter(g => (g.desc || '').startsWith(NEW_PREFIX));
  assert(holders.length <= 1, `${holders.length} entries carry the prefix: ${holders.map(g => g.title).join(', ')}`);
  return holders.length ? `1 holder: ${holders[0].title}` : 'no current holder';
});

gate('S5', 'rail cards do not read as duplicates', () => {
  /* Two cards on the same rail must not open with the same words, and must not
   * share an icon — that is what makes a rail scan as one game listed twice. */
  const icons = rail.map(g => g.icon);
  const dupIcon = icons.filter((v, i) => icons.indexOf(v) !== i);
  assert(dupIcon.length === 0, 'rail members share an icon: ' + dupIcon.join(', '));
  const opener = g => (g.desc || '').replace(NEW_PREFIX, '').split(/[.,—]/)[0].trim().toLowerCase();
  const seen = new Map();
  rail.forEach(g => {
    const o = opener(g);
    assert(!seen.has(o), `${g.title} and ${seen.get(o)} open with the same clause: "${o}"`);
    seen.set(o, g.title);
  });
  return `${rail.length} distinct icons; ${rail.length} distinct opening clauses`;
});

const failed = results.filter(r => r.status === 'FAIL');
console.log(`\nSports rail: ${results.length - failed.length}/${results.length} gates passed (${rail.length} members derived from the manifest).`);
if (failed.length) { console.error('FAILED: ' + failed.map(f => f.id).join(', ')); process.exitCode = 1; }
else console.log(`ALL ${results.length} SPORTS RAIL GATES PASSED`);
