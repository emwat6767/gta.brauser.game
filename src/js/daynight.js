import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NIGHT } from './vehicle.js';

// Смена дня и ночи: небо с облаками, звёздами и луной, цвет тумана и света, окна и фонари загораются,
// вывески, неон и огни на шпилях горят ночью, у машин включаются фары (лучи на асфальте).
// Время — часы 0..24: CONFIG.daynight.start — старт, dayLength — секунд реального времени на сутки.
// Клавиша N переводит время к следующей "фазе" (утро, день, вечер, ночь).

const PHASES = [[6.8, 'утро'], [12, 'день'], [17.5, 'вечер'], [21.5, 'ночь'], [2, 'глубокая ночь']];

// Ключевые кадры: [час, верх неба, горизонт, низ, свет неба, свет земли, сила полусферы, цвет солнца, сила солнца].
const KEYS = [
  [0, '#04060f', '#0b1022', '#05070d', '#3a4c86', '#161b2c', 1.0, '#8fa6ff', 0.0],
  [5, '#0e1634', '#2f2e4c', '#12121c', '#3a4c86', '#161b2c', 0.95, '#8fa6ff', 0.0],
  [6.5, '#4a73b5', '#ffb27a', '#6a5d5a', '#b4c4e8', '#5d5446', 0.85, '#ffbe8a', 1.1],
  [8.5, '#3f86d8', '#cfe0ec', '#a7b3ba', '#d4e6ff', '#5d5446', 1.1, '#fff1dc', 2.3],
  [13, '#3a82da', '#d3e2ec', '#a7b3ba', '#d4e6ff', '#5d5446', 1.15, '#fff1dc', 2.6],
  [16.5, '#3f7fcf', '#e6dcc8', '#b0b0b0', '#d8e2f4', '#5d5446', 1.05, '#ffe2b8', 2.3],
  [19, '#3a4f9a', '#ff8a4a', '#5a4a4a', '#9aa8e0', '#4a4038', 0.8, '#ff9a50', 1.2],
  [20.3, '#1a2150', '#6a3d6e', '#231f2a', '#4a5590', '#1c1a26', 0.85, '#8fa6ff', 0.0],
  [22, '#04060f', '#0b1022', '#05070d', '#3a4c86', '#161b2c', 1.0, '#8fa6ff', 0.0],
  [24, '#04060f', '#0b1022', '#05070d', '#3a4c86', '#161b2c', 1.0, '#8fa6ff', 0.0],
];
const KEY_COLORS = KEYS.map((k) => k.map((v, i) => ([1, 2, 3, 4, 5, 7].includes(i) ? new THREE.Color(v) : v)));

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Небесная сфера: градиент, солнце, закатное зарево, луна, звёзды, облака.
export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#3f86d8') },
      horizon: { value: new THREE.Color('#d3e2ec') },
      bottom: { value: new THREE.Color('#a7b3ba') },
      sunDir: { value: new THREE.Vector3(0.45, 0.8, 0.3).normalize() },
      moonDir: { value: new THREE.Vector3(-0.45, 0.8, -0.3).normalize() },
      night: { value: 0 },
      sunSet: { value: 0 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 moonDir;
      uniform float night; uniform float sunSet; uniform float time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.9, 0.7) * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.25) * (1.0 - night);
        c += vec3(1.0, 0.45, 0.15) * pow(s, 4.0) * sunSet * (1.0 - smoothstep(0.0, 0.55, abs(h)));
        float m = max(dot(d, moonDir), 0.0);
        c += vec3(0.8, 0.85, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.7 + pow(m, 80.0) * 0.14) * night;
        if (h > 0.0 && night > 0.01) {
          vec2 sp = d.xz / (h + 0.15) * 55.0;
          vec2 g = floor(sp), f = fract(sp);
          float r = hash(g);
          vec2 pp = vec2(hash(g + 1.3), hash(g + 7.7)) * 0.6 + 0.2;
          float star = step(0.975, r) * smoothstep(0.14, 0.0, length(f - pp));
          c += vec3(star) * night * smoothstep(0.0, 0.3, h) * (0.65 + 0.35 * sin(time * 2.0 + r * 60.0));
        }
        if (h > 0.02) {
          vec2 cp = d.xz / (h + 0.28) * 1.5 + vec2(time * 0.012, time * 0.004);
          float cl = smoothstep(0.52, 0.86, fbm(cp));
          vec3 cc = mix(vec3(1.0), vec3(0.5, 0.56, 0.68), night);
          cc = mix(cc, vec3(1.0, 0.68, 0.5), sunSet * 0.7);
          c = mix(c, cc * (0.5 + 0.5 * (1.0 - night)), cl * 0.6 * smoothstep(0.02, 0.28, h));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.renderOrder = -1;
  return sky;
}

