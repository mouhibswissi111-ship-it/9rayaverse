<?php
// Chghol (to-dos): list, add, complete, delete
require __DIR__ . '/_bootstrap.php';

// [xp, gold, monster damage] per difficulty
const TASK_REWARDS = ['easy' => [5, 1, 2], 'medium' => [10, 2, 4], 'hard' => [20, 4, 8]];
// Stops "create & tick" farming: only the first N tasks per day give loot.
const DAILY_REWARDED_TASKS = 15;

function list_tasks(int $uid): array
{
    $open = db()->prepare('SELECT id, title, difficulty, created_at FROM tasks WHERE user_id = ? AND done = 0 ORDER BY id DESC');
    $open->execute([$uid]);
    $done = db()->prepare('SELECT id, title, difficulty, done_at FROM tasks WHERE user_id = ? AND done = 1 AND done_at >= ? ORDER BY done_at DESC');
    $done->execute([$uid, period_start('day')]);
    return ['open' => $open->fetchAll(), 'done_today' => $done->fetchAll()];
}

route([
    'list' => function (): void {
        respond(list_tasks((int) require_user()['id']));
    },

    'add' => function (): void {
        $uid = (int) require_user()['id'];
        $title = str_param('title', 120);
        $difficulty = (string) param('difficulty', 'easy');
        if ($title === '') fail('Ekteb chnowa l\'chghol.');
        if (!isset(TASK_REWARDS[$difficulty])) fail('Niveau de difficulté mouch s7i7.');

        $cnt = db()->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND done = 0');
        $cnt->execute([$uid]);
        if ((int) $cnt->fetchColumn() >= 100) fail('3andek 100 chghol ma7loulin. Kammel chwaya 9bal!');

        db()->prepare('INSERT INTO tasks (user_id, title, difficulty, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$uid, $title, $difficulty, now()]);
        respond(list_tasks($uid));
    },

    'complete' => function (): void {
        $uid = (int) require_user()['id'];
        $id = int_param('id');
        $st = db()->prepare('SELECT difficulty FROM tasks WHERE id = ? AND user_id = ? AND done = 0');
        $st->execute([$id, $uid]);
        $difficulty = $st->fetchColumn();
        if (!$difficulty) fail('L\'chghol hedha mouch mawjoud.');

        $cnt = db()->prepare('SELECT COUNT(*) FROM tasks WHERE user_id = ? AND done = 1 AND done_at >= ?');
        $cnt->execute([$uid, period_start('day')]);
        $rewarded = (int) $cnt->fetchColumn() < DAILY_REWARDED_TASKS;

        $upd = db()->prepare('UPDATE tasks SET done = 1, done_at = ? WHERE id = ? AND user_id = ? AND done = 0');
        $upd->execute([now(), $id, $uid]);
        if ($upd->rowCount() !== 1) fail('Deja kammeltou.');

        $events = [];
        if ($rewarded) {
            [$xp, $gold, $damage] = TASK_REWARDS[$difficulty];
            $events = grant_rewards($uid, $xp, $gold, $damage);
            array_unshift($events, ['type' => 'loot', 'xp' => $xp, 'gold' => $gold]);
        } else {
            $events[] = ['type' => 'info', 'text' => 'Wsolt lel limite mta3 lyoum — l\'chghol tsajjel ama bla ghnima.'];
        }
        respond(list_tasks($uid) + ['events' => $events, 'profile' => profile($uid)]);
    },

    'delete' => function (): void {
        $uid = (int) require_user()['id'];
        db()->prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')->execute([int_param('id'), $uid]);
        respond(list_tasks($uid));
    },
]);
