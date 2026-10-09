import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createWeaponModel } from './weapons.js';
import { JOINT_NAMES } from './ragdoll.js';
import { clamp, damp } from './utils.js';
import { buildHumanGeometries, lookKey, bodyDims, DEFAULT_LOOK, HIP_Y, SPINE_Y, SHOULDER_Y } from './wardrobe.js';

// Mid-poly человек из примитивов (капсула-торс, сфера-голова, цилиндры-конечности)
// с процедурной анимацией без скелета: суставы — это вложенные THREE.Group.
// Используется игроком и всеми NPC (прохожие, бойцы, бандиты, полиция). Модель смотрит в +Z,
// левая рука — в +X. Одежда, причёски, аксессуары и телосложение описываются look
// (см. wardrobe.js), там же строится вся геометрия.
//
// Иерархия (в скобках — меш, приклеенный к суставу):
//   root (позиция, поворот heading)
//   └ body (наклон при падении, покачивание)        [таз]
//     ├ hipL/hipR (бедро + шар тазобедренного сустава)
//     │  └ kneeL/kneeR (голень + колено) └ ankleL/ankleR (стопа)
//     └ spine (торс + плечевой пояс + шея + голова + лицо + волосы + головной убор)
//        └ shoulderL/shoulderR (плечо + рукав) └ elbowL/elbowR (локоть + предплечье + кисть)
//
// Все детали одного сустава склеены в один меш с vertex colors: 12 мешей на человека,
// один общий материал. Геометрии кэшируются по внешности (одинаково одетые NPC делят
// геометрию); когда последний владелец уходит, набор остаётся в кэше "на всякий случай"
// (UNUSED_KEEP штук), остальные освобождаются — иначе при смене прохожих память растёт.

export { HIP_Y, DEFAULT_LOOK };

const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
const GEOMETRY_CACHE = new Map();   // key -> { set, refs }
const UNUSED_KEEP = 48;

function acquireGeometries(L) {
  const key = lookKey(L);
  let e = GEOMETRY_CACHE.get(key);
  if (!e) {
    e = { key, set: buildHumanGeometries(L), refs: 0 };
    GEOMETRY_CACHE.set(key, e);
  } else {
    GEOMETRY_CACHE.delete(key);   // освежить порядок (LRU)
    GEOMETRY_CACHE.set(key, e);
  }
  e.refs++;
  return e;
}

function releaseGeometries(e) {
  if (--e.refs > 0) return;
  let unused = 0;
  for (const x of GEOMETRY_CACHE.values()) if (x.refs <= 0) unused++;
  for (const x of GEOMETRY_CACHE.values()) {
    if (unused <= UNUSED_KEEP) break;
    if (x.refs > 0) continue;
    for (const g of Object.values(x.set)) g.dispose();
    GEOMETRY_CACHE.delete(x.key);
    unused--;
  }
}

// Суставы, которые анимируются (значения — углы в радианах, bodyY — метры).
const JOINTS = [
  'hipLx', 'hipRx', 'hipLz', 'hipRz', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
  'shoulderLx', 'shoulderRx', 'shoulderLz', 'shoulderRz', 'elbowL', 'elbowR', 'spineX', 'spineY', 'bodyY',
];

const DOWN = new THREE.Vector3(0, -1, 0);
// Точки хвата оружия (X — влево, Y — вверх, Z — вперёд по стволу, от груди).
const CHEST = new THREE.Vector3(0, 0.46, 0);
const GRIPS = {
  pistolAim: { right: [-0.05, -0.02, 0.5], left: [-0.02, -0.06, 0.46] },
  rifleAim: { right: [-0.1, -0.02, 0.24], left: [-0.07, -0.06, 0.5] },
  rifleCarry: { right: [-0.12, -0.08, 0.24], left: [-0.05, -0.1, 0.48] },
};
const _aimF = new THREE.Vector3(), _aimU = new THREE.Vector3(), _tR = new THREE.Vector3(), _tL = new THREE.Vector3();
const _s = new THREE.Vector3(), _d = new THREE.Vector3(), _pole = new THREE.Vector3(), _u = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _gx = new THREE.Vector3(), _gy = new THREE.Vector3(), _gz = new THREE.Vector3();
const _qGun = new THREE.Quaternion(), _qArm = new THREE.Quaternion();
const _up = new THREE.Vector3(), _left = new THREE.Vector3(), _fwd = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = { body: new THREE.Quaternion(), spine: new THREE.Quaternion(), upper: new THREE.Quaternion(), lower: new THREE.Quaternion() };

