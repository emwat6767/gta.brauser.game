import * as THREE from 'three';
import { Agent } from './agent.js';
import { SCHOOL } from './config.js';
import { ROOM_BY_ID, EXITS, floorOfY } from './layout.js';
import { intruderLook, zombieLook, swatLook, firefighterLook } from './people-data.js';
import { facingDot } from './person.js';

// Угрозы и спасатели.
//   Intruder — вооружённый нападающий: патрулирует кабинеты, слышит шум, замечает людей
//              (свет, присед, укрытия), стреляет очередями, выбивает запертые двери, перезаряжается
//              (тут его можно сбить с ног). Его не убивают — обезвреживают (повалить и связать).
//   Zombie   — заражённый: медленный (или бегун), идёт на шум и на людей, кусает, ломится в двери.
//   Rescuer  — спецназ (обезвреживает нападающего), пожарные (тушат), военные у автобуса (зомби).

const I = SCHOOL.intruder, Z = SCHOOL.zombie;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();

function candidates(game) {
  return [game.player, ...game.npcs].filter((p) => p.alive && !p.saved && !p.inBus);
}

// ---------------------------------------------------------------- нападающий

export class Intruder extends Agent {
  constructor(game, spawn) {
    super(game, intruderLook(game.rng), { name: 'Нападающий', role: 'intruder', health: I.health[game.difficulty], x: spawn.x, z: spawn.z, radius: 0.3 });
    this.kind = 'intruder';
    this.breaker = true;
    this.model.setWeapon('rifle');
    this.ammo = I.magazine;
    this.reloading = 0;
    this.fireCd = 0;
    this.burst = 0;
    this.aimT = 0;
    this.state = 'enter';
    this.entry = spawn.entry;
    this.aware = new Map();       // человек -> 0..1 заметность
    this.target = null;
    this.lastSeen = null;
    this.visited = new Map();     // зона -> время
    this.neutralized = false;
    this.grappled = 0;
    this.blind = 0;
    this.scanT = 0;
    this.kicks = 0;
  }

