// Shared helpers: API calls (JSON + uploads), formatting, toasts, celebration modals,
// avatars, player bar, PDF viewer. All user-facing text is in Tunisian Derja.
'use strict';

const API = {
  async request(url, options) {
    let res;
    try {
      res = await fetch(url, { credentials: 'same-origin', ...options });
    } catch {
      if (IS_LOCAL) throw new Error('Ma najamtech nwsel lel serveur. Apache ykhdem fel XAMPP?');
      showMoved();
      throw new Error('Ma najjamnech nwasslou lel serveur. Od5ol men l\'lien l\'jdid walla 3awed ba3d chwaya.');
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error('Non-JSON response from', url, text);
      throw new Error('L\'serveur raja3 jweb ghalet. MySQL ykhdem w database.sql mimporti? (détails fel console)');
    }
    if (res.status === 401 && !document.body.dataset.public) location.href = 'index.html';
    if (json.home_url) store.set('home', json.home_url);
    if (!json.ok) throw new Error(json.error || 'Sar mochkel.');
    return json;
  },

  call(endpoint, action, data = {}) {
    return this.request(`api/${endpoint}.php?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  /** multipart/form-data upload (PDFs, photos). */
  upload(endpoint, action, formData) {
    return this.request(`api/${endpoint}.php?action=${encodeURIComponent(action)}`, { method: 'POST', body: formData });
  },
};

const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
// The public address changes on every start of the PC tunnel; this permanent page always points to the current one.
const PERMANENT_HOME = 'https://mouhibswissi111-ship-it.github.io/9rayaverse/';

/** Server unreachable on a public address: usually an old link or an app installed from an old address. */
function showMoved() {
  if (document.querySelector('.moved-bar')) return;
  const home = store.get('home', '') || PERMANENT_HOME;
  const bar = document.createElement('div');
  bar.className = 'moved-bar';
  bar.innerHTML = `<b>🔌 Ma najjamnech nwasslou lel site.</b><span>Ynajjem l'lien 9dim (l'adresse tetbaddel). Od5ol men l'lien l'dayem:</span>
    <a class="btn primary sm" href="${esc(home + location.hash)}">🔗 Od5ol men l'lien l'jdid</a>`;
  document.body.appendChild(bar);
}

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const WILAYAS = ['Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte', 'Béja', 'Jendouba', 'Le Kef', 'Siliana', 'Sousse',
  'Monastir', 'Mahdia', 'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili'];
const DAYS = ['A7ad', 'Ethnin', 'Thleth', 'Erb3a', 'Khmis', 'Jom3a', 'Sebt'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m} min`;
  return s > 0 ? `${s}s` : '0 min';
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

/** "ba9i 2 ayem w 3 swaye3" style countdown. */
function fmtLeft(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} ${d === 1 ? 'nhar' : 'ayem'}${h ? ` w ${h}h` : ''}`;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

function fmtSize(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('rv.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('rv.' + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

// ---------- Toasts ----------
function toast(message, type = 'info', ms = 4000) {
  let box = $('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- Celebration modal (queued) ----------
const modalQueue = [];
function celebrate(emoji, title, text) {
  confetti();
  modalQueue.push({ emoji, title, text });
  if (modalQueue.length === 1) showNextModal();
}
function showNextModal() {
  const m = modalQueue[0];
  if (!m) return;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal"><div class="big-emoji">${esc(m.emoji)}</div><h2>${esc(m.title)}</h2><p class="muted">${esc(m.text)}</p><button class="btn primary">Behi! 🔥</button></div>`;
  const close = () => { back.remove(); modalQueue.shift(); showNextModal(); };
  $('button', back).addEventListener('click', close);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.body.appendChild(back);
  $('button', back).focus();
}

// ---------- Bottom sheet (actions without leaving the page) ----------
/** Opens a bottom sheet. Returns { el, close }. Closes on backdrop tap, ✕, Escape or a swipe down on the handle. */
function openSheet(title, html, onMount) {
  $('.sheet-back')?.remove();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="sheet-x" aria-label="Sakker">✕</button></div>
    <div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const sheet = $('.sheet', back);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    back.classList.add('out');
    setTimeout(() => back.remove(), 220);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  $('.sheet-x', back).addEventListener('click', close);

  // Swipe down on the handle area to dismiss.
  let startY = null;
  const grab = $('.sheet-grab', back);
  const head = $('.sheet-head', back);
  [grab, head].forEach((h) => {
    h.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; sheet.style.transition = 'none'; }, { passive: true });
    h.addEventListener('touchmove', (e) => { if (startY !== null) sheet.style.transform = `translateY(${Math.max(0, e.touches[0].clientY - startY)}px)`; }, { passive: true });
    h.addEventListener('touchend', (e) => {
      sheet.style.transition = '';
      const dy = e.changedTouches[0].clientY - (startY ?? 0);
      startY = null;
      if (dy > 90) close(); else sheet.style.transform = '';
    });
  });
  onMount?.(sheet, close);
  return { el: sheet, close };
}

