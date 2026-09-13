// make.js — Make it yours as a page (/make?game=<id>, 2026-09-09).
//
// What your class will see, drawn from GET /api/games/:id/print (the first
// student step's words, timer, audience line: the same modules the host
// uses), with the question and any field labels editable in place and one
// red TRY IT. Host it now and Open in the designer are the quieter doors.
// Untouched = the original runs and no copy is saved (the dialog's rule).
// Edits go through POST /api/games/:id/make (engine/make-print.js applies
// them), an answered More question through the AI reword, and every door
// saves through MakeItYours.saveCopyAndReturn like the dialog did.
//
// Teacher text is untrusted for rendering: every sink here is textContent
// or the shared bold painter (RichText.applyInline), never innerHTML.

(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var gameId = params.get('game');
  var from = params.get('from');

  var el = {
    back: document.getElementById('back-link'),
    chip: document.getElementById('name-chip'),
    classHolder: document.getElementById('class-holder'),
    label: document.getElementById('print-label'),
    screen: document.getElementById('print-screen'),
    name: document.getElementById('print-name'),
    prompt: document.getElementById('print-prompt'),
    fields: document.getElementById('print-fields'),
    instruction: document.getElementById('print-instruction'),
    choices: document.getElementById('print-choices'),
    audience: document.getElementById('print-audience'),
    timerRow: document.getElementById('print-timer'),
    timerChip: document.getElementById('timer-chip'),
    timerNote: document.getElementById('timer-note'),
    opening: document.getElementById('opening'),
    openingTitle: document.getElementById('opening-title'),
    openingText: document.getElementById('opening-text'),
    doors: document.getElementById('doors'),
    tryBtn: document.getElementById('try-btn'),
    hostBtn: document.getElementById('host-btn'),
    designer: document.getElementById('designer-link'),
    note: document.getElementById('doors-note'),
    cancel: document.getElementById('cancel-link'),
    error: document.getElementById('make-error'),
    setupCard: document.getElementById('setup-card'),
    setupTally: document.getElementById('setup-tally'),
    setupLines: document.getElementById('setup-lines'),
    setupPanel: document.getElementById('setup-panel'),
    setupQuestions: document.getElementById('setup-questions'),
    setupStatus: document.getElementById('setup-status'),
    setupDone: document.getElementById('setup-done')
  };

  // Where "back" goes: the door the teacher came through
  if (from === 'home') el.back.href = '/';
  else if (from === 'designer') el.back.href = '/designer';
  el.back.textContent = from === 'home' ? 'Back to home' : from === 'designer' ? 'Back to Create' : 'Back to the yard';

  // What happens, stop by stop (the map the popups used to carry)
  if (gameId && window.ActivityMap) {
    ActivityMap.attach(gameId, document.getElementById('map-holder'));
  }

  var state = {
    config: null,
    print: null,
    promptBox: null,       // BoldBox wrapper, or null when the prompt is not editable
    fieldBoxes: {},        // key -> BoldBox wrapper
    timer: null,           // seconds, as edited
    questions: [],         // the AI's tailoring questions, once fetched
    answers: {},           // question -> { value } (a picked choice or typed text)
    questionsLoading: false,
    questionsRequest: 0,   // the fetch that is allowed to land (the class can change mid-flight)
    noQuestions: false,    // a recipe panel owns the words: nothing to ask
    openLine: null,        // the setup card line whose control is open
    anonymous: false,      // the two switches on the card
    earlyJoke: true,
    busy: false,
    panel: null,           // 'quiz' | 'bluff' when the recipe brings its own editor
    panelApi: null         // { makeCopy } from MakeItYours.mountPanel
  };

  function fail(text) {
    el.error.hidden = false;
    el.error.textContent = text;
  }

  // The AI fit failed: say so, and offer the copy as written (the words on
  // the page, without the More answers) rather than opening it silently
  // as if the answers had been applied (outside review, 2026-09-12).
  function rewordFailure(reason, working, dest) {
    clearOpening();
    fail('Could not fit the wording to your answers (' + reason + '). Try again, or open it as written: your answers on the setup card will not be applied.');
    var plain = document.createElement('button');
    plain.type = 'button';
    plain.className = 'error-action';
    plain.textContent = 'Use it as written';
    plain.addEventListener('click', function () {
      el.error.hidden = true;
      setOpening(dest, false);
      saveAndGo(working, dest).catch(function (err) {
        clearOpening();
        fail('Could not make your copy: ' + (err.message || err));
      });
    });
    el.error.appendChild(document.createTextNode(' '));
    el.error.appendChild(plain);
  }

  function setRich(node, text) {
    if (window.RichText && RichText.applyInline) RichText.applyInline(node, text || '');
    else node.textContent = String(text || '').replace(/\*\*/g, '');
  }

  function mmss(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function parseTimer(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    var m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    var n = parseInt(t, 10);
    return isNaN(n) ? null : n;
  }

  if (!gameId) {
    fail('Pick an activity in the yard first, then Make it yours.');
    el.doors.hidden = true;
    return;
  }

  // --- Load: the config (for the doors), the print (for the screen), and
  // the ids already taken (so a saved copy never collides).
  Promise.all([
    fetch('/api/games/' + encodeURIComponent(gameId)).then(function (r) { if (!r.ok) throw new Error('That activity could not be found.'); return r.json(); }),
    fetch('/api/games/' + encodeURIComponent(gameId) + '/print').then(function (r) { return r.ok ? r.json() : null; }),
    fetch('/api/games').then(function (r) { return r.ok ? r.json() : { games: [] }; }).catch(function () { return { games: [] }; })
  ]).then(function (parts) {
    state.config = parts[0];
    state.print = parts[1];
    var stamp = state.config && state.config.recipe;
    if (!stamp || typeof stamp.id !== 'string' || !window.SetupKnobs) return parts;
    // A recipe-born template may bring its own setup panel
    return fetch('/api/recipes/' + encodeURIComponent(stamp.id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (summary) {
        state.summary = summary;
        state.panel = summary ? SetupKnobs.panelFor(summary, stamp) : null;
        // No dedicated panel but setup knobs (Doodle Bluff): those mount too
        if (!state.panel && summary && SetupKnobs.knobsFor(summary, stamp).length) state.panel = 'knobs';
        return parts;
      });
  }).then(function (parts) {
    if (window.MakeItYours && parts[2] && Array.isArray(parts[2].games)) {
      MakeItYours.seedIds(parts[2].games.map(function (g) { return g.id; }));
    }
    render();
  }).catch(function (err) {
    fail(err.message || 'Could not open this activity.');
    el.doors.hidden = true;
  });

  function render() {
    var config = state.config;
    var print = state.print;
    document.title = 'Make it yours: ' + (config.name || 'activity') + ' - Jamyard';
    el.chip.textContent = 'Your ' + (config.name || 'activity');
    el.designer.href = '/designer/edit?game=' + encodeURIComponent(gameId) + '&from=library';

    // Who it is for: the shared class picker, in the panel next to the
    // questions it shapes (a pick reloads them, so it visibly does something)
    if (window.MakeItYours && MakeItYours.renderClassPicker) {
      MakeItYours.renderClassPicker(el.classHolder, {
        hint: 'The questions below update to fit your class.',
        onChange: function () { buildLines(); scheduleQuestions(); },
        onDone: function () { buildLines(); scheduleQuestions(true); openLine(null); }
      });
    }
    state.anonymous = !!config.anonymous;
    // On by default; only an explicit false turns it off.
    state.earlyJoke = config.earlyJoke !== false;
    // A quiz or bluff panel owns the words: the AI's word-tailoring
    // questions would rewrite choices out from under a correct answer
    state.noQuestions = !!(state.panel && state.panel !== 'knobs');
    buildLines();
    loadQuestions();

    if (!print) {
      // Nothing students answer (a talk-only activity): the print shows the
      // description and the doors still work, untouched = the original.
      el.name.textContent = config.name || '';
      var desc = document.createElement('p');
      desc.className = 'print-description';
      desc.textContent = config.description || '';
      el.prompt.appendChild(desc);
      el.label.textContent = 'What your class will see';
      return;
    }

    el.name.textContent = print.name || config.name || '';
    // A recipe with its own panel owns the words: the print is a preview
    // and the questions or facts are edited in the panel below
    if (state.panel) {
      print.prompt.editable = false;
      print.fields.forEach(function (f) { f.editable = false; });
      print.timerEditable = false;
      mountPanel();
    }
    var editable = print.prompt.editable || print.fields.some(function (f) { return f.editable; });
    el.label.textContent = editable ? 'What your class will see · tap the question to change it' : 'What your class will see';

    // The prompt: a bold-box plank when it is the teacher's to change
    if (print.prompt.text) {
      if (print.prompt.editable && window.BoldBox) {
        state.promptBox = BoldBox.create({ value: print.prompt.text, className: 'print-prompt' });
        state.promptBox.classList.add('plank');
        state.promptBox.box.setAttribute('aria-label', 'The question your class will see. Change it here.');
        el.prompt.appendChild(state.promptBox);
      } else {
        var fixed = document.createElement('div');
        fixed.className = 'print-prompt print-prompt-fixed';
        setRich(fixed, print.prompt.display || print.prompt.text);
        el.prompt.appendChild(fixed);
      }
    }

    // Fields (Exit Ticket's two questions): one plank each
    print.fields.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'print-field';
      if (f.editable && window.BoldBox) {
        var box = BoldBox.create({ value: f.label, className: 'print-field-label' });
        box.classList.add('plank');
        box.box.setAttribute('aria-label', 'Question ' + (print.fields.indexOf(f) + 1) + ' your class will see. Change it here.');
        state.fieldBoxes[f.key] = box;
        row.appendChild(box);
      } else {
        var lab = document.createElement('div');
        lab.className = 'print-field-label print-prompt-fixed';
        setRich(lab, f.label);
        row.appendChild(lab);
      }
      var line = document.createElement('div');
      line.className = 'print-field-line';
      line.setAttribute('aria-hidden', 'true');
      row.appendChild(line);
      el.fields.appendChild(row);
    });

    if (print.instruction) {
      el.instruction.hidden = false;
      setRich(el.instruction, print.instruction);
    }

    if (print.choices && print.choices.length) {
      el.choices.hidden = false;
      print.choices.forEach(function (c, i) {
        var chip = document.createElement('span');
        chip.className = 'print-choice choice-' + (i % 4);
        chip.textContent = c;
        el.choices.appendChild(chip);
      });
    }

    if (print.audience) {
      el.audience.hidden = false;
      el.audience.textContent = print.audience;
    }

    if (typeof print.timer === 'number') {
      el.timerRow.hidden = false;
      state.timer = print.timer;
      el.timerChip.textContent = mmss(print.timer);
      if (print.timerEditable) {
        el.timerChip.addEventListener('click', editTimer);
      } else {
        el.timerChip.disabled = true;
        el.timerChip.title = 'The timer is set by this template';
        el.timerNote.textContent = 'Timer';
      }
    }

  }

  // The recipe's own editor, under the doors: the dialog's panel, mounted
  function mountPanel() {
    var section = document.getElementById('panel-section');
    var holder = document.getElementById('panel-holder');
    var heading = document.getElementById('panel-heading');
    if (!section || !window.MakeItYours || !MakeItYours.mountPanel) return;
    heading.textContent = state.panel === 'bluff' ? 'The facts' : state.panel === 'knobs' ? 'Set it up' : 'The questions';
    state.panelApi = MakeItYours.mountPanel(state.panel, { id: gameId, name: state.config.name || 'Activity' }, state.config, state.summary, holder);
    if (!state.panelApi) return;
    section.hidden = false;
  }

  // The timer chip turns into a small box (2:00 or 120), Enter or blur sets it
  function editTimer() {
    if (el.timerRow.querySelector('input')) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'timer-input';
    input.value = mmss(state.timer);
    input.setAttribute('aria-label', 'Timer, minutes and seconds');
    input.maxLength = 6;
    el.timerChip.hidden = true;
    el.timerRow.insertBefore(input, el.timerNote);
    input.focus();
    input.select();
    var finished = false;
    var done = function () {
      if (finished) return;
      finished = true;
      var next = parseTimer(input.value);
      if (next !== null) state.timer = Math.max(10, Math.min(3600, next));
      el.timerChip.textContent = mmss(state.timer);
      input.remove();
      el.timerChip.hidden = false;
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); done(); }
      if (e.key === 'Escape') { input.value = mmss(state.timer); done(); }
    });
  }

  // --- The setup card (2026-09-13): one line per setting, its value as a
  // chip (yellow = set, dashed = not). Your class, the AI's one or two
  // questions, then the two switches. Tap a line: its control opens in the
  // panel under the doors; the switches flip on the spot. The questions
  // load with the page (they are lines now, not a fold) and again when
  // the class changes.
  var questionsTimer = null;

  // "9-12 · English / ELA +1": the saved profile, short enough for a chip
  function classValue() {
    var P = window.TeacherProfile;
    var p = P && P.get ? P.get() : null;
    if (!p) return '';
    var bits = [];
    if (p.gradeBand) {
      var band = (P.GRADE_BANDS || []).filter(function (b) { return b.id === p.gradeBand; })[0];
      var m = band && /\(([^)]+)\)/.exec(band.label);
      bits.push(m ? m[1] : (band ? band.label : ''));
    }
    if (p.subjects && p.subjects.length) {
      var first = p.subjects[0];
      var subj = first === 'other' && p.otherText
        ? p.otherText
        : ((P.SUBJECTS || []).filter(function (s) { return s.id === first; })[0] || {}).label;
      if (subj) bits.push(subj + (p.subjects.length > 1 ? ' +' + (p.subjects.length - 1) : ''));
    }
    return bits.filter(Boolean).join(' · ');
  }

  function shortValue(text) {
    var t = String(text || '').trim().replace(/\s+/g, ' ');
    return t.length > 26 ? t.slice(0, 24) + '…' : t;
  }

  function lineButton(key, name, value, unsetText) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'setup-line' + (state.openLine === key ? ' is-open' : '');
    b.setAttribute('data-line', key);
    var n = document.createElement('span');
    n.textContent = name;
    var chip = document.createElement('span');
    chip.className = 'vchip' + (value ? ' is-set' : '');
    chip.textContent = value ? shortValue(value) : unsetText;
    if (value && value.length > 26) chip.title = value;
    b.appendChild(n);
    b.appendChild(chip);
    return b;
  }

  // The card, rebuilt from state every time something changes: cheap,
  // and the tally can never drift from the chips
  function buildLines() {
    if (!el.setupLines) return;
    el.setupLines.textContent = '';
    var set = 0;
    var total = 1;
    var cls = classValue();
    if (cls) set++;
    el.setupLines.appendChild(lineButton('class', 'Your class', cls, 'not set'));
    if (state.questionsLoading) {
      var loading = document.createElement('span');
      loading.className = 'setup-line is-loading';
      loading.textContent = 'Finding what to ask…';
      el.setupLines.appendChild(loading);
    }
    state.questions.forEach(function (q, i) {
      total++;
      var a = state.answers[q.question];
      var v = a ? a.value.trim() : '';
      if (v) set++;
      el.setupLines.appendChild(lineButton('q' + i, q.label || q.question, v, 'not set'));
    });
    // The switches: yellow when something is happening (names hidden,
    // the joke on), dashed for the quiet state
    el.setupLines.appendChild(lineButton('names', 'Student names', state.anonymous ? 'hidden' : '', 'shown'));
    el.setupLines.appendChild(lineButton('joke', 'Early-bird joke', state.earlyJoke ? 'on' : '', 'off'));
    el.setupTally.textContent = set + ' of ' + total + ' set';
  }

  el.setupLines.addEventListener('click', function (e) {
    var b = e.target.closest('.setup-line[data-line]');
    if (!b) return;
    var key = b.getAttribute('data-line');
    if (key === 'names') { state.anonymous = !state.anonymous; buildLines(); return; }
    if (key === 'joke') { state.earlyJoke = !state.earlyJoke; buildLines(); return; }
    openLine(key === state.openLine ? null : key);
  });

  // Open a line's control in the panel (null closes it). The questions
  // show under the class picker whichever line was tapped, since the class
  // shapes them; a question line hides the picker and focuses its control.
  function openLine(key) {
    state.openLine = key;
    buildLines();
    if (!key) { el.setupPanel.hidden = true; return; }
    el.setupPanel.hidden = false;
    el.classHolder.hidden = key !== 'class';
    // The class picker brings its own Done; one is enough
    el.setupDone.hidden = key === 'class';
    if (key.charAt(0) === 'q') {
      var wrap = el.setupQuestions.children[parseInt(key.slice(1), 10)];
      var first = wrap && wrap.querySelector('.setup-choice[aria-pressed="true"], .setup-choice, .setup-q-input:not([hidden])');
      if (first) { try { first.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }
    }
    try { el.setupPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (err) { /* ignore */ }
  }

  el.setupDone.addEventListener('click', function () { openLine(null); });

  function scheduleQuestions(now) {
    clearTimeout(questionsTimer);
    questionsTimer = setTimeout(loadQuestions, now ? 0 : 1500);
  }

  function loadQuestions() {
    if (!state.config || state.noQuestions) return;
    var request = ++state.questionsRequest;
    state.questionsLoading = true;
    buildLines();
    el.setupStatus.hidden = false;
    el.setupStatus.textContent = 'Finding a question or two for your class…';
    var classDesc = window.TeacherProfile ? TeacherProfile.describe() : '';
    fetch('/api/games/customize-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: state.config,
        classDescription: classDesc,
        knownSettings: ['Grade band', 'Subjects', 'The question', 'Timer', 'Student names']
      })
    }).then(function (r) { return r.ok ? r.json() : { questions: [] }; })
      .catch(function () { return { questions: [] }; })
      .then(function (d) {
        // The class changed mid-flight: a newer request is on its way
        if (request !== state.questionsRequest) return;
        state.questionsLoading = false;
        renderQuestions((d && d.questions) || []);
      });
  }

  // The questions in the panel: a choice question is a row of chips with
  // "Something else…" opening a plank; a text question is the plank with
  // the mic. Every answer is a { value } the card and the doors read.
  function renderQuestions(list) {
    // Answers already given survive when the same question comes back
    var kept = {};
    Object.keys(state.answers).forEach(function (q) { kept[q] = state.answers[q].value; });
    state.answers = {};
    el.setupQuestions.textContent = '';
    state.questions = list;
    el.setupStatus.hidden = list.length > 0;
    if (!list.length) el.setupStatus.textContent = 'Nothing more to ask for this one. Change the question above, or open it in the designer.';
    list.forEach(function (q, i) {
      var answer = { value: kept[q.question] || '' };
      state.answers[q.question] = answer;
      var isChoice = q.kind === 'choice' && Array.isArray(q.choices) && q.choices.length >= 2;

      var wrap = document.createElement('div');
      wrap.className = 'setup-q';
      var head = document.createElement('div');
      head.className = 'setup-q-head';
      var label = document.createElement('label');
      label.className = 'setup-q-label';
      label.textContent = q.question;
      label.htmlFor = 'setup-q-' + i;
      head.appendChild(label);
      if (isChoice) {
        var sub = document.createElement('span');
        sub.className = 'setup-q-sub';
        sub.textContent = 'One tap, or type your own.';
        head.appendChild(sub);
      }
      wrap.appendChild(head);

      var input = document.createElement('textarea');
      input.id = 'setup-q-' + i;
      input.className = 'setup-q-input';
      input.rows = 2;
      input.placeholder = q.placeholder || (isChoice ? 'Your own answer, a few words' : '');
      input.value = answer.value;

      // The mic wraps the plank (speech-input.js), so hiding the plank
      // means hiding the wrapper too, or the mic floats on its own
      var showInput = function (show) {
        input.hidden = !show;
        var p = input.parentNode;
        if (p && p.classList && p.classList.contains('mic-wrap')) p.hidden = !show;
      };

      if (isChoice) {
        var row = document.createElement('div');
        row.className = 'setup-choices';
        var chips = [];
        var paint = function () {
          var typed = !input.hidden;
          chips.forEach(function (c) { c.setAttribute('aria-pressed', !typed && answer.value === c.textContent ? 'true' : 'false'); });
          other.setAttribute('aria-pressed', typed ? 'true' : 'false');
        };
        q.choices.forEach(function (text) {
          var c = document.createElement('button');
          c.type = 'button';
          c.className = 'setup-choice';
          c.textContent = text;
          c.addEventListener('click', function () {
            answer.value = text;
            showInput(false);
            paint();
            noteAnswer(wrap, answer);
          });
          chips.push(c);
          row.appendChild(c);
        });
        var other = document.createElement('button');
        other.type = 'button';
        other.className = 'setup-choice setup-choice-other';
        other.textContent = 'Something else…';
        other.addEventListener('click', function () {
          showInput(true);
          answer.value = input.value;
          paint();
          noteAnswer(wrap, answer);
          input.focus();
        });
        row.appendChild(other);
        wrap.appendChild(row);
        // A kept answer that is not one of the choices was typed
        input.hidden = !(answer.value && q.choices.indexOf(answer.value) === -1);
        paint();
      }

      input.addEventListener('input', function () {
        answer.value = input.value;
        noteAnswer(wrap, answer);
      });
      wrap.appendChild(input);
      el.setupQuestions.appendChild(wrap);
      noteAnswer(wrap, answer);
      if (window.GrowingText && GrowingText.fit) GrowingText.fit(input);
      if (window.Speech && Speech.isSupported && Speech.isSupported() && Speech.attachMic) Speech.attachMic(input);
      // The mic wrapper arrived after the plank was hidden: keep them in step
      showInput(!input.hidden);
    });
    buildLines();
  }

  // An answered question says so at once (the card's chip goes yellow),
  // and TRY IT says what the answers will do (the AI reword, and the
  // twenty seconds it costs)
  function noteAnswer(wrap, answer) {
    wrap.classList.toggle('answered', answer.value.trim().length > 0);
    var n = answeredQuestions().length;
    el.note.hidden = n === 0;
    el.note.textContent = n === 1
      ? 'Your answer is in. TRY IT fits the wording to it, about twenty seconds.'
      : 'Your ' + n + ' answers are in. TRY IT fits the wording to them, about twenty seconds.';
    buildLines();
  }

  // --- The edits, read off the page
  function currentEdits() {
    var edits = {};
    if (state.promptBox) edits.prompt = state.promptBox.value;
    var fields = {};
    var any = false;
    Object.keys(state.fieldBoxes).forEach(function (k) { fields[k] = state.fieldBoxes[k].value; any = true; });
    if (any) edits.fields = fields;
    if (state.print && state.print.timerEditable && typeof state.timer === 'number') edits.timer = state.timer;
    edits.anonymous = !!state.anonymous;
    edits.earlyJoke = !!state.earlyJoke;
    return edits;
  }

  function answeredQuestions() {
    return Object.keys(state.answers).filter(function (q) { return state.answers[q].value.trim(); })
      .map(function (q) { return { question: q, answer: state.answers[q].value.trim() }; });
  }

  // A copy that is already the teacher's (the Create page's match lands
  // here after saving; a yard copy) saves edits back to itself. Anything
  // else, a built-in, becomes a new copy in My yard.
  var isOwn = !!(window.MyGames && MyGames.has && MyGames.has(gameId));
  function saveAndGo(config, dest) {
    if (!isOwn) return MakeItYours.saveCopyAndReturn(config, dest);
    delete config.featured;
    return fetch('/api/games/' + encodeURIComponent(gameId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.json().catch(function () { return {}; }).then(function (d) {
          throw new Error(d.error || 'save failed');
        });
      }
      window.location.href = destUrl(dest, gameId);
    });
  }

  function destUrl(dest, id) {
    var q = encodeURIComponent(id);
    if (dest === 'simulate') return '/prototype?game=' + q;
    if (dest === 'host') return window.HostLaunch ? HostLaunch.hostUrl(id) : '/host?game=' + q;
    return '/designer/edit?game=' + q + '&from=library';
  }

  function setOpening(dest, withAi) {
    state.busy = true;
    document.body.classList.add('is-opening');
    el.opening.hidden = false;
    el.openingTitle.textContent = dest === 'simulate' ? 'Opening with pretend students…'
      : dest === 'host' ? 'Opening your room…' : 'Opening the designer…';
    el.openingText.textContent = withAi
      ? 'Fitting the whole activity to your class. About twenty seconds.'
      : 'Your words are in.';
    el.tryBtn.disabled = true;
    el.hostBtn.disabled = true;
    el.cancel.hidden = false;
  }

  function clearOpening() {
    // Nothing opened after all (a failure, or Cancel): the console tab
    // that Host may have opened is closed rather than left waiting
    if (window.HostLaunch) HostLaunch.abandon();
    state.busy = false;
    document.body.classList.remove('is-opening');
    el.opening.hidden = true;
    el.tryBtn.disabled = false;
    el.hostBtn.disabled = false;
    el.cancel.hidden = true;
  }

  el.cancel.addEventListener('click', function (e) { e.preventDefault(); clearOpening(); });

  // --- The doors. Untouched = the original runs (no copy saved); the
  // designer gets an unsaved draft. Anything touched = a saved copy.
  function go(dest) {
    if (state.busy || !state.config) return;
    el.error.hidden = true;
    // Host it now opens the teacher console in a new tab, inside the click
    // (shared/host-launch.js); the projector address picks the nonce up
    if (dest === 'host' && window.HostLaunch) HostLaunch.begin();
    // A recipe panel builds and saves the copy itself (filling it in IS
    // editing, so these always save, as the dialog did)
    if (state.panelApi && state.panelApi.makeCopy) {
      setOpening(dest, false);
      var result = state.panelApi.makeCopy(dest, { anonymous: !!state.anonymous, earlyJoke: !!state.earlyJoke });
      if (result === false) { clearOpening(); return; }
      if (result && result.then) result.then(function () { clearOpening(); });
      return;
    }
    var edits = currentEdits();
    var answered = answeredQuestions();
    var withAi = answered.length > 0;
    // Setup knobs (a recipe recompile) come first; the rest rides on top
    if (state.panelApi && state.panelApi.touched && state.panelApi.touched()) {
      setOpening(dest, withAi);
      state.panelApi.build()
        .then(function (working) {
          working = JSON.parse(JSON.stringify(working));
          delete working.featured;
          working.name = isOwn ? (state.config.name || 'Activity') : (state.config.name || 'Activity') + ' (my version)';
          if (typeof edits.anonymous === 'boolean') working.anonymous = edits.anonymous;
          // Early-bird joke is on by default: on drops a `false`, off writes one.
          if (edits.earlyJoke) { if (working.earlyJoke === false) delete working.earlyJoke; }
          else working.earlyJoke = false;
          if (!withAi) return saveAndGo(working, dest);
          return reword(working, answered).then(
            function (revised) { return saveAndGo(revised, dest); },
            function (err) { rewordFailure(err.message || String(err), working, dest); }
          );
        })
        .catch(function (err) { clearOpening(); fail('Could not make your copy: ' + (err.message || err)); });
      return;
    }

    fetch('/api/games/' + encodeURIComponent(gameId) + '/make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.config) throw new Error((result.data && result.data.error) || 'could not apply your words');
        var working = result.data.config;
        var changed = result.data.changed;
        // The server names a copy after its new question; a copy that is
        // already the teacher's keeps its name.
        if (isOwn) working.name = state.config.name || working.name;
        if (!changed && !withAi) {
          if (dest === 'designer' && !isOwn) {
            working.name = (state.config.name || 'Activity') + ' (my version)';
            return MakeItYours.openDraftCopy(working);
          }
          window.location.href = destUrl(dest, gameId);
          return;
        }
        setOpening(dest, withAi);
        if (!withAi) return saveAndGo(working, dest);
        return reword(working, answered).then(
          function (revised) { return saveAndGo(revised, dest); },
          function (err) { rewordFailure(err.message || String(err), working, dest); }
        );
      })
      .catch(function (err) {
        clearOpening();
        fail('Could not make your copy: ' + (err.message || err));
      });
  }

  // The AI rewords the surrounding copy to the More answers (the dialog's
  // request, word for word). Rejects with a short reason when the fit
  // fails; the caller tells the teacher (never a silent fallback).
  function reword(working, answered) {
    var classDesc = window.TeacherProfile ? TeacherProfile.describe() : '';
    var request = 'A teacher is adapting this ready-made activity for their own class. ' +
      'Rewrite ONLY the teacher- and student-facing words (name, description, prompts, messages, choices, reveal templates) to fit their answers below. ' +
      'Keep every step, the structure, timers, data references, and {{tokens}} exactly as they are.\n\n' +
      (classDesc ? 'Their class: ' + classDesc + '.\n' : '') +
      answered.map(function (a) { return 'Q: ' + a.question + '\nA: ' + a.answer; }).join('\n');
    return fetch('/api/games/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: working, request: request })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        var d = result.data;
        var structural = d && d.structural && d.structural.errors ? d.structural.errors : [];
        if (!result.ok || !d || d.error) throw new Error((d && d.error) || 'the AI did not answer');
        if (!d.updatedConfig) throw new Error('the AI sent nothing back');
        if (structural.length > 0) {
          var first = structural[0];
          throw new Error('the rewrite broke a step: ' + (first && first.message ? first.message : String(first)));
        }
        var revised = d.updatedConfig;
        if (!revised.name || revised.name === state.config.name) revised.name = working.name;
        return revised;
      }, function () { throw new Error('no connection'); });
  }

  el.tryBtn.addEventListener('click', function () { go('simulate'); });
  el.hostBtn.addEventListener('click', function () { go('host'); });
  el.designer.addEventListener('click', function (e) { e.preventDefault(); go('designer'); });
})();
