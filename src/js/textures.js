import * as THREE from 'three';
import { createRng } from './utils.js';

// Все текстуры рисуются процедурно на <canvas> — никаких внешних файлов.
// Чтобы заменить на настоящие картинки: THREE.TextureLoader().load('assets/road.png')
// и те же настройки wrap/colorSpace, что в finish().

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, w, h, rng, count, minL, maxL, alpha, size = 1) {
  for (let i = 0; i < count; i++) {
    const l = Math.floor(rng.range(minL, maxL));
    ctx.fillStyle = `rgba(${l},${l},${l},${alpha})`;
    ctx.fillRect(rng.range(0, w), rng.range(0, h), size, size);
  }
}

export function createTextures(renderer) {
  const rng = createRng(99);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const finish = (c, repeat = true) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };

  // --- Асфальт (перекрёстки, парковки) ---------------------------------
  const drawAsphalt = (ctx, w, h) => {
    ctx.fillStyle = '#3d3f44';
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rng, 9000, 30, 110, 0.35);
    speckle(ctx, w, h, rng, 400, 20, 40, 0.25, 3);
  };
  const [ac, actx] = canvas(256, 256);
  drawAsphalt(actx, 256, 256);
  const asphalt = finish(ac);

  // --- Дорога: U — поперёк (14 м), V — вдоль (тайл 8 м) ----------------
  const [rc, rctx] = canvas(256, 256);
  drawAsphalt(rctx, 256, 256);
  // Колеи — чуть темнее по центру полос.
  rctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (const u of [0.125, 0.375, 0.625, 0.875]) rctx.fillRect(u * 256 - 12, 0, 24, 256);
  rctx.fillStyle = '#d8d8d0';
  rctx.fillRect(7, 0, 5, 256);          // край
  rctx.fillRect(244, 0, 5, 256);
  rctx.fillRect(62, 0, 4, 96);          // прерывистая разметка (3 м штрих)
  rctx.fillRect(190, 0, 4, 96);
  rctx.fillStyle = '#d6b23c';
  rctx.fillRect(121, 0, 4, 256);        // двойная сплошная
  rctx.fillRect(131, 0, 4, 256);
  const road = finish(rc);
  road.wrapS = THREE.ClampToEdgeWrapping;

  // --- Тротуарная плитка (тайл 4 м, плитка 1 м) ------------------------
  const [sc, sctx] = canvas(256, 256);
  sctx.fillStyle = '#a8a59d';
  sctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const l = Math.floor(rng.range(150, 185));
      sctx.fillStyle = `rgba(${l},${l - 3},${l - 8},0.5)`;
      sctx.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  speckle(sctx, 256, 256, rng, 5000, 110, 200, 0.25);
  sctx.fillStyle = '#7e7b74';
  for (let i = 0; i < 4; i++) {
    sctx.fillRect(i * 64, 0, 2, 256);
    sctx.fillRect(0, i * 64, 256, 2);
  }
  const sidewalk = finish(sc);

  // --- Трава (тайл 8 м) ------------------------------------------------
  const [gc, gctx] = canvas(256, 256);
  gctx.fillStyle = '#58803f';
  gctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) {
    const g = Math.floor(rng.range(90, 150));
    gctx.fillStyle = `rgba(${Math.floor(g * 0.55)},${g},${Math.floor(g * 0.35)},0.5)`;
    gctx.fillRect(rng.range(0, 256), rng.range(0, 256), 1, rng.range(2, 4));
  }
  const grass = finish(gc);

  // --- Фасад с окнами: 8 колонок x 8 этажей (тайл 32 x 28 м) ----------
  // Стены почти белые — итоговый цвет здания задаётся vertex color.
  const [wc, wctx] = canvas(512, 512);
  wctx.fillStyle = '#e2e0dc';
  wctx.fillRect(0, 0, 512, 512);
  speckle(wctx, 512, 512, rng, 6000, 170, 240, 0.25);
  for (let row = 0; row < 8; row++) {
    const cy = row * 64;
    wctx.fillStyle = 'rgba(0,0,0,0.10)';           // межэтажный пояс
    wctx.fillRect(0, cy + 58, 512, 6);
    for (let col = 0; col < 8; col++) {
      const cx = col * 64;
      wctx.fillStyle = '#8f8d88';                   // рама
      wctx.fillRect(cx + 11, cy + 12, 42, 38);
      const lit = rng.chance(0.12);
      const grad = wctx.createLinearGradient(0, cy + 14, 0, cy + 48);
      if (lit) {
        grad.addColorStop(0, '#f6e3a8');
        grad.addColorStop(1, '#d9b870');
      } else {
        const b = Math.floor(rng.range(35, 70));
        grad.addColorStop(0, `rgb(${b + 40},${b + 55},${b + 70})`);
        grad.addColorStop(1, `rgb(${b},${b + 10},${b + 20})`);
      }
      wctx.fillStyle = grad;
      wctx.fillRect(cx + 13, cy + 14, 38, 34);
      wctx.fillStyle = '#8f8d88';                   // импост
      wctx.fillRect(cx + 31, cy + 14, 2, 34);
    }
  }
  const windows = finish(wc);

  return { asphalt, road, sidewalk, grass, windows };
}
