<?php
// Salat privées: rooms only friends with the code can enter, decorated by their owner.
require __DIR__ . '/_bootstrap.php';

const MAX_OWNED_ROOMS = 3;
const MAX_DECOR_ITEMS = 80;
const ROOM_THEMES = ['library', 'cafe', 'forest', 'pink'];
// Must match DECOR in assets/js/avatar.js
const DECOR_KEYS = ['shelf', 'books', 'plant', 'tree', 'flower', 'jasmine', 'balloons', 'cake', 'tea', 'coffee', 'lamp',
    'globe', 'piano', 'guitar', 'tv', 'sofa', 'clock', 'trophy', 'star', 'ribbon', 'cat', 'dog', 'rug', 'rug2'];
// Same map as assets/js/room.js: decor may only go on open floor or rugs.
const ROOM_MAP = [
    '##############################',
    '#BBBBBBBBBBB#....#SSS.....SSS#',
    '#L.........L#....#L.........L#',
    '#.DD.DD.DD..#....#..SRRRRRS..#',
    '#.cc.cc.cc..........SRRRRRS..#',
    '#...........#....#..SRRRRRS..#',
    '#.DD.DD.DD..#....#...........#',
    '#.cc.cc.cc.P#....#P.........P#',
    '######.######....######.######',
    '#............................#',
    '#............................#',
    '######.######....######.######',
    '#P.........P#....#MM.......MM#',
    '#..TTT.TTT..#....#...........#',
    '#..TTT.TTT...........RRRRR...#',
    '#...........#....#...RRRRR...#',
    '#..TTT.TTT..#....#...RRRRR...#',
    '#..TTT.TTT..#....#...........#',
    '#L.........L#....#L.........L#',
    '##############################',
];

function room_code(): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $check = db()->prepare('SELECT 1 FROM private_rooms WHERE code = ?');
    do {
        $code = '';
        for ($i = 0; $i < 6; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        $check->execute([$code]);
    } while ($check->fetch());
    return $code;
}

/** Keeps only known items on free floor tiles, one item per tile. */
function clean_decor($raw): array
{
    $items = is_array($raw) ? $raw : [];
    $out = [];
    $used = [];
    foreach ($items as $it) {
        if (!is_array($it) || !in_array($it['k'] ?? null, DECOR_KEYS, true)) continue;
        $x = (int) ($it['x'] ?? -1);
        $y = (int) ($it['y'] ?? -1);
        if ($y < 1 || $y > 18 || $x < 1 || $x > 28 || !in_array(ROOM_MAP[$y][$x], ['.', 'R'], true)) continue;
        if (isset($used["$x,$y"])) continue;
        $used["$x,$y"] = true;
        $out[] = ['k' => $it['k'], 'x' => $x, 'y' => $y];
        if (count($out) >= MAX_DECOR_ITEMS) break;
    }
    return $out;
}

function room_view(array $r, int $uid): array
{
    $cnt = db()->prepare('SELECT COUNT(*) FROM private_room_members WHERE room_id = ?');
    $cnt->execute([$r['id']]);
    return [
        'id'       => (int) $r['id'],
        'code'     => $r['code'],
        'ws_id'    => 'p' . $r['code'],
        'name'     => $r['name'],
        'theme'    => $r['theme'],
        'decor'    => json_decode($r['decor'], true) ?: [],
        'owner'    => $r['owner_name'] ?? null,
        'is_owner' => (int) $r['owner_id'] === $uid,
        'members'  => (int) $cnt->fetchColumn(),
    ];
}

function my_rooms(int $uid): array
{
    $st = db()->prepare(
        'SELECT r.*, u.username AS owner_name FROM private_rooms r
         JOIN private_room_members m ON m.room_id = r.id AND m.user_id = ?
         JOIN users u ON u.id = r.owner_id
         ORDER BY r.owner_id = ? DESC, m.joined_at DESC'
    );
    $st->execute([$uid, $uid]);
    return array_map(fn($r) => room_view($r, $uid), $st->fetchAll());
}

