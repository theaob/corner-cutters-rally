// The touch controls and the views, tried on Android: the app (a debug build, its WebView open to DevTools) on an
// emulator or a phone over adb, driven down the shakedown with the phone's own touch input (src/engine/drive/touch.ts:
// the steering buttons and the pedals, with GAS on MANUAL and AUTO, and steering on either side)
// (`input motionevent`: a real finger down, moved, lifted), and the car's speed and heading read back from the game's
// debug hook. Run by .github/workflows/android-e2e.yml; locally, with a device on adb and the app installed:
//   npm install --no-save playwright-core && node tools/android-e2e.mjs out-dir
// Screenshots (the phone's screen) and results.json go to out-dir. Exits 1 if a check fails.
// Without a phone, E2E_BROWSER=<the dev server's address> runs the same checks in Chromium at a phone's size (touches
// through DevTools), to try the script itself out.

import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { _android as android, chromium } from 'playwright-core';

const PKG = 'io.github.theaob.cornercuttersrally';
const OUT = process.argv[2] ?? 'e2e-android';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const turnOf = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const results = [];
/** A check: `soft` ones only warn (what an emulator can't do, e.g. tilt through its sensors). */
const check = (name, ok, detail, soft = false) => {
  results.push({ name, ok, detail, soft });
  console.log(`${ok ? 'PASS' : soft ? 'WARN' : 'FAIL'}  ${name}  ·  ${detail}`);
};

const BROWSER = process.env.E2E_BROWSER;
let device;
let page;
let sh = async () => '';
let screenW = 0;
let screenH = 0;
let androidVersion = 'none (browser)';
let webviewVersion = 'none';
if (BROWSER) {
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, hasTouch: true, isMobile: true });
  page = await ctx.newPage();
  await page.goto(BROWSER);
  device = { model: () => 'Chromium (phone size)', serial: () => '-', screenshot: (o) => page.screenshot(o), close: () => browser.close() };
} else {
  [device] = await android.devices();
  if (!device) throw new Error('no Android device on adb');
  sh = async (cmd) => (await device.shell(cmd)).toString();
  androidVersion = (await sh('getprop ro.build.version.release')).trim();
  webviewVersion = (await sh(`dumpsys package com.google.android.webview | grep -m1 versionName`)).trim();
  // (no "isn't responding" dialogs over the game: the emulator's software GPU is slow enough to raise them)
  await sh('settings put global hide_error_dialogs 1');
  // (nor Android's one-time "viewing full screen" banner: it sits over the top of the screen, the camera button under it,
  // and takes the presses there until it's dismissed; a player taps its GOT IT once)
  await sh('settings put secure immersive_mode_confirmations confirmed');
  [screenW, screenH] = (await sh('wm size')).trim().split('\n').pop().split(':').pop().trim().split('x').map(Number);
}
console.log(`device: ${device.model()} (${device.serial()}) · Android ${androidVersion} · WebView ${webviewVersion}`);

/** What Android said about the app going down (a crash, the WebView's renderer, low memory), the last of it. */
async function crashLog() {
  if (BROWSER) return;
  const log = await sh('logcat -d -t 2000');
  const lines = log.split('\n').filter((l) => /FATAL|AndroidRuntime|crash|died|lowmemorykiller|renderer|cr_.*(error|fail)|WebViewFactory|ANR /i.test(l));
  console.log(`--- logcat (${lines.length} lines of note) ---\n${lines.slice(-30).join('\n')}\n---`);
}

