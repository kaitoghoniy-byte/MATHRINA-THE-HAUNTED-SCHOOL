
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 35;
const rooms = new Map();

app.use(express.static(__dirname));

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    game: "MATHRINA",
    rooms: rooms.size
  });
});

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

function cleanName(name) {
  if (typeof name !== "string") return "Guest";
  return name.trim().replace(/[<>]/g, "").slice(0, 16) || "Guest";
}

function getPlayerList(room) {
  return Array.from(room.players.values()).map(player => ({
    id: player.id,
    nickname: player.nickname
  }));
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  const room = rooms.get(code);
  socket.data.roomCode = null;

  if (!room) return;

  room.players.delete(socket.id);
  socket.leave(code);

  io.to(code).emit("room:players", getPlayerList(room));
  io.to(code).emit("player:left", {
    id: socket.id
  });

  if (room.players.size === 0) {
    rooms.delete(code);
  } else if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
    io.to(code).emit("room:host", {
      hostId: room.hostId
    });
  }
}

io.on("connection", socket => {
  socket.on("room:create", (data = {}, callback) => {
    leaveRoom(socket);

    const code = makeRoomCode();
    const player = {
      id: socket.id,
      guestId: String(data.guestId || "").slice(0, 40),
      nickname: cleanName(data.nickname)
    };

    const room = {
      hostId: socket.id,
      players: new Map([[socket.id, player]])
    };

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    if (typeof callback === "function") {
      callback({
        success: true,
        code,
        hostId: room.hostId,
        players: getPlayerList(room)
      });
    }

    io.to(code).emit("room:players", getPlayerList(room));
  });

  socket.on("room:join", (data = {}, callback) => {
    const code = String(data.code || "").trim().toUpperCase();

    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      if (typeof callback === "function") {
        callback({ success: false, message: "Kode room tidak valid." });
      }
      return;
    }

    const room = rooms.get(code);

    if (!room) {
      if (typeof callback === "function") {
        callback({ success: false, message: "Room tidak ditemukan." });
      }
      return;
    }

    if (room.players.size >= MAX_PLAYERS) {
      if (typeof callback === "function") {
        callback({ success: false, message: "Room sudah penuh." });
      }
      return;
    }

    leaveRoom(socket);

    const player = {
      id: socket.id,
      guestId: String(data.guestId || "").slice(0, 40),
      nickname: cleanName(data.nickname)
    };

    room.players.set(socket.id, player);
    socket.join(code);
    socket.data.roomCode = code;

    if (typeof callback === "function") {
      callback({
        success: true,
        code,
        hostId: room.hostId,
        players: getPlayerList(room)
      });
    }

    socket.to(code).emit("player:joined", player);
    io.to(code).emit("room:players", getPlayerList(room));
  });

  socket.on("player:move", (data = {}) => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || !room.players.has(socket.id)) return;

    const values = [
      data.x, data.y, data.z, data.rotationY
    ];

    if (!values.every(value =>
      typeof value === "number" && Number.isFinite(value)
    )) return;

    const movement = {
      id: socket.id,
      x: Math.max(-500, Math.min(500, data.x)),
      y: Math.max(-50, Math.min(100, data.y)),
      z: Math.max(-500, Math.min(500, data.z)),
      rotationY: data.rotationY
    };

    socket.to(code).volatile.emit("player:moved", movement);
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MATHRINA server running on port ${PORT}`);
});
