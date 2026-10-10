import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GeometryBuilder, mergeColored } from './geometry.js';
import {
  brickTexture, plasterTexture, tileTexture, concreteTexture, gravelTexture, barsTexture, chainlinkTexture, razorTexture,
  courtTexture, labelTexture, posterTexture, PlateAtlas,
} from './prison-tex.js';
import { createKit } from './prison-props.js';
import { makeLib } from './prison-detail-lib.js';
import { detailCells, detailBlocks, doorHardwareGeometry } from './prison-detail-cells.js';
import { detailCafe, detailKitchen, detailCommissary, detailLaundry, detailLibrary } from './prison-detail-rooms.js';
import { makeFurniture } from './prison-detail-furniture.js';
import { detailAdmin, detailGate, detailVisit, detailInfirmary, detailHole, holeDoorGeometry } from './prison-detail-areas.js';
import { detailYard, detailFence, detailPerimeter, detailTowers, detailNightLights } from './prison-detail-outdoors.js';
import { createRng } from './utils.js';

// Тюрьма штата «Редрок» — один квартал города (landmarkBlocks.prison), 76 x 76 м, обнесён бетонной стеной с
// колючкой и угловыми вышками. Строится в «локальных» координатах (x вправо, z к воротам) и переводится в мировые
// поворотом на 0/90/180/270°: ворота смотрят в сторону центра города.
//
// Планировка (локальные координаты, z > 0 — к воротам):
//   z 20..32    Админ (приём, кабинет начальника, оружейная) | Ворота-шлюз | Свидания | Лазарет
//   z 18..20    южная аллея (всё стыкуется с ней)
//   z -20..18   Блок A (камеры вдоль западной стены) | аллея | Столовая / Прачечная / Библиотека | Двор у восточной сетки
//   z -32..-20  Блок B (камеры вдоль северной стены) | Кухня | Лавка | Карцер («Дыра»)
//   по периметру: коридор охраны 4 м между зданиями и стеной (x, z = ±32 .. ±36), стена 6.5 м, вышки с прожекторами.
// Побег: подкоп из камеры, сетка двора (восточная) + стена верёвкой, форма охранника у ворот, взятка, бунт (prison.js).
//
// Возвращает layout: переводчики координат, камеры, станции, зоны, динамические двери и ворота — их использует prison.js.

const H0 = CONFIG.world.curbHeight;
const FLOOR = H0 + 0.03;
const WALL_H = 6.5;