/** Room by code, only if the user is a member. */
function member_room(string $code, int $uid): array
{
    $st = db()->prepare(
        'SELECT r.*, u.username AS owner_name FROM private_rooms r
         JOIN private_room_members m ON m.room_id = r.id AND m.user_id = ?
         JOIN users u ON u.id = r.owner_id WHERE r.code = ?'
    );
    $st->execute([$uid, strtoupper($code)]);
    $r = $st->fetch();
    if (!$r) fail('Sala privée mouch mawjouda, walla mazelt ma dkhaltech b l\'code mte3ha.', 404);
    return $r;
}

route([
    'mine' => function (): void {
        respond(['rooms' => my_rooms((int) require_user()['id'])]);
    },

    'create' => function (): void {
        $uid = (int) require_user()['id'];
        $name = str_param('name', 40);
        $theme = (string) param('theme', 'pink');
        if (strlen($name) < 2) fail('A3ti esm lel sala.');
        if (!in_array($theme, ROOM_THEMES, true)) $theme = 'pink';
        $cnt = db()->prepare('SELECT COUNT(*) FROM private_rooms WHERE owner_id = ?');
        $cnt->execute([$uid]);
        if ((int) $cnt->fetchColumn() >= MAX_OWNED_ROOMS) fail('3andek deja ' . MAX_OWNED_ROOMS . ' salat privées.');

        $code = room_code();
        // A few starter decorations so the room feels cozy from the start.
        $starter = [['k' => 'rug', 'x' => 14, 'y' => 13], ['k' => 'plant', 'x' => 13, 'y' => 16], ['k' => 'lamp', 'x' => 16, 'y' => 16], ['k' => 'jasmine', 'x' => 15, 'y' => 2]];
        db()->prepare('INSERT INTO private_rooms (code, owner_id, name, theme, decor, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$code, $uid, $name, $theme, json_encode($starter), now()]);
        $rid = (int) db()->lastInsertId();
        db()->prepare('INSERT INTO private_room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)')->execute([$rid, $uid, now()]);
        respond(['rooms' => my_rooms($uid), 'code' => $code, 'message' => "🔐 Sala jdida! L'code: $code — ab3athou lel s7ab."]);
    },

    'join' => function (): void {
        $uid = (int) require_user()['id'];
        $code = strtoupper(str_param('code', 6));
        $st = db()->prepare('SELECT id FROM private_rooms WHERE code = ?');
        $st->execute([$code]);
        $rid = (int) $st->fetchColumn();
        if (!$rid) fail('Code ghalet. Thabbet m3a sa7bek.');
        db()->prepare('INSERT IGNORE INTO private_room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)')->execute([$rid, $uid, now()]);
        respond(['rooms' => my_rooms($uid), 'code' => $code, 'message' => '🚪 Dkhalt lel sala privée!']);
    },

    'leave' => function (): void {
        $uid = (int) require_user()['id'];
        $r = member_room(str_param('code', 6), $uid);
        if ((int) $r['owner_id'] === $uid) {
            db()->prepare('DELETE FROM private_rooms WHERE id = ?')->execute([$r['id']]);
        } else {
            db()->prepare('DELETE FROM private_room_members WHERE room_id = ? AND user_id = ?')->execute([$r['id'], $uid]);
        }
        respond(['rooms' => my_rooms($uid)]);
    },

    'get' => function (): void {
        $uid = (int) require_user()['id'];
        respond(['room' => room_view(member_room(str_param('code', 6), $uid), $uid)]);
    },

    // Owner only: replace the decoration list and/or theme.
    'save' => function (): void {
        $uid = (int) require_user()['id'];
        $r = member_room(str_param('code', 6), $uid);
        if ((int) $r['owner_id'] !== $uid) fail('Ken mol l\'sala ynajjem yzayyenha.', 403);
        $decor = clean_decor(param('decor'));
        $theme = in_array(param('theme'), ROOM_THEMES, true) ? (string) param('theme') : $r['theme'];
        db()->prepare('UPDATE private_rooms SET decor = ?, theme = ? WHERE id = ?')->execute([json_encode($decor), $theme, $r['id']]);
        respond(['decor' => $decor, 'theme' => $theme]);
    },
]);
