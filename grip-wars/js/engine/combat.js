//# sourceURL=ufc/combat.js
(function () {
'use strict';
const UFC = window.UFC;
const M = UFC.M;
const V3 = THREE.Vector3;

// head acceleration needed for a wobble / knockdown / knockout
const HIT = { ROCK: 12, KD: 16.5, KO: 24.5 };
UFC.TUNE = { stun: 0.5, flashAt: 42, stunDecay: 16, rockedDecay: 10, footLead: 0.52, flowDur: 12, flowCooldown: 18 };
const ZONES = {
  punch_head: ['head'], punch_body: ['body'],
  kick_legs: ['legs'], kick_body: ['body', 'head'], kick_head: ['head', 'body'],
};

const _c1 = new V3(), _c2 = new V3(), _c3 = new V3(), _c4 = new V3(), _c5 = new V3(), _c6 = new V3();
function closestOnSeg(p, a, b, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const L = abx * abx + aby * aby + abz * abz;
  const t = L < 1e-10 ? 0 : M.clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L, 0, 1);
  return out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
}
// Sparse vertex samples of a fighter's visible meshes per hit group, in mesh space.
const GROUP_OF = (name) => (/^(head|neck)$/.test(name) ? 'head' : /^(chest|spine|hips)$/.test(name) ? 'body' : /^(th|sn|ft)[LR]$/.test(name) ? 'legs' : /^(ua|fa|hand|sh)[LR]$/.test(name) ? 'guard' : null);
function surfaceSamples(f, group) {
  const body = f.body;
  if (!body._surf) {
    body._surf = { head: [], body: [], legs: [], guard: [] };
    body.root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      let g = null;
      for (let p = o.parent; p && !g; p = p.parent) g = GROUP_OF(p.name);
      if (!g) return;
      const pos = o.geometry.attributes.position, stride = Math.max(1, Math.ceil(pos.count / 260));
      const pts = [];
      for (let i = 0; i < pos.count; i += stride) pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      body._surf[g].push({ mesh: o, pts });
    });
  }
  return body._surf[group] || [];
}

class Combat {
  constructor(game) {
    this.game = game;
    this._pts = [];
  }

  // Called once per fixed step after both fighters have posed.
  step(a, b) {
    this._checkStrike(a, b);
    this._checkStrike(b, a);
  }

  _checkStrike(att, def) {
    const s = att.strike;
    if (!s || s.contact || s.whiffed) return;
    const gk = s.def.kind === 'kick' && att.state === 'fight' && def.state === 'down' && def.isGrounded && def.isGrounded() && !def.gnpBy;   // a kick at a man on the floor
    if ((def.state === 'ko' || (def.state === 'down' && !gk)) && !(this.game.koWindow && att === this.game.koSide)) return;   // (after a KO the winner may still land until the referee steps in)
    const active = (s.phase === 'ext' && s.pt > (s.def.kind === 'kick' ? 0.35 : 0.45)) || s.phase === 'hold';
    if (!active) return;
    // the McGregor mod: most of the opponent's blows miss (75% on level 1, 85% on level 2)...
    if (def.mcgMod && !att.isPlayer && s.evade === undefined) s.evade = Math.random() < (def.mcgLvl >= 2 ? 0.3 : 0.2);
    if (s.evade) return;
    // ...and his own land ~99% of the time: the gloves are hardly stopped
    if (att.mcgMod && att.isPlayer && s.sure === undefined) s.sure = Math.random() < (att.mcgLvl >= 2 ? 0.6 : 0.45);
    const sure = !!s.sure;
    const zones = ZONES[s.def.kind + '_' + s.def.zone];
    const pts = att.strikerPoints(s, this._pts);
    if (!sure && def.block !== 'none' && def.canDefend()) {
      const guardZone = def.block === 'high' ? 'head' : 'body';
      if (zones.includes(guardZone) || (def.block === 'body' && s.def.zone === 'legs')) {
        for (const sp of pts) {
          if (def.touchesGuard(sp.p, sp.r)) {
            const z = def.block === 'body' && s.def.zone === 'legs' ? 'legs' : guardZone;
            this._resolve(att, def, s, z, sp.p.clone());
            return;
          }
        }
      }
    }
    // Kicks and hooks come from the side, where the arms are: if one runs
    // into the guard first it lands on the arms instead of passing through.
    // (a hook only sometimes: the gloves are narrow and it can wrap around them)
    if (s.guardRoll === undefined) s.guardRoll = Math.random();
    const wide = s.def.kind === 'kick' ? s.def.zone !== 'legs' : s.def.path === 'hook' && !s.def.elbow && s.guardRoll < 0.2 + def.defense * 0.25;
    if (!sure && wide && def.block === 'none' && def.canDefend()) {
      for (const sp of pts) {
        if (def.touchesGuard(sp.p, sp.r * 0.55)) {
          this._resolve(att, def, s, s.def.zone === 'body' ? 'body' : 'head', sp.p.clone(), 'guard');
          return;
        }
      }
    }
    for (const sp of pts) {
      const zone = def.testHit(sp.p, sp.r * (sure ? 1.5 : 1), zones);
      if (zone) { this._resolve(att, def, s, zone, sp.p.clone()); return; }
    }
    if (gk && s.def.zone === 'legs') {   // a low kick at a man on the floor lands on the legs and hips
      const Bd = def.body.B;
      for (const n of ['hips', 'thL', 'thR', 'snL', 'snR']) {
        Bd[n].getWorldPosition(_c1);
        for (const sp of pts) if (sp.p.distanceTo(_c1) < 0.3 + sp.r) { this._resolve(att, def, s, 'legs', sp.p.clone()); return; }
      }
    }
  }

