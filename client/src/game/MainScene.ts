import Phaser from "phaser";
import { getSocket } from "../net/socket";
import { Direction, PlayerState } from "../net/protocol";

const TILE = 16;
const WORLD_W = 800;
const WORLD_H = 608;
const SPEED = 170;
const MOVE_EMIT_MS = 66; // ~15 Hz

interface RemoteEntry {
  shadow: Phaser.GameObjects.Ellipse;
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

// Assets pixel-art do escritório (tiles 16px do Tuxemon, CC-BY-SA).
const OFFICE_ASSETS = [
  "floor_wood",
  "floor_tile",
  "rug_blue",
  "wall",
  "wall_base",
  "desk",
  "shelf",
  "sofa",
  "dresser",
  "stool",
  "computer",
  "tree",
  "plant",
] as const;

export class MainScene extends Phaser.Scene {
  private selfId!: string;
  private selfName!: string;
  private selfColor!: string;
  private initialPlayers: PlayerState[] = [];

  private player!: Phaser.Physics.Arcade.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private playerFace!: Phaser.GameObjects.Image;
  private playerLabel!: Phaser.GameObjects.Text;
  private dir: Direction = "down";

  private solids!: Phaser.Physics.Arcade.StaticGroup;
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
    for (const key of OFFICE_ASSETS) {
      this.load.image(key, `/assets/office/${key}.png`);
    }
    this.makeAvatarTextures();
  }

  private makeAvatarTextures(): void {
    const R = 7;
    const body = this.add.graphics();
    body.fillStyle(0xffffff, 1).fillCircle(R + 1, R + 1, R);
    body.lineStyle(1, 0x000000, 0.3).strokeCircle(R + 1, R + 1, R);
    body.generateTexture("avatarBody", (R + 1) * 2, (R + 1) * 2);
    body.destroy();

    const face = this.add.graphics();
    face.fillStyle(0x1c1f26, 0.9);
    face.fillTriangle(6, 2, 1, 2, 3.5, 7);
    face.generateTexture("avatarFace", 7, 9);
    face.destroy();
  }

  // ---- Helpers de construção do cenário ----

  private addFloor(key: string, tx: number, ty: number, tw: number, th: number, depth = 1): void {
    this.add
      .tileSprite(tx * TILE, ty * TILE, tw * TILE, th * TILE, key)
      .setOrigin(0, 0)
      .setDepth(depth);
  }

  private addWall(tx: number, ty: number, tw: number, th: number): void {
    this.add
      .tileSprite(tx * TILE, ty * TILE, tw * TILE, th * TILE, "wall")
      .setOrigin(0, 0)
      .setDepth(2);
    this.addSolid(tx * TILE, ty * TILE, tw * TILE, th * TILE);
  }

  private addSolid(x: number, y: number, w: number, h: number): void {
    const rect = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
    this.physics.add.existing(rect, true);
    this.solids.add(rect);
  }

