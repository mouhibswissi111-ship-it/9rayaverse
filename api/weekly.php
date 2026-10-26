<?php
// Tahaddi l'jom3a: one automatic challenge for everybody, new every Monday (no admin work needed)
require __DIR__ . '/_bootstrap.php';

const WEEKLY_XP = 150;
const WEEKLY_GOLD = 60;

function week_start_date(): string
{
    return substr(period_start('week'), 0, 10);
}

/** The challenge of the current week, picked from the list by week number. */
function current_weekly(): array
{
    $list = weekly_list();
    return $list[(int) date('W') % count($list)];
}

function weekly_list(): array
{
    return [
        ['metric' => 'minutes',  'target' => 600, 'title' => '10 sa3at 9raya hal jom3a', 'emoji' => '⏱️'],
        ['metric' => 'days',     'target' => 5,   'title' => '9ra 5 ayem men 7',         'emoji' => '📅'],
        ['metric' => 'sessions', 'target' => 12,  'title' => '12 session kemla',         'emoji' => '✅'],
        ['metric' => 'strict',   'target' => 5,   'title' => '5 sessions fel mode sarem', 'emoji' => '🔒'],
        ['metric' => 'cards',    'target' => 100, 'title' => 'Raja3 100 carta',      'emoji' => '🃏'],
        ['metric' => 'tasks',    'target' => 15,  'title' => 'Kammel 15 chghol',         'emoji' => '📝'],
        ['metric' => 'minutes',  'target' => 900, 'title' => '15 sa3a 9raya hal jom3a',  'emoji' => '🔥'],
        ['metric' => 'plan',     'target' => 6,   'title' => 'Kammel 6 chapitres mel programme', 'emoji' => '🎓'],
    ];
}

function weekly_progress(int $uid, array $c): int
{
    $since = period_start('week');
    $one = function (string $sql, array $args): int {
        $st = db()->prepare($sql);
        $st->execute($args);
        return (int) $st->fetchColumn();
    };
    switch ($c['metric']) {
        case 'minutes':
            return intdiv(studied_since($uid, $since), 60);
        case 'days':
            return $one("SELECT COUNT(DISTINCT DATE(ended_at)) FROM focus_sessions WHERE user_id = ? AND status IN ('completed','partial') AND ended_at >= ?", [$uid, $since]);
        case 'sessions':
            return $one("SELECT COUNT(*) FROM focus_sessions WHERE user_id = ? AND status = 'completed' AND ended_at >= ?", [$uid, $since]);
        case 'strict':
            return $one("SELECT COUNT(*) FROM focus_sessions WHERE user_id = ? AND status = 'completed' AND strict = 1 AND ended_at >= ?", [$uid, $since]);
        case 'cards':
            return counter_since($uid, 'cards', week_start_date());
        case 'tasks':
            return $one('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND done = 1 AND done_at >= ?', [$uid, $since]);
        case 'plan':
            return $one('SELECT COUNT(*) FROM plan_items WHERE user_id = ? AND done = 1 AND done_at >= ?', [$uid, $since]);
    }
    return 0;
}

function weekly_payload(int $uid): array
{
    $c = current_weekly();
    $st = db()->prepare('SELECT 1 FROM weekly_claims WHERE user_id = ? AND week_start = ?');
    $st->execute([$uid, week_start_date()]);
    $done = db()->prepare(
        "SELECT COUNT(*) FROM weekly_claims WHERE week_start = ?"
    );
    $done->execute([week_start_date()]);
    return ['weekly' => $c + [
        'progress' => weekly_progress($uid, $c),
        'claimed'  => (bool) $st->fetch(),
        'ends_in'  => strtotime('monday next week') - time(),
        'xp'       => WEEKLY_XP,
        'gold'     => WEEKLY_GOLD,
        'winners'  => (int) $done->fetchColumn(),
    ]];
}

route([
    'get' => function (): void {
        respond(weekly_payload((int) require_user()['id']));
    },

    'claim' => function (): void {
        $uid = (int) require_user()['id'];
        $c = current_weekly();
        if (weekly_progress($uid, $c) < $c['target']) fail('Mazelt ma kammeltech l\'tahaddi 😉');
        $st = db()->prepare('INSERT IGNORE INTO weekly_claims (user_id, week_start, claimed_at) VALUES (?, ?, ?)');
        $st->execute([$uid, week_start_date(), now()]);
        if ($st->rowCount() !== 1) fail('Deja 5dhit l\'ghnima mta3 hal jom3a.');
        $events = array_merge([['type' => 'loot', 'xp' => WEEKLY_XP, 'gold' => WEEKLY_GOLD]], grant_rewards($uid, WEEKLY_XP, WEEKLY_GOLD, 0));
        respond(weekly_payload($uid) + ['events' => $events, 'profile' => profile($uid), 'message' => '🏆 Rba7t tahaddi l\'jom3a!']);
    },
]);
