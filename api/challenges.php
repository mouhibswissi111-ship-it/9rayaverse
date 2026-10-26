<?php
// Tahadiyet: group challenges ("chkoun ya9ra akther fi jom3a?") with chorout (dares) for the losers.
//   create → join → (time runs) → finalize: winners get loot and pick the dare → losers do it (+ photo proof) → closed
require __DIR__ . '/_bootstrap.php';

const MAX_RUNNING_PER_GROUP = 3;
const DARE_DONE_XP = 20;
const DARE_DONE_GOLD = 5;

function fetch_challenge(int $id): array
{
    $st = db()->prepare('SELECT c.*, g.name AS group_name FROM group_challenges c JOIN study_groups g ON g.id = c.group_id WHERE c.id = ?');
    $st->execute([$id]);
    $c = $st->fetch();
    if (!$c) fail('L\'tahaddi hedha mouch mawjoud.');
    return $c;
}

function challenge_view(array $c, int $uid): array
{
    $st = db()->prepare(
        'SELECT p.user_id, p.score, p.rank_pos, p.outcome, p.dare_done, p.proof_file, p.done_at,
                u.username, u.avatar_color, u.hat, u.photo, u.level, u.look
         FROM challenge_participants p JOIN users u ON u.id = p.user_id
         WHERE p.challenge_id = ?'
    );
    $st->execute([$c['id']]);
    $players = [];
    foreach ($st->fetchAll() as $p) {
        $live = $c['status'] === 'running';
        $players[] = [
            'id'        => (int) $p['user_id'],
            'username'  => $p['username'],
            'avatar_color' => $p['avatar_color'],
            'hat'       => $p['hat'],
            'photo'     => photo_url($p['photo']),
            'look'      => clean_look($p['look']),
            'level'     => (int) $p['level'],
            // While running, the score is computed live; afterwards the frozen final score is used.
            'score'     => $live ? challenge_score($c, (int) $p['user_id']) : (int) $p['score'],
            'outcome'   => $p['outcome'],
            'dare_done' => (bool) $p['dare_done'],
            'proof'     => $p['proof_file'] ? "api/file.php?type=proof&challenge={$c['id']}&user={$p['user_id']}" : null,
        ];
    }
    usort($players, fn($a, $b) => $b['score'] <=> $a['score'] ?: strcmp($a['username'], $b['username']));

    $me = null;
    foreach ($players as $p) if ($p['id'] === $uid) $me = $p;

    return [
        'id'         => (int) $c['id'],
        'group_id'   => (int) $c['group_id'],
        'group_name' => $c['group_name'],
        'title'      => $c['title'],
        'metric'     => $c['metric'],
        'starts_at'  => $c['starts_at'],
        'ends_at'    => $c['ends_at'],
        'ends_in'    => strtotime($c['ends_at']) - time(),
        'status'     => $c['status'],
        'dare'       => $c['dare'],
        'joined'     => $me !== null,
        'my_outcome' => $me['outcome'] ?? null,
        'my_dare_done' => $me['dare_done'] ?? false,
        'players'    => $players,
    ];
}

function require_member_of(array $c, int $uid): void
{
    if (!is_group_member((int) $c['group_id'], $uid)) fail('Enti mouch fel jme3a mta3 l\'tahaddi hedha.', 403);
}

function participant(int $cid, int $uid): ?array
{
    $st = db()->prepare('SELECT * FROM challenge_participants WHERE challenge_id = ? AND user_id = ?');
    $st->execute([$cid, $uid]);
    return $st->fetch() ?: null;
}

