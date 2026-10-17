import * as THREE from 'three';
import { mergeColored } from './geometry.js';

// Гардероб: строит геометрию человека по описанию внешности (look). Всё склеивается в
// 9 мешей с vertex colors (таз, корпус с головой, руки, ноги), см. Humanoid.
//
// Поля look (все необязательные, без них получается прежний прохожий в футболке и джинсах):
//   skin, hair, shirt, pants, shoes — цвета ('#rrggbb')
//   scale     — рост (множитель), bulk — ширина тела (0.85 худой … 1.5 громила)
//   top       — 'tee' | 'polo' | 'jersey' | 'hawaii' | 'vest' | 'tank' | 'hoodie' | 'bomber' | 'varsity'
//               | 'leather' | 'denim' | 'suit' | 'track' | 'puffer' | 'turtle' | 'dress'
//   accent    — второй цвет верха: воротник, манжеты, полосы, галстук, рукава варсити
//   shirt2    — рубашка под пиджаком / майка под жилетом
//   bottom    — 'jeans' | 'slim' | 'joggers' | 'cargo' | 'shorts' | 'fightshorts' | 'skirt' | 'leggings'
//   trim      — полосы и пояс на низе; legs — цвет голых ног/колгот (по умолчанию skin)
//   shoeStyle — 'sneaker' | 'hightop' | 'boot' | 'dress'; shoeAccent — полоса/подошва
//   hairStyle — 'default' | 'bald' | 'buzz' | 'short' | 'fade' | 'curly' | 'slick' | 'mohawk' | 'bun'
//               | 'long' | 'ponytail' | 'afro' | 'dreads' | 'bob'
//   beard     — 'none' | 'stubble' | 'goatee' | 'short' | 'full' | 'thick' | 'mustache'
//   hat + hatStyle — 'cap' (по умолчанию) | 'snapback' | 'backcap' | 'beanie' | 'fedora' | 'bucket' | 'hood'
//                    | 'headband' | 'helmet' | 'beret'; bandana — повязка
//   glasses   — 'shades' | 'aviator' | 'round' | 'visor' (+ glassColor)
//   chain, watch, earring, scarf, backpack, bag, mask, headphones — цвета аксессуаров
//   gloves + glove ('fingerless' | 'boxing'), wraps — перчатки и бинты
//   tattoo    — 0..4 (набор татуировок на руках и шее)

export const HIP_Y = 0.92;
export const SPINE_Y = 0.94;
export const SHOULDER_Y = 0.52; // относительно spine

export const DEFAULT_LOOK = {
  skin: '#c89373',
  hair: '#1d1a17',
  shirt: '#f2f2f0',
  pants: '#34507e',
  shoes: '#1c1c1c',
  hat: null,        // цвет кепки (полиция) или null
  bandana: null,    // цвет банданы (банды) или null
  scale: 1,
};

// Размеры тела от bulk: ширина торса, толщина, руки, плечи, бёдра.
export function bodyDims(L) {
  const b = L.bulk ?? 1;
  return {
    bx: b, bz: 1 + (b - 1) * 0.8, ba: 1 + (b - 1) * 1.15,
    shoulderX: 0.225 + (b - 1) * 0.2, hipX: 0.1 + (b - 1) * 0.05, bl: 1 + (b - 1) * 0.5,
  };
}

const TOPS = {
  tee: { sleeve: 'short' }, polo: { sleeve: 'short' }, jersey: { sleeve: 'short' }, hawaii: { sleeve: 'short' },
  vest: { sleeve: 'short' }, tank: { sleeve: 'none' }, dress: { sleeve: 'none' },
  hoodie: { sleeve: 'long', puff: 1.13, cuff: true },
  bomber: { sleeve: 'long', puff: 1.1, cuff: true },
  varsity: { sleeve: 'long', puff: 1.1, cuff: true, sleeveAccent: true },
  leather: { sleeve: 'long', puff: 1.07 },
  denim: { sleeve: 'long', puff: 1.06, cuff: true },
  suit: { sleeve: 'long', puff: 1.05 },
  track: { sleeve: 'long', puff: 1.08, cuff: true, stripes: true },
  puffer: { sleeve: 'long', puff: 1.34, thick: true },
  turtle: { sleeve: 'long', puff: 1.02 },
};

// ---------------------------------------------------------------- помощники
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sphere = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// Коробка, повёрнутая вокруг своего центра (сначала поворот, потом сдвиг).
const rbox = (w, h, d, x, y, z, rz = 0, rx = 0) => new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateZ(rz).translate(x, y, z);
const torus = (R, r, seg = 14, tube = 5) => new THREE.TorusGeometry(R, r, tube, seg);
const col = (c) => new THREE.Color(c);
const shade = (c, f) => col(c).multiplyScalar(f);
const mix = (a, b, t) => col(a).lerp(col(b), t);
const lighten = (c, t) => col(c).lerp(new THREE.Color(1, 1, 1), t);

const GOLD = '#d9b13b';
const INK = '#26304a';
const EYE = '#1a1512';

// Радиус кожаной части руки на высоте y (0 — плечо, -0.3 — локоть): линейный переход.
const upperR = (y, ba) => (0.056 + (0.05 - 0.056) * (-y / 0.3)) * ba;
const foreR = (y, ba) => (0.05 + (0.04 - 0.05) * (-y / 0.27)) * (0.8 + 0.2 * ba);

