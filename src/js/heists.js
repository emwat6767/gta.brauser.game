import * as THREE from 'three';
import { CONFIG } from './config.js';
import { NPC, NPC_STATE } from './npc.js';
import { formatMoney } from './ui/hud.js';

// Ограбления банков и магазинов 24/7. Здания строит world.js (world.banks, world.stores),
// здесь — игра. У двери каждого места светится метка "$" — подойти пешком и нажать E:
//   банк    — сигнализация, сразу CONFIG.banks.alarmStars звезды, из дверей выбегает охрана,
//             держаться у входа duration секунд (не дальше leaveRadius);
//   магазин — то же быстрее и тише: 1 звезда, без охраны, продавец просит не стрелять.
// Пока идёт ограбление, розыск не гаснет. Успех — деньги (reward), место "закрыто" на cooldown.
// События: 'heist:start' / 'heist:success' / 'heist:fail' с { place } (place.kind — 'bank' | 'store').

const RING_GEO = new THREE.TorusGeometry(1.1, 0.07, 8, 32).rotateX(Math.PI / 2);

function dollarTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#ffffff';
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

export const heistConfig = (place) => (place.kind === 'bank' ? CONFIG.banks : CONFIG.stores);

export class HeistSystem {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.active = null; // { place, time, alarm, clerk }
    const tex = { bank: dollarTexture('#1f8f3a'), store: dollarTexture('#d9801a') };
    const places = [...game.world.banks, ...game.world.stores];
    this.places = places.map((b) => {
      const y = game.world.getGroundHeight(b.door.x, b.door.z);
      const group = new THREE.Group();
      group.position.set(b.door.x, y, b.door.z);
      const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({
        color: b.kind === 'bank' ? 0x5dff7a : 0xffb347, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      ring.position.y = 0.06;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[b.kind], depthWrite: false }));
      icon.scale.setScalar(b.kind === 'bank' ? 0.9 : 0.7);
      icon.position.y = b.kind === 'bank' ? 2.2 : 1.9;
      group.add(ring, icon);
      game.scene.add(group);
      return { ...b, name: b.def.name, cooldown: 0, group, ring, icon };
    });
  }

  get banks() {
    return this.places.filter((p) => p.kind === 'bank');
  }

  get stores() {
    return this.places.filter((p) => p.kind === 'store');
  }

  // Место, у двери которого стоит игрок (пешком), если его можно грабить сейчас.
  canStart() {
    const p = this.game.player;
    if (this.active || p.vehicle || p.isDead || p.isDown || this.game.downState) return null;
    return this.places.find((b) => b.cooldown <= 0 &&
      (p.position.x - b.door.x) ** 2 + (p.position.z - b.door.z) ** 2 < heistConfig(b).startRadius ** 2) ?? null;
  }

  prompt() {
    const place = this.canStart();
    if (!place) return '';
    return place.kind === 'bank' ? '<b>E</b> — ограбить банк' : '<b>E</b> — ограбить магазин';
  }

  tryStart() {
    const place = this.canStart();
    if (!place) return false;
    this._start(place);
    return true;
  }

  _start(place) {
    const { game } = this;
    const C = heistConfig(place);
    this.active = { place, time: 0, alarm: 0, clerk: null };
    game.wanted.addHeat(0, C.alarmStars);
    game.hud.toast(`Ограбление! Держись у входа ${C.duration} с`, 3);
    if (place.kind === 'store') {
      // Продавец выходит к двери с поднятыми руками... и ждёт, пока его не отпустят.
      const a = place.toWorld(0.6, -1.6);
      const clerk = game.npcs.add(new NPC(game, game.rng, { x: a.x, z: a.z, role: 'civilian' }));
      clerk.heading = place.angle;
      clerk.idleTime = C.duration + 2;
      clerk._enter(NPC_STATE.IDLE);
      clerk.say(game.rng.pick(['Не стреляйте!', 'Берите всё!', 'Только не убивайте!']), true);
      this.active.clerk = clerk;
    }
    // Охрана выбегает из дверей.
    for (let k = 0; k < C.guards; k++) {
      const side = k % 2 ? 1 : -1;
      const a = place.toWorld(side * (1 + k * 0.6), -5.2);
      const guard = new NPC(game, game.rng, { x: a.x, z: a.z, role: 'police', look: guardLook(game.rng), weapon: 'pistol' });
      guard.guard = true; // охрана не задерживает, а стреляет
      game.npcs.add(guard);
      guard.aggro(game.player, game.rng.pick(['Ограбление!', 'Стоять!', 'Тревога!']));
      game.wanted.cops.push(guard);
    }
    game.events.emit('heist:start', { place });
  }

  _finish(success) {
    const { game } = this;
    const { place, clerk } = this.active;
    const C = heistConfig(place);
    this.active = null;
    game.hud.setProgress(null);
    if (clerk && !clerk.isDead) clerk.panic = 6;
    if (success) {
      const reward = Math.round(game.rng.range(C.reward[0], C.reward[1]) / 10) * 10;
      game.wallet.add(reward);
      game.hud.toast(`${place.kind === 'bank' ? 'Банк' : 'Магазин'} ограблен! +${formatMoney(reward)}`, 3.5);
      game.audio.fanfare(place.kind === 'bank' ? 6 : 4);
      place.cooldown = C.cooldown;
      game.events.emit('heist:success', { place, reward });
    } else {
      game.hud.toast('Ограбление сорвано', 2.5);
      place.cooldown = C.failCooldown;
      game.events.emit('heist:fail', { place });
    }
  }

  update(dt) {
    const { game } = this;
    this.time += dt;
    for (const b of this.places) {
      b.cooldown = Math.max(0, b.cooldown - dt);
      const on = b.cooldown <= 0 && this.active?.place !== b;
      b.group.visible = on;
      if (on) {
        b.icon.position.y = (b.kind === 'bank' ? 2.2 : 1.9) + Math.sin(this.time * 2.2) * 0.12;
        b.ring.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.25;
      }
    }

    const h = this.active;
    if (!h) return;
    const C = heistConfig(h.place);
    const p = game.player;
    const d = Math.hypot(p.position.x - h.place.door.x, p.position.z - h.place.door.z);
    if (p.isDead || game.downState || p.vehicle || d > C.leaveRadius) {
      this._finish(false);
      return;
    }
    h.time += dt;
    game.wanted.calm = 0; // пока воет сигнализация, розыск не гаснет
    if ((h.alarm -= dt) <= 0) {
      h.alarm = 0.9;
      game.audio.alarm?.(h.place.group.position);
    }
    const left = Math.ceil(C.duration - h.time);
    game.hud.setProgress(d > C.leaveRadius * 0.7 ? `Вернись ко входу! ${left} с` : `ОГРАБЛЕНИЕ · ${left} с`, h.time / C.duration);
    if (h.time >= C.duration) this._finish(true);
  }
}
