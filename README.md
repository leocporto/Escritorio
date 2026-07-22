# Guther 🎮

Um **espaço virtual 2D multiplayer** no estilo do [Gather](https://www.gather.town/):
avatares andam por um mapa em tempo real e conversam por **vídeo/áudio por
proximidade** — a câmera/microfone de outra pessoa liga automaticamente quando o
avatar dela chega perto do seu.

![Guther em ação](docs/screenshot.png)

## Funcionalidades

- 🗺️ **Mundo 2D com tilemap** — piso, paredes e obstáculos com colisão; a câmera
  segue o seu avatar.
- 🕹️ **Movimento** — setas ou **WASD**, com indicador de direção.
- 👥 **Multiplayer em tempo real** — veja outras pessoas entrarem, se moverem e
  saírem instantaneamente, com o nome acima de cada avatar.
- 🎥 **Vídeo/áudio por proximidade (WebRTC)** — ao se aproximar de outro jogador,
  a conexão é estabelecida e os vídeos aparecem; ao se afastar, a conexão é
  encerrada.
- 💬 **Chat de texto** em tempo real.
- 🎙️ **Controles** de microfone e câmera.

## Stack (a mesma do Gather)

| Camada | Tecnologia |
|---|---|
| Renderização do jogo 2D | [Phaser 3](https://phaser.io/) |
| UI / app shell | React 18 + TypeScript + Vite |
| Tempo real | [Socket.IO](https://socket.io/) |
| Vídeo/áudio | WebRTC (`RTCPeerConnection`, topologia *mesh*) |
| Backend | Node.js + Express + Socket.IO |

## Estrutura

```
server/   → estado do mundo em memória + sinalização WebRTC (Socket.IO)
client/   → React + Vite + Phaser (jogo, UI, rede)
```

O contrato de eventos entre os dois vive em `server/src/protocol.ts` e
`client/src/net/protocol.ts` (mantidos idênticos).

## Como rodar

Requisitos: **Node.js 18+**.

### 1. Servidor

```bash
cd server
npm install
npm run dev        # sobe em http://localhost:3001
```

### 2. Cliente

Em outro terminal:

```bash
cd client
npm install
npm run dev        # abre em http://localhost:5173
```

Abra **duas abas** em `http://localhost:5173`, entre com nomes diferentes e
mova-se com as setas/WASD. Aproxime os avatares para ligar o vídeo.

> **Câmera/microfone:** o navegador só libera `getUserMedia` em contexto seguro
> (`localhost` ou HTTPS). Em `localhost` funciona direto; ao hospedar, use HTTPS.

### Variáveis de ambiente

**Servidor**
- `PORT` — porta do servidor (padrão `3001`).
- `CLIENT_ORIGIN` — origem permitida no CORS (padrão `*`).

**Cliente**
- `VITE_SERVER_URL` — URL do servidor Socket.IO (padrão:
  `http://<host>:3001`).

## Build de produção

```bash
cd server && npm run build && npm start
cd client && npm run build            # gera client/dist (estático)
```

## Arquitetura

O servidor mantém as posições dos jogadores **em memória** (uma sala única) e,
a cada movimento, recalcula quem está dentro do **raio de proximidade**
(`PROXIMITY_RADIUS`, em `protocol.ts`). Quando esse conjunto muda, ele envia um
evento `nearby-update` para o cliente afetado, que **abre** ou **fecha** as
conexões WebRTC correspondentes. O servidor atua apenas como **servidor de
sinalização** (repasse de offer/answer/ICE); a mídia trafega P2P (mesh).

## Limitações e próximos passos

- **Mesh WebRTC** é ideal para grupos pequenos. Para muitos participantes por
  sala, o próximo passo é um **SFU** (ex.: [mediasoup](https://mediasoup.org/)).
- Estado do mundo é **em memória** e há **uma sala única**. Evoluções naturais:
  múltiplas salas, persistência, áreas privadas ("private spaces") e volume do
  áudio proporcional à distância.
- Assets são **placeholders gerados por código** — fáceis de trocar por
  tilesets/sprites reais (ex.: Kenney, LPC).
