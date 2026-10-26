// Dashboard: profile, focus timer, monster, stats, missions (PDF), chghol, rooms, groups,
// tahadiyet (challenges + chorout), tartib, hanout, profili.
'use strict';

const state = { profile: null, groups: [], lbPeriod: 'week', lbKind: 'students', openGroup: null, groupTimer: null, liveTick: null, timer: null, challenges: [] };

const ROOMS = [
  { id: 'library', name: 'Maktbet Lil', art: 'library', emoji: '📚', desc: 'Bureaux skoot, lampes dafya w rfouf ktob. Lel 9raya l\'s7i7a.' },
  { id: 'cafe', name: '9ahwet Sidi Bou', art: 'cafe', emoji: '☕', desc: 'Jaw 9ahwa bel lo-fi. A7ki bechwaya, echrob w 9ra m3a s7abek.' },
  { id: 'forest', name: 'Dar fi 3in Draham', art: 'forest', emoji: '🌲', desc: 'Dar wost l\'ghaba. Ch3el l\'mtar walla l\'kanoun w ab9a mrekez.' },
  { id: 'pink', name: 'Bit Wardi', art: 'pink', emoji: '🌸', desc: 'Sala cute bel nhar, alwen pastel w jaw dafi. Lel 9raya m3a s7abek.' },
];

const DARE_IDEAS = [
  'Tkhalles 9ahwa lel jme3a lkol ☕',
  'Tjib lablebi walla kaskrout lel kol 🍲',
  'Tchri bambalouni lel jme3a 🍩',
  'Tbaddel sourtek b sourat mdhahka 24 se3a 🤡',
  'Tghanni ughniya w tab3ath vocal 🎤',
  'Ta3mel 30 push-up w tsawwar 💪',
  'Tekteb "ana kaslan" fel story 24 se3a 😴',
  'Ta9ra 2 swaye3 zeyda ghodwa 📚',
  'Tnaddhef l\'bit mte3ek w tsawwar 🧹',
];

const DURATIONS = [[24, 'Nhar'], [72, '3 ayem'], [168, 'Jom3a'], [336, '2 jem3at'], [720, 'Chhar']];

// ---------- Profile ----------
function setProfile(p) {
  if (!p) return;
  const prevMonsterHp = state.profile?.user.monster.hp;
  state.profile = { ...state.profile, ...p };
  const u = state.profile.user;
  renderHeader(u);
  renderMonster(u.monster, prevMonsterHp !== undefined && u.monster.hp < prevMonsterHp);
  renderStats(state.profile.stats);
  renderProfileCard();
  renderHero(u, state.profile.stats);
  renderTiles();
  $('#admin-link').hidden = u.role !== 'admin';
}

/** App header (like the prototype): avatar, name, level · wilaya, bell, gear, XP bar, flous / streak / sa77a. */
function renderHeader(u) {
  const a = state.alertsData || { alerts: [] };
  const n = a.alerts.length + (a.announcement ? 1 : 0);
  $('#player-bar').innerHTML = `
    <div class="ah-top">
      <button class="ah-me" data-tab="profile" aria-label="Profili">${avatarHTML(u.avatar_color, u.hat, 'lg', u.photo, u.look)}</button>
      <div class="ah-who">
        <div class="ah-name"><span>${esc(u.username)}</span>${u.role === 'admin' ? '<em>🛠️ Admin</em>' : ''}</div>
        <div class="ah-lvl">NIVEAU ${u.level}${u.wilaya ? ` • 📍 ${esc(u.wilaya.toUpperCase())}` : ''}</div>
      </div>
      <button class="ah-ico" id="bell" aria-label="Notifications">🔔${n ? `<b class="bell-badge">${n}</b>` : ''}</button>
      <button class="ah-ico" data-tab="profile" aria-label="Reglages">⚙️</button>
    </div>
    <div class="ah-xp"><span>⭐ XP</span><div class="bar xp"><i style="width:${pct(u.xp, u.xp_next)}%"></i></div><small>${u.xp} / ${u.xp_next}</small></div>
    <div class="ah-pills">
      <span class="ah-pill">💰 <b>${u.gold}</b> flous</span>
      <span class="ah-pill hot">🔥 <b>${u.streak}</b> ${u.streak === 1 ? 'nhar' : 'ayem'} streak</span>
      <span class="ah-pill hp">❤️ <b>${u.hp}</b>/${u.max_hp}</span>
    </div>`;
}

/** Every page opens with the same header as Accueil: a title, a subtitle and 3 live tiles about that page. */
function pageTiles(name) {
  const p = state.profile;
  if (!p) return [];
  const u = p.user;
  const s = p.stats;
  const ch = state.challenges || [];
  const ms = state.missions || [];
  const d = study.decks;
  const groupSum = (k) => state.groups.reduce((a, g) => a + Number(g[k] || 0), 0);
  switch (name) {
    case 'focus': return [['⏱️', fmtDuration(s.today), 'lyoum', ''], ['📅', fmtDuration(s.week), 'hal jom3a', 'sky'], ['✅', s.sessions, 'sessions kmlou', 'gold']];
    case 'rooms': return [['🌍', ROOMS.length, 'salat publiques', ''], ['🔐', state.proomCount ?? '–', 'salat privées', 'sky'], ['👥', state.groups.length, 'salat jme3at', 'gold']];
    case 'challenges': return [['⚔️', ch.filter((c) => c.status === 'running').length, 'ma7loulin', ''], ['🏆', ch.filter((c) => c.my_outcome === 'winner').length, 'rba7thom', 'gold'], ['👥', state.groups.length, 'jme3at', 'sky']];
    case 'leaderboard': return [['📅', fmtDuration(s.week), 'hal jom3a', 'sky'], ['⭐', `Nv ${u.level}`, 'niveau', 'gold'], ['🔥', u.streak, u.streak === 1 ? 'nhar mtab3in' : 'ayem mtab3in', '']];
    case 'cards': return [['🃏', d ? d.decks.length : '–', 'paquets', ''], ['🎯', d ? d.today_cards : '–', 'cartes lyoum', 'gold'], ['🧠', d ? d.decks.reduce((a, x) => a + x.learned, 0) : '–', '7fadhtha', 'sky']];
    case 'missions': return [['📕', ms.filter((m) => m.status === 'active').length, 'ma7loulin', ''], ['🏅', ms.filter((m) => m.status === 'done').length, 'kmlou', 'gold'], ['🤝', state.sharedCount ?? 0, 'mpartagyin', 'sky']];
    case 'groups': return [['👥', state.groups.length, 'jme3at', ''], ['🙋', groupSum('members'), 'a3dha', 'sky'], ['⚔️', groupSum('running_challenges'), 'tahadiyet ma7loulin', 'gold']];
    case 'shop': return [['💰', u.gold, 'flous', 'gold'], ['❤️', `${u.hp}/${u.max_hp}`, 'sa77a', ''], ['⭐', `Nv ${u.level}`, 'niveau', 'sky']];
    case 'profile': return [['⭐', `Nv ${u.level}`, 'niveau', 'gold'], ['📚', fmtDuration(s.total), 'wa9t lkol', 'sky'], ['👹', u.monster.defeated, 'ghilen ghlabthom', '']];
    default: return [];
  }
}

