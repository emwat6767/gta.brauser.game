import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GeometryBuilder, mergeColored } from './geometry.js';

// Достопримечательности и уличный декор (world.js вызывает buildLandmarks после зданий):
//   Площадь Чемпионов в центральном парке — фонтан, золотая статуя бойца с поясом, клумбы, скамейки, фонари;
//   Арена «Октагон» — восьмигранный стадион с неоновыми вывесками, знамёнами стран и лучами прожекторов;
//   Автосалон «Турбо» — стеклянный павильон и подиумы с неоном: все новые машины стоят там (бери любую);
//   Прайм-тауэр — небоскрёб-символ с неоновыми поясами и шпилем;
//   пруды в парках, портовые краны, остановки, уличные деревья, мигающие огни на шпилях.
// Ночные огни регистрируются в world.glow ({ mat, base, day, night }) и world.beams — ими управляет daynight.js.

const H = 0.15; // высота бордюра/площадки (CONFIG.world.curbHeight)

const col = (c) => new THREE.Color(c);
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, seg, x, y, z) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const oct = (rt, rb, h, x, y, z) => new THREE.CylinderGeometry(rt, rb, h, 8).rotateY(Math.PI / 8).translate(x, y, z);

// Текстура с неоновой надписью (вывески арены, автосалона, башни).
function neonTexture(title, sub, w, h, a, b, bg = '#0a0b10') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, '#171a24');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = a;
  g.lineWidth = Math.max(4, h * 0.03);
  g.shadowColor = a;
  g.shadowBlur = h * 0.12;
  g.strokeRect(h * 0.06, h * 0.08, w - h * 0.12, h * 0.84);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = h * (sub ? 0.46 : 0.6);
  g.font = `900 ${size}px "Arial Narrow", Arial, sans-serif`;
  while (g.measureText(title).width > w * 0.82 && size > 20) {
    size -= 4;
    g.font = `900 ${size}px "Arial Narrow", Arial, sans-serif`;
  }
  g.fillStyle = a;
  g.fillText(title, w / 2, sub ? h * 0.42 : h * 0.52);
  if (sub) {
    g.shadowColor = b;
    g.fillStyle = b;
    g.font = `700 ${h * 0.17}px Arial, sans-serif`;
    g.fillText(sub, w / 2, h * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildLandmarks(world) {
  const game = world.game;
  world.glow = [];
  world.beams = [];
  world.treeExclusions = [];
  world.showroomSpawns = [];
  world.benchSpots = [];     // скамейки, на которых любят сидеть прохожие: { x, z, heading }

  const group = new THREE.Group();
  group.name = 'landmarks';
  world.group.add(group);
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.85, envMap: game.envMap ?? null });
  const addMesh = (geo, mat, { cast = true, receive = true, name } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    if (name) m.name = name;
    group.add(m);
    return m;
  };
  // Светящийся материал: днём приглушён, ночью горит (daynight.js).
  const glowMat = (color, day = 0.45, night = 1.25, extra = {}) => {
    const mat = new THREE.MeshBasicMaterial({ color, ...extra });
    world.glow.push({ mat, base: col(color), day, night });
    return mat;
  };
  const collide = (minX, maxX, minZ, maxZ, height, minimap = true) => {
    const b = { minX, maxX, minZ, maxZ, height, type: 'building', landmark: true };
    world.colliders.add(b);
    if (minimap) world.buildings.push(b);
    return b;
  };
  const block = (name) => {
    const [i, j] = CONFIG.world.landmarkBlocks[name];
    return world.blocks[j * world.blocksPerAxis + i];
  };

  buildPlaza(world, { group, plain, metal, addMesh, glowMat, collide });
  buildArena(world, block('arena'), { group, plain, addMesh, glowMat, collide });
  buildShowroom(world, block('showroom'), { group, plain, addMesh, glowMat, collide });
  buildTower(world, block('tower'), { group, plain, addMesh, glowMat, collide });
  buildPonds(world, { plain, addMesh, collide });
  buildPortCranes(world, { plain, addMesh, collide });
  buildBeacons(world, { group });
  buildStreetDecor(world, { group, plain, addMesh, collide });
}