  update(dt) {
    this.updateFall(dt);
    if (this.neutralized) { this.stop(); this.physics(dt); this.aim = null; return; }
    if (!this.alive) return;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.ammo = I.magazine; this.game.audio?.empty(this.pos); }
    }
    if (this.blind > 0) this.blind -= dt;
    if (this.grappled > 0) this.grappled -= dt;
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.stun > 0 || this.knocked > 0) {
      this.stop();
      this.aim = null;
      if (this.blind > 0 && Math.random() < dt * 1.5) this.say('*кашляет*', 1);
      this.physics(dt);
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.15; this.perceive(0.15); }
    this.act(dt);
    this.physics(dt);
  }

  // Кого видит и насколько хорошо (накапливается — время реакции).
  perceive(dt) {
    const g = this.game;
    const zone = this.zone;
    const lit = !zone || zone.type === 'corridor' || zone.lightsOn !== false;
    const range = this.blind > 0 ? 2 : (this.pos.y > -1 && zone ? (lit ? I.sight : I.sightDark) : 30);
    let best = null, bv = 0;
    for (const p of candidates(g)) {
      const d = this.distTo(p);
      let v = 0;
      if (d < range) {
        const h = p.hidden;
        if (h && h.doorBlind && (!zone || zone.id !== h.zone)) v = 0;
        else if (h && h.type === 'locker') v = d < 1.4 && p.noise > 0.3 ? 0.5 : 0;
        else if (d < 1.6 || facingDot(this, p.pos.x, p.pos.z) > Math.cos(I.fov)) {
          if (this.game.world.lineOfSight(this.eye(_a), p.chest(_b))) {
            v = 1 - d / (range + 4);
            if (h) v *= (1 - h.cover) * (d < 4 ? 1 : 0.5);
            else if (p.crouch) v *= 0.7;
            if (p.speed > 3) v *= 1.3;
            if (p.sitting) v *= 0.9;
          }
        }
      }
      const prev = this.aware.get(p) ?? 0;
      const reaction = I.reaction[g.difficulty];
      const nv = v > 0.05 ? Math.min(1.2, prev + (dt / reaction) * (0.4 + v)) : Math.max(0, prev - dt * 0.4);
      this.aware.set(p, nv);
      if (nv >= 1 && v > 0.05) {
        const score = v + (p === this.target ? 0.3 : 0) - d * 0.01;
        if (!best || score > bv) { best = p; bv = score; }
      }
    }
    if (best) {
      if (this.target !== best || this.state !== 'engage') this.state = 'engage';
      this.target = best;
      this.lastSeen = { x: best.pos.x, z: best.pos.z, floor: best.floor, t: g.time };
      g.onThreatSees?.(this, best);
    } else if (this.state === 'engage') {
      this.state = 'search';
      this.aim = null;
      if (this.lastSeen) this.goTo(this.lastSeen.x, this.lastSeen.z, this.lastSeen.floor, I.run);
    }
  }

  hear(n) {
    if (this.state === 'engage' || this.neutralized) return;
    const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z) + Math.abs(n.y - this.pos.y) * 4;
    if (d > n.r || n.src === this) return;
    this.investigate = { x: n.x, z: n.z, floor: floorOfY(n.y), t: this.game.time, kind: n.kind };
    const zoneId = this.game.zoneIdAt(n.x, n.z, n.y);
    if (zoneId) this.heardIn = { zone: zoneId, t: this.game.time };
  }

  act(dt) {
    const g = this.game;
    switch (this.state) {
      case 'enter': {
        if (!this.goal) this.goTo(this.entry.x, this.entry.z, 0, I.walk * 1.2);
        if (this.followPath(dt) !== 'moving') this.state = 'patrol';
        break;
      }
      case 'engage': {
        const t = this.target;
        if (!t || !t.alive || t.saved) { this.target = null; this.state = 'patrol'; this.aim = null; break; }
        const d = this.distTo(t);
        this.faceTarget = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        this.heading = this.faceTarget;
        const dy = t.chest(_b).y - this.eye(_a).y;
        this.aim = Math.atan2(-dy, Math.max(0.5, d)) * 0.8;
        if (d > 14) { this.goTo(t.pos.x, t.pos.z, t.floor, I.walk, { force: false }); this.followPath(dt); }
        else this.stop();
        if (this.reloading > 0 || this.grappled > 0) break;
        if (this.ammo <= 0) { this.reloading = I.reload; this.aim = null; g.audio?.reload('rifle', this.pos, I.reload); this.say('*перезаряжает*', 1.5); break; }
        this.aimT += dt;
        if (this.aimT < 0.25 || this.fireCd > 0) break;
        if (this.burst <= 0) { this.burst = 3 + Math.floor(Math.random() * 3); }
        this.shoot(t);
        this.burst--;
        this.fireCd = this.burst > 0 ? 0.11 : 0.55 + Math.random() * 0.5;
        break;
      }
      case 'search': {
        this.aimT = 0;
        const r = this.followPath(dt);
        if (r !== 'moving') {
          // Осмотреться, заглянуть в ближайший шкафчик, потом — дальше по кабинетам.
          this.scanT += dt;
          this.faceTarget = this.heading + dt * 2;
          if (this.scanT > 2.5) {
            this.scanT = 0;
            this.checkLockers();
            this.state = 'patrol';
          }
        }
        break;
      }
      case 'breach': {
        const d = this.breachDoor;
        if (!d || d.broken || !d.locked && !d.barricade) { this.state = 'room'; this.goTo(this.roomGoal.x, this.roomGoal.z, this.roomGoal.floor, I.walk); break; }
        this.stop();
        this.faceTarget = Math.atan2(d.x - this.pos.x, d.z - this.pos.z);
        this.kickT = (this.kickT ?? 0) - dt;
        if (this.kickT <= 0) {
          this.kickT = 1.25;
          this.attackT = 1;
          this.kicks++;
          g.doors.damage(d, 20 + Math.random() * 10);
          g.noise(d, 30, 'bang', this);
          if (this.kicks === 1) this.say('Открывай!', 1.5);
        }
        // Внутри тихо и дверь крепкая — бросает и уходит.
        const heard = this.heardIn && this.heardIn.zone === d.roomZone && g.time - this.heardIn.t < 12;
        if (this.kicks > (heard ? 30 : 6)) { this.kicks = 0; this.visited.set(d.roomZone, g.time); this.state = 'patrol'; this.clearGoal(); }
        break;
      }
      case 'room': {
        const r = this.followPath(dt);
        if (r === 'door' && this.blockedDoor) {
          this.breachDoor = this.blockedDoor;
          this.blockedDoor = null;
          this.kicks = 0;
          if (this.breachDoor.locked || this.breachDoor.barricade) this.state = 'breach';
          break;
        }
        if (r !== 'moving' && r !== 'door') {
          this.scanT += dt;
          this.faceTarget = this.heading + dt * 2.2;
          if (this.scanT > 3) { this.scanT = 0; this.state = 'patrol'; }
        }
        break;
      }
      default: { // patrol
        this.aimT = 0;
        this.aim = null;
        if (Math.random() < 0.004) this.say(['Где вы прячетесь?', 'Я слышу вас...', 'Выходите!'][Math.floor(Math.random() * 3)], 2);
        if (this.investigate && g.time - this.investigate.t < 8) {
          const v = this.investigate;
          this.investigate = null;
          this.roomGoal = v;
          this.goTo(v.x, v.z, v.floor, I.run * 0.8);
          this.state = 'room';
          break;
        }
        const z = this.pickRoom();
        if (!z) { this.stop(); break; }
        this.visited.set(z.id, g.time);
        const c = { x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2, floor: z.floor };
        this.roomGoal = c;
        this.goTo(c.x, c.z, c.floor, I.walk);
        this.state = 'room';
      }
    }
  }

  pickRoom() {
    const g = this.game;
    let best = null, bs = -1e9;
    for (const z of g.school.zones) {
      if (!z.doors && z.type !== 'gym' && z.type !== 'lobby' && z.type !== 'hall') continue;
      if (z.type === 'stairs' || z.type === 'corridor') continue;
      const last = this.visited.get(z.id) ?? -999;
      const d = Math.hypot((z.x0 + z.x1) / 2 - this.pos.x, (z.z0 + z.z1) / 2 - this.pos.z) + (z.floor !== this.floor ? 25 : 0);
      let s = -d * 0.6 + Math.min(120, g.time - last) * 0.5 + Math.random() * 12;
      if (this.heardIn?.zone === z.id && g.time - this.heardIn.t < 15) s += 60;
      if (g.time - last < 25) s -= 200;
      if (s > bs) { bs = s; best = z; }
    }
    return best;
  }

  checkLockers() {
    const g = this.game;
    for (const s of g.school.lockers) {
      if (s.floor !== this.floor || Math.hypot(s.x - this.pos.x, s.z - this.pos.z) > 3) continue;
      if (s.occupant && Math.random() < 0.35 + (s.occupant.noise ?? 0)) {
        s.occupant.leaveHide();
        g.audio?.locker(s);
        this.aware.set(s.occupant, 1.2);
        this.say('Попался!', 1.4);
        return;
      }
    }
  }

  shoot(t) {
    const g = this.game;
    this.ammo--;
    if (!g.alarm.type && !this.shotAlarm) {
      this.shotAlarm = true;
      g.scenario.at(4, () => g.scenario.raiseAlarm('attack', 'shots'));
    }
    const muzzle = this.model.muzzleWorld(_a.set(0, 0, 0)).clone();
    const chest = t.chest(_b).clone();
    const d = muzzle.distanceTo(chest);
    let p = 0.62 - d * 0.018;
    if (t.speed > 3) p *= 0.6;
    if (t.crouch) p *= 0.75;
    if (t.hidden) p *= 1 - t.hidden.cover;
    if (this.zone && !this.zone.lightsOn) p *= 0.75;
    if (this.blind > 0) p *= 0.15;
    if (t === g.player) p *= [0.55, 0.75, 0.9][g.difficulty];
    const hit = Math.random() < Math.max(0.05, p) && g.world.lineOfSight(muzzle, chest);
    _d.subVectors(chest, muzzle).normalize();
    let end;
    if (hit) end = chest;
    else {
      _d.x += (Math.random() - 0.5) * 0.12; _d.y += (Math.random() - 0.5) * 0.08; _d.z += (Math.random() - 0.5) * 0.12;
      _d.normalize();
      const r = g.world.raycast(muzzle.x, muzzle.y, muzzle.z, _d.x, _d.y, _d.z, 40);
      end = muzzle.clone().addScaledVector(_d, r ?? 40);
      if (r !== null) g.effects.burst(end, _d.clone().negate(), 'spark', 5);
    }
    g.effects.muzzle(muzzle, _d, this.model.weaponMesh);
    g.effects.tracer(muzzle, end);
    g.audio?.gunshot('rifle', muzzle);
    g.noise(this.pos, 50, 'shot', this);
    g.cameraShakeAt?.(muzzle, 0.15);
    if (hit) {
      const dmg = t === g.player ? I.damage[g.difficulty] * (0.8 + Math.random() * 0.4) : 30 + Math.random() * 40;
      t.takeDamage(dmg, this, 'shot');
      g.effects.burst(chest, _d.clone().negate(), 'dust', 4);
      if (t !== g.player && t.alive && Math.random() < 0.5) t.speak?.('hurt', true);
    }
  }

  // Удар по нападающему (рукой, битой, огнетушителем). from — кто бьёт.
  hitBy(from, dmg, kind = 'punch') {
    const g = this.game;
    if (this.neutralized) return;
    const behind = facingDot(this, from.pos.x, from.pos.z) < -0.2;
    const weak = this.reloading > 0 || this.blind > 0 || this.knocked > 0 || this.grappled > 0;
    // Сколько людей вокруг — толпа валит быстрее.
    let crowd = 0;
    for (const p of [g.player, ...g.npcs]) if (p.alive && p !== from && this.distTo(p) < 1.6 && (p.task?.type === 'fight' || p === g.player)) crowd++;
    if (crowd >= 1) this.grappled = 1.2;
    if (!weak && kind === 'punch' && Math.random() < 0.45) {
      // Отталкивает и бьёт прикладом.
      from.knockDown?.(1.4);
      from.takeDamage(8, this, 'hit');
      g.audio?.punch(from.pos);
      if (from === g.player) g.hud?.flash('Он оттолкнул тебя! Бей, когда он перезаряжается или стоит спиной.');
      return;
    }
    const k = (weak ? 1 : behind ? 0.6 : 0.35) * (1 + crowd * 0.5);
    this.health -= dmg * k;
    this.stun = Math.max(this.stun, kind === 'bat' ? 1.0 : weak ? 0.5 : 0.22);
    this.aim = null;
    // Разворачивается к тому, кто бьёт.
    this.aware.set(from, 1.2);
    if (!weak) { this.target = from; this.state = 'engage'; this.aimT = 0.15; }
    this.say(['Ах ты!', 'А-а!', 'Пусти!'][Math.floor(Math.random() * 3)], 1);
    if (this.health <= 0) this.neutralize(from);
  }

  blindBy(t = 3.5) {
    if (this.neutralized) return;
    this.blind = Math.max(this.blind, t);
    this.stun = Math.max(this.stun, t * 0.8);
    this.aim = null;
  }

  neutralize(by) {
    if (this.neutralized) return;
    this.neutralized = true;
    this.health = 0;
    this.aim = null;
    this.knocked = 99999;
    this.model.setWeapon(null);
    this.state = 'down';
    this.say('Сдаюсь!', 2.5);
    this.game.onIntruderDown?.(this, by);
  }
}

