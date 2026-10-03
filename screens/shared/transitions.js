// transitions.js — THE list of fields that carry a step to another step,
// and the walks over them. One copy, read by the engine (through
// engine/transitions.js) and by the editor (as a browser global).
//
// Before 2026-10-03 the list `next, approveNext, rejectNext, loopBack`
// (plus a vote's `nextByWinner` map) was typed by hand in the state
// machine's graph, the validator's ref check, its cycle finder, its
// reachability walk, the recipe compiler's drop-rewiring, the editor's
// phase order, delete-relink, ref check and reachability walk, and the
// primary-path walkers in activity-map, duration-estimate, audience and
// rolling: eleven files, one list, nothing checking they agreed. A new
// transition field had to find every one of them ("six places" in
// CLAUDE.md). Now a field goes in FIELDS below and every walk sees it;
// tests/engine/transitions.test.js fails on a file that grows its own
// copy of the walk.
//
// Browser global + side-effect-importable for Node (config-diff pattern).

(function (global) {
  'use strict';

  /**
   * The transition fields, in walk order.
   *   name   — the field on a phase config
   *   shape  — 'ref': the value is a phase id; 'map': the value is an
   *            object whose VALUES are phase ids (a vote's branch by winner)
   *   back   — an intentional back-edge (a preview's redo, a loop), never a
   *            cycle and never on the primary path
   *   label  — what the editor calls it in a teacher's problem line
   */
  var FIELDS = [
    { name: 'next',         shape: 'ref', back: false, label: 'Next step' },
    { name: 'approveNext',  shape: 'ref', back: false, label: 'If approved, go to' },
    { name: 'rejectNext',   shape: 'ref', back: true,  label: 'If sent back, go to' },
    { name: 'loopBack',     shape: 'ref', back: true,  label: 'Loop back to' },
    { name: 'nextByWinner', shape: 'map', back: false, label: 'If this wins' }
  ];

  var NAMES = FIELDS.map(function (f) { return f.name; });

  function isId(v) { return typeof v === 'string' && v.length > 0; }

  /**
   * Every edge out of a phase: [{field, target, key, back}], in FIELDS
   * order. A map field gives one edge per entry, `key` = the option's
   * text. Only string targets count (the validator reports the shape of
   * anything else by itself).
   */
  function edges(phase) {
    var out = [];
    if (!phase || typeof phase !== 'object') return out;
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      var v = phase[f.name];
      if (f.shape === 'ref') {
        if (isId(v)) out.push({ field: f.name, target: v, back: f.back });
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (var k in v) {
          if (Object.prototype.hasOwnProperty.call(v, k) && isId(v[k])) {
            out.push({ field: f.name, target: v[k], key: k, back: f.back });
          }
        }
      }
    }
    return out;
  }

  /** The distinct phase ids a phase can move to, in edge order. */
  function targets(phase) {
    var seen = {};
    var out = [];
    var es = edges(phase);
    for (var i = 0; i < es.length; i++) {
      if (!seen[es[i].target]) { seen[es[i].target] = true; out.push(es[i].target); }
    }
    return out;
  }

  /** The edges that go forward (a back-edge is never a cycle). */
  function forwardEdges(phase) {
    return edges(phase).filter(function (e) { return !e.back; });
  }

  /**
   * The primary path out of a phase: next, then a preview's approve door,
   * then a branching vote's first branch. Null at the end.
   */
  function primaryNext(phase) {
    var es = forwardEdges(phase);
    return es.length ? es[0].target : null;
  }

  /**
   * Rewrite every edge's target in place: fn(target, field, key) returns
   * the new id, or null/undefined to drop that edge (a ref field is
   * deleted, a map entry removed and an emptied map deleted). Returns the
   * number of edges changed.
   */
  function mapTargets(phase, fn) {
    var changed = 0;
    if (!phase || typeof phase !== 'object') return 0;
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      var v = phase[f.name];
      if (f.shape === 'ref') {
        if (!isId(v)) continue;
        var r = fn(v, f.name, undefined);
        if (r === v) continue;
        if (isId(r)) phase[f.name] = r; else delete phase[f.name];
        changed++;
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (var k in v) {
          if (!Object.prototype.hasOwnProperty.call(v, k) || !isId(v[k])) continue;
          var r2 = fn(v[k], f.name, k);
          if (r2 === v[k]) continue;
          if (isId(r2)) v[k] = r2; else delete v[k];
          changed++;
        }
        if (Object.keys(v).length === 0) delete phase[f.name];
      }
    }
    return changed;
  }

  /** Point every edge at `from` to `to` instead (null = drop the edge). */
  function retarget(phase, from, to) {
    return mapTargets(phase, function (t) { return t === from ? to : t; });
  }

  /** The field's teacher-facing label, for a problem line. */
  function labelOf(field) {
    for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].name === field) return FIELDS[i].label;
    return field;
  }

  global.Transitions = {
    FIELDS: FIELDS,
    NAMES: NAMES,
    edges: edges,
    targets: targets,
    forwardEdges: forwardEdges,
    primaryNext: primaryNext,
    mapTargets: mapTargets,
    retarget: retarget,
    labelOf: labelOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
