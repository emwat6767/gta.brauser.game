import * as THREE from 'three';
import { mergeColored } from './geometry.js';
import { createRng } from './utils.js';
import { flagTexture } from './war-data.js';

// Постройки режима «Война стран»: дома, бункеры, ангары, руины, мешки с песком, контейнеры, палатки, флагштоки.
// Всё собирается из примитивов, склеивается в 2 меша (корпус и крыша) на постройку и ставится на время войны.
//
// Укрытия: стены — AABB-коллайдеры от земли до своей высоты (collision.js), поэтому
//   • окно — это подоконник (коллайдер 1 м): пули идут над ним, стрелять из окна можно, спрятаться от пуль — присев за стеной;
//   • дверь — проём без коллайдера; стены целиком непробиваемы; мешки с песком (1.35 м) закрывают до пояса;
//   • крыши только рисуются (камера сверху видит внутрь, когда игрок в доме — крыша прячется).
// Для ИИ каждая постройка отдаёт места обороны (cover): { x, z, face, kind, taken } — у окон и дверей, лицом наружу.
//
// build<Name>(builder, x, z, opts) -> Structure { footprint, colliders, cover, roof, group, vehicleSlots? }

const col = (c) => new THREE.Color(c);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, seg, x, y, z) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);

const PLASTER = ['#d8cfb8', '#c9bfa5', '#bfb8a8', '#d9c9a3', '#c7b99a', '#b9c0b4', '#cfc6c0'];
const BRICK = ['#a8573a', '#9c5a3f', '#b0643f'];
const ROOF = ['#6b3a2a', '#4f3b34', '#5b4036', '#3f4a52', '#6a4b30'];
const CONCRETE = '#9a9890';
const DARK = '#23262a';
const WOOD = '#6e4a2a';

let MAT = null;
const material = () => (MAT ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }));

export class Structure {
  constructor(builder, name, x, z) {
    this.b = builder;
    this.name = name;
    this.x = x;
    this.z = z;
    this.parts = [];
    this.roofParts = [];
    this.colliders = [];
    this.cover = [];
    this.group = new THREE.Group();
    this.roof = null;
    this.footprint = { minX: x, maxX: x, minZ: z, maxZ: z };
    this.y0 = builder.y0;
    this.ruin = false;
  }

  part(geometry, color) { this.parts.push({ geometry, color: col(color) }); }
  roofPart(geometry, color) { this.roofParts.push({ geometry, color: col(color) }); }

  grow(minX, maxX, minZ, maxZ) {
    const f = this.footprint;
    f.minX = Math.min(f.minX, minX); f.maxX = Math.max(f.maxX, maxX);
    f.minZ = Math.min(f.minZ, minZ); f.maxZ = Math.max(f.maxZ, maxZ);
  }

  // Коллайдер от земли до абсолютной высоты height.
  collide(minX, maxX, minZ, maxZ, height, type = 'building') {
    this.colliders.push({ minX, maxX, minZ, maxZ, height, type, war: true });
    this.grow(minX, maxX, minZ, maxZ);
  }

  // Прямой участок стены: axis 'x' (вдоль X на линии z = c) или 'z'; a0..a1 — границы, t — толщина, h — высота стены от пола.
  // ops: проёмы [{ c, w, type: 'door' | 'window' | 'slit', sill, top }] (c — центр вдоль стены).
  wall(axis, a0, a1, c, t, h, ops, color, trim = DARK) {
    const y0 = this.y0;
    const list = [...ops].sort((p, q) => p.c - q.c);
    const solid = (l, r) => {
      if (r - l < 0.02) return;
      // руины: куски стены разной высоты (и пролом до пола)
      const hh = this.ruin ? (this.b.rng.chance(0.25) ? 0.7 : Math.max(1.1, h - this.b.rng.range(0, 2.2))) : h;
      this.span(axis, l, r, c, t, 0, hh, color);
      this._coll(axis, l, r, c, t, y0 + hh);
    };
    let cur = a0;
    for (const op of list) {
      const lo = op.c - op.w / 2, hi = op.c + op.w / 2;
      solid(cur, lo);
      const sill = op.type === 'door' ? 0 : op.sill ?? 1.0;
      const top = op.top ?? (op.type === 'door' ? 2.2 : op.type === 'slit' ? 1.6 : 2.2);
      if (sill > 0) {
        this.span(axis, lo, hi, c, t, 0, sill, color);
        this._coll(axis, lo, hi, c, t, y0 + sill, 'barrier');
      }
      if (h - top > 0.02) this.span(axis, lo, hi, c, t, top, h, color);
      // рамы: тёмные стойки по краям проёма и перемычка
      const fy = sill, ft = t + 0.06;
      this.span(axis, lo - 0.05, lo + 0.05, c, ft, fy, top, trim);
      this.span(axis, hi - 0.05, hi + 0.05, c, ft, fy, top, trim);
      if (sill > 0) this.span(axis, lo, hi, c, ft, sill - 0.05, sill + 0.03, trim);
      this.span(axis, lo, hi, c, ft, top - 0.05, top + 0.04, trim);
      // подошва стойки для двери
      if (op.type === 'door') this.span(axis, lo, hi, c, ft, 0, 0.03, '#4a4a46');
      // место обороны внутри проёма
      if (op.cover !== false) {
        const inward = op.inward ?? 1;   // куда «внутрь»: +1 / -1 по нормали стены
        const off = (t / 2 + 0.55) * inward;
        const outward = -inward;
        const slot = axis === 'x'
          ? { x: op.c, z: c + off, face: outward > 0 ? 0 : Math.PI }
          : { x: c + off, z: op.c, face: outward > 0 ? Math.PI / 2 : -Math.PI / 2 };
        this.cover.push({ ...slot, kind: op.type, taken: null, owner: this });
      }
      cur = hi;
    }
    solid(cur, a1);
  }

