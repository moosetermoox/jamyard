import { describe, it, expect } from 'vitest';
import { AIService, closeUnbalancedJson } from '../../services/ai-service.js';

// Storyboard probe (2026-09-20, docs/research/storyboard-probe-2026-09-20.md):
// 4 of 81 storyboard replies failed to parse, and every captured case had
// the same shape: the reply ends in `}]` with the object's closing brace
// missing. The regex fallback trimmed to the last `}` (the end step's) and
// JSON.parse died with "Expected ',' or ']' after array element". Chain
// plans (peer feedback, folded story) hit it most. The parser now closes
// whatever is still open before giving up.

const PLAN = {
  name: 'Paragraph Pass',
  description: 'Students write a paragraph, a classmate adds a compliment and a suggestion.',
  steps: [
    { brick: 'announce', text: 'Today you will write, then read a classmate\'s work.' },
    { brick: 'chain', start: 'Write one paragraph about your weekend.', hops: ['Read the paragraph you received. Write one compliment, then one suggestion.'], visibility: 'all', timer: 300 },
    { brick: 'end', text: 'Check out the feedback you got and see what you might revise!' }
  ]
};

describe('closeUnbalancedJson', () => {
  it('appends the closers a truncated reply is missing, in order', () => {
    expect(closeUnbalancedJson('{"a": [1, 2')).toBe('{"a": [1, 2]}');
    expect(closeUnbalancedJson('{"a": [{"b": 1}')).toBe('{"a": [{"b": 1}]}');
  });

  it('ignores brackets inside strings and escaped quotes', () => {
    expect(closeUnbalancedJson('{"a": "x [ { \\" y"')).toBe('{"a": "x [ { \\" y"}');
  });

  it('leaves balanced text alone', () => {
    const text = JSON.stringify(PLAN);
    expect(closeUnbalancedJson(text)).toBe(text);
  });

  it('closes an unterminated string before the brackets', () => {
    expect(closeUnbalancedJson('{"a": "unfinished')).toBe('{"a": "unfinished"}');
  });
});

describe('_parseStoryboard repair', () => {
  const service = new AIService({ mode: 'real' });

  it('recovers a reply whose final brace is missing (the probe\'s failure shape)', () => {
    const raw = JSON.stringify(PLAN).slice(0, -1); // ends in `}]`
    expect(raw.endsWith('}]')).toBe(true);
    const parsed = service._parseStoryboard(raw);
    expect(parsed.error).toBeUndefined();
    expect(parsed.name).toBe('Paragraph Pass');
    expect(parsed.steps.map(s => s.brick)).toEqual(['announce', 'chain', 'end']);
    expect(parsed.steps[1].hops).toHaveLength(1);
  });

  it('recovers the same shape behind a prose preamble', () => {
    const raw = 'Here is the plan:\n' + JSON.stringify(PLAN).slice(0, -1);
    const parsed = service._parseStoryboard(raw);
    expect(parsed.error).toBeUndefined();
    expect(parsed.steps).toHaveLength(3);
  });

  it('recovers an interior unescaped quote after balancing', () => {
    const raw = '{"name": "X", "description": "y", "steps": [{"brick": "announce", "text": "She said "hi" to us."}, {"brick": "end", "text": "Bye"}]';
    const parsed = service._parseStoryboard(raw);
    expect(parsed.error).toBeUndefined();
    expect(parsed.steps[0].text).toBe('She said "hi" to us.');
  });

  it('still reports a reply that is not JSON at all', () => {
    const parsed = service._parseStoryboard('I cannot help with that.');
    expect(parsed.error).toMatch(/not a storyboard/);
  });

  it('still honors a cantBuild reply', () => {
    const parsed = service._parseStoryboard('{"cantBuild": true, "reason": "No drawing here."');
    expect(parsed.cantBuild).toBe(true);
    expect(parsed.reason).toBe('No drawing here.');
  });
});
