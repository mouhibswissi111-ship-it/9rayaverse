// Landing page: live demo widgets, real public numbers, login / sign-up bottom sheet.
'use strict';

const DEMO = [
  { name: 'rania_sfax', look: { skin: 1, hair: 1, hairColor: 1, eyes: 2, glasses: 0, blush: true }, color: '#fb923c', hat: '', base: 21 * 3600 + 40 * 60 },
  { name: 'Enti', look: { skin: 2, hair: 0, hairColor: 0, eyes: 0, glasses: 1, blush: true }, color: '#8b6cff', hat: '🎓', base: 19 * 3600 + 5 * 60, me: true },
  { name: 'ayoub.tunis', look: { skin: 3, hair: 5, hairColor: 0, eyes: 1, glasses: 0, blush: false }, color: '#38bdf8', hat: '', base: 14 * 3600 + 10 * 60 },
  { name: 'yosr_sousse', look: { skin: 1, hair: 4, hairColor: 4, eyes: 2, glasses: 0, blush: true }, color: '#2ee6a6', hat: '', base: 11 * 3600 + 25 * 60 },
  { name: 'amine_kef', look: { skin: 2, hair: 3, hairColor: 2, eyes: 0, glasses: 2, blush: false }, color: '#ff7a59', hat: '🧢', base: 9 * 3600 + 2 * 60 },
];
const fmtHM = (s) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;

// ---------- Hero room: chibis at desks with ticking timers ----------
function renderRoom() {
  const room = $('#hero-room');
  const spots = [[20, 44], [50, 44], [80, 44], [35, 89], [65, 89]];
  spots.forEach(([x, y], i) => {
    const d = DEMO[i];
    room.insertAdjacentHTML('beforeend', `<div class="lp-desk" style="left:calc(${x}% - 46px);top:calc(${y}% + 2px)"></div>`);
    room.insertAdjacentHTML('beforeend', `
      <div class="lp-kid" style="left:${x}%;top:${y}%">
        <span class="lp-tag">${esc(d.name)} <i data-tick="${i}">⏱ ${fmtClock(25 * 60 - i * 137)}</i></span>
        <img src="${chibiURL(d.look, d.color, d.hat)}" alt="" style="animation-delay:-${i * 0.4}s">
      </div>`);
  });
  const left = DEMO.map((_, i) => 25 * 60 - i * 137 - 3);
  setInterval(() => left.forEach((s, i) => {
    left[i] = s <= 1 ? 25 * 60 : s - 1;
    const el = $(`[data-tick="${i}"]`);
    if (el) el.textContent = `⏱ ${fmtClock(left[i])}`;
  }), 1000);
}

// ---------- Challenge leaderboards (demo, ticking) ----------
function raceRow(d, i, s, max) {
  return `<div class="lp-row ${d.me ? 'me' : ''}"><span class="n">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
    <img src="${chibiURL(d.look, d.color, d.hat)}" alt=""><span>${esc(d.name)}</span><span class="t">${fmtHM(s)}</span>
    ${max ? `<div class="lp-bar" style="grid-column:3/5"><i style="width:${Math.round((s / max) * 100)}%"></i></div>` : ''}</div>`;
}

function renderBoards() {
  let t = 0;
  const draw = () => {
    const rows = DEMO.slice(0, 3).map((d) => d.base + t * (d.me ? 3 : 2));
    $('#hero-race').innerHTML = DEMO.slice(0, 3).map((d, i) => raceRow(d, i, rows[i])).join('');
    const all = DEMO.map((d) => d.base + t * (d.me ? 3 : 2));
    const target = 25 * 3600;
    $('#board').innerHTML = `<div class="lp-fc-title">🏁 Sba9 sari3 <span class="hint">(mathal)</span></div><div class="lp-fc-sub">L'awel elli ywsel 25 sa3a</div>`
      + DEMO.map((d, i) => raceRow(d, i, all[i], target)).join('');
  };
  draw();
  setInterval(() => { t += 30; draw(); }, 1000);
}

