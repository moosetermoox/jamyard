/**
 * Join policy — classifies what a join-room attempt MEANS before the
 * server touches any state. Pure: reads the registry, mutates nothing.
 *
 * Kinds:
 *   - reconnect:  a disconnected player coming back (token match, or the
 *                 name fallback for a student whose tab lost its token)
 *   - takeover:   the SAME student joining again while their old tab is
 *                 still connected (a duplicated tab copies sessionStorage,
 *                 so the token matches a connected player). The room should
 *                 move their seat to the new socket, never seat a copy.
 *   - name-taken: a typed name that a still-connected player is already
 *                 using. Blocks the double-join-in-a-new-tab case; a real
 *                 classmate with the same name can add a last initial.
 *   - fresh:      a brand-new player.
 *
 * Anonymous rooms never produce name-taken: typed names are discarded
 * unread there, so a duplicate typed name means nothing.
 */
export function classifyJoin(players, { token, name, anonymousRoom }) {
  const byToken = token ? players.findByToken(token) : undefined;
  if (byToken) {
    return { kind: byToken.connected ? 'takeover' : 'reconnect', player: byToken };
  }

  // Name fallback for reconnects predates the name-taken guard and must
  // win over it: a disconnected "Alex" rejoining IS that Alex.
  const fallbackName = name || 'Anonymous';
  const byName = players.findByName(fallbackName);
  if (byName && !byName.connected) {
    return { kind: 'reconnect', player: byName };
  }

  const typed = String(name || '').trim().toLowerCase();
  if (!anonymousRoom && typed) {
    const clash = players.list().find(
      (p) => p.connected && p.name.toLowerCase() === typed
    );
    if (clash) return { kind: 'name-taken', player: clash };
  }

  return { kind: 'fresh' };
}
