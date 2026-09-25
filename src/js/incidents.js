import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NPC, NPC_STATE, LINES, randomCivilianLook, policeLook } from './npc.js';
import { randomCarType } from './traffic.js';
import { Vehicle } from './vehicle.js';

// Случайные происшествия в городе — происходят сами, без участия игрока (он может вмешаться):
//   fight   — драка двух прохожих, вокруг собираются зеваки;
//   mugging — грабитель с пистолетом отнимает кошелёк и убегает, приезжает полиция;
//   crash   — авария: две машины у бордюра, водители ругаются (иногда дерутся), полиция;
//   chase   — полицейская погоня за угонщиком (машины с мигалками проносятся мимо).
// Плюс полиция сама выезжает на стрельбу банд (weapon:fired от бандитов рядом с игроком).
// Режиссёр запускает новое происшествие раз в CONFIG.incidents.every секунд (не больше
// maxActive одновременно), в 40..150 м от игрока — чтобы его было видно или слышно.
// Каждое происшествие — объект с update(dt) → true, когда закончилось; пишет в ленту (hud.news).

const TYPES = [['fight', 0.28], ['mugging', 0.24], ['crash', 0.22], ['chase', 0.26]];

export class IncidentDirector {
  constructor(game) {
    this.game = game;
    this.active = [];
    this.units = [];        // выезды полиции: { vehicle, cops, target, deployed, time }
    this.timer = game.rng.range(12, 20);
    this.policeCooldown = 0;
    this.stats = { started: {} };

    // Полиция выезжает на стрельбу банд рядом с игроком.
    game.events.on('weapon:fired', ({ shooter, position }) => {
      if (!shooter || shooter.role !== 'gang' || shooter.follower || this.policeCooldown > 0) return;
      if (position.distanceTo(game.player.position) > 170) return;
      this.policeCooldown = CONFIG.incidents.policeCooldown;
      if (this.dispatchPolice(position, shooter)) game.hud.news('Полиция выехала на стрельбу', '#4f8dff');
    });
  }

  // --- Полиция ---------------------------------------------------------------------

  // Патрульная машина едет к цели (NPC или точке) и высаживает полицейских.
  dispatchPolice(point, target = null) {
    const { game } = this;
    const car = game.traffic.createAICar({ police: true, mode: 'pursuit', near: point, minR: 70, maxR: 160 });
    if (!car) return null;
    car.vehicle.ai.target = target ?? { position: new THREE.Vector3(point.x, 0, point.z) };
    car.vehicle.sirenOn = true;
    const unit = { vehicle: car.vehicle, driver: car.driver, cops: [car.driver], target, point, deployed: false, time: 0 };
    this.units.push(unit);
    return unit;
  }

  _deploy(unit) {
    const { game } = this;
    const v = unit.vehicle;
    unit.deployed = true;
    v.ai = null;
    v.sirenOn = true;
    if (unit.driver.vehicle === v) unit.driver.exitVehicle();
    const door = v.localToWorld2D(-1.7, -0.1);
    if (game.world.isCircleFree(door.x, door.z, 0.4)) {
      unit.cops.push(game.npcs.add(new NPC(game, game.rng, { x: door.x, z: door.z, role: 'police', look: policeLook(game.rng), weapon: 'pistol' })));
    }
    const t = unit.target;
    for (const cop of unit.cops) {
      cop.dest = null;
      if (t && !t.isDead && !t.removed && t.model) cop.aggro(t, game.rng.pick(LINES.police));
      else {
        cop.idleTime = game.rng.range(15, 30);
        cop.activity = game.rng.chance(0.5) ? 'phone' : null;
        cop._enter(NPC_STATE.IDLE);
      }
    }
  }

