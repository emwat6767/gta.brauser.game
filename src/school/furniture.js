import * as THREE from 'three';
import { roomFrame, floorY, BLD, CORR, GYM, FLOOR_H, DOOR_W, ROOMS, EXITS, STAIRS } from './layout.js';

// Обстановка помещений: парты и стулья, доски, шкафы, стеллажи библиотеки, столовая с кухней,
// спортзал, актовый зал со сценой, туалеты с кабинками, шкафчики и плакаты в коридорах.
// Заодно регистрируются места для пряток, места за партами, предметы (огнетушители, бита, швабра),
// выключатели света, кнопки пожарной тревоги и точки, где люди гуляют на перемене.

const isExt = (axis, c) => (axis === 'x' ? Math.abs(Math.abs(c) - 10) < 1e-3 : Math.abs(c - BLD.x0) < 1e-3 || Math.abs(c - GYM.x1) < 1e-3);

function box(parts, cx, y0, cz, sx, sy, sz, color) {
  parts.push({ geometry: new THREE.BoxGeometry(sx, sy, sz).translate(cx, y0 + sy / 2, cz), color });
}
function cyl(parts, cx, y0, cz, r, h, color, seg = 12, r2 = r) {
  parts.push({ geometry: new THREE.CylinderGeometry(r, r2, h, seg).translate(cx, y0 + h / 2, cz), color });
}
function ball(parts, cx, cy, cz, r, color, sx = 1, sy = 1, sz = 1) {
  parts.push({ geometry: new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).translate(cx, cy, cz), color });
}

// Прямоугольник на стене с UV из атласа; лицом к зрителю, без зеркала.
function vrect(gb, axis, c, sign, s0, s1, y0, y1, r, color = new THREE.Color(1, 1, 1)) {
  const [u0, v0, u1, v1] = r;
  const leftIsS0 = (axis === 'x' && sign > 0) || (axis === 'z' && sign < 0);
  const L = leftIsS0 ? s0 : s1, R = leftIsS0 ? s1 : s0;
  const P = (s, y) => (axis === 'x' ? [s, y, c] : [c, y, s]);
  const n = axis === 'x' ? [0, 0, sign] : [sign, 0, 0];
  gb.quad(P(L, y0), P(R, y0), P(R, y1), P(L, y1), n, [u0, v0, u1, v0, u1, v1, u0, v1], color);
}

// Локальная система комнаты (см. roomFrame) + стены в мировых координатах.
function frameOf(z) {
  const fr = roomFrame(z);
  const S = z.side !== 'N';
  const wallAt = (axis, c, sign) => ({ axis, c: c + sign * ((isExt(axis, c) ? 0 : 0.1) + 0.012), sign });
  fr.walls = S ? {
    back: wallAt('z', z.x0, 1), front: wallAt('z', z.x1, -1), window: wallAt('x', z.z0, 1), corridor: wallAt('x', z.z1, -1),
  } : {
    back: wallAt('z', z.x1, -1), front: wallAt('z', z.x0, 1), window: wallAt('x', z.z1, -1), corridor: wallAt('x', z.z0, 1),
  };
  // Мировое «вдоль стены» для локальной координаты: у back/front — z, у window/corridor — x.
  fr.along = (wall, t) => (wall === 'back' || wall === 'front' ? fr.toWorld(0, t).z : fr.toWorld(t, 0).x);
  fr.dirHeading = (du, dv) => (S ? Math.atan2(du, dv) : Math.atan2(-du, -dv));
  fr.y = floorY(z.floor);
  return fr;
}

// ---------------------------------------------------------------- общие предметы

export function furnishZone(ctx, z) {
  const T = z.type;
  if (z.side === 'S' || z.side === 'N') {
    const fr = frameOf(z);
    if (T === 'classroom' || T === 'computer' || T === 'lab') classroom(ctx, z, fr);
    else if (T === 'library') library(ctx, z, fr);
    else if (T === 'cafeteria') cafeteria(ctx, z, fr);
    else if (T === 'nurse') nurse(ctx, z, fr);
    else if (T === 'principal') principal(ctx, z, fr);
    else if (T === 'lobby') lobby(ctx, z, fr);
    else if (T === 'hall') hall(ctx, z, fr);
    else if (T === 'assembly') assembly(ctx, z, fr);
    else if (T === 'teachers') teachers(ctx, z, fr);
    else if (T === 'storage') storage(ctx, z, fr);
    else if (T === 'wc') wc(ctx, z, fr);
    if (T !== 'stairs' && T !== 'lobby' && T !== 'hall') {
      windowSills(ctx, z, fr);
      lightSwitch(ctx, z, fr);
    }
    if (T === 'stairs') stairsDecor(ctx, z);
  } else if (T === 'gym') gym(ctx, z);
  else if (T === 'gymstore') gymstore(ctx, z);
}

const P = (ctx, z, mat = 'color') => ctx.B.parts(z.id, mat);

function lbox(parts, fr, u, v, y, du, dv, h, color) {
  const p = fr.toWorld(u, v);
  box(parts, p.x, fr.y + y, p.z, du, h, dv, color);
}
function lcol(ctx, fr, u, v, du, dv, y0, y1, type = 'furniture', extra = null) {
  const p = fr.toWorld(u, v);
  return ctx.world.addBox(p.x, p.z, du, dv, fr.y + y0, fr.y + y1, type, extra);
}

function hide(ctx, z, fr, u, v, type, cover, opts = {}) {
  const p = fr ? fr.toWorld(u, v) : { x: u, z: v };
  const spot = {
    x: p.x, z: p.z, y: fr ? fr.y : floorY(z.floor), heading: opts.heading ?? 0, type, cover, zone: z.id,
    floor: z.floor, pose: opts.pose ?? (type === 'locker' || type === 'closet' || type === 'curtain' ? 'stand' : 'crouch'),
    doorBlind: !!opts.doorBlind, occupant: null, name: opts.name ?? HIDE_NAMES[type],
  };
  ctx.hideSpots.push(spot);
  z.hideSpots.push(spot);
  return spot;
}
const HIDE_NAMES = {
  desk: 'под стол', corner: 'в угол у двери', locker: 'в шкафчик', stall: 'в кабинку', closet: 'в шкаф',
  shelf: 'за стеллаж', curtain: 'за занавес', counter: 'за прилавок', mats: 'за маты', bed: 'под кушетку',
};

function poster(ctx, z, fr, wall, t, y, w, h, name) {
  const W = fr.walls[wall];
  const s = fr.along(wall, t);
  vrect(ctx.B.gb(z.id, 'posters'), W.axis, W.c, W.sign, s - w / 2, s + w / 2, fr.y + y - h / 2, fr.y + y + h / 2, ctx.T.posters.rect(name));
}

function plant(parts, x, y, zz, big = false) {
  const k = big ? 1.8 : 1;
  cyl(parts, x, y, zz, 0.13 * k, 0.22 * k, '#b5653a', 10, 0.1 * k);
  ball(parts, x, y + 0.36 * k, zz, 0.2 * k, '#3f8f3a', 1, 1.2, 1);
  ball(parts, x + 0.08 * k, y + 0.5 * k, zz - 0.05 * k, 0.13 * k, '#5aa848');
}

function clock(parts, x, y, zz, axis, sign) {
  const g = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20).rotateX(Math.PI / 2);
  if (axis === 'z') g.rotateY(Math.PI / 2);
  g.translate(x, y, zz);
  parts.push({ geometry: g, color: '#f7f7f2' });
  const rim = new THREE.TorusGeometry(0.17, 0.018, 6, 20);
  if (axis === 'z') rim.rotateY(Math.PI / 2);
  rim.translate(x, y, zz);
  parts.push({ geometry: rim, color: '#2a2a2a' });
  const off = sign * 0.025;
  if (axis === 'x') {
    box(parts, x, y, zz + off, 0.015, 0.12, 0.01, '#111');
    box(parts, x + 0.04, y - 0.004, zz + off, 0.09, 0.012, 0.01, '#111');
  } else {
    box(parts, x + off, y, zz, 0.01, 0.12, 0.015, '#111');
    box(parts, x + off, y - 0.004, zz + 0.04, 0.01, 0.012, 0.09, '#111');
  }
}

