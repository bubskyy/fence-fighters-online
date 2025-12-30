// public/client.js
//
// Browser client: renders server-authoritative state, sends input/actions via WebSocket.
// Designed to be resolution-independent: the server simulates in a fixed "world" size,
// the client scales to fit your screen.

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

// Server world size (must match src/game/core.js)
const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 600;
const FENCE_X = WORLD_WIDTH / 2;

let renderScale = 1;
let cssWidth = 960;
let cssHeight = 540;

// -----------------------------------------------------
// Visual scale tweaks (easy to tune)
// -----------------------------------------------------
// Want bigger/smaller characters, monsters, weapons, bullets, pickups?
// Change these numbers.
const PLAYER_SCALE = 1.5;          // 150% bigger players (requested)
const MONSTER_SCALE = 1.875;       // was 2.5; now -25% (requested)
const WEAPON_SCALE = PLAYER_SCALE; // keep weapon size tied to player size
// Pickups (coins/hearts/potions)
const GOLD_SIZE = 50;         // coin size in world pixels
const HEART_SIZE = 50;        // heart size in world pixels
const GREEN_POTION_SIZE = 50; // potion size in world pixels

// -----------------------------------------------------
// Sprite-sheet animation (client-side only)
// -----------------------------------------------------

const PLAYER_SHEETS = {
  p1: {
    cols: 9,
    rows: 4,
    fps: 12, // animation speed while walking
    // User-provided order:
    // row 0: up, row 1: left, row 2: down, row 3: right
    rowMap: { up: 0, left: 1, down: 2, right: 3 },
  },
  p2: {
    cols: 9,
    rows: 4,
    fps: 12,
    rowMap: { up: 0, left: 1, down: 2, right: 3 },
  },
};

// Stores per-player animation state keyed by player id
const playerAnim = new Map(); // id -> { lastX, lastY, t, frame, dirRow }

/** Get or init animation state for a player id. */
function getAnimState(id) {
  let a = playerAnim.get(id);
  if (!a) {
    a = { lastX: null, lastY: null, t: 0, frame: 0, dirRow: 0 };
    playerAnim.set(id, a);
  }
  return a;
}

/** Decide sprite row based on movement direction. */
function directionToRow(dx, dy, rowMap) {
  // rowMap: { up, left, down, right }
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? rowMap.left : rowMap.right;
  return dy < 0 ? rowMap.up : rowMap.down;
}

