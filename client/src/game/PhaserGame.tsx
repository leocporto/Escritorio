import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./MainScene";
import { PlayerState } from "../net/protocol";

interface Props {
  selfId: string;
  name: string;
  color: string;
  players: PlayerState[];
}

/** Monta o canvas Phaser dentro do React e injeta os dados iniciais na cena. */
export function PhaserGame({ selfId, name, color, players }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: "#141518",
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: "arcade",
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene: [MainScene],
    });
    gameRef.current = game;

    // Inicia a cena com os dados iniciais (após o boot).
    game.scene.start("MainScene", { selfId, name, color, players });

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // Executa apenas uma vez na montagem — os dados iniciais não mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
}
