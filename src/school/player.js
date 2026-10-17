import * as THREE from 'three';
import { Person, facingDot } from './person.js';
import { SCHOOL } from './config.js';

// Игрок — ученик 9 «А». Ходьба/бег/присед относительно камеры, действия по контексту (E):
// двери, замок (R) и баррикада (B) изнутри кабинета, прятки, предметы, выключатели, пожарная
// кнопка, окна 1 этажа, место за партой. F — удар / огнетушитель / бита, Q — бросить предмет.
// Команды одноклассникам: 1 За мной, 2 Прячьтесь, 3 Бей его!, 4 Тихо, 5 Ждите, 6 Бегите к выходу.

const P = SCHOOL.player;
const _v = new THREE.Vector3();

export class Player extends Person {
  constructor(game, look) {
    super(game, look, { name: 'Ты', role: 'player', health: P.health, radius: P.radius, x: 10.5, z: 0.6 });
    this.cls = null;
    this.punchCd = 0;
    this.climb = null;
    this.sprayT = 0;
    this.noiseT = 0;
    this.regenT = 0;
    this.context = null;
    this.saved = false;
    this.stats = { punches: 0, threatsHit: 0, commands: 0, savedBy: 0, locked: 0, barricades: 0, lightsOff: 0, extinguished: 0 };
  }

  update(dt, input, cam) {
    const g = this.game;
    this.updateFall(dt);
    if (this.punchCd > 0) this.punchCd -= dt;
    if (!this.alive) { this.stop(); this.physics(dt); return; }
    this.regen(dt);
    // Пролезает в окно.
    if (this.climb) {
      const c = this.climb;
      c.t += dt;
      const k = Math.min(1, c.t / 1.1);
      this.pos.lerpVectors(c.from, c.to, k);
      this.crouch = true;
      if (k >= 1) { this.climb = null; this.crouch = false; g.hud.flash('Ты выбрался на улицу'); }
      return;
    }
    if (this.knocked > 0) { this.stop(); this.physics(dt); return; }

    // --- Движение
    const mx = input.moveX, my = input.moveY;
    const moving = Math.hypot(mx, my) > 0.08;
    if (input.pressed('crouch')) this.crouch = !this.crouch;
    if (this.hidden) {
      this.stop();
      if (moving && this.hidden.type !== 'locker') { /* можно оглядываться */ }
    } else if (this.sitting) {
      this.stop();
      if (moving && Math.hypot(mx, my) > 0.6) this.leaveSeat();
    } else {
      const f = cam.forward();
      // Вперёд по камере, вправо = (-cos yaw, sin yaw).
      const dx = f.x * my - f.z * mx, dz = f.z * my + f.x * mx;
      const run = (input.down('run') || input.stickPush > 0.92) && !this.crouch;
      const sp = this.crouch ? P.crouch : run ? P.run : P.walk;
      const cough = this.cough > 0.5 && g.fire?.active ? 0.75 : 1;
      if (moving) this.move(dx, dz, sp * Math.min(1, Math.hypot(mx, my) * 1.15) * cough);
      else this.stop();
      if (run && moving && this.crouch) this.crouch = false;
    }
    this.physics(dt);

    // --- Шум шагов
    this.noiseT -= dt;
    this.noise = this.hidden ? 0 : this.speed > 3.5 ? 1 : this.speed > 0.5 && !this.crouch ? 0.35 : 0;
    if (this.noiseT <= 0 && this.noise > 0) {
      this.noiseT = 0.6;
      g.noise(this.pos, this.noise > 0.9 ? 10 : 4, 'steps', this);
    }

    this.updateContext(input);
    if (input.pressed('interact')) this.doInteract('primary');
    if (input.pressed('lock')) this.doInteract('lock');
    if (input.pressed('barricade')) this.doInteract('barricade');
    this.useItem(dt, input);
    if (input.pressed('throw') && this.item) this.throwItem();
    for (const [act, cmd] of [['cmdFollow', 'follow'], ['cmdHide', 'hide'], ['cmdFight', 'fight'], ['cmdQuiet', 'quiet'], ['cmdWait', 'wait'], ['cmdRun', 'run']]) {
      if (input.pressed(act)) g.command(cmd);
    }
  }

