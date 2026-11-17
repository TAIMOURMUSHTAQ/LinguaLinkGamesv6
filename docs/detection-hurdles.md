# Detection hurdles and solutions

LinguaLink Play 6.2 · November 2026 · for the LinguaLink team

This note explains why the games sometimes fail to hear or see the child, what was changed in 6.2,
what a browser still cannot do, and the options for going further (including OpenAI and Gemini).

---

## 1. Word Garden: "it does not detect the word at all"

Word Garden uses the browser's built-in speech recogniser (Web Speech API). In Chrome and Edge it
normally sends the audio to the browser maker's online speech service; Chrome can also run it on the
device. Reading the code against how the recogniser behaves showed these causes:

| # | Cause | Effect | Fix in 6.2 |
|---|---|---|---|
| 1 | The game gave up 3 s after the child stopped and **aborted** the recogniser. Online results often take longer (network, especially from Pakistan to the service), and an abort throws the pending result away. | The child said the word, the answer arrived late, and was discarded. Looked like "nothing detected". | Waits 6 s. After 1.2 s of silence it asks the recogniser to **finish** (a graceful stop that still delivers what it heard) instead of aborting. |
| 2 | Only **final** results were used. | Slow, and a session that ended early gave nothing. | **Interim results** are used too: the flower blooms as soon as the word appears, even while the child is still speaking. A non-matching interim result is ignored; only a final one counts as a try. |
| 3 | The recogniser was given a copy of the game's microphone track. Some browsers accept the track but deliver silence from it. | The recogniser "listens" to nothing. | The recogniser now reports whether any sound reached it. If the child spoke twice and no sound reached it, the game switches once to the browser's default microphone (logged as `word_check_microphone`). |
| 4 | Chrome's **on-device** recogniser reports "available" on some machines but returns no words. | Silent failure. | Unchanged safety net: after two empty attempts the game moves to online checking (if a grown-up allowed it) or asks a grown-up. |
| 5 | The recogniser expected **US English**. Many Pakistani children's English is recognised better as South Asian English. | Correct words heard as other words. | New setting: Grown-ups > Settings > *Word check accent* (US, UK, South Asia). Also `?accent=en-IN` or `gardenAccent` from LinguaLink360. |
| 6 | Children's words often come back with a slightly different spelling ("rabit"). | Correct tries marked wrong. | A **near miss** counts only when the practised sound's letters are still there in the same place: "rabit" counts for "rabbit"; "tun" never counts for "sun", "budder" never for "butter". |
| 7 | Urdu words were removed before comparison (the comparison kept only a-z). | Urdu could never match. | Urdu letters are kept (short-vowel marks removed); Urdu uses the `ur-PK` recogniser. |

Still true after these fixes:

- The browser recogniser judges **words**, not individual sounds. It cannot tell whether /s/ in "sun"
  was perfect or slightly lisped; it only tells whether the word was recognisable. That is why every
  result records how it was judged, and *Grown-up checks* stays available.
- Online checking needs internet and a grown-up's permission (the child's audio leaves the device).
- Support differs by browser: Chrome and Edge work; Firefox has no recogniser; Safari on iPhone/iPad
  has a limited one. Where none works, the game falls back to "the child spoke" or the grown-up check.
- Urdu (`ur-PK`) is available online in Chrome; on-device Urdu is not.

**How to check on a device:** each word's result is in the session report events: `auto_check` with
`heard` (what the recogniser wrote), `early` (an interim result), `recogniser_heard_sound`, and
`word_check_microphone` when the microphone was switched.

---

## 2. Going further: phoneme-level checking, OpenAI and Gemini

True phoneme-level judgement of consonants ("was the /s/ correct?") is not possible with the browser
recogniser. Options, from simplest to most capable:

### Option A: a better transcription service (OpenAI or Gemini)

- **OpenAI**: the audio transcription API (Whisper-family and GPT-4o transcribe models) is strong with
  accents and with Urdu. **Gemini**: the Gemini models accept audio and can transcribe it.
- It gives better *word* recognition than the browser, not sound-level scoring by itself.
- An audio-capable chat model can also be *asked* whether the target sound was said correctly, but
  this is experimental, not validated for clinical use, and can be inconsistent. If tried, keep the
  grown-up check as the reference and compare the two on real sessions before relying on it.
- Check the providers' current model names and prices when building; they change often.

### Option B: a dedicated pronunciation-assessment service

- Microsoft Azure Speech "Pronunciation Assessment" returns accuracy scores per word **and per
  phoneme**, against a reference text, for several English locales. This is the closest ready-made
  match to "detect at phoneme level". Verify that its locales and child voices fit our users.

### Option C: an open-source phoneme model on our own server

