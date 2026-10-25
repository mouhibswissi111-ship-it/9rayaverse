// Shared helpers: API calls (JSON + uploads), formatting, toasts, celebration modals,
// avatars, player bar, PDF viewer. All user-facing text is in Tunisian Derja.
'use strict';

const API = {
  async request(url, options) {
    let res;
    try {
      res = await fetch(url, { credentials: 'same-origin', ...options });
    } catch {
      throw new Error('Ma najamtech nwsel lel serveur. Apache ykhdem fel XAMPP?');
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

/** Turns server game events into toasts / modals. */
function showEvents(events = []) {
  for (const e of events) {
    switch (e.type) {
      case 'loot': toast(`✨ +${e.xp} XP · +${e.gold} flous`, 'gold'); break;
      case 'damage': toast(`⚔️ Darabt l'ghoul b ${e.amount}!`, 'good'); break;
      case 'monster_defeated': celebrate(e.emoji, `Ghlabt ${e.name}!`, `Ghnima: +${e.xp} XP w +${e.gold} flous. Ghoul jdid tla3…`); break;
      case 'level_up': celebrate('⭐', `Niveau ${e.level}!`, 'Sa77tek rja3et kemla w Max sa77a +5. Kammel haka!'); break;
      case 'mission_done': celebrate('🎯', 'Mission kmlet!', `Kammelt "${e.title}". Ghnima: +${e.xp} XP w +${e.gold} flous.`); break;
      case 'hurt': toast(`💔 -${e.amount} sa77a — ${e.reason}`, 'bad', 6000); break;
      case 'fainted': celebrate('💀', 'Tay7et!', `Khsart ${e.gold_lost} flous w l'XP mta3 l'niveau. Erta7 chwaya w 3awed.`); break;
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
        <div><div class="bar-label"><span>⭐ XP</span><span>${user.xp} / ${user.xp_next}</span></div><div class="bar xp"><i style="width:${pct(user.xp, user.xp_next)}%"></i></div></div>
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