// ---------------------------------------------------------------- Площадь Чемпионов
function buildPlaza(world, { plain, metal, addMesh, glowMat, collide, group }) {
  const b = world.blocks[4 * world.blocksPerAxis + 4];
  const cx = b.cx, cz = b.cz;
  world.treeExclusions.push({ x: cx, z: cz, r: 15 });
  const parts = [];
  // Мощение: концентрические кольца плитки.
  const disc = (r, y, c) => parts.push({ geometry: new THREE.CylinderGeometry(r, r, 0.04, 40).translate(cx, H + y, cz), color: col(c) });
  disc(14, 0.02, '#cfc8b6'); disc(12.5, 0.04, '#b9ae98'); disc(11.2, 0.06, '#d9d2c0'); disc(7.5, 0.08, '#a79c86'); disc(6.8, 0.1, '#e2dccb');
  // Фонтан: чаша, вода, центральная колонна и верхняя чаша.
  parts.push({ geometry: cyl(5.2, 5.4, 0.9, 32, cx, H + 0.45, cz), color: col('#b9b4a6') });
  parts.push({ geometry: cyl(5.5, 5.5, 0.18, 32, cx, H + 0.95, cz), color: col('#d6d1c3') });
  parts.push({ geometry: cyl(1.5, 1.8, 1.4, 20, cx, H + 0.7, cz), color: col('#a8a294') });
  // Постамент статуи.
  parts.push({ geometry: box(3.0, 1.5, 3.0, cx, H + 1.5, cz), color: col('#cfc8b6') });
  parts.push({ geometry: box(3.4, 0.35, 3.4, cx, H + 0.9, cz), color: col('#b9ae98') });
  parts.push({ geometry: box(3.4, 0.3, 3.4, cx, H + 2.35, cz), color: col('#d6d1c3') });
  // Клумбы по углам.
  const rng = world.rng;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = cx + sx * 9.2, bz = cz + sz * 9.2;
    parts.push({ geometry: cyl(2.1, 2.2, 0.5, 18, bx, H + 0.25, bz), color: col('#bdb7a8') });
    parts.push({ geometry: cyl(1.85, 1.85, 0.52, 18, bx, H + 0.26, bz), color: col('#5a3d2a') });
    const palette = rng.pick([['#e84393', '#ffd200', '#ffffff'], ['#d63031', '#ffffff', '#ff8a00'], ['#8e44ad', '#ffd200', '#ff6fa0']]);
    for (let k = 0; k < 22; k++) {
      const a = rng.range(0, 6.28), r = Math.sqrt(rng.next()) * 1.7;
      parts.push({ geometry: new THREE.SphereGeometry(0.2, 6, 5).translate(bx + Math.sin(a) * r, H + 0.7 + rng.range(0, 0.15), bz + Math.cos(a) * r), color: col(rng.pick(palette)) });
    }
  }
  // Скамейки по кольцу, лицом к фонтану.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const bx = cx + Math.sin(a) * 12.9, bz = cz + Math.cos(a) * 12.9;
    const benchParts = [
      box(1.6, 0.07, 0.42, 0, 0.45, 0), box(1.6, 0.36, 0.06, 0, 0.72, -0.2), box(0.06, 0.45, 0.4, 0.7, 0.22, 0), box(0.06, 0.45, 0.4, -0.7, 0.22, 0),
    ].map((geometry, i) => ({ geometry: geometry.rotateY(a + Math.PI).translate(bx, H, bz), color: col(i < 2 ? '#8a5a33' : '#2b2b2b') }));
    parts.push(...benchParts);
    world.benchSpots.push({ x: bx, z: bz, heading: a + Math.PI, y: H });
    collide(bx - 0.5, bx + 0.5, bz - 0.5, bz + 0.5, H + 0.9, false);
  }
  addMesh(mergeColored(parts), plain, { name: 'plaza' });
  // Вода.
  const water = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.0, 0.05, 32), new THREE.MeshStandardMaterial({
    color: 0x4db8e8, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.86, envMap: world.game.envMap ?? null,
  }));
  water.position.set(cx, H + 0.86, cz);
  group.add(water);
  // Струи: тонкие светлые конусы вокруг колонны.
  const jets = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    jets.push({ geometry: new THREE.ConeGeometry(0.1, 1.6, 6).rotateZ(Math.sin(a) * 0.5).rotateX(Math.cos(a) * 0.5).translate(cx + Math.sin(a) * 2.2, H + 1.9, cz + Math.cos(a) * 2.2), color: col('#d6f1ff') });
  }
  jets.push({ geometry: new THREE.ConeGeometry(0.16, 2.6, 8).translate(cx, H + 3.4, cz), color: col('#d6f1ff') });
  addMesh(mergeColored(jets), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }), { cast: false, name: 'fountain-jets' });
  collide(cx - 4.6, cx + 4.6, cz - 4.6, cz + 4.6, H + 1.0);
  collide(cx - 1.5, cx + 1.5, cz - 1.5, cz + 1.5, H + 6, false);

  // Золотая статуя бойца с чемпионским поясом над головой.
  const gold = col('#e0b83c'), dark = col('#a8821f');
  const sp = [];
  const y0 = H + 2.5;
  const add = (g, c = gold) => sp.push({ geometry: g, color: c });
  add(cyl(0.26, 0.2, 1.6, 10, cx - 0.4, y0 + 0.8, cz));                       // ноги
  add(cyl(0.26, 0.2, 1.6, 10, cx + 0.4, y0 + 0.8, cz + 0.1));
  add(box(1.2, 0.9, 0.6, cx, y0 + 1.95, cz), gold);                           // таз и торс
  add(new THREE.CapsuleGeometry(0.55, 0.6, 4, 12).scale(1.0, 1, 0.65).translate(cx, y0 + 2.7, cz));
  add(new THREE.SphereGeometry(0.3, 14, 10).translate(cx, y0 + 3.6, cz));      // голова
  add(cyl(0.18, 0.15, 1.3, 8, 0, 0, 0).rotateZ(0.5).translate(cx - 0.95, y0 + 3.5, cz)); // руки вверх
  add(cyl(0.18, 0.15, 1.3, 8, 0, 0, 0).rotateZ(-0.5).translate(cx + 0.95, y0 + 3.5, cz));
  add(cyl(0.16, 0.13, 0.9, 8, 0, 0, 0).rotateZ(0.2).translate(cx - 0.65, y0 + 4.5, cz));
  add(cyl(0.16, 0.13, 0.9, 8, 0, 0, 0).rotateZ(-0.2).translate(cx + 0.65, y0 + 4.5, cz));
  add(box(1.9, 0.38, 0.28, cx, y0 + 5.0, cz), dark);                           // пояс над головой
  add(box(0.7, 0.5, 0.32, cx, y0 + 5.0, cz), gold);
  add(new THREE.SphereGeometry(0.16, 8, 6).translate(cx, y0 + 5.0, cz + 0.18), col('#d63031'));
  addMesh(mergeColored(sp), metal, { name: 'champion-statue' });
  // Фонари площади (светятся ночью).
  const lampParts = [], lampHeads = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = cx + Math.sin(a) * 14.3, lz = cz + Math.cos(a) * 14.3;
    lampParts.push({ geometry: cyl(0.1, 0.16, 4.2, 8, lx, H + 2.1, lz), color: col('#2b2f36') });
    lampParts.push({ geometry: cyl(0.3, 0.2, 0.2, 8, lx, H + 4.3, lz), color: col('#2b2f36') });
    lampHeads.push({ geometry: new THREE.SphereGeometry(0.42, 12, 8).translate(lx, H + 4.7, lz), color: col('#fff4d6') });
    collide(lx - 0.2, lx + 0.2, lz - 0.2, lz + 0.2, H + 4.8, false);
  }
  addMesh(mergeColored(lampParts), plain);
  addMesh(mergeColored(lampHeads), glowMat(0xfff4d6, 0.7, 1.4, { vertexColors: true }), { cast: false });
}

