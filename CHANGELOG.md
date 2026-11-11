# Changelog

## 6.0.0 (2026-11-11)

Ten games, all five vowels, more face and tongue moves, and a new game for the pitch of the voice.

### New
- **Voice Painter** (`js/games/pitch.js`): paint a picture (a slide, a rainbow, waves, a roof, a castle, a roller
  coaster) with the pitch of the voice. A higher voice paints higher, a lower voice lower, and the same note paints
  a straight line. A short "aaah" sets the middle note for each child. Two ways to play: *Brush waits* (moves only
  while the child makes a sound) and *Brush keeps going*.
- **Fish Feast has 24 moves**, in three ways to play: *Mixed moves*, *Mouth and tongue* (lips, cheeks, tongue out,
  tongue left and right, tongue out and in, tongue side to side) and *Big face moves* (open very wide, chewing,
  head left and right, nod yes, shake no, eyebrows up, surprised, sad and cross faces, eyes shut). Each level
  shuffles its moves, never the same twice in a row, and later levels add new ones. Back-and-forth moves are
  counted (3 to 10 times); a small reward comes every 5 seconds of a long hold. The tongue is found from the
  colour around the mouth, so a grown-up can also tap Done for tongue moves.
- **Pointing without the pointer finger:** hand games follow the pointer finger, else any straight finger, else the
  whole hand. Finger Numbers lets any finger or the whole hand draw when the level's finger is not seen for 2
  seconds. A grown-up setting makes the whole hand point always.
- Every game opens with "How to play" steps.
- Holds go 5, 10, 15, 20 and 25 seconds, level by level. Balloon Breeze and Sky Glide use all five vowels, after
  a short voice check that learns the child's own A, E, I, O and U. Air Letters starts with the alphabet in order.

### Improved
- **Microphones:** headsets, external and phone microphones are followed when plugged in, unplugged or switched;
  a voice during the room check, or while a new microphone connects, is no longer learnt as room noise (which hid
  quiet speech); a learnt room that is too loud corrects itself in the next quiet moment.
- The voice check ignores a wrong sound or one sound said for every prompt, instead of learning it.
- Sky Glide's *Stop and say* waits for the ring's sound even when the bird is already at its height.
- Balance Tray replaces fallen fruit at once; Animal Moves keeps a pose through small wobbles.
- Plain game words everywhere: no therapy terms, percentages or decimals on the child's screens.

## 5.0.0 (2026-11-03)

A livelier look in every game, better writing in the air, and a choice of who checks the words.

### New
- **Animated scenery in all nine games** (`js/kit/scene.js`): turning suns, drifting clouds, flocks, butterflies,
  bees, rainbows, fish schools, jellyfish, coral, northern lights, shooting stars, planets and a rocket. The home
  tiles are alive too. "Less movement on screen" still stills them.
- **Buddy** (`js/kit/buddy.js`) replaces the stick figure in Animal Moves: a round little kid in a giraffe, bird,
  palm tree, frog or flamingo costume who follows the child's body and shows each pose.
- **Word Garden has two ways to play**, chosen on the level card. *Game listens*: right word, a flower blooms;
  otherwise "Try again" or "Next word". *Grown-up checks*: "Said it", then Clear or Try again.
- Rewards: rays, rings of light, sparkles, confetti and characters that bounce and blink.

### Improved
- **Writing in the air:** a filter removes camera shake without lag; quick strokes between camera frames count;
  losing the hand for a moment no longer lifts the pen; the game stays on the hand that is writing; movement is the
  same across as up and down; a finger pointing partly at the camera still reads as straight. When a child is stuck,
  there is a little more room for error and a spark shows the way.
- The letters sit on a magic slate with a rainbow ink, moving arrows and a thread from the hand to the start.

### Removed
- JSON export buttons, technical names in session reports, and library and format names in About.
  Results still reach LinguaLink360 in the background as before.

### Fixed
- The public site served project files (`/docs`, `/integration`, Markdown files, `package.json`). Now private.
- The word recogniser listened to the browser's default microphone, not the game's. It now gets the game's own.
- A recogniser that hung could count against the child. It is now replaced, then given up on, and a child is never
  marked down for it.
- Word Garden counted one try too many in its results after a miss.
- "Skip" did nothing while the reward card was showing. It now goes to the next item.
- The Urdu font was missing from the offline files.
- The Laravel guide listed only five of the nine games in its code samples.
- The on-device speech pack is no longer downloaded by the game, because in testing it returned no words.

## 4.0.0 (2026-11-02)

Therapy tuning of the voice games, four new games, and progress that can be seen level by level.

### New games
- **Air Letters:** write letters in the air with a moving hand. Each finished letter pops up with its picture
  and word, and is spoken ("B for Ball"). The last level spells whole words.
