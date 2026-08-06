/* verify_2c_shelf.js — the Stage 2C shelf contract.
 *
 * Everything is DERIVED FROM HEAD. No count, no hue distance and no neighbour
 * list is typed into this file: it reads games.json as it stands, reads the two
 * game files as they stand, and computes. A pinned number is a number that goes
 * stale silently, and a gate that has gone stale is worse than no gate.
 *
 * The last block TAMPERS with a copy of the manifest and asserts each gate goes
 * red. A gate that has never failed proves nothing.
 *
 *   node tools/verify_2c_shelf.js
 *   SITE_DIR=/path/to/site node tools/verify_2c_shelf.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const GAMES = process.env.GAMES_DIR || path.join(__dirname, '..');
const SITE = process.env.SITE_DIR || '/workspace/site';
const NEW_PREFIX = 'NEW · ';

const results = [];
const gate = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  return !!ok;
};

/* ---------------------------------------------------------------- colour --
   CIEDE2000. The estate's hue floors are stated in ΔE00 and this is the only
   place that computes it, so a floor cannot be met by one formula in one tool
   and missed by another somewhere else. */
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToLab(rgb) {
  let [r, g, b] = rgb.map(v => {
    v /= 255;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function ciede2000(hex1, hex2) {
  const [L1, a1, b1] = rgbToLab(hexToRgb(hex1));
  const [L2, a2, b2] = rgbToLab(hexToRgb(hex2));
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, ap) => { if (b === 0 && ap === 0) return 0; const h = Math.atan2(b, ap) * deg; return h >= 0 ? h : h + 360; };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dLp = L2 - L1, dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * rad) / 2);
  const Lbp = (L1 + L2) / 2, Cbp = (Cp1 + Cp2) / 2;
  let hbp = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hbp = hp1 + hp2 < 360 ? hbp + 360 : hbp - 360;
    hbp /= 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
    + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2)
    + Rt * (dCp / Sc) * (dHp / Sh)
  );
}

