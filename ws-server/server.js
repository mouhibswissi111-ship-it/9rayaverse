'use strict';
// 9rayaverse real-time server: rooms, avatar movement, proximity chat,
// emotes, live focus status and a shared (group) pomodoro timer per room.
// Run with:  npm install   then   npm start

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

// ---- Config: read WS_SECRET / WS_PORT from ../config.php so they never drift ----
function readPhpConfig() {
  try {
    const php = fs.readFileSync(path.join(__dirname, '..', 'config.php'), 'utf8');
    const get = (key) => {
      const m = php.match(new RegExp(`define\\(\\s*'${key}'\\s*,\\s*'?([^')]+?)'?\\s*\\)`));
      return m ? m[1] : undefined;
    };
    return { secret: get('WS_SECRET'), port: get('WS_PORT') };
  } catch {
    return {};
  }
}
const phpConfig = readPhpConfig();
const SECRET = process.env.WS_SECRET || phpConfig.secret;
const PORT = Number(process.env.PORT || phpConfig.port || 8080);
if (!SECRET) {
  console.error('❌ Could not read WS_SECRET from ../config.php. Keep server.js inside 9rayaverse/ws-server/.');
  process.exit(1);
}

// ---- World constants (must match assets/js/room.js) ----
const MAP_W = 960;
const MAP_H = 640;
const NEAR_RADIUS = 160;
const PUBLIC_ROOMS = { library: 'Maktbet Lil', cafe: '9ahwet Sidi Bou', forest: 'Dar fi 3in Draham', pink: 'Bit Wardi' };
const DECOR_KEYS = new Set(['shelf', 'books', 'plant', 'tree', 'flower', 'jasmine', 'balloons', 'cake', 'tea', 'coffee', 'lamp',
  'globe', 'piano', 'guitar', 'tv', 'sofa', 'clock', 'trophy', 'star', 'ribbon', 'cat', 'dog', 'rug', 'rug2']);
const THEMES = ['library', 'cafe', 'forest', 'pink'];
const EMOTES = ['👋', '👍', '🔥', '☕', '🎉', '😴', '💯', '❤️'];
const DIRS = ['up', 'down', 'left', 'right'];

const rooms = new Map();

// ---- Helpers ----
function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.uid || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function newTimer() {
  return { mode: 'focus', running: false, focusMin: 25, breakMin: 5, remaining: 25 * 60, endsAt: null, round: 1 };
}

function timerView(t) {
  const remaining = t.running ? Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)) : t.remaining;
  return { mode: t.mode, running: t.running, focusMin: t.focusMin, breakMin: t.breakMin, round: t.round, remaining, endsAt: t.endsAt, serverNow: Date.now() };
}

function getRoom(id, user) {
  let name = PUBLIC_ROOMS[id];
  if (!name && /^p[A-Z0-9]{6}$/.test(id)) {
    // Private room: the PHP-signed token says whether this user is a member.
    if (!user.proom || user.proom.id !== id) return null;
    name = `🔐 ${user.proom.name}`;
  } else if (!name) {
    const m = /^g(\d+)$/.exec(id);
    const group = m && (user.groups || []).find((g) => g.id === Number(m[1]));
    if (!group) return null;
    name = `${group.name} · Salet l'Jme3a`;
  }
  if (!rooms.has(id)) rooms.set(id, { id, name, clients: new Set(), timer: newTimer() });
  return rooms.get(id);
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, except) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) if (c !== except && c.readyState === WebSocket.OPEN) c.send(data);
}

