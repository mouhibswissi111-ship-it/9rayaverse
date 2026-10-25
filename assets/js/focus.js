// FocusTimer: the personal study session widget (time tracking + strict "sarem" mode + PDF missions).
// Used on the dashboard and inside virtual rooms.
'use strict';

const STRICT_LEAVE_LIMIT_MS = 10000; // leave the tab longer than this in strict mode → fail
const PING_INTERVAL_MS = 20000;      // heartbeat so the server knows you are still here
const RING_C = 2 * Math.PI * 90;

class FocusTimer {
  /**
   * @param {HTMLElement} root
   * @param {{compact?: boolean, onState?: Function, onResult?: Function}} opts
   *   onState({state:'focus'|'idle', remaining, subject}) — fired on start/stop (rooms broadcast it)
   *   onResult(response) — fired after finish/fail with the server response (contains .profile)
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.compact = !!opts.compact;
    this.onState = opts.onState || (() => {});
    this.onResult = opts.onResult || (() => {});
    this.session = null;
    this.missions = [];
    this.selectedMission = 0;
    this.endAt = 0;
    this.busy = false;
    this.hiddenAt = null;
    this.hideTimer = null;
    this.baseTitle = document.title;
    this.root.classList.toggle('compact', this.compact);

    document.addEventListener('visibilitychange', () => this.onVisibility());
    this.renderSetup();
    this.resume();
  }

  get running() {
    return !!this.session;
  }

  remaining() {
    return Math.max(0, (this.endAt - Date.now()) / 1000);
  }

  /** Reloads the mission list in the setup form (call after missions change). */
  async loadMissions() {
    try {
      const r = await API.call('missions', 'list');
      this.missions = r.missions.filter((m) => m.status === 'active');
    } catch { this.missions = []; }
    if (!this.session) this.renderSetup();
  }