/** The app started afresh (on Android: stopped and opened again, each part of the run on its own), its WebView's page. */
async function launch() {
  if (BROWSER) return;
  await sh(`am force-stop ${PKG}`);
  await sh('logcat -c');
  await sh(`am start -n ${PKG}/.MainActivity`);
  const webview = await device.webView({ pkg: PKG }, { timeout: 90000 });
  page = await webview.page();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
  page.on('close', () => console.log('PAGE CLOSED'));
  await page.waitForLoadState();
}
await launch();
if (BROWSER) {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
}
console.log(`app at ${page.url()}`);
console.log('the page sees:', JSON.stringify(await page.evaluate(() => ({
  anyCoarse: matchMedia('(any-pointer: coarse)').matches,
  pointer: ['coarse', 'fine', 'none'].find((p) => matchMedia(`(pointer: ${p})`).matches),
  maxTouchPoints: navigator.maxTouchPoints,
  screen: [innerWidth, innerHeight, devicePixelRatio],
  webgl2: !!document.createElement('canvas').getContext('webgl2'),
}))));

// ---------------------------------------------------------------- the phone's touches
/** CSS px in the WebView to the screen's px: the WebView's offset on the screen and its pixel ratio (calibrate). */
let map = { dpr: 1, x: 0, y: 0 };
const toScreen = ([x, y]) => [Math.round((x + map.x) * map.dpr), Math.round((y + map.y) * map.dpr)];
let cdp;
/** (in the browser: one finger through DevTools) */
const touch = async (type, p) => {
  cdp ??= await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p[0], y: p[1], id: 0 }] });
};
const down = (p) => (BROWSER ? touch('touchStart', p) : sh(`input motionevent DOWN ${toScreen(p).join(' ')}`));
const move = (p) => (BROWSER ? touch('touchMove', p) : sh(`input motionevent MOVE ${toScreen(p).join(' ')}`));
const up = (p) => (BROWSER ? touch('touchEnd', p) : sh(`input motionevent UP ${toScreen(p).join(' ')}`));
const tap = async (p) => {
  if (BROWSER) {
    await touch('touchStart', p);
    return touch('touchEnd', p);
  }
  await down(p);
  await sleep(120);
  await up(p);
};
/** Where the page's last pointerdown landed, and on what (to see a press that missed its target). */
const watchPresses = () =>
  page.evaluate(() => {
    window.__downs = [];
    addEventListener('pointerdown', (e) => window.__downs.push(`${Math.round(e.clientX)},${Math.round(e.clientY)} on ${e.target.getAttribute?.('class') || e.target.tagName}`), true);
  });
const presses = () => page.evaluate(() => window.__downs.splice(0));
/** The window that has the screen's input now (on Android): the game's, or something over it. */
const focus = async () => (BROWSER ? 'the page' : (await sh('dumpsys window | grep -E "mCurrentFocus|mFocusedApp"')).trim().replace(/\s+/g, ' '));

/** Where a real tap in the middle of the screen lands in the page (swallowed before the game sees it). */
async function calibrate() {
  if (BROWSER) return;
  await page.evaluate(() => {
    window.__cal = null;
    const f = (e) => {
      window.__cal = [e.clientX, e.clientY];
      e.stopImmediatePropagation();
      e.preventDefault();
      window.removeEventListener('pointerdown', f, true);
    };
    window.addEventListener('pointerdown', f, true);
  });
  const sx = Math.round(screenW / 2);
  const sy = Math.round(screenH / 2);
  await sh(`input tap ${sx} ${sy}`);
  const cal = await (await page.waitForFunction(() => window.__cal, null, { timeout: 10000 })).jsonValue();
  const dpr = await page.evaluate(() => devicePixelRatio);
  map = { dpr, x: sx / dpr - cal[0], y: sy / dpr - cal[1] };
  console.log(`screen ${screenW}x${screenH} · page px ×${dpr} · WebView at (${map.x.toFixed(1)}, ${map.y.toFixed(1)}) css px`);
}

/** Two fingers at once (TAP's both halves), held while `during` runs: `input` has one finger, so these go in through
 * the WebView's DevTools. */
