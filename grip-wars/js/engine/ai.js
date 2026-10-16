//# sourceURL=ufc/ai.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;

// ---------------------------------------------------------------------------
// Player controller: pad -> fighter intent
// ---------------------------------------------------------------------------
class PlayerController {
  constructor(fighter, input, game) { this.f = fighter; this.input = input; this.game = game; }

  update() {
    const f = this.f, s = this.input.state, it = f.intent, inp = this.input;
    const game = this.game, gr = game.grapple;
    if (f.state === 'grapple' && gr) {
      const role = gr.a === f ? 'a' : 'b';
      const anyStrike = inp.pressed('square') || inp.pressed('triangle') || inp.pressed('cross') || inp.pressed('circle');
      if (gr.sub) {
        if (gr.sub.att === f && (anyStrike || inp.pressed('grapple') || inp.pressed('sub'))) gr.squeeze(f);
        if (gr.sub.def === f && (anyStrike || inp.pressed('grapple') || inp.pressed('r2') || inp.pressed('l2'))) gr.defend(f);
        return;
      }
      if (inp.pressed('r2') || inp.pressed('l2')) gr.defend(f);
      if ((inp.pressed('grapple') || inp.pressed('gnp')) && s.l1) gr.request(f, 'sub');
      else if (inp.pressed('grapple') || inp.pressed('gnp')) gr.request(f, role === 'a' ? 'advance' : 'escape');
      if (inp.pressed('sub')) gr.request(f, 'sub');
      if (inp.pressed('td')) gr.request(f, role === 'a' ? 'takedown' : 'escape');
      if (inp.pressed('square') || inp.pressed('triangle')) gr.strike(f, s.l1 || s.r1 ? 'elbow' : 'punch');
      if (inp.pressed('cross') || inp.pressed('circle')) gr.strike(f, 'knee');
      if (s.ly < -0.85 && !UFC.GRAPPLE_POS[gr.pos].ground) gr.request(f, 'break');
      return;
    }
    // ground & pound: opt-in finishing on a downed opponent
    if (inp.pressed('flow') && f.canFlow()) { f.startFlow(); this.game.onFlow(f); return; }
    if (inp.pressed('commit') && f.canCommit()) { f.startCommit(); this.game.onCommit(f); }
    if (inp.pressed('counter') && this.game.counterWin) { const q = this.game.fireCounter(f); if (q) it.strike = q; }
    if (f.state === 'fight' && (inp.pressed('gnp') || inp.pressed('grapple')) && f.canGnp()) { f.startGnp(); return; }
    if (f.state === 'fight' && inp.pressed('grapple')) { UFC.tryClinch(game, f); return; }
    if (f.state === 'fight' && inp.pressed('td')) { UFC.tryShot(game, f); return; }
    if (f.state === 'gnp') {
      if (inp.pressed('gnp') || s.ly < -0.75) f.gnp.exitRequest = true;
      const heavy = s.l1 || s.r1;
      if (inp.pressed('square')) it.strike = { type: heavy ? 'hook' : 'straight', limb: 'L' };
      else if (inp.pressed('triangle')) it.strike = { type: heavy ? 'hook' : 'straight', limb: 'R' };
      return;
    }
    // Left stick is camera relative so "right" on screen is always right.
    const cam = this.game.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wx = right.x * s.lx + fwd.x * s.ly, wz = right.z * s.lx + fwd.z * s.ly;
    const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw), lx = Math.cos(f.yaw), lz = -Math.sin(f.yaw);
    it.mx = wx * lx + wz * lz;
    it.mz = wx * fx + wz * fz;
    // Right stick: fighter relative head movement (left/right slip, down duck, up pull back)
    it.slipX = -s.rx;
    it.slipZ = -s.ry;
    it.block = s.r2 && s.l2 ? 'body' : s.r2 ? 'high' : s.l2 ? 'body' : 'none';

