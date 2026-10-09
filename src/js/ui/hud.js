import * as THREE from 'three';

// HUD поверх канваса (обычный DOM): FPS/отладка, деньги, здоровье, звёзды розыска,
// название района, спидометр, подсказка "E", реплики над головами NPC,
// крупные сообщения ("ПОТРАЧЕНО"), полоса ограбления, панель управления (H).

const _v = new THREE.Vector3();
const ENERGY_MODES = new Set(['exo', 'titan', 'gravity', 'frost', 'duel_villain', 'duel_hero']);   // режимы, где F целится прицелом
export const formatMoney = (n) => `$${Math.floor(n).toLocaleString('ru-RU')}`;

export class HUD {
  constructor(game) {
    this.game = game;
    this.fpsEl = document.getElementById('fps');
    this.speedEl = document.getElementById('speedometer');
    this.speedValueEl = document.getElementById('speed-value');
    this.promptEl = document.getElementById('prompt');
    this.helpEl = document.getElementById('help');
    this.bubbleLayer = document.getElementById('bubbles');
    this.frames = 0;
    this.elapsed = 0;
    this.bubbles = [];
    this._prompt = '';

    this.healthBar = document.getElementById('health-bar');
    this.healthFill = document.getElementById('health-fill');
    this.wantedEl = document.getElementById('wanted');
    this.stars = [...this.wantedEl.children];
    this.zoneEl = document.getElementById('zone');
    this.flashEl = document.getElementById('damage-flash');
    this.bigEl = document.getElementById('big-message');
    this._zoneTimer = 0;
    this._flash = 0;
    this._health = -1;

    this.weaponNameEl = document.getElementById('weapon-name');
    this.weaponAmmoEl = document.getElementById('weapon-ammo');
    this.reloadBar = document.getElementById('reload-bar');
    this.reloadFill = document.getElementById('reload-fill');
    this.crosshair = document.getElementById('crosshair');
    this.hitEl = document.getElementById('hitmarker');
    this.hitText = this.hitEl.querySelector('span');
    this.toastEl = document.getElementById('toast');
    this._hitTimer = 0;
    this._toastTimer = 0;
    this._weaponText = '';
    this.moneyEl = document.getElementById('money');
    this.moneyPopEl = document.getElementById('money-pop');
    this._money = -1;
    this.objectiveEl = document.getElementById('objective');
    this.newsEl = document.getElementById('news');
    this._objective = '';
    this.heistEl = document.getElementById('heist');
    this.heistLabel = document.getElementById('heist-label');
    this.heistFill = document.getElementById('heist-fill');
    this.gadgetEl = document.getElementById('gadgets');
    this.bossEl = document.getElementById('boss-bar');
    this.bossName = document.getElementById('boss-name');
    this.bossFill = document.getElementById('boss-fill');
    this.modeEl = document.getElementById('modestrip');
    this.timeEl = document.getElementById('timefx');
    this._modeTimer = 0;
    this._gadgetMode = '';
    this._bossKey = '';

    game.events.on('money:changed', ({ delta, quiet }) => {
      if (quiet || !delta) return;
      const el = document.createElement('div');
      el.className = 'mpop';
      el.textContent = `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta))}`;
      el.style.color = delta > 0 ? '#7dff7a' : '#ff8a8a';
      this.moneyPopEl.appendChild(el);
      setTimeout(() => el.remove(), 1300);
    });

    game.events.on('power:changed', () => this._showModes());
    game.events.on('wanted:changed', ({ level, up }) => {
      this.stars.forEach((star, i) => star.classList.toggle('on', i < level));
      if (up) {
        this.wantedEl.classList.remove('flash');
        void this.wantedEl.offsetWidth; // перезапуск CSS-анимации
        this.wantedEl.classList.add('flash');
      }
    });
    game.events.on('zone:changed', ({ gang }) => {
      if (!gang) return;
      this.zoneEl.textContent = gang.name;
      this.zoneEl.style.color = gang.color;
      this.zoneEl.classList.add('show');
      this._zoneTimer = 3;
    });
    game.events.on('character:damaged', ({ target, amount }) => {
      if (target === game.player) this._flash = Math.min(1, 0.35 + amount / 30);
    });
  }

  // Название места (район, достопримечательность) — той же табличкой, что территории банд.
  announce(text, color = '#f2f2f2') {
    this.zoneEl.textContent = text;
    this.zoneEl.style.color = color;
    this.zoneEl.classList.add('show');
    this._zoneTimer = 3;
  }

  // Индикатор попадания в центре экрана: белый — попал, красный — убил.
  hitMarker(killed, headshot) {
    this._hitTimer = killed ? 0.35 : 0.15;
    this.hitEl.style.color = killed ? '#ff4d4d' : '#ffffff';
    this.hitText.textContent = headshot ? 'В ГОЛОВУ' : '';
  }

  toast(text, seconds = 2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this._toastTimer = seconds;
  }

  showBigMessage(text, color) {
    this.bigEl.textContent = text;
    this.bigEl.style.color = color;
    this.bigEl.classList.remove('hidden');
  }

