import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { Melee, findTargetInFront } from './combat.js';
import { LINES } from './npc.js';
import { clamp, damp, dampAngle } from './utils.js';

// Игрок: ходьба/бег относительно камеры, прыжок, удары, посадка в машину и угон.
// Пока игрок в машине, его модель прикреплена к сиденью, а позиция
// повторяет позицию машины (для миникарты, NPC и других систем).
// Здоровье: урон от кулаков и машин, восстановление вне боя, смерть -> game.onPlayerDied().

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
    this.melee = new Melee(this, { damage: P.punchDamage, cooldown: 0.12 });
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

  update(dt) {
    const P = CONFIG.player;
    this.sinceDamage += dt;
    this.combatTimer = Math.max(0, this.combatTimer - dt);
    if (!this.isDead && this.sinceDamage > P.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + P.regenRate * dt);
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

    // Лежит (сбит машиной) или мёртв: fall 0..1 управляет анимацией падения.
    let pose = 'normal';
    if (this.isDead) {
      this.fall = Math.min(1, this.fall + dt / 0.4);
      pose = 'down';
    } else if (this.downTime > 0) {
      this.downTime -= dt;
      const t = this.downDuration - this.downTime;
      this.fall = this.downTime < 0.7 ? clamp(this.downTime / 0.7, 0, 1) : Math.min(1, t / 0.3);
      pose = 'down';
      if (this.downTime <= 0) this.fall = 0;
    } else if (this.stunTime > 0) {
      pose = 'stumble';
    }
    const control = pose === 'normal';

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
    // Джойстик даёт неполное отклонение — идём медленнее; во время удара — почти стоим.
    const amount = Math.min(1, Math.hypot(f, s));
    let targetSpeed = (input.isDown('run') ? P.runSpeed : P.walkSpeed) * amount;
    if (this.melee.active) targetSpeed *= 0.3;

    // Удар: разворачиваемся к ближайшему противнику перед собой (удобно на телефоне).
    if (control && this.grounded && input.wasPressed('attack')) {
      const target = findTargetInFront(this.game, this, 3, -0.3);
      if (target) this.heading = Math.atan2(target.position.x - this.position.x, target.position.z - this.position.z);
      if (this.melee.start()) this.combatTimer = 3;
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

    if (control && this.grounded && input.wasPressed('jump')) {
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

    if ((mx || mz) && !this.melee.active) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), P.turnSpeed, dt);

    this.visualY = this.grounded ? damp(this.visualY, this.position.y, 25, dt) : this.position.y;
    this.model.root.position.set(this.position.x, this.visualY, this.position.z);
    this.model.root.rotation.y = this.heading;
    this.model.animate(dt, {
      speed: this.horizontalSpeed, airborne: !this.grounded, pose, fall: this.fall,
      guard: this.combatTimer > 0 && control, attack: this.melee.t, attackSide: this.melee.side,
    });
  }

  // --- Здоровье --------------------------------------------------------------

  takeDamage(amount, attacker, dirX = 0, dirZ = 0, kind = 'punch') {
    if (this.isDead) return;
    this.health -= amount;
    this.sinceDamage = 0;
    this.combatTimer = 3;
    if (kind === 'punch' && !this.vehicle) {
      this.velocity.x += dirX * 2;
      this.velocity.z += dirZ * 2;
      this.stunTime = Math.max(this.stunTime, 0.15);
    }
    this.game.events.emit('character:damaged', { target: this, attacker, amount, kind });
    if (this.health <= 0) this.die(attacker, kind);
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

  die(attacker, kind) {
    if (this.isDead) return;
    if (this.vehicle) this.exitVehicle();
    this.health = 0;
    this.isDead = true;
    this.fall = 0;
    this.melee.cancel();
    this.game.events.emit('character:killed', { target: this, attacker, kind });
    this.game.onPlayerDown('wasted');
  }

  respawn({ x, z, heading }) {
    if (this.vehicle) this.exitVehicle();
    this.isDead = false;
    this.health = this.maxHealth;
    this.fall = 0;
    this.downTime = 0;
    this.stunTime = 0;
    this.combatTimer = 0;
    this.sinceDamage = 99;
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
    this.velocity.set(0, 0, 0);
    this.melee.cancel();
    this.combatTimer = 0;
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
    this.game.events.emit('vehicle:exit', { vehicle, who: this });
  }
}
