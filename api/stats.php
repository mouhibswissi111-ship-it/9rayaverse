<?php
// Public, anonymous numbers for the landing page (no personal data).
require __DIR__ . '/_bootstrap.php';

$count = function (string $sql, array $args = []): int {
    $st = db()->prepare($sql);
    $st->execute($args);
    return (int) $st->fetchColumn();
};

respond([
    'students'      => $count('SELECT COUNT(*) FROM users WHERE banned = 0'),
    'seconds_today' => $count("SELECT COALESCE(SUM(credited_seconds), 0) FROM focus_sessions WHERE status IN ('completed','partial') AND ended_at >= ?", [period_start('day')]),
    'seconds_total' => $count("SELECT COALESCE(SUM(credited_seconds), 0) FROM focus_sessions WHERE status IN ('completed','partial')"),
    'studying_now'  => $count("SELECT COUNT(*) FROM focus_sessions WHERE status = 'active' AND last_ping_at >= ?", [date('Y-m-d H:i:s', time() - 60)]),
    'wilayas'       => $count("SELECT COUNT(DISTINCT wilaya) FROM users WHERE wilaya <> ''"),
]);
