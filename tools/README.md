# EyeBreak — supporter-code signing tool

`sign-code.mjs` mints the offline, signed **supporter unlock** codes that the
app verifies with Web Crypto — no network, no account, no backend.

> **This is a supporter unlock, not DRM.** The app is open source; anyone can
> read `js/premium.js` and flip the check locally. The signature buys exactly
> one property: **nobody can mint a valid code without the private key, which
> never ships.** Don't try to obfuscate it.

The unlock only enables **cosmetic / convenience extras** (color themes, chime
packs, custom reminder interval). The core app stays free and ungated.

## 1. Generate your keypair (once, ever)

```sh
node tools/sign-code.mjs keygen
```

This:

- writes the **private** key to `tools/eyebreak-private-key.jwk` (mode `600`),
  and **refuses to overwrite** an existing one;
- prints the **public** JWK to paste into `js/premium.js` as `PUBLIC_KEY_JWK`.

> **⚠️ BACK UP THE PRIVATE KEY AND NEVER COMMIT IT.**
> It is already listed in `.gitignore`. If you lose it you can never mint new
> codes (every code already sold keeps working). If it leaks, anyone can mint
> codes — rotate by generating a new keypair and shipping a new public key
> (which invalidates all prior codes).

## 2. Mint a code per sale

```sh
node tools/sign-code.mjs --name "Jane D." --order "LS-12345"
# → EYEBREAK-<base64url(payload)>.<base64url(rawSig)>
```

- `--name` is shown in-app as "thank you, <name>".
- `--order` is your store's order id (recorded in the payload, not enforced).
- Optional `--issued <epochMs>` to set the issue timestamp (defaults to now).

For a **pre-minted pool** (Lemon Squeezy / Paddle key upload), mint as many as
you need ahead of time and upload them as the product's license-key pool, so the
emailed key *is* the signed code. Confirm the store's key field accepts the
full ~120–170 character code.

## Crypto details (must match `js/premium.js`)

- ECDSA, **P-256 (secp256r1), SHA-256**.
- Signature is **raw IEEE-P1363 (r‖s, 64 bytes)**, NOT DER.
- Payload: `JSON.stringify({v:1, n:name, id:order, t:issueMs})` with stable key
  order; the app verifies the **exact decoded payload bytes** (it never
  re-serializes a parsed object).
- The base64url + serialization helpers in this file are byte-identical to the
  ones in `js/premium.js`. Keep them in sync.
