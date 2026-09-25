import * as THREE from 'three';
import { mergeColored } from './geometry.js';

// Модели питомцев из примитивов. Начало координат — между лап на земле, морда в +Z.
// Цвета: c0 — основной, c1 — второй (живот, морда, пятна), c2 — глаза/акцент.
// Летающие (дракон, феникс) рисуются так же, парение задаёт pets.js.

export const FLYING = new Set(['dragon', 'phoenix']);

const sphere = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function eyes(parts, x, y, z, r, color) {
  parts.push({ geometry: sphere(r, 8, 6).translate(x, y, z), color });
  parts.push({ geometry: sphere(r, 8, 6).translate(-x, y, z), color });
}

// Крыло: плоский треугольник, основание у тела, кончик наружу (sx = -1 левое, 1 правое).
function wing(sx, len, width, x0, y, z, tilt) {
  return cone(width / 2, len, 3).scale(0.1, 1, 1).rotateZ(-sx * Math.PI / 2)
    .translate(sx * (x0 + len / 2), 0, 0).rotateZ(sx * tilt).translate(0, y, z);
}

function legs(parts, dx, dz, h, r, color, y0 = 0) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push({ geometry: cyl(r, r * 0.9, h).translate(sx * dx, y0 + h / 2, sz * dz), color });
  }
}

// Кошачьи: кошка, лиса, енот, тигр.
function feline(c0, c1, c2, { earH = 0.13, tail = 'thin', mask = false, stripes = false } = {}) {
  const p = [];
  p.push({ geometry: sphere(0.2).scale(0.85, 0.78, 1.25).translate(0, 0.27, -0.02), color: c0 });
  p.push({ geometry: sphere(0.14).scale(0.9, 0.8, 0.8).translate(0, 0.25, 0.1), color: c1 });
  p.push({ geometry: sphere(0.165).translate(0, 0.46, 0.2), color: c0 });
  p.push({ geometry: sphere(0.08).scale(1.25, 0.8, 0.9).translate(0, 0.41, 0.33), color: c1 });
  p.push({ geometry: sphere(0.022, 6, 5).translate(0, 0.44, 0.405), color: '#2b1b1b' });
  for (const sx of [-1, 1]) p.push({ geometry: cone(0.065, earH, 4).rotateZ(-sx * 0.25).translate(sx * 0.09, 0.6 + earH * 0.3, 0.17), color: c0 });
  if (mask) p.push({ geometry: box(0.3, 0.06, 0.12).translate(0, 0.49, 0.29), color: c1 });
  eyes(p, 0.066, 0.49, 0.345, 0.03, mask ? '#f5f5f5' : c2);
  if (mask) eyes(p, 0.066, 0.49, 0.37, 0.018, '#111111');
  legs(p, 0.1, 0.14, 0.18, 0.045, c0);
  if (tail === 'fluffy') {
    p.push({ geometry: sphere(0.1).scale(0.9, 0.9, 2.2).rotateX(-0.6).translate(0, 0.35, -0.36), color: c0 });
    p.push({ geometry: sphere(0.07).translate(0, 0.47, -0.52), color: c1 });
  } else if (tail === 'ringed') {
    for (let k = 0; k < 4; k++) p.push({ geometry: cyl(0.045, 0.045, 0.08).rotateX(-0.9).translate(0, 0.3 + k * 0.055, -0.28 - k * 0.04), color: k % 2 ? c1 : c0 });
  } else {
    p.push({ geometry: cyl(0.03, 0.04, 0.34).rotateX(-0.9).translate(0, 0.37, -0.33), color: c0 });
  }
  if (stripes) {
    // Полоски — тонкие "срезы" туловища чуть шире него: видны кольцом по спине и бокам.
    for (let k = -1; k <= 1; k++) {
      const f = Math.sqrt(1 - ((k * 0.13) / 0.25) ** 2) * 1.05;
      p.push({ geometry: sphere(0.2).scale(0.85 * f, 0.78 * f, 0.1).translate(0, 0.28, k * 0.13 - 0.02), color: stripes });
    }
    p.push({ geometry: sphere(0.05).scale(0.5, 0.35, 1.3).translate(0, 0.62, 0.22), color: stripes });
  }
  return p;
}