// Подоконники и батареи под каждым окном зоны, цветы на некоторых.
function windowSills(ctx, z, fr) {
  const parts = P(ctx, z);
  const W = fr.walls.window;
  const fy = fr.y;
  let i = 0;
  for (const o of ctx.openings) {
    if (o.kind !== 'window' || o.axis !== W.axis || Math.abs(o.c - (z.side === 'S' ? z.z0 : z.z1)) > 1e-3) continue;
    if (o.y0 < fy || o.y0 > fy + 3 || o.b < Math.min(z.x0, z.x1) || o.a > Math.max(z.x0, z.x1)) continue;
    if (o.a < z.x0 - 0.01 || o.b > z.x1 + 0.01) continue;
    const m = (o.a + o.b) / 2, w = o.b - o.a + 0.3;
    const zc = W.c + W.sign * 0.14;
    box(parts, m, o.y0 - 0.04, zc, w, 0.04, 0.3, '#f4f4f0');
    if (o.y0 - fy > 1) { i++; continue; }
    // батарея
    const rz = W.c + W.sign * 0.09;
    for (let k = -0.55; k <= 0.55; k += 0.1) box(parts, m + k, fy + 0.18, rz, 0.06, 0.55, 0.1, '#eceae4');
    box(parts, m, fy + 0.18, rz - W.sign * 0.02, 1.2, 0.04, 0.06, '#d8d6d0');
    if ((i + z.x0) % 2 === 0 && z.type !== 'wc') plant(parts, m + 0.4, o.y0, zc);
    i++;
  }
}

function lightSwitch(ctx, z, fr) {
  const doorX = z.doors?.[0];
  if (doorX === undefined) return;
  const W = fr.walls.corridor;
  // Выключатель — сбоку от двери, со стороны задней стены.
  const side = z.side === 'S' ? -1 : 1;
  const x = doorX + side * (DOOR_W / 2 + 0.3);
  const zc = W.c + W.sign * 0.01;
  box(P(ctx, z), x, fr.y + 1.15, zc, 0.08, 0.12, 0.03, '#f2f2ee');
  ctx.switches.push({ x, y: fr.y + 1.2, z: zc + W.sign * 0.4, zone: z.id, floor: z.floor });
}

// ---------------------------------------------------------------- кабинет

const PORTRAITS = {
  russian: ['pushkin', 'lomonosov'], literature: ['pushkin', 'lomonosov'], history: ['lomonosov', 'map'],
  physics: ['lomonosov', 'math'], math: ['math', 'lomonosov'], it: ['rules', 'math'], chemistry: ['mendeleev', 'fire'],
  english: ['map', 'rules'], geography: ['map', 'map'], biology: ['hands', 'lomonosov'], music: ['pushkin', 'gazette'],
};

