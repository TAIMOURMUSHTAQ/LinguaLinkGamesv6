// Audio worklet for the voice activity detector (vad.js): turns the microphone's audio into 16 kHz
// chunks of 512 samples (32 ms), the size Silero VAD expects, and posts each chunk to the page.
// Runs on the audio thread; nothing is stored or sent anywhere.
class VadResampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;  // input samples per output sample (3 at 48 kHz)
    this.pos = 0;                      // position in the input stream of the next output sample
    this.lp = 0;                       // a light low-pass before downsampling
    this.prev = 0;
    this.chunk = new Float32Array(512);
    this.n = 0;
    this.a = Math.exp((-2 * Math.PI * 7000) / sampleRate);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.lp = this.a * this.lp + (1 - this.a) * ch[i];
      // linear interpolation between the previous and this (filtered) sample
      while (this.pos <= 1) {
        this.chunk[this.n++] = this.prev + (this.lp - this.prev) * this.pos;
        this.pos += this.ratio;
        if (this.n === 512) { this.port.postMessage(this.chunk, [this.chunk.buffer]); this.chunk = new Float32Array(512); this.n = 0; }
      }
      this.pos -= 1;
      this.prev = this.lp;
    }
    return true;
  }
}
registerProcessor("llp-vad-resampler", VadResampler);
