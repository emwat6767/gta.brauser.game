// Образы горожан: подбор одежды, причёсок и аксессуаров для прохожих, банд и полиции.
// Описание полей look — в wardrobe.js. Образы собираются по "архетипам" (уличный стиль, деловой,
// спорт, турист, байкер...) из подобранных палитр, а не из случайных цветов — поэтому люди
// выглядят одетыми, а не раскрашенными: цвета рубашки, брюк и обуви сочетаются.

const GOLD = '#d9b13b';

export const SKIN = ['#f7d9bf', '#f1c9a5', '#ffdbac', '#e0ac69', '#d6a57c', '#c68642', '#a57257', '#8d5524', '#6b4430', '#4a2f22'];
export const HAIR = ['#1b1b1b', '#1b1b1b', '#2a1e16', '#3b2a1a', '#6b4423', '#a0785a', '#d6b370', '#555555', '#8a8f94', '#7a2f1a'];
const HAIR_FUN = ['#e84393', '#2d7fd6', '#27ae60', '#8e44ad', '#f39c12'];

const NEUTRAL = ['#1c1f26', '#2b2f3a', '#3a3f4b', '#f2f2ee', '#e4dfd2', '#8a8f98', '#b7b9bd', '#111111'];
const EARTH = ['#6b5a3a', '#8a6b45', '#4f5d3a', '#3a4a35', '#7a4a2a', '#a67c52', '#5a4632'];
const BOLD = ['#c0392b', '#d35400', '#f39c12', '#e6b422', '#2980b9', '#1f4e8c', '#16a085', '#27ae60', '#8e44ad', '#c2185b', '#e84393', '#00a8a8'];
const PASTEL = ['#a7c7e7', '#f4b6c2', '#c5e1a5', '#ffe08a', '#d1c4e9', '#ffd6a5'];
const DENIM = ['#2c3e50', '#34507e', '#3e5c76', '#1f2d3d', '#4a6fa5', '#26364d'];
const DARK = ['#212121', '#1a1a1f', '#2b2b30', '#3a3a3a', '#15151a'];
const KHAKI = ['#5d4037', '#7a6a4f', '#6b6b4a', '#c2b280', '#8a7f6a', '#d8d2c4'];
const SUITS = ['#14161c', '#1d2433', '#2b2f3a', '#3a3f4b', '#4a3b2a', '#24324a', '#f0efe9'];
const SHOES = ['#111111', '#f2f2f2', '#f2f2f2', '#5d4037', '#333333', '#c0392b', '#2d7fd6', '#e6b422'];
const LEATHER = ['#1b1b1d', '#241a14', '#3a1d14', '#101820'];

const weighted = (rng, table) => {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = rng.next() * total;
  for (const [v, w] of table) if ((r -= w) < 0) return v;
  return table[0][0];
};

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
// Второй цвет к основному: тёмное оттеняется светлым, светлое — тёмным или ярким.
const accentFor = (rng, main) => (lum(main) < 0.4
  ? rng.pick(['#f2f2f2', GOLD, '#e84393', '#2d7fd6', '#f39c12', '#27ae60'])
  : rng.pick(['#1c1f26', '#c0392b', '#1f4e8c', '#111111']));

const HAIR_STYLES = [['default', 16], ['short', 12], ['buzz', 8], ['fade', 9], ['curly', 8], ['slick', 6], ['long', 8], ['ponytail', 6],
  ['bob', 5], ['bun', 4], ['afro', 3], ['dreads', 2], ['bald', 5], ['mohawk', 1]];
const FEM_HAIR = [['long', 30], ['bob', 20], ['ponytail', 20], ['bun', 14], ['curly', 10], ['afro', 6]];
const BEARDS = [['none', 70], ['stubble', 12], ['short', 7], ['full', 5], ['goatee', 4], ['mustache', 2]];

