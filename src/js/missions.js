import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Vehicle } from './vehicle.js';
import { NPC, NPC_STATE, LINES, gangLook } from './npc.js';
import { formatMoney } from './ui/hud.js';

// Задания банды (меню — ui/gang-menu.js, клавиша J / кнопка ЗАДАНИЯ).
// Одновременно идёт одно задание. У задания есть цель на карте (target: столб света в мире
// и метка на миникарте) и строка цели в HUD (objective). update() возвращает null, пока идёт,
// 'success' или текст причины провала. Награда — CONFIG.missions[id]: деньги и репутация.
//
// Новое задание: класс с start()/update()/cleanup() + запись в MISSIONS.

const _col = new THREE.Color();

// Место у бордюра на дороге (парковка по ходу движения) в кольце minR..maxR от точки from.
function parkingSpot(game, from, minR, maxR) {
  const { world, rng } = game;
  const L = world.roadLines;
  const off = world.roadHalf - 1.4;
  for (let attempt = 0; attempt < 60; attempt++) {
    const k = rng.int(0, L.length - 1);
    const b = rng.int(0, L.length - 2);
    const u = L[b] + rng.range(22, world.blockSize - 22); // между перекрёстками
    const side = rng.chance(0.5) ? 1 : -1;
    const alongX = rng.chance(0.5);
    // Правостороннее движение: у южного края (+Z) едут на +X, у западного (−X) — на +Z.
    const spot = alongX
      ? { x: u, z: L[k] + side * off, heading: side > 0 ? Math.PI / 2 : -Math.PI / 2 }
      : { x: L[k] - side * off, z: u, heading: side > 0 ? 0 : Math.PI };
    const d = Math.hypot(spot.x - from.x, spot.z - from.z);
    if (d < minR || d > maxR) continue;
    if (game.vehicles.some((v) => v.position.distanceToSquared({ x: spot.x, y: 0, z: spot.z }) < 64)) continue;
    return spot;
  }
  return null;
}

function spawnCar(game, spot, color) {
  const car = new Vehicle(game, { x: spot.x, z: spot.z, heading: spot.heading, color });
  car.persistent = true;
  return game.addVehicle(car);
}

// Машина задания больше не нужна: успех — "заезжает в гараж" (исчезает), провал — остаётся в городе.
function releaseCar(game, car, remove) {
  if (!car || car.removed) return;
  if (remove) {
    if (game.player.vehicle === car) game.player.exitVehicle();
    game.removeVehicle(car);
  } else {
    car.persistent = false;
  }
}

function rivalGang(game) {
  const rivals = game.gangs.gangs.filter((g) => !g.friendly && g.blocks.length);
  return rivals.length ? game.rng.pick(rivals) : null;
}

// --------------------------------------------------------------- Угон тачки

class StealCar {
  constructor(game) {
    this.game = game;
    this.stage = 'find';
  }

  start() {
    const spot = parkingSpot(this.game, this.game.player.position, 140, 300);
    if (!spot) return false;
    this.car = spawnCar(this.game, spot, CONFIG.missions.steal.color);
    return true;
  }

  get target() {
    if (this.stage === 'find' || this.game.player.vehicle !== this.car) return this.car.position;
    return CONFIG.missions.garage;
  }

  get objective() {
    if (this.stage === 'find') return 'Угоните <b>золотой спорткар</b>';
    if (this.game.player.vehicle !== this.car) return 'Вернитесь в <b>спорткар</b>';
    return 'Отгоните спорткар в <b>гараж банды</b>';
  }

  update() {
    const { game } = this;
    if (this.car.removed) return 'машина потеряна';
    if (this.stage === 'find' && game.player.vehicle === this.car) {
      this.stage = 'deliver';
      game.hud.toast('Сработала сигнализация!', 2);
      game.wanted.addHeat(0.3, 1);
    }
    if (this.stage === 'deliver' && game.player.vehicle === this.car) {
      const g = CONFIG.missions.garage;
      if (Math.hypot(this.car.position.x - g.x, this.car.position.z - g.z) < 7 && Math.abs(this.car.speed) < 4) return 'success';
    }
    return null;
  }

  cleanup(success) {
    releaseCar(this.game, this.car, success);
  }
}

// --------------------------------------------------------------- Зачистка точки

class ClearSpot {
  constructor(game) {
    this.game = game;
    this.enemies = [];
    this.engaged = false;
  }

