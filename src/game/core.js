// src/game/core.js

// -----------------------------------------------------
// Config
// -----------------------------------------------------

// NOTE: The server simulates in a fixed "world" size.
// The browser client scales this world to fit your screen.
const SCREEN_WIDTH = 1000;
const SCREEN_HEIGHT = 600;
const FENCE_X = SCREEN_WIDTH / 2;
const ARENA_PADDING = 40;

const PLAYER_SPEED = 300;           // bumped a bit for snappier feel
const PLAYER_MAX_HP = 100;
const HEART_HEAL = 25;
const GOLD_PER_PICKUP = 3;

// Green potion (enrage) pickup
// When collected: +15% damage, +75% attack speed for a short duration.
const GREEN_POTION_DROP_CHANCE = 0.06;
const ENRAGE_DURATION = 12.0;
const ENRAGE_DAMAGE_MULT = 1.15;
const ENRAGE_ATTACK_SPEED_MULT = 1.75;

const WAVE_TIME = 30.0;
const SHOP_TIME = 18.0;

// Make wave 1 feel challenging already.
// (User request: harder + roughly 2x more monsters.)
const BASE_TARGET = 18;
const TARGET_SCALE = 1.32;

const BASE_SPAWN_INTERVAL = 0.95;
const MIN_SPAWN_INTERVAL = 0.25;
const SPAWN_INTERVAL_DECAY = 0.045;

const MAX_MONSTERS = 70;

const MONSTER_BASE_HP = 60;
const MONSTER_HP_SCALE = 1.12;
const MONSTER_BASE_SPEED = 90;
const MONSTER_SPEED_SCALE = 1.06;

const GOLD_DROP_CHANCE = 0.55;
const HEART_DROP_CHANCE = 0.08;

const UPGRADE_COST = 10;

// Shop "send mobs" now supports specific mob types (different costs).
const SEND_MOB_COST = {
  slime: 10,
  fast: 14,
  tank: 18,
  spitter: 16,
};
const SEND_MOB_AMOUNT = {
  slime: 4,
  fast: 3,
  tank: 2,
  spitter: 2,
};

// -----------------------------------------------------
// Boss fights + boss sending
// -----------------------------------------------------
// Every 5th round is a boss round.
// Boss tiers advance every 10 rounds:
//   round 1..10  => boss1
//   round 11..20 => boss2
//   ...
const SEND_BOSS_COST = 100;

function bossTierForRound(round) {
  return 1 + Math.floor((round - 1) / 10);
}

function bossTypeForRound(round) {
  const tier = bossTierForRound(round);
  return `boss${tier}`;
}

function isBossRound(round) {
  return round % 5 === 0;
}

const HEAL_COST = 8;
const HEAL_AMOUNT = 30;

// -----------------------------------------------------
// Grenades (shop item)
// -----------------------------------------------------
// Bought in SHOP, deployed at the start of the next wave on the opponent side.
// Each player can buy up to 2 grenades per shop.
const GRENADE_COST = 25;
const GRENADE_MAX_PER_ROUND = 2;
const GRENADE_FUSE = 1.2;
const GRENADE_RADIUS = 240;
// Change this to tune grenade power.
const GRENADE_DAMAGE = 100;

// -----------------------------------------------------
// Pickup collection radius
// -----------------------------------------------------
// Player-to-pickup distance (world pixels) to count as collected.
// Increase this to make coins/hearts/potions easier to pick up.
const PICKUP_RADIUS = 32;

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


// Enemy projectiles (spitter)
// Spitters keep distance and fire blobs at players on their side.
const SPITTER_RANGE = 420;
const SPITTER_COOLDOWN = 1.25;
const SPITTER_COOLDOWN_JITTER = 0.35;
const SPITTER_PROJECTILE_SPEED = 420;
const SPITTER_PROJECTILE_DAMAGE = 10;
const ENEMY_BULLET_LIFETIME = 2.2;

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(a, b) {
  return a + Math.random() * (b - a);
}

