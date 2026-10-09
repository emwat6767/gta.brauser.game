import * as THREE from 'three';
import { GeometryBuilder } from './geometry.js';

// Вывески, витрины и рекламные щиты. Все надписи рисуются на одном атласе (canvas 2048x1024, ячейки 256x128):
//   ячейки 0..31  — вывески магазинов, 32..47 — тёплые витрины, 48..63 — рекламные щиты.
// Вывески и щиты рисуются без освещения (MeshBasicMaterial) — ночью они "светятся"; днём их приглушает daynight.js.
// Весь город — два меша: signs (вывески и щиты) и windows (витрины).

const COLS = 8, ROWS = 8;
const CELL_W = 256, CELL_H = 128;

const SHOP_NAMES = ['КАФЕ', 'ПИЦЦА', 'БАР', 'СУШИ', 'АПТЕКА', 'ФИТНЕС', 'КИНО', 'ОТЕЛЬ', 'БАРБЕР', 'ТАТУ-САЛОН', 'ШАУРМА', 'КНИГИ',
  'МОТО', 'КОФЕ', 'ЛОМБАРД', 'ТАКО', 'БУРГЕРЫ', 'ВИДЕОПРОКАТ', 'ЦВЕТЫ', 'ОБМЕН ВАЛЮТ', 'ГРИЛЬ', 'БОКС-ЗАЛ', 'ЛАПША', 'ПОНЧИКИ',
  '24 ЧАСА', 'АВТОСЕРВИС', 'ПАБ', 'КАРАОКЕ', 'ОКТАГОН-ШОП', 'ДЖИМ', 'МОРОЖЕНОЕ', 'ЧАЙНАЯ'];
const BILLBOARDS = ['ТУРБО-КОЛА\nвсегда холодная', 'ОКТАГОН\nбой недели', 'КУПИ ТАЧКУ\nавтосалон Турбо', 'ТАКО-ЛОКО\nострее некуда', 'СУПЕР-СОТКА\nсвязь без границ',
  'НЕОН-СИТИ\nгород, который не спит', 'БАНК «ВАЙНВУД»\nтвой капитал', 'ПИЦЦА-БРО\nдоставка 20 минут', 'ЧЕМПИОНЫ\nвыходят на ринг', 'РОК-ФЕСТ\nлето 2026',
  'МОТО-МАНИЯ\nгазу!', 'ФИТНЕС-ПЛЮС\nпервый месяц даром', 'КОФЕ-ПАУЗА\nвзбодрись', 'ЛИМУЗИН-СЕРВИС\nк подъезду', 'ПАРК ЧУДЕС\nвход свободный', 'ГОРИЛЛА-БАР\nтолько для сильных'];

const NEON = ['#ff3df2', '#00e5ff', '#fff200', '#39ff14', '#ff6a00', '#ff2e63', '#7df9ff', '#b388ff'];
const SOLID = [['#c0392b', '#ffffff'], ['#1f4e8c', '#ffe08a'], ['#27ae60', '#ffffff'], ['#f39c12', '#1a1a1a'], ['#8e44ad', '#ffffff'],
  ['#16a085', '#ffffff'], ['#2c3e50', '#f1c40f'], ['#e84393', '#ffffff'], ['#d35400', '#ffffff'], ['#111111', '#ffd45a']];

// Подбор размера шрифта под ширину ячейки.
function fitText(g, text, maxW, size) {
  g.font = `900 ${size}px "Arial Narrow", Arial, sans-serif`;
  while (g.measureText(text).width > maxW && size > 14) {
    size -= 2;
    g.font = `900 ${size}px "Arial Narrow", Arial, sans-serif`;
  }
  return size;
}

