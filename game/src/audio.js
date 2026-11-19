// audio.js — every sound in the game is synthesised with WebAudio at play
// time: no audio files, nothing fetched. The context is created lazily on the
// first user gesture (browsers require it), and every function here is a safe
// no-op before that — including under Node, where there is no window at all.

let ctx = null;
let master = null;
let mutedFlag = false;
let sirenNodes = null;

export function initAudio() {
  if (ctx) return;
  if (typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = mutedFlag ? 0 : 0.45;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(m) {
  mutedFlag = m;
  if (master && ctx) master.gain.setValueAtTime(m ? 0 : 0.45, ctx.currentTime);
}

export function isMuted() {
  return mutedFlag;
}

// A short oscillator blip with an exponential decay envelope.
function tone(freq, dur, opts = {}) {
  if (!ctx || mutedFlag) return;
  const { type = 'sine', vol = 0.18, slideTo = null, delay = 0 } = opts;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A burst of filtered noise: crashes, and the nitro whoosh with a sweep.
function noiseBurst(dur, opts = {}) {
  if (!ctx || mutedFlag) return;
  const { vol = 0.2, freq = 800, q = 0.8, sweepTo = null, type = 'lowpass' } = opts;
  const t0 = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t0);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
}

export function sfx(name) {
  if (!ctx || mutedFlag) return;
  switch (name) {
    case 'pickup':
      tone(660, 0.12, { type: 'triangle', vol: 0.2 });
      tone(880, 0.14, { type: 'triangle', vol: 0.16, delay: 0.07 });
      break;
    case 'checkpoint':
      tone(520, 0.1, { type: 'triangle', vol: 0.18 });
      tone(780, 0.12, { type: 'triangle', vol: 0.18, delay: 0.06 });
      break;
    case 'cash':
      tone(988, 0.1, { type: 'square', vol: 0.1 });
      tone(1319, 0.16, { type: 'square', vol: 0.1, delay: 0.08 });
      break;
    case 'crash':
      noiseBurst(0.22, { vol: 0.3, freq: 500 });
      tone(90, 0.2, { type: 'sawtooth', vol: 0.12, slideTo: 45 });
      break;
    case 'steal':
      tone(340, 0.16, { type: 'sawtooth', vol: 0.1, slideTo: 190 });
      break;
    case 'enter':
      tone(440, 0.07, { type: 'triangle', vol: 0.14 });
      break;
    case 'busted':
      tone(392, 0.22, { type: 'square', vol: 0.12 });
      tone(311, 0.22, { type: 'square', vol: 0.12, delay: 0.2 });
      tone(233, 0.4, { type: 'square', vol: 0.12, delay: 0.4 });
      break;
    case 'fail':
      tone(300, 0.2, { type: 'triangle', vol: 0.16, slideTo: 210 });
      tone(210, 0.3, { type: 'triangle', vol: 0.14, delay: 0.16 });
      break;
    case 'whoosh':
      noiseBurst(0.45, { vol: 0.22, freq: 500, sweepTo: 2600, type: 'bandpass', q: 1.4 });
      break;
    default:
      break;
  }
}

// The proximity siren: a two-tone oscillator whose volume follows how close
// the nearest police car is. Started and stopped by updatePolice via world.
export function updateSiren(level, stars) {
  if (!ctx) return;
  const shouldPlay = !mutedFlag && stars > 0 && level > 0.04;
  if (shouldPlay && !sirenNodes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 760;
    lfo.type = 'sine';
    lfo.frequency.value = 0.7;
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, gain, lfo };
  }
  if (sirenNodes) {
    const target = shouldPlay ? level * 0.11 : 0;
    sirenNodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
    if (!shouldPlay && level <= 0.04) {
      const nodes = sirenNodes;
      sirenNodes = null;
      setTimeout(() => {
        try { nodes.osc.stop(); nodes.lfo.stop(); } catch { /* already stopped */ }
      }, 400);
    }
  }
}
