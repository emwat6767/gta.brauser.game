import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeColored } from './geometry.js';
import { clamp, damp, moveTowards } from './utils.js';

// Машина: mid-poly модель из примитивов + аркадная физика ("велосипедная" модель
// поворота, боковое сцепление, ручник/занос, отскок от стен).
// Для коллизий машина — 3 круга вдоль продольной оси (см. CONFIG.vehicle).
//
// Локальные оси модели: +Z — вперёд, +X — влево (там водительская дверь), +Y — вверх.

const _hit = { nx: 0, nz: 0 };

// ----------------------------------------------------------------- Модель

// Типы машин: внешний вид (профиль кузова и кабины, детали) и характер езды
// (множители к CONFIG.vehicle: скорость, разгон, сцепление), места водителя и пассажиров
// ([x — влево, z — вперёд, y]) и двери пассажиров (снаружи), высота кузова для попаданий.
export const VEHICLE_TYPES = {
  sedan: {
    name: 'Седан', speed: 1, accel: 1, grip: 1, height: 1.45,
    body: [[-2.18, 0.3], [2.12, 0.3], [2.24, 0.42], [2.22, 0.68], [1.05, 0.84], [-1.55, 0.86], [-2.16, 0.8], [-2.24, 0.52]],
    cabin: [[-1.52, 0.84], [1.02, 0.84], [0.25, 1.39], [-1.18, 1.41]],
    driver: [0.38, -0.2, 0], dash: 0.92,
    seats: [[-0.38, -0.2, -0.06], [0.4, -0.86, -0.1], [-0.4, -0.86, -0.1]],
    doors: [[-1.7, -0.2], [1.7, -1.0], [-1.7, -1.0]],
  },
  sports: {
    name: 'Спорткар', speed: 1.3, accel: 1.55, grip: 1.3, height: 1.15,
    body: [[-2.2, 0.26], [2.2, 0.26], [2.32, 0.36], [2.28, 0.56], [0.95, 0.7], [-1.45, 0.76], [-2.2, 0.74], [-2.3, 0.48]],
    cabin: [[-1.4, 0.72], [0.9, 0.7], [0.0, 1.1], [-0.95, 1.12]],
    driver: [0.36, -0.45, -0.3], dash: 0.78, spoiler: true,
    seats: [[-0.36, -0.45, -0.3]],
    doors: [[-1.7, -0.45]],
  },
  taxi: {
    name: 'Такси', speed: 1, accel: 1, grip: 1, height: 1.45, base: 'sedan', taxi: true,
  },
  van: {
    name: 'Фургон', speed: 0.72, accel: 0.7, grip: 0.85, height: 2.05,
    body: [[-2.25, 0.34], [2.18, 0.34], [2.3, 0.5], [2.26, 0.95], [1.62, 1.08], [1.2, 1.96], [-2.25, 2.0]],
    cabin: [[0.35, 1.12], [1.66, 1.08], [1.26, 1.9], [0.35, 1.9]], glassWidth: 1.8, van: true,
    driver: [0.4, 0.55, 0.22], dash: 1.12,
    seats: [[-0.4, 0.55, 0.22], [0.4, -0.6, 0.22], [-0.4, -0.6, 0.22]],
    doors: [[-1.7, 0.55], [1.7, -0.6], [-1.7, -0.6]],
  },
  pickup: {
    name: 'Пикап', speed: 0.92, accel: 0.95, grip: 0.95, height: 1.55,
    body: [[-2.25, 0.32], [2.15, 0.32], [2.26, 0.46], [2.22, 0.78], [1.15, 0.9], [-2.25, 0.9]],
    cabin: [[-0.6, 0.88], [1.05, 0.88], [0.45, 1.52], [-0.6, 1.54]],
    driver: [0.38, 0.05, 0.08], dash: 1.0, bed: true,
    seats: [[-0.38, 0.05, 0.02]],
    doors: [[-1.7, 0.05]],
  },
};
for (const t of Object.values(VEHICLE_TYPES)) if (t.base) Object.assign(t, { ...VEHICLE_TYPES[t.base], ...t });

const ASSETS = new Map();
let COMMON = null;

