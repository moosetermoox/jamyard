/**
 * A reviewer's word and setup mismatches on jamyard.org (2026-10-02):
 * words that counted what the teacher can change, a list said to be
 * "above" that sits below, the stock "best surprise" line over an
 * activity's own, a "one tap" that is two, a crown button that said
 * End Session, hashes and placeholders in step lines, a tick glued to
 * its word, and a job named twice on a task.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ownHostLine } from '../../engine/phase-handlers/reveal.js';
import { withoutPlaceholderLines } from '../../engine/phases/host-prompt.js';
import { continueLabelForPhase } from '../../engine/phases/continue-labels.js';

const ROOT = new URL('../..', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const json = (rel) => JSON.parse(read(rel));

describe('words never count what the teacher can change', () => {
  it('Class Critique never says how many scales', () => {
    const cc = json('games/class-critique/config.json');
    expect(cc.phases.intro.message).not.toMatch(/\bthree\b|\b\d+ scales\b/i);
    expect(cc.description).not.toMatch(/\bthree\b/i);
    expect(cc.recommendedFor).not.toMatch(/\bthree\b|customize/i);
  });
  it('Draw Gallery never names the drawing time', () => {
    const ag = json('games/art-gallery/config.json');
    expect(ag.phases.intro.message).not.toMatch(/\d+\s*seconds|minute/i);
  });
});

describe('One More Thing says where the list is', () => {
  for (const [label, phases] of [
    ['built-in', json('games/one-more-thing/config.json').phases],
    ['recipe', json('recipes/one-more-thing.json').template.phases]
  ]) {
    it(label + ': the projector gets its own line on both hand-offs, never the student prompt', () => {
      for (const id of ['add-one', 'add-again']) {
        expect(typeof phases[id].hostTemplate).toBe('string');
        expect(phases[id].hostShow).not.toContain('prompt');
      }
      expect(phases['add-one'].prompt).not.toMatch(/\babove\b/);
      expect(typeof phases.returned.content).toBe('string');
      expect(phases.returned.content).not.toMatch(/surprise/);
    });
  }
  it('a returning projector gets the hand-off step\'s own line', () => {
    expect(read('engine/phase-handlers/collect.js')).toContain('{ hostTemplate: sc.hostTemplate, show: sc.hostShow }');
  });
});

describe('a return-to-author reveal uses the activity\'s own projector line', () => {
  it('content first, then hostTemplate (sent once), then the stock line', () => {
    expect(ownHostLine({ content: 'Mine.' }, { hostTemplate: 'Other' }).line).toBe('Mine.');
    const viaTemplate = ownHostLine({}, { hostTemplate: 'Read your list.' });
    expect(viaTemplate.line).toBe('Read your list.');
    expect(viaTemplate.sc.hostTemplate).toBe(null);
    expect(ownHostLine({}, { hostTemplate: null }).line).toMatch(/best surprise/);
    expect(ownHostLine({ chainQuoted: true }, {}).line).toMatch(/feedback/);
  });
});

describe('Closer says what the screen does', () => {
  it('the closing rating is not "one tap" (a pick, then a send)', () => {
    const closer = json('games/closer/config.json');
    expect(closer.phases.checkout.prompt).not.toMatch(/one tap/i);
  });
  it('the recipe says it is the typed version', () => {
    const recipe = json('recipes/closer.json');
    expect(recipe.description).toMatch(/typed version/i);
    expect(recipe.description).toMatch(/nothing to type/i);
  });
});

describe('the crown\'s button says what comes next', () => {
  it('the winner handler sends a continue label, the projector shows it', () => {
    expect(read('engine/phase-handlers/winner.js')).toContain('continueLabel: continueLabelForPhase(phase, engine.config.phases, engine.language)');
    expect(read('screens/host/host.js')).toContain("winnerEndBtn.textContent = continueLabel || UiLang.t('Finish up');");
    expect(read('screens/host/index.html')).not.toContain('<button id="winner-end-btn">End Session</button>');
  });
  it('a crown before the end reads Finish up', () => {
    const phases = { winner: { type: 'winner', next: 'end' }, end: { type: 'end' } };
    expect(continueLabelForPhase(phases.winner, phases, 'en')).toBe('Finish up');
  });
});

describe('step lines carry no markdown or placeholders', () => {
  it('the editor\'s step cards and gists drop heading hashes', () => {
    expect(read('screens/designer/simple-view.js')).toContain(".replace(/^#{1,6}\\s+/gm, '')");
    expect(read('screens/designer/builder-view.js')).toContain(".replace(/^#{1,6}\\s+/gm, '')");
  });
  it('the console\'s step words drop them too', () => {
    expect(read('server.js')).toContain("text = text.replace(/^#{1,6}\\s+/gm, '')");
  });
  it('the projector drops a "Draw this: …" line', () => {
    expect(withoutPlaceholderLines('Draw this: …\n\nNo letters or numbers in your drawing!'))
      .toBe('No letters or numbers in your drawing!');
    expect(withoutPlaceholderLines('Wait… what?')).toBe('Wait… what?');
  });
  it('Doodle Bluff\'s drawing step has a projector line of its own', () => {
    const db = json('games/doodle-bluff/config.json');
    expect(typeof db.phases.draw.hostTemplate).toBe('string');
  });
});

describe('a tick is never glued to its word', () => {
  it('the chart puts a real space before the mark', () => {
    const js = read('screens/shared/chart-render.js');
    const at = js.indexOf("check.className = 'msg-chart-check'");
    expect(js.slice(at - 300, at)).toContain("label.appendChild(document.createTextNode(' '))");
  });
});

describe('a task tagged by its job shows the job once', () => {
  const js = read('screens/player/player.js');
  const start = js.indexOf('function checklistTaskWords');
  const end = js.slice(start).search(/\r?\n\}\r?\n/);
  const body = js.slice(start, start + end) + '\n}';
  // eslint-disable-next-line no-new-func
  const checklistTaskWords = new Function(body + '\nreturn checklistTaskWords;')();
  it('drops the "Job:" lead when the tag is shown', () => {
    expect(checklistTaskWords('Recorder: Summarize the plan', 'Recorder')).toBe('Summarize the plan');
    expect(checklistTaskWords('RECORDER: Summarize the plan', 'Recorder')).toBe('Summarize the plan');
  });
  it('keeps the words when there is no tag, or the lead is something else', () => {
    expect(checklistTaskWords('Recorder: Summarize', null)).toBe('Recorder: Summarize');
    expect(checklistTaskWords('Final check: everyone spoke', 'Recorder')).toBe('Final check: everyone spoke');
  });
});
