import { STAIRS, STAIR_Z0, STAIR_Z1, LANDING_Y, FLOOR_H, BLD, GYM, SITE } from './layout.js';

// Навигация: сетка проходимости 0.5 м на каждый этаж (1 этаж — весь участок, 2 этаж — корпус),
// поиск пути A* с проходом через двери, переход между этажами по лестницам (готовая ломаная
// по маршам) и «поля расстояний» (Dijkstra) — например, до места сбора с учётом огня.

const CELL = 0.5;
const SQ2 = Math.SQRT2;
const AGENT_R = 0.2;

class Heap {
  constructor() { this.idx = []; this.key = []; }
  get size() { return this.idx.length; }
  push(i, k) {
    const a = this.idx, b = this.key;
    let n = a.length;
    a.push(i); b.push(k);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (b[p] <= k) break;
      a[n] = a[p]; b[n] = b[p]; n = p;
    }
    a[n] = i; b[n] = k;
  }
  pop() {
    const a = this.idx, b = this.key;
    const top = a[0];
    const li = a.pop(), lk = b.pop();
    if (a.length) {
      let n = 0;
      const len = a.length;
      for (;;) {
        let c = 2 * n + 1;
        if (c >= len) break;
        if (c + 1 < len && b[c + 1] < b[c]) c++;
        if (b[c] >= lk) break;
        a[n] = a[c]; b[n] = b[c]; n = c;
      }
      a[n] = li; b[n] = lk;
    }
    return top;
  }
}

export class NavGrid {
  constructor(world, floor, x0, z0, x1, z1) {
    this.world = world;
    this.floor = floor;
    this.y = floor * FLOOR_H;
    this.x0 = x0; this.z0 = z0;
    this.w = Math.ceil((x1 - x0) / CELL);
    this.h = Math.ceil((z1 - z0) / CELL);
    this.n = this.w * this.h;
    this.blocked = new Uint8Array(this.n);
    this.door = new Int16Array(this.n).fill(-1);
    this.extraCost = new Float32Array(this.n);    // огонь, дым — задаёт сценарий
    this._g = new Float32Array(this.n);
    this._from = new Int32Array(this.n);
    this._seen = new Uint32Array(this.n);
    this._closed = new Uint32Array(this.n);
    this._stamp = 0;
  }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  cx(i) { return this.x0 + ((i % this.w) + 0.5) * CELL; }
  cz(i) { return this.z0 + (Math.floor(i / this.w) + 0.5) * CELL; }

  build(doors) {
    const W = this.world, y = this.y;
    for (let i = 0; i < this.n; i++) {
      const x = this.cx(i), z = this.cz(i);
      let bad = false;
      if (this.floor === 1) {
        const inMain = x > BLD.x0 && x < BLD.x1 && z > BLD.z0 && z < BLD.z1;
        if (!inMain) bad = true;
      }
      if (!bad && Math.abs(W.groundAt(x, z, y + 0.2) - y) > 0.3) {
        // Сцена актового зала — проходима (невысокая площадка).
        const g = W.groundAt(x, z, y + 0.5);
        if (!(g > y && g - y < 0.5)) bad = true;
      }
      if (!bad) {
        const list = W.grid.query(x - AGENT_R, z - AGENT_R, x + AGENT_R, z + AGENT_R);
        for (const b of list) {
          if (b.type === 'door' || b.type === 'barricade') continue;
          if (b.maxY <= y + 0.2 || b.minY >= y + 1.5) continue;
          const px = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
          const pz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
          if ((x - px) ** 2 + (z - pz) ** 2 < AGENT_R * AGENT_R) { bad = true; break; }
        }
      }
      this.blocked[i] = bad ? 1 : 0;
    }
    // Лестничные пролёты — только через «портал» лестницы.
    for (const s of STAIRS) {
      for (let x = s.x0; x <= s.x1; x += CELL / 2) {
        for (let z = STAIR_Z0 + 0.25; z <= BLD.z1; z += CELL / 2) {
          const i = this.idx(x, z);
          if (i >= 0) this.blocked[i] = 1;
        }
      }
    }
    // Клетки дверных проёмов: центр клетки внутри проёма (с запасом от косяков).
    doors.forEach((d, k) => {
      if (d.floor !== this.floor) return;
      const lo = d.a + 0.2, hi = d.b - 0.2;
      for (let s = lo - CELL; s <= hi + CELL; s += CELL / 2) {
        for (let t = -0.6; t <= 0.6; t += CELL / 2) {
          const x = d.axis === 'x' ? s : d.c + t, z = d.axis === 'x' ? d.c + t : s;
          const i = this.idx(x, z);
          if (i < 0) continue;
          const cs = d.axis === 'x' ? this.cx(i) : this.cz(i), ct = (d.axis === 'x' ? this.cz(i) : this.cx(i)) - d.c;
          if (cs < lo || cs > hi || Math.abs(ct) > 0.45) continue;
          this.door[i] = k;
          if (Math.abs(ct) <= 0.3) this.blocked[i] = 0;
        }
      }
    });
  }

