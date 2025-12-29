// src/server/http_ws.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { GameCore } = require("../game/core");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30;
const publicDir = path.join(__dirname, "..", "..", "public");

// Static file server (serves public/)
const server = http.createServer((req, res) => {
  let filePath = req.url;
  if (!filePath || filePath === "/") {
    filePath = "/index.html";
  }

  const safePath = filePath.replace("..", "");
  const fullPath = path.join(publicDir, safePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    let contentType = "text/plain";
    if (filePath.endsWith(".html")) contentType = "text/html";
    else if (filePath.endsWith(".js")) contentType = "text/javascript";
    else if (filePath.endsWith(".css")) contentType = "text/css";
    else if (filePath.endsWith(".png")) contentType = "image/png";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

let game = new GameCore();

// Map ws -> { playerId, lastInput, lastInputAt }
const clients = new Map();

wss.on("connection", ws => {
  console.log("Client connected");

  const usedIds = new Set([...clients.values()].map(c => c.playerId));
  let playerId = 0; // 0 = spectator
  if (!usedIds.has(1)) playerId = 1;
  else if (!usedIds.has(2)) playerId = 2;
  clients.set(ws, { playerId, lastInput: {}, lastInputAt: Date.now() });

  ws.send(JSON.stringify({ type: "welcome", playerId }));

  ws.on("message", msg => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }

    const client = clients.get(ws);
    if (!client) return;
    // spectators should not control the game
    if (client.playerId === 0) return;

    if (data.type === "input") {
      // movement input
      client.lastInput = data.keys || {};
      client.lastInputAt = Date.now();
    } else if (data.type === "weapon_select") {
      // weapon select in WEAPON_SELECT state
      const weapon = data.weaponType;
      game.handleWeaponChoice(client.playerId, weapon);
    } else if (data.type === "shop_action") {
      // upgrade / send_mobs in SHOP state
      const action = data.action;
      game.handleShopAction(client.playerId, action);
    } else if (data.type === "ready") {
      // player ready in SHOP
      game.handleReady(client.playerId);
    } else if (data.type === "restart") {
      // restart from GAME_OVER
      game.handleRestart();
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("Client disconnected");
  });
});

// Game loop
setInterval(() => {
  // collect inputs for each player
  const inputs = {};
  const now = Date.now();
  for (const [_ws, info] of clients.entries()) {
    if (info.playerId === 1 || info.playerId === 2) {
      // If a client gets "stuck" (tab loses focus and never sends keyup),
      // treat old input as empty after a short timeout.
      const ageMs = now - (info.lastInputAt || 0);
      inputs[info.playerId] = ageMs > 250 ? {} : info.lastInput || {};
    }
  }

  game.step(1 / TICK_RATE, inputs);
  const state = game.exportState();

  const payload = JSON.stringify({ type: "state", state });
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Fence Fighters server listening on port ${PORT}`);
});
