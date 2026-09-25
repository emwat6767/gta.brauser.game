import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NPC, NPC_STATE, LINES, gangLook } from './npc.js';
import { raycastCharacters, isAlly } from './ballistics.js';
import { Gun } from './weapons.js';

// Отряд игрока: бойцы его банды (friendly в CONFIG.gangs) ходят за ним и дерутся вместе с ним.
//   T / кнопка БАНДА — позвать: ближайшие свои бандиты присоединяются, недостающие прибегают;
//                      ещё раз — отпустить (возвращаются на свою территорию).
// Кого атакует отряд (по убыванию важности):
//   1. цель игрока — в кого он целится или кого бьёт/стреляет (прохожие тоже);
//   2. тех, кто напал на игрока или на бойца отряда;
//   3. полицию, пока у игрока есть розыск;
//   4. враждебные банды рядом.
// Игрок в машине — бойцы садятся к нему пассажирами и стреляют из окон.
// Толпой к игроку никто не телепортируется: отставший далеко (игрок уехал без него)
// через leaveAfter секунд возвращается в свою банду.

const _f = new THREE.Vector3(), _o = new THREE.Vector3();

function pickWeapon(rng, table) {
  let r = rng.next();
  for (const [type, p] of Object.entries(table)) if ((r -= p) < 0) return type;
  return Object.keys(table)[0];
}

export class Squad {
  constructor(game) {
    this.game = game;
    this.members = [];
    this.focus = null;       // цель, указанная игроком
    this.focusTime = 0;
    this._timer = 0;
    this.home = game.gangs.gangs.find((g) => g.friendly) ?? null;

    // Игрок кого-то бьёт или в кого-то стреляет — отряд атакует его же.
    game.events.on('character:damaged', ({ target, attacker }) => {
      const who = attacker?.driver ?? attacker;
      if (!this.members.length || !target || target.isDead) return;
      if (who === game.player && !isAlly(game, target)) this._setFocus(target);
      // На игрока или бойца напали — отвечаем обидчику.
      else if (isAlly(game, target) && who?.model && !isAlly(game, who) && !who.isDead) this._setFocus(who, 5);
    });
    // Игрок вышел из машины — пассажиры тоже; погиб/арестован — отряд расходится.
    game.events.on('vehicle:exit', ({ vehicle, who }) => {
      if (who !== game.player) return;
      for (const m of this.members) if (m.vehicle === vehicle) m.exitPassenger();
    });
    game.events.on('player:down', () => this.dismiss(true));
    // Новый уровень репутации — бойцы в отряде сразу получают бонусы.
    game.events.on('rep:level', () => {
      for (const m of this.members) if (!m.isDead) this._equip(m);
    });
  }

  get size() {
    return this.members.length;
  }

  // Бонусы от репутации (progress.js): размер отряда, здоровье, оружие, точность.
  get stats() {
    return this.game.progress.stats;
  }

  get max() {
    return this.stats.squad;
  }

  toggle() {
    if (this.members.length) this.dismiss();
    else this.call();
  }

  // Позвать банду: сначала свои бандиты рядом, остальные прибегают из-за угла.
  call() {
    const { game } = this;
    const S = CONFIG.squad;
    const p = game.player;
    if (!this.home || p.isDead) return 0;
    const free = this.max - this.members.length;
    if (free <= 0) return 0;
    const near = this.home.members
      .filter((m) => !m.isDead && !m.removed && !m.vehicle && !m.follower &&
        m.position.distanceTo(p.position) < S.recruitRadius)
      .sort((a, b) => a.position.distanceTo(p.position) - b.position.distanceTo(p.position))
      .slice(0, free);
    for (const m of near) this._join(m);
    for (let k = near.length; k < free; k++) {
      const m = this._spawn();
      if (m) this._join(m);
    }
    const n = this.members.length;
    if (n) {
      game.hud.toast(`Банда с тобой: ${n} ${n === 1 ? 'боец' : n < 5 ? 'бойца' : 'бойцов'}`, 2);
      this.members[0].say(game.rng.pick(LINES.squadJoin), true);
    }
    return n;
  }

  // Отпустить: бойцы возвращаются в свою банду (на территорию).
  dismiss(silent = false) {
    const home = this.home;
    for (const m of this.members) {
      if (m.vehicle) m.exitPassenger();
      m.follower = false;
      m.leader = null;
      if (m.removed || m.isDead) continue;
      m.allowedNodes = home.nodes;
      m.target = null;
      home.members.push(m);
      m.prevNode = null;
      m._setTarget(m._nearestAllowedNode());
      if (!m.isDown) m._enter(NPC_STATE.WALK);
    }
    if (this.members.length && !silent) this.game.hud.toast('Банда свободна', 1.5);
    this.members = [];
    this.focus = null;
  }

  _join(m) {
    const home = this.home;
    const i = home.members.indexOf(m);
    if (i >= 0) home.members.splice(i, 1); // банда пополнит свой район сама
    m.follower = true;
    m.leader = this.game.player;
    m.allowedNodes = null;
    m.slot = this._freeSlot();
    this._equip(m);
    m.health = m.maxHealth;
    m.target = null;
    m.panic = 0;
    if (!m.isDown) m._enter(NPC_STATE.FOLLOW);
    this.members.push(m);
  }

  // Здоровье и оружие бойца по текущему уровню репутации.
  _equip(m) {
    const S = this.stats;
    if (m.maxHealth < S.health) {
      m.health += S.health - m.maxHealth;
      m.maxHealth = S.health;
    }
    if (!m.gun || !(m.gun.type in S.weapons)) {
      m.gun = new Gun(pickWeapon(this.game.rng, S.weapons), 0, true);
      m.gun.mag = m.gun.def.magazine;
    }
  }

