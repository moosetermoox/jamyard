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

  // Normalized field fractions: nudges travel between devices as {fx, fy}
  // in 0..1 so a narrow Chromebook and a wide screen agree about where a
  // block stands. Pure; exported for tests.
  function normFrac(pos, w, h) {
    var f = function (v, span) { return Math.max(0, Math.min(1, span > 0 ? v / span : 0.5)); };
    return { fx: f(pos.x, w), fy: f(pos.y, h) };
  }

  function denormFrac(frac, w, h) {
    return {
      x: Math.max(10, Math.min(w - 10, frac.fx * w)),
      y: Math.max(10, Math.min(h - 10, frac.fy * h))
    };
  }

  // attach(field, { you, onNudge }) ->
  //   { update(count), setOwnIndex(i), applyMove(index, fx, fy), reset() }
  //
  // SHARED SPACE (2026-08-30): block i is the i-th SUBMITTER on every
  // screen — the server assigns canonical indexes (meadow-you tells each
  // player theirs) and relays nudges as anonymous {index, fx, fy}
  // (meadow-moved). The deterministic scatter + index tones were already
  // identical everywhere; identity and movement now are too.
  //   you: false for watch-only mounts (the generic waiting screen) — they
  //        render and follow moves but never claim a block or nudge.
  //   onNudge(fx, fy): called when this student nudges their own block
  //        (the caller relays it to the server).
  function attach(field, opts) {
    if (!hasDOM || !field) return null;
    var withYou = !opts || opts.you !== false;
    var onNudge = (opts && opts.onNudge) || null;
    var inst = {
      field: field,
      blocks: [],          // canonical index -> { el, pos }
      ownIndex: null,
      moved: {},           // canonical index -> {fx, fy} (survives re-renders)
      lastNudge: 0
    };

    function fieldSize() {
      var w = field.clientWidth || 360;
      var h = field.clientHeight || 150;
      return { w: w, h: h };
    }

    function styleAsYou(el) {
      el.classList.add('meadow-you');
      var tag = document.createElement('span');
      tag.className = 'meadow-you-tag';
      tag.textContent = 'you';
      el.appendChild(tag);
    }

    function positionFor(i, size) {
      return inst.moved[i]
        ? denormFrac(inst.moved[i], size.w, size.h)
        : spotFor(i, size.w, size.h);
    }

    function update(count) {
      if (typeof count !== 'number' || count <= 0) return;
      var size = fieldSize();
      field.hidden = false;
      var want = Math.min(count, MAX_BLOCKS);
      while (inst.blocks.length > want) {
        var gone = inst.blocks.pop();
        if (gone.el.parentNode) gone.el.parentNode.removeChild(gone.el);
      }
      while (inst.blocks.length < want) {
        var idx = inst.blocks.length;
        var spot = positionFor(idx, size);
        var el = makeBlock(toneFor(idx), idx);
        if (withYou && idx === inst.ownIndex) styleAsYou(el);
        // Walk in from the nearer side edge, at the spot's own height.
        var fromLeft = spot.x < size.w / 2;
        placeBlock(el, { x: fromLeft ? -40 : size.w + 40, y: spot.y });
        field.appendChild(el);
        inst.blocks.push({ el: el, pos: spot });
        (function (blockEl, dest) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { walkTo(blockEl, dest); });
          });
        })(el, spot);
      }
    }

    // The server told this student which block is theirs (meadow-you).
    function setOwnIndex(i) {
      if (!withYou || typeof i !== 'number' || i < 0) return;
      if (inst.ownIndex === i) return;
      inst.ownIndex = i;
      var b = inst.blocks[i];
      if (b && !b.el.classList.contains('meadow-you')) styleAsYou(b.el);
    }

    // A block moved somewhere in the room (meadow-moved) — or our own
    // optimistic nudge. Remembered by index so re-renders keep it.
    function applyMove(index, fx, fy) {
      if (typeof index !== 'number' || index < 0) return;
      inst.moved[index] = { fx: fx, fy: fy };
      var b = inst.blocks[index];
      if (!b) return;
      var size = fieldSize();
      var next = denormFrac(inst.moved[index], size.w, size.h);
      b.pos = next;
      walkTo(b.el, next);
      var hit = bumpIndex(next, inst.blocks.map(function (o, i) {
        return i === index ? { x: -9999, y: -9999 } : o.pos;
      }), BUMP_RADIUS);
      if (hit !== -1) {
        // A hello, not a mechanic: both wobble, nobody moves.
        wobble(b.el);
        wobble(inst.blocks[hit].el);
      }
    }

    function reset() {
      inst.blocks = [];
      inst.ownIndex = null;
      inst.moved = {};
      inst.lastNudge = 0;
      field.textContent = '';
      field.hidden = true;
    }

    field.addEventListener('click', function (ev) {
      if (inst.ownIndex === null) return;
      var own = inst.blocks[inst.ownIndex];
      if (!own) return;
      var now = Date.now();
      if (!canNudge(inst.lastNudge, now, NUDGE_COOLDOWN_MS)) return;
      inst.lastNudge = now;
      var rect = field.getBoundingClientRect();
      var size = fieldSize();
      var target = {
        x: Math.max(10, Math.min(size.w - 10, ev.clientX - rect.left)),
        y: Math.max(10, Math.min(size.h - 10, ev.clientY - rect.top))
      };
      var next = stepToward(own.pos, target, NUDGE_MAX_STEP);
      var frac = normFrac(next, size.w, size.h);
      // Optimistic: move locally now; the server's echo lands on the same
      // coordinates, and classmates' screens follow from the broadcast.
      applyMove(inst.ownIndex, frac.fx, frac.fy);
      if (onNudge) onNudge(frac.fx, frac.fy);
    });

    return { update: update, setOwnIndex: setOwnIndex, applyMove: applyMove, reset: reset };
  }

  globalThis.Meadow = {
    attach: attach,
    toneFor: toneFor,
    spotFor: spotFor,
    stepToward: stepToward,
    canNudge: canNudge,
    bumpIndex: bumpIndex,
    normFrac: normFrac,
    denormFrac: denormFrac,
    NUDGE_COOLDOWN_MS: NUDGE_COOLDOWN_MS,
    MAX_BLOCKS: MAX_BLOCKS
  };
})();
