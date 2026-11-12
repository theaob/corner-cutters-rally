import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [,, rally, tag] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 512, height: 1000 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { if (!localStorage.getItem('ccr:save')) localStorage.setItem('ccr:save', JSON.stringify({ version: 2, data: { settings: {}, choices: {}, progress: { onboarded: true } } })); });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5173/?debug');
await p.waitForSelector('.splash-logo', { timeout: 120000 });
await p.waitForTimeout(5000);
await p.screenshot({ path: `shots/fg-title-${tag}.png` });
if (tag === 'logo') {
  await p.addStyleTag({ content: 'html,body,#screen,#app,.splash{background:transparent !important} canvas{display:none !important} .splash>*:not(.splash-logo){visibility:hidden}' });
  await p.waitForTimeout(500);
  const bb = await p.locator('.splash-logo').boundingBox(); await p.screenshot({ path: 'shots/logo.png', omitBackground: true, clip: { x: bb.x - 40, y: bb.y - 20, width: bb.width + 80, height: bb.height + 40 } });
  await b.close(); process.exit(0);
}
await p.mouse.click(256, 500);
await p.getByText(rally).first().click({ timeout: 120000 });
await p.getByText(/START SS1/).first().click({ timeout: 120000 });
while (!(await p.evaluate(() => !!window.__cc))) await p.waitForTimeout(200);
await p.evaluate(() => window.__cc.autopilot(0.97));
await p.addStyleTag({ content: 'body *:not(canvas):not(:has(canvas)){visibility:hidden !important}' });
let i = 0, last = -9;
while (true) {
  const c = await p.evaluate(() => window.__cc.clock());
  if (c > 32) break;
  if (c > 3 && c - last > 2.5) { last = c; await p.screenshot({ path: `shots/fg-${tag}-${String(i++).padStart(2, '0')}.png` }); }
  await p.waitForTimeout(200);
}
await b.close();
