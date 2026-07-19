/**
 * game-loader — reads game configs from disk and, more importantly, VALIDATES
 * them. This is the server-side gatekeeper: nothing reaches a live room or the
 * editor's save path without passing `validate()`.
 *
 * `validate(config, gameId)` runs structural checks driven by the declarative
 * phase schema (engine/phase-schemas.js) — required fields per phase type, enum
 * values, legal transitions — plus cross-cutting checks the schema can't express:
 * data-reference existence (`{{phase.field}}` points at a real producer),
 * typed-dataflow compatibility, and reachability (every phase reachable from
 * lobby). It returns structured Diagnostics (errors block; warnings advise),
 * mirrored client-side in screens/designer/editor.js.
 *
 * The biggest engine file because it encodes every "what makes a game valid"
 * rule in one place.
 */
import { readFile, readdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkDiagnostic, DIAGNOSTIC_CODES } from './diagnostics.js';
import {
  PHASE_SCHEMAS,
  getFields as schemaGetFields,
  getTransitions as schemaGetTransitions,
  getAllowedFieldNames as schemaGetAllowedFieldNames,
  getHostToggles as schemaGetHostToggles,
  getPlayerToggles as schemaGetPlayerToggles
} from './phase-schemas.js';
import { parseTemplateTokens, parseRef, classifyRef, checkDataRefCompat } from './resolver-grammar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMES_DIR = join(__dirname, '..', 'games');
const USER_GAMES_DIR = join(GAMES_DIR, 'user');

// Reserved top-level names inside games/ that aren't themselves games:
//   - "user" is the user-content namespace (games/user/<id>/)
//   - "_*"   are templates / test fixtures (skipped by name prefix)
const RESERVED_GAME_DIR_NAMES = new Set(['user']);

// Field names that hold data references (phaseId.field format). Kept here
// (rather than derived from the schema) because the inline ref-existence
// check in validate() walks this small list directly. Could derive from
// schema by scanning every field with type: 'dataRef' — left for a future
// follow-up if drift becomes a problem.
const DATA_REF_FIELDS = ['input', 'candidates', 'content', 'scoresFrom', 'balanceFrom', 'seedFrom'];

// (Removed Phase #50: VALID_PHASE_TYPES, PHASE_REQUIRED_FIELDS,
// PHASE_OPTIONAL_FIELDS, SUBPHASE_OPTIONAL_FIELDS, VALID_SUBPHASE_TYPES,
// UNIVERSAL_FIELDS, ENUM_VALUES, VALID_HOST_TOGGLES, VALID_PLAYER_TOGGLES.
// All replaced by reads from engine/phase-schemas.js.)

/**
 * Returns the set of fields legal on a phase of the given type.
 * Used by the AI generator to strip invented fields before validation.
 *
 * @param {string} phaseType
 * @param {{ subPhase?: boolean }} [opts]
 * @returns {Set<string>} set of allowed field names (or empty set if type unknown)
 *
 * Delegates to the shared phase schema (engine/phase-schemas.js). The
 * old constant lookups (PHASE_REQUIRED_FIELDS / PHASE_OPTIONAL_FIELDS /
 * SUBPHASE_OPTIONAL_FIELDS) are kept in this file only as fallback for
 * the per-phase code paths inside validate() that haven't been
 * migrated to schema-driven yet. Once those migrate, the constants
 * can be deleted.
 */
export function getAllowedFields(phaseType, opts) {
  return schemaGetAllowedFieldNames(phaseType, opts);
}

export async function loadGame(gameId) {
  const { configPath, source } = await resolveGamePath(gameId);

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

  // Stamp the source so callers can render built-in vs user differently
  // without re-scanning the filesystem. Non-enumerable so it doesn't leak
  // back into saved configs.
  Object.defineProperty(config, '_source', { value: source, enumerable: false });

  return config;
}

/**
 * Finds the on-disk location for a given game id. Built-in (top-level
 * games/<id>/) takes precedence over user (games/user/<id>/). Returns
 * { configPath, gameDir, source } or throws if the game does not exist
 * in either location.
 */
export async function resolveGamePath(gameId) {
  const builtInDir = join(GAMES_DIR, gameId);
  const userDir = join(USER_GAMES_DIR, gameId);

  try {
    await access(join(builtInDir, 'config.json'));
    return { configPath: join(builtInDir, 'config.json'), gameDir: builtInDir, source: 'built-in' };
  } catch {}

  try {
    await access(join(userDir, 'config.json'));
    return { configPath: join(userDir, 'config.json'), gameDir: userDir, source: 'user' };
  } catch {}

  throw new Error(`Game not found: no config.json at games/${gameId}/config.json`);
}

/**
 * Scans both built-in and user game directories and returns a summary
 * for each loadable game. Skips templates (`_*`) and the reserved
 * `user/` namespace at the top level. Games with invalid configs are
 * skipped silently — same behavior as the legacy ad-hoc scan in
 * server.js, kept for backward compat.
 *
 * Returns: Array<{ id, source, config }>
 *   - source: 'built-in' | 'user'
 *   - config: the parsed + validated config (with non-enumerable _source)
 */