  span(axis, l, r, c, t, y0, y1, color) {
    const len = r - l, hh = y1 - y0;
    if (len <= 0 || hh <= 0) return;
    const yc = this.y0 + y0 + hh / 2;
    this.part(axis === 'x' ? box(len, hh, t, (l + r) / 2, yc, c) : box(t, hh, len, c, yc, (l + r) / 2), color);
  }

  _coll(axis, l, r, c, t, height, type = 'building') {
    if (axis === 'x') this.collide(l, r, c - t / 2, c + t / 2, height, type);
    else this.collide(c - t / 2, c + t / 2, l, r, height, type);
  }

  // Сборка мешей и регистрация в мире.
  finish() {
    const world = this.b.game.world;
    if (this.parts.length) {
      const m = new THREE.Mesh(mergeColored(this.parts), material());
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    if (this.roofParts.length) {
      const m = new THREE.Mesh(mergeColored(this.roofParts), material());
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      this.roof = m;
    }
    this.b.group.add(this.group);
    for (const c of this.colliders) world.colliders.add(c);
    const f = this.footprint;
    this.minimap = { minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ, height: 3, type: 'building', war: true };
    world.buildings.push(this.minimap);
    for (const c of this.cover) this.b.covers.push(c);
    this.b.structures.push(this);
    return this;
  }
}

export class WarBuilder {
  constructor(game) {
    this.game = game;
    this.y0 = game.world.curbHeight;
    this.group = new THREE.Group();
    this.group.name = 'war-structures';
    game.scene.add(this.group);
    this.structures = [];
    this.covers = [];
    this.flags = [];
    this.pickups = [];
    this.decals = [];
    this.rng = createRng(90210);
    this.clearedTrees = [];
  }