async function twoFingers(a, b, during) {
  cdp ??= await page.context().newCDPSession(page);
  const pts = [a, b].map(([x, y], id) => ({ x, y, id }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
  await during();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// ---------------------------------------------------------------- the game
const me = () => page.evaluate(() => ({ ...window.__cc.me(), clock: window.__cc.clock() }));
const centre = (sel) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (!r || !r.width) throw new Error(`${sel} is not on the screen`);
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, sel);
const viewport = () => page.evaluate(() => [innerWidth, innerHeight]);
const shot = (name) => device.screenshot({ path: `${OUT}/${name}.png` });

/** The save's settings (merged), past the controls lap, then the page at `path`. */
async function open(path, settings) {
  await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 60000 });
  await page.evaluate((settings) => {
    const raw = localStorage.getItem('ccr:save');
    const d = raw ? JSON.parse(raw) : { version: 2, data: {} };
    d.data.settings = { ...(d.data.settings ?? {}), ...settings };
    d.data.progress = { ...(d.data.progress ?? {}), onboarded: true };
    localStorage.setItem('ccr:save', JSON.stringify(d));
  }, settings);
  await page.goto(new URL(path, page.url()).href);
}

/** The shakedown under the chase camera with the driving settings `drive` (the save's keys), once the car can go. */
async function stage(drive = {}) {
  await launch();
  await open('/?debug&circuit=ss-shakedown&mode=tutorial', { view: 'chase', driveGas: 'manual', driveSide: 'left', driveAssist: 'off', driveSteering: 'normal', ...drive });
  await page.waitForFunction(() => window.__cc?.phase?.() === 'racing', null, { timeout: 180000 });
  await sleep(1500);
}

/** How fast the game runs here: game seconds per real second (an emulator's software GPU is slow). */
async function pace() {
  const a = await me();
  await sleep(2000);
  const b = await me();
  return (b.clock - a.clock) / 2;
}

const fmt = (n) => n.toFixed(2);
/** Until `sec` s of game time have passed (an emulator's software GPU can run the game well below real time), or `capMs`. */
async function game(sec, capMs = 90000) {
  const t0 = (await me()).clock;
  const end = Date.now() + capMs;
  while ((await me()).clock - t0 < sec && Date.now() < end) await sleep(100);
}
/** Your car on the opening straight, along the road at `speed` px/s: each manoeuvre starts there, clear of the trees. */
const placeCar = (speed) => page.evaluate((speed) => window.__cc.place(250, speed), speed);
/** A finger held at `at` (moved on to `to`, if given) for `sec` s of game time, from your car placed at `speed`: how it went. */
async function hold(at, sec, speed, to) {
  await placeCar(speed);
  const a = await me();
  await down(at);
  if (to) await move(to);
  await game(sec);
  const b = await me();
  await up(to ?? at);
  return { from: a, to: b, turn: turnOf(a.heading, b.heading) };
}
const turned = (r) => `turned ${fmt(r.turn)} rad`;
const slowed = (r) => `speed ${fmt(r.from.speed)} → ${fmt(r.to.speed)}`;

const pressed = (sel) => page.evaluate((sel) => document.querySelector(sel).classList.contains('pressed'), sel);

