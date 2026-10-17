import { C } from './prison-detail-lib.js';

// Помещения: столовая, кухня, лавка, прачечная, библиотека. Коллайдеры остаются в prison-build.js, здесь — только вид.

const food = ['#e9dfc0', '#4f8a3a', '#7a4a2a', '#e0802a', '#c9a0d0', '#d9c27a', '#9c3a2a'];

// Поднос с едой: основа, пять отсеков, стаканчик, ложка.
function tray(f, x, z, yaw, pick) {
  const t = f.sub(x, z, yaw);
  t.box(0.42, 0.022, 0.3, 0, 0.805, 0, '#7b8794', 'steel');
  t.box(0.14, 0.03, 0.12, -0.12, 0.822, -0.05, pick(food));
  t.box(0.12, 0.03, 0.1, 0.02, 0.822, -0.06, pick(food));
  t.box(0.1, 0.03, 0.1, 0.14, 0.822, -0.05, pick(food));
  t.box(0.2, 0.03, 0.1, -0.07, 0.822, 0.08, pick(food));
  t.cyl(0.032, 0.026, 0.07, 0.15, 0.845, 0.08, '#e9eef0', 8);
  t.box(0.02, 0.008, 0.12, 0.05, 0.83, 0.1, '#c8ced4', 'steel');
}

