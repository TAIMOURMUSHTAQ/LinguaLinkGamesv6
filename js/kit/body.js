// Reading body positions from the 33 pose points. Pure functions (unit tested).
// Every distance is measured in shoulder widths, so it works near or far from the camera and for any
// body size. Screen space is mirrored, so "left" here is the side on the left of the screen.
const IDX = { nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16, lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28 };
// 0.35: a wrist or knee that is half hidden or moving fast still counts (0.5 lost it too often).
const MIN_VIS = 0.35;

// Numbers for one video frame, or null when the shoulders and hips cannot be seen.
export function measureBody(pose) {
  if (!pose || !pose.present) return null;
  const pt = (k) => pose.points[IDX[k]];
  const seen = (k) => pt(k) && pt(k).v >= MIN_VIS;
  if (!["lShoulder", "rShoulder", "lHip", "rHip"].every(seen)) return null;
  const ls = pt("lShoulder"), rs = pt("rShoulder"), lh = pt("lHip"), rh = pt("rHip");
  const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (sw < 0.03) return null;
  const midS = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midH = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const out = {
    sw,
    midS, midH,
    torso: Math.hypot(midS.x - midH.x, midS.y - midH.y) / sw,
    lean: (midS.x - midH.x) / sw,        // + means the shoulders are toward the right of the screen
    hipY: midH.y,
  };
  // wrists: how high above the shoulders, and how far out from the body
  if (seen("lWrist")) { const w = pt("lWrist"); out.lWristUp = (ls.y - w.y) / sw; out.lWristOut = (midS.x - w.x) / sw; }
  if (seen("rWrist")) { const w = pt("rWrist"); out.rWristUp = (rs.y - w.y) / sw; out.rWristOut = (w.x - midS.x) / sw; }
  if (seen("nose")) out.noseY = pt("nose").y;
  // knees: how far below the hips, and ankles: how high
  if (seen("lKnee")) out.lKneeDrop = (pt("lKnee").y - lh.y) / sw;
  if (seen("rKnee")) out.rKneeDrop = (pt("rKnee").y - rh.y) / sw;
  if (seen("lAnkle")) out.lAnkleY = pt("lAnkle").y;
  if (seen("rAnkle")) out.rAnkleY = pt("rAnkle").y;
  return out;
}

const median = (list) => { const a = list.filter((v) => v != null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };

// The child standing still: the reference for squats and knee lifts.
export function baseFrom(frames) {
  return {
    hipY: median(frames.map((f) => f.hipY)),
    sw: median(frames.map((f) => f.sw)),
    noseY: median(frames.map((f) => f.noseY)),
    lKneeDrop: median(frames.map((f) => f.lKneeDrop)),
    rKneeDrop: median(frames.map((f) => f.rKneeDrop)),
    torso: median(frames.map((f) => f.torso)),
  };
}

// How far each move has been made, from 0 (not at all) to 1 or more (done). `need` scales how big the
// movement must be, level by level. Undefined parts of the body simply count as not done.
export function moveAmount(move, m, base, need = 1) {
  if (!m) return 0;
  const bKnee = (k) => (base && base[k]) || 1.6;
  switch (move) {
    case "reach": { // both hands high above the head
      if (m.lWristUp == null || m.rWristUp == null) return 0;
      return Math.min(m.lWristUp, m.rWristUp) / (0.8 * need);
    }
    case "wings": { // arms straight out at shoulder height
      if (m.lWristOut == null || m.rWristOut == null) return 0;
      const level = Math.max(Math.abs(m.lWristUp ?? 9), Math.abs(m.rWristUp ?? 9));
      if (level > 1.0) return 0;
      return Math.min(m.lWristOut, m.rWristOut) / (1.2 * need);
    }
    case "leanLeft": return -m.lean / (0.22 * need);
    case "leanRight": return m.lean / (0.22 * need);
    case "squat": { // hips drop, or the knees come up toward the hips
      if (!base) return 0;
      const drop = (m.hipY - base.hipY) / (base.sw || m.sw);
      return drop / (0.42 * need);
    }
    case "standLeft": return kneeLift(m.lKneeDrop, bKnee("lKneeDrop")) / need;  // that knee lifted
    case "standRight": return kneeLift(m.rKneeDrop, bKnee("rKneeDrop")) / need;
    default: return 0;
  }
}

function kneeLift(drop, standing) {
  if (drop == null) return 0;
  return (standing - drop) / (standing * 0.28);
}

// The score: every move counts, so stopping early never gives a high score.
export function scoreBody(done, total) {
  return total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
}
