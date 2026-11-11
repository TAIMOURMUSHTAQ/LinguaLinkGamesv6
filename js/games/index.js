// Game registry. To add a game: create js/games/<id>.js exporting the same shape, then list it here.
import breeze from "./breeze.js";
import glide from "./glide.js";
import mouth from "./mouth.js";
import firefly from "./firefly.js";
import garden from "./garden.js";
import letters from "./letters.js";
import numbers from "./numbers.js";
import balance from "./balance.js";
import body from "./body.js";
import pitch from "./pitch.js";

export const GAMES = [breeze, glide, pitch, mouth, firefly, garden, letters, numbers, balance, body];
export const byId = Object.fromEntries(GAMES.map((g) => [g.id, g]));
