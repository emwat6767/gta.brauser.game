// Простая шина событий. Модули сообщают о происходящем, не зная, кто слушает.
// Пример: будущая система розыска подпишется на 'npc:knockdown'.
//
// События, которые уже отправляются:
//   'vehicle:enter'     { vehicle, who }
//   'vehicle:exit'      { vehicle, who }
//   'vehicle:crash'     { vehicle, impulse, other? }   — удар о стену/машину
//   'npc:pushed'        { npc, by }                     — NPC толкнули, он устоял
//   'npc:knockdown'     { npc, by, cause }              — NPC сбит с ног ('player' | 'vehicle')

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