  regen(dt) {
    if (this.game.time - this.lastHurt < 9) return;
    if (this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * 1.6);
  }

  // --- Контекстное действие --------------------------------------------------------

  updateContext() {
    const g = this.game;
    const f = this.floor;
    let best = null;
    const consider = (c) => { if (!best || c.score > best.score) best = c; };
    const near = (x, z, y, r) => {
      const d = Math.hypot(x - this.pos.x, z - this.pos.z);
      if (d > r || Math.abs((y ?? this.pos.y) - this.pos.y) > 1.6) return -1;
      const fd = d < 0.5 ? 1 : facingDot(this, x, z);
      return (1 - d / r) + fd * 0.6;
    };
    if (this.hidden) { this.context = { kind: 'unhide', label: 'вылезти из укрытия', score: 99 }; g.hud.setContext(this.context); return; }
    if (this.sitting) { this.context = { kind: 'stand', label: 'встать из-за парты', score: 99 }; g.hud.setContext(this.context); return; }
    // Обезвреженный нападающий — связать.
    for (const t of g.threats) {
      if (t.kind === 'intruder' && t.neutralized && !t.tied) {
        const s = near(t.pos.x, t.pos.z, t.pos.y, 2.0);
        if (s > 0) consider({ kind: 'tie', t, label: 'связать нападающего', score: s + 5 });
      }
    }
    for (const it of g.items) {
      if (it.taken || it.floor !== f) continue;
      const s = near(it.x, it.z, it.y, 1.5);
      if (s > 0) consider({ kind: 'item', it, label: `взять: ${ITEM_NAMES[it.type]}`, score: s + 0.8 });
    }
    for (const a of g.school.alarms) {
      if (a.floor !== f) continue;
      const s = near(a.x, a.z, a.y, 1.4);
      if (s > 0) consider({ kind: 'alarm', a, label: 'нажать пожарную тревогу', score: s + 0.6 });
    }
    for (const sw of g.school.switches) {
      if (sw.floor !== f) continue;
      const s = near(sw.x, sw.z, sw.y, 1.1);
      const z = g.school.zoneById.get(sw.zone);
      if (s > 0) consider({ kind: 'light', sw, z, label: z.lightsOn ? 'выключить свет' : 'включить свет', score: s + 0.5 });
    }
    const door = g.doors.nearest(this.pos.x, this.pos.z, f, 1.5);
    if (door) {
      const inside = g.doors.sideOf(door, this.pos.x, this.pos.z) === 1;
      const closed = g.doors.isClosed(door);
      let label = door.broken ? null : closed ? (door.locked ? 'заперто' : 'открыть дверь') : 'закрыть дверь';
      if (door.barricade && !inside) label = 'заблокировано';
      const c = { kind: 'door', door, label, score: 0.9, inside, closed };
      if (!door.exterior && inside && !door.broken) {
        c.lock = door.locked ? 'отпереть' : 'запереть';
        if (closed || door.barricade) c.barricade = door.barricade ? 'убрать баррикаду' : 'баррикада';
      }
      if (label || c.lock) consider(c);
    }
    for (const s of g.school.hideSpots) {
      if (s.floor !== f || (s.occupant && s.occupant !== this)) continue;
      const sc = near(s.x, s.z, s.y, s.type === 'locker' ? 1.2 : 1.3);
      if (sc > 0) consider({ kind: 'hide', s, label: `спрятаться ${s.name}`, score: sc + 0.3 });
    }
    if (!g.alarm.type) {
      for (const s of g.school.seats) {
        if (s.floor !== f || s.taken) continue;
        const sc = near(s.x, s.z, s.y, 1.0);
        if (sc > 0) consider({ kind: 'seat', s, label: 'сесть за парту', score: sc });
      }
    }
    if (f === 0) {
      for (const w of g.school.windows) {
        const sc = near(w.x, w.z, 0, 1.3);
        if (sc > 0.2) consider({ kind: 'window', w, label: 'вылезти в окно', score: sc - 0.2 });
      }
    }
    this.context = best;
    g.hud.setContext(best);
  }

