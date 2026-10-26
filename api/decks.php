<?php
// Cartes: decks of question/answer cards, spaced repetition (Leitner boxes), sharing with a group
require __DIR__ . '/_bootstrap.php';

const MAX_DECKS = 50;
const MAX_CARDS_PER_DECK = 300;
const BOX_DAYS = [1 => 0, 2 => 1, 3 => 3, 4 => 7, 5 => 14]; // days until the next review per box
const CARD_XP_PER_DAY = 40;                                   // max n9at from cards in one day

function own_deck(int $deckId, int $uid): array
{
    $st = db()->prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?');
    $st->execute([$deckId, $uid]);
    $deck = $st->fetch();
    if (!$deck) fail('Paquet mouch mawjoud.');
    return $deck;
}

/** A deck the user may read: their own, or one shared with a group they are in. */
function readable_deck(int $deckId, int $uid): array
{
    $st = db()->prepare(
        'SELECT d.* FROM decks d WHERE d.id = ? AND (d.user_id = ?
           OR (d.group_id IS NOT NULL AND d.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)))'
    );
    $st->execute([$deckId, $uid, $uid]);
    $deck = $st->fetch();
    if (!$deck) fail('Paquet mouch mawjoud.');
    return $deck;
}

function decks_payload(int $uid): array
{
    $st = db()->prepare(
        "SELECT d.id, d.title, d.group_id, g.name AS group_name,
                (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS cards,
                (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.due_date <= ?) AS due,
                (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.box >= 4) AS learned
         FROM decks d LEFT JOIN study_groups g ON g.id = d.group_id
         WHERE d.user_id = ? ORDER BY d.id DESC"
    );
    $st->execute([today(), $uid]);
    $mine = $st->fetchAll();

    $sh = db()->prepare(
        'SELECT d.id, d.title, u.username AS owner, g.name AS group_name,
                (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS cards
         FROM decks d JOIN users u ON u.id = d.user_id JOIN study_groups g ON g.id = d.group_id
         WHERE d.user_id <> ? AND d.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
         ORDER BY d.id DESC LIMIT 50'
    );
    $sh->execute([$uid, $uid]);

    $ints = fn (array $rows, array $keys) => array_map(function ($r) use ($keys) {
        foreach ($keys as $k) $r[$k] = $r[$k] === null ? null : (int) $r[$k];
        return $r;
    }, $rows);
    return [
        'decks'  => $ints($mine, ['id', 'group_id', 'cards', 'due', 'learned']),
        'shared' => $ints($sh->fetchAll(), ['id', 'cards']),
        'today_cards' => counter_since($uid, 'cards', today()),
    ];
}

function card_text(string $key): string
{
    $v = trim((string) param($key, ''));
    $v = function_exists('mb_substr') ? mb_substr($v, 0, 300) : substr($v, 0, 300);
    if ($v === '') fail('Ekteb l\'so2el w l\'jweb.');
    return $v;
}

function deck_cards(int $deckId): array
{
    $st = db()->prepare('SELECT id, front, back, box, due_date FROM cards WHERE deck_id = ? ORDER BY id');
    $st->execute([$deckId]);
    return array_map(fn ($c) => ['id' => (int) $c['id'], 'front' => $c['front'], 'back' => $c['back'], 'box' => (int) $c['box'], 'due' => $c['due_date'] <= today()], $st->fetchAll());
}

route([
    'list' => function (): void {
        respond(decks_payload((int) require_user()['id']));
    },

    'create' => function (): void {
        $uid = (int) require_user()['id'];
        $title = str_param('title', 80);
        if (strlen($title) < 2) fail('Ekteb esm lel paquet.');
        $st = db()->prepare('SELECT COUNT(*) FROM decks WHERE user_id = ?');
        $st->execute([$uid]);
        if ((int) $st->fetchColumn() >= MAX_DECKS) fail('Wselt lel max (' . MAX_DECKS . ' paquets).');
        db()->prepare('INSERT INTO decks (user_id, title, created_at) VALUES (?, ?, ?)')->execute([$uid, $title, now()]);
        $deckId = (int) db()->lastInsertId();
        respond(decks_payload($uid) + ['deck_id' => $deckId, 'message' => '🃏 Paquet jdid! Zid cartes.']);
    },

    'rename' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = own_deck(int_param('deck_id'), $uid);
        $title = str_param('title', 80);
        if (strlen($title) < 2) fail('Ekteb esm lel paquet.');
        db()->prepare('UPDATE decks SET title = ? WHERE id = ?')->execute([$title, $deck['id']]);
        respond(decks_payload($uid));
    },

    'delete' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = own_deck(int_param('deck_id'), $uid);
        db()->prepare('DELETE FROM decks WHERE id = ?')->execute([$deck['id']]);
        respond(decks_payload($uid));
    },

    'share' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = own_deck(int_param('deck_id'), $uid);
        $gid = int_param('group_id');
        if ($gid > 0 && !is_group_member($gid, $uid)) fail('Enti mouch fel jme3a hedhi.', 403);
        db()->prepare('UPDATE decks SET group_id = ? WHERE id = ?')->execute([$gid > 0 ? $gid : null, $deck['id']]);
        respond(decks_payload($uid) + ['message' => $gid > 0 ? '🤝 L\'paquet tpartaga m3a l\'jme3a.' : '🔒 L\'paquet walla privé.']);
    },

    // Copies a friend's shared deck into my decks (fresh progress).
    'clone' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = readable_deck(int_param('deck_id'), $uid);
        if ((int) $deck['user_id'] === $uid) fail('Hedha paquet mte3ek deja.');
        db()->prepare('INSERT INTO decks (user_id, title, created_at) VALUES (?, ?, ?)')->execute([$uid, $deck['title'], now()]);
        $newId = (int) db()->lastInsertId();
        db()->prepare('INSERT INTO cards (deck_id, front, back, box, due_date, created_at) SELECT ?, front, back, 1, ?, ? FROM cards WHERE deck_id = ?')
            ->execute([$newId, today(), now(), $deck['id']]);
        respond(decks_payload($uid) + ['message' => '📥 L\'paquet tzad 3andek!']);
    },

    'cards' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = readable_deck(int_param('deck_id'), $uid);
        respond(['deck' => ['id' => (int) $deck['id'], 'title' => $deck['title'], 'mine' => (int) $deck['user_id'] === $uid], 'cards' => deck_cards((int) $deck['id'])]);
    },

    'add_card' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = own_deck(int_param('deck_id'), $uid);
        $front = card_text('front');
        $back = card_text('back');
        $st = db()->prepare('SELECT COUNT(*) FROM cards WHERE deck_id = ?');
        $st->execute([$deck['id']]);
        if ((int) $st->fetchColumn() >= MAX_CARDS_PER_DECK) fail('Wselt lel max (' . MAX_CARDS_PER_DECK . ' carta fel paquet).');
        db()->prepare('INSERT INTO cards (deck_id, front, back, due_date, created_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$deck['id'], $front, $back, today(), now()]);
        respond(['cards' => deck_cards((int) $deck['id'])]);
    },

    'edit_card' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = own_deck(int_param('deck_id'), $uid);
        db()->prepare('UPDATE cards SET front = ?, back = ? WHERE id = ? AND deck_id = ?')
            ->execute([card_text('front'), card_text('back'), int_param('card_id'), $deck['id']]);
        respond(['cards' => deck_cards((int) $deck['id'])]);
    },

    'delete_card' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = own_deck(int_param('deck_id'), $uid);
        db()->prepare('DELETE FROM cards WHERE id = ? AND deck_id = ?')->execute([int_param('card_id'), $deck['id']]);
        respond(['cards' => deck_cards((int) $deck['id'])]);
    },

    // One answer during a review or quiz: right → next box, wrong → back to box 1.
    'grade' => function (): void {
        $uid = (int) require_user()['id'];
        $deck = own_deck(int_param('deck_id'), $uid);
        $st = db()->prepare('SELECT * FROM cards WHERE id = ? AND deck_id = ?');
        $st->execute([int_param('card_id'), $deck['id']]);
        $card = $st->fetch();
        if (!$card) fail('Carta mouch mawjouda.');
        $ok = bool_param('ok');
        $box = $ok ? min(5, (int) $card['box'] + 1) : 1;
        $due = date('Y-m-d', strtotime('+' . BOX_DAYS[$box] . ' days'));
        db()->prepare('UPDATE cards SET box = ?, due_date = ? WHERE id = ?')->execute([$box, $due, $card['id']]);

        $reviewed = counter_add($uid, 'cards');
        $events = [];
        if ($ok && $reviewed <= CARD_XP_PER_DAY) $events = grant_rewards($uid, 1, $reviewed % 10 === 0 ? 2 : 0, 1);
        respond(['box' => $box, 'today_cards' => $reviewed, 'events' => $events]);
    },
]);
