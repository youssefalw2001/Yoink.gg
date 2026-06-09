/**
 * YOINK.GG — Web Audio Sound Engine
 *
 * Zero dependencies. All sounds are synthesized programmatically using
 * the Web Audio API. No audio files to load, no network requests.
 *
 * Each sound is a pure function that creates and plays a one-shot
 * AudioBufferSourceNode or OscillatorNode graph, then disposes itself.
 *
 * GPU/performance rules observed:
 *  - AudioContext is created lazily (after first user gesture)
 *  - All nodes are disconnected and GC'd after playback
 *  - prefers-reduced-motion also silences sounds when set
 */

let _ctx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

/** Master volume 0–1 — can be toggled by the mute button */
let _volume = 0.7;
export function setVolume(v: number) { _volume = Math.max(0, Math.min(1, v)); }
export function getVolume() { return _volume; }
export function isMuted() { return _volume === 0; }

function masterGain(ac: AudioContext): GainNode {
  const g = ac.createGain();
  g.gain.value = _volume;
  g.connect(ac.destination);
  return g;
}

function prefersReduced(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── YOINK crash ─────────────────────────────────────────────────────────────
// A punchy low-end thud + metallic coin shimmer
export function playYoink() {
  if (prefersReduced() || _volume === 0) return;
  try {
    const ac = ctx();
    const master = masterGain(ac);
    const now = ac.currentTime;

    // Sub thud
    const osc = ac.createOscillator();
    const thudGain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    thudGain.gain.setValueAtTime(0.9, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(thudGain); thudGain.connect(master);
    osc.start(now); osc.stop(now + 0.22);

    // Metallic shimmer — noise burst
    const bufLen = ac.sampleRate * 0.12;
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const bandpass = ac.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 4200;
    bandpass.Q.value = 1.8;
    const noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    noise.connect(bandpass); bandpass.connect(noiseGain); noiseGain.connect(master);
    noise.start(now); noise.stop(now + 0.12);

    // High tick
    const tick = ac.createOscillator();
    const tickGain = ac.createGain();
    tick.type = "square";
    tick.frequency.setValueAtTime(1200, now);
    tickGain.gain.setValueAtTime(0.25, now);
    tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    tick.connect(tickGain); tickGain.connect(master);
    tick.start(now); tick.stop(now + 0.05);
  } catch { /* silent fail */ }
}

// ─── King crown — when YOU become king ───────────────────────────────────────
// Ascending arpeggio — regal, victorious
export function playCrown() {
  if (prefersReduced() || _volume === 0) return;
  try {
    const ac = ctx();
    const master = masterGain(ac);
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const now = ac.currentTime + i * 0.07;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.4, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(g); g.connect(master);
      osc.start(now); osc.stop(now + 0.22);
    });
  } catch { /* silent fail */ }
}

// ─── Win fanfare — GSAP reveal fires this ────────────────────────────────────
// Full triumphant chord + rising sweep
export function playWin() {
  if (prefersReduced() || _volume === 0) return;
  try {
    const ac = ctx();
    const master = masterGain(ac);
    const now = ac.currentTime;

    // Rising sweep
    const sweep = ac.createOscillator();
    const sweepGain = ac.createGain();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(200, now);
    sweep.frequency.exponentialRampToValueAtTime(1600, now + 0.6);
    sweepGain.gain.setValueAtTime(0.0, now);
    sweepGain.gain.linearRampToValueAtTime(0.18, now + 0.05);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    const sweepFilter = ac.createBiquadFilter();
    sweepFilter.type = "lowpass";
    sweepFilter.frequency.setValueAtTime(800, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(4000, now + 0.6);
    sweep.connect(sweepFilter); sweepFilter.connect(sweepGain); sweepGain.connect(master);
    sweep.start(now); sweep.stop(now + 0.6);

    // Chord hit at peak
    const chordFreqs = [523, 659, 784]; // C E G
    chordFreqs.forEach((f) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + 0.55);
      g.gain.linearRampToValueAtTime(0.3, now + 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
      o.connect(g); g.connect(master);
      o.start(now + 0.55); o.stop(now + 1.4);
    });

    // Coin shimmer
    const bufLen = ac.sampleRate * 0.35;
    const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5000;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.6, now + 0.58);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    noise.connect(hp); hp.connect(ng); ng.connect(master);
    noise.start(now + 0.58); noise.stop(now + 0.95);
  } catch { /* silent fail */ }
}

// ─── Countdown tick — fires every second below 10s ───────────────────────────
export function playTick(critical = false) {
  if (prefersReduced() || _volume === 0) return;
  try {
    const ac = ctx();
    const master = masterGain(ac);
    const now = ac.currentTime;
    const freq = critical ? 880 : 660;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(critical ? 0.35 : 0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (critical ? 0.09 : 0.07));
    osc.connect(g); g.connect(master);
    osc.start(now); osc.stop(now + 0.1);
  } catch { /* silent fail */ }
}

// ─── Cooldown blocked beep — when player clicks during cooldown ───────────────
export function playCooldownBlock() {
  if (prefersReduced() || _volume === 0) return;
  try {
    const ac = ctx();
    const master = masterGain(ac);
    const now = ac.currentTime;
    // Two descending tones — "nope"
    [440, 330].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.2, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.08);
      o.connect(g); g.connect(master);
      o.start(now + i * 0.06); o.stop(now + i * 0.06 + 0.08);
    });
  } catch { /* silent fail */ }
}

// ─── Level up fanfare ─────────────────────────────────────────────────────────
export function playLevelUp() {
  if (prefersReduced() || _volume === 0) return;
  try {
    const ac = ctx();
    const master = masterGain(ac);
    // Classic 4-note level-up jingle
    const seq = [523, 659, 784, 1047, 1318];
    seq.forEach((f, i) => {
      const now = ac.currentTime + i * 0.10;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = i === seq.length - 1 ? "triangle" : "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o.connect(g); g.connect(master);
      o.start(now); o.stop(now + 0.18);
    });
  } catch { /* silent fail */ }
}

// ─── Shop purchase ────────────────────────────────────────────────────────────
export function playPurchase() {
  if (prefersReduced() || _volume === 0) return;
  try {
    const ac = ctx();
    const master = masterGain(ac);
    const now = ac.currentTime;
    // Satisfying "cha-ching"
    [880, 1100, 1320].forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.14);
      o.connect(g); g.connect(master);
      o.start(now + i * 0.055); o.stop(now + i * 0.055 + 0.14);
    });
  } catch { /* silent fail */ }
}
