// План школы № 17: два этажа главного корпуса, спортзал, двор и стадион.
//
// Главный корпус: X от −30 до 30, Z от −10 (фасад, главный вход) до 10 (окна на стадион).
// По оси X идёт коридор шириной 3 м (Z от −1.5 до 1.5), кабинеты — по обе стороны.
// Спортзал пристроен с востока (X 30…50), высота 7.2 м. Этаж — 3.6 м, потолок — 3.3 м.
// Лестницы — в торцах коридора на северной стороне, двухмаршевые (марш вверх по +Z,
// площадка у северной стены, второй марш обратно к коридору).
//
// Комната: { id, name, type, floor, x0, x1, z0, z1, side: 'S' | 'N', doors: [x], open: [[a, b]] }.
// doors — центры дверей в стене коридора (ширина DOOR_W), open — проёмы без двери.

export const FLOOR_H = 3.6;
export const CEIL_H = 3.3;
export const DOOR_W = 1.3;
export const DOOR_H = 2.15;
export const WALL_T = 0.2;
export const EXT_T = 0.35;
export const BLD = { x0: -30, x1: 30, z0: -10, z1: 10 };
export const CORR = { z0: -1.5, z1: 1.5 };
export const GYM = { x0: 30, x1: 50, z0: -10, z1: 10, h: 7.2 };
export const SITE = { x0: -64, x1: 76, z0: -46, z1: 66 };

// Лестницы: марш A (по +Z, вверх с 0 до 1.8), площадка, марш B (по −Z, с 1.8 до 3.6).
export const STAIRS = [
  { id: 'W', x0: -30, x1: -25, laneA: [-29.9, -27.6], laneB: [-27.4, -25.1] },
  { id: 'E', x0: 25, x1: 30, laneA: [25.1, 27.4], laneB: [27.6, 29.9] },
];
export const STAIR_Z0 = 3.0;   // начало маршей
export const STAIR_Z1 = 8.0;   // конец маршей, дальше площадка до северной стены
export const LANDING_Y = FLOOR_H / 2;

const S = (z0 = -10, z1 = -1.5) => ({ z0, z1, side: 'S' });
const N = (z0 = 1.5, z1 = 10) => ({ z0, z1, side: 'N' });

