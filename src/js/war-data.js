import * as THREE from 'three';

// «Война стран»: данные — страны, звания, роли, приказы, сложность. Логика — war.js.
//
// Страны воюют друг с другом: каждая держит базу в углу поля боя (отдельный участок далеко за городом), на ней штаб президента, казармы, ангар техники.
// Форма солдат — цвет страны; шарф и каска — цвет команды (его видно издалека, он же на миникарте и у флагштоков).
// Флаги рисуются на canvas (drawFlag): для меню, флагштоков на базах и пунктов захвата.

export const COUNTRIES = [
  { id: 'usa', name: 'США', short: 'USA', army: 'Армия США', capital: 'Вашингтон', color: '#2f6fe0', uniform: '#a8946a', pants: '#8c7a56', helmet: '#7d6f4a', camo: 0x6f6040,
    first: ['Джон', 'Майкл', 'Дэвид', 'Райан', 'Джеймс', 'Тайлер', 'Брэд', 'Кайл'], last: ['Миллер', 'Купер', 'Тёрнер', 'Харрис', 'Дэвис', 'Паркер', 'Грин', 'Брукс'], leader: 'Президент США' },
  { id: 'rus', name: 'Россия', short: 'RUS', army: 'Вооружённые силы России', capital: 'Москва', color: '#e0392f', uniform: '#5d6b3a', pants: '#4a5530', helmet: '#4a5530', camo: 0x3d4a2a,
    first: ['Иван', 'Дмитрий', 'Сергей', 'Алексей', 'Андрей', 'Николай', 'Артём', 'Павел'], last: ['Петров', 'Волков', 'Орлов', 'Соколов', 'Морозов', 'Лебедев', 'Зайцев', 'Кузнецов'], leader: 'Президент России' },
  { id: 'chn', name: 'Китай', short: 'CHN', army: 'Народно-освободительная армия', capital: 'Пекин', color: '#f2c230', uniform: '#4e6a45', pants: '#3d5538', helmet: '#3d5538', camo: 0x35502e,
    first: ['Вэй', 'Ли', 'Чен', 'Юн', 'Хао', 'Цзюнь', 'Бо', 'Мин'], last: ['Ван', 'Чжан', 'Лю', 'Янг', 'Хуан', 'Чжао', 'Сунь', 'Ма'], leader: 'Председатель Китая' },
  { id: 'ger', name: 'Германия', short: 'GER', army: 'Бундесвер', capital: 'Берлин', color: '#ff9f1a', uniform: '#6d7467', pants: '#585f52', helmet: '#585f52', camo: 0x4a5244,
    first: ['Ханс', 'Курт', 'Фридрих', 'Лукас', 'Мартин', 'Феликс', 'Йохан', 'Эрик'], last: ['Шмидт', 'Мюллер', 'Вагнер', 'Вебер', 'Фишер', 'Бауэр', 'Клейн', 'Хофман'], leader: 'Канцлер Германии' },
  { id: 'fra', name: 'Франция', short: 'FRA', army: 'Французская армия', capital: 'Париж', color: '#41c7ff', uniform: '#6a7488', pants: '#56607a', helmet: '#56607a', camo: 0x465068,
    first: ['Жан', 'Пьер', 'Луи', 'Антуан', 'Мишель', 'Матьё', 'Жюль', 'Этьен'], last: ['Дюпон', 'Мартен', 'Лефевр', 'Моро', 'Леру', 'Гарнье', 'Бонне', 'Рене'], leader: 'Президент Франции' },
  { id: 'gbr', name: 'Британия', short: 'GBR', army: 'Британская армия', capital: 'Лондон', color: '#e02fd0', uniform: '#7a6a48', pants: '#5f5238', helmet: '#5f5238', camo: 0x544a34,
    first: ['Джек', 'Оливер', 'Гарри', 'Чарли', 'Томас', 'Уильям', 'Джордж', 'Эдвард'], last: ['Смит', 'Тейлор', 'Эванс', 'Хьюз', 'Робертс', 'Уокер', 'Райт', 'Эдвардс'], leader: 'Премьер Британии' },
  { id: 'jpn', name: 'Япония', short: 'JPN', army: 'Силы самообороны Японии', capital: 'Токио', color: '#f2f2f2', uniform: '#7c8454', pants: '#636b42', helmet: '#636b42', camo: 0x535a38,
    first: ['Хиро', 'Кендзи', 'Такеши', 'Рен', 'Юки', 'Дайки', 'Сора', 'Кайто'], last: ['Танака', 'Сато', 'Судзуки', 'Ямада', 'Кобаяси', 'Като', 'Ито', 'Мацумото'], leader: 'Премьер Японии' },
  { id: 'bra', name: 'Бразилия', short: 'BRA', army: 'Бразильская армия', capital: 'Бразилиа', color: '#2ecc40', uniform: '#3f6b3a', pants: '#315530', helmet: '#315530', camo: 0x2a4a28,
    first: ['Жоау', 'Педро', 'Лукас', 'Гилерме', 'Рафаэл', 'Диего', 'Бруно', 'Тьяго'], last: ['Силва', 'Соуза', 'Оливейра', 'Лима', 'Перейра', 'Кошта', 'Алвес', 'Рибейру'], leader: 'Президент Бразилии' },
];

