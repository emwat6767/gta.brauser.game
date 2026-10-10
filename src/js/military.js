import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeColored } from './geometry.js';
import { Gun } from './weapons.js';
import { fireShot, aimPoint, lineOfSight } from './ballistics.js';
import { clamp, wrapAngle } from './utils.js';

// Башни и стволы военной техники (профили машин — military-models.js).
//   Turret крепится к кузову машины (vehicle.body): башня поворачивается по горизонтали (yaw), ствол качается по вертикали (pitch).
//   Игрок за рулём наводит башню куда смотрит перекрестье, стреляет F / ЛКМ (основное орудие) и ПКМ / C (второй ствол);
//   водитель-NPC наводит башню сам на ближайшего противника (game.war.pickTarget) и стреляет очередями.
//   Стреляет от лица водителя: убитые попадают в его счёт, пули и снаряды своих (одной team) не ранят.
// Описание башен (TURRETS): pivot — точка вращения на кузове, guns — стволы: { weapon, input, at: [x, y, z] в системе ствола, mount }.

const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();

let TRIM_MAT = null;
const trimMat = () => (TRIM_MAT ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }));

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cylZ = (r1, r2, len, x, y, z, seg = 10) => new THREE.CylinderGeometry(r2, r1, len, seg).rotateX(Math.PI / 2).translate(x, y, z);
const cylY = (r1, r2, h, x, y, z, seg = 14) => new THREE.CylinderGeometry(r2, r1, h, seg).translate(x, y, z);

// Профиль сбоку [z, y] -> призма шириной width (по X), как у кузова машины.
function sideExtrude(points, width, bevel = 0.04) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, steps: 1, bevelEnabled: !!bevel, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2 });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

const STEEL = 0x30332d, DARK = 0x16181a, BARREL = 0x25282a;