// ---------------------------------------------------------------- Арена «Октагон»
function buildArena(world, b, { plain, addMesh, glowMat, collide, group }) {
  const cx = b.cx, cz = b.cz;
  const A = 31;             // расстояние от центра до граней барабана
  const T = A;
  const hDrum = 20;
  const parts = [];
  const push = (geometry, c) => parts.push({ geometry, color: col(c) });
  push(oct(A / Math.cos(Math.PI / 8) + 2.5, A / Math.cos(Math.PI / 8) + 2.5, 0.5, cx, H + 0.25, cz), '#8f8a7d');             // плита
  push(oct(T / Math.cos(Math.PI / 8), A / Math.cos(Math.PI / 8), hDrum, cx, H + hDrum / 2 + 0.5, cz), '#3a3d46');              // барабан
  push(oct(T / Math.cos(Math.PI / 8) + 0.8, T / Math.cos(Math.PI / 8) + 0.8, 1.4, cx, H + hDrum + 1.0, cz), '#d9b13b');        // золотой карниз
  push(oct(T / Math.cos(Math.PI / 8) - 1.5, T / Math.cos(Math.PI / 8) - 1.5, 0.5, cx, H + hDrum + 1.5, cz), '#2a2d33');        // крыша
  // Рёбра в углах восьмигранника.
  const Rv = A / Math.cos(Math.PI / 8) + 0.1;
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    push(box(1.2, hDrum, 1.2, cx + Math.sin(a) * Rv, H + hDrum / 2 + 0.5, cz + Math.cos(a) * Rv), '#c9c3b2');
  }
  // Знамёна стран: на каждой грани три полотнища в цветах флагов.
  const flags = [['#f2f2f2', '#1c4fa0', '#d52b1e'], ['#1ea64b', '#f6d51e', '#1b3f95'], ['#b22234', '#f2f2f2', '#3c3b6e'], ['#c60b1e', '#ffc400', '#c60b1e'],
    ['#00afca', '#fedf00', '#f2f2f2'], ['#d90012', '#0033a0', '#f2a800'], ['#169b62', '#f2f2f2', '#ff883e'], ['#1c3f94', '#f2f2f2', '#e1000f']];
  const banners = [];
  for (let f = 0; f < 8; f++) {
    const ang = (f / 8) * Math.PI * 2;                   // нормаль грани
    const fl = flags[f];
    const dist = A + 0.12;
    for (const off of [-9.5, 9.5]) {
      for (let s = 0; s < 3; s++) {
        const g = new THREE.PlaneGeometry(2.0, 7.5).translate((s - 1) * 2.05 + off, 0, 0).rotateY(ang);
        g.translate(cx + Math.sin(ang) * dist, H + 7.2, cz + Math.cos(ang) * dist);
        banners.push({ geometry: g, color: col(fl[s]) });
      }
    }
  }
  addMesh(mergeColored(parts), plain, { name: 'arena' });
  addMesh(mergeColored(banners), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), { name: 'arena-banners' });
  // Кольцо света на крыше и неоновые обводки.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(T / Math.cos(Math.PI / 8) - 1.2, 0.45, 8, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8), glowMat(0xff3d6e, 0.5, 1.4));
  ring.position.set(cx, H + hDrum + 2.1, cz);
  group.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(A / Math.cos(Math.PI / 8) + 0.25, 0.25, 6, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8), glowMat(0x00e5ff, 0.4, 1.3));
  ring2.position.set(cx, H + 1.4, cz);
  group.add(ring2);
  // Большие неоновые вывески на четырёх сторонах.
  const tex = neonTexture('ОКТАГОН', 'АРЕНА  ·  БОИ БЕЗ ПРАВИЛ  ·  ЧЕМПИОНЫ ГОРОДА', 1024, 256, '#ffd45a', '#00e5ff');
  const signMat = glowMat(0xffffff, 0.55, 1.15, { map: tex });
  for (let k = 0; k < 4; k++) {
    const ang = (k / 4) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), signMat);
    p.position.set(cx + Math.sin(ang) * (A + 0.2), H + 14.2, cz + Math.cos(ang) * (A + 0.2));
    p.rotation.y = ang;
    group.add(p);
    // Красная дорожка к входу.
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(5, 9).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa3141d, roughness: 0.9 }));
    carpet.position.set(cx + Math.sin(ang) * (A + 4.8), H + 0.07, cz + Math.cos(ang) * (A + 4.8));
    carpet.rotation.y = ang;
    carpet.receiveShadow = true;
    group.add(carpet);
    // Дверь.
    const door = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 0.6), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.4 }));
    door.position.set(cx + Math.sin(ang) * (A - 0.1), H + 3, cz + Math.cos(ang) * (A - 0.1));
    door.rotation.y = ang;
    group.add(door);
  }
  // Лучи прожекторов над крышей (ночью).
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  world.beams.push({ mat: beamMat, max: 0.16 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.8, 95, 10, 1, true).translate(0, 47.5, 0), beamMat);
    beam.position.set(cx + Math.sin(a) * 24, H + hDrum + 2, cz + Math.cos(a) * 24);
    beam.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
    beam.renderOrder = 3;
    group.add(beam);
  }
  // Коллизии: восьмиугольник — две центральные коробки и ступени по углам (внутри контура).
  const k1 = A * Math.tan(Math.PI / 8) - 0.3;
  collide(cx - A, cx + A, cz - k1, cz + k1, H + hDrum + 2);
  collide(cx - k1, cx + k1, cz - A, cz + A, H + hDrum + 2);
  const N = 5;
  for (let i = 0; i < N; i++) {
    const xa = k1 + (i * (A - k1)) / N, xb = k1 + ((i + 1) * (A - k1)) / N, zmax = A + k1 - xb;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      collide(Math.min(cx + sx * xa, cx + sx * xb), Math.max(cx + sx * xa, cx + sx * xb), Math.min(cz + sz * k1, cz + sz * zmax), Math.max(cz + sz * k1, cz + sz * zmax), H + hDrum + 2, i === 0);
    }
  }
  world.landmarks.arena = { x: cx, z: cz, name: 'Арена «Октагон»' };
}

