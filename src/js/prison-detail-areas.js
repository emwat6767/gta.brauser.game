import { C } from './prison-detail-lib.js';

// Помещения: администрация (приём, кабинет начальника, оружейная), шлюз, свидания, лазарет, карцер.
// Коллайдеры остаются в prison-build.js; здесь — только вид (детали склеиваются в большие меши, см. prison-props.js).

// Рамка у стены: нормаль стены (в комнату) — это ось +x рамки. 'zlo' — стена на малом z (комната к +z), 'zhi' — на большом z,
// 'xlo' — на малом x, 'xhi' — на большом x. wall — координата внутренней грани стены, along — позиция вдоль неё.
export const wallFrames = (kit, y0) => (side, wall, along) => {
  switch (side) {
    case 'zlo': return kit.frame(along, wall, -Math.PI / 2, y0);
    case 'zhi': return kit.frame(along, wall, Math.PI / 2, y0);
    case 'xlo': return kit.frame(wall, along, 0, y0);
    default: return kit.frame(wall, along, Math.PI, y0);
  }
};

const plate = (plates, text, x, y, z, nx, nz, w, h, style) => plates.add(text, x, y, z, nx, nz, w, h, style);
const SIGN = { bg: '#1f3350', fg: '#f2f2f2', frame: '#d9b13b' };
const WARN = { bg: '#7a1414', fg: '#ffffff', frame: '#ffffff' };
const GREEN = { bg: '#1f4a36', fg: '#f2f2f2', frame: '#bfe6c9' };

// Картотечный шкаф на 4 ящика (передняя сторона — +x рамки у стены).
function filing(f, z, color = '#6d7681') {
  f.box(0.6, 1.3, 0.5, 0.3, 0.65, z, color, 'steel');
  for (let k = 0; k < 4; k++) {
    f.box(0.012, 0.28, 0.44, 0.606, 0.2 + k * 0.3, z, '#838d98', 'steel');
    f.box(0.02, 0.025, 0.14, 0.62, 0.25 + k * 0.3, z, C.steelLt, 'steel');
    f.box(0.012, 0.06, 0.12, 0.614, 0.31 + k * 0.3, z, '#d8d2b8');
  }
}

// Книжный шкаф: рамка, полки, книги разных цветов (фронт — +x рамки у стены).
function bookcase(f, z, w, h, rng, pick) {
  f.box(0.34, h, 0.04, 0.17, h / 2, z - w / 2 + 0.02, C.woodDk);
  f.box(0.34, h, 0.04, 0.17, h / 2, z + w / 2 - 0.02, C.woodDk);
  f.box(0.34, 0.05, w, 0.17, h - 0.025, z, C.woodDk);
  f.box(0.36, 0.1, w, 0.18, 0.05, z, C.woodDk);
  f.box(0.02, h, w, 0.01, h / 2, z, '#3a2a1a');
  const tiers = Math.round(h / 0.38);
  for (let t = 0; t < tiers; t++) {
    const y = 0.14 + t * ((h - 0.2) / tiers);
    f.box(0.32, 0.025, w - 0.08, 0.17, y, z, '#6f5237');
    let zz = z - w / 2 + 0.08;
    while (zz < z + w / 2 - 0.12) {
      const bt = 0.025 + rng.next() * 0.035, bh = 0.2 + rng.next() * 0.12;
      f.box(0.22, bh, bt, 0.17, y + 0.0125 + bh / 2, zz + bt / 2, pick(['#7a2323', '#23407a', '#23703d', '#7a5a23', '#4a2a63', '#c9b36b', '#3a3a3a']));
      zz += bt + 0.004;
    }
  }
}

// Комнатное растение в горшке.
function plant(f, x, z, rng) {
  f.cyl(0.17, 0.13, 0.3, x, 0.15, z, '#8a5a3a', 10);
  f.cyl(0.15, 0.15, 0.03, x, 0.3, z, '#3a2a1a', 10);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rng.next();
    f.bar(x, 0.3, z, x + Math.sin(a) * 0.18, 0.75 + (k % 3) * 0.12, z + Math.cos(a) * 0.18, 0.02, '#3b6e34', 'matte');
    f.sph(0.1, x + Math.sin(a) * 0.2, 0.78 + (k % 3) * 0.12, z + Math.cos(a) * 0.2, k % 2 ? '#3f7a38' : '#2f6a30', 1, 0.5, 1, 'matte', 6);
  }
}

// Винтовка в стойке: ствол с ствольной коробкой, приклад, магазин, оптика.
function rifle(f, x, z, kind) {
  const wood = kind === 'wood';
  f.bar(x, 0.45, z + 0.06, x, 1.78, z + 0.02, 0.032, '#1c1f24', 'steel');
  f.bar(x, 0.46, z + 0.07, x, 0.98, z + 0.09, 0.05, wood ? C.woodDk : '#2b2f35', 'matte');
  f.box(0.035, 0.2, 0.05, x, 1.1, z + 0.075, '#15171a');
  if (!wood) f.box(0.03, 0.12, 0.03, x, 1.5, z + 0.02, '#101216', 'steel');
  f.box(0.022, 0.09, 0.022, x, 1.3, z + 0.06, '#c9a227', 'steel');
}

