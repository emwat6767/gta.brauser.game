import { C } from './prison-detail-lib.js';

// Общая мебель и оборудование второй партии деталей (админка, шлюз, свидания, лазарет, карцер, двор).
// Все функции принимают рамку f (prison-props.js) и рисуют в её осях; y — от уровня пола рамки.

export function makeFurniture(kit, rng) {
  const pick = (a) => a[Math.floor(rng.next() * a.length)];

  // Офисное кресло: пятилучевая звезда на колёсиках, газлифт, сиденье, спинка, подлокотники. Перёд — +z.
  const chair = (f, x, z, color = '#2b2f36', arms = true, tall = false) => {
    f.cyl(0.035, 0.045, 0.3, x, 0.25, z, C.steelDk, 8, 'steel');
    for (let k = 0; k < 5; k++) {
      const a = (k * Math.PI * 2) / 5, ex = x + Math.sin(a) * 0.27, ez = z + Math.cos(a) * 0.27;
      f.bar(x, 0.1, z, ex, 0.07, ez, 0.03, C.steelDk, 'steel');
      f.cyl(0.028, 0.028, 0.05, ex, 0.03, ez, '#15171a', 6);
    }
    f.box(0.52, 0.09, 0.5, x, 0.46, z + 0.02, color);
    f.box(0.48, tall ? 0.7 : 0.5, 0.09, x, tall ? 0.9 : 0.78, z - 0.24, color);
    if (arms) for (const s of [-1, 1]) {
      f.box(0.05, 0.04, 0.34, x + s * 0.28, 0.65, z - 0.02, '#15171a');
      f.box(0.03, 0.18, 0.03, x + s * 0.28, 0.55, z - 0.1, C.steelDk, 'steel');
    }
  };

  // Монитор на ножке: y — уровень стола.
  const monitor = (f, x, y, z, glow = 'glowS', w = 0.5, h = 0.3) => {
    f.box(0.2, 0.02, 0.14, x, y + 0.01, z, '#15171a');
    f.box(0.04, 0.1, 0.03, x, y + 0.07, z - 0.01, '#15171a');
    f.box(w + 0.03, h + 0.03, 0.04, x, y + 0.1 + h / 2, z, '#15171a');
    f.box(w, h, 0.01, x, y + 0.1 + h / 2, z + 0.022, '#8fb4ff', glow);
  };
  const keyboard = (f, x, y, z) => {
    f.box(0.42, 0.02, 0.14, x, y + 0.01, z, '#2a2d33');
    f.box(0.38, 0.006, 0.1, x, y + 0.024, z, '#515763');
  };
  const phone = (f, x, y, z) => {
    f.box(0.2, 0.05, 0.18, x, y + 0.025, z, '#20242a');
    f.box(0.04, 0.04, 0.22, x - 0.05, y + 0.07, z, '#15171a');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) f.box(0.025, 0.008, 0.02, x + 0.04 + c * 0.03, y + 0.053, z - 0.04 + r * 0.03, '#cfd6dc');
  };
  const mug = (f, x, y, z, color = C.white) => {
    f.cyl(0.036, 0.032, 0.09, x, y + 0.045, z, color, 8);
    f.box(0.02, 0.05, 0.012, x + 0.045, y + 0.05, z, color);
  };
  const papers = (f, x, y, z, n = 3) => {
    for (let k = 0; k < n; k++) f.box(0.21, 0.004, 0.3, x + (rng.next() - 0.5) * 0.04, y + 0.003 + k * 0.004, z + (rng.next() - 0.5) * 0.04, k % 2 ? '#f0ecdd' : '#e4e8ee');
  };

  // Стол: столешница, тумбы с ящиками со стороны сидящего (-z), царга спереди (+z).
  const desk = (f, x, z, { w = 1.6, d = 0.8, top = C.woodDk, body = '#5a4630', metal = false } = {}) => {
    const t = metal ? 'steel' : 'matte';
    f.box(w, 0.05, d, x, 0.755, z, top, t);
    for (const s of [-1, 1]) {
      const px = x + s * (w / 2 - 0.25);
      f.box(0.46, 0.72, d - 0.08, px, 0.37, z, body, t);
      for (let k = 0; k < 3; k++) {
        f.box(0.4, 0.2, 0.012, px, 0.2 + k * 0.23, z - d / 2 + 0.036, k % 2 ? '#6a553a' : '#6f5a3e', t);
        f.box(0.14, 0.02, 0.02, px, 0.22 + k * 0.23, z - d / 2 + 0.03, C.steelLt, 'steel');
      }
    }
    f.box(w - 0.95, 0.5, 0.03, x, 0.48, z + d / 2 - 0.1, body, t);
  };

  // Флаг на стойке: перед тканью — +z. kind: 'us' | 'state' | 'prison'.
  const flag = (f, x, z, kind = 'us', h = 2.35) => {
    f.cyl(0.045, 0.06, 0.06, x, 0.03, z, '#3a3e44', 10, 'steel');
    f.cyl(0.015, 0.015, h, x, h / 2, z, '#d8b14a', 6, 'steel');
    f.sph(0.03, x, h + 0.02, z, '#e4c15a', 1, 1, 1, 'steel', 8);
    const cw = 0.95, ch = 0.58, cx = x + cw / 2 + 0.02, top = h - 0.06;
    if (kind === 'us') {
      for (let k = 0; k < 7; k++) f.box(cw, ch / 7, 0.014, cx, top - ch / 14 - k * (ch / 7), z, k % 2 ? '#f0f0ea' : '#b3222c');
      f.box(cw * 0.42, ch * 4 / 7, 0.02, x + 0.02 + cw * 0.21, top - ch * 2 / 7, z, '#243a73');
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) f.box(0.025, 0.025, 0.024, x + 0.09 + c * 0.09, top - 0.07 - r * 0.1, z, '#f2f2f2');
    } else if (kind === 'state') {
      f.box(cw, ch, 0.014, cx, top - ch / 2, z, '#7a1d22');
      f.box(cw, ch * 0.14, 0.02, cx, top - ch / 2, z, '#e8d9a8');
      f.sph(0.09, cx, top - ch / 2, z, '#e8c23a', 1, 1, 0.12, 'matte', 8);
    } else {
      f.box(cw, ch, 0.014, cx, top - ch / 2, z, '#1b1f27');
      f.box(cw * 0.7, ch * 0.12, 0.02, cx, top - ch * 0.35, z, '#d9b13b');
      f.box(cw * 0.5, ch * 0.08, 0.02, cx, top - ch * 0.65, z, '#d9b13b');
    }
  };

  // Ряд шкафчиков вдоль оси x рамки (двери смотрят в +z). x — центр первого шкафчика.
  const lockers = (f, x, z, n, { w = 0.4, h = 1.85, deep = 0.45, color = '#59687a' } = {}) => {
    const total = n * w, cx = x + (n - 1) * w / 2;
    f.box(total, h, deep, cx, h / 2, z, color, 'steel');
    f.box(total + 0.04, 0.05, deep + 0.03, cx, h + 0.025, z, '#3f4a57', 'steel');
    f.box(total + 0.02, 0.1, deep + 0.02, cx, 0.05, z, '#2b323a', 'steel');
    for (let i = 0; i <= n; i++) f.box(0.014, h - 0.14, 0.008, x - w / 2 + i * w, h / 2 + 0.03, z + deep / 2 + 0.003, '#1d242c');
    for (let i = 0; i < n; i++) {
      const lx = x + i * w;
      for (let k = 0; k < 3; k++) f.box(w - 0.14, 0.014, 0.008, lx, 1.55 + k * 0.07, z + deep / 2 + 0.003, '#1d242c');
      for (let k = 0; k < 3; k++) f.box(w - 0.14, 0.014, 0.008, lx, 0.3 + k * 0.07, z + deep / 2 + 0.003, '#1d242c');
      f.box(0.025, 0.12, 0.03, lx + w * 0.28, 1.0, z + deep / 2 + 0.012, C.steelLt, 'steel');
      f.box(0.1, 0.045, 0.008, lx, 1.4, z + deep / 2 + 0.003, '#c9c2a8');
    }
  };

  // Стеллаж из стальных стоек: полки вдоль x, ящики/коробки на полках. Перёд — +z.
  const shelving = (f, x, z, w = 1.6, d = 0.5, tiers = 4, h = 1.9, fill = true, palette = ['#b58f5a', '#8a6a45', '#5a7a9a', '#c9c2a8']) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.box(0.045, h, 0.045, x + sx * (w / 2 - 0.022), h / 2, z + sz * (d / 2 - 0.022), '#3f6a9a', 'steel');
    for (let t = 0; t < tiers; t++) {
      const y = 0.12 + t * ((h - 0.2) / (tiers - 1));
      f.box(w, 0.03, d, x, y, z, '#8e98a3', 'steel');
      if (fill) {
        let xx = x - w / 2 + 0.1;
        while (xx < x + w / 2 - 0.25) {
          const bw = 0.2 + rng.next() * 0.28, bh = 0.14 + rng.next() * 0.2;
          f.box(bw, bh, d - 0.12, xx + bw / 2, y + 0.015 + bh / 2, z, pick(palette));
          xx += bw + 0.03;
        }
      }
    }
  };

  // Круглый стальной табурет-грибок на ножке (привинчен к полу).
  const stool = (f, x, z, h = 0.46, color = '#8a929b') => {
    f.cyl(0.19, 0.19, 0.05, x, h, z, color, 12, 'steel');
    f.cyl(0.04, 0.05, h - 0.03, x, h / 2 - 0.01, z, C.steelDk, 8, 'steel');
    f.cyl(0.14, 0.14, 0.02, x, 0.01, z, C.steelDk, 10, 'steel');
  };

  // Стопка пластиковых ящиков/коробок.
  const crates = (f, x, z, n = 3, color = '#b58f5a') => {
    for (let k = 0; k < n; k++) {
      f.box(0.5, 0.3, 0.38, x + (rng.next() - 0.5) * 0.04, 0.15 + k * 0.3, z, k % 2 ? color : '#a07e4c');
      f.box(0.44, 0.03, 0.34, x, 0.3 + k * 0.3, z, '#8a6a45');
    }
  };

  // Белая меловая лента с жёлто-чёрными полосами (на пол): список прямоугольников по x, ширина полосы s.
  const hazard = (paint, x0, z0, x1, z1, y, s = 0.28) => {
    paint.flat(x0, z0, x1, z1, y, '#23262b');
    for (let x = x0 + s; x < x1 - s * 0.5; x += s * 2) paint.flat(x, z0, Math.min(x + s, x1), z1, y + 0.004, '#e8c23a');
  };

  // Дорожный конус.
  const cone = (f, x, z, color = '#e2670a') => {
    f.box(0.32, 0.03, 0.32, x, 0.015, z, '#2a2c30');
    f.cone(0.12, 0.56, x, 0.31, z, color, 10);
    f.cyl(0.075, 0.095, 0.09, x, 0.3, z, '#f0f0ea', 10);
  };

  // Ведро со шваброй на колёсах.
  const mopBucket = (f, x, z) => {
    f.box(0.4, 0.26, 0.5, x, 0.2, z, '#e8c23a');
    f.box(0.34, 0.03, 0.2, x, 0.34, z + 0.14, '#c9a227');
    f.cyl(0.015, 0.015, 1.15, x - 0.1, 0.78, z - 0.12, '#8a6a45', 6);
    f.cyl(0.07, 0.04, 0.2, x - 0.1, 1.38, z - 0.12, '#cfc7a8', 8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) f.cyl(0.025, 0.025, 0.03, x + sx * 0.17, 0.02, z + sz * 0.2, '#15171a', 6);
  };

  return { pick, chair, monitor, keyboard, phone, mug, papers, desk, flag, lockers, shelving, stool, crates, hazard, cone, mopBucket };
}