// ---------------------------------------------------------------- Автосалон «Турбо»
function buildShowroom(world, b, { plain, addMesh, glowMat, collide, group }) {
  const l = b.lot;
  const cx = b.cx, cz = b.cz;
  const parts = [];
  const push = (geometry, c) => parts.push({ geometry, color: col(c) });
  // Покрытие площадки: тёмная плитка с цветными линиями.
  push(box(l.maxX - l.minX - 2, 0.05, l.maxZ - l.minZ - 2, cx, H + 0.03, cz), '#1c1e25');
  for (let z = l.minZ + 6; z < l.maxZ - 12; z += 20) push(box(l.maxX - l.minX - 6, 0.02, 0.25, cx, H + 0.07, z), '#2b2f3a');
  // Павильон: вдоль северной стороны, фасадом на юг (к площадке).
  const bz1 = l.maxZ - 0.6, bz0 = bz1 - 13, bx0 = l.minX + 3, bx1 = l.maxX - 3;
  push(box(bx1 - bx0, 9, 13, (bx0 + bx1) / 2, H + 4.5, (bz0 + bz1) / 2), '#2b2f3a');
  push(box(bx1 - bx0 + 1, 0.7, 14, (bx0 + bx1) / 2, H + 9.3, (bz0 + bz1) / 2 - 0.4), '#d9b13b');                         // карниз
  // Остекление: витрина по всей ширине, светящаяся изнутри.
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(bx1 - bx0 - 3, 5.2), new THREE.MeshBasicMaterial({ color: 0xbfe6ff }));
  world.glow.push({ mat: glass.material, base: col(0xbfe6ff), day: 0.42, night: 1.0 });
  glass.position.set((bx0 + bx1) / 2, H + 3.2, bz0 - 0.03);
  glass.rotation.y = Math.PI;
  group.add(glass);
  for (let x = bx0 + 3; x < bx1 - 2; x += 6) push(box(0.25, 5.4, 0.3, x, H + 3.2, bz0 - 0.08), '#15171c');             // импосты
  push(box(bx1 - bx0 - 2.8, 0.3, 0.3, (bx0 + bx1) / 2, H + 5.9, bz0 - 0.08), '#15171c');
  // Козырёк над входом.
  push(box(bx1 - bx0 - 2, 0.35, 3.2, (bx0 + bx1) / 2, H + 6.4, bz0 - 1.5), '#d9b13b');
  addMesh(mergeColored(parts), plain, { name: 'showroom' });
  collide(bx0, bx1, bz0, bz1, H + 10);
  // Вывеска.
  const tex = neonTexture('АВТОСАЛОН «ТУРБО»', 'любая тачка — твоя  ·  без очереди', 1024, 200, '#ff3df2', '#00e5ff');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(36, 7), glowMat(0xffffff, 0.55, 1.15, { map: tex }));
  sign.position.set((bx0 + bx1) / 2, H + 12.2, bz0 - 0.6);
  sign.rotation.y = Math.PI;
  group.add(sign);
  // Подиумы 4 x 3 с неоновыми кольцами и стоящими на них машинами.
  const slots = [];
  const cols = 4, rows = 3;
  const x0 = l.minX + 11, dx = (l.maxX - l.minX - 22) / (cols - 1);
  const zRows = [bz0 - 10, bz0 - 30, bz0 - 50];
  const cars = ['hyper', 'lowrider', 'cyber', 'muscle', 'convertible', 'monster', 'limo', 'suv', 'retro', 'icecream', 'bus', 'sports'];
  const colors = [0xff7a00, 0x7b2cbf, 0xb9bfc7, 0xe0003a, 0xff5ea8, 0x3d9a2a, 0x101114, 0x1f4e8c, 0x5ec8c0, 0xffd6e7, 0x1f8a4c, 0xf1c40f];
  const neon = [0x00e5ff, 0xff3df2, 0x39ff14, 0xfff200];
  const pod = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * dx, z = zRows[r];
      if (z < l.minZ + 6) continue;
      const type = cars[n];
      const wide = type === 'bus' || type === 'limo';
      pod.push({ geometry: box(wide ? 6.4 : 5.6, 0.1, wide ? 11.2 : 8.6, x, H + 0.05, z), color: col('#2d303a') });
      const ringMat = glowMat(neon[(r + c) % neon.length], 0.5, 1.4, { transparent: true, opacity: 0.9 });
      const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(wide ? 5.6 : 4.5, 0.12, 6, 28).rotateX(Math.PI / 2).scale(1, 1, 1.0), ringMat);
      ringMesh.position.set(x, H + 0.14, z);
      ringMesh.scale.set(wide ? 0.62 : 0.7, 1, wide ? 1.0 : 0.9);
      group.add(ringMesh);
      const heading = Math.PI * (0.62 + ((r + c) % 2) * 0.14);
      slots.push({ x, z, heading, type, color: colors[n] });
      n++;
      if (n >= cars.length) break;
    }
  }
  addMesh(mergeColored(pod), plain, { name: 'showroom-podiums' });
  world.showroomSpawns = slots.map((s) => ({ x: s.x, z: s.z, heading: s.heading, color: s.color, type: s.type }));
  world.landmarks.showroom = { x: cx, z: cz, name: 'Автосалон «Турбо»' };
}

