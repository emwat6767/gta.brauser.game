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
