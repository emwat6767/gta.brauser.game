import * as THREE from 'three';
import { C } from './prison-detail-lib.js';
import { wallFrames } from './prison-detail-areas.js';
import { GeometryBuilder } from './geometry.js';

// Улица: двор (кольца, железо, столы, трибуна, прожекторные мачты), сетка двора, периметр (пилястры, кронштейны под колючку,
// камеры), угловые вышки. Детали склеиваются в большие меши (prison-props.js), коллайдеры остаются в prison-build.js.

const WARN = { bg: '#7a1414', fg: '#ffffff', frame: '#ffffff' };
const SIGN = { bg: '#1f3350', fg: '#f2f2f2', frame: '#d9b13b' };

export function detailYard(ctx) {
  const { kit, lib, fur, H0, paint, plates, solid } = ctx;
  const pick = fur.pick;
  const Y0 = H0 + 0.03;
  kit.use('yard', 120);

  // ---- баскетбольные кольца: стойка с мягкой обкладкой, кронштейн, щит со стеклом, кольцо, сетка
  for (const sx of [0, 1]) {
    const hx = sx ? 27.4 : 12.6, nx = sx ? -1 : 1;
    const f = kit.frame(hx - nx * 0.3, -11, nx > 0 ? Math.PI / 2 : -Math.PI / 2, 0);    // +z рамки — к площадке
    f.cyl(0.2, 0.2, 1.7, 0, 0.85, 0, '#2d5d9b', 12);
    f.cyl(0.21, 0.21, 0.06, 0, 1.7, 0, '#1e3f6b', 12);
    f.cyl(0.09, 0.1, 3.5, 0, 1.75, 0, '#3a3f46', 10, 'steel');
    f.box(0.7, 0.14, 0.7, 0, 0.07, 0, '#8a8a84');
    f.box(0.14, 0.14, 0.45, 0, 3.32, 0.2, '#3a3f46', 'steel');
    f.bar(0, 2.35, 0.05, 0, 3.0, 0.3, 0.07, '#3a3f46', 'steel');
    f.box(1.84, 1.09, 0.04, 0, 3.3, 0.27, '#2b2f35', 'steel');
    f.box(1.76, 1.01, 0.025, 0, 3.3, 0.3, '#cfe8f5', 'glass');
    f.box(0.6, 0.02, 0.012, 0, 3.0, 0.32, '#e8e8e8');
    f.box(0.6, 0.02, 0.012, 0, 3.4, 0.32, '#e8e8e8');
    f.box(0.02, 0.42, 0.012, -0.3, 3.2, 0.32, '#e8e8e8');
    f.box(0.02, 0.42, 0.012, 0.3, 3.2, 0.32, '#e8e8e8');
    f.box(0.5, 0.02, 0.012, 0, 2.78, 0.32, '#c0392b');
    f.torus(0.23, 0.014, 0, 3.05, 0.55, '#e2670a', 'y', 'steel', 16, 4);
    f.box(0.04, 0.04, 0.2, 0, 3.05, 0.36, '#e2670a', 'steel');
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      f.bar(Math.sin(a) * 0.23, 3.04, 0.55 + Math.cos(a) * 0.23, Math.sin(a + 0.25) * 0.13, 2.62, 0.55 + Math.cos(a + 0.25) * 0.13, 0.008, '#eeeeea', 'matte');
    }
    f.torus(0.18, 0.008, 0, 2.83, 0.55, '#eeeeea', 'y', 'matte', 10, 3);
    f.torus(0.13, 0.008, 0, 2.62, 0.55, '#eeeeea', 'y', 'matte', 10, 3);
  }
  // мяч у кольца и ещё один на площадке
  for (const [x, z] of [[14.0, -9.2], [24.4, -13.4]]) {
    const f = kit.frame(x, z, 0, Y0);
    f.sph(0.12, 0, 0.12, 0, '#d9701a', 1, 1, 1, 'matte', 10);
    f.torus(0.119, 0.006, 0, 0.12, 0, '#222', 'y', 'matte', 10, 3);
  }

  // ---- железо: скамьи со стойками и штангами, блины на дисках, гантельный ряд, перекладины
  for (let k = 0; k < 3; k++) {
    const f = kit.frame(13 + k * 4.2, 9, 0, Y0);                  // голова скамьи у +z
    f.box(0.32, 0.09, 1.3, 0, 0.45, 0, '#1c1f24');
    f.box(0.34, 0.03, 1.32, 0, 0.405, 0, '#2b2f35', 'steel');
    f.box(0.5, 0.05, 0.06, 0, 0.18, -0.55, C.steelDk, 'steel');
    f.box(0.5, 0.05, 0.06, 0, 0.18, 0.5, C.steelDk, 'steel');
    for (const sx2 of [-1, 1]) {
      f.box(0.06, 0.4, 0.06, sx2 * 0.2, 0.2, -0.55, C.steelDk, 'steel');
      f.box(0.06, 0.4, 0.06, sx2 * 0.2, 0.2, 0.5, C.steelDk, 'steel');
      f.box(0.06, 0.95, 0.06, sx2 * 0.45, 0.48, 0.58, '#c0392b', 'steel');
      f.box(0.14, 0.04, 0.06, sx2 * 0.4, 0.98, 0.58, '#c0392b', 'steel');
      f.box(0.06, 0.3, 0.06, sx2 * 0.45, 0.2, 0.28, '#c0392b', 'steel');
      f.box(0.5, 0.05, 0.06, sx2 * 0.45, 0.03, 0.43, '#c0392b', 'steel');
    }
    f.pipe(0.018, 2.2, 'x', 0, 1.02, 0.58, '#cfd6dc', 8, 'steel');
    for (const sx2 of [-1, 1]) {
      f.pipe(0.2, 0.08, 'x', sx2 * 0.88, 1.02, 0.58, '#16181b', 14, 'matte');
      f.pipe(0.16, 0.08, 'x', sx2 * 0.98, 1.02, 0.58, '#2b4a8a', 14, 'matte');
      f.pipe(0.03, 0.14, 'x', sx2 * 1.1, 1.02, 0.58, '#cfd6dc', 6, 'steel');
    }
  }
  // стопки блинов на земле и стойка с гантелями
  for (const [x, z, n] of [[28.0, 3.0, 5], [28.6, 3.6, 4], [27.5, 3.9, 3]]) {
    const f = kit.frame(x, z, 0, Y0);
    for (let i = 0; i < n; i++) f.cyl(0.3 - (i % 2) * 0.03, 0.3 - (i % 2) * 0.03, 0.06, 0, 0.03 + i * 0.062, 0, i % 2 ? '#1c1f24' : '#2b2f35', 14);
    f.cyl(0.03, 0.03, 0.08 + n * 0.062, 0, 0.04 + n * 0.031, 0, '#cfd6dc', 6, 'steel');
  }
  {
    const f = kit.frame(18.5, 12.6, 0, Y0);
    f.box(2.0, 0.05, 0.5, 0, 0.5, 0, '#3a424b', 'steel');
    f.box(2.0, 0.05, 0.5, 0, 0.9, 0, '#3a424b', 'steel');
    for (const sx2 of [-1, 1]) f.box(0.06, 0.95, 0.5, sx2 * 0.98, 0.48, 0, '#3a424b', 'steel');
    for (let t = 0; t < 2; t++) for (let k = 0; k < 6; k++) {
      const x = -0.85 + k * 0.34, y = t ? 0.99 : 0.59, r = 0.05 + k * 0.006;
      f.pipe(0.015, 0.14, 'x', x, y + r * 0.0, 0, '#cfd6dc', 6, 'steel');
      f.sph(r, x - 0.08, y, 0, '#16181b', 0.7, 1, 1, 'matte', 6);
      f.sph(r, x + 0.08, y, 0, '#16181b', 0.7, 1, 1, 'matte', 6);
    }
    solid(17.5, 12.3, 19.5, 12.9, 1.0, { type: 'barrier' });
  }
  {
    // турник и брусья вдоль сетки двора
    const f = kit.frame(30.2, 13.0, Math.PI / 2, Y0);
    for (const sx2 of [-1.0, 1.0]) f.cyl(0.05, 0.05, 2.5, sx2 * 1.2, 1.25, 0, '#9aa5af', 8, 'steel');
    f.pipe(0.025, 2.5, 'x', 0, 2.5, 0, '#cfd6dc', 8, 'steel');
    f.pipe(0.025, 2.5, 'x', 0, 2.0, 0.0, '#cfd6dc', 8, 'steel');
    for (const sx2 of [-1.0, 1.0]) f.bar(sx2 * 1.2, 0.2, 0, sx2 * 1.2, 0.2, 0.6, 0.04, '#9aa5af', 'steel');
    const g = kit.frame(30.2, 8.0, Math.PI / 2, Y0);
    for (const sx2 of [-1, 1]) for (const sz of [-0.55, 0.55]) g.cyl(0.04, 0.04, 1.1, sz, 0.55, sx2 * 0.35 + 0.0, '#9aa5af', 8, 'steel');
    for (const sx2 of [-1, 1]) g.pipe(0.03, 1.4, 'x', 0, 1.1, sx2 * 0.35, '#cfd6dc', 8, 'steel');
  }

  // ---- столы для шашек и карт: бетонная плита на опорах, лавки, шашечная доска и колода
  [[9.5, -8], [9.5, -4], [9.5, 12], [9.5, 15]].forEach(([x, z], i) => {
    const f = kit.frame(x, z, 0, Y0);
    f.box(1.8, 0.08, 0.7, 0, 0.76, 0, '#a89f8a');
    f.box(1.84, 0.03, 0.74, 0, 0.72, 0, '#7d7461');
    for (const sx2 of [-1, 1]) {
      f.box(0.1, 0.72, 0.1, sx2 * 0.78, 0.36, 0, '#8a8a84');
      f.box(0.1, 0.06, 1.7, sx2 * 0.78, 0.2, 0, '#8a8a84');
    }
    for (const sz of [-1, 1]) {
      f.box(1.8, 0.07, 0.28, 0, 0.45, sz * 0.6, '#9b8f78');
      f.box(1.8, 0.03, 0.04, 0, 0.4, sz * 0.46, '#6a6254');
    }
    if (i < 2) {
      // шашечная доска 6 x 6
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
        paint.flat(x - 0.18 + c * 0.06, z - 0.18 + r * 0.06, x - 0.12 + c * 0.06, z - 0.12 + r * 0.06, Y0 + 0.805, (r + c) % 2 ? '#2a2d30' : '#d9d2b8');
      }
      for (let k = 0; k < 6; k++) {
        f.cyl(0.022, 0.022, 0.014, -0.13 + (k % 3) * 0.12, 0.822, -0.14 + Math.floor(k / 3) * 0.06, '#b3261e', 8);
        f.cyl(0.022, 0.022, 0.014, -0.07 + (k % 3) * 0.12, 0.822, 0.1 + Math.floor(k / 3) * 0.06, '#1c1f24', 8);
      }
    } else {
      f.box(0.1, 0.012, 0.14, -0.3, 0.806, 0.1, '#e8e3d2');
      f.box(0.1, 0.012, 0.14, -0.15, 0.806, 0.1, '#d9d2b8');
      for (let k = 0; k < 5; k++) f.cyl(0.035, 0.035, 0.014, 0.35 + (k % 2) * 0.07, 0.806 + Math.floor(k / 2) * 0.014, 0.0, [C.red, C.blue, C.green, C.black, C.yellow][k], 8);
    }
    f.box(0.18, 0.004, 0.12, 0.6, 0.802, -0.15, '#e9e2c8');
  });

  // ---- трибуна у стены библиотеки: три яруса (выше к стене), боковины, поручень
  {
    const f = kit.frame(7.6, 8, 0, Y0);
    for (const [dx, y] of [[-0.6, 0.63], [0.0, 0.45], [0.6, 0.27]]) {
      f.box(0.5, 0.05, 8.0, dx, y, 0, '#9b8f78');
      f.box(0.04, y, 7.9, dx + 0.23, y / 2, 0, '#6a6254');
    }
    for (const sz of [-1, 1]) {
      f.box(1.9, 0.06, 0.08, 0, 0.05, sz * 3.95, '#4a4f56', 'steel');
      f.bar(0.6, 0.15, sz * 3.95, -0.6, 0.55, sz * 3.95, 0.07, '#4a4f56', 'steel');
      f.box(0.06, 1.0, 0.06, -0.95, 0.5, sz * 3.95, '#4a4f56', 'steel');
    }
    f.pipe(0.025, 7.9, 'z', -0.95, 1.0, 0.0, '#9aa5af', 8, 'steel');
    for (const dz of [-2.0, 0, 2.0]) f.box(0.05, 0.9, 0.05, -0.95, 0.45, dz, '#6a6254');
    plates.add('ТРИБУНА', 6.04, Y0 + 2.2, 8, 1, 0, 1.2, 0.3, SIGN);
  }

  // ---- прожекторные мачты (4) со светильниками; бачки; питьевой фонтанчик
  for (const [x, z, sz] of [[10, -19, 1], [30, -19, 1], [10, 16.5, -1], [30, 16.5, -1]]) {
    const f = kit.frame(x, z, 0, 0);
    f.box(0.7, 0.2, 0.7, 0, 0.1, 0, '#8a8a84');
    f.cyl(0.1, 0.17, 9.0, 0, 4.7, 0, '#5a6068', 8, 'steel');
    f.box(2.4, 0.1, 0.1, 0, 9.2, 0, '#3a3f46', 'steel');
    f.box(2.4, 0.1, 0.1, 0, 9.55, 0, '#3a3f46', 'steel');
    for (const lx of [-1.0, -0.5, 0, 0.5, 1.0]) for (const ly of [9.2, 9.55]) {
      const h = f.sub(lx, 0, sz > 0 ? 0 : Math.PI);
      h.box(0.38, 0.28, 0.2, 0, ly, 0, '#2b2f35', 'steel');
      h.box(0.32, 0.22, 0.02, 0, ly, 0.11, '#fff3d0', 'glowW');
    }
    f.box(0.4, 0.1, 0.4, 0, 9.85, 0, '#c0392b', 'steel');
    solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 9.0, { type: 'barrier' });
  }
  lib.bin(kit.frame(8.0, -15.0, 0, Y0), 0, 0, '#2f5d3a');
  lib.bin(kit.frame(8.4, 2.0, 0, Y0), 0, 0, '#2f5d3a');
  lib.bin(kit.frame(10.8, 13.5, 0, Y0), 0, 0, '#2f5d3a');
  lib.bin(kit.frame(29.2, -6.0, 0, Y0), 0, 0, '#2f5d3a');
  lib.fountain(kit.frame(6.7, -6.0, Math.PI / 2, Y0), 0, 0);
  fur.cone(kit.frame(12.0, -19.2, 0, Y0), 0, 0);
  // разметка: линия предупреждения вдоль сетки (по 8 штрихов), дорожки у столов
  for (let z = -19.5; z < 19.5; z += 1.2) paint.flat(30.82, z, 30.94, z + 0.7, Y0 + 0.005, '#c0392b');
  paint.flat(30.9, -19.5, 31.0, 19.5, Y0 + 0.003, '#e8c23a');
  paint.flat(8.2, -9.0, 10.8, -2.9, Y0 + 0.004, '#8a857a');
  paint.flat(8.2, 11.0, 10.8, 16.0, Y0 + 0.004, '#8a857a');
  paint.flat(7.1, 4.0, 8.9, 12.0, Y0 + 0.003, '#8a857a');
  plates.add('ПРОГУЛКА 09:00–17:00 · ДВОР', 6.04, Y0 + 3.1, 14, 1, 0, 2.2, 0.3, SIGN);
  void pick;
}

