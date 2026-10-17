import * as THREE from 'three';
import { CollisionGrid } from './collision.js';
import { mergeColored } from './geometry.js';
import { createRng } from './utils.js';

// Поле боя «Войны стран»: отдельный кусок земли далеко за городом (центр — (2000, 2000); город лежит в пределах ±500).
// Никаких прохожих и зданий города: поля, леса, деревни, грунтовые дороги и четыре базы по углам.
//
//   Сетка 4 × 4 клетки по 150 м, между ними грунтовые дороги (5 линий в каждую сторону, как улицы города — поэтому по ним ходят Navigator и AIDriver).
//   Клетки: 4 угловые — базы стран (или деревни, если стран меньше), 4 центральные — деревни вокруг «столицы» в центральном перекрёстке,
//   8 боковых — леса и фермы (поля, сарай, стога, каменные стенки).
//   Arena подменяет у world сетку улиц, коллизии, деревья и границы (world.enterArena); ровная земля, граница — земляной вал.
//
// Деревья — свой InstancedMesh (как у города); при подмене world.trees танк давит их так же, как городские.

export const ARENA_CENTER = 2000;
const CELL = 150;
const LINES = 5;
const ROAD_HALF = 4.5;
const SHOULDER = 3;
const HALF = 330;

const col = (c) => new THREE.Color(c);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export class Arena {
  constructor(game, seed = 1) {
    this.game = game;
    this.rng = createRng(seed * 977 + 13);
    const C = ARENA_CENTER;
    this.center = { x: C, z: C };
    this.blockSize = CELL;
    this.roadHalf = ROAD_HALF;
    this.sidewalk = SHOULDER;
    this.blocksPerAxis = LINES - 1;
    this.gridMin = C - ((LINES - 1) * CELL) / 2;
    this.gridMax = this.gridMin + (LINES - 1) * CELL;
    this.roadLines = [];
    for (let i = 0; i < LINES; i++) this.roadLines.push(this.gridMin + i * CELL);
    this.half = HALF;
    this.bounds = { minX: C - HALF, maxX: C + HALF, minZ: C - HALF, maxZ: C + HALF };
    this.colliders = new CollisionGrid(C - HALF - 10, C - HALF - 10, HALF * 2 + 20, 20);
    this.buildings = [];
    this.trees = [];
    this.treeMeshes = [];
    this.blocks = [];
    this.group = new THREE.Group();
    this.group.name = 'war-arena';
    game.scene.add(this.group);
    this.fields = [];
    this._mats = [];
    for (let j = 0; j < LINES - 1; j++) {
      for (let i = 0; i < LINES - 1; i++) {
        const x0 = this.roadLines[i], x1 = this.roadLines[i + 1], z0 = this.roadLines[j], z1 = this.roadLines[j + 1];
        const b = {
          i, j, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
          minX: x0 + ROAD_HALF, maxX: x1 - ROAD_HALF, minZ: z0 + ROAD_HALF, maxZ: z1 - ROAD_HALF,
          type: 'park', district: null, kind: 'field',
          orient: { hx: (x0 + x1) / 2 >= C ? 1 : -1, hz: (z0 + z1) / 2 >= C ? 1 : -1 },
        };
        b.lot = { minX: b.minX + SHOULDER, maxX: b.maxX - SHOULDER, minZ: b.minZ + SHOULDER, maxZ: b.maxZ - SHOULDER };
        this.blocks.push(b);
      }
    }
    this._terrain();
    this._boundary();
  }

  cell(i, j) { return this.blocks[j * (LINES - 1) + i]; }
  get corners() { return [this.cell(0, 0), this.cell(3, 0), this.cell(0, 3), this.cell(3, 3)]; }
  get centerCells() { return [this.cell(1, 1), this.cell(2, 1), this.cell(1, 2), this.cell(2, 2)]; }
  get edgeCells() { return [this.cell(1, 0), this.cell(2, 0), this.cell(0, 1), this.cell(0, 2), this.cell(3, 1), this.cell(3, 2), this.cell(1, 3), this.cell(2, 3)]; }

  _mat(opts = {}) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...opts });
    this._mats.push(m);
    return m;
  }

  _add(parts, mat, name, receive = true) {
    if (!parts.length) return null;
    const m = new THREE.Mesh(mergeColored(parts), mat);
    m.name = name;
    m.receiveShadow = receive;
    this.group.add(m);
    return m;
  }

  // Грунтовые дороги: полотно с колеями и перекрёстками.
  _terrain() {
    const C = ARENA_CENTER, y = 0.025, rh = ROAD_HALF;
    const lo = C - HALF, hi = C + HALF;
    const parts = [];
    const dirt = ['#8d7b57', '#86744f'];
    for (const [k, c] of this.roadLines.entries()) {
      const color = col(dirt[k % 2]);
      parts.push({ geometry: box(HALF * 2, 0.04, rh * 2, C, y, c), color });
      parts.push({ geometry: box(rh * 2, 0.04, HALF * 2, c, y, C), color });
      // колеи
      for (const o of [-1.7, 1.7]) {
        parts.push({ geometry: box(HALF * 2, 0.05, 0.55, C, y + 0.012, c + o), color: col('#6e5f40') });
        parts.push({ geometry: box(0.55, 0.05, HALF * 2, c + o, y + 0.012, C), color: col('#6e5f40') });
      }
    }
    // обочины: светлая полоса вдоль дорог
    for (const c of this.roadLines) {
      for (const s of [-1, 1]) {
        parts.push({ geometry: box(HALF * 2, 0.03, 1.2, C, y - 0.004, c + s * (rh + 0.6)), color: col('#9a9068') });
        parts.push({ geometry: box(1.2, 0.03, HALF * 2, c + s * (rh + 0.6), y - 0.004, C), color: col('#9a9068') });
      }
    }
    this._add(parts, this._mat(), 'arena-roads');
    void lo; void hi;
  }

  // Земляной вал по краю поля боя: не даёт уйти и закрывает вид.
  _boundary() {
    const C = ARENA_CENTER, H = HALF, t = 1.6, h = 2.6;
    const parts = [];
    const walls = [[C - H, C - H, C + H, C - H + t], [C - H, C + H - t, C + H, C + H], [C - H, C - H, C - H + t, C + H], [C + H - t, C - H, C + H, C + H]];
    for (const [x0, z0, x1, z1] of walls) {
      parts.push({ geometry: box(x1 - x0, h, z1 - z0, (x0 + x1) / 2, h / 2, (z0 + z1) / 2), color: col('#6f6a4c') });
      parts.push({ geometry: box(x1 - x0 + 0.1, 0.35, z1 - z0 + 0.1, (x0 + x1) / 2, h + 0.1, (z0 + z1) / 2), color: col('#59563c') });
      this.colliders.add({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: h + 0.3, type: 'barrier', war: true });
    }
    // столбы с колючей проволокой
    for (let k = -H + 10; k < H; k += 14) {
      for (const [x, z] of [[C + k, C - H + 2.2], [C + k, C + H - 2.2], [C - H + 2.2, C + k], [C + H - 2.2, C + k]]) parts.push({ geometry: box(0.12, 1.2, 0.12, x, h + 0.7, z), color: col('#3a2d1e') });
    }
    this._add(parts, this._mat({ polygonOffset: false }), 'arena-wall', true);
  }

  // Поля на фермах: прямоугольники разных культур (только вид, без коллизий).
  field(x, z, w, d, kind = 'wheat') {
    const colors = { wheat: ['#c9b25a', '#bfa84e'], green: ['#6a9a3a', '#5f8f34'], plowed: ['#7a5a3a', '#6e5133'], hay: ['#a8a05a', '#9a9250'] };
    const [a, b] = colors[kind];
    const parts = [];
    const rows = Math.max(2, Math.floor(w / 2.4));
    for (let r = 0; r < rows; r++) {
      parts.push({ geometry: box(w / rows - 0.12, 0.03, d, x - w / 2 + (r + 0.5) * (w / rows), 0.035, z), color: col(r % 2 ? a : b) });
    }
    this.fields.push(parts);
    return { x, z, w, d, kind };
  }

  finishFields() {
    const all = this.fields.flat();
    this._add(all, this._mat(), 'arena-fields');
    this.fields = [];
  }

  // Деревья: леса в боковых клетках, редкие рощи в остальных. reserved — прямоугольники, где деревья не нужны (постройки, выезды, дороги).
  plantTrees(reserved, structures) {
    const rng = this.rng;
    const C = ARENA_CENTER;
    const blocked = (x, z, m = 2.5) => {
      for (const r of reserved) if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true;
      for (const s of structures) {
        const f = s.footprint;
        if (x > f.minX - m - 1 && x < f.maxX + m + 1 && z > f.minZ - m - 1 && z < f.maxZ + m + 1) return true;
      }
      for (const l of this.roadLines) if (Math.abs(x - l) < ROAD_HALF + 4 || Math.abs(z - l) < ROAD_HALF + 4) return true;
      return false;
    };
    const list = [];
    for (const b of this.blocks) {
      let n = 0, density = 0;
      if (b.kind === 'forest') density = 1 / 95;
      else if (b.kind === 'farm') density = 1 / 900;
      else if (b.kind === 'village') density = 1 / 700;
      else density = 1 / 800;
      const area = (b.maxX - b.minX) * (b.maxZ - b.minZ);
      const want = Math.round(area * density);
      for (let tries = 0; tries < want * 6 && n < want; tries++) {
        const x = rng.range(b.minX + 6, b.maxX - 6), z = rng.range(b.minZ + 6, b.maxZ - 6);
        if (blocked(x, z)) continue;
        if (list.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < (b.kind === 'forest' ? 20 : 30))) continue;
        list.push({ x, z, y: 0 });
        n++;
      }
    }
    // вал по краю — несколько деревьев снаружи не нужны
    void C;
    if (!list.length) return;
    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 7).translate(0, 1.3, 0);
    const crown = new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.6, 0);
    const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), list.length);
    const crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), list.length);
    const m = new THREE.Object3D();
    const c = new THREE.Color();
    list.forEach((t, i) => {
      const s = rng.range(0.85, 1.4);
      m.position.set(t.x, 0, t.z);
      m.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      m.scale.set(s, s * rng.range(0.9, 1.2), s);
      m.updateMatrix();
      trunkMesh.setMatrixAt(i, m.matrix);
      crownMesh.setMatrixAt(i, m.matrix);
      c.setHSL(rng.range(0.22, 0.34), rng.range(0.35, 0.55), rng.range(0.2, 0.32));
      crownMesh.setColorAt(i, c);
      t.index = i;
      t.matrix = m.matrix.clone();
      t.crown = c.getHex();
      t.collider = this.colliders.add({ minX: t.x - 0.3, maxX: t.x + 0.3, minZ: t.z - 0.3, maxZ: t.z + 0.3, height: 3, type: 'tree', war: true });
    });
    for (const mesh of [trunkMesh, crownMesh]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.treeMeshes.push(mesh);
    }
    this.trees.push(...list);   // тот же массив, что у world.trees на время войны
  }

  // Карта поля боя для миникарты: canvas и покрытый прямоугольник мира.
  minimapCanvas(structures) {
    const N = 1024, S = HALF * 2 + 20;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const k = N / S;
    ctx.scale(k, k);
    ctx.translate(-(ARENA_CENTER - S / 2), -(ARENA_CENTER - S / 2));
    ctx.fillStyle = '#4b6a36';
    ctx.fillRect(ARENA_CENTER - S / 2, ARENA_CENTER - S / 2, S, S);
    const kindColor = { forest: '#35572b', farm: '#7e8d45', village: '#587a3e', base: '#5d7a45', field: '#587a3e' };
    for (const b of this.blocks) {
      ctx.fillStyle = kindColor[b.kind] ?? '#587a3e';
      ctx.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    }
    ctx.fillStyle = '#9d8a5f';
    for (const l of this.roadLines) {
      ctx.fillRect(ARENA_CENTER - HALF, l - ROAD_HALF, HALF * 2, ROAD_HALF * 2);
      ctx.fillRect(l - ROAD_HALF, ARENA_CENTER - HALF, ROAD_HALF * 2, HALF * 2);
    }
    ctx.fillStyle = '#2f5a2a';
    for (const t of this.trees) {
      ctx.beginPath();
      ctx.arc(t.x, t.z, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3e434b';
    ctx.strokeStyle = '#23272d';
    ctx.lineWidth = 0.6;
    for (const s of structures) {
      if (s.name === 'flagpole' || s.name === 'hedgehog' || s.name === 'crates') continue;
      const f = s.footprint;
      ctx.fillRect(f.minX, f.minZ, f.maxX - f.minX, f.maxZ - f.minZ);
      ctx.strokeRect(f.minX, f.minZ, f.maxX - f.minX, f.maxZ - f.minZ);
    }
    ctx.strokeStyle = '#d6cfa0';
    ctx.lineWidth = 2;
    ctx.strokeRect(ARENA_CENTER - HALF + 1, ARENA_CENTER - HALF + 1, HALF * 2 - 2, HALF * 2 - 2);
    return { canvas: c, rect: { x: ARENA_CENTER - S / 2, z: ARENA_CENTER - S / 2, w: S, h: S } };
  }

  dispose() {
    for (const m of this.treeMeshes) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.group.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh) o.geometry?.dispose?.();
    });
    for (const m of this._mats) m.dispose();
    this.group.removeFromParent();
  }
}
