<?php
// Profili: bio + wilaya, profile photo (sourtek), password change
require __DIR__ . '/_bootstrap.php';

route([
    'update' => function (): void {
        $uid = (int) require_user()['id'];
        $bio = str_param('bio', 160);
        $wilaya = str_param('wilaya', 30);
        if ($wilaya !== '' && !in_array($wilaya, WILAYAS, true)) fail('Wileya mouch s7i7a.');
        // Lycée / fac: one spelling per school (spaces squashed; matching ignores case).
        $school = preg_replace('/\s+/u', ' ', str_param('school', 60));
        if ($school !== '' && strlen($school) < 3) fail('Esm l\'lycée 9sir barcha.');
        if ($school !== '') {
            $known = db()->prepare('SELECT school FROM users WHERE school = ? LIMIT 1');
            $known->execute([$school]);
            $school = (string) ($known->fetchColumn() ?: $school);
        }
        db()->prepare('UPDATE users SET bio = ?, wilaya = ?, school = ? WHERE id = ?')->execute([$bio, $wilaya, $school, $uid]);
        respond(profile($uid) + ['message' => '✅ Profilek tsajjel.']);
    },

    // Suggestions for the lycée field (most popular first).
    'schools' => function (): void {
        require_user();
        $st = db()->query("SELECT school, COUNT(*) AS n FROM users WHERE school <> '' AND banned = 0 GROUP BY school ORDER BY n DESC LIMIT 200");
        respond(['schools' => array_column($st->fetchAll(), 'school')]);
    },

    // Chibi character: skin, hair, hairColor, eyes, glasses, blush, mode (perso|photo)
    'look' => function (): void {
        $uid = (int) require_user()['id'];
        $look = clean_look(param('look'));
        db()->prepare('UPDATE users SET look = ? WHERE id = ?')->execute([json_encode($look), $uid]);
        respond(profile($uid) + ['message' => '🧍 L\'perso mte3ek tsajjel!']);
    },

    // multipart/form-data: photo
    'photo' => function (): void {
        $u = require_user();
        [$file] = save_upload('photo', ['jpg', 'png', 'webp', 'gif'], MAX_IMAGE_MB, 'avatars');
        db()->prepare('UPDATE users SET photo = ? WHERE id = ?')->execute([$file, $u['id']]);
        delete_upload('avatars', $u['photo']);
        respond(profile((int) $u['id']) + ['message' => '📸 Sourtek jdida tsajjlet!']);
    },

    'photo_remove' => function (): void {
        $u = require_user();
        db()->prepare('UPDATE users SET photo = NULL WHERE id = ?')->execute([$u['id']]);
        delete_upload('avatars', $u['photo']);
        respond(profile((int) $u['id']));
    },

    'password' => function (): void {
        $u = require_user();
        $current = (string) param('current', '');
        $new = (string) param('new', '');
        if (!password_verify($current, $u['password_hash'])) fail('L\'mot de passe l\'9dim ghalet.');
        if (strlen($new) < 6) fail('L\'mot de passe jdid lezem 6 7rouf 3al a9al.');
        db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        respond(['message' => '🔑 L\'mot de passe tbaddel.']);
    },
]);
