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
    infiniteAmmo: true,     // бесконечные патроны: магазин не кончается, перезарядка не нужна
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
    count: 36,              // прохожих вокруг игрока; дальние пересоздаются рядом
    mobileCount: 20,
    lodDistance: 42,        // дальше — упрощённая фигура без анимации (crowd.js)
    mobileLodDistance: 30,
    driverVisible: 45,      // водителей дальних машин не рисуем
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

  // Банки (world.js строит здания, heists.js — ограбления). block — квартал [i, j],
  // side — сторона квартала, куда смотрит фасад: 'w' (−X), 'e' (+X), 'n' (−Z), 's' (+Z).
  banks: {
    list: [
      { name: 'Центральный банк', block: [5, 4], side: 'w' },
      { name: 'Банк Вайнвуд', block: [3, 2], side: 's' },
      { name: 'Банк Порт-Сити', block: [6, 6], side: 'n' },
    ],
    duration: 20,           // секунд держаться у входа
    startRadius: 2.8,       // подойти к метке у двери, чтобы начать (E)
    leaveRadius: 16,        // отошёл дальше — ограбление сорвано
    reward: [3000, 7000],
    cooldown: 180,          // банк снова можно грабить через столько секунд
    failCooldown: 30,
    guards: 2,              // охранники выбегают из дверей
    alarmStars: 2,          // сразу столько звёзд розыска (не гаснут, пока идёт ограбление)
  },

  // Магазины 24/7 — маленькие ограбления (те же heists.js, без охраны, 1 звезда).
  stores: {
    list: [
      { name: 'Магазин «Угловой»', block: [4, 3], side: 's' },
      { name: 'Магазин «24 часа»', block: [2, 5], side: 'e' },
      { name: 'Магазин «Бодега»', block: [6, 7], side: 'w' },
      { name: 'Магазин «Продукты»', block: [7, 5], side: 'n' },
    ],
    duration: 8,
    startRadius: 2.5,
    leaveRadius: 12,
    reward: [400, 900],
    cooldown: 120,
    failCooldown: 20,
    guards: 0,
    alarmStars: 1,
  },

  // Репутация банды (progress.js): уровни открывают бонусы отряду. Значения уровня
  // наследуются следующими (указываются только изменения).
  reputation: {
    levels: [
      { at: 0, title: 'Новичок', squad: 3, health: 110, spread: 2, weapons: { smg: 0.45, pistol: 0.35, shotgun: 0.2 } },
      { at: 40, title: 'Боец', health: 150, perk: 'Бойцы крепче: 150 здоровья' },
      { at: 100, title: 'Бывалый', squad: 4, perk: '4 бойца в отряде' },
      { at: 200, title: 'Авторитет', spread: 1.4, weapons: { smg: 0.6, shotgun: 0.4 }, perk: 'Бойцы с автоматами и обрезами, стреляют точнее' },
      { at: 350, title: 'Правая рука', squad: 5, perk: '5 бойцов в отряде' },
      { at: 550, title: 'Босс района', health: 250, perk: 'Бронежилеты: 250 здоровья' },
    ],
    // Очки за дела.
    points: { rivalKill: 1, bank: 12, store: 3, turf: 25, defend: 8 },
  },

  // Войны за районы (turf.js).
  turf: {
    killsToStart: 3,        // столько бандитов убить на их территории за killWindow секунд
    killWindow: 60,
    waves: [3, 4, 5],       // бандитов в каждой волне
    waveDelay: 4,
    leaveRadius: 95,        // от центра квартала; дальше — война проиграна (через leaveGrace с)
    leaveGrace: 8,
    reward: 1000,
    attackEvery: [240, 360], // конкуренты нападают на захваченные районы раз в столько секунд
    attackers: 5,
    defendTime: 120,
  },

  // Задания банды (missions.js, меню — J / кнопка ЗАДАНИЯ).
  missions: {
    garage: { x: -46, z: 100 },   // гараж банды (на дороге у Зелёной улицы)
    steal: { reward: 1500, rep: 12, color: 0xd4af37 },
    clear: { reward: 2000, rep: 15, enemies: 5 },
    store: { reward: 500, rep: 6 },
    delivery: { reward: 1800, rep: 12, time: 120, chasers: 2, color: 0x2e5e3a, minDist: 350, maxDist: 600 },
  },

  // Отряд игрока (squad.js): бойцы его банды ходят за ним и дерутся вместе с ним.
  // Размер отряда, здоровье, оружие и точность бойцов — от уровня репутации (CONFIG.reputation).
  squad: {
    recruitRadius: 35,      // свои бандиты ближе этого присоединяются сразу, остальные прибегают
    runSpeed: 7.6,          // догоняют даже бегущего игрока
    engageRadius: 32,       // на каком расстоянии замечают цели
    leash: 40,              // дальше от игрока не отходят
    driveByRange: 35,       // стрельба из окна машины
    catchUpDistance: 70,    // отставших дальше этого подтягивают к игроку
    fireRateScale: 0.7,     // стреляют чаще обычных NPC (у них CONFIG.npc.gunFireRateScale)
  },

  // Розыск и полиция.
  wanted: {
    footCopsPerStar: 1,     // пеших полицейских на звезду
    maxFootCops: 4,
    carsFrom: 3,            // патрульные машины — с этого уровня (одна на звезду сверх него)
    maxCars: 2,
    spawnInterval: 5,       // секунд между подкреплениями
    bustTime: 1.2,          // сколько полицейский должен держать игрока (1-2 звезды), чтобы арестовать
    calmTime: 10,           // без преступлений столько секунд (+calmPerStar на звезду) — минус звезда
    calmPerStar: 3,
    policeDamageFrom: 3,    // с этого уровня полиция бьёт, а не арестовывает
  },

  // Машины на дорогах.
  traffic: {
    count: 18,
    mobileCount: 10,
    parkedCount: 10,        // машин у бордюров вокруг игрока (в них садятся прохожие)
    mobileParkedCount: 6,
    cruiseSpeed: 12,        // ~43 км/ч
    turnSpeed: 6,
    pursuitSpeed: 24,
    fleeSpeed: 26,          // удирающие (угонщики в случайных событиях)
    detailDistance: 75,     // дальше у машин не рисуются салон, бамперы, фары
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