export function detailFence(ctx) {
  const { kit, H0, plates, paint } = ctx;
  const Y0 = H0 + 0.03;
  kit.use('fence', 140);
  const FX = 32;
  // бетонный бордюр под сеткой, колпачки стоек, Y-кронштейны наружу и внутрь, средняя перекладина, нижняя проволока
  kit.prim.box(0.34, 0.2, 40, FX, Y0 + 0.1, 0, '#8a8a84');
  for (let z = -20; z <= 20; z += 4) {
    const f = kit.frame(FX, z, 0, Y0);
    f.box(0.4, 0.2, 0.4, 0, 0.1, 0, '#7d7d78');
    f.cyl(0.08, 0.09, 4.0, 0, 2.0, 0, '#6a7078', 8, 'steel');
    f.box(0.24, 0.1, 0.24, 0, 4.05, 0, '#3a3f46', 'steel');
    f.bar(0, 3.95, 0, -0.65, 4.65, 0, 0.07, '#3a3f46', 'steel');
    f.bar(0, 3.95, 0, 0.65, 4.65, 0, 0.07, '#3a3f46', 'steel');
    f.box(0.12, 0.12, 0.12, 0.65, 4.7, 0, '#9aa5af', 'steel');
    f.box(0.12, 0.12, 0.12, -0.65, 4.7, 0, '#9aa5af', 'steel');
  }
  for (const y of [0.35, 1.8]) kit.prim.box(0.05, 0.05, 40, FX, Y0 + y, 0, '#6a7078', 0, 'steel');
  kit.prim.pipe(0.05, 40, 'z', FX, Y0 + 3.7, 0, '#6a7078', 8, 'steel');
  for (const dx of [-0.65, 0.65]) kit.prim.box(0.03, 0.03, 40, FX + dx, Y0 + 4.7, 0, '#9aa5af', 0, 'steel');
  for (let z = -18; z <= 18; z += 12) {
    plates.add('ЗАПРЕТНАЯ ЗОНА · СТРЕЛЯЕМ БЕЗ ПРЕДУПРЕЖДЕНИЯ', FX - 0.12, Y0 + 2.4, z, -1, 0, 3.0, 0.34, WARN);
    plates.add('ЗАПРЕТНАЯ ЗОНА · СТРЕЛЯЕМ БЕЗ ПРЕДУПРЕЖДЕНИЯ', FX + 0.12, Y0 + 2.4, z, 1, 0, 3.0, 0.34, WARN);
  }
  void paint;
}

