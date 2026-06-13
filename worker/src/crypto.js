/* EyeBreak — Cloudflare Worker signing helpers.
 *
 * BYTE-IDENTICAL port of the helpers in tools/sign-code.mjs, but using the
 * global Web Crypto (`crypto.subtle`) and `atob`/`btoa` (like js/premium.js),
 * with NO node:crypto and NO Buffer — so it runs unchanged in a Worker.
 *
 * A code minted here MUST verify against js/premium.js's PUBLIC_KEY_JWK.
 *
 * Algorithm: ECDSA, P-256 (secp256r1), SHA-256.
 * Code format: EYEBREAK-<base64url(payloadJSON)>.<base64url(rawSig)>
 *   payloadJSON = JSON.stringify({v,n,id,t})  (stable key order)
 *   Signature is RAW IEEE-P1363 (r‖s, 64 bytes), NOT DER.
 */

/* ---------- base64url helpers (byte-identical to js/premium.js) ---------- */

export function bytesToB64url(bytes) {
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(b64url) {
  var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function strToBytes(str) {
  return new TextEncoder().encode(str);
}

/* Stable-order payload serialization (byte-identical to tools/sign-code.mjs). */
export function serializePayload(p) {
  return JSON.stringify({ v: p.v, n: p.n, id: p.id, t: p.t });
}

/* ---------- key import + minting ---------- */

export function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/** Mint a signed code from a payload object {v,n,id,t} and an imported key. */
export async function mintCode(payload, key) {
  var payloadJson = serializePayload(payload);
  var payloadBytes = strToBytes(payloadJson);

  // RAW IEEE-P1363 signature (r‖s, 64 bytes for P-256) — NOT DER.
  var sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    payloadBytes
  );
  var sigBytes = new Uint8Array(sig);

  return 'EYEBREAK-' + bytesToB64url(payloadBytes) + '.' + bytesToB64url(sigBytes);
}
