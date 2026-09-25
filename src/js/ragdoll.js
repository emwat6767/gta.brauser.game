import * as THREE from 'three';
import { CONFIG } from './config.js';
import { pushCircleOutOfBox } from './collision.js';

// Рэгдолл — физика тела после смерти (Verlet): 15 точек-суставов, связанных
// "костями" постоянной длины, плюс распорки, держащие форму корпуса, и упоры,
// не дающие коленям/локтям складываться насквозь. Точки сталкиваются с землёй,
// стенами/фонарями/деревьями и машинами (машина сносит тело со своей скоростью).
// Пули добавляют импульс ближайшей точке (impulse()).
//
// Humanoid.applyRagdoll() поворачивает суставы модели так, чтобы кости совпали с точками.

export const JOINT_NAMES = [
  'pelvis', 'chest', 'head',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'hipL', 'kneeL', 'footL', 'hipR', 'kneeR', 'footR',
];

const RADIUS = { pelvis: 0.14, chest: 0.15, head: 0.12 };

// Кости и распорки (длина берётся из начальной позы).
const LINKS = [
  ['pelvis', 'chest'], ['chest', 'head'], ['chest', 'shoulderL'], ['chest', 'shoulderR'], ['shoulderL', 'shoulderR'],
  ['shoulderL', 'elbowL'], ['elbowL', 'handL'], ['shoulderR', 'elbowR'], ['elbowR', 'handR'],
  ['pelvis', 'hipL'], ['pelvis', 'hipR'], ['hipL', 'hipR'],
  ['hipL', 'kneeL'], ['kneeL', 'footL'], ['hipR', 'kneeR'], ['kneeR', 'footR'],
  // жёсткий корпус: плечи и бёдра связаны крест-накрест, голова держится за плечи
  ['shoulderL', 'pelvis'], ['shoulderR', 'pelvis'], ['hipL', 'chest'], ['hipR', 'chest'],
  ['hipL', 'shoulderR'], ['hipR', 'shoulderL'], ['head', 'shoulderL'], ['head', 'shoulderR'],
];

// Минимальные расстояния: сгиб в локте/колене не больше ~150°.
const MIN_LINKS = [
  ['shoulderL', 'handL', 0.2], ['shoulderR', 'handR', 0.2],
  ['hipL', 'footL', 0.32], ['hipR', 'footR', 0.32],
  ['head', 'pelvis', 0.5],
];

