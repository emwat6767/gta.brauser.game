import * as THREE from 'three';
import { createRng } from './utils.js';

// Текстуры тюрьмы (рисуются на canvas один раз): кирпич, штукатурка, плитка, бетон, гравий двора,
// решётки, сетка-рабица, колючая проволока и вывески. Цвет поверхностей дополнительно красится через vertex colors.

const rng = createRng(4242);

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true, aniso = 8, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (nearest) t.magFilter = THREE.NearestFilter;
  return t;
}

function speckle(g, w, h, n, lo, hi, alpha, size = 2) {
  for (let i = 0; i < n; i++) {
    const v = lo + rng.next() * (hi - lo);
    g.fillStyle = `rgba(${v},${v},${v},${alpha * (0.4 + rng.next() * 0.6)})`;
    g.fillRect(rng.next() * w, rng.next() * h, size * (0.5 + rng.next()), size * (0.5 + rng.next()));
  }
}

// Кирпич: 1 тайл = 2 x 2 метра (8 рядов по 0.25 м).
export function brickTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#b4aca0';
  g.fillRect(0, 0, 256, 256);
  const rows = 8, cols = 4, bw = 256 / cols, bh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols; k++) {
      const x = k * bw + (r % 2 ? bw / 2 : 0);
      const shade = 0.82 + rng.next() * 0.3;
      const rr = Math.round(150 * shade), gg = Math.round(88 * shade), bb = Math.round(70 * shade);
      g.fillStyle = `rgb(${rr},${gg},${bb})`;
      g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  speckle(g, 256, 256, 2600, 0, 90, 0.16);
  speckle(g, 256, 256, 500, 160, 255, 0.1);
  return finish(c);
}

// Штукатурка и покраска: лёгкий шум (1 тайл = 4 м).
export function plasterTexture() {
  const [c, g] = canvas(128);
  g.fillStyle = '#dcdcd6';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1800, 120, 255, 0.18);
  speckle(g, 128, 128, 300, 0, 60, 0.07, 3);
  return finish(c);
}

// Плитка пола: 1 тайл = 2 м (4 x 4 плитки).
export function tileTexture() {
  const [c, g] = canvas(128);
  g.fillStyle = '#7d8084';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const s = 0.86 + rng.next() * 0.2;
      const v = Math.round(190 * s);
      g.fillStyle = `rgb(${v},${v + 2},${v - 2})`;
      g.fillRect(i * 32 + 1.5, j * 32 + 1.5, 29, 29);
    }
  }
  speckle(g, 128, 128, 900, 40, 200, 0.12);
  return finish(c);
}

// Бетон: швы плит и пятна (1 тайл = 6 м).
export function concreteTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#9a9a96';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 5000, 60, 230, 0.2);
  speckle(g, 256, 256, 90, 0, 40, 0.14, 8);
  g.strokeStyle = 'rgba(40,40,40,0.55)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  g.beginPath();
  g.moveTo(128, 0); g.lineTo(128, 256);
  g.moveTo(0, 128); g.lineTo(256, 128);
  g.lineWidth = 1;
  g.stroke();
  return finish(c);
}

// Гравий и утоптанная земля двора (1 тайл = 4 м).
export function gravelTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#8f8a7d';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 9000, 50, 230, 0.35, 2.4);
  speckle(g, 256, 256, 700, 20, 70, 0.3, 4);
  return finish(c);
}

// Решётка камеры: прозрачный фон, вертикальные прутья + две перекладины. Ширина тайла — 2.4 м.
export function barsTexture() {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  const n = 20;
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * 256;
    const grad = g.createLinearGradient(x - 3, 0, x + 3, 0);
    grad.addColorStop(0, '#3a3f46');
    grad.addColorStop(0.5, '#9aa3ad');
    grad.addColorStop(1, '#2c3036');
    g.fillStyle = grad;
    g.fillRect(x - 3, 0, 6, 256);
  }
  g.fillStyle = '#2d3036';
  g.fillRect(0, 10, 256, 12);
  g.fillRect(0, 118, 256, 8);
  g.fillRect(0, 238, 256, 18);
  return finish(c, { aniso: 4 });
}

// Сетка-рабица: ромбы, тонкая линия. 1 тайл = 3 м.
export function chainlinkTexture() {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(190,198,206,0.95)';
  g.lineWidth = 2;
  const s = 16;
  for (let i = -8; i <= 16; i++) {
    g.beginPath();
    g.moveTo(i * s, 0); g.lineTo(i * s + 128, 128);
    g.moveTo(i * s + 128, 0); g.lineTo(i * s, 128);
    g.stroke();
  }
  return finish(c, { aniso: 4 });
}

// Колючая проволока «егоза»: ряд витков. 1 тайл = 2 м по длине.
export function razorTexture() {
  const [c, g] = canvas(256, 64);
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = '#cfd5db';
  g.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.ellipse(16 + i * 32, 32, 24, 24, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 2;
  g.strokeStyle = '#8c949c';
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * 256, a = rng.next() * 6.28;
    g.beginPath();
    g.moveTo(x, 32 + Math.sin(a) * 24);
    g.lineTo(x + 5, 32 + Math.sin(a) * 24 - 6);
    g.stroke();
  }
  return finish(c, { aniso: 4 });
}

