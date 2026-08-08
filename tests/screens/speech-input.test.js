/**
 * Speech input (mic button) — the module attaches Speech to globalThis via a
 * side-effect import. Node has no SpeechRecognition, which is itself the
 * unsupported-browser path we need to prove degrades cleanly.
 */
import { describe, it, expect } from 'vitest';
import '../../screens/shared/speech-input.js';

const Speech = globalThis.Speech;

describe('speech-input mergeTranscript', () => {
  it('appends a transcript to existing text with one space', () => {
    expect(Speech.mergeTranscript('I would fix', 'the schedule')).toBe('I would fix the schedule');
  });

  it('does not double a space the typist already left', () => {
    expect(Speech.mergeTranscript('I would fix ', 'the schedule')).toBe('I would fix the schedule');
  });

  it('empty box just takes the transcript, trimmed', () => {
    expect(Speech.mergeTranscript('', '  hello there  ')).toBe('hello there');
  });

  it('empty transcript never disturbs the box', () => {
    expect(Speech.mergeTranscript('typed text', '')).toBe('typed text');
    expect(Speech.mergeTranscript('typed text', '   ')).toBe('typed text');
    expect(Speech.mergeTranscript('', '')).toBe('');
  });

  it('handles null/undefined safely', () => {
    expect(Speech.mergeTranscript(null, 'hi')).toBe('hi');
    expect(Speech.mergeTranscript(undefined, undefined)).toBe('');
  });
});

describe('speech-input unsupported browser', () => {
  it('reports unsupported without SpeechRecognition', () => {
    expect(Speech.isSupported()).toBe(false);
  });

  it('attachMic renders nothing when unsupported', () => {
    expect(Speech.attachMic({ dataset: {} })).toBeNull();
  });

  it('stopAll is a safe no-op with nothing active', () => {
    expect(() => Speech.stopAll()).not.toThrow();
  });
});