/** Confetti for big moments (level up, monster defeated, weekly challenge). */
function confetti(count = 26) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const bits = ['🎉', '✨', '⭐', '🟠', '🟡', '🧡'];
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.textContent = bits[i % bits.length];
    s.style.cssText = `left:${Math.random() * 100}%;animation-delay:${Math.random() * 0.4}s;animation-duration:${1.6 + Math.random() * 1.4}s;font-size:${14 + Math.random() * 16}px`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

/** Turns server game events into toasts / modals. */
function showEvents(events = []) {
  for (const e of events) {
    switch (e.type) {
      case 'loot': toast(`✨ +${e.xp} n9at · +${e.gold} flous`, 'gold'); break;
      case 'damage': toast(`⚔️ Darabt l'ghoul b ${e.amount}!`, 'good'); break;
      case 'monster_defeated': celebrate(e.emoji, `Ghlabt ${e.name}!`, `Ghnima: +${e.xp} n9at w +${e.gold} flous. Ghoul jdid tla3…`); break;
      case 'level_up': celebrate('⭐', `Niveau ${e.level}!`, 'Sa77tek rja3et kemla w Max sa77a +5. Kammel haka!'); break;
      case 'mission_done': celebrate('🎯', 'Mission kmlet!', `Kammelt "${e.title}". Ghnima: +${e.xp} n9at w +${e.gold} flous.`); break;
      case 'hurt': toast(`💔 -${e.amount} sa77a — ${e.reason}`, 'bad', 6000); break;
      case 'fainted': celebrate('💀', 'Tay7et!', `Khsart ${e.gold_lost} flous w l'n9at mta3 l'niveau. Erta7 chwaya w 3awed.`); break;
      case 'info': toast(e.text, 'info'); break;
    }
  }
}

// ---------- Avatar & player bar ----------
/** Avatar bubble: the chibi "perso" (default), or the profile photo when the user chose photo mode. */
function avatarHTML(color, hat, size = 'md', photo = null, look = null) {
  const usePhoto = photo && (!look || look.mode === 'photo');
  if (!usePhoto && look && typeof chibiURL === 'function') {
    return `<span class="avatar ${size} chibi"><img src="${chibiURL(look, color, hat)}" alt=""></span>`;
  }
  return `<span class="avatar ${size} ${usePhoto ? 'has-photo' : ''}" style="background:${esc(color)}">${usePhoto ? `<img src="${esc(photo)}" alt="">` : ''}${hat ? `<span class="hat">${esc(hat)}</span>` : ''}</span>`;
}

function pct(a, b) {
  return b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0;
}

