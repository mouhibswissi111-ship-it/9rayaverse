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
    this.chars = new Map();   // player id -> { group, key, yaw, tag, ring }
    this.hover = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'world3d';
    stage.prepend(this.canvas);

    this.overlay = document.createElement('div');
    this.overlay.className = 'tags3d';
    stage.appendChild(this.overlay);

    this.scene = new THREE.Scene();
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

    this.build(opts.theme, opts.themeName, opts.decor);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(stage);
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY > 0 ? 1.12 : 0.89)); }, { passive: false });
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
    const night = theme.dark > 0.3;
    this.scene.background = new THREE.Color(night ? '#2a2036' : '#fde8d6');
    this.hemi.intensity = night ? 0.75 : 0.9;
    this.sun.intensity = night ? 0.55 : 0.8;
    this.sun.color.set(night ? '#ffd9a8' : '#fff4e6');

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
          case 'B':
            if (themeName === 'forest') {
              this.cyl(0.08, 0.1, 0.7, woodDark, cx, 0.35, cz);
              this.ball(0.45, r > 0.5 ? '#2f7a45' : '#3a8f52', cx, 1.0, cz);
            } else if (themeName === 'cafe') {
              this.box(1, 0.95, 0.8, wood, cx, 0.475, cz);
              this.box(1.02, 0.06, 0.86, woodDark, cx, 0.98, cz);
              if (x % 2) { this.cyl(0.07, 0.06, 0.12, '#fff7ef', cx, 1.07, cz); this.cyl(0.055, 0.055, 0.01, '#6b3e26', cx, 1.135, cz); }
            } else {
              this.box(1, 1.5, 0.45, woodDark, cx, 0.75, cz - 0.2);
              const colors = ['#e57373', '#64b5f6', '#81c784', '#ffd54f', '#ba68c8', '#4dd0e1'];
              for (let shelf = 0; shelf < 3; shelf++) {
                for (let i = 0; i < 5; i++) {
                  const bh = 0.25 + this.hash(x * 7 + i, y + shelf) * 0.12;
                  this.box(0.15, bh, 0.3, colors[Math.floor(this.hash(x + i, y * 3 + shelf) * colors.length)], x + 0.15 + i * 0.17, 0.12 + shelf * 0.48 + bh / 2, cz - 0.1);
                }
              }
            }
            break;
          case 'D':
          case 'T': {
            const top = c === 'D' ? 0.62 : 0.55;
            this.box(1.001, 0.07, c === 'D' ? 0.8 : 1.001, wood, cx, top, cz - (c === 'D' ? 0.05 : 0));
            const legs = (dx, dz) => this.box(0.07, top, 0.07, woodDark, cx + dx, top / 2, cz + dz);
            if (this.tileAt(x - 1, y) !== c) { legs(-0.42, -0.35); legs(-0.42, 0.3); }
            if (this.tileAt(x + 1, y) !== c) { legs(0.42, -0.35); legs(0.42, 0.3); }
            if (r > 0.55) { // laptop
              this.box(0.42, 0.025, 0.3, '#cfd8e3', cx, top + 0.05, cz + 0.05);
              const screen = this.box(0.42, 0.28, 0.02, '#455a64', cx, top + 0.19, cz - 0.11);
              screen.rotation.x = -0.25;
            } else if (r > 0.3) { // books + mug
              this.box(0.3, 0.06, 0.22, '#f8bbd0', cx - 0.15, top + 0.07, cz);
              this.box(0.28, 0.05, 0.2, '#90caf9', cx - 0.15, top + 0.125, cz);
              this.cyl(0.06, 0.05, 0.12, '#fffaf0', cx + 0.22, top + 0.1, cz);
            }
            break;
          }
          case 'c':
            this.box(0.46, 0.06, 0.46, woodDark, cx, 0.36, cz + 0.05);
            this.box(0.46, 0.42, 0.06, woodDark, cx, 0.6, cz + 0.27);
            for (const [dx, dz] of [[-0.19, -0.15], [0.19, -0.15], [-0.19, 0.25], [0.19, 0.25]]) this.box(0.05, 0.36, 0.05, woodDark, cx + dx, 0.18, cz + dz);
            break;
          case 'S': {
            this.box(1.001, 0.38, 0.9, theme.sofa, cx, 0.19, cz);
            this.box(1.001, 0.1, 0.8, '#ffffff', cx, 0.42, cz).material = this.mat(new THREE.Color(theme.sofa).lerp(new THREE.Color('#fff'), 0.35).getStyle());
            // backrest on the side facing away from the rug (or against the wall)
            let back = [0, -0.38, 1, 0.18];                                   // north
            if (this.tileAt(x + 1, y) === 'R') back = [-0.38, 0, 0.18, 1];   // rug east → back west
            else if (this.tileAt(x - 1, y) === 'R') back = [0.38, 0, 0.18, 1]; // rug west → back east
            this.box(back[2], 0.75, back[3], theme.sofa, cx + back[0], 0.37, cz + back[1]);
            break;
          }
          case 'P':
            this.cyl(0.2, 0.15, 0.3, '#c0754a', cx, 0.15, cz);
            this.ball(0.3, theme.plant, cx, 0.55, cz, undefined, true);
            this.ball(0.2, theme.plant, cx + 0.15, 0.72, cz - 0.05, undefined, true);
            break;
          case 'L': {
            this.cyl(0.03, 0.03, 1.3, '#6b5b73', cx, 0.65, cz);
            this.cyl(0.14, 0.18, 0.05, '#6b5b73', cx, 0.03, cz);
            const shade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.24, 18, 1, true), new THREE.MeshBasicMaterial({ color: theme.light, side: THREE.DoubleSide }));
            shade.position.set(cx, 1.38, cz);
            this.staticGroup.add(shade);
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

    // body + feet
    add(new THREE.CapsuleGeometry(0.22, 0.2, 6, 14), outfit, 0, 0.4, 0);
    add(new THREE.SphereGeometry(0.09, 10, 8), new THREE.Color(outfit).multiplyScalar(0.6).getStyle(), -0.1, 0.07, 0.05);
    add(new THREE.SphereGeometry(0.09, 10, 8), new THREE.Color(outfit).multiplyScalar(0.6).getStyle(), 0.1, 0.07, 0.05);
    add(new THREE.SphereGeometry(0.08, 10, 8), skin, -0.27, 0.42, 0.02);
    add(new THREE.SphereGeometry(0.08, 10, 8), skin, 0.27, 0.42, 0.02);

    const headY = 0.98;
    const photo = look.mode === 'photo' && p.photo;
    if (photo) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.photoTexture(p.photo), transparent: true }));
      s.scale.set(0.8, 0.8, 1);
      s.position.set(0, headY, 0);
      g.add(s);
    } else {
      add(new THREE.SphereGeometry(0.36, 24, 18), skin, 0, headY, 0);
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
        c = { group, key, yaw: 0, tag };
        this.chars.set(p.id, c);
      }
    }
  }

  // ---------- per frame ----------
  frame(players, me, t, opts = {}) {
    this.syncCharacters(players);
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
      const ring = c.group.userData.ring;
      ring.visible = p.status?.state === 'focus';
      if (ring.visible) ring.material.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t / 300));
    }

    // camera follows me
    if (me) this.camTarget.lerp(new THREE.Vector3(me.x / this.tilePx, 0.5, me.y / this.tilePx), 0.12);
    const pitch = 1.0 + Math.min(0.25, (this.zoom - 4) * 0.012); // a bit more top-down when zoomed out
    this.camera.position.set(this.camTarget.x, this.camTarget.y + Math.sin(pitch) * this.zoom, this.camTarget.z + Math.cos(pitch) * this.zoom);
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
      const html = `<b>${esc(p.name)}</b>${timer}`;
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
    this.renderer.dispose();
    this.canvas.remove();
    this.overlay.remove();
  }
}
