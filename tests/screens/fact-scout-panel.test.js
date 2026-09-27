/**
 * The Trivia Bluff panel's two doors (2026-09-27): the teacher's own
 * facts, or the fact scout. The scout door posts a topic to
 * /api/games/fact-scout, shows each found round with the sentence it was
 * found in and a link to the page, and ticked rounds join the editable
 * list. Nothing is written from the AI's memory any more: the old
 * "AI writes the facts now" and "AI picks facts during the game" doors,
 * their route, and the service method are gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../..', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

describe('the bluff panel', () => {
  const src = read('screens/shared/make-it-yours.js');

  it('offers two doors, the teacher\'s own first, and opens on it', () => {
    expect(src).toContain("id: 'own',");
    expect(src).toContain("id: 'scout',");
    expect(src).toContain("title: 'Find facts about a topic',");
    expect(src).not.toContain("id: 'live',");
    expect(src).not.toContain("id: 'ai-now',");
    expect(src).toContain("var selectedSource = 'own';");
    expect(src).toContain("topicSection.hidden = selectedSource !== 'scout';");
  });

  it('the scout door reads the articles, shows the sentence and the link, and ticks facts into the list', () => {
    expect(src).toContain("fetch('/api/games/fact-scout', {");
    expect(src).toContain("body: JSON.stringify({ topic: topic })");
    expect(src).toContain("showStatus('Reading a few articles about \"' + topic + '\". This takes about a minute.');");
    expect(src).toContain("quote.textContent = 'Found in: “' + f.source.quote + '”';");
    expect(src).toContain("link.textContent = 'Open the page: ' + (f.source.title || 'Wikipedia');");
    expect(src).toContain("addFoundBtn.textContent = 'Add the ticked facts';");
    expect(src).toContain("questions.push({ question: f.question, truth: f.truth, houseLie: f.houseLie || '' });");
    expect(src).not.toContain('/api/games/bluff-facts');
  });

  it('the copy carries the facts and the timer, never a source flag or a round count', () => {
    expect(src).toContain('params.questions = cleaned;');
    expect(src).not.toContain("params.questionSource");
    expect(src).not.toContain('params.rounds');
  });

  it('the teacher copy never names the AI on the scout door', () => {
    const start = src.indexOf('function showBluffCustomizeDialog');
    const end = src.indexOf('function customizeCopy');
    const panel = src.slice(start, end);
    const strings = panel.match(/'[^'\n]*'/g) || [];
    const teacherCopy = strings.filter((s) => /[a-z]{3}/.test(s) && !/^'[a-zA-Z-]+'$/.test(s));
    for (const s of teacherCopy) expect(s, s).not.toMatch(/\bAI\b/);
  });
});

describe('the server and the service', () => {
  it('the route reads a topic and returns rounds with sources; the old writer is gone', () => {
    const server = read('server.js');
    expect(server).toContain("app.post('/api/games/fact-scout', async (req, res) => {");
    expect(server).toContain("import { scoutFacts } from './services/fact-scout.js';");
    expect(server).toContain('res.json({ topic: result.topic, pages: result.pages, rounds: result.rounds, dropped: result.dropped });');
    expect(server).not.toContain("'/api/games/bluff-facts'");
    const ai = read('services/ai-service.js');
    expect(ai).not.toContain('generateBluffFacts');
  });

  it('the recipe reads as found facts, the class example carries only the questions', () => {
    const recipe = JSON.parse(read('recipes/trivia-bluff.json'));
    expect(recipe.description).toContain('found for you in encyclopedia articles');
    expect(recipe.description).not.toContain('live during the game');
    expect(read('screens/shared/class-examples.js')).toContain("'trivia-bluff': function (w) { return { params: { questions: w.facts } }; },");
  });
});