function drawShopSign(g, x, y, text, rng) {
  if (rng.chance(0.55)) {
    // Неон: тёмная плашка и светящиеся буквы с обводкой.
    const c = rng.pick(NEON);
    g.fillStyle = '#0c0d12';
    g.fillRect(x, y, CELL_W, CELL_H);
    g.strokeStyle = c;
    g.lineWidth = 5;
    g.shadowColor = c;
    g.shadowBlur = 14;
    g.strokeRect(x + 10, y + 26, CELL_W - 20, CELL_H - 52);
    const size = fitText(g, text, CELL_W - 44, 54);
    g.fillStyle = c;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 2);
    g.shadowBlur = 0;
    void size;
  } else {
    const [bg, fg] = rng.pick(SOLID);
    g.fillStyle = bg;
    g.fillRect(x, y, CELL_W, CELL_H);
    g.fillStyle = fg;
    g.fillRect(x, y + 22, CELL_W, 4);
    g.fillRect(x, y + CELL_H - 26, CELL_W, 4);
    fitText(g, text, CELL_W - 36, 56);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + CELL_W / 2, y + CELL_H / 2 + 2);
  }
}

// Тёплая витрина: свет внутри, силуэты полок и людей, импосты.
function drawShopWindow(g, x, y, rng) {
  const hue = rng.pick([['#ffe9a8', '#e8a65a'], ['#fff3d6', '#d9b87a'], ['#cfe8ff', '#7fa8d6'], ['#ffd1f2', '#c26aa8'], ['#d9ffd6', '#7ec27a']]);
  const grad = g.createLinearGradient(0, y, 0, y + CELL_H);
  grad.addColorStop(0, hue[0]);
  grad.addColorStop(1, hue[1]);
  g.fillStyle = grad;
  g.fillRect(x, y, CELL_W, CELL_H);
  g.fillStyle = 'rgba(40,30,20,0.55)';
  for (let i = 0; i < 3; i++) g.fillRect(x + 8, y + 20 + i * 34, CELL_W - 16, 4);   // полки
  for (let i = 0; i < 9; i++) {
    g.fillStyle = `rgba(${40 + rng.int(0, 90)},${30 + rng.int(0, 70)},${20 + rng.int(0, 80)},0.8)`;
    g.fillRect(x + 12 + i * 26 + rng.range(-3, 3), y + 8 + rng.int(0, 2) * 34, 14 + rng.int(0, 8), 16 + rng.int(0, 10));
  }
  if (rng.chance(0.6)) {
    // Силуэт человека у прилавка.
    g.fillStyle = 'rgba(25,20,18,0.85)';
    const px = x + 40 + rng.range(0, CELL_W - 90);
    g.beginPath();
    g.arc(px, y + CELL_H - 66, 9, 0, Math.PI * 2);
    g.fill();
    g.fillRect(px - 10, y + CELL_H - 56, 20, 44);
  }
  g.fillStyle = 'rgba(20,24,28,0.9)';
  for (const f of [0, 0.33, 0.66, 1]) g.fillRect(x + Math.min(CELL_W - 5, f * CELL_W), y, 5, CELL_H);   // импосты
  g.fillRect(x, y, CELL_W, 5);
  g.fillRect(x, y + CELL_H - 5, CELL_W, 5);
}

function drawBillboard(g, x, y, text, rng) {
  const [a, b] = rng.pick([['#ff7a00', '#ffd200'], ['#0f2a6b', '#2d7fd6'], ['#1c1c24', '#e0003a'], ['#0b6b4a', '#7bd88f'], ['#4a1d7a', '#e84393'], ['#111111', '#00e5ff']]);
  const grad = g.createLinearGradient(x, y, x + CELL_W, y + CELL_H);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  g.fillStyle = grad;
  g.fillRect(x, y, CELL_W, CELL_H);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 6; i++) g.fillRect(x + i * 48 - 20, y, 14, CELL_H);       // диагональ-подобные полосы
  const [title, sub] = text.split('\n');
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitText(g, title, CELL_W - 24, 40);
  g.shadowColor = 'rgba(0,0,0,0.6)';
  g.shadowBlur = 6;
  g.fillText(title, x + CELL_W / 2, y + 48);
  g.shadowBlur = 0;
  g.font = '700 17px Arial, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillText(sub ?? '', x + CELL_W / 2, y + 92);
}

