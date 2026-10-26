<?php
// Focus sessions: start, active (resume), ping (heartbeat), finish, fail, history
require __DIR__ . '/_bootstrap.php';

// A strict session fails if the browser stops sending heartbeats for this long
// (closed tab, switched app, sleeping laptop). Pings are sent every 20 s.
const PING_GRACE_SECONDS = 45;
// Small allowance for network delay when the timer reaches zero.
const FINISH_TOLERANCE = 15;

function active_session(int $uid): ?array
{
    $st = db()->prepare(
        "SELECT f.*, m.title AS mission_title FROM focus_sessions f
         LEFT JOIN missions m ON m.id = f.mission_id
         WHERE f.user_id = ? AND f.status = 'active' ORDER BY f.id DESC LIMIT 1"
    );
    $st->execute([$uid]);
    return $st->fetch() ?: null;
}

/** Seconds actually studied so far: wall time since start minus pauses (including a pause in progress). */
function studied_seconds(array $s): int
{
    $paused = (int) $s['paused_seconds'] + ($s['paused_at'] ? time() - strtotime($s['paused_at']) : 0);
    return max(0, time() - strtotime($s['started_at']) - $paused);
}

function session_view(array $s): array
{
    return [
        'id'              => (int) $s['id'],
        'subject'         => $s['subject'],
        'planned_minutes' => (int) $s['planned_minutes'],
        'strict'          => (bool) $s['strict'],
        'paused'          => $s['paused_at'] !== null,
        'remaining'       => (int) $s['planned_minutes'] * 60 - studied_seconds($s),
        'mission'         => $s['mission_id'] ? ['id' => (int) $s['mission_id'], 'title' => $s['mission_title']] : null,
    ];
}

function heartbeat_lost(array $s): bool
{
    return (bool) $s['strict'] && time() - strtotime($s['last_ping_at']) > PING_GRACE_SECONDS;
}

/** Ends a session as failed. Strict sessions cost HP; flexible ones are just abandoned. */
function fail_session(array $s, string $reason): array
{
    $strict = (bool) $s['strict'];
    $st = db()->prepare("UPDATE focus_sessions SET status = ?, ended_at = ? WHERE id = ? AND status = 'active'");
    $st->execute([$strict ? 'failed' : 'abandoned', now(), $s['id']]);
    if ($st->rowCount() !== 1 || !$strict) return [];
    $penalty = 5 + intdiv((int) $s['planned_minutes'], 10);
    return hurt_user((int) $s['user_id'], $penalty, $reason);
}

function respond_failed(int $uid, array $events, string $reason): void
{
    respond(['failed' => true, 'reason' => $reason, 'events' => $events, 'profile' => profile($uid)]);
}