/** Draw one frame from a sprite sheet centered at (x,y). */
function drawSpriteFrame(img, sheet, frameIndex, rowIndex, x, y, size, flipX = false) {
  // Compute frame size from the actual image to avoid "half/duplicate sprite" bugs
  // when the sheet PNG dimensions don't match hardcoded numbers.
  if (!sheet.frameW || !sheet.frameH) {
    sheet.frameW = Math.floor(img.naturalWidth / sheet.cols);
    sheet.frameH = Math.floor(img.naturalHeight / sheet.rows);
  }

  const col = frameIndex % sheet.cols;
  const sx = col * sheet.frameW;
  const sy = rowIndex * sheet.frameH;

  ctx.save();

  if (flipX) {
    // Flip around the draw center (x)
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  ctx.drawImage(
    img,
    sx, sy, sheet.frameW, sheet.frameH,
    x - size / 2, y - size / 2,
    size, size
  );

  ctx.restore();
}

// -----------------------------------------------------
// Assets
// -----------------------------------------------------

const assetPaths = {
  ground: "assets/tiles/ground.png",
  fence: "assets/tiles/fence.png",

  player1: "assets/characters/player1.png",
  player1_walk: "assets/characters/baldricfrontwalksheet.png",
  player2: "assets/characters/player2.png",
  player2_walk: "assets/characters/mage_walking.png",

  slime: "assets/monsters/slime.png",
  fast: "assets/monsters/fast.png",
  tank: "assets/monsters/tank.png",
  spitter: "assets/monsters/spitter.png",
  spitter_projectile: "assets/monsters/spitter_projectile.png",

  // boss placeholders (every 5th round)
  boss1: "assets/monsters/boss1.png",
  boss2: "assets/monsters/boss2.png",

  // weapon sprites
  knife: "assets/weapons/knife.png",
  axe: "assets/weapons/axe.png",
  spear: "assets/weapons/spear.png",
  bow: "assets/weapons/bow.png",

  // projectile sprite
  arrow: "assets/weapons/arrow.png",

  gold: "assets/pickups/gold.png",
  heart: "assets/pickups/heart.png",
  green_potion: "assets/pickups/green_potion.png",
  grenade: "assets/pickups/grenade.png",
};

const assets = {};
let assetsLoaded = false;

function loadAssets(paths) {
  const entries = Object.entries(paths);
  let loaded = 0;
  const total = entries.length;

  return new Promise((resolve) => {
    entries.forEach(([key, url]) => {
      const img = new Image();
      img.onload = () => {
        loaded += 1;
        if (loaded === total) resolve();
      };
      img.onerror = () => {
        // Missing assets should not break the game; we fall back to shapes.
        loaded += 1;
        if (loaded === total) resolve();
      };
      img.src = url;
      assets[key] = img;
    });
  });
}

// -----------------------------------------------------
// Canvas sizing (responsive)
// -----------------------------------------------------

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;

  // Leave some room for status + hint text
  const maxW = Math.max(320, Math.floor(window.innerWidth * 0.99));
  const maxH = Math.max(240, Math.floor(window.innerHeight * 0.95));

  renderScale = Math.min(maxW / WORLD_WIDTH, maxH / WORLD_HEIGHT);
  // Make the game fill the screen more (user feedback: "screen too small").
  renderScale = Math.max(0.6, Math.min(renderScale, 1.25));
  renderScale = Math.max(0.5, Math.min(renderScale, 2.5));

  cssWidth = Math.floor(WORLD_WIDTH * renderScale);
  cssHeight = Math.floor(WORLD_HEIGHT * renderScale);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  // Reset transform to "CSS pixel" coordinates (so we can clear easily),
  // then we apply a world transform inside render().
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);

// -----------------------------------------------------
// WebSocket
// -----------------------------------------------------

