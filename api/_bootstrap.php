<?php
// Shared setup for every API endpoint: DB, sessions, JSON helpers, uploads, game rules.
// User-facing messages are in Tunisian Derja.
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

ini_set('display_errors', '0');
date_default_timezone_set(APP_TIMEZONE);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

set_error_handler(function (int $no, string $msg, string $file, int $line): bool {
    if (!(error_reporting() & $no)) return false;
    throw new ErrorException($msg, 0, $no, $file, $line);
});
set_exception_handler(function (Throwable $e): void {
    http_response_code(500);
    error_log('[9rayaverse] ' . $e);
    if (defined('APP_DEBUG') && APP_DEBUG) {
        $msg = $e instanceof PDOException ? 'Mochkla fel base de données: ' . $e->getMessage() : 'Mochkla fel serveur: ' . $e->getMessage();
    } else {
        // Public server: never leak SQL or file paths to visitors (details go to the server error log).
        $msg = 'Sar mochkel fel serveur. 3awed ba3d chwaya.';
    }
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
});

$https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
ini_set('session.use_strict_mode', '1');
session_name('RVSESSID');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 30,
    'path'     => '/',
    'secure'   => $https,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// State-changing calls are POSTs; with SameSite=Lax cookies this blocks CSRF.
// Read-only file downloads (api/file.php) opt in to GET.
if (!defined('ALLOW_GET') && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    fail('Esta3mel POST lel API.', 405);
}

const UPLOAD_DIR = __DIR__ . '/../uploads';
const WILAYAS = [
    'Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte', 'Béja',
    'Jendouba', 'Le Kef', 'Siliana', 'Sousse', 'Monastir', 'Mahdia', 'Sfax', 'Kairouan',
    'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
];

// ---------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
        // Keep MySQL's clock in the same timezone as PHP.
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }
    return $pdo;
}

