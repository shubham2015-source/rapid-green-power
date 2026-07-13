<?php
// PHP Backend API for ThreadFlow - Serves requests from client.js
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

header('Content-Type: application/json; charset=utf-8');
$c = require __DIR__.'/config.php';

try {
    $pdo = new PDO("mysql:host={$c['host']};dbname={$c['database']};charset=utf8mb4", $c['username'], $c['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch(Throwable $e) {
    http_response_code(500);
    exit(json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]));
}

function out($x){echo json_encode($x);exit;} 
function body(){return json_decode(file_get_contents('php://input'),true)?:[];} 

$action = $_GET['action'] ?? '';

if ($action === 'list') {
    out([
        'orders' => $pdo->query('SELECT * FROM orders ORDER BY created_at DESC')->fetchAll(),
        'lots' => $pdo->query('SELECT l.*, o.order_number, o.party FROM lots l JOIN orders o ON o.id = l.order_id ORDER BY l.id DESC')->fetchAll(),
        'dispatches' => $pdo->query('SELECT d.*, o.order_number, o.party FROM dispatches d JOIN orders o ON o.id = d.order_id ORDER BY d.id DESC')->fetchAll()
    ]);
}

if ($action === 'order' && $_SERVER['REQUEST_METHOD'] === 'POST') { 
    $d = body();
    foreach(['party','quality','shade','quantity','order_date'] as $x) {
        if(empty($d[$x])) out(['error' => 'Missing ' . $x]);
    }
    $n = 'ORD-'.date('ymd').'-'.str_pad((string)random_int(1,9999),4,'0',STR_PAD_LEFT);
    $s = $pdo->prepare('INSERT INTO orders(order_number,party,count_label,quality,yarn,shade,quantity,order_date,due_date) VALUES(?,?,?,?,?,?,?,?,?)');
    $s->execute([
        $n,
        trim($d['party']),
        trim($d['count_label']??''),
        trim($d['quality']),
        floatval($d['yarn']??0),
        trim($d['shade']),
        intval($d['quantity']),
        $d['order_date'],
        $d['due_date'] ?: null
    ]);
    out(['ok' => true]);
}

if ($action === 'lot' && $_SERVER['REQUEST_METHOD'] === 'POST') { 
    $d = body();
    $type = $d['lot_type'] ?? '';
    $id = intval($d['order_id'] ?? 0);
    $q = intval($d['quantity'] ?? 0);
    if (!in_array($type, ['dyeing','production'], true) || !$id || $q < 1) {
        out(['error' => 'Invalid lot entry.']);
    }
    
    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO lots(order_id,lot_type,lot_number,entry_date,quantity) VALUES(?,?,?,?,?)')->execute([
        $id,
        $type,
        intval($d['lot_number']),
        $d['entry_date'],
        $q
    ]);
    $pdo->prepare('UPDATE orders SET '.$type.'='.$type.'+? WHERE id=?')->execute([$q, $id]);
    $pdo->commit();
    out(['ok' => true]);
}

if ($action === 'dispatch' && $_SERVER['REQUEST_METHOD'] === 'POST') { 
    $d = body();
    $id = intval($d['order_id'] ?? 0);
    $q = intval($d['quantity'] ?? 0);
    
    $pdo->beginTransaction();
    $pdo->prepare('INSERT INTO dispatches(order_id,dispatch_date,quantity,reference_no) VALUES(?,?,?,?)')->execute([
        $id,
        $d['dispatch_date'],
        $q,
        trim($d['reference_no'] ?? '')
    ]);
    $pdo->prepare('UPDATE orders SET dispatched=dispatched+? WHERE id=?')->execute([$q, $id]);
    $pdo->commit();
    out(['ok' => true]);
}

if ($action === 'delete' && $_SERVER['REQUEST_METHOD'] === 'POST') { 
    $id = intval(body()['id'] ?? 0);
    $pdo->prepare('DELETE FROM orders WHERE id=?')->execute([$id]);
    out(['ok' => true]);
}

if ($action === 'import' && $_SERVER['REQUEST_METHOD'] === 'POST') { 
    $rows = body()['rows'] ?? [];
    $s = $pdo->prepare('INSERT INTO orders(order_number,party,count_label,quality,yarn,shade,quantity,order_date,production,dispatched) VALUES(?,?,?,?,?,?,?,?,?,?)');
    $count = 0;
    foreach($rows as $d){
        if(empty($d['party']) || empty($d['quantity'])) continue;
        $n = 'IMP-'.date('ymd').'-'.str_pad((string)random_int(1,999999),6,'0',STR_PAD_LEFT);
        $s->execute([
            $n,
            trim($d['party']),
            $d['count_label'] ?? '',
            trim($d['quality'] ?? ''),
            floatval($d['yarn'] ?? 0),
            trim($d['shade'] ?? ''),
            intval($d['quantity']),
            $d['order_date'] ?: date('Y-m-d'),
            intval($d['production'] ?? 0),
            intval($d['dispatched'] ?? 0)
        ]);
        $count++;
    }
    out(['ok' => true, 'count' => $count]);
}

http_response_code(404);
out(['error' => 'Unknown request.']);
