import * as THREE from 'three';
import { GeometryBuilder, mergeColored } from '../js/geometry.js';
import {
  ROOMS, CORRIDORS, EXITS, EXTRA_DOORS, STAIRS, STAIR_Z0, STAIR_Z1, LANDING_Y, FLOOR_H, CEIL_H, DOOR_W, DOOR_H,
  WALL_T, EXT_T, BLD, CORR, GYM, roomFrame, floorY,
} from './layout.js';
import { furnishZone, furnishCorridors } from './furniture.js';
import { buildYard } from './yard.js';

// Сборка здания: стены с проёмами (двери, окна, арки), полы, потолки, светильники,
// лестницы, фасад и крыша. Каждая комната/участок коридора — «зона» со своими мешами и
// материалами (выключатель света затемняет только её), список светильников и мест.
//
// Геометрия склеивается по корзинам «зона × материал», так что на зону 4–8 draw call.

const HALF = WALL_T / 2;

// Цвета стен: низ (панель), полоса, верх, плинтус. Разные кабинеты — разные пастельные тона.
const SCHEMES = {
  corridor: { low: '#7fae9a', rail: '#4f7a68', high: '#f3f1e8', base: '#4a4038', panel: 1.35 },
  corridor1: { low: '#8fa8c8', rail: '#5a7090', high: '#f3f1e8', base: '#4a4038', panel: 1.35 },
  classroom: [
    { low: '#cfe0ea', rail: '#9fb7c6', high: '#f7f6f0', base: '#5a4a3a', panel: 1.2 },
    { low: '#e9dfc0', rail: '#c2b48a', high: '#faf7ee', base: '#5a4a3a', panel: 1.2 },
    { low: '#d3e6cc', rail: '#a3c09a', high: '#f7f8f0', base: '#5a4a3a', panel: 1.2 },
    { low: '#ecd6cb', rail: '#c9a898', high: '#faf6f0', base: '#5a4a3a', panel: 1.2 },
  ],
  lab: { low: '#d6dde8', rail: '#a8b3c4', high: '#f5f7fa', base: '#3a3a3a', panel: 1.5, tile: true },
  wc: { low: '#e9f1f5', rail: '#9cb4c2', high: '#f2f4f2', base: '#6d7a80', panel: 1.8, tile: true },
  cafeteria: { low: '#f1e6d2', rail: '#c4553d', high: '#fbefd8', base: '#6a4a30', panel: 1.5, tile: true },
  nurse: { low: '#e6f2f0', rail: '#9cc6c0', high: '#f8fbfa', base: '#6a7a78', panel: 1.5, tile: true },
  library: { low: '#b8916a', rail: '#7a5636', high: '#f4ead8', base: '#4a3020', panel: 1.1, wood: true },
  principal: { low: '#a98462', rail: '#6d4c33', high: '#f1e7d6', base: '#3a2818', panel: 1.3, wood: true },
  assembly: { low: '#9a6d48', rail: '#5e3f28', high: '#efe3d0', base: '#3a2818', panel: 1.2, wood: true },
  teachers: { low: '#d9cfe6', rail: '#a99bc0', high: '#f8f6fb', base: '#4a4058', panel: 1.2 },
  computer: { low: '#cfd8e2', rail: '#8a9ab0', high: '#f5f7fa', base: '#3a4048', panel: 1.2 },
  lobby: { low: '#9db7c9', rail: '#5d7d93', high: '#f7f7f4', base: '#3d4a55', panel: 1.4 },
  hall: { low: '#e7c98f', rail: '#b9944f', high: '#faf6ec', base: '#5a4630', panel: 1.4 },
  stairs: { low: '#8fae9e', rail: '#5d7d6e', high: '#f1f0e8', base: '#4a4038', panel: 1.4 },
  storage: { low: '#b9b9b0', rail: '#8a8a80', high: '#e6e6e0', base: '#4a4a44', panel: 1.2 },
  gym: { low: '#c9a77a', rail: '#8a6a40', high: '#eef2f4', base: '#5a4a36', panel: 2.0, wood: true },
  gymstore: { low: '#b9b0a0', rail: '#8a8070', high: '#e6e2da', base: '#4a4438', panel: 1.2 },
};

const FLOOR_KIND = {
  corridor: 'lino', lobby: 'lino', hall: 'lino', stairs: 'lino', computer: 'lino', storage: 'lino',
  classroom: 'parquet', library: 'carpet', principal: 'parquet', teachers: 'parquet', assembly: 'parquet',
  wc: 'tileFloor', nurse: 'tileFloor', lab: 'tileFloor', cafeteria: 'tileCafe', gym: 'gymFloor', gymstore: 'lino',
};
const FLOOR_TILE = { lino: 0.9, parquet: 2, carpet: 1.2, tileFloor: 1.2, tileCafe: 1.2, gymFloor: 1.6 };

export function createMaterials(T) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    plaster: std({ map: T.plaster, vertexColors: true, roughness: 0.92 }),
    tileWall: std({ map: T.tileWall, vertexColors: true, roughness: 0.35 }),
    wood: std({ map: T.wood, vertexColors: true, roughness: 0.75 }),
    lino: std({ map: T.lino, roughness: 0.5 }),
    parquet: std({ map: T.parquet, roughness: 0.45 }),
    carpet: std({ map: T.carpet, roughness: 1 }),
    tileFloor: std({ map: T.tileFloor, roughness: 0.3 }),
    tileCafe: std({ map: T.tileCafe, roughness: 0.35 }),
    gymFloor: std({ map: T.gymFloor, roughness: 0.38 }),
    ceiling: std({ map: T.ceiling, roughness: 0.95 }),
    color: std({ vertexColors: true, roughness: 0.72 }),
    metal: std({ vertexColors: true, roughness: 0.35, metalness: 0.55 }),
    posters: std({ map: T.posters.texture, roughness: 0.85 }),
    signs: std({ map: T.signs.texture, roughness: 0.6 }),
    glow: std({ map: T.signs.texture, emissiveMap: T.signs.texture, emissive: '#ffffff', emissiveIntensity: 1.1, roughness: 0.5 }),
    panel: std({ color: '#ffffff', emissive: '#fff6e8', emissiveIntensity: 1.5, roughness: 0.4 }),
    screen: std({ color: '#1a2a44', emissive: '#4f8cff', emissiveIntensity: 0.9, roughness: 0.3 }),
    brick: std({ map: T.brick, vertexColors: true, roughness: 0.9 }),
    grass: std({ map: T.grass, vertexColors: true, roughness: 1 }),
    asphalt: std({ map: T.asphalt, vertexColors: true, roughness: 0.95 }),
    paving: std({ map: T.paving, vertexColors: true, roughness: 0.9 }),
    track: std({ map: T.track, vertexColors: true, roughness: 0.95 }),
    panelBlock: std({ map: T.panelBlock, vertexColors: true, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({
      color: '#bcd8e6', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide,
    }),
  };
}

