/**
 * STUB rev. 2 — Shared phase schema, declarative-only.
 *
 * Implements the rev. 2 architectural principles from
 * docs/PHASE-SCHEMA-SPEC.md §2:
 *
 *   1. Schema is declarative data only. Behavior (dynamic-output
 *      resolvers) is referenced by name and resolved through a registry in:
 *        - engine/phase-schema-runtime.js  DYNAMIC_OUTPUT_RESOLVERS
 *
 *   2. Mixins (not "universal" fields). Phases opt into capability
 *      blocks: screenControl, timer, participantSelector, loops.
 *
 *   3. Transitions separate from fields. Graph-level passes
 *      (reachability, cycle detection) ask the schema for edges
 *      instead of guessing.
 *
 *   4. allowedIn: ['topLevel', 'foreach'] replaces the subPhase: true
 *      flag. Same phase types under different graph rules.
 *
 *   5. Outputs declare semantic capabilities (responseArray,
 *      candidateSource, scoreMap, etc.) plus per-output renderer
 *      mappings. Dynamic outputs use kind: 'dynamic' + named resolver.
 *
 *   6. Aliases let legacy synthetic tokens (e.g. {{vote.barChart}})
 *      keep working with an info-level diagnostic suggesting the
 *      canonical form.
 *
 * Browser-safe: this file imports nothing Node-specific so it can be
 * loaded by the editor in the browser.
 *
 * NOT YET WIRED INTO ANYTHING — the validator and editor still use
 * the existing scattered constants in engine/game-loader.js and
 * screens/designer/editor.js. The agreement test (run via
 * scripts/check-schema-agreement.js, see end of file) ensures this
 * stub stays behavior-equivalent to those constants until the
 * migration starts.
 */

// =======================================================================
// MIXINS — common capability blocks reused across phase types.
// Schema entries opt in via `mixins: ['screenControl', ...]`.
// `participantSelector:voters` applies the mixin and renames its `from`
// field to `voters`.
// =======================================================================

export const MIXINS = {

  screenControl: {
    contexts: ['topLevel'],   // not applicable inside foreach sub-phases
    fields: {
      hostShow: { type: 'array', item: { type: 'string' }, optional: true, label: 'Host UI elements to show' },
      playerShow: { type: 'array', item: { type: 'string' }, optional: true, label: 'Player UI elements to show' },
      hostTemplate: { type: 'templateString', optional: true, label: 'Custom host text' },
      playerTemplate: { type: 'templateString', optional: true, label: 'Custom player text' },
      // Overrides the generated advance-button wording ("Start the voting")
      // for the button shown DURING this phase — resolved in
      // engine/phases/continue-labels.js continueLabelForPhase.
      continueLabel: { type: 'string', optional: true, label: 'Next button label' },
      // Rolling-start activities (top-level start:"rolling"): what a
      // student sees the moment their last input lands. Read by
      // engine/phases/rolling.js doneMessageFor.
      doneMessage: {
        type: 'string', optional: true, label: 'Done message (rolling start)',
        helper: 'Rolling-start activities only: the line a student sees once they have finished this step and nothing else needs them.'
      },
      // A question for the teacher to ask during this step. Lives on the
      // private console; "Show on the class screen" puts it on the
      // projector when the teacher wants it (outside review #2, 2026-09-07).
      discussionPrompt: {
        type: 'string', optional: true, label: 'Discussion prompt (teacher console)',
        helper: 'A question to ask the class during this step, e.g. "What made the other answers tempting?" Shows on your teacher console with a button to put it on the class screen; students never see it unless you do.'
      }
    }
  },

  timer: {
    contexts: ['topLevel', 'foreach'],
    fields: {
      timer: {
        type: 'integer', min: 1, max: 3600, optional: true,
        label: 'Time limit (seconds)'
      }
    }
  },

  // participantSelector adds a `from`-style enum. The default field
  // name is `from`; phases can rename via `participantSelector:voters`.
  participantSelector: {
    contexts: ['topLevel', 'foreach'],
    fields: {
      from: {
        type: 'enum',
        values: ['all', 'remaining', 'eliminated'],
        default: 'all',
        label: 'Who can participate'
      }
    }
  },

  // loops adds the loopBack/loopCount transition pair. Top-level only
  // (sub-phases auto-chain inside foreach, so no manual looping).
  loops: {
    contexts: ['topLevel'],
    transitions: {
      loopBack: { type: 'phaseRef', optional: true, requires: 'loopCount' },
      loopCount: { type: 'integer', min: 2, max: 100, optional: true }
    }
  }
};

// =======================================================================
// PHASE_SCHEMAS — one entry per phase type. Pure declarative data.
// =======================================================================

