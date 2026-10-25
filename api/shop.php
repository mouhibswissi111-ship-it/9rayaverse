<?php
// Hanout (shop): list, buy, equip (cosmetics for your avatar + health potions)
require __DIR__ . '/_bootstrap.php';

function fetch_item(string $key): array
{
    $st = db()->prepare('SELECT * FROM shop_items WHERE item_key = ?');
    $st->execute([$key]);
    $item = $st->fetch();
    if (!$item) fail('L\'7aja hedhi mouch mawjouda.');
    return $item;
}

function owns(int $uid, string $key): bool
{
    $st = db()->prepare('SELECT 1 FROM user_items WHERE user_id = ? AND item_key = ?');
    $st->execute([$uid, $key]);
    return (bool) $st->fetch();
}

function equip(int $uid, array $item): void
{
    $column = $item['type'] === 'hat' ? 'hat' : 'avatar_color';
    db()->prepare("UPDATE users SET $column = ? WHERE id = ?")->execute([$item['value'], $uid]);
}

function shop_payload(int $uid): array
{
    $u = fetch_user($uid);
    $st = db()->prepare(
        'SELECT s.*, (ui.item_key IS NOT NULL) AS owned FROM shop_items s
         LEFT JOIN user_items ui ON ui.item_key = s.item_key AND ui.user_id = ?
         ORDER BY s.sort'
    );
    $st->execute([$uid]);
    $items = [];
    foreach ($st->fetchAll() as $it) {
        $it['owned'] = (bool) $it['owned'] || (int) $it['price'] === 0;
        $it['equipped'] = ($it['type'] === 'hat' && $it['value'] === $u['hat'])
            || ($it['type'] === 'color' && strcasecmp($it['value'], $u['avatar_color']) === 0);
        $items[] = $it;
    }
    return ['items' => $items, 'profile' => profile($uid)];
}

route([
    'list' => function (): void {
        respond(shop_payload((int) require_user()['id']));
    },

    'buy' => function (): void {
        $u = require_user();
        $uid = (int) $u['id'];
        $item = fetch_item((string) param('key', ''));
        $price = (int) $item['price'];

        if ($item['type'] === 'potion') {
            if ((int) $u['hp'] >= (int) $u['max_hp']) fail('Sa77tek kemla, ma t7tejch dwe.');
            $st = db()->prepare('UPDATE users SET gold = gold - ?, hp = LEAST(max_hp, hp + ?) WHERE id = ? AND gold >= ?');
            $st->execute([$price, (int) $item['value'], $uid, $price]);
            if ($st->rowCount() !== 1) fail('Ma 3andekch flous kafya.');
            respond(shop_payload($uid) + ['message' => '🧪 Chrabt l\'dwe… +' . (int) $item['value'] . ' sa77a']);
        }

        if ($price === 0 || owns($uid, $item['item_key'])) fail('Deja 3andek l\'7aja hedhi.');
        $st = db()->prepare('UPDATE users SET gold = gold - ? WHERE id = ? AND gold >= ?');
        $st->execute([$price, $uid, $price]);
        if ($st->rowCount() !== 1) fail('Ma 3andekch flous kafya. 9ra akther bech tjam3 flous!');
        db()->prepare('INSERT INTO user_items (user_id, item_key) VALUES (?, ?)')->execute([$uid, $item['item_key']]);
        equip($uid, $item);
        respond(shop_payload($uid) + ['message' => 'Chrit w lbest ' . $item['name'] . '!']);
    },

    'equip' => function (): void {
        $uid = (int) require_user()['id'];
        $item = fetch_item((string) param('key', ''));
        if ($item['type'] === 'potion') fail('L\'dwe ma yetlbesch 😄');
        if ((int) $item['price'] > 0 && !owns($uid, $item['item_key'])) fail('Echri l\'7aja hedhi 9bal.');
        equip($uid, $item);
        respond(shop_payload($uid));
    },
]);