export function detailPerimeter(ctx) {
  const { kit, lib, fur, H0, WALL_H, paint, plates, rng } = ctx;
  const Y0 = H0 + 0.03;
  const sides = [
    { id: 'wallN', zone: 'zlo', wall: -36, a: -36, b: 36, out: -37.5 },
    { id: 'wallW', zone: 'xlo', wall: -36, a: -36, b: 36, out: -37.5 },
    { id: 'wallE', zone: 'xhi', wall: 36, a: -36, b: 36, out: 37.5 },
    { id: 'wallS', zone: 'zhi', wall: 36, a: -36, b: 36, out: 37.5 },
  ];
  const wf = wallFrames(kit, 0);
  for (const s of sides) {
    kit.use(s.id, 150);
    // frame along the wall on the inner side; for 'z*' zones the along coordinate runs along x, otherwise along z
    const gate = (a) => s.id === 'wallS' && Math.abs(a) < 3.4;
    for (let a = s.a + 3; a <= s.b - 3; a += 6) {
      if (gate(a)) continue;
      const f = wf(s.zone, s.wall, a);
      f.box(0.3, WALL_H - 0.4, 0.55, 0.15, (WALL_H - 0.4) / 2, 0, '#9a9a94');
      f.box(0.36, 0.2, 0.7, 0.18, WALL_H - 0.35, 0, '#8a8a84');
      f.box(0.4, 0.5, 0.7, 0.2, 0.25, 0, '#82827d');
    }
    // Y-кронштейны и проволока по верху стены (внутрь и наружу), на каждые 4 м
    const dir = s.out > 0 ? 1 : -1;
    for (let a = s.a + 2; a <= s.b - 1; a += 4) {
      if (gate(a)) continue;
      const mid = (s.wall + s.out) / 2;
      const f = s.id === 'wallN' || s.id === 'wallS' ? kit.frame(a, mid, Math.PI / 2, 0) : kit.frame(mid, a, 0, 0);
      f.box(0.08, 0.7, 0.08, 0, WALL_H + 0.35, 0, '#3a3f46', 'steel');
      f.bar(0, WALL_H + 0.65, 0, -0.5, WALL_H + 1.05, 0, 0.05, '#3a3f46', 'steel');
      f.bar(0, WALL_H + 0.65, 0, 0.5, WALL_H + 1.05, 0, 0.05, '#3a3f46', 'steel');
    }
    for (const o of [-0.5, 0, 0.5]) {
      const a0 = s.a, a1 = s.b;
      const mid = (s.wall + s.out) / 2 + o * dir;
      const y = WALL_H + (o === 0 ? 0.7 : 1.05);
      if (s.id === 'wallN' || s.id === 'wallS') {
        if (s.id === 'wallS') { kit.prim.box(36 - 3.4, 0.03, 0.03, (a0 + (-3.4)) / 2, y, mid, '#9aa5af', 0, 'steel'); kit.prim.box(36 - 3.4, 0.03, 0.03, (3.4 + a1) / 2, y, mid, '#9aa5af', 0, 'steel'); }
        else kit.prim.box(a1 - a0, 0.03, 0.03, 0, y, mid, '#9aa5af', 0, 'steel');
      } else kit.prim.box(0.03, 0.03, a1 - a0, mid, y, 0, '#9aa5af', 0, 'steel');
    }
  }
  // предупредительные плакаты внутри и номера секторов снаружи
  kit.use('wallN', 150);
  for (let x = -24; x <= 24; x += 16) plates.add('ПЕРИМЕТР · ПРОХОД ЗАПРЕЩЁН', x, 3.0, -35.96, 0, 1, 2.4, 0.3, WARN);
  kit.use('wallS', 150);
  for (let x = -24; x <= 24; x += 16) { if (Math.abs(x) < 6) continue; plates.add('ПЕРИМЕТР · ПРОХОД ЗАПРЕЩЁН', x, 3.0, 35.96, 0, -1, 2.4, 0.3, WARN); }
  for (let z = -24; z <= 24; z += 16) {
    plates.add('ПЕРИМЕТР · ПРОХОД ЗАПРЕЩЁН', -35.96, 3.0, z, 1, 0, 2.4, 0.3, WARN);
    plates.add('ПЕРИМЕТР · ПРОХОД ЗАПРЕЩЁН', 35.96, 3.0, z, -1, 0, 2.4, 0.3, WARN);
  }
  // снаружи: «СЕКТОР n», «НЕ ПРИБЛИЖАТЬСЯ»
  const outer = [['N', 0, -37.55, 0, -1], ['W', -37.55, 0, -1, 0], ['E', 37.55, 0, 1, 0]];
  outer.forEach(([name, x, z, nx, nz], i) => {
    for (const k of [-1, 1]) {
      plates.add(`ПРАВИТЕЛЬСТВЕННОЕ УЧРЕЖДЕНИЕ · ВХОД ЗАПРЕЩЁН · СЕКТОР ${name}${k > 0 ? 2 : 1}`, nz ? k * 18 : x, 3.2, nx ? k * 18 : z, nx, nz, 4.2, 0.5, WARN);
    }
    void i;
  });
  // камеры на столбах по периметру коридора охраны и прожекторные короба
  for (const [x, z, ang] of [[-34, 0, Math.PI / 2], [34, 0, -Math.PI / 2], [0, -34, 0], [-34, -18, Math.PI / 2], [34, 18, -Math.PI / 2], [-34, 18, Math.PI / 2], [34, -18, -Math.PI / 2], [-18, 34, Math.PI], [18, 34, Math.PI], [-18, -34, 0], [18, -34, 0]]) {
    kit.use(Math.abs(x) > Math.abs(z) ? (x < 0 ? 'wallW' : 'wallE') : z < 0 ? 'wallN' : 'wallS', 150);
    const f = kit.frame(x, z, 0, 0);
    f.cyl(0.07, 0.1, 5.0, 0, 2.5, 0, '#5a6068', 8, 'steel');
    f.box(0.5, 0.2, 0.5, 0, 0.1, 0, '#8a8a84');
    lib.camera(f.sub(0, 0, ang), 0, 5.0, 0, 0);
    f.box(0.3, 0.2, 0.3, 0, 4.7, 0, '#3a424b', 'steel');
    f.box(0.26, 0.16, 0.02, 0, 4.7, 0.16, '#fff3d0', 'glowW');
  }
  // линия патруля по коридору охраны
  const mk = [[-34, -36, -34, 36], [34, -36, 34, 36], [-36, -34, 36, -34], [-36, 34, 36, 34]];
  for (const [x0, z0, x1, z1] of mk) {
    const vertical = x0 === x1;
    for (let t = -33; t < 33; t += 3) {
      if (vertical) paint.flat(x0 - 0.05, t, x0 + 0.05, t + 1.4, Y0 + 0.006, '#d9d4c0');
      else paint.flat(t, z0 - 0.05, t + 1.4, z1 + 0.05, Y0 + 0.006, '#d9d4c0');
    }
  }
  void fur; void rng;
}

