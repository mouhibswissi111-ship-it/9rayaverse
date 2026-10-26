// Study tools on the dashboard: Bac countdown + programme checklist, weekly auto-challenge,
// flashcards (Leitner review + quiz). Uses state / setProfile from app.js.
'use strict';

const study = { bac: null, weekly: null, decks: null, deck: null, cards: [] };

function daysUntil(date) {
  return Math.ceil((new Date(date + 'T08:00:00') - Date.now()) / 86400000);
}

// ---------- Bac ----------
function bacProgress(items) {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

function renderBacMini() {
  const b = study.bac;
  const el = $('#bac-mini');
  if (!b || !el) return;
  const days = b.bac_date ? daysUntil(b.bac_date) : null;
  const p = bacProgress(b.items);
  const exam = BAC_SECTIONS[b.section]?.exam || 'imti7an';
  el.hidden = days !== null && days < -7;
  el.innerHTML = `
    <div class="row spread">
      <div><div class="bac-mini-days">${days === null ? '📅' : days > 0 ? days : '🎉'}<small>${days > 0 ? ' nhar' : ''}</small></div>
        <div class="hint">${days === null ? '7ott date l\'imti7an mte3ek' : days > 0 ? `ba9i lel ${esc(exam)} 🎓` : 'Wsel l\'imti7an! Rabbi ynajj7ek 🤲'}</div></div>
      <button class="btn sm primary" data-tab="bac">${b.section ? `📋 ${p.pct}% mel programme` : '🎓 Ekhtar niveau'}</button>
    </div>`;
}

function renderBac() {
  const b = study.bac;
  if (!b) return;
  const days = b.bac_date ? daysUntil(b.bac_date) : 0;
  const p = bacProgress(b.items);
  const goal = b.weekly_goal_hours * 3600;
  const weeks = Math.max(0, Math.floor(days / 7));
  const sec = BAC_SECTIONS[b.section];
  const exam = sec?.exam || 'imti7an';

  $('#bac-hero').innerHTML = `
    <div class="bac-hero-in">
      <div class="bac-count">
        <b>${days > 0 ? days : b.bac_date ? 0 : '?'}</b><span>nhar ba9i lel ${esc(exam)}</span>
        <small>📅 <input type="date" class="input bac-date" id="bac-date" value="${esc(b.bac_date)}"> ${days > 0 ? ` · ${weeks} jem3a` : ''}</small>
      </div>
      <div class="bac-hero-stats">
        <div><b>${p.pct}%</b><span>mel programme (${p.done}/${p.total})</span><div class="bar goal"><i style="width:${p.pct}%"></i></div></div>
        <div><b>${fmtDuration(b.week_seconds)}</b><span>hal jom3a / ${b.weekly_goal_hours}h</span><div class="bar xp"><i style="width:${pct(b.week_seconds, goal)}%"></i></div></div>
      </div>
      <div class="row">
        ${sec ? `<span class="chip">${sec.emoji} ${esc(sec.name)}</span>` : '<span class="chip warm">👇 Ekhtar l\'section mte3ek</span>'}
        ${days > 0 && p.total ? `<span class="chip gold">💡 ${Math.max(1, Math.ceil((p.total - p.done) / Math.max(1, weeks)))} chapitres fel jom3a bech tkammel</span>` : ''}
      </div>
      <p class="hint" style="margin:8px 0 0">📌 Baddel l'date ken t7eb. ${exam === 'bac' && !b.own_date ? 'Date l\'bac ta9ribiya (l\'admin ybaddelha ki tetla3 l\'rasmiya).' : ''}</p>
    </div>`;

  $('#bac-sections').innerHTML = SECTION_GROUPS.map((g) => `<div class="bac-group">${esc(g)}</div>` + Object.entries(BAC_SECTIONS).filter(([, s]) => s.group === g).map(([k, s]) =>
    `<button class="${b.section === k ? 'active' : ''}" data-section="${k}"><span>${s.emoji}</span>${esc(s.name)}</button>`).join('')).join('');

  $('#bac-goal').innerHTML = `
    <div class="row" style="flex-wrap:nowrap">
      <input class="input" id="bac-goal-hours" type="number" min="1" max="80" value="${b.weekly_goal_hours}" style="width:90px"> <span>sa3a fel jom3a</span>
      <button class="btn sm" id="bac-goal-save">Sajjel</button>
    </div>
    <p class="hint mt">${b.week_seconds >= goal ? '✅ Wselt lel objectif hal jom3a, bravo!' : `Ba9i ${fmtDuration(goal - b.week_seconds)} hal jom3a.`}</p>`;

  $('#bac-done-chip').textContent = `${p.done}/${p.total}`;
  const subjects = [...new Set(b.items.map((i) => i.subject))];
  $('#bac-subjects').innerHTML = [...new Set([...subjects, ...(sec ? sec.subjects : [])])].map((s) => `<option value="${esc(s)}">`).join('');
  $('#bac-plan').innerHTML = subjects.length ? subjects.map((s) => {
    const list = b.items.filter((i) => i.subject === s);
    const sp = bacProgress(list);
    return `
      <details class="bac-subject" ${sp.done < sp.total ? 'open' : ''}>
        <summary><b>${esc(s)}</b><span class="hint">${sp.done}/${sp.total}</span><div class="bar goal"><i style="width:${sp.pct}%"></i></div></summary>
        ${list.map((i) => `
          <div class="bac-item ${i.done ? 'done' : ''}">
            <button class="check ${i.done ? 'on' : ''}" data-plan-toggle="${i.id}" title="Kammelt">✓</button>
            <span class="grow">${esc(i.title)}</span>
            <button class="btn ghost sm" data-plan-del="${i.id}" title="Na77i">✕</button>
          </div>`).join('')}
      </details>`;
  }).join('') : `<div class="empty">${b.section ? 'Zid les modules w les chapitres mte3ek 👉' : 'Ekhtar l\'niveau mte3ek 👉 w nwajdoulek programme.'}</div>`;
  renderBacMini();
}

async function loadBac() {
  study.bac = await API.call('bac', 'get');
  renderBac();
}

function setupBac() {
  $('#bac-hero').addEventListener('change', async (e) => {
    if (e.target.id !== 'bac-date') return;
    try {
      const r = await API.call('bac', 'exam_date', { date: e.target.value });
      study.bac = r;
      renderBac();
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#bac-sections').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-section]');
    if (!b) return;
    const key = b.dataset.section;
    const replace = !study.bac.items.length || confirm(`Nwajdoulek programme "${BAC_SECTIONS[key].name}"? L'programme l'9dim yetfasse5.`);
    try {
      const r = await API.call('bac', 'set_section', replace ? { section: key, items: bacTemplate(key) } : { section: key });
      study.bac = r;
      renderBac();
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#bac-plan').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-plan-toggle]');
    const d = e.target.closest('[data-plan-del]');
    try {
      if (t) {
        const r = await API.call('bac', 'toggle', { id: Number(t.dataset.planToggle) });
        study.bac = r;
        renderBac();
        showEvents(r.events);
        if (r.profile) setProfile(r.profile);
        loadWeekly().catch(() => {});
      } else if (d && confirm('Tna77i l\'chapitre hedha?')) {
        study.bac = await API.call('bac', 'delete', { id: Number(d.dataset.planDel) });
        renderBac();
      }
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#bac-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      study.bac = await API.call('bac', 'add', Object.fromEntries(new FormData(e.target)));
      renderBac();
      e.target.title.value = '';
      toast('➕ Tzad!', 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#bac-goal').addEventListener('click', async (e) => {
    if (e.target.id !== 'bac-goal-save') return;
    try {
      const r = await API.call('bac', 'goal', { hours: Number($('#bac-goal-hours').value) });
      study.bac = r;
      renderBac();
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Weekly auto-challenge ----------
function renderWeekly() {
  const w = study.weekly;
  if (!w) return;
  const done = w.progress >= w.target;
  $('#weekly-card').innerHTML = `
    <div class="row spread" style="align-items:flex-start">
      <div>
        <div class="weekly-k">⚔️ Tahaddi l'jom3a · lel kol</div>
        <h2 style="margin:4px 0 2px">${esc(w.emoji)} ${esc(w.title)}</h2>
        <span class="hint">Ba9i ${fmtLeft(w.ends_in)} · ${w.winners} kammlouh</span>
      </div>
      <span class="chip gold">🎁 +${w.xp} XP · +${w.gold} 💰</span>
    </div>
    <div class="bar-label mt"><span>${Math.min(w.progress, w.target)} / ${w.target}</span><span>${Math.floor(pct(w.progress, w.target))}%</span></div>
    <div class="bar goal"><i style="width:${pct(w.progress, w.target)}%"></i></div>
    ${w.claimed ? '<p class="hint mt">✅ Rba7tou! Tahaddi jdid nhar l\'ethnin.</p>'
      : done ? '<button class="btn warm big mt" id="weekly-claim">🏆 Ekhou l\'ghnima</button>' : ''}`;
}

async function loadWeekly() {
  study.weekly = (await API.call('weekly', 'get')).weekly;
  renderWeekly();
}

function setupWeekly() {
  $('#weekly-card').addEventListener('click', async (e) => {
    if (e.target.id !== 'weekly-claim') return;
    try {
      const r = await API.call('weekly', 'claim');
      study.weekly = r.weekly;
      renderWeekly();
      showEvents(r.events);
      setProfile(r.profile);
      celebrate('🏆', 'Rba7t tahaddi l\'jom3a!', `+${r.weekly.xp} XP w +${r.weekly.gold} flous. Partagi l'5bar m3a s7abek!`);
    } catch (err) { toast(err.message, 'bad'); }
  });
}

// ---------- Flashcards ----------
/** Only the big moments: one toast per card would be too noisy. */
function showCardEvents(events = []) {
  showEvents(events.filter((e) => e.type === 'level_up' || e.type === 'monster_defeated'));
}

function renderDecks(r) {
  study.decks = r;
  $('#cards-today').textContent = `🃏 ${r.today_cards} lyoum`;
  const groupOptions = (sel) => ['<option value="0">🔒 Privé</option>']
    .concat(state.groups.map((g) => `<option value="${g.id}" ${sel === g.id ? 'selected' : ''}>🤝 ${esc(g.name)}</option>`)).join('');
  $('#deck-list').innerHTML = r.decks.length ? r.decks.map((d) => `
    <div class="deck">
      <div class="deck-top"><b>${esc(d.title)}</b><span class="hint">${d.cards} carta · ${d.learned} 7fadhtha</span></div>
      <div class="bar goal"><i style="width:${pct(d.learned, d.cards)}%"></i></div>
      <div class="row" style="gap:6px">
        <button class="btn sm primary" data-review="${d.id}" ${d.cards ? '' : 'disabled'}>▶ Raja3${d.due ? ` (${d.due})` : ''}</button>
        <button class="btn sm" data-quiz="${d.id}" ${d.cards >= 4 ? '' : 'disabled title="Lezem 4 cartes 3al a9al"'}>🎯 Quiz</button>
        <button class="btn sm ghost" data-deck-open="${d.id}">✏️ Cartes</button>
      </div>
      <div class="row" style="gap:6px">
        <select class="input" data-deck-share="${d.id}" style="width:auto;padding:4px 8px;font-size:12px">${groupOptions(d.group_id)}</select>
        <button class="btn sm ghost" data-deck-del="${d.id}" title="Fasse5">🗑️</button>
      </div>
    </div>`).join('') : '<div class="empty">Mazelt ma 3malt 7atta paquet. A3mel wa7ed 👉</div>';
  $('#deck-shared').innerHTML = r.shared.length ? r.shared.map((d) => `
    <div class="list-item">
      <span style="font-size:24px">🃏</span>
      <div class="grow"><div class="title">${esc(d.title)}</div><div class="sub">${esc(d.owner)} · ${esc(d.group_name)} · ${d.cards} carta</div></div>
      <button class="btn sm primary" data-deck-clone="${d.id}">📥 Zidou</button>
    </div>`).join('') : '<div class="empty">S7abek mazelou ma partagew 7atta paquet.</div>';
}

async function loadDecks() {
  renderDecks(await API.call('decks', 'list'));
}

async function openDeck(id) {
  const r = await API.call('decks', 'cards', { deck_id: id });
  study.deck = r.deck;
  study.cards = r.cards;
  $('#deck-home').hidden = true;
  $('#deck-detail').hidden = false;
  renderDeckDetail();
}

function closeDeck() {
  study.deck = null;
  $('#deck-home').hidden = false;
  $('#deck-detail').hidden = true;
  loadDecks().catch(() => {});
}

function renderDeckDetail() {
  const d = study.deck;
  const boxes = ['', '🔴', '🟠', '🟡', '🟢', '⭐'];
  $('#deck-detail').innerHTML = `
    <div class="card">
      <div class="row spread">
        <button class="btn ghost sm" data-deck-back>← Arja3</button>
        <div class="row"><button class="btn sm primary" data-review="${d.id}" ${study.cards.length ? '' : 'disabled'}>▶ Raja3</button>
        <button class="btn sm" data-quiz="${d.id}" ${study.cards.length >= 4 ? '' : 'disabled'}>🎯 Quiz</button></div>
      </div>
      <h2 class="mt" style="font-size:1.3rem">🃏 ${esc(d.title)}</h2>
      <form id="card-add" class="card-form">
        <label class="field"><span>So2el (wajh)</span><textarea class="input" name="front" maxlength="300" rows="2" required placeholder="mathalan: Chnowa l'unité mta3 l'force?"></textarea></label>
        <label class="field"><span>Jweb (dhahr)</span><textarea class="input" name="back" maxlength="300" rows="2" required placeholder="mathalan: Newton (N)"></textarea></label>
        <button class="btn primary" type="submit">➕ Zid l'carta</button>
      </form>
      <p class="hint">🔴 jdida · 🟠🟡 9a3ed tet3allem · 🟢⭐ 7fadhtha</p>
      <div class="list">${study.cards.map((c) => `
        <div class="list-item">
          <span title="Box ${c.box}">${boxes[c.box]}</span>
          <div class="grow"><div class="title">${esc(c.front)}</div><div class="sub">${esc(c.back)}</div></div>
          <button class="btn ghost sm" data-card-edit="${c.id}">✏️</button>
          <button class="btn ghost sm" data-card-del="${c.id}">🗑️</button>
        </div>`).join('') || '<div class="empty">Paquet ferigh. Zid awel carta lfou9!</div>'}</div>
    </div>`;
}

// Review (flip cards) and quiz (4 choices) share one full-screen player.
async function startPlayer(deckId, mode) {
  let cards = (await API.call('decks', 'cards', { deck_id: deckId })).cards;
  const all = cards;
  if (mode === 'review') {
    const due = cards.filter((c) => c.due);
    if (due.length) cards = due;
    else if (!confirm('Kol l\'cartes mraj3in lyoum 👏 T7eb traja3hom lkol zeda?')) return;
  }
  cards = cards.sort(() => Math.random() - 0.5).slice(0, 30);
  let i = 0;
  let right = 0;
  const back = document.createElement('div');
  back.className = 'player-back';
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  const close = () => { back.remove(); document.body.style.overflow = ''; if (study.deck) openDeck(study.deck.id).catch(() => {}); else loadDecks().catch(() => {}); loadWeekly().catch(() => {}); };

  const grade = async (ok) => {
    if (ok) right++;
    try {
      const r = await API.call('decks', 'grade', { deck_id: deckId, card_id: cards[i].id, ok });
      showCardEvents(r.events);
    } catch (err) { toast(err.message, 'bad'); }
    i++;
    show();
  };

  const show = () => {
    if (i >= cards.length) {
      const score = Math.round((right / cards.length) * 100);
      back.innerHTML = `<div class="player"><div class="big-emoji">${score >= 80 ? '🏆' : score >= 50 ? '💪' : '📚'}</div>
        <h2 style="justify-content:center">${right} / ${cards.length} s7a7</h2>
        <p class="muted">${score >= 80 ? 'Ya3tik sa77a! Mokhek yekhdem 🔥' : score >= 50 ? 'Behi! 3awed ghodwa w tetla3.' : 'Ma 3lich, l\'cartes elli ghlat fihom yarj3oulek ghodwa.'}</p>
        <button class="btn primary big" data-p-close>Behi 👍</button></div>`;
      return;
    }
    const c = cards[i];
    const head = `<div class="player-top"><span>${mode === 'quiz' ? '🎯 Quiz' : '🃏 Mraj3a'} · ${i + 1}/${cards.length}</span><button class="btn ghost sm" data-p-close>✕</button></div>
      <div class="bar goal"><i style="width:${pct(i, cards.length)}%"></i></div>`;
    if (mode === 'quiz') {
      const wrong = all.filter((x) => x.id !== c.id && x.back !== c.back).sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [c, ...wrong].sort(() => Math.random() - 0.5);
      back.innerHTML = `<div class="player">${head}<div class="flash"><div class="flash-face">${esc(c.front)}</div></div>
        <div class="quiz-opts">${options.map((o) => `<button class="btn" data-opt="${o.id === c.id ? 1 : 0}">${esc(o.back)}</button>`).join('')}</div></div>`;
    } else {
      back.innerHTML = `<div class="player">${head}
        <button class="flash" data-flip><div class="flash-face">${esc(c.front)}</div><div class="flash-hint">👆 Enzel bech tchouf l'jweb</div></button>
        <div class="player-acts" hidden><button class="btn danger big" data-grade="0">❌ Ma 3raftech</button><button class="btn primary big" data-grade="1">✅ 3raftha</button></div></div>`;
    }
  };

  back.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.pClose !== undefined) return close();
    if (t.dataset.flip !== undefined) {
      t.classList.add('flipped');
      $('.flash-face', t).textContent = cards[i].back;
      $('.flash-hint', t).textContent = cards[i].front;
      $('.player-acts', back).hidden = false;
    } else if (t.dataset.grade !== undefined) {
      grade(t.dataset.grade === '1');
    } else if (t.dataset.opt !== undefined) {
      const ok = t.dataset.opt === '1';
      $$('[data-opt]', back).forEach((b) => { b.disabled = true; b.classList.add(b.dataset.opt === '1' ? 'right' : 'wrong-dim'); });
      if (!ok) t.classList.add('wrong');
      setTimeout(() => grade(ok), ok ? 600 : 1300);
    }
  });
  show();
}

function setupDecks() {
  $('#deck-create').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await API.call('decks', 'create', { title: e.target.title.value });
      renderDecks(r);
      e.target.reset();
      toast(r.message, 'good');
      openDeck(r.deck_id);
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('[data-panel="cards"]').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const d = t.dataset;
    try {
      if (d.review) startPlayer(Number(d.review), 'review');
      else if (d.quiz) startPlayer(Number(d.quiz), 'quiz');
      else if (d.deckOpen) openDeck(Number(d.deckOpen));
      else if (d.deckBack !== undefined) closeDeck();
      else if (d.deckClone) { const r = await API.call('decks', 'clone', { deck_id: Number(d.deckClone) }); renderDecks(r); toast(r.message, 'good'); }
      else if (d.deckDel) {
        if (!confirm('Tfasse5 l\'paquet hedha w l\'cartes lkol?')) return;
        renderDecks(await API.call('decks', 'delete', { deck_id: Number(d.deckDel) }));
      } else if (d.cardDel) {
        study.cards = (await API.call('decks', 'delete_card', { deck_id: study.deck.id, card_id: Number(d.cardDel) })).cards;
        renderDeckDetail();
      } else if (d.cardEdit) {
        const c = study.cards.find((x) => x.id === Number(d.cardEdit));
        const front = prompt('So2el:', c.front);
        if (front === null) return;
        const backTxt = prompt('Jweb:', c.back);
        if (backTxt === null) return;
        study.cards = (await API.call('decks', 'edit_card', { deck_id: study.deck.id, card_id: c.id, front, back: backTxt })).cards;
        renderDeckDetail();
      }
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('[data-panel="cards"]').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-deck-share]');
    if (!sel) return;
    try {
      const r = await API.call('decks', 'share', { deck_id: Number(sel.dataset.deckShare), group_id: Number(sel.value) });
      renderDecks(r);
      toast(r.message, 'good');
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('#deck-detail').addEventListener('submit', async (e) => {
    if (e.target.id !== 'card-add') return;
    e.preventDefault();
    const f = e.target;
    try {
      study.cards = (await API.call('decks', 'add_card', { deck_id: study.deck.id, front: f.front.value, back: f.back.value })).cards;
      renderDeckDetail();
      $('#card-add [name=front]').focus();
    } catch (err) { toast(err.message, 'bad'); }
  });
}
