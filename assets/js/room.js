// Virtual room (Gather-style): canvas world, avatars, proximity chat, emotes,
// shared room timer, personal focus timer and ambience — all synced over WebSocket.
'use strict';

// ---------- World definition ----------
const TILE = 32;
const COLS = 30;
const ROWS = 20;
const W = COLS * TILE; // 960 — must match ws-server MAP_W
const H = ROWS * TILE; // 640 — must match ws-server MAP_H
const NEAR = 160;      // proximity chat radius — must match ws-server NEAR_RADIUS
const SPEED = 150;     // px per second

// # wall · B shelf/counter/tree · D desk · c chair · T table · S sofa · R rug · P plant · L lamp · M speaker · . floor
const MAP = [
  '##############################',
  '#BBBBBBBBBBB#....#SSS.....SSS#',
  '#L.........L#....#L.........L#',
  '#.DD.DD.DD..#....#..SRRRRRS..#',
  '#.cc.cc.cc..........SRRRRRS..#',
  '#...........#....#..SRRRRRS..#',
  '#.DD.DD.DD..#....#...........#',
  '#.cc.cc.cc.P#....#P.........P#',
  '######.######....######.######',
  '#............................#',
  '#............................#',
  '######.######....######.######',
  '#P.........P#....#MM.......MM#',
  '#..TTT.TTT..#....#...........#',
  '#..TTT.TTT...........RRRRR...#',
  '#...........#....#...RRRRR...#',
  '#..TTT.TTT..#....#...RRRRR...#',
  '#..TTT.TTT..#....#...........#',
  '#L.........L#....#L.........L#',
  '##############################',
];
const SOLID = new Set(['#', 'B', 'D', 'T', 'S', 'P', 'L', 'M']);
const HALL = { name: "🚪 L'couloir" };
const ZONES = [
  { name: '🤫 Zone Skoot', x: 1, y: 1, w: 11, h: 7, quiet: true, labelRow: 9 },
  { name: '🛋️ Salon', x: 18, y: 1, w: 11, h: 7, labelRow: 9 },
  { name: '📚 Twewel l\'9raya', x: 1, y: 12, w: 11, h: 7, labelRow: 10 },
  { name: '🎵 Rokn l\'Lo-fi', x: 18, y: 12, w: 11, h: 7, music: true, labelRow: 10 },
];
const THEMES = {
  library: { floor: ['#2a2142', '#2d2446'], wall: '#140f22', wallFace: '#3a2d5c', wood: '#6b4a33', woodDark: '#4a3222', rug: '#5a2d5e', rugEdge: '#7a3d7e', sofa: '#3d4f8a', plant: '#3fa66b', light: '#ffcc66', dark: 0.5 },
  cafe: { floor: ['#3b2a20', '#3f2d22'], wall: '#1c120d', wallFace: '#5a3a28', wood: '#9a6a45', woodDark: '#6e4a30', rug: '#7a3b2e', rugEdge: '#9a4b3a', sofa: '#8a3d4f', plant: '#4fb36b', light: '#ffb070', dark: 0.42 },
  forest: { floor: ['#24382a', '#273c2d'], wall: '#0f1f15', wallFace: '#2d4a33', wood: '#7a5a3a', woodDark: '#54402a', rug: '#3b5e3a', rugEdge: '#4f7a4c', sofa: '#6a5a3a', plant: '#5cc46b', light: '#d7f5a8', dark: 0.55 },
  // Daylight pastel room (cozy, like a cute study café)
  pink: { floor: ['#f1d3c2', '#eccbb9'], wall: '#c97b95', wallFace: '#f4b6c8', wood: '#d9a27a', woodDark: '#b57d5a', rug: '#f7b8cf', rugEdge: '#ef8fb1', sofa: '#f28fb0', plant: '#5fbf80', light: '#fff1b8', dark: 0.04 },
};
const THEME_NAMES = { library: '📚 Maktba (lil)', cafe: '☕ 9ahwa', forest: '🌲 Ghaba', pink: '🌸 Bit Wardi' };
const EMOTES = ['👋', '👍', '🔥', '☕', '🎉', '😴', '💯', '❤️'];
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

const roomId = new URLSearchParams(location.search).get('room') || 'library';
if (!/^(library|cafe|forest|pink|g\d+|p[A-Z0-9]{6})$/.test(roomId)) location.href = 'app.html#rooms';
const isPrivate = roomId[0] === 'p' && roomId !== 'pink';
let themeName = THEMES[roomId] ? roomId : isPrivate ? 'pink' : ['library', 'cafe', 'forest', 'pink'][Number(roomId.slice(1)) % 4];
let theme = THEMES[themeName];
// Private-room decoration: [{k, x, y}] on tiles, editable by the owner.
let decor = [];
let decorSolid = new Set();
let privateRoom = null;

// ---------- State ----------
const canvas = $('#world');
const ctx = canvas.getContext('2d');
const DPR = Math.min(2, window.devicePixelRatio || 1);
const players = new Map();
const keys = new Set();
let me = null;
let ws = null;
let wsToken = null;
let wsPort = 8080;
let wsPath = '';
let view3d = null; // Room3D instance when the 3D view is on (see room3d.js)
let clockOffset = 0;
let roomTimer = null;
let chatScope = 'near';
let profile = null;
let focusTimer = null;
let myStatus = { state: 'idle' };
let zone = HALL;
let kicked = false;
let lastError = '';
let reconnectDelay = 1000;
let lastSent = 0;
let lastSentPos = { x: 0, y: 0, moving: false };

const serverNow = () => Date.now() + clockOffset;
const tileAt = (tx, ty) => (MAP[ty] && MAP[ty][tx]) || '#';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- Static map rendering (drawn once to offscreen layers) ----------
function layer() {
  const c = document.createElement('canvas');
  c.width = W * DPR;
  c.height = H * DPR;
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  return { c, g };
}
const mapLayer = layer();
const darkLayer = layer();
const glowLayer = layer();
const labelLayer = layer();

function hash(x, y) {
  return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
}

