import { CONFIG } from './config.js';
import { Vehicle } from './vehicle.js';
import { NPC, NPC_STATE, policeLook } from './npc.js';
import { clamp, wrapAngle } from './utils.js';

// Машины под управлением ИИ.
//   RoadNetwork   — граф перекрёстков (узлы = пересечения осей улиц, world.roadLines).
//   AIDriver      — "водитель": едет по правой полосе от перекрёстка к перекрёстку,
//                   стоит на красный свет (lights.js), тормозит перед препятствиями,
//                   сдаёт назад, если застрял. Режимы:
//                     'cruise'  — спокойная езда по городу;
//                     'pursuit' — погоня за target (по умолчанию игрок): полиция, бандиты;
//                     'flee'    — удирает на скорости, светофоры не замечает;
//                     'park'    — прижимается к бордюру и останавливается (водитель выходит).
//   TrafficManager — держит N машин с водителями вокруг игрока (появляются и исчезают
//                   вне поля зрения), припаркованные машины у бордюров (parked), в которые
//                   садятся прохожие, и редкие парковки машин из потока.
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
    this.mode = mode;               // 'cruise' | 'pursuit' | 'flee' | 'park'
    this.target = null;             // за кем погоня (null — игрок)
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

  // Встать на дорожный граф там, где машина уже стоит (например, отъезжает от бордюра):
  // ближайшая ось улицы, направление — по курсу машины.
  attachToRoad() {
    const v = this.vehicle;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const [ni, nj] = this.net.nearest(v.position.x, v.position.z);
    const alongX = Math.abs(fx) > Math.abs(fz);
    const w = this.game.world;
    let a, b;
    if (alongX) {
      const i0 = clamp(Math.floor((v.position.x - w.gridMin) / w.blockSize), 0, this.net.n - 2);
      a = fx > 0 ? [i0, nj] : [i0 + 1, nj];
      b = fx > 0 ? [i0 + 1, nj] : [i0, nj];
    } else {
      const j0 = clamp(Math.floor((v.position.z - w.gridMin) / w.blockSize), 0, this.net.n - 2);
      a = fz > 0 ? [ni, j0] : [ni, j0 + 1];
      b = fz > 0 ? [ni, j0 + 1] : [ni, j0];
    }
    this.prev = a;
    this.route = [b];
    this._extendRoute();
  }

  // Продолжение маршрута: без разворотов; в погоне — к цели, иначе случайно (чаще прямо).
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

  _targetPos() {
    const t = this.target ?? this.game.player;
    return t.vehicle ? t.vehicle.position : t.position;
  }

  _goalNode() {
    const tp = this._targetPos();
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
    this.atLight = false;
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
      const fast = this.mode === 'pursuit' || this.mode === 'flee';
      desired = this.mode === 'pursuit' ? T.pursuitSpeed : this.mode === 'flee' ? T.fleeSpeed : this.cruiseSpeed;
      if (W.turn && d < 24) desired = Math.min(desired, fast ? 9 : T.turnSpeed);
      // Светофор: на жёлтый/красный останавливаемся у стоп-линии (погоня и беглецы — нет).
      const lights = this.game.lights;
      if (lights && !fast && this.mode !== 'park') {
        const N = this.net.pos(this.route[0]);
        const toNode = (N.x - v.position.x) * ix + (N.z - v.position.z) * iz;
        const stop = this.game.world.roadHalf + 3;
        if (toNode > stop - 1.5 && toNode < stop + 30) {
          const sig = lights.state(lights.nodeIndex(this.route[0]), ix !== 0 ? 'x' : 'z');
          if (sig === 'red' || (sig === 'yellow' && toNode - stop > Math.max(0, speed) * 0.9)) {
            desired = Math.min(desired, Math.max(0, (toNode - stop) * 0.7));
            this.atLight = true;
          }
        }
      }
      // Парковка: съезжаем к бордюру в нескольких метрах впереди и встаём.
      if (this.mode === 'park') {
        // Цель — точка у бордюра впереди; едем медленно, пока не прижмёмся, потом встаём.
        const w = this.game.world;
        const N = this.net.pos(this.route[0]);
        const curb = w.roadHalf - 1.4;
        const lateral = ix !== 0 ? (v.position.z - N.z) * ix : -(v.position.x - N.x) * iz; // от оси улицы вправо
        tx = v.position.x + ix * 9 - iz * (curb - lateral);
        tz = v.position.z + iz * 9 + ix * (curb - lateral);
        this.parkTime = (this.parkTime ?? 0) + dt;
        desired = lateral < curb - 0.6 && this.parkTime < 10 ? 4 : 0;
        if (desired === 0 && Math.abs(speed) < 0.4) this.parked = true;
      }
    }

    const ang = wrapAngle(Math.atan2(tx - v.position.x, tz - v.position.z) - v.heading);
    c.steer = clamp(ang * 2.2, -1, 1);

    // Препятствие впереди — сбрасываем скорость (в погоне таранить игрока можно).
    const obstacle = this._obstacleAhead(chase);
    if (obstacle) {
      desired = Math.min(desired, Math.max(0, (obstacle.dist - 4.5) * 0.9));
      this.blockedTime += dt;
      // Сигналит тому, кто загородил дорогу (не на светофоре).
      const nearPlayer = v.position.distanceToSquared(this.game.player.position) < 60 * 60;
      if (nearPlayer && this.honkCooldown <= 0 && (obstacle.who === this.game.player ? this.blockedTime > 1.5
        : this.blockedTime > 6 && !obstacle.who?.ai?.atLight && this.game.rng.chance(dt * 0.15))) {
        this.honkCooldown = 12;
        this.game.hud?.say(v, 'Би-бип!');
      }
    } else {
      this.blockedTime = 0;
    }
    // Долго стоим за чужой машиной не у светофора (затор, "пробка" на перекрёстке) —
    // пробуем сдать назад и объехать.
    if (obstacle && !this.atLight && this.blockedTime > 12 && !chase) {
      this.blockedTime = 0;
      this.reverseTime = 1.6;
      this.reverseSteer = this.game.rng.chance(0.5) ? 1 : -1;
      this.stuckTotal = (this.stuckTotal ?? 0) + 1;
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

  // Погоня: если цель близко и в прямой видимости — едем прямо к ней.
  _pursuitTarget() {
    const p = this.target ?? this.game.player;
    const tp = this._targetPos();
    const v = this.vehicle;
    const d = Math.hypot(tp.x - v.position.x, tp.z - v.position.z);
    if (d > 45 || !this._lineOfSight(tp)) return null;
    const lead = p.vehicle ? 0.6 : 0;
    const vel = p.vehicle ? p.vehicle.velocity : p.velocity ?? { x: 0, z: 0 };
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
    const prey = (this.target ?? player).vehicle;
    for (const o of this.game.vehicles) {
      if (o === v) continue;
      if (chase && o === prey) continue; // погоня таранит
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

// Случайный тип машины для потока (такси и седаны чаще).
const TYPE_WEIGHTS = [['sedan', 0.34], ['taxi', 0.14], ['sports', 0.12], ['van', 0.18], ['pickup', 0.22]];
export function randomCarType(rng) {
  let r = rng.next();
  for (const [t, w] of TYPE_WEIGHTS) if ((r -= w) < 0) return t;
  return 'sedan';
}

export class TrafficManager {
  constructor(game) {
    this.game = game;
    this.cars = [];   // { vehicle, driver } — управляемый трафик
    this.parked = []; // машины у бордюров без водителя
    this._timer = 0;
    this._parkTimer = 20;
  }

  // Место у бордюра по ходу движения в кольце minR..maxR от точки from (вне поля зрения, если близко).
  curbSpot(from, minR, maxR, hidden = true) {
    const { world, rng } = this.game;
    const L = world.roadLines;
    const off = world.roadHalf - 1.4;
    for (let attempt = 0; attempt < 60; attempt++) {
      const k = rng.int(0, L.length - 1);
      const b = rng.int(0, L.length - 2);
      const u = L[b] + rng.range(22, world.blockSize - 22); // между перекрёстками
      const side = rng.chance(0.5) ? 1 : -1;
      const alongX = rng.chance(0.5);
      // Правостороннее движение: у края +Z едут на +X, у края −X — на +Z.
      const spot = alongX
        ? { x: u, z: L[k] + side * off, heading: side > 0 ? Math.PI / 2 : -Math.PI / 2 }
        : { x: L[k] - side * off, z: u, heading: side > 0 ? 0 : Math.PI };
      const d = Math.hypot(spot.x - from.x, spot.z - from.z);
      if (d < minR || d > maxR) continue;
      if (hidden && d < 170 && this.game.inView(spot.x, 1, spot.z, 3)) continue;
      if (this.game.vehicles.some((v) => v.position.distanceToSquared({ x: spot.x, y: 0, z: spot.z }) < 64)) continue;
      return spot;
    }
    return null;
  }

  // Создать машину с ИИ-водителем на дороге в кольце minR..maxR от игрока (не на глазах).
  // color — цвет кузова (по умолчанию случайный), driver — опции NPC-водителя ({ role, gang, look }),
  // type — тип машины (по умолчанию случайный), near — центр кольца вместо игрока.
  createAICar({ police = false, mode = 'cruise', minR = CONFIG.traffic.spawnMin, maxR = CONFIG.traffic.spawnMax, color, driver: who, type, near } = {}) {
    const { game } = this;
    const { rng, roads } = game;
    const p = near ?? game.player.position;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = [rng.int(0, roads.n - 1), rng.int(0, roads.n - 1)];
      const b = rng.pick(roads.neighbors(a));
      const t = rng.range(0.25, 0.75);
      const A = roads.pos(a), B = roads.pos(b);
      const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < minR || d > maxR) continue;
      // Не на глазах у игрока: в кадре и ближе 170 м — ищем другое место.
      const pd = Math.hypot(x - game.player.position.x, z - game.player.position.z);
      if (pd < 170 && game.inView(x, 1, z, 3)) continue;
      if (game.vehicles.some((o) => o.position.distanceToSquared({ x, y: 0, z }) < 100)) continue;

      const vehicle = new Vehicle(game, {
        x, z, color: color ?? rng.pick(CONFIG.traffic.colors), police, type: police ? 'sedan' : type ?? randomCarType(rng),
      });
      const ai = new AIDriver(game, vehicle, mode);
      ai.placeOnSegment(a, b, t, mode === 'pursuit' ? 10 : 6);
      const driver = new NPC(game, rng, {
        x, z, role: police ? 'police' : 'civilian', look: police ? policeLook(rng) : undefined, ...who,
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

  // Припаркованная машина у бордюра (вне поля зрения).
  _spawnParked() {
    const { game } = this;
    const spot = this.curbSpot(game.player.position, 30, 150);
    if (!spot) return null;
    const v = new Vehicle(game, { x: spot.x, z: spot.z, heading: spot.heading, color: game.rng.pick(CONFIG.traffic.colors), type: randomCarType(game.rng) });
    v.parked = true;
    game.addVehicle(v);
    this.parked.push(v);
    return v;
  }

  // Прохожий дошёл до припаркованной машины: садится и уезжает в поток.
  driveAway(v, npc) {
    const i = this.parked.indexOf(v);
    if (i >= 0) this.parked.splice(i, 1);
    v.parked = false;
    v._claimed = false;
    if (v.driver || v.removed) {
      npc._enter(NPC_STATE.WALK);
      return;
    }
    npc.enterVehicle(v);
    const ai = new AIDriver(this.game, v, 'cruise');
    ai.attachToRoad();
    v.ai = ai;
    this.cars.push({ vehicle: v, driver: npc });
  }

  // Машина из потока паркуется, водитель выходит и идёт по делам.
  _parkOne() {
    const p = this.game.player.position;
    const car = this.cars.find((c) => c.vehicle.ai?.mode === 'cruise' && c.driver.role === 'civilian' &&
      c.vehicle.position.distanceTo(p) < 120 && c.vehicle.position.distanceTo(p) > 30);
    if (car) car.vehicle.ai.mode = 'park';
  }

  _finishParking() {
    for (const c of [...this.cars]) {
      const v = c.vehicle;
      if (!v.ai?.parked) continue;
      const npc = c.driver;
      npc.exitVehicle();
      npc._pickDestination?.();
      this.cars.splice(this.cars.indexOf(c), 1);
      v.parked = true;
      this.parked.push(v);
    }
  }

  removeCar(vehicle) {
    if (vehicle.driver && vehicle.driver !== this.game.player) this.game.npcs.remove(vehicle.driver);
    this.game.removeVehicle(vehicle);
  }

  update(dt) {
    this._finishParking();
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.5;
    const T = CONFIG.traffic;
    const { game } = this;
    const p = game.player.position;

    // Угнанные/брошенные машины больше не трафик.
    this.cars = this.cars.filter((c) => !c.vehicle.removed && c.vehicle.ai && c.vehicle.driver === c.driver);
    this.parked = this.parked.filter((v) => !v.removed && !v.driver);

    for (const c of [...this.cars]) {
      const v = c.vehicle;
      const d = v.position.distanceTo(p);
      const hidden = !game.inView(v.position.x, 1, v.position.z, 3);
      // Далеко — убираем; застрявшую в заторе и невидимую — тоже (появится другая).
      if (d > T.despawnDistance || (d > 190 && this.cars.length > T.count && hidden) ||
        (hidden && d > 40 && (v.ai?.stuckTotal ?? 0) >= 2 && v.ai?.mode === 'cruise')) {
        this.removeCar(c.vehicle);
        this.cars.splice(this.cars.indexOf(c), 1);
      }
    }
    for (const v of [...this.parked]) {
      if (v.position.distanceTo(p) > 200 && !game.inView(v.position.x, 1, v.position.z, 3)) {
        game.removeVehicle(v);
        this.parked.splice(this.parked.indexOf(v), 1);
      }
    }
    // Детализация машин по расстоянию до камеры.
    const cam = game.camera.position;
    for (const v of game.vehicles) v.setDetail(v.position.distanceToSquared(cam) < T.detailDistance ** 2);
    // Брошенные машины (не стартовые) далеко от игрока убираем.
    for (const v of [...game.vehicles]) {
      if (v.persistent || v.driver || v.ai || v.parked) continue;
      if (v.position.distanceTo(p) > T.despawnDistance + 60) game.removeVehicle(v);
    }

    // Пополнение: по одной-две за раз, чтобы не было всплесков.
    for (let k = 0; k < 2 && this.cars.length < T.count; k++) {
      const car = this.createAICar();
      if (car) this.cars.push(car);
    }
    if (this.parked.length < T.parkedCount) this._spawnParked();
    if ((this._parkTimer -= 0.5) <= 0) {
      this._parkTimer = game.rng.range(25, 50);
      this._parkOne();
    }
  }
}
