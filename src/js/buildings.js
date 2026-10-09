import * as THREE from 'three';

// Здания по районам города (world.js вызывает их из _buildBuildings):
//   houses     — дома окраин: стены с окнами, двускатная крыша, труба, крыльцо, гараж, деревья во дворе;
//   warehouse  — промзона: склады с воротами, контейнеры штабелями, цистерны;
//   tops       — навершия высотных зданий: шпиль, наклонная крыша, антенна с красным огнём, пояса;
//   cylTower   — круглая башня в даунтауне.
// Все функции принимают chunk = { facade, plain } (GeometryBuilder'ы с окнами и без), ctx = { world, rng, base, FLOOR }
// и возвращают описание здания для коллизий или null, если не влезло.

const FACADE_TILE_U = 32, FACADE_TILE_V = 28;
const HOUSE_WALLS = ['#e8dcc4', '#d9c7a0', '#c9d6c2', '#d6c0b0', '#bfc9d8', '#e3d2cf', '#cfd8dc', '#d8cfa8', '#c2b7a6'];
const ROOFS = ['#8a3b2e', '#6a4a3a', '#4a5560', '#7a2f2f', '#5c4a3a', '#3f4a42'];
const CONTAINERS = ['#c0392b', '#1f618d', '#d4ac0d', '#27ae60', '#7d3c98', '#ca6f1e', '#566573', '#16a085'];
const WAREHOUSE = ['#8a9199', '#a5978a', '#6f7d8c', '#b0a58f', '#7f8c8d'];

const col = (c) => new THREE.Color(c);
const NO_UV = [0, 0, 0, 0, 0, 0, 0, 0];