function classroom(ctx, z, fr) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  const { L, W } = fr;
  const lab = z.type === 'lab', comp = z.type === 'computer';
  // Доска на передней стене: зелёное полотно, рама, полка для мела.
  {
    const Wl = fr.walls.front, s = fr.along('front', W / 2);
    const bw = 3.6, y0 = fr.y + 0.95, y1 = fr.y + 2.15;
    vrect(ctx.B.gb(z.id, 'board:' + (z.subject ?? 'math')), Wl.axis, Wl.c + Wl.sign * 0.02, Wl.sign, s - bw / 2, s + bw / 2, y0, y1, [0, 0, 1, 1]);
    const fx = Wl.c + Wl.sign * 0.02;
    box(metal, fx, y0 - 0.06, s, 0.06, 0.06, bw + 0.12, '#9aa3ab');
    box(metal, fx, y1, s, 0.06, 0.06, bw + 0.12, '#9aa3ab');
    box(metal, fx, y0 - 0.06, s - bw / 2 - 0.06, 0.06, 1.32, 0.06, '#9aa3ab');
    box(metal, fx, y0 - 0.06, s + bw / 2 + 0.06, 0.06, 1.32, 0.06, '#9aa3ab');
    box(metal, fx + Wl.sign * 0.06, y0 - 0.08, s, 0.12, 0.03, bw, '#8a939b');
    box(parts, fx + Wl.sign * 0.08, y0 - 0.06, s + 0.6, 0.04, 0.03, 0.08, '#f4f4f4');
    const pr = PORTRAITS[z.subject] ?? ['rules', 'math'];
    poster(ctx, z, fr, 'front', W / 2 - 2.4, 2.55, 0.5, 1.0, pr[0]);
    poster(ctx, z, fr, 'front', W / 2 + 2.4, 2.55, 0.5, 1.0, pr[1]);
    ctx.boards.push({ zone: z.id, ...fr.toWorld(L - 0.9, W / 2), heading: fr.dirHeading(-1, 0) });
    z.board = { ...fr.toWorld(L - 0.9, W / 2), heading: fr.dirHeading(-1, 0) };
  }
  // Учительский стол и стул.
  {
    const u = L - 1.75, v = 1.9;
    lbox(parts, fr, u, v, 0.72, 0.75, 1.4, 0.05, '#8a5a32');
    lbox(parts, fr, u, v - 0.66, 0, 0.7, 0.05, 0.72, '#7a4e2a');
    lbox(parts, fr, u, v + 0.66, 0, 0.7, 0.05, 0.72, '#7a4e2a');
    lbox(parts, fr, u + 0.3, v, 0.2, 0.04, 1.3, 0.52, '#7a4e2a');
    lbox(parts, fr, u, v + 0.4, 0.05, 0.62, 0.42, 0.62, '#83552f');
    lbox(parts, fr, u + 0.05, v - 0.3, 0.77, 0.25, 0.32, 0.06, '#e9e4d8');   // журнал
    lbox(parts, fr, u, v + 0.35, 0.77, 0.2, 0.22, 0.02, '#2a2a2a');        // ноутбук
    lcol(ctx, fr, u, v, 0.78, 1.42, 0, 0.78);
    chair(parts, metal, fr, u + 0.62, v, -1, '#5a3a22');
    hide(ctx, z, fr, u, v - 0.1, 'desk', 0.45, { heading: fr.dirHeading(-1, 0), name: 'под учительский стол' });
    z.teacherSpot = { ...fr.toWorld(L - 1.1, W / 2 + 0.6), heading: fr.dirHeading(-1, 0) };
    z.teacherDesk = { ...fr.toWorld(u + 0.62, v), heading: fr.dirHeading(-1, 0) };
  }
  // Парты учеников: 3 ряда (колонки по v) × 3–4 парты, по два места.
  const rows = L >= 9.5 ? 4 : 3;
  const cols = [1.65, W / 2, W - 1.65];
  const deskColor = lab ? '#2d2f33' : comp ? '#d9d4c8' : '#c8a46a';
  for (let r = 0; r < rows; r++) {
    const u = L - 3.4 - r * 1.32;
    for (const v of cols) {
      if (lab) {
        lbox(parts, fr, u, v, 0, 0.6, 1.3, 0.86, '#e8e6e0');
        lbox(parts, fr, u, v, 0.86, 0.66, 1.36, 0.05, deskColor);
        if (r === 0) cyl(parts, fr.toWorld(u + 0.15, v + 0.4).x, fr.y + 0.91, fr.toWorld(u + 0.15, v + 0.4).z, 0.05, 0.18, '#6fc0ff');
      } else {
        lbox(parts, fr, u, v, 0.7, 0.55, 1.25, 0.04, deskColor);
        lbox(parts, fr, u + 0.25, v, 0.35, 0.04, 1.2, 0.35, '#8f7650');
        for (const dv of [-0.58, 0.58]) {
          lbox(metal, fr, u, v + dv, 0, 0.04, 0.04, 0.7, '#6b737a');
          lbox(metal, fr, u, v + dv, 0.05, 0.5, 0.04, 0.03, '#6b737a');
        }
        if (comp) {
          for (const dv of [-0.3, 0.3]) {
            lbox(parts, fr, u + 0.12, v + dv, 0.74, 0.18, 0.22, 0.02, '#222');
            lbox(parts, fr, u + 0.17, v + dv, 0.76, 0.04, 0.05, 0.12, '#333');
            lbox(parts, fr, u + 0.17, v + dv, 0.88, 0.05, 0.5, 0.32, '#1c1c1e');
            const p = fr.toWorld(u + 0.14, v + dv);
            const Wb = fr.walls.front;
            vrect(ctx.B.gb(z.id, 'screen'), Wb.axis, p.x, Wb.sign, p.z - 0.22, p.z + 0.22, fr.y + 0.91, fr.y + 1.17, [0, 0, 1, 1]);
          }
        } else {
          lbox(parts, fr, u - 0.05, v - 0.3, 0.74, 0.21, 0.29, 0.02, ['#d33', '#36c', '#3a3', '#fc3'][(r + Math.round(v)) % 4]);
        }
      }
      lcol(ctx, fr, u, v, lab ? 0.66 : 0.58, lab ? 1.36 : 1.27, 0, lab ? 0.9 : 0.74);
      for (const dv of [-0.3, 0.3]) {
        chair(parts, metal, fr, u - 0.5, v + dv, 1, lab ? '#3a4a5a' : '#2f6f9f', lab);
        const p = fr.toWorld(u - 0.47, v + dv);
        const seat = { x: p.x, z: p.z, y: fr.y, heading: fr.dirHeading(1, 0), zone: z.id, floor: z.floor, taken: null,
          aisle: fr.toWorld(u - 0.47, v + dv + (dv > 0 ? 0.75 : -0.75)), sitH: lab ? 0.62 : 0.46 };
        ctx.seats.push(seat);
        z.seats.push(seat);
      }
      if (r === rows - 1) hide(ctx, z, fr, u, v, 'desk', 0.55, { heading: fr.dirHeading(1, 0), name: 'под парту' });
    }
  }
  // Шкафы у задней стены (кроме угла у двери-коридора — там прячутся).
  if (!lab) {
    for (let v = 0.9; v < W - 2.2; v += 1.2) {
      lbox(parts, fr, 0.25, v + 0.6, 0, 0.45, 1.16, 1.9, comp ? '#cfd3d6' : '#b88a55');
      lbox(parts, fr, 0.49, v + 0.6, 0.95, 0.02, 1.1, 0.02, '#6b4a2a');
      lbox(parts, fr, 0.49, v + 0.35, 0.2, 0.02, 0.05, 0.12, '#444');
      lbox(parts, fr, 0.49, v + 0.85, 0.2, 0.02, 0.05, 0.12, '#444');
    }
    lcol(ctx, fr, 0.25, (0.9 + W - 2.2) / 2 + 0.3, 0.46, W - 2.2 - 0.9 + 0.6, 0, 1.9);
    if (z.subject === 'geography') {
      const p = fr.toWorld(0.25, 2.2);
      cyl(parts, p.x, fr.y + 1.9, p.z, 0.04, 0.25, '#7a5a2a');
      ball(parts, p.x, fr.y + 2.35, p.z, 0.22, '#3f7fd0');
      ball(parts, p.x + 0.05, fr.y + 2.4, p.z + 0.05, 0.13, '#6fae4a', 1.2, 0.8, 1);
    }
    const p = fr.toWorld(0.25, 4.5);
    plant(parts, p.x, fr.y + 1.9, p.z, true);
  } else {
    // Вытяжной шкаф, стеллаж с колбами, раковина.
    lbox(parts, fr, 0.35, 2.0, 0, 0.6, 1.6, 0.9, '#e8e6e0');
    lbox(parts, fr, 0.35, 2.0, 0.9, 0.6, 1.6, 0.05, '#2d2f33');
    lbox(parts, fr, 0.35, 2.0, 2.0, 0.6, 1.6, 0.7, '#d0d4d8');
    lcol(ctx, fr, 0.35, 2.0, 0.62, 1.62, 0, 2.7);
    lbox(parts, fr, 0.2, 5.2, 0, 0.35, 2.4, 2.0, '#b8bcc0');
    for (let k = 0; k < 10; k++) {
      const p = fr.toWorld(0.22, 4.2 + k * 0.22);
      cyl(parts, p.x, fr.y + 1.35 + (k % 3) * 0.02, p.z, 0.05, 0.2, ['#ff6a6a', '#6fc0ff', '#7fe07f', '#ffd36b'][k % 4]);
    }
    lcol(ctx, fr, 0.2, 5.2, 0.36, 2.42, 0, 2.0);
    lbox(parts, fr, L - 1.75, W - 3.3, 0, 0.7, 1.4, 0.9, '#e8e6e0');
    lbox(parts, fr, L - 1.75, W - 3.3, 0.9, 0.74, 1.44, 0.05, '#2d2f33');
    lcol(ctx, fr, L - 1.75, W - 3.3, 0.74, 1.44, 0, 0.95);
    poster(ctx, z, fr, 'back', W - 1.2, 1.7, 0.5, 1.0, 'fire');
    ctx.items.push(itemSpec('extinguisher', fr.toWorld(L - 0.35, W - 0.3), fr.y, z));
  }
  // Часы над дверью, плакаты на задней стене.
  {
    const Wc = fr.walls.back;
    const s = fr.along('back', W / 2);
    clock(parts, Wc.axis === 'z' ? Wc.c + Wc.sign * 0.02 : s, fr.y + 2.75, Wc.axis === 'z' ? s : Wc.c + Wc.sign * 0.02, Wc.axis, Wc.sign);
    poster(ctx, z, fr, 'corridor', 1.6, 1.75, 0.5, 1.0, z.subject === 'chemistry' ? 'mendeleev' : 'rules');
    poster(ctx, z, fr, 'corridor', 3.0, 1.75, 0.5, 1.0, 'evac');
  }
  // Места для пряток: вдоль стены с дверью (из коридора не видно), в дальнем углу.
  hide(ctx, z, fr, L - 2.85, W - 0.38, 'corner', 0.6, { doorBlind: true, heading: fr.dirHeading(0, -1), name: 'к стене у двери' });
  hide(ctx, z, fr, 0.5, W - 0.4, 'corner', 0.65, { doorBlind: true, heading: fr.dirHeading(1, -1), name: 'в дальний угол' });
  if (z.subject === 'music') {
    lbox(parts, fr, 0.6, W - 2.6, 0, 0.6, 1.5, 1.1, '#141414');
    lbox(parts, fr, 0.95, W - 2.6, 0.72, 0.12, 1.4, 0.05, '#f2f2f2');
    lcol(ctx, fr, 0.6, W - 2.6, 0.62, 1.52, 0, 1.1);
  }
  z.wanderHint = fr.toWorld(L / 2, W / 2);
}

function chair(parts, metal, fr, u, v, dir, color, tall = false) {
  const h = tall ? 0.62 : 0.44;
  lbox(parts, fr, u, v, h, 0.38, 0.38, 0.03, color);
  lbox(parts, fr, u - dir * 0.18, v, h + 0.05, 0.03, 0.36, 0.36, color);
  for (const du of [-0.16, 0.16]) for (const dv of [-0.16, 0.16]) lbox(metal, fr, u + du, v + dv, 0, 0.025, 0.025, h, '#5d656c');
}

// ---------------------------------------------------------------- прочие комнаты

