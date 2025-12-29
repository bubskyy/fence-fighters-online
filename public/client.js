// public/client.js

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

// Server/world coordinates (must match src/game/core.js)
const WORLD_WIDTH = 1000;
const WORLD_HEIGHT = 600;
const FENCE_X = WORLD_WIDTH / 2;
const TILE_SIZE = 64;

// -----------------------------------------------------
// Assets
// -----------------------------------------------------

const assetPaths = {
  ground: "assets/tiles/ground.png",
  fence: "assets/tiles/fence.png",

  player1: "assets/characters/player1.png",
  player2: "assets/characters/player2.png",

  slime: "assets/monsters/slime.png",
  fast: "assets/monsters/fast.png",
  tank: "assets/monsters/tank.png",
  spitter: "assets/monsters/spitter.png",

  knife: "assets/weapons/knife.png",
  axe: "assets/weapons/axe.png",
  spear: "assets/weapons/spear.png",
  bow: "assets/weapons/bow.png",
  arrow: "assets/weapons/arrow.png",

  gold: "assets/pickups/gold.png",
  heart: "assets/pickups/heart.png"
};

const assets = {};
let assetsLoaded = false;

function loadAssets(paths) {
  const entries = Object.entries(paths);
  let loaded = 0;
  const total = entries.length;

  return new Promise(resolve => {
    entries.forEach(([key, url]) => {
      const img = new Image();
      img.onload = () => {
        assets[key] = img;
        loaded += 1;
        if (loaded === total) {
          assetsLoaded = true;
          resolve();
        }
      };
      img.onerror = () => {
        console.warn("Failed to load", url);
        loaded += 1;
        if (loaded === total) {
          assetsLoaded = true;
          resolve();
        }
      };
      img.src = url;
    });
  });
}

// -----------------------------------------------------
// Canvas resizing + world scaling
// -----------------------------------------------------

