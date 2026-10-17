// Американские имена и профессии прохожих. Имя подбирается по внешнему виду образа:
//   • по видимому полу (платье, юбка, длинные волосы, серьги и сумочка — женское; борода, усы — мужское;
//     если по образу не понять, выбор случайный);
//   • по возрасту (седые волосы — имена старшего поколения, панки и модники — младше, деловые — старше).
// Цвет кожи на имя не влияет: фамилии — смесь самых частых американских, независимо от внешности.
// Профессия — по архетипу образа (деловой — офис, рабочий — стройка и т.д.), от неё зависит, ходит ли
// человек на работу (worklife.js).

const MALE = {
  young: ['Liam', 'Noah', 'Mason', 'Ethan', 'Logan', 'Jayden', 'Tyler', 'Brandon', 'Jordan', 'Dylan', 'Caleb', 'Aiden', 'Xavier', 'Austin', 'Isaiah', 'Devin', 'Trevor', 'Cody', 'Elijah', 'Julian'],
  adult: ['Michael', 'James', 'David', 'Chris', 'Daniel', 'Matthew', 'Kevin', 'Brian', 'Jason', 'Eric', 'Ryan', 'Justin', 'Marcus', 'Anthony', 'Andrew', 'Joshua', 'Derek', 'Tony', 'Carlos', 'Steven'],
  old: ['Robert', 'William', 'Richard', 'Thomas', 'Gary', 'Larry', 'Harold', 'Walter', 'Dennis', 'Raymond', 'Frank', 'Eugene', 'Howard', 'Arthur', 'Lawrence', 'Roger', 'Ronald', 'Donald', 'Ernest', 'Leonard'],
};
const FEMALE = {
  young: ['Emma', 'Olivia', 'Ava', 'Sophia', 'Mia', 'Chloe', 'Madison', 'Taylor', 'Jasmine', 'Aaliyah', 'Brianna', 'Kayla', 'Riley', 'Zoe', 'Hailey', 'Destiny', 'Savannah', 'Ariana', 'Lily', 'Natalie'],
  adult: ['Jennifer', 'Jessica', 'Ashley', 'Amanda', 'Sarah', 'Megan', 'Lauren', 'Nicole', 'Stephanie', 'Rachel', 'Samantha', 'Danielle', 'Michelle', 'Heather', 'Tiffany', 'Monica', 'Angela', 'Melissa', 'Vanessa', 'Christina'],
  old: ['Patricia', 'Linda', 'Barbara', 'Susan', 'Karen', 'Nancy', 'Dorothy', 'Carol', 'Betty', 'Margaret', 'Helen', 'Sandra', 'Donna', 'Judith', 'Gloria', 'Marilyn', 'Shirley', 'Joan', 'Ruth', 'Beverly'],
};
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor',
  'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott',
  'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Kim', 'Patel', 'Turner', 'Phillips',
  'Evans', 'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan', 'Cooper', 'Reed', 'Bailey', 'Bell', 'Kelly', 'Howard', 'Ward', 'Cox', 'Diaz', 'Richardson',
  'Wood', 'Watson', 'Brooks', 'Bennett', 'Gray', 'James', 'Reyes', 'Cruz', 'Hughes', 'Price', 'Myers', 'Long', 'Foster', 'Sanders', 'Ross', 'Morales', 'Powell', 'Sullivan',
  'Russell', 'Ortiz', 'Jenkins', 'Gutierrez', 'Perry', 'Butler', 'Barnes', 'Fisher', 'Henderson', 'Coleman', 'Simmons', 'Patterson', 'Jordan', 'Reynolds', 'Hamilton', 'Graham'];
const NICKS = ['Smoke', 'Ace', 'Duke', 'Tank', 'Joker', 'Blaze', 'Rico', 'Shadow', 'Lucky', 'Wolf', 'Big T', 'Lil D', 'Snake', 'Dice', 'Ghost', 'Bones', 'Slim', 'Hawk'];

