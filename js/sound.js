/* EyeBreak — soft Web Audio chimes (no audio assets).
 * The AudioContext is created/resumed on the first user gesture, because
 * mobile browsers (especially iOS) block audio that has no prior gesture.
 */
(function () {
  'use strict';

  var ctx = null;

  function getCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
    }
    return ctx;
  }

  /** Resume/create the context. Call from a user-gesture handler. */
  function unlock() {
    var c = getCtx();
    if (c && c.state === 'suspended') {
      c.resume().catch(function () {});
    }
  }

  // One-time unlock on the very first gesture anywhere on the page.
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (evt) {
    window.addEventListener(evt, unlock, { once: true, passive: true });
  });

  /** Play one soft sine tone. */
  function tone(freq, startDelay, duration, peak) {
    var c = getCtx();
    if (!c || c.state !== 'running') return;
    var t0 = c.currentTime + (startDelay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak || 0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function soundOn() {
    return !!(window.EB && window.EB.settings && window.EB.settings.state.soundOn);
  }

  window.EB = window.EB || {};
  window.EB.sound = {
    unlock: unlock,

    /** Gentle single chime — break is due. */
    reminder: function () {
      if (!soundOn()) return;
      tone(660, 0, 0.5, 0.16);
      tone(880, 0.18, 0.6, 0.12);
    },

    /** Tiny tick — exercise step changed. */
    step: function () {
      if (!soundOn()) return;
      tone(740, 0, 0.28, 0.12);
    },

    /** Warm two-note resolve — session complete. */
    done: function () {
      if (!soundOn()) return;
      tone(587.33, 0, 0.5, 0.15);   // D5
      tone(880, 0.22, 0.8, 0.13);   // A5
    }
  };
})();
