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
    // Здоровье и урон кулаком по ролям.
    roles: {
      civilian: { health: 40, damage: 7, cooldown: 0.6 },
      gang: { health: 60, damage: 8, cooldown: 0.35 },
      police: { health: 70, damage: 9, cooldown: 0.4 },
    },
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