function playerView(ws) {
  const u = ws.user;
  return { id: u.uid, name: u.name, color: u.color, hat: u.hat, photo: u.photo || null, look: u.look || null, level: u.level, x: ws.x, y: ws.y, dir: ws.dir, moving: false, sit: !!ws.sit, sitFace: ws.sitFace || null, status: ws.status };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function systemMessage(room, text) {
  broadcast(room, { t: 'system', text, ts: Date.now() });
}

function rateLimited(ws, key, max, windowMs) {
  const now = Date.now();
  const list = (ws.rate[key] = (ws.rate[key] || []).filter((t) => now - t < windowMs));
  if (list.length >= max) return true;
  list.push(now);
  return false;
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  ws.room = null;
  room.clients.delete(ws);
  broadcast(room, { t: 'leave', id: ws.user.uid });
  systemMessage(room, `${ws.user.name} khraj mel sala.`);
  if (room.clients.size === 0 && !room.timer.running) rooms.delete(room.id);
}

function switchMode(room) {
  const t = room.timer;
  if (t.mode === 'focus') {
    t.mode = 'break';
    t.remaining = t.breakMin * 60;
  } else {
    t.mode = 'focus';
    t.round += 1;
    t.remaining = t.focusMin * 60;
  }
  if (t.running) t.endsAt = Date.now() + t.remaining * 1000;
}

// ---- Message handlers ----
function handleAuth(ws, msg) {
  const user = verifyToken(msg.token);
  if (!user) {
    send(ws, { t: 'error', msg: 'Session mte3ek wfet. 3awed 7ell l\'page.' });
    return ws.close(4003, 'bad token');
  }
  const room = getRoom(String(msg.room || ''), user);
  if (!room) {
    send(ws, { t: 'error', msg: 'Sala mouch mawjouda, walla enti mouch fel jme3a hedhi.' });
    return ws.close(4004, 'no room');
  }

  // One avatar per user per room: the newest tab wins.
  for (const other of room.clients) {
    if (other.user.uid === user.uid) {
      send(other, { t: 'kicked', msg: '7allit l\'sala hedhi fi onglet e5er.' });
      leave(other);
      other.close(4000, 'duplicate');
    }
  }

  rooms.set(room.id, room); // leave() above may have dropped the now-empty room
  ws.user = user;
  ws.room = room;
  ws.x = 464 + Math.round(Math.random() * 32);
  ws.y = 560;
  ws.dir = 'down';
  ws.status = { state: 'idle' };
  room.clients.add(ws);

  send(ws, {
    t: 'welcome',
    you: user.uid,
    room: { id: room.id, name: room.name },
    players: [...room.clients].map(playerView),
    timer: timerView(room.timer),
    serverNow: Date.now(),
  });
  broadcast(room, { t: 'join', p: playerView(ws) }, ws);
  systemMessage(room, `${user.name} dkhal lel sala 👋`);
}

const handlers = {
  move(ws, msg) {
    ws.x = clampNum(msg.x, 0, MAP_W, ws.x);
    ws.y = clampNum(msg.y, 0, MAP_H, ws.y);
    if (DIRS.includes(msg.dir)) ws.dir = msg.dir;
    ws.sit = !!msg.sit;
    ws.sitFace = DIRS.includes(msg.sitFace) ? msg.sitFace : null;
    broadcast(ws.room, { t: 'move', id: ws.user.uid, x: ws.x, y: ws.y, dir: ws.dir, moving: !!msg.moving, sit: ws.sit, sitFace: ws.sitFace }, ws);
  },

  chat(ws, msg) {
    const text = String(msg.text || '').trim().slice(0, 300);
    if (!text) return;
    if (rateLimited(ws, 'chat', 5, 5000)) return send(ws, { t: 'error', msg: 'Bechwaya 3lik 🙂' });
    const scope = msg.scope === 'near' ? 'near' : 'room';
    const out = { t: 'chat', id: ws.user.uid, name: ws.user.name, color: ws.user.color, text, scope, ts: Date.now() };
    if (scope === 'room') return broadcast(ws.room, out);
    // Proximity chat: only people within NEAR_RADIUS pixels receive it (Gather style).
    const data = JSON.stringify(out);
    for (const c of ws.room.clients) {
      if ((c === ws || distance(c, ws) <= NEAR_RADIUS) && c.readyState === WebSocket.OPEN) c.send(data);
    }
  },

  emote(ws, msg) {
    if (!EMOTES.includes(msg.e) || rateLimited(ws, 'emote', 3, 2000)) return;
    broadcast(ws.room, { t: 'emote', id: ws.user.uid, e: msg.e });
  },

  // "👋 Sallem" (hello) or "➕ Zid" (invite to my study group) sent to one player in the room.
  poke(ws, msg) {
    const kind = msg.kind === 'invite' ? 'invite' : 'hello';
    const code = kind === 'invite' ? String(msg.code || '').toUpperCase() : '';
    if (kind === 'invite' && !/^[A-Z0-9]{6}$/.test(code)) return;
    if (rateLimited(ws, 'poke', 4, 10000)) return send(ws, { t: 'error', msg: 'Bechwaya 3lihom 🙂' });
    const target = [...ws.room.clients].find((c) => c.user.uid === Number(msg.to));
    if (!target || target === ws) return;
    send(target, { t: 'poke', kind, code, group: String(msg.group || '').slice(0, 40), from: { id: ws.user.uid, name: ws.user.name } });
    broadcast(ws.room, { t: 'emote', id: ws.user.uid, e: kind === 'invite' ? '🎉' : '👋' });
  },

  // Owner of a private room changed its decoration (already saved through the PHP API): show it live to everyone.
  decor(ws, msg) {
    const p = ws.user.proom;
    if (!p || !p.owner || p.id !== ws.room.id || rateLimited(ws, 'decor', 10, 3000) || !Array.isArray(msg.decor)) return;
    const decor = msg.decor
      .filter((d) => d && DECOR_KEYS.has(d.k))
      .slice(0, 80)
      .map((d) => ({ k: d.k, x: Math.round(clampNum(d.x, 1, 28, 1)), y: Math.round(clampNum(d.y, 1, 18, 1)) }));
    const theme = THEMES.includes(msg.theme) ? msg.theme : undefined;
    broadcast(ws.room, { t: 'decor', decor, theme }, ws);
  },

  status(ws, msg) {
    const state = ['focus', 'break', 'idle'].includes(msg.state) ? msg.state : 'idle';
    ws.status = state === 'idle'
      ? { state }
      : { state, subject: String(msg.subject || '').slice(0, 60), until: Date.now() + clampNum(msg.remaining, 0, 4 * 3600, 0) * 1000 };
    broadcast(ws.room, { t: 'status', id: ws.user.uid, status: ws.status, serverNow: Date.now() });
  },

  timer(ws, msg) {
    const t = ws.room.timer;
    if (rateLimited(ws, 'timer', 4, 3000)) return;
    switch (msg.action) {
      case 'start':
        if (!t.running) { t.running = true; t.endsAt = Date.now() + t.remaining * 1000; }
        break;
      case 'pause':
        if (t.running) { t.remaining = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)); t.running = false; t.endsAt = null; }
        break;
      case 'reset':
        t.focusMin = Math.round(clampNum(msg.focusMin, 1, 120, t.focusMin));
        t.breakMin = Math.round(clampNum(msg.breakMin, 1, 60, t.breakMin));
        Object.assign(t, { mode: 'focus', running: false, endsAt: null, remaining: t.focusMin * 60, round: 1 });
        break;
      case 'skip':
        switchMode(ws.room);
        break;
      default:
        return;
    }
    broadcast(ws.room, { t: 'timer', timer: timerView(t), by: ws.user.name, action: msg.action });
  },
};

