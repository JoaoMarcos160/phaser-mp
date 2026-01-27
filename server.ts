import { Server } from "socket.io";
import { createServer } from "http";

type Player = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const rooms = new Map<string, Map<string, Player>>();
const TICK = 50;
const SPEED = 150;

// HTTP server to serve static files
const httpServer = createServer(async (req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const file = Bun.file("./index.html");
    const content = await file.text();
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

setInterval(() => {
  rooms.forEach((players, room) => {
    players.forEach((p) => {
      p.x += p.vx * (TICK / 1000);
      p.y += p.vy * (TICK / 1000);
    });

    io.to(room).emit("state", [...players.values()]);
  });
}, TICK);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`listening on :${PORT}`);
});