// Разметка двора: баскетбольная площадка (1 тайл = вся площадка 16 x 14 м).
export function courtTexture() {
  const [c, g] = canvas(512, 448);
  g.fillStyle = '#4a5f7a';
  g.fillRect(0, 0, 512, 448);
  speckle(g, 512, 448, 6000, 40, 140, 0.15);
  g.strokeStyle = '#f2f2f2';
  g.lineWidth = 5;
  g.strokeRect(14, 14, 484, 420);
  g.beginPath();
  g.moveTo(256, 14); g.lineTo(256, 434);
  g.stroke();
  g.beginPath();
  g.arc(256, 224, 52, 0, Math.PI * 2);
  g.stroke();
  for (const side of [0, 1]) {
    const x = side ? 498 : 14, dir = side ? -1 : 1;
    g.strokeRect(side ? 498 - 120 : 14, 148, 120, 152);
    g.beginPath();
    g.arc(x + dir * 120, 224, 52, side ? Math.PI / 2 : -Math.PI / 2, side ? Math.PI * 1.5 : Math.PI / 2);
    g.stroke();
    g.beginPath();
    g.arc(x + dir * 40, 224, 190, side ? Math.PI * 0.66 : -Math.PI * 0.34, side ? Math.PI * 1.34 : Math.PI * 0.34);
    g.stroke();
  }
  return finish(c, { repeat: false });
}

// Вывеска/табличка: тёмный фон, жирный текст, рамка.
export function labelTexture(text, { w = 512, h = 128, fg = '#f2f2f2', bg = '#23272e', frame = '#d9b13b', sub = null, size = 0.5 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = frame;
  g.lineWidth = Math.max(3, h * 0.04);
  g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.88);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let fs = h * size * (sub ? 0.85 : 1);
  g.font = `900 ${fs}px "Arial Narrow", Arial, sans-serif`;
  while (g.measureText(text).width > w * 0.88 && fs > 12) {
    fs -= 3;
    g.font = `900 ${fs}px "Arial Narrow", Arial, sans-serif`;
  }
  g.fillText(text, w / 2, sub ? h * 0.42 : h * 0.54);
  if (sub) {
    g.font = `700 ${h * 0.2}px Arial, sans-serif`;
    g.fillStyle = frame;
    g.fillText(sub, w / 2, h * 0.76);
  }
  return finish(c, { repeat: false, aniso: 4 });
}

// Постер/граффити для стен камер (маленький «рисунок»).
export function posterTexture(kind = 0) {
  const [c, g] = canvas(128, 160);
  const palettes = [['#e8c07a', '#7a3b1d'], ['#9fd0e8', '#1d3b7a'], ['#e8a0a0', '#7a1d2b'], ['#b7e8a0', '#1d6b2b']];
  const [a, b] = palettes[kind % palettes.length];
  g.fillStyle = a;
  g.fillRect(0, 0, 128, 160);
  g.fillStyle = b;
  g.beginPath();
  g.arc(64, 70, 38, 0, Math.PI * 2);
  g.fill();
  g.fillRect(20, 112, 88, 30);
  g.strokeStyle = '#111';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 156);
  return finish(c, { repeat: false, aniso: 4 });
}

// Атлас табличек: десятки маленьких вывесок (номера камер, указатели, правила) рисуются в одну текстуру,
// а в сцене это один меш. add() запоминает табличку (локальные координаты тюрьмы), build() рисует атлас.
export class PlateAtlas {
  constructor() { this.items = []; }

  add(text, x, y, z, nx, nz, w, h, style) {
    if (!style || w <= 0) return;
    this.items.push({ text, x, y, z, nx, nz, w, h, style });
  }

  // Возвращает { texture, rects } — rects[i] = { u0, v0, u1, v1 } в долях атласа (v вверх).
  build() {
    const W = 2048;
    const slots = [];
    let x = 0, y = 0, rowH = 0;
    for (const it of this.items) {
      const pw = Math.round(Math.min(960, Math.max(192, it.w * 420)));
      const ph = Math.max(48, Math.round(pw * it.h / it.w));
      if (x + pw > W) { x = 0; y += rowH + 4; rowH = 0; }
      slots.push({ x, y, pw, ph });
      x += pw + 4;
      rowH = Math.max(rowH, ph);
    }
    const H = Math.min(4096, Math.max(64, y + rowH + 4));
    const [c, g] = canvas(W, H);
    g.fillStyle = '#222';
    g.fillRect(0, 0, W, H);
    this.items.forEach((it, i) => {
      const s = slots[i];
      const st = it.style;
      g.save();
      g.translate(s.x, s.y);
      g.fillStyle = st.bg ?? '#23272e';
      g.fillRect(0, 0, s.pw, s.ph);
      g.strokeStyle = st.frame ?? '#d9b13b';
      g.lineWidth = Math.max(3, s.ph * 0.07);
      g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, s.pw - g.lineWidth, s.ph - g.lineWidth);
      g.fillStyle = st.fg ?? '#f2f2f2';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let fs = s.ph * 0.62;
      g.font = `900 ${fs}px "Arial Narrow", Arial, sans-serif`;
      while (g.measureText(it.text).width > s.pw * 0.9 && fs > 10) { fs -= 2; g.font = `900 ${fs}px "Arial Narrow", Arial, sans-serif`; }
      g.fillText(it.text, s.pw / 2, s.ph * 0.54);
      g.restore();
    });
    const texture = finish(c, { repeat: false, aniso: 4 });
    const rects = slots.map((s) => ({ u0: s.x / W, v0: 1 - (s.y + s.ph) / H, u1: (s.x + s.pw) / W, v1: 1 - s.y / H }));
    return { texture, rects };
  }
}