// ---------------------------------------------------------------- корпус и голова
function torsoParts(L, T, D, parts) {
  const puff = T.puff ?? 1;
  const sx = 1.05 * D.bx * puff, sz = 0.72 * D.bz * puff;
  const shirt = L.shirt;
  const acc = L.accent ?? shade(shirt, 0.62);
  const under = L.shirt2 ?? '#f2f2f0';
  const zf = 0.18 * sz + 0.004;      // передняя поверхность корпуса
  const W = 0.189 * D.bx * puff;     // половина ширины в области груди
  const top = L.top ?? 'tee';

  const tank = top === 'tank' || top === 'dress';
  parts.push({ geometry: new THREE.CapsuleGeometry(0.18, 0.28, 6, 14).scale(sx, 1, sz).translate(0, 0.28, 0), color: shirt });
  // Плечевой пояс (на майке — кожа с лямками).
  parts.push({
    geometry: new THREE.CapsuleGeometry(0.085, 0.3 * D.bx, 4, 10).rotateZ(Math.PI / 2).scale(1, 1 * puff, 0.85 * D.bz * puff).translate(0, SHOULDER_Y - 0.01, 0),
    color: tank ? L.skin : shirt,
  });
  if (tank) {
    for (const x of [-0.115, 0.115]) parts.push({ geometry: box(0.07, 0.2, 0.2 * D.bz, x * D.bx, 0.56, 0), color: shirt });
  }
  const zip = lighten(shirt, 0.55);

  switch (top) {
    case 'polo':
      parts.push({ geometry: rbox(0.1, 0.05, 0.03, 0.05, 0.6, zf - 0.02, -0.5), color: acc });
      parts.push({ geometry: rbox(0.1, 0.05, 0.03, -0.05, 0.6, zf - 0.02, 0.5), color: acc });
      parts.push({ geometry: box(0.02, 0.12, 0.012, 0, 0.5, zf), color: acc });
      break;
    case 'jersey':
      parts.push({ geometry: box(0.03 * D.bx, 0.5, 0.2 * D.bz, W - 0.01, 0.3, 0), color: acc });
      parts.push({ geometry: box(0.03 * D.bx, 0.5, 0.2 * D.bz, -W + 0.01, 0.3, 0), color: acc });
      parts.push({ geometry: box(0.17, 0.12, 0.012, 0, 0.35, -zf + 0.0), color: acc });          // номер на спине
      break;
    case 'hawaii': {
      // Цветочный принт: пятна на груди и спине + расстёгнутый воротник.
      const cols = [acc, lighten(acc, 0.6), '#fff3c4', shade(acc, 0.7)];
      for (let i = 0; i < 16; i++) {
        const a = (i * 2.399) % (Math.PI * 2), y = 0.1 + (i % 6) * 0.08;
        const x = Math.sin(a) * W * 0.95, z = Math.cos(a) * zf * 0.95;
        parts.push({ geometry: sphere(0.026 + (i % 3) * 0.008, 6, 5).translate(x, y, z), color: cols[i % 4] });
      }
      parts.push({ geometry: rbox(0.07, 0.1, 0.03, 0.07, 0.56, zf - 0.015, -0.45), color: shade(shirt, 0.82) });
      parts.push({ geometry: rbox(0.07, 0.1, 0.03, -0.07, 0.56, zf - 0.015, 0.45), color: shade(shirt, 0.82) });
      parts.push({ geometry: box(0.06, 0.26, 0.012, 0, 0.48, zf), color: under });
      break;
    }
    case 'vest':
      // Жилет (светоотражающий / тактический) поверх майки.
      parts.push({ geometry: new THREE.CapsuleGeometry(0.18, 0.28, 4, 12).scale(1.08 * D.bx, 1, 0.76 * D.bz).translate(0, 0.28, 0), color: acc });
      parts.push({ geometry: box(0.4 * D.bx, 0.04, 0.3 * D.bz, 0, 0.22, 0), color: '#e8e8e8' });
      parts.push({ geometry: box(0.4 * D.bx, 0.04, 0.3 * D.bz, 0, 0.36, 0), color: '#e8e8e8' });
      break;
    case 'hoodie':
      // Капюшон за шеей, карман-кенгуру, шнурки.
      parts.push({ geometry: new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).rotateX(2.2).scale(1.0, 0.9, 0.8).translate(0, 0.63, -0.09), color: shade(shirt, 0.92) });
      parts.push({ geometry: box(0.27 * D.bx, 0.1, 0.03, 0, 0.1, zf + 0.005), color: shade(shirt, 0.88) });
      for (const x of [-0.04, 0.04]) parts.push({ geometry: box(0.012, 0.16, 0.012, x, 0.5, zf + 0.004), color: '#f2f2f0' });
      break;
    case 'bomber':
    case 'varsity':
    case 'denim':
    case 'track':
      parts.push({ geometry: box(0.012, 0.54, 0.012, 0, 0.3, zf + 0.002), color: zip });
      if (top === 'varsity') parts.push({ geometry: box(0.07, 0.07, 0.012, 0.1, 0.42, zf + 0.002), color: acc });
      if (top === 'track') {
        parts.push({ geometry: box(0.03, 0.5, 0.2 * D.bz, W - 0.002, 0.3, 0), color: acc });
        parts.push({ geometry: box(0.03, 0.5, 0.2 * D.bz, -W + 0.002, 0.3, 0), color: acc });
      }
      if (top === 'denim') {
        parts.push({ geometry: box(0.07, 0.06, 0.014, 0.09, 0.4, zf + 0.002), color: shade(shirt, 0.82) });
        parts.push({ geometry: box(0.07, 0.06, 0.014, -0.09, 0.4, zf + 0.002), color: shade(shirt, 0.82) });
      }
      break;
    case 'leather':
      // Косая молния, лацканы, заклёпки на плечах.
      parts.push({ geometry: rbox(0.014, 0.5, 0.014, 0.04, 0.3, zf + 0.003, -0.28), color: '#b9bdc2' });
      parts.push({ geometry: rbox(0.09, 0.2, 0.03, 0.08, 0.5, zf - 0.01, -0.35), color: shade(shirt, 1.5) });
      parts.push({ geometry: rbox(0.09, 0.2, 0.03, -0.08, 0.5, zf - 0.01, 0.35), color: shade(shirt, 1.5) });
      for (const x of [-0.14, -0.1, 0.1, 0.14]) parts.push({ geometry: sphere(0.011, 5, 4).translate(x * D.bx, 0.56, 0.02), color: '#d0d4d8' });
      break;
    case 'suit':
      // Лацканы, рубашка с галстуком, пуговицы.
      parts.push({ geometry: box(0.1, 0.34, 0.012, 0, 0.42, zf + 0.0), color: under });
      parts.push({ geometry: box(0.026, 0.28, 0.014, 0, 0.4, zf + 0.004), color: acc });
      parts.push({ geometry: box(0.04, 0.035, 0.014, 0, 0.55, zf + 0.004), color: acc });
      parts.push({ geometry: rbox(0.07, 0.34, 0.025, 0.075, 0.42, zf - 0.005, -0.2), color: shade(shirt, 0.8) });
      parts.push({ geometry: rbox(0.07, 0.34, 0.025, -0.075, 0.42, zf - 0.005, 0.2), color: shade(shirt, 0.8) });
      parts.push({ geometry: sphere(0.012, 5, 4).translate(0.0, 0.22, zf + 0.002), color: '#1a1a1a' });
      break;
    case 'puffer':
      // Стёганые "кольца" на корпусе.
      for (const y of [0.17, 0.28, 0.39]) {
        const rr = 0.189 * D.bx * puff * 1.03;
        parts.push({ geometry: cyl(rr, rr, 0.03, 16).scale(1, 1, (0.72 * D.bz) / (1.05 * D.bx)).translate(0, y, 0), color: shade(shirt, 0.8) });
      }
      break;
    case 'turtle':
      parts.push({ geometry: cyl(0.065, 0.07, 0.1, 10).translate(0, 0.65, 0), color: shirt });
      break;
    default: break;
  }

  // Воротник и подол куртки (резинка).
  const hasHem = ['hoodie', 'bomber', 'varsity', 'track', 'puffer', 'denim'].includes(top);
  if (['bomber', 'varsity'].includes(top)) parts.push({ geometry: torus(0.078, 0.024, 12, 6).rotateX(Math.PI / 2).translate(0, 0.62, 0), color: acc });
  if (top === 'track') parts.push({ geometry: cyl(0.078, 0.084, 0.09, 10).translate(0, 0.63, 0), color: shirt });
  if (top === 'denim' || top === 'leather') {
    parts.push({ geometry: rbox(0.1, 0.05, 0.1, 0.06, 0.62, 0.04, -0.3), color: shade(shirt, 0.9) });
    parts.push({ geometry: rbox(0.1, 0.05, 0.1, -0.06, 0.62, 0.04, 0.3), color: shade(shirt, 0.9) });
  }
  if (top === 'puffer') parts.push({ geometry: torus(0.085, 0.034, 12, 6).rotateX(Math.PI / 2).translate(0, 0.62, 0), color: shirt });
  if (hasHem) {
    const hemR = 0.19 * D.bx * puff;
    parts.push({ geometry: cyl(hemR * 0.92, hemR, 0.07, 14).scale(1, 1, 0.72 * D.bz / D.bx).translate(0, 0.03, 0), color: ['bomber', 'varsity', 'track'].includes(top) ? acc : shade(shirt, 0.9) });
  }
  if (top === 'suit' || top === 'leather') {
    // Пиджак/куртка ниже пояса.
    const r = 0.2 * D.bx * puff;
    parts.push({ geometry: cyl(r * 0.97, r * 1.08, 0.2, 14).scale(1, 1, 0.74 * D.bz / D.bx).translate(0, -0.03, 0), color: shirt });
  }
  return { hasHem, W, zf };
}