export const countryById = (id) => COUNTRIES.find((c) => c.id === id);

// Звания по числу убитых (по порядку — до 0).
export const RANKS = [
  { at: 0, name: 'Рядовой', short: 'рядовой' },
  { at: 5, name: 'Ефрейтор', short: 'ефр.' },
  { at: 15, name: 'Сержант', short: 'серж.' },
  { at: 30, name: 'Лейтенант', short: 'лейт.' },
  { at: 55, name: 'Капитан', short: 'кап.' },
  { at: 90, name: 'Майор', short: 'майор' },
  { at: 140, name: 'Полковник', short: 'полк.' },
  { at: 220, name: 'Генерал', short: 'ген.' },
];
export function rankFor(kills) {
  let r = RANKS[0];
  for (const x of RANKS) if (kills >= x.at) r = x;
  return r;
}

// Роли игрока.
export const ROLES = {
  president: {
    name: 'Президент', desc: 'Вы — глава страны. Командуйте армией (U), вызывайте технику и авиаудар за деньги, а в бою берите автомат сами. Рядом с вами — охрана. Погибнете — вернётесь в штаб, но армия потеряет билеты.',
    health: 140, funds: 3000, guards: 6,
  },
  soldier: {
    name: 'Солдат', desc: 'Вы — боец на передовой. Растите в званиях за убитых, захватывайте пункты, садитесь в танк, БТР, джип и вертолёт. Ваш президент сидит в штабе — не дайте его убить.',
    health: 110, funds: 600, guards: 0,
  },
};

// Приказы президента армии. cost — цена в деньгах (0 — бесплатно).
export const ORDERS = [
  { id: 'attack', name: 'В атаку!', key: '1', desc: 'Вся пехота идёт на ближайшие чужие пункты и базы', cost: 0 },
  { id: 'defend', name: 'Держать оборону', key: '2', desc: 'Пехота занимает дома и позиции у своих пунктов', cost: 0 },
  { id: 'follow', name: 'За мной!', key: '3', desc: 'Бойцы собираются вокруг вас и идут с вами', cost: 0 },
  { id: 'tank', name: 'Танк', key: '4', desc: 'Танк с базы поедет на фронт', cost: 1200 },
  { id: 'apc', name: 'БТР с десантом', key: '5', desc: 'БТР с отделением доставит бойцов к пункту', cost: 800 },
  { id: 'heli', name: 'Вертолёт', key: '6', desc: 'Ударный вертолёт будет прикрывать с воздуха', cost: 1800 },
  { id: 'strike', name: 'Авиаудар', key: '7', desc: 'Бомбардировка точки, на которую вы смотрите', cost: 700 },
];