// ---- Server ----
const server = http.createServer((req, res) => {
  let players = 0;
  for (const r of rooms.values()) players += r.clients.size;
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`9rayaverse real-time server is running ✔\nActive rooms: ${rooms.size} · Players online: ${players}\n`);
});

const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.rate = {};
  ws.on('pong', () => { ws.isAlive = true; });
  const authTimer = setTimeout(() => { if (!ws.user) ws.close(4001, 'auth timeout'); }, 10000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (!ws.user) {
      if (msg.t === 'auth') { clearTimeout(authTimer); handleAuth(ws, msg); }
      return;
    }
    if (!ws.room) return;
    const handler = handlers[msg.t];
    if (handler) handler(ws, msg);
  });

  ws.on('close', () => { clearTimeout(authTimer); leave(ws); });
  ws.on('error', () => {});
});

// Advance room timers (focus ⇄ break, Studyverse-style auto cycle).
setInterval(() => {
  for (const room of rooms.values()) {
    const t = room.timer;
    if (!t.running || Date.now() < t.endsAt) continue;
    const wasFocus = t.mode === 'focus';
    switchMode(room);
    broadcast(room, { t: 'timer', timer: timerView(t), action: 'auto' });
    systemMessage(room, wasFocus ? '☕ Kmel l\'round! Wa9t l\'pause.' : `📚 Wfet l'pause — round ${t.round}, yallah n9raw!`);
    if (room.clients.size === 0) { t.running = false; rooms.delete(room.id); }
  }
}, 1000);

// Drop dead connections.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`❌ Port ${PORT} is already in use. Close the other server window or change WS_PORT in config.php.`);
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`✅ 9rayaverse real-time server listening on ws://localhost:${PORT}`);
  console.log('   Keep this window open while you use the app. Press Ctrl+C to stop.');
});
