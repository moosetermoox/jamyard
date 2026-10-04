/**
 * Per-recipient template resolution: the tokens whose value depends on
 * WHO is reading. Everything else goes through the engine's own resolver.
 *
 *   {{X.assigned}}     what a classmate handed this student (rotation, deal)
 *   {{X.mine}}         what this student wrote earlier at X
 *   {{X.partner}}      what this student's partner wrote at pairwise step X
 *                      (a triple: both partners, one after the other)
 *   {{X.side}}         the side this student was dealt at X (collect `sides`)
 *   {{X.partnerSide}}  the side across the table at X
 *
 * When there is nothing behind a per-recipient token (the source step
 * closed with nobody answering, so no rotation was dealt; the student
 * skipped the source step themselves; the partner passed) the prompt must
 * still read as a sentence. It used to reach the student with the raw
 * token in it ("look through the eyes of: {{viewpoints.assigned}}",
 * outside review 2026-09-12). Now it reads a plain line in the activity's
 * language. A missing side reads as nothing at all (the step dealt none).
 * Other unresolved refs are left as written, as before: those are the
 * teacher's to notice in the designer, not a per-student gap.
 */

import { translate } from './i18n/index.js';
import { PER_PLAYER_SUFFIXES } from './resolver-grammar.js';

export const MISSING_ASSIGNED = 'No answer came in yet. Pick your own.';
export const MISSING_MINE = 'You did not answer that one.';
export const MISSING_PARTNER = 'Your partner has not written anything yet.';

// The one list of per-player suffixes lives in resolver-grammar.js
// (PER_PLAYER_SUFFIXES); this module's regexes, its resolver per suffix
// (RESOLVERS), and the projector's placeholder per suffix
// (PROJECTOR_PLACEHOLDERS) are all keyed by it, and
// tests/engine/per-player-suffix.test.js fails when one falls behind.
const PER_PLAYER_SUFFIX = new RegExp('\\.(' + [...PER_PLAYER_SUFFIXES].join('|') + ')\\s*$');

/**
 * What the projector shows where a per-student token stands: it has no
 * recipient at that layer, so each student's own item is a blank (the make
 * page's print draws a token the same way; a note in our words read as an
 * internal remark on a reviewer's projector, 2026-09-24), a partner's
 * private piece never shows, and each student holds their own side.
 */
export const PROJECTOR_PLACEHOLDERS = Object.freeze({
  mine: '…',
  assigned: '…',
  partner: '…',
  partnerSide: 'the other side',
  side: 'their side',
  station: 'their group\'s own text'
});

/** The projector's stand-in for a ref ending in a per-player suffix, or null when it is not one. */
export function projectorPlaceholder(ref) {
  const m = PER_PLAYER_SUFFIX.exec(String(ref || ''));
  return m ? PROJECTOR_PLACEHOLDERS[m[1]] : null;
}

/**
 * The text a student's group gets on a step with stations (2026-09-30):
 * the step's "stations" list dealt in the order of the groups of its
 * "stationsFrom" team-split, wrapping around when there are more groups
 * than stations. No group yet = the first station.
 */
export function stationFor(engine, phaseId, playerId) {
  const phase = engine.config && engine.config.phases ? engine.config.phases[phaseId] : null;
  const stations = phase && Array.isArray(phase.stations) ? phase.stations.map(s => String(s == null ? '' : s)).filter(Boolean) : [];
  if (stations.length === 0) return '';
  const split = phase.stationsFrom ? engine.phaseData[phase.stationsFrom] : null;
  const teamName = split && split.playerTeam ? split.playerTeam[playerId] : undefined;
  const names = split && split.teams && typeof split.teams === 'object' ? Object.keys(split.teams) : [];
  const idx = teamName !== undefined ? names.indexOf(teamName) : -1;
  return stations[(idx < 0 ? 0 : idx) % stations.length];
}

/**
 * The other members of the student's group at a pairwise step, or null
 * when the step never paired them.
 */
function partnersAt(data, playerId) {
  if (!data || !Array.isArray(data.pairs)) return null;
  const group = data.pairs.find(p => Array.isArray(p.playerIds) && p.playerIds.includes(playerId));
  if (!group) return null;
  return group.playerIds.filter(id => id !== playerId);
}

