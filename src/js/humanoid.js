import * as THREE from 'three';
import { clamp, damp } from './utils.js';

// Mid-poly человек из примитивов (капсула-торс, сфера-голова, цилиндры-конечности)
// с процедурной анимацией без скелета: суставы — это вложенные THREE.Group.
// Используется и игроком, и NPC. Модель смотрит в +Z, левая рука — в +X.
//
// Иерархия:
//   root (позиция, поворот heading)
//   └ body (наклон при падении, покачивание)
//     ├ pelvis, hipL/hipR → kneeL/kneeR → ankleL/ankleR
//     └ spine → torso, head, hair, shoulderL/shoulderR → elbowL/elbowR

export const HIP_Y = 0.92;
const SPINE_Y = 0.94;

let GEO = null;
function geometries() {
  if (GEO) return GEO;
  GEO = {
    pelvis: new THREE.CylinderGeometry(0.165, 0.15, 0.2, 14),
    torso: new THREE.CapsuleGeometry(0.18, 0.28, 6, 14),
    head: new THREE.SphereGeometry(0.12, 18, 14),
    neck: new THREE.CylinderGeometry(0.055, 0.06, 0.14, 10),
    hair: new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    upperArm: new THREE.CylinderGeometry(0.062, 0.052, 0.3, 10).translate(0, -0.15, 0),
    foreArm: new THREE.CylinderGeometry(0.05, 0.04, 0.27, 10).translate(0, -0.135, 0),
    hand: new THREE.SphereGeometry(0.052, 10, 8).translate(0, -0.3, 0),
    thigh: new THREE.CylinderGeometry(0.088, 0.07, 0.44, 12).translate(0, -0.22, 0),
    shin: new THREE.CylinderGeometry(0.066, 0.05, 0.42, 12).translate(0, -0.21, 0),
    foot: new THREE.BoxGeometry(0.11, 0.07, 0.25).translate(0, -0.025, 0.05),
  };
  return GEO;
}

// Материалы кэшируются по цвету: 10 NPC в красных футболках = 1 материал.
const MATERIALS = new Map();
function material(color) {
  const key = new THREE.Color(color).getHexString();
  if (!MATERIALS.has(key)) MATERIALS.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78 }));
  return MATERIALS.get(key);
}

export const DEFAULT_LOOK = {
  skin: '#c89373',
  hair: '#1d1a17',
  shirt: '#f2f2f0',
  pants: '#34507e',
  shoes: '#1c1c1c',
  scale: 1,
};

// Суставы, которые анимируются (значения — углы в радианах, bodyY — метры).
const JOINTS = [
  'hipLx', 'hipRx', 'hipLz', 'hipRz', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
  'shoulderLx', 'shoulderRx', 'shoulderLz', 'shoulderRz', 'elbowL', 'elbowR', 'spineX', 'bodyY',
];

export class Humanoid {
  constructor(look = {}) {
    const L = { ...DEFAULT_LOOK, ...look };
    const G = geometries();
    const skin = material(L.skin), shirt = material(L.shirt), pants = material(L.pants);
    const shoes = material(L.shoes), hair = material(L.hair);

    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
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

    mesh(G.pelvis, pants, this.body, 0, HIP_Y + 0.04, 0);

    // Ноги
    this.hipL = group(this.body, 0.1, HIP_Y, 0);
    this.hipR = group(this.body, -0.1, HIP_Y, 0);
    for (const [hip, side] of [[this.hipL, 'L'], [this.hipR, 'R']]) {
      mesh(G.thigh, pants, hip);
      const knee = group(hip, 0, -0.44, 0);
      mesh(G.shin, pants, knee);
      const ankle = group(knee, 0, -0.42, 0);
      mesh(G.foot, shoes, ankle);
      this['knee' + side] = knee;
      this['ankle' + side] = ankle;
    }

    // Корпус
    this.spine = group(this.body, 0, SPINE_Y, 0);
    const torso = mesh(G.torso, shirt, this.spine, 0, 0.28, 0);
    torso.scale.set(1.05, 1, 0.72);
    mesh(G.neck, skin, this.spine, 0, 0.62, 0);
    const head = mesh(G.head, skin, this.spine, 0, 0.75, 0.01);
    head.scale.set(1, 1.1, 1.02);
    const hairMesh = mesh(G.hair, hair, this.spine, 0, 0.77, -0.012);
    hairMesh.scale.set(1, 1.08, 1.04);

    // Руки
    this.shoulderL = group(this.spine, 0.235, 0.52, 0);
    this.shoulderR = group(this.spine, -0.235, 0.52, 0);
    for (const [shoulder, side] of [[this.shoulderL, 'L'], [this.shoulderR, 'R']]) {
      mesh(G.upperArm, shirt, shoulder);
      const elbow = group(shoulder, 0, -0.3, 0);
      mesh(G.foreArm, skin, elbow);
      mesh(G.hand, skin, elbow);
      this['elbow' + side] = elbow;
    }

    this.phase = 0;
    this.time = Math.random() * 10;
    this.moveBlend = 0;
    this.j = Object.fromEntries(JOINTS.map((k) => [k, 0]));
    this.t = Object.fromEntries(JOINTS.map((k) => [k, 0]));
  }

  // state: {
  //   speed      — горизонтальная скорость, м/с (для цикла шага)
  //   airborne   — в прыжке/падении
  //   pose       — 'normal' | 'sit' | 'stumble' | 'down'
  //   fall       — 0..1, насколько тело лежит (для 'down')
  //   sitHeight  — высота бедра над root в позе 'sit'
  // }
  animate(dt, state) {
    const { speed = 0, airborne = false, pose = 'normal', fall = 0, sitHeight = 0.5 } = state;
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
    t.shoulderLz = 0.1;
    t.shoulderRz = -0.1;
    t.elbowL = -(0.15 + 1.0 * run * mb);
    t.elbowR = -(0.15 + 1.0 * run * mb);
    t.spineX = 0.03 + 0.2 * run * mb;
    t.bodyY = -Math.abs(s) * (0.03 + 0.05 * run) * mb;

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

    // Плавный переход между позами.
    const k = pose === 'down' ? 12 : 18;
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
    this.spine.rotation.x = j.spineX;

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
