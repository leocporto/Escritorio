import Phaser from "phaser";
import { getSocket } from "../net/socket";
import { Direction, PlayerState } from "../net/protocol";

const TILE = 32;
const SPEED = 180;
const MOVE_EMIT_MS = 66; // ~15 Hz

interface RemoteEntry {
  body: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  dir: Direction;
}

interface SceneInitData {
  selfId: string;
  name: string;
  color: string;
  players: PlayerState[];
}

const FACE_ANGLE: Record<Direction, number> = {
  down: 0,
  left: 90,
  up: 180,
  right: 270,
};

/**
 * Layout do mundo. 1 = parede, 0 = piso. Bordas fechadas + alguns obstáculos
 * internos para dar referência de colisão (estilo "salas" do Gather).
 */
const MAP: number[][] = buildMap();

function buildMap(): number[][] {
  const cols = 25;
  const rows = 19;
  const grid: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: number[] = [];
    for (let c = 0; c < cols; c++) {
      const border = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
      row.push(border ? 1 : 0);
    }
    grid.push(row);
  }
  // Alguns blocos/móveis internos.
  const blocks = [
    [4, 4],
    [4, 5],
    [4, 6],
    [10, 12],
    [11, 12],
    [12, 12],
    [7, 18],
    [8, 18],
    [14, 6],
    [14, 7],
  ];
  for (const [r, c] of blocks) grid[r][c] = 1;
  return grid;
}

export class MainScene extends Phaser.Scene {
  private selfId!: string;
  private selfName!: string;
  private selfColor!: string;
  private initialPlayers: PlayerState[] = [];

  private player!: Phaser.Physics.Arcade.Image;
  private playerFace!: Phaser.GameObjects.Image;
  private playerLabel!: Phaser.GameObjects.Text;
  private dir: Direction = "down";

  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;

  private remotes = new Map<string, RemoteEntry>();
  private lastEmit = 0;
  private lastSent = { x: 0, y: 0, dir: "down" as Direction };

  constructor() {
    super("MainScene");
  }

  init(data: SceneInitData): void {
    this.selfId = data.selfId;
    this.selfName = data.name;
    this.selfColor = data.color;
    this.initialPlayers = data.players;
  }

  preload(): void {
    this.makeTextures();
  }

  private makeTextures(): void {
    // Piso (tile claro com leve grade).
    const floor = this.add.graphics();
    floor.fillStyle(0x2b2f3a, 1).fillRect(0, 0, TILE, TILE);
    floor.lineStyle(1, 0x353a47, 1).strokeRect(0, 0, TILE, TILE);
    floor.generateTexture("floor", TILE, TILE);
    floor.destroy();

    // Parede.
    const wall = this.add.graphics();
    wall.fillStyle(0x5a6072, 1).fillRect(0, 0, TILE, TILE);
    wall.lineStyle(1, 0x6d7488, 1).strokeRect(0, 0, TILE, TILE);
    wall.generateTexture("wall", TILE, TILE);
    wall.destroy();

    // Corpo do avatar (círculo branco, tingido por jogador).
    const R = 13;
    const body = this.add.graphics();
    body.fillStyle(0xffffff, 1).fillCircle(R + 2, R + 2, R);
    body.lineStyle(2, 0x000000, 0.25).strokeCircle(R + 2, R + 2, R);
    body.generateTexture("avatarBody", (R + 2) * 2, (R + 2) * 2);
    body.destroy();

    // Indicador de direção (triângulo escuro apontando para baixo por padrão).
    const face = this.add.graphics();
    face.fillStyle(0x1c1f26, 0.85);
    face.beginPath();
    face.moveTo(9, 4);
    face.lineTo(1, 4);
    face.lineTo(5, 12);
    face.closePath();
    face.fillPath();
    face.generateTexture("avatarFace", 10, 14);
    face.destroy();
  }

