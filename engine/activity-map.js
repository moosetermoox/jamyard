/**
 * activity-map.js — the treasure-map summary of an activity's path.
 *
 * Pure derivation from a game config, served by GET /api/games/:id/map and
 * drawn by screens/shared/activity-map.js in the activity popups. The point:
 * a teacher should see WHAT HAPPENS in an activity without reading the whole
 * config or playing it through in preview.
 *
 * Shape: { stops: [stop], talk? } where a stop is either
 *   { kind: 'step',   type, detail?, branches?, carries? }
 *   { kind: 'rounds', rounds, sub: [type], detail?, samples?, carries? }
 * A foreach becomes a rounds stop with `detail` (its one template); a folded
 * repeated run gets `samples` (up to 3 excerpts spread across the run).
 * Root `talk: true` marks a talk-driven activity: announce-heavy, nothing
 * typed — the screens carry questions, the class answers out loud.
 *
 * `carries` is the hand-off: a semantic key naming what STUDENT MATERIAL
 * arrives at this stop from earlier work (a classmate's answer, the class
 * pile, partner trades). It exists because "students working off each
 * other's thoughts" is the product's comparative advantage and a bare
 * step list doesn't show it. The renderer turns keys into student-voice
 * labels riding the trail; unknown keys are simply not drawn, so new keys
 * can ship server-first.
 * Lobby and end never appear as stops: the renderer draws its own start
 * mark and treasure X. Only the primary path is walked (approveNext for
 * preview gates, the first branch of a branching vote); side branches are
 * summarized by the `branches` count, not drawn.
 *
 * `detail` is a short excerpt of the step's human-facing text (prompt,
 * question, message, or instruction). Template-bearing text ({{...}}) is
 * omitted rather than shown raw. Teacher config is untrusted for rendering:
 * clients must put `detail` through textContent, never innerHTML.
 */

const EXCERPT_FIELDS = ['prompt', 'question', 'message', 'instruction'];
const EXCERPT_MAX = 64;

function excerpt(phase) {
  if (!phase) return undefined;
  for (const field of EXCERPT_FIELDS) {
    const value = phase[field];
    if (typeof value !== 'string') continue;
    // **bold** markers read as bold on the screens; in a one-line excerpt
    // they would read as stray stars.
    const text = value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;
    if (text.includes('{{')) return undefined; // unresolved refs read as noise
    if (text.length <= EXCERPT_MAX) return text;
    let cut = text.slice(0, EXCERPT_MAX);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 20) cut = cut.slice(0, lastSpace);
    return cut.trim() + '…';
  }
  return undefined;
}

// Phase types whose output IS student-made material (or, for ai-process,
// material derived from it). A ref into one of these means class work is
// flowing, as opposed to teacher-authored content.
const STUDENT_SOURCE_TYPES = new Set([
  'collect', 'collect-choice', 'collect-two', 'estimate', 'relay', 'merge',
  'rank', 'rate', 'sort', 'match', 'buzz', 'wager', 'ai-process'
]);

// "write.responses", "{{write.responses}}", or a bare phase id → "write".
function refPhaseId(value) {
  if (typeof value !== 'string') return null;
  const inner = value.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '').trim();
  if (inner.length === 0) return null;
  return inner.split('.')[0];
}

function refsStudentWork(value, phases) {
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    const id = refPhaseId(v);
    if (id && phases[id] && STUDENT_SOURCE_TYPES.has(phases[id].type)) return true;
  }
  return false;
}

