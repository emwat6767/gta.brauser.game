import { CONFIG } from './config.js';

// Деньги и сохранение прогресса.
//   Wallet.add(сумма)   — заработок (всплывает "+$" у счётчика денег)
//   Wallet.spend(цена)  — покупка; false, если не хватает
// SaveSystem хранит деньги, репутацию банды и захваченные районы в localStorage этого браузера.

export class Wallet {
  constructor(game) {
    this.game = game;
    this.money = CONFIG.economy.startMoney;
  }

  add(amount, { quiet = false } = {}) {
    this.money += amount;
    this.game.events.emit('money:changed', { delta: amount, total: this.money, quiet });
    this.game.save?.markDirty();
    return amount;
  }

  canAfford(price) {
    return this.money >= price;
  }

  spend(price) {
    if (this.money < price) return false;
    this.money -= price;
    this.game.events.emit('money:changed', { delta: -price, total: this.money });
    this.game.save?.markDirty();
    return true;
  }
}

export class SaveSystem {
  constructor(game) {
    this.game = game;
    this.dirty = false;
    this.timer = 0;
    const flush = () => this.save();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  markDirty() {
    this.dirty = true;
  }

  load() {
    let data = null;
    try {
      data = JSON.parse(window.localStorage.getItem(CONFIG.economy.saveKey) || 'null');
    } catch {
      data = null; // хранилище недоступно (приватный режим) — играем без сохранения
    }
    if (!data || (data.v !== 2 && data.v !== 3)) return false;
    if (Number.isFinite(data.money)) this.game.wallet.money = Math.max(0, Math.floor(data.money));
    this.game.progress?.deserialize(data.rep);
    this.game.turf?.deserialize(data.turf);
    return true;
  }

  save() {
    this.dirty = false;
    try {
      const { wallet, progress, turf } = this.game;
      const data = { v: 3, money: wallet.money, rep: progress?.serialize(), turf: turf?.serialize() };
      window.localStorage.setItem(CONFIG.economy.saveKey, JSON.stringify(data));
    } catch {
      /* без сохранения */
    }
  }

  reset() {
    try {
      window.localStorage.removeItem(CONFIG.economy.saveKey);
    } catch {
      /* ничего */
    }
  }

  update(dt) {
    this.timer += dt;
    if (this.dirty && this.timer > 5) {
      this.timer = 0;
      this.save();
    }
  }
}
