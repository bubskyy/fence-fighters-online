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

const MAX_MONSTERS = 25;
const BASE_MONSTER_HP = 30;
const BASE_MONSTER_SPEED = 110;
const MONSTER_SPEED_SCALE = 1.05;
const MONSTER_HP_SCALE = 1.1;

const BASE_MONSTER_SPAWN_INTERVAL = 1.3;
const MIN_MONSTER_SPAWN_INTERVAL = 0.35;

const GOLD_DROP_CHANCE = 0.5;
const GOLD_PER_KILL = 3;
const HEART_DROP_CHANCE = 0.08;
const HEART_HEAL_AMOUNT = 25;

const EXTRA_QUEUE_MAX = 5;
const EXTRA_MONSTER_BASE_COST = 10;
const EXTRA_MONSTERS_AMOUNT = 4;

const MONSTER_TYPES = {
  slime: { hpMult: 1.0, speedMult: 1.0 },
  fast: { hpMult: 0.7, speedMult: 1.5 },
  tank: { hpMult: 2.0, speedMult: 0.7 }
};

const WEAPONS = {
  pea: { damage: 8, cooldown: 0.55, bulletSpeed: 780 }
};

const HEART_SIZE = 15;
const GOLD_SIZE = 12;

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

let nextId = 1;
function genId() {
  return nextId++;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomRange(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.w < b.x ||
    a.x > b.x + b.w ||
    a.y + a.h < b.y ||
    a.y > b.y + b.h
  );
}

// -----------------------------------------------------
// Core classes
// -----------------------------------------------------

class Player {
  constructor(id, side) {
    this.id = id;
    this.side = side; // "left" or "right"
    this.maxHp = PLAYER_MAX_HP;
    this.hp = PLAYER_MAX_HP;
    this.gold = 0;
    this.score = 0;
    this.monstersKilled = 0;

    this.width = 32;
    this.height = 32;

    this.weaponType = "pea";
    this.weaponLevel = 1;
    this.weaponCooldownTimer = 0;
    this.hasChosenWeapon = false;

    this.resetPosition();
  }

  reset() {
    this.hp = this.maxHp;
    this.gold = 0;
    this.score = 0;
    this.monstersKilled = 0;
    this.weaponType = "pea";
    this.weaponLevel = 1;
    this.weaponCooldownTimer = 0;
    this.hasChosenWeapon = false;
    this.resetPosition();
  }

  resetPosition() {
    const padding = 80;
    if (this.side === "left") {
      this.x = SCREEN_WIDTH * 0.25;
    } else {
      this.x = SCREEN_WIDTH * 0.75;
    }
    this.y = SCREEN_HEIGHT * 0.6;
  }

  get isAlive() {
    return this.hp > 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  canShoot() {
    return this.weaponCooldownTimer <= 0 && this.isAlive;
  }

  updateWeaponCooldown(dt) {
    if (this.weaponCooldownTimer > 0) {
      this.weaponCooldownTimer -= dt;
    }
  }

  setCooldown() {
    const weapon = WEAPONS[this.weaponType];
    if (!weapon) return;
    const levelMult = Math.max(0.4, 1.0 - 0.08 * (this.weaponLevel - 1));
    this.weaponCooldownTimer = weapon.cooldown * levelMult;
  }
}

class Monster {
  constructor(side, type, hp, speed) {
    this.id = genId();
    this.side = side; // "left" or "right"
    this.type = type;

    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;

    this.radius = 16;

    // spawn near the top on the correct side
    const xMin = side === "left" ? ARENA_PADDING : FENCE_X + ARENA_PADDING;
    const xMax =
      side === "left" ? FENCE_X - ARENA_PADDING : SCREEN_WIDTH - ARENA_PADDING;
    this.x = randomRange(xMin, xMax);
    this.y = randomRange(ARENA_PADDING, SCREEN_HEIGHT * 0.4);
  }

