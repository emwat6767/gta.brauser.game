import * as THREE from 'three';
import { GeometryBuilder } from '../js/geometry.js';
import { createRng } from '../js/utils.js';
import { BLD, GYM, SITE, EXT_T } from './layout.js';
import { hquad, vquad } from './build.js';

// Школьный двор: газон, площадь у входа, подъезд от ворот, парковка, тротуары вокруг здания,
// стадион с беговой дорожкой и футбольным полем, трибуна, забор с воротами, деревья, клумбы,
// флагштоки, школьный автобус, машины, а за забором — панельные дома микрорайона.

const FENCE = { x0: -62, x1: 74, z0: -44, z1: 64, gate: [-6, 6] };
export const STADIUM = { cx: 0, cz: 38, half: 20, r0: 12, r1: 16 };

function box(parts, cx, y0, cz, sx, sy, sz, color) {
  parts.push({ geometry: new THREE.BoxGeometry(sx, sy, sz).translate(cx, y0 + sy / 2, cz), color });
}

export function buildYard(ctx) {
  const { B, world, T } = ctx;
  const white = new THREE.Color(1, 1, 1);
  const parts = B.parts('outside');
  const metal = B.parts('outside', 'metal');
  const rng = createRng(17);

  // --- Покрытия ------------------------------------------------------------------
  const grass = B.gb('outside', 'grass');
  hquad(grass, SITE.x0 - 80, SITE.z0 - 80, SITE.x1 + 80, SITE.z1 + 80, -0.02, true, new THREE.Color('#8fb07a'), 4);
  hquad(grass, FENCE.x0, FENCE.z0, FENCE.x1, FENCE.z1, -0.01, true, white, 3);
  const asph = B.gb('outside', 'asphalt');
  hquad(asph, -4.5, FENCE.z0 - 30, 4.5, -24, 0.01, true, white, 4);              // подъезд и улица
  hquad(asph, -90, FENCE.z0 - 14, 110, FENCE.z0 - 4, 0.005, true, white, 4);       // улица за забором
  hquad(asph, -18, -30, 34, -24, 0.012, true, white, 4);                          // проезд к парковке
  hquad(asph, 14, -24, 34, -15, 0.012, true, white, 4);                           // парковка
  const pav = B.gb('outside', 'paving');
  hquad(pav, -18, -24, 14, -10.35, 0.02, true, white, 1.2);                       // площадь у входа
  hquad(pav, BLD.x0 - 3, -10.35, BLD.x0 - EXT_T, 12.5, 0.02, true, white, 1.2);  // тротуар с запада
  hquad(pav, BLD.x0 - 3, 10.35, GYM.x1 + 3, 12.5, 0.02, true, white, 1.2);       // с севера
  hquad(pav, GYM.x1 + EXT_T, -12.5, GYM.x1 + 3, 10.35, 0.02, true, white, 1.2);  // с востока
  hquad(pav, 14, -12.5, GYM.x1 + 3, -10.35, 0.02, true, white, 1.2);             // вдоль фасада
  hquad(pav, -2, 12.5, 2, STADIUM.cz - STADIUM.r1, 0.02, true, white, 1.2);      // дорожка к стадиону
  hquad(pav, BLD.x0 - 3, -24, BLD.x0 - 1, -10.35, 0.02, true, white, 1.2);
  // Разметка парковки.
  for (let x = 15; x <= 33; x += 2.6) box(parts, x, 0.013, -19.5, 0.1, 0.004, 5, '#f2f2f2');

  // --- Стадион ---------------------------------------------------------------------
  {
    const S = STADIUM;
    const track = B.gb('outside', 'track');
    hquad(track, S.cx - S.half, S.cz - S.r1, S.cx + S.half, S.cz - S.r0, 0.015, true, white, 2);
    hquad(track, S.cx - S.half, S.cz + S.r0, S.cx + S.half, S.cz + S.r1, 0.015, true, white, 2);
    const trackMat = 'track';
    for (const side of [-1, 1]) {
      const g = new THREE.RingGeometry(S.r0, S.r1, 32, 1, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI);
      g.rotateX(-Math.PI / 2).translate(S.cx + side * S.half, 0.015, S.cz);
      // UV кольца в метрах.
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2, pos.getZ(i) / 2);
      B.parts('outside', trackMat).push({ geometry: g, color: '#ffffff' });
    }
    // Линии дорожек.
    for (let k = 0; k <= 4; k++) {
      const r = S.r0 + k * (S.r1 - S.r0) / 4;
      for (const zz of [S.cz - r, S.cz + r]) box(parts, S.cx, 0.02, zz, S.half * 2, 0.004, 0.05, '#f4f4f4');
      for (const side of [-1, 1]) {
        const g = new THREE.RingGeometry(r - 0.025, r + 0.025, 40, 1, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI);
        g.rotateX(-Math.PI / 2).translate(S.cx + side * S.half, 0.021, S.cz);
        parts.push({ geometry: g, color: '#f4f4f4' });
      }
    }
    // Футбольное поле: полосы газона, разметка, ворота.
    for (let i = 0; i < 8; i++) {
      const x0 = -18 + i * 4.5;
      box(parts, x0 + 2.25, 0.005, S.cz, 4.5, 0.004, 22, i % 2 ? '#5d8f3e' : '#6a9c48');
    }
    for (const [x0, z0, x1, z1] of [[-18, S.cz - 11, 18, S.cz - 10.95], [-18, S.cz + 10.95, 18, S.cz + 11],
      [-18, S.cz - 11, -17.95, S.cz + 11], [17.95, S.cz - 11, 18, S.cz + 11], [-0.03, S.cz - 11, 0.03, S.cz + 11]]) {
      box(parts, (x0 + x1) / 2, 0.012, (z0 + z1) / 2, Math.max(0.06, x1 - x0), 0.004, Math.max(0.06, z1 - z0), '#f4f4f4');
    }
    {
      const g = new THREE.RingGeometry(3.6, 3.66, 40).rotateX(-Math.PI / 2).translate(0, 0.013, S.cz);
      parts.push({ geometry: g, color: '#f4f4f4' });
    }
    for (const side of [-1, 1]) {
      const x = side * 18;
      for (const dz of [-1.6, 1.6]) {
        box(metal, x, 0, S.cz + dz, 0.1, 2.1, 0.1, '#f4f4f4');
        world.addBox(x, S.cz + dz, 0.12, 0.12, 0, 2.1, 'post');
      }
      box(metal, x, 2.05, S.cz, 0.1, 0.1, 3.3, '#f4f4f4');
      box(parts, x + side * 0.8, 0, S.cz, 0.02, 2.0, 3.2, '#d8d8d8');
    }
    // Трибуна с северной стороны.
    for (let k = 0; k < 4; k++) {
      box(parts, 0, k * 0.45, S.cz + S.r1 + 2.5 + k * 0.7, 30, 0.45, 0.7, k % 2 ? '#2d6fb3' : '#e0a02a');
    }
    world.addBox(0, S.cz + S.r1 + 3.55, 30, 2.8, 0, 1.8, 'bleachers');
    // Табличка места сбора.
    box(metal, -3.0, 0, S.cz - S.r1 - 2.0, 0.08, 2.2, 0.08, '#6b737a');
    box(metal, 3.0, 0, S.cz - S.r1 - 2.0, 0.08, 2.2, 0.08, '#6b737a');
    const sg = B.gb('outside', 'signs');
    const zS = S.cz - S.r1 - 2.06;
    vquadRect(sg, 'x', zS, -1, -3.2, 3.2, 1.6, 2.2, ctx.T.signs.rect('assembly'));
    vquadRect(sg, 'x', zS + 0.12, 1, -3.2, 3.2, 1.6, 2.2, ctx.T.signs.rect('assembly'));
    box(parts, 0, 1.58, zS + 0.06, 6.5, 0.66, 0.1, '#0f7a3c');
  }

  // --- Забор с воротами ---------------------------------------------------------------
  {
    const post = '#2f3a33', bar = '#3e4c43';
    const line = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 2.5));
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
        box(metal, x, 0, z, 0.08, 1.9, 0.08, post);
      }
      const horiz = Math.abs(z1 - z0) < 1e-3;
      for (const y of [0.25, 1.75]) {
        if (horiz) box(metal, (x0 + x1) / 2, y, z0, len, 0.05, 0.04, bar);
        else box(metal, x0, y, (z0 + z1) / 2, 0.04, 0.05, len, bar);
      }
      // Пики.
      const m = Math.round(len / 0.18);
      const g = new THREE.BoxGeometry(horiz ? 0.025 : 0.025, 1.6, 0.025);
      for (let i = 0; i < m; i++) {
        const t = (i + 0.5) / m;
        metal.push({ geometry: g.clone().translate(x0 + (x1 - x0) * t, 1.05, z0 + (z1 - z0) * t), color: bar });
      }
      if (horiz) world.add({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: z0 - 0.06, maxZ: z0 + 0.06, minY: 0, maxY: 2, type: 'fence', see: true });
      else world.add({ minX: x0 - 0.06, maxX: x0 + 0.06, minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), minY: 0, maxY: 2, type: 'fence', see: true });
    };
    line(FENCE.x0, FENCE.z0, FENCE.gate[0], FENCE.z0);
    line(FENCE.gate[1], FENCE.z0, FENCE.x1, FENCE.z0);
    line(FENCE.x0, FENCE.z1, FENCE.x1, FENCE.z1);
    line(FENCE.x0, FENCE.z0, FENCE.x0, FENCE.z1);
    line(FENCE.x1, FENCE.z0, FENCE.x1, FENCE.z1);
    for (const x of FENCE.gate) box(parts, x, 0, FENCE.z0, 0.5, 2.6, 0.5, '#b0563c');
    // Будка охраны у ворот.
    box(parts, 9.5, 0, FENCE.z0 + 2.2, 2.4, 2.4, 2.2, '#e9e6de');
    box(parts, 9.5, 2.4, FENCE.z0 + 2.2, 2.8, 0.15, 2.6, '#7d8288');
    world.addBox(9.5, FENCE.z0 + 2.2, 2.4, 2.2, 0, 2.5, 'building');
  }

  // --- Деревья ---------------------------------------------------------------------------
  {
    const trunk = B.parts('outside');
    const crowns = B.parts('outside');
    const blocked = (x, z) => {
      if (x > BLD.x0 - 5 && x < GYM.x1 + 5 && z > BLD.z0 - 4 && z < BLD.z1 + 4) return true;
      if (x > -22 && x < 36 && z > -32 && z < -10) return true;                      // площадь и парковка
      if (Math.abs(x) < 6 && z < -10) return true;                                    // подъезд
      const S = STADIUM;
      const dx = Math.max(0, Math.abs(x - S.cx) - S.half);
      if (Math.hypot(dx, z - S.cz) < S.r1 + 4.5 && z < S.cz + S.r1 + 7) return true;  // стадион и трибуна
      if (Math.abs(z - S.cz) < S.r1 + 8 && Math.abs(x) < S.half + 2 && z > S.cz) return true;
      return false;
    };
    const spots = [];
    for (let x = FENCE.x0 + 3; x < FENCE.x1 - 2; x += 6.5) { spots.push([x, FENCE.z0 + 3]); spots.push([x, FENCE.z1 - 3]); }
    for (let z = FENCE.z0 + 9; z < FENCE.z1 - 5; z += 6.5) { spots.push([FENCE.x0 + 3, z]); spots.push([FENCE.x1 - 3, z]); }
    for (let i = 0; i < 40; i++) spots.push([rng.range(FENCE.x0 + 6, FENCE.x1 - 6), rng.range(FENCE.z0 + 6, FENCE.z1 - 6)]);
    for (const [x0, z0] of spots) {
      const x = x0 + rng.range(-1, 1), z = z0 + rng.range(-1, 1);
      if (blocked(x, z) || Math.abs(x) < 7 && z < -30) continue;
      const h = rng.range(3.2, 5.2), r = rng.range(1.6, 2.6);
      trunk.push({ geometry: new THREE.CylinderGeometry(0.16, 0.24, h, 7).translate(x, h / 2, z), color: '#5a4030' });
      const green = rng.pick(['#3f7f35', '#4f8f3a', '#5a9a40', '#6aa64a', '#c9a23a']);
      for (let k = 0; k < 3; k++) {
        const g = new THREE.IcosahedronGeometry(r * rng.range(0.7, 1), 1);
        g.translate(x + rng.range(-0.8, 0.8), h + rng.range(-0.2, 1.0), z + rng.range(-0.8, 0.8));
        crowns.push({ geometry: g, color: green });
      }
      world.addBox(x, z, 0.45, 0.45, 0, 3, 'tree');
    }
  }

  // --- Клумба, флагштоки, скамейки, памятный камень у входа ----------------------------------
  {
    const g = new THREE.CylinderGeometry(3.2, 3.4, 0.35, 28).translate(0, 0.17, -18.5);
    parts.push({ geometry: g, color: '#9a9690' });
    parts.push({ geometry: new THREE.CylinderGeometry(3.0, 3.0, 0.05, 28).translate(0, 0.36, -18.5), color: '#4a3020' });
    for (let i = 0; i < 70; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * 2.8;
      const fl = new THREE.SphereGeometry(0.11, 6, 4).translate(Math.cos(a) * r, 0.47, -18.5 + Math.sin(a) * r);
      parts.push({ geometry: fl, color: rng.pick(['#e84393', '#f39c12', '#f4f4f4', '#d62c2c', '#8e44ad', '#ffd34a']) });
    }
    world.add({ minX: -3.3, maxX: 3.3, minZ: -21.8, maxZ: -15.2, minY: 0, maxY: 0.4, type: 'bed', see: true });
    for (const [x, c] of [[-9, ['#ffffff', '#1d4fa0', '#d62c2c']], [-7.4, ['#1d4fa0', '#f4f4f4', '#1d4fa0']], [-5.8, ['#2a8a5a', '#ffd34a', '#2a8a5a']]]) {
      parts.push({ geometry: new THREE.CylinderGeometry(0.06, 0.08, 8, 8).translate(x, 4, -15.5), color: '#c8ccd0' });
      c.forEach((col, k) => box(parts, x + 0.7, 7.3 - k * 0.32, -15.5, 1.3, 0.32, 0.02, col));
      world.addBox(x, -15.5, 0.2, 0.2, 0, 8, 'post');
    }
    for (const [x, z] of [[-12, -13.2], [-12, -21], [10, -21], [10, -13.2]]) bench(parts, metal, world, x, z, 'x');
    for (const [x, z] of [[-35, 4], [-35, -6], [55, 4], [55, -6]]) bench(parts, metal, world, x, z, 'z');
    // Вывеска школы над козырьком.
    const sg = B.gb('outside', 'signs');
    vquadRect(sg, 'x', BLD.z0 - EXT_T - 0.045, -1, -3.6, 3.6, 3.72, 4.32, ctx.T.signs.rect('school'));
    box(parts, 0, 3.68, BLD.z0 - EXT_T - 0.02, 7.4, 0.68, 0.04, '#1d3f80');
  }

  // --- Автобус и машины --------------------------------------------------------------------
  {
    const bus = createBusParts();
    for (const p of bus) {
      p.geometry.rotateY(Math.PI / 2).translate(-14, 0, -27);
      parts.push(p);
    }
    world.addBox(-14, -27, 10.2, 2.6, 0, 3, 'vehicle');
    const cols = ['#c0392b', '#2d7fd6', '#e8e8e8', '#2a2a2a', '#7a8a9a', '#e0a02a'];
    for (let i = 0; i < 6; i++) {
      if (i === 3) continue;
      const x = 16.3 + i * 2.6, z = -19.5;
      car(parts, x, z, cols[i]);
      world.addBox(x, z, 1.9, 4.3, 0, 1.5, 'vehicle');
    }
  }

  // --- Микрорайон за забором -------------------------------------------------------------------
  {
    const gb = B.gb('outside', 'panelBlock');
    const tint = new THREE.Color(1, 1, 1);
    const block = (cx, cz, sx, sz, h) => {
      const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
      vquad(gb, 'x', z1, x0, x1, 0, h, 1, tint, 4);
      vquad(gb, 'x', z0, x0, x1, 0, h, -1, tint, 4);
      vquad(gb, 'z', x1, z0, z1, 0, h, 1, tint, 4);
      vquad(gb, 'z', x0, z0, z1, 0, h, -1, tint, 4);
      box(parts, cx, h, cz, sx + 0.3, 0.4, sz + 0.3, '#8a8a84');
    };
    block(-40, -78, 64, 12, 27);
    block(45, -80, 48, 12, 30);
    block(-100, 0, 12, 70, 27);
    block(115, 10, 12, 80, 33);
    block(-30, 100, 70, 12, 27);
    block(60, 104, 50, 12, 36);
    block(-95, 80, 26, 26, 45);
  }
}

