/**
 * Reveal styles on the screens (2026-09-30): the shared chart module
 * parses the cloud and card line shapes and draws them, both sinks hand
 * every drawn segment to it, both stylesheets style it, and the prompts
 * name the styles.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// A tiny document: enough of createElement for the builders
function fakeEl(tag) {
  const el = {
    tag, className: '', textContent: '', title: '', style: {}, children: [],
    appendChild(c) { this.children.push(c); return c; }
  };
  return el;
}

let ChartRender;
beforeAll(() => {
  globalThis.window = globalThis.window || {};
  globalThis.document = { createElement: fakeEl };
  // The module is a browser IIFE that hangs itself on window
  new Function(read('screens/shared/chart-render.js'))();
  ChartRender = globalThis.window.ChartRender;
});

describe('chart-render: the cloud and the cards', () => {
  it('spots the shapes and splits them out of the text', () => {
    expect(ChartRender.containsChart('water ×3\nsun ×2')).toBe(true);
    expect(ChartRender.containsChart('◆ an answer')).toBe(true);
    expect(ChartRender.containsChart('plain words, 3 × 4 = 12')).toBe(false);
    const segs = ChartRender.split('What we said:\n\nwater ×3\nsun ×2\n\nAnd every one:\n◆ Water and the sun\n◆ the wind');
    expect(segs.map(s => s.type)).toEqual(['text', 'cloud', 'text', 'cards']);
    expect(segs[1].rows).toEqual([{ word: 'water', count: 3 }, { word: 'sun', count: 2 }]);
    expect(segs[3].rows).toEqual(['Water and the sun', 'the wind']);
  });
  it('draws the cloud sized by count with the biggest in the accent, and the cards one each', () => {
    const cloud = ChartRender.buildCloud([{ word: 'water', count: 4 }, { word: 'sun', count: 1 }, { word: 'wind', count: 2 }]);
    expect(cloud.className).toBe('msg-cloud');
    expect(cloud.children.length).toBe(3);
    const water = cloud.children.find(c => c.textContent === 'water');
    const sun = cloud.children.find(c => c.textContent === 'sun');
    expect(water.className).toContain('top');
    expect(parseFloat(water.style.fontSize)).toBeGreaterThan(parseFloat(sun.style.fontSize));
    expect(water.style.fontSize).toBe('3.00em');
    const cards = ChartRender.buildCards(['one', 'two']);
    expect(cards.className).toBe('msg-cards');
    expect(cards.children.map(c => c.textContent)).toEqual(['one', 'two']);
    expect(ChartRender.buildSegment({ type: 'cloud', rows: [{ word: 'x', count: 1 }] }).className).toBe('msg-cloud');
    expect(ChartRender.buildSegment({ type: 'text', text: 'x' })).toBe(null);
  });
});

describe('the screens and the prompts', () => {
  it('both sinks draw every segment through the shared builder, both stylesheets style the shapes', () => {
    for (const p of ['screens/host/host.js', 'screens/player/player.js']) {
      expect(read(p)).toContain('ChartRender.buildSegment(seg)');
    }
    for (const p of ['screens/host/styles.css', 'screens/player/styles.css']) {
      const css = read(p);
      expect(css).toContain('.msg-cloud {');
      expect(css).toContain('.msg-cloud-word.top {');
      expect(css).toContain('.msg-cards {');
      expect(css).toContain('.msg-card {');
    }
  });
  it('the prompts name the styles and the random student', () => {
    const ai = read('services/ai-service.js');
    expect(ai).toContain('style (optional) = "cloud"');
    expect(ai).toContain('{{players.random}}');
    expect(ai).toContain('.responses.cloud (a sized word cloud of the answers');
    expect(ai).toContain('reveal (optional "style": "cloud"');
  });
});
