// src/game/core.js

// -----------------------------------------------------
// Config (mirrors your Python constants)
// -----------------------------------------------------

const SCREEN_WIDTH = 1000;
const SCREEN_HEIGHT = 600;
const FENCE_X = SCREEN_WIDTH / 2;
const ARENA_PADDING = 40;
const PLAYER_MAX_HP = 100;
const PLAYER_SPEED = 250;

const WAVE_TIME = 30.0;
const SHOP_TIME = 20.0;

const UPGRADE_COST = 15;
const EXTRA_MONSTERS_COST = 10;
const EXTRA_MONSTERS_AMOUNT = 4;

const MONSTER_TYPES = {
  slime: { hp: 20, speed: 80, gold: [2, 4] },
  tank: { hp: 40, speed: 60, gold: [4, 7] },
  fast: { hp: 15, speed: 120, gold: [1, 3] },
  spitter: { hp: 18, speed: 70, gold: [3, 5] } // no projectiles yet, but stats kept
};

const WEAPON_CONFIG = {
  knife: { damage: 10, cooldown: 0.35, bulletSpeed: 520 },
  axe: { damage: 18, cooldown: 0.65, bulletSpeed: 460 },
  spear: { damage: 14, cooldown: 0.45, bulletSpeed: 580 },
  bow: { damage: 8, cooldown: 0.55, bulletSpeed: 780 } // long range, low dmg
};

const HEART_DROP_CHANCE = 0.05;
const HEART_HEAL_AMOUNT = 20;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// -----------------------------------------------------
// Entities
// -----------------------------------------------------

class Player {
  constructor(id, side) {
    this.id = id;
    this.side = side;
    this.x = side === "left" ? SCREEN_WIDTH / 4 : (3 * SCREEN_WIDTH) / 4;
    this.y = SCREEN_HEIGHT / 2;

    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.gold = 0;
    this.score = 0;
    this.monstersKilled = 0;

    this.weaponType = "knife";
    this.weaponLevel = 1;
    this.weaponTimer = 0;
    this.hasChosenWeapon = false;

    const cfg = WEAPON_CONFIG[this.weaponType];
    this.weaponDamage = cfg.damage;
    this.weaponCooldown = cfg.cooldown;
    this.bulletSpeed = cfg.bulletSpeed;

    this.aimDx = side === "left" ? 1 : -1;
    this.aimDy = 0;
  }

  get alive() {
    return this.hp > 0;
  }

  setWeapon(type) {
    if (!WEAPON_CONFIG[type]) return;
    this.weaponType = type;
    this.weaponLevel = 1;
    const cfg = WEAPON_CONFIG[type];
    this.weaponDamage = cfg.damage;
    this.weaponCooldown = cfg.cooldown;
    this.bulletSpeed = cfg.bulletSpeed;
    this.weaponTimer = 0;
    this.hasChosenWeapon = true;
  }

  upgradeWeapon() {
    const cfg = WEAPON_CONFIG[this.weaponType];
    this.weaponLevel += 1;
    this.weaponDamage = Math.round(
      cfg.damage * (1 + 0.4 * (this.weaponLevel - 1))
    );
    this.weaponCooldown = Math.max(
      0.15,
      cfg.cooldown * Math.pow(0.9, this.weaponLevel - 1)
    );
    this.bulletSpeed = cfg.bulletSpeed * (1 + 0.05 * (this.weaponLevel - 1));
  }

  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}

class Monster {
  constructor(id, side, type, round) {
    this.id = id;
    this.side = side;
    this.type = type;

    const cfg = MONSTER_TYPES[type];
    this.hp = cfg.hp + (round - 1) * 2;
    this.speed = cfg.speed;
    this.goldRange = cfg.gold;

    this.x =
      side === "left"
        ? Math.random() * (FENCE_X - ARENA_PADDING) + ARENA_PADDING
        : Math.random() * (SCREEN_WIDTH - (FENCE_X + ARENA_PADDING)) +
          (FENCE_X + ARENA_PADDING);
    this.y =
      Math.random() * (SCREEN_HEIGHT - 2 * ARENA_PADDING) + ARENA_PADDING;
  }

  get dead() {
    return this.hp <= 0;
  }

  goldDrop() {
    const [lo, hi] = this.goldRange;
    return randInt(lo, hi);
  }
}