export function detailTowers(ctx) {
  const { kit, lib, fur, plates, towers } = ctx;
  towers.forEach((t, i) => {
    kit.use(`tower${i}`, 260);
    const f = kit.frame(t.x, t.z, 0, 0);
    const sx = t.sx, sz = t.sz;
    const lx = 1.4;
    // опоры: стальные трубы на бетонных башмаках
    for (const dx of [-lx, lx]) for (const dz of [-lx, lx]) {
      f.box(0.9, 0.35, 0.9, dx, 0.17, dz, '#8a8a84');
      f.cyl(0.14, 0.17, 8.6, dx, 4.45, dz, '#59616a', 10, 'steel');
      f.cyl(0.19, 0.19, 0.12, dx, 8.6, dz, '#3a3f46', 10, 'steel');
    }
    // раскосы X в три пролёта на всех четырёх гранях и поясные балки
    const levels = [0.35, 3.05, 5.75, 8.5];
    for (let k = 0; k < 3; k++) {
      const y0 = levels[k], y1 = levels[k + 1];
      for (const sgn of [-1, 1]) {
        f.bar(-lx, y0, sgn * lx, lx, y1, sgn * lx, 0.09, '#4a5159', 'steel');
        f.bar(lx, y0, sgn * lx, -lx, y1, sgn * lx, 0.09, '#4a5159', 'steel');
        f.bar(sgn * lx, y0, -lx, sgn * lx, y1, lx, 0.09, '#4a5159', 'steel');
        f.bar(sgn * lx, y0, lx, sgn * lx, y1, -lx, 0.09, '#4a5159', 'steel');
      }
      if (k > 0) for (const sgn of [-1, 1]) {
        f.box(2 * lx + 0.2, 0.12, 0.12, 0, y0, sgn * lx, '#3a3f46', 'steel');
        f.box(0.12, 0.12, 2 * lx + 0.2, sgn * lx, y0, 0, '#3a3f46', 'steel');
      }
    }
    // площадка: настил, балки, ограждение
    f.box(3.9, 0.2, 3.9, 0, 8.7, 0, '#3a3e44', 'steel');
    f.box(3.96, 0.3, 0.14, 0, 8.55, 1.95, '#2b2f35', 'steel');
    f.box(3.96, 0.3, 0.14, 0, 8.55, -1.95, '#2b2f35', 'steel');
    f.box(0.14, 0.3, 3.96, 1.95, 8.55, 0, '#2b2f35', 'steel');
    f.box(0.14, 0.3, 3.96, -1.95, 8.55, 0, '#2b2f35', 'steel');
    // лестница-стремянка с кольцевым ограждением со стороны двора, площадка выхода
    const ix = -sx;                              // сторона к центру тюрьмы по x
    const lf = kit.frame(t.x + ix * 1.95, t.z - sz * 0.0, 0, 0);
    for (const dz of [-0.28, 0.28]) lf.box(0.06, 8.6, 0.05, 0.12 * ix, 4.3, dz, '#9aa5af', 'steel');
    for (let k = 0; k < 28; k++) lf.box(0.05, 0.035, 0.52, 0.12 * ix, 0.3 + k * 0.3, 0, '#cfd6dc', 'steel');
    for (let k = 0; k < 7; k++) lf.torus(0.4, 0.016, 0.38 * ix, 2.7 + k * 0.85, 0, '#9aa5af', 'y', 'steel', 10, 3);
    for (const dz of [-0.32, 0.32]) lf.box(0.03, 5.9, 0.03, 0.78 * ix, 5.6, dz * 1.2, '#9aa5af', 'steel');
    f.box(0.9, 0.12, 1.0, ix * 2.6, 8.76, 0, '#3a3e44', 'steel');
    for (const dz of [-0.5, 0.5]) { f.box(0.05, 1.05, 0.05, ix * 3.0, 9.3, dz, '#9aa5af', 'steel'); }
    f.pipe(0.025, 1.0, 'z', ix * 3.0, 9.8, 0, '#9aa5af', 8, 'steel');
    f.pipe(0.025, 1.0, 'z', ix * 3.0, 9.45, 0, '#9aa5af', 8, 'steel');
    for (const sgn of [-1, 1]) f.pipe(0.025, 0.9, 'x', ix * 2.55, 9.8, sgn * 0.5, '#9aa5af', 8, 'steel');
    for (const sgn of [-1, 1]) f.pipe(0.025, 0.9, 'x', ix * 2.55, 9.45, sgn * 0.5, '#9aa5af', 8, 'steel');
    // кабина: нижняя панель, остекление с импостами, крыша с карнизом
    const FL = 8.8, CW = 1.7;
    for (const [dx, dz, w, d] of [[0, CW, 2 * CW + 0.1, 0.14], [0, -CW, 2 * CW + 0.1, 0.14], [CW, 0, 0.14, 2 * CW + 0.1], [-CW, 0, 0.14, 2 * CW + 0.1]]) {
      f.box(w, 0.85, d, dx, FL + 0.43, dz, '#8d8f8a');
      f.box(w + 0.02, 0.07, d + 0.06, dx, FL + 0.88, dz, '#6f716f');
    }
    for (const [dx, dz] of [[CW, CW], [CW, -CW], [-CW, CW], [-CW, -CW]]) f.box(0.18, 2.1, 0.18, dx, FL + 1.05, dz, '#3a3e44', 'steel');
    for (const sgn of [-1, 1]) {
      f.box(2 * CW, 1.1, 0.03, 0, FL + 1.5, sgn * CW, '#16222f', 'glass');
      f.box(0.03, 1.1, 2 * CW, sgn * CW, FL + 1.5, 0, '#16222f', 'glass');
      for (const m of [-0.85, 0, 0.85]) {
        f.box(0.06, 1.1, 0.06, m, FL + 1.5, sgn * CW, '#3a3e44', 'steel');
        f.box(0.06, 1.1, 0.06, sgn * CW, FL + 1.5, m, '#3a3e44', 'steel');
      }
    }
    f.box(2 * CW + 0.2, 0.06, 0.1, 0, FL + 1.98, CW, '#3a3e44', 'steel');
    f.box(2 * CW + 0.2, 0.06, 0.1, 0, FL + 1.98, -CW, '#3a3e44', 'steel');
    f.box(4.5, 0.18, 4.5, 0, FL + 2.17, 0, '#30343a');
    f.box(4.6, 0.08, 4.6, 0, FL + 2.31, 0, '#4a4f56', 'steel');
    f.box(4.6, 0.1, 0.1, 0, FL + 2.05, 2.25, '#2b2f35', 'steel');
    f.box(4.6, 0.1, 0.1, 0, FL + 2.05, -2.25, '#2b2f35', 'steel');
    // дверь на внутреннем фасаде
    f.box(0.05, 1.7, 0.8, ix * 1.76, FL + 0.95, 0.0, '#2b2f35', 'steel');
    f.box(0.07, 0.06, 0.2, ix * 1.8, FL + 0.95, -0.28, C.steelLt, 'steel');
    // внутри: пульт, кресло, стойка
    const c = kit.frame(t.x, t.z, 0, FL);
    fur.chair(c, 0, 0, '#2b2f36', true);
    const k = c.sub(0, sz * 1.2, sz > 0 ? Math.PI : 0);
    k.box(1.6, 0.06, 0.5, 0, 0.78, 0, '#4a4f56', 'steel');
    k.box(1.6, 0.76, 0.1, 0, 0.38, -0.2, '#3a3f46', 'steel');
    k.box(0.4, 0.26, 0.03, -0.4, 1.05, 0.0, '#8fb4ff', 'glowS');
    k.box(0.4, 0.26, 0.03, 0.4, 1.05, 0.0, '#3aff7a', 'glowG');
    f.box(0.5, 0.04, 0.5, 0, FL + 2.04, 0, '#fff3d0', 'glowW');
    // крыша: радиоантенна, спутниковая тарелка, кондиционер, предупредительная лампа и прожектор по центру
    f.cyl(0.02, 0.025, 2.6, ix * -1.5, FL + 3.6, -sz * 1.5, '#cfd6dc', 6, 'steel');
    for (const h of [0.6, 1.0, 1.4]) f.box(0.7 - h * 0.2, 0.02, 0.02, ix * -1.5, FL + 3.3 + h, -sz * 1.5, '#cfd6dc', 'steel');
    f.sph(0.05, ix * -1.5, FL + 4.95, -sz * 1.5, '#ff3a2a', 1, 1, 1, 'glowR', 6);
    f.box(0.8, 0.5, 0.6, ix * 1.3, FL + 2.7, -sz * 1.3, '#d7dde2', 'steel');
    f.box(0.7, 0.4, 0.02, ix * 1.3, FL + 2.7, -sz * 1.3 + sz * 0.31 * -1, '#59636d', 'steel');
    f.sph(0.3, ix * 0.3, FL + 2.6, -sz * 1.4, '#e8edf0', 1, 0.3, 1, 'steel', 10);
    f.cyl(0.03, 0.03, 0.4, ix * 0.3, FL + 2.5, -sz * 1.4, '#9aa5af', 6, 'steel');
    f.cyl(0.35, 0.4, 0.42, 0, FL + 2.7, 0, '#2b2f35', 12, 'steel');
    f.cyl(0.42, 0.42, 0.06, 0, FL + 2.95, 0, '#59636d', 12, 'steel');
    f.torus(0.43, 0.04, 0, FL + 3.0, 0, '#fff3d0', 'y', 'glowW', 14, 4);
    plates.add(`ВЫШКА №${i + 1}`, t.x + ix * 1.78, FL + 0.55, t.z + 0.0, ix, 0, 0.7, 0.22, SIGN);
    void lib;
  });
}

