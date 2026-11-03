# 9rayaverse 📚🇹🇳

Dar 9raya virtuelle lel twensa: n9raw m3a ba3dhna, nerb7ou XP, w n9atlou l'kasla.

- ⏱️ **Session 9raya** b timer, **mode sarem** (kima Flip) w tartib (kima YPT)
- 📚 **Missions PDF**: habbat les cours mte3ek w 7ott objectif
- ⚔️ **Tahadiyet + chorout**: elli ya9ra akther yerba7, elli yakhser ya3mel chart
- 🏰 **Salat virtuelles** b avatars chibi, chat "9rib", timer mechtarek, lo-fi (kima Gather / Studyverse / Lilo) — 3D mtawra: jaw nhar/lil, caméra tdour (orbit), avatars yet7arkou (mechya, 93ad, kteba), meubles 3D 7a9i9iya (bureaux, chaises, biblio, canapés, lampes, plantes)
- 🔐 **Salat privées** b code, w dicor tzayyenha kima t7eb
- 🐉 **RPG**: XP, niveaux, flous, ghilen, hanout (kima Habitica)
- 🛠️ **Admin général**, 📲 **ytsobb kima app** (PWA)

## Stack
PHP 8 + MySQL/MariaDB (API) · Node.js + `ws` (temps réel) · HTML/CSS/JS bla framework (canvas lel salat)

## Tkhaddmou 3al PC (XAMPP)
Chouf [SETUP.md](SETUP.md).

## Ttal3ou fel internet (serveur Ubuntu)
Chouf [deploy/DEPLOY.md](deploy/DEPLOY.md) — script wa7ed ysobb kol chay (Nginx, PHP, MariaDB, Node, HTTPS).

## 3D rooms — Phase 2 (Nov 2026): meubles 3D 7a9i9iya
El meubles procéduraux (boxes/cylindres, Phase 1) tbadlou b modèles GLB 7a9i9iya, chargés async w yremplacent les primitifs dès qu'ils arrivent — ken un modèle ma yetchargéch, el meuble procédural yo93od (fallback, rien ne casse).
- **Modèles**: Kenney Furniture Kit 2.0 (https://kenney.nl/assets/furniture-kit), licence **CC0** (gratuit, usage commercial OK, credit optionnel) — fichiers f `assets/models/` (10 modèles, ~127 KB de GLB) + licence f `assets/models/LICENSE-Kenney.txt`. Bureau, chaise de bureau, biblio ouverte, comptoir cuisine (thème 9ahwa), table, canapé, plante, lampe, livres, laptop. **Note** : les GLB sont stockés encodés en base64 (`*.glb.b64`, ~169 KB) parce que le push GitHub de ce repo est texte-only ; `room3d.js` les décode avec `atob()` puis les parse — byte-identique au GLB original (voir `assets/models/README.md`).
- **Loader**: `assets/js/GLTFLoader.js` = GLTFLoader three.js r147 (UMD) vendored — la page utilise three.min.js r149 non-module, w UMD GLTFLoader tna7a ba3d r147. three.js est MIT. Les modèles Kenney sont `KHR_materials_unlit` → convertis en `MeshStandardMaterial` au chargement pour que le cycle jour/nuit les éclaire.
- **Positions**: chaque modèle recentré sur sa tuile w scalé vers la taille cible (bureau 1.0×0.52, chaise face bureau, canapé face tapis, biblio contre mur). Thème Ghaba: les arbres restent procéduraux (pas de modèle d'arbre dans le kit).
- **Cache**: `room3d.js?v=9`, `GLTFLoader.js?v=1`, `sw.js` CACHE `rayaverse-v25` (modèles inclus dans SHELL).
- **Bug Phase 1 tsalla7**: `scene.background` ken `null` → `pushLighting()` ken bech yti7 f erreur f premier frame; initialisé f constructeur.