  // Detection volumes are a little generous; close the remaining gap so the
  // glove / shin is seen landing on skin (or on the arms) instead of
  // stopping a few centimetres short.
  _settleContact(att, def, s, group) {
    const h = att.h, B = att.body.B;
    const surf = surfaceSamples(def, group);
    if (!surf.length) return;
    const kick = s.def.kind === 'kick';
    let best = 1e9;
    const a = _c1, b = _c2, q = _c3, bestV = _c4, bestQ = _c5;
    if (kick) { B['sn' + s.limb].getWorldPosition(a); B['ft' + s.limb].getWorldPosition(b); }
    else { a.copy(att.gloveW[s.limb]); b.copy(a); }
    for (const { mesh, pts } of surf) {
      const mw = mesh.matrixWorld;
      for (let i = 0; i < pts.length; i += 3) {
        const v = _c6.set(pts[i], pts[i + 1], pts[i + 2]).applyMatrix4(mw);
        closestOnSeg(v, a, b, q);
        const dd = v.distanceToSquared(q);
        if (dd < best) { best = dd; bestV.copy(v); bestQ.copy(q); }
      }
    }
    const vis = kick ? 0.026 * h : 0.023 * h;
    const gap = Math.sqrt(best) - vis;
    const push = M.clamp(gap + 0.004 * h, -0.03 * h, 0.07 * h);
    const dir = _c6.subVectors(bestV, bestQ);
    if (dir.lengthSq() < 1e-10) return;
    dir.normalize().multiplyScalar(push);
    // world direction -> attacker root space (yaw only)
    const c = Math.cos(-att.yaw), sn = Math.sin(-att.yaw);
    s.contactLocal.x += dir.x * c + dir.z * sn;
    s.contactLocal.z += -dir.x * sn + dir.z * c;
    s.contactLocal.y += dir.y;
    s.contactGap = gap;
  }

  _extensionFactor(att, s, point) {
    if (s.def.kind === 'kick') return s.phase === 'hold' ? 1 : M.lerp(0.55, 1, M.sat((s.pt - 0.35) / 0.5));
    const B = att.body.B, d = att.body.dims;
    const sh = B['ua' + s.limb].getWorldPosition(new V3());
    const r = sh.distanceTo(point) / (d.upper + d.fore + 0.03 * att.h);
    return r < 0.45 ? 0.45 : r < 0.8 ? M.lerp(0.45, 1, (r - 0.45) / 0.35) : 1;
  }

