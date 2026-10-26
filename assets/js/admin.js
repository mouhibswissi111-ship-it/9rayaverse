// Lou7at l'Admin général: stats, users (ban / admin / delete), groups, uploaded courses, announcement.
'use strict';

let me = null;

async function loadStats() {
  const { stats: s, announcement, bac_date: bacDate } = await API.call('admin', 'stats');
  $('#bacdate-form').date.value = bacDate || '';
  const box = (v, label) => `<div class="stat-box card"><b>${v}</b><span>${label}</span></div>`;
  $('#stats').innerHTML = [
    box(s.users, 'Utilisateurs lkol'),
    box(s.new_today, 'Jdod lyoum'),
    box(s.active_today, '9raw lyoum'),
    box(`<span class="live-dot"></span> ${s.studying_now}`, 'Ya9raw tawa'),
    box(fmtDuration(s.seconds_today), 'Wa9t 9raya lyoum'),
    box(fmtDuration(s.seconds_total), 'Wa9t 9raya lkol'),
    box(s.groups, 'Jme3at'),
    box(s.challenges_running, 'Tahadiyet ma7loulin'),
    box(s.missions, 'Missions / cours'),
    box(`${s.storage_mb} Mo`, 'Blasa mta3 les PDFs'),
    box(s.banned, 'Mbloquyin'),
  ].join('');
  $('#announce-form').text.value = announcement;
}

async function loadUsers() {
  const { users } = await API.call('admin', 'users', { q: $('#user-q').value.trim() });
  $('#users').innerHTML = `
    <tr><th>#</th><th>Utilisateur</th><th>Email</th><th>Wileya</th><th>Nv</th><th class="time">Wa9t lkol</th><th>Actions</th></tr>
    ${users.map((u) => `
      <tr>
        <td class="rank">${u.id}</td>
        <td><div class="who">${avatarHTML(u.avatar_color, u.hat, 'sm', u.photo)} ${esc(u.username)}
          ${u.role === 'admin' ? '<span class="chip gold">Admin</span>' : ''}${Number(u.banned) ? '<span class="chip bad">Mbloqui</span>' : ''}</div></td>
        <td class="hint">${esc(u.email)}</td>
        <td class="hint">${esc(u.wilaya || '—')}</td>
        <td>${u.level}</td>
        <td class="time">${fmtDuration(u.total_seconds)}</td>
        <td><div class="row">
          ${u.id === me.id ? '<span class="hint">Enti 🙂</span>' : `
            ${Number(u.banned) ? `<button class="btn sm" data-op="unban" data-id="${u.id}">✅ Debloqui</button>` : `<button class="btn sm danger" data-op="ban" data-id="${u.id}">⛔ Bloqui</button>`}
            ${u.role === 'admin' ? `<button class="btn sm ghost" data-op="remove_admin" data-id="${u.id}">Na77i admin</button>` : `<button class="btn sm ghost" data-op="make_admin" data-id="${u.id}">🛠️ Rodou admin</button>`}
            <button class="btn sm ghost" data-op="reset_hp" data-id="${u.id}">❤️ Sa77a</button>
            <button class="btn sm danger" data-op="delete" data-id="${u.id}" data-name="${esc(u.username)}">🗑️</button>`}
        </div></td>
      </tr>`).join('')}`;
}

async function loadGroups() {
  const { groups } = await API.call('admin', 'groups');
  $('#groups').innerHTML = groups.length ? `
    <tr><th>#</th><th>Esm</th><th>Mol l'jme3a</th><th>A3dha</th><th>Code</th><th>Type</th><th></th></tr>
    ${groups.map((g) => `
      <tr><td class="rank">${g.id}</td><td><b>${esc(g.name)}</b></td><td>${esc(g.owner)}</td><td>${g.members}</td>
        <td><span class="code">${esc(g.invite_code)}</span></td><td>${Number(g.is_public) ? 'Publique' : 'Privée'}</td>
        <td><button class="btn sm danger" data-del-group="${g.id}" data-name="${esc(g.name)}">🗑️ Fasse5</button></td></tr>`).join('')}`
    : '<tr><td class="empty">Mafammech jme3at.</td></tr>';
}

