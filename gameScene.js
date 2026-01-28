export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.image('map', 'mapa_redimensionado.jpg');
  }

  create() {
    this.players = new Map();
    this.cursors = this.input.keyboard.createCursorKeys();

    // Add background and set world bounds to image size
    const img = this.textures.get('map').getSourceImage();
    this.mapWidth = img.width;
    this.mapHeight = img.height;
    this.add.image(0, 0, 'map').setOrigin(0, 0);
    this.cameras.main.setBounds(0, 0, this.mapWidth, this.mapHeight);

    // Create player objects if they exist
    globalThis.players.forEach((p) => {
      if (!p.obj) {
        const color = Math.floor(Math.random() * 0xffffff);
        p.obj = this.add.rectangle(p.curr.x, p.curr.y, 20, 20, color);
      }
    });

    // Follow the local player
    const localPlayer = globalThis.players.get(globalThis.myId);
    if (localPlayer?.obj) {
      this.cameras.main.startFollow(localPlayer.obj, true, 0.08, 0.08);
    }
  }

  update(_time, delta) {
    const dt = delta / 1000;
    let dx = 0, dy = 0;

    if (this.cursors.left.isDown) dx = -1;
    if (this.cursors.right.isDown) dx = 1;
    if (this.cursors.up.isDown) dy = -1;
    if (this.cursors.down.isDown) dy = 1;

    if ((dx !== globalThis.lastDx || dy !== globalThis.lastDy) && globalThis.ws.readyState === WebSocket.OPEN) {
      globalThis.ws.send(JSON.stringify({ type: 'move', dx, dy }));
      globalThis.lastDx = dx;
      globalThis.lastDy = dy;
    }

    globalThis.players.forEach((p, id) => {
      if (!p?.obj) return;

      if (id === globalThis.myId) {
        p.obj.x += dx * globalThis.SPEED * dt;
        p.obj.y += dy * globalThis.SPEED * dt;
        p.obj.x = Math.max(10, Math.min(this.mapWidth - 10, p.obj.x));
        p.obj.y = Math.max(10, Math.min(this.mapHeight - 10, p.obj.y));

        if (p.curr) {
          const targetX = p.curr.x;
          const targetY = p.curr.y;
          p.obj.x += (targetX - p.obj.x) * 0.08;
          p.obj.y += (targetY - p.obj.y) * 0.08;
        }
      } else {
        if (!p.prev || !p.curr) return;

        const renderTimestamp = Date.now() - globalThis.RENDER_DELAY_MS;
        const prev = p.prev;
        const curr = p.curr;

        if (renderTimestamp >= prev.t && renderTimestamp <= curr.t) {
          const alpha = (renderTimestamp - prev.t) / (curr.t - prev.t || 1);
          p.obj.x = prev.x + (curr.x - prev.x) * alpha;
          p.obj.y = prev.y + (curr.y - prev.y) * alpha;
        } else if (renderTimestamp > curr.t) {
          const dtMs = Math.min(renderTimestamp - curr.t, 200);
          const vx = (curr.x - prev.x) / (curr.t - prev.t || 1);
          const vy = (curr.y - prev.y) / (curr.t - prev.t || 1);
          p.obj.x = curr.x + vx * dtMs;
          p.obj.y = curr.y + vy * dtMs;
        } else {
          p.obj.x = prev.x;
          p.obj.y = prev.y;
        }
      }
    });
  }
}