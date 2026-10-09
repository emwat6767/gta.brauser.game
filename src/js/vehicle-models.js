import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mergeColored } from './geometry.js';

// Типы машин: внешний вид (профиль кузова и кабины, детали) и характер езды.
//
//   speed / accel / grip — множители к CONFIG.vehicle; height — высота кузова для попаданий; hp — прочность
//   body   — боковой профиль кузова [[z, y], ...] (z вперёд), выдавливается по ширине width
//   cabin  — четырёхугольник стёкол [задний низ, передний низ, передний верх, задний верх] или null (без стёкол)
//   width, wheelBase, wheelScale, track — габариты: ширина кузова, база, масштаб колёс, колея (половина)
//   circles, radius — круги столкновений вдоль машины (смещения по Z) и их радиус
//   driver [x — влево, z — вперёд, y], seats — места пассажиров [x, z, y], doors — где они выходят (снаружи)
//   dash — высота торпедо; lightY — высота фар; spoiler, bed, van, taxi, open — детали по типу
//   livery — раскраска по умолчанию { stripe, roof, neon }; colors — палитра кузова для трафика (необязательно)
//   build(c) — доп. детали: c.paint (кузов), c.roof (крыша и стойки), c.trim (чёрные детали), c.stripe, c.head, c.tail
//
// Локальные оси модели: +Z — вперёд, +X — влево (там водительская дверь), +Y — вверх.