function dog(c0, c1, c2) {
  const p = [];
  p.push({ geometry: sphere(0.21).scale(0.85, 0.8, 1.3).translate(0, 0.3, -0.02), color: c0 });
  p.push({ geometry: sphere(0.17).translate(0, 0.5, 0.22), color: c0 });
  p.push({ geometry: box(0.14, 0.1, 0.14).translate(0, 0.45, 0.37), color: c1 });
  p.push({ geometry: sphere(0.03, 6, 5).translate(0, 0.48, 0.45), color: '#1b1b1b' });
  for (const sx of [-1, 1]) p.push({ geometry: box(0.06, 0.16, 0.1).rotateZ(sx * 0.25).translate(sx * 0.15, 0.47, 0.18), color: c1 });
  eyes(p, 0.07, 0.54, 0.36, 0.03, c2);
  legs(p, 0.11, 0.15, 0.2, 0.05, c0);
  p.push({ geometry: cyl(0.03, 0.04, 0.22).rotateX(-1.1).translate(0, 0.42, -0.32), color: c0 });
  return p;
}

function bird(c0, c1, c2) {
  const p = [];
  p.push({ geometry: sphere(0.2).translate(0, 0.24, 0), color: c0 });
  p.push({ geometry: sphere(0.13).translate(0, 0.45, 0.07), color: c0 });
  p.push({ geometry: cone(0.04, 0.09, 6).rotateX(Math.PI / 2).translate(0, 0.43, 0.23), color: c1 });
  for (const sx of [-1, 1]) {
    p.push({ geometry: sphere(0.1).scale(0.35, 0.7, 1).translate(sx * 0.19, 0.26, -0.02), color: c0 });
    p.push({ geometry: box(0.05, 0.02, 0.09).translate(sx * 0.07, 0.01, 0.05), color: c1 });
    p.push({ geometry: cyl(0.012, 0.012, 0.06).translate(sx * 0.07, 0.04, 0.02), color: c1 });
  }
  eyes(p, 0.055, 0.48, 0.17, 0.024, c2);
  p.push({ geometry: cone(0.03, 0.08, 5).translate(0, 0.6, 0.06), color: c1 });
  return p;
}

function bunny(c0, c1, c2) {
  const p = [];
  p.push({ geometry: sphere(0.18).scale(1, 0.9, 1.15).translate(0, 0.2, 0), color: c0 });
  p.push({ geometry: sphere(0.14).translate(0, 0.39, 0.12), color: c0 });
  for (const sx of [-1, 1]) {
    p.push({ geometry: new THREE.CapsuleGeometry(0.035, 0.2, 4, 8).rotateZ(sx * 0.12).translate(sx * 0.05, 0.62, 0.08), color: c0 });
    p.push({ geometry: new THREE.CapsuleGeometry(0.018, 0.16, 4, 6).rotateZ(sx * 0.12).translate(sx * 0.052, 0.62, 0.105), color: c1 });
  }
  p.push({ geometry: sphere(0.06).translate(0, 0.22, -0.2), color: '#ffffff' });
  p.push({ geometry: sphere(0.02, 6, 5).translate(0, 0.37, 0.26), color: c1 });
  eyes(p, 0.06, 0.42, 0.23, 0.026, c2);
  for (const sx of [-1, 1]) p.push({ geometry: sphere(0.06).scale(1, 0.6, 1.5).translate(sx * 0.09, 0.04, 0.05), color: c0 });
  return p;
}

function pig(c0, c1, c2) {
  const p = [];
  p.push({ geometry: sphere(0.22).scale(1, 0.85, 1.3).translate(0, 0.28, 0), color: c0 });
  p.push({ geometry: sphere(0.16).translate(0, 0.36, 0.24), color: c0 });
  p.push({ geometry: cyl(0.07, 0.07, 0.07, 10).rotateX(Math.PI / 2).translate(0, 0.33, 0.4), color: c1 });
  eyes(p, 0.03, 0.34, 0.44, 0.015, '#8a3f52');
  for (const sx of [-1, 1]) p.push({ geometry: cone(0.05, 0.08, 4).rotateX(0.5).translate(sx * 0.1, 0.5, 0.2), color: c1 });
  eyes(p, 0.07, 0.42, 0.37, 0.026, c2);
  legs(p, 0.11, 0.15, 0.13, 0.05, c0);
  p.push({ geometry: new THREE.TorusGeometry(0.035, 0.012, 5, 10).translate(0, 0.33, -0.3), color: c1 });
  return p;
}

