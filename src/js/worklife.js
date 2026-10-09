import * as THREE from 'three';
import { NPC, NPC_STATE, LINES } from './npc.js';
import { JOBS } from './names.js';
import { lineOfSight } from './ballistics.js';

// Работа и зрелища.
//
//   Работа. У прохожих есть профессия (names.js: JOBS). По часам игрового дня (daynight.hour):
//     7:00–9:30   утренний час пик — люди с работой идут к ближайшей двери (world.doors: двери магазинов
//                 и офисов) и заходят внутрь: человек исчезает в здании, у двери копится счётчик inside;
//     12:00–13:30 обед — из дверей выходят работники, часть садится на скамейки;
//     17:00–19:30 вечерний час пик — работники выходят из дверей и расходятся по домам;
//     ночью       город пустеет (populationScale), в час пик — гуще.
//   Зрелища. watch(point, radius, seconds) — люди рядом останавливаются на расстоянии 9–16 м от места
//     (сначала проверяется прямая видимость), снимают на телефон и подбадривают. Вызывается из
//     режимов силы (powers.js), боссов (bosses.js) и при уличных драках (событие combat:hit).
//     Громкие взрывы (npc.scare) зрителей не разгоняют, пока не рвётся рядом (≤ 7 м).

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const MAX_WATCH_EVENTS = 3;
const MAX_WATCHERS = 16;
const MAX_WORKERS = 16;

export class WorkLife {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.trips = [];       // идущие на работу: NPC с workTrip = { door, since }
    this.workers = [];     // вышедшие из дверей
    this.events = [];      // места, на которые смотрят: { x, z, radius, until, watchers }
    this.hits = [];        // недавние удары: { x, z, t }
    this._tripTimer = 0;
    this._commuteTimer = 0;
    this._watchTimer = 0;
    this.phase = 'day';

