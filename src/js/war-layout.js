import { createRng } from './utils.js';

// Раскладка построек войны на поле боя (war-arena.js): база страны в угловой клетке, «столица» в центральном перекрёстке,
// нейтральные деревни, хутора у пунктов, фермы и леса в боковых клетках, пункт захвата на перекрёстке.
// Шаблон базы описан для «заднего» угла (+, +) клетки и зеркалится по block.orient (знак смещения клетки от центра поля):
// задний угол — подальше от центра карты, передний (−, −) смотрит на центр. Стороны построек: 'N' (+Z), 'S' (−Z), 'E' (+X), 'W' (−X).
// Размещение проверяет дорожки-ворота (крест через центр базы), границы клетки и уже поставленные постройки.

class Placer {
  // block — клетка арены (или похожий объект с lot, cx, cz); corridor — полуширина крестовой полосы, которую не застраиваем (0 — нет)
  constructor(builder, block, { corridor = 3 } = {}) {
    this.b = builder;
    this.block = block;
    this.cx = block.cx;
    this.cz = block.cz;
    this.placed = builder.placed ??= [];   // занятые места общие для всех раскладок поля боя
    this.hx = block.orient?.hx ?? (Math.sign(block.cx) || 1);
    this.hz = block.orient?.hz ?? (Math.sign(block.cz) || 1);
    this.corridor = corridor;
  }

  // локальные (a, b) -> мир
  W(a, b) { return { x: this.cx + a * this.hx, z: this.cz + b * this.hz }; }
  // локальная сторона -> мировая буква
  side(s) {
    return { aP: this.hx > 0 ? 'E' : 'W', aM: this.hx > 0 ? 'W' : 'E', bP: this.hz > 0 ? 'N' : 'S', bM: this.hz > 0 ? 'S' : 'N' }[s];
  }
  // направление «вдоль +a наружу» как курс
  heading(s) {
    const d = { aP: [this.hx, 0], aM: [-this.hx, 0], bP: [0, this.hz], bM: [0, -this.hz] }[s];
    return Math.atan2(d[0], d[1]);
  }

  fits(x, z, w, d, margin = 1.4) {
    const r = { minX: x - w / 2 - margin, maxX: x + w / 2 + margin, minZ: z - d / 2 - margin, maxZ: z + d / 2 + margin };
    const lot = this.block.lot;
    if (r.minX < lot.minX + 1 || r.maxX > lot.maxX - 1 || r.minZ < lot.minZ + 1 || r.maxZ > lot.maxZ - 1) return false;
    const c = this.corridor;
    if (c > 0 && ((r.minX < this.cx + c && r.maxX > this.cx - c) || (r.minZ < this.cz + c && r.maxZ > this.cz - c))) return false;
    for (const p of this.placed) if (r.minX < p.maxX && r.maxX > p.minX && r.minZ < p.maxZ && r.maxZ > p.minZ) return false;
    return true;
  }

