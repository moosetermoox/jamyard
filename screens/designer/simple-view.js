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

  // One-editor pass (Totem 9d): the stack column + the detail card.
  var svStack = document.getElementById('sv-stack');
  var svDetail = document.getElementById('sv-detail');
  var svSelectedId = null;   // which block is picked up
  var svSettingsOpen = false; // "All settings" expander state
  var svFormPhaseId = null;  // which step #phase-config-form is filled for
  var svRendering = false;   // re-entrancy guard (see renderCanvas wrapper)
  var svOpenSub = null;      // 'phaseId:subName' — the one expanded round screen
  // Parked (owner's call 2026-08-20): the raw-field expander is hidden —
  // small things live on the card, everything else goes through the AI
  // chat. Flip to true to bring "All settings" back.
  var SV_ALL_SETTINGS_ENABLED = false;

  var currentView = 'simple';
  try {
    currentView = localStorage.getItem('lanyardEditorView') || 'simple';
  } catch (e) { /* storage unavailable */ }
  // Technical view is retired from the header menu (2026-08-15): a stored
  // 'advanced' would land the teacher on a surface nothing names anymore.
  // Normalize to simple; the Builder's own restore flag still wins after
  // load, and programmatic setEditorView('advanced') keeps working.
  if (currentView === 'advanced') currentView = 'simple';

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
    // svRendering: renderSimpleView itself calls _origSelectPhase (which
    // calls renderCanvas) while adopting the step form — don't re-enter.
    // An outside render (Apply proposal, review fix) invalidates the
    // adopted form so it re-fills with the fresh config.
    if (currentView === 'simple' && !svRendering) {
      svFormPhaseId = null;
      renderSimpleView();
    }
  };

  var _origSelectPhase = selectPhase;
  selectPhase = function (phaseId) {
    // Deep links (review panel, validation) land on the stack itself now:
    // select the block and show its detail card (one-editor pass). The
    // technical canvas stays the fallback for the programmatic paths.
    if (currentView === 'simple') {
      svSelectedId = phaseId;
      renderSimpleView();
      var blk = svStack && svStack.querySelector('.svb-block[data-phase-id="' + phaseId + '"]');
      if (blk) blk.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
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
    // Bold shows as bold (shared/bold-box.js); the config keeps **word**.
    if (window.BoldBox) {
      var bb = BoldBox.create({ className: 'sv-text', value: value || '', placeholder: placeholder || '' });
      bb.addEventListener('input', function () {
        markEdited();
        onInput(bb.value);
      });
      bb.addEventListener('focusout', function () { autoSaveIfDirty(); });
      return bb;
    }
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

    // no-mic: one mic badge per text segment turned a chip-bearing prompt
    // into a wall of controls; the plain text boxes keep their mics.
    var box = el('div', 'sv-text sv-token-box no-mic');

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
          if (window.BoldBox) {
            var bb = BoldBox.create({ className: 'sv-seg', value: segments[index] });
            bb.addEventListener('input', function () {
              segments[index] = bb.value;
              rebuild();
            });
            bb.addEventListener('focusout', function () { autoSaveIfDirty(); });
            box.appendChild(bb);
            return;
          }
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

  // A fact built from arbitrary-length content (field labels, item lists)
  // must be allowed to wrap — nowrap facts fly out of the card and drag a
  // horizontal scrollbar across the whole page (Rose, Bud, Thorn 2026-08-31).
  function wrapFact(text) {
    return el('span', 'sv-fact sv-fact-wrap', text);
  }

  // One-line gist of a round screen's text for the folded summary row:
  // tokens become their friendly labels, whitespace collapses, CSS
  // ellipsizes the rest.
  function subPreviewText(value) {
    var text = String(value || '');
    TOKEN_RE.lastIndex = 0;
    text = text.replace(TOKEN_RE, function (tok) { return '⟨' + svTokenLabel(tok) + '⟩'; });
    text = text.replace(/\*\*/g, ''); // bold markers read as bold, not as stars
    text = text.replace(/\s+/g, ' ').trim();
    return text === '' ? '(empty)' : text;
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
  // Optional `marker`: { get(), set(value|null), title } renders a ✓ toggle
  // per row (quiz correct answers). Marking stores the row's TEXT; editing
  // a marked row keeps the stored value in sync, removing it clears the
  // mark. Tapping the marked row's ✓ again unmarks (back to a poll).
  function stringListEditor(getArr, setArr, itemLabel, marker) {
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
            var wasMarked = marker && marker.get() === getArr()[index];
            getArr()[index] = input.value;
            if (wasMarked) marker.set(input.value);
          });
          input.addEventListener('blur', function () { autoSaveIfDirty(); });
          if (marker) {
            var isMarked = marker.get() === arr[index] && arr[index] !== '';
            var mk = el('button', 'sv-list-mark' + (isMarked ? ' is-marked' : ''), isMarked ? '✓' : '○');
            mk.type = 'button';
            mk.title = isMarked ? (marker.title || 'This is the correct answer') + ' (tap to unmark)'
                                : 'Mark as the correct answer';
            mk.setAttribute('aria-pressed', isMarked ? 'true' : 'false');
            mk.addEventListener('click', function () {
              markEdited();
              marker.set(isMarked ? null : getArr()[index]);
              render();
            });
            row.appendChild(mk);
          }
          var rm = el('button', 'sv-list-remove', '✕');
          rm.type = 'button';
          rm.title = 'Remove';
          rm.addEventListener('click', function () {
            markEdited();
            if (marker && marker.get() === getArr()[index]) marker.set(null);
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

  // --- Small labeled controls for step cards (selects + numbers) ---
  // A change re-renders the card so the sentence and facts keep telling
  // the truth about the new setting.

  function svSelect(options, value, onChange) {
    var sel = document.createElement('select');
    sel.className = 'sv-select';
    for (var i = 0; i < options.length; i++) {
      var opt = document.createElement('option');
      opt.value = options[i].value;
      opt.textContent = options[i].label;
      if (options[i].value === value) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', function () {
      markEdited();
      onChange(sel.value);
      autoSaveIfDirty();
      renderSimpleView();
    });
    return sel;
  }

  function svControlRow(labelText, control) {
    var row = el('div', 'sv-ctrl-row');
    row.appendChild(el('span', 'sv-ctrl-label', labelText));
    row.appendChild(control);
    return row;
  }

  // The Split into Teams card's knobs: sizing (groups of N, or exactly
  // N teams) and how the teams are made. Balanced stays visible only
  // when already set (it needs a score reference, structural, AI chat).
  function teamSplitControls(phase) {
    var box = el('div', 'sv-ctrls');

    var sizingWrap = el('span', 'sv-ctrl-pair');
    var sizeMode = (phase.teamCount != null && phase.groupSize == null) ? 'count' : 'size';
    var num = document.createElement('input');
    num.type = 'number';
    num.className = 'sv-timer sv-ctrl-num';
    num.min = 2;
    num.max = sizeMode === 'size' ? 12 : 20;
    num.value = sizeMode === 'size' ? (phase.groupSize || 3) : (phase.teamCount || 2);
    function writeSizing(mode) {
      var v = parseInt(num.value, 10);
      if (!v || v < 2) v = mode === 'size' ? 3 : 4;
      if (mode === 'size') { phase.groupSize = Math.min(v, 12); delete phase.teamCount; }
      else { phase.teamCount = Math.min(v, 20); delete phase.groupSize; }
    }
    var sizeModeSel = svSelect([
      { value: 'size', label: 'groups of' },
      { value: 'count', label: 'this many teams:' }
    ], sizeMode, function (mode) { writeSizing(mode); });
    num.addEventListener('input', function () {
      markEdited();
      writeSizing(sizeModeSel.value);
    });
    num.addEventListener('blur', function () { autoSaveIfDirty(); renderSimpleView(); });
    num.addEventListener('wheel', function () { num.blur(); }, { passive: true });
    sizingWrap.appendChild(sizeModeSel);
    sizingWrap.appendChild(num);
    box.appendChild(svControlRow('Sizing', sizingWrap));

    var methodOpts = [
      { value: 'random', label: 'at random' },
      { value: 'choice', label: 'students pick their spots' },
      { value: 'teacher', label: 'you arrange them on the host screen' }
    ];
    if (phase.method === 'balanced') methodOpts.push({ value: 'balanced', label: 'balanced by score' });
    box.appendChild(svControlRow('How', svSelect(methodOpts, phase.method || 'random', function (v) {
      phase.method = v;
    })));
    return box;
  }

  // Checklist items with an optional per-item role tag: each task can be
  // everyone's or one role's job. Untagged items stay plain strings so a
  // no-roles list round-trips exactly as before; tagging one writes the
  // {text, role} object form and wires rolesFrom to the roles step.
  function roleTaggedListEditor(phase, roleNames, rolesStepId) {
    var wrap = el('div', 'sv-list');
    function itemText(it) { return (it && typeof it === 'object') ? (it.text || '') : String(it == null ? '' : it); }
    function itemRole(it) { return (it && typeof it === 'object' && it.role) ? it.role : ''; }
    function writeItem(index, text, role) {
      phase.items[index] = role ? { text: text, role: role } : text;
    }
    function syncRolesFrom() {
      var any = phase.items.some(function (it) { return it && typeof it === 'object' && it.role; });
      if (any) { if (!phase.rolesFrom) phase.rolesFrom = rolesStepId; }
      else delete phase.rolesFrom;
    }
    function render() {
      wrap.innerHTML = '';
      if (!Array.isArray(phase.items)) phase.items = [];
      for (var i = 0; i < phase.items.length; i++) {
        (function (index) {
          // Two lines per task: the text (full width, the card is
          // narrow), then a slim "job:" dropdown beneath it.
          var block = el('div', 'sv-list-item-block');
          var row = el('div', 'sv-list-row');
          var input = document.createElement('input');
          input.type = 'text';
          input.className = 'sv-list-input';
          input.value = itemText(phase.items[index]);
          input.placeholder = 'task ' + (index + 1);
          input.addEventListener('input', function () {
            markEdited();
            writeItem(index, input.value, itemRole(phase.items[index]));
          });
          input.addEventListener('blur', function () { autoSaveIfDirty(); });
          row.appendChild(input);

          var rm = el('button', 'sv-list-remove', '✕');
          rm.type = 'button';
          rm.title = 'Remove';
          rm.addEventListener('click', function () {
            markEdited();
            phase.items.splice(index, 1);
            syncRolesFrom();
            render();
          });
          row.appendChild(rm);
          block.appendChild(row);

          // No roles step in the plan = no job line (plain task list).
          if (roleNames.length === 0) {
            wrap.appendChild(block);
            return;
          }
          var jobRow = el('div', 'sv-list-job-row');
          jobRow.appendChild(el('span', 'sv-list-job-label', 'job:'));
          var roleSel = document.createElement('select');
          roleSel.className = 'sv-select sv-role-select';
          roleSel.title = 'Whose job is this? "everyone" means the whole group\'s';
          var opts = [''].concat(roleNames);
          for (var oi = 0; oi < opts.length; oi++) {
            var opt = document.createElement('option');
            opt.value = opts[oi];
            opt.textContent = opts[oi] || 'everyone';
            if (opts[oi] === itemRole(phase.items[index])) opt.selected = true;
            roleSel.appendChild(opt);
          }
          roleSel.addEventListener('change', function () {
            markEdited();
            writeItem(index, input.value, roleSel.value);
            syncRolesFrom();
            autoSaveIfDirty();
          });
          jobRow.appendChild(roleSel);
          block.appendChild(jobRow);
          wrap.appendChild(block);
        })(i);
      }
      var add = el('button', 'sv-list-add', '+ Add task');
      add.type = 'button';
      add.addEventListener('click', function () {
        markEdited();
        if (!Array.isArray(phase.items)) phase.items = [];
        phase.items.push('');
        render();
      });
      wrap.appendChild(add);
    }
    render();
    return wrap;
  }

  // --- Picture / YouTube on a step ---
  // The media-capable steps (announce, collect, collect-choice, reveal;
  // estimate is picture-only) can show an image above the prompt and a
  // YouTube video on the projector. Addresses only, on purpose: uploaded
  // files would land on the deploy-ephemeral disk and vanish on the next
  // deploy (NEXT-STEPS 2026-08-30), a pasted URL survives everything.
  // The red advance button's wording ("Start the voting") is generated from
  // the NEXT step's type; this lets a teacher say it their way ("Let's
  // discuss!") without the AI. Blank = back to automatic. Collapsed until
  // asked for, like mediaEditor: most steps never need it.
  function buttonLabelEditor(phase) {
    var wrap = el('div', 'sv-media');
    var rows = el('div', 'sv-media-rows');

    var row = el('label', 'sv-media-row');
    row.appendChild(el('span', 'sv-media-label', 'Next button'));
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'sv-list-input sv-media-input';
    input.maxLength = 40;
    input.placeholder = 'Leave blank for automatic wording';
    input.value = phase.continueLabel || '';
    input.addEventListener('input', function () {
      markEdited();
      var v = input.value.trim();
      if (v) phase.continueLabel = v;
      else delete phase.continueLabel;
    });
    input.addEventListener('blur', function () { autoSaveIfDirty(); });
    row.appendChild(input);
    rows.appendChild(row);

    var hint = el('div', 'sv-media-hint',
      'The button that moves the class to the next step, on the projector and your teacher view.');
    rows.appendChild(hint);

    if (phase.continueLabel) {
      wrap.appendChild(rows);
    } else {
      var add = el('button', 'sv-action sv-action-quiet sv-media-add', '+ Change the next button');
      add.type = 'button';
      add.addEventListener('click', function () {
        wrap.replaceChild(rows, add);
        input.focus();
      });
      wrap.appendChild(add);
    }
    return wrap;
  }

  function mediaEditor(phase, opts) {
    var imageOnly = opts && opts.imageOnly;
    var wrap = el('div', 'sv-media');
    var rows = el('div', 'sv-media-rows');

    function mediaRow(labelText, placeholder, key, onDone) {
      var row = el('label', 'sv-media-row');
      row.appendChild(el('span', 'sv-media-label', labelText));
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'sv-list-input sv-media-input';
      input.placeholder = placeholder;
      input.value = phase[key] || '';
      input.addEventListener('input', function () {
        markEdited();
        var v = input.value.trim();
        if (v) phase[key] = v;
        else delete phase[key];
      });
      input.addEventListener('blur', function () {
        if (onDone) onDone((phase[key] || '').trim());
        autoSaveIfDirty();
      });
      row.appendChild(input);
      return row;
    }

    // Live thumbnail: proof the picture address actually loads.
    var thumb = document.createElement('img');
    thumb.className = 'sv-media-thumb';
    thumb.alt = '';
    thumb.hidden = true;
    thumb.addEventListener('load', function () { thumb.hidden = false; });
    thumb.addEventListener('error', function () { thumb.hidden = true; });
    function refreshThumb() {
      var v = phase.image || '';
      if (/^https?:\/\//.test(v)) { thumb.src = v; }
      else { thumb.hidden = true; }
    }
    rows.appendChild(mediaRow('Picture', 'Paste an image address (https://…)', 'image', refreshThumb));
    rows.appendChild(thumb);

    if (!imageOnly) {
      var hint = el('div', 'sv-media-hint');
      hint.hidden = true;
      function updateVideoHint(v) {
        var looksRight = !v || /youtu\.?be/.test(v);
        hint.textContent = looksRight
          ? 'The video plays on the projector screen, not on student devices.'
          : "That doesn't look like a YouTube link. Only YouTube plays on the projector.";
        hint.classList.toggle('sv-media-hint-warn', !looksRight);
        hint.hidden = !v;
      }
      rows.appendChild(mediaRow('YouTube', 'Paste a YouTube link', 'video', updateVideoHint));
      rows.appendChild(hint);
      updateVideoHint(phase.video || '');
    }

    refreshThumb();

    if (phase.image || phase.video) {
      wrap.appendChild(rows);
    } else {
      // Collapsed until asked for: most steps never need media, so the
      // card stays clean and the door stays visible.
      var add = el('button', 'sv-action sv-action-quiet sv-media-add',
        imageOnly ? '+ Add a picture' : '+ Add a picture or video');
      add.type = 'button';
      add.addEventListener('click', function () {
        wrap.replaceChild(rows, add);
        var firstInput = rows.querySelector('input');
        if (firstInput) firstInput.focus();
      });
      wrap.appendChild(add);
    }
    return wrap;
  }

  // --- Per-type sentence builders ---
  // Each returns { sentence, field?, facts: [], extra? } — field is the
  // inline-editable primary text, facts are short trailing notes.

  function describeStep(phaseId, phase) {
    var type = phase.type;
    var d = { sentence: '', field: null, facts: [], extra: null, media: null, buttonLabel: null, muted: false };

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
        else if (phase.pairBy && phase.pairBy.from) d.facts.push(fact((phase.pairBy.mode === 'same' ? 'partners who answered the same in ' : 'partners who answered differently in ') + stepName(phase.pairBy.from)));
        else if (phase.rotatePairsFrom) d.facts.push(fact('new partners since ' + stepName(phase.rotatePairsFrom)));
        else if (phase.assign === 'pairwise') d.facts.push(fact('random pairs'));
        if (phase.assign === 'pairwise' && phase.oddHandling === 'triple') d.facts.push(fact('odd class → group of 3'));
        if (phase.passAllowed) d.facts.push(fact('passing allowed'));
        if (phase.simultaneousReveal) d.facts.push(fact('answers hidden until everyone is done'));
        if (Array.isArray(phase.fields) && phase.fields.length) {
          d.facts.push(wrapFact(phase.fields.length + ' answer boxes: ' + phase.fields.map(function (f) { return f.label; }).join(', ')));
        }
        d.facts.push(timerFact(phase));
        d.media = mediaEditor(phase);
        break;
      }

      case 'solo-quiz': {
        var sqQs = Array.isArray(phase.questions) ? phase.questions : [];
        d.sentence = 'Students take a quiz at their own pace:';
        d.field = textBox(phase.title || '', 'Quiz title students see…', function (v) { phase.title = v; });
        d.facts.push(fact(sqQs.length + (sqQs.length === 1 ? ' question' : ' questions')));
        if (phase.showAnswers === false) d.facts.push(fact('right answers stay hidden'));
        d.facts.push(fact('projector shows progress only'));
        break;
      }

      case 'collect-choice': {
        d.sentence = 'Students pick one:';
        d.field = textBox(phase.prompt, 'The question students see…', function (v) { phase.prompt = v; });
        if (Array.isArray(phase.choices)) {
          // A templated correct answer ({{ref}}) is structural — the ✓
          // toggle only drives plain-text answers, so hide it then.
          var templatedCorrect = typeof phase.correctAnswer === 'string' &&
            phase.correctAnswer.indexOf('{{') !== -1;
          d.extra = stringListEditor(
            function () { return phase.choices; },
            function (a) { phase.choices = a; },
            'Choice',
            templatedCorrect ? null : {
              get: function () { return phase.correctAnswer; },
              set: function (v) {
                if (v) phase.correctAnswer = v;
                else delete phase.correctAnswer;
              },
              title: 'The correct answer'
            }
          );
        } else if (typeof phase.choices === 'string') {
          d.facts.push(fact('choices come from ' + humanizeRef(phase.choices)));
        } else if (phase.choicePool) {
          d.facts.push(fact('choices are built from earlier answers'));
        }
        if (phase.correctAnswer) d.facts.push(fact('graded, the ✓ answer earns points'));
        else if (Array.isArray(phase.choices)) d.facts.push(fact('a poll, tap ○ on a choice to make it a graded question'));
        if (phase.shuffle) d.facts.push(fact('choices shuffled for each student'));
        d.facts.push(timerFact(phase));
        d.media = mediaEditor(phase);
        break;
      }

      case 'announce':
        d.sentence = 'Everyone sees the message:';
        d.field = textBox(phase.message, 'What the class sees…', function (v) { phase.message = v; });
        d.facts.push(timerFact(phase));
        d.media = mediaEditor(phase);
        d.buttonLabel = buttonLabelEditor(phase);
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
          d.media = mediaEditor(phase);
          d.buttonLabel = buttonLabelEditor(phase);
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
        d.sentence = (phase.groupsFrom ? 'Groups' : (phase.groupSize === 4 ? 'Groups of four' : 'Pairs')) + ' combine their answers into one:';
        d.field = textBox(phase.instruction, 'Combine your answers into one stronger answer.', function (v) { phase.instruction = v; });
        if (phase.groupsFrom) d.facts.push(fact('same groups as ' + stepName(phase.groupsFrom)));
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
        // When the plan has an Assign Roles step, every task gets a
        // "whose job" dropdown: leave them all on "everyone" for one
        // shared list, tag a few for role jobs, or tag them all so each
        // role works its own list. No roles step = the plain editor.
        var clRolesStepId = null;
        if (phase.rolesFrom && gameConfig.phases[phase.rolesFrom] &&
            gameConfig.phases[phase.rolesFrom].type === 'team-roles') {
          clRolesStepId = phase.rolesFrom;
        } else {
          for (var clK in gameConfig.phases) {
            if (gameConfig.phases[clK] && gameConfig.phases[clK].type === 'team-roles') clRolesStepId = clK;
          }
        }
        var clRoleNames = clRolesStepId && Array.isArray(gameConfig.phases[clRolesStepId].roles)
          ? gameConfig.phases[clRolesStepId].roles.map(function (r) { return String(r || '').trim(); }).filter(Boolean)
          : [];
        // Always the role-aware editor: it renders object items ({text,
        // role}) as their text either way (the plain string editor showed
        // them as [object Object]). With no roles step the job dropdowns
        // stay hidden; existing tags survive unseen, so adding an Assign
        // Roles step later revives them.
        d.extra = roleTaggedListEditor(phase, clRoleNames, clRolesStepId);
        if (clRoleNames.length > 0) {
          d.facts.push(fact("each task can be everyone's, or one role's job"));
        } else if (Array.isArray(phase.items) &&
                   phase.items.some(function (it) { return it && typeof it === 'object' && it.role; })) {
          d.facts.push(fact('some tasks have role tags, add an Assign Roles step earlier to use them'));
        }
        d.facts.push(fact(phase.teamsFrom ? 'shared per group, live dashboard on the projector' : 'one list per student'));
        d.facts.push(timerFact(phase));
        break;
      }

      case 'team-roles': {
        var trEmpty = !Array.isArray(phase.roles) ||
          phase.roles.filter(function (r) { return String(r || '').trim(); }).length === 0;
        d.sentence = trEmpty
          ? 'No roles yet, so this step is skipped when the activity runs:'
          : (phase.method === 'choice'
            ? 'Everyone picks a role in their group:'
            : 'Everyone is dealt a role in their group:');
        var trWrap = el('div');
        trWrap.appendChild(stringListEditor(
          function () { if (!Array.isArray(phase.roles)) phase.roles = []; return phase.roles; },
          function (a) { phase.roles = a; },
          'role'
        ));
        var trCtrls = el('div', 'sv-ctrls');
        trCtrls.appendChild(svControlRow('How', svSelect([
          { value: 'choice', label: 'students pick their role' },
          { value: 'random', label: 'dealt at random' }
        ], phase.method || 'random', function (v) { phase.method = v; })));
        trWrap.appendChild(trCtrls);
        d.extra = trWrap;
        if (trEmpty) {
          d.facts.push(fact('add roles to use this step, or ask the AI to remove it'));
        } else {
          if (phase.teamsFrom) d.facts.push(fact('groups from ' + stepName(phase.teamsFrom)));
          if (phase.method === 'choice') d.facts.push(fact('open roles only, stragglers auto-filled'));
        }
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
        d.media = mediaEditor(phase, { imageOnly: true });
        break;

      case 'foreach': {
        d.sentence = 'For each item from ' + (phase.data ? humanizeRef(phase.data).toLowerCase() : '…') + ', the class:';
        // Round screens fold to one-line summaries; tapping one opens just
        // that screen's editor. All three at once was a wall of boxes
        // (owner report 2026-08-31: "the for each block is overwhelming").
        var subWrap = el('div', 'sv-subs');
        var subNames = phase.subPhases ? Object.keys(phase.subPhases) : [];
        for (var si = 0; si < subNames.length; si++) {
          (function (sub, subName) {
            var key = sub.type === 'announce' ? 'message' : 'prompt';
            var lead = sub.type === 'announce' ? 'sees:'
              : sub.type === 'collect-choice' ? 'picks one:'
              : 'writes:';
            var openKey = phaseId + ':' + subName;
            var isOpen = svOpenSub === openKey;

            var row = el('div', 'sv-sub' + (isOpen ? ' sv-sub-open' : ''));
            var head = el('button', 'sv-sub-head');
            head.type = 'button';
            head.title = isOpen ? 'Close this screen' : 'Open this screen to edit it';
            head.appendChild(el('span', 'sv-sub-lead', (isOpen ? '▾ ' : '▸ ') + lead));
            if (!isOpen) {
              head.appendChild(el('span', 'sv-sub-preview', subPreviewText(sub[key])));
            }
            head.addEventListener('click', function () {
              if (typeof autoSaveIfDirty === 'function') autoSaveIfDirty();
              svOpenSub = isOpen ? null : openKey;
              renderSimpleView();
            });
            row.appendChild(head);
            if (isOpen) {
              row.appendChild(textBox(sub[key], '…', function (v) { sub[key] = v; }));
            }
            subWrap.appendChild(row);
          })(phase.subPhases[subNames[si]], subNames[si]);
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
        d.sentence = 'The class splits into groups:';
        d.extra = teamSplitControls(phase);
        if (phase.method === 'teacher') d.facts.push(fact('the roster appears up front, Confirm finalizes'));
        else if (phase.method === 'choice') d.facts.push(fact(phase.capacity === 'open' ? 'no size caps, students join their real team' : 'open spots only, stragglers auto-filled'));
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

  // Totem 12A: number blocks are marks, so they wear paint — ask yellow,
  // show green, decide magenta, team orange, AI cyan; the waiting room
  // stays sanded wood and the wrap-up base wood. CSS maps sv-fam-* to
  // the colors (simple-designer.png).
  function svFamily(type) {
    if (type === 'ai-process' || type === 'ai-eliminate') return 'ai';
    if (type === 'lobby') return 'lobby';
    if (type === 'end') return 'end';
    if (type === 'collect' || type === 'collect-choice' || type === 'estimate' ||
        type === 'collect-two' || type === 'match' || type === 'sort' || type === 'buzz' ||
        type === 'solo-quiz') return 'ask';
    if (type === 'announce' || type === 'reveal' || type === 'reveal-one' ||
        type === 'leaderboard' || type === 'winner' || type === 'preview') return 'show';
    if (type === 'vote' || type === 'rank' || type === 'rate' ||
        type === 'wager' || type === 'eliminate') return 'decide';
    return 'team';
  }

  // The canonical step name for a block label (one vocabulary with the
  // Builder and the review panel: shared/phase-names.js).
  function blockName(type) {
    return (window.PHASE_NAMES && window.PHASE_NAMES[type]) || type;
  }

  // Send #phase-config-form (and the live preview) back to their home
  // panel and flush the open edit — the reverse of adopting them into
  // the detail card.
  function returnPhaseForm() {
    var phasePanelEl = document.getElementById('phase-panel');
    var form = document.getElementById('phase-config-form');
    var preview = document.getElementById('live-preview-section');
    if (form && phasePanelEl) phasePanelEl.appendChild(form);
    if (preview && phasePanelEl) phasePanelEl.appendChild(preview);
    if (typeof deselectPhase === 'function') deselectPhase();
    svFormPhaseId = null;
  }

  // The one-editor render (Totem 9d): the activity is a stack of painted
  // blocks; the picked-up block's plain-language settings show on the
  // detail card beside it. Adding, removing, and reordering steps go
  // through Design with AI for now (the scrap bin is parked).
  function renderSimpleView() {
    if (!gameConfig || !gameConfig.phases) return;
    if (!svStack || !svDetail) return;
    if (svRendering) return;
    svRendering = true;
    try {
      renderSimpleViewInner();
    } finally {
      svRendering = false;
    }
  }

  function renderSimpleViewInner() {
    var order = buildPhaseOrder();

    // Keep the selection valid: default to the first real step (the
    // waiting room is rarely what a teacher wants to edit first).
    if (!svSelectedId || !gameConfig.phases[svSelectedId]) {
      svSelectedId = null;
      svSettingsOpen = false;
      for (var i = 0; i < order.length; i++) {
        var p0 = gameConfig.phases[order[i]];
        if (p0 && p0.type !== 'lobby' && p0.type !== 'end') { svSelectedId = order[i]; break; }
      }
      if (!svSelectedId && order.length > 0) svSelectedId = order[0];
    }

    // --- The stack ---
    svStack.innerHTML = '';
    var stack = el('div', 'svb-stack');
    var stepNum = 0;
    var selectedNum = 0;
    var widths = ['96%', '88%', '100%', '92%'];
    var cuts = [
      'polygon(0 6%, 100% 0, 98% 100%, 2% 94%)',
      'polygon(2% 0, 100% 4%, 100% 96%, 0 100%)',
      'polygon(0 0, 98% 6%, 100% 100%, 1% 96%)'
    ];
    for (var s = 0; s < order.length; s++) {
      var phaseId = order[s];
      var phase = gameConfig.phases[phaseId];
      if (!phase) continue;
      stepNum++;
      if (phaseId === svSelectedId) selectedNum = stepNum;

      var row = el('div', 't-row svb-row');
      var blk = el('button', 't-block-btn svb-block svb-fam-' + svFamily(phase.type) +
        (phaseId === svSelectedId ? ' svb-selected' : ''));
      blk.type = 'button';
      blk.setAttribute('data-phase-id', phaseId);
      blk.style.setProperty('--rot', (stepNum % 2 ? -1.2 : 1.1) + 'deg');
      blk.style.setProperty('--slide', (stepNum % 2 ? 10 : -10) + 'px');
      blk.style.width = widths[stepNum % widths.length];
      blk.style.clipPath = cuts[stepNum % cuts.length];
      blk.appendChild(el('span', 'svb-num', String(stepNum)));
      blk.appendChild(el('span', 'svb-name', blockName(phase.type)));
      blk.addEventListener('click', function () {
        var pid = this.getAttribute('data-phase-id');
        if (pid === svSelectedId) return;
        if (typeof autoSaveIfDirty === 'function') autoSaveIfDirty();
        if (svSettingsOpen) returnPhaseForm();
        svSelectedId = pid;
        renderSimpleView();
      });
      row.appendChild(blk);
      stack.appendChild(row);
    }
    stack.appendChild(el('div', 'svb-plinth'));
    svStack.appendChild(stack);

    var caption = stepNum + (stepNum === 1 ? ' step' : ' steps');
    if (gameConfig.playTime) caption += ' · ' + gameConfig.playTime;
    svStack.appendChild(el('div', 'svb-caption', caption));

    // The plan ends, so play it: a big Preview block on the floor under
    // the stack. The header Preview button goes unseen (observation
    // 2026-08-27, eyes stay mid-page), and this is the natural next act
    // after reading the plan top to bottom.
    var previewBtn = el('button', 't-block-btn svb-preview-btn');
    previewBtn.type = 'button';
    previewBtn.title = 'Try the activity yourself with pretend players, no class needed';
    previewBtn.appendChild(el('span', 'svb-preview-main', '▶ Try it out'));
    previewBtn.appendChild(el('span', 'svb-preview-sub', 'play it with pretend students'));
    previewBtn.addEventListener('click', function () {
      // testGame lives in editor.js: saves first, then opens /prototype.
      if (typeof testGame === 'function') testGame();
    });
    svStack.appendChild(previewBtn);

    // --- The detail card ---
    svDetail.innerHTML = '';
    var selPhase = svSelectedId && gameConfig.phases[svSelectedId];
    if (!selPhase) return;
    var d = describeStep(svSelectedId, selPhase);

    var card = el('div', 'sv-card sv-detail-card' + (d.muted ? ' sv-muted' : ''));
    card.setAttribute('data-phase-id', svSelectedId);

    card.appendChild(el('span', 'svd-chip svb-fam-' + svFamily(selPhase.type),
      'Step ' + selectedNum + ' · ' + blockName(selPhase.type)));

    card.appendChild(el('div', 'sv-sentence', d.sentence));
    if (d.field) card.appendChild(d.field);
    if (d.extra) card.appendChild(d.extra);

    if (d.facts.length) {
      var factsRow = el('div', 'sv-facts');
      for (var f = 0; f < d.facts.length; f++) {
        if (f > 0) factsRow.appendChild(el('span', 'sv-fact-sep', '·'));
        factsRow.appendChild(d.facts[f]);
      }
      card.appendChild(factsRow);
    }

    if (d.media) card.appendChild(d.media);
    if (d.buttonLabel) card.appendChild(d.buttonLabel);

    // Actions: the card's simple fields for small things, the AI chat for
    // everything else (owner's call 2026-08-20: no raw-field escape hatch;
    // the All-settings expander below stays wired for an easy re-enable).
    var actions = el('div', 'sv-actions');
    var askBtn = el('button', 'sv-action', 'Ask AI to change this');
    askBtn.type = 'button';
    askBtn.addEventListener('click', function () {
      // chat-panel.js loads after this file — resolve at click time.
      if (window.openDesignChat) openDesignChat(svSelectedId);
    });
    actions.appendChild(askBtn);

    // Walk down the totem without reaching back to the stack: a Next
    // button on every card but the last (owner ask 2026-08-31).
    var selIdx = order.indexOf(svSelectedId);
    if (selIdx !== -1 && selIdx < order.length - 1) {
      var nextBtn = el('button', 'sv-action sv-action-quiet sv-next-btn', 'Next step ↓');
      nextBtn.type = 'button';
      nextBtn.addEventListener('click', function () {
        if (typeof autoSaveIfDirty === 'function') autoSaveIfDirty();
        if (svSettingsOpen) returnPhaseForm();
        svSelectedId = order[selIdx + 1];
        renderSimpleView();
      });
      actions.appendChild(nextBtn);
    }

    if (SV_ALL_SETTINGS_ENABLED) {
      var advBtn = el('button', 'sv-action sv-action-quiet',
        svSettingsOpen ? 'Hide all settings' : 'All settings →');
      advBtn.type = 'button';
      advBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        svSettingsOpen = !svSettingsOpen;
        if (!svSettingsOpen) returnPhaseForm();
        renderSimpleView();
      });
      actions.appendChild(advBtn);
    }
    card.appendChild(actions);

    // All settings: adopt the real step form (the Builder-rail relocation
    // pattern — #phase-config-form is a portable node). Only re-fill it
    // when the step changed; re-filling on every render would drop focus
    // mid-typing.
    if (svSettingsOpen) {
      var host = el('div', 'svd-allsettings');
      card.appendChild(host);
      if (svFormPhaseId !== svSelectedId) {
        _origSelectPhase(svSelectedId);
        svFormPhaseId = svSelectedId;
      }
      var form = document.getElementById('phase-config-form');
      if (form && form.parentNode !== host) host.appendChild(form);
      var preview = document.getElementById('live-preview-section');
      if (preview && preview.parentNode !== host) host.appendChild(preview);
    }

    svDetail.appendChild(card);
  }

  // --- Init: apply the saved (or default) view once the game has loaded.
  // editor.js calls renderCanvas() after load; our wrapper handles the
  // simple render. We just need the containers in the right state now.
  setEditorView(currentView);
})();