// ---------------------------------------------------------------- дома
export function buildHouse(ctx, p, chunk, dressing) {
  const { world, rng, base, FLOOR } = ctx;
  const w0 = p.maxX - p.minX, d0 = p.maxZ - p.minZ;
  if (w0 < 12 || d0 < 12) return null;
  const w = Math.min(rng.range(8, 13), w0 - 4), d = Math.min(rng.range(8, 12), d0 - 4);
  const cx = (p.minX + p.maxX) / 2 + rng.range(-1, 1), cz = (p.minZ + p.maxZ) / 2 + rng.range(-1, 1);
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  const floors = rng.chance(0.4) ? 2 : 1;
  const wallH = floors * FLOOR;
  const wall = col(rng.pick(HOUSE_WALLS)).offsetHSL(0, 0, rng.range(-0.03, 0.03));
  const roof = col(rng.pick(ROOFS));
  const top = base + wallH;
  chunk.facade.walls(x0, base, z0, x1, top, z1, wall, FACADE_TILE_U, FACADE_TILE_V, rng.int(0, 7) / 8);
  chunk.plain.box(x0 - 0.05, base, z0 - 0.05, x1 + 0.05, base + 0.5, z1 + 0.05, wall.clone().multiplyScalar(0.7));   // цоколь

  // Двускатная крыша: конёк вдоль длинной стороны.
  const alongX = w >= d;
  const rh = Math.min(alongX ? d : w, 10) * 0.3;
  const ov = 0.5;
  const R = roof, Rd = roof.clone().multiplyScalar(0.8);
  const gableColor = wall.clone().multiplyScalar(0.92);
  if (alongX) {
    const run = d / 2 + ov, len = Math.hypot(run, rh);
    chunk.plain.quad([x0 - ov, top, z1 + ov], [x1 + ov, top, z1 + ov], [x1 + ov, top + rh, cz], [x0 - ov, top + rh, cz], [0, rh / len, run / len], NO_UV, R);
    chunk.plain.quad([x1 + ov, top, z0 - ov], [x0 - ov, top, z0 - ov], [x0 - ov, top + rh, cz], [x1 + ov, top + rh, cz], [0, rh / len, -run / len], NO_UV, Rd);
    chunk.plain.tri([x0, top, z0], [x0, top, z1], [x0, top + rh * (d / (d + 2 * ov)), cz], [-1, 0, 0], NO_UV.slice(0, 6), gableColor);
    chunk.plain.tri([x1, top, z1], [x1, top, z0], [x1, top + rh * (d / (d + 2 * ov)), cz], [1, 0, 0], NO_UV.slice(0, 6), gableColor);
  } else {
    const run = w / 2 + ov, len = Math.hypot(run, rh);
    chunk.plain.quad([x1 + ov, top, z1 + ov], [x1 + ov, top, z0 - ov], [cx, top + rh, z0 - ov], [cx, top + rh, z1 + ov], [run / len, rh / len, 0], NO_UV, R);
    chunk.plain.quad([x0 - ov, top, z0 - ov], [x0 - ov, top, z1 + ov], [cx, top + rh, z1 + ov], [cx, top + rh, z0 - ov], [-run / len, rh / len, 0], NO_UV, Rd);
    chunk.plain.tri([x0, top, z1], [x1, top, z1], [cx, top + rh * (w / (w + 2 * ov)), z1], [0, 0, 1], NO_UV.slice(0, 6), gableColor);
    chunk.plain.tri([x1, top, z0], [x0, top, z0], [cx, top + rh * (w / (w + 2 * ov)), z0], [0, 0, -1], NO_UV.slice(0, 6), gableColor);
  }
  // Труба.
  const chx = alongX ? x1 - 1.8 : cx, chz = alongX ? cz : z1 - 1.8;
  chunk.plain.box(chx - 0.4, top, chz - 0.4, chx + 0.4, top + rh + 0.9, chz + 0.4, col('#8a6a5a'));

  // Дверь, крыльцо и гараж — на стороне, ближайшей к улице.
  const toStreet = [
    { n: [0, 1], d: p.maxZ - z1 }, { n: [0, -1], d: z0 - p.minZ }, { n: [1, 0], d: p.maxX - x1 }, { n: [-1, 0], d: x0 - p.minX },
  ].reduce((a, b) => (b.d < a.d ? b : a));
  const [nx, nz] = toStreet.n;
  const faceLen = nx ? d : w;
  const fx = nx > 0 ? x1 : nx < 0 ? x0 : cx, fz = nz > 0 ? z1 : nz < 0 ? z0 : cz;
  const rx = nz, rz = -nx;
  const P = (u, y, o) => [fx + rx * u + nx * o, y, fz + rz * u + nz * o];
  const quad = (u0, u1, y0, y1, o, color) => chunk.plain.quad(P(u0, y0, o), P(u1, y0, o), P(u1, y1, o), P(u0, y1, o), [nx, 0, nz], NO_UV, color);
  const du = faceLen * 0.25;
  quad(-du - 0.55, -du + 0.55, base + 0.5, base + 2.6, 0.03, col(rng.pick(['#5a3a22', '#2d4a6a', '#6a2a2a', '#2d5a3a'])));    // дверь
  chunk.plain.box(
    Math.min(fx + rx * (-du - 1.2) + nx * 1.2, fx + rx * (-du + 1.2)), base, Math.min(fz + rz * (-du - 1.2) + nz * 1.2, fz + rz * (-du + 1.2)),
    Math.max(fx + rx * (-du - 1.2) + nx * 1.2, fx + rx * (-du + 1.2)), base + 0.25, Math.max(fz + rz * (-du - 1.2) + nz * 1.2, fz + rz * (-du + 1.2)), col('#b9b6ae'));
  if (faceLen > 9) quad(du - 1.5, du + 1.5, base + 0.5, base + 2.6, 0.03, col('#d8d8d2'));                                       // гараж
  // Деревья во дворе.
  for (const [tx, tz] of [[p.minX + 2.2, p.minZ + 2.2], [p.maxX - 2.2, p.maxZ - 2.2], [p.minX + 2.2, p.maxZ - 2.2], [p.maxX - 2.2, p.minZ + 2.2]]) {
    if (rng.chance(0.5) && (tx < x0 - 1.5 || tx > x1 + 1.5 || tz < z0 - 1.5 || tz > z1 + 1.5)) world._pendingTrees.push({ x: tx, z: tz, y: base });
  }
  void dressing;
  return { minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: top + rh };
}

