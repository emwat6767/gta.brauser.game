import { CollisionGrid, pushCircleOutOfBox, rayBox } from '../js/collision.js';
import { FLOOR_H, STAIRS, STAIR_Z0, STAIR_Z1, LANDING_Y, BLD, SITE, GYM, zoneAt, floorOfY } from './layout.js';

// Физический мир школы: препятствия-коробки с высотой (minY…maxY), поверхности пола
// (два этажа и лестничные марши), прямая видимость и поиск зоны по точке.
//
// Препятствие: { minX, maxX, minZ, maxZ, minY, maxY, type, see? }
//   see: true — не загораживает взгляд (стекло, перила, мебель ниже глаз проверяется по высоте сама).
// Человек сталкивается с коробкой, если она перекрывает его тело по высоте [y + 0.15, y + 1.5].

const _hit = { nx: 0, nz: 0, depth: 0 };

export class SchoolWorld {
  constructor() {
    const size = Math.max(SITE.x1 - SITE.x0, SITE.z1 - SITE.z0) + 4;
    this.grid = new CollisionGrid(SITE.x0 - 2, SITE.z0 - 2, size, 2);
    this.platforms = [];   // невысокие площадки (сцена): { minX, maxX, minZ, maxZ, y }
  }

  addPlatform(minX, maxX, minZ, maxZ, y) {
    this.platforms.push({ minX, maxX, minZ, maxZ, y });
  }

  add(box) {
    box.minY ??= 0;
    box.height = box.maxY;
    return this.grid.add(box);
  }

  remove(box) {
    this.grid.remove(box);
  }

  // Стена/мебель как коробка по центру и размерам.
  addBox(cx, cz, sx, sz, minY, maxY, type = 'wall', extra = null) {
    return this.add({ minX: cx - sx / 2, maxX: cx + sx / 2, minZ: cz - sz / 2, maxZ: cz + sz / 2, minY, maxY, type, ...extra });
  }

  // --- Пол -------------------------------------------------------------------

  // Высота пола под точкой: самая высокая поверхность не выше y + step.
  groundAt(x, z, y = 0, step = 0.5) {
    let best = 0;
    const lim = y + step;
    // Второй этаж: над главным корпусом, кроме лестничных пролётов.
    if (x > BLD.x0 - 0.3 && x < BLD.x1 && z > BLD.z0 - 0.3 && z < BLD.z1 + 0.3 && FLOOR_H <= lim && !this._stairHole(x, z)) best = FLOOR_H;
    for (const p of this.platforms) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && p.y <= lim && p.y > best) best = p.y;
    }
    for (const s of STAIRS) {
      if (x < s.x0 || x > s.x1 || z < STAIR_Z0 - 0.01 || z > BLD.z1) continue;
      let h = null;
      if (z >= STAIR_Z1) h = LANDING_Y;
      else if (x >= s.laneA[0] && x <= s.laneA[1]) h = ((z - STAIR_Z0) / (STAIR_Z1 - STAIR_Z0)) * LANDING_Y;
      else if (x >= s.laneB[0] && x <= s.laneB[1]) h = LANDING_Y + ((STAIR_Z1 - z) / (STAIR_Z1 - STAIR_Z0)) * LANDING_Y;
      if (h !== null && h <= lim && h > best) best = h;
    }
    return best;
  }

  _stairHole(x, z) {
    for (const s of STAIRS) if (x > s.x0 && x < s.x1 && z > STAIR_Z0 && z < BLD.z1) return true;
    return false;
  }

  // Участок с крышей (для дождя/неба не нужно; для камеры — потолок над точкой).
  ceilingAt(x, z, y) {
    const inside = (x > BLD.x0 && x < BLD.x1 && z > BLD.z0 && z < BLD.z1);
    const inGym = x > GYM.x0 && x < GYM.x1 && z > GYM.z0 && z < GYM.z1;
    if (inGym) return GYM.h - 0.15;
    if (!inside) return 99;
    if (this._stairHole(x, z)) return 2 * FLOOR_H - 0.3;
    return y < FLOOR_H - 0.2 ? FLOOR_H - 0.3 : 2 * FLOOR_H - 0.3;
  }

  // --- Столкновения ------------------------------------------------------------

  // Выталкивает круг радиуса r из препятствий (тело по высоте от y). Возвращает число касаний.
  resolveCircle(pos, r, bodyH = 1.5) {
    const y0 = pos.y + 0.15, y1 = pos.y + bodyH;
    let n = 0;
    for (let pass = 0; pass < 2; pass++) {
      const list = this.grid.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.maxY <= y0 || b.minY >= y1 || b.ghost) continue;
        if (pushCircleOutOfBox(pos, r, b, _hit)) n++;
      }
    }
    if (pos.x < SITE.x0) pos.x = SITE.x0;
    if (pos.x > SITE.x1) pos.x = SITE.x1;
    if (pos.z < SITE.z0) pos.z = SITE.z0;
    if (pos.z > SITE.z1) pos.z = SITE.z1;
    return n;
  }

  isFree(x, z, y, r) {
    const list = this.grid.query(x - r, z - r, x + r, z + r);
    for (const b of list) {
      if (b.maxY <= y + 0.15 || b.minY >= y + 1.5 || b.ghost) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    }
    return true;
  }

  // --- Видимость ---------------------------------------------------------------

  // Луч от (ox, oy, oz) по направлению (dx, dy, dz) (единичный) до maxT. Коробки с see: true
  // (стёкла, перила) взгляд не загораживают, если sight = true. Возвращает расстояние или null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, sight = false) {
    const G = this.grid, cs = G.cellSize;
    let cx = Math.floor((ox - G.minX) / cs), cz = Math.floor((oz - G.minZ) / cs);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? cs / Math.abs(dx) : Infinity;
    const tDeltaZ = dz !== 0 ? cs / Math.abs(dz) : Infinity;
    let tMaxX = dx !== 0 ? ((G.minX + (cx + (dx > 0 ? 1 : 0)) * cs) - ox) / dx : Infinity;
    let tMaxZ = dz !== 0 ? ((G.minZ + (cz + (dz > 0 ? 1 : 0)) * cs) - oz) / dz : Infinity;
    const stamp = ++G._stamp;
    let best = maxT, hit = false, t = 0;
    while (t <= best) {
      if (cx < 0 || cz < 0 || cx >= G.cols || cz >= G.cols) break;
      const cell = G.cells[cz * G.cols + cx];
      if (cell) {
        for (const b of cell) {
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          if (b.ghost || (sight && b.see)) continue;
          const r = rayBox(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best);
          if (r) { best = r.t; hit = true; }
        }
      }
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; } else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
    }
    return hit ? best : null;
  }

  // Есть ли прямая видимость между двумя точками (Vector3-подобные).
  lineOfSight(a, b, sight = true) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    // Перекрытие между этажами: если точки на разных этажах — только через лестницу.
    if (floorOfY(a.y - 1.4) !== floorOfY(b.y - 1.4) && !this._stairHole(a.x, a.z) && !this._stairHole(b.x, b.z)) {
      const inA = a.x > BLD.x0 && a.x < BLD.x1 && a.z > BLD.z0 && a.z < BLD.z1;
      const inB = b.x > BLD.x0 && b.x < BLD.x1 && b.z > BLD.z0 && b.z < BLD.z1;
      if (inA || inB) return false;
    }
    return this.raycast(a.x, a.y, a.z, dx / d, dy / d, dz / d, d - 0.05, sight) === null;
  }

  zoneAt(x, z, y) {
    return zoneAt(x, z, floorOfY(y));
  }
}