export const PHASE_SCHEMAS = {

  // -------------------------------------------------------------------
  lobby: {
    label: 'Lobby',
    icon: '🚪',
    description: 'Players join here. Game starts when host clicks Start.',
    role: 'flow',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      minPlayers: {
        type: 'integer', min: 1, max: 100, optional: true,
        label: 'Minimum players to start'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: { kind: 'static', fields: {} }
  },

  // -------------------------------------------------------------------
  end: {
    label: 'End',
    icon: '🏁',
    description: 'Game over screen.',
    role: 'terminal',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      message: { type: 'templateString', optional: true, label: 'End message' }
    },
    // Terminal — `next` is allowed (universal carry-over) but not required.
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: { kind: 'static', fields: {} },
    ui: {
      hostToggles: ['message', 'playAgainButton'],
      playerToggles: ['message']
    }
  },

  // -------------------------------------------------------------------
  announce: {
    label: 'Announce',
    icon: '📢',
    description: 'Show a message to the whole class. Round intros, instructions.',
    role: 'display',
    allowedIn: ['topLevel', 'foreach'],
    mixins: ['screenControl', 'timer', 'loops'],
    fields: {
      message: {
        type: 'templateString', required: true,
        label: 'Message',
        placeholder: 'Round 1, get ready!'
      },
      image: {
        type: 'string', optional: true,
        label: 'Image (optional)',
        helper: 'Path to an uploaded image (e.g. assets/photo.jpg). Use the upload widget below.'
      },
      video: {
        type: 'string', optional: true,
        label: 'YouTube video (optional)',
        helper: 'Paste a YouTube link. Plays on the host/projector screen.'
      },
      drawingFrom: {
        type: 'string', optional: true,
        label: 'Show a drawing from (optional)',
        helper: 'Data path to a student drawing shown on every screen during this step. Inside a For Each over drawing responses, use "_current.drawing" for the round\'s drawing. Display only; it never preloads the drawing pad.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true, allowedIn: ['topLevel'] }
    },
    output: {
      kind: 'static',
      fields: {
        message: { type: 'string', capability: 'renderable' }
      }
    },
    ui: {
      hostToggles: ['message', 'image', 'video', 'continueButton', 'timer'],
      playerToggles: ['message', 'image', 'timer']
    }
  },

  // -------------------------------------------------------------------
  collect: {
    label: 'Ask Players',
    icon: '✏️',
    description: 'Players type a free-text response.',
    role: 'input',
    allowedIn: ['topLevel', 'foreach'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', required: true,
        label: 'Question to ask',
        helper: 'What students see. Can include {{tokens}} from earlier steps.',
        placeholder: 'How are you feeling today?'
      },
      inputType: {
        type: 'enum', values: ['text', 'drawing'], optional: true, default: 'text',
        label: 'Students answer with',
        helper: '"drawing" replaces the text box with a drawing pad. Drawings flow to reveal galleries and rotation chains; AI steps can\'t read them. With rotateFrom: a drawing source preloads onto the pad (continue it), or displays above a text box (caption it).'
      },
      fields: {
        type: 'array', item: { type: 'string' }, optional: true,
        label: 'Multi-field response',
        helper: 'Optional. List of field names if students should fill in more than one box.'
      },
      // Rotation/pairing fields are top-level only: inside a foreach round
      // the remap layer never rewrites their refs and their outputs land
      // under virtual `_fe:` ids nothing can consume, so they'd silently
      // read no data at game time (2026-08-26 interop review).
      rotateFrom: {
        type: 'phaseRef', optional: true, contexts: ['topLevel'],
        label: 'Rotate items from',
        helper: 'Optional. Each player receives a different player\'s item from the named step. Use {{stepId.assigned}} in the prompt to show it.'
      },
      rotateOffset: {
        type: 'integer', min: 1, max: 100, optional: true, default: 1, contexts: ['topLevel'],
        label: 'Rotation offset',
        helper: 'How many positions to shift. Default 1 = each player gets the previous player\'s item.'
      },
      rotateShuffle: {
        type: 'boolean', optional: true, contexts: ['topLevel'],
        label: 'Shuffle the deal',
        helper: 'With "Rotate items from": deal the items in a random circle instead of a fixed shift. Each player still gets exactly one classmate\'s item, never their own, but who got whose is unpredictable. Ignores the rotation offset.'
      },
      dealItems: {
        type: 'array', item: { type: 'string' }, optional: true, contexts: ['topLevel'],
        label: 'Deal these items out',
        helper: 'Optional. Your own list: each player is handed one item from it, in a random order (wrapping around if the class is bigger than the list). Use {{thisStepId.assigned}} in the prompt to show it. An alternative to "Rotate items from" when the items come from you, not the students.'
      },
      assign: {
        type: 'enum', values: ['pairwise'], optional: true, contexts: ['topLevel'],
        label: 'Pair players up',
        helper: 'Set to "pairwise" to split players into pairs of 2. With "Pair items from" set, each pair shares one prompt drawn from that step ({{sourceId.assigned}} shows it); without it, every pair gets this step\'s own prompt.'
      },
      pairsFrom: {
        type: 'phaseRef', optional: true, contexts: ['topLevel'],
        label: 'Pair items from',
        helper: 'Optional with assign:"pairwise". The step whose responses provide the per-pair prompts (one prompt per pair, drawn from sourceId.responses). Leave empty to give every pair this step\'s own prompt.'
      },
      pairBy: {
        type: 'object', optional: true, contexts: ['topLevel'],
        label: 'Pair by earlier answer',
        helper: 'Optional with assign:"pairwise". {from: "<Multiple Choice step>", mode: "opposite" | "same"}. Pairs students by what they answered in that step: "opposite" prefers partners who answered differently (share a why with someone who disagreed), "same" prefers matching answers. Best-effort: when the split is lopsided, leftover students still pair with each other, nobody sits out because of it.'
      },
      oddHandling: {
        type: 'enum', values: ['sit-out', 'triple'], optional: true, default: 'sit-out', contexts: ['topLevel'],
        label: 'Odd player count',
        helper: '"sit-out" (default): the leftover player waits this round. "triple": the last three players form one group of three, use for connection games where nobody should sit out. Avoid "triple" when a later vote uses matchupsFromPairs (head-to-head needs exactly 2).'
      },
      rotatePairsFrom: {
        type: 'phaseRef', optional: true, contexts: ['topLevel'],
        label: 'New partners (avoid repeats from)',
        helper: 'Optional with assign:"pairwise". Names an earlier pairwise step; this step builds a NEW pairing that avoids re-matching partners from that step (greedy, best-effort).'
      },
      reusePairsFrom: {
        type: 'phaseRef', optional: true, contexts: ['topLevel'],
        label: 'Same partners as',
        helper: 'Optional with assign:"pairwise". Names an earlier pairwise step OR a Split into Teams step; this step keeps exactly those pairs/groups (same partner, next prompt). Pointing it at a teacher-arranged team split with group size 2 turns hand-picked pairs into real pairs.'
      },
      sides: {
        type: 'array', item: { type: 'string' }, optional: true, contexts: ['topLevel'],
        label: 'Two sides to deal',
        helper: 'Optional with assign:"pairwise". Exactly two labels, e.g. ["For", "Against"]: each pair\'s members are dealt one each (a triple gets two of the first). Show them with {{thisStepId.side}} and {{thisStepId.partnerSide}}; a later step that keeps the same partners (reusePairsFrom) can show the partner\'s answer with {{thisStepId.partner}}.'
      },
      passAllowed: {
        type: 'boolean', optional: true,
        label: 'Allow passing',
        helper: 'Adds a Pass button. A pass counts the same as a submission (the step can close), is excluded from results and AI input, and is never shown to the class.'
      },
      prefillFromAssigned: {
        type: 'boolean', optional: true, contexts: ['topLevel'],
        label: 'Start the box with the passed item',
        helper: 'With "Rotate items from" set: the classmate\'s item lands IN the text box so this student adds to it (accumulating lists, write, pass, add one). Text answers only.'
      },
      appendOnly: {
        type: 'boolean', optional: true, contexts: ['topLevel'],
        label: 'Protect the passed item (add-only)',
        helper: 'With "Rotate items from" + prefill: the classmate\'s lines render read-only and this student can only ADD below them, nobody can delete or rewrite a classmate\'s work. The server enforces it.'
      },
      showTail: {
        type: 'integer', min: 1, max: 50, optional: true, contexts: ['topLevel'],
        label: 'Show only the last N words',
        helper: 'The fold: with add-only on, the student sees just the last N words of the inherited text (the rest is hidden behind an ellipsis) and continues from there. The full text still accumulates for reveals. Exquisite corpse, folded stories.'
      },
      maxLength: {
        type: 'integer', min: 40, max: 2000, optional: true,
        label: 'Answer length limit',
        helper: 'Character cap for this step (default 280). Raise it for accumulating lists that grow as they pass between students.'
      },
      simultaneousReveal: {
        type: 'boolean', optional: true,
        label: 'Reveal all at once',
        helper: 'Hide who has answered until the step closes, the projected counter shows numbers only, no names. The host moderation panel still sees submissions live.'
      },
      image: {
        type: 'string', optional: true,
        label: 'Image (optional)',
        helper: 'Path to an uploaded image (e.g. assets/photo.jpg). Use the upload widget below.'
      },
      video: {
        type: 'string', optional: true,
        label: 'YouTube video (optional)',
        helper: 'Paste a YouTube link. Plays on the host/projector screen.'
      },
      drawingFrom: {
        type: 'string', optional: true,
        label: 'Show a drawing from (optional)',
        helper: 'Data path to a student drawing shown on every screen during this step. Inside a For Each over drawing responses, use "_current.drawing" for the round\'s drawing. Display only; it never preloads the drawing pad.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true, allowedIn: ['topLevel'] }
    },
    // Output shape varies (multi-field adds .fields per response)
    output: { kind: 'dynamic', resolver: 'collectOutput' },
    ui: {
      hostToggles: ['prompt', 'image', 'video', 'counter', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'image', 'input', 'timer', 'submitButton']
    }
  },

  // -------------------------------------------------------------------
  'collect-choice': {
    label: 'Multiple Choice',
    icon: '🔘',
    description: 'Players pick one of several preset answers.',
    role: 'input',
    allowedIn: ['topLevel', 'foreach'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: { type: 'templateString', required: true, label: 'Question' },
      choices: {
        type: 'array', item: { type: 'string' }, optional: true,
        label: 'Answer choices',
        helper: 'List of fixed answer choices. Either this OR choicePool must be set.'
      },
      choicePool: {
        type: 'array',
        item: { type: 'object', allowAnyKeys: true },
        optional: true,
        label: 'Build choices from multiple sources',
        helper: 'Optional. Combine collected responses with literal entries. Each item is {from: "stepId.responses", field?: "text"} or {literal: "{{stepId.field}} or text", optional?: true}.'
      },
      excludeAuthored: {
        type: 'phaseRef', optional: true,
        label: 'Hide my own contribution',
        helper: 'Optional. Names a prior collect step. For each player, the choice they wrote in that step is removed from their list (used in bluffing games where you can\'t vote for your own lie).'
      },
      foolPoints: {
        type: 'integer', min: 1, max: 1000, optional: true,
        label: 'Points per classmate fooled',
        helper: 'Bluffing payoff: the AUTHOR of a fake earns this many points for every classmate who picks it (needs "Hide my own contribution" so authorship is known). Votes for the correct answer award nobody.'
      },
      poolLimit: {
        type: 'integer', min: 2, max: 30, optional: true,
        label: 'Max options per ballot (random sample)',
        helper: 'With a choice pool: cap each player\'s ballot at a readable size, 25 fakes + the truth is a wall of text on a timer. Injected answers (the truth, the house lie) always stay on every ballot.'
      },
      shuffle: {
        type: 'boolean', optional: true,
        label: 'Shuffle choices per player',
        helper: 'When true, each player sees a different randomization of the choices.'
      },
      liveResults: {
        type: 'boolean', optional: true,
        label: 'Show the tally live on the projector',
        helper: 'The bar chart grows on the projector as answers come in (counts only, never names). The Live Poll. Leave off for quizzes, where seeing the class lean would give the answer away.'
      },
      correctAnswer: {
        type: 'templateString', optional: true,
        label: 'Correct answer',
        helper: 'When set, this becomes a graded question. Correct players earn points (per pointsCorrect); wrong = 0. Accepts plain text or a {{ref}} like {{trivia.result.truth}}.'
      },
      pointsCorrect: {
        type: 'integer', min: 1, max: 100000, optional: true, default: 1000,
        label: 'Points for a correct answer',
        helper: 'Maximum points an instant-correct answer earns. Default 1000.'
      },
      speedBonus: {
        type: 'boolean', optional: true, default: true,
        label: 'Faster answers earn more',
        helper: 'Kahoot-style: 100% at instant, dropping linearly to 50% at the timer expiry. Requires a timer; ignored if no timer is set.'
      },
      image: {
        type: 'string', optional: true,
        label: 'Image (optional)',
        helper: 'Path to an uploaded image (e.g. assets/photo.jpg). Use the upload widget below.'
      },
      video: {
        type: 'string', optional: true,
        label: 'YouTube video (optional)',
        helper: 'Paste a YouTube link. Plays on the host/projector screen.'
      },
      drawingFrom: {
        type: 'string', optional: true,
        label: 'Show a drawing from (optional)',
        helper: 'Data path to a student drawing shown on every screen during this step. Inside a For Each over drawing responses, use "_current.drawing" for the round\'s drawing. Display only; it never preloads the drawing pad.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true, allowedIn: ['topLevel'] }
    },
    output: {
      kind: 'static',
      fields: {
        responses: {
          type: 'array',
          capability: 'responseArray',
          renderers: { list: 'responseList', count: 'arrayCount', json: 'jsonPretty' }
        },
        tally: {
          type: 'scoreMap',
          capability: 'scoreMap',
          renderers: { barChart: 'tallyBarChart', json: 'jsonPretty' }
        },
        // Populated only when `correctAnswer` is set on this phase.
        scores: {
          type: 'scoreMap',
          capability: 'scoreMap',
          renderers: { json: 'jsonPretty' }
        },
        correctAnswer: { type: 'string' }
      }
    },
    // Note: bare {{X.barChart}} on collect-choice is the documented
    // shorthand for {{X.tally.barChart}} (the engine's resolver pulls
    // X.tally automatically). Not a legacy form — no alias needed.
    ui: {
      hostToggles: ['prompt', 'image', 'video', 'counter', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'image', 'choices', 'timer']
    }
  },

  // -------------------------------------------------------------------
  'solo-quiz': {
    label: 'Self-paced Quiz',
    icon: '📝',
    description: 'Students work through a question list on their own devices at their own pace. The projector shows progress only, never a question. Speed does not count.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl'],
    fields: {
      title: { type: 'templateString', optional: true, label: 'Title shown on the projector' },
      questions: {
        type: 'array', required: true,
        item: { type: 'object', allowAnyKeys: true },
        label: 'Questions',
        helper: 'Each item: {"question": "...", "choices": ["A", "B", "C"], "correct": "B"}. The correct answer must match one choice exactly. Questions with fewer than 2 choices are skipped.'
      },
      pointsPerQuestion: {
        type: 'integer', min: 1, max: 1000, optional: true, default: 1,
        label: 'Points per correct answer'
      },
      showAnswers: {
        type: 'boolean', optional: true, default: true,
        label: 'Show the right answer after each question',
        helper: 'Off: students only learn whether they were right.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true, allowedIn: ['topLevel'] }
    },
    output: {
      kind: 'static',
      fields: {
        scores: {
          type: 'scoreMap',
          capability: 'scoreMap',
          renderers: { json: 'jsonPretty' }
        },
        results: {
          type: 'array',
          renderers: { json: 'jsonPretty' }
        },
        averagePct: { type: 'number' }
      }
    },
    ui: {
      hostToggles: ['title', 'counter', 'closeButton'],
      playerToggles: ['question', 'choices']
    }
  },

  // -------------------------------------------------------------------
  'ai-process': {
    label: 'AI Does Something',
    icon: '🤖',
    description: 'AI processes data or generates content.',
    role: 'compute',
    allowedIn: ['topLevel', 'foreach'],
    mixins: ['screenControl', 'loops'],
    fields: {
      instruction: {
        type: 'templateString', required: true,
        label: 'Instructions to AI',
        placeholder: 'Combine these answers into a short funny poem.'
      },
      input: {
        type: 'dataRef',
        accepts: [
          { type: 'array' },
          { type: 'object' },
          { type: 'string' }
        ],
        optional: true, label: 'Data to pass in'
      },
      task: {
        type: 'enum',
        values: ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge'],
        optional: true, label: 'Task type'
      },
      format: {
        type: 'enum', values: ['text', 'json'], default: 'text',
        label: 'Output format'
      },
      perPlayer: {
        type: 'boolean', default: false,
        label: 'Generate one item per player'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true, allowedIn: ['topLevel'] }
    },
    // Output depends on format + perPlayer
    output: { kind: 'dynamic', resolver: 'aiProcessOutput' },
    ui: {
      hostToggles: ['message'],
      playerToggles: ['message']
    }
  },

  // -------------------------------------------------------------------
  'ai-eliminate': {
    label: 'AI Judges',
    icon: '⚖️',
    description: 'AI checks each answer against a rule and eliminates rule-breakers.',
    role: 'compute',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      instruction: {
        type: 'templateString', required: true,
        label: 'Rule the AI should enforce'
      },
      input: {
        type: 'dataRef',
        accepts: [{ type: 'array', capability: 'responseArray' }],
        required: true, label: 'Responses to judge'
      },
      format: {
        type: 'enum', values: ['text', 'json'], default: 'json'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        eliminated:      { type: 'array', renderers: { list: 'responseList' } },
        eliminatedNames: { type: 'array', renderers: { list: 'responseList' } },
        remaining:       { type: 'integer' },
        reasons:         { type: 'object' },
        survivors:       { type: 'array', capability: 'candidateSource', renderers: { list: 'responseList' } }
      }
    },
    ui: {
      hostToggles: ['eliminated', 'remaining'],
      playerToggles: ['details']
    }
  },

  // -------------------------------------------------------------------
  vote: {
    label: 'Vote',
    icon: '🗳️',
    description: 'Players pick a winner from a set of choices.',
    role: 'compute',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector:voters', 'loops'],
    fields: {
      mode: {
        type: 'enum', values: ['pick-one', 'head-to-head', 'approve'], required: true,
        label: 'Voting style',
        helper: '"pick-one": everyone picks one favorite. "head-to-head": A-or-B matchups. "approve": everyone says yes or no to EVERY candidate, so several can pass at once (clauses into a constitution, class norms, budget lines); .approvedList is the list of what passed.'
      },
      passAt: {
        type: 'integer', min: 1, max: 100, optional: true,
        label: 'Percent of yes votes to pass',
        helper: 'Approve mode only. A candidate passes when more than this percent of the votes cast on it say yes (default 50, more yes than no; 100 = every vote on it said yes).'
      },
      candidates: {
        type: 'dataRef',
        // Voting can target either explicit candidate sources (e.g. eliminate
        // survivors) or raw collected responses — both produce vote-able items.
        accepts: [
          { type: 'array', capability: 'candidateSource' },
          { type: 'array', capability: 'responseArray' }
        ],
        optional: true, label: 'Choices to vote on',
        helper: 'Required unless matchupsFromPairs is set.'
      },
      matchupsFromPairs: {
        type: 'phaseRef', optional: true,
        label: 'Matchups from pairs',
        helper: 'Optional (head-to-head only). Use the pairs produced by a collect step with assign:"pairwise", one matchup per pair, comparing the two paired responses.'
      },
      excludeAuthors: {
        type: 'boolean', optional: true,
        label: 'Students cannot vote for their own answer',
        helper: 'Pick-one: each ballot leaves out the voter\'s own answer. Head-to-head: the two players who wrote a matchup do not vote on it (punchline games).'
      },
      question: {
        type: 'templateString', optional: true,
        label: 'Voting prompt'
      },
      nextByWinner: {
        type: 'object', optional: true,
        label: 'Branch by winner',
        helper: 'Choose-your-own-adventure: map an option\'s exact text to the phase the game goes to when it wins, e.g. {"Enter the cave": "cave-intro"}. Use with a fixed candidates list. A winner not in the map falls back to "next".'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        scores: {
          type: 'scoreMap', capability: 'scoreMap',
          renderers: { barChart: 'tallyBarChart', json: 'jsonPretty' }
        },
        votes:      { type: 'array', renderers: { count: 'arrayCount' } },
        // winner = the winning candidate's id (a player id when the vote
        // was over answers; the option's text for a fixed list). For a
        // screen, winnerText: the winning answer's words either way.
        winner:     { type: 'string' },
        winnerText: { type: 'string' },
        tied:       { type: 'boolean' },
        totalVotes: { type: 'integer' },
        // Approve mode (yes or no on every candidate): what passed, as
        // words for a screen (approvedList) and as entries (approved).
        approved:      { type: 'array' },
        rejected:      { type: 'array' },
        results:       { type: 'array' },
        approvedCount: { type: 'integer' },
        approvedList:  { type: 'string', capability: 'renderable' },
        rejectedList:  { type: 'string', capability: 'renderable' },
        resultsList:   { type: 'string', capability: 'renderable' },
        noCounts:      { type: 'object' }
      }
    },
    // Existing games may use {{vote.barChart}} as shorthand for
    // {{vote.scores.barChart}}. Validator allows both, emits LEGACY_TOKEN_FORM.
    aliases: {
      barChart: 'scores.barChart'
    },
    ui: {
      hostToggles: ['mode', 'counter', 'timer', 'closeButton'],
      playerToggles: ['title', 'options', 'timer', 'progress']
    }
  },

  // -------------------------------------------------------------------
  eliminate: {
    label: 'Eliminate',
    icon: '❌',
    description: 'Remove players based on scores or a custom rule.',
    role: 'compute',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      method: {
        type: 'enum', values: ['bottom-percent', 'hook'], required: true,
        label: 'Method'
      },
      percent: {
        type: 'integer', min: 1, max: 100, optional: true,
        label: 'Percent to eliminate'
      },
      hook: {
        type: 'string', optional: true,
        label: 'Hook function name'
      },
      input: {
        type: 'dataRef',
        accepts: [
          { type: 'scoreMap', capability: 'scoreMap' },
          { type: 'array' },
          { type: 'object' }
        ],
        optional: true, label: 'Scores or data to evaluate'
      },
      pause: {
        type: 'integer', min: 0, max: 60, optional: true, default: 3,
        label: 'Pause before advancing (seconds)'
      },
      // With loopBack: the rounds end early once this few players remain,
      // so the round count follows the class size (loopCount is the cap).
      untilRemaining: {
        type: 'integer', min: 1, max: 50, optional: true,
        label: 'End the rounds when this many players remain'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        eliminated:      { type: 'array' },
        eliminatedNames: { type: 'array', renderers: { list: 'responseList' } },
        remaining:       { type: 'integer' }
      }
    },    ui: {
      hostToggles: ['eliminated', 'remaining', 'continueButton'],
      playerToggles: ['details']
    }
  },

  // -------------------------------------------------------------------
  preview: {
    label: 'Teacher Preview',
    icon: '👁️',
    description: 'Teacher reviews content before sharing with the class.',
    role: 'flow',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      content: { type: 'string', optional: true, label: 'Static content to preview' },
      template: { type: 'templateString', optional: true, label: 'Template to preview' },
      showResponses: { type: 'boolean', default: false, label: 'Also show the raw player responses' }
    },
    transitions: {
      // Preview uses approveNext/rejectNext instead of (and in addition to) next.
      next: { type: 'phaseRef', optional: true },
      approveNext: { type: 'phaseRef', required: true, label: 'On approve, go to' },
      rejectNext: { type: 'phaseRef', required: true, label: 'On reject, go to' }
    },
    output: {
      kind: 'static',
      fields: {
        content:   { type: 'string', capability: 'renderable' },
        responses: { type: 'array', capability: 'responseArray', optional: true }
      }
    },    ui: {
      hostToggles: ['content', 'responses', 'approveButton', 'rejectButton'],
      playerToggles: []
    }
  },

  // -------------------------------------------------------------------
  merge: {
    label: 'Merge Answers',
    icon: '🧩',
    description: 'Group members see each other\'s answers and write one shared answer together.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      seedFrom: {
        type: 'dataRef',
        accepts: [{ type: 'array', capability: 'responseArray' }],
        required: true,
        label: 'Answers to merge',
        helper: 'Where each group\'s starting answers come from, a collect step ("solo.responses") or an earlier merge ("pairs.merged").'
      },
      instruction: {
        type: 'templateString', optional: true,
        default: 'Combine your answers into one stronger answer.',
        label: 'Merge instruction',
        helper: 'Shown above the shared text box.'
      },
      groupSize: {
        type: 'enum', values: [2, 3, 4], optional: true, default: 2,
        label: 'Group size',
        helper: '2 = pairs merge their own answers (odd class forms one group of three). 3 = trios (consulting/listening protocols; leftover of one joins a trio). 4 = pairs of pairs, requires "Answers to merge" pointing at an earlier merge step.'
      },
      agreeMode: {
        type: 'enum', values: ['both', 'any', 'timer'], optional: true, default: 'both',
        label: 'How a group submits',
        helper: '"both": every member taps Agree (editing resets agreement). "any": one member can submit for the group. "timer": only the timer or the teacher closes the step.'
      },
      groupsFrom: {
        type: 'phaseRef', optional: true,
        label: 'Groups from',
        helper: 'Optional. An earlier pairwise collect or Split into Teams step; this merge adopts exactly those pairs/groups (same partners now write together). Leave empty to build fresh groups by "Group size". Cannot combine with an explicit group size.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        merged: {
          type: 'array',
          capability: 'responseArray',
          renderers: { list: 'responseList', count: 'arrayCount', json: 'jsonPretty' }
        }
      }
    },
    ui: {
      hostToggles: ['instruction', 'counter', 'timer', 'closeButton'],
      playerToggles: ['instruction', 'seeds', 'draft', 'agreeButton', 'timer']
    }
  },

  // -------------------------------------------------------------------
  'one-voice': {
    label: 'One Voice',
    icon: '📣',
    description: 'The class counts to a target together. Anyone may say the next number, but two voices at once resets the count to zero. No winners; the class makes it or laughs and tries again.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'participantSelector', 'loops'],
    fields: {
      target: {
        type: 'integer', min: 2, max: 200, optional: true, default: 20,
        label: 'Count to',
        helper: 'The number the class is trying to reach together.'
      },
      collisionWindowMs: {
        type: 'integer', min: 100, max: 1500, optional: true, default: 400,
        label: 'Collision window (ms)',
        helper: 'Two taps inside this window count as "two voices at once" and reset the count. Lower = stricter. Below 100ms is physically unwinnable.'
      },
      mode: {
        type: 'enum', values: ['tap'], optional: true, default: 'tap',
        label: 'Mode',
        helper: 'v1 is tap mode (each successful tap is spoken aloud through the teacher\'s speakers). Voice mode is staged for a future version.'
      },
      maxAttempts: {
        type: 'integer', min: 1, max: 100, optional: true,
        label: 'Attempt cap (optional)',
        helper: 'Optional soft cap. After this many attempts the step ends with the story so far. Leave empty for unlimited, the teacher can always move on manually.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        success:  { type: 'boolean' },
        attempts: { type: 'integer' },
        resets:   { type: 'integer' },
        bestRun:  { type: 'integer' },
        target:   { type: 'integer' },
        finalCount: { type: 'integer' }
      }
    },
    ui: {
      hostToggles: ['count', 'attempt', 'bestRun', 'continueButton'],
      playerToggles: ['button', 'status']
    }
  },

  // -------------------------------------------------------------------
  buzz: {
    label: 'Buzzer Round',
    icon: '🔔',
    description: 'Teacher asks questions out loud; first player to buzz answers; teacher judges Right/Wrong on the host screen. Wrong locks that player out for the question. One step runs as many questions as the teacher wants.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', optional: true,
        label: 'On-screen prompt',
        helper: 'Shown above the buzzer, e.g. "Listen for the question!", the actual questions are usually asked aloud.',
        placeholder: 'Listen for the question, then BUZZ!'
      },
      points: {
        type: 'integer', min: 1, max: 1000, optional: true, default: 10,
        label: 'Points per correct answer'
      },
      lockoutOnWrong: {
        type: 'boolean', optional: true, default: true,
        label: 'Lock out wrong answers',
        helper: 'A wrong answer locks that player out until the next question (stops buzz-spamming).'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        scores:    { type: 'scoreMap', capability: 'scoreMap', renderers: { barChart: 'tallyBarChart' } },
        questions: { type: 'integer' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'buzzed', 'scores', 'controls'],
      playerToggles: ['prompt', 'button', 'status']
    }
  },

  // -------------------------------------------------------------------
  estimate: {
    label: 'Guess the Number',
    icon: '🎯',
    description: 'Students each guess a number; close submissions to reveal the answer, the class distribution, and closeness-ranked scores. Without an answer it becomes poll-the-room (stats only, no scores). With min and max set (or "on a scale of 1 to 10" in the question) students tap a number on that scale, or move a slider for a longer range, instead of typing.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', required: true,
        label: 'The question',
        placeholder: 'How many liters of water does a cow drink in a day?'
      },
      answer: {
        type: 'number', optional: true,
        label: 'The answer (optional)',
        helper: 'The true value. Leave empty for poll-the-room mode, no scoring, just the class distribution.'
      },
      unit: {
        type: 'string', optional: true,
        label: 'Unit (optional)',
        placeholder: 'liters'
      },
      points: {
        type: 'integer', min: 1, max: 1000, optional: true, default: 10,
        label: 'Points for the closest guess'
      },
      scoring: {
        type: 'enum', values: ['closest', 'graduated'], optional: true, default: 'closest',
        label: 'Scoring',
        helper: 'closest: the closest guess takes all the points (ties share). graduated: points fall off by closeness rank, everyone earns something.'
      },
      min: {
        type: 'number', optional: true,
        label: 'Lowest allowed guess (optional)'
      },
      max: {
        type: 'number', optional: true,
        label: 'Highest allowed guess (optional)'
      },
      image: {
        type: 'string', optional: true,
        label: 'Image (optional)',
        helper: 'Path to an uploaded image (e.g. assets/jar.jpg), perfect for "guess the jar". Stays up while students guess. Use the upload widget below.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        scores:  { type: 'scoreMap', capability: 'scoreMap', renderers: { barChart: 'tallyBarChart' } },
        average: { type: 'number' },
        median:  { type: 'number' },
        closest: { type: 'number' },
        answer:  { type: 'number' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'image', 'counter', 'timer', 'closeButton', 'results'],
      playerToggles: ['prompt', 'image', 'input', 'timer', 'submitButton']
    }
  },

  // -------------------------------------------------------------------
  match: {
    label: 'Match Pairs',
    icon: '🔗',
    description: 'Students match items from two lists (vocab ↔ definitions, quotes ↔ authors). Auto-scored, every correct pair earns points. Closing reveals which pairs the class nailed or missed.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', required: true,
        label: 'Instructions',
        placeholder: 'Match each French word to its English meaning'
      },
      pairs: {
        type: 'array', item: { type: 'object' }, required: true,
        label: 'The correct pairs',
        helper: 'Each pair is one left item and its matching right item, e.g. left "chat", right "cat". At least 2 pairs. Students see the left column fixed and drag the right column into place.'
      },
      pointsPerMatch: {
        type: 'integer', min: 1, max: 100, optional: true, default: 10,
        label: 'Points per correct match'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        scores:      { type: 'scoreMap', capability: 'scoreMap', renderers: { barChart: 'tallyBarChart' } },
        results:     { type: 'array' },
        resultsList: { type: 'string', capability: 'renderable' },
        pairCount:   { type: 'number' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'counter', 'timer', 'closeButton', 'results'],
      playerToggles: ['prompt', 'items', 'timer', 'submitButton']
    }
  },

  // -------------------------------------------------------------------
  sort: {
    label: 'Sort into Buckets',
    icon: '🗂️',
    description: 'Students place each item into a named bucket (metaphor vs simile, fact vs opinion). With correct buckets set it auto-scores; without them it becomes a consensus poll showing how the class voted.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', required: true,
        label: 'Instructions',
        placeholder: 'Is each line a metaphor or a simile?'
      },
      buckets: {
        type: 'array', item: { type: 'string' }, required: true,
        label: 'The buckets',
        helper: '2-5 category names, e.g. Metaphor, Simile. Students tap one per item.'
      },
      items: {
        type: 'array', item: { type: 'object' }, required: true,
        label: 'The items to sort',
        helper: 'Each item is a text plus (optionally) its correct bucket. Fill the correct bucket on every item for a scored round, or on none for a consensus poll.'
      },
      pointsPerItem: {
        type: 'integer', min: 1, max: 100, optional: true, default: 10,
        label: 'Points per correct placement'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        scores:      { type: 'scoreMap', capability: 'scoreMap', renderers: { barChart: 'tallyBarChart' } },
        results:     { type: 'array' },
        resultsList: { type: 'string', capability: 'renderable' },
        itemCount:   { type: 'number' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'counter', 'timer', 'closeButton', 'results'],
      playerToggles: ['prompt', 'items', 'timer', 'submitButton']
    }
  },

  // -------------------------------------------------------------------
  checklist: {
    label: 'To-Do Checklist',
    icon: '✅',
    description: 'Every group works through the same to-do list on their devices while the projector shows a live progress dashboard. Without a team step it becomes one checklist per student.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', optional: true,
        label: 'Instructions',
        placeholder: 'Work through today\'s tasks with your group.'
      },
      items: {
        type: 'array', item: { type: 'string' }, required: true,
        label: 'The to-do items',
        helper: 'The tasks every group must finish. Any group member can check an item off; the whole group sees it instantly. With "Roles from" set, an item may be {"text": "...", "role": "Recorder"} to label it as that role\'s job.'
      },
      teamsFrom: {
        type: 'phaseRef', optional: true,
        label: 'Groups from',
        helper: 'An earlier Split into Teams step, or a paired-up collect step (each pair shares a checklist labeled by their names). Leave empty for one checklist per student.'
      },
      rolesFrom: {
        type: 'phaseRef', optional: true, contexts: ['topLevel'],
        label: 'Roles from',
        helper: 'An earlier Assign Roles step. Items tagged with a role show whose job they are, and each student sees their own jobs highlighted. Anyone in the group can still check anything, the group polices itself.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        results:     { type: 'array' },
        resultsList: { type: 'string', capability: 'renderable' },
        doneCount:   { type: 'number' },
        groupCount:  { type: 'number' },
        itemCount:   { type: 'number' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'progress', 'summary', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'items', 'timer']
    }
  },

  // -------------------------------------------------------------------
  reveal: {
    label: 'Show Result',
    icon: '🎭',
    description: 'Display content to all players.',
    role: 'display',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'loops'],
    fields: {
      template: {
        type: 'templateString', optional: true,
        label: 'What to show',
        placeholder: '# The class said:\n\n{{ask.responses.list}}'
      },
      content: { type: 'string', optional: true, label: 'Static content' },
      scope: {
        type: 'enum', values: ['all', 'pair', 'own'], optional: true, default: 'all',
        label: 'Who sees what',
        helper: '"all" shows the same content to everyone. "pair" shows each pair only their own two answers (requires pairsFrom; use {{_pair.answers}}). "own" returns each rotation chain to its author, every student sees what classmates did with THEIR item (requires chainFrom).'
      },
      pairsFrom: {
        type: 'phaseRef', optional: true,
        label: 'Pairs from',
        helper: 'Required when scope:"pair". The collect step with assign:"pairwise" whose pairing and answers this reveal shows per-pair.'
      },
      chainFrom: {
        type: 'array', item: { type: 'string' }, optional: true,
        label: 'Chain steps (in order)',
        helper: 'Required when scope:"own". The rotation chain\'s collect steps in order, starting with the original (e.g. ["recall", "add-one", "add-again"]). Each later step must rotateFrom the one before it.'
      },
      chainDisplay: {
        type: 'enum', values: ['steps', 'final', 'template'], optional: true, default: 'steps',
        label: 'Chain display',
        helper: '"steps" lists every hop (chain poems, stories). "final" shows only the last version (accumulating lists where each hop already contains the earlier ones). "template" assembles the contributions into the sentence in "Chain sentence" (blind fill-a-slot chains).'
      },
      chainTemplate: {
        type: 'string', optional: true,
        label: 'Chain sentence',
        helper: 'Used with chain display "template". A sentence with numbered slots: {1} is the chain\'s first contribution, {2} the second, and so on (e.g. "The {1} {2} {3} the {4} {5}."). Empty slots show as a blank.'
      },
      chainHeading: {
        type: 'string', optional: true,
        label: 'Heading over the student\'s own item',
        helper: 'With scope "own". The line above what the student started with (default "You started with:"). For a personal payoff: "You wrote:".'
      },
      chainGrewHeading: {
        type: 'string', optional: true,
        label: 'Heading over what came back',
        helper: 'With scope "own" and chain display "final". The line above the classmate\'s reply (default "A classmate took it from there:"). For a personal payoff: "Someone wrote this for you:".'
      },
      image: {
        type: 'string', optional: true,
        label: 'Image (optional)',
        helper: 'Path to an uploaded image (e.g. assets/photo.jpg). Use the upload widget below.'
      },
      video: {
        type: 'string', optional: true,
        label: 'YouTube video (optional)',
        helper: 'Paste a YouTube link. Plays on the host/projector screen.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: { kind: 'static', fields: {} },    ui: {
      hostToggles: ['content', 'image', 'video', 'responses', 'continueButton'],
      playerToggles: ['content', 'image']
    }
  },

  // -------------------------------------------------------------------
  winner: {
    label: 'Winner',
    icon: '🏆',
    description: 'Crown the winner and show final standings.',
    role: 'display',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      from: {
        type: 'dataRef',
        accepts: [{ type: 'scoreMap', capability: 'scoreMap' }],
        required: true, label: 'Final scores'
      },
      entryFrom: {
        type: 'dataRef',
        accepts: [{ type: 'array', capability: 'responseArray' }],
        optional: true, label: 'What they won for',
        helper: 'Optional. The step whose submissions the scores judged (e.g. "ideas.responses"), the winner\'s own entry is shown with the crown. Auto-detected when the scores come from a vote over responses, so usually leave blank.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        winnerId:      { type: 'string' },
        winnerName:    { type: 'string', capability: 'renderable' },
        winnerScore:   { type: 'integer' },
        winnerIds:     { type: 'array' },
        winnerNames:   { type: 'array', renderers: { list: 'responseList' } },
        winnerEntry:   { type: 'string', capability: 'renderable' },
        winnerEntries: { type: 'array' },
        isTie:         { type: 'boolean' },
        standings:     { type: 'array', renderers: { list: 'rankingList' } }
      }
    },
    ui: {
      hostToggles: ['name', 'entry', 'standings', 'endButton'],
      playerToggles: ['name', 'entry', 'details', 'standings']
    }
  },

  // -------------------------------------------------------------------
  leaderboard: {
    label: 'Leaderboard',
    icon: '📊',
    description: 'Display scores and rankings, with each player\'s rank highlighted.',
    role: 'display',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'loops'],
    fields: {
      from: {
        type: 'dataRef',
        accepts: [
          { type: 'scoreMap', capability: 'scoreMap' },
          { type: 'array', capability: 'dataRefList' }
        ],
        required: true, label: 'Scores to display',
        helper: 'A single score source, or a list of sources to sum across (e.g. for multi-round games: ["r1.teamScores", "r2.teamScores", "r3.teamScores"]).'
      },
      style: {
        type: 'enum', values: ['full', 'top3'], default: 'full',
        label: 'Display style'
      },
      teamsFrom: {
        type: 'phaseRef', optional: true,
        label: 'Team totals from',
        helper: 'An earlier Split into Teams step. Individual scores roll up into ranked team totals; the projector leads with teams, each student still sees their own contribution. Leave empty for an individual board.'
      },
      message: {
        type: 'templateString', optional: true,
        label: 'Header message'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        standings: { type: 'array', renderers: { list: 'rankingList' } },
        style:     { type: 'string' }
      }
    },
    ui: {
      hostToggles: ['standings', 'continueButton', 'timer'],
      playerToggles: ['rank', 'standings']
    }
  },

  // -------------------------------------------------------------------
  'reveal-one': {
    label: 'Reveal One-by-One',
    icon: '🎰',
    description: 'Host reveals each item incrementally, good for top-N countdowns.',
    role: 'display',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'loops'],
    fields: {
      from: {
        type: 'dataRef',
        accepts: [
          { type: 'array', capability: 'responseArray' },
          { type: 'array', capability: 'rankingArray' }
        ],
        required: true, label: 'Items to reveal'
      },
      message: {
        type: 'templateString', optional: true,
        label: 'Header message'
      },
      itemTemplate: {
        type: 'templateString', optional: true,
        label: 'Per-item template',
        description: 'How each revealed item displays. Use {{_current.field}} to pull values from the item (e.g. "{{_current.playerName}}: {{_current.critique}}"). Without it, object items render as raw JSON.'
      },
      limit: {
        type: 'integer', min: 1, max: 100, optional: true,
        label: 'Max items (random sample)',
        description: 'Cap the reveal at a sample of the items. Leave blank when every student\'s item must appear (encouragement walls, return-to-author reveals).'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        items:    { type: 'array' },
        revealed: { type: 'integer' }
      }
    },
    ui: {
      hostToggles: ['message', 'revealButton', 'counter', 'timer'],
      playerToggles: ['message', 'items']
    }
  },

  // -------------------------------------------------------------------
  'team-split': {
    label: 'Split into Teams',
    icon: '🤝',
    description: 'Divide players into teams or groups. Sizing: a number of teams OR a group size. Assignment: random, balanced by score, teacher arranges on the host screen, or students pick their own spots.',
    role: 'compute',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'participantSelector', 'loops'],
    fields: {
      method: {
        type: 'enum', values: ['random', 'balanced', 'teacher', 'choice'], required: true,
        label: 'How teams are made',
        helper: 'random/balanced assign instantly. "teacher" shows a roster on the host screen for you to arrange. "choice" lets students tap the group they want (open spots only; stragglers auto-filled when you confirm).'
      },
      capacity: {
        type: 'enum', values: ['even', 'open'], optional: true, default: 'even',
        label: 'Team spots',
        helper: '"even" caps every team at an even split so a free pick stays fair. "open" removes the caps, use with "choice" when the class already has real teams and students should join their own (uneven sizes and absences are fine).'
      },
      teamCount: {
        type: 'integer', min: 2, max: 20, optional: true,
        label: 'Number of teams',
        helper: 'Set this OR "Group size", not both.'
      },
      groupSize: {
        type: 'integer', min: 2, max: 12, optional: true,
        label: 'Group size',
        helper: 'e.g. 4 = groups of four (a 22-kid class makes 4,4,4,4,3,3). Set this OR "Number of teams", not both.'
      },
      teamNames: {
        type: 'array', item: { type: 'string' }, optional: true,
        label: 'Team names'
      },
      balanceFrom: {
        type: 'dataRef',
        accepts: [{ type: 'scoreMap', capability: 'scoreMap' }],
        optional: true, label: 'Scores to balance against'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        teams:      { type: 'array', capability: 'teamArray' },
        playerTeam: { type: 'object' }
      }
    },    ui: {
      hostToggles: ['teams', 'continueButton'],
      playerToggles: ['team', 'allTeams']
    }
  },

  // -------------------------------------------------------------------
  'team-roles': {
    label: 'Assign Roles',
    icon: '🎩',
    description: 'Give every member of an existing group a job (Facilitator, Recorder, Timekeeper, ...). Random assignment, or students pick their own role, one of each per group until the group is bigger than the role list. Reference a student\'s role later with {{stepId.mine}}.',
    role: 'compute',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'participantSelector', 'loops'],
    fields: {
      teamsFrom: {
        type: 'phaseRef', required: true, contexts: ['topLevel'],
        label: 'Groups from',
        helper: 'The earlier Split into Teams step (or paired-up collect step) whose groups get the roles.'
      },
      roles: {
        type: 'array', item: { type: 'string' }, required: true,
        label: 'The roles',
        helper: '2-8 job names, e.g. Facilitator, Recorder, Timekeeper. Groups bigger than the list repeat roles as evenly as possible; smaller groups fill the first roles.'
      },
      method: {
        type: 'enum', values: ['random', 'choice'], optional: true, default: 'random',
        label: 'How roles are given',
        helper: '"random" deals them instantly. "choice" lets students tap the role they want (open roles only, re-pick allowed); stragglers are auto-filled when you continue.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        playerRole:  { type: 'object' },
        byPlayer:    { type: 'object' },
        roleMembers: { type: 'object' },
        rolesList:   { type: 'string', capability: 'renderable' },
        roles:       { type: 'array' }
      }
    },
    ui: {
      hostToggles: ['roles', 'continueButton'],
      playerToggles: ['role', 'picker']
    }
  },

  // -------------------------------------------------------------------
  rank: {
    label: 'Rank Choices',
    icon: '🔢',
    description: 'Players drag a list into preferred order. Aggregated by average position.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', required: true,
        label: 'Ranking prompt'
      },
      candidates: {
        type: 'dataRef',
        // Same as vote: rank either explicit candidates or raw collected
        // responses (e.g. rank everyone's submitted destinations).
        accepts: [
          { type: 'array', capability: 'candidateSource' },
          { type: 'array', capability: 'responseArray' }
        ],
        required: true, label: 'Items to rank',
        helper: 'Either a reference to an earlier step (e.g. "ask.responses") OR a fixed list you write yourself, a JSON array of strings like ["Pizza", "Tacos", "Sushi"] (at least 2 items).'
      },
      teamsFrom: {
        type: 'phaseRef', optional: true, contexts: ['topLevel'],
        label: 'Rank as groups',
        helper: 'An earlier Split into Teams step (or paired-up collect step). Every student still ranks on their own screen; each group\'s order is its members\' average, stored per group beside the class order. Pair it with a Hand out choices step to give every group one of the items.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        rankings:   { type: 'array', capability: 'rankingArray', renderers: { list: 'rankingList' } },
        rankedList: { type: 'string', capability: 'renderable' },
        responses:  { type: 'object' },
        candidates: { type: 'array' },
        byGroup:    { type: 'object' },
        groupRankedList: { type: 'string', capability: 'renderable' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'counter', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'items', 'timer', 'submitButton']
    }
  },

  // -------------------------------------------------------------------
  assign: {
    label: 'Hand Out Choices',
    icon: '🎟️',
    description: 'After a Rank a list step, give every group (or every student, when the rank step has no groups) ONE of the ranked items: first choices first, the spots per item spread as evenly as they can, so a contested favorite goes to some and the rest get their second choice. Reference a student\'s choice later with {{stepId.mine}}.',
    role: 'compute',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      from: {
        type: 'phaseRef', required: true, contexts: ['topLevel'],
        label: 'Choices ranked in',
        helper: 'The earlier Rank a list step. With "Rank as groups" set on it, each group gets one item; otherwise each student does.'
      },
      perChoice: {
        type: 'integer', min: 1, max: 50, optional: true,
        label: 'Spots per item',
        helper: 'How many groups (or students) may land on the same item. Leave empty for an even spread: the items fill as evenly as they can. Too few spots for everyone still hands everyone something.'
      },
      message: {
        type: 'templateString', optional: true,
        label: 'Projector line',
        helper: 'A line above the hand-out on the projector, e.g. "Here is who got what."'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        assignments:  { type: 'object' },
        byPlayer:     { type: 'object' },
        byChoice:     { type: 'object' },
        choiceRank:   { type: 'object' },
        assignedList: { type: 'string', capability: 'renderable' },
        choices:      { type: 'array' }
      }
    },
    ui: {
      hostToggles: ['board', 'continueButton'],
      playerToggles: ['choice']
    }
  },

  // -------------------------------------------------------------------
  wager: {
    label: 'Place a Bet',
    icon: '💰',
    description: 'Players bet points on which option will be correct.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'loops'],
    fields: {
      prompt: { type: 'templateString', required: true, label: 'Wager prompt' },
      options: {
        type: 'oneOf',
        options: [
          { type: 'array', item: { type: 'string' } },
          { type: 'dataRef', accepts: [{ type: 'array' }] }
        ],
        required: true, label: 'Options to bet on'
      },
      correctOption: {
        type: 'string', optional: true,
        label: 'Correct answer'
      },
      scoresFrom: {
        type: 'dataRef',
        accepts: [{ type: 'scoreMap', capability: 'scoreMap' }],
        optional: true, label: 'Players\' available points'
      },
      minBet: {
        type: 'integer', min: 0, optional: true, default: 1,
        label: 'Minimum bet'
      },
      maxBetPercent: {
        type: 'integer', min: 1, max: 100, optional: true, default: 100,
        label: 'Max bet (% of available)'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        wagers:   { type: 'object' },
        scores:   { type: 'scoreMap', capability: 'scoreMap', renderers: { barChart: 'tallyBarChart' } },
        resolved: { type: 'string' }
      }
    },    ui: {
      hostToggles: ['prompt', 'options', 'counter', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'options', 'points', 'timer', 'submitButton']
    }
  },

  // -------------------------------------------------------------------
  turn: {
    label: 'Describe & Guess',
    icon: '🎭',
    description: 'Charades-style turn. One describer at a time draws items from a shared pool while their team guesses. Per-turn timer rotates teams.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      pool: {
        type: 'dataRef',
        accepts: [
          { type: 'array', capability: 'responseArray' },
          { type: 'array', capability: 'dataRefList' },
          { type: 'array' }
        ],
        required: true,
        label: 'Items to describe',
        helper: 'The pool of phrases to draw from. Single ref ("phrases.responses") or a list of refs to concatenate (["phrases1.responses", "phrases2.responses", "phrases3.responses"]).'
      },
      teamsFrom: {
        type: 'phaseRef', required: true,
        label: 'Teams from',
        helper: 'The step that split players into teams. Each team rotates through describers.'
      },
      timer: {
        type: 'integer', min: 5, max: 600, optional: true, default: 60,
        label: 'Seconds per describer turn'
      },
      allowSkip: {
        type: 'boolean', optional: true, default: true,
        label: 'Describer can skip an item',
        helper: 'When true, the describer can pass on an item without scoring; it returns to the bottom of the pool.'
      },
      instruction: {
        type: 'templateString', optional: true,
        label: 'Rule for this round',
        helper: 'Shown to the describer. Examples: "Describe without saying the word", "Act it out, no words", "Say ONE word".'
      },
      poolLimit: {
        type: 'integer', min: 2, max: 200, optional: true,
        label: 'Max phrases in the bowl (random draw)',
        helper: 'Phrases scale with class size, 3 per student is a 75-phrase bowl at 25 kids (~35 min of turns). Cap the draw here. The drawn set is stored as this step\'s ".pool", so point later rounds\' pool at it (e.g. "round1.pool") to keep Fishbowl\'s same-phrases-every-round mechanic.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        teamScores: { type: 'scoreMap', capability: 'scoreMap', renderers: { json: 'jsonPretty' } },
        capturedBy: { type: 'object' },
        itemCount:  { type: 'integer' },
        pool:       { type: 'array', optional: true }
      }
    },
    ui: {
      hostToggles: ['item', 'currentTeam', 'describer', 'scores', 'timer'],
      playerToggles: ['item', 'instruction', 'gotItButton', 'skipButton', 'timer']
    }
  },

  // -------------------------------------------------------------------
  relay: {
    label: 'Take Turns',
    icon: '🔄',
    description: 'Players take turns adding to a shared response.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', required: true,
        label: 'What to write'
      },
      order: {
        type: 'enum', values: ['random', 'join-order'], default: 'random',
        label: 'Turn order'
      },
      turns: {
        type: 'integer', min: 1, max: 100, optional: true,
        label: 'Total turns'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        result: { type: 'array', renderers: { list: 'responseList' } },
        text:   { type: 'string', capability: 'renderable' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'progress', 'sharedResult', 'timer', 'activePlayer'],
      playerToggles: ['prompt', 'sharedResult', 'input', 'timer']
    }
  },

  // -------------------------------------------------------------------
  rate: {
    label: 'Rate on Scales',
    icon: '📏',
    description: 'Class rates something (a presentation, an idea, a pitch) on one or more custom scales. Teacher chooses whether everyone or only the teacher sees the results.',
    role: 'input',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'timer', 'participantSelector', 'loops'],
    fields: {
      prompt: {
        type: 'templateString', optional: true,
        label: 'Instructions to raters',
        helper: 'Optional. The teacher can also explain verbally what is being rated.',
        placeholder: 'Rate Maria\'s pitch on each scale below.'
      },
      scales: {
        type: 'array',
        item: { type: 'object' },
        required: true,
        label: 'Scales',
        helper: 'Each scale needs an id, label, min, max, and optional end labels.'
      },
      visibility: {
        type: 'enum', values: ['all', 'host-only'], default: 'all',
        label: 'Who sees the results',
        helper: '"all" reveals averages to the whole class. "host-only" keeps them on the teacher screen.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        averages:    { type: 'scoreMap', capability: 'scoreMap', renderers: { barChart: 'tallyBarChart' } },
        distributions: { type: 'object' },
        byPlayer:    { type: 'object' },
        byScale:     { type: 'object' },
        scales:      { type: 'array' }
      }
    },    ui: {
      hostToggles: ['prompt', 'counter', 'timer', 'closeButton', 'results'],
      playerToggles: ['prompt', 'scales', 'timer', 'submitButton', 'results']
    }
  },

  // -------------------------------------------------------------------
  foreach: {
    label: 'For Each',
    icon: '🔁',
    description: 'Repeat a small set of steps once per item.',
    role: 'flow',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'loops'],
    fields: {
      data: {
        type: 'dataRef',
        accepts: [{ type: 'array' }],
        required: true, label: 'Items to iterate over'
      },
      subPhases: {
        type: 'object', required: true,
        label: 'Steps to repeat per item'
      },
      candidateSource: {
        type: 'enum', values: ['players'], optional: true,
        label: 'Auto-generate candidates from'
      },
      decoyCount: {
        type: 'integer', min: 0, max: 10, optional: true,
        label: 'Decoy candidates per iteration'
      },
      scoring: {
        type: 'object', optional: true,
        label: 'Scoring configuration'
      },
      aiInject: {
        type: 'object', optional: true,
        label: 'AI-injected items'
      },
      pairMode: {
        type: 'enum', values: ['human-vs-ai'], optional: true,
        label: 'Pair mode'
      },
      shuffle: {
        type: 'boolean', default: true, optional: true,
        label: 'Shuffle iteration order'
      },
      limit: {
        type: 'integer', min: 1, max: 100, optional: true,
        label: 'Max rounds (random sample)',
        description: 'Cap how many items actually run, a round per response drags past ~12 in a full class. Leave blank to run every item.'
      },
      selfExclude: {
        type: 'boolean', default: true, optional: true,
        label: 'Sit out your own round',
        helper: 'On collect and collect-choice steps inside the rounds: the student whose item is up sits that round out, and so does the classmate whose item it was made from (a rotated phrase that got drawn). Both already know the answer.'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        scores:    { type: 'scoreMap', capability: 'scoreMap', optional: true },
        itemCount: { type: 'integer', optional: true },
        // The items the `limit` sample left out, in the data's own shape
        // (collect responses keep their drawings): feed a reveal-one to
        // show what never got a round.
        skipped:   { type: 'array', capability: 'responseArray', optional: true }
      }
    },    ui: {
      hostToggles: [],
      playerToggles: []
    }
  }
};

