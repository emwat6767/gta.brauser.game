import * as THREE from 'three';
import { createRng } from '../js/utils.js';

// Процедурные текстуры школы (canvas): полы, стены, потолок, фасад, двор, школьные доски
// с меловыми надписями и атлас плакатов. Всё рисуется один раз при загрузке.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, rng, count, rgb, alpha, size = 1) {
  for (let i = 0; i < count; i++) {
    const k = rng.range(-1, 1);
    const [r, g, b] = rgb.map((v) => Math.round(v + k * 28));
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    const s = size * rng.range(0.6, 1.4);
    ctx.fillRect(rng.range(0, w), rng.range(0, h), s, s);
  }
}

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const CHALK = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';

export function createSchoolTextures(renderer) {
  const rng = createRng(1717);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const finish = (c, repeat = true) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const T = {};

  // --- Линолеум коридора: крупная плитка 1×1 м с тонкой фугой и крапом -----------
  {
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#c9c2b2';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, rng, 2600, [190, 182, 166], 0.5, 2);
    speckle(x, 256, 256, rng, 500, [120, 112, 100], 0.35, 2);
    x.fillStyle = 'rgba(80,72,60,0.35)';
    x.fillRect(0, 0, 256, 2);
    x.fillRect(0, 0, 2, 256);
    T.lino = finish(c);
  }
  // --- Паркет (доска вразбежку) в кабинетах ---------------------------------------
  {
    const [c, x] = canvas(512, 512);
    const rowH = 32;
    for (let row = 0; row < 512 / rowH; row++) {
      let px = -rng.range(0, 200);
      while (px < 512) {
        const len = rng.range(140, 260);
        const tone = rng.range(0.82, 1.12);
        const base = [168 * tone, 112 * tone, 62 * tone].map((v) => Math.min(255, Math.round(v)));
        for (const wrap of [0, 512]) {
          x.fillStyle = `rgb(${base})`;
          x.fillRect(px - wrap, row * rowH, len, rowH);
          x.fillStyle = 'rgba(60,35,15,0.55)';
          x.fillRect(px - wrap, row * rowH, 1.5, rowH);
        }
        for (let g = 0; g < 3; g++) {
          x.strokeStyle = `rgba(80,50,20,${rng.range(0.08, 0.2)})`;
          x.beginPath();
          const yy = row * rowH + rng.range(4, rowH - 4);
          x.moveTo(Math.max(0, px), yy);
          x.bezierCurveTo(px + len * 0.3, yy + rng.range(-3, 3), px + len * 0.6, yy + rng.range(-3, 3), Math.min(512, px + len), yy);
          x.stroke();
        }
        px += len;
      }
      x.fillStyle = 'rgba(60,35,15,0.5)';
      x.fillRect(0, row * rowH, 512, 1.5);
    }
    T.parquet = finish(c);
  }
  // --- Плитка (туалеты, столовая, медпункт, лаборатория) --------------------------
  const tiles = (a, b, n, grout) => {
    const [c, x] = canvas(256, 256);
    const s = 256 / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * s, j * s, s, s);
    }
    speckle(x, 256, 256, rng, 900, [200, 200, 200], 0.15, 2);
    x.strokeStyle = grout;
    x.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      x.beginPath(); x.moveTo(i * s, 0); x.lineTo(i * s, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i * s); x.lineTo(256, i * s); x.stroke();
    }
    return finish(c);
  };
  T.tileFloor = tiles('#e8e6e0', '#9aa7b1', 4, 'rgba(90,90,90,0.5)');
  T.tileWall = tiles('#eef4f7', '#e2ecf1', 8, 'rgba(150,165,175,0.7)');
  T.tileCafe = tiles('#efe7d6', '#c4553d', 4, 'rgba(110,90,70,0.45)');

  // --- Пол спортзала: доски вдоль одной оси -----------------------------------------
  {
    const [c, x] = canvas(256, 256);
    for (let i = 0; i < 8; i++) {
      const tone = rng.range(0.9, 1.08);
      x.fillStyle = `rgb(${[214 * tone, 168 * tone, 108 * tone].map((v) => Math.min(255, Math.round(v)))})`;
      x.fillRect(0, i * 32, 256, 32);
      x.fillStyle = 'rgba(90,60,30,0.4)';
      x.fillRect(0, i * 32, 256, 1.5);
      const cut = rng.range(0, 256);
      x.fillRect(cut, i * 32, 1.5, 32);
    }
    speckle(x, 256, 256, rng, 700, [150, 110, 60], 0.15, 2);
    T.gymFloor = finish(c);
  }
  // --- Ковёр (библиотека, актовый зал) ----------------------------------------------
  {
    const [c, x] = canvas(128, 128);
    x.fillStyle = '#7a2430';
    x.fillRect(0, 0, 128, 128);
    speckle(x, 128, 128, rng, 3000, [130, 40, 52], 0.5, 1.5);
    x.strokeStyle = 'rgba(220,180,90,0.35)';
    x.lineWidth = 2;
    x.strokeRect(8, 8, 112, 112);
    x.beginPath(); x.moveTo(64, 20); x.lineTo(108, 64); x.lineTo(64, 108); x.lineTo(20, 64); x.closePath(); x.stroke();
    T.carpet = finish(c);
  }
  // --- Штукатурка стен (лёгкая фактура, цвет — вершинами) ------------------------------
  {
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#f4f4f2';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, rng, 5000, [232, 232, 230], 0.5, 2);
    speckle(x, 256, 256, rng, 800, [210, 210, 206], 0.3, 3);
    T.plaster = finish(c);
  }
  // --- Деревянные панели (библиотека, актовый зал, кабинет директора) ---------------
  {
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#efe6da';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = `rgba(120,80,40,${rng.range(0.05, 0.12)})`;
      x.fillRect(i * 64, 0, 64, 256);
      x.fillStyle = 'rgba(70,40,20,0.35)';
      x.fillRect(i * 64, 0, 2, 256);
      for (let g = 0; g < 7; g++) {
        x.strokeStyle = `rgba(90,55,25,${rng.range(0.05, 0.15)})`;
        x.beginPath();
        const xx = i * 64 + rng.range(6, 58);
        x.moveTo(xx, 0);
        x.bezierCurveTo(xx + rng.range(-5, 5), 80, xx + rng.range(-5, 5), 170, xx, 256);
        x.stroke();
      }
    }
    T.wood = finish(c);
  }
  // --- Потолок «Армстронг»: плиты 60×60 с крапом -------------------------------------
  {
    const [c, x] = canvas(128, 128);
    x.fillStyle = '#f3f2ee';
    x.fillRect(0, 0, 128, 128);
    speckle(x, 128, 128, rng, 1400, [200, 198, 192], 0.55, 1.5);
    x.fillStyle = 'rgba(140,138,130,0.8)';
    x.fillRect(0, 0, 128, 3);
    x.fillRect(0, 0, 3, 128);
    T.ceiling = finish(c);
  }
  // --- Кирпич фасада с белыми швами ----------------------------------------------------
  {
    const [c, x] = canvas(512, 512);
    x.fillStyle = '#d9d3c8';
    x.fillRect(0, 0, 512, 512);
    const bw = 64, bh = 24;
    for (let row = 0; row < 512 / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 512 / bw + 1; col++) {
        const tone = rng.range(0.85, 1.12);
        x.fillStyle = `rgb(${[176 * tone, 82 * tone, 58 * tone].map((v) => Math.min(255, Math.round(v)))})`;
        x.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
    speckle(x, 512, 512, rng, 4000, [120, 60, 40], 0.18, 2);
    T.brick = finish(c);
  }
  // --- Двор: трава, асфальт, беговая дорожка, плитка дорожек ----------------------------
  {
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#5d8f3e';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, rng, 7000, [85, 135, 60], 0.6, 2);
    speckle(x, 256, 256, rng, 1500, [120, 160, 70], 0.4, 2);
    T.grass = finish(c);
  }
  {
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#55585c';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, rng, 9000, [90, 92, 96], 0.5, 1.5);
    speckle(x, 256, 256, rng, 300, [40, 40, 42], 0.4, 3);
    T.asphalt = finish(c);
  }
  {
    const [c, x] = canvas(128, 128);
    x.fillStyle = '#b4493a';
    x.fillRect(0, 0, 128, 128);
    speckle(x, 128, 128, rng, 3000, [170, 70, 55], 0.6, 1.5);
    T.track = finish(c);
  }
  {
    const [c, x] = canvas(128, 128);
    x.fillStyle = '#b9b2a6';
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = `rgb(${[185, 178, 166].map((v) => Math.round(v * rng.range(0.9, 1.06)))})`;
      x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30);
    }
    T.paving = finish(c);
  }
  // --- Панельный дом (фасад с окнами): 4×4 окна на текстуру ---------------------------
  {
    const [c, x] = canvas(256, 256);
    x.fillStyle = '#c9c6bd';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, rng, 1500, [190, 186, 176], 0.4, 2);
    x.fillStyle = 'rgba(120,116,108,0.5)';
    for (let i = 0; i <= 4; i++) { x.fillRect(0, i * 64 - 1, 256, 2); x.fillRect(i * 64 - 1, 0, 2, 256); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const lit = rng.chance(0.25);
      x.fillStyle = lit ? '#e8d9a8' : rng.chance(0.5) ? '#5a6a7a' : '#46525e';
      x.fillRect(i * 64 + 14, j * 64 + 16, 36, 30);
      x.fillStyle = '#efefe8';
      x.fillRect(i * 64 + 31, j * 64 + 16, 2, 30);
    }
    T.panelBlock = finish(c);
  }
  // --- Небо: вертикальный градиент -----------------------------------------------------
  {
    const [c, x] = canvas(4, 256);
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#3f7fd0');
    g.addColorStop(0.55, '#8fc0ec');
    g.addColorStop(1, '#dfeaf2');
    x.fillStyle = g;
    x.fillRect(0, 0, 4, 256);
    T.sky = finish(c, false);
  }

  T.boards = new Map();
  T.board = (subject) => {
    if (!T.boards.has(subject)) T.boards.set(subject, finish(drawBoard(subject), false));
    return T.boards.get(subject);
  };
  T.posters = buildPosterAtlas();
  T.posters.texture = finish(T.posters.canvas, false);
  T.signs = buildSignAtlas();
  T.signs.texture = finish(T.signs.canvas, false);
  return T;
}

