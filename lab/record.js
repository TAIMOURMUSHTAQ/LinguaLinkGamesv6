// Voice recorder (internal): collects consented samples of the voice games' sounds for testing and
// training. Raw audio (no echo cancellation, noise suppression or gain control), kept in memory and
// exported as one ZIP of WAV files plus a manifest. Nothing is uploaded.
const SOUNDS = [
  { id: "aah", label: "A", hint: "“aaa” as in father: hold it for 3 seconds" },
  { id: "ehh", label: "E", hint: "“ehh” as in egg" },
  { id: "eee", label: "I", hint: "“eee” as in see" },
  { id: "ooo", label: "O", hint: "“ooo” as in go" },
  { id: "uuu", label: "U", hint: "“uuu” as in moon" },
  { id: "mmm", label: "M", hint: "hum “mmm” with the lips closed" },
  { id: "sss", label: "S", hint: "hiss “sss” like a snake" },
];
const TAKES = 2, SECONDS = 3, CONSENT_VERSION = "2026-11";
const $ = (id) => document.getElementById(id);
const clips = [];
let ctx, src, tap, step = 0, current = null, recording = null, player = null;

const plan = SOUNDS.flatMap((s) => Array.from({ length: TAKES }, (_, i) => ({ ...s, take: i + 1 })));
const speaker = () => ({ code: $("code").value.trim().toUpperCase(), age_group: $("age").value, sex: $("sex").value || null, first_language: $("lang").value, device: $("device").value, microphone: $("micType").value });
const ready = () => $("consent").checked && /^[A-Z0-9-]{2,8}$/.test(speaker().code) && speaker().age_group;
function refresh() {
  $("start").disabled = !ready() || !!ctx;
  $("rec").disabled = !ctx || !!recording || step >= plan.length;
  $("play").disabled = !current; $("redo").disabled = !current; $("next").disabled = !current;
  $("export").disabled = !clips.length;
  const p = plan[step];
  $("prompt").textContent = p ? `${p.label}  (take ${p.take})` : "All done";
  $("hint").textContent = p ? p.hint : "Download the ZIP below.";
  if (!ready()) $("status").textContent = "Tick consent, enter a speaker code (letters and digits, no names) and an age group.";
  else if (!ctx) $("status").textContent = "Start the microphone.";
  else $("status").textContent = `Clip ${Math.min(step + 1, plan.length)} of ${plan.length}. Press Record, then make the sound until the bar is full.`;
}
["consent", "code", "age"].forEach((id) => $(id).addEventListener("input", refresh));

$("start").onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
  ctx = new AudioContext();
  await ctx.audioWorklet.addModule("rec-worklet.js");
  src = ctx.createMediaStreamSource(stream);
  tap = new AudioWorkletNode(ctx, "llp-rec-tap");
  const mute = ctx.createGain(); mute.gain.value = 0;
  src.connect(tap); tap.connect(mute); mute.connect(ctx.destination);
  tap.port.onmessage = (e) => {
    const ch = e.data;
    let peak = 0; for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    $("meter").style.width = Math.min(100, peak * 140) + "%";
    if (recording) { recording.parts.push(ch); recording.n += ch.length; if (recording.n >= SECONDS * ctx.sampleRate) finish(); }
  };
  refresh();
};

$("rec").onclick = () => { current = null; recording = { parts: [], n: 0 }; $("status").textContent = "Recording…"; refresh(); };
function finish() {
  const pcm = new Float32Array(recording.n); let o = 0;
  for (const p of recording.parts) { pcm.set(p, o); o += p.length; }
  recording = null;
  current = { pcm, rate: ctx.sampleRate };
  $("status").textContent = "Play it back. Keep it if the sound is right and clear, or redo it.";
  refresh();
}
$("play").onclick = () => { if (!current) return; if (player) player.pause(); player = new Audio(URL.createObjectURL(new Blob([wav(current.pcm, current.rate)], { type: "audio/wav" }))); player.play(); };
$("redo").onclick = () => { current = null; refresh(); };
$("next").onclick = () => {
  const p = plan[step], s = speaker();
  const file = `${s.code}_${p.id}_t${p.take}.wav`;
  clips.push({ file, data: wav(current.pcm, current.rate), meta: { file, sound: p.id, letter: p.label, take: p.take, seconds: +(current.pcm.length / current.rate).toFixed(2), sample_rate: current.rate, ...s } });
  const tr = document.createElement("tr");
  for (const v of [file, p.label, p.take, (current.pcm.length / current.rate).toFixed(1) + " s"]) { const td = document.createElement("td"); td.textContent = v; tr.appendChild(td); }
  $("list").appendChild(tr);
  current = null; step++; refresh();
};
$("clear").onclick = () => { clips.length = 0; $("list").textContent = ""; step = 0; current = null; refresh(); };
$("export").onclick = () => {
  const manifest = { tool: "LinguaLink Play voice recorder", consent_version: CONSENT_VERSION, recorded_on: new Date().toISOString().slice(0, 10), processing: "raw: no echo cancellation, noise suppression or gain control", clips: clips.map((c) => c.meta) };
  const files = [...clips.map((c) => ({ name: c.file, data: c.data })), { name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) }];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([zip(files)], { type: "application/zip" }));
  a.download = `voices_${speaker().code || "batch"}_${manifest.recorded_on}.zip`;
  a.click();
};

// 16-bit mono WAV
function wav(pcm, rate) {
  const b = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); b.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, rate, true); b.setUint32(28, rate * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); str(36, "data"); b.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) b.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
  return new Uint8Array(b.buffer);
}

// A minimal ZIP writer (stored, no compression)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(files) {
  const enc = new TextEncoder(), local = [], central = []; let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    local.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...local, ...central, new Uint8Array(e.buffer)]);
}
refresh();