function bench(parts, metal, world, x, z, axis) {
  const sx = axis === 'x' ? 1.8 : 0.45, sz = axis === 'x' ? 0.45 : 1.8;
  box(parts, x, 0.42, z, sx, 0.06, sz, '#b88a55');
  box(parts, axis === 'x' ? x : x + 0.2, 0.48, axis === 'x' ? z + 0.2 : z, axis === 'x' ? 1.8 : 0.05, 0.4, axis === 'x' ? 0.05 : 1.8, '#b88a55');
  for (const d of [-0.7, 0.7]) box(metal, axis === 'x' ? x + d : x, 0, axis === 'x' ? z : z + d, axis === 'x' ? 0.06 : 0.4, 0.42, axis === 'x' ? 0.4 : 0.06, '#3a3a3a');
  world.addBox(x, z, sx, sz, 0, 0.5, 'bench');
}

function car(parts, x, z, color) {
  box(parts, x, 0.25, z, 1.8, 0.65, 4.2, color);
  box(parts, x, 0.9, z + 0.2, 1.6, 0.55, 2.2, color);
  box(parts, x, 0.93, z + 0.2, 1.62, 0.45, 2.0, '#2a3440');
  for (const dx of [-0.85, 0.85]) for (const dz of [-1.35, 1.35]) {
    parts.push({ geometry: new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12).rotateZ(Math.PI / 2).translate(x + dx, 0.32, z + dz), color: '#141414' });
  }
}