const ITERATIONS = 8;
const MAX_SPEED = 12; // м/с — предел скорости точки после толчка
const _tmpHit = { nx: 0, nz: 0, depth: 0 };
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Ragdoll {
  // joints — мировые позиции суставов (Humanoid.getJoints()), velocity — начальная скорость тела.
  constructor(game, joints, velocity) {
    this.game = game;
    this.points = {};
    this.prev = {};
    this.list = [];
    const dt = CONFIG.physics.fixedStep;
    for (const name of JOINT_NAMES) {
      const p = joints[name].clone();
      const prev = p.clone().addScaledVector(velocity, -dt);
      this.points[name] = p;
      this.prev[name] = prev;
      this.list.push({ name, p, prev, r: RADIUS[name] ?? 0.06, grounded: false });
    }
    this.links = LINKS.map(([a, b]) => ({ a: this.points[a], b: this.points[b], len: this.points[a].distanceTo(this.points[b]) }));
    this.minLinks = MIN_LINKS.map(([a, b, k]) => ({ a: this.points[a], b: this.points[b], min: k }));
    this.quietTime = 0;
    this.sleeping = false;
  }

  get pelvis() {
    return this.points.pelvis;
  }

  // Толчок (пуля, удар) в точке point вдоль dir со скоростью strength (м/с).
  impulse(point, dir, strength) {
    let best = null, bestD = Infinity;
    for (const j of this.list) {
      const d = j.p.distanceToSquared(point);
      if (d < bestD) { bestD = d; best = j; }
    }
    if (!best) return;
    const dt = CONFIG.physics.fixedStep;
    best.prev.addScaledVector(dir, -strength * dt);
    // соседям — половина, чтобы тело не рвало на части
    for (const j of this.list) {
      if (j !== best && j.p.distanceToSquared(best.p) < 0.25) j.prev.addScaledVector(dir, -strength * 0.5 * dt);
    }
    // ограничение скорости точек (серия попаданий не должна отправлять тело в полёт)
    const maxStep = MAX_SPEED * dt;
    for (const j of this.list) {
      _v.subVectors(j.p, j.prev);
      const len = _v.length();
      if (len > maxStep) j.prev.copy(j.p).addScaledVector(_v, -maxStep / len);
    }
    this.sleeping = false;
    this.quietTime = 0;
  }

  step(dt) {
    if (this.sleeping) {
      if (this._vehicleNear()) this.sleeping = false;
      else return;
    }
    const g = CONFIG.physics.gravity * dt * dt;
    let motion = 0;
    for (const j of this.list) {
      const { p, prev } = j;
      const friction = j.grounded ? 0.82 : 0.995;
      const vx = (p.x - prev.x) * friction, vy = (p.y - prev.y) * 0.995, vz = (p.z - prev.z) * friction;
      prev.copy(p);
      p.x += vx;
      p.y += vy - g;
      p.z += vz;
      motion += vx * vx + vy * vy + vz * vz;
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (const l of this.links) this._solve(l.a, l.b, l.len);
      for (const l of this.minLinks) {
        const d = l.a.distanceTo(l.b);
        if (d < l.min) this._solve(l.a, l.b, l.min);
      }
      this._kneesForward();
      this._collide();
    }
    // Засыпает, если почти не двигается — экономия для лежащих тел.
    if (motion < 1e-6 * this.list.length) {
      this.quietTime += dt;
      if (this.quietTime > 1.2) this.sleeping = true;
    } else {
      this.quietTime = 0;
    }
  }

  _solve(a, b, len) {
    _v.subVectors(b, a);
    const d = _v.length() || 1e-6;
    const diff = (d - len) / d * 0.5;
    a.addScaledVector(_v, diff);
    b.addScaledVector(_v, -diff);
  }

  // Колени сгибаются только вперёд: если колено ушло назад от линии бедро-стопа — возвращаем.
  _kneesForward() {
    const P = this.points;
    _a.subVectors(P.chest, P.pelvis).normalize();                // вверх по телу
    _b.subVectors(P.hipL, P.hipR).cross(_a).normalize();          // вперёд = влево × вверх
    for (const [hip, knee, foot] of [[P.hipL, P.kneeL, P.footL], [P.hipR, P.kneeR, P.footR]]) {
      _v.addVectors(hip, foot).multiplyScalar(0.5);
      const back = _v.sub(knee).dot(_b); // > 0 — колено позади середины
      if (back > 0) knee.addScaledVector(_b, back * 0.8);
    }
  }

  _collide() {
    const world = this.game.world;
    for (const j of this.list) {
      const p = j.p;
      const ground = world.getGroundHeight(p.x, p.z) + j.r;
      j.grounded = p.y <= ground + 0.02;
      if (p.y < ground) p.y = ground;
      // Стены, фонари, деревья — только если точка ниже верха препятствия.
      const list = world.colliders.query(p.x - j.r, p.z - j.r, p.x + j.r, p.z + j.r);
      for (let i = 0; i < list.length; i++) {
        if (p.y < list[i].height) pushCircleOutOfBox(p, j.r, list[i], _tmpHit);
      }
      const lim = world.half - 0.8;
      p.x = Math.max(-lim, Math.min(lim, p.x));
      p.z = Math.max(-lim, Math.min(lim, p.z));
    }
    this._collideVehicles();
  }

  _vehicleNear() {
    const c = this.points.pelvis;
    return this.game.vehicles.some((v) => Math.abs(v.speed) > 1 && v.position.distanceToSquared(c) < 16);
  }

  // Машина — ориентированная коробка; точку выталкиваем по кратчайшей оси и
  // передаём ей скорость машины (тело сносит).
  _collideVehicles() {
    const c = this.points.pelvis;
    const dt = CONFIG.physics.fixedStep;
    for (const v of this.game.vehicles) {
      if (v.position.distanceToSquared(c) > 16) continue;
      const cos = Math.cos(v.heading), sin = Math.sin(v.heading);
      for (const j of this.list) {
        const p = j.p;
        const rx = p.x - v.position.x, rz = p.z - v.position.z;
        const lx = rx * cos - rz * sin;          // вдоль локальной +X (влево)
        const lz = rx * sin + rz * cos;          // вдоль локальной +Z (вперёд)
        const ly = p.y - v.position.y;
        const hx = 0.95 + j.r, hz = 2.3 + j.r, top = 1.45 + j.r;
        if (Math.abs(lx) > hx || Math.abs(lz) > hz || ly > top || ly < 0) continue;
        const px = hx - Math.abs(lx), pz = hz - Math.abs(lz), py = top - ly;
        let nlx = 0, nlz = 0, ny = 0, depth;
        if (py < px && py < pz) { ny = 1; depth = py; }
        else if (px < pz) { nlx = Math.sign(lx) || 1; depth = px; }
        else { nlz = Math.sign(lz) || 1; depth = pz; }
        // локальная нормаль -> мировая
        const wx = nlx * cos + nlz * sin, wz = -nlx * sin + nlz * cos;
        p.x += wx * depth;
        p.y += ny * depth;
        p.z += wz * depth;
        // скорость машины передаётся телу
        j.prev.x = p.x - v.velocity.x * dt * 1.1;
        j.prev.z = p.z - v.velocity.z * dt * 1.1;
        if (Math.abs(v.speed) > 3) j.prev.y = p.y - Math.min(5, Math.abs(v.speed) * 0.25) * dt;
      }
    }
  }
}