  start() {
    const { game } = this;
    const gang = rivalGang(game);
    if (!gang) return false;
    const block = game.rng.pick(gang.blocks);
    const nodes = game.world.waypoints.filter((n) => n.block === block);
    const corner = game.rng.pick(nodes);
    this.gang = gang;
    this.spot = { x: corner.x, z: corner.z };
    for (let k = 0; k < CONFIG.missions.clear.enemies; k++) {
      const a = (k / CONFIG.missions.clear.enemies) * Math.PI * 2;
      const x = corner.x + Math.cos(a) * 2.2, z = corner.z + Math.sin(a) * 2.2;
      const npc = new NPC(game, game.rng, {
        x, z, role: 'gang', gang: gang.id, look: gangLook(game.rng, gang.color), allowedNodes: gang.nodes,
        weapon: game.rng.pick(['pistol', 'smg', 'shotgun']),
      });
      npc.heading = Math.atan2(corner.x - x, corner.z - z);
      npc.idleTime = 1e9; // тусуются на углу, пока не появится игрок
      npc._enter(NPC_STATE.IDLE);
      npc.marked = true;
      this.enemies.push(game.npcs.add(npc));
    }
    return true;
  }

  get target() {
    return this.engaged ? null : this.spot;
  }

  get objective() {
    return `Зачистите точку: ${this.gang.name}, осталось <b>${this.enemies.length}</b>`;
  }

  update() {
    const { game } = this;
    const p = game.player;
    this.enemies = this.enemies.filter((e) => !e.removed && !e.isDead);
    if (!this.enemies.length) return 'success';
    const near = Math.hypot(p.position.x - this.spot.x, p.position.z - this.spot.z) < 45;
    if (near && !this.engaged) {
      this.engaged = true;
      this.enemies[0].say(game.rng.pick(LINES.gangAggro), true);
    }
    if (this.engaged) {
      for (const e of this.enemies) if (!e.isBusy && e.position.distanceTo(p.position) < 60) e.aggro(p);
    }
    return null;
  }

  cleanup() {
    for (const e of this.enemies) {
      e.marked = false;
      if (e.state === NPC_STATE.IDLE) e.idleTime = 5;
    }
  }
}

// --------------------------------------------------------------- Ограбление магазина

class RobStore {
  constructor(game) {
    this.game = game;
    this.result = null;
  }

  start() {
    const { game } = this;
    const p = game.player.position;
    const stores = game.heists.stores.filter((s) => s.cooldown <= 0)
      .sort((a, b) => Math.hypot(a.door.x - p.x, a.door.z - p.z) - Math.hypot(b.door.x - p.x, b.door.z - p.z));
    if (!stores.length) return false;
    this.store = stores[Math.min(stores.length - 1, game.rng.int(0, 1))]; // один из двух ближайших
    return true;
  }

  get target() {
    return this.game.heists.active?.place === this.store ? null : this.store.door;
  }

  get objective() {
    if (this.game.heists.active?.place === this.store) return '<b>Держитесь у входа</b>, пока берут кассу';
    return `Ограбьте <b>${this.store.name}</b> (E у двери)`;
  }

  onEvent(type, { place }) {
    if (place !== this.store) return;
    if (type === 'heist:success') this.result = 'success';
    else if (type === 'heist:fail') this.result = 'ограбление сорвано';
  }

  update() {
    return this.result;
  }

  cleanup() {}
}

// --------------------------------------------------------------- Доставка груза

class Delivery {
  constructor(game) {
    this.game = game;
    this.stage = 'pickup';
    this.chasers = [];
  }

  start() {
    const { game } = this;
    const D = CONFIG.missions.delivery;
    const spot = parkingSpot(game, game.player.position, 25, 90);
    if (!spot) return false;
    const drop = parkingSpot(game, spot, D.minDist, D.maxDist);
    if (!drop) return false;
    this.van = spawnCar(game, spot, D.color);
    this.drop = drop;
    this.time = D.time;
    return true;
  }

  get target() {
    return this.stage === 'pickup' || this.game.player.vehicle !== this.van ? this.van.position : this.drop;
  }

  get objective() {
    if (this.stage === 'pickup') return 'Сядьте в <b>фургон с грузом</b>';
    const t = `<b>${Math.ceil(this.time)} с</b>`;
    if (this.game.player.vehicle !== this.van) return `Вернитесь в фургон! ${t}`;
    return `Доставьте груз к метке, за вами хвост! ${t}`;
  }

  update(dt) {
    const { game } = this;
    const D = CONFIG.missions.delivery;
    const p = game.player;
    if (this.van.removed) return 'груз потерян';
    if (this.stage === 'pickup') {
      if (p.vehicle !== this.van) return null;
      this.stage = 'drive';
      // Конкуренты пронюхали о грузе — погоня.
      const gang = rivalGang(game) ?? game.gangs.gangs.find((g) => !g.friendly);
      for (let k = 0; k < D.chasers; k++) {
        const car = game.traffic.createAICar({
          mode: 'pursuit', minR: 70, maxR: 160, color: new THREE.Color(gang.color).getHex(),
          driver: { role: 'gang', gang: gang.id, look: gangLook(game.rng, gang.color), weapon: 'smg' },
        });
        if (car) this.chasers.push({ ...car, deployed: false });
      }
      game.hud.toast(`${gang.name} сели на хвост!`, 2.5);
      return null;
    }
    this.time -= dt;
    if (this.time <= 0) return 'время вышло';
    // Догнали стоящего игрока — выходят и стреляют.
    for (const c of this.chasers) {
      const v = c.vehicle;
      if (c.deployed || v.removed || !c.driver || c.driver.vehicle !== v) continue;
      const slow = !p.vehicle || Math.abs(p.vehicle.speed) < 3;
      if (slow && Math.abs(v.speed) < 4 && v.position.distanceTo(p.vehicle ? p.vehicle.position : p.position) < 15) {
        c.deployed = true;
        c.driver.exitVehicle();
        c.driver.marked = true;
        c.driver.aggro(p, this.game.rng.pick(LINES.gangAggro));
      }
    }
    if (p.vehicle === this.van && Math.hypot(this.van.position.x - this.drop.x, this.van.position.z - this.drop.z) < 8 &&
      Math.abs(this.van.speed) < 4) return 'success';
    return null;
  }

