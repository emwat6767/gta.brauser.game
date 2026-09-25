import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createWeaponModel } from './weapons.js';

// Оружие/патроны на земле: вращающаяся модель над светящимся кольцом.
//   - точки из CONFIG.pickups.spots — после подбора появляются снова через respawn секунд;
//   - выпавшее из убитых NPC оружие (drop) исчезает через 40 с.
// Подбирает игрок пешком, просто подойдя ближе radius.

const RING_GEO = new THREE.TorusGeometry(0.45, 0.04, 6, 24).rotateX(Math.PI / 2);
const RING_COLORS = { pistol: 0x6fe38a, shotgun: 0xffb347, smg: 0x5fb8ff };

export class PickupSystem {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.time = 0;
    for (const s of CONFIG.pickups.spots) this._create(s.x, s.z, s.weapon, s.ammo, true);
  }

  _create(x, z, weapon, ammo, persistent) {
    const group = new THREE.Group();
    const y = this.game.world.getGroundHeight(x, z);
    group.position.set(x, y, z);
    const model = createWeaponModel(weapon);
    model.scale.setScalar(2.2);
    model.position.y = 0.9;
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
      it.model.position.y = 0.9 + Math.sin(this.time * 2.5 + it.x) * 0.08;
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
      if (dx * dx + dz * dz > r2) continue;
      const isNew = player.giveWeapon(it.weapon, it.ammo);
      hud.toast(`${isNew ? '' : '+ '}${CONFIG.weapons[it.weapon].name} (${it.ammo})`);
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
