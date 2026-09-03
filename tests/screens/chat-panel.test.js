/**
 * ChatPanel (screens/designer/chat-panel.js) — the design chat's pure
 * helpers. The DOM wiring is browser-only (guarded on #chat-panel
 * existing); these tests cover the decision logic: when Apply is
 * allowed, and how proposal turns are written into the history the
 * model sees.
 */
import { describe, it, expect } from 'vitest';
import '../../screens/designer/chat-panel.js';

const ChatPanel = globalThis.ChatPanel;

describe('ChatPanel.canApply', () => {
  const config = { phases: { lobby: { type: 'lobby' } } };

  it('allows a clean proposal', () => {
    expect(ChatPanel.canApply({
      updatedConfig: config,
      structural: { errors: [], warnings: ['minor thing'] }
    })).toBe(true);
  });

  it('blocks when structural errors are present', () => {
    expect(ChatPanel.canApply({
      updatedConfig: config,
      structural: { errors: ['step "end" is missing'], warnings: [] }
    })).toBe(false);
  });

  it('blocks a proposal with no config at all', () => {
    expect(ChatPanel.canApply(null)).toBe(false);
    expect(ChatPanel.canApply({ structural: { errors: [] } })).toBe(false);
  });

  it('allows when structural is missing entirely (no validation ran)', () => {
    // The server always attaches structural; a missing block must not
    // brick Apply if that ever regresses.
    expect(ChatPanel.canApply({ updatedConfig: config })).toBe(true);
  });
});

describe('ChatPanel history entries for proposals', () => {
  it('embeds the reply, summary, and status', () => {
    const entry = ChatPanel.historyEntryForProposal('On it.', 'Added a leaderboard.', 'pending');
    expect(entry).toContain('On it.');
    expect(entry).toContain('Added a leaderboard.');
    expect(entry).toMatch(/\| status: pending\]$/);
  });

  it('status rewrites on apply/discard/revert', () => {
    let entry = ChatPanel.historyEntryForProposal('On it.', 'Added a leaderboard.', 'pending');
    entry = ChatPanel.setProposalStatus(entry, 'applied');
    expect(entry).toMatch(/\| status: applied\]$/);
    entry = ChatPanel.setProposalStatus(entry, 'reverted');
    expect(entry).toMatch(/\| status: reverted\]$/);
    expect(entry).toContain('Added a leaderboard.');
  });

  it('setProposalStatus leaves plain messages untouched', () => {
    expect(ChatPanel.setProposalStatus('just a reply', 'applied')).toBe('just a reply');
  });
});

describe('ChatPanel.canJustDoIt', () => {
  const talked = [
    { role: 'user', content: 'Could the vote be head-to-head?' },
    { role: 'assistant', content: 'Yes, and a leaderboard after it would show the standings.' }
  ];

  it('offers the button once the AI has replied at least once', () => {
    expect(ChatPanel.canJustDoIt({ history: talked })).toBe(true);
  });

  it('stays hidden before any AI reply (nothing to just do yet)', () => {
    expect(ChatPanel.canJustDoIt({ history: [] })).toBe(false);
    expect(ChatPanel.canJustDoIt({ history: [{ role: 'user', content: 'hi' }] })).toBe(false);
    expect(ChatPanel.canJustDoIt()).toBe(false);
  });

  it('hides while a reply is in flight or a proposal card is waiting', () => {
    expect(ChatPanel.canJustDoIt({ history: talked, inFlight: true })).toBe(false);
    expect(ChatPanel.canJustDoIt({ history: talked, hasPendingProposal: true })).toBe(false);
  });

  it('sends a fixed, plain message so the transcript stays honest', () => {
    expect(ChatPanel.JUST_DO_IT_TEXT).toBe('Just do it.');
  });
});
