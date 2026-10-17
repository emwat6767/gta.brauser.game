import { createRng } from './utils.js';

// Военная техника для режима «Война стран» (формат профилей — как в vehicle-models.js).
//   jeep  — армейский джип: открытый кузов, зенитный пулемёт на турели, запаска, канистры
//   apc   — БТР: восемь колёс, башня с крупнокалиберным пулемётом, до 7 бойцов внутри
//   tank  — танк: гусеницы, поворот на месте, башня с орудием и спаренным пулемётом
//   truck — армейский грузовик: тент, 8 мест, возит взвод на фронт
//   heli  — ударный вертолёт (helicopter.js): ракеты и пулемёт, винт крутится
// Цвет кузова — форма страны (paintMat), roof-детали красятся цветом страны (livery.roof): опознавательные панели на крыше,
// stripe-пятна — камуфляж (livery.stripe). turret — описание башни для military.js, spec.team — игровая сторона.

// Камуфляж: тёмные прямоугольные пятна по бортам, капоту и крыше (детерминированно по типу).
function camo(c, seed, { sides = 14, sx = 1.2, sy = 0.6, sz = 1.4, z0 = c.zr + 0.3, z1 = c.zf - 0.3, y0 = 0.7, y1 = 1.4, top = 0 } = {}) {
  const rng = createRng(seed);
  const hw = c.W / 2 + 0.07;
  for (let i = 0; i < sides; i++) {
    const x = (i % 2 ? 1 : -1) * hw;
    c.stripe.push(c.box(0.03, rng.range(0.15, sy), rng.range(0.4, sz), x, rng.range(y0, y1), rng.range(z0, z1)));
  }
  for (let i = 0; i < top; i++) c.stripe.push(c.box(rng.range(0.4, sx), 0.03, rng.range(0.5, sz), rng.range(-hw + 0.3, hw - 0.3), c.topY + 0.02, rng.range(z0, z1)));
}