// Каждая башня: yaw — части на вращающемся основании, pitch — части на качающемся стволе (pitchAt — его ось на башне).
const TURRETS = {
  jeep: {
    speed: 3.2, pitch: [-0.2, 1.0], yawLimit: null, range: 150,
    build() {
      return {
        yawPaint: [box(1.0, 0.55, 0.06, 0, 0.62, 0.5)],                                        // щиток
        yawTrim: [
          { geometry: cylY(0.07, 0.07, 0.4, 0, 0.2, 0), color: STEEL },                         // колонна
          { geometry: cylY(0.3, 0.3, 0.06, 0, 0.02, 0), color: DARK },
          { geometry: box(0.5, 0.06, 0.4, 0, 0.42, 0.18), color: STEEL },                        // вилка
        ],
        pitchAt: [0, 0.62, 0.15],
        pitchTrim: [
          { geometry: box(0.14, 0.16, 0.7, 0, 0, 0.1), color: STEEL },                           // ствольная коробка
          { geometry: cylZ(0.035, 0.035, 1.1, 0, 0.02, 0.85), color: BARREL },                    // ствол
          { geometry: cylZ(0.055, 0.055, 0.16, 0, 0.02, 1.4), color: DARK },                     // пламегаситель
          { geometry: box(0.22, 0.22, 0.34, 0.22, -0.04, 0.05), color: 0x3a4328 },               // ящик с лентой
          { geometry: box(0.3, 0.05, 0.05, 0, 0.0, -0.32), color: DARK },                        // рукояти
          { geometry: box(0.03, 0.12, 0.03, 0.12, 0.0, -0.32), color: DARK },
          { geometry: box(0.03, 0.12, 0.03, -0.12, 0.0, -0.32), color: DARK },
        ],
        guns: [{ weapon: 'hmg', input: 'attack', at: [0, 0.02, 1.52] }],
      };
    },
  },
  apc: {
    speed: 1.7, pitch: [-0.08, 0.95], yawLimit: null, range: 170,
    build() {
      return {
        yawPaint: [cylY(0.95, 0.75, 0.55, 0, 0.27, 0, 12), box(1.2, 0.35, 0.3, 0, 0.42, 0.75)],   // башня-конус и маска
        yawTrim: [
          { geometry: cylY(0.28, 0.28, 0.1, -0.35, 0.62, -0.1), color: STEEL },                  // люк командира
          { geometry: box(0.5, 0.18, 0.08, 0, 0.5, 0.95), color: DARK },                           // смотровая щель
          { geometry: cylY(0.025, 0.025, 0.9, 0.6, 0.9, -0.55, 5), color: DARK },                 // антенна
          { geometry: box(0.3, 0.2, 0.3, 0.7, 0.42, 0.1), color: 0x3a4328 },
        ],
        pitchAt: [0, 0.45, 0.85],
        pitchTrim: [
          { geometry: box(0.3, 0.3, 0.5, 0, 0, 0.15), color: STEEL },
          { geometry: cylZ(0.05, 0.05, 1.9, 0, 0.02, 1.2), color: BARREL },                       // КПВТ
          { geometry: cylZ(0.08, 0.08, 0.3, 0, 0.02, 2.05), color: DARK },
          { geometry: cylZ(0.025, 0.025, 0.7, 0.2, -0.06, 0.55), color: BARREL },                 // спаренный ПКТ
        ],
        guns: [{ weapon: 'hmg', input: 'attack', at: [0, 0.02, 2.22] }],
      };
    },
  },
  tank: {
    speed: 1.0, pitch: [-0.12, 0.42], yawLimit: null, range: 260,
    build() {
      return {
        yawPaint: [
          sideExtrude([[-1.75, 0], [1.3, 0], [1.55, 0.22], [1.5, 0.6], [1.0, 0.82], [-0.9, 0.88], [-1.75, 0.7]], 2.3, 0.05),
          box(2.45, 0.1, 1.5, 0, 0.32, -1.5),                                                      // кормовая ниша
        ],
        yawTrim: [
          { geometry: cylY(0.3, 0.3, 0.2, 0.55, 0.95, -0.4), color: STEEL },                      // башенка командира
          { geometry: cylZ(0.025, 0.025, 0.7, 0.55, 1.1, -0.1), color: DARK },                    // зенитный пулемёт (на вид)
          { geometry: cylY(0.26, 0.26, 0.1, -0.6, 0.93, -0.6), color: STEEL },                    // люк заряжающего
          { geometry: box(0.5, 0.3, 0.5, -1.15, 0.3, -1.1), color: DARK },                         // ящики на корме
          { geometry: box(0.5, 0.3, 0.5, 1.15, 0.3, -1.1), color: 0x3a4328 },
          { geometry: cylY(0.02, 0.02, 1.4, -0.9, 1.4, -1.5, 5), color: DARK },                   // антенна
          { geometry: box(0.5, 0.12, 0.9, 0, 0.88, 0.4), color: DARK },                            // оптика
        ],
        pitchAt: [0, 0.45, 1.45],
        pitchTrim: [
          { geometry: box(1.0, 0.7, 0.45, 0, 0, 0.0), color: STEEL },                             // маска орудия
          { geometry: cylZ(0.15, 0.15, 1.9, 0, 0.02, 1.1), color: 0x2d312c },                     // кожух ствола
          { geometry: cylZ(0.105, 0.105, 4.1, 0, 0.02, 2.1), color: BARREL },                     // ствол
          { geometry: cylZ(0.15, 0.15, 0.4, 0, 0.02, 4.0), color: DARK },                         // дульный тормоз
          { geometry: cylZ(0.035, 0.035, 0.9, 0.5, -0.12, 0.55), color: BARREL },                 // спаренный пулемёт
        ],
        guns: [
          { weapon: 'cannon', input: 'attack', at: [0, 0.02, 4.3] },
          { weapon: 'hmg', input: 'aim', at: [0.5, -0.12, 1.05] },
        ],
      };
    },
  },
  heli: {
    speed: 2.2, pitch: [-0.9, 0.2], yawLimit: 1.2, range: 150,
    build() {
      return {
        yawPaint: [],
        yawTrim: [
          { geometry: new THREE.SphereGeometry(0.26, 10, 8).translate(0, -0.05, 0.05), color: DARK },
          { geometry: box(0.5, 0.12, 0.5, 0, 0.18, 0), color: STEEL },
        ],
        pitchAt: [0, -0.1, 0.1],
        pitchTrim: [
          { geometry: box(0.1, 0.12, 0.4, 0, 0, 0.1), color: STEEL },
          { geometry: cylZ(0.03, 0.03, 0.9, 0, 0, 0.6), color: BARREL },
        ],
        guns: [
          { weapon: 'hmg', input: 'attack', at: [0, 0, 1.08] },
          { weapon: 'rpg', input: 'aim', at: [0, 0, 0], mount: 'body', bodyAt: [[-1.55, 0.98, 1.6], [1.55, 0.98, 1.6]] },
        ],
      };
    },
  },
};