  walkable(i) {
    return i >= 0 && !this.blocked[i];
  }

  // Ближайшая проходимая клетка (по спирали, до r клеток).
  nearestFree(x, z, r = 8) {
    const i0 = this.idx(x, z);
    if (i0 >= 0 && !this.blocked[i0]) return i0;
    const ci = Math.floor((x - this.x0) / CELL), cj = Math.floor((z - this.z0) / CELL);
    let best = -1, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const k = j * this.w + i;
      if (this.blocked[k]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // A*: путь клетками от (sx, sz) до (tx, tz). canDoor(doorIndex) — можно ли пройти дверь.
  // Возвращает массив точек [{x, z}] (сглаженный) или null.
  findPath(sx, sz, tx, tz, canDoor, maxNodes = 30000) {
    const s = this.nearestFree(sx, sz), t = this.nearestFree(tx, tz);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: tx, z: tz }];
    const stamp = ++this._stamp;
    const g = this._g, from = this._from, seen = this._seen, closed = this._closed;
    const W = this.w;
    const ti = t % W, tj = Math.floor(t / W);
    const hfun = (k) => {
      const dx = Math.abs((k % W) - ti), dz = Math.abs(Math.floor(k / W) - tj);
      return (dx + dz + (SQ2 - 2) * Math.min(dx, dz)) * CELL;
    };
    const heap = new Heap();
    g[s] = 0; seen[s] = stamp; from[s] = -1;
    heap.push(s, hfun(s));
    let nodes = 0, found = false;
    while (heap.size) {
      const k = heap.pop();
      if (closed[k] === stamp) continue;
      closed[k] = stamp;
      if (k === t) { found = true; break; }
      if (++nodes > maxNodes) break;
      const i = k % W, j = (k - i) / W;
      for (let dj = -1; dj <= 1; dj++) {
        const nj = j + dj;
        if (nj < 0 || nj >= this.h) continue;
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          if (ni < 0 || ni >= W) continue;
          const nk = nj * W + ni;
          if (this.blocked[nk] || closed[nk] === stamp) continue;
          if (di && dj && (this.blocked[j * W + ni] || this.blocked[nj * W + i])) continue;
          let cost = (di && dj ? SQ2 : 1) * CELL + this.extraCost[nk];
          const dr = this.door[nk];
          if (dr >= 0 && canDoor) {
            const c = canDoor(dr);
            if (c === false) continue;
            if (typeof c === 'number') cost += c;
          }
          const ng = g[k] + cost;
          if (seen[nk] !== stamp || ng < g[nk]) {
            seen[nk] = stamp; g[nk] = ng; from[nk] = k;
            heap.push(nk, ng + hfun(nk));
          }
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = t; k !== -1; k = from[k]) cells.push(k);
    cells.reverse();
    return this.smooth(cells, tx, tz);
  }

  // Прямая проходимость между клетками (шагами по 0.2 м, с запасом на ширину).
  clear(ax, az, bx, bz, canDoor) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.2);
    for (let k = 1; k < n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      const i = this.idx(x, z);
      if (i < 0 || this.blocked[i]) return false;
      if (this.extraCost[i] > 1) return false;
      if (this.door[i] >= 0 && canDoor && canDoor(this.door[i]) === false) return false;
    }
    return true;
  }

  smooth(cells, tx, tz) {
    const pts = cells.map((k) => ({ x: this.cx(k), z: this.cz(k), door: this.door[k] }));
    pts[pts.length - 1] = { x: tx, z: tz, door: -1 };
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      // Через двери не срезаем — точка двери остаётся в пути.
      for (; b > a + 1; b--) {
        let doorBetween = false;
        for (let k = a + 1; k < b; k++) if (pts[k].door >= 0) { doorBetween = true; break; }
        if (!doorBetween && this.clear(pts[a].x, pts[a].z, pts[b].x, pts[b].z)) break;
      }
      out.push(pts[b]);
      a = b;
    }
    return out.slice(1);
  }

  // Dijkstra от точек seeds = [{ i, cost }]; region = { x0, z0, x1, z1 } ограничивает обход.
  // Результат — Float32Array расстояний (Infinity — недостижимо).
  field(seeds, canDoor, region = null, out = null) {
    const dist = out ?? new Float32Array(this.n);
    const W = this.w;
    let i0 = 0, j0 = 0, i1 = W - 1, j1 = this.h - 1;
    if (region) {
      i0 = Math.max(0, Math.floor((region.x0 - this.x0) / CELL)); i1 = Math.min(W - 1, Math.floor((region.x1 - this.x0) / CELL));
      j0 = Math.max(0, Math.floor((region.z0 - this.z0) / CELL)); j1 = Math.min(this.h - 1, Math.floor((region.z1 - this.z0) / CELL));
      for (let j = j0; j <= j1; j++) dist.fill(Infinity, j * W + i0, j * W + i1 + 1);
    } else dist.fill(Infinity);
    const heap = new Heap();
    for (const s of seeds) {
      if (s.i < 0 || s.cost >= dist[s.i]) continue;
      dist[s.i] = s.cost;
      heap.push(s.i, dist[s.i]);   // ключ — то же float32, что и в dist (иначе узлы теряются)
    }
    while (heap.size) {
      const kk = heap.key[0];
      const k = heap.pop();
      if (kk > dist[k]) continue;
      const i = k % W, j = (k - i) / W;
      for (let dj = -1; dj <= 1; dj++) {
        const nj = j + dj;
        if (nj < j0 || nj > j1) continue;
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = i + di;
          if (ni < i0 || ni > i1) continue;
          const nk = nj * W + ni;
          if (this.blocked[nk]) continue;
          if (di && dj && (this.blocked[j * W + ni] || this.blocked[nj * W + i])) continue;
          let cost = (di && dj ? SQ2 : 1) * CELL + this.extraCost[nk];
          const dr = this.door[nk];
          if (dr >= 0 && canDoor) {
            const c = canDoor(dr);
            if (c === false) continue;
            if (typeof c === 'number') cost += c;
          }
          const nd = dist[k] + cost;
          if (nd < dist[nk]) { dist[nk] = nd; heap.push(nk, dist[nk]); }
        }
      }
    }
    return dist;
  }

  // Шаг по полю: точка, куда идти (на несколько клеток вперёд вниз по полю).
  descend(dist, x, z, look = 4) {
    let k = this.idx(x, z);
    if (k < 0) return null;
    if (this.blocked[k] || dist[k] === Infinity) {
      k = this.nearestFree(x, z, 3);
      if (k < 0 || dist[k] === Infinity) return null;
      return { x: this.cx(k), z: this.cz(k), d: dist[k] };
    }
    const W = this.w;
    let cur = k;
    const chain = [];
    for (let step = 0; step < look; step++) {
      let best = cur, bd = dist[cur];
      const i = cur % W, j = (cur - i) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const nk = nj * W + ni;
        if (this.blocked[nk]) continue;
        if (di && dj && (this.blocked[j * W + ni] || this.blocked[nj * W + i])) continue;
        if (dist[nk] < bd) { bd = dist[nk]; best = nk; }
      }
      if (best === cur) break;
      cur = best;
      chain.push(cur);
    }
    if (!chain.length) return { x: this.cx(cur), z: this.cz(cur), d: dist[cur] };
    // Самая дальняя клетка цепочки, до которой можно дойти по прямой (не срезая косяки).
    let pick = chain[0];
    for (let i = chain.length - 1; i > 0; i--) {
      if (this.clear(x, z, this.cx(chain[i]), this.cz(chain[i]))) { pick = chain[i]; break; }
    }
    return { x: this.cx(pick), z: this.cz(pick), d: dist[pick] };
  }
}