route([
    'start' => function (): void {
        $uid = (int) require_user()['id'];
        $subject = str_param('subject', 60);
        $minutes = int_param('minutes', 25);
        if ($minutes < 1 || $minutes > 180) fail('L\'wa9t lezem bin 1 w 180 da9i9a.');
        $strict = bool_param('strict') ? 1 : 0;

        $missionId = int_param('mission_id');
        if ($missionId > 0) {
            $m = db()->prepare("SELECT title FROM missions WHERE id = ? AND user_id = ? AND status = 'active'");
            $m->execute([$missionId, $uid]);
            $title = $m->fetchColumn();
            if (!$title) fail('L\'mission hedhi mouch mawjouda walla deja kmlet.');
            if ($subject === '') $subject = function_exists('mb_substr') ? mb_substr($title, 0, 60) : substr($title, 0, 60);
        }
        if ($subject === '') $subject = '9raya';

        // Starting over while a strict session runs counts as giving up on it.
        $events = [];
        if ($old = active_session($uid)) $events = fail_session($old, 'Sayyabt session sarma.');

        db()->prepare(
            "INSERT INTO focus_sessions (user_id, mission_id, subject, planned_minutes, strict, status, started_at, last_ping_at)
             VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
        )->execute([$uid, $missionId > 0 ? $missionId : null, $subject, $minutes, $strict, now(), now()]);

        // Friends in my groups get "X started studying" (at most one such notification per 2 hours each).
        if (push_enabled()) {
            $me = fetch_user($uid);
            $friends = db()->prepare(
                'SELECT DISTINCT gm2.user_id FROM group_members gm1 JOIN group_members gm2 ON gm2.group_id = gm1.group_id
                 WHERE gm1.user_id = ? AND gm2.user_id <> ? LIMIT 200'
            );
            $friends->execute([$uid, $uid]);
            foreach ($friends->fetchAll(PDO::FETCH_COLUMN) as $fid) {
                queue_push((int) $fid, 'friend', '📚 ' . $me['username'] . ' bda ya9ra', $subject . ' · ' . $minutes . ' min. Od5ol 9ra m3ah! 💪', '', 120);
            }
        }

        respond(['session' => session_view(active_session($uid)), 'events' => $events]);
    },

    'active' => function (): void {
        $uid = (int) require_user()['id'];
        $s = active_session($uid);
        if (!$s) respond(['session' => null]);
        if (heartbeat_lost($s)) {
            $reason = 'Khrajt mel site wenti fi session sarma.';
            respond_failed($uid, fail_session($s, $reason), $reason);
        }
        respond(['session' => session_view($s)]);
    },

    'ping' => function (): void {
        $uid = (int) require_user()['id'];
        $s = active_session($uid);
        if (!$s) respond(['session' => null]);
        if (heartbeat_lost($s)) {
            $reason = 'L\'connexion t9ass\'et fi session sarma.';
            respond_failed($uid, fail_session($s, $reason), $reason);
        }
        db()->prepare('UPDATE focus_sessions SET last_ping_at = ? WHERE id = ?')->execute([now(), $s['id']]);
        respond(['session' => session_view($s)]);
    },

    'finish' => function (): void {
        $uid = (int) require_user()['id'];
        $s = active_session($uid);
        if (!$s) fail('Ma 3andekch session 9raya ma7loula.');

        if (heartbeat_lost($s)) {
            $reason = 'Khrajt mel site wenti fi session sarma.';
            respond_failed($uid, fail_session($s, $reason), $reason);
        }

        $strict = (bool) $s['strict'];
        $planned = (int) $s['planned_minutes'] * 60;
        $elapsed = studied_seconds($s); // pauses don't count as study time
        $full = $elapsed >= $planned - FINISH_TOLERANCE;

        if ($strict && !$full) {
            $reason = 'Fel mode sarem ma tnajjemch to9ef 9bal l\'wa9t.';
            respond_failed($uid, fail_session($s, $reason), $reason);
        }

        $credited = $full ? $planned : max(0, $elapsed);
        $minutes = intdiv($credited, 60);
        $mult = $strict ? 1.5 : 1.0;
        $xp = $minutes > 0 ? (int) round($minutes * $mult) + ($full ? 5 : 0) : 0;
        $gold = intdiv($minutes, 5) + ($full && $strict ? 3 : 0);
        $damage = (int) round($minutes * $mult);
        $status = $minutes < 1 ? 'abandoned' : ($full ? 'completed' : 'partial');

        // Conditional update makes double-submits harmless.
        $st = db()->prepare(
            "UPDATE focus_sessions SET status = ?, ended_at = ?, credited_seconds = ?, xp_earned = ?, gold_earned = ?, damage = ?
             WHERE id = ? AND status = 'active'"
        );
        $st->execute([$status, now(), $minutes < 1 ? 0 : $credited, $xp, $gold, $damage, $s['id']]);
        if ($st->rowCount() !== 1) fail('L\'session hedhi deja tsakret.');

        $events = [];
        if ($minutes >= 1) {
            touch_streak($uid);
            $events = grant_rewards($uid, $xp, $gold, $damage);
            if ($s['mission_id']) $events = array_merge($events, add_mission_progress((int) $s['mission_id'], $uid, $credited));
        }

        respond([
            'result'  => compact('status', 'minutes', 'xp', 'gold', 'damage', 'strict'),
            'events'  => $events,
            'profile' => profile($uid),
        ]);
    },

    // Flexible sessions only: a pause freezes the timer (strict mode has no pause, like Flip).
    'pause' => function (): void {
        $uid = (int) require_user()['id'];
        $s = active_session($uid);
        if (!$s) fail('Ma 3andekch session 9raya ma7loula.');
        if ((bool) $s['strict']) fail('Fel mode sarem ma fammech pause 😤');
        if ($s['paused_at'] === null) {
            db()->prepare('UPDATE focus_sessions SET paused_at = ? WHERE id = ? AND paused_at IS NULL')->execute([now(), $s['id']]);
        }
        respond(['session' => session_view(active_session($uid))]);
    },

    'resume' => function (): void {
        $uid = (int) require_user()['id'];
        $s = active_session($uid);
        if (!$s) fail('Ma 3andekch session 9raya ma7loula.');
        if ($s['paused_at'] !== null) {
            db()->prepare(
                'UPDATE focus_sessions SET paused_seconds = paused_seconds + GREATEST(0, TIMESTAMPDIFF(SECOND, paused_at, ?)), paused_at = NULL
                 WHERE id = ? AND paused_at IS NOT NULL'
            )->execute([now(), $s['id']]);
        }
        respond(['session' => session_view(active_session($uid))]);
    },

    'fail' => function (): void {
        $uid = (int) require_user()['id'];
        $s = active_session($uid);
        if (!$s) respond(['failed' => true, 'events' => [], 'profile' => profile($uid)]);
        $reason = str_param('reason', 120);
        if ($reason === '') $reason = 'Sallemt.';
        respond_failed($uid, fail_session($s, $reason), $reason);
    },

    'history' => function (): void {
        $uid = (int) require_user()['id'];
        $st = db()->prepare(
            "SELECT id, subject, planned_minutes, strict, status, started_at, credited_seconds, xp_earned, damage
             FROM focus_sessions WHERE user_id = ? AND status <> 'active' ORDER BY id DESC LIMIT 15"
        );
        $st->execute([$uid]);
        respond(['sessions' => $st->fetchAll()]);
    },
]);
