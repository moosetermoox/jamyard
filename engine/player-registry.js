export class PlayerRegistry {
  constructor() {
    this.players = new Map();
  }

  add(id, name) {
    const processedName = this.processName(name);
    this.players.set(id, { id, name: processedName, status: 'active' });
  }

  remove(id) {
    this.players.delete(id);
  }

  find(id) {
    return this.players.get(id);
  }

  list() {
    return Array.from(this.players.values());
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
