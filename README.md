# LinguaLink Play

Nine therapy games for children, with five levels each (45 levels in total), for LinguaLink360.
They run in any modern browser on a laptop, tablet or phone, and can be installed as an app.
The camera and microphone are processed **on the device only**: no video or audio is uploaded, unless a
grown-up turns on the online word check for Word Garden.

**Version 6.0.1.** See [CHANGELOG.md](CHANGELOG.md) for what changed.

| Game | Therapy focus | Controlled by | Touch fallback |
|---|---|---|---|
| **Balloon Breeze** | Breath support, sustained voice, clear vowels | Microphone: only the sound asked for ("aaa", "eee", "iii", "ooo", "uuu") blows up the balloon | Hold the big button |
| **Sky Glide** | The five vowels on cue, quiet and loud voice | Microphone: each vowel flies the bird to its own height (U lowest, then O, A, E, I). Two ways to play: Keep flying, or Stop and say | Drag up and down, or arrow keys |
| **Voice Painter** | Pitch control: rising, falling and steady pitch | Microphone pitch: a higher voice paints higher, the same note paints straight. Two ways to play: Brush waits, or Brush keeps going | Drag up and down, or arrow keys |
| **Fish Feast** | Oral-motor and facial movement: jaw, lips, cheeks, tongue, head, eyebrows, expressions; endurance | Camera face tracking (MediaPipe); the tongue from the colour around the mouth. 24 moves; Mixed, Mouth and tongue, or Big face moves | Therapist taps "Done" or "Not yet" (also for tongue moves in camera mode) |
| **Firefly Night** | Reaching, crossing midline, hand use, sequencing | Camera hand tracking (MediaPipe) | Touch or click |
| **Word Garden** | Articulation of /s/, /k/, /p/, /t/, /m/, /b/, /f/ in words, phrases and sentences | Two ways to play. Game listens: speech recognition checks each word (online only if a grown-up allows it). Grown-up checks: an adult marks each word | Adult taps "Said it" |
| **Air Letters** | Arm control, motor planning, letter shapes and sounds | Camera: move an open hand along the letter. It pops up "B for Ball" and says it | Drag a finger |
| **Finger Numbers** | Finger isolation, fine motor control, numbers and counting | Camera: a different finger each level; if that finger is not seen for 2 s, any finger or the whole hand draws. Last level holds up 1 to 10 fingers | Drag a finger; adult confirms counting |
| **Balance Tray** | Two-handed coordination, load balancing, steadiness | Camera: two hands hold a tray while fruit lands on it | Drag each side, or arrow keys |
| **Animal Moves** | Whole body: strength, balance, range of movement | Camera body tracking: giraffe, bird, palm tree, frog and flamingo poses | Therapist taps "Done" or "Not yet" |

## How it works for a child

1. **Splash screen.** Lumi, the guide, appears while the games load (about 1 to 2 seconds), then "Tap to play".
2. **Home.** One big picture tile per game, with the stars earned so far. No lists of levels.
3. **Level map.** Each game has a path of 5 levels. Level 1 is open; the next level opens when a level
   is finished with at least 1 star. Locked levels say how to open them.
4. **Play.** A short intro card, a loading bar for camera games, a 3-2-1 countdown, then the game.
   Pause works at any time (button or Esc).
5. **Result.** Stars, a few plain sentences ("Longest hold was 3.4 seconds"), the main therapy number
   against last time, a sticker for 2 or more stars, and "Next level" when it is open.
6. **Sticker book.** One sticker per level, 45 in all.

## For grown-ups

Hold the **Grown-ups** button for 2 seconds (keyboard: press Enter). It has:

- **Sessions:** every session as a readable report with a chart per round, the settings used and
  difficulty changes. **Save as PDF** prints a clean report. **Export data (JSON)** saves the raw result
  for LinguaLink360 or research. The JSON itself is tucked away under "Developer data".
- **Progress:** best stars per level and a score trend for each game.
- **Choose a level:** start any level directly, locked or not.
- **Settings:** input (automatic, sensors, touch), language (English, Urdu), Word Garden sound,
  sound effects, background music, spoken instructions, camera preview, allow online word check,
  automatic difficulty, open all levels, less movement on screen.
- **About:** version, privacy, and clearing all data on this device.

### Levels

Every level changes something that matters for therapy, so a step up means a real step up.

