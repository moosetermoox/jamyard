// class-picker.js — the grade band + subjects picker (2026-09-24, moved
// out of make-it-yours.js so the yard on the home can show it too).
// Every pick saves to TeacherProfile at once (this browser only, no
// account), so the make page's questions and the yard's card examples
// read TeacherProfile.get() at their own time and see the current picks.
//
// Plain script (browser global): window.ClassPicker = { render,
// buildChipRow, askOtherSubject }. Pair it with /shared/class-picker.css.
// Needs teacher-profile.js and dialog.js (the "Something else" popup).
(function () {
  'use strict';

  // A row of toggle chips. Single-select rows repaint their siblings so
  // only one stays lit; multi-select rows just flip the clicked chip.
  function buildChipRow(options, isPicked, onPick) {
    var row = document.createElement('div');
    row.className = 'teacher-setup-chips';
    options.forEach(function (opt) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'setup-chip' + (isPicked(opt.id) ? ' active' : '');
      chip.textContent = opt.label;
      chip.setAttribute('aria-pressed', isPicked(opt.id) ? 'true' : 'false');
      chip.addEventListener('click', function () {
        onPick(opt.id);
        var siblings = row.querySelectorAll('.setup-chip');
        for (var i = 0; i < siblings.length; i++) {
          var lit = isPicked(options[i].id);
          siblings[i].classList.toggle('active', lit);
          siblings[i].setAttribute('aria-pressed', lit ? 'true' : 'false');
        }
      });
      row.appendChild(chip);
    });
    return row;
  }

  // --- Your class, inside Make it yours ----------------------------------
  // The grade band + subjects picker lives in the Customize dialogs (owner
  // call 2026-09-02; it used to be a first-visit card in the yard). Every
  // pick saves to TeacherProfile at once, so the next Customize opens
  // already set, and the submit paths read TeacherProfile.describe() at
  // send time and see the current picks with no plumbing. Opens folded to
  // one line when a class is already saved; open when nothing is yet.
  // opts.onChange fires after every saved pick, opts.onDone when the
  // teacher folds the picker with Done; opts.hint is a line under the head
  // while it is open (the generic dialog says the questions will update).
  // opts.bare (the home's panel, 2026-09-24): no head line, the chip rows
  // always open, the chip in the yard's row is the head. opts.dialog =
  // { overlay, modal } names the page's dialog classes for the
  // "Something else" popup.
  function renderClassPicker(container, opts) {
    opts = opts || {};
    if (!window.TeacherProfile) return;
    var existing = TeacherProfile.get() || { gradeBand: null, subjects: [], otherText: '' };
    var picked = { gradeBand: existing.gradeBand, subjects: existing.subjects.slice(), otherText: existing.otherText || '' };

    var box = document.createElement('div');
    box.className = 'class-picker' + (opts.bare ? ' class-picker-bare' : '');

    var head = document.createElement('div');
    head.className = 'class-picker-head';
    var label = document.createElement('span');
    label.className = 'class-picker-label';
    label.textContent = 'Your class';
    head.appendChild(label);
    var summary = document.createElement('span');
    summary.className = 'class-picker-summary';
    head.appendChild(summary);
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'class-line-change';
    head.appendChild(toggle);
    if (!opts.bare) box.appendChild(head);

    var body = document.createElement('div');
    body.className = 'class-picker-body';
    box.appendChild(body);

    if (opts.hint) {
      var hint = document.createElement('p');
      hint.className = 'class-picker-hint';
      hint.textContent = opts.hint;
      body.appendChild(hint);
    }

    function refreshHead() {
      var desc = TeacherProfile.describe();
      summary.textContent = desc || 'Pick a grade and subjects and the wording fits your class. Optional.';
      summary.classList.toggle('class-picker-empty', !desc);
    }

    function persist() {
      if (!picked.gradeBand && picked.subjects.length === 0) {
        TeacherProfile.clear();
        TeacherProfile.dismiss();
      } else {
        TeacherProfile.save(picked);
      }
      refreshHead();
      if (opts.onChange) opts.onChange();
    }

    function setOpen(open) {
      body.hidden = !open && !opts.bare;
      toggle.textContent = open ? 'Done' : 'Change';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () {
      var closing = !body.hidden;
      setOpen(body.hidden);
      if (closing && opts.onDone) opts.onDone();
    });

    var gradeLabel = document.createElement('p');
    gradeLabel.className = 'teacher-setup-label';
    gradeLabel.textContent = 'Grade band';
    body.appendChild(gradeLabel);
    body.appendChild(buildChipRow(
      TeacherProfile.GRADE_BANDS,
      function (id) { return picked.gradeBand === id; },
      function (id) {
        picked.gradeBand = (picked.gradeBand === id) ? null : id;
        persist();
      }
    ));

    var subjectLabel = document.createElement('p');
    subjectLabel.className = 'teacher-setup-label';
    subjectLabel.textContent = 'Subjects, pick any';
    body.appendChild(subjectLabel);
    body.appendChild(buildChipRow(
      TeacherProfile.SUBJECTS,
      function (id) { return picked.subjects.indexOf(id) !== -1; },
      function (id) {
        var at = picked.subjects.indexOf(id);
        if (at === -1) {
          picked.subjects.push(id);
          if (id === 'other') askOtherSubject(picked, persist, opts.dialog);
        } else {
          picked.subjects.splice(at, 1);
          if (id === 'other') picked.otherText = '';
        }
        persist();
      }
    ));

    refreshHead();
    setOpen(!TeacherProfile.get());
    container.appendChild(box);
  }

  // "Something else" is a blank to fill: a small popup asks what it actually
  // is, so personalization can say "Robotics" instead of "Something else".
  // Closing without typing is fine, the chip stays picked with no text.
  function askOtherSubject(picked, onDone, classes) {
    classes = classes || {};
    var overlay = document.createElement('div');
    overlay.className = classes.overlay || 'template-picker-overlay';
    var modal = document.createElement('div');
    modal.className = (classes.modal || 'template-picker-modal') + ' subject-other-modal';

    var title = document.createElement('h2');
    title.textContent = 'What do you teach?';
    modal.appendChild(title);

    var hint = document.createElement('p');
    hint.className = 'subject-other-hint';
    hint.textContent = 'A word or two is plenty. It helps suggest questions that fit your class.';
    modal.appendChild(hint);

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'subject-other-input';
    input.maxLength = 60;
    input.placeholder = 'Health, music, robotics...';
    input.value = picked.otherText || '';
    modal.appendChild(input);

    var saveRow = document.createElement('div');
    saveRow.className = 'subject-other-save-row';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'teacher-setup-save';
    saveBtn.textContent = 'Save';
    saveRow.appendChild(saveBtn);
    modal.appendChild(saveRow);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    var dlg = Dialog.enhance(overlay, modal, { title: 'What do you teach?' });

    saveBtn.addEventListener('click', function () {
      picked.otherText = input.value.trim();
      dlg.close();
      if (onDone) onDone();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveBtn.click();
    });
    input.focus();
  }

  window.ClassPicker = {
    render: renderClassPicker,
    buildChipRow: buildChipRow,
    askOtherSubject: askOtherSubject
  };
})();
