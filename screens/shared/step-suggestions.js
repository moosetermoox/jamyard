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
        message: 'Welcome! Here is what we are doing today, listen up, then grab your device.'
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
        prompt: 'Take a guess, what number do you think it is?',
        timer: 60
      };
    },
    'reveal': function (ctx) {
      var src = lastOfType(ctx.phases, ['collect'], ctx.afterId);
      if (src) {
        return {
          type: 'reveal',
          template: 'Here is what we said, \n\n{{' + src + '.responses.list}}'
        };
      }
      return {
        type: 'reveal',
        template: 'Look up here, let us talk through what just happened.'
      };
    },
    'reveal-one': function (ctx) {
      var src = lastOfType(ctx.phases, ['collect'], ctx.afterId);
      return {
        type: 'reveal-one',
        message: 'One at a time, here they come.',
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
    },
    // "Secret + clue" — collect two things at once, the first kept hidden
    // until a reveal (Emoji Movies shape: title + emoji clues).
    'collect-two': function () {
      return {
        type: 'collect',
        prompt: 'Two parts, the class only sees the second one!',
        fields: [
          { label: 'The answer (kept secret until the reveal)', key: 'secret' },
          { label: 'The clue everyone will see', key: 'clue' }
        ],
        timer: 120
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
      { type: 'announce', title: 'Announcement', reason: 'set the scene. "here is what we are doing today"', mostCommon: true },
      { type: 'collect-choice', title: 'Multiple choice', reason: 'warm up with a quick poll' },
      { type: 'collect', title: 'Open answer', reason: 'jump straight to the question' },
      { type: 'estimate', title: 'Guess a number', reason: 'a low-stakes hook, everyone has a guess' }
    ];
  }

  function suggestAfter(stepType, ctx) {
    var phases = (ctx && ctx.phases) || {};
    var hasAnswers = !!lastOfType(phases, ['collect'], ctx && ctx.afterId);
    var out = [];

    if (stepType === 'collect') {
      out.push({ type: 'reveal', title: 'Reveal results', reason: 'show everyone’s answers on the projector', mostCommon: true });
      out.push({ type: 'guessing-rounds', title: 'Guessing rounds', reason: 'cycle through the answers, everyone guesses each one' });
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
      out.unshift({ type: 'end', title: 'Wrap it up', reason: 'this already has a full arc, end on a good note', feelsComplete: true });
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
        revealMessage: 'The big themes from your answers. '
      },
      {
        key: 'poem',
        title: 'Write a class poem',
        reason: 'one poem woven from every answer',
        task: 'generate',
        instructions: 'Write a short, warm poem (8-12 lines) that weaves in ideas from as many of the answers as possible. Keep it readable aloud in under a minute.',
        revealMessage: 'A poem made of your answers. '
      },
      {
        key: 'group',
        title: 'Group similar answers',
        reason: 'who is thinking alike?',
        task: 'summarize',
        instructions: 'Group the answers into clusters of similar thinking. Give each cluster a short name and list the answers that belong to it.',
        revealMessage: 'Here is who was thinking alike. '
      },
      {
        key: 'standout',
        title: 'Pick a standout',
        reason: 'one great answer, and why',
        task: 'summarize',
        instructions: 'Pick one answer that stands out for being thoughtful, surprising, or funny. Quote it and explain in two sentences why it stood out. Be kind, never mock an answer.',
        revealMessage: 'Today’s standout. '
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

  // ---- Guessing rounds: THE party-game shape ----
  // (Who Said It, Two Truths, Caption Contest, Excuse Machine, Emoji
  // Movies are all this.) A foreach over the last collect: show each
  // submission -> everyone guesses -> reveal. When the source is a
  // secret+clue pair, the clue is shown and the secret is the reveal.

  function buildGuessingRounds(ctx) {
    var phases = (ctx && ctx.phases) || {};
    var src = lastOfType(phases, ['collect'], ctx && ctx.afterId);
    if (!src) return null;
    var srcPhase = phases[src];
    var keys = Array.isArray(srcPhase.fields)
      ? srcPhase.fields.map(function (f) { return f.key; }).filter(Boolean)
      : [];
    var hasPair = keys.length >= 2;
    var clueRef = hasPair ? '{{_current.fields.' + keys[keys.length - 1] + '}}' : '{{_current.text}}';
    var secretRef = hasPair ? '{{_current.fields.' + keys[0] + '}}' : null;

    var id = freshId(phases, 'rounds');
    var phase = {
      type: 'foreach',
      data: src + '.responses',
      shuffle: true,
      subPhases: {
        'show': {
          type: 'announce',
          message: 'Round {{_foreach.' + id + '.index}} of {{_foreach.' + id + '.total}}:\n\n' + clueRef + '\n\nWhat do you think?'
        },
        'guess': {
          type: 'collect',
          prompt: clueRef + '\n\nType your guess:',
          timer: 30
        },
        'reveal': {
          type: 'announce',
          message: hasPair
            ? 'It was… ' + secretRef + '!\n\n(from {{_current.playerName}})\n\nHands up if you got it!'
            : 'That one was {{_current.playerName}}’s!'
        }
      }
    };
    return { id: id, phase: phase };
  }

  // ---- Storyboard compiler ----
  // The AI proposes a storyboard: a SEQUENCE OF BRICKS with words, never
  // raw config. This compiles it through the same validated builders the
  // Builder's + buttons use — invalid structure is impossible by
  // construction, and problems come back as plain sentences.
  //
  // storyboard: { name, description, steps: [
  //   { brick: 'announce'|'collect'|'collect-two'|'collect-choice'|
  //            'estimate'|'reveal'|'reveal-one'|'vote'|'guessing-rounds'|
  //            'quiz'|'teams'|'end',
  //     text?: string,          // the brick's primary field (prompt/message)
  //     choices?: string[],     // collect-choice only
  //     secretLabel?: string,   // collect-two field labels
  //     clueLabel?: string,
  //     questions?: [{ text, choices, correct }],  // quiz only
  //     speedBonus?: boolean,   // quiz only (default true)
  //     teamCount?: number,     // teams only (2-20)
  //     groupSize?: number,     // teams only (2-12, wins over teamCount)
  //     timer?: number } ] }

  var STORYBOARD_PRIMARY = {
    'announce': 'message', 'collect': 'prompt', 'collect-two': 'prompt',
    'collect-choice': 'prompt', 'estimate': 'prompt', 'reveal': 'template',
    'reveal-one': 'message', 'end': 'message'
  };

  // ---- Quiz brick ----
  // Compiles to the proven Speed Quiz shape: a graded collect-choice per
  // question, an answer announce after each, then a leaderboard summing
  // every question's scores. Structure is deterministic; the AI supplies
  // only the questions and words. Wires phases in place, returns the new
  // lastId, or null when nothing usable compiled.
  var MAX_QUIZ_QUESTIONS = 15;

  function appendQuizChain(step, stepNo, phases, lastId, problems) {
    var raw = Array.isArray(step.questions) ? step.questions : [];
    var speedBonus = step.speedBonus !== false;
    var timer = (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600)
      ? Math.round(step.timer) : 15;
    if (raw.length > MAX_QUIZ_QUESTIONS) {
      problems.push('Step ' + stepNo + ': quizzes cap at ' + MAX_QUIZ_QUESTIONS +
        ' questions, the extras were dropped.');
      raw = raw.slice(0, MAX_QUIZ_QUESTIONS);
    }

    var scoreRefs = [];
    raw.forEach(function (q, qi) {
      var text = (q && typeof q.text === 'string') ? q.text.trim() : '';
      var choices = (q && Array.isArray(q.choices) ? q.choices : []).slice(0, 8).map(String);
      var correct = (q && typeof q.correct === 'string') ? q.correct : '';
      if (!text || choices.length < 2 || choices.indexOf(correct) === -1) {
        problems.push('Step ' + stepNo + ', question ' + (qi + 1) +
          ': needs a question, 2-8 choices, and a correct answer that exactly matches one choice.');
        return;
      }
      var qId = freshId(phases, 'quiz');
      phases[lastId].next = qId;
      phases[qId] = {
        type: 'collect-choice',
        prompt: text,
        choices: choices,
        correctAnswer: correct,
        pointsCorrect: 1000,
        speedBonus: speedBonus,
        timer: timer
      };
      var aId = freshId(phases, 'answer');
      phases[qId].next = aId;
      phases[aId] = {
        type: 'announce',
        message: 'The answer was: ' + correct + '!\n\nClass picks:\n{{' + qId + '.barChart}}'
      };
      lastId = aId;
      scoreRefs.push(qId + '.scores');
    });

    if (scoreRefs.length === 0) {
      if (raw.length === 0) {
        problems.push('Step ' + stepNo + ': the quiz has no questions.');
      }
      return null;
    }

    var lbId = freshId(phases, 'standings');
    phases[lastId].next = lbId;
    phases[lbId] = { type: 'leaderboard', from: scoreRefs, style: 'full' };
    return lbId;
  }

  // ---- Teams brick ----
  // Random split only in storyboards (the editor offers the other methods).
  // groupSize wins over teamCount; out-of-range values fall back to 4 teams.
  function buildTeamSplit(step) {
    var phase = { type: 'team-split', method: 'random' };
    var gs = (step && typeof step.groupSize === 'number') ? Math.round(step.groupSize) : null;
    var tc = (step && typeof step.teamCount === 'number') ? Math.round(step.teamCount) : null;
    if (gs && gs >= 2 && gs <= 12) {
      phase.groupSize = gs;
    } else if (tc && tc >= 2 && tc <= 20) {
      phase.teamCount = tc;
    } else {
      phase.teamCount = 4;
    }
    return phase;
  }

  function compileStoryboard(storyboard) {
    var problems = [];
    var steps = (storyboard && Array.isArray(storyboard.steps)) ? storyboard.steps : [];
    if (steps.length === 0) {
      return { config: null, problems: ['The storyboard has no steps.'] };
    }

    var phases = { lobby: { type: 'lobby' } };
    var lastId = 'lobby';

    steps.forEach(function (step, i) {
      var brick = step && step.brick;
      var built = null;
      var id = null;

      if (brick === 'quiz') {
        var quizLast = appendQuizChain(step, i + 1, phases, lastId, problems);
        if (quizLast) lastId = quizLast;
        return;
      }

      if (brick === 'teams') {
        id = freshId(phases, 'teams');
        phases[lastId].next = id;
        phases[id] = buildTeamSplit(step);
        lastId = id;
        return;
      }

      if (brick === 'guessing-rounds') {
        var rounds = buildGuessingRounds({ phases: phases, afterId: lastId });
        if (!rounds) {
          problems.push('Step ' + (i + 1) + ': guessing rounds need a question step before them.');
          return;
        }
        id = rounds.id;
        built = rounds.phase;
      } else if (BUILDERS[brick]) {
        built = defaultPhaseFor(brick, { phases: phases, afterId: lastId });
        id = freshId(phases, BASE_ID_FOR[brick] || brick);
      } else {
        problems.push('Step ' + (i + 1) + ': unknown brick "' + String(brick) + '".');
        return;
      }

      // The AI's words land on the brick's primary field; structure stays ours.
      var primary = STORYBOARD_PRIMARY[brick];
      if (primary && step.text && typeof step.text === 'string') {
        built[primary] = step.text;
      }
      if (brick === 'collect-choice' && Array.isArray(step.choices) && step.choices.length >= 2) {
        built.choices = step.choices.slice(0, 8).map(String);
      }
      if (brick === 'collect-two' && built.fields) {
        if (step.secretLabel) built.fields[0].label = String(step.secretLabel);
        if (step.clueLabel) built.fields[1].label = String(step.clueLabel);
      }
      if (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600 &&
          (brick === 'collect' || brick === 'collect-two' || brick === 'collect-choice' || brick === 'estimate')) {
        built.timer = Math.round(step.timer);
      }

      phases[lastId].next = id;
      phases[id] = built;
      lastId = id;
    });

    if (Object.keys(phases).length === 1) {
      return { config: null, problems: problems.length ? problems : ['No usable steps.'] };
    }

    if (!hasEnd(phases)) {
      var endId = freshId(phases, 'wrap');
      phases[lastId].next = endId;
      phases[endId] = defaultPhaseFor('end', { phases: phases });
      lastId = endId;
    }

    var config = {
      name: String((storyboard && storyboard.name) || 'New Activity').slice(0, 60),
      description: String((storyboard && storyboard.description) || '').slice(0, 300),
      minPlayers: 2,
      phases: phases
    };
    return { config: config, problems: problems };
  }

  var BASE_ID_FOR = {
    'collect': 'ask', 'collect-two': 'share', 'collect-choice': 'poll',
    'estimate': 'guess', 'announce': 'announce', 'reveal': 'show',
    'reveal-one': 'show-one', 'vote': 'vote', 'end': 'wrap'
  };

  // ---- Reorder: move a step one slot up/down the next-chain ----
  // Pointer surgery only (never rebuilds pointers wholesale) so branch
  // fields (approveNext, nextByWinner, …) stay untouched. Returns false
  // for illegal moves: lobby/end, above the lobby, below the end, or a
  // step whose chain-predecessor doesn't point at it (branch-entered).

  function moveStep(phasesObj, id, dir) {
    var ph = phasesObj[id];
    if (!ph || ph.type === 'lobby' || ph.type === 'end') return false;
    var order = orderedPhaseIds(phasesObj);
    var i = order.indexOf(id);
    if (i <= 0) return false;

    var target;
    if (dir === 'up') {
      var above = order[i - 1];
      if (!phasesObj[above] || phasesObj[above].type === 'lobby') return false;
      target = order[i - 2];
      if (target === undefined) return false;
    } else {
      var below = order[i + 1];
      if (below === undefined || !phasesObj[below] || phasesObj[below].type === 'end') return false;
      target = below;
    }

    var prev = order[i - 1];
    if (!phasesObj[prev] || phasesObj[prev].next !== id) return false;
    phasesObj[prev].next = ph.next;
    ph.next = phasesObj[target].next;
    phasesObj[target].next = id;
    return true;
  }

  var api = {
    moveStep: moveStep,
    buildGuessingRounds: buildGuessingRounds,
    compileStoryboard: compileStoryboard,
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
