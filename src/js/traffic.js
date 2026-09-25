import { CONFIG } from './config.js';
import { Vehicle } from './vehicle.js';
import { NPC, policeLook } from './npc.js';
import { clamp, wrapAngle } from './utils.js';

// Машины под управлением ИИ.
//   RoadNetwork   — граф перекрёстков (узлы = пересечения осей улиц, world.roadLines).
//   AIDriver      — "водитель": едет по правой полосе от перекрёстка к перекрёстку,
//                   тормозит перед препятствиями, сдаёт назад, если застрял.
//                   Режим 'pursuit' — погоня за игроком (полиция).
//   TrafficManager — держит N машин с водителями вокруг игрока, дальние пересоздаёт.
//
// Движение правостороннее: полоса смещена от оси улицы вправо на laneOffset.
// "Вправо" для направления (dx, dz) — это (-dz, dx), как и везде в проекте.

export class RoadNetwork {
  constructor(world) {
    this.world = world;
    this.lines = world.roadLines;
    this.n = this.lines.length;
  }

  pos([i, j]) {
    return { x: this.lines[i], z: this.lines[j] };
  }

  inBounds([i, j]) {
    return i >= 0 && j >= 0 && i < this.n && j < this.n;
  }

  neighbors([i, j]) {
    return [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter((n) => this.inBounds(n));
  }

  nearest(x, z) {
    const w = this.world;
    const i = clamp(Math.round((x - w.gridMin) / w.blockSize), 0, this.n - 1);
    const j = clamp(Math.round((z - w.gridMin) / w.blockSize), 0, this.n - 1);
    return [i, j];
  }
}

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const dirOf = (a, b) => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];

export class AIDriver {
  constructor(game, vehicle, mode = 'cruise') {
    this.game = game;
    this.vehicle = vehicle;
    this.mode = mode;               // 'cruise' | 'pursuit'
    this.net = game.roads;
    this.prev = null;               // последний пройденный перекрёсток
    this.route = [];                // следующие перекрёстки
    this.cruiseSpeed = CONFIG.traffic.cruiseSpeed * game.rng.range(0.85, 1.15);
    this.stuckTime = 0;
    this.reverseTime = 0;
    this.reverseSteer = 0;
    this.blockedTime = 0;
    this.honkCooldown = 0;
  }

  // Поставить машину на полосу отрезка a -> b (t — доля пути), скорость — speed.
  placeOnSegment(a, b, t, speed = 0) {
    const A = this.net.pos(a), B = this.net.pos(b);
    const [dx, dz] = dirOf(a, b);
    const off = CONFIG.traffic.laneOffset;
    const v = this.vehicle;
    v.position.set(A.x + (B.x - A.x) * t - dz * off, 0, A.z + (B.z - A.z) * t + dx * off);
    v.position.y = this.game.world.getGroundHeight(v.position.x, v.position.z);
    v.heading = Math.atan2(dx, dz);
    v.velocity.set(dx * speed, 0, dz * speed);
    v.updateCircles();
    this.prev = a;
    this.route = [b];
    this._extendRoute();
  }

  // Продолжение маршрута: без разворотов; в погоне — к игроку, иначе случайно (чаще прямо).
  _extendRoute() {
    const rng = this.game.rng;
    while (this.route.length < 3) {
      const last = this.route[this.route.length - 1];
      const before = this.route.length > 1 ? this.route[this.route.length - 2] : this.prev;
      const options = this.net.neighbors(last).filter((n) => !same(n, before));
      if (!options.length) { this.route.push(before); continue; }
      let next;
      if (this.mode === 'pursuit') {
        const goal = this._goalNode();
        const dist = (n) => Math.abs(n[0] - goal[0]) + Math.abs(n[1] - goal[1]);
        next = options.reduce((best, n) => (dist(n) < dist(best) ? n : best), options[0]);
      } else {
        const d = before ? dirOf(before, last) : null;
        const straight = d && options.find((n) => same(dirOf(last, n), d));
        next = straight && rng.chance(0.55) ? straight : rng.pick(options);
      }
      this.route.push(next);
    }
  }

  _goalNode() {
    const p = this.game.player;
    const tp = p.vehicle ? p.vehicle.position : p.position;
    return this.net.nearest(tp.x, tp.z);
  }

