// Builder view — palette / canvas / rail (docs/SURFACES-PLAN.md Phase 3,
// designed across six mockup rounds with the teacher, built 2026-08-01).
//
//   left:   step palette (click-to-add; curated v1 set)
//   middle: the activity as plain-English step cards, with a "+" in every
//           gap and ranked next-step suggestions (screens/shared/
//           step-suggestions.js — rules mined from built-ins, zero AI)
//   right:  the REAL settings panels, relocated: #settings-panel becomes
//           the Activity tab, #phase-panel becomes the Step tab. No
//           duplicated forms — every existing edit path keeps working.
//
// Loads after simple-view.js. Trick that keeps everyone honest: entering
// Builder first clicks the Advanced pill, so simple-view's internal state
// is 'advanced' (its selectPhase wrapper won't flip views) and editor.js
// behaves exactly as it does on the canvas — Builder just presents a
// different face over the same machinery. All DOM built via createElement/
// textContent (xss-sinks scanner applies).

(function () {
  'use strict';

  var builderRoot = document.getElementById('builder-view');
  var paletteEl = document.getElementById('builder-palette');
  var canvasEl = document.getElementById('builder-canvas');
  var railTabsEl = document.getElementById('builder-rail-tabs');
  var railBodyEl = document.getElementById('builder-rail-body');
  var viewBuilderBtn = document.getElementById('view-builder-btn');
  var viewSimpleBtn = document.getElementById('view-simple-btn');
  var viewAdvancedBtn = document.getElementById('view-advanced-btn');
  var canvasArea = document.getElementById('canvas-area');
  var settingsPanel = document.getElementById('settings-panel');
  var phasePanel = document.getElementById('phase-panel');
  if (!builderRoot || !viewBuilderBtn) return;

  var S = globalThis.StepSuggestions;

  var builderActive = false;
  var selectedId = null;      // step selected in the rail
  var openGapAfter = null;    // gap whose suggestion row is open (null = frontier)
  var aiFlavorGap = null;     // gap currently showing the AI flavor question
  var browseAllGap = null;    // gap whose popover shows the FULL step list
  var finishDismissed = false;
  var pendingSetupId = null;  // skeleton step awaiting its settings
  var dragId = null;          // step card currently being dragged

  // Original home of the relocated settings sidebar. The step form
  // (#phase-config-form) is already a portable node — editor.js moves it
  // into the selected canvas box (attachFormToSelectedBox); Builder moves
  // it into the rail instead, and sends it back to #phase-panel on exit.
  var settingsHome = settingsPanel ? settingsPanel.parentNode : null;

  var BASE_IDS = {
    'collect': 'ask', 'collect-choice': 'poll', 'estimate': 'guess', 'collect-two': 'share',
    'announce': 'announce', 'reveal': 'show', 'reveal-one': 'show-one',
    'vote': 'vote', 'end': 'wrap'
  };

  // One vocabulary: cards, palette tiles, and refs all read the canonical
  // step names from shared/phase-names.js (teacher feedback 2026-08-11:
  // "Everyone sees a message" showed on cards but was not an available
  // step). N() is the lookup every label below goes through.
  var TYPE_LABELS = window.PHASE_NAMES || {};
  function N(type) { return TYPE_LABELS[type] || type; }

  // Essentials = types whose one-click defaults are validator-certified
  // hostable-as-is (the brick set). "more" = every other phase type, in
  // the SAME groups with the SAME labels — they insert ready to set up,
  // with the step's settings open in the rail.
  var PALETTE_GROUPS = [
    { title: 'Ask the class', cls: 'ask', tiles: [
      { type: 'collect', title: N('collect') },
      { type: 'collect-choice', title: N('collect-choice') },
      { type: 'estimate', title: N('estimate') },
      { type: 'collect-two', title: N('collect-two') }
    ], more: [
      { type: 'match', title: N('match') },
      { type: 'sort', title: N('sort') },
      { type: 'buzz', title: N('buzz') },
      { type: 'solo-quiz', title: N('solo-quiz') }
    ] },
    { title: 'Show the class', cls: 'show', tiles: [
      { type: 'announce', title: N('announce') },
      { type: 'reveal', title: N('reveal') },
      { type: 'reveal-one', title: N('reveal-one') }
    ], more: [
      { type: 'leaderboard', title: N('leaderboard') },
      { type: 'winner', title: N('winner') },
      { type: 'preview', title: N('preview') }
    ] },
    { title: 'Decide together', cls: 'decide', tiles: [
      { type: 'vote', title: N('vote') }
    ], more: [
      { type: 'rank', title: N('rank') },
      { type: 'rate', title: N('rate') },
      { type: 'wager', title: N('wager') },
      { type: 'eliminate', title: N('eliminate') }
    ] },
    { title: 'Team up', cls: 'team', tiles: [], more: [
      { type: 'team-split', title: N('team-split') },
      { type: 'merge', title: N('merge') },
      { type: 'relay', title: N('relay') },
      { type: 'turn', title: N('turn') },
      { type: 'checklist', title: N('checklist') },
      { type: 'one-voice', title: N('one-voice') }
    ] },
    { title: 'Rounds', cls: 'team', tiles: [
      { type: 'guessing-rounds', title: N('guessing-rounds') },
      { type: 'who-rounds', title: N('who-rounds') }
    ], more: [
      { type: 'foreach', title: N('foreach') }
    ] },
    { title: 'AI', cls: 'ai', tiles: [
      { type: 'ai', title: N('ai'), ai: true }
    ], more: [
      { type: 'ai-eliminate', title: N('ai-eliminate') }
    ] }
  ];

  var paletteExpanded = false;

  // What a freshly inserted step still needs from EARLIER in the activity.
  // Shown in the rail nudge the moment the step lands, so a dependency is
  // explained right away instead of at save time.
  var STEP_NEEDS = {
    'leaderboard': 'Leaderboards read scores, so it needs a scored step earlier: multiple choice with a correct answer, guess a number, match, sort, or a vote.',
    'winner': 'Crowning a winner reads scores, so it needs a scored step earlier (a vote works great). Point "Scores from" at it below.',
    'eliminate': 'Eliminating players reads scores, so it needs a scored step earlier to decide who stays.',
    'foreach': 'Rounds repeat over collected answers, so it needs a question step earlier to draw from.',
    'reveal-one': 'This reveals collected answers one at a time, so it needs a question step earlier. Point "Items from" at it below.',
    'turn': 'Team turns need two things earlier: a team split, and a question step that collects the phrases to act out.'
  };

  // ---- Helpers ----

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function phases() {
    return (typeof gameConfig !== 'undefined' && gameConfig && gameConfig.phases) || null;
  }

  function markDirty() {
    if (typeof isDirty !== 'undefined') isDirty = true;
  }

  function rerenderAll() {
    // The global renderCanvas is wrapped by simple-view AND by us — one
    // call keeps every view in sync.
    if (typeof renderCanvas === 'function') renderCanvas();
  }

  function primaryTextOf(phase) {
    var t = phase.prompt || phase.message || phase.template || phase.instruction || '';
    // Tokens read as what they show ("[bar chart from 'Question 1...']")
    // instead of a mystery "…" — humanizeRef is the editor's own labeler.
    t = String(t).replace(/\{\{([^}]*)\}\}/g, function (whole, ref) {
      if (typeof humanizeRef !== 'function') return '…';
      var friendly = humanizeRef(ref.trim());
      return friendly === ref.trim() ? '…' : '[' + friendly + ']';
    }).replace(/\s+/g, ' ').trim();
    return t.length > 90 ? t.slice(0, 87) + '…' : t;
  }

  // Every block wears its family's paint (docs/design/totem/): asks are
  // birch, shows are pine, decisions are magenta, team moves are oak, AI
  // is cyan, the waiting room is sanded, the wrap-up is base wood.
  function stepClass(type) {
    if (type === 'ai-process' || type === 'ai-eliminate') return 'ai';
    if (type === 'lobby') return 'lobbystep';
    if (type === 'end') return 'endstep';
    if (type === 'collect' || type === 'collect-choice' || type === 'estimate' ||
        type === 'collect-two' || type === 'match' || type === 'sort' || type === 'buzz') return 'ask';
    if (type === 'announce' || type === 'reveal' || type === 'reveal-one' ||
        type === 'leaderboard' || type === 'winner' || type === 'preview') return 'show';
    if (type === 'vote' || type === 'rank' || type === 'rate' ||
        type === 'wager' || type === 'eliminate') return 'decide';
    return 'team';
  }

  // The cut: sawed clip-path polygons, every edge within 8% of square.
  // Cycled by position so a block keeps its cut across re-renders.
  var CUTS = [
    'polygon(0 6%, 100% 0, 98% 100%, 2% 94%)',
    'polygon(2% 0, 100% 4%, 100% 94%, 0 100%)',
    'polygon(0 0, 98% 6%, 100% 100%, 2% 96%)',
    'polygon(1% 4%, 100% 0, 99% 96%, 0 100%)'
  ];

  // Slight off-square per position: rotation alternates sign between
  // neighbors (2 degrees max), width varies block to block.
  function cutBlock(node, idx) {
    var rot = ((idx % 2 === 0) ? -1 : 1) * (0.7 + ((idx * 37) % 12) / 10);
    node.style.setProperty('--rot', rot.toFixed(1) + 'deg');
    node.style.setProperty('--slide', (rot > 0 ? -11 : 11) + 'px');
    node.style.clipPath = CUTS[idx % CUTS.length];
    return rot;
  }

  function metaTextOf(phase) {
    var bits = [];
    var text = primaryTextOf(phase);
    if (text) bits.push(text);
    if (phase.timer) bits.push(phase.timer + 's timer');
    return bits.join(' · ');
  }

  // The step everything inserts after by default: last step before the
  // end phase (or the very last step when no end exists).
  function frontierId() {
    var p = phases();
    if (!p) return null;
    var order = S.orderedPhaseIds(p);
    for (var i = order.length - 1; i >= 0; i--) {
      if (p[order[i]].type !== 'end') return order[i];
    }
    return null;
  }

  // ---- Drag to reorder ----
  // A drop is executed as repeated one-position moveStep hops, so every
  // hop goes through the same certified pointer surgery as the ↑/↓
  // buttons (which stay — they're the keyboard and touch path). If a hop
  // is refused mid-way (branch-entered step in the path), the step simply
  // stops there instead of tearing the graph.

  function moveStepAfter(p, id, afterId) {
    if (!afterId || afterId === id) return false;
    var moved = false;
    for (var guard = 0; guard < 100; guard++) {
      var order = S.orderedPhaseIds(p);
      var cur = order.indexOf(id);
      var want = order.indexOf(afterId);
      if (cur === -1 || want === -1 || cur === want + 1) break;
      if (!S.moveStep(p, id, cur < want ? 'down' : 'up')) break;
      moved = true;
    }
    return moved;
  }

  // Which card the pointer is over and which half; lobby only accepts
  // "after", end only "before" (the positions outside them don't exist).
  function dropTargetFor(e) {
    if (!dragId) return null;
    var card = e.target && e.target.closest ? e.target.closest('.builder-step') : null;
    if (!card) return null;
    var overId = card.getAttribute('data-id');
    var p = phases();
    if (!overId || overId === dragId || !p || !p[overId]) return null;
    var rect = card.getBoundingClientRect();
    var before = (e.clientY - rect.top) < rect.height / 2;
    if (p[overId].type === 'lobby') before = false;
    if (p[overId].type === 'end') before = true;
    return { card: card, overId: overId, before: before };
  }

  function clearDropMarkers() {
    var marked = canvasEl.querySelectorAll('.drop-before, .drop-after');
    for (var i = 0; i < marked.length; i++) {
      marked[i].classList.remove('drop-before');
      marked[i].classList.remove('drop-after');
    }
  }

  canvasEl.addEventListener('dragover', function (e) {
    clearDropMarkers();
    var t = dropTargetFor(e);
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    t.card.classList.add(t.before ? 'drop-before' : 'drop-after');
  });

  canvasEl.addEventListener('dragleave', clearDropMarkers);

  canvasEl.addEventListener('drop', function (e) {
    var t = dropTargetFor(e);
    clearDropMarkers();
    if (!t) return;
    e.preventDefault();
    var p = phases();
    var order = S.orderedPhaseIds(p);
    var afterId;
    if (t.before) {
      var j = order.indexOf(t.overId) - 1;
      while (j >= 0 && order[j] === dragId) j--;
      afterId = j >= 0 ? order[j] : null;
    } else {
      afterId = t.overId;
    }
    var id = dragId;
    dragId = null;
    if (moveStepAfter(p, id, afterId)) {
      markDirty();
      rerenderAll();
    }
  });

  // ---- Inserting steps ----

  function insertStep(type, afterId) {
    browseAllGap = null;
    var p = phases();
    if (!p) return;
    var after = afterId || frontierId();
    if (!after) return;
    var ctx = { phases: p, afterId: after };

    if (type === 'ai') {
      // AI steps transform answers; without a question step earlier there
      // is nothing to transform (this used to be a silent no-op).
      if (!S.buildAiPair(S.aiFlavors()[0], ctx)) {
        alert('AI steps transform the class\'s answers. Add a question step first (Open answer, Multiple choice, or Secret + clue).');
        return;
      }
      // Palette AI tile → open the flavor question at that gap instead.
      aiFlavorGap = after;
      openGapAfter = after;
      renderBuilder();
      return;
    }

    if (type === 'guessing-rounds' || type === 'who-rounds') {
      if (type === 'who-rounds') ctx.guess = 'who';
      var rounds = S.buildGuessingRounds(ctx);
      if (!rounds) {
        alert('Guessing rounds cycle through answers, add a question step (like Open answer or Secret + clue) first.');
        return;
      }
      S.insertAfter(p, after, rounds.id, rounds.phase);
      afterInsert(rounds.id);
      return;
    }

    var phase = S.defaultPhaseFor(type, ctx);
    var isSkeleton = false;
    if (!phase) {
      isSkeleton = true;
      // No certified default — insert a skeleton; the rail's real
      // settings form opens so the teacher fills in what the step needs.
      // Save-time validation catches anything missing.
      phase = { type: type };
    } else if (type === 'reveal-one' && !phase.from) {
      // Certified default but no question step to draw from yet — treat
      // like a skeleton so the rail explains the dependency.
      isSkeleton = true;
    }
    var id = S.freshId(p, BASE_IDS[type] || type);
    S.insertAfter(p, after, id, phase);
    pendingSetupId = isSkeleton ? id : null;
    afterInsert(id);
  }

  function insertAiFlavor(flavor, afterId) {
    var p = phases();
    if (!p) return;
    var pair = S.buildAiPair(flavor, { phases: p, afterId: afterId });
    if (!pair) {
      alert('AI steps transform the class\'s answers. Add a question step first (Open answer, Multiple choice, or Secret + clue).');
      return;
    }
    S.insertAfter(p, afterId, pair[0].id, pair[0].phase);
    S.insertAfter(p, pair[0].id, pair[1].id, pair[1].phase);
    aiFlavorGap = null;
    afterInsert(pair[0].id);
  }

  function afterInsert(newId) {
    markDirty();
    openGapAfter = null;   // momentum: the frontier row auto-opens fresh
    finishDismissed = false;
    selectedId = newId;
    rerenderAll();
    if (typeof selectPhase === 'function') selectPhase(newId);
    showStepTab();
  }

  // ---- Rail (tabs over the relocated real panels) ----

  function showActivityTab() {
    selectedId = null;
    if (typeof deselectPhase === 'function') deselectPhase();
    renderRailTabs();
    updateRail();
    highlightCards();
  }

  function showStepTab() {
    renderRailTabs();
    updateRail();
    highlightCards();
  }

  function renderRailTabs() {
    railTabsEl.textContent = '';
    var actTab = el('button', 'builder-tab' + (selectedId ? '' : ' active'), 'Activity');
    actTab.type = 'button';
    actTab.addEventListener('click', showActivityTab);
    railTabsEl.appendChild(actTab);

    var p = phases();
    if (selectedId && p && p[selectedId]) {
      var label = TYPE_LABELS[p[selectedId].type] || p[selectedId].type;
      var stepTab = el('button', 'builder-tab active', 'Step · ' + label);
      stepTab.type = 'button';
      railTabsEl.appendChild(stepTab);
    }
  }

  function highlightCards() {
    var cards = canvasEl.querySelectorAll('.builder-step');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('selected', cards[i].getAttribute('data-id') === selectedId);
    }
  }

  // ---- Suggestion rows ----

  function suggestionRow(afterId, isFrontier) {
    var p = phases();
    var row = el('div', 'builder-suggest');
    var head = el('div', 'builder-suggest-head');
    var plus = el('span', 'builder-plus open', '+');
    head.appendChild(plus);

    // "Browse all steps" mode: the popover itself becomes the full grouped
    // step list, and picking one inserts into THIS gap. (It used to expand
    // the left palette — invisible behind the popover, and palette tiles
    // insert at the end, not here.)
    if (browseAllGap === afterId) {
      row.classList.add('builder-suggest-browse');
      head.appendChild(el('span', null, 'Pick any step'));
      row.appendChild(head);
      PALETTE_GROUPS.forEach(function (group) {
        var allTiles = group.tiles.concat(group.more || []);
        if (allTiles.length === 0) return;
        row.appendChild(el('h4', 'builder-browse-group', group.title));
        var g = el('div', 'builder-suggest-row');
        allTiles.forEach(function (t) {
          var tile = el('button', 'builder-tile sug ' + group.cls);
          tile.type = 'button';
          if (window.PHASE_BLURBS && window.PHASE_BLURBS[t.type]) tile.title = window.PHASE_BLURBS[t.type];
          tile.appendChild(el('span', 'builder-tile-title', t.title));
          tile.addEventListener('click', function () {
            browseAllGap = null;
            insertStep(t.type, afterId);
          });
          g.appendChild(tile);
        });
        row.appendChild(g);
      });
      var browseFoot = el('div', 'builder-suggest-foot');
      var backBtn = el('button', 'builder-suggest-all', '← Back to suggestions');
      backBtn.type = 'button';
      backBtn.addEventListener('click', function () {
        browseAllGap = null;
        renderBuilder();
      });
      browseFoot.appendChild(backBtn);
      row.appendChild(browseFoot);
      return row;
    }

    var tiles;
    var headText;

    if (aiFlavorGap === afterId) {
      row.classList.add('builder-suggest-ai');
      headText = 'What should the AI do with everyone’s answers?';
      tiles = S.aiFlavors().map(function (flavor) {
        return {
          title: flavor.title, reason: flavor.reason,
          mostCommon: flavor.mostCommon, cls: 'ai',
          onPick: function () { insertAiFlavor(flavor, afterId); }
        };
      });
    } else {
      var onlyLobby = S.orderedPhaseIds(p).every(function (id) {
        return p[id].type === 'lobby' || p[id].type === 'end';
      });
      var afterType = p[afterId] ? p[afterId].type : 'lobby';
      var raw = onlyLobby ? S.suggestOpening()
        : S.suggestAfter(afterType, { phases: p, afterId: afterId });
      headText = onlyLobby ? 'What happens first?'
        : 'What comes next?';
      tiles = raw.map(function (sug) {
        return {
          title: sug.title, reason: sug.reason,
          mostCommon: sug.mostCommon, feelsComplete: sug.feelsComplete,
          cls: sug.ai ? 'ai' : (sug.type === 'end' ? 'endtile' : tileClass(sug.type)),
          onPick: function () { insertStep(sug.type, afterId); }
        };
      });
    }

    head.appendChild(el('span', null, headText));
    row.appendChild(head);

    var grid = el('div', 'builder-suggest-row');
    tiles.forEach(function (t) {
      var tile = el('button', 'builder-tile sug ' + (t.cls || ''));
      tile.type = 'button';
      if (t.type && window.PHASE_BLURBS && window.PHASE_BLURBS[t.type]) tile.title = window.PHASE_BLURBS[t.type];
      if (t.mostCommon) tile.appendChild(el('span', 'builder-why', 'most common'));
      if (t.feelsComplete) tile.appendChild(el('span', 'builder-why', 'feels complete'));
      tile.appendChild(el('span', 'builder-tile-title', t.title));
      if (t.reason) tile.appendChild(el('small', null, t.reason));
      tile.addEventListener('click', t.onPick);
      grid.appendChild(tile);
    });
    row.appendChild(grid);

    var foot = el('div', 'builder-suggest-foot');
    if (aiFlavorGap === afterId) {
      var back = el('button', 'builder-suggest-all', '← Back');
      back.type = 'button';
      back.addEventListener('click', function () {
        aiFlavorGap = null;
        renderBuilder();
      });
      foot.appendChild(back);
    } else if (!isFrontier) {
      var close = el('button', 'builder-suggest-all', 'Close');
      close.type = 'button';
      close.addEventListener('click', function () {
        openGapAfter = null;
        browseAllGap = null;
        renderBuilder();
      });
      foot.appendChild(close);
    }
    var all = el('button', 'builder-suggest-all', 'Browse all steps →');
    all.type = 'button';
    all.addEventListener('click', function () {
      browseAllGap = afterId;
      aiFlavorGap = null;
      renderBuilder();
    });
    foot.appendChild(all);
    row.appendChild(foot);

    return row;
  }

  function tileClass(type) {
    if (type === 'guessing-rounds' || type === 'who-rounds') return 'team';
    if (type === 'collect' || type === 'collect-choice' || type === 'estimate' || type === 'collect-two') return 'ask';
    if (type === 'announce' || type === 'reveal' || type === 'reveal-one' || type === 'leaderboard') return 'show';
    if (type === 'vote' || type === 'rank' || type === 'rate') return 'decide';
    return '';
  }

  // ---- Finish panel (end step exists) ----

  function finishPanel() {
    var panel = el('div', 'builder-done');
    panel.appendChild(el('h3', null, 'Your activity is ready'));
    panel.appendChild(el('p', 'builder-done-check',
      '✓ Every step connects. Try it with pretend players before your class sees it.'));
    var row = el('div', 'builder-done-row');

    var tryBtn = el('button', 'builder-done-btn primary', '▶ Try it with pretend players');
    tryBtn.type = 'button';
    tryBtn.addEventListener('click', function () {
      var btn = document.getElementById('test-game-btn');
      if (btn) btn.click();
    });
    row.appendChild(tryBtn);

    var hostBtn = el('button', 'builder-done-btn secondary', 'Host it live now');
    hostBtn.type = 'button';
    hostBtn.addEventListener('click', function () {
      // The teacher console opens in a new tab, inside the click
      // (shared/host-launch.js); the save below may take a moment
      if (window.HostLaunch) HostLaunch.begin();
      var go = function () {
        if (typeof gameId !== 'undefined' && gameId) {
          window.location.href = window.HostLaunch ? HostLaunch.hostUrl(gameId) : '/host?game=' + encodeURIComponent(gameId);
        } else if (window.HostLaunch) {
          HostLaunch.abandon();
        }
      };
      if (typeof autoSaveIfDirty === 'function') {
        Promise.resolve(autoSaveIfDirty()).then(go);
      } else {
        go();
      }
    });
    row.appendChild(hostBtn);

    var polish = el('button', 'builder-done-link', 'Keep polishing');
    polish.type = 'button';
    polish.addEventListener('click', function () {
      finishDismissed = true;
      renderBuilder();
    });
    row.appendChild(polish);

    panel.appendChild(row);
    return panel;
  }

  // ---- Canvas ----

  function renderBuilder() {
    if (!builderActive) return;
    var p = phases();
    if (!p) return;
    selectedId = (typeof selectedPhaseId !== 'undefined' && selectedPhaseId) || null;

    canvasEl.textContent = '';
    // The activity IS a totem: one stack wrapper carries the single flat
    // drop-shadow for every block in it (pieces inside cast none). Any
    // see-through element inside it would ghost — the dashed add slot
    // gets a solid gesso fill for exactly that reason.
    canvasEl.appendChild(el('div', 'builder-stack-caps', 'The stack · drag to reorder'));
    var stackEl = el('div', 'builder-stack');
    canvasEl.appendChild(stackEl);
    var order = S.orderedPhaseIds(p);
    var frontier = frontierId();
    var ended = S.hasEnd(p);
    // An end step alone doesn't make it finished — a blank activity ships
    // with lobby+end. "Done" means ended AND has an arc.
    var complete = ended && S.hasArc(p);
    var num = 0;

    order.forEach(function (id, idx) {
      var phase = p[id];
      num++;

      var card = el('div', 'builder-step ' + stepClass(phase.type));
      card.setAttribute('data-id', id);
      cutBlock(card, idx);
      card.style.width = (250 + ((idx * 53) % 4) * 16) + 'px';
      card.appendChild(el('span', 'builder-step-num', String(num)));
      var body = el('div', 'builder-step-body');
      var label = TYPE_LABELS[phase.type] || phase.type;
      body.appendChild(el('p', 'builder-step-label', label));
      var meta = metaTextOf(phase);
      if (meta) body.appendChild(el('small', 'builder-step-meta', meta));
      card.appendChild(body);

      // Reorder/delete tools — quiet until the card is hovered. All three
      // reuse existing machinery: moveStep is pointer surgery in the
      // suggestions module, deletePhase is the editor's own (re-links
      // next/approveNext/nextByWinner and refuses lobby/end).
      if (phase.type !== 'lobby' && phase.type !== 'end') {
        card.draggable = true;
        card.title = 'Drag to reorder';
        card.addEventListener('dragstart', function (e) {
          dragId = id;
          card.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', id); } catch (err) { /* IE quirk, harmless */ }
        });
        card.addEventListener('dragend', function () {
          dragId = null;
          card.classList.remove('dragging');
          clearDropMarkers();
        });
        var tools = el('div', 'builder-step-tools');
        var upBtn = el('button', 'builder-step-tool', '↑');
        upBtn.type = 'button';
        upBtn.title = 'Move this step up';
        upBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (S.moveStep(p, id, 'up')) { markDirty(); rerenderAll(); }
        });
        tools.appendChild(upBtn);
        var downBtn = el('button', 'builder-step-tool', '↓');
        downBtn.type = 'button';
        downBtn.title = 'Move this step down';
        downBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (S.moveStep(p, id, 'down')) { markDirty(); rerenderAll(); }
        });
        tools.appendChild(downBtn);
        var delBtn = el('button', 'builder-step-tool builder-step-del', '✕');
        delBtn.type = 'button';
        delBtn.title = 'Delete this step';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var label = TYPE_LABELS[phase.type] || phase.type;
          if (!confirm('Delete step ' + num + ' (' + label + ')? This cannot be undone.')) return;
          if (typeof deletePhase === 'function') deletePhase(id);
        });
        tools.appendChild(delBtn);
        card.appendChild(tools);
      }
      if (id === selectedId) card.classList.add('selected');
      if (phase.type !== 'lobby' && phase.type !== 'end') {
        card.addEventListener('click', function () {
          selectedId = id;
          if (typeof selectPhase === 'function') selectPhase(id);
          showStepTab();
        });
      } else if (phase.type === 'end') {
        card.addEventListener('click', function () {
          selectedId = id;
          if (typeof selectPhase === 'function') selectPhase(id);
          showStepTab();
        });
      }
      stackEl.appendChild(card);

      // Gap after this step (not after the end step)
      var isLast = idx === order.length - 1;
      var isFrontierGap = id === frontier;
      if (phase.type === 'end') return;

      var gapOpen =
        openGapAfter === id ||
        aiFlavorGap === id ||
        (isFrontierGap && openGapAfter === null && !complete);

      if (gapOpen) {
        stackEl.appendChild(suggestionRow(id, isFrontierGap && !complete));
      } else if (isFrontierGap) {
        // The frontier keeps a standing dashed drop slot — the "add"
        // affordance of the design system — instead of a whisper-plus.
        var slot = el('button', 'builder-add-slot', '+ Add a step');
        slot.type = 'button';
        slot.title = 'Add a step here';
        slot.addEventListener('click', function () {
          openGapAfter = id;
          aiFlavorGap = null;
          browseAllGap = null;
          renderBuilder();
        });
        stackEl.appendChild(slot);
      } else {
        var line = el('div', 'builder-plusline');
        var plus = el('button', 'builder-plus', '+');
        plus.type = 'button';
        plus.title = 'Add a step here';
        plus.addEventListener('click', function () {
          openGapAfter = id;
          aiFlavorGap = null;
          browseAllGap = null;
          renderBuilder();
        });
        line.appendChild(plus);
        stackEl.appendChild(line);
      }
      void isLast;
    });

    // A stack never floats: plinth + base board under the whole totem.
    stackEl.appendChild(el('div', 'builder-plinth'));
    stackEl.appendChild(el('div', 'builder-baseboard'));

    if (complete && !finishDismissed) {
      canvasEl.appendChild(finishPanel());
    }

    renderRailTabs();
    updateRail();
  }

  // The step's MAIN text (prompt/message/template) is edited inline on the
  // Advanced canvas, so the relocated config form doesn't include it — the
  // rail adds its own field for it, writing straight to the config and
  // updating the card text live (no re-render — keeps focus).
  var PRIMARY_FIELDS = {
    'collect': ['prompt', 'Question students see'],
    'collect-choice': ['prompt', 'Question students see'],
    'estimate': ['prompt', 'Question students see'],
    'announce': ['message', 'Message everyone sees'],
    'reveal': ['template', 'What the projector shows'],
    'reveal-one': ['message', 'Message above the reveals'],
    'end': ['message', 'Wrap-up message'],
    'ai-process': ['instruction', 'Instructions to the AI (edit freely)']
  };

  var railPrimary = el('div', 'builder-rail-primary');

  function renderRailPrimary() {
    railPrimary.textContent = '';
    var p = phases();
    if (!selectedId || !p || !p[selectedId]) return;
    var phase = p[selectedId];
    var spec = PRIMARY_FIELDS[phase.type];
    if (!spec) return;
    var field = spec[0];
    var stepId = selectedId;

    function updateCard() {
      var live = phases();
      if (!live || !live[stepId]) return;
      var card = canvasEl.querySelector('.builder-step[data-id="' + stepId + '"]');
      if (!card) return;
      var meta = metaTextOf(live[stepId]);
      var metaEl = card.querySelector('.builder-step-meta');
      if (metaEl) {
        metaEl.textContent = meta;
      } else if (meta) {
        var body = card.querySelector('.builder-step-body');
        if (body) body.appendChild(el('small', 'builder-step-meta', meta));
      }
    }

    // Announce and reveal messages split into words + an "Also show"
    // dropdown for the chart/list (raw {{tokens}} overwhelmed teachers).
    // Unusual hand-authored shapes (parse null) keep the raw box below.
    var structured = null;
    if ((phase.type === 'announce' || phase.type === 'reveal') &&
        typeof parseMessageDisplay === 'function') {
      structured = parseMessageDisplay(phase[field]);
    }

    var group = el('div', 'form-group');
    group.appendChild(el('label', null, spec[1]));
    var box = document.createElement('textarea');
    box.rows = 3;
    box.value = structured ? structured.words : (phase[field] || '');
    function writeStructured() {
      var live = phases();
      if (!live || !live[stepId]) return;
      live[stepId][field] = serializeMessageDisplay(
        structured.words, structured.ref, structured.sep,
        structured.after, structured.sepAfter);
      markDirty();
      updateCard();
    }

    box.addEventListener('input', function () {
      if (structured) {
        structured.words = box.value;
        writeStructured();
      } else {
        var live = phases();
        if (!live || !live[stepId]) return;
        live[stepId][field] = box.value;
        markDirty();
        updateCard();
      }
    });
    group.appendChild(box);
    railPrimary.appendChild(group);

    if (structured) {
      var dGroup = el('div', 'form-group');
      dGroup.appendChild(el('label', null, 'Also show'));
      var sel = document.createElement('select');
      var opts = [{ value: '', label: '(nothing extra)' }]
        .concat(typeof buildDisplayOptions === 'function' ? buildDisplayOptions(stepId) : []);
      var known = false;
      for (var oi = 0; oi < opts.length; oi++) {
        if (opts[oi].value === structured.ref) known = true;
      }
      if (structured.ref && !known) {
        opts.push({
          value: structured.ref,
          label: typeof humanizeRef === 'function' ? humanizeRef(structured.ref) : structured.ref
        });
      }
      opts.forEach(function (o) {
        var optEl = document.createElement('option');
        optEl.value = o.value;
        optEl.textContent = o.label;
        sel.appendChild(optEl);
      });
      sel.value = structured.ref || '';
      sel.addEventListener('change', function () {
        structured.ref = sel.value || null;
        writeStructured();
        // Re-render: picking a display reveals the words-under-it box;
        // removing it folds those words back into the main box.
        renderRailPrimary();
      });
      dGroup.appendChild(sel);
      dGroup.appendChild(el('small', 'builder-also-show-hint',
        'Information from an earlier step, shown under the message.'));
      railPrimary.appendChild(dGroup);

      // Words that come AFTER the display (a closing line under the chart,
      // "Read each side out loud..."). Only meaningful when a display exists.
      if (structured.ref) {
        var aGroup = el('div', 'form-group');
        aGroup.appendChild(el('label', null, 'Words under it'));
        var afterBox = document.createElement('textarea');
        afterBox.rows = 2;
        afterBox.value = structured.after || '';
        afterBox.addEventListener('input', function () {
          structured.after = afterBox.value;
          writeStructured();
        });
        aGroup.appendChild(afterBox);
        railPrimary.appendChild(aGroup);
      }
    }
  }

  // Pull the real step form (filled by renderPhaseConfig) into the rail;
  // with nothing selected, show the relocated Activity settings instead.
  function updateRail() {
    var form = document.getElementById('phase-config-form');
    var preview = document.getElementById('live-preview-section');
    if (selectedId) {
      if (settingsPanel) settingsPanel.classList.add('builder-hidden');
      renderRailPrimary();
      railBodyEl.appendChild(railPrimary);
      var oldNudge = railBodyEl.querySelector('.builder-setup-nudge');
      if (oldNudge) oldNudge.remove();
      if (selectedId === pendingSetupId) {
        var liveP = phases();
        var selType = liveP && liveP[selectedId] && liveP[selectedId].type;
        var needs = STEP_NEEDS[selType];
        var nudge = el('p', 'builder-setup-nudge', needs
          ? 'New step. ' + needs
          : 'New step, fill in its settings below to make it playable.');
        railBodyEl.insertBefore(nudge, railPrimary);
      }
      if (form) {
        railBodyEl.appendChild(form);
        // The rail's own primary field edits reveal's template — drop the
        // form's copy (announce/collect primaries are already stripped by
        // the editor, reveal's template is not: its canvas primary is the
        // content ref). Two boxes editing one value = stale-write bug.
        var liveSel = phases();
        if (liveSel && liveSel[selectedId] && liveSel[selectedId].type === 'reveal') {
          var dupTemplate = form.querySelector('#phase-template');
          var dupGroup = dupTemplate && dupTemplate.closest ? dupTemplate.closest('.form-group') : null;
          if (dupGroup && dupGroup.parentNode) dupGroup.parentNode.removeChild(dupGroup);
        }
      }
      if (preview) railBodyEl.appendChild(preview);
    } else {
      if (settingsPanel) settingsPanel.classList.remove('builder-hidden');
      railPrimary.textContent = '';
      if (railPrimary.parentNode === railBodyEl) railBodyEl.removeChild(railPrimary);
      if (form && phasePanel) phasePanel.appendChild(form);
      if (preview && phasePanel) phasePanel.appendChild(preview);
    }
  }

  // ---- Palette ----

  function renderPalette() {
    paletteEl.textContent = '';
    paletteEl.appendChild(el('h2', 'builder-palette-title', 'Scrap bin · new steps'));
    paletteEl.appendChild(el('p', 'builder-palette-hint',
      'Click a piece to add it to your stack.'));
    var tileIdx = 0;
    PALETTE_GROUPS.forEach(function (group) {
      var tiles = group.tiles.concat(paletteExpanded ? (group.more || []) : []);
      if (tiles.length === 0) return;
      var g = el('div', 'builder-pgroup');
      g.appendChild(el('h3', null, group.title));
      tiles.forEach(function (t) {
        var tile = el('button', 'builder-tile ' + group.cls);
        tile.type = 'button';
        cutBlock(tile, tileIdx);
        tileIdx++;
        if (window.PHASE_BLURBS && window.PHASE_BLURBS[t.type]) tile.title = window.PHASE_BLURBS[t.type];
        tile.appendChild(el('span', 'builder-tile-title', t.title));
        tile.addEventListener('click', function () {
          insertStep(t.type, null);
        });
        g.appendChild(tile);
      });
      paletteEl.appendChild(g);
    });
    var more = el('button', 'builder-suggest-all builder-more',
      paletteExpanded ? '← Just the essentials' : 'All step types →');
    more.type = 'button';
    more.title = paletteExpanded
      ? 'Back to the steps that work with one click'
      : 'Show every step type in the same groups';
    more.addEventListener('click', function () {
      paletteExpanded = !paletteExpanded;
      renderPalette();
    });
    paletteEl.appendChild(more);
  }

  // ---- Entering / leaving Builder ----

  // targetStepId (optional, string): open with that step selected — used by
  // Simple view's "All settings →" links and review-panel deep links. The
  // no-target path shows the Activity tab; the targeted path must NOT, since
  // showActivityTab's deselectPhase is async and would null the selection
  // after it lands (a race we lost before this parameter existed).
  function enterBuilder(targetStepId) {
    var target = typeof targetStepId === 'string' ? targetStepId : null;
    if (builderActive) {
      if (target && typeof selectPhase === 'function') {
        selectPhase(target);
        showStepTab();
      }
      return;
    }
    if (typeof autoSaveIfDirty === 'function') autoSaveIfDirty();

    // Put simple-view's state on 'advanced' so its selectPhase wrapper
    // never flips views out from under us; then hide the advanced canvas.
    if (viewAdvancedBtn) viewAdvancedBtn.click();
    canvasArea.style.display = 'none';

    builderActive = true;
    builderRoot.hidden = false;
    document.body.classList.add('builder-mode');

    // Relocate the Activity settings sidebar into the rail.
    if (settingsPanel) railBodyEl.appendChild(settingsPanel);

    viewBuilderBtn.classList.add('active');
    if (viewSimpleBtn) viewSimpleBtn.classList.remove('active');
    if (viewAdvancedBtn) viewAdvancedBtn.classList.remove('active');
    try { localStorage.setItem('lanyardEditorBuilder', '1'); } catch (e) { /* ignore */ }

    renderPalette();
    if (target) {
      if (typeof selectPhase === 'function') selectPhase(target);
      showStepTab();
      var card = canvasEl.querySelector('.builder-step[data-id="' + target + '"]');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      showActivityTab();
    }
    renderBuilder();
  }

  function leaveBuilder() {
    if (!builderActive) return;
    builderActive = false;
    builderRoot.hidden = true;
    document.body.classList.remove('builder-mode');
    viewBuilderBtn.classList.remove('active');

    // Send the panels home. The settings sidebar was the FIRST child of
    // #editor-body — appendChild would resurrect it on the wrong side.
    if (settingsPanel) {
      settingsPanel.classList.remove('builder-hidden');
      if (settingsHome) settingsHome.insertBefore(settingsPanel, settingsHome.firstChild);
    }
    var form = document.getElementById('phase-config-form');
    var preview = document.getElementById('live-preview-section');
    if (form && phasePanel) phasePanel.appendChild(form);
    if (preview && phasePanel) phasePanel.appendChild(preview);
    try { localStorage.removeItem('lanyardEditorBuilder'); } catch (e) { /* ignore */ }
  }

  viewBuilderBtn.addEventListener('click', function () {
    if (!builderActive) enterBuilder();
  });

  // Hook for simple-view: its "All settings →" links and deep-link
  // selectPhase wrapper land here (with the step id) instead of the
  // technical canvas.
  window.__enterBuilder = enterBuilder;
  if (viewSimpleBtn) viewSimpleBtn.addEventListener('click', leaveBuilder);
  if (viewAdvancedBtn) viewAdvancedBtn.addEventListener('click', function () {
    // Entering builder clicks this button programmatically — only a real
    // user click should exit builder. builderActive is still false during
    // the programmatic click, so this guard is enough.
    if (builderActive) leaveBuilder();
  });

  // Re-render on every canvas render (all mutation paths funnel here).
  var _origRenderCanvas = renderCanvas;
  renderCanvas = function () {
    _origRenderCanvas.apply(this, arguments);
    if (builderActive) renderBuilder();
  };

  // Restore Builder on load if it was the last-used view. gameConfig
  // isn't fetched at script time — hook the first canvas render.
  // One-editor pass (2026-08-20): the header toggle is hidden, so a
  // restored Builder would strand the teacher on a face nothing names.
  // Never auto-restore; clear the stale flag. enterBuilder stays callable.
  try { localStorage.removeItem('lanyardEditorBuilder'); } catch (e) { /* ignore */ }
  var wantBuilder = false;
  if (wantBuilder) {
    var restored = false;
    var _renderForRestore = renderCanvas;
    renderCanvas = function () {
      _renderForRestore.apply(this, arguments);
      if (!restored && typeof gameConfig !== 'undefined' && gameConfig && gameConfig.phases) {
        restored = true;
        enterBuilder();
      }
    };
  }
})();