function library(ctx, z, fr) {
  const parts = P(ctx, z);
  const { L, W } = fr;
  const bookColors = ['#7a2430', '#1d4fa0', '#2a6a2a', '#c99a2a', '#5a2a7a', '#333333', '#b04a20', '#2a7a7a', '#d8d0c0'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shelf = (u, v, du, dv, alongU, oneSide = false) => {
    lbox(parts, fr, u, v, 0, du, dv, 2.1, '#6d4a2c');
    const len = alongU ? du : dv;
    for (let k = 0; k < 5; k++) {
      const y = 0.08 + k * 0.42;
      let t = -len / 2 + 0.05;
      while (t < len / 2 - 0.08) {
        const bw = 0.05 + rnd() * 0.05, bh = 0.24 + rnd() * 0.1;
        const c = bookColors[Math.floor(rnd() * bookColors.length)];
        for (const side of oneSide ? [1] : [-1, 1]) {
          if (alongU) lbox(parts, fr, u + t, v + side * (dv / 2 + 0.005), y, bw, 0.02, bh, c);
          else lbox(parts, fr, u + side * (du / 2 + 0.005), v + t, y, 0.02, bw, bh, c);
        }
        t += bw + 0.004;
      }
    }
    lcol(ctx, fr, u, v, du, dv, 0, 2.1);
  };
  // Стеллажи в три ряда поперёк зала и вдоль задней стены.
  for (let i = 0; i < 3; i++) shelf(2.2 + i * 1.9, 2.6, 0.45, 3.6, false);
  shelf(0.3, W / 2 + 0.6, 0.4, W - 3.6, false, true);
  for (let i = 0; i < 3; i++) hide(ctx, z, fr, 2.2 + i * 1.9 + 0.55, 1.0, 'shelf', 0.45, { heading: fr.dirHeading(0, 1) });
  // Столы для чтения.
  for (const u of [7.6, 9.4]) {
    lbox(parts, fr, u, 2.6, 0.72, 1.0, 2.2, 0.05, '#b88a55');
    lbox(parts, fr, u, 2.6, 0, 0.9, 0.06, 0.72, '#8a6a40');
    lcol(ctx, fr, u, 2.6, 1.0, 2.2, 0, 0.76);
    for (const dv of [-0.6, 0.6]) for (const du of [-0.7, 0.7]) chairSimple(parts, fr, u + du, 2.6 + dv, '#7a2430');
    lbox(parts, fr, u, 2.2, 0.77, 0.2, 0.28, 0.04, '#1d4fa0');
  }
  // Стол библиотекаря у двери, глобус, ковровая дорожка.
  lbox(parts, fr, L - 2.6, W - 2.2, 0, 1.6, 0.7, 0.95, '#8a5a32');
  lcol(ctx, fr, L - 2.6, W - 2.2, 1.6, 0.7, 0, 0.95);
  hide(ctx, z, fr, L - 2.6, W - 2.65, 'desk', 0.4, { name: 'за стойку библиотекаря' });
  const g = fr.toWorld(L - 0.8, 1.0);
  cyl(parts, g.x, fr.y, g.z, 0.25, 0.8, '#6d4a2c', 10, 0.18);
  ball(parts, g.x, fr.y + 1.05, g.z, 0.28, '#3f7fd0');
  poster(ctx, z, fr, 'corridor', 4, 1.7, 0.5, 1.0, 'library');
  poster(ctx, z, fr, 'front', 2.2, 1.7, 0.5, 1.0, 'pushkin');
  ctx.wander.push({ ...fr.toWorld(7.0, 4.8), zone: z.id, floor: z.floor, kind: 'read' });
}

function chairSimple(parts, fr, u, v, color) {
  lbox(parts, fr, u, v, 0.44, 0.38, 0.38, 0.04, color);
  lbox(parts, fr, u, v, 0, 0.05, 0.05, 0.44, '#4a3a2a');
}

function cafeteria(ctx, z, fr) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  // Кухня в юго-западном углу: плиты, духовки, раковина, холодильник; раздача по x = −26.
  const y = fr.y;
  box(metal, -26.0, y, -6.8, 0.7, 0.95, 4.4, '#c7ccd0');           // прилавок раздачи
  box(metal, -26.0, y + 0.95, -6.8, 0.8, 0.04, 4.5, '#e0e4e8');
  box(metal, -25.7, y + 1.05, -6.8, 0.04, 0.35, 4.3, '#bcd8e6');    // стекло
  ctx.world.addBox(-26.0, -6.8, 0.75, 4.4, y, y + 1.0, 'furniture');
  for (let k = 0; k < 5; k++) box(parts, -26.0, y + 0.99, -8.6 + k * 0.9, 0.35, 0.03, 0.45, ['#e8d8b0', '#d88a5a', '#f2f2ee', '#a8c870', '#e8b84a'][k]);
  hide(ctx, z, null, -26.7, -6.4, 'counter', 0.5, { name: 'за прилавок' });
  // Плиты вдоль южной стены.
  for (let k = 0; k < 3; k++) {
    const x = -29.3 + k * 1.0;
    box(metal, x, y, -9.55, 0.9, 0.9, 0.75, '#d8dcdf');
    box(metal, x, y + 0.9, -9.55, 0.9, 0.03, 0.75, '#2a2a2a');
    for (const dx of [-0.2, 0.2]) cyl(metal, x + dx, y + 0.93, -9.55, 0.12, 0.02, '#111');
  }
  cyl(metal, -28.3, y + 0.93, -9.5, 0.22, 0.32, '#b8bcc0');          // кастрюля
  ctx.world.addBox(-28.3, -9.55, 3.0, 0.78, y, y + 0.95, 'furniture');
  box(metal, -29.6, y, -2.9, 0.7, 2.0, 1.2, '#e4e8ea');               // холодильник
  ctx.world.addBox(-29.6, -2.9, 0.72, 1.22, y, y + 2.0, 'furniture');
  box(metal, -29.6, y, -6.0, 0.6, 0.9, 1.1, '#c7ccd0');               // мойка
  ctx.world.addBox(-29.6, -6.0, 0.62, 1.12, y, y + 0.92, 'furniture');
  ctx.items.push(itemSpec('extinguisher', { x: -29.7, z: -4.5 }, y, z));
  z.fireSpots = [{ x: -28.3, z: -9.0 }];
  // Обеденные столы с лавками.
  for (const tx of [-23.6, -20.0]) {
    for (const tz of [-8.4, -6.0, -3.6]) {
      box(parts, tx, y + 0.74, tz, 2.6, 0.04, 0.9, '#e8e2d2');
      box(metal, tx - 1.1, y, tz, 0.06, 0.74, 0.7, '#6b737a');
      box(metal, tx + 1.1, y, tz, 0.06, 0.74, 0.7, '#6b737a');
      ctx.world.addBox(tx, tz, 2.6, 0.9, y, y + 0.78, 'furniture');
      for (const dz of [-0.75, 0.75]) {
        box(parts, tx, y + 0.42, tz + dz, 2.4, 0.04, 0.32, '#c4553d');
        box(metal, tx, y, tz + dz, 0.06, 0.42, 0.06, '#6b737a');
      }
      for (let k = 0; k < 3; k++) box(parts, tx - 0.8 + k * 0.8, y + 0.78, tz - 0.2, 0.32, 0.02, 0.24, '#f0f0ea');
      ctx.wander.push({ x: tx, z: tz + 0.8, zone: z.id, floor: 0, kind: 'eat' });
    }
    hide(ctx, z, null, tx, -6.0, 'desk', 0.6, { name: 'под стол' });
  }
  poster(ctx, z, fr, 'corridor', 9.0, 1.7, 0.6, 1.2, 'menu');
  poster(ctx, z, fr, 'corridor', 10.5, 1.7, 0.5, 1.0, 'hands');
}

function nurse(ctx, z, fr) {
  const parts = P(ctx, z);
  const { L, W } = fr;
  lbox(parts, fr, 1.0, 1.4, 0.45, 1.9, 0.8, 0.12, '#f4f4f4');
  lbox(parts, fr, 1.0, 1.4, 0, 1.8, 0.7, 0.45, '#9aa3ab');
  lbox(parts, fr, 0.25, 1.4, 0.57, 0.3, 0.6, 0.1, '#ffffff');
  lcol(ctx, fr, 1.0, 1.4, 1.9, 0.8, 0, 0.6);
  hide(ctx, z, fr, 1.0, 1.4, 'bed', 0.5, { name: 'под кушетку' });
  for (let k = 0; k < 3; k++) lbox(parts, fr, 2.4, 0.9 + k * 0.6, 0, 0.04, 0.55, 1.8, '#d8eef0');   // ширма
  lbox(parts, fr, L - 0.3, 1.6, 0, 0.45, 1.2, 1.9, '#f4f4f4');
  lbox(parts, fr, L - 0.07, 1.6, 1.3, 0.02, 0.4, 0.12, '#d62c2c');
  lbox(parts, fr, L - 0.07, 1.6, 1.16, 0.02, 0.12, 0.4, '#d62c2c');
  lcol(ctx, fr, L - 0.3, 1.6, 0.46, 1.22, 0, 1.9);
  lbox(parts, fr, 2.8, W - 2.5, 0.72, 0.7, 1.2, 0.05, '#e8e6e0');
  lbox(parts, fr, 2.8, W - 2.5, 0, 0.6, 1.1, 0.72, '#cfd3d6');
  lcol(ctx, fr, 2.8, W - 2.5, 0.72, 1.22, 0, 0.77);
  hide(ctx, z, fr, 1.6, W - 0.5, 'corner', 0.55, { doorBlind: true });
  poster(ctx, z, fr, 'back', 4, 1.7, 0.5, 1.0, 'hands');
}

