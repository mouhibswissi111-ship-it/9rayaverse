<?php
// Notifications (Web Push).
//   Browser side: config / subscribe / unsubscribe / reminder / test (logged-in user).
//   Sender side:  due / gone, called only by ws-server/push.js with the shared secret.
require __DIR__ . '/_bootstrap.php';

const DEFAULT_REMINDER_HOUR = 20;

function require_sender(): void
{
    $given = (string) ($_SERVER['HTTP_X_PUSH_SECRET'] ?? '');
    if ($given === '' || !hash_equals(WS_SECRET, $given)) fail('Mamnou3.', 403);
}

/** Daily reminder + weekly challenge announcement, queued when their hour comes. */
function queue_scheduled(): void
{
    $hour = (int) date('G');
    $today = today();

    // Daily reminder at each user's hour, only if they haven't studied today.
    $st = db()->prepare(
        'SELECT u.id, u.streak, u.last_study_date, u.reminder_hour FROM users u
         WHERE u.banned = 0 AND u.id IN (SELECT user_id FROM push_subscriptions)
           AND (u.last_reminder_date IS NULL OR u.last_reminder_date < ?)
           AND COALESCE(u.reminder_hour, ?) <= ? AND COALESCE(u.reminder_hour, ?) >= 0
           AND (u.last_study_date IS NULL OR u.last_study_date < ?)
         LIMIT 500'
    );
    $st->execute([$today, DEFAULT_REMINDER_HOUR, $hour, DEFAULT_REMINDER_HOUR, $today]);
    $mark = db()->prepare('UPDATE users SET last_reminder_date = ? WHERE id = ?');
    foreach ($st->fetchAll() as $u) {
        $mark->execute([$today, $u['id']]);
        $alive = $u['last_study_date'] === date('Y-m-d', strtotime('-1 day')) && (int) $u['streak'] > 0;
        if ($alive) {
            queue_push((int) $u['id'], 'reminder', '🔥 L\'ayem l\'mtab3in mte3ek bech yet9a3ou!', '3andek ' . (int) $u['streak'] . ' ayem mtab3in. 25 d9i9a 9raya bark w t7afedh 3lihom 💪', home_url('focus'));
        } else {
            queue_push((int) $u['id'], 'reminder', '📚 Ma 9rit chay lyoum', 'Session sghira mta3 25 d9i9a? Yallah nebdew ✨', home_url('focus'));
        }
    }

    // Monday morning: the new weekly challenge.
    if (date('N') === '1' && $hour >= 9) {
        $week = substr(period_start('week'), 0, 10);
        $st = db()->prepare(
            'SELECT id FROM users WHERE banned = 0 AND id IN (SELECT user_id FROM push_subscriptions)
               AND (last_weekly_notif IS NULL OR last_weekly_notif < ?) LIMIT 500'
        );
        $st->execute([$week]);
        $mark = db()->prepare('UPDATE users SET last_weekly_notif = ? WHERE id = ?');
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
            $mark->execute([$week, $id]);
            queue_push((int) $id, 'weekly', '⚔️ Tahaddi l\'jom3a jdid!', 'Tahaddi jdid tla3. Kammlou w orba7 150 n9at 🏆', home_url('focus'));
        }
    }
}