// ---------------------------------------------------------------- Прайм-тауэр
function buildTower(world, b, { plain, addMesh, glowMat, collide, group }) {
  const cx = b.cx, cz = b.cz;
  const facade = new GeometryBuilder(), accent = [];
  const tiers = [[40, 55], [32, 50], [24, 42], [16, 34]];
  let y = H;
  const color = col('#8fb3d6');
  for (const [w, h] of tiers) {
    facade.walls(cx - w / 2, y, cz - w / 2, cx + w / 2, y + h, cz + w / 2, color, 32, 28, 0);
    facade.flat(cx - w / 2, cz - w / 2, cx + w / 2, cz + w / 2, y + h, col('#4a5a6c'));
    // Парапет и неоновый пояс.
    accent.push({ geometry: box(w + 0.6, 0.5, w + 0.6, cx, y + h + 0.25, cz), color: col('#2a2d33') });
    collide(cx - w / 2, cx + w / 2, cz - w / 2, cz + w / 2, y + h + 0.5, y === H);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.7, w + 0.5), glowMat(0x00e5ff, 0.5, 1.5));
    band.position.set(cx, y + h - 1.4, cz);
    group.add(band);
    y += h;
  }
  // Шпиль с огнём.
  accent.push({ geometry: cyl(0.4, 1.2, 38, 8, cx, y + 19, cz), color: col('#c9ced4') });
  accent.push({ geometry: box(8, 0.4, 8, cx, y + 1, cz), color: col('#2a2d33') });
  world.beacons.push({ x: cx, y: y + 38.5, z: cz });
  collide(cx - 1, cx + 1, cz - 1, cz + 1, y + 38, false);
  addMesh(facade.build(), world.mats.facade, { name: 'prime-tower' });
  addMesh(mergeColored(accent), plain);
  // Вывеска на подиуме.
  const tex = neonTexture('ПРАЙМ-ТАУЭР', 'центр деловой жизни', 1024, 200, '#00e5ff', '#ffd45a');
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 5), glowMat(0xffffff, 0.55, 1.15, { map: tex }));
  sign.position.set(cx, H + 8, cz + 20.3);
  group.add(sign);
  // Клумбы и деревья вокруг.
  for (const [dx, dz] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) world._pendingTrees.push({ x: cx + dx, z: cz + dz, y: H });
  world.landmarks.tower = { x: cx, z: cz, name: 'Прайм-тауэр' };
}