export const ROOMS = [
  // ---------------- 1 этаж, южная сторона (фасад)
  { id: 'cafe', name: 'Столовая', type: 'cafeteria', floor: 0, x0: -30, x1: -18, ...S(), doors: [-20.5, -24.0] },
  { id: 'nurse', name: 'Медпункт', type: 'nurse', floor: 0, x0: -18, x1: -13, ...S(), doors: [-15.5] },
  { id: 'principal', name: 'Кабинет директора', type: 'principal', floor: 0, x0: -13, x1: -6, ...S(), doors: [-9.5] },
  { id: 'lobby', name: 'Вестибюль', type: 'lobby', floor: 0, x0: -6, x1: 6, ...S(), open: [[-4.8, 4.8]] },
  { id: 'c101', name: 'Кабинет 101 · Русский язык', short: '101', type: 'classroom', subject: 'russian', floor: 0, x0: 6, x1: 14, ...S(), doors: [12.5] },
  { id: 'c102', name: 'Кабинет 102 · Английский', short: '102', type: 'classroom', subject: 'english', floor: 0, x0: 14, x1: 22, ...S(), doors: [20.5] },
  { id: 'wcm1', name: 'Туалет (мальчики)', type: 'wc', floor: 0, x0: 22, x1: 26, ...S(), doors: [23.2] },
  { id: 'wcf1', name: 'Туалет (девочки)', type: 'wc', floor: 0, x0: 26, x1: 30, ...S(), doors: [28.8] },
  // ---------------- 1 этаж, северная сторона
  { id: 'stW0', name: 'Лестница', type: 'stairs', stair: 'W', floor: 0, x0: -30, x1: -25, ...N(), open: [[-29.7, -25.3]] },
  { id: 'library', name: 'Библиотека', type: 'library', floor: 0, x0: -25, x1: -14, ...N(), doors: [-16] },
  { id: 'c103', name: 'Кабинет 103 · История', short: '103', type: 'classroom', subject: 'history', floor: 0, x0: -14, x1: -6, ...N(), doors: [-12.5] },
  { id: 'hall', name: 'Рекреация', type: 'hall', floor: 0, x0: -6, x1: 6, ...N(), open: [[-4.8, 4.8]] },
  { id: 'c104', name: 'Кабинет 104 · Физика', short: '104', type: 'classroom', subject: 'physics', floor: 0, x0: 6, x1: 15, ...N(), doors: [7.5] },
  { id: 'c105', name: 'Кабинет 105 · Информатика', short: '105', type: 'computer', subject: 'it', floor: 0, x0: 15, x1: 25, ...N(), doors: [16.5] },
  { id: 'stE0', name: 'Лестница', type: 'stairs', stair: 'E', floor: 0, x0: 25, x1: 30, ...N(), open: [[25.3, 29.7]] },
  // ---------------- 2 этаж, южная сторона
  { id: 'chem', name: 'Кабинет 201 · Химия', short: '201', type: 'lab', subject: 'chemistry', floor: 1, x0: -30, x1: -22, ...S(), doors: [-23.5] },
  { id: 'c202', name: 'Кабинет 202 · Математика', short: '202', type: 'classroom', subject: 'math', floor: 1, x0: -22, x1: -14, ...S(), doors: [-15.5] },
  { id: 'c203', name: 'Кабинет 203 · Литература', short: '203', type: 'classroom', subject: 'literature', floor: 1, x0: -14, x1: -6, ...S(), doors: [-7.5] },
  { id: 'assembly', name: 'Актовый зал', type: 'assembly', floor: 1, x0: -6, x1: 6, ...S(), doors: [-2.9, 4.6] },
  { id: 'c204', name: 'Кабинет 204 · География', short: '204', type: 'classroom', subject: 'geography', floor: 1, x0: 6, x1: 14, ...S(), doors: [12.5] },
  { id: 'c205', name: 'Кабинет 205 · Алгебра', short: '205', type: 'classroom', subject: 'math', floor: 1, x0: 14, x1: 22, ...S(), doors: [20.5] },
  { id: 'wcm2', name: 'Туалет (мальчики)', type: 'wc', floor: 1, x0: 22, x1: 26, ...S(), doors: [23.2] },
  { id: 'wcf2', name: 'Туалет (девочки)', type: 'wc', floor: 1, x0: 26, x1: 30, ...S(), doors: [28.8] },
  // ---------------- 2 этаж, северная сторона
  { id: 'stW1', name: 'Лестница', type: 'stairs', stair: 'W', floor: 1, x0: -30, x1: -25, ...N(), open: [[-29.7, -25.3]] },
  { id: 'c206', name: 'Кабинет 206 · Физика', short: '206', type: 'classroom', subject: 'physics', floor: 1, x0: -25, x1: -15, ...N(), doors: [-23.5] },
  { id: 'c207', name: 'Кабинет 207 · Биология', short: '207', type: 'classroom', subject: 'biology', floor: 1, x0: -15, x1: -5, ...N(), doors: [-13.5] },
  { id: 'teachers', name: 'Учительская', type: 'teachers', floor: 1, x0: -5, x1: 5, ...N(), doors: [-3.5] },
  { id: 'c208', name: 'Кабинет 208 · Музыка', short: '208', type: 'classroom', subject: 'music', floor: 1, x0: 5, x1: 15, ...N(), doors: [6.5] },
  { id: 'storage', name: 'Подсобка', type: 'storage', floor: 1, x0: 15, x1: 19, ...N(), doors: [17] },
  { id: 'c209', name: 'Кабинет 209 · Английский', short: '209', type: 'classroom', subject: 'english', floor: 1, x0: 19, x1: 25, ...N(), doors: [20.5] },
  { id: 'stE1', name: 'Лестница', type: 'stairs', stair: 'E', floor: 1, x0: 25, x1: 30, ...N(), open: [[25.3, 29.7]] },
  // ---------------- спортзал (пристройка) и инвентарная
  { id: 'gym', name: 'Спортзал', type: 'gym', floor: 0, x0: 30, x1: 50, z0: -10, z1: 10, side: 'E', height: GYM.h },
  { id: 'gymstore', name: 'Инвентарная', type: 'gymstore', floor: 0, x0: 45, x1: 50, z0: 5, z1: 10, side: 'E', inside: 'gym' },
];

