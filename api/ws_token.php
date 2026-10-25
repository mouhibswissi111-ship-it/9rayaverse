<?php
// Issues a short-lived signed token so the Node.js WebSocket server can trust
// who you are (and which group / private rooms you may enter) without touching the database.
require __DIR__ . '/_bootstrap.php';

$u = require_user();
$uid = (int) $u['id'];
$st = db()->prepare('SELECT g.id, g.name FROM study_groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?');
$st->execute([$uid]);
$groups = array_map(fn($g) => ['id' => (int) $g['id'], 'name' => $g['name']], $st->fetchAll());

// Private room the user wants to enter (?room=pCODE): only granted to its members.
$proom = null;
$room = (string) param('room', '');
if (preg_match('/^p([A-Z0-9]{6})$/', $room, $m)) {
    $pr = db()->prepare(
        'SELECT r.code, r.name, r.owner_id FROM private_rooms r
         JOIN private_room_members pm ON pm.room_id = r.id AND pm.user_id = ? WHERE r.code = ?'
    );
    $pr->execute([$uid, $m[1]]);
    if ($r = $pr->fetch()) $proom = ['id' => 'p' . $r['code'], 'name' => $r['name'], 'owner' => (int) $r['owner_id'] === $uid];
}

$token = sign_ws_token([
    'uid'    => $uid,
    'name'   => $u['username'],
    'color'  => $u['avatar_color'],
    'hat'    => $u['hat'],
    'photo'  => photo_url($u['photo']),
    'look'   => clean_look($u['look']),
    'level'  => (int) $u['level'],
    'groups' => $groups,
    'proom'  => $proom,
    'exp'    => time() + 12 * 3600,
]);

respond([
    'token'  => $token,
    'port'   => WS_PORT,
    // Production: the web server forwards this path (e.g. /ws) to the Node.js server over HTTPS.
    'ws_url' => defined('WS_PUBLIC_URL') ? WS_PUBLIC_URL : '',
]);
