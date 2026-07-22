import { io, Socket } from "socket.io-client";
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./protocol";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// A URL do servidor pode ser sobrescrita via VITE_SERVER_URL; por padrão
// assume o servidor local na porta 3001.
const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:3001`;

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: true, transports: ["websocket"] });
  }
  return socket;
}
