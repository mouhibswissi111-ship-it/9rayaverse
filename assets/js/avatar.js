// Chibi characters ("perso") and room decorations, shared by the dashboard and the virtual rooms.
'use strict';

const LOOK_OPTIONS = {
  skin: ['#ffe0c7', '#f5c9a0', '#e0a878', '#b97a4f', '#7d4a2b'],
  hair: ['Court', 'Twil', 'Chignon', 'Bouclé', 'Hijab', 'Pikes'],
  hairColor: ['#2b1d16', '#5a3a22', '#a0522d', '#e8c170', '#d94f70', '#4a6cff', '#f2f2f2'],
  eyes: ['3adi', 'Fer7an ^^', 'Kbar ✨'],
  glasses: ['Bla', 'Nadharat 🤓', 'Nadharat chams 😎'],
};
const DEFAULT_LOOK = { skin: 1, hair: 0, hairColor: 0, eyes: 0, glasses: 0, blush: true, mode: 'perso' };

// Must match DECOR_KEYS in api/rooms.php and ws-server/server.js. Emoji only from Unicode ≤ 12 (Windows 10).
const DECOR = [
  { k: 'shelf', e: '📚', n: 'Rfouf ktob', solid: true },
  { k: 'books', e: '📖', n: 'Ktab m7loul' },
  { k: 'plant', e: '🌿', n: 'Nabta', solid: true },
  { k: 'tree', e: '🌳', n: 'Chajra', solid: true },
  { k: 'flower', e: '🌷', n: 'Ward' },
  { k: 'jasmine', e: '🌼', n: 'Mechmoum' },
  { k: 'balloons', e: '🎈', n: 'Ballounet' },
  { k: 'cake', e: '🧁', n: 'Cupcake' },
  { k: 'tea', e: '🍵', n: 'Tey bel bondo9' },
  { k: 'coffee', e: '☕', n: '9ahwa' },
  { k: 'lamp', e: '💡', n: 'Lampa', light: true },
  { k: 'globe', e: '🌍', n: 'Globe' },
  { k: 'piano', e: '🎹', n: 'Piano', solid: true },
  { k: 'guitar', e: '🎸', n: 'Guitara' },
  { k: 'tv', e: '📺', n: 'Tilfza', solid: true },
  { k: 'sofa', e: '🛋️', n: 'Sofa', solid: true },
  { k: 'clock', e: '⏰', n: 'Mongela' },
  { k: 'trophy', e: '🏆', n: 'Coupe' },
  { k: 'star', e: '⭐', n: 'Nejma' },
  { k: 'ribbon', e: '🎀', n: 'Fyonka' },
  { k: 'cat', e: '🐈', n: '9attous' },
  { k: 'dog', e: '🐕', n: 'Kalb' },
  { k: 'rug', e: null, n: 'Zarbiya wardiya', rug: '#f3a6c0', rugEdge: '#e9799f' },
  { k: 'rug2', e: null, n: 'Klim tounsi', rug: '#b8413c', rugEdge: '#f2c14e' },
];
const DECOR_BY_KEY = Object.fromEntries(DECOR.map((d) => [d.k, d]));
const EMOJI_STACK = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

function normalizeLook(look) {
  return { ...DEFAULT_LOOK, ...(look || {}) };
}

function pick(list, i) {
  return list[Math.max(0, Math.min(list.length - 1, Number(i) || 0))];
}

