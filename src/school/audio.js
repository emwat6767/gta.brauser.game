import { SoundSystem } from '../js/audio.js';

// Звук школы на основе синтезатора Open City (Web Audio, без файлов): выстрелы и удары оттуда,
// плюс школьный звонок, пожарная сирена (петля), тревога «опасность», замки, двери, шкафчики,
// стоны зомби, кашель, шипение огнетушителя и огня, сирены машин. Объявления по громкой связи —
// голосом браузера (speechSynthesis), если он есть.

export class SchoolAudio extends SoundSystem {
  constructor(game) {
    super(game);
    this.game = game;
    this.alarmMode = null;     // 'fire' | 'danger' | null
    this.alarmT = 0;
    this.sprayGain = 0;
    this.sirenOn = false;
  }

  // В SoundSystem камера берётся из game.camera / game.cameraRig.yaw.
  get ready() { return !!this.ctx && !this.muted; }

  // Точка звука может прийти без y (дверь, клетка) — подставляем, и не даём NaN в Web Audio.
  _place(position) {
    if (!position) return { gain: 1, pan: 0, muffle: 1, d: 0 };
    const p = { x: position.x ?? 0, y: position.y ?? position.y0 ?? this.game.camera.position.y, z: position.z ?? 0 };
    const r = super._place(p);
    if (!Number.isFinite(r.gain)) r.gain = 0;
    if (!Number.isFinite(r.pan)) r.pan = 0;
    if (!Number.isFinite(r.muffle)) r.muffle = 1;
    return r;
  }