const protocol = location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${location.host}/ws`;
const socket = new WebSocket(wsUrl);

let playerId = null;
let lastState = null;

// Client-side render timing (used for sprite animation)
let _lastRenderAt = performance.now();
let _renderDt = 1 / 60;

let _lastServerGameState = null;

// movement input – ALWAYS WASD (each tab controls the server-assigned player)
const keyState = { up: false, down: false, left: false, right: false };

// SHOP menu (per connected player)
// Costs should match src/game/core.js.
const SHOP_ITEMS = [
  { id: "upgrade_weapon", label: "Upgrade weapon", cost: 10, hint: "Stronger + faster" },
  { id: "heal", label: "Heal +30", cost: 8, hint: "Emergency" },
  { id: "send:slime", label: "Send 4x Slimes", cost: 10, hint: "Cheap pressure" },
  { id: "send:fast", label: "Send 3x Fast", cost: 14, hint: "Hard to dodge" },
  { id: "send:tank", label: "Send 2x Tanks", cost: 18, hint: "Soak damage" },
  { id: "send:spitter", label: "Send 2x Spitters", cost: 16, hint: "Ranged threat" },
  { id: "send_boss", label: "Send Boss", cost: 100, hint: "Big threat (latest tier)" },
  // NEW: Grenade (2 max per shop, server enforces)
  { id: "send_grenade", label: "Send Grenade", cost: 25, hint: "AoE explode (2 max/round)" },
];

// WEAPON SELECT menu (per connected player)
const WEAPON_ITEMS = [
  { id: "knife", label: "Knife", hint: "Fast" },
  { id: "axe", label: "Axe", hint: "Heavy" },
  { id: "spear", label: "Spear", hint: "Balanced" },
  { id: "bow", label: "Bow", hint: "Ranged" },
];

let weaponIndex = 0;
let weaponLastNavAt = 0;

let shopIndex = 0;
let shopLastNavAt = 0;

// Send inputs at a steady cadence while PLAYING.
let _lastSentKeys = "";
setInterval(() => {
  if (currentGameState() !== "PLAYING") return;
  const payload = JSON.stringify(keyState);
  if (payload === _lastSentKeys) return;
  _lastSentKeys = payload;
  sendInput();
}, 33);

function clearMovementKeys() {
  keyState.up = false;
  keyState.down = false;
  keyState.left = false;
  keyState.right = false;
  sendInput();
}

window.addEventListener("blur", clearMovementKeys);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearMovementKeys();
});

function send(obj) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

function sendInput() {
  send({ type: "input", keys: { ...keyState } });
}

socket.addEventListener("open", () => {
  statusEl.textContent = "Connecting to game...";
  playerAnim.clear();
});

socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "welcome") {
    playerId = msg.playerId;
    statusEl.textContent =
      playerId === 1
        ? "Connected as Player 1 (Left)"
        : playerId === 2
        ? "Connected as Player 2 (Right)"
        : "Connected as Spectator";
    return;
  }

  if (msg.type === "state") {
    lastState = msg.state;

    // If we leave PLAYING, force-clear movement keys so we never carry "stuck" keys
    const nowState = lastState ? lastState.state : null;
    if (_lastServerGameState === "PLAYING" && nowState !== "PLAYING") {
      _lastSentKeys = "";
      clearMovementKeys();
    }
    _lastServerGameState = nowState;
  }
});

// -----------------------------------------------------
// Input handling
// -----------------------------------------------------

function currentGameState() {
  return lastState ? lastState.state : null;
}

window.addEventListener("keydown", (e) => {
  const st = currentGameState();

  // Movement is only relevant while PLAYING
  if (st === "PLAYING") {
    if (e.key === "w" || e.key === "W") keyState.up = true;
    if (e.key === "s" || e.key === "S") keyState.down = true;
    if (e.key === "a" || e.key === "A") keyState.left = true;
    if (e.key === "d" || e.key === "D") keyState.right = true;
    sendInput();
  }

  // Weapon selection
  if (st === "WEAPON_SELECT") {
    handleWeaponSelectKeydown(e);
  }

  // Shop navigation + purchases + ready
  if (st === "SHOP") {
    handleShopKeydown(e);
  }

  // Restart
  if (st === "GAME_OVER") {
    if (e.key === "r" || e.key === "R" || e.key === "Enter") {
      send({ type: "restart" });
    }
  }
});

window.addEventListener("keyup", (e) => {
  const st = currentGameState();
  if (st !== "PLAYING") return;

  if (e.key === "w" || e.key === "W") keyState.up = false;
  if (e.key === "s" || e.key === "S") keyState.down = false;
  if (e.key === "a" || e.key === "A") keyState.left = false;
  if (e.key === "d" || e.key === "D") keyState.right = false;
  sendInput();
});

// -----------------------------------------------------
// Menu helpers
// -----------------------------------------------------

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function handleWeaponSelectKeydown(e) {
  // Weapon select: W/S navigate, Enter select.
  const now = performance.now();
  const canNav = now - weaponLastNavAt > 80;

  if ((e.key === "w" || e.key === "W") && canNav) {
    weaponIndex = clamp(weaponIndex - 1, 0, WEAPON_ITEMS.length - 1);
    weaponLastNavAt = now;
    e.preventDefault();
  }
  if ((e.key === "s" || e.key === "S") && canNav) {
    weaponIndex = clamp(weaponIndex + 1, 0, WEAPON_ITEMS.length - 1);
    weaponLastNavAt = now;
    e.preventDefault();
  }

  if (e.key === "Enter") {
    const item = WEAPON_ITEMS[weaponIndex];
    if (item) send({ type: "weapon_select", weaponType: item.id });
    e.preventDefault();
  }

  // Legacy number shortcuts
  const legacy = { "1": "knife", "2": "axe", "3": "spear", "4": "bow", "7": "knife", "8": "axe", "9": "spear", "0": "bow" };
  const weapon = legacy[e.key];
  if (weapon) {
    send({ type: "weapon_select", weaponType: weapon });
    e.preventDefault();
  }
}

function handleShopKeydown(e) {
  // W/S navigate, Enter buy, Space ready.
  const now = performance.now();
  const canNav = now - shopLastNavAt > 80;

  if ((e.key === "w" || e.key === "W") && canNav) {
    shopIndex = clamp(shopIndex - 1, 0, SHOP_ITEMS.length - 1);
    shopLastNavAt = now;
    e.preventDefault();
  }
  if ((e.key === "s" || e.key === "S") && canNav) {
    shopIndex = clamp(shopIndex + 1, 0, SHOP_ITEMS.length - 1);
    shopLastNavAt = now;
    e.preventDefault();
  }

  if (e.key === "Enter") {
    const item = SHOP_ITEMS[shopIndex];
    if (item) {
      send({ type: "shop_action", action: item.id });
    }
    e.preventDefault();
  }

  if (e.code === "Space") {
    send({ type: "ready" });
    e.preventDefault();
  }

  // Legacy shortcuts
  if (e.key === "q" || e.key === "Q") send({ type: "shop_action", action: "upgrade_weapon" });
  if (e.key === "e" || e.key === "E") send({ type: "shop_action", action: "heal" });
}

// -----------------------------------------------------
// Rendering helpers (world-space)
// -----------------------------------------------------

function beginWorld() {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.save();
  ctx.scale(renderScale, renderScale);
}

function endWorld() {
  ctx.restore();
}

function drawBackground() {
  // ground
  if (assets.ground && assets.ground.complete && assets.ground.naturalWidth) {
    const tile = 64;
    for (let x = 0; x < WORLD_WIDTH; x += tile) {
      for (let y = 0; y < WORLD_HEIGHT; y += tile) {
        ctx.drawImage(assets.ground, x, y, tile, tile);
      }
    }
  } else {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  // fence
  if (assets.fence && assets.fence.complete && assets.fence.naturalWidth) {
    const fw = 48;
    for (let y = 0; y < WORLD_HEIGHT; y += 64) {
      ctx.drawImage(assets.fence, FENCE_X - fw / 2, y, fw, 64);
    }
  } else {
    ctx.fillStyle = "#333";
    ctx.fillRect(FENCE_X - 6, 0, 12, WORLD_HEIGHT);
  }
}

function drawWeaponOnPlayer(p) {
  const weaponKey = p.weaponType;
  const img = assets[weaponKey];

  const offsetX = (p.side === "left" ? 18 : -18) * PLAYER_SCALE;
  const offsetY = 8 * PLAYER_SCALE;
  const aimDx = typeof p.aimDx === "number" ? p.aimDx : (p.side === "left" ? 1 : -1);
  const aimDy = typeof p.aimDy === "number" ? p.aimDy : 0;
  const angle = Math.atan2(aimDy, aimDx);

  const cx = p.x + offsetX;
  const cy = p.y + offsetY;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  if (img && img.complete && img.naturalWidth) {
    const w = 28 * WEAPON_SCALE;
    const h = 28 * WEAPON_SCALE;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = "#ddd";
    ctx.fillRect(-10 * WEAPON_SCALE, -3 * WEAPON_SCALE, 20 * WEAPON_SCALE, 6 * WEAPON_SCALE);
  }

  ctx.restore();
}

function drawPlayers(players) {
  for (const p of players) {
    const img = p.side === "left" ? assets.player1 : assets.player2;
    const size = 40 * PLAYER_SCALE;

    const sheetImg = p.side === "left" ? assets.player1_walk : assets.player2_walk;
    const sheetDef = p.side === "left" ? PLAYER_SHEETS.p1 : PLAYER_SHEETS.p2;

    if (sheetImg && sheetImg.complete && sheetImg.naturalWidth) {
      const a = getAnimState(p.id);

      const dx = a.lastX == null ? 0 : (p.x - a.lastX);
      const dy = a.lastY == null ? 0 : (p.y - a.lastY);
      a.lastX = p.x;
      a.lastY = p.y;

      const moving = Math.hypot(dx, dy) > 0.2;
      if (moving) {
        a.dirRow = directionToRow(dx, dy, sheetDef.rowMap);
        a.t += _renderDt;
        const frameAdvance = Math.floor(a.t * sheetDef.fps);
        if (frameAdvance > 0) {
          a.frame = (a.frame + frameAdvance) % sheetDef.cols;
          a.t = a.t % (1 / sheetDef.fps);
        }
      } else {
        a.frame = 0;
        a.t = 0;
      }

      const flipX = false;
      drawSpriteFrame(sheetImg, sheetDef, a.frame, a.dirRow, p.x, p.y, size, flipX);
    } else if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
    } else {
      ctx.fillStyle = p.side === "left" ? "#4ab1ff" : "#ff5b5b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 * PLAYER_SCALE, 0, Math.PI * 2);
      ctx.fill();
    }

    drawWeaponOnPlayer(p);

    // hp bar
    const ratio = Math.max(0, Math.min(1, p.hp / p.maxHp));
    ctx.fillStyle = "#222";
    ctx.fillRect(p.x - 20 * PLAYER_SCALE, p.y - 30 * PLAYER_SCALE, 40 * PLAYER_SCALE, 6 * PLAYER_SCALE);
    ctx.fillStyle = p.side === "left" ? "#4ab1ff" : "#ff5b5b";
    ctx.fillRect(p.x - 20 * PLAYER_SCALE, p.y - 30 * PLAYER_SCALE, 40 * PLAYER_SCALE * ratio, 6 * PLAYER_SCALE);

    // name tag
    ctx.fillStyle = "#eee";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(p.side === "left" ? "P1" : "P2", p.x, p.y - 38 * PLAYER_SCALE);
  }
}

function drawMonsters(monsters) {
  for (const m of monsters) {
    let img = null;
    if (m.type === "slime") img = assets.slime;
    else if (m.type === "fast") img = assets.fast;
    else if (m.type === "tank") img = assets.tank;
    else if (m.type === "spitter") img = assets.spitter;
    else if (m.type === "boss1") img = assets.boss1;
    else if (m.type === "boss2") img = assets.boss2;

    const isBoss = typeof m.type === "string" && m.type.startsWith("boss");

    if (img && img.complete && img.naturalWidth) {
      const size = (isBoss ? 60 : 32) * MONSTER_SCALE;
      ctx.drawImage(img, m.x - size / 2, m.y - size / 2, size, size);
    } else {
      let color = "#44dd88";
      if (m.type === "fast") color = "#ffd44a";
      else if (m.type === "tank") color = "#7b64d9";
      else if (m.type === "spitter") color = "#4ad0ff";
      else if (isBoss) color = "#ff3b3b";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, (isBoss ? 26 : 14) * MONSTER_SCALE, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSpawnWarnings(warnings) {
  for (const w of warnings) {
    const total = w.total || 2.0;
    const elapsed = Math.max(0, total - (w.timer || 0));
    const period = total / (3 * 2); // 3 blinks -> 6 phases
    const phase = Math.floor(elapsed / period);
    const visible = phase % 2 === 0;
    if (!visible) continue;

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#ff3b3b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function projectileImageForWeapon(weaponType) {
  if (weaponType === "bow") return assets.arrow;
  return assets[weaponType];
}

function projectileDrawSizeForWeapon(weaponType) {
  return 28 * WEAPON_SCALE;
}

function drawBullets(bullets) {
  for (const b of bullets) {
    const img = projectileImageForWeapon(b.weaponType);

    // Make thrown weapons spin (client-side visual only)
    const baseAngle = Math.atan2(b.vy || 0, b.vx || 1);
    const spin = (performance.now() / 1000) * 14.0;
    const angle = baseAngle + spin;

    if (img && img.complete && img.naturalWidth) {
      const target = projectileDrawSizeForWeapon(b.weaponType);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const denom = Math.max(1, Math.max(nw, nh));
      const scale = target / denom;
      const w = nw * scale;
      const h = nh * scale;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4 * WEAPON_SCALE, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawEnemyBullets(enemyBullets) {
  for (const b of enemyBullets || []) {
    const img = assets.spitter_projectile;

    if (img && img.complete && img.naturalWidth) {
      const target = 22 * WEAPON_SCALE;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const denom = Math.max(1, Math.max(nw, nh));
      const scale = target / denom;
      const w = nw * scale;
      const h = nh * scale;
      ctx.drawImage(img, b.x - w / 2, b.y - h / 2, w, h);
    } else {
      ctx.save();
      ctx.fillStyle = "#7dff6a";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6 * WEAPON_SCALE, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawGrenades(grenades) {
  for (const g of grenades || []) {
    // Grenade visuals:
    //  - Draw the grenade sprite (assets.grenade) as the "body"
    //  - Draw a faint radius ring (blast preview)
    //  - Draw a fuse timer text above it
    const img = assets.grenade;
    // Make the grenade body very obvious (users reported they only see the radius ring).
    // Bigger + a dark shadow disc under it + pixel-art friendly rendering.
    const size = 64 * WEAPON_SCALE;

    ctx.save();

    // Blast radius preview (separate from the sprite)
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#ffb14a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.radius || 120, 0, Math.PI * 2);
    ctx.stroke();

    // Grenade body (sprite or clear fallback)
    ctx.globalAlpha = 1.0;

    // Shadow disc under the sprite so it never "disappears" on dark ground.
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.arc(g.x, g.y + size * 0.08, size * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Pixel art: turn smoothing off just for this draw.
    const prevSmoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, g.x - size / 2, g.y - size / 2, size, size);
    } else {
      // fallback body: bright, outlined, and pulsing
      const pulse = 0.65 + 0.35 * Math.sin((performance.now() / 1000) * 10);
      const r = size * 0.16 * pulse;
      ctx.fillStyle = "#ff7b2e";
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.imageSmoothingEnabled = prevSmoothing;

    // Fuse timer text
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#fff";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.max(0, (g.timer || 0)).toFixed(1)}s`, g.x, g.y - size * 0.7);

    ctx.restore();
  }
}

