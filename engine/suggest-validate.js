/**
 * Concierge suggestion validation. The "not sure what to make" AI may only
 * point at things the platform can actually deliver: an existing activity,
 * a recipe with legal params, or a storyboard made of known bricks. This
 * pure filter is the structural guarantee. Anything that does not resolve
 * is dropped before a teacher ever sees it.
 */

// Must match the brick vocabulary compileStoryboard accepts
// (screens/shared/step-suggestions.js).
export const STORYBOARD_BRICKS = [
  'announce', 'collect', 'collect-two', 'collect-choice', 'estimate',
  'reveal', 'reveal-one', 'vote', 'guessing-rounds', 'rank', 'quiz', 'teams',
  'chain', 'deal', 'assign', 'pairs', 'roles', 'draw', 'summarize', 'end',
  // 2026-09-27 (a reviewer's fifteen routines): a buzzer round, the
  // teacher picking what goes up, a single-elimination bracket
  'buzz', 'review', 'bracket',
  // 2026-09-30 (the mechanics inventory): eleven blocks the engine ran
  // for months that no typed idea could reach
  'match', 'sort', 'rate', 'solo-quiz', 'wager', 'merge', 'relay', 'tasks',
  'knockout', 'charades', 'count',
  // 2026-09-30 (the knobs): the class writes the quiz
  'write-quiz',
  // 2026-10-01 (the inventory's Part 3): peer feedback on each student's own piece
  'feedback',
  // quiet time: a clock and nothing to type, then an optional talk line
  'quiet',
  // the hot seat: the class's questions to one student's screen
  'hotseat',
  // secret pairs that find each other in the room
  'findmatch'
];

const MAX_MATCH_PAIRS = 12;
const MAX_SORT_ITEMS = 12;
const MAX_BUCKETS = 6;
const MAX_SCALES = 5;
const MAX_WAGER_OPTIONS = 6;
const MAX_TASK_ITEMS = 15;

// match: pairs of two sides; sort: items with an optional correct bucket;
// rate: scales with a label and two end words. Each rides through trimmed;
// compileStoryboard re-validates (counts, duplicates, a bucket that is not
// one of the buckets).
// findmatch (2026-10-01): pairs dealt to two students each, a class's worth
const MAX_FIND_PAIRS = 30;

function cleanPairs(raw, max = MAX_MATCH_PAIRS) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(p => p && typeof p === 'object').slice(0, max)
    .map(p => ({ left: String(p.left == null ? '' : p.left).slice(0, 120), right: String(p.right == null ? '' : p.right).slice(0, 200) }));
}
function cleanSortItems(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, MAX_SORT_ITEMS).map(it => {
    if (typeof it === 'string') return it.slice(0, 200);
    if (it && typeof it === 'object') {
      const out = { text: String(it.text == null ? '' : it.text).slice(0, 200) };
      if (typeof it.bucket === 'string') out.bucket = it.bucket.slice(0, 80);
      return out;
    }
    return '';
  });
}
function cleanScales(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(s => s && typeof s === 'object').slice(0, MAX_SCALES)
    .map(s => ({
      label: String(s.label == null ? '' : s.label).slice(0, 60),
      low: typeof s.low === 'string' ? s.low.slice(0, 40) : undefined,
      high: typeof s.high === 'string' ? s.high.slice(0, 40) : undefined
    }));
}
function cleanStrings(raw, max, len) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(x => typeof x === 'string' || typeof x === 'number').slice(0, max).map(x => String(x).slice(0, len));
}
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

const MAX_BRACKET_ITEMS = 16;

const MAX_ROLES = 8;
const MAX_TASKS = 12;

// Roles fields ride through in trimmed shape; compileStoryboard re-validates
// (2-8 roles, a teams or pairs step before).
function cleanRoles(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(r => typeof r === 'string').slice(0, MAX_ROLES).map(r => r.slice(0, 40));
}
function cleanTasks(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(t => typeof t === 'string').slice(0, MAX_TASKS).map(t => t.slice(0, 200));
}

const MAX_PAIR_ROUNDS = 3;

// Pairs fields ride through in trimmed shape; compileStoryboard re-validates
// (sides must be exactly two, rounds cap at three).
function cleanRounds(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(r => typeof r === 'string').slice(0, MAX_PAIR_ROUNDS).map(r => r.slice(0, 500));
}
function cleanSides(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(s => typeof s === 'string').slice(0, 2).map(s => s.slice(0, 40));
}