  _resolve(att, def, s, zone, point, via) {
    const game = this.game;
    s.contact = true;
    // Freeze the limb (root-local) where it met the target, on its surface.
    s.contactLocal = s.handPath.clone();
    const guardHit = via === 'guard' || (def.block !== 'none' && def.canDefend() && def.touchesGuard(point, 0.03 * att.h));
    this._settleContact(att, def, s, guardHit ? 'guard' : zone);

    // direction of the blow (attacker -> defender, with limb motion)
    const dir = new V3();
    if (s.def.kind === 'punch') dir.subVectors(att.gloveW[s.limb], att.prevGloveW[s.limb]);
    if (dir.lengthSq() < 1e-8) dir.subVectors(def.pos, att.pos);
    dir.normalize();
    if (s.def.path === 'hook' || s.def.kind === 'kick') {
      // hooks and round kicks arrive from the side
      const side = new V3(Math.cos(att.yaw), 0, -Math.sin(att.yaw)).multiplyScalar(s.limb === 'L' ? -1 : 1);
      const fwd = new V3(Math.sin(att.yaw), 0, Math.cos(att.yaw));
      dir.copy(side.multiplyScalar(0.8).add(fwd.multiplyScalar(0.55))).normalize();
    }
    if (s.def.path === 'upper') dir.y = Math.max(dir.y, 0.7);
    dir.normalize();

    // --- base power ---
    const lead = s.lead;
    const def0 = s.def;
    const skill = def0.kind === 'kick' ? att.kickMul : att.handMul;
    let power = def0.dmg * (lead ? def0.leadMul : 1) * att.pow * skill * att.staminaPower * this._extensionFactor(att, s, point);
    if (def0.kind === 'kick') power *= 0.65 + 0.35 * att.legs / 100;
    power *= M.rand(0.9, 1.1) * (s.spamMul || 1) * (att.npc ? att.npc.damage : 1) * (att.isPlayer ? 1.06 : 1);
    let counter = false;
    if (def.strike && (def.strike.phase === 'wind' || def.strike.phase === 'ext')) { power *= 1.35; counter = true; }
    if (att.slipCounter > 0) { power *= 1.25; counter = true; att.slipCounter = 0; }
    if (def.state === 'getup') power *= 1.1;
    if (def.state === 'down') power *= 0.75;   // a kick at a downed man: he covers up
    if (att.flow > 0) power *= 1.2 * 1.15;   // +20% damage, +15% strike power
    if (att.technique === 'mcgregor') { if (def0.path === 'straight' && !lead) power *= 1.15; else power *= 1.03; if (counter) power *= 1.06; }   // the straight left
    if (att.technique === 'topuria') { power *= 1.1; if (def0.path === 'straight') power *= 1.1; if (counter) power *= 1.1; }   // heavy hands, straight and short
    if (counter && att.mcgMod) power *= 1.3;   // the mod: a counter is 1.3x harder
    if (s.burst && s.limb === 'L') power *= 1.3;   // the camp burst: the left hand +30%
    if (s.fast) power *= 1.08;
    if (s.commit) { power *= 2.1; if (att.isPlayer) this.game.ui.hitMarker('ВЛОЖИЛСЯ!', 0); }
    // a heavy blow (hook, uppercut, head kick or a committed strike): the Heavy Strike stat adds up to +50% (+60% after the Topuria camp)
    const isHeavy = def0.path === 'hook' || def0.path === 'upper' || (def0.kind === 'kick' && def0.zone === 'head') || !!s.commit;
    if (isHeavy && att.heavy) power *= 1 + att.heavy;
    // the combo: heavy blow + committed + in the flow = he is thrown back and staggers
    const comboHit = isHeavy && !!s.commit && att.flow > 0;
    if (comboHit) power *= 1.5;
    if (s.qte) { power *= 1.8; counter = true; }   // the counter you lit up with the button
    if (att.angry) power *= 1.2;   // the angry form: 20% heavier
    const facing = new V3(Math.sin(def.yaw), 0, Math.cos(def.yaw)).dot(new V3().subVectors(att.pos, def.pos).setY(0).normalize()) > 0.25;

    // --- defence ---
    let pen = 1, blocked = false, parry = false;
    if (via === 'guard') {
      // not an active block: the arms soak part of it and get knocked around
      blocked = true;
      pen = def0.kind === 'kick' ? (zone === 'head' ? 0.6 : 0.5) : 0.45;
      pen *= 1 - def.defense * 0.15;
    } else if (def.canDefend() && facing) {
      if (zone === 'head' && def.block === 'high') {
        blocked = true;
        pen = def0.path === 'hook' ? 0.32 : def0.kind === 'kick' ? 0.42 : def0.path === 'upper' ? 0.28 : 0.08;
      } else if (zone === 'body' && def.block === 'body') {
        blocked = true; pen = def0.kind === 'kick' ? 0.3 : 0.1;
      } else if (zone === 'body' && def.block === 'high' && def0.kind === 'kick') {
        blocked = true; pen = 0.55;
      } else if (zone === 'legs' && def.block === 'body' && def0.kind === 'kick') {
        // body guard lifts the lead knee: checks the low kick
        this._checked(att, def, s, power, point, dir);
        return;
      }
      if (blocked) {
        pen *= 1 - def.defense * 0.35;
        if (def.rocked) pen = Math.min(1, pen * 1.8);
        if (def.blockTime < 0.14 && def0.kind === 'punch' && pen < 0.4 && via !== 'guard') { parry = true; pen = 0; }
      }
    }

    if (blocked) {
      const eff = power * pen;
      def.stamina = Math.max(0, def.stamina - (parry ? 0 : 1.5 + power * 0.32));
      def.react(dir, power * 0.8, zone, true);
      if (eff > 0.5) this._applyDamage(att, def, s, zone, eff, dir, point, counter, true);
      def.stats.blocked++;
      if (parry) {
        def.stats.parries++;
        att.stagger = 0.4;
        att.cancelStrike();
        game.onParry(def, att, point);
      } else {
        game.onBlocked(att, def, s, point, power);
      }
      if (comboHit) game.onComboHit(att, def, point, power, true); else if (att.angry) game.onAngryHit(att, def, point, power, true);
      return;
    }
    this._applyDamage(att, def, s, zone, power, dir, point, counter, false);
    if (comboHit) game.onComboHit(att, def, point, power, false); else if (att.angry) game.onAngryHit(att, def, point, power, false);
  }

