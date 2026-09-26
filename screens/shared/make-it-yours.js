// Make it yours: the copy-and-tailor flow behind every "Make it yours"
// button (the yard's cards, the yard's ?customize= deep link, and since
// 2026-09-07 the home page's popup, in place). One module so the dialog is
// the same everywhere: load the activity, offer the setup knobs and the
// class picker, ask the AI's few tailoring questions, reword the copy,
// save it, then Launch (try it out with pretend students, or host it) or
// continue in the designer.
//
//   MakeItYours.open(game, btn)      // game: {id, name}; btn shows "Loading…"
//   MakeItYours.seedIds(ids)         // ids already taken (a copy's id is deduped)
//
// Needs on the page: /shared/dialog.js, /shared/make-it-yours-doors.js,
// /shared/setup-knobs.js, /shared/teacher-profile.js, /shared/growing-text.js,
// /shared/speech-input.js, /shared/activity-prefs.js, /shared/my-games.js,
// and /shared/make-it-yours.css.
//
// Extracted from screens/library/library.js on 2026-09-07 (history there).
(function () {
  var Recents = (window.ActivityPrefs && ActivityPrefs.Recents) || { add: function () {} };

  // Ids already in use, so a copy's id never collides: seeded by the yard
  // (it has the list), refreshed from the server whenever a flow starts.
  // The dialog's text boxes get the corner mic where speech is supported.
  // Per dialog, not page-wide: the home page's join-code box should not
  // grow one (the yard and the designer sweep their whole page anyway).
  function micsIn(modal) {
    if (!window.Speech || !Speech.isSupported() || !modal.querySelectorAll) return;
    var nodes = modal.querySelectorAll('textarea, input[type="text"]');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].dataset.micAttached && !nodes[i].disabled) Speech.attachMic(nodes[i]);
    }
  }

  var knownIds = [];
  function seedIds(ids) { if (Array.isArray(ids)) knownIds = ids.slice(); }
  // Every id on the server rides back as `ids` on the scoped list
  // (2026-09-20); it used to read the whole list as an array, which the
  // route never sent, so this refresh silently did nothing.
  function refreshKnownIds() {
    return fetch('/api/games?mine=' + encodeURIComponent((window.MyGames ? MyGames.list() : []).join(',')))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.ids)) knownIds = data.ids.slice();
      })
      .catch(function () { /* keep what we have */ });
  }

// Clone a built-in into this teacher's own editable copy, then open the
// editor on it. The copy is device-scoped like any user creation.
// Save a finished copy config as this device's activity and open the editor.
// Save the teacher's copy, then go where they said: the designer (Simple
// view), the simulator, or a live host room (`dest`, see COPY_DOORS).
function saveCopyAndReturn(config, dest) {
  delete config.featured; // the copy is yours, not the public front door's
  var base = (config.name || 'my-activity').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 40) || 'my-activity';
  var existing = knownIds.slice();
  var copyId = base;
  var counter = 2;
  while (existing.indexOf(copyId) !== -1) { copyId = base + '-' + counter; counter++; }
  return fetch('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: copyId, config: config })
  }).then(function (resp) {
    if (!resp.ok) {
      return resp.json().catch(function () { return {}; }).then(function (d) {
        throw new Error(d.error || 'save failed');
      });
    }
    if (window.MyGames) MyGames.add(copyId);
    Recents.add(copyId);
    window.location.href = copyDestinationUrl(dest, copyId);
  });
}

// The doors at the bottom of every Make it yours dialog: since 2026-09-07
// a preferred path (a bigger Launch that opens Try it out / Host it now,
// beside a smaller Continue setup in the designer), one shared module for
// this page and the Create page (/shared/make-it-yours-doors.js). One
// pick handler receives the destination: designer | simulate | host.
function makeItYoursDoors(onPick) {
  return MakeItYoursDoors.build(onPick, { busyLabel: 'Making your copy…' });
}

// Where a finished copy (or, untouched, the original) goes next.
function copyDestinationUrl(dest, id) {
  var q = encodeURIComponent(id);
  if (dest === 'simulate') return '/prototype?game=' + q;
  // The projector address carries the console tab's nonce when Host
  // opened one (shared/host-launch.js)
  if (dest === 'host') return window.HostLaunch ? HostLaunch.hostUrl(id) : '/host?game=' + q;
  return '/designer/edit?game=' + q + '&from=library';
}

// Open the editor on a copy WITHOUT saving it: the config rides over in
// sessionStorage and the editor persists it on the first real edit. Used
// by the zero-interaction Customize path, where the teacher hasn't chosen
// anything yet; the dialog paths (answers, knobs, quiz/bluff panels) keep
// saving eagerly because filling those in IS editing.
function openDraftCopy(config) {
  delete config.featured; // the copy is yours, not the public front door's
  try {
    sessionStorage.setItem('lanyard-pending-copy', JSON.stringify(config));
  } catch (e) {
    // Storage unavailable (private mode quota): fall back to the old
    // save-first flow rather than losing the Customize click.
    return saveCopyAndReturn(config);
  }
  window.location.href = '/designer/edit?draft=copy&from=library';
}

// Recompile a recipe-born config with new params. The source config's
// card metadata (name, description, tags...) always wins; phases, the
// provenance stamp, and family come from the fresh compile. Rejects with
// the first compile diagnostic so dialogs can show it as-is.
function compileWorkingConfig(config, params) {
  return fetch('/api/recipes/' + encodeURIComponent(config.recipe.id) + '/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: params })
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok || !d.config) {
        var diag = d.diagnostics && d.diagnostics[0] && d.diagnostics[0].message;
        throw new Error(diag || d.error || 'could not apply your settings');
      }
      var working = {};
      Object.keys(config).forEach(function (k) { working[k] = config[k]; });
      working.phases = d.config.phases;
      working.recipe = d.config.recipe;
      if (d.config.family != null) working.family = d.config.family;
      // Sample answers are bound to steps: a recompile can drop the step
      // they answer (Doodle Bluff in teacher mode has no phrases step), so
      // they follow the fresh compile, never the source card.
      if (d.config.sampleAnswers != null) working.sampleAnswers = d.config.sampleAnswers;
      else delete working.sampleAnswers;
      return working;
    });
  });
}

