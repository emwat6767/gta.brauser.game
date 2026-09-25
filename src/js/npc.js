import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { Melee } from './combat.js';
import { Gun } from './weapons.js';
import { fireShot, lineOfSight } from './ballistics.js';
import { Ragdoll } from './ragdoll.js';
import { damp, dampAngle, lerp, wrapAngle, clamp } from './utils.js';
import { CrowdRenderer } from './crowd.js';

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
// Бандит в отряде игрока (squad.js: follower = true, leader = игрок) ходит за ним (FOLLOW),
// садится к нему в машину пассажиром и стреляет из окна.
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
  DRIVE: 'drive',     // сидит в машине: за рулём или пассажиром (модель прикреплена к сиденью)
  FOLLOW: 'follow',   // идёт за лидером (отряд игрока)
  TALK: 'talk',       // разговаривает с другим NPC (partner)
  GOTO_CAR: 'gotocar', // идёт к припаркованной машине, чтобы уехать на ней
  RETREAT: 'retreat', // ранен — отступает от противника, потом возвращается
  GOTO: 'goto',       // идёт к точке (охранник — к своему посту), затем стоит
};

// Места в строю отряда: [вправо, назад] от игрока, м. По бокам, а не прямо за спиной —
// иначе бойцы загораживают камеру.
const FOLLOW_SLOTS = [[-2, 0.4], [2, 0.4], [-3.4, 1.4], [3.4, 1.4], [0, 3.2]];

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
  squadJoin: ['Я с тобой!', 'Погнали!', 'Веди, братан!', 'Банда в деле!'],
  chat: ['Слышал новости?', 'Да ладно!', 'Серьёзно?', 'Ха-ха-ха!', 'Ну ты даёшь', 'Погода сегодня супер',
    'Видел, что вчера было?', 'Пойдём в кафе?', 'Опять эти пробки...', 'Не может быть!', 'А я говорил!', 'Ну и дела'],
  phone: ['Алло? Да, иду', 'Перезвоню позже', 'Ты где?', 'Да-да, понял', 'Скоро буду'],
  gangChat: ['Тихо сегодня', 'Смотри в оба', 'Чужие рядом были', 'Держим район', 'Где наши?'],
  retreat: ['Меня зацепило!', 'Отходим!', 'Прикройте!', 'Я ранен!'],
  brawl: ['Ну всё, держись!', 'Сам напросился!', 'Получай!', 'Ты кого толкнул?!'],
  crash: ['Ты куда смотрел?!', 'Мою машину разбил!', 'Права купил?!', 'Кто платить будет?!'],
  mugger: ['Кошелёк давай!', 'Тихо, без глупостей!', 'Деньги, быстро!'],
  mugged: ['Помогите! Грабят!', 'Держи вора!', 'Полиция!'],
  cheer: ['Давай, давай!', 'Бей его!', 'Ого!', 'Снимайте, снимайте!'],
  squadAttack: ['Мочи их!', 'Огонь!', 'Валим их!', 'За Грув!'],
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