// Лестница как «портал» между этажами: ломаная по маршам.
function stairPath(s) {
  const ax = (s.laneA[0] + s.laneA[1]) / 2, bx = (s.laneB[0] + s.laneB[1]) / 2;
  const pts = [
    { x: ax, z: 2.4, y: 0 }, { x: ax, z: STAIR_Z0 + 0.3, y: 0.1 }, { x: ax, z: STAIR_Z1 - 0.2, y: LANDING_Y - 0.1 },
    { x: ax, z: 9.2, y: LANDING_Y }, { x: bx, z: 9.2, y: LANDING_Y }, { x: bx, z: STAIR_Z1 - 0.2, y: LANDING_Y + 0.1 },
    { x: bx, z: STAIR_Z0 + 0.3, y: FLOOR_H - 0.1 }, { x: bx, z: 2.4, y: FLOOR_H },
  ];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y);
  return { id: s.id, pts, len, bottom: pts[0], top: pts[pts.length - 1] };
}

export class Navigator {
  constructor(world, doors) {
    this.world = world;
    this.doors = doors;
    this.grids = [
      new NavGrid(world, 0, SITE.x0 + 2, SITE.z0 + 2, SITE.x1 - 2, SITE.z1 - 2),
      new NavGrid(world, 1, BLD.x0 - 1, BLD.z0 - 1, BLD.x1 + 1, BLD.z1 + 1),
    ];
    this.stairs = STAIRS.map(stairPath);
    this.region0 = { x0: BLD.x0 - 1.5, z0: BLD.z0 - 1.5, x1: GYM.x1 + 1.5, z1: BLD.z1 + 1.5 };
  }