/** Each part of the run: the driving settings it's driven with, and what it tries. */
const schemes = {
  manual: {
    drive: { driveGas: 'manual', driveSide: 'left' },
    async run() {
      const deck = await page.evaluate(() => ({ cls: document.getElementById('deck').className, ...document.querySelector('.drive').dataset }));
      check('MANUAL: the driving layer is up, steering left, pedals right', deck.cls.includes('driving') && deck.side === 'left' && deck.gas === 'manual', JSON.stringify(deck));
      const gas = await centre('.drive-pedal.gas');
      const brake = await centre('.drive-pedal.brake');
      const drift = await centre('.drive-pedal.drift');
      const [w] = await viewport();
      const left = await centre('.drive-arrow.left');
      const right = await centre('.drive-arrow.right');
      check('MANUAL: GAS on the right, ◀ ▶ on the left', gas[0] > w / 2 && right[0] < w / 2 && left[0] < right[0], `GAS at ${gas.map(Math.round)} · ◀ ${left.map(Math.round)} · ▶ ${right.map(Math.round)}`);
      const go = await hold(gas, 2, 0);
      check('MANUAL: holding GAS goes', go.to.speed > 15, slowed(go));
      const r = await hold(right, 0.6, 150);
      check('MANUAL: holding ▶ turns right', r.turn > 0.03, turned(r));
      const l = await hold(left, 0.6, 150);
      check('MANUAL: holding ◀ turns left', l.turn < -0.03, turned(l));
      // a thumb rolled from ◀ onto ▶ without lifting: ▶ takes over from ◀, and once the wheel's back past the middle
      // the car turns right (measured after the roll, briefly, so the left turn first stays on the road)
      await placeCar(200);
      await down(left);
      await game(0.2);
      await move(right);
      const swapped = (await pressed('.drive-arrow.right')) && !(await pressed('.drive-arrow.left'));
      await game(0.15);
      const mid = await me();
      await game(0.4);
      const end = await me();
      await up(right);
      check('MANUAL: rolling from ◀ onto ▶ steers back right', swapped && turnOf(mid.heading, end.heading) > 0.02, `▶ took over: ${swapped} · turned ${fmt(turnOf(mid.heading, end.heading))} rad after the roll`);
      const stop = await hold(brake, 0.3, 200);
      check('MANUAL: BRAKE slows', stop.to.speed < stop.from.speed * 0.8, slowed(stop));
      // a thumb rolled from GAS onto BRAKE without lifting
      const roll = await hold(gas, 0.3, 200, brake);
      check('MANUAL: rolling from GAS onto BRAKE brakes', roll.to.speed < roll.from.speed * 0.8, slowed(roll));
      await placeCar(150);
      await down(drift);
      await game(0.2);
      const on = await pressed('.drive-pedal.drift');
      await shot('manual');
      await up(drift);
      check('MANUAL: DRIFT takes a press', on, `pressed: ${on}`);
    },
  },
  auto: {
    drive: { driveGas: 'auto', driveSide: 'left' },
    async run() {
      const gasShown = await page.evaluate(() => getComputedStyle(document.querySelector('.drive-pedal.gas')).display !== 'none');
      check('AUTO: no GAS pedal', !gasShown, `GAS shown: ${gasShown}`);
      await placeCar(0);
      await game(2);
      const a = await me();
      check('AUTO: goes by itself', a.speed > 15, `speed ${fmt(a.speed)}`);
      const l = await hold(await centre('.drive-arrow.left'), 0.6, 150);
      check('AUTO: holding ◀ turns left', l.turn < -0.03, turned(l));
      const stop = await hold(await centre('.drive-pedal.brake'), 0.3, 200);
      check('AUTO: BRAKE slows', stop.to.speed < stop.from.speed * 0.8, slowed(stop));
      await shot('auto');
    },
  },
  sides: {
    drive: { driveGas: 'manual', driveSide: 'right' },
    async run() {
      const [w] = await viewport();
      const left = await centre('.drive-arrow.left');
      const right = await centre('.drive-arrow.right');
      const gas = await centre('.drive-pedal.gas');
      check('STEER RIGHT: ◀ ▶ on the right, GAS on the left', left[0] > w / 2 && left[0] < right[0] && gas[0] < w / 2, `◀ ${left.map(Math.round)} · ▶ ${right.map(Math.round)} · GAS at ${gas.map(Math.round)}`);
      const go = await hold(gas, 2, 0);
      check('STEER RIGHT: holding GAS goes', go.to.speed > 15, slowed(go));
      const r = await hold(right, 0.6, 150);
      check('STEER RIGHT: holding ▶ turns right', r.turn > 0.03, turned(r));
      await shot('sides');
    },
  },
};

/** The app went down under the run (an emulator just booted can kill it while Play services settle): worth one more go. */
const wentDown = (err) => /closed|crashed|Target page/i.test(String(err));