// ---------------------------------------------------------------- склады и контейнеры
export function buildWarehouse(ctx, p, chunk, parts, colliders) {
  const { rng, base } = ctx;
  const w0 = p.maxX - p.minX, d0 = p.maxZ - p.minZ;
  if (w0 < 14 || d0 < 14) return null;
  const roll = rng.next();
  if (roll < 0.5) {
    // Склад.
    const m = rng.range(1.5, 3);
    const x0 = p.minX + m, x1 = p.maxX - m, z0 = p.minZ + m, z1 = p.maxZ - m;
    const h = rng.range(7, 11);
    const wall = col(rng.pick(WAREHOUSE));
    chunk.plain.walls(x0, base, z0, x1, base + h, z1, wall, 1, 1);
    chunk.plain.flat(x0, z0, x1, z1, base + h, wall.clone().multiplyScalar(0.6));
    chunk.plain.box(x0 - 0.15, base + h, z0 - 0.15, x1 + 0.15, base + h + 0.5, z1 + 0.15, wall.clone().multiplyScalar(0.7));
    chunk.plain.walls(x0 - 0.05, base, z0 - 0.05, x1 + 0.05, base + 1.1, z1 + 0.05, wall.clone().multiplyScalar(0.55), 1, 1);
    chunk.plain.walls(x0 - 0.04, base + h - 1.6, z0 - 0.04, x1 + 0.04, base + h - 0.8, z1 + 0.04, col(rng.pick(['#c0392b', '#1f618d', '#e6b422', '#27ae60'])), 1, 1);
    // Ворота на ближней к улице стороне.
    const faces = [{ n: [0, 1], d: p.maxZ - z1 }, { n: [0, -1], d: z0 - p.minZ }, { n: [1, 0], d: p.maxX - x1 }, { n: [-1, 0], d: x0 - p.minX }];
    const f = faces.reduce((a, b) => (b.d < a.d ? b : a));
    const [nx, nz] = f.n;
    const fx = nx > 0 ? x1 : nx < 0 ? x0 : (x0 + x1) / 2, fz = nz > 0 ? z1 : nz < 0 ? z0 : (z0 + z1) / 2;
    const rx = nz, rz = -nx;
    const len = nx ? z1 - z0 : x1 - x0;
    const doors = Math.max(1, Math.floor(len / 9));
    for (let i = 0; i < doors; i++) {
      const u = (i - (doors - 1) / 2) * 8;
      const P = (uu, y) => [fx + rx * uu + nx * 0.06, y, fz + rz * uu + nz * 0.06];
      chunk.plain.quad(P(u - 2.6, base), P(u + 2.6, base), P(u + 2.6, base + 4.6), P(u - 2.6, base + 4.6), [nx, 0, nz], NO_UV, col('#d8d3c4'));
      chunk.plain.quad(P(u - 2.6, base + 3.7), P(u + 2.6, base + 3.7), P(u + 2.6, base + 4.0), P(u - 2.6, base + 4.0), [nx, 0, nz], NO_UV, col('#e6b422'));
    }
    // Вентиляция на крыше.
    for (let k = 0; k < rng.int(2, 4); k++) {
      const s = rng.range(1.2, 2.2), px = rng.range(x0 + 3, x1 - 3), pz = rng.range(z0 + 3, z1 - 3);
      chunk.plain.box(px - s / 2, base + h, pz - s / 2, px + s / 2, base + h + rng.range(1, 2), pz + s / 2, col('#8d8d8a'));
    }
    return { minX: x0, maxX: x1, minZ: z0, maxZ: z1, height: base + h + 0.5 };
  }
  if (roll < 0.85) {
    // Контейнерная площадка: ряды штабелей по 1-3 в высоту.
    const out = [];
    const cw = 2.5, cl = 12;
    const alongX = rng.chance(0.5);
    const rowsN = Math.floor((alongX ? d0 : w0) / (cw + 1.6)) - 1;
    const per = Math.floor((alongX ? w0 : d0) / (cl + 0.4)) - 0;
    for (let r = 0; r < Math.max(1, rowsN); r++) {
      for (let k = 0; k < per; k++) {
        if (rng.chance(0.18)) continue;
        const stack = rng.int(1, 3);
        const ax = alongX ? p.minX + 0.8 + k * (cl + 0.4) : p.minX + 1.4 + r * (cw + 1.6);
        const az = alongX ? p.minZ + 1.4 + r * (cw + 1.6) : p.minZ + 0.8 + k * (cl + 0.4);
        const bx1 = ax + (alongX ? cl : cw), bz1 = az + (alongX ? cw : cl);
        if (bx1 > p.maxX - 0.5 || bz1 > p.maxZ - 0.5) continue;
        const c = col(rng.pick(CONTAINERS)).offsetHSL(0, 0, rng.range(-0.05, 0.05));
        for (let s = 0; s < stack; s++) {
          parts.push({ geometry: new THREE.BoxGeometry(bx1 - ax, 2.6, bz1 - az).translate((ax + bx1) / 2, base + 1.3 + s * 2.6, (az + bz1) / 2), color: s ? c.clone().offsetHSL(0.03, 0, 0) : c });
          // ребристость: тёмные полосы вдоль
          parts.push({ geometry: new THREE.BoxGeometry(alongX ? bx1 - ax + 0.04 : 0.06, 0.12, alongX ? 0.06 : bz1 - az + 0.04).translate((ax + bx1) / 2, base + 1.3 + s * 2.6 + 0.9, alongX ? az - 0.02 : (az + bz1) / 2), color: c.clone().multiplyScalar(0.6) });
        }
        const cld = { minX: ax, maxX: bx1, minZ: az, maxZ: bz1, height: base + stack * 2.6, type: 'building' };
        colliders.push(cld);
        out.push(cld);
      }
    }
    return { container: true, list: out };
  }
  // Цистерны.
  const cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
  const R = Math.min(w0, d0) * 0.22;
  const out = [];
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (rng.chance(0.2)) continue;
    const tx = cx + ox * R * 1.15, tz = cz + oz * R * 1.15, h = rng.range(8, 12);
    const c = col(rng.pick(['#e8e8e4', '#d6d6d0', '#c8d0d6', '#e4d8c0']));
    parts.push({ geometry: new THREE.CylinderGeometry(R, R, h, 20).translate(tx, base + h / 2, tz), color: c });
    parts.push({ geometry: new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.3, 20).translate(tx, base + h, tz), color: c.clone().multiplyScalar(0.6) });
    parts.push({ geometry: new THREE.CylinderGeometry(R * 0.5, R * 0.5, 0.4, 14).translate(tx, base + h + 0.3, tz), color: col('#8d8d8a') });
    const cld = { minX: tx - R * 0.9, maxX: tx + R * 0.9, minZ: tz - R * 0.9, maxZ: tz + R * 0.9, height: base + h + 0.5, type: 'building' };
    colliders.push(cld);
    out.push(cld);
  }
  return { container: true, list: out };
}

