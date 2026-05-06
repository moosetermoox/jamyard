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
      hostToggles: ['message', 'continueButton', 'timer'],
      playerToggles: ['message', 'timer']
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
      }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true, allowedIn: ['topLevel'] }
    },
    // Output shape varies (multi-field adds .fields per response)
    output: { kind: 'dynamic', resolver: 'collectOutput' },
    ui: {
      hostToggles: ['prompt', 'counter', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'input', 'timer', 'submitButton']
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
        type: 'array', item: { type: 'string' }, required: true,
        label: 'Answer choices'
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
        }
      }
    },
    // Note: bare {{X.barChart}} on collect-choice is the documented
    // shorthand for {{X.tally.barChart}} (the engine's resolver pulls
    // X.tally automatically). Not a legacy form — no alias needed.
    ui: {
      hostToggles: ['prompt', 'counter', 'timer', 'closeButton'],
      playerToggles: ['prompt', 'choices', 'timer']
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
        required: true, label: 'Choices to vote on'
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
      content: { type: 'string', optional: true, label: 'Static content' }
    },
    transitions: {
      next: { type: 'phaseRef', optional: true }
    },
    output: { kind: 'static', fields: {} },
    validate: 'revealContentOrTemplate',
    ui: {
      hostToggles: ['content', 'responses', 'continueButton'],
      playerToggles: ['content']
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
        accepts: [{ type: 'scoreMap', capability: 'scoreMap' }],
        required: true, label: 'Scores to display'
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
        required: true, label: 'Items to rank'
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