function pelvisParts(L, T, D) {
  const top = L.top ?? 'tee';
  const bottom = L.bottom ?? 'jeans';
  const hasHem = ['hoodie', 'bomber', 'varsity', 'track', 'puffer', 'denim', 'suit', 'leather'].includes(top);
  const trim = L.trim ?? '#e8e8e8';
  const parts = [];
  parts.push({ geometry: cyl(0.165 * D.bx, 0.15 * D.bx, 0.2, 14).scale(1, 1, D.bz / D.bx).translate(0, HIP_Y + 0.04, 0), color: L.pants });
  const beltCol = bottom === 'fightshorts' ? trim : '#2a2622';
  if (!hasHem && top !== 'dress') {
    parts.push({ geometry: cyl(0.168 * D.bx, 0.168 * D.bx, 0.05, 14).scale(1, 1, D.bz / D.bx).translate(0, HIP_Y + 0.14, 0), color: beltCol });
    if (bottom === 'jeans' || bottom === 'slim' || bottom === 'cargo') parts.push({ geometry: box(0.04, 0.035, 0.012, 0, HIP_Y + 0.14, 0.17 * D.bz), color: L.chain ?? '#c9c9c9' });
  }
  if (bottom === 'skirt' || top === 'dress') {
    const sc = top === 'dress' ? L.shirt : L.pants;
    parts.push({ geometry: cyl(0.17 * D.bx, 0.29 * D.bx, 0.36, 16).translate(0, HIP_Y + 0.1 - 0.18, 0), color: sc });
    parts.push({ geometry: cyl(0.29 * D.bx, 0.29 * D.bx, 0.02, 16).translate(0, HIP_Y + 0.1 - 0.35, 0), color: shade(sc, 0.8) });
  }
  return parts;
}

