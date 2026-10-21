import * as THREE from 'three';
import { BLD, GYM, SITE, ROOMS, CORRIDORS, EXITS } from './layout.js';
import { SCHOOL } from './config.js';
import { STADIUM, FENCE } from './yard.js';
import { ITEM_NAMES } from './player.js';

// Интерфейс: статус (время, урок/тревога, задача, таймер помощи), мини-карта этажа, здоровье,
// предмет, «тебя видят», подсказка действия, всплывающие сообщения, объявления, реплики над
// головами, затемнения (дым, урон, шкафчик), большая карта (M) и экраны меню/паузы/итогов.

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

const ZONE_COL = {
  corridor: '#3a4554', lobby: '#41566a', hall: '#4d5a46', stairs: '#5a5446', classroom: '#2f3b4a', computer: '#2f3b4a', lab: '#36404f',
  library: '#4a3d33', cafeteria: '#4a4232', nurse: '#2f4a48', principal: '#45362c', wc: '#32464f', assembly: '#4a3236',
  teachers: '#3d3650', storage: '#3f3f3a', gym: '#4a4030', gymstore: '#40392f',
};

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      clock: $('h-clock'), phase: $('h-phase'), objective: $('h-objective'), timer: $('h-timer'),
      health: $('h-health'), healthText: $('h-health-text'), item: $('h-item'), itemBar: $('h-item-bar'), seen: $('h-seen'),
      followers: $('h-followers'), stance: $('h-stance'), context: $('h-context'), toast: $('h-toast'), banner: $('h-banner'),
      bubbles: $('bubbles'), smoke: $('ov-smoke'), hurt: $('ov-hurt'), locker: $('ov-locker'), floor: $('h-floor'),
      minimap: $('minimap'), bigmap: $('bigmap'), bigmapWrap: $('bigmap-wrap'), cmdHint: $('h-cmds'),
      touchLock: $('t-lock'), touchBar: $('t-barricade'), touchThrow: $('t-throw'), touchCtx: $('t-interact'),
    };
    this.bubblePool = [];
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('div');
      d.className = 'bubble';
      d.hidden = true;
      this.el.bubbles.appendChild(d);
      this.bubblePool.push({ el: d, p: null, until: 0, vis: true, losT: 0 });
    }
    this.toastT = 0;
    this.bannerT = 0;
    this.hurtV = 0;
    this.mapT = 0;
    this.bigOpen = false;
    this.mm = this.el.minimap.getContext('2d');
    this.lastHealth = 100;
  }

  // --- сообщения ------------------------------------------------------------------------

  flash(text, dur = 2.8) {
    this.el.toast.textContent = text;
    this.el.toast.hidden = false;
    this.toastT = dur;
  }

  banner(text, kind = 'alert', dur = 6) {
    const b = this.el.banner;
    b.textContent = text;
    b.dataset.kind = kind;
    b.hidden = false;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    this.bannerT = dur;
  }

  bubble(person, text, dur = 2.2) {
    let slot = this.bubblePool.find((b) => b.p === person) ?? this.bubblePool.find((b) => b.until < this.game.time);
    if (!slot) slot = this.bubblePool.reduce((a, b) => (a.until < b.until ? a : b));
    slot.p = person;
    slot.until = this.game.time + dur;
    slot.el.textContent = text;
    slot.el.dataset.kind = person.kind === 'intruder' || person.kind === 'zombie' ? 'threat' : person.role === 'teacher' ? 'teacher' : '';
    slot.losT = 0;
  }

  setContext(c) {
    const el = this.el.context;
    const touch = this.game.input.touch;
    if (!c || !c.label) {
      if (c?.lock) { /* только замок */ } else {
        el.hidden = true;
        this._touchCtx(null);
        return;
      }
    }
    const parts = [];
    if (c.label) parts.push(touch ? c.label : `<kbd>E</kbd> ${c.label}`);
    if (c.lock && !touch) parts.push(`<kbd>R</kbd> ${c.lock}`);
    if (c.barricade && !touch) parts.push(`<kbd>B</kbd> ${c.barricade}`);
    const html = parts.join('<span class="sep"></span>');
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    el.hidden = false;
    this._touchCtx(c);
  }

  _touchCtx(c) {
    if (!this.game.input.touch) return;
    const word = c?.label ? c.label.split(' ')[0] : 'Действие';
    if (this.el.touchCtx.textContent !== word) this.el.touchCtx.textContent = word;
    this.el.touchCtx.classList.toggle('dim', !c?.label);
    this.el.touchLock.hidden = !c?.lock;
    if (c?.lock) this.el.touchLock.textContent = c.lock.toUpperCase();
    this.el.touchBar.hidden = !c?.barricade;
  }

  // --- кадр -------------------------------------------------------------------------------

  update(dt) {
    const g = this.game, p = g.player;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.hidden = true; }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.hidden = true; }
    // Статус.
    const st = g.scenario.status();
    this.el.clock.textContent = st.clock;
    this.el.phase.textContent = st.phase;
    this.el.phase.dataset.kind = st.kind;
    this.el.objective.textContent = st.objective;
    this.el.timer.textContent = st.timer ?? '';
    this.el.timer.hidden = !st.timer;
    // Здоровье.
    const hp = Math.max(0, p.health);
    this.el.health.style.width = `${hp}%`;
    this.el.health.dataset.low = hp < 35 ? '1' : '';
    this.el.healthText.textContent = Math.ceil(hp);
    if (hp < this.lastHealth - 0.5) this.hurtV = Math.min(1, this.hurtV + (this.lastHealth - hp) / 25);
    this.lastHealth = hp;
    this.hurtV = Math.max(0, this.hurtV - dt * 0.9);
    this.el.hurt.style.opacity = (this.hurtV * 0.85 + (hp < 30 ? 0.25 + Math.sin(g.time * 5) * 0.1 : 0)).toFixed(3);
    // Предмет.
    if (p.item) {
      this.el.item.hidden = false;
      this.el.item.firstChild.textContent = ITEM_NAMES[p.item.type];
      this.el.itemBar.style.width = `${(p.item.type === 'extinguisher' ? p.item.charge : 1) * 100}%`;
      this.el.touchThrow.hidden = false;
    } else {
      this.el.item.hidden = true;
      this.el.touchThrow.hidden = true;
    }
    // Видят ли.
    const seen = p.seenBy;
    this.el.seen.dataset.level = seen >= 1 ? 'seen' : seen > 0.3 ? 'notice' : p.hidden ? 'hidden' : '';
    this.el.seen.textContent = seen >= 1 ? 'ТЕБЯ ВИДЯТ' : seen > 0.3 ? 'ЗАМЕЧАЮТ…' : p.hidden ? 'СПРЯТАН' : '';
    this.el.seen.hidden = !this.el.seen.textContent;
    const fol = g.npcs.filter((n) => n.alive && n.cmd?.type === 'follow' && n.leader === p).length;
    this.el.followers.textContent = fol ? `За тобой: ${fol}` : '';
    this.el.followers.hidden = !fol;
    this.el.stance.textContent = p.hidden ? '' : p.crouch ? 'Присел' : '';
    this.el.stance.hidden = !this.el.stance.textContent;
    this.el.floor.textContent = p.zone ? `${p.floor + 1} этаж · ${p.zone.name}` : 'Школьный двор';
    // Затемнения.
    let smoke = 0;
    if (g.fire?.active) {
      const camZone = g.world.zoneAt(g.camera.position.x, g.camera.position.z, g.camera.position.y - 1.2) ?? p.zone;
      if (camZone) {
        const s = g.fire.smokeOf(camZone.id);
        const bottom = g.fire.smokeBottom(camZone.id);
        if (g.camera.position.y > bottom) smoke = Math.min(0.8, 0.15 + s * 0.75);
        else smoke = s * 0.15;
      }
    }
    this.el.smoke.style.opacity = smoke.toFixed(3);
    this.el.locker.hidden = !(p.hidden?.type === 'locker');
    this.updateBubbles(dt);
    this.mapT -= dt;
    if (this.mapT <= 0) {
      this.mapT = 0.12;
      this.drawMap(this.mm, this.el.minimap.width, this.el.minimap.height, p.zone ? p.floor : -1, false);
      if (this.bigOpen) this.drawBig();
    }
  }

  updateBubbles(dt) {
    const g = this.game, cam = g.camera;
    const w = innerWidth, h = innerHeight;
    for (const b of this.bubblePool) {
      if (!b.p || b.until < g.time || (!b.p.alive && b.p.kind !== 'intruder')) { b.el.hidden = true; continue; }
      b.p.eye(_v);
      _v.y += 0.45;
      const d = _v.distanceTo(cam.position);
      if (d > 24) { b.el.hidden = true; continue; }
      b.losT -= dt;
      if (b.losT <= 0) { b.losT = 0.3; b.vis = b.p === g.player || g.world.lineOfSight(cam.position, _v); }
      if (!b.vis) { b.el.hidden = true; continue; }
      _v.project(cam);
      if (_v.z > 1) { b.el.hidden = true; continue; }
      b.el.hidden = false;
      b.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -100%) scale(${Math.max(0.7, 1.15 - d / 30).toFixed(2)})`;
    }
  }

  // --- карты ------------------------------------------------------------------------------

  toggleBig(on = !this.bigOpen) {
    this.bigOpen = on;
    this.el.bigmapWrap.hidden = !on;
    if (on) this.drawBig();
  }

  drawBig() {
    const c = this.el.bigmap, ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    const half = Math.floor(H / 2);
    this.drawMap(ctx, W, half - 6, 1, true, 0, 0);
    this.drawMap(ctx, W, half - 6, 0, true, 0, half + 6);
  }

  // floor: 0/1 — план этажа, −1 — двор.
  drawMap(ctx, W, H, floor, big, ox = 0, oy = 0) {
    const g = this.game;
    ctx.save();
    ctx.translate(ox, oy);
    if (!big) ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,18,24,0.82)';
    ctx.fillRect(0, 0, W, H);
    let x0, x1, z0, z1;
    if (floor < 0) { x0 = SITE.x0 + 4; x1 = SITE.x1 - 2; z0 = SITE.z0 + 2; z1 = SITE.z1 - 2; }
    else { x0 = BLD.x0 - 2; x1 = (floor === 0 ? GYM.x1 : BLD.x1) + 2; z0 = BLD.z0 - 2; z1 = BLD.z1 + 2; }
    const s = Math.min(W / (x1 - x0), H / (z1 - z0));
    const offX = (W - (x1 - x0) * s) / 2, offY = (H - (z1 - z0) * s) / 2;
    // Север (−Z) сверху? Фасад (−Z) — снизу, стадион — сверху: z растёт вверх.
    const X = (x) => offX + (x - x0) * s, Y = (z) => H - offY - (z - z0) * s;
    if (floor < 0) {
      ctx.fillStyle = '#24341f';
      ctx.fillRect(X(FENCE.x0), Y(FENCE.z1), (FENCE.x1 - FENCE.x0) * s, (FENCE.z1 - FENCE.z0) * s);
      ctx.strokeStyle = '#b4493a';
      ctx.lineWidth = Math.max(2, s * 3);
      ctx.beginPath();
      ctx.ellipse(X(STADIUM.cx), Y(STADIUM.cz), (STADIUM.half + 14) * s, 14 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#5a6a7a';
      ctx.fillRect(X(BLD.x0), Y(BLD.z1), (GYM.x1 - BLD.x0) * s, (BLD.z1 - BLD.z0) * s);
      ctx.fillStyle = '#9aa';
      ctx.font = `${Math.max(9, s * 5)}px sans-serif`;
      ctx.fillText('ШКОЛА', X(-4), Y(-1));
    } else {
      const zones = [...ROOMS, ...CORRIDORS].filter((z) => z.floor === floor || (floor === 0 && (z.type === 'gym' || z.type === 'gymstore')));
      for (const z of zones) {
        if (floor === 1 && (z.type === 'gym' || z.type === 'gymstore')) continue;
        const live = g.school.zoneById.get(z.id);
        ctx.fillStyle = ZONE_COL[z.type] ?? '#333';
        ctx.fillRect(X(z.x0), Y(z.z1), (z.x1 - z.x0) * s, (z.z1 - z.z0) * s);
        if (live && !live.lightsOn) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(X(z.x0), Y(z.z1), (z.x1 - z.x0) * s, (z.z1 - z.z0) * s); }
        const sm = g.fire?.active ? g.fire.smokeOf(z.id) : 0;
        if (sm > 0.03) { ctx.fillStyle = `rgba(150,150,150,${Math.min(0.7, sm)})`; ctx.fillRect(X(z.x0), Y(z.z1), (z.x1 - z.x0) * s, (z.z1 - z.z0) * s); }
        if (z.type !== 'corridor') {
          ctx.strokeStyle = 'rgba(220,226,232,0.55)';
          ctx.lineWidth = 1;
          ctx.strokeRect(X(z.x0) + 0.5, Y(z.z1) + 0.5, (z.x1 - z.x0) * s - 1, (z.z1 - z.z0) * s - 1);
        }
        if (big && z.type !== 'corridor' && s > 6) {
          ctx.fillStyle = 'rgba(230,236,240,0.75)';
          ctx.font = `${Math.min(12, s * 1.3)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(z.short ?? z.name.split(' ')[0], X((z.x0 + z.x1) / 2), Y((z.z0 + z.z1) / 2) + 4);
          ctx.textAlign = 'left';
        }
      }
      // Огонь.
      if (g.fire?.active) {
        const fg = g.fire.floors[floor];
        ctx.fillStyle = '#ff6a1a';
        const cs = Math.max(1.5, 0.5 * s);
        for (let k = 0; k < fg.n; k++) {
          if (fg.heat[k] < 0.25) continue;
          ctx.fillRect(X(fg.x0 + (k % fg.w) * 0.5), Y(fg.z0 + (Math.floor(k / fg.w) + 1) * 0.5), cs, cs);
        }
      }
      // Двери.
      for (const d of g.doors.list) {
        if (d.floor !== floor) continue;
        ctx.fillStyle = d.broken ? '#777' : d.barricade ? '#b06cff' : d.locked ? '#ff4a3a' : d.open > 0.4 ? '#4ad07a' : '#e0b040';
        const w = Math.max(2, s * 0.35);
        if (d.axis === 'x') ctx.fillRect(X(d.a), Y(d.c) - w / 2, (d.b - d.a) * s, w);
        else ctx.fillRect(X(d.c) - w / 2, Y(d.b), w, (d.b - d.a) * s);
      }
      // Выходы.
      if (floor === 0) {
        ctx.fillStyle = '#4ad07a';
        ctx.font = `bold ${Math.max(9, s * 1.6)}px sans-serif`;
        for (const e of EXITS) ctx.fillText('⇨', X(e.out.x) - 4, Y(e.out.z) + 4);
      }
    }
    // Люди.
    const dot = (p, col, r) => {
      if (floor >= 0 && (p.floor !== floor || !p.zone && p !== g.player)) return;
      if (floor < 0 && p.zone && p !== g.player) return;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(X(p.pos.x), Y(p.pos.z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const n of g.npcs) {
      if (n.inBus) continue;
      const col = !n.alive ? '#666' : n.leader === g.player && n.cmd ? '#5cff8a' : n.role === 'teacher' ? '#ffd34a' : n.staff ? '#d8b0ff' : '#9fd0ff';
      dot(n, col, big ? 3 : 2.2);
    }
    for (const r of g.rescuers) dot(r, '#4a8cff', big ? 3.5 : 2.6);
    for (const t of g.threats) {
      const known = t.neutralized || t.knownT > g.time - 2;
      if (known) dot(t, t.neutralized ? '#a33' : '#ff2a2a', big ? 4 : 3);
    }
    // Место сбора.
    if (floor < 0) {
      const A = g.alarm.type === 'zombie' && g.scenario.rescueHere ? SCHOOL.bus : SCHOOL.assembly;
      ctx.strokeStyle = '#4ad07a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(A.x), Y(A.z), A.r * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Игрок — стрелка.
    const p = g.player;
    if (floor < 0 ? !p.zone : p.floor === floor && p.zone) {
      ctx.save();
      ctx.translate(X(p.pos.x), Y(p.pos.z));
      ctx.rotate(p.heading);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const k = big ? 7 : 5;
      ctx.moveTo(0, -k); ctx.lineTo(k * 0.7, k * 0.7); ctx.lineTo(0, k * 0.35); ctx.lineTo(-k * 0.7, k * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (big) {
      ctx.fillStyle = '#e8eef2';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(floor < 0 ? 'Двор' : `${floor + 1} этаж`, 8, 16);
    }
    ctx.restore();
  }
}