// ---------------------------------------------------------------- корзины геометрии

// Корзина: GeometryBuilder (текстурные квады) или список частей mergeColored (мебель).
class Buckets {
  constructor() {
    this.map = new Map();
  }

  gb(zoneId, mat) {
    const k = zoneId + '|' + mat;
    let b = this.map.get(k);
    if (!b) this.map.set(k, (b = { zoneId, mat, gb: new GeometryBuilder(), parts: [] }));
    return b.gb;
  }

  parts(zoneId, mat = 'color') {
    const k = zoneId + '|' + mat;
    let b = this.map.get(k);
    if (!b) this.map.set(k, (b = { zoneId, mat, gb: new GeometryBuilder(), parts: [] }));
    return b.parts;
  }
}

const col = (c) => new THREE.Color(c);

// Вертикальный квад: стена вдоль оси axis ('x' — вдоль X на z = c, 'z' — вдоль Z на x = c),
// от s0 до s1, по высоте y0…y1, нормаль в сторону sign. UV в метрах.
export function vquad(gb, axis, c, s0, s1, y0, y1, sign, color, tile = 1) {
  if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
  const uv = [s0 / tile, y0 / tile, s1 / tile, y0 / tile, s1 / tile, y1 / tile, s0 / tile, y1 / tile];
  const uvr = [s1 / tile, y0 / tile, s0 / tile, y0 / tile, s0 / tile, y1 / tile, s1 / tile, y1 / tile];
  if (axis === 'x') {
    if (sign > 0) gb.quad([s0, y0, c], [s1, y0, c], [s1, y1, c], [s0, y1, c], [0, 0, 1], uv, color);
    else gb.quad([s1, y0, c], [s0, y0, c], [s0, y1, c], [s1, y1, c], [0, 0, -1], uvr, color);
  } else if (sign > 0) gb.quad([c, y0, s1], [c, y0, s0], [c, y1, s0], [c, y1, s1], [1, 0, 0], uvr, color);
  else gb.quad([c, y0, s0], [c, y0, s1], [c, y1, s1], [c, y1, s0], [-1, 0, 0], uv, color);
}

// Горизонтальный квад (пол — up = true, потолок — false).
export function hquad(gb, x0, z0, x1, z1, y, up, color, tile = 1, ox = 0, oz = 0) {
  const u0 = (x0 + ox) / tile, u1 = (x1 + ox) / tile, v0 = (z0 + oz) / tile, v1 = (z1 + oz) / tile;
  if (up) gb.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [u0, v1, u1, v1, u1, v0, u0, v0], color);
  else gb.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [u0, v0, u1, v0, u1, v1, u0, v1], color);
}

// Коробка из частей mergeColored.
export function boxPart(parts, cx, y0, cz, sx, sy, sz, color) {
  parts.push({ geometry: new THREE.BoxGeometry(sx, sy, sz).translate(cx, y0 + sy / 2, cz), color });
}

// ---------------------------------------------------------------- проёмы

