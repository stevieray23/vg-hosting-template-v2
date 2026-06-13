# EyeBreak auto-minting Worker (Phase 2)

A tiny Cloudflare Worker that mints EyeBreak supporter unlock codes per Lemon
Squeezy sale, so the seller never has to manage a finite pre-minted code pool.

It is **optional**. Phase 1 (a manually uploaded pool of pre-minted codes) ships
revenue with zero backend; this Worker is only worth deploying once sale volume
makes pool top-ups annoying.

## What it does

```
Buyer pays on Lemon Squeezy
  │
  ├─ (primary)  LS post-purchase redirect →  https://<worker>/claim?order={order_id}
  │     /claim: GET /v1/orders/{id} (Bearer API key) → assert paid + store + product
  │             → mint  EYEBREAK-<payload>.<sig>   (n = user_name, id = order_number)
  │             → 302 →  APP_BASE_URL/?code=<encoded code>
  │                      (the app's existing ?code= handler unlocks on load)
  │
  └─ (backstop) order_created webhook →  https://<worker>/webhook
        verifies X-Signature (HMAC-SHA256 hex over the raw body), then mints.
        Emails the ?code= link ONLY if EMAIL_API_KEY is set — email is OFF by
        default, so the happy path has no email-provider dependency.
```

`GET /health` returns `200 ok`. Everything else is `404`.

Codes are **stateless bearer tokens** — re-claiming the same order is harmless,
so there is no KV namespace or database. The Worker never logs the private key
or full codes.

## Routes

| Route | Behaviour |
|---|---|
| `GET /claim?order=<id>` | missing `order` → `400`; order not paid/ours → `403`; success → `302` to `APP_BASE_URL/?code=<code>`. Non-GET → `405`. |
| `POST /webhook` | bad/missing `X-Signature` → `401`; `X-Event-Name` other than `order_created` → `200 ignored`; otherwise mint (+ optional email) → `200 ok`. Handler error → `500`. |
| `GET /health` | `200 ok` |
| anything else | `404` |

## Deploy

Requires the [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) CLI
and a Cloudflare account.

```sh
cd worker

# 1. Edit wrangler.toml [vars] — replace the PLACEHOLDER values:
#      APP_BASE_URL    your deployed app origin, no trailing slash
#      LS_STORE_ID     your Lemon Squeezy store id (digits)
#      LS_PRODUCT_ID   the supporter-unlock product id (digits)
#      LS_VARIANT_ID   optional; leave "" to accept any variant of the product

# 2. Set the secrets (these are NEVER committed and NOT in wrangler.toml):
wrangler secret put EYEBREAK_PRIVATE_JWK   # paste the full private JWK (one line)
wrangler secret put LS_API_KEY             # Lemon Squeezy API key (Bearer)
wrangler secret put LS_WEBHOOK_SECRET      # the webhook signing secret from LS
wrangler secret put EMAIL_API_KEY          # OPTIONAL — only if you wire email

# 3. Deploy
wrangler deploy
```

`EYEBREAK_PRIVATE_JWK` is the JSON contents of `tools/eyebreak-private-key.jwk`
(the file produced by `node tools/sign-code.mjs keygen`). It is a secret — never
put it in `wrangler.toml`, the repo, or logs.

For local development you can put the same values in `worker/.dev.vars`
(gitignored) and run `wrangler dev`.

## Lemon Squeezy dashboard config

1. **Post-purchase redirect / receipt button** — set the product's confirmation
   button (or "thank you" redirect) URL to:

   ```
   https://<your-worker-subdomain>.workers.dev/claim?order={order_id}
   ```

   Lemon Squeezy substitutes `{order_id}` at checkout. Tapping it lands the buyer
   on `/claim`, which verifies the order and forwards to the unlocked app.

2. **Webhook (backstop)** — create a webhook subscribed to the `order_created`
   event pointing at:

   ```
   https://<your-worker-subdomain>.workers.dev/webhook
   ```

   Copy the **signing secret** LS shows you and store it as the
   `LS_WEBHOOK_SECRET` worker secret.

### Linchpin caveat: `{order_id}` substitution

The `/claim` (Option A) path depends on Lemon Squeezy actually substituting a
usable `{order_id}` into the redirect URL. **Confirm this on a real test-mode
purchase** before relying on it. If LS does not template a usable id into the
redirect, `/claim` can't look the order up — that is exactly why the
`/webhook` backstop exists: the webhook payload carries the authoritative
`data.id` / order attributes, so codes can still be minted (and optionally
emailed) even if the redirect fails.

## ⚠️ KEY PARITY — read before regenerating the keypair

**The Worker's `EYEBREAK_PRIVATE_JWK` secret and the `PUBLIC_KEY_JWK` constant in
`js/premium.js` MUST be the same keypair.** Codes minted with a private key only
verify against its matching public key.

If you ever run `node tools/sign-code.mjs keygen` again (generating a NEW
keypair), you MUST update **BOTH**:

1. paste the new public JWK into `js/premium.js` (`PUBLIC_KEY_JWK`), and
2. re-run `wrangler secret put EYEBREAK_PRIVATE_JWK` with the new private JWK.

Updating only one side silently breaks every newly minted code (and any code
already sold under the old key stops verifying). Back up the private key; never
commit it.

## Tests

Pure-`node` tests, no wrangler runtime required (they import the worker modules
directly and stub `fetch`/`env`):

```sh
node worker/test/crypto.test.js     # cross-compat: worker-minted code verifies
                                    # against premium.js's PUBLIC_KEY_JWK; tamper → false
node worker/test/routes.test.js     # /claim (302/400/403) + /webhook (200/401) + /health
```