  bell() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // Электрический звонок: дребезжащий тон 2.5 с.
    for (let i = 0; i < 26; i++) {
      this._tone({ when: t + i * 0.1, duration: 0.09, freq: 1750, freqEnd: 1700, type: 'square', gain: 0.07 });
      this._tone({ when: t + i * 0.1 + 0.05, duration: 0.05, freq: 880, freqEnd: 860, type: 'triangle', gain: 0.05 });
    }
  }

  chime() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [659, 523, 392, 523].forEach((f, i) => this._tone({ when: t + i * 0.32, duration: 0.6, freq: f, freqEnd: f, type: 'sine', gain: 0.22 }));
  }

  lock(pos) {
    if (!this.ready) return;
    const { gain, pan } = this._place(pos);
    const t = this.ctx.currentTime;
    this._noise({ when: t, duration: 0.04, freq: 2600, q: 7, gain: 0.8 * gain, pan, attack: 0.001 });
    this._noise({ when: t + 0.09, duration: 0.05, freq: 1500, q: 6, gain: 0.9 * gain, pan, attack: 0.001 });
  }

  click() {
    if (!this.ready) return;
    this._noise({ when: this.ctx.currentTime, duration: 0.03, freq: 3000, q: 8, gain: 0.5, attack: 0.001 });
  }

  locker(pos) {
    if (!this.ready || !pos) return;
    const { gain, pan } = this._place(pos);
    const t = this.ctx.currentTime;
    this._noise({ when: t, duration: 0.18, type: 'bandpass', freq: 700, q: 2, gain: 0.9 * gain, pan });
    this._tone({ when: t, duration: 0.15, freq: 210, freqEnd: 160, type: 'triangle', gain: 0.3 * gain, pan });
  }

  door(pos, k = 0.4) {
    this.slam(pos, k);
  }

  rattle(pos) {
    if (!this.ready) return;
    const { gain, pan } = this._place(pos);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) this._noise({ when: t + i * 0.07, duration: 0.05, freq: 1800 + i * 200, q: 5, gain: 0.7 * gain, pan, attack: 0.001 });
  }

  bang(pos, k = 1) {
    if (!this.ready) return;
    const { gain, pan } = this._place(pos);
    const t = this.ctx.currentTime;
    this._tone({ when: t, duration: 0.25, freq: 120, freqEnd: 50, gain: 1.4 * gain * k, pan });
    this._noise({ when: t, duration: 0.2, type: 'lowpass', freq: 700, gain: 1.1 * gain * k, pan });
  }

  swing(pos) {
    if (!this.ready) return;
    const { gain, pan } = this._place(pos);
    this._noise({ when: this.ctx.currentTime, duration: 0.12, type: 'highpass', freq: 1800, gain: 0.25 * gain, pan });
  }

  groan(pos, loud = false) {
    if (!this.ready) return;
    const { gain, pan, d } = this._place(pos);
    if (d > 30) return;
    const t = this.ctx.currentTime;
    const f = 90 + Math.random() * 50;
    this._tone({ when: t, duration: 0.9 + Math.random() * 0.5, freq: f, freqEnd: f * 0.7, type: 'sawtooth', gain: (loud ? 0.35 : 0.18) * gain, pan });
    this._noise({ when: t, duration: 0.8, type: 'bandpass', freq: 380, q: 3, gain: (loud ? 0.4 : 0.2) * gain, pan });
  }

  scream(pos, fem = true) {
    if (!this.ready) return;
    const { gain, pan, d } = this._place(pos);
    if (d > 40) return;
    const t = this.ctx.currentTime;
    const f = fem ? 900 + Math.random() * 300 : 520 + Math.random() * 200;
    this._tone({ when: t, duration: 0.7, freq: f, freqEnd: f * 1.25, type: 'sawtooth', gain: 0.07 * gain, pan });
    this._tone({ when: t, duration: 0.7, freq: f * 2.01, freqEnd: f * 2.4, type: 'sine', gain: 0.05 * gain, pan });
  }

  cough(pos) {
    if (!this.ready) return;
    const { gain, pan } = this._place(pos);
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) this._noise({ when: t + i * 0.22, duration: 0.14, type: 'bandpass', freq: 500, q: 1.2, gain: 0.7 * gain, pan, attack: 0.004 });
  }

  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this._tone({ when: t, duration: 0.18, freq: 160, freqEnd: 90, type: 'sine', gain: 0.6 });
  }

  spray(pos, dt) {
    this.sprayGain = Math.min(0.12, this.sprayGain + dt * 2);
    this._sprayPos = pos;
  }

  // PA: объявление голосом (если есть) + гонг.
  announce(text) {
    this.chime();
    try {
      if (!this.muted && window.speechSynthesis) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ru-RU';
        u.rate = 1.0;
        u.volume = 0.9;
        const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('ru'));
        if (v) u.voice = v;
        setTimeout(() => { try { speechSynthesis.speak(u); } catch { /* нет голоса */ } }, 1100);
      }
    } catch { /* без голоса */ }
  }

  _makeSchoolLoops() {
    const ctx = this.ctx;
    // Пожарная сирена: прерывистый высокий тон.
    const al = { osc: ctx.createOscillator(), gain: ctx.createGain() };
    al.osc.type = 'square';
    al.osc.frequency.value = 950;
    al.gain.gain.value = 0;
    al.osc.connect(al.gain).connect(this.master);
    al.osc.start();
    // Шум: огнетушитель/огонь.
    const hiss = { src: ctx.createBufferSource(), filter: ctx.createBiquadFilter(), gain: ctx.createGain() };
    hiss.src.buffer = this.noise; hiss.src.loop = true;
    hiss.filter.type = 'highpass'; hiss.filter.frequency.value = 2200;
    hiss.gain.gain.value = 0;
    hiss.src.connect(hiss.filter).connect(hiss.gain).connect(this.master);
    hiss.src.start();
    const fire = { src: ctx.createBufferSource(), filter: ctx.createBiquadFilter(), gain: ctx.createGain() };
    fire.src.buffer = this.noise; fire.src.loop = true;
    fire.filter.type = 'lowpass'; fire.filter.frequency.value = 500;
    fire.gain.gain.value = 0;
    fire.src.connect(fire.filter).connect(fire.gain).connect(this.master);
    fire.src.start();
    // Сирена машин (полиция/пожарные/МЧС).
    const sir = { osc: ctx.createOscillator(), lfo: ctx.createOscillator(), depth: ctx.createGain(), gain: ctx.createGain() };
    sir.osc.type = 'triangle'; sir.osc.frequency.value = 800;
    sir.lfo.frequency.value = 0.45; sir.depth.gain.value = 300;
    sir.lfo.connect(sir.depth).connect(sir.osc.frequency);
    sir.gain.gain.value = 0;
    sir.osc.connect(sir.gain).connect(this.master);
    sir.osc.start(); sir.lfo.start();
    return { al, hiss, fire, sir };
  }

  update() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const L = (this.sloops ??= this._makeSchoolLoops());
    const g = this.game;
    const t = this.ctx.currentTime;
    const quiet = g.paused || this.muted;
    // Сирена тревоги: 0.6 с вкл / 0.4 с выкл; внутри здания громче.
    let a = 0;
    if (!quiet && this.alarmMode) {
      const inside = !!g.player.zone;
      const on = (t % 1.0) < 0.6;
      a = on ? (inside ? 0.045 : 0.015) : 0;
      L.al.osc.frequency.setTargetAtTime(this.alarmMode === 'fire' ? 950 : 640 + 200 * Math.sin(t * 6), t, 0.02);
    }
    L.al.gain.gain.setTargetAtTime(a, t, 0.01);
    L.hiss.gain.gain.setTargetAtTime(quiet ? 0 : this.sprayGain, t, 0.05);
    this.sprayGain = Math.max(0, this.sprayGain - 0.03);
    // Треск огня — по близости к пламени.
    let fg = 0;
    if (!quiet && g.fire?.active) {
      const h = g.fire.heatNear(g.player.pos.x, g.player.pos.z, g.player.floor, 8);
      fg = Math.min(0.18, h * 0.16);
    }
    L.fire.gain.gain.setTargetAtTime(fg, t, 0.2);
    L.fire.filter.frequency.setTargetAtTime(300 + Math.random() * 500, t, 0.05);
    L.sir.gain.gain.setTargetAtTime(!quiet && this.sirenOn ? 0.035 : 0, t, 0.3);
  }
}
