// public/client.js

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;
const FENCE_X = SCREEN_WIDTH / 2;
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
// WebSocket
// -----------------------------------------------------

const protocol = location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${location.host}`;
const socket = new WebSocket(wsUrl);

let playerId = null;
let lastState = null;

// movement input – now ALWAYS WASD, for both players
const keyState = { up: false, down: false, left: false, right: false };

socket.addEventListener("open", () => {
  statusEl.textContent = "Connecting to game...";
});

socket.addEventListener("message", event => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    playerId = msg.playerId;
    statusEl.textContent = `Connected as Player ${playerId} (WASD)`;
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

// -----------------------------------------------------
// Input handling
// -----------------------------------------------------

window.addEventListener("keydown", e => {
  const st = lastState ? lastState.state : null;

  // Movement: BOTH players use WASD in their own browser
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
      if (e.key === "q" || e.key === "Q") {
        send("shop_action", { action: "upgrade" });
      }
      if (e.key === "w" || e.key === "W") {
        send("shop_action", { action: "send_mobs" });
      }
    } else if (playerId === 2) {
      if (e.key === "i" || e.key === "I") {
        send("shop_action", { action: "upgrade" });
      }
      if (e.key === "o" || e.key === "O") {
        send("shop_action", { action: "send_mobs" });
      }
    }
    if (e.code === "Space") {
      send("ready");
    }
  }

  // Game over restart
  if (st === "GAME_OVER") {
    if (e.key === "r" || e.key === "R" || e.key === "Enter") {
      send("restart");
    }
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
// Drawing helpers
// -----------------------------------------------------

function drawBackground() {
  const ground = assets.ground;
  if (ground) {
    for (let x = 0; x < SCREEN_WIDTH; x += TILE_SIZE) {
      for (let y = 0; y < SCREEN_HEIGHT; y += TILE_SIZE) {
        ctx.drawImage(ground, x, y, TILE_SIZE, TILE_SIZE);
      }
    }
  } else {
    ctx.fillStyle = "#303030";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  const fence = assets.fence;
  if (fence) {
    for (let y = 0; y < SCREEN_HEIGHT; y += TILE_SIZE) {
      ctx.drawImage(fence, FENCE_X - TILE_SIZE / 2, y, TILE_SIZE, TILE_SIZE);
    }
  } else {
    ctx.strokeStyle = "#553322";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(FENCE_X, 0);
    ctx.lineTo(FENCE_X, SCREEN_HEIGHT);
    ctx.stroke();
  }
}

function drawPlayers(players) {
  for (const p of players) {
    const img = p.side === "left" ? assets.player1 : assets.player2;
    const size = 40;
    if (img) {
      ctx.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
    } else {
      ctx.fillStyle = p.side === "left" ? "#4ab1ff" : "#ff5b5b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    const ratio = p.hp / p.maxHp;
    ctx.fillStyle = "#222";
    ctx.fillRect(p.x - 20, p.y - 30, 40, 6);
    ctx.fillStyle = "#0f0";
    ctx.fillRect(p.x - 20, p.y - 30, 40 * ratio, 6);
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
      const size = 32;
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

function drawSpawnWarnings(warnings) {
  for (const w of warnings) {
    let img = null;
    if (w.type === "slime") img = assets.slime;
    else if (w.type === "fast") img = assets.fast;
    else if (w.type === "tank") img = assets.tank;
    else if (w.type === "spitter") img = assets.spitter;

    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(w.timer * 10); // subtle blink

    if (img) {
      const size = 32;
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
  ctx.fillStyle = "#ffffff";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
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

function drawHudPlaying(state) {
  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");

  ctx.fillStyle = "#fff";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `Round ${state.round} – ${Math.max(0, state.waveLeft).toFixed(0)}s`,
    SCREEN_WIDTH / 2,
    24
  );

  ctx.font = "14px Arial";
  if (p1) {
    ctx.textAlign = "left";
    ctx.fillText(
      `P1 HP:${p1.hp} G:${p1.gold} ${p1.weaponType} L${p1.weaponLevel}`,
      20,
      20
    );
  }
  if (p2) {
    ctx.textAlign = "right";
    ctx.fillText(
      `P2 HP:${p2.hp} G:${p2.gold} ${p2.weaponType} L${p2.weaponLevel}`,
      SCREEN_WIDTH - 20,
      20
    );
  }
}

// -----------------------------------------------------
// Screens
// -----------------------------------------------------

function drawWeaponSelect(state) {
  ctx.fillStyle = "#191933";
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  ctx.fillStyle = "#fff";
  ctx.font = "28px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Choose Weapons", SCREEN_WIDTH / 2, 60);

  ctx.font = "14px Arial";
  ctx.fillText(
    "P1: 1=Knife,2=Axe,3=Spear,4=Bow   |   P2: 7=Knife,8=Axe,9=Spear,0=Bow",
    SCREEN_WIDTH / 2,
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
    if (player && player.hasChosenWeapon) {
      text = `Selected: ${player.weaponType}`;
    }
    ctx.fillStyle = player && player.hasChosenWeapon ? "#c8e5ff" : "#ff8080";
    ctx.fillText(text, x, y0 + 30);

    if (player && player.hasChosenWeapon && assets[player.weaponType]) {
      ctx.drawImage(assets[player.weaponType], x, y0 + 50, 32, 32);
    }

    const img = isLeft ? assets.player1 : assets.player2;
    if (img) {
      ctx.drawImage(img, x + 90, y0 + 40, 40, 40);
    }
  }

  panel(100, "Player 1 (WASD)", p1, true);
  panel(SCREEN_WIDTH - 300, "Player 2 (WASD)", p2, false);

  ctx.font = "14px Arial";
  ctx.fillStyle = "#ccc";
  ctx.textAlign = "center";
  ctx.fillText(
    "When both have selected, the first wave will start automatically.",
    SCREEN_WIDTH / 2,
    SCREEN_HEIGHT - 40
  );
}

function drawPlaying(state) {
  drawBackground();
  drawSpawnWarnings(state.spawnWarnings || []);
  drawMonsters(state.monsters || []);
  drawPickups(state.goldDrops || [], state.hearts || []);
  drawBullets(state.bullets || []);
  drawPlayers(state.players || []);
  drawHudPlaying(state);
}

function drawShop(state) {
  ctx.fillStyle = "#1e2038";
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  ctx.fillStyle = "#fff";
  ctx.font = "26px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`SHOP - Round ${state.round}`, SCREEN_WIDTH / 2, 40);

  ctx.font = "14px Arial";
  ctx.fillStyle = "#ddd";
  ctx.fillText(
    "P1: Q=Upgrade, W=Send mobs   |   P2: I=Upgrade, O=Send mobs   |   SPACE = Ready",
    SCREEN_WIDTH / 2,
    70
  );

  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");

  ctx.textAlign = "left";
  let y = 120;
  if (p1) {
    ctx.fillStyle = "#fff";
    ctx.fillText(
      `Player 1 (WASD) – HP:${p1.hp}  Gold:${p1.gold}  ${p1.weaponType} L${p1.weaponLevel}`,
      80,
      y
    );
    ctx.fillText(
      `Extra mobs queued on P2: ${state.extraQueueRight || 0}`,
      80,
      y + 20
    );
  }

  y = 200;
  if (p2) {
    ctx.fillStyle = "#fff";
    ctx.fillText(
      `Player 2 (WASD) – HP:${p2.hp}  Gold:${p2.gold}  ${p2.weaponType} L${p2.weaponLevel}`,
      80,
      y
    );
    ctx.fillText(
      `Extra mobs queued on P1: ${state.extraQueueLeft || 0}`,
      80,
      y + 20
    );
  }

  ctx.font = "14px Arial";
  ctx.fillStyle = "#ccc";
  ctx.textAlign = "center";
  ctx.fillText(
    `Shop ends in ${Math.max(0, state.shopLeft).toFixed(0)}s or when both are ready.`,
    SCREEN_WIDTH / 2,
    SCREEN_HEIGHT - 60
  );
}

function drawGameOver(state) {
  ctx.fillStyle = "#101020";
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  ctx.fillStyle = "#fff";
  ctx.font = "32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", SCREEN_WIDTH / 2, 60);

  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");

  let winnerText = "Game Over";
  if (p1 && p2) {
    if (p1.hp > 0 && p2.hp <= 0) winnerText = "Player 1 (WASD) wins!";
    else if (p2.hp > 0 && p1.hp <= 0) winnerText = "Player 2 (WASD) wins!";
    else if (p1.hp <= 0 && p2.hp <= 0) winnerText = "It's a draw! Both fell.";
  }

  ctx.font = "18px Arial";
  ctx.fillStyle = "#ddd";
  ctx.fillText(winnerText, SCREEN_WIDTH / 2, 100);

  ctx.font = "16px Arial";
  let y = 160;
  if (p1) {
    ctx.fillText(
      `P1 – Monsters killed: ${p1.monstersKilled}  |  Gold: ${p1.gold}  |  Score: ${p1.score}`,
      SCREEN_WIDTH / 2,
      y
    );
    y += 30;
  }
  if (p2) {
    ctx.fillText(
      `P2 – Monsters killed: ${p2.monstersKilled}  |  Gold: ${p2.gold}  |  Score: ${p2.score}`,
      SCREEN_WIDTH / 2,
      y
    );
  }

  ctx.font = "14px Arial";
  ctx.fillStyle = "#aaa";
  ctx.fillText(
    "Press R or ENTER to restart from Round 1 (new weapon select).",
    SCREEN_WIDTH / 2,
    SCREEN_HEIGHT - 60
  );
}

// -----------------------------------------------------
// Main render loop
// -----------------------------------------------------

function draw() {
  if (!assetsLoaded) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Loading assets...", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    requestAnimationFrame(draw);
    return;
  }

  if (!lastState) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Waiting for game state...", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    requestAnimationFrame(draw);
    return;
  }

  const st = lastState.state;
  if (st === "WEAPON_SELECT") {
    drawWeaponSelect(lastState);
  } else if (st === "PLAYING") {
    drawPlaying(lastState);
  } else if (st === "SHOP") {
    drawShop(lastState);
  } else if (st === "GAME_OVER") {
    drawGameOver(lastState);
  }

  requestAnimationFrame(draw);
}

// start
loadAssets(assetPaths).then(() => {
  requestAnimationFrame(draw);
});