// ---------------------------------------------------------------- зомби

export class Zombie extends Agent {
  constructor(game, x, z, y, look, opts = {}) {
    const d = game.difficulty;
    super(game, zombieLook(look, game.rng), { name: opts.name ?? 'Зомби', role: 'zombie', health: Z.health[d] * (0.85 + Math.random() * 0.3), x, z, y, radius: 0.28 });
    this.kind = 'zombie';
    this.breaker = true;
    this.runner = Math.random() < Z.runnerChance[d];
    this.speedWalk = Z.walk * (0.85 + Math.random() * 0.3);
    this.state = 'wander';
    this.target = null;
    this.biteCd = 0;
    this.groanT = Math.random() * 4;
    this.gesture = 'zombie';
    this.rise = opts.rise ? 1 : 0;   // встаёт с пола
    if (this.rise) this.fall = 1;
  }

  get neutralized() { return !this.alive; }

  update(dt) {
    const g = this.game;
    if (this.rise > 0) {
      this.rise -= dt / 1.6;
      this.fall = Math.max(0, this.rise);
      this.physics(dt);
      return;
    }
    this.updateFall(dt);
    if (!this.alive) { this.stop(); this.physics(dt); return; }
    if (this.biteCd > 0) this.biteCd -= dt;
    if (this.stun > 0 || this.knocked > 0) { this.stop(); this.physics(dt); return; }
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = 3 + Math.random() * 5; g.audio?.groan(this.pos); }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25 + Math.random() * 0.1; this.perceive(); }
    this.act(dt);
    this.gesture = 'zombie';
    this.physics(dt);
  }

  perceive() {
    const g = this.game;
    let best = null, bd = 99;
    for (const p of candidates(g)) {
      if (p.hidden?.type === 'locker' && !(p.noise > 0.4)) continue;
      const d = this.distTo(p);
      if (d > Z.sight + 2) continue;
      if (p.hidden && p.hidden.doorBlind && this.zone?.id !== p.hidden.zone) continue;
      if (d < 1.8 || this.canSee(p, Z.sight * (this.zone && !this.zone.lightsOn ? 0.65 : 1), Math.cos(Z.fov))) {
        const dd = d - (p === this.target ? 2 : 0);
        if (dd < bd) { bd = dd; best = p; }
      }
    }
    if (best) {
      if (this.state !== 'chase' && Math.random() < 0.6) g.audio?.groan(this.pos, true);
      this.state = 'chase';
      this.target = best;
      this.lastSeen = { x: best.pos.x, z: best.pos.z, floor: best.floor, t: g.time };
    } else if (this.state === 'chase' && g.time - (this.lastSeen?.t ?? 0) > 4) {
      this.state = 'wander';
      this.target = null;
    }
  }

  hear(n) {
    if (this.state === 'chase' || n.src === this || n.src?.kind === 'zombie') return;
    const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z) + Math.abs(n.y - this.pos.y) * 4;
    if (d > n.r * 0.9) return;
    this.investigate = { x: n.x, z: n.z, floor: floorOfY(n.y), t: this.game.time };
  }

  act(dt) {
    const g = this.game;
    const sp = this.runner ? Z.runner : this.speedWalk;
    if (this.state === 'chase' && this.target) {
      const t = this.target;
      if (!t.alive || t.saved || t.inBus) { this.state = 'wander'; this.target = null; return; }
      const d = this.distTo(t);
      if (d < 0.95 && Math.abs(t.pos.y - this.pos.y) < 1) {
        this.clearGoal();
        this.faceTarget = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        if (this.biteCd <= 0) {
          this.biteCd = 1.1 + Math.random() * 0.4;
          this.attackT = 1;
          if (t.hidden) t.leaveHide();
          g.zombieBite(this, t);
        }
        return;
      }
      this.repath = (this.repath ?? 0) - dt;
      if (this.repath <= 0 || !this.goal) {
        this.repath = 0.7;
        const tp = this.lastSeen ?? t.pos;
        this.goTo(tp.x, tp.z, tp.floor ?? t.floor, sp * 1.15, { near: 0.6, force: true });
      }
      const r = this.followPath(dt);
      if (r === 'door' && this.blockedDoor) this.bang(dt, this.blockedDoor);
      else if (r === 'nopath' && d < 3) this.move(t.pos.x - this.pos.x, t.pos.z - this.pos.z, sp);
      return;
    }
    // Бродит: на шум или по кабинетам.
    if (this.investigate && g.time - this.investigate.t < 10) {
      const v = this.investigate;
      this.investigate = null;
      this.goTo(v.x, v.z, v.floor, sp, { near: 1.2 });
    }
    if (!this.goal) {
      this.idleT = (this.idleT ?? 0) - dt;
      if (this.idleT > 0) { this.stop(); return; }
      this.idleT = 1 + Math.random() * 3;
      const zs = g.school.zones.filter((z) => z.type !== 'stairs' && (z.floor === this.floor || Math.random() < 0.15));
      const z = zs[Math.floor(Math.random() * zs.length)];
      if (z) this.goTo(z.x0 + (z.x1 - z.x0) * (0.25 + Math.random() * 0.5), z.z0 + (z.z1 - z.z0) * (0.25 + Math.random() * 0.5), z.floor, sp * 0.8, { near: 1 });
    }
    const r = this.followPath(dt);
    if (r === 'door' && this.blockedDoor) {
      // Ломится, только если за дверью кто-то шумел.
      const z = this.blockedDoor.roomZone;
      if (g.zoneHasNoise(z, 15)) this.bang(dt, this.blockedDoor);
      else { this.blockedDoor = null; this.clearGoal(); }
    } else if (r === 'nopath') this.clearGoal();
  }

  bang(dt, door) {
    const g = this.game;
    this.stop();
    this.faceTarget = Math.atan2(door.x - this.pos.x, door.z - this.pos.z);
    this.bangT = (this.bangT ?? 0) - dt;
    if (this.bangT <= 0) {
      this.bangT = 1.4 + Math.random() * 0.6;
      this.attackT = 1;
      if (g.doors.damage(door, 5 + Math.random() * 3)) { this.blockedDoor = null; this.path = null; this.pathWait = 0.1; }
      g.noise(door, 18, 'bang', this);
      this.bangs = (this.bangs ?? 0) + 1;
      if (this.bangs > 25 && !g.zoneHasNoise(door.roomZone, 20)) { this.bangs = 0; this.blockedDoor = null; this.clearGoal(); this.state = 'wander'; }
    }
  }

  hitBy(from, dmg, kind = 'punch') {
    const g = this.game;
    if (!this.alive) return;
    this.health -= kind === 'punch' ? dmg * 0.55 : dmg;
    this.stun = Math.max(this.stun, kind === 'bat' ? 0.9 : 0.3);
    // Отбросить назад.
    const dx = this.pos.x - from.pos.x, dz = this.pos.z - from.pos.z, l = Math.hypot(dx, dz) || 1;
    this.vel.x += (dx / l) * (kind === 'bat' ? 4 : 2.5);
    this.vel.z += (dz / l) * (kind === 'bat' ? 4 : 2.5);
    if (kind === 'bat' && Math.random() < 0.35) this.knockDown(1.5);
    if (this.health <= 0) { this.die('hit', from); g.onZombieDown?.(this, from); }
    else if (this.state !== 'chase') { this.state = 'chase'; this.target = from; this.lastSeen = { x: from.pos.x, z: from.pos.z, floor: from.floor, t: g.time }; }
  }
}