export function detailAdmin(ctx) {
  const { kit, lib, fur, FLOOR, BUILD_H, paint, plates, rng } = ctx;
  const wf = wallFrames(kit, FLOOR);
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  kit.use('admin', 60);

  // ============ Приёмное отделение (x -31.5..-22.1, z 20.5..31.5)
  {
    const f = kit.frame(-27, 24.5, 0, FLOOR);          // стойка: посетитель на -z, служащий на +z
    f.box(6.6, 1.0, 0.9, 0, 0.5, 0, '#6b5b45');
    for (let k = -3; k <= 3; k++) f.box(0.8, 0.66, 0.02, k * 0.92, 0.5, -0.46, '#7a6850');
    f.box(6.6, 0.12, 0.03, 0, 0.06, -0.47, '#2b2f35');
    f.box(6.8, 0.06, 1.15, 0, 1.03, -0.05, '#b7aa8f');
    f.box(6.8, 0.03, 0.04, 0, 1.0, -0.62, C.steelLt, 'steel');
    for (const wx of [-3.3, -1.1, 1.1, 3.3]) f.box(0.07, 1.25, 0.07, wx, 1.7, -0.1, C.steelDk, 'steel');
    for (const wx of [-2.2, 0, 2.2]) {
      f.box(2.0, 0.95, 0.014, wx, 1.775, -0.1, '#cfe8f5', 'glass');
      f.box(2.08, 0.05, 0.08, wx, 2.28, -0.1, C.steelDk, 'steel');
      f.box(0.5, 0.03, 0.22, wx, 1.1, -0.1, C.steelLt, 'steel');                      // лоток для документов
      f.box(0.14, 0.1, 0.02, wx + 0.45, 1.65, -0.1, '#2c3239', 'steel');              // переговорная решётка
      for (let k = 0; k < 4; k++) f.box(0.1, 0.008, 0.022, wx + 0.45, 1.62 + k * 0.02, -0.1, '#0c0e10');
    }
    // рабочие места клерков: мониторы, клавиатуры, телефон, бумаги
    for (const wx of [-2.2, 2.2]) {
      fur.monitor(f, wx, 1.06, 0.3, 'glowS');
      fur.keyboard(f, wx, 1.06, 0.1);
      fur.papers(f, wx + 0.55, 1.06, 0.25);
    }
    fur.phone(f, -1.2, 1.06, 0.25);
    fur.mug(f, 1.3, 1.06, 0.22, C.orange);
    // дактилоскопия: стеклянная панель сканера, подсветка, упор для ладони, штемпельная подушка
    f.box(0.5, 0.06, 0.36, 0, 1.09, -0.42, '#20242a', 'steel');
    f.box(0.36, 0.01, 0.24, 0, 1.125, -0.42, '#6fd0ff', 'glowS');
    f.box(0.22, 0.03, 0.16, -1.2, 1.095, -0.4, '#111418');
    f.box(0.18, 0.012, 0.12, -1.2, 1.115, -0.4, '#2a2f4a');
    // корзины для личных вещей (оранжевые)
    for (let k = 0; k < 3; k++) f.box(0.5, 0.18 + k * 0.001, 0.36, 2.6, 1.15 + k * 0.19, -0.35, C.orange);
    // стопка пропусков/анкет
    for (let k = 0; k < 6; k++) f.box(0.21, 0.006, 0.3, -2.7, 1.07 + k * 0.007, -0.38, k % 2 ? '#f0ecdd' : '#d9e3ee');
    // кресла служащих (лицом к стойке)
    for (const wx of [-1.75, 1.75]) fur.chair(f.sub(wx, 1.65, Math.PI), 0, 0);
    // кнопка вызова и штамп
    f.box(0.06, 0.04, 0.06, 0.9, 1.08, -0.5, '#c0392b');
    f.cyl(0.03, 0.03, 0.06, 1.2, 1.1, -0.45, '#222', 8);
  }
  // стена с мерной шкалой и камера на штативе; жёлтая линия на полу
  {
    const f = wf('zhi', 31.5, -26);
    f.box(0.03, 2.2, 1.4, 0.015, 1.1, 0, '#e8e6dc');
    f.box(0.034, 0.1, 1.4, 0.03, 2.25, 0, '#2b2f35');
    for (let k = 0; k <= 12; k++) f.box(0.012, 0.012, k % 5 === 0 ? 0.55 : 0.28, 0.04, 0.55 + k * 0.125, -0.38, '#222');
    for (let k = 0; k <= 12; k++) f.box(0.012, 0.012, k % 5 === 0 ? 0.55 : 0.28, 0.04, 0.55 + k * 0.125, 0.38, '#222');
    plate(plates, 'ВЫСОТА · HEIGHT', -26, FLOOR + 2.3, 31.46, 0, -1, 1.2, 0.2, { bg: '#1b1d22', fg: '#f2f2f2', frame: '#e8e6dc' });
    paint.flat(-27.2, 29.5, -24.8, 29.62, FLOOR + 0.004, '#e8c23a');
    paint.flat(-26.35, 30.2, -26.05, 30.7, FLOOR + 0.004, '#e8c23a');
    paint.flat(-25.95, 30.2, -25.65, 30.7, FLOOR + 0.004, '#e8c23a');
    const t = kit.frame(-26, 27.4, 0, FLOOR);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      t.bar(0, 1.25, 0, Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42, 0.03, '#2b2f35', 'steel');
    }
    t.box(0.18, 0.14, 0.2, 0, 1.33, 0, '#1c1f24', 'steel');
    t.pipe(0.05, 0.14, 'z', 0, 1.33, 0.16, '#0c0e12', 10, 'steel');
    t.box(0.1, 0.05, 0.05, 0.1, 1.45, 0, '#f5f2e8');
  }
  // картотека, шкаф для хранения
  {
    const f = wf('zhi', 31.5, -30.3);
    for (const z of [-0.0, -0.55, 0.55]) filing(f, z);
    lib.extinguisher(wf('zhi', 31.5, -22.6), 0.0, 0);
    lib.camera(kit.frame(-31.2, 31.2, -Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(-22.4, 20.8, Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
    lib.clock(wf('zhi', 31.5, -23.6), 0.03, 2.9, 0);
  }
  // шкафчики для вещей вдоль западной стены (z 25 -> 20.8)
  {
    const f = kit.frame(-31.25, 25.0, Math.PI / 2, FLOOR);
    fur.lockers(f, 0, 0, 11, { w: 0.38, color: '#6b7a8a' });
    lib.noticeBoard(wf('xlo', -31.5, 27.0), 0.03, 1.6, 0, 1.3, 0.9);
    lib.exitSign(wf('xlo', -31.5, 23.0), 0.03, 3.4, 0);
  }
  // скамья «обезьянника» у западной стены с кольцами для наручников
  {
    const f = wf('xlo', -31.5, 29.2);
    f.box(0.45, 0.06, 3.0, 0.26, 0.46, 0, '#7b8794', 'steel');
    for (const z of [-1.35, 0, 1.35]) f.box(0.4, 0.46, 0.06, 0.26, 0.23, z, C.steelDk, 'steel');
    f.box(0.04, 0.3, 3.0, 0.02, 0.9, 0, '#59636d', 'steel');
    for (const z of [-1.0, 0, 1.0]) {
      f.torus(0.05, 0.012, 0.04, 0.78, z, '#9aa5af', 'x', 'steel', 10, 4);
      f.bar(0.05, 0.78, z, 0.22, 0.52, z + 0.12, 0.012, '#8e98a3', 'steel');
      f.torus(0.045, 0.01, 0.22, 0.52, z + 0.12, '#9aa5af', 'y', 'steel', 8, 3);
    }
    plate(plates, 'ЖДАТЬ СТОЯ ИЛИ НА СКАМЬЕ', -31.46, FLOOR + 2.2, 29.2, 1, 0, 1.8, 0.28, WARN);
  }
  // ряд кресел-на-балке у перегородки начальника
  {
    const f = wf('xhi', -22.125, 29.4);
    f.box(0.08, 0.1, 2.2, 0.3, 0.33, 0, '#3a424b', 'steel');
    for (const z of [-0.7, 0, 0.7]) {
      f.box(0.42, 0.045, 0.45, 0.32, 0.46, z, '#3d5a7a');
      f.box(0.04, 0.4, 0.45, 0.1, 0.7, z, '#3d5a7a');
    }
    for (const z of [-1.0, 1.0]) f.box(0.35, 0.34, 0.05, 0.3, 0.17, z, C.steelDk, 'steel');
    lib.fountain(wf('zlo', 20.5, -23.4), 0.2, 0);
    lib.bin(wf('zlo', 20.5, -23.8), 0.5, 0.3);
  }
  plate(plates, 'ПРИЁМНОЕ ОТДЕЛЕНИЕ · INTAKE', -27, FLOOR + 3.05, 31.46, 0, -1, 3.8, 0.5, SIGN);
  plate(plates, 'ПРЕДЪЯВИТЕ ДОКУМЕНТЫ', -25, FLOOR + 2.55, 24.0 - 0.0, 0, -1, 1.5, 0.2, GREEN);
  plate(plates, 'ОРУЖИЕ И ОПАСНЫЕ ПРЕДМЕТЫ СДАЙТЕ ДО ВХОДА', -30.0, FLOOR + 2.7, 20.46, 0, 1, 2.6, 0.3, WARN);
  fur.flag(kit.frame(-30.9, 30.6, Math.PI, FLOOR), 0, 0, 'us');
  fur.flag(kit.frame(-23.3, 30.6, Math.PI, FLOOR), 0, 0, 'state');
  lib.ceilRun('tray', 'z', 20.6, 31.4, -29.5, BUILD_H - FLOOR - 0.2, '#59636d');
  lib.ceilRun('duct', 'x', -31.4, -22.2, 22.2, BUILD_H - FLOOR - 0.32, '#9aa4ad');
  for (let x = -30; x < -22.5; x += 3) for (const z of [23.5, 29]) lib.sprinkler(kit.frame(x, z, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
  lib.smoke(kit.frame(-26.8, 27.5, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
  paint.flat(-28.9, 21.0, -25.1, 23.2, FLOOR + 0.004, '#8a2e2e');                            // дорожка к стойке
  paint.flat(-28.8, 21.1, -25.2, 23.1, FLOOR + 0.008, '#a33a3a');

  // ============ Кабинет начальника (x -21.8..-15.2, z 20.5..31.5)
  {
    const f = kit.frame(-18.5, 29.55, Math.PI, FLOOR);                  // +z рамки — сторона посетителя (к -z мира)
    fur.desk(f, 0, 0, { w: 2.4, d: 1.1, top: '#4a3322', body: '#3b2a1a' });
    f.box(0.9, 0.012, 0.55, 0, 0.785, -0.15, '#243a2a');                  // кожаный бювар
    const s = f.sub(0.6, -0.05, Math.PI);
    fur.monitor(s, 0, 0.78, 0, 'glowS');
    fur.keyboard(f.sub(0.55, -0.3, Math.PI), 0, 0.78, 0);
    fur.phone(f, -0.9, 0.78, -0.2);
    fur.papers(f, -0.4, 0.78, -0.25, 5);
    fur.mug(f, 0.95, 0.78, -0.35, C.red);
    f.box(0.32, 0.07, 0.1, 0, 0.81, 0.4, '#d8b14a');                      // именная табличка
    f.box(0.3, 0.03, 0.08, 0, 0.855, 0.4, '#1b1d22');
    // настольная лампа с зелёным абажуром
    f.cyl(0.08, 0.1, 0.04, -0.95, 0.8, 0.2, '#8a6d2e', 8, 'steel');
    f.cyl(0.015, 0.015, 0.3, -0.95, 0.97, 0.2, '#8a6d2e', 6, 'steel');
    f.box(0.26, 0.1, 0.12, -0.95, 1.14, 0.2, '#2d5a3a');
    f.box(0.22, 0.012, 0.09, -0.95, 1.085, 0.2, '#ffe9b0', 'glowW');
    fur.chair(f, 0, -0.95, '#3a2a22', true, true);
    // кожаное кресло в углу и столик
    const c = kit.frame(-16.4, 22.2, Math.PI * 0.75, FLOOR);
    c.box(0.8, 0.4, 0.75, 0, 0.3, 0, '#4a2f22');
    c.box(0.8, 0.5, 0.18, 0, 0.7, -0.3, '#4a2f22');
    for (const sx of [-1, 1]) c.box(0.14, 0.28, 0.7, sx * 0.4, 0.55, 0.02, '#4a2f22');
    c.box(0.64, 0.12, 0.5, 0, 0.5, 0.05, '#5a3a2a');
    const tb = kit.frame(-17.5, 21.5, 0, FLOOR);
    tb.cyl(0.28, 0.28, 0.04, 0, 0.55, 0, '#3b2a1a', 14);
    tb.cyl(0.04, 0.05, 0.53, 0, 0.27, 0, '#2b2f36', 8, 'steel');
    tb.cyl(0.18, 0.2, 0.02, 0, 0.01, 0, '#2b2f36', 12, 'steel');
    // сейф
    const sf = kit.frame(-21.0, 21.6, 0, FLOOR);
    sf.box(0.6, 0.8, 0.55, 0, 0.4, 0, '#2f3439', 'steel');
    sf.box(0.5, 0.7, 0.02, 0, 0.4, 0.28, '#3d444b', 'steel');
    sf.cyl(0.07, 0.07, 0.03, 0.0, 0.5, 0.3, '#b9c3cc', 12, 'steel');
    sf.box(0.14, 0.03, 0.03, 0.0, 0.5, 0.33, '#b9c3cc', 'steel');
    sf.box(0.06, 0.1, 0.02, 0.17, 0.3, 0.3, '#15171a');
    // книжные шкафы у перегородок (вдоль z 29.5..31)
    bookcase(wf('xlo', -21.875, 30.3), 0, 1.45, 2.1, rng, pick);
    bookcase(wf('xhi', -15.125, 30.3), 0, 1.45, 2.1, rng, pick);
    // дипломы, герб, часы
    const sw = wf('zhi', 31.5, -18.5);
    for (const dz of [-1.0, 0, 1.0]) {
      sw.box(0.035, 0.5, 0.4, 0.018, 1.95, dz, '#3b2a1a');
      sw.box(0.03, 0.42, 0.32, 0.022, 1.95, dz, '#ece5cc');
      sw.box(0.036, 0.1, 0.1, 0.03, 1.8, dz, '#a3262a');
    }
    sw.box(0.04, 0.7, 1.0, 0.02, 2.65, 0, '#3b2a1a');
    sw.box(0.035, 0.6, 0.9, 0.024, 2.65, 0, '#2c3e5a');
    sw.sph(0.18, 0.04, 2.65, 0, '#d8b14a', 0.3, 1, 1, 'steel', 8);
    lib.clock(wf('xhi', -15.125, 24.0), 0.03, 2.8, 0);
    lib.camera(kit.frame(-21.6, 31.2, -Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    plant(kit.frame(-21.2, 24.6, 0, FLOOR), 0, 0, rng);
    plant(kit.frame(-15.6, 25.2, 0, FLOOR), 0, 0, rng);
    fur.flag(kit.frame(-20.45, 30.95, Math.PI, FLOOR), 0, 0, 'us');
    fur.flag(kit.frame(-16.6, 30.95, Math.PI, FLOOR), 0, 0, 'state');
    paint.flat(-20.4, 26.6, -16.6, 31.0, FLOOR + 0.004, '#5a2424');                       // ковёр
    paint.flat(-20.3, 26.7, -16.7, 30.9, FLOOR + 0.008, '#7a3030');
    paint.flat(-20.0, 27.0, -17.0, 30.6, FLOOR + 0.012, '#5a2424');
    plate(plates, 'НАЧАЛЬНИК ТЮРЬМЫ · WARDEN', -18.5, FLOOR + 3.2, 31.46, 0, -1, 2.6, 0.3, { bg: '#2a1d12', fg: '#f2e6c0', frame: '#d8b14a' });
    lib.sprinkler(kit.frame(-19, 24, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
    lib.sprinkler(kit.frame(-17, 29, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
  }

  // ============ Оружейная (x -14.9..-8.5, z 20.5..31.5)
  {
    // три стойки вдоль восточной стены (z 22.5, 25.5, 28.5): лицом к -x (к комнате)
    for (let r = 0; r < 3; r++) {
      const zc = 22.5 + r * 3.0;
      const f = kit.frame(-9.2, zc, -Math.PI / 2, FLOOR);          // +x рамки = +z мира, +z рамки = -x мира (фронт)
      for (const sx of [-1, 1]) f.box(0.06, 2.2, 0.4, sx * 0.78, 1.1, 0, '#3a4350', 'steel');
      f.box(1.6, 0.06, 0.4, 0, 2.2, 0, '#3a4350', 'steel');
      f.box(1.6, 0.06, 0.4, 0, 0.35, 0, '#3a4350', 'steel');
      f.box(1.52, 2.0, 0.025, 0, 1.2, -0.17, '#1a1e24', 'steel');
      for (let k = 0; k < 8; k++) f.box(1.52, 0.012, 0.03, 0, 0.5 + k * 0.22, -0.16, '#2c3239', 'steel');
      f.box(1.52, 0.04, 0.12, 0, 1.78, 0.04, '#59636d', 'steel');
      f.box(1.52, 0.04, 0.12, 0, 0.42, 0.04, '#59636d', 'steel');
      if (r < 2) for (let k = 0; k < 5; k++) rifle(f, -0.6 + k * 0.3, 0.02, k % 2 ? 'wood' : 'black');
      else {
        // пистолетная панель с кобурами и дробовики
        for (let k = 0; k < 4; k++) rifle(f, -0.6 + k * 0.3, 0.02, 'wood');
        for (let k = 0; k < 4; k++) {
          f.box(0.1, 0.18, 0.05, -0.6 + k * 0.3, 1.12, 0.1, '#15171a');
          f.box(0.04, 0.12, 0.05, -0.6 + k * 0.3, 1.14, 0.12, '#444a52', 'steel');
        }
      }
      f.box(0.3, 0.05, 0.04, 0.0, 2.1, 0.2, '#d8d2b8');
    }
    // стеллаж с ящиками боеприпасов у западной перегородки (z 29.3..31.2)
    const sh = wf('xlo', -14.875, 30.3);
    sh.box(0.32, 0.03, 1.6, 0.16, 0.12, 0, '#8e98a3', 'steel');
    sh.box(0.32, 0.03, 1.6, 0.16, 0.7, 0, '#8e98a3', 'steel');
    sh.box(0.32, 0.03, 1.6, 0.16, 1.28, 0, '#8e98a3', 'steel');
    sh.box(0.32, 0.03, 1.6, 0.16, 1.86, 0, '#8e98a3', 'steel');
    for (const z of [-0.78, 0.78]) sh.box(0.34, 1.9, 0.04, 0.17, 0.95, z, '#3f6a9a', 'steel');
    for (let t = 0; t < 4; t++) for (let k = 0; k < 4; k++) {
      sh.box(0.26, 0.17, 0.3, 0.16, 0.22 + t * 0.58, -0.55 + k * 0.37, k % 2 ? '#4a5a34' : '#3b4a2a');
      sh.box(0.27, 0.025, 0.12, 0.162, 0.3 + t * 0.58, -0.55 + k * 0.37, '#c9b36b');
    }
    // зарядная стойка раций на южной стене и щит-комплекты
    const rc = wf('zhi', 31.5, -11.6);
    rc.box(0.12, 0.35, 1.6, 0.06, 1.35, 0, '#2b2f36', 'steel');
    for (let k = 0; k < 6; k++) {
      const z = -0.65 + k * 0.26;
      rc.box(0.09, 0.2, 0.06, 0.15, 1.38, z, '#15171a');
      rc.box(0.015, 0.1, 0.015, 0.17, 1.55, z + 0.02, '#15171a');
      rc.box(0.012, 0.012, 0.012, 0.21, 1.28, z, '#3aff7a', 'glowG');
    }
    for (let k = 0; k < 3; k++) {                                           // щиты и каски
      const sf = wf('zhi', 31.5, -13.6 + k * 0.5 + 3.0 * 0);
      sf.box(0.05, 1.1, 0.4, 0.04, 1.0, 0, '#cfe8f5', 'glass');
      sf.box(0.06, 0.06, 0.42, 0.04, 1.58, 0, '#1c1f24', 'steel');
    }
    for (let k = 0; k < 4; k++) {
      const hf = wf('zhi', 31.5, -10.0 + k * 0.35);
      hf.sph(0.14, 0.15, 1.3, 0, '#1c2a3a', 1, 0.8, 1, 'matte', 8);
      hf.box(0.03, 0.05, 0.22, 0.2, 1.32, 0, '#cfe8f5', 'glass');
    }
    // клиринговый бочонок с песком и стол для чистки оружия
    const bf = kit.frame(-13.3, 21.5, 0, FLOOR);
    bf.cyl(0.26, 0.26, 0.6, 0, 0.3, 0, '#e8c23a', 14);
    bf.torus(0.26, 0.015, 0, 0.36, 0, '#1c1f24', 'y', 'steel', 14, 4);
    bf.torus(0.26, 0.015, 0, 0.12, 0, '#1c1f24', 'y', 'steel', 14, 4);
    bf.cyl(0.2, 0.2, 0.02, 0, 0.6, 0, '#b8a678', 12);
    plate(plates, 'РАЗРЯДИТЬ ОРУЖИЕ', -13.3, FLOOR + 1.0, 21.2, 0, -1, 0.5, 0.15, WARN);
    const tf = kit.frame(-11.6, 29.6, 0, FLOOR);
    tf.box(1.4, 0.05, 0.7, 0, 0.78, 0, '#7a7f86', 'steel');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tf.box(0.05, 0.76, 0.05, sx * 0.64, 0.38, sz * 0.3, C.steelDk, 'steel');
    tf.box(0.5, 0.03, 0.12, -0.2, 0.83, 0.0, '#1c1f24', 'steel');
    tf.box(0.2, 0.04, 0.1, 0.3, 0.84, -0.1, '#2b2f35');
    tf.box(0.4, 0.015, 0.3, 0.3, 0.808, 0.1, '#b8a678');
    fur.mug(tf, -0.55, 0.805, 0.2, C.blue);
    lib.camera(kit.frame(-14.6, 31.2, -Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.exitSign(wf('xhi', -8.5, 21.8), 0.03, 3.4, 0);
    lib.extinguisher(wf('zlo', 20.5, -9.5), 0.0, 0);
    plate(plates, 'ОРУЖЕЙНАЯ · ARMORY', -11.6, FLOOR + 3.0, 31.46, 0, -1, 2.6, 0.32, { bg: '#2a2f1e', fg: '#e8e2b0', frame: '#8a9a4a' });
    plate(plates, 'ТОЛЬКО ПЕРСОНАЛ', -11.5, FLOOR + 2.7, 20.46, 0, 1, 1.8, 0.24, WARN);
    lib.ceilRun('tray', 'x', -14.6, -8.7, 26.0, BUILD_H - FLOOR - 0.2, '#59636d');
    paint.flat(-14.0, 24.0, -10.0, 24.1, FLOOR + 0.004, '#e8c23a');                      // линия «не заходить»
  }
}

export function detailGate(ctx) {
  const { kit, lib, fur, FLOOR, BUILD_H, H0, paint, plates, rng } = ctx;
  const wf = wallFrames(kit, FLOOR);
  kit.use('gate', 90);
  // ---- Будка западная: пульт (z 20.5..25), комната отдыха (25..31), панель внешних ворот (31..35.5)
  const consoleDesk = (x, z, mirror = 1) => {
    const f = kit.frame(x, z, 0, FLOOR);
    f.box(2.2, 0.76, 0.9, 0, 0.38, 0, '#4a4f56', 'steel');
    f.box(2.3, 0.05, 1.0, 0, 0.78, 0, '#2a2e34', 'steel');
    f.box(2.2, 0.5, 0.06, 0, 1.08, -0.4, '#1d2127', 'steel');
    for (let k = -1; k <= 1; k++) {
      const m = f.sub(k * 0.7 * mirror, -0.35, 0);
      fur.monitor(m, 0, 0.8, 0, k === 0 ? 'glowG' : 'glowS', 0.55, 0.34);
    }
    fur.keyboard(f, -0.4, 0.8, 0.12);
    // кнопочная панель управления воротами: два больших грибка, рычаг, лампочки
    f.box(0.7, 0.04, 0.3, 0.55, 0.81, 0.25, '#3a424b', 'steel');
    f.cyl(0.035, 0.03, 0.04, 0.4, 0.85, 0.25, '#2fb35a', 8);
    f.cyl(0.035, 0.03, 0.04, 0.55, 0.85, 0.25, '#c0392b', 8);
    f.box(0.02, 0.1, 0.02, 0.72, 0.88, 0.25, C.steelLt, 'steel');
    f.sph(0.03, 0.72, 0.94, 0.25, '#c0392b', 1, 1, 1, 'matte', 6);
    for (let k = 0; k < 4; k++) f.box(0.02, 0.02, 0.02, 0.36 + k * 0.1, 0.84, 0.36, ['#3aff7a', '#ffb23a', '#ff4a3a', '#3aff7a'][k], ['glowG', 'glowA', 'glowR', 'glowG'][k]);
    fur.phone(f, -0.85, 0.8, 0.2);
    fur.mug(f, 0.95, 0.8, 0.15, C.white);
    fur.papers(f, -0.8, 0.8, -0.1, 2);
    fur.chair(f.sub(0.7 * mirror, 1.35, Math.PI), 0, 0, '#2b2f36');
  };
  consoleDesk(-5.4, 22.4);
  consoleDesk(5.4, 22.4, -1);
  // ---- стены будок: ключница, расписание, шкафчики, огнетушитель, камеры
  const keyBoard = (f, z) => {
    f.box(0.07, 0.95, 0.75, 0.035, 1.5, z, '#2c3239', 'steel');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      f.box(0.03, 0.06, 0.012, 0.09, 1.15 + r * 0.19, z - 0.3 + c * 0.12, (r + c) % 3 ? C.steelLt : '#c9a227', 'steel');
      f.box(0.012, 0.03, 0.04, 0.09, 1.2 + r * 0.19, z - 0.3 + c * 0.12, (r * 3 + c) % 4 ? '#c0392b' : '#3a7d4a');
    }
  };
  keyBoard(wf('xlo', -7.5, 21.9), 0);
  keyBoard(wf('xhi', 7.5, 21.9), 0);
  lib.noticeBoard(wf('xlo', -7.5, 24.0), 0.03, 1.7, 0, 1.2, 0.85);
  lib.noticeBoard(wf('xhi', 7.5, 24.0), 0.03, 1.7, 0, 1.2, 0.85);
  lib.extinguisher(wf('xlo', -7.5, 20.9), 0.0, 0);
  lib.clock(wf('xhi', 7.5, 21.0), 0.03, 3.0, 0);
  // зона отдыха в западной будке: стол, стулья, кофемашина, холодильник
  {
    const f = kit.frame(-5.2, 27.8, 0, FLOOR);
    f.box(1.4, 0.05, 0.9, 0, 0.74, 0, '#c9c2a8');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.05, 0.72, 0.05, sx * 0.62, 0.36, sz * 0.38, C.steelDk, 'steel');
    for (const [cx, cz, ry] of [[-0.9, 0, Math.PI / 2], [0.9, 0, -Math.PI / 2], [0, 0.75, Math.PI], [0, -0.75, 0]]) {
      const c = f.sub(cx, cz, ry);
      c.box(0.42, 0.04, 0.42, 0, 0.45, 0, '#3d5a7a');
      c.box(0.42, 0.4, 0.04, 0, 0.68, -0.2, '#3d5a7a');
      for (const a of [-1, 1]) for (const b of [-1, 1]) c.box(0.03, 0.43, 0.03, a * 0.18, 0.22, b * 0.18, C.steelDk, 'steel');
    }
    fur.mug(f, -0.3, 0.765, 0.1, C.orange); fur.mug(f, 0.35, 0.765, -0.2, C.white);
    f.box(0.3, 0.02, 0.2, 0.0, 0.775, 0.0, '#e8e3d2');
    const fr = wf('xlo', -7.5, 28.0);
    fr.box(0.6, 1.8, 0.6, 0.3, 0.9, 0, '#e8eaec', 'steel');
    fr.box(0.012, 0.8, 0.02, 0.605, 1.3, 0.28, C.steelDk, 'steel');
    fr.box(0.012, 0.9, 0.02, 0.605, 0.45, 0.28, C.steelDk, 'steel');
    fr.box(0.01, 0.015, 0.58, 0.605, 1.4, 0, '#c8cdd2', 'steel');
    const cm = wf('xlo', -7.5, 29.5);
    cm.box(0.5, 0.06, 0.9, 0.26, 0.78, 0, '#6b5b45');
    cm.box(0.4, 0.74, 0.8, 0.25, 0.37, 0, '#4a4f56', 'steel');
    cm.box(0.22, 0.34, 0.3, 0.2, 0.98, -0.2, '#1d2127', 'steel');
    cm.box(0.012, 0.25, 0.24, 0.318, 0.98, -0.2, '#2a2f35');
    cm.box(0.08, 0.01, 0.08, 0.26, 0.82, -0.2, '#c0392b', 'glowR');
    fur.mug(cm, 0.3, 0.81, 0.15, C.white);
  }
  // раздевалка и склад восточной будки
  {
    fur.lockers(kit.frame(3.2, 28.0, 0, FLOOR), 0, 0, 8, { w: 0.4, color: '#5f6f5a' });
    const b = kit.frame(5.5, 29.6, 0, FLOOR);
    b.box(2.0, 0.05, 0.4, 0, 0.45, 0, C.woodLt);
    for (const sx of [-1, 1]) b.box(0.05, 0.45, 0.36, sx * 0.9, 0.22, 0, C.steelDk, 'steel');
    fur.shelving(kit.frame(5.6, 33.8, 0, FLOOR), 0, 0, 2.6, 0.5, 4);
    fur.shelving(kit.frame(5.6, 31.9, Math.PI, FLOOR), 0, 0, 2.6, 0.5, 3, 1.8);
    for (const x of [3.6, 4.1, 4.6]) fur.cone(kit.frame(x, 35.0, 0, FLOOR), 0, 0);
    fur.mopBucket(kit.frame(7.0, 35.0, 0, FLOOR), 0, 0);
    lib.bin(kit.frame(7.1, 23.4, 0, FLOOR), 0, 0);
    lib.bin(kit.frame(-7.0, 23.4, 0, FLOOR), 0, 0);
  }
  // ---- Проход шлюза (x -2.4..2.4)
  const gateFrame = (z, label) => {
    const f = kit.frame(0, z, 0, FLOOR);
    for (const sx of [-1, 1]) {
      f.box(0.24, 3.9, 0.3, sx * 2.38, 1.95, 0, '#4a4f56', 'steel');
      f.box(0.3, 0.2, 0.36, sx * 2.38, 0.1, 0, '#2b2f35', 'steel');
      f.box(0.3, 0.1, 0.36, sx * 2.38, 3.95, 0, '#2b2f35', 'steel');
    }
    f.box(5.1, 0.3, 0.32, 0, 3.9, 0, '#4a4f56', 'steel');
    f.box(5.1, 0.08, 0.34, 0, 4.07, 0, '#2b2f35', 'steel');
    for (let k = -8; k <= 8; k++) f.box(0.03, 0.2, 0.02, k * 0.3, 3.9, 0.17, '#2b2f35');
    f.box(5.2, 0.05, 0.12, 0, 0.03, 0, '#23262b', 'steel');                          // направляющая
    f.box(0.5, 0.16, 0.3, 1.1, 4.05, 0.0, '#c8a73a', 'steel');                       // привод
    f.box(0.3, 0.09, 0.02, -1.0, 4.0, 0.17, label === 'outer' ? '#ff4a3a' : '#ffb23a', label === 'outer' ? 'glowR' : 'glowA');
    f.cyl(0.11, 0.11, 0.2, 2.1, 4.22 - 0.02, 0, '#e8c23a', 8, 'steel');
    f.cyl(0.09, 0.09, 0.14, 2.1, 4.38, 0, '#ffb23a', 8, 'glowA');
  };
  gateFrame(27.0, 'inner');
  gateFrame(36.75, 'outer');
  // пост управления на стойках и звонки
  const kiosk = (x, z, ry) => {
    const f = kit.frame(x, z, ry, FLOOR);
    f.cyl(0.07, 0.09, 1.2, 0, 0.6, 0, '#4a4f56', 10, 'steel');
    f.cyl(0.16, 0.2, 0.04, 0, 0.02, 0, '#2b2f35', 12, 'steel');
    f.box(0.3, 0.38, 0.16, 0, 1.38, 0.0, '#3a424b', 'steel');
    f.box(0.22, 0.14, 0.01, 0, 1.5, 0.085, '#6fd0ff', 'glowS');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) f.box(0.04, 0.025, 0.012, -0.06 + c * 0.06, 1.34 - r * 0.045, 0.085, '#cfd6dc', 'steel');
    f.box(0.05, 0.05, 0.012, 0.1, 1.5, 0.085, '#3aff7a', 'glowG');
  };
  kiosk(1.9, 25.6, Math.PI);
  kiosk(-1.9, 25.6, Math.PI);
  kiosk(1.9, 34.4, 0);
  kiosk(-1.9, 34.4, 0);
  // жёлто-чёрная разметка перед воротами, стоп-линии
  fur.hazard(paint, -2.4, 26.3, 2.4, 26.7, FLOOR + 0.004);
  fur.hazard(paint, -2.4, 27.3, 2.4, 27.7, FLOOR + 0.004);
  fur.hazard(paint, -2.4, 35.7, 2.4, 36.1, FLOOR + 0.004);
  paint.flat(-2.4, 24.9, 2.4, 25.0, FLOOR + 0.004, '#ffffff');
  paint.flat(-2.4, 33.9, 2.4, 34.0, FLOOR + 0.004, '#ffffff');
  paint.flat(-0.04, 20.5, 0.04, 35.5, FLOOR + 0.004, '#8e98a3');
  // арка металлодетектора
  {
    const f = kit.frame(0, 30.5, 0, FLOOR);
    for (const sx of [-1, 1]) {
      f.box(0.3, 2.2, 0.45, sx * 1.0, 1.1, 0, '#3a424b', 'steel');
      f.box(0.12, 1.6, 0.02, sx * 0.84, 1.1, 0.0, '#8fb4ff', 'glowS');
      for (let k = 0; k < 8; k++) f.box(0.02, 0.03, 0.03, sx * 1.16, 0.4 + k * 0.22, 0.2, k < 3 ? '#3aff7a' : '#ff4a3a', k < 3 ? 'glowG' : 'glowR');
    }
    f.box(2.3, 0.3, 0.5, 0, 2.3, 0, '#3a424b', 'steel');
    f.box(0.5, 0.1, 0.02, 0, 2.3, 0.26, '#3aff7a', 'glowG');
    f.box(0.2, 0.1, 0.02, 0.7, 2.3, 0.26, '#ff4a3a', 'glowR');
  }
  // выпуклое зеркало и камеры в проходе
  {
    const f = wf('xlo', -2.375, 21.5);
    f.box(0.03, 0.4, 0.04, 0.016, 2.5, 0, C.steelDk, 'steel');
    f.sph(0.28, 0.15, 3.0, 0, '#cfd9e0', 0.35, 1, 1, 'steel', 14);
    lib.camera(kit.frame(-2.2, 21.0, Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(2.2, 21.0, -Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(-2.2, 35.2, Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(2.2, 35.2, -Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.horn(wf('xhi', 2.375, 29.0), 0.0, 3.5, 0);
    lib.horn(wf('xlo', -2.375, 29.0), 0.0, 3.5, 0);
  }
  lib.ceilRun('tray', 'z', 20.7, 35.3, -1.6, BUILD_H - FLOOR - 0.2, '#59636d');
  lib.ceilRun('pipe', 'z', 20.7, 35.3, 1.6, BUILD_H - FLOOR - 0.25, '#7a8591');
  plate(plates, 'ШЛЮЗ · SALLY PORT', 0, FLOOR + 3.3, 35.46, 0, -1, 2.2, 0.28, WARN);
  plate(plates, 'ОДНИ ВОРОТА ЗА РАЗ', 0, FLOOR + 3.3, 20.54, 0, 1, 2.2, 0.28, WARN);
  plate(plates, 'ОСТАНОВИТЬСЯ · СТОП', -2.0, FLOOR + 2.6, 27.2, 0, -1, 1.2, 0.2, WARN);
  plate(plates, 'ВНУТРЕННИЕ ВОРОТА', 2.0, FLOOR + 2.6, 26.8, 0, 1, 1.4, 0.2, SIGN);
  plate(plates, 'ПОСТ №1', -7.46, FLOOR + 2.3, 20.9, 1, 0, 0.6, 0.2, SIGN);
  plate(plates, 'ПОСТ №2', 7.46, FLOOR + 2.3, 20.9, -1, 0, 0.6, 0.2, SIGN);

  // ---- Наружный фасад ворот и подъезд (z 37.5..43, тротуар)
  kit.use('outside', 110);
  {
    const f = kit.frame(0, 37.5, 0, 0);
    for (const sx of [-1, 1]) {
      f.box(0.5, 4.2, 0.5, sx * 3.1, 2.1, 0.25, '#9a9a96');
      f.box(0.6, 0.15, 0.6, sx * 3.1, 4.28, 0.25, '#6f716f');
      f.box(0.4, 0.3, 0.4, sx * 3.1, 4.5, 0.25, '#2b2f35', 'steel');
      f.box(0.3, 0.2, 0.02, sx * 3.1, 4.5, 0.46, '#ffb23a', 'glowA');
    }
    // прожекторы над воротами
    for (const sx of [-1, 1]) {
      f.box(0.12, 0.12, 0.5, sx * 5.5, 6.0, 0.25, '#2b2f35', 'steel');
      f.box(0.6, 0.35, 0.18, sx * 5.5, 5.8, 0.55, '#2b2f35', 'steel');
      f.box(0.52, 0.28, 0.02, sx * 5.5, 5.8, 0.66, '#fff3d0', 'glowW');
    }
  }
  // отбойники, красно-белые боллардные столбики и бетонные блоки на подъезде
  for (const x of [-6.5, -8.5, -10.5, 6.5, 8.5, 10.5]) {
    const f = kit.frame(x, 39.4, 0, H0);
    f.cyl(0.11, 0.12, 0.9, 0, 0.45, 0, '#c8cdd2', 10, 'steel');
    f.cyl(0.115, 0.115, 0.14, 0, 0.7, 0, '#c0392b', 10, 'steel');
    f.cyl(0.115, 0.115, 0.1, 0, 0.5, 0, '#c0392b', 10, 'steel');
    f.sph(0.115, 0, 0.9, 0, '#c8cdd2', 1, 0.6, 1, 'steel', 8);
  }
  for (const sx of [-1, 1]) {
    const b = kit.frame(sx * 15, 39.2, 0, H0);
    for (let k = 0; k < 3; k++) {
      const j = b.sub(0, k * 1.0, 0);
      j.box(0.5, 0.2, 2.0, 0, 0.1, 0, '#a8a8a2');
      j.box(0.34, 0.6, 2.0, 0, 0.5, 0, '#a8a8a2');
      j.box(0.2, 0.2, 2.0, 0, 0.9, 0, '#b4b4ae');
      j.box(0.34, 0.2, 2.0, 0, 0.35, 0.0, '#a8a8a2');
    }
  }
  // дорожная разметка на въезде
  paint.flat(-5.5, 38.4, 5.5, 42.6, H0 + 0.045, '#2f3236');
  fur.hazard(paint, -5.5, 38.4, 5.5, 38.62, H0 + 0.05);
  paint.flat(-5.5, 42.4, 5.5, 42.6, H0 + 0.05, '#ffffff');
  paint.flat(-0.05, 38.7, 0.05, 42.3, H0 + 0.05, '#e8c23a');
  // флагштоки (США, штат, тюрьма)
  for (const [x, kind] of [[-14, 'us'], [-12, 'state'], [-10, 'prison']]) {
    const f = kit.frame(x, 41.4, 0, H0);
    f.cyl(0.08, 0.1, 0.12, 0, 0.06, 0, '#3a3e44', 10, 'steel');
    f.cyl(0.04, 0.05, 6.5, 0, 3.3, 0, '#d8dde2', 8, 'steel');
    f.sph(0.07, 0, 6.6, 0, '#e4c15a', 1, 1, 1, 'steel', 8);
    fur.flag(f.sub(0, 0, 0), 0, 0, kind, 6.4);
  }
  // знак «ПОСЕТИТЕЛИ», табличка у дороги, скамья, урна
  {
    const f = kit.frame(11.5, 41.6, 0, H0);
    f.cyl(0.05, 0.05, 2.4, 0, 1.2, 0, '#4a4f56', 8, 'steel');
    f.box(1.6, 0.9, 0.06, 0, 2.2, 0, '#1f3350', 'steel');
    f.box(0.06, 0.06, 0.06, 0, 0.05, 0, '#2b2f35');
    plate(plates, 'ПОСЕТИТЕЛИ · VISITORS', 11.5, H0 + 2.2, 41.64, 0, 1, 1.4, 0.7, SIGN);
    plate(plates, 'ПОСЕТИТЕЛИ · VISITORS', 11.5, H0 + 2.2, 41.56, 0, -1, 1.4, 0.7, SIGN);
    lib.bench(kit.frame(15.5, 41.5, Math.PI / 2, H0), 0, 0, 1.8);
    lib.bench(kit.frame(-17.5, 41.5, Math.PI / 2, H0), 0, 0, 1.8);
    lib.bin(kit.frame(14.0, 41.0, 0, H0), 0, 0);
  }
  void rng;
}

export function detailVisit(ctx) {
  const { kit, lib, fur, FLOOR, BUILD_H, paint, plates, rng } = ctx;
  const wf = wallFrames(kit, FLOOR);
  kit.use('visit', 60);
  // стойки у стекла: бетонная тумба, полка по обе стороны, перегородки между кабинками, стойки рамы стекла, трубки
  {
    const f = kit.frame(14.5, 26.2, 0, FLOOR);
    f.box(0.34, 0.98, 10.5, 0, 0.49, 0, '#8a9298');
    f.box(0.7, 0.05, 10.5, 0, 1.0, 0, '#c4cad0', 'steel');
    f.box(0.72, 0.03, 10.54, 0, 0.97, 0, '#5d6873', 'steel');
    f.box(0.12, 0.08, 10.5, 0, 3.04, 0, '#2b2f35', 'steel');
    for (const z of [-5.2, -2.6, -0.4, 1.8, 4.0, 5.2]) f.box(0.1, 2.2, 0.1, 0, 2.0, z, '#2b2f35', 'steel');
    for (const z of [-2.6, -0.4, 1.8, 4.0]) for (const s of [-1, 1]) {
      f.box(0.5, 0.52, 0.04, s * 0.45, 1.28, z, '#a9b2b8', 'steel');
      f.box(0.5, 0.04, 0.05, s * 0.45, 1.56, z, C.steelDk, 'steel');
    }
    for (let k = 0; k < 4; k++) {
      const z = -4.0 + k * 2.2 + 0.0;
      for (const s of [-1, 1]) {
        const h = f.sub(s * 0.19, z + 1.1 * 0.0, 0);
        h.box(0.09, 0.24, 0.3, 0, 1.55, 0, '#3a424b', 'steel');
        h.box(0.05, 0.1, 0.07, 0, 1.55, -0.2, '#15181c');
        h.box(0.05, 0.1, 0.07, 0, 1.55, 0.2, '#15181c');
        h.box(0.04, 0.04, 0.34, 0, 1.69, 0, '#15181c');
        for (let c = 0; c < 6; c++) h.box(0.02, 0.025, 0.025, s * 0.03, 1.4 - c * 0.07, 0.0, '#15181c');
        h.box(0.012, 0.2, 0.2, s * 0.05, 1.3, 0.0, '#59636d', 'steel');
        f.box(0.1, 0.06, 0.2, s * 0.3, 1.34, z + 0.7, '#1d2127');                         // номерной щиток-индикатор
        f.box(0.012, 0.012, 0.012, s * 0.36, 1.37, z + 0.7, k % 2 ? '#3aff7a' : '#ff4a3a', k % 2 ? 'glowG' : 'glowR');
      }
    }
  }
  // табуреты у стекла
  for (const x of [11.7, 17.3]) for (let k = 0; k < 4; k++) fur.stool(kit.frame(x, 22.5 + k * 2.2, 0, FLOOR), 0, 0);
  // стол дежурного у южной стены и шкафчики/автомат/кулер
  {
    const f = kit.frame(11.0, 30.6, Math.PI, FLOOR);
    fur.desk(f, 0, 0, { w: 1.5, d: 0.7, metal: true, top: '#6d7681', body: '#4a5560' });
    fur.monitor(f.sub(0, -0.1, Math.PI), 0, 0.78, 0, 'glowS', 0.45, 0.27);
    fur.chair(f, 0, -0.85, '#2b2f36');
    fur.lockers(kit.frame(18.5, 31.1, 0, FLOOR), 0, 0, 2, { w: 0.4, color: '#6b7a8a' });
    const v = wf('xhi', 19.5, 21.8);
    v.box(0.8, 1.9, 0.8, 0.4, 0.95, 0, '#2d5d9b', 'steel');
    v.box(0.02, 1.3, 0.55, 0.8, 1.15, -0.0, '#cfe8f5', 'glass');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) v.box(0.1, 0.1, 0.1, 0.72, 0.65 + r * 0.28, -0.22 + c * 0.14, pick4(r, c), 'matte');
    v.box(0.02, 0.4, 0.22, 0.81, 1.9 - 0.7, 0.34, '#1d2127');
    v.box(0.01, 0.03, 0.03, 0.82, 1.5, 0.34, '#3aff7a', 'glowG');
    lib.fountain(wf('xhi', 19.5, 24.4), 0.2, 0);
    lib.bin(wf('xhi', 19.5, 25.4), 0.4, 0);
  }
  // стулья ожидания у восточной стены и скамья у двери
  {
    const f = wf('xhi', 19.5, 27.5);
    f.box(0.06, 0.1, 2.6, 0.3, 0.33, 0, '#3a424b', 'steel');
    for (const z of [-0.9, -0.3, 0.3, 0.9]) {
      f.box(0.42, 0.045, 0.44, 0.3, 0.46, z, '#7a8591');
      f.box(0.04, 0.4, 0.44, 0.1, 0.7, z, '#7a8591');
    }
    lib.noticeBoard(wf('zhi', 31.5, 16.0), 0.03, 1.8, 0, 1.4, 0.9);
    lib.noticeBoard(wf('zhi', 31.5, 9.5), 0.03, 1.8, 0, 1.4, 0.9);
    lib.clock(wf('xlo', 8.5, 25.5), 0.03, 3.1, 0);
    lib.extinguisher(wf('xlo', 8.5, 21.8), 0.0, 0);
    lib.exitSign(wf('zlo', 20.5, 11.0), 0.03, 3.4, 0);
    lib.camera(kit.frame(8.8, 31.2, -Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(19.2, 31.2, Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
  }
  lib.ceilRun('tray', 'z', 20.7, 31.3, 11.5, BUILD_H - FLOOR - 0.2, '#59636d');
  lib.ceilRun('duct', 'z', 20.7, 31.3, 17.0, BUILD_H - FLOOR - 0.32, '#9aa4ad');
  for (let x = 10; x < 19; x += 3) for (const z of [23.5, 28.5]) lib.sprinkler(kit.frame(x, z, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
  paint.flat(11.0, 21.4, 12.6, 30.2, FLOOR + 0.004, '#6e7e8a');                    // дорожки к кабинкам
  paint.flat(16.4, 21.4, 18.0, 30.2, FLOOR + 0.004, '#6e7e8a');
  paint.flat(14.15, 20.6, 14.85, 21.2, FLOOR + 0.004, '#e8c23a');
  plate(plates, 'КОМНАТА СВИДАНИЙ', 14.0, FLOOR + 3.55, 20.54, 0, 1, 3.0, 0.4, SIGN);
  plate(plates, 'КОНТАКТ ЧЕРЕЗ СТЕКЛО ЗАПРЕЩЁН · ТОЛЬКО ПО ТЕЛЕФОНУ', 14.5, FLOOR + 3.35, 25.0, -1, 0, 3.4, 0.28, WARN);
  plate(plates, 'КОНТАКТ ЧЕРЕЗ СТЕКЛО ЗАПРЕЩЁН · ТОЛЬКО ПО ТЕЛЕФОНУ', 14.5, FLOOR + 3.35, 28.0, 1, 0, 3.4, 0.28, WARN);
  plate(plates, 'ВРЕМЯ СВИДАНИЯ: 30 МИНУТ', 11.0, FLOOR + 2.6, 31.46, 0, -1, 2.0, 0.26, GREEN);
  for (let k = 0; k < 4; k++) {
    plate(plates, String(k + 1), 14.37, FLOOR + 2.55, 22.5 + k * 2.2, -1, 0, 0.3, 0.3, SIGN);
    plate(plates, String(k + 1), 14.63, FLOOR + 2.55, 22.5 + k * 2.2, 1, 0, 0.3, 0.3, SIGN);
  }
  void rng;
}
const pick4 = (r, c) => ['#c0392b', '#e8c23a', '#2d7a4a', '#2d5d9b', '#e2670a', '#eeeeea'][(r * 3 + c) % 6];

export function detailInfirmary(ctx) {
  const { kit, lib, fur, FLOOR, BUILD_H, paint, plates, rng } = ctx;
  const wf = wallFrames(kit, FLOOR);
  const pick = fur.pick;
  kit.use('infirm', 60);
  const bed = (x, z, i) => {
    const f = kit.frame(x, z, 0, FLOOR);                // изголовье у +z
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      f.box(0.05, 0.3, 0.05, sx * 0.43, 0.2, sz * 0.92, '#8e98a3', 'steel');
      f.cyl(0.04, 0.04, 0.05, sx * 0.43, 0.04, sz * 0.92, '#15171a', 8);
    }
    f.box(0.9, 0.05, 1.96, 0, 0.5, 0, '#aab4bd', 'steel');
    f.box(0.84, 0.14, 1.88, 0, 0.6, 0, '#e8edf0');
    f.box(0.86, 0.04, 1.2, 0, 0.7, -0.3, ['#9fc4d9', '#c9d9a8', '#d9c9a8'][i % 3]);
    f.box(0.86, 0.045, 0.28, 0, 0.72, 0.18, '#f4f6f6');
    f.box(0.48, 0.12, 0.3, 0, 0.7, 0.72, '#f4f6f6');
    f.box(0.92, 0.55, 0.05, 0, 0.82, 0.98, '#d6dde2', 'steel');
    f.box(0.92, 0.5, 0.04, 0, 0.78, -0.98, '#d6dde2', 'steel');
    for (const s of [-1, 1]) {
      f.box(0.03, 0.05, 1.3, s * 0.46, 0.92, -0.1, '#8e98a3', 'steel');
      f.box(0.03, 0.22, 0.03, s * 0.46, 0.82, -0.7, '#8e98a3', 'steel');
      f.box(0.03, 0.22, 0.03, s * 0.46, 0.82, 0.5, '#8e98a3', 'steel');
    }
    f.box(0.5, 0.04, 0.2, 0, 0.31, -0.3, C.steelDk, 'steel');
  };
  for (let k = 0; k < 3; k++) bed(22.5 + k * 3.0, 29.5, k);
  // тумбочки между кроватями и капельницы
  for (const x of [24.0, 27.0]) {
    const f = kit.frame(x, 30.9, 0, FLOOR);
    f.box(0.45, 0.62, 0.4, 0, 0.31, 0, '#d8dee2', 'steel');
    f.box(0.4, 0.2, 0.01, 0, 0.5, -0.205, '#c3ccd2', 'steel');
    f.box(0.4, 0.2, 0.01, 0, 0.26, -0.205, '#c3ccd2', 'steel');
    f.box(0.1, 0.02, 0.02, 0, 0.52, -0.21, C.steelLt, 'steel');
    f.box(0.08, 0.08, 0.08, -0.1, 0.65, 0.0, '#e8edf0');
    f.cyl(0.04, 0.035, 0.1, 0.1, 0.67, 0, '#9fc4d9', 8, 'glass');
  }
  for (const x of [23.15, 28.85]) {
    const f = kit.frame(x, 28.3, 0, FLOOR);
    f.cyl(0.02, 0.02, 1.85, 0, 0.95, 0, '#cfd6dc', 6, 'steel');
    f.cyl(0.2, 0.22, 0.03, 0, 0.02, 0, '#2b2f35', 10, 'steel');
    for (const a of [0, 1.57, 3.14, 4.71]) f.bar(0, 0.05, 0, Math.sin(a) * 0.28, 0.02, Math.cos(a) * 0.28, 0.025, '#2b2f35', 'steel');
    f.box(0.4, 0.03, 0.03, 0, 1.88, 0, '#cfd6dc', 'steel');
    for (const s of [-1, 1]) f.box(0.12, 0.2, 0.04, s * 0.15, 1.75, 0, '#e8f4f8', 'glass');
    f.box(0.018, 0.2, 0.018, 0.15, 1.5, 0.0, '#e8f4f8', 'glass');
    f.box(0.02, 0.03, 0.02, 0.15, 1.38, 0, '#3aff7a', 'glowG');
  }
  // мониторы жизненных показателей на стойке рядом со вторым ложем
  {
    const f = kit.frame(25.5, 31.0, Math.PI, FLOOR);
    f.cyl(0.03, 0.03, 1.3, 0, 0.65, 0, '#cfd6dc', 8, 'steel');
    f.box(0.5, 0.04, 0.4, 0, 0.04, 0, '#2b2f35', 'steel');
    f.box(0.5, 0.36, 0.1, 0, 1.45, 0.0, '#1d2127', 'steel');
    f.box(0.44, 0.28, 0.01, 0, 1.45, 0.056, '#3aff7a', 'glowG');
    for (let k = 0; k < 10; k++) f.box(0.03, 0.02 + (k % 3) * 0.03, 0.01, -0.18 + k * 0.04, 1.45 + (k % 2) * 0.03, 0.062, '#0b1a10');
  }
  // шторные рельсы на потолке и шторы между койками (раздвинуты наполовину)
  for (const x of [24.0, 27.0]) {
    const f = kit.frame(x, 27.0, 0, FLOOR);
    f.box(0.03, 0.03, 4.4, 0, BUILD_H - FLOOR - 0.06, 1.2, '#cfd6dc', 'steel');
    for (let k = 0; k < 6; k++) f.box(0.025, 1.9, 0.18, 0.0, 1.9, 0.0 + k * 0.17, k % 2 ? '#a9cfd6' : '#9fc4cc');
    for (let k = 0; k < 6; k++) f.box(0.012, 0.02, 0.012, 0, BUILD_H - FLOOR - 0.08, k * 0.17, '#cfd6dc', 'steel');
  }
  // шкаф с лекарствами у восточной стены, холодильник, умывальник
  {
    const f = wf('xhi', 31.5, 24.0);
    f.box(0.4, 2.0, 2.0, 0.2, 1.0, 0, '#dfe5e8', 'steel');
    f.box(0.012, 1.0, 1.9, 0.406, 1.5, 0, '#cfe8f5', 'glass');
    f.box(0.012, 0.8, 1.9, 0.406, 0.45, 0, '#cfd6dc', 'steel');
    for (let t = 0; t < 4; t++) {
      f.box(0.3, 0.02, 1.8, 0.2, 1.25 + t * 0.2, 0, '#9aa5af', 'steel');
      for (let k = 0; k < 7; k++) f.cyl(0.03, 0.03, 0.12, 0.25, 1.33 + t * 0.2, -0.75 + k * 0.25, pick(['#e2670a', '#2d5d9b', '#eeeeea', '#2f7d4a']), 8);
    }
    f.box(0.02, 0.1, 0.06, 0.415, 1.0, 0.0, C.steelLt, 'steel');
    f.box(0.02, 0.1, 0.5, 0.415, 1.2, 0.0, '#c0392b');
    // красный крест на стене
    const x = wf('xhi', 31.5, 27.5);
    x.box(0.03, 0.9, 0.9, 0.015, 2.6, 0, '#eeeeea');
    x.box(0.04, 0.6, 0.18, 0.025, 2.6, 0, '#c0392b');
    x.box(0.04, 0.18, 0.6, 0.025, 2.6, 0, '#c0392b');
    lib.clock(wf('xhi', 31.5, 29.5), 0.03, 3.1, 0);
    lib.extinguisher(wf('xhi', 31.5, 21.4), 0.0, 0);
    // умывальник (локтевой кран, дозатор)
    const s = wf('xhi', 31.5, 22.5);
    s.box(0.4, 0.14, 0.7, 0.2, 0.9, 0, '#d8dee2', 'steel');
    s.box(0.3, 0.02, 0.5, 0.2, 0.975, 0, '#2a2f35');
    s.cyl(0.02, 0.02, 0.2, 0.06, 1.1, 0, C.steelLt, 6, 'steel');
    s.box(0.02, 0.02, 0.2, 0.12, 1.2, 0, C.steelLt, 'steel');
    s.box(0.1, 0.18, 0.08, 0.05, 1.45, 0.45, '#eeeeea');
    s.box(0.06, 0.04, 0.06, 0.08, 1.33, 0.45, '#c0392b');
    s.box(0.34, 0.45, 0.012, 0.01, 1.7, 0, '#cfd9e0', 'steel');
  }
  // осмотровый стол с бумажным рулоном, табурет, стол врача, весы, шкаф
  {
    const f = kit.frame(21.8, 23.5, Math.PI / 2, FLOOR);
    f.box(0.7, 0.12, 1.9, 0, 0.8, 0, '#2d5a6a');
    f.box(0.66, 0.012, 1.86, 0, 0.87, 0, '#eeeeea');
    f.box(0.62, 0.5, 0.5, 0, 0.35, 0.0, '#d8dee2', 'steel');
    f.cyl(0.07, 0.07, 0.66, 0, 0.93, -0.88, '#eeeeea', 10);
    f.box(0.16, 0.04, 0.5, 0, 0.18, 0.7, C.steelDk, 'steel');
    f.box(0.5, 0.16, 0.04, 0.0, 0.4, 0.55, '#d8dee2', 'steel');
    fur.stool(f.sub(0.9, 0.2, 0), 0, 0, 0.5, '#3d5a7a');
    const d = kit.frame(21.2, 26.8, Math.PI / 2, FLOOR);
    fur.desk(d, 0, 0, { w: 1.4, d: 0.7, metal: true, top: '#cfd6dc', body: '#9aa5af' });
    fur.monitor(d.sub(0, -0.1, Math.PI), 0, 0.78, 0, 'glowS', 0.45, 0.27);
    fur.chair(d, 0, -0.85, '#3d5a7a', false);
    fur.keyboard(d.sub(0, -0.3, Math.PI), 0, 0.78, 0);
    papers(d);
    const w = kit.frame(29.4, 21.5, 0, FLOOR);
    w.box(0.5, 0.06, 0.55, 0, 0.1, 0.0, '#2b2f35', 'steel');
    w.box(0.08, 1.9, 0.08, 0.2, 1.0, -0.2, '#cfd6dc', 'steel');
    w.box(0.04, 0.06, 0.4, 0.2, 1.65, 0.0, C.steelDk, 'steel');
    w.box(0.28, 0.1, 0.08, 0, 0.78, -0.2, '#1d2127', 'steel');
    w.box(0.24, 0.04, 0.02, 0, 0.8, -0.16, '#8fb4ff', 'glowS');
    // инвалидное кресло
    const c = kit.frame(22.1, 21.7, Math.PI * 0.2, FLOOR);
    c.box(0.5, 0.05, 0.5, 0, 0.5, 0, '#2b2f36');
    c.box(0.5, 0.5, 0.05, 0, 0.78, -0.25, '#2b2f36');
    for (const s of [-1, 1]) {
      c.pipe(0.28, 0.04, 'x', s * 0.3, 0.3, -0.1, '#15171a', 14, 'matte');
      c.torus(0.28, 0.014, s * 0.31, 0.3, -0.1, '#9aa5af', 'x', 'steel', 14, 4);
      c.pipe(0.08, 0.03, 'x', s * 0.29, 0.1, 0.34, '#15171a', 8, 'matte');
      c.box(0.04, 0.04, 0.4, s * 0.27, 0.62, -0.05, '#15171a');
      c.box(0.02, 0.48, 0.02, s * 0.25, 0.3, 0.3, '#9aa5af', 'steel');
    }
  }
  function papers(d) { fur.papers(d, 0.3, 0.78, -0.1, 3); }
  // санитарный контейнер для игл, контейнер с перчатками, аптечка
  lib.bin(kit.frame(23.5, 21.0, 0, FLOOR), 0, 0, '#c0392b');
  {
    const f = wf('zlo', 20.5, 25.5);
    f.box(0.14, 0.26, 0.38, 0.07, 1.4, 0, '#eeeeea');
    f.box(0.02, 0.18, 0.1, 0.15, 1.4, 0, '#2d7a4a');
    f.box(0.02, 0.05, 0.3, 0.15, 1.52, 0, '#ffffff');
    f.box(0.12, 0.2, 0.12, 0.06, 1.4, 0.5, '#e8c23a');
    lib.exitSign(wf('zlo', 20.5, 26.0), 0.03, 3.3, 0);
    lib.camera(kit.frame(31.2, 31.2, Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(20.8, 20.8, -Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
    // таблица остроты зрения
    const e = wf('xlo', 20.5, 24.0);
    e.box(0.02, 0.9, 0.4, 0.01, 1.7, 0, '#f4f4ee');
    for (let k = 0; k < 7; k++) e.box(0.015, 0.03 + (6 - k) * 0.006, 0.02 + (6 - k) * 0.01 + k * 0.03, 0.024, 2.02 - k * 0.1, 0, '#222');
  }
  lib.ceilRun('duct', 'x', 20.6, 31.4, 24.5, BUILD_H - FLOOR - 0.32, '#cfd6dc');
  lib.ceilRun('pipe', 'x', 20.6, 31.4, 22.5, BUILD_H - FLOOR - 0.25, '#7a8591');
  for (let x = 22; x < 31; x += 3) for (const z of [22.5, 27]) lib.sprinkler(kit.frame(x, z, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
  paint.flat(20.6, 25.0, 31.4, 25.12, FLOOR + 0.004, '#2d7a4a');                  // зелёная линия на пол
  paint.flat(26.0, 20.6, 26.12, 25.0, FLOOR + 0.004, '#2d7a4a');
  plate(plates, 'ЛАЗАРЕТ · INFIRMARY', 26, FLOOR + 3.4, 20.54, 0, 1, 2.8, 0.36, GREEN);
  plate(plates, 'МЫТЬ РУКИ', 31.46, FLOOR + 2.05, 22.5, -1, 0, 0.9, 0.2, GREEN);
  plate(plates, 'ВЫДАЧА ЛЕКАРСТВ: 06:00 · 20:00', 31.46, FLOOR + 3.05, 24.0, -1, 0, 2.4, 0.28, GREEN);
  void rng;
}

// Одиночные камеры («Дыра»): плита-койка, унитаз, плафон, засечки на стене; коридор, пост охраны, кресло для фиксации.
export function detailHole(ctx) {
  const { kit, lib, fur, FLOOR, BUILD_H, paint, plates, hole, rng } = ctx;
  const wf = wallFrames(kit, FLOOR);
  kit.use('seg', 55);
  hole.cells.forEach((cell, i) => {
    const [x0] = cell.rect;
    const mid = cell.mid;
    const f = kit.frame(mid, -31.5, 0, FLOOR);
    // бетонная плита-койка вдоль левой стены, тонкий матрас, свёрнутое одеяло
    const bx = x0 + 0.8 - mid;
    f.box(0.9, 0.34, 2.0, bx, 0.17, 1.0, '#7d8186');
    f.box(0.9, 0.04, 2.0, bx, 0.36, 1.0, '#6a6e73');
    for (let k = 0; k < 5; k++) f.box(0.02, 0.01, 1.96, bx - 0.36 + k * 0.18, 0.385, 1.0, '#8a8e93');
    f.box(0.8, 0.06, 1.8, bx, 0.43, 1.0, i % 2 ? '#8a8f78' : '#7e8794');
    f.box(0.6, 0.06, 0.4, bx, 0.5, 1.55, '#d9d4c0');
    f.box(0.4, 0.04, 0.3, bx, 0.52, 0.55, '#6a7a8a');
    // унитаз-умывальник
    lib.combo(f, 0.8, 0.0);
    // плафон в нише, вентиляция, решётка для воздуха
    lib.cageLamp(f.sub(0, 1.5, 0), 0, BUILD_H - FLOOR - 0.07, 0, 0.8, 0.22);
    lib.vent(kit.frame(mid - 0.6, -31.5, -Math.PI / 2, FLOOR), 0.02, 2.4, 0, 0.35, 0.2);
    // засечки на стене: пачки по пять
    for (let g = 0; g < 3 + (i % 2); g++) {
      for (let k = 0; k < 4; k++) f.box(0.012, 0.16, 0.012, bx - 0.1 + g * 0.18 + k * 0.025, 1.6 - g * 0.04, 0.02, '#2a2d30');
      f.bar(bx - 0.12 + g * 0.18, 1.55 - g * 0.04, 0.02, bx - 0.02 + g * 0.18, 1.69 - g * 0.04, 0.02, 0.01, '#2a2d30', 'matte');
    }
    // индикатор над дверью (красная лампочка) и номер
    const df = kit.frame(mid, -28.5, 0, FLOOR);
    df.box(0.18, 0.1, 0.1, 0, 2.8, -0.12, '#1d2127', 'steel');
    df.box(0.1, 0.05, 0.02, 0, 2.8, -0.065, '#ff4a3a', 'glowR');
    df.box(0.7, 0.05, 0.12, 0, 2.62, -0.1, C.steelDk, 'steel');
    plates.add(`H${i + 1}`, mid, FLOOR + 2.4, -28.37, 0, 1, 0.5, 0.26, { bg: '#2a1414', fg: '#ff9a8a', frame: '#7a1414' });
  });
  // дверное железо: рамы и петли
  for (const cell of hole.cells) {
    const [x0, , x1] = cell.rect;
    const f = kit.frame(0, -28.5, 0, FLOOR);
    f.box(0.12, 2.65, 0.3, x0 + 0.07, 1.32, 0, '#2b2f35', 'steel');
    f.box(0.12, 2.65, 0.3, x1 - 0.05, 1.32, 0, '#2b2f35', 'steel');
    f.box(x1 - x0, 0.12, 0.3, (x0 + x1) / 2, 2.62, 0, '#2b2f35', 'steel');
  }
  // коридор: стол охранника, кресло для фиксации, камера наблюдения, шкаф с формой, душ-кабина
  {
    const d = kit.frame(24.0, -22.3, Math.PI, FLOOR);
    fur.desk(d, 0, 0, { w: 2.2, d: 1.0, metal: true, top: '#6d7681', body: '#4a5560' });
    fur.monitor(d.sub(0.6, -0.1, Math.PI), 0, 0.78, 0, 'glowG', 0.5, 0.3);
    fur.monitor(d.sub(-0.1, -0.1, Math.PI), 0, 0.78, 0, 'glowS', 0.5, 0.3);
    fur.keyboard(d.sub(0.4, -0.3, Math.PI), 0, 0.78, 0);
    fur.phone(d, -0.8, 0.78, -0.2);
    fur.mug(d, 0.9, 0.78, -0.3, C.white);
    fur.chair(d, 0, -1.0, '#2b2f36');
  }
  {
    const f = kit.frame(30.6, -22.8, -Math.PI / 2, FLOOR);          // кресло для фиксации, смотрит на -x
    f.box(0.6, 0.06, 0.55, 0, 0.5, 0, '#2b2f36');
    f.box(0.55, 0.9, 0.08, 0, 0.98, -0.28, '#2b2f36');
    f.box(0.5, 0.06, 0.5, 0, 0.1, 0, C.steelDk, 'steel');
    f.box(0.12, 0.5, 0.12, 0, 0.28, 0, C.steelDk, 'steel');
    for (const s of [-1, 1]) {
      f.box(0.06, 0.04, 0.4, s * 0.33, 0.74, 0, '#15171a');
      f.box(0.1, 0.03, 0.14, s * 0.33, 0.78, 0.16, '#6a3a1a');
      f.box(0.1, 0.03, 0.1, s * 0.22, 0.2, 0.3, '#6a3a1a');
    }
    f.box(0.5, 0.04, 0.35, 0, 0.18, 0.45, C.steelDk, 'steel');
    const t = kit.frame(21.6, -24.0, 0, FLOOR);
    fur.lockers(t, 0, 0, 3, { w: 0.42, color: '#7a5a3a' });
    fur.mopBucket(kit.frame(31.0, -26.5, 0, FLOOR), 0, 0);
    fur.crates(kit.frame(31.0, -24.6, 0, FLOOR), 0, 0, 3, '#e2670a');
    lib.bin(kit.frame(21.2, -21.2, 0, FLOOR), 0, 0);
    lib.camera(kit.frame(31.2, -20.8, Math.PI * 0.75, FLOOR), 0, 3.55, 0, 0);
    lib.camera(kit.frame(20.8, -28.2, -Math.PI * 0.25, FLOOR), 0, 3.55, 0, 0);
    lib.extinguisher(wf('xlo', 20.5, -22.0), 0.0, 0);
    lib.clock(wf('xhi', 31.5, -24.0), 0.03, 3.1, 0);
    lib.horn(wf('zhi', -20.5, 28.5), 0.0, 3.4, 0);
    lib.exitSign(wf('zhi', -20.5, 26.0), 0.03, 3.4, 0);
  }
  lib.ceilRun('tray', 'x', 20.6, 31.4, -25.5, BUILD_H - FLOOR - 0.2, '#59636d');
  lib.ceilRun('pipe', 'x', 20.6, 31.4, -24.2, BUILD_H - FLOOR - 0.25, '#7a8591');
  for (let x = 22; x < 31; x += 3) for (const z of [-26, -23]) lib.sprinkler(kit.frame(x, z, 0, FLOOR), 0, BUILD_H - FLOOR, 0);
  fur.hazard(paint, 20.6, -28.4, 31.4, -28.0, FLOOR + 0.004, 0.25);
  paint.flat(21.5, -24.0, 31.4, -23.9, FLOOR + 0.004, '#c0392b');
  for (const x of [22.5, 27.0]) {
    const f = kit.frame(x, -25.3, 0, FLOOR);
    f.box(0.3, 0.012, 0.3, 0, 0.005, 0, '#1b1d20', 'steel');
    for (let k = -2; k <= 2; k++) f.box(0.26, 0.01, 0.012, 0, 0.012, k * 0.05, '#40454b', 'steel');
  }
  plate(plates, 'ИЗОЛЯТОР · ВХОД ТОЛЬКО С ПОСТА', 26, FLOOR + 3.1, -20.54, 0, 1, 3.4, 0.32, WARN);
  plate(plates, 'ОСТОРОЖНО: ЗАКЛЮЧЁННЫЕ БЕЗ НАДЗОРА', 26, FLOOR + 2.7, -28.3, 0, 1, 2.6, 0.26, WARN);
  void rng;
}

// Железо стальной двери карцера (в координатах створки: петля в x=0, полотно dw x 2.5 x 0.16 с центром y = 1.25 + H0).
export function holeDoorGeometry(THREE, mergeColored, dw, H0) {
  const parts = [];
  const box = (w, h, d, x, y, z, color) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, H0 + y, z);
    parts.push({ geometry: g, color });
  };
  for (const y of [0.4, 1.25, 2.1]) box(0.09, 0.22, 0.3, 0.03, y, 0, '#23272c');
  for (const side of [-1, 1]) {
    const z = side * 0.09;
    box(dw * 0.92, 0.25, 0.02, dw / 2, 0.16, z, '#4a4f56');
    for (const y of [0.55, 1.2, 2.2]) box(dw * 0.86, 0.07, 0.025, dw / 2, y, z, '#3a3f46');
    for (const x of [0.12, dw - 0.12]) for (let k = 0; k < 8; k++) box(0.035, 0.035, 0.03, x, 0.3 + k * 0.28, z, '#8e98a3');
    for (const y of [0.75, 1.85]) box(0.4, 0.05, 0.05, dw - 0.22, y, side * 0.11, '#23272c');
    box(0.14, 0.2, 0.03, dw - 0.2, 1.2, z + side * 0.01, '#8e98a3');
    box(0.02, 0.07, 0.035, dw - 0.2, 1.2, z + side * 0.015, '#111');
    box(0.05, 0.05, 0.14, dw - 0.45, 1.2, side * 0.15, '#c8ced4');
  }
  box(0.08, 0.5, 0.04, dw - 0.07, 1.0, 0.0, '#2b2f35');
  return mergeColored(parts);
}
