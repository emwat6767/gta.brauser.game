import * as THREE from 'three';

// Библиотека типовых предметов тюрьмы: каждый — функция «рамка + параметры» -> несколько примитивов (prison-props.js).
// Все размеры в метрах. Основание рамки (f.y0) — уровень пола; ось z предмета — «вперёд».

export const C = {
  steel: '#8e98a3', steelDk: '#4d5660', steelBlue: '#56616d', steelLt: '#b9c3cc', black: '#1c1f24', rubber: '#2a2c30',
  wood: '#8a6a45', woodDk: '#5b4128', woodLt: '#b58f5a', cream: '#e6e0cc', white: '#eeeeea', paper: '#f0ecdd',
  orange: '#e2670a', red: '#b3261e', green: '#2f7d4a', blue: '#2d5d9b', yellow: '#e8c23a', concrete: '#9a9a96',
  tile: '#c8cfd2', cork: '#b88d5a',
};

export function makeLib(kit, rng) {
  const { prim } = kit;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];

  // ---------------------------------------------------------------- спальня
  // Двухъярусная койка: рама на стойках, сетка, матрасы, одеяла, подушки, лестница, борт верхнего яруса.
  // x, z — центр койки (в рамке f); len — длина; roomSide — куда выходить на лестницу (+1/-1 по x).
  const bunk = (f, x, z, len = 1.95, roomSide = -1, look = {}) => {
    const w = 0.9;
    const frame = look.frame ?? C.steelBlue;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.06, 1.8, 0.06, x + sx * (w / 2 - 0.03), 0.9, z + sz * (len / 2 - 0.03), frame, 'steel');
    for (const y of [0.4, 1.28]) {
      for (const sx of [-1, 1]) f.box(0.04, 0.14, len, x + sx * (w / 2 - 0.02), y, z, frame, 'steel');
      for (const sz of [-1, 1]) f.box(w, 0.07, 0.04, x, y, z + sz * (len / 2 - 0.02), frame, 'steel');
      f.box(w - 0.08, 0.025, len - 0.08, x, y - 0.045, z, '#3a424b', 'steel');
      // пружинная сетка: поперечные планки
      for (let k = -3; k <= 3; k++) f.box(w - 0.1, 0.012, 0.02, x, y - 0.03, z + k * (len / 8), '#59636d', 'steel');
    }
    const mats = look.mats ?? [pick(['#6c7a89', '#7b8a6a', '#b9b19a', '#8c7b6a']), pick(['#6c7a89', '#7b8a6a', '#b9b19a'])];
    const blankets = look.blankets ?? [pick([C.orange, '#566d8a', '#7a7f86', '#6b7f5a']), pick([C.orange, '#566d8a', '#7a7f86'])];
    [0.4, 1.28].forEach((y, i) => {
      f.box(w - 0.1, 0.12, len - 0.1, x, y + 0.075, z, mats[i]);
      f.box(w - 0.12, 0.05, len * 0.62, x, y + 0.155, z + len * 0.14, blankets[i]);
      f.box(w - 0.12, 0.012, len * 0.1, x, y + 0.185, z + len * 0.16, '#e8e3d2');   // отвёрнутый край простыни
      f.box(0.42, 0.1, 0.27, x, y + 0.17, z - len / 2 + 0.22, '#ece7d8');
    });
    // борт верхнего яруса (с комнатной стороны) и лестница
    f.box(0.03, 0.24, len * 0.62, x + roomSide * (w / 2 - 0.015), 1.5, z - len * 0.1, frame, 'steel');
    const lz = z + len / 2 + 0.02;
    for (const sx of [-1, 1]) f.bar(x + roomSide * (w / 2 + 0.2) + sx * 0.12, 0.0, lz + 0.28, x + roomSide * (w / 2 + 0.2) + sx * 0.12, 1.38, lz + 0.04, 0.035, frame, 'steel');
    for (let k = 0; k < 5; k++) f.box(0.3, 0.025, 0.03, x + roomSide * (w / 2 + 0.2), 0.22 + k * 0.24, lz + 0.22 - k * 0.045, C.steelLt, 'steel');
    // полотенце на борту
    if (look.towel !== false) f.box(0.03, 0.34, 0.3, x + roomSide * (w / 2 + 0.03), 0.62, z + len * 0.3, pick(['#d9d4c0', '#8aa0b5', '#b57b5a']));
  };

  // Унитаз с умывальником (нержавейка): плита на стене, чаша с кольцом, раковина, кран, кнопки, зеркало, рулон бумаги.
  const combo = (f, x, z = 0) => {
    f.box(0.46, 0.92, 0.06, x, 0.78, z + 0.03, '#aab4bd', 'steel');
    f.cyl(0.19, 0.13, 0.26, x, 0.3, z + 0.3, '#b7c0c8', 12, 'steel');
    f.torus(0.18, 0.03, x, 0.44, z + 0.3, '#1d2127', 'y', 'matte', 14, 5);
    f.cyl(0.15, 0.15, 0.03, x, 0.46, z + 0.3, '#2f353c', 12, 'matte');
    f.box(0.42, 0.1, 0.3, x, 1.0, z + 0.2, '#b9c2ca', 'steel');
    f.box(0.34, 0.02, 0.22, x, 1.055, z + 0.2, '#2a2f35');
    f.cyl(0.018, 0.018, 0.12, x, 1.1, z + 0.12, C.steelLt, 6, 'steel');
    f.box(0.02, 0.02, 0.1, x, 1.16, z + 0.17, C.steelLt, 'steel');
    f.cyl(0.03, 0.03, 0.015, x - 0.12, 1.3, z + 0.07, '#3d444b', 8, 'steel');
    f.cyl(0.03, 0.03, 0.015, x + 0.12, 1.3, z + 0.07, '#3d444b', 8, 'steel');
    f.box(0.34, 0.46, 0.012, x, 1.62, z + 0.01, '#cfd9e0', 'steel');
    f.box(0.38, 0.5, 0.01, x, 1.62, z + 0.006, '#59636d', 'steel');
    f.pipe(0.055, 0.1, 'x', x + 0.4, 0.62, z + 0.08, '#efe9d8', 10, 'matte');
  };

  // Стальной стол-полка у стены и табурет.
  const deskStool = (f, x, z, wallSide = -1) => {
    f.box(0.46, 0.05, 0.9, x, 0.78, z, '#7b8794', 'steel');
    f.box(0.4, 0.04, 0.04, x - wallSide * 0.0, 0.7, z - 0.4, C.steelDk, 'steel');
    f.bar(x + wallSide * 0.18, 0.76, z - 0.38, x - wallSide * 0.02, 0.4, z - 0.38, 0.035, C.steelDk, 'steel');
    f.bar(x + wallSide * 0.18, 0.76, z + 0.38, x - wallSide * 0.02, 0.4, z + 0.38, 0.035, C.steelDk, 'steel');
    f.cyl(0.18, 0.18, 0.05, x - wallSide * 0.55, 0.46, z, '#7b8794', 12, 'steel');
    f.cyl(0.04, 0.05, 0.43, x - wallSide * 0.55, 0.23, z, C.steelDk, 8, 'steel');
  };

  // Настенная полка с книгами, кружкой, фото.
  const wallShelf = (f, x, y, z, len = 0.9) => {
    f.box(0.2, 0.035, len, x, y, z, C.woodDk);
    f.box(0.03, 0.12, 0.04, x - 0.07, y - 0.08, z - len / 2 + 0.06, C.steelDk, 'steel');
    f.box(0.03, 0.12, 0.04, x - 0.07, y - 0.08, z + len / 2 - 0.06, C.steelDk, 'steel');
    let zz = z - len / 2 + 0.08;
    const n = 3 + Math.floor(rng.next() * 3);
    for (let k = 0; k < n; k++) {
      const t = 0.03 + rng.next() * 0.03, h = 0.14 + rng.next() * 0.1;
      f.box(0.14, h, t, x, y + 0.0175 + h / 2, zz + t / 2, pick(['#8a2b2b', '#2b4a8a', '#2b8a4a', '#8a6b2b', '#5a2d6b', '#c9b36b']));
      zz += t + 0.003;
    }
    f.cyl(0.04, 0.035, 0.09, x, y + 0.06, z + len / 2 - 0.12, pick([C.white, C.orange, C.blue]), 8);
    f.box(0.12, 0.1, 0.012, x + 0.02, y + 0.07, zz + 0.06, '#d8d0b4');
  };

  // Клетка-светильник под потолком (рамка из стали + стеклянная линза светится).
  const cageLamp = (f, x, y, z, w = 0.5, d = 0.2) => {
    f.box(w + 0.06, 0.05, d + 0.06, x, y + 0.02, z, C.steelDk, 'steel');
    f.box(w, 0.025, d, x, y - 0.012, z, '#fff3d6', 'glowW');
    for (const sx of [-1, 1]) f.box(0.02, 0.07, d + 0.06, x + sx * (w / 2 + 0.03), y - 0.02, z, C.steelDk, 'steel');
    for (const sz of [-1, 1]) f.box(w + 0.06, 0.07, 0.02, x, y - 0.02, z + sz * (d / 2 + 0.03), C.steelDk, 'steel');
  };

  // Купольная камера наблюдения: кронштейн, корпус, тёмный купол и красный огонёк.
  const camera = (f, x, y, z, yawArm = 0) => {
    f.box(0.12, 0.12, 0.05, x, y, z, C.steelDk, 'steel');
    const a = f.sub(x, z, yawArm);
    a.box(0.05, 0.05, 0.3, 0, 0, 0.18, C.steelDk, 'steel');
    a.cyl(0.11, 0.11, 0.06, 0, -0.03, 0.34, '#d7dde2', 12, 'steel');
    a.sph(0.1, 0, -0.07, 0.34, '#12161b', 1, 0.8, 1, 'glass', 10);
    a.box(0.02, 0.02, 0.02, 0.07, -0.02, 0.4, '#ff3a2a', 'glowR');
    return a;
  };

  // Круглый стол с четырьмя табуретами на кронштейнах (дворовый/блоковый): центр x, z.
  const roundTable = (f, x, z, extra = true) => {
    f.cyl(0.55, 0.55, 0.06, x, 0.78, z, '#a8b2bb', 16, 'steel');
    f.torus(0.55, 0.018, x, 0.78, z, C.steelDk, 'y', 'steel', 16, 4);
    f.cyl(0.07, 0.1, 0.76, x, 0.38, z, C.steelDk, 8, 'steel');
    f.cyl(0.26, 0.28, 0.03, x, 0.015, z, C.steelDk, 12, 'steel');
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const sx = Math.sin(a) * 0.88, sz = Math.cos(a) * 0.88;
      f.bar(x + Math.sin(a) * 0.08, 0.46, z + Math.cos(a) * 0.08, x + sx, 0.46, z + sz, 0.04, C.steelDk, 'steel');
      f.cyl(0.19, 0.19, 0.05, x + sx, 0.46, z + sz, '#a8b2bb', 12, 'steel');
      f.cyl(0.03, 0.03, 0.44, x + sx, 0.22, z + sz, C.steelDk, 6, 'steel');
    }
    if (extra) {
      // карточная колода, кружка, шашки
      f.box(0.1, 0.02, 0.14, x + 0.15, 0.82, z - 0.1, '#e8e3d2');
      f.cyl(0.04, 0.035, 0.09, x - 0.2, 0.86, z + 0.12, pick([C.white, C.orange, C.blue]), 8);
      for (let k = 0; k < 4; k++) f.cyl(0.03, 0.03, 0.012, x + 0.05 + (k % 2) * 0.07, 0.815 + Math.floor(k / 2) * 0.012, z + 0.2, k % 2 ? C.red : C.black, 8);
    }
  };

  // Настенный телевизор на кронштейне: экран светится.
  const wallTv = (f, x, y, z) => {
    f.box(0.12, 0.12, 0.08, x - 0.08, y, z, C.steelDk, 'steel');
    f.box(0.06, 0.06, 0.5, x - 0.12, y, z, C.steelDk, 'steel');
    f.box(0.1, 0.8, 1.38, x, y, z, '#15171b', 'steel');
    f.box(0.012, 0.7, 1.28, x + 0.056, y, z, '#8fb4ff', 'glowS');
    f.box(0.015, 0.06, 0.3, x + 0.056, y - 0.34, z, '#ffffff', 'glowS');
  };

  // Настенный телефон-автомат с козырьком, трубкой и шнуром; перегородка.
  const wallPhone = (f, x, z) => {
    f.box(0.26, 0.55, 0.36, x, 1.45, z, '#3a4350', 'steel');
    f.box(0.3, 0.05, 0.4, x - 0.02, 1.76, z, C.steelDk, 'steel');
    f.box(0.09, 0.2, 0.28, x + 0.12, 1.5, z, '#c8ced4', 'steel');
    f.box(0.04, 0.26, 0.07, x + 0.15, 1.5, z - 0.12, '#15181c');
    f.box(0.04, 0.26, 0.07, x + 0.15, 1.5, z + 0.12, '#15181c');
    f.box(0.07, 0.07, 0.12, x + 0.15, 1.62, z, '#15181c');
    f.box(0.012, 0.18, 0.2, x + 0.135, 1.34, z, '#7a8591', 'steel');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) f.box(0.012, 0.025, 0.025, x + 0.14, 1.28 - r * 0.045, z - 0.05 + c * 0.05, '#cfd6dc', 'steel');
    for (let k = 0; k < 6; k++) f.box(0.012, 0.012, 0.03, x + 0.16, 1.3 - k * 0.06, z + 0.17, '#222');
    f.box(0.03, 1.1, 0.05, x, 1.2, z + 0.28, C.steelDk, 'steel');
  };

  // Огнетушитель на стене с кронштейном и табличкой.
  const extinguisher = (f, x, z) => {
    f.cyl(0.08, 0.08, 0.5, x + 0.1, 1.0, z, C.red, 10, 'steel');
    f.cyl(0.04, 0.05, 0.1, x + 0.1, 1.3, z, '#222', 8, 'steel');
    f.box(0.12, 0.03, 0.04, x + 0.1, 1.38, z, '#222', 'steel');
    f.box(0.03, 0.2, 0.18, x + 0.01, 1.0, z, C.steelDk, 'steel');
    f.box(0.02, 0.2, 0.2, x + 0.01, 1.52, z, C.red);
  };

  // Корзина для мусора с крышкой.
  const bin = (f, x, z, color = '#4b5663') => {
    f.cyl(0.22, 0.18, 0.5, x, 0.25, z, color, 12, 'steel');
    f.cyl(0.24, 0.24, 0.04, x, 0.52, z, C.steelDk, 12, 'steel');
    f.cyl(0.07, 0.07, 0.04, x, 0.56, z, '#222', 8);
  };

  // Питьевой фонтанчик из нержавейки.
  const fountain = (f, x, z) => {
    f.box(0.4, 0.8, 0.3, x, 0.4, z, '#b7c0c8', 'steel');
    f.box(0.42, 0.07, 0.34, x, 0.84, z, '#c8d0d7', 'steel');
    f.box(0.3, 0.02, 0.22, x, 0.885, z, '#2a2f35');
    f.cyl(0.02, 0.02, 0.1, x, 0.95, z - 0.06, C.steelLt, 6, 'steel');
    f.box(0.1, 0.1, 0.02, x, 0.5, z + 0.16, '#5a6670', 'steel');
  };

  // Стенд объявлений с бумажками.
  const noticeBoard = (f, x, y, z, w = 1.2, h = 0.8) => {
    f.box(0.04, h + 0.08, w + 0.08, x, y, z, C.woodDk);
    f.box(0.03, h, w, x + 0.012, y, z, C.cork);
    for (let k = 0; k < 9; k++) {
      const pw = 0.14 + rng.next() * 0.1, ph = 0.18 + rng.next() * 0.1;
      f.box(0.012, ph, pw, x + 0.034, y - h / 2 + 0.12 + rng.next() * (h - 0.3), z - w / 2 + 0.1 + rng.next() * (w - 0.3), pick([C.paper, '#f5e9a8', '#cfe3f2', '#f3c9c9']));
    }
  };

  // Настенные часы со стрелками (ось x рамки — нормаль стены).
  const clock = (f, x, y, z) => {
    f.pipe(0.24, 0.05, 'x', x, y, z, '#1f2328', 18, 'matte');
    f.pipe(0.21, 0.015, 'x', x + 0.03, y, z, '#f2f2ee', 18, 'matte');
    f.box(0.01, 0.1, 0.014, x + 0.04, y + 0.05, z, '#111');
    f.box(0.01, 0.014, 0.15, x + 0.042, y, z + 0.06, '#111');
    f.box(0.012, 0.03, 0.03, x + 0.044, y, z, '#a11');
  };

  // Указатель «ВЫХОД» (зелёная линза).
  const exitSign = (f, x, y, z) => {
    f.box(0.06, 0.2, 0.46, x, y, z, '#1e2a22', 'steel');
    f.box(0.012, 0.14, 0.38, x + 0.034, y, z, '#4cff7a', 'glowG');
  };

  // Спринклер и датчик дыма на потолке.
  const sprinkler = (f, x, y, z) => {
    f.cyl(0.015, 0.015, 0.06, x, y - 0.03, z, '#c9a227', 6, 'steel');
    f.cyl(0.04, 0.02, 0.02, x, y - 0.07, z, '#c9a227', 8, 'steel');
  };
  const smoke = (f, x, y, z) => {
    f.cyl(0.08, 0.1, 0.04, x, y - 0.02, z, '#e9e9e4', 12);
    f.box(0.012, 0.012, 0.012, x + 0.05, y - 0.045, z, '#ff3a2a', 'glowR');
  };

  // Громкоговоритель-рупор на стене.
  const horn = (f, x, y, z) => {
    f.box(0.1, 0.14, 0.12, x, y, z, '#3a424b', 'steel');
    f.box(0.18, 0.2, 0.2, x + 0.12, y, z, '#59636d', 'steel');
    f.box(0.02, 0.15, 0.15, x + 0.22, y, z, '#1d2227');
  };

  // Вентиляционная решётка с планками.
  const vent = (f, x, y, z, w = 0.5, h = 0.3) => {
    f.box(0.03, h + 0.06, w + 0.06, x, y, z, '#59636d', 'steel');
    for (let k = 0; k < 6; k++) f.box(0.02, 0.012, w, x + 0.012, y - h / 2 + 0.04 + k * (h / 6), z, '#2c3239');
  };

  // Скамья из дерева на стальных ножках.
  const bench = (f, x, z, len = 1.8) => {
    f.box(0.4, 0.05, len, x, 0.46, z, C.woodLt);
    for (const sz of [-1, 1]) {
      f.box(0.4, 0.46, 0.05, x, 0.23, z + sz * (len / 2 - 0.12), C.steelDk, 'steel');
    }
    f.box(0.04, 0.05, len - 0.3, x, 0.2, z, C.steelDk, 'steel');
  };

  // Труба/воздуховод на потолке вдоль оси.
  const ceilRun = (kind, axis, a, b, fixed, y, color) => {
    const len = Math.abs(b - a), mid = (a + b) / 2;
    if (kind === 'pipe') prim.pipe(0.06, len, axis, axis === 'z' ? fixed : mid, y, axis === 'z' ? mid : fixed, color, 8, 'steel');
    else if (kind === 'duct') prim.box(axis === 'z' ? 0.5 : len, 0.3, axis === 'z' ? len : 0.5, axis === 'z' ? fixed : mid, y, axis === 'z' ? mid : fixed, color, 0, 'steel');
    else if (kind === 'tray') {
      prim.box(axis === 'z' ? 0.3 : len, 0.025, axis === 'z' ? len : 0.3, axis === 'z' ? fixed : mid, y, axis === 'z' ? mid : fixed, color, 0, 'steel');
      for (const s of [-1, 1]) prim.box(axis === 'z' ? 0.02 : len, 0.08, axis === 'z' ? len : 0.02, axis === 'z' ? fixed + s * 0.15 : mid, y + 0.04, axis === 'z' ? mid : fixed + s * 0.15, color, 0, 'steel');
      for (const off of [-0.08, 0, 0.08]) prim.pipe(0.012, len, axis, axis === 'z' ? fixed + off : mid, y + 0.03, axis === 'z' ? mid : fixed + off, ['#222', '#6a1d1d', '#1d3a6a'][off === 0 ? 0 : off < 0 ? 1 : 2], 4, 'matte');
    }
  };

  return { bunk, combo, deskStool, wallShelf, cageLamp, camera, roundTable, wallTv, wallPhone, extinguisher, bin, fountain, noticeBoard, clock, exitSign, sprinkler, smoke, horn, vent, bench, ceilRun, pick };
}

void THREE;
