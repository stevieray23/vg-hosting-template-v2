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

## File map

| File | Responsibility |
|---|---|
| `index.html` | Single page; home / settings panel / pre-break toast / full-screen exercise overlay. Sections toggled via `hidden`, no routing. |
| `css/style.css` | Dark calm theme, countdown rings (stroke-dashoffset), per-exercise keyframe animations, `prefers-reduced-motion` fallbacks, mobile-responsive. |
| `js/settings.js` | `window.EB.settings` — load/save the single localStorage key, day rollover, streak/skip accounting. |
| `js/sound.js` | `window.EB.sound` — Web Audio chimes (no audio assets); context unlocked on first user gesture. |
| `js/exercises.js` | `window.EB.exercises` — 6-step session data + engine (timestamp-based per-step countdown, skip, abort, done callback). |
| `js/timer.js` | `window.EB.timer` — scheduler: persisted `nextReminderAt`, 1 s tick, pre-break toast window, snooze/pause/resume, visible→overlay vs hidden→notification dispatch, `visibilitychange` catch-up. `?debug=1` → 10 s interval, 15 s snooze. |
| `js/app.js` | Entry point: DOM wiring, view switching, notification permission flow (click-handler only), iOS install hint, SW registration, stats rendering. |
| `sw.js` | Precache of static shell, `CACHE_VERSION`, `skipWaiting` + `clients.claim`, old-cache cleanup, `notificationclick` → focus/open. |
| `manifest.webmanifest` | `start_url: "."`, `scope: "."`, standalone display, icons. |
| `icons/` | `icon.svg` source design + `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180 px). |

Script load order matters (plain scripts sharing the `window.EB` namespace): settings → sound → exercises → timer → app.

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
  "statsDate": null
}
```

- `intervalMin`: 20 | 30 | 60 | 120 (default 60).
- `nextReminderAt` / `pausedUntil`: epoch ms or null.
- `spanMs`: length (ms) of the countdown span `nextReminderAt` was scheduled with (full interval or snooze), so the ring fraction survives a reload; null until first scheduled.
- `statsDate`: local `YYYY-MM-DD` the `*Today` counters belong to; counters reset lazily when the date rolls over.
- `lastCompletedDate` + `streak`: streak = consecutive local days with ≥1 completed session.

## Local development

```sh
python3 -m http.server 8000
# open http://localhost:8000/  (or serve the parent dir and open /vg-hosting-template-v2/ to mimic GitHub Pages subpath)
```

Use `?debug=1` to test the full reminder loop in seconds instead of minutes. Icons are generated with Python + Pillow if they ever need regenerating (keep `icon.svg` as the source design).
