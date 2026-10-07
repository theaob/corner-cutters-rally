// The touch controls and the views, tried on Android: the app (a debug build, its WebView open to DevTools) on an
// emulator or a phone over adb, each TOUCH scheme driven down the shakedown with the phone's own touch input
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

/** The shakedown, driven `touch`, under the chase camera; once the car can go. */
async function stage(touch) {
  await launch();
  await open('/?debug&circuit=ss-shakedown&mode=tutorial', { touch, view: 'chase' });
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

const schemes = {
  async pedals() {
    const gas = await centre('.pedal.gas');
    const brake = await centre('.pedal.brake');
    const slider = await centre('[data-slider]');
    const drift = await page.evaluate(() => getComputedStyle(document.querySelector('.face .b')).visibility === 'visible');
    check('PEDALS: DRIFT button on the deck (gravel)', drift, `visible: ${drift}`);
    const go = await hold(gas, 2, 0);
    check('PEDALS: holding GAS goes', go.to.speed > 15, slowed(go));
    const steer = await hold(slider, 0.5, 150, [slider[0] + 70, slider[1]]);
    check('PEDALS: slider right turns right', steer.turn > 0.03, turned(steer));
    const stop = await hold(brake, 0.3, 200);
    check('PEDALS: BRAKE slows', stop.to.speed < stop.from.speed * 0.8, slowed(stop));
    await placeCar(0);
    await down(slider);
    await move([slider[0] + 70, slider[1]]);
    await game(0.2);
    await shot('pedals');
    await up([slider[0] + 70, slider[1]]);
  },
  async stick() {
    const [w, h] = await viewport();
    const at = [w * 0.75, h * 0.82];
    const go = await hold(at, 2, 0, [at[0], at[1] - 70]);
    check('STICK: pushed up goes', go.to.speed > 15, slowed(go));
    const steer = await hold(at, 0.5, 150, [at[0] + 55, at[1] - 55]);
    check('STICK: up and right turns right on the gas', steer.turn > 0.03 && steer.to.speed > 10, `${turned(steer)} at ${fmt(steer.to.speed)}`);
    const stop = await hold(at, 0.3, 200, [at[0], at[1] + 70]);
    check('STICK: pulled down brakes', stop.to.speed < stop.from.speed * 0.8, slowed(stop));
    await placeCar(0);
    await down(at);
    await move([at[0] + 40, at[1] - 60]);
    await game(0.2);
    await shot('stick');
    await up([at[0] + 40, at[1] - 60]);
  },
  async arcade() {
    await placeCar(0);
    await game(2);
    const a = await me();
    check('ARCADE: goes by itself', a.speed > 15, `speed ${fmt(a.speed)}`);
    const gasShown = await page.evaluate(() => getComputedStyle(document.querySelector('.pedal.gas')).display !== 'none');
    check('ARCADE: no GAS pedal', !gasShown, `GAS shown: ${gasShown}`);
    const slider = await centre('[data-slider]');
    const steer = await hold(slider, 0.5, 150, [slider[0] - 70, slider[1]]);
    check('ARCADE: slider left turns left', steer.turn < -0.03, turned(steer));
    const stop = await hold(await centre('.pedal.brake'), 0.3, 200);
    check('ARCADE: BRAKE slows', stop.to.speed < stop.from.speed * 0.8, slowed(stop));
    await shot('arcade');
  },
  async tap() {
    await placeCar(0);
    await game(2);
    const a = await me();
    check('TAP: goes by itself', a.speed > 15, `speed ${fmt(a.speed)}`);
    const [w, h] = await viewport();
    const right = [w * 0.8, h * 0.45];
    const left = [w * 0.2, h * 0.45];
    const r = await hold(right, 0.5, 150);
    check('TAP: holding the right half turns right', r.turn > 0.03, turned(r));
    const l = await hold(left, 0.5, 150);
    check('TAP: holding the left half turns left', l.turn < -0.03, turned(l));
    await placeCar(200);
    const b = await me();
    await twoFingers(left, right, () => game(0.3));
    const c = await me();
    check('TAP: both halves brake (two fingers, through DevTools)', c.speed < b.speed * 0.8, `speed ${fmt(b.speed)} → ${fmt(c.speed)}`);
    const drift = await page.evaluate(() => document.querySelector('[data-hud="label-b"]')?.textContent ?? '');
    check('TAP: no DRIFT on the deck', drift === '', `B says "${drift}"`);
    await placeCar(100);
    await down(right);
    await game(0.2);
    await shot('tap');
    await up(right);
  },
  async tilt() {
    await placeCar(0);
    await game(2);
    const a = await me();
    check('TILT: goes by itself', a.speed > 15, `speed ${fmt(a.speed)}`);
    await page.evaluate(() => {
      window.__gamma = undefined;
      addEventListener('deviceorientation', (e) => (window.__gamma = e.gamma));
    });
    // the emulator's own sensors: the phone held up at 40°, its right edge down 20° (gravity's reaction, m/s²)
    const g = 9.81;
    const beta = (40 * Math.PI) / 180;
    const gamma = (20 * Math.PI) / 180;
    const accel = [-g * Math.sin(gamma), g * Math.sin(beta) * Math.cos(gamma), g * Math.cos(beta) * Math.cos(gamma)];
    let sensor = 'not reachable';
    if (!BROWSER) {
      try {
        execFileSync('adb', ['-s', device.serial(), 'emu', 'sensor', 'set', 'acceleration', accel.map((v) => v.toFixed(3)).join(':')]);
        sensor = 'set';
      } catch (err) {
        sensor = `adb emu failed: ${String(err).slice(0, 80)}`;
      }
    }
    await placeCar(150);
    const b = await me();
    await game(0.5);
    const c = await me();
    const seen = await page.evaluate(() => window.__gamma);
    const bySensor = typeof seen === 'number' && seen > 5;
    check("TILT: the emulator's tilt reaches the game", bySensor, `sensor ${sensor} · gamma seen ${seen}`, true);
    if (bySensor) {
      check('TILT: tilted right turns right', turnOf(b.heading, c.heading) > 0.03, `turned ${fmt(turnOf(b.heading, c.heading))} rad`);
    } else {
      // (the WebView's own event, as the sensor would send it)
      await page.evaluate(() => dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 20 })));
      await placeCar(150);
      const d = await me();
      await game(0.5);
      const e = await me();
      check('TILT: tilted right turns right (orientation event in the WebView)', turnOf(d.heading, e.heading) > 0.03, `turned ${fmt(turnOf(d.heading, e.heading))} rad`);
    }
    const knob = await page.evaluate(() => document.querySelector('[data-slider] .knob').style.transform);
    check('TILT: the slider shows the tilt', /translateX\([1-9]/.test(knob), `knob ${knob}`);
    await shot('tilt');
  },
  async point() {
    const [w, h] = await viewport();
    const at = [w * 0.75, h * 0.82];
    const go = await hold(at, 2, 0, [at[0], at[1] - 70]);
    check('POINT: pushed up goes', go.to.speed > 15, slowed(go));
    const steer = await hold(at, 0.8, 150, [at[0] + 25, at[1] - 68]);
    check('POINT: a little right turns right', steer.turn > 0.02, turned(steer));
    await placeCar(0);
    await down(at);
    await move([at[0] + 25, at[1] - 68]);
    await game(0.2);
    await shot('point');
    await up([at[0] + 25, at[1] - 68]);
  },
};

/** The app went down under the run (an emulator just booted can kill it while Play services settle): worth one more go. */
const wentDown = (err) => /closed|crashed|Target page/i.test(String(err));

let first = true;
for (const [name, run] of Object.entries(schemes)) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const mark = results.length;
    try {
      await stage(name);
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
  await stage('tap');
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
    // (the button sits over TAP's right half: a press on it must not steer)
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
  await open('/?debug', { touch: 'pedals', view: 'chase' });
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
  check('SETTINGS: TOUCH and VIEW rows', /TOUCH/.test(rows) && /VIEW/.test(rows) && /PEDALS/.test(rows), 'rows present');
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
