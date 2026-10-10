import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Vehicle } from './vehicle.js';
import { pushCircleOutOfBox } from './collision.js';
import { clamp, damp } from './utils.js';

// Ударный вертолёт (профиль 'heli' в military-models.js, нос-пулемёт и ракеты — military.js).
//   W / S — вперёд / назад, A / D — поворот, Space — вверх, Shift или Z — вниз, ЛКМ / F — пулемёт, ПКМ / C — ракеты.
//   Винт раскручивается, когда в кабине кто-то есть; без пилота вертолёт плавно снижается.
//   Ведёт игрок или ИИ-пилот (war-ai.js: HeliPilot.drive(dt, controls) задаёт throttle / steer / climb).
// Здания и деревья его задевают, только если он ниже их крыши (по высоте коллайдера).

const _hit = { nx: 0, nz: 0, depth: 0 };
const CRUISE = 32;       // м/с вперёд
const CLIMB = 8;         // м/с вверх
let ROTOR_GEO = null;

function rotorAssets() {
  if (ROTOR_GEO) return ROTOR_GEO;
  ROTOR_GEO = {
    blade: new THREE.BoxGeometry(9.2, 0.035, 0.34),
    bladeMat: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 }),
    disc: new THREE.CircleGeometry(4.7, 28).rotateX(-Math.PI / 2),
    discMat: new THREE.MeshBasicMaterial({ color: 0x20262a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    tail: new THREE.BoxGeometry(0.03, 1.5, 0.16),
  };
  return ROTOR_GEO;
}