/** Fills a tile, leaving an inset border only where the neighbour is a different tile (joins multi-tile furniture). */
function block(g, x, y, ch, color, inset = 3) {
  const l = tileAt(x - 1, y) === ch ? 0 : inset;
  const r = tileAt(x + 1, y) === ch ? 0 : inset;
  const t = tileAt(x, y - 1) === ch ? 0 : inset;
  const b = tileAt(x, y + 1) === ch ? 0 : inset;
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(x * TILE + l, y * TILE + t + 3, TILE - l - r, TILE - t - b);
  g.fillStyle = color;
  g.fillRect(x * TILE + l, y * TILE + t, TILE - l - r, TILE - t - b);
  return { l, r, t, b };
}

function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function drawTile(g, x, y) {
  const c = tileAt(x, y);
  const px = x * TILE;
  const py = y * TILE;
  const cx = px + TILE / 2;
  const cy = py + TILE / 2;

  g.fillStyle = theme.floor[(x + y) % 2];
  g.fillRect(px, py, TILE, TILE);
  g.fillStyle = 'rgba(0,0,0,.07)';
  g.fillRect(px, py + TILE - 1, TILE, 1);

  switch (c) {
    case '#':
      g.fillStyle = theme.wall;
      g.fillRect(px, py, TILE, TILE);
      if (tileAt(x, y + 1) !== '#') {
        g.fillStyle = theme.wallFace;
        g.fillRect(px, py + TILE - 10, TILE, 10);
      }
      if (themeName === 'forest' && hash(x, y) > 0.5) circle(g, cx, cy - 4, 10, '#1a3322');
      break;
    case 'R': {
      g.fillStyle = theme.rug;
      g.fillRect(px, py, TILE, TILE);
      g.fillStyle = theme.rugEdge;
      if (tileAt(x - 1, y) !== 'R') g.fillRect(px, py, 3, TILE);
      if (tileAt(x + 1, y) !== 'R') g.fillRect(px + TILE - 3, py, 3, TILE);
      if (tileAt(x, y - 1) !== 'R') g.fillRect(px, py, TILE, 3);
      if (tileAt(x, y + 1) !== 'R') g.fillRect(px, py + TILE - 3, TILE, 3);
      break;
    }
    case 'B':
      if (themeName === 'forest') {
        g.fillStyle = theme.woodDark;
        g.fillRect(cx - 3, cy, 6, 14);
        circle(g, cx, cy - 2, 14, hash(x, y) > 0.5 ? '#2f7a45' : '#38894f');
        circle(g, cx - 4, cy - 6, 6, 'rgba(255,255,255,.08)');
      } else if (themeName === 'cafe') {
        block(g, x, y, 'B', theme.wood, 2);
        g.fillStyle = theme.woodDark;
        g.fillRect(px, py + 20, TILE, 10);
        if (x % 2) { circle(g, cx, cy - 4, 6, '#f4ece1'); circle(g, cx, cy - 4, 4, '#6b3e26'); }
      } else {
        block(g, x, y, 'B', theme.woodDark, 2);
        const colors = ['#c0504d', '#4f81bd', '#9bbb59', '#f2c14e', '#8064a2', '#4bacc6'];
        for (let i = 0; i < 5; i++) {
          const h = 14 + Math.floor(hash(x * 7 + i, y) * 10);
          g.fillStyle = colors[Math.floor(hash(x, y * 3 + i) * colors.length)];
          g.fillRect(px + 3 + i * 5.5, py + TILE - 4 - h, 4.5, h);
        }
      }
      break;
    case 'D':
    case 'T': {
      const e = block(g, x, y, c, theme.wood, 4);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fillRect(px + e.l, py + e.t, TILE - e.l - e.r, 3);
      const r = hash(x, y);
      if (r > 0.55) { g.fillStyle = '#e9e4f5'; g.fillRect(cx - 7, cy - 5, 12, 9); g.fillStyle = '#9aa6c8'; g.fillRect(cx - 5, cy - 3, 8, 1); g.fillRect(cx - 5, cy, 6, 1); }
      else if (r > 0.3) { circle(g, cx + 4, cy, 4, '#f4ece1'); circle(g, cx + 4, cy, 2.5, '#6b3e26'); }
      break;
    }
    case 'c':
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(cx - 8, cy - 5, 16, 15);
      g.fillStyle = theme.woodDark;
      g.fillRect(cx - 8, cy - 7, 16, 14);
      break;
    case 'S': {
      block(g, x, y, 'S', theme.sofa, 3);
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
      break;
    }
    case 'P':
      g.fillStyle = '#7a4a2e';
      g.fillRect(cx - 7, cy + 2, 14, 11);
      circle(g, cx, cy - 2, 10, theme.plant);
      circle(g, cx - 6, cy + 1, 6, theme.plant);
      circle(g, cx + 6, cy + 1, 6, theme.plant);
      circle(g, cx - 3, cy - 6, 3, 'rgba(255,255,255,.15)');
      break;
    case 'L':
      circle(g, cx, cy + 6, 7, '#2a2238');
      g.fillStyle = '#4a3f5c';
      g.fillRect(cx - 2, cy - 6, 4, 12);
      circle(g, cx, cy - 8, 8, theme.light);
      circle(g, cx, cy - 8, 4, '#fff8e0');
      break;
    case 'M':
      block(g, x, y, 'M', '#1d1a24', 3);
      circle(g, cx, cy - 4, 6, '#3a3546');
      circle(g, cx, cy - 4, 3, '#14121a');
      circle(g, cx, cy + 8, 3, '#3a3546');
      break;
  }
}