// ---------------------------------------------------------------- руки
function armParts(L, T, D, side) {
  const top = L.top ?? 'tee';
  const sleeve = T.sleeve;
  const ba = D.ba;
  const sc = T.sleeveAccent ? (L.accent ?? shade(L.shirt, 0.6)) : L.shirt;
  const acc = L.accent ?? shade(L.shirt, 0.62);
  const upper = [], fore = [];

  // Плечо: шар сустава + рукав + кожа.
  upper.push({ geometry: sphere(0.072 * ba, 12, 10), color: sleeve === 'none' ? L.skin : sc });
  upper.push({ geometry: cyl(upperR(-0.15, ba), upperR(-0.3, ba), 0.3).translate(0, -0.15, 0), color: L.skin });
  if (sleeve === 'short') {
    upper.push({ geometry: cyl(0.068 * ba, 0.063 * ba, 0.16).translate(0, -0.08, 0), color: sc });
    if (top === 'jersey' || top === 'polo') upper.push({ geometry: cyl(0.0655 * ba, 0.0645 * ba, 0.026).translate(0, -0.15, 0), color: L.accent ?? '#e8e8e8' });
  } else if (sleeve === 'long') {
    const k = 1 + ((T.puff ?? 1) - 1) * 0.8;
    upper.push({ geometry: cyl(0.068 * ba * k, 0.06 * ba * k, 0.3).translate(0, -0.15, 0), color: sc });
    if (T.stripes) upper.push({ geometry: box(0.014, 0.3, 0.05 * ba, side * -0.0, -0.15, 0).translate(side * 0.06 * ba * k, 0, 0), color: acc });
    if (T.thick) for (const y of [-0.07, -0.16, -0.25]) upper.push({ geometry: cyl(0.07 * ba * k, 0.07 * ba * k, 0.016).translate(0, y, 0), color: shade(sc, 0.82) });
  }

  // Предплечье + кисть.
  fore.push({ geometry: sphere(0.052 * ba, 10, 8), color: sleeve === 'long' ? sc : L.skin });
  const fr = (y) => foreR(y, ba);
  if (sleeve === 'long') {
    const k = 1 + ((T.puff ?? 1) - 1) * 0.6;
    fore.push({ geometry: cyl(fr(0) * k * 1.05, fr(-0.25) * k * 1.05, 0.25).translate(0, -0.125, 0), color: sc });
    if (T.cuff) fore.push({ geometry: cyl(fr(-0.25) * k * 1.12, fr(-0.27) * k * 1.12, 0.04).translate(0, -0.255, 0), color: acc });
    if (T.stripes) fore.push({ geometry: box(0.014, 0.25, 0.05 * ba, 0, -0.125, 0).translate(side * 0.045 * ba * k, 0, 0), color: acc });
    fore.push({ geometry: cyl(fr(-0.25), fr(-0.27), 0.05).translate(0, -0.265, 0), color: L.skin });
  } else {
    fore.push({ geometry: cyl(fr(0), fr(-0.27), 0.27).translate(0, -0.135, 0), color: L.skin });
  }
  // Кисть: перчатки, бинты, часы.
  const glove = L.gloves ? (L.glove ?? 'fingerless') : null;
  if (glove === 'boxing') {
    fore.push({ geometry: sphere(0.088, 12, 9).scale(1, 1.1, 1.05).translate(0, -0.33, 0.01), color: L.gloves });
    fore.push({ geometry: cyl(0.062, 0.06, 0.07).translate(0, -0.26, 0), color: shade(L.gloves, 0.7) });
  } else {
    fore.push({ geometry: sphere(0.052, 10, 8).scale(0.85, 1.15, 0.7).translate(0, -0.3, 0.005), color: glove ? L.gloves : L.skin });
    fore.push({ geometry: sphere(0.02, 6, 5).scale(1, 1.6, 1).translate(0, -0.285, 0.04), color: glove ? L.gloves : L.skin });
  }
  if (L.wraps && glove !== 'boxing') fore.push({ geometry: cyl(fr(-0.2) + 0.006, fr(-0.27) + 0.006, 0.09).translate(0, -0.22, 0), color: L.wraps });
  if (L.watch && side > 0) {
    fore.push({ geometry: cyl(fr(-0.24) + 0.006, fr(-0.25) + 0.006, 0.03).translate(0, -0.235, 0), color: L.watch });
    fore.push({ geometry: box(0.05, 0.012, 0.045, 0, -0.235, 0.04), color: '#15171a' });
  }
  // Татуировки на открытой коже.
  const tat = L.tattoo ?? 0;
  if (tat > 0) {
    const ring = (list, y0, y1, r0, r1) => list.push({ geometry: cyl(r0 + 0.0018, r1 + 0.0018, y0 - y1).translate(0, (y0 + y1) / 2, 0), color: INK });
    const bareFore = sleeve !== 'long' && !glove;
    const bareUpper = sleeve === 'none';
    const right = side < 0;
    if (tat === 1 && bareFore) {
      for (const y of [-0.08, -0.13, -0.18]) ring(fore, y, y - 0.03, fr(y), fr(y - 0.03));
    } else if (tat === 2 && bareFore && right) {
      ring(fore, -0.04, -0.23, fr(-0.04), fr(-0.23));
    } else if (tat === 3) {
      if (bareFore) { for (const y of [-0.04, -0.12, -0.2]) ring(fore, y, y - 0.06, fr(y), fr(y - 0.06)); }
      if (bareUpper) ring(upper, -0.1, -0.26, upperR(-0.1, ba), upperR(-0.26, ba));
    } else if (tat === 4 && right) {
      if (bareFore) ring(fore, -0.02, -0.24, fr(-0.02), fr(-0.24));
      if (bareUpper) { ring(upper, -0.04, -0.14, upperR(-0.04, ba), upperR(-0.14, ba)); ring(upper, -0.17, -0.28, upperR(-0.17, ba), upperR(-0.28, ba)); }
    }
  }
  return { upper, fore };
}

