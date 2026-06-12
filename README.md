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

## Privacy

Everything (settings, schedule, stats) lives in your browser's `localStorage`. Nothing is sent anywhere. There is no backend.

## Disclaimer

EyeBreak is a comfort tool for screen-time habits. It is **not medical advice** — if you have eye pain or vision changes, see a professional.

## License

MIT — see [LICENSE](LICENSE).