// ---------------------------------------------------------------- высотки
// Навершие: шпиль, наклонная крыша или просто антенна с красным огнём. Возвращает { extra, beacon }.
export function towerTop(ctx, chunk, x0, x1, z0, z1, top, color, roofColor) {
  const { rng } = ctx;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const kind = rng.pick(['spire', 'slant', 'antenna', 'antenna', 'crown']);
  let extra = 0;
  const steel = col('#c4c8cc');
  if (kind === 'spire') {
    const hs = rng.range(10, 24);
    const inset = Math.min(x1 - x0, z1 - z0) * 0.22;
    const a = x0 + inset, b = x1 - inset, c = z0 + inset, d = z1 - inset;
    const tip = [cx, top + hs, cz];
    // Пирамида.
    chunk.facade.walls(a, top, c, b, top + 2.5, d, color, FACADE_TILE_U, FACADE_TILE_V);
    const t = top + 2.5;
    const g = chunk.plain;
    const mk = (p0, p1, n) => g.tri(p0, p1, tip, n, [0, 0, 0, 0, 0, 0], steel);
    mk([a, t, d], [b, t, d], [0, 0.6, 0.8]);
    mk([b, t, c], [a, t, c], [0, 0.6, -0.8]);
    mk([b, t, d], [b, t, c], [0.8, 0.6, 0]);
    mk([a, t, c], [a, t, d], [-0.8, 0.6, 0]);
    extra = 2.5 + hs;
    return { extra, beacon: [cx, top + hs, cz] };
  }
  if (kind === 'slant') {
    // Односкатная косая крыша: от южного края вверх к северному.
    const hs = rng.range(5, 12);
    const g = chunk.plain, run = z1 - z0, len = Math.hypot(run, hs);
    const Z = [0, 0, 0, 0, 0, 0, 0, 0];
    g.quad([x0, top, z1], [x1, top, z1], [x1, top + hs, z0], [x0, top + hs, z0], [0, run / len, hs / len], Z, roofColor.clone().multiplyScalar(1.4));
    g.quad([x1, top, z0], [x0, top, z0], [x0, top + hs, z0], [x1, top + hs, z0], [0, 0, -1], Z, color.clone().multiplyScalar(0.9));
    g.tri([x0, top, z0], [x0, top, z1], [x0, top + hs, z0], [-1, 0, 0], Z.slice(0, 6), color);
    g.tri([x1, top, z1], [x1, top, z0], [x1, top + hs, z0], [1, 0, 0], Z.slice(0, 6), color);
    return { extra: hs, beacon: [cx, top + hs + 0.3, z0 + 0.6] };
  }
  if (kind === 'crown') {
    // Корона: пояс с "зубцами" и золотой верх.
    const g = chunk.plain;
    const gold = col('#d9b13b');
    g.box(x0 - 0.3, top, z0 - 0.3, x1 + 0.3, top + 1.2, z1 + 0.3, gold);
    const nT = 5;
    for (let i = 0; i <= nT; i++) {
      const px = x0 + ((x1 - x0) * i) / nT;
      g.box(px - 0.35, top + 1.2, z0 - 0.3, px + 0.35, top + 2.8, z0 + 0.3, gold);
      g.box(px - 0.35, top + 1.2, z1 - 0.3, px + 0.35, top + 2.8, z1 + 0.3, gold);
    }
    return { extra: 2.8, beacon: [cx, top + 3.4, cz] };
  }
  // Антенна.
  const mast = rng.range(6, 16);
  chunk.plain.box(cx - 0.18, top, cz - 0.18, cx + 0.18, top + mast, cz + 0.18, steel);
  chunk.plain.box(cx - 0.9, top + mast * 0.6, cz - 0.12, cx + 0.9, top + mast * 0.6 + 0.2, cz + 0.12, steel);
  return { extra: mast, beacon: [cx, top + mast + 0.2, cz] };
}

