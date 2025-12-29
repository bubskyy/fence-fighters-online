// src/game/core.js

// -----------------------------------------------------
// Config
// -----------------------------------------------------

// NOTE: This is the "world" size. The client can scale it to fit any screen.
const SCREEN_WIDTH = 1000;
const SCREEN_HEIGHT = 600;
const FENCE_X = SCREEN_WIDTH / 2;
const ARENA_PADDING = 40;

const PLAYER_SPEED = 300;           // bumped a bit for snappier feel
const PLAYER_MAX_HP = 100;
const HEART_HEAL = 25;
const GOLD_PER_PICKUP = 3;

const WAVE_TIME = 30.0;
const SHOP_TIME = 18.0;

const BASE_TARGET = 6;
const TARGET_SCALE = 1.2;

const BASE_SPAWN_INTERVAL = 1.8;
const MIN_SPAWN_INTERVAL = 0.45;
const SPAWN_INTERVAL_DECAY = 0.035;

const MAX_MONSTERS = 26;

const MONSTER_BASE_HP = 30;
const MONSTER_HP_SCALE = 1.12;
const MONSTER_BASE_SPEED = 90;
const MONSTER_SPEED_SCALE = 1.06;

const GOLD_DROP_CHANCE = 0.55;
const HEART_DROP_CHANCE = 0.08;

const UPGRADE_COST = 10;
const EXTRA_MONSTERS_COST = 12;
const EXTRA_MONSTERS_AMOUNT = 4;

// weapon config – same idea as main.js
const WEAPON_CONFIG = {
  knife: {
    damage: 10,
    cooldown: 0.35,
    bulletSpeed: 520
  },
  axe: {
    damage: 18,
    cooldown: 0.65,
    bulletSpeed: 460
  },
  spear: {
    damage: 14,
    cooldown: 0.45,
    bulletSpeed: 580
  },
  bow: {
    damage: 8,
    cooldown: 0.55,
    bulletSpeed: 780
  }
};

const BULLET_LIFETIME = 1.7;

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(a, b) {
  return a + Math.random() * (b - a);
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// -----------------------------------------------------
// Core data classes
// -----------------------------------------------------

class Player {
  constructor(id, side) {
    this.id = id;
    this.side = side; // "left" or "right"

    this.width = 32;
    this.height = 32;

    this.maxHp = PLAYER_MAX_HP;
    this.hp = PLAYER_MAX_HP;
    this.gold = 0;
    this.score = 0;
    this.monstersKilled = 0;

    // Weapon is chosen in WEAPON_SELECT. Until then, don't auto-shoot.
    this.weaponType = null;
    this.hasChosenWeapon = false;
    this.weaponLevel = 1;
    this.weaponTimer = 0;

    // Default stats (overridden once weapon is selected)
    this.weaponDamage = 0;
    this.weaponCooldown = 999;
    this.bulletSpeed = 0;

    this.aimDx = side === "left" ? 1 : -1;
    this.aimDy = 0;

    this.resetPosition();
  }

  resetPosition() {
    const midX = this.side === "left" ? SCREEN_WIDTH * 0.25 : SCREEN_WIDTH * 0.75;
    const midY = SCREEN_HEIGHT * 0.65;
    this.x = midX;
    this.y = midY;
  }

  resetForNewMatch() {
    this.hp = this.maxHp;
    this.gold = 0;
    this.score = 0;
    this.monstersKilled = 0;
    this.weaponType = null;
    this.hasChosenWeapon = false;
    this.weaponLevel = 1;
    this.weaponTimer = 0;

    this.weaponDamage = 0;
    this.weaponCooldown = 999;
    this.bulletSpeed = 0;

    this.aimDx = this.side === "left" ? 1 : -1;
    this.aimDy = 0;

    this.resetPosition();
  }

  get isAlive() {
    return this.hp > 0;
  }

  setWeapon(weaponType) {
    if (!WEAPON_CONFIG[weaponType]) return;
    this.weaponType = weaponType;
    this.hasChosenWeapon = true;
    this.weaponLevel = 1;

    const cfg = WEAPON_CONFIG[this.weaponType];
    this.weaponDamage = cfg.damage;
    this.weaponCooldown = cfg.cooldown;
    this.bulletSpeed = cfg.bulletSpeed;
  }

  upgradeWeapon() {
    this.weaponLevel = Math.min(this.weaponLevel + 1, 5);
    const cfg = WEAPON_CONFIG[this.weaponType];
    this.weaponDamage = Math.floor(
      cfg.damage * (1 + 0.4 * (this.weaponLevel - 1))
    );
    this.weaponCooldown = Math.max(
      0.15,
      cfg.cooldown * Math.pow(0.9, this.weaponLevel - 1)
    );
    this.bulletSpeed = cfg.bulletSpeed * (1 + 0.05 * (this.weaponLevel - 1));
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  heal(amount) {
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
  }

  update(dt) {
    if (this.weaponTimer > 0) {
      this.weaponTimer -= dt;
    }
  }

  canShoot() {
    return this.weaponTimer <= 0 && this.isAlive && this.hasChosenWeapon;
  }

  updateAim(targetX, targetY) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.0001) {
      this.aimDx = dx / len;
      this.aimDy = dy / len;
    }
  }

  shoot(bulletId) {
    this.weaponTimer = this.weaponCooldown;

    const spread = this.weaponType === "bow" ? 0.07 : 0.04;
    const baseAngle = Math.atan2(this.aimDy, this.aimDx);
    const angleOffset = (Math.random() - 0.5) * spread;
    const angle = baseAngle + angleOffset;

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const speed = this.bulletSpeed;
    const damage = this.weaponDamage;

    // Spawn bullets from the "weapon tip" so it visually looks like it's fired from hand.
    const weaponTip = { knife: 22, axe: 28, spear: 34, bow: 28 };
    const tip = weaponTip[this.weaponType] ?? 22;
    const startX = this.x + dx * tip;
    const startY = this.y + dy * tip;

    return new Bullet(
      bulletId,
      this.id,
      this.side,
      startX,
      startY,
      dx * speed,
      dy * speed,
      damage,
      this.weaponType
    );
  }
}

