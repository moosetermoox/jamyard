/**
 * Robot playtest (services/simulator.js) — pure helper tests.
 *
 * The full playthrough loop needs a running server and is verified live
 * (deep review on a healthy and a deliberately broken game); these tests
 * cover the deterministic pieces: payload sanity checks, phase-id
 * matching for findings, and finding dedupe.
 */

import { describe, it, expect } from 'vitest';
import { checkPayload, matchPhaseId, dedupeFindings } from '../../services/simulator.js';

const CONFIG = {
  phases: {
    lobby: { type: 'lobby', next: 'ask' },
    ask: { type: 'collect', prompt: 'What did you do this weekend that made you smile?', next: 'order' },
    order: { type: 'rank', prompt: 'Rank these trip ideas from favorite to least.', candidates: 'ask.responses', next: 'share' },
    share: { type: 'reveal', template: 'Here is what the class said:\n\n{{ask.responses.list}}', next: 'end' },
    end: { type: 'end' }
  }
};

describe('matchPhaseId', () => {
  it('matches an exact prompt back to its phase', () => {
    expect(matchPhaseId(CONFIG, 'What did you do this weekend that made you smile?')).toBe('ask');
  });

  it('matches resolved templates by their static lead', () => {
    expect(matchPhaseId(CONFIG, 'Here is what the class said:\n\n1. pizza\n2. naps')).toBe('share');
  });

  it('returns null when nothing matches', () => {
    expect(matchPhaseId(CONFIG, 'Totally unrelated text')).toBeNull();
    expect(matchPhaseId(CONFIG, '')).toBeNull();
    expect(matchPhaseId(null, 'x')).toBeNull();
  });
});

describe('checkPayload', () => {
  it('flags a rank phase that started with nothing to rank (the classic)', () => {
    const findings = checkPayload('rank-start', { prompt: 'Rank these trip ideas from favorite to least.', candidates: [] }, CONFIG);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('NOTHING to rank');
    expect(findings[0].phaseId).toBe('order'); // deep-linked to the step
  });

  it('flags an empty collect prompt as an error', () => {
    const findings = checkPayload('game-started', { prompt: '   ' }, CONFIG);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('empty prompt'))).toBe(true);
  });

  it('flags unresolved {{tokens}} that reached a student screen', () => {
    const findings = checkPayload('game-started', { prompt: 'Your topic: {{topics.mine}}' }, CONFIG);
    expect(findings.some(f => f.message.includes('unresolved placeholders'))).toBe(true);
  });

  it('flags a multiple-choice step with fewer than 2 choices', () => {
    const findings = checkPayload('game-started', { prompt: 'Pick!', isChoice: true, choices: ['only one'] }, CONFIG);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('at least 2'))).toBe(true);
  });

  it('flags [object Object] goo on a results screen', () => {
    const findings = checkPayload('show-results', { content: 'The class said: [object Object],[object Object]' }, CONFIG);
    expect(findings.some(f => f.severity === 'error' && f.message.includes('[object Object]'))).toBe(true);
  });

  it('flags an empty results screen (no content, image, or video)', () => {
    const findings = checkPayload('show-results', { content: '' }, CONFIG);
    expect(findings.some(f => f.message.includes('showed students nothing'))).toBe(true);
  });

  it('flags empty voting options per mode', () => {
    expect(checkPayload('vote-start', { mode: 'pick-one', candidates: [] }, CONFIG)[0].message).toContain('no options');
    expect(checkPayload('vote-start', { mode: 'head-to-head', matchups: [] }, CONFIG)[0].message).toContain('no matchups');
  });

  it('stays quiet on healthy payloads', () => {
    expect(checkPayload('game-started', { prompt: 'How are you?' }, CONFIG)).toHaveLength(0);
    expect(checkPayload('rank-start', { candidates: ['a', 'b'] }, CONFIG)).toHaveLength(0);
    expect(checkPayload('show-results', { content: 'Nice work everyone!' }, CONFIG)).toHaveLength(0);
    expect(checkPayload('vote-start', { mode: 'pick-one', candidates: [{ playerId: 'p1' }] }, CONFIG)).toHaveLength(0);
  });
});

describe('dedupeFindings', () => {
  it('collapses the same finding reported once per bot', () => {
    const f = { severity: 'error', phaseId: 'order', message: 'NOTHING to rank' };
    expect(dedupeFindings([f, { ...f }, { ...f }, { severity: 'warning', phaseId: null, message: 'other' }]))
      .toHaveLength(2);
  });
});