  /** Coloca um móvel/prop. `y` é a base (pés) do objeto — bom para y-sort. */
  private addProp(
    key: string,
    x: number,
    y: number,
    opts: { solid?: boolean; bw?: number; bh?: number; scale?: number } = {},
  ): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1);
    if (opts.scale) img.setScale(opts.scale);
    img.setDepth(y);
    if (opts.solid) {
      const w = opts.bw ?? img.displayWidth * 0.8;
      const h = opts.bh ?? img.displayHeight * 0.45;
      this.addSolid(x - w / 2, y - h, w, h);
    }
    return img;
  }

  private buildOffice(): void {
    this.solids = this.physics.add.staticGroup();

    // Piso base (madeira) em todo o mundo.
    this.addFloor("floor_wood", 0, 0, WORLD_W / TILE, WORLD_H / TILE, 0);

    // Acentos de piso por zona.
    this.addFloor("floor_tile", 1, 1, 15, 12); // sala de reunião (topo-esq.)
    this.addFloor("rug_blue", 35, 27, 14, 10); // lounge (baixo-dir.)

    // Paredes externas (borda).
    const cols = WORLD_W / TILE; // 50
    const rows = WORLD_H / TILE; // 38
    this.addWall(0, 0, cols, 1);
    this.addWall(0, rows - 1, cols, 1);
    this.addWall(0, 0, 1, rows);
    this.addWall(cols - 1, 0, 1, rows);

    // Divisórias (stubs — não fecham totalmente, evitam prender jogadores).
    this.addWall(16, 1, 1, 8); // vertical da sala de reunião
    this.addWall(1, 13, 10, 1); // horizontal da sala de reunião

    // --- Sala de reunião (mesa + banquinhos) ---
    this.addProp("dresser", 120, 110, { solid: true });
    this.addProp("stool", 120, 70);
    this.addProp("stool", 120, 140);
    this.addProp("stool", 80, 105);
    this.addProp("stool", 160, 105);
    this.addProp("shelf", 60, 44, { solid: true, bw: 28, bh: 10 });
    this.addProp("plant", 230, 40);

    // --- Estações de trabalho (topo-direita) ---
    for (const wx of [430, 520, 610]) {
      this.addProp("desk", wx, 96, { solid: true });
      this.addProp("computer", wx, 74); // sobre a mesa
      this.addProp("stool", wx, 122);
    }
    this.addProp("plant", 700, 44);
    this.addProp("tree", 760, 60);

    // --- Lounge (sofá, árvore, planta) ---
    this.addProp("sofa", 640, 480, { solid: true, bw: 30, bh: 12 });
    this.addProp("tree", 720, 470, { solid: true, bw: 12, bh: 8 });
    this.addProp("plant", 590, 500);

    // --- Decoração para preencher as áreas abertas (fora da zona de spawn) ---
    this.addProp("plant", 120, 470);
    this.addProp("tree", 190, 560, { solid: true, bw: 12, bh: 8 });
    this.addProp("shelf", 320, 566, { solid: true, bw: 28, bh: 10 });
    this.addProp("plant", 460, 540);
    this.addProp("tree", 560, 430, { solid: true, bw: 12, bh: 8 });
    this.addProp("plant", 560, 210);
    this.addProp("tree", 740, 200, { solid: true, bw: 12, bh: 8 });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#141518");
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setZoom(1.8);

    this.buildOffice();

    // --- Player local ---
    const self = this.initialPlayers.find((p) => p.id === this.selfId);
    const sx = self?.x ?? 300;
    const sy = self?.y ?? 300;

    this.playerShadow = this.add.ellipse(sx, sy + 7, 16, 7, 0x000000, 0.3);
    this.player = this.physics.add.image(sx, sy, "avatarBody");
    this.player.setTint(Phaser.Display.Color.HexStringToColor(this.selfColor).color);
    this.player.setCircle(8);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.solids);

    this.playerFace = this.add.image(sx, sy, "avatarFace");
    this.playerLabel = this.makeLabel(this.selfName);

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
        fontSize: "9px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 3, y: 1 },
        resolution: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(100000);
  }

  private addRemote(p: PlayerState): void {
    if (this.remotes.has(p.id)) return;
    const shadow = this.add.ellipse(p.x, p.y + 7, 16, 7, 0x000000, 0.3);
    const body = this.add.image(p.x, p.y, "avatarBody");
    body.setTint(Phaser.Display.Color.HexStringToColor(p.color).color);
    const face = this.add.image(p.x, p.y, "avatarFace");
    face.setAngle(FACE_ANGLE[p.dir]);
    const label = this.makeLabel(p.name);
    this.remotes.set(p.id, {
      shadow,
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
    r.shadow.destroy();
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      socket.off("player-joined");
      socket.off("player-moved");
      socket.off("player-left");
    });
  }

  private placeAvatar(
    shadow: Phaser.GameObjects.Ellipse,
    body: Phaser.GameObjects.Image,
    face: Phaser.GameObjects.Image,
    label: Phaser.GameObjects.Text,
    x: number,
    y: number,
    dir: Direction,
  ): void {
    body.setPosition(x, y).setDepth(y);
    shadow.setPosition(x, y + 7).setDepth(y - 1);
    const off = 5;
    let fx = x;
    let fy = y;
    if (dir === "down") fy = y + off;
    else if (dir === "up") fy = y - off;
    else if (dir === "left") fx = x - off;
    else fx = x + off;
    face.setPosition(fx, fy).setAngle(FACE_ANGLE[dir]).setDepth(y + 0.1);
    label.setPosition(x, y - 12);
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

    const px = this.player.x;
    const py = this.player.y;
    this.placeAvatar(
      this.playerShadow,
      this.player,
      this.playerFace,
      this.playerLabel,
      px,
      py,
      this.dir,
    );

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
      const nx = Phaser.Math.Linear(r.body.x, r.targetX, t);
      const ny = Phaser.Math.Linear(r.body.y, r.targetY, t);
      this.placeAvatar(r.shadow, r.body, r.face, r.label, nx, ny, r.dir);
    }
  }
}
