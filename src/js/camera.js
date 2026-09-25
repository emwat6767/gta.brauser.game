import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, damp, dampAngle } from './utils.js';

// Камера от третьего лица: орбита вокруг игрока/машины (yaw/pitch от мыши),
// зум колесом, в машине — автоматически встаёт за корпус, если мышь не трогать.
// Не проходит сквозь здания: луч от цели к камере проверяется по коллайдерам.

export class CameraRig {
  constructor(game) {
    const C = CONFIG.camera;
    this.game = game;
    this.camera = game.camera;
    this.yaw = CONFIG.player.spawn.heading;   // yaw = 0: камера смотрит в +Z
    this.pitch = 0.22;
    this.zoom = 1;
    this.distance = C.distanceOnFoot;         // текущая (с учётом препятствий)
    this.mouseIdle = 0;
    this.pivot = new THREE.Vector3();
    this.initialized = false;
    this._target = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  // Ввод обрабатывается до симуляции, чтобы игрок шёл туда, куда смотрит камера.
  handleInput(dt) {
    const C = CONFIG.camera;
    const input = this.game.input;
    if (input.mouseDX || input.mouseDY) {
      this.yaw -= input.mouseDX * C.sensitivity;
      this.pitch = clamp(this.pitch + input.mouseDY * C.sensitivity, C.pitchMin, C.pitchMax);
      this.mouseIdle = 0;
    } else {
      this.mouseIdle += dt;
    }
    if (input.wheel) this.zoom = clamp(this.zoom * (1 + input.wheel * 0.12), 0.55, 2.2);
  }

  update(dt) {
    const C = CONFIG.camera;
    const { player, world } = this.game;
    const vehicle = player.vehicle;

    if (vehicle) {
      this._target.copy(vehicle.position).y += C.targetHeightVehicle;
      if (this.mouseIdle > C.autoAlignDelay && Math.abs(vehicle.speed) > 2) {
        this.yaw = dampAngle(this.yaw, vehicle.heading, C.autoAlignRate, dt);
      }
    } else {
      this._target.set(player.position.x, player.visualY + C.targetHeightOnFoot, player.position.z);
    }

    if (!this.initialized) {
      this.pivot.copy(this._target);
      this.initialized = true;
    } else {
      const k = vehicle ? 14 : 22;
      this.pivot.x = damp(this.pivot.x, this._target.x, k, dt);
      this.pivot.y = damp(this.pivot.y, this._target.y, k * 0.6, dt);
      this.pivot.z = damp(this.pivot.z, this._target.z, k, dt);
    }

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    const shoulder = vehicle ? 0 : C.shoulderOffset;
    const look = this._look.set(this.pivot.x + rx * shoulder, this.pivot.y, this.pivot.z + rz * shoulder);

    const wanted = (vehicle ? C.distanceVehicle : C.distanceOnFoot) * this.zoom;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirX = -fx * cp, dirY = sp, dirZ = -fz * cp;

    // Столкновение камеры со зданиями: шагаем по лучу от цели.
    let free = wanted;
    for (let t = 0.3; t <= wanted; t += 0.25) {
      if (world.isPointInsideBuilding(look.x + dirX * t, look.y + dirY * t, look.z + dirZ * t)) {
        free = Math.max(0.3, t - 0.35);
        break;
      }
    }
    this.distance = free < this.distance ? free : damp(this.distance, free, 3, dt);

    const d = this.distance;
    const pos = this._desired.set(look.x + dirX * d, look.y + dirY * d, look.z + dirZ * d);
    const minY = world.getGroundHeight(pos.x, pos.z) + 0.35;
    if (pos.y < minY) pos.y = minY;

    this.camera.position.copy(pos);
    this.camera.lookAt(look);

    // Лёгкое расширение FOV на скорости.
    const speed = vehicle ? Math.abs(vehicle.speed) : 0;
    const fov = C.fov + clamp(speed / CONFIG.vehicle.maxSpeed, 0, 1) * 12;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = damp(this.camera.fov, fov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}
