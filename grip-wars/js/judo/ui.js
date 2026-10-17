//# sourceURL=judo/ui.js
// Judo: the menus. The tournament, the weight class (60 / 66 / 73 kg), the kimono and the name on its back, the two trained throws.
(function () {
'use strict';
const UFC = window.UFC;
const J = window.JUDO;
const M = UFC.M;

// who fights in which weight class (the ready-made fighters of the roster, refitted to the class)
J.CLASSES = {
  60: [0, 4, 2, 8, 14, 7, 9, 10],
  66: [1, 3, 5, 6, 13, 12, 15, 26, 28],
  73: [20, 21, 23, 29, 16, 17, 19, 11, 24, 27],
};
J.CLASS_H = { 60: 1.65, 66: 1.71, 73: 1.77 };
J.opt = { venue: 'worlds', kg: 60, gi: 'white', name: '', roundLen: 40 };
const classOf = (i) => { for (const k of [60, 66, 73]) if (J.CLASSES[k].includes(i)) return k; return 66; };
J.classOf = classOf;
UFC.judoHide = (i) => !J.CLASSES[J.opt.kg].includes(i);

// a fighter refitted to a weight class: the class weight, the height of the class, a lean sports build
const origCfg = UFC.fighterCfg;
UFC.fighterCfg = function (i) {
  const c = origCfg.apply(this, arguments);
  const kg = classOf(i);
  const base = J.CLASS_H[kg];
  const out = Object.assign({}, c, {
    weight: kg, height: +(base + M.clamp((c.height - 1.78) * 0.3, -0.04, 0.05)).toFixed(2), division: kg + ' кг', gi: 'white',
    body: Object.assign({}, c.body || {}, { type: 'athletic', muscle: Math.min(0.85, (c.body && c.body.muscle) || 0.7) }),
  });
  out.reach = +(out.height * 1.02).toFixed(2);
  const FAV = { boxer: ['podsechka', 'zacep', 'skolen', 'plecho'], kickboxer: ['otkhvat', 'podsechka', 'zacep', 'podhvat'], brawler: ['podhvat', 'otkhvat', 'bedro', 'spina'], wrestler: ['plecho', 'spina', 'pistol', 'bedro', 'tomoe'] }[c.style] || ['podhvat', 'plecho'];
  const TR = ['counter', 'grip', 'power', 'tech', 'cardio'];
  out.fav = [FAV[i % FAV.length], J.TECH_ORDER[(i * 7 + 3) % J.TECH_ORDER.length]]; out.trait = TR[(i * 3 + 1) % TR.length];
  return out;
};

const css = document.createElement('style');
css.textContent = `
.opt:has(#opt-rounds), .opt:has(#opt-tech), .opt:has(#opt-mcg), .look-btn { display: none !important; }
.menu-buttons [data-act="career"], .menu-buttons [data-act="fighters"], .menu-buttons [data-act="rankings"] { display: none !important; }
#jopts { display: flex; flex-direction: column; gap: 8px; width: 100%; }
#jopts .opt { margin: 0; }
#jopts input { font: 600 15px system-ui, sans-serif; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line, #444); background: rgba(255,255,255,.07); color: inherit; width: 220px; max-width: 100%; }
.jtech { display: flex; flex-wrap: wrap; gap: 6px; }
.jtech .chip small { display: block; opacity: .6; font-size: 10px; font-weight: 500; }
.jhint { opacity: .75; font-size: 12px; }
`;
document.head.appendChild(css);

const $ = (s) => document.querySelector(s);
function jopts() {
  const ui = window.__UFC__.ui;
  let box = $('#jopts');
  const opts = $('#scr-select .select-opts');
  if (!box) { box = document.createElement('div'); box.id = 'jopts'; opts.parentNode.insertBefore(box, opts); }
  box.innerHTML = '';
  const row = (label) => { const o = document.createElement('div'); o.className = 'opt'; o.innerHTML = '<label>' + label + '</label>'; box.appendChild(o); return o; };
  const chips = (parent, list, get, set) => {
    const c = document.createElement('div'); c.className = 'chips'; parent.appendChild(c);
    const draw = () => { c.innerHTML = ''; for (const [v, t] of list) { const b = document.createElement('button'); b.className = 'chip' + (get() === v ? ' on' : ''); b.textContent = t; b.addEventListener('click', () => { set(v); draw(); }); c.appendChild(b); } };
    draw(); return c;
  };
  chips(row('Турнир'), Object.values(J.EVENTS).map((e) => [e.id, e.name]), () => J.opt.venue, (v) => { J.opt.venue = v; J.setVenue(v); ui.game.showPreview && 0; });
  chips(row('Весовая категория'), [[60, '60 кг'], [66, '66 кг'], [73, '73 кг']], () => J.opt.kg, (v) => {
    J.opt.kg = v; const L = J.CLASSES[v]; ui.pick.p = L[0]; ui.pick.o = L[1]; ui.renderSelect(); ui.game.showPreview(UFC.fighterCfg(ui.pick.p));
  });
  const giRow = row('Кимоно и имя на спине');
  chips(giRow, [['white', 'Белое'], ['blue', 'Синее']], () => J.opt.gi, (v) => { J.opt.gi = v; });
  const inp = document.createElement('input'); inp.id = 'j-name'; inp.type = 'text'; inp.maxLength = 14; inp.placeholder = 'Имя на спине'; inp.value = J.opt.name;
  inp.addEventListener('input', () => { J.opt.name = inp.value; });
  giRow.appendChild(inp);
  // the five throws on the buttons: pick a button, then a throw for it
  const tr = row('Ваши приёмы на кнопках (выберите кнопку, потом приём)');
  const slots = document.createElement('div'); slots.className = 'jtech'; tr.appendChild(slots);
  const t = document.createElement('div'); t.className = 'jtech'; tr.appendChild(t);
  J._slot = J._slot || 0;
  const drawT = () => {
    slots.innerHTML = ''; t.innerHTML = '';
    J.loadout.forEach((id, k) => {
      const b = document.createElement('button'); b.className = 'chip' + (J._slot === k ? ' on' : '');
      b.innerHTML = J.SLOT_NAMES[k] + ' ' + J.TECHS[id].name + '<small>кнопка ' + J.SLOT_NAMES[k] + '</small>';
      b.addEventListener('click', () => { J._slot = k; drawT(); });
      slots.appendChild(b);
    });
    for (const id of J.TECH_ORDER) {
      const b = document.createElement('button'); b.className = 'chip' + (J.loadout[J._slot] === id ? ' on' : '');
      b.innerHTML = J.TECHS[id].name + '<small>' + J.TECHS[id].jp + '</small>';
      b.addEventListener('click', () => { const k = J.loadout.indexOf(id); if (k >= 0) J.loadout[k] = J.loadout[J._slot]; J.loadout[J._slot] = id; J.relabel(); J.saveLoadout && J.saveLoadout(); drawT(); });
      t.appendChild(b);
    }
  };
  drawT();
  const h = document.createElement('div'); h.className = 'jhint'; h.textContent = 'L2 — взять захват, L1 — сбросить захват соперника, R1 — толчок (выводит назад, а когда он упирается — вперёд).';
  tr.appendChild(h);
}

function patchUI() {
  const g = window.__UFC__;
  if (!g || !g.ui) { setTimeout(patchUI, 120); return; }
  const ui = g.ui;
  // the menu
  const logo = $('#scr-menu .logo'); if (logo) logo.innerHTML = '<span>ДЗЮДО</span><small>ТАТАМИ · ИППОН</small>';
  const q = $('#scr-menu [data-act="quick"]'); if (q) q.textContent = 'Схватка';
  const foot = $('#scr-menu .menu-foot'); if (foot) foot.textContent = 'Геймпад PlayStation / Xbox, клавиатура и сенсорный экран';
  const hd = $('#scr-select .select-head h2'); if (hd) hd.textContent = 'Схватка';
  const go = $('#scr-select [data-act="fight"]'); if (go) go.textContent = 'На татами';
  const cols = $('#scr-select .select-col h3'); if (cols) cols.firstChild.textContent = 'Ваш борец ';
  const h3 = document.querySelectorAll('#scr-select .select-col h3'); if (h3[1]) h3[1].firstChild.textContent = 'Соперник ';
  const vs = $('#scr-select .versus'); if (vs) vs.textContent = 'VS';
  // the select screen keeps its machinery; the class picks the two fighters
  const origRender = ui.renderSelect.bind(ui);
  ui.renderSelect = function () {
    const L = J.CLASSES[J.opt.kg];
    if (!L.includes(ui.pick.p)) ui.pick.p = L[0];
    if (!L.includes(ui.pick.o) || ui.pick.o === ui.pick.p) ui.pick.o = L.find((x) => x !== ui.pick.p);
    origRender();
    // the length of a match
    ui._chips($('#opt-len'), [[40, '40 сек'], [60, '1 мин'], [120, '2 мин']], () => ui.settings.roundLen, (v) => (ui.settings.roundLen = v));
    const lab = document.querySelector('.opt:has(#opt-len) label'); if (lab) lab.textContent = 'Время схватки';
    jopts();
  };
  if (![40, 60, 120].includes(ui.settings.roundLen)) ui.settings.roundLen = 40;
  // the controls screen
  const rows = [
    ['Движение', 'W A S D', 'Левый стик'],
    ['Приём 1', 'J', '□'],
    ['Приём 2', 'I', '△'],
    ['Приём 3', 'K', '✕'],
    ['Приём 4', 'L', '○'],
    ['Приём 5', 'Пробел', 'R2'],
    ['Взять захват', 'Q / Shift', 'L2'],
    ['Сбросить захват соперника', 'U', 'L1'],
    ['Толчок', 'O', 'R1'],
    ['Пауза', 'Esc', 'Options'],
  ];
  const tb = $('#scr-controls tbody'); if (tb) tb.innerHTML = rows.map((r) => '<tr><td>' + r[0] + '</td><td><kbd>' + r[1] + '</kbd></td><td><kbd>' + r[2] + '</kbd></td></tr>').join('');
  const tips = $('#scr-controls .tips');
  if (tips) tips.innerHTML = '<p><b>Захват решает.</b> L2 — рукав, ещё раз L2 — отворот. Без захвата бросок почти не проходит (кроме подсечки и сколена). Захват соперника на вас мешает: сбрасывайте его L1.</p>' +
    '<p><b>Кузуси.</b> R1 толкает: соперник уходит на пятки — время для зацепа и отхвата. Когда он упирается и подаётся вперёд — плечо, подхват, бедро. После его неудачной атаки 0,7 с на контратаку.</p>' +
    '<p><b>Иппон</b> — чистый бросок на спину с силой: схватка закончена. <b>Ваза-ари</b> — бросок не полный; два ваза-ари дают иппон. Если время вышло, побеждает тот, у кого больше ваза-ари. При равенстве — золотой скор: первая оценка решает.</p>' +
    '<p><b>Дыхание, гликоген и кислота.</b> Каждый бросок тратит дыхание и гликоген и копит кислоту в мышцах. Выше порог кислоты — дольше сила в руках. Усталый борец бросает слабее.</p>' +
    '<p><b>Шидо.</b> Без атак 28 секунд — шидо. Три шидо — поражение.</p>' +
    '<p><b>Телефон.</b> Слева стик, справа четыре кнопки приёмов, сверху L1/L2/R1/R2. Тап по правой части экрана — захват, свайп вправо — толчок.</p>';
  // the pause screen texts etc. stay as they are
  J.relabel();
  J.setVenue(J.opt.venue);
}
patchUI();
})();

