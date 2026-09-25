import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeColored } from './geometry.js';
import { createWeaponModel } from './weapons.js';
import { JOINT_NAMES } from './ragdoll.js';
import { clamp, damp } from './utils.js';

// Mid-poly человек из примитивов (капсула-торс, сфера-голова, цилиндры-конечности)
// с процедурной анимацией без скелета: суставы — это вложенные THREE.Group.
// Используется игроком и всеми NPC (прохожие, бандиты, полиция). Модель смотрит в +Z,
// левая рука — в +X.
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
// один общий материал. Геометрии кэшируются по набору цветов (одинаково одетые NPC
// делят геометрию).

export const HIP_Y = 0.92;
const SPINE_Y = 0.94;
const SHOULDER_X = 0.225;
const SHOULDER_Y = 0.52; // относительно spine

export const DEFAULT_LOOK = {
  skin: '#c89373',
  hair: '#1d1a17',
  shirt: '#f2f2f0',
  pants: '#34507e',
  shoes: '#1c1c1c',
  hat: null,        // цвет кепки (полиция) или null
  bandana: null,    // цвет банданы (банды) или null
  scale: 1,
};

const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
const GEOMETRY_CACHE = new Map();

function buildGeometries(L) {
  const key = [L.skin, L.hair, L.shirt, L.pants, L.shoes, L.hat, L.bandana].join('|');
  if (GEOMETRY_CACHE.has(key)) return GEOMETRY_CACHE.get(key);

  const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const sphere = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
  const eye = '#1a1512';

  // Таз (в body).
  const pelvis = mergeColored([
    { geometry: cyl(0.165, 0.15, 0.2, 14).translate(0, HIP_Y + 0.04, 0), color: L.pants },
    { geometry: cyl(0.168, 0.168, 0.05, 14).translate(0, HIP_Y + 0.14, 0), color: '#2a2622' }, // ремень
  ]);

  // Корпус и голова (в spine; y отсчитывается от SPINE_Y).
  const spineParts = [
    { geometry: new THREE.CapsuleGeometry(0.18, 0.28, 6, 14).scale(1.05, 1, 0.72).translate(0, 0.28, 0), color: L.shirt },
    // Плечевой пояс: горизонтальная капсула соединяет торс с плечевыми суставами.
    { geometry: new THREE.CapsuleGeometry(0.085, 0.3, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.85).translate(0, SHOULDER_Y - 0.01, 0), color: L.shirt },
    { geometry: cyl(0.055, 0.06, 0.14, 10).translate(0, 0.62, 0), color: L.skin },
    { geometry: sphere(0.12, 18, 14).scale(1, 1.1, 1.02).translate(0, 0.75, 0.01), color: L.skin },
    // Лицо: глаза и нос — чтобы было видно, куда смотрит человек.
    { geometry: sphere(0.018, 8, 6).translate(0.042, 0.77, 0.118), color: eye },
    { geometry: sphere(0.018, 8, 6).translate(-0.042, 0.77, 0.118), color: eye },
    { geometry: new THREE.BoxGeometry(0.028, 0.045, 0.03).translate(0, 0.738, 0.13), color: L.skin },
    // Уши.
    { geometry: sphere(0.028, 8, 6).scale(0.5, 1, 0.8).translate(0.12, 0.75, 0), color: L.skin },
    { geometry: sphere(0.028, 8, 6).scale(0.5, 1, 0.8).translate(-0.12, 0.75, 0), color: L.skin },
  ];
  if (L.hat) {
    // Кепка: купол + козырёк.
    spineParts.push(
      { geometry: new THREE.SphereGeometry(0.132, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(1, 0.85, 1.04).translate(0, 0.79, 0.005), color: L.hat },
      { geometry: new THREE.BoxGeometry(0.2, 0.02, 0.11).translate(0, 0.795, 0.155), color: L.hat },
    );
  } else {
    // Волосы: сферическая шапка, наклонённая назад (лоб открыт, затылок закрыт).
    spineParts.push({
      geometry: new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(-0.45).scale(1, 1.08, 1.04).translate(0, 0.765, 0.005),
      color: L.hair,
    });
  }
  if (L.bandana) {
    spineParts.push({ geometry: new THREE.TorusGeometry(0.122, 0.018, 6, 20).rotateX(Math.PI / 2).rotateX(-0.25).translate(0, 0.8, 0.005), color: L.bandana });
  }
  const spine = mergeColored(spineParts);

  // Плечо: шар сустава + рукав футболки + голая часть руки.
  const upperArm = mergeColored([
    { geometry: sphere(0.072, 12, 10), color: L.shirt },
    { geometry: cyl(0.068, 0.062, 0.16).translate(0, -0.08, 0), color: L.shirt },
    { geometry: cyl(0.056, 0.05, 0.3).translate(0, -0.15, 0), color: L.skin },
  ]);
  // Предплечье: локоть + предплечье + кисть (приплюснутая сфера) + большой палец.
  const foreArm = mergeColored([
    { geometry: sphere(0.052, 10, 8), color: L.skin },
    { geometry: cyl(0.05, 0.04, 0.27, 10).translate(0, -0.135, 0), color: L.skin },
    { geometry: sphere(0.052, 10, 8).scale(0.85, 1.15, 0.7).translate(0, -0.3, 0.005), color: L.skin },
    { geometry: sphere(0.02, 6, 5).scale(1, 1.6, 1).translate(0, -0.285, 0.04), color: L.skin },
  ]);
  const thigh = mergeColored([
    { geometry: sphere(0.092, 12, 10), color: L.pants },
    { geometry: cyl(0.09, 0.07, 0.44).translate(0, -0.22, 0), color: L.pants },
  ]);
  const shin = mergeColored([
    { geometry: sphere(0.072, 12, 8), color: L.pants },
    { geometry: cyl(0.066, 0.052, 0.42).translate(0, -0.21, 0), color: L.pants },
  ]);
  const foot = mergeColored([
    { geometry: new THREE.BoxGeometry(0.11, 0.07, 0.25).translate(0, -0.025, 0.05), color: L.shoes },
    { geometry: new THREE.BoxGeometry(0.112, 0.02, 0.252).translate(0, -0.05, 0.05), color: '#e9e6df' }, // подошва
  ]);

  const set = { pelvis, spine, upperArm, foreArm, thigh, shin, foot };
  GEOMETRY_CACHE.set(key, set);
  return set;
}

// Суставы, которые анимируются (значения — углы в радианах, bodyY — метры).
const JOINTS = [
  'hipLx', 'hipRx', 'hipLz', 'hipRz', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
  'shoulderLx', 'shoulderRx', 'shoulderLz', 'shoulderRz', 'elbowL', 'elbowR', 'spineX', 'spineY', 'bodyY',
];

const DOWN = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(), _left = new THREE.Vector3(), _fwd = new THREE.Vector3(), _tmp = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = { body: new THREE.Quaternion(), spine: new THREE.Quaternion(), upper: new THREE.Quaternion(), lower: new THREE.Quaternion() };

export class Humanoid {
  constructor(look = {}) {
    const L = { ...DEFAULT_LOOK, ...look };
    this.look = L;
    const G = buildGeometries(L);

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
    this.hipL = group(this.body, 0.1, HIP_Y, 0);
    this.hipR = group(this.body, -0.1, HIP_Y, 0);
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
    this.shoulderL = group(this.spine, SHOULDER_X, SHOULDER_Y, 0);
    this.shoulderR = group(this.spine, -SHOULDER_X, SHOULDER_Y, 0);
    for (const [shoulder, side] of [[this.shoulderL, 'L'], [this.shoulderR, 'R']]) {
      mesh(G.upperArm, shoulder);
      const elbow = group(shoulder, 0, -0.3, 0);
      mesh(G.foreArm, elbow);
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
  //   pose       — 'normal' | 'sit' | 'stumble' | 'down'
  //   fall       — 0..1, насколько тело лежит (для 'down')
  //   sitHeight  — высота бедра над root в позе 'sit'
  //   guard      — кулаки подняты (режим драки)
  //   attack     — 0..1, фаза удара (0 — нет удара)
  //   attackSide — 1: правой рукой, -1: левой
  //   aim        — null или наклон прицела вниз (рад): руки с оружием вытянуты к цели
  //   reload     — 0..1, фаза перезарядки (0 — нет)
  //   kick       — 0..1, отдача после выстрела
  // }
  animate(dt, state) {
    const {
      speed = 0, airborne = false, pose = 'normal', fall = 0, sitHeight = 0.5,
      guard = false, attack = 0, attackSide = 1, aim = null, reload = 0, kick = 0,
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
      this.body.rotation.x = 0;
      this.body.position.y = j.bodyY;
    }
  }
}