route([
    'config' => function (): void {
        $uid = (int) require_user()['id'];
        $u = fetch_user($uid);
        respond([
            'enabled'       => push_enabled(),
            'public_key'    => push_enabled() ? VAPID_PUBLIC : '',
            'subscribed'    => has_push($uid),
            'reminder_hour' => $u['reminder_hour'] === null ? DEFAULT_REMINDER_HOUR : (int) $u['reminder_hour'],
        ]);
    },

    'subscribe' => function (): void {
        $uid = (int) require_user()['id'];
        if (!push_enabled()) fail('L\'notifications mouch mfa3lin 3al serveur.');
        $endpoint = (string) param('endpoint', '');
        $keys = param('keys');
        $p256dh = is_array($keys) ? (string) ($keys['p256dh'] ?? '') : '';
        $auth = is_array($keys) ? (string) ($keys['auth'] ?? '') : '';
        if (!preg_match('#^https://[^\s]{10,1000}$#', $endpoint)) fail('Abonnement mouch s7i7.');
        if (!preg_match('/^[A-Za-z0-9_-]{80,100}$/', $p256dh) || !preg_match('/^[A-Za-z0-9_-]{16,30}$/', $auth)) fail('Abonnement mouch s7i7.');
        $hash = hash('sha256', $endpoint);
        db()->prepare(
            'INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)'
        )->execute([$uid, $hash, $endpoint, $p256dh, $auth, now()]);
        // Max 5 devices per user: drop the oldest.
        db()->prepare(
            'DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 5) keep)'
        )->execute([$uid, $uid]);
        respond(['message' => '🔔 L\'notifications tfa3lou!']);
    },

    'unsubscribe' => function (): void {
        $uid = (int) require_user()['id'];
        $endpoint = (string) param('endpoint', '');
        if ($endpoint !== '') {
            db()->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?')->execute([$uid, hash('sha256', $endpoint)]);
        } else {
            db()->prepare('DELETE FROM push_subscriptions WHERE user_id = ?')->execute([$uid]);
        }
        respond(['message' => '🔕 L\'notifications tsakrou.']);
    },

    // -1 = no daily reminder.
    'reminder' => function (): void {
        $uid = (int) require_user()['id'];
        $hour = int_param('hour', DEFAULT_REMINDER_HOUR);
        if ($hour < -1 || $hour > 23) fail('Sa3a mouch s7i7a.');
        db()->prepare('UPDATE users SET reminder_hour = ? WHERE id = ?')->execute([$hour, $uid]);
        respond(['message' => $hour < 0 ? '🔕 Ma fammech tfakkir kol nhar.' : "⏰ Nfakkrek kol nhar m3a $hour:00 (ken ma 9ritech)."]);
    },

    'test' => function (): void {
        $uid = (int) require_user()['id'];
        if (!has_push($uid)) fail('Fa3el l\'notifications 9bal.');
        queue_push($uid, 'test', '👋 Ahla bik fi 9rayaverse!', 'L\'notifications ykhdmou. Nfakkrouk bel 9raya 📚', home_url(), 1);
        respond(['message' => '📨 Ab3athna notification test. Tousel fi d9i9a.']);
    },

    // ---- sender side (ws-server/push.js) ----
    'due' => function (): void {
        require_sender();
        queue_scheduled();
        // Old rows: drop anything never sent within a day, and the sent history after a week.
        db()->prepare('DELETE FROM push_queue WHERE (sent_at IS NULL AND created_at < ?) OR sent_at < ?')
            ->execute([date('Y-m-d H:i:s', time() - 86400), date('Y-m-d H:i:s', time() - 7 * 86400)]);

        $st = db()->query('SELECT id, user_id, title, body, url FROM push_queue WHERE sent_at IS NULL ORDER BY id LIMIT 200');
        $rows = $st->fetchAll();
        $out = [];
        if ($rows) {
            $ids = array_column($rows, 'id');
            db()->prepare('UPDATE push_queue SET sent_at = ? WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')')
                ->execute(array_merge([now()], $ids));
            $subs = db()->prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?');
            foreach ($rows as $r) {
                $subs->execute([$r['user_id']]);
                foreach ($subs->fetchAll() as $s) {
                    $out[] = ['endpoint' => $s['endpoint'], 'p256dh' => $s['p256dh'], 'auth' => $s['auth'],
                        'payload' => ['title' => $r['title'], 'body' => $r['body'], 'url' => $r['url']]];
                }
            }
        }
        respond(['messages' => $out]);
    },

    // The push service said this subscription no longer exists.
    'gone' => function (): void {
        require_sender();
        $endpoint = (string) param('endpoint', '');
        db()->prepare('DELETE FROM push_subscriptions WHERE endpoint_hash = ?')->execute([hash('sha256', $endpoint)]);
        respond();
    },
]);
