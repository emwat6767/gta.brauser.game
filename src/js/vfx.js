import * as THREE from 'three';
import { raycastAll } from './ballistics.js';

// «Элитные» эффекты для супергеройских режимов, боссов и вызова банды. Всё на пулах, без аллокаций в кадре:
//   bolt(from, to, theme)            — молния/луч: ленты лицом к камере, белое ядро + цветное свечение, дрожит
//   orb(point, theme, size, life)    — светящийся шар (спрайт)
//   projectile(from, dir, opts)      — летящий шар/ракета: след, самонаведение, взрыв в точке попадания
//   explosion(point, opts)           — взрыв по теме: купол, кольцо, вспышка, искры, урон по области (chaos.blast)
//   dome(point, radius, theme)       — расширяющаяся полупрозрачная сфера (ударная волна, ЭМИ, щит у босса)
//   pillar(point, theme, h, r, life) — световой столб
//   portal(point, theme, life, done) — рунное кольцо на земле и столб света (вызов бойцов банды)
//   shield(entity, theme, r, life)   — энергощит вокруг персонажа
//   aura(entity, theme, seconds)     — вихрь частиц вокруг персонажа
//   chunks(point, n, color, speed)   — обломки с физикой (крушение машин, деревьев, стен)
//   crater(point, normal, size)      — воронка/трещины на земле или стене
//   treeFall(...)                    — падающее дерево
// Темы: plasma (голубая), gold (золотая), violet (фиолетовая), fire (огненная), toxic (зелёная), white.

export const THEMES = {
  plasma: { hex: 0x4cc9ff, core: 0xe8fbff, puff: 'plasma', burst: 'energy', ring: 0x7fd8ff },
  gold: { hex: 0xffc93a, core: 0xfff6cf, puff: 'gold', burst: 'gold', ring: 0xffd45a },
  violet: { hex: 0xb44cff, core: 0xffe6ff, puff: 'violet', burst: 'violet', ring: 0xc77dff },
  fire: { hex: 0xff6a1a, core: 0xfff0b0, puff: 'fire', burst: 'fire', ring: 0xffa04a },
  toxic: { hex: 0x4cff6a, core: 0xeaffb0, puff: 'toxic', burst: 'toxic', ring: 0x7dff9a },
  white: { hex: 0xdfe8ff, core: 0xffffff, puff: 'plasma', burst: 'spark', ring: 0xffffff },
};

const MAX_BOLTS = 24, BOLT_SEGS = 14;
const MAX_ORBS = 48, MAX_DOMES = 8, MAX_PILLARS = 14, MAX_PORTALS = 8, MAX_CHUNKS = 200, MAX_CRATERS = 28, MAX_PROJ = 40;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _col = new THREE.Color();
const _e = new THREE.Euler();

function canvasTex(size, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const glowTex = () => canvasTex(128, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.22)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, n, n);
});

// Вертикальный градиент столба: плотный низ, прозрачный верх, мягкие края.
const pillarTex = () => canvasTex(128, (g, n) => {
  const gr = g.createLinearGradient(0, n, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, n, n);
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, n, 0);
  side.addColorStop(0, 'rgba(0,0,0,0)');
  side.addColorStop(0.3, 'rgba(0,0,0,1)');
  side.addColorStop(0.7, 'rgba(0,0,0,1)');
  side.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, n, n);
});

// Рунное кольцо на земле.
const runeTex = () => canvasTex(256, (g, n) => {
  const c = n / 2;
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  for (const [r, w] of [[c * 0.96, 5], [c * 0.8, 3], [c * 0.5, 3]]) {
    g.lineWidth = w;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = c * 0.8, r1 = c * (i % 2 ? 0.9 : 0.94);
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
    g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    g.stroke();
  }
  // Звезда внутри.
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 8; i++) {
    const a = (i * 3 / 8) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78);
  }
  g.stroke();
  const gr = g.createRadialGradient(c, c, 0, c, c, c * 0.5);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, n, n);
});

