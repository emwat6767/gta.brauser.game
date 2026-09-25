import { CONFIG } from './config.js';

// Деньги и сохранение прогресса.
//   Wallet.earn(сумма)  — заработок (умножается на бонус питомцев), всплывает "+$"
//   Wallet.add(сумма)   — без множителя (доход питомцев, возвраты)
//   Wallet.spend(цена)  — покупка; false, если не хватает
// SaveSystem хранит деньги, питомцев и улучшения в localStorage этого браузера.

export class Wallet {
  constructor(game) {
    this.game = game;
    this.money = CONFIG.economy.startMoney;
  }

  earn(amount, opts = {}) {
    const gained = Math.max(1, Math.round(amount * (this.game.pets?.moneyMult ?? 1)));
    return this.add(gained, opts);
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
    if (!data || data.v !== 1) return false;
    if (Number.isFinite(data.money)) this.game.wallet.money = Math.max(0, Math.floor(data.money));
    this.game.pets.deserialize(data.pets);
    return true;
  }

  save() {
    this.dirty = false;
    try {
      const data = { v: 1, money: this.game.wallet.money, pets: this.game.pets.serialize() };
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