function drawPickups(golds, hearts, greenPotions) {
  // ----------------
  // Gold coins
  // ----------------
  for (const g of golds || []) {
    const img = assets.gold;
    const size = GOLD_SIZE;

    if (img) {
      ctx.drawImage(img, g.x - size / 2, g.y - size / 2, size, size);
    } else {
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.arc(g.x, g.y, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ----------------
  // Hearts (heal)
  // ----------------
  for (const h of hearts || []) {
    const img = assets.heart;
    const size = HEART_SIZE;

    if (img) {
      ctx.drawImage(img, h.x - size / 2, h.y - size / 2, size, size);
    } else {
      ctx.fillStyle = "#ff4d6d";
      ctx.beginPath();
      ctx.arc(h.x, h.y, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ----------------
  // Green potions (enrage)
  // ----------------
  for (const gp of greenPotions || []) {
    const img = assets.green_potion;
    const size = GREEN_POTION_SIZE;

    if (img) {
      ctx.drawImage(img, gp.x - size / 2, gp.y - size / 2, size, size);
    } else {
      ctx.fillStyle = "#32cd32";
      ctx.beginPath();
      ctx.arc(gp.x, g.y, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHud(state) {
  const p1 = state.players.find((p) => p.side === "left");
  const p2 = state.players.find((p) => p.side === "right");

  function textOutlined(t, x, y, align = "left", size = 16) {
    ctx.font = `${size}px Arial`;
    ctx.textAlign = align;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(t, x, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(t, x, y);
  }

  ctx.save();

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(8, 8, 360, 48);

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(WORLD_WIDTH - 368, 8, 360, 48);

  if (p1) {
    textOutlined(`P1 HP: ${Math.max(0, Math.floor(p1.hp))}`, 18, 28, "left", 16);
    const w1 = p1.weaponType ? p1.weaponType.toUpperCase() : "...";
    textOutlined(`Gold: ${p1.gold}  Weapon: ${w1} Lv${p1.weaponLevel}`, 18, 48, "left", 14);
  }

  if (p2) {
    const baseX = WORLD_WIDTH - 358;
    textOutlined(`P2 HP: ${Math.max(0, Math.floor(p2.hp))}`, baseX, 28, "left", 16);
    const w2 = p2.weaponType ? p2.weaponType.toUpperCase() : "...";
    textOutlined(`Gold: ${p2.gold}  Weapon: ${w2} Lv${p2.weaponLevel}`, baseX, 48, "left", 14);
  }

  ctx.textAlign = "center";
  const timerText =
    state.state === "PLAYING"
      ? `Wave: ${Math.ceil(state.waveLeft)}s`
      : state.state === "SHOP"
      ? `Shop: ${Math.ceil(state.shopLeft)}s`
      : "";

  ctx.fillStyle = "#fff";
  ctx.font = "16px Arial";
  ctx.fillText(`Round ${state.round} ${timerText ? "— " + timerText : ""}`, WORLD_WIDTH / 2, 22);
  if (timerText) ctx.fillText(timerText, WORLD_WIDTH / 2, 44);

  ctx.restore();
}

function drawOverlayText(lines) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.fillStyle = "#fff";
  ctx.font = "26px Arial";
  ctx.textAlign = "center";

  const startY = WORLD_HEIGHT / 2 - (lines.length - 1) * 18;
  lines.forEach((t, i) => ctx.fillText(t, WORLD_WIDTH / 2, startY + i * 36));
  ctx.restore();
}

function drawShopUI(state) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return;

  const isLeft = me.side === "left";
  const panelX = isLeft ? 0 : WORLD_WIDTH / 2;
  const panelW = WORLD_WIDTH / 2;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(panelX, 0, panelW, WORLD_HEIGHT);

  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("SHOP", panelX + panelW / 2, 42);

  ctx.font = "14px Arial";
  ctx.fillText(
    `Time left: ${Math.ceil(state.shopLeft)}s   Ready: ${isLeft ? state.leftReady : state.rightReady}`,
    panelX + panelW / 2,
    66
  );

  const startY = 110;
  const rowH = 36;
  ctx.textAlign = "left";

  for (let i = 0; i < SHOP_ITEMS.length; i++) {
    const item = SHOP_ITEMS[i];
    const y = startY + i * rowH;
    const selected = i === shopIndex;
    const affordable = me.gold >= item.cost;

    if (selected) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(panelX + 14, y - 22, panelW - 28, 30);
    }

    ctx.fillStyle = affordable ? "#fff" : "rgba(255,255,255,0.45)";
    ctx.font = selected ? "bold 16px Arial" : "16px Arial";
    ctx.fillText(`${item.label}`, panelX + 26, y);

    ctx.font = "14px Arial";
    ctx.fillText(`${item.hint}`, panelX + 26, y + 16);

    ctx.textAlign = "right";
    ctx.font = "16px Arial";
    ctx.fillText(`${item.cost}g`, panelX + panelW - 26, y);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("W/S = select   Enter = buy   Space = ready", panelX + panelW / 2, WORLD_HEIGHT - 26);
  ctx.restore();
}

function drawWeaponSelectUI(state) {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return;

  const isLeft = me.side === "left";
  const panelX = isLeft ? 0 : WORLD_WIDTH / 2;
  const panelW = WORLD_WIDTH / 2;

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(panelX, 0, panelW, WORLD_HEIGHT);

  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial";
  ctx.textAlign = "center";
  ctx.fillText("CHOOSE WEAPON", panelX + panelW / 2, 42);

  const p1 = state.players.find((p) => p.side === "left");
  const p2 = state.players.find((p) => p.side === "right");
  const chosenL = p1 && p1.weaponType ? p1.weaponType.toUpperCase() : "...";
  const chosenR = p2 && p2.weaponType ? p2.weaponType.toUpperCase() : "...";

  ctx.font = "14px Arial";
  ctx.fillText(`P1: ${chosenL}   |   P2: ${chosenR}`, panelX + panelW / 2, 66);

  const startY = 130;
  const rowH = 44;
  ctx.textAlign = "left";

  for (let i = 0; i < WEAPON_ITEMS.length; i++) {
    const item = WEAPON_ITEMS[i];
    const y = startY + i * rowH;
    const selected = i === weaponIndex;
    const isChosen = me.weaponType === item.id;

    if (selected) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(panelX + 14, y - 26, panelW - 28, 34);
    }

    ctx.fillStyle = isChosen ? "#7CFF8E" : "#fff";
    ctx.font = selected ? "bold 18px Arial" : "18px Arial";
    ctx.fillText(item.label, panelX + 26, y);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "14px Arial";
    ctx.fillText(item.hint, panelX + 26, y + 18);
  }

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("W/S = select   Enter = choose", panelX + panelW / 2, WORLD_HEIGHT - 30);
  ctx.restore();
}

// -----------------------------------------------------
// Main render loop
// -----------------------------------------------------

function render() {
  const now = performance.now();
  _renderDt = Math.min(0.05, Math.max(0.0, (now - _lastRenderAt) / 1000));
  _lastRenderAt = now;

  beginWorld();
  drawBackground();

  if (!lastState) {
    drawOverlayText(["Waiting for server...", "If this persists, refresh."]);
    endWorld();
    requestAnimationFrame(render);
    return;
  }

  statusEl.textContent =
    (playerId === 1 ? "P1 (Left)" : playerId === 2 ? "P2 (Right)" : "Spectator") +
    ` — State: ${lastState.state} — Round: ${lastState.round}`;

  drawSpawnWarnings(lastState.spawnWarnings || []);
  drawMonsters(lastState.monsters || []);
  drawBullets(lastState.bullets || []);
  drawEnemyBullets(lastState.enemyBullets || []);
  drawGrenades(lastState.grenades || []);
  drawPickups(lastState.goldDrops || [], lastState.hearts || [], lastState.greenPotions || []);
  drawPlayers(lastState.players || []);
  drawHud(lastState);

  if (lastState.state === "WEAPON_SELECT") {
    drawWeaponSelectUI(lastState);
  } else if (lastState.state === "SHOP") {
    drawShopUI(lastState);
  } else if (lastState.state === "GAME_OVER") {
    const winner =
      lastState.winner === "left"
        ? "Player 1 wins!"
        : lastState.winner === "right"
        ? "Player 2 wins!"
        : "Draw!";
    drawOverlayText([winner, "Press R or Enter to restart"]);
  }

  endWorld();
  requestAnimationFrame(render);
}

// -----------------------------------------------------
// Boot
// -----------------------------------------------------

(async function boot() {
  resizeCanvas();
  await loadAssets(assetPaths);
  assetsLoaded = true;
  render();
})();