// A reveal's body is often a template with embedded refs ("Here's what the
// pairs built:\n{{pairs.merged.list}}") rather than a bare content ref.
function templateRefsStudentWork(value, phases) {
  if (typeof value !== 'string') return false;
  const matches = value.match(/\{\{\s*([A-Za-z0-9_-]+)[.}]/g) || [];
  for (const m of matches) {
    const id = m.replace(/^\{\{\s*/, '').replace(/[.}]$/, '');
    if (phases[id] && STUDENT_SOURCE_TYPES.has(phases[id].type)) return true;
  }
  return false;
}

// The hand-off arriving at this stop, if any: what student material flows
// in from earlier steps. Keys, not copy — the renderer owns the wording.
function carriesFor(phase, phases) {
  const t = phase.type;
  if (t === 'collect' && phase.rotateFrom !== undefined) return 'classmate-work';
  if (t === 'collect-choice' && Array.isArray(phase.choicePool)) {
    const pooled = phase.choicePool.some(entry =>
      entry && refsStudentWork(entry.from, phases));
    if (pooled) return 'answers-become-choices';
  }
  if (t === 'vote' || t === 'rank') {
    if (phase.matchupsFromPairs !== undefined) return 'class-judges-own';
    if (refsStudentWork(phase.candidates, phases)) return 'class-judges-own';
  }
  if ((t === 'ai-process' || t === 'ai-eliminate') &&
      refsStudentWork(phase.input, phases)) return 'ai-reads-pile';
  if (t === 'reveal' || t === 'reveal-one') {
    if (phase.scope === 'pair') return 'partner-swap';
    if (phase.scope === 'own' && phase.chainFrom !== undefined) return 'back-to-author';
    if (refsStudentWork(phase.content, phases) ||
        refsStudentWork(phase.from, phases) ||
        templateRefsStudentWork(phase.template, phases) ||
        templateRefsStudentWork(phase.content, phases)) return 'work-goes-up-front';
  }
  if (t === 'announce' && phase.drawingFrom !== undefined) return 'work-goes-up-front';
  if (t === 'merge') return 'partners-combine';
  if (t === 'relay') return 'build-on-last';
  if (t === 'foreach' && refsStudentWork(phase.data, phases)) return 'round-per-answer';
  return undefined;
}

// Sub-phases live in an object; their play order is their own next chain.
function orderedSubTypes(subPhases) {
  const ids = Object.keys(subPhases || {});
  if (ids.length === 0) return [];
  const referenced = new Set();
  for (const id of ids) {
    const next = subPhases[id] && subPhases[id].next;
    if (typeof next === 'string') referenced.add(next);
  }
  let start = ids.find(id => !referenced.has(id));
  if (!start) start = ids[0]; // defensive: a cycle still yields a list
  const order = [];
  const seen = new Set();
  let current = start;
  while (current && subPhases[current] && !seen.has(current)) {
    order.push(current);
    seen.add(current);
    current = subPhases[current].next;
  }
  for (const id of ids) if (!seen.has(id)) order.push(id);
  return order.map(id => subPhases[id].type).filter(Boolean);
}

// The primary path: next, then a preview's approve door, then a branching
// vote's first branch. Matches the editor's buildPhaseOrder walk.
function primaryNext(phase) {
  if (typeof phase.next === 'string') return phase.next;
  if (typeof phase.approveNext === 'string') return phase.approveNext;
  if (phase.nextByWinner && typeof phase.nextByWinner === 'object') {
    for (const target of Object.values(phase.nextByWinner)) {
      if (typeof target === 'string') return target;
    }
  }
  return null;
}

function branchCount(phase) {
  if (!phase.nextByWinner || typeof phase.nextByWinner !== 'object') return 0;
  const targets = new Set(
    Object.values(phase.nextByWinner).filter(t => typeof t === 'string')
  );
  return targets.size;
}

function stopFor(phase, phases) {
  const carries = carriesFor(phase, phases);
  if (phase.type === 'foreach') {
    const sub = orderedSubTypes(phase.subPhases);
    const stop = {
      kind: 'rounds',
      rounds: typeof phase.limit === 'number' ? phase.limit : null,
      sub
    };
    const firstSubId = Object.keys(phase.subPhases || {})[0];
    const detail = excerpt(firstSubId ? phase.subPhases[firstSubId] : null);
    if (detail) stop.detail = detail;
    if (carries) stop.carries = carries;
    return stop;
  }
  const stop = { kind: 'step', type: phase.type };
  const detail = excerpt(phase);
  if (detail) stop.detail = detail;
  // A self-paced quiz's questions and a checklist's items are the words a
  // teacher wants to see (2026-09-24, the class examples): the first as
  // the detail, up to three as samples
  const list = phase.type === 'solo-quiz' && Array.isArray(phase.questions)
    ? phase.questions.map((q) => excerpt({ prompt: q && typeof q.question === 'string' ? q.question : undefined }))
    : phase.type === 'checklist' && Array.isArray(phase.items)
      ? phase.items.map((it) => excerpt({ prompt: typeof it === 'string' ? it : it && typeof it.text === 'string' ? it.text : undefined }))
      : [];
  const quotes = list.filter(Boolean);
  if (quotes.length > 0) {
    if (!stop.detail) stop.detail = quotes[0];
    if (quotes.length > 1) stop.samples = quotes.slice(0, 3);
  }
  const branches = branchCount(phase);
  if (branches >= 2) stop.branches = branches;
  if (carries) stop.carries = carries;
  return stop;
}

// Fold a repeating run of same-typed steps ("question, answer" x8) into one
// rounds stop, or the treasure map turns into a scroll. Period 1 needs three
// repeats (two same-type steps in a row are usually distinct beats); longer
// patterns fold at two repeats. Periods up to 6 cover real compiled rounds
// (trivia-bluff's round is 5 steps long).
function bestFoldAt(entries, i) {
  let best = null;
  for (let period = 1; period <= 6; period++) {
    if (i + period * 2 > entries.length) break;
    const block = entries.slice(i, i + period);
    if (block.some(e => e.stop.kind !== 'step')) break;
    let repeats = 1;
    while (i + (repeats + 1) * period <= entries.length) {
      const candidate = entries.slice(i + repeats * period, i + (repeats + 1) * period);
      if (candidate.some(e => e.stop.kind !== 'step')) break;
      const matches = candidate.every(
        (e, k) => e.stop.type === block[k].stop.type
      );
      if (!matches) break;
      repeats++;
    }
    const enough = period === 1 ? repeats >= 3 : repeats >= 2;
    if (!enough) continue;
    const coverage = repeats * period;
    if (!best || coverage > best.coverage) {
      best = { period, repeats, coverage };
    }
  }
  return best;
}

function collapseRepeats(entries) {
  const out = [];
  let i = 0;
  while (i < entries.length) {
    const here = bestFoldAt(entries, i);
    if (here) {
      // Rotation ambiguity: a round's trailing step can double as the next
      // round's opener, so a fold anchored one step later may consume the
      // run cleanly to its end (real case: an intro announce followed by
      // trivia-bluff rounds that also end each round with an announce).
      // Prefer the anchor that reaches further, leaving the intro out.
      const shifted = bestFoldAt(entries, i + 1);
      if (shifted && shifted.coverage >= here.coverage &&
          i + 1 + shifted.coverage > i + here.coverage) {
        out.push(entries[i].stop);
        i++;
        continue;
      }
      const folded = {
        kind: 'rounds',
        rounds: here.repeats,
        sub: entries.slice(i, i + here.period).map(e => e.stop.type),
        // Every phase id the fold covers, so a live view can match the
        // room's current phase to this stop ("you are here").
        ids: entries.slice(i, i + here.coverage).map(e => e.id)
      };
      // Sample excerpts from ACROSS the run (first, middle, last, then any
      // others), not just the opener: for content-carrying runs (Closer's
      // 13 talk prompts, a quiz's questions) the spread of samples IS the
      // activity, and one excerpt hid it.
      const covered = entries.slice(i, i + here.coverage);
      const ordered = [
        covered[0],
        covered[Math.floor(covered.length / 2)],
        covered[covered.length - 1]
      ].concat(covered);
      const samples = [];
      for (const e of ordered) {
        const d = e && e.stop.detail;
        if (d && !samples.includes(d)) samples.push(d);
        if (samples.length === 3) break;
      }
      if (samples.length > 0) folded.samples = samples;
      // The round's hand-off: the first one found inside the block (the
      // interesting flow usually lives mid-round, e.g. classmates' lies
      // becoming the choices).
      const blockCarry = entries.slice(i, i + here.period)
        .map(e => e.stop.carries).find(Boolean);
      if (blockCarry) folded.carries = blockCarry;
      out.push(folded);
      i += here.coverage;
    } else {
      out.push({ ...entries[i].stop, ids: [entries[i].id] });
      i++;
    }
  }
  return out;
}

export function buildActivityMap(config) {
  const phases = (config && config.phases) || {};
  let startId = null;
  for (const id of Object.keys(phases)) {
    if (phases[id] && phases[id].type === 'lobby') { startId = id; break; }
  }
  if (!startId) startId = Object.keys(phases)[0] || null;

  const entries = [];
  const visited = new Set();
  let current = startId;
  while (current && phases[current] && !visited.has(current)) {
    visited.add(current);
    const phase = phases[current];
    if (phase.type !== 'lobby' && phase.type !== 'end') {
      entries.push({ id: current, stop: stopFor(phase, phases) });
    }
    current = primaryNext(phase);
  }

  const map = { stops: collapseRepeats(entries) };

  // Talk-driven activities (Closer): the screens only carry questions, the
  // class does the rest out loud. Flag it so the map can say so — the step
  // list alone reads as "a pile of announcements" and explains nothing.
  const TYPED_INPUT_TYPES = new Set(['collect', 'collect-two', 'relay', 'merge']);
  const announceCount = entries.filter(e => phases[e.id].type === 'announce').length;
  const typedCount = entries.filter(e => TYPED_INPUT_TYPES.has(phases[e.id].type)).length;
  if (typedCount === 0 && announceCount >= 3 && announceCount >= entries.length / 2) {
    map.talk = true;
  }

  return map;
}
