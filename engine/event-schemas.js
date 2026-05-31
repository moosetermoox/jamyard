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
    phaseInstanceId: 'number:optional'
  },
  'close-submissions': {
    code: 'string:required',
    phaseInstanceId: 'number:optional'
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
