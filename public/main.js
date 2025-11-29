// main.js - Full client-side Fence Fighters (no networking)

//////////////////////////////
// Config
//////////////////////////////

const SCREEN_WIDTH = 1000;
const SCREEN_HEIGHT = 600;
const FPS = 60;

const FENCE_X = SCREEN_WIDTH / 2;
const ARENA_PADDING = 40;

const PLAYER_SPEED = 250;
const PLAYER_SIZE = { w: 40, h: 40 };
const PLAYER_MAX_HP = 100;

const TILE_SIZE = 64;

const WAVE_TIME = 30.0;
const SHOP_TIME = 20.0;

const UPGRADE_COST = 15;
const EXTRA_MONSTERS_COST = 10;
const EXTRA_MONSTERS_AMOUNT = 4;

const HEART_DROP_CHANCE = 0.05;
const HEART_HEAL_AMOUNT = 20;

const MONSTER_TYPES = {
  slime: { hp: 20, speed: 80, gold: [2, 4] },
  tank: { hp: 40, speed: 60, gold: [4, 7] },
  fast: { hp: 15, speed: 120, gold: [1, 3] },
  spitter: { hp: 18, speed: 70, gold: [3, 5] },
};

const WEAPON_CONFIG = {
  knife: { damage: 10, cooldown: 0.35, bulletSpeed: 520 },
  axe: { damage: 18, cooldown: 0.65, bulletSpeed: 460 },
  spear: { damage: 14, cooldown: 0.45, bulletSpeed: 580 },
  bow: { damage: 8, cooldown: 0.55, bulletSpeed: 780 },
};

//////////////////////////////
// Helpers
//////////////////////////////

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = src;
    img.onload = () => resolve(img);
  });
}

//////////////////////////////
// Input
//////////////////////////////

const keysDown = new Set();

window.addEventListener("keydown", (e) => {
  keysDown.add(e.code);
  // prevent arrow keys and space from scrolling the page
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  keysDown.delete(e.code);
});

//////////////////////////////
// Entity Classes
//////////////////////////////

class Player {
  constructor(side, x, y, controls, baseImage, weaponSprites, projSprites) {
    this.side = side;
    this.x = x;
    this.y = y;
    this.controls = controls;
    this.baseImage = baseImage;
    this.angle = 0;

    this.speed = PLAYER_SPEED;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.gold = 0;
    this.score = 0;
    this.monstersKilled = 0;

    this.weaponType = "knife";
    this.weaponLevel = 1;
    this.weaponTimer = 0;
    this.weaponSprite = null;
    this.projectileSprite = null;
    this.weaponSprites = weaponSprites;
    this.projSprites = projSprites;

    this.aimDx = side === "left" ? 1 : -1;
    this.aimDy = 0;

    this.setWeapon("knife");
  }

  setWeapon(wtype) {
    const cfg = WEAPON_CONFIG[wtype];
    this.weaponType = wtype;
    this.weaponLevel = 1;
    this.weaponDamage = cfg.damage;
    this.weaponCooldown = cfg.cooldown;
    this.bulletSpeed = cfg.bulletSpeed;
    this.weaponSprite = this.weaponSprites[wtype];
    this.projectileSprite = this.projSprites[wtype];
  }

  upgradeWeapon() {
    this.weaponLevel += 1;
    const cfg = WEAPON_CONFIG[this.weaponType];
    this.weaponDamage = Math.floor(cfg.damage * (1 + 0.4 * (this.weaponLevel - 1)));
    this.weaponCooldown = Math.max(
      0.15,
      cfg.cooldown * Math.pow(0.9, this.weaponLevel - 1)
    );
    this.bulletSpeed = cfg.bulletSpeed * (1 + 0.05 * (this.weaponLevel - 1));
  }

  get alive() {
    return this.hp > 0;
  }