export const VEHICLE_TYPES = {
  sedan: {
    name: 'Седан', speed: 1, accel: 1, grip: 1, height: 1.45,
    body: [[-2.18, 0.3], [2.12, 0.3], [2.24, 0.42], [2.22, 0.68], [1.05, 0.84], [-1.55, 0.86], [-2.16, 0.8], [-2.24, 0.52]],
    cabin: [[-1.52, 0.84], [1.02, 0.84], [0.25, 1.39], [-1.18, 1.41]],
    driver: [0.38, -0.2, 0], dash: 0.92,
    seats: [[-0.38, -0.2, -0.06], [0.4, -0.86, -0.1], [-0.4, -0.86, -0.1]],
    doors: [[-1.7, -0.2], [1.7, -1.0], [-1.7, -1.0]],
  },
  sports: {
    name: 'Спорткар', speed: 1.3, accel: 1.55, grip: 1.3, height: 1.15,
    body: [[-2.2, 0.26], [2.2, 0.26], [2.32, 0.36], [2.28, 0.56], [0.95, 0.7], [-1.45, 0.76], [-2.2, 0.74], [-2.3, 0.48]],
    cabin: [[-1.4, 0.72], [0.9, 0.7], [0.0, 1.1], [-0.95, 1.12]],
    driver: [0.36, -0.45, -0.3], dash: 0.78, spoiler: true, lightY: 0.47,
    seats: [[-0.36, -0.45, -0.3]],
    doors: [[-1.7, -0.45]],
  },
  taxi: {
    name: 'Такси', speed: 1, accel: 1, grip: 1, height: 1.45, base: 'sedan', taxi: true,
  },
  van: {
    name: 'Фургон', speed: 0.72, accel: 0.7, grip: 0.85, height: 2.05,
    body: [[-2.25, 0.34], [2.18, 0.34], [2.3, 0.5], [2.26, 0.95], [1.62, 1.08], [1.2, 1.96], [-2.25, 2.0]],
    cabin: [[0.35, 1.12], [1.66, 1.08], [1.26, 1.9], [0.35, 1.9]], glassWidth: 1.8, van: true,
    driver: [0.4, 0.55, 0.22], dash: 1.12,
    seats: [[-0.4, 0.55, 0.22], [0.4, -0.6, 0.22], [-0.4, -0.6, 0.22]],
    doors: [[-1.7, 0.55], [1.7, -0.6], [-1.7, -0.6]],
  },
  pickup: {
    name: 'Пикап', speed: 0.92, accel: 0.95, grip: 0.95, height: 1.55,
    body: [[-2.25, 0.32], [2.15, 0.32], [2.26, 0.46], [2.22, 0.78], [1.15, 0.9], [-2.25, 0.9]],
    cabin: [[-0.6, 0.88], [1.05, 0.88], [0.45, 1.52], [-0.6, 1.54]],
    driver: [0.38, 0.05, 0.08], dash: 1.0, bed: true,
    seats: [[-0.38, 0.05, 0.02]],
    doors: [[-1.7, 0.05]],
  },

  // ------------------------------------------------------------ прикольные машины
  muscle: {
    name: 'Маслкар', speed: 1.25, accel: 1.4, grip: 0.95, height: 1.32, width: 1.84, hp: 105,
    wheelBase: 2.9, circles: [-1.5, 0, 1.5], radius: 0.95, lightY: 0.56,
    body: [[-2.4, 0.3], [2.36, 0.3], [2.48, 0.44], [2.45, 0.72], [1.65, 0.9], [0.6, 0.93], [-0.9, 0.92], [-2.3, 0.9], [-2.42, 0.8], [-2.46, 0.5]],
    cabin: [[-1.4, 0.92], [0.55, 0.93], [-0.05, 1.34], [-0.95, 1.36]],
    driver: [0.38, -0.35, -0.05], dash: 0.96,
    seats: [[-0.38, -0.35, -0.05]], doors: [[-1.75, -0.35]],
    livery: { stripe: 0xf2f2f2 },
    build(c) {
      c.paint.push(c.box(0.56, 0.12, 0.9, 0, 0.99, 1.45));                       // воздухозаборник на капоте
      c.trim.push({ geometry: c.box(0.4, 0.04, 0.7, 0, 1.055, 1.45), color: 0x111111 });
      for (const x of [-0.5, 0.5]) c.trim.push({ geometry: c.cyl(0.07, 0.07, 0.4, 8, [Math.PI / 2, 0, 0]).translate(x, 0.34, c.zr - 0.1), color: 0xb9bec4 }); // выхлоп
      for (const x of [-0.22, 0.22]) c.stripe.push(c.extrude(c.T.body, 0.2, 0.06).translate(x, 0.012, 0));
    },
  },
  suv: {
    name: 'Внедорожник', speed: 0.95, accel: 0.95, grip: 1.05, height: 1.95, width: 1.92, hp: 150, wheelScale: 1.18,
    wheelBase: 2.9, circles: [-1.5, 0, 1.5], radius: 1.0, lightY: 0.82,
    body: [[-2.3, 0.46], [2.2, 0.46], [2.34, 0.6], [2.32, 1.0], [1.5, 1.12], [1.1, 1.14], [-2.2, 1.14], [-2.34, 1.02], [-2.36, 0.65]],
    cabin: [[-2.18, 1.14], [1.2, 1.14], [0.72, 1.86], [-2.1, 1.88]],
    driver: [0.45, 0.35, 0.28], dash: 1.16,
    seats: [[-0.45, 0.35, 0.28], [0.45, -0.85, 0.28], [-0.45, -0.85, 0.28]],
    doors: [[-1.8, 0.35], [1.8, -0.85], [-1.8, -0.85]],
    build(c) {
      for (const x of [-0.7, 0.7]) c.trim.push({ geometry: c.box(0.05, 0.05, 2.5, x, 1.97, -0.45), color: 0x1c1c1c });   // багажник на крыше
      for (const z of [-1.5, -0.45, 0.6]) c.trim.push({ geometry: c.box(1.5, 0.04, 0.06, 0, 1.97, z), color: 0x1c1c1c });
      c.trim.push({ geometry: c.cyl(0.4, 0.4, 0.28, 14, [0, 0, Math.PI / 2], true).rotateY(Math.PI / 2).translate(0, 0.98, c.zr - 0.2), color: 0x1a1a1a }); // запаска
      c.trim.push({ geometry: c.cyl(0.22, 0.22, 0.3, 10, [0, 0, Math.PI / 2], true).rotateY(Math.PI / 2).translate(0, 0.98, c.zr - 0.2), color: 0xb9bec4 });
      c.trim.push({ geometry: c.box(1.5, 0.08, 0.08, 0, 0.75, c.zf + 0.12), color: 0xb9bec4 });          // кенгурятник
      for (const x of [-0.65, 0, 0.65]) c.trim.push({ geometry: c.box(0.07, 0.5, 0.08, x, 0.62, c.zf + 0.12), color: 0xb9bec4 });
      for (const x of [-1.03, 1.03]) c.trim.push({ geometry: c.box(0.2, 0.06, 2.3, x, 0.42, -0.1), color: 0x2b2b2b });   // подножки
    },
  },
  limo: {
    name: 'Лимузин', speed: 0.9, accel: 0.85, grip: 0.9, height: 1.45, hp: 130,
    wheelBase: 4.9, circles: [-2.9, -1.45, 0, 1.45, 2.9], radius: 0.95,
    body: [[-3.65, 0.3], [3.55, 0.3], [3.67, 0.42], [3.65, 0.68], [2.4, 0.84], [-3.0, 0.86], [-3.6, 0.8], [-3.68, 0.52]],
    cabin: [[-3.0, 0.86], [2.35, 0.84], [1.65, 1.38], [-2.6, 1.4]],
    driver: [0.38, 1.1, 0], dash: 0.92,
    seats: [[-0.38, 1.1, -0.06], [0.4, 0.15, -0.1], [-0.4, 0.15, -0.1], [0.4, -0.95, -0.1], [-0.4, -0.95, -0.1]],
    doors: [[-1.7, 1.1], [1.7, 0.15], [-1.7, 0.15], [1.7, -0.95], [-1.7, -0.95]],
    colors: [0x101114, 0x101114, 0xf2f2f0, 0x2b2f3a],
    build(c) {
      for (const x of [-c.sx, c.sx]) c.stripe.push(c.box(0.03, 0.05, 6.6, x, 0.6, -0.1));                     // золотая полоса
      c.stripe.push(c.box(1.5, 0.05, 0.03, 0, 0.6, c.fz));
      for (const x of [-0.36, 0.36]) c.trim.push({ geometry: c.cyl(0.05, 0.05, 0.6, 6).translate(x, 0.94, c.zf - 0.05), color: 0xc9c9c9 }); // флажки
    },
    livery: { stripe: 0xd9b13b },
  },
  bus: {
    name: 'Автобус', speed: 0.7, accel: 0.6, grip: 0.8, height: 3.0, hp: 260, width: 2.2, wheelBase: 5.2, wheelScale: 1.45,
    circles: [-3.2, -1.6, 0, 1.6, 3.2], radius: 1.1, cabin: null, interior: false,
    body: [[-4.3, 0.4], [4.2, 0.4], [4.32, 0.55], [4.3, 2.45], [4.15, 2.95], [-4.2, 3.0], [-4.32, 2.85], [-4.34, 0.6]],
    driver: [0.7, 3.2, 0.42], dash: 1.4,
    seats: [[-0.6, 2.2, 0.42], [0.6, 0.6, 0.42], [-0.6, 0.6, 0.42], [0.6, -0.8, 0.42], [-0.6, -0.8, 0.42]],
    doors: [[-1.9, 2.2], [1.9, 0.6], [-1.9, 0.6], [1.9, -0.8], [-1.9, -0.8]],
    colors: [0xe8eef2, 0x1f8a4c, 0x2d7fd6, 0xd63031],
    livery: { stripe: 0x0f3f8f },
    build(c) {
      const glass = 0x1b2833;
      for (let i = 0; i < 7; i++) {
        const z = 3.1 - i * 1.15;
        for (const x of [-c.sx, c.sx]) c.trim.push({ geometry: c.box(0.03, 0.9, 0.95, x, 2.0, z), color: glass });
      }
      c.trim.push({ geometry: c.box(2.0, 1.05, 0.04, 0, 1.95, c.fz + 0.01), color: glass });                    // лобовое
      c.trim.push({ geometry: c.box(1.9, 0.8, 0.04, 0, 2.1, c.rz - 0.01), color: glass });
      c.trim.push({ geometry: c.box(1.5, 0.28, 0.05, 0, 2.7, c.fz + 0.01), color: 0xffb300 });                  // табло маршрута
      c.trim.push({ geometry: c.box(0.03, 1.8, 0.8, -c.sx, 1.35, 2.2), color: 0x20262c });                      // двери
      c.trim.push({ geometry: c.box(0.03, 1.8, 0.8, -c.sx, 1.35, -0.8), color: 0x20262c });
      c.trim.push({ geometry: c.box(1.3, 0.25, 1.7, 0, 3.12, -1.4), color: 0x9aa1a8 });                        // кондиционер на крыше
      c.trim.push({ geometry: c.box(2.24, 0.3, 8.8, 0, 0.55, 0), color: 0x2b2b2b });                           // низ
      for (const x of [-c.sx, c.sx]) c.stripe.push(c.box(0.03, 0.3, 8.4, x, 1.15, 0));
      c.stripe.push(c.box(2.0, 0.3, 0.03, 0, 1.15, c.fz));
    },
  },
  monster: {
    name: 'Монстр-трак', speed: 0.85, accel: 1.0, grip: 1.1, height: 3.2, hp: 220, width: 2.1, wheelBase: 3.2, wheelScale: 2.35, track: 1.3,
    circles: [-1.5, 0, 1.5], radius: 1.15, noArch: true, lightY: 1.5,
    body: [[-2.4, 1.2], [2.3, 1.2], [2.42, 1.34], [2.4, 1.8], [1.4, 1.95], [-2.4, 1.95]],
    cabin: [[-0.6, 1.95], [1.3, 1.95], [0.75, 2.6], [-0.6, 2.62]],
    driver: [0.45, 0.15, 1.35], dash: 2.0,
    seats: [[-0.45, 0.15, 1.35]], doors: [[-1.9, 0.15]],
    livery: { stripe: 0xff7a1a },
    build(c) {
      for (const z of [-1.6, 1.6]) {
        c.trim.push({ geometry: c.box(2.9, 0.22, 0.3, 0, 0.85, z), color: 0x222222 });                           // мосты
        for (const x of [-0.8, 0.8]) c.trim.push({ geometry: c.cyl(0.09, 0.09, 0.5, 8).translate(x, 1.05, z), color: 0xb9bec4 });
      }
      c.trim.push({ geometry: c.box(1.6, 0.18, 3.4, 0, 1.0, 0), color: 0x1d1d1d });
      for (const x of [-0.65, 0.65]) c.trim.push({ geometry: c.cyl(0.07, 0.07, 1.0, 8).translate(x, 2.45, c.zr + 0.3), color: 0xc9c9c9 });   // выхлопные трубы
      for (const x of [-c.sx, c.sx]) c.stripe.push(c.box(0.03, 0.25, 4.6, x, 1.55, 0));
      c.trim.push({ geometry: c.box(1.7, 0.3, 0.2, 0, 1.35, c.fz + 0.1), color: 0x303030 });                      // бампер
    },
  },
  convertible: {
    name: 'Кабриолет', speed: 1.2, accel: 1.3, grip: 1.2, height: 1.2, hp: 95, open: true, lightY: 0.47,
    body: [[-2.2, 0.26], [2.2, 0.26], [2.32, 0.36], [2.28, 0.56], [0.95, 0.7], [0.92, 0.62], [0.75, 0.46], [-0.95, 0.46], [-1.1, 0.64], [-1.2, 0.76], [-2.2, 0.74], [-2.3, 0.48]],
    cabin: [[0.62, 0.7], [0.97, 0.7], [0.5, 1.1], [0.44, 1.1]],
    driver: [0.36, -0.25, 0.08], dash: 0.7,
    seats: [[-0.36, -0.25, 0.08]], doors: [[-1.7, -0.25]],
    colors: [0xff5ea8, 0x23c4e0, 0xf5c518, 0xf2f2f0, 0xff7a1a],
    build(c) {
      for (const x of [-0.86, 0.86]) c.paint.push(c.box(0.12, 0.34, 2.0, x, 0.58, -0.1));                       // боковины кабины
      for (const x of [-0.4, 0.4]) c.trim.push({ geometry: c.cyl(0.04, 0.04, 0.5, 8).translate(x, 0.98, -0.82), color: 0xb9bec4 }); // дуги безопасности
      c.trim.push({ geometry: c.box(0.9, 0.04, 0.04, 0, 1.22, -0.82), color: 0xb9bec4 });
    },
  },
  icecream: {
    name: 'Мороженщик', base: 'van', speed: 0.7, accel: 0.7, grip: 0.85, hp: 150,
    colors: [0xffd6e7, 0xbfe9ff, 0xfff1b8, 0xcff5d6],
    livery: { stripe: 0xff6fa0 },
    build(c) {
      c.trim.push({ geometry: c.box(0.04, 0.55, 1.1, 0.9, 1.4, -0.75), color: 0xfff5d6 });                       // окошко и прилавок
      c.trim.push({ geometry: c.box(0.04, 0.55, 1.1, -0.9, 1.4, -0.75), color: 0xfff5d6 });
      for (const x of [-1.0, 1.0]) c.stripe.push(c.box(0.3, 0.1, 1.3, x, 1.75, -0.75));                          // навес
      c.paint.push(new THREE.ConeGeometry(0.3, 0.8, 12).rotateX(Math.PI).translate(0, 2.55, -0.9));              // рожок
      c.stripe.push(new THREE.SphereGeometry(0.34, 12, 9).translate(0, 3.05, -0.9));
      c.trim.push({ geometry: new THREE.SphereGeometry(0.2, 10, 8).translate(0, 3.38, -0.9), color: 0xff6fa0 });
      c.trim.push({ geometry: new THREE.SphereGeometry(0.07, 8, 6).translate(0.05, 3.62, -0.9), color: 0xc0262a });
      c.trim.push({ geometry: c.box(0.5, 0.3, 0.4, 0.5, 2.15, 0.5), color: 0x333333 });                          // рупор
    },
  },
  hyper: {
    name: 'Гиперкар', speed: 1.6, accel: 2.0, grip: 1.45, height: 1.05, hp: 85, width: 1.92, wheelBase: 2.7, circles: [-1.4, 0, 1.4], radius: 0.95,
    lightY: 0.42, spoiler: true, spoilerY: 0.98,
    body: [[-2.15, 0.2], [2.25, 0.2], [2.42, 0.28], [2.38, 0.44], [1.2, 0.54], [0.4, 0.62], [-1.8, 0.7], [-2.2, 0.62], [-2.3, 0.4]],
    cabin: [[-1.3, 0.66], [0.65, 0.6], [-0.05, 0.98], [-0.9, 1.0]],
    driver: [0.34, -0.35, -0.34], dash: 0.72,
    seats: [[-0.34, -0.35, -0.34]], doors: [[-1.75, -0.35]],
    colors: [0xff7a00, 0xb6ff00, 0x00e0ff, 0xf2f2f0, 0xe0003a, 0xffd400],
    livery: { neon: 0x00e5ff, stripe: 0x111111 },
    build(c) {
      for (const x of [-0.99, 0.99]) c.trim.push({ geometry: c.box(0.08, 0.14, 0.7, x, 0.42, -0.4), color: 0x0d0d0d }); // боковые воздухозаборники
      c.trim.push({ geometry: c.box(1.7, 0.05, 0.3, 0, 0.18, c.zf + 0.12), color: 0x0d0d0d });                    // сплиттер
      for (const x of [-0.4, 0.4]) c.tail.push(c.cyl(0.08, 0.08, 0.2, 8, [Math.PI / 2, 0, 0]).translate(x, 0.34, c.zr - 0.06)); // горящие сопла
      c.stripe.push(c.extrude(c.T.body, 0.28, 0.06).translate(0, 0.01, 0));
    },
  },
  lowrider: {
    name: 'Лоурайдер', base: 'sedan', speed: 0.9, accel: 0.9, grip: 0.95, lowered: 0.13, bounce: true,
    colors: [0x7b2cbf, 0x00a896, 0xd4af37, 0xc2185b, 0x1d4e89],
    livery: { stripe: 0xe8d28a, neon: 0xff3df2 },
    build(c) {
      for (const x of [-c.sx, c.sx]) c.stripe.push(c.box(0.03, 0.06, 3.6, x, 0.62, -0.1));
      c.stripe.push(c.box(1.5, 0.05, 0.03, 0, 0.62, c.bodyZ(0.62, true)));
      for (const x of [-0.6, 0.6]) c.trim.push({ geometry: c.cyl(0.035, 0.035, 0.7, 6).translate(x, 1.45, -1.6), color: 0xb9bec4 }); // антенны
    },
  },
  cyber: {
    name: 'Кибертрак', speed: 1.15, accel: 1.2, grip: 1.0, height: 1.5, hp: 180, width: 2.0, wheelBase: 3.2, wheelScale: 1.15,
    circles: [-1.6, 0, 1.6], radius: 1.0, cabin: null, interior: false, noDefaultLights: true,
    body: [[-2.55, 0.4], [2.55, 0.4], [2.62, 0.55], [1.7, 0.8], [0.0, 1.32], [-1.2, 1.44], [-2.5, 1.36], [-2.58, 1.0], [-2.6, 0.6]],
    driver: [0.45, -0.2, 0.2], dash: 1.1, seats: [[-0.45, -0.2, 0.2]], doors: [[-1.85, -0.2]],
    colors: [0xb9bfc7, 0xb9bfc7, 0x2a2d33, 0xc9ced4],
    paint: { metalness: 0.92, roughness: 0.22 },
    build(c) {
      const ang = Math.atan2(0.52, 1.7);
      c.trim.push({ geometry: new THREE.BoxGeometry(1.86, 0.025, 1.78).rotateX(ang).translate(0, 1.122, 0.87), color: 0x14191f }); // лобовое
      for (const x of [-c.sx, c.sx]) c.trim.push({ geometry: new THREE.BoxGeometry(0.02, 0.34, 1.5).translate(x, 1.1, -0.1), color: 0x14191f }); // боковые окна
      c.head.push(c.box(1.9, 0.06, 0.06, 0, 0.6, c.bodyZ(0.6, true) + 0.01));                                     // сплошная полоса фар
      c.tail.push(c.box(1.9, 0.06, 0.06, 0, 1.2, c.rz));
    },
  },
  retro: {
    name: 'Ретро', speed: 0.8, accel: 0.8, grip: 0.95, height: 1.45, hp: 100, width: 1.7, wheelBase: 2.4, circles: [-1.1, 0, 1.1], radius: 0.9,
    lightY: 0.8,
    body: [[-1.95, 0.32], [1.85, 0.32], [2.0, 0.45], [1.98, 0.68], [1.6, 0.86], [1.1, 0.95], [0.2, 1.0], [-0.9, 0.99], [-1.6, 0.88], [-1.92, 0.66], [-2.0, 0.45]],
    cabin: [[-1.45, 0.92], [0.9, 0.97], [0.4, 1.42], [-0.8, 1.4]],
    driver: [0.36, -0.2, 0], dash: 0.95,
    seats: [[-0.36, -0.2, -0.06], [0.38, -0.8, -0.1]], doors: [[-1.6, -0.2], [1.6, -0.8]],
    colors: [0x5ec8c0, 0xf4b6c2, 0xf2e6b0, 0xc0392b, 0x8fb8de],
    noDefaultLights: true,
    build(c) {
      for (const x of [-0.58, 0.58]) c.head.push(new THREE.SphereGeometry(0.15, 10, 8).translate(x, 0.82, c.zf - 0.1));   // круглые фары
      for (const x of [-0.58, 0.58]) c.tail.push(new THREE.SphereGeometry(0.08, 8, 6).translate(x, 0.82, c.zr + 0.02));
      for (const x of [-0.68, 0.68]) c.trim.push({ geometry: c.box(0.18, 0.05, 1.4, x, 0.46, 1.15), color: 0xc9ced4 });  // хромовые крылья
      c.trim.push({ geometry: c.box(1.4, 0.07, 0.07, 0, 0.5, c.zf + 0.1), color: 0xc9ced4 });
    },
  },
};

