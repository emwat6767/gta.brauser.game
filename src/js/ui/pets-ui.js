import { CONFIG } from '../config.js';
import { PETS, PET_BY_ID, oddsColor, formatOdds, upgradePrice } from '../pets.js';

// Интерфейс круток и питомцев:
//   - деньги в углу и всплывающие "+$";
//   - панель сверху: КРУТИТЬ (G), лента-барабан, АВТО (N), ПИТОМЦЫ (B);
//   - большой показ, если выпал питомец 1 на 1 000 и реже;
//   - меню: Питомцы (надеть/снять), Улучшения (покупки), Шансы (все питомцы).
// Редкость показывается только шансом "1 на N" и цветом карточки.

const $ = (id) => document.getElementById(id);
const money = (n) => `$${Math.floor(n).toLocaleString('ru-RU')}`;
const secs = (t) => `${t.toFixed(t < 1 ? 2 : 1)} с`;
const rate = (n) => `$${n.toLocaleString('ru-RU', { maximumFractionDigits: n < 10 ? 2 : 0 })}/с`;
const CARD_W = 60;         // ширина карточки на ленте (px, с отступом)
const REEL_CARDS = 30;
const RESULT_INDEX = 25;

function cardHTML(def, thumb, extra = '') {
  const c = oddsColor(def.odds);
  const style = c === 'rainbow' ? '' : `--c:${c}`;
  return `<div class="pcard${c === 'rainbow' ? ' rainbow' : ''}" style="${style}" ${extra}>` +
    `<img src="${thumb}" alt=""><span>${formatOdds(def.odds)}</span></div>`;
}