  // Первый подходящий кандидат [a, b] (локальные) — ставит и запоминает прямоугольник. fn(world x, z) строит постройку.
  put(cands, w, d, fn, margin = 1.4) {
    for (const [a, b] of cands) {
      const { x, z } = this.W(a, b);
      if (!this.fits(x, z, w, d, margin)) continue;
      this.placed.push({ minX: x - w / 2 - margin, maxX: x + w / 2 + margin, minZ: z - d / 2 - margin, maxZ: z + d / 2 + margin });
      const s = fn(x, z);
      if (s?.footprint) this.b.clearTrees(s.footprint);
      else this.b.clearTrees({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      return { x, z, s };
    }
    return null;
  }
}

// ---------------------------------------------------------------- база страны

export function layoutBase(builder, block, country) {
  const bl = { ...block, lot: { minX: block.cx - 38, maxX: block.cx + 38, minZ: block.cz - 38, maxZ: block.cz + 38 } };   // сама база — 76 × 76 м в середине клетки
  const P = new Placer(builder, bl);
  const rng = createRng(block.i * 31 + block.j * 7 + 5);
  const base = { block, cx: block.cx, cz: block.cz, country: country.id, spawn: [], yard: [], crates: [], hq: null, pad: null, flag: null, front: P.side('bM') };

  // Штаб президента — бункер с бойницами на «передний» бок (к центру карты), дверь в тыл.
  const hqBuild = (x, z) => builder.bunker(x, z, { w: 12, d: 9, front: P.side('bM'), slits: 3, big: true });
  let hq = P.put([[25, 26], [24, 27], [27, 25], [29, 29], [30, 28], [28, 30]], 12, 9, hqBuild, 1.2);
  if (!hq) {   // штаб обязан быть: ставим в углу, даже если рядом что-то стоит
    const w = P.W(28, 28);
    hq = { x: w.x, z: w.z, s: hqBuild(w.x, w.z) };
  }
  if (hq) {
    base.hq = { x: hq.x, z: hq.z, face: P.heading('bM'), structure: hq.s };
    base.president = { x: hq.x, z: hq.z, face: P.heading('bM') };
    base.respawn = { x: hq.x - P.hx * 1.5, z: hq.z + P.hz * 0.5, heading: P.heading('bM') };
  }

  // Флагшток.
  P.put([[31, 14], [16, 36], [8, 34], [-34, 30]], 3, 3, (x, z) => { base.flag = builder.flagpole(x, z, country.id, { height: 12 }); return null; }, 0.6);

  // Казармы — два дома (окна и двери смотрят на передний бок и к воротам).
  P.put([[-25, 26], [-26, 20], [-20, 30]], 11, 8, (x, z) => builder.house(x, z, { w: 11, d: 8, door: P.side('bM'), windows: [1, 1, 1, 1], seed: block.i + 1 }));
  P.put([[-9, 28], [-10, 22], [4, 28], [9, 34]], 9, 6.5, (x, z) => builder.house(x, z, { w: 9, d: 6.5, door: P.side('aM'), windows: [1, 1, 0, 1], seed: block.j + 3 }));

  // Ангар техники с открытой стороной на улицу.
  const shed = P.put([[30, -14], [30, -20], [31, -26], [30, 8]], 8, 16, (x, z) => builder.shed(x, z, { w: 8, d: 16, open: P.side('aP') }), 1.0);
  const open = P.heading('aP');
  if (shed) {
    // Выезд из ангара на улицу: расчищаем деревья и резервируем полосу, чтобы туда ничего не поставили.
    const ex = block.cx + P.hx * 71;
    const lane = { minX: Math.min(shed.x, ex), maxX: Math.max(shed.x, ex), minZ: shed.z - 10, maxZ: shed.z + 10 };
    builder.clearTrees(lane, 0);
    P.placed.push(lane);
    for (const [k, type] of [[-5, 'tank'], [0, 'apc'], [5, 'jeep']]) base.yard.push({ x: shed.x + P.hx * 1.0, z: shed.z + k, heading: open, type });
    base.yard.push({ x: shed.x - P.hx * 0.5 + P.hx * 6.5, z: shed.z - 6, heading: open, type: 'truck' });
  }

  // Вертолётная площадка.
  const pad = P.put([[6, 24], [-26, 12], [30, -34], [-12, -26], [-6, 14]], 15, 15, (x, z) => builder.helipad(x, z, 6.5), 1.0);
  if (pad) base.pad = { x: pad.x, z: pad.z };

  // Передний край: мешки, дот, контейнеры (смотрят на центр карты).
  P.put([[-28, -26], [-26, -30], [-30, -20]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: P.side('bM'), len: 5.4, wing: 2.4 }));
  P.put([[-14, -32], [-12, -30], [-16, -33]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: P.side('bM'), len: 5.4, wing: 2.4 }));
  P.put([[-32, -12], [-33, -8], [-32, -16]], 3, 6, (x, z) => builder.sandbags(x, z, { facing: P.side('aM'), len: 5.4, wing: 2.4 }));
  P.put([[-22, -14], [-20, -18], [-22, -22]], 7, 5.5, (x, z) => builder.bunker(x, z, { w: 7, d: 5, front: P.side('bM'), slits: 2 }), 1.2);
  P.put([[-30, 8], [-32, 11]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  P.put([[-6, -28], [-8, -30]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 1 }));
  P.put([[12, -32], [14, -34], [22, -32]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 2 }));
  P.put([[-12, 12], [-14, 14], [-16, 10]], 6, 4, (x, z) => builder.tent(x, z, { w: 5.5, d: 3.8, door: P.side('bM') }));
  P.put([[-12, 18], [-14, 20], [-17, 16]], 6, 4, (x, z) => builder.tent(x, z, { w: 5.5, d: 3.8, door: P.side('bM') }));
  P.put([[20, 14], [22, 10], [34, 8]], 4, 3, (x, z) => builder.crates(x, z, { n: 3 }));
  P.put([[8, -14], [10, -18], [6, -20]], 4, 3, (x, z) => builder.crates(x, z, { n: 3 }));
  P.put([[-34, 34], [34, 34], [34, -34]], 5, 5, (x, z) => builder.tower(x, z), 1.0);

