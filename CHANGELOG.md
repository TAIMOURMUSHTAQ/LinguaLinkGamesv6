# Changelog

## 6.4.0 (2026-11-25)

### Vowel recognition (Balloon Breeze, Sky Glide)
- **New vowel fingerprint**: the cepstrum of the spectrum's envelope by linear prediction (LPCC), with
  a 250 Hz smoothing window and a 40 dB floor. The 6.3 fingerprint (24 hearing-scale bands) moved with
  the voice's pitch: for a man's low voice a slightly higher "aaa" looked like his "ooo", which is
  what failed on real devices.
- **New lifelike browser test** `tests/e2e/realvoice.mjs`: natural voice source (jitter, shimmer,
  vibrato, breath), room echo, 50 Hz mains hum, fan noise and a cheap microphone, through Chrome's
  fake microphone and the real Mic class. Each vowel is learnt from its first hold, then a second
  hold at another pitch and loudness is judged.

| Lifelike test, man's voice | 6.3 | 6.4 |
| --- | --- | --- |
| "aaa" recognised (first levels) | 13% | 100% |
| "aaa" taken for O | 47% | 0% |
| "eee", "mmm" taken for A, E or O | 88–100% | 0% |

- **Fixed (6.3 regression):** Sky Glide learnt a vowel from any held sound while its ring was next,
  so a child who kept saying "aaa" had it learnt as O. A sound whose resonances clearly say it is
  another vowel is now never learnt (Balloon Breeze too); only O and U are not held against each
  other, as an O read as U is the reading that misleads on real devices.
- Browser tests: `realvoice.mjs` 43/44, `voice.mjs` 29/30 (the one miss is the test's own timing: the
  room check finished after its sampling window). Unit tests 92/92.
- Known limit: for a high child's voice, U and O are acoustically almost the same, so "uuu" counts
  as O on the first levels; the child's O on the strictest level is recognised about half the time.

## 6.3.0 (2026-11-18)

### Vowel recognition (Balloon Breeze, Sky Glide)
- **Vowel fingerprints** (`js/kit/vowelprint.js`): each vowel is recognised from the whole shape of its
  sound (24 hearing-scale bands → 12 numbers, loudness ignored), learnt from the child's own A, E and O
  the first time each is held. Picking the two resonances failed when they merge (a man's "aaa" read
  as 525/2800 Hz) or behind a cheap microphone. In synthetic tests (man, man with close A/O, woman,
  child; clean and cheap microphone) A, E and O were recognised 100% at the easiest and the strictest
  setting and never confused; "eee" was never accepted. Known limit: "uuu" is close to O and is
  accepted as O on the first levels (rejected on most voices on the last levels).
- A fingerprint too like another vowel already learnt is refused (the child said the same sound
  twice), and learnt again on a later round. Vowels without a fingerprint still use the resonances.
- Sky Glide learns a vowel from any held voiced sound while its ring is next (not a hum, a hiss or
  another learnt vowel), instead of waiting until the resonance test already agreed.
- Microphone: the room level no longer creeps up into a held voice; a steady pitch counts as voice
  even just under the loudness bar. "eee" is never taken for a hum (a high second resonance), and a
  vowel is checked before the hum. A learnt resonance can only make a vowel closer, never further.
- `?tune=1` voice panel shows the distance to each learnt fingerprint.

### Fish Feast thresholds
- Smile, tongue (0.018) and puff thresholds lowered after on-device readings; a smile or a wide mouth
  no longer counts as a puff.