function shade(hex, amt) {
  const n = parseInt(String(hex).slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function disc(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/**
 * Draws a chibi character. (x, y) is the body center, like the old ball avatars.
 * o = { look, color (outfit), hat, dir: up|down|left|right, photo: loaded Image or null }
 */
function drawChibi(g, x, y, o) {
  const look = normalizeLook(o.look);
  const dir = o.dir || 'down';
  const skin = pick(LOOK_OPTIONS.skin, look.skin);
  const hairC = pick(LOOK_OPTIONS.hairColor, look.hairColor);
  const outfit = o.color || '#8b6cff';
  const hx = x;
  const hy = y - 8;
  const dx = dir === 'left' ? -2.5 : dir === 'right' ? 2.5 : 0;

  // body (t-shirt) + little feet
  g.fillStyle = shade(outfit, -40);
  g.fillRect(x - 6, y + 11, 4, 3);
  g.fillRect(x + 2, y + 11, 4, 3);
  g.fillStyle = outfit;
  g.beginPath();
  g.moveTo(x - 9, y + 12);
  g.quadraticCurveTo(x - 10, y + 1, x, y + 1);
  g.quadraticCurveTo(x + 10, y + 1, x + 9, y + 12);
  g.closePath();
  g.fill();

  const usePhoto = look.mode === 'photo' && o.photo;
  if (usePhoto) {
    disc(g, hx, hy, 13, outfit);
    g.save();
    g.beginPath();
    g.arc(hx, hy, 11.5, 0, Math.PI * 2);
    g.clip();
    g.drawImage(o.photo, hx - 11.5, hy - 11.5, 23, 23);
    g.restore();
  } else {
    const hair = Number(look.hair) || 0;
    // hair behind the head
    if (hair === 1) { g.fillStyle = hairC; g.fillRect(hx - 12.5, hy - 2, 25, 13); }
    if (hair === 4) disc(g, hx, hy + 1, 14.5, hairC); // hijab
    if (hair === 2) disc(g, hx, hy - 13, 5.5, hairC); // chignon

    disc(g, hx, hy, 12, skin);

    // hair on top
    g.fillStyle = hairC;
    if (dir === 'up' && hair !== 4) {
      disc(g, hx, hy, 12.3, hairC);
    } else if (hair === 4) {
      g.beginPath();
      g.arc(hx, hy, 12.6, Math.PI * 1.02, Math.PI * 1.98);
      g.lineTo(hx + 12, hy - 1);
      g.quadraticCurveTo(hx, hy - 7, hx - 12, hy - 1);
      g.fill();
      if (dir === 'up') disc(g, hx, hy, 12.6, hairC);
    } else if (hair === 3) {
      for (let a = 0; a <= 8; a++) {
        const ang = Math.PI + (a / 8) * Math.PI;
        disc(g, hx + Math.cos(ang) * 11, hy + Math.sin(ang) * 11, 4.5, hairC);
      }
    } else if (hair === 5) {
      g.beginPath();
      g.moveTo(hx - 12.5, hy - 1);
      for (let i = 0; i <= 5; i++) {
        const px = hx - 12.5 + i * 5;
        g.lineTo(px + 2.5, hy - 17 - (i % 2) * 3);
        g.lineTo(px + 5, hy - 7);
      }
      g.lineTo(hx + 12.5, hy - 1);
      g.closePath();
      g.fill();
    } else {
      g.beginPath();
      g.arc(hx, hy, 12.6, Math.PI, Math.PI * 2);
      g.quadraticCurveTo(hx + 4 + dx, hy - 4, hx - 2 + dx, hy - 6);
      g.quadraticCurveTo(hx - 8, hy - 3, hx - 12.6, hy);
      g.fill();
    }

    if (dir !== 'up') {
      // eyes
      const ex = hx + dx;
      const ey = hy + 1;
      const eyes = Number(look.eyes) || 0;
      g.fillStyle = '#2a1a22';
      g.strokeStyle = '#2a1a22';
      g.lineWidth = 1.6;
      for (const s of [-4.5, 4.5]) {
        if (eyes === 1) {
          g.beginPath();
          g.arc(ex + s, ey + 1, 2.2, Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
        } else if (eyes === 2) {
          disc(g, ex + s, ey, 2.8, '#2a1a22');
          disc(g, ex + s + 0.9, ey - 1, 1, '#fff');
        } else {
          disc(g, ex + s, ey, 1.9, '#2a1a22');
        }
      }
      // mouth
      g.beginPath();
      g.arc(ex, ey + 4, 1.8, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
      if (look.blush) {
        g.fillStyle = 'rgba(255,110,140,.45)';
        g.beginPath(); g.ellipse(ex - 7.5, ey + 3, 2.6, 1.6, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(ex + 7.5, ey + 3, 2.6, 1.6, 0, 0, Math.PI * 2); g.fill();
      }
      const glasses = Number(look.glasses) || 0;
      if (glasses === 1) {
        g.strokeStyle = '#3a2a2a';
        g.lineWidth = 1.2;
        g.beginPath(); g.arc(ex - 4.5, ey, 3.6, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(ex + 4.5, ey, 3.6, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(ex - 1, ey); g.lineTo(ex + 1, ey); g.stroke();
      } else if (glasses === 2) {
        g.fillStyle = '#15121c';
        g.fillRect(ex - 8.5, ey - 2.5, 7, 4.5);
        g.fillRect(ex + 1.5, ey - 2.5, 7, 4.5);
        g.fillRect(ex - 2, ey - 1.5, 4, 1.2);
      }
    }
  }

  if (o.hat) {
    g.font = `16px ${EMOJI_STACK}`;
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    g.fillStyle = '#000';
    g.fillText(o.hat, hx, hy - 8);
  }
}

const chibiCache = new Map();
/** PNG data URL of a chibi portrait, for <img> avatars in lists. */
function chibiURL(look, color, hat) {
  const key = JSON.stringify([look, color, hat]);
  if (chibiCache.has(key)) return chibiCache.get(key);
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const g = c.getContext('2d');
  g.scale(2, 2);
  drawChibi(g, 24, 30, { look: { ...normalizeLook(look), mode: 'perso' }, color, hat, dir: 'down' });
  const url = c.toDataURL('image/png');
  chibiCache.set(key, url);
  return url;
}

/** Draws one decoration on a room tile. */
function drawDecorItem(g, d, tile) {
  const def = DECOR_BY_KEY[d.k];
  if (!def) return;
  const px = d.x * tile;
  const py = d.y * tile;
  if (def.rug) {
    g.fillStyle = def.rug;
    g.fillRect(px + 1, py + 1, tile - 2, tile - 2);
    g.strokeStyle = def.rugEdge;
    g.lineWidth = 2;
    g.strokeRect(px + 3, py + 3, tile - 6, tile - 6);
    g.fillStyle = def.rugEdge;
    g.beginPath();
    g.moveTo(px + tile / 2, py + 7); g.lineTo(px + tile - 7, py + tile / 2); g.lineTo(px + tile / 2, py + tile - 7); g.lineTo(px + 7, py + tile / 2);
    g.closePath();
    g.fill();
    return;
  }
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.beginPath();
  g.ellipse(px + tile / 2, py + tile - 5, 10, 3.5, 0, 0, Math.PI * 2);
  g.fill();
  g.font = `24px ${EMOJI_STACK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#000'; // an rgba fill would make colour emoji translucent
  g.fillText(def.e, px + tile / 2, py + tile / 2 - 2);
}