    const L = 'L', R = 'R';
    const mod = s.l1 && s.r1 ? 'body' : s.l1 ? 'hook' : s.r1 ? 'upper' : null;
    let req = null;
    const both = inp.pressed('square') && inp.pressed('triangle'), tpe = mod === 'body' ? 'body' : mod === 'hook' ? 'hook' : mod === 'upper' ? 'uppercut' : 'straight';
    if (this._q && performance.now() >= this._q.at) { it.strike = this._q.req; this._q = null; }
    if (both) { req = { type: tpe, limb: L, fast: true }; this._q = { req: { type: tpe, limb: R, fast: true }, at: performance.now() + 55 }; }   // both hands at once: an instant double
    else if (inp.pressed('square')) req = { type: mod === 'body' ? 'body' : mod === 'hook' ? 'hook' : mod === 'upper' ? 'uppercut' : 'straight', limb: L };
    else if (inp.pressed('triangle')) req = { type: mod === 'body' ? 'body' : mod === 'hook' ? 'hook' : mod === 'upper' ? 'uppercut' : 'straight', limb: R };
    else if (inp.pressed('cross')) req = { type: s.l1 ? 'bodyKick' : s.r1 ? 'headKick' : 'lowKick', limb: L };
    else if (inp.pressed('circle')) req = { type: s.l1 ? 'bodyKick' : s.r1 ? 'headKick' : 'lowKick', limb: R };
    if (req && this.game.koWindow && this.game.koSide === f && /Kick|spin/.test(req.type)) req = { type: 'hook', limb: req.limb };   // only hands on the floor
    if (req && f.angry && req.type === 'straight' && !req.fast) req = UFC.smartStrike(f, req.limb) || req;   // angry: one button, the best blow for what he leaves open
    if (req && f.technique === 'mcgregor') {
      if (req.type === 'bodyKick' && s.l1 && s.r1) req = { type: inp.pressed('cross') ? 'spinKick' : 'spinKickHead', limb: req.limb };   // spinning back kick: liver (✕) or head (○)
      else if (req.type === 'uppercut') req = { type: 'layback', limb: f.rearSide };                                                      // leaning back, the counter left
    }
    if (req && f.mcgMod) {   // the McGregor mod: the right-hand straight is an elbow, the plain kicks are karate (mae-geri L, yoko-geri R)
      if (req.type === 'straight' && req.limb === 'R') req = { type: 'elbow', limb: 'R', fast: req.fast };
      else if (req.type === 'lowKick') req = { type: req.limb === 'L' ? 'frontKick' : 'sideKick', limb: req.limb };
    }
    if (req) { if (!(UFC.judoReq && UFC.judoReq(f, req))) it.strike = req; }
  }
}
// Reads what the opponent does: the body is open - a body shot, the head is open - a straight (60% of the time the head),
// the body is covered - hooks and uppercuts to the head and low kicks, the head is covered - the body, the low kick, a hook around the guard.
UFC.smartStrike = (f, limb) => {
  const o = f.opponent; if (!o) return null;
  const rg = UFC.AIController.prototype.ranges.call({ f }), dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
  const attacking = !!o.strike, headOpen = attacking || o.block !== 'high', bodyOpen = attacking || o.block !== 'body';
  const r = Math.random(), r2 = Math.random();
  let type;
  const head = () => (r2 < 0.5 ? 'straight' : r2 < 0.8 ? 'hook' : 'uppercut');
  if (dist > rg.punch + 0.15 && dist <= rg.kick + 0.25) type = r < 0.4 ? 'headKick' : 'lowKick';
  else if (dist > rg.kick + 0.25) return null;
  else if (headOpen && bodyOpen) type = r < 0.6 ? head() : r < 0.85 ? 'body' : 'lowKick';
  else if (headOpen) type = r < 0.45 ? 'hook' : r < 0.7 ? 'uppercut' : r < 0.85 ? 'straight' : 'lowKick';
  else if (bodyOpen) type = r < 0.55 ? 'body' : r < 0.8 ? 'lowKick' : 'hook';
  else type = 'hook';
  return { type, limb };
};
UFC.PlayerController = PlayerController;

// ---------------------------------------------------------------------------
// AI opponent
// ---------------------------------------------------------------------------
const LEVELS = [
  { name: 'Лёгкий', react: 0.26, block: 0.3, slip: 0.04, check: 0.08, cd: 1.5, combo: 2, read: 0.0, counter: 0.05, jitter: 0.3, guard: 0.2 },
  { name: 'Средний', react: 0.17, block: 0.5, slip: 0.12, check: 0.25, cd: 0.95, combo: 3, read: 0.15, counter: 0.2, jitter: 0.18, guard: 0.45 },
  { name: 'Выше среднего', react: 0.145, block: 0.56, slip: 0.17, check: 0.34, cd: 0.85, combo: 4, read: 0.24, counter: 0.28, jitter: 0.14, guard: 0.5 },
  { name: 'Эксперт', react: 0.085, block: 0.7, slip: 0.32, check: 0.6, cd: 0.5, combo: 5, read: 0.5, counter: 0.6, jitter: 0.06, guard: 0.62 },
];
UFC.AI_LEVELS = LEVELS;
for (const l of LEVELS) { l.react *= 0.64; l.guard = Math.min(0.9, l.guard + 0.24); l.block = Math.min(0.9, l.block + 0.12); l.slip = Math.min(0.5, l.slip * 1.3); }   // harder to hit
for (const l of LEVELS) { l.react *= 0.85; l.cd *= 0.78; l.combo += 1; l.counter = Math.min(0.85, l.counter * 1.3 + 0.05); l.jitter *= 0.8; }   // and they work harder: quicker, more often, longer combos, better counters