// Бандиты тоже разные: майка цвета банды или тёмная с банданой, иногда кепка.
export function gangLook(rng, color) {
  const dark = rng.chance(0.3);
  const cap = !dark && rng.chance(0.25);
  return {
    skin: rng.pick(PALETTE.skin), hair: rng.pick(['#141414', '#141414', '#3b2a1a']),
    shirt: dark ? rng.pick(['#1e1e1e', '#2d2d2d', '#e8e8e8']) : color,
    bandana: cap ? null : color, hat: cap ? color : null,
    pants: rng.pick(['#1c1c1c', '#2b3a55', '#3a3a3a', '#4a3b2a']), shoes: rng.pick(['#111111', '#eeeeee', '#8a1c1c']),
    scale: rng.range(0.95, 1.1),
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
    // Характер: не все одинаковые. Прохожие — бегуны и неторопливые, бандиты — смелые/трусливые.
    this.bravery = rng.range(0.2, 1);      // < 0.5 — отступает раненым
    this.aggression = rng.range(0.2, 1);   // насколько охотно ввязывается в драку
    if (role === 'civilian') {
      if (rng.chance(0.08)) { this.jogger = true; this.walkSpeed = rng.range(3.1, 3.7); }
      else if (rng.chance(0.1)) this.walkSpeed = rng.range(0.85, 1.1); // пожилой/неспешный
    }
    this.activity = null; // жест в IDLE: 'phone' | 'talk' | null
    this.partner = null;  // собеседник (TALK)
    this.dest = null;     // куда идёт по своим делам (узел графа тротуаров)
    this.carTarget = null; // машина, к которой идёт (GOTO_CAR)
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
    this.seat = -1;       // место пассажира (-1 — за рулём или пешком)
    this.follower = false; // в отряде игрока
    this.guard = false;   // охранник банка (heists.js): не задерживает, а стреляет
    this.leader = null;
    this.slot = 0;        // место в строю / в машине
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
    if (!this.allowedNodes?.size) return w.nearestWaypoint(this.position.x, this.position.z);
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
    } else if (this.dest && this.rng.chance(0.8)) {
      // Идёт по своим делам (или к посту/на налёт): к узлу, который ближе к цели.
      const d = (n) => (n.x - this.dest.x) ** 2 + (n.z - this.dest.z) ** 2;
      next = pool.reduce((best, n) => (d(n) < d(best) ? n : best), pool[0]);
    } else {
      next = this.rng.pick(pool);
    }
    this.prevNode = this.node;
    this._setTarget(next);
  }

  // Новая цель прогулки: случайный узел в 80..300 м.
  _pickDestination() {
    const w = this.game.world;
    for (let k = 0; k < 8; k++) {
      const n = w.waypoints[this.rng.int(0, w.waypoints.length - 1)];
      const d = Math.hypot(n.x - this.position.x, n.z - this.position.z);
      if (d > 80 && d < 300) {
        this.dest = n;
        return;
      }
    }
    this.dest = null;
  }

  // Дошёл до узла: иногда остановиться — постоять, поговорить по телефону, оглядеться.
  _arrive() {
    if (this.panic > 0) return false;
    if (this.role !== 'civilian' && this.node === this.dest) this.dest = null;
    if (this.role === 'civilian') {
      if (!this.dest || this.node === this.dest || this.rng.chance(0.02)) this._pickDestination();
      if (this.jogger || !this.rng.chance(this.node?.mid ? 0.1 : this.idleChance)) return false;
      this.activity = this.rng.chance(0.4) ? 'phone' : null;
      this.idleTime = this.activity ? this.rng.range(5, 12) : this.rng.range(1.5, 5);
      if (this.activity) this.say(this.rng.pick(LINES.phone));
      this._enter(NPC_STATE.IDLE);
      return true;
    }
    if (this.dest || !this.rng.chance(this.idleChance)) return false; // идёт по делу (к посту, на налёт) — не стоит
    this.activity = null;
    this.idleTime = this.role === 'gang' ? this.rng.range(3, 9) : this.rng.range(1, 4);
    this._enter(NPC_STATE.IDLE);
    return true;
  }

  // Разговор двух NPC: встают лицом друг к другу рядом с точкой (x, z).
  startTalk(partner, x, z, side, seconds) {
    this.partner = partner;
    this.talkSpot = { x: x + Math.sin(side) * 0.62, z: z + Math.cos(side) * 0.62 };
    this.idleTime = seconds;
    this.activity = null;
    this._enter(NPC_STATE.TALK);
  }

  _updateTalk(dt) {
    const p = this.partner;
    if (!p || p.removed || p.isDead || p.state !== NPC_STATE.TALK || p.partner !== this || this.stateTime > this.idleTime || this.panic > 0) {
      this.partner = null;
      this.activity = null;
      this._enter(NPC_STATE.WALK);
      return 0;
    }
    const dx = this.talkSpot.x - this.position.x, dz = this.talkSpot.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.25) {
      this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 8, dt);
      const step = Math.min(this.walkSpeed * dt, d);
      this.position.x += Math.sin(this.heading) * step;
      this.position.z += Math.cos(this.heading) * step;
      return this.walkSpeed;
    }
    this.heading = dampAngle(this.heading, Math.atan2(p.position.x - this.position.x, p.position.z - this.position.z), 6, dt);
    // Говорят по очереди: у каждого свой "такт".
    const mine = Math.floor((this.stateTime + (this.talkPhase ??= this.rng.range(0, 6))) / 3) % 2 === 0;
    this.activity = mine ? 'talk' : null;
    if (mine && this.talkCooldown <= 0 && this.rng.chance(dt * 0.5)) this.say(this.rng.pick(this.role === 'gang' ? LINES.gangChat : LINES.chat));
    return 0;
  }

  // Идёт к припаркованной машине и уезжает на ней (становится трафиком, см. traffic.js).
  _updateGotoCar(dt) {
    const v = this.carTarget;
    if (!v || v.removed || v.driver || this.panic > 0 || this.stateTime > 25) {
      this.carTarget = null;
      this._enter(NPC_STATE.WALK);
      return 0;
    }
    const door = v.localToWorld2D(1.6, -0.2);
    const dx = door.x - this.position.x, dz = door.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.9) {
      this.carTarget = null;
      this.game.traffic.driveAway(v, this);
      return 0;
    }
    this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 8, dt);
    const step = Math.min(this.walkSpeed * 1.15 * dt, d);
    this.position.x += Math.sin(this.heading) * step;
    this.position.z += Math.cos(this.heading) * step;
    return this.walkSpeed * 1.15;
  }

  // Идти прямо к точке (недалеко, в пределах квартала); дошёл — стоит idle секунд лицом к face.
  goTo(x, z, idle, face = null) {
    this.gotoPoint = { x, z, idle, face };
    this._enter(NPC_STATE.GOTO);
  }

  _updateGoto(dt) {
    const g = this.gotoPoint;
    const dx = g.x - this.position.x, dz = g.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35 || this.stateTime > 20) {
      if (g.face) this.heading = Math.atan2(g.face.x - this.position.x, g.face.z - this.position.z);
      this.idleTime = g.idle;
      this.activity = null;
      this._enter(NPC_STATE.IDLE);
      return 0;
    }
    this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 8, dt);
    const step = Math.min(this.walkSpeed * dt, d);
    this.position.x += Math.sin(this.heading) * step;
    this.position.z += Math.cos(this.heading) * step;
    return this.walkSpeed;
  }

  // Ранен и не храбрец — отходит от противника к своим, потом возвращается в бой.
  _updateRetreat(dt) {
    const t = this.target;
    if (this.stateTime > this.idleTime || !t || t.isDead || t.removed) {
      this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.25);
      if (t && !t.isDead && !t.removed) this._enter(NPC_STATE.FIGHT);
      else this.dropTarget();
      return 0;
    }
    const tp = t.vehicle ? t.vehicle.position : t.position;
    const away = Math.atan2(this.position.x - tp.x, this.position.z - tp.z);
    this.heading = dampAngle(this.heading, away, 6, dt);
    const sp = CONFIG.npc.fightSpeed * 0.9;
    this.position.x += Math.sin(this.heading) * sp * dt;
    this.position.z += Math.cos(this.heading) * sp * dt;
    return sp;
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
      // В машине: позиция = машина, модель сидит на сиденье; пассажир стреляет из окна.
      this.position.copy(this.vehicle.position);
      this.heading = this.vehicle.heading;
      this.shooting = false;
      if (this.seat >= 0) this._driveBy(dt);
      if (this.model.root.visible) {
        this.model.animate(dt, { pose: 'sit', sitHeight: this.vehicle.seatHipHeight, aim: this.shooting ? this.aimPitch : null });
      }
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
          this._arrive();
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
        if (this.stateTime > this.idleTime) {
          this.activity = null;
          this._enter(NPC_STATE.WALK);
        }
        break;
      case NPC_STATE.TALK:
        speed = this._updateTalk(dt);
        break;
      case NPC_STATE.GOTO_CAR:
        speed = this._updateGotoCar(dt);
        break;
      case NPC_STATE.RETREAT:
        speed = this._updateRetreat(dt);
        break;
      case NPC_STATE.GOTO:
        speed = this._updateGoto(dt);
        break;
      case NPC_STATE.FIGHT:
        speed = this._updateFight(dt);
        break;
      case NPC_STATE.FOLLOW:
        speed = this._updateFollow(dt);
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
    if (this.lod) return; // вдали — упрощённая фигура без анимации (crowd.js)
    const pose = this.isDown ? 'down' : this.state === NPC_STATE.STUMBLE ? 'stumble' : 'normal';
    // Оружие видно только в драке (в остальное время "в кармане"); грабитель им угрожает.
    this.model.setWeapon(this.menace ?? (this.gun && this.state === NPC_STATE.FIGHT ? this.gun.type : null));
    this.model.animate(dt, {
      speed, pose, fall: this.fall,
      guard: !this.gun && this.state === NPC_STATE.FIGHT && speed < 1,
      attack: this.melee.t, attackSide: this.melee.side,
      aim: this.shooting ? this.aimPitch : this.menace && this.state === NPC_STATE.IDLE ? 0.08 : null,
      reload: this.gun?.reloadProgress ?? 0,
      gesture: this.state === NPC_STATE.IDLE || this.state === NPC_STATE.TALK ? this.activity
        : this.state === NPC_STATE.WALK && this.panic > 0 && this.role === 'civilian' && this.rng.chance(0.002) ? 'hands' : null,
    });
  }

  // --- Драка ---------------------------------------------------------------

  aggro(target, line) {
    if (!target || target === this || this.isDead || this.vehicle || target.isDead) return;
    if (this.target === target && this.state === NPC_STATE.FIGHT) return;
    this.target = target;
    this.panic = 0;
    if ([NPC_STATE.WALK, NPC_STATE.IDLE, NPC_STATE.FOLLOW, NPC_STATE.TALK, NPC_STATE.GOTO_CAR, NPC_STATE.RETREAT, NPC_STATE.GOTO].includes(this.state)) {
      this.partner = null;
      this.activity = null;
      this._enter(NPC_STATE.FIGHT);
    }
    if (line) this.say(line);
  }

  dropTarget() {
    this.target = null;
    if (this.state === NPC_STATE.FIGHT && this.leader) {
      this._enter(NPC_STATE.FOLLOW);
    } else if (this.state === NPC_STATE.FIGHT) {
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
    // Отряд не отходит далеко от игрока и бросает драку, когда он садится в машину.
    const L = this.leader;
    if (L && (L.vehicle || L.isDead || this.position.distanceTo(L.position) > CONFIG.squad.leash)) {
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
    const arresting = this.role === 'police' && !this.guard && t === this.game.player &&
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
  // eye — откуда стреляем (по умолчанию — от головы стоящего NPC).
  _shootAt(dt, t, tp, d, eye = _eye.set(this.position.x, this.visualY + 1.42, this.position.z)) {
    const N = CONFIG.npc;
    const gun = this.gun;
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
      // Бойцы отряда стреляют точнее и чаще обычных NPC.
      const S = this.follower ? CONFIG.squad : null;
      fireShot(this.game, {
        shooter: this, origin: eye, dir: _dir, weapon: gun.type,
        spread: gun.def.spread * (S ? this.game.progress.stats.spread : N.gunSpreadScale) + (moving ? 0.03 : 0),
        damageScale: N.gunDamageToPlayer, muzzle: this.model.muzzleWorld(_muzzle), weaponMesh: this.model.weaponMesh,
      });
      this.fireWait = this.rng.range(0.8, 1.4) / (gun.def.fireRate * (S ? S.fireRateScale : N.gunFireRateScale));
    }
    return true;
  }

  _recover(afterFall) {
    if (this.target && !this.target.isDead && (this.role !== 'civilian' || this.brawler)) {
      this._enter(NPC_STATE.FIGHT);
      return;
    }
    if (this.leader) {
      this._enter(NPC_STATE.FOLLOW);
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
    // Тяжело ранен и не храбрец — отступает (бандиты, полиция, бойцы отряда).
    if (this.role !== 'civilian' && this.state === NPC_STATE.FIGHT && this.health < this.maxHealth * 0.35 &&
      this.bravery < 0.5 && !this.guard) {
      this.idleTime = this.rng.range(4, 7);
      this._enter(NPC_STATE.RETREAT);
      this.say(this.rng.pick(LINES.retreat), true);
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
    if (this.role === 'civilian' && this.brawler && who !== this.game.player) {
      // Участник уличной драки (incidents.js) даёт сдачи, а не убегает.
      this.aggro(who, this.rng.pick(LINES.brawl));
      return;
    }
    if (this.role === 'civilian') {
      this.panic = 6;
      this.say(this.rng.pick(LINES.hit));
      if (this.state === NPC_STATE.IDLE || this.state === NPC_STATE.TALK || this.state === NPC_STATE.GOTO_CAR) this._enter(NPC_STATE.WALK);
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

  // --- Отряд игрока ----------------------------------------------------------

  // Идти за лидером: своё место в строю; если лидер в машине — бежать к своей двери и садиться.
  _updateFollow(dt) {
    const L = this.leader;
    if (!L || L.isDead) return 0;
    let tx, tz, near = 0.5;
    if (L.vehicle) {
      const v = L.vehicle;
      const seat = this.slot < v.passengers.length && !v.passengers[this.slot] ? this.slot : v.passengers.indexOf(null);
      if (seat < 0) return 0; // мест нет — ждём
      const [lx, lz] = v.doors[seat];
      ({ x: tx, z: tz } = v.localToWorld2D(lx, lz));
      const d = Math.hypot(tx - this.position.x, tz - this.position.z);
      if (d < 1.4 && Math.abs(v.speed) < 4) {
        this.enterAsPassenger(v, seat);
        return 0;
      }
      if (d > 45) return 0;
      near = 0;
    } else {
      const [right, back] = FOLLOW_SLOTS[this.slot % FOLLOW_SLOTS.length];
      const h = L.heading;
      tx = L.position.x - Math.sin(h) * back - Math.cos(h) * right;
      tz = L.position.z - Math.cos(h) * back + Math.sin(h) * right;
    }
    const dx = tx - this.position.x, dz = tz - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < near) {
      this.heading = dampAngle(this.heading, L.heading, 4, dt);
      return 0;
    }
    // Отстал — бежит (догоняет даже бегущего игрока), рядом — шагом.
    const speed = clamp(d * 1.7, 1.3, CONFIG.squad.runSpeed);
    this.heading = dampAngle(this.heading, Math.atan2(dx, dz), 10, dt);
    const step = Math.min(speed * dt, d);
    this.position.x += Math.sin(this.heading) * step;
    this.position.z += Math.cos(this.heading) * step;
    return speed;
  }

  // Сесть пассажиром на место seat.
  enterAsPassenger(vehicle, seat) {
    this.model.setWeapon(null);
    this.vehicle = vehicle;
    this.seat = seat;
    vehicle.passengers[seat] = this;
    vehicle.passengerAnchors[seat].add(this.model.root);
    this.model.root.position.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.knock.set(0, 0, 0);
    this.target = null;
    this.aimTime = 0;
    this._enter(NPC_STATE.DRIVE);
  }

  exitPassenger() {
    const v = this.vehicle;
    if (!v || this.seat < 0) return;
    const [lx, lz] = v.doors[this.seat];
    let spot = v.localToWorld2D(lx, lz);
    if (!this.game.world.isCircleFree(spot.x, spot.z, this.radius)) spot = v.findExitPosition(this.radius);
    v.passengers[this.seat] = null;
    this.seat = -1;
    this.vehicle = null;
    this.model.setWeapon(null);
    this.game.scene.add(this.model.root);
    this.position.set(spot.x, this.game.world.getGroundHeight(spot.x, spot.z), spot.z);
    this.visualY = this.position.y;
    this.heading = v.heading;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.set(0, this.heading, 0);
    if (this.leader) this._enter(NPC_STATE.FOLLOW);
    else {
      this.prevNode = null;
      this._setTarget(this._nearestAllowedNode());
      this._enter(NPC_STATE.WALK);
    }
  }

  // Стрельба пассажира из окна по цели отряда (target задаёт squad.js).
  _driveBy(dt) {
    const t = this.target;
    const root = this.model.root;
    if (!this.gun || !t || t.isDead || t.removed || t.vehicle) {
      this.target = null;
      this.aimTime = 0;
      this.model.setWeapon(null);
      root.rotation.y = damp(root.rotation.y, 0, 6, dt);
      return;
    }
    root.getWorldPosition(_eye);
    _eye.y += 1.2;
    const tp = t.position;
    const d = Math.hypot(tp.x - _eye.x, tp.z - _eye.z);
    if (d > CONFIG.squad.driveByRange) {
      this.target = null;
      return;
    }
    // Поворачиваемся к цели (в пределах окна) и стреляем.
    const rel = wrapAngle(Math.atan2(tp.x - _eye.x, tp.z - _eye.z) - this.vehicle.heading);
    root.rotation.y = dampAngle(root.rotation.y, clamp(rel, -1.9, 1.9), 8, dt);
    this.model.setWeapon(this.gun.type);
    this._shootAt(dt, t, tp, d, _eye);
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
    if (this.seat >= 0) {
      this.exitPassenger();
      return;
    }
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
// дальние пересоздаются рядом (в самом пустом секторе, вне поля зрения). Бандитов и полицию
// добавляют gangs.js / wanted.js. Дальше CONFIG.npc.lodDistance люди рисуются упрощённо (crowd.js).
export class NPCManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this._recycleTimer = 0;
    this.crowd = new CrowdRenderer(game.scene);
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
        if (n.state === NPC_STATE.IDLE || n.state === NPC_STATE.TALK || n.state === NPC_STATE.GOTO_CAR) n._enter(NPC_STATE.WALK);
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
      if (npc.seat >= 0) npc.vehicle.passengers[npc.seat] = null;
      else npc.vehicle.driver = null;
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
      // Только вдоль тротуара своего квартала — не на переходе посреди проезжей части.
      const links = from.links.filter((n) => n.block === from.block && (!allowed || allowed.has(n.id)));
      if (!links.length) continue;
      const to = rng.pick(links);
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
    const npc = this.add(new NPC(this.game, this.game.rng, { ...spot, role: 'civilian' }));
    npc._pickDestination();
    return npc;
  }

  // Прохожий появляется там, где людей меньше всего: вокруг игрока 8 секторов,
  // выбираем самый пустой (так люди распределены по городу, а не толпятся).
  _spawnSpread(p, minR, maxR) {
    const counts = new Array(8).fill(0);
    const sector = (x, z) => ((Math.floor(((Math.atan2(x - p.x, z - p.z) + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
    for (const n of this.list) if (n.role === 'civilian' && !n.isDead) counts[sector(n.position.x, n.position.z)]++;
    const min = Math.min(...counts);
    const want = counts.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
    const s = this.game.rng.pick(want);
    const a = ((s + 0.5) / 8) * Math.PI * 2 - Math.PI;
    const r = this.game.rng.range(minR, maxR);
    const cx = p.x + Math.sin(a) * r, cz = p.z + Math.cos(a) * r;
    // Ищем тротуар около центра сектора, но не на глазах у игрока.
    const spot = this.randomSidewalkSpot(cx, cz, 0, 40, false);
    if (!spot || this.game.inView(spot.x, 1, spot.z, 1.5) && Math.hypot(spot.x - p.x, spot.z - p.z) < 110) return null;
    const npc = this.add(new NPC(this.game, this.game.rng, { ...spot, role: 'civilian' }));
    npc._pickDestination();
    return npc;
  }

  // Двое прохожих рядом останавливаются поговорить.
  _pairTalks(time) {
    const cand = this.list.filter((n) => (n.role === 'civilian' || (n.role === 'gang' && !n.follower)) && !n.lod &&
      n.model.root.visible && (n.state === NPC_STATE.WALK || n.state === NPC_STATE.IDLE) &&
      n.panic <= 0 && !n.jogger && (n._talkAgain ?? 0) < time);
    const rng = this.game.rng;
    for (let i = 0; i < cand.length; i++) {
      const a = cand[i];
      for (let j = i + 1; j < cand.length; j++) {
        const b = cand[j];
        if (a.role !== b.role || a.gang !== b.gang) continue;
        if (a.position.distanceToSquared(b.position) > 49 || !rng.chance(0.3)) continue;
        const mx = (a.position.x + b.position.x) / 2, mz = (a.position.z + b.position.z) / 2;
        const ang = Math.atan2(a.position.x - b.position.x, a.position.z - b.position.z);
        const T = rng.range(7, 16);
        a.startTalk(b, mx, mz, ang, T);
        b.startTalk(a, mx, mz, ang + Math.PI, T);
        a._talkAgain = b._talkAgain = time + T + rng.range(30, 60);
        return;
      }
    }
  }

  // Прохожий садится в припаркованную машину рядом и уезжает.
  _useParkedCars() {
    const parked = this.game.traffic?.parked ?? [];
    if (!parked.length) return;
    const rng = this.game.rng;
    for (const n of this.list) {
      if (n.role !== 'civilian' || n.state !== NPC_STATE.WALK || n.panic > 0 || n.jogger || n.lod) continue;
      const car = parked.find((v) => !v.driver && !v.removed && !v._claimed && v.position.distanceToSquared(n.position) < 14 * 14);
      if (!car || !rng.chance(0.15)) continue;
      car._claimed = true;
      n.carTarget = car;
      n._enter(NPC_STATE.GOTO_CAR);
      return;
    }
  }

  update(dt) {
    const N = CONFIG.npc;
    const p = this.game.player.position;
    const vis2 = N.visibleDistance ** 2, freeze2 = N.freezeDistance ** 2, lod2 = N.lodDistance ** 2;
    this.time = (this.time ?? 0) + dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const npc = this.list[i];
      const d2 = (npc.position.x - p.x) ** 2 + (npc.position.z - p.z) ** 2;
      npc.model.root.visible = d2 < vis2;
      // Дальние люди — упрощённая фигура (crowd.js), водители далёких машин не рисуются.
      const lod = d2 > lod2 && !npc.ragdoll && !npc.vehicle;
      if (lod !== npc.lod) npc.lod = lod;
      npc.model.body.visible = npc.vehicle ? d2 < N.driverVisible ** 2 : !lod;
      if (d2 > freeze2 && npc.state !== NPC_STATE.FIGHT && !npc.vehicle) continue;
      npc.update(dt);
      if (npc.isDead && npc.stateTime > N.corpseTime && d2 > 900) this.remove(npc);
    }

    // Раз в секунду: дальних прохожих убираем, недостающих создаём (распределённо, вне поля
    // зрения), кто-то останавливается поговорить или уезжает на машине.
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
    for (let k = 0; k < 3 && civilians < N.count; k++) if (this._spawnSpread(p, 30, 130)) civilians++;
    this._pairTalks(this.time);
    this._useParkedCars();
  }

  // Раз в кадр: упрощённые фигуры дальних людей.
  renderCrowd(dt) {
    this.crowd.update(dt, this.list);
  }
}
