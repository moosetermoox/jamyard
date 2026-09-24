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

  // ── Real content (2026-09-24, the thumbnail experiment): six cards
  // carry a little of the activity's own text or drawings, so a teacher
  // can tell what students DO without reading a description. Slips are
  // paper or painted planks with a line of text; doodles are stroke
  // drawings in the fold picture's style (home/index.html). Every word is
  // the activity's own (its question, its ballot, its sample answers),
  // never a caption of ours. ──

  // A plank with text on it: w wide, its height from the text
  function slip(text, tone, w, rot, opts) {
    opts = opts || {};
    var s = el('div', 'pg-b pg-slip ' + tone + (opts.flat ? ' pg-flat' : '') + (opts.shadow ? ' pg-shadow' : '') + (opts.small ? ' pg-slip-small' : ''), text);
    s.style.width = w + 'px';
    s.style.setProperty('--rot', (rot || 0) + 'deg');
    return s;
  }

  // A small spaced-caps label (the activity's own words, never ours)
  function caps(text) {
    return el('span', 'pg-caps', text);
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  // A student-style drawing: stroke paths in a 60×50 box on a paper square
  function doodle(paths, tone, rot) {
    var square = block(44, 44, tone, rot, { flat: true, shadow: tone === 't-paper' });
    square.classList.add('pg-drawing');
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 60 50');
    svg.classList.add('pg-doodle');
    svg.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < paths.length; i++) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', paths[i]);
      svg.appendChild(p);
    }
    square.appendChild(svg);
    return square;
  }

  // Four dream inventions, as a student would draw them in 90 seconds
  var DOODLES = {
    rocket: ['M30 5 C 41 14, 41 30, 36 38 H24 C 19 30, 19 14, 30 5 Z', 'M24 30 L15 41 L24 38 M36 30 L45 41 L36 38', 'M30 16 a4 4 0 1 0 0.01 0', 'M27 39 L30 47 L33 39'],
    robot: ['M18 12 H42 V34 H18 Z', 'M26 21 v3 M34 21 v3', 'M25 29 H35', 'M30 12 V5 M28 5 h4', 'M22 34 v8 h16 v-8', 'M14 20 h4 M42 20 h4'],
    bulb: ['M30 5 C 17 5, 13 18, 22 28 L22 33 H38 L38 28 C 47 18, 43 5, 30 5 Z', 'M24 39 H36 M26 45 H34', 'M26 28 L30 21 L34 28'],
    fish: ['M6 25 C 18 8, 40 8, 48 25 C 40 42, 18 42, 6 25 Z', 'M48 25 L57 14 L57 36 Z', 'M18 22 v1', 'M26 18 C 30 24, 30 30, 26 34']
  };

  // A person plank: a head over a body, in a tone
  function person(tone, rot) {
    var p = el('div', 'pg-person');
    p.appendChild(block(11, 11, tone, rot, { flat: true }));
    p.appendChild(block(22, 16, tone, rot));
    return p;
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

    // the question, then four labelled bars with their counts; the top
    // bar grows as one more answer lands
    'live-poll': function (paint) {
      var q = slip('How are you feeling about today\'s lesson?', 't-paper', 196, -0.8, { shadow: true });
      var rows = [
        ['Got it!', 78, paint, 12, true],
        ['Mostly', 52, 't-birch', 8, false],
        ['Confused', 30, 't-pine', 5, false],
        ['Lost', 12, 't-oak', 2, false]
      ];
      var bars = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var bar = block(r[1], 13, r[2], 0, { flat: true });
        var parts = [el('span', 'pg-label', r[0]), bar];
        if (r[4]) parts.push(arrive(block(14, 13, r[2], 0, { flat: true })));
        parts.push(el('span', 'pg-count', String(r[3])));
        bars.push(row(parts, 4));
      }
      return col([q, col(bars, 4, 'flex-start')], 9, 'center');
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


    // the drawing prompt over the wall: a two-by-two wall, three student
    // drawings up, the fourth lands
    'art-gallery': function (paint) {
      var q = slip('Draw your dream invention.', 't-paper', 170, 0.8, { shadow: true });
      var wall = el('div', 'pg-wall');
      wall.appendChild(doodle(DOODLES.rocket, 't-paper', -2));
      wall.appendChild(doodle(DOODLES.robot, 't-paper', 1.5));
      wall.appendChild(doodle(DOODLES.bulb, paint, -1));
      wall.appendChild(arrive(doodle(DOODLES.fish, 't-paper', 2)));
      return col([q, wall], 8, 'center');
    },




    // two answers written alone funnel into the pair's one answer, in
    // yellow; "We agree" (the pair's own button) lands on its corner
    'snowball': function (paint) {
      var alone = row([
        slip('Make the pieces the same size.', 't-paper', 92, -1.2, { shadow: true, small: true }),
        slip('You can\'t add different sizes.', 't-paper', 92, 1.2, { shadow: true, small: true })
      ], 10, 'stretch');
      var funnel = el('div', 'pg-funnel');
      funnel.appendChild(block(34, 3, paint, 32, { flat: true }));
      funnel.appendChild(block(34, 3, paint, -32, { flat: true }));
      var together = slip('Same-size pieces, then add.', 't-yellow', 176, -0.8, { small: true });
      var stamp = el('div', 'pg-stamp');
      stamp.appendChild(arrive(el('span', 'pg-tag t-paper pg-shadow', 'We agree')));
      var plank = el('div', 'pg-stamped');
      plank.appendChild(together);
      plank.appendChild(stamp);
      return col([alone, funnel, plank], 5, 'center');
    },
    // letter blocks over a three-line checklist, two done; the last check arrives
    'solo-quiz': function (paint) {
      return col([letters('LKXH', paint), checklist(3, 90, paint)], 12, 'center');
    },
    // your goal (one need-colour block); a classmate's line lands on it
    'someones-got-you': function (paint) {
      return stack([arrive(block(66, 14, 't-paper', 1.4, { shadow: true })), block(58, 14, paint, -1.4)]);
    },


    // the prompt, then two terms and their meanings shuffled; a yellow
    // line joins simile to its meaning
    'vocab-match': function (paint) {
      var q = slip('Match each term to its meaning.', 't-paper', 176, -0.8, { shadow: true });
      var left = col([slip('simile', paint, 66, -1, { small: true }), slip('hyperbole', 't-birch', 66, 1, { small: true })], 6, 'stretch');
      var right = col([slip('exaggerates on purpose', 't-oak', 150, 1, { small: true }), slip('compares with like or as', 't-birch', 150, -1, { small: true })], 6, 'stretch');
      var joinWrap = el('div', 'pg-join pg-join-words');
      var line = block(31, 4, 't-yellow', 63, { flat: true });
      line.style.transformOrigin = 'left center';
      joinWrap.appendChild(arrive(line));
      var r = row([left, right], 14, 'flex-start');
      r.style.position = 'relative';
      r.appendChild(joinWrap);
      return col([q, r], 10, 'center');
    },
    // a pile widening upward from a need-colour base; your list, grown, on top
    'one-more-thing': function (paint) {
      return stack([arrive(block(78, 12, 't-yellow', 1.4)), block(64, 12, 't-birch', -1.4), block(50, 12, 't-pine', 1.4), block(36, 12, paint, -1.4)]);
    },


    // the claim on top; under it the rope's two ends, YES and NO, each a
    // pile of evidence on one base; the second vote lands under it
    'both-sides-rope': function (paint) {
      var claim = slip('\u201cHomework should be optional.\u201d', 't-paper', 190, -0.8, { shadow: true });
      var left = stack([block(34, 12, 't-yellow', 1.4), block(38, 12, 't-yellow', -1.4), block(42, 12, 't-yellow', 1.4), block(36, 12, 't-yellow', -1.4)], { bare: true });
      var right = stack([block(40, 12, paint, 1.4), block(36, 12, paint, -1.4)], { bare: true });
      var yes = col([caps('Yes'), left], 3, 'center');
      var no = col([caps('No'), right], 3, 'center');
      var base = el('div', 'pg-base');
      base.style.width = '118px';
      var again = arrive(slip('Where do you stand now?', 't-paper', 150, 0.8, { shadow: true, small: true }));
      return col([claim, col([row([yes, no], 16, 'flex-end'), base], 0, 'center'), again], 8, 'center');
    },


    // the topic, the people it touches (one picked, in the need colour),
    // and what that one says, a line written from their eyes; a fourth
    // pair of eyes lands as the class names more
    'whose-eyes': function (paint) {
      var topic = el('span', 'pg-tag t-yellow', 'Homework');
      var eyes = row([
        slip('a parent', paint, 54, -1.5, { small: true }),
        slip('the dog', 't-paper', 54, 1, { shadow: true, small: true }),
        slip('a sub', 't-paper', 40, -1, { shadow: true, small: true }),
        arrive(slip('a coach', 't-paper', 56, 1.5, { shadow: true, small: true }))
      ], 6, 'stretch');
      var line = slip('\u201cI\u2019m asleep when it gets done.\u201d', 't-paper', 206, 0.8, { shadow: true, small: true });
      return col([topic, eyes, line], 8, 'center');
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

    // the tier, the question on the projector, and a pair talking it
    // through out loud; nothing typed, the "..." arrives between them
    'closer': function (paint) {
      var tier = el('span', 'pg-tag t-yellow', 'Tier 1 of 3');
      var q = slip('Window seat or aisle seat, and why?', 't-paper', 186, -0.8, { shadow: true });
      var talk = arrive(slip('\u2026', 't-paper', 26, 2, { shadow: true, small: true }));
      var pair = row([person(paint, -1.5), talk, person('t-birch', 1.5)], 8, 'flex-end');
      return col([tier, q, pair], 6, 'center');
    }
  };

  var IDS = Object.keys(PICTOGRAMS);

  // The content cards (2026-09-24): the window is anchored at the top
  // and never slides, and the hover line is the builder's own choice.
  // null = no hover line (the picture already carries the question);
  // a string = one short line in the activity's own words, added on
  // hover under the picture. Cards not listed here keep the glimpse's
  // prompt as before.
  var HOVER_LINES = {
    'live-poll': null,
    'art-gallery': null,
    'snowball': 'What is the most important idea from this unit?',
    'both-sides-rope': null,
    'vocab-match': null,
    'whose-eyes': 'Answer as that person or thing.',
    'closer': 'You and a partner answer out loud.'
  };
  var CONTENT_IDS = Object.keys(HOVER_LINES);

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

  // The id a pictogram is keyed by: the activity's own, or its template's
  function keyFor(g) {
    var id = String((g && g.id) || '');
    if (PICTOGRAMS[id]) return id;
    var base = id.replace(/-\d+$/, '');
    return PICTOGRAMS[base] ? base : null;
  }

  // The pictogram for an activity: { node, tick, content, hover } where
  // tick is the timer chip's text when the pictogram has one (Speed Quiz
  // reads 0:05 on hover), content says the window holds real content
  // (anchored at the top, no slide), and hover is the card's hover line
  // (undefined = the glimpse's prompt, null = none, else the line).
  function build(g, paint, pic) {
    var builder = builderFor(g);
    var node = builder ? builder(paint) : fallback(g || {}, paint, pic);
    var tick = node.querySelector ? node.querySelector('.pg-tick') : null;
    var key = keyFor(g);
    var content = !!(key && Object.prototype.hasOwnProperty.call(HOVER_LINES, key));
    return { node: node, tick: tick, content: content, hover: content ? HOVER_LINES[key] : undefined };
  }

  window.YardPictograms = { build: build, has: has, IDS: IDS, CONTENT_IDS: CONTENT_IDS };
})();
