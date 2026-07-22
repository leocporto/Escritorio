import { GameSocket } from "./socket";
import { SignalData } from "./protocol";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface WebRTCCallbacks {
  onStream: (peerId: string, stream: MediaStream) => void;
  onPeerClosed: (peerId: string) => void;
}

/**
 * Gerencia as conexões WebRTC (topologia mesh) com os peers próximos.
 * Abre conexões para peers que entram no raio e as encerra quando saem.
 *
 * Para evitar "glare" (ambos os lados enviando offer ao mesmo tempo), o peer
 * cujo id é lexicograficamente menor assume o papel de iniciador.
 */
export class WebRTCManager {
  private peers = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;

  constructor(
    private socket: GameSocket,
    private selfId: string,
    private cb: WebRTCCallbacks,
  ) {
    this.socket.on("webrtc-signal", ({ from, data }) => {
      void this.handleSignal(from, data);
    });
  }

  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;
    // Atualiza as tracks nas conexões já abertas.
    for (const pc of this.peers.values()) {
      const senders = pc.getSenders();
      const tracks = stream ? stream.getTracks() : [];
      // Remove senders antigos e adiciona as novas tracks.
      for (const sender of senders) {
        if (sender.track) pc.removeTrack(sender);
      }
      for (const track of tracks) pc.addTrack(track, stream!);
    }
  }

  /** Reconcilia a lista de peers próximos: abre novos, fecha ausentes. */
  updatePeers(peerIds: string[]): void {
    const wanted = new Set(peerIds);
    // Fecha conexões que saíram do raio.
    for (const id of [...this.peers.keys()]) {
      if (!wanted.has(id)) this.closePeer(id);
    }
    // Abre conexões novas.
    for (const id of peerIds) {
      if (!this.peers.has(id)) {
        const initiator = this.selfId < id;
        this.createPeer(id, initiator);
      }
    }
  }

  private createPeer(peerId: string, initiator: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.peers.set(peerId, pc);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send(peerId, { type: "ice", candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      this.cb.onStream(peerId, e.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        this.closePeer(peerId);
      }
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.send(peerId, { type: "offer", sdp: offer });
        } catch (err) {
          console.error("[webrtc] erro ao criar offer", err);
        }
      };
    }

    return pc;
  }

  private async handleSignal(from: string, data: SignalData): Promise<void> {
    let pc = this.peers.get(from);
    if (!pc) {
      // Recebemos sinal de um peer ainda não conhecido (ex.: chegou como
      // receptor); cria a conexão como não-iniciador.
      pc = this.createPeer(from, false);
    }

    try {
      if (data.type === "offer") {
        await pc.setRemoteDescription(data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send(from, { type: "answer", sdp: answer });
      } else if (data.type === "answer") {
        await pc.setRemoteDescription(data.sdp);
      } else if (data.type === "ice") {
        await pc.addIceCandidate(data.candidate);
      }
    } catch (err) {
      console.error("[webrtc] erro ao tratar sinal", err);
    }
  }

  private send(to: string, data: SignalData): void {
    this.socket.emit("webrtc-signal", { to, data });
  }

  private closePeer(peerId: string): void {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.onnegotiationneeded = null;
      pc.close();
    }
    this.peers.delete(peerId);
    this.cb.onPeerClosed(peerId);
  }

  destroy(): void {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.socket.off("webrtc-signal");
  }
}
