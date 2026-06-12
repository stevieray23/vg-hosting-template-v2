/* EyeBreak — reminder scheduler.
 *
 * Timestamp-based: the absolute epoch-ms `nextReminderAt` is persisted in
 * localStorage and every tick compares it against Date.now(). We never count
 * ticks, so the schedule survives reloads and background-tab throttling
 * (a throttled tab just notices "overdue" on its next tick / on
 * visibilitychange, instead of drifting).
 */
(function () {
  'use strict';

  var S = window.EB.settings;

  var DEBUG = /[?&]debug=1\b/.test(location.search);
  var SNOOZE_MS = DEBUG ? 15 * 1000 : 5 * 60 * 1000;
  var PRE_BREAK_MS = 15 * 1000;

  var hooks = {
    onTick: null,      // function(info) — render countdown/status every second
    fireVisible: null, // function() — break due while tab visible: overlay + chime
    fireHidden: null,  // function() — break due while tab hidden: notification
    preBreak: null,    // function(secondsLeft) — heads-up toast window
    hideToast: null    // function()
  };

  var tickId = null;
  var spanMs = intervalMs();     // length of the current countdown (for ring fraction)
  var promptShownFor = 0;        // nextReminderAt we already fired the overlay for
  var notifiedFor = 0;           // nextReminderAt we already sent a notification for
  var toastDismissedFor = 0;     // nextReminderAt whose toast the user dismissed
  var suspended = false;         // true while the exercise overlay owns the screen

  function intervalMs() {
    if (DEBUG) return 10 * 1000; // ?debug=1 → 10-second interval for testing
    return S.state.intervalMin * 60 * 1000;
  }

  /** (Re)schedule the next reminder a full interval from now and persist it. */
  function schedule() {
    spanMs = intervalMs();
    setNext(Date.now() + spanMs);
  }

  function setNext(at) {
    S.set({ nextReminderAt: at });
    promptShownFor = 0;
    notifiedFor = 0;
    toastDismissedFor = 0;
    if (hooks.hideToast) hooks.hideToast();
    tick();
  }

  function snooze() {
    spanMs = SNOOZE_MS;
    setNext(Date.now() + SNOOZE_MS);
  }

  function pauseFor(ms) {
    S.set({ pausedUntil: Date.now() + ms });
    if (hooks.hideToast) hooks.hideToast();
    tick();
  }

  function pauseUntilTomorrow() {
    var d = new Date();
    d.setHours(24, 0, 0, 0); // next local midnight
    S.set({ pausedUntil: d.getTime() });
    if (hooks.hideToast) hooks.hideToast();
    tick();
  }

  function resume() {
    S.set({ pausedUntil: null });
    schedule();
  }

  function isPaused() {
    return !!(S.state.pausedUntil && Date.now() < S.state.pausedUntil);
  }

  /** Stop firing while the exercise overlay is open. */
  function suspend() {
    suspended = true;
    if (hooks.hideToast) hooks.hideToast();
  }

  function unsuspend() {
    suspended = false;
  }

  function tick() {
    S.rolloverIfNeeded();
    var now = Date.now();

    // Pause window elapsed → resume automatically with a fresh interval.
    if (S.state.pausedUntil && now >= S.state.pausedUntil) {
      S.set({ pausedUntil: null });
      schedule();
      return;
    }

    if (isPaused()) {
      emit({ paused: true, pausedUntil: S.state.pausedUntil, msLeft: 0, fraction: 0, due: false });
      return;
    }

    // First run (or cleared state): start the clock.
    if (!S.state.nextReminderAt) {
      schedule();
      return;
    }

    var msLeft = S.state.nextReminderAt - now;
    var due = msLeft <= 0;
    var fraction = due ? 0 : Math.min(1, msLeft / spanMs);

    emit({ paused: false, msLeft: Math.max(0, msLeft), fraction: fraction, due: due });

    if (suspended) return;

    // Pre-break heads-up toast (visible tab only).
    if (!due && msLeft <= PRE_BREAK_MS &&
        document.visibilityState === 'visible' &&
        toastDismissedFor !== S.state.nextReminderAt) {
      if (hooks.preBreak) hooks.preBreak(Math.ceil(msLeft / 1000));
    } else if (hooks.hideToast) {
      hooks.hideToast();
    }

    if (due) {
      if (document.visibilityState === 'visible') {
        if (promptShownFor !== S.state.nextReminderAt) {
          promptShownFor = S.state.nextReminderAt;
          if (hooks.fireVisible) hooks.fireVisible();
        }
      } else if (notifiedFor !== S.state.nextReminderAt) {
        notifiedFor = S.state.nextReminderAt;
        if (hooks.fireHidden) hooks.fireHidden();
      }
    }
  }

  function emit(info) {
    if (hooks.onTick) hooks.onTick(info);
  }

  function dismissToast() {
    toastDismissedFor = S.state.nextReminderAt || 0;
    if (hooks.hideToast) hooks.hideToast();
  }

  function start(h) {
    Object.keys(h || {}).forEach(function (k) {
      if (k in hooks) hooks[k] = h[k];
    });

    // If a persisted reminder is still in the future, keep it; the ring
    // fraction is measured against the configured interval span.
    spanMs = intervalMs();

    if (tickId) clearInterval(tickId);
    tickId = setInterval(tick, 1000);
    tick();

    // Catch-up path: when the tab becomes visible again, re-check at once —
    // if the reminder came due while we were hidden, it fires immediately.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') tick();
    });
  }

  window.EB = window.EB || {};
  window.EB.timer = {
    DEBUG: DEBUG,
    start: start,
    schedule: schedule,
    snooze: snooze,
    pauseFor: pauseFor,
    pauseUntilTomorrow: pauseUntilTomorrow,
    resume: resume,
    isPaused: isPaused,
    suspend: suspend,
    unsuspend: unsuspend,
    dismissToast: dismissToast,
    intervalMs: intervalMs
  };
})();