  dispose() {
    const world = this.game.world;
    for (const s of this.structures) {
      for (const c of s.colliders) world.colliders.remove(c);
      const i = world.buildings.indexOf(s.minimap);
      if (i >= 0) world.buildings.splice(i, 1);
    }
    for (const it of this.pickups) {
      const i = this.game.pickups.items.indexOf(it);
      if (i >= 0) this.game.pickups._remove(i);
    }
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        if (o.material && o.material !== MAT && o.material.dispose) o.material.dispose();
      }
    });
    this.group.removeFromParent();
    world.restoreTrees?.(this.clearedTrees);
    this.structures = [];
    this.covers = [];
    this.flags = [];
    this.clearedTrees = [];
  }

  // Убрать парковые деревья под постройкой (вернутся после войны).
  clearTrees(f, margin = 1.8) {
    const world = this.game.world;
    const list = world.clearTreesIn?.(f.minX - margin, f.maxX + margin, f.minZ - margin, f.maxZ + margin) ?? [];
    this.clearedTrees.push(...list);
  }

  // ------------------------------------------------------------ дома

  // Дом: w × d (по X и Z), door — сторона двери: 'S' (−Z) | 'N' | 'E' | 'W'; windows — окон на каждой стороне (по разу [S, N, E, W]).
  house(x, z, { w = 9, d = 7, door = 'S', windows = [1, 1, 1, 1], wall = null, roofColor = null, gable = true, floors = 1, ruin = false, seed = 1 } = {}) {
    const rng = createRng(seed * 7919 + Math.round(x * 3 + z));
    const s = new Structure(this, 'house', x, z);
    s.ruin = ruin;
    const t = 0.36, h = 3.0 * floors;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const wallColor = wall ?? rng.pick(rng.chance(0.3) ? BRICK : PLASTER);
    s.grow(x0, x1, z0, z1);
    // пол
    s.part(box(w - 0.1, 0.1, d - 0.1, x, s.y0 + 0.03, z), '#6a5a48');
    const opsFor = (side, len) => {
      const ops = [];
      if (side === door) ops.push({ c: 0, w: 1.4, type: 'door' });
      const n = windows[['S', 'N', 'E', 'W'].indexOf(side)] ?? 0;
      for (let k = 0; k < n; k++) {
        const off = n === 1 ? (side === door ? len * 0.3 : 0) : ((k + 0.5) / n - 0.5) * len * 0.8;
        if (side === door && Math.abs(off) < 1.5) continue;
        ops.push({ c: off, w: 1.3, type: 'window', sill: 1.0, top: 2.2 });
      }
      return ops;
    };
    const shift = (ops, base, inward) => ops.map((o) => ({ ...o, c: base + o.c, inward }));
    // южная и северная стены — на всю ширину, западная и восточная — между ними
    s.wall('x', x0, x1, z0 + t / 2, t, h, shift(opsFor('S', w), x, 1), wallColor);
    s.wall('x', x0, x1, z1 - t / 2, t, h, shift(opsFor('N', w), x, -1), wallColor);
    s.wall('z', z0 + t, z1 - t, x0 + t / 2, t, h, shift(opsFor('W', d), z, 1), wallColor);
    s.wall('z', z0 + t, z1 - t, x1 - t / 2, t, h, shift(opsFor('E', d), z, -1), wallColor);
    if (floors > 1) s.part(box(w, 0.2, d, x, s.y0 + 3.0, z), '#5a4a38');
    // цоколь и углы
    s.part(box(w + 0.1, 0.35, d + 0.1, x, s.y0 + 0.17, z), '#8a867c');
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) s.part(box(0.4, h + 0.05, 0.4, cx, s.y0 + h / 2, cz), '#a8a094');
    this._furnish(s, x, z, w, d, rng);
    if (ruin) return this._rubble(s, x0, x1, z0, z1, rng).finish();
    this._roof(s, x, z, w, d, h, gable, roofColor ?? rng.pick(ROOF));
    return s.finish();
  }

  _furnish(s, x, z, w, d, rng) {
    const y = s.y0;
    // стол с табуретами, койка, ящики, шкаф, лампа — просто для вида (без коллизий)
    const tx = x + rng.range(-w * 0.15, w * 0.15), tz = z + rng.range(-d * 0.15, d * 0.15);
    s.part(box(1.3, 0.06, 0.8, tx, y + 0.78, tz), WOOD);
    for (const [dx, dz] of [[-0.55, -0.32], [0.55, -0.32], [-0.55, 0.32], [0.55, 0.32]]) s.part(box(0.06, 0.75, 0.06, tx + dx, y + 0.4, tz + dz), WOOD);
    s.part(box(0.4, 0.4, 0.4, tx - 0.9, y + 0.2, tz + 0.1), '#8a6a3a');
    s.part(box(0.4, 0.4, 0.4, tx + 0.9, y + 0.2, tz - 0.1), '#8a6a3a');
    const bx = x - w / 2 + 1.2, bz = z + d / 2 - 1.1;
    s.part(box(0.9, 0.35, 1.9, bx, y + 0.28, bz), '#4a4f58');
    s.part(box(0.84, 0.12, 1.8, bx, y + 0.5, bz), '#8a9a78');
    s.part(box(0.8, 0.06, 0.4, bx, y + 0.58, bz + 0.7), '#e8e4d0');
    s.part(box(0.9, 1.7, 0.4, x + w / 2 - 0.7, y + 0.85, z + d / 2 - 0.6), '#5a4026');
    s.part(box(0.5, 0.5, 0.5, x + w / 2 - 0.9, y + 0.25, z - d / 2 + 0.7), '#a68a50');
    s.part(box(0.45, 0.3, 0.45, x + w / 2 - 0.9, y + 0.65, z - d / 2 + 0.7), '#9a7e46');
    s.part(box(0.2, 0.05, 0.2, tx, y + 0.84, tz), '#f6e8a0');
  }

  _roof(s, x, z, w, d, h, gable, color) {
    const y = s.y0 + h;
    if (!gable) {
      s.roofPart(box(w + 0.7, 0.22, d + 0.7, x, y + 0.11, z), color);
      s.roofPart(box(w + 0.7, 0.18, 0.2, x, y + 0.3, z - d / 2 - 0.25), CONCRETE);
      s.roofPart(box(w + 0.7, 0.18, 0.2, x, y + 0.3, z + d / 2 + 0.25), CONCRETE);
      return;
    }
    // конёк вдоль большей стороны; локальные оси: конёк вдоль X, скаты к ±Z, начало — центр дома на высоте карниза
    const alongX = w >= d;
    const L = alongX ? w : d, W = alongX ? d : w;
    const a = 0.42, rise = (W / 2) * Math.tan(a);
    const M = this._place(x, z, alongX, y);
    for (const sgn of [1, -1]) {
      const g = new THREE.BoxGeometry(L + 0.8, 0.14, (W / 2 + 0.5) / Math.cos(a));
      g.rotateX(sgn * a);
      g.translate(0, rise / 2 - 0.03, sgn * (W / 4 + 0.25));
      s.roofPart(g.applyMatrix4(M), color);
    }
    s.roofPart(new THREE.BoxGeometry(L + 0.9, 0.12, 0.3).translate(0, rise + 0.02, 0).applyMatrix4(M), '#3b2b24');
    // фронтоны (остаются, когда крыша спрятана)
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, 0); shape.lineTo(W / 2, 0); shape.lineTo(0, rise); shape.closePath();
    for (const sx of [-1, 1]) {
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      g.translate(sx > 0 ? L / 2 - 0.3 : -L / 2, 0, 0);
      s.part(g.applyMatrix4(M), '#c9bfa8');
    }
  }

  // Матрица размещения крыши: ось конька X (alongX) или Z, центр (x, z), высота y.
  _place(x, z, alongX, y = 0) {
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    if (!alongX) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    return m;
  }

  // Обломки внутри и вокруг руин (стены разной высоты строит Structure.wall при s.ruin).
  _rubble(s, x0, x1, z0, z1, rng) {
    for (let i = 0; i < 11; i++) {
      const rx = rng.range(x0 - 0.5, x1 + 0.5), rz = rng.range(z0 - 0.5, z1 + 0.5);
      const g = box(rng.range(0.3, 0.9), rng.range(0.2, 0.6), rng.range(0.3, 0.9), 0, 0, 0);
      g.rotateY(rng.range(0, 3)).rotateZ(rng.range(-0.3, 0.3)).translate(rx, s.y0 + 0.15, rz);
      s.part(g, rng.pick(['#7a7468', '#8a8478', '#5c3a2a']));
    }
    s.part(box(1.4, 0.4, 1.2, (x0 + x1) / 2 + rng.range(-1, 1), s.y0 + 0.2, (z0 + z1) / 2 + rng.range(-1, 1)), '#6a645a');
    return s;
  }

  // ------------------------------------------------------------ бункеры

  // Дот: бетонная коробка со щелями-бойницами в лицевой стене (front: 'N' | 'S' | 'E' | 'W' — куда смотрят щели) и дверью сзади.
  bunker(x, z, { w = 8, d = 6, front = 'S', slits = 2, big = false } = {}) {
    const s = new Structure(this, 'bunker', x, z);
    const t = 0.6, h = 2.6;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    s.grow(x0, x1, z0, z1);
    const c = CONCRETE;
    s.part(box(w - 0.2, 0.1, d - 0.2, x, s.y0 + 0.03, z), '#5a5a56');
    const lenFront = front === 'S' || front === 'N' ? w : d;
    const slitOps = (inward) => {
      const ops = [];
      for (let k = 0; k < slits; k++) ops.push({ c: ((k + 0.5) / slits - 0.5) * lenFront * 0.78, w: 1.7, type: 'slit', sill: 1.05, top: 1.6, inward });
      return ops;
    };
    const doorOp = (inward) => [{ c: 0, w: 1.5, type: 'door', inward }];
    const side = (name) => {
      const isFront = name === front;
      const isBack = ((front === 'S' && name === 'N') || (front === 'N' && name === 'S') || (front === 'E' && name === 'W') || (front === 'W' && name === 'E'));
      return isFront ? slitOps : isBack ? doorOp : () => [];
    };
    const ox = (arr, base) => arr.map((o) => ({ ...o, c: base + o.c }));
    s.wall('x', x0, x1, z0 + t / 2, t, h, ox(side('S')(1), x), c, '#15171a');
    s.wall('x', x0, x1, z1 - t / 2, t, h, ox(side('N')(-1), x), c, '#15171a');
    s.wall('z', z0 + t, z1 - t, x0 + t / 2, t, h, ox(side('W')(1), z), c, '#15171a');
    s.wall('z', z0 + t, z1 - t, x1 - t / 2, t, h, ox(side('E')(-1), z), c, '#15171a');
    // плита крыши, земляная насыпь, мешки у бойниц
    s.roofPart(box(w + 0.5, 0.35, d + 0.5, x, s.y0 + h + 0.17, z), '#8a8a84');
    s.roofPart(box(w + 1.4, 0.4, d + 1.4, x, s.y0 + h + 0.55, z), '#5f6b3a');
    if (big) s.roofPart(box(w * 0.5, 0.5, d * 0.5, x, s.y0 + h + 0.95, z), '#566332');
    // стол с картой и лампа внутри
    s.part(box(1.8, 0.08, 1.0, x, s.y0 + 0.8, z), '#6d5a3a');
    s.part(box(1.6, 0.02, 0.8, x, s.y0 + 0.85, z), '#d8cfa0');
    return s.finish();
  }

  // Ангар: три стены и крыша, открытый фасад (open: 'E' | 'W' | 'N' | 'S'); внутри места для техники.
  shed(x, z, { w = 8, d = 16, open = 'E', color = '#6a6e62' } = {}) {
    const s = new Structure(this, 'shed', x, z);
    const h = 3.6, t = 0.35;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    s.grow(x0, x1, z0, z1);
    s.part(box(w, 0.1, d, x, s.y0 + 0.03, z), '#555853');
    if (open !== 'S') s.wall('x', x0, x1, z0 + t / 2, t, h, [], color);
    if (open !== 'N') s.wall('x', x0, x1, z1 - t / 2, t, h, [], color);
    if (open !== 'W') s.wall('z', z0 + t, z1 - t, x0 + t / 2, t, h, [], color);
    if (open !== 'E') s.wall('z', z0 + t, z1 - t, x1 - t / 2, t, h, [], color);
    s.roofPart(box(w + 0.8, 0.25, d + 0.8, x, s.y0 + h + 0.12, z), '#4a4f46');
    for (let i = -2; i <= 2; i++) {
      const alongX = open === 'E' || open === 'W';
      s.roofPart(alongX ? box(w + 0.9, 0.2, 0.15, x, s.y0 + h + 0.3, z + i * d / 5) : box(0.15, 0.2, d + 0.9, x + i * w / 5, s.y0 + h + 0.3, z), '#2f332c');
    }
    // потолочные лампы и бочки у задней стены
    const back = open === 'E' ? [x0 + 1, z] : open === 'W' ? [x1 - 1, z] : open === 'N' ? [x, z0 + 1] : [x, z1 - 1];
    for (let i = -1; i <= 1; i += 2) s.part(cyl(0.3, 0.3, 0.9, 10, back[0] + (open === 'E' || open === 'W' ? 0 : i * 2), s.y0 + 0.45, back[1] + (open === 'E' || open === 'W' ? i * 3 : 0)), '#7a2f26');
    return s.finish();
  }

  // ------------------------------------------------------------ укрытия на открытом месте

  // Гнездо из мешков с песком: стенка спереди (facing) и два крыла по бокам; высота 1.35 м (прикрывает до груди).
  sandbags(x, z, { facing = 'S', len = 5, wing = 2.2, h = 1.35 } = {}) {
    const s = new Structure(this, 'sandbags', x, z);
    const sand = ['#b8a77a', '#a89868', '#c2b384'];
    const rng = this.rng;
    const row = (axis, a0, a1, c, thick) => {
      const rows = Math.round(h / 0.27);
      for (let k = 0; k < rows; k++) {
        const inset = k * 0.04, y = s.y0 + 0.13 + k * 0.27;
        const l = a0 + (k % 2 ? 0.35 : 0) + inset, r = a1 - inset - (k % 2 ? 0 : 0.35);
        for (let i = 0; i < 2; i++) {
          const shade = rng.pick(sand);
          if (axis === 'x') s.part(box(r - l, 0.26, thick * 0.52, (l + r) / 2, y, c + (i ? 1 : -1) * thick * 0.25), shade);
          else s.part(box(thick * 0.52, 0.26, r - l, c + (i ? 1 : -1) * thick * 0.25, y, (l + r) / 2), shade);
        }
      }
      if (axis === 'x') s.collide(a0, a1, c - thick / 2, c + thick / 2, s.y0 + h, 'barrier');
      else s.collide(c - thick / 2, c + thick / 2, a0, a1, s.y0 + h, 'barrier');
    };
    const th = 0.7;
    const hl = len / 2;
    if (facing === 'S' || facing === 'N') {
      const sg = facing === 'S' ? -1 : 1;
      row('x', x - hl, x + hl, z + sg * (wing / 2), th);
      row('z', z - wing / 2, z + wing / 2, x - hl + th / 2, th);
      row('z', z - wing / 2, z + wing / 2, x + hl - th / 2, th);
      s.cover.push({ x, z: z - sg * 0.1, face: facing === 'S' ? Math.PI : 0, kind: 'sandbag', taken: null, owner: s });
      s.cover.push({ x: x - hl * 0.55, z: z - sg * 0.1, face: facing === 'S' ? Math.PI : 0, kind: 'sandbag', taken: null, owner: s });
      s.cover.push({ x: x + hl * 0.55, z: z - sg * 0.1, face: facing === 'S' ? Math.PI : 0, kind: 'sandbag', taken: null, owner: s });
    } else {
      const sg = facing === 'W' ? -1 : 1;
      row('z', z - hl, z + hl, x + sg * (wing / 2), th);
      row('x', x - wing / 2, x + wing / 2, z - hl + th / 2, th);
      row('x', x - wing / 2, x + wing / 2, z + hl - th / 2, th);
      s.cover.push({ x: x - sg * 0.1, z, face: facing === 'W' ? -Math.PI / 2 : Math.PI / 2, kind: 'sandbag', taken: null, owner: s });
      s.cover.push({ x: x - sg * 0.1, z: z - hl * 0.55, face: facing === 'W' ? -Math.PI / 2 : Math.PI / 2, kind: 'sandbag', taken: null, owner: s });
      s.cover.push({ x: x - sg * 0.1, z: z + hl * 0.55, face: facing === 'W' ? -Math.PI / 2 : Math.PI / 2, kind: 'sandbag', taken: null, owner: s });
    }
    return s.finish();
  }

  // Контейнер (или стопка из двух): сплошное укрытие.
  container(x, z, { along = 'x', stack = 1, color = null } = {}) {
    const s = new Structure(this, 'container', x, z);
    const L = 6.0, W = 2.4, H = 2.6;
    const c = color ?? this.rng.pick(['#b04a3a', '#2f5d8a', '#3d7a52', '#c28a2c', '#5b5f66', '#7a3f6a']);
    for (let k = 0; k < stack; k++) {
      const y = s.y0 + k * H;
      const sx = along === 'x' ? L : W, sz = along === 'x' ? W : L;
      s.part(box(sx, H, sz, x, y + H / 2, z), c);
      // рёбра и двери
      for (let i = -2; i <= 2; i++) {
        const g = along === 'x' ? box(0.05, H - 0.2, W + 0.08, x + i * 1.1, y + H / 2, z) : box(W + 0.08, H - 0.2, 0.05, x, y + H / 2, z + i * 1.1);
        s.part(g, '#3a3a3a');
      }
      s.part(along === 'x' ? box(0.08, H - 0.2, W - 0.2, x + L / 2 + 0.02, y + H / 2, z) : box(W - 0.2, H - 0.2, 0.08, x, y + H / 2, z + L / 2 + 0.02), '#2a2a2a');
    }
    s.collide(x - (along === 'x' ? L : W) / 2, x + (along === 'x' ? L : W) / 2, z - (along === 'x' ? W : L) / 2, z + (along === 'x' ? W : L) / 2, s.y0 + H * stack, 'building');
    return s.finish();
  }

  // Бетонный блок-барьер (джерси) 0.9 м: машина не проедет, пули над ним, пешком можно перепрыгнуть.
  barrier(x, z, { along = 'x', n = 2 } = {}) {
    const s = new Structure(this, 'barrier', x, z);
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 3.1;
      const bx = along === 'x' ? x + o : x, bz = along === 'x' ? z : z + o;
      const sx = along === 'x' ? 3.0 : 0.6, sz = along === 'x' ? 0.6 : 3.0;
      s.part(box(sx, 0.9, sz, bx, s.y0 + 0.45, bz), '#9c9a94');
      s.part(box(along === 'x' ? 3.0 : 0.35, 0.18, along === 'x' ? 0.35 : 3.0, bx, s.y0 + 0.99, bz), '#7a7870');
      s.collide(bx - sx / 2, bx + sx / 2, bz - sz / 2, bz + sz / 2, s.y0 + 0.9, 'barrier');
    }
    return s.finish();
  }

  // Противотанковый «ёж» (декор у пунктов): три балки крест-накрест.
  hedgehog(x, z) {
    const s = new Structure(this, 'hedgehog', x, z);
    for (const [rx, rz] of [[0.8, 0], [0, 0.8], [0.6, 0.6]]) {
      const g = box(0.14, 1.5, 0.14, 0, 0, 0).rotateX(rx).rotateZ(rz).translate(x, s.y0 + 0.75, z);
      s.part(g, '#4c4f48');
      const g2 = box(1.5, 0.14, 0.14, 0, 0, 0).rotateY(rx * 2).translate(x, s.y0 + 0.75, z);
      s.part(g2, '#43463f');
    }
    s.collide(x - 0.7, x + 0.7, z - 0.7, z + 0.7, s.y0 + 1.3, 'barrier');
    return s.finish();
  }

  // Палатка: навес с двумя скатами; полог вход со стороны door.
  tent(x, z, { w = 5.5, d = 3.8, color = null, door = 'S' } = {}) {
    const s = new Structure(this, 'tent', x, z);
    const c = color ?? this.rng.pick(['#5a6b3e', '#7a7350', '#4a5a40']);
    const rise = 2.3;
    // два скошенных листа вдоль X
    for (const sg of [-1, 1]) {
      const len = Math.hypot(d / 2, rise);
      const g = new THREE.BoxGeometry(w, 0.05, len);
      g.rotateX(sg * Math.atan2(rise, d / 2));
      g.translate(0, rise / 2, sg * d / 4);
      s.part(g.translate(x, s.y0, z), c);
    }
    s.part(box(0.08, rise + 0.3, 0.08, x - w / 2, s.y0 + rise / 2, z), '#3a2d1c');
    s.part(box(0.08, rise + 0.3, 0.08, x + w / 2, s.y0 + rise / 2, z), '#3a2d1c');
    s.part(box(w, 0.06, 0.06, x, s.y0 + rise, z), '#3a2d1c');
    s.part(box(w - 0.3, 0.05, d - 0.4, x, s.y0 + 0.03, z), '#7a6a50');
    // койки внутри
    for (const sg of [-1, 1]) s.part(box(w * 0.6, 0.3, 0.8, x, s.y0 + 0.25, z + sg * 0.9), '#6f7f58');
    // низкие борта-коллайдеры по длинным сторонам: заходить с торца
    s.collide(x - w / 2, x + w / 2, z - d / 2, z - d / 2 + 0.5, s.y0 + 1.3, 'building');
    s.collide(x - w / 2, x + w / 2, z + d / 2 - 0.5, z + d / 2, s.y0 + 1.3, 'building');
    s.cover.push({ x, z, face: door === 'S' ? Math.PI : 0, kind: 'tent', taken: null, owner: s });
    return s.finish();
  }

  // Штабель ящиков с боеприпасами (декор + укрытие).
  crates(x, z, { n = 3 } = {}) {
    const s = new Structure(this, 'crates', x, z);
    for (let i = 0; i < n; i++) {
      const bx = x + (i % 2) * 0.1 + (i - n / 2) * 0.95, bz = z + (i % 2) * 0.5;
      s.part(box(0.9, 0.8, 0.7, bx, s.y0 + 0.4, bz), i % 2 ? '#5a6b3e' : '#7a5a30');
      s.part(box(0.92, 0.06, 0.72, bx, s.y0 + 0.8, bz), '#2f2f2a');
    }
    s.collide(x - n * 0.5 - 0.3, x + n * 0.5 + 0.3, z - 0.5, z + 0.9, s.y0 + 1.0, 'barrier');
    return s.finish();
  }

  // Посадочная площадка для вертолёта.
  helipad(x, z, r = 7) {
    const s = new Structure(this, 'helipad', x, z);
    s.grow(x - r, x + r, z - r, z + r);
    s.part(cyl(r, r, 0.08, 28, x, s.y0 + 0.05, z), '#4a4d52');
    s.part(cyl(r - 0.5, r - 0.5, 0.09, 28, x, s.y0 + 0.055, z), '#5a5d62');
    // H и кольцо
    const mark = '#f2d34a';
    s.part(box(0.5, 0.1, 4, x - 1.4, s.y0 + 0.1, z), mark);
    s.part(box(0.5, 0.1, 4, x + 1.4, s.y0 + 0.1, z), mark);
    s.part(box(3.3, 0.1, 0.5, x, s.y0 + 0.1, z), mark);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      s.part(box(0.4, 0.1, 0.4, x + Math.sin(a) * (r - 0.35), s.y0 + 0.1, z + Math.cos(a) * (r - 0.35)), i % 2 ? '#f2f2f2' : '#d83a2a');
    }
    return s.finish();
  }

  // Сторожевая вышка: 4 ноги, площадка, ограждение, крыша (декор и обзор; взбираться нельзя).
  tower(x, z) {
    const s = new Structure(this, 'tower', x, z);
    const hh = 5.2;
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) s.part(box(0.25, hh, 0.25, x + dx, s.y0 + hh / 2, z + dz), '#4a3a28');
    s.part(box(3.2, 0.2, 3.2, x, s.y0 + hh, z), '#6a5030');
    for (const sg of [-1, 1]) {
      s.part(box(3.2, 0.9, 0.1, x, s.y0 + hh + 0.65, z + sg * 1.55), '#5a4228');
      s.part(box(0.1, 0.9, 3.2, x + sg * 1.55, s.y0 + hh + 0.65, z), '#5a4228');
    }
    s.roofPart(box(3.8, 0.2, 3.8, x, s.y0 + hh + 2.0, z), '#3f4a38');
    for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) s.roofPart(box(0.12, 1.3, 0.12, x + dx, s.y0 + hh + 1.3, z + dz), '#4a3a28');
    s.part(box(0.1, 4.5, 0.1, x, s.y0 + 2.5, z + 1.4), '#4a3a28');
    for (const dx of [-1.2, 1.2]) s.collide(x + dx - 0.15, x + dx + 0.15, z - 1.35, z - 1.05, s.y0 + hh, 'building');
    for (const dx of [-1.2, 1.2]) s.collide(x + dx - 0.15, x + dx + 0.15, z + 1.05, z + 1.35, s.y0 + hh, 'building');
    return s.finish();
  }

  // ------------------------------------------------------------ флаги

  // Флагшток с развевающимся флагом страны (id) или нейтральным (null). Возвращает объект флага для update().
  flagpole(x, z, id = null, { height = 12 } = {}) {
    const s = new Structure(this, 'flagpole', x, z);
    s.part(cyl(0.9, 1.1, 0.5, 12, x, s.y0 + 0.25, z), '#7a7a74');
    s.part(cyl(0.08, 0.12, height, 8, x, s.y0 + height / 2, z), '#cfcfca');
    s.part(new THREE.SphereGeometry(0.2, 8, 6).translate(x, s.y0 + height + 0.1, z), '#e8c84a');
    s.collide(x - 0.5, x + 0.5, z - 0.5, z + 0.5, s.y0 + height, 'barrier');
    s.finish();
    const geo = new THREE.PlaneGeometry(4.2, 2.8, 8, 4);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9, map: id ? flagTexture(id) : null, color: id ? 0xffffff : 0xb9bcc0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.set(x + 2.15, s.y0 + height - 1.6, z);
    this.group.add(mesh);
    const base = geo.attributes.position.array.slice();
    const flag = { mesh, mat, geo, base, phase: this.rng.range(0, 6), x, z, id };
    this.flags.push(flag);
    flag.setCountry = (cid) => {
      flag.id = cid;
      mat.map = cid ? flagTexture(cid) : null;
      mat.color.set(cid ? 0xffffff : 0xb9bcc0);
      mat.needsUpdate = true;
    };
    return flag;
  }

  // Цветной круг на земле (зона пункта) — полупрозрачный, рисуется поверх асфальта.
  ring(x, z, r, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.7, r, 48).rotateX(-Math.PI / 2), mat);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), mat.clone());
    disc.material.opacity = 0.1;
    const y = this.game.world.getGroundHeight(x, z) + 0.06;
    m.position.set(x, y, z);
    disc.position.set(x, y, z);
    m.renderOrder = disc.renderOrder = 3;
    this.group.add(m, disc);
    const d = { ring: m, disc, mat, setColor: (c) => { m.material.color.set(c); disc.material.color.set(c); } };
    this.decals.push(d);
    return d;
  }

  // Волнение флагов (раз в кадр, только рядом с камерой).
  updateFlags(time) {
    const cam = this.game.camera.position;
    for (const f of this.flags) {
      if ((f.x - cam.x) ** 2 + (f.z - cam.z) ** 2 > 170 * 170) continue;
      const p = f.geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const bx = f.base[i * 3], by = f.base[i * 3 + 1];
        const k = (bx + 2.1) / 4.2;
        p.setZ(i, Math.sin(time * 3.2 + bx * 1.6 + f.phase) * 0.28 * k);
        p.setY(i, by + Math.sin(time * 2.4 + bx + f.phase) * 0.06 * k);
      }
      p.needsUpdate = true;
    }
  }

  // Крыши: когда игрок (или камера) внутри постройки — крыша скрыта.
  updateRoofs() {
    const p = this.game.player.position, c = this.game.camera.position;
    for (const s of this.structures) {
      if (!s.roof) continue;
      const f = s.footprint;
      const near = (v) => v.x > f.minX - 1 && v.x < f.maxX + 1 && v.z > f.minZ - 1 && v.z < f.maxZ + 1;
      s.roof.visible = !(near(p) || (near(c) && c.y < 30));
    }
  }
}