function renderPlayerBar(el, user) {
  el.innerHTML = `
    ${avatarHTML(user.avatar_color, user.hat, 'lg', user.photo, user.look)}
    <div>
      <div class="who" style="margin-bottom:10px">
        <span class="name">${esc(user.username)} ${user.role === 'admin' ? '<span class="chip gold">🛠️ Admin</span>' : ''}</span>
        <span class="lvl">NIVEAU ${user.level}${user.wilaya ? ` · 📍 ${esc(user.wilaya)}` : ''}</span>
      </div>
      <div class="bars">
        <div><div class="bar-label"><span>⭐ N9at</span><span>${user.xp} / ${user.xp_next}</span></div><div class="bar xp"><i style="width:${pct(user.xp, user.xp_next)}%"></i></div></div>
        <div><div class="bar-label"><span>❤️ Sa77a</span><span>${user.hp} / ${user.max_hp}</span></div><div class="bar hp"><i style="width:${pct(user.hp, user.max_hp)}%"></i></div></div>
      </div>
    </div>
    <div class="stats">
      <span class="stat-pill" title="Flous">💰 ${user.gold}<small>flous</small></span>
      <span class="stat-pill" title="Ayem mtab3in t9ra fihom">🔥 ${user.streak}<small>${user.streak === 1 ? 'nhar' : 'ayem'} mtab3in</small></span>
    </div>`;
}

function setupLogout(button) {
  button?.addEventListener('click', async () => {
    try { await API.call('auth', 'logout'); } finally { location.href = 'index.html'; }
  });
}

// ---------- Connection lost / back ----------
function showOffline(off) {
  let bar = $('.offline-bar');
  if (off && !bar) {
    bar = document.createElement('div');
    bar.className = 'offline-bar';
    bar.textContent = '📴 Ma fammech connexion. L\'timer ykammel, w nsajjlou ki trja3 l\'connexion.';
    document.body.appendChild(bar);
  } else if (!off && bar) {
    bar.remove();
    toast('📶 L\'connexion rja3et!', 'good', 2500);
  }
}
window.addEventListener('offline', () => showOffline(true));
window.addEventListener('online', () => showOffline(false));
if (!navigator.onLine) document.addEventListener('DOMContentLoaded', () => showOffline(true));

// ---------- Theme (nhar / lil) ----------
// The page <head> applies the saved theme before drawing (no white flash); this keeps it in sync.
function applyTheme() {
  const t = store.get('theme', 'auto');
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f1a14' : '#f3fbf5');
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

function setupThemeSeg(seg) {
  if (!seg) return;
  const mark = () => $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.themeSet === store.get('theme', 'auto')));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (!b) return;
    store.set('theme', b.dataset.themeSet);
    applyTheme();
    mark();
  });
  mark();
}

