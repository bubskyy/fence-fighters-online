// public/client.js

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

const SCREEN_WIDTH = canvas.width;
const SCREEN_HEIGHT = canvas.height;
const FENCE_X = SCREEN_WIDTH / 2;
const TILE_SIZE = 64;

// -----------------------------------------------------
// Assets loading
// -----------------------------------------------------

const assetPaths = {
  // tiles
  ground: "assets/tiles/ground.png",
  fence: "assets/tiles/fence.png",

  // players
  player1: "assets/characters/player1.png",
  player2: "assets/characters/player2.png",

  // monsters
  slime: "assets/monsters/slime.png",
  fast: "assets/monsters/fast.png",
  tank: "assets/monsters/tank.png",
  spitter: "assets/monsters/spitter.png",

  // weapons (for future, e.g. drawing weapon in hand)
  knife: "assets/weapons/knife.png",
  axe: "assets/weapons/axe.png",
  spear: "assets/weapons/spear.png",
  bow: "assets/weapons/bow.png",
  arrow: "assets/weapons/arrow.png",

  // pickups (for future)
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
        console.warn("Failed to load", url, "– using fallback");
        // still resolve to not block game; just leave undefined
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
// WebSocket setup
// -----------------------------------------------------

const protocol = location.protocol === "https:" ? "wss" : "ws";
const wsUrl = `${protocol}://${location.host}`;
const socket = new WebSocket(wsUrl);

let playerId = null;
let lastState = null;

const keyState = {
  up: false,
  down: false,
  left: false,
  right: false
};

socket.addEventListener("open", () => {
  statusEl.textContent = "Connecting to game...";
});

socket.addEventListener("message", event => {
  const msg = JSON.parse(event.data);

  if (msg.type === "welcome") {
    playerId = msg.playerId;
    statusEl.textContent = `Connected as Player ${playerId} (P1=WASD, P2=Arrows)`;
  } else if (msg.type === "state") {
    lastState = msg.state;
  } else if (msg.type === "game_over") {
    // server auto-restarts match, we just show a message briefly
    statusEl.textContent = "Game over – restarting match...";
  }
});

socket.addEventListener("close", () => {
  statusEl.textContent = "Disconnected from server";
});

function sendInput() {
  if (socket.readyState === WebSocket.OPEN && playerId != null) {
    socket.send(JSON.stringify({ type: "input", keys: keyState }));
  }
}

// -----------------------------------------------------
// Input handling (P1: WASD, P2: Arrows)
// -----------------------------------------------------

window.addEventListener("keydown", e => {
  if (playerId === 1) {
    if (e.key === "w" || e.key === "W") keyState.up = true;
    if (e.key === "s" || e.key === "S") keyState.down = true;
    if (e.key === "a" || e.key === "A") keyState.left = true;
    if (e.key === "d" || e.key === "D") keyState.right = true;
  } else if (playerId === 2) {
    if (e.key === "ArrowUp") keyState.up = true;
    if (e.key === "ArrowDown") keyState.down = true;
    if (e.key === "ArrowLeft") keyState.left = true;
    if (e.key === "ArrowRight") keyState.right = true;
  }
  sendInput();
});

window.addEventListener("keyup", e => {
  if (playerId === 1) {
    if (e.key === "w" || e.key === "W") keyState.up = false;
    if (e.key === "s" || e.key === "S") keyState.down = false;
    if (e.key === "a" || e.key === "A") keyState.left = false;
    if (e.key === "d" || e.key === "D") keyState.right = false;
  } else if (playerId === 2) {
    if (e.key === "ArrowUp") keyState.up = false;
    if (e.key === "ArrowDown") keyState.down = false;
    if (e.key === "ArrowLeft") keyState.left = false;
    if (e.key === "ArrowRight") keyState.right = false;
  }
  sendInput();
});

// -----------------------------------------------------
// Drawing helpers
// -----------------------------------------------------

function drawTiledBackground() {
  // ground tiles
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

  // fence strip in the middle
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
    const img =
      p.side === "left"
        ? assets.player1 || null
        : assets.player2 || null;

    if (img) {
      const size = 40;
      ctx.drawImage(
        img,
        p.x - size / 2,
        p.y - size / 2,
        size,
        size
      );
    } else {
      // fallback circle
      ctx.fillStyle = p.side === "left" ? "#4ab1ff" : "#ff5b5b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // HP bar
    const ratio = p.hp / p.maxHp;
    ctx.fillStyle = "#222";
    ctx.fillRect(p.x - 20, p.y - 30, 40, 6);
    ctx.fillStyle = "#0f0";
    ctx.fillRect(p.x - 20, p.y - 30, 40 * ratio, 6);
  }
}

function drawMonsters(monsters) {
  for (const m of monsters) {
    const img =
      m.type === "slime" ? assets.slime :
      m.type === "fast" ? assets.fast :
      m.type === "tank" ? assets.tank :
      m.type === "spitter" ? assets.spitter :
      null;

    if (img) {
      const size = 32;
      ctx.drawImage(img, m.x - size / 2, m.y - size / 2, size, size);
    } else {
      // fallback colored circles
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

function drawBullets(bullets) {
  ctx.fillStyle = "#ffffff";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHud(state) {
  if (!state) return;

  // top text: round + timer
  ctx.fillStyle = "#ffffff";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    `Round ${state.round} – ${state.waveLeft.toFixed(0)}s`,
    SCREEN_WIDTH / 2,
    24
  );

  // players info at top corners
  ctx.textAlign = "left";
  const p1 = state.players.find(p => p.side === "left");
  const p2 = state.players.find(p => p.side === "right");
  if (p1) {
    ctx.fillText(
      `P1 HP:${p1.hp} G:${p1.gold} Score:${p1.score}`,
      20,
      20
    );
  }
  if (p2) {
    ctx.textAlign = "right";
    ctx.fillText(
      `P2 HP:${p2.hp} G:${p2.gold} Score:${p2.score}`,
      SCREEN_WIDTH - 20,
      20
    );
  }
}

// -----------------------------------------------------
// Main render loop
// -----------------------------------------------------

function draw() {
  if (!assetsLoaded) {
    // loading screen
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.fillStyle = "#fff";
    ctx.font = "24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Loading assets...", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
    requestAnimationFrame(draw);
    return;
  }

  // background + fence
  drawTiledBackground();

  if (lastState) {
    drawPlayers(lastState.players || []);
    drawMonsters(lastState.monsters || []);
    drawBullets(lastState.bullets || []);
    drawHud(lastState);
  }

  requestAnimationFrame(draw);
}

// Kick everything off: load assets then start rendering
loadAssets(assetPaths).then(() => {
  requestAnimationFrame(draw);
});
