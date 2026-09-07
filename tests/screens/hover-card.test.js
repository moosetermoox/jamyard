/**
 * Shared hover card (2026-09-07): the yard's "description without the
 * click" card, now one module (/shared/hover-card.js) so the home shelf's
 * tiles carry the same card. One floating scrap, a beat of delay, the
 * shared meta line (play time, no winners, rolling start), hidden again
 * on leave and on click.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal element stand-in: a class, children, listeners, a text slot,
// and a steerable bounding box.
function fakeEl(tag) {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(),
    id: '',
    className: '',
    hidden: false,
    textContent: '',
    style: {},
    attrs: {},
    children: [],
    offsetWidth: 300,
    offsetHeight: 120,
    rect: { left: 40, top: 100, bottom: 140 },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(sel) {
      const cls = sel.replace(/^\./, '');
      return this.children.find(c => c.className === cls) || null;
    },
    getBoundingClientRect() { return this.rect; },
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    fire(name, ev) { (listeners[name] || []).forEach(fn => fn(ev || {})); }
  };
}

let body;

beforeEach(async () => {
  vi.useFakeTimers();
  body = fakeEl('body');
  globalThis.window = globalThis;
  globalThis.innerWidth = 1000;
  globalThis.innerHeight = 800;
  globalThis.document = {
    createElement: (tag) => fakeEl(tag),
    body
  };
  vi.resetModules();
  delete globalThis.HoverCard;
  await import('../../screens/shared/hover-card.js');
});

const H = () => globalThis.HoverCard;

describe('HoverCard.metaLine', () => {
  it('joins play time, the no-winners note, and the rolling-start tag', () => {
    expect(H().metaLine({ playTime: '5 min' })).toBe('5 min');
    expect(H().metaLine({ playTime: '10 min', family: 'connection' })).toBe('10 min · no scores, no winners');
    expect(H().metaLine({ playTime: '5 min', start: 'rolling' })).toBe('5 min · rolling start');
    expect(H().metaLine({})).toBe('');
  });
});

describe('HoverCard.attach', () => {
  it('shows one shared card after a beat, filled through textContent', () => {
    const tile = fakeEl('a');
    H().attach(tile, { name: 'Exit Ticket', description: 'One question <b>on the way out</b>.', playTime: '5 min', start: 'rolling' });
    tile.fire('mouseenter');
    expect(body.children.length).toBe(0); // not yet: sweeping across a row must not flash cards
    vi.advanceTimersByTime(250);
    expect(body.children.length).toBe(1);
    const card = body.children[0];
    expect(card.id).toBe('plank-hovercard');
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.hovercard-name').textContent).toBe('Exit Ticket');
    expect(card.querySelector('.hovercard-meta').textContent).toBe('5 min · rolling start');
    expect(card.querySelector('.hovercard-desc').textContent).toBe('One question <b>on the way out</b>.');
    // Below the tile
    expect(card.style.top).toBe('148px');
    expect(card.style.left).toBe('40px');
  });

  it('hides the meta row when there is nothing to say', () => {
    const tile = fakeEl('a');
    H().attach(tile, { name: 'Plain', description: 'x' });
    tile.fire('mouseenter');
    vi.advanceTimersByTime(250);
    expect(body.children[0].querySelector('.hovercard-meta').hidden).toBe(true);
  });

  it('hides on leave and on click, and a quick pass never shows it', () => {
    const tile = fakeEl('a');
    H().attach(tile, { name: 'A', description: 'a' });
    tile.fire('mouseenter');
    tile.fire('mouseleave');
    vi.advanceTimersByTime(500);
    expect(body.children.length).toBe(0);
    tile.fire('mouseenter');
    vi.advanceTimersByTime(250);
    expect(body.children[0].hidden).toBe(false);
    tile.fire('click');
    expect(body.children[0].hidden).toBe(true);
  });

  it('reuses the one card across tiles and flips above near the bottom edge', () => {
    const a = fakeEl('a');
    const b = fakeEl('a');
    b.rect = { left: 900, top: 700, bottom: 740 };
    H().attach(a, { name: 'A', description: 'a' });
    H().attach(b, { name: 'B', description: 'b' });
    a.fire('mouseenter');
    vi.advanceTimersByTime(250);
    a.fire('mouseleave');
    b.fire('mouseenter');
    vi.advanceTimersByTime(250);
    expect(body.children.length).toBe(1);
    const card = body.children[0];
    expect(card.querySelector('.hovercard-name').textContent).toBe('B');
    // Clamped to the window on the right, flipped above the tile
    expect(card.style.left).toBe((1000 - 300 - 8) + 'px');
    expect(card.style.top).toBe((700 - 120 - 8) + 'px');
  });
});
