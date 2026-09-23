// yard-pictograms.js — the yard's pictograms (home 17g, 2026-09-22).
//
// Seventeen cards a teacher can tell apart without reading: a card is a
// name, a colour square for the need, and a pictogram of the mechanic
// built from blocks. Blocks only: wood tones carry grain, paints do not,
// every block is cut slightly off-square, stacks stand on a plinth and a
// base. One block in each pictogram is painted in the activity's need
// colour (the job's paint, yard-prints.js paintOf); everything else is
// wood, paper, or yellow. The ARRIVAL is the block that appears on hover
// (`.pg-arrive`): the third block landing on the pile, the tall bar
// growing, the check on the last line.
//
// Keyed by activity id. A copy of a built-in (`exit-ticket-2`) reads its
// template's pictogram; anything else gets the fallback drawn from the
// activity's glimpse (a pile for answers, code letters for a rolling
// start, name planks for a talk-driven one) and the picture yard-prints
// deals from the id, so a teacher's own copy still looks alive.
//
// Everything is built with the DOM (never HTML strings). Plain script
// (browser global): window.YardPictograms = { build, has, IDS }. Pair it
// with the `.pg-*` rules in /shared/yard-prints.css.
(function () {
  'use strict';

  var WOODS = ['t-birch', 't-pine', 't-oak'];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // One block: w×h in px, a tone class (t-birch, t-yellow, the paint...),
  // a rotation. opts.flat = no cut (a paper square, a title bar);
  // opts.shadow = a free-standing paper piece's shadow.
  function block(w, h, tone, rot, opts) {
    opts = opts || {};
    var b = el('div', 'pg-b ' + tone + (opts.flat ? ' pg-flat' : '') + (opts.shadow ? ' pg-shadow' : ''));
    b.style.width = w + 'px';
    b.style.height = h + 'px';
    b.style.setProperty('--rot', (rot || 0) + 'deg');
    if (opts.mt !== undefined) b.style.marginTop = opts.mt + 'px';
    return b;
  }

  // The block that appears on hover
  function arrive(node) {
    var wrap = el('div', 'pg-arrive');
    wrap.appendChild(node);
    return wrap;
  }

  // A stack: blocks top to bottom, then (unless opts.bare) a plinth 55%
  // and a base 110% as wide as the widest block, both 6px tall.
  function stack(blocks, opts) {
    opts = opts || {};
    var col = el('div', 'pg-stack');
    var widest = 0;
    for (var i = 0; i < blocks.length; i++) {
      col.appendChild(blocks[i]);
      var inner = blocks[i].classList.contains('pg-arrive') ? blocks[i].firstChild : blocks[i];
      widest = Math.max(widest, parseFloat(inner.style.width) || 0);
    }
    if (!opts.bare) {
      var ref = widest + 2;
      var plinth = el('div', 'pg-plinth');
      plinth.style.width = (ref * 0.55) + 'px';
      var base = el('div', 'pg-base');
      base.style.width = (ref * 1.1) + 'px';
      col.appendChild(plinth);
      col.appendChild(base);
    }
    return col;
  }

  function row(children, gap, align) {
    var r = el('div', 'pg-row');
    r.style.gap = gap + 'px';
    if (align) r.style.alignItems = align;
    for (var i = 0; i < children.length; i++) r.appendChild(children[i]);
    return r;
  }

  function col(children, gap, align) {
    var c = el('div', 'pg-col');
    c.style.gap = gap + 'px';
    if (align) c.style.alignItems = align;
    for (var i = 0; i < children.length; i++) c.appendChild(children[i]);
    return c;
  }

  // Four letter blocks 28×33, the first in the need colour
  var LETTER_ROTS = [-2, 1.5, -1, 2];
  function letters(text, paint) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var tone = i === 0 ? paint : WOODS[(i - 1) % WOODS.length];
      var b = block(28, 33, tone + ' pg-letter', LETTER_ROTS[i % LETTER_ROTS.length]);
      b.textContent = text.charAt(i);
      out.push(b);
    }
    return row(out, 5);
  }

  // A checklist line: done = 55% with a check, the last in the need
  // colour with the check arriving
  function checkLine(w, tone, rot, state) {
    var line = block(w, 14, tone + ' pg-check' + (state === 'done' ? ' pg-done' : ''), rot);
    if (state === 'done') line.textContent = '✓';
    if (state === 'arrive') {
      var mark = el('span', 'pg-arrive', '✓');
      line.appendChild(mark);
    }
    return line;
  }

  function checklist(n, w, paint) {
    var lines = [];
    for (var i = 0; i < n; i++) {
      var last = i === n - 1;
      lines.push(checkLine(w, last ? paint : 't-birch', i % 2 === 0 ? -1 : 1, last ? 'arrive' : 'done'));
    }
    return col(lines, 3);
  }

  function arrow() {
    var a = el('span', 'pg-arrow', '→');
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  // Each builder takes the need colour (a tone class) and the dealt
  // picture, returns the pictogram's root node. The activity's own
  // shape from the 17g table, block by block.
  var PICTOGRAMS = {
    // four letter blocks over a two-block pile; the third block lands
    'exit-ticket': function (paint) {
      return col([
        letters('LKXH', paint),
        stack([arrive(block(50, 10, 't-pine', 1.4)), block(56, 10, 't-birch', -1.4), block(44, 10, paint, 1.4)])
      ], 12, 'center');
    },
    // four upright bars, the second in the need colour; the tall bar grows
    'live-poll': function (paint) {
      var grow = col([arrive(block(26, 14, paint, -1)), block(26, 62, paint, 1, { mt: -2 })], 0, 'center');
      return row([block(26, 34, 't-birch', -1), grow, block(26, 22, 't-pine', -1), block(26, 44, 't-oak', 1)], 8, 'flex-end');
    },
    // a yellow timer chip over a two-block pile; the chip ticks, a block lands
    'speed-quiz': function (paint) {
      var chip = el('span', 'pg-timer');
      chip.appendChild(el('span', 'pg-tick', '0:06'));
      return col([
        chip,
        stack([arrive(block(62, 9, 't-pine', 1.4)), block(74, 9, paint, -1.4), block(54, 9, 't-birch', 1.4)])
      ], 10, 'center');
    },
    // three squares: paper, paper, the need colour; a fourth paper square
    'art-gallery': function (paint) {
      return row([
        block(38, 38, 't-paper', -2, { flat: true, shadow: true }),
        block(38, 38, 't-paper', 1.5, { flat: true, shadow: true }),
        block(38, 38, paint, -1, { flat: true }),
        arrive(block(38, 38, 't-paper', 2, { flat: true, shadow: true }))
      ], 7);
    },
    // alone → pairs → all of us: three piles, the wide yellow block arrives
    'snowball': function (paint) {
      var alone = stack([block(22, 10, paint, -1.4), block(22, 10, paint, 1.4), block(22, 10, paint, -1.4), block(22, 10, paint, 1.4)]);
      var pairs = stack([block(40, 12, paint, 1.2), block(40, 12, paint, -1.2)]);
      var all = stack([arrive(block(70, 16, 't-yellow', -1))]);
      return row([alone, arrow(), pairs, arrow(), all], 12, 'flex-end');
    },
    // letter blocks over a three-line checklist, two done; the last check arrives
    'solo-quiz': function (paint) {
      return col([letters('LKXH', paint), checklist(3, 90, paint)], 12, 'center');
    },
    // your goal (one need-colour block); a classmate's line lands on it
    'someones-got-you': function (paint) {
      return stack([arrive(block(66, 14, 't-paper', 1.4, { shadow: true })), block(58, 14, paint, -1.4)]);
    },
    // two columns of three, the same tones shuffled; a yellow line joins a pair
    'vocab-match': function (paint) {
      var left = col([block(40, 13, 't-birch', -1), block(40, 13, paint, 1), block(40, 13, 't-oak', -1)], 4);
      var right = col([block(40, 13, paint, 1), block(40, 13, 't-oak', -1), block(40, 13, 't-birch', 1)], 4);
      var joinWrap = el('div', 'pg-join');
      var line = block(26, 4, 't-yellow', -34, { flat: true });
      line.style.transformOrigin = 'left center';
      joinWrap.appendChild(arrive(line));
      var r = row([left, right], 22);
      r.style.position = 'relative';
      r.appendChild(joinWrap);
      return r;
    },
    // a pile widening upward from a need-colour base; your list, grown, on top
    'one-more-thing': function (paint) {
      return stack([arrive(block(78, 12, 't-yellow', 1.4)), block(64, 12, 't-birch', -1.4), block(50, 12, 't-pine', 1.4), block(36, 12, paint, -1.4)]);
    },
    // two piles on one base: four yellow left, two need-colour right; a yellow block joins
    'both-sides-rope': function (paint) {
      var left = stack([arrive(block(34, 12, 't-yellow', 1.4)), block(38, 12, 't-yellow', -1.4), block(42, 12, 't-yellow', 1.4), block(36, 12, 't-yellow', -1.4)], { bare: true });
      var right = stack([block(40, 12, paint, 1.4), block(36, 12, paint, -1.4)], { bare: true });
      var base = el('div', 'pg-base');
      base.style.width = '118px';
      return col([row([left, right], 16, 'flex-end'), base], 0, 'center');
    },
    // four people planks, the third yellow and taller; a line written from their eyes
    'whose-eyes': function (paint) {
      var people = row([block(22, 28, 't-birch', -1.5), block(22, 28, paint, 1), block(22, 34, 't-yellow', -1), block(22, 28, 't-pine', 1.5)], 5, 'flex-end');
      return col([people, arrive(block(74, 13, 't-paper', -1, { shadow: true }))], 8, 'center');
    },
    // three lines: the need colour, green, oak; a yellow WHO? tag
    'rose-bud-thorn': function (paint) {
      var lines = col([block(84, 11, paint, -0.8), block(84, 11, 't-green', 0.8), block(84, 11, 't-oak', -0.8)], 3);
      var tag = el('span', 'pg-tag t-yellow', 'WHO?');
      return col([lines, arrive(tag)], 8, 'center');
    },
    // a paper drawing over three title bars; the middle title turns the need colour
    'doodle-bluff': function (paint) {
      var drawing = block(62, 44, 't-paper', -1.5, { flat: true, shadow: true });
      var middle = col([arrive(block(28, 9, paint, 0, { flat: true })), block(28, 9, 't-birch', 0, { flat: true, mt: -9 })], 0, 'center');
      var titles = row([block(28, 9, 't-birch', 0, { flat: true }), middle, block(28, 9, 't-birch', 0, { flat: true })], 4);
      return col([drawing, titles], 8, 'center');
    },
    // three bars: birch, the need colour, pine; a fourth yellow bar
    'trivia-bluff': function (paint) {
      return col([
        block(88, 11, 't-birch', 0, { flat: true }),
        block(88, 11, paint, 0, { flat: true }),
        block(88, 11, 't-pine', 0, { flat: true }),
        arrive(block(88, 11, 't-yellow', 0, { flat: true }))
      ], 4);
    },
    // a four-line checklist, three done; the last check arrives
    'group-work-day': function (paint) {
      return checklist(4, 92, paint);
    },
    // five stacked name planks, nothing typed; a sixth lands on top
    'closer': function (paint) {
      return stack([
        arrive(block(66, 12, 't-yellow', -1.2)),
        block(70, 12, paint, 1.2, { mt: -2 }),
        block(64, 12, 't-birch', -1.2, { mt: -2 }),
        block(72, 12, 't-pine', 1.2, { mt: -2 }),
        block(60, 12, 't-birch', -1.2, { mt: -2 })
      ]);
    }
  };

  var IDS = Object.keys(PICTOGRAMS);

  // An activity's own pictogram, or its template's for a copy
  // (`exit-ticket-2`, `doodle-bluff-3`), else nothing
  function builderFor(g) {
    var id = String((g && g.id) || '');
    if (PICTOGRAMS[id]) return PICTOGRAMS[id];
    var base = id.replace(/-\d+$/, '');
    if (PICTOGRAMS[base]) return PICTOGRAMS[base];
    return null;
  }

  function has(g) { return !!builderFor(g); }

  // The fallback, from the glimpse and the dealt picture: what the
  // activity's first minute looks like, in blocks
  function fallback(g, paint, pic) {
    var mode = (g.glimpse && g.glimpse.mode) || 'answer';
    var blocks = (pic && pic.blocks) || [];
    var i;
    if (mode === 'join') {
      var code = (pic && pic.code) || 'JOIN';
      return col([
        letters(code, paint),
        stack([arrive(block(50, 10, 't-pine', 1.4)), block(56, 10, 't-birch', -1.4), block(44, 10, paint, 1.4)])
      ], 12, 'center');
    }
    if (mode === 'talk') {
      var planks = [arrive(block(66, 12, 't-yellow', -1.2))];
      for (i = 0; i < 5; i++) {
        var w = blocks[i] ? Math.round(blocks[i].width * 0.6) : 64;
        planks.push(block(w, 12, i === 0 ? paint : WOODS[i % 2], i % 2 === 0 ? 1.2 : -1.2, { mt: -2 }));
      }
      return stack(planks);
    }
    var pile = [arrive(block(60, 10, 't-pine', 1.4))];
    for (i = 0; i < 3; i++) {
      var width = blocks[i] ? Math.round(blocks[i].width * 0.6) : 56;
      pile.push(block(width, 10, i === 1 ? paint : WOODS[i % 2], i % 2 === 0 ? -1.4 : 1.4));
    }
    return stack(pile);
  }

  // The pictogram for an activity: { node, tick } where tick is the
  // timer chip's text when the pictogram has one (Speed Quiz reads
  // 0:05 on hover).
  function build(g, paint, pic) {
    var builder = builderFor(g);
    var node = builder ? builder(paint) : fallback(g || {}, paint, pic);
    var tick = node.querySelector ? node.querySelector('.pg-tick') : null;
    return { node: node, tick: tick };
  }

  window.YardPictograms = { build: build, has: has, IDS: IDS };
})();
