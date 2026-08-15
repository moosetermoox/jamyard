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
  function knobsFor(recipeSummary, stamp) {
    if (!stampMatches(recipeSummary, stamp)) return [];

    var specs = recipeSummary.parameters || {};
    var knobs = [];
    Object.keys(specs).forEach(function (name) {
      var spec = specs[name];
      if (!spec || spec.setup == null) return;
      var stamped = stamp.params[name];

      if (spec.setup === true && SCALAR_KINDS[spec.type]) {
        knobs.push({
          name: name,
          kind: spec.type,
          label: spec.label || name,
          helper: spec.helper || null,
          min: typeof spec.min === 'number' ? spec.min : null,
          max: typeof spec.max === 'number' ? spec.max : null,
          values: spec.type === 'enum' ? (spec.values || []) : null,
          value: stamped !== undefined ? stamped : spec.default
        });
        return;
      }

      if (spec.type === 'array' && typeof spec.setup === 'object' && spec.setup.mode === 'count') {
        // Nothing to slice = nothing to ask.
        if (!Array.isArray(stamped) || stamped.length < 2) return;
        knobs.push({
          name: name,
          kind: 'count',
          label: spec.setup.label || spec.label || name,
          helper: null,
          min: 1,
          max: stamped.length,
          values: null,
          value: stamped.length
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

  globalThis.SetupKnobs = {
    knobsFor: knobsFor,
    panelFor: panelFor,
    applyKnobs: applyKnobs,
    validateQuizList: validateQuizList
  };
})();
