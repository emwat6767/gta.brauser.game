//# sourceURL=ufc/audio.js
(function () {
'use strict';
const UFC = window.UFC;

// All audio is synthesized with WebAudio, so the game stays one file.
class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.enabled = true; this.musicEnabled = true; this.volume = 0.8;
    this.crowdGain = null;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._startCrowd();
    return true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _noise(t, dur, filterType, freq, q, gain, freqEnd, dest) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 1;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  _tone(t, dur, type, f0, f1, gain, dest) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  whoosh(power) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.12 + power * 0.006, 'bandpass', 900, 1.2, 0.05 + power * 0.006, 2600);
  }

  impact(power, zone, blocked) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = Math.min(1.5, power / 12);
    if (blocked) {
      this._noise(t, 0.08, 'bandpass', 1500, 2, 0.25 + p * 0.2);
      this._tone(t, 0.07, 'triangle', 240, 120, 0.15 + p * 0.1);
      return;
    }
    // hard and heavy: sharp crack on top, deep thump underneath and a short metallic ring
    this._noise(t, 0.035, 'highpass', 2400, 0.7, 0.55 + p * 0.5);
    this._tone(t, 0.09, 'square', 320, 90, 0.16 + p * 0.16);
    if (zone === 'head') {
      this._noise(t, 0.2, 'lowpass', 2800, 0.8, 0.75 + p * 0.6, 380);
      this._tone(t, 0.24, 'sine', 160, 42, 0.75 + p * 0.6);
      this._noise(t + 0.004, 0.06, 'highpass', 3200, 0.7, 0.3 + p * 0.3);
      this._tone(t, 0.42 + p * 0.3, 'sine', 1850, 1650, 0.05 + p * 0.06);
      this._tone(t, 0.3 + p * 0.25, 'sine', 2960, 2800, 0.03 + p * 0.04);
    } else if (zone === 'body') {
      this._noise(t, 0.26, 'lowpass', 950, 1.0, 0.8 + p * 0.55, 140);
      this._tone(t, 0.3, 'sine', 100, 34, 0.85 + p * 0.6);
      this._tone(t, 0.25, 'sine', 1200, 1050, 0.03 + p * 0.03);
    } else {
      this._noise(t, 0.16, 'bandpass', 1800, 1.4, 0.8 + p * 0.5, 500);
      this._tone(t, 0.16, 'sine', 190, 60, 0.6 + p * 0.4);
      this._tone(t, 0.25, 'sine', 1500, 1350, 0.03 + p * 0.03);
    }
    if (power > 13) this._tone(t, 0.5, 'sine', 55, 30, 0.7);   // the floor-shaking one
  }

  // Steady ringing while the player's head is foggy (0 = off)
  setDaze(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (level < 0.4) { if (this._dz) this._dz.g.gain.setTargetAtTime(0, t, 0.3); this._dzLevel = 0; return; }
    if (!this._dz) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 4000; g.gain.value = 0; o.connect(g); g.connect(this.master); o.start();
      this._dz = { o, g };
    }
    this._dz.g.gain.setTargetAtTime(0.012 + level * 0.05, t, 0.25);
    this._dz.o.frequency.setTargetAtTime(3900 + level * 600 + Math.sin(t * 3) * 80, t, 0.2);
    this._dzLevel = level;
  }

  // Ringing in the ears after a big blow: a thin whine while the arena drops out.
  earRing(level = 0.6) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, dur = 1.4 + level * 2.2;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(4300 + Math.random() * 500, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.028 + level * 0.06, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    if (this.crowdGain) { this.crowdGain.gain.cancelScheduledValues(t); this.crowdGain.gain.setTargetAtTime(0.004, t, 0.03); this._crowdMute = t + 0.5 + level * 1.4; }
  }

  flow() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 0.5, 'sawtooth', 110, 440, 0.06);
    this._tone(t + 0.05, 0.6, 'sine', 220, 880, 0.12);
    this._noise(t, 0.6, 'bandpass', 800, 1, 0.1, 3000);
  }

  step(intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.05, 'bandpass', 2400 + Math.random() * 1200, 3, 0.02 + intensity * 0.02);
  }

  bell(times = 1) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime;
    for (let n = 0; n < times; n++) {
      const t = t0 + n * 0.32;
      [[830, 0.5], [1245, 0.25], [2080, 0.12], [2710, 0.08]].forEach(([f, g]) => this._tone(t, 1.4, 'sine', f, f * 0.995, g * 0.5));
    }
  }

  cheer(amount) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dur = 1.2 + amount * 2.2;
    this._noise(t, dur, 'bandpass', 700, 0.5, 0.08 + amount * 0.35, 1100);
    this._noise(t + 0.05, dur * 0.8, 'bandpass', 1900, 0.8, 0.04 + amount * 0.15, 1300);
  }

  // Deep arena hit for entrances, announcements and title moments.
  horn(level = 1) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    this._tone(t, 1.6, 'sawtooth', 62, 48, 0.22 * level);
    this._tone(t + 0.02, 1.4, 'sine', 124, 92, 0.16 * level);
    this._tone(t + 0.05, 1.1, 'triangle', 186, 150, 0.08 * level);
    this._noise(t, 1.2, 'lowpass', 400, 0.8, 0.12 * level, 90);
  }

  // ----------------------------------------------------------------------
  // Original entrance music, synthesised here: no sampled or copyrighted
  // tracks. Each archetype gets its own groove (tempo, key, drums, bass),
  // built as intro -> buildup -> drop and looped until the walkout ends.
  // ----------------------------------------------------------------------
  startMusic(style = 'energetic', level = 1) {
    if (!this.musicEnabled || !this.ensure()) return;
    this.stopMusic(0.08);
    const c = this.ctx;
    const bus = c.createGain(); bus.gain.value = 0.0001; bus.connect(this.master);
    const S = Audio.MUSIC[style] || Audio.MUSIC.energetic;
    const t0 = c.currentTime + 0.06;
    const m = { bus, S, bar: 0, next: t0, timer: null, stopped: false };
    this.music = m;
    bus.gain.setTargetAtTime(S.gain * level, t0, 0.5);
    const spb = 60 / S.bpm;
    const pump = () => {
      if (m.stopped) return;
      const ahead = c.currentTime + 0.6;
      let guard = 0;
      while (m.next < ahead && guard++ < 8) { this._musicBar(m, m.bar++, m.next, spb); m.next += spb * 4; }
    };
    pump();
    m.timer = setInterval(pump, 130);
  }

  _musicBar(m, bar, t, spb) {
    const S = m.S, bus = m.bus;
    const b = (i) => t + i * spb;
    const loop = bar < S.intro ? 'intro' : bar < S.intro + 2 ? 'build' : 'drop';
    const root = S.root, fifth = root * 1.5, oct = root * 2;
    const step = S.line[(bar - S.intro + 128) % S.line.length];
    const note = root * Math.pow(2, step / 12);

    if (loop === 'intro') {
      // sparse: a pulse and a pad, the arena is still dark
      this._tone(b(0), spb * 1.6, 'sine', root, root, 0.5, bus);
      this._tone(b(2), spb * 1.4, 'sine', fifth, fifth, 0.32, bus);
      if (bar % 2 === 1) this._noise(b(3.5), 0.18, 'highpass', 6000, 0.7, 0.10, 9000, bus);
      this._pad(b(0), spb * 3.6, root * 2, 0.10, bus);
      return;
    }
    if (loop === 'build') {
      // riser + rolling snare into the drop
      const n = bar === S.intro ? 8 : 16;
      for (let i = 0; i < n; i++) this._snareHit(b(i * 4 / n), 0.10 + i / n * 0.3, bus);
      this._noise(t, spb * 4, 'bandpass', 500, 1.2, 0.16, 7000, bus);
      this._kick(b(0), 0.9, bus); this._kick(b(2), 0.9, bus);
      this._pad(b(0), spb * 3.8, root * 2, 0.12, bus);
      return;
    }
    // drop: the groove
    S.kick.forEach((k) => this._kick(b(k), 1, bus));
    S.snare.forEach((k) => this._snareHit(b(k), 0.42, bus));
    for (let i = 0; i < 8; i++) if (S.hat[i % S.hat.length]) this._hat(b(i * 0.5), i % 2 ? 0.05 : 0.09, bus);
    // bass line
    this._bass(b(0), spb * 1.4, note / 2, 0.5, bus);
    this._bass(b(1.5), spb * 0.7, note / 2, 0.36, bus);
    this._bass(b(2.5), spb * 1.2, (note / 2) * (S.swing ? 1.12 : 1), 0.42, bus);
    if (bar % 4 === 3) this._bass(b(3.5), spb * 0.45, oct / 2, 0.3, bus);
    // stabs / lead
    if (S.stab) {
      this._stab(b(0), spb * 0.7, [note, note * 1.5, note * (S.minor ? 1.19 : 1.26)], 0.2, bus);
      if (bar % 2 === 1) this._stab(b(2.5), spb * 0.5, [note * 1.5, note * 2], 0.15, bus);
    }
    this._pad(b(0), spb * 3.9, note * 2, 0.08, bus);
  }

  _kick(t, g = 1, dest) {
    this._tone(t, 0.42, 'sine', 132, 42, 0.75 * g, dest);
    this._noise(t, 0.05, 'lowpass', 1200, 0.7, 0.12 * g, 200, dest);
  }
  _snareHit(t, g = 0.4, dest) {
    this._noise(t, 0.17, 'bandpass', 1900, 0.9, 0.34 * g, 900, dest);
    this._tone(t, 0.1, 'triangle', 220, 160, 0.12 * g, dest);
  }
  _hat(t, g, dest) { this._noise(t, 0.045, 'highpass', 7800, 0.8, g, 9500, dest); }
  _bass(t, dur, f, g, dest) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(f / 2, t);
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 6;
    flt.frequency.setValueAtTime(Math.max(120, f * 3.2), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(90, f * 1.4), t + dur);
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt); o2.connect(flt); flt.connect(gn); gn.connect(dest || this.master);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  _stab(t, dur, freqs, g, dest) {
    for (const f of freqs) {
      this._tone(t, dur, 'sawtooth', f, f * 0.99, g, dest);
      this._tone(t, dur, 'square', f * 1.005, f, g * 0.5, dest);
    }
  }
  _pad(t, dur, f, g, dest) {
    const c = this.ctx;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + dur * 0.35);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1600;
    for (const d of [-4, 0, 5]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f * Math.pow(2, d / 1200) * (d === 5 ? 1.5 : 1);
      o.connect(flt); o.start(t); o.stop(t + dur + 0.1);
    }
    flt.connect(gn); gn.connect(dest || this.master);
  }

  stopMusic(fade = 1.1) {
    const m = this.music;
    if (!m) return;
    m.stopped = true;
    clearInterval(m.timer);
    this.music = null;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      m.bus.gain.cancelScheduledValues(t);
      m.bus.gain.setValueAtTime(Math.max(0.0001, m.bus.gain.value), t);
      m.bus.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, fade));
    } catch (e) { /* context closed */ }
    setTimeout(() => { try { m.bus.disconnect(); } catch (e) { /* gone */ } }, fade * 1000 + 600);
  }

  _startCrowd() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.35;
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.crowdGain = g; this.crowdFilter = f;
  }

  setCrowd(level) {
    if (!this.crowdGain) return;
    const t = this.ctx.currentTime;
    if (this._crowdMute && t < this._crowdMute) return;
    this.crowdGain.gain.setTargetAtTime((0.03 + level * 0.14) * (1 - 0.6 * (this._dzLevel || 0)), t, 0.3);
    this.crowdFilter.frequency.setTargetAtTime(500 + level * 500, t, 0.3);
  }

  // Short commentary through the browser's speech engine (optional).
  // the on-screen caption of whatever the commentator shouts (works without a voice)
  caption(text, shout) {
    let el = document.getElementById('caption');
    if (!el) { el = document.createElement('div'); el.id = 'caption'; document.body.appendChild(el); }
    el.className = shout ? 'shout' : '';
    el.textContent = shout ? text.toUpperCase() : text;
    void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._capT); this._capT = setTimeout(() => el.classList.remove('show'), shout ? 2600 : 2200 + text.length * 25);
  }

  say(text, rate = 1.08, shout = false, o = {}) {
    if (this.enabled) this.caption(text, shout);
    const en = o.energy != null ? o.energy : (shout ? 0.7 : /!/.test(text) ? 0.5 : 0.3);
    if (shout && this.ctx) this.cheer(o.energy != null ? 0.25 + 0.4 * o.energy : 0.55);
    if (!this.enabled) return;
    if (this.voiceMode === 'own' && UFC.Voice) {
      try { if (this.ensure()) { UFC.Voice.speak(this, text, { voice: o.voice || 'pbp', energy: en }); return; } } catch (e) { /* fall back to the system voice */ }
    }
    this._sysSay(text, o.voice === 'color' ? 'color' : 'pbp', en, false);
  }

  _ruVoice() {
    const vs = window.speechSynthesis.getVoices();
    if (this._ruV !== undefined && vs.length === this._ruN) return this._ruV;
    this._ruN = vs.length;
    const ru = vs.filter((v) => /^ru/i.test(v.lang));
    this._ruV = ru.find((v) => /yuri|pavel|dmitr|maxim|male|муж/i.test(v.name)) || ru.find((v) => /google/i.test(v.name)) || ru[0] || null;
    return this._ruV;
  }

  // The browser's own speech engine, played like a commentator: short phrases, pitch and speed climbing, a slow heavy last word.
  _sysSay(text, kind, e, queue) {
    if (!window.speechSynthesis) return;
    try {
      const ss = window.speechSynthesis;
      const parts = String(text).replace(/([а-яё])\1{2,}/gi, '$1$1').match(/[^.!?…]+[.!?…]*/g) || [String(text)];
      if (!queue) ss.cancel();
      const v = this._ruVoice();
      parts.forEach((p, i) => {
        p = p.trim(); if (!p) return;
        const last = i === parts.length - 1, up = e > 0.55 ? i / Math.max(1, parts.length - 1) : 0;
        const u = new SpeechSynthesisUtterance(e > 0.55 ? p.toLowerCase() : p);
        u.lang = 'ru-RU'; if (v) u.voice = v;
        let pitch, rate;
        if (kind === 'color') { pitch = 0.6 + 0.12 * e; rate = 0.97 + 0.12 * e; }
        else if (kind === 'ring') { pitch = 0.55 + 0.25 * e; rate = 0.8 + 0.12 * e; }
        else { pitch = 0.72 + 0.5 * e + 0.12 * up; rate = 1.02 + 0.38 * e + 0.08 * up; }
        if (last && e > 0.8) rate *= 0.85;
        u.pitch = Math.min(1.7, pitch); u.rate = Math.min(1.7, rate); u.volume = 1;
        ss.speak(u);
      });
    } catch (er) { /* speech is optional */ }
  }
}

