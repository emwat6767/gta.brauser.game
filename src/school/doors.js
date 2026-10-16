import * as THREE from 'three';
import { mergeColored } from '../js/geometry.js';
import { ROOM_BY_ID, EXITS, EXTRA_DOORS, floorOfY } from './layout.js';
import { corridorZone } from './furniture.js';

// Двери: створки с анимацией, коллайдер в закрытом состоянии, замок (только изнутри кабинета),
// баррикада (парта у двери), выбивание (террорист, толпа зомби). Наружные двери — двустворчатые
// (главный вход стеклянный), открываются наружу и не запираются.
//
// door: { id, axis, c, a, b, y0, h, floor, zones: [коридор, комната], roomZone, roomSign (куда «внутрь»),
//         exterior, open, target, locked, barricade, hp, broken, leaves, collider }

const ANGLE = Math.PI / 2 * 0.92;
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

function leafGeometry(w, h, style, dir) {
  const parts = [];
  const add = (cx, cy, sx, sy, sz, color, cz = 0) => parts.push({ geometry: new THREE.BoxGeometry(sx, sy, sz).translate(dir * cx, cy, cz), color });
  if (style === 'glass') {
    add(w / 2, h / 2, w, h, 0.03, '#a9c9da');
    add(0.04, h / 2, 0.08, h, 0.06, '#9aa3ab');
    add(w - 0.04, h / 2, 0.08, h, 0.06, '#9aa3ab');
    add(w / 2, 0.06, w, 0.12, 0.06, '#9aa3ab');
    add(w / 2, h - 0.04, w, 0.08, 0.06, '#9aa3ab');
    add(w - 0.12, 1.05, 0.04, 0.6, 0.1, '#d8dcdf');
  } else if (style === 'metal') {
    add(w / 2, h / 2, w, h, 0.05, '#5d6b63');
    add(w / 2, 1.0, w - 0.2, 0.05, 0.12, '#c8ccd0');
  } else {
    add(w / 2, h / 2, w, h, 0.045, style === 'wc' ? '#e9e6dc' : '#a8743e');
    add(w / 2, h * 0.72, w * 0.42, h * 0.26, 0.05, '#bcd8e6');      // окошко
    add(w / 2, h * 0.72, w * 0.48, h * 0.3, 0.048, style === 'wc' ? '#d8d4ca' : '#7a4e2a');
    add(w - 0.1, 1.0, 0.12, 0.03, 0.12, '#d8dcdf');                  // ручка
  }
  // Если на одной позиции две коробки (рамка окошка и стекло) — стекло толще и видно поверх рамки.
  const g = mergeColored(parts);
  return g;
}

export class DoorSystem {
  constructor(scene, world, school, events = {}) {
    this.scene = scene;
    this.world = world;
    this.events = events;      // onSlam(door), onRattle(door), onBang(door), onBreak(door)
    this.list = [];
    for (const o of school.openings) {
      if (o.kind === 'door') this.list.push(this._make(o, false));
      else if (o.kind === 'exit') this.list.push(this._make(o, true));
    }
  }