- Phoneme-recognition models (for example wav2vec2 trained for phonemes) can run on our server, so
  no audio goes to another company. Accuracy on children's speech must be measured; it needs a GPU or
  a fast CPU server, and engineering time.

### How any of these must be built (whichever provider)

1. **Never put an API key in the game.** Everything in the browser is public. The key lives on the
   server (`OPENAI_API_KEY` or `GEMINI_API_KEY` as an environment variable on Render).
2. The game already records each try (for *Listen back*). It would send that short clip to a new
   endpoint on our server (for example `POST /api/word-check` in `server.mjs`), which forwards it to
   the provider with the key and returns the transcript or judgement. Size and rate limits on that
   endpoint; nothing stored.
3. **Privacy:** this sends a child's voice to an outside company. It must be off by default, turned on
   by a grown-up (like today's *Allow online word check*), covered by the clinic's consent and the
   provider's data terms (check retention and training settings; for OpenAI API data, check the
   current retention policy and whether zero data retention is available to us).
4. Latency is about 1-3 s per word, and each check costs a little money.

**Recommendation:** first test 6.2 on real devices (the fixes above address the "nothing detected"
problem directly). If word recognition is still weak for our children's accents, add Option A behind
the grown-up switch. If sound-level scoring is required, evaluate Option B on a few recorded sessions.

---

## 3. Balloon Breeze: A, E and O at phoneme level

- Only **A "aaa", E "ehh", O "ooo"** are practised. The voice check learns the child's own three.
- **Strict test** (`vowel.js clearVowel`): the sound must be closest to the target among **all five**
  reference vowels (A, E, I, O, U, not only the three practised), and the next closest must be clearly
  further away. The gap needed is scaled to how close two vowels naturally are (O and U are close even
  in textbook speech). So "eee" never counts as E, "uuu" never as O, a sound half way between A and E
  counts as neither, and A, E, O are never taken for each other. Unit tests check this for men's,
  women's and children's voices on the most forgiving setting.
- The sound must last 0.2 s before the balloon fills, so a passing sound never counts. A hum ("mmm"),
  a hiss, a whisper, claps and noise never count.
- Limits: vowels are told apart by the mouth's resonances (formants). A very nasal voice, a cheap
  headset that cuts high frequencies, or a noisy room makes them less clear. The voice check at the
  start is what makes this work for each child; if detection seems wrong, redo it (leave the game and
  start again after 30 minutes, or in a new visit).

## 4. Sky Glide: a mix of sounds

- Heights from the bottom: hum "mmm", O, A, E, hiss "sss". The vowels use the strict test.
- **Hum:** a hum keeps almost all its energy below 600 Hz; vowels have a second resonance above it.
  The voice check asks for "mmm" and learns where this child's hum sits between the two.
- **Hiss:** high, noisy energy (above 4 kHz) without a voice.

## 5. Fish Feast: puff, tongue and the camera

- **Puff cheeks** looks different on every face and camera: the face model's own puff score hardly
  moves on many faces. 6.2 measures five signals (the model's puff score, three cheek widths, and how
  far the cheeks come towards the camera) and runs a **puff check** before the first puff: the child
  puffs for 3 seconds and the game learns how far each signal moves. A puff then counts at 60% of the
  child's own puff, with the lips closed and not a smile.
- **Tongue** (down, up, left, right, out-and-in, side to side) is not in the face model. It is found
  from the colour around the mouth: a tongue is redder than skin, compared with the cheeks of the same
  frame. Dim or coloured light, a beard or lipstick can confuse it, so a grown-up can tap **Done** on
  every tongue move.
- **Tuning on a real device:** open the games with `?tune=1` at the end of the address. Fish Feast then
  shows the live numbers (each puff signal now and as learnt, the tongue areas, head turn, eyebrows,
  eyes). A screenshot of a relaxed face and of the move that is not detected is enough to tune the
  thresholds precisely.

---

## 6. The articulation word list

Word Garden uses only the LinguaLink360 word list (`database/seeders/PhoneticWordSeeder.php` and
`UrduPhoneticWordSeeder.php`, copied into `js/kit/wordlist.js`). A few entries are worth fixing at
the source (then regenerate `wordlist.js`):

| Sound / position | Issue |
|---|---|
| /ʒ/ initial | only 3 words (genre, gendarme, giraffe); "giraffe" starts with /dʒ/, not /ʒ/ |
| /ŋ/ initial | 2 rare words (ngoni, ngoma); English has no common words starting with /ŋ/ |
| /w/ final | 5 words, several end in a vowel sound rather than /w/ (jaw, saw, straw, mew, thaw) |
| /p/ | "puppy" is in both initial and medial |
| /θ/ medial | "bathtub" twice |
| /ʒ/ medial | "beige-ish" is not a common word |

When a position has fewer than 4 words for a chosen sound, the game tops the level up with the same
sound's words from its other positions (still from the list).