// ---------------------------------------------------------------- школьные доски
const BOARD_TEXT = {
  russian: ['16 октября', 'Классная работа', 'Сложноподчинённое', 'предложение', 'Я знаю, что ты придёшь.'],
  english: ['16th of October', 'Classwork', 'Present Perfect', 'I have never been', 'to London.'],
  history: ['16 октября', 'Тема: Пётр I', '1682–1725', 'Реформы:', 'флот, армия, календарь'],
  physics: ['16 октября', 'Закон Ома', 'I = U / R', 'U = 12 В,  R = 4 Ом', 'I = 3 А'],
  it: ['16 октября', 'Алгоритмы', 'if (x > 0) {', '  print("да")', '}'],
  chemistry: ['16 октября', 'Горение', 'CH₄ + 2O₂ → CO₂ + 2H₂O', 'Огнетушитель:', 'выдерни чеку!'],
  math: ['16 октября', 'Классная работа', 'x² − 5x + 6 = 0', 'D = 25 − 24 = 1', 'x₁ = 2,  x₂ = 3'],
  literature: ['16 октября', 'А. С. Пушкин', '«Евгений Онегин»', 'Роман в стихах', 'Д/з: выучить отрывок'],
  geography: ['16 октября', 'Материки', 'Евразия — самый', 'большой материк', 'S = 54 млн км²'],
  biology: ['16 октября', 'Клетка', 'ядро, цитоплазма,', 'мембрана', 'Д/з: §12'],
  music: ['16 октября', 'П. И. Чайковский', '«Времена года»', 'Октябрь.', 'Осенняя песнь'],
};

