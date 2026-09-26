import * as THREE from 'three';
import { CONFIG } from './config.js';
import { rayBox } from './collision.js';

// Пули: лучи против мира (земля, здания, фонари), машин (ориентированные коробки)
// и людей (капсулы по суставам: голова, корпус, руки, ноги). Урон умножается
// по зоне попадания (CONFIG.hitZones). Мёртвым телам (рэгдолл) пуля даёт толчок.
//
//   fireShot(game, { shooter, origin, dir, weapon, spread, damageScale, muzzle, weaponMesh })
//   aimPoint(game, origin, dir, ignore)  — куда смотрит прицел (для игрока)
//   lineOfSight(game, from, to)          — видит ли стрелок цель

const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _end = new THREE.Vector3(), _p = new THREE.Vector3();

// Сегменты тела для попаданий: [точка A, точка B, радиус, зона].
const SEGMENTS = [
  ['head', 'head', 0.14, 'head'],
  ['pelvis', 'chest', 0.2, 'torso'],
  ['chest', 'head', 0.07, 'torso'],
  ['shoulderL', 'elbowL', 0.075, 'limb'], ['elbowL', 'handL', 0.06, 'limb'],
  ['shoulderR', 'elbowR', 0.075, 'limb'], ['elbowR', 'handR', 0.06, 'limb'],
  ['hipL', 'kneeL', 0.1, 'limb'], ['kneeL', 'footL', 0.08, 'limb'],
  ['hipR', 'kneeR', 0.1, 'limb'], ['kneeR', 'footR', 0.08, 'limb'],
];

// Мир: земля + препятствия. Возвращает { t, normal, type } или null.
export function raycastWorld(game, o, d, maxT) {
  let best = maxT, normal = null, type = null;
  if (d.y < -1e-4) {
    let t = -o.y / d.y;
    if (t > 0 && t < best) {
      const g = game.world.getGroundHeight(o.x + d.x * t, o.z + d.z * t);
      if (g > 0) t = (g - o.y) / d.y;
      if (t > 0 && t < best) { best = t; normal = UP; type = 'ground'; }
    }
  }
  const hit = game.world.colliders.raycast(o.x, o.y, o.z, d.x, d.y, d.z, best);
  if (hit) {
    best = hit.t;
    normal = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
    type = hit.box.type;
  }
  return type ? { t: best, normal, type } : null;
}

// Машины как коробки в их локальных осях.
export function raycastVehicles(game, o, d, maxT, ignore) {
  let best = null;
  for (const v of game.vehicles) {
    if (v === ignore) continue;
    const rx = o.x - v.position.x, rz = o.z - v.position.z;
    // быстрый отсев: машина далеко от луча
    const s = rx * -d.x + rz * -d.z;
    if (s < -3 || s > maxT + 3) continue;
    const cx = rx + d.x * s, cz = rz + d.z * s;
    if (cx * cx + cz * cz > 9 + 1e-3 && rx * rx + rz * rz > 9) continue;
    const cos = Math.cos(v.heading), sin = Math.sin(v.heading);
    const lox = rx * cos - rz * sin, loz = rx * sin + rz * cos;
    const ldx = d.x * cos - d.z * sin, ldz = d.x * sin + d.z * cos;
    const r = rayBox(lox, o.y - v.position.y, loz, ldx, d.y, ldz, -0.95, 0.2, -2.3, 0.95, v.hitHeight ?? 1.45, 2.3, best ? best.t : maxT);
    if (r) {
      const n = new THREE.Vector3(r.nx * cos + r.nz * sin, r.ny, -r.nx * sin + r.nz * cos);
      best = { t: r.t, normal: n, vehicle: v };
    }
  }
  return best;
}

// Союзники: игрок и его банда (squad.js). Их пули друг в друга не попадают.
export const isAlly = (game, c) => c === game.player || c?.follower === true;

// Все, в кого можно попасть (живые и мёртвые), кроме ignore и сидящих в машинах.
function* targets(game, ignore) {
  const p = game.player;
  const allies = !!ignore && isAlly(game, ignore);
  if (p !== ignore && !p.vehicle && !allies) yield p;
  for (const n of game.npcs.list) {
    if (n !== ignore && !n.vehicle && n.model.root.visible && !(allies && n.follower)) yield n;
  }
}

// Люди: луч против капсул сегментов тела.
export function raycastCharacters(game, o, d, maxT, ignore) {
  let best = null;
  for (const c of targets(game, ignore)) {
    // быстрый отсев по расстоянию от луча до центра тела
    _p.copy(c.position);
    _p.y += 0.9;
    _p.sub(o);
    const s = _p.dot(d);
    if (s < -1.5 || s > maxT + 1.5) continue;
    if (_p.lengthSq() - s * s > 2.2 * 2.2) continue;
    const J = c.model.getJoints();
    for (const [a, b, r, zone] of SEGMENTS) {
      const t = rayCapsule(o, d, maxT, J[a], J[b], r);
      if (t !== null && (!best || t < best.t)) best = { t, character: c, zone };
    }
  }
  return best;
}