const MAX_RANK_ITEMS = 12;
const MAX_DEAL_ITEMS = 60;
const MAX_DEAL_PILES = 4;

// Deal piles ride through in trimmed shape; compileStoryboard re-validates
// (at least two piles, labels defaulted, prompts scrubbed of tokens).
function cleanPiles(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(p => p && typeof p === 'object')
    .slice(0, MAX_DEAL_PILES)
    .map(p => ({
      label: typeof p.label === 'string' ? p.label.slice(0, 80) : '',
      prompt: typeof p.prompt === 'string' ? p.prompt.slice(0, 300) : ''
    }));
}

const MAX_CHAIN_HOPS = 6;

// Chain fields ride through the concierge only in this trimmed shape;
// compileStoryboard re-validates (start/hops required, sentence needs
// blind, template tokens stripped from blind prompts, etc.).
function cleanHops(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, MAX_CHAIN_HOPS).filter(h => typeof h === 'string').map(h => h.slice(0, 500));
}

const MAX_QUIZ_QUESTIONS = 15;

// Quiz questions ride through the concierge only in this trimmed shape;
// compileStoryboard re-validates (correct must match a choice, etc.).
function cleanQuestions(raw) {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, MAX_QUIZ_QUESTIONS)
    .filter(q => q && typeof q === 'object')
    .map(q => ({
      text: typeof q.text === 'string' ? q.text.slice(0, 300) : '',
      choices: Array.isArray(q.choices) ? q.choices.slice(0, 8).map(String) : [],
      correct: typeof q.correct === 'string' ? q.correct.slice(0, 200) : ''
    }));
}

const MAX_SUGGESTIONS = 3;
const MAX_STORYBOARD_STEPS = 12;

function cleanWhy(why) {
  return typeof why === 'string' ? why.trim().slice(0, 200) : '';
}

/**
 * @param {any} raw - the AI's suggestions array
 * @param {{ gameIds: string[], recipes: Object }} ctx
 *   recipes: { [id]: { parameters: { [name]: spec } } }
 * @returns {{ suggestions: Array, dropped: number }}
 */
