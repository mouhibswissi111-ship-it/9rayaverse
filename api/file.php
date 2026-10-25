<?php
// Serves private files after a permission check:
//   ?type=mission&id=ID                 → course PDF (owner, its shared group, or admin)
//   ?type=proof&challenge=ID&user=UID   → dare proof photo (challenge's group members, or admin)
define('ALLOW_GET', true);
require __DIR__ . '/_bootstrap.php';

$me = require_user();
$uid = (int) $me['id'];
$isAdmin = $me['role'] === 'admin';
$type = (string) param('type', '');

if ($type === 'mission') {
    $st = db()->prepare('SELECT * FROM missions WHERE id = ?');
    $st->execute([int_param('id')]);
    $m = $st->fetch();
    $allowed = $m && ((int) $m['user_id'] === $uid || $isAdmin || ($m['group_id'] && is_group_member((int) $m['group_id'], $uid)));
    if (!$allowed) fail('Ma 3andekch l\'7a9 tchouf l\'fichier hedha.', 403);
    $path = UPLOAD_DIR . '/courses/' . $m['file_name'];
    $mime = 'application/pdf';
    $name = $m['original_name'];
} elseif ($type === 'proof') {
    $st = db()->prepare(
        'SELECT p.proof_file, c.group_id FROM challenge_participants p JOIN group_challenges c ON c.id = p.challenge_id
         WHERE p.challenge_id = ? AND p.user_id = ?'
    );
    $st->execute([int_param('challenge'), int_param('user')]);
    $p = $st->fetch();
    if (!$p || !$p['proof_file'] || !($isAdmin || is_group_member((int) $p['group_id'], $uid))) fail('Ma 3andekch l\'7a9 tchouf l\'preuve hedhi.', 403);
    $path = UPLOAD_DIR . '/proofs/' . $p['proof_file'];
    $ext = pathinfo($p['proof_file'], PATHINFO_EXTENSION);
    $mime = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'][$ext] ?? 'application/octet-stream';
    $name = 'preuve.' . $ext;
} else {
    fail('Type mouch ma3rouf.', 404);
}

if (!is_file($path)) fail('L\'fichier ma3adech mawjoud.', 404);

header_remove('Cache-Control');
header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($path));
header('Content-Disposition: inline; filename="' . str_replace(['"', "\r", "\n"], '', $name) . '"');
header('Cache-Control: private, max-age=3600');
readfile($path);