function drawMap() {
  const g = mapLayer.g;
  for (const l of [darkLayer, glowLayer, labelLayer]) l.g.clearRect(0, 0, W, H);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawTile(g, x, y);
  decor.filter((d) => DECOR_BY_KEY[d.k]?.rug).forEach((d) => drawDecorItem(g, d, TILE));
  decor.filter((d) => !DECOR_BY_KEY[d.k]?.rug).sort((a, b) => a.y - b.y).forEach((d) => drawDecorItem(g, d, TILE));
  decorSolid = new Set(decor.filter((d) => DECOR_BY_KEY[d.k]?.solid).map((d) => `${d.x},${d.y}`));

  for (const z of ZONES) {
    if (z.quiet) { g.fillStyle = 'rgba(120,160,255,.06)'; g.fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE); }
    if (z.music) { g.fillStyle = 'rgba(255,120,200,.05)'; g.fillRect(z.x * TILE, z.y * TILE, z.w * TILE, z.h * TILE); }
    // Labels go on their own layer, drawn above the night overlay so they stay readable.
    const lg = labelLayer.g;
    const lx = (z.x + z.w / 2) * TILE;
    const ly = z.labelRow * TILE + TILE / 2;
    const arrow = z.labelRow === 9 ? '▲ ' : '▼ ';
    lg.font = `600 13px Inter, ${EMOJI_FONT}`;
    lg.textAlign = 'center';
    lg.textBaseline = 'middle';
    lg.fillStyle = theme.dark < 0.2 ? 'rgba(110,50,75,.7)' : 'rgba(255,255,255,.55)';
    lg.fillText(arrow + z.name, lx, ly);
  }

  // Lighting: a dark night overlay with holes around lamps, plus a warm glow layer.
  const d = darkLayer.g;
  d.fillStyle = `rgba(8,4,24,${theme.dark})`;
  d.fillRect(0, 0, W, H);
  d.globalCompositeOperation = 'destination-out';
  const gl = glowLayer.g;
  const lamps = decor.filter((dc) => DECOR_BY_KEY[dc.k]?.light).map((dc) => [dc.x, dc.y]);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (tileAt(x, y) === 'L') lamps.push([x, y]);
  {
    for (const [x, y] of lamps) {
      const cx = x * TILE + TILE / 2;
      const cy = y * TILE + 8;
      const hole = d.createRadialGradient(cx, cy, 0, cx, cy, 180);
      hole.addColorStop(0, 'rgba(0,0,0,.95)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = hole;
      d.fillRect(cx - 180, cy - 180, 360, 360);
      const glow = gl.createRadialGradient(cx, cy, 0, cx, cy, 130);
      glow.addColorStop(0, theme.light + '55');
      glow.addColorStop(1, theme.light + '00');
      gl.fillStyle = glow;
      gl.fillRect(cx - 130, cy - 130, 260, 260);
    }
  }
  d.globalCompositeOperation = 'source-over';
  view3d?.build(theme, themeName, decor);
}

