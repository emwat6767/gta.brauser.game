import * as THREE from 'three';
import { CONFIG } from './config.js';
import { fireShot } from './ballistics.js';
import { Vehicle } from './vehicle.js';
import { NPC_STATE } from './npc.js';
import { PrisonCrew, jumpsuitLook, guardUniformLook } from './prison-crew.js';
import { PrisonUI } from './prison-ui.js';
import { installSocial } from './prison-social.js';
import {
  ITEMS, SENTENCE_HOURS, FINE, ESCAPE_EXTRA_HOURS, BAIL_BASE, BAIL_PER_HOUR, SCHEDULE, phaseAt, GUARD_WARN, GUARD_CAUGHT, TOWER_WARN,
} from './prison-data.js';

// Тюрьма «Редрок»: арест → срок → тюремная жизнь → побег → беглец → снова арест или свобода.
//
//   state 'free'     — обычная жизнь. Арест (wanted.js → main._respawn) отправляет сюда: приём, роба, камера, срок.
//   state 'inside'   — отбываешь срок: расписание дня, друзья, лавка, работа, спорт, подкоп, сетка и стена, форма, взятка, бунт.
//                      Срок идёт по игровым часам; спать/ждать можно с перемоткой. Срок можно сократить адвокатом или внести залог.
//   state 'fugitive' — сбежал: розыск в городе, но полицейский, который просто нашёл, не арестовывает — арест происходит,
//                      только когда поймают (wanted.js: арест и на высоких звёздах). Пойманный возвращается с добавкой к сроку и карцером.
//
// Люди — prison-crew.js (заключённые, охрана, расписание, пути A*). Окна — prison-ui.js. Разговоры, подарки,
// розыгрыши, карты, спарринги — prison-social.js (подмешивается в PrisonSystem).

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const NIGHT_CHECKS = [1, 4];
const wrap = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const fmtHours = (h) => {
  h = Math.max(0, Math.ceil(h));
  const d = Math.floor(h / 24), r = h % 24;
  return d ? `${d} д ${r} ч` : `${r} ч`;
};
export const fmtClock = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const RESTRICTED = new Set(['warden', 'armory', 'seg', 'gate', 'strip']);

export class PrisonSystem {
  constructor(game) {
    this.game = game;
    this.layout = game.world.prison ?? null;
    this.ready = !!this.layout;
    this.state = 'free';
    this.served = 0;           // отсижено часов
    this.total = 0;            // срок, часов
    this.cellIdx = 0;
    this.inv = {};             // вещи на руках
    this.stash = {};           // тайник в тумбочке
    this.know = new Set();     // что известно (слухи): tunnel, fence, ...
    this.rumorsSeen = new Set();
    this.stats = { respect: 0, strength: 0, days: 0, escapes: 0, jobs: 0, wins: 0, bribed: 0 };
    this.sus = 0;
    this.alert = 0;            // 0 тихо, 2 тревога (побег), 3 бунт
    this.alertTimer = 0;
    this.sinceSeen = 99;
    this.dig = 0;
    this.tunnel = false;
    this.dummyReady = false;
    this.wearing = null;       // null | 'uniform'
    this.bribe = 0;            // секунд действия взятки
    this.distract = 0;         // друзья отвлекают охрану
    this.action = null;
    this.target = null;
    this.busy = false;
    this.holdCrew = false;
    this.lawyerVisits = 0;
    this.lastCallDay = -1;
    this.flags = {};
    this.fugitive = { timer: 0, hunt: 0, disguised: false };
    this.t = 0;
    this.lastHour = null;
    this.liftToday = 0;
    this.patdown = 0;
    this.dayPlan = { day: -1 };
    this._obsTimer = 0;
    this._scanTimer = 0;
    this._hudTimer = 0;
    this._fugTimer = 0;
    this._lastPhaseId = null;
    this.allies = [];
    this.spar = null;
    this.prevLook = null;
    this._susKey = '';
    this._objKey = '';
    this.pending = null;
    if (!this.ready) return;
    this.crew = new PrisonCrew(this);
    this.ui = new PrisonUI(this);
    this.sentry = { position: new THREE.Vector3(), role: 'police', isDead: false, name: 'Часовой', prisonSentry: true, velocity: new THREE.Vector3() };
    this.towerCd = this.layout.towers.map((_, i) => 0.4 + i * 0.3);
    this.towerWarn = 0;
    for (const cell of this.layout.cells) this._initDoor(cell);
    for (const cell of this.layout.holeCells) this._initDoor(cell);
    this._buildStations();
    this._hooks();
    this._syncDoors(true);
  }

  // ---------------------------------------------------------------- простые свойства
  get inCustody() { return this.ready && this.state === 'inside'; }
  get hour() { return this.game.daynight.hour; }
  get cell() { return this.layout.cells[this.cellIdx]; }
  get phase() { return phaseAt(this.hour); }
  get left() { return Math.max(0, this.total - this.served); }
  get isNight() { const h = this.hour; return h >= 21.5 || h < 6; }
  get jumpsuit() { return this.game.player.model.look?.pants === '#e2670a'; }
  get contrabandCount() { return this._illegalIn(this.inv); }

  has(id) { return (this.inv[id] ?? 0) > 0; }
  give(id, n = 1) { this.inv[id] = (this.inv[id] ?? 0) + n; this.game.save?.markDirty(); }
  take(id, n = 1) {
    if (!this.has(id)) return false;
    this.inv[id] -= n;
    if (this.inv[id] <= 0) delete this.inv[id];
    return true;
  }
  _illegalIn(bag) { let n = 0; for (const [k, v] of Object.entries(bag)) if (ITEMS[k]?.illegal) n += v; return n; }

  // ---------------------------------------------------------------- события
  _hooks() {
    const { game } = this;
    game.events.on('character:damaged', ({ target, attacker, amount }) => {
      if (!this.inCustody) return;
      const p = game.player;
      if (target === p && attacker?.prisonGuard && !this.busy && p.health < p.maxHealth * 0.22) {
        this.subdue('Охранники скрутили вас и поволокли в карцер');
        return;
      }
      if (attacker === p && target?.prisonGuard) this._onPlayerHitGuard(target);
      if (attacker === p && target?.prisonInmate && !this.spar) this._onPlayerHitInmate(target, amount);
    });
    game.events.on('character:killed', ({ target, attacker }) => {
      if (!this.ready) return;
      if (attacker === game.player && target?.prisonGuard) {
        if (this.inCustody) this.startAlarm('Убит охранник!', true);
        else if (this.state === 'fugitive' || this.state === 'free') game.wanted.addHeat(1, 3);
      }
      if (attacker === game.player && target?.prisonInmate && this.inCustody) {
        this.total += 24;
        game.hud.toast('Убийство заключённого: срок +24 ч', 3);
        this.startAlarm('Убит заключённый!', false);
      }
    });
  }

  _onPlayerHitGuard(g) {
    if (this.bribe > 0) return;
    this.startAlarm('Нападение на охранника!', true);
  }

  _onPlayerHitInmate(npc, amount) {
    const rec = npc.prisonInmate;
    if (!rec) return;
    // Видел ли кто-то из охраны: рядом и в поле зрения.
    const pp = this.game.player.position;
    for (const g of this.crew.guards) {
      const n = g.npc;
      if (!n || n.isDead) continue;
      if (Math.hypot(n.position.x - pp.x, n.position.z - pp.z) < 18 && this._losSoft(n.position.x, 1.5, n.position.z, pp.x, 1.3, pp.z)) {
        this.sus = Math.min(1.2, this.sus + 0.55);
        n.say(GUARD_WARN[(Math.random() * GUARD_WARN.length) | 0], true);
        break;
      }
    }
    this.addFriend(rec, -6 * Math.min(2, amount / 10), 'драка');
  }

  onInmateAttacked(npc, who) {
    const rec = npc.prisonInmate;
    if (!rec || !who) return;
    if (who.prisonGuard && !this.crew.riot) return;     // охраны побаиваются
    if (who === this.game.player && this.spar?.rec === rec) return;
    const lv = this.friendLevelOf(rec);
    if (lv >= 3 && who === this.game.player) { npc.say('Эй, свои же!', true); return; }
    if (who.prisonInmate && !this.crew.riot) return;
    const brave = rec.trait === 'tough' || rec.trait === 'boss' || rec.trait === 'jokester' || rec.fighter;
    if (brave || Math.random() < 0.4) npc.aggro(who, ['Ну всё, ты нарвался!', 'Сам напросился!', 'Получай!'][(Math.random() * 3) | 0]);
    else {
      npc.say('Не надо, не надо!', true);
      rec.hold = this.crew.t + 3;
    }
    if (who === this.game.player) {
      this.addFriend(rec, -4, 'драка');
      // друзья игрока вступаются
      for (const o of this.crew.inmates) {
        const n = o.npc;
        if (!n || n.isDead || o === rec || n.state === NPC_STATE.FIGHT) continue;
        if (this.friendLevelOf(o) >= 3 && Math.hypot(n.position.x - npc.position.x, n.position.z - npc.position.z) < 12) n.aggro(npc, 'Не трогай моего брата!');
      }
    }
  }