// Общие для всех машин детали: колесо и материалы.
function commonAssets() {
  if (COMMON) return COMMON;
  const R = CONFIG.vehicle.wheelRadius;
  const cyl = (r, len, seg) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
  // Колесо: шина + диск + спицы (спицы нужны, чтобы было видно вращение).
  const wheel = mergeColored([
    { geometry: cyl(R, 0.26, 20), color: 0x1a1a1a },
    { geometry: cyl(0.23, 0.27, 14), color: 0xb9bec4 },
    { geometry: new THREE.BoxGeometry(0.275, 0.05, 0.42), color: 0x8f959b },
    { geometry: new THREE.BoxGeometry(0.275, 0.42, 0.05), color: 0x8f959b },
    { geometry: cyl(0.07, 0.29, 8), color: 0x6b6f73 },
  ]);
  COMMON = {
    wheel,
    trimMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
    wheelMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }),
    glassMat: new THREE.MeshStandardMaterial({
      color: 0x1b2833, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.45, envMapIntensity: 1.2,
    }),
    headMat: new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff2cc, emissiveIntensity: 0.6 }),
  };
  return COMMON;
}

// Геометрия типа машины (строится один раз на тип).
function typeAssets(typeId) {
  if (ASSETS.has(typeId)) return ASSETS.get(typeId);
  const T = VEHICLE_TYPES[typeId];

  // Боковой профиль (z — длина, y — высота), выдавливается по ширине.
  const extrude = (points, depth, bevel) => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, steps: 1, bevelEnabled: !!bevel,
      bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2,
    });
    g.rotateY(-Math.PI / 2); // профиль лёг вдоль Z, выдавливание — по X
    g.translate(depth / 2, 0, 0);
    return g;
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // Стойка крыши между двумя точками профиля [z, y] на борту x.
  const pillar = (p0, p1, x) => {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    return new THREE.BoxGeometry(0.06, len, 0.07).rotateX(Math.atan2(p1[0] - p0[0], p1[1] - p0[1]))
      .translate(x, (p0[1] + p1[1]) / 2, (p0[0] + p1[0]) / 2);
  };

  const C = T.cabin;
  const paintParts = [{ geometry: extrude(T.body, 1.76, 0.06) }];
  if (!T.van) {
    // Крыша и стойки по контуру кабины.
    const roofY = (C[2][1] + C[3][1]) / 2, roofLen = C[2][0] - C[3][0];
    paintParts.push({ geometry: box(1.6, 0.07, roofLen + 0.06, 0, roofY + 0.015, (C[2][0] + C[3][0]) / 2) });
    for (const x of [0.79, -0.79]) {
      paintParts.push({ geometry: pillar(C[1], C[2], x) }, { geometry: pillar(C[0], C[3], x) });
      paintParts.push({ geometry: box(0.06, roofY - C[0][1], 0.1, x, (roofY + C[0][1]) / 2, (C[0][0] + C[1][0]) / 2 - 0.1) });
    }
  }
  if (T.bed) {
    // Кузов пикапа: борта и тёмное дно.
    paintParts.push({ geometry: box(0.08, 0.3, 1.6, 0.84, 1.03, -1.42) }, { geometry: box(0.08, 0.3, 1.6, -0.84, 1.03, -1.42) });
    paintParts.push({ geometry: box(1.76, 0.3, 0.08, 0, 1.03, -2.2) });
  }
  if (T.spoiler) {
    paintParts.push({ geometry: box(1.6, 0.05, 0.3, 0, 1.02, -2.05) });
    for (const x of [0.6, -0.6]) paintParts.push({ geometry: box(0.06, 0.24, 0.12, x, 0.88, -2.05) });
  }
  const paint = mergeColored(paintParts);

  const arch = (z) => new THREE.CylinderGeometry(0.43, 0.43, 1.9, 16, 1, false, 0, Math.PI)
    .rotateZ(Math.PI / 2).translate(0, 0.36, z);
  const [dx, dz] = [T.driver[0], T.driver[1]];
  const trimParts = [
    { geometry: box(1.92, 0.2, 0.16, 0, 0.4, 2.24), color: 0x2b2b2b },    // бамперы
    { geometry: box(1.92, 0.2, 0.16, 0, 0.42, -2.25), color: 0x2b2b2b },
    { geometry: box(1.0, 0.16, 0.04, 0, 0.58, 2.265), color: 0x111111 },  // решётка
    { geometry: arch(1.33), color: 0x0d0d0d },                           // арки колёс
    { geometry: arch(-1.33), color: 0x0d0d0d },
    { geometry: box(0.2, 0.1, 0.13, 1.0, T.dash + 0.06, dz + 0.98), color: 0x222222 }, // зеркала
    { geometry: box(0.2, 0.1, 0.13, -1.0, T.dash + 0.06, dz + 0.98), color: 0x222222 },
    { geometry: box(0.5, 0.12, 0.02, 0, 0.4, 2.33), color: 0xe8e4d0 },   // номера
    { geometry: box(0.5, 0.12, 0.02, 0, 0.62, -2.3), color: 0xe8e4d0 },
    // Салон (виден через стёкла): сиденья водителя и пассажиров, торпедо, руль.
    { geometry: box(1.56, 0.2, 0.35, 0, T.dash, dz + 0.92), color: 0x2b2b2b },
    { geometry: new THREE.TorusGeometry(0.17, 0.025, 6, 18).rotateX(0.4).translate(dx, T.dash + 0.01, dz + 0.56), color: 0x151515 },
  ];
  for (const [x, z, y] of [T.driver, ...T.seats]) {
    trimParts.push({ geometry: box(0.5, 0.12, 0.5, x, 0.42 + y, z + 0.05), color: 0x3a3a3a });
    trimParts.push({ geometry: box(0.5, 0.62, 0.12, x, 0.76 + y, z - 0.26), color: 0x3a3a3a });
  }
  if (T.bed) trimParts.push({ geometry: box(1.68, 0.06, 1.6, 0, 0.9, -1.42), color: 0x1d1d1d });
  if (T.van) {
    // Задние двери со стёклами, полоса по борту, тёмный низ.
    trimParts.push({ geometry: box(1.5, 0.5, 0.04, 0, 1.55, -2.27), color: 0x1b2833 });
    trimParts.push({ geometry: box(0.03, 1.5, 0.05, 0, 1.2, -2.27), color: 0x333333 });
    trimParts.push({ geometry: box(1.8, 0.14, 3.2, 0, 1.0, -0.55), color: 0x2c3e50 });
    trimParts.push({ geometry: box(1.8, 0.16, 4.3, 0, 0.42, 0), color: 0x2b2b2b });
  }
  if (T.taxi) {
    trimParts.push({ geometry: box(0.62, 0.2, 0.26, 0, 1.52, -0.45), color: 0xffe066 });
    trimParts.push({ geometry: box(1.78, 0.1, 2.6, 0, 0.72, -0.1), color: 0x1a1a1a });
  }
  const trim = mergeColored(trimParts);
  const glass = extrude(C, T.glassWidth ?? 1.56, 0);
  const hy = T.van ? 0.7 : 0.62;
  const headlights = mergeColored([
    { geometry: box(0.36, 0.14, 0.06, 0.62, hy, 2.25) },
    { geometry: box(0.36, 0.14, 0.06, -0.62, hy, 2.25) },
  ]);
  const taillights = mergeColored([
    { geometry: box(0.38, 0.12, 0.05, 0.62, hy + 0.06, -2.25) },
    { geometry: box(0.38, 0.12, 0.05, -0.62, hy + 0.06, -2.25) },
  ]);
  const set = { paint, trim, glass, headlights, taillights };
  ASSETS.set(typeId, set);
  return set;
}