// ---------------------------------------------------------------- ноги
function legParts(L, D) {
  const bottom = L.bottom ?? 'jeans';
  const pc = L.pants;
  const bl = D.bl;
  const legs = L.legs ?? L.skin;
  const trim = L.trim ?? '#e8e8e8';
  const shoeStyle = L.shoeStyle ?? 'sneaker';
  const thigh = [], shin = [], foot = [];
  const slim = bottom === 'slim' || bottom === 'leggings' ? 0.9 : 1;
  const wide = bottom === 'cargo' ? 1.14 : bottom === 'joggers' ? 1.07 : 1;
  const r = bl * slim * wide;

  const bare = bottom === 'shorts' || bottom === 'fightshorts' || bottom === 'skirt';
  if (bottom === 'skirt') {
    thigh.push({ geometry: sphere(0.092 * bl, 12, 10), color: legs });
    thigh.push({ geometry: cyl(0.083 * bl, 0.066 * bl, 0.44).translate(0, -0.22, 0), color: legs });
    shin.push({ geometry: sphere(0.068 * bl, 12, 8), color: legs });
    shin.push({ geometry: cyl(0.062 * bl, 0.048 * bl, 0.42).translate(0, -0.21, 0), color: legs });
  } else if (bare) {
    const len = bottom === 'fightshorts' ? 0.27 : 0.3;
    thigh.push({ geometry: sphere(0.092 * bl, 12, 10), color: pc });
    thigh.push({ geometry: cyl(0.092 * bl, 0.082 * bl * (bottom === 'fightshorts' ? 1.1 : 1), len).translate(0, -len / 2, 0), color: pc });
    thigh.push({ geometry: cyl(0.081 * bl, 0.066 * bl, 0.44 - len + 0.02).translate(0, -len - (0.44 - len) / 2 + 0.01, 0), color: legs });
    if (bottom === 'fightshorts') {
      thigh.push({ geometry: box(0.014, len, 0.07, 0.09 * bl, -len / 2, 0), color: trim });
      thigh.push({ geometry: box(0.014, len, 0.07, -0.09 * bl, -len / 2, 0), color: trim });
      thigh.push({ geometry: cyl(0.082 * bl * 1.12, 0.082 * bl * 1.12, 0.035).translate(0, -len + 0.015, 0), color: trim });
    }
    shin.push({ geometry: sphere(0.068 * bl, 12, 8), color: legs });
    shin.push({ geometry: cyl(0.062 * bl, 0.048 * bl, 0.42).translate(0, -0.21, 0), color: legs });
    if (bottom === 'shorts') shin.push({ geometry: cyl(0.052 * bl, 0.053 * bl, 0.1).translate(0, -0.34, 0), color: '#f2f2f0' }); // носки
  } else {
    thigh.push({ geometry: sphere(0.092 * r, 12, 10), color: pc });
    thigh.push({ geometry: cyl(0.09 * r, 0.07 * r, 0.44).translate(0, -0.22, 0), color: pc });
    shin.push({ geometry: sphere(0.072 * r, 12, 8), color: pc });
    shin.push({ geometry: cyl(0.066 * r, 0.052 * (bottom === 'joggers' ? 1.0 : r), 0.42).translate(0, -0.21, 0), color: pc });
    if (bottom === 'cargo') {
      thigh.push({ geometry: box(0.05, 0.14, 0.11, 0.095 * r, -0.2, 0.01), color: shade(pc, 0.82) });
      thigh.push({ geometry: box(0.05, 0.14, 0.11, -0.095 * r, -0.2, 0.01), color: shade(pc, 0.82) });
    }
    if (bottom === 'joggers') shin.push({ geometry: cyl(0.058, 0.06, 0.05).translate(0, -0.385, 0), color: L.trim ?? shade(pc, 0.7) });
    if (bottom === 'leggings') {
      thigh.push({ geometry: box(0.012, 0.44, 0.06, 0.082 * r, -0.22, 0), color: trim });
      thigh.push({ geometry: box(0.012, 0.44, 0.06, -0.082 * r, -0.22, 0), color: trim });
    }
  }

  // Обувь.
  const shoes = L.shoes;
  const sole = L.shoeAccent ?? '#e9e6df';
  if (shoeStyle === 'dress') {
    foot.push({ geometry: box(0.1, 0.06, 0.28, 0, -0.03, 0.06), color: shoes });
    foot.push({ geometry: box(0.102, 0.016, 0.285, 0, -0.058, 0.06), color: '#17120f' });
  } else if (shoeStyle === 'boot') {
    foot.push({ geometry: box(0.115, 0.08, 0.27, 0, -0.025, 0.06), color: shoes });
    foot.push({ geometry: cyl(0.068, 0.07, 0.2).translate(0, 0.07, -0.0), color: shoes });
    foot.push({ geometry: box(0.118, 0.025, 0.272, 0, -0.058, 0.06), color: '#1a1a1a' });
    foot.push({ geometry: torus(0.07, 0.01, 10, 4).rotateX(Math.PI / 2).translate(0, 0.17, 0), color: shade(shoes, 1.5) });
  } else {
    foot.push({ geometry: box(0.11, 0.07, 0.25, 0, -0.025, 0.05), color: shoes });
    foot.push({ geometry: box(0.112, 0.02, 0.252, 0, -0.05, 0.05), color: sole });
    if (shoeStyle === 'hightop') {
      foot.push({ geometry: cyl(0.062, 0.064, 0.13).translate(0, 0.04, -0.015), color: shoes });
      foot.push({ geometry: cyl(0.0635, 0.0635, 0.025).translate(0, 0.1, -0.015), color: sole });
    }
    if (L.shoeAccent) foot.push({ geometry: box(0.114, 0.03, 0.12, 0, -0.012, 0.03), color: L.shoeAccent });
  }
  return { thigh, shin, foot };
}

