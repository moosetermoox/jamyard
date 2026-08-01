// Step suggestions — the brain behind the Builder view's "+" buttons.
//
// Answers three questions with ZERO AI calls:
//   1. What steps make sense next?   (suggestAfter / suggestOpening)
//   2. Does this activity have an arc yet?  (hasArc → offer "Wrap it up")
//   3. What does a suggested step look like so it works AS-IS?
//      (defaultPhaseFor / aiFlavors — every default must pass the
//       validator; tests/screens/step-suggestions.test.js enforces it)
//
// Rankings come from transition frequencies mined from the built-in
// activities (scripts: see docs/SURFACES-PLAN.md; mined 2026-08-01 from
// 40+ configs — announce opens 33 of 40 activities, collect→reveal is the
// most common transition at 17). Re-mine when the library shifts.
//
// Browser global + side-effect-importable for tests (bot-brain pattern).

(function () {
  'use strict';

  // ---- What the Builder can suggest and default (v1 curated set) ----
  // Only types whose defaults are guaranteed hostable-as-is belong here.

  var ASK_TYPES = ['collect', 'collect-choice', 'estimate'];
  var SHOW_DECIDE_TYPES = ['reveal', 'reveal-one', 'vote', 'leaderboard',
    'rank', 'rate', 'match', 'sort'];

  // ---- Ordering: follow the next-chain from lobby ----

  function orderedPhaseIds(phases) {
    var ids = Object.keys(phases || {});
    if (ids.length === 0) return [];
    var start = phases.lobby ? 'lobby' : ids[0];
    var order = [];
    var seen = {};
    var cur = start;
    while (cur && phases[cur] && !seen[cur]) {
      order.push(cur);
      seen[cur] = true;
      cur = phases[cur].next;
    }
    // Anything unreachable from the chain still shows (at the end) so the
    // Builder never hides a step the Advanced canvas would show.
    for (var i = 0; i < ids.length; i++) {
      if (!seen[ids[i]]) order.push(ids[i]);
    }
    return order;
  }

  function lastOfType(phases, types, beforeId) {
    var order = orderedPhaseIds(phases);
    if (beforeId) {
      var cut = order.indexOf(beforeId);
      if (cut !== -1) order = order.slice(0, cut + 1);
    }
    for (var i = order.length - 1; i >= 0; i--) {
      var ph = phases[order[i]];
      if (ph && types.indexOf(ph.type) !== -1) return order[i];
    }
    return null;
  }

  // ---- Unique ids ----

  function freshId(phases, base) {
    if (!phases[base]) return base;
    var n = 2;
    while (phases[base + '-' + n]) n++;
    return base + '-' + n;
  }

  // ---- Arc detection: ≥1 ask + ≥1 show/decide = a complete experience ----

  function hasArc(phases) {
    var ask = false;
    var show = false;
    for (var id in phases) {
      var t = (phases[id] || {}).type;
      if (ASK_TYPES.indexOf(t) !== -1) ask = true;
      if (SHOW_DECIDE_TYPES.indexOf(t) !== -1 || t === 'ai-process') show = true;
    }
    return ask && show;
  }

  function hasEnd(phases) {
    for (var id in phases) {
      if ((phases[id] || {}).type === 'end') return true;
    }
    return false;
  }

  // ---- Default phase builders ----
  // Every builder returns a phase that passes the validator with NO edits.
  // ctx: { phases } — the activity so far (used to wire data refs).

  var BUILDERS = {
    'announce': function () {
      return {
        type: 'announce',
        message: 'Welcome! Here is what we are doing today — listen up, then grab your device.'
      };
    },
    'collect': function () {
      return {
        type: 'collect',
        prompt: 'What is one thing you learned today?',
        timer: 60
      };
    },
    'collect-choice': function () {
      return {
        type: 'collect-choice',
        prompt: 'How are you feeling about this so far?',
        choices: ['Got it!', 'Mostly got it', 'A little confused', 'Lost'],
        timer: 45
      };
    },
    'estimate': function () {
      return {
        type: 'estimate',
        prompt: 'Take a guess — what number do you think it is?',
        timer: 60
      };
    },
    'reveal': function (ctx) {
      var src = lastOfType(ctx.phases, ['collect'], ctx.afterId);
      if (src) {
        return {
          type: 'reveal',
          template: 'Here is what we said —\n\n{{' + src + '.responses.list}}'
        };
      }
      return {
        type: 'reveal',
        template: 'Look up here — let us talk through what just happened.'
      };
    },
    'reveal-one': function (ctx) {
      var src = lastOfType(ctx.phases, ['collect'], ctx.afterId);
      return {
        type: 'reveal-one',
        message: 'One at a time — here they come.',
        from: src ? src + '.responses' : undefined
      };
    },
    'vote': function (ctx) {
      var src = lastOfType(ctx.phases, ['collect'], ctx.afterId);
      if (src) {
        return {
          type: 'vote',
          mode: 'pick-one',
          candidates: src + '.responses',
          timer: 45
        };
      }
      return {
        type: 'vote',
        mode: 'pick-one',
        prompt: 'Where do you stand?',
        candidates: ['Agree', 'Disagree', 'It depends'],
        timer: 45
      };
    },
    'end': function () {
      return {
        type: 'end',
        message: 'That is a wrap! Nice work today, everyone.'
      };
    }
  };

  function defaultPhaseFor(type, ctx) {
    var builder = BUILDERS[type];
    if (!builder) return null;
    var phase = builder(ctx || { phases: {} });
    // Strip undefined optionals so JSON round-trips clean.
    for (var k in phase) {
      if (phase[k] === undefined) delete phase[k];
    }
    return phase;
  }

  // ---- Suggestion rows ----
  // Each: { type, title, reason, mostCommon? , ai? }
  // Rankings follow the mined transition table, filtered to v1 types and
  // to refs that can actually resolve (no "reveal the answers" before any
  // answers exist).

  function suggestOpening() {
    return [
      { type: 'announce', title: 'Announcement', reason: 'set the scene — "here is what we are doing today"', mostCommon: true },
      { type: 'collect-choice', title: 'Multiple choice', reason: 'warm up with a quick poll' },
      { type: 'collect', title: 'Open answer', reason: 'jump straight to the question' },
      { type: 'estimate', title: 'Guess a number', reason: 'a low-stakes hook — everyone has a guess' }
    ];
  }

  function suggestAfter(stepType, ctx) {
    var phases = (ctx && ctx.phases) || {};
    var hasAnswers = !!lastOfType(phases, ['collect'], ctx && ctx.afterId);
    var out = [];

    if (stepType === 'collect') {
      out.push({ type: 'reveal', title: 'Reveal results', reason: 'show everyone’s answers on the projector', mostCommon: true });
      out.push({ type: 'ai', title: 'AI transforms answers', reason: 'turn them into a summary, themes, or a poem', ai: true });
      out.push({ type: 'vote', title: 'Vote', reason: 'the class picks a favorite' });
      out.push({ type: 'collect', title: 'Ask another question', reason: 'build a second round' });
    } else if (stepType === 'collect-choice' || stepType === 'estimate') {
      out.push({ type: 'announce', title: 'Talk it through', reason: 'pause on what the class just said', mostCommon: true });
      out.push({ type: 'collect', title: 'Open answer', reason: 'dig deeper in their own words' });
      if (hasAnswers) out.push({ type: 'reveal', title: 'Reveal results', reason: 'show the answers so far' });
      out.push({ type: 'collect-choice', title: 'Another question', reason: 'keep the round going' });
    } else if (stepType === 'announce') {
      out.push({ type: 'collect', title: 'Open answer', reason: 'ask the question you just set up', mostCommon: true });
      out.push({ type: 'collect-choice', title: 'Multiple choice', reason: 'a quick structured check' });
      out.push({ type: 'estimate', title: 'Guess a number', reason: 'estimation hooks everyone' });
      if (hasAnswers) out.push({ type: 'ai', title: 'AI transforms answers', reason: 'do something with the earlier answers', ai: true });
    } else if (stepType === 'reveal' || stepType === 'reveal-one') {
      if (hasAnswers) out.push({ type: 'vote', title: 'Vote', reason: 'which one stood out?', mostCommon: true });
      out.push({ type: 'collect', title: 'Ask a follow-up', reason: 'one more round, deeper this time' });
      out.push({ type: 'announce', title: 'Talk it through', reason: 'a discussion moment before moving on' });
    } else if (stepType === 'vote') {
      out.push({ type: 'announce', title: 'Talk it through', reason: 'sit with the result for a moment', mostCommon: true });
      out.push({ type: 'collect', title: 'Ask a follow-up', reason: 'dig into the winner' });
    } else if (stepType === 'ai-process') {
      out.push({ type: 'vote', title: 'Vote', reason: 'react to what the AI made', mostCommon: hasAnswers });
      out.push({ type: 'collect', title: 'Ask a follow-up', reason: 'respond to the AI’s take' });
      out.push({ type: 'announce', title: 'Talk it through', reason: 'discuss before moving on' });
    } else {
      out.push({ type: 'collect', title: 'Open answer', reason: 'ask the class something', mostCommon: true });
      out.push({ type: 'announce', title: 'Announcement', reason: 'set up what happens next' });
    }

    // Vote needs candidates that resolve; without answers the literal
    // fallback works, but "pick a favorite" of nothing is nonsense — drop
    // answer-dependent suggestions when there are no answers yet.
    out = out.filter(function (s) {
      if ((s.type === 'vote' || s.type === 'ai') && !hasAnswers &&
          (stepType === 'collect' || stepType === 'reveal' || stepType === 'reveal-one')) {
        return false;
      }
      return true;
    });

    // The wrap-up joins only once the activity has an arc and no end yet.
    if (hasArc(phases) && !hasEnd(phases)) {
      out.unshift({ type: 'end', title: 'Wrap it up', reason: 'this already has a full arc — end on a good note', feelsComplete: true });
      // Keep "most common" on at most one tile.
      for (var i = 1; i < out.length; i++) out[i].mostCommon = false;
    }

    return out.slice(0, 4);
  }

  // ---- AI flavors: the one step type that cannot land blank ----
  // Each flavor carries real instructions and lands as a PAIR:
  // ai-process + the reveal that stages its result.

  function aiFlavors() {
    return [
      {
        key: 'themes',
        title: 'Find the big themes',
        reason: '"the class said three things today…"',
        mostCommon: true,
        task: 'summarize',
        instructions: 'Read all the answers. Find the 2-3 big themes the class is circling around. Name each theme in a friendly phrase and quote one anonymous answer for each.',
        revealMessage: 'The big themes from your answers —'
      },
      {
        key: 'poem',
        title: 'Write a class poem',
        reason: 'one poem woven from every answer',
        task: 'generate',
        instructions: 'Write a short, warm poem (8-12 lines) that weaves in ideas from as many of the answers as possible. Keep it readable aloud in under a minute.',
        revealMessage: 'A poem made of your answers —'
      },
      {
        key: 'group',
        title: 'Group similar answers',
        reason: 'who is thinking alike?',
        task: 'summarize',
        instructions: 'Group the answers into clusters of similar thinking. Give each cluster a short name and list the answers that belong to it.',
        revealMessage: 'Here is who was thinking alike —'
      },
      {
        key: 'standout',
        title: 'Pick a standout',
        reason: 'one great answer, and why',
        task: 'summarize',
        instructions: 'Pick one answer that stands out for being thoughtful, surprising, or funny. Quote it and explain in two sentences why it stood out. Be kind — never mock an answer.',
        revealMessage: 'Today’s standout —'
      }
    ];
  }

  // Build the ai-process + reveal pair for a flavor. Returns
  // [{id, phase}, {id, phase}] ready to insert in order.
  function buildAiPair(flavor, ctx) {
    var phases = (ctx && ctx.phases) || {};
    var src = lastOfType(phases, ['collect'], ctx && ctx.afterId);
    if (!src) return null; // AI steps are only suggested when answers exist
    var aiId = freshId(phases, 'ai-' + flavor.key);
    var aiPhase = {
      type: 'ai-process',
      task: flavor.task,
      input: src + '.responses',
      instruction: flavor.instructions
    };
    var shadow = {};
    for (var k in phases) shadow[k] = phases[k];
    shadow[aiId] = aiPhase;
    var revealId = freshId(shadow, 'show-' + flavor.key);
    var revealPhase = {
      type: 'reveal',
      template: flavor.revealMessage + '\n\n{{' + aiId + '.result}}'
    };
    return [
      { id: aiId, phase: aiPhase },
      { id: revealId, phase: revealPhase }
    ];
  }

  // ---- Insertion: splice a phase into the next-chain after a step ----
  // Mutates a COPY caller passes in (builder-view hands the live config —
  // it owns dirty-marking and re-render).

  function insertAfter(phases, afterId, newId, newPhase) {
    var prev = phases[afterId];
    if (!prev) return false;
    newPhase.next = prev.next;
    prev.next = newId;
    phases[newId] = newPhase;
    return true;
  }

  var api = {
    ASK_TYPES: ASK_TYPES,
    SHOW_DECIDE_TYPES: SHOW_DECIDE_TYPES,
    orderedPhaseIds: orderedPhaseIds,
    lastOfType: lastOfType,
    freshId: freshId,
    hasArc: hasArc,
    hasEnd: hasEnd,
    defaultPhaseFor: defaultPhaseFor,
    suggestOpening: suggestOpening,
    suggestAfter: suggestAfter,
    aiFlavors: aiFlavors,
    buildAiPair: buildAiPair,
    insertAfter: insertAfter
  };

  globalThis.StepSuggestions = api;
})();
