import sizeOf from "image-size";

type Player = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type WebSocketData = {
  id: string;
  room: string | null;
};

const rooms = new Map<string, Map<string, Player>>();
const clients = new Map<string, WebSocket>();
const TICK_RATE = 20; // ticks per second
const FIXED_DT_MS = 1000 / TICK_RATE; // ms per simulation step
const MAX_ACCUM_MS = 250; // clamp maximum delta
const SPEED = 150;

//Map dimensions
const mapPath = "mapa_redimensionado.jpg";
const mapBuffer = await Bun.file(mapPath).arrayBuffer();
const { width: WIDTH, height: HEIGHT } = sizeOf(new Uint8Array(mapBuffer));
const PLAYER_SIZE = 20;

let idCounter = 0;
function generateId(): string {
  return `player-${++idCounter}-${Date.now().toString(36)}`;
}

const server = Bun.serve<WebSocketData>({
  port: process.env.PORT || 3000,

  routes: {
    "/": async () => {
      const file = Bun.file("index-bun.html");
      return new Response(file, {
        headers: { "Content-Type": "text/html" },
      });
    },
  },
  fetch(req, server) {
    const url = new URL(req.url);

    // Upgrade WebSocket connection
    if (url.pathname === "/ws") {
      const id = generateId();
      const upgraded = server.upgrade(req, {
        data: { id, room: null },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Serve static files (simple)
    const pathname = url.pathname === "/" ? "/index-bun.html" : url.pathname;
    const filePath = pathname.slice(1);
    try {
      const file = Bun.file(filePath);
      const ext = filePath.split(".").pop()?.toLowerCase();
      const ct = (() => {
        switch (ext) {
          case "jpg":
          case "jpeg":
            return "image/jpeg";
          case "png":
            return "image/png";
          case "js":
            return "application/javascript";
          case "html":
            return "text/html";
          default:
            return "application/octet-stream";
        }
      })();
      return new Response(file, { headers: { "Content-Type": ct } });
    } catch (e) {
      console.error(`404: ${filePath}`);
      return new Response("Not found", { status: 404 });
    }
  },

  websocket: {
    open(ws) {
      clients.set(ws.data.id, ws as unknown as WebSocket);
      ws.send(JSON.stringify({ type: "connected", id: ws.data.id }));
    },

    message(ws, message) {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case "join": {
            const room = data.room;
            ws.data.room = room;
            ws.subscribe(room);

            if (!rooms.has(room)) {
              rooms.set(room, new Map());
            }
            rooms.get(room)!.set(ws.data.id, {
              id: ws.data.id,
              x: 100,
              y: 100,
              vx: 0,
              vy: 0,
            });
            break;
          }

          case "move": {
            const { dx, dy } = data;
            rooms.forEach((players) => {
              const p = players.get(ws.data.id);
              if (!p) return;
              p.vx = dx * SPEED;
              p.vy = dy * SPEED;
            });
            break;
          }
        }
      } catch (e) {
        console.error("Invalid message:", e);
      }
    },

    close(ws) {
      clients.delete(ws.data.id);
      if (ws.data.room) {
        ws.unsubscribe(ws.data.room);
        const roomPlayers = rooms.get(ws.data.room);
        if (roomPlayers) {
          roomPlayers.delete(ws.data.id);
          if (roomPlayers.size === 0) {
            rooms.delete(ws.data.room);
          }
        }
      }
    },
  },
});

// Game loop - fixed timestep with accumulator and clamped delta
let lastTime = Date.now();
let accum = 0;
let emitAccum = 0;

setInterval(() => {
  const now = Date.now();
  let delta = now - lastTime;
  lastTime = now;

  if (delta > MAX_ACCUM_MS) delta = MAX_ACCUM_MS;

  accum += delta;
  emitAccum += delta;

  while (accum >= FIXED_DT_MS) {
    rooms.forEach((players) => {
      const half = PLAYER_SIZE / 2;
      players.forEach((p) => {
        p.x += p.vx * (FIXED_DT_MS / 1000);
        p.y += p.vy * (FIXED_DT_MS / 1000);

        if (p.x < half) p.x = half;
        if (p.x > WIDTH - half) p.x = WIDTH - half;
        if (p.y < half) p.y = half;
        if (p.y > HEIGHT - half) p.y = HEIGHT - half;
      });
    });

    accum -= FIXED_DT_MS;
  }

  if (emitAccum >= FIXED_DT_MS) {
    rooms.forEach((players, room) => {
      const state = JSON.stringify({
        type: "state",
        players: [...players.values()],
      });
      server.publish(room, state);
    });
    emitAccum = emitAccum % FIXED_DT_MS;
  }
}, 1000 / 60);

console.log(`listening on :${server.port}`);
