//# sourceURL=ufc/careerui2.js
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
const flag = (code) => '<span class="flag">' + esc(code || '') + '</span>';

// ===========================================================================
// Career, part two: the manager call with fight offers, the full fight card,
// weight cut and food, elite camp / supplements / possessions, the post-fight
// interview, weight class switch and the retirement legacy page.
// ===========================================================================
UFC.screenRegistrars.push((ui) => {
  const game = ui.game;
  const state = ui.career;
  const cur = () => { if (!state.c) throw new Error('Карьера не загружена'); return state.c; };
  const screen = (id, cls, inner) => { const s = el('div', 'screen hidden ' + (cls || ''), inner); s.id = id; ui.root.appendChild(s); return s; };
  const onClick = (s, map) => s.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || !s.contains(b)) return;
    const fn = map[b.dataset.act];
    if (fn) { try { const r = fn(b.dataset, b); if (r && r.catch) r.catch((err) => ui.fail(err, s.id)); } catch (err) { ui.fail(err, s.id); } }
  });
  const head = (title, extra) => '<div class="c-head"><button class="btn small" data-act="back">‹ Назад</button><h2>' + title + '</h2>' + (extra || '') + '</div>';
  const kv = (k, v) => '<div class="kv"><span>' + k + '</span><b>' + esc(v) + '</b></div>';

  // --------------------------------------------------------------- manager call (offers)
  // Reuse the existing offers screen (one element per id!) and give it the call layout.
  // Reuse the element (one node per id) but drop the old listeners with a clone.
  const sOfferOld = document.getElementById('scr-offers');
  const sOffer = sOfferOld.cloneNode(false);
  sOfferOld.parentNode.replaceChild(sOffer, sOfferOld);
  sOffer.className = 'screen hidden cscreen editor';
  sOffer.innerHTML = '<div class="cwrap left">' + head('Звонок из офиса лиги') + '<div id="call-body"></div></div>';
  onClick(sOffer, {
    back: () => ui.back(),
    accept: (d) => { const c = cur(); C().book(c, +d.i, { shortNotice: d.short === '1' }); ui.toast(d.short === '1' ? 'Бой в короткие сроки подписан!' : 'Бой подписан! Впереди лагерь.'); ui.go('scr-camp', null, { replace: true }); },
    decline: (d) => { const c = cur(); C().declineOffer(c, +d.i); ui.toast('Вы отказались. Лига предложит другие бои.'); renderCall(); },
    prof: (d) => ui.go('scr-profile', { career: true, id: d.id }),
    look: (d) => { const c = cur(); game.showPreview(LG().toCfg(c.league.fighters[d.id])); },
  });
  function renderCall() {
    const c = cur(), L = c.league, me = C().player(c);
    if (c.stage !== 'hub') throw new Error('Сейчас уже есть запланированный бой или идёт восстановление');
    if (!c.offers.length) c.offers = C().makeOffers(c);
    const rk = LG().rankOf(L, 'player');
    const box = $('#call-body');
    const cards = c.offers.map((o, i) => {
      const f = L.fighters[o.opp];
      const s = LG().strengths(f);
      const last = (f.history || []).slice(0, 3).map((h) => '<span class="res ' + h.res + '">' + h.res + '</span>').join('');
      C().syncTier(c);
      const purse = C().purseBand(rk.rank, o.title, o.kind === 'defense', o.kind === 'superfight' || o.kind === 'legend' || o.kind === 'gorilla', c.hype);
      const short = C().purseBand(rk.rank, o.title, o.kind === 'defense', o.kind === 'superfight' || o.kind === 'legend' || o.kind === 'gorilla', c.hype) * 1.15;
      return '<div class="offer' + (o.title ? ' title' : '') + '">' +
        '<div class="of-kind">' + (o.title ? '🏆 ' : '') + C().OFFER_LABEL[o.kind] + (o.div !== me.div ? ' · ' + UFC.divById(o.div).name : '') + '</div>' +
        '<div class="of-name">' + flag(f.flag) + ' ' + esc(f.name) + ' <span class="dim">«' + esc(f.nick) + '»</span></div>' +
        '<div class="of-meta">' + LG().rankLabel(o.oppRank) + ' · ' + rec(f.rec) + ' · ' + (UFC.STYLE_NAMES[f.styleKey] || UFC.STYLE_NAMES[f.style] || '') + ' · OVR ' + LG().overallOf(f) + ' ' + last + '</div>' +
        '<div class="of-sw"><span class="good">+ ' + (s.good.join(', ') || '—') + '</span><span class="bad">− ' + (s.bad.join(', ') || '—') + '</span></div>' +
        '<div class="of-foot"><b>' + 'бой до конца · гонорар ' + money(purse) + ' + бонус за победу</b></div>' +
        '<div class="of-btns"><button class="btn small" data-act="look" data-id="' + o.opp + '">Модель</button><button class="btn small" data-act="prof" data-id="' + o.opp + '">Профиль</button>' +
        '<button class="btn primary small" data-act="accept" data-i="' + i + '">Принять (лагерь 12 недель)</button>' +
        '<button class="btn small" data-act="accept" data-i="' + i + '" data-short="1">Короткие сроки · ' + money(short) + '</button>' +
        '<button class="btn small" data-act="decline" data-i="' + i + '">Отказаться</button></div></div>';
    }).join('');
    box.innerHTML = '<div class="dana"><div class="dana-ava">☎</div><div><div class="dana-name">ОФИС ЛИГИ · МЕНЕДЖЕР</div>' +
      '<div class="dana-text">«' + esc(me.short) + ', есть работа. ' + (c.hype > 55 ? 'Тобой интересуются, билеты продаются.' : c.hype > 30 ? 'Про тебя говорят после прошлого боя.' : 'Пора заявить о себе.') + ' Смотри, что мы предлагаем.»</div></div></div>' +
      '<div class="c-note">Хайп: <b>' + Math.round(c.hype) + '</b>/100 · рейтинг: <b>' + LG().rankLabel(rk.rank) + '</b> · короткие сроки: +15% к гонорару, но −6% к кардио и силе удара.</div>' + cards;
    if (c.offers[0]) game.showPreview(LG().toCfg(L.fighters[c.offers[0].opp]));
  }
  ui.route('scr-offers', () => renderCall(), { editor: true });

  // --------------------------------------------------------------- fight card
  const sCard = screen('scr-card', 'cscreen', '<div class="cwrap wide">' + head('Файт-кард') + '<div id="card-body"></div></div>');
  onClick(sCard, { back: () => ui.back() });
  ui.route('scr-card', () => {
    const c = cur(), L = c.league;
    game.showPreview(null);
    const b = c.booked;
    if (!b || !b.card) { $('#card-body').innerHTML = '<div class="c-note">Кард появится, когда бой будет подписан.</div>'; return; }
    const slotName = { main: 'ГЛАВНЫЙ БОЙ ВЕЧЕРА', co: 'СО-ГЛАВНЫЙ БОЙ', card: 'ОСНОВНОЙ КАРД', prelim: 'ПРЕЛИМИНАРИ' };
    const me = C().player(c);
    const rows = b.card.bouts.map((x, i) => {
      if (x.player) {
        const o = L.fighters[b.opp];
        return '<tr class="me"><td>' + (i === 0 ? slotName[b.card.slot] : 'ОСНОВНОЙ КАРД') + '</td><td class="nm">' + esc(me.name) + ' <span class="dim">vs</span> ' + esc(o.name) + '</td><td>' + (b.title ? '🏆 за титул · ' : '') + b.rounds + ' раунда</td><td>ВЫ</td></tr>';
      }
      const A = L.fighters[x.a], B = L.fighters[x.b];
      if (!A || !B) return '';
      const res = x.done ? (esc((x.winner === x.a ? A : B).short) + ' · ' + (UFC.METHOD_NAMES[x.method] || x.method)) : '—';
      return '<tr><td>' + (slotName[x.kind] || 'ПРЕЛИМИНАРИ') + '</td><td class="nm">' + esc(A.short) + ' <span class="dim">vs</span> ' + esc(B.short) + '</td><td>' + UFC.divById(A.div).name + '</td><td>' + res + '</td></tr>';
    }).join('');
    $('#card-body').innerHTML = '<div class="card-title">' + esc(b.card.event) + '</div>' +
      '<div class="c-note">Ваше место в карде зависит от рейтинга и хайпа. Остальные бои проходят сами — результаты меняют рейтинги.</div>' +
      '<table class="rk"><thead><tr><th>Позиция</th><th>Бой</th><th>Дивизион</th><th>Результат</th></tr></thead><tbody>' + rows + '</tbody></table>';
  });

  // --------------------------------------------------------------- weight cut + food
  const sCut = screen('scr-weightcut', 'cscreen editor', '<div class="cwrap left">' + head('Сгонка веса и взвешивание') + '<div id="cut-body"></div></div>');
  onClick(sCut, {
    back: () => ui.back(),
    cut: (d) => { state.cutPick = d.id; renderCut(); },
    food: (d) => { state.foodPick = d.id; renderCut(); },
    go: () => {
      const c = cur();
      const r = C().doWeightCut(c, state.cutPick || 'normal', state.foodPick || 'rice');
      state.cutReport = '<div class="camp-report"><h3>Взвешивание</h3><p>Вес на весах: <b>' + r.weighIn.toFixed(1) + ' кг</b>' + (r.missed ? ' — <span class="bad">не уложились в лимит, штраф ' + money(r.fine) + '</span>' : ' — <span class="good">лимит взят</span>') + '</p>' +
        '<p>Питание: ' + esc(r.food.name) + '. Готовность к бою: <b>' + Math.round(r.prep * 100) + '%</b></p>' +
        '<button class="btn primary" data-act="tohub">К неделе боя</button></div>';
      renderCut();
    },
    tohub: () => { state.cutReport = null; ui.go('scr-hub', null, { replace: true }); },
  });
  function renderCut() {
    const c = cur(), b = c.booked, box = $('#cut-body');
    game.showPreview(LG().toCfg(C().player(c)));
    if (state.cutReport) { box.innerHTML = state.cutReport; return; }
    if (!b || c.stage !== 'weightcut') { box.innerHTML = '<div class="c-note">Сгонка начинается после тренировочного лагеря.</div>'; return; }
    const limit = UFC.divById(b.div).kg;
    const walking = (c.weight && c.weight.walking) || limit + 7;
    box.innerHTML = '<div class="c-note">Лимит дивизиона: <b>' + limit + ' кг</b>. Ваш вес вне боя: <b>' + walking.toFixed(1) + ' кг</b>. Сгонка влияет на самочувствие в бою, еда после взвешивания возвращает силы.</div>' +
      '<div class="opt"><label>Как сгоняем</label><div class="camp-grid">' + C().CUTS.map((x) => '<button class="camp-card' + ((state.cutPick || 'normal') === x.id ? ' on' : '') + '" data-act="cut" data-id="' + x.id + '"><b>' + x.name + '</b><span>' + x.desc + '</span><em>' + (x.penalty ? 'потеря формы ' + Math.round(x.penalty * 100) + '%' : 'без потерь') + (x.risk ? ' · риск не уложиться ' + Math.round(x.risk * 50) + '%' : '') + '</em></button>').join('') + '</div></div>' +
      '<div class="opt"><label>Восстановление после весов</label><div class="camp-grid">' + C().FOODS.map((x) => '<button class="camp-card' + ((state.foodPick || 'rice') === x.id ? ' on' : '') + '" data-act="food" data-id="' + x.id + '"><b>' + x.name + '</b><span>' + x.note + '</span><em>' + money(x.cost) + ' · возврат ' + Math.round(x.recover * 100) + '%</em></button>').join('') + '</div></div>' +
      '<div class="act-foot"><button class="btn primary big" data-act="go">На весы</button></div>';
  }
  ui.route('scr-weightcut', () => { state.cutReport = null; renderCut(); }, { editor: true });

  // --------------------------------------------------------------- shop: elite camp, supplements, possessions
  const sShop = screen('scr-shop', 'cscreen', '<div class="cwrap wide">' + head('Магазин и мои вещи') + '<div class="tabs" id="shop-tabs"></div><div id="shop-body"></div></div>');
  onClick(sShop, {
    back: () => ui.back(),
    stab: (d) => { ui.params.tab = d.tab; renderShop(ui.params); },
    elite: () => { const c = cur(); C().buyElite(c); ui.toast('Элитный кемп оплачен: питание, восстановление, спарринг-партнёры'); renderShop(ui.params); },
    fuel: (d) => { const c = cur(); const n = C().buyFuel(c, d.kind); ui.toast(n.name + ': ' + n.lv + '%'); renderShop(ui.params); },
    supp: (d) => { const c = cur(); const s = C().buySupplement(c, d.id); ui.toast(s.name + ': ' + s.desc); renderShop(ui.params); },
    item: (d) => { const c = cur(); const it = C().buyItem(c, d.id); ui.toast('Куплено: ' + it.name + ' (+' + it.hype + ' хайпа)'); renderShop(ui.params); },
  });
  function renderShop(p) {
    const c = cur();
    game.showPreview(null);
    const tab = p.tab || 'camp';
    const tabs = $('#shop-tabs'); tabs.innerHTML = '';
    for (const [id, n] of [['camp', 'Подготовка'], ['supp', 'Питание и добавки'], ['fuel', 'Гликоген и кислота'], ['things', 'Мои вещи']]) {
      const b = el('button', 'tab' + (tab === id ? ' on' : ''), n); b.dataset.act = 'stab'; b.dataset.tab = id; tabs.appendChild(b);
    }
    const bk = c.booked;
    let html = '<div class="c-note">Баланс: <b>' + money(c.money) + '</b> · хайп <b>' + Math.round(c.hype) + '</b>/100</div>';
    if (tab === 'camp') {
      html += '<div class="shop-grid">' +
        '<div class="shop-card"><b>Элитный кемп</b><span>Элитное питание, восстановление и спарринг-партнёры мирового уровня: +12% к росту в лагере и +6% к готовности в бою.</span><em>' + money(C().ELITE_CAMP_COST) + '</em>' +
        (bk ? (bk.elite ? '<div class="good">Уже оплачен для этого боя</div>' : '<button class="btn primary small" data-act="elite">Купить</button>') : '<div class="dim">Доступно, когда бой подписан</div>') + '</div>' +
        '<div class="shop-card"><b>Зал: ' + C().GYM_NAMES[c.gym] + '</b><span>Уровень зала ускоряет рост характеристик в каждом лагере.</span><em>' + (c.gym + 1 < C().GYM_COST.length ? money(C().GYM_COST[c.gym + 1]) : 'максимум') + '</em>' + (c.gym + 1 < C().GYM_COST.length ? '<button class="btn small" data-act="gym">Улучшить</button>' : '') + '</div>' +
        '<div class="shop-card"><b>Автотренировки</b><span>Между боями команда работает сама: каждый месяц немного растёт выбранный навык. Списывается автоматически.</span><em>$350 / месяц</em></div></div>';
    } else if (tab === 'fuel') {
      const fcard = (kind, title, desc, curv) => { const next = C().FUEL[kind].find((x) => x.lv > curv); return '<div class="shop-card"><b>' + title + ': ' + Math.round(curv) + '%</b><span>' + desc + '</span><em>' + (next ? next.name + ' → ' + next.lv + '% · ' + money(next.cost) : 'Максимум 250%') + '</em>' + (next ? '<button class="btn small primary" data-act="fuel" data-kind="' + kind + '">Купить</button>' : '<div class="good">Максимум</div>') + '</div>'; };
      html += '<div class="c-note">В начале карьеры у вас <b>75% гликогена</b> и <b>100% порога кислоты</b>. Гликоген — топливо: он уходит в бою и пополняет выносливость, а когда кончается, выносливость падает. Молочная кислота копится от ударов и тормозит руки и ноги. Чем выше показатели, тем дольше вы держите темп. У соперников этого нет.</div>' +
        '<div class="shop-grid">' + fcard('gly', 'Гликоген', 'Запас энергии в мышцах: дольше темп, быстрее восстановление между ударами. До 250%.', c.gly || 75) + fcard('acid', 'Порог кислоты', 'Сколько молочной кислоты вы терпите, прежде чем руки «забьются». До 250%.', c.acid || 100) + '</div>' +
        '<div class="c-note small">Лагерь Топурии даёт +8% к обоим показателям за лагерь. После взвешивания блюдо «Электролиты и углеводы» даёт +35% гликогена на бой.</div>';
    } else if (tab === 'supp') {
      html += '<div class="shop-grid">' + C().SUPPLEMENTS.map((s) => '<div class="shop-card"><b>' + s.name + '</b><span>' + s.desc + '</span><em>' + money(s.cost) + '</em><button class="btn small" data-act="supp" data-id="' + s.id + '">Купить</button></div>').join('') + '</div>' +
        '<div class="c-note">В одном лагере усваиваются максимум две добавки — эффект небольшой и постоянный.</div>';
    } else {
      const owned = c.items || [];
      html += '<div class="shop-grid">' + C().ITEMS.map((it) => '<div class="shop-card' + (owned.includes(it.id) ? ' owned' : '') + '"><b>' + it.name + '</b><span>' + it.note + '</span><em>' + money(it.cost) + ' · +' + it.hype + ' хайпа' + (it.camp ? ' · +' + Math.round(it.camp * 100) + '% к лагерю' : '') + '</em>' +
        (owned.includes(it.id) ? '<div class="good">В вашей собственности</div>' : '<button class="btn small" data-act="item" data-id="' + it.id + '">Купить</button>') + '</div>').join('') + '</div>';
      const mine = owned.map((id) => (C().ITEMS.find((x) => x.id === id) || {}).name).filter(Boolean);
      html += '<h3>Мои вещи</h3><div class="c-note">' + (mine.length ? mine.join(' · ') : 'Пока ничего не куплено.') + '</div>';
    }
    $('#shop-body').innerHTML = html;
  }
  ui.route('scr-shop', (p) => renderShop(p));

  // --------------------------------------------------------------- post-fight interview
  const sInt = screen('scr-interview', 'cscreen dim', '<div class="cwrap"><div class="c-head"><h2>Интервью в октагоне</h2></div><div id="int-body"></div></div>');
  onClick(sInt, {
    pick: (d) => {
      const c = cur();
      const o = C().interview(c, d.id);
      UFC.Announcer.say(game, o.text, { pitch: 0.95, rate: 1.0 });
      state.interviewText = o;
      renderInterview();
    },
    next: () => { const c = cur(); if (c.lastSummary) c.lastSummary.interviewed = true; state.interviewText = null; ui.go('scr-postfight', null, { replace: true }); },
  });
  function renderInterview() {
    const c = cur();
    const s = c.lastSummary || {};
    const box = $('#int-body');
    if (state.interviewText) {
      box.innerHTML = '<div class="int-quote">🎤 «' + esc(state.interviewText.text) + '»</div>' +
        '<div class="c-note">Хайп: <b>' + Math.round(c.hype) + '</b>/100 (+' + state.interviewText.hype + ')' + (c.callout ? ' · вызов принят к сведению: <b>' + esc(c.league.fighters[c.callout].name) + '</b>' : '') + '</div>' +
        '<div class="post-foot"><button class="btn primary" data-act="next">Далее ›</button></div>';
      return;
    }
    box.innerHTML = '<div class="c-note">' + (s.won ? 'Вы выиграли' : 'Бой завершён') + ' — комментатор передаёт микрофон. Что скажете?</div>' +
      '<div class="int-grid">' + C().INTERVIEWS.map((x) => '<button class="int-card" data-act="pick" data-id="' + x.id + '"><b>' + x.name + '</b><span>«' + esc(x.text.slice(0, 80)) + '…»</span><em>+' + x.hype + ' хайпа' + (x.callout ? ' · вызов чемпиону' : '') + '</em></button>').join('') + '</div>';
  }
  ui.route('scr-interview', () => renderInterview(), { transient: true, onBack: () => false });

  // the summary screen waits for the interview first
  const prevPost = ui.routes['scr-postfight'];
  ui.route('scr-postfight', (p) => {
    const c = state.c;
    // redirect after the current navigation finishes, or it would be overwritten
    if (c && c.lastSummary && !c.lastSummary.interviewed && !c.retired) { setTimeout(() => ui.go('scr-interview', null, { replace: true }), 0); return; }
    if (prevPost && prevPost.render) prevPost.render(p);
  }, { onBack: () => { ui.go('scr-hub', null, { replace: true }); return false; } });

  // --------------------------------------------------------------- weight class switch
  const sDiv = screen('scr-division', 'cscreen editor', '<div class="cwrap left">' + head('Смена весовой категории') + '<div id="div-body"></div></div>');
  onClick(sDiv, {
    back: () => ui.back(),
    move: (d) => {
      const c = cur();
      const rk = C().switchDivision(c, d.id);
      ui.toast('Переход выполнен: ' + UFC.divById(d.id).name + ' · ' + LG().rankLabel(rk.rank));
      ui.go('scr-hub', null, { replace: true });
    },
  });
  ui.route('scr-division', () => {
    const c = cur(), me = C().player(c);
    game.showPreview(LG().toCfg(me));
    const rk = LG().rankOf(c.league, 'player');
    $('#div-body').innerHTML = '<div class="c-note">Сейчас: <b>' + UFC.divById(me.div).name + '</b> · ' + LG().rankLabel(rk.rank) + '. При переходе вы попадаете в рейтинг нового дивизиона: топ-5 — около #9, рейтинговый — #15, остальные начинают без рейтинга. Соперники, чемпион и гонка за пояс будут из нового дивизиона.</div>' +
      '<div class="camp-grid">' + UFC.DIVISIONS.filter((d) => !d.heavy).map((d) => '<button class="camp-card' + (d.id === me.div ? ' on' : '') + '" data-act="move" data-id="' + d.id + '"><b>' + d.name + '</b><span>Лимит ' + d.kg + ' кг · чемпион: ' + esc((c.league.fighters[c.league.divs[d.id].champ] || {}).short || '') + '</span><em>' + (d.id === me.div ? 'текущий дивизион' : 'перейти') + '</em></button>').join('') + '</div>';
  }, { editor: true });

  // --------------------------------------------------------------- retirement & legacy
  const sLeg = screen('scr-legacy', 'cscreen dim', '<div class="cwrap">' + head('Наследие') + '<div id="leg-body"></div></div>');
  onClick(sLeg, { back: () => ui.go('scr-hub', null, { replace: true }), edits: () => ui.go('scr-edits') });
  ui.route('scr-legacy', () => {
    const c = cur();
    const L = c.legacy || C().retire(c);
    game.showPreview(null);
    const bars = Object.keys(UFC.STAT_LABELS).map((k) => '<div class="stat"><span>' + UFC.STAT_LABELS[k] + '</span><i><b style="width:' + Math.min(100, Math.round(L.stats[k])) + '%"></b></i><em>' + Math.round(L.stats[k]) + '</em></div>').join('');
    $('#leg-body').innerHTML =
      '<div class="leg-title">' + esc(L.name) + '</div><div class="leg-sub">«' + esc(L.nick) + '» · карьера ' + L.years + ' лет · завершена в ' + L.age + '</div>' +
      '<div class="hub-grid">' + kv('Рекорд', rec(L.rec)) + kv('Финиши', L.ko + ' KO / ' + L.sub + ' SUB') + kv('Титулы', L.titles) + kv('Защиты', L.defenses) +
      kv('Лучший рейтинг', LG().rankLabel(L.bestRank)) + kv('Лучший P4P', L.bestP4P ? '#' + L.bestP4P : '—') + kv('Место в GOAT', '#' + L.goat) + kv('Заработано', money(L.money)) + '</div>' +
      '<h3>Пик карьеры</h3><div class="c-note">' + (L.primeYear ? 'Лучший год: <b>' + L.primeYear + '</b> (' + L.primeRecord.w + '–' + L.primeRecord.l + ') · лучшая серия: <b>' + L.bestStreak + '</b> побед подряд · финальный OVR <b>' + L.ovr + '</b>' : 'Данных мало') + '</div>' +
      (L.bigWins.length ? '<h3>Главные победы</h3><table class="rk small"><tbody>' + L.bigWins.map((w) => '<tr><td>' + esc(w.opp) + '</td><td>' + (UFC.METHOD_NAMES[w.method] || w.method) + (w.round ? ' · R' + w.round : '') + '</td><td>' + (w.title ? '🏆 титульный' : '') + '</td><td>' + esc(w.date) + '</td></tr>').join('') + '</tbody></table>' : '') +
      '<h3>Характеристики на момент завершения</h3><div class="hub-stats">' + bars + '</div>' +
      '<div class="leg-final">' + (L.goat <= 3 ? 'Этот боец вошёл в историю как один из величайших.' : L.titles ? 'Чемпион, чьё имя знают в каждом зале.' : 'Долгий и честный путь бойца.') + '</div>' +
      '<div class="post-foot"><button class="btn primary" data-act="edits">🎬 Три эдита о карьере</button><button class="btn" data-act="back">В карьеру</button></div>';
  });

  // --------------------------------------------------------------- hub extras
  const sHub = document.getElementById('scr-hub');
  onClick(sHub, {
    card: () => ui.go('scr-card'),
    cut: () => ui.go('scr-weightcut'),
    shop: () => ui.go('scr-shop', { tab: 'camp' }),
    things: () => ui.go('scr-shop', { tab: 'things' }),
    division: () => ui.go('scr-division'),
    legacy: () => ui.go('scr-legacy'),
    edits: () => ui.go('scr-edits'),
    retire: () => {
      const c = cur();
      if (state.confirmRetire) { C().retire(c); state.confirmRetire = false; ui.go('scr-legacy'); }
      else { state.confirmRetire = true; ui.toast('Нажмите ещё раз, чтобы завершить карьеру'); }
    },
  });
  const prevHub = ui.routes['scr-hub'];
  ui.route('scr-hub', (p) => {
    if (prevHub && prevHub.render) prevHub.render(p);
    const c = state.c; if (!c) return;
    const body = $('#hub-body'); if (!body) return;
    const me = C().player(c);
    // extra state line: hype, PPV, possessions
    const extra = el('div', 'hub-extra');
    const owned = (c.items || []).length;
    extra.innerHTML = '<div class="hub-grid">' + kv('Хайп', Math.round(c.hype || 0) + ' / 100') + kv('PPV всего', (c.ppvTotal || 0).toLocaleString('ru-RU')) +
      kv('Вещей куплено', owned) + kv('OVR', LG().overallOf(me)) + '</div>' +
      ((c.hypeLog || []).length ? '<div class="c-note small">' + c.hypeLog.slice(0, 3).map((h) => (h.amount > 0 ? '+' : '') + h.amount + ' ' + esc(h.reason)).join(' · ') + '</div>' : '');
    const action = body.querySelector('.hub-action');
    if (action) {
      body.insertBefore(extra, action);
      if (c.stage === 'camp') {
        action.insertAdjacentHTML('beforeend', '<button class="btn" data-act="shop">Элитный кемп и добавки</button><button class="btn" data-act="card">Файт-кард</button>');
      } else if (c.stage === 'weightcut') {
        const o = c.league.fighters[c.booked.opp];
        action.innerHTML = '<div class="booked"><div class="bk-title">' + (c.booked.title ? '🏆 ' : '') + esc(c.booked.card ? c.booked.card.event : '') + '</div><div class="bk-vs">vs ' + esc(o.name) + '</div><div class="dim">Лагерь пройден · гонорар ' + money(c.booked.purse) + '</div></div>' +
          '<button class="btn primary big" data-act="cut">Сгонка веса и взвешивание</button><button class="btn" data-act="card">Файт-кард</button>';
      } else if (c.stage === 'fightweek') {
        action.insertAdjacentHTML('beforeend', '<button class="btn" data-act="card">Файт-кард</button>');
      } else if (c.stage === 'retired') {
        action.innerHTML = '<div class="c-note">Карьера завершена.</div><button class="btn primary big" data-act="legacy">Экран наследия</button>';
      }
    }
    const menu = body.querySelector('.hub-menu');
    if (menu && c.stage !== 'retired') {
      menu.insertAdjacentHTML('beforeend', '<button class="btn" data-act="things">Мои вещи</button><button class="btn" data-act="shop">Магазин</button>' +
        (c.stage === 'hub' ? '<button class="btn" data-act="division">Сменить дивизион</button>' : '') +
        '<button class="btn" data-act="edits">🎬 Эдиты</button><button class="btn" data-act="retire">Завершить карьеру</button>');
    }
  }, { editor: true });

  // ---------------------------------------------------------------- THREE CAREER FILMS
  if (!document.getElementById('edit-css')) {
    const st = document.createElement('style'); st.id = 'edit-css';
    st.textContent = '#edit-ov { position: fixed; inset: 0; z-index: 85; pointer-events: none; font-family: var(--head); }' +
      '#edit-ov .eb { position: absolute; left: 0; right: 0; height: 8vh; background: #000; } #edit-ov .eb.t { top: 0; } #edit-ov .eb.b { bottom: 0; }' +
      '#ed-t { position: absolute; left: 0; right: 0; top: 36%; text-align: center; color: #fff; font-size: clamp(40px, 9vw, 120px); letter-spacing: 6px; text-shadow: 0 6px 40px rgba(0,0,0,0.95); opacity: 0; transition: opacity .35s; }' +
      '#ed-s { position: absolute; left: 0; right: 0; top: calc(36% + clamp(50px, 11vw, 140px)); text-align: center; color: #e3b341; font-size: clamp(16px, 2.6vw, 30px); letter-spacing: 3px; opacity: 0; transition: opacity .35s; }' +
      '#ed-t.on, #ed-s.on { opacity: 1; } #ed-t.hard { color: #ff2a2a; -webkit-text-stroke: 2px #fff; } #ed-t.sad { color: #aab6d0; font-size: clamp(30px, 6vw, 80px); letter-spacing: 3px; }' +
      '#ed-f { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity 1.2s; } #ed-f.on { opacity: 1; }' +
      '#ed-k { position: absolute; right: 14px; bottom: calc(8vh + 12px); pointer-events: auto; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.3); color: #ddd; padding: 12px 22px; font-size: 16px; letter-spacing: 1px; cursor: pointer; }' +
      'body.sadmode #c { filter: grayscale(0.85) brightness(0.8) contrast(1.1) hue-rotate(190deg); }';
    document.head.appendChild(st);
  }
  const ED = { stopped: true, timer: null };
  const edEl = (id) => document.getElementById(id);
  function edOpen() {
    edClose();
    const d = document.createElement('div'); d.id = 'edit-ov';
    d.innerHTML = '<div class="eb t"></div><div class="eb b"></div><div id="ed-t"></div><div id="ed-s"></div><div id="ed-f"></div><button id="ed-k">Пропустить ›</button>';
    document.body.appendChild(d);
    edEl('ed-k').onclick = () => edSkip();
    ED.stopped = false;
  }
  function edClose() { clearTimeout(ED.timer); const d = document.getElementById('edit-ov'); if (d) d.remove(); document.body.classList.remove('sadmode', 'replaymode'); }
  function edText(t, sub, cls) { const a = edEl('ed-t'), b = edEl('ed-s'); if (!a) return; a.className = (t ? 'on ' : '') + (cls || ''); a.textContent = t || ''; b.className = sub ? 'on' : ''; b.textContent = sub || ''; }
  function edFade(on) { const f = edEl('ed-f'); if (f) f.classList.toggle('on', !!on); }
  function edSkip() { if (ED.stopped) return; ED.stopped = true; game.onQuit = () => { edClose(); game.audio.stopMusic(0.6); ui.go('scr-edits', null, { replace: true }); }; game.quitToMenu(); }
  function edFinish() { if (ED.stopped) return; ED.stopped = true; game.audio.stopMusic(1.4); edClose(); ui.go('scr-edits', null, { replace: true }); }
  function edWait(ms, fn) { clearTimeout(ED.timer); ED.timer = setTimeout(() => { if (!ED.stopped) fn(); }, ms); }
  function edCard(t, sub, ms, cls, fn) { edFade(false); edText(t, sub, cls); edWait(ms, () => { edText('', ''); fn(); }); }
  const cfgOfF = (f) => LG().toCfg(f);

  const sEdits = screen('scr-edits', 'cscreen dim', '<div class="cwrap">' + head('Эдиты') + '<div id="edits-body"></div></div>');
  onClick(sEdits, { back: () => ui.back(), play: (d) => playEdit(d.k) });
  ui.route('scr-edits', () => renderEdits());
  function renderEdits() {
    const c = cur(); if (!c) return;
    game.showPreview(null);
    const kos = (c.kos || []).filter((k) => k.hasReplay), ls = c.losses || [], me = C().player(c);
    const card = (k, ico, name, desc, note, ok) => '<div class="shop-card"><b>' + ico + ' ' + name + '</b><span>' + desc + '</span><em>' + note + '</em><button class="btn small' + (ok ? ' primary' : '') + '" data-act="play" data-k="' + k + '"' + (ok ? '' : ' disabled') + '>▶ Смотреть</button></div>';
    $('#edits-body').innerHTML = '<div class="c-note">Три фильма о вашей карьере. Их можно смотреть в любой момент, и они собираются из ваших настоящих боёв.</div><div class="shop-grid">' +
      card('hard', '🔥', 'Эдит 1 · Жёсткий', 'Шесть самых важных нокаутов вашей карьеры (пояса, чемпионы, нокдауны), нарезка под тяжёлую музыку.', kos.length ? kos.length + ' нокаутов в архиве' : 'Нужен хотя бы один нокаут', kos.length > 0) +
      card('sad', '💧', 'Эдит 2 · Обидный', 'Поражение, после которого вы идёте один: понурая голова, плечи трясутся. Грустная музыка.', ls.length ? 'Поражений в архиве: ' + ls.length : 'Откроется после первого поражения', ls.length > 0) +
      card('glory', '🏆', 'Эдит 3 · Путь легенды', 'Ваша карьера в цифрах: рекорд, нокауты, пояса, защиты, место в истории. Под музыку чемпиона.', (me.rec ? me.rec.w + '–' + me.rec.l : '') + ' · ' + (c.history || []).length + ' боёв', (c.history || []).length > 0) +
      '</div>';
  }
  function playEdit(kind) {
    const c = cur(); if (!c) return;
    game.audio.ensure(); edOpen();
    game.onQuit = () => { edClose(); game.audio.stopMusic(0.6); ui.go('scr-edits', null, { replace: true }); };
    ui.hideAll && ui.hideAll();
    if (kind === 'hard') editHard(c); else if (kind === 'sad') editSad(c); else editGlory(c);
  }
  function editHard(c) {
    const me = C().player(c);
    const clips = (c.kos || []).filter((k) => k.hasReplay).slice().sort((a, b) => (b.score || (b.title ? 40 : 0)) - (a.score || (a.title ? 40 : 0))).slice(0, 6).reverse();   // six at most, the biggest one last
    if (!clips.length) { edClose(); ui.toast('Нет записанных нокаутов'); ui.go('scr-edits', null, { replace: true }); return; }
    game.audio.stopMusic(0.1); game.audio.startMusic('hardcore');
    let i = 0;
    const next = () => {
      if (ED.stopped) return;
      if (i >= clips.length) { edText('', ''); return edCard(String(me.rec.ko) + ' НОКАУТОВ', me.name.toUpperCase() + ' · ' + rec(me.rec), 4200, 'hard', () => { edFade(true); edWait(1400, edFinish); }); }
      const k = clips[i++], clip = C().loadReplay(c, k.id);
      if (!clip) return next();
      edCard('№' + (clips.length - i + 1) + ' · ' + String(k.type || 'KO').toUpperCase(), 'против ' + k.oppName + (k.round ? ' · R' + k.round : ''), 900, 'hard', () => game.playReplay(clip, () => { game.audio.cheer(0.7); next(); }, { fast: true }));
    };
    edCard('ТОП НОКАУТОВ', me.name.toUpperCase(), 2600, 'hard', next);
  }
  function editSad(c) {
    const me = C().player(c), L = c.league, loss = (c.losses || [])[0];
    if (!loss) { edClose(); ui.toast('Поражений ещё не было'); ui.go('scr-edits', null, { replace: true }); return; }
    const opp = L.fighters[loss.opp], pc = cfgOfF(me), oc = opp ? cfgOfF(opp) : null;
    game.audio.stopMusic(0.1); game.audio.startMusic('sad');
    const scene = () => {
      if (ED.stopped) return;
      edText('', ''); edFade(false);
      const cfgB = oc || UFC.fighterCfg(1);
      game.startEdit(pc, cfgB, (g, o) => UFC.Ceremony.editSad(g, Object.assign(o, { resText: (UFC.METHOD_NAMES[loss.method] || loss.method) + (loss.round ? ' · Раунд ' + loss.round : ''), fade: edFade })), () => { edFade(true); edWait(1500, edFinish); });
    };
    const clip = loss.hasReplay ? C().loadReplay(c, loss.id) : null;
    edCard('ТОТ ВЕЧЕР', 'против ' + loss.oppName + ' · ' + (UFC.METHOD_NAMES[loss.method] || loss.method), 3200, 'sad', () => {
      if (clip) { document.body.classList.add('sadmode'); game.playReplay(clip, () => { document.body.classList.remove('sadmode'); scene(); }, { fast: false }); }
      else scene();
    });
  }
  function editGlory(c) {
    const me = C().player(c), L = c.league, h = c.history || [];
    const goat = C().goatRank(c), p4p = LG().p4pPos(L, 'player'), def = c.totalDefenses || 0, ko = me.rec.ko;
    const lines = ['Рекорд ' + rec(me.rec) + ' · ' + h.length + ' боёв', ko + ' нокаутов', (me.titles || 0) ? (me.titles + ' титулов · ' + def + ' защит') : 'Путь к поясу продолжается', (p4p ? 'P4P #' + p4p + ' · ' : '') + 'место в истории #' + goat];
    game.audio.stopMusic(0.1); game.audio.startMusic('championship');
    const oc = UFC.fighterCfg(1);
    edCard('ПУТЬ', me.name.toUpperCase(), 2600, '', () => {
      edText('', ''); edFade(false);
      game.startEdit(cfgOfF(me), oc, (g, o) => UFC.Ceremony.editGlory(g, Object.assign(o, { lines, bigText: (me.titles ? 'ЧЕМПИОН' : 'ЛЕГЕНДА'), bigSub: '«' + me.nick + '»', divName: UFC.divById(me.div).name, fade: edFade })), () => { edFade(true); edWait(1500, edFinish); });
    });
  }
});
})();

