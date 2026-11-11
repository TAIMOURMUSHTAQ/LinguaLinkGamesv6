// Adaptive difficulty inside a level.
// The game reports each attempt as a success or a miss. After a run of successes the game gets a
// little harder; after a run of misses it gets a little easier. Changes are small, bounded, and
// every change is recorded so the therapist can see exactly what happened.
//
// step:  -2  -1   0   +1  +2
//        harder  normal  easier
export class Adaptive {
  constructor({ enabled = true, upAfter = 3, downAfter = 2, minStep = -2, maxStep = 2, onChange = () => {} } = {}) {
    this.enabled = enabled;
    this.upAfter = upAfter;       // successes in a row before it gets harder
    this.downAfter = downAfter;   // misses in a row before it gets easier
    this.minStep = minStep;
    this.maxStep = maxStep;
    this.onChange = onChange;
    this.step = 0;
    this.wins = 0;
    this.misses = 0;
    this.changes = [];
    this.easiest = 0;
    this.hardest = 0;
  }

  success(t = 0) {
    this.misses = 0;
    this.wins++;
    if (this.enabled && this.wins >= this.upAfter && this.step > this.minStep) {
      this.wins = 0;
      return this._set(this.step - 1, "harder", t);
    }
    return null;
  }

  miss(t = 0) {
    this.wins = 0;
    this.misses++;
    if (this.enabled && this.misses >= this.downAfter && this.step < this.maxStep) {
      this.misses = 0;
      return this._set(this.step + 1, "easier", t);
    }
    return null;
  }

  _set(step, direction, t) {
    this.step = step;
    this.easiest = Math.max(this.easiest, step);
    this.hardest = Math.min(this.hardest, step);
    const change = { t, direction, step };
    this.changes.push(change);
    this.onChange(change);
    return change;
  }

  // Scale a value: `easyPer` per easier step, `hardPer` per harder step (fractions, e.g. 0.15).
  scale(value, easyPer, hardPer) {
    if (this.step > 0) return value * (1 + easyPer * this.step);
    if (this.step < 0) return value * (1 + hardPer * this.step);
    return value;
  }

  label() {
    if (this.step > 0) return "easier";
    if (this.step < 0) return "harder";
    return "normal";
  }

  summary() {
    return {
      enabled: this.enabled,
      final_step: this.step,
      final: this.label(),
      made_easier: this.changes.filter((c) => c.direction === "easier").length,
      made_harder: this.changes.filter((c) => c.direction === "harder").length,
      easiest_step: this.easiest,
      hardest_step: this.hardest,
    };
  }
}