// Фонари над дверями и пятна света на земле (ночью): лампы — детали chunk 'lamps', пятна — один аддитивный меш
// с радиальным градиентом, обрезанный по прямоугольникам (чтобы свет не «просачивался» внутрь зданий).
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.16)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DOORS = [
  // [x, z, nx, nz] — наружная грань стены у двери и нормаль наружу (локальные координаты)
  [-27, 20, 0, -1], [-18.5, 20, 0, -1], [-11.5, 20, 0, -1], [-5.25, 20, 0, -1], [5.25, 20, 0, -1], [14, 20, 0, -1], [26, 20, 0, -1],
  [-16, -12, 1, 0], [-16, 8, 1, 0], [-15, -20, 0, 1],
  [-14, -11, -1, 0], [6, -11, 1, 0], [-7, -4, 0, 1],
  [8, -20, 0, 1], [15, -20, 0, 1], [26, -20, 0, 1],
  [-14, 7, -1, 0], [-8, -2, 0, -1], [6, 9, 1, 0],
];

export function detailNightLights(ctx) {
  const { kit, group, world, toWorld, H0 } = ctx;
  kit.use('lamps', 110);
  const pools = [];     // { cx, cz, r, clip: [x0, z0, x1, z1], k }
  for (const [x, z, nx, nz] of DOORS) {
    // светильник над дверью: кронштейн, корпус, светящаяся линза
    const along = (dx) => (nz ? [x + dx, z] : [x, z + dx]);
    const [lx, lz] = along(0);
    const bx = lx + nx * 0.14, bz = lz + nz * 0.14;
    kit.prim.box(nz ? 0.4 : 0.16, 0.06, nz ? 0.16 : 0.4, lx + nx * 0.08, 3.25, lz + nz * 0.08, '#2b2f35', 0, 'steel');
    kit.prim.box(nz ? 0.34 : 0.22, 0.2, nz ? 0.22 : 0.34, bx, 3.1, bz, '#3a3f46', 0, 'steel');
    kit.prim.box(nz ? 0.26 : 0.02, 0.12, nz ? 0.02 : 0.26, bx + nx * 0.115, 3.1, bz + nz * 0.115, '#fff3d0', 0, 'glowW');
    kit.prim.box(nz ? 0.3 : 0.2, 0.025, nz ? 0.2 : 0.3, bx, 3.22, bz, '#23272c', 0, 'steel');
    // пятно света: круг перед дверью, только в полуплоскости наружу
    const r = 2.6, off = 1.4;
    const pcx = x + nx * off, pcz = z + nz * off;
    let clip = [pcx - r, pcz - r, pcx + r, pcz + r];
    if (nx > 0) clip[0] = Math.max(clip[0], x);
    if (nx < 0) clip[2] = Math.min(clip[2], x);
    if (nz > 0) clip[1] = Math.max(clip[1], z);
    if (nz < 0) clip[3] = Math.min(clip[3], z);
    pools.push({ cx: pcx, cz: pcz, r, clip, k: 0.9 });
  }
  // прожекторы двора и коридора охраны, въезд
  for (const [x, z] of [[10, -19], [30, -19], [10, 16.5], [30, 16.5]]) pools.push({ cx: x, cz: z + (z < 0 ? 5 : -5), r: 10, clip: [6.2, -19.8, 31.8, 17.8], k: 0.75 });
  pools.push({ cx: 20, cz: -11, r: 9, clip: [12, -18, 28, -4], k: 0.45 });
  for (let t = -30; t <= 30; t += 12) {
    pools.push({ cx: t, cz: -33.4, r: 6.5, clip: [-36, -36, 36, -32], k: 0.8 });
    pools.push({ cx: -33.4, cz: t, r: 6.5, clip: [-36, -32, -32, 32], k: 0.8 });
    pools.push({ cx: 33.4, cz: t, r: 6.5, clip: [32, -32, 36, 32], k: 0.8 });
    if (Math.abs(t) > 6) pools.push({ cx: t, cz: 33.4, r: 6.5, clip: [-36, 32, 36, 36], k: 0.8 });
  }
  pools.push({ cx: 0, cz: 41.5, r: 9.5, clip: [-12, 38, 12, 52], k: 0.32 });
  pools.push({ cx: 0, cz: 31.0, r: 5, clip: [-2.4, 28, 2.4, 35.5], k: 0.5 });
  pools.push({ cx: 0, cz: 23.0, r: 5, clip: [-2.4, 20.5, 2.4, 26.5], k: 0.5 });
  pools.push({ cx: 0, cz: 19.0, r: 12, clip: [-30, 18, 30, 20], k: 0.35 });
  const b = new GeometryBuilder();
  const y = H0 + 0.06;
  const P = (x, zz) => { const [wx, wz] = toWorld(x, zz); return [wx, y, wz]; };
  for (const p of pools) {
    const [x0, z0, x1, z1] = [Math.max(p.clip[0], p.cx - p.r), Math.max(p.clip[1], p.cz - p.r), Math.min(p.clip[2], p.cx + p.r), Math.min(p.clip[3], p.cz + p.r)];
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) continue;
    const u = (x) => (x - (p.cx - p.r)) / (2 * p.r), v = (zz) => (zz - (p.cz - p.r)) / (2 * p.r);
    b.quad(P(x0, z1), P(x1, z1), P(x1, z0), P(x0, z0), [0, 1, 0], [u(x0), v(z1), u(x1), v(z1), u(x1), v(z0), u(x0), v(z0)], new THREE.Color(1, 1, 1).multiplyScalar(p.k));
  }
  if (b.isEmpty) return;
  const mat = new THREE.MeshBasicMaterial({ map: poolTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.name = 'prison-light-pools';
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
  world.glow.push({ mat, base: new THREE.Color(1.0, 0.86, 0.6), day: 0, night: 0.62 });
}