class Bullet {
  constructor(id, side, x, y, dx, dy, dmg, speed, weaponType) {
    this.id = id;
    this.side = side;
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.damage = dmg;
    this.speed = speed;
    this.weaponType = weaponType;
    this.lifetime = 1.7;

    const pierceMap = { knife: 0, axe: 2, spear: 999, bow: 1 };
    this.pierce = pierceMap[weaponType] ?? 0;
  }
}

// Simple pickups (for future visual use if needed)
class GoldDrop {
  constructor(id, x, y, amount) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.amount = amount;
  }
}

class HealthPickup {
  constructor(id, x, y, healAmount) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.healAmount = healAmount;
  }
}

// -----------------------------------------------------
// GameCore – authoritative game state (server-side)
// -----------------------------------------------------

class GameCore {
  constructor() {
    this.players = [new Player(1, "left"), new Player(2, "right")];
    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];

    this.nextMonsterId = 1;
    this.nextBulletId = 1;
    this.nextGoldId = 1;
    this.nextHeartId = 1;

    this.state = "WEAPON_SELECT"; // WEAPON_SELECT / PLAYING / SHOP / GAME_OVER
    this.round = 1;
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;

    // spawn control
    this.spawnInterval = 1.8;
    this.baseTarget = 6;
    this.baseSpawnedLeft = 0;
    this.baseSpawnedRight = 0;
    this.spawnCdLeft = 0;
    this.spawnCdRight = 0;

    // extra monsters from shop
    this.extraQueueLeft = 0;
    this.extraQueueRight = 0;
    this.extraActiveLeft = 0;
    this.extraActiveRight = 0;
    this.extraSpawnedLeft = 0;
    this.extraSpawnedRight = 0;