// ---------------------------------------------------------------- спасатели

export class Rescuer extends Agent {
  constructor(game, kind, x, z) {
    const look = kind === 'fireman' ? firefighterLook(game.rng) : swatLook(game.rng);
    super(game, look, { name: kind === 'fireman' ? 'Пожарный' : kind === 'soldier' ? 'Военный' : 'Спецназ', role: kind, health: 400, x, z, radius: 0.3 });
    this.kind = kind;
    this.breaker = kind === 'swat';
    if (kind !== 'fireman') this.model.setWeapon('rifle');
    this.fireCd = 0;
    this.target = null;
    this.sprayT = 0;
    this.post = { x, z };
  }

  update(dt) {
    const g = this.game;
    if (this.fireCd > 0) this.fireCd -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.3; this.think(); }
    if (this.kind === 'fireman') this.actFireman(dt);
    else this.actArmed(dt);
    this.physics(dt);
    void g;
  }

  think() {
    const g = this.game;
    if (this.kind === 'fireman') return;
    let best = null, bd = 99;
    for (const t of g.threats) {
      if (!t.alive || t.neutralized) continue;
      const d = this.distTo(t);
      const range = this.kind === 'soldier' ? 28 : 30;
      if (d < range && this.canSee(t, range, -0.3) && d < bd) { bd = d; best = t; }
    }
    this.target = best;
  }

  actArmed(dt) {
    const g = this.game;
    const t = this.target;
    if (t && t.alive && !t.neutralized) {
      this.clearGoal();
      this.faceTarget = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      this.heading = this.faceTarget;
      this.aim = 0.05;
      if (this.fireCd <= 0) {
        this.fireCd = this.kind === 'soldier' ? 0.35 : 0.5;
        const m = this.model.muzzleWorld(_a.set(0, 0, 0)).clone();
        const c = t.chest(_b).clone();
        g.effects.muzzle(m, _d.subVectors(c, m).normalize(), this.model.weaponMesh);
        g.effects.tracer(m, c);
        g.audio?.gunshot('rifle', m);
        if (t.kind === 'intruder') { if (Math.random() < 0.6) t.neutralize(this); }
        else { t.health -= 45; if (t.health <= 0 && t.alive) { t.die('shot', this); g.onZombieDown?.(t, this); } }
      }
      return;
    }
    this.aim = null;
    if (this.kind === 'soldier') {
      // Охраняют автобус.
      if (Math.hypot(this.post.x - this.pos.x, this.post.z - this.pos.z) > 1 && !this.goal) this.goTo(this.post.x, this.post.z, 0, 2);
      this.followPath(dt);
      if (!this.goal) this.faceTarget = 0;
      return;
    }
    // Спецназ: к последнему месту нападающего, по пути — проверяют кабинеты.
    const target = g.threats.find((x) => x.kind === 'intruder' && !x.neutralized) ?? g.threats.find((x) => x.kind === 'intruder');
    if (target) {
      this.repath = (this.repath ?? 0) - dt;
      if (this.repath <= 0 || !this.goal) {
        this.repath = 2.5;
        if (this.distTo(target) > 2.2) this.goTo(target.pos.x, target.pos.z, target.floor, target.neutralized ? 2.2 : 3.2, { near: 1.6, force: true });
      }
      const r = this.followPath(dt);
      if (r === 'door' && this.blockedDoor) { g.doors.damage(this.blockedDoor, 60); this.blockedDoor = null; }
      if (target.neutralized && this.distTo(target) < 2.5 && !target.arrested) {
        target.arrested = true;
        this.say('Чисто! Задержан!', 2.5);
        g.onArrest?.(target, this);
      }
    }
  }

  actFireman(dt) {
    const g = this.game;
    const fire = g.fire;
    if (!fire || !fire.active) { this.stop(); return; }
    if (!this.goal || (this.retarget ?? 0) < g.time) {
      this.retarget = g.time + 3;
      const c = fire.nearestBurning(this.pos.x, this.pos.z, this.floor) ?? fire.nearestBurning(this.pos.x, this.pos.z, 1 - this.floor);
      if (c) { this.fireGoal = c; this.goTo(c.x, c.z, c.floor, 2.6, { near: 2.6, force: true }); }
    }
    const r = this.followPath(dt);
    const c = this.fireGoal;
    if (c && c.floor === this.floor && Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 4.5) {
      this.stop();
      this.faceTarget = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
      this.heading = this.faceTarget;
      this.sprayT -= dt;
      if (this.sprayT <= 0) {
        this.sprayT = 0.08;
        const dir = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
        const p = this.eye(_a);
        g.effects.puff('spray', { x: p.x + dir.x * 0.6, y: p.y - 0.4, z: p.z + dir.z * 0.6 }, { x: dir.x * 7, y: 0.5, z: dir.z * 7 }, 0.9);
      }
      fire.extinguishCone(this.pos.x, this.pos.z, this.floor, this.heading, 6, 0.6, dt * 2.2);
      g.audio?.spray?.(this.pos, dt);
    } else if (r === 'nopath') this.retarget = 0;
  }
}

export function intruderSpawn(game) {
  const exits = EXITS.filter((e) => e.id !== 'gym');
  const e = exits[Math.floor(game.rng.next() * exits.length)];
  const room = ROOM_BY_ID.get(e.room);
  return {
    x: e.out.x + (e.id === 'main' ? 0 : 0), z: e.out.z + (e.id === 'main' ? -6 : 0), exit: e,
    entry: { x: (room.x0 + room.x1) / 2, z: Math.max(room.z0 + 1.5, Math.min(room.z1 - 1, e.id === 'main' ? -6 : (room.z0 + room.z1) / 2)) },
  };
}