async function loadMissions() {
  const { missions } = await API.call('admin', 'missions');
  $('#missions').innerHTML = missions.length ? `
    <tr><th>#</th><th>Cours</th><th>Mte3</th><th>Partagi m3a</th><th>Taille</th><th>Date</th><th></th></tr>
    ${missions.map((m) => `
      <tr><td class="rank">${m.id}</td><td><b>${esc(m.title)}</b><div class="hint">${esc(m.original_name)}</div></td><td>${esc(m.owner)}</td>
        <td>${esc(m.group_name || '—')}</td><td>${fmtSize(m.size)}</td><td class="hint">${esc(m.created_at)}</td>
        <td><div class="row"><button class="btn sm" data-view="${m.id}" data-title="${esc(m.title)}">📖</button>
        <button class="btn sm danger" data-del-mission="${m.id}">🗑️</button></div></td></tr>`).join('')}`
    : '<tr><td class="empty">7atta cours mazel.</td></tr>';
}

const LOADERS = { stats: loadStats, users: loadUsers, groups: loadGroups, missions: loadMissions, announce: loadStats };

function showTab(name) {
  if (!LOADERS[name]) name = 'stats';
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  LOADERS[name]().catch((e) => toast(e.message, 'bad'));
}

const OP_CONFIRM = {
  ban: 'Tbloqui l\'utilisateur hedha?',
  delete: 'Tfasse5 l\'compte {name} w kol chay mte3ou? Ma fammech rjou3!',
  make_admin: 'Tradd l\'utilisateur hedha admin?',
  remove_admin: 'Tna77ilou l\'admin?',
};

(async function init() {
  try {
    me = (await API.call('auth', 'me')).user;
  } catch (e) {
    return toast(e.message, 'bad');
  }
  if (me.role !== 'admin') {
    $$('.tab-panel').forEach((p) => { p.hidden = true; });
    $('#denied').hidden = false;
    $('#denied').innerHTML = '<h2>⛔ Ma 3andekch l\'7a9</h2><p class="muted">L\'page hedhi lel Admin général bark.</p><a class="btn primary" href="app.html">Arja3</a>';
    return;
  }

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) location.hash = b.dataset.tab;
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1) || 'stats');

  let searchTimer;
  $('#user-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadUsers().catch((e) => toast(e.message, 'bad')), 300); });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-op],[data-del-group],[data-del-mission],[data-view]');
    if (!b) return;
    try {
      if (b.dataset.op) {
        const q = OP_CONFIRM[b.dataset.op];
        if (q && !confirm(q.replace('{name}', b.dataset.name || ''))) return;
        toast((await API.call('admin', 'user_action', { id: Number(b.dataset.id), op: b.dataset.op })).message, 'good');
        loadUsers();
      } else if (b.dataset.delGroup) {
        if (!confirm(`Tfasse5 l'jme3a "${b.dataset.name}"?`)) return;
        toast((await API.call('admin', 'delete_group', { id: Number(b.dataset.delGroup) })).message, 'good');
        loadGroups();
      } else if (b.dataset.delMission) {
        if (!confirm('Tfasse5 l\'cours hedha?')) return;
        toast((await API.call('admin', 'delete_mission', { id: Number(b.dataset.delMission) })).message, 'good');
        loadMissions();
      } else if (b.dataset.view) {
        openPdf(`api/file.php?type=mission&id=${b.dataset.view}`, b.dataset.title);
      }
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('#announce-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      toast((await API.call('admin', 'announcement', { text: e.target.text.value })).message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#bacdate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      toast((await API.call('admin', 'bac_date', { date: e.target.date.value })).message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
})();
