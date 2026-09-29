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
  'dickhead',
  // Names a reviewer put on the projector past the filter (2026-09-28)
  'jackass',
  'dumbass',
  'dumbfuck',
  'dipshit',
  'asswipe',
  'fatass',
  'smartass'
];

// Insults that are fine inside an answer ("that was a stupid mistake")
// but never as a name on the big screen. Checked by filterName only.
// No surnames: "Moron" and "Butt" are real family names, so they stay off.
export const NAME_INSULTS = [
  'idiot',
  'stupid',
  'loser',
  'dumb',
  'dummy',
  'imbecile',
  'butthead',
  'buttface',
  'badass',
  'poophead',
  'fatso',
  // body shaming (2026-09-29, "Fatty" went up): Fatima and Pigott still pass
  'fatty',
  'fat',
  'ugly',
  'pig',
  'piggy',
  'porky',
  'lardo'
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

// Threats and self-harm goads. "kys" and "go kill yourself" carry no swear
// word, so the word filter passed them and everything rested on the AI
// check (a reviewer, 2026-09-29). Phrases match with their spaces; the
// filter's spaced-letter pass reads "k y s" too.
export const THREATS = [
  'kys',
  'kill yourself',
  'kill urself',
  'kill your self',
  'go die',
  'go kill yourself',
  'hope you die',
  'i will kill you',
  'ill kill you',
  'gonna kill you',
  'drink bleach',
  'unalive yourself'
];

// Words that make a sentence about a classmate an insult ("Ben is a loser",
// "nobody likes Ben"). Checked by filterAboutClassmate only, and only next
// to a name from the room's roster, so "that was a stupid mistake" and
// "the worst part was the rain" still pass. Every NAME_INSULT counts too.
export const CLASSMATE_INSULTS = [
  'moron',
  'nerd',
  'dork',
  'freak',
  'creep',
  'weirdo',
  'psycho',
  'trash',
  'garbage',
  'gross',
  'lame',
  'worst',
  'annoying',
  'pathetic',
  'worthless',
  'useless',
  'sucks',
  'stinks',
  'smells',
  'nobody likes',
  'no one likes',
  'everyone hates',
  'everybody hates',
  'has no friends'
];

// Flattened set used by the filter. Each entry: { word, category }.
export const BLOCKED_WORDS = [
  ...PROFANITY.map(word => ({ word, category: 'profanity' })),
  ...SLURS.map(word => ({ word, category: 'slur' })),
  ...SEXUAL.map(word => ({ word, category: 'sexual' })),
  ...THREATS.map(word => ({ word, category: 'threat' })),
];