export function buildPrison(world, block, { group, glowMat }) {
  const game = world.game;
  const cx = block.cx, cz = block.cz;

  // Ворота — в сторону центра города.
  const gate = Math.abs(cx) > Math.abs(cz) ? (cx > 0 ? '-x' : '+x') : (cz > 0 ? '-z' : '+z');
  const K = { '+z': 0, '+x': 1, '-z': 2, '-x': 3 }[gate];
  const toWorld = (lx, lz) => {
    switch (K) {
      case 0: return [cx + lx, cz + lz];
      case 1: return [cx + lz, cz - lx];
      case 2: return [cx - lx, cz - lz];
      default: return [cx - lz, cz + lx];
    }
  };
  const dirW = (nx, nz) => {
    switch (K) {
      case 0: return [nx, nz];
      case 1: return [nz, -nx];
      case 2: return [-nx, -nz];
      default: return [-nz, nx];
    }
  };
  const toLocal = (wx, wz) => {
    const dx = wx - cx, dz = wz - cz;
    switch (K) {
      case 0: return [dx, dz];
      case 1: return [-dz, dx];
      case 2: return [-dx, -dz];
      default: return [dz, -dx];
    }
  };
  const headingW = (lh) => lh + [0, Math.PI / 2, Math.PI, -Math.PI / 2][K];   // направление (sin h, cos h) локальное -> мировое
  const P = (lx, lz) => { const [x, z] = toWorld(lx, lz); return { x, z }; };

  // ---------------------------------------------------------------- материалы
  const tex = {
    brick: brickTexture(), plaster: plasterTexture(), tile: tileTexture(), conc: concreteTexture(), gravel: gravelTexture(),
    bars: barsTexture(), chain: chainlinkTexture(), razor: razorTexture(), court: courtTexture(),
  };
  const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.92, ...extra });
  const M = {
    brick: std(tex.brick), plaster: std(tex.plaster), tile: std(tex.tile, { roughness: 0.6 }), conc: std(tex.conc),
    gravel: std(tex.gravel), plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7, envMap: game.envMap ?? null }),
    bars: new THREE.MeshStandardMaterial({ map: tex.bars, transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }),
    chain: new THREE.MeshBasicMaterial({ map: tex.chain, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xb7bec6 }),
    razor: new THREE.MeshBasicMaterial({ map: tex.razor, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xc8cdd2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.85 }),
    glassClear: new THREE.MeshStandardMaterial({ color: 0x9fd0e8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false }),
  };
  const B = {
    brick: new GeometryBuilder(), plaster: new GeometryBuilder(), tile: new GeometryBuilder(), conc: new GeometryBuilder(),
    gravel: new GeometryBuilder(), plain: new GeometryBuilder(), bars: new GeometryBuilder(), glass: new GeometryBuilder(),
    glow: new GeometryBuilder(), winGlow: new GeometryBuilder(), clear: new GeometryBuilder(), ceil: new GeometryBuilder(), paint: new GeometryBuilder(),
  };
  const parts = [];          // мебель и металл: { geometry, color } (уже в мировых координатах)
  const col = (c) => new THREE.Color(c);
  // Детали (prison-props.js): склеенные меши по кускам, таблички-атлас, разметка пола.
  const kit = createKit({ K, toWorld, cx, cz, world, glowMat, envMap: game.envMap });
  const detailRng = createRng(5150);
  const lib = makeLib(kit, detailRng);
  const fur = makeFurniture(kit, detailRng);
  const plates = new PlateAtlas();

  const emit = (b, a, bb, c, d, n, uv, color) => {
    const t = (p) => { const [x, z] = toWorld(p[0], p[2]); return [x, p[1], z]; };
    const [nx, nz] = dirW(n[0], n[2]);
    b.quad(t(a), t(bb), t(c), t(d), [nx, n[1], nz], uv, col(color));
  };
  // Вертикальная плоскость x = X (нормаль dir по x), z0..z1, y0..y1; UV — в метрах / tile.
  const fx = (b, X, z0, z1, y0, y1, dir, color, tile = 2) => {
    if (dir > 0) emit(b, [X, y0, z1], [X, y0, z0], [X, y1, z0], [X, y1, z1], [1, 0, 0], [z1 / tile, y0 / tile, z0 / tile, y0 / tile, z0 / tile, y1 / tile, z1 / tile, y1 / tile], color);
    else emit(b, [X, y0, z0], [X, y0, z1], [X, y1, z1], [X, y1, z0], [-1, 0, 0], [z0 / tile, y0 / tile, z1 / tile, y0 / tile, z1 / tile, y1 / tile, z0 / tile, y1 / tile], color);
  };
  const fz = (b, Z, x0, x1, y0, y1, dir, color, tile = 2) => {
    if (dir > 0) emit(b, [x0, y0, Z], [x1, y0, Z], [x1, y1, Z], [x0, y1, Z], [0, 0, 1], [x0 / tile, y0 / tile, x1 / tile, y0 / tile, x1 / tile, y1 / tile, x0 / tile, y1 / tile], color);
    else emit(b, [x1, y0, Z], [x0, y0, Z], [x0, y1, Z], [x1, y1, Z], [0, 0, -1], [x1 / tile, y0 / tile, x0 / tile, y0 / tile, x0 / tile, y1 / tile, x1 / tile, y1 / tile], color);
  };
  const up = (b, x0, z0, x1, z1, y, color, tile = 2) => emit(b, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0],
    [x0 / tile, z1 / tile, x1 / tile, z1 / tile, x1 / tile, z0 / tile, x0 / tile, z0 / tile], color);
  const down = (b, x0, z0, x1, z1, y, color, tile = 2) => emit(b, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0],
    [x0 / tile, z0 / tile, x1 / tile, z0 / tile, x1 / tile, z1 / tile, x0 / tile, z1 / tile], color);
  const paint = { flat: (x0, z0, x1, z1, y, color) => up(B.paint, x0, z0, x1, z1, y, color, 1) };

  // Мебель: коробка в локальных координатах (центр lx, ly, lz), поворот ry вокруг вертикали.
  const furn = (w, h, d, lx, ly, lz, color, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(ry + [0, Math.PI / 2, Math.PI, -Math.PI / 2][K]);
    const [wx, wz] = toWorld(lx, lz);
    g.translate(wx, ly, wz);
    parts.push({ geometry: g, color });
    return g;
  };

  // Коллайдеры (локальный прямоугольник -> мировой AABB).
  const colliders = [];
  const solid = (x0, z0, x1, z1, h, opts = {}) => {
    const a = toWorld(x0, z0), b = toWorld(x1, z1);
    const box = {
      minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]),
      height: h, type: opts.type ?? 'building', landmark: true,
    };
    world.colliders.add(box);
    colliders.push(box);
    if (opts.minimap) world.buildings.push(box);
    return box;
  };

  // Прозрачное для взглядов препятствие (решётка, сетка, стекло): мешает ходить, но не смотреть (prison.js: lineOfSightSoft).
  const seeSolid = (...a) => { const b = solid(...a); b.see = true; return b; };

  // ---------------------------------------------------------------- стены
  const DADO = 1.5;
  const WALL_PLASTER = '#d8d6c8', DADO_COLOR = '#6f8f86';
  // Стена-коробка: сторона out (px/nx/pz/nz) — снаружи (кирпич/бетон), остальные — внутренняя покраска (низ — панель).
  const wallBox = (x0, z0, x1, z1, y0, y1, { out = [], ext = 'brick', extColor = '#c9b6a8', wall = WALL_PLASTER, dado = DADO_COLOR, top = false, tile = 2 } = {}) => {
    const sides = [
      ['px', (b, c, ya, yb) => fx(b, x1, z0, z1, ya, yb, 1, c, tile)],
      ['nx', (b, c, ya, yb) => fx(b, x0, z0, z1, ya, yb, -1, c, tile)],
      ['pz', (b, c, ya, yb) => fz(b, z1, x0, x1, ya, yb, 1, c, tile)],
      ['nz', (b, c, ya, yb) => fz(b, z0, x0, x1, ya, yb, -1, c, tile)],
    ];
    for (const [name, draw] of sides) {
      if (out.includes(name)) draw(B[ext], extColor, y0, y1);
      else if (y0 < DADO && y1 > DADO) { draw(B.plaster, dado, y0, DADO); draw(B.plaster, wall, DADO, y1); }
      else draw(B.plaster, y1 <= DADO ? dado : wall, y0, y1);
    }
    if (top) up(B.conc, x0, z0, x1, z1, y1, '#8a8a86', 6);
  };

  // Стена вдоль оси с проёмами: axis 'x' — идёт вдоль x (z = fixed), 'z' — вдоль z (x = fixed).
  // gaps — [[центр, ширина], ...]. out — внешняя сторона (px/nx/pz/nz). Над проёмом — перемычка.
  const wallRun = (axis, fixed, a, b, { t = 0.5, y0 = 0, y1 = 4.2, gaps = [], door = 2.5, solidBox = true, ...style } = {}) => {
    const g = [...gaps].sort((p, q) => p[0] - q[0]);
    let cur = a;
    const seg = (s, e, lo, hi, collide) => {
      if (e - s < 0.01) return;
      const r = axis === 'x' ? [s, fixed - t / 2, e, fixed + t / 2] : [fixed - t / 2, s, fixed + t / 2, e];
      wallBox(r[0], r[1], r[2], r[3], lo, hi, style);
      if (collide && solidBox) solid(r[0], r[1], r[2], r[3], y1);
    };
    for (const [c, w] of g) {
      seg(cur, c - w / 2, y0, y1, true);
      seg(c - w / 2, c + w / 2, door, y1, false);      // перемычка
      // Рамка проёма: тёмные косяки.
      const jam = (p) => (axis === 'x' ? furn(0.12, door, t + 0.1, p, door / 2, fixed, '#2e3238') : furn(t + 0.1, door, 0.12, fixed, door / 2, p, '#2e3238'));
      jam(c - w / 2);
      jam(c + w / 2);
      cur = c + w / 2;
    }
    seg(cur, b, y0, y1, true);
  };

  // Здание: наружные стены, пол, потолок со светом, крыша с парапетом. doors: { n, s, e, w: [[центр, ширина]] },
  // центр — координата вдоль стены (x для n/s, z для e/w).
  const buildings = [];
  const BUILD_H = 4.2;
  const windowSlots = [];
  const building = (id, x0, z0, x1, z1, { doors = {}, floor = '#8d9094', wallColor = '#c4b2a4', h = BUILD_H, windows = ['n', 's', 'e', 'w'], name = id } = {}) => {
    const t = 0.5;
    const base = { t, y1: h, ext: 'brick', extColor: wallColor };
    wallRun('x', z0 + t / 2, x0, x1, { ...base, gaps: doors.n ?? [], out: ['nz'] });
    wallRun('x', z1 - t / 2, x0, x1, { ...base, gaps: doors.s ?? [], out: ['pz'] });
    wallRun('z', x0 + t / 2, z0 + t, z1 - t, { ...base, gaps: doors.w ?? [], out: ['nx'] });
    wallRun('z', x1 - t / 2, z0 + t, z1 - t, { ...base, gaps: doors.e ?? [], out: ['px'] });
    up(B.tile, x0 + t, z0 + t, x1 - t, z1 - t, FLOOR, floor, 2);
    down(B.ceil, x0, z0, x1, z1, h, '#ffffff', 4);
    // Крыша и парапет.
    up(B.conc, x0, z0, x1, z1, h + 0.25, '#6f716f', 6);
    for (const r of [[x0, z0, x1, z0 + 0.35], [x0, z1 - 0.35, x1, z1], [x0, z0 + 0.35, x0 + 0.35, z1 - 0.35], [x1 - 0.35, z0 + 0.35, x1, z1 - 0.35]]) {
      wallBox(r[0], r[1], r[2], r[3], h + 0.25, h + 0.75, { out: ['px', 'nx', 'pz', 'nz'], ext: 'conc', extColor: '#9a9a96', top: true, tile: 6 });
    }
    // Светильники под потолком в стальных каркасах (светятся ночью сильнее).
    kit.use(id);
    for (let x = x0 + 3; x < x1 - 1.5; x += 4.5) {
      for (let z = z0 + 3; z < z1 - 1.5; z += 4.5) lib.cageLamp(kit.frame(x, z, 0, FLOOR), 0, h - FLOOR - 0.07, 0, 1.4, 0.34);
    }
    // Окна: тёмное стекло с решёткой снаружи, горит жёлтым ночью.
    const sideOf = { n: { fixed: z0, a: x0, b: x1, axis: 'x', dir: -1 }, s: { fixed: z1, a: x0, b: x1, axis: 'x', dir: 1 }, w: { fixed: x0, a: z0, b: z1, axis: 'z', dir: -1 }, e: { fixed: x1, a: z0, b: z1, axis: 'z', dir: 1 } };
    for (const s of windows) {
      const S = sideOf[s];
      const gaps = doors[s] ?? [];
      for (let p = S.a + 2.5; p < S.b - 1.5; p += 5) {
        if (gaps.some(([c, w]) => Math.abs(c - p) < w / 2 + 1.4)) continue;
        const o = S.fixed + S.dir * 0.03;
        if (S.axis === 'x') {
          fz(B.glass, o, p - 0.55, p + 0.55, 2.2, 3.3, S.dir, '#16222f');
          fz(B.winGlow, o + S.dir * 0.01, p - 0.5, p + 0.5, 2.25, 3.25, S.dir, '#ffd37a');
          for (let k = -2; k <= 2; k++) furn(0.04, 1.1, 0.06, p + k * 0.22, 2.75, o + S.dir * 0.05, '#20242a');
        } else {
          fx(B.glass, o, p - 0.55, p + 0.55, 2.2, 3.3, S.dir, '#16222f');
          fx(B.winGlow, o + S.dir * 0.01, p - 0.5, p + 0.5, 2.25, 3.25, S.dir, '#ffd37a');
          for (let k = -2; k <= 2; k++) furn(0.06, 1.1, 0.04, o + S.dir * 0.05, 2.75, p + k * 0.22, '#20242a');
        }
        windowSlots.push({ id, s, p });
      }
    }
    const b = { id, name, x0, z0, x1, z1, h };
    buildings.push(b);
    // Контур на миникарту.
    world.buildings.push((() => {
      const a = toWorld(x0, z0), c = toWorld(x1, z1);
      return { minX: Math.min(a[0], c[0]), maxX: Math.max(a[0], c[0]), minZ: Math.min(a[1], c[1]), maxZ: Math.max(a[1], c[1]), height: h, type: 'building', landmark: true, decor: true };
    })());
    return b;
  };

  // Внутренняя перегородка (покраска с двух сторон).
  const partition = (axis, fixed, a, b, opts = {}) => wallRun(axis, fixed, a, b, { t: 0.25, y1: BUILD_H, out: [], ...opts });

  // Вывеска-плоскость (отдельный меш): на стене, смотрит в сторону facing (локальная нормаль nx, nz).
  const signs = [];
  const sign = (text, lx, ly, lz, nx, nz, w, h, opts = {}) => {
    const t = labelTexture(text, { w: Math.round(w * 160), h: Math.round(h * 160), ...opts });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: true }));
    const [wx, wz] = toWorld(lx, lz);
    const [dx, dz] = dirW(nx, nz);
    m.position.set(wx + dx * 0.02, ly, wz + dz * 0.02);
    m.rotation.y = Math.atan2(dx, dz);
    group.add(m);
    world.glow.push({ mat: m.material, base: new THREE.Color(0xffffff), day: 0.75, night: 1.25 });
    signs.push(m);
    return m;
  };

  // ================================================================ НАРУЖНЫЕ ПОКРЫТИЯ
  const LOT = 38;
  // Базовый бетон всего участка, гравий коридора охраны и двора.
  up(B.conc, -LOT, -LOT, LOT, LOT, H0 + 0.015, '#a7a7a1', 6);
  up(B.gravel, -36, -36, 36, 36, H0 + 0.02, '#8d8a80', 4);
  up(B.conc, -32, -32, 32, 32, H0 + 0.025, '#b0b0aa', 6);
  up(B.gravel, 6, -20, 32, 18, H0 + 0.03, '#9a958a', 4);              // двор
  up(B.conc, -3, 20, 3, 37.5, H0 + 0.035, '#9b9b96', 6);               // шлюз

  // ================================================================ ПЕРИМЕТР
  const wallStyle = { out: ['px', 'nx', 'pz', 'nz'], ext: 'conc', extColor: '#bdbbb2', wall: '#b4b3ac', dado: '#b4b3ac', top: true, tile: 6 };
  // Бетонная стена по 4 сторонам; в передней — проём шлюза.
  const perim = (x0, z0, x1, z1) => { wallBox(x0, z0, x1, z1, 0, WALL_H, wallStyle); solid(x0, z0, x1, z1, WALL_H); };
  perim(-37.5, -37.5, 37.5, -36);                // север
  perim(-37.5, -37.5, -36, 37.5);                // запад
  perim(36, -37.5, 37.5, 37.5);                  // восток
  perim(-37.5, 36, -2.5, 37.5);                  // юг слева от шлюза
  perim(2.5, 36, 37.5, 37.5);                    // юг справа
  wallBox(-2.5, 36, 2.5, 37.5, 4.6, WALL_H, wallStyle);   // перемычка над воротами
  // Нижний пояс и верхний карниз для объёма.
  for (const r of [[-37.7, -37.7, 37.7, -35.8], [-37.7, -37.7, -35.8, 37.7], [35.8, -37.7, 37.7, 37.7]]) {
    wallBox(r[0], r[1], r[2], r[3], 0, 0.5, { ...wallStyle, extColor: '#7d7d78' });
    wallBox(r[0], r[1], r[2], r[3], WALL_H - 0.3, WALL_H + 0.1, { ...wallStyle, extColor: '#82827d' });
  }
  for (const r of [[-37.7, 35.8, -2.3, 37.7], [2.3, 35.8, 37.7, 37.7]]) {
    wallBox(r[0], r[1], r[2], r[3], 0, 0.5, { ...wallStyle, extColor: '#7d7d78' });
    wallBox(r[0], r[1], r[2], r[3], WALL_H - 0.3, WALL_H + 0.1, { ...wallStyle, extColor: '#82827d' });
  }

  // Колючая проволока на стене и сетке: тонкие плоскости с текстурой витков (пересечением двух).
  const razorMeshes = [];
  const razor = (lx0, lz0, lx1, lz1, y, h = 1) => {
    const len = Math.hypot(lx1 - lx0, lz1 - lz0);
    const geo = new THREE.PlaneGeometry(len, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / 2));
    for (const rot of [0, Math.PI / 2.4]) {
      const m = new THREE.Mesh(geo, M.razor);
      const [wx0, wz0] = toWorld(lx0, lz0), [wx1, wz1] = toWorld(lx1, lz1);
      m.position.set((wx0 + wx1) / 2, y, (wz0 + wz1) / 2);
      m.rotation.set(0, Math.atan2(wx1 - wx0, wz1 - wz0) - Math.PI / 2, rot * 0.12);
      group.add(m);
      razorMeshes.push(m);
    }
  };
  razor(-37.2, -36.8, 37.2, -36.8, WALL_H + 0.5);
  razor(-36.8, -37.2, -36.8, 37.2, WALL_H + 0.5);
  razor(36.8, -37.2, 36.8, 37.2, WALL_H + 0.5);
  razor(-37.2, 36.8, -2.5, 36.8, WALL_H + 0.5);
  razor(2.5, 36.8, 37.2, 36.8, WALL_H + 0.5);

  // Прожекторы на стене (светящиеся панели внутрь).
  for (let t = -30; t <= 30; t += 12) {
    for (const [lx, lz, n] of [[t, -35.9, [0, 1]], [t, 35.9, [0, -1]], [-35.9, t, [1, 0]], [35.9, t, [-1, 0]]]) {
      if (lz > 35 && Math.abs(t) < 6) continue;
      furn(n[0] ? 0.3 : 1.0, 0.3, n[1] ? 0.3 : 1.0, lx, WALL_H - 0.9, lz, '#2b2f35');
      if (n[1]) fz(B.glow, lz + n[1] * 0.17, t - 0.4, t + 0.4, WALL_H - 1.05, WALL_H - 0.75, n[1], '#ffffff', 1);
      else fx(B.glow, lx + n[0] * 0.17, t - 0.4, t + 0.4, WALL_H - 1.05, WALL_H - 0.75, n[0], '#ffffff', 1);
    }
  }

  // Угловые вышки: опоры — коллайдеры (вид — prison-detail-outdoors.js: стальной каркас, кабина с остеклением, прожектор).
  const towers = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = sx * 34, tz = sz * 34;
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) solid(tx + dx - 0.25, tz + dz - 0.25, tx + dx + 0.25, tz + dz + 0.25, 8.6);
    // Часовой в кабине (модель без ИИ создаёт prison.js): точка и направление.
    towers.push({ x: tx, z: tz, sx, sz, y: 8.9 });
  }

  // ================================================================ ЗДАНИЯ
  const ROOMS = {};
  const room = (id, x0, z0, x1, z1, extra = {}) => { ROOMS[id] = { id, x0, z0, x1, z1, ...extra }; return ROOMS[id]; };

  // --- Админ (приём, кабинет начальника, оружейная)
  building('admin', -32, 20, -8, 32, { floor: '#a09378', wallColor: '#b9a597', doors: { n: [[-27, 2.2], [-18.5, 2.0], [-11.5, 2.0]] }, windows: ['n', 'w', 's'], name: 'Администрация' });
  partition('z', -22, 20.5, 31.5, { gaps: [[26, 2]] });
  partition('z', -15, 20.5, 31.5, { gaps: [[28, 2]] });
  room('intake', -32, 20, -22, 32, { name: 'Приёмное отделение' });
  room('warden', -22, 20, -15, 32, { name: 'Кабинет начальника', restricted: true });
  room('armory', -15, 20, -8, 32, { name: 'Оружейная', restricted: true });
  // --- Ворота-шлюз (проход 5 м, по бокам будки охраны)
  building('gate', -8, 20, 8, 36, { floor: '#8d9094', wallColor: '#a9a7a0', doors: { n: [[0, 5], [-5.25, 2.2], [5.25, 2.2]], s: [[0, 5]] }, windows: [], name: 'Шлюз' });
  // Проход шлюза x∈[-2.5, 2.5] насквозь (до стены периметра, где проём с воротами), будки охраны по бокам.
  partition('z', -2.5, 20.5, 35.5, { gaps: [[23, 2.0], [33, 2.0]] });
  partition('z', 2.5, 20.5, 35.5, { gaps: [[23, 2.0], [33, 2.0]] });
  room('gate', -8, 20, 8, 37.5, { name: 'Ворота' });
  // --- Свидания
  building('visit', 8, 20, 20, 32, { floor: '#9ba1a6', wallColor: '#b5a89c', doors: { n: [[14, 2.4]] }, windows: ['n', 's'], name: 'Комната свиданий' });
  room('visit', 8, 20, 20, 32, { name: 'Комната свиданий' });
  // --- Лазарет
  building('infirm', 20, 20, 32, 32, { floor: '#c7d2d8', wallColor: '#bdb0a4', doors: { n: [[26, 2.4]] }, windows: ['n', 's', 'e'], name: 'Лазарет' });
  room('infirm', 20, 20, 32, 32, { name: 'Лазарет' });
  // --- Блок A (камеры вдоль западной стены)
  building('cbw', -32, -20, -16, 18, { floor: '#7d8084', wallColor: '#b4a597', doors: { e: [[-12, 2.8], [8, 2.8]] }, windows: ['s'], name: 'Блок A' });
  room('cbw', -32, -20, -16, 18, { name: 'Блок A' });
  // --- Блок B (камеры вдоль северной стены)
  building('cbn', -32, -32, -4, -20, { floor: '#7d8084', wallColor: '#b4a597', doors: { s: [[-15, 2.4]] }, windows: ['w'], name: 'Блок B' });
  room('cbn', -32, -32, -4, -20, { name: 'Блок B' });
  // --- Столовая
  building('cafe', -14, -20, 6, -4, { floor: '#a6aaa0', wallColor: '#bcab9d', doors: { w: [[-11, 2.6]], e: [[-11, 2.6]], s: [[-7, 2.4]], n: [[4.5, 2.0]] }, windows: ['s'], name: 'Столовая' });
  room('cafe', -14, -20, 6, -4, { name: 'Столовая' });
  // --- Кухня
  building('kitchen', -4, -32, 10, -20, { floor: '#b4b9b0', wallColor: '#b7a89a', doors: { s: [[4.5, 2.0], [8, 1.8]] }, windows: ['n'], name: 'Кухня' });
  room('kitchen', -4, -32, 10, -20, { name: 'Кухня', restricted: false });
  // --- Лавка
  building('commissary', 10, -32, 20, -20, { floor: '#9a9a8c', wallColor: '#b6a698', doors: { s: [[15, 3.2]] }, windows: ['n'], name: 'Лавка' });
  room('commissary', 10, -32, 20, -20, { name: 'Лавка' });
  // --- Карцер («Дыра»)
  building('seg', 20, -32, 32, -20, { floor: '#6e7176', wallColor: '#a89a8e', doors: { s: [[26, 2.2]] }, windows: ['n', 'e'], name: 'Карцер' });
  room('seg', 20, -32, 32, -20, { name: 'Карцер', restricted: true });
  // --- Прачечная
  building('laundry', -14, -2, -2, 18, { floor: '#a9b2b6', wallColor: '#baaa9c', doors: { w: [[7, 2.4]], n: [[-8, 2.2]], e: [[13, 2.0]] }, windows: ['s'], name: 'Прачечная' });
  room('laundry', -14, -2, -2, 18, { name: 'Прачечная' });
  // --- Библиотека
  building('library', -2, -2, 6, 18, { floor: '#a1957f', wallColor: '#baa99b', doors: { e: [[9, 2.4]], w: [[13, 2.0]] }, windows: ['s'], name: 'Библиотека' });
  room('library', -2, -2, 6, 18, { name: 'Библиотека' });
  room('yard', 6, -20, 32, 18, { name: 'Двор' });
  room('strip', -36, -36, 36, 36, { name: 'Периметр', restricted: true, ring: true });

  // ================================================================ КАМЕРЫ
  const cells = [];
  const barsPlane = (b, axis, fixed, a, c, y0, y1) => {
    // Решётка-плоскость в билдер bars: UV по ширине в тайлах (2.4 м на тайл).
    const tile = 2.4;
    if (axis === 'z') {
      emit(b, [fixed, y0, c], [fixed, y0, a], [fixed, y1, a], [fixed, y1, c], [1, 0, 0], [c / tile, 0, a / tile, 0, a / tile, 1, c / tile, 1], '#ffffff');
    } else {
      emit(b, [a, y0, fixed], [c, y0, fixed], [c, y1, fixed], [a, y1, fixed], [0, 0, 1], [a / tile, 0, c / tile, 0, c / tile, 1, a / tile, 1], '#ffffff');
    }
  };
  const makeCell = (index, id, blockKey, rect, front, bedSide) => {
    // rect: интерьер камеры (локально); front: линия решётки { axis, fixed, a, b, dir } — dir: куда выходишь из камеры.
    const cell = { id, index, block: blockKey, rect, front };
    const [x0, z0, x1, z1] = rect;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const alongAxis = front.axis === 'z' ? 'z' : 'x';
    const dir = front.dir;                          // единичный вектор наружу (по x для 'z'-решётки, по z для 'x'-решётки)
    cell.bedSide = bedSide;
    // Койка стоит у боковой стены (depth 2.375 от решётки, смещение 0.56 в сторону bedSide) — как в prison-detail-cells.js.
    const depthC = 3.5 - 0.15 - 1.95 / 2;
    const bedPos = alongAxis === 'z' ? [front.fixed - dir * depthC, mz + bedSide * 0.56] : [mx + bedSide * 0.56, front.fixed - dir * depthC];
    cell.bed = { x: bedPos[0], z: bedPos[1] };
    // Постер на задней стене (туннель за ним).
    const pBack = alongAxis === 'z' ? [front.fixed - dir * 3.45, mz - bedSide * 0.2] : [mx - bedSide * 0.2, front.fixed - dir * 3.45];
    cell.poster = { x: pBack[0], z: pBack[1] };
    cell.locker = { x: alongAxis === 'z' ? front.fixed - dir * 2.9 : mx + bedSide * 0.95, z: alongAxis === 'z' ? mz + bedSide * 0.95 : front.fixed - dir * 2.9 };
    // Точки: внутри камеры (в центре) и снаружи у двери.
    cell.inside = alongAxis === 'z' ? { x: front.fixed - dir * 1.4, z: mz } : { x: mx, z: front.fixed - dir * 1.4 };
    cell.outside = alongAxis === 'z' ? { x: front.fixed + dir * 1.3, z: mz } : { x: mx, z: front.fixed + dir * 1.3 };
    cell.door = alongAxis === 'z' ? { x: front.fixed, z: mz, axis: 'z' } : { x: mx, z: front.fixed, axis: 'x' };
    cell.posterKind = index % 4;
    return cell;
  };
  const cellFront = (cell, frontH = 3.1) => {
    const f = cell.front;
    const doorW = 0.95;
    const mid = f.axis === 'z' ? (cell.rect[1] + cell.rect[3]) / 2 : (cell.rect[0] + cell.rect[2]) / 2;
    // Решётка слева и справа от двери + глухой фриз над ней.
    barsPlane(B.bars, f.axis, f.fixed, f.a, mid - doorW / 2, 0.03, frontH);
    barsPlane(B.bars, f.axis, f.fixed, mid + doorW / 2, f.b, 0.03, frontH);
    barsPlane(B.bars, f.axis, f.fixed, mid - doorW / 2, mid + doorW / 2, frontH - 0.45, frontH);
    if (f.axis === 'z') {
      fx(B.plaster, f.fixed, f.a, f.b, frontH, BUILD_H, 1, '#c9c7b8', 4);
      fx(B.plaster, f.fixed, f.a, f.b, frontH, BUILD_H, -1, '#c9c7b8', 4);
      seeSolid(f.fixed - 0.08, f.a, f.fixed + 0.08, mid - doorW / 2, BUILD_H);
      seeSolid(f.fixed - 0.08, mid + doorW / 2, f.fixed + 0.08, f.b, BUILD_H);
      const col = seeSolid(f.fixed - 0.08, mid - doorW / 2, f.fixed + 0.08, mid + doorW / 2, BUILD_H);
      cell.collider = col;
      col.dyn = true;
    } else {
      fz(B.plaster, f.fixed, f.a, f.b, frontH, BUILD_H, 1, '#c9c7b8', 4);
      fz(B.plaster, f.fixed, f.a, f.b, frontH, BUILD_H, -1, '#c9c7b8', 4);
      seeSolid(f.a, f.fixed - 0.08, mid - doorW / 2, f.fixed + 0.08, BUILD_H);
      seeSolid(mid + doorW / 2, f.fixed - 0.08, f.b, f.fixed + 0.08, BUILD_H);
      const col = seeSolid(mid - doorW / 2, f.fixed - 0.08, mid + doorW / 2, f.fixed + 0.08, BUILD_H);
      cell.collider = col;
      col.dyn = true;
    }
    cell.doorMid = mid;
    cell.doorW = doorW;
  };

  // Блок A: 15 камер вдоль западной стены (x = -31.5 .. -28), решётка на x = -28, выход на восток.
  const cellsA = [], cellsB = [];
  {
    const zStart = -19.0, step = 2.4, N = 15;
    for (let i = 0; i < N; i++) {
      const z0 = zStart + i * step, z1 = z0 + step;
      const cell = makeCell(i, `A${i + 1}`, 'A', [-31.5, z0, -28, z1], { axis: 'z', fixed: -28, a: z0, b: z1, dir: 1 }, i % 2 ? 1 : -1);
      cellFront(cell);
      // Перегородка (вдоль x) на z0 — общая со следующей камерой.
      const t = 0.2;
      wallBox(-31.5, z0 - t / 2, -28, z0 + t / 2, 0, BUILD_H, {});
      solid(-31.5, z0 - t / 2, -28, z0 + t / 2, BUILD_H);
      cellsA.push(cell);
    }
    const zl = zStart + N * step;
    wallBox(-31.5, zl - 0.1, -28, zl + 0.1, 0, BUILD_H, {});
    solid(-31.5, zl - 0.1, -28, zl + 0.1, BUILD_H);
  }
  // Блок B: 11 камер вдоль северной стены (z = -31.5 .. -28), решётка на z = -28, выход на юг.
  {
    const xStart = -31.0, step = 2.4, N = 11;
    for (let i = 0; i < N; i++) {
      const x0 = xStart + i * step, x1 = x0 + step;
      const cell = makeCell(i, `B${i + 1}`, 'B', [x0, -31.5, x1, -28], { axis: 'x', fixed: -28, a: x0, b: x1, dir: 1 }, i % 2 ? 1 : -1);
      cellFront(cell);
      const t = 0.2;
      wallBox(x0 - t / 2, -31.5, x0 + t / 2, -28, 0, BUILD_H, {});
      solid(x0 - t / 2, -31.5, x0 + t / 2, -28, BUILD_H);
      cellsB.push(cell);
    }
    const xl = xStart + N * step;
    wallBox(xl - 0.1, -31.5, xl + 0.1, -28, 0, BUILD_H, {});
    solid(xl - 0.1, -31.5, xl + 0.1, -28, BUILD_H);
  }
  cells.push(...cellsA, ...cellsB);

  // Общие комнаты блоков: стальные столы (коллайдеры; сами столы, телевизоры и телефоны рисует prison-detail-cells.js).
  for (const [x, z] of [[-24, -14], [-20, -14], [-24, -4], [-20, -4], [-24, 6], [-20, 6], [-26, -24.5], [-21, -24.5], [-16, -24.5], [-11, -24.5]]) {
    solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0.8, { type: 'barrier' });
  }

  // ================================================================ СТОЛОВАЯ (вид — prison-detail-rooms.js)
  for (let r = 0; r < 4; r++) {
    for (const x of [-9.5, -1.5]) {
      const z = -15.6 + r * 3.3;
      solid(x - 2.6, z - 0.45, x + 2.6, z + 0.45, 0.8, { type: 'barrier' });
    }
  }
  solid(-9, -18.9, 2, -17.9, 1.1, { type: 'barrier' });
  sign('СТОЛОВАЯ', -3.5, 3.4, -19.7, 0, 1, 4, 0.9, { bg: '#2f3a48' });

  // ================================================================ КУХНЯ
  for (const x of [-2, 1, 4]) solid(x - 1.1, -29.5, x + 1.1, -28.5, 1, { type: 'barrier' });
  for (const [x, z] of [[1.5, -24], [5, -24]]) solid(x - 1.2, z - 0.6, x + 1.2, z + 0.6, 0.95, { type: 'barrier' });

  // ================================================================ ЛАВКА («Commissary»)
  // Окно 3.2 м в южной стене: прилавок снаружи блокирует вход, торговец внутри.
  solid(13.2, -19.9, 16.8, -18.9, 1.2, { type: 'barrier' });
  sign('ЛАВКА', 15, 3.5, -19.7, 0, 1, 3.4, 0.9, { bg: '#2f4a2f', frame: '#ffd45a', sub: 'COMMISSARY' });
  // Стекло над прилавком.
  fz(B.clear, -19.9, 13, 17, 1.2, 3.0, 1, '#bfe6ff', 1);

  // ================================================================ КАРЦЕР
  const hole = { cells: [] };
  {
    // Четыре одиночки вдоль северной стены (z -31.5 .. -28.5), решётчатая дверь на юг, коридор z -28.5 .. -20.5.
    const step = 2.7;
    for (let i = 0; i < 4; i++) {
      const x0 = 20.8 + i * step, x1 = x0 + step;
      const t = 0.25;
      wallBox(x0 - t / 2, -31.5, x0 + t / 2, -28.5, 0, BUILD_H, {});
      solid(x0 - t / 2, -31.5, x0 + t / 2, -28.5, BUILD_H);
      // Стальная дверь (сплошная, с окошком): поворотная створка на шарнире, открывает prison.js.
      const mid = (x0 + x1) / 2;
      const dw = x1 - x0 - 0.2;
      const leaf = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(dw, 2.5, 0.16), new THREE.MeshStandardMaterial({ color: 0x5d6168, roughness: 0.45, metalness: 0.7 }));
      slab.position.set(dw / 2, 1.25 + H0, 0);
      slab.castShadow = true;
      leaf.add(slab, new THREE.Mesh(holeDoorGeometry(THREE, mergeColored, dw, H0), M.metal));
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.22), new THREE.MeshBasicMaterial({ color: 0x050607 }));
      slot.position.set(dw / 2, 1.7 + H0, 0.085);
      const slot2 = slot.clone();
      slot2.position.z = -0.085;
      slot2.rotation.y = Math.PI;
      leaf.add(slot, slot2);
      const [hx, hz] = toWorld(x0 + 0.1, -28.5);
      leaf.position.set(hx, 0, hz);
      const [ax, az] = dirW(1, 0);
      leaf.userData.closedAngle = Math.atan2(-az, ax);
      leaf.rotation.y = leaf.userData.closedAngle;
      group.add(leaf);
      const colb = solid(x0 + 0.1, -28.7, x1 - 0.1, -28.3, BUILD_H);
      colb.dyn = true;
      hole.cells.push({ id: `H${i + 1}`, rect: [x0, -31.5, x1, -28.5], collider: colb, doorMesh: leaf, inside: P(mid, -30.0), outside: P(mid, -27.3), mid, locked: false, open: 0, outwardW: dirW(0, 1) });
    }
    wallBox(31.4, -31.5, 31.6, -28.5, 0, BUILD_H, {});
    solid(31.4, -31.5, 31.6, -28.5, BUILD_H);
    sign('КАРЦЕР', 26, 3.5, -19.7, 0, 1, 3, 0.8, { bg: '#4a1a1a', frame: '#ff6a6a' });
  }

  // ================================================================ ПРАЧЕЧНАЯ (вид — prison-detail-rooms.js)
  for (let k = 0; k < 4; k++) solid(-13.45 + k * 2.0, -1.55, -11.95 + k * 2.0, -0.25, 1.4, { type: 'barrier' });
  solid(-9.2, 7.5, -6.8, 8.5, 0.95, { type: 'barrier' });
  solid(-9.2, 10.5, -6.8, 11.5, 0.95, { type: 'barrier' });
  for (const [x, z] of [[-4.5, 4], [-4.5, 15]]) solid(x - 0.6, z - 0.4, x + 0.6, z + 0.4, 1.0, { type: 'barrier' });
  solid(-13.3, 16.3, -12.3, 16.9, 1.0, { type: 'barrier' });
  solid(-13.5, 2.7, -12.4, 7.9, 2.0, { type: 'barrier' });                  // сушильные машины
  sign('ПРАЧЕЧНАЯ', -8, 3.4, 17.7, 0, -1, 3.6, 0.8, { bg: '#2c4a5e' });

  // ================================================================ БИБЛИОТЕКА (вид — prison-detail-rooms.js)
  for (let k = 0; k < 4; k++) solid(5.0, 0 + k * 4.0, 5.45, 3.4 + k * 4.0, 2.4, { type: 'barrier' });
  for (let k = 0; k < 2; k++) solid(-1.5, 3.4 + k * 6, -1.05, 6.6 + k * 6, 2.4, { type: 'barrier' });
  solid(0.2, 7.5, 2.6, 8.5, 0.8, { type: 'barrier' });
  for (const z of [2.6, 12.5, 15.8]) solid(0.8, z - 0.4, 2.4, z + 0.4, 0.8, { type: 'barrier' });
  sign('БИБЛИОТЕКА', 2, 3.4, 17.7, 0, -1, 3.6, 0.8, { bg: '#3a2f22', frame: '#d9b13b' });

  // ================================================================ АДМИНИСТРАЦИЯ
  // Приём, кабинет начальника, оружейная: вид — prison-detail-areas.js, здесь только коллайдеры.
  solid(-30.3, 24, -23.7, 25, 1.2, { type: 'barrier' });
  solid(-19.7, 29, -17.3, 30.1, 0.9, { type: 'barrier' });
  for (let k = 0; k < 3; k++) solid(-9.45, 21.7 + k * 3.0, -8.95, 23.3 + k * 3.0, 2.2, { type: 'barrier' });
  sign('ПРИЁМ', -27, 3.3, 20.2, 0, -1, 2.6, 0.7, { bg: '#2a3a52' });

  // ================================================================ ШЛЮЗ (ворота)
  const gates = [];
  const gateLeaf = (lz, label) => {
    // Раздвижные створки из решётки: две половины по 2.5 м; открываются в стороны (в «карманы» будок).
    const g = new THREE.Group();
    const planeL = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.6), M.bars);
    const planeR = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.6), M.bars);
    planeL.position.set(-1.25, 1.8 + H0, 0);
    planeR.position.set(1.25, 1.8 + H0, 0);
    g.add(planeL, planeR);
    const [wx, wz] = toWorld(0, lz);
    g.position.set(wx, 0, wz);
    g.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][K];
    group.add(g);
    const col = seeSolid(-2.5, lz - 0.15, 2.5, lz + 0.15, 4);
    col.dyn = true;
    const gt = { id: label, group: g, planeL, planeR, collider: col, open: 0, target: 0, lz, removed: false };
    gates.push(gt);
    return gt;
  };
  const outerGate = gateLeaf(36.75, 'outer');
  const innerGate = gateLeaf(27.0, 'inner');
  sign('ТЮРЬМА ШТАТА «РЕДРОК»', 0, 5.4, 37.55, 0, 1, 7.6, 1.2, { bg: '#1b1d22', frame: '#d9b13b', sub: 'STATE PENITENTIARY · REDROCK', w: 1216, h: 192 });
  sign('СТОП: ПОСТОРОННИМ ВХОД ЗАПРЕЩЁН', 0, 3.9, 37.6, 0, 1, 4.8, 0.7, { bg: '#7a1414', frame: '#fff' });

  // ================================================================ ЛАЗАРЕТ и СВИДАНИЯ (вид — prison-detail-areas.js)
  for (let k = 0; k < 3; k++) solid(22 + k * 3.0, 28.5, 23 + k * 3.0, 30.5, 0.7, { type: 'barrier' });
  sign('ЛАЗАРЕТ', 26, 3.3, 20.2, 0, -1, 2.6, 0.7, { bg: '#2f5a4a' });
  // Свидания: стеклянная перегородка с трубками и стулья.
  fx(B.clear, 14.5, 21, 31, 0.9, 3.0, 1, '#bfe6ff', 1);
  fx(B.clear, 14.5, 21, 31, 0.9, 3.0, -1, '#bfe6ff', 1);
  seeSolid(14.3, 21, 14.7, 31.5, 3.0, { type: 'barrier' });
  sign('СВИДАНИЯ', 14, 3.3, 20.2, 0, -1, 2.8, 0.7, { bg: '#2a3a52' });

  // ================================================================ ДВОР
  const yardFeatures = { hoops: [], weights: [], tables: [], bleachers: [] };
  {
    // Баскетбольная площадка 16 x 14 с текстурой разметки.
    const [a0, a1] = toWorld(12, -18), [b0, b1] = toWorld(28, -4);
    const court = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), new THREE.MeshStandardMaterial({ map: tex.court, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    court.rotation.x = -Math.PI / 2;
    court.rotation.z = [0, -Math.PI / 2, Math.PI, Math.PI / 2][K];
    court.position.set((a0 + b0) / 2, H0 + 0.045, (a1 + b1) / 2);
    court.receiveShadow = true;
    group.add(court);
    // Кольца, железо, столы и трибуна рисует prison-detail-outdoors.js; здесь — коллайдеры и точки для заключённых.
    for (const sx of [0, 1]) {
      const hx = sx ? 27.4 : 12.6, nx = sx ? -1 : 1;
      solid(hx - nx * 0.3 - 0.15, -11.15, hx - nx * 0.3 + 0.15, -10.85, 3.6, { type: 'barrier' });
      yardFeatures.hoops.push(P(hx + nx * 0.8, -11));
    }
    for (let k = 0; k < 3; k++) {
      const x = 13 + k * 4.2, z = 9;
      solid(x - 0.45, z - 0.85, x + 0.45, z + 0.85, 1.1, { type: 'barrier' });
      yardFeatures.weights.push(P(x - 1.1, z));
    }
    for (const [x, z] of [[9.5, -8], [9.5, -4], [9.5, 12], [9.5, 15]]) {
      solid(x - 0.9, z - 0.4, x + 0.9, z + 0.4, 0.8, { type: 'barrier' });
      yardFeatures.tables.push(P(x - 1.3, z));
    }
    yardFeatures.bleachers.push(P(8, 8));
  }

  // ================================================================ СЕТКА ДВОРА (восточный периметр, escape-линия)
  // Десять секций по 4 м: каждую можно перекусить кусачками (prison.js убирает меш и коллайдер секции).
  const FENCE_X = 32;
  const fenceSegs = [];
  {
    const segLen = 4;
    for (let i = 0; i < 10; i++) {
      const z0 = -20 + i * segLen, z1 = z0 + segLen, mid = (z0 + z1) / 2;
      const geo = new THREE.PlaneGeometry(segLen, 3.6);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) { uv.setX(k, uv.getX(k) * (segLen / 3)); uv.setY(k, uv.getY(k) * 1.2); }
      const m = new THREE.Mesh(geo, M.chain);
      const [wx, wz] = toWorld(FENCE_X, mid);
      m.position.set(wx, 1.8 + H0, wz);
      m.rotation.y = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][K];
      group.add(m);
      const colSeg = seeSolid(FENCE_X - 0.1, z0, FENCE_X + 0.1, z1, 3.6, { type: 'barrier' });
      colSeg.dyn = true;
      fenceSegs.push({ index: i, mesh: m, collider: colSeg, cut: false, z0, z1, mid, point: P(FENCE_X - 0.9, mid), through: P(FENCE_X + 1.4, mid) });
    }
    razor(FENCE_X, -20, FENCE_X, 20, 4.2, 0.9);
  }

  // ================================================================ НАПОЛНЕНИЕ СЛОЁВ
  const addBuilt = (builder, mat, name, { cast = true, receive = true } = {}) => {
    if (builder.isEmpty) return null;
    const m = new THREE.Mesh(builder.build(), mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.name = name;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    group.add(m);
    return m;
  };
  addBuilt(B.brick, M.brick, 'prison-brick');
  addBuilt(B.plaster, M.plaster, 'prison-plaster', { cast: false });
  addBuilt(B.tile, M.tile, 'prison-tile', { cast: false });
  addBuilt(B.conc, M.conc, 'prison-concrete');
  addBuilt(B.gravel, M.gravel, 'prison-gravel', { cast: false });
  addBuilt(B.bars, M.bars, 'prison-bars', { cast: false });
  addBuilt(B.glass, M.glass, 'prison-glass', { cast: false });
  addBuilt(B.clear, M.glassClear, 'prison-clear', { cast: false, receive: false });
  const glowMesh = (builder, mat, name) => {
    if (builder.isEmpty) return;
    const m = new THREE.Mesh(builder.build(), mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    group.add(m);
  };
  glowMesh(B.ceil, glowMat(0xd2d0c4, 0.7, 0.95), 'prison-ceilings');
  glowMesh(B.glow, glowMat(0xfff3d0, 0.75, 1.3), 'prison-lights');
  glowMesh(B.winGlow, glowMat(0xffd37a, 0.08, 1.0), 'prison-windows');
  if (parts.length) {
    const m = new THREE.Mesh(mergeColored(parts), M.metal);
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'prison-furniture';
    group.add(m);
  }

  // Постеры на задней стене камер: за каждым — место подкопа (дыра показывается, когда подкоп готов).
  const posterTexCache = [0, 1, 2, 3].map((k) => posterTexture(k));
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x050403 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  for (const cell of cells) {
    const f = cell.front;
    const n = f.axis === 'z' ? [f.dir, 0] : [0, f.dir];         // нормаль в глубь камеры (локально)
    const [wx, wz] = toWorld(cell.poster.x, cell.poster.z);
    const [dx, dz] = dirW(n[0], n[1]);
    const rotY = Math.atan2(dx, dz);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.0), new THREE.MeshStandardMaterial({ map: posterTexCache[cell.posterKind], roughness: 0.9 }));
    poster.position.set(wx + dx * 0.025, 1.45 + H0, wz + dz * 0.025);
    poster.rotation.y = rotY;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18), holeMat);
    hole.position.set(wx + dx * 0.012, 0.62 + H0, wz + dz * 0.012);
    hole.rotation.y = rotY;
    hole.visible = false;
    const dirt = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.28, 9), dirtMat);
    dirt.position.set(wx + dx * 0.55, 0.14 + H0, wz + dz * 0.55);
    dirt.visible = false;
    group.add(poster, hole, dirt);
    cell.posterMesh = poster;
    cell.holeMesh = hole;
    cell.dirtMesh = dirt;
    // Мировые версии точек камеры (в cell.* лежат локальные).
    cell.w = {
      bed: P(cell.bed.x, cell.bed.z), poster: P(cell.poster.x, cell.poster.z), locker: P(cell.locker.x, cell.locker.z),
      inside: P(cell.inside.x, cell.inside.z), outside: P(cell.outside.x, cell.outside.z), door: P(cell.door.x, cell.door.z),
      normalW: [dx, dz],
    };
  }

  // Динамические двери камер: плоскость-решётка на шарнире.
  const doorGeo = new THREE.PlaneGeometry(0.95, 2.6);
  const doorHw = doorHardwareGeometry(THREE, mergeColored, H0);
  for (const cell of cells) {
    const d = new THREE.Group();
    const m = new THREE.Mesh(doorGeo, M.bars);
    m.position.set(0.475, 1.3 + H0, 0);
    d.add(m, new THREE.Mesh(doorHw, M.metal));
    const f = cell.front;
    const hinge = f.axis === 'z' ? toWorld(f.fixed, cell.doorMid - cell.doorW / 2) : toWorld(cell.doorMid - cell.doorW / 2, f.fixed);
    d.position.set(hinge[0], 0, hinge[1]);
    // Направление «вдоль решётки» локально: для оси 'z' это +z, для 'x' — +x; переводим в мировой угол.
    const alongL = f.axis === 'z' ? [0, 1] : [1, 0];
    const [ax, az] = dirW(alongL[0], alongL[1]);
    d.userData.closedAngle = Math.atan2(-az, ax);   // plane X axis -> along
    d.rotation.y = d.userData.closedAngle;
    group.add(d);
    cell.doorMesh = d;
    cell.open = 0;
    cell.locked = false;
    cell.dir = f.dir;
  }

  // Прожекторы вышек: светящиеся конусы, вращаются (обновляет prison.js).
  const beams = [];
  for (const t of towers) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(7, 28, 18, 1, true).translate(0, -14, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    const [wx, wz] = toWorld(t.x, t.z);
    cone.position.set(wx, 11.75, wz);
    cone.visible = false;
    group.add(cone);
    beams.push({ mesh: cone, tower: t, angle: Math.random() * 6.28, speed: 0.45 + Math.random() * 0.15, x: wx, z: wz });
  }

  // ================================================================ ДЕТАЛИ (склеенные меши, таблички, разметка)
  const dctx = { kit, lib, fur, cells, FLOOR, BUILD_H, WALL_H, H0, plates, paint, solid, seeSolid, rng: detailRng, fx, fz, up, down, B, M, group, buildings, towers, toWorld, dirW, P, K, world, glowMat, yardFeatures, hole, razor };
  detailCells(dctx);
  detailBlocks(dctx);
  detailCafe(dctx);
  detailKitchen(dctx);
  detailCommissary(dctx);
  detailLaundry(dctx);
  detailLibrary(dctx);
  detailAdmin(dctx);
  detailGate(dctx);
  detailVisit(dctx);
  detailInfirmary(dctx);
  detailHole(dctx);
  detailYard(dctx);
  detailFence(dctx);
  detailPerimeter(dctx);
  detailTowers(dctx);
  detailNightLights(dctx);
  const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  addBuilt(B.paint, paintMat, 'prison-paint', { cast: false });
  // Таблички-атлас: один меш на все вывески
  {
    const atlas = plates.build();
    const pb = new GeometryBuilder();
    plates.items.forEach((it, i) => {
      const r = atlas.rects[i];
      const [wx, wz] = toWorld(it.x, it.z);
      const [dx, dz] = dirW(it.nx, it.nz);
      const rx = dz, rz = -dx;
      const hw = it.w / 2, hh = it.h / 2;
      const c = new THREE.Color(0xffffff);
      const pt = (sx, sy) => [wx + rx * hw * sx, it.y + hh * sy, wz + rz * hw * sx];
      pb.quad(pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1), [dx, 0, dz], [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1], c);
    });
    if (!pb.isEmpty) {
      const pm = new THREE.MeshBasicMaterial({ map: atlas.texture });
      world.glow.push({ mat: pm, base: new THREE.Color(0xffffff), day: 0.85, night: 1.2 });
      const mesh = new THREE.Mesh(pb.build(), pm);
      mesh.name = 'prison-plates';
      group.add(mesh);
    }
  }
  const detailStats = kit.stats();
  const chunkList = kit.build(group, { cast: new Set() });
  for (const ch of chunkList) ch.visible = true;

  // ================================================================ LAYOUT для prison.js
  const worldRect = (r) => {
    const a = toWorld(r.x0, r.z0), b = toWorld(r.x1, r.z1);
    return { ...r, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]) };
  };
  const rooms = Object.fromEntries(Object.entries(ROOMS).map(([k, r]) => [k, worldRect(r)]));
  const zoneAt = (wx, wz) => {
    let best = null;
    for (const r of Object.values(rooms)) {
      if (r.ring) continue;
      if (wx >= r.minX && wx <= r.maxX && wz >= r.minZ && wz <= r.maxZ) best = r;
    }
    if (best) return best;
    const [lx, lz] = toLocal(wx, wz);
    if (Math.abs(lx) < 36 && Math.abs(lz) < 36) return Math.abs(lx) > 32 || Math.abs(lz) > 32 ? rooms.strip : { id: 'alley', name: 'Аллея' };
    return null;
  };
  const inCompound = (wx, wz) => { const [lx, lz] = toLocal(wx, wz); return Math.abs(lx) < 37.5 && Math.abs(lz) < 37.5; };

  // Станции (мировые точки): куда подходить.
  const stations = {
    intake: P(-27, 22.6),
    release: P(0, 24.5),
    outside: P(0, 41.2),
    gatePanelOuter: P(0, 34.4),
    gatePanelInner: P(0, 25.6),
    commissary: P(15, -17.4),
    tray: P(-3.5, -16.4),
    phones: [P(-17.2, 12), P(-17.2, 14), P(-5.2, -22)],
    tvs: [P(-17.6, -3), P(-7, -24)],
    hoops: yardFeatures.hoops,
    weights: yardFeatures.weights,
    cards: yardFeatures.tables,
    laundry: P(-8, 9.5),
    uniform: P(-12.2, 16.2),
    library: P(1.4, 9.4),
    infirmary: P(24.5, 26),
    visit: P(11.5, 26),
    fence: P(31.2, 0),
    fenceSpots: [P(31.2, -10), P(31.2, 2), P(31.2, 10)],
    wall: P(34.5, 0),
    warden: P(-18.5, 26),
    armory: P(-11, 26),
  };

  // Места, где заключённые проводят время (мировые точки + куда смотреть).
  const spot = (lx, lz, fxl = null, fzl = null) => {
    const p = P(lx, lz);
    if (fxl !== null) p.heading = headingW(Math.atan2(fxl - lx, fzl - lz));
    return p;
  };
  const around = (cx0, cz0, r, n = 4, off = 0) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + off;
    return spot(cx0 + Math.sin(a) * r, cz0 + Math.cos(a) * r, cx0, cz0);
  });
  const spots = {
    tv: [[-18, -5.4], [-18, -3], [-18, -0.6]].map(([x, z]) => spot(x, z, -16.5, -3)).concat([[-8.3, -25.6], [-8.3, -24], [-8.3, -22.4]].map(([x, z]) => spot(x, z, -6, -24))),
    tables: [[-24, -14], [-20, -14], [-24, -4], [-20, -4], [-24, 6], [-20, 6], [-26, -24.5], [-21, -24.5], [-16, -24.5], [-11, -24.5]].flatMap(([x, z]) => around(x, z, 0.9)),
    cafe: [],
    tray: Array.from({ length: 7 }, (_, k) => spot(-8.5 + k * 1.6, -17.2, -8.5 + k * 1.6, -18.4)),
    laundry: [-12.7, -10.7, -8.7, -6.7].map((x) => spot(x, 1.0, x, -0.9)).concat([spot(-5.9, 8, -8, 8), spot(-10.1, 8, -8, 8), spot(-5.9, 11, -8, 11), spot(-10.1, 11, -8, 11)]),
    kitchen: [-2, 1, 4].map((x) => spot(x, -27.6, x, -29)).concat([spot(1.5, -22.7, 1.5, -24), spot(5, -22.7, 5, -24), spot(8, -27.7, 8, -29.5)]),
    library: [[3.7, 2.2], [3.7, 6.4], [3.7, 10.4], [3.7, 14.4]].map(([x, z]) => spot(x, z, 5.4, z)).concat([spot(1.4, 6.6, 1.4, 8), spot(1.4, 9.6, 1.4, 8)]),
    hoops: yardFeatures.hoops,
    weights: yardFeatures.weights,
    cards: yardFeatures.tables,
    cardSeats: [[9.5, -8], [9.5, -4], [9.5, 12], [9.5, 15]].map(([x, z]) => [[x - 0.45, z - 0.95], [x + 0.45, z - 0.95], [x - 0.45, z + 0.95], [x + 0.45, z + 0.95]].map(([sx, sz]) => spot(sx, sz, x, z))),
    bleachers: [spot(7.6, 5, 9, 5), spot(7.6, 8, 9, 8), spot(7.6, 11, 9, 11)],
    fenceWalk: Array.from({ length: 8 }, (_, k) => spot(30.4, -17 + k * 4.6)),
  };
  for (let r = 0; r < 4; r++) {
    for (const x of [-9.5, -1.5]) {
      const z = -15.6 + r * 3.3;
      for (let k = -1.5; k <= 1.5; k += 1) {
        if (r < 3) spots.cafe.push(spot(x + k * 1.25, z + 1.15, x + k * 1.25, z));
        spots.cafe.push(spot(x + k * 1.25, z - 1.15, x + k * 1.25, z));
      }
    }
  }
  // Посты персонала.
  const posts = {
    gateL: spot(-5.4, 23.8, -5.4, 22.5), gateR: spot(5.4, 23.8, 5.4, 22.5),
    outerGate: spot(-4.3, 33.5, 0, 33), innerGate: spot(4.3, 29.5, 0, 29),
    intake: spot(-27, 26.2, -27, 24.5), warden: spot(-18.5, 28, -18.5, 29.5), armory: spot(-11.5, 25.5, -9.2, 25.5),
    clerk: spot(15, -21.6, 15, -19.4), kitchenCook: spot(8, -26.9, 8, -29.5), medic: spot(24.5, 24.5, 24.5, 29.5),
    towers: towers.map((t) => P(t.x, t.z)),
  };
  // Патрульные точки охраны (локальные -> мировые).
  const patrols = {
    blockA: [P(-26.8, -17), P(-26.8, -6), P(-26.8, 5), P(-26.8, 15)],
    blockB: [P(-30, -26.3), P(-24, -26.3), P(-14, -26.3), P(-7.5, -26.3)],
    yard: [P(10, -16), P(30, -16), P(30, 15), P(12.5, 14.5), P(18, 0)],
    cafe: [P(-13, -8), P(-5.5, -6), P(-5.5, -12), P(-5.5, -17.4)],
    alley: [P(-29, 19), P(-18, 19), P(-8, 19), P(2, 19), P(12, 19)],
    east: [P(-15, -16), P(-15, -3), P(-15, 12)],
    kitchen: [P(0, -27), P(8, -23)],
  };

  const placeInfo = (id) => rooms[id];
  const layout = {
    gate, K, center: { x: cx, z: cz }, toWorld, toLocal, P, dirW, headingW, zoneAt, inCompound,
    rooms, buildings, cells, hole, towers, beams, gates: { outer: outerGate, inner: innerGate, list: gates }, stations,
    razorMeshes, signs, colliders, placeInfo, chunks: chunkList, detailStats,
    yard: rooms.yard, perimeterHalf: 36, spots, posts, patrols, fenceSegs, holeCells: hole.cells,
    // Выход из туннеля: от камеры — наружу за стену, на тротуар.
    tunnelExit(cell) {
      const [lx, lz] = [cell.poster.x, cell.poster.z];
      // Камеры блока A у западной стены (выход на запад), блока B — у северной (выход на север).
      const outLocal = cell.block === 'A' ? [-40.8, lz] : [lx, -40.8];
      return P(outLocal[0], outLocal[1]);
    },
    // Точки на стене, где можно перелезть (верёвка): восточная сторона напротив сетки.
    wallClimb: { inside: P(35, 0), outside: P(40.3, 0) },
    bounds: { minX: cx - 38, maxX: cx + 38, minZ: cz - 38, maxZ: cz + 38 },
  };
  // Уличный фонарь не загораживает ворота.
  for (const l of world.lamps ?? []) {
    const [lx, lz] = toLocal(l.x, l.z);
    if (Math.abs(lx) < 4 && lz > 36) world.hideLamp?.(l);
  }
  world.landmarks.prison = { x: cx, z: cz, name: 'Тюрьма «Редрок»' };
  world.prison = layout;
  return layout;
}
