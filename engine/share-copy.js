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
