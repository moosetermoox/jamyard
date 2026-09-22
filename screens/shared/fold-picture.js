// fold-picture.js — the home fold's one moving thing (16h, 2026-09-21;
// three scenes since 2026-09-22, owner: "show more examples in there,
// especially things that are unique mechanics to Jamyard, such as a
// shared text box").
//
// A drawn projector and one student's screen play three short scenes
// once on load, then the page is still and a Replay button runs them
// again (never a mouse sweep across the picture, which would restart
// fourteen seconds of motion on the way to the join tab):
//
//   Scene 1, Snowball's first minute (states 0 to 11): the code lands on
//   the projector, the student taps it in and joins, three names pile up
//   in the room, the prompt arrives, the student types an answer and
//   presses Submit, three blocks land on the pile.
//   Scene 2, the shared box (12 to 15): the pair share ONE text box with
//   one pen; the partner's words arrive, the pen passes, both agree, and
//   the pairs' list comes up on the projector. This is Snowball's merge
//   step, the ending it really has (not a vote it does not have).
//   Scene 3, the wall (16 to 19): a drawing prompt, the student draws on
//   their screen, sends it, and the drawings land on the projector wall.
//
// The words are Snowball's own (games/snowball) and the buttons say what
// the real screens say (Join, Submit, We agree). The markup lives in
// screens/home/index.html and carries the FINISHED state, so with no
// script the picture is simply done. `view(s)` is a pure table (what is
// on the two screens at state s), `apply` paints it with classes and a
// few text sinks, and the canvas is a fixed 660 by 330 drawing scaled to
// its column with CSS zoom.
//
// Reduced motion, or a phone-width screen, renders the finished state
// and offers no replay.
(function () {
  'use strict';

  var LAST = 19;
  var WIDTH = 660;
  var PROMPT = 'What should our class norms be?';
  var ANSWER = 'One voice at a time';
  var PARTIAL = 'One voice at a';
  var SHARED = 'One voice at a time, and actually listen';
  var BUILT = [ANSWER, 'Ask before you borrow', 'Nobody eats alone'];
  var DRAW_PROMPT = 'Draw your favorite animal';
  var NAMES = ['Maya', 'Jordan', 'Sam'];
  var CODE = 'YAHS';

  // Dwell before advancing FROM state s, in ms: the handoff's table for
  // the first scene, the same beats for the two after it
  function dwell(s) {
    if (s === 0) return 600;
    if (s === 4 || s === 7 || s === 11) return 900;
    if (s === 8) return 700;
    if (s === 12 || s === 16) return 800;
    if (s === 13 || s === 14 || s === 17 || s === 18) return 700;
    if (s === 15) return 1400;
    return 620;
  }

  function total() {
    var sum = 0;
    for (var s = 0; s < LAST; s++) sum += dwell(s);
    return sum;
  }

  function studentView(s) {
    if (s < 7) return 'join';
    if (s < 12) return 'answer';
    if (s < 16) return 'shared';
    return 'draw';
  }

  // What is on the two screens at state s
  function view(s) {
    var inRoom = Math.min(Math.max(s - 4, 0), 3);
    var answered = Math.min(Math.max(s - 8, 0), 3);
    var onWall = s >= 19 ? 3 : (s >= 18 ? 1 : 0);
    return {
      code: s >= 1,
      letters: Math.min(s, 4),
      joinPressed: s >= 4,
      tabLift: s === 4,
      names: inRoom,
      countLine: s >= 5 ? inRoom + ' in the room' : '',
      prompt: s >= 7 && s < 16,
      studentView: studentView(s),
      typed: s >= 9 ? ANSWER : (s >= 8 ? PARTIAL : ''),
      caret: s === 8,
      submitPressed: s >= 9,
      pileBlocks: answered,
      pileLine: s >= 9 ? answered + ' of 3 in' : '',
      pileDim: s >= 12,
      pairs: s >= 12 && s < 15,
      sharedText: s >= 13 ? SHARED : ANSWER,
      pen: s >= 14 ? 'Your turn' : 'Jordan has the pen',
      penMine: s >= 14,
      agreePressed: s >= 14,
      built: s >= 15 && s < 16,
      drawPrompt: s >= 16,
      drawn: s >= 17,
      sendPressed: s >= 18,
      onWall: onWall,
      wallLine: onWall ? onWall + ' of 3 on the wall' : '',
      replay: s >= LAST
    };
  }

  function setIn(el, on) {
    if (el) el.classList.toggle('is-in', !!on);
  }

  function inWindow(el, s) {
    var at = Number(el.getAttribute('data-at'));
    var until = el.hasAttribute('data-until') ? Number(el.getAttribute('data-until')) : Infinity;
    return s >= at && s < until;
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
    var sinks = {
      count: root.querySelector('.fp-count'),
      pileLine: root.querySelector('.fp-pile-line'),
      typed: root.querySelector('.fp-typed'),
      shared: root.querySelector('.fp-shared-text'),
      pen: root.querySelector('.fp-pen'),
      wallLine: root.querySelector('.fp-wall-line')
    };
    var pressed = {
      join: root.querySelector('.fp-join'),
      submit: root.querySelector('.fp-submit'),
      agree: root.querySelector('.fp-agree'),
      send: root.querySelector('.fp-send')
    };
    var VIEWS = ['join', 'answer', 'shared', 'draw'];

    function text(el, value) { if (el) el.textContent = value; }
    function press(el, on) { if (el) el.classList.toggle('is-pressed', !!on); }

    function apply() {
      var v = view(s);
      var i;
      for (i = 0; i < arrivals.length; i++) setIn(arrivals[i], inWindow(arrivals[i], s));
      for (i = 0; i < letters.length; i++) setIn(letters[i], v.letters >= Number(letters[i].getAttribute('data-letter')));
      for (i = 0; i < names.length; i++) setIn(names[i], v.names >= Number(names[i].getAttribute('data-name')));
      for (i = 0; i < blocks.length; i++) setIn(blocks[i], v.pileBlocks >= Number(blocks[i].getAttribute('data-block')));
      text(sinks.count, v.countLine);
      text(sinks.pileLine, v.pileLine);
      text(sinks.typed, v.typed);
      text(sinks.shared, v.sharedText);
      text(sinks.pen, v.pen);
      text(sinks.wallLine, v.wallLine);
      if (sinks.pen) sinks.pen.classList.toggle('is-mine', v.penMine);
      press(pressed.join, v.joinPressed);
      press(pressed.submit, v.submitPressed);
      press(pressed.agree, v.agreePressed);
      press(pressed.send, v.sendPressed);
      if (tab) tab.classList.toggle('is-nudged', v.tabLift);
      for (i = 0; i < VIEWS.length; i++) root.classList.toggle('at-' + VIEWS[i], v.studentView === VIEWS[i]);
      root.classList.toggle('is-typing', v.caret);
      root.classList.toggle('is-built', v.pileDim);
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
    SHARED: SHARED,
    BUILT: BUILT,
    DRAW_PROMPT: DRAW_PROMPT,
    NAMES: NAMES,
    CODE: CODE,
    dwell: dwell,
    total: total,
    view: view,
    mount: mount
  };
})();
