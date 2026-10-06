# Corner Cutters: design and development plan

A plan for taking Corner Cutters from a playable prototype (one race, two circuits) to a
small, finished arcade racer on Google Play and itch.io. It starts from what the code does
today, sets out what the game should feel like, and orders the work into milestones that
each end in a build worth putting on itch.io.

## 1. Where the game is today

What's built and working (`src/`, about 4,300 lines, 12 test files):

| Area | State |
|---|---|
| Driving | Arcade physics with torque/power, sliding, drift, kerbs, grass and gravel, elevation and jumps (`engine/driving.ts`, `engine/sim.ts`) |
| Race | Start lights, laps and sectors, positions, lap times, results, cool-down lap (`f1/racing.ts`, `f1/race.ts`) |
| Race control | Damage for every car, smoke → fire → wreck, DNF, safety car with limiter, no-overtaking rule and 5 s penalties (`f1/raceControl.ts`) |
| Pit stops | A pit lane on every circuit; a stop repairs damage; the car drives itself through once committed; the AI and a "BOX, BOX" call decide from the damage and laps left (`f1/pits.ts`) |
| AI | Follows a precomputed racing line at a per-driver pace and lane, moves over for slower cars, holds station under the safety car (`aiInput`) |
| Circuits | Crescent Park (~24 s lap) and Silver Heath (~27 s), built from a centreline + elevation profile (`f1/layouts.ts`, `f1/circuit.ts`) |
| Teams | Eleven look-alike teams with liveries, patterns and logos; five teams of two per race (`f1/teams.ts`, `f1/logos.ts`). Cosmetic only: every team's car is the same |
| Controls | Analogue thumbstick (point where to go, push for throttle, B drifts), touch deck, keyboard (`engine/controls.ts`, `engine/deck.ts`) |
| Look | HD-2D pipeline (tilt-shift blur, bloom), three quality levels with an automatic governor (`engine/render/`) |
| Menus | Touch circuit menu with a TEAM row; TUNE panel for laps, grid, AI pace, camera (`f1/circuitSelect.ts`, `engine/tuning.ts`) |
| Shipping | CI tests + builds every push and publishes to itch.io; Android APK via Capacitor, built on every push and uploaded to itch.io |

What's missing for it to feel like a game rather than a tech demo:

- **No reason to play a second race.** Nothing is saved but settings: no lap records, no
  wins, no unlocks, no championship.
- **No sound at all.** For a racing game this is the single biggest gap in feel.
- **No pause.** A phone game has to survive a notification, a call or a tab switch.
- **Difficulty is a debug slider.** AI pace lives in TUNE; a new player isn't told what to pick.
- **No onboarding.** The controls are explained only in the README.
- **Two circuits**, both fast and flowing; there's no slow, technical or street-style track.
- **The AI never makes mistakes or defends**; races are decided at the start or by damage.

## 2. Design

### Pitch

*Pocket-sized F1 in the HD-2D style: 1–3 minute races you can play one-handed on a phone,
where cutting a corner is a risk you choose to take. Once you've mastered the sprints,
longer Grand Prix races add tyres and pit stops.*

### Pillars

Every feature below is judged against these. If it doesn't serve one of them, it waits.

1. **A race in your pocket.** A full session (menu → race → results) fits in two or three
   minutes. Everything works in portrait with thumbs, offline, and survives interruption.
2. **Readable at a glance.** Tiny screen, fast cars: you can always tell who's who, where
   you are, and what just happened (team patterns and T-cameras already do this for cars).
3. **Risk you choose.** The name is the design: kerbs, run-off, contact and damage make
   aggression pay off *sometimes*. The safety car and penalties are the price.
4. **One more race.** Short loops that reward coming back: a record to beat, a
   championship round to finish, a circuit to unlock.

### Core loop

```
pick circuit + team ─▶ race (1–3 laps) ─▶ results: position, best lap, record? ─▶ reward / next round
        ▲                                                                              │
        └──────────────────────────────────────────────────────────────────────────────┘
```

### Game modes (target)

