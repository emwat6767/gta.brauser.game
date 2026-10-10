import { C } from './prison-detail-lib.js';

// Камеры и общие помещения блоков A и B: интерьер каждой камеры (койка, унитаз, стол, полка, окно-бойница, лампа),
// стойки решёток, номера над дверями, разметка пола, потолочные коммуникации, камеры наблюдения, часы, телевизоры,
// телефоны, столы со стульями. Всё — склеенные меши (prison-props.js).

export function detailCells(ctx) {
  const { kit, lib, cells, FLOOR, BUILD_H, plates, rng } = ctx;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  for (const cell of cells) {
    const A = cell.block === 'A';
    kit.use(A ? 'cbw' : 'cbn');
    const fr = cell.front;
    const [x0, z0, x1, z1] = cell.rect;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const back = fr.fixed - fr.dir * 3.5;
    const f = A ? kit.frame(back, mz, Math.PI / 2, FLOOR) : kit.frame(mx, back, 0, FLOOR);
    const L = (v) => (A ? -v : v);                 // «вдоль решётки» (локально) -> x предмета
    const bs = cell.bedSide;
    const bx = L(bs * 0.56);
    // Койка со стороны bedSide, унитаз и стол — напротив.
    lib.bunk(f, bx, 1.125, 1.95, -Math.sign(bx), {});
    lib.combo(f, L(-bs * 0.62), 0);
    lib.deskStool(f, L(-bs * 0.86), 1.55, Math.sign(L(-bs)) );
    lib.wallShelf(f.sub(L(-bs * 1.0), 1.55, 0), 0, 1.5, 0, 0.9);
    // Окно-бойница в задней стене с прутьями: светится днём.
    f.box(0.9, 0.5, 0.05, 0, 2.45, 0.03, '#59636d', 'steel');
    f.box(0.8, 0.4, 0.012, 0, 2.45, 0.058, '#bfe6ff', 'glowD');
    for (let k = -3; k <= 3; k++) f.box(0.025, 0.42, 0.025, k * 0.115, 2.45, 0.07, '#2b3138', 'steel');
    f.box(0.9, 0.03, 0.08, 0, 2.2, 0.06, '#59636d', 'steel');
    // Лампа-«клетка», слив в полу, ящик для вещей под койкой, тапочки.
    lib.cageLamp(f, 0, BUILD_H - FLOOR - 0.12, 1.7, 0.46, 0.18);
    f.cyl(0.09, 0.09, 0.012, L(bs * -0.1), 0.006, 2.7, '#2a2d31', 10);
    f.box(0.5, 0.2, 0.36, bx, 0.12, 0.9, '#3b4752', 'steel');
    f.box(0.1, 0.04, 0.26, L(-bs * 0.1), 0.02, 2.9, pick([C.red, '#1b4d8a', '#2f2f33']));
    f.box(0.1, 0.04, 0.26, L(-bs * 0.1) + 0.14, 0.02, 2.9, pick([C.red, '#1b4d8a', '#2f2f33']));
    // Рулон/пачка писем на столе, кружка, зубная щётка в стакане.
    f.box(0.12, 0.012, 0.18, L(-bs * 0.86), 0.815, 1.3, '#f0ecdd');
    f.cyl(0.035, 0.03, 0.08, L(-bs * 0.86), 0.84, 1.8, pick([C.white, C.orange]), 8);
    // Мелкие метки на стене: «календарь» из чёрточек.
    for (let k = 0; k < 6; k++) f.box(0.012, 0.16, 0.012, L(-bs * 0.35) + k * 0.02, 1.95, 0.012, '#2b2b2b');
    // Стойки решётки по бокам камеры и косяки двери.
    const doorMid = cell.doorMid, doorW = cell.doorW;
    const frontPost = (along) => {
      const [px, pz] = fr.axis === 'z' ? [fr.fixed, along] : [along, fr.fixed];
      kit.prim.box(0.14, 3.1, 0.14, px, FLOOR + 1.55, pz, '#46515c', 0, 'steel');
    };
    frontPost(fr.a);
    frontPost(doorMid - doorW / 2);
    frontPost(doorMid + doorW / 2);
    frontPost(fr.b);
    // Верхняя балка над дверью и замок на косяке.
    if (fr.axis === 'z') {
      kit.prim.box(0.16, 0.16, doorW + 0.14, fr.fixed, FLOOR + 3.04, doorMid, '#46515c', 0, 'steel');
      kit.prim.box(0.1, 0.22, 0.08, fr.fixed + 0.07, FLOOR + 1.05, doorMid + doorW / 2 + 0.03, '#2b3138', 0, 'steel');
      plates.add(cell.id, fr.fixed + fr.dir * 0.1, FLOOR + 3.62, doorMid, fr.dir, 0, 0.52, 0.22, { bg: '#1f2a36', fg: '#ffd45a', frame: '#7a8a9a' });
    } else {
      kit.prim.box(doorW + 0.14, 0.16, 0.16, doorMid, FLOOR + 3.04, fr.fixed, '#46515c', 0, 'steel');
      kit.prim.box(0.08, 0.22, 0.1, doorMid + doorW / 2 + 0.03, FLOOR + 1.05, fr.fixed + 0.07, '#2b3138', 0, 'steel');
      plates.add(cell.id, doorMid, FLOOR + 3.62, fr.fixed + fr.dir * 0.1, 0, fr.dir, 0.52, 0.22, { bg: '#1f2a36', fg: '#ffd45a', frame: '#7a8a9a' });
    }
    // Нижняя «юбка» решётки у пола и бетонный порожек двери.
    if (fr.axis === 'z') {
      kit.prim.box(0.2, 0.12, fr.b - fr.a, fr.fixed, FLOOR + 0.06, (fr.a + fr.b) / 2, '#6c7480', 0, 'matte');
    } else {
      kit.prim.box(fr.b - fr.a, 0.12, 0.2, (fr.a + fr.b) / 2, FLOOR + 0.06, fr.fixed, '#6c7480', 0, 'matte');
    }
  }
}

