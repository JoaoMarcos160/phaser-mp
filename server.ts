import { Server } from "socket.io";
import { createServer } from "http";
import { readFileSync } from "node:fs";
import { join } from "path";

type Player = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const rooms = new Map<string, Map<string, Player>>();
const TICK_RATE = 20; // ticks per second
const FIXED_DT_MS = 1000 / TICK_RATE; // fixed timestep per simulation step (ms)
const MAX_ACCUM_MS = 250; // clamp max accumulated delta to avoid spiral of death
const SPEED = 150;
const WIDTH = 800;
const HEIGHT = 600;
const PLAYER_SIZE = 20;

// HTTP server to serve static files
const httpServer = createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const content = readFileSync(join(process.cwd(), "index.html"), "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(content);
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

const io = new Server(httpServer, {
  cors: { origin: "*" },
  transports: ["polling"],
});

io.on("connection", (socket) => {
  socket.on("join", ({ room }) => {
    socket.join(room);
    if (!rooms.has(room)) rooms.set(room, new Map());
    rooms.get(room)!.set(socket.id, {
      id: socket.id,
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
    });
  });

  socket.on("move", ({ dx, dy }) => {
    rooms.forEach((players) => {
      const p = players.get(socket.id);
      if (!p) return;
      p.vx = dx * SPEED;
      p.vy = dy * SPEED;
    });
  });

  socket.on("disconnect", () => {
    rooms.forEach((r) => r.delete(socket.id));
  });
});

// Fixed timestep loop with accumulator and emission at tick rate
let lastTime = Date.now();
let accum = 0;
let emitAccum = 0;

setInterval(() => {
  const now = Date.now();
  let delta = now - lastTime;
  lastTime = now;

  // clamp large deltas (e.g., when paused or slow host)
  if (delta > MAX_ACCUM_MS) delta = MAX_ACCUM_MS;

  accum += delta;
  emitAccum += delta;

  // perform fixed-step simulation updates
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

  // emit state at tick rate
  if (emitAccum >= FIXED_DT_MS) {
    rooms.forEach((players, room) => {
      io.to(room).emit("state", [...players.values()]);
    });
    emitAccum = emitAccum % FIXED_DT_MS;
  }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`listening on :${PORT}`);
});
