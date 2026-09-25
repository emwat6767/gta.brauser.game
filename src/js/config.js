// Все игровые константы в одном месте.
// Единицы: 1 юнит = 1 метр, скорость — м/с, углы — радианы.
// Ось Y — вверх. Направление "вперёд" для угла heading: (sin h, 0, cos h).

export const CONFIG = {
  // Сид генератора случайных чисел: один и тот же сид => один и тот же город.
  seed: 1337,

  world: {
    size: 1000,             // мир 1000 x 1000, от -500 до +500 по X и Z
    blockSize: 100,         // расстояние между осями соседних улиц
    roadsPerAxis: 10,       // улиц вдоль каждой оси (кварталов = roadsPerAxis - 1)
    roadWidth: 14,          // ширина проезжей части (4 полосы по 3.5 м)
    sidewalkWidth: 5,
    curbHeight: 0.15,       // высота бордюра/тротуара
    // Кварталы-парки (индексы [i, j] квартала по X и Z) — в них нет зданий.
    parks: [[4, 4], [1, 6], [6, 1], [7, 7], [2, 2]],
    outskirtsTrees: 170,    // деревья на окраине за внешними улицами
    lampSpacing: 26,        // шаг фонарей вдоль тротуара
    collisionCell: 20,      // размер ячейки сетки коллизий
  },

  player: {
    spawn: { x: -3, z: 40.5, heading: 0 },
    radius: 0.35,
    walkSpeed: 3.4,
    runSpeed: 7.2,
    accel: 28,              // ускорение на земле
    airAccel: 6,            // управляемость в прыжке
    jumpSpeed: 5.8,
    turnSpeed: 12,          // скорость поворота модели к направлению движения
    enterDistance: 2.2,     // макс. расстояние до кузова, чтобы сесть в машину (E)
    health: 100,
    punchDamage: 15,
    regenDelay: 8,          // через сколько секунд без урона начинает восстанавливаться здоровье
    regenRate: 3,           // ед. здоровья в секунду
    respawnDelay: 4,        // "ПОТРАЧЕНО" / "АРЕСТОВАН" на экране, секунд
    startWeapons: { pistol: 48 },                    // оружие и патроны при старте/возрождении
    hospital: { x: -3, z: 40.5, heading: 0 },      // где появляемся после смерти
    policeStation: { x: 40.5, z: -40.5, heading: Math.PI }, // после ареста
  },

  vehicle: {
    maxSpeed: 40,           // ~144 км/ч
    maxReverse: 9,
    accel: 13,
    reverseAccel: 7,
    brakeDecel: 26,
    handbrakeDecel: 9,
    coastDecel: 1.6,        // торможение накатом
    airDrag: 0.0012,        // квадратичное сопротивление
    parkedDecel: 9,         // тормоз, когда в машине нет водителя
    maxSteer: 0.6,
    steerSpeedFactor: 0.11, // чем быстрее едем, тем меньше угол руля
    steerRate: 3.2,
    steerReturn: 5,
    grip: 12,               // боковое сцепление
    gripHandbrake: 1.6,     // сцепление на ручнике (занос)
    wheelBase: 2.66,
    wheelRadius: 0.36,
    collisionRadius: 0.95,  // машина = 3 круга вдоль продольной оси
    circleOffsets: [-1.35, 0, 1.35],
    restitution: 0.25,
    wallFriction: 0.9,
    impactSpin: 0.08,
    // Машины, стоящие в городе при старте. Все — одна модель, разные цвета.
    spawns: [
      { x: 3, z: 45.3, heading: Math.PI / 2, color: 0xc0392b },
      { x: -16, z: 45.3, heading: Math.PI / 2, color: 0x2e86de },
      { x: 45.3, z: -12, heading: 0, color: 0xf1c40f },
      { x: -145.3, z: 110, heading: Math.PI, color: 0x222831 },
      { x: 230, z: 154.7, heading: -Math.PI / 2, color: 0xecf0f1 },
      { x: -60, z: -254.7, heading: Math.PI / 2, color: 0x27ae60 },
    ],
  },

  npc: {
    count: 8,               // прохожих вокруг игрока (5-10 по ТЗ); дальние пересоздаются рядом
    spawnRadius: 140,       // NPC появляются вокруг игрока
    recycleDistance: 210,   // прохожие дальше этого исчезают и появляются заново рядом с игроком
    visibleDistance: 150,   // дальше — модель скрыта (экономия draw calls)
    freezeDistance: 230,    // дальше — NPC не обновляется
    radius: 0.33,
    walkSpeed: [1.2, 1.7],
    panicSpeed: 5.2,        // бегство после толчка
    fightSpeed: 5.4,        // бег к противнику
    idleChance: 0.2,        // шанс постоять на углу
    runKnockSpeed: 5,       // игрок быстрее этого сбивает NPC с ног, медленнее — просто толкает
    downTime: [2.2, 3.4],   // сколько лежит сбитый NPC
    corpseTime: 25,         // через сколько секунд тело исчезает (если игрок далеко)
    // Здоровье, урон кулаком и оружие (вероятности) по ролям.
    roles: {
      civilian: { health: 40, damage: 7, cooldown: 0.6, weapons: {} },
      gang: { health: 60, damage: 8, cooldown: 0.35, weapons: { pistol: 0.55, smg: 0.2, shotgun: 0.1 } },
      police: { health: 70, damage: 9, cooldown: 0.4, weapons: { pistol: 1 } },
    },
    // Стрельба NPC: разброс умножается, урон по игроку уменьшается (иначе слишком жёстко).
    gunSpreadScale: 4,
    gunDamageToPlayer: 0.35,
    gunReaction: 0.7,       // сек от появления цели в прямой видимости до первого выстрела
    gunFireRateScale: 0.45, // NPC стреляют реже, чем позволяет оружие
    panicRadius: 35,        // прохожие в этом радиусе от выстрела разбегаются
  },

  // Оружие. damage — за пулю (у обреза pellets дробинок), fireRate — выстрелов в секунду,
  // spread — базовый разброс (рад), bloom — прирост разброса за выстрел, recoil — подброс
  // камеры (рад), range — дальность (м), reload — секунд, impulse — толчок тела при попадании.
  weapons: {
    pistol: {
      name: 'Пистолет', damage: 24, pellets: 1, fireRate: 4, auto: false, magazine: 12,
      spread: 0.008, bloom: 0.02, recoil: 0.03, range: 80, reload: 1.3, impulse: 3, twoHanded: false,
    },
    shotgun: {
      name: 'Обрез', damage: 11, pellets: 9, fireRate: 1.3, auto: false, magazine: 2,
      spread: 0.075, bloom: 0.03, recoil: 0.12, range: 28, reload: 1.9, impulse: 7, twoHanded: true,
    },
    smg: {
      name: 'Автомат', damage: 16, pellets: 1, fireRate: 11, auto: true, magazine: 30,
      spread: 0.018, bloom: 0.011, recoil: 0.018, range: 70, reload: 1.8, impulse: 3.5, twoHanded: true,
    },
  },
  // Деньги.
  economy: {
    startMoney: 300,
    // Сколько денег выпадает из убитых (диапазон), по ролям.
    drops: { civilian: [8, 35], gang: [25, 90], police: [40, 120] },
    magnetRadius: 4.5,      // деньги подтягиваются к игроку с этого расстояния
    saveKey: 'opencity.save.v1',
  },

  // Питомцы и крутки (как в PETS GO): шанс питомца — "1 на odds".
  // mult — множитель денег, который даёт питомец; income считается из mult (см. pets.js).
  // kind — модель; colors — [основной, второй, глаза/акцент]; fx — 'gold' | 'rainbow' | 'glow' | 'crystal' | 'cosmic'.
  pets: {
    list: [
      { id: 'cat', name: 'Кошка', odds: 2, kind: 'cat', colors: ['#f0a04b', '#fff1dc', '#2b2b2b'], mult: 1.05 },
      { id: 'dog', name: 'Собака', odds: 3, kind: 'dog', colors: ['#9b6a3f', '#f3e3cf', '#2b2b2b'], mult: 1.08 },
      { id: 'chick', name: 'Цыплёнок', odds: 5, kind: 'bird', colors: ['#ffd84a', '#ff9a2e', '#2b2b2b'], mult: 1.12 },
      { id: 'bunny', name: 'Кролик', odds: 8, kind: 'bunny', colors: ['#f4f4f4', '#ffb3c6', '#2b2b2b'], mult: 1.16 },
      { id: 'pig', name: 'Свинка', odds: 12, kind: 'pig', colors: ['#ffb0c0', '#ff8fa7', '#2b2b2b'], mult: 1.2 },
      { id: 'fox', name: 'Лиса', odds: 22, kind: 'fox', colors: ['#e8712b', '#fff4e6', '#2b2b2b'], mult: 1.3 },
      { id: 'panda', name: 'Панда', odds: 40, kind: 'panda', colors: ['#f5f5f5', '#1f1f1f', '#1f1f1f'], mult: 1.4 },
      { id: 'bear', name: 'Медведь', odds: 75, kind: 'bear', colors: ['#7a4e2d', '#c49a6c', '#1f1f1f'], mult: 1.5 },
      { id: 'penguin', name: 'Пингвин', odds: 150, kind: 'penguin', colors: ['#23272e', '#f4f4f4', '#ffa726'], mult: 1.65 },
      { id: 'raccoon', name: 'Енот', odds: 300, kind: 'raccoon', colors: ['#8a8f96', '#2a2a2a', '#f0f0f0'], mult: 1.8 },
      { id: 'tiger', name: 'Тигр', odds: 600, kind: 'tiger', colors: ['#f08a24', '#fff3df', '#2b2b2b'], mult: 2 },
      { id: 'unicorn', name: 'Единорог', odds: 1200, kind: 'unicorn', colors: ['#fbf7ff', '#ff8ad8', '#ffd84a'], mult: 2.3 },
      { id: 'dragon', name: 'Дракон', odds: 2500, kind: 'dragon', colors: ['#3fa34d', '#c8e86b', '#ff5a36'], mult: 2.6 },
      { id: 'phoenix', name: 'Феникс', odds: 5000, kind: 'phoenix', colors: ['#ff5a1f', '#ffd23a', '#fff4c2'], mult: 3, fx: 'glow' },
      { id: 'goldcat', name: 'Золотая кошка', odds: 10000, kind: 'cat', colors: ['#ffcf40', '#fff0a8', '#2b2b2b'], mult: 3.5, fx: 'gold' },
      { id: 'crystaldragon', name: 'Кристальный дракон', odds: 25000, kind: 'dragon', colors: ['#7fe7ff', '#d8f8ff', '#ffffff'], mult: 4.2, fx: 'crystal' },
      { id: 'rainbowunicorn', name: 'Радужный единорог', odds: 60000, kind: 'unicorn', colors: ['#ffffff', '#ff5ad8', '#5ad8ff'], mult: 5, fx: 'rainbow' },
      { id: 'cosmiccat', name: 'Космический кот', odds: 150000, kind: 'cat', colors: ['#2a1f5c', '#8a6cff', '#ffffff'], mult: 6.5, fx: 'cosmic' },
      { id: 'shadowphoenix', name: 'Тёмный феникс', odds: 400000, kind: 'phoenix', colors: ['#3a1052', '#b13dff', '#ff9cf5'], mult: 8, fx: 'glow' },
      { id: 'titan', name: 'Золотой титан', odds: 1000000, kind: 'dragon', colors: ['#ffc21a', '#fff1a0', '#ff3a3a'], mult: 12, fx: 'gold', scale: 1.4 },
    ],
    baseSpin: 3,            // секунд прокрутки без улучшений
    rollPause: 0.35,        // пауза между автокрутками
    // Улучшения: цена = base * growth^уровень.
    upgrades: {
      luck: { name: 'Удача', max: 25, base: 100, growth: 1.5, step: 0.2 },            // удача = 1 + step * уровень
      speed: { name: 'Скорость прокрутки', max: 12, base: 150, growth: 1.6, factor: 0.85 }, // время = baseSpin * factor^уровень
      dice: { name: 'Питомцев за крутку', max: 2, base: 2000, growth: 6 },            // 1 + уровень
      slots: { name: 'Слоты питомцев', max: 5, base: 400, growth: 3 },                 // 1 + уровень
      auto: { name: 'Автокрутка', max: 1, base: 1000, growth: 1 },
    },
    potion: { name: 'Зелье удачи ×2', price: 300, seconds: 120 },
  },

  // Множители урона по зонам тела.
  hitZones: { head: 3, torso: 1, limb: 0.65 },

  // Оружие и патроны, лежащие в городе (подбираются, появляются снова через respawn секунд).
  pickups: {
    respawn: 60,
    radius: 1.3,
    spots: [
      { x: 8, z: 32, weapon: 'pistol', ammo: 24 },
      { x: -41, z: -2, weapon: 'shotgun', ammo: 10 },       // центральный парк
      { x: 200, z: -40.5, weapon: 'smg', ammo: 90 },        // территория "Пурпурных королей"
      { x: -240.5, z: -200, weapon: 'smg', ammo: 60 },      // территория "Лос Амарильос"
      { x: 58.5, z: 108, weapon: 'shotgun', ammo: 12 },
    ],
  },

  // Банды: территории — это кварталы [i, j] (см. world.blocks). friendly — банда игрока.
  gangs: {
    membersPerBlock: 2,
    aggroRadius: 14,        // враждебная банда нападает, если игрок пешком на её территории ближе этого
    helpRadius: 28,         // на этом расстоянии свои приходят на помощь
    respawnDelay: 40,       // пополнение банды, секунд
    list: [
      { id: 'green', name: 'Семья с Зелёной улицы', color: '#2f9e44', friendly: true, blocks: [[3, 5], [4, 5], [5, 5], [4, 6]] },
      { id: 'purple', name: 'Пурпурные короли', color: '#8e44c9', blocks: [[6, 3], [7, 3], [6, 4], [7, 4], [8, 4]] },
      { id: 'yellow', name: 'Лос Амарильос', color: '#e6b000', blocks: [[1, 2], [2, 2], [1, 3], [2, 3]] },
    ],
  },

  // Розыск и полиция.
  wanted: {
    maxFootCops: 8,         // пеших полицейских максимум (2 на звезду)
    maxCars: 3,             // патрульных машин максимум (со 2-й звезды)
    spawnInterval: 2.5,
    bustTime: 1.2,          // сколько полицейский должен держать игрока (1-2 звезды), чтобы арестовать
    calmTime: 16,           // без преступлений столько секунд (+4 на звезду) — минус звезда
    policeDamageFrom: 3,    // с этого уровня полиция бьёт, а не арестовывает
  },

  // Машины на дорогах.
  traffic: {
    count: 8,
    mobileCount: 5,
    cruiseSpeed: 12,        // ~43 км/ч
    turnSpeed: 6,
    pursuitSpeed: 24,
    laneOffset: 1.75,       // от оси улицы вправо (правостороннее движение)
    spawnMin: 70,
    spawnMax: 170,
    despawnDistance: 260,
    colors: [0xb03a2e, 0x1f618d, 0xd4ac0d, 0x5d6d7e, 0xecf0f1, 0x1e8449, 0x7d3c98, 0x17202a, 0xca6f1e, 0x85929e],
  },

  camera: {
    fov: 65,
    near: 0.3,
    far: 2000,
    sensitivity: 0.0022,
    pitchMin: -0.35,
    pitchMax: 1.25,
    distanceOnFoot: 4.6,
    distanceVehicle: 8.5,
    targetHeightOnFoot: 1.55,
    targetHeightVehicle: 1.5,
    shoulderOffset: 0.35,   // смещение камеры вправо (как в GTA V)
    aimDistance: 2.4,       // прицеливание (ПКМ / ПРИЦЕЛ): камера ближе, за плечом, с зумом
    aimShoulder: 0.75,
    aimFov: 42,
    aimSensitivity: 0.55,
    autoAlignDelay: 1.2,    // через сколько секунд без мыши камера встаёт за машиной
    autoAlignRate: 2.5,
  },

  physics: {
    gravity: 22,
    fixedStep: 1 / 60,      // шаг симуляции; кадр делится на подшаги
    maxFrameTime: 0.1,
  },

  graphics: {
    maxPixelRatio: 2,
    antialias: true,
    softShadows: true,
    shadowMapSize: 2048,
    shadowRange: 75,        // полуразмер области теней вокруг игрока
    fogNear: 180,
    fogFar: 780,
    // Профиль для телефонов/планшетов (включается автоматически в main.js).
    mobile: {
      maxPixelRatio: 1.5,
      antialias: false,
      softShadows: false,
      shadowMapSize: 1024,
      shadowRange: 50,
      fogNear: 120,
      fogFar: 520,
    },
  },
};
