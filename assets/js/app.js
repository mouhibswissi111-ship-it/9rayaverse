// Dashboard: profile, focus timer, monster, stats, missions (PDF), chghol, rooms, groups,
// tahadiyet (challenges + chorout), tartib, hanout, profili.
'use strict';

const state = { profile: null, groups: [], lbPeriod: 'week', openGroup: null, groupTimer: null, liveTick: null, timer: null, challenges: [] };

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
  renderPlayerBar($('#player-bar'), u);
  renderMonster(u.monster, prevMonsterHp !== undefined && u.monster.hp < prevMonsterHp);
  renderStats(state.profile.stats);
  renderProfileCard();
  $('#admin-link').hidden = u.role !== 'admin';
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
    <h2>📊 Wa9t l'9raya</h2>
    <div class="stat-grid">
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
  $('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      renderTasks(await API.call('tasks', 'add', Object.fromEntries(new FormData(form))));
      form.reset();
      form.title.focus();
    } catch (err) { toast(err.message, 'bad'); }
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
  $('#group-list').innerHTML = groups.length ? groups.map((g) => `
    <div class="card group-card" data-group="${g.id}">
      <h3 style="color:var(--text)">${esc(g.name)}</h3>
      <p class="muted" style="font-size:14px">${esc(g.description || 'Bla description')}</p>
      <div class="row"><span class="chip">👥 ${g.members}</span><span class="chip">🎯 ${g.daily_goal_minutes} min/nhar</span>${Number(g.running_challenges) ? `<span class="chip warm">⚔️ ${g.running_challenges} tahaddi</span>` : ''}${Number(g.is_public) ? '' : '<span class="chip">🔒 Privée</span>'}</div>
    </div>`).join('') : '<div class="card empty">Mazelt fi 7atta jme3a. A3mel wa7da walla od5ol b code.</div>';

  const scope = $('#lb-scope');
  const selected = scope.value;
  scope.innerHTML = '<option value="0">🇹🇳 Tounes lkol</option>' + groups.map((g) => `<option value="${g.id}">👥 ${esc(g.name)}</option>`).join('');
  if ([...scope.options].some((o) => o.value === selected)) scope.value = selected;

  const chGroup = $('#challenge-create [name=group_id]');
  chGroup.innerHTML = groups.length ? groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('') : '<option value="">— A3mel jme3a 9bal —</option>';
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
  $('#challenge-list').innerHTML = challenges.length ? challenges.map(challengeCard).join('')
    : '<div class="card empty">Mafammech tahadiyet. Ebda wa7ed m3a s7abek 👉</div>';
}

function setupChallenges() {
  $('#challenge-create .challenge-fields').innerHTML = challengeFields();
  bindChallengeForm($('#challenge-create'), () => loadChallenges().catch(() => {}));

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
  const groupId = Number($('#lb-scope').value);
  const wilayaSel = $('#lb-wilaya');
  wilayaSel.disabled = groupId > 0;
  const r = await API.call('leaderboard', 'get', { period: state.lbPeriod, group_id: groupId, wilaya: groupId > 0 ? '' : wilayaSel.value });
  const medals = ['🥇', '🥈', '🥉'];
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

// ---------- Salat privées ----------
const THEME_ART = { pink: ['pink', '🌸'], library: ['library', '📚'], cafe: ['cafe', '☕'], forest: ['forest', '🌲'] };

function renderPrivateRooms(rooms) {
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
            <button class="btn sm ghost" data-copy="${esc(r.code)}">📋 Code</button>
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
    const copy = e.target.closest('[data-copy]');
    const leave = e.target.closest('[data-proom-leave]');
    if (copy) navigator.clipboard?.writeText(copy.dataset.copy).then(() => toast('📋 L\'code tcopia!', 'good'), () => toast(copy.dataset.copy, 'info'));
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
function showTab(name) {
  if (!$(`[data-panel="${name}"]`)) name = 'focus';
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  if (name === 'profile' && draftLook) renderPersoEditor();
  const loaders = { leaderboard: loadLeaderboard, shop: loadShop, groups: loadGroups, quests: loadTasks, missions: loadMissions, challenges: loadChallenges, rooms: loadPrivateRooms };
  loaders[name]?.().catch((e) => toast(e.message, 'bad'));
}

function setupTabs() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) location.hash = b.dataset.tab;
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1) || 'focus');
}

// ---------- Boot ----------
(async function init() {
  let me;
  try {
    me = await API.call('auth', 'me');
  } catch (e) {
    $('#player-bar').innerHTML = `<span class="form-error">${esc(e.message)}</span>`;
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

  state.timer = new FocusTimer($('#focus-timer'), {
    onResult: (r) => {
      if (r.profile) setProfile(r.profile); else refreshProfile();
      loadHistory().catch(() => {});
    },
  });

  renderRooms();
  await loadGroups().catch((e) => toast(e.message, 'bad'));
  setupTabs();
  loadHistory().catch((e) => toast(e.message, 'bad'));
})();