// bpm / key / drum pattern per fighter archetype (all original)
Audio.MUSIC = {
  hardcore:     { bpm: 142, root: 55.0, gain: 0.27, intro: 1, kick: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], snare: [1, 3], hat: [1, 1, 1, 1], line: [0, 0, 3, 0, 5, 3, 0, -2], minor: true, stab: true },
  sad:          { bpm: 58,  root: 49.0, gain: 0.22, intro: 2, kick: [0], snare: [], hat: [0, 0, 0, 0], line: [0, -2, -4, -5], minor: true, stab: false },
  dark:         { bpm: 84,  root: 55.0, gain: 0.20, intro: 2, kick: [0, 1.5, 2.75], snare: [1, 3], hat: [1, 0, 1, 0], line: [0, 0, -2, 3], minor: true, stab: false },
  aggressive:   { bpm: 98,  root: 61.7, gain: 0.22, intro: 2, kick: [0, 0.75, 2, 2.5, 3.5], snare: [1, 3], hat: [1, 1, 1, 0], line: [0, 0, 5, 3], minor: true, stab: true, swing: false },
  energetic:    { bpm: 106, root: 65.4, gain: 0.21, intro: 2, kick: [0, 1, 2, 3], snare: [1, 3], hat: [1, 1, 1, 1], line: [0, 7, 5, 3], minor: false, stab: true },
  confident:    { bpm: 92,  root: 58.3, gain: 0.20, intro: 2, kick: [0, 2, 2.75], snare: [1, 3], hat: [1, 0, 1, 1], line: [0, 3, 5, 7], minor: true, stab: true, swing: true },
  dramatic:     { bpm: 76,  root: 49.0, gain: 0.22, intro: 3, kick: [0, 2], snare: [2], hat: [1, 0, 0, 0], line: [0, -2, 0, 5], minor: true, stab: false },
  championship: { bpm: 88,  root: 65.4, gain: 0.23, intro: 2, kick: [0, 1.5, 2, 3], snare: [1, 3], hat: [1, 1, 0, 1], line: [0, 5, 7, 10], minor: false, stab: true },
};
// a fighter always walks out to the same track
Audio.musicFor = (cfg, champion) => {
  if (champion) return 'championship';
  const byStyle = { wrestler: 'aggressive', brawler: 'dark', boxer: 'confident', kickboxer: 'energetic', grappler: 'dramatic' };
  const s = byStyle[(cfg && cfg.style) || ''];
  if (s) return s;
  const name = (cfg && cfg.name) || '';
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return ['dark', 'aggressive', 'energetic', 'confident', 'dramatic'][h % 5];
};

UFC.Audio = Audio;
})();