let first = true;
for (const [name, { run }] of Object.entries(schemes)) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const mark = results.length;
    try {
      await stage(schemes[name].drive);
      if (first) {
        await calibrate();
        first = false;
      }
      const deck = await page.evaluate(() => document.getElementById('deck').className);
      console.log(`\n${name.toUpperCase()} · deck: ${deck} · game runs at ×${fmt(await pace())} real time`);
      await run();
      break;
    } catch (err) {
      await shot(`${name}-error`).catch(() => {});
      await crashLog().catch(() => {});
      if (attempt === 1 && wentDown(err)) {
        console.log(`RETRY  ${name.toUpperCase()}: the app went down (${String(err).split('\n')[0]}); once more`);
        results.length = mark;
        continue;
      }
      check(`${name.toUpperCase()}: ran`, false, String(err).split('\n')[0]);
    }
  }
}

// ---------------------------------------------------------------- the views
try {
  await stage({ driveGas: 'auto' });
  console.log(`\nVIEW · game runs at ×${fmt(await pace())} real time`);
  const button = await centre('[data-view]');
  await watchPresses();
  console.log(`camera button at ${button.map(Math.round).join(',')} css px → ${toScreen(button).join(',')} on the screen`);
  const views = [];
  for (let i = 0; i < 6; i++) {
    const a = await me();
    await tap(button);
    await sleep(1200);
    const v = await page.evaluate(() => JSON.parse(localStorage.getItem('ccr:save')).data.settings.view);
    const b = await me();
    views.push(v);
    const landed = (await presses()).join(' · ');
    console.log(`  press ${i + 1}: ${landed || `no pointerdown reached the page (input to: ${await focus()})`} → view ${v}`);
    await shot(`view-${i + 1}-${v}`);
    // (a press on it is the camera's alone: it mustn't steer)
    if (i === 0) check('VIEW: the camera button doesn\'t steer', Math.abs(turnOf(a.heading, b.heading)) < 0.15, `turned ${fmt(turnOf(a.heading, b.heading))} rad`);
  }
  check('VIEW: the camera button goes through every view', new Set(views).size === 6 && views[5] === 'chase', views.join(' → '));
} catch (err) {
  check('VIEW: ran', false, String(err).split('\n')[0]);
  await shot('view-error').catch(() => {});
  await crashLog().catch(() => {});
}

// ---------------------------------------------------------------- the settings
try {
  await launch();
  await open('/?debug', { view: 'chase' });
  console.log('\nSETTINGS');
  // (the title splash first: TAP TO START, on a touch screen)
  await page.waitForFunction(() => /TAP TO START|PRESS ANY KEY|SETTINGS/.test(document.body.innerText), null, { timeout: 120000 });
  const splash = await page.evaluate(() => document.body.innerText.match(/TAP TO START|PRESS ANY KEY/)?.[0]);
  if (splash) check('SETTINGS: the splash asks for a tap', splash === 'TAP TO START', `it says ${splash}`);
  if (splash) {
    const [w, h] = await viewport();
    await tap([w / 2, h / 2]);
  }
  const settings = await page.waitForFunction(() => {
    const label = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && e.textContent?.trim() === 'SETTINGS');
    const el = label?.closest('button') ?? label;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null;
  }, null, { timeout: 120000 });
  await tap(await settings.jsonValue());
  await sleep(2000);
  await shot('settings');
  const rows = await page.evaluate(() => document.body.innerText);
  const want = ['VIEW', 'GAS', 'STEERING', 'ASSIST', 'SIDES'];
  check('SETTINGS: the VIEW and driving rows', want.every((r) => rows.includes(r)), `missing: ${want.filter((r) => !rows.includes(r)).join(', ') || 'none'}`);
} catch (err) {
  check('SETTINGS: ran', false, String(err).split('\n')[0]);
  await shot('settings-error').catch(() => {});
  await crashLog().catch(() => {});
}

writeFileSync(`${OUT}/results.json`, JSON.stringify({ device: device.model(), android: androidVersion, webview: webviewVersion, results }, null, 2));
const failed = results.filter((r) => !r.ok && !r.soft);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` · FAILED: ${failed.map((r) => r.name).join('; ')}` : ''}`);
await device.close();
process.exit(failed.length ? 1 : 0);
