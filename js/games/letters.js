// AIR LETTERS: write letters in the air with a moving hand. The child moves an open hand along the
// letter. When it is finished the letter pops up with a picture and its word, and the game says it:
// "B for ball".
// The first five levels go through the alphabet in order: A to E, F to J, K to O, P to T, U to Z.
// Then the letter-shape levels follow: straight lines and small movements, curves, diagonals, harder
// letters and finally whole words, with bigger arm movements and less room for error.
// Sensor mode: camera hand tracking (on the device). Touch mode: drag a finger on the screen.
import { W, H, sky, hills, rng, lumi, label } from "../kit/draw.js";
import { createTraceGame, airToScreen, closestHand } from "../kit/tracegame.js";
import { sun, cloudLayer, rainbow, farBalloon, flock, butterflies, motes, swayTree, flowerRow } from "../kit/scene.js";

export const LETTER_WORDS = {
  A: ["Apple", "🍎"], B: ["Ball", "⚽"], C: ["Cat", "🐱"], D: ["Duck", "🦆"], E: ["Elephant", "🐘"], F: ["Fish", "🐟"],
  G: ["Grapes", "🍇"], H: ["Hat", "🎩"], I: ["Ice cream", "🍦"], J: ["Juice", "🧃"], K: ["Kite", "🪁"], L: ["Lion", "🦁"],
  M: ["Moon", "🌙"], N: ["Nest", "🪺"], O: ["Orange", "🍊"], P: ["Pig", "🐷"], Q: ["Queen", "👸"], R: ["Rabbit", "🐰"],
  S: ["Sun", "☀️"], T: ["Tree", "🌳"], U: ["Umbrella", "☂️"], V: ["Van", "🚐"], W: ["Watch", "⌚"], X: ["Xylophone", "🎹"],
  Y: ["Yo-yo", "🪀"], Z: ["Zebra", "🦓"],
};
const WORDS = { CAT: "🐱", SUN: "☀️", BUS: "🚌" };

const letterItem = (ch) => {
  const [word, pic] = LETTER_WORDS[ch];
  return { ch, label: ch, emoji: pic, text: `${ch} for ${word}`, say: `${ch}. ${ch} for ${word}.` };
};
// In the last level the letters spell a word, and the word pops up at its last letter.
const wordItems = (word) => [...word].map((ch, i) => (i < word.length - 1
  ? { ch, label: ch, emoji: "⭐", text: word.slice(0, i + 1) + "…", big: word.slice(0, i + 1), say: ch }
  : { ch, label: ch, emoji: WORDS[word], text: word, big: word, say: `${[...word].join(", ")}. ${word}.` }));

// The alphabet levels: the letters in order, five or six at a time.
const ALPHABET = ["ABCDE", "FGHIJ", "KLMNO", "PQRST", "UVWXYZ"];
const alphabetLevel = (letters, i) => ({
  name: `${letters[0]} to ${letters[letters.length - 1]}`,
  goal: `Write the letters in order: ${[...letters].join(", ")}.`,
  items: [...letters].map(letterItem),
  tolerance: 80 - i * 4, gain: 1.7 - i * 0.1,
  settings: { letters, shape: "alphabet" },
});

// gain: how much the camera's range is spread out (see applyGain). Lower means bigger arm movements.
export const LEVELS = [
  ...ALPHABET.map(alphabetLevel),
  { name: "Straight Lines", goal: "Move your open hand along straight letters: L, T, I, H, E. Small movements.", items: ["L", "T", "I", "H", "E"].map(letterItem), tolerance: 80, gain: 1.7, settings: { letters: "LTIHE", shape: "straight" } },
  { name: "Round Curves", goal: "Curved letters need a smooth hand: C, O, U, J, S.", items: ["C", "O", "U", "J", "S"].map(letterItem), tolerance: 72, gain: 1.5, settings: { letters: "COUJS", shape: "curve" } },
  { name: "Zig Zag", goal: "Slanted lines and sharp turns: A, V, W, N, Z, X. Bigger movements.", items: ["A", "V", "W", "N", "Z", "X"].map(letterItem), tolerance: 64, gain: 1.3, settings: { letters: "AVWNZX", shape: "diagonal" } },
  { name: "Tricky Letters", goal: "Lines and curves together: B, D, G, P, Q, R, K, Y, M, F.", items: ["B", "D", "G", "P", "Q", "R", "K", "Y", "M", "F"].map(letterItem), tolerance: 56, gain: 1.15, settings: { letters: "BDGPQRKYMF", shape: "mixed" } },
  { name: "Word Writer", goal: "Write whole words, letter by letter, with your whole arm: CAT, SUN, BUS.", items: ["CAT", "SUN", "BUS"].flatMap(wordItems), tolerance: 50, gain: 1, settings: { words: ["CAT", "SUN", "BUS"], shape: "words" } },
];

