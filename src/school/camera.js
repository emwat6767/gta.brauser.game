import * as THREE from 'three';
import { clamp, damp } from '../js/utils.js';

// Камера от третьего лица для узких школьных коридоров: держится за плечом, не проходит сквозь
// стены и потолок (луч от головы до камеры), V — вид от первого лица. В шкафчике — всегда первое лицо.

const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _eye = new THREE.Vector3();

export class SchoolCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = Math.PI;
    this.pitch = 0.18;
    this.dist = 2.7;
    this.cur = 2.7;
    this.first = false;
    this.sens = 0.0026;
    this.shake = 0;
  }

  look(dx, dy) {
    this.yaw -= dx * this.sens;
    this.pitch = clamp(this.pitch + dy * this.sens, -1.1, 1.25);
  }

  // Направление «вперёд» камеры по земле.
  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  update(dt, target) {
    const first = this.first || (target.hidden && target.hidden.type === 'locker');
    target.eye(_eye);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // Направление взгляда: yaw — по горизонтали (как heading), pitch > 0 — смотрим вниз.
    _d.set(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    if (first) {
      this.camera.position.copy(_eye).addScaledVector(_d, 0.12);
      this.cur = 0;
      target.model.root.visible = target.hidden?.type === 'locker' ? false : false;
    } else {
      if (!target.hidden || target.hidden.type !== 'locker') target.model.root.visible = target.visibleModel;
      const want = target.crouch || target.hidden ? 2.1 : this.dist;
      // Плечо вправо.
      const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
      _p.copy(_eye).addScaledVector(_d, -want);
      _p.x += rx * 0.38; _p.z += rz * 0.38;
      _p.y += 0.12;
      // Луч от головы к желаемой точке камеры.
      const vx = _p.x - _eye.x, vy = _p.y - _eye.y, vz = _p.z - _eye.z;
      const len = Math.hypot(vx, vy, vz);
      const hit = this.world.raycast(_eye.x, _eye.y, _eye.z, vx / len, vy / len, vz / len, len + 0.25);
      let d = hit !== null ? Math.max(0.25, hit - 0.25) : len;
      this.cur = d < this.cur ? d : damp(this.cur, d, 4, dt);
      _p.set(_eye.x + (vx / len) * this.cur, _eye.y + (vy / len) * this.cur, _eye.z + (vz / len) * this.cur);
      const ceil = this.world.ceilingAt(_p.x, _p.z, target.pos.y);
      if (_p.y > ceil - 0.15) _p.y = ceil - 0.15;
      const floor = this.world.groundAt(_p.x, _p.z, _p.y) + 0.15;
      if (_p.y < floor) _p.y = floor;
      this.camera.position.copy(_p);
      // Совсем близко — модель мешает: прячем.
      target.model.root.visible = target.visibleModel && this.cur > 0.55;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.06;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    _p.copy(this.camera.position).addScaledVector(_d, 10);
    if (!first) _p.copy(_eye).addScaledVector(_d, 10);
    this.camera.lookAt(_p);
    return first;
  }
}
