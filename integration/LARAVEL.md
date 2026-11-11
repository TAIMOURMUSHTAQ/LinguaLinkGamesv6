# Connecting LinguaLink Play to LinguaLink360 (Laravel)

The games are plain static files (HTML, CSS, JavaScript modules). They need no build step and no
Node server. Laravel serves them, controls who can open them, and stores the results.

The plan below reuses the existing flow from the SRS: the therapist assigns a tool
(`patient_game_assignments`), the patient starts it (`POST /patients/games/start/{assignment}`
creates a `game_sessions` row), and the results are saved on that session.

---

## 1. Put the files in place

```
public/games/lingualink-play/        <- copy the whole lingualink-play folder here
public/games/lingualink-play/models/ <- run scripts/fetch-models.sh once to add the three .task files
```

Camera and microphone only work over **HTTPS** (or `localhost` during development).

Add this header to the pages that host the games, so the browser allows camera and microphone
inside the iframe:

```
Permissions-Policy: camera=(self), microphone=(self)
```

## 2. Register the nine games as library tools

Add one row per game to the table that lists My Resource tools, with these keys:

| key | title | category | input |
|---|---|---|---|
| `breeze` | Balloon Breeze | Speech > Voice | microphone |
| `glide` | Sky Glide | Speech > Voice | microphone |
| `pitch` | Voice Painter | Speech > Voice (pitch) | microphone |
| `mouth` | Fish Feast | Speech > Articulation (oral-motor) | camera |
| `firefly` | Firefly Night | Neurodevelopmental / Motor | camera |
| `garden` | Word Garden | Speech > Articulation | microphone + automatic word check (adult can override) |
| `letters` | Air Letters | Neurodevelopmental / Motor, early literacy | camera (hands) |
| `numbers` | Finger Numbers | Neurodevelopmental / Fine motor, early maths | camera (hands) |
| `balance` | Balance Tray | Neurodevelopmental / Motor | camera (hands) |
| `body` | Animal Moves | Neurodevelopmental / Gross motor | camera (whole body) |

Assignment settings the therapist can choose: `level` (1 to 5), and for Word Garden `sound`
(`all`, `s`, `k`, `p`, `t`, `m`, `b` or `f`) or a custom word list. For Sky Glide, `variant=fly` or
`variant=stop` chooses the way to play, for Voice Painter `variant=pace` or `variant=flow`, for Fish Feast
`variant=mix`, `variant=small` (mouth and tongue) or `variant=big` (jaw, head, eyebrows, faces), and for
Word Garden `variant=auto` or `variant=adult`; without it the
level card lets the child or therapist choose. A page that sets `onlineSpeech: false` in `LINGUALINK_PLAY_CONFIG`
stops online word checking on that page, and grown-ups cannot turn it on.

## 3. Database changes

```php
// database/migrations/2026_11_01_000000_add_play_results_to_game_sessions.php
Schema::table('game_sessions', function (Blueprint $table) {
    $table->string('game_key', 32)->nullable()->index();
    $table->unsignedTinyInteger('level')->nullable();
    $table->unsignedTinyInteger('score')->nullable();       // 0..100
    $table->unsignedTinyInteger('stars')->nullable();       // 0..3
    $table->string('input_mode', 16)->nullable();           // sensors | touch
    $table->boolean('completed')->default(false);
    $table->json('metrics')->nullable();                    // game-specific numbers
    $table->json('result_json')->nullable();                // full result, schema lingualink.game_result/v1
    $table->timestamp('finished_at')->nullable();
});
```

## 4. Routes

```php
// routes/web.php (inside the authenticated patient / guardian group)
Route::get('/patients/games/play/{assignment}', [PlayController::class, 'show'])->name('play.show');
Route::post('/patients/games/sessions/{session}/result', [PlayController::class, 'storeResult'])->name('play.result');
```

## 5. Controller

```php
class PlayController extends Controller
{
    public function show(PatientGameAssignment $assignment)
    {
        $this->authorize('play', $assignment);              // patient or linked guardian, same clinic, not expired
        $session = $assignment->startSession();             // same logic as POST /patients/games/start/{assignment}

        return view('patients.games.play', [
            'assignment' => $assignment,
            'session'    => $session,
            'src'        => asset('games/lingualink-play/index.html') . '?' . http_build_query([
                'game'       => $assignment->tool->key,      // breeze | glide | pitch | mouth | firefly | garden | letters | numbers | balance | body
                'level'      => $assignment->settings['level'] ?? 1,
                'sound'      => $assignment->settings['sound'] ?? 's',
                'assignment' => $assignment->id,
                'session'    => $session->id,
                'embedded'   => 1,
                'parent'     => url('/'),                // lets the games post results to this page
            ]),
        ]);
    }

    public function storeResult(Request $request, GameSession $session)
    {
        $this->authorize('update', $session);               // must be this patient's session, same clinic

        $data = $request->validate([
            'schema'     => 'required|in:lingualink.game_result/v1',
            'game'       => 'required|in:breeze,glide,pitch,mouth,firefly,garden,letters,numbers,balance,body',
            'level'      => 'required|integer|between:1,5',
            'score'      => 'required|integer|between:0,100',
            'stars'      => 'required|integer|between:0,3',
            'input_mode' => 'required|in:sensors,touch',
            'completed'  => 'required|boolean',
            'metrics'    => 'required|array',
            'events'     => 'nullable|array|max:200',
            'session_id' => 'required|in:' . $session->id,
        ]);

        $session->update([
            'game_key'    => $data['game'],
            'level'       => $data['level'],
            'score'       => $data['score'],
            'stars'       => $data['stars'],
            'input_mode'  => $data['input_mode'],
            'completed'   => $data['completed'],
            'metrics'     => $data['metrics'],
            'result_json' => $request->all(),
            'finished_at' => now(),
        ]);

        if ($data['completed']) {
            $session->assignment->markCompletedIfDone();
        }

        return response()->json(['saved' => true]);
    }
}
```

