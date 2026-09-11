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
    moreBtn: document.getElementById('more-btn'),
    moreHint: document.getElementById('more-hint'),
    moreBody: document.getElementById('more-body'),
    moreQuestions: document.getElementById('more-questions'),
    moreStatus: document.getElementById('more-status'),
    namesHidden: document.getElementById('names-hidden')
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
    answers: {},           // question -> input element
    questionsLoaded: false,
    busy: false,
    panel: null,           // 'quiz' | 'bluff' when the recipe brings its own editor
    panelApi: null         // { makeCopy } from MakeItYours.mountPanel
  };

  function fail(text) {
    el.error.hidden = false;
    el.error.textContent = text;
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

    // Who it is for: the shared class picker, inside More next to the
    // questions it shapes (a pick reloads them, so it visibly does something)
    if (window.MakeItYours && MakeItYours.renderClassPicker) {
      MakeItYours.renderClassPicker(el.classHolder, {
        hint: 'The questions below update to fit your class.',
        onChange: function () { scheduleQuestions(); },
        onDone: function () { scheduleQuestions(true); }
      });
    }

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

    if (config.anonymous) el.namesHidden.checked = true;
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
    if (state.panel === 'knobs') return; // the AI questions still apply
    // The AI's word-tailoring questions would rewrite choices out from
    // under a correct answer: not for these (the dialog skipped them too)
    el.moreQuestions.hidden = true;
    el.moreHint.textContent = 'Your class, student names on or off.';
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

  // --- More: the AI's tailoring questions, fetched the first time it opens
  // (and again when the class changes), plus the names switch.
  var questionsTimer = null;

  el.moreBtn.addEventListener('click', function () {
    var open = el.moreBody.hidden;
    el.moreBody.hidden = !open;
    el.moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var answered = answeredQuestions().length;
    el.moreBtn.textContent = open ? '− Less' : (answered ? '+ More · ' + answered + ' answered' : '+ More');
    el.moreHint.hidden = open;
    if (open && !state.questionsLoaded) loadQuestions();
    // More opens below the fold on a Chromebook: bring it up
    if (open) {
      try { el.moreBtn.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (err) { /* ignore */ }
    }
  });

  function scheduleQuestions(now) {
    clearTimeout(questionsTimer);
    questionsTimer = setTimeout(loadQuestions, now ? 0 : 1500);
  }

  function loadQuestions() {
    if (!state.config) return;
    state.questionsLoaded = true;
    el.moreStatus.hidden = false;
    el.moreStatus.textContent = 'Loading a question or two for your class…';
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
      .then(function (d) { renderQuestions((d && d.questions) || []); });
  }

  function renderQuestions(list) {
    // Answers already typed survive when the same question comes back
    var kept = {};
    Object.keys(state.answers).forEach(function (q) { kept[q] = state.answers[q].value; });
    state.answers = {};
    Array.from(el.moreQuestions.querySelectorAll('.more-q')).forEach(function (n) { n.remove(); });
    state.questions = list;
    if (!list.length) {
      el.moreStatus.hidden = false;
      el.moreStatus.textContent = 'Nothing more to ask for this one. Change the question above, or open it in the designer.';
      return;
    }
    el.moreStatus.hidden = true;
    list.forEach(function (q, i) {
      var wrap = document.createElement('div');
      wrap.className = 'more-q';
      var head = document.createElement('div');
      head.className = 'more-q-head';
      var label = document.createElement('label');
      label.className = 'more-q-label';
      label.textContent = q.question;
      label.htmlFor = 'more-q-' + i;
      var noted = document.createElement('span');
      noted.className = 'more-q-noted';
      noted.textContent = 'Noted';
      head.appendChild(label);
      head.appendChild(noted);
      var input = document.createElement('textarea');
      input.id = 'more-q-' + i;
      input.className = 'more-q-input';
      input.rows = 2;
      input.placeholder = q.placeholder || '';
      input.value = kept[q.question] || '';
      input.addEventListener('input', function () { noteAnswer(wrap, input); });
      wrap.appendChild(head);
      wrap.appendChild(input);
      noteAnswer(wrap, input);
      el.moreQuestions.appendChild(wrap);
      state.answers[q.question] = input;
      if (window.GrowingText && GrowingText.fit) GrowingText.fit(input);
      if (window.Speech && Speech.isSupported && Speech.isSupported() && Speech.attachMic) Speech.attachMic(input);
    });
  }

  // An answered question says so at once, and TRY IT says what the
  // answers will do (the AI reword, and the twenty seconds it costs)
  function noteAnswer(wrap, input) {
    wrap.classList.toggle('answered', input.value.trim().length > 0);
    var n = answeredQuestions().length;
    el.note.hidden = n === 0;
    el.note.textContent = n === 1
      ? 'Your answer is in. TRY IT fits the wording to it, about twenty seconds.'
      : 'Your ' + n + ' answers are in. TRY IT fits the wording to them, about twenty seconds.';
    el.moreBtn.textContent = el.moreBody.hidden ? (n ? '+ More · ' + n + ' answered' : '+ More') : '− Less';
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
    edits.anonymous = !!el.namesHidden.checked;
    return edits;
  }

  function answeredQuestions() {
    return Object.keys(state.answers).filter(function (q) { return state.answers[q].value.trim(); })
      .map(function (q) { return { question: q, answer: state.answers[q].value.trim() }; });
  }

  function destUrl(dest, id) {
    var q = encodeURIComponent(id);
    if (dest === 'simulate') return '/prototype?game=' + q;
    if (dest === 'host') return '/host?game=' + q;
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
    // A recipe panel builds and saves the copy itself (filling it in IS
    // editing, so these always save, as the dialog did)
    if (state.panelApi && state.panelApi.makeCopy) {
      setOpening(dest, false);
      var result = state.panelApi.makeCopy(dest, { anonymous: !!el.namesHidden.checked });
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
          working.name = (state.config.name || 'Activity') + ' (my version)';
          if (typeof edits.anonymous === 'boolean') working.anonymous = edits.anonymous;
          if (!withAi) return MakeItYours.saveCopyAndReturn(working, dest);
          return reword(working, answered).then(function (revised) { return MakeItYours.saveCopyAndReturn(revised, dest); });
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
        if (!changed && !withAi) {
          if (dest === 'designer') {
            working.name = (state.config.name || 'Activity') + ' (my version)';
            return MakeItYours.openDraftCopy(working);
          }
          window.location.href = destUrl(dest, gameId);
          return;
        }
        setOpening(dest, withAi);
        if (!withAi) return MakeItYours.saveCopyAndReturn(working, dest);
        return reword(working, answered).then(function (revised) {
          return MakeItYours.saveCopyAndReturn(revised, dest);
        });
      })
      .catch(function (err) {
        clearOpening();
        fail('Could not make your copy: ' + (err.message || err));
      });
  }

  // The AI rewords the surrounding copy to the More answers (the dialog's
  // request, word for word); a failed reword falls back to the plain copy.
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
        var structuralErrors = d && d.structural && d.structural.errors ? d.structural.errors.length : 0;
        if (!result.ok || !d || d.error || !d.updatedConfig || structuralErrors > 0) return working;
        var revised = d.updatedConfig;
        if (!revised.name || revised.name === state.config.name) revised.name = working.name;
        return revised;
      })
      .catch(function () { return working; });
  }

  el.tryBtn.addEventListener('click', function () { go('simulate'); });
  el.hostBtn.addEventListener('click', function () { go('host'); });
  el.designer.addEventListener('click', function (e) { e.preventDefault(); go('designer'); });
})();
