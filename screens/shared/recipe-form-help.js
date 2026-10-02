// Recipe form help: the pure rules behind the Create page's recipe form
// (screens/designer/designer.js), a reviewer's list of 2026-10-02:
//
// - a limit is said on the field before it is broken ("From 10 to 60."),
//   never only in the error after Create Activity;
// - an example in an empty box reads as an example ("e.g. 1247"), so a
//   required field never looks filled in;
// - a choice shows the recipe's words for it (valueLabels), never the
//   value the compiler reads ("size / count / none");
// - a field that only matters for one choice hides behind it (showWhen),
//   the same rule the make page's knobs follow;
// - a number box takes "7,000" and refuses a number too big to hold.
//
// Browser global + side-effect-importable for tests (bot-brain pattern).

(function () {
  'use strict';

  // The most digits a number box takes and holds exactly
  var MAX_DIGITS = 15;

  // "From 10 to 60.", "At least 2.", "Up to 12.", "2 to 8 of them.", or ''
  function limitHint(spec) {
    if (!spec || typeof spec !== 'object') return '';
    var lo, hi;
    if (spec.type === 'integer') {
      lo = typeof spec.min === 'number' ? spec.min : null;
      hi = typeof spec.max === 'number' ? spec.max : null;
      // a ceiling that is only there to keep a number exact says nothing
      if (hi !== null && String(Math.abs(hi)).length >= MAX_DIGITS) hi = null;
      if (lo !== null && hi !== null) return 'From ' + lo + ' to ' + hi + '.';
      if (lo !== null) return lo === 0 ? 'Zero or more.' : 'At least ' + lo + '.';
      if (hi !== null) return 'Up to ' + hi + '.';
      return '';
    }
    if (spec.type === 'array') {
      lo = typeof spec.minItems === 'number' ? spec.minItems : null;
      hi = typeof spec.maxItems === 'number' ? spec.maxItems : null;
      if (lo !== null && hi !== null) return lo === hi ? 'Exactly ' + lo + '.' : lo + ' to ' + hi + ' of them.';
      if (lo !== null && lo > 1) return 'At least ' + lo + '.';
      if (hi !== null) return 'Up to ' + hi + '.';
      return '';
    }
    if (spec.type === 'string' || spec.type === 'templateString' || spec.type === 'promptDeck') {
      if (typeof spec.maxLength === 'number') return 'Up to ' + spec.maxLength + ' characters.';
    }
    return '';
  }

  // An example placeholder as a hint: "e.g. 1247". Already a hint, or
  // empty, stays as it is.
  function hintPlaceholder(text) {
    var t = typeof text === 'string' ? text.trim() : '';
    if (!t) return '';
    if (/^(e\.g\.|eg\b|for example|like\b|such as\b)/i.test(t)) return t;
    return 'e.g. ' + t;
  }

  // The words a choice shows: the recipe's valueLabels, else the value
  // itself made readable ("most-votes" -> "Most votes")
  function enumLabel(spec, value) {
    var labels = spec && spec.valueLabels;
    if (labels && typeof labels[value] === 'string' && labels[value]) return labels[value];
    var s = String(value).replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // The helper line for the picked choice (valueHelp), or ''
  function enumHelp(spec, value) {
    var help = spec && spec.valueHelp;
    return help && typeof help[value] === 'string' ? help[value] : '';
  }

  // {name, values[]} from "groups=size" or "groups=a|b"; null otherwise
  function showWhenOf(spec) {
    if (!spec || typeof spec !== 'object') return null;
    var text = spec.setup && typeof spec.setup === 'object' && typeof spec.setup.showWhen === 'string'
      ? spec.setup.showWhen
      : (typeof spec.showWhen === 'string' ? spec.showWhen : null);
    if (!text) return null;
    var m = /^\s*([A-Za-z_][\w-]*)\s*=\s*(.+?)\s*$/.exec(text);
    if (!m) return null;
    return { name: m[1], values: m[2].split('|').map(function (s) { return s.trim(); }) };
  }

  // Whether a field shows, given the form's current values ({name: value})
  function fieldVisible(spec, values) {
    var rule = showWhenOf(spec);
    if (!rule) return true;
    var v = values ? values[rule.name] : undefined;
    return rule.values.indexOf(String(v)) !== -1;
  }

  // A typed whole number: {value} or {problem}. "7,000" and "7 000" are
  // 7000; "" is {value: null}; a decimal, a word, or more than fifteen
  // digits is a problem in plain words (a twenty-digit number came back
  // rounded, 2026-10-02).
  function readWholeNumber(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (!t) return { value: null };
    var digits = t.replace(/(\d)[,\s_](?=\d{3}\b)/g, '$1').replace('−', '-');
    if (!/^-?\d+$/.test(digits)) return { problem: 'needs a whole number, like 1247' };
    if (digits.replace('-', '').replace(/^0+(?=\d)/, '').length > MAX_DIGITS) {
      return { problem: 'is too long a number. Use ' + MAX_DIGITS + ' digits or fewer' };
    }
    return { value: parseInt(digits, 10) };
  }

  var api = {
    MAX_DIGITS: MAX_DIGITS,
    limitHint: limitHint,
    hintPlaceholder: hintPlaceholder,
    enumLabel: enumLabel,
    enumHelp: enumHelp,
    showWhenOf: showWhenOf,
    fieldVisible: fieldVisible,
    readWholeNumber: readWholeNumber
  };
  if (typeof window !== 'undefined') window.RecipeFormHelp = api;
  if (typeof globalThis !== 'undefined') globalThis.RecipeFormHelp = api;
})();
