/**
 * Runtime payload schemas for socket events.
 *
 * Goal: catch malformed or hostile payloads BEFORE they reach handler logic.
 * Schemas are intentionally simple strings ("type:required" | "type:optional")
 * so they're trivial to read and extend without a dependency.
 *
 * Types: string, number, boolean, array, object, any
 * Presence: required | optional
 *
 * Events not listed here are accepted as-is (backward compat).
 */

export const EVENT_SCHEMAS = {
  'join-room': {
    code: 'string:required',
    name: 'string:required',
    token: 'string:optional'
  },
  'create-room': {
    gameId: 'string:optional'
  },
  'start-game': {
    code: 'string:required'
  },
  'submit-response': {
    code: 'string:required',
    response: 'any:required',
    pass: 'boolean:optional',
    phaseInstanceId: 'number:optional'
  },
  'close-submissions': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'join-teacher': {
    code: 'string:required',
    pin: 'string:optional'
  },
  'moderate-hide': {
    code: 'string:required',
    playerId: 'string:required',
    hidden: 'boolean:optional'
  },
  'moderate-kick': {
    code: 'string:required',
    playerId: 'string:required'
  },
  'submit-vote': {
    code: 'string:required',
    choice: 'any:optional',
    votes: 'array:optional',
    phaseInstanceId: 'number:optional'
  },
  'close-voting': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'rank-submit': {
    code: 'string:required',
    ranking: 'array:required',
    phaseInstanceId: 'number:optional'
  },
  'match-submit': {
    code: 'string:required',
    matching: 'array:required',
    phaseInstanceId: 'number:optional'
  },
  'sort-submit': {
    code: 'string:required',
    sorting: 'array:required',
    phaseInstanceId: 'number:optional'
  },
  'close-sorting': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'team-assign': {
    code: 'string:required',
    playerId: 'string:required',
    team: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'team-split-confirm': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'team-pick': {
    code: 'string:required',
    team: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'close-matching': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'check-item': {
    code: 'string:required',
    index: 'number:required',
    checked: 'boolean:required',
    team: 'string:optional',       // teacher console only: act on a group's behalf
    phaseInstanceId: 'number:optional'
  },
  'close-checklist': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'extend-timer': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'wager-submit': {
    code: 'string:required',
    option: 'string:required',
    amount: 'number:required',
    phaseInstanceId: 'number:optional'
  },
  'rate-submit': {
    code: 'string:required',
    ratings: 'object:required',
    phaseInstanceId: 'number:optional'
  },
  'close-rating': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'relay-submit': {
    code: 'string:required',
    text: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'merge-draft': {
    code: 'string:required',
    text: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'merge-agree': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'merge-take-pen': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'close-merge': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'one-voice-tap': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'close-one-voice': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'host-rejoin': {
    code: 'string:required',
    hostToken: 'string:required'
  },
  'buzz-tap': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'buzz-judge': {
    code: 'string:required',
    correct: 'boolean:required',
    phaseInstanceId: 'number:optional'
  },
  'buzz-next': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'buzz-finish': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'estimate-submit': {
    code: 'string:required',
    value: 'number:required',
    phaseInstanceId: 'number:optional'
  },
  'close-estimates': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'turn-got-it': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'turn-skip': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'advance-phase': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
  },
  'end-game': {
    code: 'string:required'
  }
};

/**
 * Validate a payload against a schema.
 * Returns { ok: true } or { ok: false, reason: "..." }.
 */
export function validatePayload(eventName, payload) {
  const schema = EVENT_SCHEMAS[eventName];
  if (!schema) return { ok: true };

  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'Payload must be an object' };
  }

  for (const field of Object.keys(schema)) {
    const rule = schema[field];
    const [type, presence] = rule.split(':');
    const value = payload[field];

    if (value === undefined || value === null) {
      if (presence === 'required') {
        return { ok: false, reason: `Missing required field: ${field}` };
      }
      continue;
    }

    if (type === 'any') continue;
    if (type === 'array') {
      if (!Array.isArray(value)) return { ok: false, reason: `Field "${field}" must be an array` };
      continue;
    }
    if (type === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, reason: `Field "${field}" must be an object` };
      }
      continue;
    }
    if (typeof value !== type) {
      return { ok: false, reason: `Field "${field}" must be ${type}` };
    }
  }

  return { ok: true };
}
