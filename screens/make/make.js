// make.js — Make it yours as a page (/make?game=<id>, 2026-09-09).
//
// What your class will see, drawn from GET /api/games/:id/print (the first
// student step's words, timer, audience line: the same modules the host
// uses), with the question and any field labels editable in place and one
// red HOST IT NOW (the owner's call, 2026-09-16; it was TRY IT). Try it
// with pretend students and Open in the designer are the quieter doors.
// Untouched = the original runs and no copy is saved (the dialog's rule).
// Edits go through POST /api/games/:id/make (engine/make-print.js applies
// them), an answered question below through the AI reword, and every door
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
    fitRows: document.getElementById('fit-rows'),
    fitFoot: document.getElementById('fit-foot'),
    fitSee: document.getElementById('fit-see'),
    fitNote: document.getElementById('fit-note'),
    mapHolder: document.getElementById('map-holder'),
    pairsSection: document.getElementById('pairs-section'),
    pairsHolder: document.getElementById('pairs-holder'),
    talkSection: document.getElementById('talk-section'),
    talkHolder: document.getElementById('talk-holder')
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
    pairBoxes: {},         // match step id -> [{ left: input, right: input }] (the pairs panel)
    newRoundBoxes: [],     // "+ round": one array of { left, right } inputs per new round, in order
    timer: null,           // seconds, as edited
    questions: [],         // the AI's tailoring questions, once fetched
    answers: {},           // question -> { value } (a picked choice or typed text)
    questionsRequest: 0,   // the fetch that is allowed to land (the class can change mid-flight)
    noQuestions: false,    // a recipe panel owns the words: nothing to ask
    contentKnobs: false,   // the knobs panel holds a list or a topic to type
    anonymous: false,      // the two switch rows
    earlyJoke: true,
    fitted: null,          // { key, config }: the AI-fitted copy "See how it reads" made, reused by the doors while nothing changed
    fitting: false,        // "See how it reads" is running
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
    fail('Could not fit the wording to your answers (' + reason + '). Try again, or open it as written: your answers below will not be applied.');
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
    fetch('/api/games?mine=' + encodeURIComponent((window.MyGames ? MyGames.list() : []).join(','))).then(function (r) { return r.ok ? r.json() : { games: [], ids: [] }; }).catch(function () { return { games: [], ids: [] }; })
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
        // No dedicated panel but setup knobs (Doodle Bluff, Group Work
        // Day): those mount too; a list or a topic among them means the
        // panel holds the words
        var knobs = summary ? SetupKnobs.knobsFor(summary, stamp) : [];
        if (!state.panel && knobs.length) state.panel = 'knobs';
        state.contentKnobs = knobs.some(function (k) { return k.kind === 'lines' || k.kind === 'text' || k.kind === 'tags' || k.kind === 'list'; });
        return parts;
      });
  }).then(function (parts) {
    if (window.MakeItYours && parts[2] && (Array.isArray(parts[2].ids) || Array.isArray(parts[2].games))) {
      MakeItYours.seedIds(Array.isArray(parts[2].ids) ? parts[2].ids : parts[2].games.map(function (g) { return g.id; }));
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

    // Who it is for: the shared class picker, under the rows, shown by the
    // class row's "change" link (a pick reloads the questions, so it
    // visibly does something)
    if (window.MakeItYours && MakeItYours.renderClassPicker) {
      MakeItYours.renderClassPicker(el.classHolder, {
        hint: 'The questions above update to fit your class.',
        onChange: function () { buildRows(); scheduleQuestions(); },
        onDone: function () { buildRows(); scheduleQuestions(true); toggleClassPicker(false); }
      });
    }
    state.anonymous = !!config.anonymous;
    // On by default; only an explicit false turns it off.
    state.earlyJoke = config.earlyJoke !== false;
    // A quiz or bluff panel owns the words: the AI's word-tailoring
    // questions would rewrite choices out from under a correct answer
    // A recipe panel that holds the words (the quiz's questions, the
    // bluff's facts, a knobs panel with a list or a topic to type: Group
    // Work Day's jobs and tasks, Doodle Bluff's phrases) owns them; the
    // AI's fit questions would ask about the same words twice (owner,
    // 2026-09-13: "the make it fit your class questions seem redundant")
    state.noQuestions = !!(state.panel && (state.panel !== 'knobs' || state.contentKnobs));
    buildRows();
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
        state.promptBox.box.addEventListener('input', scheduleMap);
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
        box.box.addEventListener('input', scheduleMap);
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

    // A matching activity's pairs, editable (a recipe panel owns its own)
    if (!state.panel) mountPairs(print.pairs);
    // A talk-only activity's questions, tier by tier, folded
    mountTalk(print.talk);

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
      scheduleMap();
    };
    input.addEventListener('blur', done);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); done(); }
      if (e.key === 'Escape') { input.value = mmss(state.timer); done(); }
    });
  }

  // --- Make it fit your class (2026-09-13): rows of chips, nothing folded.
  // Every setting is ONE row: the question on the left, the answer as
  // chips on the right, tapped in place; a typed answer is a plank in its
  // row. The AI's one or two questions come first (they load with the
  // page and again when the class changes), then Your class, Student
  // names, Early-bird joke. The question is the only text on a row.
  var questionsTimer = null;
  var qHolder = document.createElement('div');
  var fixedHolder = document.createElement('div');
  if (el.fitRows) {
    el.fitRows.appendChild(qHolder);
    // "See how it reads" sits right under the question's own box, before
    // Your class and the other rows (owner, 2026-09-16)
    if (el.fitFoot) el.fitRows.insertBefore(el.fitFoot, qHolder.nextSibling);
    el.fitRows.appendChild(fixedHolder);
  }

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

  function chipButton(text, pressed, dashed) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'fit-chip' + (dashed ? ' is-dashed' : '');
    b.textContent = text;
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    return b;
  }

  function rowEl(question) {
    var row = document.createElement('div');
    row.className = 'fit-row';
    var q = document.createElement('span');
    q.className = 'fit-q';
    q.textContent = question;
    row.appendChild(q);
    // The answer side: chips, a link, or the plank, wrapping in their own column
    var a = document.createElement('div');
    a.className = 'fit-a';
    row.appendChild(a);
    row.a = a;
    return row;
  }

  // The class picker, under the rows: the class row's link shows it, its
  // own Done hides it again
  function toggleClassPicker(show) {
    var open = typeof show === 'boolean' ? show : el.classHolder.hidden;
    el.classHolder.hidden = !open;
    if (!open) return;
    var f = el.classHolder.querySelector('button, input');
    if (f) { try { f.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }
    try { el.classHolder.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (err) { /* ignore */ }
  }

  // The rows under the questions, rebuilt from state whenever a chip is
  // tapped (cheap; the question rows keep their own nodes so typing is
  // never interrupted)
  function buildRows() {
    if (!el.fitRows) return;
    fixedHolder.textContent = '';

    var cls = classValue();
    var classRow = rowEl('Your class');
    var classChip = chipButton(cls || 'Not set', !!cls, !cls);
    classChip.addEventListener('click', function () { toggleClassPicker(); });
    classRow.a.appendChild(classChip);
    var link = document.createElement('a');
    link.href = '#';
    link.className = 'fit-link';
    link.textContent = cls ? 'change' : 'set it';
    link.addEventListener('click', function (e) { e.preventDefault(); toggleClassPicker(); });
    classRow.a.appendChild(link);
    fixedHolder.appendChild(classRow);

    var names = rowEl('Student names');
    var shown = chipButton('Shown', !state.anonymous);
    shown.addEventListener('click', function () { state.anonymous = false; buildRows(); });
    var hidden = chipButton('Hidden', state.anonymous);
    hidden.title = 'The room assigns play names';
    hidden.addEventListener('click', function () { state.anonymous = true; buildRows(); });
    names.a.appendChild(shown);
    names.a.appendChild(hidden);
    fixedHolder.appendChild(names);

    var joke = rowEl('Early-bird joke');
    var on = chipButton('On', state.earlyJoke);
    on.title = 'The first 10 students to join each see a dad joke';
    on.addEventListener('click', function () { state.earlyJoke = true; buildRows(); });
    var off = chipButton('Off', !state.earlyJoke);
    off.addEventListener('click', function () { state.earlyJoke = false; buildRows(); });
    joke.a.appendChild(on);
    joke.a.appendChild(off);
    fixedHolder.appendChild(joke);
    // A switch is an edit too: the fitted copy (if any) is stale now
    updateFitFoot();
  }

  function scheduleQuestions(now) {
    clearTimeout(questionsTimer);
    questionsTimer = setTimeout(loadQuestions, now ? 0 : 1500);
  }

  function loadQuestions() {
    if (!state.config || state.noQuestions || !el.fitRows) return;
    var request = ++state.questionsRequest;
    qHolder.textContent = '';
    var loading = rowEl('Finding a question or two for your class…');
    loading.classList.add('is-loading');
    qHolder.appendChild(loading);
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
        renderQuestions((d && d.questions) || []);
      });
  }

  // The question rows: a choice question is chips with "Type your own…"
  // opening a plank; a text question is the plank in the row, the mic on
  // it. Every answer is a { value } the doors read.
  function renderQuestions(list) {
    // Answers already given survive when the same question comes back
    var kept = {};
    Object.keys(state.answers).forEach(function (q) { kept[q] = state.answers[q].value; });
    state.answers = {};
    qHolder.textContent = '';
    state.questions = list;
    list.forEach(function (q, i) {
      var answer = { value: kept[q.question] || '' };
      state.answers[q.question] = answer;
      var isChoice = q.kind === 'choice' && Array.isArray(q.choices) && q.choices.length >= 2;
      var row = rowEl(q.question);
      row.setAttribute('data-q', String(i));

      var input = document.createElement('textarea');
      input.id = 'fit-q-' + i;
      input.className = 'fit-plank';
      input.rows = 1;
      input.setAttribute('aria-label', q.question);
      input.placeholder = q.placeholder || (isChoice ? 'A few words' : '');
      input.value = answer.value;

      // The mic wraps the plank (speech-input.js), so hiding the plank
      // means hiding the wrapper too, or the mic floats on its own
      var showInput = function (show) {
        input.hidden = !show;
        var p = input.parentNode;
        if (p && p.classList && p.classList.contains('mic-wrap')) p.hidden = !show;
      };

      if (isChoice) {
        var chips = [];
        var paint = function () {
          var typed = !input.hidden;
          chips.forEach(function (c) { c.setAttribute('aria-pressed', !typed && answer.value === c.textContent ? 'true' : 'false'); });
          own.setAttribute('aria-pressed', typed ? 'true' : 'false');
        };
        q.choices.forEach(function (text) {
          var c = chipButton(text, false);
          c.addEventListener('click', function () {
            answer.value = text;
            showInput(false);
            paint();
            noteAnswer(row, answer);
          });
          chips.push(c);
          row.a.appendChild(c);
        });
        var own = chipButton('Type your own…', false, true);
        own.addEventListener('click', function () {
          showInput(true);
          answer.value = input.value;
          paint();
          noteAnswer(row, answer);
          input.focus();
        });
        row.a.appendChild(own);
        // A kept answer that is not one of the choices was typed
        input.hidden = !(answer.value && q.choices.indexOf(answer.value) === -1);
        paint();
      }

      input.addEventListener('input', function () {
        answer.value = input.value;
        noteAnswer(row, answer);
      });
      row.a.appendChild(input);
      qHolder.appendChild(row);
      noteAnswer(row, answer);
      if (window.GrowingText && GrowingText.fit) GrowingText.fit(input);
      if (window.Speech && Speech.isSupported && Speech.isSupported() && Speech.attachMic) Speech.attachMic(input);
      // The mic wrapper arrived after the plank was hidden: keep them in step
      showInput(!input.hidden);
    });
  }

  // An answered question says so (the plank's green ring), and TRY IT
  // says what the answers will do (the AI reword, and the twenty seconds
  // it costs)
  function noteAnswer(row, answer) {
    row.classList.toggle('answered', answer.value.trim().length > 0);
    var n = answeredQuestions().length;
    el.note.hidden = n === 0;
    // One line, whatever the count (owner's wording, 2026-09-16)
    el.note.textContent = 'Host it or try it, and the wording gets fitted to your class.';
    updateFitFoot();
  }

  // --- What happens follows the edits (2026-09-13). Two tiers: the map
  // redraws from the edited copy as the question, labels, or timer change
  // (the server applies the edits and sends the map back, no AI); and
  // "See how it reads" runs the AI fit ONCE on demand, redraws the map
  // from the fitted copy, and hands that copy to the doors so they never
  // pay twice. A change to any answer or edit puts the button back.
  var mapTimer = null;

  function redrawMap(map) {
    if (!el.mapHolder || !window.ActivityMap || !ActivityMap.render) return;
    if (!map || !Array.isArray(map.stops) || map.stops.length === 0) return;
    el.mapHolder.textContent = '';
    el.mapHolder.appendChild(ActivityMap.render(map));
  }

  function scheduleMap() {
    clearTimeout(mapTimer);
    mapTimer = setTimeout(refreshMap, 400);
    updateFitFoot();
  }

  var mapRequest = 0;
  function refreshMap() {
    if (!state.config || state.busy || state.panelApi) return;
    var request = ++mapRequest;
    fetch('/api/games/' + encodeURIComponent(gameId) + '/make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentEdits())
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) {
        if (request !== mapRequest || !d) return;
        redrawMap(d.map);
      });
  }

  // What the fitted copy was made from: the edits and the answers
  function fitKey() {
    return JSON.stringify({ edits: currentEdits(), answers: answeredQuestions() });
  }

  function updateFitFoot() {
    if (!el.fitFoot) return;
    var n = answeredQuestions().length;
    el.fitFoot.hidden = n === 0 || !!state.panelApi;
    if (state.fitting) return;
    var current = !!(state.fitted && state.fitted.key === fitKey());
    el.fitSee.disabled = current;
    el.fitSee.textContent = current ? 'Fitted' : (state.fitted ? 'See how it reads now' : 'See how it reads');
    el.fitNote.textContent = current
      ? 'The screen above and What happens below now show the reworded copy. Host it or try it to use it.'
      : 'Rewords the screen above and What happens below for your class. About twenty seconds.';
  }

  function seeHowItReads() {
    if (state.busy || state.fitting || !state.config) return;
    var answered = answeredQuestions();
    if (!answered.length) return;
    var key = fitKey();
    state.fitting = true;
    el.fitSee.disabled = true;
    el.fitSee.textContent = 'Fitting…';
    el.fitNote.textContent = 'About twenty seconds.';
    el.error.hidden = true;
    fetch('/api/games/' + encodeURIComponent(gameId) + '/make', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentEdits())
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.config) throw new Error((result.data && result.data.error) || 'could not apply your words');
        var working = result.data.config;
        if (isOwn) working.name = state.config.name || working.name;
        return reword(working, answered);
      })
      .then(function (revised) {
        state.fitted = { key: key, config: revised };
        var post = function (path) {
          return fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: revised })
          }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
        };
        return Promise.all([post('/api/games/map'), post('/api/games/print')]);
      })
      .then(function (parts) {
        state.fitting = false;
        redrawMap(parts[0]);
        applyFittedPrint(parts[1]);
        // A quiet miss here looked like "nothing happened" (the print
        // route is newer than a running server): say so instead
        if (!parts[1] || !parts[0]) fail('The fitted copy is in and TRY IT opens it, but the page could not redraw ' + (!parts[1] ? 'the screen above' : 'What happens') + '. If the server was updated, restart it.');
        // The print may have taken the fitted question into the box: the
        // key is read after that, so the doors still know this copy
        state.fitted.key = fitKey();
        updateFitFoot();
        try { el.screen.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (err) { /* ignore */ }
      })
      .catch(function (err) {
        state.fitting = false;
        updateFitFoot();
        fail('Could not fit the wording (' + (err.message || err) + '). Try again.');
      });
  }

  if (el.fitSee) el.fitSee.addEventListener('click', seeHowItReads);

  // Did the teacher change the print's words? (The template's own words
  // are the AI's to fit; the teacher's are fixed.)
  function promptChanged() {
    return !!(state.promptBox && state.print && state.promptBox.value.trim() !== String(state.print.prompt.text || '').trim());
  }

  function changedFieldLabels() {
    var out = [];
    Object.keys(state.fieldBoxes).forEach(function (k) {
      var orig = (state.print.fields.filter(function (f) { return f.key === k; })[0] || {}).label || '';
      var now = state.fieldBoxes[k].value.trim();
      if (now !== String(orig).trim()) out.push(now);
    });
    return out;
  }

  // The print redrawn from the fitted copy: the choices, the instruction,
  // the audience line, and the question and labels where the teacher had
  // not written their own (those stay as typed, and stay editable)
  function applyFittedPrint(print) {
    if (!print || !state.print) return;
    if (state.promptBox && !promptChanged() && print.prompt && print.prompt.text) {
      state.promptBox.value = print.prompt.text;
    } else if (!state.promptBox && print.prompt && print.prompt.text) {
      var fixedEl = el.prompt.querySelector('.print-prompt-fixed');
      if (fixedEl) setRich(fixedEl, print.prompt.display || print.prompt.text);
    }
    var changedLabels = changedFieldLabels();
    (print.fields || []).forEach(function (f) {
      var box = state.fieldBoxes[f.key];
      if (box && changedLabels.indexOf(box.value.trim()) === -1) box.value = f.label;
    });
    el.instruction.hidden = !print.instruction;
    if (print.instruction) setRich(el.instruction, print.instruction);
    el.choices.textContent = '';
    el.choices.hidden = !(print.choices && print.choices.length);
    (print.choices || []).forEach(function (c, i) {
      var chip = document.createElement('span');
      chip.className = 'print-choice choice-' + (i % 4);
      chip.textContent = c;
      el.choices.appendChild(chip);
    });
    el.audience.hidden = !print.audience;
    if (print.audience) el.audience.textContent = print.audience;
    // The pairs the teacher left alone take the fitted ones
    if (Array.isArray(print.pairs) && print.pairs.length && !state.panel) {
      var changedIds = changedPairRounds().map(function (r) { return r.id; });
      var known = state.print.pairs.length;
      // The template's rounds, the teacher's edits kept; any rounds past
      // those are the ones the teacher added, back as new rounds
      var merged = print.pairs.slice(0, known).map(function (round) {
        if (changedIds.indexOf(round.id) === -1) return round;
        return { id: round.id, label: round.label, pairs: (pairsValue() || {})[round.id] || round.pairs };
      });
      var extra = print.pairs.slice(known).map(function (round) { return round.pairs; });
      mountPairs(merged, extra.length ? extra : newRoundsValue().map(function (r) { return r.pairs; }));
    }
  }

  // --- The questions of a talk-only activity (Closer), tier by tier,
  // inside one fold: read only, the steps stay the designer's.
  function mountTalk(tiers) {
    if (!el.talkSection) return;
    el.talkHolder.textContent = '';
    if (!Array.isArray(tiers) || !tiers.length) { el.talkSection.hidden = true; return; }
    el.talkSection.hidden = false;
    tiers.forEach(function (tier) {
      var block = document.createElement('div');
      block.className = 'talk-tier';
      if (tier.name) {
        var head = document.createElement('h3');
        head.textContent = tier.name;
        block.appendChild(head);
      }
      var list = document.createElement('ol');
      (tier.questions || []).forEach(function (q) {
        var item = document.createElement('li');
        item.textContent = q;
        list.appendChild(item);
      });
      block.appendChild(list);
      el.talkHolder.appendChild(block);
    });
  }

  // --- The pairs panel (2026-09-13): a matching activity's rounds, each
  // pair on two planks with an x, a "+ pair" per round. Read back into the
  // edits by step id; the fit keeps rounds the teacher edited.
  function mountPairs(rounds, newRounds) {
    if (!el.pairsSection) return;
    state.pairBoxes = {};
    state.newRoundBoxes = [];
    el.pairsHolder.textContent = '';
    if (!Array.isArray(rounds) || !rounds.length) { el.pairsSection.hidden = true; return; }
    el.pairsSection.hidden = false;
    rounds.forEach(function (round) {
      var block = roundBlock(round.id, rounds.length > 1 ? round.label : 'Pairs', round.pairs, false);
      el.pairsHolder.appendChild(block);
    });
    // New rounds ("+ round"): kept through a fitted redraw
    (newRounds || []).forEach(function (pairs) { addNewRound(pairs); });
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'pair-add pair-add-round';
    more.textContent = '+ round';
    more.title = 'One more round of pairs, same timer and points as the last';
    more.addEventListener('click', function () {
      var block = addNewRound([{ left: '', right: '' }]);
      var first = block.querySelector('.pair-input');
      if (first) first.focus();
      scheduleMap();
    });
    el.pairsHolder.appendChild(more);
  }

  // A round of pairs: label, the rows, "+ pair"; a NEW round carries a
  // "drop this round" too and its boxes live in state.newRoundBoxes
  function roundBlock(id, labelText, pairs, isNew) {
    var block = document.createElement('div');
    block.className = 'pair-round' + (isNew ? ' pair-round-new' : '');
    if (id) block.setAttribute('data-round', id);
    var head = document.createElement('div');
    head.className = 'pair-round-head';
    var label = document.createElement('span');
    label.className = 'pair-round-label';
    label.textContent = labelText;
    head.appendChild(label);
    block.appendChild(head);
    var list = document.createElement('div');
    list.className = 'pair-list';
    block.appendChild(list);
    var boxes = [];
    if (isNew) state.newRoundBoxes.push(boxes);
    else state.pairBoxes[id] = boxes;
    pairs.forEach(function (p) { addPairRow(boxes, list, p.left, p.right); });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'pair-add';
    add.textContent = '+ pair';
    add.addEventListener('click', function () {
      var row = addPairRow(boxes, list, '', '');
      row.left.focus();
    });
    block.appendChild(add);
    if (isNew) {
      var drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'pair-x pair-round-drop';
      drop.textContent = '×';
      drop.setAttribute('aria-label', 'Drop this round');
      drop.title = 'Drop this round';
      drop.addEventListener('click', function () {
        var i = state.newRoundBoxes.indexOf(boxes);
        if (i !== -1) state.newRoundBoxes.splice(i, 1);
        block.remove();
        renumberNewRounds();
        scheduleMap();
      });
      head.appendChild(drop);
    }
    return block;
  }

  function addNewRound(pairs) {
    var n = Object.keys(state.pairBoxes).length + state.newRoundBoxes.length + 1;
    var block = roundBlock(null, 'Round ' + n, pairs, true);
    var more = el.pairsHolder.querySelector('.pair-add-round');
    if (more) el.pairsHolder.insertBefore(block, more);
    else el.pairsHolder.appendChild(block);
    return block;
  }

  function renumberNewRounds() {
    var base = Object.keys(state.pairBoxes).length;
    Array.from(el.pairsHolder.querySelectorAll('.pair-round-new .pair-round-label')).forEach(function (l, i) {
      l.textContent = 'Round ' + (base + i + 1);
    });
  }

  function addPairRow(boxes, list, left, right) {
    var row = document.createElement('div');
    row.className = 'pair-row';
    var l = document.createElement('input');
    l.type = 'text';
    l.className = 'pair-input';
    l.value = left;
    l.setAttribute('aria-label', 'Left half of the pair');
    l.maxLength = 120;
    var eq = document.createElement('span');
    eq.className = 'pair-eq';
    eq.textContent = '=';
    eq.setAttribute('aria-hidden', 'true');
    var r = document.createElement('input');
    r.type = 'text';
    r.className = 'pair-input';
    r.value = right;
    r.setAttribute('aria-label', 'Right half of the pair');
    r.maxLength = 120;
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'pair-x';
    x.textContent = '×';
    x.setAttribute('aria-label', 'Drop this pair');
    var entry = { left: l, right: r };
    x.addEventListener('click', function () {
      var i = boxes.indexOf(entry);
      if (i !== -1) boxes.splice(i, 1);
      row.remove();
      scheduleMap();
    });
    l.addEventListener('input', scheduleMap);
    r.addEventListener('input', scheduleMap);
    row.appendChild(l);
    row.appendChild(eq);
    row.appendChild(r);
    row.appendChild(x);
    list.appendChild(row);
    boxes.push(entry);
    return entry;
  }

  // The pairs as typed, by step id (null when the panel is not up)
  function pairsValue() {
    var ids = Object.keys(state.pairBoxes);
    if (!ids.length) return null;
    var out = {};
    ids.forEach(function (id) {
      out[id] = state.pairBoxes[id]
        .map(function (b) { return { left: b.left.value.trim(), right: b.right.value.trim() }; })
        .filter(function (p) { return p.left && p.right; });
    });
    return out;
  }

  // The rounds the teacher added, in order, each with its non-empty pairs
  function newRoundsValue() {
    return (state.newRoundBoxes || []).map(function (boxes) {
      return { pairs: boxes
        .map(function (b) { return { left: b.left.value.trim(), right: b.right.value.trim() }; })
        .filter(function (p) { return p.left && p.right; }) };
    }).filter(function (r) { return r.pairs.length > 0; });
  }

  // Rounds whose pairs differ from the template's
  function changedPairRounds() {
    var now = pairsValue();
    if (!now || !state.print || !Array.isArray(state.print.pairs)) return [];
    return state.print.pairs.filter(function (round) {
      return JSON.stringify(now[round.id] || null) !== JSON.stringify(round.pairs);
    }).map(function (round) { return { id: round.id, pairs: now[round.id] || [] }; });
  }

  // Back from the simulator or the projector: the browser restores this
  // page from its cache with the "Opening…" card still up (a Live Poll
  // run got stuck on "Your words are in", 2026-09-13). Clear it.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted && state.busy) clearOpening();
  });

  // --- The edits, read off the page
  function currentEdits() {
    var edits = {};
    if (state.promptBox) edits.prompt = state.promptBox.value;
    var fields = {};
    var any = false;
    Object.keys(state.fieldBoxes).forEach(function (k) { fields[k] = state.fieldBoxes[k].value; any = true; });
    if (any) edits.fields = fields;
    if (state.print && state.print.timerEditable && typeof state.timer === 'number') edits.timer = state.timer;
    var pairs = pairsValue();
    if (pairs) edits.pairs = pairs;
    var newRounds = newRoundsValue();
    if (newRounds.length) edits.newRounds = newRounds;
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
    // Which door, and whether the class fit was used first (a fit question
    // answered, or a recipe's own settings touched); never which activity
    if (window.Analytics) {
      Analytics.track('activity_opened', {
        dest: dest === 'simulate' ? 'try' : dest === 'host' ? 'host' : 'designer',
        page: 'make',
        edited: answeredQuestions().length > 0 ||
          !!(state.panelApi && ((state.panelApi.touched && state.panelApi.touched()) || state.panelApi.makeCopy))
      });
    }
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
        // "See how it reads" already fitted this exact copy: open that one
        if (withAi && state.fitted && state.fitted.key === fitKey()) {
          setOpening(dest, false);
          return saveAndGo(state.fitted.config, dest);
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
    // The words the teacher typed on the print are theirs, word for word:
    // the AI fits everything else to them AND to the answers (a Snowball
    // run rewrote the new question to match the answers, 2026-09-13)
    // Only the words the teacher actually CHANGED are fixed: an untouched
    // question is the template's, and the fit may reword it to the answers
    // (a Live Poll run answered the choices question with a new question
    // and expected it at the top, 2026-09-13)
    var fixed = [];
    var stepId = state.print && state.print.phaseId;
    if (state.promptBox && stepId && promptChanged()) {
      fixed.push('The teacher wrote the question in step "' + stepId + '" themselves: "' + state.promptBox.value.trim() + '". Keep it word for word.');
    }
    var labels = changedFieldLabels().map(function (t) { return '"' + t + '"'; });
    if (labels.length && stepId) {
      fixed.push('They also wrote these field labels in step "' + stepId + '" themselves: ' + labels.join(', ') + '. Keep them word for word.');
    }
    // Pairs the teacher edited are theirs too (untouched rounds are the AI's to fit)
    changedPairRounds().forEach(function (r) {
      fixed.push('The teacher wrote the pairs in step "' + r.id + '" themselves: ' + r.pairs.map(function (p) { return p.left + ' = ' + p.right; }).join('; ') + '. Keep them word for word.');
    });
    // Rounds the teacher added are theirs entirely (they sit after the last
    // round in the copy, as roundN)
    var added = newRoundsValue();
    if (added.length) {
      fixed.push('The teacher added ' + added.length + ' more round' + (added.length > 1 ? 's' : '') + ' of pairs themselves (the last match steps): ' +
        added.map(function (r) { return r.pairs.map(function (p) { return p.left + ' = ' + p.right; }).join('; '); }).join(' | ') + '. Keep those pairs word for word.');
    }
    var request = 'A teacher is adapting this ready-made activity for their own class. ' +
      (fixed.length ? fixed.join(' ') + ' ' : '') +
      'Rewrite ONLY the other teacher- and student-facing words (name, description, the other prompts, messages, choices, reveal templates) so they fit ' +
      (fixed.length ? 'that question and ' : '') + 'their answers below. ' +
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