// Жёлтый школьный автобус «ДЕТИ» вдоль оси Z (перед — +Z). Возвращает части для mergeColored.
export function createBusParts(color = '#f2c230', label = '#d62c2c') {
  const p = [];
  box(p, 0, 0.45, 0, 2.5, 2.4, 10, color);
  box(p, 0, 0.45, 0, 2.52, 0.35, 10.02, '#2a2a2a');
  box(p, 0, 1.55, 0.2, 2.54, 0.9, 9.0, '#2a3440');                    // окна
  for (let z = -4; z <= 4.5; z += 1.1) box(p, 0, 1.55, z, 2.56, 0.9, 0.08, color);
  box(p, 0, 1.4, 5.02, 2.2, 1.0, 0.04, '#2a3440');                    // лобовое
  box(p, 0, 2.6, 5.03, 1.0, 0.25, 0.03, label);                       // «ДЕТИ»
  box(p, 0, 2.86, 0, 2.3, 0.08, 9.6, '#e6b422');
  for (const dx of [-1.15, 1.15]) for (const dz of [-3.2, 3.4]) {
    p.push({ geometry: new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14).rotateZ(Math.PI / 2).translate(dx, 0.5, dz), color: '#141414' });
  }
  return p;
}

// Прямоугольник с картинкой (как vrect в furniture.js) — для вывесок во дворе.
function vquadRect(gb, axis, c, sign, s0, s1, y0, y1, r) {
  const [u0, v0, u1, v1] = r;
  const leftIsS0 = (axis === 'x' && sign > 0) || (axis === 'z' && sign < 0);
  const L = leftIsS0 ? s0 : s1, R = leftIsS0 ? s1 : s0;
  const P = (s, y) => (axis === 'x' ? [s, y, c] : [c, y, s]);
  const n = axis === 'x' ? [0, 0, sign] : [sign, 0, 0];
  gb.quad(P(L, y0), P(R, y0), P(R, y1), P(L, y1), n, [u0, v0, u1, v0, u1, v1, u0, v1], new THREE.Color(1, 1, 1));
}

export { FENCE };
