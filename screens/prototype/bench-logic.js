// bench-logic.js — the pure decisions behind Try it out (/prototype):
// the plan as a row of blocks in the header, and the NEXT banner that
// says the one thing to press (design handoff 14a/15a, 2026-09-09).
//
// No DOM here. prototype.js feeds these functions the live room state and
// paints what comes back. Plain script (browser global): window.BenchLogic.

(function () {
  'use strict';

  // Steps a student answers on their own screen: the shortcuts strip
  // (Add sample answers, Skip timer) shows only while one of these is
  // open, and the banner points at the student screen.
  var STUDENT_STEPS = [
    'collect', 'collect-choice', 'estimate', 'vote', 'rank', 'rate', 'wager',
    'match', 'sort', 'buzz', 'relay', 'merge', 'one-voice', 'turn',
    'solo-quiz', 'checklist', 'team-roles', 'team-split'
  ];

  function isStudentStep(type) {
    return !!type && STUDENT_STEPS.indexOf(type) !== -1;
  }

  // The buttons the host clicks on a prototype-skip, in the order it
  // tries them (host.js, the 'prototype-skip' message handler). The banner
  // finds the visible one to point at; the test guards the two lists.
  var HOST_ADVANCE_BUTTONS = [
    'close-submissions-btn',
    'close-voting-btn',
    'rank-close-btn',
    'merge-close-btn',
    'one-voice-continue-btn',
    'buzz-finish-btn',
    'estimate-close-btn', 'estimate-continue-btn',
    'rate-close-btn', 'rate-continue-btn',
    'wager-close-btn',
    'reveal-one-next-btn', 'reveal-one-continue-btn',
    'preview-approve-btn',
    'match-close-btn', 'match-continue-btn',
    'sort-close-btn', 'sort-continue-btn',
    'checklist-close-btn', 'checklist-continue-btn',
    'solo-quiz-close-btn', 'solo-quiz-continue-btn',
    'continue-btn',
    'announce-continue-btn',
    'leaderboard-continue-btn',
    'team-arrange-confirm-btn', 'team-choice-confirm-btn',
    'team-split-continue-btn',
    'elimination-continue-btn',
    'winner-end-btn',
    'start-game-btn'
  ];

  // A host button that moves on from answers the host already shows
  // (match-continue-btn after the scoring, estimate-continue-btn after the
  // reveal). One Voice's continue is its finish button, up the whole step.
  function isContinueButton(id) {
    if (!id || id === 'one-voice-continue-btn') return false;
    return id === 'continue-btn' || /-continue-btn$/.test(String(id));
  }

  function stopLabel(stop, nameOf) {
    if (stop.kind === 'rounds') {
      var sub = stop.sub || [];
      if (sub.length === 1 && stop.rounds !== null && stop.rounds !== undefined) {
        return stop.rounds + ' × ' + nameOf(sub[0]);
      }
      return 'Rounds';
    }
    return nameOf(stop.type);
  }

  // The row: Join, one block per map stop, Wrap up. `here` is the live
  // position (-1 lobby, stops.length wrap up, -2 unknown). Longer plans
  // fold the stops between the first, the live one, and the last into
  // "..." blocks so the row never runs past `cap` blocks; `expanded`
  // returns every block (the "..." click).
  function planBlocks(stops, here, opts) {
    opts = opts || {};
    var cap = opts.cap || 7;
    var nameOf = opts.nameOf || function (t) { return t; };
    var n = stops.length;
    var blocks = [];

    blocks.push({ kind: 'join', label: 'Join', state: here === -1 ? 'now' : (here >= 0 ? 'done' : 'later') });
    for (var i = 0; i < n; i++) {
      var state = 'later';
      if (here >= 0 && i < here) state = 'done';
      else if (i === here) state = 'now';
      blocks.push({ kind: 'stop', index: i, number: i + 1, label: stopLabel(stops[i], nameOf), state: state, ids: stops[i].ids || [] });
    }
    blocks.push({ kind: 'end', label: 'Wrap up', state: here === n ? 'now' : 'later' });

    if (opts.expanded || blocks.length <= cap) return blocks;

    // Keep Join, the first stop, the live stop, the last stop, Wrap up;
    // fold every other run into one block each (at most two folds).
    var keep = {};
    keep[0] = true;
    keep[1] = true;
    keep[blocks.length - 2] = true;
    keep[blocks.length - 1] = true;
    if (here >= 0 && here < n) keep[here + 1] = true;

    var out = [];
    var run = [];
    var flush = function () {
      if (!run.length) return;
      out.push({ kind: 'fold', label: '…', count: run.length, blocks: run, state: 'later' });
      run = [];
    };
    for (var b = 0; b < blocks.length; b++) {
      if (keep[b]) { flush(); out.push(blocks[b]); } else run.push(blocks[b]);
    }
    flush();
    return out;
  }

  // The banner's one sentence and what it points at. `at` names a slot
  // prototype.js resolves to an element: launch, start, add-student,
  // samples, skip, close, continue, teacher-controls, reset; null = no
  // pointer, the text stands alone.
  function nextStep(state) {
    state = state || {};
    if (!state.launched) return { at: 'launch', text: 'Pick an activity, then press LAUNCH.' };
    if (state.busy) return { at: null, text: state.busy };
    var type = state.phaseType;
    var label = state.hostButtonLabel ? String(state.hostButtonLabel).toUpperCase() : null;

    if (!type || type === 'lobby') {
      if (state.startEnabled === false) {
        return { at: 'add-student', text: state.startHint || 'Add a student below, then press START.' };
      }
      return { at: 'start', text: "Press START to begin. You'll play the students too." };
    }
    if (isStudentStep(type)) {
      // The answers are in and the host is already showing them (a match
      // step scores itself once everyone is in, an estimate reveals): the
      // one button left is a Continue, never Add sample answers (an
      // outside reviewer followed a stale card, 2026-09-24).
      if (label && isContinueButton(state.hostButtonId)) {
        return { at: 'continue', text: 'The answers are in. Press ' + label + '.' };
      }
      if (state.allIn && label) return { at: 'close', text: 'Press ' + label + '.' };
      if (state.samplesPressed) return { at: 'skip', text: 'Press SKIP TIMER to move on.' };
      return { at: 'samples', text: 'Press ADD SAMPLE ANSWERS to fill one in for everyone.' };
    }
    if (type === 'preview') return { at: 'teacher-controls', text: 'Open Teacher controls to approve.' };
    if (type === 'ai-process' || type === 'ai-eliminate') {
      return { at: null, text: 'The AI is working on the answers. Nothing to press.' };
    }
    if (type === 'end') {
      return { at: 'reset', text: "That's the whole activity. Press the reset arrow to run it again, or Host this for real." };
    }
    if (label) return { at: 'continue', text: 'Press ' + label + ' when the class is ready.' };
    return { at: null, text: 'Watch the teacher screen. This step moves on by itself.' };
  }

  // The first-visit tour: one stop per piece, in the order a teacher's
  // eyes travel (screens first, then the header). `fallback` is pointed at
  // when the piece is not on screen yet (the shortcuts strip only shows
  // on a step students answer). Copy is teacher-facing: no em dashes.
  var TOUR_STOPS = [
    { target: '#host-column', title: 'Teacher screen',
      text: 'What your class sees on the projector. This is a real room, just a private one, so everything here works the way it will in class.' },
    { target: '#host-tabs', title: 'Teacher controls',
      text: 'Your private console, behind this tab. In class it opens on your own laptop or phone, never the projector: hide an entry, approve a preview, pace the room.' },
    { target: '#student-column', title: 'Student screen',
      text: "One pretend student's Chromebook. You play them: type an answer here the way a student would." },
    { target: '#pager', title: 'More than one student',
      text: 'The arrows step through your pretend students. The left and right arrow keys work too.' },
    { target: '#add-student-btn', title: 'Add another student',
      text: 'Brings one more pretend student into the room, mid-activity is fine. Pairs and teams need at least two.' },
    { target: '#bench-bar', fallback: '#student-mat', title: 'Shortcuts',
      text: 'When a step asks students for answers, two shortcuts appear under the student screen: Add sample answers fills one in for everyone, Skip timer moves the room on.' },
    { target: '#map-rail', title: 'The plan',
      text: 'Every step of the activity; the yellow block is where the room is now. Click a later step to skip ahead, pretend students play the steps in between.' },
    { target: '#toolbar', title: 'Reset, sound, full screen, help',
      text: 'Reset starts the room over. Host this opens a real room for your class when you are ready. The ? brings back this tour any time.' },
    { target: '#next-banner', title: 'The NEXT card',
      text: 'From here on, this card points at the one thing to press. Close it with its × when you know your way around.' }
  ];

  // How many pretend students to seat at launch so the activity's own
  // move shows (a reviewer, 2026-09-23: Snowball opened with one student,
  // so its pairing never happened until they added more). Reads the
  // activity's steps: a pairing or a merge needs its group, teams need
  // two groups, a vote over classmates' answers needs a second answer.
  // Anything else is one. Never more than the bench holds.
  var SEAT_MAX = 8;
  function startingSeats(config) {
    var phases = config && config.phases;
    if (!phases || typeof phases !== 'object') return 1;
    var list = Array.isArray(phases) ? phases : Object.keys(phases).map(function (k) { return phases[k]; });
    var seats = 1;
    var want = function (n) { if (n > seats) seats = n; };
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p !== 'object') continue;
      var t = p.type;
      if (t === 'merge') want(p.groupsFrom ? 2 : Math.max(2, parseInt(p.groupSize, 10) || 2));
      else if (t === 'collect' && (p.assign === 'pairwise' || p.rotateFrom || p.rotatePairsFrom || p.reusePairsFrom || p.pairBy || p.dealItems)) want(2);
      else if (t === 'team-split') {
        var g = parseInt(p.groupSize, 10);
        var c = parseInt(p.teamCount, 10);
        want(g >= 2 ? 2 * g : (c >= 2 ? 2 * c : 4));
      }
      else if (t === 'team-roles' || t === 'checklist' || t === 'turn' || t === 'relay' || t === 'one-voice' || t === 'buzz') want(2);
      else if (t === 'vote' && (p.excludeAuthors || p.matchupsFromPairs)) want(2);
      else if (t === 'eliminate' || t === 'ai-eliminate') want(3);
      else if (t === 'foreach') want(2);
      else if (t === 'reveal' && (p.scope === 'pair' || p.scope === 'own')) want(2);
    }
    return Math.min(SEAT_MAX, seats);
  }

  globalThis.BenchLogic = {
    STUDENT_STEPS: STUDENT_STEPS,
    HOST_ADVANCE_BUTTONS: HOST_ADVANCE_BUTTONS,
    TOUR_STOPS: TOUR_STOPS,
    isStudentStep: isStudentStep,
    isContinueButton: isContinueButton,
    planBlocks: planBlocks,
    nextStep: nextStep,
    startingSeats: startingSeats
  };
})();