  /** Preselects a mission (from the Missions tab "Ebda 9raya" button). */
  useMission(id) {
    this.selectedMission = id;
    if (!this.session) this.renderSetup();
    this.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- server calls ----------
  async resume() {
    try {
      const r = await API.call('focus', 'active');
      if (r.failed) {
        showEvents(r.events);
        toast(`🔒 Session sarma fechlet: ${r.reason}`, 'bad', 7000);
        this.onResult(r);
      } else if (r.session) {
        this.begin(r.session);
        toast('⏱️ Rja3na lel session elli kenet ma7loula.', 'info');
      }
    } catch (e) {
      toast(e.message, 'bad');
    }
    this.loadMissions();
  }

  async start(subject, minutes, strict, missionId = 0) {
    if (this.busy || this.session) return toast('3andek deja session ma7loula.', 'info');
    this.busy = true;
    try {
      const r = await API.call('focus', 'start', { subject, minutes, strict, mission_id: missionId });
      if (r.events?.length) showEvents(r.events);
      this.begin(r.session);
      toast(strict ? '🔒 Mode sarem bda. Ma tokhrejch mel page!' : '🌿 Yallah! Bda l\'9raya. Rabbi m3ak!', 'good');
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      this.busy = false;
    }
  }

  async finish() {
    if (this.busy || !this.session) return;
    this.busy = true;
    try {
      const r = await API.call('focus', 'finish', { id: this.session.id });
      this.end();
      if (r.failed) {
        toast(`Session fechlet: ${r.reason}`, 'bad', 6000);
      } else if (r.result.status === 'abandoned') {
        toast('Session wfet. A9al men d9i9a, ma tsajjel chay.', 'info');
      } else {
        const res = r.result;
        toast(`${res.status === 'completed' ? '✅ Mabrouk! Kammelt l\'session!' : '💾 Tsajjel l\'wa9t elli 9rit.'} ${res.minutes} min · +${res.xp} XP · +${res.gold} flous`, 'good', 6000);
      }
      showEvents(r.events);
      this.onResult(r);
      this.loadMissions();
    } catch (e) {
      this.retryAt = Date.now() + 5000; // the timer tick retries finishing after a pause
      toast(e.message, 'bad');
      this.ping(); // clears the local timer if the server no longer has this session
    } finally {
      this.busy = false;
    }
  }

  async fail(reason) {
    if (this.busy || !this.session) return;
    this.busy = true;
    try {
      const r = await API.call('focus', 'fail', { reason });
      this.end();
      showEvents(r.events);
      toast(`🔒 Session sarma fechlet: ${reason}`, 'bad', 7000);
      this.onResult(r);
    } catch (e) {
      toast(e.message, 'bad');
    } finally {
      this.busy = false;
    }
  }

  async ping() {
    if (!this.session) return;
    try {
      const r = await API.call('focus', 'ping');
      if (r.failed) {
        this.end();
        showEvents(r.events);
        toast(`🔒 Session sarma fechlet: ${r.reason}`, 'bad', 7000);
        this.onResult(r);
      } else if (!r.session) {
        this.end(); // finished or replaced elsewhere (e.g. another tab)
      }
    } catch { /* temporary network issue: next ping will retry */ }
  }

  // ---------- local state ----------
  begin(session) {
    this.session = session;
    this.endAt = Date.now() + session.remaining * 1000;
    this.renderRunning();
    clearInterval(this.tickTimer);
    clearInterval(this.pingTimer);
    this.tickTimer = setInterval(() => this.tick(), 250);
    this.pingTimer = setInterval(() => this.ping(), PING_INTERVAL_MS);
    this.tick();
    this.onState({ state: 'focus', remaining: session.remaining, subject: session.subject });
  }

  end() {
    clearInterval(this.tickTimer);
    clearInterval(this.pingTimer);
    clearTimeout(this.hideTimer);
    this.session = null;
    document.title = this.baseTitle;
    this.renderSetup();
    this.onState({ state: 'idle' });
  }

  tick() {
    if (!this.session) return;
    const left = this.remaining();
    const total = this.session.planned_minutes * 60;
    const time = $('.ft-time', this.root);
    const ring = $('.ring-fg', this.root);
    if (time) time.textContent = fmtClock(left);
    if (ring) ring.style.strokeDashoffset = String(RING_C * (1 - left / total));
    const pdfTimer = $('#pdf-timer');
    if (pdfTimer) pdfTimer.textContent = `⏱️ ${fmtClock(left)}${this.session.strict ? ' · 🔒 sarem' : ''}`;
    document.title = `${fmtClock(left)} · ${this.session.subject} · 9rayaverse`;
    if (left <= 0 && Date.now() >= (this.retryAt || 0)) this.finish();
  }

  onVisibility() {
    if (!this.session || !this.session.strict) return;
    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.hideTimer = setTimeout(() => this.fail('Khrajt mel page akther men 10 swani.'), STRICT_LEAVE_LIMIT_MS);
    } else {
      clearTimeout(this.hideTimer);
      if (this.hiddenAt && Date.now() - this.hiddenAt > STRICT_LEAVE_LIMIT_MS) {
        this.fail('Khrajt mel page akther men 10 swani.');
      } else if (this.hiddenAt) {
        toast('👀 Behi ja3altha! Fel mode sarem ab9a fel page.', 'bad');
      }
      this.hiddenAt = null;
    }
  }