  cleanup(success) {
    const { game } = this;
    for (const c of this.chasers) {
      const v = c.vehicle;
      if (v.removed) continue;
      // Погоня окончена: машины становятся обычным трафиком (исчезнут вдали).
      if (v.ai) {
        v.ai.mode = 'cruise';
        game.traffic.cars.push({ vehicle: v, driver: c.driver });
      }
      if (c.driver) c.driver.marked = false;
    }
    releaseCar(game, this.van, success);
  }
}

// --------------------------------------------------------------- Список и система

export const MISSIONS = [
  { id: 'steal', name: 'Угон тачки', desc: 'Золотой спорткар стоит где-то в городе. Угоните его и пригоните в гараж банды.', make: (g) => new StealCar(g) },
  { id: 'clear', name: 'Зачистка точки', desc: 'Конкуренты тусуются на углу своего района. Перебейте всех.', make: (g) => new ClearSpot(g) },
  { id: 'store', name: 'Ограбление магазина', desc: 'Возьмите кассу в магазине 24/7 — держитесь у входа, пока идёт ограбление.', make: (g) => new RobStore(g) },
  { id: 'delivery', name: 'Доставка груза', desc: 'Отвезите фургон с грузом к метке, пока не вышло время. Конкуренты попробуют помешать.', make: (g) => new Delivery(g) },
];

export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.active = null;     // { def, m }
    this.completed = {};    // id -> сколько раз выполнено

    // Столб света над целью (виден издалека) + кольцо на земле.
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 70, 16, 1, true).translate(0, 35, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.1, 8, 40).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.position.y = 0.1;
    this.beacon.add(beam, ring);
    this.beacon.visible = false;
    game.scene.add(this.beacon);
    this._t = 0;

    game.events.on('player:down', () => {
      if (this.active) this._finish('вы выбыли');
    });
    for (const type of ['heist:success', 'heist:fail']) {
      game.events.on(type, (e) => this.active?.m.onEvent?.(type, e));
    }
  }

  start(id) {
    const { game } = this;
    if (this.active || game.turf?.busy || game.player.isDead) return false;
    const def = MISSIONS.find((d) => d.id === id);
    const m = def?.make(game);
    if (!m || !m.start()) {
      game.hud.toast('Сейчас это задание недоступно', 2);
      return false;
    }
    this.active = { def, m };
    game.hud.toast(`Задание: ${def.name}`, 2.5);
    return true;
  }

  cancel() {
    if (!this.active) return;
    this.active.m.cleanup(false);
    this.active = null;
    this.game.hud.toast('Задание отменено', 2);
    this.game.hud.setObjective('');
  }

  _finish(result) {
    const { game } = this;
    const { def, m } = this.active;
    this.active = null;
    m.cleanup(result === 'success');
    game.hud.setObjective('');
    if (result === 'success') {
      const R = CONFIG.missions[def.id];
      game.wallet.add(R.reward);
      game.progress.add(R.rep, 'задание');
      this.completed[def.id] = (this.completed[def.id] ?? 0) + 1;
      game.hud.toast(`ЗАДАНИЕ ВЫПОЛНЕНО! +${formatMoney(R.reward)}`, 4);
      game.audio.fanfare(6);
    } else {
      game.hud.toast(`ЗАДАНИЕ ПРОВАЛЕНО: ${result}`, 4);
    }
  }

  // Цель текущего задания (для миникарты).
  get target() {
    return this.active?.m.target ?? null;
  }

  update(dt) {
    this._t += dt;
    const a = this.active;
    if (!a) {
      this.beacon.visible = false;
      return;
    }
    const result = a.m.update(dt);
    if (result) {
      this._finish(result);
      this.beacon.visible = false;
      return;
    }
    this.game.hud.setObjective(a.m.objective);
    const t = a.m.target;
    this.beacon.visible = !!t;
    if (t) {
      this.beacon.position.set(t.x, this.game.world.getGroundHeight(t.x, t.z), t.z);
      const k = 0.22 + Math.sin(this._t * 3) * 0.06;
      this.beacon.children[0].material.opacity = k;
      this.beacon.children[0].material.color.copy(_col.setHSL(0.13, 1, 0.55));
    }
  }
}