// ---------------------------------------------------------------- архетипы
// Каждый возвращает часть look (одежду); кожа, волосы и телосложение добавляются в civilianLook.
const ARCH = {
  street(rng) {
    const top = rng.pick(['hoodie', 'hoodie', 'bomber', 'denim', 'track', 'varsity']);
    const shirt = rng.pick([...NEUTRAL, ...BOLD, ...EARTH]);
    const accent = accentFor(rng, shirt);
    return {
      top, shirt, accent,
      bottom: rng.pick(['joggers', 'jeans', 'cargo', 'jeans']), pants: rng.pick([...DENIM, ...DARK, ...KHAKI]), trim: accent,
      shoeStyle: rng.pick(['hightop', 'sneaker', 'sneaker']), shoes: rng.pick(SHOES), shoeAccent: rng.chance(0.4) ? rng.pick(BOLD) : null,
      ...(rng.chance(0.35) ? { hat: rng.pick([...NEUTRAL, ...BOLD]), hatStyle: rng.pick(['snapback', 'backcap', 'beanie', 'cap']) } : {}),
      glasses: rng.chance(0.25) ? rng.pick(['shades', 'aviator', 'visor']) : null,
      chain: rng.chance(0.2) ? GOLD : null,
      headphones: rng.chance(0.1) ? rng.pick(NEUTRAL) : null,
    };
  },
  casual(rng) {
    const top = rng.pick(['tee', 'tee', 'polo', 'jersey', 'denim', 'hoodie']);
    const shirt = rng.pick([...NEUTRAL, ...BOLD, ...PASTEL, ...EARTH]);
    return {
      top, shirt, accent: accentFor(rng, shirt), shirt2: '#f2f2f0',
      bottom: rng.pick(['jeans', 'jeans', 'slim', 'shorts', 'cargo']), pants: rng.pick([...DENIM, ...KHAKI, ...DARK]),
      shoeStyle: 'sneaker', shoes: rng.pick(SHOES),
      ...(rng.chance(0.22) ? { hat: rng.pick([...NEUTRAL, ...BOLD]), hatStyle: rng.pick(['cap', 'snapback', 'bucket']) } : {}),
      backpack: rng.chance(0.14) ? rng.pick([...BOLD, ...NEUTRAL]) : null,
      glasses: rng.chance(0.15) ? rng.pick(['shades', 'round', 'aviator']) : null,
      watch: rng.chance(0.15) ? '#c9c9c9' : null,
    };
  },
  business(rng) {
    const suit = rng.pick(SUITS);
    return {
      top: 'suit', shirt: suit, shirt2: '#f4f4f4', accent: rng.pick(['#b3121b', '#1f4e8c', '#2b2f3a', GOLD, '#7a1f5c', '#0f7a5a']),
      bottom: 'slim', pants: suit, shoeStyle: 'dress', shoes: rng.pick(['#111111', '#2a1a10', '#3a2416']),
      watch: rng.chance(0.5) ? rng.pick(['#c9c9c9', GOLD]) : null,
      glasses: rng.chance(0.2) ? rng.pick(['round', 'shades', 'aviator']) : null,
      ...(rng.chance(0.08) ? { hat: rng.pick(['#1c1f26', '#4a3b2a', '#d8d2c4']), hatStyle: 'fedora' } : {}),
      bag: rng.chance(0.2) ? '#2a1a10' : null,
    };
  },
  sport(rng) {
    const main = rng.pick([...BOLD, ...NEUTRAL]);
    const accent = accentFor(rng, main);
    return {
      top: rng.pick(['track', 'tank', 'jersey', 'tee']), shirt: main, accent,
      bottom: rng.pick(['leggings', 'joggers', 'shorts', 'fightshorts']), pants: rng.pick([...DARK, ...BOLD]), trim: accent,
      shoeStyle: 'sneaker', shoes: rng.pick(['#f2f2f2', '#111111', '#e6b422', '#2d7fd6']), shoeAccent: rng.pick(BOLD),
      ...(rng.chance(0.4) ? { hat: rng.pick(BOLD), hatStyle: 'headband' } : {}),
      headphones: rng.chance(0.3) ? '#222222' : null, wraps: rng.chance(0.25) ? '#f0f0f0' : null,
      backpack: rng.chance(0.08) ? rng.pick(BOLD) : null,
    };
  },
  tourist(rng) {
    const shirt = rng.pick([...BOLD, ...PASTEL]);
    return {
      top: rng.pick(['hawaii', 'hawaii', 'tee', 'polo']), shirt, accent: rng.pick(['#2b9a9a', '#f2f2f2', '#ffd200', '#c2185b', '#27ae60']), shirt2: '#f2f2f0',
      bottom: rng.pick(['shorts', 'shorts', 'cargo']), pants: rng.pick(['#e8dcc0', '#c2b280', '#7a6a4f', '#34507e']),
      shoeStyle: 'sneaker', shoes: rng.pick(['#f2f2f2', '#5d4037']),
      hat: rng.chance(0.65) ? rng.pick(['#f4f1e1', '#e6b422', '#a7c7e7', '#f2f2f2']) : null, hatStyle: rng.pick(['bucket', 'cap']),
      glasses: rng.pick(['shades', 'round', 'aviator']), backpack: rng.chance(0.4) ? rng.pick(BOLD) : null,
      bag: rng.chance(0.25) ? rng.pick(BOLD) : null,
    };
  },
  biker(rng) {
    const leather = rng.pick(LEATHER);
    return {
      top: 'leather', shirt: leather, shirt2: rng.pick(['#e8e8e8', '#111111', '#b3121b']), accent: '#c9c9c9',
      bottom: 'jeans', pants: rng.pick([...DENIM, ...DARK]), shoeStyle: 'boot', shoes: rng.pick(['#151515', '#2a1a10']),
      glasses: rng.pick(['shades', 'aviator', 'aviator']), chain: rng.chance(0.4) ? '#c9c9c9' : null,
      bandana: rng.chance(0.35) ? rng.pick(['#b3121b', '#111111', '#1f4e8c']) : null,
      tattoo: rng.chance(0.4) ? rng.int(1, 4) : 0, bulk: rng.range(1.0, 1.18),
    };
  },
  winter(rng) {
    const shirt = rng.pick([...BOLD, ...NEUTRAL, ...EARTH]);
    return {
      top: rng.pick(['puffer', 'puffer', 'turtle']), shirt, accent: accentFor(rng, shirt),
      bottom: rng.pick(['cargo', 'jeans']), pants: rng.pick([...DENIM, ...DARK, ...KHAKI]), shoeStyle: 'boot', shoes: rng.pick(['#4a3a2a', '#151515', '#2a2f3a']),
      hat: rng.pick(BOLD), hatStyle: 'beanie', scarf: rng.chance(0.6) ? rng.pick(BOLD) : null,
      bulk: rng.range(1.0, 1.12),
    };
  },
  elegant(rng) {
    const dress = rng.pick([...BOLD, ...NEUTRAL, ...PASTEL]);
    const kind = rng.pick(['dress', 'dress', 'skirt', 'skirt']);
    return {
      top: kind === 'dress' ? 'dress' : rng.pick(['tee', 'polo', 'turtle', 'denim']), shirt: dress, accent: accentFor(rng, dress),
      bottom: 'skirt', pants: kind === 'dress' ? dress : rng.pick([...NEUTRAL, ...DENIM, ...BOLD]),
      legs: rng.chance(0.45) ? rng.pick(['#15151a', '#3a2f2a', '#8a6a55']) : null,
      shoeStyle: rng.pick(['dress', 'boot', 'sneaker']), shoes: rng.pick(['#111111', '#2a1a10', '#c0392b', '#f2f2f2']),
      glasses: rng.chance(0.3) ? rng.pick(['shades', 'aviator', 'round']) : null, earring: rng.chance(0.55) ? GOLD : null,
      bag: rng.chance(0.55) ? rng.pick(['#2a1a10', '#111111', '#c0392b', '#e6b422']) : null,
      fem: true, bulk: rng.range(0.9, 1.0),
    };
  },
  worker(rng) {
    return {
      top: 'vest', shirt: rng.pick(['#e8e8e8', '#8a8f98', '#3a3f4b']), accent: rng.pick(['#ff8a00', '#d6ff00', '#ffb800']),
      bottom: 'cargo', pants: rng.pick(['#3a3a3a', '#4a4a3a', '#26364d']), shoeStyle: 'boot', shoes: '#2a2a2a',
      hat: rng.pick(['#ffd200', '#f2f2f2', '#ff8a00']), hatStyle: 'helmet', gloves: rng.chance(0.5) ? '#aaaaaa' : null, bulk: rng.range(1.02, 1.15),
    };
  },
  punk(rng) {
    return {
      top: rng.pick(['denim', 'leather', 'tank', 'hoodie']), shirt: rng.pick([...DARK, '#c0392b', '#2d7fd6', '#8e44ad']), accent: rng.pick(['#f2f2f2', '#d6ff00', '#e84393']),
      bottom: rng.pick(['jeans', 'cargo', 'slim']), pants: rng.pick([...DARK, '#3a1f3a', '#8a1c1c']), shoeStyle: rng.pick(['boot', 'hightop']), shoes: rng.pick(['#111111', '#b3121b', '#f2f2f2']),
      mask: rng.chance(0.3) ? '#111111' : null, tattoo: rng.int(1, 4), chain: rng.chance(0.5) ? '#c9c9c9' : null,
      hairStyle: rng.pick(['mohawk', 'dreads', 'curly', 'bun']), hairFun: true, earring: rng.chance(0.5) ? '#c9c9c9' : null,
    };
  },
  trendy(rng) {
    const shirt = rng.pick(BOLD);
    return {
      top: rng.pick(['bomber', 'varsity', 'track', 'hoodie']), shirt, accent: accentFor(rng, shirt),
      bottom: rng.pick(['joggers', 'slim', 'jeans']), pants: rng.pick([...DARK, ...NEUTRAL]), trim: '#f2f2f2',
      shoeStyle: 'hightop', shoes: rng.pick(['#f2f2f2', '#111111']), shoeAccent: rng.pick(BOLD),
      glasses: rng.pick(['visor', 'shades', 'aviator']), chain: GOLD, earring: rng.chance(0.4) ? GOLD : null,
      ...(rng.chance(0.4) ? { hat: rng.pick(BOLD), hatStyle: 'snapback' } : {}),
    };
  },
};

