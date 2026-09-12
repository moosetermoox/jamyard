// The doors that close every Make it yours dialog (owner's call
// 2026-09-07): a preferred path instead of three equal buttons. The
// front row is a smaller "Continue setup in the designer" beside a bigger
// "Launch"; Launch opens the two ways to run the copy, with pretend
// students (Try it out) or with the class (Host it now). Shared by the
// yard's dialogs (library.js) and the Create page's recipe match
// (designer.js); paints live in /shared/make-it-yours-doors.css.
//
//   var doors = MakeItYoursDoors.build(function (dest) { ... },
//     { busyLabel: 'Making your copy…' });   // dest: designer | simulate | host
//   modal.appendChild(doors.row);
//   doors.setDisabled(true);                  // while the copy is made
//
// Every label lands through textContent (teacher copy is still untrusted
// for rendering by rule). No HTML in here.
(function () {
  'use strict';

  var DOORS = {
    designer: {
      label: 'Continue setup in the designer',
      title: 'Save your copy and open it in the editor'
    },
    launch: {
      label: 'Launch',
      title: 'Run it: try it out with pretend students, or host it for your class'
    },
    simulate: {
      label: 'Try it out with pretend students',
      title: 'Save your copy and watch it run with pretend students, no class needed'
    },
    host: {
      label: 'Host it now',
      title: 'Save your copy and start a live room your class can join right now'
    }
  };

  var ASK = 'With pretend students first, or with your class?';
  // Under the front row, so Try it out is not a secret behind Launch
  // (an outside reviewer never found it, 2026-09-12)
  var HINT = 'Launch opens two ways to run it: with pretend students, or with your class.';

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function doorButton(dest) {
    var btn = el('button', 'recipe-create-btn door-' + dest, DOORS[dest].label);
    btn.type = 'button';
    btn.title = DOORS[dest].title;
    return btn;
  }

  function build(onPick, opts) {
    opts = opts || {};
    var busyLabel = typeof opts.busyLabel === 'string' ? opts.busyLabel : null;

    var row = el('div', 'make-it-yours-doors');
    var front = el('div', 'doors-front');
    var designerBtn = doorButton('designer');
    var launchBtn = doorButton('launch');
    launchBtn.setAttribute('aria-expanded', 'false');
    front.appendChild(designerBtn);
    front.appendChild(launchBtn);

    var launchRow = el('div', 'doors-launch');
    launchRow.hidden = true;
    launchRow.appendChild(el('p', 'doors-launch-ask', ASK));
    var simulateBtn = doorButton('simulate');
    var hostBtn = doorButton('host');
    launchRow.appendChild(simulateBtn);
    launchRow.appendChild(hostBtn);

    var hint = el('p', 'doors-launch-hint', HINT);

    row.appendChild(front);
    row.appendChild(hint);
    row.appendChild(launchRow);

    var real = [
      { dest: 'designer', btn: designerBtn },
      { dest: 'simulate', btn: simulateBtn },
      { dest: 'host', btn: hostBtn }
    ];

    function setOpen(open) {
      launchRow.hidden = !open;
      hint.hidden = open; // the open row asks the question itself
      launchBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      launchBtn.className = 'recipe-create-btn door-launch' + (open ? ' is-open' : '');
      if (open && simulateBtn.focus) simulateBtn.focus();
    }

    // Launch chooses nothing by itself: it opens the two ways to run.
    launchBtn.addEventListener('click', function () {
      setOpen(launchRow.hidden);
    });

    real.forEach(function (door) {
      door.btn.addEventListener('click', function () {
        // The picked door says so while the copy is made: the AI
        // rewording can take half a minute and a status line below is
        // easy to miss (owner clicked and saw nothing, 2026-09-06).
        if (busyLabel) door.btn.textContent = busyLabel;
        onPick(door.dest);
      });
    });

    return {
      row: row,
      open: function () { setOpen(true); },
      setDisabled: function (flag) {
        launchBtn.disabled = !!flag;
        real.forEach(function (door) {
          door.btn.disabled = !!flag;
          if (!flag) door.btn.textContent = DOORS[door.dest].label;
        });
      }
    };
  }

  window.MakeItYoursDoors = { build: build, DOORS: DOORS };
})();