// Проём: { axis, c, a, b, y0, y1, kind: 'door' | 'window' | 'open' | 'exit', ext }
function collectOpenings() {
  const list = [];
  for (const r of ROOMS) {
    if (r.side !== 'S' && r.side !== 'N') continue;
    const c = r.side === 'S' ? CORR.z0 : CORR.z1;
    const fy = floorY(r.floor);
    for (const x of r.doors ?? []) list.push({ axis: 'x', c, a: x - DOOR_W / 2, b: x + DOOR_W / 2, y0: fy, y1: fy + DOOR_H, kind: 'door', room: r.id, floor: r.floor });
    for (const [a, b] of r.open ?? []) list.push({ axis: 'x', c, a, b, y0: fy, y1: fy + 2.85, kind: 'open', room: r.id });
  }
  for (const d of EXTRA_DOORS) {
    const fy = floorY(d.floor);
    if (d.wallX !== undefined) list.push({ axis: 'z', c: d.wallX, a: d.at - d.w / 2, b: d.at + d.w / 2, y0: fy, y1: fy + DOOR_H + 0.2, kind: 'door', extra: d.id });
    else list.push({ axis: 'x', c: d.wallZ, a: d.at - d.w / 2, b: d.at + d.w / 2, y0: fy, y1: fy + DOOR_H, kind: 'door', extra: d.id });
  }
  for (const e of EXITS) {
    const h = e.id === 'main' ? 2.6 : e.id === 'gym' ? 2.5 : DOOR_H;
    const spec = { a: e.at - e.w / 2, b: e.at + e.w / 2, y0: 0, y1: h, kind: 'exit', ext: true, exit: e.id };
    if (e.wall === 'z0') list.push({ axis: 'x', c: BLD.z0, ...spec });
    else if (e.wall === 'x0') list.push({ axis: 'z', c: BLD.x0, ...spec });
    else if (e.wall === 'gx1') list.push({ axis: 'z', c: GYM.x1, ...spec });
  }
  // Окна наружных стен.
  const windowsAlong = (axis, c, a0, a1, y0, sill, top, step, w, extra = {}) => {
    const n = Math.max(1, Math.floor((a1 - a0) / step));
    const pad = (a1 - a0 - n * step) / 2;
    for (let i = 0; i < n; i++) {
      const m = a0 + pad + step * (i + 0.5);
      list.push({ axis, c, a: m - w / 2, b: m + w / 2, y0: y0 + sill, y1: y0 + top, kind: 'window', ext: true, ...extra });
    }
  };
  for (const r of ROOMS) {
    const fy = floorY(r.floor);
    if (r.type === 'gym' || r.type === 'gymstore') continue;
    const wc = r.type === 'wc';
    const sill = wc ? 1.7 : 0.85, top = wc ? 2.6 : 2.75;
    if (r.type === 'stairs') {
      if (r.floor === 0) list.push({ axis: 'x', c: BLD.z1, a: (r.x0 + r.x1) / 2 - 1.1, b: (r.x0 + r.x1) / 2 + 1.1, y0: 2.4, y1: 5.0, kind: 'window', ext: true });
      continue;
    }
    const lobby = r.type === 'lobby';
    if (r.side === 'S') {
      const skip = lobby ? (m) => Math.abs(m) < 2.5 : null;
      const before = list.length;
      windowsAlong('x', BLD.z0, r.x0, r.x1, fy, sill, top, 2.7, 1.7, { room: r.id });
      if (skip) for (let i = list.length - 1; i >= before; i--) if (skip((list[i].a + list[i].b) / 2)) list.splice(i, 1);
    }
    if (r.side === 'N') windowsAlong('x', BLD.z1, r.x0, r.x1, fy, sill, top, 2.7, 1.7, { room: r.id });
    if (r.x0 === BLD.x0 && r.type !== 'stairs' && r.type !== 'lab') windowsAlong('z', BLD.x0, r.z0, r.z1, fy, sill, top, 2.7, 1.7, { room: r.id, skipExit: true });
  }
  // Торцы коридора 2 этажа: окно на запад и внутреннее окно в спортзал на восток.
  list.push({ axis: 'z', c: BLD.x0, a: -1, b: 1, y0: FLOOR_H + 0.9, y1: FLOOR_H + 2.75, kind: 'window', ext: true });
  list.push({ axis: 'z', c: BLD.x1, a: -1.1, b: 1.1, y0: FLOOR_H + 0.9, y1: FLOOR_H + 2.6, kind: 'window', inner: true });
  // Высокие окна спортзала (север и юг).
  for (const c of [GYM.z0, GYM.z1]) windowsAlong('x', c, GYM.x0 + 1, GYM.x1 - (c > 0 ? 6 : 1), 0, 3.4, 6.3, 3.0, 2.2, { room: 'gym' });
  // Кухонная дверь стоит на западной стене столовой — окно там убираем.
  return list.filter((o) => !(o.kind === 'window' && o.axis === 'z' && o.c === BLD.x0 && o.y0 < FLOOR_H && list.some((e) =>
    e.kind === 'exit' && e.axis === 'z' && e.c === BLD.x0 && e.a < o.b + 0.4 && e.b > o.a - 0.4)));
}

// ---------------------------------------------------------------- зоны

function exteriorSide(axis, c, a0, a1) {
  if (axis === 'x') return (Math.abs(c - BLD.z0) < 1e-3 || Math.abs(c - BLD.z1) < 1e-3);
  return Math.abs(c - BLD.x0) < 1e-3 || Math.abs(c - GYM.x1) < 1e-3;
}

// Стороны зоны: { axis, c, s0, s1, sign (нормаль внутрь), inset, virtual }
function zoneSides(z) {
  const isCor = z.type === 'corridor';
  const sides = [
    { key: 'z0', axis: 'x', c: z.z0, sign: 1 },
    { key: 'z1', axis: 'x', c: z.z1, sign: -1 },
    { key: 'x0', axis: 'z', c: z.x0, sign: 1 },
    { key: 'x1', axis: 'z', c: z.x1, sign: -1 },
  ];
  for (const s of sides) {
    s.ext = exteriorSide(s.axis, s.c);
    s.inset = s.ext ? 0 : HALF;
    s.virtual = isCor && s.axis === 'z' && s.c > BLD.x0 + 0.1 && s.c < BLD.x1 - 0.1;
    if (z.type === 'gymstore' && (s.key === 'x1' || s.key === 'z1')) { s.ext = true; s.inset = 0; }
  }
  const by = Object.fromEntries(sides.map((s) => [s.key, s]));
  for (const s of sides) {
    if (s.axis === 'x') { s.s0 = z.x0 + (by.x0.virtual ? 0 : by.x0.inset); s.s1 = z.x1 - (by.x1.virtual ? 0 : by.x1.inset); }
    else { s.s0 = z.z0 + (by.z0.inset); s.s1 = z.z1 - (by.z1.inset); }
    s.plane = s.c + s.sign * s.inset;
  }
  return sides;
}

function zoneHeights(z) {
  const fy = floorY(z.floor);
  if (z.type === 'gym') return { y0: 0, y1: GYM.h - 0.2, ceil: GYM.h - 0.2 };
  if (z.type === 'gymstore') return { y0: 0, y1: 3.0, ceil: 3.0 };
  if (z.type === 'stairs') return { y0: fy, y1: fy + (z.floor ? CEIL_H : FLOOR_H), ceil: z.floor ? fy + CEIL_H : null };
  return { y0: fy, y1: fy + CEIL_H, ceil: fy + CEIL_H };
}

function schemeOf(z, idx) {
  if (z.type === 'corridor') return z.floor ? SCHEMES.corridor1 : SCHEMES.corridor;
  if (z.type === 'classroom') return SCHEMES.classroom[idx % SCHEMES.classroom.length];
  return SCHEMES[z.type] ?? SCHEMES.corridor;
}

// Полосы стены: плинтус, панель, рейка, верх.
function wallBands(S, y0) {
  return [
    [y0, y0 + 0.1, S.base, 'plain'],
    [y0 + 0.1, y0 + S.panel, S.low, S.tile ? 'tile' : S.wood ? 'wood' : 'plain'],
    [y0 + S.panel, y0 + S.panel + 0.07, S.rail, 'plain'],
    [y0 + S.panel + 0.07, 99, S.high, 'plain'],
  ];
}

