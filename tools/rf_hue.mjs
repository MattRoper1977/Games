// Part B hue selection: pick the Relicforge palette colour that sits furthest from
// every hue already on the shelf. CIEDE2000, derived from games.json — never pinned.
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync('games.json', 'utf8'));

const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const f = c => c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
function lab(hex) {
  const [r, g, b] = hex2rgb(hex).map(f);
  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  [x, y, z] = [x, y, z].map(v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function deltaE00(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2), avgCp = (C1p + C2p) / 2;
  const h = (a, b) => { let x = Math.atan2(b, a) * 180 / Math.PI; return x < 0 ? x + 360 : x; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  let dhp = h2p - h1p;
  if (Math.abs(dhp) > 180) dhp -= Math.sign(dhp) * 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
  let avghp = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + 360) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((avghp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * avghp * Math.PI / 180)
    + 0.32 * Math.cos((3 * avghp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * avghp - 63) * Math.PI / 180);
  const SL = 1 + 0.015 * (avgL - 50) ** 2 / Math.sqrt(20 + (avgL - 50) ** 2);
  const SC = 1 + 0.045 * avgCp, SH = 1 + 0.015 * avgCp * T;
  const RT = -2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7))
    * Math.sin(60 * Math.exp(-(((avghp - 275) / 25) ** 2)) * Math.PI / 180);
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

const existing = manifest.games.map(g => ({ title: g.title, hue: g.hue, lab: lab(g.hue) }));
const candidates = {
  '#51e7ff': 'cyan (identity)', '#ffb000': 'amber', '#56f7a8': 'green',
  '#ff496c': 'red', '#9b78ff': 'violet', '#d05cff': 'machine-god violet'
};
const scored = Object.entries(candidates).map(([hex, name]) => {
  const l = lab(hex);
  let closest = null, min = Infinity;
  for (const e of existing) {
    const d = deltaE00(l, e.lab);
    if (d < min) { min = d; closest = e; }
  }
  return { hex, name, minDeltaE: Number(min.toFixed(2)), closest: closest.title, closestHue: closest.hue };
}).sort((a, b) => b.minDeltaE - a.minDeltaE);

console.log(`Shelf entries compared against: ${existing.length} (derived from games.json)\n`);
for (const s of scored) {
  console.log(`${s.hex}  ${s.name.padEnd(20)} min ΔE00 ${String(s.minDeltaE).padStart(6)}  nearest: ${s.closest} (${s.closestHue})`);
}
console.log(`\nCHOSEN: ${scored[0].hex} — furthest from every neighbour (ΔE00 ${scored[0].minDeltaE} to ${scored[0].closest}).`);
