import * as THREE from 'three';
import { DUEL_HP } from './bosses.js';
import { lineOfSight } from './ballistics.js';

// Дуэль героя и злодея — суперсражение 1 на 1 со стримом.
//
// Клавиша B (кнопка ДУЭЛЬ): играть за ЗЛОДЕЯ → играть за ГЕРОЯ → обычный режим.
//   За злодея: убей любого прохожего — Герой почти мгновенно прилетает (падает с неба рядом) и начинается бой.
//   За героя: через несколько секунд Злодей нападает на прохожего (молния с неба) и сам идёт на тебя.
// Соперник — настоящий босс города (bosses.js) со всеми способностями; сам Герой/Злодей, за которого ты
// играешь, из мира убирается (Boss.suspend). Игрок: 900 здоровья, F — молния, Q — прыжок-удар, R — таран/рывок,
// G — ливень молний (powers-more.js).
//
// Состояния: off → waiting → trigger → arriving → intro → fight → over → waiting …
// Во время боя:
//   • вокруг собирается огромная толпа (worklife.watch с big: до ~70 человек, часть подвозится со всего района);
//   • идёт стрим: плашка LIVE, число зрителей растёт от накала боя (удары, способности, добивание),
//     чат и донаты, врезка с камерой-дроном (renderStream), полоса VS с здоровьем обоих;
//   • розыск замораживается (полиция не вмешивается), соперник бьёт слабее (DUEL_DAMAGE в bosses.js).
// После боя — итоги стрима: пик зрителей, донаты и награда (деньги).

const INTRO = 2.4;
const TRIGGER_DELAY = 1.7;       // от убийства до прилёта соперника
const USERS = ['ryan_x', 'NightOwl', 'Lucy_K', 'mike1999', 'DJ_Pixel', 'tanya.vlg', 'Kostya_Z', 'Alex_Hunt', 'Sasha_Gamer', 'MrBean228', 'katya_s', 'ArtemFPS',
  'olga_nsk', 'pro100_Vlad', 'Zeus_77', 'bella_c', 'Dimon_Moto', 'Viktor_Ch', 'IvanTV', 'Masha_Pop', 'Nikita_Dev', 'sonya.live', 'Gleb_K', 'Rita_V', 'Max_Power', 'Dana_G'];
const CHAT = {
  calm: ['Начинается!', 'Кто тут с самого начала?', 'Я за героя', 'Я за злодея', 'Погнали', 'Ставлю на {opp}', 'Ого, сколько народу', 'Тихо... сейчас начнётся', 'Где это вообще?', 'Всем привет из Новосибирска'],
  hype: ['ВОТ ЭТО БОЙ!!!', 'ААААА', 'ЛУЧШИЙ СТРИМ ГОДА', 'ДАВАЙ ДАВАЙ ДАВАЙ', 'Он летит!!!', 'ЖЕСТЬ', 'Кадр в историю', 'Запишите кто-нибудь', 'Я не дышу', 'МОЛНИЯ!!!', 'Это кино, а не стрим', 'Чат, держитесь', 'КАК ОН ЭТО ВЫДЕРЖАЛ', 'Рекордный онлайн!'],
  low: ['ДОБИВАЙ!!!', 'Он сейчас упадёт', 'Не сдавайся!', 'Один удар остался', 'ПОСЛЕДНИЙ РАУНД', 'Ну же, ну же...'],
  donate: ['Держи, красавчик', 'На лечение', 'ЗАДАЙ ЕМУ!', 'За лучшее шоу в городе', 'Ещё и ещё!', 'Лови молнию'],
};

const _v2 = new THREE.Vector2(), _f = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _mid = new THREE.Vector3();