// Воронка: тёмное пятно с расходящимися трещинами.
const craterTex = () => canvasTex(256, (g, n) => {
  const c = n / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, 'rgba(20,16,14,0.85)');
  gr.addColorStop(0.35, 'rgba(30,24,20,0.6)');
  gr.addColorStop(1, 'rgba(30,24,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, n, n);
  g.strokeStyle = 'rgba(10,8,6,0.9)';
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    let a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
    let r = c * 0.12;
    g.lineWidth = 3 + Math.random() * 3;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    while (r < c * (0.7 + Math.random() * 0.3)) {
      r += c * (0.08 + Math.random() * 0.1);
      a += (Math.random() - 0.5) * 0.5;
      g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      g.lineWidth = Math.max(1, g.lineWidth * 0.8);
    }
    g.stroke();
  }
});

export class EliteVFX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.time = 0;
    this.glow = glowTex();
    this.shared = { pillar: pillarTex(), rune: runeTex(), crater: craterTex() };

    // --- молнии и лучи: ленты (по два слоя) ---
    const V = 4 * (BOLT_SEGS + 1);
    const idx = [];
    for (let strip = 0; strip < 2; strip++) {
      const o = strip * 2 * (BOLT_SEGS + 1);
      for (let i = 0; i < BOLT_SEGS; i++) {
        const a = o + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.boltMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.bolts = [];
    for (let i = 0; i < MAX_BOLTS; i++) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(V * 3), col = new Float32Array(V * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, this.boltMat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.bolts.push({ mesh, pos, col, life: 0, max: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), glow: new THREE.Color(), width: 0.2, jag: 0.6, segs: 8, next: 0, pts: Array.from({ length: BOLT_SEGS + 1 }, () => new THREE.Vector3()), follow: null });
    }
    this.nextBolt = 0;

    // --- шары ---
    this.orbs = [];
    for (let i = 0; i < MAX_ORBS; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.visible = false;
      sp.renderOrder = 5;
      scene.add(sp);
      this.orbs.push({ sp, life: 0, max: 1, size: 1, grow: 0, vel: new THREE.Vector3() });
    }
    this.nextOrb = 0;

    // --- купола ---
    const domeGeo = new THREE.SphereGeometry(1, 24, 16);
    this.domes = [];
    for (let i = 0; i < MAX_DOMES; i++) {
      const m = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.domes.push({ mesh: m, life: 0, max: 1, radius: 1 });
    }
    this.nextDome = 0;

    // --- световые столбы ---
    const pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
    this.pillars = [];
    for (let i = 0; i < MAX_PILLARS; i++) {
      const m = new THREE.Mesh(pillarGeo, new THREE.MeshBasicMaterial({ map: this.shared.pillar, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      this.pillars.push({ mesh: m, life: 0, max: 1, h: 10, r: 1 });
    }
    this.nextPillar = 0;

    // --- порталы: рунное кольцо ---
    const runeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.portals = [];
    for (let i = 0; i < MAX_PORTALS; i++) {
      const m = new THREE.Mesh(runeGeo, new THREE.MeshBasicMaterial({ map: this.shared.rune, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.portals.push({ mesh: m, life: 0, max: 1, size: 4, done: null, theme: THEMES.gold, pil: null, sparks: 0 });
    }
    this.nextPortal = 0;

    // --- щиты ---
    const shieldMat = (theme) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { color: { value: new THREE.Color(theme) }, alpha: { value: 0 }, time: { value: 0 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float alpha; uniform float time; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float hex = 0.5 + 0.5 * sin(vP.y * 18.0 + time * 3.0) * sin(vP.x * 14.0 + vP.z * 14.0 - time * 2.0);
          gl_FragColor = vec4(color * (0.35 + f * 1.4 + hex * 0.35), alpha * (0.22 + f * 0.8));
        }`,
    });
    this.shieldGeo = new THREE.SphereGeometry(1, 28, 18);
    this.shields = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(this.shieldGeo, shieldMat(0x4cc9ff));
      m.visible = false;
      m.renderOrder = 6;
      scene.add(m);
      this.shields.push({ mesh: m, entity: null, life: 0, max: 1, radius: 1.4 });
    }

    // --- обломки (InstancedMesh) ---
    this.chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), MAX_CHUNKS);
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunkMesh.setColorAt(0, _col.set(0xffffff));
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.castShadow = true;
    this.chunkMesh.count = 0;
    scene.add(this.chunkMesh);
    this.chunkData = Array.from({ length: MAX_CHUNKS }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) }));
    this.nextChunk = 0;

    // --- воронки ---
    const craterGeo = new THREE.PlaneGeometry(1, 1);
    this.craters = [];
    for (let i = 0; i < MAX_CRATERS; i++) {
      const m = new THREE.Mesh(craterGeo, new THREE.MeshBasicMaterial({ map: this.shared.crater, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.craters.push({ mesh: m, life: 0 });
    }
    this.nextCrater = 0;

    this.projectiles = [];
    this.falling = [];
    this.auras = [];
    this.treeGeo = { trunk: new THREE.CylinderGeometry(0.16, 0.24, 2.6, 7).translate(0, 1.3, 0), crown: new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.6, 0) };
  }

  theme(t) {
    return typeof t === 'string' ? THEMES[t] ?? THEMES.plasma : t;
  }

  // ------------------------------------------------------------------ молнии
  // from/to — Vector3 или объект с position (тогда лента следует за ним, offsetY — высота над position).
  bolt(from, to, theme = 'plasma', { life = 0.22, width = 0.22, jag = 0.7, segs = 9, follow = false } = {}) {
    const T = this.theme(theme);
    const b = this.bolts[this.nextBolt];
    this.nextBolt = (this.nextBolt + 1) % MAX_BOLTS;
    b.from.copy(from);
    b.to.copy(to);
    b.glow.setHex(T.hex);
    b.core = T.core;
    b.life = b.max = life;
    b.width = width;
    b.jag = jag;
    b.segs = Math.min(BOLT_SEGS, segs);
    b.next = 0;
    b.follow = follow ? { from, to } : null;
    b.mesh.visible = true;
    return b;
  }

  // Прямой луч с пульсацией (без ломаной).
  beam(from, to, theme = 'plasma', { life = 0.25, width = 0.5 } = {}) {
    return this.bolt(from, to, theme, { life, width, jag: 0, segs: 2 });
  }

  _updateBolt(b, dt, cam) {
    b.life -= dt;
    if (b.life <= 0) {
      b.mesh.visible = false;
      return;
    }
    b.next -= dt;
    if (b.follow) {
      b.from.copy(b.follow.from.position ?? b.follow.from);
      b.to.copy(b.follow.to.position ?? b.follow.to);
    }
    const n = b.segs;
    const pts = b.pts;
    if (b.next <= 0) {
      b.next = 0.04;
      _a.subVectors(b.to, b.from);
      const len = _a.length() || 1;
      _a.divideScalar(len);
      // Два перпендикуляра к оси луча.
      _b.set(Math.abs(_a.y) < 0.9 ? 0 : 1, Math.abs(_a.y) < 0.9 ? 1 : 0, 0).cross(_a).normalize();
      _c.crossVectors(_a, _b);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts[i].lerpVectors(b.from, b.to, t);
        if (i > 0 && i < n) {
          const amp = b.jag * Math.sin(Math.PI * t) * Math.min(1.5, len * 0.12 + 0.3);
          pts[i].addScaledVector(_b, (Math.random() - 0.5) * 2 * amp).addScaledVector(_c, (Math.random() - 0.5) * 2 * amp);
        }
      }
    }
    const k = Math.min(1, b.life / b.max * 1.6);
    const pos = b.pos, col = b.col;
    const half = 2 * (BOLT_SEGS + 1);
    for (let i = 0; i <= n; i++) {
      // Сторона ленты — перпендикуляр к направлению и к взгляду камеры.
      const pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(n, i + 1)];
      _a.subVectors(pb, pa);
      _d.subVectors(cam, pts[i]);
      _b.crossVectors(_a, _d).normalize();
      const taper = i === 0 || i === n ? 0.35 : 1;
      for (let strip = 0; strip < 2; strip++) {
        const w = (strip === 0 ? b.width * 1.6 : b.width * 0.5) * taper * (0.75 + Math.random() * 0.5);
        const o = (strip * half + i * 2) * 3;
        pos[o] = pts[i].x - _b.x * w; pos[o + 1] = pts[i].y - _b.y * w; pos[o + 2] = pts[i].z - _b.z * w;
        pos[o + 3] = pts[i].x + _b.x * w; pos[o + 4] = pts[i].y + _b.y * w; pos[o + 5] = pts[i].z + _b.z * w;
        if (strip === 0) {
          for (let s = 0; s < 2; s++) { col[o + s * 3] = b.glow.r * 0.8 * k; col[o + s * 3 + 1] = b.glow.g * 0.8 * k; col[o + s * 3 + 2] = b.glow.b * 0.8 * k; }
        } else {
          for (let s = 0; s < 2; s++) { col[o + s * 3] = k; col[o + s * 3 + 1] = k; col[o + s * 3 + 2] = k; }
        }
      }
    }
    b.mesh.geometry.setDrawRange(0, 0);
    // Индексы: сначала внешний слой n сегментов, потом внутренний — берём весь индекс, лишние сегменты вырождены ниже.
    for (let i = n; i < BOLT_SEGS; i++) {
      for (let strip = 0; strip < 2; strip++) {
        const o = (strip * half + (i + 1) * 2) * 3;
        const src = (strip * half + n * 2) * 3;
        pos[o] = pos[src]; pos[o + 1] = pos[src + 1]; pos[o + 2] = pos[src + 2];
        pos[o + 3] = pos[src + 3]; pos[o + 4] = pos[src + 4]; pos[o + 5] = pos[src + 5];
        col[o] = col[o + 1] = col[o + 2] = col[o + 3] = col[o + 4] = col[o + 5] = 0;
      }
    }
    b.mesh.geometry.setDrawRange(0, Infinity);
    b.mesh.geometry.attributes.position.needsUpdate = true;
    b.mesh.geometry.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ шары
  orb(point, theme = 'plasma', size = 1.4, life = 0.3, { grow = 1.5, vel = null } = {}) {
    const T = this.theme(theme);
    const o = this.orbs[this.nextOrb];
    this.nextOrb = (this.nextOrb + 1) % MAX_ORBS;
    o.sp.position.copy(point);
    o.sp.material.color.setHex(T.hex);
    o.life = o.max = life;
    o.size = size;
    o.grow = grow;
    if (vel) o.vel.copy(vel); else o.vel.set(0, 0, 0);
    o.sp.visible = true;
    o.sp.scale.setScalar(size);
    return o;
  }

  // ------------------------------------------------------------------ купола, столбы, порталы
  dome(point, radius = 6, theme = 'plasma', life = 0.5, opacity = 0.35) {
    const T = this.theme(theme);
    const d = this.domes[this.nextDome];
    this.nextDome = (this.nextDome + 1) % MAX_DOMES;
    d.mesh.position.copy(point);
    d.mesh.material.color.setHex(T.hex);
    d.life = d.max = life;
    d.radius = radius;
    d.opacity = opacity;
    d.mesh.visible = true;
    d.mesh.scale.setScalar(0.1);
    return d;
  }

  pillar(point, theme = 'gold', h = 40, r = 1.2, life = 0.9) {
    const T = this.theme(theme);
    const p = this.pillars[this.nextPillar];
    this.nextPillar = (this.nextPillar + 1) % MAX_PILLARS;
    p.mesh.position.copy(point);
    p.mesh.material.color.setHex(T.hex);
    p.life = p.max = life;
    p.h = h;
    p.r = r;
    p.mesh.visible = true;
    return p;
  }

  // Портал вызова: рунное кольцо, столб света и молнии с неба. done() вызывается к концу жизни.
  portal(point, theme = 'gold', life = 1.3, done = null, size = 4.2) {
    const T = this.theme(theme);
    const p = this.portals[this.nextPortal];
    this.nextPortal = (this.nextPortal + 1) % MAX_PORTALS;
    p.mesh.position.set(point.x, point.y + 0.12, point.z);
    p.mesh.material.color.setHex(T.hex);
    p.life = p.max = life;
    p.size = size;
    p.done = done;
    p.theme = T;
    p.mesh.visible = true;
    p.pil = this.pillar(point, T, 34, size * 0.32, life + 0.3);
    p.fired = false;
    this.game.audio.zap?.(point);
    return p;
  }

  // ------------------------------------------------------------------ щит и аура
  shield(entity, theme = 'plasma', radius = 1.5, life = 5) {
    const T = this.theme(theme);
    let s = this.shields.find((x) => x.entity === entity) ?? this.shields.find((x) => x.life <= 0) ?? this.shields[0];
    s.entity = entity;
    s.life = s.max = life;
    s.radius = radius;
    s.mesh.material.uniforms.color.value.setHex(T.hex);
    s.mesh.visible = true;
    return s;
  }

  shieldActive(entity) {
    return this.shields.some((s) => s.entity === entity && s.life > 0);
  }

  aura(entity, theme = 'gold', seconds = 3, rate = 40, radius = 0.9) {
    this.auras.push({ entity, theme: this.theme(theme), until: this.time + seconds, rate, acc: 0, radius });
  }

  // ------------------------------------------------------------------ обломки и воронки
  chunks(point, count = 12, color = 0x8a8478, speed = 7, size = 0.25, up = 1) {
    const colors = Array.isArray(color) ? color : [color];
    for (let n = 0; n < count; n++) {
      const i = this.nextChunk;
      this.nextChunk = (i + 1) % MAX_CHUNKS;
      const c = this.chunkData[i];
      c.p.copy(point);
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.8);
      c.v.set(Math.cos(a) * s, speed * up * (0.5 + Math.random() * 0.9), Math.sin(a) * s);
      c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      const sz = size * (0.5 + Math.random() * 1.1);
      c.s.set(sz * (0.7 + Math.random() * 0.8), sz * (0.5 + Math.random()), sz * (0.7 + Math.random() * 0.8));
      c.life = c.max = 3 + Math.random() * 2.5;
      this.chunkMesh.setColorAt(i, _col.setHex(colors[(Math.random() * colors.length) | 0]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1));
    }
    if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;
  }

  crater(point, normal, size = 3) {
    const c = this.craters[this.nextCrater];
    this.nextCrater = (this.nextCrater + 1) % MAX_CRATERS;
    const m = c.mesh;
    _b.copy(normal);
    _q.setFromUnitVectors(_a.set(0, 0, 1), _b);
    m.quaternion.copy(_q);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.position.copy(point).addScaledVector(normal, 0.05);
    m.scale.setScalar(size);
    m.material.opacity = 1;
    m.visible = true;
    c.life = 80;
  }

  // Дерево падает от удара (dir — куда падает) и рассыпается листвой.
  treeFall(x, y, z, dirX, dirZ, crownColor = 0x3f8f3a) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(this.treeGeo.trunk, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }));
    const crown = new THREE.Mesh(this.treeGeo.crown, new THREE.MeshStandardMaterial({ color: crownColor, roughness: 1, flatShading: true }));
    trunk.castShadow = crown.castShadow = true;
    g.add(trunk, crown);
    g.position.set(x, y, z);
    this.game.scene.add(g);
    const l = Math.hypot(dirX, dirZ) || 1;
    this.falling.push({ g, axis: new THREE.Vector3(dirZ / l, 0, -dirX / l), angle: 0, w: 0.3, t: 0, landed: false, mats: [trunk.material, crown.material] });
  }

  // ------------------------------------------------------------------ снаряды и взрывы
  // opts: { speed, theme, radius, life, damage, aoe, force, owner, only, homing (объект с position или функция), turn, onHit, kind }
  projectile(from, dir, opts = {}) {
    if (this.projectiles.length >= MAX_PROJ) return null;
    const T = this.theme(opts.theme ?? 'plasma');
    const p = {
      pos: from.clone(), dir: dir.clone().normalize(), speed: opts.speed ?? 30, theme: T, radius: opts.radius ?? 0.6,
      life: opts.life ?? 3, damage: opts.damage ?? 40, aoe: opts.aoe ?? 3.5, force: opts.force ?? 9, owner: opts.owner ?? null,
      only: opts.only ?? null, homing: opts.homing ?? null, turn: opts.turn ?? 3, onHit: opts.onHit ?? null, kind: opts.kind ?? 'orb',
      trail: 0, hitCharacters: opts.hitCharacters ?? true, ignore: opts.ignore ?? opts.owner ?? null,
    };
    this.projectiles.push(p);
    return p;
  }

  explosion(point, { theme = 'plasma', aoe = 4, damage = 40, force = 9, owner = null, only = null, big = false, sound = true } = {}) {
    const { game } = this;
    const T = this.theme(theme);
    const up = { x: 0, y: 1, z: 0 };
    this.dome(point, aoe * 1.15, T, 0.45, 0.32);
    game.effects.ring(point, aoe * 1.6, T.ring);
    this.orb(point, T, aoe * 1.4, 0.18, { grow: 2.5 });
    game.effects.burst(point, up, T.burst, 18 + Math.round(aoe * 3));
    game.effects.burst(point, up, 'spark', 10);
    for (let k = 0; k < 6; k++) {
      _a.set((Math.random() - 0.5) * aoe, 0.4 + Math.random() * aoe * 0.5, (Math.random() - 0.5) * aoe).add(point);
      game.effects.puff(T.puff, _a, { x: (Math.random() - 0.5) * 3, y: 2 + Math.random() * 3, z: (Math.random() - 0.5) * 3 }, 1 + aoe * 0.2);
    }
    if (big) game.effects.explosion(point, Math.min(1.3, aoe / 4));
    game.chaos.blast(point, aoe, damage, force, owner, { ignore: owner, only });
    if (sound) game.audio.explosion?.(point);
    game.cameraRig.addShake?.(Math.min(0.5, aoe * 0.06));
  }

  // ------------------------------------------------------------------ каждый кадр
  update(dt) {
    const { game } = this;
    this.time += dt;
    const cam = game.camera.position;

    for (const b of this.bolts) if (b.mesh.visible) this._updateBolt(b, dt, cam);

    for (const o of this.orbs) {
      if (!o.sp.visible) continue;
      o.life -= dt;
      if (o.life <= 0) { o.sp.visible = false; continue; }
      const k = 1 - o.life / o.max;
      o.sp.position.addScaledVector(o.vel, dt);
      o.sp.scale.setScalar(o.size * (1 + o.grow * k));
      o.sp.material.opacity = Math.min(1, (1 - k) * 1.6);
    }

    for (const d of this.domes) {
      if (!d.mesh.visible) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      const k = 1 - d.life / d.max;
      d.mesh.scale.setScalar(Math.max(0.1, d.radius * (1 - (1 - k) * (1 - k))));
      d.mesh.material.opacity = d.opacity * (1 - k) * (1 - k);
    }

    for (const p of this.pillars) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      const k = 1 - p.life / p.max;
      const grow = Math.min(1, k * 5);
      p.mesh.scale.set(p.r * (1 + k * 0.3), p.h * grow, p.r * (1 + k * 0.3));
      p.mesh.rotation.y += dt * 2;
      p.mesh.material.opacity = k < 0.15 ? k / 0.15 : Math.pow(1 - (k - 0.15) / 0.85, 1.3);
    }

    for (const p of this.portals) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      const k = 1 - p.life / p.max;
      if (p.life <= 0) {
        p.mesh.visible = false;
        if (!p.fired && p.done) { p.fired = true; p.done(); }
        continue;
      }
      p.mesh.rotation.y += dt * 2.4;
      p.mesh.scale.setScalar(p.size * Math.min(1, k * 4) * (1 + Math.sin(this.time * 9) * 0.03));
      p.mesh.material.opacity = k < 0.8 ? 1 : (1 - k) / 0.2;
      // Искры и молнии в момент "раскрытия".
      p.sparks -= dt;
      if (p.sparks <= 0) {
        p.sparks = 0.07;
        const a = Math.random() * Math.PI * 2, r = p.size * 0.45 * Math.random();
        _a.set(p.mesh.position.x + Math.cos(a) * r, p.mesh.position.y + 0.1, p.mesh.position.z + Math.sin(a) * r);
        game.effects.puff(p.theme.puff, _a, { x: 0, y: 3.5 + Math.random() * 3, z: 0 }, 0.8);
      }
      if (!p.struck && k > 0.55) {
        p.struck = true;
        _a.set(p.mesh.position.x, p.mesh.position.y + 36, p.mesh.position.z);
        this.bolt(_a, p.mesh.position, p.theme, { life: 0.35, width: 0.45, jag: 1.4, segs: 12 });
        this.orb(p.mesh.position, p.theme, p.size * 0.9, 0.35, { grow: 1.2 });
        game.effects.ring(p.mesh.position, p.size * 1.6, p.theme.ring);
        game.cameraRig.addShake?.(0.12);
      }
      if (k < 0.02) p.struck = false;
    }

    for (const s of this.shields) {
      if (s.life <= 0) { if (s.mesh.visible) s.mesh.visible = false; continue; }
      s.life -= dt;
      const e = s.entity;
      if (!e || e.isDead || e.removed) { s.life = 0; continue; }
      const k = 1 - s.life / s.max;
      const fade = k < 0.08 ? k / 0.08 : s.life < 0.5 ? s.life / 0.5 : 1;
      s.mesh.position.set(e.position.x, (e.visualY ?? e.position.y) + 0.95 * (e.model?.look?.scale ?? 1), e.position.z);
      s.mesh.scale.setScalar(s.radius * (e.model?.look?.scale ?? 1));
      const u = s.mesh.material.uniforms;
      u.alpha.value = fade;
      u.time.value = this.time;
    }

    for (let i = this.auras.length - 1; i >= 0; i--) {
      const a = this.auras[i];
      const e = a.entity;
      if (this.time > a.until || !e || e.isDead || e.removed) { this.auras.splice(i, 1); continue; }
      a.acc += dt * a.rate;
      const sc = e.model?.look?.scale ?? 1;
      while (a.acc >= 1) {
        a.acc -= 1;
        const ang = Math.random() * Math.PI * 2, h = Math.random() * 1.9 * sc;
        _a.set(e.position.x + Math.cos(ang) * a.radius * sc, (e.visualY ?? e.position.y) + h, e.position.z + Math.sin(ang) * a.radius * sc);
        game.effects.puff(a.theme.puff, _a, { x: -Math.sin(ang) * 1.6, y: 1.2 + Math.random(), z: Math.cos(ang) * 1.6 }, 0.5 + Math.random() * 0.4);
      }
    }

    this._updateChunks(dt);

    for (const c of this.craters) {
      if (!c.mesh.visible) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      if (c.life < 10) c.mesh.material.opacity = c.life / 10;
    }

    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.w += dt * 3.2;
      if (!f.landed) {
        f.angle = Math.min(Math.PI / 2 - 0.05, f.angle + f.w * dt);
        f.g.quaternion.setFromAxisAngle(f.axis, f.angle);
        if (f.angle >= Math.PI / 2 - 0.05) {
          f.landed = true;
          _a.set(f.g.position.x, f.g.position.y + 0.8, f.g.position.z);
          game.effects.burst(_a, { x: 0, y: 1, z: 0 }, 'leaf', 26);
          game.effects.puff('dust', _a, { x: 0, y: 1, z: 0 }, 1.2);
          game.audio.slam?.(f.g.position, 0.35);
        }
      } else if (f.t > 4) {
        f.g.scale.multiplyScalar(Math.max(0, 1 - dt * 2.5));
        if (f.g.scale.x < 0.05) {
          f.g.removeFromParent();
          for (const m of f.mats) m.dispose();
          this.falling.splice(i, 1);
        }
      }
    }

    this._updateProjectiles(dt);
  }

  _updateChunks(dt) {
    const world = this.game.world;
    let max = 0;
    for (let i = 0; i < MAX_CHUNKS; i++) {
      const c = this.chunkData[i];
      if (c.life <= 0) {
        if (c.dirty) { _m.makeScale(0, 0, 0); this.chunkMesh.setMatrixAt(i, _m); c.dirty = false; }
        continue;
      }
      max = i + 1;
      c.life -= dt;
      c.dirty = true;
      c.v.y -= 20 * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.addScaledVector(c.w, dt);
      const g = world.getGroundHeight(c.p.x, c.p.z) + c.s.y * 0.4;
      if (c.p.y < g) {
        c.p.y = g;
        if (c.v.y < -1.5) c.v.y = -c.v.y * 0.32; else c.v.y = 0;
        c.v.x *= 0.7; c.v.z *= 0.7;
        c.w.multiplyScalar(0.6);
      }
      const k = c.life < 0.6 ? Math.max(0, c.life / 0.6) : 1;
      _s.copy(c.s).multiplyScalar(k);
      _e.set(c.r.x, c.r.y, c.r.z);
      _q.setFromEuler(_e);
      _m.compose(c.p, _q, _s);
      this.chunkMesh.setMatrixAt(i, _m);
    }
    this.chunkMesh.count = Math.max(this.chunkMesh.count > 0 ? max : max, max);
    this.chunkMesh.count = MAX_CHUNKS;
    this.chunkMesh.instanceMatrix.needsUpdate = true;
  }

  _updateProjectiles(dt) {
    const { game } = this;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      // Самонаведение.
      if (p.homing) {
        const tgt = typeof p.homing === 'function' ? p.homing() : p.homing;
        if (tgt && !tgt.isDead && !tgt.removed) {
          _a.set(tgt.position.x, (tgt.visualY ?? tgt.position.y) + 1.1, tgt.position.z).sub(p.pos).normalize();
          p.dir.lerp(_a, Math.min(1, p.turn * dt)).normalize();
        }
      }
      const step = p.speed * dt;
      const hit = raycastAll(game, p.pos, p.dir, step + p.radius, p.ignore);
      let end = false, point = null, target = null;
      if (hit && hit.t <= step + p.radius) {
        // Своих не задеваем: фильтр по only.
        if (hit.kind === 'character' && p.only && !p.only(hit.character)) {
          // пролетает сквозь
        } else {
          end = true;
          point = hit.point;
          target = hit;
        }
      }
      if (!end && p.life <= 0) { end = true; point = p.pos.clone(); }
      if (!end) {
        // Лёгкая трасса.
        p.pos.addScaledVector(p.dir, step);
        this.orb(p.pos, p.theme, p.kind === 'missile' ? 0.9 : 1.5, 0.12, { grow: -0.2 });
        p.trail -= dt;
        if (p.trail <= 0) {
          p.trail = 0.03;
          game.effects.puff(p.kind === 'missile' ? 'smoke' : p.theme.puff, p.pos, { x: (Math.random() - 0.5), y: (Math.random() - 0.3), z: (Math.random() - 0.5) }, p.kind === 'missile' ? 0.35 : 0.55);
          if (p.kind === 'missile') game.effects.puff('fire', p.pos, { x: 0, y: 0, z: 0 }, 0.4);
        }
        continue;
      }
      this.projectiles.splice(i, 1);
      if (p.onHit) p.onHit(point, target);
      this.explosion(point, { theme: p.theme, aoe: p.aoe, damage: p.damage, force: p.force, owner: p.owner, only: p.only, big: p.kind === 'missile' });
    }
  }
}