// ---------------------------------------------------------------- пруды и краны
function buildPonds(world, { addMesh, collide, plain }) {
  const ponds = [world.blocks[7 * world.blocksPerAxis + 7], world.blocks[6 * world.blocksPerAxis + 1], world.blocks[1 * world.blocksPerAxis + 6]];
  for (const b of ponds) {
    if (!b || b.type !== 'park') continue;
    const px = b.cx + 14, pz = b.cz - 14, r = 8.5;
    world.treeExclusions.push({ x: px, z: pz, r: r + 3 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 28), new THREE.MeshStandardMaterial({
      color: 0x3f9fd6, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.88, envMap: world.game.envMap ?? null,
    }));
    water.position.set(px, H + 0.06, pz);
    water.receiveShadow = true;
    world.group.add(water);
    const rim = [{ geometry: new THREE.TorusGeometry(r + 0.3, 0.3, 6, 28).rotateX(Math.PI / 2).translate(px, H + 0.15, pz), color: col('#9a8f7a') }];
    // Камыши и кувшинки.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + world.rng.range(-0.2, 0.2), rr = r - 0.4 + world.rng.range(-0.5, 0.3);
      rim.push({ geometry: cyl(0.04, 0.05, world.rng.range(1.1, 1.8), 5, px + Math.sin(a) * rr, H + 0.7, pz + Math.cos(a) * rr), color: col('#6b8f3a') });
    }
    for (let k = 0; k < 7; k++) {
      const a = world.rng.range(0, 6.28), rr = world.rng.range(1, r - 2);
      rim.push({ geometry: cyl(0.5, 0.5, 0.03, 10, px + Math.sin(a) * rr, H + 0.1, pz + Math.cos(a) * rr), color: col('#3f8f3a') });
    }
    addMesh(mergeColored(rim), plain, { cast: false });
    const k = r * 0.78;
    collide(px - k, px + k, pz - k, pz + k, H + 0.3, false);
  }
}

