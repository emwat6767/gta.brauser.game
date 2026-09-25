import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { Melee, findTargetInFront } from './combat.js';
import { Arsenal } from './weapons.js';
import { fireShot, aimPoint, lineOfSight } from './ballistics.js';
import { Ragdoll } from './ragdoll.js';
import { LINES } from './npc.js';
import { clamp, damp, dampAngle } from './utils.js';

// Игрок: ходьба/бег относительно камеры, прыжок, кулаки и оружие (прицел, отдача,
// перезарядка), посадка в машину и угон. Пока игрок в машине, его модель прикреплена
// к сиденью, а позиция повторяет позицию машины.
// Здоровье: урон от кулаков, пуль и машин, восстановление вне боя; смерть — рэгдолл
// и game.onPlayerDown('wasted').

const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Vector3(), _dir = new THREE.Vector3();
const _eye = new THREE.Vector3(), _aimAt = new THREE.Vector3(), _camF = new THREE.Vector3();
const WEAPON_KEYS = { weaponFists: 'fists', weaponPistol: 'pistol', weaponShotgun: 'shotgun', weaponSmg: 'smg' };

export class Player {
  constructor(game) {
    const P = CONFIG.player;
    this.game = game;
    this.radius = P.radius;
    this.role = 'player';
    this.gang = CONFIG.gangs.list.find((g) => g.friendly)?.id ?? null;
    this.model = new Humanoid(); // внешний вид — DEFAULT_LOOK в humanoid.js
    this.position = new THREE.Vector3(P.spawn.x, 0, P.spawn.z);
    this.position.y = game.world.getGroundHeight(this.position.x, this.position.z);
    this.velocity = new THREE.Vector3();
    this.heading = P.spawn.heading;
    this.grounded = true;
    this.visualY = this.position.y;
    this.vehicle = null;

    this.maxHealth = P.health;
    this.health = P.health;
    this.isDead = false;
    this.ragdoll = null;
    this.melee = new Melee(this, { damage: P.punchDamage, cooldown: 0.12 });
    this.arsenal = new Arsenal(P.infiniteAmmo);
    this.arsenal.reset(P.startWeapons);
    this.model.setWeapon(this.arsenal.current);
    this.aiming = false;
    this.aimPitch = 0;
    this.shootTimer = 0;      // > 0 — недавно стрелял: смотрит туда же, куда камера
    this.kick = 0;            // отдача в анимации
    this.combatTimer = 0;     // > 0 — кулаки подняты
    this.sinceDamage = 99;    // секунд с последнего урона (для восстановления)
    this.stunTime = 0;        // оглушён: управление отключено
    this.downTime = 0;        // сбит с ног (машиной): лежит, потом встаёт
    this.downDuration = 0;
    this.fall = 0;

    this._hit = { nx: 0, nz: 0 };
    game.scene.add(this.model.root);
  }

  get isOnFoot() {
    return !this.vehicle;
  }

