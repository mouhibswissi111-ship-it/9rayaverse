<?php
// Jme3at (study groups): mine, browse, create, join, leave, detail
require __DIR__ . '/_bootstrap.php';

const MAX_GROUP_MEMBERS = 50;
const MAX_GROUPS_PER_USER = 10;

function my_groups(int $uid): array
{
    $st = db()->prepare(
        "SELECT g.id, g.name, g.description, g.invite_code, g.daily_goal_minutes, g.is_public, g.owner_id,
                (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members,
                (SELECT COUNT(*) FROM group_challenges c WHERE c.group_id = g.id AND c.status = 'running') AS running_challenges
         FROM study_groups g JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
         ORDER BY g.name"
    );
    $st->execute([$uid]);
    return $st->fetchAll();
}

function new_invite_code(): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $check = db()->prepare('SELECT 1 FROM study_groups WHERE invite_code = ?');
    do {
        $code = '';
        for ($i = 0; $i < 6; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        $check->execute([$code]);
    } while ($check->fetch());
    return $code;
}

function count_user_groups(int $uid): int
{
    $st = db()->prepare('SELECT COUNT(*) FROM group_members WHERE user_id = ?');
    $st->execute([$uid]);
    return (int) $st->fetchColumn();
}

route([
    'mine' => function (): void {
        respond(['groups' => my_groups((int) require_user()['id'])]);
    },

    'browse' => function (): void {
        $uid = (int) require_user()['id'];
        $st = db()->prepare(
            'SELECT g.id, g.name, g.description, g.daily_goal_minutes,
                    (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members
             FROM study_groups g
             WHERE g.is_public = 1 AND g.id NOT IN (SELECT group_id FROM group_members WHERE user_id = ?)
             ORDER BY members DESC, g.id DESC LIMIT 30'
        );
        $st->execute([$uid]);
        respond(['groups' => $st->fetchAll()]);
    },

    'create' => function (): void {
        $uid = (int) require_user()['id'];
        $name = str_param('name', 40);
        $description = str_param('description', 200);
        $goal = int_param('daily_goal_minutes', 120);
        $public = bool_param('is_public') ? 1 : 0;
        if (strlen($name) < 3) fail('Esm l\'jme3a lezem 3 7rouf 3al a9al.');
        if ($goal < 10 || $goal > 960) fail('L\'objectif lezem bin 10 w 960 da9i9a fel nhar.');
        if (count_user_groups($uid) >= MAX_GROUPS_PER_USER) fail('Ma tnajjemch tkoun f akther men ' . MAX_GROUPS_PER_USER . ' jme3at.');

        db()->prepare(
            'INSERT INTO study_groups (name, description, invite_code, owner_id, daily_goal_minutes, is_public, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$name, $description, new_invite_code(), $uid, $goal, $public, now()]);
        $gid = (int) db()->lastInsertId();
        db()->prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)')->execute([$gid, $uid, now()]);
        respond(['group_id' => $gid, 'groups' => my_groups($uid)]);
    },

    'join' => function (): void {
        $uid = (int) require_user()['id'];
        $code = strtoupper(str_param('code', 6));
        $gid = int_param('group_id');

        if ($code !== '') {
            $st = db()->prepare('SELECT id FROM study_groups WHERE invite_code = ?');
            $st->execute([$code]);
        } else {
            $st = db()->prepare('SELECT id FROM study_groups WHERE id = ? AND is_public = 1');
            $st->execute([$gid]);
        }
        $gid = (int) $st->fetchColumn();
        if (!$gid) fail('Jme3a mouch mawjouda. Thabbet fel code.');
        if (is_group_member($gid, $uid)) fail('Enti deja fel jme3a hedhi.');
        if (count_user_groups($uid) >= MAX_GROUPS_PER_USER) fail('Ma tnajjemch tkoun f akther men ' . MAX_GROUPS_PER_USER . ' jme3at.');

        $cnt = db()->prepare('SELECT COUNT(*) FROM group_members WHERE group_id = ?');
        $cnt->execute([$gid]);
        if ((int) $cnt->fetchColumn() >= MAX_GROUP_MEMBERS) fail('L\'jme3a hedhi m3abbya.');

        db()->prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)')->execute([$gid, $uid, now()]);
        respond(['group_id' => $gid, 'groups' => my_groups($uid)]);
    },

    'leave' => function (): void {
        $uid = (int) require_user()['id'];
        $gid = int_param('group_id');
        db()->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?')->execute([$gid, $uid]);
        db()->prepare('UPDATE missions SET group_id = NULL WHERE group_id = ? AND user_id = ?')->execute([$gid, $uid]);

        // Hand ownership to the longest-standing member, or delete the empty group.
        $st = db()->prepare('SELECT owner_id FROM study_groups WHERE id = ?');
        $st->execute([$gid]);
        if ((int) $st->fetchColumn() === $uid) {
            $next = db()->prepare('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at, user_id LIMIT 1');
            $next->execute([$gid]);
            $heir = (int) $next->fetchColumn();
            if ($heir) db()->prepare('UPDATE study_groups SET owner_id = ? WHERE id = ?')->execute([$heir, $gid]);
            else db()->prepare('DELETE FROM study_groups WHERE id = ?')->execute([$gid]);
        }
        respond(['groups' => my_groups($uid)]);
    },

    'detail' => function (): void {
        $uid = (int) require_user()['id'];
        $gid = int_param('group_id');
        if (!is_group_member($gid, $uid)) fail('Enti mouch fel jme3a hedhi.', 403);

        $g = db()->prepare('SELECT id, name, description, invite_code, daily_goal_minutes, is_public, owner_id FROM study_groups WHERE id = ?');
        $g->execute([$gid]);
        $group = $g->fetch();

        $st = db()->prepare(
            "SELECT u.id, u.username, u.level, u.avatar_color, u.hat, u.photo, u.wilaya, u.look,
                    (SELECT COALESCE(SUM(f.credited_seconds), 0) FROM focus_sessions f
                     WHERE f.user_id = u.id AND f.status IN ('completed','partial') AND f.ended_at >= ?) AS today,
                    (SELECT COALESCE(SUM(f.credited_seconds), 0) FROM focus_sessions f
                     WHERE f.user_id = u.id AND f.status IN ('completed','partial') AND f.ended_at >= ?) AS week,
                    a.subject AS studying, a.started_at AS studying_since, a.planned_minutes AS studying_planned
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             LEFT JOIN focus_sessions a ON a.user_id = u.id AND a.status = 'active' AND a.last_ping_at >= ?
             WHERE gm.group_id = ?
             ORDER BY today DESC, u.username"
        );
        $st->execute([period_start('day'), period_start('week'), date('Y-m-d H:i:s', time() - 60), $gid]);
        $members = $st->fetchAll();
        foreach ($members as &$m) {
            $m['today'] = (int) $m['today']; // SUM() comes back as a DECIMAL string
            $m['week'] = (int) $m['week'];
            $m['photo'] = photo_url($m['photo']);
            $m['look'] = clean_look($m['look']);
            // Seconds already studied in the running session, so the UI can tick live (YPT style).
            $m['live_seconds'] = $m['studying_since']
                ? min(time() - strtotime($m['studying_since']), (int) $m['studying_planned'] * 60)
                : 0;
            unset($m['studying_since'], $m['studying_planned']);
        }
        unset($m);

        $c = db()->prepare(
            'SELECT m.id, m.title, m.target_minutes, u.username AS owner, (m.user_id = ?) AS mine FROM missions m
             JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.id DESC LIMIT 30'
        );
        $c->execute([$uid, $gid]);

        respond(['group' => $group, 'members' => $members, 'courses' => $c->fetchAll()]);
    },
]);
