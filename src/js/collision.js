// 2D-коллизии в плоскости XZ. Статичные препятствия — AABB (здания, фонари,
// деревья), подвижные объекты — круги (люди) или цепочки кругов (машины).

export class CollisionGrid {
  constructor(minX, minZ, size, cellSize) {
    this.minX = minX;
    this.minZ = minZ;
    this.cellSize = cellSize;
    this.cols = Math.ceil(size / cellSize);
    this.cells = new Array(this.cols * this.cols).fill(null);
    this.all = [];
    this._stamp = 0;
    this._result = [];
  }

  _cell(v, min) {
    const c = Math.floor((v - min) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  // box: { minX, maxX, minZ, maxZ, height, type }
  add(box) {
    box._stamp = 0;
    this.all.push(box);
    const x0 = this._cell(box.minX, this.minX), x1 = this._cell(box.maxX, this.minX);
    const z0 = this._cell(box.minZ, this.minZ), z1 = this._cell(box.maxZ, this.minZ);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = z * this.cols + x;
        (this.cells[i] ??= []).push(box);
      }
    }
    return box;
  }

  // Убрать препятствие (сломанный фонарь).
  remove(box) {
    const i = this.all.indexOf(box);
    if (i >= 0) this.all.splice(i, 1);
    const x0 = this._cell(box.minX, this.minX), x1 = this._cell(box.maxX, this.minX);
    const z0 = this._cell(box.minZ, this.minZ), z1 = this._cell(box.maxZ, this.minZ);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const cell = this.cells[z * this.cols + x];
        const k = cell ? cell.indexOf(box) : -1;
        if (k >= 0) cell.splice(k, 1);
      }
    }
  }

  // Возвращает переиспользуемый массив — обходите его сразу, не сохраняйте.
  query(minX, minZ, maxX, maxZ) {
    const out = this._result;
    out.length = 0;
    const stamp = ++this._stamp;
    const x0 = this._cell(minX, this.minX), x1 = this._cell(maxX, this.minX);
    const z0 = this._cell(minZ, this.minZ), z1 = this._cell(maxZ, this.minZ);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const cell = this.cells[z * this.cols + x];
        if (!cell) continue;
        for (const box of cell) {
          if (box._stamp === stamp) continue;
          box._stamp = stamp;
          out.push(box);
        }
      }
    }
    return out;
  }
}

// 3D-луч против препятствий (коробка от земли до box.height). Обходит ячейки сетки
// вдоль луча (алгоритм Amanatides-Woo) и останавливается у первого попадания.
// (dx, dy, dz) — единичное направление. Возвращает { t, box, nx, ny, nz } или null.
CollisionGrid.prototype.raycast = function raycast(ox, oy, oz, dx, dy, dz, maxT) {
  const cs = this.cellSize;
  let cx = Math.floor((ox - this.minX) / cs);
  let cz = Math.floor((oz - this.minZ) / cs);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? cs / Math.abs(dx) : Infinity;
  const tDeltaZ = dz !== 0 ? cs / Math.abs(dz) : Infinity;
  let tMaxX = dx !== 0 ? ((this.minX + (cx + (dx > 0 ? 1 : 0)) * cs) - ox) / dx : Infinity;
  let tMaxZ = dz !== 0 ? ((this.minZ + (cz + (dz > 0 ? 1 : 0)) * cs) - oz) / dz : Infinity;
  const stamp = ++this._stamp;
  let best = maxT, hit = null;
  let t = 0;
  while (t <= best) {
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.cols) break;
    const cell = this.cells[cz * this.cols + cx];
    if (cell) {
      for (const box of cell) {
        if (box._stamp === stamp) continue;
        box._stamp = stamp;
        const r = rayBox(ox, oy, oz, dx, dy, dz, box.minX, 0, box.minZ, box.maxX, box.height, box.maxZ, best);
        if (r) {
          best = r.t;
          hit = { ...r, box };
        }
      }
    }
    if (tMaxX < tMaxZ) {
      t = tMaxX;
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      cz += stepZ;
    }
  }
  return hit;
};

// Луч против AABB (метод плит). Возвращает { t, nx, ny, nz } точки входа или null
// (в том числе если начало луча внутри коробки).
const _slab = { t: 0, nx: 0, ny: 0, nz: 0 };
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1, maxT) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null; // начало внутри
  _slab.t = tmin;
  _slab.nx = axis === 0 ? sign : 0;
  _slab.ny = axis === 1 ? sign : 0;
  _slab.nz = axis === 2 ? sign : 0;
  return { ..._slab };
}

// Выталкивает круг (pos.x, pos.z, r) из AABB. Меняет pos.
// Возвращает true при столкновении; нормаль и глубина — в out.
export function pushCircleOutOfBox(pos, r, box, out) {
  const cx = pos.x < box.minX ? box.minX : pos.x > box.maxX ? box.maxX : pos.x;
  const cz = pos.z < box.minZ ? box.minZ : pos.z > box.maxZ ? box.maxZ : pos.z;
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;

  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    out.nx = dx / d;
    out.nz = dz / d;
    out.depth = r - d;
  } else {
    // Центр внутри коробки — выталкиваем по кратчайшей оси.
    const l = pos.x - box.minX, rr = box.maxX - pos.x;
    const t = pos.z - box.minZ, b = box.maxZ - pos.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) { out.nx = -1; out.nz = 0; out.depth = l + r; }
    else if (m === rr) { out.nx = 1; out.nz = 0; out.depth = rr + r; }
    else if (m === t) { out.nx = 0; out.nz = -1; out.depth = t + r; }
    else { out.nx = 0; out.nz = 1; out.depth = b + r; }
  }
  pos.x += out.nx * out.depth;
  pos.z += out.nz * out.depth;
  return true;
}

export function circleOverlapsBox(x, z, r, box) {
  const cx = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
  const cz = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// Разводит два круга. a/b: { x, z }; wa/wb — доля смещения каждого (сумма = 1).
// Возвращает null или { nx, nz, depth } (нормаль от a к b).
const _pair = { nx: 0, nz: 0, depth: 0 };
export function separateCircles(a, ra, b, rb, wa = 0.5, wb = 0.5) {
  let dx = b.x - a.x;
  let dz = b.z - a.z;
  const min = ra + rb;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return null;
  let d = Math.sqrt(d2);
  if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
  else { dx /= d; dz /= d; }
  const depth = min - d;
  a.x -= dx * depth * wa;
  a.z -= dz * depth * wa;
  b.x += dx * depth * wb;
  b.z += dz * depth * wb;
  _pair.nx = dx;
  _pair.nz = dz;
  _pair.depth = depth;
  return _pair;
}
