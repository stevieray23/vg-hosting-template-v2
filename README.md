# EyeBreak

Gentle reminders to rest your eyes during screen time, with a short (~1 minute) guided exercise session. A free, installable web app (PWA) that runs on iPhone, Android, Windows, and Mac from one URL.

**All data stays on your device. No account, no ads, no tracking.**

## What it does

- Counts down to your next eye break (every 20 / 30 / 60 / 120 minutes — 20 min is the classic 20-20-20 recommendation, the default is 60).
- 15 seconds before a break, a small heads-up toast lets you finish your thought.
- When a break is due you get a full-screen prompt (and a system notification if the tab is in the background). **Nothing ever auto-starts** — you begin when ready, and Snooze (5 min) and Skip are always available.
- The guided session is 6 steps, about a minute total: blink refresh, look far away (20-20-20), near–far focus, follow the dot, look around, and a short rest with eyes gently closed.
- One-click "Pause 1 h" or "Pause until tomorrow" for meetings and calls.
- Lightweight stats: breaks today, skips today, day streak.

## Install

The app is a static site — open the GitHub Pages URL of this repo in any modern browser, then:

- **iPhone / iPad:** Safari → Share → **Add to Home Screen**. Notifications require iOS 16.4+ and only work in the installed (home-screen) app, not in a plain Safari tab.
- **Android:** Chrome → menu → **Add to Home screen** (or the install prompt).
- **Windows / Mac:** Chrome or Edge → install icon in the address bar. In any browser you can simply keep the tab pinned.

## Honest platform limits

A web app cannot run when it is fully closed. Plainly:

| Situation | What happens |
|---|---|
| Tab open and visible | Full-screen reminder + chime. Reliable. |
| Tab open, in background | System notification (if you allowed it). May arrive up to ~1 min late due to browser throttling. |
| Tab / app closed | No reminder possible. The next time you open EyeBreak, an overdue break is offered immediately. |
| iPhone, plain Safari tab | No notifications at all — install via Add to Home Screen (iOS 16.4+). |

Best setup: a pinned tab on desktop, the installed home-screen app on mobile. Note for iOS: Safari may evict locally stored data (settings/stats) after ~7 days of not using the site unless the app is installed to the home screen.

## Local development

No build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Append `?debug=1` to the URL for a 10-second reminder interval (and a 15-second snooze) so you can test the full loop without waiting.

When changing any asset, bump `CACHE_VERSION` in `sw.js` so installed clients pick up the new files.

## Supporter unlock

EyeBreak's **core is free forever** — reminders, exercises, snooze/skip, stats and notifications are never gated. A **one-time €9 supporter unlock** is an optional thank-you that enables **cosmetic / convenience extras only**: color themes, chime sound packs, and a custom reminder interval (beyond the 20/30/60/120 presets). No subscription, no ads, no account.

To change the price, edit the single `PRICE` constant in `js/premium.js`; to point at your checkout, edit the `STORE_URL` constant there.

### How the unlock works (honest, not DRM)

The unlock is an **offline, signed code** verified on-device with Web Crypto (ECDSA P-256 / SHA-256) — **no network call, no account, no backend.** This is a *supporter unlock, not DRM*: the app is open source, so anyone can read `js/premium.js` and flip the check locally. The signature buys exactly one property — **nobody can mint a valid code without the private key, which never ships.** We deliberately don't minify or obfuscate it; that would be dishonest and pointless.

Buyers paste their code into Settings (or tap a one-tap `?code=<KEY>` link), and it stays re-pasteable in case local storage is ever cleared.

### Selling it (operational)

1. **Generate your keypair once** and embed the public key:
   ```sh
   node tools/sign-code.mjs keygen        # writes the gitignored private key; prints the public JWK
   ```
   Paste the printed public JWK into `js/premium.js` as `PUBLIC_KEY_JWK`. **Back up the private key; never commit it** (it's already in `.gitignore`). See [`tools/README.md`](tools/README.md).

2. **Phase 1 — pre-minted pool (zero backend).** Create a **Lemon Squeezy** $/€9 product. Lemon Squeezy is a **Merchant of Record**, so it becomes the legal seller and handles all worldwide sales-tax / VAT / GST, chargebacks, and the EU digital-goods withdrawal-waiver consent for you — directly serving the "don't make me deal with tax" goal (a US LLC otherwise owes EU VAT from the *first* B2C digital sale, with no threshold). Mint a pool of codes and **upload them as Lemon Squeezy's license-key pool**, so the emailed key *is* your signed code. Put a `…/vg-hosting-template-v2/?code=<KEY>` link in the receipt email for one-tap unlock; copy-paste is the fallback. Set `STORE_URL` to your checkout. Confirm the key field accepts ~120–170-char codes. Paddle is the fallback MoR; avoid Stripe (not an MoR → tax on you) and Gumroad (dispute-freeze risk, can't import custom keys).

3. **Phase 2 (only if volume warrants):** automate per-sale minting via a Lemon Squeezy webhook → a tiny serverless signer, removing the finite pool.

**Notes:** the MoR fee (~5% + $0.50) is a deductible business expense — **confirm entity and deductions with a CPA.** "Reverse charge" is irrelevant here (B2B-only, and moot under a Merchant of Record). Defer indefinitely: online activation, revocation, seat limits, dashboards — not worth it for a €9 cosmetic unlock.

### Minting a code

```sh
node tools/sign-code.mjs --name "Jane D." --order "LS-12345"
# → EYEBREAK-<base64url(payload)>.<base64url(rawSig)>
```

## Privacy

Everything (settings, schedule, stats, and any supporter unlock code) lives in your browser's `localStorage`. Nothing is sent anywhere. There is no backend. See [privacy.html](privacy.html) and [terms.html](terms.html).

## Disclaimer

EyeBreak is a comfort tool for screen-time habits. It is **not medical advice** — if you have eye pain or vision changes, see a professional.

## License

MIT — see [LICENSE](LICENSE).
