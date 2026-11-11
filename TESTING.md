# LinguaLink Play 5.0: Testing

## Automated

```bash
npm test             # 58 unit tests
npm start            # then, in a second window (Chrome installed):
npm run test:e2e     # browser checks; screenshots and results.json in tests/e2e/out/
npm run test:voice   # generated recordings through a fake microphone
npm run test:words   # Word Garden's two ways to play, with a stand-in recogniser
```

The browser tests use Chrome's fake camera and microphone. They cannot judge a real child's voice or
face, so the manual checks below are still needed on real devices.

## Manual checklist (real devices)

Mark each line Pass or Fail, and note the device, browser and anything odd. Use made-up names only.

### 0. Start
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 0.1 | `npm start` (or `start-windows.bat`) opens the splash at http://localhost:8080 | | |
| 0.2 | Splash shows Lumi and a loading bar, then "Tap to play" within about 2 s | | |
| 0.3 | Home shows 5 game tiles; tapping one opens its level map | | |
| 0.4 | On the map only level 1 is open; a locked level says which level to finish | | |
| 0.5 | Browser asks for microphone or camera when a sensor game starts | | |

### 1. Balloon Breeze (microphone)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 1.1 | "Stay quiet" calibration, then countdown | | |
| 1.2 | The bubble shows the sound to make; it changes from round to round | | |
| 1.3 | Holding the right sound blows up the balloon in steps; stopping stops progress (level 3: it shrinks) | | |
| 1.4 | Noise, claps, hissing, whispering and game sounds do not move the balloon | | |
| 1.6 | A different vowel shows "That sounds like ... Say ..." and does not move the balloon | | |
| 1.5 | A missed round sinks gently and says "Let's try the next one" (no celebration) | | |

### 2. Sky Glide (microphone, the five vowels)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 2.1 | First level asks for A, E, I, O and U in turn; staying silent asks once more | | |
| 2.2 | The next Sky Glide (or Balloon Breeze) level reuses the voice check from earlier | | |
| 2.3 | Each vowel flies the bird to its own height (U lowest, then O, A, E, I); silence glides straight. E is "ehh" (egg), I is "eee" (see): check they are never mixed up | | |
| 2.4 | A quiet voice still moves the bird; a whisper never sends it to the top or bottom | | |
| 2.5 | Keep flying: rings keep coming and the next sound is shown | | |
| 2.6 | Stop and say: the bird stops before each ring and asks for the sound; it goes on once at the right height | | |

### 3. Fish Feast (camera, face)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 3.1 | First start shows a loading bar; the next level starts in a few seconds | | |
| 3.2 | Camera preview appears; "Relax your face" calibration runs; Pip copies your mouth | | |
| 3.3 | Open wide, big smile, pout and puff cheeks are detected (note which are hard) | | |
| 3.4 | Tongue out, tongue left, tongue right are detected in normal room light; note any false triggers when just opening the mouth | | |
| 3.5 | Head left / right, nod yes and shake no count each time; eyebrows up, surprised, sad and cross faces, eyes shut | | |
| 3.6 | The three ways to play: Mixed, Mouth and tongue, Big face moves; no move comes twice in a row | | |
| 3.7 | A small reward every 5 seconds of a long hold; tongue moves show a Done button in camera mode | | |
| 3.8 | Touch mode: Done and Not yet work, and there is no time limit | | |

### 3b. Voice Painter (microphone, pitch)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 3b.1 | "Say aaah" voice check; staying silent asks once more, then play starts anyway | | |
| 3b.2 | Sliding the voice up paints up, down paints down, one note paints straight | | |
| 3b.3 | Brush waits: the brush stops when you stop; Brush keeps going: it moves on by itself | | |
| 3b.4 | A child's, a woman's and a man's voice can all reach the top and bottom (level 1) | | |
| 3b.5 | Laptop mic, a wired headset, a Bluetooth headset and a phone all paint | | |

