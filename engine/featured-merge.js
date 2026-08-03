/**
 * Pure merge of Neon featured-overrides onto game card lists.
 *
 * Built-in `featured` flags live in repo configs (the DEFAULT — what a fresh
 * install shows), but owner curation happens on the live site, whose disk is
 * replaced on every deploy. Overrides from the `featured_overrides` table win
 * over the repo flag; `featuredDefault` rides along so owner view can mark
 * cards whose live state differs from the repo default (drift is visible,
 * never silent).
 */

/**
 * @param {Array<{id: string, featured?: boolean}>} games card-list entries
 * @param {Record<string, boolean>|null} overrides game_id → forced flag
 * @returns new array of new objects with `featured` (effective) and
 *          `featuredDefault` (the repo flag) set
 */
export function applyFeaturedOverrides(games, overrides) {
  const map = overrides || {};
  return games.map(g => {
    const featuredDefault = !!g.featured;
    const featured = Object.prototype.hasOwnProperty.call(map, g.id)
      ? !!map[g.id]
      : featuredDefault;
    return { ...g, featured, featuredDefault };
  });
}