// ---------------------------------------------------------------- голова
function hairParts(L, parts, hatted) {
  const style = L.hairStyle ?? 'default';
  const hc = L.hair;
  const HY = 0.765;
  const cap = (r, tilt, sy = 1.08, sz = 1.04, y = HY, theta = Math.PI * 0.5) => new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, theta)
    .rotateX(tilt).scale(1, sy, sz).translate(0, y, 0.005);
  const back = (w, h, d, y, z) => box(w, h, d, 0, y, z);
  const longBack = style === 'long' || style === 'ponytail' || style === 'dreads' || style === 'bob';
  if (hatted && !longBack) return;
  switch (style) {
    case 'bald': break;
    case 'buzz':
      if (!hatted) parts.push({ geometry: cap(0.1235, -0.4), color: mix(hc, L.skin, 0.25) });
      break;
    case 'fade':
      if (!hatted) {
        parts.push({ geometry: cap(0.1235, -0.4), color: mix(hc, L.skin, 0.3) });
        parts.push({ geometry: new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.32).rotateX(-0.2).scale(1, 1.1, 1.1).translate(0, 0.8, 0.02), color: hc });
      }
      break;
    case 'short': case 'default':
      if (!hatted) parts.push({ geometry: cap(0.128, -0.45), color: hc });
      break;
    case 'curly':
      if (!hatted) for (let i = 0; i < 18; i++) {
        const a = i * 2.399;
        let t = 0.25 + (i % 6) * 0.17;
        if (Math.cos(a) > 0.2) t *= 0.7; // над лбом, не на глазах
        const rr = 0.115;
        parts.push({ geometry: sphere(0.05, 6, 5).translate(Math.sin(a) * Math.sin(t) * rr, 0.765 + Math.cos(t) * rr * 1.1, Math.cos(a) * Math.sin(t) * rr * 0.95 - 0.015), color: hc });
      }
      break;
    case 'slick':
      if (!hatted) {
        parts.push({ geometry: cap(0.13, -0.85, 1.1, 1.08), color: hc });
        parts.push({ geometry: back(0.2, 0.1, 0.07, 0.78, -0.09), color: hc });
      }
      break;
    case 'mohawk':
      if (!hatted) {
        parts.push({ geometry: cap(0.1235, -0.4), color: mix(hc, L.skin, 0.5) });
        for (let i = 0; i < 6; i++) parts.push({ geometry: box(0.03, 0.085 - Math.abs(i - 2.5) * 0.008, 0.06, 0, 0.87 + 0 - Math.abs(i - 2.5) * 0.004, 0.09 - i * 0.045), color: hc });
      }
      break;
    case 'bun':
      if (!hatted) {
        parts.push({ geometry: cap(0.128, -0.45), color: hc });
        parts.push({ geometry: sphere(0.055, 8, 6).translate(0, 0.89, -0.05), color: hc });
      }
      break;
    case 'long':
      if (!hatted) parts.push({ geometry: cap(0.13, -0.5), color: hc });
      parts.push({ geometry: back(0.27, 0.34, 0.07, 0.62, -0.09), color: hc });
      parts.push({ geometry: box(0.03, 0.3, 0.12, 0.125, 0.66, -0.03), color: hc });
      parts.push({ geometry: box(0.03, 0.3, 0.12, -0.125, 0.66, -0.03), color: hc });
      break;
    case 'bob':
      if (!hatted) parts.push({ geometry: cap(0.13, -0.5), color: hc });
      parts.push({ geometry: back(0.27, 0.16, 0.08, 0.7, -0.07), color: hc });
      parts.push({ geometry: box(0.03, 0.15, 0.13, 0.128, 0.7, -0.02), color: hc });
      parts.push({ geometry: box(0.03, 0.15, 0.13, -0.128, 0.7, -0.02), color: hc });
      break;
    case 'ponytail':
      if (!hatted) parts.push({ geometry: cap(0.128, -0.45), color: hc });
      parts.push({ geometry: cyl(0.025, 0.04, 0.26, 7).rotateX(0.35).translate(0, 0.72, -0.15), color: hc });
      parts.push({ geometry: sphere(0.03, 6, 5).translate(0, 0.83, -0.11), color: shade(hc, 1.5) });
      break;
    case 'afro':
      if (!hatted) parts.push({ geometry: sphere(0.17, 12, 9).scale(1.0, 0.95, 1.0).translate(0, 0.82, -0.02), color: hc });
      break;
    case 'dreads':
      if (!hatted) parts.push({ geometry: cap(0.13, -0.4), color: hc });
      for (let i = 0; i < 9; i++) {
        const a = -2.4 + i * 0.6;
        parts.push({ geometry: cyl(0.014, 0.01, 0.28, 5).translate(Math.sin(a) * 0.115, 0.64, -Math.abs(Math.cos(a)) * 0.1 - 0.02), color: hc });
      }
      break;
    default: break;
  }
}

function beardParts(L, parts) {
  const b = L.beard ?? 'none';
  if (b === 'none') return;
  const hc = mix(L.hair, '#101010', 0.25);
  const shell = (r, t0, t1, ph = 1.75, sy = 1.1, sz = 1.02) => new THREE.SphereGeometry(r, 16, 8, Math.PI / 2 - ph, ph * 2, t0, t1 - t0)
    .scale(1, sy, sz).translate(0, 0.75, 0.01);
  if (b === 'stubble') parts.push({ geometry: shell(0.1215, 1.55, 2.4), color: mix(L.skin, hc, 0.45) });
  else if (b === 'short') parts.push({ geometry: shell(0.125, 1.5, 2.45), color: hc });
  else if (b === 'full') {
    parts.push({ geometry: shell(0.13, 1.45, 2.55, 1.9), color: hc });
    parts.push({ geometry: box(0.13, 0.07, 0.07, 0, 0.64, 0.085), color: hc });
  } else if (b === 'thick') {
    parts.push({ geometry: shell(0.14, 1.4, 2.6, 2.0), color: hc });
    parts.push({ geometry: box(0.16, 0.12, 0.09, 0, 0.62, 0.08), color: hc });
  } else if (b === 'goatee') {
    parts.push({ geometry: box(0.06, 0.085, 0.05, 0, 0.655, 0.12), color: hc });
    parts.push({ geometry: box(0.09, 0.016, 0.03, 0, 0.7, 0.128), color: hc });
  } else if (b === 'mustache') {
    parts.push({ geometry: box(0.1, 0.02, 0.035, 0, 0.705, 0.128), color: hc });
  }
}