function renderTiles(name = state.tab) {
  const el = $(`[data-tiles="${name}"]`);
  if (!el) return;
  el.innerHTML = pageTiles(name).map(([e, v, l, c]) => `<div class="hero-tile ${c}"><span class="e">${e}</span><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('');
}

/** Three big tiles on top of the dashboard: streak, total study time, level. */
function renderHero(u, s) {
  const tiles = [['🔥', u.streak, u.streak === 1 ? 'nhar mtab3in' : 'ayem mtab3in', 'orange'], ['📚', fmtDuration(s.total), 'wa9t lkol', 'sky'], ['🏆', `Nv ${u.level}`, 'niveau', 'gold']];
  $('#hero-tiles').innerHTML = tiles.map(([e, v, l, c]) => `<div class="hero-tile ${c}"><span class="e">${e}</span><b>${esc(v)}</b><small>${l}</small></div>`).join('');
}

// ---------- Bell: everything waiting for you in one sheet ----------
function openBell() {
  const items = [];
  const a = state.alertsData || { alerts: [] };
  if (a.announcement) items.push(['📢', 'I3lan mel admin', a.announcement, '']);
  for (const al of a.alerts) {
    if (al.status === 'awaiting_dare' && al.outcome === 'winner') items.push(['🏆', `Rba7t "${al.title}"!`, 'Ekhtar l\'chart lel khasrin 😈', 'challenges']);
    else if (al.status === 'awaiting_dare') items.push(['😬', `Khsart "${al.title}"`, 'Nestannew elli rb7ou ya5tarou l\'chart.', 'challenges']);
    else items.push(['🎯', '3andek chart lezem ta3mlou!', al.dare, 'challenges']);
  }
  const w = study.weekly;
  if (w && !w.claimed) items.push([w.progress >= w.target ? '🎁' : '⚔️', 'Tahaddi l\'jom3a', w.progress >= w.target ? 'Kammeltou! Ekhou l\'ghnima.' : `${w.title} · ${Math.min(w.progress, w.target)}/${w.target}`, 'home']);
  const b = study.bac;
  if (b && b.bac_date) {
    const d = daysUntil(b.bac_date);
    if (d > 0 && d <= 120) items.push(['🎓', `${d} nhar ba9i lel ${BAC_SECTIONS[b.section]?.exam || 'imti7an'}`, `${bacProgress(b.items).pct}% mel programme`, 'bac']);
  }
  if (state.profile.user.hp <= 15) items.push(['💔', 'Sa77tek dh3ifa', `${state.profile.user.hp} / ${state.profile.user.max_hp}. Echri dwe men l'Hanout.`, 'shop']);
  openSheet('🔔 Notifications', items.length
    ? `<div class="notif-list">${items.map(([e, t, d, go]) => `<button class="notif" ${go ? `data-go="${go}"` : ''}><span class="e">${e}</span><span class="grow"><b>${esc(t)}</b><small>${esc(d)}</small></span></button>`).join('')}</div>`
    : '<div class="empty">Kol chay 9rit 👏 Ma fammech jdid.</div>', (sheet, close) => {
    sheet.addEventListener('click', (e) => {
      const n = e.target.closest('[data-go]');
      if (n) { close(); location.hash = n.dataset.go; }
    });
  });
}

function renderMonster(m, wasHit) {
  $('#monster-card').innerHTML = `
    <h2 style="justify-content:center">⚔️ L'ghoul mte3ek</h2>
    <div class="monster-emoji ${wasHit ? 'hit' : ''}">${esc(m.emoji)}</div>
    <div class="monster-name">${esc(m.name)}</div>
    <div class="bar-label"><span>Sa77et l'ghoul</span><span>${Math.max(0, m.hp)} / ${m.max_hp}</span></div>
    <div class="bar monster"><i style="width:${pct(m.hp, m.max_hp)}%"></i></div>
    <p class="hint mt">Kol d9i9a 9raya = 1 dharba (×1.5 fel mode sarem). Ghnima: +${m.xp_reward} XP, +${m.gold_reward} 💰 · Ghilen ghlabthom: ${m.defeated}</p>`;
}

function renderStats(s) {
  const max = Math.max(3600, ...s.last7.map((d) => d.seconds));
  $('#stats-card').innerHTML = `
    <div class="row spread"><h2 style="margin:0">📊 Wa9t l'9raya</h2><button class="btn sm warm" id="story-today">📸 Partagi</button></div>
    <div class="stat-grid mt">
      <div class="stat-box"><b>${fmtDuration(s.today)}</b><span>Lyoum</span></div>
      <div class="stat-box"><b>${fmtDuration(s.week)}</b><span>Hal jom3a</span></div>
      <div class="stat-box"><b>${fmtDuration(s.total)}</b><span>Lkol · ${s.sessions} sessions</span></div>
    </div>
    <div class="chart">
      ${s.last7.map((d, i) => `<div class="col ${i === 6 ? 'today' : ''}" title="${esc(d.date)}: ${fmtDuration(d.seconds)}"><i style="height:${pct(d.seconds, max)}%"></i><span>${DAYS[d.weekday].slice(0, 3)}</span></div>`).join('')}
    </div>`;
}

async function refreshProfile() {
  const p = await API.call('auth', 'me');
  setProfile(p);
  renderAlerts(p.announcement, p.alerts);
}

// ---------- Alerts (announcement + dares waiting on me) ----------
function renderAlerts(announcement, alerts = []) {
  state.alertsData = { announcement, alerts };
  if (state.profile) renderHeader(state.profile.user); // refreshes the bell badge
  const parts = [];
  if (announcement) parts.push(`<div class="alert announce"><span class="ico">📢</span><div class="grow"><b>I3lan mel admin</b><div>${esc(announcement)}</div></div></div>`);
  for (const a of alerts) {
    if (a.status === 'awaiting_dare' && a.outcome === 'winner') {
      parts.push(`<div class="alert win"><span class="ico">🏆</span><div class="grow"><b>Rba7t "${esc(a.title)}"!</b><div class="hint">${esc(a.group_name)} · Ekhtar l'chart lel khasrin 😈</div></div><button class="btn sm warm" data-goto-challenges>Ekhtar l'chart</button></div>`);
    } else if (a.status === 'awaiting_dare') {
      parts.push(`<div class="alert lose"><span class="ico">😬</span><div class="grow"><b>Khsart "${esc(a.title)}"…</b><div class="hint">${esc(a.group_name)} · Nestannew elli rb7ou ya5tarou l'chart.</div></div></div>`);
    } else {
      parts.push(`<div class="alert lose"><span class="ico">🎯</span><div class="grow"><b>3andek chart lezem ta3mlou!</b><div>${esc(a.dare)}</div><div class="hint">${esc(a.title)} · ${esc(a.group_name)}</div></div><button class="btn sm warm" data-goto-challenges>3malt l'chart</button></div>`);
    }
  }
  $('#alerts').innerHTML = parts.join('');
}

// ---------- History ----------
const STATUS_CHIP = {
  completed: '<span class="chip good">✅ Kmlet</span>',
  partial: '<span class="chip">💾 Nos</span>',
  failed: '<span class="chip bad">💀 Fechlet</span>',
  abandoned: '<span class="chip">— Mbatla</span>',
};

async function loadHistory() {
  const { sessions } = await API.call('focus', 'history');
  $('#history').innerHTML = sessions.length ? sessions.map((s) => `
    <div class="list-item">
      <div class="grow">
        <div class="title">${esc(s.subject)} ${Number(s.strict) ? '🔒' : ''}</div>
        <div class="sub">${esc(s.started_at)} · kont 7atet ${s.planned_minutes} min</div>
      </div>
      <span class="chip">${fmtDuration(s.credited_seconds)}</span>
      ${Number(s.xp_earned) ? `<span class="chip gold">+${s.xp_earned} XP</span>` : ''}
      ${STATUS_CHIP[s.status] || ''}
    </div>`).join('') : '<div class="empty">Mazelt ma 9rit chay. Ebda awel session lfou9! 🚀</div>';
}

// ---------- Missions (PDF courses) ----------
function missionCard(m) {
  const target = m.target_minutes * 60;
  const p = pct(m.progress_seconds, target);
  const daysLeft = m.deadline ? Math.ceil((new Date(m.deadline + 'T23:59:59') - Date.now()) / 86400000) : null;
  const late = m.status === 'active' && daysLeft !== null && daysLeft < 0;
  const deadline = m.deadline
    ? `<span class="deadline">📅 ${esc(m.deadline)} ${m.status === 'done' ? '' : late ? '(fet l\'wa9t!)' : `(ba9i ${daysLeft} ${daysLeft === 1 ? 'nhar' : 'ayem'})`}</span>`
    : '';
  const groupOptions = ['<option value="0">🔒 Privé</option>']
    .concat(state.groups.map((g) => `<option value="${g.id}" ${m.group_id === g.id ? 'selected' : ''}>🤝 ${esc(g.name)}</option>`)).join('');
  return `
    <div class="list-item mission ${m.status === 'done' ? 'done' : ''} ${late ? 'late' : ''}">
      <span class="pdf-ico">${m.status === 'done' ? '🏅' : '📕'}</span>
      <div>
        <div class="title">${esc(m.title)}</div>
        <div class="meta">${fmtSize(m.size)} · objectif ${m.target_minutes} min ${deadline}</div>
        <div class="bar-label"><span>${fmtDuration(m.progress_seconds)} / ${fmtDuration(target)}</span><span>${Math.floor(p)}%</span></div>
        <div class="bar goal"><i style="width:${p}%"></i></div>
        <div class="row mt" style="gap:6px">
          ${m.status === 'done' ? '<span class="chip good">✅ Kmlet</span>' : `<span class="chip gold">🎁 +${m.reward_xp} XP · +${m.reward_gold} 💰</span>`}
          <select class="input" data-share="${m.id}" style="width:auto;padding:4px 8px;font-size:12px">${groupOptions}</select>
        </div>
      </div>
      <div class="actions">
        ${m.status === 'active' ? `<button class="btn sm primary" data-study="${m.id}">▶ Ebda 9raya</button>` : ''}
        <button class="btn sm" data-open="${m.id}">📖 7ell</button>
        ${m.status === 'active' ? `<button class="btn sm ghost" data-edit="${m.id}">✏️ Baddel</button>` : ''}
        <button class="btn sm ghost" data-del="${m.id}">🗑️ Fasse5</button>
      </div>
    </div>`;
}

function renderMissions(r) {
  state.missions = r.missions;
  state.sharedCount = r.shared.length;
  renderTiles('missions');
  $('#mission-list').innerHTML = r.missions.length ? r.missions.map(missionCard).join('')
    : '<div class="empty">Ma 3andek 7atta mission. Habbat awel cours PDF 👉</div>';
  $('#shared-list').innerHTML = r.shared.length ? r.shared.map((m) => `
    <div class="list-item">
      <span style="font-size:26px">📗</span>
      <div class="grow"><div class="title">${esc(m.title)}</div><div class="sub">${esc(m.owner)} · ${esc(m.group_name)} · ${fmtSize(m.size)} · objectif ${m.target_minutes} min</div></div>
      <button class="btn sm" data-open-shared="${m.id}" data-title="${esc(m.title)}">📖 Chouf</button>
      <button class="btn sm primary" data-clone="${m.id}">📥 Zidha</button>
    </div>`).join('') : '<div class="empty">7atta cours mpartagi. Partagi cours mte3ek m3a jme3tek!</div>';
  if (r.max_mb) $('#drop-hint').textContent = `PDF bark · max ${r.max_mb} Mo`;
}

async function loadMissions() {
  renderMissions(await API.call('missions', 'list'));
}

function setupMissions() {
  const form = $('#mission-form');
  const zone = $('#dropzone');
  const fileInput = $('input[type=file]', zone);
  const showFile = () => {
    const f = fileInput.files[0];
    $('#drop-label').textContent = f ? `📄 ${f.name} (${fmtSize(f.size)})` : 'Ekhtar PDF walla 7ottou hna';
    if (f && !form.title.value) form.title.value = f.name.replace(/\.pdf$/i, '');
  };
  fileInput.addEventListener('change', showFile);
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('drag')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; showFile(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = $('button[type=submit]', form);
    button.disabled = true;
    button.textContent = '⏳ Qa3ed yhabbat…';
    try {
      const r = await API.upload('missions', 'upload', new FormData(form));
      renderMissions(r);
      toast(r.message, 'good');
      form.reset();
      showFile();
      state.timer?.loadMissions();
    } catch (err) { toast(err.message, 'bad'); }
    finally { button.disabled = false; button.textContent = '⬆️ Habbat l\'cours'; }
  });

  $('[data-panel="missions"]').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const find = (id) => state.missions.find((m) => m.id === Number(id));
    try {
      if (t.dataset.study) {
        location.hash = 'focus';
        state.timer.useMission(Number(t.dataset.study));
      } else if (t.dataset.open) {
        const m = find(t.dataset.open);
        openPdf(m.url, m.title);
      } else if (t.dataset.openShared) {
        openPdf(`api/file.php?type=mission&id=${t.dataset.openShared}`, t.dataset.title);
      } else if (t.dataset.clone) {
        const r = await API.call('missions', 'clone', { id: Number(t.dataset.clone) });
        renderMissions(r);
        toast(r.message, 'good');
        state.timer?.loadMissions();
      } else if (t.dataset.edit) {
        const m = find(t.dataset.edit);
        const target = prompt('Objectif jdid (b d9aye9):', m.target_minutes);
        if (target === null) return;
        const deadline = prompt('Date limite (YYYY-MM-DD) — fergha = bla date:', m.deadline || '');
        if (deadline === null) return;
        const r = await API.call('missions', 'update', { id: m.id, title: m.title, target_minutes: Number(target), deadline: deadline.trim() });
        renderMissions(r);
        showEvents(r.events);
        setProfile(r.profile);
        state.timer?.loadMissions();
      } else if (t.dataset.del) {
        if (!confirm('Tfasse5 l\'mission hedhi w l\'PDF mte3ha?')) return;
        renderMissions(await API.call('missions', 'delete', { id: Number(t.dataset.del) }));
        state.timer?.loadMissions();
      }
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('[data-panel="missions"]').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-share]');
    if (!sel) return;
    try {
      const r = await API.call('missions', 'share', { id: Number(sel.dataset.share), group_id: Number(sel.value) });
      renderMissions(r);
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Chghol (to-dos) ----------
const DIFF_CHIP = { easy: '<span class="chip good">Sahel</span>', medium: '<span class="chip warm">Metwassat</span>', hard: '<span class="chip bad">S3ib</span>' };

function renderTasks(data) {
  $('#task-list').innerHTML = data.open.length ? data.open.map((t) => `
    <div class="list-item">
      <button class="check" data-complete="${t.id}" title="Kammelt">✓</button>
      <div class="grow"><div class="title">${esc(t.title)}</div></div>
      ${DIFF_CHIP[t.difficulty]}
      <button class="btn ghost sm" data-delete="${t.id}" title="Fasse5">🗑️</button>
    </div>`).join('') : '<div class="empty">7atta chghol. Zid wa7ed lfou9!</div>';
  $('#task-done').innerHTML = data.done_today.length ? data.done_today.map((t) => `
    <div class="list-item"><span>✅</span><div class="grow"><div class="title" style="text-decoration:line-through;opacity:.7">${esc(t.title)}</div></div>${DIFF_CHIP[t.difficulty]}</div>`).join('')
    : '<div class="empty">Mazelt ma kammelt chay lyoum.</div>';
}

async function loadTasks() {
  renderTasks(await API.call('tasks', 'list'));
}

function setupTasks() {
  $('#task-add').addEventListener('click', () => {
    openSheet('📝 Chghol jdid', `
      <form id="task-form">
        <label class="field"><span>Chnowa bech ta3mel?</span><input class="input" name="title" maxlength="120" placeholder="mathalan: n7ell 10 exercices physique" required></label>
        <div class="diff-pick">
          <label><input type="radio" name="difficulty" value="easy"><span>Sahel<small>+5 XP</small></span></label>
          <label><input type="radio" name="difficulty" value="medium" checked><span>Metwassat<small>+10 XP</small></span></label>
          <label><input type="radio" name="difficulty" value="hard"><span>S3ib<small>+20 XP</small></span></label>
        </div>
        <button class="btn primary big" type="submit">➕ Zid</button>
      </form>`, (sheet, close) => {
      const form = $('#task-form', sheet);
      form.title.focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          renderTasks(await API.call('tasks', 'add', Object.fromEntries(new FormData(form))));
          close();
          toast('📝 Chghol tzad!', 'good');
        } catch (err) { toast(err.message, 'bad'); }
      });
    });
  });
  $('#task-list').addEventListener('click', async (e) => {
    const done = e.target.closest('[data-complete]');
    const del = e.target.closest('[data-delete]');
    try {
      if (done) {
        const r = await API.call('tasks', 'complete', { id: Number(done.dataset.complete) });
        renderTasks(r);
        showEvents(r.events);
        setProfile(r.profile);
      } else if (del && confirm('Tfasse5 l\'chghol hedha?')) {
        renderTasks(await API.call('tasks', 'delete', { id: Number(del.dataset.delete) }));
      }
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Salat (rooms) ----------
function renderRooms() {
  const cards = ROOMS.map((r) => ({ ...r, href: `room.html?room=${r.id}` }))
    .concat(state.groups.map((g) => ({ id: `g${g.id}`, name: g.name, art: 'group', emoji: '👥', desc: `Sala privée lel jme3a mte3ek (${g.members} a3dha).`, href: `room.html?room=g${g.id}` })));
  $('#room-list').innerHTML = cards.map((r) => `
    <div class="card room-card">
      <div class="art ${r.art}">${r.emoji}</div>
      <div class="body">
        <h3 style="color:var(--text);margin:0">${esc(r.name)}</h3>
        <p>${esc(r.desc)}</p>
        <a class="btn primary" href="${r.href}">Od5ol lel sala →</a>
      </div>
    </div>`).join('');
}

// ---------- Jme3ti (groups) ----------
function setGroups(groups) {
  state.groups = groups;
  renderTiles();
  $('#group-list').innerHTML = groups.length ? groups.map((g) => `
    <div class="card group-card" data-group="${g.id}">
      <h3 style="color:var(--text)">${esc(g.name)}</h3>
      <p class="muted" style="font-size:14px">${esc(g.description || 'Bla description')}</p>
      <div class="row"><span class="chip">👥 ${g.members}</span><span class="chip">🎯 ${g.daily_goal_minutes} min/nhar</span>${Number(g.running_challenges) ? `<span class="chip warm">⚔️ ${g.running_challenges} tahaddi</span>` : ''}${Number(g.is_public) ? '' : '<span class="chip">🔒 Privée</span>'}</div>
    </div>`).join('') : '<div class="card empty">Mazelt fi 7atta jme3a. A3mel wa7da walla od5ol b code.</div>';

  const scope = $('#lb-scope');
  const selected = scope.value;
  scope.innerHTML = '<option value="0">🇹🇳 Tounes lkol</option><option value="school">🏫 Lycéeti / faci</option>' + groups.map((g) => `<option value="${g.id}">👥 ${esc(g.name)}</option>`).join('');
  if ([...scope.options].some((o) => o.value === selected)) scope.value = selected;

  renderRooms();
}

async function loadGroups() {
  const [mine, browse] = await Promise.all([API.call('groups', 'mine'), API.call('groups', 'browse')]);
  setGroups(mine.groups);
  $('#group-browse').innerHTML = browse.groups.length ? browse.groups.map((g) => `
    <div class="list-item">
      <div class="grow"><div class="title">${esc(g.name)}</div><div class="sub">👥 ${g.members} · 🎯 ${g.daily_goal_minutes} min/nhar${g.description ? ' · ' + esc(g.description) : ''}</div></div>
      <button class="btn sm" data-join="${g.id}">Od5ol</button>
    </div>`).join('') : '<div class="empty">Mafammech jme3at publiques tawa.</div>';
}

async function openGroup(id) {
  state.openGroup = id;
  $('#group-home').hidden = true;
  $('#group-detail').hidden = false;
  await renderGroupDetail();
  clearInterval(state.groupTimer);
  state.groupTimer = setInterval(() => { if (state.openGroup && !document.hidden) renderGroupDetail().catch(() => {}); }, 30000);
}

function closeGroup() {
  state.openGroup = null;
  clearInterval(state.groupTimer);
  clearInterval(state.liveTick);
  $('#group-home').hidden = false;
  $('#group-detail').hidden = true;
}

async function renderGroupDetail() {
  const [{ group, members, courses }, { challenges }] = await Promise.all([
    API.call('groups', 'detail', { group_id: state.openGroup }),
    API.call('challenges', 'list', { group_id: state.openGroup }),
  ]);
  const goal = group.daily_goal_minutes * 60;
  const loadedAt = Date.now();
  const studying = members.filter((m) => m.studying).length;
  $('#group-detail').innerHTML = `
    <div class="card">
      <div class="row spread">
        <button class="btn ghost sm" id="group-back">← Arja3</button>
        <div class="row">
          <a class="btn primary sm" href="room.html?room=g${group.id}">🏰 Od5ol lel sala mta3 l'jme3a</a>
          <button class="btn danger sm" id="group-leave">Okhrej mel jme3a</button>
        </div>
      </div>
      <h2 class="mt" style="font-size:1.4rem">${esc(group.name)}</h2>
      <p class="muted">${esc(group.description || '')}</p>
      <div class="row" style="margin-bottom:16px">
        <span class="muted">Code d'invitation:</span><span class="code">${esc(group.invite_code)}</span>
        <button class="btn sm primary" id="group-invite">🔗 Ab3ath lien lel s7ab</button>
        <span class="chip">🎯 Objectif ${group.daily_goal_minutes} min/nhar</span>
        <span class="chip good"><span class="live-dot"></span> ${studying} ya9raw tawa</span>
      </div>
      <div class="table-wrap"><table class="lb">
        <tr><th>#</th><th>3odhw</th><th>Tawa</th><th style="width:30%">Objectif lyoum</th><th class="time">Lyoum</th><th class="time">Hal jom3a</th></tr>
        ${members.map((m, i) => `
          <tr class="${m.id === state.profile.user.id ? 'me' : ''}">
            <td class="rank">${i + 1}</td>
            <td><div class="who">${avatarHTML(m.avatar_color, m.hat, 'sm', m.photo, m.look)} ${esc(m.username)} <span class="chip">Nv ${m.level}</span></div></td>
            <td>${m.studying ? `<span class="chip good"><span class="live-dot"></span> ${esc(m.studying)}</span>` : '<span class="hint">—</span>'}</td>
            <td><div class="bar goal"><i data-goal="${i}" style="width:${pct(m.today + m.live_seconds, goal)}%"></i></div></td>
            <td class="time" data-today="${i}">${fmtDuration(m.today + m.live_seconds)}</td>
            <td class="time">${fmtDuration(m.week + m.live_seconds)}</td>
          </tr>`).join('')}
      </table></div>
    </div>

    <div class="grid focus-grid mt">
      <div class="stack">
        <h2 style="margin:0">⚔️ Tahadiyet l'jme3a</h2>
        ${challenges.length ? challenges.map(challengeCard).join('') : '<div class="card empty">7atta tahaddi. Ebda wa7ed w chouf chkoun l\'bat! 😏</div>'}
      </div>
      <div class="stack">
        <div class="card">
          <h2>⚔️ Ebda tahaddi</h2>
          <form id="group-challenge-form"><input type="hidden" name="group_id" value="${group.id}">${challengeFields()}</form>
        </div>
        <div class="card">
          <h2>📚 Cours mpartagyin</h2>
          <div class="list">
            ${courses.length ? courses.map((c) => `
              <div class="list-item">
                <span>📗</span>
                <div class="grow"><div class="title">${esc(c.title)}</div><div class="sub">${esc(c.owner)} · ${c.target_minutes} min</div></div>
                <button class="btn sm" data-open-shared="${c.id}" data-title="${esc(c.title)}">📖</button>
                ${Number(c.mine) ? '' : `<button class="btn sm primary" data-clone="${c.id}">📥</button>`}
              </div>`).join('') : '<div class="empty">Partagi cours mel tab 📚 Missions.</div>'}
          </div>
        </div>
      </div>
    </div>`;

  $('#group-back').addEventListener('click', closeGroup);
  $('#group-invite').addEventListener('click', () => shareLink(`${siteHome(state.profile.home_url)}?g=${group.invite_code}`,
    `📚 Od5ol jme3ti "${group.name}" fi 9rayaverse w n9raw m3a ba3dhna!`));
  $('#group-leave').addEventListener('click', async () => {
    if (!confirm(`Bech tokhrej men "${group.name}"?`)) return;
    try {
      setGroups((await API.call('groups', 'leave', { group_id: group.id })).groups);
      closeGroup();
      loadGroups();
    } catch (e) { toast(e.message, 'bad'); }
  });
  bindChallengeForm($('#group-challenge-form'), () => renderGroupDetail());

  // Tick the time of members who are studying right now (live counter).
  clearInterval(state.liveTick);
  state.liveTick = setInterval(() => {
    const extra = (Date.now() - loadedAt) / 1000;
    members.forEach((m, i) => {
      if (!m.studying) return;
      const total = m.today + m.live_seconds + extra;
      const cell = $(`[data-today="${i}"]`);
      const bar = $(`[data-goal="${i}"]`);
      if (cell) cell.textContent = fmtDuration(total);
      if (bar) bar.style.width = pct(total, goal) + '%';
    });
  }, 1000);
}

function setupGroups() {
  $('#group-create').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await API.call('groups', 'create', {
        name: f.name.value, description: f.description.value,
        daily_goal_minutes: Number(f.daily_goal_minutes.value), is_public: f.is_public.checked,
      });
      setGroups(r.groups);
      f.reset();
      toast('Jme3a jdida! Ab3ath l\'code lel s7ab.', 'good');
      openGroup(r.group_id);
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#group-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.call('groups', 'join', { code: e.target.code.value });
      setGroups(r.groups);
      e.target.reset();
      toast('Dkhalt lel jme3a! 🎉', 'good');
      openGroup(r.group_id);
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#group-browse').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-join]');
    if (!b) return;
    try {
      const r = await API.call('groups', 'join', { group_id: Number(b.dataset.join) });
      toast('Dkhalt lel jme3a! 🎉', 'good');
      await loadGroups();
      openGroup(r.group_id);
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#group-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-group]');
    if (card) openGroup(Number(card.dataset.group));
  });
  $('#group-detail').addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open-shared]');
    const clone = e.target.closest('[data-clone]');
    try {
      if (open) openPdf(`api/file.php?type=mission&id=${open.dataset.openShared}`, open.dataset.title);
      if (clone) {
        const r = await API.call('missions', 'clone', { id: Number(clone.dataset.clone) });
        toast(r.message, 'good');
        state.timer?.loadMissions();
        renderGroupDetail();
      }
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Tahadiyet (challenges + chorout) ----------
function challengeFields() {
  return `
    <label class="field"><span>Esm l'tahaddi</span><input class="input" name="title" maxlength="80" required placeholder="Chkoun ya9ra akther hal jom3a? 🔥"></label>
    <div class="row" style="flex-wrap:nowrap">
      <label class="field" style="flex:1"><span>Chnowa n7asbou?</span>
        <select class="input" name="metric"><option value="minutes">⏱️ Akther wa9t 9raya</option><option value="missions">📚 Akther missions kmlou</option></select>
      </label>
      <label class="field" style="flex:1"><span>L'modda</span>
        <select class="input" name="duration_hours">${DURATIONS.map(([h, l]) => `<option value="${h}" ${h === 168 ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
    </div>
    <button class="btn warm big" type="submit">⚔️ Ebda l'tahaddi</button>`;
}

function bindChallengeForm(form, after) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!Number(data.group_id)) return toast('A3mel walla od5ol jme3a 9bal.', 'bad');
    try {
      const r = await API.call('challenges', 'create', { ...data, group_id: Number(data.group_id), duration_hours: Number(data.duration_hours) });
      toast(r.message, 'good');
      form.title.value = '';
      after();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

const CH_STATUS = {
  running: (c) => `<span class="chip warm">⏳ Ba9i ${fmtLeft(c.ends_in)}</span>`,
  awaiting_dare: () => '<span class="chip gold">😈 Nestannew l\'chart</span>',
  dare_pending: () => '<span class="chip bad">🎯 L\'khasrin y3amlou l\'chart</span>',
  closed: () => '<span class="chip good">✅ Wfé</span>',
  cancelled: () => '<span class="chip">🚫 Tbatel (a9al men 2 nes)</span>',
};

function challengeCard(c) {
  const meId = state.profile.user.id;
  const fmtScore = (s) => (c.metric === 'missions' ? `${s} mission${s === 1 ? '' : 's'}` : fmtDuration(s));
  const badge = (p) => (p.outcome === 'winner' ? '🏆' : p.outcome === 'loser' ? (p.dare_done ? '✅' : '🤡') : '');

  let action = '';
  if (c.status === 'running') {
    action = c.joined
      ? `<button class="btn sm ghost" data-ch-leave="${c.id}">🚪 Nokhrej mel tahaddi</button>`
      : `<button class="btn warm" data-ch-join="${c.id}">💪 Ana m3akom!</button>`;
  } else if (c.status === 'awaiting_dare' && c.my_outcome === 'winner') {
    action = `
      <div class="dare-box">
        <b>🏆 Rba7t! Ekhtar l'chart lel khasrin:</b>
        <div class="dare-ideas">${DARE_IDEAS.map((d) => `<button type="button" data-dare-idea="${c.id}">${esc(d)}</button>`).join('')}</div>
        <div class="row" style="flex-wrap:nowrap"><input class="input" id="dare-input-${c.id}" maxlength="200" placeholder="walla ekteb chart mte3ek…"><button class="btn warm" data-dare-send="${c.id}">😈 Ab3ath</button></div>
      </div>`;
  }
  if (c.dare) {
    action += `<div class="dare-box"><span class="hint">L'chart:</span><div class="dare">🎯 ${esc(c.dare)}</div>
      ${c.status === 'dare_pending' && c.my_outcome === 'loser' && !c.my_dare_done ? `
        <div class="row"><label class="btn sm" style="cursor:pointer">📸 Preuve (taswira)<input type="file" accept="image/*" id="proof-${c.id}" hidden></label>
        <button class="btn warm sm" data-dare-done="${c.id}">✅ 3malt l'chart</button></div>` : ''}
    </div>`;
  }
  const proofs = c.players.filter((p) => p.proof).map((p) => `<div class="mt"><span class="hint">Preuve mta3 ${esc(p.username)}:</span><img class="proof" src="${esc(p.proof)}" alt="preuve"></div>`).join('');

  return `
    <div class="card challenge">
      <div class="head">
        <div><h3 style="color:var(--text);margin:0 0 4px">${esc(c.title)}</h3>
          <div class="row" style="gap:6px"><span class="chip">👥 ${esc(c.group_name)}</span><span class="chip">${c.metric === 'missions' ? '📚 Missions' : '⏱️ Wa9t'}</span>${CH_STATUS[c.status](c)}</div>
        </div>
        <span class="vs">${c.players.length} LA3ABA</span>
      </div>
      <div class="podium">
        ${c.players.map((p, i) => `
          <div class="p ${p.outcome || ''} ${p.id === meId ? 'me' : ''}">
            <b style="width:22px">${i + 1}</b>${avatarHTML(p.avatar_color, p.hat, 'sm', p.photo, p.look)}
            <span class="grow">${esc(p.username)} ${badge(p)}</span><span class="score">${fmtScore(p.score)}</span>
          </div>`).join('') || '<div class="empty">7atta wa7ed mazel</div>'}
      </div>
      ${action}${proofs}
    </div>`;
}

async function loadChallenges() {
  const { challenges } = await API.call('challenges', 'list');
  state.challenges = challenges;
  renderTiles('challenges');
  $('#challenge-list').innerHTML = challenges.length ? challenges.map(challengeCard).join('')
    : '<div class="card empty">Mafammech tahadiyet. Ebda wa7ed m3a s7abek 👉</div>';
}

function setupChallenges() {
  $('#challenge-new').addEventListener('click', () => {
    if (!state.groups.length) return toast('A3mel walla od5ol jme3a 9bal (tab Jme3ti) 👥', 'bad');
    openSheet('⚔️ Tahaddi jdid', `
      <form id="challenge-create">
        <label class="field"><span>Fi ama jme3a?</span><select class="input" name="group_id" required>
          ${state.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
        ${challengeFields()}
      </form>`, (sheet, close) => {
      bindChallengeForm($('#challenge-create', sheet), () => { close(); loadChallenges().catch(() => {}); });
    });
  });

  // One delegated handler for challenge cards in both the Tahadiyet tab and group details.
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ch-join],[data-ch-leave],[data-dare-idea],[data-dare-send],[data-dare-done],[data-goto-challenges]');
    if (!b) return;
    const refresh = () => {
      loadChallenges().catch(() => {});
      if (state.openGroup) renderGroupDetail().catch(() => {});
      refreshProfile().catch(() => {});
    };
    try {
      if (b.dataset.gotoChallenges !== undefined) {
        location.hash = 'challenges';
      } else if (b.dataset.chJoin) {
        toast((await API.call('challenges', 'join', { challenge_id: Number(b.dataset.chJoin) })).message, 'good');
        refresh();
      } else if (b.dataset.chLeave) {
        if (!confirm('Bech tokhrej mel tahaddi? 🐔')) return;
        await API.call('challenges', 'leave', { challenge_id: Number(b.dataset.chLeave) });
        refresh();
      } else if (b.dataset.dareIdea) {
        const input = $(`#dare-input-${b.dataset.dareIdea}`);
        if (input) input.value = b.textContent;
      } else if (b.dataset.dareSend) {
        const dare = $(`#dare-input-${b.dataset.dareSend}`).value.trim();
        if (!dare) return toast('Ekhtar walla ekteb chart.', 'bad');
        toast((await API.call('challenges', 'set_dare', { challenge_id: Number(b.dataset.dareSend), dare })).message, 'gold');
        refresh();
      } else if (b.dataset.dareDone) {
        const fd = new FormData();
        fd.append('challenge_id', b.dataset.dareDone);
        const file = $(`#proof-${b.dataset.dareDone}`)?.files[0];
        if (file) fd.append('proof', file);
        else if (!confirm('Tsajjel l\'chart bla taswira preuve?')) return;
        const r = await API.upload('challenges', 'dare_done', fd);
        toast(r.message, 'good');
        showEvents(r.events);
        refresh();
      }
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Tartib (leaderboard) ----------
async function loadLeaderboard() {
  const medals = ['🥇', '🥈', '🥉'];
  const schools = state.lbKind === 'schools';
  $('#lb-scope').hidden = schools;
  $('#lb-wilaya').hidden = schools;
  if (schools) {
    const r = await API.call('leaderboard', 'schools', { period: state.lbPeriod });
    $('#lb-me').textContent = !r.my_school ? '🏫 Ekteb l\'lycée walla l\'fac mte3ek fel Profili bech t3awen lycéek yetla3.'
      : r.my_rank ? `🏫 ${r.my_school} #${r.my_rank}. Kammlou haka! 💪` : `🏫 ${r.my_school} mazel ma dhharech. 9raw bech yetla3!`;
    $('#lb-table').innerHTML = r.rows.length ? `
      <tr><th>Tartib</th><th>Lycée / fac</th><th>Wileya</th><th>Etalba</th><th class="time">Wa9t l'9raya</th></tr>
      ${r.rows.map((s, i) => `
        <tr class="${r.my_school && s.school.toLowerCase() === r.my_school.toLowerCase() ? 'me' : ''}">
          <td class="rank">${medals[i] ? `<span style="font-size:20px">${medals[i]}</span>` : '#' + (i + 1)}</td>
          <td><b>🏫 ${esc(s.school)}</b></td><td class="hint">${esc(s.wilaya || '—')}</td>
          <td><span class="chip">👥 ${s.students}</span></td><td class="time">${fmtDuration(s.seconds)}</td>
        </tr>`).join('')}` : '<tr><td class="empty">7atta lycée ma 9ra fel période hedhi. Kon enti l\'awel! 🚀</td></tr>';
    return;
  }
  const scope = $('#lb-scope').value;
  const groupId = scope === 'school' ? 0 : Number(scope);
  const wilayaSel = $('#lb-wilaya');
  wilayaSel.disabled = groupId > 0 || scope === 'school';
  const r = await API.call('leaderboard', 'get', { period: state.lbPeriod, group_id: groupId, my_school: scope === 'school', wilaya: wilayaSel.disabled ? '' : wilayaSel.value });
  $('#lb-me').textContent = r.my_rank ? `Enti #${r.my_rank} fel tartib hedha. Kammel haka! 💪` : '9ra chwaya fel période hedhi bech todhhar fel tartib.';
  $('#lb-table').innerHTML = r.rows.length ? `
    <tr><th>Tartib</th><th>Etalb</th><th>Wileya</th><th>Niveau</th><th class="time">Wa9t l'9raya</th></tr>
    ${r.rows.map((u, i) => `
      <tr class="${u.id === state.profile.user.id ? 'me' : ''}">
        <td class="rank">${medals[i] ? `<span style="font-size:20px">${medals[i]}</span>` : '#' + (i + 1)}</td>
        <td><div class="who">${avatarHTML(u.avatar_color, u.hat, 'sm', u.photo, u.look)} ${esc(u.username)}</div></td>
        <td class="hint">${esc(u.wilaya || '—')}</td>
        <td><span class="chip">Nv ${u.level}</span></td>
        <td class="time">${fmtDuration(u.seconds)}</td>
      </tr>`).join('')}` : '<tr><td class="empty">7atta wa7ed ma 9ra fel période hedhi — kon enti l\'awel! 🚀</td></tr>';
}

function setupLeaderboard() {
  $('#lb-wilaya').insertAdjacentHTML('beforeend', WILAYAS.map((w) => `<option>${esc(w)}</option>`).join(''));
  $('#lb-period').addEventListener('click', (e) => {
    const b = e.target.closest('[data-period]');
    if (!b) return;
    state.lbPeriod = b.dataset.period;
    $$('#lb-period button').forEach((x) => x.classList.toggle('active', x === b));
    loadLeaderboard().catch((err) => toast(err.message, 'bad'));
  });
  $('#lb-kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    state.lbKind = b.dataset.kind;
    $$('#lb-kind button').forEach((x) => x.classList.toggle('active', x === b));
    loadLeaderboard().catch((err) => toast(err.message, 'bad'));
  });
  ['#lb-scope', '#lb-wilaya'].forEach((s) => $(s).addEventListener('change', () => loadLeaderboard().catch((err) => toast(err.message, 'bad'))));
}

// ---------- Hanout (shop) ----------
function renderShop(r) {
  setProfile(r.profile);
  const gold = r.profile.user.gold;
  $('#shop-grid').innerHTML = r.items.map((it) => {
    const preview = it.type === 'color' ? `<span class="swatch" style="background:${esc(it.value)}"></span>`
      : it.type === 'potion' ? '🧪' : (it.value || '🚫');
    let action;
    if (it.type === 'potion') action = `<button class="btn sm warm" data-buy="${it.item_key}" ${gold < it.price ? 'disabled' : ''}>Echrob · ${it.price} 💰</button>`;
    else if (it.equipped) action = '<span class="chip good">Labsou</span>';
    else if (it.owned) action = `<button class="btn sm" data-equip="${it.item_key}">Elbes</button>`;
    else action = `<button class="btn sm primary" data-buy="${it.item_key}" ${gold < it.price ? 'disabled' : ''}>Echri · ${it.price} 💰</button>`;
    return `<div class="card shop-item"><div class="preview">${preview}</div><div class="name">${esc(it.name)}</div>${it.price && !it.owned ? `<div class="price">${it.price} 💰</div>` : '<div class="hint">' + (it.type === 'potion' ? 'Yetchreb' : '3andek') + '</div>'}${action}</div>`;
  }).join('');
}

async function loadShop() {
  renderShop(await API.call('shop', 'list'));
}

function setupShop() {
  $('#shop-grid').addEventListener('click', async (e) => {
    const buy = e.target.closest('[data-buy]');
    const equip = e.target.closest('[data-equip]');
    try {
      if (buy) {
        const r = await API.call('shop', 'buy', { key: buy.dataset.buy });
        renderShop(r);
        if (r.message) toast(r.message, 'gold');
      } else if (equip) {
        renderShop(await API.call('shop', 'equip', { key: equip.dataset.equip }));
      }
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Profili ----------
function renderProfileCard() {
  const u = state.profile.user;
  const s = state.profile.stats;
  $('#profile-avatar').innerHTML = avatarHTML(u.avatar_color, u.hat, 'xl', u.photo, u.look);
  $('#photo-remove').hidden = !u.photo;
  const form = $('#profile-form');
  if (document.activeElement?.form !== form) {
    form.bio.value = u.bio || '';
    form.wilaya.value = u.wilaya || '';
    form.school.value = u.school || '';
  }
  $('#profile-stats').innerHTML = `
    <h2>📈 Statistiques</h2>
    <div class="stat-grid">
      <div class="stat-box"><b>Nv ${u.level}</b><span>Niveau</span></div>
      <div class="stat-box"><b>${fmtDuration(s.total)}</b><span>Wa9t lkol</span></div>
      <div class="stat-box"><b>🔥 ${u.best_streak}</b><span>A7san streak</span></div>
      <div class="stat-box"><b>${u.monster.defeated}</b><span>Ghilen ghlabthom</span></div>
      <div class="stat-box"><b>${s.sessions}</b><span>Sessions kmlou</span></div>
      <div class="stat-box"><b>💰 ${u.gold}</b><span>Flous</span></div>
    </div>
    <p class="hint">${esc(u.email)}${u.role === 'admin' ? ' · 🛠️ Admin général' : ''}</p>`;
}

function setupProfile() {
  $('#profile-form [name=wilaya]').insertAdjacentHTML('beforeend', WILAYAS.map((w) => `<option>${esc(w)}</option>`).join(''));
  API.call('profile', 'schools').then((r) => {
    $('#school-list').innerHTML = r.schools.map((s) => `<option value="${esc(s)}">`).join('');
  }).catch(() => {});
  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.call('profile', 'update', Object.fromEntries(new FormData(e.target)));
      setProfile(r);
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const r = await API.upload('profile', 'photo', fd);
      setProfile(r);
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
    e.target.value = '';
  });
  $('#photo-remove').addEventListener('click', async () => {
    if (!confirm('Tna77i sourtek?')) return;
    try { setProfile(await API.call('profile', 'photo_remove')); } catch (err) { toast(err.message, 'bad'); }
  });
  $('#password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      toast((await API.call('profile', 'password', Object.fromEntries(new FormData(e.target)))).message, 'good');
      e.target.reset();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Notifications (Web Push) ----------
function b64ToBytes(b64) {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function loadPushBox() {
  const box = $('#push-box');
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const cfg = await API.call('push', 'config');
  if (!cfg.enabled) { box.innerHTML = '<p class="hint">L\'notifications mazelou mouch mfa3lin 3al serveur.</p>'; return; }
  if (!supported) {
    box.innerHTML = `<p class="hint">${ios && !standalone ? '📲 3al iPhone: sobb l\'app 9bal (Partager → Sur l\'écran d\'accueil), ba3d 7ellha w fa3el l\'notifications.' : 'L\'navigateur hedha ma y9addemch notifications. Jarreb Chrome.'}</p>`;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  const on = !!sub && cfg.subscribed;
  const hours = [-1, 7, 8, 9, 12, 14, 16, 17, 18, 19, 20, 21, 22];
  box.innerHTML = `
    <p class="hint">Nfakkrouk bel 9raya, ken s7abek bdew ya9raw, w bel tahadiyet. ${Notification.permission === 'denied' ? '<b>⚠️ Mamnou3in fel navigateur: 7ellhom men l\'cadenas 🔒 7dhe l\'adresse.</b>' : ''}</p>
    <div class="row">
      <button class="btn ${on ? '' : 'primary'}" id="push-toggle">${on ? '🔕 Sakker' : '🔔 Fa3el l\'notifications'}</button>
      ${on ? '<button class="btn sm ghost" id="push-test">📨 Jarreb</button>' : ''}
    </div>
    <label class="field mt"><span>⏰ Fakkerni kol nhar (ken ma 9ritech) m3a:</span>
      <select class="input" id="push-hour" style="width:auto">${hours.map((h) => `<option value="${h}" ${h === cfg.reminder_hour ? 'selected' : ''}>${h < 0 ? 'Ma tfakkernich' : h + ':00'}</option>`).join('')}</select>
    </label>`;
  box.dataset.key = cfg.public_key;
}

function setupPushBox() {
  $('#push-box').addEventListener('click', async (e) => {
    const box = $('#push-box');
    try {
      if (e.target.id === 'push-toggle') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub && e.target.textContent.includes('Sakker')) {
          await API.call('push', 'unsubscribe', { endpoint: sub.endpoint });
          await sub.unsubscribe();
          toast('🔕 L\'notifications tsakrou.', 'info');
        } else {
          if (await Notification.requestPermission() !== 'granted') return toast('Lezmek ta3ti l\'idhn lel notifications.', 'bad');
          const fresh = sub || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(box.dataset.key) });
          toast((await API.call('push', 'subscribe', fresh.toJSON())).message, 'good');
        }
        loadPushBox();
      } else if (e.target.id === 'push-test') {
        toast((await API.call('push', 'test')).message, 'good');
      }
    } catch (err) { toast(err.message || 'Ma najjamnech nfa3lou l\'notifications.', 'bad'); }
  });
  $('#push-box').addEventListener('change', async (e) => {
    if (e.target.id !== 'push-hour') return;
    try { toast((await API.call('push', 'reminder', { hour: Number(e.target.value) })).message, 'good'); } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Salat privées ----------
const THEME_ART = { pink: ['pink', '🌸'], library: ['library', '📚'], cafe: ['cafe', '☕'], forest: ['forest', '🌲'] };

function renderPrivateRooms(rooms) {
  state.proomCount = rooms.length;
  renderTiles('rooms');
  $('#proom-list').innerHTML = rooms.map((r) => {
    const [art, emoji] = THEME_ART[r.theme] || THEME_ART.pink;
    return `
      <div class="card room-card">
        <div class="art ${art}">${emoji}🔐</div>
        <div class="body">
          <h3 style="color:var(--text);margin:0">${esc(r.name)}</h3>
          <p>${r.is_owner ? '👑 Salatek' : `Mta3 ${esc(r.owner)}`} · 👥 ${r.members} · <span class="code" style="font-size:10px">${esc(r.code)}</span></p>
          <div class="row">
            <a class="btn primary" href="room.html?room=${esc(r.ws_id)}">Od5ol →</a>
            <button class="btn sm ghost" data-invite-room="${esc(r.code)}" data-name="${esc(r.name)}">🔗 Lien</button>
            <button class="btn sm ghost" data-proom-leave="${esc(r.code)}" data-owner="${r.is_owner ? 1 : 0}">${r.is_owner ? '🗑️ Fasse5' : '🚪 Okhrej'}</button>
          </div>
        </div>
      </div>`;
  }).join('') || '<div class="card empty">Mazelt ma 3andek 7atta sala privée. A3mel wa7da walla od5ol b code!</div>';
}

async function loadPrivateRooms() {
  renderPrivateRooms((await API.call('rooms', 'mine')).rooms);
}

function setupPrivateRooms() {
  $('#proom-create').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.call('rooms', 'create', Object.fromEntries(new FormData(e.target)));
      renderPrivateRooms(r.rooms);
      toast(r.message, 'good', 7000);
      e.target.reset();
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#proom-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.call('rooms', 'join', { code: e.target.code.value.trim() });
      renderPrivateRooms(r.rooms);
      toast(r.message, 'good');
      location.href = `room.html?room=p${r.code}`;
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#proom-list').addEventListener('click', async (e) => {
    const invite = e.target.closest('[data-invite-room]');
    const leave = e.target.closest('[data-proom-leave]');
    if (invite) shareLink(`${siteHome(state.profile.home_url)}?r=${invite.dataset.inviteRoom}`, `🔐 Od5ol salti "${invite.dataset.name}" fi 9rayaverse (code ${invite.dataset.inviteRoom})`);
    if (leave) {
      const owner = leave.dataset.owner === '1';
      if (!confirm(owner ? 'Tfasse5 l\'sala hedhi lel kol?' : 'Tokhrej mel sala hedhi?')) return;
      try { renderPrivateRooms((await API.call('rooms', 'leave', { code: leave.dataset.proomLeave })).rooms); } catch (err) { toast(err.message, 'bad'); }
    }
  });
}

// ---------- Perso (chibi character) editor ----------
let draftLook = null;

function drawPersoPreview() {
  const c = $('#perso-preview');
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  g.setTransform(5, 0, 0, 5, 0, 0);
  const u = state.profile.user;
  drawChibi(g, 34, 42, { look: { ...draftLook, mode: 'perso' }, color: u.avatar_color, hat: u.hat, dir: 'down' });
}

function renderPersoEditor() {
  const opt = (key, labels, swatch) => `
    <div class="opt-row"><span>${{ skin: 'Lawn l\'bachra', hair: 'Cha3r', hairColor: 'Lawn l\'cha3r', eyes: '3inin', glasses: 'Nadharat' }[key]}</span>
      <div class="opts">${labels.map((l, i) => `<button type="button" class="${swatch ? 'swatch-btn' : ''} ${draftLook[key] === i ? 'active' : ''}" data-look="${key}" data-val="${i}" ${swatch ? `style="background:${l}" title="${l}"` : ''}>${swatch ? '' : esc(l)}</button>`).join('')}</div>
    </div>`;
  $('#perso-options').innerHTML = [
    opt('skin', LOOK_OPTIONS.skin, true),
    opt('hair', LOOK_OPTIONS.hair),
    opt('hairColor', LOOK_OPTIONS.hairColor, true),
    opt('eyes', LOOK_OPTIONS.eyes),
    opt('glasses', LOOK_OPTIONS.glasses),
    `<label class="switch" style="margin:6px 0"><input type="checkbox" id="look-blush" ${draftLook.blush ? 'checked' : ''}> Wjouh 7mor 😊</label>`,
    `<div class="opt-row"><span>Fel sala w fel listes, nwarri:</span><div class="opts">
      <button type="button" data-look="mode" data-val="perso" class="${draftLook.mode === 'perso' ? 'active' : ''}">🧍 L'perso</button>
      <button type="button" data-look="mode" data-val="photo" class="${draftLook.mode === 'photo' ? 'active' : ''}" ${state.profile.user.photo ? '' : 'disabled title="7ott sourtek 9bal"'}>📸 Sourti</button>
    </div></div>`,
    '<p class="hint">L\'hwayej (kabbous, lawn l\'t-shirt) techrihom mel 🛒 Hanout.</p>',
  ].join('');
  drawPersoPreview();
}

function setupPersoEditor() {
  draftLook = normalizeLook(state.profile.user.look);
  renderPersoEditor();
  $('#perso-options').addEventListener('click', (e) => {
    const b = e.target.closest('[data-look]');
    if (!b) return;
    draftLook[b.dataset.look] = b.dataset.look === 'mode' ? b.dataset.val : Number(b.dataset.val);
    renderPersoEditor();
  });
  $('#perso-options').addEventListener('change', (e) => {
    if (e.target.id === 'look-blush') { draftLook.blush = e.target.checked; drawPersoPreview(); }
  });
  $('#perso-save').addEventListener('click', async () => {
    try {
      const r = await API.call('profile', 'look', { look: draftLook });
      setProfile(r);
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Tabs ----------
const MAIN_TABS = ['home', 'focus', 'rooms', 'challenges'];

function showTab(name) {
  if (name === 'quests') name = 'home'; // old link: the tasks now live on Accueil
  if (!$(`[data-panel="${name}"]`)) name = 'home';
  // Bottom bar: the 4 main screens; other pages (Tartib, Profili…) keep "Accueil" lit and show a back button.
  state.tab = name;
  renderTiles(name);
  const lit = MAIN_TABS.includes(name) ? name : 'home';
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === lit));
  $('#back-home').hidden = MAIN_TABS.includes(name);
  $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'profile' && draftLook) renderPersoEditor();
  if (name === 'profile') loadPushBox().catch(() => {});
  const loaders = {
    home: () => Promise.all([loadTasks(), loadWeekly(), loadBac()]),
    leaderboard: loadLeaderboard, shop: loadShop, groups: loadGroups, missions: loadMissions,
    challenges: loadChallenges, rooms: loadPrivateRooms, bac: loadBac, cards: loadDecks,
  };
  Promise.resolve(loaders[name]?.()).then(() => renderTiles(name)).catch((e) => toast(e.message, 'bad'));
}

function setupTabs() {
  // Bottom navigation + "more pages" pills share the same data-tab buttons.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) location.hash = b.dataset.tab;
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1) || 'home');
}

// ---------- Invite links (?g=CODE / ?r=CODE) ----------
async function acceptInvite() {
  const inv = rememberInvite();
  if (!inv) return;
  store.set('invite', null);
  try {
    if (inv.type === 'group') {
      if (state.groups.some((g) => g.invite_code === inv.code)) return;
      const r = await API.call('groups', 'join', { code: inv.code });
      setGroups(r.groups);
      celebrate('🎉', 'Dkhalt lel jme3a!', 'Sa7bek 3ayatlek w tawa enti m3ahom. Yallah n9raw!');
      location.hash = 'groups';
      openGroup(r.group_id);
    } else {
      const r = await API.call('rooms', 'join', { code: inv.code });
      toast(r.message, 'good');
      location.href = `room.html?room=p${r.code}`;
    }
  } catch (err) { toast(err.message, 'bad'); }
}

// ---------- Boot ----------
(async function init() {
  let me;
  try {
    me = await API.call('auth', 'me');
  } catch (e) {
    $('#player-bar').innerHTML = `<span class="form-error">${esc(e.message)}</span>`;
    hideSplash();
    return;
  }
  setupProfile();
  setProfile(me);
  renderAlerts(me.announcement, me.alerts);
  setupLogout($('#logout'));
  setupInstallButton($('#install-btn'));
  setupMissions();
  setupTasks();
  setupGroups();
  setupChallenges();
  setupLeaderboard();
  setupShop();
  setupPrivateRooms();
  setupPersoEditor();
  setupBac();
  setupWeekly();
  setupThemeSeg($('#theme-seg'));
  document.addEventListener('click', (e) => { if (e.target.closest('#bell')) openBell(); });
  Ambience.renderChips($('#amb-chips'));
  $('#stats-card').addEventListener('click', (e) => {
    if (e.target.id !== 'story-today') return;
    const u = state.profile.user;
    const s = state.profile.stats;
    const today = s.today > 0;
    shareStory({
      user: u,
      home: state.profile.home_url,
      big: fmtDuration(today ? s.today : s.week),
      label: today ? '9rit lyoum 📚' : '9rit hal jom3a 📚',
      lines: [`🔥 ${u.streak} ${u.streak === 1 ? 'nhar' : 'ayem'} mtab3in · ⭐ Niveau ${u.level}`, `⏱️ ${fmtDuration(s.total)} 9raya lkol`],
    }).catch((err) => toast(err.message, 'bad'));
  });
  setupDecks();
  setupPushBox();
  loadBac().catch(() => {});

  state.timer = new FocusTimer($('#focus-timer'), {
    onResult: (r) => {
      if (r.profile) setProfile(r.profile); else refreshProfile();
      loadHistory().catch(() => {});
      loadWeekly().catch(() => {});
      loadBac().catch(() => {});
    },
  });

  renderRooms();
  await loadGroups().catch((e) => toast(e.message, 'bad'));
  setupTabs();
  acceptInvite();
  loadHistory().catch((e) => toast(e.message, 'bad'));
  hideSplash();
})();

/** Fades the splash screen out once the account is loaded. */
function hideSplash() {
  const s = $('#splash');
  if (!s) return;
  s.classList.add('out');
  setTimeout(() => s.remove(), 450);
}