### Balloon Breeze
- No voice check screen at the start. Each round shows a big prompt and **says** its sound ("Say A,
  aaa"), also when spoken instructions are off. The game learns the child's own A, E and O the first
  time each is held, with a forgiving test meanwhile, so the balloon fills from the first try.
- Fewer things can block a real voice: a clear pitch is enough (the stricter "steady pitch" and the
  hum test no longer gate it; the strict vowel test still rejects other sounds).

### Fish Feast
- **Tongue check**: each tongue move (down, up, left, right) is learnt the first time it comes, like the
  puff; then 60% of the child's own move counts. A grown-up's Done during the check counts the move.

### Word Garden
- Words follow the **word list's own order**: the game's mix goes /p/, /b/, /t/, /d/ ... one word each;
  a chosen sound gives its words in list order. Each play continues where the last one stopped.
- Urdu letters are shown with their sound: م (ما), س (سا).
- `scripts/make-wordlist.py` regenerates `js/kit/wordlist.js` from LinguaLink360's seeders.

### Phones
- The screen no longer flickers: the game picture is only resized when its size really changes, and is
  drawn again at once.
- Games play upright too: "turn sideways" is a small hint that fades, not a full-screen block.
- Sharper picture on phones (2 pixels per point; slow devices still drop to 1).

### Checking on a real device
- `?tune=1` now also shows a live **voice panel** in every microphone game: room level, how loud the
  voice is above it, voice and pitch detected, the vowel heard and its distance to A, E, O, I and U.

## 6.2.0 (2026-11-17)

Vowels at phoneme level in Balloon Breeze, a sound mix in Sky Glide, new Fish Feast moves with a puff
check, and Word Garden built on the articulation word list. See `docs/detection-hurdles.md`.

### Balloon Breeze
- Only **A "aaa", E "ehh" and O "ooo"**. A strict test: the sound must be closest to the target among
  all five reference vowels, with a clear gap to the next one, so A, E and O are never taken for each
  other, and "eee", "uuu", a hum or a hiss never count. The sound must last a moment before the balloon
  fills. The voice check learns the child's own A, E and O.

### Sky Glide
- Steered by a **mix of sounds**: from the bottom, a hum "mmm", O, A, E and a hiss "sss". The voice
  check also learns the child's hum.

### Fish Feast
- Removed: surprised, sad and cross faces. Added: **tongue up**; "tongue out" is now **tongue down**.
- **Puff check**: before the first puff the child puffs for 3 seconds and the game learns that face's
  puff from five signals (the face model's score, three cheek widths, the cheeks coming forward).
- `?tune=1` shows the live face numbers on screen, for tuning on a real device.

### Word Garden
- Words come **only from the articulation word list** (the same list as LinguaLink360's Articulation
  page): 24 English sounds and 38 Urdu letters, each at the start, middle and end of words.
- On the level card: **language** (English by default, or Urdu with only Urdu words) and **sound**
  ("Game's mix" or any one sound of the list). Levels: start, middle, end, all three, then a big mix.
  Each play moves on through the list, so the words change.
- Pictures where one fits the word; every other word (and every Urdu word) is **animated word art**.
- **Detection fixes**: early results count, a slow online result is no longer thrown away, a
  microphone that delivers silence to the recogniser is switched, Urdu words are compared correctly, a
  spelling near miss counts only if the practised sound is still there, and a new *Word check accent*
  setting (US, UK, South Asia).
- Removed: the "Correct" button in *Game listens*, and the phrases and sentences (they were not in the
  word list).

### Fixed in the final check
- A sound or language chosen on Word Garden's card was forgotten after reloading the page.
- The microphone switch could trigger wrongly after a word (it read a fresh, silent listen).
- Sky Glide asked for the hum again on every level when the hum check learnt nothing.
- Fish Feast: a puff check that learnt nothing made puffs impossible for the visit; Skip now skips the check.
- Word art was washed out (most of all in Urdu); the card's sound picker is labelled "Sound".
- The session report names Fish Feast's tongue-out move "Tongue down", as the game does.

## 6.0.1 (2026-11-11)

Fixes from the first test on the live site.

### Fixed
- **E and I were the same sound.** The games asked for E as "eee" and I as "iii", and held out those are one
  sound, so saying "iiii" was heard as E. The five vowels are now A "aaa" (father), E "ehh" (egg), I "eee" (see),
  O "ooo" (go), U "uuu" (moon), which are clearly different. Sky Glide heights from the bottom: U, O, A, E, I.
- **Voice Painter jumped around.** A pitch reading that slips (an octave or far off) no longer moves the brush;
  a real jump of the voice is followed once a few readings agree. The voice check uses steady readings only.
- **The level card needed scrolling** to reach Start. It now has two columns on wider screens, and on phones the
  Start button stays in view. The note about Word Garden recordings shows only on Word Garden.
- Voice Painter's picture at the end of a drawing sits on a white circle.
- **Word Garden, "Game listens":** the Correct button is gone, so a word only counts when the game hears it. A
  grown-up who wants to judge the words chooses "Grown-up checks" on the level card.
- **Camera games start much sooner:** the server sends the camera engine and models compressed (the engine
  goes from 11 MB to under 3 MB), and the engine is fetched in the background a few seconds after the home
  screen opens (not in touch mode or with data saver on).
- **Balance Tray:** a fruit that falls off is replaced at once (0.3 s), also while the game waits for hands.
  One hand can hold the tray on its own: the tray follows the tilt of that hand. "Show your hands" only shows
  when no hand is in view.
- **Finger Numbers and Air Letters track faster:** each game looks for only as many hands as it needs (the
  hand model searches the whole picture on every frame until it has found that many). In Finger Numbers the
  whole hand draws at once when the level's finger is not up, without a jump when the finger flickers.

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