function bear(c0, c1, c2, panda) {
  const p = [];
  const limbs = panda ? c1 : c0;
  p.push({ geometry: sphere(0.26).scale(1, 0.9, 1.1).translate(0, 0.33, 0), color: c0 });
  p.push({ geometry: sphere(0.19).translate(0, 0.58, 0.14), color: c0 });
  p.push({ geometry: sphere(0.08).scale(1.2, 0.8, 1).translate(0, 0.53, 0.3), color: panda ? c0 : c1 });
  p.push({ geometry: sphere(0.028, 6, 5).translate(0, 0.56, 0.38), color: '#141414' });
  for (const sx of [-1, 1]) p.push({ geometry: sphere(0.065).translate(sx * 0.14, 0.74, 0.1), color: limbs });
  if (panda) for (const sx of [-1, 1]) p.push({ geometry: sphere(0.05).scale(1, 1.2, 0.6).translate(sx * 0.075, 0.6, 0.29), color: c1 });
  eyes(p, 0.075, 0.61, 0.315, 0.024, panda ? '#ffffff' : c2);
  legs(p, 0.14, 0.13, 0.2, 0.07, limbs);
  for (const sx of [-1, 1]) p.push({ geometry: sphere(0.07).scale(0.8, 1.3, 0.8).translate(sx * 0.24, 0.38, 0.1), color: limbs });
  return p;
}

function penguin(c0, c1, c2) {
  const p = [];
  p.push({ geometry: sphere(0.2).scale(1, 1.45, 0.95).translate(0, 0.3, 0), color: c0 });
  p.push({ geometry: sphere(0.16).scale(1, 1.4, 0.6).translate(0, 0.28, 0.1), color: c1 });
  p.push({ geometry: sphere(0.13).translate(0, 0.62, 0.02), color: c0 });
  p.push({ geometry: cone(0.035, 0.1, 6).rotateX(Math.PI / 2).translate(0, 0.6, 0.17), color: c2 });
  eyes(p, 0.05, 0.66, 0.12, 0.022, '#ffffff');
  eyes(p, 0.05, 0.66, 0.135, 0.012, '#111111');
  for (const sx of [-1, 1]) {
    p.push({ geometry: sphere(0.09).scale(0.3, 1.2, 0.6).rotateZ(sx * 0.3).translate(sx * 0.2, 0.33, 0), color: c0 });
    p.push({ geometry: box(0.07, 0.025, 0.11).translate(sx * 0.07, 0.012, 0.06), color: c2 });
  }
  return p;
}

function unicorn(c0, c1, c2) {
  const p = [];
  p.push({ geometry: new THREE.CapsuleGeometry(0.15, 0.36, 6, 12).rotateX(Math.PI / 2).translate(0, 0.52, 0), color: c0 });
  legs(p, 0.09, 0.2, 0.38, 0.045, c0);
  p.push({ geometry: cyl(0.07, 0.09, 0.3).rotateX(0.6).translate(0, 0.72, 0.26), color: c0 });
  p.push({ geometry: new THREE.CapsuleGeometry(0.08, 0.14, 4, 10).rotateX(1.2).translate(0, 0.86, 0.38), color: c0 });
  p.push({ geometry: cone(0.03, 0.2, 6).rotateX(0.35).translate(0, 1.0, 0.4), color: c2 });
  for (const sx of [-1, 1]) p.push({ geometry: cone(0.03, 0.08, 4).translate(sx * 0.05, 0.96, 0.33), color: c0 });
  for (let k = 0; k < 4; k++) p.push({ geometry: box(0.05, 0.1, 0.08).translate(0, 0.9 - k * 0.07, 0.3 - k * 0.07), color: k % 2 ? c2 : c1 });
  p.push({ geometry: sphere(0.08).scale(0.7, 1.6, 0.7).rotateX(-0.5).translate(0, 0.5, -0.36), color: c1 });
  eyes(p, 0.06, 0.9, 0.44, 0.022, '#2b2b2b');
  return p;
}

