/* EyeBreak — entry point: wires the UI, scheduler, session, notifications, SW. */
(function () {
  'use strict';

  var S = window.EB.settings;
  var T = window.EB.timer;
  var X = window.EB.exercises;
  var SND = window.EB.sound;

  var RING_HOME_C = 565.49; // 2π·90  (home countdown ring)
  var RING_STEP_C = 326.73; // 2π·52  (exercise step ring)

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    countdownTime: $('countdown-time'),
    countdownLabel: $('countdown-label'),
    ringProgress: $('ring-progress'),
    statusLine: $('status-line'),
    btnStartNow: $('btn-start-now'),
    pauseActions: $('pause-actions'),
    btnPause1h: $('btn-pause-1h'),
    btnPauseTomorrow: $('btn-pause-tomorrow'),
    btnResume: $('btn-resume'),
    statBreaks: $('stat-breaks'),
    statSkips: $('stat-skips'),
    statStreak: $('stat-streak'),
    notifBanner: $('notif-banner'),
    btnEnableNotifs: $('btn-enable-notifs'),
    iosHint: $('ios-hint'),
    settingsPanel: $('settings-panel'),
    btnOpenSettings: $('btn-open-settings'),
    btnCloseSettings: $('btn-close-settings'),
    soundToggle: $('sound-toggle'),
    notifStatusLine: $('notif-status-line'),
    toast: $('toast'),
    toastSeconds: $('toast-seconds'),
    btnToastDismiss: $('btn-toast-dismiss'),
    overlay: $('overlay'),
    overlayPrompt: $('overlay-prompt'),
    overlaySession: $('overlay-session'),
    overlayDone: $('overlay-done'),
    btnBegin: $('btn-begin'),
    btnSnooze: $('btn-snooze'),
    btnSkipBreak: $('btn-skip-break'),
    stepCount: $('step-count'),
    stepTitle: $('step-title'),
    stepInstruction: $('step-instruction'),
    visualStage: $('visual-stage'),
    stepRing: $('step-ring'),
    stepSeconds: $('step-seconds'),
    btnSkipStep: $('btn-skip-step'),
    btnEndSession: $('btn-end-session'),
    doneStats: $('done-stats'),
    btnCloseDone: $('btn-close-done'),
    debugBadge: $('debug-badge')
  };

  /* ---------- Platform detection ---------- */

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  }

  /* ---------- Formatting ---------- */

  function fmtCountdown(ms) {
    var totalSec = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var mm = String(m).padStart(2, '0');
    var ss = String(s).padStart(2, '0');
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  function fmtClock(epochMs) {
    var d = new Date(epochMs);
    return String(d.getHours()).padStart(2, '0') + ':' +
           String(d.getMinutes()).padStart(2, '0');
  }

  /* ---------- Home rendering ---------- */

  function renderTick(info) {
    if (info.paused) {
      el.countdownTime.textContent = '—';
      el.countdownLabel.textContent = 'reminders paused';
      el.ringProgress.style.strokeDashoffset = RING_HOME_C;
      var until = info.pausedUntil;
      var isTomorrow = new Date(until).getDate() !== new Date().getDate();
      el.statusLine.textContent = isTomorrow
        ? 'Paused until tomorrow'
        : 'Paused until ' + fmtClock(until);
      el.statusLine.classList.add('paused');
      el.pauseActions.hidden = true;
      el.btnResume.hidden = false;
    } else {
      el.statusLine.classList.remove('paused');
      el.pauseActions.hidden = false;
      el.btnResume.hidden = true;
      if (info.due) {
        el.countdownTime.textContent = '0:00';
        el.countdownLabel.textContent = 'break is ready';
        el.ringProgress.style.strokeDashoffset = RING_HOME_C;
        el.statusLine.textContent = 'Your break is ready — start when you like.';
      } else {
        el.countdownTime.textContent = fmtCountdown(info.msLeft);
        el.countdownLabel.textContent = 'until your next eye break';
        el.ringProgress.style.strokeDashoffset = RING_HOME_C * (1 - info.fraction);
        el.statusLine.textContent = 'Next break around ' + fmtClock(Date.now() + info.msLeft);
      }
    }
    renderStats();
  }

  function renderStats() {
    el.statBreaks.textContent = S.state.completedToday;
    el.statSkips.textContent = S.state.skippedToday;
    el.statStreak.textContent = S.currentStreak();
  }

  /* ---------- Pre-break toast ---------- */

  function showToast(seconds) {
    el.toastSeconds.textContent = seconds;
    el.toast.hidden = false;
  }

  function hideToast() {
    if (!el.toast.hidden) el.toast.hidden = true;
  }

  /* ---------- Notifications ---------- */

  function notifSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  function renderNotifUI() {
    var iosNeedsInstall = isIOS() && !isStandalone();

    el.iosHint.hidden = !(iosNeedsInstall && !notifSupported());
    el.notifBanner.hidden = !(notifSupported() && Notification.permission === 'default' && !iosNeedsInstall);

    var status;
    if (!notifSupported()) {
      status = iosNeedsInstall
        ? 'Notifications: install via Share → Add to Home Screen first (iOS 16.4+).'
        : 'Notifications: not supported in this browser.';
    } else if (Notification.permission === 'granted') {
      status = 'Notifications: enabled — you’ll be reminded even when this tab is in the background.';
    } else if (Notification.permission === 'denied') {
      status = 'Notifications: blocked in browser settings. In-page reminders still work while the tab is visible.';
    } else {
      status = 'Notifications: not enabled yet — use the button on the home screen.';
    }
    el.notifStatusLine.textContent = status;
  }

  function requestNotifications() {
    // Must be called from a click handler (browsers require a user gesture).
    if (!notifSupported()) return;
    Notification.requestPermission().then(function () {
      renderNotifUI();
    });
  }

  function sendReminderNotification() {
    if (!notifSupported() || Notification.permission !== 'granted') return;
    // registration.showNotification, NOT `new Notification()` — the latter is
    // broken inside installed PWAs (notably on iOS).
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return;
      reg.showNotification('Time for an eye break', {
        body: 'About a minute of gentle eye exercises. Open EyeBreak to start when ready.',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'eyebreak-reminder'
      });
    }).catch(function () {});
  }

  /* ---------- Exercise overlay ---------- */

  function showPane(pane) {
    el.overlay.hidden = false;
    el.overlayPrompt.hidden = pane !== 'prompt';
    el.overlaySession.hidden = pane !== 'session';
    el.overlayDone.hidden = pane !== 'done';
    if (pane === 'prompt') el.btnBegin.focus();
  }

  function hideOverlay() {
    el.overlay.hidden = true;
    el.overlay.classList.remove('resting');
    T.unsuspend();
  }

  /** Reminder fired while the tab is visible: prompt, never auto-start. */
  function openBreakPrompt() {
    T.suspend();
    hideToast();
    SND.reminder();
    showPane('prompt');
  }

  function startSession() {
    T.suspend();
    hideToast();
    showPane('session');
    X.start({
      onStep: function (step, index, total) {
        el.stepCount.textContent = (index + 1) + ' of ' + total;
        el.stepTitle.textContent = step.title;
        el.stepInstruction.textContent = step.instruction;
        el.visualStage.innerHTML = step.visual;
        el.stepSeconds.textContent = step.duration;
        el.stepRing.style.strokeDashoffset = 0;
        el.overlay.classList.toggle('resting', step.id === 'rest');
      },
      onTick: function (secondsLeft, fraction) {
        el.stepSeconds.textContent = secondsLeft;
        el.stepRing.style.strokeDashoffset = RING_STEP_C * (1 - fraction);
      },
      onDone: function (completed) {
        el.overlay.classList.remove('resting');
        if (completed) {
          S.recordCompletion();
          renderStats();
          var n = S.state.completedToday;
          var streak = S.currentStreak();
          el.doneStats.textContent =
            (n === 1 ? 'First break today' : 'Break ' + n + ' today') +
            ' · ' + streak + '-day streak';
          showPane('done');
        } else {
          hideOverlay();
        }
        T.schedule(); // next reminder counts from the end of the break
      }
    });
  }

  /* ---------- Service worker ---------- */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // Relative path — the app lives in a subpath on GitHub Pages.
    navigator.serviceWorker.register('./sw.js').catch(function () {
      /* offline-first is a bonus, never a blocker */
    });
  }

  /* ---------- Wire up ---------- */

  function bind() {
    el.btnStartNow.addEventListener('click', function () {
      SND.unlock();
      startSession();
    });

    el.btnPause1h.addEventListener('click', function () { T.pauseFor(60 * 60 * 1000); });
    el.btnPauseTomorrow.addEventListener('click', function () { T.pauseUntilTomorrow(); });
    el.btnResume.addEventListener('click', function () { T.resume(); });

    el.btnEnableNotifs.addEventListener('click', requestNotifications);

    el.btnOpenSettings.addEventListener('click', function () {
      el.settingsPanel.hidden = false;
      el.btnOpenSettings.setAttribute('aria-expanded', 'true');
      el.btnCloseSettings.focus();
    });
    el.btnCloseSettings.addEventListener('click', closeSettings);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.settingsPanel.hidden) closeSettings();
    });

    Array.prototype.forEach.call(
      document.querySelectorAll('input[name="interval"]'),
      function (radio) {
        radio.checked = Number(radio.value) === S.state.intervalMin;
        radio.addEventListener('change', function () {
          if (!radio.checked) return;
          S.set({ intervalMin: Number(radio.value) });
          T.schedule(); // restart the countdown with the new interval
        });
      }
    );

    el.soundToggle.checked = S.state.soundOn;
    el.soundToggle.addEventListener('change', function () {
      S.set({ soundOn: el.soundToggle.checked });
      if (el.soundToggle.checked) { SND.unlock(); SND.step(); }
    });

    el.btnToastDismiss.addEventListener('click', function () { T.dismissToast(); });

    el.btnBegin.addEventListener('click', function () {
      SND.unlock();
      startSession();
    });
    el.btnSnooze.addEventListener('click', function () {
      hideOverlay();
      T.snooze();
    });
    el.btnSkipBreak.addEventListener('click', function () {
      S.recordSkip();
      renderStats();
      hideOverlay();
      T.schedule();
    });

    el.btnSkipStep.addEventListener('click', function () { X.skipStep(); });
    el.btnEndSession.addEventListener('click', function () { X.abort(); });
    el.btnCloseDone.addEventListener('click', hideOverlay);
  }

  function closeSettings() {
    el.settingsPanel.hidden = true;
    el.btnOpenSettings.setAttribute('aria-expanded', 'false');
    el.btnOpenSettings.focus();
  }

  function init() {
    if (T.DEBUG) el.debugBadge.hidden = false;

    bind();
    renderNotifUI();
    renderStats();

    T.start({
      onTick: renderTick,
      fireVisible: openBreakPrompt,
      fireHidden: sendReminderNotification,
      preBreak: showToast,
      hideToast: hideToast
    });

    // Register the SW after first paint so dev iterations aren't cache-bitten.
    window.addEventListener('load', registerSW);
    if (document.readyState === 'complete') registerSW();
  }

  init();
})();
