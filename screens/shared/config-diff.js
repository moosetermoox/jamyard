// What actually changes between two activity configs, in teacher words:
// the steps added, removed, retyped, or reworded, and the top-level
// settings that moved. The design chat shows this list under the AI's own
// summary of a proposal, so a summary that promises more than the draft
// does is caught before Apply (an outside reviewer applied "replaced the
// single winner with every majority clause" and got the same vote and the
// same results step, 2026-09-24). Steps are named by their number and
// kind ("step 3, Question"), fields by what a teacher sees ("its text",
// "the list it hands out"), never by an id or a field name (the reviewer
// read "dealItems" and "template" on the card, 2026-09-25). Pure: attaches
// to the global like bench-logic.js so it can be tested without a DOM.
(function (global) {
  'use strict';

  // The fields a student or the projector reads, in a teacher's words
  var WORD_FIELDS = {
    prompt: 'the question', message: 'the message', instruction: 'the instruction',
    content: 'its text', template: 'its text', question: 'the question', heading: 'the heading',
    title: 'the title', choices: 'the answer choices', items: 'the list', questions: 'the questions',
    pairs: 'the pairs', candidates: 'what is voted on', fields: 'the answer boxes', roles: 'the jobs',
    dealItems: 'the list it hands out', chainHeading: 'the heading', chainTemplate: 'the sentence shape',
    discussionPrompt: 'the discussion question', explanation: 'the explanation'
  };
  // Settings on a step, in a teacher's words
  var SETTING_FIELDS = {
    timer: 'the timer', mode: 'the voting style', passAt: 'the percent of yes votes to pass',
    excludeAuthors: 'whether students can vote for their own', from: 'what it reads',
    voters: 'who votes', limit: 'how many it takes', teamCount: 'how many teams', groupSize: 'the group size',
    method: 'how it is decided', scoring: 'the scoring', correctAnswer: 'the correct answer',
    showAnswers: 'whether answers are shown', pointsPerQuestion: 'the points per question',
    speedBonus: 'the speed bonus', inputType: 'the kind of answer', maxLength: 'the answer length',
    anonymous: 'student names', liveResults: 'whether the tally shows live', min: 'the low end',
    max: 'the high end', answer: 'the answer', unit: 'the unit', video: 'the video', image: 'the picture',
    rotateFrom: 'whose answer it passes along', assign: 'the pairing', teamsFrom: 'which groups it uses',
    rolesFrom: 'which jobs it uses', candidatesFrom: 'what is voted on', matchupsFromPairs: 'the matchups',
    nextByWinner: 'where each winner leads', hostTemplate: 'the projector layout', playerTemplate: 'the student layout',
    hostShow: 'what the projector shows', playerShow: 'what students see', continueLabel: 'the next button',
    approveNext: 'where approval leads', rejectNext: 'where a redo leads', loopBack: 'where it loops back to'
  };
  // Top-level settings a teacher can see move
  var SETTINGS = { name: 'the name', description: 'the description', anonymous: 'student names', language: 'the language', earlyJoke: 'the dad joke for the first students', wordHelp: 'word help', start: 'how the room starts', timerDefaults: 'the timers', minPlayers: 'the smallest class', maxPlayers: 'the biggest class' };

  function nameOf(type) {
    var names = global.PHASE_NAMES || {};
    return names[type] || type || 'step';
  }

  function same(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  }

  // Steps in the order the class meets them (the next chain from the
  // lobby, then anything the chain never reaches), so a step can be
  // named by its number.
  function orderOf(phases) {
    var order = [];
    var seen = {};
    var cur = phases.lobby ? 'lobby' : Object.keys(phases)[0];
    while (cur && phases[cur] && !seen[cur]) {
      seen[cur] = true;
      order.push(cur);
      cur = typeof phases[cur].next === 'string' ? phases[cur].next : null;
    }
    Object.keys(phases).forEach(function (id) { if (!seen[id]) order.push(id); });
    return order;
  }

  function labelIn(order, id, phase) {
    var n = order.indexOf(id);
    var kind = nameOf(phase && phase.type);
    return n === -1 ? 'a ' + kind + ' step' : 'step ' + (n + 1) + ' (' + kind + ')';
  }

  function fieldWords(k) {
    if (WORD_FIELDS[k]) return WORD_FIELDS[k];
    if (SETTING_FIELDS[k]) return SETTING_FIELDS[k];
    // camelCase to words: "pointsPerMatch" -> "points per match"
    return String(k).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }

  function joinWords(list) {
    if (list.length <= 1) return list.join('');
    if (list.length === 2) return list[0] + ' and ' + list[1];
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
  }

  /**
   * @param {object} before the config as it is
   * @param {object} after the proposed config
   * @returns {string[]} one line per change, empty when nothing changes
   */
  function describe(before, after) {
    var a = (before && before.phases) || {};
    var b = (after && after.phases) || {};
    var orderA = orderOf(a);
    var orderB = orderOf(b);
    var lines = [];
    var id;
    for (id in b) {
      if (Object.prototype.hasOwnProperty.call(b, id) && !Object.prototype.hasOwnProperty.call(a, id)) {
        // placed by the step before it as the teacher knows it now
        var n = orderB.indexOf(id);
        var prev = n > 0 ? orderB[n - 1] : null;
        var placed = prev && a[prev] ? ' after ' + labelIn(orderA, prev, a[prev]) : '';
        lines.push('Adds a ' + nameOf(b[id] && b[id].type) + ' step' + placed);
      }
    }
    for (id in a) {
      if (Object.prototype.hasOwnProperty.call(a, id) && !Object.prototype.hasOwnProperty.call(b, id)) {
        lines.push('Removes ' + labelIn(orderA, id, a[id]));
      }
    }
    for (id in b) {
      if (!Object.prototype.hasOwnProperty.call(b, id) || !Object.prototype.hasOwnProperty.call(a, id)) continue;
      var x = a[id] || {};
      var y = b[id] || {};
      var label = labelIn(orderA, id, x);
      if (x.type !== y.type) {
        lines.push('Turns ' + label + ' into a ' + nameOf(y.type) + ' step');
        continue;
      }
      var keys = {};
      var k;
      for (k in x) keys[k] = true;
      for (k in y) keys[k] = true;
      var words = [];
      var settings = [];
      var flow = false;
      for (k in keys) {
        if (same(x[k], y[k])) continue;
        if (k === 'next') flow = true;
        else if (WORD_FIELDS[k]) words.push(fieldWords(k));
        else settings.push(fieldWords(k));
      }
      if (!words.length && !settings.length && !flow) continue;
      var bits = [];
      if (words.length) bits.push('rewords ' + joinWords(words));
      if (settings.length) bits.push('changes ' + joinWords(settings));
      if (flow) bits.push('changes what comes after it');
      lines.push(label.charAt(0).toUpperCase() + label.slice(1) + ': ' + bits.join('; '));
    }
    for (k in SETTINGS) {
      if (Object.prototype.hasOwnProperty.call(SETTINGS, k) && !same(before && before[k], after && after[k])) {
        lines.push('Changes ' + SETTINGS[k]);
      }
    }
    return lines;
  }

  global.ConfigDiff = { describe: describe, fieldWords: fieldWords };
})(typeof window !== 'undefined' ? window : globalThis);
