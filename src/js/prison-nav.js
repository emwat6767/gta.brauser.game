// Сетка проходимости тюрьмы и поиск пути (A*). Живёт в мировых координатах вокруг квартала-тюрьмы.
// Ячейки 0.5 м: ячейка закрыта, если круг радиуса AGENT_R вокруг её центра пересекает статичный коллайдер.
// Коллайдеры с пометкой dyn (двери камер, ворота, секции сетки) в сетку не попадают — ими управляет prison.js:
// заключённых перед запиранием загоняют в камеры, а охрана сама открывает ворота.

const CELL = 0.5;
const AGENT_R = 0.34;

class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.vals.length; }
  push(key, val) {
    const k = this.keys, v = this.vals;
    let i = v.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p];
      i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.keys, v = this.vals;
    const top = v[0];
    const lastK = k.pop(), lastV = v.pop();
    const n = v.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c];
        i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return top;
  }
}

export class NavGrid {
  constructor(world, { minX, minZ, maxX, maxZ }) {
    this.world = world;
    this.minX = minX;
    this.minZ = minZ;
    this.cols = Math.ceil((maxX - minX) / CELL);
    this.rows = Math.ceil((maxZ - minZ) / CELL);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.g = new Float32Array(this.cols * this.rows);
    this.parent = new Int32Array(this.cols * this.rows);
    this.stamp = new Uint32Array(this.cols * this.rows);
    this.closed = new Uint32Array(this.cols * this.rows);
    this.run = 0;
    this.build();
  }

  build() {
    const { world, cols, rows } = this;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = this.minX + (i + 0.5) * CELL, z = this.minZ + (j + 0.5) * CELL;
        this.blocked[j * cols + i] = this._solid(x, z) ? 1 : 0;
      }
    }
    void world;
  }

  _solid(x, z) {
    const list = this.world.colliders.query(x - AGENT_R, z - AGENT_R, x + AGENT_R, z + AGENT_R);
    for (let k = 0; k < list.length; k++) {
      const b = list[k];
      if (b.dyn) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < AGENT_R * AGENT_R) return true;
    }
    return false;
  }

  cellOf(x, z) {
    const i = Math.floor((x - this.minX) / CELL), j = Math.floor((z - this.minZ) / CELL);
    return i < 0 || j < 0 || i >= this.cols || j >= this.rows ? -1 : j * this.cols + i;
  }

  center(idx) {
    const i = idx % this.cols, j = (idx - i) / this.cols;
    return { x: this.minX + (i + 0.5) * CELL, z: this.minZ + (j + 0.5) * CELL };
  }

  isFree(x, z) {
    const c = this.cellOf(x, z);
    return c >= 0 && !this.blocked[c];
  }

  // Ближайшая свободная ячейка в радиусе r (метры), иначе -1.
  nearestFree(x, z, r = 4) {
    const c0 = this.cellOf(x, z);
    if (c0 >= 0 && !this.blocked[c0]) return c0;
    const i0 = Math.floor((x - this.minX) / CELL), j0 = Math.floor((z - this.minZ) / CELL);
    const R = Math.ceil(r / CELL);
    let best = -1, bestD = Infinity;
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
        const idx = j * this.cols + i;
        if (this.blocked[idx]) continue;
        const d = di * di + dj * dj;
        if (d < bestD) { bestD = d; best = idx; }
      }
    }
    return best;
  }

  // Прямая видимость по сетке (шаг 0.25 м).
  lineFree(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const n = Math.ceil(Math.hypot(dx, dz) / 0.25);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!this.isFree(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  // Путь от (x0, z0) до (x1, z1): массив точек {x, z} (первая — следующая после старта). null — пути нет.
  findPath(x0, z0, x1, z1) {
    const s = this.nearestFree(x0, z0, 3), e = this.nearestFree(x1, z1, 3);
    if (s < 0 || e < 0) return null;
    if (s === e) return [{ x: x1, z: z1 }];
    const { cols, g, parent, stamp, closed } = this;
    const run = ++this.run;
    const ex = e % cols, ey = (e - ex) / cols;
    const heap = new MinHeap();
    g[s] = 0; parent[s] = -1; stamp[s] = run;
    heap.push(0, s);
    const SQ2 = Math.SQRT2;
    let found = false;
    let iter = 0;
    while (heap.size && iter++ < 40000) {
      const cur = heap.pop();
      if (closed[cur] === run) continue;
      closed[cur] = run;
      if (cur === e) { found = true; break; }
      const cx = cur % cols, cy = (cur - cx) / cols;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const nx = cx + di, ny = cy + dj;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= this.rows) continue;
          const n = ny * cols + nx;
          if (this.blocked[n] || closed[n] === run) continue;
          if (di && dj && (this.blocked[cy * cols + nx] || this.blocked[ny * cols + cx])) continue;
          const cost = g[cur] + (di && dj ? SQ2 : 1);
          if (stamp[n] !== run || cost < g[n]) {
            g[n] = cost; parent[n] = cur; stamp[n] = run;
            const h = Math.hypot(nx - ex, ny - ey);
            heap.push(cost + h * 1.001, n);
          }
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let c = e; c !== -1; c = parent[c]) raw.push(this.center(c));
    raw.reverse();
    // Спрямление: от каждой опорной точки идём как можно дальше по прямой.
    const out = [];
    let anchor = { x: x0, z: z0 };
    let i = 0;
    while (i < raw.length) {
      let far = i;
      for (let k = raw.length - 1; k > i; k--) {
        if (this.lineFree(anchor.x, anchor.z, raw[k].x, raw[k].z)) { far = k; break; }
      }
      out.push(raw[far]);
      anchor = raw[far];
      i = far + 1;
    }
    out[out.length - 1] = { x: x1, z: z1 };
    return out;
  }

  // Случайная свободная точка в прямоугольнике (rng — createRng).
  randomFree(rng, rect, tries = 30) {
    for (let k = 0; k < tries; k++) {
      const x = rng.range(rect.minX, rect.maxX), z = rng.range(rect.minZ, rect.maxZ);
      if (this.isFree(x, z)) return { x, z };
    }
    return null;
  }
}
