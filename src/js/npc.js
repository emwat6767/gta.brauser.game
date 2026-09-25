import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { Melee } from './combat.js';
import { Gun } from './weapons.js';
import { fireShot, lineOfSight } from './ballistics.js';
import { Ragdoll } from './ragdoll.js';
import { damp, dampAngle, lerp, wrapAngle } from './utils.js';

const _eye = new THREE.Vector3(), _aim = new THREE.Vector3(), _dir = new THREE.Vector3(), _muzzle = new THREE.Vector3();

// Оружие по таблице вероятностей роли: { pistol: 0.5, smg: 0.2 } -> 'pistol' | 'smg' | null.
function pickWeapon(rng, table) {
  let r = rng.next();
  for (const [type, p] of Object.entries(table ?? {})) {
    if ((r -= p) < 0) return type;
  }
  return null;
}

// NPC — все люди, кроме игрока: прохожие, бандиты, полицейские, водители.
// Роль (role) задаёт здоровье, силу удара и реакции:
//   civilian — гуляет по тротуарам, от ударов убегает
//   gang     — бродит по своей территории (allowedNodes), даёт сдачи, зовёт своих
//   police   — преследует игрока, пока есть розыск (см. wanted.js)
// Вооружённые NPC (оружие — по CONFIG.npc.roles[role].weapons) в драке стреляют,
// если цель в прямой видимости и в пределах дальности; иначе бегут к ней.
// Смерть — рэгдолл (ragdoll.js), оружие выпадает на землю (pickups.js).
//
// Состояния (NPC_STATE) — конечный автомат в update(). Чтобы добавить поведение,
// добавьте состояние и ветку в switch.

export const NPC_STATE = {
  WALK: 'walk',       // идёт по графу тротуаров (или бежит в панике)
  IDLE: 'idle',       // стоит на месте
  FIGHT: 'fight',     // бежит к цели и бьёт
  STUMBLE: 'stumble', // пошатнулся от толчка/удара
  DOWN: 'down',       // сбит с ног
  GETUP: 'getup',
  DEAD: 'dead',
  DRIVE: 'drive',     // сидит за рулём (модель прикреплена к сиденью машины)
};

const PALETTE = {
  skin: ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a57257'],
  hair: ['#1b1b1b', '#3b2a1a', '#6b4423', '#a0785a', '#d6b370', '#555555'],
  shirt: ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#d35400', '#ecf0f1', '#34495e', '#e84393'],
  pants: ['#2c3e50', '#34495e', '#1f2d3d', '#5d4037', '#7f8c8d', '#212121', '#3e5c76'],
  shoes: ['#111111', '#eeeeee', '#5d4037', '#333333'],
};

export const LINES = {
  push: ['Эй!', 'Смотри куда прёшь!', 'Осторожнее!', 'Ты чего?!'],
  down: ['Ай!', 'А-а-а!', 'Ох...'],
  hit: ['Ай!', 'Помогите!', 'За что?!'],
  gangAggro: ['Вали с нашей улицы!', 'Ты попал!', 'Это наш район!', 'Бей его!'],
  gangHelp: ['Держись, братан!', 'Наших бьют!', 'Я с тобой!'],
  friendlyHit: ['Эй, свои!', 'Братан, ты чего?', 'Полегче!'],
  police: ['Стоять! Полиция!', 'Руки за голову!', 'Ни с места!'],
  carjacked: ['Моя машина!', 'Эй! Вор!', 'Верни тачку!'],
  scream: ['А-а-а!', 'Стреляют!', 'Бегите!', 'Помогите!'],
};

export function randomCivilianLook(rng) {
  return {
    skin: rng.pick(PALETTE.skin), hair: rng.pick(PALETTE.hair), shirt: rng.pick(PALETTE.shirt),
    pants: rng.pick(PALETTE.pants), shoes: rng.pick(PALETTE.shoes), scale: rng.range(0.93, 1.07),
  };
}

export function gangLook(rng, color) {
  return {
    skin: rng.pick(PALETTE.skin), hair: '#141414', shirt: color, bandana: color,
    pants: rng.pick(['#1c1c1c', '#2b3a55', '#3a3a3a']), shoes: rng.pick(['#111111', '#eeeeee']),
    scale: rng.range(0.97, 1.08),
  };
}