  _checked(att, def, s, power, point, dir) {
    att.legs = Math.max(0, att.legs - power * 0.9 / UFC.HP_MUL / UFC.TOUGH);
    def.legs = Math.max(0, def.legs - power * 0.12 / UFC.HP_MUL / UFC.TOUGH);
    att.stagger = 0.3;
    att.react(dir.clone().negate(), power * 0.6, 'legs', false);
    def.stats.blocked++;
    game_onChecked(this.game, att, def, point, power);
  }

  _applyDamage(att, def, s, zone, power, dir, point, counter, viaBlock) {
    const game = this.game;
    const P0 = power;   // the force of the blow before any toughness: toughness cannot absorb all of it
    const pk = def.isPlayer ? 1.3 : 1;
    const hm = Math.max(1, (def.hpMul || 1) / 1.5);   // a body with ten times the health needs a much harder blow
    const lethal = !viaBlock && P0 >= 110 * Math.pow(hm, 0.4) * pk, crush = !viaBlock && P0 >= 38 * Math.pow(hm, 0.3) * pk;
    const fi = game.fightInfo, tk = fi && fi.title ? (fi.interim ? 0.82 : 0.66) : 1;   // a real title fight: five hard rounds, nobody goes down easily
    power *= tk;
    power /= def.hpFactor || 1;
    const st = att.stats;
    if (!viaBlock) {
      st.landed++; att.roundStats.landed++;
      if (s.sig) { st.sigLanded++; att.roundStats.sig++; }
      if (zone === 'head') st.head++; else if (zone === 'body') st.bodyL++; else st.legsL++;
    }
    st.dmg += power; att.roundStats.dmg += power;
    def.sinceHit = 0;
    let knock = null;
    if (!viaBlock && def.hitZ) { const hk = s.type || (s.def && s.def.type) || 'straight', hz = def.hitZ[zone === 'body' ? 'body' : zone]; if (hz) hz[hk] = (hz[hk] || 0) + power; }

    if (zone === 'head') {
      def.hurtZone('head', power * 0.18);
      const chinMul = def.chinF;
      const wear = 1 + (1 - def.head / 100) * 1.3;
      let stunAdd = power * UFC.TUNE.stun * chinMul * wear * (counter ? 1.15 : 1);
      if (def.rocked) stunAdd *= 1.2;
      if (viaBlock) stunAdd *= 0.9;
      def.stun += stunAdd;
      if (!viaBlock) {
        def.react(dir, power, 'head', false);
        def.hitstun = Math.max(def.hitstun, 0.05 + power * 0.0065);
        if (def.strike && power > 5) def.cancelStrike();
      }
      def.lastStunAdd = stunAdd;
      if (def.head <= 0 && !viaBlock) { knock = 'head'; def._ko = true; }
      if (!viaBlock) {
        // How hard the head is whipped: the blow (type, power, where on the jaw), whether he saw it coming and tensed his neck,
        // a tired neck, brain already rattled by earlier hits and the chin he was born with. No dice.
        const kf = s.def.kind === 'kick' ? 1.4 : s.def.path === 'hook' ? 1.25 : s.def.path === 'upper' ? 1.3 : (s.lead ? 0.72 : 0.95);
        const hc = def.headCenter(new V3());
        const jaw = M.clamp(1 + (hc.y - point.y) / (0.05 * def.h) * 0.5 + (s.def.path === 'upper' ? 0.12 : 0), 0.65, 1.4);
        const brace = def.block !== 'none' && def.canDefend() ? 0.85 : M.sat((def.bracedT || 0) / 0.35) * 0.7;
        let raw = power * kf * jaw * (1 - 0.55 * brace) * (1 + (1 - M.sat(def.stamina / 100)) * 0.35) * (1 + M.sat((def.brain || 0) / 120) * 0.8) * def.chinF * (def.npc ? 1.22 : def.isPlayer ? (def.technique === 'topuria' ? 0.82 : 0.95) : 1.1);   // his jaw is softer, yours is tougher (and Topuria's is trained)   // the NPC's chin is not made of stone, and the player is not made of glass
        if (game.opts && game.opts.rounds < 99) raw *= [0.6, 0.78, 0.98, 1.2, 1.4][Math.min(4, (game.round || 1) - 1)];   // round 1 is for feeling each other out, the later rounds are for finishing
        // A fresh, rested fighter's head takes it; the same blow lands very differently once the gauge is full or he is gassed.
        const gauge = M.sat((def.headDmg || 0) / 70), tiredN = 1 - M.sat(def.stamina / 100);
        let accel = raw * (0.72 + 1.0 * gauge + 0.5 * tiredN);
        const dmgd = def.headDmg || 0, spent = def.stamina < 12 && dmgd >= 25;   // truly empty AND already rattled
        def.headHits = (def.headHits || 0) + 1;
        if (!spent && (dmgd < (tk < 1 ? 64 : 56) || def.headHits < (tk < 0.7 ? 20 : tk < 1 ? 16 : 12))) accel = Math.min(accel, HIT.KO - 0.5);   // no knockout from a rested fighter with a fresh head
        if (!spent && (dmgd < 28 || def.headHits < 5)) accel = Math.min(accel, HIT.KD - 0.5);   // and no knockdown before the head has taken some
        if (crush) accel = Math.max(accel, lethal || (def.headDmg || 0) > 70 ? HIT.KO + 1 : HIT.KD + 1);   // a crushing blow goes through any chin
        const rawD = Math.max(raw, Math.max(0, P0 - 14) * 0.22);   // and a heavy one always leaves its mark on the head
        if (rawD >= 4) { def.headDmg = Math.min(100, (def.headDmg || 0) + rawD * 0.75); def.headCap = Math.max(15, def.headCap - Math.max(0, rawD - 6) * 0.6); def.headShowT = 5; def.headSince = 0; }
        def.brain = (def.brain || 0) + Math.max(0, rawD - 8) * 0.6;
        def.dizzy = Math.min(1, (def.dizzy || 0) + Math.max(0, accel - HIT.ROCK - 1) * 0.02);   // only a real shake-up makes his head ring
        def.lastAccel = accel; def.lastBrace = brace;
        if (accel >= HIT.ROCK + 2) def.stun += (accel - HIT.ROCK - 2) * 4 + 10;
        if (accel >= HIT.KO) { knock = 'head'; def._ko = true; }
        else if (accel >= HIT.KD) knock = 'head';
        def.lastStunAdd = Math.max(stunAdd, accel * 3);
      } else if (def.headDmg != null) {
        def.headDmg = Math.min(100, def.headDmg + power * 0.15); def.headShowT = 5; def.headSince = 0;   // even blocked shots leave a mark
      }
      if (!viaBlock && !knock && power > (def.head < 50 ? 8 : 11.5) && def.stumbleT <= 0) def.stumble(dir, power);
      // Flow: seriously shaking the opponent puts the attacker in the zone.
      if (!viaBlock && !def._wasRocked && def.stun > 55) this._flow(att);
      def._wasRocked = def.stun > 55;
    } else if (zone === 'body') {
      def.hurtZone('bodyHp', power * 0.62);
      // Liver: the defender's right side (his local -X)
      const local = def.body.root.worldToLocal(point.clone());
      const liverHit = local.x < 0.03 * def.h;
      if (liverHit) {
        def.hurtZone('liver', power * (s.def && s.def.kind === 'kick' ? 1.3 : 1.0) * 1.6);   // the liver shot bites
        att.stats.liver = (att.stats.liver || 0) + 1;
        const ll = power * (s.def && s.def.kind === 'kick' ? 1.3 : 1) * 0.55 * (1 - 0.5 * (def.block === 'body' ? 0.85 : M.sat((def.bracedT || 0) / 0.35) * 0.7)) + (100 - def.liver) * 0.12 + (1 - M.sat(def.stamina / 100)) * 4;
        if (def.hitZ && !viaBlock) { const hk = s.type || (s.def && s.def.type) || 'body'; def.hitZ.liver[hk] = (def.hitZ.liver[hk] || 0) + power; }
        if (!viaBlock && ll >= 10.5 && !def.liverDrop) {
          def.liverDrop = 0.3;   // the famous delayed collapse: a clean shot on an unprepared liver
        } else if (!viaBlock && ll > 6) {
          def.stun += power * 1.2;
          def.hitstun = Math.max(def.hitstun, 0.32);
        }
        if (!viaBlock) { def.react(dir, power * 0.9, 'body', false); def.stamina = Math.max(0, def.stamina - power * 1.6); }
        game.onLiverHit(att, def, power);
      }
      def.stamina = Math.max(0, def.stamina - power * 1.05);
      if (def.hasGly) def.acid += power * 0.7;
      def.staminaCap = Math.max(45, def.staminaCap - power * 0.22);
      def.stun += power * 0.5;
      if (!viaBlock) {
        def.react(dir, power, 'body', false);
        def.hitstun = Math.max(def.hitstun, 0.05 + power * 0.008);
        if (def.strike && power > 6) def.cancelStrike();
        if (power * (1 - 0.4 * (def.block === 'body' ? 0.85 : M.sat((def.bracedT || 0) / 0.35) * 0.7)) > 5.5 + def.bodyHp * 0.14 || def.bodyHp <= 0) knock = 'body';   // the weaker the ribs, the less it takes
      }
    } else {
      def.hurtZone('legs', power * 0.5);
      // usually the lead leg eats the low kick; that leg starts to fail
      if (!viaBlock && def.legDmg) {
        const leg = def.legDmg[def.leadSide] < 0.85 ? def.leadSide : def.rearSide;   // the lead leg takes the kicks until it fails
        def.legDmg[leg] = Math.min(1, def.legDmg[leg] + power * 0.016 / UFC.TOUGH);
        // enough kicks on the same leg and the bone goes
        if (def.legDmg[leg] >= 1 && def.legs < 50 && power > 6 && !def._legBreak) def._legBreak = leg;
      }
      if (!viaBlock) {
        def.react(dir, power, 'legs', false);
        def.hitstun = Math.max(def.hitstun, 0.06 + power * 0.008);
        const kickedOut = def.strike && def.strike.def.kind === 'kick' && power > 6;   // standing on one leg: swept
        if (kickedOut || def.legs <= 0 || (def.legs < 40 && power > 7 + def.legs * 0.2)) knock = 'legs';
        if (def.strike && power > 6) def.cancelStrike();
      }
    }

    if (!viaBlock) {
      const nowF = game.simTime || 0, f0 = Math.max(0, P0 - 14) / Math.sqrt(hm);   // a big body takes the toll more slowly
      def.takenLog = (def.takenLog || []).filter((e) => nowF - e.t < 8); def.takenLog.push({ t: nowF, p: P0 });   // for the referee: how much he has absorbed lately
      def.peakForce = Math.max(def.peakForce || 0, P0);
      if (f0 > 0 && def.taken) {   // the real toll of a heavy blow, for the medical and the face: it does not care how tough he is
        if (zone === 'head') { def.brain = (def.brain || 0) + f0 * 0.3; def.faceHp = Math.max(0, (def.faceHp == null ? 100 : def.faceHp) - f0 * 0.1); }
        else if (zone === 'body') { def.taken.bodyHp += f0 * 0.5; def.taken.liver += f0 * 0.25; def.hurtZone('bodyHp', f0 * 0.12); }
        else { def.taken.legs += f0 * 0.6; def.hurtZone('legs', f0 * 0.12); }
      }
      if (lethal && zone === 'body') { def.bodyHp = 0; knock = 'body'; }
      else if (lethal && zone === 'legs') { def.legs = 0; knock = 'legs'; }
      else if (crush && !knock) knock = zone === 'head' ? 'head' : zone === 'body' ? 'body' : 'legs';
      game._lastP0 = P0 / Math.sqrt(hm);
      const now = game.simTime || 0;
      att.comboLanded = now - att.lastLandT < 1.0 ? att.comboLanded + 1 : 1;
      att.lastLandT = now;
    }
    game.onHit(att, def, s, zone, power, point, dir, counter, viaBlock);

    if (knock && def.state !== 'down' && def.state !== 'ko') {
      this._flow(att);
      st.kd++; att.roundStats.kd++;
      { const nowT = game.simTime || 0; def.kdTimes = (def.kdTimes || []).filter((x) => nowT - x < 60); def.kdTimes.push(nowT); }
      // a knockdown can turn into a knockout: the harder the shot, the more hurt he already is, the likelier
      let ko = false, method = 'KO';
      if (game._earlyRound()) { def._ko = false; if (def.head < 3) def.head = 3; if (def.bodyHp < 3) def.bodyHp = 3; if (def.legs < 3) def.legs = 3; if (def.liver < 3) def.liver = 3; }   // a knockdown, not a knockout, this early
      if (knock === 'head') { ko = !!def._ko; def._ko = false; }
      else if (knock === 'body') { ko = def.bodyHp <= 0 || def.liver <= 0; method = ko ? 'KO' : 'TKO'; }
      else { ko = def.legs <= 0; method = ko ? 'KO' : 'TKO'; }
      // tell the fall system what kind of blow it was, so the reaction fits
      def._fallHint = { type: s.type || (s.def && s.def.type) || '', power, zone: knock, counter: !!counter };
      if (ko) def.knockOut(dir, power); else def.knockDown(dir, power, knock);
      game.onKnockdown(att, def, knock, ko, method, s);
      if (!ko && def.isPlayer && def.kdTimes && def.kdTimes.length >= 3) game._refCall(def, att, 'Три нокдауна за минуту');
      else if (!ko && !def.isPlayer && def.knockdowns >= 10) game._refCall(def, att, 'Десять нокдаунов');
    }
  }

  _flow(f) {
    // Flow is not handed out automatically any more: the player triggers it.
    void f;
  }

  // no referee: nothing stops the fight early
  checkStoppage() { return null; }
}

function game_onChecked(game, att, def, point, power) { game.onChecked(att, def, point, power); }

UFC.Combat = Combat;
})();