// ---------- Sharing & invite links ----------
/** Base address to share: the permanent link when the server gives one, else this site. */
function siteHome(home) {
  return home || location.href.replace(/[^/]*([?#].*)?$/, '');
}

/** Native share sheet on phones (WhatsApp, Messenger…), clipboard elsewhere. */
async function shareLink(url, text) {
  if (navigator.share) {
    try { await navigator.share({ title: '9rayaverse', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('🔗 L\'lien tcopia! Ab3athou l s7abek.', 'good');
  } catch {
    prompt('Copi l\'lien hedha:', url);
  }
}

/** ?g=CODE (group) / ?r=CODE (private room) from an invite link, kept until the visitor is logged in. */
function rememberInvite() {
  const q = new URLSearchParams(location.search);
  const g = (q.get('g') || '').toUpperCase();
  const r = (q.get('r') || '').toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(g)) store.set('invite', { type: 'group', code: g });
  else if (/^[A-Z0-9]{6}$/.test(r)) store.set('invite', { type: 'room', code: r });
  return store.get('invite', null);
}

/**
 * Story picture (1080x1920) for Instagram / WhatsApp status: perso + big number + link.
 * opts: { user, big: '4h12', label: '9rit lyoum', lines: ['🔥 6 ayem mtab3in', …], home }
 */
async function shareStory(opts) {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#f0fdf4'); bg.addColorStop(0.55, '#bbf7d0'); bg.addColorStop(1, '#4ade80');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.35)';
  [[150, 260, 220], [930, 520, 160], [880, 1500, 260], [120, 1650, 180]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });

  await document.fonts?.ready;
  const text = (t, x, y, size, color, weight = 800, font = 'Poppins') => {
    g.font = `${weight} ${size}px ${font}, system-ui, sans-serif`; g.fillStyle = color; g.textAlign = 'center'; g.fillText(t, x, y);
  };
  g.font = '900 84px Poppins, system-ui, sans-serif';
  const w1 = g.measureText('9raya').width;
  const w2 = g.measureText('verse').width;
  text('9raya', W / 2 - w2 / 2, 190, 84, '#12301f', 900);
  text('verse', W / 2 + w1 / 2, 190, 84, '#16a34a', 900);

  // The perso, big, on a white disc.
  g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2, 640, 300, 0, 7); g.fill();
  const u = opts.user;
  const src = typeof chibiURL === 'function' && !(u.photo && u.look?.mode === 'photo') ? chibiURL(u.look, u.avatar_color, u.hat) : u.photo;
  if (src) {
    const img = new Image();
    img.src = src;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    if (img.naturalWidth) {
      g.save(); g.beginPath(); g.arc(W / 2, 640, 290, 0, 7); g.clip();
      const s = 520 / Math.max(img.naturalWidth, img.naturalHeight);
      g.imageSmoothingEnabled = !src.startsWith('data:');
      g.drawImage(img, W / 2 - (img.naturalWidth * s) / 2, 640 - (img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      g.restore();
    }
  }
  text(u.username, W / 2, 1040, 64, '#12301f');
  text(opts.big, W / 2, 1290, 230, '#15803d', 900);
  text(opts.label, W / 2, 1385, 60, '#12301f', 700);
  (opts.lines || []).forEach((l, i) => text(l, W / 2, 1500 + i * 72, 48, '#2f5340', 600, 'Inter'));
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect?.(140, 1690, W - 280, 130, 65); g.fill();
  text('Od5ol 9ra m3aya 👉 9rayaverse', W / 2, 1772, 46, '#16a34a', 800);

  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], '9rayaverse-story.png', { type: 'image/png' });
  const link = siteHome(opts.home);
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: `${opts.label} ${opts.big} fi 9rayaverse 📚 ${link}` }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '9rayaverse-story.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('📸 L\'taswira t7ammlet! 7ottha fi story.', 'good');
}

// ---------- PDF viewer (stays inside the page, so strict mode keeps running) ----------
function openPdf(url, title) {
  $('.pdf-back')?.remove();
  const back = document.createElement('div');
  back.className = 'pdf-back';
  back.innerHTML = `
    <div class="pdf-head">
      <b>📖 ${esc(title)}</b>
      <span class="hint" id="pdf-timer"></span>
      <a class="btn sm ghost" href="${esc(url)}" download>⬇️ Habbat</a>
      <button class="btn sm">✖ Sakker</button>
    </div>
    <iframe src="${esc(url)}" title="${esc(title)}"></iframe>`;
  $('button', back).addEventListener('click', () => back.remove());
  document.body.appendChild(back);
}

if (location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin', '<div class="banner">⚠️ 7allit l\'fichier direct. 7ell <b>http://localhost/9rayaverse/</b> fel navigateur (Apache lezem ykhdem fel XAMPP).</div>');
  });
}

// ---------- App install (PWA) ----------
// Service workers only run on HTTPS (or localhost), which is also what makes the site installable.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $$('[data-install]').forEach((b) => { b.hidden = false; });
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $$('[data-install]').forEach((b) => { b.hidden = true; });
  toast('📲 9rayaverse tsobb! L9ah fel écran d\'accueil.', 'good');
});

/** Wires an "Installi l'app" button: native prompt on Android/Chrome/Edge, instructions on iPhone. */
function setupInstallButton(button) {
  if (!button) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  button.hidden = standalone || !(installPrompt || ios);
  button.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      button.hidden = true;
    } else if (ios) {
      celebrate('📲', 'Sobb 9rayaverse 3al iPhone', 'Fi Safari: enzel 3la bouton "Partager" (⬆️) louta, ba3d "Sur l\'écran d\'accueil" ➕.');
    }
  });
}