// Первое пересечение луча с чем угодно: { t, point, normal, kind, character?, zone?, vehicle? }.
export function raycastAll(game, o, d, maxT, ignore) {
  const w = raycastWorld(game, o, d, maxT);
  let hit = w ? { t: w.t, normal: w.normal, kind: 'world', type: w.type } : null;
  const v = raycastVehicles(game, o, d, hit ? hit.t : maxT, ignore?.vehicle ?? null);
  if (v) hit = { t: v.t, normal: v.normal, kind: 'vehicle', vehicle: v.vehicle };
  const c = raycastCharacters(game, o, d, hit ? hit.t : maxT, ignore);
  if (c) hit = { t: c.t, kind: 'character', character: c.character, zone: c.zone, normal: null };
  if (hit) hit.point = o.clone().addScaledVector(d, hit.t);
  return hit;
}

// Точка, в которую смотрит прицел (луч из камеры), — пули летят туда.
export function aimPoint(game, origin, dir, ignore, maxT = 200) {
  const hit = raycastAll(game, origin, dir, maxT, ignore);
  return hit ? hit.point : origin.clone().addScaledVector(dir, maxT);
}

export function lineOfSight(game, from, to) {
  _d.subVectors(to, from);
  const len = _d.length();
  if (len < 1e-3) return true;
  _d.divideScalar(len);
  return !raycastWorld(game, from, _d, len - 0.3);
}

// Случайное направление внутри конуса с углом spread вокруг dir.
function jitter(dir, spread, out) {
  const a = Math.random() * Math.PI * 2;
  const r = spread * Math.sqrt(Math.random());
  // два перпендикуляра к dir
  const px = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
  const py = new THREE.Vector3().crossVectors(dir, px);
  return out.copy(dir).addScaledVector(px, Math.cos(a) * r).addScaledVector(py, Math.sin(a) * r).normalize();
}

// Выстрел (все дробинки). Возвращает { hits, killed, headshot } для индикатора попадания.
export function fireShot(game, { shooter, origin, dir, weapon, spread = 0, damageScale = 1, muzzle = null, weaponMesh = null }) {
  const def = CONFIG.weapons[weapon];
  const zones = CONFIG.hitZones;
  const from = muzzle ?? origin;
  const result = { hits: 0, killed: false, headshot: false };
  const shotDir = new THREE.Vector3();
  for (let n = 0; n < def.pellets; n++) {
    jitter(dir, spread, shotDir);
    const hit = raycastAll(game, origin, shotDir, def.range, shooter);
    _end.copy(hit ? hit.point : origin.clone().addScaledVector(shotDir, def.range));
    if (n < 3) game.effects.tracer(from, _end);
    if (!hit) continue;
    if (hit.kind === 'character') {
      const c = hit.character;
      const falloff = def.pellets > 1 ? Math.max(0.35, 1 - hit.t / def.range) : 1;
      // По игроку голова — не x3, а максимум x1.5 (иначе NPC убивают слишком быстро).
      const zone = c === game.player ? Math.min(zones[hit.zone], 1.5) : zones[hit.zone];
      const dmg = def.damage * zone * falloff * (c === game.player ? damageScale : 1);
      const wasDead = c.isDead;
      game.effects.burst(hit.point, shotDir.clone().negate(), 'blood', 6);
      // Толчок тела делится между дробинками (иначе заряд дроби отправляет тело в полёт).
      const impulse = def.pellets > 1 ? (def.impulse * 2.5) / def.pellets : def.impulse;
      if (wasDead) {
        c.ragdoll?.impulse(hit.point, shotDir, impulse);
      } else {
        c.takeDamage(dmg, shooter, shotDir.x, shotDir.z, 'bullet', { zone: hit.zone, point: hit.point, dir: shotDir.clone(), impulse });
        result.hits++;
        if (hit.zone === 'head') result.headshot = true;
        if (c.isDead) result.killed = true;
      }
    } else if (hit.kind === 'vehicle') {
      game.effects.burst(hit.point, hit.normal, 'spark', 5);
      hit.vehicle.damage(def.damage * 0.35, shooter);
    } else {
      game.effects.burst(hit.point, hit.normal, hit.type === 'ground' ? 'dust' : hit.type === 'lamp' ? 'spark' : 'dust', 5);
    }
  }
  game.effects.muzzle(from, dir, weaponMesh);
  game.audio.gunshot(weapon, from);
  game.events.emit('weapon:fired', { shooter, weapon, position: from });
  return result;
}

// Ближайшее расстояние между лучом [o, o + d*maxT] и отрезком [a, b]; если меньше r — t входа.
const _u = new THREE.Vector3(), _w = new THREE.Vector3();
function rayCapsule(o, d, maxT, a, b, r) {
  _u.subVectors(b, a);
  _w.subVectors(o, a);
  const A = 1; // d единичный
  const B = d.dot(_u), C = _u.dot(_u), D = d.dot(_w), E = _u.dot(_w);
  const den = A * C - B * B;
  let s, t;
  if (C < 1e-8) {
    // отрезок вырожден в точку (голова)
    s = Math.max(0, Math.min(maxT, -D));
    t = 0;
  } else {
    s = den > 1e-8 ? (B * E - C * D) / den : 0;
    s = Math.max(0, Math.min(maxT, s));
    t = (B * s + E) / C;
    if (t < 0 || t > 1) {
      t = Math.max(0, Math.min(1, t));
      s = Math.max(0, Math.min(maxT, B * t - D));
    }
  }
  const px = o.x + d.x * s - (a.x + _u.x * t);
  const py = o.y + d.y * s - (a.y + _u.y * t);
  const pz = o.z + d.z * s - (a.z + _u.z * t);
  const dist2 = px * px + py * py + pz * pz;
  if (dist2 > r * r) return null;
  return Math.max(0, s - Math.sqrt(r * r - dist2));
}
