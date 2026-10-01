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

  // The nearest collect whose answers are single lines; falls back to any
  // collect (a secret+clue step ranks by its text field) so the Builder
  // never leaves a rank step with nothing behind it.
  function lastPlainCollect(phases, beforeId) {
    var order = orderedPhaseIds(phases);
    if (beforeId) {
      var cut = order.indexOf(beforeId);
      if (cut !== -1) order = order.slice(0, cut + 1);
    }
    for (var i = order.length - 1; i >= 0; i--) {
      var ph = phases[order[i]];
      if (ph && ph.type === 'collect' && !Array.isArray(ph.fields)) return order[i];
    }
    return lastOfType(phases, ['collect'], beforeId);
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
      // `question`, not `prompt`: the vote step's field (a literal vote
      // from the storyboard failed the validator for months, 2026-09-20).
      return {
        type: 'vote',
        mode: 'pick-one',
        question: 'Where do you stand?',
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
    // Rank (2026-09-07): the class drags the collected answers into an
    // order; the aggregate order is read back by a reveal of
    // {{X.rankedList}} (compileStoryboard adds that reveal, the Builder's
    // + button adds just the step). A plain collect is preferred over a
    // secret+clue one (two-field answers rank as their text only).
    'rank': function (ctx) {
      var src = lastPlainCollect(ctx.phases, ctx.afterId);
      if (!src) return null;
      return {
        type: 'rank',
        prompt: 'Put these in order, your favorite at the top.',
        candidates: src + '.responses',
        timer: 90
      };
    },
    // Buzzer round (2026-09-27): the teacher asks out loud, the first to
    // buzz answers, the teacher marks it on the console (Lightning Round's
    // step). compileStoryboard adds the standings after it.
    'buzz': function () {
      return {
        type: 'buzz',
        prompt: 'Listen for the question, then buzz!',
        points: 10
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

    // guess: 'who' (2026-09-07) = the Who Said It? shape: the answer (or
    // the clue) goes up, everyone picks WHO wrote it from a roster of the
    // author plus decoys, then the author is revealed with the class's
    // guesses. No points: nothing here promises a score.
    if (ctx && ctx.guess === 'who') {
      var whoId = freshId(phases, 'who-rounds');
      return {
        id: whoId,
        src: src,
        phase: {
          type: 'foreach',
          data: src + '.responses',
          shuffle: true,
          candidateSource: 'players',
          decoyCount: 3,
          subPhases: {
            'show': {
              type: 'announce',
              message: 'Round {{_foreach.' + whoId + '.index}} of {{_foreach.' + whoId + '.total}}:\n\n' + clueRef + '\n\nWho said it?'
            },
            'guess': {
              type: 'collect-choice',
              prompt: 'Who do you think said: "' + clueRef + '"?',
              choices: '_candidates',
              timer: 20
            },
            'reveal': {
              type: 'announce',
              message: 'How the class guessed:\n{{guess.barChart}}\n\n' +
                (hasPair
                  ? 'It was ' + secretRef + ', from {{_current.playerName}}!'
                  : 'It was {{_current.playerName}}!')
            }
          }
        }
      };
    }

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
    return { id: id, src: src, phase: phase };
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
  //            'rank'|'quiz'|'teams'|'chain'|'deal'|'end',
  //     text?: string,          // the brick's primary field (prompt/message)
  //     choices?: string[],     // collect-choice only
  //     video?: string,         // announce, collect, collect-choice: a YouTube
  //                             //   link the projector plays (engine/video.js)
  //     guess?: 'who',          // guessing-rounds only: pick the author from a roster
  //     items?: string[],       // rank only: a teacher-written list (else the last collect's answers)
  //     byGroup?: boolean,      // rank only: each group (a teams step earlier) decides one order
  //     perChoice?: number,     // assign only: how many groups may share one item (else an even spread)
  //     secretLabel?: string,   // collect-two field labels
  //     clueLabel?: string,
  //     questions?: [{ text, choices, correct }],  // quiz only
  //     speedBonus?: boolean,   // quiz only (default true)
  //     leaderboard?: boolean,  // quiz only (default true; false = no standings, no winners)
  //     teamCount?: number,     // teams only (2-20)
  //     groupSize?: number,     // teams only (2-12, wins over teamCount)
  //     start?: string,         // chain only: the first writer's instruction
  //     hops?: string[],        // chain only: one instruction per hand-off (1-6)
  //     visibility?: string,    // chain only: 'all'|'tail'|'blind' (default 'all')
  //     sentence?: string,      // chain only, blind: "The {1} {2}." slot template
  //     draft?: string,         // feedback only: the piece each student writes first
  //                             //   (else the last plain collect is the piece)
  //     readers?: number,       // feedback only: 1 (default) or 2 classmates read it
  //     talk?: string,          // quiet only: the host-paced line after the quiet
  //     pick?: string,          // hotseat only: 'random' (default) | 'vote'
  //     voteText?: string,      // hotseat only, pick 'vote': the vote's question
  //     piles?: [{label, prompt}], // deal only: 2-4 piles everyone adds one item to
  //     writeTimer?: number,    // deal only: seconds for the writing step (default 480)
  //     rounds?: string[],      // pairs only: 0-3 follow-up instructions, same partner,
  //                             //   the partner's latest piece shown under each
  //     sides?: [string, string], // pairs only: two sides dealt one per partner
  //     roles?: string[],       // roles only: 2-8 job names, one per group member
  //     method?: string,        // roles only: 'random' (default) | 'choice'
  //     tasks?: string[],       // roles only: a shared checklist; "Job: task" tags a job
  //                             //   (text = the checklist instruction)
  //     answer?: number,        // estimate only: the true number (else poll mode)
  //     unit?: string,          // estimate only, with answer
  //     scoring?: string,       // estimate only, with answer: 'closest' (default) | 'graduated'
  //     gallery?: string,       // draw only: the line over the one-at-a-time gallery
  //                             //   (text = the drawing instruction; timer = seconds to draw)
  //     heading?: string,       // summarize only: the projector line over the result
  //                             //   (text = the summarizing instruction)
  //     timer? } ] }            // deal: seconds per pile step; pairs: per writing step

  // The same five YouTube shapes engine/video.js embeds (watch, youtu.be,
  // embed, shorts, live), each with an 11-character id.
  var YOUTUBE_LINK = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)[A-Za-z0-9_-]{11}/;

  var STORYBOARD_PRIMARY = {
    'announce': 'message', 'collect': 'prompt', 'collect-two': 'prompt',
    'collect-choice': 'prompt', 'estimate': 'prompt', 'reveal': 'template',
    'reveal-one': 'message', 'rank': 'prompt', 'assign': 'message', 'end': 'message',
    'buzz': 'prompt'
  };

  // ---- Quiz brick ----
  // Compiles to the proven Speed Quiz shape: a graded collect-choice per
  // question, an answer announce after each, then a leaderboard summing
  // every question's scores. Structure is deterministic; the AI supplies
  // only the questions and words. Wires phases in place, returns the new
  // lastId, or null when nothing usable compiled.
  var MAX_QUIZ_QUESTIONS = 15;

  // Mirrors engine/phases/confidence.js (a test keeps them equal)
  var CONFIDENCE_PROMPT = 'How sure are you of your answer?';
  var CONFIDENCE_LEVELS = ['Just guessing', 'Not sure', 'Pretty sure', 'Certain'];
  var CONFIDENCE_TIMER = 15;

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
      // confidence: true (2026-10-01): "how sure are you?" between the
      // question and its answer, and the answer card shows how sure the
      // right ones were beside the wrong ones. The words are English here;
      // the engine puts them in the activity's language per room.
      var beforeAnswer = qId;
      var confidenceLines = '';
      if (step.confidence === true) {
        var cId = freshId(phases, 'sure');
        phases[qId].next = cId;
        phases[cId] = {
          type: 'collect-choice',
          prompt: CONFIDENCE_PROMPT,
          choices: CONFIDENCE_LEVELS.slice(),
          confidenceFor: qId,
          chartOrder: 'choices',
          timer: CONFIDENCE_TIMER
        };
        beforeAnswer = cId;
        confidenceLines = '\n\n{{' + cId + '.confidenceChart}}\n\n{{' + cId + '.confidenceLine}}';
      }
      var aId = freshId(phases, 'answer');
      phases[beforeAnswer].next = aId;
      phases[aId] = {
        type: 'announce',
        message: 'The answer was: ' + correct + '!\n\nClass picks:\n{{' + qId + '.barChart}}' + confidenceLines
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

    // leaderboard: false = a no-winners quiz. Every question still grades
    // and reveals the answer with the class split; nothing ranks anyone.
    if (step.leaderboard === false) return lastId;

    var lbId = freshId(phases, 'standings');
    phases[lastId].next = lbId;
    phases[lbId] = { type: 'leaderboard', from: scoreRefs, style: 'full' };
    // A teams step earlier in the plan makes this a real team competition:
    // individual points roll up into ranked team totals on the projector.
    var splitId = null;
    for (var pid in phases) {
      if (phases[pid].type === 'team-split') splitId = pid;
    }
    if (splitId) phases[lbId].teamsFrom = splitId;
    return lbId;
  }

  // ---- Chain brick ----
  // Pass-around mechanics (telephone, consequences, exquisite corpse)
  // compiled deterministically: the AI supplies only per-hop instructions
  // and a visibility choice; every rotateFrom link, accumulate flag, and
  // the return-to-author reveal is emitted here. Bricks are mechanics,
  // not phases — the AI never wires a chain itself. Visibility:
  //   'all'   — each writer sees the whole text so far (add-only)
  //   'tail'  — the fold: only the last 3 inherited words show (showTail)
  //   'blind' — writers see nothing of what they received
  // A 'sentence' with {N} slots (blind only) assembles one-word chains
  // into the classic surrealist payoff.
  var MAX_CHAIN_HOPS = 6;
  var CHAIN_TAIL_WORDS = 3;

  function appendPassChain(step, stepNo, phases, lastId, problems) {
    var start = (step && typeof step.start === 'string') ? step.start.trim() : '';
    var hops = (step && Array.isArray(step.hops) ? step.hops : [])
      .map(function (h) { return typeof h === 'string' ? h.trim() : ''; })
      .filter(function (h) { return h !== ''; });
    if (!start) {
      problems.push('Step ' + stepNo + ': the chain needs a "start" instruction for the first writer.');
      return null;
    }
    if (hops.length === 0) {
      problems.push('Step ' + stepNo + ': the chain needs at least one hand-off instruction in "hops".');
      return null;
    }
    if (hops.length > MAX_CHAIN_HOPS) {
      problems.push('Step ' + stepNo + ': chains cap at ' + MAX_CHAIN_HOPS + ' hand-offs, the extras were dropped.');
      hops = hops.slice(0, MAX_CHAIN_HOPS);
    }
    var visibility = (step.visibility === 'tail' || step.visibility === 'blind') ? step.visibility : 'all';
    var blind = visibility === 'blind';
    var sentence = (typeof step.sentence === 'string' && /\{\d+\}/.test(step.sentence)) ? step.sentence : null;
    if (sentence && !blind) {
      problems.push('Step ' + stepNo + ': a sentence template only works on a blind chain (with "all" or "tail" every hop already contains the earlier text); the sentence was ignored.');
      sentence = null;
    }
    var timer = (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600)
      ? Math.round(step.timer) : null;

    // Blindness is structural: a {{...}} token in a blind prompt would
    // hand the writer the very text the fold hides.
    function cleanPrompt(text) {
      if (blind && text.indexOf('{{') !== -1) {
        problems.push('Step ' + stepNo + ': removed a template token from a blind chain prompt, writers must not see the passed text.');
        return text.replace(/\{\{[^}]*\}\}/g, '').replace(/[ \t]{2,}/g, ' ').trim();
      }
      return text;
    }

    var chainIds = [];
    var startId = freshId(phases, 'chain-start');
    var startPhase = { type: 'collect', prompt: cleanPrompt(start) };
    if (timer) startPhase.timer = timer;
    if (sentence) startPhase.maxLength = 40;
    phases[lastId].next = startId;
    phases[startId] = startPhase;
    chainIds.push(startId);
    lastId = startId;

    hops.forEach(function (hop) {
      var hopId = freshId(phases, 'pass');
      var hopPhase = { type: 'collect', prompt: cleanPrompt(hop), rotateFrom: lastId };
      if (!blind) {
        hopPhase.prefillFromAssigned = true;
        hopPhase.appendOnly = true;
        if (visibility === 'tail') hopPhase.showTail = CHAIN_TAIL_WORDS;
      }
      if (timer) hopPhase.timer = timer;
      if (sentence) hopPhase.maxLength = 40;
      phases[lastId].next = hopId;
      phases[hopId] = hopPhase;
      chainIds.push(hopId);
      lastId = hopId;
    });

    var revealId = freshId(phases, 'unfold');
    var reveal = { type: 'reveal', scope: 'own', chainFrom: chainIds };
    if (sentence) {
      reveal.chainDisplay = 'template';
      reveal.chainTemplate = sentence;
    } else if (blind) {
      reveal.chainDisplay = 'steps';
    } else {
      reveal.chainDisplay = 'final';
    }
    phases[lastId].next = revealId;
    phases[revealId] = reveal;
    return revealId;
  }

  // ---- Feedback brick ----
  // Peer feedback on each student's own piece (2026-10-01, the inventory's
  // Part 3): a draft (this brick's "draft" question, else the last plain
  // collect), one or two classmates who each read the DRAFT and write
  // feedback in their own box, and a private return to the writer with
  // every comment under it. The chain brick did this before, but its
  // readers added to the draft itself and a second reader read the first
  // one's comment; here the second reader rotates through the first
  // reader's reply (so the chain comes home) with showOriginal (so they
  // see the draft). The AI writes only the words.
  //   text     what each reader writes (required)
  //   draft    the question the writers answer first (optional)
  //   readers  1 (default) or 2
  //   timer    seconds per feedback step (optional)

  function appendFeedback(step, stepNo, phases, lastId, problems) {
    var text = (step && typeof step.text === 'string') ? step.text.trim() : '';
    if (!text) {
      problems.push('Step ' + stepNo + ': peer feedback needs "text", what each reader writes for the writer.');
      return null;
    }
    // The draft shows under the instruction; a token the AI wrote itself
    // would point at nothing (or show the wrong piece).
    if (text.indexOf('{{') !== -1) {
      text = text.replace(/\{\{[^}]*\}\}/g, '').replace(/[ \t]{2,}/g, ' ').trim();
    }
    var readers = step.readers === 2 ? 2 : 1;
    if (typeof step.readers === 'number' && step.readers > 2) {
      problems.push('Step ' + stepNo + ': peer feedback takes one or two readers, it was set to two.');
      readers = 2;
    }
    var timer = (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 900)
      ? Math.round(step.timer) : null;
    var draft = (typeof step.draft === 'string') ? step.draft.trim() : '';

    var draftId;
    if (draft) {
      draftId = freshId(phases, 'draft');
      phases[lastId].next = draftId;
      phases[draftId] = { type: 'collect', prompt: draft, maxLength: 2000 };
      lastId = draftId;
    } else {
      // The last plain text answer: never a hand-off (nor the start of
      // one), a drawing, or boxes
      var handedOn = {};
      Object.keys(phases).forEach(function (pid) {
        if (phases[pid] && phases[pid].rotateFrom) handedOn[phases[pid].rotateFrom] = true;
      });
      var order = orderedPhaseIds(phases);
      var cut = order.indexOf(lastId);
      if (cut !== -1) order = order.slice(0, cut + 1);
      for (var k = order.length - 1; k >= 0; k--) {
        var ph = phases[order[k]];
        if (ph && ph.type === 'collect' && !ph.rotateFrom && !handedOn[order[k]] && !ph.assign &&
            ph.inputType !== 'drawing' && !(Array.isArray(ph.fields) && ph.fields.length)) {
          draftId = order[k];
          break;
        }
      }
      if (!draftId) {
        problems.push('Step ' + stepNo + ': peer feedback needs a piece to read: give it a "draft" question, or put a question step before it.');
        return null;
      }
    }

    var chainIds = [draftId];
    var prevId = draftId;
    for (var r = 0; r < readers; r++) {
      var fbId = freshId(phases, 'feedback');
      var fb = {
        type: 'collect',
        prompt: text + '\n\n“{{' + prevId + '.assigned}}”',
        rotateFrom: prevId
      };
      if (r > 0) fb.showOriginal = true;
      if (timer) fb.timer = timer;
      phases[lastId].next = fbId;
      phases[fbId] = fb;
      chainIds.push(fbId);
      prevId = fbId;
      lastId = fbId;
    }

    var revealId = freshId(phases, 'feedback-back');
    phases[lastId].next = revealId;
    phases[revealId] = {
      type: 'reveal', scope: 'own', chainFrom: chainIds, chainDisplay: 'steps',
      chainHeading: 'You wrote:',
      chainGrewHeading: readers === 2 ? 'What your classmates said:' : 'What a classmate said:'
    };
    return revealId;
  }

  // ---- Quiet brick ----
  // Quiet time (2026-10-01, the inventory's Part 3): a stretch of silent
  // thinking with a clock and nothing to type, so "two minutes of silent
  // thinking, then we talk" stops landing on an answer box. A timed
  // announce: both screens count down, the step moves on by itself. An
  // optional talk line follows as a host-paced card, since the talk is
  // the teacher's to end.
  //   text   what to think about (required)
  //   timer  seconds of quiet (default 120, 10 to 900)
  //   talk   the line that comes after ("Turn to a partner and share one idea.")
  var QUIET_DEFAULT_SECONDS = 120;

  function appendQuiet(step, stepNo, phases, lastId, problems) {
    var text = (step && typeof step.text === 'string') ? step.text.trim() : '';
    if (!text) {
      problems.push('Step ' + stepNo + ': quiet time needs "text", what students think about.');
      return null;
    }
    var timer = QUIET_DEFAULT_SECONDS;
    if (typeof step.timer === 'number' && Number.isFinite(step.timer)) {
      timer = Math.round(Math.min(900, Math.max(10, step.timer)));
      if (timer !== Math.round(step.timer)) {
        problems.push('Step ' + stepNo + ': quiet time runs 10 seconds to 15 minutes, it was set to ' + timer + ' seconds.');
      }
    }
    var quietId = freshId(phases, 'quiet');
    phases[lastId].next = quietId;
    phases[quietId] = { type: 'announce', message: text, timer: timer };
    lastId = quietId;
    var talk = (typeof step.talk === 'string') ? step.talk.trim() : '';
    if (talk) {
      var talkId = freshId(phases, 'talk');
      phases[lastId].next = talkId;
      phases[talkId] = { type: 'announce', message: talk };
      lastId = talkId;
    }
    return lastId;
  }

  // ---- Pairs brick ----
  // Partner exchanges (debate pairs, peer interviews, argue-then-switch)
  // compiled deterministically: the AI supplies the first instruction,
  // optional follow-up rounds, and optional sides; every pairwise flag,
  // the same-partner link, the partner's piece under each round, the
  // sides tokens, and the pair-private reveal of the last exchange are
  // emitted here. Nothing a pair writes reaches the projector.
  //   text    the first writer's instruction (required)
  //   rounds  0-3 follow-up instructions; each round shows the partner's
  //           latest piece under the instruction unless the text places
  //           {{partner}} itself
  //   sides   two labels dealt one per partner; {{side}} / {{otherSide}}
  //           in any text become the dealt side and the one across
  var MAX_PAIR_ROUNDS = 3;

  function appendPairs(step, stepNo, phases, lastId, problems) {
    var first = (step && typeof step.text === 'string') ? step.text.trim() : '';
    if (!first) {
      problems.push('Step ' + stepNo + ': the pairs step needs a "text" instruction for what partners write first.');
      return null;
    }
    var rounds = (step && Array.isArray(step.rounds) ? step.rounds : [])
      .map(function (r) { return typeof r === 'string' ? r.trim() : ''; })
      .filter(function (r) { return r !== ''; });
    if (rounds.length > MAX_PAIR_ROUNDS) {
      problems.push('Step ' + stepNo + ': pairs cap at ' + MAX_PAIR_ROUNDS + ' rounds after the first, the extra rounds were dropped.');
      rounds = rounds.slice(0, MAX_PAIR_ROUNDS);
    }
    var sides = null;
    if (step && step.sides !== undefined) {
      var cleanSides = (Array.isArray(step.sides) ? step.sides : [])
        .map(function (s) { return typeof s === 'string' ? s.trim() : ''; })
        .filter(function (s) { return s !== ''; });
      if (cleanSides.length === 2) {
        sides = cleanSides;
      } else {
        problems.push('Step ' + stepNo + ': "sides" needs exactly two labels (like For and Against); the sides were ignored.');
      }
    }
    var timer = (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600)
      ? Math.round(step.timer) : null;

    var openId = freshId(phases, 'pair-write');

    // The AI writes plain tokens; the compiler binds them to the step.
    function bindTokens(text, prevId) {
      var out = text
        .replace(/\{\{\s*side\s*\}\}/g, '{{' + openId + '.side}}')
        .replace(/\{\{\s*(otherSide|partnerSide)\s*\}\}/g, '{{' + openId + '.partnerSide}}');
      if (prevId) out = out.replace(/\{\{\s*partner\s*\}\}/g, '{{' + prevId + '.partner}}');
      else out = out.replace(/\{\{\s*partner\s*\}\}/g, '');
      return out.replace(/[ \t]{2,}/g, ' ').trim();
    }
    // A sides line under the instruction when the text does not place it.
    function withSide(text) {
      if (!sides || text.indexOf('{{' + openId + '.side}}') !== -1) return text;
      return text + '\n\n**{{' + openId + '.side}}**';
    }

    // The projector's line under the instruction (2026-09-28: a pair
    // step's partner text and side live on each student's device, so the
    // projector said where they are; Convince Me's shape)
    function projectorLine(isRound) {
      return isRound
        ? 'Your partner\'s words are on your own device.'
        : 'Everyone is writing to their partner on their own device.';
    }
    var open = { type: 'collect', prompt: withSide(bindTokens(first, null)), assign: 'pairwise', oddHandling: 'triple', hostTemplate: projectorLine(false) };
    if (sides) open.sides = sides;
    if (timer) open.timer = timer;
    // Partners by an earlier pick (2026-09-27, "pair each yes with a no",
    // "fist to five, then pair low with high"): pairBy "opposite" prefers
    // partners who answered the last pick-one step differently, "same"
    // the same; best effort, nobody sits out over it (engine pairBy).
    if (step && (step.pairBy === 'opposite' || step.pairBy === 'same' || step.pairBy === 'far')) {
      var pickSrc = lastOfType(phases, ['collect-choice'], lastId);
      if (pickSrc) {
        open.pairBy = { from: pickSrc, mode: step.pairBy };
      } else {
        problems.push('Step ' + stepNo + ': pairing by answer needs a pick-one question step before the pairs step; partners were paired at random instead.');
      }
    }
    phases[lastId].next = openId;
    phases[openId] = open;
    lastId = openId;

    rounds.forEach(function (round) {
      var roundId = freshId(phases, 'pair-round');
      var prompt = bindTokens(round, lastId);
      if (prompt.indexOf('{{' + lastId + '.partner}}') === -1) {
        prompt = prompt + '\n\n{{' + lastId + '.partner}}';
      }
      var roundPhase = { type: 'collect', prompt: withSide(prompt), assign: 'pairwise', reusePairsFrom: openId, hostTemplate: projectorLine(true) };
      if (timer) roundPhase.timer = timer;
      phases[lastId].next = roundId;
      phases[roundId] = roundPhase;
      lastId = roundId;
    });

    var shareId = freshId(phases, 'pair-share');
    phases[lastId].next = shareId;
    phases[shareId] = { type: 'reveal', scope: 'pair', pairsFrom: lastId, template: '{{_pair.answers}}' };
    return shareId;
  }

  // ---- Roles brick ----
  // A job for every member of an existing group (team-roles), and an
  // optional shared checklist for the group (checklist, role-tagged
  // through the "Job: task" prefix the checklist reads at game time).
  // The groups come from the last teams step, or the last pairs step.
  // Never rank + assign: a hand-out gives one item per GROUP (the probe's
  // broken lookalike, 2026-09-20).
  var MIN_ROLES = 2;
  var MAX_ROLES = 8;
  var MAX_TASKS = 12;

  function lastGroupsStep(phases, beforeId) {
    var teamsId = lastOfType(phases, ['team-split'], beforeId);
    if (teamsId) return teamsId;
    var ids = Object.keys(phases);
    var cut = beforeId ? ids.indexOf(beforeId) : ids.length - 1;
    for (var i = cut; i >= 0; i--) {
      var p = phases[ids[i]];
      if (p && p.type === 'collect' && p.assign === 'pairwise') return ids[i];
    }
    return null;
  }

  function appendRoles(step, stepNo, phases, lastId, problems) {
    var roles = (step && Array.isArray(step.roles) ? step.roles : [])
      .map(function (r) { return typeof r === 'string' ? r.trim() : ''; })
      .filter(function (r) { return r !== ''; });
    if (roles.length < MIN_ROLES) {
      problems.push('Step ' + stepNo + ': the roles step needs at least ' + MIN_ROLES + ' job names in "roles".');
      return null;
    }
    if (roles.length > MAX_ROLES) {
      problems.push('Step ' + stepNo + ': roles cap at ' + MAX_ROLES + ' jobs, the extras were dropped.');
      roles = roles.slice(0, MAX_ROLES);
    }
    var groupsId = lastGroupsStep(phases, lastId);
    if (!groupsId) {
      problems.push('Step ' + stepNo + ': roles need a teams step (or a pairs step) before them, so there are groups to give the jobs to.');
      return null;
    }
    var rolesId = freshId(phases, 'roles');
    var rolesPhase = { type: 'team-roles', teamsFrom: groupsId, roles: roles, method: step.method === 'choice' ? 'choice' : 'random' };
    phases[lastId].next = rolesId;
    phases[rolesId] = rolesPhase;
    lastId = rolesId;

    var tasks = (step && Array.isArray(step.tasks) ? step.tasks : [])
      .map(function (t) { return typeof t === 'string' ? t.trim() : ''; })
      .filter(function (t) { return t !== ''; });
    if (tasks.length > MAX_TASKS) {
      problems.push('Step ' + stepNo + ': the task list caps at ' + MAX_TASKS + ' items, the extras were dropped.');
      tasks = tasks.slice(0, MAX_TASKS);
    }
    if (tasks.length) {
      var listId = freshId(phases, 'tasks');
      var list = { type: 'checklist', items: tasks, teamsFrom: groupsId, rolesFrom: rolesId };
      var text = (step && typeof step.text === 'string') ? step.text.trim() : '';
      list.prompt = text || 'Work through the tasks with your group. Anyone can check one off, and the whole group sees it.';
      phases[lastId].next = listId;
      phases[listId] = list;
      lastId = listId;
    }
    return lastId;
  }

  // ---- Draw brick ----
  // Draw Gallery's shape from the AI's words alone: a drawing collect, the
  // teacher preview gate (nothing student-drawn reaches the projector
  // without one, SAFETY-DESIGN), then the one-at-a-time gallery. Reject on
  // the gate restarts the drawing round. No vote can show drawings, so a
  // favorite stays a show of hands in the gallery line (the compile loop
  // refuses a vote fed by a drawing step).
  var DRAW_TIMER_DEFAULT = 90;

  function appendDraw(step, stepNo, phases, lastId, problems) {
    var text = (step && typeof step.text === 'string') ? step.text.trim() : '';
    if (!text) {
      problems.push('Step ' + stepNo + ': the draw step needs a "text" instruction for what to draw.');
      return null;
    }
    var timer = (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600)
      ? Math.round(step.timer) : DRAW_TIMER_DEFAULT;
    var gallery = (step && typeof step.gallery === 'string' && step.gallery.trim())
      ? step.gallery.trim()
      : 'The gallery is open. One drawing at a time, artists, be ready to say a word about yours.';

    var drawId = freshId(phases, 'draw');
    phases[lastId].next = drawId;
    phases[drawId] = { type: 'collect', inputType: 'drawing', prompt: text, timer: timer };

    var gateId = freshId(phases, 'check');
    var galleryId = freshId(phases, 'gallery');
    phases[drawId].next = gateId;
    phases[gateId] = {
      type: 'preview',
      template: 'Review the drawings below, then open the gallery. One bad drawing? Press Hide beside it on your Teacher view. Try again restarts the drawing round for everyone.',
      approveNext: galleryId,
      rejectNext: drawId
    };
    phases[galleryId] = { type: 'reveal-one', message: gallery, from: drawId + '.responses' };
    return galleryId;
  }

  // ---- Summarize brick ----
  // The Builder's AI pair from the AI's words alone: an ai-process
  // summarize over the last question step, then the reveal that stages
  // its result on the projector. The heading is what the class reads;
  // it never names the AI (the wait screen and footer already say who
  // reads the answers, engine/audience.js + the no-ai-mention rule).
  function appendSummarize(step, stepNo, phases, lastId, problems) {
    var text = (step && typeof step.text === 'string') ? step.text.trim() : '';
    if (!text) {
      problems.push('Step ' + stepNo + ': the summarize step needs a "text" instruction for how to sum the answers up.');
      return null;
    }
    var heading = (step && typeof step.heading === 'string' && step.heading.trim())
      ? step.heading.trim()
      : 'Here is what the class said, summed up:';
    var pair = buildAiPair({ key: 'summary', task: 'summarize', instructions: text, revealMessage: heading }, { phases: phases, afterId: lastId });
    if (!pair) {
      problems.push('Step ' + stepNo + ': summarize needs a question step before it, so there are answers to sum up.');
      return null;
    }
    pair.forEach(function (entry) {
      phases[lastId].next = entry.id;
      phases[entry.id] = entry.phase;
      lastId = entry.id;
    });
    return lastId;
  }

  // ---- Deal brick ----
  // Story Ingredients' shape as a mechanic (2026-09-07): one collect per
  // pile, each later step rotating from the pile before it with a shuffled
  // deal and no {{...}} in its prompt (a blind hand-off, the hand is shown
  // only at the writing step), then the writing step over the whole hand
  // and a one-at-a-time share-out. The piles' authors stay anonymous.
  // Wires phases in place, returns the new lastId, or null.
  var MAX_DEAL_PILES = 4;
  var MIN_DEAL_PILES = 2;
  var DEAL_PILE_TIMER = 90;
  var DEAL_WRITE_TIMER = 480;

  function pileId(phases, label, index) {
    var slug = String(label || '').toLowerCase()
      .replace(/^(a|an|the)\s+/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    if (!slug || !/^[a-z]/.test(slug)) slug = 'pile-' + index;
    return freshId(phases, slug);
  }

  function appendDeal(step, stepNo, phases, lastId, problems) {
    var piles = (step && Array.isArray(step.piles) ? step.piles : [])
      .filter(function (p) { return p && typeof p === 'object'; })
      .map(function (p) {
        return {
          label: typeof p.label === 'string' ? p.label.trim() : '',
          prompt: typeof p.prompt === 'string' ? p.prompt.trim() : ''
        };
      });
    if (piles.length < MIN_DEAL_PILES) {
      problems.push('Step ' + stepNo + ': a deal needs at least two piles (each one a label and a prompt).');
      return null;
    }
    if (piles.length > MAX_DEAL_PILES) {
      problems.push('Step ' + stepNo + ': a deal caps at four piles, the extras were dropped.');
      piles = piles.slice(0, MAX_DEAL_PILES);
    }
    var pileTimer = (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600)
      ? Math.round(step.timer) : DEAL_PILE_TIMER;
    var writeTimer = (typeof step.writeTimer === 'number' && step.writeTimer >= 60 && step.writeTimer <= 900)
      ? Math.round(step.writeTimer) : DEAL_WRITE_TIMER;
    var writeText = (typeof step.text === 'string' && step.text.trim())
      ? step.text.trim()
      : 'Write something that uses everything in your hand.';

    var pileIds = [];
    piles.forEach(function (pile, i) {
      var id = pileId(phases, pile.label, i + 1);
      var label = pile.label || ('Pile ' + (i + 1));
      var phase = {
        type: 'collect',
        // A token here would show the writer what the deal hides.
        prompt: (pile.prompt || ('Add one thing to the pile: ' + label + '.')).replace(/\{\{[^}]*\}\}/g, '').trim() ||
          ('Add one thing to the pile: ' + label + '.'),
        timer: pileTimer
      };
      if (i > 0) {
        phase.rotateFrom = pileIds[i - 1];
        phase.rotateShuffle = true;
      }
      phases[lastId].next = id;
      phases[id] = phase;
      pileIds.push(id);
      lastId = id;
      pile.id = id;
      pile.label = label;
    });

    // "A person" reads as "YOUR PERSON" in the hand, never "YOUR A PERSON".
    var handLines = piles.map(function (pile) {
      var noun = pile.label.replace(/^(a|an|the)\s+/i, '').toUpperCase();
      return 'YOUR ' + noun + ': {{' + pile.id + '.assigned}}';
    });
    var writeId = freshId(phases, 'write');
    phases[lastId].next = writeId;
    phases[writeId] = {
      type: 'collect',
      prompt: 'Your hand has been dealt.\n\n' + handLines.join('\n\n') + '\n\n' + writeText,
      rotateFrom: pileIds[pileIds.length - 1],
      rotateShuffle: true,
      timer: writeTimer,
      maxLength: 2000,
      simultaneousReveal: true
    };
    lastId = writeId;

    var shareId = freshId(phases, 'share');
    phases[lastId].next = shareId;
    phases[shareId] = {
      type: 'reveal-one',
      message: 'One dealt hand at a time.',
      from: writeId + '.responses',
      itemTemplate: '{{_current.playerName}} wrote:\n\n{{_current.text}}'
    };
    return shareId;
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

  // ---- Jigsaw regroup (2026-09-27) ----
  // A teams step with jigsaw: true regroups the LAST teams step so every
  // new group holds one member of each earlier group (expert groups become
  // home groups); the engine's team-split method "jigsaw" does the mixing.
  function buildJigsaw(phases, lastId, stepNo, problems) {
    var src = lastOfType(phases, ['team-split'], lastId);
    if (!src) {
      problems.push('Step ' + stepNo + ': a jigsaw regroup needs a teams step before it, so there are groups to mix.');
      return null;
    }
    return { type: 'team-split', method: 'jigsaw', regroupFrom: src };
  }

  // ---- Review brick (2026-09-27) ----
  // "Students send in questions, I pick which go up": the last question
  // step's answers go to the teacher first (a preview gate: Hide beside
  // any on the console, Try again asks everyone again), then the kept
  // ones go on the projector one at a time, host-paced. text = the line
  // over the shown answers.
  function appendReview(step, stepNo, phases, lastId, problems) {
    var src = lastOfType(phases, ['collect'], lastId);
    if (!src) {
      problems.push('Step ' + stepNo + ': the review step needs a question step before it, so there are answers to look over.');
      return null;
    }
    var text = (step && typeof step.text === 'string' && step.text.trim())
      ? step.text.trim()
      : 'Here they come, one at a time.';
    var gateId = freshId(phases, 'check');
    var showId = freshId(phases, 'show-one');
    phases[lastId].next = gateId;
    phases[gateId] = {
      type: 'preview',
      template: 'Read the answers below and pick what goes up: press Hide beside any you want to keep off the projector on your Teacher view, then Approve. Try again asks everyone to answer again.',
      approveNext: showId,
      rejectNext: src
    };
    phases[showId] = { type: 'reveal-one', message: text, from: src + '.responses' };
    return showId;
  }

  // ---- Hot seat brick (2026-10-01, the inventory's Part 3) ----
  // One student answers the class's questions out loud: everyone writes a
  // question, the teacher looks them over (a preview gate, since the
  // questions go to a classmate), then they reach the hot seat's screen
  // one at a time while the projector shows only the count and the name.
  //   text      what everyone writes ("Write one question for the hot seat.")
  //   pick      'random' (default: the hot seat is drawn when the questions
  //             go out, a surprise) | 'vote' (the class picks first, by name)
  //   voteText  the vote's question (pick 'vote')
  //   heading   the line over the questions on the hot seat's screen
  function appendHotSeat(step, stepNo, phases, lastId, problems) {
    var text = (step && typeof step.text === 'string') ? step.text.trim() : '';
    if (!text) {
      problems.push('Step ' + stepNo + ': the hot seat needs "text", what everyone writes for the student in it.');
      return null;
    }
    var heading = (typeof step.heading === 'string' && step.heading.trim()) ? step.heading.trim() : 'Your classmates ask:';
    var to = '{{players.random}}';
    if (step.pick === 'vote') {
      var pickId = freshId(phases, 'pick');
      var voteText = (typeof step.voteText === 'string' && step.voteText.trim()) ? step.voteText.trim() : 'Who goes in the hot seat?';
      phases[lastId].next = pickId;
      phases[pickId] = { type: 'vote', mode: 'pick-one', candidates: 'players', excludeAuthors: true, question: voteText, timer: 45 };
      var namedId = freshId(phases, 'picked');
      phases[pickId].next = namedId;
      phases[namedId] = { type: 'reveal', template: 'In the hot seat:\n\n**{{' + pickId + '.winnerText}}**' };
      lastId = namedId;
      to = '{{' + pickId + '.winnerText}}';
    }
    var askId = freshId(phases, 'ask');
    var gateId = freshId(phases, 'check');
    var seatId = freshId(phases, 'hot-seat');
    phases[lastId].next = askId;
    phases[askId] = { type: 'collect', prompt: text, maxLength: 300 };
    phases[askId].next = gateId;
    phases[gateId] = {
      type: 'preview',
      template: 'Read the questions below before they go to the hot seat: press Hide beside any that should not go, then Approve. Try again asks everyone to write again.',
      approveNext: seatId,
      rejectNext: askId
    };
    phases[seatId] = { type: 'reveal-one', message: heading, from: askId + '.responses', to: to };
    return seatId;
  }

  // ---- Bracket brick (2026-09-27) ----
  // A single-elimination bracket over a list the teacher names (books,
  // songs, inventions; 4 to 16) or, with no list, the last question step's
  // answers: one head-to-head vote per round with bracket: true (the
  // engine pairs consecutive candidates, an odd last one moves on alone,
  // everyone votes on every matchup), a host-paced reveal of the round in
  // words after each, and the last round's reveal names the champion.
  var MIN_BRACKET_ITEMS = 3;
  var MAX_BRACKET_ITEMS = 16;

  function appendBracket(step, stepNo, phases, lastId, problems) {
    var items = Array.isArray(step && step.items)
      ? step.items.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean).slice(0, MAX_BRACKET_ITEMS)
      : [];
    var src = null;
    var count;
    if (items.length >= MIN_BRACKET_ITEMS) {
      count = items.length;
    } else if (items.length > 0) {
      problems.push('Step ' + stepNo + ': a bracket needs at least ' + MIN_BRACKET_ITEMS + ' items to pit against each other.');
      return null;
    } else {
      src = lastOfType(phases, ['collect'], lastId);
      if (!src) {
        problems.push('Step ' + stepNo + ': a bracket needs an "items" list (4, 8, or 16 things to pit against each other) or a question step before it.');
        return null;
      }
      // A class's answers: rounds for up to 32 (a big class nominating
      // once each); a round that finds one candidate left passes itself
      // and its results card, so a small class never clicks through the
      // spare rounds (engine/phase-handlers/vote.js).
      count = 32;
    }
    var question = (step && typeof step.text === 'string' && step.text.trim())
      ? step.text.trim() : 'Which one wins this matchup?';
    var timer = (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600)
      ? Math.round(step.timer) : null;
    var rounds = Math.max(1, Math.ceil(Math.log(count) / Math.log(2)));
    var prevId = null;
    for (var r = 1; r <= rounds; r++) {
      var roundId = freshId(phases, 'round-' + r);
      var vote = { type: 'vote', mode: 'head-to-head', bracket: true, question: question };
      if (r === 1) {
        vote.candidates = src ? src + '.responses' : items;
      } else {
        vote.candidates = prevId + '.winners';
      }
      // Over the class's answers nobody votes on their own matchup
      if (src) vote.excludeAuthors = true;
      if (timer) vote.timer = timer;
      phases[lastId].next = roundId;
      phases[roundId] = vote;
      lastId = roundId;
      var showId = freshId(phases, r === rounds ? 'champion' : 'round-' + r + '-results');
      phases[lastId].next = showId;
      phases[showId] = {
        type: 'reveal',
        template: r === rounds
          ? '{{' + roundId + '.bracketList}}\n\nThe winner of the bracket: **{{' + roundId + '.winnerText}}**'
          : 'Round ' + r + ':\n\n{{' + roundId + '.bracketList}}'
      };
      lastId = showId;
      prevId = roundId;
    }
    return lastId;
  }


  // ---- Groups by answer (2026-09-30) ----
  // A teams step with groupBy "same" or "mixed" groups the class by what
  // each student picked on the last pick-one step: same = one group per
  // answer (groupSize splits a big one), mixed = one of each answer per
  // group; the engine's team-split method "byAnswer" does the sorting.
  function buildByAnswer(step, phases, lastId, stepNo, problems) {
    var src = lastOfType(phases, ['collect-choice'], lastId);
    if (!src) {
      problems.push('Step ' + stepNo + ': grouping by answer needs a pick-one question step before the teams step.');
      return null;
    }
    var phase = { type: 'team-split', method: 'byAnswer', groupBy: src, groupMode: step.groupBy === 'mixed' ? 'mixed' : 'same' };
    var gs = (step && typeof step.groupSize === 'number') ? Math.round(step.groupSize) : null;
    if (phase.groupMode === 'same' && gs && gs >= 2 && gs <= 12) phase.groupSize = gs;
    return phase;
  }

  // ---- The class writes the quiz (2026-09-30) ----
  // Every student writes a question, its right answer, and one to three
  // wrong ones (an Open answer step with keyed boxes); then a self-paced
  // quiz runs over every complete question (solo-quiz questionsFrom).
  function appendWriteQuiz(step, stepNo, phases, lastId, problems) {
    var wrongs = (typeof step.wrongs === 'number' && step.wrongs >= 1 && step.wrongs <= 3) ? Math.round(step.wrongs) : 2;
    var fields = [
      { label: 'Your question', key: 'question' },
      { label: 'The right answer', key: 'correct' },
      { label: 'A wrong answer', key: 'wrong1' }
    ];
    if (wrongs >= 2) fields.push({ label: 'Another wrong answer', key: 'wrong2' });
    if (wrongs >= 3) fields.push({ label: 'One more wrong answer', key: 'wrong3' });
    var askId = freshId(phases, 'write');
    phases[lastId].next = askId;
    var ask = { type: 'collect', prompt: textOf(step, 'Write one quiz question on what we learned, with the right answer and some wrong ones that could fool a classmate.'), fields: fields };
    ask.timer = secondsOf(step.timer, 30, 900) || 240;
    phases[askId] = ask;
    var quizId = freshId(phases, 'quiz');
    phases[askId].next = quizId;
    phases[quizId] = { type: 'solo-quiz', title: (typeof step.title === 'string' && step.title.trim()) ? step.title.trim() : 'Our quiz', questionsFrom: askId, showAnswers: true, pointsPerQuestion: 1 };
    lastId = quizId;
    if (step.standings === true) lastId = appendStandings(phases, lastId, [quizId + '.scores']);
    return lastId;
  }

  // ---- Eleven bricks over blocks the engine already had (2026-09-30) ----
  // The mechanics inventory found fourteen step types no typed idea could
  // reach. Each brick here compiles to a step that passes the validator
  // as-is and adds its own payoff (a scoreboard, the shared answers, a
  // crown) so the words the AI writes can be honest about it.

  function textOf(step, fallback) {
    return (step && typeof step.text === 'string' && step.text.trim()) ? step.text.trim() : fallback;
  }
  function secondsOf(v, lo, hi) {
    return (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi) ? Math.round(v) : null;
  }
  function cleanLines(raw, max) {
    return Array.isArray(raw)
      ? raw.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean).slice(0, max)
      : [];
  }
  function slugOf(text, taken, fallback) {
    var base = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || fallback;
    var id = base;
    var n = 2;
    while (taken[id]) { id = base + '-' + n; n++; }
    taken[id] = true;
    return id;
  }
  // The last teams step, or the last paired-up collect, for a step that
  // takes groups from an earlier one (checklist, charades).
  function lastGroupStep(phases, lastId) {
    var order = orderedPhaseIds(phases);
    var stop = order.indexOf(lastId);
    for (var i = (stop === -1 ? order.length - 1 : stop); i >= 0; i--) {
      var ph = phases[order[i]];
      if (!ph) continue;
      if (ph.type === 'team-split') return order[i];
      if (ph.type === 'collect' && ph.assign === 'pairwise') return order[i];
    }
    return null;
  }

  // match: two lists to pair up, auto-scored
  function appendMatch(step, stepNo, phases, lastId, problems) {
    var seenL = {}, seenR = {};
    var pairs = (Array.isArray(step.pairs) ? step.pairs : []).map(function (p) {
      if (!p || typeof p !== 'object') return null;
      var left = String(p.left == null ? '' : p.left).trim();
      var right = String(p.right == null ? '' : p.right).trim();
      if (!left || !right || seenL[left.toLowerCase()] || seenR[right.toLowerCase()]) return null;
      seenL[left.toLowerCase()] = true;
      seenR[right.toLowerCase()] = true;
      return { left: left, right: right };
    }).filter(Boolean).slice(0, 12);
    if (pairs.length < 2) {
      problems.push('Step ' + stepNo + ': matching needs at least two pairs, each with a left and a right item.');
      return null;
    }
    var id = freshId(phases, 'match');
    var built = { type: 'match', prompt: textOf(step, 'Match each item on the left with the right one on the right.'), pairs: pairs, pointsPerMatch: 10 };
    built.timer = secondsOf(step.timer, 5, 600) || 90;
    phases[lastId].next = id;
    phases[id] = built;
    return id;
  }

  // sort: items into named buckets; a correct bucket on every item scores
  // it, none makes a class verdict, a mix is a verdict with a note
  function appendSort(step, stepNo, phases, lastId, problems) {
    var buckets = [];
    var seenB = {};
    cleanLines(step.buckets, 6).forEach(function (b) {
      if (!seenB[b.toLowerCase()]) { seenB[b.toLowerCase()] = true; buckets.push(b); }
    });
    if (buckets.length < 2) {
      problems.push('Step ' + stepNo + ': sorting needs at least two buckets to sort into.');
      return null;
    }
    if (buckets.length > 5) buckets = buckets.slice(0, 5);
    var items = (Array.isArray(step.items) ? step.items : []).map(function (it) {
      if (typeof it === 'string' || typeof it === 'number') return { text: String(it).trim() };
      if (it && typeof it === 'object') {
        var out = { text: String(it.text == null ? '' : it.text).trim() };
        if (typeof it.bucket === 'string' && it.bucket.trim()) out.bucket = it.bucket.trim();
        return out;
      }
      return null;
    }).filter(function (it) { return it && it.text; }).slice(0, 12);
    if (items.length < 2) {
      problems.push('Step ' + stepNo + ': sorting needs at least two items to sort.');
      return null;
    }
    var withBucket = items.filter(function (it) { return it.bucket; });
    var known = {};
    buckets.forEach(function (b) { known[b.toLowerCase()] = b; });
    var graded = withBucket.length === items.length && withBucket.every(function (it) { return !!known[it.bucket.toLowerCase()]; });
    if (graded) {
      items.forEach(function (it) { it.bucket = known[it.bucket.toLowerCase()]; });
    } else {
      if (withBucket.length > 0) {
        problems.push('Step ' + stepNo + ': some items had a correct bucket and some did not (or a bucket that is not in the list), so the step runs as a class verdict with no right answers.');
      }
      items.forEach(function (it) { delete it.bucket; });
    }
    var id = freshId(phases, 'sort');
    var built = { type: 'sort', prompt: textOf(step, graded ? 'Put each one in the right bucket.' : 'Where does each one belong? Class verdict, no wrong answers.'), buckets: buckets, items: items };
    if (graded) built.pointsPerItem = 10;
    built.timer = secondsOf(step.timer, 5, 600) || 90;
    phases[lastId].next = id;
    phases[id] = built;
    return { id: id, graded: graded };
  }

  // rate: one to five scales with two end words each
  function appendRate(step, stepNo, phases, lastId, problems) {
    var taken = {};
    var scales = (Array.isArray(step.scales) ? step.scales : []).map(function (s, i) {
      if (!s || typeof s !== 'object') return null;
      var label = String(s.label == null ? '' : s.label).trim();
      if (!label) return null;
      var scale = { id: slugOf(label, taken, 'scale-' + (i + 1)), label: label, min: 1, max: 5 };
      var low = typeof s.low === 'string' ? s.low.trim() : '';
      var high = typeof s.high === 'string' ? s.high.trim() : '';
      if (low || high) scale.labels = { min: low || 'Low', max: high || 'High' };
      return scale;
    }).filter(Boolean).slice(0, 5);
    if (scales.length === 0) {
      problems.push('Step ' + stepNo + ': rating needs at least one scale with a label.');
      return null;
    }
    var top = secondsOf(step.max, 3, 10);
    if (top) scales.forEach(function (s) { s.max = top; });
    var id = freshId(phases, 'rate');
    var built = { type: 'rate', prompt: textOf(step, 'Rate it on each scale below.'), scales: scales, visibility: step.results === 'teacher' ? 'host-only' : 'all' };
    var t = secondsOf(step.timer, 5, 600);
    if (t) built.timer = t;
    phases[lastId].next = id;
    phases[id] = built;
    return id;
  }

  // solo-quiz: the quiz brick's questions, at each student's own pace
  function appendSoloQuiz(step, stepNo, phases, lastId, problems) {
    var questions = (Array.isArray(step.questions) ? step.questions : []).map(function (q) {
      if (!q || typeof q !== 'object') return null;
      var text = String(q.text == null ? (q.question == null ? '' : q.question) : q.text).trim();
      var choices = cleanLines(q.choices, 8);
      var correct = String(q.correct == null ? '' : q.correct).trim();
      var hit = choices.filter(function (c) { return c.toLowerCase() === correct.toLowerCase(); })[0];
      if (!text || choices.length < 2 || !hit) return null;
      return { question: text, choices: choices, correct: hit };
    }).filter(Boolean).slice(0, 30);
    if (questions.length === 0) {
      problems.push('Step ' + stepNo + ': the self-paced quiz needs at least one question with two or more choices and a correct answer that matches one of them.');
      return null;
    }
    var id = freshId(phases, 'quiz');
    var built = { type: 'solo-quiz', title: textOf(step, 'Quiz'), questions: questions, showAnswers: step.showAnswers === false ? false : true, pointsPerQuestion: 1 };
    phases[lastId].next = id;
    phases[id] = built;
    return id;
  }

  // wager: bet points on an option; a known right answer pays out by itself
  function appendWager(step, stepNo, phases, lastId, problems) {
    var options = [];
    var seenO = {};
    cleanLines(step.options, 6).forEach(function (o) {
      if (!seenO[o.toLowerCase()]) { seenO[o.toLowerCase()] = true; options.push(o); }
    });
    if (options.length < 2) {
      problems.push('Step ' + stepNo + ': betting needs at least two options to bet on.');
      return null;
    }
    var id = freshId(phases, 'bet');
    var built = { type: 'wager', prompt: textOf(step, 'Place your bet. Which one is right?'), options: options };
    var correct = typeof step.correct === 'string' ? step.correct.trim() : '';
    if (correct) {
      var hit = options.filter(function (o) { return o.toLowerCase() === correct.toLowerCase(); })[0];
      if (hit) built.correctOption = hit;
      else problems.push('Step ' + stepNo + ': the winning option "' + correct + '" is not one of the options, so the teacher picks the winner on the console instead.');
    }
    phases[lastId].next = id;
    phases[id] = built;
    return id;
  }

  // merge: pairs (or threes, or pairs of pairs) write one answer together
  // from their own answers to the collect step before
  function appendMerge(step, stepNo, phases, lastId, problems) {
    var src = lastPlainCollect(phases, lastId) || lastOfType(phases, ['collect'], lastId);
    if (!src) {
      problems.push('Step ' + stepNo + ': combining answers needs a question step before it, so each student brings an answer of their own.');
      return null;
    }
    var size = step.groupSize === 3 || step.groupSize === 4 ? step.groupSize : 2;
    var instruction = textOf(step, 'Combine your answers into one stronger answer.');
    var timer = secondsOf(step.timer, 30, 900) || 240;
    var id = freshId(phases, size === 4 ? 'pairs' : (size === 3 ? 'threes' : 'pairs'));
    phases[lastId].next = id;
    phases[id] = { type: 'merge', seedFrom: src + '.responses', instruction: instruction, groupSize: size === 4 ? 2 : size, agreeMode: 'both', timer: timer };
    lastId = id;
    if (size === 4) {
      var quadId = freshId(phases, 'fours');
      phases[lastId].next = quadId;
      phases[quadId] = { type: 'merge', seedFrom: id + '.merged', instruction: 'Now join another pair: fold both answers into one.', groupSize: 4, agreeMode: 'both', timer: timer };
      lastId = quadId;
    }
    if (step.show !== false) {
      var showId = freshId(phases, 'built');
      phases[lastId].next = showId;
      var heading = (typeof step.heading === 'string' && step.heading.trim()) ? step.heading.trim()
        : (size === 2 ? 'Here is what the pairs built together:' : 'Here is what the groups built together:');
      phases[showId] = { type: 'reveal', template: heading + '\n\n{{' + lastId + '.merged.list}}' };
      lastId = showId;
    }
    return lastId;
  }

  // relay: one line each, turn by turn, into one shared piece
  function appendRelay(step, stepNo, phases, lastId, problems) {
    var id = freshId(phases, 'relay');
    var built = { type: 'relay', prompt: textOf(step, 'Add the next line. Build on what came before.'), order: 'random' };
    var turns = secondsOf(step.turns, 2, 60);
    if (turns) built.turns = turns;
    built.timer = secondsOf(step.timer, 5, 300) || 45;
    phases[lastId].next = id;
    phases[id] = built;
    lastId = id;
    if (step.show !== false) {
      var showId = freshId(phases, 'piece');
      phases[lastId].next = showId;
      var heading = (typeof step.heading === 'string' && step.heading.trim()) ? step.heading.trim() : 'Here is what we built, one line at a time:';
      phases[showId] = { type: 'reveal', template: heading + '\n\n{{' + id + '.text}}' };
      lastId = showId;
    }
    return lastId;
  }

  // tasks: a to-do list per group (the last teams or pairs step) or per
  // student, checked off on their devices, progress on the projector
  function appendTasks(step, stepNo, phases, lastId, problems) {
    var items = cleanLines(step.items, 15);
    // A different task per group on a task list (2026-09-30, the live
    // eval put stations on tasks): the per-group line goes up first as an
    // announce with stations, then the shared list (or nothing more when
    // there is no list)
    var stationLines = Array.isArray(step.stations) ? cleanLines(step.stations, 12) : [];
    if (stationLines.length >= 2) {
      var split = lastOfType(phases, ['team-split'], lastId);
      if (!split) {
        problems.push('Step ' + stepNo + ': a task per group needs a teams step before it, so the lines were left out.');
      } else {
        var stId = freshId(phases, 'station');
        phases[lastId].next = stId;
        var stText = textOf(step, 'Your station:');
        phases[stId] = {
          type: 'announce',
          message: (/\{\{\s*thisStep\.station\s*\}\}/.test(stText) ? stText.replace(/\{\{\s*thisStep\.station\s*\}\}/g, '{{' + stId + '.station}}') : stText + '\n\n{{' + stId + '.station}}'),
          stations: stationLines,
          stationsFrom: split
        };
        lastId = stId;
        if (items.length < 2) return lastId;
      }
    }
    if (items.length < 2) {
      problems.push('Step ' + stepNo + ': a task list needs at least two tasks.');
      return null;
    }
    var id = freshId(phases, 'tasks');
    var built = { type: 'checklist', prompt: textOf(step, 'Work through the list together. Tap each one as you finish it.'), items: items };
    var group = lastGroupStep(phases, lastId);
    if (group) built.teamsFrom = group;
    phases[lastId].next = id;
    phases[id] = built;
    return id;
  }

  // knockout: answer, see the answers, vote (never your own), the lowest
  // votes are out; repeat until one is left; the Elimination Tournament
  // recipe's loop, built from a sentence
  function appendKnockout(step, stepNo, phases, lastId, problems) {
    var prompt = textOf(step, 'Your best one-liner. Make the room laugh.');
    var percent = secondsOf(step.percent, 10, 90) || 50;
    var loops = secondsOf(step.loops, 2, 20) || 6;
    var answerTimer = secondsOf(step.timer, 10, 600) || 60;
    var voteTimer = secondsOf(step.voteTimer, 10, 300) || 30;
    var introId = freshId(phases, 'round-intro');
    var answerId = freshId(phases, 'answer');
    var showId = freshId(phases, 'show-answers');
    var voteId = freshId(phases, 'vote');
    var outId = freshId(phases, 'eliminate');
    var crownId = freshId(phases, 'champion');
    phases[lastId].next = introId;
    phases[introId] = {
      type: 'announce',
      message: 'Round {{_loop.' + outId + '.iteration}}. {{remaining.length}} still in: answer, then vote. The fewest votes are out.',
      timer: 5,
      next: answerId
    };
    phases[answerId] = { type: 'collect', prompt: prompt, from: 'remaining', timer: answerTimer, next: showId };
    phases[showId] = { type: 'reveal', template: 'Here is what everyone said:\n\n{{' + answerId + '.responses.list}}', next: voteId };
    phases[voteId] = {
      type: 'vote', mode: 'pick-one', candidates: answerId + '.responses', voters: 'all', excludeAuthors: true,
      question: (typeof step.voteText === 'string' && step.voteText.trim()) ? step.voteText.trim() : 'Pick your favorite (not your own). Everyone votes, in or out.',
      timer: voteTimer, next: outId
    };
    phases[outId] = {
      type: 'eliminate', method: 'bottom-percent', percent: percent, input: voteId + '.scores', pause: 4,
      untilRemaining: 1, loopBack: introId, loopCount: loops, next: crownId
    };
    phases[crownId] = { type: 'winner', from: voteId + '.scores' };
    return crownId;
  }

  // charades: the class writes the phrases (or the last question step's
  // answers are the bowl), teams take turns, one describer at a time
  function appendCharades(step, stepNo, phases, lastId, problems) {
    var teams = lastOfType(phases, ['team-split'], lastId);
    if (!teams) {
      teams = freshId(phases, 'teams');
      phases[lastId].next = teams;
      phases[teams] = { type: 'team-split', method: 'random', teamCount: secondsOf(step.teamCount, 2, 6) || 2 };
      lastId = teams;
    }
    var src = lastPlainCollect(phases, lastId);
    if (!src) {
      src = freshId(phases, 'phrases');
      phases[lastId].next = src;
      phases[src] = {
        type: 'collect',
        prompt: (typeof step.phrases === 'string' && step.phrases.trim()) ? step.phrases.trim() : 'Write one phrase, title, or thing for a classmate to act out. Keep it clean and guessable.',
        timer: 60
      };
      lastId = src;
    }
    var id = freshId(phases, 'act');
    var built = {
      type: 'turn', pool: src + '.responses', teamsFrom: teams, allowSkip: true, poolLimit: 30,
      instruction: textOf(step, 'Act it out, no words! Your team guesses.')
    };
    built.timer = secondsOf(step.timer, 15, 300) || 60;
    phases[lastId].next = id;
    phases[id] = built;
    return id;
  }

  // count: the class counts to a target as one voice
  function appendCount(step, stepNo, phases, lastId, problems) {
    var id = freshId(phases, 'count');
    phases[lastId].next = id;
    phases[id] = { type: 'one-voice', target: secondsOf(step.target, 5, 100) || 20 };
    lastId = id;
    if (step.show !== false) {
      var showId = freshId(phases, 'how-it-went');
      phases[lastId].next = showId;
      var heading = (typeof step.heading === 'string' && step.heading.trim()) ? step.heading.trim() : 'How it went:';
      phases[showId] = {
        type: 'reveal',
        template: heading + '\n\nThe target: {{' + id + '.target}}. Attempts: {{' + id + '.attempts}}. Restarts: {{' + id + '.resets}}.\nOur longest run as one voice: {{' + id + '.bestRun}}.'
      };
      lastId = showId;
    }
    return lastId;
  }

  // The bricks whose points can share one scoreboard; consecutive ones
  // get a single standings step after the last of them.
  var GRADED_BRICKS = { 'match': true, 'sort': true, 'wager': true, 'charades': true, 'solo-quiz': true };
  function gradedAhead(steps, i) {
    var nxt = steps[i + 1];
    if (!nxt || !GRADED_BRICKS[nxt.brick]) return false;
    if (nxt.brick === 'solo-quiz' && nxt.standings !== true) return false;
    return true;
  }
  function appendStandings(phases, lastId, refs) {
    var id = freshId(phases, 'standings');
    phases[lastId].next = id;
    phases[id] = { type: 'leaderboard', from: refs.length === 1 ? refs[0] : refs.slice(), style: 'full' };
    return id;
  }

  // Rolling start: students begin the moment they join and finish on
  // their own. A step that depends on who is present when it starts
  // cannot run that way (the engine's own list, ROSTER_BOUND_TYPES in
  // engine/phases/rolling.js, mirrored here for the browser; a test keeps
  // them equal); timers mean nothing when everyone starts at a different
  // time.
  var ROLLING_BOUND = ['team-split', 'team-roles', 'merge', 'relay', 'turn', 'one-voice', 'checklist', 'foreach', 'eliminate', 'ai-eliminate', 'buzz'];
  function applyRolling(config, problems) {
    var bad = null;
    Object.keys(config.phases).forEach(function (pid) {
      var ph = config.phases[pid];
      var bound = ROLLING_BOUND.indexOf(ph.type) !== -1 ||
        (ph.type === 'collect' && (ph.assign === 'pairwise' || ph.rotateFrom));
      if (!bad && bound) bad = pid + ' (' + ph.type + ')';
    });
    if (bad) {
      problems.push('The activity cannot start as students arrive: step ' + bad + ' needs the whole class at once. It starts together instead.');
      return;
    }
    config.start = 'rolling';
    Object.keys(config.phases).forEach(function (pid) { delete config.phases[pid].timer; });
  }

  function compileStoryboard(storyboard) {
    var problems = [];
    var steps = (storyboard && Array.isArray(storyboard.steps)) ? storyboard.steps : [];
    if (steps.length === 0) {
      return { config: null, problems: ['The storyboard has no steps.'] };
    }

    var phases = { lobby: { type: 'lobby' } };
    var lastId = 'lobby';
    // Points from consecutive graded bricks share one scoreboard
    var gradedRun = [];

    steps.forEach(function (step, i) {
      var brick = step && step.brick;
      var built = null;
      var id = null;

      // Eleven bricks over blocks the engine already had (2026-09-30)
      if (GRADED_BRICKS[brick] || brick === 'rate' || brick === 'merge' || brick === 'relay' ||
          brick === 'tasks' || brick === 'knockout' || brick === 'charades' || brick === 'count') {
        var gradedRef = null;
        var newLast = null;
        if (brick === 'match') {
          newLast = appendMatch(step, i + 1, phases, lastId, problems);
          if (newLast) gradedRef = newLast + '.scores';
        } else if (brick === 'sort') {
          var sorted = appendSort(step, i + 1, phases, lastId, problems);
          if (sorted) { newLast = sorted.id; if (sorted.graded) gradedRef = sorted.id + '.scores'; }
        } else if (brick === 'wager') {
          newLast = appendWager(step, i + 1, phases, lastId, problems);
          if (newLast) gradedRef = newLast + '.scores';
        } else if (brick === 'solo-quiz') {
          newLast = appendSoloQuiz(step, i + 1, phases, lastId, problems);
          if (newLast && step.standings === true) gradedRef = newLast + '.scores';
        } else if (brick === 'charades') {
          newLast = appendCharades(step, i + 1, phases, lastId, problems);
          if (newLast) gradedRef = newLast + '.teamScores';
        } else if (brick === 'rate') {
          newLast = appendRate(step, i + 1, phases, lastId, problems);
        } else if (brick === 'merge') {
          newLast = appendMerge(step, i + 1, phases, lastId, problems);
        } else if (brick === 'relay') {
          newLast = appendRelay(step, i + 1, phases, lastId, problems);
        } else if (brick === 'tasks') {
          newLast = appendTasks(step, i + 1, phases, lastId, problems);
        } else if (brick === 'knockout') {
          newLast = appendKnockout(step, i + 1, phases, lastId, problems);
        } else if (brick === 'count') {
          newLast = appendCount(step, i + 1, phases, lastId, problems);
        }
        if (!newLast) return;
        lastId = newLast;
        if (gradedRef && step.standings !== false) gradedRun.push(gradedRef);
        // The scoreboard lands after the last graded brick in a row
        if (gradedRun.length && !gradedAhead(steps, i)) {
          lastId = appendStandings(phases, lastId, gradedRun);
          gradedRun = [];
        }
        return;
      }

      if (brick === 'quiz') {
        var quizLast = appendQuizChain(step, i + 1, phases, lastId, problems);
        if (quizLast) lastId = quizLast;
        return;
      }

      if (brick === 'teams') {
        var split = step && step.jigsaw === true
          ? buildJigsaw(phases, lastId, i + 1, problems)
          : (step && (step.groupBy === 'same' || step.groupBy === 'mixed')
            ? buildByAnswer(step, phases, lastId, i + 1, problems)
            : buildTeamSplit(step));
        if (!split) return;
        id = freshId(phases, step && step.jigsaw === true ? 'regroup' : (split.method === 'byAnswer' ? 'groups' : 'teams'));
        phases[lastId].next = id;
        phases[id] = split;
        lastId = id;
        return;
      }

      if (brick === 'review') {
        var reviewLast = appendReview(step, i + 1, phases, lastId, problems);
        if (reviewLast) lastId = reviewLast;
        return;
      }

      if (brick === 'write-quiz') {
        var wqLast = appendWriteQuiz(step, i + 1, phases, lastId, problems);
        if (wqLast) lastId = wqLast;
        return;
      }

      if (brick === 'bracket') {
        var bracketLast = appendBracket(step, i + 1, phases, lastId, problems);
        if (bracketLast) lastId = bracketLast;
        return;
      }

      if (brick === 'chain') {
        var chainLast = appendPassChain(step, i + 1, phases, lastId, problems);
        if (chainLast) lastId = chainLast;
        return;
      }

      if (brick === 'hotseat') {
        var seatLast = appendHotSeat(step, i + 1, phases, lastId, problems);
        if (seatLast) lastId = seatLast;
        return;
      }

      if (brick === 'quiet') {
        var quietLast = appendQuiet(step, i + 1, phases, lastId, problems);
        if (quietLast) lastId = quietLast;
        return;
      }

      if (brick === 'feedback') {
        var feedbackLast = appendFeedback(step, i + 1, phases, lastId, problems);
        if (feedbackLast) lastId = feedbackLast;
        return;
      }

      if (brick === 'deal') {
        var dealLast = appendDeal(step, i + 1, phases, lastId, problems);
        if (dealLast) lastId = dealLast;
        return;
      }

      if (brick === 'pairs') {
        var pairsLast = appendPairs(step, i + 1, phases, lastId, problems);
        if (pairsLast) lastId = pairsLast;
        return;
      }

      if (brick === 'roles') {
        var rolesLast = appendRoles(step, i + 1, phases, lastId, problems);
        if (rolesLast) lastId = rolesLast;
        return;
      }

      if (brick === 'draw') {
        var drawLast = appendDraw(step, i + 1, phases, lastId, problems);
        if (drawLast) lastId = drawLast;
        return;
      }

      if (brick === 'summarize') {
        var sumLast = appendSummarize(step, i + 1, phases, lastId, problems);
        if (sumLast) lastId = sumLast;
        return;
      }

      // A vote over the class's own answers or drawings: nobody votes for
      // their own, and the crown (host-paced, the drumroll beat) is the
      // payoff, since a tallied vote with nothing after it shows the class
      // no winner. A vote over the AI's literal options has no crown.
      var voteOverResponses = false;
      var voteOverStudents = brick === 'vote' && step.over === 'students';
      if (brick === 'vote' && !voteOverStudents) {
        var voteSrc = lastOfType(phases, ['collect'], lastId);
        voteOverResponses = !!voteSrc;
      }

      if (brick === 'guessing-rounds') {
        var rounds = buildGuessingRounds({
          phases: phases, afterId: lastId,
          guess: step.guess === 'who' ? 'who' : undefined
        });
        if (!rounds) {
          problems.push('Step ' + (i + 1) + ': guessing rounds need a question step before them.');
          return;
        }
        // A student's words never go up with a name on them without the
        // teacher reading them first (a divorce reached the projector in a
        // guess-who round, 2026-09-26): a preview gate sits between the
        // question step and the rounds. Approve = the rounds; Try again =
        // everyone answers again; one bad answer = Hide on the console.
        var gateId = freshId(phases, 'check');
        phases[lastId].next = gateId;
        phases[gateId] = {
          type: 'preview',
          template: 'Read the answers below before the rounds start. One a student would rather keep private? Press Hide beside it on your Teacher view. Try again asks everyone to answer again.',
          approveNext: rounds.id,
          rejectNext: rounds.src
        };
        phases[rounds.id] = rounds.phase;
        lastId = rounds.id;
        return;
      } else if (brick === 'assign') {
        // Hand out choices: needs the rank step right before it (the
        // storyboard prompt says so); every group, or every student when
        // that rank step has no groups, gets one of its items.
        var rankSrc = phases[lastId] && phases[lastId].type === 'rank' ? lastId : null;
        if (!rankSrc) {
          problems.push('Step ' + (i + 1) + ': hand out choices needs a rank step right before it.');
          return;
        }
        built = { type: 'assign', from: rankSrc, message: 'Here is who got what.' };
        if (typeof step.perChoice === 'number' && step.perChoice >= 1 && step.perChoice <= 50) {
          built.perChoice = Math.round(step.perChoice);
        }
        id = freshId(phases, BASE_ID_FOR.assign);
      } else if (brick === 'rank') {
        // A teacher-written items list beats the collected answers; with
        // neither there is nothing to put in order.
        var items = Array.isArray(step.items)
          ? step.items.map(String).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12)
          : [];
        if (items.length >= 2) {
          built = { type: 'rank', prompt: 'Put these in order, your favorite at the top.', candidates: items, timer: 90 };
          // The items are written in their right order (2026-09-30): the
          // step shows them shuffled and grades every right slot
          if (step.correct === true) {
            built.correctOrder = items.slice();
            built.pointsPerItem = 10;
          }
        } else if (step.correct === true) {
          problems.push('Step ' + (i + 1) + ': a graded order needs an items list written in the right order.');
          return;
        } else {
          built = defaultPhaseFor('rank', { phases: phases, afterId: lastId });
        }
        if (!built) {
          problems.push('Step ' + (i + 1) + ': rank needs a question step before it, or an items list to put in order.');
          return;
        }
        // Rank as groups: each group's order is its members' average
        // (byGroup, or an assign brick next with a teams step earlier,
        // since a hand-out to groups is what the teams were for).
        var nextBrick = steps[i + 1] && steps[i + 1].brick;
        if (step.byGroup === true || nextBrick === 'assign') {
          var teamsId = lastOfType(phases, ['team-split'], lastId);
          if (teamsId) {
            built.teamsFrom = teamsId;
          } else if (step.byGroup === true) {
            problems.push('Step ' + (i + 1) + ': ranking as groups needs a teams step before it, so the class ranks as one.');
          }
        }
        // Instant runoff (2026-10-01): every order is a ballot and the
        // class picks ONE item; a graded order or a hand-out wants the
        // whole order instead
        if (step.runoff === true) {
          if (built.correctOrder) {
            problems.push('Step ' + (i + 1) + ': a runoff picks the class\'s choice and a right order grades one; the runoff was left off.');
          } else if (nextBrick === 'assign') {
            problems.push('Step ' + (i + 1) + ': a hand-out after the ranking needs the whole order; the runoff was left off.');
          } else {
            built.runoff = true;
          }
        }
        id = freshId(phases, BASE_ID_FOR.rank);
      } else if (voteOverStudents) {
        // The students themselves on the ballot (2026-09-30): who was the
        // spy, who presents first; nobody votes for themselves
        built = { type: 'vote', mode: 'pick-one', candidates: 'players', excludeAuthors: true, question: textOf(step, 'Who do you pick?'), timer: 45 };
        id = freshId(phases, 'pick');
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
      // A reveal's style (2026-09-30): the answers of the last question
      // step as a sized word cloud, as cards all at once, or one at random
      if (brick === 'reveal' && (step.style === 'cloud' || step.style === 'cards' || step.style === 'random')) {
        var styleSrc = lastOfType(phases, ['collect', 'collect-choice'], lastId);
        if (styleSrc) {
          var heading = (typeof step.text === 'string' && step.text.trim()) ? step.text.trim()
            : (step.style === 'cloud' ? 'What we said, the bigger the more of us said it:' : (step.style === 'cards' ? 'Here is what we said:' : 'One of us said:'));
          built.template = heading + '\n\n{{' + styleSrc + '.responses.' + step.style + '}}';
        } else {
          problems.push('Step ' + (i + 1) + ': a reveal drawn as a ' + (step.style === 'cloud' ? 'word cloud' : step.style) + ' needs a question step before it.');
        }
      }
      if (brick === 'collect-choice' && Array.isArray(step.choices) && step.choices.length >= 2) {
        built.choices = step.choices.slice(0, 8).map(String);
      }
      // Several picks (2026-09-30): "choose up to three"
      if (brick === 'collect-choice' && typeof step.maxPicks === 'number' && step.maxPicks >= 2) {
        var cap = Array.isArray(built.choices) ? built.choices.length : 8;
        built.maxPicks = Math.min(Math.round(step.maxPicks), cap, 8);
        if (built.maxPicks < 2) delete built.maxPicks;
      }
      // A right answer on an open question (2026-09-30): fill in the blank,
      // one-word answers, "translate this word"; the standings follow
      if (brick === 'collect' && typeof step.answer === 'string' && step.answer.trim() && !built.fields && built.inputType !== 'drawing') {
        built.correctAnswer = step.answer.trim();
        var accepted = cleanLines(step.accepted, 8);
        if (accepted.length) built.acceptedAnswers = accepted;
        built.pointsCorrect = 100;
      }
      // Text per group (2026-09-30): each group reads its own line where
      // {{thisStep.station}} stands; needs a teams step before it
      if ((brick === 'announce' || brick === 'collect' || brick === 'collect-choice') && Array.isArray(step.stations)) {
        var lines = cleanLines(step.stations, 12);
        var stationSplit = lastOfType(phases, ['team-split'], lastId);
        if (lines.length >= 2 && stationSplit) {
          built.stations = lines;
          built.stationsFrom = stationSplit;
          var stKey = brick === 'announce' ? 'message' : 'prompt';
          var stToken = '{{' + id + '.station}}';
          if (typeof built[stKey] !== 'string' || !/\{\{\s*thisStep\.station\s*\}\}/.test(built[stKey])) {
            built[stKey] = (typeof built[stKey] === 'string' && built[stKey] ? built[stKey] + '\n\n' : '') + stToken;
          } else {
            built[stKey] = built[stKey].replace(/\{\{\s*thisStep\.station\s*\}\}/g, stToken);
          }
        } else if (lines.length >= 2) {
          problems.push('Step ' + (i + 1) + ': text per group needs a teams step before it, so the lines were left out.');
        } else {
          problems.push('Step ' + (i + 1) + ': text per group needs at least two lines, so they were left out.');
        }
      }
      // A private hand-out from the teacher's list (2026-09-24): each
      // student is dealt one item (collect.dealItems, wrapping around a
      // small list), read back by {{thisStep.assigned}} on their screen
      // only; the projector shows a blank there. The rank + assign pair
      // is the public draft, so a "secret" idea lands here instead.
      if (brick === 'collect' && Array.isArray(step.items)) {
        var dealt = step.items.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean).slice(0, 60);
        if (dealt.length >= 2) {
          built.dealItems = dealt;
          // The AI writes {{thisStep.assigned}}; the engine reads the
          // step's own id ({{<id>.assigned}}, engine/per-player-template.js)
          var token = '{{' + id + '.assigned}}';
          if (typeof built.prompt !== 'string' || !/\{\{\s*thisStep\.assigned\s*\}\}/.test(built.prompt)) {
            built.prompt = token + '\n\n' + (typeof built.prompt === 'string' ? built.prompt : '');
          } else {
            built.prompt = built.prompt.replace(/\{\{\s*thisStep\.assigned\s*\}\}/g, token);
          }
        } else {
          problems.push('Step ' + (i + 1) + ': a hand-out needs at least two items, so the list was left out.');
        }
      }
      // A clip on the projector (announce, collect, collect-choice carry a
      // player): only a YouTube link rides through, mirroring the id
      // patterns in engine/video.js, so a bad link never renders a broken
      // player and the teacher hears why.
      if (typeof step.video === 'string' && step.video.trim() &&
          (brick === 'announce' || brick === 'collect' || brick === 'collect-choice')) {
        var link = step.video.trim();
        if (YOUTUBE_LINK.test(link)) {
          built.video = link;
        } else {
          problems.push('Step ' + (i + 1) + ': the video link is not a YouTube link, so it was left out (paste a youtube.com or youtu.be link in the designer).');
        }
      }
      if (brick === 'collect-two' && built.fields) {
        if (step.secretLabel) built.fields[0].label = String(step.secretLabel);
        if (step.clueLabel) built.fields[1].label = String(step.clueLabel);
      }
      if (typeof step.timer === 'number' && step.timer >= 5 && step.timer <= 600 &&
          (brick === 'collect' || brick === 'collect-two' || brick === 'collect-choice' ||
           brick === 'estimate' || brick === 'rank')) {
        built.timer = Math.round(step.timer);
      }
      // A scale question ("on a scale of 1 to 10") carries its range; the
      // student screen turns it into a row of numbers to tap. Left open,
      // the server still reads the wording (engine/phases/estimate-range.js).
      if (brick === 'estimate' && typeof step.min === 'number' && typeof step.max === 'number' &&
          isFinite(step.min) && isFinite(step.max) && step.max > step.min) {
        built.min = step.min;
        built.max = step.max;
      }
      // The true number: with it the step reveals the answer, the class
      // spread, and closeness scores at close. Without it the step opens as
      // a poll, and the teacher may type the number on the console before
      // the close (the jar count), so unit and scoring ride through either way.
      if (brick === 'estimate') {
        if (typeof step.answer === 'number' && isFinite(step.answer)) built.answer = step.answer;
        if (typeof step.unit === 'string' && step.unit.trim()) built.unit = step.unit.trim();
        if (step.scoring === 'graduated' || step.scoring === 'closest') built.scoring = step.scoring;
      }

      if (brick === 'vote' && voteOverResponses) built.excludeAuthors = true;
      // A yes-or-no vote (2026-09-25): every student says yes or no to
      // every entry, and the ones with more yes than no pass; the payoff
      // is a host-paced reveal of what passed, never a single crown.
      var approveVote = brick === 'vote' && step.approve === true;
      if (approveVote) built.mode = 'approve';
      // A poll's tally grows on the projector as answers land (Live
      // Poll's shape); a warm-up poll used to close into nothing (a
      // reviewer, 2026-09-27). The graded quiz keeps its own reveal.
      if (brick === 'collect-choice' && !built.correctAnswer) built.liveResults = true;

      phases[lastId].next = id;
      phases[id] = built;
      lastId = id;

      // "Show the top five" (2026-09-28): the vote keeps only its N most
      // voted entries in the lists it prints.
      var topN = brick === 'vote' && typeof step.top === 'number' && step.top >= 1 && step.top <= 50
        ? Math.round(step.top) : null;
      if (topN) built.resultsLimit = topN;
      if (approveVote) {
        var passedId = freshId(phases, 'passed');
        phases[lastId].next = passedId;
        // What failed stays on the wall too (something to argue about),
        // and the turnout line says how many decided it (2026-09-26);
        // showRejected: false keeps it off for personal answers (a
        // reviewer's anonymous question box put "Did not pass" and the
        // counts under a student's own question, 2026-09-28).
        var passedTemplate = (topN ? 'What the class passed, most votes first:' : 'What the class passed:') + '\n\n{{' + id + '.approvedList}}\n\n';
        if (step.showRejected !== false) passedTemplate += 'Did not pass:\n\n{{' + id + '.rejectedList}}\n\n';
        passedTemplate += '{{' + id + '.turnout}}';
        phases[passedId] = { type: 'reveal', template: passedTemplate };
        lastId = passedId;
      } else if (brick === 'vote' && voteOverResponses && topN) {
        // The top N with their votes instead of a single crown
        var topId = freshId(phases, 'top');
        phases[lastId].next = topId;
        // No count in the heading: the list may hold fewer than N
        // (2026-09-28, "Top 5" over four questions)
        phases[topId] = { type: 'reveal', template: 'Most votes first:\n\n{{' + id + '.resultsList}}' };
        lastId = topId;
      } else if (brick === 'vote' && voteOverResponses) {
        var crownId = freshId(phases, 'crown');
        phases[lastId].next = crownId;
        phases[crownId] = { type: 'winner', from: id + '.scores' };
        lastId = crownId;
      } else if (voteOverStudents) {
        // The chosen name on the projector; with out: true they leave the
        // round (eliminate by most votes, the engine announces who)
        if (step.out === true) {
          var outId = freshId(phases, 'out');
          phases[lastId].next = outId;
          phases[outId] = { type: 'eliminate', method: 'most-votes', count: 1, input: id + '.scores', pause: 5 };
          lastId = outId;
        } else {
          var pickedId = freshId(phases, 'picked');
          phases[lastId].next = pickedId;
          var pickedHeading = (typeof step.heading === 'string' && step.heading.trim()) ? step.heading.trim() : 'The class picked:';
          phases[pickedId] = { type: 'reveal', template: pickedHeading + '\n\n**{{' + id + '.winnerText}}**' };
          lastId = pickedId;
        }
      } else if (brick === 'buzz') {
        // The buzzer's points are the payoff: the standings go up after
        // the round, host-paced (Lightning Round's scoreboard).
        if (typeof step.points === 'number' && step.points >= 1 && step.points <= 1000) {
          built.points = Math.round(step.points);
        }
        var standingsId = freshId(phases, 'standings');
        phases[lastId].next = standingsId;
        phases[standingsId] = { type: 'leaderboard', from: id + '.scores', style: 'full' };
        lastId = standingsId;
      }

      // A graded open answer's standings (2026-09-30)
      if (brick === 'collect' && built.correctAnswer && step.standings !== false) {
        lastId = appendStandings(phases, lastId, [id + '.scores']);
      }

      // The class order is the rank brick's payoff: a host-paced reveal
      // reads it back (never timed, PROJECTOR-STYLE rule). With a hand-out
      // next, the hand-out is the payoff and the assign brick needs the
      // rank step right behind it.
      var handOutNext = steps[i + 1] && steps[i + 1].brick === 'assign';
      if (brick === 'rank' && !handOutNext) {
        var orderId = freshId(phases, 'order-show');
        phases[lastId].next = orderId;
        phases[orderId] = {
          type: 'reveal',
          template: built.runoff
            ? 'The class picked:\n\n**{{' + id + '.winnerText}}**\n\n{{' + id + '.runoffList}}'
            : built.correctOrder
            ?'The class order:\n\n{{' + id + '.rankedList}}\n\nThe right order:\n\n{{' + id + '.correctList}}\n\nThe class put {{' + id + '.placedRight}} of {{' + id + '.itemCount}} in the right slot.'
            : 'The class ranking:\n\n{{' + id + '.rankedList}}'
        };
        lastId = orderId;
        if (built.correctOrder && step.standings !== false) {
          lastId = appendStandings(phases, lastId, [id + '.scores']);
        }
      }
    });

    if (Object.keys(phases).length === 1) {
      return { config: null, problems: problems.length ? problems : ['No usable steps.'] };
    }

    // A poll nothing later reads gets its final chart as a host-paced
    // reveal right after it (Live Poll's results step), under the poll's
    // own question so no fixed English rides into another language.
    Object.keys(phases).forEach(function (pid) {
      var poll = phases[pid];
      if (!poll || poll.type !== 'collect-choice' || !poll.liveResults) return;
      var read = Object.keys(phases).some(function (other) {
        var ph = phases[other];
        if (other === pid) return false;
        // A pairs step keyed on this poll reads it too (pairBy, 2026-09-28)
        if (ph.pairBy && ph.pairBy.from === pid) return true;
        // A split by answer reads it too (2026-09-30)
        if (ph.groupBy === pid) return true;
        return ['template', 'message', 'prompt', 'content', 'instruction', 'input', 'from', 'data'].some(function (f) {
          return typeof ph[f] === 'string' && ph[f].indexOf(pid + '.') !== -1;
        });
      });
      if (read) return;
      var chartId = freshId(phases, 'results');
      phases[chartId] = {
        type: 'reveal',
        template: (typeof poll.prompt === 'string' && poll.prompt ? poll.prompt + '\n\n' : '') + '{{' + pid + '.barChart}}',
        next: poll.next
      };
      poll.next = chartId;
      if (lastId === pid) lastId = chartId;
    });

    if (!hasEnd(phases)) {
      var endId = freshId(phases, 'wrap');
      phases[lastId].next = endId;
      phases[endId] = defaultPhaseFor('end', { phases: phases });
      lastId = endId;
    }

    // A vote's .winner is an id; the words the AI meant are .winnerText
    // (a reveal that read {{vote.winner}} showed a player id, 2026-09-24).
    Object.keys(phases).forEach(function (pid) {
      var ph = phases[pid];
      ['template', 'message', 'prompt', 'content', 'instruction'].forEach(function (f) {
        if (typeof ph[f] === 'string' && ph[f].indexOf('.winner}}') !== -1) {
          ph[f] = ph[f].replace(/\.winner\s*\}\}/g, '.winnerText}}');
        }
      });
    });

    var config = {
      name: String((storyboard && storyboard.name) || 'New Activity').slice(0, 60),
      description: String((storyboard && storyboard.description) || '').slice(0, 300),
      minPlayers: 2,
      phases: phases
    };
    if (storyboard && storyboard.rolling === true) applyRolling(config, problems);
    return { config: config, problems: problems };
  }

  var BASE_ID_FOR = {
    'collect': 'ask', 'collect-two': 'share', 'collect-choice': 'poll',
    'estimate': 'guess', 'announce': 'announce', 'reveal': 'show',
    'reveal-one': 'show-one', 'vote': 'vote', 'rank': 'order', 'assign': 'hand-out', 'end': 'wrap',
    'buzz': 'buzzer'
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
    GRADED_BRICKS: GRADED_BRICKS,
    CONFIDENCE_PROMPT: CONFIDENCE_PROMPT,
    CONFIDENCE_LEVELS: CONFIDENCE_LEVELS,
    ROLLING_BOUND: ROLLING_BOUND,
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
