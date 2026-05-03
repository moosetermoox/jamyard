import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, '..', 'games');

const VALID_PHASE_TYPES = [
  'lobby', 'collect', 'collect-choice', 'ai-process', 'vote', 'eliminate',
  'ai-eliminate', 'announce', 'reveal', 'preview', 'winner', 'leaderboard',
  'reveal-one', 'team-split', 'rank', 'wager', 'relay', 'foreach', 'end'
];

const PHASE_REQUIRED_FIELDS = {
  collect: ['prompt'],
  'collect-choice': ['prompt', 'choices'],
  'ai-process': ['instruction'],
  'ai-eliminate': ['instruction', 'input'],
  vote: ['mode', 'candidates'],
  eliminate: ['method'],
  announce: ['message'],
  preview: ['approveNext', 'rejectNext'],
  winner: ['from'],
  leaderboard: ['from'],
  'reveal-one': ['from'],
  'team-split': ['method', 'teamCount'],
  rank: ['prompt', 'candidates'],
  wager: ['prompt', 'options'],
  relay: ['prompt'],
  foreach: ['data', 'subPhases']
};

// Fields legal on ANY phase type (the engine reads these regardless of type).
const UNIVERSAL_FIELDS = [
  'type', 'next',
  'loopBack', 'loopCount',
  'hostShow', 'playerShow', 'hostTemplate', 'playerTemplate'
];

// Optional fields per phase type. Combined with PHASE_REQUIRED_FIELDS and
// UNIVERSAL_FIELDS, this is the complete allow-list. Anything else is a hard
// error — prevents the AI generator from inventing fields the engine ignores.
const PHASE_OPTIONAL_FIELDS = {
  lobby: ['minPlayers'],
  end: ['message'],
  collect: ['timer', 'from', 'fields'],
  'collect-choice': ['timer', 'from'],
  'ai-process': ['input', 'task', 'format', 'perPlayer'],
  'ai-eliminate': ['format'],
  vote: ['voters', 'timer', 'question'],
  eliminate: ['percent', 'hook', 'input', 'pause'],
  announce: ['timer'],
  reveal: ['template', 'content', 'timer'],
  preview: ['content', 'template', 'showResponses'],
  winner: [],
  leaderboard: ['style', 'timer', 'message'],
  'reveal-one': ['message', 'timer'],
  'team-split': ['teamNames', 'from', 'balanceFrom'],
  rank: ['timer', 'from'],
  wager: ['timer', 'correctOption', 'scoresFrom', 'minBet', 'maxBetPercent'],
  relay: ['timer', 'order', 'from', 'turns'],
  foreach: ['candidateSource', 'decoyCount', 'scoring', 'aiInject', 'pairMode', 'shuffle', 'selfExclude']
};

// Sub-phases inside foreach auto-chain — no "next" field. Otherwise same allow-list.
const SUBPHASE_OPTIONAL_FIELDS = {
  announce: ['timer'],
  collect: ['timer', 'from', 'fields'],
  'collect-choice': ['timer', 'from'],
  'ai-process': ['input', 'task', 'format', 'perPlayer']
};
const VALID_SUBPHASE_TYPES = ['announce', 'collect', 'collect-choice', 'ai-process'];

const ENUM_VALUES = {
  from: ['all', 'remaining', 'eliminated'],
  voters: ['all', 'remaining', 'eliminated'],
  mode: ['pick-one', 'head-to-head'],
  method: ['bottom-percent', 'hook'],
  format: ['text', 'json'],
  task: ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge'],
  style: ['full', 'top3'],
  order: ['random', 'join-order']
};

// Fields that hold data references (phaseId.field format)
const DATA_REF_FIELDS = ['input', 'candidates', 'content', 'scoresFrom', 'balanceFrom'];

