<?php
// Exam plan for every level (école, collège, bac sections, prépa, fac): countdown, weekly hours goal
// and the personal programme checklist (plan_items).
require __DIR__ . '/_bootstrap.php';

const BAC_SECTIONS = ['primaire', 'college', 'math', 'sciences', 'technique', 'eco', 'info', 'lettres', 'sport', 'prepa',
    'medecine', 'pharmacie', 'escae', 'ingenieur', 'droit', 'langues', 'iset', 'fac'];
const BAC_ONLY = ['math', 'sciences', 'technique', 'eco', 'info', 'lettres', 'sport'];
const MAX_PLAN_ITEMS = 300;

function plan_payload(int $uid): array
{
    $st = db()->prepare('SELECT id, subject, title, done FROM plan_items WHERE user_id = ? ORDER BY sort, id');
    $st->execute([$uid]);
    $items = array_map(fn ($r) => ['id' => (int) $r['id'], 'subject' => $r['subject'], 'title' => $r['title'], 'done' => (bool) $r['done']], $st->fetchAll());
    $u = fetch_user($uid);
    // Own exam date first; bac students fall back to the date the admin sets.
    $examDate = $u['exam_date'] ?: (in_array($u['bac_section'], BAC_ONLY, true) ? setting('bac_date') : '');
    return [
        'bac_date'     => $examDate,
        'own_date'     => (bool) $u['exam_date'],
        'section'      => $u['bac_section'],
        'weekly_goal_hours' => (int) $u['weekly_goal_hours'],
        'week_seconds' => studied_since($uid, period_start('week')),
        'items'        => $items,
    ];
}

/** @return array{0:string,1:string} [subject, title] cleaned, or fails */
function plan_item_input(array $raw): array
{
    $cut = fn (string $s, int $n): string => trim(function_exists('mb_substr') ? mb_substr($s, 0, $n) : substr($s, 0, $n));
    $subject = $cut((string) ($raw['subject'] ?? ''), 40);
    $title = $cut((string) ($raw['title'] ?? ''), 120);
    if ($subject === '' || $title === '') fail('Ekteb l\'mada w l\'chapitre.');
    return [$subject, $title];
}

route([
    'get' => function (): void {
        respond(plan_payload((int) require_user()['id']));
    },

    // Chooses a section and (optionally) replaces the checklist with the template sent by the client.
    'set_section' => function (): void {
        $uid = (int) require_user()['id'];
        $section = (string) param('section', '');
        if (!in_array($section, BAC_SECTIONS, true)) fail('Section mouch s7i7a.');
        db()->prepare('UPDATE users SET bac_section = ? WHERE id = ?')->execute([$section, $uid]);

        $items = param('items');
        if (is_array($items)) {
            if (count($items) > MAX_PLAN_ITEMS) fail('Barcha chapitres.');
            $clean = array_map(fn ($it) => plan_item_input(is_array($it) ? $it : []), $items);
            db()->prepare('DELETE FROM plan_items WHERE user_id = ?')->execute([$uid]);
            $ins = db()->prepare('INSERT INTO plan_items (user_id, subject, title, sort, created_at) VALUES (?, ?, ?, ?, ?)');
            foreach ($clean as $i => [$subject, $title]) $ins->execute([$uid, $subject, $title, $i, now()]);
        }
        respond(plan_payload($uid) + ['message' => '🎓 Programme mte3ek wajed!']);
    },

    'add' => function (): void {
        $uid = (int) require_user()['id'];
        [$subject, $title] = plan_item_input(input());
        $st = db()->prepare('SELECT COUNT(*), COALESCE(MAX(sort), 0) FROM plan_items WHERE user_id = ?');
        $st->execute([$uid]);
        [$count, $maxSort] = $st->fetch(PDO::FETCH_NUM);
        if ((int) $count >= MAX_PLAN_ITEMS) fail('Wselt lel max mta3 l\'chapitres (' . MAX_PLAN_ITEMS . ').');
        db()->prepare('INSERT INTO plan_items (user_id, subject, title, sort, created_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$uid, $subject, $title, (int) $maxSort + 1, now()]);
        respond(plan_payload($uid));
    },

    // Ticking a chapter gives a small reward the first time.
    'toggle' => function (): void {
        $uid = (int) require_user()['id'];
        $id = int_param('id');
        $st = db()->prepare('SELECT done, done_at FROM plan_items WHERE id = ? AND user_id = ?');
        $st->execute([$id, $uid]);
        $row = $st->fetch();
        if (!$row) fail('Chapitre mouch mawjoud.');
        $done = (int) $row['done'] ? 0 : 1;
        db()->prepare('UPDATE plan_items SET done = ?, done_at = COALESCE(done_at, IF(? = 1, ?, NULL)) WHERE id = ?')
            ->execute([$done, $done, now(), $id]);
        $events = [];
        // Max 15 rewarded chapters a day, so adding + ticking fake chapters can't farm XP.
        if ($done && $row['done_at'] === null && counter_add($uid, 'plan') <= 15) {
            $events = array_merge([['type' => 'loot', 'xp' => 10, 'gold' => 3]], grant_rewards($uid, 10, 3, 0));
        }
        respond(plan_payload($uid) + ['events' => $events, 'profile' => profile($uid)]);
    },

    'delete' => function (): void {
        $uid = (int) require_user()['id'];
        db()->prepare('DELETE FROM plan_items WHERE id = ? AND user_id = ?')->execute([int_param('id'), $uid]);
        respond(plan_payload($uid));
    },

    // '' = back to the official bac date.
    'exam_date' => function (): void {
        $uid = (int) require_user()['id'];
        $date = str_param('date', 10);
        if ($date !== '' && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !strtotime($date))) fail('Date mouch s7i7a.');
        db()->prepare('UPDATE users SET exam_date = ? WHERE id = ?')->execute([$date === '' ? null : $date, $uid]);
        respond(plan_payload($uid) + ['message' => '📅 Date l\'imti7an tsajjlet.']);
    },

    'goal' => function (): void {
        $uid = (int) require_user()['id'];
        $hours = int_param('hours', 10);
        if ($hours < 1 || $hours > 80) fail('L\'objectif lezem bin 1 w 80 sa3a fel jom3a.');
        db()->prepare('UPDATE users SET weekly_goal_hours = ? WHERE id = ?')->execute([$hours, $uid]);
        respond(plan_payload($uid) + ['message' => '🎯 Objectif jdid: ' . $hours . 'h fel jom3a']);
    },
]);