// Веса архетипов по району: даунтаун — костюмы, парк — спорт, окраины — повседневное.
const WEIGHTS = {
  default: [['street', 22], ['casual', 22], ['business', 9], ['sport', 10], ['tourist', 7], ['biker', 5], ['winter', 5], ['elegant', 9], ['worker', 3], ['punk', 2], ['trendy', 6]],
  downtown: [['business', 28], ['elegant', 14], ['trendy', 10], ['casual', 16], ['street', 12], ['tourist', 8], ['sport', 4], ['biker', 3], ['worker', 3], ['winter', 2]],
  park: [['sport', 34], ['casual', 20], ['tourist', 12], ['street', 12], ['elegant', 8], ['winter', 6], ['punk', 3], ['trendy', 5]],
  port: [['worker', 30], ['street', 20], ['casual', 16], ['biker', 12], ['winter', 6], ['sport', 6], ['punk', 6], ['tourist', 4]],
  suburb: [['casual', 32], ['sport', 14], ['elegant', 12], ['street', 14], ['winter', 8], ['tourist', 6], ['business', 6], ['trendy', 4], ['worker', 4]],
  night: [['trendy', 24], ['street', 20], ['elegant', 20], ['punk', 8], ['biker', 10], ['business', 8], ['casual', 10]],
};

