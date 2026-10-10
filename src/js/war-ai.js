import * as THREE from 'three';
import { clamp, dampAngle, wrapAngle } from './utils.js';

// ИИ армий в режиме «Война стран».
//   Navigator  — маршруты пехоты по тротуарам (граф улиц как у машин): из парка-базы через ворота на улицу, по перекрёсткам, в парк / на пункт.
//   WarBrain   — «мозг» солдата (NPC в состоянии WAR): движется по маршруту приказа, замечает врагов, останавливается и стреляет,
//                отходит в укрытие, когда ранен, занимает окна и мешки у своих позиций, охраняет президента.
//   Приказы (order): 'attack' — идти на цель; 'defend' — занять укрытия у позиции; 'follow' — держаться за лидером (охрана);
//                    'guard' — стоять у президента; 'hold' — стоять.
//   WarDriver / HeliPilot — вождение техники: AIDriver в режиме погони за точкой / простой пилот вертолёта.

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- маршруты по улицам

export class Navigator {
  constructor(game) {
    this.game = game;
    this.w = game.world;
    this.rh = this.w.roadHalf;
    this.lat = this.rh + this.w.sidewalk / 2;      // середина тротуара от оси улицы
    this.lines = this.w.roadLines;
    this.n = this.lines.length;
  }

  node(x, z) {
    const w = this.w;
    return [clamp(Math.round((x - w.gridMin) / w.blockSize), 0, this.n - 1), clamp(Math.round((z - w.gridMin) / w.blockSize), 0, this.n - 1)];
  }

  pos([i, j]) {
    return { x: this.lines[i], z: this.lines[j] };
  }

  // Квартал-парк (без зданий) под точкой?
  parkAt(x, z) {
    const b = this.w.blockAt(x, z);
    if (!b || b.type !== 'park') return null;
    return x > b.minX + this.w.sidewalk && x < b.maxX - this.w.sidewalk && z > b.minZ + this.w.sidewalk && z < b.maxZ - this.w.sidewalk ? b : null;
  }

  // Ворота парка: 4 точки на тротуаре у концов крестообразных дорожек.
  gates(b) {
    const e = this.rh + this.w.sidewalk * 0.5;   // середина тротуара
    const hx = (b.maxX - b.minX) / 2 + this.w.sidewalk * 0.5, hz = (b.maxZ - b.minZ) / 2 + this.w.sidewalk * 0.5;
    return [
      { x: b.cx + hx, z: b.cz, street: 'x+' }, { x: b.cx - hx, z: b.cz, street: 'x-' },
      { x: b.cx, z: b.cz + hz, street: 'z+' }, { x: b.cx, z: b.cz - hz, street: 'z-' },
    ].map((g) => ({ ...g, e }));
  }

