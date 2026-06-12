/* EyeBreak — guided exercise sequence (~60 s, 6 steps) and session engine.
 * Comfort/strain-relief framing only; no medical or vision-improvement claims.
 * Step timing is timestamp-based (endAt vs Date.now()) so it stays correct
 * even if the browser throttles timers.
 */
(function () {
  'use strict';

  var STEPS = [
    {
      id: 'blink',
      title: 'Blink refresh',
      instruction: 'Close your eyes gently, then blink slowly five times. Let each blink be soft and unhurried.',
      duration: 8,
      visual: '<div class="vis-eye">' +
        '<svg viewBox="0 0 130 78" aria-hidden="true">' +
        '<path d="M6 39 Q 65 2 124 39 Q 65 76 6 39 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>' +
        '<circle cx="65" cy="39" r="15" fill="none" stroke="currentColor" stroke-width="4"/>' +
        '<circle cx="65" cy="39" r="5" fill="currentColor"/>' +
        '</svg>' +
        '<div class="lid"></div>' +
        '</div>'
    },
    {
      id: 'far',
      title: 'Look far away',
      instruction: 'Look at something at least 6 metres (20 feet) away — out a window if you can — and let your eyes relax on it.',
      duration: 20,
      visual: '<div class="vis-far"><div class="dot"></div></div>'
    },
    {
      id: 'nearfar',
      title: 'Near–far focus',
      instruction: 'Hold a thumb about 25 cm from your face. Focus on it, then on something far away. Switch slowly back and forth.',
      duration: 10,
      visual: '<div class="vis-nearfar"><div class="dot"></div></div>'
    },
    {
      id: 'follow',
      title: 'Follow the dot',
      instruction: 'Keep your head still and follow the dot with your eyes only.',
      duration: 12,
      visual: '<div class="vis-follow"><div class="dot"></div></div>'
    },
    {
      id: 'around',
      title: 'Look around',
      instruction: 'Slowly look up, right, down, and left — eyes only, head still.',
      duration: 8,
      visual: '<div class="vis-around"><div class="dot"></div></div>'
    },
    {
      id: 'rest',
      title: 'Rest',
      instruction: 'Close your eyes gently and breathe. No pressure on your eyes — just let them rest in the dark for a moment.',
      duration: 6,
      visual: '<div class="vis-rest"><div class="glow"></div></div>'
    }
  ];

  var session = {
    active: false,
    stepIndex: 0,
    stepEndAt: 0,
    tickId: null,
    lastShownSeconds: -1,
    onStep: null,   // function(step, index, total)
    onTick: null,   // function(secondsLeft, fraction)
    onDone: null,   // function(completed:boolean)
    completedNormally: false
  };

  function start(callbacks) {
    stopTick();
    session.active = true;
    session.stepIndex = 0;
    session.onStep = callbacks.onStep || null;
    session.onTick = callbacks.onTick || null;
    session.onDone = callbacks.onDone || null;
    beginStep(0);
  }

  function beginStep(index) {
    var step = STEPS[index];
    session.stepIndex = index;
    session.stepEndAt = Date.now() + step.duration * 1000;
    session.lastShownSeconds = -1;
    if (session.onStep) session.onStep(step, index, STEPS.length);
    stopTick();
    session.tickId = setInterval(tick, 200);
    tick();
  }

  function tick() {
    if (!session.active) return;
    var step = STEPS[session.stepIndex];
    var msLeft = session.stepEndAt - Date.now();
    if (msLeft <= 0) {
      advance(false);
      return;
    }
    var secondsLeft = Math.ceil(msLeft / 1000);
    var fraction = Math.min(1, Math.max(0, msLeft / (step.duration * 1000)));
    if (session.onTick) session.onTick(secondsLeft, fraction);
    session.lastShownSeconds = secondsLeft;
  }

  /** Move to the next step; skipped=true when the user pressed "Skip step". */
  function advance(skipped) {
    if (!session.active) return;
    var next = session.stepIndex + 1;
    if (next >= STEPS.length) {
      finish(true);
      return;
    }
    if (!skipped && window.EB.sound) window.EB.sound.step();
    beginStep(next);
  }

  function skipStep() {
    advance(true);
  }

  /** End the session early (counts as not completed). */
  function abort() {
    if (!session.active) return;
    finish(false);
  }

  function finish(completed) {
    stopTick();
    session.active = false;
    if (completed && window.EB.sound) window.EB.sound.done();
    if (session.onDone) session.onDone(completed);
  }

  function stopTick() {
    if (session.tickId) {
      clearInterval(session.tickId);
      session.tickId = null;
    }
  }

  window.EB = window.EB || {};
  window.EB.exercises = {
    STEPS: STEPS,
    totalSeconds: STEPS.reduce(function (sum, s) { return sum + s.duration; }, 0),
    start: start,
    skipStep: skipStep,
    abort: abort,
    isActive: function () { return session.active; }
  };
})();
