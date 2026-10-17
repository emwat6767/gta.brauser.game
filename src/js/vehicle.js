import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeColored } from './geometry.js';
import { clamp, damp, moveTowards } from './utils.js';
import { VEHICLE_TYPES, buildTypeAssets } from './vehicle-models.js';
import { Turret } from './military.js';

export { VEHICLE_TYPES };

// Ночь для машин (daynight.js): общий уровень, материалы фар/стёкол и текстура пятна света от фар.
export const NIGHT = { level: 0, headMat: null, glassMat: null, beamTex: null };
let BEAM_MAT = null;
let BEAM_GEO = null;

// Машина: mid-poly модель из примитивов + аркадная физика ("велосипедная" модель
// поворота, боковое сцепление, ручник/занос, отскок от стен).
// Для коллизий машина — 3 круга вдоль продольной оси (см. CONFIG.vehicle).
// Повреждения: health падает от пуль, аварий и взрывов; ниже трети — дымит, ноль — взрыв
// (explode), машина выгорает. launch() подбрасывает машину (удар Колосса, взрыв) — она летит
// по баллистике, кувыркаясь, и падает с ударом. carried — машину держит Колосс (powers.js).
//
// Локальные оси модели: +Z — вперёд, +X — влево (там водительская дверь), +Y — вверх.

const _hit = { nx: 0, nz: 0 };

// ----------------------------------------------------------------- Модель

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
  NIGHT.headMat = COMMON.headMat;
  NIGHT.glassMat = COMMON.glassMat;
  return COMMON;
}

// ----------------------------------------------------------------- Машина

export class Vehicle {
  // opts: { x, z, heading, color, police, type, livery } — type: ключ VEHICLE_TYPES (по умолчанию седан);
  // livery: { stripe, roof, neon } — цвета полосы, крыши и подсветки днища (поверх раскраски типа по умолчанию)
  constructor(game, { x, z, heading = 0, color = 0xc0392b, police = false, type = 'sedan', livery = null }) {
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
    this.radius = this.spec.radius;
    this.circleOffsets = this.spec.circles;
    // Габариты: охват кругов столкновений и коробка для попаданий пуль (ballistics.js).
    this.reach = Math.max(...this.circleOffsets.map(Math.abs)) + this.radius;
    this.box = { x0: -this.spec.width / 2 - 0.07, x1: this.spec.width / 2 + 0.07, z0: this.spec.zr - 0.06, z1: this.spec.zf + 0.06 };
    this.wheelRadius = CONFIG.vehicle.wheelRadius * this.spec.wheelScale;
    this.seatHipHeight = 0.5;
    this.parked = false;     // стоит у бордюра без водителя (traffic.js)
    this.health = this.spec.hp ?? (this.spec.height > 1.8 ? 160 : 110);
    this.livery = police ? null : { ...this.spec.livery, ...livery };
    this.wrecked = false;    // взорвалась и выгорела
    this.burn = 0;           // > 0 — горит (с), потом до -25 — тлеет
    this.air = null;         // в полёте: { vy, roll, rollSpeed }
    this.carried = false;
    this.color = color;
    this.circles = this.circleOffsets.map(() => ({ x: 0, z: 0 }));
    this._pitch = 0;
    this._roll = 0;
    this._prevForward = 0;
    this._buildModel(police ? 0xf4f4f2 : this.spec.taxi ? 0xf2c230 : color);
    this._bouncePhase = Math.random() * 6;
    if (police) this._addPoliceKit();
    this.team = null;        // сторона в режиме «Война стран» (страна), null — гражданская машина
    this.turret = this.spec.turret ? new Turret(this, this.spec.turret) : null;
    game.scene.add(this.root);
    this.updateCircles();
    this._syncVisual(0);
  }

  get speed() {
    return this.forwardSpeed;
  }