// Коридоры (по этажам) — тоже «комнаты» для зон дыма и подписей; дым идёт по участкам.
export const CORRIDORS = [0, 1].flatMap((floor) => [
  [-30, -18], [-18, -6], [-6, 6], [6, 18], [18, 30],
].map(([x0, x1], i) => ({
  id: `cor${floor}_${i}`, name: floor ? 'Коридор 2 этажа' : 'Коридор 1 этажа', type: 'corridor',
  floor, x0, x1, z0: CORR.z0, z1: CORR.z1, side: 'C',
})));

// Наружные двери: стена, координата центра, ширина. out — точка снаружи.
export const EXITS = [
  { id: 'main', name: 'Главный вход', wall: 'z0', at: 0, w: 3.0, room: 'lobby', out: { x: 0, z: -13 } },
  { id: 'west', name: 'Запасной выход', wall: 'x0', at: 0, w: 1.4, room: 'cor0_0', out: { x: -33, z: 0 } },
  { id: 'kitchen', name: 'Выход из кухни', wall: 'x0', at: -7.4, w: 1.3, room: 'cafe', out: { x: -33, z: -7.4 } },
  { id: 'gym', name: 'Выход из спортзала', wall: 'gx1', at: 0, w: 2.0, room: 'gym', out: { x: 53, z: 0 } },
];

// Внутренние двери, которые не в стене коридора: спортзал ↔ коридор, инвентарная ↔ спортзал.
export const EXTRA_DOORS = [
  { id: 'gymdoor', wallX: 30, at: 0, w: 1.6, floor: 0, axis: 'z', rooms: ['cor0_4', 'gym'] },
  { id: 'gymstoredoor', wallZ: 5, at: 47.5, w: 1.3, floor: 0, axis: 'x', rooms: ['gym', 'gymstore'] },
];

export const ALL_ZONES = [...ROOMS, ...CORRIDORS];
export const ROOM_BY_ID = new Map(ALL_ZONES.map((r) => [r.id, r]));

// Локальная система класса: u — от задней стены к доске, v — от окон к коридору.
// Южные кабинеты смотрят на восток (+X), северные — на запад, окна всегда слева от учеников.
export function roomFrame(room) {
  const L = room.x1 - room.x0, W = room.z1 - room.z0;
  if (room.side === 'N') {
    return {
      L, W, heading: -Math.PI / 2,
      toWorld: (u, v) => ({ x: room.x1 - u, z: room.z1 - v }),
    };
  }
  return {
    L, W, heading: Math.PI / 2,
    toWorld: (u, v) => ({ x: room.x0 + u, z: room.z0 + v }),
  };
}

export function floorY(floor) {
  return floor * FLOOR_H;
}

// Этаж по высоте ног: на втором марше лестницы человек уже «на втором».
export function floorOfY(y) {
  return y > 2.2 ? 1 : 0;
}

export function insideBuilding(x, z) {
  return (x > BLD.x0 && x < BLD.x1 && z > BLD.z0 && z < BLD.z1) || (x > GYM.x0 && x < GYM.x1 && z > GYM.z0 && z < GYM.z1);
}

// Комната/коридор, в которой точка (без учёта стен).
export function zoneAt(x, z, floor) {
  let best = null;
  for (const r of ALL_ZONES) {
    if (r.floor !== floor && !(r.type === 'gym' || r.type === 'gymstore')) continue;
    if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
    if (r.inside) return r;    // инвентарная внутри спортзала — приоритетнее
    best = r;
  }
  if (best && (best.type === 'gym' || best.type === 'gymstore') && floor !== 0) return null;
  return best;
}