// ---------- Dynamic rendering ----------
function roundRect(x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function wrapText(text, maxWidth, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…');
  return lines;
}

const photoCache = new Map();
/** Returns a loaded Image for a photo URL, or null while it is still loading / failed. */
function photoImage(url) {
  let entry = photoCache.get(url);
  if (!entry) {
    entry = { img: new Image(), ok: false };
    entry.img.onload = () => { entry.ok = true; };
    entry.img.src = url;
    photoCache.set(url, entry);
  }
  return entry.ok ? entry.img : null;
}

function drawAvatar(p, t) {
  const bob = p.moving ? Math.abs(Math.sin(t / 80)) * 3 : Math.sin(t / 700);
  const x = p.x;
  const y = p.y - bob;

  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 13, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (p.status?.state === 'focus') {
    const pulse = 0.5 + 0.5 * Math.sin(t / 300);
    ctx.strokeStyle = `rgba(255,138,92,${0.45 + 0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 4, 19 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Chibi "perso" (or the profile photo as the head, if the player chose photo mode).
  drawChibi(ctx, x, y, { look: p.look, color: p.color, hat: p.hat, dir: p.dir, photo: p.photo ? photoImage(p.photo) : null });
}

function drawOverlay(p, t, hideBubbles) {
  const near = me && p !== me && dist(p, me) <= NEAR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // name tag
  ctx.font = '600 11px Inter, sans-serif';
  const label = `${p.name} · Nv${p.level}`;
  const w = ctx.measureText(label).width + 12;
  roundRect(p.x - w / 2, p.y + 18, w, 17, 6, p === me ? 'rgba(139,108,255,.92)' : near ? 'rgba(62,230,160,.9)' : 'rgba(10,6,22,.78)');
  ctx.fillStyle = near ? '#0e0a1c' : '#fff';
  ctx.fillText(label, p.x, p.y + 27);

  // status chip
  let top = p.y - (p.hat ? 40 : 26);
  if (p.status && p.status.state !== 'idle') {
    const text = p.status.state === 'focus' ? `🔥 ${fmtClock((p.status.until - serverNow()) / 1000)}` : '☕ Pause';
    ctx.font = `600 11px Inter, ${EMOJI_FONT}`;
    const sw = ctx.measureText(text).width + 12;
    roundRect(p.x - sw / 2, top - 16, sw, 16, 6, p.status.state === 'focus' ? 'rgba(255,138,92,.92)' : 'rgba(62,230,160,.9)');
    ctx.fillStyle = '#1a0f0b';
    ctx.fillText(text, p.x, top - 8);
    top -= 20;
  }

  // chat bubble
  if (p.bubble && !hideBubbles) {
    if (performance.now() > p.bubble.until) {
      p.bubble = null;
    } else {
      ctx.font = `13px Inter, ${EMOJI_FONT}`;
      const lines = wrapText(p.bubble.text, 170, 4);
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
      const bh = lines.length * 16 + 10;
      const bx = Math.min(W - bw - 4, Math.max(4, p.x - bw / 2));
      const by = top - bh - 8;
      roundRect(bx, by, bw, bh, 10, p.bubble.near ? '#eafff4' : '#ffffff');
      ctx.beginPath();
      ctx.moveTo(p.x - 6, by + bh);
      ctx.lineTo(p.x + 6, by + bh);
      ctx.lineTo(p.x, by + bh + 7);
      ctx.fill();
      ctx.fillStyle = '#1a1230';
      lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + 13 + i * 16));
      top = by - 4;
    }
  }

  // floating emote
  if (p.emote) {
    const k = (performance.now() - p.emote.start) / 2000;
    if (k >= 1) {
      p.emote = null;
    } else {
      ctx.globalAlpha = 1 - k;
      ctx.font = `28px ${EMOJI_FONT}`;
      ctx.fillText(p.emote.e, p.x + 18, p.y - 30 - k * 36);
      ctx.globalAlpha = 1;
    }
  }
}

function render(t) {
  if (view3d) {
    view3d.frame(players, me, t, { now: serverNow(), near: NEAR, hideBubbles: zone.quiet });
    return;
  }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(mapLayer.c, 0, 0, W, H);

  if (me && chatScope === 'near' && !zone.quiet) {
    ctx.strokeStyle = 'rgba(62,230,160,.35)';
    ctx.fillStyle = 'rgba(62,230,160,.05)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(me.x, me.y, NEAR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const sorted = [...players.values()].sort((a, b) => a.y - b.y);
  sorted.forEach((p) => drawAvatar(p, t));

  ctx.drawImage(darkLayer.c, 0, 0, W, H);
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(glowLayer.c, 0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(labelLayer.c, 0, 0, W, H);

  sorted.forEach((p) => drawOverlay(p, t, zone.quiet));
}

// ---------- Movement ----------
function blocked(x, y) {
  return [[x - 9, y + 2], [x + 9, y + 2], [x - 9, y + 12], [x + 9, y + 12]]
    .some(([px, py]) => {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      return SOLID.has(tileAt(tx, ty)) || decorSolid.has(`${tx},${ty}`);
    });
}

function zoneAt(x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return ZONES.find((z) => tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h) || HALL;
}

function update(dt) {
  if (me) {
    let dx = 0;
    let dy = 0;
    if (keys.has('left')) dx -= 1;
    if (keys.has('right')) dx += 1;
    if (keys.has('up')) dy -= 1;
    if (keys.has('down')) dy += 1;
    const moving = dx !== 0 || dy !== 0;
    if (moving && me.sit) standUp(); // walking away gets you out of the chair
    if (moving) {
      const len = Math.hypot(dx, dy);
      const nx = me.x + (dx / len) * SPEED * dt;
      const ny = me.y + (dy / len) * SPEED * dt;
      if (!blocked(nx, me.y)) me.x = nx;
      if (!blocked(me.x, ny)) me.y = ny;
      me.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    }
    me.moving = moving;

    const now = performance.now();
    const moved = me.x !== lastSentPos.x || me.y !== lastSentPos.y;
    if ((moving && moved && now - lastSent > 66) || (!moving && lastSentPos.moving)) sendMove();

    const z = zoneAt(me.x, me.y);
    if (z !== zone) enterZone(z);
  }

  const k = Math.min(1, dt * 12);
  for (const p of players.values()) {
    if (p === me) continue;
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;
  }
}

function sendMove() {
  send({ t: 'move', x: Math.round(me.x), y: Math.round(me.y), dir: me.dir, moving: me.moving, sit: !!me.sit, sitFace: me.sitFace || null });
  lastSent = performance.now();
  lastSentPos = { x: me.x, y: me.y, moving: me.moving };
}

// ---------- Sitting (🪑 O93od) ----------
// Seats: chairs under desks, floor tiles next to tables, and sofas. "face" = where you look when seated.
const SEATS = (() => {
  const seats = [];
  const around = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      const t = tileAt(x, y);
      if (t === 'c') seats.push({ x, y, face: 'up' });
      else if (t === 'S') seats.push({ x, y, face: tileAt(x + 1, y) === 'R' ? 'right' : tileAt(x - 1, y) === 'R' ? 'left' : 'down' });
      else if (t === '.') {
        const near = around.find(([, dx, dy]) => tileAt(x + dx, y + dy) === 'T');
        if (near) seats.push({ x, y, face: near[0] });
      }
    }
  }
  return seats;
})();

function toggleSit() {
  if (!me) return;
  if (me.sit) { standUp(); return; }
  const taken = new Set([...players.values()].filter((p) => p !== me && p.sit).map((p) => `${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`));
  const free = SEATS.filter((s) => !taken.has(`${s.x},${s.y}`) && !decorSolid.has(`${s.x},${s.y}`));
  if (!free.length) return toast('Ma fammech blasa fergha 😅', 'info');
  free.sort((a, b) => Math.hypot((a.x + 0.5) * TILE - me.x, (a.y + 0.5) * TILE - me.y) - Math.hypot((b.x + 0.5) * TILE - me.x, (b.y + 0.5) * TILE - me.y));
  const s = free[0];
  Object.assign(me, { x: (s.x + 0.5) * TILE, y: (s.y + 0.5) * TILE - 4, sit: true, sitFace: s.face, dir: s.face, moving: false });
  sendMove();
  renderSitButton();
}

function standUp() {
  if (!me?.sit) return;
  me.sit = false;
  me.sitFace = null;
  if (blocked(me.x, me.y)) {
    // stepped off a sofa: find the closest free spot around it
    const spots = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) spots.push([me.x + dx * TILE, me.y + dy * TILE]);
    spots.sort((a, b) => Math.hypot(a[0] - me.x, a[1] - me.y) - Math.hypot(b[0] - me.x, b[1] - me.y));
    const ok = spots.find(([x, y]) => !blocked(x, y));
    if (ok) [me.x, me.y] = ok;
  }
  sendMove();
  renderSitButton();
}

function renderSitButton() {
  const b = $('#sit-btn');
  if (!b) return;
  b.innerHTML = me?.sit ? '🚶 9oum' : '🪑 O93od';
  b.classList.toggle('seated', !!me?.sit);
}

function enterZone(z) {
  zone = z;
  $('#hud-zone').textContent = `📍 ${z.name}`;
  if (z.quiet) toast('🤫 Zone Skoot: l\'chat msakker hna. 9raya bark!', 'info');
  if (z.music) toast('🎵 Rokn l\'Lo-fi: 7ell l\'onglet 🎧 Jaw w ch3el musique.', 'info');
}

let lastFrame = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  update(dt);
  render(t);
  requestAnimationFrame(loop);
}

// ---------- Networking ----------
function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function showConn(title, text) {
  $('#conn').hidden = false;
  $('#conn-title').textContent = title;
  $('#conn-text').textContent = text;
}

function addPlayer(p) {
  players.set(p.id, { ...p, tx: p.x, ty: p.y, bubble: null, emote: null });
}

function spawn() {
  for (let i = 0; i < 50; i++) {
    const x = (13 + Math.random() * 4) * TILE;
    const y = (15 + Math.random() * 3) * TILE;
    if (!blocked(x, y)) { me.x = x; me.y = y; break; }
  }
  sendMove();
}

function sendStatus() {
  if (!me) return;
  send({
    t: 'status',
    state: myStatus.state,
    subject: myStatus.subject || '',
    remaining: focusTimer?.running ? focusTimer.remaining() : 0,
  });
}

async function connect() {
  showConn('Qa3din nod5lou lel sala…', '');
  try {
    if (!wsToken) {
      const r = await API.call('ws_token', 'get', { room: roomId });
      wsToken = r.token;
      wsPort = r.port;
      wsPath = r.ws_url || '';
    }
  } catch (e) {
    showConn('Ma najamnech nod5lou lel sala', e.message);
    setTimeout(connect, 5000);
    return;
  }

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // Through the web server (wss://site/ws) when configured; otherwise straight to the Node port.
  // A relative path ("ws") is resolved next to this page, so /9rayaverse/ws and /ws both work.
  const path = wsPath.startsWith('/') ? wsPath : location.pathname.replace(/[^/]*$/, '') + wsPath;
  ws = new WebSocket(wsPath ? `${proto}://${location.host}${path}` : `${proto}://${location.hostname}:${wsPort}`);
  ws.onopen = () => {
    reconnectDelay = 1000;
    ws.send(JSON.stringify({ t: 'auth', token: wsToken, room: roomId }));
  };
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    handle(m);
  };
  ws.onclose = (ev) => {
    me = null;
    players.clear();
    if (kicked) return showConn('7allit l\'sala fi onglet e5er', 'L\'onglet hedha t9ass. 3awed 7ell l\'page bech terja3 hna.');
    if (ev.code === 4004) return showConn('Sala mouch mawjouda', lastError || 'L\'sala hedhi mouch mawjouda walla enti mouch fel jme3a.');
    if (ev.code === 4003) wsToken = null; // token expired or secret mismatch: fetch a fresh one
    showConn('L\'connexion m3a serveur temps réel t9ass\'et',
      `Thabbet elli serveur Node.js ykhdem: 7ell terminal fi 9rayaverse/ws-server w ekteb "npm start". N3awdou n7awlou ba3d ${Math.round(reconnectDelay / 1000)} swani…`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(15000, reconnectDelay * 2);
  };
}

const TIMER_VERBS = { start: 'bda', pause: 'wa99ef', reset: '3awed', skip: 'fawwet' };

function handle(m) {
  switch (m.t) {
    case 'decor':
      decor = m.decor;
      if (m.theme && THEMES[m.theme]) { themeName = m.theme; theme = THEMES[m.theme]; }
      drawMap();
      break;
    case 'welcome':
      clockOffset = m.serverNow - Date.now();
      players.clear();
      m.players.forEach(addPlayer);
      me = players.get(m.you);
      $('#room-name').textContent = m.room.name;
      document.title = `${m.room.name} · 9rayaverse`;
      if (focusTimer) focusTimer.baseTitle = document.title;
      $('#conn').hidden = true;
      roomTimer = m.timer;
      zone = HALL;
      spawn();
      sendStatus();
      renderTimer(true);
      addSystem(`Mar7ba bik fi ${m.room.name}! Temchi b WASD / ZQSD walla l'flèches.`);
      break;
    case 'join':
      addPlayer(m.p);
      break;
    case 'leave':
      players.delete(m.id);
      break;
    case 'move': {
      const p = players.get(m.id);
      if (p) Object.assign(p, { tx: m.x, ty: m.y, dir: m.dir, moving: m.moving, sit: !!m.sit, sitFace: m.sitFace || null });
      break;
    }
    case 'chat': {
      addChat(m);
      const p = players.get(m.id);
      if (p) p.bubble = { text: m.text, near: m.scope === 'near', until: performance.now() + 6000 };
      break;
    }
    case 'emote': {
      const p = players.get(m.id);
      if (p) p.emote = { e: m.e, start: performance.now() };
      break;
    }
    case 'poke':
      showPoke(m);
      break;
    case 'status': {
      clockOffset = m.serverNow - Date.now();
      const p = players.get(m.id);
      if (p) p.status = m.status;
      break;
    }
    case 'timer':
      roomTimer = m.timer;
      clockOffset = m.timer.serverNow - Date.now();
      if (m.action === 'auto') {
        chime();
      } else if (m.by && TIMER_VERBS[m.action]) {
        addSystem(`${m.by} ${TIMER_VERBS[m.action]} l'timer mta3 l'sala.`);
      }
      renderTimer(true);
      break;
    case 'system':
      addSystem(m.text);
      break;
    case 'error':
      lastError = m.msg;
      toast(m.msg, 'bad');
      break;
    case 'kicked':
      kicked = true;
      break;
  }
}

// ---------- Chat ----------
function appendLog(el) {
  const log = $('#chat-log');
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
  log.appendChild(el);
  while (log.children.length > 200) log.firstChild.remove();
  if (atBottom) log.scrollTop = log.scrollHeight;
}

function addChat(m) {
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `${m.scope === 'near' ? '<span class="scope">📍 9RIB</span>' : ''}<span class="who" style="color:${esc(m.color)}">${esc(m.name)}</span>`;
  el.appendChild(document.createTextNode(m.text));
  appendLog(el);
}

function addSystem(text) {
  const el = document.createElement('div');
  el.className = 'msg system';
  el.textContent = text;
  appendLog(el);
}

function setupChat() {
  $('#chat-scope').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (!b) return;
    chatScope = b.dataset.scope;
    $$('#chat-scope button').forEach((x) => x.classList.toggle('active', x === b));
    $('#chat-input').placeholder = chatScope === 'near' ? 'Say something to people nearby…' : 'Message everyone in the room…';
  });
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    if (!me) return toast('Mazelt ma dkhaltech lel sala.', 'bad');
    if (zone.quiet) return toast('🤫 Enti fel Zone Skoot. Okhrej menha bech tekteb.', 'bad');
    if (chatScope === 'near' && ![...players.values()].some((p) => p !== me && dist(p, me) <= NEAR)) {
      toast('7atta wa7ed 9rib bech yesma3ek. 9arreb walla ekhtar "L\'sala lkol".', 'info');
    }
    send({ t: 'chat', text, scope: chatScope });
    input.value = '';
  });
}

