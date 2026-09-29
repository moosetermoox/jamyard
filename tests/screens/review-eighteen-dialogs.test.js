/**
 * Review eighteen: stacked "Show them all to the class?" boxes after three
 * presses of Approve & show, and a "Nobody has answered yet" box that
 * stayed up over "1 of 1" after Draw Gallery's clock ran out and the
 * drawing sent itself a moment later.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dialogSrc = readFileSync(new URL('../../screens/shared/dialog.js', import.meta.url), 'utf8');
const host = readFileSync(new URL('../../screens/host/host.js', import.meta.url), 'utf8');

// Just enough DOM for Dialog.confirm to open a box
function fakeDom() {
  const made = [];
  function el(tag) {
    const node = {
      tag, children: [], attrs: {}, listeners: {}, style: {}, className: '', textContent: '',
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      remove() { this.removed = true; },
      focus() {},
      querySelectorAll() { return []; },
      click() { (this.listeners.click || []).forEach(f => f({ target: this })); }
    };
    made.push(node);
    return node;
  }
  const document = {
    activeElement: null,
    head: el('head'), body: Object.assign(el('body'), { contains: () => true }),
    createElement: el,
    getElementById: () => null,
    addEventListener() {}, removeEventListener() {}
  };
  return { document, made };
}

function loadDialog() {
  const { document, made } = fakeDom();
  const ctx = { document, window: { addEventListener() {} }, Promise };
  ctx.globalThis = ctx;
  vm.runInNewContext(dialogSrc, ctx);
  return { Dialog: ctx.Dialog, made };
}

describe('Dialog.confirm asks one question at a time', () => {
  it('a second ask while one is open answers no at once', async () => {
    const { Dialog, made } = loadDialog();
    const first = Dialog.confirm({ title: 'Show them all to the class?' });
    const second = await Dialog.confirm({ title: 'Show them all to the class?' });
    expect(second).toBe(false);
    expect(made.filter(n => n.className === 'dlg-confirm-overlay').length).toBe(1);
    Dialog.dismiss();
    expect(await first).toBe(false);
    // and once answered, the next ask opens again
    const third = Dialog.confirm({ title: 'Again?' });
    expect(made.filter(n => n.className === 'dlg-confirm-overlay').length).toBe(2);
    Dialog.dismiss();
    expect(await third).toBe(false);
  });
});

describe('the projector waits for the clock', () => {
  it('a clock that runs out gives the last answers a moment, never a bare click', () => {
    expect(host).toMatch(/startTimer\(timer, collectTimer, closeWhenClockRunsOut\)/);
    expect(host).toMatch(/const CLOCK_GRACE_MS = \d+/);
  });
  it('an answer that lands takes the nobody box down', () => {
    const recv = host.slice(host.indexOf("socket.on('response-received'"));
    expect(recv.slice(0, 400)).toMatch(/answersLanded\(\)/);
    const cnt = host.slice(host.indexOf("socket.on('submission-count'"));
    expect(cnt.slice(0, 400)).toMatch(/answersLanded\(\)/);
    expect(host).toMatch(/Dialog\.dismiss\(\)/);
  });
});
