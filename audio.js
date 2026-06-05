/* ============================================================
   audio.js — original synthesized theme song + game SFX
   Pure Web Audio API. No external files, nothing copyrighted:
   the loop is composed on the fly from oscillators + noise.
   Exposes a global `Sound`.
   ============================================================ */
const Sound = (function () {
  let ctx = null, master, musicGain, sfxGain;
  let on = true, started = false;
  let timer = null, step = 0, nextTime = 0, noiseBuf = null;
  const changeCbs = [];

  const TEMPO  = 130;
  const EIGHTH = (60 / TEMPO) / 2;            // seconds per eighth note
  const m2f    = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ── composition ──────────────────────────────────────────
     Cheerful 8-bar loop:  C  G  Am  F  C  G  F  G            */
  const CHORDS = [
    [60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72],
    [60, 64, 67], [67, 71, 74], [65, 69, 72], [67, 71, 74],
  ];
  const ROOTS   = [48, 43, 45, 41, 48, 43, 41, 43];
  const LEADPAT = [0, 1, 2, 1, 0, 2, 1, 2];   // bouncy up/down arpeggio

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master    = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(master);
    sfxGain   = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /* ── instruments ─────────────────────────────────────────── */
  function lead(midi, t, dur) {
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    filt.connect(g).connect(musicGain);
    [+6, -6].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = m2f(midi);
      o.detune.value = cents;
      o.connect(filt); o.start(t); o.stop(t + dur + 0.02);
    });
  }
  function bass(midi, t, dur) {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = m2f(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(musicGain); o.start(t); o.stop(t + dur + 0.02);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(musicGain); o.start(t); o.stop(t + 0.2);
  }
  function noise(t, dur, hpFreq, vol) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hpFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(musicGain); s.start(t); s.stop(t + dur + 0.02);
  }
  const hat   = (t) => noise(t, 0.035, 7000, 0.12);
  const snare = (t) => { noise(t, 0.12, 1800, 0.22); };

  /* ── sequencer ───────────────────────────────────────────── */
  function scheduleStep(s, t) {
    const bar = Math.floor(s / 8) % 8, e = s % 8;
    lead(CHORDS[bar][LEADPAT[e]], t, EIGHTH * 0.9);
    if (e === 0 || e === 4) { bass(ROOTS[bar] + (e === 4 ? 12 : 0), t, EIGHTH * 1.8); kick(t); }
    if (e === 2 || e === 6) snare(t);
    hat(t);
  }
  function scheduler() {
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(step, nextTime);
      nextTime += EIGHTH;
      step = (step + 1) % 64;
    }
  }
  function startMusic() {
    if (!ctx) return;
    musicGain.gain.cancelScheduledValues(ctx.currentTime);
    musicGain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.4);
    if (!timer) { step = 0; nextTime = ctx.currentTime + 0.08; timer = setInterval(scheduler, 25); }
  }
  function stopMusic() {
    if (musicGain) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    if (timer) { clearInterval(timer); timer = null; }
  }

  /* ── SFX ──────────────────────────────────────────────────── */
  function tone(type, midi, dur, peak, when) {
    if (!ctx) return;
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = m2f(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(sfxGain); o.start(t); o.stop(t + dur + 0.02);
  }
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t;
    const Y = (t) => ((ay * t + by) * t + cy) * t;
    const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      let t = x;
      for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-4) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      return Y(Math.max(0, Math.min(1, t)));
    };
  }

  return {
    ensure() {                          // call from a user gesture to unlock audio
      init();
      if (ctx.state === "suspended") ctx.resume();
      if (!started) { started = true; if (on) startMusic(); }
    },
    isOn: () => on,
    onChange(cb) { changeCbs.push(cb); },
    setOn(v) {
      on = v;
      if (on) { this.ensure(); startMusic(); } else { stopMusic(); }
      changeCbs.forEach((c) => c(on));
    },
    toggle() { this.setOn(!on); },

    click() { if (on) tone("sine", 72, 0.05, 0.18); },
    whoosh() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
      f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.35);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      s.connect(f).connect(g).connect(sfxGain); s.start(t); s.stop(t + 0.45);
    },
    // ratcheting ticks that slow down in lockstep with the wheel's easing
    spinTicks(totalDeg, segCount, durMs) {
      if (!on || !ctx) return;
      const seg = 360 / segCount;
      const ease = cubicBezier(0.16, 0.84, 0.28, 1);
      const steps = Math.ceil(durMs / 16);
      let nextBoundary = seg, lastAt = -100;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const deg = totalDeg * ease(frac);
        while (deg >= nextBoundary) {
          const at = frac * durMs;
          if (at - lastAt >= 42) {                       // keep ticks crisp, not a buzz
            lastAt = at;
            setTimeout(() => tone("square", 88 + (Math.random() * 4 | 0), 0.03, 0.16), at);
          }
          nextBoundary += seg;
        }
      }
    },
    win() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      [72, 76, 79, 84].forEach((n, i) => tone("square", n, 0.18, 0.16, t + i * 0.09));
      tone("triangle", 84, 0.5, 0.1, t + 0.36);          // sparkle tail
    },
    complete() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone("square", n, 0.22, 0.16, t + i * 0.08));
      [72, 76, 79].forEach((n) => tone("triangle", n, 0.9, 0.1, t + 0.6));
    },
  };
})();
