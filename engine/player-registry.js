/**
 * PlayerRegistry — per-room roster bookkeeping.
 *
 * Tracks each player's identity (id, processed display name, reconnect token)
 * and two independent axes of state:
 *   - status:    'active' vs 'eliminated' (gameplay — elimination games)
 *   - connected: true/false (network — survives a wifi blip via the token)
 *
 * Helpers here answer "who is still in?", "who can vote?", etc. Use
 * `listPublic()` when sending to clients — it strips reconnect tokens so they
 * never reach the browser.
 */
export class PlayerRegistry {
  constructor() {
    this.players = new Map();
  }

  add(id, name, token) {
    const processedName = this.processName(name);
    this.players.set(id, { id, name: processedName, status: 'active', connected: true, token: token || null });
  }

  remove(id) {
    this.players.delete(id);
  }

  find(id) {
    return this.players.get(id);
  }

  findByName(name) {
    for (const player of this.players.values()) {
      if (player.name === name) return player;
    }
    return undefined;
  }

  findByToken(token) {
    if (!token) return undefined;
    for (const player of this.players.values()) {
      if (player.token === token) return player;
    }
    return undefined;
  }

  list() {
    return Array.from(this.players.values());
  }

  /** Returns player list without tokens — safe to send to clients. */
  listPublic() {
    return this.list().map(({ token, ...rest }) => rest);
  }

  count() {
    return this.players.size;
  }

  eliminate(id) {
    const player = this.players.get(id);
    if (player) {
      this.players.set(id, { ...player, status: 'eliminated' });
    }
  }

  disconnect(id) {
    const player = this.players.get(id);
    if (player) {
      this.players.set(id, { ...player, connected: false, disconnectedAt: Date.now() });
    }
  }

  reconnect(oldId, newId) {
    const player = this.players.get(oldId);
    if (!player) return false;
    this.players.delete(oldId);
    this.players.set(newId, { ...player, id: newId, connected: true, disconnectedAt: undefined });
    return true;
  }

  cleanupDisconnected(graceMs) {
    const now = Date.now();
    for (const [id, player] of this.players) {
      if (!player.connected && player.disconnectedAt && (now - player.disconnectedAt) >= graceMs) {
        this.players.delete(id);
      }
    }
  }

  getRemaining() {
    return this.list().filter(p => p.status === 'active');
  }

  getEliminated() {
    return this.list().filter(p => p.status === 'eliminated');
  }

  isEliminated(id) {
    const player = this.players.get(id);
    return player ? player.status === 'eliminated' : false;
  }

  update(id, data) {
    const player = this.players.get(id);
    if (player) {
      this.players.set(id, { ...player, ...data });
    }
  }

  processName(name) {
    let processedName = name || 'Anonymous';

    if (processedName.length > 20) {
      processedName = processedName.slice(0, 20);
    }

    if (processedName.length < 2) {
      throw new Error(`Name must be at least 2 characters, got '${processedName}'`);
    }

    return this.makeUnique(processedName);
  }

  makeUnique(name) {
    const existingNames = this.list().map(p => p.name);

    if (!existingNames.includes(name)) {
      return name;
    }

    let counter = 2;
    while (existingNames.includes(name + counter)) {
      counter++;
    }
    return name + counter;
  }
}
