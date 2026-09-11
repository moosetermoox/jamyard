// yard-prints.js — the yard's grid of activity prints (home 15b, 2026-09-10).
//
// One activity = one paper print with a mini projector drawn from the
// server's `glimpse` (engine/home-glimpse.js): the first thing students
// are asked, a few answer blocks landing, or the doorway code for a
// rolling start. Under it the name and a "to think · ~10 min" line. The
// home page's "The whole yard" and the yard page (/library) draw the same
// grid from this module, so the two never drift apart (owner's call
// 2026-09-10: the yard is the home's grid without the fold and carousel).
//
// Decoration that must look alive but never lie about a live room: the
// code letters, head count, timer, and pile are dealt from the activity's
// id (`picture`), so a template keeps the same picture across visits and
// no two neighbors match. Activity text is untrusted: textContent only.
//
// Plain script (browser global): window.YardPrints. Pair it with
// /shared/yard-prints.css; needs /shared/goal-groups.js first.
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

  // "to think · ~10 min · rolling start": the job in lower case, the short time
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
  function minutesOf(g) {
    var m = /(\d+)/.exec(g.playTime || '');
    return m ? parseInt(m[1], 10) : 999;
  }

  var CARD_ROTS = ['-0.8deg', '0.6deg', '-0.7deg', '0.9deg', '-0.5deg', '0.8deg', '-0.9deg', '0.5deg', '-0.6deg', '1deg'];

  function buildMini(g) {
    var mini = el('div', 'yp-mini');
    var pic = picture(g);
    var gl = glimpseOf(g);
    if (gl.mode === 'join') {
      mini.appendChild(el('span', 'yp-caps', 'Join in'));
      mini.appendChild(el('div', 'yp-code', pic.code));
      mini.appendChild(el('span', 'yp-qr'));
      return mini;
    }
    mini.appendChild(el('span', 'yp-caps', gl.mode === 'talk' ? 'Nothing to type' : 'Everyone is writing…'));
    mini.appendChild(el('div', 'yp-prompt', gl.prompt));
    if (gl.mode !== 'talk') {
      var pile = el('div', 'yp-pile');
      var blocks = pic.blocks.slice(0, 3);
      for (var i = 0; i < blocks.length; i++) {
        var block = el('div', 'yp-block ' + blocks[i].tone);
        block.style.width = Math.round(blocks[i].width * 0.4) + 'px';
        block.style.setProperty('--rot', blocks[i].rot);
        pile.appendChild(block);
      }
      mini.appendChild(pile);
    }
    return mini;
  }

  // opts.href(g) gives the link; opts.onClick(g, card) makes the print a
  // button instead (the yard page opens its popup with the doors). The
  // hover card carries the description either way when it is loaded.
  function buildCard(g, i, opts) {
    opts = opts || {};
    var card;
    if (opts.onClick) {
      card = el('button', 'yard-card');
      card.type = 'button';
      card.setAttribute('aria-haspopup', 'dialog');
      card.addEventListener('click', function () { opts.onClick(g, card); });
    } else {
      card = el('a', 'yard-card');
      card.href = opts.href ? opts.href(g) : '#';
    }
    card.setAttribute('data-game-id', g.id);
    card.setAttribute('aria-label', g.name + ', see what it is');
    card.style.setProperty('--rot', CARD_ROTS[i % CARD_ROTS.length]);
    if (window.HoverCard) HoverCard.attach(card, g);
    var print = el('div', 'yard-print');
    print.appendChild(buildMini(g));
    card.appendChild(print);
    card.appendChild(el('span', 'yard-name', g.name));
    card.appendChild(el('span', 'yard-meta', metaOf(g)));
    return card;
  }

  function buildAiTile(i, href) {
    var card = el('a', 'yard-card');
    card.href = href || '/designer';
    card.title = 'Describe an activity in plain words and the AI builds it';
    card.style.setProperty('--rot', CARD_ROTS[i % CARD_ROTS.length]);
    var print = el('div', 'yard-print');
    var mini = el('div', 'yp-mini');
    mini.appendChild(el('span', 'yp-caps', 'Describe an activity'));
    mini.appendChild(el('div', 'yp-slot'));
    mini.appendChild(el('span', 'yp-chip', 'Build it'));
    print.appendChild(mini);
    card.appendChild(print);
    card.appendChild(el('span', 'yard-name', 'Make one with AI'));
    card.appendChild(el('span', 'yard-meta', 'your prompt, your class'));
    return card;
  }

  // Fills `container` with the prints, shortest first, the AI door last
  // (opts.ai: false leaves it out; opts.aiHref changes where it goes).
  // opts.empty is the line shown when the list is empty.
  function buildGrid(container, games, opts) {
    opts = opts || {};
    var pool = games.slice();
    pool.sort(function (a, b) { return minutesOf(a) - minutesOf(b) || String(a.name).localeCompare(String(b.name)); });
    container.textContent = '';
    container.classList.add('yard-grid');
    if (pool.length === 0 && opts.empty) container.appendChild(el('p', 'yard-empty', opts.empty));
    for (var i = 0; i < pool.length; i++) container.appendChild(buildCard(pool[i], i, opts));
    if (opts.ai !== false) container.appendChild(buildAiTile(pool.length, opts.aiHref));
    return container;
  }

  window.YardPrints = {
    picture: picture,
    glimpseOf: glimpseOf,
    metaOf: metaOf,
    minutesOf: minutesOf,
    buildCard: buildCard,
    buildAiTile: buildAiTile,
    buildGrid: buildGrid
  };
})();
