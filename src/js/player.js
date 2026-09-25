import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Humanoid } from './humanoid.js';
import { damp, dampAngle } from './utils.js';

// Игрок: ходьба/бег относительно камеры, прыжок, посадка в машину.
// Пока игрок в машине, его модель прикреплена к сиденью, а позиция
// повторяет позицию машины (для миникарты, NPC и будущих систем).

export class Player {
  constructor(game) {
    const P = CONFIG.player;
    this.game = game;
    this.radius = P.radius;
    this.model = new Humanoid(); // внешний вид — DEFAULT_LOOK в humanoid.js
    this.position = new THREE.Vector3(P.spawn.x, 0, P.spawn.z);
    this.position.y = game.world.getGroundHeight(this.position.x, this.position.z);
    this.velocity = new THREE.Vector3();
    this.heading = P.spawn.heading;
    this.grounded = true;
    this.visualY = this.position.y;
    this.vehicle = null;
    this._hit = { nx: 0, nz: 0 };
    game.scene.add(this.model.root);
  }

  get isOnFoot() {
    return !this.vehicle;
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  update(dt) {
    if (this.vehicle) {
      const v = this.vehicle;
      this.position.copy(v.position);
      this.heading = v.heading;
      this.velocity.set(v.velocity.x, 0, v.velocity.z);
      this.model.animate(dt, { pose: 'sit', sitHeight: v.seatHipHeight });
      return;
    }

    const P = CONFIG.player;
    const { input, cameraRig, world } = this.game;

    // Направление ввода относительно камеры.
    const f = input.axis('backward', 'forward');
    const s = input.axis('left', 'right');
    let mx = 0, mz = 0;
    if (f || s) {
      const yaw = cameraRig.yaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      mx = fx * f - fz * s;   // right = (-fz, fx)
      mz = fz * f + fx * s;
      const l = Math.hypot(mx, mz);
      mx /= l;
      mz /= l;
    }
    const targetSpeed = f || s ? (input.isDown('run') ? P.runSpeed : P.walkSpeed) : 0;

    // Разгон к желаемой скорости.
    const accel = this.grounded ? P.accel : P.airAccel;
    let dvx = mx * targetSpeed - this.velocity.x;
    let dvz = mz * targetSpeed - this.velocity.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl > maxDv) {
      dvx *= maxDv / dl;
      dvz *= maxDv / dl;
    }
    this.velocity.x += dvx;
    this.velocity.z += dvz;

    if (this.grounded && input.wasPressed('jump')) {
      this.velocity.y = P.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= CONFIG.physics.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Стены/фонари/деревья: гасим скорость, направленную в препятствие.
    if (world.resolveCircle(this.position, this.radius, this._hit)) {
      const vn = this.velocity.x * this._hit.nx + this.velocity.z * this._hit.nz;
      if (vn < 0) {
        this.velocity.x -= vn * this._hit.nx;
        this.velocity.z -= vn * this._hit.nz;
      }
    }

    // Земля и бордюры: ступеньку в 15 см проходим без прыжка.
    const ground = world.getGroundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      this.position.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.position.y - ground < 0.3 && this.velocity.y <= 0) {
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.grounded = false;
    }

    if (mx || mz) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), P.turnSpeed, dt);

    this.visualY = this.grounded ? damp(this.visualY, this.position.y, 25, dt) : this.position.y;
    this.model.root.position.set(this.position.x, this.visualY, this.position.z);
    this.model.root.rotation.y = this.heading;
    this.model.animate(dt, { speed: this.horizontalSpeed, airborne: !this.grounded });
  }

  // Ближайшая машина, в которую можно сесть (или null).
  findEnterableVehicle() {
    let best = null;
    let bestD = CONFIG.player.enterDistance;
    for (const v of this.game.vehicles) {
      if (v.driver) continue;
      const d = v.distanceToPoint(this.position.x, this.position.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    vehicle.driver = this;
    vehicle.seatAnchor.add(this.model.root);
    this.model.root.position.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.game.events.emit('vehicle:enter', { vehicle, who: this });
  }

  exitVehicle() {
    const vehicle = this.vehicle;
    if (!vehicle) return;
    const spot = vehicle.findExitPosition(this.radius);
    vehicle.driver = null;
    this.vehicle = null;
    this.game.scene.add(this.model.root);
    this.position.set(spot.x, this.game.world.getGroundHeight(spot.x, spot.z), spot.z);
    this.visualY = this.position.y;
    this.velocity.set(0, 0, 0);
    this.heading = vehicle.heading;
    this.grounded = true;
    this.model.root.position.copy(this.position);
    this.model.root.rotation.set(0, this.heading, 0);
    this.game.events.emit('vehicle:exit', { vehicle, who: this });
  }
}
