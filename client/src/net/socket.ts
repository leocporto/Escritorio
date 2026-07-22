import { io, Socket } from "socket.io-client";
import {
  ClientToServerEvents,
  ServerToClientEvents,
} from "./protocol";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// A URL do servidor pode ser sobrescrita via VITE_SERVER_URL. Sem ela:
//  - em produção (deploy único, servidor serve o site): mesma origem;
//  - em desenvolvimento (Vite em :5173): servidor local em :3001.
const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : window.location.origin);

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (!socket) {
    // Mantém "polling" como fallback além de "websocket": alguns hosts/proxies
    // exigem o handshake por polling antes de subir para WebSocket.
    socket = io(SERVER_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}
