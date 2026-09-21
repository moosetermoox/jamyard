/**
 * The console's answer door for a guessing step (2026-09-20, storyboard
 * probe follow-up): a teacher's private number (the jar count, known only
 * once the guesses are in) is typed on the console before the close and
 * becomes the step's answer, so the close scores the closest guess. This
 * guards the wire: the event names exist, the payload schema demands a
 * number, and the console's HTML carries the box. The room behaviour is
 * proven by scripts/simulate-estimate-answer.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validatePayload } from '../../engine/event-schemas.js';
import { EVENTS } from '../../engine/events.js';

describe('estimate-set-answer', () => {
  it('has its event names', () => {
    expect(EVENTS.ESTIMATE_SET_ANSWER).toBe('estimate-set-answer');
    expect(EVENTS.TEACHER_ESTIMATE_ANSWER).toBe('teacher-estimate-answer');
  });

  it('accepts a numeric answer with the room code', () => {
    expect(validatePayload('estimate-set-answer', { code: 'ABCD', answer: 930 })).toEqual({ ok: true });
    expect(validatePayload('estimate-set-answer', { code: 'ABCD', answer: 12.5, phaseInstanceId: 3 })).toEqual({ ok: true });
  });

  it('rejects a missing or non-numeric answer', () => {
    expect(validatePayload('estimate-set-answer', { code: 'ABCD' }).ok).toBe(false);
    expect(validatePayload('estimate-set-answer', { code: 'ABCD', answer: '930' }).ok).toBe(false);
  });

  it('the console has the answer box, wired to the event, hidden until a guessing step is open', () => {
    const html = readFileSync(new URL('../../screens/teacher/index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/id="answer-block"[^>]*hidden/);
    expect(html).toContain('id="answer-input"');
    expect(html).toContain('id="set-answer-btn"');
    const js = readFileSync(new URL('../../screens/teacher/teacher.js', import.meta.url), 'utf8');
    expect(js).toContain("socket.emit('estimate-set-answer'");
    expect(js).toContain("socket.on('teacher-estimate-answer'");
    expect(js).toMatch(/phaseType === 'estimate' && !data\.closed/);
  });

  it('the server sends the standing answer to consoles and takes the event from teachers only', () => {
    const server = readFileSync(new URL('../../server.js', import.meta.url), 'utf8');
    expect((server.match(/estimateAnswer: estimateAnswerFor\(room, phase\)/g) || []).length).toBe(2);
    expect(server).toContain('snap.estimateAnswer = estimateAnswerFor(room, phase)');
    const handler = server.slice(server.indexOf('socket.on(EVENTS.ESTIMATE_SET_ANSWER'));
    const body = handler.slice(0, handler.indexOf('});'));
    expect(body).toContain('isTeacherSocket(code, room, socket.id)');
    expect(body).toContain('room.phaseState.closed) return');
    expect(body).toContain('isStalePhaseEvent(room, phaseInstanceId');
  });
});
