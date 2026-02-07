import { describe, it, expect } from 'vitest';
import { AIService } from '../../services/ai-service.js';

describe('AIService', () => {
  describe('creation', () => {
    it('can be created in mock mode by default', () => {
      const service = new AIService();
      expect(service.mode).toBe('mock');
    });

    it('can be created with mode: real', () => {
      const service = new AIService({ mode: 'real' });
      expect(service.mode).toBe('real');
    });
  });

  describe('process()', () => {
    it('returns a Promise', () => {
      const service = new AIService();
      const result = service.process({
        instruction: 'Test instruction',
        responses: []
      });
      expect(result).toBeInstanceOf(Promise);
    });

    it('accepts an instruction and array of responses', async () => {
      const service = new AIService();
      const input = {
        instruction: 'Write a poem about these weekend activities',
        responses: [
          { name: 'Alex', text: 'I went hiking' },
          { name: 'Sam', text: 'I slept' }
        ]
      };

      // Should not throw
      const result = await service.process(input);
      expect(result).toBeDefined();
    });

    it('returns a result object with a text property', async () => {
      const service = new AIService();
      const result = await service.process({
        instruction: 'Test instruction',
        responses: [{ name: 'Test', text: 'Test response' }]
      });

      expect(result).toHaveProperty('text');
      expect(typeof result.text).toBe('string');
    });

    it('includes the number of responses in mock output', async () => {
      const service = new AIService();
      const result = await service.process({
        instruction: 'Test instruction',
        responses: [
          { name: 'Alex', text: 'Response 1' },
          { name: 'Sam', text: 'Response 2' },
          { name: 'Jordan', text: 'Response 3' }
        ]
      });

      expect(result.text).toContain('3');
    });

    it('mock output mentions it is a mock', async () => {
      const service = new AIService();
      const result = await service.process({
        instruction: 'Test instruction',
        responses: [{ name: 'Test', text: 'Test response' }]
      });

      expect(result.text.toLowerCase()).toContain('mock');
    });
  });
});