const GEO = new Map();
function modelFor(id) {
  if (GEO.has(id)) return GEO.get(id);
  const b = TURRETS[id].build();
  const out = {
    ...b,
    yawPaintGeo: b.yawPaint.length ? mergeColored(b.yawPaint.map((geometry) => ({ geometry }))) : null,
    yawTrimGeo: b.yawTrim.length ? mergeColored(b.yawTrim) : null,
    pitchTrimGeo: b.pitchTrim.length ? mergeColored(b.pitchTrim) : null,
  };
  GEO.set(id, out);
  return out;
}

export class Turret {
  constructor(vehicle, spec) {
    this.v = vehicle;
    this.game = vehicle.game;
    this.id = spec.id;
    this.cfg = TURRETS[spec.id];
    const M = modelFor(spec.id);
    this.yawRoot = new THREE.Group();
    this.yawRoot.position.set(...spec.pivot);
    const add = (geo, mat, parent) => {
      if (!geo) return null;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    add(M.yawPaintGeo, vehicle.paintMat, this.yawRoot);
    add(M.yawTrimGeo, trimMat(), this.yawRoot);
    this.pitchRoot = new THREE.Group();
    this.pitchRoot.position.set(...M.pitchAt);
    this.yawRoot.add(this.pitchRoot);
    this.barrel = new THREE.Group();          // откат при выстреле
    this.pitchRoot.add(this.barrel);
    add(M.pitchTrimGeo, trimMat(), this.barrel);
    vehicle.body.add(this.yawRoot);

    // Стволы: состояние (темп, перезарядка) + точка дула.
    this.guns = M.guns.map((g) => {
      const marks = [];
      if (g.mount === 'body') {
        for (const p of g.bodyAt) {
          const m = new THREE.Object3D();
          m.position.set(...p);
          vehicle.body.add(m);
          marks.push(m);
        }
      } else {
        const m = new THREE.Object3D();
        m.position.set(...g.at);
        this.barrel.add(m);
        marks.push(m);
      }
      return { weapon: g.weapon, input: g.input, gun: new Gun(g.weapon, 0, false, true), marks, next: 0, burst: 0, rest: 0 };
    });
    this.yaw = 0;       // относительно корпуса, рад
    this.pitch = 0.05;
    this.kick = 0;
    this.target = null;
    this.targetTimer = 0;
    this.aimPoint = new THREE.Vector3();
    this.hasAim = false;
  }

  dispose() {
    this.yawRoot.removeFromParent();
  }

  // Мировое направление ствола.
  direction(out) {
    const yaw = this.v.heading + this.yaw;
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(yaw) * cp, Math.sin(this.pitch), Math.cos(yaw) * cp);
  }

  // Для HUD игрока: название и готовность основного ствола.
  hudInfo() {
    const g = this.guns[0];
    return { name: g.gun.def.name, ready: g.gun.cooldown <= 0, progress: g.gun.cooldown > 0 ? clamp(1 - g.gun.cooldown * g.gun.def.fireRate, 0, 1) : 1, slow: g.gun.def.fireRate < 1 };
  }