// The quiz Customize panel (recipes with setupPanel:"quiz", e.g. Speed
// Quiz): the questions ARE the content, so instead of the generic
// words-tailoring interview the teacher gets the actual question list,
// editable in place, plus a topic box that has the AI write fresh ones.
// Every question shows its ✓ answer; nothing is saved until the teacher
// has the list in front of them (the wrong-facts review gate).
function showQuizCustomizeDialog(game, config, recipeSummary, mount, opts) {
  opts = opts || {};
  var stamp = config.recipe;
  var questions = JSON.parse(JSON.stringify(stamp.params.questions || []));
  // The topic the questions were last written for: it names the quiz on
  // the projector when the title is still the template's ("Warm-up quiz"
  // over a robotics quiz, a reviewer, 2026-09-26)
  var writtenTopic = '';
  function titleFor(params) {
    if (!writtenTopic) return params.title;
    var templateTitle = String((stamp.params && stamp.params.title) || '');
    if (params.title && params.title !== templateTitle) return params.title;
    var t = writtenTopic.trim().replace(/[.!?]+$/, '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : params.title;
  }
  // The page under the panel follows the list: the print above and the
  // map below redraw from these questions (opts.onChange, the make page)
  var changeTimer = null;
  function notifyChange() {
    if (!mount || typeof opts.onChange !== 'function') return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(function () {
      var cleaned = cleanedList();
      if (!cleaned.length || SetupKnobs.validateQuizList(cleaned).length) return;
      var params = { questions: cleaned };
      var title = titleFor(JSON.parse(JSON.stringify(stamp.params)));
      if (title) params.title = title;
      opts.onChange(params);
    }, 400);
  }
  var paceKnobs = SetupKnobs.knobsFor(recipeSummary, stamp).filter(function (k) {
    return k.kind !== 'count'; // the visible list IS the count
  });

  var LABEL_CSS = 'display:block; font-weight:700; margin:12px 0 6px; font-family:"DM Sans", Arial, sans-serif; color:#2A2620;';
  var INPUT_CSS = 'padding:9px 12px 7px; border:none; background:#EAD9BA; background-image:repeating-linear-gradient(92deg, rgba(110,75,40,0.10) 0 1px, transparent 1px 6px); border-bottom:3px dashed rgba(110,75,40,0.45); font-family:"DM Sans", Arial, sans-serif; font-size:0.95rem; font-weight:500; color:#2A2620; box-sizing:border-box;';

  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '640px';
  modal.style.maxHeight = '88vh';
  modal.style.overflowY = 'auto';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Make it yours';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Your copy of “' + game.name + '”. Keep these questions, adjust them, or have new ones written for your topic.';
  modal.appendChild(subtitle);
  if (!mount) renderClassPicker(modal);

  // --- Topic row: AI writes fresh questions ---
  var topicLabel = document.createElement('label');
  topicLabel.style.cssText = LABEL_CSS;
  topicLabel.textContent = 'Want new questions? Give a topic:';
  modal.appendChild(topicLabel);

  var topicRow = document.createElement('div');
  topicRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  var topicInput = GrowingText.create({
    css: 'flex:1; min-width:200px; ' + INPUT_CSS,
    placeholder: 'e.g. fractions, the water cycle, Spanish past tense'
  });
  topicRow.appendChild(topicInput);

  var countLabel = document.createElement('label');
  countLabel.style.cssText = 'font-weight:700; font-family:"DM Sans", Arial, sans-serif; white-space:nowrap;';
  countLabel.textContent = 'How many:';
  topicRow.appendChild(countLabel);
  var countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = 1;
  countInput.max = 20;
  countInput.value = Math.max(1, questions.length);
  countInput.style.cssText = 'width:70px; ' + INPUT_CSS;
  topicRow.appendChild(countInput);

  var writeBtn = document.createElement('button');
  writeBtn.type = 'button';
  writeBtn.className = 'recipe-cancel-btn';
  writeBtn.textContent = 'Write my questions';
  topicRow.appendChild(writeBtn);
  modal.appendChild(topicRow);

  var status = document.createElement('p');
  status.className = 'template-picker-subtitle';
  status.style.marginTop = '10px';
  status.hidden = true;
  modal.appendChild(status);

  // --- The question list, always visible and editable ---
  var listHeading = document.createElement('p');
  listHeading.className = 'template-picker-subtitle';
  listHeading.style.fontWeight = '800';
  listHeading.style.marginTop = '14px';
  modal.appendChild(listHeading);

  var listHint = document.createElement('p');
  listHint.className = 'template-picker-subtitle';
  listHint.textContent = 'Check every answer. Tap ○ to mark the right choice, ✕ to drop one.';
  modal.appendChild(listHint);

  var listWrap = document.createElement('div');
  listWrap.style.cssText = 'max-height:320px; overflow-y:auto; padding-right:4px; margin-top:6px;';
  modal.appendChild(listWrap);

  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'recipe-cancel-btn';
  addBtn.textContent = '+ Add a question';
  addBtn.style.marginTop = '8px';
  addBtn.addEventListener('click', function () {
    if (questions.length >= 20) return;
    questions.push({ question: '', choices: ['', '', '', ''], correct: '' });
    renderQuestions();
    var inputs = listWrap.querySelectorAll('[data-role="question"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  });
  modal.appendChild(addBtn);

  listWrap.addEventListener('input', notifyChange);
  function renderQuestions() {
    notifyChange();
    listWrap.textContent = '';
    listHeading.textContent = 'The questions (' + questions.length + '):';
    addBtn.disabled = questions.length >= 20;
    questions.forEach(function (q, qi) {
      var card = document.createElement('div');
      card.style.cssText = 'background:#FDF9F0; box-shadow: 0 2px 3px rgba(50,35,15,0.16); padding:10px 12px; margin-bottom:10px;';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px;';
      var headText = document.createElement('strong');
      headText.style.cssText = 'font-family:"DM Sans", Arial, sans-serif; flex:1;';
      headText.textContent = 'Question ' + (qi + 1);
      head.appendChild(headText);
      var qRemove = document.createElement('button');
      qRemove.type = 'button';
      qRemove.textContent = '✕';
      qRemove.title = 'Drop this question';
      qRemove.setAttribute('aria-label', 'Drop question ' + (qi + 1));
      qRemove.style.cssText = 'border:none; background:none; cursor:pointer; font-size:1rem; font-weight:800; color:#221E1C; opacity:0.6;';
      qRemove.addEventListener('click', function () {
        questions.splice(qi, 1);
        renderQuestions();
      });
      head.appendChild(qRemove);
      card.appendChild(head);

      var qInput = GrowingText.create({
        css: 'width:100%; margin-bottom:6px; ' + INPUT_CSS,
        value: q.question || '',
        placeholder: 'The question',
        maxLength: 300
      });
      qInput.setAttribute('data-role', 'question');
      qInput.addEventListener('input', function () { q.question = qInput.value; });
      card.appendChild(qInput);

      q.choices.forEach(function (choice, ci) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:4px;';

        var mark = document.createElement('button');
        mark.type = 'button';
        var isCorrect = choice !== '' && q.correct === choice;
        mark.textContent = isCorrect ? '✓' : '○';
        mark.title = isCorrect ? 'The correct answer' : 'Mark as the correct answer';
        mark.setAttribute('aria-label', 'Mark choice ' + (ci + 1) + ' of question ' + (qi + 1) + ' as correct');
        mark.style.cssText = 'border:none; background:none; cursor:pointer; font-size:1.05rem; font-weight:800; width:26px; color:' + (isCorrect ? '#1B7F3B' : '#221E1C') + '; opacity:' + (isCorrect ? '1' : '0.45') + ';';
        mark.addEventListener('click', function () {
          q.correct = q.choices[ci];
          renderQuestions();
        });
        row.appendChild(mark);

        var cInput = GrowingText.create({
          css: 'flex:1; ' + INPUT_CSS,
          value: choice,
          placeholder: 'Choice ' + (ci + 1),
          maxLength: 200
        });
        cInput.addEventListener('input', function () {
          // Editing the marked choice keeps the ✓ on it (blank rows are
          // never silently marked: '' matches every other blank).
          if (q.choices[ci] !== '' && q.correct === q.choices[ci]) q.correct = cInput.value;
          q.choices[ci] = cInput.value;
        });
        row.appendChild(cInput);

        if (q.choices.length > 2) {
          var cRemove = document.createElement('button');
          cRemove.type = 'button';
          cRemove.textContent = '✕';
          cRemove.title = 'Drop this choice';
          cRemove.setAttribute('aria-label', 'Drop choice ' + (ci + 1) + ' of question ' + (qi + 1));
          cRemove.style.cssText = 'border:none; background:none; cursor:pointer; font-weight:800; color:#221E1C; opacity:0.4;';
          cRemove.addEventListener('click', function () {
            if (q.correct === q.choices[ci]) q.correct = '';
            q.choices.splice(ci, 1);
            renderQuestions();
          });
          row.appendChild(cRemove);
        }
        card.appendChild(row);
      });

      if (q.choices.length < 6) {
        var addChoice = document.createElement('button');
        addChoice.type = 'button';
        addChoice.textContent = '+ choice';
        addChoice.style.cssText = 'border:none; background:none; cursor:pointer; font-family:"DM Sans", Arial, sans-serif; font-weight:700; color:#221E1C; opacity:0.6; padding:2px 0 0 32px;';
        addChoice.addEventListener('click', function () {
          q.choices.push('');
          renderQuestions();
        });
        card.appendChild(addChoice);
      }

      listWrap.appendChild(card);
    });
  }
  renderQuestions();

  // --- Pace knobs (timer, speed bonus) ---
  var knobInputs = [];
  paceKnobs.forEach(function (knob) {
    if (knob.kind === 'boolean') {
      var boolLabel = document.createElement('label');
      boolLabel.style.cssText = LABEL_CSS + ' cursor:pointer;';
      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = knob.value === true;
      check.style.cssText = 'margin-right:8px; width:18px; height:18px; vertical-align:middle;';
      boolLabel.appendChild(check);
      boolLabel.appendChild(document.createTextNode(knob.label));
      if (knob.helper) boolLabel.title = knob.helper;
      modal.appendChild(boolLabel);
      knobInputs.push({ knob: knob, getValue: function (el) {
        return function () { return el.checked; };
      }(check) });
    } else {
      var numLabel = document.createElement('label');
      numLabel.style.cssText = LABEL_CSS;
      numLabel.textContent = knob.label +
        (knob.min != null && knob.max != null ? ' (' + knob.min + '–' + knob.max + ')' : '');
      if (knob.helper) numLabel.title = knob.helper;
      modal.appendChild(numLabel);
      var num = document.createElement('input');
      num.type = 'number';
      if (knob.min != null) num.min = knob.min;
      if (knob.max != null) num.max = knob.max;
      num.value = knob.value;
      num.style.cssText = 'width:120px; ' + INPUT_CSS;
      modal.appendChild(num);
      knobInputs.push({ knob: knob, getValue: function (el, k) {
        return function () {
          var n = parseInt(el.value, 10);
          if (isNaN(n)) return k.value;
          if (k.min != null && n < k.min) n = k.min;
          if (k.max != null && n > k.max) n = k.max;
          return n;
        };
      }(num, knob) });
    }
  });

  // --- Actions: the three doors (makeCopy below gets the pick) ---
  var doors = mount ? { setDisabled: function () {} } : makeItYoursDoors(makeCopy);
  if (!mount) modal.appendChild(doors.row);

  function showStatus(text) {
    status.hidden = false;
    status.textContent = text;
  }

  // Trim question rows the way the save will see them: empty choices
  // fall away, everything trimmed.
  function cleanedList() {
    return questions.map(function (q) {
      var choices = q.choices.map(function (c) { return String(c).trim(); })
        .filter(function (c) { return c.length > 0; });
      return {
        question: String(q.question || '').trim(),
        choices: choices,
        correct: String(q.correct || '').trim()
      };
    });
  }

  writeBtn.addEventListener('click', function () {
    var topic = topicInput.value.trim();
    if (topic.length < 3) {
      showStatus('Give a topic first, a few words is plenty.');
      topicInput.focus();
      return;
    }
    var n = parseInt(countInput.value, 10);
    if (isNaN(n) || n < 1) n = 5;
    if (n > 20) n = 20;
    writeBtn.disabled = true;
    doors.setDisabled(true);
    writeBtn.textContent = 'Writing…';
    showStatus('Writing ' + n + ' questions about "' + topic + '", this can take ~20 seconds.');
    fetch('/api/games/quiz-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        count: n,
        classDescription: window.TeacherProfile ? TeacherProfile.describe() : ''
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok || result.data.error || !Array.isArray(result.data.questions)) {
          throw new Error(result.data.error || 'no questions came back');
        }
        questions = result.data.questions;
        writtenTopic = topic;
        renderQuestions();
        showStatus('Written. Fix or drop anything that looks wrong, then host it.');
        listWrap.scrollTop = 0;
      })
      .catch(function (err) {
        showStatus('Could not write questions: ' + err.message);
      })
      .then(function () {
        writeBtn.disabled = false;
        doors.setDisabled(false);
        writeBtn.textContent = 'Write my questions';
      });
  });

  function makeCopy(dest, extras) {
    var cleaned = cleanedList();
    var problems = SetupKnobs.validateQuizList(cleaned);
    if (problems.length > 0) {
      showStatus(problems.slice(0, 2).join(' '));
      return false;
    }
    doors.setDisabled(true);
    writeBtn.disabled = true;
    showStatus('Building your copy…');
    var params = JSON.parse(JSON.stringify(stamp.params));
    params.questions = cleaned;
    knobInputs.forEach(function (ki) { params[ki.knob.name] = ki.getValue(); });
    var quizTitle = titleFor(params);
    if (quizTitle) params.title = quizTitle;
    return compileWorkingConfig(config, params)
      .then(function (working) {
        working.name = game.name + ' (my version)';
        if (extras && typeof extras.anonymous === 'boolean') working.anonymous = extras.anonymous;
        // Early-bird joke is on by default: on drops a `false`, off writes one.
        if (extras && typeof extras.earlyJoke === 'boolean') {
          if (extras.earlyJoke) { if (working.earlyJoke === false) delete working.earlyJoke; }
          else working.earlyJoke = false;
        }
        return saveCopyAndReturn(working, dest);
      })
      .catch(function (err) {
        doors.setDisabled(false);
        writeBtn.disabled = false;
        showStatus('Could not make your copy: ' + err.message);
      });
  }

  if (mount) {
    title.remove();
    subtitle.remove();
    modal.className = 'template-picker-modal make-panel';
    modal.style.maxWidth = '';
    modal.style.maxHeight = '';
    modal.style.overflowY = '';
    // On the page the list is the page: no box scrolling inside the scroll
    listWrap.style.maxHeight = 'none';
    listWrap.style.overflowY = 'visible';
    mount.appendChild(modal);
    micsIn(modal);
    return { makeCopy: makeCopy };
  }
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Make it yours' });
  micsIn(modal);
  topicInput.focus();
}

// The bluff Customize panel (recipes with setupPanel:"bluff", Trivia
// Bluff): where do the facts come from? Three doors: the AI finds facts
// live during the game (the classic), the AI writes a reviewable list
// now, or the teacher writes their own. The two prepared doors share one
// editable fact list; nothing is saved until the teacher has the list in
// front of them (the wrong-facts review gate, same as the quiz panel).
function showBluffCustomizeDialog(game, config, recipeSummary, mount) {
  var stamp = config.recipe;
  var questions = JSON.parse(JSON.stringify(stamp.params.questions || []));
  var knobs = SetupKnobs.knobsFor(recipeSummary, stamp);
  var roundsKnob = null;
  var lieTimerKnob = null;
  knobs.forEach(function (k) {
    if (k.name === 'rounds') roundsKnob = k;
    if (k.name === 'lieTimer') lieTimerKnob = k;
  });

  var LABEL_CSS = 'display:block; font-weight:700; margin:12px 0 6px; font-family:"DM Sans", Arial, sans-serif; color:#2A2620;';
  var INPUT_CSS = 'padding:9px 12px 7px; border:none; background:#EAD9BA; background-image:repeating-linear-gradient(92deg, rgba(110,75,40,0.10) 0 1px, transparent 1px 6px); border-bottom:3px dashed rgba(110,75,40,0.45); font-family:"DM Sans", Arial, sans-serif; font-size:0.95rem; font-weight:500; color:#2A2620; box-sizing:border-box;';

  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '640px';
  modal.style.maxHeight = '88vh';
  modal.style.overflowY = 'auto';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Make it yours';
  modal.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.className = 'template-picker-subtitle';
  subtitle.textContent = 'Your copy of “' + game.name + '”. Choose where the fill-in-the-blank facts come from.';
  modal.appendChild(subtitle);
  if (!mount) renderClassPicker(modal);

  // --- The three source doors ---
  var SOURCES = [
    {
      id: 'live',
      title: 'AI picks facts during the game',
      detail: 'Fresh obscure facts every time you play. You see each fact when the class does.'
    },
    {
      id: 'ai-now',
      title: 'AI writes the facts now',
      detail: 'Give a topic, get a fact list you can check and edit before class.'
    },
    {
      id: 'own',
      title: 'I write my own facts',
      detail: 'Fill-in-the-blank facts with the real answer, written by you.'
    }
  ];
  var selectedSource = (stamp.params.questionSource === 'prepared' && questions.length > 0)
    ? 'own' : 'live';

  var sourceRow = document.createElement('div');
  sourceRow.setAttribute('role', 'radiogroup');
  sourceRow.setAttribute('aria-label', 'Where the facts come from');
  sourceRow.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-top:10px;';
  var sourceButtons = {};
  SOURCES.forEach(function (src) {
    var card = document.createElement('button');
    card.type = 'button';
    card.setAttribute('role', 'radio');
    card.style.cssText = 'text-align:left; cursor:pointer; border:none; background:#FDF9F0; box-shadow: 0 2px 3px rgba(50,35,15,0.18); padding:10px 12px; font-family:"DM Sans", Arial, sans-serif;';
    var cardTitle = document.createElement('strong');
    cardTitle.textContent = src.title;
    card.appendChild(cardTitle);
    var cardDetail = document.createElement('span');
    cardDetail.style.cssText = 'display:block; font-weight:600; opacity:0.75; font-size:0.9rem; margin-top:2px;';
    cardDetail.textContent = src.detail;
    card.appendChild(cardDetail);
    card.addEventListener('click', function () {
      selectedSource = src.id;
      renderSourceState();
    });
    sourceButtons[src.id] = card;
    sourceRow.appendChild(card);
  });
  modal.appendChild(sourceRow);

  // --- Live section: how many rounds ---
  var liveSection = document.createElement('div');
  var roundsLabel = document.createElement('label');
  roundsLabel.style.cssText = LABEL_CSS;
  roundsLabel.textContent = (roundsKnob ? roundsKnob.label : 'How many rounds') +
    (roundsKnob && roundsKnob.min != null ? ' (' + roundsKnob.min + '–' + roundsKnob.max + ')' : '');
  if (roundsKnob && roundsKnob.helper) roundsLabel.title = roundsKnob.helper;
  liveSection.appendChild(roundsLabel);
  var roundsInput = document.createElement('input');
  roundsInput.type = 'number';
  roundsInput.min = roundsKnob && roundsKnob.min != null ? roundsKnob.min : 1;
  roundsInput.max = roundsKnob && roundsKnob.max != null ? roundsKnob.max : 6;
  roundsInput.value = roundsKnob ? roundsKnob.value : 3;
  roundsInput.style.cssText = 'width:120px; ' + INPUT_CSS;
  liveSection.appendChild(roundsInput);
  modal.appendChild(liveSection);

  // --- Topic section (AI writes now) ---
  var topicSection = document.createElement('div');
  var topicLabel = document.createElement('label');
  topicLabel.style.cssText = LABEL_CSS;
  topicLabel.textContent = 'What should the facts be about?';
  topicSection.appendChild(topicLabel);
  var topicRow = document.createElement('div');
  topicRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
  var topicInput = GrowingText.create({
    css: 'flex:1; min-width:200px; ' + INPUT_CSS,
    placeholder: 'e.g. ocean animals, ancient Rome, anything surprising'
  });
  topicRow.appendChild(topicInput);
  var countLabel = document.createElement('label');
  countLabel.style.cssText = 'font-weight:700; font-family:"DM Sans", Arial, sans-serif; white-space:nowrap;';
  countLabel.textContent = 'How many:';
  topicRow.appendChild(countLabel);
  var countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = 1;
  countInput.max = 10;
  countInput.value = Math.min(10, Math.max(1, questions.length || 3));
  countInput.style.cssText = 'width:70px; ' + INPUT_CSS;
  topicRow.appendChild(countInput);
  var writeBtn = document.createElement('button');
  writeBtn.type = 'button';
  writeBtn.className = 'recipe-cancel-btn';
  writeBtn.textContent = 'Write my facts';
  topicRow.appendChild(writeBtn);
  topicSection.appendChild(topicRow);
  modal.appendChild(topicSection);

  var status = document.createElement('p');
  status.className = 'template-picker-subtitle';
  status.style.marginTop = '10px';
  status.hidden = true;
  modal.appendChild(status);

  // --- The fact list, editable in place (both prepared doors) ---
  var listSection = document.createElement('div');
  var listHeading = document.createElement('p');
  listHeading.className = 'template-picker-subtitle';
  listHeading.style.fontWeight = '800';
  listHeading.style.marginTop = '14px';
  listSection.appendChild(listHeading);
  var listHint = document.createElement('p');
  listHint.className = 'template-picker-subtitle';
  listHint.textContent = 'Each fact is a sentence with a blank shown as ___ plus the real answer. The decoy is one extra wrong choice, mixed in with student lies.';
  listSection.appendChild(listHint);
  var listWrap = document.createElement('div');
  listWrap.style.cssText = 'max-height:320px; overflow-y:auto; padding-right:4px; margin-top:6px;';
  listSection.appendChild(listWrap);
  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'recipe-cancel-btn';
  addBtn.textContent = '+ Add a fact';
  addBtn.style.marginTop = '8px';
  addBtn.addEventListener('click', function () {
    if (questions.length >= 10) return;
    questions.push({ question: '', truth: '', houseLie: '' });
    renderQuestions();
    var inputs = listWrap.querySelectorAll('[data-role="question"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  });
  listSection.appendChild(addBtn);
  modal.appendChild(listSection);

  function renderQuestions() {
    listWrap.textContent = '';
    listHeading.textContent = 'The facts (' + questions.length + '):';
    addBtn.disabled = questions.length >= 10;
    questions.forEach(function (q, qi) {
      var card = document.createElement('div');
      card.style.cssText = 'background:#FDF9F0; box-shadow: 0 2px 3px rgba(50,35,15,0.16); padding:10px 12px; margin-bottom:10px;';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px;';
      var headText = document.createElement('strong');
      headText.style.cssText = 'font-family:"DM Sans", Arial, sans-serif; flex:1;';
      headText.textContent = 'Fact ' + (qi + 1);
      head.appendChild(headText);
      var qRemove = document.createElement('button');
      qRemove.type = 'button';
      qRemove.textContent = '✕';
      qRemove.title = 'Drop this fact';
      qRemove.setAttribute('aria-label', 'Drop fact ' + (qi + 1));
      qRemove.style.cssText = 'border:none; background:none; cursor:pointer; font-size:1rem; font-weight:800; color:#221E1C; opacity:0.6;';
      qRemove.addEventListener('click', function () {
        questions.splice(qi, 1);
        renderQuestions();
      });
      head.appendChild(qRemove);
      card.appendChild(head);

      var qInput = GrowingText.create({
        css: 'width:100%; margin-bottom:6px; ' + INPUT_CSS,
        value: q.question || '',
        placeholder: 'A sentence with a blank shown as ___',
        maxLength: 300
      });
      qInput.setAttribute('data-role', 'question');
      qInput.addEventListener('input', function () { q.question = qInput.value; });
      card.appendChild(qInput);

      var answerRow = document.createElement('div');
      answerRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
      var truthWrap = document.createElement('label');
      truthWrap.style.cssText = 'flex:1; min-width:140px; font-weight:700; font-size:0.85rem; font-family:"DM Sans", Arial, sans-serif;';
      truthWrap.appendChild(document.createTextNode('The real answer'));
      var truthInput = GrowingText.create({
        css: 'width:100%; margin-top:2px; ' + INPUT_CSS,
        value: q.truth || '',
        placeholder: 'e.g. dog',
        maxLength: 100
      });
      truthInput.addEventListener('input', function () { q.truth = truthInput.value; });
      truthWrap.appendChild(truthInput);
      answerRow.appendChild(truthWrap);
      var lieWrap = document.createElement('label');
      lieWrap.style.cssText = 'flex:1; min-width:140px; font-weight:700; font-size:0.85rem; font-family:"DM Sans", Arial, sans-serif;';
      lieWrap.appendChild(document.createTextNode('Decoy (optional)'));
      var lieInput = GrowingText.create({
        css: 'width:100%; margin-top:2px; ' + INPUT_CSS,
        value: q.houseLie || '',
        placeholder: 'e.g. chicken',
        maxLength: 100
      });
      lieInput.addEventListener('input', function () { q.houseLie = lieInput.value; });
      lieWrap.appendChild(lieInput);
      answerRow.appendChild(lieWrap);
      card.appendChild(answerRow);

      listWrap.appendChild(card);
    });
  }
  renderQuestions();

  // --- Lie timer (applies to every source) ---
  var timerLabel = document.createElement('label');
  timerLabel.style.cssText = LABEL_CSS;
  timerLabel.textContent = (lieTimerKnob ? lieTimerKnob.label : 'Lie-writing time (seconds)') +
    (lieTimerKnob && lieTimerKnob.min != null ? ' (' + lieTimerKnob.min + '–' + lieTimerKnob.max + ')' : '');
  if (lieTimerKnob && lieTimerKnob.helper) timerLabel.title = lieTimerKnob.helper;
  modal.appendChild(timerLabel);
  var timerInput = document.createElement('input');
  timerInput.type = 'number';
  timerInput.min = lieTimerKnob && lieTimerKnob.min != null ? lieTimerKnob.min : 15;
  timerInput.max = lieTimerKnob && lieTimerKnob.max != null ? lieTimerKnob.max : 180;
  timerInput.value = lieTimerKnob ? lieTimerKnob.value : 45;
  timerInput.style.cssText = 'width:120px; ' + INPUT_CSS;
  modal.appendChild(timerInput);

  function renderSourceState() {
    SOURCES.forEach(function (src) {
      var card = sourceButtons[src.id];
      var on = selectedSource === src.id;
      card.setAttribute('aria-checked', on ? 'true' : 'false');
      // Totem selection: the inset ink ring, never a color change
      card.style.boxShadow = on
        ? '0 2px 3px rgba(50,35,15,0.18), inset 0 0 0 3px #2A2620'
        : '0 2px 3px rgba(50,35,15,0.18)';
      card.style.opacity = on ? '1' : '0.85';
    });
    liveSection.hidden = selectedSource !== 'live';
    topicSection.hidden = selectedSource !== 'ai-now';
    listSection.hidden = selectedSource === 'live';
  }
  renderSourceState();

  // --- Actions: the three doors (makeCopy below gets the pick) ---
  var doors = mount ? { setDisabled: function () {} } : makeItYoursDoors(makeCopy);
  if (!mount) modal.appendChild(doors.row);

  function showStatus(text) {
    status.hidden = false;
    status.textContent = text;
  }

  function clampedInt(el, min, max, fallback) {
    var n = parseInt(el.value, 10);
    if (isNaN(n)) return fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  // Trim fact rows the way the save will see them; the houseLie key is
  // always present because the recipe template reads ${item.houseLie}.
  function cleanedList() {
    return questions.map(function (q) {
      return {
        question: String(q.question || '').trim(),
        truth: String(q.truth || '').trim(),
        houseLie: String(q.houseLie || '').trim()
      };
    });
  }

  writeBtn.addEventListener('click', function () {
    var topic = topicInput.value.trim();
    if (topic.length < 3) {
      showStatus('Give a topic first, a few words is plenty.');
      topicInput.focus();
      return;
    }
    var n = clampedInt(countInput, 1, 10, 3);
    writeBtn.disabled = true;
    doors.setDisabled(true);
    writeBtn.textContent = 'Writing…';
    showStatus('Writing ' + n + ' facts about "' + topic + '", this can take ~20 seconds.');
    fetch('/api/games/bluff-facts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic,
        count: n,
        classDescription: window.TeacherProfile ? TeacherProfile.describe() : ''
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok || result.data.error || !Array.isArray(result.data.questions)) {
          throw new Error(result.data.error || 'no facts came back');
        }
        questions = result.data.questions;
        renderQuestions();
        showStatus('Check every fact before you save, fix or drop anything that looks wrong.');
        listWrap.scrollTop = 0;
      })
      .catch(function (err) {
        showStatus('Could not write facts: ' + err.message);
      })
      .then(function () {
        writeBtn.disabled = false;
        doors.setDisabled(false);
        writeBtn.textContent = 'Write my facts';
      });
  });

  function makeCopy(dest, extras) {
    var params = JSON.parse(JSON.stringify(stamp.params));
    if (selectedSource === 'live') {
      params.questionSource = 'live';
      params.rounds = clampedInt(roundsInput,
        roundsKnob && roundsKnob.min != null ? roundsKnob.min : 1,
        roundsKnob && roundsKnob.max != null ? roundsKnob.max : 6,
        roundsKnob ? roundsKnob.value : 3);
    } else {
      var cleaned = cleanedList();
      var problems = SetupKnobs.validateBluffList(cleaned);
      if (problems.length > 0) {
        showStatus(problems.slice(0, 2).join(' '));
        return false;
      }
      params.questionSource = 'prepared';
      params.questions = cleaned;
    }
    params.lieTimer = clampedInt(timerInput,
      lieTimerKnob && lieTimerKnob.min != null ? lieTimerKnob.min : 15,
      lieTimerKnob && lieTimerKnob.max != null ? lieTimerKnob.max : 180,
      lieTimerKnob ? lieTimerKnob.value : 45);
    doors.setDisabled(true);
    writeBtn.disabled = true;
    showStatus('Building your copy…');
    return compileWorkingConfig(config, params)
      .then(function (working) {
        working.name = game.name + ' (my version)';
        if (extras && typeof extras.anonymous === 'boolean') working.anonymous = extras.anonymous;
        // Early-bird joke is on by default: on drops a `false`, off writes one.
        if (extras && typeof extras.earlyJoke === 'boolean') {
          if (extras.earlyJoke) { if (working.earlyJoke === false) delete working.earlyJoke; }
          else working.earlyJoke = false;
        }
        return saveCopyAndReturn(working, dest);
      })
      .catch(function (err) {
        doors.setDisabled(false);
        writeBtn.disabled = false;
        showStatus('Could not make your copy: ' + err.message);
      });
  }

  if (mount) {
    title.remove();
    subtitle.remove();
    modal.className = 'template-picker-modal make-panel';
    modal.style.maxWidth = '';
    modal.style.maxHeight = '';
    modal.style.overflowY = '';
    mount.appendChild(modal);
    micsIn(modal);
    return { makeCopy: makeCopy };
  }
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Make it yours' });
  micsIn(modal);
}

function customizeCopy(game, btn) {
  refreshKnownIds();
  // Deliberately NOT Recents.add(game.id) here: clicking Customize is
  // opening-to-look, and looking must leave no trace in the yard (field
  // feedback 2026-08-24). The original enters recents only via Preview/
  // Host clicks; a copy enters the yard only once it's actually saved.
  btn.disabled = true;
  btn.textContent = 'Loading…';
  var configPromise = fetch('/api/games/' + encodeURIComponent(game.id))
    .then(function (resp) {
      if (!resp.ok) throw new Error('could not load the activity');
      return resp.json();
    });
  // Recipe-born games (config.recipe provenance stamp) get setup knobs in
  // the dialog: instant, no-AI controls like "how many questions". Best-
  // effort: recipe missing/broken/version-drifted = no knobs, flow as before.
  var recipePromise = configPromise.then(function (config) {
    var stamp = config && config.recipe;
    if (!stamp || typeof stamp.id !== 'string' || !window.SetupKnobs) return null;
    return fetch('/api/recipes/' + encodeURIComponent(stamp.id))
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  });
  // A few AI questions tailor the copy before the editor opens. Best-effort:
  // no questions (error, budget, mock hiccup) = plain copy, like before.
  // Waits on the recipe summary so games with a dedicated setup panel
  // never spend this AI call (their panel owns the content).
  var questionsPromise = Promise.all([configPromise, recipePromise]).then(function (parts) {
    var config = parts[0];
    if (window.SetupKnobs && parts[1] && SetupKnobs.panelFor(parts[1], config.recipe)) {
      return { questions: [] };
    }
    // Labels of the setup knobs this dialog already renders (round count,
    // timers...) ride along so the AI never asks about a setting the
    // teacher can see a control for (trivia-bluff's rounds knob, 2026-08-16).
    var knobs = (window.SetupKnobs && parts[1])
      ? SetupKnobs.knobsFor(parts[1], config.recipe) : [];
    return fetch('/api/games/customize-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config,
        // The saved class profile rides along so the questions build on it
        // instead of re-asking grade and subject.
        classDescription: window.TeacherProfile ? TeacherProfile.describe() : '',
        // The class picker sits in the dialog itself, so grade and subject
        // are settings with a visible control: never re-asked.
        knownSettings: ['Grade band', 'Subjects'].concat((knobs || []).map(function (k) { return k.label; }))
      })
    }).then(function (r) { return r.ok ? r.json() : { questions: [] }; })
      .catch(function () { return { questions: [] }; });
  });
  Promise.all([configPromise, questionsPromise, recipePromise])
    .then(function (parts) {
      btn.disabled = false;
      btn.textContent = 'Make it yours';
      var config = parts[0];
      var summary = parts[2];
      // A recipe with a dedicated panel (quiz) owns the whole dialog: the
      // questions ARE the content, so the generic words-tailoring flow
      // (which can rewrite choices out from under a correct answer) is
      // skipped entirely for these games.
      // The page (2026-09-09): what your class will see, the question
      // editable in place, one red TRY IT; a recipe's setup panel (quiz,
      // bluff) mounts under the doors. The dialogs stay behind a flag.
      if (!window.MAKE_IT_YOURS_DIALOG) {
        var fromPage = /^\/(library|designer)?/.exec(window.location.pathname);
        var from = window.location.pathname === '/' || window.location.pathname === '' ? 'home'
          : (fromPage && fromPage[1] === 'designer') ? 'designer' : 'library';
        window.location.href = '/make?game=' + encodeURIComponent(game.id) + '&from=' + from;
        return;
      }
      var panel = (window.SetupKnobs && summary)
        ? SetupKnobs.panelFor(summary, config.recipe) : null;
      if (panel === 'quiz') {
        return showQuizCustomizeDialog(game, config, summary);
      }
      if (panel === 'bluff') {
        return showBluffCustomizeDialog(game, config, summary);
      }
      var questions = (parts[1] && parts[1].questions) || [];
      var knobs = (window.SetupKnobs && summary)
        ? SetupKnobs.knobsFor(summary, config.recipe) : [];
      if (questions.length === 0 && knobs.length === 0) {
        // Nothing to ask: the teacher hasn't chosen anything yet, so hand
        // the editor an UNSAVED draft. The copy is only created (and only
        // then joins the yard) on their first real edit over there.
        config.name = game.name + ' (my version)';
        return openDraftCopy(config);
      }
      showCustomizeDialog(game, config, questions, knobs);
    })
    .catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Make it yours';
      alert('Could not make your copy: ' + err.message);
    });
}

