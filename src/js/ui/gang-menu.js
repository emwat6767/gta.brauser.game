import { CONFIG } from '../config.js';
import { MISSIONS } from '../missions.js';
import { formatMoney } from './hud.js';

// Меню банды ("телефон"): репутация и бонусы, задания, районы.
// J / кнопка ЗАДАНИЯ — открыть/закрыть, Esc — закрыть. Пока меню открыто, игра стоит.

const $ = (id) => document.getElementById(id);

export class GangMenu {
  constructor(game) {
    this.game = game;
    this.root = $('gang-menu');
    this.body = $('gm-body');
    $('gm-close').addEventListener('click', () => this.toggle(false));
    // Закрыть по клику мимо панели.
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.toggle(false);
    });
    this.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const { act, id } = el.dataset;
      const M = game.missions;
      if (act === 'start') {
        if (M.start(id)) this.toggle(false);
        else this.render();
      } else if (act === 'cancel') {
        M.cancel();
        this.render();
      } else if (act === 'squad') {
        game.squad.toggle();
        this.render();
      }
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  toggle(open = !this.isOpen) {
    const { game } = this;
    if (open && game.paused) return;
    this.root.classList.toggle('hidden', !open);
    game.menuOpen = open;
    if (open) {
      document.exitPointerLock?.();
      this.render();
    } else if (!game.paused && !game.input.touchActive) {
      game.input.requestPointerLock();
    }
  }

  render() {
    const { game } = this;
    const P = game.progress;
    const home = game.gangs.gangs.find((g) => g.friendly);
    $('gm-title').textContent = home?.name ?? 'Банда';
    $('gm-title').style.color = home?.color ?? '#fff';

    // Репутация.
    const next = P.next;
    const lv = CONFIG.reputation.levels;
    const perks = lv.map((L, i) => {
      const got = i <= P.level;
      const text = L.perk ?? `Отряд из ${L.squad} бойцов`;
      return `<li class="${got ? 'got' : ''}"><span class="lvl">${L.title}</span>${text}${got ? '' : ` <small>(${L.at} реп.)</small>`}</li>`;
    }).join('');
    const rep = `<section><h3>Репутация: <b>${P.stats.title}</b></h3>` +
      `<div class="gm-bar"><div style="width:${Math.round(P.progress * 100)}%"></div></div>` +
      `<div class="gm-sub">${P.points} очков${next ? ` · до «${next.title}» ещё ${next.at - P.points}` : ' · максимум'}</div>` +
      `<ul class="gm-perks">${perks}</ul>` +
      `<div class="gm-row"><span>Отряд: <b>${game.squad.size}/${game.squad.max}</b> бойцов</span>` +
      `<button type="button" data-act="squad">${game.squad.size ? 'Отпустить' : 'Позвать (T)'}</button></div></section>`;

    // Задания.
    const M = game.missions;
    const cards = MISSIONS.map((d) => {
      const R = CONFIG.missions[d.id];
      const active = M.active?.def.id === d.id;
      const btn = active
        ? '<button type="button" class="cancel" data-act="cancel">Отменить</button>'
        : `<button type="button" data-act="start" data-id="${d.id}" ${M.active || game.turf.busy ? 'disabled' : ''}>Начать</button>`;
      const done = M.completed[d.id] ? ` · выполнено: ${M.completed[d.id]}` : '';
      return `<div class="gm-mission${active ? ' active' : ''}"><div><b>${d.name}</b>${active ? ' <em>идёт</em>' : ''}` +
        `<p>${d.desc}</p><small>${formatMoney(R.reward)} · +${R.rep} репутации${done}</small></div>${btn}</div>`;
    }).join('');
    const missions = `<section><h3>Задания</h3>${cards}</section>`;

    // Районы.
    const turf = game.turf;
    const rows = game.gangs.gangs.map((g) =>
      `<div class="gm-gang"><i style="background:${g.color}"></i>${g.name}<b>${g.blocks.length ? `${g.blocks.length} кв.` : 'разгромлены'}</b></div>`).join('');
    const status = turf.war ? '<p class="warn">Идёт война за район!</p>'
      : turf.attack ? `<p class="warn">${turf.attack.gang.name} напали на ваш район!</p>` : '';
    const territory = `<section><h3>Районы</h3>${rows}${status}` +
      `<p class="gm-hint">Война за район: убейте ${CONFIG.turf.killsToStart} бандитов на их территории — ` +
      `и отбейте ${CONFIG.turf.waves.length} волны. Захваченные районы конкуренты будут пытаться вернуть.</p></section>`;

    this.body.innerHTML = rep + missions + territory;
  }
}
