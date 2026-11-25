// Passes the microphone's raw samples to the page while recording (voice recorder, lab/record.js).
class RecTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("llp-rec-tap", RecTap);