// Honest handicap for AI-controlled fighters: the NPC is a bit slower, tires
// faster and hits a bit softer, and its accuracy comes from real aim spread.
// Nothing is hidden and nothing punishes the player.
UFC.NPC_MODS = [
  { stamina: 1.04, regen: 1.04, speed: 1.0, damage: 1.0, move: 1.05, spread: 0.046 },  // easy
  { stamina: 1.08, regen: 1.08, speed: 1.06, damage: 1.12, move: 1.08, spread: 0.036 },  // medium
  { stamina: 1.1, regen: 1.1, speed: 1.1, damage: 1.2, move: 1.1, spread: 0.03 },  // above medium
  { stamina: 1.14, regen: 1.14, speed: 1.14, damage: 1.32, move: 1.12, spread: 0.024 },  // expert
];

// Combos use 'lead'/'rear' so they work for either stance.
const C = (...seq) => seq.map((x) => { const [type, hand] = x.split(':'); return { type, hand }; });
const REPERTOIRE = {
  boxer: [
    [C('straight:lead'), 3], [C('straight:lead', 'straight:rear'), 5], [C('straight:lead', 'straight:rear', 'hook:lead'), 4],
    [C('straight:rear', 'hook:lead', 'straight:rear'), 2], [C('straight:lead', 'body:rear'), 2], [C('body:lead', 'hook:lead'), 2],
    [C('uppercut:rear', 'hook:lead'), 2], [C('straight:lead', 'straight:lead', 'straight:rear'), 2], [C('hook:lead', 'straight:rear'), 1],
  ],
  kickboxer: [
    [C('straight:lead', 'straight:rear', 'lowKick:rear'), 4], [C('bodyKick:rear'), 3], [C('lowKick:lead'), 2], [C('lowKick:rear'), 3],
    [C('straight:lead', 'headKick:rear'), 1.5], [C('straight:rear', 'hook:lead', 'lowKick:rear'), 2], [C('straight:lead'), 2],
    [C('bodyKick:lead', 'straight:rear'), 1.5], [C('straight:lead', 'straight:rear'), 2],
  ],
  brawler: [
    [C('hook:rear'), 3], [C('hook:lead', 'hook:rear'), 4], [C('straight:rear', 'uppercut:rear', 'hook:lead'), 2.5],
    [C('straight:lead', 'hook:rear'), 3], [C('body:rear', 'hook:lead'), 2], [C('hook:rear', 'hook:lead', 'hook:rear'), 1.5], [C('lowKick:rear'), 1],
  ],
  wrestler: [
    [C('straight:lead', 'straight:rear'), 4], [C('straight:lead'), 3], [C('hook:rear'), 2], [C('body:rear', 'hook:lead'), 1.5], [C('lowKick:rear'), 1],
  ],
};
REPERTOIRE.topuria = [
  [C('straight:lead', 'straight:rear'), 5], [C('straight:rear', 'hook:lead'), 4], [C('straight:lead', 'straight:rear', 'hook:lead'), 4],
  [C('straight:rear', 'straight:rear'), 2], [C('hook:lead', 'straight:rear'), 3], [C('straight:lead', 'body:rear'), 2], [C('uppercut:rear', 'hook:lead'), 2],
];
REPERTOIRE.mcgregor = [
  [C('straight:lead', 'straight:rear'), 5], [C('straight:rear'), 4], [C('straight:lead', 'straight:lead', 'straight:rear'), 3],
  [C('lowKick:lead', 'straight:rear'), 2], [C('bodyKick:rear'), 1.5], [C('straight:lead', 'hook:rear'), 1.5], [C('straight:lead'), 2],
  [C('straight:lead', 'spinKick:rear'), 0.7], [C('straight:lead', 'spinKickHead:rear'), 0.5], [C('layback:rear'), 0.8],
];

