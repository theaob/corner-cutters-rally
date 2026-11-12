# Store screenshots and feature graphic

How the Play listing's art in `fastlane/metadata/android/en-US/images/` was taken, to retake it when the game's look
changes. Needs Playwright with Chromium and Pillow. Start the game first (`npm run dev`, on port 5173), then run these
from a scratch folder with a `shots/` folder in it:

- `node stage2.mjs "RALLY OF THE FORESTS" forest 30` drives SS1 of a rally on the autopilot at a 360 × 640 phone screen
  (3× pixels, so 1080 × 1920), a thumb held on the one-thumb ring pointing down the road, and saves a shot every 2.5 s
  of the stage clock. The same for `"WINTER RALLY" winter`, `"DESERT RALLY" desert` and `"TARMAC RALLY" tarmac`.
- `node menus.mjs` saves home (`home.png`), the standings after two stages of a made-up rally (`standings.png`) and the
  settings.
- `node feature.mjs x logo` saves the splash logo on a clear background (`logo.png`); `node feature.mjs "TARMAC RALLY"
  tarmac` saves stage shots without the HUD for the feature graphic's backdrop.
- `python3 fg2.py shots/fg-tarmac-03.png 1000 featureGraphic.png ../../public/fonts/silkscreen.woff2` puts them
  together at 1024 × 500 (the second argument is the height in the shot to centre on).

Pick the frames by eye: a co-driver card on screen, the car in a bend.