function principal(ctx, z, fr) {
  const parts = P(ctx, z);
  const { L, W } = fr;
  lbox(parts, fr, L - 2.2, 2.6, 0.74, 0.9, 2.0, 0.06, '#5a3a22');
  lbox(parts, fr, L - 2.2, 2.6, 0, 0.85, 1.9, 0.74, '#4a2e1a');
  lcol(ctx, fr, L - 2.2, 2.6, 0.9, 2.0, 0, 0.8);
  hide(ctx, z, fr, L - 2.2, 2.6, 'desk', 0.4, { name: 'под стол директора' });
  lbox(parts, fr, L - 1.3, 2.6, 0, 0.6, 0.6, 1.25, '#1a1a1a');                 // кресло
  chairSimple(parts, fr, L - 3.3, 2.0, '#7a2430');
  chairSimple(parts, fr, L - 3.3, 3.2, '#7a2430');
  lbox(parts, fr, L - 2.2, 2.0, 0.8, 0.3, 0.4, 0.02, '#e9e4d8');
  // Флаг.
  const f = fr.toWorld(L - 0.4, 0.6);
  cyl(parts, f.x, fr.y, f.z, 0.025, 2.4, '#c9a85a');
  for (const [k, c] of [[0, '#ffffff'], [1, '#1d4fa0'], [2, '#d62c2c']]) box(parts, f.x, fr.y + 2.2 - k * 0.22, f.z + (z.side === 'S' ? 0.5 : -0.5), 0.02, 0.22, 0.95, c);
  // Шкаф-купе (прятки) и книжный шкаф.
  lbox(parts, fr, 0.35, W - 2.0, 0, 0.6, 1.6, 2.2, '#6d4a2c');
  lbox(parts, fr, 0.66, W - 2.0, 1.0, 0.02, 0.04, 0.2, '#c9a85a');
  lcol(ctx, fr, 0.35, W - 2.0, 0.6, 1.6, 0, 2.2);
  hide(ctx, z, fr, 0.9, W - 2.0, 'closet', 0.18, { pose: 'stand', name: 'в шкаф' });
  lbox(parts, fr, 0.25, 2.2, 0, 0.45, 2.4, 2.1, '#6d4a2c');
  for (let k = 0; k < 4; k++) lbox(parts, fr, 0.5, 2.2, 0.3 + k * 0.45, 0.02, 2.2, 0.3, ['#7a2430', '#1d4fa0', '#2a6a2a', '#c99a2a'][k]);
  lcol(ctx, fr, 0.25, 2.2, 0.46, 2.4, 0, 2.1);
  poster(ctx, z, fr, 'front', 4.5, 2.0, 0.6, 0.6, 'achievements');
  poster(ctx, z, fr, 'back', 5.2, 1.8, 0.5, 1.0, 'lomonosov');
}

function lobby(ctx, z, fr) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  const y = fr.y;
  // Пост охраны слева от входа: стойка, монитор, кресло, рация.
  box(parts, -4.4, y, -6.9, 1.6, 1.05, 0.6, '#3d4a55');
  box(parts, -4.4, y + 1.05, -6.9, 1.7, 0.05, 0.7, '#c9c4b8');
  box(parts, -4.6, y + 1.1, -6.75, 0.5, 0.32, 0.04, '#111');
  ctx.world.addBox(-4.4, -6.9, 1.7, 0.7, y, y + 1.1, 'furniture');
  z.guardSpot = { x: -4.4, z: -6.1, heading: Math.PI };
  hide(ctx, z, null, -4.4, -7.5, 'desk', 0.45, { name: 'за пост охраны' });
  // Турникеты (декоративные стойки по краям прохода).
  for (const x of [-2.6, 2.6]) {
    box(metal, x, y, -5.2, 0.25, 1.0, 0.9, '#b8bcc0');
    ctx.world.addBox(x, -5.2, 0.25, 0.9, y, y + 1.0, 'furniture');
  }
  // Гардероб: вешалки с куртками.
  let k = 0;
  for (const gz of [-8.6, -7.0]) {
    box(metal, 4.3, y + 1.6, gz, 2.6, 0.04, 0.04, '#9aa3ab');
    for (const gx of [3.1, 5.5]) box(metal, gx, y, gz, 0.05, 1.65, 0.05, '#9aa3ab');
    for (let i = 0; i < 9; i++) {
      const c = ['#2b3a55', '#7a2430', '#3a3a3a', '#2a6a2a', '#c99a2a', '#1d4fa0', '#5a2a7a', '#d8d0c0', '#b04a20'][(k++ * 7) % 9];
      box(parts, 3.2 + i * 0.27, y + 0.75, gz, 0.22, 0.85, 0.32, c);
    }
    ctx.world.addBox(4.3, gz, 2.7, 0.45, y, y + 1.7, 'furniture');
  }
  hide(ctx, z, null, 4.3, -7.8, 'closet', 0.35, { pose: 'crouch', name: 'между куртками' });
  // Витрина с кубками и стенд.
  box(parts, -5.6, y, -3.6, 0.6, 0.9, 2.0, '#6d4a2c');
  box(parts, -5.6, y + 0.9, -3.6, 0.55, 1.1, 1.9, '#cfe6f2');
  for (let i = 0; i < 4; i++) cyl(metal, -5.6, y + 0.95 + (i % 2) * 0.5, -4.2 + i * 0.4, 0.07, 0.3, i % 3 ? '#d9b13b' : '#c0c0c8');
  ctx.world.addBox(-5.6, -3.6, 0.62, 2.0, y, y + 2.0, 'furniture');
  // Вывески и плакаты.
  const gb = ctx.B.gb(z.id, 'signs');
  vrect(gb, 'x', -1.612, -1, -3.0, 3.0, y + 2.9, y + 3.2, ctx.T.signs.rect('welcome'));
  vrect(ctx.B.gb(z.id, 'glow'), 'x', -9.98, 1, -0.6, 0.6, y + 2.68, y + 2.92, ctx.T.signs.rect('exit'));
  poster(ctx, z, fr, 'back', 3.0, 1.7, 0.5, 1.0, 'evac');
  poster(ctx, z, fr, 'front', 4.5, 1.7, 0.5, 1.0, 'timetable');
  for (const x of [-2.2, 2.2]) plant(parts, x, y, -9.4, true);
  ctx.wander.push({ x: 0, z: -4.0, zone: z.id, floor: 0, kind: 'idle' }, { x: 1.5, z: -7.5, zone: z.id, floor: 0, kind: 'talk' });
}

function hall(ctx, z, fr) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  const y = fr.y;
  // Теннисный стол.
  box(parts, 0, y + 0.72, 6.2, 2.74, 0.04, 1.52, '#1d6a4a');
  box(parts, 0, y + 0.76, 6.2, 0.02, 0.15, 1.6, '#f4f4f4');
  box(parts, 0, y + 0.761, 6.2, 2.74, 0.003, 0.02, '#ffffff');
  for (const dx of [-1.1, 1.1]) box(metal, dx, y, 6.2, 0.06, 0.72, 1.2, '#3a3a3a');
  ctx.world.addBox(0, 6.2, 2.76, 1.54, y, y + 0.8, 'furniture');
  // Скамейки, пальмы, кулер, стенды.
  for (const x of [-4.5, 4.5]) {
    box(parts, x, y + 0.42, 9.5, 2.2, 0.06, 0.45, '#b88a55');
    for (const dx of [-0.9, 0.9]) box(metal, x + dx, y, 9.5, 0.06, 0.42, 0.4, '#3a3a3a');
    ctx.world.addBox(x, 9.5, 2.2, 0.45, y, y + 0.45, 'furniture');
    plant(parts, x + (x > 0 ? 1.4 : -1.4), y, 9.5, true);
    ctx.wander.push({ x, z: 8.9, zone: z.id, floor: 0, kind: 'talk' });
  }
  box(parts, 5.6, y, 3.0, 0.35, 1.0, 0.35, '#e8eef2');
  cyl(parts, 5.6, y + 1.0, 3.0, 0.14, 0.4, '#8fc8ff');
  ctx.world.addBox(5.6, 3.0, 0.36, 0.36, y, y + 1.4, 'furniture');
  poster(ctx, z, fr, 'window', 6.0, 1.6, 0.5, 1.0, 'gazette');
  poster(ctx, z, fr, 'window', 3.3, 1.6, 0.5, 1.0, 'achievements');
  poster(ctx, z, fr, 'window', 8.7, 1.6, 0.5, 1.0, 'sport');
  ctx.wander.push({ x: -2.5, z: 4.5, zone: z.id, floor: 0, kind: 'talk' }, { x: 2.8, z: 4.2, zone: z.id, floor: 0, kind: 'talk' },
    { x: 0, z: 4.6, zone: z.id, floor: 0, kind: 'idle' });
}

