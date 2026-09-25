import * as THREE from 'three';

// Сборщик статичной геометрии: тысячи граней города склеиваются в несколько
// мешей, чтобы держать число draw calls низким. Цвет — через vertex colors.
export class GeometryBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }

  get isEmpty() {
    return this.count === 0;
  }

  // a, b, c, d — вершины [x, y, z] против часовой стрелки, если смотреть со стороны нормали.
  // uv — [u0,v0, u1,v1, u2,v2, u3,v3] для a, b, c, d.
  quad(a, b, c, d, n, uv, color) {
    const i = this.count;
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(n[0], n[1], n[2]);
      this.col.push(color.r, color.g, color.b);
    }
    this.uv.push(...uv);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    this.count += 4;
  }

  // Горизонтальный прямоугольник (нормаль вверх), UV в метрах / tile.
  flat(x0, z0, x1, z1, y, color, tile = 1) {
    this.quad(
      [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0],
      [x0 / tile, z1 / tile, x1 / tile, z1 / tile, x1 / tile, z0 / tile, x0 / tile, z0 / tile],
      color,
    );
  }

  // Четыре боковые стены коробки. U — вдоль стены, V — по мировой высоте,
  // поэтому этажи на разных ярусах здания совпадают.
  walls(x0, y0, z0, x1, y1, z1, color, tileU = 1, tileV = 1, uOffset = 0) {
    const w = (x1 - x0) / tileU, d = (z1 - z0) / tileU;
    const v0 = y0 / tileV, v1 = y1 / tileV;
    const u0 = uOffset;
    const uvW = [u0, v0, u0 + w, v0, u0 + w, v1, u0, v1];
    const uvD = [u0, v0, u0 + d, v0, u0 + d, v1, u0, v1];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uvW, color);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uvW, color);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uvD, color);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uvD, color);
  }

  // Коробка без дна.
  box(x0, y0, z0, x1, y1, z1, color, tile = 1) {
    this.walls(x0, y0, z0, x1, y1, z1, color, tile, tile);
    this.flat(x0, z0, x1, z1, y1, color, tile);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Склеивает готовые геометрии (Box/Cylinder/Extrude...) в одну,
// раскрашивая каждую часть своим цветом через vertex colors.
// parts: [{ geometry, color }] — геометрии уже должны быть сдвинуты/повёрнуты.
export function mergeColored(parts) {
  let vCount = 0, iCount = 0;
  for (const { geometry: g } of parts) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  const c = new THREE.Color();
  let vo = 0, io = 0;

  for (const { geometry: g, color } of parts) {
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    c.set(color ?? 0xffffff);
    for (let i = 0; i < n; i++) {
      col[(vo + i) * 3] = c.r;
      col[(vo + i) * 3 + 1] = c.g;
      col[(vo + i) * 3 + 2] = c.b;
    }
    if (g.index) {
      const a = g.index.array;
      for (let k = 0; k < a.length; k++) idx[io + k] = a[k] + vo;
      io += a.length;
    } else {
      for (let k = 0; k < n; k++) idx[io + k] = vo + k;
      io += n;
    }
    vo += n;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