  // Маршрут [{ x, z }, ...] от from к to. flip — порядок осей (обход с другой стороны), side — тротуар (+1 / -1).
  route(from, to, { flip = false, side = 1 } = {}) {
    const pts = [];
    let cur = { x: from.x, z: from.z };
    const startPark = this.parkAt(from.x, from.z);
    const endPark = this.parkAt(to.x, to.z);
    const endNode = this.node(to.x, to.z);
    // ворота парка, откуда выходим: ближайшие к цели
    if (startPark) {
      const g = this._bestGate(startPark, to);
      pts.push({ x: g.x, z: g.z });
      cur = g;
    }
    // если цель в том же парке — идём напрямую
    if (startPark && endPark && startPark === endPark) return [{ x: to.x, z: to.z }];
    // начальный узел: ближайший к текущей точке на улице, ближе к цели
    let [i, j] = this._streetNodeNear(cur, endNode, startPark);
    const route = [[i, j]];
    const go = (axis) => {
      if (axis === 0) while (i !== endNode[0]) { i += Math.sign(endNode[0] - i); route.push([i, j]); }
      else while (j !== endNode[1]) { j += Math.sign(endNode[1] - j); route.push([i, j]); }
    };
    if (flip) { go(1); go(0); } else { go(0); go(1); }
    // боковые точки у поворотов и концов отрезков
    let prevDir = null;
    for (let k = 0; k < route.length; k++) {
      const P = this.pos(route[k]);
      const next = route[k + 1], prev = route[k - 1];
      const dIn = prev ? [Math.sign(P.x - this.pos(prev).x), Math.sign(P.z - this.pos(prev).z)] : prevDir;
      const dOut = next ? [Math.sign(this.pos(next).x - P.x), Math.sign(this.pos(next).z - P.z)] : null;
      const turn = dIn && dOut && (dIn[0] !== dOut[0] || dIn[1] !== dOut[1]);
      if (k === 0 || turn || !next) {
        const d = dIn ?? dOut;
        const L = this.lat * side;
        if (!d) { pts.push({ x: P.x, z: P.z }); continue; }
        const px = -d[1] * L, pz = d[0] * L;
        const stop = this.rh + 1.5;
        if (prev || k === 0) pts.push({ x: P.x - d[0] * (k === 0 ? 0 : stop) + px, z: P.z - d[1] * (k === 0 ? 0 : stop) + pz });
        if (turn && dOut) {
          const qx = -dOut[1] * L, qz = dOut[0] * L;
          pts.push({ x: P.x + dOut[0] * stop + qx, z: P.z + dOut[1] * stop + qz });
        }
      }
    }
    if (endPark) {
      const g = this._bestGate(endPark, pts.length ? pts[pts.length - 1] : cur);
      pts.push({ x: g.x, z: g.z });
    }
    pts.push({ x: to.x, z: to.z });
    return this._dedupe(pts);
  }

  _dedupe(pts) {
    const out = [];
    for (const p of pts) if (!out.length || Math.hypot(out[out.length - 1].x - p.x, out[out.length - 1].z - p.z) > 2) out.push(p);
    return out;
  }