function respond(array $data = []): void
{
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function input(): array
{
    static $in = null;
    if ($in === null) {
        $json = json_decode(file_get_contents('php://input') ?: '', true);
        $in = array_merge($_GET, $_POST, is_array($json) ? $json : []);
    }
    return $in;
}

function param(string $key, $default = null)
{
    return input()[$key] ?? $default;
}

function str_param(string $key, int $max = 255): string
{
    $value = trim((string) param($key, ''));
    return function_exists('mb_substr') ? mb_substr($value, 0, $max) : substr($value, 0, $max);
}

function int_param(string $key, int $default = 0): int
{
    $value = param($key, $default);
    return is_numeric($value) ? (int) $value : $default;
}

/** Checkbox-style flag: true for true/1/"1"/"true"/"on". */
function bool_param(string $key): bool
{
    return in_array(param($key), [true, 1, '1', 'true', 'on'], true);
}

/** @param array<string, callable> $handlers */
function route(array $handlers): void
{
    $action = (string) param('action', '');
    if (!isset($handlers[$action])) fail('Action mouch ma3roufa: ' . $action, 404);
    $handlers[$action]();
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

function today(): string
{
    return date('Y-m-d');
}

function period_start(string $period): string
{
    switch ($period) {
        case 'day':   return date('Y-m-d 00:00:00');
        case 'week':  return date('Y-m-d 00:00:00', strtotime('monday this week'));
        case 'month': return date('Y-m-01 00:00:00');
        default:      return '1970-01-01 00:00:00';
    }
}

// ---------------------------------------------------------------------
// Brute-force protection (per IP address)
// ---------------------------------------------------------------------

const MAX_LOGIN_FAILS = 10;        // per 15 minutes
const MAX_REGISTERS_PER_HOUR = 6;

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

function throttle(string $kind, int $max, int $windowSeconds, string $message): void
{
    db()->prepare('DELETE FROM login_attempts WHERE created_at < ?')->execute([date('Y-m-d H:i:s', time() - 86400)]);
    $st = db()->prepare('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND kind = ? AND created_at >= ?');
    $st->execute([client_ip(), $kind, date('Y-m-d H:i:s', time() - $windowSeconds)]);
    if ((int) $st->fetchColumn() >= $max) fail($message, 429);
}

function record_attempt(string $kind): void
{
    db()->prepare('INSERT INTO login_attempts (ip, kind, created_at) VALUES (?, ?, ?)')->execute([client_ip(), $kind, now()]);
}

function clear_attempts(string $kind): void
{
    db()->prepare('DELETE FROM login_attempts WHERE ip = ? AND kind = ?')->execute([client_ip(), $kind]);
}

function setting(string $key): string
{
    $st = db()->prepare('SELECT svalue FROM settings WHERE skey = ?');
    $st->execute([$key]);
    return (string) ($st->fetchColumn() ?: '');
}

// ---------------------------------------------------------------------
// Users & permissions
// ---------------------------------------------------------------------

function fetch_user(int $uid): ?array
{
    $st = db()->prepare('SELECT * FROM users WHERE id = ?');
    $st->execute([$uid]);
    return $st->fetch() ?: null;
}

function require_user(): array
{
    $uid = (int) ($_SESSION['uid'] ?? 0);
    $user = $uid > 0 ? fetch_user($uid) : null;
    if (!$user) {
        $_SESSION = [];
        fail('Lezmek todkhol l\'compte mte3ek 9bal.', 401);
    }
    if ((int) $user['banned'] === 1) {
        $_SESSION = [];
        fail('Compte mte3ek mbloqui. Kallem l\'admin.', 403);
    }
    return $user;
}

function require_admin(): array
{
    $user = require_user();
    if ($user['role'] !== 'admin') fail('Ma 3andekch l\'7a9 tod5ol lel page hedhi.', 403);
    return $user;
}

function is_group_member(int $gid, int $uid): bool
{
    $st = db()->prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?');
    $st->execute([$gid, $uid]);
    return (bool) $st->fetch();
}

function photo_url(?string $file): ?string
{
    return $file ? 'uploads/avatars/' . $file : null;
}

// Chibi character ("perso"): every field is an index into the option lists in assets/js/avatar.js.
const LOOK_LIMITS = ['skin' => 4, 'hair' => 5, 'hairColor' => 6, 'eyes' => 2, 'glasses' => 2];
const DEFAULT_LOOK = ['skin' => 1, 'hair' => 0, 'hairColor' => 0, 'eyes' => 0, 'glasses' => 0, 'blush' => true, 'mode' => 'perso'];

/** Validates a look array (from JSON or the client) and fills missing fields with defaults. */
function clean_look($raw): array
{
    $in = is_string($raw) ? json_decode($raw, true) : $raw;
    $look = DEFAULT_LOOK;
    if (!is_array($in)) return $look;
    foreach (LOOK_LIMITS as $key => $max) {
        if (isset($in[$key]) && is_numeric($in[$key])) $look[$key] = max(0, min($max, (int) $in[$key]));
    }
    if (isset($in['blush'])) $look['blush'] = (bool) $in['blush'];
    if (isset($in['mode']) && in_array($in['mode'], ['perso', 'photo'], true)) $look['mode'] = $in['mode'];
    return $look;
}

// ---------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------

/** Detects the real type from the file content (never trust the browser's MIME). */
function sniff_type(string $path): string
{
    $head = (string) file_get_contents($path, false, null, 0, 8);
    if (strncmp($head, '%PDF-', 5) === 0) return 'pdf';
    $info = @getimagesize($path);
    if (!$info) return 'unknown';
    return [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp', IMAGETYPE_GIF => 'gif'][$info[2]] ?? 'unknown';
}

/**
 * Validates and stores an uploaded file under uploads/$dir with a random name.
 * @param string[] $allowed extensions allowed after sniffing (pdf, jpg, png, webp, gif)
 * @return array{0:string,1:string,2:int} [stored name, original name, size]
 */
function save_upload(string $field, array $allowed, int $maxMb, string $dir, bool $required = true): ?array
{
    $f = $_FILES[$field] ?? null;
    if (!$f || !is_array($f) || $f['error'] === UPLOAD_ERR_NO_FILE) {
        if (!$required) return null;
        fail(empty($_POST) && empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0
            ? 'L\'fichier kbir barcha 3al serveur (post_max_size).'
            : 'Ma khtartech fichier.');
    }
    if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) fail('L\'fichier kbir barcha.');
    if ($f['error'] !== UPLOAD_ERR_OK) fail('Mochkla fel upload (code ' . $f['error'] . ').');
    if ($f['size'] > $maxMb * 1024 * 1024) fail("L'fichier kbir barcha (max $maxMb Mo).");

    $ext = sniff_type($f['tmp_name']);
    if (!in_array($ext, $allowed, true)) fail('Type mta3 l\'fichier mouch mesmou7 (' . implode(', ', $allowed) . ' bark).');

    $name = bin2hex(random_bytes(12)) . '.' . $ext;
    $folder = UPLOAD_DIR . '/' . $dir;
    if (!is_dir($folder)) mkdir($folder, 0775, true);
    if (!move_uploaded_file($f['tmp_name'], "$folder/$name")) fail('Ma najamtech nsajjel l\'fichier.');
    return [$name, basename((string) $f['name']), (int) $f['size']];
}

function delete_upload(string $dir, ?string $name): void
{
    if (!$name || !preg_match('/^[a-f0-9]{24}\.[a-z]{3,4}$/', $name)) return;
    $path = UPLOAD_DIR . "/$dir/$name";
    if (is_file($path)) unlink($path);
}

/** Deletes a course file only when no mission points to it any more. */
function delete_course_file_if_unused(string $file): void
{
    $st = db()->prepare('SELECT COUNT(*) FROM missions WHERE file_name = ?');
    $st->execute([$file]);
    if ((int) $st->fetchColumn() === 0) delete_upload('courses', $file);
}

// ---------------------------------------------------------------------
// Game rules (RPG layer)
// ---------------------------------------------------------------------

function xp_to_next(int $level): int
{
    return 50 + 50 * $level;
}

function monster_count(): int
{
    static $n = null;
    return $n ??= (int) db()->query('SELECT COUNT(*) FROM monsters')->fetchColumn();
}

function fetch_monster(int $id): array
{
    $st = db()->prepare('SELECT * FROM monsters WHERE id = ?');
    $st->execute([$id]);
    $m = $st->fetch();
    if (!$m) throw new RuntimeException('Table monsters fergha. 3awed importi database.sql.');
    return $m;
}

/** Each full cycle through the monster list makes them 50% tougher (and richer). */
function monster_multiplier(int $defeated): float
{
    return 1 + 0.5 * intdiv($defeated, monster_count());
}

function effective_streak(array $u): int
{
    $last = $u['last_study_date'];
    if ($last === today() || $last === date('Y-m-d', strtotime('-1 day'))) return (int) $u['streak'];
    return 0;
}

function public_user(array $u): array
{
    $m = fetch_monster((int) $u['monster_id']);
    $mult = monster_multiplier((int) $u['monsters_defeated']);
    return [
        'id'           => (int) $u['id'],
        'username'     => $u['username'],
        'email'        => $u['email'],
        'role'         => $u['role'],
        'photo'        => photo_url($u['photo']),
        'bio'          => $u['bio'],
        'wilaya'       => $u['wilaya'],
        'avatar_color' => $u['avatar_color'],
        'hat'          => $u['hat'],
        'look'         => clean_look($u['look']),
        'level'        => (int) $u['level'],
        'xp'           => (int) $u['xp'],
        'xp_next'      => xp_to_next((int) $u['level']),
        'hp'           => (int) $u['hp'],
        'max_hp'       => (int) $u['max_hp'],
        'gold'         => (int) $u['gold'],
        'streak'       => effective_streak($u),
        'best_streak'  => (int) $u['best_streak'],
        'monster'      => [
            'name'        => $m['name'],
            'emoji'       => $m['emoji'],
            'hp'          => (int) $u['monster_hp'],
            'max_hp'      => (int) round($m['max_hp'] * $mult),
            'xp_reward'   => (int) round($m['xp_reward'] * $mult),
            'gold_reward' => (int) round($m['gold_reward'] * $mult),
            'defeated'    => (int) $u['monsters_defeated'],
        ],
    ];
}

/**
 * Adds XP/gold and deals damage to the user's monster. Handles monster kills
 * (bonus loot, next monster) and level-ups. Returns a list of events for the UI.
 */
function grant_rewards(int $uid, int $xp, int $gold, int $damage): array
{
    $u = fetch_user($uid);
    $events = [];
    $level = (int) $u['level'];
    $curXp = (int) $u['xp'] + $xp;
    $curGold = (int) $u['gold'] + $gold;
    $hp = (int) $u['hp'];
    $maxHp = (int) $u['max_hp'];
    $monsterId = (int) $u['monster_id'];
    $monsterHp = (int) $u['monster_hp'] - $damage;
    $defeated = (int) $u['monsters_defeated'];

    if ($damage > 0) $events[] = ['type' => 'damage', 'amount' => $damage];

    $guard = 0;
    while ($monsterHp <= 0 && $guard++ < 20) {
        $m = fetch_monster($monsterId);
        $mult = monster_multiplier($defeated);
        $bonusXp = (int) round($m['xp_reward'] * $mult);
        $bonusGold = (int) round($m['gold_reward'] * $mult);
        $curXp += $bonusXp;
        $curGold += $bonusGold;
        $events[] = ['type' => 'monster_defeated', 'name' => $m['name'], 'emoji' => $m['emoji'], 'xp' => $bonusXp, 'gold' => $bonusGold];
        $defeated++;
        $monsterId = $monsterId % monster_count() + 1;
        $next = fetch_monster($monsterId);
        $monsterHp += (int) round($next['max_hp'] * monster_multiplier($defeated));
    }

    while ($curXp >= xp_to_next($level)) {
        $curXp -= xp_to_next($level);
        $level++;
        $maxHp += 5;
        $hp = $maxHp;
        $events[] = ['type' => 'level_up', 'level' => $level];
    }

    db()->prepare(
        'UPDATE users SET level = ?, xp = ?, gold = ?, hp = ?, max_hp = ?,
                monster_id = ?, monster_hp = ?, monsters_defeated = ? WHERE id = ?'
    )->execute([$level, $curXp, $curGold, $hp, $maxHp, $monsterId, $monsterHp, $defeated, $uid]);

    return $events;
}

/** The monster hits back. At 0 HP the user faints: loses half their gold and this level's XP. */
function hurt_user(int $uid, int $amount, string $reason): array
{
    $u = fetch_user($uid);
    $hp = (int) $u['hp'] - $amount;
    $events = [['type' => 'hurt', 'amount' => $amount, 'reason' => $reason]];
    if ($hp <= 0) {
        $lostGold = intdiv((int) $u['gold'], 2);
        db()->prepare('UPDATE users SET hp = max_hp, gold = gold - ?, xp = 0 WHERE id = ?')->execute([$lostGold, $uid]);
        $events[] = ['type' => 'fainted', 'gold_lost' => $lostGold];
    } else {
        db()->prepare('UPDATE users SET hp = ? WHERE id = ?')->execute([$hp, $uid]);
    }
    return $events;
}

function touch_streak(int $uid): void
{
    $u = fetch_user($uid);
    if ($u['last_study_date'] === today()) return;
    $streak = $u['last_study_date'] === date('Y-m-d', strtotime('-1 day')) ? (int) $u['streak'] + 1 : 1;
    db()->prepare('UPDATE users SET streak = ?, best_streak = GREATEST(best_streak, ?), last_study_date = ? WHERE id = ?')
        ->execute([$streak, $streak, today(), $uid]);
}

// ---------------------------------------------------------------------
// Missions (course PDFs with a study-time target)
// ---------------------------------------------------------------------

function mission_rewards(int $targetMinutes): array
{
    return [30 + intdiv($targetMinutes, 4), 10 + intdiv($targetMinutes, 10)]; // [xp, gold]
}

/** Adds studied seconds to a mission; completes it (with loot) once the target is reached. */
function add_mission_progress(int $missionId, int $uid, int $seconds): array
{
    db()->prepare("UPDATE missions SET progress_seconds = progress_seconds + ? WHERE id = ? AND user_id = ? AND status = 'active'")
        ->execute([$seconds, $missionId, $uid]);
    $st = db()->prepare("SELECT * FROM missions WHERE id = ? AND user_id = ?");
    $st->execute([$missionId, $uid]);
    $m = $st->fetch();
    if (!$m || $m['status'] !== 'active' || (int) $m['progress_seconds'] < (int) $m['target_minutes'] * 60) return [];

    $done = db()->prepare("UPDATE missions SET status = 'done', completed_at = ? WHERE id = ? AND status = 'active'");
    $done->execute([now(), $missionId]);
    if ($done->rowCount() !== 1) return [];
    [$xp, $gold] = mission_rewards((int) $m['target_minutes']);
    return array_merge(
        [['type' => 'mission_done', 'title' => $m['title'], 'xp' => $xp, 'gold' => $gold]],
        grant_rewards($uid, $xp, $gold, 0)
    );
}

// ---------------------------------------------------------------------
// Tahadiyet (group challenges)
// ---------------------------------------------------------------------

const CHALLENGE_WIN_XP = 100;
const CHALLENGE_WIN_GOLD = 50;

function challenge_score(array $c, int $uid): int
{
    if ($c['metric'] === 'missions') {
        $st = db()->prepare("SELECT COUNT(*) FROM missions WHERE user_id = ? AND status = 'done' AND completed_at BETWEEN ? AND ?");
    } else {
        $st = db()->prepare(
            "SELECT COALESCE(SUM(credited_seconds), 0) FROM focus_sessions
             WHERE user_id = ? AND status IN ('completed','partial') AND ended_at BETWEEN ? AND ?"
        );
    }
    $st->execute([$uid, $c['starts_at'], $c['ends_at']]);
    return (int) $st->fetchColumn();
}

/** Closes a finished challenge: ranks players, picks winners/losers, pays the winners. Safe to call repeatedly. */
function finalize_challenge(array $c): void
{
    $lock = db()->prepare("UPDATE group_challenges SET status = 'awaiting_dare' WHERE id = ? AND status = 'running' AND ends_at <= ?");
    $lock->execute([$c['id'], now()]);
    if ($lock->rowCount() !== 1) return;

    $st = db()->prepare('SELECT user_id FROM challenge_participants WHERE challenge_id = ?');
    $st->execute([$c['id']]);
    $uids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    if (count($uids) < 2) {
        db()->prepare("UPDATE group_challenges SET status = 'cancelled' WHERE id = ?")->execute([$c['id']]);
        return;
    }

    $scores = [];
    foreach ($uids as $uid) $scores[$uid] = challenge_score($c, $uid);
    arsort($scores);
    $max = max($scores);
    $min = min($scores);

    $upd = db()->prepare('UPDATE challenge_participants SET score = ?, rank_pos = ?, outcome = ? WHERE challenge_id = ? AND user_id = ?');
    $rank = 0;
    $prev = null;
    $i = 0;
    foreach ($scores as $uid => $score) {
        $i++;
        if ($score !== $prev) { $rank = $i; $prev = $score; }
        $outcome = $max === $min ? 'middle' : ($score === $max ? 'winner' : ($score === $min ? 'loser' : 'middle'));
        $upd->execute([$score, $rank, $outcome, $c['id'], $uid]);
        if ($outcome === 'winner') grant_rewards($uid, CHALLENGE_WIN_XP, CHALLENGE_WIN_GOLD, 0);
    }

    // Everybody tied: nobody wins, nobody pays a dare.
    if ($max === $min) db()->prepare("UPDATE group_challenges SET status = 'closed' WHERE id = ?")->execute([$c['id']]);
}

function finalize_due_challenges(): void
{
    $st = db()->prepare("SELECT * FROM group_challenges WHERE status = 'running' AND ends_at <= ? LIMIT 50");
    $st->execute([now()]);
    foreach ($st->fetchAll() as $c) finalize_challenge($c);
}

/** Things waiting on this user: dares to choose (winner) or to do (loser). */
function user_alerts(int $uid): array
{
    $st = db()->prepare(
        "SELECT c.id, c.group_id, c.title, c.status, c.dare, p.outcome, g.name AS group_name
         FROM challenge_participants p
         JOIN group_challenges c ON c.id = p.challenge_id
         JOIN study_groups g ON g.id = c.group_id
         WHERE p.user_id = ? AND (
               (c.status = 'awaiting_dare' AND p.outcome = 'winner')
            OR (c.status = 'dare_pending' AND p.outcome = 'loser' AND p.dare_done = 0)
            OR (c.status = 'awaiting_dare' AND p.outcome = 'loser'))
         ORDER BY c.ends_at DESC LIMIT 10"
    );
    $st->execute([$uid]);
    return $st->fetchAll();
}

// ---------------------------------------------------------------------
// Study statistics
// ---------------------------------------------------------------------

function studied_since(int $uid, string $since): int
{
    $st = db()->prepare(
        "SELECT COALESCE(SUM(credited_seconds), 0) FROM focus_sessions
         WHERE user_id = ? AND status IN ('completed','partial') AND ended_at >= ?"
    );
    $st->execute([$uid, $since]);
    return (int) $st->fetchColumn();
}

function study_stats(int $uid): array
{
    $st = db()->prepare(
        "SELECT DATE(ended_at) AS d, SUM(credited_seconds) AS s FROM focus_sessions
         WHERE user_id = ? AND status IN ('completed','partial') AND ended_at >= ?
         GROUP BY DATE(ended_at)"
    );
    $st->execute([$uid, date('Y-m-d 00:00:00', strtotime('-6 days'))]);
    $byDay = [];
    foreach ($st->fetchAll() as $row) $byDay[$row['d']] = (int) $row['s'];

    $last7 = [];
    for ($i = 6; $i >= 0; $i--) {
        $d = date('Y-m-d', strtotime("-$i days"));
        $last7[] = ['date' => $d, 'weekday' => (int) date('w', strtotime($d)), 'seconds' => $byDay[$d] ?? 0];
    }

    $cnt = db()->prepare("SELECT COUNT(*) FROM focus_sessions WHERE user_id = ? AND status = 'completed'");
    $cnt->execute([$uid]);

    return [
        'today'    => studied_since($uid, period_start('day')),
        'week'     => studied_since($uid, period_start('week')),
        'total'    => studied_since($uid, period_start('all')),
        'sessions' => (int) $cnt->fetchColumn(),
        'last7'    => $last7,
    ];
}

function profile(int $uid): array
{
    return ['user' => public_user(fetch_user($uid)), 'stats' => study_stats($uid)];
}

// ---------------------------------------------------------------------
// WebSocket auth token (HMAC-signed, verified by ws-server/server.js)
// ---------------------------------------------------------------------

function b64url(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function sign_ws_token(array $payload): string
{
    $body = b64url(json_encode($payload, JSON_UNESCAPED_UNICODE));
    return $body . '.' . b64url(hash_hmac('sha256', $body, WS_SECRET, true));
}
