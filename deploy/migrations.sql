-- =====================================================================
--  9rayaverse — upgrades an existing database to the latest version
--  without deleting data. Safe to run many times (MariaDB 10.3+).
--    XAMPP:   C:\xampp\mysql\bin\mysql.exe -u root rayaverse < deploy\migrations.sql
--    Server:  deploy/update.sh runs it automatically
-- =====================================================================
SET NAMES utf8mb4;

-- v2.1: brute-force protection
CREATE TABLE IF NOT EXISTS login_attempts (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  ip         VARCHAR(45) NOT NULL,
  kind       VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_la (ip, kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v2.2: pause / resume for flexible focus sessions
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS paused_at DATETIME NULL AFTER last_ping_at;
ALTER TABLE focus_sessions ADD COLUMN IF NOT EXISTS paused_seconds INT NOT NULL DEFAULT 0 AFTER paused_at;

-- v3: Bac plan, lycée, flashcards, weekly challenge, notifications, new shop items
ALTER TABLE users ADD COLUMN IF NOT EXISTS school VARCHAR(60) NOT NULL DEFAULT '' AFTER wilaya;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bac_section VARCHAR(20) NOT NULL DEFAULT '' AFTER school;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_goal_hours INT NOT NULL DEFAULT 10 AFTER bac_section;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_hour TINYINT NULL AFTER weekly_goal_hours;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminder_date DATE NULL AFTER reminder_hour;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_weekly_notif DATE NULL AFTER last_reminder_date;
ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_school (school);
ALTER TABLE users ADD COLUMN IF NOT EXISTS exam_date DATE NULL AFTER bac_section;

CREATE TABLE IF NOT EXISTS plan_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  subject    VARCHAR(40)  NOT NULL,
  title      VARCHAR(120) NOT NULL,
  done       TINYINT(1) NOT NULL DEFAULT 0,
  sort       INT NOT NULL DEFAULT 0,
  done_at    DATETIME NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_plan_user (user_id, sort),
  CONSTRAINT fk_plan_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS decks (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  group_id   INT NULL,
  title      VARCHAR(80) NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_decks_user (user_id),
  INDEX idx_decks_group (group_id),
  CONSTRAINT fk_decks_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_decks_group FOREIGN KEY (group_id) REFERENCES study_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cards (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  deck_id    INT NOT NULL,
  front      VARCHAR(300) NOT NULL,
  back       VARCHAR(300) NOT NULL,
  box        TINYINT NOT NULL DEFAULT 1,
  due_date   DATE NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_cards_deck (deck_id, due_date),
  CONSTRAINT fk_cards_deck FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_counters (
  user_id INT NOT NULL,
  day     DATE NOT NULL,
  kind    VARCHAR(20) NOT NULL,
  n       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind),
  CONSTRAINT fk_dc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_claims (
  user_id    INT NOT NULL,
  week_start DATE NOT NULL,
  claimed_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, week_start),
  CONSTRAINT fk_wc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL UNIQUE,
  endpoint      TEXT NOT NULL,
  p256dh        VARCHAR(120) NOT NULL,
  auth          VARCHAR(40) NOT NULL,
  created_at    DATETIME NOT NULL,
  INDEX idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_queue (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  kind       VARCHAR(20) NOT NULL,
  title      VARCHAR(100) NOT NULL,
  body       VARCHAR(200) NOT NULL,
  url        VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  sent_at    DATETIME NULL,
  INDEX idx_pq_pending (sent_at, id),
  INDEX idx_pq_user (user_id, kind, created_at),
  CONSTRAINT fk_pq_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (skey, svalue) VALUES ('bac_date', '2027-06-02');

INSERT IGNORE INTO shop_items (item_key, name, type, value, price, sort) VALUES
  ('hat_bow',       'Fiounga',                'hat',    '🎀',      30,  17),
  ('hat_headphones','Casque lo-fi',           'hat',    '🎧',      45,  18),
  ('hat_sun',       'Chapeau l''b7ar',        'hat',    '👒',      50,  19),
  ('hat_sunflower', 'Nawwar chams',           'hat',    '🌻',      35,  30),
  ('hat_clover',    'Zahr (7a9ba)',           'hat',    '🍀',      70,  31),
  ('hat_star',      'Najma l''Bac',           'hat',    '⭐',      150, 32),
  ('hat_rainbow',   'Arc-en-ciel',           'hat',    '🌈',      180, 33),
  ('hat_unicorn',   'Licorne (légendaire)',   'hat',    '🦄',      400, 34),
  ('color_peach',   'Khoukh',                 'color',  '#fb923c', 15,  40),
  ('color_olive',   'Zitouni',                'color',  '#84cc16', 20,  41),
  ('color_sea',     'B7ar Hammamet',          'color',  '#0ea5e9', 20,  42),
  ('color_night',   'Lil (kh7al)',            'color',  '#334155', 30,  43);
