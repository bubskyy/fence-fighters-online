// src/server/http_ws.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { GameCore } = require("../game/core");

const PORT = process.env.PORT || 3000;
const TICK_RATE = 30;
const publicDir = path.join(__dirname, "..", "..", "public");

// Basic static file server
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

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocket.Server({ server });

let game = new GameCore();
let tick = 0;

// Map ws -> { playerId, lastInput }
const clients = new Map();

wss.on("connection", ws => {
  console.log("Client connected");

  const usedIds = new Set([...clients.values()].map(c => c.playerId));
  let playerId = 1;
  if (usedIds.has(1)) playerId = 2;

  clients.set(ws, { playerId, lastInput: {} });
  ws.send(JSON.stringify({ type: "welcome", playerId }));

  ws.on("message", msg => {
    let data;
    try {
      data = JSON.parse(msg.toString());
    } catch {
      return;
    }
    if (data.type === "input") {
      const client = clients.get(ws);
      if (!client) return;
      client.lastInput = data.keys || {};
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log("Client disconnected");
  });
});

// Game loop
setInterval(() => {
  const inputs = {};
  for (const [ws, info] of clients.entries()) {
    inputs[info.playerId] = info.lastInput || {};
  }

  game.step(1 / TICK_RATE, inputs);
  const state = game.exportState();

  const payload = JSON.stringify({ type: "state", tick, state });
  for (const ws of clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }

  if (state.state === "GAME_OVER") {
    const statsPayload = JSON.stringify({
      type: "game_over",
      ...game.exportMatchStats()
    });
    for (const ws of clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(statsPayload);
      }
    }
    game.reset();
    tick = 0;
  } else {
    tick += 1;
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Fence Fighters server listening on port ${PORT}`);
});