  create(): void {
    // --- Mundo / tilemap ---
    const rows = MAP.length;
    const cols = MAP[0].length;
    const worldW = cols * TILE;
    const worldH = rows * TILE;

    this.walls = this.physics.add.staticGroup();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        this.add.image(x, y, "floor");
        if (MAP[r][c] === 1) {
          const w = this.walls.create(x, y, "wall") as Phaser.Physics.Arcade.Image;
          w.refreshBody();
        }
      }
    }

    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBackgroundColor("#1a1c22");

    // --- Player local ---
    const self = this.initialPlayers.find((p) => p.id === this.selfId);
    const sx = self?.x ?? 100;
    const sy = self?.y ?? 100;

    this.player = this.physics.add.image(sx, sy, "avatarBody");
    this.player.setTint(Phaser.Display.Color.HexStringToColor(this.selfColor).color);
    this.player.setCircle(15);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.walls);

    this.playerFace = this.add.image(sx, sy, "avatarFace").setDepth(5);
    this.playerLabel = this.makeLabel(this.selfName);
    this.player.setDepth(4);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // --- Input ---
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // --- Players remotos iniciais ---
    for (const p of this.initialPlayers) {
      if (p.id !== this.selfId) this.addRemote(p);
    }

    this.bindNetwork();
  }

  private makeLabel(text: string): Phaser.GameObjects.Text {
    return this.add
      .text(0, 0, text, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#00000066",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(6);
  }

  private addRemote(p: PlayerState): void {
    if (this.remotes.has(p.id)) return;
    const body = this.add.image(p.x, p.y, "avatarBody").setDepth(4);
    body.setTint(Phaser.Display.Color.HexStringToColor(p.color).color);
    const face = this.add.image(p.x, p.y, "avatarFace").setDepth(5);
    face.setAngle(FACE_ANGLE[p.dir]);
    const label = this.makeLabel(p.name);
    this.remotes.set(p.id, {
      body,
      face,
      label,
      targetX: p.x,
      targetY: p.y,
      dir: p.dir,
    });
  }

  private removeRemote(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    r.body.destroy();
    r.face.destroy();
    r.label.destroy();
    this.remotes.delete(id);
  }

  private bindNetwork(): void {
    const socket = getSocket();

    socket.on("player-joined", ({ player }) => {
      if (player.id !== this.selfId) this.addRemote(player);
    });

    socket.on("player-moved", ({ id, x, y, dir }) => {
      const r = this.remotes.get(id);
      if (r) {
        r.targetX = x;
        r.targetY = y;
        r.dir = dir;
      }
    });

    socket.on("player-left", ({ id }) => this.removeRemote(id));

    // Ao destruir a cena, remove os listeners para evitar duplicação em HMR.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket.off("player-joined");
      socket.off("player-moved");
      socket.off("player-left");
    });
  }

  private positionFace(
    face: Phaser.GameObjects.Image,
    x: number,
    y: number,
    dir: Direction,
  ): void {
    const off = 6;
    let fx = x;
    let fy = y;
    if (dir === "down") fy = y + off;
    else if (dir === "up") fy = y - off;
    else if (dir === "left") fx = x - off;
    else fx = x + off;
    face.setPosition(fx, fy);
    face.setAngle(FACE_ANGLE[dir]);
  }

  update(time: number, delta: number): void {
    // --- Movimento local ---
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    let vx = 0;
    let vy = 0;
    if (left) vx = -SPEED;
    else if (right) vx = SPEED;
    if (up) vy = -SPEED;
    else if (down) vy = SPEED;

    // Normaliza diagonal.
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }
    this.player.setVelocity(vx, vy);

    if (vy > 0) this.dir = "down";
    else if (vy < 0) this.dir = "up";
    else if (vx < 0) this.dir = "left";
    else if (vx > 0) this.dir = "right";

    // Acompanha visual do player local.
    const px = this.player.x;
    const py = this.player.y;
    this.positionFace(this.playerFace, px, py, this.dir);
    this.playerLabel.setPosition(px, py - 20);

    // Emite movimento com throttle quando muda posição/direção.
    if (time - this.lastEmit > MOVE_EMIT_MS) {
      const moved =
        Math.abs(px - this.lastSent.x) > 0.5 ||
        Math.abs(py - this.lastSent.y) > 0.5 ||
        this.dir !== this.lastSent.dir;
      if (moved) {
        getSocket().emit("move", { x: px, y: py, dir: this.dir });
        this.lastSent = { x: px, y: py, dir: this.dir };
        this.lastEmit = time;
      }
    }

    // --- Interpola players remotos ---
    const t = Math.min(1, (delta / 1000) * 12);
    for (const r of this.remotes.values()) {
      r.body.x = Phaser.Math.Linear(r.body.x, r.targetX, t);
      r.body.y = Phaser.Math.Linear(r.body.y, r.targetY, t);
      this.positionFace(r.face, r.body.x, r.body.y, r.dir);
      r.label.setPosition(r.body.x, r.body.y - 20);
    }
  }
}