// =======================================================================
// Helpers — what consumers (validator, editor, AI prompt) call.
// =======================================================================

/**
 * Returns the full field map for a phase type, including mixin-introduced
 * fields. Handles `participantSelector:aliasName` mixin specifiers.
 *
 * @param {string} phaseType
 * @param {{ context?: 'topLevel'|'foreach' }} [opts]
 * @returns {Object} { fieldName: fieldDef }
 */
export function getFields(phaseType, opts = {}) {
  const schema = PHASE_SCHEMAS[phaseType];
  if (!schema) return {};

  const context = opts.context || 'topLevel';
  if (!schema.allowedIn.includes(context)) return {};

  // Per-field context restriction: a field with `contexts: ['topLevel']`
  // doesn't exist inside foreach sub-phases (rotation/pairing fields).
  let fields = {};
  for (const [fname, fdef] of Object.entries(schema.fields || {})) {
    if (fdef.contexts && !fdef.contexts.includes(context)) continue;
    fields[fname] = fdef;
  }

  for (const mixinSpec of (schema.mixins || [])) {
    const [mixinName, alias] = mixinSpec.split(':');
    const mixin = MIXINS[mixinName];
    if (!mixin || !mixin.fields) continue;
    // Skip mixin if it doesn't apply in this context (e.g. screenControl
    // doesn't apply to foreach sub-phases)
    if (mixin.contexts && !mixin.contexts.includes(context)) continue;
    for (const [fname, fdef] of Object.entries(mixin.fields)) {
      // Apply alias rename if specified (e.g. participantSelector:voters
      // renames `from` to `voters`)
      const targetName = (alias && fname === 'from') ? alias : fname;
      fields[targetName] = fdef;
    }
  }

  return fields;
}

