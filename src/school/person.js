import * as THREE from 'three';
import { Humanoid } from '../js/humanoid.js';
import { mergeColored } from '../js/geometry.js';
import { clamp, damp, dampAngle, wrapAngle } from '../js/utils.js';
import { floorOfY, zoneAt } from './layout.js';

// Человек в школе: модель Humanoid из Open City + движение по этажам и лестницам, столкновения,
// присед, прятки, сидение за партой, предмет в руке, урон и падение. Общий для игрока, NPC и угроз.

const GRAVITY = 20;
const ITEM_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
const ITEM_GEO = {};

export function itemGeometry(type) {
  if (ITEM_GEO[type]) return ITEM_GEO[type];
  const P = [];
  const cyl = (r, h, y, color, x = 0, z = 0, r2 = r) => P.push({ geometry: new THREE.CylinderGeometry(r, r2, h, 12).translate(x, y, z), color });
  const box = (sx, sy, sz, x, y, z, color) => P.push({ geometry: new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), color });
  if (type === 'extinguisher') {
    cyl(0.085, 0.48, -0.2, '#c41e1e');
    cyl(0.06, 0.06, 0.07, '#c41e1e', 0, 0, 0.085);
    box(0.03, 0.08, 0.14, 0, 0.12, 0.04, '#2a2a2a');
    box(0.02, 0.02, 0.22, 0, 0.13, 0.15, '#2a2a2a');
    box(0.12, 0.04, 0.02, 0, -0.1, 0.09, '#f4f4f4');
  } else if (type === 'bat') {
    cyl(0.022, 0.32, 0, '#3a2a1a');
    cyl(0.045, 0.5, 0.4, '#c9a06a', 0, 0, 0.03);
  } else if (type === 'mop') {
    cyl(0.018, 1.25, 0.25, '#c8c8c8');
    box(0.32, 0.06, 0.1, 0, 0.88, 0, '#2d6fb3');
    box(0.3, 0.1, 0.08, 0, 0.95, 0, '#d8d0c0');
  }
  ITEM_GEO[type] = mergeColored(P);
  return ITEM_GEO[type];
}