/**
 * @param {string} template
 * @param {object} engine  a GameEngine (phaseData, resolve, language)
 * @param {string} playerId
 * @returns {string}
 */
/**
 * One resolver per per-player suffix: (engine, phaseId, playerId, lang)
 * to the text that student sees. Keyed by PER_PLAYER_SUFFIXES.
 */
export const RESOLVERS = Object.freeze({
  assigned(engine, phaseId, playerId, lang) {
    const data = engine.phaseData[phaseId];
    if (data && data.assigned && data.assigned[playerId] !== undefined) {
      return String(data.assigned[playerId]);
    }
    return translate(lang, MISSING_ASSIGNED);
  },
  mine(engine, phaseId, playerId, lang) {
    const data = engine.phaseData[phaseId];
    if (data && data.byPlayer && data.byPlayer[playerId] !== undefined) {
      return String(data.byPlayer[playerId]);
    }
    return translate(lang, MISSING_MINE);
  },
  partner(engine, phaseId, playerId, lang) {
    const data = engine.phaseData[phaseId];
    const partners = partnersAt(data, playerId);
    if (!partners) return translate(lang, MISSING_PARTNER);
    const byPlayer = data.byPlayer || {};
    const passed = new Set(data.passedIds || []);
    const texts = partners
      .filter(id => !passed.has(id))
      .map(id => byPlayer[id])
      .filter(t => t !== undefined && t !== null && String(t) !== '')
      .map(String);
    return texts.length ? texts.join('\n\n') : translate(lang, MISSING_PARTNER);
  },
  partnerSide(engine, phaseId, playerId) {
    const data = engine.phaseData[phaseId];
    const partners = partnersAt(data, playerId);
    if (!partners || !data.sides) return '';
    // A triple: the side the two partners share, else the odd one out.
    const own = data.sides[playerId];
    const other = partners.map(id => data.sides[id]).find(s => s !== undefined && s !== own);
    return other !== undefined ? String(other) : '';
  },
  side(engine, phaseId, playerId) {
    const data = engine.phaseData[phaseId];
    if (data && data.sides && data.sides[playerId] !== undefined) return String(data.sides[playerId]);
    return '';
  },
  station(engine, phaseId, playerId) {
    return stationFor(engine, phaseId, playerId);
  }
});

// {{ <phaseId>.<suffix> }} for every per-player suffix, in one pass
const PER_PLAYER_REF = new RegExp('\\{\\{\\s*([a-zA-Z0-9_-]+)\\.(' + [...PER_PLAYER_SUFFIXES].join('|') + ')\\s*\\}\\}', 'g');

export function resolvePerPlayerTemplate(template, engine, playerId) {
  if (!template) return '';
  const lang = engine.language || 'en';
  return template
    .replace(PER_PLAYER_REF, (match, phaseId, suffix) => {
      const resolver = RESOLVERS[suffix];
      return resolver ? resolver(engine, phaseId, playerId, lang) : match;
    })
    .replace(/\{\{([^}]+)\}\}/g, (match, ref) => {
      if (PER_PLAYER_SUFFIX.test(ref)) return match;
      const value = engine.resolve(ref.trim());
      return value !== undefined ? String(value) : match;
    });
}

/**
 * The partner's piece travels OUTSIDE the prompt (2026-09-20, the pairs
 * brick in a browser: a quoted opening in the same heavy prompt style read
 * like part of the instruction). Splits every {{X.partner}} token out of a
 * prompt: the prompt keeps its own words, and `partnerRefs` are the tokens
 * to resolve per recipient into a card of their own under the instruction.
 *
 * @param {string} template
 * @returns {{ prompt: string, partnerRefs: string[] }}
 */
export function splitPartnerTokens(template) {
  const text = typeof template === 'string' ? template : '';
  const partnerRefs = text.match(/\{\{\s*[a-zA-Z0-9_-]+\.partner\s*\}\}/g) || [];
  if (partnerRefs.length === 0) return { prompt: text, partnerRefs };
  const prompt = text
    .replace(/\{\{\s*[a-zA-Z0-9_-]+\.partner\s*\}\}/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { prompt, partnerRefs };
}
