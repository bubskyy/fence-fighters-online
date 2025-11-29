// src/server/ws_lobby.js
// Minimal WebSocket server just for role assignment & readiness.

const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3001;

// Basic HTTP server just to have something for ws to attach to
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Fence Fighters WS lobby running.\n");
});

const wss = new WebSocket.Server({ server });

let players = {
  p1: null,
  p2: null,
};

function broadcastStatus() {
  const bothReady = !!players.p1 && !!players.p2;
  const msg = JSON.stringify({
    type: "status",
    bothReady,
    connected: {
      p1: !!players.p1,
      p2: !!players.p2,
    },
  });

  if (players.p1 && players.p1.readyState === WebSocket.OPEN) {
    players.p1.send(msg);
  }
  if (players.p2 && players.p2.readyState === WebSocket.OPEN) {
    players.p2.send(msg);
  }
}

wss.on("connection", (ws) => {
  let role = null;

  if (!players.p1) {
    role = "p1";
    players.p1 = ws;
  } else if (!players.p2) {
    role = "p2";
    players.p2 = ws;
  } else {
    // room full
    ws.send(JSON.stringify({ type: "room_full" }));
    ws.close();
    return;
  }

  console.log(`Client connected as ${role}`);

  // tell this client its role
  ws.send(JSON.stringify({ type: "role", role }));

  // notify both about who is connected
  broadcastStatus();

  ws.on("close", () => {
    console.log(`${role} disconnected`);
    if (players[role] === ws) {
      players[role] = null;
    }
    broadcastStatus();
  });

  ws.on("error", (err) => {
    console.error(`WS error (${role}):`, err);
  });

  // incoming messages from clients (we'll use this later for inputs/game state)
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // For now, we ignore messages. Later we can use them for input sync.
    } catch (e) {
      console.error("Bad message:", e);
    }
  });
});

server.listen(PORT, () => {
  console.log(`WS lobby listening on port ${PORT}`);
});
