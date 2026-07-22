import { VideoTile } from "./VideoTile";

interface Props {
  localStream: MediaStream | null;
  camOn: boolean;
  remoteStreams: { id: string; stream: MediaStream }[];
  names: Record<string, string>;
}

/**
 * Grade de vídeos: o próprio no topo + os players próximos.
 * Só aparece quando há stream local ou algum peer próximo com vídeo.
 */
export function VideoGrid({ localStream, camOn, remoteStreams, names }: Props) {
  if (!localStream && remoteStreams.length === 0) return null;

  return (
    <div className="video-grid">
      {localStream && (
        <VideoTile
          stream={localStream}
          label="Você"
          self
          muted
          camOn={camOn}
        />
      )}
      {remoteStreams.map(({ id, stream }) => (
        <VideoTile key={id} stream={stream} label={names[id] ?? "Jogador"} />
      ))}
    </div>
  );
}