// Общие помещения блоков: разметка, потолок, камеры наблюдения, часы, телевизоры, телефоны, столы.
export function detailBlocks(ctx) {
  const { kit, lib, FLOOR, BUILD_H, paint, plates, solid, rng, brk } = ctx;
  const CEIL = BUILD_H - FLOOR;                 // потолок над полом
  // Телевизоры и телефоны — отдельные куски: их можно сломать (prison-wreck.js).
  const smashable = (id, kind, local, y, hp, draw) => {
    kit.use(`brk-${id}`, 90);
    draw();
    brk.push({ id, kind, local, y: FLOOR + y, hp, r: kind === 'tv' ? 1.1 : 0.7, chunk: `brk-${id}` });
  };

  // ---------------------------------------------------------------- БЛОК A
  {
    kit.use('cbw');
    // разметка: жёлтая линия «не заходить» вдоль решёток и пунктир у выходов
    paint.flat(-27.4, -19.2, -27.28, 17.3, FLOOR + 0.004, '#e8c23a');
    for (const z of [-12, 8]) for (let k = -1; k <= 1; k++) paint.flat(-17.9, z + k * 0.9 - 0.05, -16.7, z + k * 0.9 + 0.05, FLOOR + 0.004, '#d8d8d2');
    paint.flat(-27.9, -19.3, -16.6, -19.2, FLOOR + 0.004, '#c9a227');
    // Потолок: две трубы, воздуховод, лоток с кабелями
    lib.ceilRun('pipe', 'z', -19.4, 17.4, -24.6, CEIL - 0.25, '#7a8591');
    lib.ceilRun('pipe', 'z', -19.4, 17.4, -24.0, CEIL - 0.25, '#a24a3a');
    lib.ceilRun('duct', 'z', -19.4, 17.4, -20.0, CEIL - 0.32, '#9aa4ad');
    lib.ceilRun('tray', 'z', -19.4, 17.4, -26.3, CEIL - 0.12, '#6c7681');
    for (let z = -18; z < 17; z += 3) lib.sprinkler(kit.frame(-22.3, z, 0, FLOOR), 0, CEIL, 0);
    for (let z = -16; z < 17; z += 9) lib.smoke(kit.frame(-26.8, z, 0, FLOOR), 0, CEIL, 0);
    // Подвесные кронштейны воздуховода
    for (let z = -18; z < 17; z += 4.5) kit.prim.box(0.04, 0.3, 0.04, -20.0, FLOOR + CEIL - 0.1, z, '#59636d', 0, 'steel');
    // Восточная стена (x = -16.5): рамка смотрит в комнату (-x)
    const E = (z) => kit.frame(-16.5, z, Math.PI, FLOOR);
    smashable('tv-a', 'tv', [-16.66, -3], 2.5, 45, () => lib.wallTv(E(-3), 0.16, 2.5, 0));
    smashable('ph-a1', 'phone', [-16.54, 12], 1.45, 30, () => lib.wallPhone(E(12), 0.04, 0));
    smashable('ph-a2', 'phone', [-16.54, 14], 1.45, 30, () => lib.wallPhone(E(14), 0.04, 0));
    kit.use('cbw');
    lib.noticeBoard(E(-8), 0.03, 1.7, 0, 1.3, 0.85);
    lib.clock(E(2.0), 0.03, 3.4, 0);
    lib.extinguisher(E(4.0), 0.0, 0);
    lib.fountain(kit.frame(-16.85, -17.6, Math.PI, FLOOR), 0, 0);
    lib.exitSign(E(-12), 0.03, 3.5, 0);
    lib.exitSign(E(8), 0.03, 3.5, 0);
    lib.vent(E(16), 0.02, 3.0, 0, 0.6, 0.35);
    lib.horn(E(-1), 0.02, 3.55, 0);
    // перегородки между телефонами
    for (const z of [11.1, 13, 14.9]) kit.prim.box(0.38, 1.35, 0.04, -16.7, FLOOR + 1.1, z, '#4d5660', 0, 'steel');
    // Камеры наблюдения по углам (смотрят вдоль коридора)
    lib.camera(kit.frame(-16.9, -19.1, Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(-16.9, 17.1, -Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    // Столы: стальные круглые наборы (коллайдеры уже стоят в prison-build)
    for (const [x, z] of [[-24, -14], [-20, -14], [-24, -4], [-20, -4], [-24, 6], [-20, 6]]) lib.roundTable(kit.frame(x, z, 0, FLOOR), 0, 0);
    lib.bin(kit.frame(-17.2, 0.2, 0, FLOOR), 0, 0);
    lib.bin(kit.frame(-17.2, -16.2, 0, FLOOR), 0, 0, '#3f6a4a');
    // Вывески на стенах
    plates.add('БЛОК A · КАМЕРЫ 1–15', -22, FLOOR + 3.25, -19.46, 0, 1, 2.6, 0.5, { bg: '#1f2a36', fg: '#ffffff', frame: '#e8c23a' });
    plates.add('ПРАВИЛА: ПОДЪЁМ 6:00 · ОТБОЙ 21:30', -22, FLOOR + 3.25, 17.46, 0, -1, 2.8, 0.4, { bg: '#7a1414', fg: '#ffffff', frame: '#ffffff' });
    // Двери в стене: пороги
    for (const z of [-12, 8]) kit.prim.box(0.4, 0.04, 2.8, -16.25, FLOOR + 0.02, z, '#59636d', 0, 'steel');
    void solid;
  }

  // ---------------------------------------------------------------- БЛОК B
  {
    kit.use('cbn');
    paint.flat(-31.2, -27.5, -4.7, -27.38, FLOOR + 0.004, '#e8c23a');
    paint.flat(-15.9, -21.0, -14.1, -20.4, FLOOR + 0.004, '#d8d8d2');
    lib.ceilRun('pipe', 'x', -31.4, -4.6, -25.8, CEIL - 0.25, '#7a8591');
    lib.ceilRun('pipe', 'x', -31.4, -4.6, -25.2, CEIL - 0.25, '#a24a3a');
    lib.ceilRun('duct', 'x', -31.4, -4.6, -22.0, CEIL - 0.32, '#9aa4ad');
    lib.ceilRun('tray', 'x', -31.4, -4.6, -27.3, CEIL - 0.12, '#6c7681');
    for (let x = -30; x < -5; x += 3) lib.sprinkler(kit.frame(x, -24, 0, FLOOR), 0, CEIL, 0);
    for (let x = -28; x < -5; x += 8) lib.smoke(kit.frame(x, -26.6, 0, FLOOR), 0, CEIL, 0);
    for (let x = -30; x < -5; x += 4.5) kit.prim.box(0.04, 0.3, 0.04, x, FLOOR + CEIL - 0.1, -22, '#59636d', 0, 'steel');
    // Южная стена (z = -20.5): комната к -z... рамка смотрит в комнату (-z)
    const Sw = (x) => kit.frame(x, -20.5, Math.PI / 2, FLOOR);   // ось x предмета -> -z (в комнату), ось z -> +x
    lib.noticeBoard(Sw(-24), 0.03, 1.7, 0, 1.3, 0.85);
    lib.clock(Sw(-10), 0.03, 3.4, 0);
    lib.extinguisher(Sw(-6.6), 0.0, 0);
    lib.exitSign(Sw(-15), 0.03, 3.5, 0);
    lib.vent(Sw(-19), 0.02, 3.0, 0, 0.6, 0.35);
    lib.horn(Sw(-28), 0.02, 3.55, 0);
    // Восточная стена (x = -4.5): рамка смотрит в -x
    const E = (z) => kit.frame(-4.5, z, Math.PI, FLOOR);
    smashable('tv-b', 'tv', [-4.66, -24], 2.5, 45, () => lib.wallTv(E(-24), 0.16, 2.5, 0));
    smashable('ph-b1', 'phone', [-4.54, -22], 1.45, 30, () => lib.wallPhone(E(-22), 0.04, 0));
    kit.use('cbn');
    kit.prim.box(0.38, 1.35, 0.04, -4.7, FLOOR + 1.1, -23.1, '#4d5660', 0, 'steel');
    kit.prim.box(0.38, 1.35, 0.04, -4.7, FLOOR + 1.1, -20.9, '#4d5660', 0, 'steel');
    lib.fountain(kit.frame(-4.85, -26.5, Math.PI, FLOOR), 0, 0);
    lib.camera(kit.frame(-5.0, -27.4, Math.PI * 1.25, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(-30.8, -20.9, 0.25 * Math.PI, FLOOR), 0, 3.55, 0, 0);
    for (const [x, z] of [[-26, -24.5], [-21, -24.5], [-16, -24.5], [-11, -24.5]]) lib.roundTable(kit.frame(x, z, 0, FLOOR), 0, 0);
    lib.bin(kit.frame(-5.2, -26.8, 0, FLOOR), 0, 0);
    plates.add('БЛОК B · КАМЕРЫ 1–11', -18, FLOOR + 3.25, -20.56, 0, -1, 2.6, 0.5, { bg: '#1f2a36', fg: '#ffffff', frame: '#e8c23a' });
    kit.prim.box(2.6, 0.04, 0.4, -15, FLOOR + 0.02, -20.3, '#59636d', 0, 'steel');
  }
  void rng;
}

// Фурнитура двери камеры: рамка, замок, ручка, петли, окошко для подноса — одна общая геометрия на все двери.
export function doorHardwareGeometry(THREE, mergeColored, H0) {
  const parts = [];
  const add = (w, h, d, x, y, z, color) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push({ geometry: g, color }); };
  add(0.95, 0.06, 0.06, 0.475, 2.6 + H0 - 0.03, 0, '#46515c');
  add(0.95, 0.08, 0.06, 0.475, H0 + 0.06, 0, '#46515c');
  add(0.95, 0.05, 0.05, 0.475, H0 + 1.3, 0, '#46515c');
  add(0.06, 2.6, 0.06, 0.03, H0 + 1.3, 0, '#46515c');
  add(0.06, 2.6, 0.06, 0.92, H0 + 1.3, 0, '#46515c');
  add(0.1, 0.24, 0.09, 0.84, H0 + 1.05, 0, '#2b3138');
  add(0.03, 0.03, 0.14, 0.78, H0 + 1.05, 0.08, '#c8d0d7');
  add(0.1, 0.05, 0.08, 0.03, H0 + 2.2, 0, '#2b3138');
  add(0.1, 0.05, 0.08, 0.03, H0 + 0.5, 0, '#2b3138');
  add(0.12, 0.08, 0.05, 0.6, H0 + 1.55, 0.04, '#2b3138');
  const geo = mergeColored(parts);
  for (const p of parts) p.geometry.dispose();
  return geo;
}