function drawBoard(subject) {
  const [c, x] = canvas(1024, 384);
  const g = x.createLinearGradient(0, 0, 1024, 384);
  g.addColorStop(0, '#24453a');
  g.addColorStop(1, '#1b3a30');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 384);
  // разводы мела
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(230,240,235,${Math.random() * 0.04})`;
    x.beginPath();
    x.ellipse(Math.random() * 1024, Math.random() * 384, 40 + Math.random() * 120, 10 + Math.random() * 30, Math.random(), 0, Math.PI * 2);
    x.fill();
  }
  const lines = BOARD_TEXT[subject] ?? BOARD_TEXT.math;
  x.fillStyle = 'rgba(245,248,240,0.92)';
  x.textBaseline = 'top';
  x.font = `38px ${CHALK}`;
  x.textAlign = 'right';
  x.fillText(lines[0], 990, 22);
  x.textAlign = 'center';
  x.font = `bold 46px ${CHALK}`;
  x.fillText(lines[1], 512, 74);
  x.textAlign = 'left';
  x.font = `40px ${CHALK}`;
  for (let i = 2; i < lines.length; i++) x.fillText(lines[i], 120, 150 + (i - 2) * 62);
  if (subject === 'math' || subject === 'physics') {
    x.strokeStyle = 'rgba(245,248,240,0.75)';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(720, 340); x.lineTo(720, 160); x.moveTo(680, 300); x.lineTo(960, 300);
    x.moveTo(740, 180); x.quadraticCurveTo(810, 420, 900, 180);
    x.stroke();
  }
  return c;
}

// ---------------------------------------------------------------- плакаты
// Атлас 2048×1024: сетка 8×2 ячеек 256×512 (плакаты в портретной ориентации).
// rect(name) → [u0, v0, u1, v1] для GeometryBuilder.
const POSTERS = [
  'evac', 'mendeleev', 'lomonosov', 'pushkin', 'rules', 'timetable', 'fire', 'map',
  'gazette', 'math', 'sport', 'library', 'menu', 'alarm', 'hands', 'achievements',
];

function buildPosterAtlas() {
  const W = 2048, H = 1024, cw = 256, ch = 512;
  const [c, x] = canvas(W, H);
  const rects = {};
  POSTERS.forEach((name, i) => {
    const px = (i % 8) * cw, py = Math.floor(i / 8) * ch;
    x.save();
    x.translate(px, py);
    x.beginPath();
    x.rect(0, 0, cw, ch);
    x.clip();
    drawPoster(x, name, cw, ch);
    x.restore();
    rects[name] = [px / W, 1 - (py + ch) / H, (px + cw) / W, 1 - py / H];
  });
  return { canvas: c, rect: (n) => rects[n] ?? rects.rules, names: POSTERS };
}

function title(x, text, y, size, color = '#1d2a44', w = 256) {
  x.fillStyle = color;
  x.font = `bold ${size}px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, y, w - 20);
}

