/**
 * Variety spin for AI `generate` tasks (owner report 2026-08-30: Trivia
 * Bluff's live questions repeated across sessions).
 *
 * A generate phase's instruction is byte-identical every time the game
 * runs, and a model given the same request converges on the same favorite
 * answers, so every class got the same "obscure" facts. This appends a
 * per-call spin: a random seed the model can't ignore, the classic
 * anti-first-instinct maneuver (silently brainstorm N candidates, keep
 * the last), and a ban on the overused trivia chestnuts. Pure given a
 * rand source; ai-process appends it to every generate instruction at
 * call time, so recipes and drift-guarded configs stay untouched.
 */

// School-safe concrete nouns; one is drawn per call as an inspiration word.
// A bare random number proved too weak in live testing (Haiku still answered
// Lesotho for "geography" every session) — a seed word gives the model a
// genuinely different starting point to associate from.
export const SPIN_WORDS = [
  'ladder', 'anchor', 'lantern', 'bridge', 'compass', 'kettle', 'saddle',
  'harbor', 'quilt', 'whistle', 'canyon', 'barrel', 'mirror', 'engine',
  'garden', 'padlock', 'feather', 'tunnel', 'basket', 'hammer', 'island',
  'clock', 'rope', 'stamp', 'wheel', 'candle', 'market', 'glacier',
  'orchard', 'bell', 'kite', 'furnace', 'library', 'pocket', 'river',
  'circus', 'helmet', 'window', 'desert', 'violin', 'lighthouse', 'cave',
  'bakery', 'magnet', 'parade', 'shovel', 'telescope', 'train', 'umbrella',
  'volcano', 'wagon', 'suitcase', 'staircase', 'postcard', 'fountain',
  'chimney', 'blanket', 'sailboat', 'keyboard', 'mountain'
];

export function varietySpin(rand = Math.random) {
  const spin = 1000 + Math.floor(rand() * 9000);
  const depth = 3 + Math.floor(rand() * 7); // 3..9 candidates
  const word = SPIN_WORDS[Math.floor(rand() * SPIN_WORDS.length)];
  return `\n\nVariety spin #${spin}: this exact request runs in many different class sessions, and each session must get DIFFERENT content. Do not use your first instinct. Inspiration word: "${word}" - your subject must connect to this word somehow, even indirectly or by a chain of associations (never mention the word itself, and never bend facts to force the connection; a loose link beats a false claim). Associate through THINGS (places, jobs, history, nature, objects), not through language itself: do not default to word-origin or etymology angles unless the request asks for them. Silently brainstorm ${depth} candidates along that path and answer with the LAST one. Avoid famous "did you know" chestnuts everyone has already heard, and NEVER use these overdone ones or close variants: honey never spoiling, octopus or earthworm hearts, what a group of flamingos/crows/owls is called, Lesotho or San Marino being surrounded countries, bananas being berries, the Eiffel Tower growing in summer, wombat cube poop, Oymyakon being cold.`;
}