export function createSignAtlas(rng) {
  const c = document.createElement('canvas');
  c.width = CELL_W * COLS;
  c.height = CELL_H * ROWS;
  const g = c.getContext('2d');
  const cell = (i) => [(i % COLS) * CELL_W, Math.floor(i / COLS) * CELL_H];
  for (let i = 0; i < 32; i++) {
    const [x, y] = cell(i);
    drawShopSign(g, x, y, SHOP_NAMES[i % SHOP_NAMES.length], rng);
  }
  for (let i = 32; i < 48; i++) {
    const [x, y] = cell(i);
    drawShopWindow(g, x, y, rng);
  }
  for (let i = 48; i < 64; i++) {
    const [x, y] = cell(i);
    drawBillboard(g, x, y, BILLBOARDS[(i - 48) % BILLBOARDS.length], rng);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const uv = (i, v0 = 0, v1 = 1) => {
    const x = (i % COLS) / COLS, y = Math.floor(i / COLS) / ROWS;
    const u0 = x + 0.002, u1 = x + 1 / COLS - 0.002;
    // v вверх: верх ячейки — y (в canvas), у текстуры ось v перевёрнута.
    const top = 1 - y, h = 1 / ROWS;
    return [u0, top - h * (1 - v0) - 0.0, u1, top - h * (1 - v1)];
  };
  return { texture, uv, SIGNS: 32, WINDOWS: [32, 48], BOARDS: [48, 64] };
}

// Горизонтальные (вдоль стены) координаты: right = (nz, 0, -nx) — "вправо" для наблюдателя, смотрящего на стену снаружи.
function wallQuad(builder, O, n, u0, u1, y0, y1, w, color, uvRect, flip = false) {
  const rx = n[1], rz = -n[0];   // n = [nx, nz]
  const P = (u, y) => [O[0] + rx * u + n[0] * w, y, O[1] + rz * u + n[1] * w];
  const [uA, vA, uB, vB] = uvRect;
  // a b c d — против часовой стрелки со стороны нормали.
  builder.quad(P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1), [n[0], 0, n[1]],
    flip ? [uB, vA, uA, vA, uA, vB, uB, vB] : [uA, vA, uB, vA, uB, vB, uA, vB], color);
}

// Всё оформление города: витрины с навесами, вывески, рекламные щиты на крышах.
export class Dressing {
  constructor(world, atlas, rng) {
    this.world = world;
    this.atlas = atlas;
    this.rng = rng;
    this.signs = new GeometryBuilder();
    this.windows = new GeometryBuilder();
    this.awnings = new GeometryBuilder();
    this.white = new THREE.Color(1, 1, 1);
    this.count = 0;
  }

  // Витрина, навес и вывеска на фасаде здания, смотрящем на улицу. face: { O: [x, z], n: [nx, nz], len }.
  storefront(face, base) {
    const { rng, atlas } = this;
    const L = face.len;
    const pad = face.pad ?? 0;   // выступ цоколя-подиума: всё оформление выносим на него
    if (L < 7) return;
    const width = Math.min(L - 1.6, rng.range(6, 13));
    const off = rng.range(-(L - width) / 2 + 0.3, (L - width) / 2 - 0.3);
    const u0 = L / 2 - width / 2 + off, u1 = u0 + width;       // от начала грани (right идёт от O)
    const y0 = base + 0.25, y1 = base + 3.1;
    const winCell = rng.int(atlas.WINDOWS[0], atlas.WINDOWS[1] - 1);
    wallQuad(this.windows, face.O, face.n, u0, u1, y0, y1, 0.04 + pad, this.white, atlas.uv(winCell));
    // Вывеска над витриной.
    const sw = Math.min(width, 7.5), sh = sw / 3.4;
    const su0 = (u0 + u1) / 2 - sw / 2;
    const signCell = rng.int(0, atlas.SIGNS - 1);
    wallQuad(this.signs, face.O, face.n, su0, su0 + sw, base + 3.3, base + 3.3 + sh, 0.08 + pad, this.white, atlas.uv(signCell, 0.2, 0.8));
    // Навес: наклонные полоски над витриной.
    const aw = [rng.pick(['#c0392b', '#1f4e8c', '#27ae60', '#e6b422', '#8e44ad', '#16a085', '#e84393']), '#f4f1ea'];
    const stripes = Math.max(3, Math.round(width / 1.1));
    const step = width / stripes;
    const col = new THREE.Color();
    for (let k = 0; k < stripes; k++) {
      col.set(aw[k % 2]);
      const a = u0 + k * step, b = a + step;
      const rx = face.n[1], rz = -face.n[0];
      const P = (u, y, w) => [face.O[0] + rx * u + face.n[0] * w, y, face.O[1] + rz * u + face.n[1] * w];
      // Скос вниз-наружу (нормаль — вверх и от стены).
      const nn = [face.n[0] * 0.5, 0.86, face.n[1] * 0.5];
      this.awnings.quad(P(a, base + 3.2, 0.05 + pad), P(b, base + 3.2, 0.05 + pad), P(b, base + 2.65, 1.35 + pad), P(a, base + 2.65, 1.35 + pad), nn, [0, 0, 1, 0, 1, 1, 0, 1], col);
    }
    this.count++;
  }