// Valid toggles per phase type for hostShow/playerShow
const VALID_HOST_TOGGLES = {
  collect: ['prompt', 'counter', 'timer', 'closeButton'],
  'collect-choice': ['prompt', 'counter', 'timer', 'closeButton'],
  'ai-process': ['message'],
  vote: ['mode', 'counter', 'timer', 'closeButton'],
  eliminate: ['eliminated', 'remaining', 'continueButton'],
  'ai-eliminate': ['eliminated', 'remaining'],
  reveal: ['content', 'responses', 'continueButton'],
  preview: ['content', 'responses', 'approveButton', 'rejectButton'],
  announce: ['message', 'continueButton', 'timer'],
  winner: ['name', 'standings', 'endButton'],
  leaderboard: ['standings', 'continueButton', 'timer'],
  'reveal-one': ['message', 'revealButton', 'counter', 'timer'],
  'team-split': ['teams', 'continueButton'],
  rank: ['prompt', 'counter', 'timer', 'closeButton'],
  wager: ['prompt', 'options', 'counter', 'timer', 'closeButton'],
  relay: ['prompt', 'progress', 'sharedResult', 'timer', 'activePlayer'],
  foreach: [],
  end: ['message', 'playAgainButton']
};

const VALID_PLAYER_TOGGLES = {
  collect: ['prompt', 'input', 'timer', 'submitButton'],
  'collect-choice': ['prompt', 'choices', 'timer'],
  'ai-process': ['message'],
  vote: ['title', 'options', 'timer', 'progress'],
  eliminate: ['details'],
  'ai-eliminate': ['details'],
  reveal: ['content'],
  announce: ['message', 'timer'],
  winner: ['name', 'details', 'standings'],
  leaderboard: ['rank', 'standings'],
  'reveal-one': ['message', 'items'],
  'team-split': ['team', 'allTeams'],
  rank: ['prompt', 'items', 'timer', 'submitButton'],
  wager: ['prompt', 'options', 'points', 'timer', 'submitButton'],
  relay: ['prompt', 'sharedResult', 'input', 'timer'],
  foreach: [],
  end: ['message']
};

/**
 * Returns the set of fields legal on a phase of the given type.
 * Used by the AI generator to strip invented fields before validation.
 * @param {string} phaseType
 * @param {{ subPhase?: boolean }} [opts]
 * @returns {Set<string>} set of allowed field names (or empty set if type unknown)
 */
export function getAllowedFields(phaseType, opts) {
  const isSub = opts && opts.subPhase;
  if (isSub) {
    if (!VALID_SUBPHASE_TYPES.includes(phaseType)) return new Set();
    return new Set([
      'type',
      ...(PHASE_REQUIRED_FIELDS[phaseType] || []),
      ...(SUBPHASE_OPTIONAL_FIELDS[phaseType] || [])
    ]);
  }
  if (!VALID_PHASE_TYPES.includes(phaseType)) return new Set();
  const fields = new Set([
    ...UNIVERSAL_FIELDS,
    ...(PHASE_REQUIRED_FIELDS[phaseType] || []),
    ...(PHASE_OPTIONAL_FIELDS[phaseType] || [])
  ]);
  if (phaseType === 'foreach') fields.add('subPhases');
  return fields;
}

