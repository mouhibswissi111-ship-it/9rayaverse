# 🚀 Kifech ttalla3 9rayaverse fel internet (lel nes lkol)

L'plan: **GitHub** (l'code) → **serveur Ubuntu bilech (Oracle Cloud)** → **domaine bilech (DuckDNS)** → **HTTPS** → s7abek ysobbou l'app 3al téléphone 📲

Kol étape fiha chnowa ta3mel b dhabt. Ta9riban **1 sa3a** l'marra l'awla.

---

## Étape 1 — 7ott l'code fi GitHub

1. A3mel compte fi https://github.com (ken ma 3andekch).
2. Sobb **Git** 3al PC: https://git-scm.com/download/win (Next, Next… kol chay par défaut).
3. Fi GitHub enzel **New repository** → esmou `9rayaverse` → **Public** → **Create** (bla README).
4. 7ell PowerShell w ekteb (baddel `ESMEK` b l'username mte3ek fi GitHub):

```
cd C:\xampp\htdocs\9rayaverse
git init
git add .
git commit -m "9rayaverse v1"
git branch -M main
git remote add origin https://github.com/ESMEK/9rayaverse.git
git push -u origin main
```

GitHub bech y7ellek fenêtre bech tconnecti → connecti.

✅ `config.php` (fih les mots de passe) w les fichiers mta3 l'utilisateurs **ma yetla3ouch** fi GitHub (`.gitignore`). Donc l'repository ynajjem ykoun Public bla mochkla.

---

## Étape 2 — Serveur bilech (Oracle Cloud Free Tier)

1. A3mel compte fi https://www.oracle.com/cloud/free/. Yes2lek carte bancaire **ken lel vérification**: ma yna77ilekch flous ken tab9a fel "Always Free".
2. Fel console: **Create a VM instance**:
   - **Image**: Ubuntu 22.04 walla 24.04
   - **Shape**: `VM.Standard.E2.1.Micro` (Always Free), walla Ampere A1 ken mawjoud (a9wa)
   - **SSH keys**: "Generate a key pair for me" → **habbat l'clé privée** (`.key`) w 7ottha fi blasa mrigla, mathalan `C:\Users\ESMEK\.ssh\oracle.key`
3. Ba3d ma tetsna3, 9ayyed **l'Public IP** (mathalan `141.147.10.20`).
4. **7ell les ports 80 w 443**: fel page mta3 l'instance → Subnet → Security List → **Add Ingress Rules**:
   - Source CIDR `0.0.0.0/0`, TCP, Destination port `80`
   - Nafs l'7aja lel port `443`

---

## Étape 3 — Domaine bilech (DuckDNS)

1. Od5ol https://www.duckdns.org b GitHub walla Google.
2. Ekhtar sous-domaine, mathalan `9rayaverse` → ywalli `9rayaverse.duckdns.org`.
3. Fel "current ip", 7ott **l'Public IP** mta3 Oracle → **update ip**.

(Ba3d tnajjem tchri domaine `.com` walla `.tn` w tbaddlou.)

---

## Étape 4 — Sobb 9rayaverse 3al serveur (commande wa7da)

Fi PowerShell 3al PC mte3ek, od5ol lel serveur:

```
ssh -i C:\Users\ESMEK\.ssh\oracle.key ubuntu@141.147.10.20
```

(Ken yes2lek "Are you sure…?" ekteb `yes`.) Ba3d, **dakhel l'serveur**, ekteb (baddel `ESMEK`, l'domaine w l'email):

```
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/ESMEK/9rayaverse.git /var/www/9rayaverse
sudo bash /var/www/9rayaverse/deploy/install.sh 9rayaverse.duckdns.org email@mte3ek.com
```

L'script ya3mel kol chay wa7dou (5–10 d9aye9):
- ysobb Nginx, PHP, MariaDB w Node.js
- ya3mel l'base w **mots de passe jdod random**
- ych3el serveur temps réel w y3awed ych3lou wa7dou ken ta7
- y7ell l'firewall, ya3mel **backup kol lila** (14 nhar)
- ysobb **HTTPS** (Let's Encrypt). L'email ykhalli Let's Encrypt yab3athlek ken l'certificat bech yofa. B l'commande hedhi enti tweffe9 3la les conditions mta3hom.

Fel ekher ykteblek: `✅ 9rayaverse jahez: https://9rayaverse.duckdns.org`

👑 **Od5ol direct w a3mel l'compte mte3ek l'AWEL** — howa elli ywalli Admin général.

---

## Étape 5 — Ab3ath l'lien lel s7ab + sobb l'app 📲

- **Android (Chrome)**: 7ell l'site → bouton **"📲 Installi l'app"** fel dashboard (walla menu ⋮ → "Installer l'application").
- **iPhone (Safari)**: 7ell l'site → **Partager** (⬆️) → **Sur l'écran d'accueil**.
- **PC (Chrome/Edge)**: icône ⊕ fel barre d'adresse.

---

## Ba3d: mise à jour ki nbaddlou l'code

3al PC: `git add .` → `git commit -m "update"` → `git push`. Ba3d 3al serveur:

```
sudo bash /var/www/9rayaverse/deploy/update.sh
```

(Ya3mel backup 9bal, ba3d yjib l'code jdid w y3awed ych3el.)

---

## Mochkel?

| Mochkla | 7all |
|---|---|
| L'site ma y7elch | Thabbet les ports 80/443 fel Security List (étape 2.4) w elli DuckDNS fih l'IP s7i7a |
| "HTTPS ma tsobbech" | DuckDNS lezem ychouf 3al IP mta3 l'serveur. Stanna 5 d9aye9 w: `sudo certbot --nginx -d 9rayaverse.duckdns.org` |
| L'salat t9oul "connexion t9ass'et" | `sudo systemctl status rayaverse-ws` (lezem "active (running)") — w `sudo journalctl -u rayaverse-ws -n 50` bech tchouf l'erreur |
| Erreur fel site | `sudo tail -n 50 /var/log/nginx/error.log` |
| Nraja3 backup | Les backups fi `/var/backups/rayaverse/` |

**Sécurité:** `APP_DEBUG` ykoun `false` 3al serveur (l'erreurs techniques ma yetla3ouch lel nes). L'login yetbloqua 15 d9i9a ba3d 10 tentatives ghaltin.