  _buildModel(color) {
    const S = { ...commonAssets(), ...buildTypeAssets(this.type) };
    const env = this.game.envMap ?? null;
    if (env && !S.glassMat.envMap) S.glassMat.envMap = env;
    const T = this.spec;
    const P = T.paint ?? {};
    this.paintMat = new THREE.MeshStandardMaterial({ color, metalness: P.metalness ?? 0.45, roughness: P.roughness ?? 0.32, envMap: env });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff1a1a, emissiveIntensity: 0.35 });
    const L = this.livery;

    this.root = new THREE.Group();
    this.root.name = 'vehicle';
    this.body = new THREE.Group();   // наклоняется при разгоне/поворотах, колёса — нет
    this.body.position.y = -T.lowered;
    this.root.add(this.body);

    const add = (geo, mat, parent, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      parent.add(m);
      return m;
    };
    add(S.paint, this.paintMat, this.body);
    if (S.roof) {
      // Крыша другого цвета (двухцветная покраска).
      if (L?.roof != null) {
        this.roofMat = new THREE.MeshStandardMaterial({ color: L.roof, metalness: 0.45, roughness: 0.32, envMap: env });
        add(S.roof, this.roofMat, this.body);
      } else add(S.roof, this.paintMat, this.body);
    }
    // Мелкие детали (салон, бамперы, фары) вдали не видны — их прячет setDetail(false).
    this.detailMeshes = [add(S.trim, S.trimMat, this.body)];
    if (S.headlights) this.detailMeshes.push(add(S.headlights, S.headMat, this.body, false));
    if (S.taillights) this.detailMeshes.push(add(S.taillights, this.tailMat, this.body, false));
    if (S.stripe && L?.stripe != null) {
      this.stripeMat = new THREE.MeshStandardMaterial({ color: L.stripe, metalness: 0.3, roughness: 0.4 });
      add(S.stripe, this.stripeMat, this.body, false);
    }
    if (S.glass) add(S.glass, S.glassMat, this.body, false);
    this.detail = true;

    // Подсветка днища: светящийся прямоугольник под машиной (рисуется поверх земли без освещения).
    if (L?.neon != null) {
      const len = T.zf - T.zr;
      this.neonMat = new THREE.MeshBasicMaterial({
        color: L.neon, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(T.width + 1.5, len + 1.1).rotateX(-Math.PI / 2), this.neonMat);
      glow.position.y = 0.045;
      glow.renderOrder = 2;
      this.root.add(glow);
      this.neonMesh = glow;
    }

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

    const R = CONFIG.vehicle.wheelRadius * T.wheelScale;
    const halfBase = T.wheelBase / 2;
    this.wheels = [];
    // Оси: по умолчанию две; у БТР — четыре (передние две рулят); у танка и вертолёта колёс нет.
    const axles = T.noWheels ? [] : T.axles ?? [halfBase, -halfBase];
    const wheelSpots = [];
    for (const z of axles) wheelSpots.push([T.track, z, z > 0], [-T.track, z, z > 0]);
    for (const [x, z, front] of wheelSpots) {
      const pivot = new THREE.Group();   // поворот руля (Y)
      pivot.position.set(x, R, z);
      const spinner = add(S.wheel, S.wheelMat, pivot); // вращение (X)
      spinner.scale.setScalar(T.wheelScale);
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

  // Ночью (daynight.js): краска меньше отражает дневное небо, у едущих машин горят фары — светлое пятно на асфальте.
  setNight(n) {
    const k = 1 - n * 0.75;
    this.paintMat.envMapIntensity = k;
    if (this.roofMat) this.roofMat.envMapIntensity = k;
    const lit = n > 0.25 && !!this.driver && !this.wrecked && !this.removed;
    if (lit && !this.beam && NIGHT.beamTex) {
      BEAM_MAT ??= new THREE.MeshBasicMaterial({
        map: NIGHT.beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
      BEAM_GEO ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      this.beam = new THREE.Mesh(BEAM_GEO, BEAM_MAT);
      this.beam.scale.set(this.spec.width * 2.5, 1, 12);
      this.beam.position.set(0, 0.2 - this.position.y * 0, this.spec.zf + 5.6);
      this.beam.renderOrder = 2;
      this.root.add(this.beam);
    }
    if (this.beam) {
      this.beam.visible = lit;
      BEAM_MAT.opacity = 0.7 * n;
    }
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
    this.roofMat?.dispose();
    this.stripeMat?.dispose();
    if (this.neonMesh) { this.neonMesh.geometry.dispose(); this.neonMat.dispose(); }
    this.sirenRed?.dispose();
    this.sirenBlue?.dispose();
    this.turret?.dispose();
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
    const side = this.box.x1 + 0.8, end = Math.max(this.box.z1, -this.box.z0) + 1.2;
    const candidates = [[side, dz], [-side, dz], [0, -end], [0, end]].map(([lx, lz]) => this.localToWorld2D(lx, lz));
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

  // Подбросить: к скорости добавляется (vx, vz), вверх vy, вращение spin (рад/с) вокруг продольной оси.
  launch(vx, vy, vz, spin = 0) {
    this.velocity.x += vx;
    this.velocity.z += vz;
    if (vy <= 0.5 && !this.air) return;
    this.air ??= { vy: 0, roll: this._roll, rollSpeed: 0 };
    this.air.vy += vy;
    this.air.rollSpeed += spin;
  }

  // Урон машине; by — кто виноват (для взрыва).
  damage(amount, by = null) {
    if (this.wrecked || amount <= 0) return;
    this.health -= amount;
    if (this.health <= 0) this.explode(by);
  }

  // Взрыв: огонь, ударная волна, люди внутри погибают, машина выгорает и подлетает.
  explode(by = null) {
    if (this.wrecked) return;
    const { game } = this;
    this.wrecked = true;
    this.health = 0;
    const p = this.position.clone();
    p.y += 1;
    game.effects.explosion(p, 1);
    game.audio.explosion?.(p);
    const occupants = [this.driver, ...this.passengers].filter(Boolean);
    for (const o of occupants) {
      if (o === game.player) {
        o.exitVehicle();
        o.takeDamage(70, by, 0, 0, 'blast');
      } else {
        o.exitVehicle();
        o.takeDamage(999, by, 0, 0, 'blast');
      }
    }
    this.ai = null;
    this.sirenOn = false;
    this.paintMat.color.set(0x1d1b19);
    this.roofMat?.color.set(0x1d1b19);
    this.stripeMat?.color.set(0x2a2725);
    if (this.neonMesh) this.neonMesh.visible = false;
    this.paintMat.metalness = 0.1;
    this.paintMat.roughness = 0.9;
    this.tailMat.emissiveIntensity = 0;
    this.burn = 12;
    game.chaos?.blast(this.position, 7, 90, 15, by, { ignore: this });
    this.launch(0, 7, 0, (Math.random() - 0.5) * 3);
    game.events.emit('vehicle:exploded', { vehicle: this, by });
  }

  update(dt) {
    if (this.carried) {
      this._syncVisual(0);
      return;
    }
    // Дым и огонь (повреждена / горит) — только рядом с игроком.
    // Горит (burn > 0) → тлеет и дымит ещё 25 с → остаётся остов; повреждённая — серый дымок из-под капота.
    if (this.burn > 0) this.burn -= dt;
    else if (this.wrecked && this.burn > -25) this.burn -= dt;
    if ((this.health < 35 || this.wrecked) && this.burn > -25 && this.position.distanceToSquared(this.game.player.position) < 110 * 110) {
      const fx = this.game.effects;
      const hood = this.localToWorld2D((Math.random() - 0.5) * 0.9, this.wrecked ? (Math.random() - 0.3) * 2.4 : 1.6);
      const at = { x: hood.x, y: this.position.y + 1.05, z: hood.z };
      const drift = { x: (Math.random() - 0.5) * 0.6, y: 0.6, z: (Math.random() - 0.5) * 0.6 };
      if (this.burn > 0) {
        const k = Math.min(1, this.burn / 6) * 0.4 + 0.6; // к концу пожар слабеет
        if (Math.random() < dt * 12) fx.puff('fire', at, drift, (0.8 + Math.random() * 0.4) * k);
        if (Math.random() < dt * 5) fx.puff('smoke', { x: at.x, y: at.y + 1.4, z: at.z }, drift, k);
        if (Math.random() < dt * 6) fx.burst(at, { x: 0, y: 0.8, z: 0 }, 'fire', 2);
      } else if (this.wrecked) {
        if (Math.random() < dt * 1.6) fx.puff('smoke', at, drift, 0.5 + Math.max(0, 25 + this.burn) * 0.01);
      } else if (Math.random() < dt * (this.health < 15 ? 5 : 2.5)) {
        fx.puff('haze', at, drift, this.health < 15 ? 1 : 0.7);
        if (this.health < 15 && Math.random() < 0.3) fx.puff('fire', at, drift, 0.35);
      }
    }
    if (this.air) {
      this._updateAir(dt);
      return;
    }
    if (this.wrecked) {
      // Выгоревшая машина — просто скатывается и стоит.
      this.velocity.multiplyScalar(Math.exp(-3 * dt));
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this._collideWorld();
      this.forwardSpeed = 0;
      this._syncVisual(dt);
      return;
    }
    this._drive(dt);
  }

  // Колёсная/гусеничная езда (вертолёт переопределяет: helicopter.js).
  _drive(dt) {
    const V = CONFIG.vehicle;
    const T = this.spec;
    const { throttle, steer: steerInput, handbrake } = this._readControls(dt);
    this.turret?.update(dt);
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
    this.yawRate = (vf / T.wheelBase) * Math.tan(this.steer) * (handbrake ? 1.35 : 1);
    if (T.pivot) {
      // Гусеничная машина: поворачивает на месте; чем быстрее едет, тем плавнее.
      this.yawRate = steerInput * T.pivot / (1 + Math.abs(vf) * 0.08);
      this.steer = 0;
    }
    this.spin *= Math.exp(-5 * dt);
    this.heading += (this.yawRate + this.spin) * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this._collideWorld();

    const ground = this.game.world.getGroundHeight(this.position.x, this.position.z);
    this.position.y = damp(this.position.y, ground, 14, dt);

    this._syncVisual(dt);
  }

  // Полёт после удара/взрыва: баллистика, кувырок, удар о землю.
  _updateAir(dt) {
    const a = this.air;
    const g = CONFIG.physics.gravity;
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    a.vy -= g * dt;
    this.position.y += a.vy * dt;
    a.roll += a.rollSpeed * dt;
    this.spin *= Math.exp(-1 * dt);
    this.heading += this.spin * dt;
    this._collideWorld();
    const ground = this.game.world.getGroundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground && a.vy < 0) {
      const impact = -a.vy;
      this.position.y = ground;
      this.air = null;
      // Кувырок заканчивается на колёсах (упрощение), скорость гасится.
      this._roll = 0;
      this.velocity.multiplyScalar(0.55);
      this.forwardSpeed = this.velocity.x * Math.sin(this.heading) + this.velocity.z * Math.cos(this.heading);
      if (impact > 6) {
        const p = this.position.clone();
        this.game.effects.burst(p, { x: 0, y: 1, z: 0 }, 'dust', Math.min(30, impact * 2));
        this.game.effects.burst(p, { x: 0, y: 1, z: 0 }, 'debris', Math.min(16, impact));
        this.damage((impact - 6) * 4, this.thrownBy);
        if (impact > 9) this.game.chaos?.blast(p, 3.5, impact * 2, impact * 0.7, this.thrownBy ?? null, { ignore: this });
        this.game.audio.slam?.(p, Math.min(1, impact / 20));
      }
      this.thrownBy = null;
    }
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    this.body.rotation.set(0, 0, a.roll);
    this.updateCircles();
  }

  _collideWorld() {
    const world = this.game.world;
    for (const off of this.circleOffsets) {
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const px = fx * off, pz = fz * off;
      const c = { x: this.position.x + px, z: this.position.z + pz };
      const bx = c.x, bz = c.z;
      if (this.spec.heavy && Math.abs(this.forwardSpeed) > 0.4) this._crush(c, fx, fz);   // танк давит фонари и деревья
      if (!world.resolveCircle(c, this.radius, _hit)) continue;
      this.position.x += c.x - bx;
      this.position.z += c.z - bz;
      this.applyImpact(_hit.nx, _hit.nz, px, pz, null);
    }
    this.updateCircles();
  }

  // Танк ломает фонари и деревья на пути (они падают, как от удара Колосса).
  _crush(c, fx, fz) {
    const world = this.game.world;
    const r = this.radius + 0.25;
    for (const b of [...world.colliders.query(c.x - r, c.z - r, c.x + r, c.z + r)]) {
      if (b.type === 'lamp') {
        const lamp = world.lamps.find((l) => l.collider === b);
        if (lamp) this.game.chaos?.breakLamp(lamp, fx * this.forwardSpeed, fz * this.forwardSpeed);
      } else if (b.type === 'tree') {
        world.breakTrees((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, 0.8, fx, fz);
      }
    }
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
    if (j > 9) this.damage((j - 9) * 3, this.driver);
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
      this.wheelSpin += (this.forwardSpeed * dt) / this.wheelRadius;
    }
    this.body.rotation.set(this._pitch, 0, this._roll);
    if (this.spec.bounce) {
      // Лоурайдер: на гидравлике подпрыгивает, когда стоит с водителем.
      const t = performance.now() / 1000 + this._bouncePhase;
      const hop = this.driver && Math.abs(this.forwardSpeed) < 1.5 && !this.wrecked ? Math.max(0, Math.sin(t * 3.4)) ** 2 * 0.2 : 0;
      this.body.position.y = damp(this.body.position.y, -this.spec.lowered + hop, 18, Math.max(dt, 0.016));
    }
    for (const w of this.wheels) {
      w.pivot.rotation.y = w.front ? this.steer : 0;
      w.spinner.rotation.x = this.wheelSpin;
    }
    this.tailMat.emissiveIntensity = this.braking ? 2.5 : 0.35 + NIGHT.level * 0.9;
    if (this.police) {
      const phase = this.sirenOn ? Math.floor(performance.now() / 160) % 2 : -1;
      this.sirenRed.emissiveIntensity = phase === 0 ? 3 : 0.2;
      this.sirenBlue.emissiveIntensity = phase === 1 ? 3 : 0.2;
    }
  }
}
