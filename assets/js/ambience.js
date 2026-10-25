// Ambience: generated study sounds (Web Audio, works offline) + lo-fi radio (YouTube embed).
'use strict';

const Ambience = {
  ctx: null,
  layers: {}, // kind -> { gain, stop }

  SOUNDS: [
    { kind: 'rain', label: '🌧️ Mtar' },
    { kind: 'fire', label: '🔥 Kanoun' },
    { kind: 'waves', label: '🌊 Mouj l\'b7ar' },
    { kind: 'brown', label: '🟤 Brown noise' },
  ],

  STATIONS: [
    { id: 'jfKfPfyJRdk', label: 'lofi hip hop radio 📚 beats to relax/study to' },
    { id: '4xDzrJKXOOY', label: 'synthwave radio 🌌 beats to chill/game to' },
  ],

  audio() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  noise(color, seconds = 4) {
    const ctx = this.audio();
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (color === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = white;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  },

  filter(type, freq, q = 0.7) {
    const f = this.audio().createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  },

  start(kind, volume) {
    if (this.layers[kind]) return;
    const ctx = this.audio();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    const stops = [];

    if (kind === 'rain') {
      const src = this.noise('white');
      src.connect(this.filter('highpass', 500)).connect(this.filter('lowpass', 7000)).connect(gain);
      src.start();
      stops.push(() => src.stop());
    } else if (kind === 'brown') {
      const src = this.noise('brown');
      src.connect(this.filter('lowpass', 900)).connect(gain);
      src.start();
      stops.push(() => src.stop());
    } else if (kind === 'waves') {
      const src = this.noise('brown');
      const swell = ctx.createGain();
      swell.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.12;
      depth.gain.value = 0.45;
      lfo.connect(depth).connect(swell.gain);
      src.connect(this.filter('lowpass', 1200)).connect(swell).connect(gain);
      src.start();
      lfo.start();
      stops.push(() => { src.stop(); lfo.stop(); });
    } else if (kind === 'fire') {
      const base = this.noise('brown');
      const low = ctx.createGain();
      low.gain.value = 0.6;
      base.connect(this.filter('lowpass', 400)).connect(low).connect(gain);
      base.start();
      const crackle = setInterval(() => {
        if (Math.random() < 0.55) return;
        const pop = this.noise('white', 0.03);
        const env = ctx.createGain();
        const t = ctx.currentTime;
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.4 + Math.random() * 0.6, t + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
        pop.connect(this.filter('bandpass', 1500 + Math.random() * 3000, 1.5)).connect(env).connect(gain);
        pop.start(t);
        pop.stop(t + 0.12);
      }, 90);
      stops.push(() => { base.stop(); clearInterval(crackle); });
    }

    this.layers[kind] = { gain, stop: () => { stops.forEach((s) => s()); gain.disconnect(); } };
  },

  stop(kind) {
    this.layers[kind]?.stop();
    delete this.layers[kind];
  },

  setVolume(kind, v) {
    if (this.layers[kind]) this.layers[kind].gain.gain.value = v;
  },

  youtubeId(text) {
    const m = String(text).match(/(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/) || String(text).match(/^([\w-]{11})$/);
    return m ? m[1] : null;
  },

  /** Renders the Vibes panel into root. */
  render(root) {
    const saved = store.get('vibes', {});
    root.innerHTML = `
      <h3>🎧 Radio Lo-fi</h3>
      <div class="vibe">
        <select class="input yt-station">
          ${this.STATIONS.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}
          <option value="custom">7ott lien YouTube mte3ek…</option>
        </select>
        <input class="input yt-custom mt" placeholder="https://www.youtube.com/watch?v=…" hidden>
        <div class="row mt"><button class="btn primary sm yt-play">▶ Ch3el</button><button class="btn sm yt-stop">■ Tfi</button></div>
        <div class="yt-wrap" hidden></div>
      </div>
      <h3 class="mt">🌿 Aswat lel tarkiz <span class="hint">(khaltouhom!)</span></h3>
      ${this.SOUNDS.map((s) => `
        <div class="vibe">
          <div class="row">
            <label class="switch" style="flex:1"><input type="checkbox" data-kind="${s.kind}"> ${s.label}</label>
            <input type="range" min="0" max="1" step="0.01" value="${saved[s.kind] ?? 0.4}" data-vol="${s.kind}">
          </div>
        </div>`).join('')}
      <p class="hint">L'aswat tetsna3 direct fel navigateur — ma t7tejch tnazzel chay.</p>`;

    const station = $('.yt-station', root);
    const custom = $('.yt-custom', root);
    const wrap = $('.yt-wrap', root);
    station.addEventListener('change', () => { custom.hidden = station.value !== 'custom'; });
    $('.yt-play', root).addEventListener('click', () => {
      const id = station.value === 'custom' ? this.youtubeId(custom.value) : station.value;
      if (!id) return toast('Hedha mouch lien YouTube s7i7.', 'bad');
      wrap.hidden = false;
      wrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1" allow="autoplay; encrypted-media" allowfullscreen title="Radio Lo-fi"></iframe>`;
    });
    $('.yt-stop', root).addEventListener('click', () => { wrap.innerHTML = ''; wrap.hidden = true; });

    $$('input[data-kind]', root).forEach((cb) => cb.addEventListener('change', () => {
      const vol = Number($(`input[data-vol="${cb.dataset.kind}"]`, root).value);
      if (cb.checked) this.start(cb.dataset.kind, vol); else this.stop(cb.dataset.kind);
    }));
    $$('input[data-vol]', root).forEach((r) => r.addEventListener('input', () => {
      this.setVolume(r.dataset.vol, Number(r.value));
      store.set('vibes', { ...store.get('vibes', {}), [r.dataset.vol]: Number(r.value) });
    }));
  },
};