export class Person {
  constructor(game, look, opts = {}) {
    this.game = game;
    this.model = new Humanoid(look);
    this.look = this.model.look;
    game.scene.add(this.model.root);
    this.pos = new THREE.Vector3(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.want = new THREE.Vector2();   // желаемая горизонтальная скорость
    this.heading = opts.heading ?? 0;
    this.faceTarget = null;            // угол, куда смотреть стоя
    this.radius = opts.radius ?? 0.27;
    this.maxHealth = this.health = opts.health ?? 60;
    this.name = opts.name ?? 'Ученик';
    this.role = opts.role ?? 'student';
    this.alive = true;
    this.fall = 0;
    this.crouch = false;
    this.hidden = null;     // место для пряток
    this.sitting = null;    // место за партой
    this.item = null;       // { type, mesh, charge }
    this.gesture = null;
    this.attackT = 0;       // фаза удара 0..1
    this.attackSide = 1;
    this.guard = false;
    this.aim = null;
    this.speed = 0;
    this.noise = 0;         // насколько шумит (для угроз)
    this.cough = 0;
    this.stun = 0;
    this.lastHurt = -99;
    this._zone = null;
    this._zoneT = 0;
    this.visibleModel = true;
    this.dead = false;      // окончательно (не встанет)
  }

  get floor() {
    return floorOfY(this.pos.y);
  }

  get zone() {
    return this._zone;
  }

  get isDown() {
    return !this.alive || this.fall > 0.5;
  }

  // Точка глаз / груди в мире.
  eye(out = new THREE.Vector3()) {
    const s = this.look.scale ?? 1;
    const h = this.hidden ? (this.hidden.pose === 'stand' ? 1.5 : 0.85) : this.sitting ? 1.15 : this.crouch ? 0.95 : 1.58;
    return out.set(this.pos.x, this.pos.y + h * s, this.pos.z);
  }

  chest(out = new THREE.Vector3()) {
    const s = this.look.scale ?? 1;
    const h = !this.alive ? 0.25 : this.hidden || this.crouch ? 0.7 : this.sitting ? 0.95 : 1.25;
    return out.set(this.pos.x, this.pos.y + h * s, this.pos.z);
  }

  // Расстояние с поправкой на этажи (разница по высоте «дороже»).
  distTo(other) {
    return Math.hypot(other.pos.x - this.pos.x, other.pos.z - this.pos.z) + Math.abs(other.pos.y - this.pos.y) * 2;
  }

  say(text, dur = 2.2) {
    this.game.hud?.bubble(this, text, dur);
  }

  setVisible(v) {
    this.visibleModel = v;
    this.model.root.visible = v;
  }

  // --- Предмет в руке -------------------------------------------------------------

  holdItem(item) {
    this.dropItemMesh();
    const mesh = new THREE.Mesh(itemGeometry(item.type), ITEM_MAT);
    mesh.castShadow = true;
    if (item.type === 'extinguisher') { mesh.position.set(0, -0.36, 0.08); mesh.rotation.set(1.3, 0, 0); }
    else if (item.type === 'bat') { mesh.position.set(0, -0.3, 0.02); mesh.rotation.set(Math.PI / 2 + 0.3, 0, 0); }
    else { mesh.position.set(0, -0.3, 0.02); mesh.rotation.set(Math.PI / 2, 0, 0); }
    this.model.elbowR.add(mesh);
    this.item = { ...item, mesh, charge: item.charge ?? 1 };
    item.holder = this;
  }

  dropItemMesh() {
    if (this.item?.mesh) this.item.mesh.removeFromParent();
    const it = this.item;
    this.item = null;
    return it;
  }

  // --- Движение --------------------------------------------------------------------

  // Желаемое движение (dx, dz — направление, не обязательно единичное) со скоростью speed.
  move(dx, dz, speed) {
    const l = Math.hypot(dx, dz);
    if (l < 1e-4 || speed <= 0) this.want.set(0, 0);
    else this.want.set((dx / l) * speed, (dz / l) * speed);
  }

  stop() {
    this.want.set(0, 0);
  }

  // Физика за шаг: разгон, столкновения со стенами и мебелью, пол/лестница, гравитация.
  physics(dt) {
    this.refreshZone(dt);
    if (this.hidden || this.sitting) {
      this.vel.set(0, 0, 0);
      this.speed = 0;
      return;
    }
    const W = this.game.world;
    const canMove = this.alive && this.fall < 0.05 && this.stun <= 0;
    const tx = canMove ? this.want.x : 0, tz = canMove ? this.want.y : 0;
    const acc = this.alive ? 12 : 4;
    this.vel.x = damp(this.vel.x, tx, acc, dt);
    this.vel.z = damp(this.vel.z, tz, acc, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (this.alive) W.resolveCircle(this.pos, this.radius, this.crouch ? 1.0 : 1.5);
    // Пол: подъём по ступеням мгновенный, падение — с ускорением.
    const g = W.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y > g + 0.02) {
      this.vy -= GRAVITY * dt;
      this.pos.y = Math.max(g, this.pos.y + this.vy * dt);
      if (this.pos.y <= g) this.vy = 0;
    } else {
      this.pos.y = g;
      this.vy = 0;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.3 && this.alive && this.fall < 0.05) this.heading = dampAngle(this.heading, Math.atan2(this.vel.x, this.vel.z), 10, dt);
    else if (this.faceTarget !== null && this.alive) this.heading = dampAngle(this.heading, this.faceTarget, 8, dt);
  }

  // Анимация и постановка модели.
  // Зона (комната/коридор) обновляется 4 раза в секунду — из физики, не из рендера.
  refreshZone(dt) {
    this._zoneT -= dt;
    if (this._zoneT > 0) return;
    this._zoneT = 0.25;
    const r = zoneAt(this.pos.x, this.pos.z, this.floor);
    this._zone = r ? this.game.school.zoneById.get(r.id) ?? null : null;
  }

  render(dt) {
    if (this.attackT > 0) this.attackT = Math.max(0, this.attackT - dt / 0.38);
    if (this.stun > 0) this.stun -= dt;
    const m = this.model;
    const root = m.root;
    if (this.sitting) {
      root.position.set(this.sitting.x, this.sitting.y, this.sitting.z);
      root.rotation.y = this.sitting.heading;
      this.heading = this.sitting.heading;
    } else if (this.hidden && this.hidden.pose !== 'stand') {
      root.position.set(this.hidden.x, this.pos.y, this.hidden.z);
      root.rotation.y = this.hidden.heading;
    } else {
      root.position.copy(this.pos);
      root.rotation.y = this.heading;
    }
    if (!root.visible) return;
    const pose = !this.alive || this.fall > 0 ? 'down' : this.sitting ? 'sit' : (this.crouch || (this.hidden && this.hidden.pose !== 'stand')) ? 'crouch' : 'normal';
    m.animate(dt, {
      speed: this.speed,
      pose,
      fall: this.fall,
      sitHeight: this.sitting?.sitH ?? 0.46,
      guard: this.guard,
      attack: this.attackT > 0 ? 1 - this.attackT : 0,
      attackSide: this.attackSide,
      aim: this.aim,
      gesture: this.gesture,
    });
  }

  // --- Урон -------------------------------------------------------------------------

  takeDamage(amount, source = null, kind = 'hit') {
    if (!this.alive) return false;
    this.health -= amount;
    this.lastHurt = this.game.time;
    this.lastHurtKind = kind;
    this.lastAttacker = source;
    if (this.health <= 0) {
      this.health = 0;
      this.die(kind, source);
      return true;
    }
    return false;
  }

  die(kind = 'hit', source = null) {
    if (!this.alive) return;
    this.alive = false;
    this.deathKind = kind;
    this.sitting = null;
    if (this.hidden) this.leaveHide(true);
    this.crouch = false;
    this.gesture = null;
    this.aim = null;
    this.guard = false;
    const it = this.dropItemMesh();
    if (it) this.game.dropItem?.(it, this.pos);
    this.game.onPersonDown?.(this, kind, source);
  }

  // Падение / вставание (fall: 0 → 1 за ~0.6 с), вызывается из update.
  updateFall(dt) {
    const target = this.alive ? (this.knocked > 0 ? 1 : 0) : 1;
    if (this.knocked > 0) this.knocked -= dt;
    this.fall = target > this.fall ? Math.min(1, this.fall + dt / 0.55) : Math.max(0, this.fall - dt / 0.9);
  }

  knockDown(time = 2.5) {
    this.knocked = time;
    this.sitting = null;
  }

  // --- Прятки ------------------------------------------------------------------------

  enterHide(spot) {
    if (spot.occupant && spot.occupant !== this) return false;
    this.sitting = null;
    this.hidden = spot;
    spot.occupant = this;
    this.pos.set(spot.x, this.game.world.groundAt(spot.x, spot.z, spot.y + 0.3), spot.z);
    this.heading = spot.heading;
    this.crouch = spot.pose !== 'stand';
    if (spot.type === 'locker') this.setVisible(false);
    this.stop();
    return true;
  }

  leaveHide(silent = false) {
    const spot = this.hidden;
    if (!spot) return;
    spot.occupant = null;
    this.hidden = null;
    this.setVisible(true);
    if (spot.exit) this.pos.set(spot.exit.x, this.pos.y, spot.exit.z);
    else {
      // Выйти чуть в сторону, где свободно.
      for (let k = 0; k < 8; k++) {
        const a = spot.heading + Math.PI + (k * Math.PI) / 4;
        const x = spot.x + Math.sin(a) * 0.7, z = spot.z + Math.cos(a) * 0.7;
        if (this.game.world.isFree(x, z, this.pos.y, this.radius)) { this.pos.x = x; this.pos.z = z; break; }
      }
    }
    if (!silent) this.crouch = spot.pose !== 'stand';
  }

  sit(seat) {
    if (seat.taken && seat.taken !== this) return false;
    this.leaveSeat();
    seat.taken = this;
    this.sitting = seat;
    this.pos.set(seat.x, seat.y, seat.z);
    this.stop();
    return true;
  }

  leaveSeat() {
    const seat = this.sitting;
    if (!seat) return;
    seat.taken = null;
    this.sitting = null;
    if (seat.aisle) this.pos.set(seat.aisle.x, seat.y, seat.aisle.z);
  }

  dispose() {
    this.model.dispose();
  }
}

export function angleTo(from, x, z) {
  return Math.atan2(x - from.pos.x, z - from.pos.z);
}

export function facingDot(p, x, z) {
  const dx = x - p.pos.x, dz = z - p.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  return (Math.sin(p.heading) * dx + Math.cos(p.heading) * dz) / d;
}

export { clamp, wrapAngle };