const GRAY_HAIR = new Set(['#8a8f94', '#555555']);
const FEM_HAIR = new Set(['long', 'bob', 'ponytail']);
const MASC_HAIR = new Set(['mohawk', 'buzz', 'fade', 'slick']);

// Видимый пол образа: 'f' | 'm' | null (не понять).
export function presentation(look) {
  let s = 0;
  if (look.top === 'dress') s += 3;
  if (look.bottom === 'skirt') s += 3;
  if (FEM_HAIR.has(look.hairStyle)) s += 2;
  else if (look.hairStyle === 'bun') s += 1;
  if (look.earring) s += 1;
  if (look.bag) s += 0.5;
  if (look.beard && look.beard !== 'none') s -= 4;
  if (MASC_HAIR.has(look.hairStyle)) s -= 1;
  if (look.top === 'vest' || look.top === 'leather') s -= 0.5;
  if ((look.bulk ?? 1) > 1.12) s -= 1;
  return s >= 2 ? 'f' : s <= -1 ? 'm' : null;
}

function ageOf(look, rng) {
  if (GRAY_HAIR.has(look.hair)) return 'old';
  const young = look.arch === 'punk' || look.arch === 'trendy' || look.arch === 'sport';
  const older = look.arch === 'business' || look.arch === 'winter';
  const r = rng.next();
  if (young) return r < 0.7 ? 'young' : 'adult';
  if (older) return r < 0.15 ? 'young' : r < 0.75 ? 'adult' : 'old';
  return r < 0.4 ? 'young' : r < 0.88 ? 'adult' : 'old';
}

// Случайное американское имя под внешность. Возвращает { first, last, full, female, age }.
export function americanName(look, rng) {
  const g = presentation(look) ?? (rng.chance(0.5) ? 'f' : 'm');
  const age = ageOf(look, rng);
  const first = rng.pick((g === 'f' ? FEMALE : MALE)[age]);
  const last = rng.pick(LAST);
  return { first, last, full: `${first} ${last}`, female: g === 'f', age };
}

export function nickname(rng) {
  return rng.pick(NICKS);
}

// Профессия по архетипу образа. Подпись для таблички и признак "ходит на работу".
export const JOBS = {
  office: { label: 'Офисный работник', commutes: true, door: 'office' },
  shop: { label: 'Продавец', commutes: true, door: 'shop' },
  cafe: { label: 'Работник кафе', commutes: true, door: 'shop' },
  builder: { label: 'Строитель', commutes: true, door: 'shop' },
  courier: { label: 'Курьер', commutes: true, door: 'shop' },
  student: { label: 'Студент', commutes: true, door: 'office' },
  trainer: { label: 'Тренер', commutes: true, door: 'shop' },
  none: { label: 'Прохожий', commutes: false, door: null },
  tourist: { label: 'Турист', commutes: false, door: null },
};

export function jobFor(look, rng) {
  switch (look.arch) {
    case 'business': return rng.chance(0.9) ? 'office' : 'shop';
    case 'worker': return 'builder';
    case 'sport': return rng.chance(0.5) ? 'trainer' : 'none';
    case 'tourist': return 'tourist';
    case 'elegant': return rng.pick(['office', 'shop', 'shop', 'none']);
    case 'punk': return rng.pick(['courier', 'cafe', 'none']);
    case 'trendy': return rng.pick(['shop', 'cafe', 'student', 'none']);
    case 'winter': return rng.pick(['office', 'shop', 'none']);
    case 'biker': return rng.pick(['courier', 'builder', 'none']);
    default: return rng.pick(['shop', 'cafe', 'office', 'student', 'courier', 'none', 'none']);
  }
}

// Имя по роли: прохожий — имя и фамилия; полицейский — «Officer Miller»; охранник — «Guard Davis».
export function nameFor(role, look, rng, extra = {}) {
  const n = americanName(look, rng);
  if (role === 'police') return extra.guard ? `Guard ${n.last}` : `Officer ${n.last}`;
  if (role === 'gang') return rng.chance(0.45) ? `${n.first} "${nickname(rng)}" ${n.last}` : n.full;
  return n.full;
}
