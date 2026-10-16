import * as THREE from 'three';
import { Agent } from './agent.js';
import { SCHOOL } from './config.js';
import { ROOM_BY_ID, floorOfY } from './layout.js';
import { facingDot } from './person.js';

// Ученики, учителя и персонал школы. Мозг думает 4 раза в секунду и выбирает задачу (task),
// задача выполняется каждый кадр. До тревоги — обычный день: перемена (гуляют, болтают, сидят
// в телефоне), звонок, урок (сидят за партами, учитель у доски), физкультура в зале.
// После тревоги — по сценарию: эвакуация за учителем, прятки и запертые двери, бегство, паника,
// драка (смелые), а также команды игрока: «За мной», «Прячьтесь», «Бей его!», «Тихо», «Ждите».

const C = SCHOOL.npc;
const _v = new THREE.Vector3();

const LINES = {
  fireSee: ['Пожар!', 'Горим!', 'Огонь! Бегите!', 'Дым! Пожар!'],
  fireTeacher: ['Все за мной! Спокойно, без паники!', 'Встаём и выходим за мной!', 'Пригнитесь, выходим!'],
  attackTeacher: ['Все в угол! Тихо!', 'Ложитесь! Ни звука!', 'Быстро прячьтесь, я запру дверь!'],
  scream: ['А-а-а!', 'Помогите!', 'Мама!', 'Спасите!', 'Нет-нет-нет!'],
  fear: ['Мне страшно...', 'Что происходит?!', 'Это не учения?', 'Я хочу домой...'],
  follow: ['Иду за тобой!', 'Хорошо, веди!', 'Я с тобой!', 'Только не бросай!'],
  refuse: ['Не могу, мне страшно!', 'Я остаюсь тут!', 'Нет, я боюсь!'],
  hide: ['Прячусь!', 'Ладно, тихо...', 'Я спрячусь.'],
  fight: ['Давай вместе!', 'Держи его!', 'Бей!', 'Сейчас я его!'],
  fightNo: ['Я боюсь!', 'Он меня убьёт!', 'Не могу...'],
  quiet: ['Тсс...', 'Молчу.', '...'],
  wait: ['Жду здесь.', 'Хорошо, стою.'],
  run: ['Бегу!', 'К выходу!'],
  zombie: ['Зомби!!!', 'Он кусается!', 'Это Петров?! Что с ним?!', 'Беги!'],
  safe: ['Фух... выбрались.', 'Все живы?', 'Где наш класс?'],
  cough: ['Кха-кха!', 'Кха!', 'Не могу дышать...'],
  hurt: ['Ай!', 'Больно!', 'А-ай!'],
};

export const pickLine = (k) => LINES[k][Math.floor(Math.random() * LINES[k].length)];

export class NPC extends Agent {
  constructor(game, spec) {
    super(game, spec.look, { name: spec.name, role: spec.role, health: spec.health ?? C.health, radius: C.radius, x: spec.x, z: spec.z, y: spec.y ?? 0 });
    this.short = spec.short ?? spec.name;
    this.cls = spec.cls ?? null;           // класс (для учеников и учителя)
    this.fem = !!spec.fem;
    this.persona = spec.persona;
    this.seat = spec.seat ?? null;
    this.staff = spec.staff ?? null;       // 'guard' | 'cook' | 'nurse' | 'cleaner' | 'principal'
    this.post = spec.post ?? null;         // где стоит персонал
    this.task = null;
    this.aware = false;
    this.fear = 0;
    this.leader = null;
    this.cmd = null;                       // команда игрока (приоритетнее сценария)
    this.quietT = 0;
    this.screamT = 0;
    this.seeThreat = null;
    this.seeThreatT = -99;
    this.saved = false;                    // добрался до места сбора / автобуса
    this.infected = 0;                     // укушен: через сколько секунд станет зомби
    this.punchCd = 0;
    this.hiddenSince = 0;
    this.sayCd = 0;
    this.smokeT = 0;
  }

  get isTeacher() { return this.role === 'teacher'; }
  get brave() { return this.persona.courage; }