// ----------------------------------------------------------------- Машина

export class Vehicle {
  // opts: { x, z, heading, color, police, type } — type: ключ VEHICLE_TYPES (по умолчанию седан)
  constructor(game, { x, z, heading = 0, color = 0xc0392b, police = false, type = 'sedan' }) {
    const V = CONFIG.vehicle;
    this.game = game;
    this.position = new THREE.Vector3(x, game.world.getGroundHeight(x, z), z);
    this.velocity = new THREE.Vector3();
    this.heading = heading;
    this.forwardSpeed = 0;   // проекция скорости на "вперёд", м/с (отрицательная — задний ход)
    this.yawRate = 0;
    this.spin = 0;           // доп. вращение от ударов
    this.steer = 0;
    this.braking = false;
    this.driver = null;      // Player или NPC за рулём
    this.ai = null;          // ИИ-водитель (traffic.js), если за рулём NPC
    this.controls = { throttle: 0, steer: 0, handbrake: false }; // -1..1, + руль = влево
    this.police = police;
    this.type = police ? 'sedan' : type;
    this.spec = VEHICLE_TYPES[this.type];
    this.hitHeight = this.spec.height;
    this.doors = this.spec.doors;
    this.sirenOn = false;
    this.removed = false;
    this.radius = V.collisionRadius;
    this.circleOffsets = V.circleOffsets;
    this.seatHipHeight = 0.5;
    this.parked = false;     // стоит у бордюра без водителя (traffic.js)
    this.color = color;
    this.circles = this.circleOffsets.map(() => ({ x: 0, z: 0 }));
    this._pitch = 0;
    this._roll = 0;
    this._prevForward = 0;
    this._buildModel(police ? 0xf4f4f2 : this.spec.taxi ? 0xf2c230 : color);
    if (police) this._addPoliceKit();
    game.scene.add(this.root);
    this.updateCircles();
    this._syncVisual(0);
  }

