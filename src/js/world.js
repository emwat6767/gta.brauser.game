import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GeometryBuilder } from './geometry.js';
import { CollisionGrid, pushCircleOutOfBox, circleOverlapsBox } from './collision.js';
import { clamp } from './utils.js';

// Открытый мир: земля, сетка улиц, кварталы с тротуарами, здания, парки,
// фонари, деревья, граница карты. Плюс данные для других систем:
//   - colliders (CollisionGrid)  — статичные препятствия
//   - waypoints                  — граф тротуаров для NPC
//   - blocks / buildings / trees — для миникарты
//   - getGroundHeight(x, z)      — высота поверхности (дорога 0, тротуар = бордюр)
//
// Раскладка: улицы идут по линиям roadLines (и по X, и по Z) через весь мир.
// Между соседними улицами — квартал (block). Квартал = бордюр + кольцо тротуара + участок (lot).

const BUILDING_COLORS = [
  '#d9cbb0', '#c9b89a', '#b8a58a', '#e3dccf', '#a9b4bd', '#9fb0a4', '#c7a18a',
  '#b5796a', '#d4c7a6', '#8f9ba6', '#e6e0d4', '#c4b7a6', '#a88f7a', '#9aa7b4', '#cfc2b0',
];
const TOWER_COLORS = ['#8fa7bd', '#9fb4c4', '#7e94a8', '#b0bec9', '#a3b1ad'];
const FLOOR = 3.5;       // высота этажа (совпадает с текстурой окон: 8 этажей на 28 м)
const FACADE_TILE_U = 32;
const FACADE_TILE_V = 28;

export class World {
  constructor(game) {
    const W = CONFIG.world;
    this.game = game;
    this.scene = game.scene;
    this.textures = game.textures;
    this.rng = game.rng;

    this.size = W.size;
    this.half = W.size / 2;
    this.blockSize = W.blockSize;
    this.roadHalf = W.roadWidth / 2;
    this.sidewalk = W.sidewalkWidth;
    this.curbHeight = W.curbHeight;
    this.blocksPerAxis = W.roadsPerAxis - 1;
    this.gridMin = -((W.roadsPerAxis - 1) * W.blockSize) / 2;
    this.gridMax = -this.gridMin;
    this.roadLines = [];
    for (let i = 0; i < W.roadsPerAxis; i++) this.roadLines.push(this.gridMin + i * W.blockSize);

    this.colliders = new CollisionGrid(-this.half, -this.half, this.size, W.collisionCell);
    this.blocks = [];
    this.buildings = [];
    this.trees = [];
    this.lamps = [];
    this.waypoints = [];
    this._pendingTrees = []; // пустыри, найденные при генерации зданий

    this.group = new THREE.Group();
    this.group.name = 'world';
    this.scene.add(this.group);

    this._materials();
    this._layoutBlocks();
    this._buildGround();
    this._buildRoads();
    this._buildBlocks();
    this._buildBuildings();
    this._buildLamps();
    this._buildTrees();
    this._buildBoundary();
    this._buildWaypoints();
  }

  // ------------------------------------------------------------------ API

  // Высота поверхности в точке: на тротуаре/в квартале — высота бордюра, иначе 0.
  getGroundHeight(x, z) {
    const b = this.blockSize;
    const lx = x - this.gridMin, lz = z - this.gridMin;
    if (lx < 0 || lz < 0) return 0;
    const i = Math.floor(lx / b), j = Math.floor(lz / b);
    if (i >= this.blocksPerAxis || j >= this.blocksPerAxis) return 0;
    const fx = lx - i * b, fz = lz - j * b;
    const rh = this.roadHalf;
    if (fx < rh || fx > b - rh || fz < rh || fz > b - rh) return 0;
    return this.curbHeight;
  }