function dragon(c0, c1, c2) {
  const p = [];
  p.push({ geometry: sphere(0.22).scale(0.9, 0.85, 1.35).translate(0, 0.34, 0), color: c0 });
  p.push({ geometry: sphere(0.15).scale(0.8, 0.8, 1.1).translate(0, 0.3, 0.06), color: c1 });
  p.push({ geometry: cyl(0.07, 0.09, 0.22).rotateX(0.7).translate(0, 0.52, 0.24), color: c0 });
  p.push({ geometry: sphere(0.13).scale(0.9, 0.8, 1.3).translate(0, 0.64, 0.36), color: c0 });
  for (const sx of [-1, 1]) {
    p.push({ geometry: cone(0.03, 0.14, 5).rotateX(-0.7).translate(sx * 0.06, 0.75, 0.3), color: c1 });
    // крылья: перепонка + косточка по переднему краю
    p.push({ geometry: wing(sx, 0.42, 0.34, 0.1, 0.46, -0.04, 0.5), color: c1 });
    p.push({ geometry: cyl(0.018, 0.024, 0.44).rotateZ(-sx * (Math.PI / 2 - 0.5)).translate(sx * 0.28, 0.6, 0.09), color: c0 });
  }
  eyes(p, 0.06, 0.68, 0.47, 0.024, c2);
  p.push({ geometry: cone(0.08, 0.42, 6).rotateX(-Math.PI / 2 - 0.3).translate(0, 0.3, -0.42), color: c0 });
  legs(p, 0.1, 0.12, 0.16, 0.05, c0, 0.12);
  return p;
}

function phoenix(c0, c1, c2) {
  const p = [];
  p.push({ geometry: sphere(0.19).scale(0.9, 0.9, 1.3).translate(0, 0.36, 0), color: c0 });
  p.push({ geometry: sphere(0.12).translate(0, 0.56, 0.16), color: c0 });
  p.push({ geometry: cone(0.035, 0.1, 5).rotateX(Math.PI / 2 + 0.3).translate(0, 0.53, 0.3), color: c1 });
  for (let k = -1; k <= 1; k++) p.push({ geometry: cone(0.025, 0.16, 4).rotateX(-0.4).translate(k * 0.04, 0.7, 0.12), color: c1 });
  for (const sx of [-1, 1]) {
    p.push({ geometry: wing(sx, 0.5, 0.3, 0.08, 0.4, -0.03, 0.35), color: c1 });
    p.push({ geometry: wing(sx, 0.26, 0.16, 0.5, 0.4, -0.06, 0.35), color: c2 });
  }
  for (let k = -1; k <= 1; k++) p.push({ geometry: box(0.06, 0.02, 0.5).rotateX(0.35).translate(k * 0.07, 0.3, -0.42), color: k ? c1 : c2 });
  eyes(p, 0.05, 0.6, 0.26, 0.02, '#1b1b1b');
  return p;
}

const BUILDERS = {
  cat: (c) => feline(...c),
  fox: (c) => feline(...c, { earH: 0.17, tail: 'fluffy' }),
  raccoon: (c) => feline(...c, { tail: 'ringed', mask: true }),
  tiger: (c) => feline(...c, { stripes: '#1c1c1c' }),
  dog: (c) => dog(...c),
  bird: (c) => bird(...c),
  bunny: (c) => bunny(...c),
  pig: (c) => pig(...c),
  bear: (c) => bear(...c, false),
  panda: (c) => bear(...c, true),
  penguin: (c) => penguin(...c),
  unicorn: (c) => unicorn(...c),
  dragon: (c) => dragon(...c),
  phoenix: (c) => phoenix(...c),
};

const GEO_CACHE = new Map();

export function petGeometry(def) {
  if (!GEO_CACHE.has(def.id)) GEO_CACHE.set(def.id, mergeColored(BUILDERS[def.kind](def.colors)));
  return GEO_CACHE.get(def.id);
}

// Материал с эффектом редкости: золото, кристалл, свечение, радуга, космос.
export function petMaterial(def, envMap) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  switch (def.fx) {
    case 'gold':
      Object.assign(m, { metalness: 0.95, roughness: 0.22, envMap });
      break;
    case 'crystal':
      Object.assign(m, { metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.78, envMap });
      m.emissive.set('#3fd8ff');
      m.emissiveIntensity = 0.25;
      break;
    case 'glow':
      m.emissive.set(def.colors[0]);
      m.emissiveIntensity = 0.6;
      break;
    case 'cosmic':
      m.emissive.set('#6a4cff');
      m.emissiveIntensity = 0.5;
      break;
    case 'rainbow':
      m.emissive.set('#ff0000');
      m.emissiveIntensity = 0.45;
      break;
  }
  return m;
}

export function createPetMesh(def, envMap) {
  const mesh = new THREE.Mesh(petGeometry(def), petMaterial(def, envMap));
  mesh.castShadow = true;
  return mesh;
}