// Радиальное пятно света (лужи под фонарями, лучи фар).
function glowTexture(size = 128, inner = 0.0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,236,190,1)');
  grad.addColorStop(0.45, 'rgba(255,214,140,0.45)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DayNight {
  constructor(game) {
    this.game = game;
    const D = CONFIG.daynight;
    this.hour = D.start;
    this.speed = 24 / D.dayLength;          // часов в секунду
    this.frozen = !D.enabled;
    this.night = 0;
    this.lightDir = new THREE.Vector3(0.45, 0.8, 0.3).normalize();
    this.u = game.sky.material.uniforms;
    this.tmpA = new THREE.Color();
    this._build();

    // Время суток в углу экрана.
    this.clockEl = document.createElement('div');
    this.clockEl.id = 'clock';
    document.getElementById('hud')?.appendChild(this.clockEl);
    this.update(0, true);
  }

  _build() {
    const { game } = this;
    const world = game.world;
    // Лужи света под фонарями: один InstancedMesh с аддитивным пятном.
    const lamps = world.lamps ?? [];
    if (lamps.length) {
      const tex = glowTexture(128, 0);
      this.poolMat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true,
      });
      const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), this.poolMat, lamps.length);
      const m = new THREE.Object3D();
      lamps.forEach((l, i) => {
        m.position.set(l.x + Math.sin(l.rot) * 1.5, 0.21, l.z + Math.cos(l.rot) * 1.5);
        m.updateMatrix();
        pools.setMatrixAt(i, m.matrix);
      });
      pools.frustumCulled = false;
      pools.renderOrder = 2;
      game.scene.add(pools);
      this.pools = pools;
    }
    this.beamTex = glowTexture(128, 0);
  }

  // Следующая фаза суток (клавиша N).
  nextPhase() {
    if (this.game.prison?.inCustody) {
      this.game.hud.toast('В тюрьме время идёт по распорядку (I → перемотка)', 2);
      return;
    }
    let next = PHASES.find(([h]) => h > this.hour + 0.2);
    let label;
    if (next) [this.hour, label] = next;
    else { this.hour = PHASES[0][0]; label = PHASES[0][1]; }
    this.update(0, true);
    this.game.hud?.toast(`${this.timeString()} — ${label}`, 1.6);
  }

  timeString() {
    const h = Math.floor(this.hour) % 24, m = Math.floor((this.hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  _key(h) {
    let i = 0;
    while (i < KEY_COLORS.length - 2 && KEY_COLORS[i + 1][0] <= h) i++;
    const a = KEY_COLORS[i], b = KEY_COLORS[i + 1];
    const t = (h - a[0]) / (b[0] - a[0]);
    return { a, b, t };
  }

  update(dt, force = false) {
    const { game } = this;
    if (!this.frozen && dt > 0) this.hour = (this.hour + dt * this.speed) % 24;
    const h = this.hour;
    const { a, b, t } = this._key(h);
    const mixC = (idx, out) => out.copy(a[idx]).lerp(b[idx], t);
    const u = this.u;
    mixC(1, u.top.value); mixC(2, u.horizon.value); mixC(3, u.bottom.value);

    // Солнце идёт по дуге с 6:30 до 19:30; луна — напротив.
    const ang = (Math.PI * (h - 6.5)) / 13;
    const el = Math.sin(ang);
    const sunDir = this._sunDir ??= new THREE.Vector3();
    sunDir.set(Math.cos(ang) * 0.92, Math.sin(ang), 0.38).normalize();
    u.sunDir.value.copy(sunDir);
    const moonDir = this._moonDir ??= new THREE.Vector3();
    moonDir.copy(sunDir).multiplyScalar(-1);
    if (moonDir.y < 0.2) { moonDir.y = 0.2 + (0.2 - moonDir.y) * 0; moonDir.normalize(); }
    u.moonDir.value.copy(moonDir);

    // Ночь: 0 днём, 1 глубокой ночью.
    const sunLow = smooth(0.12, -0.14, el);
    this.night = Math.min(1, Math.max(0, sunLow));
    u.night.value = this.night;
    u.sunSet.value = smooth(0.35, 0.0, el) * (1 - smooth(-0.05, -0.3, el)) * (h > 12 ? 1 : 0.8);
    u.time.value += dt;

    // Свет.
    const hemi = game.hemi, sun = game.sun;
    mixC(4, hemi.color); mixC(5, hemi.groundColor);
    hemi.intensity = a[6] + (b[6] - a[6]) * t;
    const sunColor = mixC(7, this.tmpA);
    const sunInt = a[8] + (b[8] - a[8]) * t;
    const moonInt = 1.0;
    if (el > 0) {
      sun.color.copy(sunColor);
      sun.intensity = sunInt * smooth(0.0, 0.1, el);
      this.lightDir.copy(sunDir);
    } else {
      sun.color.set('#9bb0ff');
      sun.intensity = moonInt * smooth(0.0, 0.12, -el) * this.night;
      this.lightDir.copy(moonDir);
    }
    game.scene.fog.color.copy(u.horizon.value);
    game.scene.fog.color.multiplyScalar(1);
    const fogK = 1 - this.night * 0.0;
    game.scene.fog.near = CONFIG.graphics.fogNear * fogK;
    game.scene.fog.far = CONFIG.graphics.fogFar * (1 - this.night * 0.15);

    this._applyNight(force);
    if (this.clockEl) this.clockEl.textContent = this.timeString();
  }

  _applyNight(force) {
    const n = this.night;
    if (!force && Math.abs(n - (this._lastN ?? -1)) < 0.004 && this._lastN !== undefined) return;
    this._lastN = n;
    const { game } = this;
    const world = game.world;
    // Окна, фонари, вывески.
    world.mats.facade.emissiveIntensity = Math.max(0, n - 0.05) * 1.5;
    if (world.lampLightMat) world.lampLightMat.emissiveIntensity = 0.3 + n * 2.4;
    world.mats.sign.color.setScalar(0.74 + n * 0.42);
    world.mats.shop.color.setScalar(0.4 + n * 0.6);
    for (const g of world.glow ?? []) g.mat.color.copy(g.base).multiplyScalar(g.day + (g.night - g.day) * n);
    for (const b of world.beams ?? []) b.mat.opacity = b.max * n;
    if (this.poolMat) this.poolMat.opacity = 0.62 * n;
    // Машины.
    NIGHT.level = n;
    NIGHT.beamTex = this.beamTex;
    if (NIGHT.headMat) NIGHT.headMat.emissiveIntensity = 0.6 + n * 3.4;
    if (NIGHT.glassMat) NIGHT.glassMat.envMapIntensity = 1.2 - n * 0.9;
    game.renderer.toneMappingExposure = 1.05 + n * 0.25;
  }

  // Каждый кадр: мигание огней на шпилях и отражения на краске машин рядом.
  frame(dt) {
    const { game } = this;
    const blink = Math.floor(performance.now() / 700) % 2 === 0;
    if (game.world.beaconMat) game.world.beaconMat.color.setScalar(blink ? 1 : 0.18 + (1 - this.night) * 0.1);
    const n = this.night;
    for (const v of game.vehicles) v.setNight?.(n);
    void dt;
  }
}