// ---------- Timer demo ----------
function renderRing() {
  let left = 24 * 60 + 56;
  setInterval(() => {
    left = left <= 0 ? 25 * 60 : left - 1;
    $('#ring-time').textContent = fmtClock(left);
    $('#ring').style.setProperty('--p', `${(left / (25 * 60)) * 100}%`);
  }, 1000);
}

// ---------- Levels strip: the perso gets new hats as you level up ----------
function renderLevels() {
  const hats = ['', '🧢', '🌸', '🎓', '🎩', '⛑️', '👑'];
  const colors = ['#8b6cff', '#2ee6a6', '#ff7a59', '#4cc9f0', '#ff5d8f', '#ffd166', '#fb923c'];
  $('#levels').innerHTML = [1, 3, 8, 12, 20, 33, 50].map((lv, i) =>
    `<div class="lp-lv"><img src="${chibiURL({ skin: i % 5, hair: i % 6, hairColor: i % 7, eyes: i % 3, glasses: i % 3 === 1 ? 1 : 0, blush: true }, colors[i], hats[i])}" alt=""><span>Nv ${lv}</span></div>`).join('');
}

// ---------- Real public numbers ----------
async function loadStats() {
  try {
    const s = await API.call('stats', 'get');
    $('#room-online').textContent = Math.max(s.studying_now, 1);
    if (s.students < 20) {
      // Brand-new community: invite people to be early instead of showing tiny numbers.
      $('#stats').innerHTML = '<div class="lp-kicker">🚀 Kon mel awlin</div><p class="lp-early">9rayaverse taw bda. Od5ol tawa, a3mel jme3tek w kon enti l\'awel fel tartib mta3 wilaytek 🏆</p>';
      return;
    }
    $('#st-now').textContent = s.studying_now;
    $('#st-today').textContent = s.seconds_today >= 3600 ? `${Math.round(s.seconds_today / 3600)}h` : fmtDuration(s.seconds_today);
    $('#st-students').textContent = s.students;
  } catch { $('#stats').hidden = true; }
}

// ---------- Auth sheet ----------
function setupAuth() {
  const sheet = $('#sheet');
  const loginForm = $('#login-form');
  const registerForm = $('#register-form');
  const errorBox = $('#auth-error');
  $('#wilaya').insertAdjacentHTML('beforeend', WILAYAS.map((w) => `<option>${esc(w)}</option>`).join(''));

  const mode = (m) => {
    $$('.lp-sheet .seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    loginForm.hidden = m !== 'login';
    registerForm.hidden = m !== 'register';
    errorBox.textContent = '';
  };
  const open = (m) => {
    mode(m);
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $(m === 'login' ? '[name=login]' : '[name=username]', sheet)?.focus(), 250);
  };
  const close = () => { sheet.hidden = true; document.body.style.overflow = ''; };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-auth]');
    if (b) { e.preventDefault(); open(b.dataset.auth); }
  });
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  $$('.lp-sheet .seg button').forEach((b) => b.addEventListener('click', () => mode(b.dataset.mode)));

  async function submit(form, action) {
    const button = $('button[type=submit]', form);
    button.disabled = true;
    errorBox.textContent = '';
    try {
      await API.call('auth', action, Object.fromEntries(new FormData(form)));
      location.href = 'app.html';
    } catch (err) {
      errorBox.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }
  loginForm.addEventListener('submit', (e) => { e.preventDefault(); submit(loginForm, 'login'); });
  registerForm.addEventListener('submit', (e) => { e.preventDefault(); submit(registerForm, 'register'); });
  if (location.hash === '#login' || location.hash === '#register') open(location.hash.slice(1));
}

// Already logged in? Go straight to the dashboard.
API.call('auth', 'me').then(() => { location.href = 'app.html'; }).catch(() => {});
renderRoom();
renderBoards();
renderRing();
renderLevels();
loadStats();
setupAuth();
setupInstallButton($('#install-btn'));