// ---------- People (Lilo-style cards with Sallem / Zid) ----------
let peopleKey = '';
let myGroup = null; // {name, code} — the study group I invite people to with "➕ Zid"

function statusTag(p) {
  const s = p.status?.state;
  if (s === 'focus') {
    return `<span class="chip tag-study"><span class="live-dot"></span> Ya9ra${p.status.subject ? ': ' + esc(p.status.subject) : ''}</span>
      <span class="chip" data-left="${p.id}">⏱️ ${fmtClock((p.status.until - serverNow()) / 1000)}</span>`;
  }
  if (s === 'break') return '<span class="chip violet">☕ Fi pause</span>';
  return '<span class="chip">😴 Yetmacha</span>';
}

function renderPeople() {
  const list = [...players.values()].sort((a, b) => (a === me ? -1 : b === me ? 1 : me ? dist(a, me) - dist(b, me) : 0));
  $('#hud-online').textContent = `👥 ${players.size} connectés`;
  // Rebuild the cards only when something visible changed (keeps buttons clickable), tick timers otherwise.
  const key = JSON.stringify(list.map((p) => [p.id, p.level, p.status?.state, p.status?.subject, me && p !== me && dist(p, me) <= NEAR, p.look, p.photo, p.hat]));
  if (key !== peopleKey) {
    peopleKey = key;
    $('#people').innerHTML = list.map((p) => {
      const near = me && p !== me && dist(p, me) <= NEAR;
      return `<div class="pcard ${p === me ? 'me' : ''}">
        ${avatarHTML(p.color, p.hat, 'md', p.photo, p.look)}
        <div>
          <div class="nm">${esc(p.name)} <span class="chip violet">⭐ Nv ${p.level}</span>${p === me ? '<span class="chip pink">Enti</span>' : ''}${near ? '<span class="chip good">📍 9rib</span>' : ''}</div>
          <div class="tags">${statusTag(p)}</div>
        </div>
        ${p === me ? '' : `<div class="acts">
          <button class="btn sm" data-poke="hello" data-to="${p.id}">👋 Sallem</button>
          <button class="btn sm primary" data-poke="invite" data-to="${p.id}">➕ Zid lel jme3a</button>
        </div>`}
      </div>`;
    }).join('') || '<div class="empty">7atta wa7ed hna mazel.</div>';
  } else {
    for (const p of list) {
      const el = $(`[data-left="${p.id}"]`);
      if (el && p.status?.state === 'focus') el.textContent = `⏱️ ${fmtClock((p.status.until - serverNow()) / 1000)}`;
    }
  }
}