  doInteract(which) {
    const g = this.game;
    const c = this.context;
    if (!c) return;
    if (which === 'lock') {
      if (c.kind === 'door' && c.lock) {
        const d = c.door;
        if (!d.locked) g.doors.close(d);
        g.doors.setLocked(d, !d.locked, this);
        g.audio.lock(d);
        g.hud.flash(d.locked ? 'Дверь заперта' : 'Дверь отперта');
        if (d.locked) this.stats.locked++;
      }
      return;
    }
    if (which === 'barricade') {
      if (c.kind === 'door' && c.barricade) {
        const d = c.door;
        const on = !d.barricade;
        g.doors.barricade(d, on);
        g.audio.slam(d, 0.6);
        g.noise(d, 8, 'furniture', this);
        g.hud.flash(on ? 'Ты придвинул парту к двери' : 'Баррикада убрана');
        if (on) this.stats.barricades++;
      }
      return;
    }
    switch (c.kind) {
      case 'unhide': this.leaveHide(); g.audio.locker(this.hidden ?? c); break;
      case 'stand': this.leaveSeat(); break;
      case 'tie':
        c.t.tied = true;
        c.t.say('...', 1);
        g.hud.flash('Нападающий связан!');
        g.onIntruderTied?.(c.t, this);
        break;
      case 'item': {
        const old = this.dropItemMesh();
        if (old) g.dropItem(old, this.pos);
        c.it.taken = true;
        c.it.mesh?.removeFromParent();
        this.holdItem(c.it);
        g.audio.pickup();
        g.hud.flash(ITEM_HINT[c.it.type]);
        break;
      }
      case 'alarm': g.pullAlarm(this); break;
      case 'light': {
        const on = !c.z.lightsOn;
        g.setLights(c.z, on);
        g.audio.click();
        if (!on) this.stats.lightsOff++;
        break;
      }
      case 'door': {
        const d = c.door;
        if (d.broken) break;
        if (d.target > 0.5) { g.doors.close(d); g.noise(d, 6, 'door', this); }
        else if (!g.doors.tryOpen(d, this)) g.hud.flash(d.barricade ? 'Дверь заблокирована изнутри' : 'Заперто');
        break;
      }
      case 'hide':
        if (this.item && c.s.type === 'locker') { const it = this.dropItemMesh(); g.dropItem(it, this.pos); }
        this.enterHide(c.s);
        g.audio.locker(c.s);
        break;
      case 'seat': this.sit(c.s); break;
      case 'window': {
        const w = c.w;
        this.climb = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(w.out.x, 0, w.out.z) };
        g.noise(this.pos, 7, 'window', this);
        break;
      }
      default:
    }
  }

  // --- Предметы ----------------------------------------------------------------------

  useItem(dt, input) {
    const g = this.game;
    const it = this.item;
    if (it?.type === 'extinguisher') {
      this.gesture = null;
      if (input.down('attack') && it.charge > 0) {
        it.charge = Math.max(0, it.charge - dt / SCHOOL.fire.extinguisher);
        this.aim = -0.1;
        const f = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
        const cam = g.cam.forward();
        this.faceTarget = Math.atan2(cam.x, cam.z);
        if (this.speed < 0.5) this.heading = this.faceTarget;
        this.sprayT -= dt;
        if (this.sprayT <= 0) {
          this.sprayT = 0.04;
          const p = this.chest(_v);
          const o = { x: p.x + f.x * 0.55, y: p.y - 0.05, z: p.z + f.z * 0.55 };
          g.effects.puff('haze', o, { x: f.x * 7 + (Math.random() - 0.5) * 1.5, y: 0.3, z: f.z * 7 + (Math.random() - 0.5) * 1.5 }, 1.5);
          g.effects.puff('spray', o, { x: f.x * 8, y: 1.2, z: f.z * 8 }, 0.8);
        }
        g.audio.spray(this.pos, dt);
        g.fire?.extinguishCone(this.pos.x, this.pos.z, this.floor, this.heading, 4.5, 0.5, dt * 2.6, true);
        // Порошок в лицо нападающему / зомби.
        for (const t of g.threats) {
          if (!t.alive || t.neutralized) continue;
          const d = this.distTo(t);
          if (d < 4 && facingDot(this, t.pos.x, t.pos.z) > 0.82) {
            if (t.kind === 'intruder') { if (!t.blind) g.hud.flash('Порошок в лицо! Он ослеп — бей!'); t.blindBy(3.5); }
            else { t.stun = Math.max(t.stun, 0.6); }
          }
        }
        g.noise(this.pos, 8, 'spray', this);
        if (it.charge <= 0) g.hud.flash('Огнетушитель пуст');
        return;
      }
      this.aim = null;
      return;
    }
    if (input.pressed('attack') && this.punchCd <= 0 && !this.hidden && !this.sitting) this.punch();
  }

  punch() {
    const g = this.game;
    const it = this.item;
    const kind = it?.type === 'bat' ? 'bat' : it?.type === 'mop' ? 'mop' : it?.type === 'extinguisher' ? 'bat' : 'punch';
    this.punchCd = kind === 'punch' ? P.punchCooldown : 0.7;
    this.attackT = 1;
    this.attackSide = -this.attackSide;
    this.stats.punches++;
    const range = kind === 'punch' ? P.punchRange : 1.7;
    const dmg = kind === 'bat' ? 30 : kind === 'mop' ? 16 : P.punchDamage;
    // Повернуться к цели перед собой.
    let target = null, bs = -1;
    for (const t of g.threats) {
      if (!t.alive || t.neutralized) continue;
      const d = this.distTo(t);
      const fd = facingDot(this, t.pos.x, t.pos.z);
      const cam = g.cam.forward();
      const cd = ((t.pos.x - this.pos.x) * cam.x + (t.pos.z - this.pos.z) * cam.z) / (d || 1);
      if (d < range + 0.3 && (fd > 0.3 || cd > 0.4)) {
        const s = 2 - d + fd;
        if (s > bs) { bs = s; target = t; }
      }
    }
    if (target) {
      this.heading = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      target.hitBy(this, dmg, kind);
      this.stats.threatsHit++;
      g.audio.punch(target.pos);
      g.noise(this.pos, 12, 'fight', this);
    } else g.audio.swing?.(this.pos);
  }

  throwItem() {
    const g = this.game;
    const it = this.dropItemMesh();
    if (!it) return;
    const f = g.cam.forward();
    let hit = null;
    for (const t of g.threats) {
      if (!t.alive || t.neutralized) continue;
      const d = this.distTo(t);
      const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
      if (d < 7 && (dx * f.x + dz * f.z) / (d || 1) > 0.85 && g.world.lineOfSight(this.eye(), t.chest())) { hit = t; break; }
    }
    if (hit) {
      hit.hitBy(this, it.type === 'extinguisher' ? 20 : 12, 'bat');
      if (hit.kind === 'intruder') hit.stun = Math.max(hit.stun, 1.6);
      g.hud.flash('Попал!');
      g.dropItem(it, hit.pos);
      g.audio.punch(hit.pos);
    } else {
      const p = this.pos.clone();
      p.x += f.x * 3; p.z += f.z * 3;
      if (!g.world.isFree(p.x, p.z, this.pos.y, 0.2)) { p.x = this.pos.x + f.x * 0.8; p.z = this.pos.z + f.z * 0.8; }
      g.dropItem(it, p);
      g.audio.slam(p, 0.3);
    }
    g.noise(this.pos, 12, 'throw', this);
  }

  // Видят ли игрока угрозы прямо сейчас (для индикатора).
  get seenBy() {
    let v = 0;
    for (const t of this.game.threats) {
      if (!t.alive || t.neutralized) continue;
      if (t.kind === 'intruder') v = Math.max(v, t.aware.get(this) ?? 0);
      else if (t.target === this && t.state === 'chase') v = Math.max(v, 1);
    }
    return v;
  }
}

export const ITEM_NAMES = { extinguisher: 'огнетушитель', bat: 'бита', mop: 'швабра' };
const ITEM_HINT = {
  extinguisher: 'Огнетушитель: держи F — тушить огонь (или в лицо нападающему). Q — бросить.',
  bat: 'Бита: F — удар. Q — бросить.',
  mop: 'Швабра: F — удар. Q — бросить.',
};