// Значения по умолчанию для габаритов (после раскрытия base).
for (const t of Object.values(VEHICLE_TYPES)) if (t.base) Object.assign(t, { ...VEHICLE_TYPES[t.base], ...t });
for (const t of Object.values(VEHICLE_TYPES)) {
  t.width ??= 1.76;
  t.wheelBase ??= CONFIG.vehicle.wheelBase;
  t.wheelScale ??= 1;
  t.track ??= t.width / 2 - 0.04;
  t.circles ??= CONFIG.vehicle.circleOffsets;
  t.radius ??= CONFIG.vehicle.collisionRadius;
  t.zf = Math.max(...t.body.map((p) => p[0]));
  t.zr = Math.min(...t.body.map((p) => p[0]));
  t.minY = Math.min(...t.body.map((p) => p[1]));
  t.lowered ??= 0;
}

// ---------------------------------------------------------------- построение геометрии типа

const CACHE = new Map();

export function buildTypeAssets(typeId) {
  if (CACHE.has(typeId)) return CACHE.get(typeId);
  const T = VEHICLE_TYPES[typeId];
  const W = T.width, k = W / 1.76;
  const { zf, zr, minY } = T;

  // Боковой профиль (z — длина, y — высота), выдавливается по ширине.
  const extrude = (points, depth, bevel) => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, steps: 1, bevelEnabled: !!bevel,
      bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2,
    });
    g.rotateY(-Math.PI / 2); // профиль лёг вдоль Z, выдавливание — по X
    g.translate(depth / 2, 0, 0);
    return g;
  };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // Цилиндр вдоль Y (rot — поворот [x, y, z] до сдвига; wide — вдоль X).
  const cyl = (rt, rb, h, seg = 8, rot = null) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (rot) g.rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]);
    return g;
  };
  // Стойка крыши между двумя точками профиля [z, y] на борту x.
  const pillar = (p0, p1, x) => {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    return new THREE.BoxGeometry(0.06, len, 0.07).rotateX(Math.atan2(p1[0] - p0[0], p1[1] - p0[1]))
      .translate(x, (p0[1] + p1[1]) / 2, (p0[0] + p1[0]) / 2);
  };

  // Поверхность кузова спереди (front) или сзади на высоте y — с учётом фаски; туда ставим фары и номера.
  const bodyZ = (y, front) => {
    let best = front ? -Infinity : Infinity;
    const P = T.body;
    for (let i = 0; i < P.length; i++) {
      const [z0, y0] = P[i], [z1, y1] = P[(i + 1) % P.length];
      if (y0 === y1 || (y - y0) * (y - y1) > 0) continue;
      const z = z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
      best = front ? Math.max(best, z) : Math.min(best, z);
    }
    return best + (front ? 0.05 : -0.05);
  };

  const C = T.cabin;
  // sx — боковая поверхность кузова с фаской, fz/rz — передняя/задняя (детали ставим на них, иначе утонут в кузове).
  const c = { T, W, k, zf, zr, minY, sx: W / 2 + 0.07, fz: zf + 0.06, rz: zr - 0.06, bodyZ, box, cyl, extrude, paint: [], roof: [], trim: [], stripe: [], head: [], tail: [] };
  c.paint.push(extrude(T.body, W, 0.06));
  if (C && !T.van) {
    // Крыша и стойки по контуру кабины (у кабриолета — только лобовая рамка).
    const roofY = (C[2][1] + C[3][1]) / 2, roofLen = C[2][0] - C[3][0];
    if (!T.open) c.roof.push(box(W - 0.16, 0.07, roofLen + 0.06, 0, roofY + 0.015, (C[2][0] + C[3][0]) / 2));
    for (const x of [W / 2 - 0.09, -(W / 2 - 0.09)]) {
      c.roof.push(pillar(C[1], C[2], x));
      if (!T.open) {
        c.roof.push(pillar(C[0], C[3], x));
        c.roof.push(box(0.06, roofY - C[0][1], 0.1, x, (roofY + C[0][1]) / 2, (C[0][0] + C[1][0]) / 2 - 0.1));
      }
    }
  }
  if (T.bed) {
    // Кузов пикапа: борта и тёмное дно.
    c.paint.push(box(0.08, 0.3, 1.6, 0.84, 1.03, -1.42), box(0.08, 0.3, 1.6, -0.84, 1.03, -1.42));
    c.paint.push(box(1.76, 0.3, 0.08, 0, 1.03, -2.2));
  }
  if (T.spoiler) {
    const sy = T.spoilerY ?? 1.02;
    c.paint.push(box(W - 0.16, 0.05, 0.3, 0, sy, zr + 0.15));
    for (const x of [0.6, -0.6]) c.paint.push(box(0.06, 0.24, 0.12, x, sy - 0.14, zr + 0.15));
  }

  // Колёсные арки и подробности.
  const wb = T.wheelBase, ws = T.wheelScale;
  const arch = (z) => new THREE.CylinderGeometry(0.43 * ws, 0.43 * ws, W + 0.14, 16, 1, false, 0, Math.PI)
    .rotateZ(Math.PI / 2).translate(0, 0.36 * ws, z);
  const [dx, dz] = [T.driver[0], T.driver[1]];
  const by = minY + 0.1;
  c.trim.push(
    { geometry: box(W + 0.16, 0.2, 0.16, 0, by, zf), color: 0x2b2b2b },                              // бамперы
    { geometry: box(W + 0.16, 0.2, 0.16, 0, by + 0.02, zr - 0.01), color: 0x2b2b2b },
    { geometry: box(W * 0.57, 0.16, 0.04, 0, by + 0.18, zf + 0.025), color: 0x111111 },              // решётка
  );
  if (!T.noArch) c.trim.push({ geometry: arch(wb / 2), color: 0x0d0d0d }, { geometry: arch(-wb / 2), color: 0x0d0d0d });
  if (T.cabin) {
    c.trim.push(
      { geometry: box(0.2, 0.1, 0.13, W / 2 + 0.12, T.dash + 0.06, dz + 0.98), color: 0x222222 },  // зеркала
      { geometry: box(0.2, 0.1, 0.13, -W / 2 - 0.12, T.dash + 0.06, dz + 0.98), color: 0x222222 },
    );
  }
  c.trim.push(
    { geometry: box(0.5, 0.12, 0.02, 0, by, Math.max(zf + 0.09, bodyZ(by, true))), color: 0xe8e4d0 },    // номера
    { geometry: box(0.5, 0.12, 0.02, 0, by + 0.22, Math.min(zr - 0.06, bodyZ(by + 0.22, false))), color: 0xe8e4d0 },
  );
  if (T.interior !== false && T.cabin) {
    // Салон (виден через стёкла): сиденья водителя и пассажиров, торпедо, руль.
    c.trim.push({ geometry: box(1.56 * k, 0.2, 0.35, 0, T.dash, dz + 0.92), color: 0x2b2b2b });
    c.trim.push({ geometry: new THREE.TorusGeometry(0.17, 0.025, 6, 18).rotateX(0.4).translate(dx, T.dash + 0.01, dz + 0.56), color: 0x151515 });
    for (const [x, z, y] of [T.driver, ...T.seats]) {
      c.trim.push({ geometry: box(0.5, 0.12, 0.5, x, 0.42 + y, z + 0.05), color: 0x3a3a3a });
      c.trim.push({ geometry: box(0.5, 0.62, 0.12, x, 0.76 + y, z - 0.26), color: 0x3a3a3a });
    }
  } else if (T.interior === false) {
    // Автобус и кибертрак: салон не рисуем, но сиденья водителя нужны для посадки — они скрыты кузовом.
  }
  if (T.bed) c.trim.push({ geometry: box(1.68, 0.06, 1.6, 0, 0.9, -1.42), color: 0x1d1d1d });
  if (T.van) {
    // Задние двери со стёклами, полоса по борту, тёмный низ.
    const back = bodyZ(1.2, false);
    c.trim.push({ geometry: box(0.66, 0.46, 0.04, 0.4, 1.56, back), color: 0x1b2833 });
    c.trim.push({ geometry: box(0.66, 0.46, 0.04, -0.4, 1.56, back), color: 0x1b2833 });
    c.trim.push({ geometry: box(0.04, 1.5, 0.05, 0, 1.18, back), color: 0x333333 });
    c.trim.push({ geometry: box(0.05, 0.2, 0.05, 0.1, 1.12, back - 0.03), color: 0x888888 }); // ручка
    c.trim.push({ geometry: box(1.94, 0.14, 3.2, 0, 1.0, -0.55), color: 0x2c3e50 });
    c.trim.push({ geometry: box(1.94, 0.16, 4.3, 0, 0.42, 0), color: 0x2b2b2b });
    // Боковое окно у сдвижной двери.
    for (const x of [0.95, -0.95]) c.trim.push({ geometry: box(0.03, 0.42, 0.9, x, 1.56, -0.2), color: 0x1b2833 });
  }
  if (T.taxi) {
    c.trim.push({ geometry: box(0.62, 0.2, 0.26, 0, 1.52, -0.45), color: 0xffe066 });
    c.trim.push({ geometry: box(1.78, 0.1, 2.6, 0, 0.72, -0.1), color: 0x1a1a1a });
  }
  T.build?.(c);

  const paint = mergeColored(c.paint.map((geometry) => ({ geometry })));
  const roof = c.roof.length ? mergeColored(c.roof.map((geometry) => ({ geometry }))) : null;
  const trim = mergeColored(c.trim);
  const stripe = c.stripe.length ? mergeColored(c.stripe.map((geometry) => ({ geometry }))) : null;
  const glass = C ? extrude(C, T.glassWidth ?? 1.56 * k, 0) : null;
  const hy = T.lightY ?? (T.van ? 0.7 : 0.62);
  const hz = bodyZ(hy, true), tz = bodyZ(hy + 0.06, false);
  const hx = 0.62 * k;
  const headParts = T.noDefaultLights ? [] : [{ geometry: box(0.36, 0.14, 0.06, hx, hy, hz) }, { geometry: box(0.36, 0.14, 0.06, -hx, hy, hz) }];
  const tailParts = T.noDefaultLights ? [] : [{ geometry: box(0.38, 0.12, 0.05, hx, hy + 0.06, tz) }, { geometry: box(0.38, 0.12, 0.05, -hx, hy + 0.06, tz) }];
  for (const g of c.head) headParts.push({ geometry: g });
  for (const g of c.tail) tailParts.push({ geometry: g });
  const headlights = headParts.length ? mergeColored(headParts) : null;
  const taillights = tailParts.length ? mergeColored(tailParts) : null;

  const set = { paint, roof, trim, stripe, glass, headlights, taillights };
  CACHE.set(typeId, set);
  return set;
}

