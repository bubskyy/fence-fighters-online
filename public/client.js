// public/client.js

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

// WebSocket to same host
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
  statusEl.textContent = "Connected, waiting for welcome...";
});

socket.addEventListener("message", event => {
  const msg = JSON.parse(event.data);

  if (msg.type === "welcome") {
    playerId = msg.playerId;
    statusEl.textContent = `Connected as Player ${playerId}`;
  } else if (msg.type === "state") {
    lastState = msg.state;
    if (lastState.state === "PLAYING") {
      // keep status simple
      statusEl.textContent = `Player ${playerId} – Round ${lastState.round}`;
    }
  } else if (msg.type === "game_over") {
    statusEl.textContent = "Game over – restarting...";
  }
});

socket.addEventListener("close", () => {
  statusEl.textContent = "Disconnected";
});

// Input: P1 = WASD, P2 = arrows
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

function sendInput() {
  if (socket.readyState === WebSocket.OPEN && playerId != null) {
    socket.send(JSON.stringify({ type: "input", keys: keyState }));
  }
}

// Very simple renderer
function draw() {
  ctx.fillStyle = "#202020";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (lastState) {
    // Fence
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();

    // Players
    for (const p of lastState.players) {
      ctx.fillStyle = p.side === "left" ? "#4ab1ff" : "#ff5b5b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();

      // HP bar
      const ratio = p.hp / p.maxHp;
      ctx.fillStyle = "#222";
      ctx.fillRect(p.x - 20, p.y - 30, 40, 6);
      ctx.fillStyle = "#0f0";
      ctx.fillRect(p.x - 20, p.y - 30, 40 * ratio, 6);
    }

    // Monsters
    for (const m of lastState.monsters) {
      let color = "#44dd88";
      if (m.type === "fast") color = "#ffd44a";
      else if (m.type === "tank") color = "#7b64d9";
      else if (m.type === "spitter") color = "#4ad0ff";
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bullets
    ctx.fillStyle = "#ffffff";
    for (const b of lastState.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