  // Выталкивает круг из препятствий и границ мира. Меняет pos.
  // В out — суммарная нормаль столкновения. Возвращает true, если было касание.
  resolveCircle(pos, radius, out = { nx: 0, nz: 0 }) {
    out.nx = 0;
    out.nz = 0;
    let hit = false;
    const tmp = this._tmpHit ??= { nx: 0, nz: 0, depth: 0 };
    const list = this.colliders.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius);
    for (let i = 0; i < list.length; i++) {
      if (pushCircleOutOfBox(pos, radius, list[i], tmp)) {
        hit = true;
        out.nx += tmp.nx;
        out.nz += tmp.nz;
      }
    }
    const lim = this.half - 0.7 - radius;
    if (pos.x < -lim) { pos.x = -lim; out.nx += 1; hit = true; }
    if (pos.x > lim) { pos.x = lim; out.nx -= 1; hit = true; }
    if (pos.z < -lim) { pos.z = -lim; out.nz += 1; hit = true; }
    if (pos.z > lim) { pos.z = lim; out.nz -= 1; hit = true; }
    if (hit) {
      const l = Math.hypot(out.nx, out.nz) || 1;
      out.nx /= l;
      out.nz /= l;
    }
    return hit;
  }

  // Свободна ли точка (для высадки из машины, спавна).
  isCircleFree(x, z, radius) {
    const lim = this.half - 0.7 - radius;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    const list = this.colliders.query(x - radius, z - radius, x + radius, z + radius);
    for (let i = 0; i < list.length; i++) if (circleOverlapsBox(x, z, radius, list[i])) return false;
    return true;
  }

  // Точка внутри здания (для коллизии камеры).
  isPointInsideBuilding(x, y, z) {
    const list = this.colliders.query(x, z, x, z);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.type !== 'building' && c.type !== 'barrier') continue;
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y < c.height) return true;
    }
    return false;
  }

  nearestWaypoint(x, z) {
    let best = null, bestD = Infinity;
    for (const n of this.waypoints) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  waypointsNear(x, z, radius) {
    const r2 = radius * radius;
    return this.waypoints.filter((n) => (n.x - x) ** 2 + (n.z - z) ** 2 < r2);
  }

  // ------------------------------------------------------------ Построение

  _materials() {
    const t = this.textures;
    this.mats = {
      ground: new THREE.MeshStandardMaterial({ map: t.grass, roughness: 1 }),
      road: new THREE.MeshStandardMaterial({
        map: t.road, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }),
      asphalt: new THREE.MeshStandardMaterial({
        map: t.asphalt, vertexColors: true, roughness: 0.92,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }),
      sidewalk: new THREE.MeshStandardMaterial({ map: t.sidewalk, vertexColors: true, roughness: 0.9 }),
      grass: new THREE.MeshStandardMaterial({ map: t.grass, vertexColors: true, roughness: 1 }),
      facade: new THREE.MeshStandardMaterial({ map: t.windows, vertexColors: true, roughness: 0.8 }),
      plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      stripes: new THREE.MeshStandardMaterial({
        color: 0xe8e8e0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      }),
    };
  }

  _addMesh(geometry, material, { cast = false, receive = true, name } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.matrixAutoUpdate = false;
    if (name) mesh.name = name;
    mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }

  _layoutBlocks() {
    const parks = new Set(CONFIG.world.parks.map(([i, j]) => `${i},${j}`));
    const rh = this.roadHalf, sw = this.sidewalk;
    for (let j = 0; j < this.blocksPerAxis; j++) {
      for (let i = 0; i < this.blocksPerAxis; i++) {
        const x0 = this.roadLines[i], x1 = this.roadLines[i + 1];
        const z0 = this.roadLines[j], z1 = this.roadLines[j + 1];
        const block = {
          i, j, x0, x1, z0, z1,
          cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
          minX: x0 + rh, maxX: x1 - rh, minZ: z0 + rh, maxZ: z1 - rh,   // бордюр
          type: parks.has(`${i},${j}`) ? 'park' : 'buildings',
        };
        block.lot = { minX: block.minX + sw, maxX: block.maxX - sw, minZ: block.minZ + sw, maxZ: block.maxZ - sw };
        this.blocks.push(block);
      }
    }
  }

  _buildGround() {
    // Большая плоскость травы — выходит за границы мира, чтобы горизонт не обрывался.
    const size = this.size * 3;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / 8), uv.getY(i) * (size / 8));
    const mesh = this._addMesh(geo, this.mats.ground, { name: 'ground' });
    mesh.position.y = -0.04;
    mesh.updateMatrix();
  }

  _buildRoads() {
    const roads = new GeometryBuilder();
    const asphalt = new GeometryBuilder();
    const white = new THREE.Color(1, 1, 1);
    const rh = this.roadHalf, L = 8, y = 0;

    // Отрезки улиц между перекрёстками (и до края мира).
    const spans = [];
    let prev = -this.half;
    for (const c of this.roadLines) {
      spans.push([prev, c - rh]);
      prev = c + rh;
    }
    spans.push([prev, this.half]);

    for (const c of this.roadLines) {
      for (const [a, b] of spans) {
        // Улица вдоль X (z = c): U поперёк по Z, V вдоль по X.
        roads.quad([a, y, c + rh], [b, y, c + rh], [b, y, c - rh], [a, y, c - rh], [0, 1, 0],
          [1, a / L, 1, b / L, 0, b / L, 0, a / L], white);
        // Улица вдоль Z (x = c).
        roads.quad([c - rh, y, b], [c + rh, y, b], [c + rh, y, a], [c - rh, y, a], [0, 1, 0],
          [0, b / L, 1, b / L, 1, a / L, 0, a / L], white);
      }
    }
    for (const cx of this.roadLines) {
      for (const cz of this.roadLines) asphalt.flat(cx - rh, cz - rh, cx + rh, cz + rh, y, white, 8);
    }
    this._addMesh(roads.build(), this.mats.road, { name: 'roads' });
    this._asphaltBuilder = asphalt; // сюда же добавятся участки кварталов

    // Пешеходные переходы (зебра) со всех 4 сторон каждого перекрёстка.
    const offset = rh + this.sidewalk / 2; // совпадает с линией пешеходов (waypoints)
    const stripe = new THREE.PlaneGeometry(0.55, 3).rotateX(-Math.PI / 2);
    const across = [];
    for (let s = -rh + 1.2; s <= rh - 1.2 + 1e-6; s += 1.15) across.push(s);
    const count = this.roadLines.length ** 2 * 4 * across.length;
    const stripes = new THREE.InstancedMesh(stripe, this.mats.stripes, count);
    const m = new THREE.Object3D();
    let k = 0;
    for (const cx of this.roadLines) {
      for (const cz of this.roadLines) {
        for (const sign of [-1, 1]) {
          for (const s of across) {
            // Переход через улицу вдоль Z: полоски вдоль Z, разложены по X.
            m.position.set(cx + s, 0.01, cz + sign * offset);
            m.rotation.set(0, 0, 0);
            m.updateMatrix();
            stripes.setMatrixAt(k++, m.matrix);
            // Переход через улицу вдоль X.
            m.position.set(cx + sign * offset, 0.01, cz + s);
            m.rotation.set(0, Math.PI / 2, 0);
            m.updateMatrix();
            stripes.setMatrixAt(k++, m.matrix);
          }
        }
      }
    }
    stripes.count = k;
    stripes.receiveShadow = true;
    stripes.computeBoundingSphere();
    this.group.add(stripes);
  }

  _buildBlocks() {
    const side = new GeometryBuilder();
    const grass = new GeometryBuilder();
    const asphalt = this._asphaltBuilder;
    const h = this.curbHeight;
    const curb = new THREE.Color('#b9b6ae');
    const walk = new THREE.Color(1, 1, 1);
    const lotColor = new THREE.Color('#c9c3b8');
    const green = new THREE.Color(1, 1, 1);

    for (const b of this.blocks) {
      const l = b.lot;
      side.walls(b.minX, 0, b.minZ, b.maxX, h, b.maxZ, curb, 4, 4);
      // Кольцо тротуара (4 полосы, без перекрытия с участком — нет z-fighting).
      side.flat(b.minX, b.minZ, b.maxX, l.minZ, h, walk, 4);
      side.flat(b.minX, l.maxZ, b.maxX, b.maxZ, h, walk, 4);
      side.flat(b.minX, l.minZ, l.minX, l.maxZ, h, walk, 4);
      side.flat(l.maxX, l.minZ, b.maxX, l.maxZ, h, walk, 4);

      if (b.type === 'park') {
        // Газон с крестом дорожек шириной 4 м.
        const cx = b.cx, cz = b.cz, p = 2;
        grass.flat(l.minX, l.minZ, cx - p, cz - p, h, green, 8);
        grass.flat(cx + p, l.minZ, l.maxX, cz - p, h, green, 8);
        grass.flat(l.minX, cz + p, cx - p, l.maxZ, h, green, 8);
        grass.flat(cx + p, cz + p, l.maxX, l.maxZ, h, green, 8);
        side.flat(l.minX, cz - p, l.maxX, cz + p, h, walk, 4);
        side.flat(cx - p, l.minZ, cx + p, cz - p, h, walk, 4);
        side.flat(cx - p, cz + p, cx + p, l.maxZ, h, walk, 4);
      } else {
        asphalt.flat(l.minX, l.minZ, l.maxX, l.maxZ, h, lotColor, 8);
      }
    }
    this._addMesh(side.build(), this.mats.sidewalk, { name: 'sidewalks' });
    this._addMesh(grass.build(), this.mats.grass, { name: 'parks' });
    this._addMesh(asphalt.build(), this.mats.asphalt, { name: 'asphalt' });
  }

  // Рекурсивно режет участок на парцеллы под здания.
  _subdivide(rect, out, depth) {
    const rng = this.rng;
    const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ;
    const min = 14;
    const canX = w >= min * 2, canZ = d >= min * 2;
    if (depth >= 4 || (!canX && !canZ) || (depth >= 2 && rng.chance(0.2))) {
      out.push(rect);
      return;
    }
    const splitX = canX && (!canZ || w > d || (w === d && rng.chance(0.5)));
    const t = rng.range(0.35, 0.65);
    if (splitX) {
      const x = rect.minX + w * t;
      this._subdivide({ ...rect, maxX: x }, out, depth + 1);
      this._subdivide({ ...rect, minX: x }, out, depth + 1);
    } else {
      const z = rect.minZ + d * t;
      this._subdivide({ ...rect, maxZ: z }, out, depth + 1);
      this._subdivide({ ...rect, minZ: z }, out, depth + 1);
    }
  }

  _buildBuildings() {
    const rng = this.rng;
    const base = this.curbHeight;
    const chunks = new Map(); // кварталы группируются по 3x3 в один меш
    const chunkOf = (b) => {
      const key = `${Math.floor(b.i / 3)},${Math.floor(b.j / 3)}`;
      if (!chunks.has(key)) chunks.set(key, { facade: new GeometryBuilder(), plain: new GeometryBuilder() });
      return chunks.get(key);
    };
    const snap = (h) => Math.max(FLOOR, Math.round(h / FLOOR) * FLOOR);
    const color = new THREE.Color();

    for (const block of this.blocks) {
      if (block.type !== 'buildings') continue;
      const chunk = chunkOf(block);
      const parcels = [];
      this._subdivide(block.lot, parcels, 0);

      for (const p of parcels) {
        if (rng.chance(0.07)) {
          // Пустырь: вместо здания — дерево.
          this._pendingTrees.push({ x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2, y: base });
          continue;
        }
        const m = rng.range(0.6, 2.2);
        const x0 = p.minX + m, x1 = p.maxX - m, z0 = p.minZ + m, z1 = p.maxZ - m;
        const w = x1 - x0, d = z1 - z0;
        if (w < 6 || d < 6) continue;

        // Ближе к центру — выше (даунтаун), к окраинам — малоэтажка.
        const dist = Math.hypot((x0 + x1) / 2, (z0 + z1) / 2);
        const downtown = clamp(1 - dist / 380, 0, 1);
        let h = rng.range(6, 16) + Math.pow(downtown, 1.6) * rng.range(8, 90);
        if (rng.chance(0.12)) h *= 0.5;
        h = snap(h);

        color.set(h > 45 ? rng.pick(TOWER_COLORS) : rng.pick(BUILDING_COLORS));
        color.offsetHSL(0, rng.range(-0.03, 0.03), rng.range(-0.05, 0.05));
        const roof = color.clone().multiplyScalar(0.55);
        const uOff = rng.int(0, 7) / 8;

        chunk.facade.walls(x0, base, z0, x1, base + h, z1, color, FACADE_TILE_U, FACADE_TILE_V, uOff);
        chunk.plain.flat(x0, z0, x1, z1, base + h, roof);
        // Парапет по краю крыши.
        chunk.plain.walls(x0, base + h, z0, x1, base + h + 0.5, z1, roof);
        let total = h;

        // Ступенчатая башня на высоких зданиях.
        if (h > 30 && rng.chance(0.55)) {
          const inset = rng.range(0.15, 0.3) * Math.min(w, d);
          const h2 = snap(rng.range(0.2, 0.45) * h);
          const y0 = base + h;
          chunk.facade.walls(x0 + inset, y0, z0 + inset, x1 - inset, y0 + h2, z1 - inset,
            color, FACADE_TILE_U, FACADE_TILE_V, uOff);
          chunk.plain.flat(x0 + inset, z0 + inset, x1 - inset, z1 - inset, y0 + h2, roof);
          total += h2;
        }

        // Вентиляция/будки на крыше.
        const top = base + h;
        const details = rng.int(0, 3);
        const detailColor = new THREE.Color('#8d8d8a');
        for (let k = 0; k < details; k++) {
          const s = rng.range(1.2, 3);
          const px = rng.range(x0 + 1 + s, x1 - 1 - s), pz = rng.range(z0 + 1 + s, z1 - 1 - s);
          if (!(px > x0 && px < x1 && pz > z0 && pz < z1)) continue;
          chunk.plain.box(px - s / 2, top, pz - s / 2, px + s / 2, top + rng.range(0.8, 2.2), pz + s / 2, detailColor);
        }

        const building = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: base + total, type: 'building' };
        this.buildings.push(building);
        this.colliders.add(building);
      }
    }

    for (const chunk of chunks.values()) {
      this._addMesh(chunk.facade.build(), this.mats.facade, { cast: true, name: 'buildings' });
      this._addMesh(chunk.plain.build(), this.mats.plain, { cast: true, name: 'roofs' });
    }
  }

  _buildLamps() {
    const h = this.curbHeight;
    const inset = 0.7; // от края бордюра
    const spacing = CONFIG.world.lampSpacing;
    const lamps = [];
    for (const b of this.blocks) {
      const len = b.maxX - b.minX;
      const n = Math.floor((len - 16) / spacing) + 1;
      const step = (len - 16) / Math.max(1, n - 1);
      for (let k = 0; k < n; k++) {
        const t = 8 + k * step;
        lamps.push({ x: b.minX + t, z: b.maxZ - inset, rot: 0 });            // улица севернее (+Z)
        lamps.push({ x: b.minX + t, z: b.minZ + inset, rot: Math.PI });      // южнее
        lamps.push({ x: b.maxX - inset, z: b.minZ + t, rot: Math.PI / 2 });  // восточнее (+X)
        lamps.push({ x: b.minX + inset, z: b.minZ + t, rot: -Math.PI / 2 }); // западнее
      }
    }

    const pole = new THREE.CylinderGeometry(0.07, 0.11, 5.6, 8).translate(0, 2.8, 0);
    const arm = new THREE.BoxGeometry(0.08, 0.08, 1.5).translate(0, 5.5, 0.72);
    const head = new THREE.BoxGeometry(0.32, 0.12, 0.6).translate(0, 5.44, 1.4);
    const metal = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.6 });
    const light = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff0c8, emissiveIntensity: 0.4 });
    const meshes = [
      new THREE.InstancedMesh(pole, metal, lamps.length),
      new THREE.InstancedMesh(arm, metal, lamps.length),
      new THREE.InstancedMesh(head, light, lamps.length),
    ];
    const m = new THREE.Object3D();
    lamps.forEach((l, i) => {
      m.position.set(l.x, h, l.z);
      m.rotation.set(0, l.rot, 0);
      m.updateMatrix();
      for (const mesh of meshes) mesh.setMatrixAt(i, m.matrix);
      this.colliders.add({ minX: l.x - 0.14, maxX: l.x + 0.14, minZ: l.z - 0.14, maxZ: l.z + 0.14, height: 5.6, type: 'lamp' });
    });
    for (const mesh of meshes) {
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.lamps = lamps;
  }

  _buildTrees() {
    const rng = this.rng;
    const trees = this._pendingTrees;
    const h = this.curbHeight;

    // Парки: случайная посадка вне дорожек, с минимальной дистанцией.
    for (const b of this.blocks) {
      if (b.type !== 'park') continue;
      const l = b.lot;
      const placed = [];
      for (let tries = 0; tries < 300 && placed.length < 22; tries++) {
        const x = rng.range(l.minX + 2.5, l.maxX - 2.5);
        const z = rng.range(l.minZ + 2.5, l.maxZ - 2.5);
        if (Math.abs(x - b.cx) < 4 || Math.abs(z - b.cz) < 4) continue;
        if (placed.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)) continue;
        placed.push({ x, z, y: h });
      }
      trees.push(...placed);
    }

    // Окраина: кольцо между внешними улицами и границей мира, мимо дорог.
    const edge = this.gridMax + this.roadHalf + 3;
    const nearRoad = (v) => this.roadLines.some((c) => Math.abs(v - c) < this.roadHalf + 2.5);
    let added = 0;
    for (let tries = 0; tries < 5000 && added < CONFIG.world.outskirtsTrees; tries++) {
      const x = rng.range(-this.half + 4, this.half - 4);
      const z = rng.range(-this.half + 4, this.half - 4);
      if (Math.abs(x) < edge && Math.abs(z) < edge) continue;
      if (nearRoad(x) || nearRoad(z)) continue;
      trees.push({ x, z, y: 0 });
      added++;
    }

    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 7).translate(0, 1.3, 0);
    const crown = new THREE.IcosahedronGeometry(1.7, 1).translate(0, 3.6, 0);
    const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), trees.length);
    const crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), trees.length);
    const m = new THREE.Object3D();
    const c = new THREE.Color();
    trees.forEach((t, i) => {
      const s = rng.range(0.8, 1.35);
      m.position.set(t.x, t.y, t.z);
      m.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      m.scale.set(s, s * rng.range(0.9, 1.15), s);
      m.updateMatrix();
      trunkMesh.setMatrixAt(i, m.matrix);
      crownMesh.setMatrixAt(i, m.matrix);
      c.setHSL(rng.range(0.22, 0.33), rng.range(0.35, 0.55), rng.range(0.22, 0.34));
      crownMesh.setColorAt(i, c);
      this.colliders.add({ minX: t.x - 0.3, maxX: t.x + 0.3, minZ: t.z - 0.3, maxZ: t.z + 0.3, height: 3, type: 'tree' });
    });
    for (const mesh of [trunkMesh, crownMesh]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    this.trees = trees;
  }

  _buildBoundary() {
    // Бетонный отбойник по периметру мира.
    const b = new GeometryBuilder();
    const c = new THREE.Color('#9d9a93');
    const H = this.half, t = 0.7, y = 1.1;
    const walls = [
      [-H, -H, H, -H + t], [-H, H - t, H, H],
      [-H, -H, -H + t, H], [H - t, -H, H, H],
    ];
    for (const [x0, z0, x1, z1] of walls) {
      b.box(x0, 0, z0, x1, y, z1, c);
      this.colliders.add({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: y, type: 'barrier' });
    }
    this._addMesh(b.build(), this.mats.plain, { cast: true, name: 'boundary' });
  }

  // Граф тротуаров: 4 угла каждого квартала, соединённые вдоль сторон квартала
  // и "зебрами" через улицы к соседним кварталам.
  _buildWaypoints() {
    const s = this.roadHalf + this.sidewalk / 2;
    const n = this.blocksPerAxis;
    const corners = []; // [block][0..3]: 0 SW, 1 SE, 2 NE, 3 NW (S = -Z, E = +X)
    const add = (x, z) => {
      const node = { id: this.waypoints.length, x, z, links: [] };
      this.waypoints.push(node);
      return node;
    };
    const link = (a, b) => {
      a.links.push(b);
      b.links.push(a);
    };
    for (const b of this.blocks) {
      const c = [add(b.x0 + s, b.z0 + s), add(b.x1 - s, b.z0 + s), add(b.x1 - s, b.z1 - s), add(b.x0 + s, b.z1 - s)];
      link(c[0], c[1]); link(c[1], c[2]); link(c[2], c[3]); link(c[3], c[0]);
      corners.push(c);
    }
    const at = (i, j) => corners[j * n + i];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (i + 1 < n) { link(at(i, j)[1], at(i + 1, j)[0]); link(at(i, j)[2], at(i + 1, j)[3]); }
        if (j + 1 < n) { link(at(i, j)[3], at(i, j + 1)[0]); link(at(i, j)[2], at(i, j + 1)[1]); }
      }
    }
  }
}
