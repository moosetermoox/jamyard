// The meadow: the player screen's "you're in, others are still writing"
// field. Every submitted classmate is an anonymous painted block with legs
// that walks in as the count rises; your own block is marked and can be
// nudged a few steps by tapping the field (3s cooldown, bumps are cosmetic
// wobbles). Deliberately boring: nothing accumulates, nothing completes,
// everything vanishes when the phase moves on — waiting must never beat
// answering. Counts only, never names (see EVENTS.ROOM_PROGRESS).
//
// Plain script (browser global): window.Meadow = { attach, ... }.
// Pairs with /shared/meadow.css. Pure geometry helpers are exported for
// tests; every DOM touch is guarded so a side-effect import works in node.

(function () {
  'use strict';

  var TONES = 9;
  var GOLDEN_ANGLE = 2.399963229728653;
  var MAX_BLOCKS = 40;        // the count line is authoritative past this
  var NUDGE_COOLDOWN_MS = 3000;
  var NUDGE_MAX_STEP = 90;
  var BUMP_RADIUS = 26;
  var BUMP_WOBBLE_MS = 600;

  function toneFor(i) {
    return ((i % TONES) + TONES) % TONES;
  }

  // Deterministic golden-angle scatter: the same index always stands on the
  // same spot, so re-renders and reconnects don't reshuffle the field.
  function spotFor(i, w, h) {
    var padX = Math.min(30, w * 0.08);
    var padY = Math.min(20, h * 0.12);
    var cx = w / 2;
    var cy = h * 0.58;
    var r = i === 0 ? 0 : 16 + 13 * Math.sqrt(i);
    var a = i * GOLDEN_ANGLE;
    var x = cx + r * Math.cos(a) * 1.6; // fields are wide and short
    var y = cy + r * Math.sin(a) * 0.6;
    x = Math.max(padX, Math.min(w - padX, x));
    y = Math.max(padY, Math.min(h - padY, y));
    return { x: x, y: y };
  }

  function stepToward(pos, target, maxStep) {
    var dx = target.x - pos.x;
    var dy = target.y - pos.y;
    var dist = Math.hypot(dx, dy);
    if (dist <= maxStep || dist === 0) return { x: target.x, y: target.y };
    var scale = maxStep / dist;
    return { x: pos.x + dx * scale, y: pos.y + dy * scale };
  }

  function canNudge(lastTs, now, cooldownMs) {
    if (!lastTs) return true;
    return now - lastTs >= cooldownMs;
  }

  function bumpIndex(pos, others, radius) {
    var best = -1;
    var bestDist = Infinity;
    for (var i = 0; i < others.length; i++) {
      var d = Math.hypot(others[i].x - pos.x, others[i].y - pos.y);
      if (d <= radius && d < bestDist) { best = i; bestDist = d; }
    }
    return best;
  }

  var hasDOM = typeof document !== 'undefined';

  function placeBlock(el, pos) {
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
  }

  function walkTo(el, pos) {
    el.classList.add('meadow-walk');
    placeBlock(el, pos);
    // The waddle ends with the stroll; transitionend can be swallowed by a
    // hidden tab, so a timer backstops it.
    var done = function () { el.classList.remove('meadow-walk'); };
    el.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 1200);
  }

  function wobble(el) {
    el.classList.remove('meadow-bump');
    void el.offsetWidth;
    el.classList.add('meadow-bump');
    setTimeout(function () { el.classList.remove('meadow-bump'); }, BUMP_WOBBLE_MS);
  }

  function makeBlock(tone, idx) {
    var el = document.createElement('div');
    el.className = 'meadow-block meadow-tone-' + tone;
    // Staggers the idle sway only; walk/bump reset their own delay in CSS.
    el.style.setProperty('--meadow-sway-delay', ((idx % 7) * 0.37) + 's');
    return el;
  }

  // attach(field, { you }) -> { update(count), reset() }
  //   field: the .meadow-field container (stays hidden until the first tick)
  //   you: false for watch-only mounts, where we can't be sure this student
  //        is one of the counted (the generic waiting screen). Default true.
  function attach(field, opts) {
    if (!hasDOM || !field) return null;
    var withYou = !opts || opts.you !== false;
    var inst = {
      field: field,
      others: [],          // classmate block elements, index -> spot index
      you: null,
      youPos: null,
      lastNudge: 0
    };

    function fieldSize() {
      var w = field.clientWidth || 360;
      var h = field.clientHeight || 150;
      return { w: w, h: h };
    }

    function ensureYou() {
      if (!withYou || inst.you) return;
      var size = fieldSize();
      var el = makeBlock(0, 0);
      el.classList.add('meadow-you');
      var tag = document.createElement('span');
      tag.className = 'meadow-you-tag';
      tag.textContent = 'you';
      el.appendChild(tag);
      inst.youPos = spotFor(0, size.w, size.h);
      placeBlock(el, inst.youPos);
      field.appendChild(el);
      inst.you = el;
    }

    function update(count) {
      if (typeof count !== 'number' || count <= 0) return;
      var size = fieldSize();
      field.hidden = false;
      ensureYou();
      // Classmates: everyone counted except you (all of them when watch-only).
      var wantOthers = Math.min(withYou ? Math.max(0, count - 1) : count, MAX_BLOCKS);
      while (inst.others.length > wantOthers) {
        var gone = inst.others.pop();
        if (gone.el.parentNode) gone.el.parentNode.removeChild(gone.el);
      }
      while (inst.others.length < wantOthers) {
        var idx = inst.others.length + 1; // spot 0 belongs to "you"
        var spot = spotFor(idx, size.w, size.h);
        var el = makeBlock(toneFor(idx), idx);
        // Walk in from the nearer side edge, at the spot's own height.
        var fromLeft = spot.x < size.w / 2;
        placeBlock(el, { x: fromLeft ? -40 : size.w + 40, y: spot.y });
        field.appendChild(el);
        inst.others.push({ el: el, spot: spot });
        (function (blockEl, dest) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { walkTo(blockEl, dest); });
          });
        })(el, spot);
      }
    }

    function reset() {
      inst.others = [];
      inst.you = null;
      inst.youPos = null;
      inst.lastNudge = 0;
      field.textContent = '';
      field.hidden = true;
    }

    field.addEventListener('click', function (ev) {
      if (!inst.you || !inst.youPos) return;
      var now = Date.now();
      if (!canNudge(inst.lastNudge, now, NUDGE_COOLDOWN_MS)) return;
      inst.lastNudge = now;
      var rect = field.getBoundingClientRect();
      var size = fieldSize();
      var target = {
        x: Math.max(10, Math.min(size.w - 10, ev.clientX - rect.left)),
        y: Math.max(10, Math.min(size.h - 10, ev.clientY - rect.top))
      };
      var next = stepToward(inst.youPos, target, NUDGE_MAX_STEP);
      inst.youPos = next;
      walkTo(inst.you, next);
      var hit = bumpIndex(next, inst.others.map(function (o) { return o.spot; }), BUMP_RADIUS);
      if (hit !== -1) {
        // A hello, not a mechanic: both wobble, nobody moves.
        wobble(inst.you);
        wobble(inst.others[hit].el);
      }
    });

    return { update: update, reset: reset };
  }

  globalThis.Meadow = {
    attach: attach,
    toneFor: toneFor,
    spotFor: spotFor,
    stepToward: stepToward,
    canNudge: canNudge,
    bumpIndex: bumpIndex,
    NUDGE_COOLDOWN_MS: NUDGE_COOLDOWN_MS,
    MAX_BLOCKS: MAX_BLOCKS
  };
})();
