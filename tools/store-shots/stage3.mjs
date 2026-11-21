import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [,, rally, tag, gameSecs = '30'] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { if (!localStorage.getItem('ccr:save')) localStorage.setItem('ccr:save', JSON.stringify({ version: 2, data: { settings: {}, choices: {}, progress: { onboarded: true } } })); });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5173/?debug&seasonday=40');
await p.getByText('TAP TO START').waitFor({ timeout: 180000 });
await p.waitForTimeout(1500);
await p.mouse.click(320, 200);
await p.getByText(rally).first().click({ timeout: 180000 });
await p.getByText(/START SS1/).first().click({ timeout: 180000 });
while (!(await p.evaluate(() => !!window.__cc))) await p.waitForTimeout(200);
await p.evaluate(() => { for (const el of document.querySelectorAll('button, div')) if (el.textContent === 'TUNE') el.style.display = 'none'; });
await p.evaluate(() => window.__cc.autopilot(0.97));
let i = 0, last = -99;
while (true) {
  const s = await p.evaluate(() => ({ ph: window.__cc.phase(), clk: window.__cc.clock(), card: window.__cc.stage()?.card }));
  if (s.clk > +gameSecs || s.ph === 'done') break;
  if (s.clk > 1 && s.clk - last > 2.5) { last = s.clk; await p.screenshot({ path: `shots/L-${tag}-${String(i).padStart(2, '0')}.png` }); console.log(i++, s.clk.toFixed(1), s.card); }
  await p.waitForTimeout(150);
}
await b.close();