  hideBigMessage() {
    this.bigEl.classList.add('hidden');
  }

  // Лента событий города (слева вверху): перестрелки, налёты, погони. Последние 4, гаснут сами.
  news(text, color = '#ffd54a') {
    const el = document.createElement('div');
    el.className = 'news-item';
    el.style.borderLeftColor = color;
    el.textContent = text;
    this.newsEl.prepend(el);
    while (this.newsEl.children.length > 4) this.newsEl.lastChild.remove();
    setTimeout(() => el.classList.add('old'), 7000);
    setTimeout(() => el.remove(), 8000);
  }

  // Текущая цель (задание, война за район) сверху по центру; '' — скрыть. Можно <b>.
  setObjective(html) {
    if (html === this._objective) return;
    this._objective = html;
    this.objectiveEl.innerHTML = html;
    this.objectiveEl.classList.toggle('hidden', !html);
  }

  // Полоса прогресса по центру сверху (ограбление): null — скрыть.
  setProgress(label, value) {
    this.heistEl.classList.toggle('hidden', label == null);
    if (label == null) return;
    this.heistLabel.textContent = label;
    this.heistFill.style.width = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
  }

  // Полоса режимов на пару секунд после смены (X вперёд, V назад): видно, что дальше.
  _showModes() {
    const pw = this.game.powers;
    const list = pw.modeList();
    const cur = pw.mode;
    let html = list.map((m) => `<span class="${m.mode === cur ? 'on' : ''}" style="--mc:${m.color}">${m.name}</span>`).join('');
    if (!list.some((m) => m.mode === cur)) html += `<span class="on" style="--mc:${pw.color}">${pw.name}</span>`;
    this.modeEl.innerHTML = html;
    this.modeEl.classList.remove('hidden');
    this._modeTimer = 2.8;
  }

  // Способности режима силы (Q R G): подпись и полоска готовности.
  _updateGadgets(powers) {
    const mode = powers?.mode ?? 'normal';
    if (mode !== this._gadgetMode) {
      this._gadgetMode = mode;
      this.gadgetEl.classList.toggle('hidden', mode === 'normal');
      this.gadgetEl.style.setProperty('--gc', powers?.color ?? '#ffd54a');
      this.gadgetEl.innerHTML = mode === 'normal' ? '' : powers.gadgetInfo()
        .map((g) => `<div class="gchip"><b>${g.key}</b><span>${g.name}</span><i></i></div>`).join('');
      this._chips = [...this.gadgetEl.children];
    }
    if (mode === 'normal') return;
    const info = powers.gadgetInfo();
    info.forEach((g, i) => {
      const chip = this._chips[i];
      if (!chip) return;
      const label = chip.children[1];
      if (label.textContent !== g.name) label.textContent = g.name;
      chip.classList.toggle('ready', g.ready >= 1);
      chip.lastChild.style.setProperty('--ready', g.ready.toFixed(2));
    });
  }

  // Полоса босса города (bosses.js): показывается, пока он рядом и дерётся.
  _updateBossBar() {
    const b = this.game.bosses?.barTarget?.() ?? null;
    if (!b) {
      if (this._bossKey) {
        this._bossKey = '';
        this.bossEl.classList.add('hidden');
      }
      return;
    }
    const key = `${b.kind}|${b.name}`;
    if (key !== this._bossKey) {
      this._bossKey = key;
      this.bossEl.classList.remove('hidden');
      this.bossEl.style.setProperty('--bc', b.color);
      this.bossName.innerHTML = `${b.name}<small>${b.title}</small>`;
    }
    this.bossFill.style.width = `${Math.max(0, Math.round(b.hp * 100))}%`;
  }

  toggleHelp() {
    this.helpEl.classList.toggle('hidden');
  }

  // Реплика над объектом с полем position (NPC, игрок).
  say(entity, text, duration = 1.8) {
    // Реплики дальних людей не показываем — иначе экран в облачках.
    if (entity !== this.game.player && entity.position.distanceToSquared(this.game.player.position) > 45 * 45) return;
    const old = this.bubbles.find((b) => b.entity === entity);
    if (old) this._removeBubble(old);
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    this.bubbleLayer.appendChild(el);
    this.bubbles.push({ entity, el, time: 0, duration });
  }

  _removeBubble(b) {
    b.el.remove();
    this.bubbles.splice(this.bubbles.indexOf(b), 1);
  }

  update(dt) {
    const { player, renderer, camera } = this.game;

    // FPS + отладочная статистика рендера, раз в полсекунды.
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      const fps = this.frames / this.elapsed;
      const info = renderer.info.render;
      this.fpsEl.textContent = `FPS ${fps.toFixed(0)} · ${info.calls} dc · ${(info.triangles / 1000).toFixed(0)}k tri`;
      this.fpsEl.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad';
      this.frames = 0;
      this.elapsed = 0;
    }

    // Деньги.
    const money = this.game.wallet.money;
    if (money !== this._money) {
      this._money = money;
      this.moneyEl.textContent = formatMoney(money);
    }