function hatParts(L, parts) {
  if (!L.hat) return false;
  const style = L.hatStyle ?? 'cap';
  const c = L.hat;
  const dome = (r, sy = 0.85, y = 0.79, theta = Math.PI * 0.5) => new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, theta).scale(1, sy, 1.04).translate(0, y, 0.005);
  switch (style) {
    case 'cap': case 'snapback': case 'backcap': {
      parts.push({ geometry: dome(0.132), color: c });
      const dir = style === 'backcap' ? -1 : 1;
      parts.push({ geometry: box(0.2, 0.02, 0.11, 0, 0.795, 0.155 * dir), color: style === 'snapback' ? shade(c, 0.8) : c });
      if (style === 'snapback') parts.push({ geometry: box(0.06, 0.04, 0.012, 0, 0.84, 0.13), color: L.accent ?? '#e8e8e8' });
      break;
    }
    case 'beanie':
      parts.push({ geometry: dome(0.136, 1.0, 0.79, Math.PI * 0.55), color: c });
      parts.push({ geometry: torus(0.13, 0.018, 16, 6).rotateX(Math.PI / 2).translate(0, 0.8, 0.003), color: shade(c, 0.78) });
      parts.push({ geometry: sphere(0.03, 6, 5).translate(0, 0.935, 0), color: lighten(c, 0.35) });
      break;
    case 'fedora':
      parts.push({ geometry: cyl(0.215, 0.215, 0.012, 20).translate(0, 0.82, 0.01), color: c });
      parts.push({ geometry: cyl(0.1, 0.125, 0.13, 16).translate(0, 0.88, 0.005), color: c });
      parts.push({ geometry: cyl(0.1275, 0.1275, 0.028, 16).translate(0, 0.835, 0.005), color: L.accent ?? '#1a1a1a' });
      break;
    case 'bucket':
      parts.push({ geometry: cyl(0.13, 0.15, 0.13, 16).translate(0, 0.85, 0.005), color: c });
      parts.push({ geometry: cyl(0.2, 0.15, 0.02, 18).translate(0, 0.79, 0.005), color: shade(c, 0.9) });
      break;
    case 'hood':
      parts.push({ geometry: new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.66).rotateX(-0.18).scale(1, 1.02, 1.08).translate(0, 0.77, -0.025), color: c });
      break;
    case 'headband':
      parts.push({ geometry: torus(0.123, 0.016, 16, 5).rotateX(Math.PI / 2 - 0.12).translate(0, 0.82, 0.005), color: c });
      return false; // волосы остаются
    case 'helmet':
      parts.push({ geometry: dome(0.14, 0.95, 0.79), color: c });
      parts.push({ geometry: box(0.22, 0.015, 0.08, 0, 0.795, 0.15), color: shade(c, 0.85) });
      parts.push({ geometry: box(0.03, 0.015, 0.2, 0, 0.925, 0.0), color: shade(c, 0.8) });
      break;
    case 'beret':
      parts.push({ geometry: sphere(0.14, 14, 8).scale(1.1, 0.4, 1.0).translate(0.025, 0.85, 0.0), color: c });
      break;
    default:
      parts.push({ geometry: dome(0.132), color: c });
  }
  return true;
}

function faceParts(L, parts) {
  const eye = L.eye ?? EYE;
  // Глаза, нос, уши, брови, рот.
  parts.push({ geometry: sphere(0.018, 8, 6).translate(0.042, 0.77, 0.118), color: eye });
  parts.push({ geometry: sphere(0.018, 8, 6).translate(-0.042, 0.77, 0.118), color: eye });
  parts.push({ geometry: box(0.028, 0.045, 0.03, 0, 0.738, 0.13), color: L.skin });
  parts.push({ geometry: sphere(0.028, 8, 6).scale(0.5, 1, 0.8).translate(0.12, 0.75, 0), color: L.skin });
  parts.push({ geometry: sphere(0.028, 8, 6).scale(0.5, 1, 0.8).translate(-0.12, 0.75, 0), color: L.skin });
  const brow = mix(L.hair, '#0c0a08', 0.4);
  parts.push({ geometry: rbox(0.05, 0.011, 0.014, 0.043, 0.797, 0.121, -0.12), color: brow });
  parts.push({ geometry: rbox(0.05, 0.011, 0.014, -0.043, 0.797, 0.121, 0.12), color: brow });
  if (!L.mask && (L.beard ?? 'none') !== 'full' && L.beard !== 'thick') parts.push({ geometry: box(0.05, 0.009, 0.01, 0, 0.7, 0.123), color: mix(L.skin, '#7a2f2f', 0.45) });
  if (L.earring) parts.push({ geometry: sphere(0.011, 6, 5).translate(0.125, 0.72, 0.005), color: L.earring });
  if (L.mask) parts.push({ geometry: box(0.15, 0.085, 0.07, 0, 0.7, 0.092), color: L.mask });
}

function glassesParts(L, parts) {
  const g = L.glasses;
  if (!g) return;
  const lens = L.glassColor ?? '#111418';
  const frame = '#0d0d0f';
  if (g === 'shades') {
    for (const x of [-0.047, 0.047]) parts.push({ geometry: box(0.07, 0.042, 0.016, x, 0.77, 0.128), color: lens });
    parts.push({ geometry: box(0.024, 0.01, 0.014, 0, 0.775, 0.13), color: frame });
    parts.push({ geometry: box(0.172, 0.01, 0.014, 0, 0.785, 0.126), color: frame });
  } else if (g === 'aviator') {
    for (const x of [-0.045, 0.045]) parts.push({ geometry: sphere(0.034, 10, 6).scale(1.0, 0.9, 0.3).translate(x, 0.768, 0.128), color: lens });
    parts.push({ geometry: box(0.024, 0.008, 0.012, 0, 0.78, 0.13), color: GOLD });
  } else if (g === 'round') {
    for (const x of [-0.045, 0.045]) parts.push({ geometry: torus(0.03, 0.006, 12, 4).translate(x, 0.77, 0.13), color: frame });
    parts.push({ geometry: box(0.03, 0.007, 0.01, 0, 0.775, 0.13), color: frame });
  } else if (g === 'visor') {
    parts.push({ geometry: new THREE.CylinderGeometry(0.128, 0.128, 0.05, 14, 1, true, -1.25, 2.5).rotateY(Math.PI / 2 * 0).translate(0, 0.772, 0.005), color: lens });
  }
  // Дужки.
  for (const s of [-1, 1]) parts.push({ geometry: box(0.008, 0.008, 0.11, s * 0.118, 0.775, 0.065), color: frame });
}