  get isAlive() {
    return this.hp > 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }
}

class Bullet {
  constructor(ownerId, side, x, y, vx, vy, damage, weaponType) {
    this.id = genId();
    this.ownerId = ownerId;
    this.side = side; // "left" or "right"
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.weaponType = weaponType;
    this.radius = 4;
  }
}

class GoldDrop {
  constructor(x, y, amount) {
    this.id = genId();
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.radius = GOLD_SIZE;
  }
}

class HeartPickup {
  constructor(x, y, healAmount) {
    this.id = genId();
    this.x = x;
    this.y = y;
    this.healAmount = healAmount;
    this.radius = HEART_SIZE;
  }
}

class SpawnWarning {
  constructor(side, type, x, y, delay) {
    this.id = genId();
    this.side = side;
    this.type = type;
    this.x = x;
    this.y = y;
    this.timer = delay; // how long until the monster actually appears
  }
}

// -----------------------------------------------------
// GameCore
// -----------------------------------------------------

class GameCore {
  constructor() {
    this.players = [
      new Player(1, "left"),
      new Player(2, "right")
    ];

    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
    this.spawnWarnings = [];

    this.state = "WAITING_PLAYERS"; // WAITING_PLAYERS, WEAPON_SELECT, PLAYING, SHOP, GAME_OVER
    this.round = 1;
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;

    this.leftReady = false;
    this.rightReady = false;

    this.extraQueueLeft = 0;
    this.extraQueueRight = 0;
    this.extraActiveLeft = 0;
    this.extraActiveRight = 0;

    this.monsterSpawnTimerLeft = BASE_MONSTER_SPAWN_INTERVAL;
    this.monsterSpawnTimerRight = BASE_MONSTER_SPAWN_INTERVAL;

    // track connected players if needed in server
    this.connectedPlayers = new Set();
  }

  // -------------------------------------------------
  // Player lifecycle
  // -------------------------------------------------

  setPlayerConnected(playerId, connected) {
    if (connected) {
      this.connectedPlayers.add(playerId);
    } else {
      this.connectedPlayers.delete(playerId);
    }

    if (this.connectedPlayers.size >= 2 && this.state === "WAITING_PLAYERS") {
      this.state = "WEAPON_SELECT";
      this.leftReady = false;
      this.rightReady = false;
      this.players.forEach(p => p.reset());
    }

    if (this.connectedPlayers.size === 0) {
      // full reset
      this.resetGame();
    }
  }

  resetGame() {
    this.players.forEach(p => p.reset());
    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
    this.spawnWarnings = [];
    this.state = "WAITING_PLAYERS";
    this.round = 1;
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;
    this.leftReady = false;
    this.rightReady = false;
    this.extraQueueLeft = 0;
    this.extraQueueRight = 0;
    this.extraActiveLeft = 0;
    this.extraActiveRight = 0;
    this.monsterSpawnTimerLeft = BASE_MONSTER_SPAWN_INTERVAL;
    this.monsterSpawnTimerRight = BASE_MONSTER_SPAWN_INTERVAL;
  }

  // -------------------------------------------------
  // Weapon select & shop actions
  // -------------------------------------------------

  handleWeaponChoice(playerId, weaponType) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p) return;
    if (this.state !== "WEAPON_SELECT") return;

    if (!WEAPONS[weaponType]) return;

    p.weaponType = weaponType;
    p.weaponLevel = 1;
    p.hasChosenWeapon = true;
    if (p.side === "left") {
      this.leftReady = true;
    } else {
      this.rightReady = true;
    }

