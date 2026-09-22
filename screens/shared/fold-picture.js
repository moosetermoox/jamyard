// fold-picture.js — the home fold's one moving thing (16h, 2026-09-21).
//
// A drawn projector and one student's screen play Snowball's first minute
// once on load: the code lands on the projector, the student taps it in
// and joins, three names pile up in the room, the prompt arrives, the
// student types an answer and presses Submit, three blocks land on the
// pile, and the pairs' list comes up on the projector. Then the page is
// still; a Replay button runs it again (never a mouse sweep across the
// picture, which would restart nine seconds of motion on the way to the
// join tab). The words are Snowball's own (games/snowball) and the ending
// is Snowball's: what the pairs built, not a vote it does not have. The
// student screen says what the real one says: Join, then Submit.
//
// The markup lives in screens/home/index.html and carries the FINISHED
// state, so with no script the picture is simply done. mount() rewinds it
// and steps it forward: `view(s)` is a pure table (what is in at state s),
// `apply` paints it with classes and two text sinks, and the canvas is a
// fixed 660 by 330 drawing that scales to its column with CSS zoom.
//
// Reduced motion, or a phone-width screen, renders the finished state and
// offers no replay.
(function () {
  'use strict';

  var LAST = 12;
  var WIDTH = 660;
  var PROMPT = 'What should our class norms be?';
  var ANSWER = 'One voice at a time';
  var PARTIAL = 'One voice at a';
  var BUILT = [ANSWER, 'Ask before you borrow', 'Nobody eats alone'];
  var NAMES = ['Maya', 'Jordan', 'Sam'];
  var CODE = 'YAHS';
  var EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

  // Dwell before advancing FROM state s, in ms (the handoff's table)
  function dwell(s) {
    if (s === 0) return 600;
    if (s === 4 || s === 7 || s === 11) return 900;
    if (s === 8) return 700;
    return 620;
  }

  function total() {
    var sum = 0;
    for (var s = 0; s < LAST; s++) sum += dwell(s);
    return sum;
  }

  // What is on the two screens at state s
  function view(s) {
    var inRoom = Math.min(Math.max(s - 4, 0), 3);
    var answered = Math.min(Math.max(s - 8, 0), 3);
    return {
      code: s >= 1,
      letters: Math.min(s, 4),
      joinPressed: s >= 4,
      tabLift: s === 4,
      names: inRoom,
      countLine: s >= 5 ? inRoom + ' in the room' : '',
      prompt: s >= 7,
      studentView: s >= 7 ? 'answer' : 'join',
      typed: s >= 9 ? ANSWER : (s >= 8 ? PARTIAL : ''),
      caret: s === 8,
      submitPressed: s >= 9,
      pileBlocks: answered,
      pileLine: s >= 9 ? answered + ' of 3 in' : '',
      pileDim: s >= LAST,
      built: s >= LAST,
      replay: s >= LAST
    };
  }

  function setIn(el, on) {
    if (el) el.classList.toggle('is-in', !!on);
  }

  // root = the .fold-pic wrapper; opts.tab = the header's join tab (lifts
  // for one beat when the drawn student presses Join); opts.still = true
  // renders the finished state and never plays (tests, reduced motion)
  function mount(root, opts) {
    opts = opts || {};
    if (!root) return null;
    var canvas = root.querySelector('.fold-pic-canvas');
    var replayBtn = root.querySelector('.fold-pic-replay');
    var tab = opts.tab || null;
    var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
    var still = !!opts.still || mq('(prefers-reduced-motion: reduce)') || mq('(max-width: 600px)');
    var s = 0;
    var timer = null;

    var arrivals = root.querySelectorAll('[data-at]');
    var letters = root.querySelectorAll('[data-letter]');
    var names = root.querySelectorAll('[data-name]');
    var blocks = root.querySelectorAll('[data-block]');
    var countEl = root.querySelector('.fp-count');
    var pileLineEl = root.querySelector('.fp-pile-line');
    var typedEl = root.querySelector('.fp-typed');
    var joinEl = root.querySelector('.fp-join');
    var submitEl = root.querySelector('.fp-submit');

    function apply() {
      var v = view(s);
      var i;
      for (i = 0; i < arrivals.length; i++) setIn(arrivals[i], s >= Number(arrivals[i].getAttribute('data-at')));
      for (i = 0; i < letters.length; i++) setIn(letters[i], v.letters >= Number(letters[i].getAttribute('data-letter')));
      for (i = 0; i < names.length; i++) setIn(names[i], v.names >= Number(names[i].getAttribute('data-name')));
      for (i = 0; i < blocks.length; i++) setIn(blocks[i], v.pileBlocks >= Number(blocks[i].getAttribute('data-block')));
      if (countEl) countEl.textContent = v.countLine;
      if (pileLineEl) pileLineEl.textContent = v.pileLine;
      if (typedEl) typedEl.textContent = v.typed;
      if (joinEl) joinEl.classList.toggle('is-pressed', v.joinPressed);
      if (submitEl) submitEl.classList.toggle('is-pressed', v.submitPressed);
      if (tab) tab.classList.toggle('is-nudged', v.tabLift);
      root.classList.toggle('at-join', v.studentView === 'join');
      root.classList.toggle('is-typing', v.caret);
      root.classList.toggle('is-built', v.built);
      root.classList.toggle('is-done', v.replay && !still);
    }

    function tick() {
      if (s >= LAST) return;
      timer = setTimeout(function () { s++; apply(); tick(); }, dwell(s));
    }

    function play() {
      if (still) return;
      clearTimeout(timer);
      s = 0;
      apply();
      tick();
    }

    // The canvas is drawn at 660 wide; scale it to whatever its column gives
    function fit() {
      if (!canvas) return;
      var w = root.clientWidth;
      if (!w) return;
      var z = Math.min(1, w / 660);
      canvas.style.zoom = String(z);
    }

    if (replayBtn) {
      replayBtn.addEventListener('click', function () { if (s >= LAST) play(); });
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(fit).observe(root);
    } else {
      window.addEventListener('resize', fit);
    }
    fit();

    // is-live turns the hidden states on; until then the markup shows the
    // finished picture, which is also what a still visit gets
    root.classList.add('is-live');
    if (still) {
      s = LAST;
      apply();
    } else {
      play();
    }

    return {
      play: play,
      state: function () { return s; },
      stop: function () { clearTimeout(timer); }
    };
  }

  window.FoldPicture = {
    LAST: LAST,
    WIDTH: WIDTH,
    PROMPT: PROMPT,
    ANSWER: ANSWER,
    PARTIAL: PARTIAL,
    BUILT: BUILT,
    NAMES: NAMES,
    CODE: CODE,
    EASE: EASE,
    dwell: dwell,
    total: total,
    view: view,
    mount: mount
  };
})();