| Mode | What it is | Why |
|---|---|---|
| **Quick Race** | Today's race: any circuit, any team, grid size and laps from settings | The fastest route into the game |
| **Time Trial** | Alone on track, against your best-lap ghost; sector splits | Pure driving mastery; cheap to build on the existing sim; teaches the circuits |
| **Championship** | A season of rounds across the circuits, points per finish, drivers' standings between races | The long-term "one more race" loop |
| **Grand Prix** *(later, M6)* | Longer races (8–15 laps, about 4–7 minutes) with tyre wear and a pit stop; also a Championship length option | The step up once the sprints are mastered; brings strategy in |
| **Daily Challenge** *(later)* | One seeded circuit + conditions per day, one best result kept | Gives a reason to open the game daily; seeds make it fair without a server |

### Difficulty

Three levels, chosen on the menu's DIFFICULTY row (**done**, `f1/difficulty.ts`). A crash's
cost applies to every car alike; TUNE keeps an AI pace adjustment for development.

| Level | AI pace (front of grid) | AI spread down the grid | Crash damage | Slowing when damaged |
|---|---|---|---|---|
| Easy | 0.86 | 8% | half of normal | 15% at worst |
| Normal | 0.94 | 5% | normal | 30% at worst |
| Hard | 1.00 | 2% | 1.75× normal | 40% at worst |

Still to come with the AI work in M2: mistakes (frequent on Easy, rare on Hard) and defending
on Hard. The numbers come from playtesting with the headless race tests, e.g. "a clean player
lap on Easy wins by ≥ 3 s on every circuit".

### AI improvements

- **Mistakes:** occasional small errors scaled by difficulty (a late brake, running wide
  onto the kerb, a lock-up), so positions change during a race and not only at the start.
- **Defending:** a car being closed on picks the inside into the next braking zone.
- **Personalities:** each named AI driver (VOLT, RAZZ…) gets a fixed pace/aggression/
  consistency so players learn their rivals across a championship.
- **Rubber-banding:** only mild, and only on Easy; it should never feel like the field is
  being dragged along.

### Circuits

Two now; target **six** for a first full season, each with its own character so no two feel
the same:

| Circuit | Character | Idea |
|---|---|---|
| Crescent Park | over the hills, the long Turn 8 | done: retraced from the circuit in Istanbul |
| Silver Heath | fast, two hard stops | done |
| Harbour street circuit | tight, walls close, slow corners | done: after the famous harbour street circuit |
| Royal Park | the longest straight, two hard chicanes, the banking | done: after the temple of speed, with a floating podium |
| Ardennes | the longest lap, big fast elevation changes, a forest | done: traced from the famous circuit in the Ardennes |
| Alpine Ring | a short, steep lap on a mountainside | done: traced from the short circuit in the Austrian hills |
| Twin Lakes | anticlockwise, a bowl, down and up | done: traced from the circuit in the big Brazilian city |
| Oasis | the desert, under the lights, heavy stops | done: traced from the circuit in the sands of the Gulf |
| Baku | streets: the castle section, then the longest run flat out | done: traced from the city circuit on the Caspian |
| Suzuka | the figure of eight, over its own bridge | done: traced from the one in Japan; a two-level bridge (`f1/bridge.ts`) |
| Mountain / hill track | big elevation, blind crests, jumps | shows off the height model and airborne physics |
| Desert track | long straights, slipstream battles | done: Oasis |
| Rain / forest track | low grip sections | introduces weather (later) |

Each layout stays a centreline + elevation profile in `f1/layouts.ts`; any traced outline must
come from permissively licensed data and use an invented name (no real circuit or team names,
as now).

### Racecraft features (in priority order)

1. **Slipstream:** a car close behind another gains top speed on straights. Makes overtakes
   happen on straights, not only through contact.
2. **Corner-cutting rule:** all four wheels off track beyond a limit at a marked corner →
   warning, then a time penalty (reuses the penalty system from the safety car). This is
   where the game's name becomes a mechanic.
3. **Qualifying (short):** one flying lap sets your grid slot; skippable. Today the player is
   always mid-grid.
4. **Tyres and pit stops:** both **in the game now** (`f1/pits.ts`, `f1/tyres.ts`): every
   circuit has a pit lane with a box per team, the car drives itself through once it turns
   in, and a stop fits new tyres and repairs damage for about 7 s. Tyres wear with speed,
   faster sliding and off the track, and lose grip and speed, sharply past a cliff; a set
   lasts about two laps at its best. Races default to 5 laps, long enough for a stop. Two dry
   compounds, SOFTS (quick, wear fast) and HARDS (4% slower, last twice as long), make the
   strategy (`f1/strategy.ts`): every plan up to three stops timed from the circuit's practice
   lap, the AI drivers spread over the plans close to the quickest, you given the quickest
   (BOX, BOX on its lap) and picking your tyres on the menu and on the way into a stop.

   Every new circuit needs a pit lane in its layout data (`pit` in `layouts.ts`) along a
   straight long enough for five boxes; `tests/pits.test.ts` checks it.
