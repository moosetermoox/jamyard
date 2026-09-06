// Setup knobs — the pure logic behind the library Customize dialog's
// "set it up" section (per-game setup mode).
//
// A recipe-born game carries a provenance stamp (config.recipe =
// {id, version, params}, written by engine/recipe-compiler.js). Recipe
// parameters flagged with "setup" become instant, no-AI knobs in the
// Customize dialog: scalars (integer/boolean/enum) show their normal
// widget, arrays with setup {mode:"count"} show a how-many stepper that
// slices the stamped array to the first N. Touched knobs recompile the
// recipe server-side (POST /api/recipes/:id/compile) into the teacher's
// copy; untouched flows never recompile.
//
// Browser global + side-effect-importable for tests (bot-brain pattern).

(function () {
  'use strict';

  var SCALAR_KINDS = { integer: true, boolean: true, enum: true };

  // The one gate everything hangs on: the stamp and the live recipe must
  // agree (well-formed stamp, recipe present and not broken, same id,
  // same version). Any mismatch = pretend the game isn't recipe-born.
  function stampMatches(recipeSummary, stamp) {
    if (!stamp || typeof stamp !== 'object' || typeof stamp.id !== 'string') return false;
    if (!stamp.params || typeof stamp.params !== 'object') return false;
    if (!recipeSummary || recipeSummary.broken) return false;
    if (recipeSummary.id !== stamp.id) return false;
    if ((recipeSummary.version || '1') !== (stamp.version || '1')) return false;
    return true;
  }

  // The recipe's dedicated Customize panel ("quiz"), or null when there
  // is none or the stamp doesn't line up.
  function panelFor(recipeSummary, stamp) {
    if (!stampMatches(recipeSummary, stamp)) return null;
    return recipeSummary.setupPanel || null;
  }

  // Which knobs to render for this game, or [] when the stamp and the
  // live recipe don't line up (no stamp, recipe missing/broken/renamed,
  // version drift, nothing flagged). [] = the Customize dialog behaves
  // exactly as it did before setup mode existed.
  // "phraseSource=teacher" -> {name, value}; null when absent or malformed.
  function parseShowWhen(text) {
    if (typeof text !== 'string') return null;
    var m = /^\s*([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/.exec(text);
    return m ? { name: m[1], value: m[2] } : null;
  }

  // Whether a knob shows, given the current values of the others
  // (values: {name: value}). A knob with no showWhen always shows.
  function knobVisible(knob, values) {
    if (!knob || !knob.showWhen) return true;
    var v = values ? values[knob.showWhen.name] : undefined;
    return String(v) === String(knob.showWhen.value);
  }

  function knobsFor(recipeSummary, stamp) {
    if (!stampMatches(recipeSummary, stamp)) return [];

    var specs = recipeSummary.parameters || {};
    var knobs = [];
    Object.keys(specs).forEach(function (name) {
      var spec = specs[name];
      if (!spec || spec.setup == null) return;
      var stamped = stamp.params[name];
      var setup = typeof spec.setup === 'object' && spec.setup ? spec.setup : {};
      var showWhen = parseShowWhen(setup.showWhen);

      if (spec.setup === true && SCALAR_KINDS[spec.type]) {
        knobs.push({
          name: name,
          kind: spec.type,
          label: spec.label || name,
          helper: spec.helper || null,
          min: typeof spec.min === 'number' ? spec.min : null,
          max: typeof spec.max === 'number' ? spec.max : null,
          values: spec.type === 'enum' ? (spec.values || []) : null,
          value: stamped !== undefined ? stamped : spec.default,
          showWhen: null
        });
        return;
      }

      if (spec.type === 'array' && setup.mode === 'count') {
        // Nothing to slice = nothing to ask.
        if (!Array.isArray(stamped) || stamped.length < 2) return;
        knobs.push({
          name: name,
          kind: 'count',
          label: setup.label || spec.label || name,
          helper: null,
          min: 1,
          max: stamped.length,
          values: null,
          value: stamped.length,
          showWhen: showWhen
        });
        return;
      }

      // lines: an array of strings edited one per line (a phrase list);
      // text: a short free-text param (a topic). Usually shown only when
      // another knob has a given value (setup.showWhen).
      if (spec.type === 'array' && setup.mode === 'lines') {
        var list = Array.isArray(stamped) ? stamped : (Array.isArray(spec.default) ? spec.default : []);
        knobs.push({
          name: name,
          kind: 'lines',
          label: setup.label || spec.label || name,
          helper: spec.helper || null,
          min: null, max: null, values: null,
          value: list.map(function (s) { return String(s); }),
          showWhen: showWhen
        });
        return;
      }

      if ((spec.type === 'string' || spec.type === 'templateString') && setup.mode === 'text') {
        knobs.push({
          name: name,
          kind: 'text',
          label: setup.label || spec.label || name,
          helper: spec.helper || null,
          min: null, max: null, values: null,
          value: stamped !== undefined ? String(stamped) : String(spec.default || ''),
          showWhen: showWhen
        });
      }
    });
    return knobs;
  }

  // New params for the recompile: the stamped params with the teacher's
  // knob choices applied. Always a fresh deep copy; the stamp itself is
  // never mutated. knobValues: [{name, kind, value}].
  function applyKnobs(stampParams, knobValues) {
    var params = JSON.parse(JSON.stringify(stampParams || {}));
    (knobValues || []).forEach(function (kv) {
      if (kv.kind === 'count') {
        if (Array.isArray(params[kv.name])) {
          params[kv.name] = params[kv.name].slice(0, kv.value);
        }
      } else if (kv.kind === 'lines') {
        // Textarea text or an array: one item per non-empty line
        var raw = Array.isArray(kv.value) ? kv.value : String(kv.value || '').split('\n');
        params[kv.name] = raw.map(function (s) { return String(s).trim(); })
          .filter(function (s) { return s.length > 0; });
      } else {
        params[kv.name] = kv.value;
      }
    });
    return params;
  }

  // Friendly pre-save check for the quiz panel's editable question list.
  // Mirrors the server's cleaning rules (engine/quiz-questions.js) but
  // reports problems instead of dropping rows — the teacher is mid-edit.
  // Returns [] when the list is saveable.
  function validateQuizList(questions) {
    var problems = [];
    if (!Array.isArray(questions) || questions.length === 0) {
      return ['The quiz needs at least one question.'];
    }
    if (questions.length > 20) {
      problems.push('Quizzes cap at 20 questions, remove ' + (questions.length - 20) + '.');
    }
    questions.forEach(function (q, i) {
      var label = 'Question ' + (i + 1);
      var text = q && typeof q.question === 'string' ? q.question.trim() : '';
      var choices = (q && Array.isArray(q.choices) ? q.choices : [])
        .map(function (c) { return String(c).trim(); })
        .filter(function (c) { return c.length > 0; });
      var correct = q && typeof q.correct === 'string' ? q.correct.trim() : '';
      if (!text) problems.push(label + ' has no question text.');
      if (choices.length < 2) problems.push(label + ' needs at least 2 choices.');
      if (choices.length > 6) problems.push(label + ' has more than 6 choices.');
      if (!correct || choices.indexOf(correct) === -1) {
        problems.push(label + ' needs a ✓ on the correct choice.');
      }
    });
    return problems;
  }

  // Friendly pre-save check for the bluff panel's prepared-fact list.
  // Mirrors the server's cleaning rules (engine/bluff-questions.js) but
  // reports problems instead of dropping rows — the teacher is mid-edit.
  // Returns [] when the list is saveable.
  function validateBluffList(questions) {
    var problems = [];
    if (!Array.isArray(questions) || questions.length === 0) {
      return ['Prepared facts need at least one fact.'];
    }
    if (questions.length > 10) {
      problems.push('Trivia Bluff caps at 10 facts, remove ' + (questions.length - 10) + '.');
    }
    questions.forEach(function (q, i) {
      var label = 'Fact ' + (i + 1);
      var text = q && typeof q.question === 'string' ? q.question.trim() : '';
      var truth = q && typeof q.truth === 'string' ? q.truth.trim() : '';
      var houseLie = q && typeof q.houseLie === 'string' ? q.houseLie.trim() : '';
      if (!text) problems.push(label + ' has no text.');
      else if (text.indexOf('___') === -1) {
        problems.push(label + ' needs a blank shown as ___ for students to fill.');
      }
      if (!truth) problems.push(label + ' needs the real answer.');
      if (truth && houseLie && houseLie.toLowerCase() === truth.toLowerCase()) {
        problems.push(label + "'s decoy matches the real answer, change or clear it.");
      }
    });
    return problems;
  }

  globalThis.SetupKnobs = {
    knobsFor: knobsFor,
    knobVisible: knobVisible,
    panelFor: panelFor,
    applyKnobs: applyKnobs,
    validateQuizList: validateQuizList,
    validateBluffList: validateBluffList
  };
})();
