import { useEffect, useRef } from "react";

interface Props {
  stream: MediaStream | null;
  label: string;
  self?: boolean;
  muted?: boolean;
  camOn?: boolean;
}

/** Um tile de vídeo que liga o MediaStream ao elemento <video>. */
export function VideoTile({ stream, label, self, muted, camOn = true }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  const showVideo = stream && camOn;

  return (
    <div className={`video-tile${self ? " self" : ""}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{ display: showVideo ? "block" : "none" }}
      />
      {!showVideo && <div className="no-cam">📷 sem câmera</div>}
      <div className="tag">{label}</div>
    </div>
  );
}