  _onInmateDied(rec) {
    this.game.hud.news(`В «Редроке» погиб заключённый: ${rec.name}`, '#ff8a8a');
  }

  _onGuardDied(g) {
    this.game.hud.news(`Убит охранник «Редрока»: ${g.name}`, '#ff6a6a');
  }

  // ---------------------------------------------------------------- расписание
  _onPhase(ph) {
    if (this._lastPhaseId === ph.id) return;
    this._lastPhaseId = ph.id;
    this._syncDoors();
    if (!this.inCustody) return;
    const msg = { count: 'ПОДЪЁМ! Перекличка у камер', breakfast: 'Завтрак в столовой', work: 'Работы: прачечная, кухня, библиотека. Двор открыт', lunch: 'Обед', yard: 'Прогулка во дворе', count2: 'Вечерняя поверка у камер', dinner: 'Ужин', rec: 'Свободное время', lockin: 'Возвращайтесь в камеры! Отбой в 21:30', night: 'Отбой. Свет погашен. Камеры заперты' }[ph.id];
    if (msg) this.game.hud.news(`${fmtClock(this.hour)} · ${msg}`, '#9ad0ff');
    if (ph.id === 'count') {
      this.liftToday = 0;
      this.stats.days++;
      this.dayPlan = { day: this.crew.day, search: Math.random() < 0.4, patdown: Math.random() < 0.4, patAt: 12.7 + Math.random() * 2.8, done: {} };
    }
    if (ph.id === 'lockin') this.game.hud.toast('Скоро отбой — идите в камеру!', 3);
  }

  _syncDoors(instant = false) {
    const h = this.hour;
    const locked = (h >= 21.5 || h < 6 || this.alert >= 2) && this.alert !== 3;
    for (const cell of this.layout.cells) this._setDoor(cell, !locked, instant);
  }

  // ---------------------------------------------------------------- двери и ворота
  _initDoor(cell) {
    const d = cell.doorMesh;
    cell.open = 0;
    cell.targetOpen = 0;
    cell.colOn = true;
    const [nx, nz] = cell.w ? cell.w.normalW : cell.outwardW;
    const ang = d.userData.closedAngle;
    const ax = Math.cos(ang), az = -Math.sin(ang);          // куда смотрит «вдоль» двери в закрытом положении
    cell.openSign = Math.sign(az * nx - ax * nz) || 1;
  }

  _setDoor(cell, open, instant = false) {
    cell.targetOpen = open ? 1 : 0;
    if (instant) { cell.open = cell.targetOpen; this._applyDoor(cell); }
    if (open && cell.colOn) { this.game.world.colliders.remove(cell.collider); cell.colOn = false; }
    if (!open && !cell.colOn) { this.game.world.colliders.add(cell.collider); cell.colOn = true; }
  }

  _applyDoor(cell) {
    cell.doorMesh.rotation.y = cell.doorMesh.userData.closedAngle + cell.openSign * cell.open * 1.75;
  }

  setGate(gt, open) {
    gt.target = open ? 1 : 0;
    if (!open && !gt.colOn) { this.game.world.colliders.add(gt.collider); gt.colOn = true; }
  }

  openGates(seconds) {
    const G = this.layout.gates;
    this.setGate(G.inner, true);
    this.setGate(G.outer, true);
    this.gateTimer = seconds;
    this.game.audio.alarm?.(this.game.player.position);
  }

  _animate(dt) {
    const L = this.layout;
    const k = Math.min(1, dt * 5);
    for (const cell of [...L.cells, ...L.holeCells]) {
      if (Math.abs(cell.open - cell.targetOpen) > 0.002) {
        cell.open += (cell.targetOpen - cell.open) * k;
        this._applyDoor(cell);
      }
    }
    if (this.gateTimer > 0 && (this.gateTimer -= dt) <= 0 && this.alert < 3) {
      this.setGate(L.gates.inner, false);
      this.setGate(L.gates.outer, false);
    }
    for (const gt of L.gates.list) {
      gt.colOn ??= true;
      if (Math.abs(gt.open - gt.target) > 0.002) {
        gt.open += (gt.target - gt.open) * Math.min(1, dt * 2.5);
        gt.planeL.position.x = -1.25 - gt.open * 2.35;
        gt.planeR.position.x = 1.25 + gt.open * 2.35;
      }
      if (gt.open > 0.7 && gt.colOn) { this.game.world.colliders.remove(gt.collider); gt.colOn = false; }
    }
    // Прожекторы вышек: ночью светятся и вращаются.
    const h = this.hour;
    const night = h >= 19.3 || h < 6.3;
    for (const b of L.beams) {
      b.angle += b.speed * dt;
      b.mesh.visible = night;
      if (night) b.mesh.lookAt(b.x + Math.sin(b.angle) * 28, 0.2, b.z + Math.cos(b.angle) * 28);
    }
  }

