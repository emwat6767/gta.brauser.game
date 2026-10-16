// Настройки игры «Школа № 17: Тревога». Все числа, которые хочется подкрутить, — здесь.
// 1 юнит = 1 метр, ось Y — вверх. heading = 0 смотрит в +Z (как в Open City).

export const SCHOOL = {
  // Когда начинается тревога (секунды от начала дня), если в меню выбрано «случайно».
  alarmWindow: [25, 110],
  breakLength: 30,          // перемена в начале дня, потом звонок на урок

  player: {
    walk: 2.2, run: 4.8, crouch: 1.1,
    health: 100,
    radius: 0.28,
    punchDamage: 14, punchRange: 1.25, punchCooldown: 0.45,
  },

  npc: {
    walk: 1.35, run: 4.0, crouch: 0.9,
    health: 60,
    radius: 0.27,
    followers: 6,           // сколько человек может идти за игроком
    commandRadius: 8,       // команды слышат в этом радиусе
  },

  // Нападение (террорист). Значения по сложности: [лёгкая, обычная, трудная].
  intruder: {
    count: [1, 1, 2],
    health: [70, 100, 120],
    damage: [11, 17, 22],   // урон по игроку за попадание
    reaction: [1.0, 0.65, 0.45],
    sight: 22, sightDark: 11, fov: 1.1,  // полуугол обзора (рад)
    walk: 1.5, run: 3.6,
    magazine: 30, reload: 3.0,
    policeAfter: [120, 165, 210],   // секунд после тревоги до приезда полиции
  },

  zombie: {
    start: [3, 4, 6],       // сколько зомби в начале (нулевой пациент + пришедшие снаружи)
    health: [80, 105, 130],
    damage: [8, 12, 16],
    walk: 1.35, runner: 3.9, runnerChance: [0.1, 0.2, 0.3],
    sight: 13, fov: 1.35,
    turnTime: [10, 8, 6],   // через сколько секунд укушенный встаёт зомби
    rescueAfter: [150, 180, 210],
  },

  fire: {
    spread: [0.045, 0.06, 0.08],     // шанс поджечь соседнюю клетку за шаг
    detector: 14,                    // через сколько секунд срабатывает датчик дыма (если не нажали кнопку)
    firemenAfter: [90, 120, 150],    // секунд после тревоги до приезда пожарных
    extinguisher: 14,                // секунд работы огнетушителя
  },

  // Место сбора при эвакуации (стадион за школой) и автобус МЧС у ворот.
  assembly: { x: 0, z: 34, r: 9 },
  bus: { x: 0, z: -33, r: 6 },

  graphics: {
    desktop: { pixelRatio: 2, shadows: true, shadowMap: 2048, lights: 6, people: 1 },
    mobile: { pixelRatio: 1.25, shadows: false, shadowMap: 1024, lights: 2, people: 0.7 },
  },
};

export const DIFFICULTY_NAMES = ['Лёгкая', 'Обычная', 'Трудная'];
export const SCENARIO_NAMES = { random: 'Случайно', fire: 'Пожар', attack: 'Теракт', zombie: 'Зомби' };
