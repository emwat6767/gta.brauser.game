import * as THREE from 'three';
import { mergeColored } from './geometry.js';

// Разрушения и хаос.
//   blast(point, radius, damage, force, attacker) — удар по области (взрыв, ударная волна Халка,
//     залп Железного человека, удар кулака Халка): люди падают и получают урон, машины
//     подлетают и повреждаются, уличные предметы разлетаются, фонари ломаются.
//   Уличные предметы (урны, гидранты, скамейки, газетные киоски, конусы, ящики) стоят вдоль
//     тротуаров. В покое они рисуются InstancedMesh (по одному draw call на тип); задетый
//     предмет становится "живым" (своя физика: полёт, отскок, вращение), гидрант бьёт фонтаном.
//     Живых предметов не больше MAX_DYNAMIC — старые остаются лежать неподвижно.
//   Фонари ломаются от удара машины на скорости, Халка или взрыва: падают, искрят.
// Машины сбивают предметы (vehicles <-> props проверяются здесь же, только рядом с игроком).

const MAX_DYNAMIC = 40;
const CELL = 20;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function propModels() {
  const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const cyl = (rt, rb, h, seg, y) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y, 0);
  return {
    bin: { r: 0.3, h: 0.9, mass: 1, geo: mergeColored([
      { geometry: cyl(0.27, 0.24, 0.8, 12, 0.4), color: '#2f5d3a' },
      { geometry: cyl(0.3, 0.3, 0.08, 12, 0.84), color: '#1d2b21' },
    ]) },
    hydrant: { r: 0.22, h: 0.75, mass: 3, water: true, geo: mergeColored([
      { geometry: cyl(0.13, 0.15, 0.62, 10, 0.31), color: '#c0262a' },
      { geometry: new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.62, 0), color: '#c0262a' },
      { geometry: box(0.36, 0.09, 0.09, 0, 0.45), color: '#a31e22' },
      { geometry: cyl(0.2, 0.2, 0.05, 10, 0.025), color: '#8a1b1e' },
    ]) },
    bench: { r: 0.8, h: 0.9, mass: 4, geo: mergeColored([
      { geometry: box(1.6, 0.07, 0.42, 0, 0.45), color: '#8a5a33' },
      { geometry: box(1.6, 0.36, 0.06, 0, 0.72, -0.2), color: '#8a5a33' },
      { geometry: box(0.06, 0.45, 0.4, 0.7, 0.22), color: '#2b2b2b' },
      { geometry: box(0.06, 0.45, 0.4, -0.7, 0.22), color: '#2b2b2b' },
    ]) },
    news: { r: 0.3, h: 1.05, mass: 1.5, geo: mergeColored([
      { geometry: box(0.46, 0.8, 0.4, 0, 0.62), color: '#2c6fbf' },
      { geometry: box(0.3, 0.18, 0.02, 0, 0.78, 0.2), color: '#e8e8e8' },
      { geometry: box(0.06, 0.22, 0.06, 0, 0.11), color: '#333333' },
    ]) },
    cone: { r: 0.2, h: 0.7, mass: 0.4, geo: mergeColored([
      { geometry: new THREE.ConeGeometry(0.17, 0.66, 10).translate(0, 0.35, 0), color: '#ff7a1a' },
      { geometry: cyl(0.12, 0.14, 0.08, 10, 0.34), color: '#f4f4f4' },
      { geometry: box(0.36, 0.04, 0.36, 0, 0.02), color: '#ff7a1a' },
    ]) },
    crate: { r: 0.45, h: 0.8, mass: 2, geo: mergeColored([
      { geometry: box(0.8, 0.8, 0.8, 0, 0.4), color: '#9c7240' },
      { geometry: box(0.82, 0.08, 0.82, 0, 0.62), color: '#7a5630' },
      { geometry: box(0.82, 0.08, 0.82, 0, 0.18), color: '#7a5630' },
    ]) },
  };
}