  _make(o, exterior) {
    const floor = floorOfY(o.y0 + 0.1);
    const mid = (o.a + o.b) / 2;
    const d = {
      id: o.room ?? o.extra ?? o.exit, axis: o.axis, c: o.c, a: o.a, b: o.b, y0: o.y0, h: o.y1 - o.y0, floor, exterior,
      open: 0, target: 0, locked: false, barricade: 0, barricadeMesh: null, hp: 100, broken: false, leaves: [], collider: null,
      bangs: 0, lastNoise: 0, lockedBy: null, x: o.axis === 'x' ? mid : o.c, y: o.y0 + 1.2, z: o.axis === 'x' ? o.c : mid,
    };
    // Какая сторона — «комната» (туда открывается дверь, оттуда запирают).
    if (exterior) {
      const e = EXITS.find((x) => x.id === o.exit);
      d.roomZone = e.room;
      d.zones = [e.room, 'outside'];
      d.roomSign = o.axis === 'x' ? (o.c < 0 ? -1 : 1) : (o.c < 0 ? -1 : 1);   // наружу
      d.name = e.name;
    } else if (o.room) {
      const r = ROOM_BY_ID.get(o.room);
      d.roomZone = r.id;
      d.zones = [corridorZone(r.floor, mid), r.id];
      d.roomSign = r.side === 'S' ? -1 : 1;
      d.name = r.name;
    } else {
      const ex = EXTRA_DOORS.find((x) => x.id === o.extra);
      d.zones = ex.rooms;
      d.roomZone = ex.rooms[1];
      d.roomSign = 1;
      d.name = ROOM_BY_ID.get(ex.rooms[1])?.name ?? 'Дверь';
    }
    // Створки.
    const w = o.b - o.a;
    const double = exterior && w > 1.5;
    const style = exterior ? (o.exit === 'main' ? 'glass' : 'metal') : ROOM_BY_ID.get(d.roomZone)?.type === 'wc' ? 'wc' : 'wood';
    const leafW = double ? w / 2 - 0.01 : w - 0.02;
    const make = (pivotS, dir) => {
      const pivot = new THREE.Group();
      if (o.axis === 'x') pivot.position.set(pivotS, o.y0, o.c);
      else pivot.position.set(o.c, o.y0, pivotS);
      const g = leafGeometry(leafW, d.h - 0.02, style, dir);
      if (o.axis === 'z') g.rotateY(-Math.PI / 2);   // вдоль +Z
      const m = new THREE.Mesh(g, MAT);
      m.castShadow = true;
      m.receiveShadow = true;
      pivot.add(m);
      this.scene.add(pivot);
      return { pivot, dir };
    };
    d.leaves.push(make(o.a + 0.01, 1));
    if (double) d.leaves.push(make(o.b - 0.01, -1));
    this._setCollider(d, true);
    this._pose(d);
    return d;
  }

  // Поворот створок по d.open. dir = 1: створка от петли в +s; −1: в −s.
  _pose(d) {
    const sgn = d.roomSign;
    for (const L of d.leaves) {
      const a = d.open * ANGLE * L.dir;
      // Вдоль X: поворот на −a уводит створку в +Z. Вдоль Z: поворот на +a — в +X.
      L.pivot.rotation.y = d.axis === 'x' ? -a * sgn : a * sgn;
      if (d.broken) L.pivot.rotation.z = 0.08;
    }
  }

  _setCollider(d, on) {
    if (on && !d.collider) {
      const t = 0.07;
      const box = d.axis === 'x'
        ? { minX: d.a, maxX: d.b, minZ: d.c - t, maxZ: d.c + t, minY: d.y0, maxY: d.y0 + d.h, type: 'door', door: d }
        : { minX: d.c - t, maxX: d.c + t, minZ: d.a, maxZ: d.b, minY: d.y0, maxY: d.y0 + d.h, type: 'door', door: d };
      d.collider = this.world.add(box);
    } else if (!on && d.collider) {
      this.world.remove(d.collider);
      d.collider = null;
    }
  }

  // Сторона двери, где точка: +1 — «комната» (куда открывается), −1 — коридор/улица.
  sideOf(d, x, z) {
    const v = d.axis === 'x' ? z - d.c : x - d.c;
    return Math.sign(v) === d.roomSign ? 1 : -1;
  }

  isClosed(d) {
    return !d.broken && d.open < 0.2 && d.target < 0.5;
  }

  passable(d) {
    return d.broken || (!d.locked && d.barricade === 0);
  }

  // Открыть (если можно). Возвращает true, если дверь открыта или открывается.
  tryOpen(d, who = null) {
    if (d.broken || d.target > 0.5) return true;
    if (d.locked || d.barricade > 0) {
      if (performance.now() - d.lastNoise > 900) {
        d.lastNoise = performance.now();
        this.events.onRattle?.(d, who);
      }
      return false;
    }
    d.target = 1;
    return true;
  }

  close(d) {
    if (d.broken) return false;
    if (d.target > 0.5) this.events.onSlam?.(d, 0.4);
    d.target = 0;
    return true;
  }

  toggle(d, who) {
    if (d.target > 0.5) return this.close(d);
    return this.tryOpen(d, who);
  }

