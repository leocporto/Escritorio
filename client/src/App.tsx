import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "./net/socket";
import { WebRTCManager } from "./net/webrtc";
import { PlayerState } from "./net/protocol";
import { PhaserGame } from "./game/PhaserGame";
import { Chat } from "./ui/Chat";
import { VideoGrid } from "./ui/VideoGrid";
import { Controls } from "./ui/Controls";

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];

interface Session {
  selfId: string;
  name: string;
  color: string;
  players: PlayerState[];
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  if (!session) return <JoinScreen onJoin={setSession} />;
  return <Room session={session} />;
}

/* ------------------------------------------------------------------ */
/* Tela de entrada                                                     */
/* ------------------------------------------------------------------ */
function JoinScreen({ onJoin }: { onJoin: (s: Session) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[1]);
  const [connecting, setConnecting] = useState(false);

  function join() {
    const finalName = name.trim() || "Anon";
    setConnecting(true);
    const socket = getSocket();
    socket.emit("join", { name: finalName, color });
    socket.once("init", ({ selfId, players }) => {
      onJoin({ selfId, name: finalName, color, players });
    });
  }

  return (
    <div className="join-overlay">
      <div className="join-card">
        <h1>Guther</h1>
        <p>Entre no espaço virtual e ande pelo mapa para conversar.</p>

        <div className="field">
          <label>Seu nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Léo"
            maxLength={20}
            onKeyDown={(e) => e.key === "Enter" && join()}
            autoFocus
          />
        </div>

        <div className="field">
          <label>Cor do avatar</label>
          <div className="colors">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-dot${c === color ? " selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`cor ${c}`}
              />
            ))}
          </div>
        </div>

        <button className="btn-primary" onClick={join} disabled={connecting}>
          {connecting ? "Entrando…" : "Entrar"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sala (jogo + UI)                                                    */
/* ------------------------------------------------------------------ */
function Room({ session }: { session: Session }) {
  const { selfId, name, color, players } = session;

  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.name])),
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    { id: string; stream: MediaStream }[]
  >([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasMedia, setHasMedia] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);

  // Inicializa rede + mídia + WebRTC ao montar a sala; limpa ao desmontar.
  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    const manager = new WebRTCManager(socket, selfId, {
      onStream: (id, stream) => {
        setRemoteStreams((prev) => {
          const rest = prev.filter((r) => r.id !== id);
          return [...rest, { id, stream }];
        });
      },
      onPeerClosed: (id) => {
        setRemoteStreams((prev) => prev.filter((r) => r.id !== id));
      },
    });

    const onJoined = ({ player }: { player: PlayerState }) =>
      setNames((n) => ({ ...n, [player.id]: player.name }));
    const onLeft = ({ id }: { id: string }) =>
      setNames((n) => {
        const rest = { ...n };
        delete rest[id];
        return rest;
      });
    const onNearby = ({ peers }: { peers: string[] }) =>
      manager.updatePeers(peers);

    socket.on("player-joined", onJoined);
    socket.on("player-left", onLeft);
    socket.on("nearby-update", onNearby);

    // Solicita câmera/microfone.
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setHasMedia(true);
        manager.setLocalStream(stream);
      })
      .catch((err) => {
        console.warn("[media] sem acesso a câmera/microfone:", err);
        setHasMedia(false);
      });

    return () => {
      cancelled = true;
      socket.off("player-joined", onJoined);
      socket.off("player-left", onLeft);
      socket.off("nearby-update", onNearby);
      manager.destroy();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setMicOn((on) => {
      const next = !on;
      stream.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setCamOn((on) => {
      const next = !on;
      stream.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  return (
    <>
      <PhaserGame
        selfId={selfId}
        name={name}
        color={color}
        players={players}
      />
      <div className="hud-hint">Use as setas ou WASD para se mover</div>
      <VideoGrid
        localStream={localStream}
        camOn={camOn}
        remoteStreams={remoteStreams}
        names={names}
      />
      <Controls
        micOn={micOn}
        camOn={camOn}
        hasMedia={hasMedia}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
      />
      <Chat selfId={selfId} />
    </>
  );
}