  _bestGate(b, to) {
    let best = null, bd = Infinity;
    for (const g of this.gates(b)) {
      const d = Math.abs(g.x - to.x) + Math.abs(g.z - to.z);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  // Ближайший к точке перекрёсток на той улице, куда ведут ворота (чтобы идти по тротуару, а не через дома).
  _streetNodeNear(p, endNode) {
    const [ni, nj] = this.node(p.x, p.z);
    // выбираем из 2 узлов ближайшей улицы тот, что ближе к цели
    const alongX = Math.abs(p.x - this.lines[ni]) < Math.abs(p.z - this.lines[nj]);   // на улице вдоль Z (x ≈ линия)
    const cand = alongX
      ? [[ni, clamp(Math.floor((p.z - this.w.gridMin) / this.w.blockSize), 0, this.n - 1)], [ni, clamp(Math.floor((p.z - this.w.gridMin) / this.w.blockSize) + 1, 0, this.n - 1)]]
      : [[clamp(Math.floor((p.x - this.w.gridMin) / this.w.blockSize), 0, this.n - 1), nj], [clamp(Math.floor((p.x - this.w.gridMin) / this.w.blockSize) + 1, 0, this.n - 1), nj]];
    cand.sort((a, b) => Math.abs(a[0] - endNode[0]) + Math.abs(a[1] - endNode[1]) - (Math.abs(b[0] - endNode[0]) + Math.abs(b[1] - endNode[1])));
    return cand[0];
  }
}

// ---------------------------------------------------------------- солдат

const STEP_STUCK = 1.6;

export class WarBrain {
  constructor(war, npc, { team, cls = 'rifle', sight = 70, spread = 3.4, fireScale = 0.6 } = {}) {
    this.war = war;
    this.npc = npc;
    this.team = team;
    this.cls = cls;
    this.sight = sight;
    this.spread = spread;
    this.fireScale = fireScale;
    this.order = 'attack';
    this.objective = null;
    this.path = [];
    this.pathIdx = 0;
    this.target = null;
    this.scanTimer = Math.random() * 0.4;
    this.cover = null;
    this.coverTime = 0;
    this.hurtCooldown = 0;
    this.leader = null;
    this.slot = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = { x: npc.position.x, z: npc.position.z };
    this.idleFace = null;
    this.speedMul = 1;
    this.alerted = 0;
    this.holdUntil = 0;
  }

  // Задать цель похода (с маршрутом по улицам).
  goTo(x, z, { flip = null, order = 'attack' } = {}) {
    this.order = order;
    this.objective = { x, z };
    const nav = this.war.nav;
    const f = flip ?? Math.random() < 0.5;
    this.path = nav.route(this.npc.position, { x, z }, { flip: f, side: Math.random() < 0.5 ? 1 : -1 });
    this.pathIdx = 0;
    this._releaseCover();
  }

  _releaseCover() {
    if (this.cover) this.cover.taken = null;
    this.cover = null;
  }

  // Занять укрытие. В дом заходим через дверь: сначала точка перед дверью, потом порог, потом место у окна.
  setCover(slot) {
    this._releaseCover();
    this.cover = slot;
    slot.taken = this.npc;
    const path = [];
    const door = slot.owner?.cover?.find((k) => k.kind === 'door');
    if (door && slot.kind !== 'door' && (slot.kind === 'window' || slot.kind === 'slit')) {
      path.push({ x: door.x + Math.sin(door.face) * 2.6, z: door.z + Math.cos(door.face) * 2.6 }, { x: door.x, z: door.z });
    } else if (door && slot.kind === 'door') {
      path.push({ x: door.x + Math.sin(door.face) * 2.6, z: door.z + Math.cos(door.face) * 2.6 });
    }
    path.push({ x: slot.x, z: slot.z });
    this.path = path;
    this.pathIdx = 0;
  }

  onAttacked(who) {
    if (!who?.position || who === this.npc) return;
    this.alerted = 4;
    if (!this.target || this.target.isDead || dist2(this.npc.position, who.position) < dist2(this.npc.position, this.target.position)) {
      if (who.team && who.team !== this.team) this.target = who.driver && who.spec ? who : who;
    }
  }

  // Каждый кадр, пока солдат на ногах. Возвращает скорость (для анимации ходьбы).
  update(dt) {
    const n = this.npc;
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.alerted = Math.max(0, this.alerted - dt);
    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = 0.35 + Math.random() * 0.2;
      this._pickTarget();
    }
    let t = this.target;
    if (t && (t.isDead || t.wrecked || t.removed)) t = this.target = null;

    // Тяжело ранен — в укрытие, пока не отдышится.
    if (n.health < n.maxHealth * 0.34 && this.hurtCooldown <= 0 && !this.cover && this.order !== 'guard') {
      const slot = this.war.findCover(n.position, 28, this.team, t);
      if (slot) {
        this.setCover(slot);
        this.hurtCooldown = 12;
        this.holdUntil = 7;
        this.speedMul = 1.45;
      }
    }
    if (this.holdUntil > 0) {
      this.holdUntil -= dt;
      n.health = Math.min(n.maxHealth, n.health + dt * n.maxHealth * 0.045);
    }

    // Огонь по цели.
    if (t) {
      const tp = t.position;
      const d = dist2(n.position, tp);
      let shooting = false;
      if (n.gun && d < Math.min(this.sight * 1.2, n.gun.def.range * 0.8)) {
        n.heading = dampAngle(n.heading, Math.atan2(tp.x - n.position.x, tp.z - n.position.z), 10, dt);
        shooting = n._shootAt(dt, t, tp, d);
      }
      if (shooting) return this._whileShooting(dt, d);
    }

    // Нет цели в прицеле: двигаемся по приказу.
    switch (this.order) {
      case 'follow': return this._follow(dt);
      case 'guard': return this._guard(dt);
      case 'hold': return this._face(dt);
      default: break;
    }
    const arrived = this._walkPath(dt, this.speedMul);
    if (arrived) {
      this.speedMul = 1;
      if (this.order === 'defend' && !this.cover) {
        const slot = this.war.findCover(n.position, 22, this.team, null, true);
        if (slot) this.setCover(slot);
      }
      if (this.cover) return this._faceCover(dt);
      return this._face(dt);
    }
    return n.walkSpeed * 1.35 * (this.speedMul > 1 ? 1.2 : 1);
  }

  // Ищем ближайшего врага в поле зрения (люди и техника).
  _pickTarget() {
    const n = this.npc;
    const tgt = this.war.nearestEnemy(this.team, n.position, this.sight, {
      vehicles: this.cls === 'rpg' ? 'all' : 'soft', infantry: this.cls !== 'rpg' || this.alerted > 0,
    });
    if (tgt) {
      if (tgt !== this.target) n.aimTime = 0;
      this.target = tgt;
    } else if (this.target && dist2(n.position, this.target.position) > this.sight * 1.4) this.target = null;
  }

  _whileShooting(dt, d) {
    const n = this.npc;
    // В укрытии — стоим. В атаке стрелок идёт на врага (на дистанции стрельбы): иначе армии застывают друг против друга.
    if (this.cover) return 0;
    const hold = this.cls === 'sniper' ? 1e9 : this.cls === 'rpg' ? 45 : this.cls === 'assault' ? 14 : 30;
    if (this.order === 'attack' && d > hold && this.alerted <= 0 || (this.order === 'attack' && d > hold * 1.4)) {
      const sp = 2.3;
      this._move(dt, Math.sin(n.heading), Math.cos(n.heading), sp);
      return sp;
    }
    // Мелкое маневрирование: шаг в сторону, чтобы труднее попасть.
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 1.2 + Math.random() * 1.6;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeStill = Math.random() < 0.45;
    }
    if (this.strafeStill || d < 8) return 0;
    const sp = 1.6;
    const a = n.heading + this.strafeDir * Math.PI / 2;
    this._move(dt, Math.sin(a), Math.cos(a), sp);
    return sp;
  }

