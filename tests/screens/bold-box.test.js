/**
 * Bold box (screens/shared/bold-box.js): the Simple-view field that shows
 * bold as bold while the config keeps "**word**" (what rich-text.js
 * renders bold on the projector and student screens). The invariant under
 * test is the round trip: text -> nodes -> text is lossless for anything
 * the marker grammar can express, and any HTML the browser sneaks in
 * collapses back to text plus double stars.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import '../../screens/shared/bold-box.js';

const B = globalThis.BoldBox;

// A tiny node tree standing in for the DOM: enough for render() and
// serializeNodes(), nothing else.
function text(value) { return { nodeType: 3, nodeName: '#text', nodeValue: value, childNodes: [] }; }
function elem(name, children, style) {
  const node = { nodeType: 1, nodeName: name.toUpperCase(), childNodes: children || [], style: style || {} };
  node.appendChild = (c) => { node.childNodes.push(c); return c; };
  Object.defineProperty(node, 'textContent', {
    get() { return node.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join(''); },
    set(v) { node.childNodes = v === '' ? [] : [text(String(v))]; }
  });
  return node;
}

beforeEach(() => {
  globalThis.document = {
    createElement: (tag) => elem(tag),
    createTextNode: (v) => text(v)
  };
});

function roundTrip(s) {
  const root = elem('div');
  B.render(root, s);
  return B.serializeNodes(root);
}

describe('runs', () => {
  it('splits a line into plain and bold runs', () => {
    expect(B.runs('Write **one** word')).toEqual([
      { text: 'Write ', bold: false }, { text: 'one', bold: true }, { text: ' word', bold: false }
    ]);
  });
  it('leaves unmatched or empty stars literal', () => {
    expect(B.runs('2 ** 3 = 8')).toEqual([{ text: '2 ** 3 = 8', bold: false }]);
    expect(B.runs('****')).toEqual([{ text: '****', bold: false }]);
  });
});

describe('round trip', () => {
  it('is lossless for plain, bold, multi-line and blank-line text', () => {
    const cases = [
      '',
      'Just words.',
      'Write **one** word about today.',
      '**Headline**\nThen a line\n\nAfter a blank line',
      'Two **bold** words **here**',
      'stars 2 ** 3 stay'
    ];
    cases.forEach(s => expect(roundTrip(s)).toBe(s));
  });

  it('renders bold as <b> nodes and newlines as <br>', () => {
    const root = elem('div');
    B.render(root, 'a **b**\nc');
    expect(root.childNodes.map(n => n.nodeName)).toEqual(['#text', 'B', 'BR', '#text']);
    expect(root.childNodes[1].textContent).toBe('b');
  });
});

describe('serializeNodes on browser-made trees', () => {
  it('turns Chrome-style div lines into newlines, once each', () => {
    const root = elem('div', [
      text('first'),
      elem('div', [elem('br')]),
      elem('div', [text('third')])
    ]);
    expect(B.serializeNodes(root)).toBe('first\n\nthird');
  });

  it('accepts strong, b, and bold font-weight spans, and merges neighbours', () => {
    const root = elem('div', [
      elem('strong', [text('one ')]),
      elem('span', [text('two')], { fontWeight: 'bold' }),
      text(' plain '),
      elem('span', [text('700')], { fontWeight: '700' })
    ]);
    expect(B.serializeNodes(root)).toBe('**one two** plain **700**');
  });

  it('never lets bold cross a line break, and skips whitespace-only bold', () => {
    const root = elem('div', [
      elem('b', [text('top'), elem('br'), text('bottom')]),
      elem('b', [text('  ')])
    ]);
    expect(B.serializeNodes(root)).toBe('**top**\n**bottom**  ');
  });

  it('lets an explicit normal weight un-bold part of a <b> (how the browser toggles off)', () => {
    const root = elem('div', [
      elem('b', [text('keep '), elem('span', [text('loose')], { fontWeight: 'normal' }), text(' keep')])
    ]);
    expect(B.serializeNodes(root)).toBe('**keep** loose **keep**');
  });

  it('drops the trailing <br> the browser leaves behind', () => {
    const root = elem('div', [text('done'), elem('br')]);
    expect(B.serializeNodes(root)).toBe('done');
  });

  it('keeps nothing but text and stars from foreign markup', () => {
    const root = elem('div', [
      elem('a', [text('link')]),
      elem('span', [text(' colored')], { color: 'red' }),
      elem('i', [text(' italic')])
    ]);
    expect(B.serializeNodes(root)).toBe('link colored italic');
  });
});
