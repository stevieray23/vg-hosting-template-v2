/* EyeBreak Worker — route tests (no wrangler runtime).
 *
 * Imports the router (`handle`) directly and passes a mocked env + a stubbed
 * fetch for the Lemon Squeezy Orders API. Verifies:
 *   /claim   missing order → 400; unverified → 403; paid → 302 + valid code
 *   /webhook good HMAC + order_created → 200 (+ mint); bad sig → 401
 *   /health  → 200
 *
 * Run with:  node worker/test/routes.test.js
 */

import { handle } from '../src/index.js';
import { b64urlToBytes } from '../src/crypto.js';

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS  ' + msg); }
  else { console.error('  FAIL  ' + msg); failures++; }
}

/* Generate a real P-256 keypair for the test env; mint with the worker, verify
 * the extracted code with the matching public key (same verify path as the app). */
async function makeEnv() {
  var pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  );
  var privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  var pubJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    env: {
      APP_BASE_URL: 'https://example.test/vg-hosting-template-v2',
      LS_STORE_ID: '12345',
      LS_PRODUCT_ID: '67890',
      LS_VARIANT_ID: '',
      LS_API_KEY: 'test-api-key',
      LS_WEBHOOK_SECRET: 'test-webhook-secret',
      EYEBREAK_PRIVATE_JWK: JSON.stringify(privJwk)
    },
    publicJwk: { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y }
  };
}

async function verifyCode(code, publicJwk) {
  var m = /^EYEBREAK-([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)$/i.exec(String(code).trim());
  if (!m) return false;
  var key = await crypto.subtle.importKey(
    'jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, b64urlToBytes(m[2]), b64urlToBytes(m[1])
  );
}

/* A paid order matching store + product, JSON:API shape. */
function paidOrder() {
  return {
    data: {
      id: 'ORDER-1',
      attributes: {
        status: 'paid',
        store_id: 12345,
        order_number: 1001,
        user_name: 'Jane D.',
        first_order_item: { product_id: 67890, variant_id: 1 }
      }
    }
  };
}

function jsonResponse(obj, ok) {
  return Promise.resolve({
    ok: ok !== false,
    json: function () { return Promise.resolve(obj); }
  });
}

async function hmacHex(secret, body) {
  var key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  var mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  var bytes = new Uint8Array(mac);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

async function main() {
  var ctx = await makeEnv();
  var env = ctx.env;

  /* ---- /health ---- */
  var health = await handle(new Request('https://w/health'), env, {}, function () {
    throw new Error('fetch should not be called for /health');
  });
  assert(health.status === 200, '/health → 200');

  /* ---- /claim missing order → 400 ---- */
  var missing = await handle(new Request('https://w/claim'), env, {}, function () {
    throw new Error('fetch should not be called when order missing');
  });
  assert(missing.status === 400, '/claim with no order → 400');

  /* ---- /claim unverified (unpaid) order → 403 ---- */
  var unpaidStub = function () {
    var o = paidOrder(); o.data.attributes.status = 'pending';
    return jsonResponse(o);
  };
  var unverified = await handle(
    new Request('https://w/claim?order=ORDER-1'), env, {}, unpaidStub
  );
  assert(unverified.status === 403, '/claim with unpaid order → 403');

  /* ---- /claim paid → 302 + code that verifies ---- */
  var paidStub = function (url, opts) {
    assert(/\/v1\/orders\/ORDER-1$/.test(url), '  getOrder hits /v1/orders/ORDER-1');
    assert(opts && opts.headers && opts.headers.Authorization === 'Bearer test-api-key',
      '  getOrder sends Bearer auth');
    return jsonResponse(paidOrder());
  };
  var claim = await handle(
    new Request('https://w/claim?order=ORDER-1'), env, {}, paidStub
  );
  assert(claim.status === 302, '/claim with paid order → 302');
  var loc = claim.headers.get('Location');
  assert(loc && loc.indexOf(env.APP_BASE_URL + '/?code=') === 0,
    '/claim redirects to APP_BASE_URL/?code=');
  var code = decodeURIComponent(loc.split('?code=')[1]);
  var claimOk = await verifyCode(code, ctx.publicJwk);
  assert(claimOk === true, 'minted /claim code verifies against the keypair');

  /* ---- /claim non-GET → 405 ---- */
  var claimPost = await handle(
    new Request('https://w/claim?order=ORDER-1', { method: 'POST' }), env, {},
    function () { return jsonResponse(paidOrder()); }
  );
  assert(claimPost.status === 405, '/claim non-GET → 405');

  /* ---- /webhook good HMAC + order_created → 200 ---- */
  var hookBody = JSON.stringify({
    meta: { event_name: 'order_created' },
    data: { id: 'ORDER-1', attributes: { user_name: 'Jane D.', order_number: 1001 } }
  });
  var goodSig = await hmacHex(env.LS_WEBHOOK_SECRET, hookBody);
  var hook = await handle(new Request('https://w/webhook', {
    method: 'POST',
    headers: { 'X-Signature': goodSig, 'X-Event-Name': 'order_created' },
    body: hookBody
  }), env, {});
  assert(hook.status === 200, '/webhook good sig + order_created → 200');

  /* ---- /webhook non-order_created → 200 ignored ---- */
  var ignoredSig = await hmacHex(env.LS_WEBHOOK_SECRET, hookBody);
  var ignored = await handle(new Request('https://w/webhook', {
    method: 'POST',
    headers: { 'X-Signature': ignoredSig, 'X-Event-Name': 'subscription_created' },
    body: hookBody
  }), env, {});
  assert(ignored.status === 200, '/webhook other event → 200 (ignored)');

  /* ---- /webhook bad sig → 401 ---- */
  var bad = await handle(new Request('https://w/webhook', {
    method: 'POST',
    headers: { 'X-Signature': 'deadbeef', 'X-Event-Name': 'order_created' },
    body: hookBody
  }), env, {});
  assert(bad.status === 401, '/webhook bad signature → 401');

  /* ---- unknown route → 404 ---- */
  var nf = await handle(new Request('https://w/nope'), env, {});
  assert(nf.status === 404, 'unknown route → 404');

  if (failures) { console.error('\nROUTE TESTS FAILED (' + failures + ')'); process.exit(1); }
  console.log('\nROUTE TESTS OK');
}

main().catch(function (e) { console.error(e); process.exit(1); });