  update(dt) {
    this.updateFall(dt);
    if (!this.alive) { this.stop(); this.physics(dt); return; }
    if (this.quietT > 0) this.quietT -= dt;
    if (this.punchCd > 0) this.punchCd -= dt;
    if (this.sayCd > 0) this.sayCd -= dt;
    if (this.knocked > 0) { this.stop(); this.physics(dt); return; }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.22 + Math.random() * 0.08;
      this.think();
    }
    this.act(dt);
    this.physics(dt);
  }

  speak(key, force = false, dur = 2.2) {
    if (this.sayCd > 0 && !force) return;
    this.sayCd = 2.5 + Math.random() * 2;
    this.say(typeof key === 'string' && LINES[key] ? pickLine(key) : key, dur);
  }

  // ------------------------------------------------------------------ восприятие

  perceive() {
    const g = this.game;
    // Угрозы в поле зрения.
    let seen = null, sd = 99;
    for (const t of g.threats) {
      if (!t.alive || t.neutralized) continue;
      const d = this.distTo(t);
      if (d > 26) continue;
      const range = t.kind === 'zombie' ? 16 : 24;
      if (d < 2.2 || this.canSee(t, range, this.hidden ? -1 : 0.0)) {
        if (d < sd) { sd = d; seen = t; }
      }
    }
    if (seen) {
      if (!this.seeThreat || g.time - this.seeThreatT > 3) this.onSeeThreat(seen);
      this.seeThreat = seen;
      this.seeThreatT = g.time;
      this.fear = Math.min(1, this.fear + (sd < 8 ? 0.35 : 0.15));
    } else if (this.seeThreat && g.time - this.seeThreatT > 6) this.seeThreat = null;
    // Шум: выстрелы, крики, тревога — из списка событий за последнюю секунду.
    for (const n of g.noiseEvents) {
      if (n.t < g.time - 0.5) continue;
      const d = Math.hypot(n.x - this.pos.x, n.z - this.pos.z) + Math.abs(n.y - this.pos.y) * 3;
      if (d > n.r) continue;
      if (n.kind === 'shot' || n.kind === 'scream' && n.src?.kind === 'zombie') { this.becomeAware(); this.fear = Math.min(1, this.fear + 0.25 * (1 - d / n.r) + 0.1); }
      if (n.kind === 'alarm') this.becomeAware();
    }
    // Огонь и дым рядом.
    const fire = g.fire;
    if (fire && fire.active) {
      const heat = fire.heatNear(this.pos.x, this.pos.z, this.floor, 5);
      const smoke = this.zone ? fire.smokeOf(this.zone.id) : 0;
      if (heat > 0.1 || smoke > 0.25) {
        if (!this.aware) this.speak('fireSee', true);
        this.becomeAware();
        this.fear = Math.min(1, this.fear + 0.15);
        if (heat > 0.1) g.noise(this.pos, 18, 'scream', this);
      }
    }
    // Страх понемногу уходит (быстрее, если рядом учитель или игрок велел молчать).
    const calm = this.quietT > 0 || this.leader?.alive ? 0.06 : 0.025;
    this.fear = Math.max(0, this.fear - calm);
  }

  becomeAware() {
    if (this.aware) return;
    this.aware = true;
    this.awareAt = this.game.time;
    if (this.sitting) this.leaveSeat();
  }

  onSeeThreat(t) {
    this.becomeAware();
    if (t.kind === 'zombie') this.speak('zombie', true);
    else if (this.quietT <= 0 && Math.random() < 0.5) this.speak('scream', true);
    if (this.quietT <= 0 && this.persona.panic > 0.45) this.game.noise(this.pos, 22, 'scream', this);
  }

  // ------------------------------------------------------------------ решения

  think() {
    const g = this.game;
    this.perceive();
    if (this.infected > 0) return;
    // Команды игрока — первыми.
    if (this.cmd) {
      if (this.thinkCommand()) return;
      this.cmd = null;
    }
    const fireSeen = this.aware && g.fire?.active && g.scenario.type === 'fire';
    if (fireSeen && !g.alarm.type && (this.isTeacher || this.staff) && !this.calledAlarm) {
      this.calledAlarm = true;
      this.speak('Пожар! Включите тревогу!', true);
      g.scenario.at(3 + Math.random() * 3, () => g.scenario.raiseAlarm('fire', 'staff'));
    }
    // До объявления тревоги действуют те, кто сам увидел/услышал беду.
    const type = g.alarm.type ?? (this.aware && g.scenario.started ? g.scenario.type : null);
    if (!type) { this.thinkDaily(); return; }
    // Добрались до места сбора / в автобус — просто стоим.
    if (this.saved) { if (!this.task || this.task.type !== 'assembled') this.setTask({ type: 'assembled' }); return; }
    if (type === 'fire') this.thinkFire();
    else if (type === 'attack') this.thinkAttack();
    else this.thinkZombie();
  }

  setTask(t) {
    if (this.task?.type !== t.type) {
      if (this.hidden && t.type !== 'hide') this.leaveHide();
      if (this.sitting && t.type !== 'sit') this.leaveSeat();
      if (this.task?.spot && this.task.spot.reserved === this) this.task.spot.reserved = null;
      this.clearGoal();
      this.gesture = null;
      this.guard = false;
    }
    this.task = t;
  }

  // --- обычный день
  thinkDaily() {
    const g = this.game;
    const phase = g.scenario.phase;
    if (this.staff) {
      if (this.staff === 'cleaner') { if (this.task?.type !== 'wander') this.setTask({ type: 'wander', floor: 0, corridor: true }); return; }
      if (this.task?.type !== 'post') this.setTask({ type: 'post', p: this.post });
      return;
    }
    if (this.isTeacher) {
      const room = this.cls ? ROOM_BY_ID.get(this.cls.room) : null;
      const z = g.school.zoneById.get(this.cls?.room);
      if (room?.type === 'gym') { if (this.task?.type !== 'post') this.setTask({ type: 'post', p: { x: 34, z: 0, floor: 0, heading: Math.PI / 2, gesture: phase === 'lesson' ? 'talk' : null } }); return; }
      if (z?.teacherSpot) {
        if (phase === 'lesson') { if (this.task?.type !== 'teach') this.setTask({ type: 'teach', zone: z }); }
        else if (this.task?.type !== 'post') this.setTask({ type: 'post', p: { ...z.teacherDesk, floor: z.floor, sit: true } });
        return;
      }
    }
    // Ученики.
    if (phase === 'lesson' && this.cls && !this.truant) {
      if (this.cls.room === 'gym') { if (this.task?.type !== 'play') this.setTask({ type: 'play' }); return; }
      if (this.seat && this.task?.type !== 'sit') this.setTask({ type: 'sit', seat: this.seat });
      return;
    }
    if (!this.task || (this.task.type !== 'wander' && this.task.type !== 'talk')) this.setTask({ type: 'wander' });
  }

  // --- пожар
  thinkFire() {
    const g = this.game;
    const t = this.task?.type;
    // Учитель собирает класс и ведёт к выходу.
    if (this.isTeacher && t !== 'lead') {
      this.speak('fireTeacher', true);
      for (const n of g.npcs) {
        if (n === this || !n.alive || n.cmd || n.leader === g.player) continue;
        if (n.zone && this.zone && n.zone.id === this.zone.id && n.role === 'student') { n.leader = this; n.becomeAware(); }
      }
      this.setTask({ type: 'lead' });
      return;
    }
    if (this.isTeacher) return;
    if (this.leader && this.leader.alive && !this.leader.saved && this.leader !== g.player) {
      if (t !== 'follow') this.setTask({ type: 'follow', leader: this.leader });
      return;
    }
    if (this.leader && this.leader.saved) this.leader = null;
    // Паника: бегает, кричит, иногда прячется (в пожаре это опасно).
    if (t === 'panic' || t === 'hide') return;
    if (this.fear > 0.65 && this.persona.panic > 0.7 && Math.random() < 0.3 && this.quietT <= 0) {
      if (Math.random() < 0.35) {
        const spot = g.findHideSpot(this, { sameZone: true });
        if (spot) { this.setTask({ type: 'hide', spot, until: g.time + 9999 }); return; }
      }
      this.setTask({ type: 'panic', until: g.time + 3 + Math.random() * 4 });
      return;
    }
    if (t !== 'evacuate') this.setTask({ type: 'evacuate' });
  }

  // --- нападение (террорист)
  thinkAttack() {
    const g = this.game;
    const t = this.task?.type;
    const th = this.seeThreat;
    // Смелые бросаются на нападающего, если он рядом и отвлёкся (перезаряжается, оглушён, спиной).
    if (th && th.alive && !th.neutralized && t !== 'fight') {
      const d = this.distTo(th);
      const distracted = th.reloading > 0 || th.blind > 0 || th.isDown || (th.stun > 0.3 && facingDot(th, this.pos.x, this.pos.z) < 0);
      if (d < 4.5 && distracted && this.brave > 0.75) { this.speak('fight', true); this.setTask({ type: 'fight', target: th }); return; }
    }
    if (t === 'fight' && this.task.target.alive && !this.task.target.neutralized) return;
    if (t === 'lockdown' || t === 'cower' || t === 'panic') return;
    // Учитель в своём кабинете: запереть дверь, погасить свет, спрятать детей.
    if (this.isTeacher && this.zone && this.zone.doors && t !== 'hide') {
      this.setTask({ type: 'lockdown', zone: this.zone, step: 0 });
      return;
    }
    if (th && this.distTo(th) < 9 && t !== 'flee' && t !== 'hide') {
      // Увидел вблизи — бежать или замереть от страха.
      if (this.persona.panic > 0.75 && Math.random() < 0.5) { this.setTask({ type: 'cower', until: g.time + 4 + Math.random() * 4 }); return; }
      this.setTask({ type: 'flee', from: th });
      return;
    }
    if (t === 'hide' || t === 'flee' || t === 'evacuate') return;
    if (this.leader && this.leader.alive && this.leader !== g.player && this.leader.task?.type === 'lead') {
      this.setTask({ type: 'follow', leader: this.leader });
      return;
    }
    // В коридоре/на улице: если на улице или выход рядом — уходить; иначе — прятаться.
    if (this.floor === 0 && (!this.zone || g.exitNear(this, 14, true))) { this.setTask({ type: 'evacuate' }); return; }
    const spot = g.findHideSpot(this, { preferRoom: true, avoid: th });
    if (spot) this.setTask({ type: 'hide', spot, until: g.time + 9999 });
    else this.setTask({ type: 'flee', from: th ?? g.threats[0] });
  }

  // --- зомби
  thinkZombie() {
    const g = this.game;
    const t = this.task?.type;
    const th = this.seeThreat;
    if (g.scenario.rescueHere) {
      if (th && th.alive && this.distTo(th) < 1.6 && t !== 'fight') { this.setTask({ type: 'fight', target: th }); return; }
      if (t === 'fight' && this.task.target.alive && this.distTo(this.task.target) < 3) return;
      if (t !== 'evacuate' && t !== 'follow') this.setTask({ type: 'evacuate', target: 'bus' });
      return;
    }
    if (th && th.alive && t !== 'fight') {
      const d = this.distTo(th);
      // Загнали в угол или смелый — дерётся.
      if ((d < 1.8 && (this.brave > 0.4 || this.hidden)) || (d < 5 && this.brave > 0.85)) { this.speak('fight', true); this.setTask({ type: 'fight', target: th }); return; }
    }
    if (t === 'fight' && this.task.target.alive && this.distTo(this.task.target) < 8) return;
    if (t === 'lockdown' || t === 'cower' || t === 'panic') return;
    if (this.isTeacher && this.zone && this.zone.doors && t !== 'hide' && t !== 'flee') {
      this.setTask({ type: 'lockdown', zone: this.zone, step: 0, barricade: true });
      return;
    }
    if (th && this.distTo(th) < 10 && t !== 'flee') { this.setTask({ type: 'flee', from: th }); return; }
    if (t === 'hide' || t === 'flee') return;
    if (this.leader && this.leader.alive && this.leader !== g.player && this.leader.task?.type === 'lockdown') return;
    const spot = g.findHideSpot(this, { preferRoom: true, avoid: th });
    if (spot) this.setTask({ type: 'hide', spot, until: g.time + 9999 });
    else this.setTask({ type: 'cower', until: g.time + 5 });
  }

  // --- команды игрока
  receiveCommand(type, player) {
    if (!this.alive || this.infected > 0) return null;
    const g = this.game;
    const fearK = this.fear * (1 - this.persona.obedience * 0.6);
    if (type === 'follow') {
      if (fearK > 0.75 && this.persona.panic > 0.6 && Math.random() < 0.6) return 'refuse';
      if (g.npcs.filter((n) => n.cmd?.type === 'follow' && n.alive).length >= C.followers) return 'refuse';
      this.cmd = { type: 'follow', leader: player };
      this.leader = player;
      this.becomeAware();
      return 'follow';
    }
    if (type === 'hide') {
      const spot = g.findHideSpot(this, { near: player, avoid: this.seeThreat });
      if (!spot) return null;
      this.cmd = { type: 'hide', spot };
      return 'hide';
    }
    if (type === 'fight') {
      const th = g.nearestThreat(this, 16);
      if (!th) return null;
      const near = this.distTo(th) < 5;
      const will = this.brave + this.persona.obedience * 0.3 + (near ? 0.15 : 0) + (th.reloading > 0 || th.stun > 0 ? 0.3 : 0) - this.fear * 0.3;
      if (will < 0.6) return 'fightNo';
      this.cmd = { type: 'fight', target: th };
      return 'fight';
    }
    if (type === 'quiet') {
      this.quietT = 40;
      this.fear *= 0.5;
      if (this.task?.type === 'panic') this.task = null;
      return 'quiet';
    }
    if (type === 'wait') {
      this.cmd = { type: 'wait', x: this.pos.x, z: this.pos.z, floor: this.floor };
      if (this.leader === player) this.leader = null;
      return 'wait';
    }
    if (type === 'run') {
      this.cmd = { type: 'run' };
      if (this.leader === player) this.leader = null;
      this.becomeAware();
      return 'run';
    }
    return null;
  }

  thinkCommand() {
    const c = this.cmd, g = this.game;
    if (c.type === 'follow') {
      if (!c.leader.alive) { this.leader = null; return false; }
      if (this.saved && c.leader.saved) return false;
      if (this.task?.type !== 'follow') this.setTask({ type: 'follow', leader: c.leader });
      return true;
    }
    if (c.type === 'hide') {
      if (c.spot.occupant && c.spot.occupant !== this) {
        const s = g.findHideSpot(this, { near: g.player });
        if (!s) return false;
        c.spot = s;
      }
      if (this.task?.type !== 'hide' || this.task.spot !== c.spot) this.setTask({ type: 'hide', spot: c.spot, until: g.time + 9999 });
      return true;
    }
    if (c.type === 'fight') {
      if (!c.target.alive || c.target.neutralized) return false;
      if (this.task?.type !== 'fight') this.setTask({ type: 'fight', target: c.target, cmd: true });
      return true;
    }
    if (c.type === 'wait') {
      if (this.task?.type !== 'wait') this.setTask({ type: 'wait', x: c.x, z: c.z, floor: c.floor });
      return true;
    }
    if (c.type === 'run') {
      if (this.saved) return false;
      if (this.task?.type !== 'evacuate') this.setTask({ type: 'evacuate', target: g.alarm.type === 'zombie' && g.scenario.rescueHere ? 'bus' : 'assembly' });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ действия

  act(dt) {
    const t = this.task;
    const g = this.game;
    this.crouch = false;
    if (!t) { this.stop(); return; }
    const smoky = g.fire?.active && this.zone && g.fire.smokeOf(this.zone.id) > 0.3;
    switch (t.type) {
      case 'post': {
        const p = t.p;
        if (!this.goal && Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 0.6) this.goTo(p.x, p.z, p.floor ?? 0, C.walk);
        const r = this.followPath(dt);
        if (r === 'arrived' || !this.goal) {
          this.stop();
          this.faceTarget = p.heading ?? null;
          this.gesture = p.gesture ?? (Math.sin(g.time * 0.3 + this.pos.x) > 0.6 ? 'phone' : null);
        }
        break;
      }
      case 'teach': {
        const z = t.zone, s = z.teacherSpot;
        t.walkT = (t.walkT ?? 0) - dt;
        if (t.walkT <= 0) {
          t.walkT = 6 + Math.random() * 6;
          const off = (Math.random() - 0.5) * 2.4;
          const zx = z.side === 'S' ? 0 : 0;
          t.px = s.x + zx; t.pz = s.z + off;
          this.goTo(t.px, t.pz, z.floor, 0.9);
        }
        const r = this.followPath(dt);
        if (r === 'arrived' || !this.goal) {
          this.stop();
          this.faceTarget = s.heading;
          this.gesture = 'talk';
        } else this.gesture = null;
        break;
      }
      case 'sit': {
        if (this.sitting) { this.gesture = Math.sin(g.time * 0.2 + this.pos.z * 3) > 0.92 ? 'phone' : null; break; }
        const s = t.seat;
        if (s.taken && s.taken !== this) { this.setTask({ type: 'wander' }); break; }
        if (!this.goal) this.goTo(s.aisle.x, s.aisle.z, s.floor, C.walk * 1.1, { near: 0.35 });
        const r = this.followPath(dt);
        if (r === 'arrived') this.sit(s);
        else if (r === 'nopath') this.setTask({ type: 'wander' });
        break;
      }
      case 'wander': {
        if (t.idle > 0) {
          t.idle -= dt;
          this.stop();
          if (t.idle <= 0) t.target = null;
          break;
        }
        if (!t.target) {
          t.target = g.pickWander(this, t);
          if (!t.target) { t.idle = 2; break; }
          this.goTo(t.target.x, t.target.z, t.target.floor, C.walk * this.persona.speed);
        }
        const r = this.followPath(dt);
        if (r === 'arrived' || r === 'nopath') {
          t.idle = 4 + Math.random() * 9;
          this.gesture = t.target?.kind === 'talk' ? 'talk' : Math.random() < 0.35 ? 'phone' : null;
          if (t.target?.kind === 'read') this.gesture = null;
          this.faceTarget = Math.random() * Math.PI * 2;
        } else this.gesture = null;
        break;
      }
      case 'play': {
        if (!this.goal) {
          const pts = g.school.wander.filter((w) => w.kind === 'play');
          const p = pts[Math.floor(Math.random() * pts.length)];
          this.goTo(p.x + (Math.random() - 0.5) * 4, p.z + (Math.random() - 0.5) * 4, 0, 2.8 + Math.random() * 1.2);
        }
        this.followPath(dt);
        this.gesture = null;
        break;
      }
      case 'lead': {
        // Учитель ведёт класс к месту сбора, подождав отстающих.
        const lag = g.npcs.some((n) => n.leader === this && n.alive && !n.saved && this.distTo(n) > 7);
        const d = this.followField(dt, g.evacFields('assembly'), lag ? 0.4 : 2.4);
        this.crouch = smoky;
        if (d < 4 || g.atAssembly(this)) { this.saved = true; this.setTask({ type: 'assembled' }); g.onSaved?.(this); }
        break;
      }
      case 'evacuate': {
        const target = t.target ?? 'assembly';
        const sp = (smoky ? C.crouch * 1.6 : C.run * 0.85) * this.persona.speed;
        if (this.blockedDoor && !t.byPath) {
          // Путь по полю упёрся в чужую запертую дверь — обойти по A*.
          const A = target === 'bus' ? SCHOOL.bus : SCHOOL.assembly;
          t.byPath = true;
          this.blockedDoor = null;
          this.goTo(A.x, A.z, 0, sp, { near: 3, force: true });
        }
        if (t.byPath) {
          const r = this.followPath(dt);
          if (r === 'nopath' || r === 'arrived') t.byPath = false;
          if ((target === 'assembly' && g.atAssembly(this)) || (target === 'bus' && g.atBus(this))) { this.saved = true; this.setTask({ type: 'assembled' }); g.onSaved?.(this); }
          break;
        }
        const d = this.followField(dt, g.evacFields(target), sp);
        this.crouch = smoky && this.persona.smart;
        if ((target === 'assembly' && g.atAssembly(this)) || (target === 'bus' && g.atBus(this)) || d < 3) {
          this.saved = true;
          this.setTask({ type: 'assembled' });
          g.onSaved?.(this);
        }
        break;
      }
      case 'assembled': {
        this.stop();
        if (!t.spot) {
          const c = g.alarm.type === 'zombie' && g.scenario.rescueHere ? SCHOOL.bus : SCHOOL.assembly;
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (c.r - 2);
          t.spot = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
          if (g.alarm.type === 'zombie' && g.atBus(this)) { this.setVisible(false); this.inBus = true; }
          else this.goTo(t.spot.x, t.spot.z, 0, C.walk);
          this.speak('safe');
        }
        this.followPath(dt);
        if (!this.goal) { this.faceTarget = Math.PI; this.gesture = this.isTeacher ? 'talk' : Math.random() < 0.002 ? 'phone' : this.gesture; }
        break;
      }
      case 'follow': {
        const L = t.leader;
        if (!L.alive) { this.setTask({ type: 'cower', until: g.time + 3 }); this.leader = null; break; }
        const d = this.distTo(L);
        const far = d > 2.4 + (this.followIndex ?? 0) * 0.15;
        if (L.hidden && L === g.player && !this.hidden) {
          const spot = g.findHideSpot(this, { near: L });
          if (spot) { this.setTask({ type: 'hide', spot, until: g.time + 9999, fromFollow: L }); break; }
        }
        if (far) {
          t.repath = (t.repath ?? 0) - dt;
          if (t.repath <= 0 || !this.goal) {
            t.repath = 0.6;
            this.goTo(L.pos.x, L.pos.z, L.floor, Math.min(C.run, d > 5 ? C.run : C.walk * 1.6), { near: 1.8, force: true });
          }
          const r = this.followPath(dt);
          if (r === 'nopath' && d < 4) this.move(L.pos.x - this.pos.x, L.pos.z - this.pos.z, C.walk);
        } else {
          this.clearGoal();
          this.faceTarget = Math.atan2(L.pos.x - this.pos.x, L.pos.z - this.pos.z);
        }
        this.crouch = L.crouch || smoky;
        if (L.saved && !this.saved && (g.atAssembly(this) || g.atBus(this))) { this.saved = true; g.onSaved?.(this); }
        if (L === g.player && g.atAssembly(this) && g.alarm.type === 'fire' && !this.saved) { this.saved = true; g.onSaved?.(this); }
        break;
      }
      case 'hide': {
        if (this.hidden) {
          this.gesture = this.fear > 0.6 && this.hidden.pose !== 'stand' ? 'cover' : null;
          // Испуганный шумит (плачет, звонит телефон), если не сказали молчать.
          if (this.quietT <= 0 && this.fear > 0.5 && Math.random() < dt * 0.04 * this.persona.panic) {
            this.say(Math.random() < 0.5 ? '*всхлипывает*' : '*звонит телефон*', 1.6);
            g.noise(this.pos, 9, 'whimper', this);
          }
          // Дым в укрытии — вылезти и бежать.
          if (g.fire?.active && this.zone && g.fire.smokeOf(this.zone.id) > 0.55 && this.persona.panic < 0.95) {
            this.leaveHide();
            this.setTask({ type: 'evacuate' });
          }
          if (t.fromFollow && !t.fromFollow.hidden && t.fromFollow === g.player && this.cmd?.type === 'follow') {
            this.leaveHide();
            this.setTask({ type: 'follow', leader: t.fromFollow });
          }
          break;
        }
        const s = t.spot;
        if (s.occupant && s.occupant !== this) { this.task = null; break; }
        s.reserved = this;
        if (!this.goal && Math.hypot(s.x - this.pos.x, s.z - this.pos.z) > 0.5) this.goTo(s.x, s.z, s.floor, C.run * this.persona.speed, { near: 0.5 });
        const r = this.followPath(dt);
        if (r === 'arrived' || Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < 0.6) {
          if (this.enterHide(s)) { this.hiddenSince = g.time; if (this.quietT <= 0 && Math.random() < 0.3) this.speak('hide'); }
          else this.task = null;
        } else if (r === 'nopath') this.task = null;
        break;
      }
      case 'flee': {
        const th = t.from;
        if (!t.target || (t.retarget ?? 0) < g.time) {
          t.retarget = g.time + 2.5;
          t.target = g.fleePoint(this, th);
          if (t.target) this.goTo(t.target.x, t.target.z, t.target.floor, C.run * this.persona.speed, { force: true });
        }
        const r = this.followPath(dt);
        if (r === 'arrived' || r === 'nopath') {
          if (t.target?.evac) this.setTask({ type: 'evacuate' });
          else {
            const spot = g.findHideSpot(this, { avoid: th });
            if (spot) this.setTask({ type: 'hide', spot, until: g.time + 9999 });
            else this.setTask({ type: 'cower', until: g.time + 5 });
          }
        }
        if (this.quietT <= 0 && Math.random() < dt * 0.5) g.noise(this.pos, 16, 'scream', this);
        break;
      }
      case 'panic': {
        if (g.time > t.until) { this.task = null; break; }
        t.dirT = (t.dirT ?? 0) - dt;
        if (t.dirT <= 0) {
          t.dirT = 0.8 + Math.random() * 1.2;
          t.a = Math.random() * Math.PI * 2;
          if (Math.random() < 0.4 && this.quietT <= 0) { this.speak('scream', true); g.noise(this.pos, 20, 'scream', this); }
        }
        this.move(Math.sin(t.a), Math.cos(t.a), C.run * 0.8);
        break;
      }
      case 'cower': {
        this.stop();
        this.crouch = true;
        this.gesture = 'cover';
        if (g.time > t.until) this.task = null;
        break;
      }
      case 'wait': {
        if (Math.hypot(t.x - this.pos.x, t.z - this.pos.z) > 1.2 && !this.goal) this.goTo(t.x, t.z, t.floor, C.walk);
        this.followPath(dt);
        this.crouch = g.player.crouch && this.distTo(g.player) < 10 || smoky;
        break;
      }
      case 'fight': {
        const th = t.target;
        if (!th.alive || th.neutralized) { this.task = null; this.cmd = null; this.guard = false; break; }
        const d = this.distTo(th);
        this.guard = true;
        if (d > 1.15) {
          t.repath = (t.repath ?? 0) - dt;
          if (t.repath <= 0 || !this.goal) { t.repath = 0.5; this.goTo(th.pos.x, th.pos.z, th.floor, C.run, { near: 1.0, force: true }); }
          const r = this.followPath(dt);
          if (r === 'nopath' && d < 3) this.move(th.pos.x - this.pos.x, th.pos.z - this.pos.z, C.run);
        } else {
          this.clearGoal();
          this.faceTarget = Math.atan2(th.pos.x - this.pos.x, th.pos.z - this.pos.z);
          if (this.punchCd <= 0) {
            this.punchCd = 0.55 + Math.random() * 0.3;
            this.attackT = 1;
            this.attackSide = -this.attackSide;
            g.melee(this, th, this.isTeacher || this.staff ? 12 : 9);
          }
        }
        break;
      }
      case 'lockdown': {
        this.act_lockdown(dt, t);
        break;
      }
      default: this.stop();
    }
  }

  // Учитель: дверь закрыть и запереть, свет выключить, (зомби — баррикада), дети — по углам.
  act_lockdown(dt, t) {
    const g = this.game, z = t.zone;
    const door = g.doors.list.find((d) => d.roomZone === z.id && !d.exterior);
    if (t.step === 0) {
      this.speak(g.alarm.type === 'zombie' ? 'Все сюда! Двигайте парту к двери!' : pickLine('attackTeacher'), true);
      for (const n of g.npcs) {
        if (n === this || !n.alive || n.cmd || n.role !== 'student' || n.leader === g.player) continue;
        if (n.zone?.id === z.id && n.task?.type !== 'hide') {
          n.becomeAware();
          n.leader = this;
          const spot = g.findHideSpot(n, { sameZone: true });
          if (spot) n.setTask({ type: 'hide', spot, until: g.time + 9999 });
          else n.setTask({ type: 'cower', until: g.time + 9999 });
          n.quietT = 25;
        }
      }
      t.step = 1;
    }
    if (!door) { t.step = 4; }
    if (t.step === 1) {
      // Подойти к двери изнутри.
      const inX = door.axis === 'x' ? (door.a + door.b) / 2 : door.c + door.roomSign * 0.7;
      const inZ = door.axis === 'x' ? door.c + door.roomSign * 0.7 : (door.a + door.b) / 2;
      if (!this.goal) this.goTo(inX, inZ, z.floor, C.run, { near: 0.55 });
      const r = this.followPath(dt);
      if (r === 'arrived' || this.distTo({ pos: { x: inX, z: inZ, y: this.pos.y } }) < 0.7) { t.step = 2; t.t = 0.6; }
      else if (r === 'nopath') t.step = 2;
      return;
    }
    if (t.step === 2) {
      this.stop();
      t.t -= dt;
      if (t.t > 0) return;
      if (door && !door.broken) {
        // Кто-то ещё в проёме? Не запираем снаружи своих — закрываем только если в двери пусто.
        g.doors.close(door);
        g.doors.setLocked(door, true, this);
        if (t.barricade || this.brave > 0.7) g.doors.barricade(door, true);
        g.audio?.lock(door);
      }
      g.setLights(z, false);
      t.step = 3;
      return;
    }
    if (t.step === 3 || t.step === 4) {
      const spot = g.findHideSpot(this, { sameZone: true });
      if (spot) this.setTask({ type: 'hide', spot, until: g.time + 9999 });
      else this.setTask({ type: 'cower', until: g.time + 9999 });
    }
  }
}
