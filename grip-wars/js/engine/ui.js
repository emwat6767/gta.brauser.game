//# sourceURL=ufc/ui.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const CONTROLS = [
  ['Движение', 'W A S D', 'Левый стик'],
  ['Уклоны / нырок / отклон', 'Стрелки', 'Правый стик'],
  ['Левый прямой', 'J', '□'],
  ['Правый прямой', 'I', '△'],
  ['Удар левой ногой (лоу)', 'K', '✕'],
  ['Удар правой ногой (лоу)', 'L', '○'],
  ['Хук (с рукой) / ногой в корпус', 'U + удар', 'L1 + удар'],
  ['Апперкот / хай-кик', 'O + удар', 'R1 + удар'],
  ['Удар в корпус рукой', 'U + O + рука', 'L1 + R1 + рука'],
  ['Высокий блок', 'Пробел', 'R2'],
  ['Защита корпуса / блок лоу-кика', 'C или Shift + Пробел', 'L2 + R2'],
  ['Добивание лежащего соперника', 'R', 'R3'],
  ['FLOW (когда пошла кровь)', 'F', 'L1 + R1'],
  ['Пауза', 'Esc', 'Options'],
];

class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#ui');
    this.settings = { difficulty: 1, rounds: 5, roundLen: 45, volume: 0.8, speech: true, mcg: 0 };
    try { Object.assign(this.settings, UFC.store.get('ufc.settings', {}) || {}); } catch (e) { /* ignore */ }
    if (!this.settings.fmtV) { this.settings.rounds = 5; this.settings.roundLen = 45; this.settings.fmtV = 2; }   // new format: 5 rounds of 45 seconds
    UFC.SETTINGS = this.settings;
    UFC.applyNameMode(this.settings.names || 'orig');
    UFC.applyTouchSize(this.settings.touchSize || 'normal');
    this.pick = { p: 0, o: 1 };
    this.routes = {};
    this.history = [];
    this.params = {};
    this._build();
    this._registerRoutes();
  }

  saveSettings() { try { UFC.store.set('ufc.settings', this.settings); } catch (e) { /* ignore */ } }

  // Low level: make one screen visible (no history).
  show(id) {
    const target = document.getElementById(id);
    if (!target) throw new Error('Экран не найден: ' + id);
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s !== target));
    if (this.current !== id) {
      target.classList.remove('enter'); void target.offsetWidth; target.classList.add('enter');
    }
    this.current = id;
    this._setFocus(null);
  }

  // ---------------------------------------------------------------------
  // Navigation. Every screen is a route: go(id, params) renders it through
  // its registered handler and pushes the previous screen on the history
  // stack; back() returns to it (re-rendered, so data is always fresh).
  // A failing screen shows the error screen with a way back, never a
  // blank / black page.
  // ---------------------------------------------------------------------
  route(id, render, opts) { this.routes[id] = Object.assign({ render }, opts || {}); }

  go(id, params, opts = {}) {
    const r = this.routes[id];
    try {
      if (!r) throw new Error('Экран «' + id + '» не зарегистрирован');
      if (opts.reset) this.history.length = 0;
      else if (!opts.replace && this.current && this.current !== id && this.current !== 'scr-error' && !(this.routes[this.current] || {}).transient) {
        this.history.push({ id: this.current, params: this.params });
      }
      this.params = params || {};
      if (r.render) r.render(this.params);
      this.show(id);
    } catch (e) {
      this.fail(e, id);
    }
  }

  back() {
    const c = this.current;
    if (c === 'scr-pause') { this.game.setPaused(false); return; }
    const r = this.routes[c];
    if (r && r.onBack && r.onBack() === false) return;
    const prev = this.history.pop();
    if (prev) this.go(prev.id, prev.params, { replace: true });
    else if (this.game.phase === 'menu') this.go('scr-menu', null, { reset: true });
  }

  home() { this.go('scr-menu', null, { reset: true }); }

  // Error state instead of a black screen.
  fail(e, where) {
    UFC.reportError(e, where);
    const box = document.getElementById('error-body');
    if (box) {
      box.querySelector('.err-msg').textContent = String((e && e.message) || e);
      box.querySelector('.err-where').textContent = where ? 'Экран: ' + where : '';
    }
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== 'scr-error'));
    this.current = 'scr-error';
  }

  // The frame loop keeps failing: stop the fight safely and offer a way out.
  fatal(e) {
    try { if (this.game.phase !== 'menu') this.game.quitToMenu(); } catch (e2) { /* keep going */ }
    this.fail(e, 'игровой цикл');
  }

  // D-pad / stick / arrow keys move focus, cross/Enter confirms, circle/Backspace goes back.
  navTick(input) {
    if (!this.current) return;
    const screen = document.getElementById(this.current);
    if (!screen || screen.classList.contains('hidden')) return;
    const s = input.state, p = input.prev;
    const dirNow = (x, y) => (Math.abs(x) > Math.abs(y) ? (x > 0.5 ? 'right' : x < -0.5 ? 'left' : null) : (y > 0.5 ? 'up' : y < -0.5 ? 'down' : null));
    const dir = dirNow(s.lx + s.rx, s.ly + s.ry), prevDir = dirNow(p.lx + p.rx, p.ly + p.ry);
    const items = [...screen.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
    if (!items.length) return;
    let cur = items.includes(this._focus) ? this._focus : null;
    if (dir && dir !== prevDir) {
      if (!cur) cur = items[0];
      else {
        const r0 = cur.getBoundingClientRect(), cx = r0.x + r0.width / 2, cy = r0.y + r0.height / 2;
        let best = null, bestScore = 1e9;
        for (const b of items) {
          if (b === cur) continue;
          const r = b.getBoundingClientRect(), dx = r.x + r.width / 2 - cx, dy = r.y + r.height / 2 - cy;
          const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
          const perp = dir === 'right' || dir === 'left' ? Math.abs(dy) : Math.abs(dx);
          if (along <= 4) continue;
          const score = along + perp * 2.5;
          if (score < bestScore) { bestScore = score; best = b; }
        }
        if (best) cur = best;
      }
      this._setFocus(cur);
    }
    if (input.pressed('cross') && cur) cur.click();
    if (input.pressed('circle') || input.pressed('back') || (input.pressed('start') && this.game.phase === 'menu')) this.back();
  }

  _setFocus(el) {
    if (this._focus) this._focus.classList.remove('navfocus');
    this._focus = el;
    if (el) { el.classList.add('navfocus'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
  }

  hideAll() { document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden')); this.current = null; this.history.length = 0; }

  _build() {
    // ---- main menu ----
    const menu = el('div', 'screen', `
      <div class="menu-wrap">
        <div class="logo"><span>UFC</span><small>ULTIMATE FIGHTING</small></div>
        <div class="menu-buttons">
          <button class="btn primary" data-act="quick">Бой</button>
          <button class="btn" data-act="career">Карьера</button>
          <button class="btn" data-act="fighters">Выбор бойца</button>
          <button class="btn" data-act="rankings">Рейтинги</button>
          <button class="btn" data-act="controls">Управление</button>
          <button class="btn" data-act="settings">Настройки</button>
        </div>
        <div class="menu-foot">Геймпад PlayStation / Xbox, клавиатура и сенсорный экран</div>
      </div>`);
    menu.id = 'scr-menu';
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      this.game.audio.ensure();
      const act = b.dataset.act;
      const to = { quick: 'scr-select', career: 'scr-career', fighters: 'scr-fighters', rankings: 'scr-rankings', controls: 'scr-controls', settings: 'scr-settings' }[act];
      if (to) this.go(to);
    });
    this.root.appendChild(menu);

    // ---- fighter select ----
    const sel = el('div', 'screen hidden', `
      <div class="select-wrap">
        <div class="select-head"><button class="btn small" data-act="back">‹ Назад</button><h2>Быстрый бой</h2><div></div></div>
        <div class="select-cols">
          <div class="select-col"><h3>Ваш боец <button class="chip look-btn" data-act="look-p">Внешность</button></h3><div class="roster" id="roster-p"></div></div>
          <div class="versus">VS</div>
          <div class="select-col"><h3>Соперник <button class="chip look-btn" data-act="look-o">Внешность</button></h3><div class="roster" id="roster-o"></div></div>
        </div>
        <div class="select-cards"><div id="card-p" class="fcard"></div><div id="card-o" class="fcard"></div></div>
        <div class="select-opts">
          <div class="opt"><label>Сложность ИИ</label><div class="chips" id="opt-diff"></div></div>
          <div class="opt"><label>Формат</label><div class="chips" id="opt-rounds"></div></div>
          <div class="opt"><label>Длина раунда</label><div class="chips" id="opt-len"></div></div>
          <div class="opt"><label>Техника бойца</label><div class="chips" id="opt-tech"></div></div>
          <div class="opt"><label>Мод Макгрегора (Авто: ур. 1, с техникой Макгрегора ур. 2)</label><div class="chips" id="opt-mcg"></div></div>
        </div>
        <button class="btn primary big" data-act="fight">В октагон</button>
      </div>`);
    sel.id = 'scr-select';
    sel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'back') this.back();
      if (b.dataset.act === 'fight') this.game.startQuickFight(UFC.fighterCfg(this.pick.p), UFC.fighterCfg(this.pick.o), this.settings);
      if (b.dataset.act === 'look-p' || b.dataset.act === 'look-o') this.go('scr-look', { key: b.dataset.act.slice(5) });
    });
    this.root.appendChild(sel);

    // ---- appearance editor ----
    const look = el('div', 'screen hidden', `
      <div class="look-panel">
        <div class="look-head"><button class="btn small" data-act="back">‹ Назад</button><h2 id="look-title">Внешность</h2></div>
        <div id="look-body"></div>
        <div class="look-foot"><button class="btn small" data-act="reset">Сбросить</button><button class="btn primary small" data-act="done">Готово</button></div>
      </div>`);
    look.id = 'scr-look';
    look.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'back' || b.dataset.act === 'done') this.back();
      if (b.dataset.act === 'reset') { UFC.resetLook(this.pick[this._lookKey]); this.go('scr-look', { key: this._lookKey }, { replace: true }); }
    });
    this.root.appendChild(look);

    // ---- controls ----
    const ctr = el('div', 'screen hidden', `
      <div class="panel">
        <h2>Управление</h2>
        <table class="controls"><thead><tr><th>Действие</th><th>Клавиатура</th><th>Геймпад</th></tr></thead>
        <tbody>${CONTROLS.map((r) => `<tr><td>${r[0]}</td><td><kbd>${r[1]}</kbd></td><td><kbd>${r[2]}</kbd></td></tr>`).join('')}</tbody></table>
        <div class="tips">
          <p><b>Контратака.</b> Удар в момент, когда соперник бьёт, или сразу после уклона — урон ×1.3.</p>
          <p><b>Парирование.</b> Поставьте блок в последний момент перед ударом — соперник раскроется.</p>
          <p><b>Выносливость.</b> Уставший боец бьёт медленнее и слабее, пропущенные удары в корпус сжигают запас сил на весь бой.</p>
          <p><b>Телефон — раскладка геймпада.</b> Слева стик (палец можно ставить в любом месте левой половины) — только движение, ударов он не даёт. Справа ромб: <b>△</b>, <b>□</b>, <b>○</b>, <b>✕</b> — по умолчанию кросс, джеб, лоу задней и лоу передней ногой. Свайп по самой кнопке меняет удар: вверх — апперкот, вбок — хук, вниз — в корпус.</p>
          <p><b>Свайпы.</b> Вся правая часть экрана — зона свайпов: тап — джеб, вверх — апперкот, вниз — в корпус, влево — хук, вправо — кросс, диагональ вверх — хай-кик, диагональ вниз — лоу-кик, длинный быстрый свайп — тейкдаун. Диагональ влево бьёт передней рукой/ногой, вправо — задней. Медленное движение пальцем ударом не считается.</p>
          <p><b>Курки.</b> R2 — блок (удерживать), L2 — уклон корпусом, L1 — хук, R1 — апперкот; нажать L1 и R1 вместе — удары в корпус. Курки-модификаторы залипают: нажал один раз — включил, ещё раз — выключил. Мини-стик справа — уклоны, снизу слева — КЛИНЧ, ТЕЙК, САБ, ДОБИТЬ и FLOW (появляются, когда доступны).</p>
        </div>
        <div class="panel-foot"><button class="btn" data-act="binds">Настроить кнопки и свайпы</button><button class="btn primary" data-act="close">‹ Назад</button></div>
      </div>`);
    ctr.id = 'scr-controls';
    ctr.addEventListener('click', (e) => {
      if (e.target.closest('[data-act=close]')) this.back();
      if (e.target.closest('[data-act=binds]')) this.go('scr-binds');
    });
    this.root.appendChild(ctr);

    // ---- control customization (buttons + swipes)
    const bnd = el('div', 'screen hidden', `
      <div class="panel">
        <h2>Настройка управления</h2>
        <p class="hint">Телефон: назначь любое действие на кнопку или свайп. Настройки сохраняются.</p>
        <div id="bind-body"></div>
        <div class="panel-foot"><button class="btn" data-act="reset">Сбросить</button><button class="btn primary" data-act="close">‹ Назад</button></div>
      </div>`);
    bnd.id = 'scr-binds';
    bnd.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'close') this.back();
      if (b.dataset.act === 'reset') { this.settings.binds = null; this.saveSettings(); this.game.touch.refreshBinds(); this.renderBinds(); }
    });
    bnd.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-kind]'); if (!sel) return;
      const b = this.settings.binds || (this.settings.binds = { btn: {}, swipe: {} });
      b[sel.dataset.kind] = b[sel.dataset.kind] || {};
      b[sel.dataset.kind][sel.dataset.slot] = sel.value;
      this.saveSettings();
      this.game.touch.refreshBinds();
    });
    this.root.appendChild(bnd);

    // ---- settings ----
    const set = el('div', 'screen hidden', `
      <div class="panel narrow">
        <h2>Настройки</h2>
        <div class="opt"><label>Громкость</label><input type="range" min="0" max="1" step="0.05" id="set-vol"></div>
        <div class="opt"><label>Голос комментатора и ринг-анонсера</label><div class="chips" id="set-speech"></div></div>
        <div class="opt"><label>Какой голос</label><div class="chips" id="set-voice"></div></div>
        <div class="opt"><label>Музыка в меню и в бою</label><div class="chips" id="set-music"></div></div>
        <div class="opt"><label>Презентации (выход, взвешивание, церемонии)</label><div class="chips" id="set-pres"></div></div>
        <div class="opt"><label>Качество графики</label><div class="chips" id="set-quality"></div></div>
        <div class="opt"><label>Размер кнопок на телефоне</label><div class="chips" id="set-touch"></div></div>
        <div class="opt"><label>Мод Макгрегора: Авто = уровень 1 (с техникой Макгрегора — 2). Во всех боях и в карьере</label><div class="chips" id="set-mcg"></div></div>
        <div class="opt"><label>Имена бойцов</label><div class="chips" id="set-names"></div></div>
        <p class="set-note">Оригинальные — авторские персонажи игры (для публичной версии). Реальные имена включаются для личной игры; новые имена появятся в новых боях и карьерах.</p>
        <p class="set-note" id="set-storage"></p>
        <div class="panel-foot"><button class="btn primary" data-act="close">‹ Назад</button></div>
      </div>`);
    set.id = 'scr-settings';
    set.addEventListener('click', (e) => { if (e.target.closest('[data-act=close]')) this.back(); });
    this.root.appendChild(set);

    // ---- pause ----
    const pause = el('div', 'screen hidden dim', `
      <div class="panel narrow center">
        <h2>Пауза</h2>
        <button class="btn primary" data-act="resume">Продолжить</button>
        <button class="btn" data-act="restart">Начать бой заново</button>
        <button class="btn" data-act="controls">Управление</button>
        <button class="btn" data-act="quit">Выйти в меню</button>
      </div>`);
    pause.id = 'scr-pause';
    pause.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'resume') this.game.setPaused(false);
      if (a === 'restart') this.game.restartFight();
      if (a === 'controls') this.go('scr-controls');
      if (a === 'quit') this.game.quitToMenu();
    });
    this.root.appendChild(pause);

    // ---- result ----
    const res = el('div', 'screen hidden dim', `<div class="panel result" id="result-body"></div>`);
    res.id = 'scr-result';
    res.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'rematch') this.game.restartFight();
      if (b.dataset.act === 'menu') this.game.quitToMenu();
      if (b.dataset.act === 'continue' && this.game.onResultContinue) this.game.onResultContinue();
      if (b.dataset.act === 'medical' && UFC.medical) UFC.medical.open(this.game.lastMedical, 'opp');
    });
    this.root.appendChild(res);

    // ---- error state (never a black screen) ----
    const err = el('div', 'screen hidden dim', `
      <div class="panel narrow center" id="error-body">
        <h2>Что-то пошло не так</h2>
        <p class="err-msg"></p>
        <p class="err-where"></p>
        <button class="btn primary" data-act="back">‹ Назад</button>
        <button class="btn" data-act="home">Главное меню</button>
        <button class="btn" data-act="reload">Перезагрузить игру</button>
      </div>`);
    err.id = 'scr-error';
    err.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'back') this.back();
      if (b.dataset.act === 'home') { try { if (this.game.phase !== 'menu') this.game.quitToMenu(); else this.home(); } catch (e2) { location.reload(); } }
      if (b.dataset.act === 'reload') location.reload();
    });
    this.root.appendChild(err);

    this.toastEl = el('div', 'toast hidden'); document.body.appendChild(this.toastEl);
  }

  _registerRoutes() {
    this.route('scr-menu', () => { this.game.showPreview(null); }, { onBack: () => false });
    this.route('scr-select', () => this.renderSelect());
    this.route('scr-look', (p) => this.renderLook(p.key || 'p'));
    this.route('scr-controls', null);
    this.route('scr-binds', () => this.renderBinds());
    this.route('scr-settings', () => this.renderSettings(), { onBack: () => { this.saveSettings(); } });
    this.route('scr-pause', null);
    this.route('scr-result', null, { transient: true, onBack: () => false });
    this.route('scr-error', null, { transient: true });
    // Screens provided by other modules (career, rankings, fighters) register
    // themselves through UFC.registerScreens.
    (UFC.screenRegistrars || []).forEach((fn) => { try { fn(this); } catch (e) { UFC.reportError(e, 'регистрация экранов'); } });
  }

  toast(msg) {
    this.toastEl.textContent = msg; this.toastEl.classList.remove('hidden');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => this.toastEl.classList.add('hidden'), 2200);
  }

  _chips(container, options, get, set) {
    container.innerHTML = '';
    options.forEach(([val, label]) => {
      const c = el('button', 'chip' + (get() === val ? ' on' : ''), label);
      c.addEventListener('click', () => { set(val); this.saveSettings(); this._chips(container, options, get, set); });
      container.appendChild(c);
    });
  }

  openControls() { this.go('scr-controls'); }

  renderBinds() {
    const box = $('#bind-body'); if (!box) return;
    const cur = UFC.binds(this.settings);
    const opts = (kind, sel) => Object.keys(UFC.ACTIONS).map((id) => {
      const A = UFC.ACTIONS[id];
      // triggers and modifiers belong on the shoulder buttons, not on a swipe
      if (kind === 'swipe' && (A.hold || A.mod)) return '';
      return '<option value="' + id + '"' + (id === sel ? ' selected' : '') + '>' + A.name + '</option>';
    }).join('');
    const rows = (kind) => UFC.BIND_SLOTS[kind].map(([slot, label]) =>
      '<tr><td>' + label + '</td><td><select class="bindsel" data-kind="' + kind + '" data-slot="' + slot + '">' + opts(kind, cur[kind][slot]) + '</select></td></tr>').join('');
    box.innerHTML = '<h3>Кнопки</h3><table class="binds"><tbody>' + rows('btn') + '</tbody></table>'
      + '<h3>Свайпы</h3><table class="binds"><tbody>' + rows('swipe') + '</tbody></table>'
      + '<p class="hint">Свайпы работают в правой части экрана. Джойстик слева отвечает только за движение и никогда не бьёт. Длинный свайп (более трети экрана) срабатывает как отдельное действие, диагональ влево бьёт передней рукой/ногой, вправо — задней.</p>';
  }
  openSettings() { this.go('scr-settings'); }
  openSelect() { this.go('scr-select'); }
  openLook(key) { this.go('scr-look', { key }); }

  renderSettings() {
    const s = this.settings;
    const vol = $('#set-vol'); vol.value = s.volume;
    vol.oninput = () => { s.volume = +vol.value; this.game.audio.setVolume(s.volume); };
    this._chips($('#set-speech'), [[true, 'Вкл'], [false, 'Выкл']], () => s.speech, (v) => { s.speech = v; this.game.audio.enabled = v; });
    this._chips($('#set-voice'), [['sys', 'Системный (лучше)'], ['own', 'Свой синтез (эксперимент)']], () => s.voice || 'sys', (v) => { s.voice = v; this.game.audio.voiceMode = v; if (UFC.Voice) UFC.Voice.cancel(); this.game.audio.say(v === 'own' ? 'Он вырубил его! Нокаут!' : 'Проверка голоса. Нокаут!', 1.1, true, { energy: 0.9 }); });
    this._chips($('#set-music'), [[true, 'Вкл'], [false, 'Выкл']], () => s.music !== false, (v) => { s.music = v; this.game.audio.musicEnabled = v; if (!v) this.game.audio.stopMusic(0.4); });
    this._chips($('#set-touch'), [['small', 'Мелкие'], ['normal', 'Обычные'], ['big', 'Крупные']], () => s.touchSize || 'normal', (v) => { s.touchSize = v; UFC.applyTouchSize(v); });
    this._chips($('#set-names'), [['orig', 'Оригинальные'], ['real', 'Реальные']], () => s.names || 'orig', (v) => { s.names = v; UFC.applyNameMode(v); this.toast('Имена обновлены'); });
    this._chips($('#set-mcg'), [[0, 'Авто'], [1, 'Уровень 1'], [2, 'Уровень 2'], [-1, 'Выкл']], () => s.mcg || 0, (v) => { s.mcg = v; this.toast(v < 0 ? 'Мод Макгрегора выключен' : v ? 'Мод Макгрегора: уровень ' + v : 'Мод Макгрегора: авто'); });
    this._chips($('#set-pres'), [['full', 'Полные'], ['short', 'Короткие'], ['off', 'Выкл']], () => s.presentation || 'full', (v) => { s.presentation = v; });
    this._chips($('#set-quality'), [['auto', 'Авто'], ['high', 'Высокое'], ['low', 'Низкое']], () => s.quality || 'auto', (v) => { s.quality = v; this.toast('Применится после перезагрузки страницы (высокое — детальные волосы и тени)'); });
    const st = $('#set-storage');
    if (st) st.textContent = UFC.storeLine(true);
  }

  renderSelect() {
    const s = this.settings;
    const fill = (id, key) => {
      const box = $(id); box.innerHTML = '';
      UFC.rosterAll().forEach((f, i) => {
        if (UFC.judoHide && UFC.judoHide(i)) return;
        const b = el('button', 'rchip' + (this.pick[key] === i ? ' on' : ''), `<b>${UFC.shortName(f)}${f.original ? ' <em class="orig">ориг.</em>' : ''}</b><span>${f.name}</span>`);
        b.addEventListener('click', () => {
          this.pick[key] = i;
          if (this.pick.p === this.pick.o) this.pick[key === 'p' ? 'o' : 'p'] = (i + 1) % UFC.rosterAll().length;
          this.renderSelect();
          this.game.showPreview(UFC.fighterCfg(this.pick[key]));
        });
        box.appendChild(b);
      });
    };
    fill('#roster-p', 'p'); fill('#roster-o', 'o');
    $('#card-p').innerHTML = this._card(UFC.fighterCfg(this.pick.p), 'p');
    $('#card-o').innerHTML = this._card(UFC.fighterCfg(this.pick.o), 'o');
    this._chips($('#opt-diff'), UFC.AI_LEVELS.map((l, i) => [i, l.name]), () => s.difficulty, (v) => (s.difficulty = v));
    this._chips($('#opt-rounds'), [[5, '5 раундов'], [3, '3 раунда'], [99, 'До конца · с рефери']], () => s.rounds, (v) => (s.rounds = v));
    this._chips($('#opt-tech'), [['', 'Обычная'], ['mcgregor', 'Макгрегор'], ['topuria', 'Топурия']], () => s.technique || '', (v) => (s.technique = v));
    this._chips($('#opt-mcg'), [[0, 'Авто'], [1, 'Уровень 1'], [2, 'Уровень 2'], [-1, 'Выкл']], () => s.mcg || 0, (v) => (s.mcg = v));
    this._chips($('#opt-len'), [[45, '45 сек'], [60, '1 мин'], [120, '2 мин'], [180, '3 мин']], () => s.roundLen, (v) => (s.roundLen = v));
    if (this.current !== 'scr-select') this.game.showPreview(UFC.fighterCfg(this.pick.p));
  }

  renderLook(key) {
    this._lookKey = key;
    const i = this.pick[key], cfg = UFC.fighterCfg(i), O = UFC.LOOK_OPTIONS;
    $('#look-title').textContent = UFC.shortName(cfg);
    const body = $('#look-body'); body.innerHTML = '';
    const cur = (k) => (k === 'build' ? cfg.build : k === 'beard' ? (cfg.look.beard === true ? 'full' : cfg.look.beard || 'none') : k === 'tattoo' ? (cfg.look.tattoo || 0) : cfg.look[k]);
    const change = (k, v) => { UFC.setLook(i, k, v); this.game.showPreview(UFC.fighterCfg(i)); this.renderLook(key); };
    const row = (label, k) => {
      const opt = el('div', 'opt', `<label>${label}</label>`);
      const box = el('div', 'chips');
      for (const o of O[k]) {
        if (Array.isArray(o)) {
          const c = el('button', 'chip' + (cur(k) === o[0] ? ' on' : ''), o[1]);
          c.addEventListener('click', () => change(k, o[0]));
          box.appendChild(c);
        } else {
          const c = el('button', 'swatch' + (cur(k) === o ? ' on' : ''), '');
          c.style.background = '#' + o.toString(16).padStart(6, '0');
          c.addEventListener('click', () => change(k, o));
          box.appendChild(c);
        }
      }
      opt.appendChild(box); body.appendChild(opt);
    };
    row('Тон кожи', 'skin'); row('Причёска', 'hairStyle'); row('Цвет волос', 'hair'); row('Борода', 'beard');
    row('Телосложение', 'build'); row('Шорты', 'shorts'); row('Кант шорт', 'shortsTrim'); row('Перчатки', 'gloves'); row('Татуировки', 'tattoo');
    this.game.showPreview(cfg);
  }

  _card(f, key) {
    const bar = (label, v) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.min(100, v)}%"></b></i><em>${v}</em></div>`;
    return `<div class="fc-top"><div class="fc-ovr">${UFC.overall(f)}</div><div><div class="fc-name">${f.name}</div><div class="fc-nick">«${f.nick}» · ${f.division || ''}${f.original ? ' · оригинальный боец' : ''}</div></div></div>
      <div class="fc-meta"><span>${Math.round(f.height * 100)} см</span><span>${f.weight} кг</span><span>Размах ${Math.round(f.reach * 100)} см</span><span>${UFC.STYLE_NAMES[f.style]}</span><span>${UFC.STANCE_NAMES[f.stance]}</span><span>Борьба ${Math.round(f.stats.wrestling)}</span><span>BJJ ${Math.round(f.stats.bjj)}</span></div>
      ${bar('Сила', f.stats.power)}${bar('Скорость', f.stats.speed)}${bar('Бокс', f.stats.boxing)}${bar('Удары ногами', f.stats.kicks)}${bar('Защита', f.stats.defense)}${bar('Подбородок', f.stats.chin)}${bar('Выносливость', f.stats.cardio)}`;
  }

  // ---------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------
  hudSetup(a, b) {
    $('#hud').classList.remove('hidden');
    $('#hn0').textContent = a.cfg.name.toUpperCase();
    $('#hn1').textContent = b.cfg.name.toUpperCase();
    $('#hk0').textContent = '«' + a.cfg.nick + '»';
    $('#hk1').textContent = '«' + b.cfg.nick + '»';
  }
  hudHide() {
    $('#hud').classList.add('hidden');
    const cv = document.getElementById('c'), eb = document.getElementById('eyeblind');
    if (cv) { cv.style.filter = ''; cv.classList.remove('woozy'); } if (eb) eb.style.opacity = 0; this._dq = null;
  }

  hudUpdate(game) {
    const fs = [game.p1, game.p2];
    fs.forEach((f, i) => {
      $('#hh' + i).style.width = f.hp + '%';
      { const fl = 100 - f.headCap; $('#hdb' + i).style.opacity = f.headShowT > 0 ? 1 : fl > 10 ? 0.55 : 0; $('#hd' + i).style.width = f.headDmg + '%'; $('#hdf' + i).style.width = fl + '%'; }
      if (i === 0) {
        { const on = f.mcgMod ? 1 : 0; if (UFC._mcgLab !== on) { UFC._mcgLab = on; if (game.touch && game.touch.refreshBinds) game.touch.refreshBinds(); } }
        { const t = $('#mcgtag'); if (!f.mcgMod) t.style.display = 'none'; else { t.style.display = 'block'; const b = f.mcgBurst > 0; t.classList.toggle('burst', b); t.textContent = b ? 'МАКГРЕГОР · КЭМП! ' + f.mcgBurst.toFixed(1) + ' с' : 'МАКГРЕГОР · УР. ' + f.mcgLvl + ' · КЭМП ЧЕРЕЗ ' + Math.max(0, 10 - f.mcgClock).toFixed(0) + ' с'; } }
        const fu = $('#fuel0'); fu.style.display = f.hasGly ? 'block' : 'none';
        if (f.hasGly) {
          $('#fgb').style.width = Math.min(100, f.gly / f.glyMax * 100) + '%'; $('#fgt').textContent = Math.round(f.gly) + '% / ' + Math.round(f.glyMax) + '%';
          $('#fab').style.width = Math.min(100, f.acid / f.acidMax * 100) + '%'; $('#fat').textContent = Math.round(f.acid / f.acidMax * 100) + '% · порог ' + Math.round(f.acidMax) + '%';
        }
      }
      $('#hpn' + i).textContent = 'HP ' + Math.ceil(f.hp * f.hpMul) + '/' + Math.round(100 * f.hpMul);
      $('#hs' + i).style.width = f.stamina + '%';
      $('#hc' + i).style.left = f.staminaCap + '%';
      const col = (v) => (v > 70 ? '#d8d2c6' : v > 45 ? '#e3a73a' : v > 20 ? '#e0602b' : '#d0242b');
      const zone = (id, bar, v) => {
        const z = $(id); if (z) z.style.fill = col(v);
        const b = $(bar); if (b) { b.style.setProperty('--v', Math.round(v) + '%'); b.style.setProperty('--c', col(v)); }
      };
      zone('#zh' + i, '#zth' + i, f.head); zone('#zb' + i, '#ztb' + i, f.bodyHp); zone('#zv' + i, '#ztv' + i, f.liver); zone('#zl' + i, '#ztl' + i, f.legs);
      $('#hf' + i).classList.toggle('rocked', f.rocked);
      $('#hf' + i).classList.toggle('flow', f.flow > 0);
      $('#hfl' + i).style.width = (f.flow > 0 ? f.flow / 7 * 100 : 0) + '%';
    });
    $('#hround').textContent = game.opts.rounds >= 99 ? 'ДО КОНЦА · РАУНД ' + game.round : 'РАУНД ' + game.round + ' / ' + game.opts.rounds;
    $('#htime').textContent = game.opts.rounds >= 99 ? UFC.fmtTime(game.clock % game.opts.roundLen) : UFC.fmtTime(Math.max(0, game.opts.roundLen - game.clock));
    const v = $('#vignette');
    const p = game.p1;
    $('#flowglow').style.opacity = p.flow > 0 ? 0.55 + Math.sin(performance.now() * 0.008) * 0.15 : 0;
    // a beaten head: blur, sway, and a swollen eye that closes one side of the picture
    {
      const cv = this._cvEl || (this._cvEl = document.getElementById('c')), eb = this._eyeEl || (this._eyeEl = document.getElementById('eyeblind'));
      const q = Math.round(p.daze * 20) / 20;
      if (q !== this._dq) { this._dq = q; cv.style.filter = q > 0.5 ? 'blur(' + (q * q * 4.5).toFixed(1) + 'px) saturate(' + (1 - q * 0.45).toFixed(2) + ') brightness(' + (1 - q * 0.15).toFixed(2) + ')' : ''; cv.classList.toggle('woozy', q > 0.7); }
      const eL = p.face ? p.face.eyeL : 0, eR = p.face ? p.face.eyeR : 0, e = Math.max(eL, eR), side = eL >= eR ? 'l' : 'r';
      const ea = e > 0.85 ? Math.min(0.7, (e - 0.85) * 4) : 0;
      if (side !== this._es) { this._es = side; eb.style.background = 'linear-gradient(to ' + (side === 'l' ? 'right' : 'left') + ', #0b0000 0%, rgba(25,0,0,0.92) 26%, rgba(70,0,0,0.5) 46%, rgba(0,0,0,0) 72%)'; }
      eb.style.opacity = ea;
    }
    v.style.opacity = p.stun > 75 ? 0.22 + Math.sin(performance.now() * 0.006) * 0.08 : p.state === 'down' ? 0.5 : (1 - p.stamina / 100) * 0.25;
  }

  // Context action prompt (ground & pound now; grappling later).
  promptUpdate(game) {
    const el = $('#prompt'), p = game.p1, tb = $('#t-gnp');
    let html = '';
    const gr = game.grapple;
    if (game.phase === 'fight' && p && gr && p.state === 'grapple') {
      const d = UFC.GRAPPLE_POS[gr.pos], top = gr.a === p;
      const label = d.name + (d.ground && !d.sub ? (top ? ' · СВЕРХУ' : ' · СНИЗУ') : '');
      let acts;
      if (gr.sub) acts = gr.sub.att === p ? 'Жми <kbd>J</kbd>/<kbd>G</kbd> — дожать' : 'Жми <kbd>J</kbd>/<kbd>G</kbd>/<kbd>Пробел</kbd> — вырваться';
      else if (!d.ground) acts = top ? '<kbd>G</kbd> ' + (gr.pos === 'clinch' ? 'к сетке/тейкдаун' : 'тейкдаун') + ' · <kbd>K</kbd> колено · <kbd>J</kbd> удар · <kbd>S</kbd> разорвать' : '<kbd>G</kbd> вырваться · <kbd>K</kbd> колено · <kbd>Пробел</kbd> защита' + (gr.pos === 'sprawl' ? ' · <kbd>H</kbd> гильотина' : '');
      else acts = top ? '<kbd>G</kbd> улучшить позицию · <kbd>J</kbd>/<kbd>I</kbd> удары · <kbd>U</kbd>+удар локоть' + (['mount', 'back', 'side'].includes(gr.pos) ? ' · <kbd>H</kbd> сабмишн' : '') : '<kbd>G</kbd> выход · <kbd>Пробел</kbd> защита · <kbd>J</kbd> удар' + (gr.pos === 'guard' ? ' · <kbd>H</kbd> треугольник' : '');
      html = '<b>' + label + '</b> · ' + acts;
    } else if (game.phase === 'fight' && p) {
      if (p.state === 'gnp') html = '<kbd>J</kbd>/<kbd>I</kbd> удары · <kbd>U</kbd>+удар — локоть · <kbd>R</kbd> — встать';
      else if (p.canGnp()) html = '<kbd>R</kbd> <span class="pad">R3</span> — ДОБИВАТЬ · или кики (<kbd>K</kbd>/<kbd>L</kbd>) — пинать лежачего';
      else if (p.canFlow()) html = '<kbd>F</kbd> <span class="pad">L1+R1</span> — FLOW: кровь пошла, включай режим';
      else if (p.canCommit()) html = '<kbd>V</kbd> — ВЛОЖИТЬСЯ: следующие 3 удара сверхтяжёлые';
    }
    if (game.counterWin) html = '<kbd>C</kbd> — КОНТРА! Жми сейчас!';
    this._grappleBars(game);
    if (html !== this._promptHtml) { el.innerHTML = html; el.classList.toggle('show', !!html); this._promptHtml = html; }
    if (tb) tb.classList.toggle('hidden', !(p && game.phase === 'fight' && (p.state === 'gnp' || p.canGnp())));
    const tf = $('#t-flow');
    if (tf) tf.classList.toggle('hidden', !(p && game.phase === 'fight' && p.canFlow()));
    const tcn = $('#t-counter'); if (tcn) tcn.classList.toggle('hidden', !game.counterWin);
    const tc = $('#t-commit');
    if (tc) {
      const on = !!(p && game.phase === 'fight' && p.technique === 'topuria');
      tc.classList.toggle('hidden', !on);
      if (on) { tc.classList.toggle('ready', p.canCommit()); tc.textContent = p.commitLeft > 0 ? 'ВЛОЖЕНО ×' + p.commitLeft : p.commitCd > 0 ? 'ВЛОЖИТЬСЯ ' + Math.ceil(p.commitCd) : 'ВЛОЖИТЬСЯ'; }
    }
    const ts = $('#t-sub'), tg = $('#t-grap');
    if (ts) ts.classList.toggle('hidden', !(gr && p && p.state === 'grapple'));
    if (tg) tg.textContent = gr && p && p.state === 'grapple' ? (gr.a === p ? 'ПОЗИЦИЯ' : 'ВЫХОД') : 'КЛИНЧ';
  }

  counterFx(on) {
    const el = $('#counterfx'); if (!el) return;
    el.classList.remove('show');
    if (on) { void el.offsetWidth; el.classList.add('show'); }
  }

  grappleAttempt(mine, againstMe, label) {
    const el = $('#gattempt');
    if (!label) { el.classList.remove('show'); return; }
    el.innerHTML = againstMe ? '<b>' + label + '</b> — жми <kbd>Пробел</kbd>/<span class="pad">R2</span> — защита!' : '<b>' + label + '</b>';
    el.classList.toggle('danger', againstMe);
    el.classList.add('show');
    clearTimeout(this._gaT); this._gaT = setTimeout(() => el.classList.remove('show'), 900);
  }

  _grappleBars(game) {
    const gr = game.grapple, box = $('#subbars');
    const on = !!(gr && gr.sub && gr.sub.tapT == null);
    box.classList.toggle('show', on);
    if (!on) return;
    $('#sb-att').style.width = Math.min(100, gr.sub.pressure) + '%';
    $('#sb-def').style.width = Math.min(100, gr.sub.escape) + '%';
    $('#sb-name').textContent = UFC.SUB_NAMES[gr.sub.kind].toUpperCase();
    $('#sb-att-n').textContent = UFC.shortName(gr.sub.att.cfg);
    $('#sb-def-n').textContent = UFC.shortName(gr.sub.def.cfg);
    // touch buttons for grappling
  }

  callout(text, sub, cls, dur = 1.6) {
    const c = $('#callout');
    c.className = 'callout show ' + (cls || '');
    c.innerHTML = `<div>${text}</div>${sub ? `<small>${sub}</small>` : ''}`;
    clearTimeout(this._calloutT);
    this._calloutT = setTimeout(() => c.classList.remove('show'), dur * 1000);
  }

  // a flash and a small screen punch on every solid hit
  impactFlash(power, zone) {
    if (power < 6) return;
    const f = this._flashEl || (this._flashEl = document.getElementById('hitflash')), c = this._cvEl || (this._cvEl = document.getElementById('c'));
    if (f) {
      f.style.transition = 'none';
      f.style.background = zone === 'head' ? 'radial-gradient(ellipse at center, rgba(255,255,255,0.85), rgba(255,215,190,0.3) 50%, rgba(255,255,255,0) 78%)' : 'radial-gradient(ellipse at center, rgba(255,120,90,0.55), rgba(255,255,255,0) 75%)';
      f.style.opacity = Math.min(0.6, 0.1 + power * 0.03);
      void f.offsetWidth; f.style.transition = 'opacity .24s ease-out'; f.style.opacity = 0;
    }
    if (c && power > 8) { c.style.setProperty('--px', (Math.random() * 10 - 5) + 'px'); c.style.setProperty('--py', (Math.random() * 8 - 4) + 'px'); c.classList.remove('punch'); void c.offsetWidth; c.classList.add('punch'); }
  }

  hitMarker(text, side) {
    const box = $('#hitlog');
    const e = el('div', 'hit ' + (side === 0 ? 'l' : 'r'), text);
    box.appendChild(e);
    setTimeout(() => e.remove(), 1400);
    while (box.children.length > 5) box.firstChild.remove();
  }

  showRoundBreak(game, cards) {
    const p = game.p1, o = game.p2;
    const rows = cards.map((c, i) => `<tr><td>Раунд ${i + 1}</td><td>${c[0]}</td><td>${c[1]}</td></tr>`).join('');
    this.callout('КОНЕЦ РАУНДА ' + game.round, `<table class="cards"><tr><th></th><th>${UFC.shortName(p.cfg)}</th><th>${UFC.shortName(o.cfg)}</th></tr>${rows}</table>`, 'break', 3.4);
  }

  showResult(game, res) {
    const p = game.p1, o = game.p2;
    const win = res.winner === p;
    const draw = !res.winner;
    const sp = p.stats, so = o.stats;
    const row = (label, a, b) => `<tr><td>${a}</td><th>${label}</th><td>${b}</td></tr>`;
    const acc = (s) => s.thrown ? Math.round(s.landed / s.thrown * 100) + '%' : '—';
    $('#result-body').innerHTML = `
      <div class="res-title ${draw ? '' : win ? 'win' : 'lose'}">${draw ? 'НИЧЬЯ' : win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}</div>
      <div class="res-method">${res.methodText}</div>
      <div class="res-names"><span>${p.cfg.name}</span><span>${o.cfg.name}</span></div>
      <table class="res-stats">
        ${row('Попыток броска', game.judoStats[0].tries, game.judoStats[1].tries)}
        ${row('Удачных бросков', game.judoStats[0].landed, game.judoStats[1].landed)}
        ${row('Ваза-ари', JUDO.score[0].waza, JUDO.score[1].waza)}
        ${row('Иппон', JUDO.score[0].ippon ? 1 : 0, JUDO.score[1].ippon ? 1 : 0)}
        ${row('Дыхание в конце', Math.round(p.stamina) + '%', Math.round(o.stamina) + '%')}
      </table>
      
      <div class="res-buttons panel-foot">${game.fightInfo && game.fightInfo.career ? '<button class="btn primary" data-act="continue">Продолжить карьеру</button>' : '<button class="btn primary" data-act="rematch">Реванш</button><button class="btn" data-act="menu">В меню</button>'}</div>`;
    this.go('scr-result', null, { reset: true });
  }
}
UFC.UI = UI;