// The tailoring dialog: setup knobs first (instant, no AI — question count,
// timers), then the AI questions. Answer what you like (or skip); the AI
// rewrites the copy's WORDS — structure only changes through the knobs'
// recipe recompile (the revise endpoint validates).
function showCustomizeDialog(game, config, questions, knobs, mount) {
  knobs = knobs || [];
  var overlay = document.createElement('div');
  overlay.className = 'template-picker-overlay';
  var modal = document.createElement('div');
  modal.className = 'template-picker-modal';
  modal.style.maxWidth = '560px';

  var title = document.createElement('h2');
  title.className = 'template-picker-title';
  title.textContent = 'Make it yours';
  modal.appendChild(title);

  var LABEL_CSS = 'display:block; font-weight:700; margin:12px 0 6px; font-family:"DM Sans", Arial, sans-serif; color:#2A2620;';
  var INPUT_CSS = 'padding:11px 14px 9px; border:none; background:#EAD9BA; background-image:repeating-linear-gradient(92deg, rgba(110,75,40,0.10) 0 1px, transparent 1px 6px); border-bottom:3px dashed rgba(110,75,40,0.45); font-family:"DM Sans", Arial, sans-serif; font-size:0.95rem; font-weight:500; color:#2A2620; box-sizing:border-box;';

  // --- Setup knobs (recipe-born games only): rows of chips ---
  // Every knob is ONE row, the question then the answer (2026-09-14,
  // owner: "the bar doesn't need to take up the whole width, it could
  // also be multiple choice"): a switch or a pick is a row of chips, a
  // small count is a row of numbers, names are chips with "Type your
  // own", a list is one box per item (each with a picker for the name it
  // belongs to when the recipe says so), and the old textarea / topic box
  // stay for lines and text. A knob can hide behind another's value
  // (setup.showWhen). knobInputs entries carry the row and a value reader.
  var knobInputs = [];
  var knobsHeading = null;
  if (knobs.length > 0) {
    knobsHeading = document.createElement('p');
    knobsHeading.className = 'template-picker-subtitle';
    knobsHeading.style.fontWeight = '800';
    knobsHeading.textContent = 'Set it up:';
    modal.appendChild(knobsHeading);

    var knobRows = document.createElement('div');
    knobRows.className = 'knob-rows';
    modal.appendChild(knobRows);

    var CHIP_MAX = 10; // more values than this = a number box, not chips

    function knobChip(text, pressed, dashed) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'knob-chip' + (dashed ? ' is-dashed' : '');
      b.textContent = text;
      b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      return b;
    }

    function knobRowEl(knob) {
      var row = document.createElement('div');
      row.className = 'knob-row knob-row-' + knob.kind;
      var q = document.createElement('span');
      q.className = 'knob-q';
      q.textContent = knob.label;
      row.appendChild(q);
      var a = document.createElement('div');
      a.className = 'knob-a';
      row.appendChild(a);
      row.a = a;
      return row;
    }

    function helpLine(text) {
      var p = document.createElement('p');
      p.className = 'knob-help';
      p.textContent = text || '';
      p.hidden = !text;
      return p;
    }

    // A chip row over fixed values (a switch, a pick, a small count): the
    // pressed chip is the value; the help line is the picked value's
    // (valueHelp), never all of them at once (owner, 2026-09-13)
    function chipPick(entry, values, labelFor, helpFor) {
      var current = entry.knob.value;
      var chips = [];
      var help = helpLine(helpFor(current));
      values.forEach(function (v) {
        var chip = knobChip(labelFor(v), String(v) === String(current));
        chip.addEventListener('click', function () {
          current = v;
          chips.forEach(function (c) { c.el.setAttribute('aria-pressed', String(c.v) === String(current) ? 'true' : 'false'); });
          help.textContent = helpFor(current) || '';
          help.hidden = !help.textContent;
          refreshKnobRows();
        });
        chips.push({ v: v, el: chip });
        entry.row.a.appendChild(chip);
      });
      entry.row.a.appendChild(help);
      entry.getValue = function () { return current; };
    }

    knobs.forEach(function (knob) {
      var input;
      var row = knobRowEl(knob);
      knobRows.appendChild(row);
      var entry = { knob: knob, row: row, input: null, getValue: null };
      knobInputs.push(entry);
      var labels = knob.valueLabels || {};
      var helpFor = function (v) { return (knob.valueHelp && knob.valueHelp[String(v)]) || knob.helper || ''; };

      if (knob.kind === 'boolean') {
        chipPick(entry, [true, false], function (v) {
          return labels[String(v)] || (v ? 'On' : 'Off');
        }, helpFor);
      } else if (knob.kind === 'enum') {
        chipPick(entry, knob.values || [], function (v) {
          return labels[String(v)] || String(v);
        }, helpFor);
      } else if ((knob.kind === 'integer' || knob.kind === 'count') &&
                 knob.min != null && knob.max != null && knob.max - knob.min + 1 <= CHIP_MAX) {
        var nums = [];
        for (var n = knob.min; n <= knob.max; n++) nums.push(n);
        chipPick(entry, nums, function (v) { return String(v); }, function () { return knob.helper || ''; });
      } else if (knob.kind === 'tags') {
        // Names as chips: the suggestions, the stamped names among them,
        // any other stamped name after; "Type your own" adds one. The
        // value is the pressed chips in row order (the first names fill
        // the smallest groups, so the order is the one on the page).
        var names = knob.suggestions.slice();
        knob.value.forEach(function (v) { if (names.indexOf(v) === -1) names.push(v); });
        var tagChips = [];
        var tagHelp = helpLine(knob.helper);
        var tagNote = helpLine('');
        var addChip = knobChip('Type your own…', false, true);
        var addBox = document.createElement('input');
        addBox.type = 'text';
        addBox.className = 'knob-plank knob-plank-short';
        addBox.maxLength = 40;
        addBox.placeholder = 'A job, then Enter';
        addBox.setAttribute('aria-label', 'Type your own');
        addBox.dataset.micAttached = 'skip'; // a short name, no mic
        addBox.hidden = true;
        var pressedCount = function () {
          return tagChips.filter(function (c) { return c.el.getAttribute('aria-pressed') === 'true'; }).length;
        };
        var addTag = function (name, pressed) {
          var chip = knobChip(name, pressed);
          chip.addEventListener('click', function () {
            var on = chip.getAttribute('aria-pressed') === 'true';
            if (!on && knob.max != null && pressedCount() >= knob.max) {
              tagNote.textContent = 'That is the most, ' + knob.max + '. Take one off to add another.';
              tagNote.hidden = false;
              return;
            }
            tagNote.hidden = true;
            chip.setAttribute('aria-pressed', on ? 'false' : 'true');
            refreshKnobRows();
          });
          tagChips.push({ name: name, el: chip });
          row.a.insertBefore(chip, addChip);
        };
        row.a.appendChild(addChip);
        names.forEach(function (name) { addTag(name, knob.value.indexOf(name) !== -1); });
        row.a.appendChild(addBox);
        row.a.appendChild(tagHelp);
        row.a.appendChild(tagNote);
        addChip.addEventListener('click', function () {
          addBox.hidden = false;
          addBox.focus();
        });
        var commitTag = function () {
          var name = addBox.value.trim().replace(/:+$/, '').trim();
          if (!name) return;
          var have = null;
          tagChips.forEach(function (c) { if (c.name.toLowerCase() === name.toLowerCase()) have = c; });
          if (have) {
            have.el.setAttribute('aria-pressed', 'true');
          } else if (knob.max != null && pressedCount() >= knob.max) {
            tagNote.textContent = 'That is the most, ' + knob.max + '. Take one off to add another.';
            tagNote.hidden = false;
            return;
          } else {
            addTag(name, true);
          }
          addBox.value = '';
          refreshKnobRows();
        };
        addBox.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); commitTag(); }
          if (e.key === 'Escape') { addBox.value = ''; addBox.hidden = true; addChip.focus(); }
        });
        addBox.addEventListener('blur', function () {
          commitTag();
          if (!addBox.value) addBox.hidden = true;
        });
        entry.getValue = function () {
          return tagChips.filter(function (c) { return c.el.getAttribute('aria-pressed') === 'true'; })
            .map(function (c) { return c.name; });
        };
      } else if (knob.kind === 'list') {
        // One box per item, an × on each, "+ Add" under them; with
        // tagFrom, a picker beside each box tags the item with one of that
        // knob's names ("Recorder: write it down" on the wire, the name
        // shown in the picker, never typed twice)
        var listHolder = document.createElement('div');
        listHolder.className = 'knob-list';
        row.a.appendChild(listHolder);
        var addItem = document.createElement('button');
        addItem.type = 'button';
        addItem.className = 'knob-chip is-dashed knob-add';
        addItem.textContent = '+ Add one';
        row.a.appendChild(addItem);
        row.a.appendChild(helpLine(knob.helper));
        var tagNames = [];
        var tagsOn = false;
        var itemRows = [];
        var sourceKnob = null;
        knobs.forEach(function (k) { if (knob.tagFrom && k.name === knob.tagFrom) sourceKnob = k; });
        if (sourceKnob) tagNames = sourceKnob.value.slice();

        var fillPicker = function (sel, keep) {
          sel.textContent = '';
          var none = document.createElement('option');
          none.value = '';
          none.textContent = knob.tagLabel;
          sel.appendChild(none);
          tagNames.forEach(function (name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            sel.appendChild(opt);
          });
          sel.value = keep && tagNames.indexOf(keep) !== -1 ? keep : '';
        };
        var addRow = function (text, tag, focus) {
          var line = document.createElement('div');
          line.className = 'knob-item';
          // A box that grows with its line (a long task wraps, never
          // clips); Enter never breaks the line, it adds the next box
          var box;
          if (window.GrowingText) {
            box = GrowingText.create({ value: text || '', maxLength: 200, placeholder: 'A task' });
          } else {
            box = document.createElement('input');
            box.type = 'text';
            box.value = text || '';
            box.maxLength = 200;
            box.placeholder = 'A task';
          }
          box.className = 'knob-plank';
          box.setAttribute('aria-label', 'Task');
          box.dataset.micAttached = 'skip'; // one line each, no mic per row
          line.appendChild(box);
          var sel = null;
          if (knob.tagFrom) {
            sel = document.createElement('select');
            sel.className = 'knob-tag';
            sel.setAttribute('aria-label', 'Whose task');
            fillPicker(sel, tag);
            sel.hidden = !tagsOn;
            sel.addEventListener('change', refreshKnobRows);
            line.appendChild(sel);
          }
          var x = document.createElement('button');
          x.type = 'button';
          x.className = 'knob-x';
          x.textContent = '×';
          x.setAttribute('aria-label', 'Remove this one');
          line.appendChild(x);
          var item = { line: line, box: box, sel: sel };
          if (focus && focus.after) {
            var at = itemRows.indexOf(focus.after);
            itemRows.splice(at + 1, 0, item);
            listHolder.insertBefore(line, focus.after.line.nextSibling);
          } else {
            itemRows.push(item);
            listHolder.appendChild(line);
          }
          box.addEventListener('input', refreshKnobRows);
          box.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); addRow('', null, { after: item }).box.focus(); }
          });
          x.addEventListener('click', function () {
            itemRows.splice(itemRows.indexOf(item), 1);
            line.remove();
            if (itemRows.length === 0) addRow('', null);
            refreshKnobRows();
          });
          return item;
        };
        knob.value.forEach(function (v) {
          var parts = SetupKnobs.splitTag(v, tagNames);
          addRow(parts.text, parts.tag);
        });
        if (itemRows.length === 0) addRow('', null);
        addItem.addEventListener('click', function () { addRow('', null).box.focus(); });
        // The boxes measured themselves before the page's font arrived
        // (a wider fallback wraps a one-line task onto two): fit them
        // again once it has, and whenever the column changes width
        var refit = function () {
          if (!window.GrowingText) return;
          itemRows.forEach(function (it) { if (it.box.tagName === 'TEXTAREA') GrowingText.fit(it.box); });
        };
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
        window.addEventListener('resize', refit);

        // The names to tag with, or null when the source knob is hidden
        // (no jobs = no pickers, and the items save untagged)
        entry.setTags = function (names) {
          tagsOn = Array.isArray(names);
          var next = tagsOn ? names.slice() : tagNames;
          var changed = JSON.stringify(next) !== JSON.stringify(tagNames);
          tagNames = next;
          itemRows.forEach(function (it) {
            if (!it.sel) return;
            if (changed) fillPicker(it.sel, it.sel.value);
            it.sel.hidden = !tagsOn;
          });
          row.classList.toggle('tags-off', !tagsOn);
        };
        entry.getValue = function () {
          return itemRows.map(function (it) {
            return SetupKnobs.joinTag(tagsOn && it.sel ? it.sel.value : null, it.box.value);
          }).filter(function (s) { return s.length > 0; });
        };
      } else if (knob.kind === 'lines') {
        input = document.createElement('textarea');
        input.rows = 8;
        input.className = 'knob-plank';
        input.value = (knob.value || []).join('\n');
        row.a.appendChild(input);
        row.a.appendChild(helpLine(knob.helper));
        entry.input = input;
        entry.getValue = function () {
          return input.value.split('\n').map(function (s) { return s.trim(); })
            .filter(function (s) { return s.length > 0; });
        };
      } else if (knob.kind === 'text') {
        input = document.createElement('input');
        input.type = 'text';
        input.className = 'knob-plank';
        input.value = knob.value || '';
        input.maxLength = 200;
        row.a.appendChild(input);
        entry.input = input;
        entry.getValue = function () { return input.value.trim(); };
        // writes: the AI writes a list on this topic into another knob
        // (Doodle Bluff: pick "ai" and the phrases appear, editable). Runs
        // by itself the first time the list is empty and this knob shows;
        // the button runs it again.
        if (knob.writes) {
          var writeRow = document.createElement('div');
          writeRow.className = 'knob-write';
          var writeBtn = document.createElement('button');
          writeBtn.type = 'button';
          writeBtn.className = 'recipe-cancel-btn';
          writeBtn.textContent = knob.writes.button || 'Write them';
          writeRow.appendChild(writeBtn);
          var writeNote = document.createElement('span');
          writeNote.className = 'knob-help';
          writeRow.appendChild(writeNote);
          row.a.appendChild(writeRow);
          entry.writeBtn = writeBtn;
          entry.writeNote = writeNote;
          entry.run = function () {
            var target = null;
            knobInputs.forEach(function (t) { if (t.knob.name === knob.writes.list) target = t; });
            if (!target || !target.input || entry.writing) return;
            var topic = input.value.trim();
            if (topic.length < 3) { writeNote.textContent = 'Give a topic first, a few words is plenty.'; input.focus(); return; }
            var n = knob.writes.count || 20;
            entry.writing = true;
            entry.ran = true;
            writeBtn.disabled = true;
            writeNote.textContent = 'Writing ' + n + ' about "' + topic + '"…';
            fetch('/api/games/phrase-list', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ topic: topic, count: n, classDescription: window.TeacherProfile ? TeacherProfile.describe() : '' })
            })
              .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
              .then(function (result) {
                if (!result.ok || result.data.error || !Array.isArray(result.data.phrases)) {
                  throw new Error(result.data.error || 'nothing came back');
                }
                target.input.value = result.data.phrases.join('\n');
                target.input.dispatchEvent(new Event('input', { bubbles: true }));
                writeNote.textContent = 'Read them over and change any you like.';
              })
              .catch(function (err) { writeNote.textContent = 'Could not write them: ' + err.message; })
              .then(function () { entry.writing = false; writeBtn.disabled = false; });
          };
          writeBtn.addEventListener('click', entry.run);
        }
        row.a.appendChild(helpLine(knob.helper));
      } else {
        // count + integer over a long range share a number box
        input = document.createElement('input');
        input.type = 'number';
        input.className = 'knob-plank knob-plank-short';
        if (knob.min != null) input.min = knob.min;
        if (knob.max != null) input.max = knob.max;
        input.value = knob.value;
        input.setAttribute('aria-label', knob.label);
        row.a.appendChild(input);
        if (knob.min != null && knob.max != null) {
          row.a.appendChild(helpLine(knob.min + ' to ' + knob.max + (knob.helper ? '. ' + knob.helper : '')));
        } else {
          row.a.appendChild(helpLine(knob.helper));
        }
        entry.input = input;
        entry.getValue = function () {
          var v = parseInt(input.value, 10);
          if (isNaN(v)) return knob.value; // blank/garbage = leave it alone
          if (knob.min != null && v < knob.min) v = knob.min;
          if (knob.max != null && v > knob.max) v = knob.max;
          return v;
        };
      }
    });

    // showWhen: re-check which rows show whenever any knob changes; a list
    // knob's pickers follow its source knob (the names, or none while it
    // is hidden)
    function refreshKnobRows() {
      var values = {};
      knobInputs.forEach(function (ki) { values[ki.knob.name] = ki.getValue(); });
      knobInputs.forEach(function (ki) {
        ki.row.hidden = !SetupKnobs.knobVisible(ki.knob, values);
      });
      knobInputs.forEach(function (ki) {
        if (!ki.setTags) return;
        var src = null;
        knobInputs.forEach(function (t) { if (t.knob.name === ki.knob.tagFrom) src = t; });
        ki.setTags(src && !src.row.hidden ? values[src.knob.name] : null);
      });
      // A writer knob that just came into view writes the list once by
      // itself (the teacher picked "ai": the phrases appear) when the list
      // is empty or still the template's own; a list the teacher typed is
      // theirs, the button rewrites it on request
      knobInputs.forEach(function (ki) {
        if (!ki.run || ki.row.hidden || ki.ran) return;
        var target = null;
        knobInputs.forEach(function (t) { if (t.knob.name === ki.knob.writes.list) target = t; });
        if (!target) return;
        var list = values[ki.knob.writes.list];
        var untouched = JSON.stringify(list) === JSON.stringify(target.knob.value);
        if (Array.isArray(list) && (list.length === 0 || untouched)) ki.run();
      });
    }
    knobInputs.forEach(function (ki) {
      if (!ki.input) return;
      ki.input.addEventListener('change', refreshKnobRows);
      ki.input.addEventListener('input', refreshKnobRows);
    });
    refreshKnobRows();
  }

  // Mounted on the page: only the knobs, handed back as a builder. The
  // page owns the class picker, the questions, and the doors.
  if (mount) {
    title.remove();
    if (knobsHeading) knobsHeading.remove();
    modal.className = 'template-picker-modal make-panel';
    modal.style.maxWidth = '';
    mount.appendChild(modal);
    micsIn(modal);
    return { touched: anyKnobTouched, build: buildWorkingConfig };
  }

  // Only introduce the AI questions when there are any to answer.
  if (questions.length > 0) {
    var subtitle = document.createElement('p');
    subtitle.className = 'template-picker-subtitle';
    subtitle.textContent = 'Answer what you like and we’ll word your copy of “' + game.name + '” for your class. Anything you skip stays as-is.';
    modal.appendChild(subtitle);

    // Who it's for: the saved grade and subjects, changeable right here,
    // so the teacher never wonders whether to repeat them in the answers.
    // Changing them re-asks the AI for questions that fit the new class
    // (a moment after the last pick, or at once on Done).
    renderClassPicker(modal, {
      hint: 'The questions below update to fit your class.',
      onChange: function () {
        clearTimeout(questionsTimer);
        questionsTimer = setTimeout(refreshQuestions, 1500);
      },
      onDone: function () {
        clearTimeout(questionsTimer);
        refreshQuestions();
      }
    });
  }

  var questionsBox = document.createElement('div');
  questionsBox.className = 'customize-questions';
  modal.appendChild(questionsBox);

  var inputs = [];
  // (Re)build the question inputs. Answers already typed survive when the
  // same question comes back, the rest start blank.
  function renderQuestions(list) {
    var typed = {};
    inputs.forEach(function (pair) {
      if (pair.input.value.trim()) typed[pair.question] = pair.input.value;
    });
    questionsBox.textContent = '';
    inputs = [];
    list.forEach(function (q) {
      var label = document.createElement('label');
      label.style.cssText = LABEL_CSS;
      label.textContent = q.question;
      questionsBox.appendChild(label);
      var input = GrowingText.create({
        css: 'width:100%; ' + INPUT_CSS,
        placeholder: q.placeholder || '',
        value: typed[q.question] || ''
      });
      questionsBox.appendChild(input);
      inputs.push({ question: q.question, input: input });
    });
  }
  renderQuestions(questions);

  var status = document.createElement('p');
  status.className = 'template-picker-subtitle';
  status.style.marginTop = '12px';
  status.hidden = true;
  modal.appendChild(status);

  // The class the current questions were written for; a refresh is a
  // no-op while it matches, so Done after a debounced fetch never
  // double-asks.
  var questionsClass = window.TeacherProfile ? TeacherProfile.describe() : '';
  var questionsTimer = null;
  var questionsInFlight = false;
  function refreshQuestions() {
    if (questions.length === 0) return;
    var classDesc = window.TeacherProfile ? TeacherProfile.describe() : '';
    if (classDesc === questionsClass) return;
    if (questionsInFlight) {
      // Picks changed mid-fetch: go again once this one lands.
      clearTimeout(questionsTimer);
      questionsTimer = setTimeout(refreshQuestions, 800);
      return;
    }
    questionsInFlight = true;
    questionsBox.classList.add('customize-questions-stale');
    status.hidden = false;
    status.textContent = classDesc
      ? 'Updating the questions for ' + classDesc + '...'
      : 'Updating the questions...';
    fetch('/api/games/customize-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config,
        classDescription: classDesc,
        knownSettings: ['Grade band', 'Subjects'].concat(knobs.map(function (k) { return k.label; }))
      })
    })
      .then(function (r) { return r.ok ? r.json() : { questions: [] }; })
      .then(function (d) {
        if (Array.isArray(d.questions) && d.questions.length > 0) renderQuestions(d.questions);
        questionsClass = classDesc;
        status.hidden = true;
      })
      .catch(function () {
        status.textContent = 'Could not update the questions, the ones below still work.';
      })
      .finally(function () {
        questionsInFlight = false;
        questionsBox.classList.remove('customize-questions-stale');
        // The class moved on while we were fetching? Catch up.
        var now = window.TeacherProfile ? TeacherProfile.describe() : '';
        if (now !== questionsClass) refreshQuestions();
      });
  }

  var doors = makeItYoursDoors(pickDoor);
  modal.appendChild(doors.row);

  function currentKnobValues() {
    return knobInputs.map(function (ki) {
      return { name: ki.knob.name, kind: ki.knob.kind, value: ki.getValue() };
    });
  }

  function anyKnobTouched() {
    return knobInputs.some(function (ki) {
      var now = ki.getValue();
      if (ki.knob.kind === 'boolean') return now !== ki.knob.value;
      if (ki.knob.kind === 'lines' || ki.knob.kind === 'tags' || ki.knob.kind === 'list') return JSON.stringify(now) !== JSON.stringify(ki.knob.value);
      return String(now) !== String(ki.knob.value);
    });
  }

  // The config the save/revise steps work from: the source config, with
  // phases rebuilt by the recipe compiler when any knob was touched.
  // Untouched knobs never recompile, so a hand-edited copy of a stamped
  // game can't be silently clobbered.
  function buildWorkingConfig() {
    if (knobInputs.length === 0 || !anyKnobTouched()) return Promise.resolve(config);
    var params = SetupKnobs.applyKnobs(config.recipe.params, currentKnobValues());
    // A written list is the teacher's now: the writer knob's `then` sets
    // the params that make the game deal that list (Doodle Bluff: the AI
    // wrote the phrases on this page, so the room runs them as a teacher
    // list; an empty list keeps the AI writing them when the room opens)
    knobInputs.forEach(function (ki) {
      var w = ki.knob.writes;
      if (!w || !w.then || ki.row.hidden) return;
      var target = null;
      knobInputs.forEach(function (t) { if (t.knob.name === w.list) target = t; });
      var list = target ? target.getValue() : [];
      if (Array.isArray(list) && list.length > 0) {
        Object.keys(w.then).forEach(function (k) { params[k] = w.then[k]; });
      }
    });
    return compileWorkingConfig(config, params);
  }

  function saveWorking(working, dest) {
    working.name = game.name + ' (my version)';
    return saveCopyAndReturn(working, dest);
  }

  function fail(text) {
    doors.setDisabled(false);
    status.hidden = false;
    status.textContent = text;
  }

  // No question answered: the copy is the original, with the knobs
  // applied when any was touched.
  function plainCopy(dest) {
    doors.setDisabled(true);
    if (!anyKnobTouched()) {
      // Nothing chosen at all. The designer gets an UNSAVED draft, same
      // rule as the no-dialog path: opening to look leaves no trace in
      // the yard. The simulator and the host screen run the original
      // itself, an untouched copy would be the same activity under a
      // second name.
      if (dest === 'designer') {
        var draft = JSON.parse(JSON.stringify(config));
        draft.name = game.name + ' (my version)';
        return openDraftCopy(draft);
      }
      Recents.add(game.id);
      window.location.href = copyDestinationUrl(dest, game.id);
      return;
    }
    buildWorkingConfig()
      .then(function (working) { return saveWorking(working, dest); })
      .catch(function (err) { fail('Could not make your copy: ' + err.message); });
  }

  // Any door: answers typed = the AI rewords the copy first, then it is
  // saved and the teacher lands at the door they picked.
  function pickDoor(dest) {
    var answered = inputs.filter(function (pair) { return pair.input.value.trim(); });
    if (answered.length === 0) return plainCopy(dest);
    doors.setDisabled(true);
    status.hidden = false;
    status.textContent = 'Rewording the activity for your class, this can take ~20 seconds.';
    buildWorkingConfig()
      .then(function (working) {
        var classDesc = window.TeacherProfile ? TeacherProfile.describe() : '';
        var request = 'A teacher is adapting this ready-made activity for their own class. ' +
          'Rewrite ONLY the teacher- and student-facing words (name, description, prompts, messages, choices, reveal templates) to fit their answers below. ' +
          'Keep every step, the structure, timers, data references, and {{tokens}} exactly as they are.\n\n' +
          (classDesc ? 'Their class: ' + classDesc + '.\n' : '') +
          answered.map(function (pair) {
            return 'Q: ' + pair.question + '\nA: ' + pair.input.value.trim();
          }).join('\n');
        return fetch('/api/games/revise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: working, request: request })
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (result) {
            var d = result.data;
            var structuralErrors = d.structural && d.structural.errors ? d.structural.errors.length : 0;
            if (!result.ok || d.error || !d.updatedConfig || structuralErrors > 0) {
              throw new Error(d.error || (structuralErrors > 0 ? 'the reworded copy had problems' : 'no config returned'));
            }
            var revised = d.updatedConfig;
            if (!revised.name || revised.name === game.name) {
              revised.name = game.name + ' (my version)';
            }
            return saveCopyAndReturn(revised, dest);
          })
          .catch(function (err) {
            // The tailoring is a bonus — never strand the teacher without a
            // copy, and never lose their knob settings with it.
            status.textContent = 'The AI setup didn’t work (' + err.message + '), making your copy without the rewording.';
            setTimeout(function () {
              saveWorking(working, dest).catch(function (saveErr) {
                fail('Could not make your copy: ' + saveErr.message);
              });
            }, 1400);
          });
      })
      .catch(function (err) {
        // The knob recompile failed (bad settings, recipe drift): let the
        // teacher adjust instead of quietly saving something else.
        fail('Could not apply your settings: ' + err.message);
      });
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  Dialog.enhance(overlay, modal, { title: 'Make it yours' });
  micsIn(modal);
  if (inputs.length > 0) inputs[0].input.focus();
}