class AIController {
  constructor(fighter, level, game) {
    this.f = fighter; this.game = game;
    this.P = LEVELS[M.clamp(level, 0, 3)];
    this.style = REPERTOIRE[fighter.cfg.style] ? fighter.cfg.style : 'boxer';
    if (fighter.technique === 'mcgregor') this.style = 'mcgregor';
    if (fighter.technique === 'topuria') this.style = 'topuria';
    this.queue = [];
    this.cd = 1.2;
    this.lateral = Math.random() < 0.5 ? 1 : -1;
    this.lateralT = 1;
    this.handled = null;
    this.pending = null;
    this.defT = 0; this.defBlock = 'none'; this.defSlipX = 0; this.defSlipZ = 0;
    this.seen = {};
    this.seenTotal = 0;
    this.recent = [];
    this.retreatT = 0;
    this.nextStrikeDelay = 0;
    this.guardT = 0; this.guardUp = false; this.entering = 0; this.comboStarted = false;
    this.prefer = { boxer: 1.0, kickboxer: 1.2, brawler: 0.85, wrestler: 0.95, topuria: 0.9, mcgregor: 1.15 }[this.style];
  }

  // Centre-to-centre distance at which this fighter's punches / kicks land.
  ranges() {
    const f = this.f, d = f.body.dims;
    const arm = d.upper + d.fore + 0.03 * f.h;
    const leg = d.thigh + d.shin;
    return { punch: arm + 0.34, kick: leg * 0.8 + 0.36 };
  }

  update(dt) {
    const f = this.f, o = f.opponent, it = f.intent, P = this.P;
    it.strike = null;
    if (f.state === 'gnp') { this._gnpTick(dt); return; }
    this.gnpApproach = false;
    if (f.state === 'fight' && o.isGrounded && o.isGrounded() && !o.gnpBy) {
      const key = o.knockdowns;
      if (this.gnpDecidedFor !== key) {
        this.gnpDecidedFor = key;
        const want = 0.3 + this.P.block * 0.35 + (o.head < 55 ? 0.2 : 0) - (f.stamina < 30 ? 0.3 : 0);
        this.gnpWanted = Math.random() < want;
      }
      if (this.gnpWanted) {
        if (f.canGnp()) { f.startGnp(); this.gnpT = 0; this.gnpNext = M.rand(0.5, 0.8); this.gnpLeave = M.rand(2.6, 4.2); return; }
        this.gnpApproach = true;
      }
    }
    if (f.state !== 'fight' && f.state !== 'getup') { it.mx = it.mz = 0; it.block = 'none'; return; }
    const dist = Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z);
    const R = this.ranges();
    const oppR = this.oppRanges || (this.oppRanges = UFC.AIController.prototype.ranges.call({ f: o }));

    this._perceive(dt);

    // ----- strategic state -----
    let aggression = { boxer: 0.6, kickboxer: 0.55, brawler: 0.8, wrestler: 0.6, mcgregor: 0.5, topuria: 0.8 }[this.style];
    if (o.rocked || o.state === 'getup') aggression = 1.5;
    if (f.stamina < 30) aggression *= 0.5;
    if (f.stamina < 15) aggression *= 0.3;   // he knows a gassed arm is useless: he covers up and breathes
    if (f.rocked) aggression = 0.12;
    if (f.head < o.head - 25) aggression *= 1.25;
    if (f.daze > 0.4) aggression *= 0.8;
    this.aggression = aggression;

    // ----- movement: manage distance -----
    const longRange = this.style === 'kickboxer' ? R.kick : R.punch;
    let want = Math.max(longRange, oppR.punch) + (this.style === 'mcgregor' ? 0.32 : 0.12);           // hover just outside (he keeps a long distance)
    if (aggression > 1) want = R.punch - 0.2;                    // press a hurt opponent
    if (this.queue.length || this.entering > 0) want = (this.queueKick ? R.kick : R.punch) - 0.22;
    if (f.rocked || f.stamina < 15) want = oppR.kick + 0.6;
    if (this.retreatT > 0) { this.retreatT -= dt; want = oppR.punch + 0.35; }
    if (o.state === 'down' || o.state === 'ko') want = this.gnpApproach ? 0.7 : 2.0;
    if (this.entering > 0) this.entering -= dt;