  // Ящики с оружием (пикапы): винтовка, снайперка, гранатомёт — рядом с первой точкой ящиков.
  for (const [i, w] of ['rifle', 'sniper', 'rpg'].entries()) {
    const p = P.W(18 + i * 1.8, 5.5);
    base.crates.push({ x: p.x, z: p.z, weapon: w });
  }

  // Точки появления солдат: перед казармами и палатками.
  for (const [a, b] of [[-14, 8], [-8, 8], [-2, 8], [-18, 22], [-4, 20], [-20, 6], [-10, 24], [-26, 14], [4, 10], [-14, 4], [10, 8], [-24, 10]]) {
    const p = P.W(a, b);
    base.spawn.push({ x: p.x + rng.range(-1, 1), z: p.z + rng.range(-1, 1) });
  }
  return base;
}

// ---------------------------------------------------------------- «столица» — городок в центральном перекрёстке

// Городок вокруг центра поля боя: дома разных размеров (часть — руины), контейнеры, мешки; дороги и перекрёсток свободны.
export function layoutTown(builder, arena) {
  const C = arena.center.x;
  const block = { i: 'c', j: 'c', cx: C, cz: C, orient: { hx: 1, hz: 1 }, lot: { minX: C - 100, maxX: C + 100, minZ: C - 100, maxZ: C + 100 } };
  const P = new Placer(builder, block, { corridor: 9 });
  const rng = createRng(4242);
  const spots = [];
  for (const a of [-16, -36, -56, -76, -96]) for (const b of [-16, -36, -56, -76, -96]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) spots.push([a * sx, b * sz]);
  // перемешиваем и ставим дома разных размеров, ближе к центру — плотнее
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  let k = 0, placed = 0;
  for (const [a, b] of spots) {
    if (placed >= 36) break;
    const w = rng.pick([7, 8, 9, 10, 12]), d = rng.pick([6, 7, 8, 9]);
    const ruin = rng.chance(0.3);
    const door = Math.abs(a) < Math.abs(b) ? (b > 0 ? 'S' : 'N') : (a > 0 ? 'W' : 'E');
    const ok = P.put([[a, b], [a + 4, b - 3]], w, d, (x, z) => builder.house(x, z, { w, d, door, ruin, windows: [1, 1, 1, 1], floors: 1, seed: 60 + k }), 1.0);
    k++;
    if (ok) placed++;
  }
  // баррикады: мешки и контейнеры по краям, бетонные блоки у выездов
  for (const [a, b, f] of [[18, 12, 'E'], [-18, -12, 'W'], [12, -18, 'S'], [-12, 18, 'N'], [26, -26, 'S'], [-26, 26, 'N']]) {
    const horizontal = f === 'N' || f === 'S';
    P.put([[a, b]], horizontal ? 6 : 3, horizontal ? 3 : 6, (x, z) => builder.sandbags(x, z, { facing: f, len: 5.4, wing: 2.4 }));
  }
  P.put([[40, 12], [42, 14]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 1 }));
  P.put([[-40, -12], [-42, -14]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 2 }));
  P.put([[12, 40], [14, 42]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  P.put([[-12, -40], [-14, -42]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  P.put([[22, 22], [-22, -22]], 5, 5, (x, z) => builder.bunker(x, z, { w: 7, d: 5, front: 'S', slits: 2 }), 1.2);
  return { x: C, z: C, flag: { x: C + 10, z: C + 10 } };
}

// ---------------------------------------------------------------- нейтральная деревня (угловая клетка без страны или центральная)

export function layoutVillage(builder, block) {
  const P = new Placer(builder, { ...block, lot: { minX: block.cx - 62, maxX: block.cx + 62, minZ: block.cz - 62, maxZ: block.cz + 62 } }, { corridor: 0 });
  const rng = createRng(block.i * 53 + block.j * 11 + 3);
  const sizes = [[10, 8], [8, 6.5], [9, 7], [7, 6], [11, 8], [8, 8], [12, 9]];
  const spots = [[-48, -48], [-48, 44], [44, -48], [48, 48], [-20, 20], [20, -20], [-50, 4], [52, 8], [4, 52], [-6, -52], [-24, -24], [24, 24], [-30, 46], [30, -46]];
  let k = 0;
  for (const [a, b] of spots) {
    const [w, d] = sizes[k % sizes.length];
    const ruin = k % 4 === 1;
    P.put([[a, b], [a * 0.85, b * 0.85]], w, d, (x, z) => builder.house(x, z, { w, d, door: ['S', 'N', 'E', 'W'][k % 4], ruin, windows: [1, 1, 1, 1], seed: 40 + k + block.i }));
    k++;
  }
  P.put([[28, 52], [30, 50]], 8, 6, (x, z) => builder.bunker(x, z, { w: 8, d: 5.5, front: 'S', slits: 2 }), 1.2);
  P.put([[-28, -54], [-30, -50]], 8, 6, (x, z) => builder.bunker(x, z, { w: 8, d: 5.5, front: 'N', slits: 2 }), 1.2);
  for (const [a, b, f] of [[0, 56, 'S'], [56, 0, 'W'], [-56, -6, 'E'], [6, -56, 'N']]) {
    const horizontal = f === 'N' || f === 'S';
    P.put([[a, b]], horizontal ? 6 : 3, horizontal ? 3 : 6, (x, z) => builder.sandbags(x, z, { facing: f, len: 5.4, wing: 2.4 }));
  }
  P.put([[-58, 20], [-58, 30]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  P.put([[14, -58], [4, -58]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 2 }));
  void rng;
}

// ---------------------------------------------------------------- боковые клетки: ферма или лес

export function layoutCountry(builder, arena, block) {
  const lot = { minX: block.cx - 62, maxX: block.cx + 62, minZ: block.cz - 62, maxZ: block.cz + 62 };
  const P = new Placer(builder, { ...block, lot }, { corridor: 0 });
  const rng = createRng(block.i * 71 + block.j * 19 + 7);
  const o = (a, b) => ({ x: block.cx + a, z: block.cz + b });
  if (block.kind === 'farm') {
    // поля и усадьба
    const fieldKinds = ['wheat', 'green', 'plowed', 'wheat', 'hay'];
    const rects = [[-40, -38, 52, 40], [38, -34, 48, 44], [-38, 40, 56, 36], [40, 42, 44, 34]];
    rects.forEach(([a, b, w, d], i) => {
      const p = o(a, b);
      arena.field(p.x, p.z, w, d, fieldKinds[(i + block.i + block.j) % fieldKinds.length]);
      builder.reserved.push({ minX: p.x - w / 2, maxX: p.x + w / 2, minZ: p.z - d / 2, maxZ: p.z + d / 2 });
    });
    P.put([[0, 0], [3, 3]], 11, 8, (x, z) => builder.house(x, z, { w: 11, d: 8, door: rng.pick(['S', 'N', 'E', 'W']), windows: [2, 2, 1, 1], seed: 90 + block.i }));
    P.put([[18, -6], [20, -10]], 9, 14, (x, z) => builder.shed(x, z, { w: 9, d: 14, open: rng.pick(['N', 'S']), color: '#7a5a3a' }));
    P.put([[-16, 6], [-18, 8]], 7, 6, (x, z) => builder.house(x, z, { w: 7, d: 6, door: 'S', windows: [1, 1, 1, 1], ruin: rng.chance(0.4), seed: 95 + block.j }));
    P.put([[-24, -14], [-26, -16]], 6, 6, (x, z) => builder.haystack(x, z, 4));
    P.put([[28, 20], [30, 22]], 6, 6, (x, z) => builder.haystack(x, z, 3));
    for (const [a, b, len, al] of [[-60, 0, 30, 'z'], [60, 4, 26, 'z'], [0, -60, 28, 'x'], [6, 60, 30, 'x']]) {
      P.put([[a, b]], al === 'x' ? len : 1.5, al === 'x' ? 1.5 : len, (x, z) => builder.stoneWall(x, z, len, al), 0.3);
    }
    P.put([[-36, 30], [-38, 32]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: 'N', len: 5.4, wing: 2.4 }));
  } else {
    // лес: охотничий домик, мешки на опушке, валуны
    P.put([[0, 0], [6, -6]], 8, 7, (x, z) => builder.house(x, z, { w: 8, d: 7, door: rng.pick(['S', 'N', 'E', 'W']), windows: [1, 1, 1, 1], ruin: rng.chance(0.5), seed: 120 + block.j }));
    P.put([[-36, 12], [-38, 16]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: 'W', len: 5.4, wing: 2.4 }));
    P.put([[34, -20], [36, -22]], 3, 6, (x, z) => builder.sandbags(x, z, { facing: 'E', len: 5.4, wing: 2.4 }));
    P.put([[10, 40], [12, 42]], 8, 6, (x, z) => builder.bunker(x, z, { w: 7, d: 5, front: 'N', slits: 2 }), 1.2);
  }
  for (let i = 0; i < 9; i++) {
    const a = rng.range(-58, 58), b = rng.range(-58, 58);
    P.put([[a, b]], 3.4, 3.4, (x, z) => builder.boulder(x, z, rng.range(1.0, 1.9)), 0.5);
  }
}

// ---------------------------------------------------------------- пункт захвата на перекрёстке

export function layoutPoint(builder, node) {
  const { x, z } = node;
  // Мешки по углам перекрёстка, «ежи» на въездах, флагшток на четвёртом углу.
  builder.sandbags(x - 9.6, z + 9.6, { facing: 'E', len: 3.4, wing: 1.6 });
  builder.sandbags(x + 9.6, z - 9.6, { facing: 'W', len: 3.4, wing: 1.6 });
  builder.sandbags(x - 9.6, z - 9.6, { facing: 'N', len: 3.4, wing: 1.6 });
  builder.hedgehog(x - 3.5, z + 3.5);
  builder.hedgehog(x + 3.5, z - 3.5);
  const flag = builder.flagpole(x + 9.6, z + 9.6, null, { height: 10 });
  return { x, z, flag };
}

// Хутор у пункта: несколько домов и мешки вокруг перекрёстка (между дорогами).
export function layoutHamlet(builder, node) {
  const block = { i: node.x | 0, j: node.z | 0, cx: node.x, cz: node.z, orient: { hx: 1, hz: 1 }, lot: { minX: node.x - 50, maxX: node.x + 50, minZ: node.z - 50, maxZ: node.z + 50 } };
  const P = new Placer(builder, block, { corridor: 8 });
  const rng = createRng(Math.round(node.x * 3 + node.z * 7));
  const sizes = [[9, 7], [8, 7], [10, 8], [7, 6]];
  let k = 0;
  for (const [a, b] of [[-26, -26], [26, 26], [-26, 26], [26, -26], [-44, 18], [44, -18], [18, 44], [-18, -44]]) {
    const [w, d] = sizes[k % sizes.length];
    P.put([[a, b], [a * 0.9, b * 0.9]], w, d, (x, z) => builder.house(x, z, { w, d, door: ['S', 'N', 'E', 'W'][(k + 1) % 4], ruin: k % 3 === 2, windows: [1, 1, 1, 1], seed: 150 + k }), 1.0);
    k++;
  }
  P.put([[16, 30], [18, 32]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: 'S', len: 5.4, wing: 2.4 }));
  P.put([[-30, -16], [-32, -18]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  void rng;
}
