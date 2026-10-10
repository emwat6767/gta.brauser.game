import { fighterTag } from './fighters.js';
import { formatMoney } from './ui/hud.js';
import {
  ITEMS, SHOP_COMMISSARY, SHOP_BLACK, TRAITS, FRIEND_LEVELS, PRANKS, RUMORS, JOBS, SCHEDULE, LAWYER, PHONE_ACTIONS,
} from './prison-data.js';

// Окна тюремной жизни (поверх игры, пока открыто — симуляция стоит): приём, разговор, лавка, телефон, визиты,
// тумбочка, вещи и статус, сон, работа, карты, баскетбол, спарринг. Плюс затемнение между сценами,
// полоса «внимание охраны» и красная вспышка тревоги.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtH = (h) => { h = Math.max(0, Math.ceil(h)); const d = Math.floor(h / 24); return d ? `${d} д ${h % 24} ч` : `${h} ч`; };

export class PrisonUI {
  constructor(prison) {
    this.prison = prison;
    this.game = prison.game;
    this.root = $('prison-ui');
    this.body = $('pu-body');
    this.title = $('pu-title');
    this.fade = $('prison-fade');
    this.fadeText = $('pf-text');
    this.susEl = $('prison-sus');
    this.susFill = this.susEl?.querySelector('i');
    this.alarmEl = $('prison-alarm');
    this.screen = null;
    this.acts = [];
    this._timer = null;
    this.darkCount = 0;
    $('pu-close').addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root && !this.screen?.locked) { this.close(); return; }
      const el = e.target.closest('[data-i]');
      if (!el || el.disabled) return;
      this.acts[+el.dataset.i]?.();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.screen) return;
      if (e.code === 'Space' && this.screen.type === 'hoops') { e.preventDefault(); this._hoopsShoot(); }
    });
  }

  get isOpen() { return !!this.screen; }

  // ------------------------------------------------------------ управление окном
  open(screen, title) {
    const { game } = this;
    this.screen = screen;
    this.root.classList.remove('hidden');
    if (title) this.title.textContent = title;
    game.menuOpen = true;
    game.touch?.resetAll();
    document.exitPointerLock?.();
    this.render();
  }

  close() {
    if (!this.screen) return;
    const s = this.screen;
    this.screen = null;
    clearInterval(this._timer);
    this._timer = null;
    if (s.rec) s.rec.hold = 0;
    if (s.g) s.g.hold = 0;
    this.root.classList.add('hidden');
    if (!this.darkCount) this.game.menuOpen = false;
    if (!this.game.paused && !this.game.input.touchActive && !this.darkCount) this.game.input.requestPointerLock();
    s.onClose?.();
  }

  // Затемнение экрана (с текстом) и обратно. Пока экран тёмный, симуляция стоит.
  async dark(text = '') {
    this.darkCount++;
    this.game.menuOpen = true;
    document.exitPointerLock?.();
    this.fadeText.textContent = text;
    this.fade.classList.remove('hidden');
    void this.fade.offsetWidth;
    this.fade.classList.add('on');
    await wait(750);
  }

  async light() {
    this.fade.classList.remove('on');
    await wait(700);
    this.fade.classList.add('hidden');
    this.darkCount = Math.max(0, this.darkCount - 1);
    if (!this.darkCount && !this.screen) {
      this.game.menuOpen = false;
      if (!this.game.paused && !this.game.input.touchActive) this.game.input.requestPointerLock();
    }
  }

  wait(ms) { return wait(ms); }

  setSus(v) {
    if (!this.susEl) return;
    const show = v > 0.03;
    this.susEl.classList.toggle('hidden', !show);
    if (show) {
      this.susFill.style.width = `${Math.min(100, Math.round(v * 100))}%`;
      this.susFill.style.background = v > 0.7 ? '#ff4d4d' : v > 0.4 ? '#ffb347' : '#ffe066';
    }
  }

  setAlarm(on) { this.alarmEl?.classList.toggle('hidden', !on); }
  tick() {}

  // ------------------------------------------------------------ кирпичики разметки
  btn(label, fn, { sub = '', cls = '', disabled = false } = {}) {
    const i = this.acts.push(fn) - 1;
    return `<button type="button" class="pu-btn ${cls}" data-i="${i}"${disabled ? ' disabled' : ''}><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  }

  money() { return `<div class="pu-money">${formatMoney(this.game.wallet.money)}</div>`; }

  render() {
    this.acts = [];
    const s = this.screen;
    if (!s) return;
    const fn = {
      intake: () => this._intake(s), talk: () => this._talk(s), shop: () => this._shop(s), phone: () => this._phone(s), visit: () => this._visit(s),
      guard: () => this._guard(s), stash: () => this._stash(s), status: () => this._status(s), sleep: () => this._sleep(s), menu: () => this._menu(s),
      cards: () => this._cards(s), hoops: () => this._hoops(s), spar: () => this._spar(s),
    }[s.type];
    this.body.innerHTML = fn ? fn() : '';
    this.body.scrollTop = s.keepScroll ? this.body.scrollTop : 0;
  }

  // ------------------------------------------------------------ приём
  openIntake(info) {
    this.open({ type: 'intake', info, locked: true }, 'ПРИЁМ В ТЮРЬМУ «РЕДРОК»');
  }

  _intake({ info }) {
    const P = this.prison;
    const extra = info.wasFugitive ? '<p class="pu-warn">Побег пойман: срок удвоен, штраф удвоен, перед отсидкой — карцер.</p>' : '';
    return `<section><h3>Приговор</h3>
      <p>Срок: <b>${fmtH(info.hours)}</b> · Штраф: <b>${formatMoney(info.fine)}</b> · Камера: <b>${esc(info.cell)}</b></p>${extra}
      <p class="pu-sub">Оружие и силы отобраны, выдана оранжевая роба. Деньги остались при вас — в лавке ими можно платить.</p></section>
      <section><h3>Как тут жить</h3><ul class="pu-list">
        <li><b>E / ДЕЙСТВИЕ</b> — поговорить с заключённым (подружиться, пошутить, подарить, разыграть), использовать места во дворе, лавку, телефон.</li>
        <li><b>I / ВЕЩИ</b> — вещи, друзья, что известно, перемотка времени. Подъём в 6:00, отбой в 21:30 — камеры запираются.</li>
        <li>Срок идёт по игровому времени. Можно спать (перемотка), работать за деньги, качаться, играть в карты и баскетбол.</li>
        <li>Хотите на волю раньше: адвокат и залог (свидания, телефон) — или <b>побег</b>: подкоп, сетка и стена, форма охранника, взятка, бунт. Узнавайте детали у друзей.</li>
      </ul></section>
      <section>${this.btn('Войти в блок', () => this.close(), { cls: 'main' })}</section>`;
    void P;
  }

  // ------------------------------------------------------------ разговор с заключённым
  openTalk(rec, jump = null) {
    const P = this.prison;
    P.crew.hold(rec, 9999);
    const npc = rec.npc;
    if (npc) {
      const pp = this.game.player.position;
      npc.heading = Math.atan2(pp.x - npc.position.x, pp.z - npc.position.z);
    }
    const greet = P._greeting(rec);
    const s = { type: 'talk', rec, mode: 'root', log: [{ who: 'npc', text: rec.met ? `— ${greetShort(rec)}` : greet }], jump };
    rec.met = true;
    this.open(s, 'РАЗГОВОР');
    if (jump === 'cards') this._enterCards(rec);
  }

  _talk(s) {
    const P = this.prison;
    const rec = s.rec;
    const lv = P.friendLevelOf(rec);
    const tag = rec.fighter ? fighterTag(rec.fighter) : { title: rec.name, sub: 'Заключённый' };
    const T = TRAITS[rec.trait];
    const next = FRIEND_LEVELS[lv + 1];
    const pct = next ? Math.round(((rec.friend - FRIEND_LEVELS[lv].at) / (next.at - FRIEND_LEVELS[lv].at)) * 100) : 100;
    const face = `<div class="pu-face" style="background:${rec.look.skin}">${esc((rec.name.replace(/[«»"]/g, '').split(' ').map((w) => w[0]).slice(0, 2).join('')) || '?')}</div>`;
    const head = `<div class="pu-person">${face}<div class="pu-pinfo"><b>${esc(tag.title)}</b><small>${esc(tag.sub)}${T.hidden ? '' : ` · ${T.label}`}</small>
      <div class="gm-bar"><div style="width:${pct}%"></div></div>
      <small>${P.friendName(lv)} · ${Math.round(rec.friend)}${next ? ` / ${next.at}` : ''}${rec.following ? ' · идёт с вами' : ''}</small></div>${this.money()}</div>`;
    const log = `<div class="pu-log">${s.log.slice(-6).map((l) => `<p class="${l.who}${l.kind ? ' ' + l.kind : ''}">${l.who === 'npc' ? '<i>' + esc(rec.nick || rec.name.split(' ')[0]) + ':</i> ' : ''}${esc(l.text)}</p>`).join('')}</div>`;
    let opts = '';
    if (s.mode === 'root') {
      opts = P.talkMenu(rec).map((o) => this.btn(o.label, () => this._talkDo(s, o.id), { sub: o.sub, disabled: o.disabled })).join('');
    } else if (s.mode === 'prank') {
      opts = PRANKS.map((p) => this.btn(p.label, () => this._talkDo(s, 'prank', p.id))).join('') + this.btn('Назад', () => { s.mode = 'root'; this.render(); }, { cls: 'ghost' });
    } else if (s.mode === 'gift') {
      const items = P.giftItems();
      opts = (items.length
        ? items.map((id) => this.btn(`${ITEMS[id].icon} ${ITEMS[id].name} ×${P.inv[id]}`, () => this._talkDo(s, 'gift', id), { sub: id === rec.favorite ? 'его любимое!' : '' })).join('')
        : '<p class="pu-sub">У вас нечем угостить. Загляните в лавку.</p>') + this.btn('Назад', () => { s.mode = 'root'; this.render(); }, { cls: 'ghost' });
    }
    return `<section>${head}${log}</section><section class="pu-opts">${opts}</section>`;
  }

  _talkDo(s, id, arg) {
    const P = this.prison;
    const rec = s.rec;
    if (id === 'prank' && !arg) { s.mode = 'prank'; this.render(); return; }
    if (id === 'gift' && !arg) { s.mode = 'gift'; this.render(); return; }
    const r = P.doTalk(rec, id, arg);
    if (r.line) s.log.push({ who: 'npc', text: r.line, kind: r.kind });
    if (r.note) s.log.push({ who: 'sys', text: r.note });
    s.mode = 'root';
    if (r.open === 'black') { this.openShop('black', { mult: [1.7, 1.45, 1.2, 1.05, 0.9][Math.min(4, P.friendLevelOf(rec))], from: s }); return; }
    if (r.open === 'cards') { this._enterCards(rec); return; }
    if (r.open === 'spar') { this.open({ type: 'spar', rec, back: s }, 'СПАРРИНГ'); return; }
    if (r.close) { this.close(); return; }
    this.render();
  }

  // ------------------------------------------------------------ лавка и барыга
  openShop(kind, { mult = 1, from = null } = {}) {
    const keep = this.screen;
    const back = from ?? (keep?.type === 'talk' ? keep : null);
    this.open({ type: 'shop', kind, mult, from: back, rec: back?.rec, keepScroll: true }, kind === 'commissary' ? 'ЛАВКА «COMMISSARY»' : 'ИЗ-ПОД ПОЛЫ');
  }

  _shop(s) {
    const P = this.prison;
    const list = s.kind === 'commissary' ? SHOP_COMMISSARY : SHOP_BLACK;
    const note = s.kind === 'commissary'
      ? '<p class="pu-sub">Цены лавки. Заключённым тут и валюта — сигареты. Контрабанду здесь не продают.</p>'
      : `<p class="pu-sub">Из-под полы: всё, что не положено. Цена зависит от дружбы (x${s.mult.toFixed(2)}). Охрана такое отбирает при обыске.</p>`;
    const items = list.map((id) => {
      const it = ITEMS[id];
      const price = Math.round(it.price * s.mult);
      return `<div class="pu-item"><div class="pu-ico">${it.icon}</div><div class="pu-iinfo"><b>${it.name}</b><small>${it.desc}</small></div>
        <div class="pu-price">${formatMoney(price)}${P.inv[id] ? `<small>есть: ${P.inv[id]}</small>` : ''}</div>
        ${this.btn('Купить', () => { P.buy(id, s.mult); this.render(); }, { disabled: !this.game.wallet.canAfford(price) })}</div>`;
    }).join('');
    const back = s.from ? this.btn('Назад к разговору', () => { this.screen = s.from; this.title.textContent = 'РАЗГОВОР'; this.render(); }, { cls: 'ghost' }) : '';
    return `<section>${this.money()}${note}${items}</section><section>${back}</section>`;
  }

  // ------------------------------------------------------------ телефон
  openPhone() {
    this.open({ type: 'phone', msg: '' }, 'ТЕЛЕФОН');
  }

  _phone(s) {
    const P = this.prison;
    const opts = P.phoneActions().map((o) => this.btn(o.label, () => { const r = P.phoneDo(o.id); s.msg = r.text; this.render(); }, { sub: o.sub })).join('');
    return `<section>${this.money()}<p class="pu-sub">Разговоры записываются, но если звонить недолго — охрана не слушает.</p>${s.msg ? `<p class="pu-msg">${esc(s.msg)}</p>` : ''}</section><section class="pu-opts">${opts}</section>`;
  }

  // ------------------------------------------------------------ свидания: адвокат и залог
  openVisit() {
    this.open({ type: 'visit', msg: '', confirmBail: false }, 'КОМНАТА СВИДАНИЙ');
  }

  _visit(s) {
    const P = this.prison;
    const bail = P.bailCost();
    const lawyerLeft = LAWYER.maxVisits - P.lawyerVisits;
    const lawyer = this.btn('Встреча с адвокатом', () => { const r = P.callLawyer(true); s.msg = r.text; this.render(); },
      { sub: `−${formatMoney(Math.round(LAWYER.price * 0.8))}: срок −${LAWYER.cut} ч, шанс 88%. Осталось встреч: ${lawyerLeft}`, disabled: lawyerLeft <= 0 || !this.game.wallet.canAfford(Math.round(LAWYER.price * 0.8)) });
    const bailBtn = s.confirmBail
      ? this.btn(`Да, внести залог ${formatMoney(bail)}`, () => { if (this.game.wallet.spend(bail)) { this.close(); P.release('bail'); } }, { cls: 'main', disabled: !this.game.wallet.canAfford(bail) })
        + this.btn('Отмена', () => { s.confirmBail = false; this.render(); }, { cls: 'ghost' })
      : this.btn('Внести залог и выйти сегодня', () => { s.confirmBail = true; this.render(); }, { sub: `${formatMoney(bail)} за оставшиеся ${fmtH(P.left)}` });
    return `<section>${this.money()}<p>До конца срока: <b>${fmtH(P.left)}</b></p>${s.msg ? `<p class="pu-msg">${esc(s.msg)}</p>` : ''}</section><section class="pu-opts">${lawyer}${bailBtn}</section>`;
  }

  // ------------------------------------------------------------ охрана
  openGuard(g) {
    const P = this.prison;
    g.hold = P.crew.t + 9999;
    const line = g.id === 'gateR' ? 'Чего тебе, заключённый?' : g.talk === 'warden' ? 'Слушаю. Только коротко.' : g.talk === 'medic' ? 'Что болит?' : 'Говори быстро, заключённый.';
    this.open({ type: 'guard', g, log: [{ who: 'npc', text: line }] }, 'ОХРАННИК');
    g.npc?.say(line);
  }

  _guard(s) {
    const P = this.prison;
    const g = s.g;
    const head = `<div class="pu-person"><div class="pu-face guard">👮</div><div class="pu-pinfo"><b>${esc(g.name)}</b><small>${esc(g.title)}</small></div>${this.money()}</div>`;
    const log = `<div class="pu-log">${s.log.slice(-5).map((l) => `<p class="${l.who}${l.kind ? ' ' + l.kind : ''}">${l.who === 'npc' ? `<i>${esc(g.name.split(' ').pop())}:</i> ` : ''}${esc(l.text)}</p>`).join('')}</div>`;
    const opts = P.guardMenu(g).map((o) => this.btn(o.label, () => {
      const r = P.doGuard(g, o.id);
      s.log.push({ who: 'npc', text: r.line, kind: r.kind });
      if (r.close) { this.close(); return; }
      this.render();
    }, { sub: o.sub, disabled: o.disabled })).join('');
    return `<section>${head}${log}</section><section class="pu-opts">${opts}</section>`;
  }

  // ------------------------------------------------------------ тумбочка
  openStash() { this.open({ type: 'stash', keepScroll: true }, 'ТУМБОЧКА'); }

  _stash() {
    const P = this.prison;
    const col = (bag, toStash) => Object.keys(bag).length
      ? Object.entries(bag).map(([id, n]) => `<div class="pu-item sm"><div class="pu-ico">${ITEMS[id].icon}</div><div class="pu-iinfo"><b>${ITEMS[id].name} ×${n}</b><small>${ITEMS[id].illegal ? 'контрабанда' : 'можно'}</small></div>${this.btn(toStash ? 'В тумбочку →' : '← Забрать', () => { P.stashMove(id, toStash); this.render(); })}</div>`).join('')
      : '<p class="pu-sub">пусто</p>';
    return `<section><h3>В карманах</h3>${col(P.inv, true)}</section><section><h3>В тумбочке</h3>${col(P.stash, false)}
      <p class="pu-sub">Обыск камер случается примерно через день: тумбочку проверяют. Контрабанду, найденную в тумбочке, конфискуют (срок +6 ч). В карманах её ищут только при общем обыске во дворе.</p></section>`;
  }

  // ------------------------------------------------------------ вещи и статус
  openStatus(tab = 'items') { this.open({ type: 'status', tab, keepScroll: true }, 'ТЮРЬМА · ВЕЩИ И СТАТУС'); }

  _status(s) {
    const P = this.prison;
    const tabs = [['items', 'Вещи'], ['friends', 'Друзья'], ['know', 'План и слухи'], ['status', 'Срок']];
    const bar = `<div class="pu-tabs">${tabs.map(([id, l]) => this.btn(l, () => { s.tab = id; this.render(); }, { cls: s.tab === id ? 'on' : 'ghost' })).join('')}</div>`;
    let body = '';
    if (s.tab === 'items') {
      const ids = Object.keys(P.inv);
      body = ids.length ? ids.map((id) => {
        const it = ITEMS[id];
        let act = '';
        if (it.heal) act = this.btn('Съесть', () => { P.eat(id); this.render(); });
        else if (id === 'sheet') act = this.btn('Связать верёвку (3 шт.)', () => { P.craftRope(); this.render(); }, { disabled: P.inv.sheet < 3 });
        else if (id === 'uniform') act = this.btn(P.wearing === 'uniform' ? 'Снять форму' : 'Надеть форму', () => { P.toggleUniform(); this.render(); });
        else if (id === 'phone') act = this.btn('Позвонить', () => this.openPhone());
        else if (id === 'radio') act = this.btn('Слушать', () => { this.game.hud.toast(P._tvLine(), 4); });
        return `<div class="pu-item sm"><div class="pu-ico">${it.icon}</div><div class="pu-iinfo"><b>${it.name} ×${P.inv[id]}</b><small>${it.desc}${it.illegal ? ' · контрабанда' : ''}</small></div>${act}</div>`;
      }).join('') : '<p class="pu-sub">Карманы пусты. Загляните в лавку (E у окошка во дворе блока).</p>';
      body += `<p class="pu-sub">Сигареты — валюта: их берёт любой. Подарки друзьям ускоряют дружбу.</p>`;
    } else if (s.tab === 'friends') {
      const list = P.crew.inmates.filter((r) => r.friend > 0).sort((a, b) => b.friend - a.friend);
      body = list.length ? list.map((r) => {
        const lv = P.friendLevelOf(r);
        return `<div class="pu-item sm"><div class="pu-face sm" style="background:${r.look.skin}"></div><div class="pu-iinfo"><b>${esc(r.name)}</b><small>${P.friendName(lv)} · ${Math.round(r.friend)} очк.${r.following ? ' · идёт с вами' : ''}</small></div></div>`;
      }).join('') : '<p class="pu-sub">Пока ни с кем не знакомы. Подойдите к заключённому и нажмите E.</p>';
    } else if (s.tab === 'know') {
      const chip = (ok, text) => `<li class="${ok ? 'got' : ''}">${ok ? '✔' : '○'} ${text}</li>`;
      body = `<h3>Пути на волю</h3><ul class="pu-list plan">
        <li><b>Подкоп:</b></li>${chip(P.know.has('tunnel'), 'узнать про подкоп (слухи)')}${chip(P.has('spoon') || P.dig > 0, 'ложка')}${chip(P.dig >= 1 || P.tunnel, `подкоп ${Math.round(P.dig * 100)}%`)}
        <li><b>Сетка и стена:</b></li>${chip(P.has('cutters') || P.layout.fenceSegs.some((x) => x.cut), 'кусачки')}${chip(P.layout.fenceSegs.some((x) => x.cut), 'прорезать сетку во дворе')}${chip(P.has('rope'), 'верёвка с крюком (или 3 простыни)')}
        <li><b>Форма охранника:</b></li>${chip(P.has('uniform'), 'форма из корзины в прачечной')}${chip(P.has('idcard'), 'пропуск (у Скиппи)')}
        <li><b>Взятка:</b></li>${chip(P.know.has('bribe'), 'узнать, кто берёт')}${chip(this.game.wallet.money >= 500, '$500 для сержанта Мака')}
        <li><b>Бунт:</b></li>${chip(P.know.has('boss'), 'подружиться с Домом (Кореш)')}${chip(P.know.has('riot'), 'узнать про бунт')}${chip(P.has('keys'), 'ключи из кабинета начальника')}
      </ul><h3>Что вы узнали</h3>`;
      const seen = RUMORS.filter((r) => P.rumorsSeen.has(r.id));
      body += seen.length ? seen.map((r) => `<div class="pu-rumor"><b>${r.title}</b><p>${esc(r.text)}</p></div>`).join('') : '<p class="pu-sub">Расспрашивайте друзей: «Что слышно?»</p>';
    } else {
      const done = Math.min(1, P.served / Math.max(1, P.total));
      body = `<div class="gm-bar"><div style="width:${Math.round(done * 100)}%"></div></div>
        <p>Отсижено ${fmtH(P.served)} из ${fmtH(P.total)}. Осталось: <b>${fmtH(P.left)}</b>. Камера: <b>${P.cell.id}</b>.</p>
        <p class="pu-sub">Сейчас: ${P.phase.label}. Уважение: ${P.stats.respect.toFixed(0)} · Сила: ${P.stats.strength}/6 · Смен: ${P.stats.jobs} · Побед в спаррингах: ${P.stats.wins}</p>
        <h3>Распорядок</h3><ul class="pu-list">${SCHEDULE.map((x) => `<li class="${x.id === P.phase.id ? 'got' : ''}">${String(x.from).padStart(2, '0')}:00 — ${x.label}</li>`).join('')}</ul>
        <div class="pu-opts">${this.btn(`Перемотать до: ${P.scheduleNext().label}`, () => { this.close(); P.waitUntilNextPhase(); }, { sub: 'время идёт, срок отбывается', disabled: P.alert >= 2 })}</div>`;
    }
    return `<section>${bar}${body}</section>`;
  }

  // ------------------------------------------------------------ сон и время
  openSleep() { this.open({ type: 'sleep' }, 'КОЙКА'); }

  _sleep() {
    const P = this.prison;
    const h = P.hour;
    const night = h >= 20 || h < 6;
    const nap = this.btn('Вздремнуть 2 часа', () => { this.close(); P.sleepUntil((h + 2) % 24, 'Вы дремлете...'); }, { sub: 'немного здоровья' });
    const full = this.btn('Спать до утра (до 6:00)', () => { this.close(); P.sleepUntil(6, 'Вы спите до утра...'); }, { sub: night ? 'ночные проверки: пустая койка — тревога' : 'можно после 20:00', disabled: !night });
    const next = this.btn(`Перемотать до: ${P.scheduleNext().label}`, () => { this.close(); P.waitUntilNextPhase(); }, { sub: 'время идёт, срок отбывается' });
    return `<section><p>Сейчас <b>${P._clock()}</b> · ${P.phase.label}. Срок: ${fmtH(P.left)}.</p>
      <p class="pu-sub">Подушка (лавка) ускоряет восстановление. Ночью проверки в 1:00 и 4:00: койка пуста — тревога. Муляж из подушки (у Скиппи) спасает.</p></section>
      <section class="pu-opts">${nap}${full}${next}</section>`;
  }

  // ------------------------------------------------------------ работа и столовая
  openMenu({ title, text, options }) { this.open({ type: 'menu', text, options }, title); }

  _menu(s) {
    return `<section><p>${s.text}</p></section><section class="pu-opts">${s.options.map((o) => this.btn(o.label, o.run, { sub: o.sub, disabled: o.disabled })).join('')}</section>`;
  }

  openJob(id) {
    const P = this.prison;
    const J = JOBS[id];
    const avail = P.jobAvailable();
    const work = { label: `Работать (+$${J.pay})`, sub: avail ? J.hint : 'Смена с 7:30 до 21:00', run: () => P.startJob(id), disabled: !avail };
    const options = [work];
    if (id === 'laundry') options.push({ label: 'Утащить простыню', sub: 'контрабанда: из трёх связывается верёвка', run: () => P.stealSheet() });
    if (id === 'kitchen') options.push({ label: 'Стащить ложку', sub: 'контрабанда: ею копают подкоп', run: () => P.stealSpoon() });
    if (id === 'library') options.push({ label: 'Почитать книгу', sub: 'иногда там полезные сведения', run: () => P.readBook() });
    this.openMenu({ title: J.label.toUpperCase(), text: 'Работа — это деньги и доступ. Только за подозрительным занятием вас могут заметить.', options });
  }

  openTray() {
    const P = this.prison;
    this.openMenu({
      title: 'РАЗДАЧА',
      text: 'Тюремная еда. Не вкусно, но сытно.',
      options: [
        { label: 'Взять поднос и поесть', sub: '+25 здоровья', run: () => P.eatTray() },
        { label: 'Стащить ложку', sub: 'контрабанда: ею копают подкоп', run: () => P.stealSpoon() },
      ],
    });
  }

  // ------------------------------------------------------------ карты
  _enterCards(rec) {
    this.open({ type: 'cards', rec, last: null }, 'КАРТЫ');
  }

  _cards(s) {
    const P = this.prison;
    const bets = [10, 25, 50, 100];
    const r = s.last;
    const res = r ? (r.error ? `<p class="pu-warn">${r.error}</p>` : `<div class="pu-cards"><div class="pu-card">${cardName(r.me)}<small>вы</small></div><div class="pu-vs">${r.res === 'win' ? 'ПОБЕДА' : r.res === 'lose' ? 'ПРОИГРЫШ' : 'НИЧЬЯ'}</div><div class="pu-card">${cardName(r.them)}<small>${esc(s.rec.nick || s.rec.name.split(' ')[0])}</small></div></div>`) : '';
    const opts = bets.map((b) => this.btn(`Ставка ${formatMoney(b)}`, () => { s.last = P.playCards(s.rec, b); this.render(); }, { disabled: !this.game.wallet.canAfford(b) })).join('');
    return `<section>${this.money()}<p>Каждый тянет по карте. У кого старше — тот забирает ставку. Туз — старший.</p>${res}</section><section class="pu-opts">${opts}${this.btn('Закончить', () => this.close(), { cls: 'ghost' })}</section>`;
  }

  // ------------------------------------------------------------ спарринг
  _spar(s) {
    const P = this.prison;
    const bets = [0, 20, 50, 100];
    const opts = bets.map((b) => this.btn(b ? `Ставка ${formatMoney(b)}` : 'Без ставки', () => { const r = P.startSpar(s.rec, b); if (r.error) { this.game.hud.toast(r.error, 1.8); } }, { disabled: !this.game.wallet.canAfford(b) })).join('');
    return `<section>${this.money()}<p>Дерётесь, пока один не просядет до 30% здоровья. Во дворе и в блоке охрана смотрит сквозь пальцы, а в других местах — нет.</p></section><section class="pu-opts">${opts}${this.btn('Передумал', () => { this.screen = s.back; this.title.textContent = 'РАЗГОВОР'; this.render(); }, { cls: 'ghost' })}</section>`;
  }

  // ------------------------------------------------------------ баскетбол
  openHoops() {
    this.open({ type: 'hoops', shot: 0, score: 0, pos: 0, dir: 1, speed: 1.15, result: '', done: false }, 'БАСКЕТБОЛ');
    clearInterval(this._timer);
    let last = performance.now();
    this._timer = setInterval(() => {
      const s = this.screen;
      if (!s || s.type !== 'hoops') return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (s.done) return;
      s.pos += s.dir * s.speed * dt;
      if (s.pos > 1) { s.pos = 1; s.dir = -1; }
      if (s.pos < 0) { s.pos = 0; s.dir = 1; }
      const m = this.body.querySelector('.pu-marker');
      if (m) m.style.left = `${s.pos * 100}%`;
    }, 16);
  }

  _hoops(s) {
    const zone = `<div class="pu-meter"><div class="pu-zone" style="left:42%;width:16%"></div><div class="pu-marker" style="left:${s.pos * 100}%"></div></div>`;
    const info = `<p>Бросок <b>${Math.min(5, s.shot + (s.done ? 0 : 1))}/5</b> · Попаданий: <b>${s.score}</b></p>${s.result ? `<p class="pu-msg">${esc(s.result)}</p>` : ''}`;
    const btns = s.done
      ? this.btn('Готово', () => this.close(), { cls: 'main' })
      : this.btn('БРОСОК (пробел)', () => this._hoopsShoot(), { cls: 'main' });
    return `<section><p>Нажмите «Бросок» (или пробел), когда бегунок в зелёной зоне.</p>${zone}${info}</section><section class="pu-opts">${btns}${s.done ? '' : this.btn('Уйти', () => this.close(), { cls: 'ghost' })}</section>`;
  }

  _hoopsShoot() {
    const s = this.screen;
    if (!s || s.type !== 'hoops' || s.done) return;
    const hit = s.pos > 0.42 && s.pos < 0.58;
    s.shot++;
    if (hit) { s.score++; s.result = pickLine(['Чистый бросок!', 'Сетка!', 'Красиво!']); }
    else s.result = pickLine(['Мимо!', 'Кольцо!', 'Не повезло']);
    s.speed = Math.min(2.4, s.speed + 0.22);
    if (s.shot >= 5) {
      s.done = true;
      const prize = s.score * 4;
      if (prize) this.game.wallet.add(prize);
      this.prison.stats.respect += s.score * 0.4;
      s.result = `${s.score} из 5. ${prize ? `Ребята скинулись: +$${prize}.` : 'Ничего, потренируешься.'}`;
    }
    this.render();
  }
}

function pickLine(a) { return a[(Math.random() * a.length) | 0]; }
function cardName(n) { return { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' }[n] ?? String(n); }
function greetShort(rec) { return ['Ну?', 'Слушаю.', 'Что хотел?', 'Говори.'][rec.idx % 4]; }

export { fmtH, PHONE_ACTIONS };
