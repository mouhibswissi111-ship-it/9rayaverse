// 3D view of a virtual room (Lilo-style): low-poly room built from the same tile MAP as the 2D view,
// toon-shaded chibi characters made from each player's "perso", HTML name tags with live timers.
// Needs Three.js (global THREE). room.js keeps all game logic; this file only draws.
'use strict';

class Room3D {
  /**
   * @param {HTMLElement} stage   element that receives the WebGL canvas + label overlay
   * @param {{map: string[], tile: number, theme: object, themeName: string, decor: object[]}} opts
   */
  constructor(stage, opts) {
    this.stage = stage;
    this.map = opts.map;
    this.tilePx = opts.tile;
    this.cols = this.map[0].length;
    this.rows = this.map.length;
    this.zoom = Number(store.get('zoom3d', 10));
    this.camTarget = new THREE.Vector3(this.cols / 2, 0.5, this.rows / 2);
    this.yaw = Number(store.get('camYaw', 0));
    this.yawTarget = this.yaw;
    // Jaw nhar/lil: 'auto' (7asb se3a l'PC) walla wa7ed mel presets.
    // Yet7afedh fel navigateur (store 'dayphase').
    this.dayPhase = store.get('dayphase', 'auto');
    this.orbitEnabled = true; // yettsakker ki Mode Dicor ma7loul (room.js)
    this._dragged = false;
    this._dragDist = 0;
    this._suppressClick = false;
    this._pointers = new Map();
    this._pinchDist = 0;
    this._lastT = 0;
    this.lightCur = null;
    this.lightTarget = null;
    this.chars = new Map();   // player id -> { group, key, yaw, tag, ring }
    this.hover = null;
    this._modelTemplates = {}; // key -> normalized GLB template (Phase 2)
    this._modelsLoading = false;
    this._slots = [];          // furniture slots built by build()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'world3d';
    stage.prepend(this.canvas);

    this.overlay = document.createElement('div');
    this.overlay.className = 'tags3d';
    stage.appendChild(this.overlay);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#fde8d6'); // pushLighting() fait .copy() dessus : ne doit pas rester null
    this.scene.fog = new THREE.Fog('#e9dfd3', 22, 56);
    this.camera = new THREE.PerspectiveCamera(40, 1.5, 0.1, 200);
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xf3d2bd, 0.8);
    this.sun = new THREE.DirectionalLight(0xfff1e0, 0.75);
    this.sun.position.set(this.cols * 0.3, 18, this.rows * 1.1);
    this.sun.target.position.set(this.cols / 2, 0, this.rows / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 60 });
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.staticGroup = new THREE.Group();
    this.scene.add(this.staticGroup);
    this.highlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xea580c, transparent: true, opacity: 0.35 }));
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.02;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    // Ba93a chams dafya 3al 9a3a (tetbadel m3a jaw nhar/lil).
    this.sunPatch = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cols * 0.55, this.rows * 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0.07, depthWrite: false })
    );
    this.sunPatch.rotation.x = -Math.PI / 2;
    this.sunPatch.position.set(this.cols * 0.62, 0.012, this.rows * 0.3);
    this.scene.add(this.sunPatch);

    // Ghabra t3oum fel jaw (Lilo-style): 70 no9ta, 5afifa 3al mobile.
    this.dust = this.makeDust();
    this.scene.add(this.dust);

    this.build(opts.theme, opts.themeName, opts.decor);
    this.loadModels(); // Phase 2: vrais modèles GLB (async, fallback = primitifs Phase 1)
    this.resize();
    new ResizeObserver(() => this.resize()).observe(stage);
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY > 0 ? 1.12 : 0.89)); }, { passive: false });
    this.setupOrbit();
  }

  // ---------- jaw nhar / lil ----------
  static DAY_PHASES = {
    sbe7: { sun: '#ffd9a0', sunI: 0.95, hemi: 0.9, bg: '#ffe9c9', fog: '#f6e3d2', patch: 0.1, sunY: 14 },
    nhar: { sun: '#fff4e6', sunI: 0.85, hemi: 0.95, bg: '#fde8d6', fog: '#f6e3d2', patch: 0.07, sunY: 18 },
    '3chiya': { sun: '#ff9a3c', sunI: 1.05, hemi: 0.8, bg: '#ffd9b0', fog: '#f2c9a0', patch: 0.16, sunY: 9 },
    lil: { sun: '#ffd9a8', sunI: 0.55, hemi: 0.75, bg: '#2a2036', fog: '#211b31', patch: 0.03, sunY: 16 },
  };

  /** Phase li 5adem tawa: preset, walla 7asb se3a ken 'auto'. */
  resolvePhase() {
    if (this.dayPhase !== 'auto') return this.dayPhase;
    const h = new Date().getHours();
    if (h >= 6 && h < 9) return 'sbe7';
    if (h >= 9 && h < 17) return 'nhar';
    if (h >= 17 && h < 19) return '3chiya';
    return 'lil';
  }

  setDayPhase(mode) {
    this.dayPhase = mode;
    store.set('dayphase', mode);
    this.applyLighting(false);
    return this.resolvePhase();
  }

  /** 7seb l'éclairage cible (theme + phase), w snappi ken awwel marra. */
  applyLighting(snap) {
    const ph = Room3D.DAY_PHASES[this.resolvePhase()];
    const night = this.theme.dark > 0.3 ? 0.5 : 0; // themes lil (maktba/9ahwa/ghaba) yeb9aw moody
    const target = {
      sunI: ph.sunI * (1 - night * 0.25),
      hemi: ph.hemi * (1 - night * 0.15),
      sunColor: new THREE.Color(ph.sun),
      bg: new THREE.Color(ph.bg).lerp(new THREE.Color('#241a30'), night * 0.45),
      fog: new THREE.Color(ph.fog).lerp(new THREE.Color('#1d1526'), night * 0.45),
      patch: ph.patch,
      sunY: ph.sunY,
    };
    this.lightTarget = target;
    if (snap || !this.lightCur) {
      this.lightCur = {
        sunI: target.sunI, hemi: target.hemi,
        sunColor: target.sunColor.clone(), bg: target.bg.clone(), fog: target.fog.clone(),
        patch: target.patch, sunY: target.sunY,
      };
      this.pushLighting();
    }
  }

  /** Appliqui l'éclairage l'7ali 3al scene (yetnada kol frame bch l'transition tkoun smooth). */
  pushLighting() {
    const c = this.lightCur;
    if (!c) return;
    this.sun.intensity = c.sunI;
    this.sun.color.copy(c.sunColor);
    this.hemi.intensity = c.hemi;
    this.scene.background.copy(c.bg);
    this.scene.fog.color.copy(c.fog);
    this.sunPatch.material.opacity = c.patch;
  }

  // ---------- caméra orbit ----------
  setupOrbit() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      this._dragged = false;
      this._dragDist = 0;
      c.classList.add('dragging');
      try { c.setPointerCapture(e.pointerId); } catch { /* mouch mawjoud */ }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      const prev = this._pointers.get(e.pointerId);
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._dragDist += Math.abs(dx) + Math.abs(dy);
      if (this._dragDist > 8) this._dragged = true;
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinchDist > 0 && d > 0) this.setZoom(this.zoom * (this._pinchDist / d));
        this._pinchDist = d;
        return;
      }
      if (!this.orbitEnabled) return;
      // Drag bch tdour l'caméra (yaw bark, pitch yetbadel m3a zoom kima 9bal).
      this.yawTarget = Math.max(-0.85, Math.min(0.85, this.yawTarget - dx * 0.005));
    });
    const endPointer = (e) => {
      if (this._pointers.has(e.pointerId)) this._pointers.delete(e.pointerId);
      if (this._pointers.size === 0) {
        c.classList.remove('dragging');
        if (this._dragged) this._suppressClick = true; // ma t7ottech dicor ki kont tdour
        store.set('camYaw', Number(this.yaw.toFixed(3)));
      }
    };
    c.addEventListener('pointerup', endPointer);
    c.addEventListener('pointercancel', endPointer);
    // Click li ba3d drag yettsakker (bech ma y7ottech dicor bel ghalta).
    c.addEventListener('click', (e) => {
      if (this._suppressClick) { e.stopPropagation(); e.preventDefault(); this._suppressClick = false; }
    }, true);
    c.addEventListener('dblclick', () => this.resetCamera());
  }

  resetCamera() {
    this.yawTarget = 0;
    this.setZoom(10);
    store.set('camYaw', 0);
  }

  makeDust() {
    const n = 70;
    const pos = new Float32Array(n * 3);
    this._dustBase = [];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * this.cols;
      const y = 0.2 + Math.random() * 2;
      const z = Math.random() * this.rows;
      pos.set([x, y, z], i * 3);
      this._dustBase.push({ x, y, z, s: 0.02 + Math.random() * 0.05, ph: Math.random() * Math.PI * 2 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffe0b0, size: 0.07, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
  }

  static supported() {
    if (typeof THREE === 'undefined') return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  // ---------- helpers ----------
  tileAt(x, y) { return (this.map[y] && this.map[y][x]) || '#'; }
  mat(color, toon = false) {
    const key = color + toon;
    this.mats = this.mats || new Map();
    if (!this.mats.has(key)) {
      this.mats.set(key, toon ? new THREE.MeshToonMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
    }
    return this.mats.get(key);
  }
  box(w, h, d, color, x, y, z, parent = this.staticGroup) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  cyl(rt, rb, h, color, x, y, z, parent = this.staticGroup, seg = 14) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  ball(r, color, x, y, z, parent = this.staticGroup, toon = false) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), this.mat(color, toon));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  woodTexture() {
    if (this._woodTex) return this._woodTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#8a6a48';
    g.fillRect(0, 0, 256, 256);
    // 5ouyout l'5achab: lignes horizontales b alpha yetbadel
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * 256;
      g.strokeStyle = `rgba(${60 + Math.random() * 40 | 0},${35 + Math.random() * 25 | 0},20,${0.12 + Math.random() * 0.22})`;
      g.lineWidth = 1 + Math.random() * 2.5;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + (Math.random() * 6 - 3), 170, y + (Math.random() * 6 - 3), 256, y);
      g.stroke();
    }
    // 3o9ad l'5achab
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      g.strokeStyle = 'rgba(50,30,15,.35)';
      g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(x, y, 10, 5, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(x, y, 4, 2, 0, 0, Math.PI * 2); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    this._woodTex = tex;
    return tex;
  }
  /** Matériau 5achab (Standard, roughness 0.75): yetsta3mel lel bureaux / tables / biblio. */
  woodMat() {
    if (this._woodMat) return this._woodMat;
    this._woodMat = new THREE.MeshStandardMaterial({ map: this.woodTexture(), roughness: 0.75, metalness: 0 });
    return this._woodMat;
  }
  std(color, rough = 0.85) {
    const key = `std:${color}:${rough}`;
    this.mats = this.mats || new Map();
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
    return this.mats.get(key);
  }
  emojiTexture(text, size = 128) {
    this.emojiCache = this.emojiCache || new Map();
    if (this.emojiCache.has(text)) return this.emojiCache.get(text);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.font = `${size * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText(text, size / 2, size / 2 + size * 0.05);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    this.emojiCache.set(text, tex);
    return tex;
  }
  sprite(text, scale, x, y, z, parent = this.staticGroup) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.emojiTexture(text), transparent: true, depthWrite: false }));
    s.scale.set(scale, scale, scale);
    s.position.set(x, y, z);
    parent.add(s);
    return s;
  }
  hash(x, y) { return Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1; }

  // ---------- static room ----------
  build(theme, themeName, decor) {
    this.theme = theme;
    this.themeName = themeName;
    for (const c of [...this.staticGroup.children]) this.staticGroup.remove(c);
    this._slots = [];
    const night = theme.dark > 0.3; // themes lil (maktba/9ahwa/ghaba): lampes + glow a9wa
    this.applyLighting(!this.lightCur);

    this.buildFloor(theme, decor);

    const wood = theme.wood;
    const woodDark = theme.woodDark;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = this.tileAt(x, y);
        const cx = x + 0.5;
        const cz = y + 0.5;
        const r = this.hash(x, y);
        switch (c) {
          case '#': {
            // Outer walls are tall, inner ones are low partitions so the camera sees the whole room.
            const outer = x === 0 || y === 0 || x === this.cols - 1 || y === this.rows - 1;
            const h = outer ? (y === this.rows - 1 ? 0.25 : 1.1) : 0.38;
            const wallColor = new THREE.Color(theme.wallFace).lerp(new THREE.Color(theme.wall), night ? 0.35 : 0.15).getStyle();
            this.box(1, h, 1, wallColor, cx, h / 2, cz);
            this.box(1.02, 0.06, 1.02, new THREE.Color(theme.wallFace).lerp(new THREE.Color('#ffffff'), 0.35).getStyle(), cx, h + 0.03, cz);
            break;
          }
          case 'B': {
            if (themeName === 'forest') {
              this.cyl(0.08, 0.1, 0.7, woodDark, cx, 0.35, cz);
              this.ball(0.45, r > 0.5 ? '#2f7a45' : '#3a8f52', cx, 1.0, cz);
            } else if (themeName === 'cafe') {
              const slot = this.slotFor(x, y, 'counter');
              this.box(1, 0.95, 0.8, wood, cx, 0.475, cz, slot).material = this.woodMat();
              this.box(1.02, 0.06, 0.86, woodDark, cx, 0.98, cz, slot);
              if (x % 2) { this.cyl(0.07, 0.06, 0.12, '#fff7ef', cx, 1.07, cz, slot); this.cyl(0.055, 0.055, 0.01, '#6b3e26', cx, 1.135, cz, slot); }
            } else {
              const slot = this.slotFor(x, y, 'shelf');
              this.box(1, 1.5, 0.45, woodDark, cx, 0.75, cz - 0.2, slot).material = this.woodMat();
              const colors = ['#e57373', '#64b5f6', '#81c784', '#ffd54f', '#ba68c8', '#4dd0e1'];
              for (let shelf = 0; shelf < 3; shelf++) {
                for (let i = 0; i < 5; i++) {
                  const bh = 0.25 + this.hash(x * 7 + i, y + shelf) * 0.12;
                  this.box(0.15, bh, 0.3, colors[Math.floor(this.hash(x + i, y * 3 + shelf) * colors.length)], x + 0.15 + i * 0.17, 0.12 + shelf * 0.48 + bh / 2, cz - 0.1, slot);
                }
              }
            }
            break;
          }
          case 'D':
          case 'T': {
            const slot = this.slotFor(x, y, c === 'D' ? 'desk' : 'table', { r });
            const top = c === 'D' ? 0.62 : 0.55;
            this.box(1.001, 0.07, c === 'D' ? 0.8 : 1.001, wood, cx, top, cz - (c === 'D' ? 0.05 : 0), slot).material = this.woodMat();
            const legs = (dx, dz) => this.box(0.07, top, 0.07, woodDark, cx + dx, top / 2, cz + dz, slot);
            if (this.tileAt(x - 1, y) !== c) { legs(-0.42, -0.35); legs(-0.42, 0.3); }
            if (this.tileAt(x + 1, y) !== c) { legs(0.42, -0.35); legs(0.42, 0.3); }
            if (r > 0.55) { // laptop
              this.box(0.42, 0.025, 0.3, '#cfd8e3', cx, top + 0.05, cz + 0.05, slot);
              const screen = this.box(0.42, 0.28, 0.02, '#455a64', cx, top + 0.19, cz - 0.11, slot);
              screen.rotation.x = -0.25;
            } else if (r > 0.3) { // books + mug
              this.box(0.3, 0.06, 0.22, '#f8bbd0', cx - 0.15, top + 0.07, cz, slot);
              this.box(0.28, 0.05, 0.2, '#90caf9', cx - 0.15, top + 0.125, cz, slot);
              this.cyl(0.06, 0.05, 0.12, '#fffaf0', cx + 0.22, top + 0.1, cz, slot);
            }
            break;
          }
          case 'c': {
            const slot = this.slotFor(x, y, 'chair');
            this.box(0.46, 0.06, 0.46, woodDark, cx, 0.36, cz + 0.05, slot);
            this.box(0.46, 0.42, 0.06, woodDark, cx, 0.6, cz + 0.27, slot);
            for (const [dx, dz] of [[-0.19, -0.15], [0.19, -0.15], [-0.19, 0.25], [0.19, 0.25]]) this.box(0.05, 0.36, 0.05, woodDark, cx + dx, 0.18, cz + dz, slot);
            break;
          }
          case 'S': {
            // backrest on the side facing away from the rug (or against the wall)
            let back = [0, -0.38, 1, 0.18];                                   // north
            let rotY = 0; // modèle sofa: face = +Z local → vers le tapis
            if (this.tileAt(x + 1, y) === 'R') { back = [-0.38, 0, 0.18, 1]; rotY = Math.PI / 2; }   // rug east → back west, face east
            else if (this.tileAt(x - 1, y) === 'R') { back = [0.38, 0, 0.18, 1]; rotY = -Math.PI / 2; } // rug west → back east, face west
            const slot = this.slotFor(x, y, 'sofa', { rotY });
            this.box(1.001, 0.38, 0.9, theme.sofa, cx, 0.19, cz, slot);
            this.box(1.001, 0.1, 0.8, '#ffffff', cx, 0.42, cz, slot).material = this.mat(new THREE.Color(theme.sofa).lerp(new THREE.Color('#fff'), 0.35).getStyle());
            this.box(back[2], 0.75, back[3], theme.sofa, cx + back[0], 0.37, cz + back[1], slot);
            break;
          }
          case 'P': {
            const slot = this.slotFor(x, y, 'plant', { rotY: r * 1.2 });
            this.cyl(0.2, 0.15, 0.3, '#c0754a', cx, 0.15, cz, slot);
            this.ball(0.3, theme.plant, cx, 0.55, cz, slot, true);
            this.ball(0.2, theme.plant, cx + 0.15, 0.72, cz - 0.05, slot, true);
            break;
          }
          case 'L': {
            const slot = this.slotFor(x, y, 'lamp');
            this.cyl(0.03, 0.03, 1.3, '#6b5b73', cx, 0.65, cz, slot);
            this.cyl(0.14, 0.18, 0.05, '#6b5b73', cx, 0.03, cz, slot);
            const shade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.24, 18, 1, true), new THREE.MeshBasicMaterial({ color: theme.light, side: THREE.DoubleSide }));
            shade.position.set(cx, 1.38, cz);
            slot.add(shade);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: theme.light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: night ? 0.85 : 0.22 }));
            glow.scale.set(night ? 2.2 : 1.5, night ? 2.2 : 1.5, 1);
            glow.position.set(cx, 1.3, cz);
            this.staticGroup.add(glow);
            break;
          }
          case 'M':
            this.box(0.6, 0.9, 0.5, '#2b2533', cx, 0.45, cz);
            this.cyl(0.16, 0.16, 0.02, '#555', cx, 0.6, cz + 0.26).rotation.x = Math.PI / 2;
            break;
        }
      }
    }

    // Warm practical lights make the room feel inhabited instead of flat.
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      if (this.tileAt(x, y) !== 'L') continue;
      const point = new THREE.PointLight(theme.light, night ? 1.15 : 0.38, night ? 8 : 5, 2);
      point.position.set(x + 0.5, 1.25, y + 0.5);
      point.castShadow = night;
      if (night) point.shadow.mapSize.set(512, 512);
      this.staticGroup.add(point);
    }

    for (const d of decor || []) {
      const def = DECOR_BY_KEY[d.k];
      if (!def || def.rug) continue;
      this.sprite(def.e, def.solid ? 0.95 : 0.7, d.x + 0.5, def.solid ? 0.5 : 0.38, d.y + 0.5);
      if (def.light) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: theme.light, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
        glow.scale.set(1.8, 1.8, 1);
        glow.position.set(d.x + 0.5, 0.6, d.y + 0.5);
        this.staticGroup.add(glow);
      }
    }

    this.applyModels(); // Phase 2: remplacer les primitifs par les modèles GLB déjà chargés (sinon au chargement)
  }

  // ---------- Phase 2: vrais modèles 3D (GLB, Kenney CC0) ----------
  // Les meubles procéduraux (Phase 1) restent le fallback: si le loader est
  // absent (vieux cache) ou si un modèle ne charge pas, la salle garde son
  // look Phase 1 — rien ne casse. Les modèles sont remplacés dès qu'ils sont
  // chargés (async), et à chaque rebuild (changement de thème).
  static MODEL_DEFS = {
    desk:    { url: 'assets/models/desk.glb.b64', w: 1.0, h: 0.52 },
    chair:   { url: 'assets/models/chairDesk.glb.b64', w: 0.7, h: 0.59 },
    shelf:   { url: 'assets/models/bookcaseOpen.glb.b64', w: 0.62, h: 1.32 },
    counter: { url: 'assets/models/kitchenCabinet.glb.b64', w: 0.9, h: 0.9 },
    table:   { url: 'assets/models/table.glb.b64', w: 1.18, h: 0.46 },
    sofa:    { url: 'assets/models/loungeSofa.glb.b64', w: 1.27, h: 0.6 },
    plant:   { url: 'assets/models/pottedPlant.glb.b64', w: 0.4, h: 0.8 },
    lamp:    { url: 'assets/models/lampRoundFloor.glb.b64', w: 0.25, h: 1.29 },
    books:   { url: 'assets/models/books.glb.b64', w: 0.23, h: 0.15 },
    laptop:  { url: 'assets/models/laptop.glb.b64', w: 0.33, h: 0.2 },
  };

  /** Crée un slot de meuble (groupe vide dans staticGroup) pour une tuile. */
  slotFor(x, y, type, extra = {}) {
    const group = new THREE.Group();
    this.staticGroup.add(group);
    const slot = { type, group, x, y, done: false, ...extra };
    this._slots.push(slot);
    return group;
  }

  loadModels() {
    if (this._modelsLoading || typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') return;
    this._modelsLoading = true;
    const loader = new THREE.GLTFLoader();
    const defs = Room3D.MODEL_DEFS;
    const keys = Object.keys(defs);
    let pending = keys.length;
    const done = () => { if (--pending <= 0) this.applyModels(); };
    for (const key of keys) {
      // Modèles stockés en base64 (voir assets/models/README.md) : le push
      // GitHub de ce repo est texte-only, donc les GLB sont encodés.
      // On décode vers les bytes GLB originaux puis on parse.
      fetch(defs[key].url).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      }).then((b64) => {
        const bin = atob(b64.replace(/\s/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        loader.parse(bytes.buffer, '', (gltf) => {
          try { this._modelTemplates[key] = this.normalizeModel(gltf.scene, defs[key]); } catch (e) { /* fallback: primitifs */ }
          done();
        }, () => done());
      }).catch(() => done());
    }
  }

  /** Centre le modèle sur sa tuile, bas à y=0, scale vers la taille cible.
   *  Les modèles Kenney sont KHR_materials_unlit (MeshBasicMaterial): on les
   *  convertit en MeshStandardMaterial pour que le cycle jour/nuit les éclaire
   *  comme le reste de la salle. */
  normalizeModel(scene, def) {
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m && m.isMeshBasicMaterial) {
        o.material = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xffffff, roughness: 0.85, metalness: 0 });
      }
      o.castShadow = true;
      o.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const scale = Math.min(def.w / size.x, def.h / size.y, 1 / size.z);
    const inner = new THREE.Group();
    inner.add(scene);
    scene.position.set(-center.x, -box.min.y, -center.z);
    inner.scale.setScalar(scale);
    return { group: inner, scale, topY: size.y * scale };
  }

  /** Remplace les primitifs des slots par les modèles déjà chargés. */
  applyModels() {
    if (!this._slots || !this._modelTemplates) return;
    for (const slot of this._slots) {
      if (slot.done) continue;
      if (this.upgradeSlot(slot)) slot.done = true;
    }
  }

  /** Remplace les primitifs d'un slot par le vrai modèle (clone du template).
   *  Retourne false si le modèle n'est pas encore chargé (on réessaiera). */
  upgradeSlot(slot) {
    const tpl = this._modelTemplates[slot.type];
    if (!tpl) return false;
    const cx = slot.x + 0.5;
    const cz = slot.y + 0.5;
    // Vider le slot (géométries procédurales) — les matériaux sont partagés/cachés, on ne les dispose pas.
    for (const ch of [...slot.group.children]) {
      ch.traverse?.((o) => { if (o.geometry) o.geometry.dispose?.(); });
      slot.group.remove(ch);
    }
    const place = (key, x, y, z, rotY = 0) => {
      const t = this._modelTemplates[key];
      if (!t) return null;
      const inst = t.group.clone(true);
      inst.position.set(x, y, z);
      inst.rotation.y = rotY;
      slot.group.add(inst);
      return inst;
    };
    switch (slot.type) {
      case 'desk': {
        place('desk', cx, 0, cz - 0.05);
        const topY = tpl.topY;
        if (slot.r > 0.55) place('laptop', cx - 0.05, topY, cz - 0.13);
        else if (slot.r > 0.3) {
          place('books', cx - 0.15, topY, cz + 0.02, 0.4);
          this.cyl(0.06, 0.05, 0.12, '#fffaf0', cx + 0.22, topY + 0.06, cz, slot.group);
        }
        break;
      }
      case 'table':
        place('table', cx, 0, cz);
        break;
      case 'chair':
        place('chair', cx, 0, cz + 0.05, Math.PI);
        break;
      case 'shelf':
        place('shelf', cx, 0, cz - 0.2);
        break;
      case 'counter':
        place('counter', cx, 0, cz);
        break;
      case 'sofa':
        place('sofa', cx, 0, cz, slot.rotY || 0);
        break;
      case 'plant':
        place('plant', cx, 0, cz, slot.rotY || 0);
        break;
      case 'lamp':
        place('lamp', cx, 0, cz);
        break;
      default:
        return false;
    }
    return true;
  }

  glowTexture() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this._glow = new THREE.CanvasTexture(c);
    return this._glow;
  }

  /** Floor = one textured plane: checker tiles, rugs, zone tints and labels drawn with Canvas 2D. */
  buildFloor(theme, decor) {
    const px = 48;
    const c = document.createElement('canvas');
    c.width = this.cols * px;
    c.height = this.rows * px;
    const g = c.getContext('2d');
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const t = this.tileAt(x, y);
        g.fillStyle = theme.floor[(x + y) % 2];
        g.fillRect(x * px, y * px, px, px);
        g.fillStyle = 'rgba(0,0,0,.05)';
        g.fillRect(x * px, y * px + px - 2, px, 2);
        if (t === 'R') {
          g.fillStyle = theme.rug;
          g.fillRect(x * px, y * px, px, px);
          g.fillStyle = theme.rugEdge;
          if (this.tileAt(x - 1, y) !== 'R') g.fillRect(x * px, y * px, 5, px);
          if (this.tileAt(x + 1, y) !== 'R') g.fillRect(x * px + px - 5, y * px, 5, px);
          if (this.tileAt(x, y - 1) !== 'R') g.fillRect(x * px, y * px, px, 5);
          if (this.tileAt(x, y + 1) !== 'R') g.fillRect(x * px, y * px + px - 5, px, 5);
        }
      }
    }
    for (const d of decor || []) {
      const def = DECOR_BY_KEY[d.k];
      if (def?.rug) drawDecorItem(g, d, px);
    }
    // Grain 5afif + vignette: l'9a3a ma3adch plat.
    for (let i = 0; i < 420; i++) {
      g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.05)';
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
    }
    const vig = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,.09)');
    g.fillStyle = vig;
    g.fillRect(0, 0, c.width, c.height);
    if (typeof ZONES !== 'undefined') {
      g.font = `700 ${px * 0.42}px Poppins, Inter, "Segoe UI Emoji", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const z of ZONES) {
        g.fillStyle = theme.dark < 0.2 ? 'rgba(110,60,30,.55)' : 'rgba(255,255,255,.55)';
        g.fillText((z.labelRow === 9 ? '▲ ' : '▼ ') + z.name, (z.x + z.w / 2) * px, (z.labelRow + 0.5) * px);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.cols, this.rows), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.cols / 2, 0, this.rows / 2);
    floor.receiveShadow = true;
    this.staticGroup.add(floor);
  }

  // ---------- characters ----------
  buildCharacter(p) {
    const look = normalizeLook(p.look);
    const g = new THREE.Group();
    const skin = pick(LOOK_OPTIONS.skin, look.skin);
    const hairC = pick(LOOK_OPTIONS.hairColor, look.hairColor);
    const outfit = p.color || '#8b6cff';
    const toon = (color) => this.mat(color, true);
    const add = (geo, color, x, y, z, rot) => {
      const m = new THREE.Mesh(geo, toon(color));
      m.position.set(x, y, z);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = true;
      g.add(m);
      return m;
    };

    // body + bras + rjoul (pivots bch l'animation tkoun s7i7a: mechya, 93ad, kteba)
    const parts = {};
    const limb = (geo, color, px, py, pz, ox, oy, oz) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, py, pz);
      const m = new THREE.Mesh(geo, toon(color));
      m.position.set(ox, oy, oz);
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      return pivot;
    };
    parts.body = add(new THREE.CapsuleGeometry(0.22, 0.2, 6, 14), outfit, 0, 0.4, 0);
    parts.armL = limb(new THREE.SphereGeometry(0.08, 10, 8), skin, -0.27, 0.55, 0.02, 0, -0.13, 0);
    parts.armR = limb(new THREE.SphereGeometry(0.08, 10, 8), skin, 0.27, 0.55, 0.02, 0, -0.13, 0);
    const legColor = new THREE.Color(outfit).multiplyScalar(0.6).getStyle();
    parts.legL = limb(new THREE.SphereGeometry(0.09, 10, 8), legColor, -0.1, 0.2, 0.05, 0, -0.12, 0);
    parts.legR = limb(new THREE.SphereGeometry(0.09, 10, 8), legColor, 0.1, 0.2, 0.05, 0, -0.12, 0);
    g.userData.parts = parts;

    const headY = 0.98;
    const photo = look.mode === 'photo' && p.photo;
    if (photo) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.photoTexture(p.photo), transparent: true }));
      s.scale.set(0.8, 0.8, 1);
      s.position.set(0, headY, 0);
      g.add(s);
      parts.head = s;
    } else {
      parts.head = add(new THREE.SphereGeometry(0.36, 24, 18), skin, 0, headY, 0);
      const hair = Number(look.hair) || 0;
      const cap = (r = 0.385, len = 0.5) => add(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI * len), hairC, 0, headY, -0.02, [-0.35, 0, 0]);
      if (hair === 4) {
        // hijab: a hood open at the front + drape around the neck
        add(new THREE.SphereGeometry(0.41, 24, 16, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.82), hairC, 0, headY, 0);
        add(new THREE.CylinderGeometry(0.26, 0.38, 0.28, 18), hairC, 0, 0.67, 0);
      } else {
        cap();
        if (hair === 1) add(new THREE.BoxGeometry(0.62, 0.55, 0.16), hairC, 0, 0.83, -0.24);
        if (hair === 2) add(new THREE.SphereGeometry(0.15, 14, 10), hairC, 0, headY + 0.36, -0.15);
        if (hair === 3) for (let i = 0; i < 11; i++) { const a = (i / 11) * Math.PI * 2; add(new THREE.SphereGeometry(0.12, 10, 8), hairC, Math.cos(a) * 0.3, headY + 0.14 + Math.sin(i) * 0.05, Math.sin(a) * 0.3 - 0.04); }
        if (hair === 5) for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const cone = add(new THREE.ConeGeometry(0.08, 0.24, 8), hairC, Math.cos(a) * 0.2, headY + 0.33, Math.sin(a) * 0.2 - 0.03); cone.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); }
      }
      // face (on +Z, the direction the character looks)
      const eyes = Number(look.eyes) || 0;
      const fz = 0.33;
      for (const sx of [-0.13, 0.13]) {
        if (eyes === 1) add(new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI), '#2a1a22', sx, headY + 0.01, fz, [0, 0, 0]);
        else if (eyes === 2) { add(new THREE.SphereGeometry(0.065, 12, 10), '#2a1a22', sx, headY, fz - 0.01); add(new THREE.SphereGeometry(0.022, 8, 6), '#ffffff', sx + 0.025, headY + 0.025, fz + 0.045); }
        else add(new THREE.SphereGeometry(0.045, 10, 8), '#2a1a22', sx, headY, fz);
      }
      add(new THREE.TorusGeometry(0.04, 0.012, 6, 10, Math.PI), '#7a3b2e', 0, headY - 0.1, fz + 0.01, [0, 0, Math.PI]);
      if (look.blush) {
        for (const sx of [-0.21, 0.21]) {
          const b = new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), new THREE.MeshBasicMaterial({ color: '#ff8fa3', transparent: true, opacity: 0.55 }));
          b.position.set(sx, headY - 0.07, 0.3);
          b.rotation.y = sx * 1.6;
          g.add(b);
        }
      }
      const glasses = Number(look.glasses) || 0;
      if (glasses === 1) {
        for (const sx of [-0.13, 0.13]) add(new THREE.TorusGeometry(0.08, 0.013, 6, 16), '#3a2a2a', sx, headY, fz + 0.04);
        add(new THREE.BoxGeometry(0.08, 0.015, 0.015), '#3a2a2a', 0, headY, fz + 0.05);
      } else if (glasses === 2) {
        for (const sx of [-0.13, 0.13]) add(new THREE.BoxGeometry(0.16, 0.1, 0.03), '#15121c', sx, headY, fz + 0.04);
        add(new THREE.BoxGeometry(0.1, 0.02, 0.02), '#15121c', 0, headY + 0.02, fz + 0.05);
      }
    }
    if (p.hat) {
      const hat = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.emojiTexture(p.hat), transparent: true, depthWrite: false }));
      hat.scale.set(0.5, 0.5, 0.5);
      hat.position.set(0, headY + 0.42, 0);
      g.add(hat);
    }

    // focus ring on the floor (shown while studying)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.48, 32), new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    ring.visible = false;
    g.add(ring);
    g.userData.ring = ring;
    return g;
  }

  photoTexture(url) {
    this.photoCache = this.photoCache || new Map();
    if (this.photoCache.has(url)) return this.photoCache.get(url);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    const img = new Image();
    img.onload = () => {
      const g = c.getContext('2d');
      g.beginPath();
      g.arc(64, 64, 60, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.save();
      g.beginPath();
      g.arc(64, 64, 55, 0, Math.PI * 2);
      g.clip();
      g.drawImage(img, 9, 9, 110, 110);
      g.restore();
      tex.needsUpdate = true;
    };
    img.src = url;
    this.photoCache.set(url, tex);
    return tex;
  }

  syncCharacters(players) {
    for (const [id, c] of this.chars) {
      if (!players.has(id)) {
        this.scene.remove(c.group);
        c.tag.remove();
        this.chars.delete(id);
      }
    }
    for (const p of players.values()) {
      const key = JSON.stringify([p.look, p.color, p.hat, p.photo]);
      let c = this.chars.get(p.id);
      if (!c || c.key !== key) {
        if (c) { this.scene.remove(c.group); c.tag.remove(); }
        const group = this.buildCharacter(p);
        this.scene.add(group);
        const tag = document.createElement('div');
        tag.className = 'tag3d';
        tag.innerHTML = '<div class="emo"></div><div class="bub" hidden></div><div class="nm"></div>';
        this.overlay.appendChild(tag);
        c = { group, key, yaw: 0, tag, parts: group.userData.parts || null };
        this.chars.set(p.id, c);
      }
    }
  }

  // ---------- per frame ----------
  frame(players, me, t, opts = {}) {
    this.syncCharacters(players);
    const dt = this._lastT ? Math.min(0.1, (t - this._lastT) / 1000) : 0.016;
    this._lastT = t;

    // Transition jaw (nhar/lil) smooth, w yaw l'caméra smooth.
    if (this.lightTarget && this.lightCur) {
      const k = 0.04;
      this.lightCur.sunI += (this.lightTarget.sunI - this.lightCur.sunI) * k;
      this.lightCur.hemi += (this.lightTarget.hemi - this.lightCur.hemi) * k;
      this.lightCur.patch += (this.lightTarget.patch - this.lightCur.patch) * k;
      this.lightCur.sunY += (this.lightTarget.sunY - this.lightCur.sunY) * k;
      this.lightCur.sunColor.lerp(this.lightTarget.sunColor, k);
      this.lightCur.bg.lerp(this.lightTarget.bg, k);
      this.lightCur.fog.lerp(this.lightTarget.fog, k);
      this.pushLighting();
      this.sun.position.y = this.lightCur.sunY;
    }
    this.yaw += (this.yawTarget - this.yaw) * 0.12;

    // Ghabra t3oum: thabbet louta bchwaya w tarja3 l'fou9.
    if (this.dust) {
      const pos = this.dust.geometry.attributes.position;
      for (let i = 0; i < this._dustBase.length; i++) {
        const d = this._dustBase[i];
        d.y -= d.s * dt;
        if (d.y < 0.15) d.y = 2.2;
        pos.setXYZ(i, d.x + Math.sin(t / 3000 + d.ph) * 0.15, d.y, d.z + Math.cos(t / 3600 + d.ph) * 0.12);
      }
      pos.needsUpdate = true;
    }

    const yawFor = { down: 0, up: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
    for (const p of players.values()) {
      const c = this.chars.get(p.id);
      const x = p.x / this.tilePx;
      const z = p.y / this.tilePx;
      const bob = p.sit ? 0 : p.moving ? Math.abs(Math.sin(t / 90)) * 0.06 : Math.sin(t / 700) * 0.015;
      c.group.position.set(x, (p.sit ? 0.16 : 0) + bob, z + (p.sit ? -0.02 : 0));
      const target = p.sit && p.sitFace ? yawFor[p.sitFace] : (yawFor[p.dir] ?? 0);
      let d = target - c.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      c.yaw += d * 0.2;
      c.group.rotation.y = c.yaw;
      c.group.rotation.x = p.sit ? 0.07 : 0; // ymil l'9oddem chwaya ki ye93od
      // Animations 5afifa: mechya, 93ad, kteba ki focus.
      const parts = c.parts;
      if (parts) {
        const moving = p.moving && !p.sit;
        const focusing = p.status?.state === 'focus';
        const swing = moving ? Math.sin(t / 110) * 0.55 : 0;
        const type = focusing && p.sit ? Math.sin(t / 130) * 0.07 : 0;
        parts.armL.rotation.x = p.sit ? -1.05 + type : swing;
        parts.armR.rotation.x = p.sit ? -1.05 - type : -swing;
        parts.legL.rotation.x = p.sit ? -0.9 : -swing * 0.8;
        parts.legR.rotation.x = p.sit ? -0.9 : swing * 0.8;
        const breathe = 1 + Math.sin(t / 700 + (typeof p.id === 'string' ? p.id.charCodeAt(0) : 0)) * 0.012;
        parts.body.scale.y = breathe;
      }
      const ring = c.group.userData.ring;
      ring.visible = p.status?.state === 'focus';
      if (ring.visible) ring.material.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t / 300));
    }

    // camera follows me (orbit yaw + pitch 7asb zoom)
    if (me) this.camTarget.lerp(new THREE.Vector3(me.x / this.tilePx, 0.5, me.y / this.tilePx), 0.12);
    const pitch = 1.0 + Math.min(0.25, (this.zoom - 4) * 0.012); // a bit more top-down when zoomed out
    const ch = Math.cos(pitch);
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * ch * this.zoom,
      this.camTarget.y + Math.sin(pitch) * this.zoom,
      this.camTarget.z + Math.cos(this.yaw) * ch * this.zoom
    );
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
    this.updateTags(players, me, opts);
  }

  updateTags(players, me, opts) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    for (const p of players.values()) {
      const c = this.chars.get(p.id);
      v.set(p.x / this.tilePx, (p.sit ? 0.16 : 0) + 1.55, p.y / this.tilePx).project(this.camera);
      const visible = v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2;
      c.tag.style.display = visible ? '' : 'none';
      if (!visible) continue;
      c.tag.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      const near = me && p !== me && Math.hypot(p.x - me.x, p.y - me.y) <= (opts.near || 160);
      const studying = p.status?.state === 'focus';
      const timer = studying ? ` <span class="t">⏱ ${fmtClock((p.status.until - opts.now) / 1000)}</span>` : p.status?.state === 'break' ? ' <span class="t">☕</span>' : '';
      const lv = p.level ? ` <span class="lv">Lv ${p.level}</span>` : '';
      const html = `<b>${esc(p.name)}</b>${lv}${timer}`;
      const nm = c.tag.querySelector('.nm');
      if (nm.innerHTML !== html) nm.innerHTML = html;
      c.tag.classList.toggle('me', p === me);
      c.tag.classList.toggle('near', !!near);
      const bub = c.tag.querySelector('.bub');
      const showBub = p.bubble && performance.now() < p.bubble.until && !opts.hideBubbles;
      if (showBub) { if (bub.textContent !== p.bubble.text) bub.textContent = p.bubble.text; bub.hidden = false; } else bub.hidden = true;
      const emo = c.tag.querySelector('.emo');
      if (p.emote && performance.now() - p.emote.start < 2000) {
        const k = (performance.now() - p.emote.start) / 2000;
        emo.textContent = p.emote.e;
        emo.style.opacity = String(1 - k);
        emo.style.transform = `translateY(${-k * 30}px)`;
      } else if (emo.textContent) {
        emo.textContent = '';
      }
    }
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    const w = Math.max(200, r.width - 32);   // canvas sits 16px inside the stage (see .world3d)
    const h = Math.max(200, r.height - 32);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setZoom(z) {
    this.zoom = Math.max(4, Math.min(26, z));
    store.set('zoom3d', this.zoom);
  }

  /** Tile under the mouse (for the decor editor), or null. */
  pickTile(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return null;
    const tx = Math.floor(hit.x);
    const ty = Math.floor(hit.z);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return null;
    return { tx, ty };
  }

  showHover(tile) {
    this.highlight.visible = !!tile;
    if (tile) this.highlight.position.set(tile.tx + 0.5, 0.02, tile.ty + 0.5);
  }

  destroy() {
    this.dust?.geometry.dispose?.();
    this.dust?.material.dispose?.();
    this.sunPatch?.geometry.dispose?.();
    this.sunPatch?.material.dispose?.();
    this.renderer.dispose();
    this.canvas.remove();
    this.overlay.remove();
  }
}