function randRange(a, b) {
  return randomRange(a, b);
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

    // Weapon is chosen in WEAPON_SELECT.
    // Keep null until chosen so the game doesn't auto-start.
    this.weaponType = null;
    this.weaponChosen = false;
    this.weaponLevel = 1;
    this.weaponTimer = 0;

    // Temporary buffs
    this.enrageTimer = 0;

    // Shop-limited items
    this.grenadesBoughtThisRound = 0;

    // Default stats (will be overwritten on setWeapon).
    this.weaponDamage = 10;
    this.weaponCooldown = 0.35;
    this.bulletSpeed = 520;

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
    this.weaponChosen = false;
    this.weaponLevel = 1;
    this.weaponTimer = 0;

    // Temporary buffs
    this.enrageTimer = 0;

    // Shop-limited items
    this.grenadesBoughtThisRound = 0;

    // Default stats (will be overwritten on setWeapon).
    this.weaponDamage = 10;
    this.weaponCooldown = 0.35;
    this.bulletSpeed = 520;

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
    this.weaponChosen = true;
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

    if (this.enrageTimer > 0) {
      this.enrageTimer = Math.max(0, this.enrageTimer - dt);
    }
  }

  get isEnraged() {
    return this.enrageTimer > 0;
  }

  applyEnrage(durationSeconds) {
    this.enrageTimer = Math.max(this.enrageTimer, durationSeconds);
  }

  canShoot() {
    return this.weaponTimer <= 0 && this.isAlive;
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
    // Attack speed buff reduces cooldown.
    const atkSpeedMult = this.isEnraged ? ENRAGE_ATTACK_SPEED_MULT : 1.0;
    this.weaponTimer = this.weaponCooldown / atkSpeedMult;

    const spread = this.weaponType === "bow" ? 0.07 : 0.04;
    const baseAngle = Math.atan2(this.aimDy, this.aimDx);
    const angleOffset = (Math.random() - 0.5) * spread;
    const angle = baseAngle + angleOffset;

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const speed = this.bulletSpeed;
    const dmgMult = this.isEnraged ? ENRAGE_DAMAGE_MULT : 1.0;
    const damage = this.weaponDamage * dmgMult;

    const startX = this.x + dx * 20;
    const startY = this.y + dy * 20;

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
    // Monster size (collision / clamping).
    // Keep normal mobs smaller; bosses larger.
    this.radius = type.startsWith("boss") ? 60 : 34;

    // Ranged attack timer (used by spitters)
    this.shotTimer = (type === "spitter") ? (0.4 + Math.random() * 0.6) : 0;
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


class EnemyBullet {
  constructor(id, side, x, y, vx, vy, damage) {
    this.id = id;
    this.side = side; // "left"/"right" half this projectile belongs to
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.lifetime = ENEMY_BULLET_LIFETIME;
    this.kind = "spitter";
  }
}

class Grenade {
  constructor(id, side, x, y) {
    this.id = id;
    this.side = side; // "left"/"right" half it belongs to
    this.x = x;
    this.y = y;
    this.timer = GRENADE_FUSE;
    this.radius = GRENADE_RADIUS;
    this.damage = GRENADE_DAMAGE;
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

class GreenPotionPickup {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
  }
}

class SpawnWarning {
  constructor(id, side, type, round) {
    this.id = id;
    this.side = side;
    this.type = type;
    this.round = round;
    // Telegraph spawning: blink ~3 times over ~2 seconds.
    this.total = 2.0;
    this.timer = this.total;

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
    this.enemyBullets = [];
    this.grenades = [];
    this.goldDrops = [];
    this.hearts = [];
    this.greenPotions = [];
    this.spawnWarnings = [];

    this.nextMonsterId = 1;
    this.nextBulletId = 1;
    this.nextEnemyBulletId = 1;
    this.nextGrenadeId = 1;
    this.nextGoldId = 1;
    this.nextHeartId = 1;
    this.nextGreenPotionId = 1;
    this.nextSpawnWarnId = 1;

    this.state = "WEAPON_SELECT"; // WEAPON_SELECT / PLAYING / SHOP / GAME_OVER
    this.winner = null; // "left" | "right" | "draw" | null
    this.round = 1;
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;

    this.spawnInterval = 1.8;
    // Normal (non-boss) wave target count scales up each round.
    // Boss rounds should not overwrite this (otherwise the next wave becomes tiny).
    this.normalTarget = BASE_TARGET;
    this.baseTarget = BASE_TARGET;
    this.baseSpawnedLeft = 0;
    this.baseSpawnedRight = 0;
    this.spawnCdLeft = 0;
    this.spawnCdRight = 0;

    // "Send mobs" purchases made during SHOP (applied next wave).
    // We store packs per side + type during the shop, then convert them into a
    // per-wave spawn plan when the next wave starts.
    this.pendingPacks = {
      left: { slime: 0, fast: 0, tank: 0, spitter: 0 },
      right: { slime: 0, fast: 0, tank: 0, spitter: 0 },
    };

    // Bosses queued from the shop to be spawned next wave on a given side.
    // Each entry is a boss type string (e.g. "boss1", "boss2").
    this.pendingBosses = { left: [], right: [] };

    // Grenades queued from the shop to be deployed next wave on a given side.
    this.pendingGrenades = { left: 0, right: 0 };

    // Grenades queued from the shop to be deployed next wave on a given side.
    this.pendingGrenades = { left: 0, right: 0 };

    this.extraPlanLeft = [];
    this.extraPlanRight = [];
    this.extraPlanSpawnedLeft = 0;
    this.extraPlanSpawnedRight = 0;
    this.extraSpawnCdLeft = 0;
    this.extraSpawnCdRight = 0;

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

    // Backwards-compatible aliases (older client)
    if (action === "upgrade") action = "upgrade_weapon";
    if (action === "send_mobs") action = "send:slime";

    if (action === "upgrade_weapon") {
      if (p.gold >= UPGRADE_COST) {
        p.gold -= UPGRADE_COST;
        p.upgradeWeapon();
      }
    } else if (action === "heal") {
      if (p.gold >= HEAL_COST) {
        p.gold -= HEAL_COST;
        p.heal(HEAL_AMOUNT);
      }
    } else if (action && action.startsWith("send:")) {
      // send:<mobType> => queues a pack to the opponent side
      const mobType = action.split(":")[1];
      const cost = SEND_MOB_COST[mobType];
      if (!cost) return;
      if (p.gold < cost) return;
      p.gold -= cost;

      const opponentSide = isLeft ? "right" : "left";
      this.queueSendPack(opponentSide, mobType);
    } else if (action === "send_boss") {
      if (p.gold < SEND_BOSS_COST) return;
      p.gold -= SEND_BOSS_COST;

      const opponentSide = isLeft ? "right" : "left";
      // "Latest" boss: based on current round tier.
      const bossType = bossTypeForRound(this.round);
      this.pendingBosses[opponentSide].push(bossType);
    } else if (action === "send_grenade") {
      // Limit grenades per player per shop.
      if (p.grenadesBoughtThisRound >= GRENADE_MAX_PER_ROUND) return;
      if (p.gold < GRENADE_COST) return;
      p.gold -= GRENADE_COST;
      p.grenadesBoughtThisRound += 1;

      const opponentSide = isLeft ? "right" : "left";
      this.pendingGrenades[opponentSide] = (this.pendingGrenades[opponentSide] || 0) + 1;
    } else if (action === "start_round") {
      if (p.side === "left") this.leftReady = true;
      else this.rightReady = true;
    }
  }

  queueSendPack(side, mobType) {
    if (!this.pendingPacks[side] || !(mobType in this.pendingPacks[side])) return;
    this.pendingPacks[side][mobType] += 1;
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

  spawnWarningOnSide(side, forcedType = null) {
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

    // forcedType can be a normal mob OR a boss type (boss1, boss2, ...)
    if (forcedType) {
      type = forcedType;
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

    // Bosses (placeholder balancing)
    if (type && type.startsWith("boss")) {
      const tier = Number(String(type).replace("boss", "")) || 1;
      hpMult = 8.0 + (tier - 1) * 6.0;
      speedMult = 0.55 + (tier - 1) * 0.05;
    } else if (type === "fast") {
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
    // For boss rounds we force the base spawns to be the boss type.
    this.spawnWarningOnSide(side, this._forcedBaseType || null);
    if (side === "left") this.baseSpawnedLeft += 1;
    else this.baseSpawnedRight += 1;
  }

  spawnExtraMonsters(side) {
    // Deprecated (kept to avoid breaking older clients). Default to slimes.
    this.queueSendPack(side, "slime");
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
    let leftChosen = false;
    let rightChosen = false;

    for (const p of this.players) {
      p.update(dt);
      if (p.side === "left" && p.weaponChosen) leftChosen = true;
      if (p.side === "right" && p.weaponChosen) rightChosen = true;
    }

    if (leftChosen && rightChosen) {
      this.startNewRound();
    }
  }

  startNewRound() {
    this.state = "PLAYING";
    this.winner = null;
    this.waveLeft = WAVE_TIME;

    this.monsters = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.grenades = [];
    this.goldDrops = [];
    this.hearts = [];
    this.spawnWarnings = [];

    // Deploy grenades purchased during the previous SHOP.
    // Note: grenades belong to a side (half) and will only affect that half.
    for (const side of ["left", "right"]) {
      const count = this.pendingGrenades[side] || 0;
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const xMin = side === "left" ? ARENA_PADDING : FENCE_X + ARENA_PADDING;
          // Use the server's fixed simulation dimensions.
          // (Older patches referenced WORLD_WIDTH/WORLD_HEIGHT which don't exist here.)
          const xMax = side === "left" ? FENCE_X - ARENA_PADDING : SCREEN_WIDTH - ARENA_PADDING;
          const x = randRange(xMin, xMax);
          const y = randRange(ARENA_PADDING, SCREEN_HEIGHT - ARENA_PADDING);
          this.grenades.push(new Grenade(this.nextGrenadeId++, side, x, y));
        }
      }
      this.pendingGrenades[side] = 0;
    }

    const bossRound = isBossRound(this.round);

    // Convert any "send mobs" packs purchased in SHOP into a per-wave spawn plan.
    // This ensures the shop actually affects the NEXT wave (not the current shop screen).
    const buildPlan = (side) => {
      const plan = [];

      // Bosses queued via SHOP (send_boss)
      const bosses = this.pendingBosses[side] || [];
      for (const bossType of bosses) plan.push(bossType);
      this.pendingBosses[side] = [];

      const packs = this.pendingPacks[side];
      for (const [mobType, packCount] of Object.entries(packs)) {
        const amountPerPack = SEND_MOB_AMOUNT[mobType] ?? 3;
        for (let p = 0; p < packCount; p++) {
          for (let i = 0; i < amountPerPack; i++) plan.push(mobType);
        }
      }
      // Clear pending packs for that side (they've been consumed into the plan)
      this.pendingPacks[side] = { slime: 0, fast: 0, tank: 0, spitter: 0 };
      return plan;
    };

    this.extraPlanLeft = buildPlan("left");
    this.extraPlanRight = buildPlan("right");
    this.extraPlanSpawnedLeft = 0;
    this.extraPlanSpawnedRight = 0;
    this.extraSpawnCdLeft = 0.35;
    this.extraSpawnCdRight = 0.35;

    // Boss rounds: spawn fewer but much tougher units.
    // IMPORTANT: don't let boss rounds overwrite the normal target scaling,
    // otherwise the round after a boss becomes tiny ("only 1 monster" bug).
    if (!bossRound) {
      this.normalTarget = Math.round(this.normalTarget * TARGET_SCALE);
    }
    this.baseTarget = bossRound ? 1 : this.normalTarget;
    this.baseSpawnedLeft = 0;
    this.baseSpawnedRight = 0;

    const factor = Math.max(0, 1 - (this.round - 1) * SPAWN_INTERVAL_DECAY);
    const interval =
      MIN_SPAWN_INTERVAL +
      factor * (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
    this.spawnInterval = bossRound ? 1.6 : Math.max(MIN_SPAWN_INTERVAL, interval);

    this.spawnCdLeft = bossRound ? 0.2 : 0.25;
    this.spawnCdRight = bossRound ? 0.2 : 0.25;

    // Boss rounds: force base spawns to be the boss type.
    if (bossRound) {
      this._forcedBaseType = bossTypeForRound(this.round);
    } else {
      this._forcedBaseType = null;
    }
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

        // Reset per-shop purchase limits
        for (const pl of this.players) {
          pl.grenadesBoughtThisRound = 0;
        }
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

      // 🔥 Aim at nearest monster on this side (main.js behaviour)
      const target = this.nearestMonster(p.side);

      // Aim at nearest monster on this side. If none exist, do NOT shoot.
      if (target) {
        p.updateAim(target.x, target.y);

        // shoot only when we actually have something to shoot at
        if (p.canShoot()) {
          const b = p.shoot(this.nextBulletId++);
          this.bullets.push(b);
        }
      } else {
        // Keep a sensible aim direction for visuals (but no firing).
        const fallbackX = p.side === "left" ? FENCE_X - 20 : FENCE_X + 20;
        const fallbackY = p.y;
        p.updateAim(fallbackX, fallbackY);
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

      // Spawn extra mobs purchased in the shop (spread out across the wave).
      const spawnExtraForSide = (side) => {
        if (this.monsters.length >= MAX_MONSTERS) return;
        const plan = side === "left" ? this.extraPlanLeft : this.extraPlanRight;
        const spawnedKey = side === "left" ? "extraPlanSpawnedLeft" : "extraPlanSpawnedRight";
        const cdKey = side === "left" ? "extraSpawnCdLeft" : "extraSpawnCdRight";

        if (this[spawnedKey] >= plan.length) return;

        this[cdKey] -= dt;
        if (this[cdKey] > 0) return;

        const mobType = plan[this[spawnedKey]];
        this.spawnWarningOnSide(side, mobType);
        this[spawnedKey] += 1;

        // A slightly faster cadence than base spawns so "sent" packs feel impactful.
        this[cdKey] = Math.max(0.25, this.spawnInterval * 0.6);
      };

      spawnExtraForSide("left");
      spawnExtraForSide("right");
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


// spitters: fire projectiles at the nearest player on their side
for (const m of this.monsters) {
  if (!m.isAlive) continue;
  if (m.type !== "spitter") continue;

  const targets = this.players.filter(p => p.side === m.side && p.isAlive);
  if (targets.length === 0) continue;

  // choose nearest target
  let target = targets[0];
  let bestDist = Infinity;
  for (const p of targets) {
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d < bestDist) {
      bestDist = d;
      target = p;
    }
  }

  m.shotTimer -= dt;

  // Only shoot if within range
  if (bestDist <= SPITTER_RANGE && m.shotTimer <= 0) {
    const dx = target.x - m.x;
    const dy = target.y - m.y;
    const dist = Math.hypot(dx, dy) || 1;

    const vx = (dx / dist) * SPITTER_PROJECTILE_SPEED;
    const vy = (dy / dist) * SPITTER_PROJECTILE_SPEED;

    const startX = m.x + (dx / dist) * (m.radius + 6);
    const startY = m.y + (dy / dist) * (m.radius + 6);

    this.enemyBullets.push(
      new EnemyBullet(
        this.nextEnemyBulletId++,
        m.side,
        startX,
        startY,
        vx,
        vy,
        SPITTER_PROJECTILE_DAMAGE
      )
    );

    m.shotTimer = SPITTER_COOLDOWN + Math.random() * SPITTER_COOLDOWN_JITTER;
  }
}

// update enemy bullets (spitter blobs)
for (const eb of this.enemyBullets) {
  eb.x += eb.vx * dt;
  eb.y += eb.vy * dt;
  eb.lifetime -= dt;
}

// enemy bullet collisions ↔ players
for (const eb of this.enemyBullets) {
  if (eb._dead) continue;
  for (const p of this.players) {
    if (!p.isAlive) continue;
    if (p.side !== eb.side) continue; // never cross-halves
    const dist = Math.hypot(p.x - eb.x, p.y - eb.y);
    if (dist <= 18) {
      p.takeDamage(eb.damage);
      eb._dead = true;
      break;
    }
  }
}

this.enemyBullets = this.enemyBullets.filter(
  eb =>
    !eb._dead &&
    eb.lifetime > 0 &&
    // Do not allow spitter projectiles to visually cross the fence.
    // They also won't damage the other player (collision checks), but this
    // removes the confusing "shots flying to the other side" effect.
    (eb.side === "left" ? eb.x <= FENCE_X - 6 : eb.x >= FENCE_X + 6) &&
    eb.x >= -50 &&
    eb.x <= SCREEN_WIDTH + 50 &&
    eb.y >= -50 &&
    eb.y <= SCREEN_HEIGHT + 50
);

    // -----------------------------------------------------
    // Grenades (explode on the side they belong to only)
    // -----------------------------------------------------
    for (const g of this.grenades) {
      g.timer -= dt;
      if (g.timer <= 0 && !g._exploded) {
        g._exploded = true;

        // Damage players on the same side only
        for (const p of this.players) {
          if (!p.isAlive) continue;
          if (p.side !== g.side) continue;
          const d = Math.hypot(p.x - g.x, p.y - g.y);
          if (d <= g.radius) {
            // Linear falloff for nicer feel
            const t = 1 - d / g.radius;
            p.takeDamage(g.damage * (0.4 + 0.6 * t));
          }
        }

        // Also damage monsters on the same side (helps as a "nuke")
        for (const m of this.monsters) {
          if (!m.isAlive) continue;
          if (m.side !== g.side) continue;
          const d = Math.hypot(m.x - g.x, m.y - g.y);
          if (d <= g.radius) {
            const t = 1 - d / g.radius;
            m.hp -= g.damage * (0.6 + 0.6 * t);
            if (m.hp <= 0) m.isAlive = false;
          }
        }
      }
    }

    // Remove exploded grenades (keep a tiny linger for visuals if desired)
    this.grenades = this.grenades.filter(g => !g._exploded);

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

              if (Math.random() < GREEN_POTION_DROP_CHANCE) {
                const potion = new GreenPotionPickup(
                  this.nextGreenPotionId++,
                  m.x,
                  m.y
                );
                this.greenPotions.push(potion);
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
          // Make contact hits hurt more now that there are more mobs.
          p.takeDamage(12);
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
        if (dist <= PICKUP_RADIUS) {
          p.gold += g.amount;
          g._taken = true;
        }
      }
      for (const h of this.hearts) {
        const dist = Math.hypot(p.x - h.x, p.y - h.y);
        if (dist <= PICKUP_RADIUS) {
          p.heal(h.healAmount);
          h._taken = true;
        }
      }

      for (const gp of this.greenPotions) {
        const dist = Math.hypot(p.x - gp.x, p.y - gp.y);
        if (dist <= PICKUP_RADIUS) {
          p.applyEnrage(ENRAGE_DURATION);
          gp._taken = true;
        }
      }
    }

    this.goldDrops = this.goldDrops.filter(g => !g._taken);
    this.hearts = this.hearts.filter(h => !h._taken);
    this.greenPotions = this.greenPotions.filter(gp => !gp._taken);

    // game over?
    const aliveLeft = this.players.find(p => p.side === "left" && p.isAlive);
    const aliveRight = this.players.find(p => p.side === "right" && p.isAlive);
    if (!aliveLeft || !aliveRight) {
      this.state = "GAME_OVER";
      if (aliveLeft && !aliveRight) this.winner = "left";
      else if (aliveRight && !aliveLeft) this.winner = "right";
      else this.winner = "draw";
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
      winner: this.winner,
      round: this.round,
      waveLeft: this.waveLeft,
      shopLeft: this.shopLeft,
      pendingPacks: this.pendingPacks,
      extraPlanRemaining: {
        left: Math.max(0, this.extraPlanLeft.length - this.extraPlanSpawnedLeft),
        right: Math.max(0, this.extraPlanRight.length - this.extraPlanSpawnedRight),
      },
      leftReady: this.leftReady,
      rightReady: this.rightReady,
      players: this.players.map(p => ({
        id: p.id,
        side: p.side,
        x: p.x,
        y: p.y,
        aimDx: p.aimDx,
        aimDy: p.aimDy,
        hp: p.hp,
        maxHp: p.maxHp,
        gold: p.gold,
        score: p.score,
        monstersKilled: p.monstersKilled,
        weaponType: p.weaponType,
        weaponLevel: p.weaponLevel,

        // buffs
        isEnraged: p.isEnraged,
        enrageTimer: p.enrageTimer
      })),
      monsters: this.monsters.map(m => ({
        id: m.id,
        side: m.side,
        type: m.type,
        x: m.x,
        y: m.y,
        hp: m.hp
      })),
      enemyBullets: this.enemyBullets.map(eb => ({
        id: eb.id,
        side: eb.side,
        x: eb.x,
        y: eb.y,
        vx: eb.vx,
        vy: eb.vy,
        kind: eb.kind
      })),
      grenades: this.grenades.map(g => ({
        id: g.id,
        side: g.side,
        x: g.x,
        y: g.y,
        timer: g.timer,
        radius: g.radius
      })),
      bullets: this.bullets.map(b => ({
        id: b.id,
        side: b.side,
        x: b.x,
        y: b.y,
        vx: b.vx,
        vy: b.vy,
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
      greenPotions: this.greenPotions.map(gp => ({
        id: gp.id,
        x: gp.x,
        y: gp.y
      })),
      spawnWarnings: this.spawnWarnings.map(w => ({
        id: w.id,
        side: w.side,
        type: w.type,
        x: w.x,
        y: w.y,
        timer: w.timer,
        total: w.total
      }))
    };
  }
}

module.exports = { GameCore };