class Monster {
  constructor(id, side, type, x, y, hp, speed) {
    this.id = id;
    this.side = side;   // "left" or "right"
    this.type = type;   // "slime"/"fast"/"tank"/"spitter"
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.speed = speed;
    this.radius = 18;
  }

  get isAlive() {
    return this.hp > 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }
}

class Bullet {
  constructor(id, ownerId, side, x, y, vx, vy, damage, weaponType) {
    this.id = id;
    this.ownerId = ownerId;
    this.side = side;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.weaponType = weaponType;
    this.lifetime = BULLET_LIFETIME;

    const pierceMap = { knife: 0, axe: 2, spear: 999, bow: 1 };
    this.pierce = pierceMap[weaponType] ?? 0;
  }
}

class GoldDrop {
  constructor(id, x, y, amount) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.amount = amount;
  }
}

class HeartPickup {
  constructor(id, x, y, healAmount) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.healAmount = healAmount;
  }
}

class SpawnWarning {
  constructor(id, side, type, round) {
    this.id = id;
    this.side = side;
    this.type = type;
    this.round = round;
    // Fixed warning duration so the client can do a predictable 3-blink animation.
    this.duration = 2.0;
    this.timer = this.duration;

    const xMin = side === "left" ? ARENA_PADDING : FENCE_X + ARENA_PADDING;
    const xMax =
      side === "left" ? FENCE_X - ARENA_PADDING : SCREEN_WIDTH - ARENA_PADDING;
    this.x = randomRange(xMin, xMax);
    this.y = randomRange(ARENA_PADDING, SCREEN_HEIGHT * 0.4);
  }
}

// -----------------------------------------------------
// GameCore
// -----------------------------------------------------

class GameCore {
  constructor() {
    this.players = [new Player(1, "left"), new Player(2, "right")];

    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
    this.spawnWarnings = [];

    this.nextMonsterId = 1;
    this.nextBulletId = 1;
    this.nextGoldId = 1;
    this.nextHeartId = 1;
    this.nextSpawnWarnId = 1;

    this.state = "WEAPON_SELECT"; // WEAPON_SELECT / PLAYING / SHOP / GAME_OVER
    this.round = 1;
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;

    this.spawnInterval = 1.8;
    this.baseTarget = BASE_TARGET;
    this.baseSpawnedLeft = 0;
    this.baseSpawnedRight = 0;
    this.spawnCdLeft = 0;
    this.spawnCdRight = 0;

    this.extraQueueLeft = 0;
    this.extraQueueRight = 0;
    this.extraActiveLeft = 0;
    this.extraActiveRight = 0;

    this.leftReady = false;
    this.rightReady = false;
  }

