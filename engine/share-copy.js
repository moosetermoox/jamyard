/**
 * Share-by-copy primitives (the sharing system, docs/NEXT-STEPS).
 *
 * Sharing an activity hands the recipient a COPY under a fresh id, never
 * the original row: two devices editing one id would collide, and there
 * is no revoking a row you no longer control. These pure helpers back
 * POST /api/games/:id/copy in server.js.
 */

/**
 * Picks an unused id for the copy: the source id itself if free, else
 * source-2, source-3, ... `exists` is an async (id) => boolean supplied
 * by the caller (server checks built-in dirs, user dirs, and the DB).
 */
export async function mintCopyId(sourceId, exists) {
  let candidate = sourceId;
  let counter = 2;
  while (await exists(candidate)) {
    candidate = `${sourceId}-${counter}`;
    counter++;
  }
  return candidate;
}

const PRIVATE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
export const PRIVATE_TAIL_LENGTH = 6;

/**
 * A private id for a teacher's own copy: the readable base plus a random
 * tail ("exit-ticket-k7m2qp"). Copy ids used to be the name's slug with a
 * counter ("speed-quiz-my-version-3"), and any user activity opens by id at
 * /share, /make, and the API, so a stranger could walk them (a reviewer,
 * 2026-09-29). Six characters of a 31-letter alphabet is a billion tails a
 * base; `random` is injectable for tests.
 */
export async function mintPrivateId(base, exists, random = Math.random) {
  const stem = String(base || 'my-activity').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    // a copy of a copy keeps one tail, not a chain of them
    .replace(new RegExp('-[' + PRIVATE_ALPHABET + ']{' + PRIVATE_TAIL_LENGTH + '}$'), '')
    .slice(0, 40).replace(/-+$/, '') || 'my-activity';
  for (let attempt = 0; attempt < 20; attempt++) {
    let tail = '';
    for (let i = 0; i < PRIVATE_TAIL_LENGTH; i++) {
      tail += PRIVATE_ALPHABET[Math.floor(random() * PRIVATE_ALPHABET.length) % PRIVATE_ALPHABET.length];
    }
    const candidate = `${stem}-${tail}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('Could not find a free id for the copy.');
}

/**
 * Returns a deep copy of a config ready to save as the recipient's own
 * activity. `featured` is stripped (a shared copy must never arrive
 * pre-starred on the public shelf); everything else, including the recipe
 * provenance stamp and the anonymous flag, carries over. Configs are pure
 * JSON by definition, so a JSON round-trip is a faithful deep copy and
 * drops the non-enumerable _source tag DB loads attach.
 */
export function prepareSharedCopy(config) {
  const copy = JSON.parse(JSON.stringify(config));
  delete copy.featured;
  return copy;
}
