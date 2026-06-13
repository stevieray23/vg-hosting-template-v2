#!/usr/bin/env node
/* EyeBreak — seller-side unlock-code signing tool.
 *
 * Mints the offline, signed "supporter unlock" codes the app verifies with
 * Web Crypto (no network, no account). This is a SUPPORTER UNLOCK, not DRM:
 * the only property the signature buys is "nobody can mint a valid code
 * without the private key, which never ships."
 *
 * The base64url + payload-serialization helpers below are byte-identical to
 * the ones in js/premium.js, and the app verifies the EXACT decoded payload
 * bytes (it does not re-serialize). Keep the two in sync.
 *
 * Algorithm: ECDSA, P-256 (secp256r1), SHA-256. Signature is RAW
 * IEEE-P1363 (r‖s, 64 bytes), NOT DER.
 *
 * Usage:
 *   node tools/sign-code.mjs keygen
 *       Generate a keypair. Writes the PRIVATE key to
 *       tools/eyebreak-private-key.jwk (refuses to overwrite) and prints the
 *       PUBLIC JWK to paste into js/premium.js (PUBLIC_KEY_JWK).
 *
 *   node tools/sign-code.mjs --name "Jane D." --order "GUM-12345"
 *       Load the private key, sign a payload, print the EYEBREAK-… code.
 */

import { webcrypto } from 'node:crypto';
import { writeFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

var subtle = webcrypto.subtle;

var HERE = dirname(fileURLToPath(import.meta.url));
var PRIVATE_KEY_PATH = join(HERE, 'eyebreak-private-key.jwk');

/* ---------- base64url helpers (byte-identical to js/premium.js) ---------- */

function bytesToB64url(bytes) {
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var b64 = Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(b64url) {
  var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin = Buffer.from(b64, 'base64').toString('binary');
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

/* Stable-order payload serialization (byte-identical to js/premium.js). */
function serializePayload(p) {
  return JSON.stringify({ v: p.v, n: p.n, id: p.id, t: p.t });
}

/* ---------- key generation ---------- */

async function keygen() {
  var exists = false;
  try { await access(PRIVATE_KEY_PATH); exists = true; } catch (e) { /* absent */ }
  if (exists) {
    console.error('Refusing to overwrite existing private key at:\n  ' + PRIVATE_KEY_PATH +
      '\nDelete it manually first if you really mean to regenerate (this invalidates every code already sold).');
    process.exit(1);
  }

  var pair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  var privJwk = await subtle.exportKey('jwk', pair.privateKey);
  var pubJwk = await subtle.exportKey('jwk', pair.publicKey);

  await writeFile(PRIVATE_KEY_PATH, JSON.stringify(privJwk, null, 2) + '\n', { mode: 0o600 });

  // The public JWK pasted into premium.js only needs kty/crv/x/y.
  var pubForApp = { kty: pubJwk.kty, crv: pubJwk.crv, x: pubJwk.x, y: pubJwk.y };

  console.log('Keypair generated.');
  console.log('');
  console.log('PRIVATE key written to: ' + PRIVATE_KEY_PATH);
  console.log('  -> BACK THIS UP somewhere safe. NEVER commit it. It is gitignored.');
  console.log('  -> Losing it means you can never mint new codes; leaking it lets anyone mint codes.');
  console.log('');
  console.log('PUBLIC key — paste this object into js/premium.js as PUBLIC_KEY_JWK:');
  console.log('');
  console.log(JSON.stringify(pubForApp, null, 2));
  console.log('');
}

/* ---------- code minting ---------- */

function parseArgs(argv) {
  var out = {};
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--name') { out.name = argv[++i]; }
    else if (a === '--order') { out.order = argv[++i]; }
    else if (a === '--issued') { out.issued = argv[++i]; }
  }
  return out;
}

async function loadPrivateKey() {
  var raw;
  try {
    raw = await readFile(PRIVATE_KEY_PATH, 'utf8');
  } catch (e) {
    console.error('No private key found at:\n  ' + PRIVATE_KEY_PATH +
      '\nRun `node tools/sign-code.mjs keygen` first.');
    process.exit(1);
  }
  var jwk = JSON.parse(raw);
  return subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function mint(args) {
  if (!args.name || !args.order) {
    console.error('Usage: node tools/sign-code.mjs --name "Jane D." --order "GUM-12345" [--issued <epochMs>]');
    process.exit(1);
  }
  var key = await loadPrivateKey();

  var payload = {
    v: 1,
    n: String(args.name),
    id: String(args.order),
    t: args.issued ? Number(args.issued) : Date.now()
  };

  var payloadJson = serializePayload(payload);
  var payloadBytes = strToBytes(payloadJson);

  // RAW IEEE-P1363 signature (r‖s, 64 bytes for P-256) — NOT DER.
  var sig = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    payloadBytes
  );
  var sigBytes = new Uint8Array(sig);

  var code = 'EYEBREAK-' + bytesToB64url(payloadBytes) + '.' + bytesToB64url(sigBytes);

  console.log(code);
}

/* ---------- entry ---------- */

async function main() {
  var argv = process.argv.slice(2);
  if (argv[0] === 'keygen') {
    await keygen();
    return;
  }
  await mint(parseArgs(argv));
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