const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');
const hue = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 80% 68%)`; };

export class DuelSystem {
  constructor(game) {
    this.game = game;
    this.state = 'off';
    this.side = null;
    this.me = null;
    this.opp = null;
    this.t = 0;
    this.event = null;
    this.attackIn = 0;
    this.victim = null;
    this.ownsTime = false;
    this.s = this._newStream();
    this.cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 600);
    this.camAngle = 0;
    this.pip = { active: false, rect: null, frame: 0 };
    this._uiT = 0;

    const $ = (id) => document.getElementById(id);
    this.el = {
      stream: $('stream'), live: $('stream-live'), title: $('stream-title'), viewers: $('stream-viewers'), pip: $('stream-pip'),
      peak: $('stream-peak'), crowd: $('stream-crowd'), don: $('stream-don'), hype: $('stream-hype').firstElementChild, chat: $('stream-chat'),
      bar: $('duel-bar'), lname: $('duel-lname'), lfill: $('duel-lfill'), rname: $('duel-rname'), rfill: $('duel-rfill'), vs: $('duel-vs'),
      splash: $('duel-splash'), sl: $('duel-splash-l'), sr: $('duel-splash-r'), summary: $('duel-summary'),
    };

    game.events.on('character:killed', ({ target, attacker }) => this._onKilled(target, attacker));
    game.events.on('character:damaged', ({ target, attacker, amount }) => {
      if (this.state !== 'fight' || !this.opp?.npc) return;
      const p = game.player;
      if ((attacker === p && target === this.opp.npc) || (attacker === this.opp.npc && target === p)) this.pulse(Math.min(0.25, amount / 220));
    });
    game.events.on('player:down', () => {
      if (['arriving', 'intro', 'fight'].includes(this.state)) this._over('loss');
    });
  }

  // Игрок сейчас в дуэльном режиме (любое состояние кроме off).
  get active() {
    return this.state !== 'off';
  }

  get inFight() {
    return this.state === 'arriving' || this.state === 'intro' || this.state === 'fight';
  }

  opponentNpc() {
    return this.opp?.npc ?? null;
  }

  // Босс спрашивает, кого бить: в бою — только игрока.
  targetFor(boss) {
    if (boss !== this.opp) return null;
    return this.state === 'fight' && !this.game.player.isDead ? this.game.player : null;
  }

  // Накал боя (0..1): удар, способность, добивание. Растёт онлайн стрима.
  pulse(x) {
    this.s.hype = Math.min(1, this.s.hype + x);
  }

  // B: злодей → герой → выкл.
  toggle() {
    const { game } = this;
    const m = game.powers.mode;
    if (m === 'duel_villain') game.powers.set('duel_hero');
    else if (m === 'duel_hero') game.powers.set('normal');
    else game.powers.set('duel_villain');
  }

  // Вызывается из powers.set (после смены режима).
  onMode(prev, next) {
    const duelNext = next === 'duel_villain' || next === 'duel_hero';
    if (this.state !== 'off') this._leave();
    if (duelNext) this._enter(next === 'duel_villain' ? 'villain' : 'hero');
  }

  // ---------------------------------------------------------------- вход / выход

  _enter(side) {
    const { game } = this;
    const B = game.bosses;
    this.side = side;
    this.me = side === 'villain' ? B.villain : B.hero;
    this.opp = side === 'villain' ? B.hero : B.villain;
    this.me.suspend();
    this.opp.duel = false;
    this.opp.suspended = false;
    this.state = 'waiting';
    this.t = 0;
    this.attackIn = side === 'hero' ? 6 : 0;
    this.s = this._newStream();
    this._ui();
  }

  _leave() {
    const { game } = this;
    this._stopTime();
    this._endCrowd();
    this._hideStream();
    game.wanted.frozen = false;
    this.pip.active = false;
    for (const m of [...game.bosses.minions]) game.bosses._retireMinion(m);
    this.me?.unsuspend();
    if (this.opp) {
      this.opp.duel = false;
      if (this.opp.alive) {
        this.opp.disengage();
        if (this.opp.npc.maxHealth === DUEL_HP) this.opp.npc.maxHealth = this.opp.def.health;
        this.opp.npc.health = Math.min(this.opp.npc.health, this.opp.npc.maxHealth);
        this.opp.unsuspend();
      }
    }
    this.state = 'off';
    this.side = this.me = this.opp = null;
    game.hud.setObjective('');
    this._ui();
  }

  // ---------------------------------------------------------------- запуск боя

  _onKilled(target, attacker) {
    if (this.state !== 'waiting' || this.side !== 'villain') return;
    const { game } = this;
    if (attacker !== game.player || target === game.player || target.boss || target.minion || target.elite) return;
    this._startTrigger(target.position, 'Ты убил прохожего — Герой вылетел!');
  }

  _startTrigger(point, text) {
    const { game } = this;
    this.state = 'trigger';
    this.t = 0;
    this.point = { x: point.x, z: point.z };
    game.hud.news(text, this.side === 'villain' ? '#ffd24a' : '#b44cff');
    game.hud.announce?.(this.side === 'villain' ? 'ГЕРОЙ ВЫЛЕТЕЛ' : 'ЗЛОДЕЙ НАПАЛ НА ГОРОД', this.side === 'villain' ? '#ffd24a' : '#b44cff');
    game.audio.alarm?.(game.player.position);
    game.cameraRig.addShake?.(0.2);
  }

  // Злодей бьёт случайного прохожего молнией с неба (сторона героя).
  _villainStrike() {
    const { game } = this;
    const p = game.player.position;
    let victim = null, best = Infinity;
    for (const n of game.npcs.list) {
      if (n.role !== 'civilian' || n.isDead || n.vehicle || n.fighter || !n.model.root.visible) continue;
      const d = Math.hypot(n.position.x - p.x, n.position.z - p.z);
      if (d < 14 || d > 60) continue;
      const score = d + (game.inView(n.position.x, 1, n.position.z, 1) ? 0 : 40);
      if (score < best) { best = score; victim = n; }
    }
    const at = victim ? victim.position : _a.set(p.x + 20, 0, p.z + 20);
    const sky = _b.set(at.x, at.y + 60, at.z);
    game.vfx.bolt(sky, _f.set(at.x, at.y + 0.5, at.z), 'violet', { life: 0.6, width: 0.8, jag: 2, segs: 14 });
    game.vfx.pillar(at, 'violet', 50, 1.2, 1);
    game.vfx.explosion(_f.set(at.x, at.y + 0.5, at.z), { theme: 'violet', aoe: 3, damage: 0, force: 8, owner: this.opp.npc, only: (c) => c !== game.player, big: true });
    if (victim && !victim.isDead) victim.takeDamage(999, this.opp.npc, 0, 1, 'blast');
    this._startTrigger(at, 'Злодей Damon Crowe убил прохожего и идёт за тобой!');
  }

  // Соперник падает с неба рядом с игроком.
  _arrive() {
    const { game } = this;
    const b = this.opp;
    const p = game.player;
    // Соперник на месте: если убит или ещё не вернулся — появляется заново.
    if (!b.npc || b.npc.removed || b.npc.isDead) {
      if (b.npc && !b.npc.removed) game.npcs.remove(b.npc);
      b.respawnIn = 0;
      b.spawn(p.position.x + 30, p.position.z);
    }
    // Место прилёта: 17–22 м впереди по взгляду камеры, на свободной земле.
    game.cameraRig.forward(_f);
    const l = Math.hypot(_f.x, _f.z) || 1;
    let spot = null;
    for (let k = 0; k < 16 && !spot; k++) {
      const a = (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.35;
      const r = 17 + (k % 5) * 1.3;
      const fx = (_f.x / l) * Math.cos(a) - (_f.z / l) * Math.sin(a), fz = (_f.x / l) * Math.sin(a) + (_f.z / l) * Math.cos(a);
      const x = p.position.x + fx * r, z = p.position.z + fz * r;
      if (game.world.isCircleFree(x, z, 1.4)) spot = { x, z };
    }
    spot ??= { x: p.position.x - (_f.x / l) * 18, z: p.position.z - (_f.z / l) * 18 };
    b.arrive(spot.x, spot.z);
    const T = b.def.theme;
    const g = game.world.getGroundHeight(spot.x, spot.z);
    game.vfx.pillar(_a.set(spot.x, g, spot.z), T, 70, 1.8, 1.4);
    game.vfx.bolt(_b.set(spot.x, g + 75, spot.z), _f.set(spot.x, g + 0.5, spot.z), T, { life: 0.7, width: 0.9, jag: 2, segs: 14 });
    game.effects.ring(_a, 10, new THREE.Color(b.color).getHex());
    game.cameraRig.addShake?.(0.45);
    game.audio.slam?.(_a, 1.2);
    game.hud.news(`${b.name} прилетел! Бой начинается`, b.color);
    // Мир успокаивается: розыск замораживается, полиция не вмешивается.
    game.wanted.clear();
    game.wanted.frozen = true;
    // Толпа и стрим.
    const mx = (spot.x + p.position.x) / 2, mz = (spot.z + p.position.z) / 2;
    this.event = game.worklife.watch(_a.set(mx, g, mz), 130, 900, { big: true, max: 70, ring: [12, 28], audience: 52 });
    this._startStream();
    this.state = 'arriving';
    this.t = 0;
  }

  _startIntro() {
    const { game } = this;
    this.state = 'intro';
    this.t = 0;
    const b = this.opp;
    b.npc.cast = INTRO + 0.2;
    b.npc.heading = Math.atan2(game.player.position.x - b.npc.position.x, game.player.position.z - b.npc.position.z);
    this.s.hype = Math.max(this.s.hype, 0.55);
    this._timeScale(0.35);
    const mine = this.side === 'villain' ? 'ЗЛОДЕЙ' : 'ГЕРОЙ';
    this.el.sl.textContent = `ТЫ · ${mine}`;
    this.el.sl.style.color = this.me.color;
    this.el.sr.textContent = b.name;
    this.el.sr.style.color = b.color;
    this.el.splash.classList.remove('hidden');
    game.audio.fanfare?.(4);
    this.say('Поехали!');
  }

  _startFight() {
    this.state = 'fight';
    this.t = 0;
    this._stopTime();
    this.el.splash.classList.add('hidden');
    this.opp.engage(this.game.player);
    this.say('Бой!');
  }

  say(text) {
    this.game.hud.toast?.(text, 1.2);
  }

  // ---------------------------------------------------------------- конец боя

  _over(result) {
    const { game } = this;
    if (this.state === 'over') return;
    this.state = 'over';
    this.t = 0;
    this.result = result;
    this.el.splash.classList.add('hidden');
    const s = this.s;
    s.final = true;
    this.pulse(0.6);
    // Итоги: донаты + бонус за пик зрителей.
    const bonus = Math.round(s.peak * 0.03);
    s.earned = s.donations + bonus;
    if (s.earned > 0) game.wallet.add(s.earned);
    const win = result === 'win';
    this.el.summary.innerHTML = `<h3>${win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h3>
      <p>Стрим окончен. Пик зрителей: <b>${fmt(s.peak)}</b></p>
      <p>Донаты: <b>$${fmt(s.donations)}</b> + бонус за онлайн <b>$${fmt(bonus)}</b></p>`;
    this.el.summary.style.setProperty('--dc', win ? '#6fe07a' : '#ff6b6b');
    this.el.summary.classList.remove('hidden');
    game.hud.news(`Стрим завершён: ${fmt(s.peak)} зрителей, +$${fmt(s.earned)}`, '#ff4d8d');
    if (win) {
      this._timeScale(0.3);
      game.audio.fanfare?.(7);
      // Толпа ликует.
      for (const n of this.event?.watchers ?? []) if (!n.isDead && n.state === 'idle') n.activity = 'hands';
    }
    this.opp.duel = false;
  }

  _finish() {
    const { game } = this;
    this._stopTime();
    this._endCrowd();
    this._hideStream();
    this.el.summary.classList.add('hidden');
    this.pip.active = false;
    game.wanted.frozen = false;
    for (const m of [...game.bosses.minions]) game.bosses._retireMinion(m);
    if (this.opp.alive) {
      this.opp.disengage();
      if (this.opp.npc.maxHealth === DUEL_HP) this.opp.npc.maxHealth = this.opp.def.health;
      this.opp.unsuspend();
    }
    this.state = 'waiting';
    this.t = 0;
    this.attackIn = this.side === 'hero' ? 10 : 0;
    this.s = this._newStream();
    this._ui();
  }

  _endCrowd() {
    if (this.event) this.game.worklife.stopWatch(this.event);
    this.event = null;
  }

  _timeScale(k) {
    this.game.timeScale = k;
    this.ownsTime = true;
  }

  _stopTime() {
    if (this.ownsTime) this.game.timeScale = 1;
    this.ownsTime = false;
  }

  // ---------------------------------------------------------------- стрим

  _newStream() {
    return { viewers: 0, peak: 0, hype: 0, donations: 0, chat: [], chatT: 0, donT: 4, live: false, t: 0, final: false, earned: 0 };
  }

  _startStream() {
    const s = this._newStream();
    s.live = true;
    s.viewers = 400 + Math.random() * 800;
    s.peak = s.viewers;
    s.hype = 0.35;
    this.s = s;
    this._chat('calm');
    this.el.stream.classList.remove('hidden');
    this.pip.active = !this.game.input.touchActive;
    this.pip.rect = null;
    this.camAngle = Math.random() * 6;
    this.cam.position.set(0, 20, 0);
    this.el.title.textContent = `СУПЕРБОЙ · ${this.opp.name} vs ТЫ`;
    this.el.live.classList.add('on');
  }

  _hideStream() {
    this.el.stream.classList.add('hidden');
    this.el.bar.classList.add('hidden');
    this.el.splash.classList.add('hidden');
    this.s.live = false;
    this.pip.active = false;
  }

  _chat(kind, extra = null) {
    const { game } = this;
    const rng = game.rng;
    const name = rng.pick(USERS);
    let text = rng.pick(CHAT[kind]).replace('{opp}', this.opp?.name ?? 'Герой');
    const msg = { name, text, donate: extra };
    this.s.chat.push(msg);
    if (this.s.chat.length > 5) this.s.chat.shift();
  }

  _updateStream(dt) {
    const s = this.s;
    if (!s.live) return;
    const { game } = this;
    s.t += dt;
    const fighting = this.state === 'fight' || this.state === 'intro';
    // Накал: затухает, но не ниже «базы» боя; при низком здоровье растёт.
    const hpMin = Math.min(game.player.health / game.player.maxHealth, this.opp?.alive ? this.opp.hp : 1);
    const floor = fighting ? (hpMin < 0.25 ? 0.72 : 0.3) : 0.1;
    s.hype = Math.max(floor, s.hype - 0.1 * dt);
    // Онлайн растёт тем быстрее, чем выше накал.
    if (this.state !== 'over') {
      s.viewers += (s.viewers * 0.05 + 120) * dt * (0.4 + s.hype * 2.2) * (0.7 + Math.random() * 0.6) * Math.max(0, 1 - s.viewers / 260000);
    } else {
      s.viewers *= 1 + 0.01 * dt;
    }
    s.peak = Math.max(s.peak, s.viewers);
    // Чат.
    s.chatT -= dt;
    if (s.chatT <= 0) {
      s.chatT = Math.max(0.22, 1.2 - s.hype * 0.95) * (0.6 + Math.random() * 0.8);
      this._chat(hpMin < 0.25 && game.rng.chance(0.5) ? 'low' : s.hype > 0.55 ? 'hype' : 'calm');
    }
    // Донаты.
    s.donT -= dt;
    if (s.donT <= 0 && this.state !== 'over') {
      s.donT = Math.max(2.2, 9 - s.hype * 6.5) * (0.6 + Math.random() * 0.8);
      const amount = game.rng.pick([50, 100, 100, 250, 250, 500, 1000, 2500]);
      s.donations += amount;
      this._chat('donate', amount);
    }
  }

  // Камера-дрон: облёт места боя; не лезет в здания (проверка прямой видимости).
  _updateCam(dt) {
    const { game } = this;
    const p = game.player.position, o = this.opp?.npc;
    const ox = o && !o.removed ? o.position.x : p.x + 10, oz = o && !o.removed ? o.position.z : p.z;
    _mid.set((p.x + ox) / 2, (p.y + (o?.position.y ?? p.y)) / 2 + 1.6, (p.z + oz) / 2);
    const d = Math.hypot(p.x - ox, p.z - oz);
    const dist = Math.min(28, Math.max(12, d * 1.1 + 9));
    this.camAngle += dt * 0.28;
    let best = null;
    // Дрон смотрит сверху: чем выше, тем меньше мешают здания (и ракурс эффектнее).
    for (const da of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) {
      const a = this.camAngle + da;
      _a.set(_mid.x + Math.cos(a) * dist, _mid.y + 8 + dist * 0.22, _mid.z + Math.sin(a) * dist);
      if (lineOfSight(game, _mid, _a) && lineOfSight(game, _b.set(_mid.x, _mid.y + 3, _mid.z), _a)) { best = _a.clone(); if (da) this.camAngle = a; break; }
    }
    best ??= _a.set(_mid.x, _mid.y + 24, _mid.z + 0.1).clone();
    this.cam.position.lerp(best, 1 - Math.exp(-3 * dt));
    this.cam.lookAt(_mid);
  }

  // Врезка трансляции: сцена с камеры-дрона рисуется в маленькую текстуру (раз в 3 кадра, без пересчёта теней),
  // а в угол экрана (ножницами) каждый кадр выводится готовая картинка.
  renderStream(renderer, scene) {
    if (!this.pip.active || !this.s.live) return;
    if (!this.pip.rect || (++this.pip.frame % 45) === 0) {
      const r = this.el.pip.getBoundingClientRect();
      this.pip.rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    const R = this.pip.rect;
    if (R.w < 40 || R.h < 30) return;
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(384, 216);
      this.quadScene = new THREE.Scene();
      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.rt.texture, depthTest: false, depthWrite: false }));
      quad.frustumCulled = false;
      this.quadScene.add(quad);
      this.cam.aspect = 16 / 9;
      this.cam.updateProjectionMatrix();
      this.rtFrame = 0;
    }
    if (this.rtFrame++ % 3 === 0) {
      const prevShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.rt);
      renderer.render(scene, this.cam);
      renderer.setRenderTarget(null);
      renderer.shadowMap.autoUpdate = prevShadow;
    }
    renderer.getSize(_v2);
    const y = _v2.y - R.y - R.h;
    renderer.setScissorTest(true);
    renderer.setViewport(R.x, y, R.w, R.h);
    renderer.setScissor(R.x, y, R.w, R.h);
    renderer.render(this.quadScene, this.quadCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, _v2.x, _v2.y);
  }

  // ---------------------------------------------------------------- интерфейс

  _ui() {
    const { game } = this;
    if (this.state === 'off') {
      game.hud.setObjective('');
      return;
    }
  }

  _updateUI(dt) {
    const { game } = this;
    const E = this.el;
    // Полосы здоровья: слева игрок, справа соперник.
    const fighting = this.inFight || this.state === 'over';
    E.bar.classList.toggle('hidden', !fighting);
    if (fighting && this.opp) {
      const p = game.player;
      E.lname.textContent = `ТЫ · ${this.side === 'villain' ? 'ЗЛОДЕЙ' : 'ГЕРОЙ'}`;
      E.lname.style.color = this.me.color;
      E.lfill.style.width = `${Math.max(0, (p.health / p.maxHealth) * 100).toFixed(1)}%`;
      E.lfill.style.background = this.me.color;
      E.rname.textContent = this.opp.name;
      E.rname.style.color = this.opp.color;
      E.rfill.style.width = `${(this.opp.hp * 100).toFixed(1)}%`;
      E.rfill.style.background = this.opp.color;
    }
    // Подсказка, пока ждём.
    if (this.state === 'waiting') {
      game.hud.setObjective(this.side === 'villain'
        ? '<b>ДУЭЛЬ ЗА ЗЛОДЕЯ:</b> убей любого прохожего — прилетит Герой'
        : '<b>ДУЭЛЬ ЗА ГЕРОЯ:</b> скоро Злодей нападёт на город — будь готов');
    } else if (this.state === 'off') {
      // objective сбрасывается в _leave
    } else {
      game.hud.setObjective('');
    }
    // Стрим (раз в 0.2 с).
    this._uiT -= dt;
    if (this._uiT > 0 || !this.s.live) return;
    this._uiT = 0.2;
    const s = this.s;
    E.viewers.textContent = fmt(s.viewers);
    E.peak.textContent = fmt(s.peak);
    E.crowd.textContent = String(this.event?.watchers.length ?? 0);
    E.don.textContent = `$${fmt(s.donations)}`;
    E.hype.style.width = `${(s.hype * 100).toFixed(0)}%`;
    E.live.classList.toggle('blink', Math.floor(s.t * 2) % 2 === 0);
    E.chat.innerHTML = s.chat.map((m) => (m.donate
      ? `<div class="donate"><b style="color:${hue(m.name)}">${m.name}</b> задонатил $${fmt(m.donate)}: ${m.text}</div>`
      : `<div><b style="color:${hue(m.name)}">${m.name}</b> ${m.text}</div>`)).join('');
  }

  // ---------------------------------------------------------------- каждый кадр

  update(dt) {
    if (this.state === 'off') return;
    const { game } = this;
    this.t += dt;

    switch (this.state) {
      case 'waiting':
        if (this.side === 'hero' && !game.player.isDead) {
          this.attackIn -= dt;
          if (this.attackIn <= 0 && !game.downState) this._villainStrike();
        }
        break;
      case 'trigger':
        if (this.t > TRIGGER_DELAY) this._arrive();
        break;
      case 'arriving': {
        const n = this.opp.npc;
        if ((!n.airborne && !this.opp.slam && this.t > 0.8) || this.t > 4) this._startIntro();
        break;
      }
      case 'intro':
        if (this.t > 1.4 && this.ownsTime) this._stopTime();
        if (this.t > INTRO) this._startFight();
        break;
      case 'fight':
        if (!this.opp.alive || this.opp.npc.isDead) this._over('win');
        else this._recenter(dt);
        break;
      case 'over':
        // Победа: замедленная съёмка 1.2 с, потом возврат к обычному времени.
        if (this.t > 1.2) this._stopTime();
        if (this.t > 7.5) this._finish();
        break;
      default:
    }

    if (this.s.live) {
      this._updateStream(dt);
      if (this.pip.active) this._updateCam(dt);
    }
    this._updateUI(dt);
  }

  // Бой уехал далеко от центра зрелища — толпа перестраивается вокруг новой точки.
  _recenter(dt) {
    const e = this.event;
    if (!e) return;
    this._rcT = (this._rcT ?? 0) - dt;
    if (this._rcT > 0) return;
    this._rcT = 4;
    const p = this.game.player.position, o = this.opp.npc.position;
    const mx = (p.x + o.x) / 2, mz = (p.z + o.z) / 2;
    if (Math.hypot(mx - e.x, mz - e.z) < 24) return;
    e.x = mx;
    e.z = mz;
    const rng = this.game.rng;
    for (const n of e.watchers) {
      if (n.isDead || n.removed || n.vehicle) continue;
      const dx = n.position.x - mx, dz = n.position.z - mz, d = Math.hypot(dx, dz) || 1;
      const r = rng.range(e.ring[0], e.ring[1]);
      const x = mx + (dx / d) * r, z = mz + (dz / d) * r;
      if (!this.game.world.isCircleFree(x, z, 0.5)) continue;
      n.goTo(x, z, Math.max(5, e.until - this.game.worklife.time), { x: mx, z: mz });
    }
  }
}
