import { FIGHTER_ROWS, ROSTER_LOOKS } from './fighters-data.js';
import { createRng } from './utils.js';

// Готовые бойцы из артефакта «UFC Бойцы» как жители города: у каждого свои имя, прозвище, страна,
// стиль, рост, телосложение и фирменный образ (спортивный костюм в цветах страны, куртка-варсити,
// кожанка, костюм для пресс-конференции или зальная форма). Внешность детерминирована от id —
// боец всегда выглядит одинаково, где бы ни появился. Чемпионы носят золотой пояс.
// Силу задаёт мастерство и стиль: чем выше — тем больше здоровья и тем тяжелее удар.

export const STYLE_NAMES = { boxer: 'Боксёр', kickboxer: 'Кикбоксер', brawler: 'Панчер', wrestler: 'Борец' };
export const GROUP_NAMES = {
  ufc: 'UFC', cw: 'Cage Warriors', aca: 'ACA', pfl: 'PFL', legend: 'Легенда', orig: 'UFC', gorilla: 'Горилла', boss: 'Босс горилл',
};

// Цвета флагов: основной, второй, третий.
const FLAG = {
  RU: ['#f2f2f2', '#1c4fa0', '#d52b1e'], BR: ['#1ea64b', '#f6d51e', '#1b3f95'], US: ['#b22234', '#f2f2f2', '#3c3b6e'],
  GB: ['#1c2f6e', '#f2f2f2', '#c8102e'], IE: ['#169b62', '#f2f2f2', '#ff883e'], AU: ['#0f6d3a', '#f6c518', '#f2f2f2'],
  FR: ['#1c3f94', '#f2f2f2', '#e1000f'], ES: ['#c60b1e', '#ffc400', '#7a0a14'], AM: ['#d90012', '#0033a0', '#f2a800'],
  KZ: ['#00afca', '#fedf00', '#f2f2f2'], GE: ['#f2f2f2', '#d00a1a', '#101010'], PL: ['#f2f2f2', '#dc143c', '#101010'],
  MD: ['#0046ae', '#ffd200', '#cc092f'], KG: ['#e8112d', '#ffef00', '#a30b21'], AZ: ['#0092bc', '#e8112d', '#3f9c35'],
  MA: ['#c1272d', '#006233', '#f2f2f2'], CA: ['#d80621', '#f2f2f2', '#7a0a14'], SE: ['#006aa7', '#fecc02', '#f2f2f2'],
  NG: ['#008751', '#f2f2f2', '#00562f'], DO: ['#002d62', '#ce1126', '#f2f2f2'], EC: ['#ffd100', '#034ea2', '#ef3340'],
  RS: ['#c6363c', '#0c4076', '#f2f2f2'], UA: ['#0057b7', '#ffd700', '#f2f2f2'], HR: ['#c8102e', '#f2f2f2', '#171796'],
  MX: ['#006847', '#f2f2f2', '#ce1126'], JP: ['#f2f2f2', '#bc002d', '#101010'], AR: ['#74acdf', '#f2f2f2', '#f6b40e'],
  DEFAULT: ['#2a2f3a', '#d8b24a', '#f2f2f2'],
};

// Оттенки кожи по стране: вероятности [светлая, средняя, тёмная].
const SKIN_BY_FLAG = {
  NG: [0.02, 0.18, 0.8], DO: [0.1, 0.5, 0.4], EC: [0.1, 0.7, 0.2], BR: [0.25, 0.45, 0.3], US: [0.4, 0.3, 0.3], MX: [0.15, 0.75, 0.1],
  AR: [0.4, 0.55, 0.05], MA: [0.1, 0.8, 0.1], AM: [0.3, 0.7, 0], KZ: [0.35, 0.65, 0], KG: [0.3, 0.7, 0], AZ: [0.3, 0.7, 0], ES: [0.45, 0.55, 0],
  JP: [0.5, 0.5, 0], GE: [0.45, 0.55, 0], RS: [0.7, 0.3, 0], HR: [0.8, 0.2, 0],
};
const LIGHT = ['#f7d9bf', '#f1c9a5', '#ffdbac', '#e6bd9c'];
const MEDIUM = ['#e0ac69', '#d6a57c', '#c99a74', '#c68642', '#dcb088'];
const DARKS = ['#8d5524', '#6b4430', '#4a2f22', '#a57257', '#7d5236'];

const HAIR_STYLES = ['bald', 'buzz', 'buzz', 'short', 'short', 'fade', 'fade', 'curly', 'slick', 'long', 'mohawk', 'bun'];
const BEARDS = ['none', 'none', 'stubble', 'stubble', 'short', 'full', 'full', 'goatee', 'thick'];
const GOLD = '#d9b13b';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function weighted(rng, table) {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = rng.next() * total;
  for (const [v, w] of table) if ((r -= w) < 0) return v;
  return table[0][0];
}

function skinFor(rng, flag) {
  const [l, m] = SKIN_BY_FLAG[flag] ?? [0.8, 0.2, 0];
  const r = rng.next();
  return rng.pick(r < l ? LIGHT : r < l + m ? MEDIUM : DARKS);
}

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const darkest = (list) => list.reduce((a, b) => (lum(a) <= lum(b) ? a : b));