    this.leftReady = false;
    this.rightReady = false;
  }

  resetMatch() {
    // reset everything back to weapon select
    const fresh = new GameCore();
    Object.assign(this, fresh);
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id) || null;
  }

  // -------------------------------------------------
  // Server-driven actions (from websocket messages)
  // -------------------------------------------------

  handleWeaponChoice(playerId, weaponType) {
    if (this.state !== "WEAPON_SELECT") return;
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.setWeapon(weaponType);
  }

  handleShopAction(playerId, action) {
    if (this.state !== "SHOP") return;
    const p = this.getPlayer(playerId);
    if (!p) return;

    const isLeft = p.side === "left";

    if (action === "upgrade") {
      if (p.gold >= UPGRADE_COST) {
        p.gold -= UPGRADE_COST;
        p.upgradeWeapon();
      }
    } else if (action === "send_mobs") {
      if (p.gold >= EXTRA_MONSTERS_COST) {
        p.gold -= EXTRA_MONSTERS_COST;
        if (isLeft) {
          this.extraQueueRight += EXTRA_MONSTERS_AMOUNT;
        } else {
          this.extraQueueLeft += EXTRA_MONSTERS_AMOUNT;
        }
      }
    }
  }

  handleReady(playerId) {
    if (this.state !== "SHOP") return;
    const p = this.getPlayer(playerId);
    if (!p) return;
    if (p.side === "left") this.leftReady = true;
    else this.rightReady = true;
  }

  handleRestart() {
    if (this.state !== "GAME_OVER") return;
    this.resetMatch();
  }

  // -------------------------------------------------
  // Spawning / utility
  // -------------------------------------------------

  spawnMonsterOnSide(side) {
    const r = Math.random();
    let type = "slime";
    if (r < 0.6) type = "slime";
    else if (r < 0.8) type = "fast";
    else if (r < 0.95) type = "tank";
    else type = "spitter";

    const m = new Monster(this.nextMonsterId++, side, type, this.round);
    this.monsters.push(m);
  }

  nearestMonster(side, x, y) {
    let best = null;
    let bestD2 = Infinity;
    for (const m of this.monsters) {
      if (m.side !== side) continue;
      const dx = m.x - x;
      const dy = m.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = m;
      }
    }
    return best;
  }

  startWave() {
    this.state = "PLAYING";
    this.waveLeft = WAVE_TIME;

    if (this.round === 1) {
      this.spawnInterval = 1.8 / 3.0;
      this.baseTarget = 6 * 3;
    } else {
      this.spawnInterval = Math.max(0.8, 1.8 - 0.15 * (this.round - 1));
      this.baseTarget = 6 + 3 * (this.round - 1);
    }

    this.spawnCdLeft = 1.0;
    this.spawnCdRight = 1.0;
    this.baseSpawnedLeft = 0;
    this.baseSpawnedRight = 0;

    this.leftReady = false;
    this.rightReady = false;

    // activate queued extra mobs for this wave
    this.extraActiveLeft = this.extraQueueLeft;
    this.extraActiveRight = this.extraQueueRight;
    this.extraSpawnedLeft = 0;
    this.extraSpawnedRight = 0;
    this.extraQueueLeft = 0;
    this.extraQueueRight = 0;

    // clear old entities (except players)
    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
  }

  startShop() {
    this.state = "SHOP";
    this.shopLeft = SHOP_TIME;

    // clear active entities
    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
  }

  startGameOver() {
    this.state = "GAME_OVER";
    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
  }

  // -------------------------------------------------
  // Main step
  // dt: seconds, inputs: {1:{up,down,left,right}, 2:{...}}
  // -------------------------------------------------

  step(dt, inputs) {
    switch (this.state) {
      case "WEAPON_SELECT":
        this.updateWeaponSelect(dt);
        break;
      case "PLAYING":
        this.updatePlaying(dt, inputs);
        break;
      case "SHOP":
        this.updateShop(dt);
        break;
      case "GAME_OVER":
        // nothing to simulate
        break;
    }
  }

  updateWeaponSelect(_dt) {
    // auto-start when both players picked a weapon
    const allChosen = this.players.every(p => p.hasChosenWeapon);
    if (allChosen) {
      this.startWave();
    }
  }

  updatePlaying(dt, inputs) {
    // move players
    for (const p of this.players) {
      const inp = inputs[p.id] || {};
      let dx = 0;
      let dy = 0;
      if (inp.up) dy -= 1;
      if (inp.down) dy += 1;
      if (inp.left) dx -= 1;
      if (inp.right) dx += 1;

      if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
      }

      p.x += dx * PLAYER_SPEED * dt;
      p.y += dy * PLAYER_SPEED * dt;

      if (p.side === "left") {
        p.x = clamp(p.x, ARENA_PADDING, FENCE_X - ARENA_PADDING);
      } else {
        p.x = clamp(p.x, FENCE_X + ARENA_PADDING, SCREEN_WIDTH - ARENA_PADDING);
      }
      p.y = clamp(p.y, ARENA_PADDING, SCREEN_HEIGHT - ARENA_PADDING);

      p.weaponTimer = Math.max(0, p.weaponTimer - dt);
    }

    // spawn baseline monsters
    this.spawnCdLeft -= dt;
    this.spawnCdRight -= dt;
    if (this.spawnCdLeft <= 0 && this.baseSpawnedLeft < this.baseTarget) {
      this.spawnMonsterOnSide("left");
      this.spawnCdLeft = this.spawnInterval;
      this.baseSpawnedLeft += 1;
    }
    if (this.spawnCdRight <= 0 && this.baseSpawnedRight < this.baseTarget) {
      this.spawnMonsterOnSide("right");
      this.spawnCdRight = this.spawnInterval;
      this.baseSpawnedRight += 1;
    }

    // extra monsters distributed over wave duration
    const elapsedFrac = (WAVE_TIME - this.waveLeft) / WAVE_TIME;
    const targetExtraLeft = Math.floor(this.extraActiveLeft * elapsedFrac);
    while (this.extraSpawnedLeft < targetExtraLeft) {
      this.spawnMonsterOnSide("left");
      this.extraSpawnedLeft += 1;
    }
    const targetExtraRight = Math.floor(this.extraActiveRight * elapsedFrac);
    while (this.extraSpawnedRight < targetExtraRight) {
      this.spawnMonsterOnSide("right");
      this.extraSpawnedRight += 1;
    }

    // monsters move toward their player
    for (const m of this.monsters) {
      const p = m.side === "left" ? this.players[0] : this.players[1];
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const dist = Math.hypot(dx, dy) || 1;
      m.x += (dx / dist) * m.speed * dt;
      m.y += (dy / dist) * m.speed * dt;
    }

    // players auto-fire at nearest monster
    for (const p of this.players) {
      const target = this.nearestMonster(p.side, p.x, p.y);
      if (target && p.weaponTimer <= 0) {
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ndx = dx / dist;
        const ndy = dy / dist;
        p.aimDx = ndx;
        p.aimDy = ndy;

        const b = new Bullet(
          this.nextBulletId++,
          p.side,
          p.x + ndx * 24,
          p.y + ndy * 24,
          ndx,
          ndy,
          p.weaponDamage,
          p.bulletSpeed,
          p.weaponType
        );
        this.bullets.push(b);
        p.weaponTimer = p.weaponCooldown;
      }
    }

    // move bullets
    for (const b of this.bullets) {
      b.lifetime -= dt;
      b.x += b.dx * b.speed * dt;
      b.y += b.dy * b.speed * dt;

      if (b.side === "left" && b.x > FENCE_X) b.lifetime = 0;
      if (b.side === "right" && b.x < FENCE_X) b.lifetime = 0;

      if (
        b.x < -20 ||
        b.x > SCREEN_WIDTH + 20 ||
        b.y < -20 ||
        b.y > SCREEN_HEIGHT + 20
      ) {
        b.lifetime = 0;
      }
    }
    this.bullets = this.bullets.filter(b => b.lifetime > 0);

    // bullet–monster collisions
    const hitRadius = 18;
    for (const b of this.bullets) {
      for (const m of this.monsters) {
        if (m.side !== b.side || m.dead) continue;
        const dist = Math.hypot(m.x - b.x, m.y - b.y);
        if (dist < hitRadius && b.pierce >= 0) {
          m.hp -= b.damage;
          b.pierce -= 1;
          if (b.pierce < 0) b.lifetime = 0;
        }
      }
    }

    // monster deaths: award gold/score, count kills, random heart heal
    const survivors = [];
    for (const m of this.monsters) {
      if (m.dead) {
        const p = m.side === "left" ? this.players[0] : this.players[1];
        const amt = m.goldDrop();
        p.gold += amt;
        p.score += amt * 5;
        p.monstersKilled += 1;

        if (Math.random() < HEART_DROP_CHANCE) {
          p.heal(HEART_HEAL_AMOUNT);
        }
      } else {
        survivors.push(m);
      }
    }
    this.monsters = survivors;
    this.bullets = this.bullets.filter(b => b.lifetime > 0);

    // monster contact damage (simple, per tick)
    for (const m of this.monsters) {
      const p = m.side === "left" ? this.players[0] : this.players[1];
      const dist = Math.hypot(m.x - p.x, m.y - p.y);
      if (dist < 20) {
        p.takeDamage(5);
      }
    }

    // wave timer / end conditions
    this.waveLeft -= dt;

    // if someone dies → GAME_OVER
    if (!this.players[0].alive || !this.players[1].alive) {
      this.startGameOver();
      return;
    }

    // if time is up and both alive → SHOP
    if (this.waveLeft <= 0) {
      this.round += 1;
      this.startShop();
    }
  }

  updateShop(dt) {
    this.shopLeft -= dt;
    if (this.shopLeft <= 0 || (this.leftReady && this.rightReady)) {
      this.startWave();
    }
  }

  // -------------------------------------------------
  // State export for clients
  // -------------------------------------------------

  exportState() {
    return {
      state: this.state,
      round: this.round,
      waveLeft: this.waveLeft,
      shopLeft: this.shopLeft,
      extraQueueLeft: this.extraQueueLeft,
      extraQueueRight: this.extraQueueRight,
      extraActiveLeft: this.extraActiveLeft,
      extraActiveRight: this.extraActiveRight,
      leftReady: this.leftReady,
      rightReady: this.rightReady,
      players: this.players.map(p => ({
        id: p.id,
        side: p.side,
        x: p.x,
        y: p.y,
        hp: p.hp,
        maxHp: p.maxHp,
        gold: p.gold,
        score: p.score,
        monstersKilled: p.monstersKilled,
        weaponType: p.weaponType,
        weaponLevel: p.weaponLevel,
        hasChosenWeapon: p.hasChosenWeapon
      })),
      monsters: this.monsters.map(m => ({
        id: m.id,
        side: m.side,
        type: m.type,
        x: m.x,
        y: m.y,
        hp: m.hp
      })),
      bullets: this.bullets.map(b => ({
        id: b.id,
        side: b.side,
        x: b.x,
        y: b.y,
        weaponType: b.weaponType
      }))
    };
  }
}

module.exports = { GameCore };