// ---------------------------------------------------------------- раскраска

const STRIPES = [0xf2f2f0, 0x111111, 0xd9b13b, 0xc0392b, 0x2d7fd6];
const ROOFS = [0x111111, 0xf2f2f0, 0x2b2f3a];

// Случайная раскраска для трафика: чаще без ухищрений, иногда полоса или чёрная крыша.
export function randomLivery(rng, typeId) {
  const T = VEHICLE_TYPES[typeId];
  const out = {};
  if (T.build && !['sedan', 'sports', 'taxi', 'van', 'pickup'].includes(typeId)) return out; // у особых машин своя раскраска
  if (typeId === 'taxi' || T.van || T.bed) return out;
  if (rng.chance(0.1)) out.stripe = rng.pick(STRIPES);
  if (T.cabin && rng.chance(0.1)) out.roof = rng.pick(ROOFS);
  return out;
}

// Цвет кузова: у некоторых типов своя палитра (мороженщик — пастель, гиперкар — кислотные).
export function bodyColor(rng, typeId, fallback) {
  const T = VEHICLE_TYPES[typeId];
  return T.colors ? rng.pick(T.colors) : fallback;
}

// Веса типов в потоке и среди припаркованных.
export const TYPE_WEIGHTS = [
  ['sedan', 0.22], ['taxi', 0.1], ['sports', 0.06], ['van', 0.08], ['pickup', 0.1],
  ['muscle', 0.06], ['suv', 0.1], ['limo', 0.02], ['bus', 0.04], ['monster', 0.015], ['convertible', 0.05],
  ['icecream', 0.02], ['hyper', 0.02], ['lowrider', 0.045], ['cyber', 0.03], ['retro', 0.04],
];
