//# sourceURL=ufc/careerui.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const $ = (s, r) => (r || document).querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.round(n || 0).toLocaleString('ru-RU');
const LG = () => UFC.league;
const C = () => UFC.Career;
const rec = (r) => (r ? r.w + '–' + r.l + (r.d ? '–' + r.d : '') : '');
const flagBadge = (code) => '<span class="flag">' + esc(code || '') + '</span>';
const hex = (c) => '#' + Number(c).toString(16).padStart(6, '0');

// ===========================================================================
// Career mode screens + fighter gallery + rankings. Registered as routes on
// the UI navigator, so every screen has working Back and an error state.
// ===========================================================================
UFC.screenRegistrars = UFC.screenRegistrars || [];
UFC.screenRegistrars.push((ui) => {
  const game = ui.game;
  const root = ui.root;
  const state = ui.career = { c: null, creator: null, baseLeague: null, confirmDelete: null };

  const screen = (id, cls, inner) => {
    const s = el('div', 'screen hidden ' + (cls || ''), inner);
    s.id = id; root.appendChild(s);
    return s;
  };
  const baseLeague = () => state.baseLeague || (state.baseLeague = LG().create(2026));
  const leagueFor = (p) => (p && p.career && state.c ? state.c.league : baseLeague());
  const requireCareer = () => { if (!state.c) throw new Error('Карьера не загружена. Откройте её из списка сохранений.'); return state.c; };
  const onClick = (s, map) => s.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || !s.contains(b)) return;
    const fn = map[b.dataset.act];
    if (fn) { try { const r = fn(b.dataset, b); if (r && r.catch) r.catch((err) => ui.fail(err, s.id)); } catch (err) { ui.fail(err, s.id); } }
  });
  const head = (title, extra) => '<div class="c-head"><button class="btn small" data-act="back">‹ Назад</button><h2>' + title + '</h2>' + (extra || '') + '</div>';
  const cfgOf = (f) => LG().toCfg(f);
  const statBars = (stats) => Object.keys(UFC.STAT_LABELS).map((k) => '<div class="stat"><span>' + UFC.STAT_LABELS[k] + '</span><i><b style="width:' + Math.min(100, Math.round(stats[k] || 0)) + '%"></b></i><em>' + Math.round(stats[k] || 0) + '</em></div>').join('');

  // --------------------------------------------------------------- CAREER SLOTS
  const sSlots = screen('scr-career', 'cscreen', '<div class="cwrap wide">' + head('Карьера') + '<div class="c-note" id="car-storage"></div><div class="slots" id="car-slots"></div>' +
    '<div class="c-note" id="car-backup"><b>Резервная копия</b> — на случай, если браузер очистит данные сайта или вы смените устройство.<br>' +
    '<div class="of-btns"><button class="btn small" data-act="dlall">📋 Код всех сохранений</button><button class="btn small" data-act="pickfile">📂 Код из файла…</button><button class="btn small" data-act="applycode">📥 Применить код</button><button class="btn small" data-act="applycode2">⟲ Заменить слот кодом</button></div>' +
    '<input type="file" id="car-file" accept=".txt,.ufc,text/plain" class="hidden">' +
    '<textarea id="car-code" class="txt" rows="3" placeholder="Код сохранения UFCB.… (кнопка «Код» в слоте выводит его сюда)" style="margin-top:8px;font-size:12px;width:100%;background:#16161a;border:1px solid var(--line);color:#fff;padding:8px;user-select:text;-webkit-user-select:text"></textarea></div></div>');
  onClick(sSlots, {
    back: () => ui.back(),
    new: (d) => ui.go('scr-create', { slot: +d.slot, mode: 'new' }),
    cont: (d) => {
      const c = C().load(+d.slot);
      if (!c) throw new Error('Сохранение повреждено или пусто');
      state.c = c;
      ui.go('scr-hub', null);
    },
    code: async (d) => {
      const code = await C().exportSlot(+d.slot, false), ta = $('#car-code');
      ta.value = code; ta.focus(); ta.select();
      let copied = false; try { if (navigator.clipboard) { navigator.clipboard.writeText(code).catch(() => {}); copied = true; } } catch (e) { /* ignore */ }
      ui.toast(copied ? 'Код слота скопирован (и лежит в поле ниже)' : 'Код в поле ниже — скопируйте его');
    },
    dlall: async () => {
      const code = await C().exportAll(), ta = $('#car-code'); ta.value = code; ta.focus(); ta.select();
      let copied = false; try { if (navigator.clipboard) { navigator.clipboard.writeText(code).catch(() => {}); copied = true; } } catch (e) { /* ignore */ }
      ui.toast(copied ? 'Код всех сохранений скопирован (и лежит в поле ниже). Сохраните его в заметках.' : 'Код всех сохранений в поле ниже — скопируйте и сохраните в заметках.');
    },
    pickfile: () => $('#car-file').click(),
    applycode: () => doImport(false),
    applycode2: () => doImport(true),
    del: (d) => {
      if (state.confirmDelete === +d.slot) { C().remove(+d.slot); state.confirmDelete = null; if (state.c && state.c.slot === +d.slot) state.c = null; ui.toast('Карьера удалена'); }
      else { state.confirmDelete = +d.slot; ui.toast('Нажмите «Удалить» ещё раз для подтверждения'); }
      renderSlots();
    },
  });
  async function doImport(overwrite) {
    const text = $('#car-code').value.trim();
    if (!text) { ui.toast('Сначала вставьте код или выберите файл'); return; }
    let slots;
    try { slots = await C().importBackup(text, overwrite); } catch (err) { ui.fail(err, 'scr-career'); return; }
    ui.toast(slots.length ? 'Загружено в слот ' + slots.join(', ') : 'Настройки загружены');
    $('#car-code').value = ''; renderSlots();
  }
  $('#car-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { $('#car-code').value = String(r.result || '').trim(); doImport(false); e.target.value = ''; };
    r.readAsText(f);
  });
  function renderSlots() {
    game.showPreview(null);
    { const st = UFC.store.status(); $('#car-storage').innerHTML = esc(UFC.storeLine(false)) + (st.persistent || st.idb ? '' : '<br><b>Сделайте «Резервный код» слота — это единственный способ не потерять прогресс.</b>'); }
    const box = $('#car-slots'); box.innerHTML = '';
    for (const s of C().list()) {
      if (s.empty) {
        box.appendChild(el('div', 'slot empty', '<div class="slot-n">КАРЬЕРА ' + s.slot + '</div><div class="slot-empty">' + (s.corrupt ? 'Сохранение повреждено' : 'Пустой слот') + '</div><button class="btn primary" data-act="new" data-slot="' + s.slot + '">Новая карьера</button>' + (s.corrupt ? '<button class="btn small" data-act="del" data-slot="' + s.slot + '">' + (state.confirmDelete === s.slot ? 'Точно удалить?' : 'Удалить') + '</button>' : '')));
      } else {
        const belts = (s.belts || []).map((b) => '<span class="belt-ico" title="' + UFC.divById(b).name + '">🏆</span>').join('');
        box.appendChild(el('div', 'slot', '<div class="slot-n">КАРЬЕРА ' + s.slot + '</div><div class="slot-name">' + esc(s.name) + ' ' + belts + '</div><div class="slot-nick">«' + esc(s.nick) + '»</div>' +
          '<div class="slot-kv"><span>Рекорд</span><b>' + rec(s.rec) + '</b></div><div class="slot-kv"><span>' + UFC.divById(s.div).name + '</span><b>' + LG().rankLabel(s.rank) + '</b></div>' +
          '<div class="slot-kv"><span>P4P</span><b>' + (s.p4p ? '#' + s.p4p : '—') + '</b></div><div class="slot-kv"><span>Дата</span><b>' + esc(s.date) + '</b></div><div class="slot-kv"><span>Деньги</span><b>' + money(s.money) + '</b></div>' + (s.restored ? '<div class="slot-kv"><span>Целостность</span><b class="gold">восстановлено из копии</b></div>' : '<div class="slot-kv"><span>Целостность</span><b class="good">✔ проверено</b></div>') +
          '<button class="btn primary" data-act="cont" data-slot="' + s.slot + '">Продолжить</button><button class="btn small" data-act="code" data-slot="' + s.slot + '">Код</button><button class="btn small" data-act="del" data-slot="' + s.slot + '">' + (state.confirmDelete === s.slot ? 'Точно удалить?' : 'Удалить') + '</button>'));
      }
    }
  }
  ui.route('scr-career', () => { state.confirmDelete = null; renderSlots(); });

  // --------------------------------------------------------------- FIGHTER CREATOR / EDITOR
  const sCreate = screen('scr-create', 'cscreen editor', '<div class="cwrap left">' + head('Создание бойца', '<button class="btn small" data-act="random">🎲 Случайно</button>') +
    '<div class="tabs" id="cr-tabs"></div><div class="cr-body" id="cr-body"></div><div class="cr-foot"><button class="btn primary" data-act="save" id="cr-save">Создать карьеру</button></div></div>');
  const TABS = [['profile', 'Профиль'], ['body', 'Тело'], ['face', 'Лицо'], ['hair', 'Волосы'], ['beard', 'Борода'], ['tattoo', 'Тату'], ['shorts', 'Шорты']];
  onClick(sCreate, {
    back: () => ui.back(),
    tab: (d) => { state.creator.tab = d.tab; renderCreator(); },
    random: () => { randomizeSpec(state.creator.spec); renderCreator(); previewSpec(true); },
    save: () => saveCreator(),
    tatAdd: () => { const t = state.creator.spec.look.tattoos; if (t.length < 5) t.push({ design: 'tribal', place: ['armL', 'armR', 'chest', 'back', 'forearmL', 'forearmR'].find((p) => !t.some((x) => x.place === p)) || 'armL', size: 0.85, ink: 0.85 }); renderCreator(); previewSpec(); },
    tatDel: (d) => { state.creator.spec.look.tattoos.splice(+d.i, 1); renderCreator(); previewSpec(); },
  });
  function defaultSpec() {
    return {
      name: 'Алексей Громов', nick: 'Гром', flag: 'RU', tier: 'cw', div: 'lw', style: 'boxer', stance: 'orthodox', height: 1.78, age: 24, difficulty: 1, roundLen: 45,
      body: { type: 'athletic', muscle: 0.75, arms: 0.5, shoulders: 0.55, legs: 0.5 },
      look: { skin: 0xd6a57c, eye: 0x3b2a1a, hair: 0x1a120c, hairStyle: 'fade', hairLen: 0.5, beard: 'stubble', face: { shape: 0.5, jaw: 0.55, nose: 0.5, eyes: 0.5, brows: 0.55, cheeks: 0.5 },
        tattoos: [], shorts: 0x111113, shortsTrim: 0xd4a52c, shortsStyle: 'side', motif: 'lion', motifColor: null, bandText: '', gloves: 0x121212 },
    };
  }
  function randomizeSpec(spec) {
    const r = UFC.rngFrom((Date.now() & 0xffffff) + 7);
    const g = LG().genFighter(r, spec.div, 70, 'tmp');
    spec.look = Object.assign(spec.look, g.look, { bandText: spec.look.bandText });
    spec.body = { type: r.pick(['skinny', 'lean', 'athletic', 'muscular', 'stocky', 'heavy']), muscle: +r.range(0.45, 0.95).toFixed(2), arms: +r.range(0.3, 0.8).toFixed(2), shoulders: +r.range(0.3, 0.8).toFixed(2), legs: +r.range(0.3, 0.8).toFixed(2) };
    spec.height = +r.range(1.68, 1.88).toFixed(2);
  }
  function specCfg(spec) {
    return {
      id: 'creator', name: spec.name, short: spec.name.split(' ').slice(-1)[0], nick: spec.nick, height: spec.height, weight: UFC.divById(spec.div).kg,
      reach: +(spec.height * (1.0 + spec.body.arms * 0.06)).toFixed(2), build: spec.body.muscle, body: spec.body, stance: spec.stance, style: spec.style === 'grappler' ? 'wrestler' : spec.style,
      stats: UFC.ROSTER[0].stats, look: spec.look,
    };
  }
  function previewSpec(now) {
    clearTimeout(state.previewT);
    const go = () => { try { game.showPreview(specCfg(state.creator.spec)); } catch (e) { UFC.reportError(e, 'предпросмотр бойца'); } };
    if (now) go(); else state.previewT = setTimeout(go, 140);
  }
  function saveCreator() {
    const cr = state.creator, spec = cr.spec;
    if (!spec.name.trim()) throw new Error('Введите имя бойца');
    if (cr.mode === 'edit') {
      const c = requireCareer(), me = C().player(c);
      me.look = JSON.parse(JSON.stringify(spec.look)); me.body = JSON.parse(JSON.stringify(spec.body));
      me.name = spec.name.trim(); me.nick = spec.nick.trim() || me.nick; me.short = me.name.split(' ').slice(-1)[0]; me.flag = spec.flag;
      C().save(c);
      ui.toast('Внешность бойца сохранена');
      ui.back();
      return;
    }
    const c = C().create(cr.slot, {
      name: spec.name.trim(), nick: spec.nick.trim() || 'Новичок', flag: spec.flag, tier: spec.tier || 'cw', div: spec.div, style: spec.style, stance: spec.stance, height: spec.height,
      reach: specCfg(spec).reach, build: spec.body.muscle, body: spec.body, look: spec.look, age: spec.age, difficulty: spec.difficulty, roundLen: spec.roundLen,
    });
    state.c = c;
    ui.toast(c.persisted ? 'Карьера создана и сохранена' : 'Карьера создана (сохранение в этом окне недоступно)');
    ui.go('scr-hub', null, { reset: true });
    ui.history.push({ id: 'scr-menu', params: {} }, { id: 'scr-career', params: {} });
  }
  function renderCreator() {
    const cr = state.creator, spec = cr.spec, L = spec.look;
    $('#cr-save').textContent = cr.mode === 'edit' ? 'Сохранить внешность' : 'Создать карьеру';
    $('h2', sCreate).textContent = cr.mode === 'edit' ? 'Внешность бойца' : 'Создание бойца · Карьера ' + cr.slot;
    const tabs = $('#cr-tabs'); tabs.innerHTML = '';
    for (const [id, name] of TABS) { if (cr.mode === 'edit' && id === 'profile') continue; tabs.appendChild(el('button', 'tab' + (cr.tab === id ? ' on' : ''), name)).dataset.act = 'tab'; tabs.lastChild.dataset.tab = id; }
    const body = $('#cr-body'); body.innerHTML = '';
    const opt = (label) => { const o = el('div', 'opt', '<label>' + label + '</label>'); body.appendChild(o); return o; };
    const chips = (label, options, get, set) => {
      const o = opt(label), box = el('div', 'chips'); o.appendChild(box);
      for (const [v, n] of options) {
        const b = el('button', 'chip' + (get() === v ? ' on' : ''), n);
        b.addEventListener('click', () => { set(v); renderCreator(); previewSpec(); });
        box.appendChild(b);
      }
    };
    const swatches = (label, colors, get, set) => {
      const o = opt(label), box = el('div', 'chips'); o.appendChild(box);
      for (const c of colors) {
        const v = Array.isArray(c) ? c[0] : c;
        const b = el('button', 'swatch' + (get() === v ? ' on' : ''), '');
        b.style.background = hex(v); if (Array.isArray(c)) b.title = c[1];
        b.addEventListener('click', () => { set(v); renderCreator(); previewSpec(); });
        box.appendChild(b);
      }
    };
    const slider = (label, min, max, step, get, set, fmt) => {
      const o = opt(label + ' <em class="val"></em>');
      const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = get();
      const val = $('.val', o); val.textContent = fmt ? fmt(get()) : '';
      inp.addEventListener('input', () => { set(+inp.value); val.textContent = fmt ? fmt(+inp.value) : ''; previewSpec(); });
      o.appendChild(inp);
    };
    const text = (label, get, set, max) => {
      const o = opt(label); const inp = el('input', 'txt'); inp.value = get(); inp.maxLength = max || 28;
      inp.addEventListener('input', () => set(inp.value)); o.appendChild(inp);
    };
    const pct = (v) => Math.round(v * 100) + '%';
    switch (cr.tab) {
      case 'profile':
        text('Имя и фамилия', () => spec.name, (v) => (spec.name = v));
        text('Прозвище', () => spec.nick, (v) => (spec.nick = v), 20);
        chips('Страна', LG().COUNTRIES, () => spec.flag, (v) => (spec.flag = v));
        chips('Стартовая лига', ['cw', 'aca', 'pfl'].map((t) => [t, UFC.TIERS[t].name]), () => spec.tier || 'cw', (v) => (spec.tier = v));
        opt('<b>' + UFC.TIERS[spec.tier || 'cw'].name + '</b>: ' + UFC.TIERS[spec.tier || 'cw'].blurb + '. Станьте здесь чемпионом или жёстким бойцом, и вас позовёт UFC: там соперники намного сильнее, а пояс и гонорары другого уровня.');
        chips('Дивизион', UFC.DIVISIONS.filter((d) => !d.heavy).map((d) => [d.id, d.name + ' (' + d.kg + ' кг)']), () => spec.div, (v) => (spec.div = v));
        chips('Стиль', [['boxer', 'Боксёр'], ['kickboxer', 'Кикбоксер'], ['brawler', 'Панчер']], () => spec.style, (v) => (spec.style = v));
        chips('Стойка', [['orthodox', 'Правша'], ['southpaw', 'Левша']], () => spec.stance, (v) => (spec.stance = v));
        chips('Сложность соперников', UFC.AI_LEVELS.map((l, i) => [i, l.name]), () => spec.difficulty, (v) => (spec.difficulty = v));
        chips('Длина раунда (5 раундов)', [[45, '45 сек'], [60, '1 мин'], [120, '2 мин'], [180, '3 мин']], () => spec.roundLen, (v) => (spec.roundLen = v));
        break;
      case 'body':
        slider('Рост', 1.62, 1.95, 0.01, () => spec.height, (v) => (spec.height = v), (v) => Math.round(v * 100) + ' см');
        opt('Вес: <b>' + UFC.divById(spec.div).kg + ' кг</b> — лимит дивизиона «' + UFC.divById(spec.div).name + '»');
        chips('Тип телосложения', [['skinny', 'Худой'], ['lean', 'Жилистый'], ['athletic', 'Атлетичный'], ['muscular', 'Мощный'], ['stocky', 'Плотный'], ['heavy', 'Тяжёлый']], () => spec.body.type, (v) => (spec.body.type = v));
        slider('Рельеф мышц', 0.2, 1, 0.01, () => spec.body.muscle, (v) => (spec.body.muscle = v), pct);
        slider('Руки', 0, 1, 0.01, () => spec.body.arms, (v) => (spec.body.arms = v), pct);
        slider('Плечи', 0, 1, 0.01, () => spec.body.shoulders, (v) => (spec.body.shoulders = v), pct);
        slider('Ноги', 0, 1, 0.01, () => spec.body.legs, (v) => (spec.body.legs = v), pct);
        swatches('Тон кожи', [0xf0cbad, 0xe6bd9c, 0xe2b594, 0xd6a57c, 0xc99a74, 0xb98363, 0xa8744f, 0x8a5a3c, 0x6b4430, 0x57382a], () => L.skin, (v) => (L.skin = v));
        break;
      case 'face':
        slider('Форма лица (узкое ↔ широкое)', 0, 1, 0.01, () => L.face.shape, (v) => (L.face.shape = v), pct);
        slider('Челюсть', 0, 1, 0.01, () => L.face.jaw, (v) => (L.face.jaw = v), pct);
        slider('Нос', 0, 1, 0.01, () => L.face.nose, (v) => (L.face.nose = v), pct);
        slider('Глаза', 0, 1, 0.01, () => L.face.eyes, (v) => (L.face.eyes = v), pct);
        slider('Брови', 0, 1, 0.01, () => L.face.brows, (v) => (L.face.brows = v), pct);
        slider('Скулы', 0, 1, 0.01, () => L.face.cheeks, (v) => (L.face.cheeks = v), pct);
        swatches('Цвет глаз', [0x1a1a1a, 0x24160c, 0x3b2a1a, 0x4a5a2a, 0x3b5a6e, 0x5a7a9a], () => L.eye, (v) => (L.eye = v));
        swatches('Тон кожи', [0xf0cbad, 0xe6bd9c, 0xe2b594, 0xd6a57c, 0xc99a74, 0xb98363, 0xa8744f, 0x8a5a3c, 0x6b4430, 0x57382a], () => L.skin, (v) => (L.skin = v));
        break;
      case 'hair':
        chips('Причёска', [['bald', 'Лысый'], ['buzz', 'Под машинку'], ['short', 'Короткие'], ['fade', 'Фейд'], ['curly', 'Кудри'], ['slick', 'Зачёс'], ['long', 'Длинные'], ['mohawk', 'Ирокез'], ['bun', 'Пучок']], () => L.hairStyle, (v) => (L.hairStyle = v));
        slider('Длина волос', 0, 1, 0.01, () => L.hairLen == null ? 0.5 : L.hairLen, (v) => (L.hairLen = v), pct);
        swatches('Цвет волос и бровей', [0x0e0a07, 0x1a120c, 0x2a1e16, 0x3b2a1c, 0x5a4632, 0x6b3f22, 0x9a5a2a, 0xb99a6a, 0x8d8a86], () => L.hair, (v) => (L.hair = v));
        break;
      case 'beard':
        chips('Борода', [['none', 'Чисто выбрит'], ['stubble', 'Щетина'], ['goatee', 'Эспаньолка'], ['short', 'Короткая'], ['full', 'Борода'], ['thick', 'Густая']], () => L.beard || 'none', (v) => (L.beard = v));
        swatches('Цвет', [0x0e0a07, 0x1a120c, 0x2a1e16, 0x3b2a1c, 0x5a4632, 0x6b3f22, 0x9a5a2a, 0xb99a6a, 0x8d8a86], () => L.hair, (v) => (L.hair = v));
        break;
      case 'tattoo': {
        L.tattoos = L.tattoos || [];
        opt('Татуировки рисуются прямо на коже и двигаются вместе с телом (до 5).');
        L.tattoos.forEach((t, i) => {
          const card = el('div', 'tat-card', '<div class="tat-h">Тату ' + (i + 1) + ' <button class="chip" data-act="tatDel" data-i="' + i + '">Убрать</button></div>');
          body.appendChild(card);
          const sub = (label, options, key) => {
            const o = el('div', 'opt', '<label>' + label + '</label>'); const box = el('div', 'chips'); o.appendChild(box); card.appendChild(o);
            for (const [v, n] of options) { const b = el('button', 'chip' + (t[key] === v ? ' on' : ''), n); b.addEventListener('click', () => { t[key] = v; renderCreator(); previewSpec(); }); box.appendChild(b); }
          };
          sub('Рисунок', UFC.TATTOO_DESIGNS, 'design');
          sub('Место', UFC.TATTOO_PLACES, 'place');
          const rng = (label, key, min) => { const o = el('div', 'opt', '<label>' + label + '</label>'); const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = 1; inp.step = 0.01; inp.value = t[key]; inp.addEventListener('input', () => { t[key] = +inp.value; previewSpec(); }); o.appendChild(inp); card.appendChild(o); };
          rng('Размер', 'size', 0.4); rng('Видимость (насыщенность краски)', 'ink', 0.3);
        });
        if (L.tattoos.length < 5) body.appendChild(el('button', 'btn small', '+ Добавить татуировку')).dataset.act = 'tatAdd';
        break;
      }
      case 'shorts':
        swatches('Цвет шорт', UFC.SHORTS_COLORS, () => L.shorts, (v) => (L.shorts = v));
        chips('Дизайн', UFC.SHORTS_STYLES, () => L.shortsStyle || 'classic', (v) => (L.shortsStyle = v));
        swatches('Отделка / второй цвет', [0xd4a52c, 0xf2f0ea, 0x111111, 0xc8101a, 0x1f8a4c, 0x2a6ad8, 0xe0602b, 0x9a4ad8], () => L.shortsTrim, (v) => (L.shortsTrim = v));
        chips('Мотив животного', UFC.MOTIFS, () => L.motif || null, (v) => (L.motif = v));
        swatches('Цвет мотива', [[null, 'как отделка'], 0xd4a52c, 0xf2f0ea, 0xc8101a, 0x111111], () => L.motifColor == null ? null : L.motifColor, (v) => (L.motifColor = v));
        text('Надпись на поясе (логотип)', () => L.bandText || '', (v) => { L.bandText = v; previewSpec(); }, 14);
        swatches('Перчатки', [0x121212, 0xb3121b, 0x1b2f63, 0xeeeeee, 0xd8b24a], () => L.gloves, (v) => (L.gloves = v));
        break;
      default: break;
    }
  }
  ui.route('scr-create', (p) => {
    if (!state.creator || state.creator.slot !== p.slot || state.creator.mode !== p.mode || p.mode === 'edit') {
      let spec = defaultSpec();
      if (p.mode === 'edit') {
        const me = C().player(requireCareer());
        spec = Object.assign(defaultSpec(), { name: me.name, nick: me.nick, flag: me.flag, div: me.div, style: me.styleKey || me.style, stance: me.stance, height: me.height });
        spec.body = Object.assign(spec.body, JSON.parse(JSON.stringify(me.body || {})));
        spec.look = Object.assign(spec.look, JSON.parse(JSON.stringify(me.look || {})));
        spec.look.face = Object.assign({ shape: 0.5, jaw: 0.5, nose: 0.5, eyes: 0.5, brows: 0.5, cheeks: 0.5 }, spec.look.face || {});
        spec.look.tattoos = spec.look.tattoos || [];
      }
      state.creator = { slot: p.slot, mode: p.mode || 'new', tab: p.mode === 'edit' ? 'body' : 'profile', spec };
    }
    renderCreator();
    previewSpec(true);
  }, { editor: true });

  // --------------------------------------------------------------- HUB
  const sHub = screen('scr-hub', 'cscreen editor', '<div class="cwrap left">' + head('Карьера', '<button class="btn small" data-act="save">Сохранить</button>') + '<div id="hub-body"></div></div>');
  onClick(sHub, {
    back: () => ui.back(),
    save: () => { const ok = C().save(requireCareer()); ui.toast(ok ? 'Прогресс сохранён' : 'Не удалось сохранить в этом окне'); },
    offers: () => ui.go('scr-offers'),
    camp: () => ui.go('scr-camp'),
    fight: () => startFightWeek(),
    ufcsign: () => {
      const c = requireCareer();
      if (!state.confirmUfc) { state.confirmUfc = true; ui.toast('Нажмите ещё раз, чтобы подтвердить переход в UFC'); return; }
      state.confirmUfc = false;
      try { C().signUFC(c); ui.toast('Добро пожаловать в UFC! Бонус за подпись 150 000'); } catch (e) { ui.toast(e.message); }
      ui.go('scr-hub', null, { replace: true });
    },
    recover: () => {
      const c = requireCareer();
      const r = C().recover(c);
      ui.toast('Восстановление: ' + r.weeks + ' нед. Лига провела ' + r.news.length + ' боёв.' + (r.aged ? ' Возраст: ' + r.aged + '.' : ''));
      ui.go('scr-hub', null, { replace: true });
    },
    rankings: () => ui.go('scr-rankings', { career: true, tab: C().player(requireCareer()).div }),
    p4p: () => ui.go('scr-rankings', { career: true, tab: 'p4p' }),
    legends: () => ui.go('scr-rankings', { career: true, tab: 'legends' }),
    history: () => ui.go('scr-history'),
    kos: () => ui.go('scr-kos'),
    ach: () => ui.go('scr-ach'),
    look: () => ui.go('scr-create', { mode: 'edit', slot: requireCareer().slot }),
    gym: () => { C().upgradeGym(requireCareer()); ui.toast('Зал улучшен!'); ui.go('scr-hub', null, { replace: true }); },
    opp: () => ui.go('scr-profile', { career: true, id: requireCareer().booked.opp, booked: true }),
    cancel: () => { C().cancelBooking(requireCareer()); renderHub(); },
    profile: (d) => ui.go('scr-profile', { career: true, id: d.id }),
  });
  function careerPlayerCfg(c) { const me = C().player(c); const cfg = cfgOf(me); return cfg; }
  function renderHub() {
    const c = requireCareer(), L = c.league, me = C().player(c);
    const rk = LG().rankOf(L, 'player');
    const p4p = LG().p4pPos(L, 'player');
    const div = UFC.divById(rk.div || me.div);
    const belts = (me.divTitles || []).filter((d) => L.divs[d].champ === 'player');
    game.showPreview(careerPlayerCfg(c));
    $('h2', sHub).textContent = me.name;
    const unlocked = Object.keys(c.achievements).length;
    const hp = c.health;
    let action = '';
    const ufcWhy = C().ufcEligible(c);
    if (ufcWhy) action += '<div class="ufc-offer"><b>🔥 Вас зовёт UFC!</b> ' + (ufcWhy === 'champion' ? 'Вы чемпион ' + esc(LG().tierOf(L).name) + '.' : 'Серия жёстких побед и топ-5 лиги.') + ' В UFC соперники намного сильнее, зато пояс, деньги и слава другого уровня. Чемпион малой лиги входит в топ-15 примерно с 8-го места, «жёсткий боец» с 12-го.</div><button class="btn primary big" data-act="ufcsign">Подписать контракт с UFC</button>';
    if (c.stage === 'hub') action += '<button class="btn primary big" data-act="offers">Следующий бой · предложения</button>';
    else if (c.stage === 'camp') action = '<div class="booked">' + bookedCard(c) + '</div><button class="btn primary big" data-act="camp">Тренировочный лагерь</button><button class="btn small" data-act="cancel">Отказаться от боя</button>';
    else if (c.stage === 'fightweek') action = '<div class="booked">' + bookedCard(c) + '</div><button class="btn primary big" data-act="fight">Неделя боя: взвешивание и бой</button>';
    else if (c.stage === 'recovery') action = '<div class="c-note">Восстановление после боя: <b>' + hp.injuryWeeks + ' нед.</b> Голова ' + hp.head + '%, корпус ' + hp.body + '%, ноги ' + hp.legs + '%.</div><button class="btn primary big" data-act="recover">Восстановиться</button>';
    const news = (c.news || []).slice(-6).reverse().map((n) => {
      const w = L.fighters[n.w], l = L.fighters[n.l];
      return '<li>' + (n.title ? '🏆 ' : '') + '<a data-act="profile" data-id="' + n.w + '">' + esc(w.short) + '</a> побеждает ' + esc(l.short) + ' · ' + (UFC.METHOD_NAMES[n.method] || n.method) + (n.method !== 'DEC' ? ', R' + n.round : '') + ' <em>' + UFC.divById(n.div).name + '</em></li>';
    }).join('');
    const gymNext = c.gym + 1 < C().GYM_COST.length ? '<button class="btn small" data-act="gym">Улучшить зал: ' + money(C().GYM_COST[c.gym + 1]) + '</button>' : '';
    $('#hub-body').innerHTML =
      '<div class="hub-card">' +
        '<div class="hub-top">' + flagBadge(me.flag) + ' <span class="hub-nick">«' + esc(me.nick) + '»</span> · ' + esc(div.name) + ' · <b class="tier-tag">' + esc(LG().tierOf(L).name) + '</b> · ' + (belts.length ? belts.map((b) => '<span class="gold">🏆 ЧЕМПИОН ' + esc(UFC.divById(b).name.toUpperCase()) + '</span>').join(' ') : UFC.DIVISIONS.some((d) => L.divs[d.id].interim === 'player') ? '<span class="gold">🥈 ВРЕМЕННЫЙ ЧЕМПИОН · ' + esc(LG().rankLabel(rk.rank)) + '</span>' : '<b>' + LG().rankLabel(rk.rank) + '</b>') + '</div>' +
        '<div class="hub-grid">' +
          kv('Рекорд', rec(me.rec)) + kv('KO / SUB', me.rec.ko + ' / ' + me.rec.sub) + kv('Серия', me.streak > 0 ? me.streak + ' W' : me.streak < 0 ? -me.streak + ' L' : '—') + kv('P4P', p4p ? '#' + p4p : '—') +
          kv('Деньги', money(c.money)) + kv('Зал', C().GYM_NAMES[c.gym]) + kv('Дата', LG().dateLabel(L.week)) + kv('Возраст', me.age) +
        '</div>' +
        '<div class="hub-stats">' + statBars(me.stats) + '</div>' +
      '</div>' +
      '<div class="hub-action">' + action + '</div>' +
      '<div class="hub-menu">' +
        '<button class="btn" data-act="rankings">Рейтинг дивизиона</button><button class="btn" data-act="p4p">P4P</button><button class="btn" data-act="legends">Легенды / GOAT</button>' +
        '<button class="btn" data-act="history">История боёв (' + c.history.length + ')</button><button class="btn" data-act="kos">Коллекция нокаутов (' + c.kos.length + ')</button><button class="btn" data-act="ach">Достижения ' + unlocked + '/' + UFC.ACHIEVEMENTS.length + '</button>' +
        '<button class="btn" data-act="look">Внешность бойца</button>' + gymNext +
      '</div>' +
      (news ? '<div class="hub-news"><h3>Новости лиги</h3><ul>' + news + '</ul></div>' : '');
  }
  const kv = (k, v) => '<div class="kv"><span>' + k + '</span><b>' + esc(v) + '</b></div>';
  function bookedCard(c) {
    const b = c.booked, o = c.league.fighters[b.opp];
    return '<div class="bk-title">' + (b.title ? '🏆 ' : '') + C().OFFER_LABEL[b.kind] + '</div><div class="bk-vs">vs <a data-act="opp">' + flagBadge(o.flag) + ' ' + esc(o.name) + '</a> <span class="dim">' + LG().rankLabel(b.oppRank) + ' · ' + rec(o.rec) + '</span></div>' +
      '<div class="dim">' + '5 раундов по 45 секунд · гонорар ' + money(b.purse) + (b.focus ? ' · лагерь: ' + (C().CAMP_FOCUS.find((x) => x.id === b.focus) || {}).name + (b.injured ? ' (травма)' : '') : '') + '</div>' +
      (() => { const me = C().player(c), sd = o.id + ':' + c.league.week; return '<div class="trash"><div><b>' + esc(o.short || o.name) + ':</b> «' + esc(UFC.trashTalk(me.nick || me.name, sd, 'o')) + '»</div><div><b>Вы:</b> «' + esc(UFC.trashTalk(o.short || o.name, sd, 'p')) + '»</div></div>'; })();
  }
  ui.route('scr-hub', () => renderHub(), { editor: true });

  // --------------------------------------------------------------- OFFERS
  const sOffers = screen('scr-offers', 'cscreen editor', '<div class="cwrap left">' + head('Предложения боёв') + '<div id="offers-body"></div></div>');
  onClick(sOffers, {
    back: () => ui.back(),
    accept: (d) => { const c = requireCareer(); C().book(c, +d.i); ui.toast('Бой подписан! Впереди тренировочный лагерь.'); ui.go('scr-camp', null, { replace: true }); },
    prof: (d) => ui.go('scr-profile', { career: true, id: d.id }),
    look: (d) => { const c = requireCareer(); game.showPreview(cfgOf(c.league.fighters[d.id])); },
  });
  function renderOffers() {
    const c = requireCareer(), L = c.league;
    if (c.stage !== 'hub') throw new Error('Сейчас нельзя выбрать новый бой (уже есть запланированный бой или восстановление)');
    if (!c.offers.length) c.offers = C().makeOffers(c);
    const box = $('#offers-body'); box.innerHTML = '';
    c.offers.forEach((o, i) => {
      const f = L.fighters[o.opp];
      const s = LG().strengths(f);
      const last = (f.history || []).slice(0, 3).map((h) => '<span class="res ' + h.res + '">' + h.res + '</span>').join('');
      box.appendChild(el('div', 'offer' + (o.title ? ' title' : ''),
        '<div class="of-kind">' + (o.title ? '🏆 ' : '') + C().OFFER_LABEL[o.kind] + (o.div !== C().player(c).div ? ' · ' + UFC.divById(o.div).name : '') + '</div>' +
        '<div class="of-name">' + flagBadge(f.flag) + ' ' + esc(f.name) + ' <span class="dim">«' + esc(f.nick) + '»</span></div>' +
        '<div class="of-meta">' + LG().rankLabel(o.oppRank) + ' · ' + rec(f.rec) + ' · ' + (UFC.STYLE_NAMES[f.styleKey] || UFC.STYLE_NAMES[f.style] || '') + ' · ' + Math.round(f.height * 100) + ' см · OVR ' + LG().overallOf(f) + ' ' + last + '</div>' +
        '<div class="of-sw"><span class="good">+ ' + (s.good.join(', ') || '—') + '</span><span class="bad">− ' + (s.bad.join(', ') || '—') + '</span></div>' +
        '<div class="of-foot"><b>' + 'бой до конца · гонорар ' + money(o.purse) + ' + бонус за победу</b><div><button class="btn small" data-act="look" data-id="' + o.opp + '">Модель</button> <button class="btn small" data-act="prof" data-id="' + o.opp + '">Профиль</button> <button class="btn primary small" data-act="accept" data-i="' + i + '">Принять бой</button></div></div>'));
    });
    if (c.offers[0]) game.showPreview(cfgOf(L.fighters[c.offers[0].opp]));
  }
  ui.route('scr-offers', () => renderOffers(), { editor: true });

  // --------------------------------------------------------------- CAMP
  const sCamp = screen('scr-camp', 'cscreen editor', '<div class="cwrap left">' + head('Тренировочный лагерь') + '<div id="camp-body"></div></div>');
  onClick(sCamp, {
    back: () => ui.back(),
    focus: (d) => { state.campFocus = d.id; renderCamp(); },
    inten: (d) => { state.campInt = d.id; renderCamp(); },
    run: () => {
      const c = requireCareer();
      if (!state.campFocus) throw new Error('Выберите направление подготовки');
      const r = C().runCamp(c, state.campFocus, state.campInt || 'normal');
      const g = Object.entries(r.gains).map(([k, v]) => (UFC.STAT_LABELS[k] + ' +' + v)).join(', ') + (r.injured ? '. ⚠ Травма в лагере: к бою вы подготовлены хуже' : '');
      state.campReport = '<div class="camp-report"><h3>Лагерь завершён</h3><p>' + g + '</p>' + (r.focus && r.focus.technique === 'topuria' ? '<p class="gold">Стиль Топурии экипирован на бой (челюсть подготовлена): короткие хуки, хлёсткий джеб, двойка двумя кнопками сразу и «Вложиться» (V / кнопка на экране) раз в 10 секунд. Гликоген ' + Math.round(state.c.gly) + '%, кислотный порог ' + Math.round(state.c.acid) + '%.</p>' : r.focus && r.focus.technique ? '<p class="gold">Техника Макгрегора экипирована на этот бой: стойка левши, удар левой сильнее на 30%, мини-слоумо на ошибках соперника.</p>' : '') + (r.injured ? '<p class="bad">Лёгкая травма в лагере: выносливость в бою ниже на 15%.</p>' : '<p class="good">Лагерь прошёл без травм.</p>') + '<p class="dim">Пока вы готовились, в лиге прошло ' + r.news.length + ' боёв.</p><button class="btn primary" data-act="tohub">К неделе боя</button></div>';
      renderCamp();
    },
    tohub: () => { state.campReport = null; ui.go('scr-hub', null, { replace: true }); },
  });
  function renderCamp() {
    const c = requireCareer();
    const box = $('#camp-body');
    game.showPreview(careerPlayerCfg(c));
    if (state.campReport) { box.innerHTML = state.campReport; return; }
    if (c.stage !== 'camp' || !c.booked) { box.innerHTML = '<div class="c-note">Лагерь проводится после подписания боя.</div>'; return; }
    const b = c.booked;
    const me = C().player(c);
    box.innerHTML = '<div class="booked">' + bookedCard(c) + '</div><div class="c-note">' + b.campWeeks + ' недель подготовки · ' + C().GYM_NAMES[c.gym] + ' (бонус +' + Math.round(c.gym * 18) + '%)</div>' +
      '<div class="camp-grid">' + C().CAMP_FOCUS.map((f) => '<button class="camp-card' + (state.campFocus === f.id ? ' on' : '') + '" data-act="focus" data-id="' + f.id + '"><b>' + f.name + '</b><span>' + f.desc + '</span><em>' + Object.keys(f.gains).map((k) => UFC.STAT_LABELS[k] + ' ' + Math.round(me.stats[k])).join(' · ') + '</em></button>').join('') + '</div>' +
      '<div class="opt"><label>Интенсивность</label><div class="chips">' + C().INTENSITY.map((x) => '<button class="chip' + ((state.campInt || 'normal') === x.id ? ' on' : '') + '" data-act="inten" data-id="' + x.id + '">' + x.name + (x.risk ? ' · риск травмы ' + Math.round(x.risk * 100) + '%' : '') + '</button>').join('') + '</div></div>' +
      '<div class="act-foot"><button class="btn primary big" data-act="run">Провести лагерь</button></div>';
  }
  ui.route('scr-camp', () => { state.campReport = null; renderCamp(); }, { editor: true });

  // --------------------------------------------------------------- FIGHT WEEK → WEIGH-IN → FIGHT → RESULT
  function startFightWeek() {
    const c = requireCareer();
    if (c.stage !== 'fightweek' || !c.booked) throw new Error('Бой ещё не готов: сначала подпишите бой и проведите лагерь');
    const set = C().fighterCfgs(c);
    const L = c.league, me = C().player(c), opp = L.fighters[c.booked.opp];
    const pc = set.player, oc = set.opponent;
    pc.record = me.rec; oc.record = opp.rec;
    pc.rankLabel = LG().rankLabel(LG().rankOf(L, 'player').rank); oc.rankLabel = LG().rankLabel(c.booked.oppRank);
    const divName = UFC.divById(set.div).name;
    const eventN = 300 + c.history.length + 1;
    const TN = LG().tierOf(c.league).event;
    const event = set.title ? TN + ' ' + eventN : TN + ' FIGHT NIGHT ' + (100 + c.history.length + 1);
    const champion = L.divs[set.div].champ === 'player' ? 'p1' : L.divs[set.div].champ === c.booked.opp ? 'p2' : null;
    const pres = ui.settings.presentation || 'full';
    const toFight = () => {
      state.recorded = null;
      UFC.fuel = { gly: Math.min(300, (c.gly || 75) + ((c.booked && c.booked.glyBonus) || 0)), acid: Math.min(300, (c.acid || 100) + ((c.booked && c.booked.acidBonus) || 0)) };
      game.onResultContinue = () => finishFight();
      game.startQuickFight(pc, oc, { rounds: 5, roundLen: c.rl45 || c.roundLen !== 120 ? c.roundLen : 45, difficulty: c.difficulty, tierMods: LG().tierOf(c.league) }, {
        career: true, title: set.title, interim: set.interim, tier: LG().tierOf(c.league).id, divName, event, champion, presentation: pres,
      firstBig: c.history.filter((h) => h.res === 'W' && (h.title || (h.oppRank != null && h.oppRank <= 5))).length === 0,
        p1Mods: { staminaCap: Math.round(100 * Math.min(1, set.prep)), cardioMul: Math.max(0.85, Math.min(1.08, set.prep)) },
        onFinish: (fight) => { state.lastFight = fight; autoRecord(); },
        onEnd: (fight) => { state.lastFight = fight; },
      });
    };
    const kg = (k) => +(k - M.rand(0.1, 0.6)).toFixed(1);
    const myWeight = c.booked.weighIn != null ? c.booked.weighIn : kg(pc.weight);
    if (pres === 'off') toFight();
    else game.startWeighIn(pc, oc, { title: set.title, divName, event, weights: [kg(oc.weight), myWeight], onDone: toFight });
  }
  // The result is written the moment the fight is decided (before the ceremony), so closing the tab can't lose it.
  function autoRecord() {
    const c = state.c, fight = state.lastFight;
    if (!c || !fight || !c.booked || state.recorded) return;
    try {
      if (fight.replay) fight.replay.meta = Object.assign(fight.replay.meta || {}, { type: fight.koType, oppName: c.league.fighters[c.booked.opp].name });
      state.recorded = C().recordFight(c, fight);
    } catch (e) { UFC.reportError(e, 'автосохранение боя'); }
  }
  UFC.saveCareerNow = () => { if (state.c && state.c.slot != null) C().save(state.c); };
  function finishFight() {
    const c = requireCareer();
    const fight = state.lastFight || game.lastFight;
    if (!fight) throw new Error('Нет данных о завершённом бое');
    game.onResultContinue = null;
    let summary = state.recorded; state.recorded = null;
    if (!summary) {
      if (fight.replay) fight.replay.meta = Object.assign(fight.replay.meta || {}, { type: fight.koType, oppName: c.league.fighters[c.booked.opp].name });
      summary = C().recordFight(c, fight);
    }
    state.lastFight = null;
    game.onQuit = () => { ui.go('scr-postfight', null, { reset: true }); ui.history.push({ id: 'scr-menu', params: {} }, { id: 'scr-career', params: {} }, { id: 'scr-hub', params: {} }); state.summary = summary; renderPost(); };
    state.summary = summary;
    game.quitToMenu();
  }
  ui.careerFinishFight = finishFight;

  // --------------------------------------------------------------- POST-FIGHT SUMMARY
  const sPost = screen('scr-postfight', 'cscreen dim', '<div class="cwrap">' + '<div class="c-head"><h2>Итоги боя</h2><button class="btn primary" data-act="next">Далее ›</button></div>' + '<div id="post-body"></div><div class="post-foot"><button class="btn primary" data-act="next">Далее: восстановление ›</button></div></div>');
  onClick(sPost, { next: () => ui.go('scr-hub', null, { replace: true }) });
  function renderPost() {
    const s = state.summary || (state.c && state.c.lastSummary);
    const box = $('#post-body');
    if (!s) { box.innerHTML = '<div class="c-note">Нет данных о последнем бое.</div>'; return; }
    game.showPreview(null);
    const rk = (r) => LG().rankLabel(r ? r.rank : null);
    const title = s.draw ? 'НИЧЬЯ' : s.won ? (s.titleWon ? 'ЧЕМПИОН!' : 'ПОБЕДА') : 'ПОРАЖЕНИЕ';
    const moved = s.before.rank.rank !== s.after.rank.rank;
    box.innerHTML = '<div class="post-title ' + (s.won ? 'win' : s.draw ? '' : 'lose') + '">' + title + '</div>' +
      '<div class="post-method">' + esc(s.methodText || UFC.METHOD_NAMES[s.method]) + ' · против ' + esc(s.oppName) + '</div>' +
      (s.ko && s.ko.thumb ? '<div class="post-ko"><img src="' + s.ko.thumb + '" alt=""><div><b>' + esc(s.ko.type) + '</b><br>Добавлен в коллекцию нокаутов</div></div>' : '') +
      '<div class="hub-grid">' +
        kv('Рейтинг', rk(s.before.rank) + ' → ' + rk(s.after.rank)) + kv('P4P', (s.before.p4p ? '#' + s.before.p4p : '—') + ' → ' + (s.after.p4p ? '#' + s.after.p4p : '—')) +
        (s.after.goat ? kv('Наследие (GOAT)', '#' + (s.before.goat || '—') + ' → #' + s.after.goat) : '') +
        kv('Гонорар', money(s.purse)) + kv('Бонус за победу', money(s.winBonus)) + kv('Бонус за финиш', money(s.perf)) + kv('Итого', money(s.earned)) +
      '</div>' +
      (moved ? '<div class="c-note">' + (s.after.rank.rank != null && (s.before.rank.rank == null || s.after.rank.rank < s.before.rank.rank) ? '📈 Вы поднялись в рейтинге!' : '📉 Рейтинг снизился.') + '</div>' : '') +
      (s.unlocked && s.unlocked.length ? '<h3>Новые достижения</h3><div class="ach-grid">' + s.unlocked.map((a) => '<div class="ach on"><i>' + a.icon + '</i><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span></div>').join('') + '</div>' : '') +
      (state.c ? '<div class="c-note">Впереди восстановление: ' + state.c.health.injuryWeeks + ' нед.' + (s.won ? '' : ' Карьера продолжается — поражение записано, рейтинг обновлён.') + '</div>' : '');
  }
  ui.route('scr-postfight', () => renderPost(), { onBack: () => { ui.go('scr-hub', null, { replace: true }); return false; } });

  // --------------------------------------------------------------- RANKINGS / P4P / LEGENDS
  const sRank = screen('scr-rankings', 'cscreen', '<div class="cwrap wide">' + head('Рейтинги') + '<div class="tabs" id="rk-tabs"></div><div class="c-note small" id="rk-note"></div><div id="rk-body"></div></div>');
  onClick(sRank, {
    back: () => ui.back(),
    rtab: (d) => { ui.params.tab = d.tab; renderRank(ui.params); },
    prof: (d) => ui.go('scr-profile', { career: ui.params.career, id: d.id }),
  });
  function renderRank(p) {
    game.showPreview(null);
    const L = leagueFor(p);
    const tab = p.tab || 'lw';
    const tabs = $('#rk-tabs'); tabs.innerHTML = '';
    for (const [id, n] of [...UFC.DIVISIONS.map((d) => [d.id, d.name]), ['p4p', 'P4P'], ['legends', 'Легенды / GOAT']]) {
      const b = el('button', 'tab' + (tab === id ? ' on' : ''), n); b.dataset.act = 'rtab'; b.dataset.tab = id; tabs.appendChild(b);
    }
    $('#rk-note').textContent = (p.career && state.c ? 'Рейтинги вашей карьеры · ' + LG().dateLabel(L.week) : 'Стартовые рейтинги лиги') + ' · Реальные бойцы — игровые данные по состоянию на 2025 г. (обновляются в LEAGUE_DATA), остальные — оригинальные персонажи.';
    const row = (pos, f, extra) => '<tr class="' + (f.id === 'player' ? 'me' : '') + '" data-act="prof" data-id="' + f.id + '"><td class="pos">' + pos + '</td><td>' + flagBadge(f.flag) + '</td><td class="nm">' + esc(f.name) + (f.real ? '' : f.id === 'player' ? ' <em class="tag">ВЫ</em>' : '') + '<small>«' + esc(f.nick) + '»</small></td><td>' + rec(f.rec) + '</td>' + extra + '</tr>';
    let html = '';
    if (tab === 'p4p') {
      html = '<table class="rk"><thead><tr><th>#</th><th></th><th>Боец</th><th>Рекорд</th><th>Дивизион</th><th>Очки</th></tr></thead><tbody>' +
        LG().p4pList(L).map((x) => row(x.pos, x.f, '<td>' + UFC.divById(LG().rankOf(L, x.id).div).name + ' ' + LG().rankLabel(LG().rankOf(L, x.id).rank) + '</td><td>' + x.score + '</td>')).join('') + '</tbody></table>';
      if (L.fighters.player && !LG().p4pList(L).some((x) => x.id === 'player')) html += '<div class="c-note">Вас пока нет в P4P: нужны победы над рейтинговыми соперниками, серия и титулы.</div>';
    } else if (tab === 'legends') {
      // the ten greatest of all time, legends and active fighters on one scale
      const top = LG().goatList(L, 10);
      html = '<table class="rk"><thead><tr><th>#</th><th></th><th>Боец</th><th>Рекорд</th><th>Чем велик</th><th>Очки</th></tr></thead><tbody>' +
        top.map((x) => { const why = LG().legacyWhy(L, x.f); return row(x.pos, x.f, '<td>' + esc(why.text || why.main) + (x.f.era ? '<small>' + esc(x.f.era) + '</small>' : x.f.legend ? '' : '<small>действующий</small>') + '</td><td><b>' + x.score + '</b></td>'); }).join('') + '</tbody></table>';
      const me = L.fighters.player;
      if (me) {
        const pos = LG().goatPos(L, 'player'), mine = LG().goatScore(me, L);
        const tenth = top.length >= 10 ? top[9].score : 0;
        const myDef = me.totalDefenses || 0, myReign = LG().reignOf(L, me);
        html += '<div class="c-note small">Чтобы стать №1 в истории, нужно <b>20 защит пояса</b> и <b>5 лет на троне</b>. У вас: ' + myDef + ' защит, ' + (myReign / 52).toFixed(1) + ' г. на троне.</div>';
        html += '<div class="c-note">' + (pos <= 10 ? 'Вы в десятке величайших: #' + pos + ' (' + mine + ' очков).' :
          'Ваше наследие: ' + mine + ' очков, место #' + pos + '. До десятки — ' + Math.max(1, tenth - mine + 1) + ' очков: титулы, защиты, долгое правление, победы над чемпионами и P4P №1.') + '</div>';
      }
    } else {
      html = '<table class="rk"><thead><tr><th>#</th><th></th><th>Боец</th><th>Рекорд</th><th>Серия</th><th>Стиль</th></tr></thead><tbody>' +
        LG().divTable(L, tab).map((x) => row(x.rank === 0 ? '🏆' : x.rank, x.f, '<td>' + (x.f.streak > 0 ? x.f.streak + 'W' : x.f.streak < 0 ? -x.f.streak + 'L' : '—') + '</td><td>' + (UFC.STYLE_NAMES[x.f.styleKey] || UFC.STYLE_NAMES[x.f.style] || '') + '</td>')).join('') + '</tbody></table>';
      const pr = LG().rankOf(L, 'player');
      if (L.fighters.player && pr.div === tab && pr.rank == null) html += '<div class="c-note">Вы вне Топ-15 этого дивизиона. Побеждайте, чтобы войти в рейтинг.</div>';
    }
    $('#rk-body').innerHTML = html;
  }
  ui.route('scr-rankings', (p) => renderRank(p));

  // --------------------------------------------------------------- FIGHTER PROFILE
  const sProf = screen('scr-profile', 'cscreen editor', '<div class="cwrap left">' + head('Профиль бойца') + '<div id="prof-body"></div></div>');
  onClick(sProf, {
    back: () => ui.back(),
    shorts: (d) => {
      const c = requireCareer(); const b = c.booked;
      b.oppLook = Object.assign(b.oppLook || {}, { [d.k]: d.v === 'null' ? null : isNaN(+d.v) ? d.v : +d.v });
      C().save(c); renderProfile(ui.params);
    },
    shortsReset: () => { const c = requireCareer(); c.booked.oppLook = null; C().save(c); renderProfile(ui.params); },
    pickMe: () => { ui.quickPick('p', ui.params); },
    pickOpp: () => { ui.quickPick('o', ui.params); },
  });
  function findFighter(p) {
    const L = leagueFor(p);
    return L.fighters[p.id] || null;
  }
  function renderProfile(p) {
    const f = findFighter(p);
    if (!f) throw new Error('Боец не найден');
    const L = leagueFor(p);
    const cfg = cfgOf(f);
    const booked = p.booked && state.c && state.c.booked && state.c.booked.opp === f.id;
    if (booked && state.c.booked.oppLook) cfg.look = Object.assign({}, cfg.look, state.c.booked.oppLook);
    game.showPreview(cfg);
    const rk = LG().rankOf(L, f.id);
    const s = LG().strengths(f);
    const hist = (f.history || []).slice(0, 8).map((h) => '<tr><td class="res ' + h.res + '">' + h.res + '</td><td>' + esc(h.oppName) + '</td><td>' + (UFC.METHOD_NAMES[h.method] || h.method) + '</td><td>' + (h.method !== 'DEC' && h.round ? 'R' + h.round + ' ' + (h.time || '') : '') + '</td><td>' + (h.title ? '🏆' : '') + '</td></tr>').join('');
    let shortsEdit = '';
    if (booked) {
      const cur = cfg.look;
      const sw = (k, list) => list.map((c) => { const v = Array.isArray(c) ? c[0] : c; return '<button class="swatch' + (cur[k] === v ? ' on' : '') + '" style="background:' + hex(v) + '" data-act="shorts" data-k="' + k + '" data-v="' + v + '"></button>'; }).join('');
      const ch = (k, list) => list.map(([v, n]) => '<button class="chip' + ((cur[k] || null) === v ? ' on' : '') + '" data-act="shorts" data-k="' + k + '" data-v="' + v + '">' + n + '</button>').join('');
      shortsEdit = '<div class="tat-card"><div class="tat-h">Экипировка соперника (только шорты)</div><div class="opt"><label>Цвет</label><div class="chips">' + sw('shorts', UFC.SHORTS_COLORS) + '</div></div><div class="opt"><label>Дизайн</label><div class="chips">' + ch('shortsStyle', UFC.SHORTS_STYLES) + '</div></div><div class="opt"><label>Мотив</label><div class="chips">' + ch('motif', UFC.MOTIFS) + '</div></div><button class="btn small" data-act="shortsReset">Вернуть как было</button></div>';
    }
    $('#prof-body').innerHTML = '<div class="prof-name">' + flagBadge(f.flag) + ' ' + esc(f.name) + '</div><div class="dim">«' + esc(f.nick) + '» · ' + (f.legend ? 'Легенда · ' + esc(f.era || '') : UFC.divById(rk.div || f.div).name + ' · ' + LG().rankLabel(rk.rank)) + (f.real ? ' · реальный боец (игровые данные)' : f.id === 'player' ? '' : ' · оригинальный персонаж') + '</div>' +
      '<div class="hub-grid">' + kv('Рекорд', rec(f.rec)) + kv('KO / SUB', (f.rec.ko || 0) + ' / ' + (f.rec.sub || 0)) + kv('Рост', Math.round(f.height * 100) + ' см') + kv('Размах', Math.round(f.reach * 100) + ' см') + kv('Стиль', UFC.STYLE_NAMES[f.styleKey] || UFC.STYLE_NAMES[f.style] || '') + kv('Стойка', UFC.STANCE_NAMES[f.stance]) + kv('Возраст', f.age || '—') + kv('OVR', LG().overallOf(f)) + '</div>' +
      (f.note ? '<div class="c-note">' + esc(f.note) + '</div>' : '') +
      '<div class="of-sw"><span class="good">Сильные стороны: ' + (s.good.join(', ') || '—') + '</span><span class="bad">Слабые стороны: ' + (s.bad.join(', ') || '—') + '</span></div>' +
      '<div class="hub-stats">' + statBars(f.stats) + '</div>' + shortsEdit +
      (hist ? '<h3>История боёв</h3><table class="rk small">' + hist + '</table>' : '') +
      (!p.career ? '<div class="cr-foot"><button class="btn" data-act="pickMe">Играть за него</button><button class="btn primary" data-act="pickOpp">Выбрать соперником</button></div>' : '');
  }
  ui.route('scr-profile', (p) => renderProfile(p), { editor: true });

  // --------------------------------------------------------------- HISTORY
  const sHist = screen('scr-history', 'cscreen', '<div class="cwrap wide">' + head('История боёв') + '<div id="hist-body"></div></div>');
  onClick(sHist, { back: () => ui.back(), row: (d, b) => { b.classList.toggle('open'); } });
  ui.route('scr-history', () => {
    game.showPreview(null);
    const c = requireCareer();
    const box = $('#hist-body');
    if (!c.history.length) { box.innerHTML = '<div class="c-note">Боёв пока не было.</div>'; return; }
    box.innerHTML = '<table class="rk hist"><thead><tr><th>#</th><th>Дата</th><th>Соперник</th><th>Итог</th><th>Метод</th><th>Раунд</th><th>Рейтинг</th></tr></thead><tbody>' +
      c.history.map((h) => '<tr data-act="row"><td>' + h.n + '</td><td>' + esc(h.date) + '</td><td>' + esc(h.oppName) + (h.title ? ' 🏆' : '') + '<small>' + LG().rankLabel(h.oppRank) + ' · ' + UFC.divById(h.div).name + '</small></td><td class="res ' + h.res + '">' + ({ W: 'Победа', L: 'Поражение', D: 'Ничья' }[h.res]) + '</td><td>' + esc(UFC.METHOD_NAMES[h.method] || h.method) + (h.detail ? '<small>' + esc(h.detail) + '</small>' : '') + '</td><td>' + (h.round || '') + ' · ' + esc(h.time || '') + '</td><td>' + LG().rankLabel(h.rankBefore) + ' → ' + LG().rankLabel(h.rankAfter) + '</td></tr>' +
        '<tr class="det"><td colspan="7">Нокдауны ' + h.kd[0] + '–' + h.kd[1] + ' · Тейкдауны ' + h.td[0] + '–' + h.td[1] + ' · Значимые удары ' + h.sig[0] + '–' + h.sig[1] + ' · Всего ударов ' + h.landed[0] + '–' + h.landed[1] + ' · Сабмишны ' + h.subs + ' · Урон ' + h.damage + ' · Заработано ' + money(h.purse) + ' · P4P ' + (h.p4pBefore || '—') + ' → ' + (h.p4pAfter || '—') + '</td></tr>').join('') + '</tbody></table>';
  });

  // --------------------------------------------------------------- KNOCKOUT COLLECTION
  const sKo = screen('scr-kos', 'cscreen', '<div class="cwrap wide">' + head('Коллекция нокаутов') + '<div id="ko-body"></div></div>');
  onClick(sKo, {
    back: () => ui.back(),
    play: (d) => {
      const c = requireCareer();
      const clip = C().loadReplay(c, d.id);
      if (!clip) throw new Error('Повтор этого нокаута не сохранился (место в браузере ограничено)');
      const k = c.kos.find((x) => x.id === d.id);
      clip.meta = Object.assign(clip.meta || {}, { type: k.type, oppName: k.oppName, round: k.round, time: k.time });
      const hist = ui.history.slice();
      game.playReplay(clip, () => { ui.history.length = 0; ui.history.push(...hist); ui.go('scr-kos', null, { replace: true }); });
    },
  });
  ui.route('scr-kos', () => {
    game.showPreview(null);
    const c = requireCareer();
    const box = $('#ko-body');
    if (!c.kos.length) { box.innerHTML = '<div class="c-note">Нокаутов пока нет. Здесь будут ваши лучшие нокауты с повторами.</div>'; return; }
    box.innerHTML = '<div class="ko-grid">' + c.kos.map((k) => '<div class="ko-card">' + (k.thumb ? '<img src="' + k.thumb + '" alt="">' : '<div class="ko-noimg">KO</div>') +
      '<div class="ko-type">' + esc(k.type) + '</div><div class="dim">vs ' + esc(k.oppName) + (k.title ? ' · 🏆 титульный бой' : '') + '</div><div class="dim">' + (UFC.METHOD_NAMES[k.method] || k.method) + ' · R' + k.round + ' ' + esc(k.time) + ' · ' + esc(k.date) + '</div>' +
      (k.hasReplay ? '<button class="btn small" data-act="play" data-id="' + k.id + '">▶ Смотреть повтор</button>' : '<div class="dim small">повтор недоступен</div>') + '</div>').join('') + '</div>';
  });

  // --------------------------------------------------------------- ACHIEVEMENTS
  const sAch = screen('scr-ach', 'cscreen', '<div class="cwrap wide">' + head('Достижения') + '<div id="ach-body"></div></div>');
  onClick(sAch, { back: () => ui.back() });
  ui.route('scr-ach', () => {
    game.showPreview(null);
    const c = requireCareer();
    const got = c.achievements;
    const n = Object.keys(got).length;
    $('#ach-body').innerHTML = '<div class="c-note">Открыто ' + n + ' из ' + UFC.ACHIEVEMENTS.length + '</div><div class="ach-grid">' + UFC.ACHIEVEMENTS.map((a) => '<div class="ach' + (got[a.id] ? ' on' : '') + '"><i>' + a.icon + '</i><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span>' + (got[a.id] ? '<em>' + esc(got[a.id].date) + '</em>' : '<em>🔒</em>') + '</div>').join('') + '</div>';
  });

  // --------------------------------------------------------------- FIGHTER GALLERY (main menu "Выбор бойца")
  const sFighters = screen('scr-fighters', 'cscreen', '<div class="cwrap wide">' + head('Выбор бойца') + '<div class="tabs" id="fg-tabs"></div><div class="fg-grid" id="fg-body"></div></div>');
  onClick(sFighters, {
    back: () => ui.back(),
    ftab: (d) => { ui.params.tab = d.tab; renderFighters(ui.params); },
    open: (d) => ui.go('scr-profile', { id: d.id }),
  });
  function renderFighters(p) {
    game.showPreview(null);
    const L = baseLeague();
    const tab = p.tab || 'real';
    const tabs = $('#fg-tabs'); tabs.innerHTML = '';
    for (const [id, n] of [['real', 'Звёзды'], ...UFC.DIVISIONS.map((d) => [d.id, d.name]), ['legends', 'Легенды']]) { const b = el('button', 'tab' + (tab === id ? ' on' : ''), n); b.dataset.act = 'ftab'; b.dataset.tab = id; tabs.appendChild(b); }
    let list;
    if (tab === 'real') list = Object.values(L.fighters).filter((f) => f.real || UFC.ROSTER.some((r) => r.id === f.id));
    else if (tab === 'legends') list = L.legends.map((id) => L.fighters[id]);
    else list = LG().divTable(L, tab).map((x) => x.f);
    $('#fg-body').innerHTML = list.map((f) => { const rk = LG().rankOf(L, f.id); return '<button class="fg-card" data-act="open" data-id="' + f.id + '">' + flagBadge(f.flag) + '<b>' + esc(f.name) + '</b><span>«' + esc(f.nick) + '»</span><em>' + (f.legend ? 'Легенда' : UFC.divById(rk.div || f.div).name + ' · ' + LG().rankLabel(rk.rank)) + ' · ' + rec(f.rec) + ' · OVR ' + LG().overallOf(f) + '</em></button>'; }).join('');
  }
  ui.route('scr-fighters', (p) => renderFighters(p));

  // main menu: quick "continue career" entry for the most recent save
  const prevMenu = ui.routes['scr-menu'];
  ui.route('scr-menu', () => {
    if (prevMenu && prevMenu.render) prevMenu.render();
    const box = document.querySelector('#scr-menu .menu-buttons');
    let btn = document.getElementById('menu-continue');
    const saves = C().list().filter((s) => !s.empty).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!saves.length) { if (btn) btn.remove(); return; }
    const s = saves[0];
    if (!btn) {
      btn = el('button', 'btn primary', '');
      btn.id = 'menu-continue';
      btn.addEventListener('click', () => {
        try {
          const c = C().load(s.slot);
          if (!c) throw new Error('Сохранение повреждено');
          state.c = c; ui.go('scr-hub');
        } catch (e) { ui.fail(e, 'scr-menu'); }
      });
      box.insertBefore(btn, box.firstChild);
    }
    btn.innerHTML = 'Продолжить карьеру <em class="dim">' + esc(s.name) + ' · ' + rec(s.rec) + ' · ' + LG().rankLabel(s.rank) + '</em>';
  }, { onBack: () => false });

  // chosen in the gallery -> quick fight select
  ui.quickPick = (key, p) => {
    const f = findFighter(p);
    if (!f) throw new Error('Боец не найден');
    const cfg = cfgOf(f);
    let idx = UFC.ROSTER.findIndex((r) => r.id === f.id);
    if (idx < 0) {
      UFC.EXTRA_ROSTER = UFC.EXTRA_ROSTER || [];
      let j = UFC.EXTRA_ROSTER.findIndex((r) => r.id === f.id);
      if (j < 0) { UFC.EXTRA_ROSTER.push(Object.assign(cfg, { division: UFC.divById(f.div).name, original: true })); j = UFC.EXTRA_ROSTER.length - 1; }
      idx = UFC.ROSTER.length + j;
    }
    ui.pick[key] = idx;
    if (ui.pick.p === ui.pick.o) ui.pick[key === 'p' ? 'o' : 'p'] = (idx + 1) % UFC.ROSTER.length;
    ui.toast(key === 'p' ? 'Вы играете за: ' + f.name : 'Соперник: ' + f.name);
    ui.go('scr-select');
  };
});
})();

