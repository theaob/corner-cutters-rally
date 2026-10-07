# Corner Cutters Rally

An arcade rally in the HD-2D look, grown out of [Corner Cutters](https://github.com/theaob/corner-cutters). You drive long one-way special stages on gravel, snow, sand and tarmac, one car at a time against the clock, with a co-driver calling every bend and nine rival crews to beat over a whole rally. It's built mobile-first, in a portrait layout with a touch control deck.

## The game

**Home is the rally's screen** (`src/f1/screens/rally.ts`). Rally cars drive the Shakedown behind it. With no rally under way, it shows:

- **CAR**, your paint scheme. Swipe or tap to change it.
- The four rallies, each with your best finish there.
- **SETTINGS**.

With a rally under way, it shows the standings, the stage up next, your car's state, **START SS…** and **RETIRE FROM THE RALLY**. When the rally is over it shows the final standings, with a trophy and confetti if you won.

| Rally | Surface | Stages |
|---|---|---|
| RALLY OF THE FORESTS | gravel | Pine Ridge, Old Mill (damp), Fox Hollow, High Moor |
| WINTER RALLY | snow | Glacier Road, Frozen Pass, Ice Lake |
| DESERT RALLY | sand | Dune Run, Red Canyon, Salt Flats |
| TARMAC RALLY | tarmac | Mountain Col, Vineyards, Coast Road (damp), Castle Hill |

### The stages

A stage is a road, not a circuit: one long way from its start line to its flying finish, about 12–15 km at the game's 0.67 m to a pixel, never coming back round (`src/f1/stages.ts`). Each stage is grown from its own seed, one piece at a time. A piece is a straight, or a bend of one of the co-driver's grades (a fast 6 down to a slow 1, and the odd hairpin), left or right. A piece is kept only if the road stays on the map and well clear of every stretch of itself further back, so the road never crosses or runs alongside itself. When the road boxes itself in, the last pieces are taken back and tried again.

Each stage also gets:

- hills from its seed;
- a jump here and there in the middle of a long straight;
- an opening straight up to the start line;
- a run-out past the finish to the stop at the road's end.

The same seed always gives the same stage, grown the first time it's driven. The engine's tracks can be open roads for this: `open` in `buildTrack` and `smoothLoop` (`src/f1/racing.ts`), and `stage` in a layout (`src/f1/layouts.ts`).

**Surfaces** (`src/f1/circuitScene.ts`):

- **Gravel:** wet, dark earth with ruts, clods and puddles; berms for edges; in a forest, or out on the moor.
- **Snow:** packed snow and ice, snow banks and walls of snow, in the mountains among snow-laden spruces.
- **Sand:** a sandy road with drifted-sand berms, in the desert, with palms and camels.
- **Tarmac:** white edge lines and red-and-white kerbs, through the forest or up the mountains.

On gravel, snow and sand the car runs off-road tyres and slides; on tarmac it grips.

### Driving a stage

- **The start:** you stand on the line under the START gantry for a countdown (5, 4, 3, 2, 1), then GO. The start clock beside the line counts it down too, its five red lights going out one a second and the last turning green at GO. The clock runs from GO to the flying finish, and a panel at the top counts down the km to go. There is no map: you drive by the co-driver's calls. Going before GO is a jump start (+5 s); a quick reaction after it gets a GOOD or GREAT LAUNCH.
- **No track limits:** the road's edges are what stands beside it. Past a narrow verge kept clear, the treeline (in the desert, a line of rocks) comes in and out along the road: closer on the inside of tight bends, so they can't be cut far, and further out on their outsides, where cars run wide. Here and there a tree or rock stands alone in front of it, most often at a tight bend's apex. All of them are solid (`ROADSIDE` in `src/f1/circuit.ts`, drawn by `roadsideOf` in `src/f1/forest3d.ts`).
- **Splits:** at each third of the stage you get your time against the stage's quickest crew, and where that puts you (SPLIT 1 · 0:27.62 · −0.31 · P1).
- **The finish:** a yellow board with a chequered flag on it warns of the flying finish ahead, and red boards mark it. Past it, the car drives itself on to the STOP board at the stop control and halts there (`src/f1/stageDressing.ts`). A few seconds later the stage's times come up (every crew, the gap to the quickest, and what went wrong for any), then the rally's standings after it. NEXT goes home.
- **Damage carries over:** your car starts each stage as the last one left it, until the service park after the stage the rally names puts it right. Wreck it and you're out of the stage: you get the slowest time on it plus 60 s, and the crew patch the car up to half health so you can go on.
- **Kept on the device:** the rally under way, your best finish in each rally, and your best time on each stage (BEST in the readout; beat it and the banner says STAGE BEST). Leave mid-stage and that stage is run again; a stage once finished counts.

**The co-driver** (`src/f1/paceNotes.ts`, `src/f1/race/rallyView.ts`) reads the stage's pace notes off the road itself:

- every bend is graded by how tight it is, 6 (barely a lift) down to 1 (the slowest), with HAIRPIN for the tightest that turn right round;
- LONG, TIGHTENS and OPENS where they apply, OVER JUMP for a jump, and FLYING FINISH at the end;
- bends close together are linked (LEFT 4 › RIGHT 3), and a long run to the next note gets its distance called (· 300).

Each call comes far enough ahead to be ready for it (further ahead the faster you're going). It's shown on a card at the top of the screen (a big arrow and grade, the call in full under it) and read out where the device has a voice (the Web Speech API, at the sound's volume).

**The rivals** (`src/f1/crews.ts`, `src/f1/rally.ts`): nine crews from a field of twelve invented drivers, each with a paint scheme of their own, run every stage too. Their times come from a reference run (one car flat out on the racing line, alone, from the same standing start to the same finish), scaled by each crew's pace for the difficulty and spread a little either way. Now and then a crew goes OFF, SPINs or gets a PUNCTURE and loses a few seconds, or ROLLS and loses a lot. A rally's crews and every stage's times come from its seed.

**The car** (`src/engine/render/vehicles3d.ts`): a hatchback rally car in your paint scheme, with:

- the scheme's pattern over the bonnet and roof (no race numbers: the standings show each crew's paint);
- glass all round the cabin, flared arches, a roof scoop (yours gold) and a wing on the hatch;
- mud flaps, and a bank of spotlights on the front bumper;
- a tail light at each corner of the tailgate, the brake lights in them lit as the car slows.

A big crash tears off the bumper and its lamps, and a wreck loses a wheel or two.

**The controls lap:** a new player's first launch opens the Shakedown (a short gravel stage), with a prompt at a time for the controls on the device they're using: go, full speed, slowing for a bend, drifting, the co-driver's calls, and on to the finish. The co-driver calls the bends here too. A skips it; once it's done, MENU goes home.

### Controls

Each device drives the way it suits, and the game follows whichever you used last:

- **Touch:** **TOUCH** in the settings picks the deck (`src/f1/driveStyle.ts`). PEDALS is the default.
  - **PEDALS:** a steering slider under one thumb, and GAS and BRAKE under the other, with DRIFT above them.
  - **STICK:** one floating stick as a wheel. Across steers, up is the gas and down the brake. The round well reads as a square, so a push out on a diagonal is full lock and full gas together.
  - **ARCADE:** the gas is always on. The slider steers, BRAKE slows (held once stopped, it reverses), and DRIFT drifts.
  - **TAP:** the gas is always on. Hold the left or right half of the screen to steer that way, harder the longer you hold it. Hold both to brake. There is no drift.
  - **TILT:** the gas is always on. Tilt the phone like a wheel to steer, and the slider's knob shows the tilt. A thumb on the slider steers instead. BRAKE and DRIFT as in ARCADE. iOS asks first: picking TILT in the settings, or a touch on the deck, asks.
  - **POINT:** the stick points at the spot on the screen you want to drive to, and how far you push it is the throttle. The spot is found by looking from your car's place on the screen, the way you push, down through the camera onto the road.

  The stick, and the slider, float or sit on the side STICK in the settings says. DRIFT is on the deck on dirt. Where the gas is always on, it's on from before GO: an ordinary start, never a jump start or a launch.
- **Keyboard:** ↑ (or W) is the gas, ↓ (S) the brake (held once stopped, it reverses), ← → (A, D) steer, and X or Shift drifts. Z or Space is A, Enter is START, Backspace is SELECT, Esc or P pauses, and V switches between the handheld and wide layouts.
- **Gamepad:** the right trigger is the gas, the left the brake, the left stick steers, A drifts, Start pauses, Y restarts, and Back is SELECT.
- **DRIVING** in the settings, for the keys and a gamepad: STEER (as above) or POINT (the arrows or the left stick point where to go, as POINT on touch).

**SETTINGS** (from home, and from the pause screen; `src/f1/menu.ts`, `src/f1/settingsRows.ts`):

- DIFFICULTY (from home only): how much a crash costs and how quick the rival crews are;
- SCREEN, on a device with a mouse or trackpad;
- TEXT: NORMAL or LARGE;
- COLOURS: STANDARD or COLOUR-SAFE, for the splits;
- TOUCH: the touch deck, on a touch screen;
- STICK: the side of the thumbstick or the steering slider;
- DRIVING (keys and gamepads), VIBRATION, SCREEN SHAKE, SOUND and MUSIC;
- STATS, only when the build has a backend.

All are remembered.

**The pause screen** has RESUME, RESTART, SETTINGS, REPORT and EXIT. EXIT asks first (THE STAGE WON'T COUNT). Leaving the app or tab pauses too. In the Android app the phone's back button pauses a stage, resumes from the pause screen, and on home says PRESS BACK AGAIN TO EXIT.

**Spectators** (`src/f1/spectators.ts`): crowds stand on the open ground beside the road: at the start and the finish, round the jumps, on the outsides of the slowest bends, and here and there along the way. They face the road and cheer as a car comes by, jumping and waving. If one comes straight at them they run back out of its way, then wander back once it has gone. They are only for show: no car can hit them.

**Crashes** (`src/engine/driving.ts`): a car is a rigid body, with a mass and a turning inertia from its size. It bounces off a tree or rock in the direction it hit: a hit head-on takes the full force, and a glancing one scrapes along with friction. Damage depends on how hard the car hits straight into something, so a scrape costs speed but not health. A hit off the car's middle, from a tree or another car, spins it, and the tyres soon catch the spin. A hard side-on hit, or sliding sideways into soft ground fast enough to dig in, rolls the car over once or twice, and the roof takes a knock each time. A wreck coasts to a stop rather than halting dead. The numbers are in `IMPACT`.

**Feel:** the camera shakes on hits, landings and rough ground, and a big hit stops time for a moment. Sparks fly off hits, mud and dust off a dirt road, and spray off a wet one. Streaks of speed flow past near top speed, and the car buzzes in your hand on hits and rough ground (`src/f1/shake.ts`, `src/f1/rumble.ts`).

**Sound and music:** sound is synthesised with Web Audio (`src/engine/audio.ts`, `src/f1/sounds.ts`): the engine, tyre squeal, rough ground and gravel, hits and scrapes, rain, the countdown's beeps, and a fanfare at your flag. The theme plays at home and the stage's own track on the road (`public/music/`, `src/f1/music.ts`).

**Cameras:** the default is the chase camera (low, behind the car). To try others on a stage, add `&cam=` to the address: `classic` (the HD-2D view, high, north up), `heading` (turns with the car), `road` (turns with the road ahead), `bonnet` or `iso` (a fixed diagonal).

**Fixed-step simulation:** the stage runs in steps of exactly 1/60 s, however fast or slow the screen draws (`src/engine/fixedStep.ts`), so a run comes out the same on any screen and in the headless tests.

**Reports and play stats:** REPORT (top right of home and the settings, and on the pause screen) takes a screenshot to draw on, with a note on what's wrong (`src/f1/report.ts`). Anonymous counts of how the game is played (launches, stages started and finished, km driven, time in the game) go to the game's Supabase project when the build has one (`src/f1/metrics.ts`, [`supabase/README.md`](supabase/README.md)). STATS in the settings turns them off. The totals are on the stats dashboard (`stats.html`).

**URL flags:**

- `?mode=rally` opens home.
- `?debug` exposes `window.__cc` for tests: `__cc.stage()` gives the stage's notes, reference run, rival leader, co-driver card and result; `__cc.autopilot(pace)` drives your car on the racing line; `__cc.look(x, y)` holds the camera on a point.
- `?cam=` picks a camera, `?inputlog` lists the input events, and `?desktop` / `?mobile` force a layout.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run stats` | The play-stats dashboard |

## Publishing to itch.io

`.github/workflows/itch.yml` tests and builds every push and pull request. A push to the default branch (or **Run workflow** in the Actions tab on it) also uploads `dist/` to itch.io with [butler](https://itch.io/docs/butler/) as the `html5` channel, versioned `<package version>+<commit>`.

Setup (once):
1. On itch.io, create the project with kind **HTML**. Under the embed options, tick **Mobile friendly** (portrait) and **Fullscreen button**, and set a viewport of about 390×844.
2. In the GitHub repo, under Settings → Secrets and variables → Actions, add the secret `BUTLER_API_KEY` (itch.io → Settings → API keys) and the variable `ITCH_TARGET` = `<itch-user>/<game-slug>` (e.g. `theaob/corner-cutters-rally`).
3. Push to the default branch. After the first upload, tick **This file will be played in the browser** on the upload in the project's edit page.

Until both settings exist, the workflow skips the upload and warns which one is missing.

## Android

The same web build, wrapped by [Capacitor](https://capacitorjs.com) into an Android app (`android/`, `capacitor.config.ts`): full screen, portrait, with the screen kept on, played offline. Its app id is `io.github.theaob.cornercuttersrally`, so it installs beside Corner Cutters rather than over it.

`.github/workflows/android.yml` builds an APK (a download under the run's **Artifacts**) and uploads it to the itch.io page as the `android` channel. It also builds a Google Play AAB. It runs on every push and pull request; only a push to the default branch uploads to itch.io.

**Signing:** the APK and the AAB are signed with your release key, from the repo's secrets. An Android app installs as an update over the last build only when both are signed with the same key; without the secrets a build is signed with a throwaway debug key (the run warns). Create a key once, keep it safe, and use one of its own for this game:

```sh
keytool -genkeypair -keystore release.keystore -alias cornercuttersrally -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore      # the value for ANDROID_KEYSTORE_BASE64
```

Then add the repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

Locally (with the Android SDK and JDK 21): `npm run android:apk` builds `android/app/build/outputs/apk/release/app-release.apk`, and `npm run android:play` the Play AAB. `npm run android:art` redraws the launcher icons and splash screens (`tools/android-art.py`, needs Pillow).

## YouTube Playables

`npm run youtube:build` builds the version for YouTube Playables into `dist-youtube/`, checks it against Playables' rules and zips it as `corner-cutters-rally-youtube.zip`. `.github/workflows/youtube.yml` does the same on every push to main and keeps the zip as the run's artifact. The build (`VITE_STORE=youtube`) loads the Playables SDK and keeps the save in the player's YouTube account (`src/engine/host.ts`). It's built without the backend (no play stats or REPORT), and Capacitor is swapped for a stand-in (`src/engine/notNative.ts`).

## Layout

```
index.html        The handheld column: game screen (#screen) + control deck (#deck)
stats.html        The play-stats dashboard (src/stats/)
src/
  main.ts         The entry: the host made ready, then app.ts
  app.ts          Routes in the page: home, the settings, a stage (?circuit=<id>&mode=rally), the controls lap
  engine/         Controls, deck, the phone's tilt (tilt.ts), layout, storage, save, TUNE panel, driving physics (driving.ts), ground and
                  collision (sim.ts), render/ (HD-2D pipeline, quality, effects, car models, daylight, textures)
  f1/             The rally game (the folder keeps its old name): uses only engine/
    stages.ts     The stages, grown from their seeds
    rally.ts      The rallies, crews' stage times, standings, damage and service, the save
    crews.ts      Paint schemes and the rival crews
    paceNotes.ts  The co-driver's notes, read off the road
    race.ts       A stage: the countdown, splits, finish and results, the controls lap, the loop, the camera
    raceControl.ts  A step of the stage: driving, contact, progress, damage, wrecks, weather
    circuit.ts, circuitScene.ts, forest3d.ts, camels.ts   The road's map, and the stage in 3D with its scenery
    menu.ts       Option rows, buttons and the settings screen
    race/         The stage's HUD, readout, banner, deck labels, co-driver card and results, the cars drawn
    screens/      Home (rally.ts), the splash, the curtain, the backdrop behind home
public/           Pixel font (Silkscreen, SIL Open Font License), music, the still behind home
tests/            Stages, pace notes, rallies, race control, driving, circuit, controls, layout, storage, save…
```

Saves live in local storage under the `ccr:` prefix, apart from Corner Cutters' even on the same site, as one versioned document, `ccr:save` (`src/engine/save.ts`; the game's format in `src/f1/save.ts`): **settings**, **choices** (your paint scheme and the difficulty), **progress** (the controls lap done), and **rally** (the rally under way, your best finishes and your best stage times).