export async function loadGame(gameId) {
  const configPath = join(GAMES_DIR, gameId, 'config.json');

  let raw;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch (err) {
    throw new Error(`Game not found: no config.json at games/${gameId}/config.json`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in games/${gameId}/config.json: ${err.message}`);
  }

  validate(config, gameId);

  return config;
}

export function validate(config, gameId, options) {
  const returnResults = options && options.returnResults;
  const errors = [];
  const warnings = [];

  if (!config.name) {
    errors.push(`Game "${gameId}" is missing required field: name`);
  }

  if (!config.phases || typeof config.phases !== 'object') {
    errors.push(`Game "${gameId}" is missing required field: phases`);
    if (returnResults) return { errors, warnings };
    throw new Error(errors[0]);
  }

  const phaseNames = Object.keys(config.phases);

  if (phaseNames.length === 0) {
    errors.push(`Game "${gameId}" has no phases defined`);
  }

  const hasLobby = phaseNames.some(name => config.phases[name].type === 'lobby');
  if (!hasLobby) {
    errors.push(`Game "${gameId}" is missing a lobby phase`);
  }

  const hasEnd = phaseNames.some(name => config.phases[name].type === 'end');
  if (!hasEnd) {
    errors.push(`Game "${gameId}" is missing an end phase`);
  }

  for (const [name, phase] of Object.entries(config.phases)) {
    // Phase type validation
    if (!phase.type || !VALID_PHASE_TYPES.includes(phase.type)) {
      errors.push(
        `Game "${gameId}": phase "${name}" has invalid type "${phase.type}"`
      );
      continue; // Skip further checks for this phase
    }

    // Required fields per type
    const required = PHASE_REQUIRED_FIELDS[phase.type];
    if (required) {
      for (const field of required) {
        if (phase[field] === undefined || phase[field] === null || phase[field] === '') {
          errors.push(
            `Game "${gameId}": phase "${name}" (${phase.type}) is missing required field "${field}"`
          );
        }
      }
    }

    // Unknown-field check: reject any field not in the allow-list. Catches AI
    // inventions like `teacherInput`, `showScenario`, `excludeSelf` that the
    // engine silently ignores.
    const allowedFields = new Set([
      ...UNIVERSAL_FIELDS,
      ...(PHASE_REQUIRED_FIELDS[phase.type] || []),
      ...(PHASE_OPTIONAL_FIELDS[phase.type] || [])
    ]);
    if (phase.type === 'preview') {
      // Preview also gets approveNext/rejectNext (not "next"), already in required.
    }
    if (phase.type !== 'foreach') {
      // foreach has subPhases which is checked separately.
      for (const field of Object.keys(phase)) {
        if (!allowedFields.has(field)) {
          errors.push(
            `Game "${gameId}": phase "${name}" (${phase.type}) has unknown field "${field}". This isn't a real setting — the engine will ignore it. Remove it or use a valid field.`
          );
        }
      }
    } else {
      // foreach: allow subPhases plus the foreach-specific fields.
      const foreachAllowed = new Set([...allowedFields, 'subPhases']);
      for (const field of Object.keys(phase)) {
        if (!foreachAllowed.has(field)) {
          errors.push(
            `Game "${gameId}": phase "${name}" (foreach) has unknown field "${field}". Remove it or use a valid field.`
          );
        }
      }
    }

    // Enum field validation (type-aware: some fields are enums only on certain types)
    const enumChecks = [];
    if ((phase.type === 'collect' || phase.type === 'collect-choice') && phase.from !== undefined && phase.from !== null) {
      enumChecks.push(['from', phase.from, ENUM_VALUES.from]);
    }
    if (phase.type === 'vote') {
      if (phase.voters !== undefined && phase.voters !== null) {
        enumChecks.push(['voters', phase.voters, ENUM_VALUES.voters]);
      }
      if (phase.mode !== undefined) {
        enumChecks.push(['mode', phase.mode, ENUM_VALUES.mode]);
      }
    }
    if (phase.type === 'eliminate' && phase.method !== undefined) {
      enumChecks.push(['method', phase.method, ENUM_VALUES.method]);
    }
    if (phase.type === 'team-split' && phase.method !== undefined) {
      const validMethods = ['random', 'balanced'];
      if (!validMethods.includes(phase.method)) {
        enumChecks.push(['method', phase.method, validMethods]);
      }
    }
    if ((phase.type === 'team-split' || phase.type === 'rank' || phase.type === 'wager' || phase.type === 'relay') && phase.from !== undefined && phase.from !== null) {
      // These types use 'from' as player eligibility enum (not data ref)
      if (['all', 'remaining', 'eliminated'].includes(phase.from)) {
        // valid
      } else if (!phase.from.includes('.')) {
        enumChecks.push(['from', phase.from, ENUM_VALUES.from]);
      }
    }
    if (phase.type === 'relay' && phase.order !== undefined && phase.order !== null) {
      enumChecks.push(['order', phase.order, ENUM_VALUES.order]);
    }
    if (phase.type === 'leaderboard' && phase.style !== undefined && phase.style !== null) {
      enumChecks.push(['style', phase.style, ENUM_VALUES.style]);
    }
    if (phase.type === 'ai-process') {
      if (phase.format !== undefined && phase.format !== null) {
        enumChecks.push(['format', phase.format, ENUM_VALUES.format]);
      }
      if (phase.task !== undefined && phase.task !== null) {
        enumChecks.push(['task', phase.task, ENUM_VALUES.task]);
      }
    }
    for (const [field, value, validValues] of enumChecks) {
      if (!validValues.includes(value)) {
        errors.push(
          `Game "${gameId}": phase "${name}" has invalid ${field} value "${value}". Valid values: ${validValues.join(', ')}`
        );
      }
    }

    // Timer validation
    if (phase.timer !== undefined && phase.timer !== null) {
      if (typeof phase.timer !== 'number' || phase.timer < 1 || phase.timer > 3600) {
        errors.push(
          `Game "${gameId}": phase "${name}" has invalid timer value "${phase.timer}". Must be a number between 1 and 3600.`
        );
      }
    }

    // Eliminate-specific validation
    if (phase.type === 'eliminate') {
      if (phase.method === 'bottom-percent') {
        if (phase.percent === undefined || phase.percent === null ||
            typeof phase.percent !== 'number' || phase.percent < 1 || phase.percent > 100) {
          errors.push(
            `Game "${gameId}": phase "${name}" uses bottom-percent but has invalid percent value. Must be 1-100.`
          );
        }
      }
      if (phase.method === 'hook') {
        if (!phase.hook) {
          errors.push(
            `Game "${gameId}": phase "${name}" uses hook method but is missing hook name`
          );
        }
      }
    }

    // Preview must have content OR template
    if (phase.type === 'preview') {
      const hasContent = phase.content !== undefined && phase.content !== null && phase.content !== '';
      const hasTemplate = phase.template !== undefined && phase.template !== null && phase.template !== '';
      if (!hasContent && !hasTemplate) {
        errors.push(
          `Game "${gameId}": phase "${name}" (preview) must have either "content" or "template" (or both)`
        );
      }
    }

    // Data reference validation — check that referenced phase exists
    for (const field of DATA_REF_FIELDS) {
      if (phase[field] && typeof phase[field] === 'string' && phase[field].includes('.')) {
        const refPhaseId = phase[field].split('.')[0];
        if (!config.phases[refPhaseId]) {
          errors.push(
            `Game "${gameId}": phase "${name}" references "${phase[field]}" but phase "${refPhaseId}" does not exist`
          );
        }
      }
    }

    // team-split teamCount validation
    if (phase.type === 'team-split' && phase.teamCount !== undefined) {
      if (typeof phase.teamCount !== 'number' || phase.teamCount < 2 || phase.teamCount > 20) {
        errors.push(
          `Game "${gameId}": phase "${name}" has invalid teamCount "${phase.teamCount}". Must be a number between 2 and 20.`
        );
      }
    }

    // wager minBet/maxBetPercent validation
    if (phase.type === 'wager') {
      if (phase.minBet !== undefined && phase.minBet !== null) {
        if (typeof phase.minBet !== 'number' || phase.minBet < 0) {
          errors.push(
            `Game "${gameId}": phase "${name}" has invalid minBet "${phase.minBet}". Must be a non-negative number.`
          );
        }
      }
      if (phase.maxBetPercent !== undefined && phase.maxBetPercent !== null) {
        if (typeof phase.maxBetPercent !== 'number' || phase.maxBetPercent < 1 || phase.maxBetPercent > 100) {
          errors.push(
            `Game "${gameId}": phase "${name}" has invalid maxBetPercent "${phase.maxBetPercent}". Must be 1-100.`
          );
        }
      }
    }

    // "from" data reference validation for winner, leaderboard, reveal-one
    if (['winner', 'leaderboard', 'reveal-one'].includes(phase.type) && phase.from && typeof phase.from === 'string' && phase.from.includes('.')) {
      const refPhaseId = phase.from.split('.')[0];
      if (!config.phases[refPhaseId]) {
        errors.push(
          `Game "${gameId}": phase "${name}" references "${phase.from}" but phase "${refPhaseId}" does not exist`
        );
      }
    }

    // Loop validation
    if (phase.loopBack !== undefined && phase.loopBack !== null && phase.loopBack !== '') {
      if (!config.phases[phase.loopBack]) {
        errors.push(
          `Game "${gameId}": phase "${name}" has loopBack "${phase.loopBack}" which does not exist`
        );
      }
      if (phase.loopCount === undefined || phase.loopCount === null) {
        errors.push(
          `Game "${gameId}": phase "${name}" has loopBack but is missing loopCount`
        );
      } else if (typeof phase.loopCount !== 'number' || phase.loopCount < 2 || phase.loopCount > 100) {
        errors.push(
          `Game "${gameId}": phase "${name}" has invalid loopCount "${phase.loopCount}". Must be a number between 2 and 100.`
        );
      }
      if (!phase.next) {
        errors.push(
          `Game "${gameId}": phase "${name}" has loopBack but is missing "next" (needed as loop exit)`
        );
      }
    }

    // Foreach validation
    if (phase.type === 'foreach') {
      if (phase.data && typeof phase.data === 'string' && phase.data.includes('.')) {
        const refPhaseId = phase.data.split('.')[0];
        if (!config.phases[refPhaseId]) {
          errors.push(
            `Game "${gameId}": phase "${name}" references data "${phase.data}" but phase "${refPhaseId}" does not exist`
          );
        }
      }
      if (phase.subPhases && typeof phase.subPhases === 'object') {
        const subNames = Object.keys(phase.subPhases);
        if (subNames.length === 0) {
          errors.push(
            `Game "${gameId}": phase "${name}" (foreach) has empty subPhases`
          );
        }
        for (const [subName, sub] of Object.entries(phase.subPhases)) {
          if (!sub.type) {
            errors.push(
              `Game "${gameId}": phase "${name}" subPhase "${subName}" is missing type`
            );
          } else if (!VALID_SUBPHASE_TYPES.includes(sub.type)) {
            errors.push(
              `Game "${gameId}": phase "${name}" subPhase "${subName}" has invalid type "${sub.type}". Sub-phases can only be: ${VALID_SUBPHASE_TYPES.join(', ')}.`
            );
          } else {
            // Required + allow-list check for sub-phase
            const subRequired = PHASE_REQUIRED_FIELDS[sub.type] || [];
            for (const field of subRequired) {
              if (sub[field] === undefined || sub[field] === null || sub[field] === '') {
                errors.push(
                  `Game "${gameId}": phase "${name}" subPhase "${subName}" (${sub.type}) is missing required field "${field}"`
                );
              }
            }
            const subAllowed = new Set([
              'type',
              ...subRequired,
              ...(SUBPHASE_OPTIONAL_FIELDS[sub.type] || [])
            ]);
            for (const field of Object.keys(sub)) {
              if (!subAllowed.has(field)) {
                errors.push(
                  `Game "${gameId}": phase "${name}" subPhase "${subName}" (${sub.type}) has unknown field "${field}". Remove it or use a valid field.`
                );
              }
            }
          }
        }
      }
      if (phase.aiInject) {
        if (typeof phase.aiInject !== 'object') {
          errors.push(
            `Game "${gameId}": phase "${name}" aiInject must be an object`
          );
        } else {
          if (!phase.aiInject.count || typeof phase.aiInject.count !== 'number' || phase.aiInject.count < 1 || phase.aiInject.count > 20) {
            errors.push(
              `Game "${gameId}": phase "${name}" aiInject.count must be a number between 1 and 20`
            );
          }
          if (!phase.aiInject.instruction || typeof phase.aiInject.instruction !== 'string') {
            errors.push(
              `Game "${gameId}": phase "${name}" aiInject.instruction is required (tells AI what to generate)`
            );
          }
        }
      }
      if (phase.pairMode) {
        if (phase.pairMode !== 'human-vs-ai') {
          errors.push(
            `Game "${gameId}": phase "${name}" pairMode must be "human-vs-ai" (got "${phase.pairMode}")`
          );
        }
        if (!phase.aiInject) {
          errors.push(
            `Game "${gameId}": phase "${name}" pairMode requires aiInject to generate AI items for pairing`
          );
        }
      }
      if (phase.scoring) {
        if (!phase.scoring.subPhase) {
          errors.push(
            `Game "${gameId}": phase "${name}" scoring is missing "subPhase" field`
          );
        }
        if (phase.scoring.mode === 'tally') {
          if (!phase.scoring.pointMap || typeof phase.scoring.pointMap !== 'object') {
            errors.push(
              `Game "${gameId}": phase "${name}" scoring mode "tally" requires a "pointMap" object`
            );
          }
        } else if (!phase.scoring.correctAnswer) {
          errors.push(
            `Game "${gameId}": phase "${name}" scoring is missing "correctAnswer" field`
          );
        }
      }
    }

    // Screen control validation
    if (phase.hostTemplate !== undefined && phase.hostTemplate !== null && typeof phase.hostTemplate !== 'string') {
      errors.push(
        `Game "${gameId}": phase "${name}" has invalid hostTemplate — must be a string`
      );
    }
    if (phase.playerTemplate !== undefined && phase.playerTemplate !== null && typeof phase.playerTemplate !== 'string') {
      errors.push(
        `Game "${gameId}": phase "${name}" has invalid playerTemplate — must be a string`
      );
    }
    if (phase.hostShow !== undefined && phase.hostShow !== null) {
      if (!Array.isArray(phase.hostShow)) {
        errors.push(
          `Game "${gameId}": phase "${name}" has invalid hostShow — must be an array`
        );
      } else {
        const validToggles = VALID_HOST_TOGGLES[phase.type];
        if (validToggles) {
          for (const toggle of phase.hostShow) {
            if (!validToggles.includes(toggle)) {
              errors.push(
                `Game "${gameId}": phase "${name}" has invalid hostShow toggle "${toggle}". Valid: ${validToggles.join(', ')}`
              );
            }
          }
        }
      }
    }
    if (phase.playerShow !== undefined && phase.playerShow !== null) {
      if (!Array.isArray(phase.playerShow)) {
        errors.push(
          `Game "${gameId}": phase "${name}" has invalid playerShow — must be an array`
        );
      } else {
        const validToggles = VALID_PLAYER_TOGGLES[phase.type];
        if (validToggles) {
          for (const toggle of phase.playerShow) {
            if (!validToggles.includes(toggle)) {
              errors.push(
                `Game "${gameId}": phase "${name}" has invalid playerShow toggle "${toggle}". Valid: ${validToggles.join(', ')}`
              );
            }
          }
        }
      }
    }

    // Next/approveNext/rejectNext reference validation
    if (phase.next && !config.phases[phase.next]) {
      errors.push(
        `Game "${gameId}": phase "${name}" has next "${phase.next}" which does not exist`
      );
    }

    if (phase.approveNext && !config.phases[phase.approveNext]) {
      errors.push(
        `Game "${gameId}": phase "${name}" has approveNext "${phase.approveNext}" which does not exist`
      );
    }

    if (phase.rejectNext && !config.phases[phase.rejectNext]) {
      errors.push(
        `Game "${gameId}": phase "${name}" has rejectNext "${phase.rejectNext}" which does not exist`
      );
    }
  }

  // Cycle detection — any cycle through next/approveNext/rejectNext (excluding
  // loopBack edges) is unintended. To repeat a section, use loopBack/loopCount.
  // Catches the common "phase Z.next points back to an earlier phase" mistake.
  detectCycles(config, gameId, errors);

  // Template scan — warn when a {{phaseId.field}} renders an array as a string
  // (which JS stringifies as "[object Object],[object Object]"). The fix is
  // to use the .list synthetic suffix.
  scanTemplatesForRawArrays(config, gameId, warnings);

  // Per-phase semantic warnings (not blockers, but signal probable design holes).
  scanForDesignHoles(config, gameId, warnings);

  if (returnResults) {
    return { errors, warnings };
  }

  // Throw first error for backward compatibility
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}