export function detailCafe(ctx) {
  const { kit, lib, FLOOR, BUILD_H, paint, plates, rng } = ctx;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  kit.use('cafe');
  // Столы со скамьями на стальных стойках и подносами.
  for (let r = 0; r < 4; r++) {
    for (const x of [-9.5, -1.5]) {
      const z = -15.6 + r * 3.3;
      const f = kit.frame(x, z, 0, FLOOR);
      f.box(5.2, 0.07, 0.8, 0, 0.78, 0, '#c4cad0', 'steel');
      f.box(5.24, 0.03, 0.05, 0, 0.745, 0.41, '#5d6873', 'steel');
      f.box(5.24, 0.03, 0.05, 0, 0.745, -0.41, '#5d6873', 'steel');
      for (const sx of [-1, 1]) {
        const lx = sx * 2.25;
        f.box(0.08, 0.72, 0.06, lx, 0.38, 0.3, C.steelDk, 'steel');
        f.box(0.08, 0.72, 0.06, lx, 0.38, -0.3, C.steelDk, 'steel');
        f.box(0.06, 0.06, 1.46, lx, 0.44, 0, C.steelDk, 'steel');          // поперечина под скамьи
        f.box(0.06, 0.46, 0.06, lx, 0.23, 0.74, C.steelDk, 'steel');
        f.box(0.06, 0.46, 0.06, lx, 0.23, -0.74, C.steelDk, 'steel');
      }
      for (const sz of [-1, 1]) {
        f.box(5.2, 0.06, 0.3, 0, 0.46, sz * 0.7, '#8a929b', 'steel');
        f.box(5.2, 0.015, 0.3, 0, 0.495, sz * 0.7, '#9aa3ab', 'steel');
        for (const k of [-1.9, -0.65, 0.6, 1.85]) if (rng.next() < 0.72) tray(f, k, sz * 0.2, sz > 0 ? Math.PI : 0, pick);
      }
    }
  }
  // Линия раздачи: тумба, паровые ванны с едой, защитный экран, подогрев, лоток для подносов.
  {
    const f = kit.frame(-3.5, -18.4, 0, FLOOR);
    f.box(11, 0.9, 0.9, 0, 0.45, 0, '#a8b0b7', 'steel');
    for (let k = -5; k <= 5; k++) f.box(0.02, 0.8, 0.01, k * 1.0, 0.45, 0.455, '#7f8a95', 'steel');
    f.box(11.2, 0.06, 1.1, 0, 0.93, 0.05, '#cdd3d8', 'steel');
    f.box(11.2, 0.12, 0.08, 0, 0.03, 0.5, '#5d6873', 'steel');
    const pans = ['#e9dfc0', '#4f8a3a', '#7a4a2a', '#e0802a', '#d9c27a'];
    for (let i = 0; i < 5; i++) {
      const x = -4.3 + i * 2.15;
      f.box(1.6, 0.05, 0.62, x, 0.975, -0.02, '#8e99a4', 'steel');
      f.box(1.46, 0.045, 0.5, x, 0.995, -0.02, pans[i]);
      f.box(0.3, 0.05, 0.12, x + 0.45, 1.03, -0.02, pick(food));                // ложка в еде
      f.box(0.03, 0.5, 0.03, x - 0.9, 1.25, 0.5, C.steelDk, 'steel');
      f.box(0.03, 0.5, 0.03, x + 0.9, 1.25, 0.5, C.steelDk, 'steel');
      f.box(1.76, 0.4, 0.02, x, 1.34, 0.5, '#cfe8f5', 'glass');
      f.box(1.7, 0.03, 0.14, x, 1.52, 0.2, '#ffb23a', 'glowA');
      f.box(1.7, 0.03, 0.04, x, 1.52, 0.1, C.steelDk, 'steel');
    }
    f.pipe(0.018, 11, 'x', 0, 0.96, 0.62, C.steelLt, 8, 'steel');
    for (let k = -5; k <= 5; k += 2) f.box(0.04, 0.12, 0.04, k, 0.9, 0.62, C.steelDk, 'steel');
    // стопка подносов в начале линии и горка стаканов
    for (let k = 0; k < 9; k++) f.box(0.42, 0.022, 0.3, 4.9, 1.0 + k * 0.024, 0.08, '#7b8794', 'steel');
    for (let k = 0; k < 6; k++) f.cyl(0.04, 0.032, 0.09, -5.0 + (k % 3) * 0.1, 1.0, -0.25 + Math.floor(k / 3) * 0.1, '#e9eef0', 8);
    // полки за линией: стопки тарелок, кастрюли, половники
    const bf = kit.frame(-3.5, -19.25, 0, FLOOR);
    bf.box(11, 0.05, 0.4, 0, 1.3, 0, '#8e99a4', 'steel');
    bf.box(11, 0.05, 0.4, 0, 1.75, 0, '#8e99a4', 'steel');
    for (let k = 0; k < 9; k++) {
      const x = -4.6 + k * 1.15;
      bf.cyl(0.18, 0.2, 0.24 + (k % 3) * 0.06, x, 1.45, 0, '#9aa5af', 12, 'steel');
      bf.cyl(0.2, 0.2, 0.025, x, 1.57 + (k % 3) * 0.03, 0, '#7b8794', 12, 'steel');
      bf.box(0.5, 0.2, 0.2, x + 0.4, 1.86, 0, k % 2 ? '#e9eef0' : '#d9d2bd');
    }
    for (let k = 0; k < 7; k++) { bf.box(0.02, 0.4, 0.02, -4.2 + k * 1.4, 2.25, 0.18, C.steelDk, 'steel'); bf.cyl(0.07, 0.03, 0.02, -4.2 + k * 1.4, 2.04, 0.18, '#9aa5af', 8, 'steel'); }
  }
  // Раздатка напитков: стол с двумя диспенсерами, ящики стаканов
  {
    const f = kit.frame(4.0, -18.7, 0, FLOOR);
    f.box(1.6, 0.04, 0.6, 0, 0.9, 0, '#cdd3d8', 'steel');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.05, 0.88, 0.05, sx * 0.72, 0.44, sz * 0.25, C.steelDk, 'steel');
    f.cyl(0.17, 0.17, 0.5, -0.4, 1.17, 0, '#e2670a', 12, 'matte');
    f.cyl(0.17, 0.17, 0.5, 0.35, 1.17, 0, '#2d7a8a', 12, 'matte');
    for (const x of [-0.4, 0.35]) { f.box(0.05, 0.05, 0.12, x, 1.0, 0.17, C.steelLt, 'steel'); f.cyl(0.19, 0.19, 0.03, x, 1.44, 0, '#4d5660', 12, 'steel'); }
    f.box(0.5, 0.3, 0.3, 0.2, 0.19 + 0.0, 0.05, '#c9b88a');
  }
  // Урны, часы, огнетушитель, табличка меню, вентиляция, камеры наблюдения, указатели
  lib.bin(kit.frame(-12.9, -6.2, 0, FLOOR), 0, 0);
  lib.bin(kit.frame(-12.9, -17.9, 0, FLOOR), 0, 0);
  lib.bin(kit.frame(5.0, -6.2, 0, FLOOR), 0, 0, '#3f6a4a');
  const N = (x) => kit.frame(x, -19.5, -Math.PI / 2, FLOOR);                // северная стена: в комнату +z
  lib.clock(N(-11.5), 0.03, 3.3, 0);
  lib.vent(N(5.0), 0.02, 3.0, 0, 0.6, 0.35);
  const Ee = (z) => kit.frame(5.5, z, Math.PI, FLOOR);                       // восточная стена: в комнату -x
  lib.extinguisher(Ee(-8), 0.0, 0);
  lib.noticeBoard(Ee(-14), 0.03, 1.8, 0, 1.4, 0.9);
  lib.exitSign(Ee(-11), 0.03, 3.5, 0);
  const W = (z) => kit.frame(-13.5, z, 0, FLOOR);                            // западная стена: в комнату +x
  lib.exitSign(W(-11), 0.03, 3.5, 0);
  lib.camera(kit.frame(-13.2, -19.1, -Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
  lib.camera(kit.frame(5.2, -4.8, Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
  lib.ceilRun('duct', 'x', -13.4, 5.4, -11.0, BUILD_H - FLOOR - 0.32, '#9aa4ad');
  lib.ceilRun('pipe', 'x', -13.4, 5.4, -8.2, BUILD_H - FLOOR - 0.25, '#7a8591');
  lib.ceilRun('pipe', 'x', -13.4, 5.4, -7.6, BUILD_H - FLOOR - 0.25, '#2f6a9a');
  for (let x = -12; x < 5; x += 3) for (const z of [-17, -8]) lib.sprinkler(kit.frame(x, z, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
  paint.flat(-9.3, -17.1, 2.3, -17.0, FLOOR + 0.004, '#e8c23a');
  paint.flat(-8.5, -16.6, -8.4, -16.0, FLOOR + 0.004, '#e8c23a');
  plates.add('МЕНЮ ДНЯ: ОВСЯНКА · КОТЛЕТА С ПЮРЕ · ЧАЙ', -3.5, FLOOR + 2.75, -19.46, 0, 1, 4.2, 0.45, { bg: '#2f3a48', fg: '#ffe9a8', frame: '#c9a227' });
  plates.add('ПОДНОСЫ СДАВАТЬ ЗДЕСЬ', 4.0, FLOOR + 2.35, -19.46, 0, 1, 1.7, 0.3, { bg: '#7a1414', fg: '#ffffff', frame: '#ffffff' });
}

export function detailKitchen(ctx) {
  const { kit, lib, FLOOR, BUILD_H, paint, plates, rng } = ctx;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  kit.use('kitchen');
  const range = (x, z, big) => {
    const f = kit.frame(x, z, 0, FLOOR);
    f.box(2.0, 0.9, 0.9, 0, 0.45, 0, '#aab2b9', 'steel');
    f.box(2.04, 0.05, 0.94, 0, 0.925, 0, '#c4ccd2', 'steel');
    f.box(2.0, 0.42, 0.06, 0, 1.17, -0.42, '#c4ccd2', 'steel');
    for (const sx of [-0.5, 0.5]) {
      f.box(0.8, 0.5, 0.02, sx, 0.4, 0.46, '#8b949d', 'steel');
      f.box(0.6, 0.03, 0.04, sx, 0.62, 0.5, C.steelLt, 'steel');
    }
    for (let k = 0; k < 6; k++) f.cyl(0.03, 0.03, 0.04, -0.8 + k * 0.32, 0.8, 0.47, '#1d2025', 8);
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.2, 0.2]) {
      f.cyl(0.17, 0.17, 0.02, sx, 0.96, sz, '#23272c', 12, 'steel');
      f.torus(0.1, 0.012, sx, 0.972, sz, '#3a3f45', 'y', 'steel', 10, 4);
    }
    // кастрюли
    const pot = (px, pz, r, h) => { f.cyl(r, r * 0.95, h, px, 0.95 + h / 2, pz, '#9aa5af', 14, 'steel'); f.cyl(r * 1.02, r * 1.02, 0.03, px, 0.95 + h, pz, '#7e8993', 14, 'steel'); f.box(r * 2.6, 0.03, 0.04, px, 0.95 + h * 0.8, pz, C.steelDk, 'steel'); f.sph(0.03, px, 0.99 + h, pz, C.black, 1, 1, 1, 'matte', 6); };
    pot(-0.5, -0.2, 0.22, 0.28);
    pot(0.5, 0.2, 0.18, 0.2);
    if (big) { f.cyl(0.4, 0.38, 0.6, 0, 1.25, 0, '#a9b3bc', 16, 'steel'); f.cyl(0.42, 0.42, 0.04, 0, 1.57, 0, '#8e99a4', 16, 'steel'); f.box(0.06, 0.06, 0.2, 0, 1.0, 0.45, C.steelLt, 'steel'); }
    // вытяжной зонт над плитой
    f.box(2.2, 0.35, 1.1, 0, 2.05, -0.02, '#b7c0c8', 'steel');
    f.box(2.2, 0.08, 1.25, 0, 1.86, 0.04, '#9aa5af', 'steel');
    f.box(0.6, 1.4, 0.6, 0, 3.1, -0.2, '#9aa5af', 'steel');
  };
  range(-2, -29.0, false);
  range(4, -29.0, true);
  // мойка-стол между плитами
  {
    const f = kit.frame(1, -29, 0, FLOOR);
    f.box(2.0, 0.08, 0.9, 0, 0.9, 0, '#c4ccd2', 'steel');
    for (const sx of [-0.9, 0.9]) for (const sz of [-0.4, 0.4]) f.box(0.06, 0.88, 0.06, sx, 0.44, sz, C.steelDk, 'steel');
    f.box(1.9, 0.05, 0.8, 0, 0.3, 0, '#9aa5af', 'steel');
    for (const sx of [-0.45, 0.45]) { f.box(0.8, 0.012, 0.6, sx, 0.945, 0.0, '#3a4048', 'steel'); }
    f.cyl(0.025, 0.025, 0.35, 0, 1.12, -0.38, C.steelLt, 8, 'steel');
    f.torus(0.1, 0.02, 0, 1.28, -0.28, C.steelLt, 'x', 'steel', 10, 4);
    f.box(0.06, 0.06, 0.04, -0.12, 1.0, -0.38, '#c0392b');
    f.box(0.06, 0.06, 0.04, 0.12, 1.0, -0.38, '#2d6fb3');
    f.box(2.0, 0.42, 0.06, 0, 1.17, -0.42, '#c4ccd2', 'steel');
  }
  // котёл-плита у восточной стены и столы для нарезки
  {
    const f = kit.frame(8, -29.5, 0, FLOOR);
    f.box(3.4, 0.95, 1.1, 0, 0.475, 0, '#8e99a4', 'steel');
    f.box(3.44, 0.05, 1.14, 0, 0.975, 0, '#c4ccd2', 'steel');
    for (const sx of [-1.0, 0, 1.0]) { f.cyl(0.36, 0.34, 0.34, sx, 1.17, 0, '#a9b3bc', 14, 'steel'); f.cyl(0.38, 0.38, 0.04, sx, 1.36, 0, '#7e8993', 14, 'steel'); f.sph(0.04, sx, 1.41, 0, C.black); }
    f.box(3.4, 0.1, 0.6, 0, 1.9, -0.2, C.steelDk, 'steel');
    for (let k = 0; k < 8; k++) f.box(0.02, 0.35, 0.02, -1.5 + k * 0.43, 1.65, -0.45, C.steelLt, 'steel');
  }
  for (const [x, z] of [[1.5, -24], [5, -24]]) {
    const f = kit.frame(x, z, 0, FLOOR);
    f.box(2.4, 0.06, 1.2, 0, 0.9, 0, '#c4ccd2', 'steel');
    for (const sx of [-1, 1]) for (const sz of [-0.5, 0.5]) f.box(0.06, 0.88, 0.06, sx * 1.1, 0.44, sz, C.steelDk, 'steel');
    f.box(2.2, 0.04, 1.0, 0, 0.3, 0, '#9aa5af', 'steel');
    f.box(0.5, 0.025, 0.35, -0.7, 0.945, 0.1, '#f2f2ee');
    for (let k = 0; k < 5; k++) f.sph(0.06, 0.1 + k * 0.1, 0.98, -0.1, pick(['#d9402a', '#7aa84a', '#e0b030']), 1, 1, 1, 'matte', 8);
    f.cyl(0.22, 0.22, 0.2, 0.8, 1.0, 0.2, '#dfe5e8', 12);
    for (let k = 0; k < 3; k++) f.box(0.5, 0.04, 0.3, -0.7, 0.34 + k * 0.05, -0.1, '#9aa5af', 'steel');
  }
  // стеллаж с банками у западной стены и тележка
  {
    const f = kit.frame(-3.2, -24, 0, FLOOR);
    for (const sz of [-1.6, 1.6]) for (const sx of [-0.2, 0.2]) f.box(0.05, 2.1, 0.05, sx, 1.05, sz, C.steelDk, 'steel');
    for (let k = 0; k < 4; k++) {
      f.box(0.5, 0.04, 3.3, 0, 0.35 + k * 0.5, 0, '#8e99a4', 'steel');
      for (let c = 0; c < 9; c++) f.cyl(0.07, 0.07, 0.2, 0.0 + (c % 2) * 0.12 - 0.06, 0.47 + k * 0.5, -1.45 + c * 0.36, pick(['#c0392b', '#e0b030', '#4a8a4a', '#d9d4c0', '#8a5a3a']), 8);
    }
  }
  {
    const f = kit.frame(7.8, -22.8, 0.3, FLOOR);
    f.box(0.9, 0.04, 0.5, 0, 0.8, 0, '#9aa5af', 'steel');
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.2, 0.2]) { f.box(0.03, 0.8, 0.03, sx, 0.4, sz, C.steelDk, 'steel'); }
    for (let k = 0; k < 4; k++) f.box(0.7, 0.06, 0.4, 0, 0.45 + k * 0.1, 0, '#d9d4c0');
    f.box(0.9, 0.04, 0.5, 0, 0.3, 0, '#9aa5af', 'steel');
    for (const sx of [-0.4, 0.4]) f.cyl(0.05, 0.05, 0.03, sx, 0.05, 0.2, C.black, 8);
  }
  // жёлтое ведро со шваброй, знак «мокрый пол», урна, сливы
  {
    const f = kit.frame(9.0, -21.7, 0, FLOOR);
    f.box(0.35, 0.3, 0.4, 0, 0.15, 0, '#e8c23a');
    f.cyl(0.02, 0.02, 1.2, 0.1, 0.9, 0.1, C.woodLt, 6);
    f.box(0.3, 0.03, 0.1, 0.1, 0.35, 0.1, '#c9c9c4');
    const g = kit.frame(3.2, -21.8, 0.6, FLOOR);
    g.box(0.4, 0.03, 0.3, 0, 0.012, 0, '#e8c23a');
    g.box(0.38, 0.55, 0.02, 0, 0.3, 0.1, '#e8c23a');
    g.box(0.38, 0.55, 0.02, 0, 0.3, -0.1, '#e8c23a');
    lib.bin(kit.frame(-3.0, -21.6, 0, FLOOR), 0, 0, '#3f6a4a');
  }
  for (const [x, z] of [[2, -26], [6, -27]]) kit.prim.cyl(0.12, 0.12, 0.012, x, FLOOR + 0.006, z, '#2a2d31', 10, 'steel');
  // трубы, вентиляция, камеры, указатели
  lib.ceilRun('pipe', 'x', -3.4, 9.4, -26, BUILD_H - FLOOR - 0.25, '#7a8591');
  lib.ceilRun('pipe', 'x', -3.4, 9.4, -25.4, BUILD_H - FLOOR - 0.25, '#a24a3a');
  lib.ceilRun('duct', 'z', -31, -21, 6.8, BUILD_H - FLOOR - 0.35, '#9aa4ad');
  const Sw = (x) => kit.frame(x, -20.5, Math.PI / 2, FLOOR);
  lib.clock(Sw(7), 0.03, 3.3, 0);
  lib.extinguisher(Sw(-1.0), 0.0, 0);
  lib.exitSign(Sw(4.5), 0.03, 3.5, 0);
  lib.camera(kit.frame(-3.2, -21.0, Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
  paint.flat(-3.3, -30.5, 9.3, -30.4, FLOOR + 0.004, '#c9a227');
  // плитка на стенах до 1.5 м: светлая полоса вдоль северной стены
  kit.prim.box(13, 1.4, 0.04, 3, FLOOR + 0.75, -31.46, '#dfe5e8', 0, 'matte');
  plates.add('КУХНЯ · ВХОД ТОЛЬКО ПЕРСОНАЛУ', 1.5, FLOOR + 3.3, -20.46, 0, -1, 3.2, 0.4, { bg: '#7a1414', fg: '#ffffff', frame: '#ffffff' });
}

export function detailCommissary(ctx) {
  const { kit, lib, FLOOR, BUILD_H, plates, rng } = ctx;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  kit.use('commissary');
  // Прилавок у окошка (снаружи): тумба из дерева, стальная столешница, касса, весы, звонок, товары.
  {
    const f = kit.frame(15, -19.4, 0, FLOOR);
    f.box(3.3, 1.1, 0.9, 0, 0.55, 0, '#7a5c3a');
    for (let k = -3; k <= 3; k++) f.box(0.02, 0.9, 0.01, k * 0.45, 0.55, 0.455, '#5b4128');
    f.box(3.5, 0.07, 1.05, 0, 1.135, 0.04, '#c4ccd2', 'steel');
    f.box(0.4, 0.28, 0.4, -1.1, 1.31, 0.0, '#3a4350', 'steel');
    f.box(0.3, 0.14, 0.02, -1.1, 1.45, 0.2, '#8fb4ff', 'glowS');
    f.box(0.36, 0.05, 0.3, -1.1, 1.18, 0.35, '#222');
    f.box(0.4, 0.04, 0.3, 0.5, 1.2, 0.1, '#c8d0d7', 'steel');
    f.box(0.18, 0.09, 0.02, 0.5, 1.27, 0.26, '#7cff9a', 'glowG');
    f.cyl(0.05, 0.05, 0.03, 1.2, 1.19, 0.2, '#c9a227', 8, 'steel');
    f.box(0.14, 0.05, 0.1, -0.2, 1.19, 0.3, '#e8e3d2');
    for (let k = 0; k < 4; k++) f.box(0.2, 0.28, 0.07, 1.4 + (k % 2) * 0.05, 1.31 + Math.floor(k / 2) * 0.28, 0.0, pick(['#c0392b', '#e6b422', '#2d7fd6', '#27ae60']));
    // рольставни над окошком
    f.box(3.7, 0.28, 0.32, 0, 3.15, 0.4, '#59636d', 'steel');
    for (const sx of [-1.8, 1.8]) f.box(0.08, 2.0, 0.08, sx, 2.15, 0.45, '#46515c', 'steel');
    f.box(3.6, 0.09, 0.06, 0, 3.0, 0.45, '#b9c3cc', 'steel');
  }
  // Стеллажи с товарами вдоль стен
  const shelfUnit = (x, z, yaw, len, levels) => {
    const f = kit.frame(x, z, yaw, FLOOR);
    for (const sx of [-1, 1]) f.box(0.05, levels * 0.62 + 0.4, 0.55, sx * (len / 2), (levels * 0.62 + 0.4) / 2, 0, C.steelDk, 'steel');
    f.box(len, 0.05, 0.05, 0, levels * 0.62 + 0.25, -0.25, C.steelDk, 'steel');
    for (let l = 0; l < levels; l++) {
      const y = 0.25 + l * 0.62;
      f.box(len, 0.04, 0.52, 0, y, 0, '#9aa5af', 'steel');
      let x2 = -len / 2 + 0.15;
      while (x2 < len / 2 - 0.15) {
        const kind = rng.next();
        if (kind < 0.3) { const w = 0.22 + rng.next() * 0.08; f.box(w, 0.32, 0.08, x2 + w / 2, y + 0.18, -0.05 + rng.next() * 0.1, pick(['#c0392b', '#e6b422', '#2d7fd6', '#27ae60', '#d35400', '#8e44ad'])); x2 += w + 0.03; }
        else if (kind < 0.55) { f.cyl(0.055, 0.045, 0.1, x2 + 0.06, y + 0.07, 0.0, pick(['#e8e8e8', '#c0392b', '#e6b422']), 8); f.cyl(0.055, 0.055, 0.015, x2 + 0.06, y + 0.125, 0.0, '#ddd', 8); x2 += 0.15; }
        else if (kind < 0.8) { f.cyl(0.04, 0.04, 0.12, x2 + 0.045, y + 0.08, 0.0, pick(['#8a5a3a', '#3a7a4a', '#c9a227', '#9a3a2a']), 8); x2 += 0.1; }
        else { f.box(0.18, 0.16, 0.12, x2 + 0.09, y + 0.1, 0.0, pick(['#f3f3ee', '#d9402a', '#355c9a'])); x2 += 0.22; }
      }
    }
  };
  shelfUnit(15, -31.15, 0, 8.4, 3);
  shelfUnit(10.9, -26, Math.PI / 2, 8.0, 3);
  shelfUnit(19.1, -26, -Math.PI / 2, 8.0, 3);
  // Коробки на полу, тележка, табурет продавца, лампа
  for (let k = 0; k < 5; k++) kit.prim.box(0.55, 0.4, 0.4, 13.2 + k * 0.5, FLOOR + 0.2 + (k % 2) * 0.4, -29.4, '#b99a6a', (k % 3) * 0.1, 'matte');
  {
    const f = kit.frame(16.6, -24.5, 0, FLOOR);
    f.box(0.5, 0.04, 0.9, 0, 0.5, 0, '#4d5660', 'steel');
    f.box(0.04, 1.2, 0.04, 0.25, 0.6, 0.45, '#4d5660', 'steel');
    f.box(0.04, 1.2, 0.04, 0.25, 0.6, -0.45, '#4d5660', 'steel');
    f.box(0.04, 0.04, 0.9, 0.25, 1.2, 0, '#4d5660', 'steel');
    f.cyl(0.06, 0.06, 0.04, 0.0, 0.05, 0.4, '#222', 8);
    f.cyl(0.06, 0.06, 0.04, 0.0, 0.05, -0.4, '#222', 8);
    const s = kit.frame(15, -22.2, 0, FLOOR);
    s.cyl(0.2, 0.2, 0.05, 0, 0.62, 0, '#59636d', 12, 'steel');
    s.cyl(0.03, 0.04, 0.6, 0, 0.3, 0, '#59636d', 8, 'steel');
  }
  lib.clock(kit.frame(10.5, -26, 0, FLOOR), 0.03, 3.2, 0);
  lib.camera(kit.frame(19.2, -21.0, Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
  plates.add('ЦЕНЫ: ЧИПСЫ $6 · ЛАПША $4 · КОФЕ $5 · СИГАРЕТЫ $14', 15, FLOOR + 2.55, -31.46, 0, 1, 4.6, 0.5, { bg: '#2f4a2f', fg: '#ffffff', frame: '#ffd45a' });
  plates.add('ОКНО РАБОТАЕТ 8:00–19:00', 15, FLOOR + 3.7, -20.46, 0, 1, 2.6, 0.3, { bg: '#1f2a36', fg: '#ffd45a', frame: '#7a8a9a' });
  void BUILD_H;
}

// Прачечная: промышленные стиральные и сушильные машины, столы с глажкой, корзины, вешалка, бочки.
export function detailLaundry(ctx) {
  const { kit, lib, FLOOR, BUILD_H, plates, rng, solid } = ctx;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  kit.use('laundry');
  for (let k = 0; k < 4; k++) {
    const f = kit.frame(-12.7 + k * 2.0, -0.9, 0, FLOOR);
    f.box(1.5, 1.4, 1.25, 0, 0.7, 0, '#dfe5e8', 'steel');
    f.box(1.56, 0.06, 1.3, 0, 1.43, 0, '#b7c0c8', 'steel');
    f.box(1.4, 0.2, 0.04, 0, 1.2, 0.64, '#2d5d9b');
    f.torus(0.36, 0.05, 0, 0.62, 0.64, '#b7c0c8', 'z', 'steel', 18, 6);
    f.pipe(0.31, 0.03, 'z', 0, 0.62, 0.64, '#1b2a36', 18, 'glass');
    f.pipe(0.28, 0.02, 'z', 0, 0.62, 0.62, '#4a6a85', 14, 'matte');
    f.box(0.18, 0.1, 0.03, 0.48, 1.2, 0.66, '#12161b');
    f.box(0.03, 0.03, 0.03, 0.5, 1.2, 0.68, '#7cff9a', 'glowG');
    f.box(0.03, 0.03, 0.03, 0.44, 1.2, 0.68, '#ff4a3a', 'glowR');
    for (const sx of [-0.65, 0.65]) f.box(0.12, 0.08, 0.12, sx, 0.04, 0.5, C.steelDk, 'steel');
    f.pipe(0.04, 0.5, 'z', 0.5, 1.2, -0.85, '#2f6a9a', 8, 'steel');
  }
  // сушильные машины у западной стены (двухъярусные)
  for (const z of [3.5, 5.3, 7.1]) {
    const f = kit.frame(-13.0, z, Math.PI / 2, FLOOR);
    f.box(1.5, 1.95, 1.0, 0, 0.975, 0, '#c4ccd2', 'steel');
    for (const y of [0.55, 1.45]) {
      f.torus(0.28, 0.045, 0, y, 0.52, '#8e99a4', 'z', 'steel', 16, 5);
      f.pipe(0.24, 0.03, 'z', 0, y, 0.52, '#2a3441', 16, 'glass');
    }
    f.box(1.3, 0.18, 0.03, 0, 1.12, 0.52, '#c0392b');
  }
  solid(-13.5, 2.7, -12.4, 7.9, 2.0, { type: 'barrier' });
  // столы для складывания с стопками роб, гладильная доска
  for (const z of [8, 11]) {
    const f = kit.frame(-8, z, 0, FLOOR);
    f.box(2.4, 0.06, 1.0, 0, 0.9, 0, '#c9b88a');
    for (const sx of [-1, 1]) for (const sz of [-0.4, 0.4]) f.box(0.07, 0.88, 0.07, sx * 1.1, 0.44, sz, '#6a717a', 'steel');
    for (let k = 0; k < 4; k++) f.box(0.5, 0.05 + (k % 2) * 0.03, 0.4, -0.8 + k * 0.45, 0.96 + (k % 2) * 0.015, 0.0, k % 3 ? C.orange : '#eeeeea');
    for (let k = 0; k < 6; k++) f.box(0.5, 0.05, 0.4, 0.6, 0.96 + k * 0.05, 0.1, '#e2670a');
  }
  {
    const f = kit.frame(-5.3, 12.9, 0.4, FLOOR);
    f.box(1.3, 0.04, 0.35, 0, 0.9, 0, '#eeeeea');
    f.bar(-0.5, 0.88, -0.1, -0.2, 0, -0.3, 0.03, C.steelDk, 'steel');
    f.bar(-0.5, 0.88, 0.1, -0.2, 0, 0.3, 0.03, C.steelDk, 'steel');
    f.bar(0.5, 0.88, -0.1, 0.2, 0, -0.3, 0.03, C.steelDk, 'steel');
    f.bar(0.5, 0.88, 0.1, 0.2, 0, 0.3, 0.03, C.steelDk, 'steel');
    f.box(0.2, 0.12, 0.14, 0.4, 0.98, 0, '#8a929b', 'steel');
  }
  // тележки-корзины с бельём
  for (const [x, z] of [[-4.5, 4], [-4.5, 15]]) {
    const f = kit.frame(x, z, 0, FLOOR);
    f.box(1.2, 0.08, 0.8, 0, 0.3, 0, '#7e8a95', 'steel');
    for (const sx of [-1, 1]) f.box(0.04, 0.5, 0.8, sx * 0.58, 0.58, 0, '#a7b2bc', 'steel');
    for (const sz of [-1, 1]) f.box(1.2, 0.5, 0.04, 0, 0.58, sz * 0.38, '#a7b2bc', 'steel');
    for (let k = 0; k < 8; k++) f.box(0.35 + (k % 3) * 0.1, 0.2, 0.3, -0.35 + (k % 4) * 0.25, 0.7, -0.2 + Math.floor(k / 4) * 0.4, pick(['#eeeeea', C.orange, '#c9c4b4', '#8aa0b5']));
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.3, 0.3]) f.cyl(0.05, 0.05, 0.05, sx, 0.03, sz, '#222', 8);
  }
  // корзина с формой охраны (серо-зелёная) и вешалка с одеждой
  {
    const f = kit.frame(-12.8, 16.6, 0, FLOOR);
    f.box(0.9, 0.06, 0.6, 0, 0.3, 0, '#2a3f66');
    for (const sx of [-1, 1]) f.box(0.04, 0.5, 0.6, sx * 0.43, 0.56, 0, '#3b5ea8');
    for (const sz of [-1, 1]) f.box(0.9, 0.5, 0.04, 0, 0.56, sz * 0.28, '#3b5ea8');
    for (let k = 0; k < 5; k++) f.box(0.34, 0.12, 0.26, -0.25 + (k % 3) * 0.24, 0.62 + Math.floor(k / 3) * 0.1, 0.0, k % 2 ? '#5d6b5f' : '#232a25');
    f.box(0.2, 0.06, 0.12, 0.2, 0.76, 0.05, '#232a25');
    const r = kit.frame(-8, 16.8, 0, FLOOR);
    r.pipe(0.025, 3.0, 'x', 0, 1.7, 0, C.steelLt, 8, 'steel');
    for (const sx of [-1.5, 1.5]) r.box(0.05, 1.7, 0.05, sx, 0.85, 0, C.steelDk, 'steel');
    for (let k = 0; k < 9; k++) r.box(0.36, 0.7, 0.04, -1.3 + k * 0.32, 1.25, 0, pick([C.orange, C.orange, '#eeeeea', '#8aa0b5']));
  }
  // бочки с порошком, полка с полотенцами, труба пара, вентиляция
  for (const [x, z] of [[-13.0, 10.0], [-13.0, 10.8], [-12.4, 10.4]]) kit.prim.cyl(0.25, 0.25, 0.7, x, FLOOR + 0.35, z, '#2d5d9b', 14, 'matte');
  {
    const f = kit.frame(-13.3, 13.5, 0, FLOOR);
    for (let k = 0; k < 3; k++) { f.box(0.4, 0.04, 2.2, 0.1, 0.5 + k * 0.5, 0, C.woodLt); for (let c = 0; c < 6; c++) f.box(0.34, 0.1, 0.3, 0.1, 0.57 + k * 0.5, -0.8 + c * 0.32, pick(['#eeeeea', '#8aa0b5', '#c9c4b4'])); }
    for (const sz of [-1.1, 1.1]) f.box(0.05, 1.6, 0.05, 0.28, 0.8, sz, C.steelDk, 'steel');
  }
  lib.ceilRun('pipe', 'z', -13.4, 17.4, -9.5, BUILD_H - FLOOR - 0.28, '#b0b8c0');
  lib.ceilRun('pipe', 'z', -13.4, 17.4, -8.8, BUILD_H - FLOOR - 0.28, '#a24a3a');
  lib.ceilRun('duct', 'x', -13.4, -2.6, 2.0, BUILD_H - FLOOR - 0.34, '#9aa4ad');
  const Ee = (z) => kit.frame(-2.5, z, Math.PI, FLOOR);
  lib.clock(Ee(9), 0.03, 3.3, 0);
  lib.extinguisher(Ee(16), 0.0, 0);
  lib.vent(Ee(3), 0.02, 3.0, 0, 0.6, 0.35);
  lib.camera(kit.frame(-2.8, 17.0, -Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
  plates.add('СТИРКА · СУШКА · ГЛАЖКА', -8, FLOOR + 3.0, 17.46, 0, -1, 2.8, 0.34, { bg: '#2c4a5e', fg: '#ffffff', frame: '#9ad0ff' });
}

// Библиотека: настоящие стеллажи с книгами, столы с лампами, стулья, каталог, глобус, ковёр.
export function detailLibrary(ctx) {
  const { kit, lib, FLOOR, BUILD_H, paint, plates, rng } = ctx;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  kit.use('library');
  const bookColors = ['#8a2b2b', '#2b4a8a', '#2b8a4a', '#8a6b2b', '#5a2d6b', '#c9b36b', '#3b3b3b', '#a05a3a', '#6b8a9a', '#d9d2bd'];
  const bookshelf = (x, z, yaw, len = 3.2) => {
    const f = kit.frame(x, z, yaw, FLOOR);
    for (const sx of [-1, 1]) f.box(0.04, 2.4, 0.4, sx * (len / 2), 1.2, 0, C.woodDk);
    f.box(len, 2.4, 0.03, 0, 1.2, -0.185, '#4b3622');
    f.box(len + 0.1, 0.06, 0.45, 0, 2.43, 0, C.woodDk);
    for (let l = 0; l < 5; l++) {
      const y = 0.2 + l * 0.46;
      f.box(len, 0.035, 0.38, 0, y, 0, C.woodLt);
      let b = -len / 2 + 0.06;
      while (b < len / 2 - 0.1) {
        const t = 0.025 + rng.next() * 0.04, h = 0.24 + rng.next() * 0.16;
        if (rng.next() < 0.05) { b += 0.15; continue; }
        const lean = rng.next() < 0.04 ? 0.25 : 0;
        f.box(t, h, 0.26, b + t / 2, y + 0.0175 + h / 2, 0.0, pick(bookColors));
        void lean;
        b += t + 0.002;
      }
    }
  };
  for (let k = 0; k < 4; k++) bookshelf(5.2, 1.6 + k * 4.0, -Math.PI / 2, 3.2);
  // низкие стеллажи у западной стены
  for (let k = 0; k < 2; k++) bookshelf(-1.3, 5 + k * 6, Math.PI / 2, 3.2);
  // столы для чтения с лампами и стульями
  const readTable = (x, z) => {
    const f = kit.frame(x, z, 0, FLOOR);
    f.box(1.6, 0.06, 0.8, 0, 0.76, 0, C.wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.06, 0.74, 0.06, sx * 0.72, 0.37, sz * 0.34, C.woodDk);
    f.box(0.5, 0.02, 0.35, -0.35, 0.8, 0.05, pick(bookColors));
    f.box(0.5, 0.02, 0.35, -0.35, 0.82, 0.05, '#f0ecdd');
    f.cyl(0.08, 0.1, 0.03, 0.5, 0.8, -0.2, '#2f5d3a', 10);
    f.cyl(0.015, 0.015, 0.3, 0.5, 0.97, -0.2, '#c9a227', 6, 'steel');
    f.cone(0.12, 0.12, 0.5, 1.18, -0.2, '#2f7d4a', 10);
    f.box(0.12, 0.02, 0.12, 0.5, 1.13, -0.2, '#fff1cf', 'glowW');
    for (const sz of [-1, 1]) for (const sx of [-0.4, 0.4]) {
      const c = f.sub(sx, sz * 0.7, sz > 0 ? Math.PI : 0);
      c.box(0.42, 0.05, 0.42, 0, 0.45, 0, C.woodLt);
      c.box(0.42, 0.45, 0.04, 0, 0.7, -0.19, C.woodLt);
      for (const px of [-0.18, 0.18]) for (const pz of [-0.18, 0.18]) c.box(0.04, 0.44, 0.04, px, 0.22, pz, C.woodDk);
    }
  };
  readTable(1.6, 12.5);
  readTable(1.6, 15.8);
  readTable(1.6, 2.6);
  // стол библиотекаря, компьютер, картотека
  {
    const f = kit.frame(1.4, 8, 0, FLOOR);
    f.box(2.4, 0.08, 1.0, 0, 0.76, 0, '#6b4a2f');
    f.box(0.08, 0.76, 0.9, -1.1, 0.38, 0, '#4a3a2a');
    f.box(0.08, 0.76, 0.9, 1.1, 0.38, 0, '#4a3a2a');
    f.box(0.5, 0.35, 0.04, 0.5, 1.05, -0.15, '#15171a');
    f.box(0.46, 0.3, 0.012, 0.5, 1.05, -0.13, '#8fb4ff', 'glowS');
    f.box(0.4, 0.02, 0.14, 0.5, 0.81, 0.15, '#cfd6dc');
    f.cyl(0.18, 0.18, 0.03, -0.5, 0.82, 0.1, '#1f3a5a', 10);
    const cab = kit.frame(3.2, 7.6, -Math.PI / 2, FLOOR);
    cab.box(1.1, 1.1, 0.5, 0, 0.55, 0, '#7a5c3a');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { cab.box(0.3, 0.2, 0.02, -0.35 + c * 0.35, 0.18 + r * 0.25, 0.26, '#a98550'); cab.box(0.1, 0.02, 0.02, -0.35 + c * 0.35, 0.18 + r * 0.25, 0.28, '#c9a227', 'steel'); }
    const trolley = kit.frame(0.2, 4.4, 0.4, FLOOR);
    trolley.box(0.9, 0.04, 0.4, 0, 0.35, 0, '#6b4a2f'); trolley.box(0.9, 0.04, 0.4, 0, 0.85, 0, '#6b4a2f');
    for (const sx of [-0.42, 0.42]) trolley.box(0.04, 0.9, 0.4, sx, 0.45, 0, '#4a3a2a');
    for (let k = 0; k < 7; k++) trolley.box(0.06, 0.28, 0.24, -0.35 + k * 0.1, 1.0, 0, pick(bookColors));
  }
  // глобус на подставке, ковёр, плакаты
  {
    const f = kit.frame(4.4, 17.0, 0, FLOOR);
    f.cyl(0.14, 0.18, 0.04, 0, 0.02, 0, C.woodDk);
    f.cyl(0.03, 0.03, 0.8, 0, 0.42, 0, C.woodDk);
    f.sph(0.26, 0, 1.05, 0, '#3a6ea5', 1, 1, 1, 'matte', 14);
    f.torus(0.3, 0.015, 0, 1.05, 0, '#c9a227', 'x', 'steel', 18, 4);
    for (const [px, pz, s] of [[0.1, 0.1, 0.12], [-0.12, 0.05, 0.1], [0.0, -0.15, 0.09]]) f.sph(s, px, 1.05 + pz, 0.2, '#6b9a4a', 1, 1, 0.3, 'matte', 6);
  }
  paint.flat(0.2, 0.0, 4.6, 16.4, FLOOR + 0.004, '#7a2b2b');
  paint.flat(0.45, 0.25, 4.35, 16.15, FLOOR + 0.005, '#a8553a');
  paint.flat(0.7, 0.5, 4.1, 15.9, FLOOR + 0.006, '#7a2b2b');
  const Ee = (z) => kit.frame(5.5, z, Math.PI, FLOOR);
  void Ee;
  const Sw = (x) => kit.frame(x, 17.5, -Math.PI / 2, FLOOR);
  lib.clock(Sw(2.5), 0.03, 3.3, 0);
  lib.camera(kit.frame(5.2, -1.2, Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
  lib.ceilRun('pipe', 'z', -1.4, 17.4, 2.0, BUILD_H - FLOOR - 0.25, '#7a8591');
  plates.add('ТИШИНА! ЧИТАЮТ', 2.2, FLOOR + 3.0, -1.46, 0, 1, 1.9, 0.34, { bg: '#3a2f22', fg: '#ffffff', frame: '#d9b13b' });
  plates.add('ВЫДАЧА КНИГ: 2 НЕДЕЛИ', 2.2, FLOOR + 2.1, 17.46, 0, -1, 1.8, 0.28, { bg: '#2f3a48', fg: '#ffe9a8', frame: '#c9a227' });
}
