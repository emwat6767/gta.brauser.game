import * as THREE from 'three';
import { SCHOOL } from './config.js';
import { BLD, GYM, FLOOR_H, CEIL_H, zoneAt } from './layout.js';

// Пожар: клетки 0.5 м по этажам (топливо зависит от комнаты: библиотека горит сильно, туалет — нет),
// огонь растёт и перекидывается на соседей; между комнатами — только через открытые двери и арки,
// закрытая дверь держит огонь, пока не прогорит. Дым копится по зонам (комнаты, участки коридора),
// перетекает в соседние через открытые проёмы, по лестнице поднимается на 2 этаж, слой дыма
// опускается от потолка. Выше слоя дыма — тяжело дышать (присядь!), в огне — ожоги.

const CELL = 0.5;
const FUEL = {
  library: 1.0, storage: 0.95, gymstore: 0.9, assembly: 0.85, teachers: 0.8, principal: 0.8, classroom: 0.72, computer: 0.7,
  lab: 0.75, cafeteria: 0.6, nurse: 0.5, hall: 0.45, lobby: 0.4, gym: 0.35, corridor: 0.32, stairs: 0.15, wc: 0.12,
};

const FLAME_VS = `
attribute vec2 aFire;
varying vec2 vUv;
varying vec2 vF;
void main() {
  vUv = uv;
  vF = aFire;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FLAME_FS = `
