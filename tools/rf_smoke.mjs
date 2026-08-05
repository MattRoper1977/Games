// Fast playability smoke: boots, starts, clears a chamber, reaches the forge draft.
// Run after every phase — §0.5.
import { launch, boot, startRun, VIEWPORTS } from './rf_harness.mjs';
const FILE = process.argv[2] || 'work/relicforge_v1.1.html';
const browser = await launch();
const page = await boot(browser, FILE, VIEWPORTS.desktop);
const out = { booted: true };
await startRun(page);
out.afterStart = await page.evaluate(() => window.__relicforge.snapshot().mode);
await page.evaluate(() => window.__relicforge.clearChamber());
await page.waitForTimeout(2000);
out.afterClear = await page.evaluate(() => window.__relicforge.snapshot().mode);
out.forgeChoices = await page.evaluate(() => document.querySelectorAll('#forge-choices .forge-card, #forge-choices > *').length);
await page.evaluate(() => window.__relicforge.install(0));
await page.waitForTimeout(600);
const s = await page.evaluate(() => window.__relicforge.snapshot());
out.chamberAfterInstall = s.chamber;
out.mode = s.mode;
out.errors = page._rfErrors;
await browser.close();
console.log(JSON.stringify(out, null, 2));
process.exit(out.errors.length === 0 && out.chamberAfterInstall === 2 ? 0 : 1);
