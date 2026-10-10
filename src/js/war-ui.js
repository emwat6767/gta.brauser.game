import { COUNTRIES, ROLES, ORDERS, DIFFICULTY, flagCanvas, rankFor, RANKS } from './war-data.js';
import { formatMoney } from './ui/hud.js';

// Интерфейс «Войны стран»:
//   меню войны (K, кнопка на стартовом экране): страна, роль, противники, сложность → «В бой»;
//   во время войны K — состояние (билеты, пункты, твой счёт) и «Закончить войну»;
//   полоса вверху: билеты стран, пункты захвата, звание; панель приказов (U, цифры 1–7) для президента;
//   итоговый экран победы / поражения.

const SAVE_KEY = 'open-city-war-setup';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const ORDER_ACTIONS = ['weaponFists', 'weaponPistol', 'weaponShotgun', 'weaponSmg', 'weaponRifle', 'weaponSniper', 'weaponRpg'];
const ORDER_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];

export class WarUI {
  constructor(war) {
    this.war = war;
    this.game = war.game;
    this.sel = { country: 'usa', role: 'soldier', rivals: 3, difficulty: 'normal' };
    try {
      Object.assign(this.sel, JSON.parse(window.localStorage.getItem(SAVE_KEY) || '{}'));
    } catch { /* без сохранения */ }
    this._hudTimer = 0;
    this._sig = '';
    this.ordersOpen = false;
    this._build();
  }

