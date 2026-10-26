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