export class Helicopter extends Vehicle {
  constructor(game, opts) {
    super(game, { ...opts, type: 'heli' });
    const R = rotorAssets();
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 2.42, 0.2);
    this.blades = [new THREE.Mesh(R.blade, R.bladeMat), new THREE.Mesh(R.blade, R.bladeMat).rotateY(Math.PI / 2)];
    for (const b of this.blades) {
      b.castShadow = true;
      this.rotor.add(b);
    }
    this.discMat = R.discMat.clone();
    this.rotor.add(new THREE.Mesh(R.disc, this.discMat));
    this.body.add(this.rotor);
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.18, 1.95, -6.85);
    this.tailRotor.add(new THREE.Mesh(R.tail, R.bladeMat));
    this.tailRotor.add(new THREE.Mesh(R.tail, R.bladeMat).rotateX(Math.PI / 2));
    this.body.add(this.tailRotor);
    this.rotorSpeed = 0;     // 0..1
    this.rotorAngle = 0;
    this.vy = 0;
    this.altitude = 0;       // над землёй, м
    this.tiltP = 0;
    this.tiltR = 0;
    this.climb = 0;
    this.persistent = true;
    this.controls.climb = 0;
  }

  dispose() {
    super.dispose();
    this.discMat.dispose();
  }

  // Взрыв и толчки: живой вертолёт почти не отбрасывает, подбитый падает.
  launch(vx, vy, vz, spin = 0) {
    if (this.wrecked) {
      this.air ??= { vy: 0, roll: this._roll, rollSpeed: 0 };
      this.velocity.x += vx * 0.3;
      this.velocity.z += vz * 0.3;
      this.air.vy += vy * 0.4;
      this.air.rollSpeed += spin * 1.5;
      return;
    }
    this.velocity.x += vx * 0.25;
    this.velocity.z += vz * 0.25;
    this.vy += vy * 0.15;
  }

  explode(by) {
    this.altitude = Math.max(0, this.position.y - this.game.world.getGroundHeight(this.position.x, this.position.z));
    super.explode(by);
    this.air ??= { vy: 0, roll: 0, rollSpeed: 1.2 };
    this.air.vy = Math.min(this.air.vy, 1);
    this.rotorSpeed = 0.3;
  }

  _readControls(dt) {
    const c = this.controls;
    const player = this.game.player;
    c.climb = 0;
    if (this.driver && this.driver === player && !player.isDead) {
      const input = this.game.input;
      c.throttle = input.axis('backward', 'forward');
      c.steer = input.axis('right', 'left');
      c.handbrake = false;
      c.climb = (input.isDown('jump') ? 1 : 0) - (input.isDown('run') || input.isDown('descend') ? 1 : 0);
    } else if (this.driver && this.ai) {
      this.ai.drive(dt, c);
    } else {
      c.throttle = 0;
      c.steer = 0;
      c.handbrake = false;
    }
    return c;
  }

  // Пока крутится винт — вертолёт летит и вращает лопасти. Если упал с неба (air) — Vehicle._updateAir.
  _drive(dt) {
    const world = this.game.world;
    const c = this._readControls(dt);
    this.turret?.update(dt);
    const on = !!this.driver;
    this.rotorSpeed = damp(this.rotorSpeed, on ? 1 : 0, on ? 1.1 : 0.35, dt);
    const lift = this.rotorSpeed > 0.8;
    const ground = world.getGroundHeight(this.position.x, this.position.z);
    this.altitude = this.position.y - ground;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let vf = this.velocity.x * fx + this.velocity.z * fz;
    const grounded = this.altitude < 0.12;
    const vfTarget = lift && !grounded ? c.throttle * (c.throttle > 0 ? CRUISE : CRUISE * 0.4) : 0;
    vf = damp(vf, vfTarget, lift ? (vfTarget ? 0.9 : 0.55) : 1.5, dt);
    this.velocity.x = fx * vf;
    this.velocity.z = fz * vf;
    this.forwardSpeed = vf;

    // Высота: рычаг "вверх / вниз" (в воздухе без команды — висит), без пилота — плавное снижение.
    const g = CONFIG.physics.gravity;
    let vyTarget;
    if (lift) vyTarget = c.climb * CLIMB;
    else if (!on && !grounded) vyTarget = -4;
    else vyTarget = grounded ? 0 : this.vy - g * dt;
    this.vy = damp(this.vy, vyTarget, lift ? 2.4 : 1.2, dt);
    if (grounded && c.climb <= 0 && this.vy < 0) this.vy = 0;

    // Поворот: на земле не вертится.
    const yawTarget = lift && !grounded ? c.steer * 1.25 : lift ? c.steer * 0.6 : 0;
    this.yawRate = damp(this.yawRate, yawTarget, 3.5, dt);
    this.heading += this.yawRate * dt;

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.vy * dt;
    this._collideAir();
    const g2 = world.getGroundHeight(this.position.x, this.position.z);
    if (this.position.y < g2) {
      const hard = -this.vy;
      this.position.y = g2;
      if (hard > 9 && !this.wrecked) this.damage((hard - 9) * 18, this.driver);
      this.vy = 0;
    }
    if (this.position.y > 150) { this.position.y = 150; this.vy = Math.min(0, this.vy); }

    // Наклон корпуса: нос вниз на ходу, крен в повороте.
    this.tiltP = damp(this.tiltP, clamp(vf / CRUISE, -0.6, 1) * 0.28, 3, dt);
    this.tiltR = damp(this.tiltR, clamp(-this.yawRate * Math.abs(vf) * 0.012, -0.5, 0.5), 3, dt);
    this._syncVisual(dt);
    this.body.rotation.set(this.tiltP, 0, this.tiltR);

    // Лопасти.
    this.rotorAngle += dt * 34 * this.rotorSpeed;
    this.rotor.rotation.y = this.rotorAngle;
    this.tailRotor.rotation.x = this.rotorAngle * 1.3;
    this.discMat.opacity = clamp((this.rotorSpeed - 0.35) * 0.4, 0, 0.26);
    for (const b of this.blades) b.visible = this.rotorSpeed < 0.9 || this.rotorAngle % 1.2 < 0.8;   // на скорости лопасти мерцают, как на видео
  }

  // Столкновение с препятствиями ниже вертолёта: крыши зданий, фонари, деревья.
  _collideAir() {
    const world = this.game.world;
    const y = this.position.y;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const off of this.circleOffsets) {
      const c = { x: this.position.x + fx * off, z: this.position.z + fz * off };
      const r = this.radius;
      for (const box of world.colliders.query(c.x - r, c.z - r, c.x + r, c.z + r)) {
        if (box.height <= y + 0.2) continue;   // подлетели выше крыши
        const ox = c.x, oz = c.z;
        if (!pushCircleOutOfBox(c, r, box, _hit)) continue;
        this.position.x += c.x - ox;
        this.position.z += c.z - oz;
        const vn = this.velocity.x * _hit.nx + this.velocity.z * _hit.nz;
        if (vn < 0) {
          this.velocity.x -= vn * _hit.nx * 1.4;
          this.velocity.z -= vn * _hit.nz * 1.4;
          if (-vn > 7) this.damage((-vn - 7) * 6, this.driver);
        }
      }
    }
    this.updateCircles();
  }
}