// DFS cycle detection on the next/approveNext/rejectNext graph (loopBack edges
// excluded — those are explicit, intentional loops). Reports the first cycle.
function detectCycles(config, gameId, errors) {
  const phaseNames = Object.keys(config.phases);
  const lobbyName = phaseNames.find(n => config.phases[n].type === 'lobby');
  if (!lobbyName) return;

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  for (const n of phaseNames) color[n] = WHITE;

  const stack = [];
  let found = null;

  function visit(node) {
    if (found) return;
    color[node] = GRAY;
    stack.push(node);
    const phase = config.phases[node];
    if (phase) {
      const edges = [];
      if (phase.next) edges.push(['next', phase.next]);
      if (phase.approveNext) edges.push(['approveNext', phase.approveNext]);
      // rejectNext is intentionally a back-edge on preview phases (the "redo"
      // primitive), so we don't count it as a cycle. Same for loopBack.
      for (const [edgeName, target] of edges) {
        if (!config.phases[target]) continue; // already reported as bad ref
        if (color[target] === GRAY) {
          const start = stack.indexOf(target);
          const cycle = stack.slice(start).concat(target);
          found = { node, edgeName, target, cycle };
          return;
        }
        if (color[target] === WHITE) {
          visit(target);
          if (found) return;
        }
      }
    }
    stack.pop();
    color[node] = BLACK;
  }

  visit(lobbyName);
  if (found) {
    errors.push(
      `Game "${gameId}": phase "${found.node}" has ${found.edgeName} "${found.target}" which creates a loop (${found.cycle.join(' → ')}). To repeat a section, use loopBack/loopCount on a phase instead of pointing "next" backward.`
    );
  }
}

