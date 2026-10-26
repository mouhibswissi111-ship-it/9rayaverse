<?php
// =====================================================================
//  Copy this file to config.php and fill in your values.
//  (deploy/install.sh does this automatically on a server.)
// =====================================================================

define('DB_HOST', '127.0.0.1');
define('DB_NAME', 'rayaverse');
define('DB_USER', 'root');
define('DB_PASS', '');

define('WS_SECRET', 'put-a-long-random-secret-here');
define('WS_PORT', 8080);
// Path of the real-time server behind the web server: '/ws' (Nginx server), 'ws' (XAMPP + tunnel).
// Empty = connect straight to ws://<host>:WS_PORT.
define('WS_PUBLIC_URL', '');

// true = show technical error details (local only). Keep false on a public server.
define('APP_DEBUG', true);

define('APP_TIMEZONE', 'Africa/Tunis');

define('MAX_PDF_MB', 20);
define('MAX_IMAGE_MB', 3);
