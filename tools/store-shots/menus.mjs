import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const fresh = { version: 2, data: { settings: {}, choices: {}, progress: { onboarded: true } } };
async function open(opts, seed) {
  const ctx = await b.newContext(opts);
  await ctx.addInitScript((s) => { if (!localStorage.getItem('ccr:save')) localStorage.setItem('ccr:save', JSON.stringify(s)); }, seed);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  return p;
}
const phone = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
// home with the four rallies
{
  const p = await open(phone, fresh);
  await p.goto('http://localhost:5173/');
  await p.getByText('TAP TO START').waitFor({ timeout: 120000 });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'shots/title.png' });
  await p.mouse.click(180, 400);
  await p.getByText('TARMAC RALLY').waitFor({ timeout: 120000 });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: 'shots/home.png' });
  // a rally after SS2: the standings
  await p.evaluate(async () => {
    const R = await import('/src/f1/rally.ts'); const D = await import('/src/f1/difficulty.ts'); const C = await import('/src/f1/crews.ts');
    const r = R.newRally({ event: R.RALLIES[0], seed: 4242, scheme: C.SCHEMES[0], difficulty: 'normal' });
    R.recordStage(r, 0, { time: 401.3, health: 0.92 }, R.aiStage(r, 0, 372, D.NORMAL));
    R.recordStage(r, 1, { time: 388.7, health: 0.81 }, R.aiStage(r, 1, 360, D.NORMAL));
    R.saveRally(r);
  });
  await p.reload();
  await p.getByText('TAP TO START').waitFor({ timeout: 120000 });
  await p.waitForTimeout(1500);
  await p.mouse.click(180, 400);
  await p.getByText(/START SS3/).waitFor({ timeout: 120000 });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: 'shots/standings.png' });
  console.log((await p.locator('body').innerText()).slice(0, 900));
  await p.getByText('SETTINGS').first().click();
  await p.waitForTimeout(4000);
  await p.screenshot({ path: 'shots/settings.png' });
}
// the feature graphic's base: the title over the backdrop, landscape
for (const [w, h] of [[1024, 500], [820, 400]]) {
  const p = await open({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }, fresh);
  await p.goto('http://localhost:5173/?desktop');
  await p.getByText('TAP TO START').waitFor({ timeout: 120000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `shots/wide-${w}.png` });
}
await b.close();