function accessoryParts(L, T, D, parts, info) {
  const zf = info.zf;
  if (L.chain) {
    parts.push({ geometry: torus(0.092, 0.011, 16, 5).rotateX(Math.PI / 2 - 0.35).scale(D.bx, 1, D.bz).translate(0, 0.58, 0.035), color: L.chain });
    parts.push({ geometry: rbox(0.035, 0.035, 0.012, 0, 0.5, zf + 0.005, Math.PI / 4), color: L.chain });
  }
  if (L.scarf) {
    parts.push({ geometry: torus(0.086, 0.034, 12, 6).rotateX(Math.PI / 2).translate(0, 0.62, 0), color: L.scarf });
    parts.push({ geometry: box(0.07, 0.24, 0.025, 0.05, 0.5, zf + 0.012), color: L.scarf });
    parts.push({ geometry: box(0.07, 0.04, 0.026, 0.05, 0.38, zf + 0.012), color: shade(L.scarf, 0.7) });
  }
  if (L.headphones) {
    parts.push({ geometry: torus(0.13, 0.012, 16, 4).rotateY(Math.PI / 2).translate(0, 0.77, 0.0).scale(1, 1.05, 1), color: L.headphones });
    for (const s of [-1, 1]) parts.push({ geometry: cyl(0.045, 0.045, 0.03, 10).rotateZ(Math.PI / 2).translate(s * 0.13, 0.75, 0), color: shade(L.headphones, 0.8) });
  }
  if (L.backpack) {
    parts.push({ geometry: box(0.26 * D.bx, 0.36, 0.13, 0, 0.3, -zf - 0.07), color: L.backpack });
    parts.push({ geometry: box(0.2 * D.bx, 0.12, 0.05, 0, 0.18, -zf - 0.15), color: shade(L.backpack, 0.8) });
    for (const s of [-1, 1]) parts.push({ geometry: box(0.03, 0.4, 0.012, s * 0.1 * D.bx, 0.3, zf - 0.01), color: shade(L.backpack, 0.7) });
  }
  if (L.bag) {
    parts.push({ geometry: rbox(0.025, 0.7, 0.012, 0, 0.3, zf, 0.7), color: shade(L.bag, 0.8) });
    parts.push({ geometry: box(0.2, 0.15, 0.08, -0.17 * D.bx, 0.04, 0.02), color: L.bag });
  }
  if (L.tattoo === 4) parts.push({ geometry: box(0.045, 0.07, 0.03, 0.058, 0.628, 0.0), color: INK });
  if (L.champ) {
    // Чемпионский пояс: кожаный ремень с золотой пластиной и камнями.
    const puff = T.puff ?? 1;
    const r = 0.2 * D.bx * puff;
    parts.push({ geometry: cyl(r * 1.02, r * 1.02, 0.075, 18).scale(1, 1, (0.74 * D.bz) / D.bx).translate(0, 0.03, 0), color: '#141414' });
    const z = 0.151 * D.bz * puff + 0.014;
    parts.push({ geometry: box(0.2, 0.15, 0.03, 0, 0.03, z), color: GOLD });
    parts.push({ geometry: box(0.15, 0.1, 0.034, 0, 0.03, z), color: '#f2d36b' });
    parts.push({ geometry: sphere(0.026, 8, 6).translate(0, 0.03, z + 0.02), color: '#c0262a' });
    for (const x of [-0.13, 0.13]) parts.push({ geometry: box(0.05, 0.1, 0.03, x, 0.03, z - 0.01), color: GOLD });
  }
}

// ---------------------------------------------------------------- сборка
export function buildHumanGeometries(raw) {
  const L = { ...DEFAULT_LOOK, ...raw };
  const D = bodyDims(L);
  const T = TOPS[L.top ?? 'tee'] ?? TOPS.tee;

  const pelvis = mergeColored(pelvisParts(L, T, D));

  const spineParts = [];
  const info = torsoParts(L, T, D, spineParts);
  // Шея и голова.
  spineParts.push({ geometry: cyl(0.055, 0.06, 0.14, 10).translate(0, 0.62, 0), color: L.skin });
  spineParts.push({ geometry: sphere(0.12, 18, 14).scale(1, 1.1, 1.02).translate(0, 0.75, 0.01), color: L.skin });
  faceParts(L, spineParts);
  const hatted = hatParts(L, spineParts);
  hairParts(L, spineParts, hatted);
  beardParts(L, spineParts);
  glassesParts(L, spineParts);
  if (L.bandana) spineParts.push({ geometry: torus(0.122, 0.018, 20, 6).rotateX(Math.PI / 2).rotateX(-0.25).translate(0, 0.8, 0.005), color: L.bandana });
  accessoryParts(L, T, D, spineParts, info);
  const spine = mergeColored(spineParts);

  const aL = armParts(L, T, D, 1), aR = armParts(L, T, D, -1);
  const legs = legParts(L, D);
  return {
    pelvis, spine,
    upperArmL: mergeColored(aL.upper), upperArmR: mergeColored(aR.upper),
    foreArmL: mergeColored(aL.fore), foreArmR: mergeColored(aR.fore),
    thigh: mergeColored(legs.thigh), shin: mergeColored(legs.shin), foot: mergeColored(legs.foot),
  };
}

// Ключ кэша: одинаково одетые люди делят геометрию.
export function lookKey(raw) {
  const L = { ...DEFAULT_LOOK, ...raw };
  return [L.skin, L.hair, L.shirt, L.pants, L.shoes, L.hat, L.bandana, L.top, L.accent, L.shirt2, L.bottom, L.trim, L.legs,
    L.shoeStyle, L.shoeAccent, L.hairStyle, L.beard, L.hatStyle, L.glasses, L.glassColor, L.chain, L.watch, L.earring, L.scarf,
    L.backpack, L.bag, L.gloves, L.glove, L.wraps, L.mask, L.headphones, L.tattoo, L.bulk, L.eye, L.champ].join('|');
}