export function validateSuggestions(raw, ctx) {
  const gameIds = (ctx && ctx.gameIds) || [];
  const recipes = (ctx && ctx.recipes) || {};
  const list = Array.isArray(raw) ? raw : [];
  const suggestions = [];
  let dropped = 0;

  for (const item of list) {
    if (suggestions.length >= MAX_SUGGESTIONS) break;
    if (!item || typeof item !== 'object') { dropped++; continue; }

    if (item.kind === 'host') {
      if (typeof item.id === 'string' && gameIds.includes(item.id)) {
        suggestions.push({ kind: 'host', id: item.id, why: cleanWhy(item.why) });
      } else {
        dropped++;
      }
      continue;
    }

    if (item.kind === 'recipe') {
      const recipe = typeof item.id === 'string' ? recipes[item.id] : null;
      if (!recipe) { dropped++; continue; }
      const legalParams = recipe.parameters || {};
      const params = {};
      if (item.params && typeof item.params === 'object') {
        for (const [key, value] of Object.entries(item.params)) {
          if (!(key in legalParams)) continue;
          const spec = legalParams[key] || {};
          const numeric = spec.type === 'integer' || spec.type === 'number';
          if (numeric) {
            // The AI thinks in minutes; recipe fields are seconds (min/max
            // bounded). Clamp into the legal range so the prefilled form
            // never fails create with an error the teacher didn't cause.
            if (typeof value !== 'number' || !Number.isFinite(value)) continue;
            let v = value;
            if (typeof spec.min === 'number' && v < spec.min) v = spec.min;
            if (typeof spec.max === 'number' && v > spec.max) v = spec.max;
            params[key] = v;
          } else if (typeof value === 'string' || typeof value === 'number') {
            params[key] = value;
          }
        }
      }
      suggestions.push({ kind: 'recipe', id: item.id, params, why: cleanWhy(item.why) });
      continue;
    }

    if (item.kind === 'storyboard') {
      const sb = item.storyboard;
      const steps = sb && Array.isArray(sb.steps) ? sb.steps : [];
      const legal = steps.length >= 2 && steps.length <= MAX_STORYBOARD_STEPS &&
        steps.every(s => s && typeof s === 'object' && STORYBOARD_BRICKS.includes(s.brick));
      if (!legal) { dropped++; continue; }
      suggestions.push({
        kind: 'storyboard',
        storyboard: {
          name: typeof sb.name === 'string' ? sb.name.slice(0, 80) : 'New Activity',
          description: typeof sb.description === 'string' ? sb.description.slice(0, 200) : '',
          // students start the moment they join and finish on their own
          rolling: sb.rolling === true ? true : undefined,
          steps: steps.map(s => ({
            brick: s.brick,
            text: typeof s.text === 'string' ? s.text.slice(0, 500) : undefined,
            choices: Array.isArray(s.choices) ? s.choices.slice(0, 8).map(String) : undefined,
            guess: s.guess === 'who' ? 'who' : undefined,
            // vote: yes or no on every entry, several can pass
            approve: s.approve === true ? true : undefined,
            // vote: keep what did not pass off the projector; show only the top N
            showRejected: s.showRejected === false ? false : undefined,
            top: typeof s.top === 'number' && Number.isFinite(s.top) ? s.top : undefined,
            // rank: a list to order (12 at most); collect: a list dealt one
            // per student in private (a state each, up to 60)
            items: s.brick === 'sort' ? cleanSortItems(s.items)
              : s.brick === 'tasks' ? cleanStrings(s.items, MAX_TASK_ITEMS, 200)
              : s.brick === 'findmatch' ? cleanStrings(s.items, MAX_FIND_PAIRS, 120)
              : Array.isArray(s.items) ? s.items.slice(0, s.brick === 'collect' ? MAX_DEAL_ITEMS : (s.brick === 'bracket' ? MAX_BRACKET_ITEMS : MAX_RANK_ITEMS)).map(String) : undefined,
            // match / sort / rate / wager (2026-09-30)
            pairs: s.brick === 'match' ? cleanPairs(s.pairs)
              : s.brick === 'findmatch' ? cleanPairs(s.pairs, MAX_FIND_PAIRS) : undefined,
            buckets: cleanStrings(s.buckets, MAX_BUCKETS, 80),
            scales: cleanScales(s.scales),
            results: s.results === 'class' || s.results === 'teacher' ? s.results : undefined,
            options: cleanStrings(s.options, MAX_WAGER_OPTIONS, 120),
            // a scoreboard after a graded step (on by default; solo-quiz off)
            standings: typeof s.standings === 'boolean' ? s.standings : undefined,
            // merge / relay / count: the payoff reveal (on by default)
            show: s.show === false ? false : undefined,
            // knockout: who goes out each round, how many rounds at most
            percent: num(s.percent),
            loops: num(s.loops),
            voteTimer: num(s.voteTimer),
            // relay: turns in all; count: the target number; charades: the
            // phrase question when the class writes the phrases
            turns: num(s.turns),
            target: num(s.target),
            phrases: typeof s.phrases === 'string' ? s.phrases.slice(0, 300) : undefined,
            // rank: each group decides one order; assign: spots per item
            byGroup: s.byGroup === true ? true : undefined,
            perChoice: typeof s.perChoice === 'number' && Number.isFinite(s.perChoice) ? s.perChoice : undefined,
            secretLabel: typeof s.secretLabel === 'string' ? s.secretLabel.slice(0, 80) : undefined,
            clueLabel: typeof s.clueLabel === 'string' ? s.clueLabel.slice(0, 80) : undefined,
            questions: cleanQuestions(s.questions),
            speedBonus: typeof s.speedBonus === 'boolean' ? s.speedBonus : undefined,
            // rank: ranked-choice voting, one item picked by instant runoff
            runoff: s.runoff === true ? true : undefined,
            // quiz: "how sure are you?" after every question (2026-10-01)
            confidence: s.confidence === true ? true : undefined,
            teamCount: typeof s.teamCount === 'number' ? s.teamCount : undefined,
            // teams: regroup the earlier split, one member of each per new group
            jigsaw: s.jigsaw === true ? true : undefined,
            // teams: groups by the last pick-one step's answers (2026-09-30)
            groupBy: s.groupBy === 'same' || s.groupBy === 'mixed' ? s.groupBy : undefined,
            // vote: the students themselves on the ballot; out = the chosen one leaves the round
            over: s.over === 'students' ? 'students' : undefined,
            out: s.out === true ? true : undefined,
            // rank: the items are listed in their right order, the step grades
            correct: s.brick === 'rank' ? (s.correct === true ? true : undefined) : (typeof s.correct === 'string' ? s.correct.slice(0, 120) : undefined),
            // collect-choice: several picks; collect: a right answer and other accepted ones;
            // announce / collect: a line per group (2026-09-30)
            maxPicks: num(s.maxPicks),
            // estimate: the true number; collect: the right answer as words
            answer: s.brick === 'estimate' ? num(s.answer) : (typeof s.answer === 'string' ? s.answer.slice(0, 120) : (typeof s.answer === 'number' && Number.isFinite(s.answer) ? String(s.answer) : undefined)),
            accepted: cleanStrings(s.accepted, 8, 120),
            stations: cleanStrings(s.stations, 12, 300), // announce, collect, collect-choice, tasks
            // reveal: how the answers are drawn (a word cloud, cards, one at random)
            style: s.style === 'cloud' || s.style === 'cards' || s.style === 'random' ? s.style : undefined,
            // write-quiz: how many wrong answers each student writes, the quiz's title
            wrongs: num(s.wrongs),
            title: typeof s.title === 'string' ? s.title.slice(0, 120) : undefined,
            // pairs: partners by an earlier pick-one answer
            pairBy: s.pairBy === 'opposite' || s.pairBy === 'same' || s.pairBy === 'far' ? s.pairBy : undefined,
            // buzz: points per correct answer
            points: typeof s.points === 'number' && Number.isFinite(s.points) ? s.points : undefined,
            groupSize: typeof s.groupSize === 'number' ? s.groupSize : undefined,
            start: typeof s.start === 'string' ? s.start.slice(0, 500) : undefined,
            hops: cleanHops(s.hops),
            visibility: ['all', 'tail', 'blind'].includes(s.visibility) ? s.visibility : undefined,
            sentence: typeof s.sentence === 'string' ? s.sentence.slice(0, 300) : undefined,
            piles: cleanPiles(s.piles),
            writeTimer: typeof s.writeTimer === 'number' ? s.writeTimer : undefined,
            // pairs: follow-up rounds with the same partner, two sides to deal
            rounds: cleanRounds(s.rounds),
            sides: cleanSides(s.sides),
            // announce / collect / collect-choice: a YouTube link the projector plays
            video: typeof s.video === 'string' ? s.video.trim().slice(0, 300) : undefined,
            // draw: the line over the one-at-a-time gallery
            gallery: typeof s.gallery === 'string' ? s.gallery.slice(0, 300) : undefined,
            // summarize: the projector line over the summed-up answers
            heading: typeof s.heading === 'string' ? s.heading.slice(0, 200) : undefined,
            // roles: a job per group member, an optional shared task list
            roles: cleanRoles(s.roles),
            method: s.method === 'choice' || s.method === 'random' ? s.method : undefined,
            tasks: cleanTasks(s.tasks),
            // feedback: the question the writers answer first, one or two readers
            draft: typeof s.draft === 'string' ? s.draft.slice(0, 500) : undefined,
            readers: num(s.readers),
            // hotseat: who sits in it (drawn at random, or the class votes)
            pick: s.pick === 'vote' || s.pick === 'random' ? s.pick : undefined,
            voteText: typeof s.voteText === 'string' ? s.voteText.slice(0, 200) : undefined,
            // quiet: the line after the quiet stretch
            talk: typeof s.talk === 'string' ? s.talk.slice(0, 300) : undefined,
            timer: typeof s.timer === 'number' ? s.timer : undefined,
            // estimate: the scale's ends ("on a scale of 1 to 10"), and the
            // true number with its unit and scoring when there is one
            min: typeof s.min === 'number' && Number.isFinite(s.min) ? s.min : undefined,
            max: typeof s.max === 'number' && Number.isFinite(s.max) ? s.max : undefined,
            unit: typeof s.unit === 'string' ? s.unit.slice(0, 40) : undefined,
            scoring: s.scoring === 'closest' || s.scoring === 'graduated' ? s.scoring : undefined
          }))
        },
        why: cleanWhy(item.why)
      });
      continue;
    }

    dropped++;
  }

  return { suggestions, dropped };
}
