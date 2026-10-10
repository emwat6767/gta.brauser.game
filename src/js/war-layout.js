import { createRng } from './utils.js';

// Раскладка построек войны: база страны в парке, площадь-«столица», нейтральная деревня в свободном парке, пункт захвата на перекрёстке.
// Шаблон базы описан для «заднего» угла (+, +) квартала и зеркалится по знаку центра квартала: задний угол — подальше от центра карты,
// передний (−, −) смотрит на центр. Стороны построек: 'N' (+Z), 'S' (−Z), 'E' (+X), 'W' (−X).
// Размещение проверяет пруд парка, крестовые дорожки (по ним ходят ворота), уже поставленные постройки.

const POND = { dx: 14, dz: -14, r: 8.5 + 1.5 };   // landmarks.js: пруд в парках [7,7], [6,1], [1,6]

class Placer {
  constructor(builder, block, { pond = true, paths = true } = {}) {
    this.b = builder;
    this.block = block;
    this.cx = block.cx;
    this.cz = block.cz;
    this.placed = [];
    this.hx = Math.sign(block.cx) || 1;
    this.hz = Math.sign(block.cz) || 1;
    this.pond = pond && ['7,7', '6,1', '1,6'].includes(`${block.i},${block.j}`);
    this.paths = paths;
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
    if (this.paths && ((r.minX < this.cx + 3 && r.maxX > this.cx - 3) || (r.minZ < this.cz + 3 && r.maxZ > this.cz - 3))) return false;
    if (this.pond) {
      const px = this.cx + POND.dx, pz = this.cz + POND.dz;
      const nx = Math.max(r.minX, Math.min(px, r.maxX)), nz = Math.max(r.minZ, Math.min(pz, r.maxZ));
      if ((nx - px) ** 2 + (nz - pz) ** 2 < POND.r ** 2) return false;
    }
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
  const P = new Placer(builder, block);
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
    const ex = block.cx + P.hx * 44;
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

// ---------------------------------------------------------------- «столица» — центральная площадь

export function layoutCapital(builder, block) {
  const P = new Placer(builder, block, { pond: false, paths: true });
  P.hx = P.hz = 1;
  const cx = block.cx, cz = block.cz;
  for (const [i, [a, b, w, d, door]] of [[-27, -26, 10, 8, 'N'], [27, -26, 8, 10, 'W'], [-27, 26, 9, 9, 'E'], [27, 26, 10, 7, 'S']].entries()) {
    P.put([[a, b], [a * 0.9, b * 0.9]], w, d, (x, z) => builder.house(x, z, { w, d, door, ruin: true, windows: [1, 1, 1, 1], seed: 20 + i }));
  }
  P.put([[20, 10], [22, 12]], 3, 6, (x, z) => builder.sandbags(x, z, { facing: 'E', len: 5.4, wing: 2.4 }));
  P.put([[-20, -10], [-22, -12]], 3, 6, (x, z) => builder.sandbags(x, z, { facing: 'W', len: 5.4, wing: 2.4 }));
  P.put([[-10, 20], [-12, 22]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: 'N', len: 5.4, wing: 2.4 }));
  P.put([[10, -20], [12, -22]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: 'S', len: 5.4, wing: 2.4 }));
  P.put([[8, -33], [10, -34]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 1 }));
  P.put([[-8, 33], [-10, 34]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 2 }));
  P.put([[33, 8], [34, 10]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  P.put([[-33, -8], [-34, -10]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  P.put([[-20, 30], [20, -30], [30, 20]], 5, 5, (x, z) => builder.barrier(x, z, { along: 'x', n: 3 }), 0.8);
  return { x: cx, z: cz, flag: { x: cx + 7, z: cz - 19 } };
}

// ---------------------------------------------------------------- нейтральная деревня в свободном парке

export function layoutVillage(builder, block) {
  const P = new Placer(builder, block);
  const sizes = [[10, 8], [8, 6.5], [9, 7], [7, 6], [11, 8], [8, 8]];
  const spots = [[-26, -26], [-26, 24], [24, -26], [26, 26], [-12, 12], [12, -12], [-28, 4], [30, 8]];
  let k = 0;
  for (const [a, b] of spots) {
    const [w, d] = sizes[k % sizes.length];
    const ruin = k % 4 === 1;
    P.put([[a, b], [a * 0.85, b * 0.85]], w, d, (x, z) => builder.house(x, z, { w, d, door: ['S', 'N', 'E', 'W'][k % 4], ruin, windows: [1, 1, 1, 1], seed: 40 + k }));
    k++;
  }
  P.put([[12, 24], [14, 22]], 8, 6, (x, z) => builder.bunker(x, z, { w: 8, d: 5.5, front: 'S', slits: 2 }), 1.2);
  P.put([[-12, -22], [-14, -20]], 8, 6, (x, z) => builder.bunker(x, z, { w: 8, d: 5.5, front: 'N', slits: 2 }), 1.2);
  P.put([[0, 34], [6, 34]], 6, 3, (x, z) => builder.sandbags(x, z, { facing: 'S', len: 5.4, wing: 2.4 }));
  P.put([[34, 0], [34, -8]], 3, 6, (x, z) => builder.sandbags(x, z, { facing: 'W', len: 5.4, wing: 2.4 }));
  P.put([[-34, -4], [-34, 6]], 3, 6, (x, z) => builder.container(x, z, { along: 'z', stack: 1 }));
  P.put([[4, -34], [-4, -35]], 6, 3, (x, z) => builder.container(x, z, { along: 'x', stack: 2 }));
}

// ---------------------------------------------------------------- пункт захвата на перекрёстке

export function layoutPoint(builder, node) {
  const { x, z } = node;
  // Мешки по углам перекрёстка (на тротуаре), флагшток на четвёртом углу.
  builder.sandbags(x - 9.6, z + 9.6, { facing: 'E', len: 3.4, wing: 1.6 });
  builder.sandbags(x + 9.6, z - 9.6, { facing: 'W', len: 3.4, wing: 1.6 });
  builder.sandbags(x - 9.6, z - 9.6, { facing: 'N', len: 3.4, wing: 1.6 });
  builder.hedgehog(x - 3.5, z + 3.5);
  builder.hedgehog(x + 3.5, z - 3.5);
  const flag = builder.flagpole(x + 9.6, z + 9.6, null, { height: 10 });
  return { x, z, flag };
}
