'use strict';
// Web Push sender (RFC 8291 aes128gcm + VAPID), no extra npm package needed.
// Every minute it asks PHP (api/push.php?action=due) for queued notifications and delivers them.
//   node push.js --keys   prints a new VAPID key pair for config.php

const crypto = require('crypto');

const INTERVAL_MS = 60 * 1000;
const VAPID_SUBJECT = 'https://mouhibswissi111-ship-it.github.io/9rayaverse/';

function vapidKey(publicB64, privateB64) {
  const pub = Buffer.from(publicB64, 'base64url');
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: privateB64, x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33, 65).toString('base64url') },
    format: 'jwk',
  });
}

function vapidHeader(endpoint, publicB64, key) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUBJECT })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `vapid t=${unsigned}.${sig}, k=${publicB64}`;
}

/** Encrypts a payload for one subscription (aes128gcm content coding). */
function encrypt(p256dhB64, authB64, payload, fixed = {}) {
  const uaPublic = Buffer.from(p256dhB64, 'base64url');
  const authSecret = Buffer.from(authB64, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  if (fixed.asPrivate) ecdh.setPrivateKey(Buffer.from(fixed.asPrivate, 'base64url'));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = fixed.salt ? Buffer.from(fixed.salt, 'base64url') : crypto.randomBytes(16);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

async function sendOne(msg, publicB64, key) {
  const res = await fetch(msg.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidHeader(msg.endpoint, publicB64, key),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body: encrypt(msg.p256dh, msg.auth, JSON.stringify(msg.payload)),
  });
  return res.status;
}

/** Starts the polling loop. cfg: { publicKey, privateKey, apiUrl, secret } */
function startPush(cfg) {
  if (!cfg.publicKey || !cfg.privateKey || !cfg.apiUrl) {
    console.log('🔕 Notifications off (VAPID keys / PUSH_API_URL missing in config.php)');
    return;
  }
  let key;
  try {
    key = vapidKey(cfg.publicKey, cfg.privateKey);
  } catch (e) {
    console.error('❌ Bad VAPID keys in config.php:', e.message);
    return;
  }
  const api = (action, data = {}) => fetch(`${cfg.apiUrl}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Push-Secret': cfg.secret },
    body: JSON.stringify(data),
  }).then((r) => r.json());

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await api('due');
      if (!r.ok) throw new Error(r.error);
      for (const msg of r.messages) {
        try {
          const status = await sendOne(msg, cfg.publicKey, key);
          if (status === 404 || status === 410) await api('gone', { endpoint: msg.endpoint });
          else if (status >= 400) console.warn('push failed', status);
        } catch (e) { console.warn('push error', e.message); }
      }
      if (r.messages.length) console.log(`🔔 sent ${r.messages.length} notification(s)`);
    } catch (e) {
      console.warn('push poll failed:', e.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, INTERVAL_MS);
  console.log('🔔 Notifications on');
}

module.exports = { startPush, encrypt };

if (require.main === module && process.argv.includes('--keys')) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  console.log(`define('VAPID_PUBLIC', '${ecdh.getPublicKey().toString('base64url')}');`);
  console.log(`define('VAPID_PRIVATE', '${ecdh.getPrivateKey().toString('base64url')}');`);
}