export class PetsUI {
  constructor(game) {
    this.game = game;
    this.pets = game.pets;
    this.moneyEl = $('money');
    this.popEl = $('money-pop');
    this.strip = $('reel-strip');
    this.reel = $('reel');
    this.rollBtn = $('roll-btn');
    this.autoBtn = $('auto-btn');
    this.infoEl = $('roll-info');
    this.reveal = $('reveal');
    this.menu = $('pets-menu');
    this.body = $('pm-body');
    this.statsEl = $('pm-stats');
    this.tab = 'pets';
    this._revealTimer = 0;
    this._info = '';
    this._moneyShown = -1;
    this._lastResult = PETS[0];

    this.rollBtn.addEventListener('click', () => this.pets.startRoll());
    this.autoBtn.addEventListener('click', () => this.toggleAuto());
    $('pets-btn').addEventListener('click', () => this.toggleMenu());
    $('pm-close').addEventListener('click', () => this.toggleMenu(false));
    for (const b of this.menu.querySelectorAll('[data-tab]')) {
      b.addEventListener('click', () => this._setTab(b.dataset.tab));
    }
    // Клики внутри меню (делегирование): надеть/снять, купить.
    this.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const { act, id } = el.dataset;
      if (act === 'equip') this.pets.toggleEquip(id);
      else if (act === 'best') this.pets.equipBest();
      else if (act === 'buy') {
        if (!this.pets.buyUpgrade(id)) this.game.hud.toast('Не хватает денег', 1.2);
      } else if (act === 'potion') {
        if (!this.pets.buyPotion()) this.game.hud.toast('Не хватает денег', 1.2);
      }
      this._render();
    });

    game.events.on('money:changed', ({ delta, quiet }) => {
      if (delta > 0 && !quiet) this._popup(`+${money(delta)}`, '#7dff7a');
      else if (delta < 0) this._popup(`−${money(-delta)}`, '#ff8a8a');
      // Доход питомцев капает каждую секунду: обновляем только цифры, не всё меню
      // (иначе нажатие на кнопку может попасть между перерисовками).
      if (this.isOpen) this._refreshMoney();
    });
    game.events.on('pets:rollStart', ({ results, duration }) => this._spin(results[0], duration));
    game.events.on('pets:rolled', ({ results }) => this._onRolled(results));

    this._showIdle();
  }

  get isOpen() {
    return !this.menu.classList.contains('hidden');
  }

  toggleAuto() {
    if (!this.pets.autoUnlocked) {
      this.game.hud.toast(`Автокрутка — в Улучшениях (${money(upgradePrice('auto', 0))})`, 2);
      return;
    }
    this.pets.toggleAuto();
  }

  // Открыть/закрыть меню. На компьютере отпускаем мышь (иначе по кнопкам не кликнуть).
  toggleMenu(open = !this.isOpen) {
    this.menu.classList.toggle('hidden', !open);
    this.game.menuOpen = open;
    if (open) {
      document.exitPointerLock?.();
      this._render();
    } else if (!this.game.paused) {
      this.game.input.requestPointerLock();
    }
  }

  _setTab(tab) {
    this.tab = tab;
    for (const b of this.menu.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    this._render();
  }

  // --- Лента ---------------------------------------------------------------------

  _showIdle() {
    const def = this._lastResult;
    this.strip.style.transition = 'none';
    this.strip.innerHTML = cardHTML(def, this.pets.thumbnail(def.id));
    this.strip.style.transform = `translateX(${this.reel.clientWidth / 2 - CARD_W / 2}px)`;
  }

  _spin(result, duration) {
    // Лента из случайных питомцев (как выпадают обычно) + пара редких "почти выпало".
    const cards = [];
    for (let i = 0; i < REEL_CARDS; i++) {
      let def = this.pets.rollOne(1);
      if (i === RESULT_INDEX - 1 || i === RESULT_INDEX + 1) {
        if (Math.random() < 0.5) def = PETS[Math.min(PETS.length - 1, 8 + Math.floor(Math.random() * 6))];
      }
      if (i === RESULT_INDEX) def = result;
      cards.push(cardHTML(def, this.pets.thumbnail(def.id), i === RESULT_INDEX ? 'data-result="1"' : ''));
    }
    const center = this.reel.clientWidth / 2 - CARD_W / 2;
    this.strip.style.transition = 'none';
    this.strip.innerHTML = cards.join('');
    this.strip.style.transform = `translateX(${center}px)`;
    void this.strip.offsetWidth; // применить начальное положение до анимации
    const jitter = (Math.random() - 0.5) * CARD_W * 0.5;
    this.strip.style.transition = `transform ${duration}s cubic-bezier(0.12, 0.72, 0.18, 1)`;
    this.strip.style.transform = `translateX(${center - RESULT_INDEX * CARD_W + jitter}px)`;
    this.reel.classList.add('spinning');
    this.rollBtn.disabled = true;
  }

  _onRolled(results) {
    const best = results[0];
    this._lastResult = best;
    this.reel.classList.remove('spinning');
    this.rollBtn.disabled = false;
    const cardEl = this.strip.querySelector('[data-result]');
    cardEl?.classList.add('won');
    const names = results.map((d) => `${d.name} · ${formatOdds(d.odds)}`).join(', ');
    this.game.hud.toast(names, 1.6);
    if (best.odds >= 1000) this._showReveal(best);
    else this.game.audio.chime();
    if (this.isOpen) this._render();
  }

  _showReveal(def) {
    const c = oddsColor(def.odds);
    $('reveal-img').src = this.pets.thumbnail(def.id);
    $('reveal-name').textContent = def.name;
    const oddsEl = $('reveal-odds');
    oddsEl.textContent = formatOdds(def.odds);
    this.reveal.classList.toggle('rainbow', c === 'rainbow');
    this.reveal.style.setProperty('--c', c === 'rainbow' ? '#ffffff' : c);
    this.reveal.classList.remove('hidden');
    this.reveal.style.animation = 'none';
    void this.reveal.offsetWidth;
    this.reveal.style.animation = '';
    this._revealTimer = 3;
    this.game.audio.fanfare?.(def.odds);
  }

  _popup(text, color) {
    const el = document.createElement('div');
    el.className = 'mpop';
    el.textContent = text;
    el.style.color = color;
    this.popEl.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  // --- Меню ------------------------------------------------------------------------

  _render() {
    this._renderStats();
    if (this.tab === 'pets') this.body.innerHTML = this._petsTab();
    else if (this.tab === 'shop') this.body.innerHTML = this._shopTab();
    else this.body.innerHTML = this._oddsTab();
  }

  _refreshMoney() {
    this._renderStats();
    const cash = this.game.wallet.money;
    for (const b of this.body.querySelectorAll('[data-price]')) b.classList.toggle('poor', cash < +b.dataset.price);
  }

  _renderStats() {
    const P = this.pets;
    this.statsEl.innerHTML = [
      `Деньги <b>${money(this.game.wallet.money)}</b>`,
      `Бонус к деньгам <b>×${P.moneyMult.toFixed(2)}</b>`,
      `Доход <b>${rate(P.income)}</b>`,
      `Удача <b>×${P.luck.toFixed(2)}</b>${P.potionTime > 0 ? ` (зелье ${Math.ceil(P.potionTime)} с)` : ''}`,
      `Прокрутка <b>${secs(P.spinTime)}</b>`,
      `Слоты <b>${P.equipped.length}/${P.slots}</b>`,
      `Круток <b>${P.rolls.toLocaleString('ru-RU')}</b>`,
    ].map((s) => `<span>${s}</span>`).join('');
  }

  _petsTab() {
    const P = this.pets;
    const ids = Object.keys(P.owned).filter((id) => P.owned[id] > 0)
      .sort((a, b) => PET_BY_ID.get(b).odds - PET_BY_ID.get(a).odds);
    if (!ids.length) return '<p class="pm-empty">Питомцев пока нет — нажмите КРУТИТЬ.</p>';
    const cards = ids.map((id) => {
      const d = PET_BY_ID.get(id);
      const on = P.equippedCount(id);
      const c = oddsColor(d.odds);
      return `<button type="button" class="pm-pet${on ? ' on' : ''}${c === 'rainbow' ? ' rainbow' : ''}" style="--c:${c === 'rainbow' ? '#fff' : c}" data-act="equip" data-id="${id}">` +
        `<img src="${P.thumbnail(id)}" alt=""><b>${d.name}</b><span class="odds">${formatOdds(d.odds)}</span>` +
        `<span>×${d.mult.toFixed(2)} · ${rate(d.income)}</span>` +
        `<span class="cnt">есть ${P.owned[id]}${on ? ` · в слоте ${on}` : ''}</span></button>`;
    });
    return `<div class="pm-actions"><button type="button" data-act="best">Надеть лучших</button>` +
      `<span>Нажмите на питомца, чтобы надеть или снять.</span></div><div class="pm-grid">${cards.join('')}</div>`;
  }

  _shopTab() {
    const P = this.pets;
    const U = CONFIG.pets.upgrades;
    const cash = this.game.wallet.money;
    const row = (key, now, next) => {
      const lvl = P.levels[key];
      const max = lvl >= U[key].max;
      const price = max ? 0 : upgradePrice(key, lvl);
      const btn = max
        ? '<button type="button" disabled>Максимум</button>'
        : `<button type="button" data-act="buy" data-id="${key}" data-price="${price}" ${cash < price ? 'class="poor"' : ''}>${money(price)}</button>`;
      return `<div class="pm-row"><div><b>${U[key].name}</b> <small>ур. ${lvl}/${U[key].max}</small>` +
        `<div class="eff">${now}${max ? '' : ` → <b>${next}</b>`}</div></div>${btn}</div>`;
    };
    const luckAt = (l) => `×${(1 + U.luck.step * l).toFixed(2)}`;
    const spinAt = (l) => secs(CONFIG.pets.baseSpin * Math.pow(U.speed.factor, l));
    const L = P.levels;
    const potion = CONFIG.pets.potion;
    return [
      row('luck', `Удача ${luckAt(L.luck)}`, luckAt(L.luck + 1)),
      row('speed', `Прокрутка ${spinAt(L.speed)}`, spinAt(L.speed + 1)),
      row('dice', `${1 + L.dice} за крутку`, `${2 + L.dice} за крутку`),
      row('slots', `${1 + L.slots} слот(а)`, `${2 + L.slots} слот(а)`),
      row('auto', L.auto ? 'Куплено — кнопка АВТО (N)' : 'Крутит сама без нажатий', 'включить'),
      `<div class="pm-row"><div><b>${potion.name}</b><div class="eff">Удача ×2 на ${potion.seconds} с` +
        `${P.potionTime > 0 ? ` · осталось ${Math.ceil(P.potionTime)} с` : ''}</div></div>` +
        `<button type="button" data-act="potion" data-price="${potion.price}" ${cash < potion.price ? 'class="poor"' : ''}>${money(potion.price)}</button></div>`,
    ].join('');
  }

  _oddsTab() {
    const P = this.pets;
    const rows = PETS.map((d) => {
      const known = (P.owned[d.id] ?? 0) > 0 || d.odds < 1000;
      const e = P.effectiveOdds(d);
      const eff = P.luck > 1 && e >= 2 ? `<small>с удачей ${formatOdds(e)}</small>` : '';
      const c = oddsColor(d.odds);
      return `<div class="pm-odd${c === 'rainbow' ? ' rainbow' : ''}" style="--c:${c === 'rainbow' ? '#fff' : c}">` +
        `<img src="${P.thumbnail(d.id)}" alt="" class="${known ? '' : 'unknown'}">` +
        `<b>${known ? d.name : '???'}</b><span class="odds">${formatOdds(d.odds)}</span>${eff}` +
        `<span>×${d.mult.toFixed(2)}</span></div>`;
    });
    return `<div class="pm-oddlist">${rows.join('')}</div>`;
  }

  // --- Каждый кадр ------------------------------------------------------------------

  update(dt) {
    const P = this.pets;
    const m = this.game.wallet.money;
    if (m !== this._moneyShown) {
      this._moneyShown = m;
      this.moneyEl.textContent = money(m);
    }
    const info = `Удача ×${P.luck.toFixed(2)}${P.potionTime > 0 ? ` (зелье ${Math.ceil(P.potionTime)} с)` : ''} · ${secs(P.spinTime)}`;
    if (info !== this._info) {
      this._info = info;
      this.infoEl.textContent = info;
    }
    this.autoBtn.classList.toggle('locked', !P.autoUnlocked);
    this.autoBtn.classList.toggle('on', P.autoOn);
    if (this._revealTimer > 0 && (this._revealTimer -= dt) <= 0) this.reveal.classList.add('hidden');
    if (this.isOpen && P.potionTime > 0 && Math.floor(P.potionTime) !== this._lastPotion) {
      this._lastPotion = Math.floor(P.potionTime);
      this._render();
    }
  }
}