function assembly(ctx, z, fr) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  const y = fr.y;
  // Сцена у западной стены, высотой 0.45 м — на неё можно зайти.
  box(parts, -4.85, y, -5.75, 2.3, 0.45, 8.3, '#5e3f28');
  box(parts, -4.85, y + 0.45, -5.75, 2.3, 0.01, 8.3, '#8a5a32');
  ctx.world.addPlatform(-6, -3.7, -9.9, -1.6, y + 0.45);
  // Занавес (бархат) с просветом посередине.
  for (const [z0, z1] of [[-9.8, -6.6], [-4.9, -1.7]]) {
    box(parts, -3.95, y + 0.45, (z0 + z1) / 2, 0.12, 2.85, z1 - z0, '#8a1420');
    ctx.world.addBox(-3.95, (z0 + z1) / 2, 0.14, z1 - z0, y, y + 3.3, 'curtain');
  }
  box(parts, -3.95, y + 2.9, -5.75, 0.14, 0.4, 8.2, '#a01828');
  hide(ctx, z, null, -4.6, -8.6, 'curtain', 0.25, { pose: 'stand', name: 'за занавес' });
  hide(ctx, z, null, -4.6, -2.8, 'curtain', 0.25, { pose: 'stand', name: 'за занавес' });
  // Пианино, трибуна, флаг.
  box(parts, -5.5, y + 0.45, -8.9, 0.6, 1.2, 1.5, '#141414');
  ctx.world.addBox(-5.5, -8.9, 0.62, 1.52, y + 0.45, y + 1.7, 'furniture');
  box(parts, -4.4, y + 0.45, -4.8, 0.5, 1.1, 0.6, '#6d4a2c');
  // Ряды стульев.
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 9; c++) {
      if (c === 4) continue;
      const x = -1.8 + r * 1.2, zz = -9.2 + c * 0.9;
      box(parts, x, y + 0.44, zz, 0.45, 0.06, 0.45, '#8a1420');
      box(parts, x + 0.22, y + 0.44, zz, 0.06, 0.5, 0.45, '#8a1420');
      box(metal, x, y, zz, 0.4, 0.44, 0.04, '#3a3a3a');
    }
    ctx.world.addBox(-1.8 + r * 1.2, -7.85, 0.5, 3.1, y, y + 0.9, 'furniture');
    ctx.world.addBox(-1.8 + r * 1.2, -3.35, 0.5, 3.1, y, y + 0.9, 'furniture');
  }
  hide(ctx, z, null, 4.6, -9.4, 'corner', 0.55, { doorBlind: true });
  poster(ctx, z, fr, 'corridor', 1.5, 1.8, 0.5, 1.0, 'pushkin');
}

function teachers(ctx, z, fr) {
  const parts = P(ctx, z);
  const y = fr.y;
  box(parts, 0, y + 0.74, 5.6, 4.4, 0.05, 1.2, '#8a5a32');
  for (const x of [-2, 2]) box(parts, x, y, 5.6, 0.08, 0.74, 1.0, '#6d4a2c');
  ctx.world.addBox(0, 5.6, 4.4, 1.2, y, y + 0.78, 'furniture');
  hide(ctx, z, null, 0, 5.6, 'desk', 0.5, { name: 'под стол' });
  for (let i = 0; i < 4; i++) for (const dz of [-0.9, 0.9]) {
    const fr2 = { toWorld: (u, v) => ({ x: u, z: v }), y };
    chairSimple(parts, fr2, -1.6 + i * 1.07, 5.6 + dz, '#3a4a6a');
  }
  box(parts, -4.2, y, 8.8, 1.0, 2.1, 1.6, '#6d4a2c');
  ctx.world.addBox(-4.2, 8.8, 1.0, 1.6, y, y + 2.1, 'furniture');
  hide(ctx, z, null, -4.2, 8.8, 'closet', 0.15, { pose: 'stand', name: 'в шкаф' });
  box(parts, 3.6, y, 9.3, 2.0, 0.45, 0.8, '#5a3a62');
  box(parts, 3.6, y, 9.65, 2.0, 0.9, 0.2, '#5a3a62');
  ctx.world.addBox(3.6, 9.3, 2.0, 0.8, y, y + 0.9, 'furniture');
  box(parts, 4.5, y + 0.9, 3.0, 0.4, 0.4, 0.35, '#2a2a2a');
  box(parts, 4.5, y, 3.0, 0.6, 0.9, 0.5, '#cfd3d6');
  ctx.world.addBox(4.5, 3.0, 0.6, 0.5, y, y + 1.3, 'furniture');
  poster(ctx, z, fr, 'corridor', 5.5, 1.7, 0.5, 1.0, 'timetable');
  poster(ctx, z, fr, 'corridor', 7.0, 1.7, 0.5, 1.0, 'rules');
  ctx.wander.push({ x: 0, z: 4.4, zone: z.id, floor: 1, kind: 'talk' });
}

function storage(ctx, z, fr) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  const { L, W } = fr;
  for (const v of [1.0, 3.2]) {
    lbox(metal, fr, 0.35, v, 0, 0.5, 1.8, 2.0, '#8a939b');
    for (let k = 0; k < 4; k++) lbox(parts, fr, 0.35, v, 0.3 + k * 0.48, 0.4, 1.6, 0.25, ['#c8a46a', '#b8bcc0', '#d8d0c0', '#c4553d'][k]);
    lcol(ctx, fr, 0.35, v, 0.52, 1.82, 0, 2.0);
  }
  hide(ctx, z, fr, 0.45, 5.2, 'closet', 0.15, { pose: 'crouch', name: 'за стеллаж' });
  lbox(parts, fr, L - 0.9, 1.0, 0, 0.5, 0.5, 0.4, '#2d7fd6');                    // ведро
  ctx.items.push(itemSpec('mop', fr.toWorld(L - 0.7, 1.6), fr.y, z));
  lbox(parts, fr, L - 0.6, W - 2.4, 0, 0.6, 0.9, 0.9, '#c7ccd0');               // тележка
}

function wc(ctx, z, fr) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  const { L, W } = fr;
  // Кабинки у окна: три по ширине комнаты.
  const n = 3, sw = (L - 0.1) / n;
  for (let i = 0; i < n; i++) {
    const u0 = 0.05 + i * sw;
    const fw = sw - 0.68;                                                                       // перед кабинки без проёма
    if (i > 0) lbox(parts, fr, u0, 0.75, 0.15, 0.04, 1.5, 1.9, '#9cb4c2');
    lbox(parts, fr, u0 + fw / 2, 1.52, 0.15, fw, 0.04, 1.9, '#9cb4c2');
    lbox(parts, fr, u0 + sw - 0.06, 1.24, 0.15, 0.04, 0.56, 1.9, '#87a2b2');                  // открытая дверца
    lbox(parts, fr, u0 + sw / 2, 0.35, 0, 0.38, 0.5, 0.42, '#f4f4f4');
    lbox(parts, fr, u0 + sw / 2, 0.1, 0.42, 0.42, 0.2, 0.4, '#f4f4f4');
    if (i > 0) lcol(ctx, fr, u0, 0.75, 0.05, 1.5, 0, 2.05);
    lcol(ctx, fr, u0 + fw / 2, 1.52, fw, 0.06, 0, 2.05);
    hide(ctx, z, fr, u0 + sw / 2, 0.75, 'stall', 0.2, { pose: 'crouch', heading: fr.dirHeading(0, 1), name: 'в кабинку' });
  }
  // Раковины и зеркала у боковой стены.
  for (let k = 0; k < 2; k++) {
    const v = W - 2.6 + k * 1.0;
    lbox(parts, fr, L - 0.3, v, 0.8, 0.45, 0.55, 0.15, '#f4f4f4');
    lbox(metal, fr, L - 0.15, v, 0.95, 0.15, 0.04, 0.2, '#b8bcc0');
    lbox(metal, fr, L - 0.06, v, 1.25, 0.02, 0.6, 0.7, '#d8eef8');
  }
  lcol(ctx, fr, L - 0.3, W - 2.1, 0.46, 1.6, 0, 0.95);
  hide(ctx, z, fr, 0.4, W - 0.45, 'corner', 0.55, { doorBlind: true });
  poster(ctx, z, fr, 'back', W - 2.2, 1.7, 0.5, 1.0, 'hands');
  ctx.wander.push({ ...fr.toWorld(L - 1.0, W - 2.2), zone: z.id, floor: z.floor, kind: 'wc' });
}