// Field names that are (almost) always arrays. Rendering one as a raw {{X.field}}
// inside a template stringifies as "[object Object],..." — usually a bug.
const KNOWN_ARRAY_FIELDS = new Set([
  'responses', 'standings', 'eliminated', 'eliminatedNames',
  'survivors', 'winnerIds', 'winnerNames', 'rankings', 'matchups',
  'candidateIds', 'voters'
]);

// Phase fields that hold templates the engine resolves at runtime.
const TEMPLATE_FIELDS = ['template', 'content', 'message', 'prompt', 'instruction', 'hostTemplate', 'playerTemplate'];

// Catch design holes that aren't structural errors but make a game feel broken:
//   - wager with no scoresFrom AND no correctOption (no points to bet, no
//     auto-resolve — host has to guess, players bet on nothing)
//   - team-split whose team data isn't referenced anywhere downstream
function scanForDesignHoles(config, gameId, warnings) {
  // Collect every string template in the game so we can search for refs.
  const allTemplates = [];
  for (const phase of Object.values(config.phases)) {
    for (const f of TEMPLATE_FIELDS) {
      if (typeof phase[f] === 'string') allTemplates.push(phase[f]);
    }
  }
  const allTemplatesJoined = allTemplates.join('\n');

  for (const [name, phase] of Object.entries(config.phases)) {
    if (phase.type === 'wager') {
      const hasScores = !!phase.scoresFrom;
      const hasCorrect = !!phase.correctOption;
      if (!hasScores && !hasCorrect) {
        warnings.push(
          `Game "${gameId}": phase "${name}" (wager) has no "scoresFrom" and no "correctOption" — players will start with default points and the host will have to pick the winner manually. Set "correctOption" if there's a verifiable answer, or use "scoresFrom" to chain scores from a previous round.`
        );
      }
    }

    if (phase.type === 'team-split') {
      // Look for any reference to team data downstream — currently there's no
      // single "uses teams" signal, so we look for {{team*}} or {{...teams*}}
      // tokens in any template.
      const referenced = /\{\{[^}]*team[^}]*\}\}/i.test(allTemplatesJoined);
      if (!referenced) {
        warnings.push(
          `Game "${gameId}": phase "${name}" (team-split) creates teams, but no later template references team data. The split is wasted setup. Either reference team info in a later message (e.g. "Team {{${name}.teams}}") or remove this phase.`
        );
      }
    }
  }
}

