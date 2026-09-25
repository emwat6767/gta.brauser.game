import { CONFIG } from './config.js';
import { NPC, LINES, policeLook } from './npc.js';

// Уровень розыска (0-5 звёзд) и полиция.
// Преступления приходят событиями: 'character:damaged', 'character:killed',
// 'vehicle:carjack'. Звёзды = floor(heat).
//   1-2 звезды — пешие полицейские догоняют и задерживают (АРЕСТОВАН),
//                водителя вытаскивают из медленной машины;
//   3+ звёзды  — полиция бьёт;
//   2+ звёзды  — патрульные машины с мигалками преследуют игрока и высаживают полицейских.
// Без новых преступлений и без полиции рядом звёзды постепенно гаснут.

export class WantedSystem {
  constructor(game) {
    this.game = game;
    this.heat = 0;
    this.level = 0;
    this.calm = 0;
    this.cops = [];     // пешие полицейские (NPC role 'police')
    this.cars = [];     // { vehicle, driver, deployed }
    this.spawnTimer = 0;
    this.bustTimer = 0;

    const byPlayer = (a) => {
      const p = game.player;
      return a && (a === p || a.driver === p || a === p.vehicle);
    };
    game.events.on('character:damaged', ({ target, attacker, kind }) => {
      if (!byPlayer(attacker) || target === game.player) return;
      if (target.role === 'police') this.addHeat(1, 2);
      else if (target.role === 'civilian') this.addHeat(kind === 'vehicle' ? 0.5 : 0.25);
      else this.addHeat(0.05);
    });
    game.events.on('character:killed', ({ target, attacker }) => {
      if (!byPlayer(attacker)) return;
      if (target.role === 'police') this.addHeat(1.5, 3);
      else if (target.role === 'civilian') this.addHeat(1, 1);
      else this.addHeat(0.35);
    });
    game.events.on('vehicle:carjack', ({ by, vehicle }) => {
      if (by === game.player) this.addHeat(vehicle.police ? 2 : 0.6, vehicle.police ? 2 : 0);
    });
  }

  addHeat(amount, minLevel = 0) {
    if (this.game.player.isDead) return;
    this.heat = Math.min(5.99, Math.max(this.heat + amount, minLevel));
    this.calm = 0;
    this._setLevel(Math.floor(this.heat));
  }

  _setLevel(level) {
    if (level === this.level) return;
    const up = level > this.level;
    this.level = level;
    this.game.events.emit('wanted:changed', { level, up });
    if (level === 0) this._standDown();
  }

  // Полиция прекращает погоню (но остаётся в мире, пока игрок рядом).
  _standDown() {
    for (const cop of this.cops) if (cop.target === this.game.player) cop.dropTarget();
    for (const car of this.cars) {
      car.vehicle.sirenOn = false;
      if (car.vehicle.ai) car.vehicle.ai.mode = 'cruise';
    }
  }

  // Сброс после смерти/ареста: полиция исчезает.
  clear() {
    this.heat = 0;
    this.calm = 0;
    this.bustTimer = 0;
    this._setLevel(0);
    for (const cop of this.cops) this.game.npcs.remove(cop);
    for (const car of this.cars) {
      if (car.vehicle.driver && car.vehicle.driver !== this.game.player) this.game.npcs.remove(car.vehicle.driver);
      if (car.vehicle.driver !== this.game.player) this.game.removeVehicle(car.vehicle);
    }
    this.cops = [];
    this.cars = [];
  }

  _spawnFootCop() {
    const { game } = this;
    const p = game.player.position;
    const spot = game.npcs.randomSidewalkSpot(p.x, p.z, 40, 75, true);
    if (!spot) return;
    const cop = new NPC(game, game.rng, { ...spot, role: 'police', look: policeLook(game.rng) });
    game.npcs.add(cop);
    cop.aggro(game.player, game.rng.pick(LINES.police));
    this.cops.push(cop);
  }

  _spawnCar() {
    const car = this.game.traffic.createAICar({ police: true, mode: 'pursuit', minR: 90, maxR: 160 });
    if (car) this.cars.push({ ...car, deployed: false });
  }