- **Finger Numbers:** write numbers with a different finger each level, then show 1 to 10 fingers.
- **Balance Tray:** hold a tray with two hands while fruit lands on it, with heavier and uneven loads.
- **Animal Moves:** whole-body poses (giraffe, bird, palm tree, frog, flamingo) with body tracking.

### Changed
- **Balloon Breeze** recognises the vowel. Only the sound asked for ("aaa", "eee", "iii", "ooo", "uuu") blows up
  the balloon, in visible steps. Noise, claps, hissing and whispering do nothing. The match tightens level by level.
- **Sky Glide** now steers with "eee" up and "aaa" down, and flies straight in silence. Quiet voices and whispers
  count. New way to play: **Stop and say**, where the bird waits and asks for each sound.
  Pitch measurements are gone from its results.
- **Fish Feast** has a clear ladder: holds grow move by move (1 s up to 6 s), and levels ask for bigger movements.
  Pout detection also uses how narrow the mouth gets. The treat swells while holding, and Pip grows.
- **Word Garden** practises all sounds by default, with new /t/, /m/, /b/ and /f/ words. Short words such as "pig"
  now count, and a hiss alone does not.
- The result card shows the main therapy number against last time. Grown-ups > Progress shows first and latest
  for each level played.
- Smoother entrances and result reveals. Home is two columns on phones.

### Fixed
- Saved settings kept Word Garden on /s/ only, even after a sound was no longer chosen on purpose.
- The server let browsers reuse old code for an hour; every file is now checked on each load.

## 2.0.0 (2026-10-31)

A redesign for children and a fix for every issue in the v1 QA report (IDs below refer to it).

### New
- Splash screen with Lumi and a loading bar, then "Tap to play".
- Child-friendly home: one big tile per game, stars earned, no level lists.
- A level map for each game. Levels open one by one; locked levels say how to open them.
- Sticker book: 25 stickers, one per level, won with 2 or more stars.
- Rewards on the result screen: new sticker, "Level 2 is open!".
- Grown-ups area (hold 2 seconds): readable session reports with charts, Save as PDF, JSON export,
  progress per game, choose any level, settings, clear data.
- Each game has its own sound palette, gentle background music (never while a microphone game
  listens), and varied spoken praise.
- Balloon Breeze practises different sounds round by round ("aaah", "ooo", "eee", "mmm").
- Sky Glide measures the voice range once per visit and reuses it.
- Installable app with icons, and offline play (service worker).
- Node server with correct file types, compression, caching and security headers; Render blueprint.
- Browser test suite (`npm run test:e2e`) and 11 new unit tests.

### Fixed
- **C1** Camera games took 56–110 s to start. The camera library and models now ship with the app,
  load with a progress bar, start loading when the game's map opens, and are reused for every level.
- **C2** Leaving a game while it loaded left a hidden game running that saved a fake result.
- **C3** Word Garden scored only the words answered (2 of 5 gave 100 and 3 stars).
- **C4** Pitch detection took 18 ms per frame; it now takes about 0.4 ms, 20 times a second, in Sky Glide only.
- **H1** Word Garden could hear its own spoken word as the child's attempt.
- **H2** The result screen waited for the server; it now appears at once and unsent results are retried.
- **H3** Results were reported as sent to LinguaLink360 when they could not be; delivery is now confirmed.
- **H4** Sky Glide reported an invented pitch range when the child was silent.
- **H5** Urdu mode was mostly English; every string and every game text is now translated.
- **M1** Balloon Breeze celebrated a failed round.
- **M2** Fish Feast therapist mode timed out after 6–8 s; it now waits, with Done and Not yet.
- **M3** Word Garden highlighted the wrong letters for /s/ ("Wash", "is").
- **M4** Custom word lists ignored the level.
- **M5** The privacy note said "nothing is recorded" although Word Garden keeps the last try.
- **M6** All 25 levels were listed at once with no progression.
- **M7** The app could not be installed or used offline.
- **M8** The hub waited for Google Fonts before showing anything.
- **M9** The phone hub was 4,193 px tall.
- **L1** The countdown and calibration could not be paused.
- **L2** "Auto difficulty" pushed a result figure off the screen.
- **L3** The Firefly touch cursor stayed after the finger lifted.
- **L4** The intro could name the wrong controls.
- **L5** The settings window was not keyboard friendly (now native dialogs).
- **L6** Reduced motion only affected the menus; the game scenery now stands still too.
- **L7** Unknown `?sound=` values were accepted.
- **L8** The docs disagreed on the number of tests.

### Changed
- Result format: added `result_id`; `suggestion` can be `unfinished`.
- `vendor/mediapipe/vision_bundle.mjs` renamed to `vision_bundle.js`.
- Start scripts use Node (`npm start`); Python still works.

## 1.0.0
First version: five games, 25 levels, sensors with touch fallback, automatic difficulty, results for LinguaLink360.
