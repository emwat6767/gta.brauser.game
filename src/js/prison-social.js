import { NPC_STATE } from './npc.js';
import {
  ITEMS, TRAITS, FRIEND_LEVELS, friendLevel, SMALL_TALK, JOKES, JOKE_REACT, PRANKS, RUMORS, LAWYER, JOBS, GUARD_IDLE, SCHEDULE,
} from './prison-data.js';

// Тюремные отношения: дружба с заключёнными, разговоры, шутки, розыгрыши, подарки, слухи, карты, спарринги, бунт,
// разговоры с охраной (взятка, больничка, условно-досрочное), звонки и визиты адвоката. Подмешивается в PrisonSystem.
// Методы возвращают результат { line, kind, note }, который prison-ui.js показывает в окне разговора.

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const ESCAPE_RUMORS = new Set(['tunnel', 'fence', 'uniform', 'bribe', 'count', 'riot', 'getaway']);

const M = {
  // ------------------------------------------------------------ дружба
  friendLevelOf(rec) { return friendLevel(rec.friend ?? 0); },
  friendName(lv) { return FRIEND_LEVELS[Math.max(0, Math.min(FRIEND_LEVELS.length - 1, lv))].name; },

  addFriend(rec, pts, why = '') {
    const before = this.friendLevelOf(rec);
    rec.friend = Math.max(0, (rec.friend ?? 0) + pts);
    const after = this.friendLevelOf(rec);
    this.crew.refreshTag(rec);
    if (after > before) {
      this.game.hud.toast(`${rec.name}: теперь ${this.friendName(after).toLowerCase()}`, 3);
      this.stats.respect += 2;
      this.game.audio.pickup?.();
    } else if (after < before) {
      this.game.hud.toast(`${rec.name} стал относиться к вам хуже${why ? ` (${why})` : ''}`, 2.5);
      if (rec.following && after < 4) this.setFollow(rec, false);
    }
    this.game.save?.markDirty();
  },

  _greeting(rec) {
    const T = TRAITS[rec.trait];
    const lv = this.friendLevelOf(rec);
    const group = lv >= 4 ? 2 : lv >= 2 ? 1 : 0;
    return pick(T.greet[group]);
  },

  _cooling(rec, key) { return (rec.talkAt[key] ?? 0) > this.t; },
  _setCool(rec, key, sec) { rec.talkAt[key] = this.t + sec; },

  // ------------------------------------------------------------ меню разговора
  talkMenu(rec) {
    const lv = this.friendLevelOf(rec);
    const opts = [
      { id: 'chat', label: 'Поболтать', sub: 'узнать новости, подружиться' },
      { id: 'joke', label: 'Рассказать шутку', sub: 'шутники в восторге, суровые — не очень' },
      { id: 'prank', label: 'Устроить розыгрыш…', sub: 'поставить подножку, облить водой, стащить батончик' },
      { id: 'gift', label: 'Угостить…', sub: 'чипсы, лапша, кофе, сигареты' },
      { id: 'rumor', label: 'Что слышно?', sub: 'слухи, подсказки по режиму и побегам' },
    ];
    if (lv >= 1) opts.splice(1, 0, { id: 'story', label: 'Расспросить, за что сидит', sub: '' });
    if (rec.trait === 'dealer') opts.push({ id: 'trade', label: 'Купить «из-под полы»', sub: lv >= 1 ? 'ложки, отмычки, кусачки, верёвки' : 'нужен хотя бы статус «Знакомый»', disabled: lv < 1 });
    opts.push({ id: 'cards', label: 'Сыграть в карты', sub: 'ставка на деньги' });
    if (lv >= 1) opts.push({ id: 'spar', label: 'Спарринг (ставка)', sub: 'честная драка до 30% здоровья' });
    if (lv >= 3) opts.push({ id: 'cover', label: 'Попросить прикрыть', sub: 'друг отвлечёт охрану на 45 секунд' });
    if (lv >= 4) opts.push({ id: 'follow', label: rec.following ? 'Отпустить' : 'Позвать с собой', sub: rec.following ? '' : 'друг пойдёт за вами и вступится в драке' });
    if (rec.trait === 'boss' && lv >= 3) opts.push({ id: 'riot', label: 'Поднять бунт', sub: this.know.has('riot') ? 'охрана растеряется, камеры откроются' : 'сначала узнайте, что это возможно', disabled: !this.know.has('riot') });
    return opts;
  },

  // Результат: { line: что говорит человек, kind: 'good'|'bad'|'neutral', note: пояснение }.
  doTalk(rec, id, arg) {
    const lv = this.friendLevelOf(rec);
    const T = TRAITS[rec.trait];
    const fn = {
      chat: () => {
        if (this._cooling(rec, 'chat')) return { line: 'Мы же только что разговаривали. Дай человеку отдохнуть.', kind: 'neutral' };
        this._setCool(rec, 'chat', 40);
        this.addFriend(rec, lv === 0 ? 3 : lv < 3 ? 2 : 1);
        rec.mood = clampN(rec.mood + 0.05, 0, 1);
        const line = lv === 0 && !rec.met ? this._greeting(rec) : pick(SMALL_TALK);
        rec.met = true;
        return { line, kind: 'good', note: 'Дружба +' };
      },
      story: () => {
        if (rec.askedStory) return { line: 'Я уже рассказывал. Не заставляй повторять.', kind: 'neutral' };
        rec.askedStory = true;
        this.addFriend(rec, 2);
        return { line: rec.story, kind: 'good', note: 'Дружба +2' };
      },
      joke: () => {
        if (this._cooling(rec, 'joke')) return { line: 'Дай хоть отсмеяться от прошлой.', kind: 'neutral' };
        this._setCool(rec, 'joke', 30);
        const score = (T.likes.joke ?? 0) + (lv >= 2 ? 0.5 : 0) + (rec.mood - 0.5) * 2 + (Math.random() * 2 - 1);
        const joke = pick(JOKES);
        this.game.hud.say(this.game.player, joke, 4);
        if (score > 1.2) { this.addFriend(rec, 4); rec.mood = clampN(rec.mood + 0.12, 0, 1); return { line: pick(JOKE_REACT.good), kind: 'good', note: `Вы: «${joke}» — Дружба +4` }; }
        if (score > 0.1) { this.addFriend(rec, 1); return { line: pick(JOKE_REACT.meh), kind: 'neutral', note: `Вы: «${joke}» — Дружба +1` }; }
        rec.mood = clampN(rec.mood - 0.1, 0, 1);
        this.addFriend(rec, -1.5, 'неудачная шутка');
        return { line: pick(JOKE_REACT.bad), kind: 'bad', note: `Вы: «${joke}» — не зашло` };
      },
      prank: () => this._prank(rec, arg),
      gift: () => this._gift(rec, arg),
      rumor: () => this._rumor(rec),
      trade: () => ({ line: lv >= 1 ? 'Смотри, что у меня есть. Только тихо.' : 'Приходи, когда мы познакомимся получше.', kind: 'neutral', open: lv >= 1 ? 'black' : null }),
      cards: () => ({ line: 'Давай. Только играем честно — иначе я обижусь.', kind: 'neutral', open: 'cards' }),
      spar: () => ({ line: rec.fighter ? 'Хочешь размяться? Давай. До тридцати процентов — без обид.' : 'Ну, давай, раз так хочешь.', kind: 'neutral', open: 'spar' }),
      cover: () => {
        if (this._cooling(rec, 'cover')) return { line: 'Я уже отвлекал их недавно. Пусть остынут.', kind: 'neutral' };
        this._setCool(rec, 'cover', 120);
        this.distract = 45;
        this.game.hud.toast('Друг отвлекает охрану: 45 секунд вас замечают хуже', 3);
        return { line: pick(['Иди. Я их заболтаю.', 'Давай быстро, пока они смотрят на меня.']), kind: 'good' };
      },
      follow: () => {
        if (rec.following) { this.setFollow(rec, false); return { line: 'Ладно. Если что — зови.', kind: 'neutral' }; }
        if (this.allies.length >= 2) return { line: 'Нас и так двое. Больше охрана заметит.', kind: 'neutral' };
        this.setFollow(rec, true);
        return { line: 'Я с тобой, брат. Куда идём?', kind: 'good' };
      },
      riot: () => {
        if (this.alert >= 2) return { line: 'Не сейчас. Слишком много охраны.', kind: 'neutral' };
        this.startRiot();
        return { line: 'Слышали все? Сегодня — наш день!', kind: 'good', close: true };
      },
    }[id];
    return fn ? fn() : { line: '...', kind: 'neutral' };
  },

  // ------------------------------------------------------------ розыгрыши
  _prank(rec, id) {
    const pr = PRANKS.find((p) => p.id === id);
    if (!pr) return { line: '...', kind: 'neutral' };
    if (this._cooling(rec, 'prank')) return { line: 'Эй, хватит на сегодня. Дай отдохнуть.', kind: 'bad' };
    this._setCool(rec, 'prank', 25);
    const lv = this.friendLevelOf(rec);
    const T = TRAITS[rec.trait];
    const npc = rec.npc;
    const p = this.game.player;
    const dx = npc.position.x - p.position.x, dz = npc.position.z - p.position.z;
    const l = Math.hypot(dx, dz) || 1;
    const score = (T.likes.prank ?? 0) + (lv >= 2 ? 1 : 0) + (lv >= 3 ? 0.5 : 0) + (rec.mood - 0.5) + (Math.random() * 1.6 - 0.8);
    // Реакция тела.
    if (pr.effect === 'knock') npc.knockDown(dx / l * 2.8, dz / l * 2.8, 1.0, p, 'prank', true);
    else if (pr.effect === 'stumble') npc.stumble(dx / l, dz / l, 2.3, p);
    if (pr.effect === 'steal') {
      if (Math.random() < 0.7 - lv * 0.05) {
        const gift = Math.random() < 0.5 ? rec.favorite : 'snack';
        this.give(gift);
        this.addFriend(rec, score >= 0.2 ? 1 : -3, 'кража');
        return { line: pick(pr.ok), kind: score >= 0.2 ? 'good' : 'bad', note: `Вы стащили: ${ITEMS[gift].name}` };
      }
      this.addFriend(rec, -5, 'попался на краже');
      return this._angry(rec, pr, lv, 'Тебя поймали за руку');
    }
    if (score >= 0.6) {
      this.addFriend(rec, 3);
      rec.mood = clampN(rec.mood + 0.1, 0, 1);
      return { line: pick(pr.ok), kind: 'good', note: 'Розыгрыш удался! Дружба +3' };
    }
    if (score >= -0.6) {
      this.addFriend(rec, -1);
      return { line: pick(pr.ok.concat(pr.bad)), kind: 'neutral', note: 'Не оценили' };
    }
    this.addFriend(rec, -4, 'розыгрыш');
    return this._angry(rec, pr, lv, 'Шутка зашла не туда');
  },

  _angry(rec, pr, lv, note) {
    rec.mood = clampN(rec.mood - 0.2, 0, 1);
    const fight = lv < pr.fightLevel && Math.random() < 0.6 && rec.npc && !rec.npc.isDead;
    if (fight) {
      rec.npc.aggro(this.game.player, pick(pr.bad));
      return { line: pick(pr.bad), kind: 'bad', note: `${note} — он лезет в драку!`, close: true };
    }
    return { line: pick(pr.bad), kind: 'bad', note };
  },

  // ------------------------------------------------------------ подарки
  giftItems() {
    return Object.keys(this.inv).filter((k) => ITEMS[k]?.gift && this.inv[k] > 0);
  },

  _gift(rec, itemId) {
    const it = ITEMS[itemId];
    if (!it || !it.gift || !this.take(itemId)) return { line: 'Эм... у тебя же ничего нет.', kind: 'neutral' };
    const T = TRAITS[rec.trait];
    const mult = (itemId === rec.favorite ? 2 : 1) * (1 + 0.25 * (T.likes.gift ?? 0));
    const pts = Math.round(it.gift * mult * 10) / 10;
    this.addFriend(rec, pts);
    rec.mood = clampN(rec.mood + 0.1, 0, 1);
    const line = itemId === rec.favorite ? pick(['Откуда ты знал?! Это мой любимый!', 'Вот это да! Спасибо, брат!']) : pick(['Спасибо! Выручил.', 'О, вот это дело.', 'Приятно, что кто-то вспомнил.']);
    return { line, kind: 'good', note: `${it.name}: дружба +${pts}` };
  },

  // ------------------------------------------------------------ слухи
  _rumor(rec) {
    const lv = this.friendLevelOf(rec);
    const next = RUMORS.find((r) => r.need <= lv && !this.rumorsSeen.has(r.id));
    if (!next) {
      const locked = RUMORS.some((r) => !this.rumorsSeen.has(r.id));
      return { line: locked ? 'Больше пока ничего не скажу. Мы ещё мало знакомы.' : 'Всё, что знал, я тебе уже рассказал.', kind: 'neutral' };
    }
    this.rumorsSeen.add(next.id);
    if (next.grants) this.know.add(next.grants);
    this.addFriend(rec, 1);
    if (rec.trait === 'snitch' && ESCAPE_RUMORS.has(next.id) && Math.random() < 0.45) {
      this.sus = Math.min(1.2, this.sus + 0.4);
      this.total += 3;
      this.game.hud.toast('Стукач заговорил с охраной! Срок +3 ч, охрана насторожилась', 3.5);
    }
    return { line: next.text, kind: 'good', note: `Новое: «${next.title}»` };
  },

  // ------------------------------------------------------------ друзья-спутники
  setFollow(rec, on) {
    const npc = rec.npc;
    if (!npc) return;
    const p = this.game.player;
    if (on) {
      rec.following = true;
      this.allies.push(rec);
      npc.leader = p;
      npc.follower = true;
      npc.slot = this.allies.length - 1;
      npc._enter(NPC_STATE.FOLLOW);
      npc.activity = null;
    } else {
      rec.following = false;
      this.allies = this.allies.filter((a) => a !== rec);
      npc.leader = null;
      npc.follower = false;
      npc.dropTarget();
      npc._enter(NPC_STATE.IDLE);
      npc.idleTime = 1e9;
      rec.arrived = false;
      rec.reassign = this.crew.t;
      rec.assigned = false;
    }
  },

  // ------------------------------------------------------------ карты, спарринг
  playCards(rec, bet) {
    const w = this.game.wallet;
    if (bet > w.money) return { error: 'Не хватает денег' };
    const draw = () => 2 + Math.floor(Math.random() * 13);
    let me = draw(), them = draw();
    const lv = this.friendLevelOf(rec);
    // Знакомые «поддаются» чуть чаще.
    if (me < them && lv >= 3 && Math.random() < 0.25) { const t = me; me = them; them = t; }
    const res = me > them ? 'win' : me < them ? 'lose' : 'draw';
    if (res === 'win') { w.add(bet); this.addFriend(rec, 1); this.stats.respect += 0.3; }
    else if (res === 'lose') { w.spend(bet); this.addFriend(rec, 1); }
    rec.mood = clampN(rec.mood + (res === 'lose' ? 0.05 : -0.03), 0, 1);
    return { me, them, res, bet };
  },

  startSpar(rec, bet) {
    const w = this.game.wallet;
    if (bet > w.money) return { error: 'Не хватает денег' };
    if (!rec.npc || rec.npc.isDead) return { error: 'Его нет рядом' };
    this.spar = { rec, bet, t: 0, baseDmg: rec.npc.melee.damage };
    rec.npc.melee.damage = rec.npc.melee.damage * 0.4;      // спарринг, а не бой на смерть
    if (bet > 0) w.spend(bet);
    const p = this.game.player;
    p.health = Math.max(p.health, p.maxHealth * 0.7);
    rec.npc.aggro(p, 'Ну давай, покажи, что умеешь!');
    this.ui.close();
    this.game.hud.toast('Спарринг! Дерётесь до 30% здоровья', 3);
    return {};
  },

  sparTick(dt) {
    const s = this.spar;
    const { game } = this;
    const p = game.player;
    const n = s.rec.npc;
    s.t += dt;
    const end = (res) => {
      this.spar = null;
      if (n && !n.isDead) { n.melee.damage = s.baseDmg; n.dropTarget(); n.health = Math.max(n.health, n.maxHealth * 0.6); n._enter(NPC_STATE.IDLE); n.idleTime = 1e9; }
      s.rec.arrived = false;
      s.rec.reassign = this.crew.t;
      p.health = Math.max(p.health, p.maxHealth * 0.45);
      if (res === 'win') {
        game.wallet.add(s.bet * 2);
        this.addFriend(s.rec, 6);
        this.stats.respect += 3;
        this.stats.wins++;
        game.hud.toast(`Вы победили! ${s.bet ? `+$${s.bet * 2}` : ''}`, 3);
        n?.say('Хорошо дерёшься! Уважаю.', true);
      } else if (res === 'lose') {
        this.addFriend(s.rec, 3);
        game.hud.toast('Вы проиграли спарринг', 3);
        n?.say('Неплохо, но я сильнее.', true);
      } else {
        game.wallet.add(s.bet);
        game.hud.toast('Ничья. Ставка возвращена', 2.5);
      }
    };
    if (!n || n.isDead || n.removed) { end('draw'); return; }
    if (n.health < n.maxHealth * 0.3) { end('win'); return; }
    if (p.health < p.maxHealth * 0.3) { end('lose'); return; }
    if (s.t > 70) { end('draw'); return; }
    // Хорошо ли это место для драки: во дворе охрана смотрит сквозь пальцы.
    const zone = this._zone();
    const ok = zone?.id === 'yard' || zone?.id === 'cbw' || zone?.id === 'laundry';
    if (!ok && this.bribe <= 0) this.sus = Math.min(1.3, this.sus + dt * 0.35);
  },

  playCardsHere() {
    const p = this.game.player.position;
    const rec = this.crew.nearestInmate(p, 7, (r) => r.npc.state !== NPC_STATE.FIGHT);
    if (!rec) { this.game.hud.toast('За столом никого — играть не с кем', 2); return; }
    this.ui.openTalk(rec, 'cards');
  },

  // ------------------------------------------------------------ бунт
  startRiot() {
    const { game } = this;
    this.alert = 3;
    this.alertTimer = 170;
    this.riotTimer = 170;
    this.crew.riot = true;
    this.crew.lockdown = false;
    for (const c of this.layout.cells) { this._setDoor(c, true); }
    game.hud.news('БУНТ В «РЕДРОКЕ»! Камеры открыты, охрана в панике', '#ff5a5a');
    game.hud.toast('БУНТ! Бегите к кабинету начальника за ключами от ворот', 5);
    game.audio.alarm?.(game.player.position);
    this.ui.setAlarm(true);
    this._riotAssign();
  },

  _riotAssign() {
    const { game } = this;
    for (const rec of this.crew.inmates) {
      const n = rec.npc;
      if (!n || n.isDead || rec.following || n.state === NPC_STATE.FIGHT) continue;
      if (rec.trait === 'quiet' || rec.trait === 'smart' || rec.trait === 'paranoid') continue;
      const g = this.crew.nearestGuard(n.position, 30, (x) => !x.noGuard && x.id !== 'clerk' && x.id !== 'medic');
      if (g) n.aggro(g.npc, 'Бей охрану!');
    }
    for (const g of this.crew.guards) {
      const n = g.npc;
      if (!n || n.isDead || g.noGuard || n.state === NPC_STATE.FIGHT) continue;
      const rec = this.crew.nearestInmate(n.position, 20, (r) => r.npc.state === NPC_STATE.FIGHT && !r.following);
      if (rec) n.aggro(rec.npc, 'Назад!');
      else n.aggro(game.player);
    }
  },

  _tickRiot(dt) {
    this.riotTimer -= dt;
    this._riotT = (this._riotT ?? 0) - dt;
    if (this._riotT <= 0) { this._riotT = 2.5; this._riotAssign(); }
    if (this.riotTimer <= 0) this.endRiot();
  },

  endRiot() {
    this.crew.riot = false;
    this.riotTimer = 0;
    this.alert = 0;
    this.crew.calmAll();
    for (const rec of this.crew.inmates) {
      if (rec.npc && !rec.npc.isDead) rec.npc.health = Math.max(rec.npc.health, rec.npc.maxHealth * 0.6);
    }
    this.crew.setLockdown(false);
    this._syncDoors();
    this.ui.setAlarm(false);
    this.game.hud.news('Бунт в «Редроке» подавлен', '#9ad0ff');
    this.total += 24;
    this.game.hud.toast('Бунт подавлен. Срок +24 ч', 3);
  },

  // ------------------------------------------------------------ охрана
  guardMenu(g) {
    const opts = [{ id: 'time', label: 'Спросить, сколько мне ещё сидеть', sub: '' }];
    if (g.talk === 'intake') opts.push({ id: 'rules', label: 'Спросить про правила', sub: '' });
    if (g.corrupt) opts.push({ id: 'bribe', label: 'Предложить взятку ($500)', sub: this.know.has('bribe') ? 'вы знаете, что он берёт' : 'вдруг получится', disabled: this.alert >= 2 });
    if (g.talk === 'warden') opts.push({ id: 'parole', label: 'Попросить досрочное освобождение', sub: 'раз в сутки; шанс растёт с уважением заключённых' });
    if (g.talk === 'medic') opts.push({ id: 'heal', label: 'Попросить помощь', sub: 'бесплатно' });
    else opts.push({ id: 'sick', label: 'Пожаловаться на здоровье', sub: 'охранник отведёт в лазарет' });
    opts.push({ id: 'joke', label: 'Пошутить', sub: 'риск: некоторые не любят' });
    return opts;
  },

  doGuard(g, id) {
    const { game } = this;
    const p = game.player;
    const say = (t) => g.npc?.say(t, true);
    switch (id) {
      case 'time': {
        const ph = this.phase;
        const txt = `Сейчас ${this._clock()} — ${ph.label.toLowerCase()}. До конца срока: ${this._fmt(this.left)}.`;
        say(txt);
        return { line: txt, kind: 'neutral' };
      }
      case 'rules': {
        const txt = 'Подъём в шесть, отбой в половине десятого. Не лезь в запретные зоны, не буянь, не носи лишнего. Нарушишь — карцер.';
        say(txt);
        return { line: txt, kind: 'neutral' };
      }
      case 'bribe': {
        if (this.alert >= 2) return { line: 'Не сейчас, дурак! Тревога!', kind: 'bad' };
        if (!game.wallet.spend(500)) return { line: 'Пять сотен — и ни центом меньше. Нет денег — иди отсюда.', kind: 'bad' };
        this.bribe = 80;
        this.stats.bribed++;
        this.flags.walkout = true;
        this.openGates(70);
        game.hud.toast('Мак «забыл» про ворота: 70 секунд. Бегите!', 5);
        const txt = 'Я ничего не видел. У тебя минута с небольшим. Не тормози.';
        say(txt);
        return { line: txt, kind: 'good', close: true };
      }
      case 'parole': {
        if (this.flags.paroleDay === this.crew.day) return { line: 'Я уже ответил на твою просьбу сегодня. Приходи завтра.', kind: 'bad' };
        this.flags.paroleDay = this.crew.day;
        const chance = 0.1 + Math.min(0.5, this.stats.respect * 0.025) + (this.stats.days >= 2 ? 0.1 : 0);
        if (Math.random() < chance) {
          const cut = 8;
          this.total = Math.max(this.served + 1, this.total - cut);
          game.hud.toast(`Начальник смягчился: срок −${cut} ч`, 3);
          return { line: 'Ладно. Хорошее поведение стоит награды. Восемь часов — с вас.', kind: 'good' };
        }
        return { line: 'Нет. Ваше поведение недостаточно образцовое.', kind: 'bad' };
      }
      case 'heal':
      case 'sick': {
        if (p.health >= p.maxHealth * 0.85) return { line: 'Ты в порядке. Не отнимай время.', kind: 'neutral' };
        if (this.hour < 7 || this.hour >= 20) return { line: 'Лазарет закрыт. Терпи до утра.', kind: 'bad' };
        p.health = Math.min(p.maxHealth, p.health + 40);
        game.hud.toast('Вас осмотрели и перевязали (+40 здоровья)', 2.5);
        return { line: 'Ладно, садись. Сейчас перевяжу.', kind: 'good' };
      }
      case 'joke': {
        const r = Math.random();
        const joke = pick(JOKES);
        game.hud.say(p, joke, 4);
        if (r < 0.35) return { line: 'Ха! Хорошая. Только не при начальстве.', kind: 'good' };
        if (r < 0.8) return { line: pick(GUARD_IDLE), kind: 'neutral' };
        this.sus = Math.min(1.2, this.sus + 0.3);
        return { line: 'Умник нашёлся? Смотри у меня.', kind: 'bad' };
      }
      default: return { line: '...', kind: 'neutral' };
    }
  },

  _clock() { const h = this.hour; return `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; },
  _fmt(h) { h = Math.max(0, Math.ceil(h)); const d = Math.floor(h / 24); return d ? `${d} д ${h % 24} ч` : `${h} ч`; },

  // ------------------------------------------------------------ работа
  jobAvailable() {
    const id = this.phase.id;
    return id === 'work' || id === 'yard' || id === 'rec';
  },

  startJob(id) {
    const J = JOBS[id];
    if (!this.jobAvailable()) { this.game.hud.toast('Смена закончилась. Работа — с 7:30 до 21:00', 2.5); return; }
    this.ui.close();
    this.startAction({ id: 'job', label: `Работа: ${J.label}`, dur: 11, done: () => {
      this.game.wallet.add(J.pay);
      this.stats.jobs++;
      this.stats.respect += 0.5;
      this.game.hud.toast(`Смена окончена: +$${J.pay}`, 2.5);
    } });
  },

  stealSheet() {
    if ((this.inv.sheet ?? 0) >= 3) { this.game.hud.toast('Хватит — больше трёх простыней не унести', 2); return; }
    this.ui.close();
    this.startAction({ id: 'sheet', label: 'Прячете простыню', dur: 3, illegal: true, rate: 0.5, done: () => {
      this.give('sheet');
      this.game.hud.toast('Простыня ваша. Три штуки — верёвка (меню вещей)', 3);
    } });
  },

  stealSpoon() {
    if (this.has('spoon')) { this.game.hud.toast('Ложка у вас уже есть', 2); return; }
    this.ui.close();
    this.startAction({ id: 'spoon', label: 'Прячете ложку', dur: 3, illegal: true, rate: 0.5, done: () => {
      this.give('spoon');
      this.game.hud.toast('Ложка спрятана в рукаве', 2.5);
    } });
  },

  readBook() {
    this.ui.close();
    this.startAction({ id: 'book', label: 'Читаете', dur: 6, done: () => {
      const next = RUMORS.find((r) => r.need <= 2 && r.grants && !this.rumorsSeen.has(r.id));
      if (next) {
        this.rumorsSeen.add(next.id);
        this.know.add(next.grants);
        this.game.hud.toast(`Вычитали: «${next.title}»`, 3.5);
      } else this.game.hud.toast('Хорошая книга. Время пролетело', 2.5);
      this.stats.respect += 0.2;
    } });
  },

  eatTray() {
    this.ui.close();
    this.startAction({ id: 'tray', label: 'Обед', dur: 5, done: () => {
      const p = this.game.player;
      p.health = Math.min(p.maxHealth, p.health + 25);
      this.game.hud.toast('Сытно, хоть и невкусно (+25 здоровья)', 2.5);
    } });
  },

  // ------------------------------------------------------------ покупки
  buy(id, mult = 1) {
    const it = ITEMS[id];
    const price = Math.round(it.price * mult);
    if (!this.game.wallet.spend(price)) { this.game.hud.toast('Не хватает денег', 1.6); return false; }
    this.give(id);
    this.game.audio.pickup?.();
    this.game.hud.toast(`Куплено: ${it.name} (−$${price})`, 1.8);
    return true;
  },

  stashMove(id, toStash) {
    const from = toStash ? this.inv : this.stash, to = toStash ? this.stash : this.inv;
    if (!(from[id] > 0)) return;
    from[id]--;
    if (from[id] <= 0) delete from[id];
    to[id] = (to[id] ?? 0) + 1;
  },

  // ------------------------------------------------------------ телефон и визиты
  callLawyer(visit = false) {
    const price = visit ? Math.round(LAWYER.price * 0.8) : LAWYER.price;
    if (this.lawyerVisits >= LAWYER.maxVisits) return { ok: false, text: 'Адвокат: «Я сделал всё, что мог. Больше ничего не выйдет».' };
    if (!this.game.wallet.spend(price)) return { ok: false, text: 'Не хватает денег на адвоката.' };
    this.lawyerVisits++;
    const chance = visit ? 0.88 : LAWYER.chance;
    if (Math.random() < chance) {
      this.total = Math.max(this.served + 0.5, this.total - LAWYER.cut);
      this.game.hud.toast(`Адвокат выиграл ходатайство: срок −${LAWYER.cut} ч`, 3);
      this.game.save?.markDirty();
      return { ok: true, text: `Адвокат: «Удалось! Срок сокращён на ${LAWYER.cut} часов».` };
    }
    return { ok: true, text: 'Адвокат: «Суд отклонил ходатайство. Деньги, увы, не возвращаются».' };
  },

  callFriend() {
    if (this.lastCallDay === this.crew.day) return { ok: false, text: 'Сегодня вы уже звонили другу. Он ещё не успел собрать деньги.' };
    this.lastCallDay = this.crew.day;
    const amount = 60 + Math.floor(Math.random() * 90);
    this.game.wallet.add(amount);
    return { ok: true, text: `Друг на воле перевёл вам $${amount}. «Держись, брат!»` };
  },

  orderGetaway() {
    if (this.flags.getaway) return { ok: false, text: 'Машина уже заказана. Ждёт сигнала.' };
    if (!this.game.wallet.spend(700)) return { ok: false, text: 'Нужно $700 вперёд.' };
    this.flags.getaway = true;
    return { ok: true, text: 'Водитель: «Понял. Как выберешься за стену — найдёшь меня на дороге. Только быстро».' };
  },

  phoneActions() {
    return [
      { id: 'lawyer', label: 'Позвонить адвокату', sub: `−$${LAWYER.price}: срок −${LAWYER.cut} ч, шанс ${Math.round(LAWYER.chance * 100)}%` },
      { id: 'friend', label: 'Позвонить другу на волю', sub: 'бесплатно: пришлёт немного денег (раз в сутки)' },
      { id: 'getaway', label: 'Заказать машину для побега', sub: '−$700 вперёд: ждёт у стены, когда выберетесь' },
    ];
  },

  phoneDo(id) {
    return { lawyer: () => this.callLawyer(false), friend: () => this.callFriend(), getaway: () => this.orderGetaway() }[id]?.() ?? { ok: false, text: '...' };
  },

  scheduleNext() {
    const idx = SCHEDULE.findIndex((p) => p.id === this.phase.id);
    return SCHEDULE[(idx + 1) % SCHEDULE.length];
  },
};

export function installSocial(PrisonSystem) {
  Object.assign(PrisonSystem.prototype, M);
}
