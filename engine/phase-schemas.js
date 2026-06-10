/**
 * STUB rev. 2 — Shared phase schema, declarative-only.
 *
 * Implements the rev. 2 architectural principles from
 * docs/PHASE-SCHEMA-SPEC.md §2:
 *
 *   1. Schema is declarative data only. Behavior (renderers, validate
 *      hooks, dynamic-output resolvers) is referenced by name and
 *      resolved through registries in:
 *        - engine/renderers.js          RENDERER_REGISTRY
 *        - engine/phase-schema-runtime.js  VALIDATOR_HOOKS, DYNAMIC_OUTPUT_RESOLVERS
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
      playerTemplate: { type: 'templateString', optional: true, label: 'Custom player text' }
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
        placeholder: 'Round 1 — get ready!'
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
      fields: {
        type: 'array', item: { type: 'string' }, optional: true,
        label: 'Multi-field response',
        helper: 'Optional. List of field names if students should fill in more than one box.'
      },
      rotateFrom: {
        type: 'phaseRef', optional: true,
        label: 'Rotate items from',
        helper: 'Optional. Each player receives a different player\'s item from the named step. Use {{stepId.assigned}} in the prompt to show it.'
      },
      rotateOffset: {
        type: 'integer', min: 1, max: 100, optional: true, default: 1,
        label: 'Rotation offset',
        helper: 'How many positions to shift. Default 1 = each player gets the previous player\'s item.'
      },
      assign: {
        type: 'enum', values: ['pairwise'], optional: true,
        label: 'Pair players up',
        helper: 'Set to "pairwise" to split players into pairs of 2. With "Pair items from" set, each pair shares one prompt drawn from that step ({{sourceId.assigned}} shows it); without it, every pair gets this step\'s own prompt.'
      },
      pairsFrom: {
        type: 'phaseRef', optional: true,
        label: 'Pair items from',
        helper: 'Optional with assign:"pairwise". The step whose responses provide the per-pair prompts (one prompt per pair, drawn from sourceId.responses). Leave empty to give every pair this step\'s own prompt.'
      },
      oddHandling: {
        type: 'enum', values: ['sit-out', 'triple'], optional: true, default: 'sit-out',
        label: 'Odd player count',
        helper: '"sit-out" (default): the leftover player waits this round. "triple": the last three players form one group of three — use for connection games where nobody should sit out. Avoid "triple" when a later vote uses matchupsFromPairs (head-to-head needs exactly 2).'
      },
      rotatePairsFrom: {
        type: 'phaseRef', optional: true,
        label: 'New partners (avoid repeats from)',
        helper: 'Optional with assign:"pairwise". Names an earlier pairwise step; this step builds a NEW pairing that avoids re-matching partners from that step (greedy, best-effort).'
      },
      reusePairsFrom: {
        type: 'phaseRef', optional: true,
        label: 'Same partners as',
        helper: 'Optional with assign:"pairwise". Names an earlier pairwise step; this step keeps exactly the same pairs/groups (same partner, next prompt).'
      },
      passAllowed: {
        type: 'boolean', optional: true,
        label: 'Allow passing',
        helper: 'Adds a Pass button. A pass counts the same as a submission (the step can close), is excluded from results and AI input, and is never shown to the class.'
      },
      simultaneousReveal: {
        type: 'boolean', optional: true,
        label: 'Reveal all at once',
        helper: 'Hide who has answered until the step closes — the projected counter shows numbers only, no names. The host moderation panel still sees submissions live.'
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
      shuffle: {
        type: 'boolean', optional: true,
        label: 'Shuffle choices per player',
        helper: 'When true, each player sees a different randomization of the choices.'
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
        type: 'enum', values: ['pick-one', 'head-to-head'], required: true,
        label: 'Voting style'
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
        helper: 'Optional (head-to-head only). Use the pairs produced by a collect step with assign:"pairwise" — one matchup per pair, comparing the two paired responses.'
      },
      excludeAuthors: {
        type: 'boolean', optional: true,
        label: 'Authors do not vote on their own matchup',
        helper: 'Per matchup, the two players who wrote the candidates are excluded from voting on it (used in head-to-head punchline games).'
      },
      question: {
        type: 'templateString', optional: true,
        label: 'Voting prompt'
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
        winner:     { type: 'string' },
        tied:       { type: 'boolean' },
        totalVotes: { type: 'integer' }
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
    },
    validate: 'eliminateMethodFields',
    ui: {
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
    },
    validate: 'previewContentOrTemplate',
    ui: {
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
        helper: 'Where each group\'s starting answers come from — a collect step ("solo.responses") or an earlier merge ("pairs.merged").'
      },
      instruction: {
        type: 'templateString', optional: true,
        default: 'Combine your answers into one stronger answer.',
        label: 'Merge instruction',
        helper: 'Shown above the shared text box.'
      },
      groupSize: {
        type: 'enum', values: [2, 4], optional: true, default: 2,
        label: 'Group size',
        helper: '2 = pairs merge their own answers (odd class forms one group of three). 4 = pairs of pairs — requires "Answers to merge" pointing at an earlier merge step.'
      },
      agreeMode: {
        type: 'enum', values: ['both', 'any', 'timer'], optional: true, default: 'both',
        label: 'How a group submits',
        helper: '"both": every member taps Agree (editing resets agreement). "any": one member can submit for the group. "timer": only the timer or the teacher closes the step.'
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
    description: 'The class counts to a target together. Anyone may say the next number — but two voices at once resets the count to zero. No winners; the class makes it or laughs and tries again.',
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
        helper: 'Optional soft cap. After this many attempts the step ends with the story so far. Leave empty for unlimited — the teacher can always move on manually.'
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
        type: 'enum', values: ['all', 'pair'], optional: true, default: 'all',
        label: 'Who sees what',
        helper: '"all" shows the same content to everyone. "pair" shows each pair only their own two answers (requires pairsFrom pointing at a collect step with assign:"pairwise"). Use {{_pair.answers}} in the template.'
      },
      pairsFrom: {
        type: 'phaseRef', optional: true,
        label: 'Pairs from',
        helper: 'Required when scope:"pair". The collect step with assign:"pairwise" whose pairing and answers this reveal shows per-pair.'
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
    output: { kind: 'static', fields: {} },
    validate: 'revealContentOrTemplate',
    ui: {
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
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        winnerId:    { type: 'string' },
        winnerName:  { type: 'string', capability: 'renderable' },
        winnerScore: { type: 'integer' },
        winnerIds:   { type: 'array' },
        winnerNames: { type: 'array', renderers: { list: 'responseList' } },
        isTie:       { type: 'boolean' },
        standings:   { type: 'array', renderers: { list: 'rankingList' } }
      }
    },
    ui: {
      hostToggles: ['name', 'standings', 'endButton'],
      playerToggles: ['name', 'details', 'standings']
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
    description: 'Host reveals each item incrementally — good for top-N countdowns.',
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
    description: 'Divide players into teams (random or balanced by score).',
    role: 'compute',
    allowedIn: ['topLevel'],
    mixins: ['screenControl', 'participantSelector', 'loops'],
    fields: {
      method: {
        type: 'enum', values: ['random', 'balanced'], required: true,
        label: 'Method'
      },
      teamCount: {
        type: 'integer', min: 2, max: 20, required: true,
        label: 'Number of teams'
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
    },
    validate: 'teamSplitBalancedNeedsScores',
    ui: {
      hostToggles: ['teams', 'continueButton'],
      playerToggles: ['team', 'allTeams']
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
        helper: 'Either a reference to an earlier step (e.g. "ask.responses") OR a fixed list you write yourself — a JSON array of strings like ["Pizza", "Tacos", "Sushi"] (at least 2 items).'
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
        responses:  { type: 'object' }
      }
    },
    ui: {
      hostToggles: ['prompt', 'counter', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'items', 'timer', 'submitButton']
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
    },
    validate: 'wagerNoResolutionBasis',
    ui: {
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
        itemCount:  { type: 'integer' }
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
    },
    validate: 'rateScalesValid',
    ui: {
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
      selfExclude: {
        type: 'boolean', default: true, optional: true,
        label: 'Skip the author on collect-choice sub-phases'
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: {
      kind: 'static',
      fields: {
        scores:    { type: 'scoreMap', capability: 'scoreMap', optional: true },
        itemCount: { type: 'integer', optional: true }
      }
    },
    validate: 'foreachScoringValid',
    ui: {
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

  let fields = { ...(schema.fields || {}) };

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
 * Returns the list of phase types that can appear inside a foreach.
 */
export function getSubPhaseTypes() {
  return Object.entries(PHASE_SCHEMAS)
    .filter(([, s]) => s.allowedIn.includes('foreach'))
    .map(([t]) => t);
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

/**
 * Type-compat check: does an output's `capability` satisfy a field's
 * `accepts: [{type, capability?}, ...]`?
 *
 * Used by typed-dataflow validation (Phase E in the migration plan).
 *
 * @param {{ type: string, capability?: string }} produced
 * @param {Array<{ type: string, capability?: string }>} accepts
 * @returns {boolean}
 */
export function isCompatible(produced, accepts) {
  if (!accepts || accepts.length === 0) return true;
  return accepts.some(spec => {
    if (spec.type !== produced.type) return false;
    if (!spec.capability) return true; // no capability requirement
    return spec.capability === produced.capability;
  });
}
