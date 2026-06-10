// Simple view — the plain-English game editor (the "middle rung").
//
// Every step renders as a sentence with its editable text right there:
// "Students answer: [box]" — the things teachers actually change are
// inline boxes; structural changes go through "Ask AI" or the Advanced
// canvas. Most teachers should never need the phase graph.
//
// Loaded after editor.js (plain script, shared globals): it wraps
// renderCanvas() so every existing mutation path (typing, Ask AI apply,
// review fixes) keeps the simple view in sync for free, and wraps
// selectPhase() so review-panel links flip to Advanced before selecting.

(function () {
  'use strict';

  var simpleView = document.getElementById('simple-view');
  var simpleList = document.getElementById('simple-list');
  var simpleAddBtn = document.getElementById('simple-add-step');
  var canvasArea = document.getElementById('canvas-area');
  var viewSimpleBtn = document.getElementById('view-simple-btn');
  var viewAdvancedBtn = document.getElementById('view-advanced-btn');

  var currentView = 'simple';
  try {
    currentView = localStorage.getItem('lanyardEditorView') || 'simple';
  } catch (e) { /* storage unavailable */ }

  // --- View switching ---

  function setEditorView(mode) {
    currentView = mode === 'advanced' ? 'advanced' : 'simple';
    try { localStorage.setItem('lanyardEditorView', currentView); } catch (e) { /* ignore */ }

    viewSimpleBtn.classList.toggle('active', currentView === 'simple');
    viewAdvancedBtn.classList.toggle('active', currentView === 'advanced');

    // At script-load time the game config hasn't fetched yet — only touch
    // the render paths once it exists (the renderCanvas wrapper covers the
    // post-load render either way).
    var loaded = typeof gameConfig !== 'undefined' && gameConfig && gameConfig.phases;

    if (currentView === 'simple') {
      // Flush any open inline-form edit before leaving the canvas
      if (loaded && typeof deselectPhase === 'function') deselectPhase();
      canvasArea.style.display = 'none';
      simpleView.hidden = false;
      if (loaded) renderSimpleView();
    } else {
      simpleView.hidden = true;
      canvasArea.style.display = '';
      if (loaded && typeof renderCanvas === 'function') renderCanvas();
    }
  }

  viewSimpleBtn.addEventListener('click', function () { autoSaveIfDirty(); setEditorView('simple'); });
  viewAdvancedBtn.addEventListener('click', function () { autoSaveIfDirty(); setEditorView('advanced'); });
  simpleAddBtn.addEventListener('click', function () {
    // Reuse the existing phase-type picker; the renderCanvas wrapper
    // refreshes this view after the step is added.
    if (typeof addPhaseBtn !== 'undefined' && addPhaseBtn) addPhaseBtn.click();
  });

  // --- Keep in sync with everything editor.js does ---

  var _origRenderCanvas = renderCanvas;
  renderCanvas = function () {
    _origRenderCanvas.apply(this, arguments);
    if (currentView === 'simple') renderSimpleView();
  };

  var _origSelectPhase = selectPhase;
  selectPhase = function (phaseId) {
    // Deep links (review panel, validation) need the canvas
    if (currentView === 'simple') setEditorView('advanced');
    _origSelectPhase.apply(this, arguments);
  };

  // --- Tiny DOM helpers ---

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function markEdited() {
    isDirty = true;
  }

  // Auto-growing textarea bound to a config field
  function textBox(value, placeholder, onInput) {
    var ta = document.createElement('textarea');
    ta.className = 'sv-text';
    ta.value = value || '';
    ta.placeholder = placeholder || '';
    ta.rows = 1;
    function grow() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight + 2, 220) + 'px';
    }
    ta.addEventListener('input', function () {
      markEdited();
      onInput(ta.value);
      grow();
    });
    ta.addEventListener('blur', function () { autoSaveIfDirty(); });
    setTimeout(grow, 0);
    return ta;
  }

  // "⏱ [60]s" inline timer — empty means no limit
  function timerFact(phase) {
    var wrap = el('span', 'sv-fact');
    wrap.appendChild(document.createTextNode('⏱ '));
    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'sv-timer';
    input.min = '1';
    input.max = '3600';
    input.placeholder = '—';
    if (phase.timer) input.value = phase.timer;
    input.addEventListener('input', function () {
      markEdited();
      var v = parseInt(input.value, 10);
      if (v > 0) { phase.timer = v; } else { delete phase.timer; }
    });
    input.addEventListener('blur', function () { autoSaveIfDirty(); });
    // Scroll-wheel over a focused number input silently changes it (and
    // then auto-saves) — a classic accidental-edit trap. Opt out.
    input.addEventListener('wheel', function () { input.blur(); }, { passive: true });
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode('s'));
    return wrap;
  }

  function fact(text) {
    return el('span', 'sv-fact', text);
  }

  // Reference another step by its number — many steps share a friendly
  // name (Closer has nine "Ask Players"), so "step 4" is the only
  // unambiguous way to point at one.
  function stepName(phaseId) {
    var order = buildPhaseOrder();
    var idx = order.indexOf(phaseId);
    if (idx !== -1) return 'step ' + (idx + 1);
    var p = gameConfig.phases[phaseId];
    var cat = PHASE_CATALOG[p && p.type];
    return cat ? cat.friendlyName : (p ? p.type : phaseId);
  }

  // Is `sourceId` the step immediately before `phaseId`? (If so, "from
  // step N" is just noise — the reader already assumes it.)
  function isPreviousStep(sourceId, phaseId) {
    var order = buildPhaseOrder();
    return order.indexOf(sourceId) === order.indexOf(phaseId) - 1;
  }

  // Editable list of strings (multiple-choice answers, rank items)
  function stringListEditor(getArr, setArr, itemLabel) {
    var wrap = el('div', 'sv-list');
    function render() {
      wrap.innerHTML = '';
      var arr = getArr();
      for (var i = 0; i < arr.length; i++) {
        (function (index) {
          var row = el('div', 'sv-list-row');
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'sv-list-input';
          input.value = arr[index];
          input.placeholder = itemLabel + ' ' + (index + 1);
          input.addEventListener('input', function () {
            markEdited();
            getArr()[index] = input.value;
          });
          input.addEventListener('blur', function () { autoSaveIfDirty(); });
          var rm = el('button', 'sv-list-remove', '✕');
          rm.type = 'button';
          rm.title = 'Remove';
          rm.addEventListener('click', function () {
            markEdited();
            getArr().splice(index, 1);
            render();
          });
          row.appendChild(input);
          row.appendChild(rm);
          wrap.appendChild(row);
        })(i);
      }
      var add = el('button', 'sv-list-add', '+ Add ' + itemLabel.toLowerCase());
      add.type = 'button';
      add.addEventListener('click', function () {
        markEdited();
        var arr2 = getArr();
        if (!Array.isArray(arr2)) { setArr([]); arr2 = getArr(); }
        arr2.push('');
        render();
      });
      wrap.appendChild(add);
    }
    render();
    return wrap;
  }

  // --- Per-type sentence builders ---
  // Each returns { sentence, field?, facts: [], extra? } — field is the
  // inline-editable primary text, facts are short trailing notes.

  function describeStep(phaseId, phase) {
    var type = phase.type;
    var d = { sentence: '', field: null, facts: [], extra: null, muted: false };

    switch (type) {
      case 'lobby':
        d.sentence = 'Players join the room.';
        d.muted = true;
        break;

      case 'collect': {
        d.sentence = phase.assign === 'pairwise' ? 'Students answer (in pairs):' : 'Students answer:';
        d.field = textBox(phase.prompt, 'The question students see…', function (v) { phase.prompt = v; });
        if (phase.reusePairsFrom) d.facts.push(fact('same partners as ' + stepName(phase.reusePairsFrom)));
        else if (phase.rotatePairsFrom) d.facts.push(fact('new partners since ' + stepName(phase.rotatePairsFrom)));
        else if (phase.assign === 'pairwise') d.facts.push(fact('random pairs'));
        if (phase.assign === 'pairwise' && phase.oddHandling === 'triple') d.facts.push(fact('odd class → group of 3'));
        if (phase.passAllowed) d.facts.push(fact('passing allowed'));
        if (phase.simultaneousReveal) d.facts.push(fact('answers hidden until everyone is done'));
        if (Array.isArray(phase.fields) && phase.fields.length) {
          d.facts.push(fact(phase.fields.length + ' answer boxes: ' + phase.fields.map(function (f) { return f.label; }).join(', ')));
        }
        d.facts.push(timerFact(phase));
        break;
      }

      case 'collect-choice': {
        d.sentence = 'Students pick one:';
        d.field = textBox(phase.prompt, 'The question students see…', function (v) { phase.prompt = v; });
        if (Array.isArray(phase.choices)) {
          d.extra = stringListEditor(
            function () { return phase.choices; },
            function (a) { phase.choices = a; },
            'Choice'
          );
        } else if (typeof phase.choices === 'string') {
          d.facts.push(fact('choices come from ' + humanizeRef(phase.choices)));
        } else if (phase.choicePool) {
          d.facts.push(fact('choices are built from earlier answers'));
        }
        if (phase.correctAnswer) d.facts.push(fact('graded — correct answer earns points'));
        d.facts.push(timerFact(phase));
        break;
      }

      case 'announce':
        d.sentence = 'Everyone sees the message:';
        d.field = textBox(phase.message, 'What the class sees…', function (v) { phase.message = v; });
        d.facts.push(timerFact(phase));
        break;

      case 'reveal':
        if (phase.scope === 'pair') {
          // The pair-reveal template is layout boilerplate ({{_pair.*}}
          // tokens) — structural, so it lives in Advanced, not here.
          var fromNote = phase.pairsFrom && !isPreviousStep(phase.pairsFrom, phaseId)
            ? ' (from ' + stepName(phase.pairsFrom) + ')'
            : '';
          d.sentence = 'Each pair privately sees its own answers' + fromNote + '.';
          d.muted = true;
        } else {
          d.sentence = 'The class sees:';
          d.field = textBox(phase.template, 'What to show — insert data in Advanced…', function (v) { phase.template = v; });
        }
        break;

      case 'ai-process': {
        var verbs = { summarize: 'summarizes', generate: 'creates something from', 'generate-choices': 'writes quiz choices from', compare: 'groups', rank: 'ranks', judge: 'judges' };
        d.sentence = 'The AI ' + (verbs[phase.task] || 'processes') + ' ' +
          (phase.input ? humanizeRef(phase.input).toLowerCase() : 'the answers') + ':';
        d.field = textBox(phase.instruction, 'Tell the AI what to do…', function (v) { phase.instruction = v; });
        if (phase.perPlayer) d.facts.push(fact('one result per student'));
        break;
      }

      case 'vote':
        d.sentence = (phase.mode === 'head-to-head' ? 'Students vote head-to-head on ' : 'Students vote for their favorite from ') +
          (phase.matchupsFromPairs ? 'the paired answers' : (phase.candidates ? humanizeRef(String(phase.candidates)).toLowerCase() : '…')) + '.';
        if (phase.voters === 'eliminated') d.facts.push(fact('only knocked-out players vote'));
        else if (phase.voters === 'remaining') d.facts.push(fact('only remaining players vote'));
        d.facts.push(timerFact(phase));
        break;

      case 'rank':
        d.sentence = 'Students rank:';
        d.field = textBox(phase.prompt, 'What to rank…', function (v) { phase.prompt = v; });
        if (Array.isArray(phase.candidates)) {
          d.extra = stringListEditor(
            function () { return phase.candidates; },
            function (a) { phase.candidates = a; },
            'Item'
          );
        } else if (phase.candidates) {
          d.facts.push(fact('items come from ' + humanizeRef(String(phase.candidates))));
        }
        d.facts.push(timerFact(phase));
        break;

      case 'rate':
        d.sentence = 'Students rate on ' +
          (Array.isArray(phase.scales) ? phase.scales.map(function (s) { return s.label; }).join(', ') : 'scales') + ':';
        d.field = textBox(phase.prompt, 'What they\'re rating…', function (v) { phase.prompt = v; });
        d.facts.push(timerFact(phase));
        break;

      case 'wager':
        d.sentence = 'Students bet points on:';
        d.field = textBox(phase.prompt, 'The question they bet on…', function (v) { phase.prompt = v; });
        if (Array.isArray(phase.options)) {
          d.extra = stringListEditor(
            function () { return phase.options; },
            function (a) { phase.options = a; },
            'Option'
          );
        }
        d.facts.push(timerFact(phase));
        break;

      case 'relay':
        d.sentence = 'Students take turns adding to:';
        d.field = textBox(phase.prompt, 'What they\'re building together…', function (v) { phase.prompt = v; });
        d.facts.push(timerFact(phase));
        break;

      case 'merge':
        d.sentence = (phase.groupSize === 4 ? 'Groups of four' : 'Pairs') + ' combine their answers into one:';
        d.field = textBox(phase.instruction, 'Combine your answers into one stronger answer.', function (v) { phase.instruction = v; });
        if (phase.seedFrom) d.facts.push(fact('starting from ' + humanizeRef(phase.seedFrom)));
        d.facts.push(timerFact(phase));
        break;

      case 'one-voice':
        d.sentence = 'The class counts to ' + (phase.target || 20) +
          ' together — two voices at once and it starts over.';
        d.muted = true;
        break;

      case 'foreach': {
        d.sentence = 'For each item from ' + (phase.data ? humanizeRef(phase.data).toLowerCase() : '…') + ', the class:';
        var subWrap = el('div', 'sv-subs');
        var subNames = phase.subPhases ? Object.keys(phase.subPhases) : [];
        for (var si = 0; si < subNames.length; si++) {
          (function (sub) {
            var row = el('div', 'sv-sub');
            var key = sub.type === 'announce' ? 'message' : 'prompt';
            var lead = sub.type === 'announce' ? 'sees:'
              : sub.type === 'collect-choice' ? 'picks one:'
              : 'writes:';
            row.appendChild(el('span', 'sv-sub-lead', '· ' + lead));
            row.appendChild(textBox(sub[key], '…', function (v) { sub[key] = v; }));
            subWrap.appendChild(row);
          })(phase.subPhases[subNames[si]]);
        }
        d.extra = subWrap;
        if (phase.scoring) d.facts.push(fact(phase.scoring.mode === 'tally' ? 'authors earn points from ratings' : 'correct guesses earn points'));
        break;
      }

      case 'eliminate':
        d.sentence = phase.method === 'hook'
          ? 'A custom rule decides who gets knocked out.'
          : 'The bottom ' + (phase.percent || '…') + '% are knocked out.';
        d.muted = true;
        break;

      case 'ai-eliminate':
        d.sentence = 'The AI judges the answers and eliminates rule-breakers:';
        d.field = textBox(phase.instruction, 'The rule the AI enforces…', function (v) { phase.instruction = v; });
        break;

      case 'team-split':
        d.sentence = 'The class splits into ' + (phase.teamCount || 2) + ' teams.';
        d.muted = true;
        break;

      case 'turn': {
        var poolNote = 'the collected items';
        if (typeof phase.pool === 'string') poolNote = humanizeRef(phase.pool).toLowerCase();
        else if (Array.isArray(phase.pool)) poolNote = 'items from ' + phase.pool.length + ' earlier steps';
        d.sentence = 'Teams take turns (describe / act it out) using ' + poolNote + ':';
        if (phase.instruction !== undefined) {
          d.field = textBox(phase.instruction, 'The rule for this round, e.g. "Describe it without saying it!"', function (v) { phase.instruction = v; });
        } else {
          d.sentence = d.sentence.replace(/:$/, '.');
          d.muted = true;
        }
        break;
      }

      case 'reveal-one':
        d.sentence = 'Items are revealed one at a time' +
          (phase.from ? ' from ' + humanizeRef(String(phase.from)).toLowerCase() : '') + '.';
        d.muted = true;
        break;

      case 'preview':
        d.sentence = 'You review the content privately before the class sees it.';
        d.muted = true;
        break;

      case 'leaderboard':
        d.sentence = 'The leaderboard is shown.';
        d.muted = true;
        break;

      case 'winner':
        d.sentence = 'The winner is crowned.';
        d.muted = true;
        break;

      case 'end':
        d.sentence = 'The game ends with:';
        d.field = textBox(phase.message, 'Closing message…', function (v) { phase.message = v; });
        break;

      default: {
        var cat = PHASE_CATALOG[type];
        d.sentence = (cat && cat.description) || type;
        d.muted = true;
      }
    }

    // Loops apply to any step
    if (phase.loopBack && phase.loopCount) {
      d.facts.push(fact('then repeats from ' + stepName(phase.loopBack) + ' ×' + phase.loopCount));
    }

    return d;
  }

  // --- Render ---

  function renderSimpleView() {
    if (!gameConfig || !gameConfig.phases) return;
    simpleList.innerHTML = '';

    var order = buildPhaseOrder();
    var stepNum = 0;
    for (var i = 0; i < order.length; i++) {
      var phaseId = order[i];
      var phase = gameConfig.phases[phaseId];
      if (!phase) continue;
      var cat = PHASE_CATALOG[phase.type] || {};
      var d = describeStep(phaseId, phase);

      stepNum++;
      var card = el('div', 'sv-card' + (d.muted ? ' sv-muted' : ''));
      card.setAttribute('data-phase-id', phaseId);

      var num = el('div', 'sv-num', String(stepNum));
      num.style.background = cat.bg || '#eee';
      card.appendChild(num);

      var body = el('div', 'sv-body');

      var sentenceRow = el('div', 'sv-sentence', d.sentence);
      body.appendChild(sentenceRow);
      if (d.field) body.appendChild(d.field);
      if (d.extra) body.appendChild(d.extra);

      if (d.facts.length) {
        var factsRow = el('div', 'sv-facts');
        for (var f = 0; f < d.facts.length; f++) {
          if (f > 0) factsRow.appendChild(el('span', 'sv-fact-sep', '·'));
          factsRow.appendChild(d.facts[f]);
        }
        body.appendChild(factsRow);
      }

      // Actions: AI for structural change, Advanced for everything else
      var actions = el('div', 'sv-actions');
      var askBtn = el('button', 'sv-action', '✨ Ask AI to change this step');
      askBtn.type = 'button';
      askBtn.setAttribute('data-phase-id', phaseId);
      askBtn.addEventListener('click', function () {
        openAskAiModal(this.getAttribute('data-phase-id'));
      });
      actions.appendChild(askBtn);

      var advBtn = el('button', 'sv-action sv-action-quiet', 'Advanced settings →');
      advBtn.type = 'button';
      advBtn.setAttribute('data-phase-id', phaseId);
      advBtn.addEventListener('click', function (e) {
        // Don't let this click reach the canvas' outside-click-collapse
        // handler — it would instantly deselect the step we just opened.
        e.stopPropagation();
        var pid = this.getAttribute('data-phase-id');
        setEditorView('advanced');
        _origSelectPhase(pid);
        // Bring the expanded step into view — the canvas otherwise opens
        // scrolled to the top and the teacher has to hunt for it.
        var box = document.querySelector('.phase-box[data-phase-id="' + pid + '"]');
        if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      actions.appendChild(advBtn);

      body.appendChild(actions);
      card.appendChild(body);
      simpleList.appendChild(card);
    }
  }

  // --- Init: apply the saved (or default) view once the game has loaded.
  // editor.js calls renderCanvas() after load; our wrapper handles the
  // simple render. We just need the containers in the right state now.
  setEditorView(currentView);
})();