function setupPeople() {
  $('#people').addEventListener('click', (e) => {
    const b = e.target.closest('[data-poke]');
    if (!b) return;
    const to = Number(b.dataset.to);
    const name = players.get(to)?.name || '';
    if (b.dataset.poke === 'hello') {
      send({ t: 'poke', kind: 'hello', to });
      toast(`👋 Sallemt 3la ${name}`, 'good', 2500);
    } else if (!myGroup) {
      toast('A3mel jme3a 9bal (👥 Jme3ti fel dashboard) bech tzid fiha s7abek.', 'info', 5000);
    } else {
      send({ t: 'poke', kind: 'invite', to, code: myGroup.code, group: myGroup.name });
      toast(`🎉 Ba3atht invitation l ${name} lel jme3a "${myGroup.name}"`, 'good', 3500);
    }
  });
}

/** Someone said hello or invited me to their group: a toast with an action. */
function showPoke(m) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast gold';
  if (m.kind === 'invite') {
    el.innerHTML = `🎉 <b>${esc(m.from.name)}</b> y7eb yzidek lel jme3a <b>"${esc(m.group)}"</b>
      <div class="row"><button class="btn sm primary" data-accept>➕ Od5ol</button><button class="btn sm ghost" data-close>Ba3d</button></div>`;
  } else {
    el.innerHTML = `👋 <b>${esc(m.from.name)}</b> sallem 3lik!
      <div class="row"><button class="btn sm" data-wave>👋 Raddlou</button><button class="btn sm ghost" data-close>✖</button></div>`;
  }
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) close();
    if (e.target.closest('[data-wave]')) { send({ t: 'poke', kind: 'hello', to: m.from.id }); close(); }
    if (e.target.closest('[data-accept]')) {
      try {
        await API.call('groups', 'join', { code: m.code });
        toast(`✅ Dkhalt lel jme3a "${m.group}"!`, 'good');
      } catch (err) { toast(err.message, 'bad'); }
      close();
    }
  });
  box.appendChild(el);
  setTimeout(close, 15000);
}

async function loadMyGroup() {
  try {
    const { groups } = await API.call('groups', 'mine');
    const here = /^g(\d+)$/.exec(roomId);
    const g = (here && groups.find((x) => x.id === Number(here[1]))) || groups[0];
    myGroup = g ? { name: g.name, code: g.invite_code } : null;
  } catch { myGroup = null; }
}

// ---------- Room timer ----------
function timerRemaining() {
  if (!roomTimer) return 0;
  return roomTimer.running ? Math.max(0, (roomTimer.endsAt - serverNow()) / 1000) : roomTimer.remaining;
}

function renderTimer(structural) {
  const box = $('#room-timer');
  if (!roomTimer) return;
  const t = roomTimer;
  if (structural) {
    box.className = `room-timer ${t.mode}`;
    box.innerHTML = `
      <span class="chip ${t.mode === 'focus' ? 'warm' : 'good'}">${t.mode === 'focus' ? '🍅 9raya' : '☕ Pause'} · Round ${t.round}</span>
      <div class="clock" id="rt-clock"></div>
      <div class="row" style="justify-content:center">
        ${t.running ? '<button class="btn" data-rt="pause">⏸ Wa99ef</button>' : '<button class="btn primary" data-rt="start">▶ Ebda</button>'}
        <button class="btn" data-rt="skip">⏭ Fawwet</button>
      </div>
      ${t.mode === 'focus' && t.running ? '<button class="btn warm sm mt" id="rt-join">🔥 Nod5ol m3akom (tebda 9rayti)</button>' : ''}
      <p class="hint mt">${t.running ? 'Ykhdem lel kol fel sala.' : 'Mwa99ef. Ay wa7ed fel sala ynajjem yebdah.'}</p>`;
    $('#rt-focus').value = t.focusMin;
    $('#rt-break').value = t.breakMin;
  }
  const left = timerRemaining();
  const clock = $('#rt-clock');
  if (clock) clock.textContent = fmtClock(left);
  $('#hud-timer').textContent = `${t.mode === 'focus' ? '🍅' : '☕'} ${fmtClock(left)}${t.running ? '' : ' ⏸'}`;
}

