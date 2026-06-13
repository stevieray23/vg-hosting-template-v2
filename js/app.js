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
    doneTitle: $('done-title'),
    doneStats: $('done-stats'),
    btnCloseDone: $('btn-close-done'),
    debugBadge: $('debug-badge'),
    // Supporter unlock
    supporterBadge: $('supporter-badge'),
    supporterLocked: $('supporter-locked'),
    supporterThanks: $('supporter-thanks'),
    supporterName: $('supporter-name'),
    supporterPrice: $('supporter-price'),
    supporterStoreLink: $('supporter-store-link'),
    redeemInput: $('redeem-input'),
    redeemInput2: $('redeem-input-2'),
    btnPasteCode: $('btn-paste-code'),
    btnRedeem: $('btn-redeem'),
    btnRedeem2: $('btn-redeem-2'),
    redeemMsg: $('redeem-msg'),
    themeSelect: $('theme-select'),
    chimeSelect: $('chime-select'),
    customInterval: $('custom-interval'),
    customIntervalNote: $('custom-interval-note'),
    rowTheme: $('row-theme'),
    rowChime: $('row-chime'),
    rowCustomInterval: $('row-custom-interval'),
    lockTheme: $('lock-theme'),
    lockChime: $('lock-chime'),
    lockInterval: $('lock-interval')
  };

  var P = window.EB.premium;

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
      // "Until tomorrow" only for the until-tomorrow sentinel (next local
      // midnight); a timed pause that happens to cross midnight still shows
      // its actual resume time (e.g. "Paused until 00:30").
      var startOfTomorrow = new Date();
      startOfTomorrow.setHours(24, 0, 0, 0);
      el.statusLine.textContent = (until === startOfTomorrow.getTime())
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
    if (el.supporterBadge) el.supporterBadge.hidden = !P.isUnlocked();
  }

  /* ---------- Supporter unlock: themes, chimes, custom interval ---------- */

  var THEMES = ['dark', 'warm', 'cool', 'contrast'];

  /** Apply a theme to <html> + sync the address-bar theme-color. */
  function applyTheme(theme) {
    if (THEMES.indexOf(theme) === -1) theme = 'dark';
    if (theme === 'dark') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (bg) meta.setAttribute('content', bg);
    }
  }

  /** Toggle disabled + .locked styling on every gated row. */
  function applyPremiumGating() {
    var unlocked = P.isUnlocked();

    el.themeSelect.disabled = !unlocked;
    el.chimeSelect.disabled = !unlocked;
    el.customInterval.disabled = !unlocked;

    el.rowTheme.classList.toggle('locked', !unlocked);
    el.rowChime.classList.toggle('locked', !unlocked);
    el.rowCustomInterval.classList.toggle('locked', !unlocked);

    el.lockTheme.hidden = unlocked;
    el.lockChime.hidden = unlocked;
    el.lockInterval.hidden = unlocked;

    // When locked, force the effective experience back to free defaults
    // without destroying the user's stored preference (so it returns if they
    // unlock). The theme actually shown is dark unless unlocked.
    var effectiveTheme = unlocked ? S.state.theme : 'dark';
    applyTheme(effectiveTheme);

    renderSupporterPanel();
    renderStats();
  }

  /** Swap the supporter panel between the buy/redeem state and the thanks state. */
  function renderSupporterPanel() {
    var inf = P.info();
    el.supporterLocked.hidden = inf.unlocked;
    el.supporterThanks.hidden = !inf.unlocked;
    if (inf.unlocked && el.supporterName) {
      el.supporterName.textContent = inf.name || 'supporter';
    }
  }

  /** Reflect stored picker values in the controls. */
  function initPickers() {
    el.themeSelect.value = THEMES.indexOf(S.state.theme) !== -1 ? S.state.theme : 'dark';
    el.chimeSelect.value = S.state.chimePack || 'default';
    el.customInterval.value = (typeof S.state.customIntervalMin === 'number')
      ? S.state.customIntervalMin : '';
    updateCustomIntervalNote();
  }

  function updateCustomIntervalNote() {
    var ci = S.state.customIntervalMin;
    if (P.isUnlocked() && typeof ci === 'number') {
      el.customIntervalNote.textContent = 'Custom interval active: every ' + ci +
        ' min. Pick a preset above to clear it.';
    } else {
      el.customIntervalNote.textContent = 'Beyond the presets above (5–240 min). Pick a preset to clear it.';
    }
  }

  function setRedeemMsg(text, kind) {
    el.redeemMsg.textContent = text || '';
    el.redeemMsg.classList.remove('is-error', 'is-ok');
    if (kind) el.redeemMsg.classList.add('is-' + kind);
  }

  function errorText(code) {
    if (code === 'format') return 'That doesn’t look like an EyeBreak code. Check for a copy/paste slip.';
    if (code === 'signature') return 'That code isn’t valid. Make sure you pasted the whole thing.';
    if (code === 'crypto-unavailable') return 'Secure context needed (open over https or localhost) to verify the code.';
    return 'Could not redeem that code.';
  }

  /** Shared redeem handler used by both redeem buttons. */
  function doRedeem(inputEl, btnEl) {
    var raw = inputEl.value;
    if (!raw || !raw.trim()) { setRedeemMsg('Paste your unlock code first.', 'error'); return; }
    btnEl.disabled = true;
    setRedeemMsg('Checking…', null);
    P.redeem(raw).then(function (res) {
      btnEl.disabled = false;
      if (res.ok) {
        setRedeemMsg('', null);
        applyPremiumGating();
        initPickers();
        showToast2('Code accepted — thank you, ' + (res.name || 'supporter') + '!');
      } else {
        setRedeemMsg(errorText(res.error), 'error');
      }
    });
  }

  /** Lightweight one-off message reusing the toast element. */
  function showToast2(text) {
    el.toast.querySelector('p').textContent = text;
    el.toast.hidden = false;
    setTimeout(function () { el.toast.hidden = true; }, 3500);
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
      onDone: function (outcome) {
        el.overlay.classList.remove('resting');
        if (outcome === 'completed') {
          S.recordCompletion();
          renderStats();
          var n = S.state.completedToday;
          var streak = S.currentStreak();
          el.doneTitle.textContent = 'Done — eyes refreshed';
          el.doneStats.textContent =
            (n === 1 ? 'First break today' : 'Break ' + n + ' today') +
            ' · ' + streak + '-day streak';
          el.doneStats.hidden = false;
          showPane('done');
        } else if (outcome === 'skipped') {
          // Every step was skip-clicked: counts as a skipped break, no streak.
          S.recordSkip();
          renderStats();
          el.doneTitle.textContent = 'Break skipped — see you next time';
          el.doneStats.hidden = true;
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
          // Choosing a preset clears any custom interval so they never conflict.
          S.set({ intervalMin: Number(radio.value), customIntervalMin: null });
          el.customInterval.value = '';
          updateCustomIntervalNote();
          T.schedule(); // restart the countdown with the new interval
        });
      }
    );

    /* --- Supporter extras (only effective when unlocked) --- */

    el.themeSelect.addEventListener('change', function () {
      if (!P.isUnlocked()) return;
      var t = el.themeSelect.value;
      S.set({ theme: t });
      applyTheme(t);
    });

    el.chimeSelect.addEventListener('change', function () {
      if (!P.isUnlocked()) return;
      S.set({ chimePack: el.chimeSelect.value });
      SND.unlock();
      SND.reminder(); // preview the selected pack (respects the sound toggle)
    });

    function commitCustomInterval() {
      if (!P.isUnlocked()) return;
      var v = el.customInterval.value.trim();
      if (v === '') {
        S.set({ customIntervalMin: null });
      } else {
        var n = Math.round(Number(v));
        if (!isFinite(n)) { el.customInterval.value = ''; S.set({ customIntervalMin: null }); }
        else {
          n = Math.max(5, Math.min(240, n));
          el.customInterval.value = n;
          S.set({ customIntervalMin: n });
        }
      }
      updateCustomIntervalNote();
      T.schedule();
    }
    el.customInterval.addEventListener('change', commitCustomInterval);

    el.btnRedeem.addEventListener('click', function () { doRedeem(el.redeemInput, el.btnRedeem); });
    el.btnRedeem2.addEventListener('click', function () { doRedeem(el.redeemInput2, el.btnRedeem2); });
    el.redeemInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doRedeem(el.redeemInput, el.btnRedeem); }
    });

    el.btnPasteCode.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (txt) {
          el.redeemInput.value = txt || '';
          if (txt) doRedeem(el.redeemInput, el.btnRedeem);
        }).catch(function () {
          setRedeemMsg('Couldn’t read the clipboard — paste the code manually.', 'error');
        });
      } else {
        setRedeemMsg('Clipboard not available — paste the code manually.', 'error');
      }
    });

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

  /** Read a unlock code from ?code= or #code= and redeem it, then strip it. */
  function handleCodeDeepLink() {
    var code = null;
    try {
      var qs = new URLSearchParams(location.search);
      code = qs.get('code');
      if (!code && location.hash) {
        var hs = new URLSearchParams(location.hash.replace(/^#/, ''));
        code = hs.get('code');
      }
    } catch (e) { /* ignore */ }
    if (!code) return;

    P.redeem(code).then(function (res) {
      if (res.ok) {
        applyPremiumGating();
        initPickers();
        showToast2('Code accepted — thank you, ' + (res.name || 'supporter') + '!');
      }
      // Strip the code from the URL regardless, so it isn't bookmarked/shared.
      try {
        var url = new URL(location.href);
        url.searchParams.delete('code');
        var clean = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + '';
        history.replaceState(null, '', clean);
      } catch (e) { /* best effort */ }
    });
  }

  function initSupporter() {
    // Editable seller config surfaced into the UI.
    if (el.supporterPrice) el.supporterPrice.textContent = P.PRICE || '€9';
    if (el.supporterStoreLink) el.supporterStoreLink.href = P.STORE_URL || '#';

    initPickers();
    applyPremiumGating();           // optimistic first paint from stored state
    P.onChange(function () {        // re-gate when verifyAtBoot confirms/revokes
      applyPremiumGating();
      initPickers();
    });
    P.verifyAtBoot();               // signature is the source of truth
    handleCodeDeepLink();
  }

  function init() {
    if (T.DEBUG) el.debugBadge.hidden = false;

    bind();
    renderNotifUI();
    initSupporter();
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
