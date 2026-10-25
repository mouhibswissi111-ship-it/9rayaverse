<?php
// Missions: upload a course PDF, give it a study-time target, track progress,
// share it with a group, copy a friend's shared course.
require __DIR__ . '/_bootstrap.php';

const MAX_ACTIVE_MISSIONS = 30;

function mission_row(array $m): array
{
    [$xp, $gold] = mission_rewards((int) $m['target_minutes']);
    return [
        'id'               => (int) $m['id'],
        'title'            => $m['title'],
        'original_name'    => $m['original_name'],
        'size'             => (int) $m['size'],
        'target_minutes'   => (int) $m['target_minutes'],
        'deadline'         => $m['deadline'],
        'progress_seconds' => (int) $m['progress_seconds'],
        'status'           => $m['status'],
        'completed_at'     => $m['completed_at'],
        'group_id'         => $m['group_id'] !== null ? (int) $m['group_id'] : null,
        'group_name'       => $m['group_name'] ?? null,
        'owner'            => $m['owner'] ?? null,
        'reward_xp'        => $xp,
        'reward_gold'      => $gold,
        'url'              => 'api/file.php?type=mission&id=' . (int) $m['id'],
    ];
}

function list_payload(int $uid): array
{
    $mine = db()->prepare(
        "SELECT m.*, g.name AS group_name FROM missions m LEFT JOIN study_groups g ON g.id = m.group_id
         WHERE m.user_id = ? ORDER BY m.status = 'done', m.deadline IS NULL, m.deadline, m.id DESC"
    );
    $mine->execute([$uid]);

    // Courses friends shared in my groups (that I don't have yet).
    $shared = db()->prepare(
        "SELECT m.*, g.name AS group_name, u.username AS owner FROM missions m
         JOIN study_groups g ON g.id = m.group_id
         JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?
         JOIN users u ON u.id = m.user_id
         WHERE m.user_id <> ?
           AND m.file_name NOT IN (SELECT file_name FROM missions WHERE user_id = ?)
         ORDER BY m.id DESC LIMIT 50"
    );
    $shared->execute([$uid, $uid, $uid]);

    return [
        'missions' => array_map('mission_row', $mine->fetchAll()),
        'shared'   => array_map('mission_row', $shared->fetchAll()),
        'max_mb'   => MAX_PDF_MB,
    ];
}

function own_mission(int $id, int $uid): array
{
    $st = db()->prepare('SELECT * FROM missions WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);
    $m = $st->fetch();
    if (!$m) fail('L\'mission hedhi mouch mawjouda.');
    return $m;
}

function clean_deadline(string $d): ?string
{
    if ($d === '') return null;
    $t = DateTime::createFromFormat('Y-m-d', $d);
    if (!$t || $t->format('Y-m-d') !== $d) fail('Date limite mouch s7i7a.');
    return $d;
}

function clean_target(int $minutes): int
{
    if ($minutes < 10 || $minutes > 6000) fail('L\'objectif lezem bin 10 w 6000 da9i9a.');
    return $minutes;
}

route([
    'list' => function (): void {
        respond(list_payload((int) require_user()['id']));
    },

    // multipart/form-data: pdf, title, target_minutes, deadline
    'upload' => function (): void {
        $uid = (int) require_user()['id'];
        $cnt = db()->prepare("SELECT COUNT(*) FROM missions WHERE user_id = ? AND status = 'active'");
        $cnt->execute([$uid]);
        if ((int) $cnt->fetchColumn() >= MAX_ACTIVE_MISSIONS) fail('3andek ' . MAX_ACTIVE_MISSIONS . ' missions ma7loulin. Kammel chwaya 9bal!');

        $target = clean_target(int_param('target_minutes', 120));
        $deadline = clean_deadline(str_param('deadline', 10));
        [$file, $original, $size] = save_upload('pdf', ['pdf'], MAX_PDF_MB, 'courses');
        $title = str_param('title', 100);
        if ($title === '') $title = preg_replace('/\.pdf$/i', '', $original) ?: 'Cours';

        db()->prepare(
            'INSERT INTO missions (user_id, title, file_name, original_name, size, target_minutes, deadline, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$uid, $title, $file, $original, $size, $target, $deadline, now()]);
        respond(list_payload($uid) + ['message' => '📚 Mission jdida: ' . $title]);
    },

    'update' => function (): void {
        $uid = (int) require_user()['id'];
        $m = own_mission(int_param('id'), $uid);
        $title = str_param('title', 100) ?: $m['title'];
        $target = clean_target(int_param('target_minutes', (int) $m['target_minutes']));
        $deadline = clean_deadline(str_param('deadline', 10));
        db()->prepare('UPDATE missions SET title = ?, target_minutes = ?, deadline = ? WHERE id = ?')
            ->execute([$title, $target, $deadline, $m['id']]);

        // Lowering the target below the progress completes the mission right away.
        $events = [];
        if ($m['status'] === 'active') $events = add_mission_progress((int) $m['id'], $uid, 0);
        respond(list_payload($uid) + ['events' => $events, 'profile' => profile($uid)]);
    },

    'delete' => function (): void {
        $uid = (int) require_user()['id'];
        $m = own_mission(int_param('id'), $uid);
        db()->prepare('DELETE FROM missions WHERE id = ?')->execute([$m['id']]);
        delete_course_file_if_unused($m['file_name']);
        respond(list_payload($uid));
    },

    'share' => function (): void {
        $uid = (int) require_user()['id'];
        $m = own_mission(int_param('id'), $uid);
        $gid = int_param('group_id');
        if ($gid > 0 && !is_group_member($gid, $uid)) fail('Enti mouch fel jme3a hedhi.');
        db()->prepare('UPDATE missions SET group_id = ? WHERE id = ?')->execute([$gid > 0 ? $gid : null, $m['id']]);
        respond(list_payload($uid) + ['message' => $gid > 0 ? '🤝 L\'cours tpartaga m3a l\'jme3a!' : 'L\'cours walla privé.']);
    },

    // Copy a course a friend shared in one of my groups into my own missions.
    'clone' => function (): void {
        $uid = (int) require_user()['id'];
        $st = db()->prepare('SELECT * FROM missions WHERE id = ? AND group_id IS NOT NULL');
        $st->execute([int_param('id')]);
        $src = $st->fetch();
        if (!$src || !is_group_member((int) $src['group_id'], $uid)) fail('L\'cours hedha mouch mpartagi m3ak.');

        $dup = db()->prepare('SELECT 1 FROM missions WHERE user_id = ? AND file_name = ?');
        $dup->execute([$uid, $src['file_name']]);
        if ($dup->fetch()) fail('L\'cours hedha deja 3andek.');

        db()->prepare(
            'INSERT INTO missions (user_id, title, file_name, original_name, size, target_minutes, deadline, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([$uid, $src['title'], $src['file_name'], $src['original_name'], $src['size'], $src['target_minutes'], $src['deadline'], now()]);
        respond(list_payload($uid) + ['message' => '📥 Zedt l\'cours l\'missions mte3ek!']);
    },
]);
