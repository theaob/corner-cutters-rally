# Google Play: the store listing and the Console, step by step

Everything to put into the Play Console for Corner Cutters Rally, ready to paste or upload. The listing's texts and art
are in [`fastlane/metadata/android/`](../fastlane/metadata/android/) (fastlane's `supply` layout, so they can be
uploaded by hand now or by `fastlane supply` later): `en-US/` holds the default listing and the art, and `es-ES/`,
`fr-FR/`, `de-DE/`, `pt-BR/`, `it-IT/`, `tr-TR/` and `ja-JP/` the translated texts for the game's seven other languages
(Play shows the English art for them). The steps that need your account are at the bottom, in order.

- App id: `io.github.theaob.cornercuttersrally` (its own app, beside Corner Cutters)
- Privacy policy: **https://theaob.github.io/corner-cutters-rally/privacy.html** (from `legal/privacy.html`, deployed by
  `pages.yml` to GitHub Pages)
- Terms of service: **https://theaob.github.io/corner-cutters-rally/terms.html**
- Free, no ads, no in-app purchases.

## Listing (Grow → Store presence → Main store listing)

| Field | Limit | File |
| --- | --- | --- |
| App name | 30 | `title.txt`: **Corner Cutters Rally** (20) |
| Short description | 80 | `short_description.txt` (all locales 80 or under) |
| Full description | 4000 | `full_description.txt` (about 2,000 to 2,300) |
| Release notes | 500 | `changelogs/default.txt` |

**Category:** Game → **Racing**. **Tags** (pick up to 5): Racing, Arcade, Rally, Offline, Single player.

**Contact details:** an email address (required; Play shows it publicly), and the website
`https://github.com/theaob/corner-cutters-rally` or the itch.io page.

## Art (`fastlane/metadata/android/en-US/images/`)

| Play asks for | File | Size |
| --- | --- | --- |
| App icon | `icon.png` | 512 × 512, the gravel hairpin (`public/icon-512.png`, drawn by `tools/android-art.py`) |
| Feature graphic | `featureGraphic.png` | 1024 × 500 |
| Phone screenshots (2 to 8) | `phoneScreenshots/1…` | 1920 × 1080 (16:9, landscape) |

The game is played sideways, so the screenshots are landscape, taken from the game itself with the co-driver's card on
screen: one stage from each of the five rallies. A promo video is optional (a YouTube link); add it later.

**Translations:** in the Console, Store listing → Manage translations → Add your own translation text, add Spanish
(es-ES), French (fr-FR), German (de-DE), Portuguese (Brazil, pt-BR), Italian (it-IT), Turkish (tr-TR) and Japanese
(ja-JP), and paste each folder's three texts. The app name stays Corner Cutters Rally in every language.

## App content (Policy → App content)

**Privacy policy:** the URL above.

**Ads:** No, the app doesn't contain ads.

**App access:** All functionality is available without special access (no login).

**Content rating** (the IARC questionnaire): category **Game**. Answer No to violence, blood, sexuality, language,
controlled substances, gambling and simulated gambling, and horror (cars hit trees and roll, but no person is ever hurt:
spectators always get out of the way). *Interactive elements:* users can't interact or share content with each other
(a REPORT goes only to the developer), there's no location sharing and no digital purchases. The expected result is
PEGI 3 / ESRB Everyone / IARC 3+.

**Target audience and content:** ages **13–15, 16–17 and 18+** (not under 13). Choosing under-13 ages puts the app in
the Families programme, whose rules don't allow the anonymous play stats as they stand. "Could the store listing
unintentionally appeal to children?" No.

**News app:** No. **COVID-19:** No. **Government app:** No. **Financial features:** none. **Health:** none.

**Data safety** (what the Android build sends; `legal/privacy.html`, `src/f1/metrics.ts`, `src/f1/report.ts`,
`supabase/README.md`):

- Does the app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS to Supabase)
- Do you provide a way for users to request that their data be deleted? **Yes**: the privacy page says how (a REPORT
  saying "privacy request", or the contact address).
- Data types, all **collected, not shared**, **not processed ephemerally**, **optional (users can choose)**:

| Data type | Purpose | What it is |
| --- | --- | --- |
| App activity → **App interactions** | Analytics | launches, stages started and finished, km driven, time in the game; SETTINGS → STATS → OFF stops it |
| App info and performance → **Crash logs** | Analytics, App functionality | an error the game didn't catch: message, where in the code, a short trace, the screen or stage |
| App info and performance → **Diagnostics** | Analytics | platform, game version, the game window's size (with a REPORT) |
| Device or other IDs → **Device or other IDs** | Analytics | a random id the game makes for itself (not the advertising id, not a hardware id) |
| App activity → **Other user-generated content** | App functionality | the words of a REPORT, sent only when the player presses SEND |
| Photos and videos → **Photos** | App functionality | the REPORT's screenshot of the game (only the game's own picture), sent only on SEND |

Not collected: name, email, location, contacts, financial info, advertising id, messages, health, files, audio. The
game's only Android permissions are INTERNET and VIBRATE.

If the build is made without the Supabase settings (no `SUPABASE_URL` / `SUPABASE_ANON_KEY`), it sends nothing at all;
the answer is then **No** to collecting data. Answer for the build you actually upload.

## The steps, in order

1. **Check the privacy URL** above opens (GitHub Pages is on; `pages` deploys it). Play checks the link.
2. **Create the app** (Play Console → Create app): name Corner Cutters Rally, default language English (United
   States) – en-US, **Game**, **Free**, and accept the declarations.
3. **App content:** fill in every section above. The Dashboard lists what's left.
4. **Store listing:** paste the texts and upload the art from `fastlane/metadata/android/en-US/`.
5. **First upload, by hand:** from the latest `android` workflow run on the default branch (Actions → android → the
   run → Artifacts), download **corner-cutters-rally-play-aab** and unzip it. In **Testing → Internal testing → Create new release**, keep
   **Play App Signing** on (Google signs the app for the store; the key in the repo's secrets becomes your *upload*
   key) and upload the `.aab`. Add yourself to the testers and install from the opt-in link.
6. **Closed testing:** a personal developer account created after November 2023 must run a closed test with **at least
   12 testers opted in for 14 days in a row** before it can apply for production (Dashboard → Apply for production).
   Promote the internal release to a closed track and share its opt-in link.
7. **Production:** after the 14 days, apply for production (a short questionnaire about the test), then promote the
   release. The first review usually takes a few days.

### Things to know

- **Sideloaded vs. Play:** the APK on itch.io is signed with the upload key, the Play build with Google's app signing
  key. Same app id, different signatures: a phone with the itch.io APK has to uninstall it before installing from
  Play, and the save doesn't carry over. Worth a line on the itch.io page.
- **Version codes** are the workflow's run number. Play refuses a code it has seen before, so always upload a newer
  run's AAB.
- **The screenshots and feature graphic** were taken from the game in a browser at a 360 × 640 phone screen, 3×
  pixels (now 640 × 360 landscape), with the scripts in `tools/store-shots/`. Retake them when the look of a stage or the HUD changes.
