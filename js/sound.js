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

  /* Chime sound packs. The "default" pack is free; the others are a supporter
   * extra (cosmetic only — they change how the chime sounds, nothing else).
   * Each entry is an array of tone descriptors fed to the private tone():
   *   [freq, startDelay, duration, peak]
   * All packs keep the same gentle sine envelope; just different notes. */
  var CHIME_PACKS = {
    default: {
      reminder: [[660, 0, 0.5, 0.16], [880, 0.18, 0.6, 0.12]],
      step:     [[740, 0, 0.28, 0.12]],
      done:     [[587.33, 0, 0.5, 0.15], [880, 0.22, 0.8, 0.13]]    // D5 → A5
    },
    soft: {                                                          // lower / rounder
      reminder: [[392, 0, 0.6, 0.16], [523.25, 0.2, 0.7, 0.12]],     // G4 → C5
      step:     [[523.25, 0, 0.3, 0.11]],
      done:     [[392, 0, 0.55, 0.15], [587.33, 0.24, 0.85, 0.12]]   // G4 → D5
    },
    bright: {                                                        // airy / higher
      reminder: [[880, 0, 0.45, 0.13], [1174.66, 0.16, 0.55, 0.10]], // A5 → D6
      step:     [[1046.5, 0, 0.24, 0.10]],                           // C6
      done:     [[783.99, 0, 0.45, 0.13], [1174.66, 0.2, 0.75, 0.11]] // G5 → D6
    },
    wood: {                                                          // warm fifths
      reminder: [[523.25, 0, 0.5, 0.16], [784, 0.18, 0.6, 0.12]],    // C5 → G5
      step:     [[659.25, 0, 0.28, 0.12]],                           // E5
      done:     [[349.23, 0, 0.55, 0.15], [523.25, 0.22, 0.85, 0.13]] // F4 → C5
    }
  };

  /** Active pack, falling back to 'default' for unknown packs or non-supporters. */
  function currentPack() {
    var name = (window.EB && window.EB.settings && window.EB.settings.state.chimePack) || 'default';
    var supporter = !!(window.EB && window.EB.premium && window.EB.premium.isUnlocked());
    if (name !== 'default' && !supporter) name = 'default';
    return CHIME_PACKS[name] || CHIME_PACKS.default;
  }

  function play(kind) {
    if (!soundOn()) return;
    var tones = currentPack()[kind] || [];
    for (var i = 0; i < tones.length; i++) {
      var t = tones[i];
      tone(t[0], t[1], t[2], t[3]);
    }
  }

  window.EB = window.EB || {};
  window.EB.sound = {
    unlock: unlock,
    PACKS: CHIME_PACKS,

    /** Gentle single chime — break is due. */
    reminder: function () { play('reminder'); },

    /** Tiny tick — exercise step changed. */
    step: function () { play('step'); },

    /** Warm two-note resolve — session complete. */
    done: function () { play('done'); }
  };
})();