  update(dt) {
    const v = this.v, game = this.game;
    const driver = v.driver;
    for (const g of this.guns) g.gun.update(dt);
    this.kick = Math.max(0, this.kick - dt * 3.2);
    this.barrel.position.z = -this.kick * (this.id === 'tank' ? 0.55 : 0.12);
    if (!driver || v.wrecked) {
      this._pose();
      return;
    }
    const player = driver === game.player;
    const fire = { attack: false, aim: false };
    this.hasAim = false;
    if (player) {
      const input = game.input;
      const { camera, cameraRig } = game;
      cameraRig.forward(_f);
      _t.copy(camera.position).addScaledVector(_f, cameraRig.distance);
      this.aimPoint.copy(aimPoint(game, _t, _f, driver, 400));
      this.hasAim = true;
      fire.attack = input.isDown('attack');
      fire.aim = input.isDown('aim');
    } else {
      this._autoAim(dt, fire);
    }

    if (this.hasAim) {
      this.yawRoot.getWorldPosition(_o);
      const dx = this.aimPoint.x - _o.x, dz = this.aimPoint.z - _o.z;
      const wantYaw = wrapAngle(Math.atan2(dx, dz) - v.heading);
      const wantPitch = clamp(Math.atan2(this.aimPoint.y - (_o.y + this.pitchRoot.position.y), Math.max(2, Math.hypot(dx, dz))), this.cfg.pitch[0], this.cfg.pitch[1]);
      const lim = this.cfg.yawLimit;
      const tgtYaw = lim ? clamp(wantYaw, -lim, lim) : wantYaw;
      const dy = wrapAngle(tgtYaw - this.yaw);
      this.yaw = wrapAngle(this.yaw + clamp(dy, -this.cfg.speed * dt, this.cfg.speed * dt));
      this.pitch += clamp(wantPitch - this.pitch, -this.cfg.speed * dt, this.cfg.speed * dt);
      this.err = Math.abs(dy) + Math.abs(wantPitch - this.pitch);
    } else {
      this.err = 9;
    }
    this._pose();

    // Огонь.
    for (const g of this.guns) {
      const want = player ? fire[g.input] : g.input === 'attack' ? fire.attack : fire.aim;
      if (!want) continue;
      if (!player && this.err > 0.12) continue;
      if (!g.gun.canFire() || g.next > 0) continue;
      this._fire(g, driver, player);
    }
  }

  _pose() {
    this.yawRoot.rotation.y = this.yaw;
    this.pitchRoot.rotation.x = -this.pitch;
  }

  _fire(g, driver, player) {
    const game = this.game;
    const def = g.gun.def;
    g.gun.consume();
    // Стволы вертолёта на пилонах стреляют по очереди — левый, правый.
    const mark = g.marks[g.marks.length > 1 ? (g.alt = (g.alt ?? 0) ^ 1) : 0];
    mark.getWorldPosition(_o);
    this.direction(_d);
    const spread = def.spread * (player ? 1 : CONFIG.npc.gunSpreadScale * 0.5);
    fireShot(game, { shooter: driver, origin: _o, dir: _d, weapon: g.weapon, spread, damageScale: CONFIG.npc.gunDamageToPlayer * (player ? 1 : 1), muzzle: _o });
    this.kick = 1;
    if (def.projectile) game.cameraRig.addShake?.(player ? 0.28 : 0.1);
    if (player && !def.projectile) game.cameraRig.addRecoil(0.003);
  }

  // Водитель-NPC: ближайший противник в зоне поражения, очередями.
  _autoAim(dt, fire) {
    const game = this.game;
    this.targetTimer -= dt;
    this.yawRoot.getWorldPosition(_o);
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.4 + Math.random() * 0.3;
      this.target = game.war?.pickTarget(this.v, _o, this.cfg.range) ?? null;
    }
    const t = this.target;
    if (!t || t.isDead || t.wrecked || t.removed) {
      this.target = null;
      return;
    }
    const p = t.position;
    _v.set(p.x, t.spec ? p.y + 1.2 : (t.visualY ?? p.y) + 1.15, p.z);
    if (_v.distanceTo(_o) > this.cfg.range * 1.15) { this.target = null; return; }
    this.aimPoint.copy(_v);
    this.hasAim = true;
    if (!lineOfSight(game, _o, _v)) return;
    // Очереди: пулемёт — несколько секунд огня и пауза; орудие — по готовности.
    for (const g of this.guns) {
      if (g.rest > 0) { g.rest -= dt; continue; }
      if (g.next > 0) g.next -= dt;
    }
    const primary = this.guns[0];
    if (primary.gun.def.fireRate < 1) fire.attack = true;
    else if (primary.rest <= 0) {
      fire.attack = true;
      if ((primary.burst += dt) > 1.8) { primary.burst = 0; primary.rest = 0.9 + Math.random() * 0.8; }
    }
    // Второй ствол (пулемёт танка, ракеты вертолёта) — реже.
    const second = this.guns[1];
    if (second && second.rest <= 0 && _v.distanceTo(_o) < (second.gun.def.projectile ? 140 : 80)) {
      fire.aim = true;
      if ((second.burst += dt) > (second.gun.def.projectile ? 0.3 : 1.4)) { second.burst = 0; second.rest = second.gun.def.projectile ? 5 + Math.random() * 3 : 1.2 + Math.random(); }
    }
  }
}