  _inBeam(pp) {
    for (const b of this.layout.beams) {
      const dx = pp.x - b.x, dz = pp.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d > 31) continue;
      const ang = Math.atan2(dx, dz);
      if (Math.abs(wrap(ang - b.angle)) < Math.max(0.12, 0.3 - d * 0.004)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- взгляды
  // Прямая видимость с «мягкими» препятствиями: решётка, сетка и стекло не мешают смотреть.
  _losSoft(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dz = z1 - z0, dy = y1 - y0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / 0.5));
    const colliders = this.game.world.colliders;
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const x = x0 + dx * t, z = z0 + dz * t, y = y0 + dy * t;
      const list = colliders.query(x, z, x, z);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.see || b.type === 'tree' || b.type === 'lamp') continue;
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.height && y > 0) return false;
      }
    }
    return true;
  }

  _inOwnCell(pos = this.game.player.position) {
    const [lx, lz] = this.layout.toLocal(pos.x, pos.z);
    const [x0, z0, x1, z1] = this.cell.rect;
    return lx >= x0 - 0.15 && lx <= x1 + 0.15 && lz >= z0 - 0.15 && lz <= z1 + 0.15;
  }

  _zone() {
    const p = this.game.player.position;
    return this.layout.zoneAt(p.x, p.z);
  }

  _canSee(g, npc, pp, night, noise) {
    const dx = pp.x - npc.position.x, dz = pp.z - npc.position.z;
    const d = Math.hypot(dx, dz);
    const p = this.game.player;
    let R = night ? 15 : 24;
    const sp = p.horizontalSpeed;
    R *= sp > 4.5 ? 1.25 : sp < 0.5 ? 0.6 : 1;
    if (this.wearing === 'uniform') R *= 0.4;
    if (noise && d < noise) return true;
    if (d > R) return false;
    if (this.alert < 2 && d > 2.5) {
      const dot = (dx * Math.sin(npc.heading) + dz * Math.cos(npc.heading)) / d;
      if (dot < 0.3) return false;
    }
    return this._losSoft(npc.position.x, 1.5, npc.position.z, pp.x, p.position.y + 1.3, pp.z);
  }

  _towerSees(t, pp, night) {
    const tp = this.layout.P(t.x, t.z);
    const d = Math.hypot(pp.x - tp.x, pp.z - tp.z);
    if (d > 55) return false;
    if (night && d > 14 && !this._inBeam(pp)) return false;
    return this._losSoft(tp.x, 10.3, tp.z, pp.x, this.game.player.position.y + 1.3, pp.z);
  }

  _wallZone(pp = this.game.player.position) {
    const [lx, lz] = this.layout.toLocal(pp.x, pp.z);
    const m = Math.max(Math.abs(lx), Math.abs(lz));
    return m > 32 && m < 37.6;
  }

  // ---------------------------------------------------------------- подозрение охраны
  _observe(dt) {
    const { game } = this;
    const p = game.player;
    const pp = p.position;
    const zone = this._zone();
    const night = this.isNight;
    const inCell = this._inOwnCell();
    const outside = !this.layout.inCompound(pp.x, pp.z);
    const a = this.action;
    let rate = 0, major = false, reason = '', noise = 0;
    if (a?.illegal) { rate = a.rate ?? 0.6; major = !!a.major; reason = a.label; noise = a.noise ?? 0; }
    else if (this.wearing === 'uniform') {
      if (!this.has('idcard')) { rate = 0.2; reason = 'нет пропуска'; }
    } else {
      if (night && !inCell && !outside) { rate = 0.5; reason = 'вне камеры после отбоя'; }
      if (zone && RESTRICTED.has(zone.id)) {
        const r2 = zone.id === 'strip' ? 1.1 : night ? 0.75 : 0.5;
        if (r2 > rate) { rate = r2; reason = `запретная зона: ${zone.name}`; major = zone.id === 'strip'; }
      }
      if (this._wallZone(pp) && !zone) { rate = 1.1; major = true; reason = 'у стены'; }
    }
    if (this.bribe > 0 || this.phase.id === 'gone') rate = 0;
    if (this.distract > 0) rate *= 0.4;
    if (outside) rate = 0;

    let seen = false, seer = null;
    if (rate > 0) {
      for (const g of this.crew.guards) {
        const n = g.npc;
        if (!n || n.isDead || g.noGuard || n.state === NPC_STATE.FIGHT) continue;
        if (g.id === 'clerk' || g.id === 'medic') continue;
        if (this._canSee(g, n, pp, night, noise)) { seen = true; seer = g; break; }
      }
      if (!seen && (zone?.id === 'strip' || this._wallZone(pp) || a?.id === 'climb')) {
        for (const t of this.layout.towers) {
          if (this._towerSees(t, pp, night)) { seen = true; seer = { tower: t }; break; }
        }
      }
    }
    if (seen) {
      this.sus = Math.min(1.5, this.sus + rate * dt);
      this.sinceSeen = 0;
      if (this.sus >= 0.5 && !this.warned) {
        this.warned = true;
        const n = seer?.npc;
        if (n) { n.say(GUARD_WARN[(Math.random() * GUARD_WARN.length) | 0], true); this.crew.hold(seer, 2.5); }
        game.hud.toast(`Охрана обратила на вас внимание: ${reason}`, 2.6);
      }
      if (this.sus >= 1) {
        this.sus = 0.45;
        this.warned = false;
        if (major || this.alert >= 2) this.startAlarm(reason || 'Побег!', true);
        else if (a?.illegal) this._caughtRedHanded(a);
        else this.punish('hole', 6, GUARD_CAUGHT[(Math.random() * GUARD_CAUGHT.length) | 0]);
      }
    } else {
      this.sinceSeen += dt;
      this.sus = Math.max(0, this.sus - dt * 0.14);
      if (this.sus < 0.2) this.warned = false;
    }
  }

  // Поймали за контрабандой или подкопом: всё отобрали, подкоп засыпали, карцер.
  _caughtRedHanded(a) {
    this._cancelAction(true);
    for (const k of Object.keys(this.inv)) if (ITEMS[k]?.illegal) delete this.inv[k];
    if (a.id === 'dig' && this.dig > 0) { this.dig = Math.max(0, this.dig - 0.45); this.game.hud.toast('Подкоп частично засыпали', 3); }
    this.punish('hole', 8, 'Вас поймали с поличным: контрабанда отобрана');
  }

  // ---------------------------------------------------------------- тревога, наказания
  startAlarm(reason, violent) {
    if (!this.inCustody && this.state !== 'fugitive') return;
    const { game } = this;
    if (this.alert < 2) game.hud.news(`ТРЕВОГА в «Редроке»: ${reason}`, '#ff5a5a');
    this.alert = Math.max(this.alert, 2);
    this.alertTimer = Math.max(this.alertTimer, 75);
    this.sus = 0;
    this.warned = false;
    this.crew.setLockdown(true);
    this._syncDoors();
    this.setGate(this.layout.gates.inner, false);
    this.setGate(this.layout.gates.outer, false);
    game.audio.alarm?.(game.player.position);
    this.ui.setAlarm(true);
    for (const g of this.crew.guards) {
      const n = g.npc;
      if (n && !n.isDead && !g.noGuard && g.id !== 'clerk') n.aggro(game.player, ['Тревога!', 'Стоять!', 'Он здесь!'][(Math.random() * 3) | 0]);
    }
    if (violent) game.hud.toast('ТРЕВОГА! Охрана ловит вас', 3);
  }

  _endAlarm(silent) {
    if (this.alert === 0) return;
    this.alert = 0;
    this.alertTimer = 0;
    this.crew.setLockdown(false);
    this.crew.calmAll();
    this._syncDoors();
    this.ui.setAlarm(false);
    if (!silent) this.game.hud.news('Отбой тревоги в «Редроке»', '#9ad0ff');
  }

  async subdue(message) {
    if (this.busy) return;
    this.game.player.health = Math.max(this.game.player.health, 35);
    await this.punish('hole', 8, message);
  }

  // Затемнение с работой в темноте: что бы ни случилось внутри, экран вернётся.
  async _blackout(text, work, hold = 900) {
    const { ui } = this;
    await ui.dark(text);
    try {
      await work();
      await ui.wait(hold);
    } catch (e) {
      console.error(e);
    }
    await ui.light();
  }

  // Наказание: карцер (перемотка времени) + добавка к сроку.
  async punish(kind, hours, message) {
    if (this.busy || !this.inCustody) return;
    this.busy = true;
    this._cancelAction(true);
    const { game, ui } = this;
    try {
      await this._blackout(`${message}\n\nКАРЦЕР · ${hours} ч в тишине`, async () => {
        this._endAlarm(true);
        const L = this.layout;
        const h = L.holeCells[Math.floor(Math.random() * L.holeCells.length)];
        this._setDoor(h, false, true);
        const pin = h.inside;
        game.player.position.set(pin.x, game.world.getGroundHeight(pin.x, pin.z), pin.z);
        game.player.velocity.set(0, 0, 0);
        this._advance(hours, { silent: true });
        this.total += Math.round(hours / 2);
        this.sus = 0;
        this.warned = false;
        game.player.health = Math.min(game.player.maxHealth, game.player.health + 25);
        if (this.wearing) this._takeOffUniform(true);
        await ui.wait(1500);
        this._setDoor(h, true);
        const out = h.outside;
        game.player.position.set(out.x, game.world.getGroundHeight(out.x, out.z), out.z);
        game.cameraRig.initialized = false;
      }, 200);
      game.hud.toast(`Карцер окончен. Срок +${Math.round(hours / 2)} ч`, 3.5);
    } finally {
      this.busy = false;
    }
  }

  // ---------------------------------------------------------------- время
  // Пролистать время: срок идёт, проверки отрабатываются.
  _advance(hours, { silent = false } = {}) {
    const d = this.game.daynight;
    const prev = d.hour;
    d.hour = (d.hour + hours) % 24;
    d.update(0, true);
    if (this.inCustody) {
      this.served += hours;
      this._eventsBetween(prev, hours);
    }
    this.lastHour = d.hour;
    this.crew.update(0);
    this.crew.snapAll();
    this._syncDoors(true);
    void silent;
  }

  _crossed(prev, now, h) {
    return prev <= now ? prev < h && now >= h : prev < h || now >= h;
  }

  _eventsBetween(prev, hours) {
    const end = (prev + hours) % 24;
    // Сколько полных суток пролистали — на каждые тоже: проверки
    let t = prev;
    let left = hours;
    while (left > 0) {
      const step = Math.min(left, 24);
      const e = (t + step) % 24;
      for (const h of NIGHT_CHECKS) if (this._crossed(t, e, h) || step >= 24) this.nightCheck();
      if (this._crossed(t, e, 6) || step >= 24) this.crew.day += 0;   // день считает crew по смене фазы
      t = e;
      left -= step;
    }
    void end;
  }

  _tickTime(dt) {
    const d = this.game.daynight;
    if (!d.frozen) this.served += dt * d.speed;
    const now = d.hour;
    const prev = this.lastHour ?? now;
    const delta = (now - prev + 24) % 24;
    if (delta > 1.5) { this.lastHour = now; return; }     // рывок часов (перемотка или отладка): события отрабатывает _advance
    if (prev !== now) {
      for (const h of NIGHT_CHECKS) if (this._crossed(prev, now, h)) this.nightCheck();
      if (this._crossed(prev, now, 9.8) && this.dayPlan.search && !this.dayPlan.done.search) this._cellSearch();
      if (this._crossed(prev, now, 21.5)) { this._syncDoors(); this._lockIn(); }
      if (this.dayPlan.patdown && !this.dayPlan.done.pat && this.dayPlan.patAt && this._crossed(prev, now, this.dayPlan.patAt)) {
        this.dayPlan.done.pat = true;
        this.patdown = 70;
        this.game.hud.news('ОБЫСК во дворе! Охрана проверяет карманы', '#ffcf5a');
        this.game.hud.toast('Общий обыск: держитесь подальше от охраны или спрячьте контрабанду!', 4);
      }
    }
    this.lastHour = now;
  }

  // Вечерний запор: игрока уводят в камеру, если он не там.
  _lockIn() {
    if (this._inOwnCell() || this.busy) return;
    const p = this.game.player;
    if (this.alert >= 2 || this.action) return;
    const c = this.cell.w.inside;
    this.game.hud.toast('Охрана отвела вас в камеру', 3);
    p.position.set(c.x, this.game.world.getGroundHeight(c.x, c.z), c.z);
    p.velocity.set(0, 0, 0);
    this.game.cameraRig.initialized = false;
  }

  nightCheck() {
    if (!this.inCustody) return;
    const empty = !this._inOwnCell();
    if (!empty) return;
    if (this.dummyReady || this.has('dummy')) {
      if (!this.dummyReady && this.take('dummy')) this.dummyReady = true;
      this.dummyReady = false;
      this.game.hud.toast('Ночная проверка: охранник увидел «спящего» и прошёл мимо', 4);
      return;
    }
    if (!this.layout.inCompound(this.game.player.position.x, this.game.player.position.z)) {
      this._escapeDiscovered();
      return;
    }
    this.startAlarm('Пустая койка при ночной проверке!', false);
  }

  _escapeDiscovered() {
    this.game.hud.news('Побег обнаружен! Заключённый «Редрока» на свободе!', '#ff5a5a');
  }

  _cellSearch() {
    this.dayPlan.done.search = true;
    this.game.hud.news('Обыск камер в блоках A и B', '#ffcf5a');
    const n = this._illegalIn(this.stash);
    if (n > 0 && Math.random() < 0.6) {
      for (const k of Object.keys(this.stash)) if (ITEMS[k]?.illegal) delete this.stash[k];
      this.game.hud.toast('Охрана нашла контрабанду в вашей тумбочке! Срок +6 ч', 4);
      this.total += 6;
    }
  }

  _patDown() {
    this.patdown = 0;
    const n = this._illegalIn(this.inv);
    if (n > 0 && this.bribe <= 0) {
      for (const k of Object.keys(this.inv)) if (ITEMS[k]?.illegal) delete this.inv[k];
      this.dummyReady = false;
      this.game.hud.toast('Обыск: у вас нашли контрабанду! Всё конфисковано', 4);
      this.punish('hole', 6, 'Контрабанда при обыске');
    } else {
      this.game.hud.toast('Обыск: чисто. Проходите', 2.5);
    }
  }

  // ---------------------------------------------------------------- вышки
  _towers(dt) {
    const L = this.layout, { game } = this;
    const pp = game.player.position;
    const inside = this.inCustody;
    const fug = this.state === 'fugitive' && this.fugitive.hunt > 0;
    if (!inside && !fug) { this.towerWarn = 0; return; }
    if (game.player.isDead || this.busy) return;
    const night = this.isNight;
    const wallZone = this._wallZone(pp);
    const outside = !L.inCompound(pp.x, pp.z);
    const zone = L.zoneAt(pp.x, pp.z);
    const hostile = this.bribe <= 0 && (
      (inside && (wallZone || zone?.id === 'strip' || (outside && this._nearWall(pp, 16)))) || this.alert >= 2 || fug);
    if (!hostile) { this.towerWarn = Math.max(0, this.towerWarn - dt); return; }
    for (let i = 0; i < L.towers.length; i++) {
      const t = L.towers[i];
      const tp = L.P(t.x, t.z);
      const d = Math.hypot(pp.x - tp.x, pp.z - tp.z);
      if (d > (this.alert >= 2 || fug ? 48 : 40)) continue;
      if (night && d > 12 && !this._inBeam(pp) && !(this.alert >= 2 && d < 26)) continue;
      if (!this._losSoft(tp.x, 10.4, tp.z, pp.x, pp.y + 1.3, pp.z)) continue;
      if (this.alert < 2 && !fug && this.towerWarn < 2.2) {
        if (this.towerWarn === 0) game.hud.toast(TOWER_WARN[(Math.random() * TOWER_WARN.length) | 0], 2.4);
        this.towerWarn += dt;
        continue;
      }
      this.towerCd[i] -= dt;
      if (this.towerCd[i] > 0) continue;
      this.towerCd[i] = 1.15 + Math.random() * 0.5;
      this.sentry.position.set(tp.x, 10.4, tp.z);
      _v.set(tp.x, 10.4, tp.z);
      _w.set(pp.x, pp.y + 1.1, pp.z);
      _d.subVectors(_w, _v).normalize();
      fireShot(game, { shooter: this.sentry, origin: _v.clone(), dir: _d.clone(), weapon: 'pistol', spread: 0.015 + d * 0.0014, damageScale: 0.55 });
    }
  }

  _nearWall(pp, r) {
    const [lx, lz] = this.layout.toLocal(pp.x, pp.z);
    const m = Math.max(Math.abs(lx), Math.abs(lz));
    return m < 37.5 + r;
  }

  // ---------------------------------------------------------------- арест и приём
  intakePoint() {
    const p = this.layout.stations.intake;
    return { x: p.x, z: p.z, heading: this.layout.headingW(0) };
  }

  infirmaryPoint() {
    const p = this.layout.stations.infirmary;
    return { x: p.x, z: p.z, heading: this.layout.headingW(Math.PI) };
  }

  // Вызывается из main._respawn до возрождения: запоминаем срок.
  beginArrest() {
    const { game } = this;
    const level = Math.max(1, game.wanted.level);
    const wasFugitive = this.state === 'fugitive';
    return { level, wasFugitive, point: this.intakePoint() };
  }

  // После возрождения у приёмного отделения.
  completeArrest(info) {
    const { game } = this;
    const p = game.player;
    if (game.powers.mode !== 'normal') game.powers.set('normal');
    game.squad?.size && game.squad.toggle();
    game.missions?.cancel?.();
    this.state = 'inside';
    const hours = SENTENCE_HOURS[Math.min(5, info.level)] + (info.wasFugitive ? ESCAPE_EXTRA_HOURS : 0);
    const fine = Math.min(game.wallet.money, FINE[Math.min(5, info.level)] * (info.wasFugitive ? 2 : 1));
    if (fine > 0) game.wallet.spend(fine);
    this.served = 0;
    this.total = hours;
    this.alert = 0;
    this.alertTimer = 0;
    this.sus = 0;
    this.tunnel = false;
    this.dig = 0;
    this.dummyReady = false;
    this.bribe = 0;
    this.lawyerVisits = 0;
    this.fugitive = { timer: 0, hunt: 0, disguised: false };
    for (const seg of this.layout.fenceSegs) if (seg.cut) this._mend(seg);
    // Старые вещи: контрабанду забирают, остальное лежит в камере.
    for (const k of Object.keys(this.inv)) if (ITEMS[k]?.illegal) delete this.inv[k];
    for (const k of Object.keys(this.stash)) if (ITEMS[k]?.illegal) delete this.stash[k];
    this.wearing = null;
    this.prevLook = { ...p.model.look };
    p.arsenal.reset({});
    p.model.setWeapon(null);
    p.model.setLook(jumpsuitLook({ ...p.model.look, hat: null }, 0));
    p.melee.damage = CONFIG.player.punchDamage * (1 + 0.06 * this.stats.strength);
    game.wanted.clear();
    game.wanted.frozen = true;
    // Камера: с одним соседом.
    const singles = this.crew.singleCells.length ? this.crew.singleCells : this.crew.emptyCells;
    this.cellIdx = singles[Math.floor(Math.random() * singles.length)] ?? 0;
    this.crew.setLockdown(false);
    this.crew._syncTimer = 0;
    this.crew.snapAll();
    this._syncDoors(true);
    this.lastHour = this.hour;
    this._lastPhaseId = this.phase.id;
    this.dayPlan = { day: this.crew.day, search: Math.random() < 0.4, patdown: Math.random() < 0.4, patAt: 12.7 + Math.random() * 2.8, done: {} };
    game.save?.markDirty();
    this.ui.openIntake({ hours, fine, level: info.level, wasFugitive: info.wasFugitive, cell: this.cell.id });
    const officer = this.crew.guards.find((g) => g.id === 'intake');
    const block = this.cell.block === 'A' ? 'A (у западной стены)' : 'B (у северной стены)';
    this.ui.screen.onClose = () => {
      officer?.npc?.say(`Новенький! Камера ${this.cell.id}, блок ${block}. Подъём в шесть, отбой в полдесятого.`, true);
      game.hud.news(`Ваша камера ${this.cell.id} в блоке ${this.cell.block} — отмечена «К» на миникарте`, '#ffd166');
    };
    if (info.wasFugitive) this.flags.holeOnStart = true;
  }

  // Погиб в тюрьме: лазарет, добавка к сроку.
  onDiedInside() {
    this.total += 6;
    this.game.player.arsenal.reset({});
    this.game.player.model.setWeapon(null);
    this.alert = 0;
    this.sus = 0;
    this.crew.setLockdown(false);
    this.crew.calmAll();
    this.ui.setAlarm(false);
    this.game.hud.toast('Вы очнулись в лазарете. Срок +6 ч', 4);
    this.game.wanted.frozen = true;
  }

  // ---------------------------------------------------------------- освобождение
  async release(reason) {
    if (!this.inCustody || this.busy) return;
    this.busy = true;
    this._cancelAction(true);
    const { game } = this;
    const msg = { served: 'Срок отбыт. Вы свободны!', bail: 'Залог внесён. Вы свободны!', lawyer: 'Адвокат добился освобождения. Вы свободны!' }[reason] ?? 'Вы свободны!';
    try {
      await this._blackout(msg, () => {
        this.state = 'free';
        this._endAlarm(true);
        for (const k of Object.keys(this.inv)) if (ITEMS[k]?.illegal) delete this.inv[k];
        this.wearing = null;
        this._releaseAllies();
        const p = game.player;
        const out = this.layout.stations.outside;
        p.respawn({ x: out.x, z: out.z, heading: this.layout.headingW(0) });
        if (this.prevLook) p.model.setLook(this.prevLook);
        p.melee.damage = CONFIG.player.punchDamage;
        game.wanted.frozen = false;
        game.wanted.clear();
        game.wallet.add(60);
        this.setGate(this.layout.gates.inner, false);
        this.setGate(this.layout.gates.outer, false);
        this.crew.setLockdown(false);
        game.cameraRig.yaw = this.layout.headingW(0);
        game.cameraRig.initialized = false;
        game.hud.setObjective('');
        game.hud.news(`${msg} На выходе выдали $60`, '#9aff9a');
        game.save?.markDirty();
      }, 400);
    } finally {
      this.busy = false;
    }
  }

  bailCost() { return Math.round(BAIL_BASE + this.left * BAIL_PER_HOUR); }

  // ---------------------------------------------------------------- беглец
  _onEscaped(method) {
    if (this.state !== 'inside') return;
    const { game } = this;
    this.state = 'fugitive';
    this._releaseAllies();
    this.stats.escapes++;
    this.fugitive = { timer: 7, hunt: 55, disguised: false, method };
    this._cancelAction(true);
    this.ui.close?.();
    game.wanted.frozen = false;
    const violent = this.alert >= 2;
    game.wanted.addHeat(violent ? 3.2 : 2.2, violent ? 3 : 2);
    const title = { tunnel: 'через подкоп', wall: 'через стену', gate: 'через ворота', fence: 'через сетку' }[method] ?? '';
    game.hud.news(`ПОБЕГ из «Редрока» ${title}! Беглец в оранжевой робе на свободе`, '#ff5a5a');
    game.hud.toast('Вы на свободе! Полиция вас ищет. Поймают — вернут в «Редрок» с добавкой', 5);
    game.hud.setObjective('<b style="color:#ff6a6a">Вы в бегах</b>: спрячьтесь, смените одежду (O) или устройте хаос. Полицейский, который вас поймает, вернёт вас в тюрьму');
    this.crew.setLockdown(false);
    this.crew.calmAll();
    this.alert = 0;
    this.ui.setAlarm(false);
    this.sus = 0;
    if (this.flags.getaway) this._spawnGetaway();
    game.save?.markDirty();
  }

  _releaseAllies() {
    for (const r of [...this.allies]) this.setFollow(r, false);
  }

  _spawnGetaway() {
    const { game } = this;
    const p = game.player.position;
    const lines = game.world.roadLines;
    let best = null, bd = Infinity, axis = 'x';
    for (const l of lines) {
      const dx = Math.abs(p.x - l), dz = Math.abs(p.z - l);
      if (dx < bd) { bd = dx; best = l; axis = 'x'; }
      if (dz < bd) { bd = dz; best = l; axis = 'z'; }
    }
    if (best === null) return;
    const spawn = axis === 'x'
      ? { x: best + 1.75, z: p.z, heading: Math.PI }
      : { x: p.x, z: best - 1.75, heading: -Math.PI / 2 };
    const v = new Vehicle(game, { ...spawn, color: 0x111318, type: 'muscle', livery: { stripe: 0xff7a00 } });
    v.persistent = true;
    game.addVehicle(v);
    game.hud.toast('Машина для побега ждёт на дороге у стены!', 5);
    this.flags.getaway = false;
  }

  _tickFugitive(dt) {
    const { game } = this;
    const p = game.player;
    this.fugitive.hunt = Math.max(0, this.fugitive.hunt - dt);
    this._fugTimer -= dt;
    this.fugitive.disguised = !this.jumpsuit;
    if (this._fugTimer <= 0) {
      this._fugTimer = 0.5;
      const w = game.wanted;
      let copNear = false;
      const R = this.fugitive.disguised ? 12 : 42;
      for (const n of game.npcs.list) {
        if (n.role !== 'police' || n.guard || n.isDead || n.prisonGuard) continue;
        const d = Math.hypot(n.position.x - p.position.x, n.position.z - p.position.z);
        if (d < 60) copNear = true;
        if (w.level < 2 && d < R && this._losSoft(n.position.x, 1.5, n.position.z, p.position.x, 1.3, p.position.z)) {
          w.addHeat(1.3, 2);
          n.say('Это беглец из «Редрока»! Стоять!', true);
          game.hud.toast('Полицейский вас узнал!', 2.5);
          break;
        }
      }
      if (w.level === 0 && !copNear) {
        this.fugitive.timer -= 0.5 * game.daynight.speed;
        if (this.fugitive.timer <= 0) {
          this.state = 'free';
          game.hud.setObjective('');
          game.hud.toast('Розыск прекращён: вы растворились в городе', 4);
          game.hud.news('Беглец из «Редрока» как сквозь землю провалился', '#9ad0ff');
        }
      }
    }
    // Вернулись в зону тюрьмы — тревога снова.
    if (this.fugitive.hunt > 0 && this.layout.inCompound(p.position.x, p.position.z)) this.fugitive.hunt = 30;
  }

  _tickFree() {
    // На воле вблизи тюрьмы никто не мешает: просто проходим мимо.
  }

  // ---------------------------------------------------------------- действия с индикатором
  startAction(def) {
    if (this.action || this.busy) return false;
    const p = this.game.player;
    this.action = { t: 0, dur: 5, speed: 1, illegal: false, noisy: false, ...def, pos: p.position.clone() };
    this.game.hud.setProgress(this.action.label, 0);
    return true;
  }

  _cancelAction(silent = false) {
    if (!this.action) return;
    this.action = null;
    this.game.hud.setProgress(null);
    if (!silent) this.game.hud.toast('Действие прервано', 1.4);
  }

  _tickAction(dt) {
    const a = this.action;
    if (!a) return;
    const p = this.game.player;
    if (p.isDead || p.vehicle || p.sinceDamage < 0.25 || p.position.distanceTo(a.pos) > 1.5 || this.ui.isOpen) {
      this._cancelAction();
      return;
    }
    a.t += dt * a.speed;
    this.game.hud.setProgress(a.label, a.t / a.dur);
    if (a.t >= a.dur) {
      this.action = null;
      this.game.hud.setProgress(null);
      a.done?.();
    }
  }

  // ---------------------------------------------------------------- цели взаимодействия
  _buildStations() {
    const L = this.layout, S = L.stations;
    const list = [];
    const add = (id, spots, r, make) => list.push({ id, spots: Array.isArray(spots) ? spots : [spots], r, make });
    const open = (a, b) => this.hour >= a && this.hour < b;
    const closed = (label, hours) => ({ label: `${label} — закрыто (${hours})`, run: null });

    add('commissary', S.commissary, 2.4, () => (open(8, 19)
      ? { label: 'Лавка «Commissary»', run: () => this.ui.openShop('commissary') } : closed('Лавка', '8:00–19:00')));
    add('phone', S.phones, 1.5, () => (open(7, 21)
      ? { label: 'Телефон-автомат', run: () => this.ui.openPhone() } : closed('Телефон', '7:00–21:00')));
    add('tv', S.tvs, 2.8, () => ({ label: 'Смотреть телевизор', run: () => this.watchTv() }));
    add('weights', S.weights, 1.7, () => ({ label: 'Качать железо', run: () => this.lift() }));
    add('hoops', S.hoops, 2.6, () => ({ label: 'Бросать мяч', run: () => this.ui.openHoops() }));
    add('cards', S.cards, 2.6, () => ({ label: 'Сыграть в карты', run: () => this.playCardsHere() }));
    add('visit', S.visit, 2.4, () => (open(9, 17)
      ? { label: 'Комната свиданий: адвокат и залог', run: () => this.ui.openVisit() } : closed('Свидания', '9:00–17:00')));
    add('infirmary', S.infirmary, 2.8, () => {
      const p = this.game.player;
      if (!open(7, 20)) return closed('Лазарет', '7:00–20:00');
      if (p.health >= p.maxHealth * 0.9) return { label: 'Лазарет (вы здоровы)', run: null };
      return { label: 'Лазарет: перевязка', run: () => this.startAction({ id: 'heal', label: 'Перевязка', dur: 6, done: () => { this.game.player.health = this.game.player.maxHealth; this.game.hud.toast('Медсестра вас подлатала', 2); } }) };
    });
    add('tray', S.tray, 2.0, () => {
      const m = this.phase;
      if (!['breakfast', 'lunch', 'dinner'].includes(m.id)) return { label: 'Раздача (закрыта до обеда)', run: null };
      return { label: 'Взять поднос с едой', run: () => this.ui.openTray() };
    });
    add('laundry', S.laundry, 2.6, () => ({ label: 'Прачечная', run: () => this.ui.openJob('laundry') }));
    add('kitchen', L.spots.kitchen[0], 3.4, () => ({ label: 'Кухня', run: () => this.ui.openJob('kitchen') }));
    add('library', S.library, 2.8, () => ({ label: 'Библиотека', run: () => this.ui.openJob('library') }));
    add('uniform', S.uniform, 1.7, () => ({ label: 'Корзина с формой охраны', run: () => this.rummageUniform() }));
    add('gateinner', S.gatePanelInner, 2.3, () => this.gateStation());
    add('gateouter', S.gatePanelOuter, 2.3, () => this.gateStation());
    add('warden', L.posts.warden, 2.2, () => this.wardenStation());
    add('armory', L.posts.armory, 2.4, () => this.armoryStation());
    // Своя камера: койка, тумбочка, постер (подкоп), замок.
    add('cell', () => this.cell.w.inside, 2.3, () => ({ label: `Своя камера ${this.cell.id}`, run: () => this.openCellMenu() }));
    // Секции сетки.
    L.fenceSegs.forEach((seg) => add(`fence${seg.index}`, () => seg.point, 1.8, () => this.fenceStation(seg)));
    add('wall', () => this._wallSpot(), 2.0, () => this.wallStation());
    this.stationList = list;
  }

  _wallSpot() {
    const L = this.layout, p = this.game.player.position;
    if (!this._wallZone(p) || L.zoneAt(p.x, p.z)?.id !== 'strip') return null;
    return p;      // «под» игроком: любая точка у стены
  }

  _scan(dt) {
    this._scanTimer -= dt;
    if (this._scanTimer > 0) return;
    this._scanTimer = 0.12;
    const { game } = this;
    const p = game.player;
    this.target = null;
    if (!this.inCustody || p.vehicle || p.isDead || game.downState || this.ui.isOpen || this.busy) return;
    if (this.action) { this.target = { label: 'Прервать', cancel: true }; return; }
    const pp = p.position;
    let best = null, bestScore = Infinity;
    const consider = (score, t) => { if (score < bestScore) { bestScore = score; best = t; } };
    // Люди.
    const rec = this.crew.nearestInmate(pp, 2.5, (r) => !r.npc.vehicle && r.npc.state !== NPC_STATE.FIGHT);
    if (rec) {
      const d = Math.hypot(rec.npc.position.x - pp.x, rec.npc.position.z - pp.z);
      const lv = this.friendLevelOf(rec);
      consider(d / 2.5 * 0.9 + 0.3, { kind: 'inmate', rec, label: `Поговорить: ${rec.name} (${this.friendName(lv)})`, run: () => this.ui.openTalk(rec) });
    }
    const g = this.crew.nearestGuard(pp, 2.3, (x) => x.npc.state !== NPC_STATE.FIGHT);
    if (g) {
      const d = Math.hypot(g.npc.position.x - pp.x, g.npc.position.z - pp.z);
      consider(d / 2.3 * 0.9 + 0.3, { kind: 'guard', g, label: `Обратиться: ${g.name}`, run: () => this.ui.openGuard(g) });
    }
    // Места.
    for (const st of this.stationList) {
      const spots = typeof st.spots[0] === 'function' ? [st.spots[0]()] : st.spots;
      for (const s of spots) {
        const sp = typeof s === 'function' ? s() : s;
        if (!sp) continue;
        const d = Math.hypot(sp.x - pp.x, sp.z - pp.z);
        if (d > st.r) continue;
        const desc = st.make();
        if (desc) consider(d / st.r, { kind: 'station', id: st.id, ...desc });
      }
    }
    this.target = best;
  }

  prompt() {
    if (!this.inCustody) return '';
    const t = this.target;
    if (!t) return '';
    if (t.cancel) return '<b>E</b> — прервать';
    return t.run ? `<b>E</b> — ${t.label}` : `<span style="opacity:.8">${t.label}</span>`;
  }

  touchLabel() {
    const t = this.target;
    if (!t) return '';
    return t.cancel ? 'ПРЕРВАТЬ' : t.run ? (t.kind === 'inmate' || t.kind === 'guard' ? 'ГОВОРИТЬ' : 'ДЕЙСТВИЕ') : '';
  }

  interact() {
    if (!this.ready) return false;
    if (this.ui.isOpen) return true;
    const t = this.target;
    if (!t) return false;
    if (t.cancel) { this._cancelAction(); return true; }
    if (t.run) { t.run(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- станции: места и побеги
  watchTv() {
    this.startAction({ id: 'tv', label: 'Смотрите телевизор', dur: 7, done: () => this.game.hud.toast(this._tvLine(), 4) });
  }

  _tvLine() {
    const lines = ['Новости: гонки по ночным улицам, полиция в поиске водителей.', 'Новости: у «Редрока» усилили охрану.', 'Спорт: чемпионы октагона выходят на ринг!', 'Погода: ясно, вечером возможен дождь.', 'Новости: на улицах банды делят районы.', 'Новости: в Центральном банке сработала тревога.'];
    const w = this.game.wanted;
    if (w.level > 0) return 'Новости: полиция ищет подозреваемого.';
    return lines[(Math.random() * lines.length) | 0];
  }

  lift() {
    if (this.liftToday >= 5) { this.game.hud.toast('Мышцы забиты — хватит на сегодня. Завтра продолжишь', 2.6); return; }
    this.startAction({ id: 'lift', label: 'Тренировка', dur: 10, done: () => {
      this.liftToday++;
      if (this.stats.strength < 6 && this.liftToday % 2 === 0) {
        this.stats.strength++;
        this.game.player.melee.damage = CONFIG.player.punchDamage * (1 + 0.06 * this.stats.strength);
        this.game.hud.toast(`Сила выросла! Удар +${this.stats.strength * 6}%`, 3);
      } else this.game.hud.toast('Хорошая тренировка', 2);
      this.stats.respect += 1;
    } });
  }

  rummageUniform() {
    if (this.has('uniform')) { this.game.hud.toast('У вас уже есть форма', 2); return; }
    this.startAction({ id: 'uniform', label: 'Перебираете форму охраны', dur: 5, illegal: true, rate: 0.55, done: () => {
      this.give('uniform');
      this.know.add('uniform');
      this.game.hud.toast('Вы стащили форму охранника! Спрячьте её. Для побега нужен ещё пропуск', 4);
    } });
  }

  openCellMenu() {
    const cell = this.cell;
    const options = [
      { label: 'Койка: спать и перематывать время', sub: 'ночью проверки в 1:00 и 4:00', run: () => this.ui.openSleep() },
      { label: 'Тумбочка и тайник', sub: 'спрятать контрабанду от обысков', run: () => this.ui.openStash() },
    ];
    if (this.tunnel) {
      options.push({ label: 'Ползти по подкопу на волю', sub: 'выход за стеной тюрьмы', run: () => { this.ui.close(); this.crawl(); } });
    } else if (this.has('spoon')) {
      options.push({ label: `Рыть подкоп за постером (${Math.round(this.dig * 100)}%)`, sub: 'шумно и подозрительно: охрана слышит рядом, ночью надёжнее', run: () => { this.ui.close(); this.digStep(cell); } });
    } else {
      options.push({ label: 'Постер на стене', sub: this.know.has('tunnel') ? 'за ним можно копать, но нужна ложка (столовая, кухня, Скиппи)' : 'обычный постер… или нет?', disabled: true });
    }
    if (cell.colOn && this.has('lockpick')) {
      options.push({ label: 'Вскрыть замок двери отмычкой', sub: 'шумно: ночью надёжнее', run: () => { this.ui.close(); this.pickLock(cell); } });
    } else if (cell.colOn) {
      options.push({ label: 'Дверь заперта', sub: 'до подъёма в 6:00 (нужна отмычка)', disabled: true });
    }
    this.ui.openMenu({ title: `КАМЕРА ${cell.id}`, text: `Тесная камера на двоих: койка, унитаз, тумбочка, постер.${this.dig > 0 && !this.tunnel ? ` Подкоп: ${Math.round(this.dig * 100)}%.` : ''}`, options });
  }

  pickLock(cell) {
    this.startAction({ id: 'pick', label: 'Вскрываете замок', dur: 4, illegal: true, rate: 0.6, noise: 3.5, done: () => {
      this._setDoor(cell, true);
      this.game.hud.toast('Замок поддался. Дверь открыта', 2.5);
    } });
  }

  digStep(cell) {
    const fast = this.has('map') ? 2 : 1;
    this.startAction({ id: 'dig', label: 'Копаете подкоп', dur: 6, illegal: true, rate: 0.5, noise: 3.5, done: () => {
      this.dig = Math.min(1, this.dig + 6 * fast / 54);
      cell.posterMesh.rotation.z = 0.12;
      cell.dirtMesh.visible = true;
      cell.dirtMesh.scale.setScalar(0.5 + this.dig);
      if (this.dig >= 1) {
        this.tunnel = true;
        cell.posterMesh.visible = false;
        cell.holeMesh.visible = true;
        this.game.hud.toast('Подкоп готов! Лезьте на волю (E у дыры)', 4);
      } else this.game.hud.toast(`Подкоп: ${Math.round(this.dig * 100)}%`, 2);
    } });
  }

  async crawl() {
    if (this.busy) return;
    this.busy = true;
    const { game } = this;
    try {
      await this._blackout('Вы ползёте по сырому подкопу...', () => {
        const out = this.layout.tunnelExit(this.cell);
        game.player.position.set(out.x, game.world.getGroundHeight(out.x, out.z), out.z);
        game.player.velocity.set(0, 0, 0);
        game.cameraRig.initialized = false;
        this._onEscaped('tunnel');
        this.tunnel = false;
      }, 1100);
    } finally {
      this.busy = false;
    }
  }

  fenceStation(seg) {
    if (seg.cut) return null;
    if (!this.has('cutters')) return this.know.has('fence') ? { label: 'Ржавая сетка (нужны кусачки)', run: null } : null;
    return { label: 'Перекусить сетку', run: () => this.startAction({ id: 'cut', label: 'Перекусываете сетку', dur: 7, illegal: true, major: true, rate: 0.8, noise: 9, done: () => this._cutFence(seg) }) };
  }

  _cutFence(seg) {
    seg.cut = true;
    seg.mesh.visible = false;
    this.game.world.colliders.remove(seg.collider);
    this.game.hud.toast('В сетке дыра! За ней — стена 6,5 м: нужна верёвка', 3.5);
  }

  _mend(seg) {
    seg.cut = false;
    seg.mesh.visible = true;
    this.game.world.colliders.add(seg.collider);
  }

  wallStation() {
    if (!this._wallSpot()) return null;
    if (!this.has('rope')) return { label: 'Стена 6,5 м — нужна верёвка с крюком', run: null };
    return { label: 'Забросить верёвку и перелезть через стену', run: () => this.startAction({ id: 'climb', label: 'Лезете через стену', dur: 6, illegal: true, major: true, rate: 0.9, noise: 9, done: () => this.climbOver() }) };
  }

  async climbOver() {
    if (this.busy) return;
    this.busy = true;
    const { game } = this;
    try {
      await this._blackout('Вы перемахнули через колючую проволоку...', () => {
        const L = this.layout, p = game.player;
        const [lx, lz] = L.toLocal(p.position.x, p.position.z);
        const east = Math.abs(lx) >= Math.abs(lz);
        const outLocal = east ? [Math.sign(lx) * 41, lz] : [lx, Math.sign(lz) * 41];
        const o = L.P(outLocal[0], outLocal[1]);
        p.position.set(o.x, game.world.getGroundHeight(o.x, o.z), o.z);
        p.velocity.set(0, 0, 0);
        if (!this.has('gloves')) {
          p.takeDamage(16, null, 0, 0, 'wire');
          game.hud.toast('Колючка порезала руки (перчатки бы помогли)', 3);
        }
        game.cameraRig.initialized = false;
        this._onEscaped('wall');
      }, 900);
    } finally {
      this.busy = false;
    }
  }

  gateStation() {
    if (this.has('keys')) return { label: 'Открыть ворота ключами начальника', run: () => { this.openGates(25); this.game.hud.toast('Ворота открыты на 25 секунд! Бегите!', 3); } };
    if (this.wearing === 'uniform') return { label: 'Выйти через КПП в форме охранника', run: () => this.tryUniformExit() };
    return null;
  }

  tryUniformExit() {
    const { game } = this;
    let chance = 0.38;
    if (this.has('idcard')) chance += 0.5;
    if (this.bribe > 0) chance = 1;
    if (this.alert >= 2) chance = 0.05;
    this.startAction({ id: 'uniform', label: 'Проходите КПП', dur: 4, illegal: false, done: () => {
      if (Math.random() < chance) {
        game.hud.toast('Охранник кивнул. Ворота открываются...', 3);
        this.openGates(20);
        this.flags.walkout = true;
      } else {
        this.startAlarm('Поддельная форма на КПП!', true);
      }
    } });
  }

  wardenStation() {
    if (!(this.alert >= 2 || this.crew.riot || this.isNight)) return null;
    if (this.has('keys')) return null;
    return { label: 'Обыскать стол начальника (ключи)', run: () => this.startAction({ id: 'keys', label: 'Ищете ключи', dur: 5, illegal: true, major: true, rate: 0.7, noise: 5, done: () => {
      this.give('keys');
      this.game.hud.toast('Ключи начальника у вас! Они открывают ворота и оружейную', 4);
    } }) };
  }

  armoryStation() {
    if (!this.has('keys')) return null;
    return { label: 'Оружейная: взять пистолет', run: () => { this.game.player.giveWeapon('pistol', 24); this.game.hud.toast('Пистолет!', 2); } };
  }

  // ---------------------------------------------------------------- сон, перемотка, вещи
  async sleepUntil(hourTarget, label = 'Вы спите...') {
    if (this.busy || this.alert >= 2) return;
    this.busy = true;
    this._cancelAction(true);
    const { game } = this;
    const cur = this.hour;
    let dh = (hourTarget - cur + 24) % 24;
    if (dh < 0.05) dh = 24;
    try {
      await this._blackout(label, () => {
        const p = game.player;
        this._advance(dh);
        p.health = Math.min(p.maxHealth, p.health + dh * (this.has('pillow') ? 7 : 4));
        this.sus = 0;
        // Если ночь застигла игрока вне камеры — охрана отводит его.
        if (this.inCustody && this.isNight && !this._inOwnCell()) this._lockIn();
      }, 900);
      game.hud.toast(`${fmtClock(this.hour)} · ${this.phase.label}`, 2.5);
    } finally {
      this.busy = false;
    }
    if (this.inCustody && this.served >= this.total) this.release('served');
  }

  async waitUntilNextPhase() {
    const idx = SCHEDULE.findIndex((p) => p.id === this.phase.id);
    const next = SCHEDULE[(idx + 1) % SCHEDULE.length];
    await this.sleepUntil(next.from, `Время идёт... ${next.label}`);
  }

  eat(id) {
    const it = ITEMS[id];
    if (!it?.heal || !this.take(id)) return false;
    const p = this.game.player;
    p.health = Math.min(p.maxHealth, p.health + it.heal);
    this.game.hud.toast(`${it.name}: +${it.heal} здоровья`, 2);
    return true;
  }

  craftRope() {
    if ((this.inv.sheet ?? 0) < 3) { this.game.hud.toast('Нужно три простыни', 2); return; }
    this.take('sheet', 3);
    this.give('rope');
    this.game.hud.toast('Вы связали верёвку из простыней и закрепили крюк', 3);
  }

  toggleUniform() {
    const { game } = this;
    const p = game.player;
    if (this.wearing === 'uniform') { this._takeOffUniform(); return; }
    if (!this.has('uniform')) return;
    this.prevJump = { ...p.model.look };
    const base = { ...p.model.look, ...guardUniformLook(game.rng), skin: p.model.look.skin, hair: p.model.look.hair, hairStyle: p.model.look.hairStyle, beard: p.model.look.beard, tattoo: p.model.look.tattoo, bulk: p.model.look.bulk, scale: p.model.look.scale };
    p.model.setLook(base);
    this.wearing = 'uniform';
    game.hud.toast('Вы переоделись в форму охранника', 2.5);
  }

  _takeOffUniform(silent = false) {
    const p = this.game.player;
    if (this.prevJump) p.model.setLook(this.prevJump);
    this.wearing = null;
    if (!silent) this.game.hud.toast('Форма снята: снова роба', 2);
  }

  async callAction(id) {
    const { game } = this;
    const a = { lawyer: this.callLawyer, friend: this.callFriend, getaway: this.orderGetaway }[id];
    a?.call(this);
    void game;
  }

  // ---------------------------------------------------------------- проверка кадра
  update(dt) {
    if (!this.ready) return;
    this.t += dt;
    this.crew.update(dt);
    this._animate(dt);
    this._towers(dt);
    if (this.state === 'inside') this._tickInside(dt);
    else if (this.state === 'fugitive') this._tickFugitive(dt);
    this._scan(dt);
    this.ui.tick(dt);
    this._hud(dt);
  }

  _tickInside(dt) {
    const { game } = this;
    const p = game.player;
    this._tickTime(dt);
    this._tickAction(dt);
    game.wanted.frozen = true;
    if (game.wanted.heat > 0) game.wanted.clear();
    if (this.bribe > 0) this.bribe = Math.max(0, this.bribe - dt);
    if (this.distract > 0) this.distract = Math.max(0, this.distract - dt);
    this._obsTimer -= dt;
    if (this._obsTimer <= 0) {
      const step = 0.2 - this._obsTimer;
      this._obsTimer = 0.2;
      this._observe(Math.min(step, 0.5));
    }
    // Тревога затихает со временем; пока идёт — охрана бежит за игроком (в бунт охрана дерётся с заключёнными).
    if (this.alert === 3) this._tickRiot(dt);
    else if (this.alert >= 2) {
      this.alertTimer -= dt;
      for (const g of this.crew.guards) {
        const n = g.npc;
        if (n && !n.isDead && n.state !== NPC_STATE.FIGHT && this.alertTimer > 0 && !g.noGuard && g.id !== 'clerk' && g.id !== 'medic') {
          if (Math.hypot(n.position.x - p.position.x, n.position.z - p.position.z) < 40) n.aggro(p);
        }
      }
      if (this.alertTimer <= 0) this._endAlarm(false);
    }
    if (this.patdown > 0) {
      this.patdown -= dt;
      const g = this.crew.nearestGuard(p.position, 4, (x) => !x.noGuard && x.id !== 'clerk' && x.id !== 'medic');
      if (g) this._patDown();
    }
    // Побег: игрок за пределами периметра.
    if (!this.busy && !this.layout.inCompound(p.position.x, p.position.z)) {
      this._onEscaped(this.flags.walkout ? 'gate' : 'wall');
      this.flags.walkout = false;
    }
    // Освобождение по сроку.
    if (this.served >= this.total && !this.busy) this.release('served');
    // Спарринг.
    if (this.spar) this.sparTick(dt);
    // Ушёл слишком далеко от приёма в начале — ничего.
    if (!this.busy && this.flags.holeOnStart && !this.ui.isOpen) {
      this.flags.holeOnStart = false;
      this.punish('hole', 12, 'Побег пойман: карцер перед отбыванием срока');
    }
  }

  _hud(dt) {
    this._hudTimer -= dt;
    if (this._hudTimer > 0) return;
    this._hudTimer = 0.3;
    const { hud } = this.game;
    if (this.state !== 'inside') {
      if (this._objKey === 'inside') { this._objKey = ''; if (this.state !== 'fugitive') hud.setObjective(''); }
      this.ui.setSus(0);
      return;
    }
    const ph = this.phase;
    const left = this.left;
    const parts = [];
    if (this.alert >= 2) parts.push('<b style="color:#ff5a5a">ТРЕВОГА</b>');
    parts.push(`<b>${ph.label}</b> до ${fmtClock(ph.to)}`);
    parts.push(`срок: ${fmtHours(left)}`);
    parts.push(`камера <b>${this.cell.id}</b>`);
    const html = parts.join(' · ');
    this._objKey = 'inside';
    hud.setObjective(html);
    this.ui.setSus(this.sus);
  }

  // Потолок здания под точкой (для камеры): внутри тюремных корпусов камера ниже потолка.
  ceilingAt(x, z) {
    if (!this.ready) return 0;
    const L = this.layout;
    if (Math.abs(x - L.center.x) > 40 || Math.abs(z - L.center.z) > 40) return 0;
    const [lx, lz] = L.toLocal(x, z);
    for (const b of L.buildings) if (lx > b.x0 && lx < b.x1 && lz > b.z0 && lz < b.z1) return b.h - 0.5;
    return 0;
  }

  // Метки на миникарте: тюрьма (всегда), в заключении — своя камера, лавка, телефон, свидания.
  minimapMarks() {
    if (!this.ready) return [];
    const L = this.layout;
    const marks = [{ x: L.center.x, z: L.center.z, txt: 'Т', color: '#9b2d2d', pin: this.state !== 'inside', big: true }];
    if (this.inCustody) {
      const c = this.cell.w.door;
      marks.push({ x: c.x, z: c.z, txt: 'К', color: '#c9a227', big: true });
      const S = L.stations;
      marks.push({ x: S.commissary.x, z: S.commissary.z, txt: '$', color: '#1f9a3e' });
      marks.push({ x: S.visit.x, z: S.visit.z, txt: 'А', color: '#2d6fb3' });
      for (const ph of S.phones) marks.push({ x: ph.x, z: ph.z, txt: 'Т', color: '#5d6b7a' });
    }
    return marks;
  }

  // ---------------------------------------------------------------- сохранение
  serialize() {
    if (!this.ready) return null;
    return {
      state: this.state, served: this.served, total: this.total, cellIdx: this.cellIdx, inv: this.inv, stash: this.stash,
      know: [...this.know], seen: [...this.rumorsSeen], stats: this.stats, friends: Object.fromEntries(this.crew.inmates.filter((r) => r.friend).map((r) => [r.id, Math.round(r.friend)])),
      dig: this.dig, tunnel: this.tunnel, fence: this.layout.fenceSegs.filter((s) => s.cut).map((s) => s.index), lawyer: this.lawyerVisits,
      fug: this.fugitive.timer, day: this.crew.day, wearing: this.wearing,
    };
  }

  deserialize(d) {
    if (!d || !this.ready) return;
    this.pending = d;
    for (const rec of this.crew.inmates) rec.friend = d.friends?.[rec.id] ?? 0;
    this.inv = d.inv ?? {};
    this.stash = d.stash ?? {};
    this.know = new Set(d.know ?? []);
    this.rumorsSeen = new Set(d.seen ?? []);
    Object.assign(this.stats, d.stats ?? {});
  }

  // Вызывается из Game.start(): вернуть игрока в тюрьму, если он вышел из игры, сидя в ней.
  restore() {
    const d = this.pending;
    if (!d || !this.ready) return;
    this.pending = null;
    if (d.state === 'inside') {
      const { game } = this;
      this.state = 'inside';
      this.served = d.served ?? 0;
      this.total = d.total ?? 24;
      this.cellIdx = d.cellIdx ?? 0;
      this.dig = d.dig ?? 0;
      this.tunnel = !!d.tunnel;
      this.lawyerVisits = d.lawyer ?? 0;
      for (const i of d.fence ?? []) { const seg = this.layout.fenceSegs[i]; if (seg && !seg.cut) this._cutFence(seg); }
      const p = game.player;
      this.prevLook = { ...p.model.look };
      p.arsenal.reset({});
      p.model.setWeapon(null);
      p.model.setLook(jumpsuitLook({ ...p.model.look, hat: null }, 0));
      p.melee.damage = CONFIG.player.punchDamage * (1 + 0.06 * this.stats.strength);
      game.wanted.frozen = true;
      const c = this.cell.w.inside;
      p.position.set(c.x, game.world.getGroundHeight(c.x, c.z), c.z);
      this.crew.day = d.day ?? 0;
      this.crew.snapAll();
      this._syncDoors(true);
      this.lastHour = this.hour;
      this._lastPhaseId = this.phase.id;
      this.dayPlan = { day: -1, done: {} };
      if (this.tunnel) { const cell = this.cell; cell.posterMesh.visible = false; cell.holeMesh.visible = true; cell.dirtMesh.visible = true; }
      game.hud.toast('Вы продолжаете отбывать срок в «Редроке»', 4);
    } else if (d.state === 'fugitive') {
      this.state = 'fugitive';
      this.fugitive = { timer: d.fug ?? 4, hunt: 0, disguised: false };
    }
  }
}

installSocial(PrisonSystem);