| | Balloon Breeze | Sky Glide | Voice Painter | Fish Feast | Firefly Night | Word Garden |
|---|---|---|---|---|---|---|
| 1 | First Puffs: A E I O U, 5 s each | Five Clouds: each vowel twice | First Lines: road, slide up, slide down, 5 s | Big Bites: 6 moves, 5 s holds | First Glow: 10 big, one at a time | Seeds: sound at start |
| 2 | Bigger Balloons: 10 s each | Sound Steps: vowels in order | Hills and Smiles: rainbow, smile, steps up, 10 s | Happy Fish: + tongue in and out, nod, sad face, 10 s | Meadow Dance: 15 moving | Sprouts: sound at end |
| 3 | High in the Sky: 15 s each | Rolling Hills: up and down like a wave | Waves and Roofs: waves, roof, steps down, 15 s | Bubble Faces: + tongue to the sides, shake no, cross face, 15 s | Two-Hand Colours: left blue, right orange | Buds: sound in middle |
| 4 | Gentle Voice: 20 s, steady | Quick Swallow: faster, mixed order | Mountain Path: mountains, zigzag, castle, 20 s | Silly Faces: + tongue side to side, jaw to the side, 20 s | Cross the Path: cross midline, avoid moths | Blooms: two-word phrases |
| 5 | Over the Mountains: 25 s, steady, clear | Glide Slides: fastest, mixed order | Big Picture: roller coaster, big waves, zigzag, 25 s | Pufferfish Party: every move, 25 s | Number Trail: catch 1-2-3-4 in order | Full Garden: sentences |

| | Air Letters | Finger Numbers | Balance Tray | Animal Moves |
|---|---|---|---|---|
| 1 | A to E (then F to J, K to O, P to T, U to Z in levels 2 to 5) | Pointer Finger: 1 2 3 | Level Tray: one apple, wide zone | Tall Giraffe: reach up, arms out, 5 s |
| 2 | (levels 6 to 10) Straight Lines, Round Curves, Zig Zag, Tricky Letters, Word Writer | Ring Finger: 4 5 6 | Two Sides: left and right load | Swaying Palm: lean left and right, 10 s |
| 3 | | Thumb Trail: 7 8 9 | Heavy Side: a melon pulls the tray over | Frog Squats: squat, stretch, 15 s |
| 4 | | Little Finger: 10 1 4 7 | Up and Down: also follow a height line | Flamingo Balance: one leg, 20 s |
| 5 | | Show and Count: hold up 1 to 10 fingers | Tower of Treats: big load, narrow zone | Animal Parade: mixed routine, 25 s |

The five vowels are A "aaa" (father), E "ehh" (egg), I "eee" (see), O "ooo" (go) and U "uuu" (moon).
Balloon Breeze and Sky Glide learn the child's own A, E, I, O and U once per visit (a short voice check) and reuse
them in later levels; Voice Painter learns the child's middle note the same way.
Fish Feast shuffles each level's moves: never the same twice in a row, and every move of the level comes once
before any repeats. Back-and-forth moves (tongue out and in, nod, shake, chew) are counted 3 to 10 times.
The tracing games ask for bigger movements and less room for error as the levels go up.
The middle finger is left out of Finger Numbers on purpose: asking a child to hold it up alone is a rude gesture in many places.
Grown-ups > Settings > "Hand games: use the whole hand" lets the whole hand point in every hand game.

### Automatic difficulty (inside a level)

Each game counts successes and misses in a row and adjusts itself by up to 2 steps easier or harder.
Turn it off in Settings or with `?adaptive=0`.

| Game | Gets easier after | How | Gets harder after | How |
|---|---|---|---|---|
| Balloon Breeze | 1 missed round | Hold target 15% shorter per step (min 1 s), wider steadiness band, looser sound match | 2 rounds in a row | Hold target 12% longer per step |
| Sky Glide | 2 missed rings | Rings 18% bigger, 12% slower, looser sound match per step | 5 rings in a row | Rings 10% smaller, 10% faster per step |
| Voice Painter | 2 pictures painted poorly | Band around the line 20% wider, 12% fewer notes needed per step | 2 good pictures | Band 12% narrower per step |
| Fish Feast (camera only) | 2 missed moves | 15% smaller movement, 25% more time | 3 moves in a row | 10% bigger movement |
| Firefly Night | 2 problems in a row | Fireflies 15% bigger, 20% slower per step | 4 quick catches | 10% smaller, 15% faster per step |
| Word Garden | 2 tries that needed "Try again" | Word said aloud first; then 4 tries instead of 3 | 3 words clear on the first try | No letter highlight; then picture only |
| Air Letters, Finger Numbers | 2 misses | 15% more room for error per step | 4 quick, accurate items | 10% less per step |
| Balance Tray | 1 round that lost fruit | Level zone 15% wider per step | 2 clean rounds | Level zone 10% narrower per step |
| Animal Moves (camera only) | 2 missed poses | Hold 20% shorter, smaller movement, more time | 3 poses in a row | Hold 25% longer, bigger movement |

---

## Run it

