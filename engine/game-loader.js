import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, '..', 'games');

const VALID_PHASE_TYPES = [
  'lobby', 'collect', 'collect-choice', 'ai-process', 'vote', 'eliminate',
  'ai-eliminate', 'announce', 'reveal', 'preview', 'winner', 'end'
];

const PHASE_REQUIRED_FIELDS = {
  collect: ['prompt'],
  'collect-choice': ['prompt', 'choices'],
  'ai-process': ['instruction', 'input'],
  'ai-eliminate': ['instruction', 'input'],
  vote: ['mode', 'candidates'],
  eliminate: ['method'],
  announce: ['message'],
  preview: ['approveNext', 'rejectNext'],
  winner: ['from']
};

const ENUM_VALUES = {
  from: ['all', 'remaining', 'eliminated'],
  voters: ['all', 'remaining', 'eliminated'],
  mode: ['pick-one', 'head-to-head'],
  method: ['bottom-percent', 'hook'],
  format: ['text', 'json'],
  task: ['summarize', 'generate', 'generate-choices', 'compare', 'rank', 'judge']
};

// Fields that hold data references (phaseId.field format)
const DATA_REF_FIELDS = ['input', 'candidates', 'content'];

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
  end: ['message']
};

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

    // Winner "from" is also a data reference
    if (phase.type === 'winner' && phase.from && typeof phase.from === 'string' && phase.from.includes('.')) {
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

  if (returnResults) {
    return { errors, warnings };
  }

  // Throw first error for backward compatibility
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}
