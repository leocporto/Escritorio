// Contrato de eventos/payloads compartilhado entre cliente e servidor.
// Mantido idêntico em server/src/protocol.ts.

export type Direction = "down" | "up" | "left" | "right";

export interface PlayerState {
  id: string;
  name: string;
  /** cor do avatar (hex, ex.: "#e74c3c") */
  color: string;
  x: number;
  y: number;
  dir: Direction;
}

export interface ChatMessage {
  from: string; // id do remetente
  name: string; // nome do remetente
  text: string;
  ts: number;
}

/** Dados de sinalização WebRTC repassados opacamente pelo servidor. */
export type SignalData =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };

// ---- Cliente -> Servidor ----
export interface ClientToServerEvents {
  join: (payload: { name: string; color: string }) => void;
  move: (payload: { x: number; y: number; dir: Direction }) => void;
  chat: (payload: { text: string }) => void;
  "webrtc-signal": (payload: { to: string; data: SignalData }) => void;
}

// ---- Servidor -> Cliente ----
export interface ServerToClientEvents {
  init: (payload: { selfId: string; players: PlayerState[] }) => void;
  "player-joined": (payload: { player: PlayerState }) => void;
  "player-moved": (payload: {
    id: string;
    x: number;
    y: number;
    dir: Direction;
  }) => void;
  "player-left": (payload: { id: string }) => void;
  "chat-message": (payload: ChatMessage) => void;
  /** ids dos peers atualmente dentro do raio de proximidade */
  "nearby-update": (payload: { peers: string[] }) => void;
  "webrtc-signal": (payload: { from: string; data: SignalData }) => void;
}

/** Raio de proximidade em pixels do mundo para ativar vídeo/áudio. */
export const PROXIMITY_RADIUS = 160;