// ---------------------------------------------------------------- список бойцов
export const FIGHTERS = FIGHTER_ROWS.map(([id, name, nick, flag, style, south, height, skill, div, group, rank]) => ({
  id, name, nick, flag, style, southpaw: !!south, height, skill, div, group, rank,
  champion: rank === 0 && (group === 'ufc' || group === 'orig'),
  monster: group === 'gorilla' || group === 'boss',
}));
const BY_ID = new Map(FIGHTERS.map((f) => [f.id, f]));
export const fighterById = (id) => BY_ID.get(id);

// ---------------------------------------------------------------- образ
const looks = new Map();

export function fighterLook(f) {
  let L = looks.get(f.id);
  if (!L) looks.set(f.id, (L = buildLook(f)));
  return L;
}

function buildLook(f) {
  const rng = createRng(hash(f.id));
  const P = FLAG[f.flag] ?? FLAG.DEFAULT;
  const R = ROSTER_LOOKS[f.id];
  const skin = R?.skin ?? skinFor(rng, f.flag);
  const dk = lum(skin) < 0.45;
  const hair = R?.hair ?? (dk ? rng.pick(['#0e0a07', '#1a120c', '#2a1e16']) : rng.pick(['#0e0a07', '#1a120c', '#2a1e16', '#3b2a1c', '#5a4632', '#6b3f22', '#9a6a3a', '#b99a6a']));
  const hairStyle = R?.hs ?? (f.monster ? rng.pick(['bald', 'buzz', 'mohawk']) : rng.pick(HAIR_STYLES));
  const beard = R?.beard ?? (f.monster ? rng.pick(['full', 'thick', 'goatee']) : rng.pick(BEARDS));
  const tatRaw = R ? R.tattoo : rng.chance(0.45) ? rng.int(1, 9) : 0;
  const tattoo = f.monster ? rng.int(3, 4) : tatRaw ? 1 + (tatRaw % 4) : 0;

  // Телосложение по дивизиону и build ростера.
  const divBulk = { fw: 0.94, lw: 0.98, ww: 1.04, hw: 1.2 }[f.div] ?? 1;
  let bulk = divBulk + (R ? (R.build - 0.78) * 0.22 : rng.range(-0.03, 0.05));
  if (f.group === 'gorilla') bulk = 1.42;
  if (f.group === 'boss') bulk = 1.52;
  const scale = (f.group === 'boss' ? f.height * 1.05 : f.height) / 1.8;

  const main = R?.shorts ?? P[0];
  const trim = R?.trim ?? P[1];
  const kind = f.group === 'gorilla' ? 'gym' : f.group === 'boss' ? 'leather'
    : weighted(rng, f.group === 'legend'
      ? [['suit', 40], ['team', 20], ['street', 20], ['polo', 20]]
      : [['team', 30], ['gym', 24], ['street', 18], ['suit', 12], ['leather', 8], ['varsity', 8]]);
  const shades = rng.chance(0.3) ? rng.pick(['shades', 'aviator', 'visor']) : null;
  const chain = f.champion || rng.chance(0.35) ? GOLD : null;

  const look = {
    skin, hair, hairStyle, beard, tattoo, bulk, scale, eye: R?.eye,
    champ: f.champion, chain,
  };
  const sneaker = { shoeStyle: 'hightop', shoes: '#f2f2f2', shoeAccent: P[2] };

  switch (kind) {
    case 'team':
      Object.assign(look, {
        top: 'track', shirt: P[0], accent: P[1], bottom: 'joggers', pants: darkest([P[2], '#15151a', '#1c1c22']), trim: P[1],
        ...sneaker, glasses: shades,
        ...(rng.chance(0.5) ? { hat: P[1] === '#f2f2f2' ? P[0] : P[1], hatStyle: rng.pick(['snapback', 'backcap']) } : {}),
      });
      break;
    case 'gym':
      Object.assign(look, {
        top: 'tank', shirt: rng.pick(['#111113', '#f2f2f2', main]), bottom: 'fightshorts', pants: main, trim,
        shoeStyle: 'sneaker', shoes: '#111111', shoeAccent: trim,
        ...(rng.chance(0.3) ? { gloves: '#b3121b', glove: 'boxing' } : { wraps: '#f0f0f0' }),
        ...(rng.chance(0.35) ? { hat: trim, hatStyle: 'headband' } : {}),
      });
      break;
    case 'street':
      Object.assign(look, {
        top: 'hoodie', shirt: lum(main) > 0.7 ? '#2a2f3a' : main, accent: trim, bottom: rng.pick(['joggers', 'cargo']), pants: rng.pick(['#15151a', '#1c1c22', '#3a3a3a']),
        trim, ...sneaker, glasses: shades,
        ...(rng.chance(0.4) ? { hat: '#111111', hatStyle: rng.pick(['snapback', 'beanie']) } : {}),
      });
      break;
    case 'suit': {
      const suit = rng.pick(['#14161c', '#1d2433', '#2b2f3a', '#24324a']);
      Object.assign(look, {
        top: 'suit', shirt: suit, shirt2: '#f4f4f4', accent: trim, bottom: 'slim', pants: suit, shoeStyle: 'dress', shoes: '#111111',
        watch: rng.pick(['#c9c9c9', GOLD]), glasses: shades && rng.chance(0.5) ? shades : null,
      });
      break;
    }
    case 'leather':
      Object.assign(look, {
        top: 'leather', shirt: rng.pick(['#1b1b1d', '#241a14', '#101820']), shirt2: rng.pick(['#e8e8e8', '#111111']), accent: '#c9c9c9', bottom: 'jeans',
        pants: rng.pick(['#26364d', '#1a1a1f', '#34507e']), shoeStyle: 'boot', shoes: '#151515', glasses: f.monster ? 'shades' : shades, chain: GOLD,
      });
      break;
    case 'varsity':
      Object.assign(look, {
        top: 'varsity', shirt: darkest([P[2], P[1], '#1c1f26']), accent: P[0] === '#f2f2f2' ? P[1] : P[0], bottom: 'jeans', pants: rng.pick(['#26364d', '#1a1a1f', '#3e5c76']),
        shoeStyle: 'sneaker', shoes: '#f2f2f2', shoeAccent: P[0], glasses: shades,
      });
      break;
    case 'polo':
    default:
      Object.assign(look, {
        top: 'polo', shirt: rng.pick(['#1c1f26', '#e4dfd2', '#1d2433', '#4f5d3a']), accent: trim, bottom: 'slim', pants: rng.pick(['#c2b280', '#2b2f3a', '#d8d2c4']),
        shoeStyle: 'dress', shoes: '#2a1a10', watch: '#c9c9c9', glasses: rng.pick(['round', 'aviator', null]),
      });
  }
  look.kind = kind;
  return look;
}