// Прохожий. ctx.district — 'downtown' | 'park' | 'port' | 'suburb' | 'night' (иначе — обычный).
export function civilianLook(rng, ctx = {}) {
  const arch = weighted(rng, WEIGHTS[ctx.district] ?? WEIGHTS.default);
  const out = ARCH[arch](rng);
  const fem = out.fem === true;
  delete out.fem;
  const skin = rng.pick(SKIN);
  const hairFun = out.hairFun === true;
  delete out.hairFun;
  const look = {
    skin,
    hair: hairFun ? rng.pick(HAIR_FUN) : rng.pick(HAIR),
    hairStyle: out.hairStyle ?? weighted(rng, fem ? FEM_HAIR : HAIR_STYLES),
    beard: fem ? 'none' : weighted(rng, BEARDS),
    bulk: rng.range(0.92, 1.08),
    scale: rng.range(0.93, 1.07),
    tattoo: rng.chance(0.07) ? rng.int(1, 4) : 0,
    ...out,
  };
  // Стильные сочетания: серьги/ожерелья не нужны всем, лысым не нужна причёска под кепкой — это решает гардероб.
  look.arch = arch;
  return look;
}

// Совместимость со старым кодом: обычный прохожий без привязки к району.
export function randomCivilianLook(rng) {
  return civilianLook(rng);
}