  _face(dt) {
    const n = this.npc;
    if (this.idleFace != null) n.heading = dampAngle(n.heading, this.idleFace, 4, dt);
    return 0;
  }

  _faceCover(dt) {
    const n = this.npc;
    if (this.cover) n.heading = dampAngle(n.heading, this.cover.face, 5, dt);
    return 0;
  }

  // Шагнуть по маршруту. true — маршрут пройден.
  _walkPath(dt, mul = 1) {
    const n = this.npc;
    if (this.pathIdx >= this.path.length) return true;
    const p = this.path[this.pathIdx];
    const dx = p.x - n.position.x, dz = p.z - n.position.z;
    const d = Math.hypot(dx, dz);
    const last = this.pathIdx === this.path.length - 1;
    if (d < (last ? 1.1 : 2.6)) {
      this.pathIdx++;
      return this.pathIdx >= this.path.length;
    }
    const sp = n.walkSpeed * 1.35 * mul;
    n.heading = dampAngle(n.heading, Math.atan2(dx, dz), 8, dt);
    this._move(dt, Math.sin(n.heading), Math.cos(n.heading), sp);
    // застрял — обойти точку
    this.stuckTimer += dt;
    if (this.stuckTimer > STEP_STUCK) {
      this.stuckTimer = 0;
      if (Math.hypot(n.position.x - this.lastPos.x, n.position.z - this.lastPos.z) < 0.9) {
        // сдвиг в сторону; если опять — пропустить точку
        this.skip = (this.skip ?? 0) + 1;
        if (this.skip >= 2) { this.pathIdx++; this.skip = 0; }
        else {
          const a = n.heading + (Math.random() < 0.5 ? 1 : -1) * 1.4;
          n.position.x += Math.sin(a) * 1.5;
          n.position.z += Math.cos(a) * 1.5;
        }
      } else this.skip = 0;
      this.lastPos.x = n.position.x;
      this.lastPos.z = n.position.z;
    }
    return false;
  }