function emitWallPiece(B, z, side, s0, s1, ya, yb, S, y0) {
  for (const [b0, b1, color, kind] of wallBands(S, y0)) {
    const lo = Math.max(ya, b0), hi = Math.min(yb, b1);
    if (hi - lo < 1e-3) continue;
    const mat = kind === 'tile' ? 'tileWall' : kind === 'wood' ? 'wood' : 'plaster';
    vquad(B.gb(z.id, mat), side.axis, side.plane, s0, s1, lo, hi, side.sign, col(color), mat === 'wood' ? 2 : mat === 'tileWall' ? 1.2 : 1);
  }
}

// Откосы проёма (в толщине стены) со стороны зоны: боковые грани, верх и (у окна) подоконник.
function emitReveals(B, z, side, o, lo, hi, S, depth) {
  const gb = B.gb(z.id, 'plaster');
  const rev = col(S.high);
  const pl = side.plane, inner = pl - side.sign * depth; // к центру стены
  const p0 = Math.min(pl, inner), p1 = Math.max(pl, inner);
  // Боковые грани: перпендикулярны стене, смотрят внутрь проёма.
  if (side.axis === 'x') {
    vquad(gb, 'z', o.a, p0, p1, lo, hi, 1, rev);
    vquad(gb, 'z', o.b, p0, p1, lo, hi, -1, rev);
    if (hi === o.y1) hquad(gb, o.a, p0, o.b, p1, o.y1, false, rev);
    if (lo === o.y0 && o.kind === 'window') hquad(B.gb(z.id, 'plaster'), o.a, p0, o.b, p1, o.y0, true, col('#f4f4f2'));
  } else {
    vquad(gb, 'x', o.a, p0, p1, lo, hi, 1, rev);
    vquad(gb, 'x', o.b, p0, p1, lo, hi, -1, rev);
    if (hi === o.y1) hquad(gb, p0, o.a, p1, o.b, o.y1, false, rev);
    if (lo === o.y0 && o.kind === 'window') hquad(B.gb(z.id, 'plaster'), p0, o.a, p1, o.b, o.y0, true, col('#f4f4f2'));
  }
}

function buildZoneWalls(B, z, openings, S) {
  const { y0, y1 } = zoneHeights(z);
  for (const side of zoneSides(z)) {
    if (side.virtual) continue;
    if (z.type === 'gym' && side.key === 'z1') {
      // Северная стена спортзала: часть за инвентарной не видна, там свои стены.
      emitSide(B, z, { ...side, s1: 45 - HALF }, openings, S, y0, y1);
      continue;
    }
    if (z.type === 'gym' && side.key === 'x1') {
      emitSide(B, z, { ...side, s1: 5 - HALF }, openings, S, y0, y1);
      continue;
    }
    emitSide(B, z, side, openings, S, y0, y1);
  }
  if (z.type === 'gym') {
    // Стены инвентарной со стороны зала.
    emitSide(B, z, { axis: 'x', c: 5, plane: 5 - HALF, sign: -1, s0: 45 - HALF, s1: 50, inset: HALF }, openings, S, 0, 3.0);
    emitSide(B, z, { axis: 'z', c: 45, plane: 45 - HALF, sign: -1, s0: 5 - HALF, s1: 10, inset: HALF }, openings, S, 0, 3.0);
    // Над инвентарной: её крыша и стены до потолка зала.
    vquad(B.gb(z.id, 'plaster'), 'x', 5 - HALF, 45 - HALF, 50, 3.0, y1, -1, col(S.high));
    vquad(B.gb(z.id, 'plaster'), 'z', 45 - HALF, 5 - HALF, 10, 3.0, y1, -1, col(S.high));
  }
}

function emitSide(B, z, side, openings, S, y0, y1) {
  const mine = openings.filter((o) => o.axis === side.axis && Math.abs(o.c - side.c) < 1e-3 &&
    o.b > side.s0 && o.a < side.s1 && o.y1 > y0 && o.y0 < y1).sort((p, q) => p.a - q.a);
  let s = side.s0;
  const depth = side.ext ? EXT_T : side.inset;
  for (const o of mine) {
    const a = Math.max(side.s0, o.a), b = Math.min(side.s1, o.b);
    emitWallPiece(B, z, side, s, a, y0, y1, S, y0);
    const lo = Math.max(y0, o.y0), hi = Math.min(y1, o.y1);
    emitWallPiece(B, z, side, a, b, y0, lo, S, y0);
    emitWallPiece(B, z, side, a, b, hi, y1, S, y0);
    if (depth > 0) emitReveals(B, z, side, { ...o, a, b }, lo, hi, S, depth);
    s = b;
  }
  emitWallPiece(B, z, side, s, side.s1, y0, y1, S, y0);
}

// ---------------------------------------------------------------- коллайдеры стен

