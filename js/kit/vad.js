// Voice activity detection with Silero VAD (MIT), a small neural network (2.3 MB) trained to tell
// human speech from noise, claps, music and silence. Runs in the browser with ONNX Runtime Web
// (MIT, WebAssembly, one thread); both are served from our own server. Nothing leaves the device.
//
// Use: a second way for the voice games to hear a voice, never a veto. Silero is trained on
// conversation: it catches soft and breathy speech and spoken words well, but in our tests it did not
// count steady held vowels ("aaa") or hums ("mmm") as speech (tests/e2e/out/vad-probe), and those are
// what Balloon Breeze and Sky Glide ask for.
//
// The microphone source feeds an audio worklet (vad-worklet.js) that makes 16 kHz chunks of 32 ms;
// each chunk gives a speech probability. `speaking` uses two thresholds and a short hangover, so a
// held sound does not flicker on and off.
const ORT_URL = new URL("../../vendor/onnxruntime/ort.wasm.min.mjs", import.meta.url).href;
const ORT_DIR = new URL("../../vendor/onnxruntime/", import.meta.url).href;
const MODEL_URL = new URL("../../models/silero_vad_v5.onnx", import.meta.url).href;
const WORKLET_URL = new URL("./vad-worklet.js", import.meta.url).href;

export const VAD_ON = 0.45, VAD_OFF = 0.25, VAD_HANG = 0.25;   // thresholds and hangover (s)

let ortPromise = null, modelPromise = null;
function loadOrt() {
  if (!ortPromise) ortPromise = import(ORT_URL).then((ort) => {
    ort.env.wasm.wasmPaths = ORT_DIR;
    ort.env.wasm.numThreads = 1;     // no cross-origin isolation needed
    ort.env.wasm.proxy = false;
    return ort;
  }).catch((e) => { ortPromise = null; throw e; });
  return ortPromise;
}
function loadModel() {
  if (!modelPromise) modelPromise = fetch(MODEL_URL).then((r) => { if (!r.ok) throw new Error("vad model " + r.status); return r.arrayBuffer(); })
    .catch((e) => { modelPromise = null; throw e; });
  return modelPromise;
}
// Start downloading the engine and model early (the hub calls this), so the first voice game is ready.
export function warmVad() { return Promise.all([loadOrt(), loadModel()]).catch(() => null); }

// Speech state from a stream of probabilities: on at VAD_ON, off only after VAD_HANG seconds under
// VAD_OFF. Pure (unit tested).
export function vadStep(state, prob, dt) {
  const s = state || { speaking: false, quiet: 0 };
  if (prob >= VAD_ON) return { speaking: true, quiet: 0 };
  if (!s.speaking) return s;
  if (prob < VAD_OFF) { const quiet = s.quiet + dt; return quiet >= VAD_HANG ? { speaking: false, quiet: 0 } : { speaking: true, quiet }; }
  return { speaking: true, quiet: 0 };
}

export class Vad {
  constructor() { this.ready = false; this.prob = 0; this.state = null; this.lastAt = 0; this.busy = false; this.pending = null; this.closed = false; }

  get speaking() { return !!(this.ready && this.state && this.state.speaking && performance.now() - this.lastAt < 400); }

  // ctx: the microphone's AudioContext; source: its MediaStreamAudioSourceNode.
  async start(ctx, source) {
    const [ort, model] = await Promise.all([loadOrt(), loadModel()]);
    if (this.closed) return;
    this.ort = ort;
    this.session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    this.sr = new ort.Tensor("int64", [16000n]);
    this.rnn = new ort.Tensor("float32", new Float32Array(256), [2, 1, 128]);
    await ctx.audioWorklet.addModule(WORKLET_URL);
    if (this.closed) return;
    this.node = new AudioWorkletNode(ctx, "llp-vad-resampler", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    // A silent path to the speakers keeps the worklet running in every browser.
    this.mute = ctx.createGain(); this.mute.gain.value = 0;
    this.node.connect(this.mute); this.mute.connect(ctx.destination);
    this.node.port.onmessage = (e) => this._chunk(e.data);
    this.connect(source);
    this.ready = true;
  }

  // Follow a new microphone (after a headset change).
  connect(source) {
    if (!this.node || !source) return;
    try { this.src && this.src.disconnect(this.node); } catch {}
    this.src = source;
    source.connect(this.node);
  }

  async _chunk(frame) {
    if (this.closed) return;
    if (this.busy) { this.pending = frame; return; }   // keep only the newest chunk if we fall behind
    this.busy = true;
    try {
      const out = await this.session.run({ input: new this.ort.Tensor("float32", frame, [1, 512]), state: this.rnn, sr: this.sr });
      this.rnn = out.stateN;
      this.prob = out.output.data[0];
      this.state = vadStep(this.state, this.prob, 0.032);
      this.lastAt = performance.now();
    } catch (e) { this.error = String(e && e.message || e); }
    this.busy = false;
    if (this.pending) { const p = this.pending; this.pending = null; this._chunk(p); }
  }

  // The game itself is speaking: forget the state so its voice is not carried into the child's turn.
  reset() { this.state = null; if (this.ort) this.rnn = new this.ort.Tensor("float32", new Float32Array(256), [2, 1, 128]); }

  close() {
    this.closed = true; this.ready = false;
    try { this.src && this.node && this.src.disconnect(this.node); } catch {}
    try { this.node && this.node.disconnect(); this.mute && this.mute.disconnect(); } catch {}
    try { this.session && this.session.release(); } catch {}
  }
}