// the throw buttons: every button has its own row, the throw on it is lit
(function () {
  const J = window.JUDO;
  const SLOT_LONG = ['□ Квадрат', '△ Треугольник', '✕ Крест', '○ Круг', 'R2'];
  function render(box) {
    box.innerHTML = '<h2>Кнопки приёмов</h2><div class="dim">Нажмите бросок в ряду кнопки — он встанет на неё. Если этот бросок стоял на другой кнопке, они поменяются местами.</div>' +
      J.loadout.map((cur, k) => '<div class="opt"><label>' + SLOT_LONG[k] + ' — сейчас: <b>' + J.TECHS[cur].name + '</b></label><div class="chips">' +
        J.TECH_ORDER.map((id) => '<button class="chip' + (id === cur ? ' on' : '') + '" data-act="setbtn" data-k="' + k + '" data-v="' + id + '">' + J.TECHS[id].name + '</button>').join('') + '</div></div>').join('') +
      '<div class="note" style="margin-top:10px">L2 — взять захват · L1 — сбросить захват соперника или устоять, когда он бросает · R1 — толчок</div>' +
      '<div class="foot" style="margin-top:12px"><button class="btn primary" data-act="back">Готово</button></div>';
  }
  J.saveLoadout = () => { try { localStorage.setItem('judo.loadout', JSON.stringify(J.loadout)); } catch (e) { /* not kept */ } };
  try { const L = JSON.parse(localStorage.getItem('judo.loadout') || 'null'); if (Array.isArray(L) && L.length === 5 && L.every((x) => J.TECHS[x])) J.loadout = L; } catch (e) { /* default */ }
  function install() {
    const g = window.__UFC__;
    if (!g || !g.ui) { setTimeout(install, 160); return; }
    const ui = g.ui;
    const s = document.createElement('div'); s.className = 'screen hidden'; s.id = 'scr-jbtn'; s.innerHTML = '<div class="panel jc"></div>';
    ui.root.appendChild(s);
    const box = s.querySelector('.jc');
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'back') { ui.back(); return; }
      if (b.dataset.act === 'setbtn') {
        const k = +b.dataset.k, id = b.dataset.v, other = J.loadout.indexOf(id);
        if (other >= 0 && other !== k) J.loadout[other] = J.loadout[k];
        J.loadout[k] = id; J.relabel(); J.saveLoadout(); render(box);
      }
    });
    ui.route('scr-jbtn', () => render(box));
    const mb = document.querySelector('#scr-menu .menu-buttons');
    if (mb && !mb.querySelector('[data-act="jbtn"]')) {
      const bt = document.createElement('button'); bt.className = 'btn'; bt.dataset.act = 'jbtn'; bt.textContent = 'Кнопки приёмов';
      const ctl = mb.querySelector('[data-act="controls"]'); mb.insertBefore(bt, ctl || null);
      bt.addEventListener('click', () => ui.go('scr-jbtn'));
    }
    J.relabel();
  }
  install();
})();

