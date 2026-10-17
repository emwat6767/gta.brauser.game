//# sourceURL=ufc/voice.js
(function () {
'use strict';
const UFC = window.UFC;

// ===========================================================================
// Our own commentator voice. No browser TTS: a small formant synthesiser
// (glottal saw -> three vowel formants, plus noise for s/sh/h and plosive
// bursts) that reads Russian text with a pitch contour that follows the
// emotion: calm analysis in a low rough voice, a play-by-play man who
// screams and cracks on a knockdown, an arena announcer with long vowels.
// ===========================================================================
const STRESS = ('бед+е бл+изкий бойц+ов бойц+ы б+ольше больш+ого б+оя в+атные веч+ера взорв+ался в+идел в+идели видн+а в+идно в+идят ' +
  'вмеш+ивается возвращ+ение вопр+осов встр+ечный втор+ое вход+е выбр+ался в+ынесли в+ырвался в+ырубил вырыв+аться в+ыстоять гл+авный ' +
  'глуб+окий г+олову господ+а гуд+ит д+авит д+амы дв+ойка держ+ит дж+ебом джентльм+ены дивизи+оне дист+анции дист+анцию добив+ай ' +
  'доминир+ование дост+аточно др+огнули друг+а дых+ание ег+о забир+ает забит+ы забыв+ается закон+читься закр+ылся захв+ат захв+ата защ+ита ' +
  'защит+ился зов+ут иде+альный исх+од +ищет как+ая как+ой к+ардио кас+ание килогр+амма ком+анды кон+ец к+онтра контр+оль к+ончено к+опится ' +
  'к+орпус к+орпусу красн+еет кр+асном кур+аж л+еди лиц+о люб+ому метрон+ом мин+уту м+ожет м+ожно навстр+ечу н+адо наз+ад началс+я нач+инаем ' +
  'начин+аем невероя+тно никогд+а никт+о нич+ью нич+ья н+овый ног+а ног+ах н+оги н+огу нок+аут нокд+аун н+ужно +оба обм+ен об+оим од+ин ' +
  'оконч+ен окт+агона +очень п+адает парт+ер парт+ере п+ервый перед+ышка передвиж+ение перел+ом перч+аток печ+ени побед+итель побежд+ает ' +
  'подн+яться подруб+ает подр+яд пое+хали поз+ицию поз+иция пойм+ал п+олное пол+у попад+ание поп+ал попл+ыл п+осле посп+орят почувств+овал ' +
  'прекр+асный прилож+ил продолж+ать пр+отив пр+оход проход+а прох+одит прошл+а пр+ямо пыт+ается раб+ота раб+отает разв+едка раззад+орила ' +
  'растя+жка р+аунд р+аунда р+аунде р+аундов рефер+и реш+ает реш+ение р+уки сабм+ишн сб+илось св+ерху сво+их св+язка сдалс+я сейч+ас с+ерия ' +
  'с+инем скл+адывается сл+омано сл+ушаем сн+ова соп+ерник соп+ерника спеш+ит ср+азу суд+ей суд+ьи суд+ьям т+айминг так+ого так+ое такт+ическая ' +
  'тейкд+аун тейкд+ауна теп+ерь технич+еский т+итул т+олько тяжел+ейший тяжел+о углов+ые угл+у уд+ар уд+ара уд+ары уж+е улучш+ается уп+ал ' +
  'уст+алость хл+опок хор+оший х+уже центр+е ч+елюсть чемпи+он чемпи+она ч+исто чит+ает чит+ают +это +этого +этом +этот запят+ая ' +
  'оди+ннадцать двен+адцать трин+адцать четырн+адцать пятн+адцать шестн+адцать семн+адцать восемн+адцать девятн+адцать дв+адцать тр+идцать с+орок ' +
  'пятьдес+ят шестьдес+ят с+емьдесят в+осемьдесят девян+осто дв+ести тр+иста чет+ыреста пятьс+от шестьс+от семьс+от восемьс+от девятьс+от ' +
  'чет+ыре в+осемь д+евять д+есять ком+анда ж+ёлтый нап+адает атак+а атак+ует пр+иём прием+ы бой+ц сп+ортсмен').split(/\s+/);
const DICT = {};
STRESS.forEach((w) => { const i = w.indexOf('+'); if (i >= 0) DICT[w.replace('+', '')] = i; });

const LAT = { a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс', y: 'и', z: 'з' };
const ONES = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUND = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
function numWords(n) {
  if (n >= 1000) return String(n).split('').map((d) => ONES[+d]).join(' ');
  const o = [];
  if (n >= 100) { o.push(HUND[Math.floor(n / 100)]); n %= 100; }
  if (n >= 20) { o.push(TENS[Math.floor(n / 10)]); n %= 10; if (n) o.push(ONES[n]); } else if (n > 0 || !o.length) o.push(ONES[n]);
  return o.join(' ');
}
function expandNumbers(t) {
  return t.replace(/(\d+)[.,](\d+)/g, (m, a, b) => numWords(+a) + ' запятая ' + b.split('').map((d) => ONES[+d]).join(' ')).replace(/\d+/g, (m) => numWords(+m));
}

const VOWELS = 'аоуэыиеёюя';
const IOT = { 'я': 'а', 'ю': 'у', 'е': 'э', 'ё': 'о' };
const VOICED_TO_PAIR = { 'б': 'п', 'в': 'ф', 'г': 'к', 'д': 'т', 'ж': 'ш', 'з': 'с' };
const PAIR_TO_VOICED = { 'п': 'б', 'ф': 'в', 'к': 'г', 'т': 'д', 'ш': 'ж', 'с': 'з' };
const OBSTR = 'бвгджзпфктшсхцчщ';
const VOW_F = { 'а': [730, 1090, 2440], 'о': [570, 840, 2410], 'у': [320, 800, 2360], 'э': [530, 1840, 2480], 'ы': [350, 1500, 2400], 'и': [275, 2250, 3010] };
// consonants: stops get a closure + burst, fricatives noise, sonorants formants
const CONS = {
  'п': { t: 'stop', cf: 900, cl: 0.05, g: 0.32 }, 'б': { t: 'stop', cf: 800, cl: 0.055, g: 0.22 },
  'т': { t: 'stop', cf: 4300, cl: 0.045, g: 0.5 }, 'д': { t: 'stop', cf: 3600, cl: 0.05, g: 0.34 },
  'к': { t: 'stop', cf: 1900, cl: 0.05, g: 0.5 }, 'г': { t: 'stop', cf: 1500, cl: 0.055, g: 0.32 },
  'с': { t: 'fric', cf: 6400, q: 1.5, d: 0.1, g: 0.6 }, 'з': { t: 'fric', cf: 6000, q: 1.5, d: 0.078, g: 0.42 },
  'ш': { t: 'fric', cf: 2900, q: 1.1, d: 0.11, g: 0.78 }, 'ж': { t: 'fric', cf: 2600, q: 1.1, d: 0.088, g: 0.52 },
  'щ': { t: 'fric', cf: 3500, q: 1, d: 0.13, g: 0.7 }, 'ф': { t: 'fric', cf: 4600, q: 0.4, d: 0.085, g: 0.24 },
  'в': { t: 'fric', cf: 3400, q: 0.4, d: 0.06, g: 0.16 }, 'х': { t: 'fric', cf: 1700, q: 0.5, d: 0.09, g: 0.42 },
  'ц': { t: 'aff', stop: 'т', fric: 'с' }, 'ч': { t: 'aff', stop: 'т', fric: 'щ' },
  'м': { t: 'son', F: [250, 1100, 2300], g: 0.55, d: 0.07 }, 'н': { t: 'son', F: [250, 1550, 2550], g: 0.55, d: 0.062 },
  'л': { t: 'son', F: [360, 1150, 2750], g: 0.7, d: 0.062 }, 'р': { t: 'trill', F: [420, 1300, 1900], g: 0.65, d: 0.07 },
  'й': { t: 'son', F: [275, 2300, 3010], g: 0.75, d: 0.05 },
};
const SOFTENS = 'яюеёиь';

function stressIndex(base) {
  const ye = base.indexOf('ё'); if (ye >= 0) return ye;
  if (DICT[base] != null) return DICT[base];
  const vs = []; for (let i = 0; i < base.length; i++) if (VOWELS.includes(base[i])) vs.push(i);
  if (!vs.length) return -1;
  if (vs.length === 1) return vs[0];
  return VOWELS.includes(base[base.length - 1]) ? vs[vs.length - 2] : vs[vs.length - 1];
}

// one word -> list of sounds (with Russian vowel reduction and devoicing)
function wordSounds(raw) {
  let w = raw.toLowerCase().replace(/[^а-яёa-z]/g, '').replace(/[a-z]/g, (c) => LAT[c]);
  if (!w) return [];
  const chars = [];
  for (const ch of w) {
    const last = chars[chars.length - 1];
    if (last && last.ch === ch && VOWELS.includes(ch)) last.rep++; else chars.push({ ch, rep: 1 });
  }
  const base = chars.map((c) => c.ch).join('');
  const si = stressIndex(base);
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    const { ch, rep } = chars[i];
    const prev = i ? chars[i - 1].ch : '', next = i + 1 < chars.length ? chars[i + 1].ch : '';
    if (ch === 'ь' || ch === 'ъ') continue;
    const st = i === si;
    if (VOWELS.includes(ch)) {
      const iot = ch in IOT;
      let v = iot ? IOT[ch] : ch;
      const afterVowelish = i === 0 || VOWELS.includes(prev) || prev === 'ь' || prev === 'ъ';
      if (iot && afterVowelish) out.push({ k: 'c', c: 'й', soft: true, voiced: true });
      let soft = iot && !afterVowelish;
      if (!st) {                                  // akanye / ikanye
        if (v === 'о') v = 'а';
        else if (ch === 'е' || ch === 'я') v = 'и';
      }
      out.push({ k: 'v', v, st, rep, soft, red: !st });
    } else if (CONS[ch]) {
      const soft = 'чщй'.includes(ch) || (!'жшц'.includes(ch) && SOFTENS.includes(next));
      out.push({ k: 'c', c: ch, soft, voiced: 'бвгджзлмнрй'.includes(ch) });
    }
  }
  // devoicing: word end and before a voiceless obstruent; voicing before a voiced one
  for (let i = out.length - 1; i >= 0; i--) {
    const s = out[i];
    if (s.k !== 'c' || !(s.c in VOICED_TO_PAIR || s.c in PAIR_TO_VOICED)) continue;
    const n = out[i + 1];
    let wantVoiced = null;
    if (!n) wantVoiced = false;
    else if (n.k === 'c' && OBSTR.includes(n.c) && n.c !== 'в') wantVoiced = !!(n.c in VOICED_TO_PAIR);
    if (wantVoiced === false && s.c in VOICED_TO_PAIR) { s.c = VOICED_TO_PAIR[s.c]; s.voiced = false; }
    else if (wantVoiced === true && s.c in PAIR_TO_VOICED) { s.c = PAIR_TO_VOICED[s.c]; s.voiced = true; }
  }
  return out;
}

// voices: base pitch, vocal-tract scale, how far emotion lifts pitch, speed, roughness, breath, room
const PRESETS = {
  pbp:   { f0: 118, fs: 1.0,  eUp: 10, rate: 1.0,  rough: 0.12, breath: 0.05, rev: 0.12, grit: 1.0, ring: 1 },
  color: { f0: 96,  fs: 0.93, eUp: 4,  rate: 0.9,  rough: 0.26, breath: 0.1,  rev: 0.09, grit: 0.6, ring: 1 },
  ring:  { f0: 108, fs: 0.92, eUp: 7,  rate: 0.8,  rough: 0.12, breath: 0.06, rev: 0.3,  grit: 0.8, ring: 1.4 },
};

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

// text -> a timeline of sounds with absolute times and pitch targets
function plan(text, voice, energy) {
  const P = PRESETS[voice] || PRESETS.pbp, e = clamp(energy, 0, 1);
  const spd = P.rate * (1 + 0.24 * e);
  const clean = expandNumbers(String(text).replace(/[«»"]/g, ' ')).replace(/\s+/g, ' ');
  const toks = clean.match(/[A-Za-zА-Яа-яЁё]+|[,.!?…:;—]+/g) || [];
  const phrases = []; let cur = [];
  for (const tk of toks) {
    if (/^[,.!?…:;—]/.test(tk)) { if (cur.length) { phrases.push({ words: cur, term: tk[0] === '…' ? '.' : tk[0] }); cur = []; } }
    else cur.push(tk);
  }
  if (cur.length) phrases.push({ words: cur, term: '.' });
  const totalWords = phrases.reduce((a, p) => a + p.words.length, 0) || 1;
  const segs = []; let t = e >= 0.85 ? 0.16 : 0.02, gw = 0;
  if (e >= 0.85) segs.push({ k: 'breath', t: 0.01, d: 0.14 });
  const shoutFinal = e > 0.6;
  phrases.forEach((ph, pi) => {
    const n = ph.words.length;
    ph.words.forEach((wd, wi) => {
      const snd = wordSounds(wd);
      const lastWord = wi === n - 1;
      const lastV = (() => { for (let i = snd.length - 1; i >= 0; i--) if (snd[i].k === 'v') return i; return -1; })();
      const cres = (e > 0.5 ? 6.5 : 3) * e * (gw / totalWords) + (e > 0.5 ? 1.2 * pi : 0);
      const decl = -2.6 * (wi / Math.max(1, n - 1)) * (1 - 0.45 * e);
      snd.forEach((s, si) => {
        if (s.k === 'v') {
          const fin = lastWord && si === lastV;
          let d = (s.st ? 0.118 : 0.058) * (s.st && P.ring > 1 ? P.ring : 1) * (s.red ? 0.9 : 1);
          if (fin) d *= 1.3 + (shoutFinal && ph.term === '!' ? 0.45 * e : 0) * P.ring;
          d *= 1 + 1.5 * (Math.min(5, s.rep) - 1) * (0.6 + 0.6 * e);
          d = d / spd;
          const emph = s.st || s.rep > 1;
          let semi = decl + cres + (emph ? 2.0 + 5.5 * e : -0.4);
          let a = semi - 0.9, pk = semi + (s.st ? 0.7 : 0), z = semi - (s.st ? 1.3 : 0.5);
          if (fin) {
            if (ph.term === '?') { z = semi + 4.5; pk = semi + 1; }
            else if (ph.term === '!' && shoutFinal) { pk = semi + 2.2; z = semi - 5.5 - 2 * Math.min(3, s.rep - 1); }
            else if (ph.term === '.') z = semi - 3.2;
            else if (ph.term === ',') z = semi + 1.3;
          }
          segs.push({ k: 'v', t, d, v: s.v, st: s.st, soft: s.soft, red: s.red, a, pk, z, fin, crack: fin && e > 0.9 && s.rep > 2 });
          t += d;
        } else {
          const c = CONS[s.c];
          const sp = 1 + 0.1 * e;
          const nx = snd[si + 1];
          if (c.t === 'stop' || c.t === 'aff') {
            const sc = c.t === 'aff' ? CONS[c.stop] : c;
            const cl = sc.cl / spd / sp;
            segs.push({ k: 'stop', t, d: cl, voiced: !!s.voiced && c.t === 'stop', soft: s.soft, cf: sc.cf, g: sc.g });
            t += cl;
            if (c.t === 'aff') { const f = CONS[c.fric]; const d = (f.d * 0.7) / spd; segs.push({ k: 'fric', t, d, cf: f.cf * (s.soft ? 1.0 : 1), q: f.q, g: f.g, voiced: false }); t += d; }
            else if (!s.voiced) { const d = 0.026 / spd; segs.push({ k: 'asp', t, d }); t += d; }
          } else if (c.t === 'fric') {
            const d = c.d / spd / sp;
            segs.push({ k: 'fric', t, d, cf: c.cf * (s.soft && s.c !== 'щ' ? 1.12 : 1), q: c.q, g: c.g, voiced: !!s.voiced });
            t += d;
          } else {
            const d = c.d / spd;
            segs.push({ k: c.t === 'trill' ? 'trill' : 'son', t, d, F: c.F.slice(), g: c.g, soft: s.soft, nasal: s.c === 'м' || s.c === 'н' });
            t += d;
          }
        }
      });
      t += 0.012 / spd;
      gw++;
    });
    const pause = ph.term === ',' ? 0.17 : ph.term === '!' ? 0.2 : ph.term === '?' ? 0.3 : ph.term === '.' ? 0.28 : 0.15;
    if (pi < phrases.length - 1) t += pause / (1 + 0.3 * e);
  });
  return { segs, total: t + 0.12, P, e };
}

const _cache = new WeakMap();
function resources(ctx) {
  let r = _cache.get(ctx);
  if (r) return r;
  const len = ctx.sampleRate * 2, noise = ctx.createBuffer(1, len, ctx.sampleRate), d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const il = Math.floor(ctx.sampleRate * 1.4), imp = ctx.createBuffer(2, il, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const ch = imp.getChannelData(c); for (let i = 0; i < il; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / il, 2.6); }
  const conv = ctx.createConvolver(); conv.buffer = imp;
  r = { noise, conv, curves: {} };
  _cache.set(ctx, r);
  return r;
}
function shaperCurve(k) {
  const n = 512, c = new Float32Array(n), tk = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / tk; }
  return c;
}

// build the node graph and schedule everything; returns { end, stop() }
function synth(ctx, dest, text, o, t0) {
  const voice = o.voice || 'pbp', e = clamp(o.energy == null ? 0.3 : o.energy, 0, 1);
  const pl = plan(text, voice, e), P = pl.P, R = resources(ctx);
  const base = P.f0 * (0.97 + Math.random() * 0.06);
  const hz = (s) => base * Math.pow(2, s / 12);
  const nodes = [];
  const mk = (n) => { nodes.push(n); return n; };
  const loud = (0.62 + 0.3 * e) * (o.vol == null ? 1 : o.vol);
  const out = mk(ctx.createGain()); out.gain.setValueAtTime(0.0001, t0); out.gain.linearRampToValueAtTime(loud, t0 + 0.03);
  // glottal source: two slightly detuned saws + breath + vibrato
  const o1 = mk(ctx.createOscillator()), o2 = mk(ctx.createOscillator());
  o1.type = o2.type = 'sawtooth'; o2.detune.value = 9 + 10 * e;
  const f0p = [o1.frequency, o2.frequency];
  const setF = (t, v) => f0p.forEach((p) => p.setValueAtTime(v, t));
  const rampF = (t, v) => f0p.forEach((p) => p.linearRampToValueAtTime(v, t));
  const vib = mk(ctx.createOscillator()); vib.frequency.value = 5.2 + e * 0.8;
  const vibG = mk(ctx.createGain()); vibG.gain.value = base * (0.006 + 0.012 * e);
  vib.connect(vibG); f0p.forEach((p) => vibG.connect(p));
  const mix = mk(ctx.createGain()); mix.gain.value = 0.5;
  o1.connect(mix); o2.connect(mix);
  const bn = mk(ctx.createBufferSource()); bn.buffer = R.noise; bn.loop = true;
  const bg = mk(ctx.createGain()); bg.gain.value = P.breath * (1 + 1.4 * e);
  bn.connect(bg); bg.connect(mix);
  // vocal tract: three formants (shifted up when shouting: open mouth)
  const fsc = P.fs * (1 + 0.04 * e);
  const fl = [], Q = [5, 8, 11], FG = [1, 0.8, 0.5], sum = mk(ctx.createGain());
  for (let i = 0; i < 3; i++) {
    const f = mk(ctx.createBiquadFilter()); f.type = 'bandpass'; f.Q.value = Q[i]; f.frequency.value = [500, 1500, 2500][i];
    const g = mk(ctx.createGain()); g.gain.value = FG[i];
    mix.connect(f); f.connect(g); g.connect(sum); fl.push(f);
  }
  const vg = mk(ctx.createGain()); vg.gain.value = 0.0001; sum.connect(vg);
  // growl: fast amplitude roughness
  const rasp = mk(ctx.createGain()); rasp.gain.value = 1 - P.rough * 0.5 * (1 + e);
  const rl = mk(ctx.createOscillator()); rl.frequency.value = 62 + Math.random() * 20;
  const rlg = mk(ctx.createGain()); rlg.gain.value = P.rough * 0.5 * (1 + e);
  rl.connect(rlg); rlg.connect(rasp.gain); vg.connect(rasp);
  // broadcast tone
  const ls = mk(ctx.createBiquadFilter()); ls.type = 'lowshelf'; ls.frequency.value = 220; ls.gain.value = 3.5;
  const pk = mk(ctx.createBiquadFilter()); pk.type = 'peaking'; pk.frequency.value = 2600; pk.Q.value = 0.9; pk.gain.value = 4 + 2 * e;
  const lp = mk(ctx.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 6800;
  const pre = mk(ctx.createGain()); pre.gain.value = 2.6 - 0.9 * e;
  const sh = mk(ctx.createWaveShaper()); const k = 1.15 + 9 * e * e * P.grit; sh.curve = shaperCurve(k); sh.oversample = '2x';
  rasp.connect(ls); ls.connect(pk); pk.connect(lp); lp.connect(pre); pre.connect(sh); sh.connect(out);
  // consonant noise (not shaped by the formants)
  const fn = mk(ctx.createBufferSource()); fn.buffer = R.noise; fn.loop = true;
  const fb = mk(ctx.createBiquadFilter()); fb.type = 'bandpass'; fb.frequency.value = 4000; fb.Q.value = 1;
  const fgn = mk(ctx.createGain()); fgn.gain.value = 0.0001;
  fn.connect(fb); fb.connect(fgn); fgn.connect(out);
  // room
  const wet = mk(ctx.createGain()); wet.gain.value = P.rev * (1 + e);
  out.connect(wet); wet.connect(R.conv);
  const reverbOut = mk(ctx.createGain()); reverbOut.gain.value = 1; R.conv.connect(reverbOut); reverbOut.connect(dest);
  out.connect(dest);

  const A = (p, v, t, tau) => p.setTargetAtTime(v, t, tau == null ? 0.01 : tau);
  const Fset = (t, F, tau) => { for (let i = 0; i < 3; i++) A(fl[i].frequency, F[i] * fsc * (i === 0 ? 1 + 0.1 * e : 1), t, tau == null ? 0.022 : tau); };
  setF(t0, hz(0)); Fset(t0, VOW_F['а'], 0.001);
  fgn.gain.setValueAtTime(0.0001, t0);
  for (const s of pl.segs) {
    const t = t0 + s.t, te = t + s.d;
    if (s.k === 'v') {
      const lv = (s.st ? 1 : 0.62) * (s.red ? 0.9 : 1);
      if (s.soft) { Fset(t - 0.004, [300, 2200, 3000], 0.006); Fset(t + 0.018, VOW_F[s.v], 0.02); } else Fset(t, VOW_F[s.v], 0.024);
      A(vg.gain, lv, t, 0.012);
      setF(t, hz(s.a)); rampF(t + s.d * 0.38, hz(s.pk)); rampF(te, hz(s.z));
      if (s.crack) { f0p.forEach((p) => { p.setValueAtTime(hz(s.pk), te - s.d * 0.3); p.linearRampToValueAtTime(hz(s.pk) * 1.25, te - s.d * 0.26); p.linearRampToValueAtTime(hz(s.z) * 0.9, te); }); }
      A(vg.gain, lv * 0.45, te - 0.014, 0.01);
    } else if (s.k === 'son' || s.k === 'trill') {
      Fset(t, s.soft ? [s.F[0], s.F[1] * 1.12, s.F[2]] : s.F, 0.014);
      A(vg.gain, s.g * (s.nasal ? 0.75 : 1), t, 0.008);
      if (s.k === 'trill') { for (let i = 0; i < 2; i++) { A(vg.gain, s.g * 0.25, t + i * 0.028 + 0.012, 0.004); A(vg.gain, s.g, t + i * 0.028 + 0.024, 0.004); } }
    } else if (s.k === 'stop') {
      A(vg.gain, s.voiced ? 0.1 : 0.0001, t, 0.006);
      if (s.voiced) Fset(t, [260, 900, 2300], 0.01);
      fb.frequency.setValueAtTime(s.cf * (s.soft ? 1.2 : 1), te - 0.012); fb.Q.setValueAtTime(1.3, te - 0.012);
      fgn.gain.setValueAtTime(0.0001, te - 0.012);
      fgn.gain.linearRampToValueAtTime(s.g * 1.1, te - 0.004);
      fgn.gain.exponentialRampToValueAtTime(0.0001, te + 0.016);
    } else if (s.k === 'fric') {
      fb.frequency.setValueAtTime(s.cf, t); fb.Q.setValueAtTime(s.q, t);
      fgn.gain.setValueAtTime(0.0001, t); fgn.gain.linearRampToValueAtTime(s.g, t + Math.min(0.014, s.d * 0.3));
      fgn.gain.setValueAtTime(s.g, te - 0.012); fgn.gain.linearRampToValueAtTime(0.0001, te);
      if (s.voiced) { Fset(t, [260, 1000, 2300], 0.01); A(vg.gain, 0.2, t, 0.008); } else A(vg.gain, 0.0001, t, 0.005);
    } else if (s.k === 'asp') {
      fb.frequency.setValueAtTime(1600, t); fb.Q.setValueAtTime(0.6, t);
      fgn.gain.setValueAtTime(0.0001, t); fgn.gain.linearRampToValueAtTime(0.16, t + 0.006); fgn.gain.linearRampToValueAtTime(0.0001, te);
    } else if (s.k === 'breath') {
      fb.frequency.setValueAtTime(1000, t); fb.Q.setValueAtTime(0.5, t);
      fgn.gain.setValueAtTime(0.0001, t); fgn.gain.linearRampToValueAtTime(0.14, t + s.d * 0.6); fgn.gain.linearRampToValueAtTime(0.0001, te);
    }
  }
  const end = t0 + pl.total;
  vg.gain.setTargetAtTime(0.0001, end - 0.1, 0.02);
  out.gain.setValueAtTime(loud, end - 0.05); out.gain.linearRampToValueAtTime(0.0001, end + 0.1);
  [o1, o2, vib, rl, bn, fn].forEach((n) => { n.start(t0); n.stop(end + 0.7); });
  let stopped = false;
  return {
    end, nodes, voice, e,
    stop(ctxNow) {
      if (stopped) return; stopped = true;
      try { const n = ctxNow != null ? ctxNow : ctx.currentTime; out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(out.gain.value, n); out.gain.linearRampToValueAtTime(0.0001, n + 0.07); [o1, o2, vib, rl, bn, fn].forEach((x) => { try { x.stop(n + 0.1); } catch (er) { /* done */ } }); } catch (er) { /* closed */ }
    },
    dispose() { nodes.forEach((n) => { try { n.disconnect(); } catch (er) { /* gone */ } }); },
  };
}

const Voice = {
  cur: [], busyUntil: 0, plan, synth, numWords,
  // render in the game's own audio context
  speak(audio, text, o = {}) {
    if (!audio.ctx) return 0;
    const ctx = audio.ctx, now = ctx.currentTime;
    if (!o.queue) this.cancel();
    if (!audio._voiceBus) { const g = ctx.createGain(); g.gain.value = 1.5; g.connect(audio.master); audio._voiceBus = g; }
    const start = Math.max(now + 0.03, o.queue ? this.busyUntil + 0.18 : 0);
    const u = synth(ctx, audio._voiceBus, text, o, start);
    this.cur.push(u); this.busyUntil = u.end;
    setTimeout(() => { u.dispose(); this.cur = this.cur.filter((x) => x !== u); }, Math.max(0, (u.end - now) * 1000) + 1200);
    return u.end - start;
  },
  cancel() { this.cur.forEach((u) => u.stop()); this.cur = []; this.busyUntil = 0; },
};
UFC.Voice = Voice;
})();