function setupTimer() {
  $('#room-timer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rt]');
    if (b) send({ t: 'timer', action: b.dataset.rt });
    if (e.target.closest('#rt-join')) joinRound();
  });
  $('#rt-apply').addEventListener('click', () => {
    send({ t: 'timer', action: 'reset', focusMin: Number($('#rt-focus').value), breakMin: Number($('#rt-break').value) });
  });
}

function joinRound() {
  if (!roomTimer || roomTimer.mode !== 'focus' || !roomTimer.running) return toast('Stanna 7atta yebda round 9raya.', 'info');
  if (focusTimer.running) return toast('Session 9rayti deja ma7loula.', 'info');
  const minutes = Math.max(1, Math.floor(timerRemaining() / 60));
  const subject = store.get('focus', {}).subject || $('#room-name').textContent;
  focusTimer.start(subject, minutes, false);
  switchSide('focus');
}

function chime() {
  try {
    const a = Ambience.audio();
    [660, 880].forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      const t0 = a.currentTime + i * 0.25;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + 0.65);
    });
  } catch { /* audio not available */ }
}

// ---------- UI wiring ----------
function switchSide(name) {
  $$('#side-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.side === name));
  $$('[data-sidepanel]').forEach((p) => { p.hidden = p.dataset.sidepanel !== name; });
}

function renderTop() {
  const u = profile.user;
  $('#top-stats').innerHTML = `
    ${avatarHTML(u.avatar_color, u.hat, 'sm', u.photo, u.look)}
    <span class="stat-pill">Nv ${u.level} <small>${u.xp}/${u.xp_next} n9at</small></span>
    <span class="stat-pill">❤️ ${u.hp}<small>/${u.max_hp}</small></span>
    <span class="stat-pill">💰 ${u.gold}</span>`;
}

const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

function setupInput() {
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      switchSide('chat');
      $('#chat-input').focus();
      return;
    }
    const k = KEYMAP[e.code];
    if (k) { keys.add(k); e.preventDefault(); }
    if (/^Digit[1-8]$/.test(e.code)) sendEmote(EMOTES[Number(e.code.slice(5)) - 1]);
  });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', () => { document.activeElement?.blur(); canvas.focus(); });

  $$('#dpad button').forEach((b) => {
    const k = b.dataset.key;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => keys.delete(k)));
  });

  $('#emote-bar').innerHTML = EMOTES.map((e, i) => `<button title="${e} (key ${i + 1})" data-emote="${e}">${e}</button>`).join('');
  $('#emote-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emote]');
    if (b) sendEmote(b.dataset.emote);
  });

  $('#side-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-side]');
    if (b) switchSide(b.dataset.side);
  });
}

function sendEmote(e) {
  if (me) send({ t: 'emote', e });
}

// ---------- Private room: decor editor (owner only) ----------
const editor = { on: false, tool: 'plant', saveTimer: null };

function renderEditor() {
  const box = $('#decor-panel');
  box.innerHTML = `
    <h3>🎨 Zayyen salatek</h3>
    <p class="hint">Ekhtar 7aja, ba3d enzel 3al blasa fel sala. Enzel 3la 7aja mawjouda b 🧽 bech tna77iha. Kol chay yetsajjel w s7abek ychoufouh direct.</p>
    <label class="switch" style="margin:8px 0"><input type="checkbox" id="edit-toggle" ${editor.on ? 'checked' : ''}> ✏️ Mode dicor</label>
    <div class="decor-palette">
      <button data-tool="erase" class="${editor.tool === 'erase' ? 'active' : ''}"><span class="e">🧽</span>Na77i</button>
      ${DECOR.map((d) => `<button data-tool="${d.k}" class="${editor.tool === d.k ? 'active' : ''}">${d.e ? `<span class="e">${d.e}</span>` : `<span class="rugsw" style="background:${d.rug};outline:2px solid ${d.rugEdge}"></span>`}${esc(d.n)}</button>`).join('')}
    </div>
    <label class="field"><span>🖌️ Style mta3 l'sala</span>
      <select class="input" id="theme-select">${Object.entries(THEME_NAMES).map(([k, n]) => `<option value="${k}" ${k === themeName ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </label>
    <button class="btn sm ghost" id="decor-clear">🗑️ Na77i l'dicor lkol</button>`;
}

/** Map tile under the mouse, in 3D (ray on the floor) or 2D (canvas pixels). */
function pickTile(e) {
  if (view3d) return view3d.pickTile(e.clientX, e.clientY);
  const rect = canvas.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
  return { tx: Math.floor(((e.clientX - rect.left) / rect.width) * COLS), ty: Math.floor(((e.clientY - rect.top) / rect.height) * ROWS) };
}

function setupEditor() {
  const box = $('#decor-panel');
  renderEditor();
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) { editor.tool = b.dataset.tool; setEditMode(true); renderEditor(); }
    if (e.target.closest('#decor-clear') && confirm('Tna77i l\'dicor lkol?')) { decor = []; decorChanged(); }
  });
  box.addEventListener('change', (e) => {
    if (e.target.id === 'edit-toggle') setEditMode(e.target.checked);
    if (e.target.id === 'theme-select') { themeName = e.target.value; theme = THEMES[themeName]; decorChanged(); }
  });
  $('#stage').addEventListener('pointermove', (e) => { if (view3d) view3d.showHover(editor.on ? pickTile(e) : null); });
  $('#stage').addEventListener('click', (e) => {
    if (!editor.on || e.target.closest('button')) return;
    const tile = pickTile(e);
    if (!tile) return;
    const { tx, ty } = tile;
    const i = decor.findIndex((d) => d.x === tx && d.y === ty);
    if (editor.tool === 'erase') {
      if (i < 0) return;
      decor.splice(i, 1);
    } else {
      if (!['.', 'R'].includes(tileAt(tx, ty))) return toast('Ma tnajjemch t7ott 7aja hna (7it walla mobilier).', 'bad', 2000);
      if (DECOR_BY_KEY[editor.tool]?.solid && [...players.values()].some((p) => Math.floor(p.x / TILE) === tx && Math.floor((p.y + 8) / TILE) === ty)) {
        return toast('Fama 7ad wa9ef hna 🙂', 'bad', 2000);
      }
      if (i >= 0) decor.splice(i, 1);
      if (decor.length >= 80) return toast('Wsolt lel max (80 7aja).', 'bad');
      decor.push({ k: editor.tool, x: tx, y: ty });
    }
    decorChanged();
  });
}

