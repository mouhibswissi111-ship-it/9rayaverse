# 9rayaverse — kifech tsob w ttesti (Windows)

## 1. Sob (marra wa7da)

| Outil | 3lech | Mnin |
|---|---|---|
| **XAMPP** (PHP 8 + MySQL/MariaDB + Apache) | Bech ykhaddem l'API PHP w l'base de données | https://www.apachefriends.org → "XAMPP for Windows" → sobbou fi `C:\xampp` |
| **Node.js LTS** (v20 walla akther) | Bech ykhaddem serveur temps réel (WebSocket) | https://nodejs.org → "LTS" |

Ba3d ma tsob Node.js, **sakker w 3awed 7ell** ay terminal bech `node` w `npm` yekhdmou.

## 2. 7ott l'projet fi blastou

Copi l'dossier `9rayaverse` lkol l:

```
C:\xampp\htdocs\9rayaverse
```

## 3. Ch3el Apache + MySQL

Fel **XAMPP Control Panel**, enzel **Start** 9odem **Apache** w **MySQL** (yweliw akhdhar).

## 4. A3mel l'base de données

1. 7ell http://localhost/phpmyadmin
2. Onglet **Importer** → **Choisir un fichier** → `C:\xampp\htdocs\9rayaverse\database.sql`
3. Enzel **Importer** (louta). Lezem todhhar base jdida esmha `rayaverse` fiha 12 tables.

⚠️ Ken 3andek l'version l'9dima (FocusQuest), l'base jdida esmha `rayaverse` — l'9dima ma tetmasch.

## 5. Ch3el serveur temps réel

7ell **PowerShell** w ekteb:

```
cd C:\xampp\htdocs\9rayaverse\ws-server
npm install
npm start
```

Lezem ta9ra `✅ 9rayaverse real-time server listening on ws://localhost:8080`.
**Khalli l'fenêtre hedhi ma7loula** wenti testa3mel l'site.

## 6. 7ell l'site

http://localhost/9rayaverse/

👑 **Awel compte ta3mlou ywalli l'Admin général** automatiquement (bouton "🛠️ Admin" fel louta l'fou9).

## 7. Checklist mta3 l'test

Esta3mel **zouz navigateurs** (Chrome + Edge, walla normal + navigation privée) bech tkoun zouz utilisateurs.

1. **Comptes**: A3mel `saif` (ywalli admin) w `amine`. Ekhtar wileya.
2. **Profili**: 7ott sourtek (📸 Baddel sourti), bio w wileya → sourtek todhhar fel avatar, fel tartib w fel sala.
3. **Missions PDF**: Fel 📚 Missions habbat PDF, 7ott objectif 10 min → "▶ Ebda 9raya" → "📖 7ell l'cours" (l'PDF y7ell fel page, mode sarem ma yetna7ach). Ba3d 10 min 9raya → "🎯 Mission kmlet!".
4. **Partage**: Partagi l'cours m3a jme3a → s7abek ychoufouh fi "🤝 Cours mta3 s7abek" w ynajmou "📥 Zidha".
5. **Tahaddi**: Fel jme3a, a3mel tahaddi (l'modda: Nhar) → amine yenzel "💪 Ana m3akom!". Bech ttesti l'fin dghya, fel phpMyAdmin badel `ends_at` mta3 l'tahaddi l wa9t fet:
   ```sql
   UPDATE group_challenges SET ends_at = NOW() - INTERVAL 1 MINUTE;
   ```
   Ba3d 3awed 7ell l'dashboard → elli rba7 ya5tar l'chart (😈 Ab3ath), elli khser yhabbat preuve w yenzel "✅ 3malt l'chart".
6. **Mode sarem**: Session 1 min sarma, emchi l'onglet e5er 15 swani → tekhsar sa77a.
7. **Tartib**: Lyoum / Hal jom3a / Hal chhar / Lkol + filtre b wileya walla b jme3a.
8. **Sala virtuelle**: Ezzouz od5lou l "Maktbet Lil" → temchi b WASD/ZQSD, chat "📍 9rib" (ken elli fel dayra l'khadhra), "📢 L'sala lkol", Zone Skoot (chat msakker), timer l'sala, "🎧 Jaw".
9. **Perso (chibi)**: Fel 👤 Profili → "🧍 Lbes l'perso mte3ek": baddel l'bachra, l'cha3r (ma3a hijab), l'lawn, l'3inin, nadharat → 💾 Sajjel. L'perso yodhhar fel sala, fel tartib w fel jme3a. "📸 Sourti" ken t7eb sourtek blasstou.
10. **Sala privée + dicor**: Fel 🏰 Salat → "🔐 A3mel l'sala" → ta5ou code (mathalan `AB12CD`). amine ya3mel "🔑 Od5ol b code". Enti (moul l'sala) fel onglet "🎨 Dicor": ekhtar 7aja (🐈, 📚, 🌼, Klim tounsi…) w enzel 3al blasa fel sala → amine ychoufha direct. Baddel l'style (🌸 Bit Wardi, ☕ 9ahwa…).
11. **Admin**: 🛠️ Admin → statistiques, bloqui/debloqui utilisateur, rodd wa7ed admin, fasse5 cours walla jme3a, ab3ath i3lan (yodhhar fel dashboard lel kol).

## Mochkel?

| Mochkla | 7all |
|---|---|
| "Ma najamtech nwsel lel serveur" | Apache msakker → ch3lou fel XAMPP. |
| "Unknown database 'rayaverse'" | Importi `database.sql` (étape 4). |
| "Access denied" | Badel `DB_USER` / `DB_PASS` fi `config.php`. |
| L'sala t9oul "L'connexion m3a serveur temps réel t9ass'et" | A3mel `npm start` fi `ws-server` w khalli l'fenêtre ma7loula. |
| PDF kbir ma yethabbatch | Fi XAMPP → Config → PHP (php.ini): `upload_max_filesize = 40M` w `post_max_size = 40M`, ba3d 3awed ch3el Apache. |
| Apache ma yech3elch (port 80) | Sakker Skype/IIS, walla fi httpd.conf badel `Listen 80` → `Listen 8081` w 7ell http://localhost:8081/9rayaverse/ |
| Port 8080 mesta3mel | Badel `WS_PORT` fi `config.php` (mathalan 8090) w 3awed `npm start`. |

Bech s7abek fel nafs l'Wi-Fi yod5lou: `http://IP-mta3-PC/9rayaverse/` (l'IP tal9ah b `ipconfig`). Windows Firewall ynajjem yes2lek 3la Node.js → Autoriser.