// ---------------------------------------------------------------------------
// Touch controls: designed for thumbs, not a PS pad copy.
// ---------------------------------------------------------------------------
class TouchControls {
  constructor(input) {
    this.input = input;
    this.root = $('#touch');
    this.enabled = false;
    this.sticky = { l1: false, r1: false };
    this.binds = UFC.binds(UFC.SETTINGS);
    this._build();
    this.refreshBinds();
  }

  static isTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }

  show(v) {
    this.root.classList.toggle('hidden', !v);
    this.enabled = v;
    if (!v) { this._clear(); return; }
    // remind the player what the swipes do, then get out of the way
    const hint = $('#t-swipehint');
    if (hint) { hint.classList.remove('on'); void hint.offsetWidth; hint.classList.add('on'); }
  }

  _clear() {
    const t = this.input.touch;
    Object.keys(t).forEach((k) => (t[k] = typeof t[k] === 'number' ? 0 : false));
    this.clearMods();
    if (this._resetStick) this._resetStick();
    if (this._resetSwipe) this._resetSwipe();
    this.input.touchQ.length = 0;
  }

  // ---- bindings -----------------------------------------------------------
  refreshBinds() {
    this.binds = UFC.binds(UFC.SETTINGS);
    const mod = !!(window.__UFC__ && window.__UFC__.p1 && window.__UFC__.p1.mcgMod), MG = { cross: 'ЛОКОТЬ', lowL: 'МАЭ-ГЕРИ', lowR: 'ЁКО-ГЕРИ' };   // the McGregor mod: elbow, mae-geri, yoko-geri
    const sh = (id) => (mod && MG[id]) || (UFC.ACTIONS[id] || UFC.ACTIONS.none).short;
    for (const [slot] of UFC.BIND_SLOTS.btn) {
      const b = $('#t-' + ({ square: 'lh', triangle: 'rh', cross: 'lk', circle: 'rk' }[slot] || slot));
      if (!b) continue;
      const lab = b.querySelector('b');
      if (lab) lab.textContent = sh(this.binds.btn[slot]) || '';
    }
    const hint = $('#t-swipehint');
    if (hint) {
      const s = this.binds.swipe, n = sh;
      hint.innerHTML = '<i>СВАЙПЫ</i> ↑ ' + n(s.up) + ' · ↓ ' + n(s.down) + ' · ← ' + n(s.left) + ' · → ' + n(s.right) + ' · ↗ ' + n(s.diagUp) + ' · ↘ ' + n(s.diagDown);
    }
  }

  // run a bound action right now
  act(id, extraMods) {
    const A = UFC.ACTIONS[id];
    if (!A) return null;
    if (A.btn) { this.input.queueTouch(A.btn, Object.assign({ l1: this.sticky.l1, r1: this.sticky.r1 }, A.mods || {}, extraMods || {})); return 'strike'; }
    if (A.tap) { this.input.queueTouch(A.tap, null); return 'tap'; }
    return null;
  }

  clearMods() {
    this.sticky.l1 = this.sticky.r1 = false;
    this.input.touch.l1 = this.input.touch.r1 = false;
    ['#t-l1', '#t-r1', '#t-l2', '#t-r2'].forEach((s) => { const b = $(s); if (b) b.classList.remove('on', 'hit'); });
  }

  // a swipe over a strike button keeps the old gesture meaning: same limb,
  // direction picks the variant (up = uppercut / high, sideways = hook, down = body)
  _gestureStrike(id, dx, dy) {
    const A = UFC.ACTIONS[id];
    if (!A || !A.btn) return this.act(id);
    const kick = A.btn === 'cross' || A.btn === 'circle';
    let mods;
    if (Math.abs(dy) > Math.abs(dx)) mods = dy < 0 ? { r1: 1 } : (kick ? { l1: 1 } : { l1: 1, r1: 1 });
    else mods = { l1: 1 };
    this.input.queueTouch(A.btn, Object.assign({ l1: this.sticky.l1, r1: this.sticky.r1 }, mods));
    return 'strike';
  }

  _flash(b, cls = 'hit') { if (!b) return; b.classList.add(cls); setTimeout(() => b.classList.remove(cls), 100); }

  _build() {
    const t = this.input.touch;
    const grab = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* pointer already gone */ } };

    // ---- left joystick: movement only, never an attack
    const zone = $('#t-move'), base = $('#t-stick'), knob = $('#t-knob');
    let id = null, cx = 0, cy = 0;
    // A finger that was on the stick while the controls were hidden (walkout,
    // ceremony) never sends its pointerup; forget it so the stick never locks.
    const resetStick = () => { id = null; t.lx = t.ly = 0; knob.style.transform = ''; base.classList.remove('on'); const home = $('#t-home'); if (home) home.classList.remove('off'); };
    this._resetStick = resetStick;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null && id !== e.pointerId) resetStick();   // a stale touch never blocks a new one
      id = e.pointerId; grab(zone, id);
      cx = e.clientX; cy = e.clientY;
      base.style.left = cx + 'px'; base.style.top = cy + 'px'; base.classList.add('on');
      const home = $('#t-home'); if (home) home.classList.add('off');
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - cx, dy = e.clientY - cy, R = 55;
      const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      t.lx = M.clamp(dx / R, -1, 1); t.ly = M.clamp(-dy / R, -1, 1);
      if (Math.hypot(t.lx, t.ly) < 0.18) { t.lx = 0; t.ly = 0; }
    });
    const end = (e) => { if (e.pointerId !== id) return; resetStick(); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);

    // ---- swipe combat zone (right side, under the buttons)
    this._bindSwipes(grab);

    // ---- buttons, each one running whatever action it is bound to
    const bindButton = (sel, slot, gesture) => {
      const b = $(sel); if (!b) return;
      let pid = null, sx = 0, sy = 0, fired = false;
      const cur = () => this.binds.btn[slot] || 'none';
      b.addEventListener('pointerdown', (e) => {
        pid = e.pointerId; grab(b, pid); sx = e.clientX; sy = e.clientY; fired = false; e.preventDefault();
        const A = UFC.ACTIONS[cur()] || UFC.ACTIONS.none;
        if (A.hold) { t[A.hold] = true; b.classList.add('hit'); }
        else if (A.mod) { this.sticky[A.mod] = !this.sticky[A.mod]; t[A.mod] = this.sticky[A.mod]; b.classList.toggle('on', this.sticky[A.mod]); }
        else if (A.tap) { this.act(cur()); this._flash(b); fired = true; }
      });
      b.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid || fired || !gesture) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.hypot(dx, dy) > 26) { fired = true; this._gestureStrike(cur(), dx, dy); this._flash(b); }
      });
      b.addEventListener('pointerup', (e) => {
        if (e.pointerId !== pid) return; pid = null;
        const A = UFC.ACTIONS[cur()] || UFC.ACTIONS.none;
        if (A.hold) { t[A.hold] = false; b.classList.remove('hit'); return; }
        if (A.mod || fired) return;
        if (A.btn) { this.act(cur()); this._flash(b); }
      });
      b.addEventListener('pointercancel', (e) => {
        if (e.pointerId !== pid) return; pid = null;
        const A = UFC.ACTIONS[cur()] || UFC.ACTIONS.none;
        if (A.hold) { t[A.hold] = false; b.classList.remove('hit'); }
      });
    };
    bindButton('#t-lh', 'square', true); bindButton('#t-rh', 'triangle', true);
    bindButton('#t-lk', 'cross', true); bindButton('#t-rk', 'circle', true);
    bindButton('#t-l1', 'l1', false); bindButton('#t-r1', 'r1', false);
    bindButton('#t-l2', 'l2', false); bindButton('#t-r2', 'r2', false);

    // ---- right mini stick: slips
    const slip = $('#t-slip'); let sid = null, ox = 0, oy = 0;
    slip.addEventListener('pointerdown', (e) => { sid = e.pointerId; grab(slip, sid); ox = e.clientX; oy = e.clientY; e.preventDefault(); slip.classList.add('hit'); });
    slip.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      t.rx = M.clamp((e.clientX - ox) / 40, -1, 1); t.ry = M.clamp(-(e.clientY - oy) / 40, -1, 1);
    });
    const sEnd = (e) => { if (e.pointerId !== sid) return; sid = null; t.rx = t.ry = 0; slip.classList.remove('hit'); };
    slip.addEventListener('pointerup', sEnd); slip.addEventListener('pointercancel', sEnd);

    const tapBtn = (id2, key) => {
      const b = $(id2); if (!b) return;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.queueTouch(key, null); this._flash(b, 'hit'); });
    };
    tapBtn('#t-pause', 'start'); tapBtn('#t-gnp', 'gnp');
    tapBtn('#t-grap', 'grapple'); tapBtn('#t-td', 'td'); tapBtn('#t-sub', 'sub'); tapBtn('#t-flow', 'flow'); tapBtn('#t-commit', 'commit'); tapBtn('#t-counter', 'counter');
  }

  // Swipe attacks live in their own zone so a joystick move can never become a
  // strike. The gesture fires the moment it is recognised, not on release.
  _bindSwipes(grab) {
    const z = $('#t-swipe'); if (!z) return;
    let pid = null, sx = 0, sy = 0, t0 = 0, dx = 0, dy = 0, fired = false, timer = null, crossT = 0, px = 0, py = 0, pt = 0;
    const LONG = () => Math.min(window.innerWidth, window.innerHeight) * 0.24;
    const dirOf = (x, y) => {
      const ang = Math.atan2(-y, x) * 180 / Math.PI; // 0 = right, 90 = up
      const a = (ang + 360) % 360;
      if (a < 22.5 || a >= 337.5) return 'right';
      if (a < 67.5) return 'diagUp';
      if (a < 112.5) return 'up';
      if (a < 157.5) return 'diagUp';
      if (a < 202.5) return 'left';
      if (a < 247.5) return 'diagDown';
      if (a < 292.5) return 'down';
      return 'diagDown';
    };
    const fire = (long) => {
      if (fired) return;
      fired = true;
      if (timer) { clearTimeout(timer); timer = null; }
      const slot = long ? 'long' : dirOf(dx, dy);
      let id = this.binds.swipe[slot] || 'none';
      // a diagonal picks the near side: left half of the screen gesture = lead limb
      if ((slot === 'diagUp' || slot === 'diagDown') && dx < 0) id = UFC.mirrorAction(id);
      this.lastSwipe = { slot, id, dist: Math.round(Math.hypot(dx, dy)) };
      this.act(id);
      this._swipeFx(slot, id, sx + dx, sy + dy);
    };
    this._resetSwipe = () => { pid = null; fired = false; dx = dy = 0; if (timer) { clearTimeout(timer); timer = null; } };
    z.addEventListener('pointerdown', (e) => {
      if (pid !== null && pid !== e.pointerId) this._resetSwipe();
      pid = e.pointerId; grab(z, pid); sx = px = e.clientX; sy = py = e.clientY; dx = dy = 0; t0 = pt = performance.now(); crossT = 0; fired = false;
      e.preventDefault();
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || fired) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      const d = Math.hypot(dx, dy);
      if (d >= LONG()) { fire(true); return; }
      if (d <= 24) return;
      // A slow, deliberate swipe fires the instant it is recognised. A fast flick
      // may still be travelling, so wait while the finger keeps moving (40 ms of
      // stillness, 110 ms hard cap) and let it grow into a long swipe.
      const now = performance.now();
      const v = Math.hypot(e.clientX - px, e.clientY - py) / Math.max(1, now - pt); // speed of this sample
      px = e.clientX; py = e.clientY; pt = now;
      if (v < 0.35 && !timer) { fire(false); return; }
      if (!crossT) crossT = now;
      if (timer) clearTimeout(timer);
      const wait = Math.max(0, Math.min(40, 110 - (now - crossT)));
      timer = setTimeout(() => { timer = null; fire(Math.hypot(dx, dy) >= LONG()); }, wait);
    });
    const done = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      const d = Math.hypot(dx, dy), dt = performance.now() - t0;
      if (timer) { clearTimeout(timer); timer = null; fire(d >= LONG()); }
      else if (!fired && d < 18 && dt < 280) { const id = this.binds.swipe.tap || 'none'; this.act(id); this._swipeFx('tap', id, sx, sy); }
      fired = false; dx = dy = 0;
    };
    z.addEventListener('pointerup', done); z.addEventListener('pointercancel', done);
    z.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pid) this._resetSwipe(); });
  }

  _swipeFx(slot, id, x, y) {
    const el = $('#t-swipefx'); if (!el) return;
    const A = UFC.ACTIONS[id] || UFC.ACTIONS.none;
    if (!A.short) return;
    el.textContent = ({ up: '↑ ', down: '↓ ', left: '← ', right: '→ ', diagUp: '↗ ', diagDown: '↘ ', long: '⇒ ', tap: '' }[slot] || '') + A.short;
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
}

UFC.TouchControls = TouchControls;
})();