  get isDown() {
    return this.isDead || this.downTime > 0;
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get gun() {
    return this.arsenal.gun;
  }

  update(dt) {
    const P = CONFIG.player;
    this.sinceDamage += dt;
    this.combatTimer = Math.max(0, this.combatTimer - dt);
    this.shootTimer = Math.max(0, this.shootTimer - dt);
    this.kick = Math.max(0, this.kick - dt * 8);
    if (!this.isDead && this.sinceDamage > P.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + P.regenRate * dt);
    }

    if (this.ragdoll) {
      // Мёртв: телом управляет физика, камера следит за тазом.
      this.ragdoll.step(dt);
      this.position.copy(this.ragdoll.pelvis);
      this.visualY = this.game.world.getGroundHeight(this.position.x, this.position.z);
      this.model.applyRagdoll();
      return;
    }

    if (this.vehicle) {
      const v = this.vehicle;
      this.position.copy(v.position);
      this.heading = v.heading;
      this.velocity.set(v.velocity.x, 0, v.velocity.z);
      this.model.animate(dt, { pose: 'sit', sitHeight: v.seatHipHeight });
      return;
    }

    const { input, cameraRig, world } = this.game;
    this.melee.update(dt, this.game);
    this.stunTime = Math.max(0, this.stunTime - dt);

    // Сбит машиной: fall 0..1 управляет анимацией падения и подъёма.
    let pose = 'normal';
    if (this.downTime > 0) {
      this.downTime -= dt;
      const t = this.downDuration - this.downTime;
      this.fall = this.downTime < 0.7 ? clamp(this.downTime / 0.7, 0, 1) : Math.min(1, t / 0.3);
      pose = 'down';
      if (this.downTime <= 0) this.fall = 0;
    } else if (this.stunTime > 0) {
      pose = 'stumble';
    }
    const control = pose === 'normal';

    // --- Оружие: смена, прицел, перезарядка ---
    if (control) {
      if (input.wasPressed('nextWeapon')) this.arsenal.cycle(1);
      for (const [action, type] of Object.entries(WEAPON_KEYS)) if (input.wasPressed(action)) this.arsenal.select(type);
      this.model.setWeapon(this.arsenal.current);
    }
    const gun = this.gun;
    gun?.update(dt);
    this.aiming = !!gun && control && this.grounded && input.isDown('aim');
    cameraRig.aiming = this.aiming;
    if (this.aiming || this.shootTimer > 0) {
      cameraRig.forward(_f);
      this.aimPitch = -Math.asin(clamp(_f.y, -1, 1));
    }

    // Направление ввода относительно камеры.
    const f = control ? input.axis('backward', 'forward') : 0;
    const s = control ? input.axis('left', 'right') : 0;
    let mx = 0, mz = 0;
    if (f || s) {
      const yaw = cameraRig.yaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      mx = fx * f - fz * s;   // right = (-fz, fx)
      mz = fz * f + fx * s;
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
    }
    // Джойстик даёт неполное отклонение — идём медленнее; при ударе/прицеле — медленно.
    const amount = Math.min(1, Math.hypot(f, s));
    let targetSpeed = (input.isDown('run') && !this.aiming ? P.runSpeed : P.walkSpeed) * amount;
    if (this.melee.active) targetSpeed *= 0.3;
    if (this.aiming) targetSpeed *= 0.5;
    const moving = amount > 0.1;

    if (control) {
      if (gun) this._handleGun(gun, input, moving || !this.grounded);
      else if (this.grounded && input.wasPressed('attack')) {
        // Удар: разворачиваемся к ближайшему противнику перед собой (удобно на телефоне).
        const target = findTargetInFront(this.game, this, 3, -0.3);
        if (target) this.heading = Math.atan2(target.position.x - this.position.x, target.position.z - this.position.z);
        if (this.melee.start()) this.combatTimer = 3;
      }
    }

    // Разгон к желаемой скорости.
    const accel = this.grounded ? P.accel : P.airAccel;
    let dvx = mx * targetSpeed - this.velocity.x;
    let dvz = mz * targetSpeed - this.velocity.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = (control ? accel : 12) * dt;
    if (dl > maxDv) {
      dvx *= maxDv / dl;
      dvz *= maxDv / dl;
    }
    this.velocity.x += dvx;
    this.velocity.z += dvz;

    if (control && this.grounded && !this.aiming && input.wasPressed('jump')) {
      this.velocity.y = P.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= CONFIG.physics.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Стены/фонари/деревья: гасим скорость, направленную в препятствие.
    if (world.resolveCircle(this.position, this.radius, this._hit)) {
      const vn = this.velocity.x * this._hit.nx + this.velocity.z * this._hit.nz;
      if (vn < 0) {
        this.velocity.x -= vn * this._hit.nx;
        this.velocity.z -= vn * this._hit.nz;
      }
    }

    // Земля и бордюры: ступеньку в 15 см проходим без прыжка.
    const ground = world.getGroundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.position.y - ground < 0.3 && this.velocity.y <= 0) {
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.grounded = false;
    }

    // Куда смотрит модель: при прицеле/стрельбе — туда же, куда камера (стрейф),
    // иначе — по направлению движения.
    if (this.aiming || this.shootTimer > 0) this.heading = dampAngle(this.heading, cameraRig.yaw, 25, dt);
    else if ((mx || mz) && !this.melee.active) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), P.turnSpeed, dt);

    this.visualY = this.grounded ? damp(this.visualY, this.position.y, 25, dt) : this.position.y;
    this.model.root.position.set(this.position.x, this.visualY, this.position.z);
    this.model.root.rotation.y = this.heading;
    this.model.animate(dt, {
      speed: this.horizontalSpeed, airborne: !this.grounded, pose, fall: this.fall,
      guard: !gun && this.combatTimer > 0 && control, attack: this.melee.t, attackSide: this.melee.side,
      aim: this.aiming || this.shootTimer > 0 ? this.aimPitch : null,
      reload: gun?.reloadProgress ?? 0, kick: this.kick,
    });
  }

  // --- Оружие ----------------------------------------------------------------

  _handleGun(gun, input, moving) {
    const trigger = gun.def.auto ? input.isDown('attack') : input.wasPressed('attack');
    if (trigger) {
      if (gun.canFire()) this._shoot(gun, moving);
      else if (gun.mag === 0 && !gun.reloading && input.wasPressed('attack') && !this.reload()) {
        this.game.audio.empty(this.position);
      }
    }
    // Автоперезарядка, когда магазин пуст.
    if (gun.mag === 0 && gun.reserve > 0 && !gun.reloading && gun.cooldown <= 0) this.reload();
    if (input.wasPressed('reload')) this.reload();
  }

  reload() {
    const gun = this.gun;
    if (!gun || !gun.startReload()) return false;
    this.game.audio.reload(gun.type, this.position, gun.def.reload);
    return true;
  }

  _shoot(gun, moving) {
    const { game } = this;
    const { cameraRig, camera, input } = game;
    gun.consume();
    const h = this.heading;
    // Пуля вылетает из груди (чуть правее) — так не застревает в стене у дула.
    const origin = _o.set(this.position.x - Math.cos(h) * 0.2, this.visualY + 1.42, this.position.z + Math.sin(h) * 0.2);

    // Цель: на телефоне без прицела — автонаведение на ближайшего противника,
    // иначе — точка под перекрестьем (луч из камеры, начинаем от игрока, а не от камеры).
    let target = null;
    if (input.touchActive && !this.aiming) {
      const t = this.findAssistTarget();
      if (t) target = t.model.getJoints().chest.clone();
    }
    if (!target) {
      cameraRig.forward(_f);
      const start = camera.position.clone().addScaledVector(_f, cameraRig.distance);
      target = aimPoint(game, start, _f, this);
    }
    _dir.subVectors(target, origin).normalize();
    this.heading = Math.atan2(_dir.x, _dir.z);

    const muzzle = this.model.muzzleWorld(_m);
    const spread = gun.spread(moving) * (this.aiming ? 0.45 : 1);
    const res = fireShot(game, { shooter: this, origin, dir: _dir, weapon: gun.type, spread, muzzle, weaponMesh: this.model.weaponMesh });
    cameraRig.addRecoil(gun.def.recoil * (this.aiming ? 0.7 : 1));
    this.shootTimer = 1.5;
    this.kick = 1;
    this.combatTimer = 0;
    if (res.hits) game.hud.hitMarker(res.killed, res.headshot);
  }

  // Автонаведение (телефон): ближайший противник в конусе перед камерой, в прямой видимости.
  findAssistTarget() {
    const { game } = this;
    const f = game.cameraRig.forward(_camF);
    const cos = Math.cos(0.4);
    let best = null, bestScore = Infinity;
    for (const n of game.npcs.list) {
      if (n.vehicle || n.isDead || n.follower || !n.model.root.visible) continue;
      const dx = n.position.x - this.position.x, dz = n.position.z - this.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 35 || d < 0.5) continue;
      const fl = Math.hypot(f.x, f.z) || 1;
      const dot = (dx * f.x + dz * f.z) / (d * fl);
      if (dot < cos) continue;
      const hostile = n.target === this || (n.role === 'police' && game.wanted.level > 0) ||
        (n.role === 'gang' && !game.gangs.isFriendlyToPlayer(n.gang));
      const score = (1 - dot) * 40 + d * 0.15 - (hostile ? 3 : 0);
      if (score >= bestScore) continue;
      _eye.set(this.position.x, this.visualY + 1.4, this.position.z);
      _aimAt.set(n.position.x, n.position.y + 1.3, n.position.z);
      if (!lineOfSight(game, _eye, _aimAt)) continue;
      best = n;
      bestScore = score;
    }
    return best;
  }

  // Подобрать оружие/патроны. Новый ствол сразу берётся в руки, если в руках кулаки.
  giveWeapon(type, ammo) {
    const isNew = this.arsenal.give(type, ammo);
    if (isNew && this.arsenal.current === 'fists') this.arsenal.select(type);
    if (!this.vehicle) this.model.setWeapon(this.arsenal.current);
    return isNew;
  }

  // --- Здоровье --------------------------------------------------------------

  // info (для пуль): { zone, point, dir, impulse }
  takeDamage(amount, attacker, dirX = 0, dirZ = 0, kind = 'punch', info = null) {
    if (this.isDead) return;
    this.health -= amount;
    this.sinceDamage = 0;
    if (!this.gun) this.combatTimer = 3;
    if ((kind === 'punch' || kind === 'bullet') && !this.vehicle) {
      const k = kind === 'punch' ? 2 : 0.6;
      this.velocity.x += dirX * k;
      this.velocity.z += dirZ * k;
      if (kind === 'punch') this.stunTime = Math.max(this.stunTime, 0.15);
    }
    this.game.events.emit('character:damaged', { target: this, attacker, amount, kind });
    if (this.health <= 0) this.die(attacker, kind, info);
  }

  // Сбит машиной: отлетает и лежит пару секунд.
  knockDown(vx, vz, up, duration = 1.8) {
    if (this.isDead || this.vehicle) return;
    this.velocity.set(vx, up, vz);
    this.grounded = false;
    this.downDuration = duration;
    this.downTime = duration;
    this.melee.cancel();
    if (Math.abs(vx) + Math.abs(vz) > 0.01) this.heading = Math.atan2(-vx, -vz);
  }

  stun(seconds) {
    this.stunTime = Math.max(this.stunTime, seconds);
  }

  die(attacker, kind, info = null) {
    if (this.isDead) return;
    if (this.vehicle) this.exitVehicle();
    this.health = 0;
    this.isDead = true;
    this.aiming = false;
    this.game.cameraRig.aiming = false;
    this.melee.cancel();
    // Тело — под управление физики.
    this.ragdoll = new Ragdoll(this.game, this.model.getJoints(), this.velocity);
    if (info?.point) this.ragdoll.impulse(info.point, info.dir, info.impulse * 1.5);
    this.model.startRagdoll(this.ragdoll);
    this.game.events.emit('character:killed', { target: this, attacker, kind });
    this.game.onPlayerDown('wasted');
  }

  respawn({ x, z, heading }) {
    if (this.vehicle) this.exitVehicle();
    if (this.ragdoll) {
      this.ragdoll = null;
      this.model.resetPose();
    }
    this.isDead = false;
    this.health = this.maxHealth;
    this.fall = 0;
    this.downTime = 0;
    this.stunTime = 0;
    this.combatTimer = 0;
    this.shootTimer = 0;
    this.sinceDamage = 99;
    this.arsenal.reset(CONFIG.player.startWeapons); // после смерти/ареста — только стартовое оружие
    this.model.setWeapon(this.arsenal.current);
    this.position.set(x, this.game.world.getGroundHeight(x, z), z);
    this.visualY = this.position.y;
    this.velocity.set(0, 0, 0);
    this.heading = heading;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.set(0, heading, 0);
  }

  // --- Машины ------------------------------------------------------------------

  // Ближайшая машина, в которую можно сесть: пустая или с NPC за рулём (угон), если стоит.
  findEnterableVehicle() {
    if (this.isDown) return null;
    let best = null;
    let bestD = CONFIG.player.enterDistance;
    for (const v of this.game.vehicles) {
      if (v.driver === this || (v.driver && Math.abs(v.speed) > 3)) continue;
      const d = v.distanceToPoint(this.position.x, this.position.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  enterVehicle(vehicle) {
    const victim = vehicle.driver;
    if (victim && victim !== this) {
      // Угон: выкидываем водителя.
      victim.exitVehicle();
      victim.stumble(Math.sin(vehicle.heading + Math.PI / 2), Math.cos(vehicle.heading + Math.PI / 2), 2, this);
      if (victim.role === 'civilian') victim.say(this.game.rng.pick(LINES.carjacked), true);
      else victim.aggro(this, this.game.rng.pick(LINES.carjacked));
      this.game.events.emit('vehicle:carjack', { vehicle, by: this, victim });
    }
    this.vehicle = vehicle;
    vehicle.driver = this;
    vehicle.ai = null;
    vehicle.sirenOn = false;
    vehicle.seatAnchor.add(this.model.root);
    this.model.root.position.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.model.setWeapon(null); // в машине оружие не в руках
    this.velocity.set(0, 0, 0);
    this.melee.cancel();
    this.combatTimer = 0;
    this.aiming = false;
    this.game.cameraRig.aiming = false;
    this.game.events.emit('vehicle:enter', { vehicle, who: this });
  }

  exitVehicle() {
    const vehicle = this.vehicle;
    if (!vehicle) return;
    const spot = vehicle.findExitPosition(this.radius);
    vehicle.driver = null;
    this.vehicle = null;
    this.game.scene.add(this.model.root);
    this.position.set(spot.x, this.game.world.getGroundHeight(spot.x, spot.z), spot.z);
    this.visualY = this.position.y;
    this.velocity.set(0, 0, 0);
    this.heading = vehicle.heading;
    this.grounded = true;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.set(0, this.heading, 0);
    this.model.setWeapon(this.arsenal.current);
    this.game.events.emit('vehicle:exit', { vehicle, who: this });
  }
}
