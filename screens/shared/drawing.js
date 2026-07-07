// Drawing pad + stroke renderer — shared by the player screen (the input
// widget), the host screen (reveal galleries, moderation thumbnails), and
// the teacher console.
//
// Strokes are { points: [[x,y],...], color, width } with coordinates
// normalized 0..1, so the same drawing renders at any size — a student's
// phone canvas, a projector gallery card, or a 60px moderation thumbnail.
// The server re-validates everything (engine/drawing.js); this module just
// has to be pleasant to draw with.
//
// Plain script (loaded with a <script> tag); also works as a side-effect
// ESM import in tests because it attaches to globalThis. Dependency-free.

(function () {
  'use strict';

  var PALETTE = ['#111111', '#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#ffffff'];

  // --- Rendering ---------------------------------------------------------

  function drawStroke(ctx, s, w, h) {
    var pts = s.points;
    if (!pts || pts.length === 0) return;
    ctx.strokeStyle = s.color || '#111111';
    ctx.fillStyle = s.color || '#111111';
    // Width scales with the canvas so thumbnails don't render hairlines
    var lw = Math.max(1, (s.width || 4) * (w / 400));
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0] * w, pts[0][1] * h, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
    for (var i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
    }
    ctx.stroke();
  }

  // Paint a stroke array onto a canvas. opts.animate replays the drawing
  // stroke by stroke — the gallery-reveal moment.
  function renderStrokes(canvas, strokes, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (!Array.isArray(strokes)) return;

    if (!opts.animate || typeof requestAnimationFrame === 'undefined') {
      for (var i = 0; i < strokes.length; i++) drawStroke(ctx, strokes[i], w, h);
      return;
    }

    // Animated replay: a few strokes per frame so long drawings stay snappy
    var index = 0;
    var perFrame = Math.max(1, Math.ceil(strokes.length / 60));
    function step() {
      for (var k = 0; k < perFrame && index < strokes.length; k++, index++) {
        drawStroke(ctx, strokes[index], w, h);
      }
      if (index < strokes.length) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // --- Input pad ---------------------------------------------------------

  // Turn a <canvas> into a drawing pad (pointer events cover mouse + touch
  // + stylus). Returns a small API; the caller owns submit/toolbar UI.
  function attachPad(canvas, opts) {
    opts = opts || {};
    var strokes = [];      // committed strokes (normalized)
    var preloaded = 0;     // strokes that arrived via setStrokes (continue mode) — undo never removes them
    var current = null;    // in-progress stroke
    var color = opts.color || PALETTE[0];
    var width = opts.width || 4;
    var ctx = canvas.getContext('2d');

    function repaint() {
      renderStrokes(canvas, strokes);
      if (current) drawStroke(ctx, current, canvas.width, canvas.height);
    }

    function toNorm(e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width;
      var y = (e.clientY - rect.top) / rect.height;
      return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
    }

    canvas.style.touchAction = 'none'; // stop the page scrolling mid-stroke

    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
      current = { points: [toNorm(e)], color: color, width: width };
      repaint();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!current) return;
      e.preventDefault();
      current.points.push(toNorm(e));
      // Draw just the new segment — cheaper than a full repaint per move
      drawStroke(ctx, {
        points: current.points.slice(-2),
        color: current.color,
        width: current.width
      }, canvas.width, canvas.height);
    });
    function finishStroke() {
      if (!current) return;
      strokes.push(current);
      current = null;
      if (opts.onChange) opts.onChange();
    }
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', finishStroke);

    return {
      getStrokes: function () { return strokes.slice(); },
      setStrokes: function (s) {
        strokes = Array.isArray(s) ? s.slice() : [];
        preloaded = strokes.length;
        current = null;
        repaint();
      },
      undo: function () {
        if (strokes.length > preloaded) {
          strokes.pop();
          repaint();
          if (opts.onChange) opts.onChange();
        }
      },
      clear: function () {
        strokes = strokes.slice(0, preloaded); // continue mode keeps the inherited drawing
        current = null;
        repaint();
        if (opts.onChange) opts.onChange();
      },
      isEmpty: function () { return strokes.length === 0; },
      hasOwnStrokes: function () { return strokes.length > preloaded; },
      setColor: function (c) { color = c; },
      setWidth: function (n) { width = n; },
      getColor: function () { return color; },
      repaint: repaint
    };
  }

  // --- Bot scribble ------------------------------------------------------

  // A plausible-looking random doodle for Bot Fill and the simulators:
  // a few wandering polylines in random palette colors.
  function scribble() {
    var strokes = [];
    var strokeCount = 2 + Math.floor(Math.random() * 4);
    for (var s = 0; s < strokeCount; s++) {
      var points = [];
      var x = 0.15 + Math.random() * 0.7;
      var y = 0.15 + Math.random() * 0.7;
      var n = 8 + Math.floor(Math.random() * 20);
      for (var i = 0; i < n; i++) {
        x = Math.min(0.98, Math.max(0.02, x + (Math.random() - 0.5) * 0.14));
        y = Math.min(0.98, Math.max(0.02, y + (Math.random() - 0.5) * 0.14));
        points.push([Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
      }
      strokes.push({
        points: points,
        color: PALETTE[Math.floor(Math.random() * (PALETTE.length - 1))], // skip white
        width: 3 + Math.floor(Math.random() * 5)
      });
    }
    return strokes;
  }

  // Browser global + testable side-effect export
  var root = typeof globalThis !== 'undefined' ? globalThis : window;
  root.Draw = {
    PALETTE: PALETTE,
    renderStrokes: renderStrokes,
    attachPad: attachPad,
    scribble: scribble
  };
})();