// Круглая башня (стены — 28 граней с окнами).
export function cylTower(ctx, chunk, cx, cz, r, h, color) {
  const { base } = ctx;
  const seg = 28;
  const g = chunk.facade;
  const circ = (Math.PI * 2 * r) / FACADE_TILE_U;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const x0 = cx + Math.sin(a0) * r, z0 = cz + Math.cos(a0) * r, x1 = cx + Math.sin(a1) * r, z1 = cz + Math.cos(a1) * r;
    const am = (a0 + a1) / 2;
    const u0 = (i / seg) * circ, u1 = ((i + 1) / seg) * circ;
    const v0 = base / FACADE_TILE_V, v1 = (base + h) / FACADE_TILE_V;
    // Против часовой стрелки при взгляде снаружи: угол растёт слева направо.
    g.quad([x0, base, z0], [x1, base, z1], [x1, base + h, z1], [x0, base + h, z0], [Math.sin(am), 0, Math.cos(am)], [u0, v0, u1, v0, u1, v1, u0, v1], color);
  }
  const roof = color.clone().multiplyScalar(0.55);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    chunk.plain.tri([cx, base + h, cz], [cx + Math.sin(a0) * r, base + h, cz + Math.cos(a0) * r], [cx + Math.sin(a1) * r, base + h, cz + Math.cos(a1) * r], [0, 1, 0], [0, 0, 0, 0, 0, 0], roof);
  }
  // Кольцо на крыше.
  chunk.plain.box(cx - r * 0.5, base + h, cz - r * 0.5, cx + r * 0.5, base + h + 1.2, cz + r * 0.5, col('#8d8d8a'));
  return { minX: cx - r * 0.92, maxX: cx + r * 0.92, minZ: cz - r * 0.92, maxZ: cz + r * 0.92, height: base + h + 1.2 };
}