function stairsDecor(ctx, z) {
  const y = floorY(z.floor);
  const x = (z.x0 + z.x1) / 2;
  // Табличка «ВЫХОД» над лестницей на 2 этаже (путь эвакуации вниз).
  if (z.floor === 1) vrect(ctx.B.gb(z.id, 'glow'), 'x', 1.5 - 0.115, -1, x - 0.6, x + 0.6, y + 2.9, y + 3.14, ctx.T.signs.rect('exit'));
}

// ---------------------------------------------------------------- спортзал

function gym(ctx, z) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  // Разметка баскетбольной площадки.
  const line = (x0, z0, x1, z1, c = '#f4f4f4') => box(parts, (x0 + x1) / 2, 0.002, (z0 + z1) / 2, Math.max(0.05, x1 - x0), 0.004, Math.max(0.05, z1 - z0), c);
  line(31.5, -9, 44.5, -9); line(31.5, 9, 44.5, 9); line(31.5, -9, 31.55, 9); line(44.45, -9, 44.5, 9);
  line(31.5, 0, 44.5, 0);
  {
    const g = new THREE.RingGeometry(1.75, 1.8, 40).rotateX(-Math.PI / 2).translate(38, 0.004, 0);
    parts.push({ geometry: g, color: '#f4f4f4' });
    for (const zz of [-9, 9]) {
      const r = new THREE.RingGeometry(5.7, 5.76, 40, 1, zz < 0 ? Math.PI : 0, Math.PI).rotateX(-Math.PI / 2).translate(38, 0.004, zz);
      parts.push({ geometry: r, color: '#f2c94c' });
      box(parts, 38, 0.001, zz + (zz < 0 ? 2.9 : -2.9), 3.6, 0.003, 5.8, '#c0573a');
    }
  }
  // Кольца на северной и южной стенах.
  for (const zz of [-9.8, 9.8]) {
    const s = Math.sign(zz);
    box(metal, 38, 2.9, zz - s * 0.2, 0.12, 1.5, 0.12, '#3a3a3a');
    box(parts, 38, 2.9, zz - s * 1.05, 1.8, 1.05, 0.05, '#f4f4f4');
    box(parts, 38, 3.05, zz - s * 1.08, 0.6, 0.45, 0.02, '#d62c2c');
    box(metal, 38, 3.48, zz - s * 0.6, 0.08, 0.08, 0.9, '#3a3a3a');
    const ring = new THREE.TorusGeometry(0.23, 0.02, 6, 20).rotateX(Math.PI / 2).translate(38, 3.05, zz - s * 1.35);
    metal.push({ geometry: ring, color: '#e0662a' });
  }
  // Шведские стенки у западной стены (кроме двери).
  for (const [z0, z1] of [[-9, -2], [2, 9]]) {
    for (let k = 0; k < 9; k++) box(parts, 30.25, 0.15 + k * 0.3, (z0 + z1) / 2, 0.06, 0.04, z1 - z0, '#c9a06a');
    for (let zz = z0; zz <= z1; zz += 0.9) box(parts, 30.25, 0, zz, 0.1, 2.8, 0.08, '#a8804a');
  }
  // Лавки вдоль восточной стены, маты, канат.
  for (const zz of [-6, 2.6]) {
    box(parts, 49.2, 0.4, zz, 0.35, 0.06, 4, '#c9a06a');
    box(metal, 49.2, 0, zz - 1.6, 0.3, 0.4, 0.06, '#3a3a3a');
    box(metal, 49.2, 0, zz + 1.6, 0.3, 0.4, 0.06, '#3a3a3a');
    ctx.world.addBox(49.2, zz, 0.36, 4, 0, 0.46, 'furniture');
    ctx.wander.push({ x: 48.6, z: zz, zone: 'gym', floor: 0, kind: 'talk' });
  }
  for (let k = 0; k < 4; k++) box(parts, 33.5, k * 0.1, -9.0, 2.0, 0.1, 1.0, k % 2 ? '#2d7fd6' : '#2367b3');
  box(parts, 33.5, 0, -7.6, 2.0, 1.2, 0.3, '#2d7fd6');     // маты стоймя
  ctx.world.addBox(33.5, -8.6, 2.0, 1.5, 0, 1.2, 'furniture');
  hide(ctx, z, null, 33.5, -9.5, 'mats', 0.35, { name: 'за маты' });
  cyl(parts, 36, 0.6, 3.5, 0.03, 6.4, '#c9b07a', 6);
  // Табло и прожекторы.
  box(parts, 40, 4.8, 9.85, 2.6, 1.0, 0.1, '#1a1a1a');
  box(parts, 39.3, 5.1, 9.79, 0.6, 0.4, 0.02, '#ff4a2a');
  box(parts, 40.7, 5.1, 9.79, 0.6, 0.4, 0.02, '#ff4a2a');
  // Мячи на полу.
  for (const [x, zz] of [[37, 2], [43, -3], [41, 6.5]]) ball(parts, x, 0.12, zz, 0.12, '#e0662a');
  ctx.wander.push({ x: 38, z: -2, zone: 'gym', floor: 0, kind: 'play' }, { x: 42, z: 3, zone: 'gym', floor: 0, kind: 'play' },
    { x: 40, z: 6, zone: 'gym', floor: 0, kind: 'play' }, { x: 36, z: 5, zone: 'gym', floor: 0, kind: 'play' });
  // Плакат и «ВЫХОД» над наружной дверью.
  vrect(ctx.B.gb('gym', 'glow'), 'z', 49.98, -1, -0.6, 0.6, 2.62, 2.86, ctx.T.signs.rect('exit'));
  vrect(ctx.B.gb('gym', 'posters'), 'z', 30.12, 1, 4.6, 5.4, 3.2, 4.8, ctx.T.posters.rect('sport'));
  // Выключатель у двери из коридора.
  box(parts, 30.11, 1.15, -1.3, 0.03, 0.12, 0.08, '#f2f2ee');
  ctx.switches.push({ x: 30.5, y: 1.2, z: -1.3, zone: 'gym', floor: 0 });
}

function gymstore(ctx, z) {
  const parts = P(ctx, z), metal = P(ctx, z, 'metal');
  box(metal, 49.6, 0, 7.5, 0.6, 2.0, 4.6, '#8a939b');
  for (let k = 0; k < 8; k++) ball(parts, 49.6, 0.35 + (k % 3) * 0.6, 5.8 + k * 0.42, 0.12, ['#e0662a', '#f4f4f4', '#2d7fd6', '#2a9a4a'][k % 4]);
  ctx.world.addBox(49.6, 7.5, 0.62, 4.6, 0, 2.0, 'furniture');
  for (let k = 0; k < 4; k++) box(parts, 46.3, k * 0.12, 9.3, 1.8, 0.12, 0.9, k % 2 ? '#2d7fd6' : '#2367b3');
  ctx.world.addBox(46.3, 9.3, 1.8, 0.9, 0, 0.5, 'furniture');
  for (let k = 0; k < 5; k++) box(parts, 45.4 + k * 0.12, 0, 6.0, 0.04, 1.1, 0.04, '#c9a06a');   // клюшки
  hide(ctx, z, null, 48.2, 9.4, 'closet', 0.15, { pose: 'crouch', name: 'в угол инвентарной' });
  hide(ctx, z, null, 45.6, 7.6, 'closet', 0.2, { pose: 'crouch', name: 'за стеллаж' });
  ctx.items.push(itemSpec('bat', { x: 46.6, z: 6.2 }, 0, z));
  ctx.items.push(itemSpec('bat', { x: 47.6, z: 6.0 }, 0, z));
}

// ---------------------------------------------------------------- коридоры

export function itemSpec(type, p, y, z) {
  return { type, x: p.x, z: p.z, y, zone: z.id, floor: z.floor ?? 0, taken: false, holder: null };
}