  takeDamage(dmg) {
    this.hp = Math.max(0, this.hp - dmg);
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  updateMovement(dt) {
    let dx = 0;
    let dy = 0;

    if (keysDown.has(this.controls.up)) dy -= 1;
    if (keysDown.has(this.controls.down)) dy += 1;
    if (keysDown.has(this.controls.left)) dx -= 1;
    if (keysDown.has(this.controls.right)) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;

    // stay in own half
    let minX, maxX;
    if (this.side === "left") {
      minX = ARENA_PADDING;
      maxX = FENCE_X - PLAYER_SIZE.w;
    } else {
      minX = FENCE_X + ARENA_PADDING;
      maxX = SCREEN_WIDTH - PLAYER_SIZE.w;
    }
    this.x = clamp(this.x, minX, maxX);
    this.y = clamp(
      this.y,
      ARENA_PADDING,
      SCREEN_HEIGHT - ARENA_PADDING - PLAYER_SIZE.h
    );

    this.weaponTimer = Math.max(0, this.weaponTimer - dt);
  }

  updateOrientation(target) {
    if (!target) return;
    const px = this.x + PLAYER_SIZE.w / 2;
    const py = this.y + PLAYER_SIZE.h / 2;
    const tx = target.x + target.w / 2;
    const ty = target.y + target.h / 2;
    const dx = tx - px;
    const dy = ty - py;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    this.aimDx = dx / dist;
    this.aimDy = dy / dist;
    this.angle = -Math.atan2(this.aimDy, this.aimDx); // radians, negative for canvas rotation
  }

  tryAttack(target, bullets) {
    if (!target || this.weaponTimer > 0 || !this.projectileSprite) return;

    const px = this.x + PLAYER_SIZE.w / 2;
    const py = this.y + PLAYER_SIZE.h / 2;
    const bx = px + this.aimDx * 24;
    const by = py + this.aimDy * 24;

    bullets.push(
      new Bullet(
        this.side,
        bx,
        by,
        this.aimDx,
        this.aimDy,
        this.weaponDamage,
        this.bulletSpeed,
        this.projectileSprite,
        this.weaponType
      )
    );
    this.weaponTimer = this.weaponCooldown;
  }

  draw(ctx) {
    const px = this.x + PLAYER_SIZE.w / 2;
    const py = this.y + PLAYER_SIZE.h / 2;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.angle);
    ctx.drawImage(
      this.baseImage,
      -PLAYER_SIZE.w / 2,
      -PLAYER_SIZE.h / 2,
      PLAYER_SIZE.w,
      PLAYER_SIZE.h
    );
    ctx.restore();
  }

  drawWeaponInHand(ctx) {
    if (!this.weaponSprite) return;

    const px = this.x + PLAYER_SIZE.w / 2;
    const py = this.y + PLAYER_SIZE.h / 2;
    const offset = 22;
    const wx = px + this.aimDx * offset;
    const wy = py + this.aimDy * offset;

    const angle = -Math.atan2(this.aimDy, this.aimDx);

    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(angle);
    const w = 26;
    const h = 26;
    ctx.drawImage(this.weaponSprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

class Monster {
  constructor(side, type, x, y, hp, speed, goldRange, img) {
    this.side = side;
    this.type = type;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.speed = speed;
    this.goldRange = goldRange;
    this.img = img;
    this.w = 32;
    this.h = 32;
    this.fireCd = type === "spitter" ? 2.5 : null;
  }

  get dead() {
    return this.hp <= 0;
  }

  goldDrop() {
    const [a, b] = this.goldRange;
    return randInt(a, b);
  }

  takeDamage(dmg) {
    this.hp -= dmg;
  }

  update(dt, player, enemySpits) {
    if (this.type === "spitter") {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        this.fireCd = randInt(14, 24) / 10; // 1.4 - 2.4
        const px = this.x + this.w / 2;
        const py = this.y + this.h / 2;
        const tx = player.x + PLAYER_SIZE.w / 2;
        const ty = player.y + PLAYER_SIZE.h / 2;
        let dx = tx - px;
        let dy = ty - py;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          dx /= dist;
          dy /= dist;
        }
        enemySpits.push(new EnemySpit(this.side, px, py, dx, dy));
      }
    }

    const px = player.x + PLAYER_SIZE.w / 2;
    const py = player.y + PLAYER_SIZE.h / 2;
    let dx = px - (this.x + this.w / 2);
    let dy = py - (this.y + this.h / 2);
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    dx /= dist;
    dy /= dist;
    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;
  }

  draw(ctx) {
    ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
  }
}

class EnemySpit {
  constructor(side, x, y, dx, dy) {
    this.side = side;
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.speed = 310;
    this.damage = 6;
    this.lifetime = 2.2;
    this.r = 5;
  }

  update(dt) {
    this.lifetime -= dt;
    this.x += this.dx * this.speed * dt;
    this.y += this.dy * this.speed * dt;
  }

  get dead() {
    return this.lifetime <= 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "rgb(180,240,80)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  get rect() {
    return {
      x: this.x - this.r,
      y: this.y - this.r,
      w: this.r * 2,
      h: this.r * 2,
    };
  }
}

class Bullet {
  constructor(side, x, y, dx, dy, dmg, speed, sprite, wtype) {
    this.side = side;
    this.x = x;
    this.y = y;
    this.dx = dx;
    this.dy = dy;
    this.damage = dmg;
    this.speed = speed;
    this.sprite = sprite;
    this.weaponType = wtype;
    this.lifetime = 1.7;
    this.trail = [];
    this.monstersHit = new Set();

    const pierceMap = { knife: 0, axe: 2, spear: 999, bow: 1 };
    this.pierce = pierceMap[wtype] ?? 0;
  }

  update(dt) {
    this.lifetime -= dt;
    if (this.lifetime <= 0) return;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();

    this.x += this.dx * this.speed * dt;
    this.y += this.dy * this.speed * dt;
  }