    const err = dist - want;
    let mz = M.clamp(err * 2.5, -1, 1);
    if (Math.abs(err) < 0.06) mz = 0;
    this.lateralT -= dt;
    if (this.lateralT <= 0) { this.lateral = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? 1 : -1); this.lateralT = M.rand(0.7, 2.0); }
    let mx = this.lateral * (this.queue.length ? 0.2 : 0.6);
    const cage = UFC.distToCage(f.pos);
    if (cage < 1.1) {
      const toCenter = new THREE.Vector3(-f.pos.x, 0, -f.pos.z).normalize();
      const lx = Math.cos(f.yaw), lz = -Math.sin(f.yaw);
      mx = (toCenter.x * lx + toCenter.z * lz) > 0 ? 1 : -1;
      if (mz < 0) mz *= 0.25;
    }
    if (this.defT > 0 && this.defBlock === 'retreat') mz = -1;
    it.mx = mx; it.mz = mz;
    // a beaten head wanders: he walks around at random, barely looking at the opponent
    const dzf = f.daze;
    if (dzf > 0.3) {
      const wr = Math.min(1, (dzf - 0.25) / 0.6) * 0.2, tt = f.time;   // 20% more random
      it.mx += (Math.sin(tt * 0.9 + 1.3) + 0.6 * Math.sin(tt * 2.1)) * wr * 0.7;
      it.mz = M.lerp(it.mz, Math.sin(tt * 0.6 + 0.4) * 0.9, wr * 0.6);
      // and from time to time he gives ground instead of standing in front of the punches
      this._dzRt = (this._dzRt == null ? M.rand(2, 4) : this._dzRt) - dt;
      if (this._dzRt <= 0) { this._dzRt = M.rand(2.5, 5) / (0.5 + dzf); if (Math.random() < 0.6) this.retreatT = M.rand(0.5, 1.1); }
    }

    // ----- defence -----
    // Guard discipline: good fighters keep their hands up when in the pocket.
    const inDanger = dist < oppR.punch + 0.15;
    this.guardT -= dt;
    if (this.guardT <= 0) {
      const p = inDanger ? P.guard * (f.rocked ? 1.8 : 1) * (o.rocked ? 0.3 : 1) : 0.05;
      this.guardUp = Math.random() < p;
      this.guardT = M.rand(0.35, 0.9);
    }
    if (this.defT > 0) {
      this.defT -= dt;
      it.block = this.defBlock === 'retreat' ? 'none' : this.defBlock;
      it.slipX = this.defSlipX; it.slipZ = this.defSlipZ;
    } else {
      it.block = this.guardUp && !this.queue.length && !f.strike ? 'high' : 'none';
      it.slipX = M.damp(it.slipX, Math.sin(f.time * 1.3) * 0.18, 4, dt);
      it.slipZ = M.damp(it.slipZ, 0, 6, dt);
    }

    // ----- offence -----
    this.cd -= dt;
    if (this.queue.length) {
      this.nextStrikeDelay -= dt;
      const first = !this.comboStarted;
      const next = this.queue[0];
      // the rear hand starts further back: step in a little more for it
      const range = next.type.endsWith('Kick') ? R.kick : R.punch - (next.hand === 'lead' ? 0 : 0.1);
      const ready = !f.strike || f.strike.phase === 'ret' || (f.strike.phase === 'hold' && f.strike.contact);
      // Only open the combo once in range; give up if the approach takes too long.
      if (first && dist > range) {
        if (this.entering <= 0) { this.queue.length = 0; this.cd = 0.3; }
      } else if (ready && this.nextStrikeDelay <= 0 && this.defT <= 0) {
        this.queue.shift();
        this.comboStarted = true;
        const limb = next.hand === 'lead' ? f.leadSide : f.rearSide;
        it.strike = { type: next.type, limb };
        this.nextStrikeDelay = M.rand(0, P.jitter);
        if (!this.queue.length) {
          this.comboStarted = false;
          this.cd = P.cd * M.rand(0.7, 1.4) / aggression;
          if (this.style !== 'brawler' && Math.random() < 0.6) this.retreatT = M.rand(0.35, 0.8);
        }
      }
    } else if (this.cd <= 0 && f.canAct() && o.state !== 'down' && o.state !== 'ko') {
      const closeEnough = dist < longRange + 0.9;
      const wr = (f.cfg.stats.wrestling || 60) / 100;
      const pShot = ({ wrestler: 0.3, brawler: 0.05, boxer: 0.05, kickboxer: 0.04 }[this.style] || 0.05) * (0.4 + wr) * (o.rocked ? 1.5 : 1) * (o.isPlayer ? 0.62 : 1) * (UFC.mobile && o.isPlayer ? UFC.MOBILE_TUNE.npcShot : 1);
      const pClinch = ({ wrestler: 0.14, brawler: 0.1, boxer: 0.04, kickboxer: 0.07 }[this.style] || 0.05);
      if (!UFC.NO_GRAPPLE && !this.game.grapple && dist < 1.7 && dist > 0.85 && f.stamina > 30 && Math.random() < pShot) { UFC.tryShot(this.game, f); this.cd = P.cd * 1.5; }
      else if (!UFC.NO_GRAPPLE && !this.game.grapple && dist < 1.0 && f.stamina > 25 && Math.random() < pClinch) { UFC.tryClinch(this.game, f); this.cd = P.cd; }
      else if (closeEnough && Math.random() < 0.3 + aggression * 0.45) {
        this._chooseCombo(dist, R);
        this.entering = 0.9;
        this.comboStarted = false;
        this.queueKick = this.queue.length && this.queue[0].type.endsWith('Kick');
      } else this.cd = 0.2;
    }
  }


  _gnpTick(dt) {
    const f = this.f, g = f.gnp;
    if (!g) return;
    // started from outside the AI's own decision (e.g. scripted): set up its timers
    if (!(this.gnpNext > -99)) { this.gnpNext = 0.3; this.gnpT = 0; this.gnpLeave = M.rand(2.6, 4.2); }
    this.gnpT += dt;
    this.gnpNext -= dt;
    if (this.gnpNext <= 0 && !g.strike && !g.queue && g.t > (g.enterDur || 0.45) + 0.05) {
      // each fighter works from the top in his own way (UFC.GNP_PROFILES)
      const prof = g.prof || UFC.gnpProfile(f);
      const lead = f.cfg.stance === 'southpaw' ? 'R' : 'L', rear = lead === 'L' ? 'R' : 'L';
      let move, limb;
      if (this.gnpFlurry > 0) {
        this.gnpFlurry--;
        move = M.pick(['punch', 'punch', 'hammer', 'side']);
        this.limbToggle = !this.limbToggle;
        limb = Math.random() < prof.lead ? lead : (this.limbToggle ? lead : rear);
      } else {
        move = M.weighted(Object.entries(prof.moves));
        limb = Math.random() < prof.lead ? lead : rear;
        // hurt opponent: finish in a burst
        const hurt = f.opponent && f.opponent.head < 55;
        if (Math.random() < prof.flurry * (hurt ? 1.6 : 1)) this.gnpFlurry = 2 + ((Math.random() * 2) | 0);
      }
      f.intent.strike = { type: 'gnp', move, limb, quick: this.gnpFlurry > 0 };
      this.gnpNext = this.gnpFlurry > 0 ? M.rand(0.1, 0.18) : M.rand(0.42, 0.75) * (1.3 - this.P.block * 0.5) * prof.speed;
    }
    if (this.gnpT > this.gnpLeave || f.stamina < 15) g.exitRequest = true;
  }

  _chooseCombo(dist, R) {
    const f = this.f, o = f.opponent, P = this.P;
    const list = REPERTOIRE[this.style];
    const entries = list.map(([seq, w]) => {
      let weight = w;
      const kinds = seq.map((x) => x.type);
      const hasBody = kinds.some((k) => k === 'body' || k === 'bodyKick');
      const hasLow = kinds.includes('lowKick');
      const hasHead = kinds.some((k) => k === 'straight' || k === 'hook' || k === 'uppercut' || k === 'headKick');
      if (hasBody) weight *= 3.4;
      if (hasLow) weight *= 2.4;
      if (!hasBody && !hasLow) weight *= 0.75;
      if (o.block === 'high') { if (hasBody || hasLow) weight *= 2.2; }
      if (o.legs < 55 && hasLow) weight *= 1.8;
      if (o.bodyHp < 55 && hasBody) weight *= 1.5;
      if ((o.rocked || o.state === 'getup') && hasHead) weight *= 2;
      if (f.stamina < 35) weight *= seq.length === 1 ? 2 : 0.5;
      if (seq.length > P.combo) weight *= 0.05;
      const tooFar = dist > R.punch + 0.4 && !kinds[0].endsWith('Kick');
      if (tooFar) weight *= 0.1;
      const key = kinds.join('-');
      const rep = this.recent.filter((r) => r === key).length;
      weight *= Math.pow(0.45, rep);
      return [seq, weight];
    });
    const seq = M.weighted(entries);
    if (!seq) return;
    this.queue = seq.slice();
    if (f.technique === 'topuria' && f.canCommit() && dist < R.punch + 0.3 && Math.random() < 0.4) f.startCommit();
    this.nextStrikeDelay = 0;
    this.recent.push(seq.map((x) => x.type).join('-'));
    if (this.recent.length > 4) this.recent.shift();
  }

  // Watch the opponent's strikes and schedule a human-speed reaction.
  _perceive(dt) {
    const f = this.f, o = f.opponent, P = this.P;
    const s = o.strike;
    if (!s || s.id === this.handled) {
      if (this.pending) {
        this.pending.t -= dt;
        if (this.pending.t <= 0) { this._execDefense(this.pending); this.pending = null; }
      }
      return;
    }
    this.handled = s.id;
    if (Math.random() < Math.max(0, f.daze - 0.15) * 0.18) return;   // ~15% of the time he does not see it   // a foggy head does not even see the punch coming
    const key = s.type + ':' + (s.lead ? 'lead' : 'rear');
    this.seen[key] = (this.seen[key] || 0) + 1; this.seenTotal++;
    const familiarity = this.seenTotal > 4 ? (this.seen[key] / this.seenTotal) : 0;
    const readBonus = P.read * familiarity * 1.5;
    const react = Math.max(0.05, P.react * M.rand(0.75, 1.3) * (1 + f.daze * 0.15) * (f.rocked ? 1.6 : 1) * (1.15 - f.staminaSpeed * 0.15) - readBonus * 0.12);
    const timeToImpact = s.durs[0] + s.durs[1] * 0.8;
    if (react > timeToImpact + 0.02) return; // too fast to see
    const late = react / Math.max(0.01, timeToImpact);
    this.pending = { s, t: react, late, readBonus };
    f.bracedT = 0.5;   // he saw it: neck tight, chin down
  }

  _execDefense(p) {
    const f = this.f, P = this.P, s = p.s;
    if (!f.canDefend()) return;
    const bonus = p.readBonus + f.defense * 0.15;
    const r = Math.random() / (1 - f.daze * 0.15);
    const zone = s.def.zone;
    this.defSlipX = 0; this.defSlipZ = 0;
    if (zone === 'legs') {
      if (r < P.check + bonus) { this.defBlock = 'body'; this.defT = 0.35; }
      return;
    }
    if (zone === 'body') {
      if (r < P.block + bonus) { this.defBlock = 'body'; this.defT = 0.4; }
      else if (r < P.block + bonus + P.slip * 0.5) { this.defBlock = 'retreat'; this.defT = 0.3; }
      return;
    }
    // head
    const slipP = P.slip + bonus * 0.5;
    if (r < slipP && s.def.kind === 'punch') {
      this.defBlock = 'none'; this.defT = 0.32;
      if (s.def.path === 'hook') this.defSlipZ = 1; // duck the hook
      else this.defSlipX = (s.limb === 'L' ? 1 : -1) * (Math.random() < 0.8 ? 1 : -1);
      // counter after slipping
      if (Math.random() < P.counter && this.queue.length === 0) {
        this.queue = C(M.pick(['straight:rear', 'hook:lead', 'uppercut:rear']), 'straight:rear').slice(0, 1 + (Math.random() < 0.5 ? 1 : 0));
        this.nextStrikeDelay = 0.18; this.entering = 0.6; this.comboStarted = false;
      }
    } else if (r < slipP + P.block + bonus) {
      this.defBlock = 'high'; this.defT = M.rand(0.3, 0.5);
      if (Math.random() < P.counter * 0.5 && this.queue.length === 0) {
        this.queue = C('straight:rear', 'hook:lead').slice(0, 1 + (Math.random() < 0.4 ? 1 : 0));
        this.nextStrikeDelay = 0.45; this.entering = 0.6; this.comboStarted = false;
      }
    } else if (s.def.kind === 'kick' && r < slipP + P.block + bonus + 0.15) {
      this.defBlock = 'retreat'; this.defT = 0.35;
    }
  }
}
UFC.AIController = AIController;
})();