/**
 * Returns the full transitions map for a phase type, including mixin-
 * introduced transitions (e.g. loopBack/loopCount from the loops mixin).
 *
 * @param {string} phaseType
 * @returns {Object} { transitionFieldName: transitionDef }
 */
export function getTransitions(phaseType) {
  const schema = PHASE_SCHEMAS[phaseType];
  if (!schema) return {};

  let transitions = { ...(schema.transitions || {}) };

  for (const mixinSpec of (schema.mixins || [])) {
    const [mixinName] = mixinSpec.split(':');
    const mixin = MIXINS[mixinName];
    if (!mixin || !mixin.transitions) continue;
    Object.assign(transitions, mixin.transitions);
  }

  return transitions;
}

/**
 * The full set of field names allowed on a phase config (for the
 * unknown-field allow-list check). Includes:
 *   - `type` (always)
 *   - all schema fields + mixin fields
 *   - all transition keys (next, loopBack, loopCount, approveNext, rejectNext)
 *
 * Drop-in replacement for game-loader.js's getAllowedFields().
 *
 * @param {string} phaseType
 * @param {{ subPhase?: boolean }} [opts] — kept for API compat with game-loader
 * @returns {Set<string>}
 */
export function getAllowedFieldNames(phaseType, opts = {}) {
  const context = opts.subPhase ? 'foreach' : 'topLevel';
  const schema = PHASE_SCHEMAS[phaseType];
  if (!schema || !schema.allowedIn.includes(context)) return new Set();

  const names = new Set(['type']);
  for (const k of Object.keys(getFields(phaseType, { context }))) names.add(k);
  if (context === 'topLevel') {
    for (const k of Object.keys(getTransitions(phaseType))) names.add(k);
  }
  return names;
}

