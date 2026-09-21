/**
 * Handles the "winner" phase type.
 *
 * Determines the winner from a scores object and builds full standings.
 * Ties are broken alphabetically by playerId (deterministic).
 */

/**
 * Trace the data ref holding the submissions the winner's score judged, so
 * the crown can show WHAT they won for. An explicit `entryFrom` on the
 * winner phase wins; otherwise, when the score source is a vote phase, its
 * `candidates` ref points at the responses. Literal candidate lists (arrays
 * or comma strings) carry no playerIds, so they can't be traced.
 * @param {Object} phase - the winner phase config
 * @param {Object} phases - the config's phase map
 * @returns {string|null} a data ref like "ideas.responses", or null
 */
export function traceEntryRef(phase, phases) {
  if (typeof phase.entryFrom === 'string' && phase.entryFrom) return phase.entryFrom;
  const from = typeof phase.from === 'string' ? phase.from : null;
  if (!from) return null;
  const dot = from.indexOf('.');
  if (dot <= 0) return null;
  const source = phases ? phases[from.slice(0, dot)] : null;
  if (!source || source.type !== 'vote') return null;
  const cand = source.candidates;
  // Refs are single dotted tokens — anything with spaces/commas is literal.
  if (typeof cand === 'string' && /^[\w-]+(\.[\w~-]+)+$/.test(cand)) return cand;
  return null;
}

/**
 * Pull each winner's own submission text from response records.
 * Drawings ('[drawing]' placeholder) and blank/missing entries are skipped —
 * an entry only shows when there is real text to show.
 * @param {string[]} winnerIds
 * @param {Array} records - [{ playerId, name, text }]
 * @returns {Array<{ playerId: string, name: string, text: string }>}
 */
export function findWinnerEntries(winnerIds, records) {
  if (!Array.isArray(winnerIds) || !Array.isArray(records)) return [];
  const out = [];
  for (const id of winnerIds) {
    const rec = records.find(r => r && typeof r === 'object' && r.playerId === id);
    if (!rec) continue;
    // A drawing entry (the vote over drawings, 2026-09-20): the strokes
    // ride to the projector, the "[drawing]" placeholder never does.
    if (Array.isArray(rec.drawing) && rec.drawing.length > 0) {
      out.push({ playerId: id, name: rec.name, text: '', drawing: rec.drawing });
      continue;
    }
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    if (!text || text === '[drawing]') continue;
    out.push({ playerId: id, name: rec.name, text });
  }
  return out;
}

/**
 * Determine winner and build standings from scores.
 * @param {Object} scores - { playerId: voteCount }
 * @param {any} players - PlayerRegistry for name lookup
 * @returns {{ winnerId: string|null, winnerName: string|null, winnerScore: number, winnerIds: string[], winnerNames: string[], isTie: boolean, standings: Array }}
 */
export function determineWinner(scores, players) {
  const entries = Object.entries(scores);

  const standings = entries
    .map(([playerId, score]) => {
      const player = players.find(playerId);
      return { playerId, name: player ? player.name : playerId, score };
    })
    .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));

  if (standings.length === 0) {
    return { winnerId: null, winnerName: null, winnerScore: 0, winnerIds: [], winnerNames: [], isTie: false, standings: [] };
  }

  const winner = standings[0];
  const tiedWinners = standings.filter(s => s.score === winner.score);
  return {
    winnerId: winner.playerId,
    winnerName: winner.name,
    winnerScore: winner.score,
    winnerIds: tiedWinners.map(w => w.playerId),
    winnerNames: tiedWinners.map(w => w.name),
    isTie: tiedWinners.length > 1,
    standings
  };
}
