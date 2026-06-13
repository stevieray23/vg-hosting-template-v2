/* EyeBreak — settings & persisted state.
 * Single localStorage JSON key "eyebreak.v1". All data stays on-device.
 */
(function () {
  'use strict';

  var KEY = 'eyebreak.v1';

  var DEFAULTS = {
    intervalMin: 60,        // 20 | 30 | 60 | 120 (default 60; 20 labeled "recommended")
    soundOn: true,
    nextReminderAt: null,   // epoch ms of next reminder, or null
    spanMs: null,           // length (ms) of the current countdown span (interval or snooze)
    pausedUntil: null,      // epoch ms while reminders are paused, or null
    completedToday: 0,
    skippedToday: 0,
    lastCompletedDate: null, // "YYYY-MM-DD" of last completed session (streak anchor)
    streak: 0,               // consecutive days with >= 1 completed session
    statsDate: null,         // "YYYY-MM-DD" the *Today counters belong to

    // --- Supporter unlock (cosmetic/convenience extras only; see js/premium.js) ---
    supporter: { unlockedAt: null, name: null, code: null },
    theme: 'dark',           // 'dark' (free) | 'warm' | 'cool' | 'contrast' (gated)
    chimePack: 'default',    // 'default' (free) | 'soft' | 'bright' | 'wood' (gated)
    customIntervalMin: null  // number 5..240, or null = use the preset intervalMin
  };

  var state = load();

  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) { /* storage unavailable (private mode etc.) */ }
    var parsed = {};
    if (raw) {
      try { parsed = JSON.parse(raw) || {}; } catch (e) { parsed = {}; }
    }
    var merged = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      merged[k] = (k in parsed) ? parsed[k] : DEFAULTS[k];
    });
    if ([20, 30, 60, 120].indexOf(merged.intervalMin) === -1) {
      merged.intervalMin = DEFAULTS.intervalMin;
    }
    // Clamp the optional custom interval; null means "use the preset above".
    if (merged.customIntervalMin != null) {
      var ci = Number(merged.customIntervalMin);
      merged.customIntervalMin = (isFinite(ci) && ci >= 5 && ci <= 240)
        ? Math.round(ci)
        : null;
    }
    // Defensive shape for the supporter object (older/partial saves).
    if (!merged.supporter || typeof merged.supporter !== 'object') {
      merged.supporter = { unlockedAt: null, name: null, code: null };
    }
    return merged;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* best effort */ }
  }

  /** Local date as "YYYY-MM-DD" (local timezone, not UTC). */
  function todayStr(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /** Yesterday's local date as "YYYY-MM-DD". */
  function yesterdayStr() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return todayStr(d);
  }

  /** Lazily reset per-day counters when the local date rolls over. */
  function rolloverIfNeeded() {
    var today = todayStr();
    if (state.statsDate !== today) {
      state.statsDate = today;
      state.completedToday = 0;
      state.skippedToday = 0;
      save();
    }
  }

  /** Record one completed session; updates today count and streak. */
  function recordCompletion() {
    rolloverIfNeeded();
    var today = todayStr();
    state.completedToday += 1;
    if (state.lastCompletedDate !== today) {
      // First completion of the day: extend or restart the streak.
      state.streak = (state.lastCompletedDate === yesterdayStr())
        ? state.streak + 1
        : 1;
      state.lastCompletedDate = today;
    }
    save();
  }

  /** Record one skipped break. */
  function recordSkip() {
    rolloverIfNeeded();
    state.skippedToday += 1;
    save();
  }

  /** Streak shown in UI: a streak is broken once a full day passes without a session. */
  function currentStreak() {
    if (!state.lastCompletedDate) return 0;
    if (state.lastCompletedDate === todayStr() || state.lastCompletedDate === yesterdayStr()) {
      return state.streak;
    }
    return 0;
  }

  function set(patch) {
    Object.keys(patch).forEach(function (k) {
      if (k in state) state[k] = patch[k];
    });
    save();
  }

  window.EB = window.EB || {};
  window.EB.settings = {
    state: state,
    set: set,
    save: save,
    todayStr: todayStr,
    rolloverIfNeeded: rolloverIfNeeded,
    recordCompletion: recordCompletion,
    recordSkip: recordSkip,
    currentStreak: currentStreak
  };
})();
