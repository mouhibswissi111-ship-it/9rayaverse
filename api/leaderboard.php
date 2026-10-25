<?php
// Tartib (leaderboards): study time per period — global, per wilaya, or inside one group
require __DIR__ . '/_bootstrap.php';

route([
    'get' => function (): void {
        $uid = (int) require_user()['id'];
        $period = (string) param('period', 'week');
        if (!in_array($period, ['day', 'week', 'month', 'all'], true)) $period = 'week';
        $gid = int_param('group_id');
        $wilaya = str_param('wilaya', 30);

        $sql = "SELECT u.id, u.username, u.level, u.avatar_color, u.hat, u.photo, u.wilaya, u.look,
                       COALESCE(SUM(f.credited_seconds), 0) AS seconds
                FROM users u
                LEFT JOIN focus_sessions f
                       ON f.user_id = u.id AND f.status IN ('completed','partial') AND f.ended_at >= ?";
        $args = [period_start($period)];

        if ($gid > 0) {
            if (!is_group_member($gid, $uid)) fail('Enti mouch fel jme3a hedhi.', 403);
            $sql .= ' JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = ?';
            $args[] = $gid;
        }
        $sql .= ' WHERE u.banned = 0';
        if ($gid <= 0 && $wilaya !== '') {
            $sql .= ' AND u.wilaya = ?';
            $args[] = $wilaya;
        }
        $sql .= ' GROUP BY u.id, u.username, u.level, u.avatar_color, u.hat, u.photo, u.wilaya, u.look';
        if ($gid <= 0) $sql .= ' HAVING seconds > 0';
        $sql .= ' ORDER BY seconds DESC, u.level DESC, u.username LIMIT 100';

        $st = db()->prepare($sql);
        $st->execute($args);
        $rows = $st->fetchAll();

        $myRank = null;
        foreach ($rows as $i => $row) {
            $rows[$i]['seconds'] = (int) $row['seconds']; // SUM() comes back as a DECIMAL string
            $rows[$i]['photo'] = photo_url($row['photo']);
            $rows[$i]['look'] = clean_look($row['look']);
            if ((int) $row['id'] === $uid) $myRank = $i + 1;
        }
        respond(['period' => $period, 'rows' => $rows, 'my_rank' => $myRank]);
    },
]);