  _updateUnits(dt) {
    const { game } = this;
    const p = game.player.position;
    for (const u of [...this.units]) {
      u.time += dt;
      const v = u.vehicle;
      if (!u.deployed) {
        if (v.removed || !v.ai) { this.units.splice(this.units.indexOf(u), 1); continue; }
        const t = u.target;
        const tp = t && !t.isDead && !t.removed ? (t.vehicle ? t.vehicle.position : t.position) : u.point;
        if (t && (t.isDead || t.removed)) v.ai.target = { position: new THREE.Vector3(u.point.x, 0, u.point.z) };
        const d = Math.hypot(tp.x - v.position.x, tp.z - v.position.z);
        // В погоне за машиной высаживает сама погоня (_startChase), здесь — только к пешим целям.
        if (!t?.vehicle && ((d < 18 && Math.abs(v.speed) < 5) || u.time > 50)) this._deploy(u);
        continue;
      }
      // Полиция уезжает из поля зрения — убираем.
      const alive = u.cops.filter((c) => !c.removed && !c.isDead);
      const far = (o) => o.position.distanceTo(p) > 200 && !game.inView(o.position.x, 1, o.position.z, 2);
      if (u.time > 90 && alive.every(far) && (v.removed || far(v))) {
        for (const c of alive) game.npcs.remove(c);
        if (!v.removed && v.driver !== game.player) game.removeVehicle(v);
        this.units.splice(this.units.indexOf(u), 1);
      }
    }
  }

  // --- Помощники ---------------------------------------------------------------------

  // Прохожий в кольце minR..maxR от игрока, который сейчас просто гуляет.
  _civilian(minR, maxR, except = null) {
    const p = this.game.player.position;
    const list = this.game.npcs.list.filter((n) => n.role === 'civilian' && !n.vehicle && !n.isDead &&
      n !== except && !n.incident && (n.state === NPC_STATE.WALK || n.state === NPC_STATE.IDLE) && n.panic <= 0 &&
      Math.hypot(n.position.x - p.x, n.position.z - p.z) > minR && Math.hypot(n.position.x - p.x, n.position.z - p.z) < maxR);
    return list.length ? this.game.rng.pick(list) : null;
  }

  _spawnCivilianNear(x, z, r, look) {
    const spot = this.game.npcs.randomSidewalkSpot(x, z, 2, Math.max(r, 30), false);
    if (!spot) return null;
    return this.game.npcs.add(new NPC(this.game, this.game.rng, { ...spot, role: 'civilian', look }));
  }

  _news(text, pos, color) {
    if (!pos || pos.distanceTo(this.game.player.position) < 190) this.game.hud.news(text, color);
  }

  // --- Происшествия --------------------------------------------------------------------

  _startFight() {
    const { game } = this;
    const a = this._civilian(25, 110);
    if (!a) return null;
    let b = game.npcs.list.find((n) => n !== a && n.role === 'civilian' && !n.incident && !n.vehicle && !n.isDead &&
      n.position.distanceTo(a.position) < 14);
    b ??= this._spawnCivilianNear(a.position.x, a.position.z, 10);
    if (!b) return null;
    for (const n of [a, b]) { n.brawler = true; n.incident = true; }
    a.aggro(b, game.rng.pick(LINES.brawl));
    b.aggro(a, game.rng.pick(LINES.brawl));
    // Зеваки.
    const mid = a.position.clone().add(b.position).multiplyScalar(0.5);
    const watchers = game.npcs.list.filter((n) => n.role === 'civilian' && n !== a && n !== b && !n.incident && !n.vehicle &&
      !n.isDead && n.position.distanceTo(mid) < 22 && (n.state === NPC_STATE.WALK || n.state === NPC_STATE.IDLE)).slice(0, 4);
    watchers.forEach((w, k) => {
      const ang = (k / Math.max(1, watchers.length)) * Math.PI * 2 + 0.7;
      w.incident = true;
      w.goTo(mid.x + Math.sin(ang) * 4.5, mid.z + Math.cos(ang) * 4.5, 14, { x: mid.x, z: mid.z });
      w.watching = true;
    });
    this._news('Драка на улице', mid, '#ffb347');
    let t = 0;
    return {
      type: 'fight', pos: mid,
      update: (dt) => {
        t += dt;
        for (const w of watchers) {
          if (w.state === NPC_STATE.IDLE && w.watching) {
            w.activity = 'cheer';
            if (w.talkCooldown <= 0 && game.rng.chance(dt * 0.3)) w.say(game.rng.pick(LINES.cheer));
          }
        }
        const over = t > 25 || a.isDead || b.isDead || a.removed || b.removed ||
          (t > 5 && a.state !== NPC_STATE.FIGHT && b.state !== NPC_STATE.FIGHT);
        if (!over) return false;
        for (const n of [a, b, ...watchers]) {
          n.brawler = false;
          n.incident = false;
          n.watching = false;
          if (n.activity === 'cheer') n.activity = null;
          if (!n.isDead && n.state === NPC_STATE.FIGHT) n.dropTarget();
        }
        const loser = a.health < b.health ? a : b;
        if (!loser.isDead) loser.panic = 6;
        return true;
      },
    };
  }

