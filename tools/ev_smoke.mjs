import { launch, boot, startRun, VIEWPORTS } from './ev_harness.mjs';
const FILE = process.argv[2] || 'work/echovault_v1.1.html';
const b = await launch(); const p = await boot(b, FILE, VIEWPORTS.phone);
const out = { booted:true };
await startRun(p);
out.state = (await p.evaluate(()=>window.__echoVault.getState())).state;
// twist end-to-end through the real interaction path
out.read = await p.evaluate(async () => {
  window.__echoVault.ping();
  window.__echoVault.armRead();
  window.__echoVault.cycleBand();
  window.__echoVault.releaseRead();
  await new Promise(r=>setTimeout(r,200));
  return window.__echoVault.readState();
});
out.storage = await p.evaluate(()=>Object.keys(localStorage));
out.settings = await p.evaluate(()=>window.__echoVault.settings());
out.errors = p._evErrors;
await b.close();
console.log(JSON.stringify(out,null,2));
process.exit(out.errors.length===0 && out.read.last && Number.isInteger(out.read.last.score) ? 0 : 1);