  get speed() {
    return this.forwardSpeed;
  }

  _buildModel(color) {
    const S = { ...commonAssets(), ...typeAssets(this.type) };
    const env = this.game.envMap ?? null;
    if (env && !S.glassMat.envMap) S.glassMat.envMap = env;
    const T = this.spec;
    this.paintMat = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32, envMap: env });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff1a1a, emissiveIntensity: 0.35 });

    this.root = new THREE.Group();
    this.root.name = 'vehicle';
    this.body = new THREE.Group();   // наклоняется при разгоне/поворотах, колёса — нет
    this.root.add(this.body);

    const add = (geo, mat, parent, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      parent.add(m);
      return m;
    };
    add(S.paint, this.paintMat, this.body);
    // Мелкие детали (салон, бамперы, фары) вдали не видны — их прячет setDetail(false).
    this.detailMeshes = [
      add(S.trim, S.trimMat, this.body),
      add(S.headlights, S.headMat, this.body, false),
      add(S.taillights, this.tailMat, this.body, false),
    ];
    add(S.glass, S.glassMat, this.body, false);
    this.detail = true;

    // Точка крепления водителя (модель игрока становится её дочерним объектом).
    this.seatAnchor = new THREE.Group();
    this.seatAnchor.position.set(T.driver[0], T.driver[2], T.driver[1]);
    this.body.add(this.seatAnchor);
    // Места пассажиров (банда игрока) — свои у каждого типа машины.
    this.passengerAnchors = T.seats.map(([x, z, y]) => {
      const a = new THREE.Group();
      a.position.set(x, y, z);
      this.body.add(a);
      return a;
    });
    this.passengers = T.seats.map(() => null);

    const V = CONFIG.vehicle;
    const R = V.wheelRadius;
    const halfBase = V.wheelBase / 2;
    this.wheels = [];
    for (const [x, z, front] of [[0.84, halfBase, true], [-0.84, halfBase, true], [0.84, -halfBase, false], [-0.84, -halfBase, false]]) {
      const pivot = new THREE.Group();   // поворот руля (Y)
      pivot.position.set(x, R, z);
      const spinner = add(S.wheel, S.wheelMat, pivot); // вращение (X)
      this.root.add(pivot);
      this.wheels.push({ pivot, spinner, front });
    }
    this.wheelSpin = 0;
  }

  // Чёрно-белая раскраска и мигалка на крыше.
  _addPoliceKit() {
    const S = commonAssets();
    S.policeBand ??= mergeColored([
      { geometry: new THREE.BoxGeometry(1.94, 0.24, 2.3).translate(0, 0.56, -0.1), color: 0x111418 },
      { geometry: new THREE.BoxGeometry(1.0, 0.08, 0.3).translate(0, 1.46, -0.46), color: 0x222222 },
    ]);
    const band = new THREE.Mesh(S.policeBand, S.trimMat);
    band.castShadow = true;
    this.body.add(band);
    this.sirenRed = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.2 });
    this.sirenBlue = new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x1a5cff, emissiveIntensity: 0.2 });
    const lamp = new THREE.BoxGeometry(0.42, 0.1, 0.24);
    const red = new THREE.Mesh(lamp, this.sirenRed);
    red.position.set(0.24, 1.53, -0.46);
    const blue = new THREE.Mesh(lamp, this.sirenBlue);
    blue.position.set(-0.24, 1.53, -0.46);
    this.body.add(red, blue);
  }

  // Детализация по расстоянию до камеры (traffic.js): вдали — только кузов, стёкла, колёса.
  setDetail(on) {
    if (on === this.detail) return;
    this.detail = on;
    for (const m of this.detailMeshes) m.visible = on;
  }

  // Убрать машину из мира (трафик за пределами видимости и т.п.).
  dispose() {
    this.removed = true;
    this.root.removeFromParent();
    this.paintMat.dispose();
    this.tailMat.dispose();
    this.sirenRed?.dispose();
    this.sirenBlue?.dispose();
  }

  // Центры кругов коллизии в мировых координатах.
  updateCircles() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (let i = 0; i < this.circles.length; i++) {
      this.circles[i].x = this.position.x + fx * this.circleOffsets[i];
      this.circles[i].z = this.position.z + fz * this.circleOffsets[i];
    }
    return this.circles;
  }

  // Примерное расстояние от точки до кузова.
  distanceToPoint(x, z) {
    let best = Infinity;
    for (const c of this.circles) best = Math.min(best, Math.hypot(c.x - x, c.z - z) - this.radius);
    return Math.max(0, best);
  }

  // Локальная точка (lx — влево, lz — вперёд) -> мировые X/Z.
  localToWorld2D(lx, lz) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: this.position.x + lx * c + lz * s, z: this.position.z - lx * s + lz * c };
  }

  // Свободное место рядом с дверью: слева, справа, сзади, спереди.
  findExitPosition(radius) {
    const dz = this.spec.driver[1];
    const candidates = [[1.7, dz], [-1.7, dz], [0, -3.4], [0, 3.4]].map(([lx, lz]) => this.localToWorld2D(lx, lz));
    for (const p of candidates) {
      if (!this.game.world.isCircleFree(p.x, p.z, radius)) continue;
      const blocked = this.game.vehicles.some((v) => v !== this && v.distanceToPoint(p.x, p.z) < radius);
      if (!blocked) return p;
    }
    return candidates[0];
  }

  // Кто ведёт машину, тот и заполняет controls: игрок — с клавиатуры/джойстика, NPC — ИИ.
  _readControls(dt) {
    const c = this.controls;
    const player = this.game.player;
    if (this.driver && this.driver === player && !player.isDead) {
      const input = this.game.input;
      c.throttle = input.axis('backward', 'forward');
      c.steer = input.axis('right', 'left');
      c.handbrake = input.isDown('handbrake');
    } else if (this.driver && this.ai) {
      this.ai.drive(dt, c);
    } else {
      c.throttle = 0;
      c.steer = 0;
      c.handbrake = false;
    }
    return c;
  }

  update(dt) {
    const V = CONFIG.vehicle;
    const T = this.spec;
    const { throttle, steer: steerInput, handbrake } = this._readControls(dt);
    const maxSpeed = V.maxSpeed * T.speed * (this.boost ?? 1);

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx; // "вправо"
    let vf = this.velocity.x * fx + this.velocity.z * fz;
    let vr = this.velocity.x * rx + this.velocity.z * rz;

    // Руль: на скорости угол меньше.
    const steerLimit = V.maxSteer / (1 + Math.abs(vf) * V.steerSpeedFactor);
    this.steer = moveTowards(this.steer, steerInput * steerLimit, (steerInput ? V.steerRate : V.steerReturn) * dt);

    // Газ / тормоз / задний ход.
    this.braking = false;
    if (throttle > 0) {
      if (vf < -0.5) { vf = moveTowards(vf, 0, V.brakeDecel * dt); this.braking = true; }
      else vf += V.accel * T.accel * throttle * (1 - clamp(vf / maxSpeed, 0, 1)) * dt;
    } else if (throttle < 0) {
      if (vf > 0.5) { vf = moveTowards(vf, 0, V.brakeDecel * dt); this.braking = true; }
      else vf -= V.reverseAccel * -throttle * (1 - clamp(-vf / V.maxReverse, 0, 1)) * dt;
    } else {
      vf = moveTowards(vf, 0, (this.driver ? V.coastDecel : V.parkedDecel) * dt);
    }
    vf -= Math.sign(vf) * V.airDrag * vf * vf * dt;
    if (handbrake) {
      vf = moveTowards(vf, 0, V.handbrakeDecel * dt);
      this.braking = true;
    }

    // Боковое сцепление: на ручнике машина скользит (занос).
    vr *= Math.exp(-(handbrake ? V.gripHandbrake : V.grip * T.grip) * dt);

    this.velocity.x = fx * vf + rx * vr;
    this.velocity.z = fz * vf + rz * vr;
    this.forwardSpeed = vf;

    // Поворот корпуса по "велосипедной" модели.
    this.yawRate = (vf / V.wheelBase) * Math.tan(this.steer) * (handbrake ? 1.35 : 1);
    this.spin *= Math.exp(-5 * dt);
    this.heading += (this.yawRate + this.spin) * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._collideWorld();

    const ground = this.game.world.getGroundHeight(this.position.x, this.position.z);
    this.position.y = damp(this.position.y, ground, 14, dt);

    this._syncVisual(dt);
  }

  _collideWorld() {
    const world = this.game.world;
    for (const off of this.circleOffsets) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const px = fx * off, pz = fz * off;
      const c = { x: this.position.x + px, z: this.position.z + pz };
      const bx = c.x, bz = c.z;
      if (!world.resolveCircle(c, this.radius, _hit)) continue;
      this.position.x += c.x - bx;
      this.position.z += c.z - bz;
      this.applyImpact(_hit.nx, _hit.nz, px, pz, null);
    }
    this.updateCircles();
  }

  // Отскок от препятствия с нормалью (nx, nz) в точке (px, pz) относительно центра.
  applyImpact(nx, nz, px, pz, other) {
    const V = CONFIG.vehicle;
    const vn = this.velocity.x * nx + this.velocity.z * nz;
    if (vn >= 0) return 0;
    const j = -(1 + V.restitution) * vn;
    this.velocity.x = (this.velocity.x + nx * j) * V.wallFriction;
    this.velocity.z = (this.velocity.z + nz * j) * V.wallFriction;
    this.spin += (nx * j * pz - nz * j * px) * V.impactSpin;
    if (j > 3) this.game.events.emit('vehicle:crash', { vehicle: this, impulse: j, other });
    return j;
  }

  _syncVisual(dt) {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    if (dt > 0) {
      const accel = (this.forwardSpeed - this._prevForward) / dt;
      this._prevForward = this.forwardSpeed;
      this._pitch = damp(this._pitch, clamp(-accel * 0.004, -0.05, 0.05), 6, dt);
      this._roll = damp(this._roll, clamp(this.yawRate * this.forwardSpeed * 0.0035, -0.07, 0.07), 6, dt);
      this.wheelSpin += (this.forwardSpeed * dt) / CONFIG.vehicle.wheelRadius;
    }
    this.body.rotation.set(this._pitch, 0, this._roll);
    for (const w of this.wheels) {
      w.pivot.rotation.y = w.front ? this.steer : 0;
      w.spinner.rotation.x = this.wheelSpin;
    }
    this.tailMat.emissiveIntensity = this.braking ? 2.5 : 0.35;
    if (this.police) {
      const phase = this.sirenOn ? Math.floor(performance.now() / 160) % 2 : -1;
      this.sirenRed.emissiveIntensity = phase === 0 ? 3 : 0.2;
      this.sirenBlue.emissiveIntensity = phase === 1 ? 3 : 0.2;
    }
  }
}