export class ChaosSystem {
  constructor(game) {
    this.game = game;
    this.models = propModels();
    this.props = [];
    this.cells = new Map();
    this.dynamic = [];     // летящие/катящиеся предметы и падающие фонари
    this.fountains = [];   // сломанные гидранты
    this.brokenLamps = 0;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.material = mat;
    this._place();
    // По InstancedMesh на тип.
    this.instanced = {};
    for (const [type, M] of Object.entries(this.models)) {
      const list = this.props.filter((p) => p.type === type);
      const mesh = new THREE.InstancedMesh(M.geo, mat, Math.max(1, list.length));
      list.forEach((p, i) => {
        p.index = i;
        mesh.setMatrixAt(i, this._matrix(p));
      });
      mesh.count = list.length;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      game.world.group.add(mesh);
      this.instanced[type] = mesh;
    }
  }

  _matrix(p) {
    _e.set(p.rx ?? 0, p.heading, p.rz ?? 0);
    _q.setFromEuler(_e);
    return _m.compose(_v.set(p.x, p.y, p.z), _q, new THREE.Vector3(1, 1, 1));
  }

  // Расстановка вдоль тротуаров (детерминированно, от сида мира).
  _place() {
    const { world } = this.game;
    const rng = world.rng;
    const lampNear = (x, z) => world.lamps.some((l) => Math.abs(l.x - x) < 2 && Math.abs(l.z - z) < 2);
    const reserved = (x, z) => world.banks.concat(world.stores).some((pl) => Math.hypot(pl.origin.x - x, pl.origin.z - z) < 12);
    const h = world.curbHeight;
    for (const b of world.blocks) {
      const inset = 1.25;
      const sides = [
        { x0: b.minX, z0: b.maxZ - inset, dx: 1, dz: 0, heading: Math.PI },
        { x0: b.minX, z0: b.minZ + inset, dx: 1, dz: 0, heading: 0 },
        { x0: b.maxX - inset, z0: b.minZ, dx: 0, dz: 1, heading: -Math.PI / 2 },
        { x0: b.minX + inset, z0: b.minZ, dx: 0, dz: 1, heading: Math.PI / 2 },
      ];
      const len = b.maxX - b.minX;
      for (const s of sides) {
        for (let t = 16; t < len - 16; t += rng.range(9, 17)) {
          const x = s.x0 + s.dx * t, z = s.z0 + s.dz * t;
          if (lampNear(x, z) || reserved(x, z) || !rng.chance(0.55)) continue;
          const r = rng.next();
          const type = r < 0.3 ? 'bin' : r < 0.45 ? 'hydrant' : r < 0.7 ? 'bench' : r < 0.82 ? 'news' : r < 0.9 ? 'cone' : 'crate';
          const p = { type, x, y: h, z, heading: s.heading + (type === 'bench' ? 0 : rng.range(-0.3, 0.3)), alive: true, dyn: null };
          this.props.push(p);
          const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(p);
        }
      }
    }
  }

