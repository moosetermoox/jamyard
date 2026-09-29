// A timer typed on the make page reads the way a teacher means it
// (review eighteen: "2" and "2 min" became 0:10, "999" became 16:39).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../screens/shared/timer-text.js';

const { parse, format } = globalThis.TimerText;

describe('TimerText.parse', () => {
  it('reads a bare small number as minutes', () => {
    expect(parse('2')).toBe(120);
    expect(parse('1.5')).toBe(90);
    expect(parse('20')).toBe(1200);
  });
  it('reads minutes spelled out', () => {
    expect(parse('2 min')).toBe(120);
    expect(parse('2m')).toBe(120);
    expect(parse('3 minutes')).toBe(180);
    expect(parse('1 min 30')).toBe(90);
    expect(parse('1m30s')).toBe(90);
  });
  it('reads seconds when marked, or a bare number too big for minutes', () => {
    expect(parse('90s')).toBe(90);
    expect(parse('45 sec')).toBe(45);
    expect(parse('90')).toBe(90);
  });
  it('keeps m:ss as it is', () => {
    expect(parse('2:00')).toBe(120);
    expect(parse('0:45')).toBe(45);
  });
  it('says no to words', () => {
    expect(parse('')).toBeNull();
    expect(parse('soon')).toBeNull();
  });
  it('formats seconds as m:ss, under a minute too', () => {
    expect(format(58)).toBe('0:58');
    expect(format(120)).toBe('2:00');
  });
});

describe('the make page uses it', () => {
  const html = readFileSync('screens/make/index.html', 'utf8');
  const js = readFileSync('screens/make/make.js', 'utf8');
  it('loads the module before make.js', () => {
    expect(html.indexOf('/shared/timer-text.js')).toBeGreaterThan(-1);
    expect(html.indexOf('/shared/timer-text.js')).toBeLessThan(html.indexOf('src="make.js"'));
  });
  it('parses through TimerText', () => {
    expect(js).toContain('TimerText.parse(');
  });
});