    // Здоровье.
    const hp = Math.max(0, Math.round((player.health / player.maxHealth) * 100));
    if (hp !== this._health) {
      this._health = hp;
      this.healthFill.style.width = `${hp}%`;
      this.healthBar.classList.toggle('low', hp < 25);
    }

    // Красная вспышка по краям экрана при уроне; название района гаснет через 3 с.
    this._flash = Math.max(0, this._flash - dt * 1.5);
    this.flashEl.style.opacity = this._flash.toFixed(2);
    if (this._zoneTimer > 0 && (this._zoneTimer -= dt) <= 0) this.zoneEl.classList.remove('show');

    // Оружие: название, патроны (магазин / запас), перезарядка, перекрестье.
    const powers = this.game.powers;
    const superMode = !!powers?.unarmed;
    const modeTag = powers?.mode ?? 'normal';
    const gun = superMode ? null : player.gun;
    const wText = superMode ? modeTag : gun ? `${gun.def.name}|${gun.mag}|${gun.reserve}|${modeTag}` : `fists|${modeTag}`;
    if (wText !== this._weaponText) {
      this._weaponText = wText;
      this.weaponNameEl.textContent = superMode ? powers.name : gun ? gun.def.name : 'Кулаки';
      this.weaponNameEl.style.color = modeTag !== 'normal' ? powers.color : '';
      this.weaponAmmoEl.textContent = superMode ? 'РЕЖИМ' : !gun ? '' : gun.bottomless ? '∞' : `${gun.mag} | ${gun.reserve}`;
      this.weaponAmmoEl.classList.toggle('empty', !!gun && gun.mag === 0);
    }
    this._updateGadgets(powers);
    if (this._modeTimer > 0 && (this._modeTimer -= dt) <= 0) this.modeEl.classList.add('hidden');
    const ts = this.game.timeScale;
    this.timeEl.style.opacity = ts < 0.99 ? String(Math.min(1, 1 - ts)) : '0';
    this._updateBossBar();
    this.reloadBar.classList.toggle('hidden', !gun?.reloading);
    if (gun?.reloading) this.reloadFill.style.width = `${Math.round(gun.reloadProgress * 100)}%`;
    const energy = ENERGY_MODES.has(modeTag);
    const showCross = (!!gun || energy) && !player.vehicle && !player.isDead &&
      (player.aiming || player.shootTimer > 0 || this.game.input.touchActive || this.game.input.pointerLocked);
    this.crosshair.classList.toggle('hidden', !showCross);
    if (showCross) {
      const px = gun ? 3 + gun.spread(player.horizontalSpeed > 0.5) * (player.aiming ? 0.45 : 1) * window.innerHeight * 0.9 : 6;
      this.crosshair.style.setProperty('--gap', `${Math.min(40, px).toFixed(1)}px`);
    }
    this._hitTimer = Math.max(0, this._hitTimer - dt);
    this.hitEl.style.opacity = this._hitTimer > 0 ? '1' : '0';
    if (this._toastTimer > 0 && (this._toastTimer -= dt) <= 0) this.toastEl.classList.remove('show');

    // Спидометр.
    if (player.vehicle) {
      this.speedEl.classList.remove('hidden');
      this.speedValueEl.textContent = Math.round(Math.abs(player.vehicle.speed) * 3.6);
    } else {
      this.speedEl.classList.add('hidden');
    }

    // Подсказка взаимодействия.
    let prompt = '';
    if (player.vehicle) prompt = '<b>E</b> — выйти из машины';
    else if (powers?.mode === 'colossus') {
      prompt = powers.carried ? '<b>F</b> или <b>E</b> — бросить машину' : this.game.heists?.prompt() || '';
      if (!prompt && this.game.vehicles.some((v) => !v.carried && v.distanceToPoint(player.position.x, player.position.z) < 3.2)) prompt = '<b>E</b> — поднять машину';
    } else {
      const v = player.findEnterableVehicle();
      if (v) prompt = v.driver ? '<b>E</b> — угнать машину' : '<b>E</b> — сесть в машину';
      else prompt = this.game.heists?.prompt() ?? '';
    }
    if (prompt !== this._prompt) {
      this._prompt = prompt;
      this.promptEl.innerHTML = prompt;
      this.promptEl.classList.toggle('hidden', !prompt);
    }

    // Реплики: проецируем точку над головой на экран.
    const w = window.innerWidth, h = window.innerHeight;
    for (const b of [...this.bubbles]) {
      b.time += dt;
      if (b.time > b.duration) {
        this._removeBubble(b);
        continue;
      }
      _v.copy(b.entity.position);
      _v.y += 2.1;
      _v.project(camera);
      const visible = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      b.el.style.display = visible ? 'block' : 'none';
      if (visible) {
        const x = (_v.x * 0.5 + 0.5) * w;
        const y = (-_v.y * 0.5 + 0.5) * h - b.time * 12;
        b.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        b.el.style.opacity = String(Math.min(1, (b.duration - b.time) * 3));
      }
    }
  }
}
