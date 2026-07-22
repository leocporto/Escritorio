interface Props {
  micOn: boolean;
  camOn: boolean;
  hasMedia: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
}

/** Barra flutuante com controles de microfone e câmera. */
export function Controls({
  micOn,
  camOn,
  hasMedia,
  onToggleMic,
  onToggleCam,
}: Props) {
  if (!hasMedia) return null;
  return (
    <div className="controls">
      <button
        className={`ctrl-btn${micOn ? "" : " off"}`}
        onClick={onToggleMic}
        title={micOn ? "Desligar microfone" : "Ligar microfone"}
      >
        {micOn ? "🎙️" : "🔇"}
      </button>
      <button
        className={`ctrl-btn${camOn ? "" : " off"}`}
        onClick={onToggleCam}
        title={camOn ? "Desligar câmera" : "Ligar câmera"}
      >
        {camOn ? "📹" : "🚫"}
      </button>
    </div>
  );
}
