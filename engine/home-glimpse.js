/**
 * home-glimpse.js — the projector glimpse the home page draws per activity.
 *
 * The 13a home (2026-09-05) shows "your projector, mid-activity" as a drawn
 * frame, not a screenshot: the class code, the first thing students are
 * asked, and a pile of answers landing. This derives the two facts that
 * frame needs from a config, reusing the activity map's primary-path walk
 * so the prompt shown is the first real student step, not the intro.
 *
 * Shape: { mode: 'answer' | 'join' | 'talk', prompt: string, samples: string[] }
 *   answer — students are typing/choosing; `prompt` is what they see
 *   join   — rolling start: the room opens straight into the first step,
 *            so the projector's lasting picture is the doorway (code + QR)
 *   talk   — announce-driven, nothing typed; `prompt` is the first screen
 *
 * `samples` (15b home, 2026-09-10): up to three of the template's own
 * sample answers for that first step (engine/sample-answers.js shape), the
 * lines the drawn frame and the "on their screens" cards show. Template
 * content, never a student's words.
 *
 * `prompt` and `samples` are teacher config, untrusted for rendering:
 * textContent only.
 * Never throws — a glimpse is decoration, and a broken config must not
 * take the games list down with it.
 */
import { buildActivityMap } from './activity-map.js';

// Steps where the class is doing something on their devices.
const INPUT_TYPES = new Set([
  'collect', 'collect-choice', 'rate', 'estimate', 'vote', 'rank', 'sort',
  'match', 'buzz', 'one-voice', 'relay', 'merge', 'turn', 'wager',
  'solo-quiz', 'checklist'
]);

// The frame has room for more than the map's one-line excerpt.
const PROMPT_MAX = 96;
const PROMPT_FIELDS = ['prompt', 'question', 'message', 'instruction'];

function firstSentence(text) {
  const clean = String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = /^(.+?[.!?])(\s|$)/.exec(clean);
  return m ? m[1] : clean;
}

function cut(text) {
  if (text.length <= PROMPT_MAX) return text;
  let out = text.slice(0, PROMPT_MAX);
  const lastSpace = out.lastIndexOf(' ');
  if (lastSpace > 30) out = out.slice(0, lastSpace);
  return out.trim() + '…';
}

// A collect with two or more labelled fields asks its questions in the
// labels (Exit Ticket: "One thing you learned today" / "One question you
// still have") and keeps an instruction in the prompt ("Answer in a
// sentence or two."), so the glimpse reads the labels (2026-09-24: the
// yard's first card had been showing the instruction).
function fieldQuestions(phase) {
  if (!Array.isArray(phase.fields) || phase.fields.length < 2) return undefined;
  const labels = [];
  for (const f of phase.fields) {
    const label = f && typeof f.label === 'string' ? f.label.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim() : '';
    if (!label || label.includes('{{')) return undefined;
    labels.push(/[.!?]$/.test(label) ? label : label + '.');
  }
  return cut(labels.join(' '));
}

// The step's own words, longer than the map's excerpt; the map's detail
// stays the fallback (it already skipped templated text for us).
function ownWords(config, stop) {
  const id = Array.isArray(stop.ids) ? stop.ids[0] : undefined;
  const phase = id && config.phases && config.phases[id];
  if (!phase) return undefined;
  const questions = fieldQuestions(phase);
  if (questions) return questions;
  for (const field of PROMPT_FIELDS) {
    const value = phase[field];
    if (typeof value !== 'string') continue;
    const text = value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    if (!text || text.includes('{{')) continue;
    return cut(text);
  }
  return undefined;
}

function firstInputStop(stops) {
  for (const stop of stops) {
    const input = (stop.kind === 'step' && INPUT_TYPES.has(stop.type)) ||
      (stop.kind === 'rounds' && Array.isArray(stop.sub) && stop.sub.some((t) => INPUT_TYPES.has(t)));
    if (input && stop.detail) return stop;
  }
  return undefined;
}

function promptFromStops(config, stops) {
  const stop = firstInputStop(stops);
  return stop ? (ownWords(config, stop) || stop.detail) : '';
}

const SAMPLE_MAX = 3;
const SAMPLE_LEN = 70;