export function policeLook(rng) {
  return {
    skin: rng.pick(PALETTE.skin), hair: '#141414', shirt: '#22407a', pants: '#1a2233',
    shoes: '#0c0c0c', hat: '#16284d', scale: rng.range(0.98, 1.06),
  };
}

export class NPC {
  // opts: { x, z, from, to, role, gang, look, allowedNodes }
  constructor(game, rng, opts) {
    const N = CONFIG.npc;
    const { x, z, from, to, role = 'civilian', gang = null, look } = opts;
    this.game = game;
    this.rng = rng;
    this.role = role;
    this.gang = gang;
    this.allowedNodes = opts.allowedNodes ?? null; // Set id узлов, по которым можно гулять
    const L = look ?? randomCivilianLook(rng);
    this.model = new Humanoid(L);
    this.radius = N.radius * (L.scale ?? 1);

    const R = N.roles[role];
    this.maxHealth = R.health;
    this.health = R.health;
    this.melee = new Melee(this, { damage: R.damage, cooldown: R.cooldown });
    const weapon = opts.weapon !== undefined ? opts.weapon : pickWeapon(rng, R.weapons);
    this.gun = null;
    if (weapon) {
      this.gun = new Gun(weapon, 0, true); // у NPC бесконечный запас патронов
      this.gun.mag = this.gun.def.magazine;
    }
    this.aimTime = 0;
    this.fireWait = 0;
    this.losTimer = 0;
    this.hasLOS = false;
    this.shooting = false;
    this.aimPitch = 0;
    this.ragdoll = null;

    this.position = new THREE.Vector3(x, game.world.getGroundHeight(x, z), z);
    this.knock = new THREE.Vector3(); // скорость от толчков/ударов (в т.ч. вертикальная)
    this.heading = to ? Math.atan2(to.x - x, to.z - z) : rng.range(-Math.PI, Math.PI);
    this.walkSpeed = rng.range(N.walkSpeed[0], N.walkSpeed[1]);
    this.idleChance = role === 'gang' ? 0.55 : N.idleChance;
    this.speed = 0;
    this.state = NPC_STATE.WALK;
    this.stateTime = 0;
    this.idleTime = 0;
    this.downTime = 0;
    this.stumbleTime = 0.7;
    this.panic = 0;       // секунд бегства
    this.cooldown = 0;    // защита от повторной реакции на толчок каждый кадр
    this.talkCooldown = 0;
    this.hitStreak = 0;   // серия ударов подряд: третий сбивает с ног
    this.hitStreakTimer = 0;
    this.fall = 0;
    this.airborne = false;
    this.target = null;   // противник в состоянии FIGHT
    this.vehicle = null;
    this.removed = false;
    this.visualY = this.position.y;
    this.prevNode = from ?? null;
    this.node = null;
    this._setTarget(to ?? game.world.nearestWaypoint(x, z));
    this._hit = { nx: 0, nz: 0 };
    game.scene.add(this.model.root);
  }

  get isDead() {
    return this.state === NPC_STATE.DEAD;
  }

  get isDown() {
    return this.state === NPC_STATE.DOWN || this.state === NPC_STATE.GETUP || this.state === NPC_STATE.DEAD;
  }

  get isBusy() {
    return this.state === NPC_STATE.FIGHT || this.isDown || !!this.vehicle;
  }

  _enter(state) {
    this.state = state;
    this.stateTime = 0;
  }

  say(text, force = false) {
    if (!force && this.talkCooldown > 0) return;
    this.talkCooldown = 3;
    this.game.hud?.say(this, text);
  }

  _setTarget(node) {
    this.node = node;
    const j = 1.1; // случайный сдвиг, чтобы пешеходы не ходили по одной линии
    this.walkTarget = { x: node.x + this.rng.range(-j, j), z: node.z + this.rng.range(-j, j) };
  }