Needs [Node.js](https://nodejs.org) 18 or newer. There are no packages to install.

```bash
npm start            # http://localhost:8080
```

Or double-click `start-windows.bat` (Windows), or run `bash start-mac-linux.sh` (macOS/Linux).
Camera and microphone need `localhost` or HTTPS. The camera models are included in `models/`.

Direct links (useful for LinguaLink360 and testing):

```
index.html?game=breeze&level=2              start Balloon Breeze, level 2
index.html?game=garden&level=1&sound=k      Word Garden with /k/ words
index.html?game=mouth&level=1&mode=touch    force touch / therapist mode
index.html?lang=ur                          Urdu interface
index.html?unlock=1                         open all levels
index.html?splash=0&music=0                 skip the splash, no music (tests)
```

## Deploy (GitHub and Render)

See [DEPLOY.md](DEPLOY.md). In short: push this folder to a GitHub repository, then on Render choose
**New > Blueprint** and pick the repository. `render.yaml` sets up a free Node web service with HTTPS.

## Tests

```bash
npm test             # 58 unit tests: vowels, tracing, poses, game rules, scoring, links, reports, Urdu coverage
npm start            # in one window, then in another (Chrome must be installed):
npm run test:e2e     # browser tests: every level, camera load times, offline, Urdu, the v1 bugs
npm run test:voice   # plays generated recordings into a fake microphone: vowels, whispers, claps, full games
npm run test:words   # Word Garden's two ways to play, with a stand-in recogniser
```

The browser tests save screenshots and `tests/e2e/out/results.json`. See [TESTING.md](TESTING.md) for the
manual checklist with real devices.

## Folder structure

```
index.html              splash, home, level map, game screen, sticker book, grown-ups area
css/play.css            all styles (storybook world for children, light/dark workspace for adults, print)
js/app.js               screens, navigation, grown-ups area, reports
js/kit/
  engine.js             runner: intro, sensors, calibration, countdown, loop, pause, results
  adaptive.js           automatic difficulty inside a level
  audio.js              sound palettes per game, background music, spoken prompts and praise
  mic.js                loudness, voice on/off, pitch (YIN, about 0.4 ms per reading)
  vision.js             MediaPipe face and hand tracking, loaded once and reused, with progress
  results.js            result format and delivery (parent page, server with retry, device)
  progress.js           open levels, best stars, stickers
  report.js             plain-language sentences and per-round data for reports
  draw.js               drawing helpers and Lumi
  config.js, i18n.js, storage.js
js/games/               one file per game, each with 5 levels
fonts/                  Baloo 2, Lexend and Noto Nastaliq Urdu (served with the app)
icons/                  app icons
models/                 face and hand model files (included)
vendor/mediapipe/       MediaPipe Tasks Vision 0.10.35 (library and WebAssembly)
sw.js                   offline support
server.mjs              static server with correct file types and security headers
render.yaml             Render deployment
integration/LARAVEL.md  how to plug the games into LinguaLink360
tests/                  unit tests and browser tests
```

## Result format (`lingualink.game_result/v1`)

Unchanged from 1.0, with one added field, `result_id`, so LinguaLink360 can confirm each result and
ignore repeats.

```json
{
  "schema": "lingualink.game_result/v1",
  "result_id": "lsk3j2-1-a8f2c",
  "game": "breeze", "game_version": "2.0.0",
  "level": 1, "level_name": "First Float",
  "assignment_id": 81, "session_id": 1204, "patient_ref": null,
  "input_mode": "sensors",
  "started_at": "2026-10-28T10:00:00.000Z", "ended_at": "2026-10-28T10:01:05.000Z", "duration_sec": 65,
  "completed": true, "score": 100, "stars": 3, "suggestion": "next",
  "metrics": { "rounds_completed": 3, "longest_hold_sec": 2.4, "voice_breaks": 1, "sounds_per_round": ["aah", "ooo", "aah"] },
  "settings": { "target_sec": 2, "rounds": 3, "sounds": ["aah", "ooo"] },
  "events": [{ "t": 0, "type": "round_start", "round": 1, "sound": "aah" }]
}
```

`suggestion` is `next`, `stay`, `easier`, or `unfinished` (the level was stopped before the end).

## Before clinical use

1. **Clinical lead review** of every level's targets, hold times, thresholds and wording, the Word Garden
   words and their marked target letters, and the Fish Feast thresholds in `js/games/mouth.js` (`MOVES`).
2. **Device testing** on real budget Android phones and iPhones, with real children, in a pilot.
3. **Urdu review** of all strings in `js/kit/i18n.js` by a native speaker. Word Garden practises English
   words; Urdu word lists can be added per level through `customWords` once the clinical team chooses them.
4. **Calibrate with real children.** Vowel recognition, hand counting and body poses were tested on generated
   voices and simulated body positions, not yet on children. Eee and iii, and ooo and uuu, sound alike and are
   the hardest pairs. Cheek puff is detected less reliably than the other face moves.
5. **Treat results as practice data.** Scores support the therapist's judgement. They are not a diagnosis.
