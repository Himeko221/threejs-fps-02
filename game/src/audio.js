// Vector Protocol — audio: WebAudio synthesized shots, hits, UI blips. No assets, no network.
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch (e) {
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function env(gainNode, t0, attack, decay, peak) {
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.linearRampToValueAtTime(peak, t0 + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function noiseBuffer(dur) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// positional gain from distance
function spatialGain(dist, ref = 30) {
  return Math.max(0, 1 - dist / ref) ** 1.4;
}

export function shot(dist = 0, heavy = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  const vol = 0.5 * spatialGain(dist);
  if (vol <= 0.001) return;
  g.gain.value = vol;
  g.connect(master);

  // noise crack
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.12);
  const bp = ctx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = heavy ? 2400 : 3800;
  src.connect(bp);
  bp.connect(g);
  env(g, t, 0.002, heavy ? 0.16 : 0.09, 1);
  src.start(t);
  src.stop(t + 0.2);

  // low thump
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(heavy ? 110 : 160, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.09);
  osc.connect(og);
  og.connect(master);
  env(og, t, 0.001, 0.1, vol * 0.8);
  osc.start(t);
  osc.stop(t + 0.15);
}

export function hit(headshot = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = headshot ? 1400 : 900;
  osc.connect(g);
  g.connect(master);
  env(g, t, 0.001, headshot ? 0.1 : 0.06, 0.25);
  osc.start(t);
  osc.stop(t + 0.15);
}

export function reloadClick() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2000;
  const g = ctx.createGain();
  src.connect(hp);
  hp.connect(g);
  g.connect(master);
  env(g, t, 0.001, 0.05, 0.3);
  src.start(t);
}

export function explosion(dist = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const vol = 0.9 * spatialGain(dist, 45);
  if (vol <= 0.001) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
  const g = ctx.createGain();
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  env(g, t, 0.004, 0.55, vol);
  src.start(t);
  src.stop(t + 0.7);
}

export function beep(freq = 880, dur = 0.07, vol = 0.2) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(master);
  env(g, t, 0.004, dur, vol);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function spikeBeep(urgent = false) {
  beep(urgent ? 1660 : 1180, 0.06, 0.18);
}

export function roundEnd(win) {
  beep(win ? 660 : 220, 0.3, 0.3);
  setTimeout(() => beep(win ? 990 : 165, 0.4, 0.3), 160);
}