  get dead() {
    if (this.lifetime <= 0) return true;
    // fence crossing
    if (this.side === "left" && this.x > FENCE_X) return true;
    if (this.side === "right" && this.x < FENCE_X) return true;
    // bounds
    if (this.x < -50 || this.x > SCREEN_WIDTH + 50 || this.y < -50 || this.y > SCREEN_HEIGHT + 50)
      return true;
    return false;
  }

  get rect() {
    return { x: this.x - 14, y: this.y - 14, w: 28, h: 28 };
  }

  draw(ctx) {
    // trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = (i / this.trail.length) * 0.7;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const angle = -Math.atan2(this.dy, this.dx);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.drawImage(this.sprite, -14, -14, 28, 28);
    ctx.restore();
  }
}

class HitEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.age = 0;
    this.lifetime = 0.18;
  }

  update(dt) {
    this.age += dt;
  }

  get dead() {
    return this.age >= this.lifetime;
  }

  draw(ctx) {
    const alpha = 1 - this.age / this.lifetime;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgb(255,240,100)";
    ctx.beginPath();
    ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class GoldDrop {
  constructor(x, y, amount) {
    this.x = x;
    this.y = y;
    this.amount = amount;
    this.r = 7;
  }

  get rect() {
    return {
      x: this.x - this.r,
      y: this.y - this.r,
      w: this.r * 2,
      h: this.r * 2,
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgb(120,80,0)";
    ctx.stroke();
    ctx.restore();
  }
}

class HealthPickup {
  constructor(x, y, healAmount) {
    this.x = x;
    this.y = y;
    this.healAmount = healAmount;
    this.w = 16;
    this.h = 16;
  }

  get rect() {
    return { x: this.x - 8, y: this.y - 8, w: 16, h: 16 };
  }

  draw(ctx) {
    const x = this.x;
    const y = this.y;
    ctx.save();
    ctx.fillStyle = "rgb(240,70,90)";
    ctx.beginPath();
    ctx.arc(x - 3, y - 1, 5, 0, Math.PI * 2);
    ctx.arc(x + 3, y - 1, 5, 0, Math.PI * 2);
    ctx.moveTo(x - 6, y + 1);
    ctx.lineTo(x + 6, y + 1);
    ctx.lineTo(x, y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

class SpawnWarning {
  constructor(game, side, type, x, y, hp, speed, goldRange, img) {
    this.game = game;
    this.side = side;
    this.type = type;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.speed = speed;
    this.goldRange = goldRange;
    this.img = img;
    this.w = 32;
    this.h = 32;
    this.timer = 0.5;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.game.spawnedFromWarning(this);
    }
  }

  get dead() {
    return this.timer <= 0;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(this.img, this.x, this.y, this.w, this.h);
    ctx.restore();
  }
}

//////////////////////////////
// Game
//////////////////////////////

class Game {
  constructor(ctx, assets) {
    this.ctx = ctx;
    this.assets = assets;

    this.state = "weapon_select"; // weapon_select, playing, shop, game_over
    this.round = 1;
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;

    this.spawnCdL = 0;
    this.spawnCdR = 0;
    this.spawnInterval = 1.8;
    this.baseTarget = 6;
    this.baseSpawnedL = 0;
    this.baseSpawnedR = 0;

    this.extraQueueL = 0;
    this.extraQueueR = 0;
    this.extraActiveL = 0;
    this.extraActiveR = 0;
    this.extraSpawnedL = 0;
    this.extraSpawnedR = 0;

    this.leftChoice = null;
    this.rightChoice = null;
    this.leftReady = false;
    this.rightReady = false;
    this.scoreboardDisplay = false;

    this.monsters = [];
    this.bullets = [];
    this.enemySpits = [];
    this.effects = [];
    this.goldDrops = [];
    this.healthPickups = [];
    this.spawnWarnings = [];

    this.leftControls = {
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
    };
    this.rightControls = {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
    };

    this.pLeft = new Player(
      "left",
      SCREEN_WIDTH / 4,
      SCREEN_HEIGHT / 2,
      this.leftControls,
      assets.player1,
      assets.weaponSprites,
      assets.projSprites
    );
    this.pRight = new Player(
      "right",
      (3 * SCREEN_WIDTH) / 4,
      SCREEN_HEIGHT / 2,
      this.rightControls,
      assets.player2,
      assets.weaponSprites,
      assets.projSprites
    );

    // input handling for non-movement keys
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
  }

  resetMatch() {
    this.state = "weapon_select";
    this.round = 1;
    this.waveLeft = WAVE_TIME;
    this.shopLeft = SHOP_TIME;

    this.spawnCdL = 0;
    this.spawnCdR = 0;
    this.spawnInterval = 1.8;
    this.baseTarget = 6;
    this.baseSpawnedL = 0;
    this.baseSpawnedR = 0;

    this.extraQueueL = 0;
    this.extraQueueR = 0;
    this.extraActiveL = 0;
    this.extraActiveR = 0;
    this.extraSpawnedL = 0;
    this.extraSpawnedR = 0;

    this.leftChoice = null;
    this.rightChoice = null;
    this.leftReady = false;
    this.rightReady = false;
    this.scoreboardDisplay = false;

    this.monsters = [];
    this.bullets = [];
    this.enemySpits = [];
    this.effects = [];
    this.goldDrops = [];
    this.healthPickups = [];
    this.spawnWarnings = [];

    this.pLeft = new Player(
      "left",
      SCREEN_WIDTH / 4,
      SCREEN_HEIGHT / 2,
      this.leftControls,
      this.assets.player1,
      this.assets.weaponSprites,
      this.assets.projSprites
    );
    this.pRight = new Player(
      "right",
      (3 * SCREEN_WIDTH) / 4,
      SCREEN_HEIGHT / 2,
      this.rightControls,
      this.assets.player2,
      this.assets.weaponSprites,
      this.assets.projSprites
    );
  }

  handleKeyDown(e) {
    if (this.state === "weapon_select") {
      this.handleWeaponSelectKeys(e);
    } else if (this.state === "shop") {
      this.handleShopKeys(e);
    } else if (this.state === "game_over") {
      if (e.code === "KeyR" || e.code === "Enter") {
        this.resetMatch();
      }
    }
  }

  handleWeaponSelectKeys(e) {
    const key = e.code;
    // P1: 1 2 3 4
    if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(key)) {
      const map = {
        Digit1: "knife",
        Digit2: "axe",
        Digit3: "spear",
        Digit4: "bow",
      };
      const w = map[key];
      this.leftChoice = w;
      this.pLeft.setWeapon(w);
    }
    // P2: 7 8 9 0
    else if (["Digit7", "Digit8", "Digit9", "Digit0"].includes(key)) {
      const map = {
        Digit7: "knife",
        Digit8: "axe",
        Digit9: "spear",
        Digit0: "bow",
      };
      const w = map[key];
      this.rightChoice = w;
      this.pRight.setWeapon(w);
    } else if (key === "Enter") {
      if (this.leftChoice && this.rightChoice) {
        this.startWave();
      }
    }
  }

  handleShopKeys(e) {
    const key = e.code;
    // P1 shop: Q (upgrade), W (send mobs)
    if (key === "KeyQ" && this.pLeft.gold >= UPGRADE_COST) {
      this.pLeft.gold -= UPGRADE_COST;
      this.pLeft.upgradeWeapon();
    } else if (key === "KeyW" && this.pLeft.gold >= EXTRA_MONSTERS_COST) {
      this.pLeft.gold -= EXTRA_MONSTERS_COST;
      this.extraQueueR += EXTRA_MONSTERS_AMOUNT;
    }
    // P2 shop: I (upgrade), O (send mobs)
    else if (key === "KeyI" && this.pRight.gold >= UPGRADE_COST) {
      this.pRight.gold -= UPGRADE_COST;
      this.pRight.upgradeWeapon();
    } else if (key === "KeyO" && this.pRight.gold >= EXTRA_MONSTERS_COST) {
      this.pRight.gold -= EXTRA_MONSTERS_COST;
      this.extraQueueL += EXTRA_MONSTERS_AMOUNT;
    } else if (key === "Space") {
      this.leftReady = true;
      this.rightReady = true;
    }
  }

  startWave() {
    this.state = "playing";
    this.waveLeft = WAVE_TIME;

    if (this.round === 1) {
      this.spawnInterval = 1.8 / 3.0;
      this.baseTarget = 6 * 3;
    } else {
      this.spawnInterval = Math.max(0.8, 1.8 - 0.15 * (this.round - 1));
      this.baseTarget = 6 + 3 * (this.round - 1);
    }

    this.spawnCdL = 1.0;
    this.spawnCdR = 1.0;
    this.baseSpawnedL = 0;
    this.baseSpawnedR = 0;

    this.extraActiveL = this.extraQueueL;
    this.extraActiveR = this.extraQueueR;
    this.extraSpawnedL = 0;
    this.extraSpawnedR = 0;
    this.extraQueueL = 0;
    this.extraQueueR = 0;

    this.leftReady = false;
    this.rightReady = false;
    this.scoreboardDisplay = false;

    this.monsters = [];
    this.bullets = [];
    this.enemySpits = [];
    this.effects = [];
    this.goldDrops = [];
    this.healthPickups = [];
    this.spawnWarnings = [];
  }

  startShop() {
    this.state = "shop";
    this.shopLeft = SHOP_TIME;
    this.monsters = [];
    this.bullets = [];
    this.enemySpits = [];
    this.effects = [];
    this.spawnWarnings = [];
    this.scoreboardDisplay = true;
  }

  startGameOver() {
    this.state = "game_over";
    this.monsters = [];
    this.bullets = [];
    this.enemySpits = [];
    this.effects = [];
    this.spawnWarnings = [];
  }

  spawnMonsterOnSide(side) {
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

    const cfg = MONSTER_TYPES[type];
    const x =
      side === "left"
        ? randInt(ARENA_PADDING, FENCE_X - ARENA_PADDING - 32)
        : randInt(FENCE_X + ARENA_PADDING, SCREEN_WIDTH - ARENA_PADDING - 32);
    const y = randInt(ARENA_PADDING, SCREEN_HEIGHT - ARENA_PADDING - 32);
    const hp = cfg.hp + (this.round - 1) * 2;
    const speed = cfg.speed;
    const goldRange = cfg.gold;
    const img = this.assets.monsters[type];

    const warn = new SpawnWarning(
      this,
      side,
      type,
      x,
      y,
      hp,
      speed,
      goldRange,
      img
    );
    this.spawnWarnings.push(warn);
  }

  spawnedFromWarning(warn) {
    // called when SpawnWarning timer reaches 0
    const m = new Monster(
      warn.side,
      warn.type,
      warn.x,
      warn.y,
      warn.hp,
      warn.speed,
      warn.goldRange,
      warn.img
    );
    this.monsters.push(m);
  }

  nearestMonster(side) {
    const p = side === "left" ? this.pLeft : this.pRight;
    const px = p.x + PLAYER_SIZE.w / 2;
    const py = p.y + PLAYER_SIZE.h / 2;
    let best = null;
    let bestD2 = Infinity;

    for (const m of this.monsters) {
      if (m.side !== side) continue;
      const cx = m.x + m.w / 2;
      const cy = m.y + m.h / 2;
      const dx = cx - px;
      const dy = cy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = m;
      }
    }
    return best;
  }

  rectsIntersect(a, b) {
    return !(
      a.x + a.w < b.x ||
      a.x > b.x + b.w ||
      a.y + a.h < b.y ||
      a.y > b.y + b.h
    );
  }

  update(dt) {
    if (this.state === "weapon_select") {
      // nothing time-based here; just drawing
      return;
    } else if (this.state === "playing") {
      this.updatePlaying(dt);
    } else if (this.state === "shop") {
      this.updateShop(dt);
    } else if (this.state === "game_over") {
      // no time-based auto restart
    }
  }

  updatePlaying(dt) {
    this.pLeft.updateMovement(dt);
    this.pRight.updateMovement(dt);

    const tLeft = this.nearestMonster("left");
    const tRight = this.nearestMonster("right");
    this.pLeft.updateOrientation(tLeft);
    this.pRight.updateOrientation(tRight);

    this.pLeft.tryAttack(tLeft, this.bullets);
    this.pRight.tryAttack(tRight, this.bullets);

    // spawn baseline
    this.spawnCdL -= dt;
    this.spawnCdR -= dt;
    if (this.spawnCdL <= 0 && this.baseSpawnedL < this.baseTarget) {
      this.spawnMonsterOnSide("left");
      this.spawnCdL = this.spawnInterval;
      this.baseSpawnedL++;
    }
    if (this.spawnCdR <= 0 && this.baseSpawnedR < this.baseTarget) {
      this.spawnMonsterOnSide("right");
      this.spawnCdR = this.spawnInterval;
      this.baseSpawnedR++;
    }

    // distribute extra monsters
    const elapsedFrac = (WAVE_TIME - this.waveLeft) / WAVE_TIME;
    const targL = Math.floor(this.extraActiveL * elapsedFrac);
    while (this.extraSpawnedL < targL) {
      this.spawnMonsterOnSide("left");
      this.extraSpawnedL++;
    }
    const targR = Math.floor(this.extraActiveR * elapsedFrac);
    while (this.extraSpawnedR < targR) {
      this.spawnMonsterOnSide("right");
      this.extraSpawnedR++;
    }

    // update spawn warnings
    for (const w of this.spawnWarnings) w.update(dt);
    this.spawnWarnings = this.spawnWarnings.filter((w) => !w.dead);

    // update monsters
    for (const m of this.monsters) {
      const p = m.side === "left" ? this.pLeft : this.pRight;
      m.update(dt, p, this.enemySpits);
    }

    // update bullets/spits/effects
    for (const b of this.bullets) b.update(dt);
    for (const s of this.enemySpits) s.update(dt);
    for (const e of this.effects) e.update(dt);

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemySpits = this.enemySpits.filter((s) => !s.dead);
    this.effects = this.effects.filter((e) => !e.dead);

    // collisions: bullets vs monsters
    for (const b of this.bullets) {
      const br = b.rect;
      for (const m of this.monsters) {
        if (b.side !== m.side) continue;
        const mr = { x: m.x, y: m.y, w: m.w, h: m.h };
        if (!this.rectsIntersect(br, mr)) continue;
        if (b.monstersHit.has(m)) continue;

        m.takeDamage(b.damage);
        this.effects.push(new HitEffect(m.x + m.w / 2, m.y + m.h / 2));
        b.monstersHit.add(m);
        b.pierce -= 1;
        if (b.pierce < 0) {
          b.lifetime = 0; // mark as dead
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    // enemy spit vs players
    for (const sp of this.enemySpits) {
      const pr = sp.side === "right"
        ? { x: this.pLeft.x, y: this.pLeft.y, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h }
        : { x: this.pRight.x, y: this.pRight.y, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h };

      if (this.rectsIntersect(sp.rect, pr)) {
        if (sp.side === "right") this.pLeft.takeDamage(sp.damage);
        else this.pRight.takeDamage(sp.damage);
        sp.lifetime = 0;
      }
    }
    this.enemySpits = this.enemySpits.filter((s) => !s.dead);

    // monsters contact damage
    for (const m of this.monsters) {
      const pr =
        m.side === "left"
          ? { x: this.pLeft.x, y: this.pLeft.y, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h }
          : { x: this.pRight.x, y: this.pRight.y, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h };
      const mr = { x: m.x, y: m.y, w: m.w, h: m.h };
      if (this.rectsIntersect(pr, mr)) {
        if (m.side === "left") this.pLeft.takeDamage(5);
        else this.pRight.takeDamage(5);
      }
    }

    // deaths: gold + score + chance to drop heart
    const survivors = [];
    for (const m of this.monsters) {
      if (!m.dead) {
        survivors.push(m);
      } else {
        const amt = m.goldDrop();
        const p = m.side === "left" ? this.pLeft : this.pRight;
        p.gold += amt;
        p.score += amt * 5;
        p.monstersKilled += 1;

        this.goldDrops.push(
          new GoldDrop(m.x + m.w / 2, m.y + m.h / 2, amt)
        );
        if (Math.random() < HEART_DROP_CHANCE) {
          this.healthPickups.push(
            new HealthPickup(m.x + m.w / 2, m.y + m.h / 2, HEART_HEAL_AMOUNT)
          );
        }
      }
    }
    this.monsters = survivors;

    // wave timer
    this.waveLeft -= dt;

    if (!this.pLeft.alive || !this.pRight.alive) {
      this.startGameOver();
      return;
    }

    if (this.waveLeft <= 0) {
      this.round += 1;
      this.startShop();
      return;
    }

    // collect gold
    const pRects = [
      { p: this.pLeft, rect: { x: this.pLeft.x, y: this.pLeft.y, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h } },
      { p: this.pRight, rect: { x: this.pRight.x, y: this.pRight.y, w: PLAYER_SIZE.w, h: PLAYER_SIZE.h } },
    ];
    const newGold = [];
    for (const g of this.goldDrops) {
      const gr = g.rect;
      let picked = false;
      for (const { p, rect } of pRects) {
        if (this.rectsIntersect(gr, rect)) {
          p.gold += g.amount;
          picked = true;
          break;
        }
      }
      if (!picked) newGold.push(g);
    }
    this.goldDrops = newGold;

    // collect hearts
    const newHearts = [];
    for (const h of this.healthPickups) {
      const hr = h.rect;
      let picked = false;
      for (const { p, rect } of pRects) {
        if (this.rectsIntersect(hr, rect)) {
          p.heal(h.healAmount);
          picked = true;
          break;
        }
      }
      if (!picked) newHearts.push(h);
    }
    this.healthPickups = newHearts;
  }

  updateShop(dt) {
    this.shopLeft -= dt;
    if (this.shopLeft <= 0 || (this.leftReady && this.rightReady)) {
      this.scoreboardDisplay = false;
      this.startWave();
    }
  }

  //////////////////////////////
  // Drawing
  //////////////////////////////

  drawBackground() {
    const ctx = this.ctx;
    const ground = this.assets.ground;
    const fence = this.assets.fence;

    for (let x = 0; x < SCREEN_WIDTH; x += TILE_SIZE) {
      for (let y = 0; y < SCREEN_HEIGHT; y += TILE_SIZE) {
        ctx.drawImage(ground, x, y, TILE_SIZE, TILE_SIZE);
      }
    }
    for (let y = 0; y < SCREEN_HEIGHT; y += TILE_SIZE) {
      ctx.drawImage(fence, FENCE_X - TILE_SIZE / 2, y, TILE_SIZE, TILE_SIZE);
    }
  }

  drawPlayerBars() {
    const ctx = this.ctx;
    const barW = 160;

    const drawPlayer = (p, x) => {
      const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 0;
      ctx.fillStyle = "rgb(60,60,60)";
      ctx.fillRect(x, 20, barW, 14);
      ctx.fillStyle = "rgb(80,220,80)";
      ctx.fillRect(x, 20, barW * ratio, 14);

      ctx.fillStyle = "rgb(240,240,240)";
      ctx.font = "14px Arial";
      ctx.fillText(`HP ${p.hp}`, x, 16);

      ctx.fillStyle = "rgb(250,215,0)";
      ctx.fillText(`G ${p.gold}`, x, 38);

      ctx.fillStyle = "rgb(240,240,240)";
      ctx.fillText(
        `${p.weaponType.toUpperCase()} L${p.weaponLevel}`,
        x,
        54
      );
    };

    drawPlayer(this.pLeft, 30);
    drawPlayer(this.pRight, SCREEN_WIDTH - 210);
  }

  drawPlaying() {
    const ctx = this.ctx;
    this.drawBackground();

    // spawn warnings
    for (const w of this.spawnWarnings) w.draw(ctx);

    // monsters
    for (const m of this.monsters) m.draw(ctx);

    // bullets/spits/effects/gold/hearts
    for (const b of this.bullets) b.draw(ctx);
    for (const s of this.enemySpits) s.draw(ctx);
    for (const e of this.effects) e.draw(ctx);
    for (const g of this.goldDrops) g.draw(ctx);
    for (const h of this.healthPickups) h.draw(ctx);

    // players
    this.pLeft.draw(ctx);
    this.pRight.draw(ctx);
    this.pLeft.drawWeaponInHand(ctx);
    this.pRight.drawWeaponInHand(ctx);

    this.drawPlayerBars();

    ctx.fillStyle = "white";
    ctx.font = "24px Arial";
    const rt = `Round ${this.round}`;
    const rtW = ctx.measureText(rt).width;
    ctx.fillText(rt, SCREEN_WIDTH / 2 - rtW / 2, 24);

    ctx.font = "16px Arial";
    const tt = `${Math.floor(this.waveLeft)}s`;
    const ttW = ctx.measureText(tt).width;
    ctx.fillText(tt, SCREEN_WIDTH / 2 - ttW / 2, 44);
  }

  drawWeaponSelect() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgb(25,25,45)";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = "white";
    ctx.font = "28px Arial";
    const title = "Choose Weapons";
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, SCREEN_WIDTH / 2 - tw / 2, 40);

    ctx.font = "16px Arial";
    const sub =
      "P1: 1=Knife,2=Axe,3=Spear,4=Bow   |   P2: 7=Knife,8=Axe,9=Spear,0=Bow   |   ENTER to start";
    const sw = ctx.measureText(sub).width;
    ctx.fillText(sub, SCREEN_WIDTH / 2 - sw / 2, 80);

    const drawPanel = (x, label, choice, playerImg) => {
      let y = 140;
      ctx.fillStyle = "white";
      ctx.font = "22px Arial";
      ctx.fillText(label, x, y);
      y += 40;

      ctx.font = "16px Arial";
      if (choice) {
        ctx.fillStyle = "rgb(200,230,255)";
        ctx.fillText(`Selected: ${choice.toUpperCase()}`, x, y);
      } else {
        ctx.fillStyle = "rgb(200,80,80)";
        ctx.fillText("Selected: [none]", x, y);
      }
      y += 30;

      if (choice && this.assets.weaponSprites[choice]) {
        ctx.drawImage(this.assets.weaponSprites[choice], x, y, 26, 26);
      }

      if (playerImg) {
        ctx.drawImage(playerImg, x + 80, y - 10, PLAYER_SIZE.w, PLAYER_SIZE.h);
      }
    };

    drawPanel(100, "Player 1 (WASD)", this.leftChoice, this.assets.player1);
    drawPanel(
      SCREEN_WIDTH - 320,
      "Player 2 (Arrows)",
      this.rightChoice,
      this.assets.player2
    );
  }

  drawShop() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgb(30,30,50)";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = "white";
    ctx.font = "28px Arial";
    const title = `SHOP - Round ${this.round}`;
    const tw = ctx.measureText(title).width;
    ctx.fillText(title, SCREEN_WIDTH / 2 - tw / 2, 30);

    ctx.font = "16px Arial";
    const sub =
      "Controls: P1 Q=Upgrade, W=Send mobs | P2 I=Upgrade, O=Send mobs | SPACE when both ready";
    const sw = ctx.measureText(sub).width;
    ctx.fillText(sub, SCREEN_WIDTH / 2 - sw / 2, 60);

    // reuse HP/gold/weapon bars
    this.drawPlayerBars();

    if (this.scoreboardDisplay) {
      ctx.fillStyle = "rgb(255,255,100)";
      ctx.font = "16px Arial";
      ctx.fillText(`P1 Score: ${this.pLeft.score}`, 100, 300);
      ctx.fillText(`P2 Score: ${this.pRight.score}`, SCREEN_WIDTH - 260, 300);
    }

    const leftLines = [
      "Player 1 (WASD):",
      `[Q] Upgrade weapon (${UPGRADE_COST} gold)`,
      `[W] Send +${EXTRA_MONSTERS_AMOUNT} monsters to P2 (${EXTRA_MONSTERS_COST} gold)`,
      `Extra mobs queued on P2: ${this.extraQueueR}`,
    ];
    let lx = 80;
    let ly = 340;
    ctx.font = "16px Arial";
    ctx.fillStyle = "rgb(250,250,250)";
    for (const line of leftLines) {
      ctx.fillText(line, lx, ly);
      ly += 22;
    }

    const rightLines = [
      "Player 2 (Arrows):",
      `[I] Upgrade weapon (${UPGRADE_COST} gold)`,
      `[O] Send +${EXTRA_MONSTERS_AMOUNT} monsters to P1 (${EXTRA_MONSTERS_COST} gold)`,
      `Extra mobs queued on P1: ${this.extraQueueL}`,
    ];
    let rx = SCREEN_WIDTH - 380;
    let ry = 340;
    for (const line of rightLines) {
      ctx.fillText(line, rx, ry);
      ry += 22;
    }

    ctx.fillStyle = "rgb(210,210,210)";
    const hint = "Press SPACE when both players are done shopping.";
    const hw = ctx.measureText(hint).width;
    ctx.fillText(hint, SCREEN_WIDTH / 2 - hw / 2, SCREEN_HEIGHT - 40);
  }

  drawGameOver() {
    const ctx = this.ctx;
    ctx.fillStyle = "rgb(10,10,25)";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = "white";
    ctx.font = "28px Arial";
    const t = "GAME OVER";
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, SCREEN_WIDTH / 2 - tw / 2, 40);

    let winnerText = "Game Over";
    if (this.pLeft.alive && !this.pRight.alive) {
      winnerText = "Player 1 (WASD) wins!";
    } else if (!this.pLeft.alive && this.pRight.alive) {
      winnerText = "Player 2 (Arrows) wins!";
    } else if (!this.pLeft.alive && !this.pRight.alive) {
      winnerText = "It's a draw! Both players fell.";
    }

    ctx.font = "18px Arial";
    const ww = ctx.measureText(winnerText).width;
    ctx.fillStyle = "rgb(230,230,230)";
    ctx.fillText(winnerText, SCREEN_WIDTH / 2 - ww / 2, 80);

    const lines = [
      `Player 1 (WASD):  Monsters killed: ${this.pLeft.monstersKilled}  |  Gold: ${this.pLeft.gold}`,
      `Player 2 (Arrows):  Monsters killed: ${this.pRight.monstersKilled}  |  Gold: ${this.pRight.gold}`,
    ];
    let y = 140;
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      ctx.fillText(line, SCREEN_WIDTH / 2 - lw / 2, y);
      y += 30;
    }

    ctx.fillStyle = "rgb(210,210,210)";
    const hint = "Press R or ENTER to restart from Round 1 (new weapon select).";
    const hw = ctx.measureText(hint).width;
    ctx.fillText(hint, SCREEN_WIDTH / 2 - hw / 2, SCREEN_HEIGHT - 60);

    ctx.fillStyle = "rgb(180,180,180)";
    const qhint = "Close the tab to quit.";
    const qw = ctx.measureText(qhint).width;
    ctx.fillText(qhint, SCREEN_WIDTH / 2 - qw / 2, SCREEN_HEIGHT - 35);
  }

  draw() {
    if (this.state === "weapon_select") this.drawWeaponSelect();
    else if (this.state === "playing") this.drawPlaying();
    else if (this.state === "shop") this.drawShop();
    else if (this.state === "game_over") this.drawGameOver();
  }
}