function lines(x, arr, y0, step, size, color = '#2a2a2a', align = 'left') {
  x.fillStyle = color;
  x.font = `${size}px ${FONT}`;
  x.textAlign = align;
  x.textBaseline = 'middle';
  arr.forEach((t, i) => x.fillText(t, align === 'left' ? 22 : 128, y0 + i * step, 220));
}

function portrait(x, hair, coat, label) {
  x.fillStyle = '#5b4a36';
  x.fillRect(0, 0, 256, 512);
  x.fillStyle = '#c9a85a';
  x.fillRect(10, 10, 236, 492);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#6e6a5e');
  g.addColorStop(1, '#2f2c27');
  x.fillStyle = g;
  x.fillRect(22, 22, 212, 468);
  x.fillStyle = coat;
  x.beginPath(); x.ellipse(128, 470, 110, 150, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#f2efe8';
  x.beginPath(); x.moveTo(108, 330); x.lineTo(128, 380); x.lineTo(148, 330); x.fill();
  x.fillStyle = '#d8b394';
  x.beginPath(); x.ellipse(128, 250, 58, 74, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = hair;
  x.beginPath(); x.ellipse(128, 205, 66, 46, 0, Math.PI, 0); x.fill();
  x.beginPath(); x.ellipse(74, 240, 18, 48, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(182, 240, 18, 48, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#2b2118';
  x.fillRect(102, 245, 14, 5); x.fillRect(140, 245, 14, 5);
  x.fillStyle = '#e8dcc0';
  x.fillRect(40, 440, 176, 34);
  title(x, label, 457, 20, '#3a2a14');
}

function drawPoster(x, name, w, h) {
  const bg = (c) => { x.fillStyle = c; x.fillRect(0, 0, w, h); };
  const frame = (c = '#ffffff') => { x.strokeStyle = c; x.lineWidth = 8; x.strokeRect(4, 4, w - 8, h - 8); };
  switch (name) {
    case 'evac': {
      bg('#ffffff');
      x.fillStyle = '#1f8f4a';
      x.fillRect(0, 0, w, 70);
      title(x, 'ПЛАН ЭВАКУАЦИИ', 35, 22, '#ffffff');
      x.strokeStyle = '#333';
      x.lineWidth = 3;
      x.strokeRect(20, 100, 216, 300);
      for (let i = 0; i < 4; i++) { x.strokeRect(20, 100 + i * 75, 80, 75); x.strokeRect(156, 100 + i * 75, 80, 75); }
      x.strokeStyle = '#1f8f4a';
      x.lineWidth = 7;
      x.beginPath(); x.moveTo(128, 130); x.lineTo(128, 390); x.stroke();
      x.fillStyle = '#1f8f4a';
      x.beginPath(); x.moveTo(110, 380); x.lineTo(146, 380); x.lineTo(128, 410); x.fill();
      x.fillStyle = '#d62c2c';
      x.beginPath(); x.arc(60, 250, 9, 0, Math.PI * 2); x.fill();
      lines(x, ['● Вы здесь', '→ Путь к выходу', 'Огнетушитель'], 440, 24, 16);
      break;
    }
    case 'mendeleev': {
      bg('#fdfbf3');
      title(x, 'ТАБЛИЦА', 30, 24);
      title(x, 'МЕНДЕЛЕЕВА', 58, 24);
      const cols = ['#f6c86a', '#9fd0f0', '#f3a0a0', '#b8e0a0', '#d8c0f0'];
      for (let r = 0; r < 9; r++) for (let k = 0; k < 6; k++) {
        if (r < 2 && k > 0 && k < 5) continue;
        x.fillStyle = cols[(r + k) % cols.length];
        x.fillRect(16 + k * 38, 90 + r * 44, 34, 40);
        x.fillStyle = '#333';
        x.font = `bold 14px ${FONT}`;
        x.textAlign = 'center';
        x.fillText(['H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar'][(r * 6 + k) % 18], 33 + k * 38, 112 + r * 44);
      }
      break;
    }
    case 'lomonosov': portrait(x, '#e6e1d6', '#3d5a8a', 'М. В. Ломоносов'); break;
    case 'pushkin': portrait(x, '#3a2a1c', '#232323', 'А. С. Пушкин'); break;
    case 'rules': {
      bg('#fff6d8');
      frame('#e0a020');
      title(x, 'ПРАВИЛА', 50, 28, '#a04010');
      title(x, 'для учащихся', 82, 18, '#a04010');
      lines(x, ['1. Не бегай по коридору', '2. Уважай старших', '3. Береги школу', '4. Сменная обувь!', '5. Телефон — на беззвучный'], 150, 50, 16);
      break;
    }
    case 'timetable': {
      bg('#eaf2ff');
      title(x, 'РАСПИСАНИЕ', 40, 24, '#1d3f80');
      title(x, 'ЗВОНКОВ', 70, 24, '#1d3f80');
      const t = ['8:30 – 9:15', '9:25 – 10:10', '10:30 – 11:15', '11:35 – 12:20', '12:30 – 13:15', '13:25 – 14:10'];
      t.forEach((s, i) => {
        x.fillStyle = i % 2 ? '#d5e3fb' : '#c2d6f8';
        x.fillRect(16, 110 + i * 56, 224, 50);
        x.fillStyle = '#1d3f80';
        x.font = `bold 18px ${FONT}`;
        x.textAlign = 'left';
        x.fillText(`${i + 1} урок`, 26, 136 + i * 56);
        x.textAlign = 'right';
        x.fillText(s, 230, 136 + i * 56);
      });
      break;
    }
    case 'fire': {
      bg('#ffffff');
      x.fillStyle = '#d62c2c';
      x.fillRect(0, 0, w, 90);
      title(x, 'ПРИ ПОЖАРЕ', 45, 26, '#ffffff');
      lines(x, ['• Звони 101 или 112', '• Пригнись: дым', '  собирается вверху', '• Закрой рот тканью', '• Не пользуйся лифтом', '• Выходи к месту', '  сбора на стадионе'], 140, 44, 17);
      x.fillStyle = '#d62c2c';
      x.beginPath(); x.moveTo(128, 400); x.quadraticCurveTo(80, 460, 128, 500); x.quadraticCurveTo(176, 460, 128, 400); x.fill();
      break;
    }
    case 'map': {
      bg('#bfe0f5');
      x.fillStyle = '#9ccc7a';
      x.beginPath();
      x.moveTo(20, 200); x.bezierCurveTo(60, 120, 180, 110, 236, 170);
      x.bezierCurveTo(250, 260, 200, 330, 150, 300); x.bezierCurveTo(100, 360, 40, 300, 20, 200);
      x.fill();
      x.fillStyle = '#e8c070';
      x.beginPath(); x.ellipse(120, 230, 40, 30, 0.3, 0, Math.PI * 2); x.fill();
      title(x, 'ФИЗИЧЕСКАЯ', 420, 20);
      title(x, 'КАРТА РОССИИ', 448, 20);
      break;
    }
    case 'gazette': {
      bg('#ffffff');
      title(x, 'СТЕНГАЗЕТА', 34, 24, '#c0262a');
      title(x, '«Школьный вестник»', 64, 16, '#555');
      x.fillStyle = '#ffd36b'; x.fillRect(20, 90, 100, 90);
      x.fillStyle = '#9fd0f0'; x.fillRect(136, 90, 100, 130);
      x.fillStyle = '#f3a0a0'; x.fillRect(20, 240, 216, 80);
      lines(x, ['Наши в финале по', 'баскетболу!', 'Осенний бал — 25.10', 'Субботник в парке'], 360, 30, 15);
      break;
    }
    case 'math': {
      bg('#f2fff0');
      title(x, 'ТАБЛИЦА', 36, 24, '#2a6a2a');
      title(x, 'УМНОЖЕНИЯ', 64, 24, '#2a6a2a');
      for (let i = 2; i <= 9; i++) {
        x.fillStyle = '#2a2a2a';
        x.font = `16px ${FONT}`;
        x.textAlign = 'left';
        x.fillText(`${i} × ${i} = ${i * i}`, 30, 110 + (i - 2) * 48);
        x.fillText(`${i} × 7 = ${i * 7}`, 140, 110 + (i - 2) * 48);
      }
      break;
    }
    case 'sport': {
      bg('#1d4fa0');
      title(x, 'ГТО', 70, 64, '#ffd34a');
      title(x, 'Готов к труду', 140, 20, '#ffffff');
      title(x, 'и обороне!', 166, 20, '#ffffff');
      x.strokeStyle = '#ffd34a'; x.lineWidth = 10;
      x.beginPath(); x.arc(128, 320, 70, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#ffffff';
      x.beginPath(); x.arc(128, 300, 16, 0, Math.PI * 2); x.fill();
      x.fillRect(120, 315, 16, 50);
      break;
    }
    case 'library': {
      bg('#f7efe2');
      title(x, 'ЧИТАЙ!', 60, 44, '#7a2430');
      for (let i = 0; i < 6; i++) {
        x.fillStyle = ['#7a2430', '#1d4fa0', '#2a6a2a', '#c99a2a', '#5a2a7a', '#333'][i];
        x.fillRect(40 + i * 30, 150, 26, 160 + (i % 2) * 20);
      }
      title(x, 'Книга — лучший', 400, 18, '#333');
      title(x, 'подарок', 426, 18, '#333');
      break;
    }
    case 'menu': {
      bg('#fffaf0');
      title(x, 'МЕНЮ', 40, 32, '#b04020');
      lines(x, ['Каша овсяная ...... 35', 'Омлет ............... 40', 'Котлета с пюре ... 85', 'Суп куриный ....... 50', 'Компот .............. 20', 'Булочка ............ 25', 'Чай с лимоном .... 15'], 110, 50, 16);
      break;
    }
    case 'alarm': {
      bg('#c41e1e');
      title(x, 'ПОЖАРНАЯ', 70, 26, '#ffffff');
      title(x, 'ТРЕВОГА', 104, 26, '#ffffff');
      x.fillStyle = '#ffffff';
      x.fillRect(48, 160, 160, 160);
      x.fillStyle = '#c41e1e';
      x.beginPath(); x.arc(128, 240, 48, 0, Math.PI * 2); x.fill();
      title(x, 'Разбей стекло,', 380, 18, '#ffffff');
      title(x, 'нажми кнопку', 406, 18, '#ffffff');
      break;
    }
    case 'hands': {
      bg('#e8f6ff');
      title(x, 'МОЙ РУКИ', 50, 28, '#1d6fa0');
      title(x, 'перед едой!', 84, 18, '#1d6fa0');
      x.fillStyle = '#f0c8a8';
      x.beginPath(); x.ellipse(90, 260, 40, 70, -0.3, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(166, 260, 40, 70, 0.3, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(120,190,255,0.8)';
      for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(60 + Math.random() * 140, 170 + Math.random() * 200, 8, 0, Math.PI * 2); x.fill(); }
      break;
    }
    case 'achievements': {
      bg('#fff8e6');
      title(x, 'НАШИ', 40, 26, '#a06a10');
      title(x, 'ДОСТИЖЕНИЯ', 70, 26, '#a06a10');
      for (let i = 0; i < 3; i++) {
        x.fillStyle = ['#d9b13b', '#c0c0c8', '#cd7f32'][i];
        x.beginPath(); x.arc(60 + i * 68, 160, 26, 0, Math.PI * 2); x.fill();
      }
      lines(x, ['1 место — олимпиада', 'по математике', '2 место — «Весёлые', 'старты»', 'Лучшая школа', 'района — 2025'], 240, 38, 16);
      break;
    }
    default: bg('#ffffff');
  }
}

// ---------------------------------------------------------------- таблички и вывески
// Атлас 1024×2048: строки высотой 64 — таблички кабинетов, «ВЫХОД», вывеска школы.
function buildSignAtlas() {
  const [c, x] = canvas(1024, 2048);
  const rects = {};
  let row = 0;
  const add = (key, draw, rows = 1) => {
    const y = row * 64;
    x.save();
    x.translate(0, y);
    draw(x, 1024, 64 * rows);
    x.restore();
    rects[key] = [0, 1 - (y + 64 * rows) / 2048, 1, 1 - y / 2048];
    row += rows;
  };
  const plate = (num, name) => (ctx, w, h) => {
    ctx.fillStyle = '#1d3f80';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 4, 150, h - 8);
    ctx.fillStyle = '#1d3f80';
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, 79, h / 2 + 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 38px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(name, 176, h / 2 + 2, w - 190);
  };
  add('exit', (ctx, w, h) => {
    ctx.fillStyle = '#12a150';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 50px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ВЫХОД  ➜', w / 2, h / 2 + 2);
  });
  add('school', (ctx, w, h) => {
    ctx.fillStyle = '#f4f1e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d3f80';
    ctx.font = `bold 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('МБОУ «СРЕДНЯЯ ШКОЛА № 17»', w / 2, h / 2 + 2);
  });
  add('assembly', (ctx, w, h) => {
    ctx.fillStyle = '#12a150';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 42px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('МЕСТО СБОРА ПРИ ЭВАКУАЦИИ', w / 2, h / 2 + 2);
  });
  add('welcome', (ctx, w, h) => {
    ctx.fillStyle = '#ffd34a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7a2a10';
    ctx.font = `bold 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ДОБРО ПОЖАЛОВАТЬ!', w / 2, h / 2 + 2);
  });
  add('wcm', plate('М', 'Туалет для мальчиков'));
  add('wcf', plate('Ж', 'Туалет для девочек'));
  add('gym', plate('С', 'Спортзал'));
  add('cafe', plate('Ст', 'Столовая'));
  add('nurse', plate('+', 'Медпункт'));
  add('principal', plate('Д', 'Директор'));
  add('library', plate('Б', 'Библиотека'));
  add('teachers', plate('У', 'Учительская'));
  add('assemblyhall', plate('★', 'Актовый зал'));
  add('storage', plate('П', 'Подсобка'));
  for (const [num, name] of [['101', 'Русский язык'], ['102', 'Английский язык'], ['103', 'История'], ['104', 'Физика'],
    ['105', 'Информатика'], ['201', 'Химия'], ['202', 'Математика'], ['203', 'Литература'], ['204', 'География'],
    ['205', 'Алгебра'], ['206', 'Физика'], ['207', 'Биология'], ['208', 'Музыка'], ['209', 'Английский язык']]) {
    add('room' + num, plate(num, name));
  }
  return { canvas: c, rect: (k) => rects[k] ?? rects.exit };
}