5. **Weather:** **in the game now** (`f1/weather.ts`), picked before a race: dry, damp or wet,
   with slicks, intermediates and full wets (yellow, green and blue bands on the tyres), rain,
   spray and an overcast look. Still to come: weather that changes during a race, so choosing
   when to switch tyres becomes the strategy, and the player picking tyres at a stop.

### Feel and presentation

- **Sound effects:** engine note that follows speed and throttle (synthesised with Web Audio,
  so no big assets), tyre squeal while sliding, impacts, start-light beeps, a crowd swell at
  the flag, UI clicks.
- **Music, made for the game:** an original soundtrack, which also gives the game its identity
  on the store pages. Planned tracks:
  - a menu theme (loops seamlessly)
  - race music: one track per circuit, or a shared race loop at first; it ducks under the
    engine and lifts on the final lap
  - short cues (stings): lights out, fastest lap, podium, winning the championship
  - later: a results/standings loop and a Grand Prix "final laps" track

  Delivery format: 44.1 kHz stereo, loops cut sample-accurately with the loop points
  written down, exported as Ogg Vorbis (with an AAC/M4A fallback for iOS Safari), aiming
  for under about 1 MB per minute. Separate music and effects volume sliders, both
  remembered.
- **Haptics:** a short vibration on impacts and kerbs on Android (Capacitor Haptics) and
  where `navigator.vibrate` exists.
- **HUD:** a lap/position readout that grows at key moments (new lap, overtake, fastest lap),
  a gap to the car ahead/behind, sector colours (purple/green/yellow) in Time Trial.
- **Camera:** a short "start of race" pan over the grid; a replay of the last 10 s after the
  flag (the sim is deterministic enough to record inputs and re-run them).
- **Results:** points and championship change shown after the table.

### Progression and saves

- Saved per circuit: best lap, best race time, wins, podiums (local storage, `cc:` prefix,
  through `engine/storage.ts`).
- Championship save: current round and points per driver, so a season can be finished over
  several sessions.