export function furnishCorridors(ctx) {
  const lockerColors = ['#2d6fb3', '#e0a02a', '#2a8a5a', '#b33a3a'];
  for (const floor of [0, 1]) {
    const y = floorY(floor);
    for (const side of [-1, 1]) {
      const wallC = side < 0 ? CORR.z0 : CORR.z1;
      const face = wallC - side * 0.1;          // плоскость стены со стороны коридора
      // Занятые участки стены: двери, арки + запас.
      const busy = ctx.openings.filter((o) => o.axis === 'x' && Math.abs(o.c - wallC) < 1e-3 && o.y0 < y + 1 && o.y1 > y + 0.5)
        .map((o) => [o.a - 1.05, o.b + 1.05]);
      for (const [cx, cs] of CABINETS[floor]) if (cs === side) busy.push([cx - 0.6, cx + 1.25]);
      busy.sort((a, b) => a[0] - b[0]);
      const free = [];
      let s = BLD.x0 + 0.5;
      for (const [a, b] of busy) { if (a - s > 0.6) free.push([s, a]); s = Math.max(s, b); }
      if (BLD.x1 - 0.5 - s > 0.6) free.push([s, BLD.x1 - 0.5]);
      free.forEach(([a, b], i) => {
        const len = b - a;
        const zoneId = corridorZone(floor, (a + b) / 2);
        const z = ctx.zoneById.get(zoneId);
        const parts = ctx.B.parts(zoneId), metal = ctx.B.parts(zoneId, 'metal');
        const pick = (i + floor + (side > 0 ? 1 : 0)) % 3;
        if (len >= 2.6 && pick !== 2) {
          // Шкафчики.
          const n = Math.min(10, Math.floor((len - 0.4) / 0.5));
          const x0 = (a + b) / 2 - n * 0.25;
          const color = lockerColors[(i + floor * 2 + (side > 0 ? 1 : 0)) % lockerColors.length];
          const zc = face - side * 0.22;
          for (let k = 0; k < n; k++) {
            const x = x0 + 0.25 + k * 0.5;
            box(metal, x, y + 0.08, zc, 0.48, 1.8, 0.42, color);
            box(parts, x, y, zc, 0.5, 0.08, 0.42, '#2a2a2a');
            for (let v = 0; v < 3; v++) box(parts, x, y + 1.55 + v * 0.06, zc - side * 0.212, 0.3, 0.02, 0.01, '#1a1a1a');
            box(parts, x + 0.17, y + 0.95, zc - side * 0.215, 0.03, 0.12, 0.02, '#c8c8c8');
            const spot = hide(ctx, z, null, x, zc, 'locker', 0.04, { pose: 'stand', heading: side < 0 ? 0 : Math.PI, name: 'в шкафчик' });
            spot.y = y;
            spot.exit = { x, z: zc - side * 0.62 };
            ctx.lockers.push(spot);
          }
          ctx.world.add({ minX: x0, maxX: x0 + n * 0.5, minZ: Math.min(zc - 0.21, zc + 0.21), maxZ: Math.max(zc - 0.21, zc + 0.21), minY: y, maxY: y + 1.9, type: 'locker' });
        } else if (len >= 1.6) {
          // Скамейка, цветок и плакаты над ней.
          const withPlant = len >= 2.5;
          const m = withPlant ? (a + b - 0.7) / 2 : (a + b) / 2, zc = face - side * 0.25;
          box(parts, m, y + 0.42, zc, 1.6, 0.06, 0.4, '#b88a55');
          for (const dx of [-0.65, 0.65]) box(metal, m + dx, y, zc, 0.06, 0.42, 0.36, '#3a3a3a');
          ctx.world.addBox(m, zc, 1.6, 0.42, y, y + 0.46, 'furniture');
          if (withPlant) plant(parts, b - 0.35, y, face - side * 0.3, true);
          ctx.wander.push({ x: m, z: face - side * 0.9, zone: zoneId, floor, kind: 'talk' });
          const names = ['gazette', 'rules', 'sport', 'achievements', 'timetable', 'math', 'library', 'evac'];
          const gb = ctx.B.gb(zoneId, 'posters');
          for (const dx of [-0.45, 0.45]) {
            const nm = names[(i * 2 + (dx > 0 ? 1 : 0) + floor * 3 + (side > 0 ? 5 : 0)) % names.length];
            vrect(gb, 'x', face - side * 0.012, -side, m + dx - 0.3, m + dx + 0.3, y + 1.15, y + 2.35, ctx.T.posters.rect(nm));
          }
        } else {
          plant(parts, (a + b) / 2, y, face - side * 0.3, true);
        }
      });
    }
    // Таблички у дверей кабинетов.
    for (const r of ROOMS) {
      if (r.floor !== floor || (r.side !== 'S' && r.side !== 'N') || !r.doors) continue;
      const side = r.side === 'S' ? -1 : 1, wallC = side < 0 ? CORR.z0 : CORR.z1, face = wallC - side * 0.1 - side * 0.012;
      const key = r.short ? 'room' + r.short : SIGN_KEY[r.id] ?? SIGN_KEY[r.type];
      if (!key) continue;
      const x = r.doors[0] + (r.side === 'S' ? -1 : 1) * (DOOR_W / 2 + 0.55);
      vrect(ctx.B.gb(corridorZone(floor, x), 'signs'), 'x', face, -side, x - 0.42, x + 0.42, y + 1.62, y + 1.8, ctx.T.signs.rect(key));
    }
    // Огнетушители и кнопки пожарной тревоги.
    for (const [x, side] of CABINETS[floor]) {
      const wallC = side < 0 ? CORR.z0 : CORR.z1, face = wallC - side * 0.1;
      const zoneId = corridorZone(floor, x);
      const parts = ctx.B.parts(zoneId);
      // Шкафчик пожарного крана: красный короб без дверцы, огнетушитель виден внутри.
      box(parts, x, y + 0.85, face - side * 0.03, 0.55, 0.85, 0.04, '#9a1414');
      box(parts, x - 0.255, y + 0.85, face - side * 0.13, 0.04, 0.85, 0.24, '#c41e1e');
      box(parts, x + 0.255, y + 0.85, face - side * 0.13, 0.04, 0.85, 0.24, '#c41e1e');
      box(parts, x, y + 0.85, face - side * 0.13, 0.55, 0.04, 0.24, '#c41e1e');
      box(parts, x, y + 1.66, face - side * 0.13, 0.55, 0.04, 0.24, '#c41e1e');
      vrect(ctx.B.gb(zoneId, 'posters'), 'x', face - side * 0.012, -side, x + 0.45, x + 0.95, y + 1.3, y + 2.3, ctx.T.posters.rect('alarm'));
      box(parts, x + 0.7, y + 1.35, face - side * 0.03, 0.14, 0.14, 0.05, '#c41e1e');
      box(parts, x + 0.7, y + 1.37, face - side * 0.06, 0.08, 0.08, 0.02, '#f4f4f4');
      ctx.alarms.push({ x: x + 0.7, y: y + 1.4, z: face - side * 0.4, floor, zone: zoneId });
      const item = itemSpec('extinguisher', { x, z: face - side * 0.45 }, y, ctx.zoneById.get(zoneId));
      item.cabinet = { x, z: face - side * 0.13, y: y + 0.92 };
      ctx.items.push(item);
      ctx.world.addBox(x, face - side * 0.13, 0.55, 0.26, y + 0.85, y + 1.7, 'furniture');
    }
    // «ВЫХОД» на торцах и часы в середине.
    const glow = ctx.B.gb(corridorZone(floor, -29), 'glow');
    if (floor === 0) vrect(glow, 'z', BLD.x0 + 0.012, 1, -0.6, 0.6, y + 2.45, y + 2.69, ctx.T.signs.rect('exit'));
    const gl2 = ctx.B.gb(corridorZone(floor, 29), 'glow');
    if (floor === 0) vrect(gl2, 'z', BLD.x1 - 0.112, -1, -0.6, 0.6, y + 2.6, y + 2.84, ctx.T.signs.rect('gym'));
    clock(ctx.B.parts(corridorZone(floor, 10)), 10, y + 2.75, 1.39, 'x', -1);
    for (let x = -26; x <= 26; x += 6.5) ctx.wander.push({ x, z: (x * 7 + floor) % 2 ? 0.6 : -0.6, zone: corridorZone(floor, x), floor, kind: 'walk' });
  }
}

// Огнетушители с кнопкой тревоги: [x, сторона коридора] по этажам.
const CABINETS = [[[-18.6, -1], [9.0, -1], [21.5, 1]], [[-18.6, -1], [9.0, -1], [22.3, 1]]];

const SIGN_KEY = {
  wc: null, wcm1: 'wcm', wcm2: 'wcm', wcf1: 'wcf', wcf2: 'wcf', cafe: 'cafe', nurse: 'nurse', principal: 'principal',
  library: 'library', teachers: 'teachers', assembly: 'assemblyhall', storage: 'storage',
};

export function corridorZone(floor, x) {
  const i = x < -18 ? 0 : x < -6 ? 1 : x < 6 ? 2 : x < 18 ? 3 : 4;
  return `cor${floor}_${i}`;
}
