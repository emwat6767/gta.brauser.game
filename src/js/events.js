// Простая шина событий. Модули сообщают о происходящем, не зная, кто слушает.
// Пример: wanted.js подписан на 'character:killed', hud.js — на 'wanted:changed'.
//
// События, которые уже отправляются:
//   'vehicle:enter'       { vehicle, who }
//   'vehicle:exit'        { vehicle, who }
//   'vehicle:crash'       { vehicle, impulse, other? }   — удар о стену/машину
//   'vehicle:carjack'     { vehicle, by, victim }         — угон с водителем
//   'npc:pushed'          { npc, by }                     — NPC толкнули, он устоял
//   'npc:knockdown'       { npc, by, cause }              — NPC сбит с ног ('player' | 'vehicle' | 'punch')
//   'character:damaged'   { target, attacker, amount, kind } — урон игроку или NPC ('punch' | 'vehicle')
//   'character:killed'    { target, attacker, kind }
//   'combat:hit'          { attacker, target, damage }
//   'wanted:changed'      { level, up }
//   'zone:changed'        { gang }                        — игрок зашёл на территорию банды (или ушёл: gang = null)
//   'player:down'         { kind }                        — 'wasted' | 'busted'
//   'player:respawn'      { point }
//   'money:changed'       { delta, total, quiet }
//   'heist:start' / 'heist:success' / 'heist:fail'  { place, reward? } — ограбление банка/магазина
//   'rep:level'           { level }                       — новый уровень репутации банды
//   'turf:war'            { block, gang }                 — началась война за район
//   'turf:attack'         { block, gang }                 — конкуренты напали на захваченный район
//   'turf:changed'        { block, from, to }             — квартал сменил хозяина
//   'game:pause', 'game:resume'

export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }
}