// Образ для тренировки: когда боец разминается, он в зальной форме с боксёрскими бинтами.
export function gymLook(f) {
  const base = fighterLook(f);
  const R = ROSTER_LOOKS[f.id];
  const P = FLAG[f.flag] ?? FLAG.DEFAULT;
  return {
    ...base, top: 'tank', shirt: '#111113', bottom: 'fightshorts', pants: R?.shorts ?? P[0], trim: R?.trim ?? P[1],
    shoeStyle: 'sneaker', shoes: '#111111', wraps: '#f0f0f0', gloves: null, chain: null, hat: null, hatStyle: undefined,
  };
}

// ---------------------------------------------------------------- боевые характеристики
export function fighterStats(f) {
  const s = f.skill;
  let health = 70 + (s - 60) * 1.7;
  let damage = 6 + s * 0.12;
  let cooldown = 0.62 - s * 0.0032;
  let resist = 5;           // сколько ударов подряд нужно, чтобы сбить с ног (у обычных — 3)
  if (f.div === 'hw') { health *= 1.25; damage *= 1.2; }
  if (f.champion) { health *= 1.2; damage *= 1.1; }
  if (f.group === 'gorilla') { health = 420; damage = 30; cooldown = 0.9; resist = 9; }
  if (f.group === 'boss') { health = 800; damage = 42; cooldown = 0.8; resist = 99; }
  // Стиль: панчер бьёт сильнее, боксёр — чаще.
  if (f.style === 'brawler') damage *= 1.12;
  if (f.style === 'boxer') cooldown *= 0.88;
  return { health: Math.round(health), damage: Math.round(damage), cooldown, resist, speedMul: f.monster ? 0.9 : 1 + (s - 70) * 0.003 };
}

// Табличка над головой: «Имя «Прозвище»» + строка со страной, стилем и статусом.
export function fighterTag(f) {
  const status = f.champion ? 'Чемпион' : f.group === 'legend' ? 'Легенда' : f.group === 'boss' ? 'Босс горилл'
    : f.group === 'gorilla' ? 'Гигант' : f.rank ? `№${f.rank} рейтинга` : '';
  const league = f.monster || f.group === 'legend' ? '' : GROUP_NAMES[f.group] ?? '';
  return {
    title: `${f.name} «${f.nick}»`,
    sub: [f.flag, STYLE_NAMES[f.style], status, league].filter(Boolean).join(' · '),
    gold: f.champion || f.group === 'legend' || f.group === 'boss',
  };
}

// Какие бойцы сейчас гуляют по городу: чтобы один и тот же не появился дважды.
export class FighterPool {
  constructor() {
    this.active = new Set();
  }

  // Случайный свободный боец; редкие (чемпионы, легенды, гориллы) выпадают реже.
  take(rng, { allowMonsters = true } = {}) {
    for (let k = 0; k < 40; k++) {
      const f = rng.pick(FIGHTERS);
      if (this.active.has(f.id)) continue;
      if (f.monster && (!allowMonsters || !rng.chance(0.18))) continue;
      if ((f.champion || f.group === 'legend') && !rng.chance(0.5)) continue;
      this.active.add(f.id);
      return f;
    }
    return null;
  }

  release(f) {
    if (f) this.active.delete(f.id);
  }
}