function wallLines() {
  const L = [];
  // Стены коридора по этажам.
  for (const f of [0, 1]) {
    const y0 = floorY(f), y1 = y0 + FLOOR_H;
    L.push({ axis: 'x', c: CORR.z0, a0: BLD.x0, a1: BLD.x1, y0, y1, t: WALL_T });
    L.push({ axis: 'x', c: CORR.z1, a0: BLD.x0, a1: BLD.x1, y0, y1, t: WALL_T });
  }
  // Перегородки между кабинетами.
  const seen = new Set();
  for (const r of ROOMS) {
    if (r.side !== 'S' && r.side !== 'N') continue;
    for (const x of [r.x0, r.x1]) {
      if (x <= BLD.x0 || x >= BLD.x1) continue;
      const key = `${r.floor}|${r.side}|${x}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const y0 = floorY(r.floor);
      L.push({ axis: 'z', c: x, a0: r.z0, a1: r.z1, y0, y1: y0 + FLOOR_H, t: WALL_T });
    }
  }
  // Наружные стены и стена между корпусом и спортзалом.
  const H = 2 * FLOOR_H + 0.6;
  L.push({ axis: 'x', c: BLD.z0 - EXT_T / 2, a0: BLD.x0 - EXT_T, a1: BLD.x1, y0: 0, y1: H, t: EXT_T, ext: true, line: BLD.z0 });
  L.push({ axis: 'x', c: BLD.z1 + EXT_T / 2, a0: BLD.x0 - EXT_T, a1: BLD.x1, y0: 0, y1: H, t: EXT_T, ext: true, line: BLD.z1 });
  L.push({ axis: 'z', c: BLD.x0 - EXT_T / 2, a0: BLD.z0 - EXT_T, a1: BLD.z1 + EXT_T, y0: 0, y1: H, t: EXT_T, ext: true, line: BLD.x0 });
  L.push({ axis: 'x', c: GYM.z0 - EXT_T / 2, a0: GYM.x0, a1: GYM.x1 + EXT_T, y0: 0, y1: GYM.h + 0.6, t: EXT_T, ext: true, line: GYM.z0 });
  L.push({ axis: 'x', c: GYM.z1 + EXT_T / 2, a0: GYM.x0, a1: GYM.x1 + EXT_T, y0: 0, y1: GYM.h + 0.6, t: EXT_T, ext: true, line: GYM.z1 });
  L.push({ axis: 'z', c: GYM.x1 + EXT_T / 2, a0: GYM.z0 - EXT_T, a1: GYM.z1 + EXT_T, y0: 0, y1: GYM.h + 0.6, t: EXT_T, ext: true, line: GYM.x1 });
  L.push({ axis: 'z', c: BLD.x1, a0: BLD.z0, a1: BLD.z1, y0: 0, y1: H, t: WALL_T, line: BLD.x1 });
  // Инвентарная.
  L.push({ axis: 'x', c: 5, a0: 45, a1: GYM.x1, y0: 0, y1: 3.0, t: WALL_T });
  L.push({ axis: 'z', c: 45, a0: 5, a1: GYM.z1, y0: 0, y1: 3.0, t: WALL_T });
  return L;
}

function addWallColliders(world, openings) {
  for (const w of wallLines()) {
    const line = w.line ?? w.c;
    const gaps = openings.filter((o) => (o.kind === 'door' || o.kind === 'exit' || o.kind === 'open') &&
      o.axis === w.axis && Math.abs(o.c - line) < 1e-3 && o.b > w.a0 && o.a < w.a1 && o.y0 < w.y1 && o.y1 > w.y0)
      .sort((p, q) => p.a - q.a);
    const put = (a, b, y0, y1) => {
      if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
      if (w.axis === 'x') world.add({ minX: a, maxX: b, minZ: w.c - w.t / 2, maxZ: w.c + w.t / 2, minY: y0, maxY: y1, type: 'wall' });
      else world.add({ minX: w.c - w.t / 2, maxX: w.c + w.t / 2, minZ: a, maxZ: b, minY: y0, maxY: y1, type: 'wall' });
    };
    let s = w.a0;
    for (const g of gaps) {
      put(s, g.a, w.y0, w.y1);
      put(g.a, g.b, w.y0, g.y0);   // под проёмом (на верхнем этаже — нет)
      put(g.a, g.b, g.y1, w.y1);   // перемычка — для прямой видимости
      s = g.b;
    }
    put(s, w.a1, w.y0, w.y1);
  }
}

// ---------------------------------------------------------------- полы, потолки, лестницы

function buildFloorCeiling(B, z, fixturesOut) {
  const kind = FLOOR_KIND[z.type] ?? 'lino';
  const { y0, ceil } = zoneHeights(z);
  const white = col('#ffffff');
  // Пол — ровно по прямоугольнику зоны (границы зон — оси стен), чтобы полы соседей не перекрывались.
  const fx0 = z.x0, fx1 = z.x1, fz0 = z.z0, fz1 = z.z1;
  if (z.type === 'stairs') {
    // Пол только у входа на лестницу (дальше марши); на 2 этаже — край перекрытия.
    hquad(B.gb(z.id, kind), fx0, fz0, fx1, STAIR_Z0, y0, true, white, FLOOR_TILE[kind]);
    if (z.floor === 1) vquad(B.gb(z.id, 'plaster'), 'x', STAIR_Z0, z.x0, z.x1, y0 - 0.32, y0, 1, col('#e8e6e0'));
    if (z.floor === 0) hquad(B.gb(z.id, 'ceiling'), z.x0, z.z0, z.x1, STAIR_Z0, y0 + CEIL_H, false, white, 1.2);
    else hquad(B.gb(z.id, 'ceiling'), z.x0, z.z0, z.x1, z.z1, y0 + CEIL_H, false, white, 1.2);
  } else if (z.type === 'gym') {
    hquad(B.gb(z.id, kind), fx0, fz0, fx1, 5, y0, true, white, FLOOR_TILE[kind]);
    hquad(B.gb(z.id, kind), fx0, 5, 45, fz1, y0, true, white, FLOOR_TILE[kind]);
    hquad(B.gb(z.id, 'ceiling'), z.x0, z.z0, z.x1, z.z1, ceil, false, white, 1.2);
  } else {
    hquad(B.gb(z.id, kind), fx0, fz0, fx1, fz1, y0, true, white, FLOOR_TILE[kind]);
    if (ceil !== null) hquad(B.gb(z.id, 'ceiling'), z.x0, z.z0, z.x1, z.z1, ceil, false, white, 1.2);
  }
  if (z.type === 'gymstore') {
    // Крыша инвентарной (видна из зала сверху не будет — на 3 м, ниже окон).
    hquad(B.gb('gym', 'plaster'), z.x0 - HALF, z.z0 - HALF, z.x1, z.z1, 3.0, true, col('#d8d4cc'));
  }
  // Светильники: светодиодные панели 0.6×0.6 сеткой.
  const fixtures = [];
  const cy = (ceil ?? (y0 + CEIL_H)) - 0.01;
  if (z.type === 'corridor') {
    for (let x = z.x0 + 1.5; x < z.x1; x += 3) fixtures.push([x, 0]);
  } else if (z.type === 'gym') {
    for (let x = 33; x < 50; x += 4) for (const zz of [-5, 0, 5]) fixtures.push([x, zz]);
  } else if (z.type === 'stairs') {
    fixtures.push([(z.x0 + z.x1) / 2, z.floor ? 6 : 2.2]);
  } else {
    const nx = Math.max(1, Math.round((z.x1 - z.x0) / 3)), nz = Math.max(1, Math.round((z.z1 - z.z0) / 3));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      fixtures.push([z.x0 + (z.x1 - z.x0) * (i + 0.5) / nx, z.z0 + (z.z1 - z.z0) * (j + 0.5) / nz]);
    }
  }
  const gb = B.gb(z.id, 'panel');
  const big = z.type === 'gym';
  for (const [x, zz] of fixtures) {
    const s = big ? 0.5 : 0.3, l = big ? 1.2 : (z.type === 'corridor' ? 0.9 : 0.3);
    hquad(gb, x - l, zz - s, x + l, zz + s, cy, false, white);
    fixturesOut.push({ x, y: cy - 0.3, z: zz, zone: z.id });
  }
  return fixtures;
}

function buildStairs(B, s, world) {
  const parts0 = B.parts(`st${s.id}0`), parts1 = B.parts(`st${s.id}1`);
  const steps = 10, run = (STAIR_Z1 - STAIR_Z0) / steps, rise = LANDING_Y / steps;
  const stepC = '#c9c4b8', nose = '#6b6258', under = '#e8e5de';
  const [a0, a1] = s.laneA, [b0, b1] = s.laneB;
  // Марш A: вверх по +Z.
  for (let i = 0; i < steps; i++) {
    const z0 = STAIR_Z0 + i * run, h = (i + 1) * rise;
    boxPart(parts0, (a0 + a1) / 2, 0, z0 + run / 2, a1 - a0, h, run, stepC);
    boxPart(parts0, (a0 + a1) / 2, h - 0.025, z0 + 0.03, a1 - a0, 0.03, 0.06, nose);
  }
  // Площадка.
  boxPart(parts0, (s.x0 + s.x1) / 2, LANDING_Y - 0.2, (STAIR_Z1 + BLD.z1) / 2, s.x1 - s.x0, 0.2, BLD.z1 - STAIR_Z1, stepC);
  boxPart(parts0, (s.x0 + s.x1) / 2, LANDING_Y - 0.32, (STAIR_Z1 + BLD.z1) / 2, s.x1 - s.x0, 0.12, BLD.z1 - STAIR_Z1, under);
  // Марш B: от площадки вверх по −Z.
  for (let i = 0; i < steps; i++) {
    const z1 = STAIR_Z1 - i * run, h = LANDING_Y + (i + 1) * rise;
    boxPart(parts1, (b0 + b1) / 2, h - rise, z1 - run / 2, b1 - b0, rise, run, stepC);
    boxPart(parts1, (b0 + b1) / 2, h - 0.025, z1 - 0.03, b1 - b0, 0.03, 0.06, nose);
  }
  // Наклонная плита под маршем B (видна с первого этажа).
  {
    const len = Math.hypot(STAIR_Z1 - STAIR_Z0, LANDING_Y);
    const g = new THREE.BoxGeometry(b1 - b0, 0.15, len);
    g.rotateX(Math.atan2(LANDING_Y, STAIR_Z1 - STAIR_Z0));
    g.translate((b0 + b1) / 2, LANDING_Y * 1.5 - 0.2, (STAIR_Z0 + STAIR_Z1) / 2);
    parts0.push({ geometry: g, color: under });
  }
  // Стенка между маршами и перила.
  const mid = (a1 + b0) / 2;
  boxPart(parts0, mid, 0, (STAIR_Z0 + STAIR_Z1) / 2, b0 - a1, LANDING_Y + 1.0, STAIR_Z1 - STAIR_Z0, '#d9d4c6');
  world.add({ minX: a1, maxX: b0, minZ: STAIR_Z0 - 0.05, maxZ: STAIR_Z1, minY: 0, maxY: LANDING_Y + 2.2, type: 'wall' });
  // Под маршем B на 1 этаже — кладовка (стенка), чтобы не ходили под лестницей.
  boxPart(parts0, (b0 + b1) / 2, 0, STAIR_Z0 + 0.06, b1 - b0, 1.5, 0.12, '#bfc7c2');
  world.add({ minX: b0, maxX: b1 + 0.1, minZ: STAIR_Z0, maxZ: STAIR_Z1, minY: 0, maxY: 1.6, type: 'wall' });
  // Перила второго этажа над маршем A (чтобы не упасть в пролёт).
  const rail = '#3b4a58';
  boxPart(parts1, (a0 + a1) / 2, FLOOR_H + 0.95, STAIR_Z0, a1 - a0, 0.06, 0.08, rail);
  for (let x = a0 + 0.2; x < a1; x += 0.4) boxPart(parts1, x, FLOOR_H, STAIR_Z0, 0.03, 0.95, 0.03, rail);
  world.add({ minX: a0, maxX: a1, minZ: STAIR_Z0 - 0.05, maxZ: BLD.z1, minY: FLOOR_H - 0.1, maxY: FLOOR_H + 1.0, type: 'rail', see: true });
  // Поручни вдоль маршей у стен.
  for (const [x, zA, yA, zB, yB, p] of [
    [a0 + 0.06, STAIR_Z0, 0.9, STAIR_Z1, LANDING_Y + 0.9, parts0],
    [b1 - 0.06, STAIR_Z1, LANDING_Y + 0.9, STAIR_Z0, FLOOR_H + 0.9, parts1],
  ]) {
    const len = Math.hypot(zB - zA, yB - yA);
    const g = new THREE.BoxGeometry(0.05, 0.05, len).rotateX(-Math.atan2(yB - yA, zB - zA));
    g.translate(x, (yA + yB) / 2, (zA + zB) / 2);
    p.push({ geometry: g, color: rail });
  }
}

// ---------------------------------------------------------------- окна и двери (рамы)

function buildWindowFrames(B, openings) {
  const frame = B.parts('outside', 'color');
  const glass = new GeometryBuilder();
  const white = '#f4f4f2';
  for (const o of openings) {
    if (o.kind !== 'window') continue;
    const mid = o.inner ? o.c : o.axis === 'x' ? o.c + (o.c > 0 ? 0.17 : -0.17) : o.c + (o.c > 0 ? 0.17 : -0.17);
    const w = o.b - o.a, h = o.y1 - o.y0, cm = (o.a + o.b) / 2;
    const t = 0.07, d = 0.08;
    const put = (sCenter, yC, sw, sh) => {
      if (o.axis === 'x') boxPart(frame, sCenter, yC - sh / 2, mid, sw, sh, d, white);
      else boxPart(frame, mid, yC - sh / 2, sCenter, d, sh, sw, white);
    };
    put(cm, o.y0 + t / 2, w, t);
    put(cm, o.y1 - t / 2, w, t);
    put(o.a + t / 2, o.y0 + h / 2, t, h);
    put(o.b - t / 2, o.y0 + h / 2, t, h);
    put(cm, o.y0 + h / 2, t * 0.8, h);                 // средник
    if (h > 1.5) put(cm, o.y1 - 0.55, w, t * 0.8);      // фрамуга
    // Стекло (двустороннее).
    if (o.axis === 'x') vquad(glass, 'x', mid, o.a, o.b, o.y0, o.y1, 1, col('#ffffff'));
    else vquad(glass, 'z', mid, o.a, o.b, o.y0, o.y1, 1, col('#ffffff'));
  }
  return glass;
}

function buildDoorFrames(B, openings) {
  for (const o of openings) {
    if (o.kind !== 'door' && o.kind !== 'exit' && o.kind !== 'open') continue;
    if (o.kind === 'open') {
      // Балка над аркой.
      continue;
    }
    const parts = B.parts('outside', 'color');
    const casing = o.kind === 'exit' ? '#5a5f66' : '#efe9dc';
    const depth = o.kind === 'exit' ? EXT_T + 0.06 : WALL_T + 0.06;
    const c = o.kind === 'exit' ? (o.axis === 'x' ? o.c - EXT_T / 2 : o.c > 0 ? o.c + EXT_T / 2 : o.c - EXT_T / 2) : o.c;
    const t = 0.07;
    const put = (s, y0, sw, sh) => {
      if (o.axis === 'x') boxPart(parts, s, y0, c, sw, sh, depth, casing);
      else boxPart(parts, c, y0, s, depth, sh, sw, casing);
    };
    put(o.a - t / 2, o.y0, t, o.y1 - o.y0 + t);
    put(o.b + t / 2, o.y0, t, o.y1 - o.y0 + t);
    put((o.a + o.b) / 2, o.y1, o.b - o.a + 2 * t, t);
  }
}

// ---------------------------------------------------------------- фасад и крыша

function buildFacade(B, openings, world) {
  const gb = B.gb('outside', 'brick');
  const trim = B.parts('outside', 'color');
  const brick = col('#ffffff');
  const H = 2 * FLOOR_H + 0.6;
  const facades = [
    { axis: 'x', line: BLD.z0, plane: BLD.z0 - EXT_T, sign: -1, s0: BLD.x0 - EXT_T, s1: BLD.x1, h: H },
    { axis: 'x', line: BLD.z1, plane: BLD.z1 + EXT_T, sign: 1, s0: BLD.x0 - EXT_T, s1: BLD.x1, h: H },
    { axis: 'z', line: BLD.x0, plane: BLD.x0 - EXT_T, sign: -1, s0: BLD.z0 - EXT_T, s1: BLD.z1 + EXT_T, h: H },
    { axis: 'x', line: GYM.z0, plane: GYM.z0 - EXT_T, sign: -1, s0: GYM.x0, s1: GYM.x1 + EXT_T, h: GYM.h + 0.6 },
    { axis: 'x', line: GYM.z1, plane: GYM.z1 + EXT_T, sign: 1, s0: GYM.x0, s1: GYM.x1 + EXT_T, h: GYM.h + 0.6 },
    { axis: 'z', line: GYM.x1, plane: GYM.x1 + EXT_T, sign: 1, s0: GYM.z0 - EXT_T, s1: GYM.z1 + EXT_T, h: GYM.h + 0.6 },
  ];
  for (const f of facades) {
    const mine = openings.filter((o) => o.ext && o.axis === f.axis && Math.abs(o.c - f.line) < 1e-3 && o.b > f.s0 && o.a < f.s1)
      .sort((p, q) => p.a - q.a);
    // Сначала — сплошные вертикальные полосы между проёмами, потом куски над/под проёмами.
    const xs = [f.s0];
    for (const o of mine) xs.push(o.a, o.b);
    xs.push(f.s1);
    const cuts = [...new Set(xs)].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1];
      const holes = mine.filter((o) => o.a < b - 1e-3 && o.b > a + 1e-3).sort((p, q) => p.y0 - q.y0);
      let y = 0;
      for (const o of holes) {
        vquad(gb, f.axis, f.plane, a, b, y, o.y0, f.sign, brick, 2);
        y = o.y1;
      }
      vquad(gb, f.axis, f.plane, a, b, y, f.h, f.sign, brick, 2);
    }
    // Откосы снаружи.
    for (const o of mine) {
      const p0 = Math.min(f.plane, o.c), p1 = Math.max(f.plane, o.c);
      const rev = col('#d7cfc4');
      if (f.axis === 'x') {
        vquad(gb, 'z', o.a, p0, p1, o.y0, o.y1, 1, rev);
        vquad(gb, 'z', o.b, p0, p1, o.y0, o.y1, -1, rev);
        hquad(gb, o.a, p0, o.b, p1, o.y1, false, rev);
        if (o.kind === 'window') boxPart(trim, (o.a + o.b) / 2, o.y0 - 0.05, f.plane + f.sign * 0.06, o.b - o.a + 0.1, 0.06, 0.18, '#e9e7e2');
      } else {
        vquad(gb, 'x', o.a, p0, p1, o.y0, o.y1, 1, rev);
        vquad(gb, 'x', o.b, p0, p1, o.y0, o.y1, -1, rev);
        hquad(gb, p0, o.a, p1, o.b, o.y1, false, rev);
        if (o.kind === 'window') boxPart(trim, f.plane + f.sign * 0.06, o.y0 - 0.05, (o.a + o.b) / 2, 0.18, 0.06, o.b - o.a + 0.1, '#e9e7e2');
      }
    }
    // Цоколь, междуэтажный пояс, карниз.
    const len = f.s1 - f.s0, mid = (f.s0 + f.s1) / 2, off = f.plane + f.sign * 0.04;
    const band = (y0, h, c, d = 0.1) => {
      if (f.axis === 'x') boxPart(trim, mid, y0, off, len + 0.1, h, d, c);
      else boxPart(trim, off, y0, mid, d, h, len + 0.1, c);
    };
    band(0, 0.45, '#6f6a64', 0.12);
    if (f.h > FLOOR_H * 2) band(FLOOR_H - 0.12, 0.2, '#efece4');
    band(f.h - 0.3, 0.3, '#efece4', 0.22);
  }
  // Крыши с парапетом.
  const roof = B.parts('outside', 'color');
  boxPart(roof, 0, 2 * FLOOR_H, 0, BLD.x1 - BLD.x0 + 2 * EXT_T, 0.1, BLD.z1 - BLD.z0 + 2 * EXT_T, '#7d8288');
  boxPart(roof, (GYM.x0 + GYM.x1) / 2 + EXT_T / 2, GYM.h, 0, GYM.x1 - GYM.x0 + EXT_T, 0.1, GYM.z1 - GYM.z0 + 2 * EXT_T, '#7d8288');
  // Вентиляция и выход на крышу.
  boxPart(roof, -12, 2 * FLOOR_H + 0.1, 4, 2.2, 1.1, 2.2, '#a9adb2');
  boxPart(roof, 14, 2 * FLOOR_H + 0.1, -4, 1.4, 0.8, 1.4, '#a9adb2');
  boxPart(roof, 40, GYM.h + 0.1, 0, 3, 0.6, 1.5, '#a9adb2');
  // Козырёк над главным входом на двух колоннах и вывеска.
  boxPart(roof, 0, 3.05, -11.6, 7.4, 0.22, 3.4, '#e9e6de');
  for (const x of [-3.3, 3.3]) {
    trim.push({ geometry: new THREE.CylinderGeometry(0.16, 0.16, 3.05, 12).translate(x, 1.525, -12.9), color: '#f1efe9' });
    world.addBox(x, -12.9, 0.34, 0.34, 0, 3.05, 'column');
  }
  // Ступеньки-пандус у входа (визуально).
  boxPart(trim, 0, -0.02, -11.4, 6, 0.04, 2.6, '#9a9690');
}

// ---------------------------------------------------------------- сборка всего

export function buildSchool(scene, world, T, opts = {}) {
  const M = createMaterials(T);
  const B = new Buckets();
  const openings = collectOpenings();
  const zones = [...ROOMS, ...CORRIDORS].map((r) => ({
    ...r, meshes: [], mats: [], fixtures: [], lightsOn: true, hideSpots: [], seats: [], smoke: 0, heat: 0,
  }));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const fixtures = [];
  const ctx = {
    B, M, T, world, zones, zoneById, openings,
    hideSpots: [], items: [], switches: [], alarms: [], seats: [], boards: [], wander: [], lockers: [], windows: [],
    extinguishers: [], boxPart, hquad, vquad,
  };

  let classIdx = 0;
  for (const z of zones) {
    const S = schemeOf(z, z.type === 'classroom' ? classIdx++ : 0);
    z.scheme = S;
    buildZoneWalls(B, z, openings, S);
    z.fixtures = buildFloorCeiling(B, z, fixtures).map(([x, zz]) => ({ x, z: zz }));
  }
  for (const s of STAIRS) buildStairs(B, s, world);
  addWallColliders(world, openings);
  const glassGb = buildWindowFrames(B, openings);
  buildDoorFrames(B, openings);
  buildFacade(B, openings, world);
  for (const z of zones) furnishZone(ctx, z);
  furnishCorridors(ctx);
  buildYard(ctx);

  // Меши из корзин. Материал на зону — свой (клон), чтобы гасить свет по комнатам.
  const zoneMats = new Map();
  const matFor = (zoneId, key) => {
    if (zoneId === 'outside' || key === 'glass') return M[key] ?? M.color;
    const k = zoneId + '|' + key;
    let m = zoneMats.get(k);
    if (!m) {
      const base = key.startsWith('board:') ? boardMat(T, key.slice(6)) : M[key] ?? M.color;
      m = base.clone();
      m.userData.baseEmissive = m.emissiveIntensity;
      zoneMats.set(k, m);
      zoneById.get(zoneId)?.mats.push(m);
    }
    return m;
  };
  for (const b of B.map.values()) {
    const geos = [];
    if (!b.gb.isEmpty) geos.push(b.gb.build());
    if (b.parts.length) geos.push(mergeColored(b.parts));
    for (const g of geos) {
      const mesh = new THREE.Mesh(g, matFor(b.zoneId, b.mat));
      const glow = b.mat === 'panel' || b.mat === 'glow' || b.mat === 'screen';
      mesh.castShadow = !glow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      scene.add(mesh);
      const z = zoneById.get(b.zoneId);
      if (z) z.meshes.push(mesh);
      else (ctx.outsideMeshes ??= []).push(mesh);
    }
  }
  const glass = new THREE.Mesh(glassGb.build(), M.glass);
  glass.renderOrder = 1;
  scene.add(glass);

  return {
    zones, zoneById, openings, fixtures, materials: M, glass,
    hideSpots: ctx.hideSpots, items: ctx.items, switches: ctx.switches, alarms: ctx.alarms, seats: ctx.seats,
    boards: ctx.boards, wander: ctx.wander, lockers: ctx.lockers, windows: ctx.windows, extinguishers: ctx.extinguishers,
    outsideMeshes: ctx.outsideMeshes ?? [], props: ctx.props ?? [],
  };
}

const BOARD_MATS = new Map();
function boardMat(T, subject) {
  if (!BOARD_MATS.has(subject)) BOARD_MATS.set(subject, new THREE.MeshStandardMaterial({ map: T.board(subject), roughness: 0.92 }));
  return BOARD_MATS.get(subject);
}

// Свет в зоне: выключенный — материалы темнее, панели не светятся.
export function setZoneLights(zone, on) {
  zone.lightsOn = on;
  for (const m of zone.mats) {
    if (m.userData.baseEmissive > 0 && m.emissiveIntensity !== undefined && m.emissive && m.emissive.getHex() !== 0) {
      m.emissiveIntensity = on ? m.userData.baseEmissive : 0.02;
    }
    m.color.setScalar(on ? 1 : 0.3);
  }
}
