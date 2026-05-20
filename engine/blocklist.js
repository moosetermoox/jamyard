// Content-filter word list — DATA, not logic.
//
// Kept separate from content-filter.js so the matching algorithm and the words
// it matches can change independently (per the project's "no hardcoded values"
// principle). This is a starter set, intentionally non-exhaustive — determined
// evasion is handled by the host's moderation controls (a later increment), not
// by trying to enumerate every variant here.
//
// Matching is word-boundary based (see content-filter.js), so entries here are
// base forms; the filter handles leet-speak (sh1t), repeated letters (shiiit),
// and separator evasion (s.h.i.t) at match time. Do NOT add short fragments
// that occur inside innocent words (e.g. "ass" lives in "class"/"pass") — the
// boundary match would still fire on the standalone word but you risk surprise.

// Common profanity. Boundary-matched, so plural/!suffix variants like
// "shits" / "fucking" are caught by the stem patterns below where listed.
export const PROFANITY = [
  'fuck',
  'fucking',
  'fucker',
  'shit',
  'bullshit',
  'bitch',
  'bastard',
  'asshole',
  'dick',
  'piss',
  'cunt',
  'whore',
  'slut',
  'dickhead'
];

// Slurs and hate terms. These are filtered with no tolerance. Listed here as
// base forms only for the explicit purpose of blocking them from a K-12
// classroom display; the list is deliberately short and can be extended via a
// custom list per game in a later increment.
export const SLURS = [
  'retard',
  'retarded',
  'fag',
  'faggot',
  'spic',
  'kike',
  'chink',
  'wetback',
  'tranny',
];

// Sexual-content terms inappropriate for a classroom projection.
export const SEXUAL = [
  'porn',
  'pornhub',
  'penis',
  'vagina',
  'boobs',
  'blowjob',
  'handjob',
  'cum',
];

// Flattened set used by the filter. Each entry: { word, category }.
export const BLOCKED_WORDS = [
  ...PROFANITY.map(word => ({ word, category: 'profanity' })),
  ...SLURS.map(word => ({ word, category: 'slur' })),
  ...SEXUAL.map(word => ({ word, category: 'sexual' })),
];