function setEditMode(on) {
  editor.on = on;
  $('#stage').classList.toggle('editing', on);
  const t = $('#edit-toggle');
  if (t) t.checked = on;
}

/** Redraws now, then saves (debounced) and shows the change live to everyone in the room. */
function decorChanged() {
  drawMap();
  clearTimeout(editor.saveTimer);
  editor.saveTimer = setTimeout(async () => {
    try {
      const r = await API.call('rooms', 'save', { code: privateRoom.code, decor, theme: themeName });
      decor = r.decor;
      send({ t: 'decor', decor, theme: themeName });
    } catch (err) { toast(err.message, 'bad'); }
  }, 600);
}

async function loadPrivateRoom() {
  const { room } = await API.call('rooms', 'get', { code: roomId.slice(1) });
  privateRoom = room;
  decor = room.decor;
  themeName = THEMES[room.theme] ? room.theme : 'pink';
  theme = THEMES[themeName];
  $('#room-code').hidden = false;
  $('#room-code').innerHTML = `🔑 Code: <b>${esc(room.code)}</b>`;
  $('#room-code').onclick = () => {
    navigator.clipboard?.writeText(room.code).then(() => toast('📋 L\'code tcopia — ab3athou lel s7ab!', 'good'), () => {});
  };
  if (room.is_owner) {
    $('#decor-tab').hidden = false;
    setupEditor();
  }
}

// ---------- 3D / 2D view + room controls (Lilo-style) ----------
function setupView() {
  const want3d = store.get('view3d', true);
  if (want3d && typeof Room3D !== 'undefined' && Room3D.supported()) {
    try {
      view3d = new Room3D($('#stage'), { map: MAP, tile: TILE, theme, themeName, decor });
      canvas.hidden = true;
    } catch (e) {
      console.warn('3D view failed, using 2D', e);
      view3d = null;
    }
  }
  $('#view-toggle').textContent = view3d ? '🗺️ 2D' : '🧊 3D';
  $('#zoom-in').hidden = $('#zoom-out').hidden = !view3d;
}

async function openRoomPicker() {
  const items = [
    ['library', '📚 Maktbet Lil'], ['cafe', '☕ 9ahwet Sidi Bou'], ['forest', '🌲 Dar fi 3in Draham'], ['pink', '🌸 Bit Wardi'],
  ];
  try {
    const [{ groups }, { rooms }] = await Promise.all([API.call('groups', 'mine'), API.call('rooms', 'mine')]);
    groups.forEach((g) => items.push([`g${g.id}`, `👥 ${g.name}`]));
    rooms.forEach((r) => items.push([r.ws_id, `🔐 ${r.name}`]));
  } catch { /* public rooms only */ }
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal"><h2>🔄 Baddel l'sala</h2><div class="list">${items.map(([id, n]) =>
    `<a class="list-item" style="text-decoration:none;color:inherit" href="room.html?room=${esc(id)}"><span class="grow title">${esc(n)}</span>${id === roomId ? '<span class="chip pink">Enti hna</span>' : '→'}</a>`).join('')}</div>
    <button class="btn ghost mt" data-close>Sakker</button></div>`;
  back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) back.remove(); });
  document.body.appendChild(back);
}

function setupRoomControls() {
  $('#sit-btn').addEventListener('click', () => toggleSit());
  $('#look-btn').addEventListener('click', () => { location.href = 'app.html#profile'; });
  $('#room-switch').addEventListener('click', openRoomPicker);
  $('#zoom-in').addEventListener('click', () => view3d?.setZoom(view3d.zoom * 0.8));
  $('#zoom-out').addEventListener('click', () => view3d?.setZoom(view3d.zoom * 1.25));
  $('#fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else $('#stage').requestFullscreen?.().catch(() => toast('Plein écran mouch mawjoud fel navigateur hedha.', 'info'));
  });
  $('#view-toggle').addEventListener('click', () => {
    store.set('view3d', !view3d);
    location.reload();
  });
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'KeyE') toggleSit();
    if (e.code === 'Equal' || e.code === 'NumpadAdd') view3d?.setZoom(view3d.zoom * 0.8);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') view3d?.setZoom(view3d.zoom * 1.25);
  });
  renderSitButton();
}

// ---------- Boot ----------
(async function init() {
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  if (isPrivate) {
    try {
      await loadPrivateRoom();
    } catch (e) {
      showConn('Ma najamnech n7ellou l\'sala privée', e.message);
      return;
    }
  }
  setupView();
  drawMap();
  setupInput();
  setupChat();
  setupTimer();
  setupPeople();
  setupRoomControls();
  Ambience.render($('#vibes'));
  requestAnimationFrame(loop);
  loadMyGroup();

  try {
    profile = await API.call('auth', 'me');
  } catch (e) {
    showConn('Ma najamnech njibou l\'profil mte3ek', e.message);
    return;
  }
  renderTop();

  focusTimer = new FocusTimer($('#room-focus'), {
    compact: true,
    onState: (s) => {
      // Starting to study sits you down at the nearest free desk, like in a real library.
      if (s.state === 'focus' && myStatus.state === 'idle' && me && !me.sit) toggleSit();
      myStatus = s;
      sendStatus();
    },
    onResult: (r) => {
      if (r.profile) { profile = r.profile; renderTop(); }
      else API.call('auth', 'me').then((p) => { profile = p; renderTop(); }).catch(() => {});
    },
  });

  setInterval(() => { renderPeople(); renderTimer(false); }, 500);
  connect();
})();