    if (this.leftReady && this.rightReady) {
      this.startWave();
    }
  }

  handleShopAction(playerId, action) {
    const p = this.players.find(pl => pl.id === playerId);
    if (!p) return;
    if (this.state !== "SHOP") return;

    if (action === "start_round") {
      if (p.side === "left") {
        this.leftReady = true;
      } else {
        this.rightReady = true;
      }
      if (this.leftReady && this.rightReady) {
        this.startWave();
      }
      return;
    }

    // Example shop actions
    if (action === "heal" && p.gold >= 8) {
      p.gold -= 8;
      p.heal(30);
      return;
    }

    if (action === "upgrade_weapon" && p.gold >= 12) {
      p.gold -= 12;
      p.weaponLevel = Math.min(p.weaponLevel + 1, 5);
      return;
    }

    if (action === "extra_monsters") {
      let cost = EXTRA_MONSTER_BASE_COST + (p.side === "left" ? this.extraActiveLeft : this.extraActiveRight) * 4;
      if (p.gold >= cost) {
        p.gold -= cost;
        if (p.side === "left") {
          this.extraQueueRight = Math.min(
            EXTRA_QUEUE_MAX,
            this.extraQueueRight + 1
          );
          this.extraActiveLeft += 1;
        } else {
          this.extraQueueLeft = Math.min(
            EXTRA_QUEUE_MAX,
            this.extraQueueLeft + 1
          );
          this.extraActiveRight += 1;
        }
      }
    }
  }

  handleRestart() {
    if (this.state === "GAME_OVER") {
      this.round = 1;
      this.players.forEach(p => p.reset());
      this.monsters = [];
      this.bullets = [];
      this.goldDrops = [];
      this.hearts = [];
      this.spawnWarnings = [];
      this.waveLeft = WAVE_TIME;
      this.shopLeft = SHOP_TIME;
      this.leftReady = false;
      this.rightReady = false;
      this.extraQueueLeft = 0;
      this.extraQueueRight = 0;
      this.extraActiveLeft = 0;
      this.extraActiveRight = 0;
      this.monsterSpawnTimerLeft = BASE_MONSTER_SPAWN_INTERVAL;
      this.monsterSpawnTimerRight = BASE_MONSTER_SPAWN_INTERVAL;
      this.state = "WEAPON_SELECT";
    }
  }

  startWave() {
    this.state = "PLAYING";
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;
    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
    this.spawnWarnings = [];
    this.leftReady = false;
    this.rightReady = false;
    this.monsterSpawnTimerLeft = this.computeSpawnInterval();
    this.monsterSpawnTimerRight = this.computeSpawnInterval();
  }

  computeSpawnInterval() {
    const factor = Math.max(
      0,
      1 - (this.round - 1) * 0.06
    );
    const interval =
      MIN_MONSTER_SPAWN_INTERVAL +
      factor * (BASE_MONSTER_SPAWN_INTERVAL - MIN_MONSTER_SPAWN_INTERVAL);
    return Math.max(MIN_MONSTER_SPAWN_INTERVAL, interval);
  }

  // -------------------------------------------------
  // Main step
  // -------------------------------------------------

  step(dt, input) {
    // input is something like:
    // {
    //   1: { up: bool, down: bool, left: bool, right: bool, shoot: bool? },
    //   2: { ... }
    // }

    if (this.state === "WAITING_PLAYERS") {
      return;
    }

    if (this.state === "WEAPON_SELECT") {
      this.players.forEach(p => p.updateWeaponCooldown(dt));
      return;
    }

    if (this.state === "PLAYING") {
      this.updateWave(dt, input);
      return;
    }

    if (this.state === "SHOP") {
      this.updateShop(dt);
      return;
    }

    if (this.state === "GAME_OVER") {
      return;
    }
  }

  // -------------------------------------------------
  // Wave logic
  // -------------------------------------------------

  updateWave(dt, input) {
    this.waveLeft -= dt;
    if (this.waveLeft <= 0) {
      this.waveLeft = 0;
      if (this.state === "PLAYING") {
        this.state = "SHOP";
        this.shopLeft = SHOP_TIME;
        this.leftReady = false;
        this.rightReady = false;
      }
    }

    for (const p of this.players) {
      p.updateWeaponCooldown(dt);
      const inp = input[p.id] || {};
      this.movePlayer(p, dt, inp);
      this.handlePlayerShooting(p, dt, inp);
    }

    this.updateSpawnWarnings(dt);
    this.updateMonsters(dt);
    this.updateBullets(dt);
    this.handleCollisions();

    if (this.players.every(p => !p.isAlive)) {
      this.state = "GAME_OVER";
    }
  }

  movePlayer(p, dt, inp) {
    if (!p.isAlive) return;

    let vx = 0;
    let vy = 0;
    if (inp.up) vy -= 1;
    if (inp.down) vy += 1;
    if (inp.left) vx -= 1;
    if (inp.right) vx += 1;

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len;
      vy /= len;
    }

    const speed = PLAYER_SPEED;
    let nx = p.x + vx * speed * dt;
    let ny = p.y + vy * speed * dt;

    const minX =
      p.side === "left"
        ? ARENA_PADDING
        : FENCE_X + ARENA_PADDING + p.width / 2;
    const maxX =
      p.side === "left"
        ? FENCE_X - ARENA_PADDING - p.width / 2
        : SCREEN_WIDTH - ARENA_PADDING;
    const minY = ARENA_PADDING;
    const maxY = SCREEN_HEIGHT - ARENA_PADDING;

    nx = clamp(nx, minX, maxX);
    ny = clamp(ny, minY, maxY);

    p.x = nx;
    p.y = ny;
  }

  handlePlayerShooting(p, dt, inp) {
    if (!p.isAlive) return;
    const wantShoot = inp.shoot ?? true;

    if (wantShoot && p.canShoot()) {
      const weapon = WEAPONS[p.weaponType];
      if (!weapon) return;

      const dirX = 0;
      const dirY = -1;

      const levelDamageMult = 1.0 + 0.25 * (p.weaponLevel - 1);
      const damage = weapon.damage * levelDamageMult;
      const speed = weapon.bulletSpeed;

      const b = new Bullet(
        p.id,
        p.side,
        p.x,
        p.y - 8,
        dirX * speed,
        dirY * speed,
        damage,
        p.weaponType
      );
      this.bullets.push(b);
      p.setCooldown();
    }
  }

  updateSpawnWarnings(dt) {
    const created = [];

    for (let i = this.spawnWarnings.length - 1; i >= 0; i--) {
      const w = this.spawnWarnings[i];
      w.timer -= dt;
      if (w.timer <= 0) {
        const side = w.side;
        const type = w.type;
        const baseHp = BASE_MONSTER_HP * Math.pow(MONSTER_HP_SCALE, this.round - 1);
        const baseSpeed =
          BASE_MONSTER_SPEED * Math.pow(MONSTER_SPEED_SCALE, this.round - 1);
        const mult = MONSTER_TYPES[type] || MONSTER_TYPES.slime;

        const hp = Math.max(
          10,
          Math.round(baseHp * mult.hpMult)
        );
        const speed = Math.max(50, baseSpeed * mult.speedMult);

        const m = new Monster(side, type, hp, speed);
        m.x = w.x;
        m.y = w.y;
        created.push(m);
        this.spawnWarnings.splice(i, 1);
      }
    }

    this.monsters.push(...created);
  }

  spawnMonster(side) {
    if (this.monsters.length >= MAX_MONSTERS) return;

    const types = Object.keys(MONSTER_TYPES);
    const type = randomChoice(types);

    const baseHp = BASE_MONSTER_HP * Math.pow(MONSTER_HP_SCALE, this.round - 1);
    const baseSpeed =
      BASE_MONSTER_SPEED * Math.pow(MONSTER_SPEED_SCALE, this.round - 1);
    const mult = MONSTER_TYPES[type] || MONSTER_TYPES.slime;

    const hp = Math.max(
      10,
      Math.round(baseHp * mult.hpMult)
    );
    const speed = Math.max(50, baseSpeed * mult.speedMult);

    const xMin = side === "left" ? ARENA_PADDING : FENCE_X + ARENA_PADDING;
    const xMax =
      side === "left" ? FENCE_X - ARENA_PADDING : SCREEN_WIDTH - ARENA_PADDING;
    const x = randomRange(xMin, xMax);
    const y = randomRange(ARENA_PADDING, SCREEN_HEIGHT * 0.4);

    const delay = 0.3 + Math.random() * 0.5;
    const warning = new SpawnWarning(side, type, x, y, delay);
    this.spawnWarnings.push(warning);
  }

  updateMonsters(dt) {
    if (this.waveLeft > 0) {
      this.monsterSpawnTimerLeft -= dt;
      if (this.monsterSpawnTimerLeft <= 0) {
        this.spawnMonster("left");
        this.monsterSpawnTimerLeft = this.computeSpawnInterval();
        if (this.extraQueueLeft > 0) {
          for (let i = 0; i < EXTRA_MONSTERS_AMOUNT; i++) {
            this.spawnMonster("left");
          }
          this.extraQueueLeft -= 1;
        }
      }

      this.monsterSpawnTimerRight -= dt;
      if (this.monsterSpawnTimerRight <= 0) {
        this.spawnMonster("right");
        this.monsterSpawnTimerRight = this.computeSpawnInterval();
        if (this.extraQueueRight > 0) {
          for (let i = 0; i < EXTRA_MONSTERS_AMOUNT; i++) {
            this.spawnMonster("right");
          }
          this.extraQueueRight -= 1;
        }
      }
    }

    for (const m of this.monsters) {
      const targetPlayers = this.players.filter(
        p => p.side === m.side && p.isAlive
      );
      if (targetPlayers.length === 0) continue;

      let closest = targetPlayers[0];
      let bestDist = Infinity;
      for (const p of targetPlayers) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < bestDist) {
          bestDist = d;
          closest = p;
        }
      }

      if (closest) {
        const dx = closest.x - m.x;
        const dy = closest.y - m.y;
        const dist = Math.hypot(dx, dy) || 1;
        const vx = (dx / dist) * m.speed;
        const vy = (dy / dist) * m.speed;
        m.x += vx * dt;
        m.y += vy * dt;

        const minX =
          m.side === "left"
            ? ARENA_PADDING + m.radius
            : FENCE_X + ARENA_PADDING + m.radius;
        const maxX =
          m.side === "left"
            ? FENCE_X - ARENA_PADDING - m.radius
            : SCREEN_WIDTH - ARENA_PADDING - m.radius;
        const minY = ARENA_PADDING + m.radius;
        const maxY = SCREEN_HEIGHT - ARENA_PADDING - m.radius;

        m.x = clamp(m.x, minX, maxX);
        m.y = clamp(m.y, minY, maxY);
      }
    }

    this.monsters = this.monsters.filter(m => m.isAlive);
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    this.bullets = this.bullets.filter(b => {
      return (
        b.x >= 0 &&
        b.x <= SCREEN_WIDTH &&
        b.y >= 0 &&
        b.y <= SCREEN_HEIGHT
      );
    });
  }

  handleCollisions() {
    for (const b of this.bullets) {
      const pOwner = this.players.find(p => p.id === b.ownerId);
      if (!pOwner) continue;

      const side = b.side;
      for (const m of this.monsters) {
        if (m.side !== side) continue;

        const dx = m.x - b.x;
        const dy = m.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= m.radius + b.radius) {
          m.takeDamage(b.damage);
          b._hit = true;
          if (!m.isAlive) {
            pOwner.monstersKilled += 1;
            pOwner.score += 10;

            if (Math.random() < GOLD_DROP_CHANCE) {
              const goldAmount = GOLD_PER_KILL;
              this.goldDrops.push(
                new GoldDrop(m.x, m.y, goldAmount)
              );
            }

            if (Math.random() < HEART_DROP_CHANCE) {
              this.hearts.push(
                new HeartPickup(m.x, m.y, HEART_HEAL_AMOUNT)
              );
            }
          }
        }
      }
    }

    this.bullets = this.bullets.filter(b => !b._hit);

    for (const p of this.players) {
      if (!p.isAlive) continue;

      const pRect = {
        x: p.x - p.width / 2,
        y: p.y - p.height / 2,
        w: p.width,
        h: p.height
      };

      for (const m of this.monsters) {
        if (m.side !== p.side) continue;
        const mRect = {
          x: m.x - m.radius,
          y: m.y - m.radius,
          w: m.radius * 2,
          h: m.radius * 2
        };

        if (rectsOverlap(pRect, mRect)) {
          p.takeDamage(8);
          m.takeDamage(9999);
        }
      }

      for (const g of this.goldDrops) {
        const gRect = {
          x: g.x - g.radius,
          y: g.y - g.radius,
          w: g.radius * 2,
          h: g.radius * 2
        };
        if (rectsOverlap(pRect, gRect)) {
          p.gold += g.amount;
          g._picked = true;
        }
      }

      for (const h of this.hearts) {
        const r = {
          x: h.x - h.radius,
          y: h.y - h.radius,
          w: h.radius * 2,
          h: h.radius * 2
        };
        if (rectsOverlap(pRect, r)) {
          p.heal(h.healAmount);
          h._picked = true;
        }
      }
    }

    this.goldDrops = this.goldDrops.filter(g => !g._picked);
    this.hearts = this.hearts.filter(h => !h._picked);
  }

  // -------------------------------------------------
  // Shop logic
  // -------------------------------------------------

  updateShop(dt) {
    this.shopLeft -= dt;
    if (this.shopLeft <= 0) {
      this.shopLeft = 0;
      this.leftReady = true;
      this.rightReady = true;
      if (this.state === "SHOP") {
        this.startWave();
      }
    }
  }

  // -------------------------------------------------
  // Export state
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
      })),
      goldDrops: this.goldDrops.map(g => ({
        id: g.id,
        x: g.x,
        y: g.y,
        amount: g.amount
      })),
      hearts: this.hearts.map(h => ({
        id: h.id,
        x: h.x,
        y: h.y,
        healAmount: h.healAmount
      })),
      spawnWarnings: this.spawnWarnings.map(w => ({
        id: w.id,
        side: w.side,
        type: w.type,
        x: w.x,
        y: w.y,
        timer: w.timer
      }))
    };
  }
}

module.exports = { GameCore };