//////////////////////////////
// Bootstrapping
//////////////////////////////

async function main() {
  const canvas = document.getElementById("game");
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  const ctx = canvas.getContext("2d");

  // load assets
  const [
    player1,
    player2,
    knife,
    axe,
    spear,
    bow,
    arrow,
    slime,
    fast,
    tank,
    spitter,
    ground,
    fence,
  ] = await Promise.all([
    loadImage("assets/characters/player1.png"),
    loadImage("assets/characters/player2.png"),
    loadImage("assets/weapons/knife.png"),
    loadImage("assets/weapons/axe.png"),
    loadImage("assets/weapons/spear.png"),
    loadImage("assets/weapons/bow.png"),
    loadImage("assets/weapons/arrow.png").catch(() => null),
    loadImage("assets/monsters/slime.png"),
    loadImage("assets/monsters/fast.png"),
    loadImage("assets/monsters/tank.png"),
    loadImage("assets/monsters/spitter.png"),
    loadImage("assets/tiles/ground.png"),
    loadImage("assets/tiles/fence.png"),
  ]);

  const weaponSprites = { knife, axe, spear, bow };
  const projSprites = {
    knife: knife,
    axe: axe,
    spear: spear,
    bow: arrow || bow,
  };

  const monsters = { slime, fast, tank, spitter };

  const assets = {
    player1,
    player2,
    weaponSprites,
    projSprites,
    monsters,
    ground,
    fence,
  };

  const game = new Game(ctx, assets);

  let lastTime = performance.now();

  function loop(t) {
    const dt = (t - lastTime) / 1000;
    lastTime = t;

    // cap dt at something sane (tab switching, etc.)
    const clampedDt = Math.min(dt, 0.05);

    game.update(clampedDt);
    game.draw();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

window.addEventListener("load", main);