  _startMugging() {
    const { game } = this;
    const victim = this._civilian(25, 100);
    if (!victim) return null;
    const look = { ...randomCivilianLook(game.rng), shirt: '#1d1d1f', pants: '#232323', hat: '#111111' };
    const robber = this._spawnCivilianNear(victim.position.x, victim.position.z, 14, look);
    if (!robber) return null;
    robber.gun = null;
    robber.incident = victim.incident = true;
    robber.menace = 'pistol';
    robber.say(game.rng.pick(LINES.mugger), true);
    robber.goTo(victim.position.x + 1.2, victim.position.z + 1.2, 6, victim.position);
    victim.idleTime = 8;
    victim.activity = 'hands';
    victim._enter(NPC_STATE.IDLE);
    this._news('Уличное ограбление', victim.position, '#ff6b6b');
    let t = 0, fled = false, unit = null;
    return {
      type: 'mugging', pos: victim.position,
      update: (dt) => {
        t += dt;
        if (!fled && victim.state === NPC_STATE.IDLE) {
          victim.heading = Math.atan2(robber.position.x - victim.position.x, robber.position.z - victim.position.z);
        }
        if (!fled && (t > 5 || robber.isDead || robber.isDown)) {
          fled = true;
          robber.menace = null;
          victim.activity = null;
          if (!victim.isDead) {
            victim.panic = 8;
            victim._enter(NPC_STATE.WALK);
            victim.say(game.rng.pick(LINES.mugged), true);
          }
          if (!robber.isDead && !robber.isDown) {
            robber.panic = 25;
            robber.walkSpeed = 4.8;
            robber._enter(NPC_STATE.WALK);
            unit = this.dispatchPolice(robber.position, robber);
          }
        }
        const done = t > 45 || robber.removed || robber.isDead || (fled && !unit && t > 25);
        if (done) {
          robber.incident = victim.incident = false;
          robber.menace = null;
          if (robber.isDead) this._news('Грабитель остановлен', robber.position, '#7dff7a');
        }
        return done;
      },
    };
  }

  _startCrash() {
    const { game } = this;
    const spot = game.traffic.curbSpot(game.player.position, 60, 150);
    if (!spot) return null;
    const fx = Math.sin(spot.heading), fz = Math.cos(spot.heading);
    // Вторая машина въехала сзади под углом.
    const a = game.addVehicle(new Vehicle(game, { x: spot.x, z: spot.z, heading: spot.heading + 0.25, color: game.rng.pick(CONFIG.traffic.colors), type: randomCarType(game.rng) }));
    const b = game.addVehicle(new Vehicle(game, {
      x: spot.x - fx * 4.4 + fz * 0.8, z: spot.z - fz * 4.4 - fx * 0.8, heading: spot.heading - 0.35,
      color: game.rng.pick(CONFIG.traffic.colors), type: randomCarType(game.rng),
    }));
    for (const v of [a, b]) { v.parked = true; v.crashed = true; }
    const pos = new THREE.Vector3(spot.x - fx * 2.2, 0.8, spot.z - fz * 2.2);
    const da = this._spawnCivilianNear(pos.x, pos.z, 12), db = this._spawnCivilianNear(pos.x, pos.z, 12);
    if (!da || !db) return null;
    const side = Math.atan2(fz, -fx);
    const cx = pos.x + Math.sin(side) * 3.2, cz = pos.z + Math.cos(side) * 3.2; // на тротуаре рядом
    da.incident = db.incident = true;
    da.startTalk(db, cx, cz, 0.3, 40);
    db.startTalk(da, cx, cz, 0.3 + Math.PI, 40);
    const brawl = game.rng.chance(0.3);
    this._news('Авария', pos, '#ffd54a');
    let t = 0, police = false;
    return {
      type: 'crash', pos,
      update: (dt) => {
        t += dt;
        if (game.rng.chance(dt * 6) && pos.distanceTo(game.player.position) < 120) {
          game.effects.burst(pos, new THREE.Vector3(0, 0.8, 0), game.rng.chance(0.3) ? 'spark' : 'dust', 2);
        }
        for (const d of [da, db]) {
          if (d.state === NPC_STATE.TALK && d.talkCooldown <= 0 && game.rng.chance(dt * 0.4)) d.say(game.rng.pick(LINES.crash));
        }
        if (brawl && t > 8 && da.state === NPC_STATE.TALK) {
          da.brawler = db.brawler = true;
          da.aggro(db, game.rng.pick(LINES.brawl));
          db.aggro(da);
        }
        if (!police && t > 12) {
          police = true;
          this.dispatchPolice(pos, null);
        }
        if (t < 60) return false;
        for (const d of [da, db]) {
          d.incident = false;
          d.brawler = false;
          if (d.state === NPC_STATE.FIGHT) d.dropTarget();
        }
        // Разбитые машины остаются у бордюра (их уберёт трафик, когда игрок уйдёт).
        game.traffic.parked.push(a, b);
        return true;
      },
    };
  }