function buildPortCranes(world, { addMesh, collide, plain }) {
  const parts = [];
  const spots = CONFIG.world.cranes;
  for (const [x, z] of spots) {
    const red = col('#c0392b'), white = col('#e8e8e4');
    for (const [dx, dz] of [[-10, -6], [10, -6], [-10, 6], [10, 6]]) {
      parts.push({ geometry: box(1.3, 26, 1.3, x + dx, H + 13, z + dz), color: red });
      collide(x + dx - 0.7, x + dx + 0.7, z + dz - 0.7, z + dz + 0.7, H + 26, false);
    }
    parts.push({ geometry: box(24, 2.2, 15, x, H + 26.5, z), color: white });
    parts.push({ geometry: box(60, 1.6, 3, x + 18, H + 28.5, z), color: red });        // стрела
    parts.push({ geometry: box(3, 3.4, 3.4, x - 2, H + 25.2, z + 6), color: col('#2b2f36') });  // кабина
    for (const t of [10, 24, 38]) parts.push({ geometry: cyl(0.1, 0.1, 10, 5, x + t, H + 23.5, z), color: col('#2b2f36') }); // тросы
    parts.push({ geometry: box(2.5, 1, 2.5, x + 24, H + 18.5, z), color: col('#2b2f36') });
  }
  addMesh(mergeColored(parts), plain, { name: 'cranes' });
}

// ---------------------------------------------------------------- огни на шпилях
function buildBeacons(world, { group }) {
  if (!world.beacons.length) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 8, 6), mat, world.beacons.length);
  const m = new THREE.Object3D();
  world.beacons.forEach((bc, i) => {
    m.position.set(bc.x, bc.y, bc.z);
    m.updateMatrix();
    mesh.setMatrixAt(i, m.matrix);
  });
  mesh.frustumCulled = false;
  group.add(mesh);
  world.beaconMat = mat;
}