  resetMatch() {
    const fresh = new GameCore();
    Object.assign(this, fresh);
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id) || null;
  }

  // -------------------------------------------------
  // Server-driven actions (called from http_ws.js)
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

    // Accept both old client action names and new canonical ones.
    if (action === "upgrade" || action === "upgrade_weapon") {
      if (p.gold >= UPGRADE_COST) {
        p.gold -= UPGRADE_COST;
        p.upgradeWeapon();
      }
    } else if (action === "send_mobs" || action === "extra_monsters") {
      if (p.gold >= EXTRA_MONSTERS_COST) {
        p.gold -= EXTRA_MONSTERS_COST;
        if (isLeft) {
          this.extraQueueRight += 1;
          this.extraActiveLeft += 1;
        } else {
          this.extraQueueLeft += 1;
          this.extraActiveRight += 1;
        }
      }
    } else if (action === "heal") {
      // optional heal action
      const healCost = 8;
      if (p.gold >= healCost) {
        p.gold -= healCost;
        p.heal(30);
      }
    } else if (action === "start_round") {
      if (p.side === "left") this.leftReady = true;
      else this.rightReady = true;
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
  // Spawning / utilities
  // -------------------------------------------------

  spawnWarningOnSide(side) {
    // approximate weights from main.js
    const types = ["slime", "fast", "tank", "spitter"];
    const weights = [0.6, 0.2, 0.15, 0.05];
    const r = Math.random();
    let acc = 0;
    let type = "slime";
    for (let i = 0; i < types.length; i++) {
      acc += weights[i];
      if (r <= acc) {
        type = types[i];
        break;
      }
    }

    const w = new SpawnWarning(this.nextSpawnWarnId++, side, type, this.round);
    this.spawnWarnings.push(w);
  }

  spawnMonsterFromWarning(warn) {
    const side = warn.side;
    const type = warn.type;
    const round = warn.round;

    const hpBase = MONSTER_BASE_HP * Math.pow(MONSTER_HP_SCALE, round - 1);
    const speedBase = MONSTER_BASE_SPEED * Math.pow(MONSTER_SPEED_SCALE, round - 1);

    let hpMult = 1.0;
    let speedMult = 1.0;
    if (type === "fast") {
      hpMult = 0.7;
      speedMult = 1.5;
    } else if (type === "tank") {
      hpMult = 2.2;
      speedMult = 0.7;
    } else if (type === "spitter") {
      hpMult = 1.1;
      speedMult = 0.8;
    }

    const hp = Math.max(10, Math.round(hpBase * hpMult));
    const speed = Math.max(50, speedBase * speedMult);

    const m = new Monster(
      this.nextMonsterId++,
      side,
      type,
      warn.x,
      warn.y,
      hp,
      speed
    );
    this.monsters.push(m);
  }

  spawnBaseMonster(side) {
    if (this.monsters.length >= MAX_MONSTERS) return;
    this.spawnWarningOnSide(side);
    if (side === "left") this.baseSpawnedLeft += 1;
    else this.baseSpawnedRight += 1;
  }

  spawnExtraMonsters(side) {
    for (let i = 0; i < EXTRA_MONSTERS_AMOUNT; i++) {
      this.spawnWarningOnSide(side);
    }
  }

  // NEW: nearest-monster logic, ported from main.js
  nearestMonster(side) {
    const p = this.players.find(pl => pl.side === side);
    if (!p) return null;

    let best = null;
    let bestDist2 = Infinity;

    for (const m of this.monsters) {
      if (!m.isAlive) continue;
      if (m.side !== side) continue;
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist2) {
        bestDist2 = d2;
        best = m;
      }
    }
    return best;
  }

  // -------------------------------------------------
  // Step
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
        break;
    }
  }

  updateWeaponSelect(dt) {
    for (const p of this.players) p.update(dt);

    const left = this.players.find(p => p.side === "left");
    const right = this.players.find(p => p.side === "right");
    const leftChosen = !!left?.hasChosenWeapon;
    const rightChosen = !!right?.hasChosenWeapon;

    if (leftChosen && rightChosen) this.startNewRound();
  }

  startNewRound() {
    this.state = "PLAYING";
    this.waveLeft = WAVE_TIME;

    this.monsters = [];
    this.bullets = [];
    this.goldDrops = [];
    this.hearts = [];
    this.spawnWarnings = [];

    this.baseTarget = Math.round(this.baseTarget * TARGET_SCALE);
    this.baseSpawnedLeft = 0;
    this.baseSpawnedRight = 0;

    const factor = Math.max(0, 1 - (this.round - 1) * SPAWN_INTERVAL_DECAY);
    const interval =
      MIN_SPAWN_INTERVAL +
      factor * (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
    this.spawnInterval = Math.max(MIN_SPAWN_INTERVAL, interval);

    this.spawnCdLeft = 0.5;
    this.spawnCdRight = 0.5;
  }

  updatePlaying(dt, inputs) {
    // wave timer
    if (this.waveLeft > 0) {
      this.waveLeft -= dt;
      if (this.waveLeft <= 0) {
        this.waveLeft = 0;
        this.state = "SHOP";
        this.shopLeft = SHOP_TIME;
        this.leftReady = false;
        this.rightReady = false;
      }
    }

    // players: movement, aiming at nearest monster, shooting
    for (const p of this.players) {
      p.update(dt);

      const inp = inputs[p.id] || {};
      let dx = 0;
      let dy = 0;
      if (inp.up) dy -= 1;
      if (inp.down) dy += 1;
      if (inp.left) dx -= 1;
      if (inp.right) dx += 1;

      let len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
        p.x += dx * PLAYER_SPEED * dt;
        p.y += dy * PLAYER_SPEED * dt;
      }

      const minX =
        p.side === "left"
          ? ARENA_PADDING + p.width / 2
          : FENCE_X + ARENA_PADDING + p.width / 2;
      const maxX =
        p.side === "left"
          ? FENCE_X - ARENA_PADDING - p.width / 2
          : SCREEN_WIDTH - ARENA_PADDING - p.width / 2;
      const minY = ARENA_PADDING + p.height / 2;
      const maxY = SCREEN_HEIGHT - ARENA_PADDING - p.height / 2;
      p.x = clamp(p.x, minX, maxX);
      p.y = clamp(p.y, minY, maxY);

      // Aim at nearest monster on this side
      const target = this.nearestMonster(p.side);
      if (target) {
        p.updateAim(target.x, target.y);
      }

      // Only shoot when there's something to shoot at (no "ghost" bullets)
      if (target && p.canShoot()) {
        const b = p.shoot(this.nextBulletId++);
        this.bullets.push(b);
      }
    }

    // spawn baseline monsters
    if (this.waveLeft > 0) {
      if (this.baseSpawnedLeft < this.baseTarget) {
        this.spawnCdLeft -= dt;
        if (this.spawnCdLeft <= 0) {
          this.spawnBaseMonster("left");
          this.spawnCdLeft = this.spawnInterval;
        }
      }
      if (this.baseSpawnedRight < this.baseTarget) {
        this.spawnCdRight -= dt;
        if (this.spawnCdRight <= 0) {
          this.spawnBaseMonster("right");
          this.spawnCdRight = this.spawnInterval;
        }
      }

      // distribute extra monsters over wave duration
      const elapsedFrac = (WAVE_TIME - this.waveLeft) / WAVE_TIME;
      const targetExtraLeft = Math.floor(this.extraActiveLeft * elapsedFrac);
      const targetExtraRight = Math.floor(this.extraActiveRight * elapsedFrac);

      while (this.extraQueueLeft > 0 && this.extraActiveLeft < targetExtraLeft) {
        this.spawnExtraMonsters("left");
        this.extraQueueLeft--;
        this.extraActiveLeft++;
      }
      while (this.extraQueueRight > 0 && this.extraActiveRight < targetExtraRight) {
        this.spawnExtraMonsters("right");
        this.extraQueueRight--;
        this.extraActiveRight++;
      }
    }

    // update spawn warnings -> monsters
    for (const w of this.spawnWarnings) {
      w.timer -= dt;
    }
    const newlySpawned = [];
    this.spawnWarnings = this.spawnWarnings.filter(w => {
      if (w.timer <= 0) {
        newlySpawned.push(w);
        return false;
      }
      return true;
    });
    for (const w of newlySpawned) {
      this.spawnMonsterFromWarning(w);
    }

    // update monsters movement (chase nearest player on same side)
    for (const m of this.monsters) {
      if (!m.isAlive) continue;

      const sidePlayers = this.players.filter(p => p.side === m.side && p.isAlive);
      if (sidePlayers.length === 0) continue;

      let target = sidePlayers[0];
      let bestDist = Infinity;
      for (const p of sidePlayers) {
        const d = Math.hypot(p.x - m.x, p.y - m.y);
        if (d < bestDist) {
          bestDist = d;
          target = p;
        }
      }

      if (target) {
        const dx = target.x - m.x;
        const dy = target.y - m.y;
        const dist = Math.hypot(dx, dy) || 1;
        const vx = (dx / dist) * m.speed;
        const vy = (dy / dist) * m.speed;
        m.x += vx * dt;
        m.y += vy * dt;
      }

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

    // update bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.lifetime -= dt;
    }

    this.bullets = this.bullets.filter(
      b =>
        b.lifetime > 0 &&
        b.x >= -50 &&
        b.x <= SCREEN_WIDTH + 50 &&
        b.y >= -50 &&
        b.y <= SCREEN_HEIGHT + 50
    );

    // collisions bullets ↔ monsters
    for (const b of this.bullets) {
      if (b._dead) continue;
      let hits = 0;
      for (const m of this.monsters) {
        if (!m.isAlive) continue;
        if (m.side !== b.side) continue;
        const dist = Math.hypot(m.x - b.x, m.y - b.y);
        if (dist <= m.radius + 5) {
          m.takeDamage(b.damage);
          hits += 1;
          if (!m.isAlive) {
            const owner = this.getPlayer(b.ownerId);
            if (owner) {
              owner.monstersKilled += 1;
              owner.score += 15;
              if (Math.random() < GOLD_DROP_CHANCE) {
                const gold = new GoldDrop(
                  this.nextGoldId++,
                  m.x,
                  m.y,
                  GOLD_PER_PICKUP
                );
                this.goldDrops.push(gold);
              }
              if (Math.random() < HEART_DROP_CHANCE) {
                const heart = new HeartPickup(
                  this.nextHeartId++,
                  m.x,
                  m.y,
                  HEART_HEAL
                );
                this.hearts.push(heart);
              }
            }
          }
        }
      }
      if (hits > 0) {
        if (b.pierce <= 0) {
          b._dead = true;
        } else {
          b.pierce -= hits;
        }
      }
    }

    this.bullets = this.bullets.filter(b => !b._dead);

    // collisions monsters ↔ players
    for (const m of this.monsters) {
      if (!m.isAlive) continue;
      for (const p of this.players) {
        if (!p.isAlive) continue;
        if (p.side !== m.side) continue;
        const dist = Math.hypot(p.x - m.x, p.y - m.y);
        if (dist <= m.radius + 18) {
          p.takeDamage(8);
          m.takeDamage(9999);
        }
      }
    }

    this.monsters = this.monsters.filter(m => m.isAlive);

    // pickups
    for (const p of this.players) {
      if (!p.isAlive) continue;
      for (const g of this.goldDrops) {
        const dist = Math.hypot(p.x - g.x, p.y - g.y);
        if (dist <= 16) {
          p.gold += g.amount;
          g._taken = true;
        }
      }
      for (const h of this.hearts) {
        const dist = Math.hypot(p.x - h.x, p.y - h.y);
        if (dist <= 16) {
          p.heal(h.healAmount);
          h._taken = true;
        }
      }
    }

    this.goldDrops = this.goldDrops.filter(g => !g._taken);
    this.hearts = this.hearts.filter(h => !h._taken);

    // game over?
    const aliveLeft = this.players.find(p => p.side === "left" && p.isAlive);
    const aliveRight = this.players.find(p => p.side === "right" && p.isAlive);
    if (!aliveLeft && !aliveRight) {
      this.state = "GAME_OVER";
    }
  }

  updateShop(dt) {
    this.shopLeft -= dt;
    if (this.shopLeft <= 0) {
      this.shopLeft = 0;
      this.state = "PLAYING";
      this.round += 1;
      this.startNewRound();
      return;
    }

    if (this.leftReady && this.rightReady) {
      this.state = "PLAYING";
      this.round += 1;
      this.startNewRound();
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
        timer: w.timer,
        duration: w.duration
      }))
    };
  }
}

module.exports = { GameCore };
