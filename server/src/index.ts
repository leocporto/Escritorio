import { createServer } from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { GameState } from "./gameState.js";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  PlayerState,
} from "./protocol.js";

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "*";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
});

const state = new GameState();

// Pontos de spawn possíveis (em pixels do mundo).
const SPAWNS = [
  { x: 200, y: 200 },
  { x: 320, y: 240 },
  { x: 240, y: 320 },
  { x: 400, y: 200 },
];

// Guarda o último conjunto de vizinhos conhecido por player para emitir só em mudança.
const lastNearby = new Map<string, Set<string>>();

function sameSet(a: Set<string>, b: string[]): boolean {
  if (a.size !== b.length) return false;
  for (const id of b) if (!a.has(id)) return false;
  return true;
}

/**
 * Recalcula a proximidade envolvendo `movedId` e notifica os players cujo
 * conjunto de vizinhos mudou. A vizinhança é simétrica, então só é preciso
 * revisitar o próprio player que se moveu e os que estavam/estão perto dele.
 */
function refreshProximity(movedId: string): void {
  const affected = new Set<string>([movedId]);
  for (const id of lastNearby.get(movedId) ?? []) affected.add(id);
  for (const id of state.getNearby(movedId)) affected.add(id);

  for (const id of affected) {
    const nearby = state.getNearby(id);
    const prev = lastNearby.get(id);
    if (!prev || !sameSet(prev, nearby)) {
      lastNearby.set(id, new Set(nearby));
      io.to(id).emit("nearby-update", { peers: nearby });
    }
  }
}

io.on("connection", (socket) => {
  socket.on("join", ({ name, color }) => {
    const spawn = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    const player: PlayerState = {
      id: socket.id,
      name: (name || "Anon").slice(0, 20),
      color: color || "#3498db",
      x: spawn.x,
      y: spawn.y,
      dir: "down",
    };
    state.addPlayer(player);
    lastNearby.set(socket.id, new Set());

    // Envia o estado atual para quem entrou e avisa os demais.
    socket.emit("init", { selfId: socket.id, players: state.getAll() });
    socket.broadcast.emit("player-joined", { player });
    refreshProximity(socket.id);
  });

  socket.on("move", ({ x, y, dir }) => {
    if (!state.getPlayer(socket.id)) return;
    state.updatePosition(socket.id, x, y, dir);
    socket.broadcast.emit("player-moved", { id: socket.id, x, y, dir });
    refreshProximity(socket.id);
  });

  socket.on("chat", ({ text }) => {
    const player = state.getPlayer(socket.id);
    if (!player) return;
    const clean = (text || "").slice(0, 500).trim();
    if (!clean) return;
    io.emit("chat-message", {
      from: socket.id,
      name: player.name,
      text: clean,
      ts: Date.now(),
    });
  });

  // Repasse opaco da sinalização WebRTC para o peer alvo.
  socket.on("webrtc-signal", ({ to, data }) => {
    io.to(to).emit("webrtc-signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    if (!state.getPlayer(socket.id)) return;
    const wasNearby = [...(lastNearby.get(socket.id) ?? [])];
    state.removePlayer(socket.id);
    lastNearby.delete(socket.id);
    io.emit("player-left", { id: socket.id });
    // Recalcula proximidade dos que estavam perto do player que saiu.
    for (const id of wasNearby) refreshProximity(id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[guther] servidor ouvindo em http://localhost:${PORT}`);
});