// ---------------------------------------------------------------- уличные деревья и остановки
function buildStreetDecor(world, { group, plain, addMesh, collide }) {
  const rng = world.rng;
  const lampNear = (x, z) => world.lamps.some((l) => Math.abs(l.x - x) < 3 && Math.abs(l.z - z) < 3);
  const reserved = (x, z) => world.banks.concat(world.stores).some((pl) => Math.hypot(pl.origin.x - x, pl.origin.z - z) < 15);
  const trees = [], stops = [];
  for (const b of world.blocks) {
    if (b.type === 'park' || b.district === 'port') continue;
    const len = b.maxX - b.minX;
    const treeChance = b.district === 'downtown' ? 0.4 : b.district === 'suburb' ? 0.9 : 0.65;
    const inset = 2.6;
    const sides = [
      { x0: b.minX, z0: b.maxZ - inset, dx: 1, dz: 0, heading: Math.PI },
      { x0: b.minX, z0: b.minZ + inset, dx: 1, dz: 0, heading: 0 },
      { x0: b.maxX - inset, z0: b.minZ, dx: 0, dz: 1, heading: -Math.PI / 2 },
      { x0: b.minX + inset, z0: b.minZ, dx: 0, dz: 1, heading: Math.PI / 2 },
    ];
    for (const s of sides) {
      for (let t = 14; t < len - 12; t += rng.range(12, 15)) {
        const x = s.x0 + s.dx * t, z = s.z0 + s.dz * t;
        if (lampNear(x, z) || reserved(x, z)) continue;
        if (world.treeExclusions.some((e) => Math.hypot(e.x - x, e.z - z) < e.r)) continue;
        if (rng.chance(treeChance)) trees.push({ x, z });
      }
      // Остановка: одна на ~каждые 3 стороны, у середины стороны.
      if (rng.chance(0.28) && b.district !== 'suburb') {
        const t = len / 2 + rng.range(-6, 6);
        const x = s.x0 + s.dx * t, z = s.z0 + s.dz * t;
        if (!lampNear(x, z) && !reserved(x, z)) stops.push({ x, z, heading: s.heading });
      }
    }
  }
  // Деревья: два InstancedMesh (ствол, крона), без теней — их много.
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 2.2, 6).translate(0, 1.1, 0);
  const crown = new THREE.IcosahedronGeometry(1.35, 0).translate(0, 3.0, 0);
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 }), Math.max(1, trees.length));
  const crownMesh = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), Math.max(1, trees.length));
  const m = new THREE.Object3D(), c = new THREE.Color();
  trees.forEach((t, i) => {
    const sc = rng.range(0.8, 1.25);
    m.position.set(t.x, H, t.z);
    m.rotation.set(0, rng.range(0, 6.28), 0);
    m.scale.set(sc, sc * rng.range(0.9, 1.2), sc);
    m.updateMatrix();
    trunkMesh.setMatrixAt(i, m.matrix);
    crownMesh.setMatrixAt(i, m.matrix);
    c.setHSL(rng.range(0.2, 0.33), rng.range(0.4, 0.6), rng.range(0.24, 0.36));
    crownMesh.setColorAt(i, c);
    collide(t.x - 0.25, t.x + 0.25, t.z - 0.25, t.z + 0.25, 3, false).type = 'tree';
  });
  trunkMesh.count = crownMesh.count = trees.length;
  for (const mesh of [trunkMesh, crownMesh]) { mesh.computeBoundingSphere(); mesh.frustumCulled = true; group.add(mesh); }

  // Остановки: навес, стеклянная стенка, скамья, столб с табличкой.
  const parts = [];
  for (const s of stops) {
    const rot = (g) => g.rotateY(s.heading).translate(s.x, H, s.z);
    parts.push({ geometry: rot(box(3.2, 0.12, 1.5, 0, 2.45, 0)), color: col('#2c6fbf') });
    for (const x of [-1.5, 1.5]) parts.push({ geometry: rot(box(0.1, 2.4, 0.1, x, 1.2, -0.65)), color: col('#2b2f36') });
    parts.push({ geometry: rot(box(3.0, 1.9, 0.05, 0, 1.35, -0.68)), color: col('#9ccbe6') });
    parts.push({ geometry: rot(box(2.4, 0.08, 0.4, 0, 0.5, -0.4)), color: col('#8a5a33') });
    parts.push({ geometry: rot(box(0.7, 1.1, 0.06, 1.9, 1.6, 0.2)), color: col('#e6b422') });
    parts.push({ geometry: rot(box(0.06, 2.4, 0.06, 1.9, 1.2, 0.2)), color: col('#2b2f36') });
    // Коллайдер по стенке, чтобы не ходили сквозь.
    const wx = Math.abs(Math.cos(s.heading)) > 0.5 ? 0.6 : 1.8, wz = Math.abs(Math.cos(s.heading)) > 0.5 ? 1.8 : 0.6;
    collide(s.x - wx, s.x + wx, s.z - wz, s.z + wz, H + 2.5, false);
  }
  if (parts.length) addMesh(mergeColored(parts), plain, { name: 'bus-stops' });
  world.treesStreet = trees.length;
  world.busStops = stops;
}