### 4. Firefly Night (camera, hands)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 4.1 | Rings follow your fingertips, mirrored | | |
| 4.2 | Level 3: your LEFT hand is blue and catches blue fireflies | | |
| 4.3 | Level 4: fireflies on the opposite side; touching a moth counts as wrong | | |
| 4.4 | Touch mode: the finger ring disappears when the finger lifts | | |
| 4.5 | With the pointer finger folded, another finger or the whole hand still catches fireflies | | |

### 5. Word Garden (automatic word check)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 5.1 | Only the target letters are red (not the "sh" in Wash or the "s" in is) | | |
| 5.2 | "Hear it" speaks the word and is NOT taken as the child's attempt | | |
| 5.3 | The level card offers Game listens and Grown-up checks, and remembers the choice | | |
| 5.4 | Game listens, real voice, **single words**: the right word blooms a flower with no adult tap. Note how many words return nothing | | |
| 5.5 | Saying a different word shows "Not quite", "I heard ...", Try again and Next word; after 3 tries the game moves on | | |
| 5.6 | "✓ Correct" marks the word right even after a miss | | |
| 5.7 | First use, no on-device check: a grown-up is asked to use the online check or to check the words; nothing listens until then | | |
| 5.7b | Grown-up checks: nothing moves on until an adult taps | | |
| 5.8 | Nothing said for 10 s: the game says the word once | | |
| 5.9 | Stopping after 2 of 5 words gives 40, not 100 | | |

### 5b. Air Letters and Finger Numbers (camera, hands)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 5b.0 | The star follows smoothly with no shake or lag; hiding the hand for a moment does not lift the pen; a quick stroke counts | | |
| 5b.1 | Moving an open hand follows the letter, mirrored; the path only fills in order | | |
| 5b.2 | Finishing a letter pops up its picture and word, and speaks it ("B for Ball") | | |
| 5b.3 | Level 5 of Air Letters spells CAT, SUN, BUS and pops up the whole word | | |
| 5b.4 | Finger Numbers: only the finger shown draws; curling it shows a reminder | | |
| 5b.5 | Finger Numbers level 5: the count of fingers up is right on one and two hands, including 10 | | |

### 5c. Balance Tray (camera, two hands)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 5c.1 | The tray follows both hands; hiding a hand pauses the game and asks for both | | |
| 5c.2 | Level hands keep fruit on the tray; a steep tilt makes it slide off | | |
| 5c.3 | Level 3: the melon pulls the tray over until that hand is lifted | | |

### 5d. Animal Moves (camera, whole body)
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 5d.1 | "Stand back" waits until the body is in view; Buddy follows the child, mirrored, and looks right at this distance | | |
| 5d.2 | Reach up, arms out, sway left and right are detected at a normal distance | | |
| 5d.3 | Frog squat and flamingo knee lift are detected (note which are hard) and left and right are not swapped | | |
| 5d.4 | Stepping out of view pauses the clock; no pose fails while out of view | | |

### 5e. Progress
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 5e.1 | Playing a level twice shows today against last time on the result card | | |
| 5e.2 | Grown-ups > Progress shows first and latest for each level played | | |

### 6. General
| # | Check | Pass/Fail | Notes |
|---|---|---|---|
| 6.1 | Pause (button or Esc) works during calibration, countdown and play | | |
| 6.2 | ✕ during "Waking up the camera helper" returns to the map; the camera light goes off; no session is saved | | |
| 6.3 | Result: stars, plain sentences, sticker and "Level 2 is open!" when earned | | |
| 6.4 | Grown-ups opens only after holding 2 s; Sessions shows a readable report | | |
| 6.5 | Save as PDF prints only the report | | |
| 6.6 | Settings > Language اردو: home, map, intro, game text and reports are in Urdu, right to left | | |
| 6.7 | Phone held upright during a game shows "Turn your device sideways" | | |
| 6.8 | Install the app (browser menu), turn on airplane mode, open it: home and touch games work | | |
| 6.9 | Blocking camera/mic permission switches to touch mode with a message | | |
| 6.10 | Less movement on screen: scenery stops drifting, fewer particles | | |

## Bug report format

```
Game / level:
Device and browser:
Input mode (sensors or touch):
Steps:
Expected:
Actual:
Screenshot or screen recording:
```