  // Предметы в радиусе r от (x, z) (в покое).
  _near(x, z, r) {
    const out = [];
    const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
    const c0z = Math.floor((z - r) / CELL), c1z = Math.floor((z + r) / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const p of this.cells.get(`${cx},${cz}`) ?? []) {
          if (!p.dyn && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r) out.push(p);
        }
      }
    }
    return out;
  }

  // Предмет срывается с места и летит со скоростью (vx, vy, vz).
  knock(p, vx, vy, vz) {
    const M = this.models[p.type];
    if (!p.dyn) {
      this.instanced[p.type].setMatrixAt(p.index, ZERO);
      this.instanced[p.type].instanceMatrix.needsUpdate = true;
      const mesh = new THREE.Mesh(M.geo, this.material);
      mesh.castShadow = true;
      this.game.scene.add(mesh);
      p.dyn = { mesh, vx: 0, vy: 0, vz: 0, wx: 0, wz: 0, rx: 0, rz: 0, sleep: 0 };
      this.dynamic.push(p);
      if (M.water) this.fountains.push({ x: p.x, y: p.y, z: p.z, time: 18 });
      // Лимит живых предметов: самый старый замирает, где лежит.
      if (this.dynamic.length > MAX_DYNAMIC) this._freeze(this.dynamic[0]);
    }
    const d = p.dyn;
    const k = 1 / Math.sqrt(M.mass);
    d.vx += vx * k;
    d.vy += vy * k;
    d.vz += vz * k;
    d.wx += (Math.random() - 0.5) * 12 * k;
    d.wz += (Math.random() - 0.5) * 12 * k;
    d.sleep = 0;
    this.game.effects.burst(_v.set(p.x, p.y + 0.4, p.z), { x: vx * 0.05, y: 0.5, z: vz * 0.05 }, 'debris', 4);
  }

  // Живой предмет больше не двигается: остаётся отдельным мешем, но без физики.
  _freeze(p) {
    const i = this.dynamic.indexOf(p);
    if (i >= 0) this.dynamic.splice(i, 1);
    if (p.dyn) p.dyn.frozen = true;
  }

  // --- Фонари -----------------------------------------------------------------------

  // Сломать фонарь: столб падает в направлении удара (dx, dz), искры.
  breakLamp(lamp, dx, dz) {
    const { world, effects } = this.game;
    if (lamp.broken) return;
    lamp.broken = true;
    this.brokenLamps++;
    world.hideLamp(lamp);
    const pole = new THREE.Group();
    pole.position.set(lamp.x, world.curbHeight, lamp.z);
    const inner = new THREE.Group();
    inner.rotation.y = lamp.rot;
    for (const mesh of world.lampMeshes) {
      const m = new THREE.Mesh(mesh.geometry, mesh.material);
      m.castShadow = true;
      inner.add(m);
    }
    pole.add(inner);
    this.game.scene.add(pole);
    const len = Math.hypot(dx, dz) || 1;
    pole.userData = { axis: new THREE.Vector3(dz / len, 0, -dx / len), angle: 0, w: 0.5, landed: false };
    this.dynamic.push({ lamp: true, group: pole });
    effects.burst(_v.set(lamp.x, world.curbHeight + 5.4, lamp.z), { x: 0, y: -0.5, z: 0 }, 'spark', 14);
    this.game.audio.slam?.(pole.position, 0.25);
  }

  _lampsNear(x, z, r) {
    return this.game.world.lamps.filter((l) => !l.broken && Math.abs(l.x - x) < r && Math.abs(l.z - z) < r && (l.x - x) ** 2 + (l.z - z) ** 2 < r * r);
  }

  // --- Удар по области ------------------------------------------------------------

  blast(point, radius, damage, force, attacker = null, { ignore = null, dirX, dirZ, kind = 'blast' } = {}) {
    const { game } = this;
    const dirOf = (x, z) => {
      if (dirX !== undefined) return [dirX, dirZ];
      const dx = x - point.x, dz = z - point.z;
      const l = Math.hypot(dx, dz) || 1;
      return [dx / l, dz / l];
    };
    const r2 = radius * radius;
    // Люди.
    for (const n of [...game.npcs.list]) {
      if (n === ignore || n.vehicle || n.removed) continue;
      const d2 = (n.position.x - point.x) ** 2 + (n.position.z - point.z) ** 2;
      if (d2 > r2 || Math.abs(n.position.y - point.y) > radius) continue;
      const k = 1 - Math.sqrt(d2) / radius * 0.6;
      const [dx, dz] = dirOf(n.position.x, n.position.z);
      if (!n.isDead) n.takeDamage(damage * k, attacker, dx, dz, kind === 'punch' ? 'punch' : 'blast');
      n.knockDown(dx * force * k, dz * force * k, force * 0.35 * k + 1, attacker, 'blast', true);
    }
    const p = game.player;
    if (p !== ignore && !p.vehicle && !p.isDead) {
      const d2 = (p.position.x - point.x) ** 2 + (p.position.z - point.z) ** 2;
      if (d2 < r2) {
        const k = 1 - Math.sqrt(d2) / radius * 0.6;
        const [dx, dz] = dirOf(p.position.x, p.position.z);
        p.knockDown(dx * force * k * 0.6, dz * force * k * 0.6, force * 0.25 * k, 1.4);
        p.takeDamage(damage * k * 0.6, attacker, dx, dz, 'blast');
      }
    }
    // Машины.
    for (const v of game.vehicles) {
      if (v === ignore || v.carried || v.removed) continue;
      const d = v.distanceToPoint(point.x, point.z);
      if (d > radius) continue;
      const k = 1 - d / radius;
      const [dx, dz] = dirOf(v.position.x, v.position.z);
      v.launch(dx * force * 0.6 * k, force * 0.28 * k, dz * force * 0.6 * k, (Math.random() - 0.5) * 4 * k);
      v.damage?.(damage * 0.7 * k, attacker);
    }
    // Предметы и фонари.
    for (const pr of this._near(point.x, point.z, radius + 0.5)) {
      const [dx, dz] = dirOf(pr.x, pr.z);
      const k = 1 - Math.hypot(pr.x - point.x, pr.z - point.z) / (radius + 0.5);
      this.knock(pr, dx * force * k, force * 0.5 * k + 2, dz * force * k);
    }
    for (const pr of this.dynamic) {
      if (!pr.dyn || pr.dyn.frozen) continue;
      if ((pr.x - point.x) ** 2 + (pr.z - point.z) ** 2 > r2) continue;
      const [dx, dz] = dirOf(pr.x, pr.z);
      this.knock(pr, dx * force * 0.6, force * 0.3, dz * force * 0.6);
    }
    if (force > 8) {
      for (const l of this._lampsNear(point.x, point.z, radius * 0.7)) {
        const [dx, dz] = dirOf(l.x, l.z);
        this.breakLamp(l, dx, dz);
      }
    }
    // Тряска камеры рядом с игроком.
    const dp = Math.hypot(p.position.x - point.x, p.position.z - point.z);
    if (dp < radius * 4) game.cameraRig.addShake?.(Math.min(0.5, (force / 30) * (1 - dp / (radius * 4))));
    game.events.emit('chaos:blast', { point, radius, attacker });
  }

  // --- Каждый шаг ---------------------------------------------------------------------

  update(dt) {
    const { game } = this;
    const world = game.world;
    const pp = game.player.position;

    // Машины сбивают предметы и фонари (только рядом с игроком).
    for (const v of game.vehicles) {
      const speed = Math.hypot(v.velocity.x, v.velocity.z);
      if (speed < 3 || v.position.distanceToSquared(pp) > 130 * 130) continue;
      for (const c of v.circles) {
        for (const pr of this._near(c.x, c.z, v.radius + 0.4)) {
          this.knock(pr, v.velocity.x * 0.9, 2 + speed * 0.25, v.velocity.z * 0.9);
          v.velocity.multiplyScalar(0.96);
        }
        if (speed > 9) {
          for (const l of this._lampsNear(c.x, c.z, v.radius + 0.35)) {
            this.breakLamp(l, v.velocity.x, v.velocity.z);
            v.velocity.multiplyScalar(0.75);
            v.damage?.(speed * 0.8, v.driver);
          }
        }
      }
    }
    // Игрок (бегом или Халк) и NPC в панике задевают предметы.
    const P = game.player;
    if (!P.vehicle && !P.isDead) {
      const sp = P.horizontalSpeed;
      const hulk = game.powers?.mode === 'hulk';
      if (sp > 4 || hulk) {
        for (const pr of this._near(pp.x, pp.z, P.radius + 0.35)) {
          const k = hulk ? 2.2 : 0.8;
          this.knock(pr, P.velocity.x * k, 1.5 + sp * 0.2 * k, P.velocity.z * k);
        }
      }
    }

    // Физика живых предметов.
    for (const pr of [...this.dynamic]) {
      if (pr.lamp) {
        this._updateLamp(pr, dt);
        continue;
      }
      const d = pr.dyn;
      if (d.frozen) continue;
      d.vy -= 20 * dt;
      pr.x += d.vx * dt;
      pr.y += d.vy * dt;
      pr.z += d.vz * dt;
      pr.rx = (pr.rx ?? 0) + d.wx * dt;
      pr.rz = (pr.rz ?? 0) + d.wz * dt;
      const pos = { x: pr.x, z: pr.z };
      const hit = { nx: 0, nz: 0 };
      if (world.resolveCircle(pos, this.models[pr.type].r, hit)) {
        pr.x = pos.x;
        pr.z = pos.z;
        const vn = d.vx * hit.nx + d.vz * hit.nz;
        if (vn < 0) { d.vx -= 1.5 * vn * hit.nx; d.vz -= 1.5 * vn * hit.nz; }
      }
      const ground = world.getGroundHeight(pr.x, pr.z);
      if (pr.y <= ground) {
        pr.y = ground;
        if (d.vy < -2) d.vy = -d.vy * 0.3; else d.vy = 0;
        const f = Math.exp(-6 * dt);
        d.vx *= f;
        d.vz *= f;
        d.wx *= f;
        d.wz *= f;
        // На земле предмет ложится на ближайшую грань: стоя или на боку.
        const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
        pr.rx += (snap(pr.rx) - pr.rx) * Math.min(1, dt * 6);
        pr.rz += (snap(pr.rz) - pr.rz) * Math.min(1, dt * 6);
        if (Math.hypot(d.vx, d.vy, d.vz) < 0.3) d.sleep += dt;
      }
      d.mesh.position.set(pr.x, pr.y, pr.z);
      d.mesh.rotation.set(pr.rx, pr.heading, pr.rz, 'YXZ');
      if (d.sleep > 1.5) this._freeze(pr);
    }

    // Фонтаны из сломанных гидрантов.
    for (const f of [...this.fountains]) {
      f.time -= dt;
      if (f.time <= 0) {
        this.fountains.splice(this.fountains.indexOf(f), 1);
        continue;
      }
      if ((f.x - pp.x) ** 2 + (f.z - pp.z) ** 2 < 100 * 100) {
        game.effects.burst(_v.set(f.x, f.y + 0.3, f.z), { x: 0, y: 2.2, z: 0 }, 'water', 3);
        if (Math.random() < dt * 14) {
          game.effects.puff('spray', _v, { x: (Math.random() - 0.5) * 1.6, y: 8 + Math.random() * 3, z: (Math.random() - 0.5) * 1.6 }, 1);
        }
      }
    }
  }

  _updateLamp(pr, dt) {
    const u = pr.group.userData;
    if (u.landed) return;
    u.w += dt * 3.5;
    u.angle = Math.min(Math.PI / 2 - 0.05, u.angle + u.w * dt);
    pr.group.quaternion.setFromAxisAngle(u.axis, u.angle);
    if (u.angle >= Math.PI / 2 - 0.05) {
      u.landed = true;
      const head = _v.set(0, 5.4, 1.4).applyQuaternion(pr.group.quaternion).add(pr.group.position);
      this.game.effects.burst(head, { x: 0, y: 1, z: 0 }, 'spark', 12);
      this.game.effects.burst(head, { x: 0, y: 0.5, z: 0 }, 'dust', 10);
      const i = this.dynamic.indexOf(pr);
      if (i >= 0) this.dynamic.splice(i, 1);
    }
  }
}
