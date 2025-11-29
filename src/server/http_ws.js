// src/server/http_ws.js
// Express static server + WebSocket lobby for Fence Fighters

const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const app = express();

// Serve static files from /public
const publicDir = path.join(__dirname, "..", "..", "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// --- Lobby / roles ---

let nextClientId = 1;
const clients = new Map(); // ws -> { id, role }
let roleToClient = { p1: null, p2: null };

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function sendLobbyState() {
  const lobby = {
    type: "lobby",
    p1: !!roleToClient.p1,
    p2: !!roleToClient.p2,
  };
  broadcast(lobby);
}

wss.on("connection", (ws) => {
  const id = nextClientId++;
  // Assign role: first p1, second p2, rest spectators
  let role = "spectator";
  if (!roleToClient.p1) {
    role = "p1";
    roleToClient.p1 = ws;
  } else if (!roleToClient.p2) {
    role = "p2";
    roleToClient.p2 = ws;
  }

  clients.set(ws, { id, role });
  console.log(`Client ${id} connected as ${role}`);

  // Tell the client who it is
  ws.send(
    JSON.stringify({
      type: "hello",
      id,
      role,
    })
  );

  // Update lobby for everyone
  sendLobbyState();

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    // Forward player state to everyone else
    if (msg.type === "player_state") {
      // tiny payload, no heavy sim on server
      for (const [otherWs, info] of clients.entries()) {
        if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN) {
          otherWs.send(
            JSON.stringify({
              type: "player_state",
              role: msg.role,
              x: msg.x,
              y: msg.y,
              hp: msg.hp,
              gold: msg.gold,
              score: msg.score,
              monstersKilled: msg.monstersKilled,
            })
          );
        }
      }
    }
  });

  ws.on("close", () => {
    console.log(`Client ${id} disconnected`);
    const info = clients.get(ws);
    if (info) {
      if (info.role === "p1") roleToClient.p1 = null;
      if (info.role === "p2") roleToClient.p2 = null;
    }
    clients.delete(ws);
    sendLobbyState();
  });
});

server.listen(PORT, () => {
  console.log(`Fence Fighters server listening on port ${PORT}`);
});