export class Humanoid {
  constructor(look = {}) {
    const L = { ...DEFAULT_LOOK, ...look };
    this.look = L;
    this._geo = acquireGeometries(L);
    const G = this._geo.set;
    const D = bodyDims(L);

    const mesh = (geo, parent) => {
      const m = new THREE.Mesh(geo, MATERIAL);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const group = (parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    this.root = new THREE.Group();
    this.root.scale.setScalar(L.scale);
    this.body = group(this.root);
    mesh(G.pelvis, this.body);

    // Ноги
    this.hipL = group(this.body, D.hipX, HIP_Y, 0);
    this.hipR = group(this.body, -D.hipX, HIP_Y, 0);
    for (const [hip, side] of [[this.hipL, 'L'], [this.hipR, 'R']]) {
      mesh(G.thigh, hip);
      const knee = group(hip, 0, -0.44, 0);
      mesh(G.shin, knee);
      const ankle = group(knee, 0, -0.42, 0);
      mesh(G.foot, ankle);
      this['knee' + side] = knee;
      this['ankle' + side] = ankle;
    }

    // Корпус и руки
    this.spine = group(this.body, 0, SPINE_Y, 0);
    mesh(G.spine, this.spine);
    this.shoulderL = group(this.spine, D.shoulderX, SHOULDER_Y, 0);
    this.shoulderR = group(this.spine, -D.shoulderX, SHOULDER_Y, 0);
    for (const [shoulder, side] of [[this.shoulderL, 'L'], [this.shoulderR, 'R']]) {
      mesh(G['upperArm' + side], shoulder);
      const elbow = group(shoulder, 0, -0.3, 0);
      mesh(G['foreArm' + side], elbow);
      this['elbow' + side] = elbow;
    }

    this.phase = 0;
    this.time = Math.random() * 10;
    this.moveBlend = 0;
    this.j = Object.fromEntries(JOINTS.map((k) => [k, 0]));
    this.t = Object.fromEntries(JOINTS.map((k) => [k, 0]));
    this.weaponType = null;
    this.weaponMesh = null;
    this.ragdoll = null;
    this._joints = Object.fromEntries(JOINT_NAMES.map((n) => [n, new THREE.Vector3()]));
  }

  // Освободить геометрию (NPC убран из мира). Модель после этого использовать нельзя.
  dispose() {
    if (!this._geo) return;
    this.weaponMesh?.removeFromParent();
    this.root.removeFromParent();
    releaseGeometries(this._geo);
    this._geo = null;
  }

  // --- Оружие в руке ---------------------------------------------------------

  setWeapon(type) {
    const want = type && type !== 'fists' ? type : null;
    if (want === this.weaponType && (this.weaponMesh || !want)) return;
    this.weaponMesh?.removeFromParent();
    this.weaponMesh = null;
    this.weaponType = want;
    if (!want || this.ragdoll) return;
    const m = createWeaponModel(want);
    m.position.set(0, -0.3, 0.015); // в ладони; ствол — вдоль предплечья
    m.rotation.x = Math.PI / 2;
    this.elbowR.add(m);
    this.weaponMesh = m;
  }

  // Мировая точка дульного среза (или кисти, если оружия нет).
  muzzleWorld(out) {
    if (!this.weaponMesh) {
      this.root.updateMatrixWorld(true);
      return this.elbowR.localToWorld(out.set(0, -0.3, 0));
    }
    this.weaponMesh.updateWorldMatrix(true, false);
    return this.weaponMesh.localToWorld(out.copy(this.weaponMesh.userData.muzzle));
  }

  // --- Суставы в мировых координатах (попадания пуль, старт рэгдолла) ------------

  getJoints() {
    if (this.ragdoll) return this.ragdoll.points;
    const J = this._joints;
    this.root.updateMatrixWorld(true);
    this.body.localToWorld(J.pelvis.set(0, HIP_Y, 0));
    this.spine.localToWorld(J.chest.set(0, SHOULDER_Y - 0.02, 0));
    this.spine.localToWorld(J.head.set(0, 0.75, 0.01));
    for (const s of ['L', 'R']) {
      J['shoulder' + s].setFromMatrixPosition(this['shoulder' + s].matrixWorld);
      J['elbow' + s].setFromMatrixPosition(this['elbow' + s].matrixWorld);
      this['elbow' + s].localToWorld(J['hand' + s].set(0, -0.3, 0));
      J['hip' + s].setFromMatrixPosition(this['hip' + s].matrixWorld);
      J['knee' + s].setFromMatrixPosition(this['knee' + s].matrixWorld);
      this['ankle' + s].localToWorld(J['foot' + s].set(0, -0.03, 0.05));
    }
    return J;
  }

  // --- Рэгдолл --------------------------------------------------------------

  // Модель переходит под управление физики: root — в начало координат, суставы
  // каждый кадр выставляются по точкам рэгдолла (applyRagdoll).
  startRagdoll(ragdoll) {
    this.ragdoll = ragdoll;
    this.weaponMesh?.removeFromParent();
    this.weaponMesh = null;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.applyRagdoll();
  }

  applyRagdoll() {
    const P = this.ragdoll.points;
    const s = this.root.scale.x;
    const q = _q;
    // Таз: вверх — к груди, влево — линия бёдер.
    _up.subVectors(P.chest, P.pelvis).normalize();
    _left.subVectors(P.hipL, P.hipR);
    _left.addScaledVector(_up, -_left.dot(_up)).normalize();
    _fwd.crossVectors(_left, _up);
    q.body.setFromRotationMatrix(_m.makeBasis(_left, _up, _fwd));
    this.body.quaternion.copy(q.body);
    _tmp.set(0, HIP_Y, 0).applyQuaternion(q.body);
    this.body.position.copy(P.pelvis).multiplyScalar(1 / s).sub(_tmp);
    // Корпус: разворот по линии плеч.
    _left.subVectors(P.shoulderL, P.shoulderR);
    _left.addScaledVector(_up, -_left.dot(_up)).normalize();
    _fwd.crossVectors(_left, _up);
    q.spine.setFromRotationMatrix(_m.makeBasis(_left, _up, _fwd));
    this.spine.quaternion.copy(q.body).invert().multiply(q.spine);
    // Конечности: кость модели смотрит вниз (-Y), поворачиваем её на направление между точками.
    const limb = (group, parentWorld, from, to, outWorld) => {
      _tmp.subVectors(to, from).normalize();
      outWorld.setFromUnitVectors(DOWN, _tmp);
      group.quaternion.copy(parentWorld).invert().multiply(outWorld);
    };
    for (const side of ['L', 'R']) {
      limb(this['shoulder' + side], q.spine, P['shoulder' + side], P['elbow' + side], q.upper);
      limb(this['elbow' + side], q.upper, P['elbow' + side], P['hand' + side], q.lower);
      limb(this['hip' + side], q.body, P['hip' + side], P['knee' + side], q.upper);
      limb(this['knee' + side], q.upper, P['knee' + side], P['foot' + side], q.lower);
      this['ankle' + side].quaternion.identity();
    }
  }

  // Вернуть обычную позу (после возрождения).
  resetPose() {
    this.ragdoll = null;
    this.body.position.set(0, 0, 0);
    for (const g of [this.body, this.spine, this.shoulderL, this.shoulderR, this.elbowL, this.elbowR,
      this.hipL, this.hipR, this.kneeL, this.kneeR, this.ankleL, this.ankleR]) g.quaternion.identity();
    for (const k of JOINTS) this.j[k] = 0;
    this.moveBlend = 0;
    const type = this.weaponType;
    this.weaponType = null;
    this.setWeapon(type);
  }

  // state: {
  //   speed      — горизонтальная скорость, м/с (для цикла шага)
  //   airborne   — в прыжке/падении
  //   pose       — 'normal' | 'sit' | 'stumble' | 'down' | 'fly' (полёт: ноги вместе, руки назад)
  //   lean       — наклон корпуса вперёд, рад (полёт)
  //   fall       — 0..1, насколько тело лежит (для 'down')
  //   sitHeight  — высота бедра над root в позе 'sit'
  //   guard      — кулаки подняты (режим драки)
  //   attack     — 0..1, фаза удара (0 — нет удара)
  //   attackSide — 1: правой рукой, -1: левой
  //   aim        — null или наклон прицела вниз (рад): руки с оружием вытянуты к цели
  //   reload     — 0..1, фаза перезарядки (0 — нет)
  //   kick       — 0..1, отдача после выстрела
  //   gesture    — null | 'talk' (жестикулирует) | 'phone' (говорит по телефону) |
  //                'hands' (руки вверх) | 'wave' (машет) | 'cheer' (руки вверх, радуется)
  // }
  animate(dt, state) {
    const {
      speed = 0, airborne = false, pose = 'normal', fall = 0, sitHeight = 0.5,
      guard = false, attack = 0, attackSide = 1, aim = null, reload = 0, kick = 0, gesture = null, lean = 0,
    } = state;
    const t = this.t;
    this.time += dt;

    // --- Базовая локомоция (шаг/бег/стойка) ---
    const moving = clamp(speed / 1.2, 0, 1);
    this.moveBlend = damp(this.moveBlend, pose === 'normal' ? moving : 0, 10, dt);
    const mb = this.moveBlend;
    const run = clamp((speed - 2.5) / 4, 0, 1);
    const cycleLength = 1.3 + speed * 0.24; // метров на полный цикл (два шага)
    this.phase += (dt * speed / cycleLength) * Math.PI * 2;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const swing = (0.45 + 0.35 * run) * mb;
    const breathe = Math.sin(this.time * 1.8) * 0.02 * (1 - mb);

    t.hipLx = -s * swing;
    t.hipRx = s * swing;
    t.hipLz = 0;
    t.hipRz = 0;
    t.kneeL = 0.05 + Math.max(0, c) * (0.55 + 0.9 * run) * mb;
    t.kneeR = 0.05 + Math.max(0, -c) * (0.55 + 0.9 * run) * mb;
    t.ankleL = -t.hipLx * 0.3 - t.kneeL * 0.4;
    t.ankleR = -t.hipRx * 0.3 - t.kneeR * 0.4;
    t.shoulderLx = s * (0.35 + 0.45 * run) * mb + breathe;
    t.shoulderRx = -s * (0.35 + 0.45 * run) * mb + breathe;
    t.shoulderLz = 0.07;
    t.shoulderRz = -0.07;
    t.elbowL = -(0.15 + 1.0 * run * mb);
    t.elbowR = -(0.15 + 1.0 * run * mb);
    t.spineX = 0.03 + 0.2 * run * mb;
    t.spineY = 0;
    t.bodyY = -Math.abs(s) * (0.03 + 0.05 * run) * mb;

    // Стойка для драки: кулаки у лица, ноги работают как обычно.
    if ((guard || attack > 0) && pose === 'normal' && !airborne) {
      t.shoulderLx = t.shoulderRx = -0.95;
      t.shoulderLz = 0.3; t.shoulderRz = -0.3;
      t.elbowL = t.elbowR = -1.9;
      t.spineX = 0.12;
      if (attack > 0) {
        // Прямой удар: плечо вперёд, локоть разгибается, корпус доворачивается.
        const ext = Math.sin(clamp(attack, 0, 1) * Math.PI);
        const R = attackSide > 0;
        const sx = -0.95 - 0.65 * ext, el = -1.9 + 1.8 * ext, sz = 0.3 - 0.25 * ext;
        if (R) { t.shoulderRx = sx; t.elbowR = el; t.shoulderRz = -sz; }
        else { t.shoulderLx = sx; t.elbowL = el; t.shoulderLz = sz; }
        t.spineY = 0.35 * ext * attackSide;
        t.spineX = 0.12 + 0.1 * ext;
      }
    }

    // --- Жесты (только верх тела, когда руки свободны) ---
    if (gesture && pose === 'normal' && !airborne && attack <= 0 && aim === null && !guard) {
      const g = this.time;
      if (gesture === 'talk') {
        // Объясняет что-то руками: предплечья вперёд, кисти ходят вверх-вниз.
        t.shoulderRx = -0.55 + Math.sin(g * 3.1) * 0.25; t.shoulderRz = -0.18;
        t.elbowR = -1.25 + Math.sin(g * 4.3) * 0.3;
        t.shoulderLx = -0.35 + Math.sin(g * 2.3 + 1) * 0.2; t.shoulderLz = 0.16;
        t.elbowL = -0.9 + Math.sin(g * 3.7 + 2) * 0.25;
        t.spineY = Math.sin(g * 0.9) * 0.12;
      } else if (gesture === 'phone') {
        // Телефон у уха.
        t.shoulderRx = -0.35; t.shoulderRz = -0.55; t.elbowR = -2.45;
        t.spineY = Math.sin(g * 0.6) * 0.15;
      } else if (gesture === 'hands') {
        t.shoulderLx = t.shoulderRx = -2.7;
        t.shoulderLz = 0.35; t.shoulderRz = -0.35;
        t.elbowL = t.elbowR = -0.5;
      } else if (gesture === 'wave') {
        t.shoulderRx = -2.6; t.shoulderRz = -0.3 + Math.sin(g * 9) * 0.35; t.elbowR = -0.4;
      } else if (gesture === 'cheer') {
        const k = Math.sin(g * 6) * 0.25;
        t.shoulderLx = t.shoulderRx = -2.8 + k;
        t.shoulderLz = 0.45; t.shoulderRz = -0.45;
        t.elbowL = t.elbowR = -0.3;
      } else if (gesture === 'shadow') {
        // Бой с тенью: стойка, пружинящие ноги, серии джебов и крестов.
        const ph = g * 2.4, bounce = Math.sin(g * 4.8);
        const jab = Math.max(0, Math.sin(ph * 2)) ** 2, cross = Math.max(0, Math.sin(ph * 2 + 2.5)) ** 2;
        t.shoulderLx = -0.95 - 0.65 * jab; t.shoulderLz = 0.3 - 0.25 * jab; t.elbowL = -1.9 + 1.8 * jab;
        t.shoulderRx = -0.95 - 0.65 * cross; t.shoulderRz = -0.3 + 0.25 * cross; t.elbowR = -1.9 + 1.8 * cross;
        t.spineY = (cross - jab) * 0.32; t.spineX = 0.14;
        t.hipLx = bounce * 0.16; t.hipRx = -bounce * 0.16; t.kneeL = t.kneeR = 0.2 + Math.abs(bounce) * 0.2;
        t.bodyY = -0.04 - Math.abs(bounce) * 0.03;
      } else if (gesture === 'flex') {
        // Показывает бицепсы.
        const k = Math.sin(g * 5) * 0.04;
        t.shoulderLx = -0.2 + k; t.shoulderRx = -0.2 - k; t.shoulderLz = 1.3; t.shoulderRz = -1.3;
        t.elbowL = t.elbowR = -2.35; t.spineX = -0.05;
      } else if (gesture === 'dance') {
        const b = Math.sin(g * 6.3), s2 = Math.sin(g * 3.15);
        t.shoulderLx = -2.2 + b * 0.6; t.shoulderRx = -2.2 - b * 0.6;
        t.shoulderLz = 0.35; t.shoulderRz = -0.35; t.elbowL = t.elbowR = -0.6;
        t.hipLz = s2 * 0.12; t.hipRz = s2 * 0.12; t.spineY = s2 * 0.3;
        t.kneeL = 0.3 + Math.max(0, b) * 0.4; t.kneeR = 0.3 + Math.max(0, -b) * 0.4;
        t.bodyY = -0.05 - Math.abs(b) * 0.04;
      }
    }

    // --- Оружие: держим, целимся, перезаряжаем (только верх тела) ---
    const armed = !!this.weaponType && pose === 'normal';
    const twoHanded = armed && CONFIG.weapons[this.weaponType].twoHanded;
    if (armed && reload > 0) {
      t.shoulderRx = -0.75; t.shoulderRz = -0.2; t.elbowR = -1.25;
      t.shoulderLx = -0.8 - 0.35 * Math.sin(reload * Math.PI); t.shoulderLz = -0.45; t.elbowL = -1.6;
      t.spineX = 0.08;
    } else if (armed && aim !== null) {
      if (twoHanded) {
        t.shoulderRx = -1.0 + aim; t.shoulderRz = -0.3; t.elbowR = -0.57;
        t.shoulderLx = -1.3 + aim; t.shoulderLz = -0.55; t.elbowL = -0.45;
      } else {
        t.shoulderRx = -Math.PI / 2 + aim; t.shoulderRz = -0.04; t.elbowR = -0.04;
        t.shoulderLx = -Math.PI / 2 + aim + 0.08; t.shoulderLz = -0.55; t.elbowL = -0.35;
      }
      t.shoulderRx -= 0.3 * kick;
      t.spineX = 0.04;
    } else if (twoHanded) {
      t.shoulderRx = -0.5 + t.shoulderRx * 0.2; t.shoulderRz = -0.15; t.elbowR = -1.1;
      t.shoulderLx = -0.7; t.shoulderLz = -0.45; t.elbowL = -1.25;
    } else if (armed) {
      t.shoulderRx *= 0.5;
      t.elbowR = -0.35;
    }

    // --- Позы поверх локомоции ---
    if (airborne && pose === 'normal') {
      t.hipLx = -0.5; t.hipRx = 0.15;
      t.kneeL = 0.6; t.kneeR = 0.9;
      t.shoulderLz = 0.6; t.shoulderRz = -0.6;
      t.shoulderLx = -0.3; t.shoulderRx = -0.3;
      t.bodyY = 0;
    } else if (pose === 'sit') {
      t.hipLx = t.hipRx = -1.45;
      t.hipLz = 0.08; t.hipRz = -0.08;
      t.kneeL = t.kneeR = 1.35;
      t.ankleL = t.ankleR = 0;
      t.shoulderLx = t.shoulderRx = -1.05;
      t.shoulderLz = 0.18; t.shoulderRz = -0.18;
      t.elbowL = t.elbowR = -0.55;
      t.spineX = -0.18;
      t.bodyY = sitHeight - HIP_Y;
    } else if (pose === 'stumble') {
      t.spineX = -0.35;
      t.shoulderLx = t.shoulderRx = -1.3;
      t.shoulderLz = 0.5; t.shoulderRz = -0.5;
      t.elbowL = t.elbowR = -0.8;
      t.hipLx = -0.35; t.hipRx = 0.25;
      t.kneeL = 0.3; t.kneeR = 0.4;
      t.bodyY = -0.03;
    } else if (pose === 'fly') {
      t.hipLx = t.hipRx = 0.12;
      t.hipLz = 0.04; t.hipRz = -0.04;
      t.kneeL = t.kneeR = 0.12;
      t.ankleL = t.ankleR = 0.5;
      if (attack <= 0 && aim === null && gesture !== 'hands') {
        t.shoulderLx = t.shoulderRx = 0.35;
        t.shoulderLz = 0.25; t.shoulderRz = -0.25;
        t.elbowL = t.elbowR = -0.15;
      }
      t.spineX = 0;
      t.bodyY = 0;
    } else if (pose === 'down') {
      const f = clamp(fall, 0, 1);
      t.shoulderLz = 0.1 + 1.2 * f; t.shoulderRz = -0.1 - 1.2 * f;
      t.shoulderLx = t.shoulderRx = -0.3 * f;
      t.elbowL = t.elbowR = -0.3;
      t.hipLz = 0.15 * f; t.hipRz = -0.15 * f;
      t.hipLx = t.hipRx = -0.1 * f;
      t.kneeL = 0.25 * f; t.kneeR = 0.1 * f;
      t.spineX = 0;
      t.bodyY = 0;
    }

    // Плавный переход между позами (удар — быстрее).
    const k = pose === 'down' ? 12 : attack > 0 || (aim !== null && armed) ? 40 : 18;
    for (const key of JOINTS) this.j[key] = damp(this.j[key], t[key], k, dt);
    const j = this.j;

    this.hipL.rotation.set(j.hipLx, 0, j.hipLz);
    this.hipR.rotation.set(j.hipRx, 0, j.hipRz);
    this.kneeL.rotation.x = j.kneeL;
    this.kneeR.rotation.x = j.kneeR;
    this.ankleL.rotation.x = j.ankleL;
    this.ankleR.rotation.x = j.ankleR;
    this.shoulderL.rotation.set(j.shoulderLx, 0, j.shoulderLz);
    this.shoulderR.rotation.set(j.shoulderRx, 0, j.shoulderRz);
    this.elbowL.rotation.x = j.elbowL;
    this.elbowR.rotation.x = j.elbowR;
    this.spine.rotation.set(j.spineX, j.spineY, 0);

    // Падение на спину: body вращается вокруг ступней. Угол не сглаживается —
    // им напрямую управляет NPC через fall (0 — стоит, 1 — лежит).
    if (pose === 'down') {
      const e = 1 - Math.pow(1 - clamp(fall, 0, 1), 2);
      this.body.rotation.x = -Math.PI / 2 * e;
      this.body.position.y = 0.15 * e;
    } else {
      this.body.rotation.x = damp(this.body.rotation.x, lean, 8, dt);
      this.body.position.y = j.bodyY;
    }

    // Оружие: при прицеле руки ставятся на рукоять/цевьё (IK), ствол смотрит по прицелу;
    // двуручное без прицела — "у пояса" стволом вперёд-вниз.
    const grip = armed && reload <= 0 && !airborne
      ? aim !== null ? (twoHanded ? 'rifleAim' : 'pistolAim') : twoHanded ? 'rifleCarry' : null
      : null;
    if (grip) this._holdWeapon(grip, grip === 'rifleCarry' ? 0.75 : aim - 0.12 * kick);
    else this._gunInHand();
  }

  // --- Хват оружия (IK рук) ----------------------------------------------------

  // Цели для кистей в "системе прицела": X — влево, Y — вверх, Z — по стволу; от груди.
  _holdWeapon(mode, pitch) {
    const G = GRIPS[mode];
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    _aimF.set(0, -sp, cp);          // ствол (в системе spine)
    _aimU.set(0, cp, sp);           // "верх" оружия
    const toSpine = (o, out) => out.set(CHEST.x + o[0], CHEST.y, CHEST.z)
      .addScaledVector(_aimU, o[1]).addScaledVector(_aimF, o[2]);
    this._armIK(this.shoulderR, this.elbowR, toSpine(G.right, _tR), -1);
    this._armIK(this.shoulderL, this.elbowL, toSpine(G.left, _tL), 1);
    // Ствол — строго по прицелу, независимо от наклона предплечья.
    if (this.weaponMesh) {
      _gx.crossVectors(_aimU, _aimF);
      _qGun.setFromRotationMatrix(_m.makeBasis(_gx, _aimU, _aimF));
      _qArm.copy(this.shoulderR.quaternion).multiply(this.elbowR.quaternion); // локоть в системе spine
      this.weaponMesh.quaternion.copy(_qArm.invert()).multiply(_qGun);
      this.weaponMesh.position.set(0, -0.3, 0);
    }
  }

  // Оружие вдоль предплечья (опущенная рука, перезарядка, прыжок).
  _gunInHand() {
    if (!this.weaponMesh) return;
    this.weaponMesh.position.set(0, -0.3, 0.015);
    this.weaponMesh.rotation.set(Math.PI / 2, 0, 0);
  }

  // Двухзвенная IK: плечо + предплечье (по 0.3 м) дотягиваются до цели (система spine).
  // side: -1 — правая рука (локоть уходит вправо-вниз), 1 — левая.
  _armIK(shoulder, elbow, target, side) {
    const a = 0.3, b = 0.3;
    _s.copy(shoulder.position);
    _d.subVectors(target, _s);
    const d = clamp(_d.length(), 0.08, a + b - 1e-3);
    _d.normalize();
    // Колено-"полюс": локоть смотрит вниз и чуть наружу.
    _pole.set(side * 0.45, -1, -0.2);
    _pole.addScaledVector(_d, -_pole.dot(_d)).normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    _u.copy(_d).multiplyScalar(cosA).addScaledVector(_pole, sinA).normalize(); // плечевая кость
    _e.copy(_s).addScaledVector(_u, a);                                        // локоть
    _f.subVectors(target, _e).normalize();                                      // предплечье
    // Кость руки — это -Y сустава; сгиб в локте — вокруг его X в сторону +Z.
    _gy.copy(_u).negate();
    _gz.copy(_f).addScaledVector(_u, -_f.dot(_u));
    if (_gz.lengthSq() < 1e-8) _gz.set(0, 0, 1).addScaledVector(_u, -_u.z);
    _gz.normalize();
    _gx.crossVectors(_gy, _gz);
    shoulder.quaternion.setFromRotationMatrix(_m.makeBasis(_gx, _gy, _gz));
    elbow.rotation.set(-Math.acos(clamp(_u.dot(_f), -1, 1)), 0, 0);
  }
}
