/**
 * The Create page asks before it builds, when the idea needs it
 * (2026-10-04, owner). The route answers {questions}, never an error the
 * page has to handle; the page shows the questions in the idea box, puts the
 * answers into the idea, and runs the usual match on the fuller idea. A
 * skipped question, or none, runs the match on the idea as typed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');

describe('the route', () => {
  const server = read('server.js');
  it('POST /api/games/idea-questions asks the AI with the idea and the class, and never fails the page', () => {
    const at = server.indexOf("app.post('/api/games/idea-questions'");
    expect(at).toBeGreaterThan(-1);
    const body = server.slice(at, at + 1400);
    expect(body).toContain('aiService.generateIdeaQuestions(');
    expect(body).toContain('classDescription');
    expect(body).toContain('looksUnclear(');          // a mashed idea goes on to the match, which says so
    expect(body).toMatch(/res\.json\(\{ questions: \[\] \}\)/); // every failure asks nothing
  });
});

describe('the Create page', () => {
  const js = read('screens/designer/designer.js');
  const html = read('screens/designer/index.html');
  const css = read('screens/designer/styles.css');

  it('loads the answers module before designer.js', () => {
    const a = html.indexOf('/shared/idea-answers.js');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(html.indexOf('designer.js'));
  });

  it('asks first, once, then matches the fuller idea', () => {
    const at = js.indexOf('async function submitAIDescription(');
    const body = js.slice(at, at + 2600);
    expect(body).toContain("fetch('/api/games/idea-questions'");
    expect(body).toContain('TeacherProfile');
    expect(body).toContain('renderIdeaQuestions(');
    expect(body).toMatch(/opts\s*&&\s*opts\.asked/); // the second pass never asks again
  });

  it('the question box: chips or a typing box, Build it, and a way to skip', () => {
    const at = js.indexOf('function renderIdeaQuestions(');
    expect(at).toBeGreaterThan(-1);
    const body = js.slice(at, at + 5000);
    expect(body).toContain('IdeaAnswers.combine(');
    expect(body).toContain("'Build it'");
    expect(body).toContain('Skip, just build it');
    expect(body).toContain('Type your own');
    expect(body).toContain('{ asked: true }');
    expect(body).toContain('Speech');            // the mic, as on the make page
    expect(body).not.toMatch(/innerHTML/);       // teacher and AI text go in as text
  });

  it('has styles for the question rows, with a [hidden] override', () => {
    expect(css).toContain('.idea-q-row');
    expect(css).toMatch(/\.idea-q-[a-z-]+\[hidden\]/);
  });
});
