/**
 * The owner's calls after two outside reviews (2026-09-24):
 *   - the editor always autosaves, so the Save button is gone
 *   - Try it out's projector shrinks the join code and QR (one viewer)
 *   - the console's Before you project card carries a drawn picture of
 *     the two windows
 *   - a teacher's own activity gets AI-written sample answers, once,
 *     saved on the copy; a template never does
 *   - the joke row says what it is
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AIService } from '../../services/ai-service.js';
import { validateSampleAnswers } from '../../engine/sample-answers.js';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

describe('the editor always autosaves', () => {
  it('has no Save button, saves a brand-new activity on its first edit, and keeps saveGame for Host it now', () => {
    expect(read('screens/designer/editor.html')).not.toContain('id="save-btn"');
    const js = read('screens/designer/editor.js');
    expect(js).not.toContain('if (!gameId && !isDraftCopy) return;');
    expect(js).toContain("if (saveBtn) saveBtn.addEventListener('click', saveGame);");
    expect(js).toContain("var btn = saveBtn || { disabled: false, textContent: 'Save' };");
    expect(js).toContain('await saveGame();');
  });
});

describe('the bench projector', () => {
  it('shrinks the doorway card, the code blocks, and the QR inside Try it out', () => {
    const css = read('screens/host/styles.css');
    expect(css).toContain('body.in-bench #rolling-door { width: 210px;');
    expect(css).toMatch(/body\.in-bench \.rolling-door-code \.code-block \{ width: 42px/);
    expect(css).toContain('body.in-bench .rolling-door-qr { max-width: 110px;');
    expect(css).toContain('body.in-bench.rolling section.active { padding-right: 240px; }');
    expect(css).toMatch(/body\.in-bench #room-code \.code-block \{ width: 62px/);
  });
});

describe('the console card shows the two windows', () => {
  it('draws the console tab, the class screen, and the drag arrow, decorative beside the words', () => {
    const html = read('screens/teacher/index.html');
    const i = html.indexOf('<svg class="setup-picture"');
    expect(i).toBeGreaterThan(0);
    const svg = html.slice(i, html.indexOf('</svg>', i));
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('Teacher console');
    expect(svg).toContain('Class screen');
    expect(svg).toContain('drag this tab to the projector');
    expect(svg).not.toMatch(/AI/);
    expect(read('screens/teacher/styles.css')).toContain('.setup-picture .sp-arrow');
  });
});

describe('the joke row says what it is', () => {
  it('on the make page and in the editor', () => {
    expect(read('screens/make/make.js')).toContain("rowEl('Dad joke for the first students to join')");
    expect(read('screens/designer/editor.html')).toContain('<label for="game-early-joke">Dad joke for the first students to join</label>');
  });
});

describe('sample answers for a teacher\'s own activity', () => {
  const config = {
    name: 'Convention',
    description: 'Every delegate gets a state and writes a clause.',
    phases: {
      lobby: { type: 'lobby', next: 'write' },
      write: { type: 'collect', prompt: 'You represent {{write.assigned}}. Write one clause.', dealItems: ['Virginia', 'Georgia'], next: 'ticket' },
      ticket: { type: 'collect', prompt: 'Two things.', fields: [{ key: 'a', label: 'One thing you learned' }, { key: 'b', label: 'One question' }], next: 'draw' },
      draw: { type: 'collect', prompt: 'Draw it.', inputType: 'drawing', next: 'end' },
      end: { type: 'end' }
    }
  };

  it('writes a valid set per text step in mock mode, skipping drawing steps', async () => {
    const service = new AIService({ mode: 'mock' });
    const { sampleAnswers } = await service.writeSampleAnswers({ config, seats: 4 });
    expect(Object.keys(sampleAnswers).sort()).toEqual(['ticket', 'write']);
    expect(sampleAnswers.write.length).toBe(4);
    expect(sampleAnswers.ticket[0]).toEqual(['One thing you learned: sample 1', 'One question: sample 1']);
    expect(validateSampleAnswers({ ...config, sampleAnswers }, 'x')).toEqual([]);
  });

  it('tells the model the steps, the fields, and the dealt items, and cleans what comes back', async () => {
    const service = new AIService({ mode: 'real' });
    let prompt = '';
    service._callClaude = async (params) => {
      prompt = params.messages[0].content;
      return { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'Sure:\n' + JSON.stringify({
        write: ['Virginia needs a say in taxes — every state does.', 'Georgia wants its ports open.', '', 'x'],
        ticket: [['Fractions are division', 'Why do we flip?'], 'just one string', ['', '']],
        draw: ['should be ignored']
      }) }] };
    };
    const { sampleAnswers } = await service.writeSampleAnswers({ config, seats: 5 });
    expect(prompt).toContain('step "write"');
    expect(prompt).toContain('privately handed one of: Virginia; Georgia');
    expect(prompt).toContain('"One thing you learned", "One question"');
    expect(prompt).not.toContain('{{write.assigned}}');
    expect(prompt).toContain('Write exactly 5 answers');
    expect(sampleAnswers.write).toEqual(['Virginia needs a say in taxes, every state does.', 'Georgia wants its ports open.']);
    expect(sampleAnswers.ticket).toEqual([['Fractions are division', 'Why do we flip?'], ['just one string', '']]);
    expect(sampleAnswers.draw).toBeUndefined();
    expect(validateSampleAnswers({ ...config, sampleAnswers }, 'x')).toEqual([]);
  });

  it('is null for an activity with nothing to answer', async () => {
    const service = new AIService({ mode: 'mock' });
    const { sampleAnswers } = await service.writeSampleAnswers({ config: { phases: { lobby: { type: 'lobby' }, end: { type: 'end' } } } });
    expect(sampleAnswers).toBe(null);
  });

  it('is wired: the route refuses a built-in and saves the set, the bench asks once when a copy has none', () => {
    const server = read('server.js');
    expect(server).toContain("app.post('/api/games/:gameId/sample-answers'");
    expect(server).toContain('A ready-made activity keeps its own sample answers.');
    expect(server).toContain('validateSampleAnswers(next, gameId)');
    const bench = read('screens/prototype/prototype.js');
    expect(bench).toContain('if (config && !config.sampleAnswers) writeSamplesFor(gameId);');
    expect(bench).toContain("'/sample-answers?seats=' + MAX_PLAYERS, { method: 'POST' }");
  });
});