/* ------------------------------------------------------------------ run -- */
function run(manifestRaw, tamperLabel) {
  const data = JSON.parse(manifestRaw);
  const games = data.games;
  const TARGETS = ['/luminahaven/', '/auroralinks/'];
  const entries = TARGETS.map(h => games.find(g => g.href === h));
  const [lumina, aurora] = entries;

  if (!gate(`${tamperLabel}both Stage 2C entries are on the shelf`,
    entries.every(Boolean),
    `${entries.filter(Boolean).length}/2 present · shelf carries ${games.length} entries (derived at HEAD)`)) return;

  /* Required fields, same set the repo's own validator uses. */
  const REQUIRED = ['icon', 'title', 'desc', 'href', 'tag', 'hue', 'featured', 'hero', 'art'];
  for (const e of entries) {
    const missing = REQUIRED.filter(k => e[k] === undefined || e[k] === '' || e[k] === null);
    gate(`${tamperLabel}${e.title}: every required field present`, missing.length === 0,
      missing.length ? `missing ${missing.join(', ')}` : REQUIRED.join(', '));
  }

  /* Uniqueness across the WHOLE shelf, not just between the two new ones. */
  const hrefs = games.map(g => g.href), titles = games.map(g => g.title);
  gate(`${tamperLabel}no duplicate href or title anywhere on the shelf`,
    new Set(hrefs).size === hrefs.length && new Set(titles).size === titles.length,
    `${new Set(hrefs).size}/${hrefs.length} unique hrefs · ${new Set(titles).size}/${titles.length} unique titles`);

  /* The marker is single-holder canon, and three live gates already assert the
     holder is Fracture Engine. Stage 2C must not create a second one. */
  const holders = games.filter(g => String(g.title).startsWith(NEW_PREFIX)).map(g => g.title);
  gate(`${tamperLabel}the NEW marker still has exactly one holder, and it is not a 2C game`,
    holders.length === 1 && !TARGETS.includes(games.find(g => g.title === holders[0]).href),
    `holder(s): ${holders.join(' | ') || 'none'}`);

  /* Aurora Links 3D is a golf game and is deliberately NOT on the Sports rail,
     because that rail is the Apex Sports series and not a genre. */
  const sports = games.filter(g => g.collection === 'Sports').map(g => g.title);
  gate(`${tamperLabel}Aurora Links 3D is off the Sports rail (that rail is the Apex series)`,
    aurora.collection === undefined && sports.every(t => /^Apex /.test(t)),
    `Sports members: ${sports.join(', ')} · Aurora collection=${JSON.stringify(aurora.collection)}`);

  /* Hue separation, every distance derived. Floors: >=12 against a franchise
     sibling sharing a name stem, >=10 against every other shelf neighbour. */
  for (const e of entries) {
    const others = games.filter(g => g.href !== e.href && typeof g.hue === 'string');
    const scored = others
      .map(g => ({ title: g.title, hue: g.hue, d: ciede2000(e.hue, g.hue) }))
      .sort((a, b) => a.d - b.d);
    const nearest = scored[0], second = scored[1];
    gate(`${tamperLabel}${e.title} (${e.hue}): >=10 from every shelf neighbour`,
      nearest.d >= 10,
      `nearest ${nearest.d.toFixed(2)} ${nearest.title} ${nearest.hue} · 2nd ${second.d.toFixed(2)} ${second.title} ${second.hue}`);
  }
  const between = ciede2000(lumina.hue, aurora.hue);
  gate(`${tamperLabel}the two 2C hues are separated from each other`,
    between >= 10, `${lumina.hue} vs ${aurora.hue} = ${between.toFixed(2)}`);

  /* R4: the shelf copy must come from the game, not from a writer. Each blurb
     opens with a sentence the game itself carries; that sentence is looked up
     verbatim in the shipped file. */
  const SOURCES = {
    '/luminahaven/': path.join(SITE, 'luminahaven', 'index.html'),
    '/auroralinks/': path.join(SITE, 'auroralinks', 'index.html')
  };
  for (const e of entries) {
    const f = SOURCES[e.href];
    if (!fs.existsSync(f)) { gate(`${tamperLabel}${e.title}: shipped file present`, false, `${f} not found`); continue; }
    const src = fs.readFileSync(f, 'utf8');
    /* The opening sentence, taken as far as the first full stop. */
    const opener = e.desc.split(/\.\s/)[0].trim();
    gate(`${tamperLabel}${e.title}: shelf copy opens with a sentence the game itself carries`,
      src.includes(opener),
      `"${opener.slice(0, 72)}…" found verbatim in ${path.basename(path.dirname(f))}/index.html: ${src.includes(opener)}`);
  }

  /* The things the card points at have to exist. */
  for (const e of entries) {
    /* A missing `art` is a manifest fault the field gate above already caught;
       it must not become a crash here, or one tamper takes the whole run down
       and the tampers after it never execute. */
    const art = e.art ? path.join(SITE, String(e.art).replace(/^\//, '')) : null;
    const page = path.join(SITE, e.href.replace(/^\//, ''), 'index.html');
    const banner = path.join(SITE, e.href.replace(/^\//, ''), 'banner.png');
    const artOk = Boolean(art) && fs.existsSync(art);
    gate(`${tamperLabel}${e.title}: art, page and banner all exist on disk`,
      artOk && fs.existsSync(page) && fs.existsSync(banner),
      `art=${art ? fs.existsSync(art) : 'field absent'} page=${fs.existsSync(page)} banner=${fs.existsSync(banner)}`);
  }
}

const manifestRaw = fs.readFileSync(path.join(GAMES, 'games.json'), 'utf8');
run(manifestRaw, '');

/* ------------------------------------------------------------- tampers -- */
console.log('\n--- tampers: each must drive a gate red ---');
const TAMPERS = [
  ['drop Lumina Haven from the shelf', d => { d.games = d.games.filter(g => g.href !== '/luminahaven/'); }],
  ['drop Aurora Links 3D from the shelf', d => { d.games = d.games.filter(g => g.href !== '/auroralinks/'); }],
  ['give Aurora the NEW marker too', d => { const g = d.games.find(x => x.href === '/auroralinks/'); g.title = NEW_PREFIX + g.title; }],
  ['put Aurora on the Sports rail', d => { d.games.find(x => x.href === '/auroralinks/').collection = 'Sports'; }],
  ['move Lumina onto Relicforge\'s hue', d => { d.games.find(x => x.href === '/luminahaven/').hue = '#d05cff'; }],
  ['make the two 2C hues the same', d => { d.games.find(x => x.href === '/auroralinks/').hue = d.games.find(x => x.href === '/luminahaven/').hue; }],
  ['strip a required field', d => { delete d.games.find(x => x.href === '/luminahaven/').art; }],
  ['duplicate an href', d => { d.games.push({ ...d.games.find(x => x.href === '/luminahaven/') }); }],
  ['rewrite the blurb in words the game never uses', d => { d.games.find(x => x.href === '/auroralinks/').desc = 'The most relaxing golf experience ever created, with stunning graphics.'; }]
];

let caught = 0;
for (const [label, mutate] of TAMPERS) {
  const copy = JSON.parse(manifestRaw);
  mutate(copy);
  const before = results.length;
  run(JSON.stringify(copy), `[tamper: ${label}] `);
  const went = results.slice(before).filter(r => !r.ok).length;
  if (went > 0) caught++;
  console.log(`   -> ${went} gate(s) went red`);
  /* The tamper block's own reds are expected; drop them from the tally. */
  results.length = before;
}
gate(`every tamper was caught`, caught === TAMPERS.length, `${caught}/${TAMPERS.length}`);

const red = results.filter(r => !r.ok).length;
console.log(`\n${results.length - red}/${results.length} shelf gates green, ${red} red`);
process.exit(red === 0 ? 0 : 1);
