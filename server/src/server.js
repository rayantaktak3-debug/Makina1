import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { createGameManager } from "./game.js";

const app = express();
app.use(cors());

app.get("/", (_req, res) => {
  res.json({ ok: true, name: "Advanced Coup Server" });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});
const game = createGameManager();

function emitRoom(room) {
  room.players.forEach((player) => {
    io.to(player.socketId).emit("room:update", game.getStateFor(room, player.socketId));
  });
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }, cb) => {
    const room = game.createRoom(name, socket.id);
    socket.join(room.code);
    emitRoom(room);
    cb?.({ ok: true, code: room.code });
  });

  socket.on("room:join", ({ code, name }, cb) => {
    const result = game.joinRoom((code || "").toUpperCase(), name, socket.id);
    if (!result.ok) return cb?.(result);
    socket.join(result.room.code);
    emitRoom(result.room);
    cb?.({ ok: true, code: result.room.code });
  });

  socket.on("game:start", ({ code }, cb) => {
    const result = game.startGame((code || "").toUpperCase(), socket.id);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:play", (payload, cb) => {
    const result = game.performAction(socket.id, payload);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:pass", (_payload, cb) => {
    const result = game.passResponse(socket.id);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:block", ({ claimedRole }, cb) => {
    const result = game.blockAction(socket.id, claimedRole);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:challenge", (_payload, cb) => {
    const result = game.challenge(socket.id);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:stop-coup", (_payload, cb) => {
    const result = game.payToStopCoup(socket.id);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:business-tax", (_payload, cb) => {
    const result = game.claimBusinessTax(socket.id);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:exchange-choose", ({ keepIds }, cb) => {
    const result = game.chooseExchange(socket.id, keepIds);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("action:lose-card", ({ influenceId }, cb) => {
    const result = game.chooseLostInfluence(socket.id, influenceId);
    if (!result.ok) return cb?.(result);
    emitRoom(result.room);
    cb?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const room = game.disconnect(socket.id);
    if (room) emitRoom(room);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Advanced Coup server running on http://localhost:${PORT}`);
});