  _move(dt, dx, dz, sp) {
    const n = this.npc;
    n.position.x += dx * sp * dt;
    n.position.z += dz * sp * dt;
  }

  // Охрана президента / лидера: держится рядом, смотрит наружу.
  _follow(dt) {
    const n = this.npc, L = this.leader;
    if (!L || L.isDead) return this._face(dt);
    const lp = L.position;
    const h = L.heading ?? 0;
    // место в строю: кольцо вокруг лидера
    const k = this.slot, ring = 3 + (k % 3);
    const a = (k / 6) * Math.PI * 2 + h;
    const tx = lp.x + Math.sin(a) * ring, tz = lp.z + Math.cos(a) * ring;
    const dx = tx - n.position.x, dz = tz - n.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.4) {
      n.heading = dampAngle(n.heading, a, 3, dt);
      return 0;
    }
    const sp = n.walkSpeed * (d > 14 ? 1.9 : d > 6 ? 1.45 : 1.0);
    n.heading = dampAngle(n.heading, Math.atan2(dx, dz), 8, dt);
    this._move(dt, Math.sin(n.heading), Math.cos(n.heading), sp);
    return sp;
  }

  _guard(dt) {
    const n = this.npc;
    const home = this.home;
    if (!home) return 0;
    const d = Math.hypot(home.x - n.position.x, home.z - n.position.z);
    if (d > 1.2) {
      n.heading = dampAngle(n.heading, Math.atan2(home.x - n.position.x, home.z - n.position.z), 8, dt);
      this._move(dt, Math.sin(n.heading), Math.cos(n.heading), n.walkSpeed * 1.3);
      return n.walkSpeed * 1.3;
    }
    n.heading = dampAngle(n.heading, home.face ?? 0, 3, dt);
    return 0;
  }
}

// ---------------------------------------------------------------- техника

// Водитель: AIDriver в режиме погони за точкой (дороги, объезды, задний ход), остановка у цели.
export function attachDriver(game, vehicle, AIDriver, objective) {
  const ai = new AIDriver(game, vehicle, 'pursuit');
  ai.target = { position: new THREE.Vector3(objective.x, 0, objective.z), isDead: false, velocity: new THREE.Vector3() };
  ai.attachToRoad();
  vehicle.ai = ai;
  return ai;
}

// Пилот: летит к точке на высоте и кружит; стрельбой занимается турель вертолёта.
export class HeliPilot {
  constructor(game, heli, center, { alt = 26, radius = 55 } = {}) {
    this.game = game;
    this.heli = heli;
    this.center = center;
    this.alt = alt;
    this.radius = radius;
    this.phase = Math.random() * 6.28;
    this.t = 0;
  }

  drive(dt, c) {
    const h = this.heli;
    this.t += dt;
    // точка на окружности вокруг цели
    const a = this.phase + this.t * 0.1;
    const tx = this.center.x + Math.sin(a) * this.radius, tz = this.center.z + Math.cos(a) * this.radius;
    const dx = tx - h.position.x, dz = tz - h.position.z;
    const ang = wrapAngle(Math.atan2(dx, dz) - h.heading);
    c.steer = clamp(ang * 1.8, -1, 1);
    const d = Math.hypot(dx, dz);
    c.throttle = Math.abs(ang) > 0.9 ? 0.15 : d > 30 ? 1 : 0.5;
    const ground = this.game.world.getGroundHeight(h.position.x, h.position.z);
    const want = ground + this.alt + Math.sin(this.t * 0.4) * 3;
    const err = want - h.position.y;
    c.climb = clamp(err * 0.35, -1, 1);
    c.handbrake = false;
  }
}