function scanTemplatesForRawArrays(config, gameId, warnings) {
  const tokenRe = /\{\{\s*([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_]+)(?:\.([a-zA-Z0-9_]+))?\s*\}\}/g;
  for (const [name, phase] of Object.entries(config.phases)) {
    for (const field of TEMPLATE_FIELDS) {
      const tpl = phase[field];
      if (!tpl || typeof tpl !== 'string') continue;
      let m;
      tokenRe.lastIndex = 0;
      while ((m = tokenRe.exec(tpl)) !== null) {
        const [, refPhase, leaf, suffix] = m;
        if (!KNOWN_ARRAY_FIELDS.has(leaf)) continue;
        // If a list/chart suffix follows, it's intentional.
        if (suffix === 'list' || suffix === 'barChart' || suffix === 'pieChart' || suffix === 'chart') continue;
        // Allow .length and similar scalar accessors.
        if (suffix === 'length') continue;
        // Allow indexed access like .responses.0 (rare but legit).
        if (suffix && /^\d+$/.test(suffix)) continue;
        warnings.push(
          `Game "${gameId}": phase "${name}" template ${field} contains "{{${refPhase}.${leaf}${suffix ? '.' + suffix : ''}}}" — "${leaf}" is a list and will display as "[object Object],...". Add ".list" to format it (e.g. {{${refPhase}.${leaf}.list}}).`
        );
      }
    }
  }
}
