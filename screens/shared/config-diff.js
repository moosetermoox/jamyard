// What actually changes between two activity configs, in teacher words:
// the steps added, removed, retyped, or reworded, and the top-level
// settings that moved. The design chat shows this list under the AI's own
// summary of a proposal, so a summary that promises more than the draft
// does is caught before Apply (an outside reviewer applied "replaced the
// single winner with every majority clause" and got the same vote and the
// same results step, 2026-09-24). Pure: attaches to the global like
// bench-logic.js so it can be tested without a DOM.
(function (global) {
  'use strict';

  // The fields a student or the projector reads as words
  var WORD_FIELDS = ['prompt', 'message', 'instruction', 'content', 'template', 'question', 'heading', 'title', 'choices', 'items', 'questions', 'pairs', 'candidates', 'fields', 'roles'];
  // Top-level settings a teacher can see move
  var SETTINGS = { name: 'the name', description: 'the description', anonymous: 'student names', language: 'the language', earlyJoke: 'the early-bird joke', wordHelp: 'word help', start: 'how the room starts', timerDefaults: 'the timers' };

  function nameOf(type) {
    var names = global.PHASE_NAMES || {};
    return names[type] || type || 'step';
  }

  function same(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  }

  function stepLabel(id, phase) {
    return nameOf(phase && phase.type) + ' "' + id + '"';
  }

  /**
   * @param {object} before the config as it is
   * @param {object} after the proposed config
   * @returns {string[]} one line per change, empty when nothing changes
   */
  function describe(before, after) {
    var a = (before && before.phases) || {};
    var b = (after && after.phases) || {};
    var lines = [];
    var id;
    for (id in b) {
      if (Object.prototype.hasOwnProperty.call(b, id) && !Object.prototype.hasOwnProperty.call(a, id)) {
        lines.push('Adds ' + stepLabel(id, b[id]));
      }
    }
    for (id in a) {
      if (Object.prototype.hasOwnProperty.call(a, id) && !Object.prototype.hasOwnProperty.call(b, id)) {
        lines.push('Removes ' + stepLabel(id, a[id]));
      }
    }
    for (id in b) {
      if (!Object.prototype.hasOwnProperty.call(b, id) || !Object.prototype.hasOwnProperty.call(a, id)) continue;
      var x = a[id] || {};
      var y = b[id] || {};
      if (x.type !== y.type) {
        lines.push('Turns "' + id + '" into ' + nameOf(y.type) + ' (it was ' + nameOf(x.type) + ')');
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
        else if (WORD_FIELDS.indexOf(k) !== -1) words.push(k);
        else settings.push(k);
      }
      if (!words.length && !settings.length && !flow) continue;
      var bits = [];
      if (words.length) bits.push('rewords it (' + words.join(', ') + ')');
      if (settings.length) bits.push('changes ' + settings.join(', '));
      if (flow) bits.push('changes what comes after it');
      lines.push(stepLabel(id, y) + ': ' + bits.join('; '));
    }
    for (k in SETTINGS) {
      if (Object.prototype.hasOwnProperty.call(SETTINGS, k) && !same(before && before[k], after && after[k])) {
        lines.push('Changes ' + SETTINGS[k]);
      }
    }
    return lines;
  }

  global.ConfigDiff = { describe: describe };
})(typeof window !== 'undefined' ? window : globalThis);