  // ---------- rendering ----------
  renderSetup() {
    const last = store.get('focus', { subject: '', minutes: 25, strict: false });
    const selected = this.missions.some((m) => m.id === this.selectedMission) ? this.selectedMission : 0;
    this.root.innerHTML = `
      <label class="field"><span>📚 Mission (cours PDF)</span>
        <select class="input ft-mission">
          <option value="0">— Bla mission —</option>
          ${this.missions.map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.title)} (${Math.floor(pct(m.progress_seconds, m.target_minutes * 60))}%)</option>`).join('')}
        </select>
      </label>
      <label class="field"><span>Chnowa bech ta9ra?</span>
        <input class="input ft-subject" maxlength="60" placeholder="mathalan: Analyse chapitre 3" value="${esc(last.subject)}">
      </label>
      <div class="ft-presets">
        ${[15, 25, 45, 60, 90].map((m) => `<button class="btn sm ${m === last.minutes ? 'active' : ''}" data-min="${m}">${m} min</button>`).join('')}
      </div>
      <div class="ft-custom">Wa9t e5er: <input class="input ft-min" type="number" min="1" max="180" value="${Number(last.minutes) || 25}"> d9aye9</div>
      <div class="ft-strict-box">
        <label class="switch"><input type="checkbox" class="ft-strict" ${last.strict ? 'checked' : ''}> 🔒 Mode Sarem (tahaddi Flip)</label>
        <p class="hint">XP ×1.5 w flous zeyda. Ama ken tokhrej mel page akther men 10 swani, walla tsakkarha, walla to9ef 9bal l'wa9t → <b>tekhsar</b> w l'ghoul yadhrbek.</p>
      </div>
      <button class="btn primary big ft-start">▶ Yallah nebdew</button>`;

    const minInput = $('.ft-min', this.root);
    $('.ft-mission', this.root).addEventListener('change', (e) => { this.selectedMission = Number(e.target.value); });
    $$('.ft-presets .btn', this.root).forEach((b) => b.addEventListener('click', () => {
      minInput.value = b.dataset.min;
      $$('.ft-presets .btn', this.root).forEach((x) => x.classList.toggle('active', x === b));
    }));
    minInput.addEventListener('input', () => $$('.ft-presets .btn', this.root).forEach((x) => x.classList.toggle('active', x.dataset.min === minInput.value)));
    $('.ft-start', this.root).addEventListener('click', () => {
      const subject = $('.ft-subject', this.root).value.trim();
      const minutes = Math.round(Number(minInput.value));
      const strict = $('.ft-strict', this.root).checked;
      if (!(minutes >= 1 && minutes <= 180)) return toast('Ekhtar wa9t bin 1 w 180 d9i9a.', 'bad');
      store.set('focus', { subject, minutes, strict });
      this.start(subject, minutes, strict, Number($('.ft-mission', this.root).value));
    });
  }

  renderRunning() {
    const s = this.session;
    this.root.innerHTML = `
      <div class="ft-running ${s.strict ? 'strict' : ''}">
        <div class="ring">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="${s.strict ? '#ff8a5c' : '#8b6cff'}"/><stop offset="1" stop-color="${s.strict ? '#ff5d8f' : '#4cc9f0'}"/>
            </linearGradient></defs>
            <circle class="ring-bg" cx="100" cy="100" r="90"/>
            <circle class="ring-fg" cx="100" cy="100" r="90" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/>
          </svg>
          <div class="ring-text"><div class="ft-time">--:--</div><div class="ft-sub">${esc(s.subject)}</div></div>
        </div>
        <div class="row" style="margin-bottom:12px">
          ${s.strict ? '<span class="chip warm">🔒 Mode sarem</span>' : '<span class="chip good">🌿 Mode 3adi</span>'}
          <span class="chip">${s.planned_minutes} min</span>
          ${s.mission ? `<span class="chip gold">📚 ${esc(s.mission.title)}</span>` : ''}
        </div>
        ${s.mission ? '<button class="btn primary ft-pdf" style="margin-bottom:10px">📖 7ell l\'cours (PDF)</button><br>' : ''}
        ${s.strict
          ? '<button class="btn danger ft-giveup">🏳️ Nsallem (tekhsar sa77a)</button><p class="hint mt">Ab9a fel page. L\'ghoul yetfarrej fik… 👀 (tnajjem t7ell l\'PDF, howa fel page)</p>'
          : '<button class="btn ft-stop">⏹ Wa9ef w sajjel</button><p class="hint mt">Ken to9ef 9bal l\'wa9t, ytsajjel l\'wa9t elli 9rit ama bla bonus.</p>'}
      </div>`;

    $('.ft-pdf', this.root)?.addEventListener('click', () => openPdf(`api/file.php?type=mission&id=${s.mission.id}`, s.mission.title));
    $('.ft-giveup', this.root)?.addEventListener('click', () => {
      if (confirm('Bech tsallem? Tekhsar men sa77tek.')) this.fail('Sallemt.');
    });
    $('.ft-stop', this.root)?.addEventListener('click', () => {
      if (confirm(`To9ef tawa w tsajjel ${Math.floor((this.session.planned_minutes * 60 - this.remaining()) / 60)} d9i9a?`)) this.finish();
    });
  }
}
