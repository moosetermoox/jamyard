/**
 * The hot seat's plan (2026-10-01, the owner after trying it: "a lot to
 * send everyone's question to one student ... then the hot seat changes";
 * "the question should go to the person in the hot seat and also be
 * displayed on the projector"). The class's questions are collected once;
 * a reveal-one with `to` hands them out one at a time, and with
 * `rotateEvery: N` the seat moves to the next student every N questions.
 *
 * Seat order: the first seat (`to`), then the students a vote over the
 * students ranked (most votes first, `seatOrderFrom`), then everyone else
 * in a random order; it wraps when there are more turns than students.
 * Nobody is handed their own question when a swap can avoid it.
 *
 * Pure: items and ids in, a plan out. No engine, no sockets.
 */

function shuffled(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const authorOf = (item) => (item && typeof item === 'object' && item.playerId) || null;

/**
 * @param {object} o
 * @param {Array} o.items            the questions (objects keep playerId)
 * @param {Array<{id,name}>} o.players
 * @param {string|null} o.firstId    the first seat (`to` resolved), or null
 * @param {number|null} o.rotateEvery questions per seat; null = one seat throughout
 * @param {string[]} [o.ranked]      student ids most-voted first (seatOrderFrom)
 * @param {Function} [o.rand]
 * @returns {{ items: Array, seats: Array<{id,name}>, turns: Array<{turn: number, of: number}> }}
 *   items reordered, seats[i] = who answers item i, turns[i] = its place in that seat's run
 */
export function planHotSeat({ items, players, firstId = null, rotateEvery = null, ranked = [], rand = Math.random }) {
  const list = Array.isArray(items) ? items.slice() : [];
  const people = (players || []).filter(p => p && p.id);
  const byId = new Map(people.map(p => [p.id, p]));
  if (list.length === 0 || people.length === 0) return { items: list, seats: [], turns: [] };

  // The order the seat moves in
  const order = [];
  const add = (id) => { if (byId.has(id) && !order.includes(id)) order.push(id); };
  if (firstId) add(firstId);
  (ranked || []).forEach(add);
  shuffled(people.map(p => p.id).filter(id => !order.includes(id)), rand).forEach(add);

  const every = Number.isInteger(rotateEvery) && rotateEvery > 0 ? rotateEvery : null;
  // One seat throughout: that student's own question is left out
  let work = list;
  if (!every) work = list.filter(it => authorOf(it) !== order[0]);
  const seatAt = (k) => order[every ? Math.floor(k / every) % order.length : 0];

  // Nobody answers their own question when a swap can avoid it
  for (let k = 0; k < work.length; k++) {
    if (authorOf(work[k]) !== seatAt(k)) continue;
    for (let j = 0; j < work.length; j++) {
      if (j === k) continue;
      if (authorOf(work[j]) !== seatAt(k) && authorOf(work[k]) !== seatAt(j)) {
        [work[k], work[j]] = [work[j], work[k]];
        break;
      }
    }
  }

  const seats = work.map((_, k) => byId.get(seatAt(k)));
  const turns = work.map((_, k) => {
    if (!every) return { turn: k + 1, of: work.length };
    const start = Math.floor(k / every) * every;
    return { turn: k - start + 1, of: Math.min(every, work.length - start) };
  });
  return { items: work, seats, turns };
}

/** Student ids from a vote's scores, most votes first (ties in a random order). */
export function rankedFromScores(scores, rand = Math.random) {
  const entries = Object.entries(scores || {}).filter(([, n]) => Number(n) > 0);
  return shuffled(entries, rand).sort((a, b) => Number(b[1]) - Number(a[1])).map(([id]) => id);
}
