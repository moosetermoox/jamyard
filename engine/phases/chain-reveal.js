/**
 * Return-to-author chains — pure logic for reveal scope:"own".
 *
 * A rotation chain (collect → rotateFrom → rotateFrom …) passes each
 * player's item through N classmates. This module walks the chain BACK:
 * for every player who started an item, it finds what each hop did with
 * it, so the reveal can show each author what became of the thing they
 * started (the +1-routine / exquisite-corpse payoff).
 *
 * Links come from `assignedFrom` maps ({recipientId: senderId}) that the
 * collect handler stores on each rotation SOURCE phase — index math is
 * not replayed here, so reconnect id-migration keeps chains intact.
 *
 * Pure: phase-data in, Map out. No engine, no sockets.
 */

/** byPlayer view of a collect phase's data ({playerId: text}). */
export function normalizeByPlayer(phaseData) {
  if (!phaseData) return {};
  if (phaseData.byPlayer) return phaseData.byPlayer;
  const out = {};
  for (const r of phaseData.responses || []) {
    if (r && r.playerId && r.text !== undefined) out[r.playerId] = r.text;
  }
  return out;
}

/**
 * @param {Array<{byPlayer?: Object, responses?: Array, assignedFrom?: Object}>} chainDatas
 *   Phase data for each phase in the chain, chain order (origin first).
 *   `assignedFrom` on element i links element i+1's recipients back to
 *   element i's contributors.
 * @returns {Map<string, {original: string, steps: string[], complete: boolean}>}
 *   Keyed by the ORIGIN contributor's playerId. `steps` holds each hop's
 *   text in order (missing hops are skipped; `complete` is false when any
 *   link or hop text was missing).
 */
export function buildChainViews(chainDatas) {
  const views = new Map();
  if (!Array.isArray(chainDatas) || chainDatas.length === 0) return views;

  const byPlayerPerPhase = chainDatas.map(normalizeByPlayer);
  const origin = byPlayerPerPhase[0];

  for (const [ownerId, original] of Object.entries(origin)) {
    const steps = [];
    let complete = true;
    let holderId = ownerId;

    for (let i = 1; i < chainDatas.length; i++) {
      const links = (chainDatas[i - 1] && chainDatas[i - 1].assignedFrom) || {};
      // Who received holderId's item at this hop?
      let recipient = null;
      for (const [r, sender] of Object.entries(links)) {
        if (sender === holderId) { recipient = r; break; }
      }
      if (!recipient) { complete = false; break; }
      const text = byPlayerPerPhase[i][recipient];
      if (text === undefined) {
        // A hop the teacher hid (engine/moderation.js moved it to
        // hiddenByPlayer) is left out on purpose, never "wifi happens"
        const hiddenMap = chainDatas[i] && chainDatas[i].hiddenByPlayer;
        const hiddenHop = !!(hiddenMap && Object.prototype.hasOwnProperty.call(hiddenMap, recipient));
        if (!hiddenHop) complete = false;
      } else {
        steps.push(text);
      }
      holderId = recipient;
    }

    views.set(ownerId, { original, steps, complete });
  }
  return views;
}

/**
 * Fill a slot template ("The {1} {2} {3}.") from a chain view: {1} is the
 * origin contribution, {2}.. are the hops in chain order. Slots with no
 * contribution (absent player, broken link, short chain) render as a
 * blank so the sentence still reads aloud. Exquisite-corpse assembly.
 */
const BLANK_SLOT = '____';
function fillSlotTemplate(template, view) {
  const slots = [view.original, ...view.steps];
  return template.replace(/\{(\d+)\}/g, (_, n) => {
    const word = slots[Number(n) - 1];
    const trimmed = typeof word === 'string' ? word.trim() : '';
    return trimmed !== '' ? trimmed : BLANK_SLOT;
  });
}