  build() {
    for (const g of this.grids) g.build(this.doors.list);
  }

  // canDoor для агентов: who.canUnlock — учитель/игрок изнутри; who.breaker — ломает (угроза).
  doorRule(who) {
    const list = this.doors.list;
    return (k) => {
      const d = list[k];
      if (d.broken || (!d.locked && !d.barricade)) return d.open > 0.5 ? 0 : 0.6;
      if (who?.breaker) return 18 + d.hp * 0.08;
      // Изнутри кабинета свою дверь можно отпереть; поля эвакуации (insider) считают так же.
      if (who === 'insider' || (who && who.zone?.id === d.roomZone)) return 3;
      return false;
    };
  }

  // Лестница, в пролёте которой точка (на марше или площадке), или null.
  stairAt(x, z) {
    for (const s of STAIRS) if (x > s.x0 && x < s.x1 && z > STAIR_Z0 && z < BLD.z1) return this.stairs.find((q) => q.id === s.id);
    return null;
  }

  // Путь между точками с этажами: [{ x, z, floor, stair? }]. null — пути нет.
  path(from, to, who = null) {
    // Цель на лестнице — к ближнему концу марша.
    const ts = this.stairAt(to.x, to.z);
    if (ts) {
      const end = to.floor === 1 ? ts.top : ts.bottom;
      to = { ...to, x: end.x, z: end.z };
    }
    // Стоим посреди лестницы — дойти по маршам до нужного конца и дальше по сетке.
    const fs = this.stairAt(from.x, from.z);
    if (fs) {
      const up = to.floor === 1;
      const pts = up ? fs.pts : [...fs.pts].reverse();
      let bi = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.hypot(p.x - from.x, p.z - from.z, (p.y - (from.y ?? p.y)) * 2); if (d < bd) { bd = d; bi = i; } });
      const rest = pts.slice(Math.min(pts.length - 1, bi + 1)).map((q) => ({ x: q.x, z: q.z, floor: q.y > 2.2 ? 1 : 0, stair: true }));
      const end = pts[pts.length - 1];
      const tail = this.path({ x: end.x, z: end.z, floor: up ? 1 : 0 }, to, who);
      return tail ? [...rest, ...tail] : null;
    }
    const rule = this.doorRule(who);
    if (from.floor === to.floor) {
      const p = this.grids[from.floor].findPath(from.x, from.z, to.x, to.z, rule);
      return p ? p.map((q) => ({ x: q.x, z: q.z, floor: from.floor })) : null;
    }
    // Лестница, которая ближе по сумме прямых расстояний.
    let best = null, bc = Infinity;
    for (const s of this.stairs) {
      const a = from.floor === 0 ? s.bottom : s.top, b = to.floor === 0 ? s.bottom : s.top;
      const c = Math.hypot(a.x - from.x, a.z - from.z) + Math.hypot(b.x - to.x, b.z - to.z);
      if (c < bc) { bc = c; best = s; }
    }
    const up = from.floor === 0;
    const a = up ? best.bottom : best.top, b = up ? best.top : best.bottom;
    const p1 = this.grids[from.floor].findPath(from.x, from.z, a.x, a.z, rule);
    const p2 = this.grids[to.floor].findPath(b.x, b.z, to.x, to.z, rule);
    if (!p1 || !p2) return null;
    const mid = (up ? best.pts : [...best.pts].reverse()).map((q) => ({ x: q.x, z: q.z, floor: q.y > 2.2 ? 1 : 0, stair: true }));
    return [
      ...p1.map((q) => ({ x: q.x, z: q.z, floor: from.floor })),
      ...mid.slice(1, -1),
      ...p2.map((q) => ({ x: q.x, z: q.z, floor: to.floor })),
    ];
  }

  // Поле до цели на 1 этаже (static) + поля по зданию (с учётом огня), включая 2 этаж через лестницы.
  // Возвращает { f0, f1 } — массивы расстояний.
  buildField(target, who = 'insider', base = null) {
    const g0 = this.grids[0], g1 = this.grids[1];
    const rule = this.doorRule(who);
    let f0;
    if (!base) {
      f0 = g0.field([{ i: g0.nearestFree(target.x, target.z), cost: 0 }], rule);
    } else {
      // Пересчёт только внутри здания: затравка — клетки вокруг здания со значениями из base.
      f0 = base.slice();
      const R = this.region0, seeds = [];
      const W = g0.w;
      const i0 = Math.max(0, Math.floor((R.x0 - g0.x0) / 0.5)), i1 = Math.min(W - 1, Math.floor((R.x1 - g0.x0) / 0.5));
      const j0 = Math.max(0, Math.floor((R.z0 - g0.z0) / 0.5)), j1 = Math.min(g0.h - 1, Math.floor((R.z1 - g0.z0) / 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (j !== j0 && j !== j1 && i !== i0 && i !== i1) continue;
        const k = j * W + i;
        if (!g0.blocked[k] && base[k] < Infinity) seeds.push({ i: k, cost: base[k] });
      }
      g0.field(seeds, rule, R, f0);
    }
    const seeds1 = [];
    for (const s of this.stairs) {
      const k0 = g0.nearestFree(s.bottom.x, s.bottom.z), k1 = g1.nearestFree(s.top.x, s.top.z);
      if (k0 >= 0 && k1 >= 0 && f0[k0] < Infinity) seeds1.push({ i: k1, cost: f0[k0] + s.len });
    }
    const f1 = g1.field(seeds1, rule);
    return { f0, f1 };
  }

  // Ближайшая лестница к точке на этаже (для движения по полю 2 этажа).
  nearestStair(x, z, floor) {
    let best = null, bd = Infinity;
    for (const s of this.stairs) {
      const p = floor === 0 ? s.bottom : s.top;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return { stair: best, dist: bd };
  }
}
