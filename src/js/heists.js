import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NPC } from './npc.js';
import { formatMoney } from './ui/hud.js';

// Ограбления банков. Здания банков строит world.js (world.banks), здесь — игра:
//   у двери каждого банка светится метка "$" — подойти пешком и нажать E (ГРАБИТЬ);
//   сразу воет сигнализация, розыск — alarmStars звезды, из дверей выбегают охранники;
//   нужно продержаться у входа duration секунд (не дальше leaveRadius) — полоса сверху;
//   пока идёт ограбление, розыск не гаснет; успех — деньги (reward), банк "закрыт" на cooldown секунд.
// Отряд (squad.js) в это время отбивается от охраны и полиции.

const RING_GEO = new THREE.TorusGeometry(1.1, 0.07, 8, 32).rotateX(Math.PI / 2);

function dollarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1f8f3a';
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#d9ffd9';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.font = '900 84px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('$', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function guardLook(rng) {
  return {
    skin: rng.pick(['#f1c9a5', '#e0ac69', '#c68642', '#8d5524']), hair: '#141414',
    shirt: '#59636b', pants: '#262a2e', shoes: '#0c0c0c', hat: '#2b3136', scale: rng.range(1, 1.08),
  };
}

export class BankSystem {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.active = null; // { bank, time, alarm }
    const tex = dollarTexture();
    this.banks = game.world.banks.map((b) => {
      const y = game.world.getGroundHeight(b.door.x, b.door.z);
      const group = new THREE.Group();
      group.position.set(b.door.x, y, b.door.z);
      const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({
        color: 0x5dff7a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      ring.position.y = 0.06;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
      icon.scale.setScalar(0.9);
      icon.position.y = 2.2;
      group.add(ring, icon);
      game.scene.add(group);
      return { ...b, name: b.def.name, cooldown: 0, group, ring, icon };
    });
  }

  // Банк, у двери которого стоит игрок (пешком), если его можно грабить сейчас.
  canStart() {
    const p = this.game.player;
    if (this.active || p.vehicle || p.isDead || p.isDown || this.game.downState) return null;
    const r2 = CONFIG.banks.startRadius ** 2;
    return this.banks.find((b) => b.cooldown <= 0 &&
      (p.position.x - b.door.x) ** 2 + (p.position.z - b.door.z) ** 2 < r2) ?? null;
  }

  prompt() {
    if (this.active) return '';
    return this.canStart() ? '<b>E</b> — ограбить банк' : '';
  }

  tryStart() {
    const bank = this.canStart();
    if (!bank) return false;
    this._start(bank);
    return true;
  }

  _start(bank) {
    const { game } = this;
    const B = CONFIG.banks;
    this.active = { bank, time: 0, alarm: 0 };
    game.wanted.addHeat(0, B.alarmStars);
    game.hud.toast(`Ограбление! Держись у входа ${B.duration} с`, 3);
    // Охрана выбегает из дверей.
    for (let k = 0; k < B.guards; k++) {
      const side = k % 2 ? 1 : -1;
      const a = bank.toWorld(side * (1 + k * 0.6), -5.2);
      const guard = new NPC(game, game.rng, { x: a.x, z: a.z, role: 'police', look: guardLook(game.rng), weapon: 'pistol' });
      guard.guard = true; // охрана не задерживает, а стреляет
      game.npcs.add(guard);
      guard.aggro(game.player, game.rng.pick(['Ограбление!', 'Стоять!', 'Тревога!']));
      game.wanted.cops.push(guard);
    }
    game.events.emit('heist:start', { bank });
  }

  _finish(success) {
    const { game } = this;
    const B = CONFIG.banks;
    const { bank } = this.active;
    this.active = null;
    game.hud.setProgress(null);
    if (success) {
      const reward = Math.round(game.rng.range(B.reward[0], B.reward[1]) / 10) * 10;
      game.wallet.add(reward);
      game.hud.toast(`Банк ограблен! +${formatMoney(reward)}`, 3.5);
      game.audio.fanfare();
      bank.cooldown = B.cooldown;
      game.events.emit('heist:success', { bank, reward });
    } else {
      game.hud.toast('Ограбление сорвано', 2.5);
      bank.cooldown = B.failCooldown;
      game.events.emit('heist:fail', { bank });
    }
  }

  update(dt) {
    const { game } = this;
    const B = CONFIG.banks;
    this.time += dt;
    for (const b of this.banks) {
      b.cooldown = Math.max(0, b.cooldown - dt);
      const on = b.cooldown <= 0 && this.active?.bank !== b;
      b.group.visible = on;
      if (on) {
        b.icon.position.y = 2.2 + Math.sin(this.time * 2.2) * 0.12;
        b.ring.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.25;
      }
    }

    const h = this.active;
    if (!h) return;
    const p = game.player;
    const d = Math.hypot(p.position.x - h.bank.door.x, p.position.z - h.bank.door.z);
    if (p.isDead || game.downState || p.vehicle || d > B.leaveRadius) {
      this._finish(false);
      return;
    }
    h.time += dt;
    game.wanted.calm = 0; // пока воет сигнализация, розыск не гаснет
    // Сигнализация и напоминание, что нельзя уходить.
    if ((h.alarm -= dt) <= 0) {
      h.alarm = 0.9;
      game.audio.alarm?.(h.bank.group.position);
    }
    const left = Math.ceil(B.duration - h.time);
    game.hud.setProgress(d > B.leaveRadius * 0.7 ? `Вернись к банку! ${left} с` : `ОГРАБЛЕНИЕ · ${left} с`, h.time / B.duration);
    if (h.time >= B.duration) this._finish(true);
  }
}