route([
    // All challenges of my groups (or of one group): running first, then the most recent.
    'list' => function (): void {
        $uid = (int) require_user()['id'];
        finalize_due_challenges();
        $gid = int_param('group_id');
        $sql = "SELECT c.*, g.name AS group_name FROM group_challenges c
                JOIN study_groups g ON g.id = c.group_id
                JOIN group_members gm ON gm.group_id = c.group_id AND gm.user_id = ?";
        $args = [$uid];
        if ($gid > 0) { $sql .= ' WHERE c.group_id = ?'; $args[] = $gid; }
        $sql .= " ORDER BY c.status = 'running' DESC, c.ends_at DESC LIMIT 30";
        $st = db()->prepare($sql);
        $st->execute($args);
        respond(['challenges' => array_map(fn($c) => challenge_view($c, $uid), $st->fetchAll())]);
    },

    'create' => function (): void {
        $uid = (int) require_user()['id'];
        $gid = int_param('group_id');
        if (!is_group_member($gid, $uid)) fail('Enti mouch fel jme3a hedhi.');
        $title = str_param('title', 80);
        if (strlen($title) < 3) fail('A3ti esm lel tahaddi (3 7rouf 3al a9al).');
        $metric = param('metric') === 'missions' ? 'missions' : 'minutes';
        $hours = int_param('duration_hours', 168);
        if ($hours < 1 || $hours > 24 * 31) fail('L\'modda lezem bin sa3a w chhar.');

        $cnt = db()->prepare("SELECT COUNT(*) FROM group_challenges WHERE group_id = ? AND status = 'running'");
        $cnt->execute([$gid]);
        if ((int) $cnt->fetchColumn() >= MAX_RUNNING_PER_GROUP) fail('Fama deja ' . MAX_RUNNING_PER_GROUP . ' tahadiyet ma7loulin fel jme3a.');

        db()->prepare(
            'INSERT INTO group_challenges (group_id, created_by, title, metric, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$gid, $uid, $title, $metric, now(), date('Y-m-d H:i:s', time() + $hours * 3600), now()]);
        $cid = (int) db()->lastInsertId();
        db()->prepare('INSERT INTO challenge_participants (challenge_id, user_id, joined_at) VALUES (?, ?, ?)')->execute([$cid, $uid, now()]);
        respond(['challenge' => challenge_view(fetch_challenge($cid), $uid), 'message' => '⚔️ L\'tahaddi bda! Ab3ath lel s7ab bech yod5lou.']);
    },

    'join' => function (): void {
        $uid = (int) require_user()['id'];
        $c = fetch_challenge(int_param('challenge_id'));
        require_member_of($c, $uid);
        if ($c['status'] !== 'running' || strtotime($c['ends_at']) <= time()) fail('L\'tahaddi hedha wfa.');
        if (participant((int) $c['id'], $uid)) fail('Enti deja fel tahaddi.');
        db()->prepare('INSERT INTO challenge_participants (challenge_id, user_id, joined_at) VALUES (?, ?, ?)')->execute([$c['id'], $uid, now()]);
        respond(['challenge' => challenge_view(fetch_challenge((int) $c['id']), $uid), 'message' => '💪 Dkhalt fel tahaddi. Yallah 9ra!']);
    },

    'leave' => function (): void {
        $uid = (int) require_user()['id'];
        $c = fetch_challenge(int_param('challenge_id'));
        if ($c['status'] !== 'running') fail('Ma tnajjemch tokhrej ba3d ma wfa l\'tahaddi 😏');
        db()->prepare('DELETE FROM challenge_participants WHERE challenge_id = ? AND user_id = ?')->execute([$c['id'], $uid]);
        respond(['challenge' => challenge_view($c, $uid)]);
    },

    // A winner chooses the dare the losers must do.
    'set_dare' => function (): void {
        $uid = (int) require_user()['id'];
        $c = fetch_challenge(int_param('challenge_id'));
        $p = participant((int) $c['id'], $uid);
        if (!$p || $p['outcome'] !== 'winner') fail('Ken elli rb7ou ynajmou ya5tarou l\'chart.');
        if ($c['status'] !== 'awaiting_dare') fail('L\'chart deja t5tar.');
        $dare = str_param('dare', 200);
        if (strlen($dare) < 3) fail('Ekteb l\'chart (3 7rouf 3al a9al).');
        $st = db()->prepare("UPDATE group_challenges SET dare = ?, dare_by = ?, status = 'dare_pending' WHERE id = ? AND status = 'awaiting_dare'");
        $st->execute([$dare, $uid, $c['id']]);
        if ($st->rowCount() !== 1) fail('L\'chart deja t5tar.');
        $losers = db()->prepare("SELECT user_id FROM challenge_participants WHERE challenge_id = ? AND outcome = 'loser'");
        $losers->execute([$c['id']]);
        foreach ($losers->fetchAll(PDO::FETCH_COLUMN) as $lid) {
            queue_push((int) $lid, 'challenge', '🎯 L\'chart mte3ek wsel!', $dare, '');
        }
        respond(['challenge' => challenge_view(fetch_challenge((int) $c['id']), $uid), 'message' => '😈 L\'chart tbe3eth lel khasrin!']);
    },

    // A loser confirms the dare is done (multipart, optional "proof" photo).
    'dare_done' => function (): void {
        $uid = (int) require_user()['id'];
        $c = fetch_challenge(int_param('challenge_id'));
        $p = participant((int) $c['id'], $uid);
        if (!$p || $p['outcome'] !== 'loser') fail('Enti mouch mel khasrin, ma 3andek 7atta chart 😄');
        if ($c['status'] !== 'dare_pending') fail('L\'chart mazel ma t5tarch.');
        if ((int) $p['dare_done'] === 1) fail('Deja 3malt l\'chart.');

        $proof = save_upload('proof', ['jpg', 'png', 'webp', 'gif'], MAX_IMAGE_MB, 'proofs', false);
        $st = db()->prepare('UPDATE challenge_participants SET dare_done = 1, proof_file = ?, done_at = ? WHERE challenge_id = ? AND user_id = ? AND dare_done = 0');
        $st->execute([$proof[0] ?? null, now(), $c['id'], $uid]);
        if ($st->rowCount() !== 1) fail('Deja 3malt l\'chart.');

        $events = grant_rewards($uid, DARE_DONE_XP, DARE_DONE_GOLD, 0);
        array_unshift($events, ['type' => 'loot', 'xp' => DARE_DONE_XP, 'gold' => DARE_DONE_GOLD]);

        $left = db()->prepare("SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = ? AND outcome = 'loser' AND dare_done = 0");
        $left->execute([$c['id']]);
        if ((int) $left->fetchColumn() === 0) db()->prepare("UPDATE group_challenges SET status = 'closed' WHERE id = ?")->execute([$c['id']]);

        respond([
            'challenge' => challenge_view(fetch_challenge((int) $c['id']), $uid),
            'events'    => $events,
            'profile'   => profile($uid),
            'message'   => '💪 Rajel/Mra 3al kelma! L\'chart tsajjel.',
        ]);
    },
]);
