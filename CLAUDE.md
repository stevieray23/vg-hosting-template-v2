# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

EyeBreak — a zero-build-step, vanilla HTML/CSS/JS installable PWA that reminds the user to take ~60-second guided eye-exercise breaks. Static files only; no frameworks, no CDN dependencies, no external fonts, no backend, no build tooling. Deployed via GitHub Pages from the repo root.

## Hard rules

1. **All URLs are relative — never start with `/`.** GitHub Pages serves this app from a subpath (`/vg-hosting-template-v2/`). Root-absolute paths (`href="/..."`, `src="/..."`, `fetch('/...')`) break the deployed site. The service worker is registered as `./sw.js`.
2. **Bump `CACHE_VERSION` in `sw.js` on every asset change.** The SW is cache-first; without a version bump, installed clients keep the stale files.
3. **No scheduling in the service worker.** Browsers freeze SW timers. All reminder logic lives in `js/timer.js` and runs in the page.
4. **Notifications use `registration.showNotification()`**, never `new Notification()` (the constructor is broken in installed PWAs, notably iOS).
5. **Timer logic is timestamp-based.** Persist the absolute `nextReminderAt` epoch-ms and compare against `Date.now()` on each tick. Never count ticks — background tabs are throttled to ~1 tick/min.
6. **Copy constraints:** comfort/strain-relief framing only. No vision-improvement claims, no Bates-method content (no palming-with-pressure, no sunning). The final exercise is "Rest" — eyes gently closed, explicitly no pressure. Keep the footer disclaimer and the privacy line.
7. **No-skip lockouts are forbidden.** Snooze and Skip must always be available on break prompts.
8. `.nojekyll` must stay — it stops GitHub Pages from running a Jekyll pass.
9. **Premium extras are cosmetic/convenience ONLY** — color themes, chime packs, custom interval. They MUST NEVER gate the core loop (reminders, exercises, snooze, skip, stats, notifications) and MUST NOT be framed as a health/vision benefit. The unlock is a **supporter thank-you, not DRM** — verified by an offline ECDSA P-256 / SHA-256 signed code (Web Crypto, no network, no account). **Never obfuscate/minify the check.** The only property the signature buys: nobody can mint a valid code without the private key, which is gitignored (`tools/eyebreak-private-key.jwk`) and never committed. The public key ships as `PUBLIC_KEY_JWK` in `js/premium.js`. The sole allowed **inline `<head>` script** sets the saved theme before paint (flash-of-default prevention); keep it tiny and the only inline script.

## File map

| File | Responsibility |
|---|---|
| `index.html` | Single page; home / settings panel / pre-break toast / full-screen exercise overlay. Sections toggled via `hidden`, no routing. |
| `css/style.css` | Dark calm theme + `html[data-theme="warm|cool|contrast"]` palettes (supporter extra), countdown rings (stroke-dashoffset), per-exercise keyframe animations, `prefers-reduced-motion` fallbacks, mobile-responsive. All colors flow through CSS custom properties so a theme only redefines vars. |
| `js/settings.js` | `window.EB.settings` — load/save the single localStorage key, day rollover, streak/skip accounting. |
| `js/premium.js` | `window.EB.premium` — offline ECDSA-signed supporter-code verifier + gating helpers; embedded `PUBLIC_KEY_JWK`, editable `PRICE` + `STORE_URL`. `redeem()`/`verifyAtBoot()`/`isUnlocked()`/`info()`/`onChange()`. Loads before sound/timer (they gate on it). |
| `js/sound.js` | `window.EB.sound` — Web Audio chimes (no audio assets); `CHIME_PACKS` map (default free, others supporter); context unlocked on first user gesture. |
| `js/exercises.js` | `window.EB.exercises` — 6-step session data + engine (timestamp-based per-step countdown, skip, abort, done callback). |
| `js/timer.js` | `window.EB.timer` — scheduler: persisted `nextReminderAt`, 1 s tick, pre-break toast window, snooze/pause/resume, visible→overlay vs hidden→notification dispatch, `visibilitychange` catch-up. `?debug=1` → 10 s interval, 15 s snooze. |
| `js/app.js` | Entry point: DOM wiring, view switching, notification permission flow (click-handler only), iOS install hint, SW registration, stats rendering. |
| `sw.js` | Precache of static shell (incl. `js/premium.js`, `terms.html`, `privacy.html`), `CACHE_VERSION`, `skipWaiting` + `clients.claim`, old-cache cleanup, `notificationclick` → focus/open. |
| `manifest.webmanifest` | `start_url: "."`, `scope: "."`, standalone display, icons. |
| `icons/` | `icon.svg` source design + `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180 px). |
| `terms.html` / `privacy.html` | Static legal pages (cosmetic-license terms; local-only privacy). Linked from footer + settings. |
| `tools/sign-code.mjs` | Seller-side Node ESM tool: `keygen` (writes gitignored private key, prints public JWK) + mint a signed `EYEBREAK-…` code. Byte-identical crypto/encoding to `js/premium.js`. See `tools/README.md`. |

Script load order matters (plain scripts sharing the `window.EB` namespace): **settings → premium → sound → exercises → timer → app** (premium loads before the modules that gate on it).

## localStorage schema

Single JSON key `eyebreak.v1`:

```json
{
  "intervalMin": 60,
  "soundOn": true,
  "nextReminderAt": null,
  "spanMs": null,
  "pausedUntil": null,
  "completedToday": 0,
  "skippedToday": 0,
  "lastCompletedDate": null,
  "streak": 0,
  "statsDate": null,
  "supporter": { "unlockedAt": null, "name": null, "code": null },
  "theme": "dark",
  "chimePack": "default",
  "customIntervalMin": null
}
```

- `intervalMin`: 20 | 30 | 60 | 120 (default 60).
- `nextReminderAt` / `pausedUntil`: epoch ms or null.
- `spanMs`: length (ms) of the countdown span `nextReminderAt` was scheduled with (full interval or snooze), so the ring fraction survives a reload; null until first scheduled.
- `statsDate`: local `YYYY-MM-DD` the `*Today` counters belong to; counters reset lazily when the date rolls over.
- `lastCompletedDate` + `streak`: streak = consecutive local days with ≥1 completed session.
- `supporter`: `{unlockedAt, name, code}` — the stored unlock code is **re-verified** by `premium.js` on boot (signature is the source of truth, never a bare boolean).
- `theme`: `dark` (free) | `warm` | `cool` | `contrast` (supporter extra; non-dark applied only when unlocked).
- `chimePack`: `default` (free) | `soft` | `bright` | `wood` (supporter extra).
- `customIntervalMin`: number 5..240 or null (null = use the preset `intervalMin`); clamped in `load()`, only effective when unlocked. **All four new fields are in `DEFAULTS`** — `settings.set()` only copies keys already in `state` (`if (k in state)`), so they must be.

## Local development

```sh
python3 -m http.server 8000
# open http://localhost:8000/  (or serve the parent dir and open /vg-hosting-template-v2/ to mimic GitHub Pages subpath)
```

Use `?debug=1` to test the full reminder loop in seconds instead of minutes. Icons are generated with Python + Pillow if they ever need regenerating (keep `icon.svg` as the source design).
