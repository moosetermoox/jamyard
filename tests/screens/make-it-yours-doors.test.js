/**
 * The doors that close every Make it yours dialog (2026-09-07, owner's
 * call): a preferred path. One big Launch beside a smaller "Continue setup
 * in the designer"; Launch opens the two ways to run it, with pretend
 * students or with the class. Shared by the yard's dialogs and the Create
 * page's recipe match (screens/shared/make-it-yours-doors.js).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

function fakeEl(tag) {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(),
    className: '',
    hidden: false,
    textContent: '',
    title: '',
    type: '',
    disabled: false,
    focused: false,
    attrs: {},
    children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(child) { this.children.push(child); return child; },
    focus() { this.focused = true; },
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    fire(name, ev) { (listeners[name] || []).forEach(fn => fn(ev || {})); },
    find(cls) {
      for (const c of this.children) {
        if (c.className.split(/\s+/).includes(cls)) return c;
        const deeper = c.find(cls);
        if (deeper) return deeper;
      }
      return null;
    }
  };
}

beforeEach(async () => {
  globalThis.window = globalThis;
  globalThis.document = { createElement: (tag) => fakeEl(tag) };
  vi.resetModules();
  delete globalThis.MakeItYoursDoors;
  await import('../../screens/shared/make-it-yours-doors.js');
});

const D = () => globalThis.MakeItYoursDoors;

describe('MakeItYoursDoors.build', () => {
  it('fronts a smaller designer door and a bigger Launch; the two ways to run wait behind Launch', () => {
    const { row } = D().build(() => {});
    expect(row.className).toBe('make-it-yours-doors');
    const designer = row.find('door-designer');
    const launch = row.find('door-launch');
    expect(designer.textContent).toBe('Continue setup in the designer');
    expect(launch.textContent).toBe('Launch');
    expect(launch.getAttribute('aria-expanded')).toBe('false');
    expect(designer.type).toBe('button');
    expect(launch.type).toBe('button');
    const launchRow = row.find('doors-launch');
    expect(launchRow.hidden).toBe(true);
    expect(row.find('door-simulate').textContent).toBe('Try it out with pretend students');
    expect(row.find('door-host').textContent).toBe('Host it now');
    // No HTML sinks: every label lands through textContent.
    expect(JSON.stringify(row)).not.toContain('innerHTML');
  });

  it('Launch opens the two ways and focuses the first; it never picks by itself', () => {
    const picks = [];
    const { row } = D().build((dest) => picks.push(dest));
    const launch = row.find('door-launch');
    launch.fire('click');
    expect(picks).toEqual([]);
    expect(row.find('doors-launch').hidden).toBe(false);
    expect(launch.getAttribute('aria-expanded')).toBe('true');
    expect(launch.className).toContain('is-open');
    expect(row.find('door-simulate').focused).toBe(true);
    launch.fire('click');
    expect(row.find('doors-launch').hidden).toBe(true);
    expect(launch.getAttribute('aria-expanded')).toBe('false');
  });

  it('each real door reports its destination, and says so on the button while the copy is made', () => {
    const picks = [];
    const { row } = D().build((dest) => picks.push(dest), { busyLabel: 'Making your copy…' });
    row.find('door-host').fire('click');
    expect(picks).toEqual(['host']);
    expect(row.find('door-host').textContent).toBe('Making your copy…');
    row.find('door-simulate').fire('click');
    row.find('door-designer').fire('click');
    expect(picks).toEqual(['host', 'simulate', 'designer']);
  });

  it('without a busy label the button keeps its words (the copy is already saved)', () => {
    const { row } = D().build(() => {});
    row.find('door-simulate').fire('click');
    expect(row.find('door-simulate').textContent).toBe('Try it out with pretend students');
  });

  it('setDisabled greys every door and restores the labels on release', () => {
    const doors = D().build(() => {}, { busyLabel: 'Making your copy…' });
    const { row } = doors;
    row.find('door-designer').fire('click');
    doors.setDisabled(true);
    ['door-designer', 'door-launch', 'door-simulate', 'door-host'].forEach((cls) => {
      expect(row.find(cls).disabled).toBe(true);
    });
    doors.setDisabled(false);
    expect(row.find('door-designer').disabled).toBe(false);
    expect(row.find('door-designer').textContent).toBe('Continue setup in the designer');
  });
});
