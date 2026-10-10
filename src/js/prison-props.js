import * as THREE from 'three';
import { mergeColored } from './geometry.js';

// Набор деталей для тюрьмы: любая мелочь (койка, унитаз, плита, прожектор, книга) — это несколько примитивов
// (коробка, цилиндр, тор, конус, балка), склеенных в большие меши с vertex colors. Детали группируются по «кускам»
// (chunk — корпус, двор, вышка...), каждый кусок прячется, когда игрок далеко (prison.js: updateChunks),
// поэтому мелкая геометрия ничего не стоит вдали.
//
// Координаты — локальные координаты тюрьмы (x вправо, z к воротам, y вверх), как в prison-build.js.
// Frame — «рамка» вокруг предмета: свои оси (ось z предмета — «вперёд»), поворот yaw и высота основания.
//
// Материалы деталей: matte (краска, дерево, ткань), steel (металл), glass (стекло) и светящиеся
// glowW/glowS/glowG/glowR/glowA (лампы, экраны, указатели) — они включаются ночью вместе с городом.

const FRONT = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export function createKit({ K, toWorld, cx, cz, world, glowMat, envMap }) {
  const KANG = FRONT[K];
  const chunks = new Map();
  let cur = null;

  const mats = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02 }),
    steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.65, envMap: envMap ?? null }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.32, depthWrite: false }),
    glowW: glowMat(0xfff1cf, 0.62, 1.25, { vertexColors: true }),
    glowS: glowMat(0xa8ccff, 0.55, 1.15, { vertexColors: true }),
    glowG: glowMat(0x58ff8a, 0.6, 1.2, { vertexColors: true }),
    glowR: glowMat(0xff4a3a, 0.55, 1.2, { vertexColors: true }),
    glowA: glowMat(0xffb23a, 0.55, 1.25, { vertexColors: true }),
    glowD: glowMat(0xbfe6ff, 1.0, 0.06, { vertexColors: true }),    // дневной свет из окон: ночью гаснет
  };

  // far — расстояние до игрока, дальше которого кусок не рисуется (prison.js: updateChunks).
  const use = (name, far) => {
    cur = chunks.get(name);
    if (!cur) { cur = { name, parts: [], far: far ?? 70 }; chunks.set(name, cur); }
    else if (far) cur.far = far;
    return cur;
  };

  // Геометрия, уже заданная в локальных координатах тюрьмы -> в мир.
  const addLocal = (geo, color, mat = 'matte') => {
    geo.rotateY(KANG);
    geo.translate(cx, 0, cz);
    cur.parts.push({ geometry: geo, color, mat });
  };
  const place = (geo, x, y, z, ry, color, mat) => {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    addLocal(geo, color, mat);
  };

  // Примитивы (центр в x, y, z; ry — поворот вокруг вертикали).
  const prim = {
    box: (w, h, d, x, y, z, color, ry = 0, mat = 'matte') => place(new THREE.BoxGeometry(w, h, d), x, y, z, ry, color, mat),
    cyl: (rt, rb, h, x, y, z, color, seg = 10, mat = 'matte') => place(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, 0, color, mat),
    // горизонтальная труба вдоль оси 'x' или 'z' (длина len, центр в x, y, z)
    pipe: (r, len, axis, x, y, z, color, seg = 8, mat = 'steel') => {
      const g = new THREE.CylinderGeometry(r, r, len, seg);
      if (axis === 'x') g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
      place(g, x, y, z, 0, color, mat);
    },
    sph: (r, x, y, z, color, sx = 1, sy = 1, sz = 1, mat = 'matte', seg = 10) => {
      const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 3));
      g.scale(sx, sy, sz);
      place(g, x, y, z, 0, color, mat);
    },
    torus: (R, r, x, y, z, color, axis = 'y', mat = 'steel', seg = 12, tseg = 5) => {
      const g = new THREE.TorusGeometry(R, r, tseg, seg);
      if (axis === 'y') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateY(Math.PI / 2);
      place(g, x, y, z, 0, color, mat);
    },
    cone: (r, h, x, y, z, color, seg = 10, mat = 'matte') => place(new THREE.ConeGeometry(r, h, seg), x, y, z, 0, color, mat),
    // балка между двумя точками (раскосы, поручни, провода)
    bar: (x0, y0, z0, x1, y1, z1, t, color, mat = 'steel') => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
      const len = a.distanceTo(b);
      const g = new THREE.BoxGeometry(t, t, len);
      const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
      m.setPosition(a.clone().add(b).multiplyScalar(0.5));
      g.applyMatrix4(m);
      addLocal(g, color, mat);
    },
    // плоская «наклеенная» пластина (разметка, постер): quad в плоскости пола
    decalFloor: (x0, z0, x1, z1, y, color) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      addLocal(g, color, 'matte');
    },
  };

  // Рамка предмета: локальные оси (dx вправо, dz вперёд), yaw, высота основания y0.
  const frame = (x, z, ry = 0, y0 = 0) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    const loc = (dx, dz) => [x + dx * c + dz * s, z - dx * s + dz * c];
    const f = {
      x, z, ry, y0,
      loc,
      box: (w, h, d, dx, dy, dz, color, mat) => { const [px, pz] = loc(dx, dz); prim.box(w, h, d, px, y0 + dy, pz, color, ry, mat); return f; },
      cyl: (rt, rb, h, dx, dy, dz, color, seg, mat) => { const [px, pz] = loc(dx, dz); prim.cyl(rt, rb, h, px, y0 + dy, pz, color, seg, mat); return f; },
      pipe: (r, len, axis, dx, dy, dz, color, seg, mat) => {
        // ось предмета x/z -> ось тюрьмы: при yaw ≈ 90° оси меняются местами
        const swap = Math.abs(Math.sin(ry)) > 0.7;
        const a = swap ? (axis === 'x' ? 'z' : 'x') : axis;
        const [px, pz] = loc(dx, dz);
        prim.pipe(r, len, a, px, y0 + dy, pz, color, seg, mat);
        return f;
      },
      sph: (r, dx, dy, dz, color, sx, sy, sz, mat, seg) => { const [px, pz] = loc(dx, dz); prim.sph(r, px, y0 + dy, pz, color, sx, sy, sz, mat, seg); return f; },
      torus: (R, r, dx, dy, dz, color, axis, mat, seg, tseg) => {
        const swap = Math.abs(Math.sin(ry)) > 0.7;
        const a = axis === 'y' ? 'y' : swap ? (axis === 'x' ? 'z' : 'x') : axis;
        const [px, pz] = loc(dx, dz);
        prim.torus(R, r, px, y0 + dy, pz, color, a, mat, seg, tseg);
        return f;
      },
      cone: (r, h, dx, dy, dz, color, seg, mat) => { const [px, pz] = loc(dx, dz); prim.cone(r, h, px, y0 + dy, pz, color, seg, mat); return f; },
      bar: (dx0, dy0, dz0, dx1, dy1, dz1, t, color, mat) => {
        const [ax, az] = loc(dx0, dz0), [bx, bz] = loc(dx1, dz1);
        prim.bar(ax, y0 + dy0, az, bx, y0 + dy1, bz, t, color, mat);
        return f;
      },
      sub: (dx, dz, dry = 0, dy = 0) => { const [px, pz] = loc(dx, dz); return frame(px, pz, ry + dry, y0 + dy); },
    };
    return f;
  };

  // Готовые меши кусков: по материалам. Возвращает { name, meshes: [...] }.
  const build = (group, { cast = new Set() } = {}) => {
    const out = [];
    for (const ch of chunks.values()) {
      const byMat = new Map();
      for (const p of ch.parts) {
        if (!byMat.has(p.mat)) byMat.set(p.mat, []);
        byMat.get(p.mat).push(p);
      }
      const meshes = [];
      const box = new THREE.Box3();
      for (const [mat, list] of byMat) {
        const geo = mergeColored(list);
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        box.union(geo.boundingBox);
        const m = new THREE.Mesh(geo, mats[mat]);
        m.name = `prison-${ch.name}-${mat}`;
        m.castShadow = cast.has(ch.name) && (mat === 'matte' || mat === 'steel');
        m.receiveShadow = !mat.startsWith('glow') && mat !== 'glass';
        if (mat === 'glass') m.renderOrder = 3;
        m.matrixAutoUpdate = false;
        group.add(m);
        meshes.push(m);
        for (const p of list) p.geometry.dispose();
      }
      ch.parts.length = 0;
      out.push({ name: ch.name, meshes, box, far: ch.far });
    }
    return out;
  };

  const stats = () => {
    let parts = 0, tris = 0;
    for (const ch of chunks.values()) {
      for (const p of ch.parts) {
        parts++;
        tris += (p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count) / 3;
      }
    }
    return { parts, tris: Math.round(tris), chunks: chunks.size };
  };

  return { use, frame, prim, build, stats, mats, addLocal, KANG };
}
