// заглушка API images из AutoJs6 поверх массива пикселей: проверяем геометрию и знаки сдвига фона
function img(w, h, f) { const d = new Int32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = f(x, y); return { w, h, d, getWidth() { return w; }, getHeight() { return h; }, recycle() { this.dead = true; } }; }
global.images = {
  pixel(im, x, y) { if (im.dead) throw new Error("recycled"); return im.d[y * im.w + x]; },
  clip(im, x, y, w, h) { return img(w, h, (i, j) => im.d[(y + j) * im.w + (x + i)]); },
  matchTemplate(im, tpl, o) {
    const [rx, ry, rw, rh] = o.region; let best = null;
    for (let y = ry; y + tpl.h <= ry + rh; y++) for (let x = rx; x + tpl.w <= rx + rw; x++) {
      let sse = 0; for (let j = 0; j < tpl.h; j += 2) for (let i = 0; i < tpl.w; i += 2) { const a = im.d[(y + j) * im.w + x + i] & 255, b = tpl.d[j * tpl.w + i] & 255; sse += (a - b) * (a - b); }
      if (!best || sse < best.sse) best = { sse, point: { x, y } };
    }
    return { best: () => best && best.sse / (tpl.w * tpl.h / 4) < 30 ? { point: best.point, similarity: 0.9 } : null };
  }
};
global.floaty = undefined;
const bot = require("../bss_ai_gather.js");
const assert = require("assert");
const tex = (x, y) => { const v = (Math.sin(x * 0.37) * 60 + Math.cos(y * 0.29 + x * 0.11) * 50 + Math.sin((x + y) * 0.07) * 30 + 128) | 0; return (0xFF << 24) | (v << 16) | (v << 8) | v; };
const W = 480, H = 216;
for (const [dx, dy] of [[0, 0], [7, 0], [-12, 5], [20, -14], [-3, -25]]) {
  const a = img(W, H, tex), b = img(W, H, (x, y) => tex(x - dx, y - dy)); // мир сдвинулся на (dx, dy)
  const patches = bot.clipBgPatches(a, []);
  assert.strictEqual(patches.length, 2);
  const r = bot.matchBgPatches(patches, b);
  assert.ok(r && r.dx === dx && r.dy === dy, `ждали ${dx},${dy} получили ${JSON.stringify(r)}`);
  console.log("OK  сдвиг", dx, dy, "→", r.dx, r.dy);
}
// однотонное поле — кусочки не берутся
assert.deepStrictEqual(bot.clipBgPatches(img(W, H, () => 0xFF4C8C3C | 0), []).filter(Boolean).length, 0);
console.log("OK  однотонное поле: кусочков нет");
// кнопка поверх левого места — берётся другое место
const ps = bot.clipBgPatches(img(W, H, tex), [{ x: 0.22 * W, y: 0.55 * H, r: 30 }]);
assert.ok(ps.every(p => p && !bot.rectHitsZone(p.x, p.y, 48, 35, { x: 0.22 * W, y: 0.55 * H, r: 30 })));
console.log("OK  место под кнопкой пропущено:", ps.map(p => p.x + "," + p.y).join(" "));
// кусочки не согласны (через один пролетела пчела) — сдвига нет
const a2 = img(W, H, tex), b2 = img(W, H, (x, y) => (x < W / 2 ? tex(x - 5, y) : tex(x + 9, y)));
assert.strictEqual(bot.matchBgPatches(bot.clipBgPatches(a2, []), b2), null);
console.log("OK  кусочки не согласны → сдвиг не засчитан");