  _nearestAllowedNode() {
    const w = this.game.world;
    if (!this.allowedNodes) return w.nearestWaypoint(this.position.x, this.position.z);
    let best = null, bestD = Infinity;
    for (const id of this.allowedNodes) {
      const n = w.waypoints[id];
      const d = (n.x - this.position.x) ** 2 + (n.z - this.position.z) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  _chooseNext() {
    const links = this.node.links;
    let options = links.filter((n) => n !== this.prevNode);
    if (this.allowedNodes && this.panic <= 0) {
      const inside = options.filter((n) => this.allowedNodes.has(n.id));
      options = inside.length ? inside : links.filter((n) => this.allowedNodes.has(n.id));
    }
    const pool = options.length ? options : links;
    let next;
    if (this.panic > 0) {
      // Убегаем: выбираем соседа дальше всего от игрока.
      const p = this.game.player.position;
      const d = (n) => (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
      next = pool.reduce((best, n) => (d(n) > d(best) ? n : best), pool[0]);
    } else {
      next = this.rng.pick(pool);
    }
    this.prevNode = this.node;
    this._setTarget(next);
  }

  update(dt) {
    const N = CONFIG.npc;
    const world = this.game.world;
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.talkCooldown = Math.max(0, this.talkCooldown - dt);
    this.panic = Math.max(0, this.panic - dt);
    if (this.hitStreakTimer > 0 && (this.hitStreakTimer -= dt) <= 0) this.hitStreak = 0;

    if (this.ragdoll) {
      // Мёртв: телом управляет физика.
      this.ragdoll.step(dt);
      this.position.copy(this.ragdoll.pelvis);
      if (this.model.root.visible) this.model.applyRagdoll();
      return;
    }

    if (this.vehicle) {
      // За рулём: позиция = машина, модель сидит на сиденье.
      this.position.copy(this.vehicle.position);
      this.heading = this.vehicle.heading;
      if (this.model.root.visible) this.model.animate(dt, { pose: 'sit', sitHeight: this.vehicle.seatHipHeight });
      return;
    }

    this.melee.update(dt, this.game);
    this.gun?.update(dt);
    this.fireWait -= dt;
    this.shooting = false;
    let speed = 0;

    switch (this.state) {
      case NPC_STATE.WALK: {
        const dx = this.walkTarget.x - this.position.x;
        const dz = this.walkTarget.z - this.position.z;
        if (dx * dx + dz * dz < 0.8) {
          if (this.panic <= 0 && this.rng.chance(this.idleChance)) {
            this.idleTime = this.role === 'gang' ? this.rng.range(3, 9) : this.rng.range(1, 4);
            this._enter(NPC_STATE.IDLE);
          }
          this._chooseNext();
          break;
        }
        speed = this.panic > 0 ? N.panicSpeed : this.walkSpeed;
        this.heading = dampAngle(this.heading, Math.atan2(dx, dz), this.panic > 0 ? 10 : 5, dt);
        this.position.x += Math.sin(this.heading) * speed * dt;
        this.position.z += Math.cos(this.heading) * speed * dt;
        break;
      }
      case NPC_STATE.IDLE:
        if (this.stateTime > this.idleTime) this._enter(NPC_STATE.WALK);
        break;
      case NPC_STATE.FIGHT:
        speed = this._updateFight(dt);
        break;
      case NPC_STATE.STUMBLE:
        if (this.stateTime > this.stumbleTime) this._recover(false);
        break;
      case NPC_STATE.DOWN:
        this.fall = Math.min(1, this.fall + dt / 0.35);
        if (this.stateTime > this.downTime && !this.airborne) this._enter(NPC_STATE.GETUP);
        break;
      case NPC_STATE.GETUP:
        this.fall = Math.max(0, this.fall - dt / 0.9);
        if (this.fall <= 0) this._recover(true);
        break;
      case NPC_STATE.DEAD:
        this.fall = Math.min(1, this.fall + dt / 0.35);
        break;
    }
    this.speed = speed;

    // Отброс от толчка/удара + гравитация.
    this.position.addScaledVector(this.knock, dt);
    this.knock.y -= CONFIG.physics.gravity * dt;
    const ground = world.getGroundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground + 0.3 && this.knock.y <= 0) {
      this.position.y = ground;
      this.knock.y = 0;
      this.airborne = false;
      const friction = this.isDown ? 3.5 : 7;
      this.knock.x *= Math.exp(-friction * dt);
      this.knock.z *= Math.exp(-friction * dt);
    } else {
      this.airborne = true;
    }

    if (world.resolveCircle(this.position, this.radius, this._hit)) {
      const vn = this.knock.x * this._hit.nx + this.knock.z * this._hit.nz;
      if (vn < 0) {
        this.knock.x -= 1.3 * vn * this._hit.nx;
        this.knock.z -= 1.3 * vn * this._hit.nz;
      }
    }

    if (!this.model.root.visible) return;
    this.visualY = this.airborne ? this.position.y : damp(this.visualY, this.position.y, 20, dt);
    this.model.root.position.set(this.position.x, this.visualY, this.position.z);
    this.model.root.rotation.y = this.heading;
    const pose = this.isDown ? 'down' : this.state === NPC_STATE.STUMBLE ? 'stumble' : 'normal';
    // Оружие видно только в драке (в остальное время "в кармане").
    this.model.setWeapon(this.gun && this.state === NPC_STATE.FIGHT ? this.gun.type : null);
    this.model.animate(dt, {
      speed, pose, fall: this.fall,
      guard: !this.gun && this.state === NPC_STATE.FIGHT && speed < 1,
      attack: this.melee.t, attackSide: this.melee.side,
      aim: this.shooting ? this.aimPitch : null,
      reload: this.gun?.reloadProgress ?? 0,
    });
  }

  // --- Драка ---------------------------------------------------------------

  aggro(target, line) {
    if (!target || target === this || this.isDead || this.vehicle || target.isDead) return;
    if (this.target === target && this.state === NPC_STATE.FIGHT) return;
    this.target = target;
    this.panic = 0;
    if (this.state === NPC_STATE.WALK || this.state === NPC_STATE.IDLE) this._enter(NPC_STATE.FIGHT);
    if (line) this.say(line);
  }

  dropTarget() {
    this.target = null;
    if (this.state === NPC_STATE.FIGHT) {
      this.prevNode = null;
      this._setTarget(this._nearestAllowedNode());
      this._enter(NPC_STATE.WALK);
    }
  }

  _updateFight(dt) {
    const N = CONFIG.npc;
    const t = this.target;
    if (!t || t.isDead || t.removed) {
      this.dropTarget();
      return 0;
    }
    const tp = t.vehicle ? t.vehicle.position : t.position;
    const dx = tp.x - this.position.x, dz = tp.z - this.position.z;
    const d = Math.hypot(dx, dz);
    // Бандиты не гоняются за машинами и далеко от района; полиция преследует всегда.
    if (d > 55 || (t.vehicle && this.role !== 'police' && d > 10)) {
      this.dropTarget();
      return 0;
    }
    const desired = Math.atan2(dx, dz);
    this.heading = dampAngle(this.heading, desired, 12, dt);
    // Полиция при 1-2 звёздах не стреляет, а задерживает (wanted.js считает время захвата).
    const arresting = this.role === 'police' && t === this.game.player &&
      this.game.wanted.level < CONFIG.wanted.policeDamageFrom;
    if (this.gun && !arresting && this._shootAt(dt, t, tp, d)) return 0;
    const reach = t.vehicle ? 2.3 : 1.15;
    if (d > reach) {
      const sp = N.fightSpeed * (this.melee.active ? 0.3 : 1);
      this.position.x += Math.sin(this.heading) * sp * dt;
      this.position.z += Math.cos(this.heading) * sp * dt;
      return sp;
    }
    if (t.vehicle) return 0; // рядом с машиной: полиция вытаскивает водителя (wanted.js)
    if (arresting) return 0;
    if (this.melee.ready && Math.abs(wrapAngle(desired - this.heading)) < 0.5) this.melee.start();
    return 0;
  }

  // Стрельба по цели: true — стоим и стреляем, false — цели не видно/далеко (бежим к ней).
  _shootAt(dt, t, tp, d) {
    const N = CONFIG.npc;
    const gun = this.gun;
    const eye = _eye.set(this.position.x, this.visualY + 1.42, this.position.z);
    const aim = _aim.set(tp.x, (t.vehicle ? tp.y + 0.9 : (t.visualY ?? tp.y) + 1.15), tp.z);
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.25;
      this.hasLOS = d < gun.def.range * 0.75 && lineOfSight(this.game, eye, aim);
    }
    if (!this.hasLOS) {
      this.aimTime = 0;
      return false;
    }
    this.shooting = true;
    this.aimTime += dt;
    this.aimPitch = Math.atan2(eye.y - aim.y, d);
    if (gun.mag === 0) {
      if (gun.startReload()) this.game.audio.reload(gun.type, this.position, gun.def.reload);
      return true;
    }
    if (this.aimTime > N.gunReaction && gun.canFire() && this.fireWait <= 0) {
      gun.consume();
      _dir.subVectors(aim, eye).normalize();
      const moving = t.velocity ? Math.hypot(t.velocity.x, t.velocity.z) > 2 : false;
      fireShot(this.game, {
        shooter: this, origin: eye, dir: _dir, weapon: gun.type,
        spread: gun.def.spread * N.gunSpreadScale + (moving ? 0.03 : 0),
        damageScale: N.gunDamageToPlayer, muzzle: this.model.muzzleWorld(_muzzle), weaponMesh: this.model.weaponMesh,
      });
      this.fireWait = this.rng.range(0.8, 1.4) / (gun.def.fireRate * N.gunFireRateScale);
    }
    return true;
  }

  _recover(afterFall) {
    if (this.target && !this.target.isDead && this.role !== 'civilian') {
      this._enter(NPC_STATE.FIGHT);
      return;
    }
    if (afterFall) {
      if (this.role === 'civilian') this.panic = 5;
      this.prevNode = null;
      this._setTarget(this._nearestAllowedNode());
    }
    this._enter(NPC_STATE.WALK);
  }

  // Урон: kind — 'punch' | 'bullet' | 'vehicle'. attacker — игрок, NPC или машина.
  // info (для пуль): { zone, point, dir, impulse } — куда попали и с какой силой.
  takeDamage(amount, attacker, dirX = 0, dirZ = 0, kind = 'punch', info = null) {
    if (this.isDead || this.vehicle) return;
    this.health -= amount;
    this.game.events.emit('character:damaged', { target: this, attacker, amount, kind, zone: info?.zone });
    if (this.health <= 0) {
      this._die(attacker, dirX, dirZ, kind, info);
      return;
    }
    if (kind === 'bullet') {
      this.knock.x += dirX * 0.8;
      this.knock.z += dirZ * 0.8;
    }
    if (kind === 'punch') {
      this.hitStreak++;
      this.hitStreakTimer = 1.6;
      if (this.hitStreak >= 3 && !this.isDown) {
        this.hitStreak = 0;
        this.knockDown(dirX * 4, dirZ * 4, 1.5, attacker, 'punch', true);
      } else if (!this.isDown) {
        this.knock.x += dirX * 2.2;
        this.knock.z += dirZ * 2.2;
        this.heading = Math.atan2(-dirX, -dirZ);
        this.melee.cancel();
        this.stumbleTime = 0.35;
        this._enter(NPC_STATE.STUMBLE);
      }
    }
    this._onAttacked(attacker);
  }

  _onAttacked(attacker) {
    const who = attacker?.driver ?? attacker; // удар машиной — виноват водитель
    if (!who || who === this || !who.position) return;
    if (this.role === 'civilian') {
      this.panic = 6;
      this.say(this.rng.pick(LINES.hit));
      return;
    }
    if (this.role === 'gang') {
      const gangs = this.game.gangs;
      if (who.gang === this.gang) return; // своих не бьём
      if (who === this.game.player && gangs.isFriendlyToPlayer(this.gang)) {
        this.say(this.rng.pick(LINES.friendlyHit));
        return;
      }
      this.aggro(who, this.rng.pick(LINES.gangAggro));
      gangs.callForHelp(this, who);
      return;
    }
    if (this.role === 'police') this.aggro(who, this.rng.pick(LINES.police));
  }

  _die(attacker, dirX, dirZ, kind, info) {
    this.health = 0;
    this.melee.cancel();
    this.target = null;
    // Начальная скорость тела: движение + отброс; удар кулаком толкает сильнее.
    const vel = new THREE.Vector3(Math.sin(this.heading) * this.speed, 0, Math.cos(this.heading) * this.speed).add(this.knock);
    if (kind === 'punch') vel.x += dirX * 3.5, vel.z += dirZ * 3.5;
    this.ragdoll = new Ragdoll(this.game, this.model.getJoints(), vel);
    if (info?.point) this.ragdoll.impulse(info.point, info.dir, info.impulse);
    this.model.startRagdoll(this.ragdoll);
    // Оружие выпадает — его можно подобрать.
    if (this.gun) {
      this.game.pickups?.drop(this.position.x + dirX * 0.6, this.position.z + dirZ * 0.6, this.gun.type, this.rng.int(6, 18));
      this.gun = null;
    }
    this._enter(NPC_STATE.DEAD);
    this.game.events.emit('character:killed', { target: this, attacker: attacker?.driver ?? attacker, kind });
  }

  // Лёгкий толчок: пошатнуться, обернуться на обидчика, отбежать (или дать сдачи).
  stumble(dirX, dirZ, strength, by) {
    if (this.isDown || this.vehicle || this.cooldown > 0) return false;
    this.knock.x += dirX * strength;
    this.knock.z += dirZ * strength;
    this.heading = Math.atan2(-dirX, -dirZ);
    this.cooldown = 1;
    this.stumbleTime = 0.7;
    this.melee.cancel();
    this._enter(NPC_STATE.STUMBLE);
    if (this.role === 'civilian') {
      this.panic = 4;
      this.say(this.rng.pick(LINES.push));
    } else if (this.role === 'gang' && by === this.game.player) {
      if (this.game.gangs.isFriendlyToPlayer(this.gang)) this.say(this.rng.pick(LINES.friendlyHit));
      else this.aggro(by, this.rng.pick(LINES.gangAggro));
    }
    this.game.events.emit('npc:pushed', { npc: this, by });
    return true;
  }

  // Сбит с ног: отлетает по (vx, vz), подпрыгивает на up, падает на спину.
  knockDown(vx, vz, up, by, cause, force = false) {
    if (this.vehicle) return false;
    if (this.isDead) {
      const v = Math.hypot(vx, vz);
      if (this.ragdoll && v > 0.1) this.ragdoll.impulse(this.ragdoll.pelvis, _dir.set(vx / v, 0.3, vz / v), v * 0.5);
      return false;
    }
    if (!force && this.cooldown > 0) return false;
    this.knock.set(vx, up, vz);
    this.airborne = up > 0;
    if (Math.abs(vx) + Math.abs(vz) > 0.01) this.heading = Math.atan2(-vx, -vz); // лицом к удару -> падает назад
    this.downTime = this.rng.range(CONFIG.npc.downTime[0], CONFIG.npc.downTime[1]);
    this.cooldown = 1.2;
    this.melee.cancel();
    this._enter(NPC_STATE.DOWN);
    this.say(this.rng.pick(LINES.down), true);
    this.game.events.emit('npc:knockdown', { npc: this, by, cause });
    return true;
  }

  // --- Машины --------------------------------------------------------------

  enterVehicle(vehicle) {
    this.model.setWeapon(null);
    this.vehicle = vehicle;
    vehicle.driver = this;
    vehicle.seatAnchor.add(this.model.root);
    this.model.root.position.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.target = null;
    this._enter(NPC_STATE.DRIVE);
  }

  exitVehicle() {
    const v = this.vehicle;
    if (!v) return;
    const spot = v.findExitPosition(this.radius);
    v.driver = null;
    v.ai = null;
    this.vehicle = null;
    this.game.scene.add(this.model.root);
    this.position.set(spot.x, this.game.world.getGroundHeight(spot.x, spot.z), spot.z);
    this.visualY = this.position.y;
    this.heading = v.heading;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.set(0, this.heading, 0);
    this.prevNode = null;
    this._setTarget(this._nearestAllowedNode());
    this._enter(NPC_STATE.WALK);
  }
}

// Все NPC живут здесь. Прохожих всегда ~CONFIG.npc.count вокруг игрока:
// дальние пересоздаются рядом. Бандитов и полицию добавляют gangs.js / wanted.js.
export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this._recycleTimer = 0;
    const p = game.player.position;
    for (let i = 0; i < CONFIG.npc.count; i++) this.spawnCivilian(p.x, p.z, 5, CONFIG.npc.spawnRadius, false);