// Бандиты: цвет банды — основной цвет одежды (или бандана/кепка на тёмной одежде). Узнаются издалека.
export function gangLook(rng, color) {
  const dark = rng.chance(0.3);
  const cap = !dark && rng.chance(0.25);
  const shirt = dark ? rng.pick(['#1e1e1e', '#2d2d2d', '#e8e8e8']) : color;
  const hatStyle = rng.pick(['snapback', 'backcap', 'beanie', 'cap']);
  return {
    skin: rng.pick(SKIN), hair: rng.pick(['#141414', '#141414', '#3b2a1a']),
    hairStyle: rng.pick(['buzz', 'short', 'fade', 'curly', 'dreads', 'bald', 'slick', 'fade']),
    beard: weighted(rng, [['none', 50], ['stubble', 18], ['goatee', 12], ['full', 12], ['mustache', 8]]),
    top: rng.pick(['tee', 'tank', 'hoodie', 'varsity', 'bomber', 'jersey', 'denim', 'tank']),
    shirt, accent: dark ? color : rng.pick(['#f2f2f2', '#111111']),
    bottom: rng.pick(['jeans', 'cargo', 'joggers', 'shorts', 'jeans']),
    pants: rng.pick(['#1c1c1c', '#2b3a55', '#3a3a3a', '#4a3b2a', '#26364d']), trim: color,
    shoeStyle: rng.pick(['hightop', 'sneaker', 'boot']), shoes: rng.pick(['#111111', '#eeeeee', '#8a1c1c']),
    bandana: cap ? null : color, hat: cap ? color : null, hatStyle: cap ? hatStyle : undefined,
    chain: rng.chance(0.4) ? GOLD : null, glasses: rng.chance(0.3) ? rng.pick(['shades', 'shades', 'aviator']) : null,
    tattoo: rng.chance(0.4) ? rng.int(1, 4) : 0, bulk: rng.range(0.98, 1.16),
    scale: rng.range(0.95, 1.1),
  };
}

// Полиция: форменная рубашка с воротником, фуражка-кепка, тактические ботинки.
export function policeLook(rng) {
  return {
    skin: rng.pick(SKIN), hair: '#141414', hairStyle: rng.pick(['short', 'buzz', 'fade']),
    top: 'polo', shirt: '#22407a', accent: '#c9c9c9', bottom: 'slim', pants: '#1a2233',
    shoes: '#0c0c0c', shoeStyle: 'boot', hat: '#16284d', hatStyle: 'cap',
    glasses: rng.chance(0.3) ? 'aviator' : null, watch: rng.chance(0.4) ? '#c9c9c9' : null,
    beard: rng.chance(0.15) ? 'mustache' : 'none',
    bulk: rng.range(1.0, 1.12), scale: rng.range(0.98, 1.06),
  };
}

// Охранник банка: костюм и очки.
export function guardLook(rng) {
  return {
    skin: rng.pick(SKIN), hair: '#141414', hairStyle: rng.pick(['short', 'buzz', 'bald']),
    top: 'suit', shirt: '#14161c', shirt2: '#f4f4f4', accent: '#7a1f1f', bottom: 'slim', pants: '#14161c',
    shoes: '#0c0c0c', shoeStyle: 'dress', glasses: 'shades', beard: rng.chance(0.2) ? 'stubble' : 'none',
    bulk: rng.range(1.08, 1.2), scale: rng.range(1.0, 1.08),
  };
}

// Случайный образ только по темам (для тестов и "переодевания" игрока).
export function outfitByArchetype(rng, arch) {
  return { ...civilianLook(rng, {}), ...ARCH[arch](rng) };
}
export const ARCHETYPES = Object.keys(ARCH);
