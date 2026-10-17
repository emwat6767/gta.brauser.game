import { SKIN, HAIR, civilianLook, guardLook, policeLook } from '../js/outfits.js';

// Люди школы на основе готовых NPC Open City (Humanoid + гардероб + образы горожан):
// ученики в школьной форме или в своём, учителя, охранник, повар, медсестра, уборщица,
// а для сценариев — террорист, зомби, полиция (спецназ) и пожарные. Имена — русские.

const BOYS = ['Артём', 'Максим', 'Иван', 'Кирилл', 'Дима', 'Егор', 'Миша', 'Саша', 'Никита', 'Лёша', 'Матвей', 'Даня', 'Тимур', 'Глеб', 'Рома', 'Паша', 'Влад', 'Костя', 'Ярик', 'Федя'];
const GIRLS = ['Аня', 'Маша', 'Соня', 'Вика', 'Настя', 'Полина', 'Катя', 'Даша', 'Алиса', 'Лиза', 'Вера', 'Ксюша', 'Милана', 'Ева', 'Варя', 'Таня', 'Уля', 'Арина', 'Зоя', 'Юля'];
const SURNAMES = ['Иванов', 'Смирнов', 'Кузнецов', 'Попов', 'Волков', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Петров', 'Орлов', 'Зайцев', 'Медведев', 'Белов', 'Фролов', 'Комаров', 'Егоров', 'Титов', 'Миронов'];

export const TEACHERS = [
  { name: 'Игорь Валентинович', subject: 'физика', fem: false, brave: 0.6 },
  { name: 'Мария Ивановна', subject: 'математика', fem: true, brave: 0.5 },
  { name: 'Анна Викторовна', subject: 'литература', fem: true, brave: 0.45 },
  { name: 'Ольга Николаевна', subject: 'химия', fem: true, brave: 0.55 },
  { name: 'Елена Сергеевна', subject: 'биология', fem: true, brave: 0.5 },
  { name: 'Сергей Петрович', subject: 'физкультура', fem: false, brave: 0.95, pe: true },
  { name: 'Наталья Юрьевна', subject: 'английский', fem: true, brave: 0.4 },
];

export const STAFF = {
  guard: { name: 'Виктор Палыч', role: 'охранник' },
  cook: { name: 'Галина Степановна', role: 'повар' },
  nurse: { name: 'Людмила Петровна', role: 'медсестра' },
  cleaner: { name: 'баба Нюра', role: 'уборщица' },
  principal: { name: 'Татьяна Михайловна', role: 'директор' },
};

// Классы на текущем уроке: название, кабинет, учитель (индекс в TEACHERS), предмет на HUD.
export const CLASSES = [
  { name: '9 «А»', room: 'c104', teacher: 0, subject: 'Физика', player: true },
  { name: '7 «Б»', room: 'c202', teacher: 1, subject: 'Математика' },
  { name: '8 «В»', room: 'c203', teacher: 2, subject: 'Литература' },
  { name: '10 «А»', room: 'chem', teacher: 3, subject: 'Химия' },
  { name: '6 «А»', room: 'gym', teacher: 5, subject: 'Физкультура' },
  { name: '5 «В»', room: 'c207', teacher: 4, subject: 'Биология' },
  { name: '11 «Б»', room: 'c102', teacher: 6, subject: 'Английский' },
];

const UNIFORM_JACKET = ['#1f2d4a', '#2b2f3a', '#3a2a3a', '#24324a', '#2a3a30'];
const pickW = (rng, table) => {
  let t = 0;
  for (const [, w] of table) t += w;
  let r = rng.next() * t;
  for (const [v, w] of table) if ((r -= w) < 0) return v;
  return table[0][0];
};

// Ученик: половина — в школьной форме (пиджак/жилет, рубашка, брюки/юбка), остальные — в своём.
export function studentLook(rng, fem, grade = 8) {
  const skin = rng.pick(SKIN.slice(0, 7));
  const hair = rng.pick(HAIR.slice(0, 7));
  const scale = 0.84 + Math.min(11, grade) * 0.012 + rng.range(-0.03, 0.03);
  if (rng.chance(0.55)) {
    const jacket = rng.pick(UNIFORM_JACKET);
    const vest = rng.chance(0.4);
    return {
      skin, hair, scale, bulk: rng.range(0.88, 1.0),
      top: vest ? 'vest' : 'suit', shirt: jacket, shirt2: rng.pick(['#f4f4f4', '#e8eef8', '#f4f4f4']), accent: rng.pick(['#7a1f1f', '#1d3f80', '#2a2a2a']),
      bottom: fem ? (rng.chance(0.75) ? 'skirt' : 'slim') : 'slim', pants: fem ? jacket : rng.pick(['#1c1f26', jacket]),
      legs: fem ? rng.pick(['#2a2a2a', '#e9dccf', '#1c1c1c']) : undefined,
      shoes: '#141414', shoeStyle: rng.chance(0.6) ? 'dress' : 'sneaker',
      hairStyle: fem ? pickW(rng, [['long', 3], ['ponytail', 4], ['bob', 2], ['bun', 2]]) : pickW(rng, [['short', 4], ['fade', 3], ['buzz', 2], ['default', 3], ['curly', 1]]),
      beard: 'none', backpack: rng.chance(0.3) ? rng.pick(['#2d6fb3', '#c0392b', '#2a2a2a', '#e84393']) : null,
      glasses: rng.chance(0.12) ? 'round' : null,
    };
  }
  const base = civilianLook(rng, { district: rng.chance(0.5) ? 'park' : 'suburb' });
  return {
    ...base, skin, hair, scale, bulk: rng.range(0.86, 1.0), beard: 'none', tattoo: 0, chain: null, watch: null,
    hairStyle: fem ? pickW(rng, [['long', 3], ['ponytail', 4], ['bob', 2], ['bun', 2], ['curly', 1]]) : pickW(rng, [['short', 4], ['fade', 3], ['buzz', 2], ['default', 3], ['curly', 1], ['mohawk', 0.3]]),
    top: fem && base.top === 'dress' ? 'hoodie' : base.top === 'suit' ? 'hoodie' : base.top,
    bottom: fem ? rng.pick(['jeans', 'skirt', 'leggings', 'jeans']) : rng.pick(['jeans', 'joggers', 'jeans', 'cargo']),
    hat: null, hatStyle: undefined, glasses: rng.chance(0.1) ? 'round' : null,
    backpack: rng.chance(0.35) ? rng.pick(['#2d6fb3', '#c0392b', '#2a2a2a', '#e84393', '#27ae60']) : null,
  };
}

export function teacherLook(rng, t) {
  if (t.pe) {
    return {
      skin: rng.pick(SKIN.slice(0, 6)), hair: '#2a1e16', hairStyle: 'buzz', beard: 'stubble', scale: 1.04, bulk: 1.12,
      top: 'track', shirt: '#1d4fa0', accent: '#f4f4f4', bottom: 'joggers', pants: '#1d4fa0', trim: '#f4f4f4',
      shoes: '#f2f2f2', shoeStyle: 'sneaker', chain: '#c8c8c8', watch: '#2a2a2a',
    };
  }
  const skin = rng.pick(SKIN.slice(0, 6));
  if (t.fem) {
    const dress = rng.chance(0.5);
    const c = rng.pick(['#5a2a3a', '#2a3a5a', '#3a4a3a', '#6a4a3a', '#4a3a5a', '#7a2430']);
    return {
      skin, hair: rng.pick(['#3b2a1a', '#6b4423', '#a0785a', '#2a1e16', '#8a8f94', '#d6b370']),
      hairStyle: rng.pick(['bun', 'bob', 'long', 'bun']), beard: 'none', scale: rng.range(0.96, 1.02), bulk: rng.range(0.95, 1.08),
      top: dress ? 'dress' : rng.pick(['turtle', 'suit']), shirt: c, shirt2: '#f4f4f4', accent: '#d9b13b',
      bottom: dress ? 'skirt' : 'skirt', pants: dress ? c : rng.pick(['#2a2a2a', '#3a3a4a']), legs: '#d8c0a8',
      shoes: '#2a1a14', shoeStyle: 'dress', glasses: rng.chance(0.5) ? 'round' : null,
    };
  }
  return {
    skin, hair: rng.pick(['#3b2a1a', '#555555', '#8a8f94', '#2a1e16']), hairStyle: rng.pick(['short', 'slick', 'bald']),
    beard: rng.pick(['none', 'mustache', 'short']), scale: 1.02, bulk: 1.05,
    top: 'suit', shirt: rng.pick(['#3a3f4b', '#4a3b2a', '#24324a']), shirt2: '#f4f4f4', accent: '#7a1f1f',
    bottom: 'slim', pants: '#2b2f3a', shoes: '#1a1410', shoeStyle: 'dress', glasses: rng.chance(0.6) ? 'round' : null,
  };
}

export function staffLook(rng, kind) {
  if (kind === 'guard') return { ...guardLook(rng), glasses: null, top: 'polo', shirt: '#1c1f26', accent: '#c9a85a', scale: 1.04, hair: '#555555' };
  if (kind === 'cook') return { skin: rng.pick(SKIN.slice(0, 5)), hair: '#6b4423', hairStyle: 'bun', top: 'tee', shirt: '#f4f4f4', bottom: 'skirt', pants: '#f4f4f4', legs: '#d8c0a8', shoes: '#f4f4f4', hat: '#f4f4f4', hatStyle: 'beanie', bulk: 1.25, scale: 0.98 };
  if (kind === 'nurse') return { skin: rng.pick(SKIN.slice(0, 5)), hair: '#d6b370', hairStyle: 'bob', top: 'tee', shirt: '#eaf6f4', accent: '#d62c2c', bottom: 'slim', pants: '#eaf6f4', shoes: '#f4f4f4', scale: 0.97 };
  if (kind === 'cleaner') return { skin: rng.pick(SKIN.slice(0, 5)), hair: '#8a8f94', hairStyle: 'bun', top: 'vest', shirt: '#2d6fb3', shirt2: '#e8e0d0', bottom: 'skirt', pants: '#3a3a4a', legs: '#8a6a5a', shoes: '#3a2a20', scarf: '#c0392b', bulk: 1.15, scale: 0.94 };
  if (kind === 'principal') return { skin: rng.pick(SKIN.slice(0, 5)), hair: '#2a1e16', hairStyle: 'bun', top: 'suit', shirt: '#1d2433', shirt2: '#f4f4f4', accent: '#d9b13b', bottom: 'skirt', pants: '#1d2433', legs: '#d8c0a8', shoes: '#141414', shoeStyle: 'dress', glasses: 'round', scale: 1.0 };
  return civilianLook(rng);
}

// Угрозы и спасатели.
export function intruderLook(rng) {
  return {
    skin: rng.pick(SKIN.slice(0, 6)), hair: '#141414', hairStyle: 'buzz', beard: 'none',
    top: 'hoodie', shirt: '#1a1a1c', accent: '#2a2a2c', bottom: 'cargo', pants: '#2b2b26', trim: '#1a1a1a',
    shoes: '#0c0c0c', shoeStyle: 'boot', hat: '#121212', hatStyle: 'beanie', mask: '#121212', gloves: '#111111',
    bulk: rng.range(1.08, 1.2), scale: rng.range(1.0, 1.06), glasses: null,
  };
}

const ZOMBIE_SKIN = ['#8fa58a', '#9aab8e', '#7f9a84', '#a3b09a', '#889c80'];
// Зомби — тот же человек, но кожа серо-зелёная, одежда грязнее, глаза красные.
export function zombieLook(look, rng) {
  const dirty = (hex, k = 0.62) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(v * k + 40 * (1 - k)).toString(16).padStart(2, '0');
    return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
  };
  const out = { ...look, skin: rng.pick(ZOMBIE_SKIN), eye: '#d22020' };
  for (const k of ['shirt', 'pants', 'shirt2', 'accent', 'trim', 'shoes']) if (out[k]) out[k] = dirty(out[k]);
  out.hair = dirty(out.hair ?? '#333333', 0.7);
  out.backpack = null;
  out.glasses = null;
  return out;
}

export function swatLook(rng) {
  return {
    ...policeLook(rng), top: 'puffer', shirt: '#1c2230', accent: '#2a3446', bottom: 'cargo', pants: '#1c2230',
    hat: '#151a24', hatStyle: 'helmet', glasses: 'shades', gloves: '#111111', mask: '#151a24', bulk: 1.18,
  };
}

export function firefighterLook(rng) {
  return {
    skin: rng.pick(SKIN.slice(0, 6)), hair: '#2a1e16', hairStyle: 'short', beard: rng.chance(0.4) ? 'mustache' : 'none',
    top: 'puffer', shirt: '#2a2a2e', accent: '#e8d23a', bottom: 'cargo', pants: '#2a2a2e', trim: '#e8d23a',
    shoes: '#111111', shoeStyle: 'boot', hat: '#c62828', hatStyle: 'helmet', gloves: '#3a2a1a', bulk: 1.2, scale: 1.04,
  };
}

let nameCounter = 0;
export function studentName(rng, fem) {
  const first = rng.pick(fem ? GIRLS : BOYS);
  const sur = rng.pick(SURNAMES) + (fem ? 'а' : '');
  nameCounter++;
  return { first, full: `${first} ${sur}` };
}
