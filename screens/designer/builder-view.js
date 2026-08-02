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
  var finishDismissed = false;

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

  var TYPE_LABELS = {
    'lobby': 'Players join the room', 'collect': 'Students answer',
    'collect-choice': 'Multiple choice', 'estimate': 'Guess a number',
    'announce': 'Everyone sees a message', 'reveal': 'Results on the projector',
    'reveal-one': 'Reveal one at a time', 'vote': 'The class votes',
    'ai-process': 'AI transforms the answers', 'end': 'Wrap up',
    'leaderboard': 'Leaderboard', 'team-split': 'Split into teams',
    'preview': 'You review privately first', 'foreach': 'For each answer…',
    'merge': 'Groups combine answers', 'rank': 'Rank a list',
    'rate': 'Rate on scales', 'match': 'Match pairs', 'sort': 'Sort into buckets',
    'wager': 'Place bets', 'relay': 'Take turns', 'turn': 'Team turns',
    'buzz': 'Buzzer round', 'one-voice': 'Count together',
    'checklist': 'Group checklist', 'winner': 'Crown a winner',
    'eliminate': 'Eliminate players', 'ai-eliminate': 'AI judges and eliminates'
  };

  var PALETTE_GROUPS = [
    { title: 'Ask the class', cls: 'ask', tiles: [
      { type: 'collect', title: 'Open answer' },
      { type: 'collect-choice', title: 'Multiple choice' },
      { type: 'estimate', title: 'Guess a number' },
      { type: 'collect-two', title: 'Secret + clue' }
    ] },
    { title: 'Show the class', cls: 'show', tiles: [
      { type: 'announce', title: 'Announcement' },
      { type: 'reveal', title: 'Reveal results' },
      { type: 'reveal-one', title: 'Reveal one at a time' }
    ] },
    { title: 'Decide together', cls: 'decide', tiles: [
      { type: 'vote', title: 'Vote' }
    ] },
    { title: 'Rounds', cls: 'team', tiles: [
      { type: 'guessing-rounds', title: 'Guessing rounds' }
    ] },
    { title: 'AI', cls: 'ai', tiles: [
      { type: 'ai', title: 'AI transforms answers', ai: true }
    ] }
  ];

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
    t = String(t).replace(/\{\{[^}]*\}\}/g, '…').replace(/\s+/g, ' ').trim();
    return t.length > 90 ? t.slice(0, 87) + '…' : t;
  }

  function stepClass(type) {
    if (type === 'ai-process' || type === 'ai-eliminate') return 'ai';
    return '';
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

  // ---- Inserting steps ----

  function insertStep(type, afterId) {
    var p = phases();
    if (!p) return;
    var after = afterId || frontierId();
    if (!after) return;
    var ctx = { phases: p, afterId: after };

    if (type === 'ai') {
      // Palette AI tile → open the flavor question at that gap instead.
      aiFlavorGap = after;
      openGapAfter = after;
      renderBuilder();
      return;
    }

    if (type === 'guessing-rounds') {
      var rounds = S.buildGuessingRounds(ctx);
      if (!rounds) {
        alert('Guessing rounds cycle through answers — add a question step (like Open answer or Secret + clue) first.');
        return;
      }
      S.insertAfter(p, after, rounds.id, rounds.phase);
      afterInsert(rounds.id);
      return;
    }

    var phase = S.defaultPhaseFor(type, ctx);
    if (!phase) return;
    var id = S.freshId(p, BASE_IDS[type] || type);
    S.insertAfter(p, after, id, phase);
    afterInsert(id);
  }

  function insertAiFlavor(flavor, afterId) {
    var p = phases();
    if (!p) return;
    var pair = S.buildAiPair(flavor, { phases: p, afterId: afterId });
    if (!pair) return;
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
        renderBuilder();
      });
      foot.appendChild(close);
    }
    var all = el('button', 'builder-suggest-all', 'Browse all steps →');
    all.type = 'button';
    all.addEventListener('click', function () {
      if (typeof addPhaseBtn !== 'undefined' && addPhaseBtn) addPhaseBtn.click();
    });
    foot.appendChild(all);
    row.appendChild(foot);

    return row;
  }

  function tileClass(type) {
    if (type === 'guessing-rounds') return 'team';
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
      var go = function () {
        if (typeof gameId !== 'undefined' && gameId) {
          window.location.href = '/host?game=' + encodeURIComponent(gameId);
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
      card.appendChild(el('span', 'builder-step-num', String(num)));
      var body = el('div', 'builder-step-body');
      var label = TYPE_LABELS[phase.type] || phase.type;
      var text = primaryTextOf(phase);
      body.appendChild(el('p', null, text ? label + ': “' + text + '”' : label + '.'));
      var facts = [];
      if (phase.timer) facts.push('⏱ ' + phase.timer + 's');
      if (facts.length) body.appendChild(el('small', null, facts.join(' · ')));
      card.appendChild(body);

      // Reorder/delete tools — quiet until the card is hovered. All three
      // reuse existing machinery: moveStep is pointer surgery in the
      // suggestions module, deletePhase is the editor's own (re-links
      // next/approveNext/nextByWinner and refuses lobby/end).
      if (phase.type !== 'lobby' && phase.type !== 'end') {
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
      canvasEl.appendChild(card);

      // Gap after this step (not after the end step)
      var isLast = idx === order.length - 1;
      var isFrontierGap = id === frontier;
      if (phase.type === 'end') return;

      var gapOpen =
        openGapAfter === id ||
        aiFlavorGap === id ||
        (isFrontierGap && openGapAfter === null && !complete);

      if (gapOpen) {
        canvasEl.appendChild(suggestionRow(id, isFrontierGap && !complete));
      } else {
        var line = el('div', 'builder-plusline');
        var plus = el('button', 'builder-plus', '+');
        plus.type = 'button';
        plus.title = 'Add a step here';
        plus.addEventListener('click', function () {
          openGapAfter = id;
          aiFlavorGap = null;
          renderBuilder();
        });
        line.appendChild(plus);
        canvasEl.appendChild(line);
      }
      void isLast;
    });

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
    var group = el('div', 'form-group');
    group.appendChild(el('label', null, spec[1]));
    var box = document.createElement('textarea');
    box.rows = 3;
    box.value = phase[field] || '';
    var stepId = selectedId;
    box.addEventListener('input', function () {
      var live = phases();
      if (!live || !live[stepId]) return;
      live[stepId][field] = box.value;
      markDirty();
      var card = canvasEl.querySelector('.builder-step[data-id="' + stepId + '"] p');
      if (card) {
        var label = TYPE_LABELS[live[stepId].type] || live[stepId].type;
        var text = primaryTextOf(live[stepId]);
        card.textContent = text ? label + ': “' + text + '”' : label + '.';
      }
    });
    group.appendChild(box);
    railPrimary.appendChild(group);
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
      if (form) railBodyEl.appendChild(form);
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
    paletteEl.appendChild(el('h2', 'builder-palette-title', 'Steps'));
    paletteEl.appendChild(el('p', 'builder-palette-hint',
      'Click a block to add it to your activity.'));
    PALETTE_GROUPS.forEach(function (group) {
      var g = el('div', 'builder-pgroup');
      g.appendChild(el('h3', null, group.title));
      group.tiles.forEach(function (t) {
        var tile = el('button', 'builder-tile ' + group.cls);
        tile.type = 'button';
        tile.appendChild(el('span', 'builder-tile-title', t.title));
        tile.addEventListener('click', function () {
          insertStep(t.type, null);
        });
        g.appendChild(tile);
      });
      paletteEl.appendChild(g);
    });
    var more = el('button', 'builder-suggest-all builder-more', 'All step types →');
    more.type = 'button';
    more.title = 'The full picker — every step type, including the advanced ones';
    more.addEventListener('click', function () {
      if (typeof addPhaseBtn !== 'undefined' && addPhaseBtn) addPhaseBtn.click();
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
  var wantBuilder = false;
  try { wantBuilder = localStorage.getItem('lanyardEditorBuilder') === '1'; } catch (e) { /* ignore */ }
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
