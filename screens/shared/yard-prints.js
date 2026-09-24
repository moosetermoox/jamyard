// yard-prints.js — the yard's grid of activity cards (home 17g, 2026-09-22;
// the 15b mini-projector prints before it).
//
// Seventeen cards a teacher can tell apart without reading. A card is a
// NAME, a colour SQUARE for the need (the job's paint), and a PICTOGRAM
// of the mechanic built from blocks (shared/yard-pictograms.js) in a
// gesso window on a paper mat. No prompt sentence, no meta line at rest.
// The prompt (the first thing students are asked, from the server's
// `glimpse`, engine/home-glimpse.js) appears only on hover, when the
// pictogram slides up and its arrival block lands. Paper time marks
// ("5 MIN", "10 MIN") pin to the first card of each duration step, so the
// grid reads shortest first without a number on every card. The home
// page's yard and the teacher's own shelf (shared/my-yard.js) draw the
// same cards from this module, so the two never drift apart.
//
// Decoration that must look alive but never lie about a live room: the
// fallback pictogram's blocks and code letters are dealt from the
// activity's id (`picture`), so a copy keeps the same picture across
// visits. Activity text is untrusted: textContent only.
//
// Plain script (browser global): window.YardPrints. Pair it with
// /shared/yard-prints.css; needs /shared/goal-groups.js and
// /shared/yard-pictograms.js first.
(function () {
  'use strict';

  function seedOf(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
  function dealer(seed) {
    var s = seed || 1;
    return function (n) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return (s >>> 8) % n;
    };
  }
  // No I, O, or Q: they read as 1, 0, and an underlined O at pocket size
  var LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  var PAINTS = ['t-yellow', 't-cyan', 't-magenta', 't-green'];
  var WOODS = ['t-birch', 't-pine', 't-oak'];
  // A card's paint is its job (2026-09-15, owner: "make the different
  // categories more visually distinct"): magenta = to connect (social),
  // cyan = to think, green = to review (checking), orange = to just have
  // fun. The chips over the yard wear the same swatch, so the row is the
  // legend. One block in every pictogram carries it, and the small
  // square beside the name.
  var PAINT_OF_GROUP = { connect: 't-magenta', think: 't-cyan', review: 't-green', play: 't-orange' };
  function paintOf(g) {
    var key = window.GoalGroups && GoalGroups.groupOf ? GoalGroups.groupOf(g) : 'think';
    return PAINT_OF_GROUP[key] || 't-cyan';
  }

  function picture(g) {
    var deal = dealer(seedOf(String(g.id || g.name || '')));
    var code = '';
    for (var i = 0; i < 4; i++) code += LETTERS.charAt(deal(LETTERS.length));
    var inRoom = 12 + deal(17);            // 12..28
    var blocks = [];
    var n = 5 + deal(4);                   // 5..8 blocks on the pile
    for (var b = 0; b < n; b++) {
      var wood = b % 2 === 0;
      blocks.push({
        tone: wood ? WOODS[deal(WOODS.length)] : PAINTS[deal(PAINTS.length)],
        width: 70 + deal(50),              // 70..119px at full size
        rot: b % 2 === 0 ? '-1.4deg' : '1.4deg'
      });
    }
    var mins = deal(3);
    var secs = deal(60);
    return {
      code: code,
      inRoom: inRoom,
      blocks: blocks,
      timer: mins + ':' + (secs < 10 ? '0' : '') + secs + ' left'
    };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function glimpseOf(g) {
    var gl = g.glimpse || {};
    return {
      mode: gl.mode || 'answer',
      prompt: gl.prompt || g.description || '',
      samples: Array.isArray(gl.samples) ? gl.samples : []
    };
  }

  // The hover prompt: the glimpse's prompt where there is one, else a
  // one-line hook from the config (the first sentence of the description)
  var PROMPT_MAX = 96;
  function promptOf(g) {
    var gl = g.glimpse || {};
    var text = gl.prompt || g.hook || '';
    if (!text) {
      var m = /^(.+?[.!?])(\s|$)/.exec(String(g.description || '').replace(/\s+/g, ' ').trim());
      text = m ? m[1] : String(g.description || '');
    }
    text = String(text).replace(/\*\*/g, '').trim();
    if (text.length > PROMPT_MAX) {
      var cut = text.slice(0, PROMPT_MAX);
      var space = cut.lastIndexOf(' ');
      text = (space > 30 ? cut.slice(0, space) : cut).trim() + '…';
    }
    return text;
  }

  // "to think · ~10 min · rolling start": the job in lower case, the short
  // time (the popups' meta line; the cards themselves carry none)
  function jobLine(g) {
    var job = window.GoalGroups ? GoalGroups.jobOf(g) : 'To think';
    return job.charAt(0).toLowerCase() + job.slice(1);
  }
  function shortTime(g) {
    return g.playTime ? String(g.playTime).split('(')[0].trim() : '';
  }
  function metaOf(g) {
    var bits = [jobLine(g)];
    var t = shortTime(g);
    if (t) bits.push(t);
    if (g.start === 'rolling') bits.push('rolling start');
    return bits.join(' · ');
  }
  // The server's reading of playTime ("~15–20 min" reads as 20) when it
  // sent one, else the first number in the string
  function minutesOf(g) {
    if (typeof g.minutes === 'number' && g.minutes > 0) return g.minutes;
    var m = /(\d+)/.exec(g.playTime || '');
    return m ? parseInt(m[1], 10) : 999;
  }

  // The duration steps the time marks name. Walking the sorted list, a
  // card gets a mark when its step differs from the card before it:
  // "5 MIN" on the first five-minute card, "10 MIN" on the first ten.
  var MARK_STEPS = [5, 10, 15, 20, 30];
  function stepOf(minutes) {
    var step = null;
    for (var i = 0; i < MARK_STEPS.length; i++) if (minutes >= MARK_STEPS[i]) step = MARK_STEPS[i];
    return step;
  }
  // The mark text per card (null for no mark), for a list already sorted
  function marksFor(sorted) {
    var out = [];
    var last = null;
    for (var i = 0; i < sorted.length; i++) {
      var step = stepOf(minutesOf(sorted[i]));
      out.push(step !== null && step !== last ? step + ' MIN' : null);
      if (step !== null) last = step;
    }
    return out;
  }

  // ── A teacher's own copy (18d, 2026-09-24) ──
  // The template a copy was made from: the built-in whose id the copy's
  // id extends (snowball-2), whose name the copy's name starts with
  // (Snowball (my version)), or whose id the copy's slug starts with
  // (both-sides-of-the-rope-my-version). Null for a custom game.
  function templateOf(g, games) {
    var id = String((g && g.id) || '');
    var name = String((g && g.name) || '');
    var list = games || [];
    var base = id.replace(/-\d+$/, '');
    var byId = null, byName = null, bySlug = null;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || t.source === 'user' || t.id === id) continue;
      if (t.id === base) byId = t;
      if (!byName && t.name && name.toLowerCase().indexOf(String(t.name).toLowerCase()) === 0) byName = t;
      if (!bySlug && id.indexOf(t.id + '-') === 0) bySlug = t;
    }
    return byId || byName || bySlug || null;
  }

  function escapeRe(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  var TOPIC_MAX = 16;
  function cutTopic(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim().toUpperCase();
    if (t.length > TOPIC_MAX) t = t.slice(0, TOPIC_MAX - 1).replace(/\s+\S*$/, '').trim() + '…';
    return t;
  }

  // The copy's own words: its name with the template's name and the
  // separator stripped ("Snowball: Causes of WWI" reads CAUSES OF WWI,
  // "Exit Ticket · Fractions, day 2" reads FRACTIONS, DAY 2, "(my
  // version)" counts as nothing); when nothing is left, the first three
  // words of the copy's prompt, and only when that prompt differs from
  // the template's (a copy that still asks the template's question has
  // no words of its own yet, so no word block).
  function topicOf(g, template) {
    var name = String((g && g.name) || '');
    var rest = name;
    if (template && template.name) rest = rest.replace(new RegExp('^' + escapeRe(template.name) + '\\s*', 'i'), '');
    rest = rest.replace(/\(\s*(my version|copy|version \d+)\s*\)/ig, '').replace(/\bmy version\b/ig, '');
    rest = rest.replace(/^[\s:·•\-\u2013\u2014,]+|[\s:·•\-\u2013\u2014,]+$/g, '').trim();
    if (rest) return cutTopic(rest);
    var prompt = String((g && g.glimpse && g.glimpse.prompt) || '').replace(/\s+/g, ' ').trim();
    var templatePrompt = String((template && template.glimpse && template.glimpse.prompt) || '').replace(/\s+/g, ' ').trim();
    if (!prompt || prompt === templatePrompt) return '';
    var words = prompt.replace(/[^\w\s'’-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3);
    return cutTopic(words.join(' '));
  }

  var SMALL_WORDS = /^(a|an|the|of|and|or|to|in|on|for|with|at|by)$/i;
  // A custom game's initials: up to three, small words skipped
  function initialsOf(g) {
    var words = String((g && g.name) || '').split(/\s+/).filter(function (w) { return /^[A-Za-z0-9]/.test(w); });
    var big = words.filter(function (w) { return !SMALL_WORDS.test(w); });
    var pick = (big.length ? big : words).slice(0, 3);
    return pick.map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }

  // What the shelf hands buildCard for one of the teacher's own
  // activities: the kicker line, the template to draw, the topic for
  // the word block, or the initials for a custom game
  function ownDetails(g, template) {
    if (template) {
      // the copy's own question, when the teacher changed it, is its hover line
      var prompt = String((g && g.glimpse && g.glimpse.prompt) || '').trim();
      var templatePrompt = String((template.glimpse && template.glimpse.prompt) || '').trim();
      return { kicker: String(template.name || '').toUpperCase(), templateId: template.id, topic: topicOf(g, template), initials: '', ownPrompt: prompt && prompt !== templatePrompt ? prompt : '' };
    }
    return { kicker: 'MADE WITH AI', templateId: null, topic: '', initials: initialsOf(g), ownPrompt: '' };
  }

  var CARD_ROTS = ['-0.8deg', '0.6deg', '-0.7deg', '0.9deg', '-0.5deg', '0.8deg', '-0.9deg', '0.5deg', '-0.6deg', '1deg'];

  // The floating hover card (name, meta, the `when` line) is OFF on the
  // yard's cards (owner 2026-09-23: "the text emerging on the planks does
  // enough"). The module and the wiring stay; flip this to bring it back.
  var HOVER_CARD = false;

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function noHover() {
    return !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  }

  // The hover state as a class, so touch (first tap) and the load play
  // can show it too: the pictogram slides up, the arrival lands, the
  // prompt fades in, the timer ticks
  function setOn(card, on) {
    card.classList.toggle('on', !!on);
    var tick = card._tick;
    if (tick) tick.textContent = on ? '0:05' : '0:06';
  }

  // The window: the pictogram centred, the prompt hidden at the bottom.
  // A content card (real text or drawings in the picture, 2026-09-24)
  // sits at the top of its window and never slides; its hover line is
  // the pictogram's own (null = none, the picture already asks the
  // question), never the glimpse's prompt over the same words.
  // ex (2026-09-24, class-examples.js): the example in the teacher's
  // subject and grade whose words the picture and the hover line show in
  // place of the template's; never on a teacher's own copy.
  function buildWindow(g, card, own, ex) {
    var win = el('div', 'yard-window');
    var paint = paintOf(g);
    var pict = el('div', 'yard-pict');
    var built = window.YardPictograms
      ? YardPictograms.build(g, paint, picture(g), own ? { templateId: own.templateId, topic: own.topic, initials: own.initials } : { example: ex || undefined })
      : { node: el('div'), tick: null };
    pict.appendChild(built.node);
    card._tick = built.tick;
    win.appendChild(pict);
    if (built.corner) {
      var corner = el('div', 'pg-topic-corner');
      corner.appendChild(built.corner);
      win.appendChild(corner);
    }
    if (built.content) win.classList.add('yard-window-content');
    var line = built.hover === undefined ? (ex && ex.line ? promptOf({ glimpse: { prompt: ex.line } }) : promptOf(g)) : built.hover;
    if (own && own.ownPrompt && built.hover !== undefined) line = promptOf({ glimpse: { prompt: own.ownPrompt } });
    if (line) {
      var box = el('div', 'yard-prompt-box');
      box.appendChild(el('span', 'yard-prompt', line));
      win.appendChild(box);
    }
    return win;
  }

  // opts.own (18d): the teacher's own copy, from ownDetails: a sanded
  // mat, the kicker over the name, the word block or initials.
  // opts.href(g) gives the link; opts.onClick(g, card) opens a popup on
  // a plain click (with a link too, modified clicks and new tabs still
  // follow the href; without one the card is a button). opts.mark is the
  // time mark's text when this card starts a duration step. The hover
  // card carries the moment it is for when it is loaded. On a screen with
  // no hover, the first tap shows the hover state and the second opens.
  // opts.example(g, i) (2026-09-24) gives the class example the card
  // shows, or null; the href gets it too, so the make page starts with
  // the same words; never on an own copy.
  function buildCard(g, i, opts) {
    opts = opts || {};
    var card;
    var own = opts.own || null;
    var ex = !own && typeof opts.example === 'function' ? (opts.example(g, i) || null) : null;
    var open = function (e) {
      if (noHover() && !card.classList.contains('on')) {
        if (e) e.preventDefault();
        var siblings = card.parentNode ? card.parentNode.querySelectorAll('.yard-card.on') : [];
        for (var s = 0; s < siblings.length; s++) if (siblings[s] !== card) setOn(siblings[s], false);
        setOn(card, true);
        return false;
      }
      return true;
    };
    if (opts.href) {
      card = el('a', 'yard-card');
      card.href = opts.href(g, ex);
      card.addEventListener('click', function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (!open(e)) return;
        if (!opts.onClick) return;
        e.preventDefault();
        opts.onClick(g, card);
      });
      if (opts.onClick) card.setAttribute('aria-haspopup', 'dialog');
    } else {
      card = el('button', 'yard-card');
      card.type = 'button';
      card.setAttribute('aria-haspopup', 'dialog');
      card.addEventListener('click', function (e) {
        if (!open(e)) return;
        if (opts.onClick) opts.onClick(g, card);
      });
    }
    card.setAttribute('data-game-id', g.id);
    if (ex) card.setAttribute('data-example', ex.key);
    card.setAttribute('aria-label', g.name + ', see what it is');
    card.style.setProperty('--rot', CARD_ROTS[i % CARD_ROTS.length]);
    // A tap fires emulated mouse events too; on a no-hover screen the
    // tap rule above owns the state, so these stand down there
    card.addEventListener('mouseenter', function () { if (!noHover()) setOn(card, true); });
    card.addEventListener('mouseleave', function () { if (!noHover()) setOn(card, false); });
    if (HOVER_CARD && window.HoverCard) HoverCard.attach(card, g);
    if (opts.mark) {
      var mark = el('span', 'yard-mark', opts.mark);
      mark.setAttribute('aria-hidden', 'true');
      card.appendChild(mark);
    }
    if (own) card.classList.add('yard-card-own');
    var print = el('div', 'yard-print' + (own ? ' yard-print-own' : ''));
    print.appendChild(buildWindow(g, card, own, ex));
    card.appendChild(print);
    var nameRow = el('div', 'yard-name-row');
    nameRow.appendChild(el('span', 'yard-name', g.name));
    nameRow.appendChild(el('span', 'yard-need ' + paintOf(g)));
    if (own) {
      var block = el('div', 'yard-name-block');
      block.appendChild(el('span', 'yard-kicker', own.kicker));
      block.appendChild(nameRow);
      card.appendChild(block);
    } else {
      card.appendChild(nameRow);
    }
    return card;
  }

  // The last card: for when what the class needs is not on the shelf yet
  // (owner 2026-09-22: from the "what you need" side, a little cheeky).
  // Its window is a dashed slot holding a sanded plank and BUILD IT; its
  // hover card reads like the others', the moment it is for.
  var AI_DOOR = {
    name: 'Have an idea? Make it real',
    when: 'When what your class needs isn\'t on this shelf yet. Say it in a sentence and it gets built while you watch.'
  };

  function buildAiTile(i, href) {
    var card = el('a', 'yard-card yard-card-make');
    card.href = href || '/designer';
    card.style.setProperty('--rot', CARD_ROTS[i % CARD_ROTS.length]);
    if (HOVER_CARD && window.HoverCard) HoverCard.attach(card, AI_DOOR);
    var print = el('div', 'yard-print');
    var slot = el('div', 'yard-window yard-slot');
    slot.appendChild(el('div', 'yp-slot'));
    slot.appendChild(el('span', 'yp-chip', 'Build it'));
    print.appendChild(slot);
    card.appendChild(print);
    var nameRow = el('div', 'yard-name-row');
    nameRow.appendChild(el('span', 'yard-name', AI_DOOR.name));
    card.appendChild(nameRow);
    return card;
  }

  // The first card plays its hover state once, a beat after the grid
  // lands, then settles; skipped when motion is reduced or the mouse is
  // already on a card
  function playFirst(container) {
    if (reducedMotion()) return;
    var first = container.querySelector('.yard-card:not(.yard-card-make)');
    if (!first) return;
    var hovered = function () {
      var cards = container.querySelectorAll('.yard-card');
      for (var i = 0; i < cards.length; i++) if (cards[i].matches(':hover')) return true;
      return false;
    };
    setTimeout(function () { if (first.isConnected && !hovered()) setOn(first, true); }, 700);
    setTimeout(function () { if (first.isConnected && !first.matches(':hover')) setOn(first, false); }, 2600);
  }

  // Fills `container` with the cards, shortest first, the AI door last
  // (opts.ai: false leaves it out; opts.aiHref changes where it goes).
  // opts.marks pins the time marks; opts.play runs the first card's
  // hover once. opts.empty is the line shown when the list is empty.
  function buildGrid(container, games, opts) {
    opts = opts || {};
    var pool = games.slice();
    pool.sort(function (a, b) { return minutesOf(a) - minutesOf(b) || String(a.name).localeCompare(String(b.name)); });
    var marks = opts.marks ? marksFor(pool) : [];
    container.textContent = '';
    container.classList.add('yard-grid');
    if (pool.length === 0 && opts.empty) container.appendChild(el('p', 'yard-empty', opts.empty));
    for (var i = 0; i < pool.length; i++) {
      container.appendChild(buildCard(pool[i], i, { href: opts.href, onClick: opts.onClick, mark: marks[i] || null, example: opts.example }));
    }
    if (opts.ai !== false) container.appendChild(buildAiTile(pool.length, opts.aiHref));
    if (opts.play) playFirst(container);
    return container;
  }

  window.YardPrints = {
    picture: picture,
    paintOf: paintOf,
    WOODS: WOODS,
    glimpseOf: glimpseOf,
    promptOf: promptOf,
    metaOf: metaOf,
    minutesOf: minutesOf,
    MARK_STEPS: MARK_STEPS,
    marksFor: marksFor,
    setOn: setOn,
    templateOf: templateOf,
    topicOf: topicOf,
    initialsOf: initialsOf,
    ownDetails: ownDetails,
    buildCard: buildCard,
    buildAiTile: buildAiTile,
    buildGrid: buildGrid
  };
})();
