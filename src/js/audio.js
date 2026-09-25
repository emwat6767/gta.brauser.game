// Звук без файлов: всё синтезируется через Web Audio (шум + фильтры + огибающие).
// Контекст создаётся по первому действию пользователя (кнопка "Играть") — иначе
// браузеры не дают играть звук. M — выключить/включить звук.
//
// Громкость зависит от расстояния до камеры, панорама — от направления.

export class SoundSystem {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noise = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    // лёгкий компрессор, чтобы очередь из автомата не перегружала звук
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  // Громкость/панорама/приглушение для источника в точке мира.
  _place(position) {
    if (!position) return { gain: 1, pan: 0, muffle: 1 };
    const cam = this.game.camera;
    const dx = position.x - cam.position.x, dz = position.z - cam.position.z;
    const d = Math.hypot(dx, position.y - cam.position.y, dz);
    const yaw = this.game.cameraRig.yaw;
    const rx = -Math.cos(yaw), rz = Math.sin(yaw); // "вправо" от камеры
    const pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
    return { gain: 1 / (1 + d / 14), pan: pan * 0.8, muffle: 1 / (1 + d / 45), d };
  }

  _out(gain, pan, when) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  _noise({ when, duration, type = 'bandpass', freq = 1500, q = 0.8, gain = 1, pan = 0, attack = 0.002 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(1, when + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    src.connect(f).connect(env).connect(this._out(gain, pan, when));
    src.start(when, Math.random() * 0.5, duration + 0.05);
  }

  _tone({ when, duration, freq, freqEnd = freq, type = 'sine', gain = 1, pan = 0 }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), when + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(1, when + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    o.connect(env).connect(this._out(gain, pan, when));
    o.start(when);
    o.stop(when + duration + 0.05);
  }

  gunshot(type, position) {
    if (!this.ctx || this.muted) return;
    const { gain, pan, muffle } = this._place(position);
    const when = this.ctx.currentTime;
    const hi = 600 + 3400 * muffle; // далёкие выстрелы глуше
    if (type === 'shotgun') {
      this._noise({ when, duration: 0.45, type: 'lowpass', freq: hi * 0.6, q: 0.5, gain: 1.6 * gain, pan });
      this._tone({ when, duration: 0.22, freq: 95, freqEnd: 32, gain: 1.4 * gain, pan });
    } else if (type === 'smg') {
      this._noise({ when, duration: 0.1, freq: hi * 0.9, q: 0.6, gain: 0.9 * gain, pan });
      this._tone({ when, duration: 0.07, freq: 150, freqEnd: 60, gain: 0.6 * gain, pan });
    } else {
      this._noise({ when, duration: 0.2, freq: hi, q: 0.7, gain: 1.1 * gain, pan });
      this._tone({ when, duration: 0.12, freq: 130, freqEnd: 45, gain: 0.8 * gain, pan });
    }
  }

  // Перезарядка: щелчок магазина в начале и лязг затвора в конце.
  reload(type, position, duration) {
    if (!this.ctx || this.muted) return;
    const { gain, pan } = this._place(position);
    const t = this.ctx.currentTime;
    const click = (when, freq, g) => this._noise({ when, duration: 0.035, freq, q: 6, gain: g * gain, pan, attack: 0.001 });
    click(t + 0.05, 2600, 0.7);
    click(t + 0.12, 1800, 0.5);
    if (type === 'shotgun') click(t + duration * 0.5, 2000, 0.6);
    click(t + duration * 0.8, 3200, 0.8);
    click(t + duration * 0.88, 1500, 0.9);
  }

  empty(position) {
    if (!this.ctx || this.muted) return;
    const { gain, pan } = this._place(position);
    this._noise({ when: this.ctx.currentTime, duration: 0.03, freq: 3500, q: 8, gain: 0.6 * gain, pan, attack: 0.001 });
  }

  punch(position) {
    if (!this.ctx || this.muted) return;
    const { gain, pan } = this._place(position);
    const when = this.ctx.currentTime;
    this._tone({ when, duration: 0.09, freq: 180, freqEnd: 70, gain: 0.9 * gain, pan });
    this._noise({ when, duration: 0.06, type: 'lowpass', freq: 900, gain: 0.5 * gain, pan });
  }

  pickup() {
    if (!this.ctx || this.muted) return;
    const when = this.ctx.currentTime;
    this._tone({ when, duration: 0.09, freq: 660, freqEnd: 700, type: 'square', gain: 0.18 });
    this._tone({ when: when + 0.08, duration: 0.14, freq: 990, freqEnd: 1000, type: 'square', gain: 0.18 });
  }

  // Сигнализация банка: два тона, громкость по расстоянию.
  alarm(position) {
    if (!this.ctx || this.muted) return;
    const { gain, pan } = this._place(position);
    const when = this.ctx.currentTime;
    const g = Math.max(0.12, gain) * 0.35;
    this._tone({ when, duration: 0.4, freq: 960, freqEnd: 940, type: 'square', gain: g, pan });
    this._tone({ when: when + 0.42, duration: 0.4, freq: 720, freqEnd: 700, type: 'square', gain: g, pan });
  }

  // Взрыв: низкий удар + шипение.
  explosion(position) {
    if (!this.ctx || this.muted) return;
    const { gain, pan, muffle } = this._place(position);
    const when = this.ctx.currentTime;
    this._tone({ when, duration: 0.7, freq: 70, freqEnd: 25, gain: 2.2 * gain, pan });
    this._noise({ when, duration: 1.2, type: 'lowpass', freq: 900 * muffle + 200, gain: 1.6 * gain, pan, attack: 0.005 });
  }

  // Удар о землю / тяжёлый удар (k 0..1 — сила).
  slam(position, k = 1) {
    if (!this.ctx || this.muted) return;
    const { gain, pan } = this._place(position);
    const when = this.ctx.currentTime;
    this._tone({ when, duration: 0.35 + k * 0.3, freq: 90, freqEnd: 30, gain: (0.8 + k) * gain, pan });
    this._noise({ when, duration: 0.25 + k * 0.3, type: 'lowpass', freq: 500, gain: (0.5 + k) * gain, pan });
  }

  // Залп репульсора.
  zap(position) {
    if (!this.ctx || this.muted) return;
    const { gain, pan } = this._place(position);
    const when = this.ctx.currentTime;
    this._tone({ when, duration: 0.18, freq: 1800, freqEnd: 300, type: 'sawtooth', gain: 0.25 * gain, pan });
    this._noise({ when, duration: 0.12, type: 'highpass', freq: 3000, gain: 0.4 * gain, pan });
  }

  // Включение суперсилы.
  powerUp(mode) {
    if (!this.ctx || this.muted) return;
    const when = this.ctx.currentTime;
    if (mode === 'hulk') this._tone({ when, duration: 0.6, freq: 110, freqEnd: 55, type: 'sawtooth', gain: 0.5 });
    else this._tone({ when, duration: 0.4, freq: 300, freqEnd: 1200, type: 'triangle', gain: 0.3 });
  }

  // Успех (ограбление удалось): восходящее арпеджио.
  fanfare(steps = 6) {
    if (!this.ctx || this.muted) return;
    const when = this.ctx.currentTime;
    const scale = [0, 4, 7, 12, 16, 19, 24, 28];
    for (let i = 0; i < steps; i++) {
      const f = 523 * Math.pow(2, scale[i] / 12);
      this._tone({ when: when + i * 0.09, duration: i === steps - 1 ? 0.6 : 0.14, freq: f, freqEnd: f, type: 'square', gain: 0.14 });
      this._tone({ when: when + i * 0.09, duration: 0.12, freq: f * 2, freqEnd: f * 2, type: 'triangle', gain: 0.08 });
    }
  }
}