  // Точка на полосе, в которую надо въехать на перекрёстке route[0].
  _corner() {
    const node = this.route[0];
    const N = this.net.pos(node);
    const off = CONFIG.traffic.laneOffset;
    const [ix, iz] = dirOf(this.prev, node);
    let x = N.x - iz * off, z = N.z + ix * off;
    let turn = false;
    const next = this.route[1];
    if (next) {
      const [ox, oz] = dirOf(node, next);
      if (ox !== ix || oz !== iz) {
        turn = true;
        x += -oz * off;
        z += ox * off;
      }
    }
    return { x, z, turn };
  }

  replan() {
    this.route.length = 1;
    this._extendRoute();
  }

  drive(dt, c) {
    const T = CONFIG.traffic;
    const v = this.vehicle;
    const speed = v.forwardSpeed;
    this.honkCooldown -= dt;

    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      c.throttle = -0.8;
      c.steer = -this.reverseSteer;
      c.handbrake = false;
      return;
    }

    let tx, tz, desired;
    const chase = this.mode === 'pursuit' ? this._pursuitTarget() : null;
    if (chase) {
      tx = chase.x;
      tz = chase.z;
      desired = chase.speed;
    } else {
      let W = this._corner();
      const passRadius = 3 + Math.abs(speed) * 0.25;
      if (Math.hypot(W.x - v.position.x, W.z - v.position.z) < passRadius) {
        this.prev = this.route.shift();
        if (this.mode === 'pursuit') this.route.length = Math.min(this.route.length, 1);
        this._extendRoute();
        W = this._corner();
      }
      // Целимся не в далёкий перекрёсток, а в точку на своей полосе в L метрах впереди —
      // так машина быстро возвращается в полосу после поворота или объезда.
      const [ix, iz] = dirOf(this.prev, this.route[0]);
      const along = (W.x - v.position.x) * ix + (W.z - v.position.z) * iz;
      const L = 6 + Math.max(0, speed) * 0.5;
      tx = along > L ? W.x - ix * (along - L) : W.x;
      tz = along > L ? W.z - iz * (along - L) : W.z;
      const d = Math.hypot(W.x - v.position.x, W.z - v.position.z);
      desired = this.mode === 'pursuit' ? T.pursuitSpeed : this.cruiseSpeed;
      if (W.turn && d < 24) desired = Math.min(desired, this.mode === 'pursuit' ? 9 : T.turnSpeed);
    }

    const ang = wrapAngle(Math.atan2(tx - v.position.x, tz - v.position.z) - v.heading);
    c.steer = clamp(ang * 2.2, -1, 1);

    // Препятствие впереди — сбрасываем скорость (в погоне таранить игрока можно).
    const obstacle = this._obstacleAhead(chase);
    if (obstacle) {
      desired = Math.min(desired, Math.max(0, (obstacle.dist - 4.5) * 0.9));
      this.blockedTime += dt;
      if (obstacle.who === this.game.player && this.blockedTime > 1.5 && this.honkCooldown <= 0) {
        this.honkCooldown = 4;
        this.game.hud?.say(v, 'Би-бип!');
      }
    } else {
      this.blockedTime = 0;
    }

    if (desired < 0.3) {
      c.throttle = speed > 0.5 ? -1 : 0;
      c.handbrake = speed <= 0.5;
    } else {
      c.handbrake = false;
      const err = desired - speed;
      c.throttle = err > 0 ? clamp(err * 0.4, 0.2, 1) : clamp(err * 0.35, -1, 0);
      if (Math.abs(ang) > 0.9 && speed > 8) c.throttle = -0.6; // крутой поворот — притормозить
    }