// Сложность: билеты, размер армий, точность ИИ, охват врагами.
export const DIFFICULTY = {
  easy: { name: 'Лёгкая', tickets: 100, army: 9, spread: 5, vehicles: 0.7, aggression: 0.7 },
  normal: { name: 'Средняя', tickets: 160, army: 12, spread: 3.4, vehicles: 1, aggression: 1 },
  hard: { name: 'Тяжёлая', tickets: 200, army: 15, spread: 2.4, vehicles: 1.4, aggression: 1.3 },
};

// Состав армии: доли классов бойцов.
export const UNIT_CLASSES = [
  { id: 'rifle', name: 'Стрелок', weapon: 'rifle', weight: 0.5 },
  { id: 'assault', name: 'Штурмовик', weapon: 'smg', weight: 0.2 },
  { id: 'rpg', name: 'Гранатомётчик', weapon: 'rpg', weight: 0.15 },
  { id: 'sniper', name: 'Снайпер', weapon: 'sniper', weight: 0.15 },
];

export const WAR_CONFIG = {
  respawnWave: 5,            // сек между подкреплениями с базы
  waveSize: 3,
  capturePoints: 5,
  captureRadius: 16,
  captureRate: 0.07,          // доля в секунду на одного бойца (с затуханием)
  bleedEvery: 5,              // сек: у отстающих по пунктам — минус билет
  deathTickets: 1,
  presidentDeathTickets: 18,  // игрок-президент погиб
  vehicleTickets: 4,
  enemyPresidentTickets: 999, // убит президент противника — страна сдаётся
  playerRespawn: 6,
  aiVehicleEvery: [60, 95],   // сек: ИИ отправляет технику
  maxVehiclesPerSide: 3,
  visibleDistance: 260,       // на войне видим солдат дальше
  lodDistance: 110,
  freezeDistance: 520,
};

// ---------------------------------------------------------------- Внешность бойцов

const SKINS = ['#f7d9bf', '#f1c9a5', '#e0ac69', '#c68642', '#a57257', '#8d5524'];
const HAIR = ['#1b1b1b', '#2a1e16', '#3b2a1a', '#6b4423', '#a0785a'];

// Солдат страны: куртка и штаны цвета формы, каска и шарф — цвета команды (или формы), ботинки, перчатки.
export function soldierLook(rng, country, cls = 'rifle') {
  const heavy = cls === 'rpg';
  return {
    skin: rng.pick(SKINS), hair: rng.pick(HAIR), hairStyle: rng.pick(['buzz', 'short', 'fade']),
    beard: rng.chance(0.2) ? rng.pick(['stubble', 'short', 'mustache']) : 'none',
    top: 'bomber', shirt: country.uniform, accent: country.pants,
    bottom: 'cargo', pants: country.pants, trim: country.pants,
    shoeStyle: 'boot', shoes: '#161616', gloves: '#1b1b1b',
    hat: country.helmet, hatStyle: cls === 'sniper' ? 'bucket' : 'helmet',
    scarf: country.color, glasses: rng.chance(0.15) ? 'aviator' : null,
    bulk: heavy ? rng.range(1.12, 1.22) : rng.range(1.0, 1.14), scale: rng.range(0.98, 1.06),
  };
}

// Президент: тёмный костюм, галстук цвета страны, без головного убора.
export function presidentLook(rng, country) {
  return {
    skin: rng.pick(SKINS.slice(0, 4)), hair: rng.pick(['#555555', '#8a8f94', '#1b1b1b', '#3b2a1a']), hairStyle: 'slick',
    beard: 'none', top: 'suit', shirt: '#1b2230', shirt2: '#f2f2ee', accent: country.color,
    bottom: 'slim', pants: '#1b2230', shoeStyle: 'dress', shoes: '#0c0c0c', glasses: rng.chance(0.4) ? 'round' : null,
    watch: '#c9c9c9', bulk: 1.05, scale: 1.02,
  };
}