function resizeCanvas() {
  // Make the canvas big on screen while keeping crisp pixel art.
  const dpr = window.devicePixelRatio || 1;

  // Size to almost full viewport, but keep a tiny margin.
  const cssW = Math.max(320, Math.floor(window.innerWidth * 0.98));
  const cssH = Math.max(240, Math.floor((window.innerHeight - 90) * 0.98));

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function beginWorldDraw() {
  // Fit WORLD into canvas.
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;

  const scale = Math.min(cssW / WORLD_WIDTH, cssH / WORLD_HEIGHT);
  const offsetX = (cssW - WORLD_WIDTH * scale) / 2;
  const offsetY = (cssH - WORLD_HEIGHT * scale) / 2;

  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  return { scale, offsetX, offsetY, cssW, cssH };
}

function endWorldDraw() {
  // Back to CSS pixel coordinates for UI.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// -----------------------------------------------------
// WebSocket
// -----------------------------------------------------

const protocol = location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${location.host}`;
const socket = new WebSocket(wsUrl);

let playerId = null;
let lastState = null;

// movement input – ALWAYS WASD, for both players (each tab controls its assigned player)
const keyState = { up: false, down: false, left: false, right: false };

socket.addEventListener("open", () => {
  statusEl.textContent = "Connecting to game...";
});

socket.addEventListener("message", event => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    playerId = msg.playerId;
    statusEl.textContent =
      playerId === 0 ? "Connected as Spectator" : `Connected as Player ${playerId} (WASD)`;
  } else if (msg.type === "state") {
    lastState = msg.state;
  }
});

socket.addEventListener("close", () => {
  statusEl.textContent = "Disconnected";
});

function send(type, payload = {}) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, ...payload }));
  }
}

function sendInput() {
  send("input", { keys: keyState });
}

function resetKeysAndSend() {
  keyState.up = false;
  keyState.down = false;
  keyState.left = false;
  keyState.right = false;
  sendInput();
}

// Clear stuck keys when tab loses focus.
window.addEventListener("blur", resetKeysAndSend);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetKeysAndSend();
});

// -----------------------------------------------------
// Input handling
// -----------------------------------------------------

window.addEventListener("keydown", e => {
  const st = lastState ? lastState.state : null;

  // Prevent page scroll on space.
  if (e.code === "Space") e.preventDefault();

  // Movement
  if (st === "PLAYING") {
    if (e.key === "w" || e.key === "W") keyState.up = true;
    if (e.key === "s" || e.key === "S") keyState.down = true;
    if (e.key === "a" || e.key === "A") keyState.left = true;
    if (e.key === "d" || e.key === "D") keyState.right = true;
    sendInput();
  }

  // Weapon select
  if (st === "WEAPON_SELECT") {
    if (playerId === 1) {
      if (e.key === "1") send("weapon_select", { weaponType: "knife" });
      if (e.key === "2") send("weapon_select", { weaponType: "axe" });
      if (e.key === "3") send("weapon_select", { weaponType: "spear" });
      if (e.key === "4") send("weapon_select", { weaponType: "bow" });
    } else if (playerId === 2) {
      if (e.key === "7") send("weapon_select", { weaponType: "knife" });
      if (e.key === "8") send("weapon_select", { weaponType: "axe" });
      if (e.key === "9") send("weapon_select", { weaponType: "spear" });
      if (e.key === "0") send("weapon_select", { weaponType: "bow" });
    }
  }

  // Shop
  if (st === "SHOP") {
    if (playerId === 1) {
      if (e.key === "q" || e.key === "Q") send("shop_action", { action: "upgrade" });
      if (e.key === "w" || e.key === "W") send("shop_action", { action: "send_mobs" });
    } else if (playerId === 2) {
      if (e.key === "i" || e.key === "I") send("shop_action", { action: "upgrade" });
      if (e.key === "o" || e.key === "O") send("shop_action", { action: "send_mobs" });
    }
    if (e.code === "Space") send("ready");
  }

  // Game over restart
  if (st === "GAME_OVER") {
    if (e.key === "r" || e.key === "R" || e.key === "Enter") send("restart");
  }
});

window.addEventListener("keyup", e => {
  const st = lastState ? lastState.state : null;
  if (st !== "PLAYING") return;

  if (e.key === "w" || e.key === "W") keyState.up = false;
  if (e.key === "s" || e.key === "S") keyState.down = false;
  if (e.key === "a" || e.key === "A") keyState.left = false;
  if (e.key === "d" || e.key === "D") keyState.right = false;
  sendInput();
});

// -----------------------------------------------------
// Drawing helpers (WORLD coords)
// -----------------------------------------------------

function drawBackground() {
  const ground = assets.ground;
  if (ground) {
    for (let x = 0; x < WORLD_WIDTH; x += TILE_SIZE) {
      for (let y = 0; y < WORLD_HEIGHT; y += TILE_SIZE) {
        ctx.drawImage(ground, x, y, TILE_SIZE, TILE_SIZE);
      }
    }
  } else {
    ctx.fillStyle = "#303030";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  const fence = assets.fence;
  if (fence) {
    for (let y = 0; y < WORLD_HEIGHT; y += TILE_SIZE) {
      ctx.drawImage(fence, FENCE_X - TILE_SIZE / 2, y, TILE_SIZE, TILE_SIZE);
    }
  } else {
    ctx.strokeStyle = "#553322";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(FENCE_X, 0);
    ctx.lineTo(FENCE_X, WORLD_HEIGHT);
    ctx.stroke();
  }
}

function drawPlayers(players) {
  for (const p of players) {
    const img = p.side === "left" ? assets.player1 : assets.player2;
    const size = 42;
    if (img) {
      ctx.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
    } else {
      ctx.fillStyle = p.side === "left" ? "#4ab1ff" : "#ff5b5b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Weapon in hand (simple: draw weapon sprite slightly in front of player)
    if (p.hasChosenWeapon && assets[p.weaponType]) {
      const wImg = assets[p.weaponType];
      const wSize = 28;

      // Face toward fence by default; it still looks fine even without exact aim.
      const dir = p.side === "left" ? 1 : -1;
      const wx = p.x + dir * 18;
      const wy = p.y - 2;

      ctx.save();
      // Flip for right side so weapon faces left.
      if (dir < 0) {
        ctx.translate(wx, wy);
        ctx.scale(-1, 1);
        ctx.drawImage(wImg, -wSize / 2, -wSize / 2, wSize, wSize);
      } else {
        ctx.drawImage(wImg, wx - wSize / 2, wy - wSize / 2, wSize, wSize);
      }
      ctx.restore();
    }

    // HP bar
    const ratio = p.hp / p.maxHp;
    ctx.fillStyle = "#222";
    ctx.fillRect(p.x - 22, p.y - 34, 44, 6);
    ctx.fillStyle = "#0f0";
    ctx.fillRect(p.x - 22, p.y - 34, 44 * ratio, 6);
  }
}

function drawMonsters(monsters) {
  for (const m of monsters) {
    let img = null;
    if (m.type === "slime") img = assets.slime;
    else if (m.type === "fast") img = assets.fast;
    else if (m.type === "tank") img = assets.tank;
    else if (m.type === "spitter") img = assets.spitter;

    if (img) {
      const size = 34;
      ctx.drawImage(img, m.x - size / 2, m.y - size / 2, size, size);
    } else {
      let color = "#44dd88";
      if (m.type === "fast") color = "#ffd44a";
      else if (m.type === "tank") color = "#7b64d9";
      else if (m.type === "spitter") color = "#4ad0ff";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Blink exactly 3 times over ~2 seconds (6 segments: on/off/on/off/on/off)
function drawSpawnWarnings(warnings) {
  for (const w of warnings) {
    const duration = w.duration || 2.0;
    const elapsed = Math.max(0, duration - w.timer);
    const segments = 6;
    const segLen = duration / segments;
    const segIdx = Math.floor(elapsed / segLen);
    const visible = segIdx % 2 === 0; // 0,2,4 visible => 3 blinks

    if (!visible) continue;

    let img = null;
    if (w.type === "slime") img = assets.slime;
    else if (w.type === "fast") img = assets.fast;
    else if (w.type === "tank") img = assets.tank;
    else if (w.type === "spitter") img = assets.spitter;

    ctx.save();
    ctx.globalAlpha = 0.55;

    if (img) {
      const size = 34;
      ctx.drawImage(img, w.x - size / 2, w.y - size / 2, size, size);
    } else {
      ctx.fillStyle = "#bbbbbb";
      ctx.beginPath();
      ctx.arc(w.x, w.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawBullets(bullets) {
  for (const b of bullets) {
    // Arrow sprite for bow, otherwise small dot.
    if (b.weaponType === "bow" && assets.arrow) {
      const size = 18;
      ctx.drawImage(assets.arrow, b.x - size / 2, b.y - size / 2, size, size);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPickups(golds, hearts) {
  for (const g of golds) {
    if (assets.gold) {
      ctx.drawImage(assets.gold, g.x - 10, g.y - 10, 20, 20);
    } else {
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.arc(g.x, g.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const h of hearts) {
    if (assets.heart) {
      ctx.drawImage(assets.heart, h.x - 10, h.y - 10, 20, 20);
    } else {
      ctx.fillStyle = "#f04860";
      ctx.beginPath();
      ctx.arc(h.x - 4, h.y - 3, 5, 0, Math.PI * 2);
      ctx.arc(h.x + 4, h.y - 3, 5, 0, Math.PI * 2);
      ctx.moveTo(h.x - 7, h.y - 1);
      ctx.lineTo(h.x + 7, h.y - 1);
      ctx.lineTo(h.x, h.y + 8);
      ctx.fill();
    }
  }
}

// -----------------------------------------------------
// UI / HUD (CSS pixel coords)
// -----------------------------------------------------

function drawHudPlaying(state, cssW) {
  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");

  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `Round ${state.round} – ${Math.max(0, state.waveLeft).toFixed(0)}s`,
    cssW / 2,
    24
  );

  ctx.font = "14px Arial";
  if (p1) {
    ctx.textAlign = "left";
    ctx.fillText(
      `P1 HP:${p1.hp} G:${p1.gold} ${p1.weaponType || "-"} L${p1.weaponLevel || 1}`,
      20,
      20
    );
  }
  if (p2) {
    ctx.textAlign = "right";
    ctx.fillText(
      `P2 HP:${p2.hp} G:${p2.gold} ${p2.weaponType || "-"} L${p2.weaponLevel || 1}`,
      cssW - 20,
      20
    );
  }
}

// -----------------------------------------------------
// Screens
// -----------------------------------------------------

function clearScreen(cssW, cssH) {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, cssW, cssH);
}

function drawWeaponSelect(state, cssW, cssH) {
  clearScreen(cssW, cssH);

  ctx.fillStyle = "#fff";
  ctx.font = "28px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Choose Weapons", cssW / 2, 60);

  ctx.font = "14px Arial";
  ctx.fillStyle = "#ddd";
  ctx.fillText(
    "P1: 1=Knife,2=Axe,3=Spear,4=Bow   |   P2: 7=Knife,8=Axe,9=Spear,0=Bow",
    cssW / 2,
    90
  );

  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");

  function panel(x, label, player, isLeft) {
    const y0 = 140;
    ctx.textAlign = "left";
    ctx.font = "20px Arial";
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x, y0);

    ctx.font = "14px Arial";
    let text = "Selected: [none]";
    if (player && player.hasChosenWeapon) text = `Selected: ${player.weaponType}`;
    ctx.fillStyle = player && player.hasChosenWeapon ? "#c8e5ff" : "#ff8080";
    ctx.fillText(text, x, y0 + 30);

    if (player && player.hasChosenWeapon && assets[player.weaponType]) {
      ctx.drawImage(assets[player.weaponType], x, y0 + 50, 32, 32);
    }

    const img = isLeft ? assets.player1 : assets.player2;
    if (img) ctx.drawImage(img, x + 90, y0 + 40, 40, 40);
  }

  panel(80, "Player 1 (WASD)", p1, true);
  panel(cssW - 320, "Player 2 (WASD)", p2, false);

  ctx.font = "14px Arial";
  ctx.fillStyle = "#ccc";
  ctx.textAlign = "center";
  ctx.fillText(
    "The game starts only after BOTH players have selected a weapon.",
    cssW / 2,
    cssH - 40
  );
}

function drawPlaying(state, cssW, cssH) {
  // Draw world
  beginWorldDraw();
  drawBackground();
  drawSpawnWarnings(state.spawnWarnings || []);
  drawMonsters(state.monsters || []);
  drawPickups(state.goldDrops || [], state.hearts || []);
  drawBullets(state.bullets || []);
  drawPlayers(state.players || []);
  endWorldDraw();

  // Draw HUD in CSS pixels
  const dpr = window.devicePixelRatio || 1;
  drawHudPlaying(state, canvas.width / dpr);

  // Border hint
  ctx.font = "12px Arial";
  ctx.fillStyle = "#aaa";
  ctx.textAlign = "center";
  ctx.fillText("Tip: open a second tab to join as Player 2", cssW / 2, cssH - 12);
}

function drawShop(state, cssW, cssH) {
  clearScreen(cssW, cssH);

  ctx.fillStyle = "#fff";
  ctx.font = "26px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`SHOP - Round ${state.round}`, cssW / 2, 50);

  ctx.font = "14px Arial";
  ctx.fillStyle = "#ddd";
  ctx.fillText(
    "P1: Q=Upgrade, W=Send mobs   |   P2: I=Upgrade, O=Send mobs   |   SPACE = Ready",
    cssW / 2,
    80
  );

  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");

  ctx.textAlign = "left";
  let y = 140;

  if (p1) {
    ctx.fillStyle = "#fff";
    ctx.fillText(
      `Player 1 – HP:${p1.hp}  Gold:${p1.gold}  ${p1.weaponType || "-"} L${p1.weaponLevel || 1}`,
      80,
      y
    );
    ctx.fillStyle = state.leftReady ? "#5cff8a" : "#ffcc66";
    ctx.fillText(`Ready: ${state.leftReady ? "YES" : "NO"}`, 80, y + 22);

    ctx.fillStyle = "#ccc";
    ctx.fillText(`Extra mobs queued on P2: ${state.extraQueueRight || 0}`, 80, y + 46);
  }

  y += 110;

  if (p2) {
    ctx.fillStyle = "#fff";
    ctx.fillText(
      `Player 2 – HP:${p2.hp}  Gold:${p2.gold}  ${p2.weaponType || "-"} L${p2.weaponLevel || 1}`,
      80,
      y
    );
    ctx.fillStyle = state.rightReady ? "#5cff8a" : "#ffcc66";
    ctx.fillText(`Ready: ${state.rightReady ? "YES" : "NO"}`, 80, y + 22);

    ctx.fillStyle = "#ccc";
    ctx.fillText(`Extra mobs queued on P1: ${state.extraQueueLeft || 0}`, 80, y + 46);
  }

  ctx.font = "14px Arial";
  ctx.fillStyle = "#ccc";
  ctx.textAlign = "center";
  ctx.fillText(
    `Shop ends in ${Math.max(0, state.shopLeft).toFixed(0)}s or when both are ready.`,
    cssW / 2,
    cssH - 60
  );
}

function drawGameOver(state, cssW, cssH) {
  clearScreen(cssW, cssH);

  ctx.fillStyle = "#fff";
  ctx.font = "32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", cssW / 2, 70);

  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");

  let winnerText = "Game Over";
  if (p1 && p2) {
    if (p1.hp > 0 && p2.hp <= 0) winnerText = "Player 1 wins!";
    else if (p2.hp > 0 && p1.hp <= 0) winnerText = "Player 2 wins!";
    else if (p1.hp <= 0 && p2.hp <= 0) winnerText = "It's a draw! Both fell.";
  }

  ctx.font = "18px Arial";
  ctx.fillStyle = "#ddd";
  ctx.fillText(winnerText, cssW / 2, 110);

  ctx.font = "16px Arial";
  let y = 180;
  if (p1) {
    ctx.fillText(
      `P1 – Monsters killed: ${p1.monstersKilled}  |  Gold: ${p1.gold}  |  Score: ${p1.score}`,
      cssW / 2,
      y
    );
    y += 30;
  }
  if (p2) {
    ctx.fillText(
      `P2 – Monsters killed: ${p2.monstersKilled}  |  Gold: ${p2.gold}  |  Score: ${p2.score}`,
      cssW / 2,
      y
    );
  }

  ctx.font = "14px Arial";
  ctx.fillStyle = "#aaa";
  ctx.fillText("Press R or ENTER to restart.", cssW / 2, cssH - 60);
}

// -----------------------------------------------------
// Main render loop
// -----------------------------------------------------

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;

  if (!assetsLoaded) {
    clearScreen(cssW, cssH);
    ctx.fillStyle = "#fff";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Loading assets...", cssW / 2, cssH / 2);
    requestAnimationFrame(draw);
    return;
  }

  if (!lastState) {
    clearScreen(cssW, cssH);
    ctx.fillStyle = "#fff";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for game state...", cssW / 2, cssH / 2);
    requestAnimationFrame(draw);
    return;
  }

  const st = lastState.state;
  if (st === "WEAPON_SELECT") {
    drawWeaponSelect(lastState, cssW, cssH);
  } else if (st === "PLAYING") {
    drawPlaying(lastState, cssW, cssH);
  } else if (st === "SHOP") {
    drawShop(lastState, cssW, cssH);
  } else if (st === "GAME_OVER") {
    drawGameOver(lastState, cssW, cssH);
  }

  requestAnimationFrame(draw);
}

// start
loadAssets(assetPaths).then(() => {
  requestAnimationFrame(draw);
});