export async function listGames() {
  const games = [];

  for (const { dir, source } of [
    { dir: GAMES_DIR, source: 'built-in' },
    { dir: USER_GAMES_DIR, source: 'user' }
  ]) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // user dir may not exist yet — fine
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('_')) continue;
      if (source === 'built-in' && RESERVED_GAME_DIR_NAMES.has(entry.name)) continue;
      try {
        const config = await loadGame(entry.name);
        games.push({ id: entry.name, source, config });
      } catch {
        // Skip games with invalid configs (matches legacy behavior)
      }
    }
  }

  return games;
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
    if (returnResults) {
      const diagnostics = errors.map(msg => mkDiagnostic({
        severity: 'error',
        code: inferDiagnosticCode(msg, 'error'),
        message: msg,
        source: 'validator'
      }));
      return { errors, warnings, diagnostics };
    }
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
    // Phase type validation — schema-driven
    if (!phase.type || !PHASE_SCHEMAS[phase.type]) {
      errors.push(
        `Game "${gameId}": phase "${name}" has invalid type "${phase.type}"`
      );
      continue; // Skip further checks for this phase
    }

    // Schema-driven required-fields + allow-list. The schema's getFields
    // returns the merged map of base fields + applicable mixins;
    // getAllowedFields adds transition keys ('next', 'loopBack', etc.)
    // and 'type' itself.
    const schemaFields = schemaGetFields(phase.type);
    const allowedFields = schemaGetAllowedFieldNames(phase.type);

    // Required fields per type — derived from schema. Includes both
    // regular fields and required transitions (e.g. preview's
    // approveNext / rejectNext are declared as transitions).
    const schemaTransitions = schemaGetTransitions(phase.type);
    for (const [fname, fdef] of [
      ...Object.entries(schemaFields),
      ...Object.entries(schemaTransitions)
    ]) {
      if (!fdef.required) continue;
      if (phase[fname] === undefined || phase[fname] === null || phase[fname] === '') {
        errors.push(
          `Game "${gameId}": phase "${name}" (${phase.type}) is missing required field "${fname}"`
        );
      }
    }

    // Unknown-field check: reject any field not in the allow-list. Catches AI
    // inventions like `teacherInput`, `showScenario`, `excludeSelf` that the
    // engine silently ignores.
    if (phase.type === 'foreach') {
      // foreach has subPhases as a structural slot (checked recursively below)
      const foreachAllowed = new Set([...allowedFields, 'subPhases']);
      for (const field of Object.keys(phase)) {
        if (!foreachAllowed.has(field)) {
          errors.push(
            `Game "${gameId}": phase "${name}" (foreach) has unknown field "${field}". Remove it or use a valid field.`
          );
        }
      }
    } else {
      for (const field of Object.keys(phase)) {
        if (!allowedFields.has(field)) {
          errors.push(
            `Game "${gameId}": phase "${name}" (${phase.type}) has unknown field "${field}". This isn't a real setting — the engine will ignore it. Remove it or use a valid field.`
          );
        }
      }
    }

    // Enum field validation — schema-driven. Walks every field declared
    // type: 'enum' on this phase type and checks membership. Skips values
    // that contain a "." since some `from` fields tolerate dataRef-style
    // strings (e.g. `team-split.from: "phase.field"`) for backward compat.
    for (const [fname, fdef] of Object.entries(schemaFields)) {
      if (fdef.type !== 'enum') continue;
      const value = phase[fname];
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.includes('.')) continue;
      if (!fdef.values.includes(value)) {
        errors.push(
          `Game "${gameId}": phase "${name}" has invalid ${fname} value "${value}". Valid values: ${fdef.values.join(', ')}`
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

    // collect-choice must have EITHER choices OR choicePool (not neither, not both)
    if (phase.type === 'collect-choice') {
      const hasChoices = phase.choices !== undefined && phase.choices !== null;
      const hasPool = Array.isArray(phase.choicePool) && phase.choicePool.length > 0;
      if (!hasChoices && !hasPool) {
        errors.push(
          `Game "${gameId}": phase "${name}" (collect-choice) is missing required field "choices" (or "choicePool")`
        );
      }
      if (hasChoices && hasPool) {
        errors.push(
          `Game "${gameId}": phase "${name}" (collect-choice) cannot set both "choices" and "choicePool" — pick one`
        );
      }
    }

    // vote must have EITHER candidates OR matchupsFromPairs (and the latter is head-to-head only)
    if (phase.type === 'vote') {
      const hasCands = phase.candidates !== undefined && phase.candidates !== null && phase.candidates !== '';
      const hasPairs = !!phase.matchupsFromPairs;
      if (!hasCands && !hasPairs) {
        errors.push(
          `Game "${gameId}": phase "${name}" (vote) is missing required field "candidates" (or "matchupsFromPairs")`
        );
      }
      if (hasPairs && phase.mode !== 'head-to-head') {
        errors.push(
          `Game "${gameId}": phase "${name}" (vote) uses "matchupsFromPairs" but mode is not "head-to-head"`
        );
      }
    }

    // collect pairwise cross-field rules. pairsFrom is optional since the
    // Connection Pack (no pairsFrom → every pair gets the step's own prompt).
    if (phase.type === 'collect') {
      if (phase.rotatePairsFrom && phase.reusePairsFrom) {
        errors.push(
          `Game "${gameId}": phase "${name}" (collect) sets both "rotatePairsFrom" and "reusePairsFrom" — pick one (new partners vs. same partners).`
        );
      }
      for (const pairingField of ['rotatePairsFrom', 'reusePairsFrom']) {
        if (!phase[pairingField]) continue;
        if (phase.assign !== 'pairwise') {
          errors.push(
            `Game "${gameId}": phase "${name}" (collect) sets "${pairingField}" but assign is not "pairwise" — the field only applies to paired steps.`
          );
          continue;
        }
        const pairingSrc = config.phases[phase[pairingField]];
        if (!pairingSrc) {
          errors.push(
            `Game "${gameId}": phase "${name}" has ${pairingField} "${phase[pairingField]}" which does not exist`
          );
        } else if (!(pairingSrc.type === 'collect' && pairingSrc.assign === 'pairwise')) {
          errors.push(
            `Game "${gameId}": phase "${name}" ${pairingField} "${phase[pairingField]}" must point to a collect step with assign:"pairwise" (got ${pairingSrc.type})`
          );
        }
      }
    }

    // vote.matchupsFromPairs over a triple-capable source: head-to-head
    // matchups assume exactly 2 entries per pair, so a group of three would
    // misbehave. Warn, don't block (even classes never form a triple).
    if (phase.type === 'vote' && phase.matchupsFromPairs) {
      const matchSrc = config.phases[phase.matchupsFromPairs];
      if (matchSrc && matchSrc.oddHandling === 'triple') {
        warnings.push(
          `Game "${gameId}": phase "${name}" (vote) builds matchups from "${phase.matchupsFromPairs}", which uses oddHandling:"triple". With an odd class a group of three will form and head-to-head matchups need exactly 2 — use oddHandling:"sit-out" on that step instead.`
        );
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

    // Rate phase: scales array shape (id/label/min/max).
    if (phase.type === 'rate') {
      if (!Array.isArray(phase.scales) || phase.scales.length === 0) {
        errors.push(
          `Game "${gameId}": phase "${name}" (rate) needs at least one scale.`
        );
      } else {
        const seenIds = new Set();
        for (let i = 0; i < phase.scales.length; i++) {
          const s = phase.scales[i];
          const path = `scales[${i}]`;
          if (!s || typeof s !== 'object' || Array.isArray(s)) {
            errors.push(
              `Game "${gameId}": phase "${name}" ${path} must be an object with id/label/min/max.`
            );
            continue;
          }
          if (!s.id || typeof s.id !== 'string') {
            errors.push(
              `Game "${gameId}": phase "${name}" ${path}.id is required (a short identifier like "originality").`
            );
          } else if (seenIds.has(s.id)) {
            errors.push(
              `Game "${gameId}": phase "${name}" ${path}.id "${s.id}" appears more than once. Scale ids must be unique.`
            );
          } else {
            seenIds.add(s.id);
          }
          if (!s.label || typeof s.label !== 'string') {
            errors.push(
              `Game "${gameId}": phase "${name}" ${path}.label is required (e.g. "Originality").`
            );
          }
          const min = s.min == null ? 1 : s.min;
          const max = s.max == null ? 5 : s.max;
          if (!Number.isInteger(min) || !Number.isInteger(max)) {
            errors.push(
              `Game "${gameId}": phase "${name}" ${path}.min and ${path}.max must be integers.`
            );
          } else if (min >= max) {
            errors.push(
              `Game "${gameId}": phase "${name}" ${path}: min (${min}) must be less than max (${max}).`
            );
          } else if (max - min > 10) {
            warnings.push(
              `Game "${gameId}": phase "${name}" ${path}: a range of ${max - min + 1} points is hard to use on a phone. Consider 5 or 7 points.`
            );
          }
        }
      }
    }

    // Match phase: pairs array shape (left/right, unique, ≥2 usable).
    if (phase.type === 'match') {
      const rawPairs = Array.isArray(phase.pairs) ? phase.pairs : [];
      const usable = rawPairs.filter(p =>
        p && typeof p === 'object' && !Array.isArray(p) &&
        String(p.left ?? '').trim() && String(p.right ?? '').trim()
      );
      if (usable.length < 2) {
        errors.push(
          `Game "${gameId}": phase "${name}" (match) needs at least 2 complete pairs (each with a left and a right item).`
        );
      } else {
        // Duplicate texts make the board ambiguous: two identical right
        // items can't be told apart when dragged, so one always scores wrong.
        const seenLeft = new Set(), seenRight = new Set();
        for (const p of usable) {
          const left = String(p.left).trim(), right = String(p.right).trim();
          if (seenLeft.has(left)) {
            errors.push(
              `Game "${gameId}": phase "${name}" (match) has "${left}" on the left side twice. Each left item must be unique.`
            );
          }
          if (seenRight.has(right)) {
            errors.push(
              `Game "${gameId}": phase "${name}" (match) has "${right}" on the right side twice. Each right item must be unique.`
            );
          }
          seenLeft.add(left);
          seenRight.add(right);
        }
        if (usable.length > 8) {
          warnings.push(
            `Game "${gameId}": phase "${name}" (match) has ${usable.length} pairs — that's a lot of dragging on a phone. Consider 8 or fewer.`
          );
        }
      }
    }

    // Drawing input: incompatible with multi-field; AI can't read drawings.
    if (phase.type === 'collect' && phase.inputType === 'drawing') {
      if (Array.isArray(phase.fields) && phase.fields.length > 0) {
        errors.push(
          `Game "${gameId}": phase "${name}" (collect) can't combine a drawing pad with multi-field inputs — pick one.`
        );
      }
      // Any AI step reading this phase's responses will see "[drawing]"
      // placeholders, not the pictures.
      for (const [otherName, other] of Object.entries(config.phases)) {
        if (!other || (other.type !== 'ai-process' && other.type !== 'ai-eliminate')) continue;
        const ref = other.input || other.data;
        if (typeof ref === 'string' && ref.split('.')[0] === name) {
          warnings.push(
            `Game "${gameId}": phase "${otherName}" sends "${name}"'s responses to the AI, but they're drawings — the AI can't see pictures, only "[drawing]" placeholders.`
          );
        }
      }
    }

    // Sort phase: buckets (2-5 unique names) + items (all-or-none correct buckets).
    if (phase.type === 'sort') {
      const buckets = (Array.isArray(phase.buckets) ? phase.buckets : [])
        .map(b => String(b ?? '').trim()).filter(Boolean);
      if (buckets.length < 2) {
        errors.push(
          `Game "${gameId}": phase "${name}" (sort) needs at least 2 buckets to sort into.`
        );
      } else {
        if (new Set(buckets).size !== buckets.length) {
          errors.push(
            `Game "${gameId}": phase "${name}" (sort) has duplicate bucket names. Each bucket must be unique.`
          );
        }
        if (buckets.length > 5) {
          warnings.push(
            `Game "${gameId}": phase "${name}" (sort) has ${buckets.length} buckets — more than 5 is cramped on a phone.`
          );
        }
      }

      const rawItems = Array.isArray(phase.items) ? phase.items : [];
      const usable = rawItems.filter(it =>
        it && typeof it === 'object' && !Array.isArray(it) && String(it.text ?? '').trim()
      );
      if (usable.length < 2) {
        errors.push(
          `Game "${gameId}": phase "${name}" (sort) needs at least 2 items to sort.`
        );
      } else {
        // Graded is all-or-nothing: a half-scored round confuses everyone.
        const withBucket = usable.filter(it => String(it.bucket ?? '').trim());
        if (withBucket.length > 0 && withBucket.length < usable.length) {
          errors.push(
            `Game "${gameId}": phase "${name}" (sort) has correct buckets on some items but not all. Fill every item's correct bucket (scored round) or none (consensus poll).`
          );
        }
        for (const it of withBucket) {
          const b = String(it.bucket).trim();
          if (buckets.length >= 2 && !buckets.includes(b)) {
            errors.push(
              `Game "${gameId}": phase "${name}" (sort) item "${String(it.text).trim().slice(0, 40)}" has correct bucket "${b}", which isn't one of the buckets.`
            );
          }
        }
        if (usable.length > 10) {
          warnings.push(
            `Game "${gameId}": phase "${name}" (sort) has ${usable.length} items — that's a lot of tapping. Consider 10 or fewer.`
          );
        }
      }
    }

    // Team-split: sizing comes from teamCount OR groupSize — exactly one.
    if (phase.type === 'team-split') {
      const hasCount = phase.teamCount != null;
      const hasSize = phase.groupSize != null;
      if (!hasCount && !hasSize) {
        errors.push(
          `Game "${gameId}": phase "${name}" (team-split) needs either "Number of teams" or "Group size".`
        );
      } else if (hasCount && hasSize) {
        errors.push(
          `Game "${gameId}": phase "${name}" (team-split) has BOTH "Number of teams" and "Group size" — pick one.`
        );
      }
      // capacity:"open" only changes behavior when students pick (choice) or
      // the teacher arranges (display only) — automatic methods ignore it.
      if (phase.capacity === 'open' && phase.method !== 'choice' && phase.method !== 'teacher') {
        warnings.push(
          `Game "${gameId}": phase "${name}" (team-split) sets Team spots to "open", but method "${phase.method || 'random'}" assigns players automatically — the setting only matters for "choice" (students pick) and will be ignored here.`
        );
      }
    }

    // Data reference validation — check that referenced phase exists.
    // Literal lists are allowed in these fields too ("Mr. Fox, Dr. Who" or a
    // JSON array) — a real ref is a single dotted token, so anything with
    // spaces or commas is literal content, not a reference.
    for (const field of DATA_REF_FIELDS) {
      if (phase[field] && typeof phase[field] === 'string' && phase[field].includes('.')) {
        if (/[\s,]/.test(phase[field])) continue;
        const refPhaseId = phase[field].split('.')[0];
        if (!config.phases[refPhaseId]) {
          errors.push(
            `Game "${gameId}": phase "${name}" references "${phase[field]}" but phase "${refPhaseId}" does not exist`
          );
        }
      }
    }

    // vote with literal (teacher-typed) options + branching map checks
    if (phase.type === 'vote') {
      if (Array.isArray(phase.candidates)) {
        const voteOpts = phase.candidates.filter(c => typeof c === 'string' && c.trim().length > 0);
        if (voteOpts.length < 2) {
          errors.push(
            `Game "${gameId}": phase "${name}" (vote) needs at least 2 options to vote on — add more options to the list, or point it at an earlier step.`
          );
        }
      }
      if (phase.nextByWinner !== undefined) {
        if (phase.nextByWinner === null || typeof phase.nextByWinner !== 'object' || Array.isArray(phase.nextByWinner)) {
          errors.push(
            `Game "${gameId}": phase "${name}" nextByWinner must be an object mapping an option's text to a phase id, e.g. {"Enter the cave": "cave-intro"}.`
          );
        } else {
          for (const [optText, target] of Object.entries(phase.nextByWinner)) {
            if (typeof target !== 'string' || !config.phases[target]) {
              errors.push(
                `Game "${gameId}": phase "${name}" has nextByWinner target "${target}" (for option "${optText}") which does not exist`
              );
            }
            if (Array.isArray(phase.candidates)) {
              const opts = phase.candidates.map(c => String(c).trim());
              if (!opts.includes(optText)) {
                warnings.push(
                  `Game "${gameId}": phase "${name}" nextByWinner key "${optText}" doesn't match any option in the candidates list, so that branch can never fire. Keys must match option text exactly.`
                );
              }
            }
          }
          if (!Array.isArray(phase.candidates)) {
            warnings.push(
              `Game "${gameId}": phase "${name}" uses nextByWinner with candidates from an earlier step — branch keys must match the winning answer's exact text, which you can't know in advance. A fixed option list is recommended for branching votes.`
            );
          }
        }
      }
    }

    // rank with a literal (teacher-typed) item list: need at least 2 real items
    if (phase.type === 'rank' && Array.isArray(phase.candidates)) {
      const rankItems = phase.candidates.filter(c => typeof c === 'string' && c.trim().length > 0);
      if (rankItems.length < 2) {
        errors.push(
          `Game "${gameId}": phase "${name}" (rank) needs at least 2 items to rank — add more items to the list, or point it at an earlier step.`
        );
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
        // Sub-phase validation — schema-driven. A type is allowed inside
        // foreach iff its schema declares allowedIn: [..., 'foreach'].
        const allowedSubTypes = Object.keys(PHASE_SCHEMAS).filter(
          t => PHASE_SCHEMAS[t].allowedIn.includes('foreach')
        );
        for (const [subName, sub] of Object.entries(phase.subPhases)) {
          if (!sub.type) {
            errors.push(
              `Game "${gameId}": phase "${name}" subPhase "${subName}" is missing type`
            );
          } else if (!allowedSubTypes.includes(sub.type)) {
            errors.push(
              `Game "${gameId}": phase "${name}" subPhase "${subName}" has invalid type "${sub.type}". Sub-phases can only be: ${allowedSubTypes.join(', ')}.`
            );
          } else {
            const subFields  = schemaGetFields(sub.type, { context: 'foreach' });
            const subAllowed = schemaGetAllowedFieldNames(sub.type, { subPhase: true });
            // Required check
            for (const [fname, fdef] of Object.entries(subFields)) {
              if (!fdef.required) continue;
              if (sub[fname] === undefined || sub[fname] === null || sub[fname] === '') {
                errors.push(
                  `Game "${gameId}": phase "${name}" subPhase "${subName}" (${sub.type}) is missing required field "${fname}"`
                );
              }
            }
            // Allow-list check
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
      // pairMode value validation is now handled by the schema-driven
      // enum check above. We only need to enforce the cross-field rule
      // (pairMode requires aiInject).
      if (phase.pairMode && !phase.aiInject) {
        errors.push(
          `Game "${gameId}": phase "${name}" pairMode requires aiInject to generate AI items for pairing`
        );
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
        const validToggles = schemaGetHostToggles(phase.type);
        if (validToggles && validToggles.length) {
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
        const validToggles = schemaGetPlayerToggles(phase.type);
        if (validToggles && validToggles.length) {
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

    // rotateFrom reference + source-type validation. Source must produce a
    // per-player map (collect always does; ai-process only when perPlayer).
    if (phase.rotateFrom) {
      const src = config.phases[phase.rotateFrom];
      if (!src) {
        errors.push(
          `Game "${gameId}": phase "${name}" has rotateFrom "${phase.rotateFrom}" which does not exist`
        );
      } else {
        const supportsRotation =
          src.type === 'collect' ||
          src.type === 'collect-choice' ||
          (src.type === 'ai-process' && src.perPlayer === true);
        if (!supportsRotation) {
          errors.push(
            `Game "${gameId}": phase "${name}" rotateFrom "${phase.rotateFrom}" must point to a collect, collect-choice, or per-player ai-process step (got ${src.type})`
          );
        }
      }
    }

    // One Voice rules (Connection Pack §4.6).
    if (phase.type === 'one-voice') {
      if (phase.collisionWindowMs !== undefined && phase.collisionWindowMs !== null) {
        if (typeof phase.collisionWindowMs !== 'number' || phase.collisionWindowMs < 100) {
          errors.push(
            `Game "${gameId}": phase "${name}" (one-voice) has collisionWindowMs "${phase.collisionWindowMs}" — below 100ms the game is physically unwinnable. Use 100-1500.`
          );
        } else if (phase.collisionWindowMs > 1500) {
          warnings.push(
            `Game "${gameId}": phase "${name}" (one-voice) has collisionWindowMs ${phase.collisionWindowMs} — above 1500ms almost every tap collides. Consider 300-600.`
          );
        }
      }
      if (phase.target !== undefined && phase.target !== null) {
        if (typeof phase.target !== 'number' || phase.target < 2 || phase.target > 200) {
          errors.push(
            `Game "${gameId}": phase "${name}" (one-voice) has invalid target "${phase.target}". Must be a number between 2 and 200.`
          );
        }
      }
    }

    // Merge cross-field rules (Connection Pack §3.4/§3.5).
    if (phase.type === 'merge') {
      const seedPhaseId = typeof phase.seedFrom === 'string' ? phase.seedFrom.split('.')[0] : null;
      const seedSrc = seedPhaseId ? config.phases[seedPhaseId] : null;
      if (phase.groupSize === 4) {
        // Quads join an earlier merge's groups — the seeds must carry members.
        if (!seedSrc || seedSrc.type !== 'merge') {
          errors.push(
            `Game "${gameId}": phase "${name}" (merge) uses groupSize 4 but seedFrom "${phase.seedFrom}" must point to an earlier merge step's .merged output (quads join the previous pairs).`
          );
        } else if (!phaseAlwaysPrecedes(config, seedPhaseId, name)) {
          errors.push(
            `Game "${gameId}": phase "${name}" (merge) can be reached without going through "${seedPhaseId}" first — every path from the lobby to "${name}" must pass through it so the pair answers exist.`
          );
        }
      } else if (seedPhaseId && !phaseAlwaysPrecedes(config, seedPhaseId, name)) {
        errors.push(
          `Game "${gameId}": phase "${name}" (merge) can be reached without going through "${seedPhaseId}" first — every path from the lobby to "${name}" must pass through it so the answers to merge exist.`
        );
      }
      if (phase.agreeMode === 'timer' && !phase.timer) {
        warnings.push(
          `Game "${gameId}": phase "${name}" (merge) uses agreeMode "timer" but has no timer — only the teacher's Close Merging button will end the step. Add a timer or switch agreeMode.`
        );
      }
    }

    // Pair-scoped reveal: needs a pairwise collect, and that collect must run
    // before this reveal on EVERY path from the lobby (dominator check) —
    // otherwise the reveal can fire with no pairing data and blank screens.
    if (phase.type === 'reveal' && phase.scope === 'pair') {
      if (!phase.pairsFrom) {
        errors.push(
          `Game "${gameId}": phase "${name}" (reveal) uses scope:"pair" but is missing required field "pairsFrom"`
        );
      } else {
        const pairSrc = config.phases[phase.pairsFrom];
        if (!pairSrc) {
          errors.push(
            `Game "${gameId}": phase "${name}" has pairsFrom "${phase.pairsFrom}" which does not exist`
          );
        } else if (!(pairSrc.type === 'collect' && pairSrc.assign === 'pairwise')) {
          errors.push(
            `Game "${gameId}": phase "${name}" pairsFrom "${phase.pairsFrom}" must point to a collect step with assign:"pairwise" (got ${pairSrc.type}${pairSrc.type === 'collect' ? ' without pairwise' : ''})`
          );
        } else if (!phaseAlwaysPrecedes(config, phase.pairsFrom, name)) {
          errors.push(
            `Game "${gameId}": phase "${name}" (pair reveal) can be reached without going through "${phase.pairsFrom}" first — every path from the lobby to "${name}" must pass through "${phase.pairsFrom}" so the pairing data exists.`
          );
        }
      }
    }
  }

  // Connection-family enforcement — a connection game promises no winners,
  // scores, or eliminations. One rule, permanent guarantee.
  checkConnectionFamily(config, gameId, errors);

  // Class-period guard (spec §2.6): more than 12 pair-prompt rounds won't
  // fit a ~35-minute period. Warn, don't block.
  const pairRoundCount = Object.values(config.phases)
    .filter(p => p && p.type === 'collect' && p.assign === 'pairwise').length;
  if (pairRoundCount > 12) {
    warnings.push(
      `Game "${gameId}" has ${pairRoundCount} pair-prompt rounds. More than 12 rarely fits a class period — consider trimming prompts.`
    );
  }

  // Cycle detection — any cycle through next/approveNext/rejectNext (excluding
  // loopBack edges) is unintended. To repeat a section, use loopBack/loopCount.
  // Catches the common "phase Z.next points back to an earlier phase" mistake.
  detectCycles(config, gameId, errors);

  // Template scan — warn when a {{phaseId.field}} renders an array as a string
  // (which JS stringifies as "[object Object],[object Object]"). The fix is
  // to use the .list synthetic suffix.
  scanTemplatesForRawArrays(config, gameId, warnings);

  // Special-scope tokens used where they can't resolve (e.g. {{_current.x}}
  // outside foreach) — would render as raw code on student screens.
  scanSpecialScopesOutOfContext(config, gameId, warnings);

  // Typed-dataflow scan — for every dataRef field, check that the producer
  // phase's output type matches the consumer's `accepts` clause.
  scanDataRefTypeMismatches(config, gameId, warnings);

  // Per-phase semantic warnings (not blockers, but signal probable design holes).
  scanForDesignHoles(config, gameId, warnings);

  // Reachability — BFS from lobby. Any phase not visited is an orphan, almost
  // always a bug (e.g. winner with no `next` leaves `end` stranded so the game
  // freezes on the winner screen).
  detectUnreachablePhases(config, gameId, warnings);

  // Build structured diagnostics from the legacy string arrays. Codes are
  // inferred from message templates by inferDiagnosticCode() below — this
  // is a transitional bridge until each call site directly calls mkDiagnostic
  // (Phase #50 migration). Lets the side-by-side test compare diagnostic
  // codes across the old and new validators.
  const diagnostics = [
    ...errors.map(msg => mkDiagnostic({
      severity: 'error',
      code: inferDiagnosticCode(msg, 'error'),
      message: msg,
      source: 'validator'
    })),
    ...warnings.map(msg => mkDiagnostic({
      severity: 'warning',
      code: inferDiagnosticCode(msg, 'warning'),
      message: msg,
      source: 'validator'
    }))
  ];

  if (returnResults) {
    return { errors, warnings, diagnostics };
  }

  // Throw first error for backward compatibility
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
}

// Maps an existing error/warning message string to its DIAGNOSTIC_CODES
// constant. Pattern-based; runs at the end of validate() so existing
// `errors.push(string)` call sites don't have to change.
//
// As migration to direct mkDiagnostic() calls progresses (Phase #50),
// this function shrinks: each direct call site removes one row here.
// Patterns are ordered from most-specific to least-specific.
function inferDiagnosticCode(msg, severity) {
  // Game-level structural
  if (/missing a lobby phase/.test(msg)) return DIAGNOSTIC_CODES.MISSING_LOBBY;
  if (/missing an end phase/.test(msg)) return DIAGNOSTIC_CODES.MISSING_END;

  // Reachability + cycles
  if (/unreachable from the lobby/.test(msg)) return DIAGNOSTIC_CODES.UNREACHABLE_PHASE;
  if (/creates a loop/.test(msg)) return DIAGNOSTIC_CODES.CYCLE_DETECTED;

  // Template / typed dataflow
  if (/will display as "\[object Object\]/.test(msg)) return DIAGNOSTIC_CODES.RAW_ARRAY_IN_TEMPLATE;
  if (/produces .+ but the field needs/.test(msg)) return DIAGNOSTIC_CODES.DATA_REF_TYPE_MISMATCH;
  if (/students will see the raw code on screen/.test(msg)) return DIAGNOSTIC_CODES.SPECIAL_SCOPE_OUT_OF_CONTEXT;

  // Design-hole warnings
  if (/no "scoresFrom" and no "correctOption"/.test(msg)) return DIAGNOSTIC_CODES.WAGER_NO_RESOLUTION_BASIS;
  if (/no later template references team data/.test(msg)) return DIAGNOSTIC_CODES.TEAM_SPLIT_UNUSED;

  // Connection pack
  if (/not allowed in a connection-family game/.test(msg)) return DIAGNOSTIC_CODES.CONNECTION_FAMILY_VIOLATION;
  if (/has invalid family value/.test(msg)) return DIAGNOSTIC_CODES.INVALID_ENUM_VALUE;
  if (/can be reached without going through/.test(msg)) return DIAGNOSTIC_CODES.PAIR_SOURCE_NOT_ON_ALL_PATHS;
  if (/has (pairsFrom|rotatePairsFrom|reusePairsFrom) ".+" which does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_PHASE_REF;
  if (/(pairsFrom|rotatePairsFrom|reusePairsFrom) ".+" must point to/.test(msg)) return DIAGNOSTIC_CODES.DATA_REF_TYPE_MISMATCH;
  if (/sets both "rotatePairsFrom" and "reusePairsFrom"/.test(msg)) return DIAGNOSTIC_CODES.INVALID_FIELD_TYPE;
  if (/must point to an earlier merge step/.test(msg)) return DIAGNOSTIC_CODES.DATA_REF_TYPE_MISMATCH;
  if (/agreeMode "timer" but has no timer/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/collisionWindowMs/.test(msg)) return DIAGNOSTIC_CODES.INVALID_INTEGER_RANGE;
  if (/has invalid target/.test(msg)) return DIAGNOSTIC_CODES.INVALID_INTEGER_RANGE;
  if (/needs at least 2 items to rank/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/needs at least 2 options to vote/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/has nextByWinner target/.test(msg)) return DIAGNOSTIC_CODES.MISSING_PHASE_REF;
  if (/nextByWinner/.test(msg)) return DIAGNOSTIC_CODES.INVALID_FIELD_TYPE;
  if (/but assign is not "pairwise"/.test(msg)) return DIAGNOSTIC_CODES.INVALID_FIELD_TYPE;
  if (/pair-prompt rounds/.test(msg)) return DIAGNOSTIC_CODES.INVALID_INTEGER_RANGE;
  if (/oddHandling:"triple"/.test(msg)) return DIAGNOSTIC_CODES.DATA_REF_TYPE_MISMATCH;

  // Phase type
  if (/has invalid type "/.test(msg)) return DIAGNOSTIC_CODES.UNKNOWN_PHASE_TYPE;
  if (/subPhase ".+" has invalid type/.test(msg)) return DIAGNOSTIC_CODES.UNKNOWN_PHASE_TYPE;

  // References — phase refs vs data refs
  if (/has next ".+" which does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_PHASE_REF;
  if (/has approveNext ".+" which does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_PHASE_REF;
  if (/has rejectNext ".+" which does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_PHASE_REF;
  if (/has loopBack ".+" which does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_PHASE_REF;
  if (/has rotateFrom ".+" which does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_PHASE_REF;
  if (/rotateFrom ".+" must point to/.test(msg)) return DIAGNOSTIC_CODES.DATA_REF_TYPE_MISMATCH;
  if (/references data ".+" but phase ".+" does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_DATA_REF;
  if (/references ".+" but phase ".+" does not exist/.test(msg)) return DIAGNOSTIC_CODES.MISSING_DATA_REF;

  // Field-shape problems
  if (/has unknown field/.test(msg)) return DIAGNOSTIC_CODES.UNKNOWN_FIELD;
  if (/(must be a string|must be an array|must be an object|aiInject must be an object)/.test(msg)) {
    return DIAGNOSTIC_CODES.INVALID_FIELD_TYPE;
  }
  if (/has invalid (timer|teamCount|minBet|maxBetPercent|loopCount|aiInject\.count)/.test(msg)) {
    return DIAGNOSTIC_CODES.INVALID_INTEGER_RANGE;
  }
  if (/uses bottom-percent but has invalid percent/.test(msg)) return DIAGNOSTIC_CODES.INVALID_INTEGER_RANGE;
  if (/has invalid (hostShow|playerShow) toggle/.test(msg)) return DIAGNOSTIC_CODES.INVALID_ENUM_VALUE;
  if (/has invalid \w+ value/.test(msg)) return DIAGNOSTIC_CODES.INVALID_ENUM_VALUE;
  if (/pairMode must be/.test(msg)) return DIAGNOSTIC_CODES.INVALID_ENUM_VALUE;

  // Required-field family (broadest — keep last among the missing-X group)
  if (/missing required field/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/is missing (hook name|loopCount|"next"|"correctAnswer"|"subPhase"|type|"pointMap")/.test(msg)) {
    return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  }
  if (/aiInject\.instruction is required/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/pairMode requires aiInject/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/must have either "content" or "template"/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/has empty subPhases/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;
  if (/has no phases defined/.test(msg)) return DIAGNOSTIC_CODES.MISSING_REQUIRED_FIELD;

  // Fallback — shouldn't fire if patterns above are exhaustive.
  return severity === 'error' ? 'LEGACY_STRING_ERROR' : 'LEGACY_STRING_WARNING';
}

// Phase types and options forbidden inside a connection-family game
// (docs/connection-pack-spec.md §6.4). The spec names leaderboard / winner /
// eliminate / wager / speedBonus; ai-eliminate is included because it
// eliminates players, and correctAnswer / foreach scoring because they
// produce scores — same promise, same rule.
const CONNECTION_FORBIDDEN_TYPES = new Set([
  'leaderboard', 'winner', 'eliminate', 'ai-eliminate', 'wager',
  // Point-awarding phases — connection games promise no winners or points
  'buzz', 'estimate'
]);

// Validate the config-level "family" flag. Currently the only family is
// "connection": no phase in the game may declare a winner, score players,
// or eliminate anyone.
function checkConnectionFamily(config, gameId, errors) {
  if (config.family === undefined || config.family === null) return;
  if (config.family !== 'connection') {
    errors.push(
      `Game "${gameId}" has invalid family value "${config.family}". Valid values: connection`
    );
    return;
  }

  const checkPhase = (label, phase) => {
    if (CONNECTION_FORBIDDEN_TYPES.has(phase.type)) {
      errors.push(
        `Game "${gameId}": ${label} (${phase.type}) is not allowed in a connection-family game — these games promise no winners, points, or eliminations. Remove this step or remove the "family" flag.`
      );
    }
    if (phase.type === 'collect-choice' && (phase.correctAnswer || phase.speedBonus === true)) {
      errors.push(
        `Game "${gameId}": ${label} uses graded scoring (correctAnswer/speedBonus), which is not allowed in a connection-family game.`
      );
    }
  };

  for (const [name, phase] of Object.entries(config.phases || {})) {
    if (!phase || typeof phase !== 'object') continue;
    checkPhase(`phase "${name}"`, phase);
    if (phase.type === 'foreach') {
      if (phase.scoring) {
        errors.push(
          `Game "${gameId}": phase "${name}" (foreach) uses scoring, which is not allowed in a connection-family game.`
        );
      }
      for (const [subName, sub] of Object.entries(phase.subPhases || {})) {
        if (!sub || typeof sub !== 'object') continue;
        checkPhase(`phase "${name}" subPhase "${subName}"`, sub);
      }
    }
  }
}

// True if every path from the lobby to targetId passes through requiredId.
// Standard dominator check via reachability: remove requiredId from the
// graph; if targetId is still reachable from the lobby, some path skips it.
// If targetId isn't reachable at all, returns true — the unreachable-phase
// warning covers that case separately.
function phaseAlwaysPrecedes(config, requiredId, targetId) {
  const phases = config.phases;
  const lobby = Object.keys(phases).find(n => phases[n].type === 'lobby');
  if (!lobby) return true; // missing-lobby error covers it
  if (lobby === targetId || requiredId === targetId) return false;

  const reachableSkipping = (skip) => {
    const seen = new Set();
    const queue = [lobby];
    while (queue.length) {
      const cur = queue.shift();
      if (seen.has(cur) || cur === skip) continue;
      seen.add(cur);
      const p = phases[cur];
      if (!p) continue;
      for (const f of ['next', 'approveNext', 'rejectNext', 'loopBack']) {
        if (p[f] && phases[p[f]] && !seen.has(p[f])) queue.push(p[f]);
      }
      // Branching votes: nextByWinner values are edges too
      if (p.nextByWinner && typeof p.nextByWinner === 'object') {
        for (const target of Object.values(p.nextByWinner)) {
          if (typeof target === 'string' && phases[target] && !seen.has(target)) queue.push(target);
        }
      }
    }
    return seen;
  };

  if (!reachableSkipping(null).has(targetId)) return true;
  return !reachableSkipping(requiredId).has(targetId);
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
      // Branching votes go FORWARD — a backward branch is a cycle bug
      // (use loopBack to repeat a section).
      if (phase.nextByWinner && typeof phase.nextByWinner === 'object') {
        for (const target of Object.values(phase.nextByWinner)) {
          if (typeof target === 'string') edges.push(['nextByWinner', target]);
        }
      }
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

// Phase fields that hold templates the engine resolves at runtime.
const TEMPLATE_FIELDS = ['template', 'content', 'message', 'prompt', 'instruction', 'itemTemplate', 'hostTemplate', 'playerTemplate'];

// BFS from lobby across next/approveNext/rejectNext/loopBack edges. Any phase
// not reached is an orphan — usually means an earlier phase is missing a `next`.
function detectUnreachablePhases(config, gameId, warnings) {
  const phaseNames = Object.keys(config.phases);
  const lobby = phaseNames.find(n => config.phases[n].type === 'lobby');
  if (!lobby) return;

  const reached = new Set();
  const queue = [lobby];
  while (queue.length) {
    const cur = queue.shift();
    if (reached.has(cur)) continue;
    reached.add(cur);
    const p = config.phases[cur];
    if (!p) continue;
    for (const f of ['next', 'approveNext', 'rejectNext', 'loopBack']) {
      if (p[f] && config.phases[p[f]] && !reached.has(p[f])) queue.push(p[f]);
    }
    // Branching votes: nextByWinner values are edges too
    if (p.nextByWinner && typeof p.nextByWinner === 'object') {
      for (const target of Object.values(p.nextByWinner)) {
        if (typeof target === 'string' && config.phases[target] && !reached.has(target)) queue.push(target);
      }
    }
  }

  for (const name of phaseNames) {
    if (!reached.has(name)) {
      warnings.push(
        `Game "${gameId}": phase "${name}" is unreachable from the lobby. Add a "next" pointing to it from another phase, or remove it.`
      );
    }
  }
}

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
      // Look for any reference to team data downstream — either in a template
      // ({{team*}}), or as a `teamsFrom` field on a later phase (e.g. turn).
      const referencedInTemplate = /\{\{[^}]*team[^}]*\}\}/i.test(allTemplatesJoined);
      const referencedByField = Object.values(config.phases).some(p => p.teamsFrom === name);
      if (!referencedInTemplate && !referencedByField) {
        warnings.push(
          `Game "${gameId}": phase "${name}" (team-split) creates teams, but no later template references team data. The split is wasted setup. Either reference team info in a later message (e.g. "Team {{${name}.teams}}") or remove this phase.`
        );
      }
    }
  }
}

// Schema-driven typed-dataflow scan. For every dataRef field declared on a
// phase (via PHASE_SCHEMAS), look up what the producer phase's output type
// is and check that it satisfies the consumer's `accepts` clause. Surfaces
// silent type drift (e.g. wiring a `scoreMap` consumer to a phase whose
// output is an `array`) as a warning.
function scanDataRefTypeMismatches(config, gameId, warnings) {
  for (const [name, phase] of Object.entries(config.phases)) {
    const fields = schemaGetFields(phase.type);
    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      if (fieldDef.type !== 'dataRef') continue;
      if (!fieldDef.accepts) continue;
      const value = phase[fieldName];
      if (typeof value !== 'string' || !value.includes('.')) continue;
      const parsed = parseRef(value);
      const compat = checkDataRefCompat(parsed, fieldDef.accepts, config.phases);
      if (compat) {
        warnings.push(
          `Game "${gameId}": phase "${name}" field "${fieldName}" — ${compat.message}`
        );
      }
    }
  }
}

// Schema-driven raw-array scan. For every {{...}} token in template fields,
// parse it through resolver-grammar and ask classifyRef whether the producing
// phase declares a typed output that needs a renderer. If yes and the token
// has no suffix, flag it.
//
// Replaces the old hardcoded KNOWN_ARRAY_FIELDS list — typing now flows from
// phase-schemas.js so adding a new array output to a schema automatically
// participates without editing this function.
// Special-scope tokens (_current/_foreach/_candidates/_pair) only resolve in
// specific contexts. Outside them, the engine leaves the {{token}} unresolved
// and students see raw code on their screens — the worst kind of leak. The
// feedback-coach-academy game shipped this exact bug: {{_current.critique}} in
// a reveal-one message (resolved once at phase start, no per-item scope).
//
// Valid contexts:
//   _current / _foreach / _candidates — inside foreach subPhases
//   _current                          — also reveal-one's itemTemplate (per-item)
//   _pair                             — reveal phases with scope: "pair"
function scanSpecialScopesOutOfContext(config, gameId, warnings) {
  const FOREACH_KINDS = { foreachItem: '_current', foreachScope: '_foreach', foreachCandidates: '_candidates' };
  for (const [name, phase] of Object.entries(config.phases)) {
    if (phase.type === 'foreach') continue; // subPhases are the valid context
    for (const field of TEMPLATE_FIELDS) {
      const tpl = phase[field];
      if (!tpl || typeof tpl !== 'string') continue;
      for (const tok of parseTemplateTokens(tpl)) {
        const parsed = parseRef(tok.ref);
        const scope = FOREACH_KINDS[parsed.kind];
        if (scope) {
          if (scope === '_current' && phase.type === 'reveal-one' && field === 'itemTemplate') continue;
          const hint = phase.type === 'reveal-one'
            ? ` Per-item values belong in "itemTemplate", not "${field}".`
            : ` ${scope} only works inside a foreach step's sub-steps.`;
          warnings.push(
            `Game "${gameId}": phase "${name}" ${field} contains "{{${tok.ref}}}" — ${scope} doesn't exist here, so students will see the raw code on screen.${hint}`
          );
        }
        if (parsed.kind === 'pairScope' && !(phase.type === 'reveal' && phase.scope === 'pair')) {
          warnings.push(
            `Game "${gameId}": phase "${name}" ${field} contains "{{${tok.ref}}}" — _pair only works on a reveal step with scope "pair", so students will see the raw code on screen.`
          );
        }
      }
    }
  }
}

function scanTemplatesForRawArrays(config, gameId, warnings) {
  for (const [name, phase] of Object.entries(config.phases)) {
    for (const field of TEMPLATE_FIELDS) {
      const tpl = phase[field];
      if (!tpl || typeof tpl !== 'string') continue;
      const tokens = parseTemplateTokens(tpl);
      for (const tok of tokens) {
        const parsed = parseRef(tok.ref);
        // Only direct phase.field refs. Skip:
        //   - builtin / orchestration scopes (handled elsewhere)
        //   - bare suffix forms ({{vote.barChart}} — already renderable)
        //   - deeper paths ({{X.responses.0}}, {{X.result.0.scenario}}) —
        //     engine resolves nested access; not a string-render hazard.
        if (parsed.kind !== 'phaseField') continue;
        if (parsed.segments.length !== 2) continue;
        const classified = classifyRef(parsed, config.phases);
        if (classified.problem && classified.problem.code === 'RAW_ARRAY_IN_TEMPLATE') {
          const phaseId = parsed.segments[0];
          const leaf = parsed.segments[1];
          warnings.push(
            `Game "${gameId}": phase "${name}" template ${field} contains "{{${phaseId}.${leaf}}}" — "${leaf}" is a list and will display as "[object Object],...". Add ".list" to format it (e.g. {{${phaseId}.${leaf}.list}}).`
          );
        }
      }
    }
  }
}
