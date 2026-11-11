import test from "node:test";
import assert from "node:assert/strict";
import { Adaptive } from "../js/kit/adaptive.js";
import { adjustSuggestion } from "../js/kit/results.js";
import { cueName } from "../js/games/garden.js";
import { moveActive } from "../js/games/mouth.js";

test("gets harder after a run of successes, easier after a run of misses", () => {
  const changes = [];
  const a = new Adaptive({ upAfter: 3, downAfter: 2, onChange: (c) => changes.push(c.direction) });
  a.success(); a.success();
  assert.equal(a.step, 0);
  a.success();
  assert.equal(a.step, -1);
  a.miss(); a.miss();
  assert.equal(a.step, 0);
  a.miss(); a.miss();
  assert.equal(a.step, 1);
  assert.deepEqual(changes, ["harder", "easier", "easier"]);
});

test("a miss resets the success streak and the other way round", () => {
  const a = new Adaptive({ upAfter: 3, downAfter: 2 });
  a.success(); a.success(); a.miss(); a.success(); a.success();
  assert.equal(a.step, 0);
  a.miss(); a.success(); a.miss();
  assert.equal(a.step, 0);
});

test("steps stay inside the limits", () => {
  const a = new Adaptive({ upAfter: 1, downAfter: 1 });
  for (let i = 0; i < 10; i++) a.miss();
  assert.equal(a.step, 2);
  for (let i = 0; i < 10; i++) a.success();
  assert.equal(a.step, -2);
  const s = a.summary();
  assert.equal(s.easiest_step, 2);
  assert.equal(s.hardest_step, -2);
});

test("disabled adaptive never changes", () => {
  const a = new Adaptive({ enabled: false, upAfter: 1, downAfter: 1 });
  a.miss(); a.miss(); a.success(); a.success();
  assert.equal(a.step, 0);
  assert.equal(a.summary().enabled, false);
});

test("scale moves values in the right direction", () => {
  const a = new Adaptive({ upAfter: 1, downAfter: 1 });
  assert.equal(a.scale(100, 0.2, 0.1), 100);
  a.miss(); // easier, step +1
  assert.equal(Math.round(a.scale(100, 0.2, 0.1)), 120);
  assert.equal(Math.round(a.scale(4, -0.15, -0.12) * 100) / 100, 3.4); // hold target shorter when easier
  a.success(); a.success(); // step -1
  assert.equal(Math.round(a.scale(100, 0.2, 0.1)), 90);
  assert.equal(Math.round(a.scale(4, -0.15, -0.12) * 100) / 100, 4.48); // hold target longer when harder
});

test("no 'next level' suggestion if the level had to be made easier", () => {
  assert.equal(adjustSuggestion("next", 1), "stay");
  assert.equal(adjustSuggestion("next", 0), "next");
  assert.equal(adjustSuggestion("next", -1), "next");
  assert.equal(adjustSuggestion("easier", 2), "easier");
  // a level that was stopped early never suggests moving up
  assert.equal(adjustSuggestion("next", 0, false), "unfinished");
  assert.equal(adjustSuggestion("easier", 0, false), "easier");
});

test("Word Garden cue names follow the cueing hierarchy", () => {
  assert.deepEqual([2, 1, 0, -1, -2].map(cueName), ["model_aloud", "model_aloud", "written_highlighted", "written", "picture_only"]);
});

test("Fish Feast threshold scale makes moves easier or harder to trigger", () => {
  const base = { jawOpen: 0, smile: 0, pucker: 0, puff: 0 };
  const face = { jawOpen: 0.27, smile: 0, pucker: 0, puff: 0 };
  assert.equal(moveActive("open", face, base, 1), false);
  assert.equal(moveActive("open", face, base, 0.85), true);
});
