/**
 * home-glimpse.js — the one-line "projector, mid-activity" glimpse the home
 * page draws for each activity (13a home, 2026-09-05): which mode the frame
 * is in and the first thing students are asked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeGlimpse } from '../../engine/home-glimpse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (id) => JSON.parse(readFileSync(join(root, 'games', id, 'config.json'), 'utf8'));

describe('homeGlimpse', () => {
  it('shows the first student prompt as an answering frame', () => {
    const g = homeGlimpse(load('snowball'));
    expect(g.mode).toBe('answer');
    expect(g.prompt).toBe('What should our class norms be?');
  });

  it('skips the announce intro to reach the first input step', () => {
    const g = homeGlimpse(load('art-gallery'));
    expect(g.mode).toBe('answer');
    expect(g.prompt.startsWith('Draw your dream invention')).toBe(true);
    // The step's own words, not the map's 64-character cut
    expect(g.prompt.length).toBeGreaterThan(65);
  });

  it('cuts a long prompt at a word boundary under the frame limit', () => {
    const long = 'word '.repeat(40).trim();
    const g = homeGlimpse({
      name: 'X',
      description: '',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: long, next: 'end' },
        end: { type: 'end' }
      }
    });
    expect(g.prompt.length).toBeLessThanOrEqual(97);
    expect(g.prompt.endsWith('…')).toBe(true);
    expect(g.prompt).not.toMatch(/ …$/);
  });

  it('reads a collect-choice question too', () => {
    const g = homeGlimpse(load('live-poll'));
    expect(g.prompt).toBe("How are you feeling about today's lesson?");
  });

  it('marks rolling-start activities as join-first', () => {
    const g = homeGlimpse(load('exit-ticket'));
    expect(g.mode).toBe('join');
  });

  it('marks talk-driven activities as talk, with the first screen line', () => {
    const g = homeGlimpse(load('closer'));
    expect(g.mode).toBe('talk');
    expect(typeof g.prompt).toBe('string');
    expect(g.prompt.length).toBeGreaterThan(0);
  });

  it('keeps the answer pile for a quiz that is announce-heavy but answered every round', () => {
    const g = homeGlimpse(load('speed-quiz'));
    expect(g.mode).toBe('answer');
    expect(g.prompt.length).toBeGreaterThan(0);
  });

  it('never surfaces an AI instruction as the prompt', () => {
    // Trivia Bluff's rounds start with an ai-process generate task whose
    // instruction is the only excerpt the map has; the frame must fall back
    // to the description rather than show "Generate ONE ...".
    const g = homeGlimpse(load('trivia-bluff'));
    expect(g.mode).toBe('answer');
    expect(g.prompt).not.toMatch(/^Generate/);
    expect(g.prompt.length).toBeGreaterThan(0);
  });

  it('falls back to the first sentence of the description when no step reads', () => {
    const g = homeGlimpse({
      name: 'X',
      description: 'A first sentence. A second one.',
      phases: { lobby: { type: 'lobby', next: 'end' }, end: { type: 'end' } }
    });
    expect(g.mode).toBe('answer');
    expect(g.prompt).toBe('A first sentence.');
  });

  it('strips bold markers from the prompt', () => {
    const g = homeGlimpse({
      name: 'X',
      description: '',
      phases: {
        lobby: { type: 'lobby', next: 'ask' },
        ask: { type: 'collect', prompt: 'Name **one** thing.', next: 'end' },
        end: { type: 'end' }
      }
    });
    expect(g.prompt).toBe('Name one thing.');
  });

  it('never crashes on a broken config', () => {
    expect(homeGlimpse({})).toEqual({ mode: 'answer', prompt: '' });
    expect(homeGlimpse(null)).toEqual({ mode: 'answer', prompt: '' });
  });
});
