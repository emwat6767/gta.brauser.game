import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { damp, dampAngle, lerp } from './utils.js';

// Пешеходы. Ходят по графу тротуаров (world.waypoints): дошёл до угла квартала —
// выбрал случайного соседа (не возвращаясь назад), иногда постоял.
// Реакции: толчок -> пошатнулся и убегает; сбили (бег/машина) -> упал, лежит, встаёт.
//
// Состояния (NPC_STATE) — простой конечный автомат в update().
// Чтобы добавить поведение (например, "бежать к машине" или "драться"),
// добавьте состояние и ветку в switch.

export const NPC_STATE = {
  WALK: 'walk',
  IDLE: 'idle',
  STUMBLE: 'stumble',
  DOWN: 'down',
  GETUP: 'getup',
};

const PALETTE = {
  skin: ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a57257'],
  hair: ['#1b1b1b', '#3b2a1a', '#6b4423', '#a0785a', '#d6b370', '#555555'],
  shirt: ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#d35400', '#ecf0f1', '#34495e', '#e84393'],
  pants: ['#2c3e50', '#34495e', '#1f2d3d', '#5d4037', '#7f8c8d', '#212121', '#3e5c76'],
  shoes: ['#111111', '#eeeeee', '#5d4037', '#333333'],
};
const PUSH_LINES = ['Эй!', 'Смотри куда прёшь!', 'Осторожнее!', 'Ты чего?!'];
const DOWN_LINES = ['Ай!', 'А-а-а!', 'Ох...'];

export class NPC {
  constructor(game, rng, { x, z, from, to }) {
    const N = CONFIG.npc;
    this.game = game;
    this.rng = rng;
    const scale = rng.range(0.93, 1.07);
    this.model = new Humanoid({
      skin: rng.pick(PALETTE.skin), hair: rng.pick(PALETTE.hair), shirt: rng.pick(PALETTE.shirt),
      pants: rng.pick(PALETTE.pants), shoes: rng.pick(PALETTE.shoes), scale,
    });
    this.radius = N.radius * scale;
    this.position = new THREE.Vector3(x, game.world.getGroundHeight(x, z), z);
    this.knock = new THREE.Vector3(); // скорость от толчков/ударов (в т.ч. вертикальная)
    this.heading = Math.atan2(to.x - x, to.z - z);
    this.walkSpeed = rng.range(N.walkSpeed[0], N.walkSpeed[1]);
    this.speed = 0;
    this.state = NPC_STATE.WALK;
    this.stateTime = 0;
    this.idleTime = 0;
    this.downTime = 0;
    this.panic = 0;     // секунд бегства
    this.cooldown = 0;  // защита от повторной реакции каждый кадр
    this.fall = 0;
    this.airborne = false;
    this.visualY = this.position.y;
    this.prevNode = from;
    this._setTarget(to);
    this._hit = { nx: 0, nz: 0 };
    game.scene.add(this.model.root);
  }

  get isDown() {
    return this.state === NPC_STATE.DOWN || this.state === NPC_STATE.GETUP;
  }

  _enter(state) {
    this.state = state;
    this.stateTime = 0;
  }

  _setTarget(node) {
    this.node = node;
    const j = 1.1; // случайный сдвиг, чтобы пешеходы не ходили по одной линии
    this.target = { x: node.x + this.rng.range(-j, j), z: node.z + this.rng.range(-j, j) };
  }

  _chooseNext() {
    const links = this.node.links;
    const options = links.filter((n) => n !== this.prevNode);
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
    this.panic = Math.max(0, this.panic - dt);
    let speed = 0;

    switch (this.state) {
      case NPC_STATE.WALK: {
        const dx = this.target.x - this.position.x;
        const dz = this.target.z - this.position.z;
        if (dx * dx + dz * dz < 0.8) {
          if (this.panic <= 0 && this.rng.chance(N.idleChance)) {
            this.idleTime = this.rng.range(1, 4);
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
      case NPC_STATE.STUMBLE:
        if (this.stateTime > 0.7) this._enter(NPC_STATE.WALK);
        break;
      case NPC_STATE.DOWN:
        this.fall = Math.min(1, this.fall + dt / 0.35);
        if (this.stateTime > this.downTime && !this.airborne) this._enter(NPC_STATE.GETUP);
        break;
      case NPC_STATE.GETUP:
        this.fall = Math.max(0, this.fall - dt / 0.9);
        if (this.fall <= 0) {
          this.panic = 5;
          this.prevNode = null;
          this._setTarget(world.nearestWaypoint(this.position.x, this.position.z));
          this._enter(NPC_STATE.WALK);
        }
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

    this.visualY = this.airborne ? this.position.y : damp(this.visualY, this.position.y, 20, dt);
    this.model.root.position.set(this.position.x, this.visualY, this.position.z);
    this.model.root.rotation.y = this.heading;
    const pose = this.isDown ? 'down' : this.state === NPC_STATE.STUMBLE ? 'stumble' : 'normal';
    this.model.animate(dt, { speed, pose, fall: this.fall, airborne: false });
  }

  // Лёгкий толчок: пошатнуться, обернуться на обидчика, отбежать.
  stumble(dirX, dirZ, strength, by) {
    if (this.isDown || this.cooldown > 0) return false;
    this.knock.x += dirX * strength;
    this.knock.z += dirZ * strength;
    this.heading = Math.atan2(-dirX, -dirZ);
    this.cooldown = 1;
    this.panic = 4;
    this._enter(NPC_STATE.STUMBLE);
    this.game.hud?.say(this, this.rng.pick(PUSH_LINES));
    this.game.events.emit('npc:pushed', { npc: this, by });
    return true;
  }

  // Сбит с ног: отлетает по (vx, vz), подпрыгивает на up, падает на спину.
  knockDown(vx, vz, up, by, cause) {
    if (this.cooldown > 0) return false;
    this.knock.set(vx, up, vz);
    this.airborne = up > 0;
    if (Math.abs(vx) + Math.abs(vz) > 0.01) this.heading = Math.atan2(-vx, -vz); // лицом к удару -> падает назад
    this.downTime = this.rng.range(CONFIG.npc.downTime[0], CONFIG.npc.downTime[1]);
    this.cooldown = 1.2;
    this._enter(NPC_STATE.DOWN);
    this.game.hud?.say(this, this.rng.pick(DOWN_LINES));
    this.game.events.emit('npc:knockdown', { npc: this, by, cause });
    return true;
  }
}

export class NPCManager {
  constructor(game) {
    const N = CONFIG.npc;
    this.game = game;
    this.list = [];
    const rng = game.rng;
    const p = game.player.position;
    const nodes = game.world.waypointsNear(p.x, p.z, N.spawnRadius);
    for (let i = 0; i < N.count && nodes.length; i++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const from = rng.pick(nodes);
        const to = rng.pick(from.links);
        const t = rng.range(0.1, 0.9);
        const x = lerp(from.x, to.x, t) + rng.range(-1, 1);
        const z = lerp(from.z, to.z, t) + rng.range(-1, 1);
        if (Math.hypot(x - p.x, z - p.z) < 5) continue; // не спавним прямо на игроке
        this.list.push(new NPC(game, rng, { x, z, from, to }));
        break;
      }
    }
  }

  update(dt) {
    for (const npc of this.list) npc.update(dt);
  }
}