  _startChase() {
    const { game } = this;
    const thief = game.traffic.createAICar({ mode: 'flee', minR: 70, maxR: 150, type: game.rng.pick(['sports', 'sedan', 'pickup']) });
    if (!thief) return null;
    thief.driver.incident = true;
    const units = [];
    for (let k = 0; k < game.rng.int(1, 2); k++) {
      const u = this.dispatchPolice(thief.vehicle.position, thief.driver);
      if (u) units.push(u);
    }
    if (!units.length) {
      game.traffic.cars.push(thief);
      return null;
    }
    this._news('Полицейская погоня!', null, '#4f8dff');
    let t = 0, caught = false;
    return {
      type: 'chase', pos: thief.vehicle.position,
      update: (dt) => {
        t += dt;
        const v = thief.vehicle;
        if (v.removed || thief.driver.removed) return true;
        // Догнали: беглец застрял рядом с полицией — выходит, полиция его берёт.
        const close = units.some((u) => !u.vehicle.removed && u.vehicle.position.distanceTo(v.position) < 12);
        if (!caught && close && Math.abs(v.speed) < 2 && t > 8) {
          caught = true;
          if (thief.driver.vehicle === v) thief.driver.exitVehicle();
          thief.driver.panic = 20;
          thief.driver.walkSpeed = 4.5;
          for (const u of units) if (!u.deployed) this._deploy(u);
          this._news('Угонщик задержан', v.position, '#4f8dff');
        }
        if (t > 80 || caught) {
          if (!caught && v.ai) {
            v.ai.mode = 'cruise';
            game.traffic.cars.push(thief);
          }
          for (const u of units) {
            if (!u.deployed && u.vehicle.ai) {
              u.vehicle.ai.mode = 'cruise';
              u.vehicle.sirenOn = false;
            }
          }
          thief.driver.incident = false;
          return true;
        }
        return false;
      },
    };
  }

  _start(type) {
    const make = { fight: () => this._startFight(), mugging: () => this._startMugging(), crash: () => this._startCrash(), chase: () => this._startChase() }[type];
    const inc = make?.();
    if (!inc) return null;
    this.stats.started[type] = (this.stats.started[type] ?? 0) + 1;
    this.active.push(inc);
    this.game.events.emit('incident:start', { type });
    return inc;
  }

  update(dt) {
    const I = CONFIG.incidents;
    this.policeCooldown = Math.max(0, this.policeCooldown - dt);
    for (const inc of [...this.active]) {
      if (inc.update(dt)) this.active.splice(this.active.indexOf(inc), 1);
    }
    this._updateUnits(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.game.rng.range(I.every[0], I.every[1]);
    if (this.active.length >= I.maxActive || this.game.player.isDead) return;
    let r = this.game.rng.next();
    for (const [type, w] of TYPES) {
      if ((r -= w) < 0) {
        this._start(type);
        break;
      }
    }
  }
}