  _freeSlot() {
    for (let s = 0; s < this.max; s++) if (!this.members.some((m) => m.slot === s)) return s;
    return this.members.length;
  }

  // Новый боец появляется на тротуаре вне поля зрения и прибегает к игроку.
  _spawn() {
    const { game } = this;
    const p = game.player.vehicle ? game.player.vehicle.position : game.player.position;
    const spot = game.npcs.randomSidewalkSpot(p.x, p.z, 18, 45, true);
    if (!spot) return null;
    const npc = new NPC(game, game.rng, {
      ...spot, role: 'gang', gang: this.home.id, look: gangLook(game.rng, this.home.color),
      weapon: pickWeapon(game.rng, this.stats.weapons),
    });
    return game.npcs.add(npc);
  }

  _setFocus(target, seconds = 8) {
    if (!target || target.isDead || isAlly(this.game, target)) return;
    // Свою банду (не отряд) игрок может задеть случайно — за это не мстим.
    if (target.role === 'gang' && this.game.gangs.isFriendlyToPlayer(target.gang)) return;
    this.focus = target;
    this.focusTime = seconds;
  }

  // Цель для бойца m: указанная игроком -> обидчики -> полиция (при розыске) -> чужие банды.
  _chooseTarget(m) {
    const { game } = this;
    const S = CONFIG.squad;
    const from = m.vehicle ? m.vehicle.position : m.position;
    const range = m.vehicle ? S.driveByRange : S.engageRadius;
    const ok = (n) => n && !n.isDead && !n.removed && !n.vehicle && n.model.root.visible &&
      n.position.distanceTo(from) < range;
    if (this.focus && ok(this.focus)) return this.focus;
    let best = null, bestScore = Infinity;
    const wanted = game.wanted.level > 0;
    for (const n of game.npcs.list) {
      if (n.follower || !ok(n)) continue;
      let tier;
      if (n.target === game.player || n.target?.follower) tier = 0;
      else if (n.role === 'police' && wanted) tier = 1;
      else if (n.role === 'gang' && !game.gangs.isFriendlyToPlayer(n.gang)) tier = 2;
      else continue;
      const score = tier * 1000 + n.position.distanceTo(from);
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  // Игрок целится в человека — это цель для отряда ("банда понимает").
  _checkAim() {
    const { game } = this;
    const p = game.player;
    if (!p.aiming || p.vehicle || !p.gun) return;
    game.cameraRig.forward(_f);
    _o.copy(game.camera.position).addScaledVector(_f, game.cameraRig.distance);
    const hit = raycastCharacters(game, _o, _f, 80, p);
    if (hit && hit.character !== p) this._setFocus(hit.character, 6);
  }

  update(dt) {
    const { game } = this;
    const S = CONFIG.squad;
    this.members = this.members.filter((m) => {
      if (m.removed) return false;
      if (m.isDead) {
        m.follower = false;
        m.leader = null;
        return false;
      }
      return true;
    });
    if (this.focusTime > 0 && (this.focusTime -= dt) <= 0) this.focus = null;
    if (this.focus && (this.focus.isDead || this.focus.removed)) this.focus = null;
    if (!this.members.length) return;

    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.25;
    this._checkAim();

    const p = game.player;
    const lead = p.vehicle ? p.vehicle.position : p.position;
    let attackLine = false;
    for (const m of [...this.members]) {
      // Отстал далеко (игрок уехал/убежал) — не телепортируется, а через некоторое время
      // возвращается в свою банду. Позвать снова — T.
      const d = m.position.distanceTo(lead);
      m._far = !m.vehicle && d > S.leaveDistance ? (m._far ?? 0) + 0.25 : 0;
      if (m._far > S.leaveAfter && !game.inView(m.position.x, 1, m.position.z, 1)) {
        this._release(m);
        game.hud.news('Боец отстал и вернулся на район', this.home.color);
        continue;
      }

      // Цель.
      if (m.isDown || m.state === NPC_STATE.STUMBLE) continue;
      const cur = m.target;
      const valid = cur && !cur.isDead && !cur.removed && !cur.vehicle;
      const want = this._chooseTarget(m);
      if (m.vehicle) {
        if (m.seat >= 0 && (!valid || (want && want !== cur && want === this.focus))) m.target = want;
      } else if (want && (!valid || m.state !== NPC_STATE.FIGHT || (want === this.focus && cur !== want))) {
        m.target = null;
        if (m.state !== NPC_STATE.FIGHT) m._enter(NPC_STATE.FOLLOW);
        m.aggro(want);
        if (!attackLine && game.rng.chance(0.3)) {
          m.say(game.rng.pick(LINES.squadAttack));
          attackLine = true;
        }
      }
    }
  }

  // Отпустить одного бойца в его банду.
  _release(m) {
    const i = this.members.indexOf(m);
    if (i >= 0) this.members.splice(i, 1);
    if (m.vehicle) m.exitPassenger();
    m.follower = false;
    m.leader = null;
    if (m.removed || m.isDead) return;
    m.allowedNodes = this.home.nodes;
    m.target = null;
    this.home.members.push(m);
    m.gangRole = 'patrol';
    m.prevNode = null;
    m._setTarget(m._nearestAllowedNode());
    if (!m.isDown) m._enter(NPC_STATE.WALK);
  }
}