  // Рекламный щит на двух стойках на крыше (двусторонний). alongX — щит вытянут вдоль оси X (смотрит по ±Z).
  billboard(x, y, z, alongX, w = 12) {
    const { rng, atlas } = this;
    const h = w / 2;
    const uvr = atlas.uv(rng.int(atlas.BOARDS[0], atlas.BOARDS[1] - 1));
    const frame = new THREE.Color('#2a2d33');
    for (const n of alongX ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) {
      const rx = n[1], rz = -n[0];
      wallQuad(this.signs, [x - (rx * w) / 2, z - (rz * w) / 2], n, 0, w, y + 2.2, y + 2.2 + h, 0.13, this.white, uvr);
    }
    const ax = alongX ? 1 : 0, az = alongX ? 0 : 1;
    for (const k of [-0.32, 0.32]) {
      const px = x + ax * w * k, pz = z + az * w * k;
      this.awnings.box(px - 0.15, y, pz - 0.15, px + 0.15, y + 2.3 + h * 0.5, pz + 0.15, frame);
    }
    const ex = alongX ? w / 2 + 0.12 : 0.12, ez = alongX ? 0.12 : w / 2 + 0.12;
    this.awnings.box(x - ex, y + 2.1, z - ez, x + ex, y + 2.2 + h + 0.12, z + ez, frame);
    this.count++;
  }

  // Вертикальная вывеска-"флаг" на стене над тротуаром (видна вдоль улицы): точка на стене (x, z), n — наружу.
  blade(x, y, z, n) {
    const { rng, atlas } = this;
    const uvr = atlas.uv(rng.int(0, atlas.SIGNS - 1), 0.15, 0.85);
    const w = 1.7, h = 1.25;
    const a = [-n[1], n[0]];       // нормаль одной стороны; её "вправо" совпадает с n (от стены наружу)
    wallQuad(this.signs, [x, z], a, 0, w, y, y + h, 0.03, this.white, uvr);
    wallQuad(this.signs, [x + n[0] * w, z + n[1] * w], [-a[0], -a[1]], 0, w, y, y + h, 0.03, this.white, uvr);
    this.awnings.box(x - 0.04, y + h - 0.06, z - 0.04, x + n[0] * w + 0.04, y + h + 0.04, z + n[1] * w + 0.04, new THREE.Color('#2a2d33'));
    this.count++;
  }

  finish(group, materials) {
    const out = [];
    for (const [builder, mat, name] of [[this.signs, materials.sign, 'signs'], [this.windows, materials.shop, 'shopwindows'], [this.awnings, materials.plain, 'awnings']]) {
      if (builder.isEmpty) continue;
      const mesh = new THREE.Mesh(builder.build(), mat);
      mesh.name = name;
      mesh.castShadow = name === 'awnings';
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      out.push(mesh);
    }
    return out;
  }
}