  // Патрульная машина подъехала: водитель и напарник выходят и бегут к игроку.
  _deploy(car) {
    const { game } = this;
    car.deployed = true;
    const driver = car.vehicle.driver;
    if (driver && driver !== game.player) {
      driver.exitVehicle();
      driver.aggro(game.player, game.rng.pick(LINES.police));
      this.cops.push(driver);
    }
    const door = car.vehicle.localToWorld2D(-1.7, -0.1);
    if (game.world.isCircleFree(door.x, door.z, 0.4)) {
      const partner = new NPC(game, game.rng, { x: door.x, z: door.z, role: 'police', look: policeLook(game.rng) });
      game.npcs.add(partner);
      partner.aggro(game.player);
      this.cops.push(partner);
    }
  }

  update(dt) {
    const W = CONFIG.wanted;
    const { game } = this;
    const player = game.player;
    const p = player.vehicle ? player.vehicle.position : player.position;

    this.cops = this.cops.filter((c) => !c.removed);
    this.cars = this.cars.filter((c) => !c.vehicle.removed);

    // Уборка: далеко отставшие/погибшие полицейские и машины.
    for (const cop of this.cops) {
      const d = cop.position.distanceTo(p);
      if (d > (this.level ? 150 : 90) || (cop.isDead && d > 40 && cop.stateTime > 10)) game.npcs.remove(cop);
    }
    for (const car of this.cars) {
      const v = car.vehicle;
      if (v.driver === player) continue;
      if (v.position.distanceTo(p) > (this.level ? 260 : 120)) {
        if (v.driver) game.npcs.remove(v.driver);
        game.removeVehicle(v);
      }
    }
    if (this.level === 0 || player.isDead) return;

    // Затухание розыска.
    this.calm += dt;
    const copNear = this.cops.some((c) => !c.isDown && c.position.distanceTo(p) < 35);
    if (this.calm > W.calmTime + 4 * this.level && !copNear) {
      this.calm = 0;
      this.heat = this.level - 1;
      this._setLevel(this.level - 1);
      if (this.level === 0) return;
    }

    // Пополнение полиции.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = W.spawnInterval;
      const footTarget = Math.min(W.maxFootCops, this.level * 2);
      const carTarget = this.level >= 2 ? Math.min(W.maxCars, this.level - 1) : 0;
      const activeCars = this.cars.filter((c) => !c.deployed).length;
      // Машины — независимо от пеших: от едущего игрока пешком не угонишься.
      if (activeCars < carTarget) this._spawnCar();
      const onFoot = !player.vehicle || Math.abs(player.vehicle.speed) < 6;
      if (onFoot && this.cops.filter((c) => !c.isDead).length < footTarget) this._spawnFootCop();
    }

    // Все полицейские охотятся за игроком.
    for (const cop of this.cops) {
      if (!cop.isBusy && !cop.isDead) cop.aggro(player);
    }

    // Машины: включить погоню, высадить полицию рядом с игроком.
    for (const car of this.cars) {
      if (car.deployed || !car.vehicle.ai) continue;
      car.vehicle.sirenOn = true;
      car.vehicle.ai.mode = 'pursuit';
      const slow = !player.vehicle || Math.abs(player.vehicle.speed) < 3;
      if (slow && Math.abs(car.vehicle.speed) < 4 && car.vehicle.position.distanceTo(p) < 16) this._deploy(car);
    }

    // Задержание и вытаскивание из машины.
    let grab = null;
    for (const cop of this.cops) {
      if (cop.isDown || cop.isDead) continue;
      if (player.vehicle) {
        if (Math.abs(player.vehicle.speed) < 1.5 && player.vehicle.distanceToPoint(cop.position.x, cop.position.z) < 1.2) {
          cop.say('Из машины, живо!', true);
          player.exitVehicle();
          player.stun(1);
          break;
        }
      } else if (cop.position.distanceTo(player.position) < 1.4) {
        grab = cop;
      }
    }
    if (grab && this.level < W.policeDamageFrom && !player.vehicle) {
      this.bustTimer += dt;
      if (this.bustTimer > W.bustTime) {
        this.bustTimer = 0;
        game.bustPlayer();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
    }
  }
}
