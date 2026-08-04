#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'games.json');
const pool = {
  icon: '🎱',
  title: 'Apex Pool',
  desc: "NEW · Call the cue ball's leave, then prove you can read the table. Offline 8-ball with genuine spin, position play, AI, trick shots and an honest Leave Rating.",
  href: '/apexpool/',
  tag: 'Physics',
  hue: '#F2A24A',
  featured: false,
  hero: false,
  art: '/assets/cards/apex-pool.svg',
  collection: 'Sports'
};

function transform(source) {
  const doc = JSON.parse(source);
  const games = doc.games || [];
  const existingTitle = games.filter((game) => game.title === pool.title);
  const existingHref = games.filter((game) => game.href === pool.href);
  const kick = games.filter((game) => game.title === 'Apex Kick');
  if (kick.length !== 1) throw new Error(`Expected one Apex Kick, found ${kick.length}`);

  if (existingTitle.length || existingHref.length) {
    const exact = existingTitle.length === 1 && existingHref.length === 1 && existingTitle[0] === existingHref[0] &&
      Object.keys(pool).every((key) => existingTitle[0][key] === pool[key]) && kick[0].collection === 'Sports';
    if (exact) return source;
    throw new Error(`Apex Pool title or href already exists in a non-canonical form: titles=${existingTitle.length} hrefs=${existingHref.length}`);
  }
  if (games.length !== 31) throw new Error(`Expected the measured 31-entry baseline, found ${games.length}`);
  if (kick[0].tag !== 'Physics' || kick[0].hue !== '#2F8F6B' || !kick[0].art) throw new Error('Apex Kick baseline drift changes the Sports job');
  if (kick[0].collection !== undefined) throw new Error(`Apex Kick already carries collection=${kick[0].collection}`);

  const before = '      "art": "/assets/cards/apex-kick.webp"\n    }\n  ]\n}';
  const after = '      "art": "/assets/cards/apex-kick.webp",\n      "collection": "Sports"\n    },\n    {\n      "icon": "🎱",\n      "title": "Apex Pool",\n      "desc": "NEW · Call the cue ball\'s leave, then prove you can read the table. Offline 8-ball with genuine spin, position play, AI, trick shots and an honest Leave Rating.",\n      "href": "/apexpool/",\n      "tag": "Physics",\n      "hue": "#F2A24A",\n      "featured": false,\n      "hero": false,\n      "art": "/assets/cards/apex-pool.svg",\n      "collection": "Sports"\n    }\n  ]\n}';
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected one byte-preserving tail anchor, found ${count}`);
  return source.replace(before, after);
}

const before = fs.readFileSync(file, 'utf8');
const after = transform(before);
const second = transform(after);
if (second !== after) throw new Error('Idempotency failure: second manifest transform changed bytes');
if (after === before) throw new Error('The canonical Apex Pool entry is already present; no duplicate was written');
fs.writeFileSync(file, after);
console.log('Added Apex Pool and collection membership; second transform was byte-identical.');
