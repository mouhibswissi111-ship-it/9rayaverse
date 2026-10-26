-- =====================================================================
--  9rayaverse database
--  Import this file in phpMyAdmin (http://localhost/phpmyadmin → Import)
--  It creates the database `rayaverse`, all tables and the seed data.
--  WARNING: re-importing deletes all existing 9rayaverse data.
--  The FIRST account registered on the site becomes the general admin.
-- =====================================================================

SET NAMES utf8mb4; -- keep emoji (🧢 👑 🐉…) intact whatever tool imports this file

CREATE DATABASE IF NOT EXISTS rayaverse
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rayaverse;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS private_room_members;
DROP TABLE IF EXISTS private_rooms;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS challenge_participants;
DROP TABLE IF EXISTS group_challenges;
DROP TABLE IF EXISTS user_items;
DROP TABLE IF EXISTS shop_items;
DROP TABLE IF EXISTS focus_sessions;
DROP TABLE IF EXISTS missions;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS study_groups;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS monsters;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Ghilen (Habitica-style bosses). IDs must stay 1..N with no gaps.
-- After the last one the cycle restarts with +50% HP and rewards.
-- ---------------------------------------------------------------------
CREATE TABLE monsters (
  id          INT PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  emoji       VARCHAR(16) NOT NULL,
  max_hp      INT NOT NULL,
  xp_reward   INT NOT NULL,
  gold_reward INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO monsters (id, name, emoji, max_hp, xp_reward, gold_reward) VALUES
  (1, 'L''Kasla',                '🟢', 30, 20, 10),
  (2, 'Wtwat l''Distraction',    '🦇', 60, 35, 15),
  (3, 'Ghoul l''Scroll',         '👺', 90, 50, 20),
  (4, 'Jenn l''Notifications',   '👻', 120, 70, 30),
  (5, 'Tannin l''Deadline',      '🐉', 180, 100, 50),
  (6, 'Sanam l''Burnout',        '🗿', 240, 140, 70),
  (7, 'Ghoul l''Examen',         '👹', 360, 250, 120);

-- ---------------------------------------------------------------------
-- Users: account + profile + RPG stats + current monster
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  username          VARCHAR(20)  NOT NULL UNIQUE,
  email             VARCHAR(120) NOT NULL UNIQUE,
  password_hash     VARCHAR(255) NOT NULL,
  role              ENUM('user','admin') NOT NULL DEFAULT 'user',
  banned            TINYINT(1) NOT NULL DEFAULT 0,
  photo             VARCHAR(80)  NULL,
  bio               VARCHAR(160) NOT NULL DEFAULT '',
  wilaya            VARCHAR(30)  NOT NULL DEFAULT '',
  avatar_color      VARCHAR(7)   NOT NULL DEFAULT '#8b6cff',
  hat               VARCHAR(16)  NOT NULL DEFAULT '',
  look              VARCHAR(255) NULL,          -- chibi character (JSON: skin, hair, hairColor, eyes, glasses, blush, mode)
  level             INT NOT NULL DEFAULT 1,
  xp                INT NOT NULL DEFAULT 0,
  hp                INT NOT NULL DEFAULT 50,
  max_hp            INT NOT NULL DEFAULT 50,
  gold              INT NOT NULL DEFAULT 0,
  streak            INT NOT NULL DEFAULT 0,
  best_streak       INT NOT NULL DEFAULT 0,
  last_study_date   DATE NULL,
  monster_id        INT NOT NULL DEFAULT 1,
  monster_hp        INT NOT NULL DEFAULT 30,
  monsters_defeated INT NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL,
  INDEX idx_users_wilaya (wilaya),
  CONSTRAINT fk_users_monster FOREIGN KEY (monster_id) REFERENCES monsters(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Study groups (Jme3a)
-- ---------------------------------------------------------------------
CREATE TABLE study_groups (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  name               VARCHAR(40) NOT NULL,
  description        VARCHAR(200) NOT NULL DEFAULT '',
  invite_code        CHAR(6) NOT NULL UNIQUE,
  owner_id           INT NOT NULL,
  daily_goal_minutes INT NOT NULL DEFAULT 120,
  is_public          TINYINT(1) NOT NULL DEFAULT 1,
  created_at         DATETIME NOT NULL,
  CONSTRAINT fk_groups_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_members (
  group_id  INT NOT NULL,
  user_id   INT NOT NULL,
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (group_id, user_id),
  INDEX idx_gm_user (user_id),
  CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_gm_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Missions: an uploaded course PDF + a study-time target.
-- Focus sessions linked to a mission add to its progress.
-- group_id set = the course is shared with that group.
-- Several missions may point to the same file (when friends copy a shared course).
-- ---------------------------------------------------------------------
CREATE TABLE missions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  group_id         INT NULL,
  title            VARCHAR(100) NOT NULL,
  file_name        VARCHAR(80)  NOT NULL,
  original_name    VARCHAR(150) NOT NULL,
  size             INT NOT NULL,
  target_minutes   INT NOT NULL DEFAULT 120,
  deadline         DATE NULL,
  progress_seconds INT NOT NULL DEFAULT 0,
  status           ENUM('active','done') NOT NULL DEFAULT 'active',
  completed_at     DATETIME NULL,
  created_at       DATETIME NOT NULL,
  INDEX idx_missions_user (user_id, status),
  INDEX idx_missions_file (file_name),
  CONSTRAINT fk_missions_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_missions_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Focus sessions (time tracking + strict mode)
-- status: active → completed | partial | failed | abandoned
-- ---------------------------------------------------------------------
CREATE TABLE focus_sessions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  mission_id       INT NULL,
  subject          VARCHAR(60) NOT NULL,
  planned_minutes  INT NOT NULL,
  strict           TINYINT(1) NOT NULL DEFAULT 0,
  status           ENUM('active','completed','partial','failed','abandoned') NOT NULL DEFAULT 'active',
  started_at       DATETIME NOT NULL,
  last_ping_at     DATETIME NOT NULL,
  paused_at        DATETIME NULL,             -- set while a flexible session is paused
  paused_seconds   INT NOT NULL DEFAULT 0,    -- total paused time (not counted as study)
  ended_at         DATETIME NULL,
  credited_seconds INT NOT NULL DEFAULT 0,
  xp_earned        INT NOT NULL DEFAULT 0,
  gold_earned      INT NOT NULL DEFAULT 0,
  damage           INT NOT NULL DEFAULT 0,
  INDEX idx_user_status (user_id, status),
  INDEX idx_ended (ended_at),
  CONSTRAINT fk_fs_user    FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fs_mission FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Chghol / to-dos (Habitica)
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(120) NOT NULL,
  difficulty ENUM('easy','medium','hard') NOT NULL DEFAULT 'easy',
  done       TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  done_at    DATETIME NULL,
  INDEX idx_tasks_user (user_id, done),
  CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Tahadiyet (group challenges) + chorout (dares)
-- status: running → awaiting_dare (winner picks the dare) → dare_pending
--         (losers must do it) → closed.  cancelled = not enough players.
-- metric: minutes = most study time, missions = most missions completed.
-- ---------------------------------------------------------------------
CREATE TABLE group_challenges (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  group_id   INT NOT NULL,
  created_by INT NULL,
  title      VARCHAR(80) NOT NULL,
  metric     ENUM('minutes','missions') NOT NULL DEFAULT 'minutes',
  starts_at  DATETIME NOT NULL,
  ends_at    DATETIME NOT NULL,
  status     ENUM('running','awaiting_dare','dare_pending','closed','cancelled') NOT NULL DEFAULT 'running',
  dare       VARCHAR(200) NULL,
  dare_by    INT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_ch_group (group_id, status),
  INDEX idx_ch_due (status, ends_at),
  CONSTRAINT fk_ch_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_ch_user  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE challenge_participants (
  challenge_id INT NOT NULL,
  user_id      INT NOT NULL,
  joined_at    DATETIME NOT NULL,
  score        INT NULL,
  rank_pos     INT NULL,
  outcome      ENUM('winner','loser','middle') NULL,
  dare_done    TINYINT(1) NOT NULL DEFAULT 0,
  proof_file   VARCHAR(80) NULL,
  done_at      DATETIME NULL,
  PRIMARY KEY (challenge_id, user_id),
  INDEX idx_cp_user (user_id),
  CONSTRAINT fk_cp_ch   FOREIGN KEY (challenge_id) REFERENCES group_challenges(id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Hanout (shop: cosmetics + potions) and inventory
-- ---------------------------------------------------------------------
CREATE TABLE shop_items (
  item_key VARCHAR(30) PRIMARY KEY,
  name     VARCHAR(40) NOT NULL,
  type     ENUM('hat','color','potion') NOT NULL,
  value    VARCHAR(16) NOT NULL,
  price    INT NOT NULL,
  sort     INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO shop_items (item_key, name, type, value, price, sort) VALUES
  ('potion_health', 'Dwe (+25 sa77a)',        'potion', '25',      25,  1),
  ('hat_none',      'Bla kabbous',            'hat',    '',        0,  10),
  ('hat_cap',       'Casquette',              'hat',    '🧢',      20,  11),
  ('hat_flower',    'Tej mta3 ward',          'hat',    '🌸',      40,  12),
  ('hat_grad',      'Kabbous l''Diplôme',     'hat',    '🎓',      60,  13),
  ('hat_top',       'Kabbous l''Bey',         'hat',    '🎩',      80,  14),
  ('hat_helmet',    'Casque mta3 forsen',     'hat',    '⛑️',      120, 15),
  ('hat_crown',     'Tej l''Malek',           'hat',    '👑',      250, 16),
  ('color_violet',  'Bnafsaji (default)',     'color',  '#8b6cff', 0,  20),
  ('color_mint',    'Na3na3i',                'color',  '#2ee6a6', 15, 21),
  ('color_sunset',  'Ghrouba',                'color',  '#ff7a59', 15, 22),
  ('color_sky',     'Sma',                    'color',  '#4cc9f0', 15, 23),
  ('color_rose',    'Wardi',                  'color',  '#ff5d8f', 15, 24),
  ('color_gold',    'Dheb (légendaire)',      'color',  '#ffd166', 100, 25);

CREATE TABLE user_items (
  user_id  INT NOT NULL,
  item_key VARCHAR(30) NOT NULL,
  PRIMARY KEY (user_id, item_key),
  CONSTRAINT fk_ui_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ui_item FOREIGN KEY (item_key) REFERENCES shop_items(item_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Salat privées: a room only friends with the code can enter.
-- The owner decorates it (decor = JSON list of {k: item, x: tile, y: tile}).
-- ---------------------------------------------------------------------
CREATE TABLE private_rooms (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  code       CHAR(6) NOT NULL UNIQUE,
  owner_id   INT NOT NULL,
  name       VARCHAR(40) NOT NULL,
  theme      ENUM('library','cafe','forest','pink') NOT NULL DEFAULT 'pink',
  decor      TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_pr_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE private_room_members (
  room_id   INT NOT NULL,
  user_id   INT NOT NULL,
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (room_id, user_id),
  INDEX idx_prm_user (user_id),
  CONSTRAINT fk_prm_room FOREIGN KEY (room_id) REFERENCES private_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_prm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Site settings (admin): e.g. the announcement shown on every dashboard
-- ---------------------------------------------------------------------
CREATE TABLE settings (
  skey   VARCHAR(40) PRIMARY KEY,
  svalue TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO settings (skey, svalue) VALUES ('announcement', '');

-- ---------------------------------------------------------------------
-- Brute-force protection: failed logins / sign-ups per IP (auto-cleaned after 24 h)
-- ---------------------------------------------------------------------
CREATE TABLE login_attempts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  ip         VARCHAR(45) NOT NULL,
  kind       VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_la (ip, kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
