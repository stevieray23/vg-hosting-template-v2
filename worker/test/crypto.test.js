/* EyeBreak Worker — crypto cross-compat test.
 *
 * Proves a code minted by worker/src/crypto.js verifies with the SAME
 * verify call + PUBLIC_KEY_JWK that js/premium.js uses, and that a tampered
 * code is rejected.
 *
 * Run with:  node worker/test/crypto.test.js
 * Uses node's global webcrypto (`crypto.subtle`) — the same primitives the
 * Worker runtime and the browser expose. No wrangler runtime required.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mintCode, importPrivateKey, b64urlToBytes } from '../src/crypto.js';

var HERE = dirname(fileURLToPath(import.meta.url));
var ROOT = join(HERE, '..', '..');

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS  ' + msg); }
  else { console.error('  FAIL  ' + msg); failures++; }
}

/* Pull PUBLIC_KEY_JWK out of js/premium.js exactly as it ships (no copy). */
async function loadPublicKeyJwkFromPremium() {
  var src = await readFile(join(ROOT, 'js', 'premium.js'), 'utf8');
  var m = /var PUBLIC_KEY_JWK = (\{[\s\S]*?\});/.exec(src);
  if (!m) throw new Error('could not locate PUBLIC_KEY_JWK in js/premium.js');
  // The object literal uses unquoted keys + single quotes; eval it safely.
  // eslint-disable-next-line no-new-func
  return (new Function('return (' + m[1] + ');'))();
}

/* The EXACT verify path js/premium.js runs (import 'jwk' with ['verify'],
 * ECDSA/SHA-256, raw sig over the decoded payload bytes). */
async function verifyLikePremium(code, publicJwk) {
  var m = /^EYEBREAK-([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)$/i.exec(String(code).trim());
  if (!m) return false;
  var payloadBytes = b64urlToBytes(m[1]);
  var sigBytes = b64urlToBytes(m[2]);
  var key = await crypto.subtle.importKey(
    'jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
  );
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, payloadBytes
  );
}

async function main() {
  var publicJwk = await loadPublicKeyJwkFromPremium();

  // Try the REAL keypair first (proves the shipped public key matches the
  // gitignored private key). Fall back to an ephemeral keypair if the private
  // key file isn't present (fresh checkout / CI), which still proves the
  // worker's mint+verify crypto is byte-correct.
  var privateKey, expectVerifyJwk, mode;
  try {
    var privRaw = await readFile(join(ROOT, 'tools', 'eyebreak-private-key.jwk'), 'utf8');
    privateKey = await importPrivateKey(JSON.parse(privRaw));
    expectVerifyJwk = publicJwk;
    mode = 'real keypair (verifies against shipped PUBLIC_KEY_JWK)';
  } catch (e) {
    var pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
    );
    privateKey = pair.privateKey;
    var pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    expectVerifyJwk = { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y };
    mode = 'ephemeral keypair (private key file absent)';
  }
  console.log('Crypto cross-compat — mode: ' + mode);

  var code = await mintCode(
    { v: 1, n: 'Jane D.', id: 'EB-1001', t: 1718000000000 }, privateKey
  );
  console.log('  minted code length: ' + code.length + ' chars');

  var ok = await verifyLikePremium(code, expectVerifyJwk);
  assert(ok === true, 'worker-minted code verifies via premium.js verify path (ok:true)');

  // Tamper the payload segment (flip a char) → must fail.
  var dot = code.indexOf('.');
  var head = code.slice(0, dot);
  var sig = code.slice(dot);
  var ch = head[head.length - 1];
  var swapped = ch === 'A' ? 'B' : 'A';
  var tampered = head.slice(0, -1) + swapped + sig;
  var bad = await verifyLikePremium(tampered, expectVerifyJwk);
  assert(bad === false, 'tampered code is rejected (ok:false)');

  if (failures) { console.error('\nCRYPTO TEST FAILED (' + failures + ')'); process.exit(1); }
  console.log('\nCRYPTO TEST OK');
}

main().catch(function (e) { console.error(e); process.exit(1); });
