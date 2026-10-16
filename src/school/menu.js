import { SCENARIO_NAMES } from './config.js';

// Экраны: главное меню (сценарий, сложность, когда тревога, персонаж), пауза, помощь, итоги.

const $ = (id) => document.getElementById(id);

export function bindMenus(game) {
  const settings = { type: 'random', difficulty: 1, alarmMode: 'random', fem: Math.random() < 0.5 };
  try {
    const saved = JSON.parse(localStorage.getItem('school17') ?? 'null');
    if (saved) Object.assign(settings, saved);
  } catch { /* без сохранения */ }
  const syncChips = () => {
    for (const group of document.querySelectorAll('.chips')) {
      const key = group.dataset.key;
      for (const b of group.querySelectorAll('button')) {
        const v = key === 'difficulty' ? Number(b.dataset.v) : key === 'fem' ? b.dataset.v === '1' : b.dataset.v;
        b.classList.toggle('on', settings[key] === v);
      }
    }
  };
  for (const group of document.querySelectorAll('.chips')) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const key = group.dataset.key;
      settings[key] = key === 'difficulty' ? Number(b.dataset.v) : key === 'fem' ? b.dataset.v === '1' : b.dataset.v;
      syncChips();
    });
  }
  syncChips();

  const show = (id, on) => { $(id).hidden = !on; };
  const start = () => {
    try { localStorage.setItem('school17', JSON.stringify(settings)); } catch { /* приватный режим */ }
    show('menu', false); show('end', false); show('pause', false); show('help', false);
    show('hud', true);
    document.body.classList.add('playing');
    game.startGame({ ...settings });
  };
  $('btn-start').addEventListener('click', start);
  $('btn-again').addEventListener('click', start);
  const toMenu = () => {
    game.running = false;
    game.paused = true;
    game.clear();
    show('pause', false); show('end', false); show('help', false); show('hud', false);
    document.body.classList.remove('playing');
    show('menu', true);
  };
  $('btn-end-menu').addEventListener('click', toMenu);
  $('btn-menu').addEventListener('click', toMenu);
  $('btn-restart').addEventListener('click', start);
  const resume = () => { show('pause', false); show('help', false); game.paused = false; game.input.enabled = true; };
  $('btn-resume').addEventListener('click', resume);
  $('btn-help').addEventListener('click', () => { show('pause', false); show('help', true); });
  $('btn-help-close').addEventListener('click', () => {
    show('help', false);
    if (game.running) { game.paused = false; game.input.enabled = true; }
  });

  show('loading', false);
  show('menu', true);

  return {
    togglePause() {
      if (!game.running) return;
      // Esc одновременно снимает захват мыши — второй переключатель в ту же секунду игнорируем.
      const now = performance.now();
      if (now - (this.lastToggle ?? 0) < 350) return;
      this.lastToggle = now;
      if (game.paused) resume();
      else {
        game.paused = true;
        game.input.releaseAll();
        show('pause', true);
      }
    },
    toggleHelp() {
      if (!game.running) return;
      const on = $('help').hidden;
      show('help', on);
      game.paused = on;
      if (on) game.input.releaseAll();
    },
    showEnd(r) {
      show('hud', false);
      document.body.classList.remove('playing');
      $('end-title').textContent = r.win ? 'Ты выжил' : 'Ты не выжил';
      $('end').dataset.win = r.win ? '1' : '0';
      $('end-why').textContent = `${SCENARIO_NAMES[r.type] ?? ''} · ${r.why} · ${Math.floor(r.time / 60)} мин ${Math.floor(r.time % 60)} с`;
      $('end-stars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
      $('end-nums').innerHTML = `<div><b>${r.saved}</b><span>в безопасности</span></div><div><b>${r.lost}</b><span>пострадали</span></div><div><b>${r.total}</b><span>было в школе</span></div>`;
      $('end-lines').innerHTML = r.lines.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
      $('end-tips').innerHTML = r.tips.map((t) => `<li>${t}</li>`).join('');
      show('end', true);
    },
  };
}
