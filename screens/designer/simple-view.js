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
    // Deep links (review panel, validation) need a surface that can show
    // one step's settings — the Builder now; the technical canvas only as
    // fallback if the Builder failed to load.
    if (currentView === 'simple') {
      if (window.__enterBuilder) {
        window.__enterBuilder(phaseId);
        return;
      }
      setEditorView('advanced');
    }
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

  // Auto-growing textarea bound to a config field. When the value contains
  // {{tokens}}, delegates to the token-aware box so teachers see friendly
  // chips ("list of answers from step 5") instead of code.
  function textBox(value, placeholder, onInput) {
    if (TOKEN_RE.test(value || '')) {
      TOKEN_RE.lastIndex = 0;
      return tokenTextBox(value, onInput);
    }
    TOKEN_RE.lastIndex = 0;
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

  // --- Token-aware text box ---
  // Teachers shouldn't see {{ai-mashup.list}} — that's code. The box renders
  // as editable text segments with each token shown as a friendly chip.
  // The config value stays byte-exact: segments + tokens rejoin losslessly,
  // so nothing can be corrupted by the friendlier display.

  var TOKEN_RE = /\{\{\s*[^}]+?\s*\}\}/g;

  // Suffix words beyond editor.js' PRIMARY_TOKEN_SUFFIXES
  var SV_EXTRA_SUFFIXES = {
    winner:        'the winning answer',
    responses:     'the answers',
    merged:        'the combined answers',
    rankedList:    'the ranked list',
    correctAnswer: 'the correct answer',
    itemCount:     'how many items',
    attempts:      'attempt count',
    bestRun:       'best run',
    resets:        'times reset',
    target:        'the target number',
    playerName:    "the player's name"
  };

  function svSuffixWords(suffix) {
    var meta = typeof PRIMARY_TOKEN_SUFFIXES !== 'undefined' && PRIMARY_TOKEN_SUFFIXES[suffix];
    if (meta) return meta.text;
    return SV_EXTRA_SUFFIXES[suffix] || null;
  }

  function svOrdinal(n) {
    var i = parseInt(n, 10) + 1; // refs are 0-based
    var tail = i % 10 === 1 && i % 100 !== 11 ? 'st'
      : i % 10 === 2 && i % 100 !== 12 ? 'nd'
      : i % 10 === 3 && i % 100 !== 13 ? 'rd' : 'th';
    return i + tail;
  }

  // "{{ai-mashup.list}}" -> "list of answers from step 5"
  function svTokenLabel(token) {
    var ref = token.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '');
    var parts = ref.split('.');
    var head = parts[0];
    var tail = parts[parts.length - 1];

    // Special scopes resolved at play time, not step refs
    if (head === '_pair') {
      var pairTails = { prompt: 'question', answers: 'answers' };
      return "this pair's " + (pairTails[parts[1]] || parts.slice(1).join(' '));
    }
    if (head === '_current') {
      if (parts.length === 1) return "this round's item";
      var cur = parts.slice(1);
      if (cur[0] === 'fields') cur = cur.slice(1); // fields.question -> question
      if (cur[0] === 'a' || cur[0] === 'b') {
        return 'answer ' + cur[0].toUpperCase() + ' this round';
      }
      var curTails = { text: 'answer', playerName: 'player', choice: 'choice' };
      return "this round's " + (curTails[cur[0]] || cur.join(' '));
    }
    if (head === '_foreach') return tail === 'total' ? 'total rounds' : 'round number';
    if (head === '_loop') return tail === 'total' ? 'total rounds' : 'round number';
    if (head === '_candidates') return 'the choices';
    if (head === 'remaining') return 'how many players remain';

    var from = (gameConfig.phases && gameConfig.phases[head]) ? ' from ' + stepName(head) : '';

    // Multi-part paths with friendly composites
    var rest = parts.slice(1);
    if (rest.length >= 2) {
      if (rest[0] === 'responses' && rest[1] === 'list') return 'list of answers' + from;
      if (rest[0] === 'responses' && rest[1] === 'length') return 'how many answered' + from;
      if (rest[0] === 'merged' && rest[1] === 'list') return 'list of combined answers' + from;
      if (rest[0] === 'eliminated' && rest[1] === 'length') return 'how many were knocked out' + from;
      if (rest[0] === 'rankings' && rest[2] === 'item') return 'the ' + svOrdinal(rest[1]) + '-ranked item' + from;
      if (rest[0] === 'result') {
        // result.category -> "the AI's category"; result.0.scenario -> "the AI's 1st scenario"
        var path = rest.slice(1);
        if (/^\d+$/.test(path[0])) {
          return "the AI's " + svOrdinal(path[0]) + ' ' + (path.slice(1).join(' ') || 'item') + from;
        }
        return "the AI's " + path.join(' ') + from;
      }
    }

    var words = tail !== head ? svSuffixWords(tail) : null;
    if (words) return words + from;
    if (parts.length > 1) return rest.join(' ') + from;
    return 'data' + from;
  }

  function tokenTextBox(value, onInput) {
    // Parse into alternating segments and tokens: seg0 tok0 seg1 tok1 ... segN
    var segments = [];
    var tokens = [];
    var last = 0;
    var m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(value)) !== null) {
      segments.push(value.slice(last, m.index));
      tokens.push(m[0]);
      last = m.index + m[0].length;
    }
    segments.push(value.slice(last));

    var box = el('div', 'sv-text sv-token-box');

    function rebuild() {
      var out = segments[0];
      for (var i = 0; i < tokens.length; i++) out += tokens[i] + segments[i + 1];
      markEdited();
      onInput(out);
    }

    function render() {
      box.innerHTML = '';
      for (var i = 0; i < segments.length; i++) {
        (function (index) {
          var ta = document.createElement('textarea');
          ta.className = 'sv-seg';
          ta.value = segments[index];
          ta.rows = 1;
          function grow() {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight + 2, 220) + 'px';
          }
          ta.addEventListener('input', function () {
            segments[index] = ta.value;
            rebuild();
            grow();
          });
          ta.addEventListener('blur', function () { autoSaveIfDirty(); });
          setTimeout(grow, 0);
          box.appendChild(ta);
        })(i);

        if (i < tokens.length) {
          (function (index) {
            var row = el('div', 'sv-chip-row');
            var chip = el('span', 'sv-chip');
            chip.appendChild(el('span', null, '📦 ' + svTokenLabel(tokens[index])));
            chip.title = tokens[index]; // hover shows the underlying token
            var del = el('button', 'sv-chip-delete', '×');
            del.type = 'button';
            del.setAttribute('aria-label', 'Remove');
            del.addEventListener('click', function () {
              // Merge the segments around the removed token
              segments.splice(index, 2, segments[index] + segments[index + 1]);
              tokens.splice(index, 1);
              rebuild();
              autoSaveIfDirty();
              render();
            });
            chip.appendChild(del);
            row.appendChild(chip);
            box.appendChild(row);
          })(i);
        }
      }
    }
    render();
    return box;
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
    input.placeholder = '. ';
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

  // "reads [8] of them at random" — empty means every answer gets a round
  function limitFact(phase) {
    var wrap = el('span', 'sv-fact');
    wrap.appendChild(document.createTextNode('reads '));
    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'sv-timer';
    input.min = '1';
    input.max = '100';
    input.placeholder = 'all';
    if (phase.limit) input.value = phase.limit;
    input.addEventListener('input', function () {
      markEdited();
      var v = parseInt(input.value, 10);
      if (v > 0) { phase.limit = Math.min(v, 100); } else { delete phase.limit; }
    });
    input.addEventListener('blur', function () { autoSaveIfDirty(); });
    input.addEventListener('wheel', function () { input.blur(); }, { passive: true });
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(' of them at random, blank reads all'));
    return wrap;
  }

  // Reference another step by its number — many steps share a friendly
  // name (Closer has nine "Open answer" steps), so "step 4" is the only
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

  // Editable list of {left, right} pairs (match phase)
  function pairListEditor(getArr, setArr) {
    var wrap = el('div', 'sv-list');
    function render() {
      wrap.innerHTML = '';
      var arr = getArr();
      for (var i = 0; i < arr.length; i++) {
        (function (index) {
          var pair = arr[index];
          if (!pair || typeof pair !== 'object') { pair = {}; getArr()[index] = pair; }
          var row = el('div', 'sv-list-row');

          var leftInput = document.createElement('input');
          leftInput.type = 'text';
          leftInput.className = 'sv-list-input';
          leftInput.value = pair.left || '';
          leftInput.placeholder = 'Left ' + (index + 1);
          leftInput.addEventListener('input', function () {
            markEdited();
            getArr()[index].left = leftInput.value;
          });
          leftInput.addEventListener('blur', function () { autoSaveIfDirty(); });

          var arrow = el('span', 'sv-sub-lead', '↔');

          var rightInput = document.createElement('input');
          rightInput.type = 'text';
          rightInput.className = 'sv-list-input';
          rightInput.value = pair.right || '';
          rightInput.placeholder = 'Right ' + (index + 1);
          rightInput.addEventListener('input', function () {
            markEdited();
            getArr()[index].right = rightInput.value;
          });
          rightInput.addEventListener('blur', function () { autoSaveIfDirty(); });

          var rm = el('button', 'sv-list-remove', '✕');
          rm.type = 'button';
          rm.title = 'Remove';
          rm.addEventListener('click', function () {
            markEdited();
            getArr().splice(index, 1);
            render();
          });
          row.appendChild(leftInput);
          row.appendChild(arrow);
          row.appendChild(rightInput);
          row.appendChild(rm);
          wrap.appendChild(row);
        })(i);
      }
      var add = el('button', 'sv-list-add', '+ Add pair');
      add.type = 'button';
      add.addEventListener('click', function () {
        markEdited();
        var arr2 = getArr();
        if (!Array.isArray(arr2)) { setArr([]); arr2 = getArr(); }
        arr2.push({ left: '', right: '' });
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
        var isDrawing = phase.inputType === 'drawing';
        d.sentence = isDrawing
          ? (phase.rotateFrom ? 'Students draw (continuing ' + stepName(phase.rotateFrom) + '\'s drawing):' : 'Students draw:')
          : (phase.assign === 'pairwise' ? 'Students answer (in pairs):' : 'Students answer:');
        d.field = textBox(phase.prompt, isDrawing ? 'What students should draw…' : 'The question students see…', function (v) { phase.prompt = v; });
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
        if (phase.correctAnswer) d.facts.push(fact('graded, correct answer earns points'));
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
          d.field = textBox(phase.template, 'What to show, open All settings to insert answers from earlier steps…', function (v) { phase.template = v; });
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
        if (Array.isArray(phase.candidates)) {
          // Literal (teacher-typed) option list — possibly a branching vote
          d.sentence = 'Students vote for one of:';
          d.extra = stringListEditor(
            function () { return phase.candidates; },
            function (a) { phase.candidates = a; },
            'Option'
          );
          if (phase.nextByWinner && typeof phase.nextByWinner === 'object') {
            for (var bk in phase.nextByWinner) {
              d.facts.push(fact("'" + bk + "' wins → " + stepName(phase.nextByWinner[bk])));
            }
          }
        } else {
          d.sentence = (phase.mode === 'head-to-head' ? 'Students vote head-to-head on ' : 'Students vote for their favorite from ') +
            (phase.matchupsFromPairs ? 'the paired answers' : (phase.candidates ? humanizeRef(String(phase.candidates)).toLowerCase() : '…')) + '.';
        }
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
          ' together, two voices at once and it starts over.';
        d.muted = true;
        break;

      case 'buzz':
        d.sentence = 'Buzzer round, you ask questions out loud, first to buzz answers:';
        d.field = textBox(phase.prompt, 'On-screen prompt, e.g. "Listen for the question, then BUZZ!"', function (v) { phase.prompt = v; });
        d.facts.push(fact((phase.points || 10) + ' pts per correct answer'));
        if (phase.lockoutOnWrong !== false) d.facts.push(fact('wrong answers locked out for the question'));
        break;

      case 'sort': {
        var bucketNames = Array.isArray(phase.buckets) ? phase.buckets.filter(Boolean).join(' / ') : '…';
        d.sentence = 'Students sort each item into ' + bucketNames + ':';
        d.field = textBox(phase.prompt, 'e.g. Is each line a metaphor or a simile?…', function (v) { phase.prompt = v; });
        var sortGraded = Array.isArray(phase.items) && phase.items.length > 0 &&
          phase.items.every(function (it) { return it && it.bucket; });
        d.facts.push(fact((Array.isArray(phase.items) ? phase.items.length : 0) + ' items'));
        d.facts.push(fact(sortGraded ? (phase.pointsPerItem || 10) + ' pts per correct placement' : 'consensus poll, no right answers'));
        d.facts.push(timerFact(phase));
        break;
      }

      case 'checklist': {
        d.sentence = 'Every ' + (phase.teamsFrom ? 'group' : 'student') + ' works through the to-do list:';
        d.field = textBox(phase.prompt, 'e.g. Finish these five things with your lab group…', function (v) { phase.prompt = v; });
        d.extra = stringListEditor(
          function () { if (!Array.isArray(phase.items)) phase.items = []; return phase.items; },
          function (a) { phase.items = a; },
          'task'
        );
        d.facts.push(fact(phase.teamsFrom ? 'shared per group, live dashboard on the projector' : 'one list per student'));
        d.facts.push(timerFact(phase));
        break;
      }

      case 'match':
        d.sentence = 'Students match the pairs:';
        d.field = textBox(phase.prompt, 'e.g. Match each word to its definition…', function (v) { phase.prompt = v; });
        d.extra = pairListEditor(
          function () { if (!Array.isArray(phase.pairs)) phase.pairs = []; return phase.pairs; },
          function (a) { phase.pairs = a; }
        );
        d.facts.push(fact((phase.pointsPerMatch || 10) + ' pts per correct match'));
        d.facts.push(timerFact(phase));
        break;

      case 'estimate':
        d.sentence = 'Students guess a number:';
        d.field = textBox(phase.prompt, 'A question with a numeric answer…', function (v) { phase.prompt = v; });
        if (phase.answer != null) {
          d.facts.push(fact('answer: ' + phase.answer + (phase.unit ? ' ' + phase.unit : '')));
          d.facts.push(fact(phase.scoring === 'graduated' ? 'points by closeness rank' : 'closest guess earns ' + (phase.points || 10) + ' pts'));
        } else {
          d.facts.push(fact('no answer set, shows the class distribution only'));
        }
        d.facts.push(timerFact(phase));
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
        d.facts.push(limitFact(phase));
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

      case 'team-split': {
        var sizing = phase.groupSize != null ? 'groups of ' + phase.groupSize : (phase.teamCount || 2) + ' teams';
        var how = phase.method === 'teacher' ? 'you arrange them on the screen'
          : phase.method === 'choice' ? (phase.capacity === 'open' ? 'students join their own team (no size caps)' : 'students pick their own spots')
          : phase.method === 'balanced' ? 'balanced by score'
          : 'at random';
        d.sentence = 'The class splits into ' + sizing + '. ' + how + '.';
        d.muted = true;
        break;
      }

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
        d.facts.push(limitFact(phase));
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
        d.sentence = 'It ends with:';
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

      var advBtn = el('button', 'sv-action sv-action-quiet', 'All settings →');
      advBtn.type = 'button';
      advBtn.setAttribute('data-phase-id', phaseId);
      advBtn.addEventListener('click', function (e) {
        // Don't let this click reach the canvas' outside-click-collapse
        // handler — it would instantly deselect the step we just opened.
        e.stopPropagation();
        var pid = this.getAttribute('data-phase-id');
        // The Builder shows a step's settings in a rail beside the
        // activity — the technical canvas would strand the teacher on a
        // surface the pill no longer names. Fall back only if the Builder
        // failed to load.
        if (window.__enterBuilder) {
          window.__enterBuilder(pid);
          return;
        }
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
