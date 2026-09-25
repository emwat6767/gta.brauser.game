import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createWeaponModel } from './weapons.js';
import { mergeColored } from './geometry.js';

// Предметы на земле: вращающаяся модель над светящимся кольцом.
//   - оружие из CONFIG.pickups.spots — после подбора появляется снова через respawn секунд;
//   - выпавшее из убитых NPC оружие (drop) исчезает через 40 с;
//   - деньги (dropCash) выпадают из убитых, подтягиваются к игроку в радиусе magnetRadius.
// Подбирает игрок пешком, просто подойдя ближе radius.

const RING_GEO = new THREE.TorusGeometry(0.45, 0.04, 6, 24).rotateX(Math.PI / 2);
const RING_COLORS = { pistol: 0x6fe38a, shotgun: 0xffb347, smg: 0x5fb8ff, cash: 0x7dff7a };

let CASH = null;
function cashModel() {
  CASH ??= {
    geometry: mergeColored([
      { geometry: new THREE.BoxGeometry(0.3, 0.1, 0.15), color: 0x3f8f42 },
      { geometry: new THREE.BoxGeometry(0.06, 0.106, 0.156), color: 0xe4efd8 },
      { geometry: new THREE.BoxGeometry(0.3, 0.1, 0.15).translate(0.03, 0.1, -0.02), color: 0x357a38 },
      { geometry: new THREE.BoxGeometry(0.06, 0.106, 0.156).translate(0.03, 0.1, -0.02), color: 0xe4efd8 },
    ]),
    material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }),
  };
  const m = new THREE.Mesh(CASH.geometry, CASH.material);
  m.castShadow = true;
  return m;
}

export class PickupSystem {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.time = 0;
    for (const s of CONFIG.pickups.spots) this._create(s.x, s.z, s.weapon, s.ammo, true);

    // Из убитых выпадают деньги.
    game.events.on('character:killed', ({ target }) => {
      const range = CONFIG.economy.drops[target.role];
      if (!range || target === game.player) return;
      this.dropCash(target.position.x, target.position.z, game.rng.int(range[0], range[1]));
    });
  }

  _create(x, z, weapon, ammo, persistent) {
    const group = new THREE.Group();
    const y = this.game.world.getGroundHeight(x, z);
    group.position.set(x, y, z);
    const model = weapon === 'cash' ? cashModel() : createWeaponModel(weapon);
    model.scale.setScalar(weapon === 'cash' ? 1.6 : 2.2);
    model.position.y = weapon === 'cash' ? 0.5 : 0.9;
    model.rotation.y = Math.PI / 2;
    const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({
      color: RING_COLORS[weapon], transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    ring.position.y = 0.05;
    group.add(model, ring);
    this.game.scene.add(group);
    const item = { group, model, ring, weapon, ammo, persistent, active: true, timer: 0, x, z };
    this.items.push(item);
    return item;
  }

  // Пачка денег на земле (исчезает через 60 с).
  dropCash(x, z, amount) {
    const item = this._create(x + (Math.random() - 0.5), z + (Math.random() - 0.5), 'cash', amount, false);
    item.timer = 60;
    return item;
  }

  // Оружие, выпавшее из убитого NPC.
  drop(x, z, weapon, ammo) {
    const item = this._create(x, z, weapon, ammo, false);
    item.timer = 40;
    return item;
  }

  update(dt) {
    this.time += dt;
    const { player, hud, audio } = this.game;
    const r2 = CONFIG.pickups.radius ** 2;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.active) {
        // ждёт повторного появления
        it.timer -= dt;
        if (it.timer <= 0) {
          it.active = true;
          it.group.visible = true;
        }
        continue;
      }
      it.model.rotation.y += dt * 1.8;
      it.model.position.y = (it.weapon === 'cash' ? 0.5 : 0.9) + Math.sin(this.time * 2.5 + it.x) * 0.08;
      it.ring.material.opacity = 0.55 + Math.sin(this.time * 4) * 0.25;
      if (!it.persistent) {
        it.timer -= dt;
        if (it.timer <= 0) {
          this._remove(i);
          continue;
        }
      }
      if (player.vehicle || player.isDead) continue;
      const dx = player.position.x - it.x, dz = player.position.z - it.z;
      const d2 = dx * dx + dz * dz;
      if (it.weapon === 'cash') {
        // Магнит: деньги подлетают к игроку.
        if (d2 < CONFIG.economy.magnetRadius ** 2) {
          const k = Math.min(1, dt * 9);
          it.x += dx * k;
          it.z += dz * k;
          it.group.position.set(it.x, this.game.world.getGroundHeight(it.x, it.z), it.z);
        }
        if (d2 > r2) continue;
        this.game.wallet.add(it.ammo);
        audio.pickup();
        this._remove(i);
        continue;
      }
      if (d2 > r2) continue;
      const isNew = player.giveWeapon(it.weapon, it.ammo);
      const name = CONFIG.weapons[it.weapon].name;
      if (!CONFIG.player.infiniteAmmo) hud.toast(`${isNew ? '' : '+ '}${name} (${it.ammo})`);
      else if (isNew) hud.toast(name);
      audio.pickup();
      if (it.persistent) {
        it.active = false;
        it.group.visible = false;
        it.timer = CONFIG.pickups.respawn;
      } else {
        this._remove(i);
      }
    }
  }

  _remove(i) {
    const it = this.items[i];
    it.group.removeFromParent();
    it.ring.material.dispose();
    this.items.splice(i, 1);
  }
}
