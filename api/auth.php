<?php
// Accounts: register, login, logout, me
require __DIR__ . '/_bootstrap.php';

route([
    'register' => function (): void {
        $username = str_param('username', 20);
        $email = strtolower(str_param('email', 120));
        $password = (string) param('password', '');
        $wilaya = str_param('wilaya', 30);

        if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $username)) fail('L\'username lezem 3 7atta 20 7arf (7rouf, ar9am walla _).');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Email mouch s7i7.');
        if (strlen($password) < 6) fail('L\'mot de passe lezem 6 7rouf 3al a9al.');
        if ($wilaya !== '' && !in_array($wilaya, WILAYAS, true)) $wilaya = '';

        $st = db()->prepare('SELECT 1 FROM users WHERE username = ? OR email = ?');
        $st->execute([$username, $email]);
        if ($st->fetch()) fail('L\'username walla l\'email hedha deja mesta3mel.');
        throttle('register', MAX_REGISTERS_PER_HOUR, 3600, 'Barcha comptes t3amlou men nafs l\'connexion. 3awed ba3d sa3a.');
        record_attempt('register');

        // The very first account becomes the general admin.
        $role = (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0 ? 'admin' : 'user';

        db()->prepare('INSERT INTO users (username, email, password_hash, role, wilaya, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT), $role, $wilaya, now()]);
        $uid = (int) db()->lastInsertId();
        db()->prepare("INSERT INTO user_items (user_id, item_key) VALUES (?, 'hat_none'), (?, 'color_violet')")
            ->execute([$uid, $uid]);

        session_regenerate_id(true);
        $_SESSION['uid'] = $uid;
        respond(profile($uid));
    },

    'login' => function (): void {
        $login = str_param('login', 120);
        $password = (string) param('password', '');
        if ($login === '' || $password === '') fail('7ott l\'username (walla l\'email) w l\'mot de passe.');
        throttle('login_fail', MAX_LOGIN_FAILS, 15 * 60, 'Barcha tentatives ghaltin. Stanna 15 d9i9a w 3awed.');

        $st = db()->prepare('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1');
        $st->execute([$login, strtolower($login)]);
        $user = $st->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            record_attempt('login_fail');
            fail('L\'username walla l\'mot de passe ghalet.');
        }
        if ((int) $user['banned'] === 1) fail('Compte mte3ek mbloqui. Kallem l\'admin.', 403);
        clear_attempts('login_fail');

        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $user['id'];
        respond(profile((int) $user['id']));
    },

    'logout' => function (): void {
        $_SESSION = [];
        session_destroy();
        respond();
    },

    'me' => function (): void {
        $uid = (int) require_user()['id'];
        finalize_due_challenges();
        respond(profile($uid) + [
            'announcement' => setting('announcement'),
            'alerts'       => user_alerts($uid),
            'wilayas'      => WILAYAS,
            'home_url'     => home_url(),
        ]);
    },
]);
