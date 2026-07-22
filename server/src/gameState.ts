import { PlayerState, PROXIMITY_RADIUS } from "./protocol.js";

/**
 * Estado do mundo em memória (uma sala única no MVP).
 * Mantém os players conectados e calcula a proximidade entre eles.
 */
export class GameState {
  private players = new Map<string, PlayerState>();

  addPlayer(player: PlayerState): void {
    this.players.set(player.id, player);
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  getPlayer(id: string): PlayerState | undefined {
    return this.players.get(id);
  }

  getAll(): PlayerState[] {
    return [...this.players.values()];
  }

  updatePosition(
    id: string,
    x: number,
    y: number,
    dir: PlayerState["dir"],
  ): void {
    const p = this.players.get(id);
    if (!p) return;
    p.x = x;
    p.y = y;
    p.dir = dir;
  }

  /** Retorna os ids dos players dentro do raio de proximidade de `id`. */
  getNearby(id: string, radius = PROXIMITY_RADIUS): string[] {
    const self = this.players.get(id);
    if (!self) return [];
    const r2 = radius * radius;
    const nearby: string[] = [];
    for (const other of this.players.values()) {
      if (other.id === id) continue;
      const dx = other.x - self.x;
      const dy = other.y - self.y;
      if (dx * dx + dy * dy <= r2) nearby.push(other.id);
    }
    return nearby;
  }
}