// The class picker (grade band + subjects, buildChipRow, the "Something
// else" popup) lives in shared/class-picker.js since 2026-09-24, so the
// yard on the home can show the same picker. These delegate to it.
function buildChipRow(options, isPicked, onPick) { return window.ClassPicker.buildChipRow(options, isPicked, onPick); }
function renderClassPicker(container, opts) { return window.ClassPicker.render(container, opts); }
function askOtherSubject(picked, onDone) { return window.ClassPicker.askOtherSubject(picked, onDone); }


  window.MakeItYours = {
    open: customizeCopy,
    seedIds: seedIds,
    renderClassPicker: renderClassPicker,
    buildChipRow: buildChipRow,
    askOtherSubject: askOtherSubject,
    saveCopyAndReturn: saveCopyAndReturn,
    openDraftCopy: openDraftCopy,
    // A recipe's setup panel rendered into a page element (the Make it
    // yours page); returns { makeCopy(dest, extras) }.
    mountPanel: function (panel, game, config, summary, mount, opts) {
      if (panel === 'quiz') return showQuizCustomizeDialog(game, config, summary, mount, opts);
      if (panel === 'bluff') return showBluffCustomizeDialog(game, config, summary, mount);
      if (panel === 'knobs') {
        var knobs = (window.SetupKnobs && summary) ? SetupKnobs.knobsFor(summary, config.recipe) : [];
        if (!knobs.length) return null;
        return showCustomizeDialog(game, config, [], knobs, mount);
      }
      return null;
    }
  };
})();
