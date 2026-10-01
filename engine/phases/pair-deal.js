/**
 * Secret pairs that find each other (2026-10-01, the mechanics inventory's
 * Part 3): a collect with `dealItems` and `pairItems: true` hands every
 * item to TWO students in private, either as two halves ("Romeo | Juliet",
 * a word and its meaning, a question and its answer) or as the same card
 * twice (the same animal sound). Students get up, find the classmate who
 * holds the other half, and type that classmate's name; the close says
 * who held what and how many named their match. The finding happens in
 * the room, so the screen only deals and checks.
 *
 * Pure: ids, items, and names in; the deal, the groups, and words out.
 */
import { translate } from '../i18n/index.js';

/** "Romeo | Juliet" = two halves; anything else = the same card twice. */
export function splitPairItem(item) {
  const s = String(item == null ? '' : item);
  const at = s.indexOf(' | ');
  if (at === -1) return [s.trim(), s.trim()];
  return [s.slice(0, at).trim(), s.slice(at + 3).trim()];
}

function shuffled(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Two students to an item, halves split between them; an odd student
 * joins the last pair holding a copy of its first half (a trio). A class
 * bigger than twice the list reuses items, so a card may have two pairs.
 * @returns {{ assigned: Object, groups: Array<{item: string, members: string[], cards: string[]}> }}
 */
export function dealPairs(playerIds, items, rand = Math.random) {
  const ids = shuffled((playerIds || []).filter(Boolean), rand);
  const list = shuffled((items || []).map(String).filter(s => s.trim() !== ''), rand);
  const assigned = {};
  const groups = [];
  if (ids.length === 0 || list.length === 0) return { assigned, groups };
  const pairCount = Math.max(1, Math.floor(ids.length / 2));
  for (let k = 0; k < pairCount; k++) {
    const item = list[k % list.length];
    const halves = splitPairItem(item);
    const members = ids.slice(2 * k, 2 * k + 2);
    const cards = members.map((_, m) => halves[m]);
    members.forEach((id, m) => { assigned[id] = cards[m]; });
    groups.push({ item, members, cards });
  }
  if (ids.length > 1 && ids.length % 2 === 1) {
    const last = groups[groups.length - 1];
    const extra = ids[ids.length - 1];
    const card = splitPairItem(last.item)[0];
    last.members.push(extra);
    last.cards.push(card);
    assigned[extra] = card;
  }
  return { assigned, groups };
}

/**
 * A student who arrives after the deal joins the smallest group and gets
 * the half that group holds fewest of. Changes `groups` and `assigned` in
 * place; returns the card, or null when there is nothing to join.
 */
export function joinLatePair(state, playerId) {
  if (!state || !Array.isArray(state.groups) || state.groups.length === 0 || !playerId) return null;
  if (state.assigned && state.assigned[playerId] !== undefined) return state.assigned[playerId];
  const group = state.groups.slice().sort((a, b) => a.members.length - b.members.length)[0];
  const halves = splitPairItem(group.item);
  const held = (h) => group.cards.filter(c => c === h).length;
  const card = held(halves[1]) < held(halves[0]) ? halves[1] : halves[0];
  group.members.push(playerId);
  group.cards.push(card);
  state.assigned = state.assigned || {};
  state.assigned[playerId] = card;
  return card;
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Did this answer name one of these classmates? The whole name, the first
 * name, or the start of the name (three letters or more) counts; spelling
 * slips in a classmate's name should not cost a found match.
 */
export function namesAMatch(answer, partnerNames) {
  const a = norm(answer);
  if (a === '') return false;
  return (partnerNames || []).some(name => {
    const n = norm(name);
    if (!n) return false;
    const first = n.split(' ')[0];
    return a === n || a === first || a.split(' ').includes(first) || (a.length >= 3 && n.startsWith(a));
  });
}

/**
 * Who held what, and how many named a match.
 * @param {Array} groups      from dealPairs
 * @param {Object} answers    {playerId: typed text}
 * @param {Function} nameOf   playerId -> name
 * @returns {{ found: number, total: number, foundByPlayer: Object, pairsList: string }}
 */
export function judgePairs(groups, answers, nameOf) {
  const foundByPlayer = {};
  let found = 0;
  let total = 0;
  const lines = [];
  for (const g of groups || []) {
    const halves = splitPairItem(g.item);
    const names = g.members.map(id => nameOf(id) || '?');
    lines.push(`${halves[0] === halves[1] ? halves[0] : halves[0] + ' + ' + halves[1]}: ${names.join(', ')}`);
    g.members.forEach((id, m) => {
      total++;
      const partners = names.filter((_, i) => i !== m);
      const ok = namesAMatch(answers && answers[id], partners);
      foundByPlayer[id] = ok;
      if (ok) found++;
    });
  }
  return { found, total, foundByPlayer, pairsList: lines.join('\n') };
}

/** "10 of 12 named their match." */
export function foundLine(lang, found, total) {
  if (!total) return '';
  return translate(lang, '{found} of {total} named their match.')
    .replace('{found}', String(found)).replace('{total}', String(total));
}