export const MILITARY_TYPES = {
  jeep: {
    name: 'Армейский джип', camScale: 1.1, speed: 0.85, accel: 1.1, grip: 1.1, height: 1.7, hp: 220, width: 2.05, wheelBase: 3.1, wheelScale: 1.3,
    circles: [-1.5, 0, 1.5], radius: 1.1, lightY: 0.85, open: true, bulletResist: 0.55, military: true,
    body: [[-2.4, 0.48], [2.3, 0.48], [2.44, 0.6], [2.42, 0.95], [1.5, 1.08], [1.0, 1.1], [-2.3, 1.1], [-2.44, 0.98], [-2.46, 0.62]],
    cabin: [[0.95, 1.1], [1.3, 1.1], [1.12, 1.62], [1.05, 1.62]],
    driver: [0.5, 0.55, 0.14], dash: 1.12,
    seats: [[-0.5, 0.55, 0.14], [0.5, -0.75, 0.14], [-0.5, -0.75, 0.14]],
    doors: [[-1.9, 0.55], [1.9, -0.75], [-1.9, -0.75]],
    turret: { id: 'jeep', pivot: [0, 1.28, -0.55] },
    livery: { stripe: 0x3d4a2a },
    build(c) {
      c.topY = 1.1;
      camo(c, 11, { sides: 12, y0: 0.62, y1: 1.0, top: 0 });
      c.trim.push({ geometry: c.cyl(0.42, 0.42, 0.3, 14, [Math.PI / 2, 0, 0]).translate(0, 1.0, c.zr - 0.2), color: 0x1b1b1b });   // запаска
      c.trim.push({ geometry: c.cyl(0.2, 0.2, 0.32, 10, [Math.PI / 2, 0, 0]).translate(0, 1.0, c.zr - 0.2), color: 0x777b80 });
      c.trim.push({ geometry: c.box(0.3, 0.42, 0.14, 0.82, 1.3, -1.7), color: 0x4a5a30 });                    // канистры
      c.trim.push({ geometry: c.box(0.3, 0.42, 0.14, -0.82, 1.3, -1.7), color: 0x4a5a30 });
      c.trim.push({ geometry: c.box(2.1, 0.1, 0.12, 0, 0.58, c.zf + 0.1), color: 0x2a2a2a });                  // силовой бампер
      c.trim.push({ geometry: c.cyl(0.015, 0.015, 1.5, 5).translate(-0.9, 1.9, -1.8), color: 0x111111 });       // антенна
      c.trim.push({ geometry: c.box(0.62, 0.06, 0.5, 0, 1.04, -0.55), color: 0x222222 });                       // платформа под пулемёт
      for (const x of [-0.9, 0.9]) c.trim.push({ geometry: c.box(0.1, 0.5, 0.1, x, 1.35, 0.95), color: 0x2a2a2a });   // дуги безопасности
      c.roof.push(c.box(0.9, 0.03, 0.7, 0, 1.12, 0.25));                                                        // опознавательная панель на капоте
    },
  },

  apc: {
    name: 'БТР', camScale: 1.5, camHeight: 0.8, speed: 0.55, accel: 0.7, grip: 1.3, height: 2.5, hp: 420, width: 2.6, wheelBase: 5.6, wheelScale: 1.75,
    axles: [2.55, 0.85, -0.95, -2.75], circles: [-2.8, -1.4, 0, 1.4, 2.8], radius: 1.45, cabin: null, interior: false, noDefaultLights: true,
    bulletResist: 0.4, noCarjack: true, military: true, track: 1.18,
    body: [[-3.75, 0.62], [3.35, 0.62], [3.8, 0.95], [3.8, 1.38], [2.7, 1.88], [-3.2, 2.0], [-3.8, 1.75], [-3.85, 1.0]],
    driver: [0.55, 2.1, 0.88], dash: 1.4,
    seats: [[-0.55, 2.1, 0.88], [0.8, 0.0, 0.88], [-0.8, 0.0, 0.88], [0.8, -1.3, 0.88], [-0.8, -1.3, 0.88], [0.8, -2.6, 0.88], [-0.8, -2.6, 0.88]],
    doors: [[-2.0, 1.2], [2.0, -0.2], [-2.0, -0.2], [2.0, -1.5], [-2.0, -1.5], [2.0, -2.8], [-2.0, -2.8]],
    turret: { id: 'apc', pivot: [0, 2.0, 0.55] },
    livery: { stripe: 0x39452a },
    build(c) {
      c.topY = 2.0;
      camo(c, 23, { sides: 18, sy: 0.7, sz: 1.8, y0: 0.9, y1: 1.8, top: 6, sx: 1.4 });
      const dark = 0x1d2018;
      // фары, люки водителя, бойницы, борта над колёсами
      for (const x of [-0.95, 0.95]) c.trim.push({ geometry: c.box(0.34, 0.16, 0.08, x, 1.12, c.zf - 0.02), color: 0xfff0b0 });
      c.trim.push({ geometry: c.box(1.5, 0.28, 0.06, 0.2, 1.52, 3.0), color: 0x15191a });                       // смотровые стёкла водителя
      for (const z of [1.2, -0.2, -1.5, -2.8]) for (const x of [-c.sx, c.sx]) c.trim.push({ geometry: c.box(0.04, 0.2, 0.34, x, 1.6, z), color: 0x15191a }); // бойницы
      for (const x of [-c.sx, c.sx]) c.trim.push({ geometry: c.box(0.06, 1.3, 0.04, x, 1.35, -2.0), color: dark });    // дверь
      c.trim.push({ geometry: c.box(2.7, 0.18, 0.16, 0, 0.78, c.zf + 0.05), color: 0x2a2a2a });                  // бампер с лебёдкой
      c.trim.push({ geometry: c.box(2.7, 0.22, 0.16, 0, 0.78, c.zr - 0.05), color: 0x2a2a2a });
      for (const x of [-1.0, 1.0]) c.trim.push({ geometry: c.box(0.7, 0.05, 0.9, x, 2.03, -2.5), color: dark });       // люки десанта
      for (const x of [-1.3, 1.3]) c.trim.push({ geometry: c.box(0.1, 0.12, 4.6, x, 0.98, -0.2), color: dark });       // брызговики над колёсами
      c.trim.push({ geometry: c.cyl(0.3, 0.3, 0.1, 12).translate(0, 2.03, 0.55), color: 0x222222 });             // погон башни
      c.roof.push(c.box(1.4, 0.03, 1.2, 0, 2.02, -1.4));                                                         // опознавательная панель
      c.roof.push(c.box(1.2, 0.03, 0.8, 0, 1.64, 3.1));
    },
  },

  tank: {
    name: 'Танк', camScale: 1.6, camHeight: 1.0, speed: 0.42, accel: 0.55, grip: 2.0, height: 2.6, hp: 760, width: 3.2, wheelBase: 5.0, noWheels: true, noArch: true,
    circles: [-2.6, -0.9, 0.9, 2.6], radius: 1.75, cabin: null, interior: false, noDefaultLights: true,
    bulletResist: 0.12, noCarjack: true, military: true, pivot: 0.95, heavy: true,
    body: [[-3.5, 0.42], [3.3, 0.42], [3.62, 0.78], [3.6, 1.05], [2.6, 1.5], [-3.2, 1.52], [-3.55, 1.25], [-3.62, 0.8]],
    driver: [0, 2.6, 0.7], dash: 1.4, seats: [[0, -2.2, 1.0]], doors: [[-2.5, 1.0], [2.5, -1.0]],
    turret: { id: 'tank', pivot: [0, 1.52, -0.35] },
    livery: { stripe: 0x353f27 },
    build(c) {
      c.topY = 1.5;
      camo(c, 31, { sides: 10, sy: 0.5, sz: 2.0, y0: 0.6, y1: 1.3, top: 5, sx: 1.6 });
      const rubber = 0x1b1b1a, steel = 0x2c2f2a, wheelC = 0x3a3d36;
      // Гусеницы: скруглённый контур по бортам, катки, ленивец и ведущее колесо.
      const belt = [[-3.7, 0.42], [-3.3, 0.14], [3.1, 0.14], [3.78, 0.62], [3.4, 1.06], [2.2, 1.12], [-2.4, 1.12], [-3.45, 1.05], [-3.78, 0.7]];
      for (const x of [-1.33, 1.33]) {
        c.trim.push({ geometry: c.extrude(belt, 0.62, 0.04).translate(x, 0, 0), color: rubber });
        for (let i = 0; i < 6; i++) c.trim.push({ geometry: c.cyl(0.4, 0.4, 0.66, 12, [0, 0, Math.PI / 2]).translate(x + (x > 0 ? 0.0 : 0), 0.52, -2.55 + i * 1.02), color: wheelC });
        c.trim.push({ geometry: c.cyl(0.42, 0.42, 0.66, 12, [0, 0, Math.PI / 2]).translate(x, 0.78, 3.15), color: wheelC });
        c.trim.push({ geometry: c.cyl(0.34, 0.34, 0.66, 12, [0, 0, Math.PI / 2]).translate(x, 0.8, -3.05), color: wheelC });
        c.trim.push({ geometry: c.box(0.74, 0.12, 6.9, x, 1.2, 0.05), color: steel });                              // крыло
      }
      c.trim.push({ geometry: c.box(2.2, 0.05, 1.5, 0, 1.53, -2.4), color: 0x24271f });                             // решётка двигателя
      c.trim.push({ geometry: c.box(0.8, 0.06, 0.5, 0, 1.56, 1.6), color: steel });                                  // люк водителя
      c.trim.push({ geometry: c.box(0.9, 0.08, 0.7, 1.1, 1.58, 2.0), color: 0x2a2d26 });                              // ЗИП
      c.trim.push({ geometry: c.cyl(0.18, 0.18, 1.6, 8, [Math.PI / 2, 0, 0]).translate(-1.0, 1.65, -1.2), color: 0x20231c });   // бревно-самовытаскиватель
      c.roof.push(c.box(1.6, 0.03, 1.0, 0, 1.54, 0.9));
    },
  },

  truck: {
    name: 'Армейский грузовик', camScale: 1.4, camHeight: 0.6, speed: 0.6, accel: 0.7, grip: 0.95, height: 3.0, hp: 280, width: 2.4, wheelBase: 4.8, wheelScale: 1.55,
    circles: [-2.8, -1.4, 0, 1.4, 2.8], radius: 1.2, military: true, noCarjack: false, bulletResist: 0.7, lightY: 0.9,
    body: [[-4.2, 0.62], [3.4, 0.62], [3.62, 0.8], [3.6, 1.35], [2.9, 1.55], [2.6, 2.38], [1.5, 2.45], [-4.2, 1.1]],
    cabin: [[1.45, 1.58], [2.55, 1.56], [2.52, 2.3], [1.5, 2.3]], glassWidth: 2.1,
    driver: [0.55, 2.2, 0.62], dash: 1.58, seats: [[-0.6, 2.2, 0.62], [0.9, -0.3, 0.62], [-0.9, -0.3, 0.62], [0.9, -1.4, 0.62], [-0.9, -1.4, 0.62], [0.9, -2.5, 0.62], [-0.9, -2.5, 0.62]],
    doors: [[-2.0, 2.2], [2.0, -0.3], [-2.0, -0.3], [2.0, -1.4], [-2.0, -1.4], [2.0, -2.5], [-2.0, -2.5]],
    livery: { stripe: 0x3d4a2a },
    build(c) {
      c.topY = 2.4;
      // Тент на кузове, борта, лавки.
      c.paint.push(c.box(2.3, 0.1, 5.6, 0, 1.25, -1.6));
      c.trim.push({ geometry: c.box(2.36, 1.3, 5.7, 0, 2.0, -1.6), color: 0x4a5636 });                               // тент
      c.trim.push({ geometry: c.box(2.2, 0.12, 5.5, 0, 2.7, -1.6), color: 0x424d30 });
      c.trim.push({ geometry: c.box(2.24, 0.9, 0.06, 0, 1.95, c.zr - 0.02), color: 0x1a1e14 });                      // тёмный проём сзади
      for (const x of [-1.22, 1.22]) c.trim.push({ geometry: c.box(0.04, 0.5, 4.8, x, 2.0, -1.6), color: 0x2f3824 });
      c.trim.push({ geometry: c.box(2.5, 0.2, 0.18, 0, 0.78, c.zf + 0.05), color: 0x2a2a2a });
      for (const x of [-0.85, 0.85]) c.head.push(c.box(0.36, 0.16, 0.06, x, 0.98, c.zf + 0.03));
      camo(c, 41, { sides: 8, y0: 0.8, y1: 1.3, z0: 1.0, z1: 3.0 });
      c.roof.push(c.box(0.9, 0.03, 0.7, 0, 2.46, 2.05));
    },
  },

  heli: {
    name: 'Ударный вертолёт', camScale: 2.0, camHeight: 1.2, speed: 1, accel: 1, grip: 1, height: 2.8, hp: 320, width: 1.9, wheelBase: 2.0, noWheels: true, noArch: true,
    circles: [-1.8, 0, 1.8], radius: 1.2, cabin: null, interior: false, noDefaultLights: true, bulletResist: 0.5, military: true, flies: true, noCarjack: true,
    body: [[-1.6, 0.55], [2.5, 0.5], [3.4, 0.95], [3.2, 1.45], [2.2, 2.0], [0.4, 2.15], [-1.4, 2.0], [-1.8, 1.3]],
    driver: [0, 1.7, 0.8], dash: 1.6, seats: [[0, 0.5, 0.8]], doors: [[-1.7, 0.8], [1.7, 0.8]],
    turret: { id: 'heli', pivot: [0, 0.55, 3.2] },
    livery: { stripe: 0x353f27 },
    build(c) {
      c.topY = 2.1;
      camo(c, 53, { sides: 10, y0: 0.9, y1: 1.7, z0: -1.4, z1: 2.8 });
      const dark = 0x1d2018, glass = 0x23323a;
      c.trim.push({ geometry: c.box(1.4, 0.7, 1.4, 0, 1.5, 2.5).rotateX(-0.35), color: glass });                        // фонарь кабины
      c.trim.push({ geometry: c.box(1.5, 0.12, 5.6, 0, 2.2, -0.4), color: dark });
      c.paint.push(c.box(0.55, 0.6, 5.0, 0, 1.45, -4.6));                                                                // хвостовая балка
      c.paint.push(c.box(0.1, 1.2, 0.8, 0, 1.9, -6.8));                                                                  // киль
      c.trim.push({ geometry: c.box(1.3, 0.05, 0.5, 0, 1.45, -6.9), color: dark });                                      // стабилизатор
      for (const x of [-0.95, 0.95]) {
        c.trim.push({ geometry: c.box(0.08, 0.1, 3.8, x, 0.08, 0.5), color: dark });                                     // лыжи
        for (const z of [-0.6, 1.8]) c.trim.push({ geometry: c.box(0.08, 0.6, 0.1, x, 0.36, z), color: dark });
        c.trim.push({ geometry: c.box(0.6, 0.18, 1.3, x * 1.55, 1.0, 0.3), color: 0x2a2d26 });                           // пилоны
        for (const dz of [-0.35, 0, 0.35]) c.trim.push({ geometry: c.cyl(0.07, 0.07, 1.1, 8, [Math.PI / 2, 0, 0]).translate(x * 1.55, 0.98 + dz * 0.1, 0.5 + dz * 0.3), color: 0x555a50 });   // блоки НУР
      }
      c.trim.push({ geometry: c.cyl(0.12, 0.12, 0.5, 8).translate(0, 2.35, 0.2), color: 0x222222 });                    // втулка винта
      c.roof.push(c.box(0.9, 0.03, 1.4, 0, 2.17, -0.3));
    },
  },
};
