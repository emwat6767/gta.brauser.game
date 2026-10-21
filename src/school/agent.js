import * as THREE from 'three';
import { Person, facingDot } from './person.js';
import { floorOfY } from './layout.js';

// Агент — человек с ногами «по навигации»: идёт по пути A* (с лестницами и дверьми), по полю
// расстояний (эвакуация), обходит застревания. Основа для NPC, террориста, зомби и спасателей.

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Agent extends Person {
  constructor(game, look, opts) {
    super(game, look, opts);
    this.path = null;
    this.pathI = 0;
    this.goal = null;
    this.goalSpeed = 1.4;
    this.pathWait = 0;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.lastCheck = 0;
    this.breaker = false;        // угроза: ломает запертые двери
    this.thinkT = Math.random() * 0.3;
    this.onStairs = null;        // ломаная лестницы при движении по полю
    this.doorWait = 0;
    this.blockedDoor = null;
  }

  // Идти к точке. Путь считается сразу, но не чаще бюджета кадра (game.pathBudget).
  goTo(x, z, floor, speed, opts = {}) {
    const same = this.goal && Math.hypot(this.goal.x - x, this.goal.z - z) < 0.6 && this.goal.floor === floor;
    this.goalSpeed = speed;
    if (same && (this.path || this.pathWait > 0) && !opts.force) return true;
    // Цель в мебели/стене — сдвинуть на ближайшую свободную клетку, иначе не «дойти».
    const grid = this.game.nav.grids[floor];
    const k = grid?.idx(x, z) ?? -1;
    if (k >= 0 && grid.blocked[k]) {
      const f = grid.nearestFree(x, z, 6);
      if (f >= 0) { x = grid.cx(f); z = grid.cz(f); }
    }
    this.goal = { x, z, floor, near: opts.near ?? 0.45 };
    this.path = null;
    this.pathI = 0;
    this.pathWait = 0;
    this.onStairs = null;
    return this._plan();
  }

  _plan() {
    if (this.game.pathBudget <= 0) { this.pathWait = 0.05 + Math.random() * 0.1; return true; }
    this.game.pathBudget--;
    const g = this.goal;
    const p = this.game.nav.path({ x: this.pos.x, z: this.pos.z, y: this.pos.y, floor: this.floor }, g, this);
    if (!p) {
      this.path = null;
      this.pathFailed = this.game.time;
      return false;
    }
    this.path = p;
    this.pathI = 0;
    return true;
  }

  clearGoal() {
    this.goal = null;
    this.path = null;
    this.onStairs = null;
    this.stop();
  }

  get arrived() {
    return !this.goal;
  }

  // Шаг движения по пути. Возвращает 'arrived' | 'moving' | 'nopath' | 'door'.
  followPath(dt) {
    if (!this.goal) { this.stop(); return 'arrived'; }
    if (!this.path) {
      if (this.pathWait > 0) { this.pathWait -= dt; this.stop(); if (this.pathWait <= 0) this._plan(); return 'moving'; }
      this.stop();
      return 'nopath';
    }
    const g = this.goal;
    if (this.floor === g.floor && Math.hypot(g.x - this.pos.x, g.z - this.pos.z) < g.near) {
      this.clearGoal();
      return 'arrived';
    }
    let wp = this.path[this.pathI];
    while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < (wp.stair ? 0.35 : 0.5) && this.pathI < this.path.length - 1) {
      this.pathI++;
      wp = this.path[this.pathI];
    }
    if (!wp) { this.clearGoal(); return 'arrived'; }
    // Дверь впереди (на пути ближе 1.3 м)?
    const door = this._doorAhead(wp);
    if (door) {
      const D = this.game.doors;
      if (!D.isClosed(door) || door.open > 0.6) {
        // открыта — идём
      } else if (D.tryOpen(door, this)) {
        this.stop();
        this.doorWait += dt;
        return 'door';
      } else if (this.unlockFromInside(door, dt)) {
        this.stop();
        return 'door';
      } else {
        this.blockedDoor = door;
        this.stop();
        return 'door';
      }
    }
    this.doorWait = 0;
    this.move(wp.x - this.pos.x, wp.z - this.pos.z, this.goalSpeed);
    this._stuck(dt);
    return 'moving';
  }

  // Свою запертую/заблокированную дверь человек изнутри открывает сам (не угроза).
  unlockFromInside(door, dt) {
    if (this.breaker || this.kind === 'zombie') return false;
    const D = this.game.doors;
    if (D.sideOf(door, this.pos.x, this.pos.z) !== 1 || door.exterior) return false;
    this.unlockT = (this.unlockT ?? 0) + dt;
    if (this.unlockT < (door.barricade ? 1.4 : 0.5)) return true;
    this.unlockT = 0;
    if (door.barricade) D.barricade(door, false);
    D.setLocked(door, false);
    this.game.audio?.lock(door);
    D.tryOpen(door, this);
    return true;
  }

  _doorAhead(wp) {
    const D = this.game.doors;
    const d = D.nearest(this.pos.x, this.pos.z, this.floor, 1.3);
    if (!d) return null;
    // Дверь между нами и точкой пути: разные стороны или точка в проёме.
    const s1 = D.sideOf(d, this.pos.x, this.pos.z), s2 = D.sideOf(d, wp.x, wp.z);
    const across = d.axis === 'x' ? Math.abs(this.pos.z - d.c) : Math.abs(this.pos.x - d.c);
    if (s1 !== s2 || across < 0.5) return d;
    return null;
  }

  // Застревание: стоит на месте при желании идти — шаг в сторону и перепланирование.
  _stuck(dt) {
    this.lastCheck += dt;
    if (this.lastCheck < 1.2) return;
    const moved = this.lastPos.distanceTo(this.pos);
    this.lastPos.copy(this.pos);
    this.lastCheck = 0;
    if (moved < 0.25 && this.want.lengthSq() > 0.1) {
      this.stuckT++;
      // У последней точки пути и не продвигается — считаем, что пришёл.
      if (this.stuckT >= 2 && this.goal && this.path && this.pathI >= this.path.length - 1 &&
          Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 1.6) {
        this.stuckT = 0;
        this.clearGoal();
        return;
      }
      if (this.stuckT >= 2 && this.goal) {
        this.stuckT = 0;
        // Сдвинуться в случайную сторону и пересчитать путь.
        const a = Math.random() * Math.PI * 2;
        this.pos.x += Math.sin(a) * 0.25;
        this.pos.z += Math.cos(a) * 0.25;
        this.path = null;
        this.pathWait = 0.1;
      }
    } else this.stuckT = 0;
  }

  // Движение по полю расстояний (эвакуация). fields = { f0, f1 }. Возвращает расстояние до цели.
  followField(dt, fields, speed) {
    const nav = this.game.nav;
    if (this.onStairs) {
      const pts = this.onStairs;
      let wp = pts[this.stairI];
      while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.4) wp = pts[++this.stairI];
      if (!wp) { this.onStairs = null; return 99; }
      this.move(wp.x - this.pos.x, wp.z - this.pos.z, speed);
      this._stuck(dt);
      return 99;
    }
    // Посреди лестницы — дойти по маршам вниз.
    for (const s of nav.stairs) {
      const st = this.game.world;
      if (this.pos.x < s.pts[0].x - 2 || this.pos.x > s.pts[s.pts.length - 1].x + 2 || this.pos.z < 2.95) continue;
      if (!st._stairHole(this.pos.x, this.pos.z)) continue;
      const down = [...s.pts].reverse();
      let bi = 0, bd = Infinity;
      down.forEach((p, i) => { const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z, (p.y - this.pos.y) * 2); if (d < bd) { bd = d; bi = i; } });
      this.onStairs = down;
      this.stairI = Math.min(down.length - 1, bi + 1);
      return 99;
    }
    const fl = this.floor;
    const grid = nav.grids[fl];
    const field = fl === 0 ? fields.f0 : fields.f1;
    if (fl === 1) {
      // Рядом с лестницей и поле говорит «вниз» — идём по маршам.
      const { stair, dist } = nav.nearestStair(this.pos.x, this.pos.z, 1);
      const k = grid.idx(this.pos.x, this.pos.z);
      if (dist < 1.2 && k >= 0 && field[k] < Infinity) {
        this.onStairs = [...stair.pts].reverse();
        this.stairI = 0;
        return 99;
      }
    }
    const step = grid.descend(field, this.pos.x, this.pos.z, 4);
    if (!step) { this.stop(); return Infinity; }
    // Дверь на пути.
    const door = this._doorAhead(step);
    if (door && this.game.doors.isClosed(door)) {
      if (!this.game.doors.tryOpen(door, this) && !this.unlockFromInside(door, dt)) this.blockedDoor = door;
      this.stop();
      return step.d;
    }
    this.blockedDoor = null;
    if (Math.hypot(step.x - this.pos.x, step.z - this.pos.z) < 0.05) this.stop();
    else this.move(step.x - this.pos.x, step.z - this.pos.z, speed);
    this._stuck(dt);
    return step.d;
  }

  // Видит ли этот агент другого человека (угол обзора, дальность, стены).
  canSee(other, range, fovCos = 0.2) {
    const dx = other.pos.x - this.pos.x, dz = other.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range || Math.abs(other.pos.y - this.pos.y) > 2.5 && !this._stairish(other)) return false;
    if (d > 1.2 && facingDot(this, other.pos.x, other.pos.z) < fovCos) return false;
    return this.game.world.lineOfSight(this.eye(_v), other.chest(_w));
  }

  _stairish(other) {
    return floorOfY(other.pos.y) === this.floor;
  }
}