function cutSample(text) {
  const clean = String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= SAMPLE_LEN) return clean;
  let out = clean.slice(0, SAMPLE_LEN);
  const lastSpace = out.lastIndexOf(' ');
  if (lastSpace > 30) out = out.slice(0, lastSpace);
  return out.trim() + '…';
}

// The template's sample answers for the first student step: a plain list
// deals line i to seat i, a respondsTo block keeps its lines, a
// multi-field line shows its first field.
// A chain (One More Thing's recall, add-one, add-again) folds into one
// stop the map does not call a step, so with no first input stop the first
// stop that owns a sample set is taken; with one, only its own ids count
// (a later step's answers under the first step's prompt would mislead).
function sampleSetFor(config, stops) {
  const sets = config && config.sampleAnswers;
  if (!sets || typeof sets !== 'object') return undefined;
  const first = firstInputStop(stops);
  const candidates = first ? [first] : stops;
  for (const stop of candidates) {
    for (const id of (Array.isArray(stop.ids) ? stop.ids : [])) {
      if (sets[id]) return sets[id];
    }
  }
  return undefined;
}

function samplesFor(config, stops) {
  const set = sampleSetFor(config, stops);
  const lines = Array.isArray(set) ? set : (set && Array.isArray(set.lines) ? set.lines : []);
  const out = [];
  for (const line of lines) {
    const text = Array.isArray(line) ? line[0] : line;
    if (typeof text !== 'string' || !text.trim()) continue;
    out.push(cutSample(text));
    if (out.length === SAMPLE_MAX) break;
  }
  return out;
}

/**
 * The one line under an activity's name on a yard plank: what it is for,
 * without opening it (outside review, 2026-09-06). A recipe-born activity
 * borrows its recipe's tagline ("Perfect for 'most important cause of
 * WWI'..."); anything else gets the first sentence of its description.
 * @param {object} config
 * @param {{tagline?: string}|null} [recipe]  the recipe the config was compiled from, if any
 * @returns {string}
 */
export function activityHook(config, recipe) {
  const tagline = recipe && typeof recipe.tagline === 'string' ? recipe.tagline.trim() : '';
  const line = tagline || firstSentence(config && config.description);
  return line.length > 110 ? line.slice(0, 107).replace(/\s+\S*$/, '') + '...' : line;
}

export function homeGlimpse(config) {
  const empty = { mode: 'answer', prompt: '', samples: [] };
  if (!config || typeof config !== 'object') return empty;
  let map;
  try {
    map = buildActivityMap(config);
  } catch {
    return { mode: 'answer', prompt: firstSentence(config.description), samples: [] };
  }
  const stops = (map && Array.isArray(map.stops)) ? map.stops : [];
  let samples = [];
  try { samples = samplesFor(config, stops); } catch { samples = []; }
  if (config.start === 'rolling') {
    return { mode: 'join', prompt: promptFromStops(config, stops) || cut(firstSentence(config.description)), samples };
  }
  const prompt = promptFromStops(config, stops);
  // The map calls an announce-heavy activity talk-driven. For the frame,
  // talk means the class is mostly not typing: Closer's one-tap checkout
  // after thirteen screens stays talk, Speed Quiz's answer-every-round
  // keeps the answer pile. Weighed by phase count, not stop count.
  let inputPhases = 0;
  let allPhases = 0;
  for (const s of stops) {
    const n = Array.isArray(s.ids) ? s.ids.length : 1;
    allPhases += n;
    if (s.kind === 'step' && INPUT_TYPES.has(s.type)) inputPhases += n;
    if (s.kind === 'rounds' && Array.isArray(s.sub) && s.sub.length > 0) {
      inputPhases += n * s.sub.filter((t) => INPUT_TYPES.has(t)).length / s.sub.length;
    }
  }
  const mostlyTalk = allPhases === 0 || inputPhases / allPhases < 0.25;
  if (map && map.talk && mostlyTalk) {
    const first = stops.find((s) => s.detail || (s.samples && s.samples.length));
    const line = first ? (first.detail || first.samples[0]) : '';
    return { mode: 'talk', prompt: line || cut(firstSentence(config.description)), samples };
  }
  return { mode: 'answer', prompt: prompt || cut(firstSentence(config.description)), samples };
}
