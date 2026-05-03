import { registerHandler } from './phase-registry.js';
import { EVENTS } from '../events.js';

registerHandler('collect-choice', {
  async onEnter(ctx) {
    const { phase, engine } = ctx;
    const from = phase.from || 'all';
    const eligible = ctx.getEligibleVoters(from);
    const eligibleIds = new Set(eligible.map(p => p.id));
    const sc = ctx.resolveScreenControl();

    // Self-exclusion: if inside foreach and author is set, exclude them
    const authorId = phase._foreachAuthorId || null;

    // Resolve choices — literal array or data ref string
    let choices = phase.choices;
    if (typeof choices === 'string') {
      choices = engine.resolve(choices);
      if (!Array.isArray(choices)) choices = [];
    }

    // Clear previous responses
    for (const p of engine.players.list()) {
      if (p.response) engine.players.update(p.id, { response: undefined });
    }

    // Send to host (resolve refs once for host view)
    const hostPrompt = ctx.resolveTemplate(phase.prompt || '');
    ctx.emitToHost(EVENTS.GAME_STARTED, {
      prompt: hostPrompt,
      choices,
      timer: phase.timer || null,
      isChoice: true,
      hostTemplate: sc.hostTemplate, show: sc.hostShow
    });

    // Send to eligible players (excluding author if self-exclude)
    for (const player of eligible) {
      if (authorId && player.id === authorId) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'This one is yours! Waiting for others to guess...' });
        continue;
      }
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(phase.prompt || '', engine, player.id);
      ctx.emitToPlayer(player.id, EVENTS.GAME_STARTED, {
        prompt: playerPrompt,
        choices,
        timer: phase.timer || null,
        isChoice: true,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }

    // Send waiting to non-eligible players
    for (const player of engine.players.list()) {
      if (!eligibleIds.has(player.id)) {
        ctx.emitToPlayer(player.id, EVENTS.WAITING, { message: 'Waiting for other players...' });
      }
    }
  },

  onReconnect(ctx, socket) {
    const sc = ctx.resolveScreenControl();
    const choicePlayer = ctx.engine.players.find(socket.id);
    if (choicePlayer && choicePlayer.response) {
      socket.emit(EVENTS.WAITING, { message: 'Answer submitted. Waiting for others...' });
    } else {
      let choices = ctx.phase.choices;
      if (typeof choices === 'string') {
        choices = ctx.engine.resolve(choices);
        if (!Array.isArray(choices)) choices = [];
      }
      const playerPrompt = ctx.services.resolvePerPlayerTemplate(ctx.phase.prompt || '', ctx.engine, socket.id);
      socket.emit(EVENTS.GAME_STARTED, {
        prompt: playerPrompt,
        choices,
        timer: null,
        isChoice: true,
        playerTemplate: sc.playerTemplate, show: sc.playerShow
      });
    }
  }
});