- **Unlocks, light touch:** new circuits unlock by finishing a championship round there; all
  teams stay available from the start (they're cosmetic; locking them adds nothing).

### Teams: cosmetic for now

Picking a team today changes only the look: livery, logo, your teammate's colours and which
pit box you use. That's deliberate for now, and nothing before 1.0 builds on it: no team
standings, no team unlocks, no differences between the cars. Teams could matter later (see
*Later: teams that matter* in the milestones), but only once the core races, modes and
release are done.
- A save-format version number from the first change, so later versions can migrate old saves.

### Onboarding

- First launch: a 20-second "learn the controls" lap on Crescent Park with prompts for
  steering, throttle (how far the stick is pushed) and drifting (B); skippable, never shown again.

### Out of scope (for now)

Online multiplayer, accounts, paid content, real team/driver/circuit names or logos,
and car setup screens. Each would take more than it gives at this size of game. (Longer races
with strategy, once out of scope, are now the Grand Prix mode in M6.)

### Release, ads and pricing

The game is **free to download everywhere**. On Google Play the **Championship is an in-app
purchase** (`f1/purchase.ts`): free players get Crescent Park in Quick Race, Time Attack and
Time Trial; the one-time purchase opens the Championship, and with it every other circuit as a
season reaches it. The web game and the APK on itch.io stay fully open.

- **Google Play (the main release):** free, with Crescent Park open; the **Championship** (and the
  other circuits, reached through it) is a one-time purchase (Play Billing: `f1/purchase.ts`, the
  shop in `f1/screens/shop.ts`), kept on the device and restored on reinstall. (The ads below, and
  a "Support the game" purchase removing them, are still only planned.)
- **itch.io:** free, with the optional donation itch.io offers at download. No ads in the web
  build: web ad networks work poorly inside itch.io's frame, and itch.io players are a small,
  friendly audience worth keeping. The Android APK there has no ads either.

How the ads behave, so they never get in the way of the game:
- **Interstitial only**, shown after the results screen when you leave it, never during a
  race, the start lights, a pause or a championship standings screen.
- At most **one every three races**, and none in the first two races of a session or on a
  player's first day.
- **No banner** (it would eat the small portrait screen) and **no rewarded ads** for now (they
  would tie rewards to ads and bend the progression design).
- The ad slot is the natural pause point: music fades out, then back in.
- The "Support the game" button sits on the menu and in the pause menu; after buying it says
  thank you, and every ad call becomes a no-op.

## 3. Technical approach

Keep what already works:

- **Engine / game split** stays enforced by `tests/boundaries.test.ts`: generic pieces (audio,
  save slots, replays, haptics) go in `src/engine/`; F1 rules, modes and content in `src/f1/`.
- **Rules are engine-free and unit-tested.** New rules (slipstream, track limits, qualifying,
  championship points) go in plain modules like `raceControl.ts` and get headless tests that
  run whole races, as the safety-car tests do today.
- **The renderer only reads state.** `race.ts` draws; it doesn't decide anything.

New pieces:

| Piece | Where | Notes |
|---|---|---|
| Game state / screens | `src/f1/screens/` (menu, mode select, championship standings, results) | Replace the "reload the page with `?circuit=`" flow with an in-page screen stack, so a championship can carry state between races without saving and reloading; keep `?circuit=` as a shortcut |
| Save data | `src/engine/save.ts` | Versioned JSON over `storage.ts`, with migrations and tests |
| Audio | `src/engine/audio.ts` | Web Audio: one synthesised engine voice per nearby car, pooled one-shots; unlocked on the first touch (mobile browsers require it); separate music/effects volumes |
| Music | `src/engine/music.ts`, files in `public/audio/` | Streams the soundtrack files, loops at the written loop points, crossfades between menu and race, ducks under effects; loads lazily so the first screen isn't slower |
| Ads | `src/engine/ads.ts` | One small interface (`maybeShowInterstitial()`), with an AdMob implementation in the Android build (a Capacitor AdMob plugin) and a no-op on the web; the frequency rules above live in plain, tested code; Google's test ad IDs in every non-release build |
| Remove-ads purchase | `src/engine/store.ts` | Android only: a one-time (non-consumable) Play Billing product through a Capacitor plugin; the purchase is checked with Play on every start (so a reinstall or new phone restores it) and cached locally for offline play; a no-op on the web |
| Consent | `src/engine/ads.ts` | Google's consent form (User Messaging Platform) before any ad in the EEA, UK and other regions that need it; a "Privacy options" entry in the settings to change it |
| Tyres and pits | `src/f1/tyres.ts`, `src/f1/pits.ts` | Engine-free rules with headless tests, like `raceControl.ts`; pit lane geometry in `layouts.ts` |
| Pause | `src/f1/race.ts` + `main.ts` | Pause on `visibilitychange`, on Android's app pause, and from a PAUSE button; the sim clock stops |
| Fixed-step sim | `f1/raceControl.ts` | Step the race at a fixed 1/120 s and render interpolated; needed for ghosts and replays to be reproducible, and makes tests match the game exactly |
| Seeded randomness | `src/engine/random.ts` | One seeded RNG for lights-out, the draw of rival teams and AI mistakes; needed for Daily Challenge and replays |
| Ghost / replay | `src/f1/ghost.ts` | Record the player's inputs (or sampled positions) per lap; store the best one per circuit |

Performance budget (keep the phone at 60 fps on the "medium" quality level): the audio and
AI changes are cheap; new circuits must keep their tile counts close to today's; weather
spray must go through the existing particle system and respect the quality governor.

## 4. Milestones

Each milestone ends with a build pushed to itch.io, played on a real phone, and a short
changelog in the README.

### M1: Feels like a game (polish the one race)

The goal: someone who opens the itch.io page plays three races in a row.

- [x] Pause: A pauses, auto-pause when the tab or app is hidden, resume/restart/circuits screen
- [x] Sound effects: engine note (V6 orders, gearshift cuts, overrun pops, a rival's Doppler), tyre squeal, impacts, lights beeps, flag; volume, remembered (synthesised, no files)
- [x] Music playback (`engine/music.ts`): looping, crossfades, loop points, its own volume setting; synthesised placeholder loops (`f1/music.ts`), so the composed tracks can be dropped in
- [x] Music: menu theme and a first race loop (`music/theme.mp3`, `music/race.mp3`)
- [x] Difficulty levels on the menu (Easy / Normal / Hard): crash damage and AI pace
- [x] Saved best lap and best race per circuit (per number of laps), shown on the menu, in the race and at the results ("NEW!")
- [x] HUD: gap to the car ahead/behind; a flash on position change and fastest lap
- [x] Save format with a version number (`engine/save.ts`, the game's in `f1/save.ts`), migrations and tests; the separate keys of before carried over
- [x] Haptics: crashes, landings, grass and gravel, kerbs; on/off on the pause screen (Android app and Android browsers)
- [x] After the flag, an in-lap: the top three park in numbered spots on the main straight, the rest are pushed back into their garages; the results come up once you're parked; A skips straight to the top three in their spots

### M2: Racecraft

The goal: races are won by overtaking, not just by surviving the start.

- [x] Fixed-step sim and seeded RNG (prerequisite for M3's ghosts): 60 Hz steps drawn between for faster screens (`engine/fixedStep.ts`); each race's draws from its seed (`engine/rng.ts`, `?seed=`)
- [x] Slipstream: up to +6% top speed in a car's wake, building over half a second and fading out of it (`f1/slipstream.ts`); TOW in the readout and a rush of air; the AI is towed too, taking the extra speed only with room to brake from it
- [x] AI overtaking and defending, scaled by difficulty (`f1/racing.ts` RACECRAFT, `tests/racecraft.test.ts`): passes only the ones it can finish on the straight, defends the inside once, gives room and gives way side by side; a mixed grid from the race's seed. Measured over 36 races (both circuits, all difficulties, mixed grids): 2.1 places gained a race against 0.5 before, no wrecks or safety cars, and less contact damage than before (3.1 a race against 3.3); least on Silver Heath at NORMAL, where the field is close and defends
- [x] AI mistakes (a lock-up, running wide: a few tenths each), more on EASY, fewer on HARD; named driver personalities (`f1/drivers.ts`: charger, metronome, veteran, defender, rookie), shifting each driver's racecraft and consistency. Over 36 races: 2.6 mistakes and 2.6 places gained a race, no wrecks or safety cars
- [x] Corner-cutting rule (`f1/trackLimits.ts`): the kerbed bends are marked corners, with a yellow-and-black strip off the inside at each apex; all four wheels past the inside edge is a strike, once per corner: two warnings, then +5 s a cut, for every car. The AI keeps inside the limits (none in 24 measured races, and `tests/racecraft.test.ts` checks it)
- [x] Short qualifying lap that sets the grid (`f1/qualifying.ts`): QUALIFYING ON/OFF on the menu (off by default, remembered); one flying lap on your own, from a standing start about 5 s before the line; a cut deletes it and the next is timed afresh; the AI's times from a reference lap on the racing line scaled by each driver's pace (within 3% of its own lap, tested), ±0.8%; the grid in time order, no time at the back; A skips it (mid-grid, as with it off)
- [x] Headless balance tests (`tests/balance.test.ts`): a reference player (`f1/referencePlayer.ts`) drives through a player's own inputs (the touch stick, which has no brake, or the wheel), following BOX, BOX and pulling out round traffic. Its clean flying lap sets the ladder, per circuit: the quickest AI drives a very good lap (100% of the line's speed) on HARD and a good one (95%) on NORMAL, within 2%; on EASY even the quickest AI is slower than a steady player (90%). The stick and the wheel are within 3% of each other (the stick about 1.5% quicker). In 5-lap races from mid-grid, a good player wins on EASY by 3 s or more (it won by 11–21 s), a steady one misses the podium on HARD, and a very good one races in the top four there

### M3: Modes

The goal: a reason to come back tomorrow.

- [x] In-page screen stack replacing the page-reload flow (`main.ts` routes in the page; views close cleanly: loop, sounds, GPU, overlays); mode select on the menu (MODE: QUICK RACE, TIME TRIAL, CHAMPIONSHIP)
- [x] Time Trial with best-lap ghost and sector splits (`f1/timeTrial.ts`): flying laps on your own on fresh tyres, a cut deletes the lap; your record lap per circuit and weather kept as a ghost (20 frames a second) that drives beside you, a live GAP to it, splits at each sector (purple: quicker than your record, green: than your session's best, amber: slower)
- [x] Championship: season of rounds, points, drivers' standings, resumable save (`f1/championship.ts`, `f1/screens/championship.ts`): a round on each circuit in turn, the same field all season (teams and each driver's pace drawn when it starts), F1 points for the top ten, standings by points then countback; the season is saved after every round, and leaving a round mid-race doesn't count it
- [x] Circuit unlocks through the championship (`f1/unlocks.ts`): the first circuit is open; each later one opens for Quick Race and Time Trial once a Championship reaches it; a circuit you already had a record on stays open; locked circuits are dimmed on the menu
- [x] First-launch controls lap (onboarding) (`f1/onboarding.ts`): a new player's first launch opens a lap of the first circuit on their own, a prompt at a time for the device they drive with (touch stick, keys or gamepad): go, full speed, slowing for a bend, drifting, the track limits, on to the line; each moves on once done; A skips it; CONTROLS LAP in the settings plays it again

### M4: Content

The goal: a full first season.

- [x] Harbour street circuit (tight, walls), after the most famous street circuit (`HARBOUR` in `f1/layouts.ts`): its corners in order, eased apart for our track width; street features in the layout data (walls 28 px off the track's edge with pavement between, the sea, the tunnel) drawn as steel barriers, a town of flats, the sea with yachts and a see-through tunnel roof; a pit lane on the harbour side; a per-circuit tyre wear (0.3 here: a stop pays for some, not others). To keep the AI clean between walls, it no longer sits far over on the inside of a tight bend (it was cutting them flat out). Third round of the Championship, unlocked by it
- [x] Royal Park, after the temple of speed (`ROYAL_PARK` in `f1/layouts.ts`): the longest straight, two chicanes that need braking, a fast left–right–left and a banked half circle onto the straight (`banking` in the layout: the ground tilts up to the outside from the track's inside edge, concrete run-off and wall); the podium on a deck hanging over the main straight, the tifosi on the track below at the ceremony (`podiumDeck`, `f1/podium3d.ts`). Fourth round of the Championship, unlocked by it
- [x] Ardennes, traced from the famous circuit in the Ardennes (`ARDENNES` in `f1/layouts.ts`): the longest lap (about 12,500 px), 116 px from hilltop to valley floor and the steepest climb of all (0.18) out of the bottom of the valley; a forest of spruces and broadleaves all round (`f1/forest3d.ts`), each tree only as tall as it can be without hiding the track, hillsides counted. Fifth round of the Championship, unlocked by it
- [x] Alpine Ring, Twin Lakes and Oasis (`ALPINE_RING`, `TWIN_LAKES`, `OASIS` in `f1/layouts.ts`), traced from the same outline data, their tight bends opened out (so the touch stick keeps up with the wheel and the AI) and close stretches eased apart; rounds six to eight of the Championship, each unlocked by it. Oasis in the desert (`desert`: sand all round)
- [x] Pit lanes: wider than the track, long entry and exit roads, the limiter only between the speed-limit lines; a minimum pit lane (`PIT_LANE_MIN`, 1,040 px) and main straight (`PIT_STRAIGHT_MIN`, 1,120 px), every lane on its straight (Crescent Park, Silver Heath and Ardennes lengthened for it)
- [x] Track designer, a tool of its own (`designer.html`, `src/designer/`, `npm run designer`): the circuit in 3D through a free first-person camera (fly or walk), control points dragged over the ground, heights per point, the pit lane and the rest in a panel, live checks and an AI lap, export as code for `layouts.ts` or JSON
- [x] Mountain circuit (elevation, crests, jumps): Glacier Pass (`GLACIER_PASS` in `f1/layouts.ts`): up the switchbacks, over the Crest and the Kicker (`jumps`: `JUMP` in `f1/circuit.ts`), in the mountains (`mountain`: meadow, rock, snow, spruces to the tree line, boulders); free (`free`: open to everyone from the start, the Google Play build's free tier included; not a Championship round)
- [x] Desert circuit (straights, slipstream): Oasis (night races were tried and taken out)
- [x] Weather: dry, damp and wet, with three tyre compounds, rain and spray (done early)
- [x] Weather that changes during a race; the player picking tyres at a stop
- [x] Start-of-race grid pan (`f1/gridPan.ts`): before the lights the camera glides from pole to the back of the grid, naming each car (yours in gold); A skips it
- [x] 10-second replay after the flag (`f1/replay.ts`): every car and the safety car recorded at 20 Hz (the last 15 s kept); a few seconds after your flag the race holds and the 10 s up to just past your finish play again, slow through the line; A skips it
- [ ] Music: a race track per circuit (or per pair of circuits), stings for fastest lap / podium / title
- [x] A pit lane in every new circuit's layout data (repair stops already use it; `tests/pits.test.ts` checks it)

### M5: Release

The goal: version 1.0 on Google Play and itch.io.

Google Play:
- [ ] Google Play developer account and app created in the Play Console
- [x] Resume the Android workflow on push (done: it builds on every push and uploads the APK to itch.io)
- [x] Build an **AAB** (Play's upload format) as well as the APK (the Play build, `VITE_STORE=play`: the Championship an in-app purchase)
- [ ] Release **upload key** in the repo's secrets, and Play App Signing turned on (Google holds
      the app signing key). The sideloaded APK (signed with the release key from the secrets; the
      repo's old sideload key is retired) can't update to the Play version: say so on the itch.io page.
- [ ] Target SDK level up to Play's current requirement; test on Android 8 up to the newest version
- [ ] CI uploads the AAB to Play's **internal testing** track (Play Developer API with a service
      account key in the repo's secrets); promoting to closed/open testing and production stays manual
- [ ] Closed test with enough testers for long enough to meet Play's rule for new personal
      developer accounts (check the current numbers) before production is allowed
- [ ] Store listing: icon, feature graphic, phone screenshots, short and full description,
      a trailer with the game's music
- [ ] Content rating questionnaire; target audience declared as **13 and over**, so the app
      stays out of the Families programme (its stricter ad rules and certified ad networks);
      the listing and art must not look aimed at children
- [ ] AdMob account and app; interstitial ad unit; `app-ads.txt` published at the root of the
      developer website listed on Play (a small GitHub Pages site works)
- [ ] Ads (see *Release, ads and pricing*): AdMob interstitial with the frequency rules,
      consent form, test IDs outside release builds
- [x] The Championship as a one-time purchase in Play Billing (the Play build), restored on reinstall
      (product id `championship`, to create in the Play Console)
- [ ] "Support the game" one-time purchase in Play Billing that removes ads; restores on reinstall
- [ ] Privacy policy page covering AdMob (advertising ID, device and usage data) and the
      purchase; Data safety form to match; ads declaration (**contains ads**)
- [ ] Android extras: Play Games sign-in is **not** needed; save data backed up with Android's
      Auto Backup so a new phone keeps records

Everywhere:
- [ ] Performance pass on a low-end Android phone; quality governor thresholds re-checked
- [x] Accessibility: COLOURS (COLOUR-SAFE splits, in words too), TEXT (LARGE), the left-handed deck (STICK: LEFT), less motion for a device asking for it (`f1/access.ts`)
- [x] Crash reporting: errors nothing caught to the play stats, the dashboard's ERRORS (`f1/crashes.ts`)
- [x] Daily Challenge: one seeded Time Attack a day, a global board by initials, a streak (`f1/daily.ts`); the day's leader as a ghost to chase
- [x] Time Trial world boards: everyone's best lap per circuit and weather (`f1/boards.ts`)
- [ ] itch.io page: free with optional donation; screenshots, GIF, soundtrack as an optional
      download; version 1.0.0

### M6: Grand Prix (after 1.0)

The goal: longer races with strategy, once players have mastered the sprints.

- [x] Tyre model: wear, grip and speed falling off past a cliff; tyre bar in the HUD (done early)
- [x] Two compounds (soft and hard), picked at a stop
- [x] Pit lane: entry and exit, speed limit, the car drives itself through, repairs (done early, for damage)
- [x] Pick the next compound at a stop (NEXT: SOFTS ◀ ▶ on the way in) and the start tyres
      (the Quick Race's TYRES row); the stop time covers tyres as well as repairs
- [x] AI strategy: plans timed from the circuit's practice lap, each driver one close to the
      quickest (the field splits), re-planned from the measured wear after a stop off the plan
- [x] Grand Prix length: a Quick Race's LAPS up to 20, and a Championship's LENGTH row (SPRINT 5
      laps a round, GRAND PRIX 10)
- [x] Mid-race save, so a long race survives the app being closed (`f1/raceSave.ts`: kept as the app goes into
      the background, on pause and at each lap; RESUME RACE on the menu picks it up, paused)
- [x] Headless tests: a whole Grand Prix with stops runs in a test; strategies are balanced
      (no single strategy always wins): `tests/grandPrix.test.ts`
- [ ] Music: a "final laps" track

### Later: teams that matter (after 1.0, to be decided)

Teams are cosmetic until then. Ideas for when they become a mechanic, roughly from least to
most work:

- [ ] Constructors' standings in Championship (both cars' points)
- [ ] Your teammate races for the team: it doesn't fight you for position, and lets you by
      when it's slower on the day
- [ ] Small differences between the cars (for example top speed against cornering), shown on
      the TEAM row, so the choice of team is a choice of car
- [ ] Pit crews of different speeds
- [ ] A career: start at a backmarker team and earn a seat at a better one with your results

Each of these needs balance tests (no team should always win) before it ships.

### Later: iOS / App Store (decided at the end)

A Mac is available; an Apple Developer Program membership (paid yearly) is not yet. When the
time comes:

- [ ] Apple Developer Program membership; app created in App Store Connect
- [ ] `npx cap add ios`; build and sign in Xcode on the Mac (and CI on a macOS runner later)
- [ ] App Tracking Transparency prompt before personalised ads; AdMob's iOS app and ad unit
- [ ] Remove-ads purchase through StoreKit, ideally with one purchases plugin that covers both
      stores so `engine/store.ts` stays one interface
- [ ] Check the audio fallbacks (AAC music, Web Audio unlock) and touch handling in WKWebView
- [ ] App Store listing, privacy "nutrition label", review

## 5. Working practice

- One feature per branch/PR; CI (typecheck, tests, build) must be green before merging, as today.
- Every rule change comes with a headless test; every visible change is checked on a phone in
  itch.io's frame (the source of most touch bugs so far).
- Tuning goes through TUNE first; values that feel right are copied into the code as defaults.
- `?debug` and `window.__cc` grow with each system (ghosts, championship state) so behaviour can
  be scripted in tests and checked in the browser.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Audio on mobile browsers (autoplay rules, itch.io iframe, latency) | Unlock on first touch; synthesise rather than stream; test in the itch.io frame on iOS Safari and Android Chrome early in M1 |
| Frame rate on low-end phones as effects and audio grow | Quality governor already steps down; add audio voice limits; keep a low-end test phone in the loop |
| Variable timestep makes ghosts/replays drift | Fixed-step sim before any recording (M2) |
| Scope creep (online, car setup) | The out-of-scope list above; each new idea must serve a pillar |
| Play review delays or rejection (policy, closed-testing rule for new accounts) | Create the developer account and start the closed test early (during M4), not at the end |
| Losing the Play upload key | Play App Signing lets Google reset the upload key; keep a backup of it outside the repo secrets |
| Music files making the download big or the first load slow | Size budget per minute, lazy loading, one shared race loop until the per-circuit tracks are ready |
| Ads making the game feel cheap, or hurting reviews | Interstitials only between races, strict frequency caps, a cheap one-time removal; watch review comments and ad-related uninstalls after launch |
| Ad and privacy compliance (consent, Data safety, Families policy, `app-ads.txt`) | Target audience 13+, Google's consent form, test IDs in development; do the Play forms during the closed test, not on launch day |
| Grand Prix races too long for the "pocket" pillar | Mid-race save; sprints stay the default in Quick Race |
| Look-alike teams and traced circuits too close to real ones | Keep invented names and logos; only use permissively licensed outline data, credited in the README |

## 7. Decisions

| Question | Decision |
|---|---|
| Store release | **Google Play** is a target for 1.0 (M5), alongside itch.io |
| Race length | Short races (1–3 laps) first; longer **Grand Prix** races with tyres and pit stops after 1.0 (M6) |
| Music | **Custom soundtrack** made for the game |
| Pricing | **Free** to download everywhere. Google Play: the Championship (and the circuits beyond the first) is a one-time in-app purchase. itch.io: everything open, optional donation, no ads |
| iOS / App Store | **Decided at the end.** A Mac is available; an Apple developer account isn't yet |

### Still open

1. The price of "Support the game" (a typical remove-ads price is a few dollars/euros).
2. Ads in the itch.io web build: planned as **none**; revisit only if itch.io becomes a big
   share of players.