function drawBoard(c, t, level) {
  const li = level % 5;
  sky(c, ["#5ec8f2", "#55b7ec", "#6aa6e8", "#8a8fe6", "#9a7be0"][li], "#ffe5ec");
  sun(c, 150, 120, 62, t);
  rainbow(c, 1030, 640, 420, 0.5);
  cloudLayer(c, t, { n: 3, y: 60, gap: 90, speed: 10, scale: 0.7, seed: 21 + li, alpha: 0.7 });
  farBalloon(c, 240 + Math.sin(t * 0.12) * 60, 330, 1.2, t, "#ef476f");
  farBalloon(c, 1110 + Math.sin(t * 0.1 + 2) * 50, 250, 0.9, t, "#ffd166");
  flock(c, t, { y: 90, seed: 3 + li, speed: 36 });
  // alphabet blocks drift by in the distance
  const r = rng(11 + li), abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y0 = 180 + r() * 340, ch = abc[Math.floor(r() * 26)], sz = 34 + r() * 30, p = r() * 6;
    c.save(); c.globalAlpha = 0.38; c.translate(x + Math.sin(t * 0.4 + p) * 18, y0 + Math.cos(t * 0.5 + p) * 20); c.rotate(Math.sin(t * 0.6 + p) * 0.25);
    label(c, ch, 0, 0, { size: sz, weight: 800, shadow: false }); c.restore();
  }
  hills(c, { y: 650, amp: 62, color: "#95d5b2", seed: 5 + li, offset: t * 6 });
  swayTree(c, 110, 660, 0.9, t);
  swayTree(c, 1180, 650, 1.05, t, { leaf: "#74c69d" });
  hills(c, { y: 695, amp: 34, color: "#74c69d", seed: 9 + li, offset: t * 10 });
  flowerRow(c, t, { y: 712, n: 16, seed: 31 + li });
  butterflies(c, t, { n: 2, y: 560, band: 50, seed: 7 + li });
  motes(c, t, { n: 16, seed: 8, rise: 8, size: 3 });
}

const camAspect = (cx) => { const v = cx.tracker.video; return v && v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3; };

const def = {
  id: "letters",
  version: "6.0.0",
  title: "Air Letters",
  color: "#00b4d8",
  focus: "Write the alphabet in the air with your hand",
  input: "hands",
  maxHands: 1,
  inputLabel: "Camera (your hand, stays on this device)",
  touchLabel: "Drag a finger along the letter",
  skills: ["The alphabet", "Letter shapes", "Letter sounds", "Big arm moves"],
  howTo: [
    ["✋", "Hold up an open hand so the camera can see it."],
    ["🟡", "Move your hand to the yellow dot to start."],
    ["✏️", "Follow the line of the letter with your hand, like a magic pen."],
    ["🍎", "Finish the letter to see its picture: A for Apple!"],
  ],
  levels: LEVELS,

  drawPreview(c, li, t = 0) { drawBoard(c, t, li); lumi(c, W - 180, 520, 1.1, { t }); c.save(); c.font = '800 300px "Baloo 2", sans-serif'; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff"; c.fillText(["A", "F", "K", "P", "U", "L", "S", "A", "B", "CAT"][li] || "A", W / 2 - 60, H / 2); c.restore(); },

  create(ctx) {
    return createTraceGame(ctx, {
      background: drawBoard,
      colors: { ink: "#ef476f" },
      unitKey: "lettersUnit",
      showKey: "showHand",
      readCursor: (cx, g) => {
        // the middle of the hand: this game trains the whole arm
        const hands = cx.tracker.hands;
        if (!hands.length) return null;
        const h = closestHand(hands, g.cursor, (x) => x.palm);
        return { ...airToScreen(h.palm, g.gain, camAspect(cx)), hand: h.hand, ok: true };
      },
      fingerName: () => undefined,
    });
  },
};

export default def;