/**
 * Default player-facing rendering of one chain view.
 * @param {{original: string, steps: string[], complete: boolean}|undefined} view
 * @param {{ display?: 'steps'|'final'|'template', template?: string }} [opts]
 *   'steps'    — original + every hop, numbered (chain poems, relays)
 *   'final'    — original + the last hop only (accumulating lists, where
 *                each hop already contains everything before it)
 *   'template' — the contributions assembled into opts.template's {N}
 *                slots (blind grammar chains, exquisite corpse). Falls
 *                back to 'steps' when no template string is set; the
 *                validator flags that config before a game can run.
 */
export function formatChainContent(view, opts = {}) {
  if (!view || view.original === undefined) {
    return 'You didn\'t start one this round, lean over and see what a neighbor got back!';
  }
  const hasTemplate = typeof opts.template === 'string' && opts.template.trim() !== '';
  const display = opts.display === 'final' ? 'final'
    : (opts.display === 'template' && hasTemplate) ? 'template'
    : 'steps';
  // Optional headings from the reveal (chainHeading / chainGrewHeading):
  // "You wrote:" / "Someone wrote this for you:" turns a returned chain
  // into a personal payoff (Someone's Got You, outside review #2).
  const heading = (typeof opts.heading === 'string' && opts.heading.trim() !== '')
    ? opts.heading.trim() : '🌱 You started with:';
  const lines = [heading, `“${view.original}”`];

  if (display === 'template') {
    lines.push('', 'Hand by hand, it became:', `“${fillSlotTemplate(opts.template, view)}”`);
  } else if (view.steps.length === 0) {
    lines.push('', 'No one got to add to it this time.');
  } else if (display === 'final') {
    const grew = (typeof opts.grewHeading === 'string' && opts.grewHeading.trim() !== '')
      ? opts.grewHeading.trim()
      : view.steps.length === 1
        ? 'A classmate took it from there:'
        : `${view.steps.length} classmates took it from there:`;
    lines.push('', grew, `“${view.steps[view.steps.length - 1]}”`);
  } else {
    lines.push('', 'And then, hand to hand:');
    view.steps.forEach((text, i) => lines.push(`${i + 1}. ${text}`));
  }

  if (!view.complete) {
    lines.push('', '(Part of the chain went missing along the way, wifi happens.)');
  }
  return lines.join('\n');
}

/**
 * One chain as a finished piece of work, in one string: the filled
 * sentence for a template chain, the last version for a "final" chain,
 * the hops joined by arrows for a "steps" chain. This is what the
 * projector, a ballot, a gallery, and the report show for the chain
 * (an outside reviewer's water-cycle chains never left the students'
 * screens, 2026-09-25).
 */
export function chainResultText(view, opts = {}) {
  if (!view || view.original === undefined) return '';
  const hasTemplate = typeof opts.template === 'string' && opts.template.trim() !== '';
  if (opts.display === 'template' && hasTemplate) return fillSlotTemplate(opts.template, view);
  const parts = [view.original, ...view.steps]
    .map(s => (typeof s === 'string' ? s.trim() : ''))
    .filter(s => s !== '');
  if (opts.display === 'final') return parts[parts.length - 1] || '';
  return parts.join(' → ');
}

/**
 * Every finished chain as a response row ({playerId, name, text}), keyed
 * by the student who started it, so a later vote, reveal-one, or the
 * report can read the reveal like a collect step. `chainList` is the
 * numbered text for a screen.
 * @param {Map} views  from buildChainViews
 * @param {(id: string) => (string|null)} nameOf
 * @param {{ display?: string, template?: string }} [opts]
 */
export function buildChainRecords(views, nameOf, opts = {}) {
  const responses = [];
  for (const [playerId, view] of views.entries()) {
    const text = chainResultText(view, opts);
    if (text === '') continue;
    responses.push({ playerId, name: (nameOf && nameOf(playerId)) || 'Someone', text, original: view.original, steps: view.steps.slice(), complete: view.complete });
  }
  const chainList = responses.map((r, i) => `${i + 1}. ${r.text}`).join('\n');
  return { responses, chainList };
}