    game.events.on('combat:hit', ({ target }) => {
      if (!target?.position) return;
      const p = target.position;
      this.hits.push({ x: p.x, z: p.z, t: this.time });
      this.hits = this.hits.filter((h) => this.time - h.t < 5);
      const near = this.hits.filter((h) => Math.hypot(h.x - p.x, h.z - p.z) < 8);
      if (near.length >= 3) this.watch(_a.set(p.x, p.y, p.z), 26, 14);
    });
  }

  get hour() {
    return this.game.daynight?.hour ?? 12;
  }

  // Во сколько раз людей больше/меньше обычного в этот час (NPCManager.update).
  get populationScale() {
    const h = this.hour;
    if (h >= 23 || h < 5) return 0.55;
    if (h < 7) return 0.75;
    if (h < 9.5) return 1.15;
    if (h < 17) return 1;
    if (h < 19.5) return 1.15;
    return 0.85;
  }

  // 'in' — утренний час пик, 'lunch', 'out' — вечерний, иначе 'day' / 'night'.
  get phaseNow() {
    const h = this.hour;
    if (h >= 7 && h < 9.5) return 'in';
    if (h >= 12 && h < 13.5) return 'lunch';
    if (h >= 17 && h < 19.5) return 'out';
    return h >= 22 || h < 6 ? 'night' : 'day';
  }

  // ------------------------------------------------------------------ зрители

  // Обратить внимание людей на точку (взрыв, бой, драка): они подойдут посмотреть.
  watch(point, radius = 30, seconds = 12) {
    for (const e of this.events) {
      if (Math.hypot(e.x - point.x, e.z - point.z) < 14) {
        e.until = Math.max(e.until, this.time + seconds);
        e.radius = Math.max(e.radius, radius);
        e.x += (point.x - e.x) * 0.3;
        e.z += (point.z - e.z) * 0.3;
        return;
      }
    }
    if (this.events.length >= MAX_WATCH_EVENTS) return;
    this.events.push({ x: point.x, z: point.z, radius, until: this.time + seconds, watchers: [] });
  }

  _updateWatch() {
    const { game } = this;
    const rng = game.rng;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.watchers = e.watchers.filter((n) => !n.removed && !n.isDead && n.watching === e);
      if (this.time > e.until) {
        // Расходятся: стоящие зрители просто идут дальше.
        for (const n of e.watchers) {
          n.watching = null;
          if (n.state === NPC_STATE.IDLE) n.idleTime = 0;
        }
        this.events.splice(i, 1);
        continue;
      }
      // Эмоции зрителей.
      for (const n of e.watchers) {
        if (n.state === NPC_STATE.GOTO || n.state === NPC_STATE.IDLE) {
          if (n.state === NPC_STATE.IDLE && !n.activity && rng.chance(0.5)) n.activity = 'phone';   // снимает на телефон
          if (rng.chance(0.12)) n.say(rng.pick(LINES.cheer));
        } else {
          n.watching = null;   // испугался или ввязался в драку
        }
      }
      if (e.watchers.length >= MAX_WATCHERS) continue;
      // Набираем новых зрителей.
      let added = 0;
      for (const n of game.npcs.list) {
        if (added >= 3 || e.watchers.length >= MAX_WATCHERS) break;
        if (n.role !== 'civilian' || n.fighter || n.vehicle || n.watching || n.workTrip || n.jogger || n.panic > 0) continue;
        if (n.state !== NPC_STATE.WALK && n.state !== NPC_STATE.IDLE) continue;
        if (!n.model.root.visible) continue;
        const dx = n.position.x - e.x, dz = n.position.z - e.z;
        const d = Math.hypot(dx, dz);
        if (d > e.radius * 1.6 || d < 4) continue;
        // Место на кольце 9–16 м от события, со стороны, откуда пришёл человек.
        const r = Math.min(d - 1, rng.range(9, 16));
        const spot = { x: e.x + (dx / d) * r + rng.range(-0.8, 0.8), z: e.z + (dz / d) * r + rng.range(-0.8, 0.8) };
        if (!game.world.isCircleFree(spot.x, spot.z, 0.5)) continue;
        // Место на прямой между человеком и событием: если между ними ничего нет — он и видит событие, и дойдёт по прямой.
        if (!lineOfSight(game, _a.set(n.position.x, 1.5, n.position.z), _b.set(e.x, 1.5, e.z))) continue;
        n.watching = e;
        n.activity = null;
        n.partner = null;
        n.goTo(spot.x, spot.z, Math.max(4, e.until - this.time) + rng.range(0, 4), { x: e.x, z: e.z });
        e.watchers.push(n);
        added++;
      }
    }
  }

  // ------------------------------------------------------------------ работа

  // Ближайшая дверь в 40 м, видимая с тротуара, где стоит человек.
  _doorFor(n) {
    const { game } = this;
    const rng = game.rng;
    let best = null, bestD = 40 * 40;
    for (const d of game.world.doors) {
      const d2 = (d.x - n.position.x) ** 2 + (d.z - n.position.z) ** 2;
      if (d2 < 36 || d2 >= bestD) continue;   // уже у двери — пусть идёт дальше
      if (n.job === 'office' && game.world.districtAt(d.x, d.z) !== 'downtown' && rng.chance(0.7)) continue;
      best = d;
      bestD = d2;
    }
    if (!best) return null;
    _a.set(n.position.x, 1.4, n.position.z);
    _b.set(best.x, 1.4, best.z);
    return lineOfSight(game, _a, _b) ? best : null;
  }

  // Утро: люди с работой идут к двери.
  _commuteIn() {
    const { game } = this;
    const p = game.player.position;
    let started = 0;
    for (const n of game.npcs.list) {
      if (started >= 2) break;
      if (n.role !== 'civilian' || n.fighter || n.vehicle || n.workTrip || n.watching || n.jogger) continue;
      if (!n.job || !JOBS[n.job]?.commutes || n.state !== NPC_STATE.WALK || n.panic > 0) continue;
      if (!n.model.root.visible || n.position.distanceToSquared(p) > 90 * 90) continue;
      if (!game.rng.chance(0.3)) continue;
      const door = this._doorFor(n);
      if (!door) continue;
      n.workTrip = { door, since: this.time };
      n.goTo(door.x, door.z, 0.2);
      if (game.rng.chance(0.25)) n.say(game.rng.pick(['Опаздываю!', 'Скорее на работу...', 'Доброе утро!', 'Кофе, мне нужен кофе']));
      this.trips.push(n);
      started++;
    }
  }

  // Идущие на работу: дошёл до двери — заходит внутрь (исчезает).
  _updateTrips() {
    const { game } = this;
    for (let i = this.trips.length - 1; i >= 0; i--) {
      const n = this.trips[i];
      const t = n.workTrip;
      if (n.removed || n.isDead || !t) { this.trips.splice(i, 1); continue; }
      const busy = n.state !== NPC_STATE.GOTO && n.state !== NPC_STATE.IDLE;
      if (busy || n.panic > 0 || this.time - t.since > 45) {
        n.workTrip = null;
        this.trips.splice(i, 1);
        continue;
      }
      const d = Math.hypot(t.door.x - n.position.x, t.door.z - n.position.z);
      if (d < 1.8 || (n.state === NPC_STATE.IDLE && d < 5)) {
        t.door.inside++;
        this.trips.splice(i, 1);
        n.workTrip = null;
        game.npcs.remove(n);
      }
    }
  }

  // Вечер и обед: из двери выходит работник.
  _leaveDoors(phase) {
    const { game } = this;
    const rng = game.rng;
    const p = game.player.position;
    this.workers = this.workers.filter((n) => !n.removed && !n.isDead);
    if (this.workers.length >= MAX_WORKERS) return;
    const doors = game.world.doors;
    if (!doors.length) return;
    let spawned = 0;
    for (let k = 0; k < 14 && spawned < 2; k++) {
      const d = rng.pick(doors);
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < 12 || dist > 85) continue;
      if (!(d.inside > 0 || rng.chance(0.25))) continue;
      if (game.npcs.list.some((n) => Math.abs(n.position.x - d.x) < 1.4 && Math.abs(n.position.z - d.z) < 1.4)) continue;
      if (!game.world.isCircleFree(d.x, d.z, 0.4)) continue;
      const district = game.world.districtAt(d.x, d.z);
      const npc = new NPC(game, rng, { x: d.x, z: d.z, role: 'civilian', district, job: district === 'downtown' ? 'office' : rng.pick(['shop', 'cafe', 'office']) });
      npc.heading = Math.atan2(d.nx, d.nz);
      npc.worker = true;
      game.npcs.add(npc);
      if (phase === 'lunch' && rng.chance(0.5) && npc._goSit()) { /* пошёл на скамейку */ }
      else npc._pickDestination();
      d.inside = Math.max(0, d.inside - 1);
      this.workers.push(npc);
      spawned++;
    }
  }

  update(dt) {
    const { game } = this;
    this.time += dt;
    this.phase = this.phaseNow;

    this._watchTimer -= dt;
    if (this._watchTimer <= 0) {
      this._watchTimer = 0.8;
      if (this.events.length) this._updateWatch();
    }
    this._tripTimer -= dt;
    if (this._tripTimer <= 0) {
      this._tripTimer = 0.3;
      if (this.trips.length) this._updateTrips();
    }
    this._commuteTimer -= dt;
    if (this._commuteTimer <= 0) {
      this._commuteTimer = 1.4;
      if (game.downState) return;
      if (this.phase === 'in') this._commuteIn();
      else if (this.phase === 'out' || this.phase === 'lunch') this._leaveDoors(this.phase);
    }
  }
}