    // Застряли (упёрлись в стену/машину) — сдать назад с обратным рулём.
    if (c.throttle > 0.3 && Math.abs(speed) < 0.6) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.5) {
        this.stuckTime = 0;
        this.reverseTime = 1.3;
        this.reverseSteer = c.steer || 1;
      }
    } else {
      this.stuckTime = Math.max(0, this.stuckTime - dt);
    }
  }

  // Погоня: если игрок близко и в прямой видимости — едем прямо к нему.
  _pursuitTarget() {
    const p = this.game.player;
    const tp = p.vehicle ? p.vehicle.position : p.position;
    const v = this.vehicle;
    const d = Math.hypot(tp.x - v.position.x, tp.z - v.position.z);
    if (d > 45 || !this._lineOfSight(tp)) return null;
    const lead = p.vehicle ? 0.6 : 0;
    const vel = p.vehicle ? p.vehicle.velocity : p.velocity;
    const speed = p.vehicle ? (d < 10 ? 12 : CONFIG.traffic.pursuitSpeed) : d < 14 ? 0 : 14;
    return { x: tp.x + vel.x * lead, z: tp.z + vel.z * lead, speed };
  }

  _lineOfSight(tp) {
    const v = this.vehicle.position;
    for (let k = 1; k < 8; k++) {
      const t = k / 8;
      if (this.game.world.isPointInsideBuilding(v.x + (tp.x - v.x) * t, 1, v.z + (tp.z - v.z) * t)) return false;
    }
    return true;
  }

  // Ближайшее препятствие в коридоре перед машиной: { dist, who } или null.
  _obstacleAhead(chase) {
    const v = this.vehicle;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const look = 6 + Math.max(0, v.forwardSpeed) * 1.1;
    const player = this.game.player;
    let best = null;
    const test = (x, z, halfWidth, who) => {
      const dx = x - v.position.x, dz = z - v.position.z;
      const f = dx * fx + dz * fz;
      if (f < 0 || f > look) return;
      const side = Math.abs(dx * -fz + dz * fx);
      if (side > halfWidth) return;
      if (!best || f < best.dist) best = { dist: f, who };
    };
    for (const o of this.game.vehicles) {
      if (o === v) continue;
      if (chase && o === player.vehicle) continue; // полиция таранит
      for (const c of o.circles) test(c.x, c.z, 1.9, o);
    }
    if (!player.vehicle && !player.isDead && !(chase && this.mode === 'pursuit')) {
      test(player.position.x, player.position.z, 1.4, player);
    }
    for (const n of this.game.npcs.list) {
      // Тела не останавливают машины (рэгдолл сам отталкивается кузовом).
      if (!n.vehicle && !n.isDead && n.model.root.visible) test(n.position.x, n.position.z, 1.3, n);
    }
    return best;
  }
}

export class TrafficManager {
  constructor(game) {
    this.game = game;
    this.cars = [];   // { vehicle, driver } — управляемый трафик
    this._timer = 0;
  }

  // Создать машину с ИИ-водителем на дороге в кольце minR..maxR от игрока.
  createAICar({ police = false, mode = 'cruise', minR = CONFIG.traffic.spawnMin, maxR = CONFIG.traffic.spawnMax } = {}) {
    const { game } = this;
    const { rng, roads, camera } = game;
    const p = game.player.position;
    const camDir = camera.getWorldDirection(camera.position.clone());
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = [rng.int(0, roads.n - 1), rng.int(0, roads.n - 1)];
      const b = rng.pick(roads.neighbors(a));
      const t = rng.range(0.25, 0.75);
      const A = roads.pos(a), B = roads.pos(b);
      const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < minR || d > maxR) continue;
      if (d < 120 && ((x - p.x) * camDir.x + (z - p.z) * camDir.z) / d > 0.3 && attempt < 24) continue; // не на глазах
      if (game.vehicles.some((o) => o.position.distanceToSquared({ x, y: 0, z }) < 100)) continue;

      const color = rng.pick(CONFIG.traffic.colors);
      const vehicle = new Vehicle(game, { x, z, color, police });
      const ai = new AIDriver(game, vehicle, mode);
      ai.placeOnSegment(a, b, t, mode === 'pursuit' ? 10 : 6);
      const driver = new NPC(game, rng, {
        x, z, role: police ? 'police' : 'civilian', look: police ? policeLook(rng) : undefined,
      });
      game.npcs.add(driver);
      driver.enterVehicle(vehicle);
      vehicle.ai = ai;
      vehicle.sirenOn = police;
      game.addVehicle(vehicle);
      return { vehicle, driver };
    }
    return null;
  }

  removeCar(vehicle) {
    if (vehicle.driver && vehicle.driver !== this.game.player) this.game.npcs.remove(vehicle.driver);
    this.game.removeVehicle(vehicle);
  }

  update(dt) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.5;
    const T = CONFIG.traffic;
    const { game } = this;
    const p = game.player.position;

    // Угнанные/брошенные машины больше не трафик.
    this.cars = this.cars.filter((c) => !c.vehicle.removed && c.vehicle.ai && c.vehicle.driver === c.driver);

    for (const c of [...this.cars]) {
      if (c.vehicle.position.distanceTo(p) > T.despawnDistance) {
        this.removeCar(c.vehicle);
        this.cars.splice(this.cars.indexOf(c), 1);
      }
    }
    // Брошенные машины (не стартовые) далеко от игрока убираем.
    for (const v of [...game.vehicles]) {
      if (v.persistent || v.driver || v.ai) continue;
      if (v.position.distanceTo(p) > T.despawnDistance + 60) game.removeVehicle(v);
    }

    if (this.cars.length < T.count) {
      const car = this.createAICar();
      if (car) this.cars.push(car);
    }
  }
}