// Форма игрока в войне: как у солдата, но заметнее — шарф команды и погоны званием не рисуем.
export function playerWarLook(country, role) {
  return role === 'president'
    ? { top: 'suit', shirt: '#1b2230', shirt2: '#f2f2ee', accent: country.color, bottom: 'slim', pants: '#1b2230', shoes: '#0c0c0c', shoeStyle: 'dress', hat: null, hatStyle: undefined, scarf: null }
    : { top: 'bomber', shirt: country.uniform, accent: country.pants, bottom: 'cargo', pants: country.pants, trim: country.pants, shoeStyle: 'boot', shoes: '#161616', gloves: '#1b1b1b', hat: country.helmet, hatStyle: 'helmet', scarf: country.color };
}

// ---------------------------------------------------------------- Флаги

// Рисует флаг страны на 2D-контекст размера w x h.
export function drawFlag(ctx, id, w, h) {
  const rect = (c, x, y, ww, hh) => { ctx.fillStyle = c; ctx.fillRect(x, y, ww, hh); };
  const star = (cx, cy, R, c, rot = -Math.PI / 2) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.4 : R;
      const a = rot + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  };
  switch (id) {
    case 'usa': {
      for (let i = 0; i < 13; i++) rect(i % 2 ? '#ffffff' : '#b22234', 0, (h * i) / 13, w, h / 13 + 1);
      rect('#3c3b6e', 0, 0, w * 0.42, (h * 7) / 13);
      ctx.fillStyle = '#fff';
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) ctx.fillRect(w * 0.04 + c * w * 0.075, h * 0.05 + r * h * 0.12, w * 0.025, w * 0.025);
      break;
    }
    case 'rus':
      rect('#ffffff', 0, 0, w, h / 3); rect('#0039a6', 0, h / 3, w, h / 3); rect('#d52b1e', 0, (h * 2) / 3, w, h / 3 + 1);
      break;
    case 'chn':
      rect('#de2910', 0, 0, w, h);
      star(w * 0.18, h * 0.27, h * 0.2, '#ffde00');
      for (const [x, y] of [[0.36, 0.1], [0.43, 0.2], [0.43, 0.34], [0.36, 0.44]]) star(w * x, h * y, h * 0.06, '#ffde00');
      break;
    case 'ger':
      rect('#000000', 0, 0, w, h / 3); rect('#dd0000', 0, h / 3, w, h / 3); rect('#ffce00', 0, (h * 2) / 3, w, h / 3 + 1);
      break;
    case 'fra':
      rect('#0055a4', 0, 0, w / 3, h); rect('#ffffff', w / 3, 0, w / 3, h); rect('#ef4135', (w * 2) / 3, 0, w / 3 + 1, h);
      break;
    case 'gbr': {
      rect('#012169', 0, 0, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = h * 0.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
      ctx.strokeStyle = '#c8102e'; ctx.lineWidth = h * 0.08;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
      rect('#ffffff', w * 0.4, 0, w * 0.2, h); rect('#ffffff', 0, h * 0.36, w, h * 0.28);
      rect('#c8102e', w * 0.44, 0, w * 0.12, h); rect('#c8102e', 0, h * 0.42, w, h * 0.16);
      break;
    }
    case 'jpn':
      rect('#ffffff', 0, 0, w, h);
      ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bra':
      rect('#009c3b', 0, 0, w, h);
      ctx.fillStyle = '#ffdf00'; ctx.beginPath(); ctx.moveTo(w / 2, h * 0.1); ctx.lineTo(w * 0.9, h / 2); ctx.lineTo(w / 2, h * 0.9); ctx.lineTo(w * 0.1, h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#002776'; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * 0.24, 0, Math.PI * 2); ctx.fill();
      rect('#ffffff', w * 0.32, h * 0.46, w * 0.36, h * 0.07);
      break;
    default:
      rect('#888', 0, 0, w, h);
  }
}

export function flagCanvas(id, w = 96, h = 64) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  drawFlag(c.getContext('2d'), id, w, h);
  return c;
}

const FLAG_TEX = new Map();
export function flagTexture(id) {
  if (!FLAG_TEX.has(id)) {
    const t = new THREE.CanvasTexture(flagCanvas(id, 192, 128));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    FLAG_TEX.set(id, t);
  }
  return FLAG_TEX.get(id);
}
