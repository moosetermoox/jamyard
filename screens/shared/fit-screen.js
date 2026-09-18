/**
 * fit-screen.js — the screen that is up fits the viewport, no scrolling.
 *
 * A projector is a 16:9 wall and a Chromebook is a 1366x768 lid: nothing
 * on the projector or the student screen should need a scroll during an
 * activity (owner, 2026-09-18). Every step has its own layout and its own
 * content (a long prompt, a drawing, twelve answers), so instead of a
 * per-step rule this shrinks the active section with CSS `zoom` until the
 * document fits the viewport, and grows it back when the content shrinks.
 *
 * How: on every change (a new section, a mutation inside it, a resize, a
 * font or image landing) the active targets go back to zoom 1, the page
 * is measured, and the zoom that fits is applied, a few rounds because
 * text re-wraps as it shrinks. All inside one frame, so nothing flashes.
 * `zoom` (not transform) so layout, hit-testing, and getBoundingClientRect
 * all agree, and vh-based sizes shrink with the rest.
 *
 * Below `floor` the section stops shrinking and the page scrolls again:
 * a student still has to read the words.
 *
 * Pure part: zoomFor(sectionPx, fixedPx, roomPx, floor, zoom).
 */
(function () {
  var opts = null;
  var pending = false;
  var lastFit = 0;
  var timer = null;
  var current = 1;
  var THROTTLE_MS = 150;
  var ROUNDS = 4;

  /**
   * The zoom that fits. `section` is the zoomed height the targets take
   * right now (real px), `fixed` the rest of the document (padding, in-flow
   * siblings, unzoomed), `room` the viewport height, `zoom` the current
   * zoom the section was measured at. Never above 1, never under floor.
   */
  function zoomFor(section, fixed, room, floor, zoom) {
    var z = zoom || 1;
    var f = typeof floor === 'number' ? floor : 0.5;
    if (!(section > 0)) return z;
    var avail = room - fixed;
    if (avail <= 0) return f;
    var next = z * avail / section;
    if (next > 1) next = 1;
    if (next < f) next = f;
    return next;
  }

  function targets() {
    if (opts && typeof opts.targets === 'function') {
      return opts.targets().filter(function (el) { return el && !el.hidden; });
    }
    var el = document.querySelector('section.active');
    return el ? [el] : [];
  }

  function apply(els, z) {
    for (var i = 0; i < els.length; i++) {
      els[i].style.zoom = z === 1 ? '' : String(z);
    }
    current = z;
  }

  function docHeight() {
    var de = document.documentElement;
    return Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0);
  }

  function zoomedHeight(els) {
    var sum = 0;
    for (var i = 0; i < els.length; i++) sum += els[i].getBoundingClientRect().height;
    return sum;
  }

  function fitNow() {
    pending = false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (!opts || !document.body) return;
    lastFit = Date.now();
    var els = targets();
    if (!els.length) return;
    apply(els, 1);
    var z = 1;
    var room = window.innerHeight;
    for (var round = 0; round < ROUNDS; round++) {
      var total = docHeight();
      if (total <= room) break;
      var section = zoomedHeight(els);
      var next = zoomFor(section, total - section, room, opts.floor, z);
      if (Math.abs(next - z) < 0.005) break;
      z = next;
      apply(els, z);
    }
    document.body.classList.toggle('fit-shrunk', z < 1);
  }

  function schedule() {
    if (pending) return;
    pending = true;
    var run = function () {
      var since = Date.now() - lastFit;
      if (since < THROTTLE_MS) {
        timer = setTimeout(fitNow, THROTTLE_MS - since);
      } else {
        fitNow();
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else run();
  }

  function isOwnWrite(rec, els) {
    if (rec.type !== 'attributes' || rec.attributeName !== 'style') return false;
    for (var i = 0; i < els.length; i++) if (els[i] === rec.target) return true;
    return false;
  }

  function install(options) {
    opts = options || {};
    if (typeof opts.floor !== 'number') opts.floor = 0.5;
    if (typeof MutationObserver === 'function' && document.body) {
      var mo = new MutationObserver(function (records) {
        var els = targets();
        for (var i = 0; i < records.length; i++) {
          if (!isOwnWrite(records[i], els)) { schedule(); return; }
        }
      });
      mo.observe(document.body, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['hidden', 'class', 'style', 'src']
      });
    }
    window.addEventListener('resize', schedule);
    // Images and drawings land after the markup; fonts re-wrap the text.
    document.addEventListener('load', schedule, true);
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(schedule);
    }
    schedule();
  }

  window.FitScreen = {
    install: install,
    fitNow: fitNow,
    schedule: schedule,
    zoomFor: zoomFor,
    current: function () { return current; }
  };
})();