uniform float uTime;
varying vec2 vUv;
varying vec2 vF;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float t = uTime * 2.3 + vF.x * 17.0;
  vec2 uv = vUv;
  float n = noise(vec2(uv.x * 4.0 + vF.x * 3.0, uv.y * 3.0 - t * 1.7)) * 0.6 + noise(vec2(uv.x * 9.0, uv.y * 7.0 - t * 3.1)) * 0.4;
  float shape = (1.0 - uv.y) * (1.0 - abs(uv.x - 0.5) * 2.1);
  float f = shape * 1.7 - n * 0.95 + 0.12;
  float a = smoothstep(0.05, 0.42, f) * vF.y;
  if (a < 0.02) discard;
  vec3 col = mix(vec3(1.0, 0.22, 0.02), vec3(1.0, 0.86, 0.4), smoothstep(0.35, 0.95, f));
  gl_FragColor = vec4(col * a * 1.5, a);
}`;

export class FireSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.floors = [this._grid(0, BLD.x0, GYM.x1), this._grid(1, BLD.x0, BLD.x1)];
    this.zoneSmoke = new Map();   // zoneId -> 0..1
    this.zoneProd = new Map();
    this.stepT = 0;
    this.burning = 0;
    this.everBurnt = 0;
    this.extinguished = 0;        // клеток потушено игроком
    this._buildZones();
    this._buildVisuals();
  }

  _grid(floor, x0, x1) {
    const z0 = BLD.z0, z1 = BLD.z1;
    const w = Math.round((x1 - x0) / CELL), h = Math.round((z1 - z0) / CELL);
    const n = w * h;
    const g = { floor, x0, z0, w, h, n, fuel: new Float32Array(n), heat: new Float32Array(n), wet: new Float32Array(n),
      burnt: new Uint8Array(n), zone: new Array(n), linkX: new Array(n), linkZ: new Array(n), y: floor * FLOOR_H };
    const school = this.game.school;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
      const zone = zoneAt(x, z, floor);
      g.zone[k] = zone ? zone.id : null;
      g.fuel[k] = zone ? (FUEL[zone.type] ?? 0.3) * (0.75 + Math.random() * 0.5) : 0;
      if (zone && zone.type === 'stairs' && z > 3) g.fuel[k] = 0;
    }
    g.fuel0 = g.fuel.slice();
    // Связи между соседними клетками: та же зона, проём (дверь/арка) или стена.
    const ops = school.openings;
    const doors = this.game.doors.list;
    const findLink = (axis, c, s, y) => {
      for (const o of ops) {
        if (o.axis !== axis || Math.abs(o.c - c) > 0.02 || s < o.a || s > o.b || y < o.y0 - 0.1 || y > o.y1) continue;
        if (o.kind === 'window') continue;
        if (o.kind === 'open') return 'open';
        const d = doors.find((dd) => dd.axis === axis && Math.abs(dd.c - c) < 0.02 && s >= dd.a && s <= dd.b && Math.abs(dd.y0 - o.y0) < 0.1);
        return d ?? 'wall';
      }
      return 'wall';
    };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (i + 1 < w) {
        const a = g.zone[k], b = g.zone[k + 1];
        g.linkX[k] = !a || !b ? 'wall' : a === b || (a.startsWith('cor') && b.startsWith('cor')) ? 'same' : findLink('z', x0 + (i + 1) * CELL, z0 + (j + 0.5) * CELL, g.y + 0.2);
      }
      if (j + 1 < h) {
        const a = g.zone[k], b = g.zone[k + w];
        g.linkZ[k] = !a || !b ? 'wall' : a === b ? 'same' : findLink('x', z0 + (j + 1) * CELL, x0 + (i + 0.5) * CELL, g.y + 0.2);
      }
    }
    return g;
  }

  // Зоны дыма: объём, связи (двери/арки), выход наружу.
  _buildZones() {
    const school = this.game.school;
    this.zones = school.zones.map((z) => {
      const h = z.type === 'gym' ? GYM.h - 0.2 : z.type === 'stairs' ? FLOOR_H : CEIL_H;
      return { id: z.id, z, vol: (z.x1 - z.x0) * (z.z1 - z.z0) * h, floorY: z.type === 'gym' || z.type === 'gymstore' ? 0 : z.floor * FLOOR_H, h };
    });
    this.zoneIdx = new Map(this.zones.map((z, i) => [z.id, i]));
    for (const z of this.zones) { this.zoneSmoke.set(z.id, 0); this.zoneProd.set(z.id, 0); }
    const links = [];
    const add = (a, b, w, door = null, up = false) => {
      if (this.zoneIdx.has(a) && (b === 'outside' || this.zoneIdx.has(b))) links.push({ a, b, w, door, up });
    };
    for (const d of this.game.doors.list) add(d.zones[0] === 'outside' ? d.zones[1] : d.zones[0], d.exterior ? 'outside' : d.zones[1], d.b - d.a, d);
    for (const o of school.openings) {
      if (o.kind !== 'open') continue;
      const floor = o.y0 > 1 ? 1 : 0;
      const mid = (o.a + o.b) / 2;
      const cor = school.zones.find((z) => z.type === 'corridor' && z.floor === floor && mid >= z.x0 && mid <= z.x1);
      add(o.room, cor?.id, o.b - o.a);
    }
    for (const f of [0, 1]) for (let i = 0; i < 4; i++) add(`cor${f}_${i}`, `cor${f}_${i + 1}`, 3);
    add('stW0', 'stW1', 6, null, true);
    add('stE0', 'stE1', 6, null, true);
    this.links = links;
  }

  _buildVisuals() {
    const scene = this.game.scene;
    // Языки пламени.
    const q1 = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const q2 = q1.clone().rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...q1.attributes.position.array, ...q2.attributes.position.array], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([...q1.attributes.uv.array, ...q2.attributes.uv.array], 2));
    geo.setIndex([...q1.index.array, ...q2.index.array.map((i) => i + 4)]);
    this.maxFlames = this.game.mobile ? 260 : 600;
    this.aFire = new THREE.InstancedBufferAttribute(new Float32Array(this.maxFlames * 2), 2);
    this.aFire.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFire', this.aFire);
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.flames = new THREE.InstancedMesh(geo, this.flameMat, this.maxFlames);
    this.flames.count = 0;
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 4;
    scene.add(this.flames);
    // Гарь на полу.
    this.maxScorch = 1800;
    this.scorch = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#141210', transparent: true, opacity: 0.82, depthWrite: false }), this.maxScorch);
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    scene.add(this.scorch);
    // Слои дыма по зонам: коробки от низа слоя до потолка.
    this.smokeMeshes = new Map();
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    for (const z of this.zones) {
      const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: '#3a3836', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.renderOrder = 5;
      m.position.set((z.z.x0 + z.z.x1) / 2, 0, (z.z.z0 + z.z.z1) / 2);
      m.scale.set(z.z.x1 - z.z.x0 - 0.02, 1, z.z.z1 - z.z.z0 - 0.02);
      scene.add(m);
      this.smokeMeshes.set(z.id, m);
    }
    // Свет от огня.
    this.lights = [];
    for (let i = 0; i < (this.game.mobile ? 1 : 3); i++) {
      const l = new THREE.PointLight('#ff7a2a', 0, 9, 2);
      scene.add(l);
      this.lights.push(l);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  // --- запросы ---------------------------------------------------------------------------

  cellIndex(g, x, z) {
    const i = Math.floor((x - g.x0) / CELL), j = Math.floor((z - g.z0) / CELL);
    if (i < 0 || j < 0 || i >= g.w || j >= g.h) return -1;
    return j * g.w + i;
  }

  heatAt(x, z, floor) {
    const g = this.floors[floor];
    const k = g ? this.cellIndex(g, x, z) : -1;
    return k < 0 ? 0 : g.heat[k];
  }

  heatNear(x, z, floor, r) {
    const g = this.floors[floor];
    if (!g || !this.active) return 0;
    let best = 0;
    const n = Math.ceil(r / CELL);
    const ci = Math.floor((x - g.x0) / CELL), cj = Math.floor((z - g.z0) / CELL);
    for (let dj = -n; dj <= n; dj += 2) for (let di = -n; di <= n; di += 2) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
      const h = g.heat[j * g.w + i];
      if (h > best) best = h * (1 - Math.hypot(di, dj) * CELL / (r + 1));
    }
    return best;
  }

  smokeOf(zoneId) {
    return this.zoneSmoke.get(zoneId) ?? 0;
  }

  // Высота нижней границы дыма в зоне (мировая Y).
  smokeBottom(zoneId) {
    const i = this.zoneIdx.get(zoneId);
    if (i === undefined) return 99;
    const z = this.zones[i], s = this.zoneSmoke.get(zoneId);
    return z.floorY + z.h - s * (z.h - 0.45);
  }

  nearestBurning(x, z, floor) {
    const g = this.floors[floor];
    if (!g) return null;
    let best = -1, bd = Infinity;
    for (let k = 0; k < g.n; k++) {
      if (g.heat[k] < 0.25) continue;
      const cx = g.x0 + ((k % g.w) + 0.5) * CELL, cz = g.z0 + (Math.floor(k / g.w) + 0.5) * CELL;
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return null;
    return { x: g.x0 + ((best % g.w) + 0.5) * CELL, z: g.z0 + (Math.floor(best / g.w) + 0.5) * CELL, floor };
  }

  // --- управление --------------------------------------------------------------------------

  start(x, z, floor, r = 1.2) {
    this.active = true;
    const g = this.floors[floor];
    for (let dz = -r; dz <= r; dz += CELL) for (let dx = -r; dx <= r; dx += CELL) {
      const k = this.cellIndex(g, x + dx, z + dz);
      if (k >= 0 && g.fuel[k] > 0) { g.heat[k] = 0.55 + Math.random() * 0.3; g.fuel[k] = Math.max(g.fuel[k], 0.9); }
    }
    this.origin = { x, z, floor, zone: zoneAt(x, z, floor)?.id };
  }

  // Потушить в конусе: (x, z) — откуда, heading — куда, range, halfAngle, amount за вызов.
  extinguishCone(x, z, floor, heading, range, halfAngle, amount, byPlayer = false) {
    const g = this.floors[floor];
    if (!g) return 0;
    const fx = Math.sin(heading), fz = Math.cos(heading), cosA = Math.cos(halfAngle);
    const n = Math.ceil(range / CELL);
    const ci = Math.floor((x - g.x0) / CELL), cj = Math.floor((z - g.z0) / CELL);
    let put = 0;
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= g.w || j >= g.h) continue;
      const k = j * g.w + i;
      if (g.heat[k] <= 0) continue;
      const dx = di * CELL, dz = dj * CELL, d = Math.hypot(dx, dz);
      if (d > range || (d > 0.6 && (dx * fx + dz * fz) / d < cosA)) continue;
      const before = g.heat[k];
      g.heat[k] = Math.max(0, g.heat[k] - amount * (1.2 - d / range * 0.6));
      g.wet[k] = 25;
      if (before >= 0.25 && g.heat[k] < 0.25) { put++; if (byPlayer) this.extinguished++; }
    }
    return put;
  }

  // --- симуляция ----------------------------------------------------------------------------

  update(dt) {
    this.flameMat.uniforms.uTime.value += dt;
    if (!this.active) return;
    this.stepT += dt;
    if (this.stepT >= 0.2) {
      const step = this.stepT;
      this.stepT = 0;
      this._stepFire(step);
      this._stepSmoke(step);
    }
    this._visuals(dt);
  }

  _stepFire(dt) {
    const spread = SCHOOL.fire.spread[this.game.difficulty];
    let burning = 0;
    for (const z of this.zones) this.zoneProd.set(z.id, 0);
    for (const g of this.floors) {
      const { w, h, heat, fuel, wet } = g;
      for (let k = 0; k < g.n; k++) {
        if (wet[k] > 0) wet[k] -= dt;
        const hk = heat[k];
        if (hk <= 0) continue;
        if (hk < 0.25) { heat[k] = Math.max(0, hk - dt * 0.05); continue; }
        burning++;
        // Рост и выгорание.
        const cap = Math.min(1.25, fuel[k] * 1.4 + 0.1);
        heat[k] = Math.min(cap, hk + dt * 0.12);
        fuel[k] = Math.max(0, fuel[k] - dt * 0.011 * hk);
        if (fuel[k] < 0.03) { heat[k] = Math.max(0, hk - dt * 0.2); if (!g.burnt[k]) { g.burnt[k] = 1; this.everBurnt++; } }
        if (hk > 0.4 && !g.burnt[k] && Math.random() < dt * 0.15) { g.burnt[k] = 1; this.everBurnt++; }
        const zid = g.zone[k];
        if (zid) this.zoneProd.set(zid, this.zoneProd.get(zid) + hk);
        // Переброс на соседей.
        const i = k % w, j = (k - i) / w;
        const tryN = (nk, link) => {
          if (nk < 0 || heat[nk] >= 0.25 || fuel[nk] < 0.05) return;
          if (link === 'wall' || link === undefined) return;
          if (link !== 'same' && link !== 'open') {
            const d = link;
            if (!d.broken && d.open < 0.3) {
              // Закрытая дверь держит огонь, но прогорает.
              d.fireDmg = (d.fireDmg ?? 0) + dt * hk;
              if (d.fireDmg > 35) this.game.doors.damage(d, 999);
              return;
            }
          }
          const p = spread * hk * fuel[nk] * (wet[nk] > 0 ? 0.15 : 1) * (dt / 0.2);
          if (Math.random() < p) heat[nk] = Math.max(heat[nk], 0.3);
        };
        if (i + 1 < w) tryN(k + 1, g.linkX[k]);
        if (i > 0) tryN(k - 1, g.linkX[k - 1]);
        if (j + 1 < h) tryN(k + w, g.linkZ[k]);
        if (j > 0) tryN(k - w, g.linkZ[k - w]);
      }
    }
    this.burning = burning;
    // Нет огня и дым почти рассеялся — пожар кончился.
    if (!burning) {
      let any = false;
      for (const v of this.zoneSmoke.values()) if (v > 0.05) any = true;
      if (!any) this.out = true;
    }
  }

  _stepSmoke(dt) {
    const S = this.zoneSmoke;
    for (const z of this.zones) {
      const p = this.zoneProd.get(z.id);
      if (p > 0) S.set(z.id, Math.min(1, S.get(z.id) + p * dt * 2.4 / z.vol));
    }
    for (const L of this.links) {
      let open = true;
      if (L.door) open = L.door.broken || L.door.open > 0.3;
      const sa = S.get(L.a), sb = L.b === 'outside' ? 0 : S.get(L.b);
      if (!open) {
        // Под закрытой дверью тянет понемногу.
        if (Math.abs(sa - sb) < 0.05) continue;
      }
      const k = (open ? 1 : 0.06) * L.w * dt * (L.up ? 3.0 : 1.4);
      if (L.b === 'outside') {
        const za = this.zones[this.zoneIdx.get(L.a)];
        S.set(L.a, Math.max(0, sa - (k * sa * 2.5) / za.vol * 6));
        continue;
      }
      const za = this.zones[this.zoneIdx.get(L.a)], zb = this.zones[this.zoneIdx.get(L.b)];
      let flow = k * (sa - sb);
      if (L.up) flow = k * (sa - sb * 0.4);   // по лестнице дым идёт вверх
      S.set(L.a, Math.max(0, Math.min(1, sa - flow * 8 / za.vol)));
      S.set(L.b, Math.max(0, Math.min(1, sb + flow * 8 / zb.vol)));
    }
    // Медленное рассеивание, быстрее — когда огня нет.
    const decay = this.burning ? 0.0015 : 0.02;
    for (const [id, v] of S) if (v > 0) S.set(id, Math.max(0, v - decay * dt));
  }

  _visuals(dt) {
    const game = this.game;
    const cam = game.camera.position;
    const pf = game.player.floor;
    // Пламя: ближайшие к камере горящие клетки.
    let n = 0, sc = 0;
    const lightsCand = [];
    const m = this._m, q = this._q, s = this._s, p = this._p;
    for (const g of this.floors) {
      const near = Math.abs(g.y - game.player.pos.y) < 2.6 || game.player.zone === null;
      for (let k = 0; k < g.n; k++) {
        const hk = g.heat[k];
        const x = g.x0 + ((k % g.w) + 0.5) * CELL, z = g.z0 + (Math.floor(k / g.w) + 0.5) * CELL;
        if (g.burnt[k] && sc < this.maxScorch) {
          m.makeTranslation(x, g.y + 0.012, z);
          this.scorch.setMatrixAt(sc++, m);
        }
        if (hk < 0.25 || n >= this.maxFlames) continue;
        const d2 = (x - cam.x) ** 2 + (z - cam.z) ** 2;
        if (!near && d2 > 400) continue;
        if (d2 > 2500) continue;
        const h = 0.5 + hk * 1.6;
        const r = ((k * 7919) % 100) / 100;
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r * 3.14);
        s.set(0.75 + hk * 0.35, h, 0.75 + hk * 0.35);
        p.set(x + (r - 0.5) * 0.25, g.y, z + (((k * 31) % 100) / 100 - 0.5) * 0.25);
        m.compose(p, q, s);
        this.flames.setMatrixAt(n, m);
        this.aFire.setXY(n, r, Math.min(1, 0.45 + hk * 0.55));
        n++;
        if (d2 < 900) lightsCand.push({ x, y: g.y + 1, z, d2, hk, floor: g.floor });
        // Дым и искры от огня рядом с камерой.
        if (d2 < 500 && Math.random() < dt * 0.9 * hk) game.effects.puff('smoke', { x, y: g.y + 1.2 + hk, z }, { x: 0, y: 0.5, z: 0 }, 0.8);
        if (d2 < 300 && Math.random() < dt * 0.6 * hk) game.effects.puff('fire', { x, y: g.y + 0.6 * hk, z }, { x: 0, y: 1, z: 0 }, 0.6);
      }
    }
    this.flames.count = n;
    this.flames.instanceMatrix.needsUpdate = true;
    this.aFire.needsUpdate = true;
    this.scorch.count = sc;
    this.scorch.instanceMatrix.needsUpdate = true;
    lightsCand.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.lights.length; i++) {
      const c = lightsCand[i * 3];
      const l = this.lights[i];
      if (c && (c.floor === pf || !game.player.zone)) {
        l.position.set(c.x, c.y, c.z);
        l.intensity = (10 + c.hk * 14) * (0.8 + Math.random() * 0.4);
      } else l.intensity = 0;
    }
    // Слои дыма.
    for (const z of this.zones) {
      const v = this.zoneSmoke.get(z.id);
      const mesh = this.smokeMeshes.get(z.id);
      if (v < 0.03 || (z.z.floor !== pf && z.z.type !== 'stairs' && z.z.type !== 'gym')) { mesh.visible = false; continue; }
      const bottom = this.smokeBottom(z.id);
      const top = z.floorY + z.h - 0.02;
      mesh.visible = true;
      mesh.position.y = bottom;
      mesh.scale.y = Math.max(0.05, top - bottom);
      mesh.material.opacity = Math.min(0.88, 0.12 + v * 0.75);
    }
  }

  // Урон людям: огонь под ногами, дым на уровне головы.
  hurtPeople(dt, people) {
    if (!this.active) return;
    for (const p of people) {
      if (!p.alive || p.saved) continue;
      const f = p.floor;
      const heat = this.heatAt(p.pos.x, p.pos.z, f);
      if (heat > 0.3) p.takeDamage(28 * heat * dt, null, 'fire');
      const zone = p.zone;
      if (!zone) continue;
      const s = this.smokeOf(zone.id);
      if (s < 0.05) { p.cough = Math.max(0, p.cough - dt); continue; }
      const head = p.eye().y;
      const bottom = this.smokeBottom(zone.id);
      if (head > bottom) {
        const dmg = (1.5 + 9 * s) * dt * (p.role === 'fireman' ? 0 : 1);
        p.takeDamage(dmg, null, 'smoke');
        p.cough += dt;
      } else if (s > 0.6) {
        p.takeDamage(0.6 * s * dt, null, 'smoke');
      }
    }
  }

  // Стоимость пути для навигации: горящие клетки почти непроходимы, густой дым — дороже.
  applyNavCosts(nav) {
    for (const g of this.floors) {
      const grid = nav.grids[g.floor];
      for (let k = 0; k < g.n; k++) {
        const x = g.x0 + ((k % g.w) + 0.5) * CELL, z = g.z0 + (Math.floor(k / g.w) + 0.5) * CELL;
        const ni = grid.idx(x, z);
        if (ni < 0) continue;
        const h = g.heat[k];
        const zid = g.zone[k];
        const s = zid ? this.smokeOf(zid) : 0;
        grid.extraCost[ni] = h >= 0.25 ? 60 : h > 0.05 ? 4 : s > 0.5 ? 1.5 * s : 0;
      }
    }
  }

  reset() {
    this.active = false;
    this.out = false;
    for (const g of this.floors) { g.heat.fill(0); g.wet.fill(0); g.burnt.fill(0); g.fuel.set(g.fuel0); }
    this.burning = 0;
    this.everBurnt = 0;
    this.extinguished = 0;
    for (const d of this.game.doors.list) d.fireDmg = 0;
    for (const id of this.zoneSmoke.keys()) this.zoneSmoke.set(id, 0);
    this.flames.count = 0;
    this.scorch.count = 0;
    for (const m of this.smokeMeshes.values()) m.visible = false;
    for (const l of this.lights) l.intensity = 0;
  }
}