Never trust the score alone for clinical decisions. It is practice data. The therapist reviews it.

## 6. Blade page (iframe)

```blade
{{-- resources/views/patients/games/play.blade.php --}}
@extends('layouts.patient')
@section('content')
<div class="play-frame-wrap">
  <iframe id="playFrame" src="{{ $src }}" allow="camera; microphone; autoplay; fullscreen"
          style="width:100%;height:80vh;border:0;border-radius:16px"></iframe>
</div>
<script>
  window.addEventListener('message', async (event) => {
    if (event.origin !== @json(config('services.lingualink_play.origin', url('/')))) return; // only our games (set the games' origin if hosted on Render)
    const msg = event.data || {};
    if (msg.type === 'lingualink:game-result') {
      const r = await fetch(@json(route('play.result', $session)), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json',
                   'X-CSRF-TOKEN': @json(csrf_token()) },
        credentials: 'same-origin',
        body: JSON.stringify(msg.payload),
      });
      // v2: confirm receipt, so the game can show "Sent to LinguaLink360" instead of "waiting"
      if (r.ok) event.source.postMessage({ type: 'lingualink:result-ack', id: msg.id }, event.origin);
    }
    if (msg.type === 'lingualink:game-exit') {
      window.location.href = @json(route('patient.exercises'));
    }
  });
</script>
@endsection
```

**Other option:** instead of an iframe, the Blade page can set `window.LINGUALINK_PLAY_CONFIG` with
`resultUrl` and `csrfToken`, and the games POST the result themselves. The iframe option keeps the
game files fully static and separate from Laravel views, so it is easier to update.

## 7. Patient Reports

Add a tab per game in Patient Reports (FR-RPT-01) that reads `game_sessions` where `game_key` is set.
Show the level, score, stars, input mode and the main metrics:

| Game | Metrics to show |
|---|---|
| Balloon Breeze | longest_hold_sec, rounds_completed, voice_breaks, steady_voice_pct, target_sound_pct, by_sound |
| Sky Glide | variant, rings_hit, accuracy_pct, up/down_rings_hit and total, right_sound_pct, avg_response_ms, quiet_voice_pct, personal_voice_check. **Changed in v4:** pitch_low_hz, pitch_high_hz and pitch_range_semitones are gone, because the game no longer steers by pitch |
| Fish Feast | moves_done, by_move, longest_hold_sec, longest_hold_by_move, hold_final_target_sec, max_jaw_open, max_lip_round, confirmed_by |
| Firefly Night | caught, avg_reaction_ms, left/right catches, cross_midline_catches |
| Word Garden | variant (auto / adult), target_sound, position, clear, clear_first_try, judged_by (auto / voice / adult), word_check (local / online), judged_auto, judged_adult, said_not_checked, by_sound, items (per word, with sound and judged_by) |
| Air Letters, Finger Numbers | items_done, tracing_accuracy_pct, path_efficiency_pct, avg_time_sec, left_hand_pct, movement_gain, needs_practice, items; numbers also: finger, finger_isolation_pct |
| Balance Tray | steady_pct, tilt_tolerance_deg, mean_tilt_deg, items_kept, items_lost, longest_steady_sec, mean_side_bias_deg, side_bias, height_error_px |
| Animal Moves | moves_done, by_move, longest_hold_sec, longest_hold_by_move, left_right_balance_note, confirmed_by, out_of_view_sec |

Every result also has `metrics.adaptive` (`final`: normal / easier / harder, `made_easier`, `made_harder`).
Show it next to the score: a 100 reached after the game made it easier is not the same as a 100 at normal difficulty.
The therapist can turn automatic difficulty off for an assignment by adding `adaptive=0` to the game link.

`metrics.input_mode = "touch"` means a therapist or parent confirmed the moves by tapping.
Show that clearly, because touch results are not measured by the camera or microphone.

## 8. What changed in v2 for LinguaLink360

- Each result has a `result_id`. Store it with a unique index and ignore repeats: results that could not be
  sent are retried later (outbox), so the same result can arrive twice.
- Confirm each result with `{type: "lingualink:result-ack", id}` (see the Blade page above).
- `suggestion` can now be `unfinished` (stopped before the end of the level). Add it to validation.
- `customWords` for Word Garden can be one list, a list per level, or a list per position, and target letters
  can be marked with [ ], for example `"[s]un"`.
- If the games are hosted on another domain (for example Render), add `parent=<LinguaLink360 origin>` to the
  link and set `FRAME_ANCESTORS` on the games server so the iframe is allowed.

## 9. Offline (later, with the mobile app)

The same folder can be bundled inside the Flutter patient app (in a WebView). Results then queue on
the device and are sent to `play.result` when the phone is back online. Each result already carries
`session_id` and `started_at`, so the server can reject duplicates.
