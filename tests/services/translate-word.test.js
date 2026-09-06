/**
 * AIService.translateWord — the word-help lookup (engine/word-help.js).
 * Mock mode answers deterministically so sim rooms and tests never call
 * out; real mode is exercised only by the JSON extraction shape.
 */
import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

describe('translateWord', () => {
  it('mock mode returns a tagged echo, never null', async () => {
    const service = new AIService({ mode: 'mock' });
    const out = await service.translateWord({ word: 'escuela', sentence: 'Describe tu escuela.', from: 'es', to: 'en' });
    expect(out).toEqual({ translation: '[en] escuela' });
  });

  it('real mode returns null instead of throwing when the call fails', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => { throw new Error('no network'); };
    const out = await service.translateWord({ word: 'escuela', sentence: '', from: 'es', to: 'en' });
    expect(out).toBeNull();
  });

  it('real mode reads the JSON out of a chatty reply', async () => {
    const service = new AIService({ mode: 'real' });
    service._callClaude = async () => ({ content: [{ type: 'text', text: 'Sure! {"translation": "school"}' }] });
    const out = await service.translateWord({ word: 'escuela', sentence: '', from: 'es', to: 'en' });
    expect(out).toEqual({ translation: 'school' });
  });
});
