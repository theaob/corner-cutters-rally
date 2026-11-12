import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
const [,, rally, tag, gameSecs = '30', pick = 'START SS1'] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { if (!localStorage.getItem('ccr:save')) localStorage.setItem('ccr:save', JSON.stringify({ version: 2, data: { settings: {}, choices: {}, progress: { onboarded: true } } })); });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:5173/?debug');
await p.getByText('TAP TO START').waitFor({ timeout: 120000 });
await p.waitForTimeout(1500);
await p.mouse.click(180, 400);
await p.getByText(rally).first().click({ timeout: 120000 });
await p.waitForTimeout(2000);
await p.getByText(new RegExp(pick)).first().click({ timeout: 120000 });
while (!(await p.evaluate(() => !!window.__cc))) await p.waitForTimeout(200);
await p.addStyleTag({ content: '.tuning, [class*=tun] { display:none !important }' });
await p.evaluate(() => { for (const el of document.querySelectorAll('button, div')) if (el.textContent === 'TUNE') el.style.display = 'none'; });
await p.evaluate(() => window.__cc.autopilot(0.97));
const cdp = await ctx.newCDPSession(p);
const C = { x: 180, y: 520 }, R = 62;
let down = false, i = 0, lastShot = -99;
while (true) {
  const s = await p.evaluate(() => ({ ph: window.__cc.phase(), clk: window.__cc.clock(), card: window.__cc.stage()?.card, me: window.__cc.me(), ah: window.__cc.ahead(260) }));
  if (s.clk > +gameSecs || s.ph === 'done') break;
  if (s.clk > 0.5) {
    let dx = s.ah.x - s.me.x, dy = s.ah.y - s.me.y; const n = Math.hypot(dx, dy) || 1;
    const pt = { x: C.x + dx / n * R, y: C.y + dy / n * R };
    if (!down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [C] }); down = true; }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] });
    if (s.clk - lastShot > 2.5) {
      lastShot = s.clk;
      await p.screenshot({ path: `shots/${tag}-${String(i).padStart(2, '0')}.png` });
      console.log(i++, s.clk.toFixed(1), s.card);
    }
  }
  await p.waitForTimeout(150);
}
await b.close();