/**
 * Field names that exist on a phase type at top level but NOT inside
 * foreach sub-phases (fields with `contexts: ['topLevel']`). Used by the
 * validator and the editor to explain "known field, wrong place" instead
 * of a generic unknown-field error. Empty array for types not allowed in
 * foreach at all.
 */
export function getTopLevelOnlyFieldNames(phaseType) {
  const schema = PHASE_SCHEMAS[phaseType];
  if (!schema || !schema.allowedIn.includes('foreach')) return [];
  const topFields = getFields(phaseType, { context: 'topLevel' });
  const subFields = getFields(phaseType, { context: 'foreach' });
  return Object.keys(topFields).filter(f => !(f in subFields));
}

/**
 * Returns the toggle vocabulary for hostShow on a given phase type.
 */
export function getHostToggles(phaseType) {
  return PHASE_SCHEMAS[phaseType]?.ui?.hostToggles || [];
}

/**
 * Returns the toggle vocabulary for playerShow on a given phase type.
 */
export function getPlayerToggles(phaseType) {
  return PHASE_SCHEMAS[phaseType]?.ui?.playerToggles || [];
}

/**
 * Returns the alias map for a phase type, or {} if none.
 * The normalizer uses this to rewrite legacy tokens (e.g.
 * {{vote.barChart}} → {{vote.scores.barChart}}).
 */
export function getAliases(phaseType) {
  return PHASE_SCHEMAS[phaseType]?.aliases || {};
}

