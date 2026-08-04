#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = (process.env.ARCADE_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const games = (JSON.parse(fs.readFileSync(process.env.APEXPOOL_GAMES_FILE || 'games.json', 'utf8')).games || []);
const before = (JSON.parse(fs.readFileSync(process.env.APEXPOOL_GAMES_BASELINE, 'utf8')).games || []);
let pass = 0, fail = 0;
function ok(name, condition, detail = '') { if (condition) { pass++; console.log('  PASS  ' + name + (detail ? '   ' + detail : '')); } else { fail++; console.log('  FAIL  ' + name + (detail ? '   ' + detail : '')); } }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    const response = await page.goto(BASE + '/games/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#sportsRail .gcard').length === 3 && !/Loading|could not load/.test(document.getElementById('countline').textContent));
    const snapshot = await page.evaluate(() => {
      function title(element) { const node = element.querySelector('h3') || element.querySelector('h4 span'); return node ? node.textContent.trim() : ''; }
      function cards(selector) { return [...document.querySelectorAll(selector)].map((element) => ({ title: title(element), href: new URL(element.getAttribute('href'), location.href).pathname })); }
      return {
        sports: cards('#sportsRail .gcard'), top: cards('#topRail .pick'), themes: cards('#tgrids .gcard'), classroom: cards('#classRail .gcard'), shelf: cards('#allGrid .gcard'), all: cards('.pick,.gcard'),
        chips: [...document.querySelectorAll('#chips .chip')].map((button) => button.textContent.trim()), count: document.getElementById('countline').textContent.trim(),
        hidden: document.getElementById('sports').hidden, copy: document.querySelector('#sports .sub').textContent.trim(), overflow: document.documentElement.scrollWidth > innerWidth,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches
      };
    });
    const occurrence = (name) => snapshot.all.filter((card) => card.title === name).length;
    const top = ['Voxel Frontier', 'Off-Brand', 'Glitch Clash', 'Hold the Mark', 'Orbital', 'Slipstream - GP', 'Grid Chase'];
    const themes = ['Orbital', 'Marble', 'Trail Runner', 'Trekkers Trail Runner — Tees Coast', 'Grid Chase', 'Neon Garden', 'Neon Siege'];
    const classroom = before.filter((game) => game.tag === 'Class game').map((game) => game.title);
    const curated = ['Apex Kick', 'Voxel Frontier', 'Off-Brand', 'Glitch Clash', 'Hold the Mark', 'Orbital', 'Slipstream - GP', 'Grid Chase', 'Marble', 'Trail Runner', 'Trekkers Trail Runner — Tees Coast', 'Neon Garden', 'Neon Siege'];
    const shelf = games.filter((game) => game.collection !== 'Sports').slice().sort((a, b) => (curated.includes(a.title) ? 0 : 1) - (curated.includes(b.title) ? 0 : 1) || a.title.localeCompare(b.title)).map((game) => game.title);
    console.log('== Rendered Apex Golf Sports gates ==');
    ok('arcade-responds-200', response && response.status() === 200, response ? String(response.status()) : 'none');
    ok('sports-exactly-three-adjacent', !snapshot.hidden && same(snapshot.sports.map((card) => card.title), ['Apex Kick', 'Apex Pool', 'Apex Golf']), JSON.stringify(snapshot.sports));
    ok('apex-kick-once', occurrence('Apex Kick') === 1, String(occurrence('Apex Kick')));
    ok('apex-pool-once', occurrence('Apex Pool') === 1, String(occurrence('Apex Pool')));
    ok('apex-golf-once', occurrence('Apex Golf') === 1, String(occurrence('Apex Golf')));
    ok('top-survivors-exact', same(snapshot.top.map((card) => card.title), top));
    ok('themed-exact', same(snapshot.themes.map((card) => card.title), themes));
    ok('classroom-exact', same(snapshot.classroom.map((card) => card.title), classroom));
    ok('shelf-exact', same(snapshot.shelf.map((card) => card.title), shelf));
    ok('no-sport-chip', !snapshot.chips.includes('SPORT') && snapshot.chips.includes('PHYSICS'), snapshot.chips.join(' | '));
    ok('links-exact', same(snapshot.sports.map((card) => card.href), ['/apexkick/', '/apexpool/', '/apexgolf/']));
    ok('count-derived', snapshot.count.includes(String(games.length)) && snapshot.count.includes(String(games.length - 3)), snapshot.count);
    ok('sports-copy-names-golf', snapshot.copy.includes('Three Apex games') && snapshot.copy.includes('Apex Golf'), snapshot.copy);
    ok('reduced-motion-no-overflow', snapshot.reduced && !snapshot.overflow);
    ok('zero-console-errors', errors.length === 0, errors.join(' | ') || 'none');
    await context.close();
  } catch (error) { fail++; console.error(error.stack || error); }
  finally { if (browser) await browser.close(); }
  console.log('='.repeat(64));
  console.log(fail === 0 ? `ALL ${pass} SPORTS BROWSER CHECKS PASSED` : `${pass} passed, ${fail} FAILED`);
  console.log('='.repeat(64));
  process.exit(fail ? 1 : 0);
})();