  setLocked(d, locked, who = null) {
    if (d.exterior || d.broken) return false;
    if (locked && d.target > 0.5) d.target = 0;
    d.locked = locked;
    d.lockedBy = locked ? who : null;
    return true;
  }

  // Баррикада: парта вплотную к двери со стороны комнаты.
  barricade(d, on) {
    if (d.broken) return false;
    if (on && d.barricade === 0) {
      d.target = 0;
      d.barricade = 1;
      const s = d.roomSign * 0.45;
      const cx = d.axis === 'x' ? (d.a + d.b) / 2 : d.c + s, cz = d.axis === 'x' ? d.c + s : (d.a + d.b) / 2;
      const sx = d.axis === 'x' ? 1.25 : 0.55, sz = d.axis === 'x' ? 0.55 : 1.25;
      const g = mergeColored([
        { geometry: new THREE.BoxGeometry(sx, 0.04, sz).translate(0, 0.74, 0), color: '#c8a46a' },
        { geometry: new THREE.BoxGeometry(sx * 0.95, 0.72, sz * 0.9).translate(0, 0.36, 0), color: '#8f7650' },
      ]);
      const m = new THREE.Mesh(g, MAT);
      m.position.set(cx, d.y0, cz);
      m.rotation.z = 0.04;
      m.castShadow = true;
      this.scene.add(m);
      d.barricadeMesh = m;
      d.barricadeBox = this.world.addBox(cx, cz, sx, sz, d.y0, d.y0 + 0.9, 'barricade');
      d.hp = Math.max(d.hp, 100) + 140;
      return true;
    }
    if (!on && d.barricade > 0) {
      d.barricade = 0;
      d.barricadeMesh?.removeFromParent();
      d.barricadeMesh = null;
      if (d.barricadeBox) this.world.remove(d.barricadeBox);
      d.barricadeBox = null;
      d.hp = Math.min(d.hp, 100);
      return true;
    }
    return false;
  }

  // Удар по двери (выбивают). Возвращает true, если дверь сломалась.
  damage(d, amount) {
    if (d.broken) return false;
    d.hp -= amount;
    d.bangs++;
    this.events.onBang?.(d, amount);
    if (d.hp > 0) return false;
    d.broken = true;
    d.locked = false;
    d.target = 1;
    d.open = 0.7;
    if (d.barricade) {
      d.barricade = 0;
      if (d.barricadeBox) this.world.remove(d.barricadeBox);
      if (d.barricadeMesh) {
        d.barricadeMesh.rotation.y = 0.6;
        d.barricadeMesh.position.x += d.axis === 'x' ? 0.2 : d.roomSign * 0.6;
        d.barricadeMesh.position.z += d.axis === 'x' ? d.roomSign * 0.6 : 0.2;
      }
    }
    this._setCollider(d, false);
    this.events.onBreak?.(d);
    return true;
  }

  update(dt) {
    for (const d of this.list) {
      if (d.open === d.target) continue;
      const sp = 2.6 * dt;
      d.open = d.target > d.open ? Math.min(d.target, d.open + sp) : Math.max(d.target, d.open - sp);
      if (d.open <= 0.001 && d.target === 0) this.events.onSlam?.(d, 0.25);
      this._setCollider(d, !d.broken && d.open < 0.35);
      this._pose(d);
    }
  }

  // Ближайшая дверь к точке на том же этаже (для подсказки E и для NPC).
  nearest(x, z, floor, maxDist = 1.6) {
    let best = null, bd = maxDist;
    for (const d of this.list) {
      if (d.floor !== floor) continue;
      const along = d.axis === 'x' ? x : z, across = d.axis === 'x' ? z - d.c : x - d.c;
      const da = along < d.a ? d.a - along : along > d.b ? along - d.b : 0;
      const dist = Math.hypot(da, across);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  reset() {
    for (const d of this.list) {
      this.barricade(d, false);
      d.locked = false;
      d.broken = false;
      d.hp = 100;
      d.open = d.target = 0;
      d.bangs = 0;
      for (const L of d.leaves) L.pivot.rotation.z = 0;
      this._setCollider(d, true);
      this._pose(d);
    }
  }
}
