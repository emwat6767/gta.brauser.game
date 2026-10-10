import { NPC_STATE } from './npc.js';
import { PATHS, GANG_COLOR } from './prison-data.js';

// Пути в тюрьме: ГЕРОЙ, БАНДА, РАЗРУШИТЕЛЬ (последний — в prison-wreck.js, очки идут сюда же).
// Очки пути (this.path) открывают ступени: силы (X/V) и бонусы. Подмешивается в PrisonSystem.
//   Герой: драки заключённых разнимаются, слабых бьют хулиганы (событие во дворе) — вступитесь; в бунте выручайте охрану.
//   Банда: «Позвать в банду» в разговоре (дружба ≥ «Приятель»), бойцы идут за вами и дерутся; победа над Домом — двор ваш.

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const WEAK = ['quiet', 'smart', 'paranoid', 'snitch', 'friendly'];
const BULLY = ['tough', 'jokester'];

const M = {
  _initPath() {
    this.path = this.path ?? { hero: 0, gang: 0, wreck: 0 };
    this.event = null;
    this._bullyCd = 55;
    this._gangCd = {};
    this._gangBrawl = null;
  },

  // ------------------------------------------------------------ ступени и силы
  pathTier(kind) {
    let t = -1;
    PATHS[kind].tiers.forEach((x, i) => { if ((this.path[kind] ?? 0) >= x.at) t = i; });
    return t;
  },

  addPath(kind, pts, why = '') {
    const P = PATHS[kind];
    const before = this.pathTier(kind);
    this.path[kind] = Math.round(((this.path[kind] ?? 0) + pts) * 10) / 10;
    const after = this.pathTier(kind);
    this.game.hud.toast(`${P.icon} ${P.name}: ${why || 'очки пути'} (+${pts})`, 2.2);
    if (after > before) {
      const t = P.tiers[after];
      this.game.hud.news(`${P.icon} ${P.name} · «${t.name}»: ${t.text}`, P.color);
      this.game.hud.toast(`НОВАЯ СТУПЕНЬ: ${t.name}`, 4);
      this.game.audio.pickup?.();
    }
    this.game.save?.markDirty();
  },

  unlockedModes() {
    const set = new Set(['normal']);
    for (const k of Object.keys(PATHS)) {
      const t = this.pathTier(k);
      for (let i = 0; i <= t; i++) for (const m of PATHS[k].tiers[i].unlock ?? []) set.add(m);
    }
    return set;
  },

  powersAllowed(mode) {
    if (mode === 'normal' || !this.inCustody) return true;
    return this.unlockedModes().has(mode);
  },

  // ------------------------------------------------------------ герой
  _heroDeed(pts, hours, why) {
    this.addPath('hero', pts, why);
    if (hours && this.inCustody) {
      this.total = Math.max(this.served + 1, this.total - hours);
      this.game.hud.toast(`Начальник засчитал: срок −${hours} ч`, 2.5);
    }
  },

  // Игрок ударил заключённого: true — это не нарушение (разнимает драку, бьёт хулигана, выручает охрану в бунте).
  _pathOnHitInmate(rec, npc) {
    const ev = this.event;
    if (rec.bullying && ev) { ev.helped++; return true; }
    const tgt = npc.target;
    if (npc.state === NPC_STATE.FIGHT && tgt && tgt !== this.game.player) {
      const b = this.crew.brawl;
      if (tgt.prisonInmate && b && (b.a === rec || b.b === rec)) {
        if (this.t > (this._brawlCd ?? 0)) {
          this._brawlCd = this.t + 25;
          this._heroDeed(1, 3, 'разняли драку');
          this.crew._endBrawl();
        }
        return true;
      }
      if (tgt.prisonGuard && this.crew.riot) {
        if ((this._riotSaves ?? 0) < 4 && this.t > (this._riotSaveCd ?? 0)) {
          this._riotSaveCd = this.t + 6;
          this._riotSaves = (this._riotSaves ?? 0) + 1;
          this._heroDeed(0.5, 0, 'выручили охранника');
        }
        return true;
      }
    }
    return false;
  },

  // Во дворе хулиганы бьют слабого заключённого.
  _bullyStart() {
    const p = this.game.player.position;
    const ok = (r) => r.npc && !r.npc.isDead && !r.following && !r.gang && r.arrived && r.npc.state === NPC_STATE.IDLE;
    const near = this.crew.inmates.filter((r) => ok(r) && Math.hypot(r.npc.position.x - p.x, r.npc.position.z - p.z) < 36);
    const victims = near.filter((r) => WEAK.includes(r.trait) && !r.fighter);
    if (!victims.length) return false;
    const v = pick(victims);
    const cands = near
      .filter((r) => r !== v && r.trait !== 'boss' && Math.hypot(r.npc.position.x - v.npc.position.x, r.npc.position.z - v.npc.position.z) < 16)
      .sort((a, b) => (BULLY.includes(b.trait) ? 1 : 0) - (BULLY.includes(a.trait) ? 1 : 0));
    if (cands.length < 2) return false;
    const bullies = cands.slice(0, 2);
    this.event = { kind: 'bully', victim: v, bullies, t: 0, helped: 0, x: v.npc.position.x, z: v.npc.position.z };
    for (const b of bullies) {
      b.bullying = true;
      b._bd = b.npc.melee.damage;
      b.npc.melee.damage = 3;
      b.npc.aggro(v.npc, pick(['Давай сюда, что есть, слабак!', 'Сегодня ты платишь за двор!', 'Ты мне должен!']));
    }
    v.victimOf = true;
    v.npc.say('Помогите! Не бейте!', true);
    const g = this.crew.nearestGuard(v.npc.position, 25, (x) => !x.noGuard && x.id !== 'clerk' && x.id !== 'medic');
    if (g?.npc) { this.crew.hold(g, 45); g.npc.say('Не моё дело.', true); }
    this.game.hud.news('Хулиганы избивают слабого заключённого! Вступитесь (красная «!» на карте)', '#ff5a5a');
    this.game.hud.toast('ХУЛИГАНЫ бьют слабого — вступитесь за него', 4);
    return true;
  },

  _bullyEnd(success) {
    const ev = this.event;
    if (!ev) return;
    this.event = null;
    for (const b of ev.bullies) {
      b.bullying = false;
      const n = b.npc;
      if (!n || n.isDead) continue;
      n.melee.damage = b._bd ?? n.melee.damage;
      n.dropTarget();
      n.health = Math.max(n.health, n.maxHealth * 0.6);
      n.say(pick(['Ладно, уходим.', 'Ещё встретимся!', 'Не лезь не в своё дело!']), true);
      b.arrived = false;
      b.reassign = this.crew.t + 3;
    }
    const v = ev.victim;
    v.victimOf = false;
    if (v.npc && !v.npc.isDead) {
      v.npc.dropTarget();
      v.npc.health = Math.max(v.npc.health, v.npc.maxHealth * 0.5);
      v.arrived = false;
      v.reassign = this.crew.t + 3;
    }
    this._bullyCd = 100 + Math.random() * 90;
    if (success) {
      this.addFriend(v, 22, 'спасли от хулиганов');
      v.npc?.say(pick(['Спасибо! Я твой должник.', 'Ты — настоящий герой!', 'Никто раньше за меня не заступался...']), true);
      this._heroDeed(2, 4, 'защитили слабого');
      this.game.hud.news('Вы защитили слабого заключённого: срок короче', '#5bd0ff');
    } else if (ev.helped === 0) {
      this.game.hud.toast('Хулиганы закончили. Вы не вмешались', 2.5);
    }
  },

  _bullyUpdate(dt) {
    const ev = this.event;
    ev.t += dt;
    const vn = ev.victim.npc;
    const pp = this.game.player.position;
    if (!vn || vn.isDead || this.alert > 0 || !this.crew.spawned) { this._bullyEnd(false); return; }
    if (vn.health < vn.maxHealth * 0.25) vn.health = vn.maxHealth * 0.25;     // слабого не убивают: до «еле жив»
    ev.x = vn.position.x;
    ev.z = vn.position.z;
    let live = 0;
    for (const b of ev.bullies) {
      const n = b.npc;
      if (!n || n.isDead || n.isDown) { b.done = true; continue; }
      if (n.health < n.maxHealth * 0.45 && !b.done) { b.done = true; n.dropTarget(); n.say('Ладно, ладно, уходим!', true); }
      if (b.done) continue;
      live++;
      if (n.state !== NPC_STATE.FIGHT && ev.t < 32 && ev.helped === 0) n.aggro(vn, 'Эй, ты!');
    }
    const far = Math.hypot(ev.x - pp.x, ev.z - pp.z) > 85;
    if (ev.helped > 0 && live === 0) this._bullyEnd(true);
    else if (ev.t > 48 || far) this._bullyEnd(ev.helped > 0 && ev.t > 20);
  },

  // ------------------------------------------------------------ банда
  gangMembers() { return this.crew ? this.crew.inmates.filter((r) => r.gang && !r.dead) : []; },
  gangPresent() { return this.gangMembers().filter((r) => r.npc && !r.npc.isDead); },

  gangCap() {
    let cap = 2;
    PATHS.gang.tiers.forEach((t, i) => { if (i <= this.pathTier('gang') && t.cap) cap = t.cap; });
    return cap;
  },

  _gangLook(rec, on) {
    rec.look = { ...rec.look, bandana: on ? GANG_COLOR : null };
    rec.npc?.model.setLook(rec.look);
  },

  _joinGang(rec) {
    rec.gang = true;
    this._gangLook(rec, true);
    this.crew.refreshTag(rec);
    if (rec.npc && !rec.following) this.setFollow(rec, true);
  },

  leaveGang(rec) {
    if (rec.following) this.setFollow(rec, false);
    rec.gang = false;
    this._gangLook(rec, false);
    this.crew.refreshTag(rec);
  },

  recruit(rec) {
    const lv = this.friendLevelOf(rec);
    if (rec.gang) return { line: 'Я и так в твоей банде, босс.', kind: 'neutral' };
    if (rec.trait === 'boss') return { line: 'Дом — сам себе банда. Хочешь двор — брось мне вызов.', kind: 'bad' };
    if (lv < 2) return { line: 'Мы почти не знакомы. Сначала подружись.', kind: 'bad' };
    if (this.gangMembers().length >= this.gangCap()) return { line: 'Вас и так толпа. Расти: герой, босс двора — тогда место найдётся.', kind: 'neutral' };
    if ((rec.trait === 'quiet' || rec.trait === 'paranoid') && lv < 3) return { line: 'Я не по этим делам. Лучше посижу тихо.', kind: 'bad' };
    const cigs = this.has('cigs');
    if (!cigs && this.game.wallet.money < 30) return { line: 'Взнос в банду — пачка сигарет или тридцать баксов.', kind: 'bad' };
    const chance = Math.min(0.97, 0.5 + lv * 0.12 + (['tough', 'jokester', 'friendly'].includes(rec.trait) ? 0.12 : 0) + (rec.mood - 0.5) * 0.3);
    if (Math.random() > chance) {
      this.addFriend(rec, 1);
      return { line: 'Дай подумать. Не сегодня.', kind: 'neutral', note: 'Взнос не потрачен. Попробуйте позже или угостите его' };
    }
    if (cigs) this.take('cigs'); else this.game.wallet.spend(30);
    this._joinGang(rec);
    this.addPath('gang', 1, `${rec.name.split(' ')[0]} в банде`);
    return { line: pick(['Я с тобой, босс. Куда скажешь!', 'Наконец-то настоящая банда. Беру повязку.', 'Договорились. За тебя — хоть в карцер.']), kind: 'good', close: true };
  },

  // Люди рядом с игроком: все члены банды зовутся к игроку, снова — распускаются.
  gangCall() {
    let n = 0;
    for (const r of this.gangPresent()) { if (!r.following) { this.setFollow(r, true); n++; } }
    return { ok: true, msg: n ? `Банда собирается: ${n} чел.` : 'Вся банда уже рядом' };
  },
  gangDismiss() {
    let n = 0;
    for (const r of [...this.gangPresent()]) { if (r.following) { this.setFollow(r, false); n++; } }
    return { ok: true, msg: n ? 'Банда расходится по своим делам' : 'Банда и так сама по себе' };
  },

  gangDistract() {
    if (this.t < (this._gangCd.distract ?? 0)) return { ok: false, msg: 'Банда ещё не остыла: подождите' };
    const list = this.gangPresent();
    if (list.length < 2) return { ok: false, msg: 'Для драки-отвлечения нужны двое бойцов рядом' };
    this._gangCd.distract = this.t + 90;
    const [a, b] = list;
    a.npc.aggro(b.npc, 'Ты что сказал?!');
    b.npc.aggro(a.npc, 'Повтори!');
    this._gangBrawl = { a, b, t: 0 };
    this.distract = Math.max(this.distract, 50);
    return { ok: true, msg: 'Двое ваших затеяли драку: охрана смотрит туда, 50 секунд вас замечают хуже' };
  },

  gangAttackGuards() {
    if (this.alert < 2 && !this.crew.riot) return { ok: false, msg: 'Банда бьёт охрану только в тревогу или бунт' };
    let n = 0;
    for (const r of this.gangPresent()) {
      const g = this.crew.nearestGuard(r.npc.position, 32, (x) => !x.noGuard && x.id !== 'clerk' && x.id !== 'medic');
      if (g?.npc && r.npc.state !== NPC_STATE.FIGHT) { r.npc.aggro(g.npc, 'Бей охрану!'); n++; }
    }
    return { ok: true, msg: n ? `${n} бойцов бросились на охрану` : 'Охраны рядом не видно' };
  },

  // Игрок бьёт кого-то: банда рядом вступается (на охрану — только в тревогу).
  _gangAssist(target) {
    if (!target || target.isDead || target === this.game.player || !this.crew?.spawned) return;
    const rec = target.prisonInmate;
    if (rec && (rec.gang || rec.following)) return;
    if (target.prisonGuard && this.alert < 2 && !this.crew.riot) return;
    const tp = target.position;
    for (const r of this.gangPresent()) {
      const n = r.npc;
      if (n.state === NPC_STATE.FIGHT || n.isDown || n === target) continue;
      if (Math.hypot(n.position.x - tp.x, n.position.z - tp.z) > 22) continue;
      n.aggro(target, pick(['За босса!', 'Бей его!', 'Держись, шеф!']));
    }
  },

  // Победа над Домом: двор ваш, часть его людей идёт в вашу банду.
  _wonYard(rec) {
    this.flags.yardKing = true;
    this.addPath('gang', 3, 'победа над Домом');
    this.addFriend(rec, 40);
    let n = 0;
    for (const r of this.crew.inmates) {
      if (n >= 3 || r.gang || r === rec || r.dead) continue;
      if (this.gangMembers().length >= this.gangCap()) break;
      if (r.trait === 'tough' || (r.trait === 'jokester' && n < 1)) { this._joinGang(r); n++; }
    }
    this.game.hud.news('Двор «Редрока» теперь ваш! Люди Дома вступили в вашу банду', GANG_COLOR);
    this.game.hud.toast(`Вы — хозяин двора. Люди Дома в банде: ${n}. Налог каждый день`, 4);
  },

  // Начало нового дня: налог со двора, предатель в банде.
  _pathDaily() {
    const game = this.game;
    if (this.flags.yardKing) {
      const tax = 40 + 10 * this.gangMembers().length;
      game.wallet.add(tax);
      game.hud.toast(`Налог со двора: +$${tax}`, 3);
    }
    for (const r of this.gangMembers()) {
      if (r.trait === 'snitch' && Math.random() < 0.4) {
        this.sus = Math.min(1.2, this.sus + 0.35);
        game.hud.toast('Кто-то из банды стучит охране. Ищите стукача!', 3.5);
      }
    }
  },

  // ------------------------------------------------------------ каждый кадр
  _pathTick(dt) {
    // Хулиганы во дворе: раз в 1.5–3 минуты в прогулку и свободное время, пока игрок рядом.
    if (this.event) this._bullyUpdate(dt);
    else if (this.alert === 0 && !this.crew.riot && !this.busy && !this.ui.isOpen && !this.action && this.flags.hazed && this.crew.spawned && ['yard', 'rec', 'work'].includes(this.phase.id)) {
      this._bullyCd -= dt;
      if (this._bullyCd <= 0) { this._bullyCd = 25; this._bullyStart(); }
    }
    const gb = this._gangBrawl;
    if (gb) {
      gb.t += dt;
      const dead = !gb.a.npc || !gb.b.npc || gb.a.npc.isDead || gb.b.npc.isDead;
      if (dead || gb.t > 12) {
        this._gangBrawl = null;
        for (const r of [gb.a, gb.b]) {
          const n = r.npc;
          if (!n || n.isDead) continue;
          n.dropTarget();
          n.health = Math.max(n.health, n.maxHealth * 0.7);
          n.say('Ладно, мир.', true);
        }
      }
    }
  },

  // ------------------------------------------------------------ данные для окна «Путь»
  pathCards() {
    return Object.entries(PATHS).map(([id, P]) => {
      const pts = this.path[id] ?? 0;
      const tier = this.pathTier(id);
      const next = P.tiers[tier + 1] ?? null;
      return { id, P, pts, tier, next, cur: tier >= 0 ? P.tiers[tier] : null };
    });
  },
};

export function installPath(PrisonSystem) {
  Object.defineProperties(PrisonSystem.prototype, Object.getOwnPropertyDescriptors(M));
}
