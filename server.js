const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_, res) => res.json({ ok: true, game: "RecWorld" }));

const players = new Map();
const rooms = new Map([
  ["Plaza", { name: "Plaza", description: "The main social hangout", capacity: 24 }],
  ["Chill Lounge", { name: "Chill Lounge", description: "A quieter place to meet", capacity: 16 }]
]);
const objects = new Map();

function publicPlayer(p) {
  return { id: p.id, name: p.name, color: p.color, x: p.x, y: p.y, z: p.z,
    rot: p.rot, room: p.room, pose: p.pose };
}
function roomSnapshot(room) {
  return {
    players: [...players.values()].filter(p => p.room === room).map(publicPlayer),
    objects: [...objects.values()].filter(o => o.room === room)
  };
}
function sendRoom(room) {
  io.to(room).emit("room:snapshot", roomSnapshot(room));
  io.to(room).emit("room:counts", [...rooms.keys()].map(name => ({
    name, count: [...players.values()].filter(p => p.room === name).length,
    capacity: rooms.get(name).capacity, description: rooms.get(name).description
  })));
}

io.on("connection", socket => {
  const player = {
    id: socket.id, name: "Guest", color: "#56c8f5",
    x: (Math.random() - .5) * 5, y: 0, z: (Math.random() - .5) * 5,
    rot: 0, room: "Plaza", pose: "idle"
  };
  players.set(socket.id, player);
  socket.join(player.room);

  socket.emit("welcome", { id: socket.id, player: publicPlayer(player), rooms: [...rooms.values()] });
  sendRoom(player.room);

  socket.on("profile:update", data => {
    if (!data || typeof data !== "object") return;
    player.name = String(data.name || "Guest").trim().slice(0, 18) || "Guest";
    if (/^#[0-9a-fA-F]{6}$/.test(data.color)) player.color = data.color;
    io.to(player.room).emit("player:update", publicPlayer(player));
  });

  socket.on("player:move", data => {
    if (!data || ![data.x, data.y, data.z, data.rot].every(Number.isFinite)) return;
    player.x = Math.max(-45, Math.min(45, data.x));
    player.y = Math.max(0, Math.min(5, data.y));
    player.z = Math.max(-45, Math.min(45, data.z));
    player.rot = data.rot;
    player.pose = data.pose === "walk" ? "walk" : "idle";
    socket.to(player.room).emit("player:move", publicPlayer(player));
  });

  socket.on("room:join", roomName => {
    const room = rooms.get(String(roomName));
    if (!room || [...players.values()].filter(p => p.room === roomName).length >= room.capacity) return;
    const oldRoom = player.room;
    socket.leave(oldRoom);
    player.room = roomName;
    player.x = (Math.random() - .5) * 5;
    player.z = (Math.random() - .5) * 5;
    socket.join(roomName);
    sendRoom(oldRoom);
    sendRoom(roomName);
    socket.emit("room:joined", { room: roomName });
  });

  socket.on("chat:send", message => {
    const text = String(message || "").trim().slice(0, 180);
    if (!text) return;
    io.to(player.room).emit("chat:message", {
      id: socket.id, name: player.name, text, time: Date.now()
    });
  });

  socket.on("object:create", data => {
    if (!data || ![data.x, data.z].every(Number.isFinite)) return;
    const obj = {
      id: `${socket.id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      room: player.room, owner: player.name,
      x: Math.max(-40, Math.min(40, data.x)),
      z: Math.max(-40, Math.min(40, data.z)),
      color: /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : "#f4b942",
      shape: data.shape === "sphere" ? "sphere" : "box"
    };
    objects.set(obj.id, obj);
    io.to(player.room).emit("object:add", obj);
  });

  socket.on("object:remove", id => {
    const obj = objects.get(String(id));
    if (!obj || (obj.owner !== player.name && player.name !== "Builder")) return;
    objects.delete(obj.id);
    io.to(player.room).emit("object:remove", obj.id);
  });

  socket.on("disconnect", () => {
    const room = player.room;
    players.delete(socket.id);
    sendRoom(room);
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`RecWorld running on ${PORT}`));