  _build() {
    // Меню.
    this.menu = el('div', 'hidden');
    this.menu.id = 'war-menu';
    this.menu.innerHTML = `<div class="wm-panel"><div class="wm-head"><div class="wm-title">⚔ ВОЙНА СТРАН</div><button type="button" class="wm-close">Закрыть</button></div><div class="wm-body"></div></div>`;
    document.body.appendChild(this.menu);
    this.body = this.menu.querySelector('.wm-body');
    this.menu.querySelector('.wm-close').addEventListener('click', () => this.toggleMenu(false));
    this.menu.addEventListener('click', (e) => {
      if (e.target === this.menu) this.toggleMenu(false);
    });
    this.body.addEventListener('click', (e) => this._onMenuClick(e));
    // HUD.
    this.hud = el('div', 'hidden');
    this.hud.id = 'war-hud';
    this.hud.innerHTML = `<div class="wh-teams"></div><div class="wh-points"></div><div class="wh-me"></div>`;
    $('hud')?.appendChild(this.hud) ?? document.body.appendChild(this.hud);
    this.hTeams = this.hud.querySelector('.wh-teams');
    this.hPoints = this.hud.querySelector('.wh-points');
    this.hMe = this.hud.querySelector('.wh-me');
    // Приказы.
    this.orders = el('div', 'hidden');
    this.orders.id = 'war-orders';
    $('hud')?.appendChild(this.orders) ?? document.body.appendChild(this.orders);
    this.orders.addEventListener('click', (e) => {
      const b = e.target.closest('[data-order]');
      if (b) this._issue(b.dataset.order);
    });
    // Итог.
    this.end = el('div', 'hidden');
    this.end.id = 'war-end';
    document.body.appendChild(this.end);
    this.end.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      this.game.menuOpen = false;
      this.end.classList.add('hidden');
      this.war.stop(this.war.lastResult ?? 'quit');
      if (act === 'again') this.toggleMenu(true);
      else if (!this.game.input.touchActive) this.game.input.requestPointerLock();
    });
  }

  get endHidden() {
    return this.end.classList.contains('hidden');
  }

  get isOpen() {
    return !this.menu.classList.contains('hidden') || !this.end.classList.contains('hidden');
  }

  // ------------------------------------------------------------ меню

  toggleMenu(open = this.menu.classList.contains('hidden')) {
    const g = this.game;
    if (open && (g.paused || !this.end.classList.contains('hidden'))) return;
    if (open && g.menuOpen && this.menu.classList.contains('hidden')) return;   // открыто другое меню
    this.menu.classList.toggle('hidden', !open);
    g.menuOpen = open;
    if (open) {
      g.touch?.resetAll();
      document.exitPointerLock?.();
      this.render();
    } else if (!g.paused && !g.input.touchActive) {
      g.input.requestPointerLock();
    }
  }

  render() {
    const war = this.war, g = this.game;
    if (war.active) return this._renderStatus();
    const S = this.sel;
    const T = g.stats.total;
    const block = war.blocker();
    this.body.innerHTML = `
      <section><p class="wm-intro">Выбери страну и роль — вокруг начнётся война. Армии дерутся за площадь и четыре перекрёстка, на базах — дома, бункеры и мешки с песком, чтобы прятаться. Билеты армии кончились — страна сдаётся; убьёшь президента врага — сдастся сразу.</p>
        <p class="wm-stat">Убито людей: <b>${T.kills}</b> · солдат на войне: <b>${T.soldiers}</b> · войн: <b>${T.wars}</b> · побед: <b>${T.wins}</b> · рекорд серии: <b>${T.bestStreak}</b></p></section>
      <section><h3>Твоя страна</h3><div class="wm-countries">
        ${COUNTRIES.map((c) => `<button type="button" class="wm-country${S.country === c.id ? ' sel' : ''}" data-country="${c.id}" style="--c:${c.color}"><canvas width="96" height="64" data-flag="${c.id}"></canvas><b>${c.name}</b><small>${c.army}</small></button>`).join('')}
      </div></section>
      <section><h3>Роль</h3><div class="wm-roles">
        ${Object.entries(ROLES).map(([id, r]) => `<button type="button" class="wm-role${S.role === id ? ' sel' : ''}" data-role="${id}"><b>${r.name}</b><small>${r.desc}</small></button>`).join('')}
      </div></section>
      <section class="wm-opts"><div><h3>Противников</h3>
        ${[1, 2, 3].map((n) => `<button type="button" class="wm-pill${S.rivals === n ? ' sel' : ''}" data-rivals="${n}">${n}</button>`).join('')}</div>
        <div><h3>Сложность</h3>
        ${Object.entries(DIFFICULTY).map(([id, d]) => `<button type="button" class="wm-pill${S.difficulty === id ? ' sel' : ''}" data-diff="${id}">${d.name}</button>`).join('')}</div></section>
      <section><div class="wm-go"><button type="button" class="wm-start" data-act="start" ${block ? 'disabled' : ''}>В БОЙ</button>${block ? `<p class="wm-warn">${block}</p>` : '<p class="gm-sub">Управление: 5 — винтовка, 6 — снайперка (ПКМ — оптика), 7 — гранатомёт; E — сесть в танк, БТР, джип, вертолёт; ЛКМ / ПКМ — стволы техники; U — приказы (президент); K — состояние войны.</p>'}</div></section>`;
    this._flags();
  }

  _flags() {
    for (const cv of this.body.querySelectorAll('canvas[data-flag]')) {
      const c = flagCanvas(cv.dataset.flag, 96, 64);
      cv.getContext('2d').drawImage(c, 0, 0);
    }
  }

  _renderStatus() {
    const war = this.war, g = this.game;
    const mine = war.playerTeam;
    const rank = rankFor(g.stats.session.soldiers);
    const next = RANKS.find((r) => r.at > g.stats.session.soldiers);
    this.body.innerHTML = `
      <section><h3>${mine?.country.name ?? ''} — ${war.role === 'president' ? 'Президент' : 'Солдат'}</h3>
        <p class="wm-stat">Звание: <b>${rank.name}</b>${next ? ` (до «${next.name}»: ещё ${next.at - g.stats.session.soldiers})` : ''}</p>
        <p class="wm-stat">Убито на войне: <b>${g.stats.session.soldiers}</b> солдат · всего людей: <b>${g.stats.total.kills}</b> · серия рекорд: <b>${g.stats.total.bestStreak}</b></p>
        <p class="wm-stat">Деньги: <b>${formatMoney(g.wallet.money)}</b></p></section>
      <section><h3>Билеты и пункты</h3>${war.teams.map((t) => `<div class="wm-team${t.alive ? '' : ' dead'}"><canvas width="48" height="32" data-flag="${t.id}"></canvas><b>${t.country.name}${t.isPlayer ? ' (вы)' : ''}</b><span>${t.alive ? `${Math.max(0, Math.round(t.tickets))} билетов · пунктов ${war.points.filter((p) => p.owner === t.id).length} · убито ${t.kills}` : 'капитулировала'}</span></div>`).join('')}</section>
      <section><div class="wm-go"><button type="button" class="wm-start cancel" data-act="resume">Продолжить бой</button><button type="button" class="wm-start danger" data-act="quit">Закончить войну</button></div></section>`;
    this._flags();
  }

  _onMenuClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const S = this.sel;
    if (b.dataset.country) S.country = b.dataset.country;
    else if (b.dataset.role) S.role = b.dataset.role;
    else if (b.dataset.rivals) S.rivals = +b.dataset.rivals;
    else if (b.dataset.diff) S.difficulty = b.dataset.diff;
    else if (b.dataset.act === 'start') {
      try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* без сохранения */ }
      this.toggleMenu(false);
      this.war.start({ ...S });
      return;
    } else if (b.dataset.act === 'resume') {
      this.toggleMenu(false);
      return;
    } else if (b.dataset.act === 'quit') {
      this.toggleMenu(false);
      this.war.lastResult = 'quit';
      this.war.stop('quit');
      return;
    }
    this.render();
  }

  // ------------------------------------------------------------ HUD и приказы

  onStart() {
    this.hud.classList.remove('hidden');
    document.body.classList.add('war');
    this._sig = '';
    if (this.war.role === 'president') this.game.hud.toast('U — приказы армии · пока идёт бой, вас охраняют', 4);
    else this.game.hud.toast('Захватывайте пункты, прячьтесь в домах и бункерах · K — состояние войны', 4);
  }

  onEnd() {
    this.hud.classList.add('hidden');
    document.body.classList.remove('war');
    this.orders.classList.add('hidden');
    this.ordersOpen = false;
  }

  toggleOrders(open = !this.ordersOpen) {
    if (!this.war.active || this.war.role !== 'president') {
      if (open && this.war.active) this.game.hud.toast('Приказы отдаёт только президент', 1.6);
      return;
    }
    this.ordersOpen = open;
    this.orders.classList.toggle('hidden', !open);
    if (open) this._renderOrders();
  }

  _renderOrders() {
    const g = this.game;
    const money = g.wallet.money;
    this.orders.innerHTML = `<div class="wo-head">ПРИКАЗЫ АРМИИ <small>U — закрыть</small></div>${ORDERS.map((o) => `<button type="button" data-order="${o.id}" title="${o.desc}" class="${o.cost > money ? 'poor' : ''}"><i>${o.key}</i><b>${o.name}</b><span>${o.cost ? formatMoney(o.cost) : 'бесплатно'}</span></button>`).join('')}`;
  }

  _issue(id) {
    const ok = this.war.issueOrder(id);
    if (ok && ['attack', 'defend', 'follow'].includes(id)) this._renderOrders();
    else if (ok) this.toggleOrders(false);
    else this._renderOrders();
  }

  // Цифры 1–7 при открытых приказах — приказы, а не смена оружия (вызывается до player.update).
  handleKeys(input) {
    if (!this.ordersOpen) return;
    ORDER_ACTIONS.forEach((a, i) => {
      if (!input.wasPressed(a)) return;
      input.pressed.delete(ORDER_CODES[i]);
      input.virtualPressed.delete(a);
      this._issue(ORDERS[i].id);
    });
  }

  update(dt) {
    const war = this.war;
    if (!war.active) return;
    this._hudTimer -= dt;
    if (this._hudTimer > 0) return;
    this._hudTimer = 0.25;
    const g = this.game;
    // Команды: флаг, билеты, пункты.
    const sig = war.teams.map((t) => `${t.id}${Math.round(t.tickets)}${t.alive}${t.kills}`).join() + war.points.map((p) => `${p.owner}${p.contested}`).join() + g.stats.session.soldiers + Math.round(g.wallet.money / 10);
    if (sig !== this._sig) {
      this._sig = sig;
      this.hTeams.innerHTML = war.teams.map((t) => {
        const k = Math.max(0, Math.min(1, t.tickets / t.maxTickets));
        return `<div class="wh-team${t.isPlayer ? ' me' : ''}${t.alive ? '' : ' dead'}" style="--c:${t.country.color}"><canvas width="36" height="24" data-flag="${t.id}"></canvas><div class="wh-info"><b>${t.country.short}</b><div class="wh-bar"><i style="width:${(k * 100).toFixed(0)}%"></i></div></div><em>${Math.max(0, Math.round(t.tickets))}</em></div>`;
      }).join('');
      for (const cv of this.hTeams.querySelectorAll('canvas[data-flag]')) cv.getContext('2d').drawImage(flagCanvas(cv.dataset.flag, 36, 24), 0, 0);
      this.hPoints.innerHTML = war.points.map((p) => {
        const c = p.owner ? war.teamById(p.owner)?.country.color ?? '#b9bcc0' : '#b9bcc0';
        return `<span class="wh-pt${p.contested ? ' contested' : ''}${p.capital ? ' cap' : ''}" style="--c:${c}" title="${p.name}">${p.label}</span>`;
      }).join('');
      const r = rankFor(g.stats.session.soldiers);
      this.hMe.innerHTML = `${war.role === 'president' ? '🎖 Президент' : r.name} · убито на войне <b>${g.stats.session.soldiers}</b>${war.role === 'president' ? ' · <u>U</u> приказы' : ''}`;
    }
  }

  // ------------------------------------------------------------ итог

  showEnd(result, s) {
    const g = this.game;
    this.war.lastResult = result;
    g.menuOpen = true;
    document.exitPointerLock?.();
    g.touch?.resetAll();
    const win = result === 'win';
    this.end.innerHTML = `<div class="we-panel ${win ? 'win' : 'loss'}"><div class="we-flag"></div>
      <h2>${win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</h2>
      <p>${win ? `${s.country?.name ?? 'Ваша страна'} выиграла войну!` : `${s.country?.name ?? 'Ваша страна'} проиграла войну.`}</p>
      <div class="we-stats"><span>Роль<b>${s.role}</b></span><span>Звание<b>${s.rank}</b></span><span>Убито<b>${s.kills}</b></span><span>Время<b>${Math.floor(s.secs / 60)}:${String(s.secs % 60).padStart(2, '0')}</b></span><span>Билетов<b>${Math.max(0, Math.round(s.tickets))}</b></span>${s.money ? `<span>Трофеи<b>${formatMoney(s.money)}</b></span>` : ''}</div>
      <div class="wm-go"><button type="button" class="wm-start" data-act="again">Новая война</button><button type="button" class="wm-start cancel" data-act="city">Вернуться в город</button></div></div>`;
    if (s.country) this.end.querySelector('.we-flag').appendChild(flagCanvas(s.country.id, 144, 96));
    this.end.classList.remove('hidden');
  }
}