    // Выстрелы пугают прохожих: разбегаются от стрелка.
    game.events.on('weapon:fired', ({ shooter, position }) => {
      const r2 = CONFIG.npc.panicRadius ** 2;
      for (const n of this.list) {
        if (n.role !== 'civilian' || n.vehicle || n.isDown || n === shooter) continue;
        if (n.position.distanceToSquared(position) > r2) continue;
        if (n.panic <= 0 && game.rng.chance(0.3)) n.say(game.rng.pick(LINES.scream));
        n.panic = 8;
        if (n.state === NPC_STATE.IDLE) n._enter(NPC_STATE.WALK);
      }
    });
  }

  add(npc) {
    this.list.push(npc);
    return npc;
  }

  remove(npc) {
    if (npc.removed) return;
    npc.removed = true;
    if (npc.vehicle) {
      npc.vehicle.driver = null;
      npc.vehicle = null;
    }
    npc.model.root.removeFromParent();
    const i = this.list.indexOf(npc);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Случайная точка на тротуаре между minR и maxR от (x, z). outOfView — по возможности за камерой.
  randomSidewalkSpot(x, z, minR, maxR, outOfView = true, allowed = null) {
    const { world, rng, camera } = this.game;
    let nodes = world.waypointsNear(x, z, maxR);
    if (allowed) nodes = nodes.filter((n) => allowed.has(n.id));
    if (!nodes.length) return null;
    const cam = camera.getWorldDirection(new THREE.Vector3());
    for (let attempt = 0; attempt < 25; attempt++) {
      const from = rng.pick(nodes);
      const links = allowed ? from.links.filter((n) => allowed.has(n.id)) : from.links;
      const to = rng.pick(links.length ? links : from.links);
      const t = rng.range(0.1, 0.9);
      const px = lerp(from.x, to.x, t) + rng.range(-1, 1);
      const pz = lerp(from.z, to.z, t) + rng.range(-1, 1);
      const d = Math.hypot(px - x, pz - z);
      if (d < minR || d > maxR) continue;
      if (outOfView && attempt < 18 && ((px - x) * cam.x + (pz - z) * cam.z) / d > 0.2 && d < 110) continue;
      return { x: px, z: pz, from, to };
    }
    return null;
  }

  spawnCivilian(x, z, minR, maxR, outOfView = true) {
    const spot = this.randomSidewalkSpot(x, z, minR, maxR, outOfView);
    if (!spot) return null;
    return this.add(new NPC(this.game, this.game.rng, { ...spot, role: 'civilian' }));
  }

  update(dt) {
    const N = CONFIG.npc;
    const p = this.game.player.position;
    const vis2 = N.visibleDistance ** 2, freeze2 = N.freezeDistance ** 2;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const npc = this.list[i];
      const d2 = (npc.position.x - p.x) ** 2 + (npc.position.z - p.z) ** 2;
      npc.model.root.visible = d2 < vis2;
      if (d2 > freeze2 && npc.state !== NPC_STATE.FIGHT && !npc.vehicle) continue;
      npc.update(dt);
      if (npc.isDead && npc.stateTime > N.corpseTime && d2 > 900) this.remove(npc);
    }

    // Раз в секунду: дальних прохожих убираем, недостающих создаём рядом с игроком.
    this._recycleTimer -= dt;
    if (this._recycleTimer > 0) return;
    this._recycleTimer = 1;
    let civilians = 0;
    for (const npc of [...this.list]) {
      if (npc.role !== 'civilian' || npc.vehicle) continue;
      const d = Math.hypot(npc.position.x - p.x, npc.position.z - p.z);
      if (d > N.recycleDistance || (npc.isDead && d > 60)) this.remove(npc);
      else if (!npc.isDead) civilians++;
    }
    if (civilians < N.count) this.spawnCivilian(p.x, p.z, 45, 130);
  }
}
