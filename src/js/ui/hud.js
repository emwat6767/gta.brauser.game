import * as THREE from 'three';

// HUD поверх канваса (обычный DOM): FPS/отладка, здоровье, звёзды розыска,
// название района, спидометр, подсказка "E", реплики над головами NPC,
// крупные сообщения ("ПОТРАЧЕНО"), панель управления (H).

const _v = new THREE.Vector3();

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

  showBigMessage(text, color) {
    this.bigEl.textContent = text;
    this.bigEl.style.color = color;
    this.bigEl.classList.remove('hidden');
  }

  hideBigMessage() {
    this.bigEl.classList.add('hidden');
  }

  toggleHelp() {
    this.helpEl.classList.toggle('hidden');
  }

  // Реплика над объектом с полем position (NPC, игрок).
  say(entity, text, duration = 1.8) {
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
    else {
      const v = player.findEnterableVehicle();
      if (v) prompt = v.driver ? '<b>E</b> — угнать машину' : '<b>E</b> — сесть в машину';
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
