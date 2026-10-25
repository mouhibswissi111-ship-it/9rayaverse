<?php
// L'Admin général: site stats, user moderation, groups, uploaded courses, announcement.
require __DIR__ . '/_bootstrap.php';

$admin = require_admin();
$adminId = (int) $admin['id'];

function count_of(string $sql, array $args = []): int
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return (int) $st->fetchColumn();
}

route([
    'stats' => function (): void {
        $today = period_start('day');
        $bytes = 0;
        foreach (glob(UPLOAD_DIR . '/courses/*') ?: [] as $f) $bytes += (int) filesize($f);
        respond(['stats' => [
            'users'          => count_of('SELECT COUNT(*) FROM users'),
            'new_today'      => count_of('SELECT COUNT(*) FROM users WHERE created_at >= ?', [$today]),
            'banned'         => count_of('SELECT COUNT(*) FROM users WHERE banned = 1'),
            'active_today'   => count_of("SELECT COUNT(DISTINCT user_id) FROM focus_sessions WHERE started_at >= ?", [$today]),
            'studying_now'   => count_of("SELECT COUNT(*) FROM focus_sessions WHERE status = 'active' AND last_ping_at >= ?", [date('Y-m-d H:i:s', time() - 60)]),
            'seconds_today'  => count_of("SELECT COALESCE(SUM(credited_seconds), 0) FROM focus_sessions WHERE status IN ('completed','partial') AND ended_at >= ?", [$today]),
            'seconds_total'  => count_of("SELECT COALESCE(SUM(credited_seconds), 0) FROM focus_sessions WHERE status IN ('completed','partial')"),
            'groups'         => count_of('SELECT COUNT(*) FROM study_groups'),
            'missions'       => count_of('SELECT COUNT(*) FROM missions'),
            'storage_mb'     => round($bytes / 1048576, 1),
            'challenges_running' => count_of("SELECT COUNT(*) FROM group_challenges WHERE status = 'running'"),
        ], 'announcement' => setting('announcement')]);
    },

    'users' => function (): void {
        $q = '%' . str_param('q', 60) . '%';
        $st = db()->prepare(
            "SELECT u.id, u.username, u.email, u.role, u.banned, u.level, u.wilaya, u.photo, u.avatar_color, u.hat, u.created_at,
                    (SELECT COALESCE(SUM(f.credited_seconds), 0) FROM focus_sessions f
                     WHERE f.user_id = u.id AND f.status IN ('completed','partial')) AS total_seconds
             FROM users u WHERE u.username LIKE ? OR u.email LIKE ?
             ORDER BY u.id DESC LIMIT 200"
        );
        $st->execute([$q, $q]);
        $rows = $st->fetchAll();
        foreach ($rows as &$r) {
            $r['photo'] = photo_url($r['photo']);
            $r['total_seconds'] = (int) $r['total_seconds'];
        }
        unset($r);
        respond(['users' => $rows]);
    },

    'user_action' => function () use ($adminId): void {
        $id = int_param('id');
        $op = (string) param('op', '');
        $target = fetch_user($id);
        if (!$target) fail('Utilisateur mouch mawjoud.');
        if ($id === $adminId && in_array($op, ['ban', 'remove_admin', 'delete'], true)) fail('Ma tnajjemch ta3mel hedha 3la rou7ek 😅');

        switch ($op) {
            case 'ban':          db()->prepare('UPDATE users SET banned = 1 WHERE id = ?')->execute([$id]); break;
            case 'unban':        db()->prepare('UPDATE users SET banned = 0 WHERE id = ?')->execute([$id]); break;
            case 'make_admin':   db()->prepare("UPDATE users SET role = 'admin' WHERE id = ?")->execute([$id]); break;
            case 'remove_admin': db()->prepare("UPDATE users SET role = 'user' WHERE id = ?")->execute([$id]); break;
            case 'reset_hp':     db()->prepare('UPDATE users SET hp = max_hp WHERE id = ?')->execute([$id]); break;
            case 'delete':
                $files = db()->prepare('SELECT file_name FROM missions WHERE user_id = ?');
                $files->execute([$id]);
                $courseFiles = $files->fetchAll(PDO::FETCH_COLUMN);
                $proofs = db()->prepare('SELECT proof_file FROM challenge_participants WHERE user_id = ? AND proof_file IS NOT NULL');
                $proofs->execute([$id]);
                $proofFiles = $proofs->fetchAll(PDO::FETCH_COLUMN);
                // Groups they own go to the next member (or disappear with them when empty).
                $owned = db()->prepare('SELECT id FROM study_groups WHERE owner_id = ?');
                $owned->execute([$id]);
                foreach ($owned->fetchAll(PDO::FETCH_COLUMN) as $gid) {
                    $next = db()->prepare('SELECT user_id FROM group_members WHERE group_id = ? AND user_id <> ? ORDER BY joined_at LIMIT 1');
                    $next->execute([$gid, $id]);
                    $heir = (int) $next->fetchColumn();
                    if ($heir) db()->prepare('UPDATE study_groups SET owner_id = ? WHERE id = ?')->execute([$heir, $gid]);
                }
                db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
                foreach ($courseFiles as $f) delete_course_file_if_unused($f);
                foreach ($proofFiles as $f) delete_upload('proofs', $f);
                delete_upload('avatars', $target['photo']);
                break;
            default:
                fail('Op mouch ma3roufa.');
        }
        respond(['message' => '✅ Tsajjel.']);
    },

    'groups' => function (): void {
        $st = db()->query(
            'SELECT g.id, g.name, g.invite_code, g.is_public, g.created_at, u.username AS owner,
                    (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
             FROM study_groups g JOIN users u ON u.id = g.owner_id ORDER BY g.id DESC LIMIT 200'
        );
        respond(['groups' => $st->fetchAll()]);
    },

    'delete_group' => function (): void {
        db()->prepare('DELETE FROM study_groups WHERE id = ?')->execute([int_param('id')]);
        respond(['message' => '🗑️ L\'jme3a tfasset.']);
    },

    'missions' => function (): void {
        $st = db()->query(
            'SELECT m.id, m.title, m.original_name, m.size, m.status, m.created_at, u.username AS owner, g.name AS group_name
             FROM missions m JOIN users u ON u.id = m.user_id LEFT JOIN study_groups g ON g.id = m.group_id
             ORDER BY m.id DESC LIMIT 200'
        );
        $rows = $st->fetchAll();
        foreach ($rows as &$r) $r['url'] = 'api/file.php?type=mission&id=' . (int) $r['id'];
        unset($r);
        respond(['missions' => $rows]);
    },

    'delete_mission' => function (): void {
        $st = db()->prepare('SELECT file_name FROM missions WHERE id = ?');
        $st->execute([int_param('id')]);
        $file = $st->fetchColumn();
        if (!$file) fail('Mission mouch mawjouda.');
        db()->prepare('DELETE FROM missions WHERE id = ?')->execute([int_param('id')]);
        delete_course_file_if_unused((string) $file);
        respond(['message' => '🗑️ L\'cours tfasse5.']);
    },

    'announcement' => function (): void {
        $text = str_param('text', 300);
        db()->prepare("INSERT INTO settings (skey, svalue) VALUES ('announcement', ?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)")
            ->execute([$text]);
        respond(['message' => $text === '' ? 'L\'i3lan tna77a.' : '📢 L\'i3lan tsajjel w ywalli yban lel kol.']);
    },
]);
