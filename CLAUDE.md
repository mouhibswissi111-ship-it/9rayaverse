# 9rayaverse — notes for Claude (read first)

Gamified virtual study platform for Tunisian students ("cocktail" of Gather.town + Studyverse + YPT + Habitica + Flip + Lilo).
Owner: Mouhib (GitHub `mouhibswissi111-ship-it`, repo `9rayaverse`). Non-developer: they test, Claude does all the code.

## Owner preferences (keep these)
- **All UI text in Tunisian Derja, Latin script (arabizi)**: "Yallah nebdew", "9raya", "Tahadiyet", "O93od"… Talk to the owner in Derja too.
- **Colour theme: "Ghrouba" (peach/orange), NOT pink.** Tokens in `assets/css/style.css` `:root` (`--accent #ea580c`, `--bg #fff8f3`…).
- Style reference: **Lilo study app** (soft pastel, rounded cards, floating bottom nav, 3D rooms with chibi avatars, name + timer above heads).
- Owner has **no international bank card** → only free hosting or Tunisian hosts paid in TND (Oxahost "Standard Nano" ≈ 22 DT HT/month was the suggested VPS).
- Windows 10 PC: avoid emoji newer than Unicode 12 (e.g. 🪙 🫡 🪴 don't render). Windows PowerShell 5.1 scripts must be **ASCII only**.

## Stack & layout
- PHP 8 API (`api/*.php`, shared helpers + game rules in `api/_bootstrap.php`), MySQL/MariaDB DB `rayaverse` (`database.sql` fresh install, `deploy/migrations.sql` upgrades in place).
- Node.js real-time server `ws-server/server.js` (package `ws`): rooms, movement, proximity chat, emotes, sit, pokes (Sallem/Zid), shared room timer, private-room decor. Auth = HMAC token signed by `api/ws_token.php` with `WS_SECRET` (read from `config.php`).
- Front-end: vanilla HTML/CSS/JS. `index.html` (Lilo-style mobile-first landing page: `assets/css/landing.css`, `assets/js/landing.js` demo widgets + real numbers from `api/stats.php` + login/sign-up bottom sheet; shows "Kon mel awlin" while < 20 students), `app.html` + `assets/js/app.js` (dashboard: bottom nav 9raya/Salat/Tahadiyet/Tartib/Profili + pills Missions/Chghol/Jme3ti/Hanout), `room.html` + `room.js` (room logic, 2D canvas) + `room3d.js` (Three.js r149 3D view, default; 2D fallback), `admin.html`/`admin.js`, `common.js`, `focus.js` (timer: strict mode, pause/resume, PDF missions), `avatar.js` (chibi "perso" + decor list), `ambience.js` (lo-fi + generated sounds).
- PWA: `manifest.webmanifest`, `sw.js` (bump `CACHE` + `?v=N` on CSS/JS links when assets change), icons in `assets/icons/`.
- Secrets live in `config.php` (git-ignored; template `config.example.php`). Never commit it.

## Features done
Accounts (first account = admin), strict focus mode + heartbeat, pause/resume, XP/levels/HP/gold/monsters, quests, shop, groups with invite codes + live "studying now", leaderboards (period/group/wilaya), PDF missions (upload, progress, share, clone), group challenges + dares (winner picks dare, loser uploads proof), profile photo + chibi perso editor, private rooms with codes + live decor editor, 3D rooms with sitting, people cards with Sallem / Zid lel jme3a, admin (stats, ban, roles, delete, announcement), login brute-force limit, PWA install.

## How it runs today (owner's PC)
- XAMPP portable in `C:\xampp`, project in `C:\xampp\htdocs\9rayaverse` (canonical copy). Node.js + cloudflared installed via winget.
- Apache extra site `C:\xampp\apache\conf\extra\httpd-9rayaverse.conf`: `127.0.0.1:8090` serves only this folder (blocks phpMyAdmin & XAMPP pages for tunnel visitors) and proxies `/ws` → Node `:8080`. Backup of original: `httpd.conf.bak-9rayaverse`.
- Desktop launchers: **"9rayaverse ON"** (`tunnel/start.ps1`: starts MySQL, Apache, Node, Cloudflare Quick Tunnel, prints link) / **"9rayaverse OFF"** (`tunnel/stop.ps1`) / **"9rayaverse LIEN GitHub (setup)"** (`tunnel/setup-github.ps1`).
- Permanent link: GitHub Pages `https://mouhibswissi111-ship-it.github.io/9rayaverse/` (`docs/index.html` redirects to the current tunnel URL stored in `docs/url.txt`, which ON/OFF update through the GitHub API with a token saved only in `%APPDATA%\9rayaverse\github.json`). Owner was still finishing the token setup.
- After changing `ws-server/server.js`, the owner must press OFF then ON.
- GitHub upload: the owner drag-drops the Desktop folder `9rayaverse-github` (refreshed copy without config.php/node_modules/uploads) via "Add file → Upload files". Dotfiles don't upload that way (`.gitignore`, `.htaccess`) — that's known.

## Server deployment (when they get a VPS)
`deploy/install.sh [domain] [email]` on Ubuntu 22.04/24.04 (Nginx, PHP-FPM, MariaDB, Node + systemd, HTTPS, nightly backup); `deploy/update.sh` for updates (runs migrations). Guide in Derja: `deploy/DEPLOY.md`. Not yet tested on a real Linux server.

## Testing habits
- PHP lint: `C:\xampp\php\php.exe -l file.php`; JS: `node --check file.js`.
- API tests used throwaway accounts named `zz_test_*` — always delete them afterwards (`DELETE FROM users WHERE username LIKE 'zz\_test\_%'`) so the owner's data stays clean. The owner's real admin account is `mouhibswissi` — never touch it.
- The Claude desktop browser pane doesn't run requestAnimationFrame / service workers: step frames manually (`update(); render()`) to check the 3D view.

## 3D rooms — Phase 1 (Nov 2026, in /tmp/9rayaverse, NOT pushed)
- Day/night cycle: `Room3D.setDayPhase()` — Auto (from local hour) / Sbe7 / Nhar / 3chiya / Lil. Sun + hemi + background + fog + floor sun-patch lerp smoothly every frame (`applyLighting` / `pushLighting`). Button in room.html stage-ctrl (`#dayphase-btn`), persisted in store `dayphase`.
- Orbit camera: drag on the WebGL canvas orbits yaw (±0.85 rad, persisted `camYaw`), pinch zooms on touch, wheel zoom as before, double-click or 🎥 Cam button resets. Drag > 8px suppresses the following click so decor placement can't fire by accident; orbit is disabled while Mode Dicor is on (`view3d.orbitEnabled`, set from room.js `setEditMode`).
- Richer materials (procedural, no external assets): CanvasTexture wood grain (`woodTexture()` + `woodMat()` MeshStandardMaterial) on desks/tables/shelves, floor speckle + vignette in `buildFloor`, warm sun-patch plane, 70 drifting dust motes (additive Points, mobile-cheap).
- Avatar animation (lightweight): pivoted arms/legs (`group.userData.parts`) — walk swing, sit pose (arms forward, knees bent, slight lean), typing bob while focus+sitting, breathing idle. Name tags now show `Lv <level>` next to the name + focus timer (level already came over the WS `join` payload — no protocol change).
- Room UI order: side tabs now Chat → Timer l'sala → 9rayti → Nes → Jaw → Dicor (panels reordered to match).
- Cache bumps: `room3d.js?v=8`, `room.js?v=17`, `sw.js` CACHE `rayaverse-v24`.
- Smoke test: `/tmp/room3d-test.js` (Node, stubbed THREE/DOM — NOT in the repo) constructs Room3D, runs frames, cycles all day phases, drags the camera, resets, clamps zoom, pickTile, rebuild, destroy. It caught one real bug during development (a dropped `camTarget` init) which was fixed.
- NOTE — theme drift: this file says Ghrouba `--accent #ea580c`, but `assets/css/style.css` `:root` is actually green `#16a34a` (orange #ea580c is only for the challenges page + 3D highlights). Phase 1 did NOT retheme globally — that needs the owner's explicit OK.

## Ideas discussed, not built yet
- Premium ("9rayaverse Pro") with codes the admin generates, paid by D17/virement (no payment gateway needed); later Konnect/Flouci.
- Moving to Supabase + GitHub Pages (free, no PC) — would need a backend rewrite.
- Proximity voice/video (WebRTC).
