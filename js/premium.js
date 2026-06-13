/* EyeBreak — supporter unlock (offline signed-code verifier + gating).
 *
 * HONEST FRAMING — read this before "improving" it:
 * This is a SUPPORTER UNLOCK, not DRM. The app is open source; anyone can read
 * this file and flip the check locally. The signature exists for exactly one
 * property: nobody can mint a valid code without the private key, which never
 * ships. No minification, no anti-tamper — that would be dishonest and useless.
 *
 * What it unlocks is COSMETIC / CONVENIENCE ONLY: color themes, chime sound
 * packs, and a custom reminder interval. The core app (reminders, exercises,
 * snooze/skip, stats, notifications) is free forever and is NEVER gated here.
 *
 * Verification is fully OFFLINE via Web Crypto (no network, no account):
 *   ECDSA, P-256 (secp256r1), SHA-256.
 *   Code format: EYEBREAK-<base64url(payloadJSON)>.<base64url(rawSig)>
 *   payloadJSON = JSON.stringify({v,n,id,t}) (stable key order).
 *   Signature is RAW IEEE-P1363 (r‖s, 64 bytes), NOT DER.
 *   The verifier checks the EXACT decoded payload bytes — it never
 *   re-serializes a parsed object (avoids serialization drift).
 *
 * The base64url + serialization helpers below are byte-identical to
 * tools/sign-code.mjs. Keep them in sync.
 */
(function () {
  'use strict';

  var S = window.EB.settings;

  /* ----- Editable seller config ----- */

  // One-time supporter price, shown in the UI. Single source of truth — edit here.
  var PRICE = '€9';

  // TODO (seller): set this to your real hosted checkout URL once the store is
  // live (e.g. a Lemon Squeezy / Polar.sh / Paddle checkout link). Placeholder.
  var STORE_URL = 'https://your-store.lemonsqueezy.com/checkout';

  // Public key for verifying codes. Generated with `node tools/sign-code.mjs keygen`.
  // SAFE to ship publicly — it can only verify, never mint.
  var PUBLIC_KEY_JWK = {
    kty: 'EC',
    crv: 'P-256',
    x: 'GhwvqLIaP0FL1dxC3ub9o3WaUfkQRhWNeMOyVhJdwe0',
    y: 'vdR41GyNFJYzzOm0F0gSXOw29SFY1KK-cEBPGV8cmZk'
  };

  /* ----- base64url helpers (byte-identical to tools/sign-code.mjs) ----- */

  function b64urlToBytes(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToStr(bytes) {
    return new TextDecoder().decode(bytes);
  }

  /* ----- state ----- */

  var verified = false;          // signature confirmed this session
  var verifiedName = null;       // buyer name from the verified payload
  var listeners = [];

  function cryptoOk() {
    return !!(window.crypto && window.crypto.subtle);
  }

  function isUnlocked() {
    // Source of truth is the verified signature, never a bare stored boolean.
    return verified && !!(S.state.supporter && S.state.supporter.code);
  }

  function info() {
    var sup = S.state.supporter || {};
    return {
      unlocked: isUnlocked(),
      name: isUnlocked() ? (verifiedName || sup.name || null) : null,
      unlockedAt: isUnlocked() ? (sup.unlockedAt || null) : null
    };
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function fireChange() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](info()); } catch (e) { /* listener must not break others */ }
    }
  }

  var keyPromise = null;
  function getKey() {
    if (!keyPromise) {
      keyPromise = window.crypto.subtle.importKey(
        'jwk',
        PUBLIC_KEY_JWK,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
    }
    return keyPromise;
  }

  /** Parse + verify a raw pasted code. Resolves {ok, name?, payload?, error?}. */
  function verifyCode(rawCode) {
    if (!cryptoOk()) {
      return Promise.resolve({ ok: false, error: 'crypto-unavailable' });
    }
    var code = String(rawCode == null ? '' : rawCode).trim();
    // Whitespace/case tolerant on the prefix; strip stray internal whitespace.
    code = code.replace(/\s+/g, '');
    var m = /^EYEBREAK-([A-Za-z0-9\-_]+)\.([A-Za-z0-9\-_]+)$/i.exec(code);
    if (!m) {
      return Promise.resolve({ ok: false, error: 'format' });
    }
    var payloadBytes, sigBytes, payload;
    try {
      payloadBytes = b64urlToBytes(m[1]);
      sigBytes = b64urlToBytes(m[2]);
      // Parse only to read name/order — verification uses the raw bytes.
      payload = JSON.parse(bytesToStr(payloadBytes));
    } catch (e) {
      return Promise.resolve({ ok: false, error: 'format' });
    }

    return getKey().then(function (key) {
      return window.crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        sigBytes,
        payloadBytes
      );
    }).then(function (valid) {
      if (!valid) return { ok: false, error: 'signature' };
      return { ok: true, name: (payload && payload.n) || null, payload: payload, code: code };
    }).catch(function () {
      return { ok: false, error: 'signature' };
    });
  }

  /** Verify + persist a code. Resolves {ok, name?, error?}. */
  function redeem(rawCode) {
    return verifyCode(rawCode).then(function (res) {
      if (!res.ok) return res;
      verified = true;
      verifiedName = res.name;
      S.set({
        supporter: {
          unlockedAt: Date.now(),
          name: res.name,
          code: res.code
        }
      });
      S.save();
      fireChange();
      return { ok: true, name: res.name };
    });
  }

  /** Re-verify the stored code on load. Tampered/bogus codes leave it locked. */
  function verifyAtBoot() {
    var sup = S.state.supporter;
    if (!sup || !sup.code) return Promise.resolve(false);
    return verifyCode(sup.code).then(function (res) {
      if (res.ok) {
        verified = true;
        verifiedName = res.name || sup.name || null;
      } else {
        verified = false;
        verifiedName = null;
      }
      fireChange();
      return verified;
    });
  }

  window.EB = window.EB || {};
  window.EB.premium = {
    PRICE: PRICE,
    STORE_URL: STORE_URL,
    isUnlocked: isUnlocked,
    redeem: redeem,
    info: info,
    onChange: onChange,
    verifyAtBoot: verifyAtBoot,
    cryptoOk: cryptoOk
  };
})();
