/**
 * Spotlight: the teacher puts ONE student's finished work on the projector.
 *
 * The console sends only an id; this module reads the words (or the
 * strokes) out of the room's own data, so a console can never put text of
 * its own on the class screen. Two sources today:
 *
 *   - a return-to-author reveal (scope "own"): the finished chain that
 *     student started (engine/phases/chain-reveal.js stores one row per
 *     starter as the reveal's `responses`);
 *   - an open collect or collect-choice step: that student's answer as it
 *     stands (hidden entries and passes are never shown).
 *
 * An outside reviewer built a water-cycle chain and the class never saw a
 * single chain on the projector (2026-09-25); this is the missing move.
 *
 * Pure: engine-shaped data in, a payload (or null) out.
 */
import { isVisibleSubmission, isDrawingResponseValue, responseToText } from './moderation.js';

const OWN_REVEAL = (phase) => phase && phase.type === 'reveal' && phase.scope === 'own';
const OPEN_ANSWER = (phase) => phase && (phase.type === 'collect' || phase.type === 'collect-choice');

/**
 * The finished chains of the current step, for the console's list.
 * @returns {Array<{playerId: string, name: string, text: string}>|null}
 *   null when the step has no chains to list.
 */
export function chainsFor(engine, phase) {
  if (!OWN_REVEAL(phase)) return null;
  const data = engine.phaseData && engine.phaseData[phase.id];
  if (!data || !Array.isArray(data.responses)) return null;
  return data.responses.map(r => ({ playerId: r.playerId, name: r.name, text: r.text }));
}

/**
 * What the projector should show for one student at the current step.
 * @returns {{ text: string, name: string, drawing?: Array }|null}
 */
export function spotlightItemFor(engine, phase, playerId) {
  if (!engine || !phase || typeof playerId !== 'string' || playerId === '') return null;

  if (OWN_REVEAL(phase)) {
    const rows = chainsFor(engine, phase) || [];
    const row = rows.find(r => r.playerId === playerId);
    return row ? { text: row.text, name: row.name } : null;
  }

  if (OPEN_ANSWER(phase)) {
    const player = engine.players && typeof engine.players.find === 'function' ? engine.players.find(playerId) : null;
    if (!player || !isVisibleSubmission(player)) return null;
    const r = player.response;
    if (isDrawingResponseValue(r)) return { text: '', name: player.name, drawing: r.strokes };
    const text = responseToText(r);
    return text.trim() === '' ? null : { text, name: player.name };
  }

  return null;
}
