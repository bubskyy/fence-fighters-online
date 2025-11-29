// src/server/http_ws.js
// HTTP + WebSocket server for Fence Fighters Online

const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { GameCore } = require("../game/core");

const PORT = process.env.PORT || 3000;

const app = express();

// Serve static files from public/
const publicDir = path.join(__dirname, "..", "..", "public");
app.use(express.static(publicDir));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Game state ---
const game = new GameCore();

// Inputs per player id
const inputs = {
  1: { up: false, down: false, left: false, right: false },
  2: { up: false, down: false, left: false, right: false }
};

// Map ws -> { playerId }
const clients = new Map();

// --- Broadcast game state to all connected clients ---
function broadcastState() {
  const state = game.exportState();
  if (!state) return;

  const msg = JSON.stringify({ type: "state", state });

  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// --- Game loop (tick) ---
let lastTime = Date.now();
const TICK_RATE = 120;           // run at 60 ticks per second
const MAX_DT = 0.05;            // clamp big spikes (e.g. debugger pauses)

setInterval(() => {
  const now = Date.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  if (dt > MAX_DT) {
    dt = MAX_DT;
  }

  game.step(dt, inputs);
  broadcastState();
}, 1000 / TICK_RATE);


// --- WebSocket handling ---
wss.on("connection", ws => {
  console.log("Client connected");

  // Assign player 1 or 2 if there is a free slot; otherwise spectator
  const used = new Set(
    [...clients.values()]
      .map(info => info.playerId)
      .filter(id => id != null)
  );

  let playerId = null;
  if (!used.has(1)) playerId = 1;
  else if (!used.has(2)) playerId = 2;

  if (playerId != null) {
    clients.set(ws, { playerId });
    inputs[playerId] = { up: false, down: false, left: false, right: false };

    ws.send(JSON.stringify({ type: "welcome", playerId }));
    console.log(`Assigned as Player ${playerId}`);
  } else {
    // extra connections become spectators
    clients.set(ws, { playerId: null });
    ws.send(JSON.stringify({ type: "welcome", playerId: null }));
    console.log("Assigned as spectator");
  }

  ws.on("message", data => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      console.warn("Bad JSON from client:", e);
      return;
    }

    if (!msg.type) return;

    // Movement input from client.js
    if (msg.type === "input" && playerId != null) {
      inputs[playerId] = {
        up: !!msg.keys?.up,
        down: !!msg.keys?.down,
        left: !!msg.keys?.left,
        right: !!msg.keys?.right
      };
    }

    // Weapon selection in WEAPON_SELECT phase
    else if (msg.type === "weapon_select" && playerId != null) {
      if (msg.weaponType) {
        game.handleWeaponChoice(playerId, msg.weaponType);
      }
    }

    // Shop actions in SHOP phase
    else if (msg.type === "shop_action" && playerId != null) {
      if (msg.action) {
        game.handleShopAction(playerId, msg.action);
      }
    }

    // Ready up in SHOP to start next round
    else if (msg.type === "ready" && playerId != null) {
      game.handleReady(playerId);
    }

    // Restart after GAME_OVER
    else if (msg.type === "restart") {
      game.handleRestart();
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");

    clients.delete(ws);

    if (playerId != null) {
      // Reset inputs for that slot
      inputs[playerId] = { up: false, down: false, left: false, right: false };
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Fence Fighters server running on port ${PORT}`);
});
