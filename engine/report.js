/**
 * Activity report builder — turns a finished (or in-progress) room's phase
 * data into a printable record for the teacher.
 *
 * Privacy contract: the report is built on demand from live room state and
 * sent straight to the teacher's device over the PIN-gated report endpoint.
 * It is NEVER stored server-side (teacher-save purity: saved objects never
 * contain student content) — when the room expires, the data is gone.
 * Hidden (moderated) responses were already excluded when phase data was
 * stored, so the report shows what the class actually saw.
 *
 * Output is renderer-agnostic: ordered sections of small typed blocks
 * (text / pre / fact / entries / table) so the report page needs one
 * renderer per block kind, not one per phase type. Tables mark their name
 * column (nameCol) so the page's "student names" toggle knows what to hide.
 *
 * Pure module — no I/O; server.js exposes it at /api/rooms/:code/report.
 */

// Pacing beats carry no student work of their own (reveal/reveal-one show
// OTHER phases' data, which gets its own section) — they'd be noise rows.
const SKIP_TYPES = new Set(['lobby', 'end', 'announce', 'reveal', 'reveal-one', 'preview']);

/**
 * @param {object} engine  GameEngine-shaped: { config, phaseData, players }
 * @param {{ code?: string }} [meta]
 */
export function buildActivityReport(engine, meta = {}) {
  const config = engine.config || {};
  const phases = config.phases || {};
  const phaseData = engine.phaseData || {};
  const players = engine.players;

  const nameOf = (id) => {
    const p = players && typeof players.find === 'function' ? players.find(id) : null;
    return p ? p.name : null;
  };

  const sections = [];
  for (const [id, phase] of Object.entries(phases)) {
    if (!phase || SKIP_TYPES.has(phase.type)) continue;

    // Loops store a versioned copy per iteration (id~N) alongside the base
    // key, which duplicates the final round — report each round once.
    const roundKeys = Object.keys(phaseData)
      .filter(k => /^~\d+$/.test(k.slice(id.length)) && k.startsWith(id + '~'))
      .sort((a, b) => Number(a.slice(id.length + 1)) - Number(b.slice(id.length + 1)));

    if (roundKeys.length > 0) {
      for (const key of roundKeys) {
        const section = buildSection(id, phase, phaseData[key], nameOf);
        if (section) {
          section.round = Number(key.slice(id.length + 1));
          sections.push(section);
        }
      }
    } else if (phaseData[id] !== undefined) {
      const section = buildSection(id, phase, phaseData[id], nameOf);
      if (section) sections.push(section);
    }
  }

  return {
    game: config.name || null,
    code: meta.code || null,
    generatedAt: new Date().toISOString(),
    anonymous: !!config.anonymous,
    playerCount: players && typeof players.count === 'function' ? players.count() : 0,
    roster: players && typeof players.listPublic === 'function'
      ? players.listPublic().map(p => p.name)
      : [],
    sections
  };
}

function buildSection(id, phase, data, nameOf) {
  if (!data || typeof data !== 'object') return null;
  const builder = SECTION_BUILDERS[phase.type] || genericSection;
  const blocks = builder(phase, data, nameOf) || [];
  if (blocks.length === 0) return null;

  const section = { id, type: phase.type, blocks };
  const heading = headingFor(phase);
  if (heading) section.heading = heading;
  return section;
}

// The phase's own question/prompt makes the best section title — but only
// when it reads clean: unresolved {{tokens}} (per-player or rotation refs)
// would print as raw template syntax, so those headings are dropped and the
// page falls back to the step's display name. ai-process is excluded: its
// instruction is a model prompt, not a title (a paragraph of AI directions
// as a heading reads like a prompt dump).
function headingFor(phase) {
  if (phase.type === 'ai-process') return undefined;
  const candidates = [phase.prompt, phase.question, phase.instruction];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && !c.includes('{{')) return c.trim();
  }
  return undefined;
}

// --- Block helpers ---

const fact = (label, value) => ({ kind: 'fact', label, value: String(value) });
const text = (t) => ({ kind: 'text', text: String(t) });
const pre = (t) => ({ kind: 'pre', text: String(t) });

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Sorted score table. Keys map through player names; non-player keys
 *  (literal vote candidates, team names) print as-is. */
function scoresTable(scores, nameOf, columns = ['Student', 'Points']) {
  const entries = Object.entries(scores || {});
  if (entries.length === 0) return null;
  const rows = entries
    .map(([key, score]) => [nameOf(key) || key, typeof score === 'number' ? score : cellText(score)])
    .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
  return { kind: 'table', columns, rows, nameCol: 0 };
}

function responseEntries(responses) {
  const items = (responses || [])
    .filter(r => r && (r.text != null || r.drawing))
    .map(r => {
      const item = { name: r.name || null, text: cellText(r.text) };
      if (r.drawing) item.drawing = r.drawing;
      return item;
    });
  return items.length > 0 ? { kind: 'entries', items } : null;
}

// --- Per-type section builders ---
// Each returns an array of blocks (possibly empty). Shapes come from what
// the closers/handlers store via storePhaseData — see server.js and
// engine/phase-handlers/.

const SECTION_BUILDERS = {
  collect(phase, data) {
    const blocks = [];
    const entries = responseEntries(data.responses);
    if (entries) blocks.push(entries);
    if (Array.isArray(data.passedIds) && data.passedIds.length > 0) {
      blocks.push(fact('Passes', data.passedIds.length + ' passed'));
    }
    return blocks;
  },

  'collect-choice'(phase, data) {
    const blocks = [];
    const correct = data.correctAnswer != null && String(data.correctAnswer).trim() !== ''
      ? String(data.correctAnswer).trim().toLowerCase() : null;
    const isCorrect = (label) => correct !== null && String(label).trim().toLowerCase() === correct;

    const tallyEntries = Object.entries(data.tally || {});
    if (tallyEntries.length > 0) {
      const rows = tallyEntries
        .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
        .map(([label, n]) => [isCorrect(label) ? label + ' ✓' : label, Number(n) || 0]);
      blocks.push({ kind: 'table', columns: ['Choice', 'Picks'], rows, nameCol: null });
    }

    const picks = (data.responses || []).filter(r => r && r.choice != null);
    if (picks.length > 0) {
      const columns = correct !== null ? ['Student', 'Their pick', 'Correct'] : ['Student', 'Their pick'];
      const rows = picks.map(r => {
        const row = [r.name || '', cellText(r.choice)];
        if (correct !== null) row.push(isCorrect(r.choice) ? '✓' : '');
        return row;
      });
      blocks.push({ kind: 'table', columns, rows, nameCol: 0 });
    }
    return blocks;
  },

  'ai-process'(phase, data, nameOf) {
    if (data.byPlayer && typeof data.byPlayer === 'object') {
      const items = Object.entries(data.byPlayer)
        .map(([pid, value]) => ({ name: nameOf(pid) || null, text: cellText(value) }));
      return items.length > 0 ? [{ kind: 'entries', items }] : [];
    }
    if (typeof data.result === 'string' && data.result.trim()) return [text(data.result)];
    if (data.result != null && typeof data.result === 'object') {
      return [pre(JSON.stringify(data.result, null, 2))];
    }
    return [];
  },

  vote(phase, data, nameOf) {
    const blocks = [];
    const table = scoresTable(data.scores, nameOf, ['Choice', 'Votes']);
    if (table) blocks.push(table);
    if (data.winner != null) {
      blocks.push(fact(data.tied ? 'Winner (tie broken)' : 'Winner', nameOf(data.winner) || data.winner));
    }
    if (typeof data.totalVotes === 'number') blocks.push(fact('Votes cast', data.totalVotes));
    return blocks;
  },

  rank(phase, data) {
    if (typeof data.rankedList === 'string' && data.rankedList.trim()) return [pre(data.rankedList)];
    if (Array.isArray(data.rankings) && data.rankings.length > 0) {
      return [pre(data.rankings.map((r, i) => `${i + 1}. ${cellText(r.text || r.name || r)}`).join('\n'))];
    }
    return [];
  },

  rate(phase, data) {
    const averages = Object.entries(data.averages || {});
    if (averages.length === 0) return [];
    const scales = Array.isArray(data.scales) ? data.scales : [];
    const labelOf = (key) => {
      const scale = scales.find(s => s && (s.id === key || s.key === key));
      return (scale && (scale.label || scale.name)) || key;
    };
    const rows = averages.map(([key, avg]) => [labelOf(key), typeof avg === 'number' ? Math.round(avg * 10) / 10 : cellText(avg)]);
    return [{ kind: 'table', columns: ['Scale', 'Class average'], rows, nameCol: null }];
  },

  estimate(phase, data, nameOf) {
    const blocks = [];
    if (data.answer != null) blocks.push(fact('Answer', phase.unit ? `${data.answer} ${phase.unit}` : data.answer));
    if (typeof data.count === 'number') blocks.push(fact('Guesses', data.count));
    if (typeof data.average === 'number') blocks.push(fact('Class average', Math.round(data.average * 10) / 10));
    if (typeof data.median === 'number') blocks.push(fact('Median', data.median));
    if (typeof data.closest === 'number') blocks.push(fact('Closest guess', data.closest));
    const table = scoresTable(data.scores, nameOf);
    if (table) blocks.push(table);
    return blocks;
  },

  leaderboard(phase, data) {
    const blocks = [];
    if (Array.isArray(data.standings) && data.standings.length > 0) {
      const rows = data.standings.map(s => [s.rank ?? '', s.name || s.playerId || '', s.score ?? 0]);
      blocks.push({ kind: 'table', columns: ['Rank', 'Student', 'Points'], rows, nameCol: 1 });
    }
    if (Array.isArray(data.teamStandings) && data.teamStandings.length > 0) {
      const rows = data.teamStandings.map(t => [t.name || t.team || '', t.score ?? 0]);
      blocks.push({ kind: 'table', columns: ['Team', 'Points'], rows, nameCol: null });
    }
    return blocks;
  },

  winner(phase, data) {
    const blocks = [];
    const names = Array.isArray(data.winnerNames) && data.winnerNames.length > 0
      ? data.winnerNames.join(' & ') : data.winnerName;
    if (names) {
      const score = typeof data.winnerScore === 'number' ? ` (${data.winnerScore} points)` : '';
      blocks.push(fact(data.isTie ? 'Winners (tie)' : 'Winner', names + score));
    }
    if (data.winnerEntry) blocks.push(text('Winning entry: ' + cellText(data.winnerEntry)));
    return blocks;
  },

  foreach(phase, data, nameOf) {
    const blocks = [];
    if (typeof data.itemCount === 'number') {
      blocks.push(fact('Rounds', data.itemCount + (data.itemCount === 1 ? ' round' : ' rounds')));
    }
    const table = scoresTable(data.scores, nameOf);
    if (table) blocks.push(table);
    return blocks;
  },

  'team-split'(phase, data) {
    const teams = Object.entries(data.teams || {});
    if (teams.length === 0) return [];
    const rows = teams.map(([teamName, members]) => [
      teamName,
      (Array.isArray(members) ? members : []).map(m => (m && m.name) || '').filter(Boolean).join(', ')
    ]);
    return [{ kind: 'table', columns: ['Team', 'Students'], rows, nameCol: 1 }];
  },

  'team-roles'(phase, data) {
    const roleMembers = Object.entries(data.roleMembers || {});
    if (roleMembers.length === 0) return [];
    const rows = roleMembers.map(([role, members]) => [
      role,
      (Array.isArray(members) ? members : []).map(m => (m && m.name) || cellText(m)).filter(Boolean).join(', ')
    ]);
    return [{ kind: 'table', columns: ['Role', 'Students'], rows, nameCol: 1 }];
  },

  merge(phase, data, nameOf) {
    const items = (data.merged || []).map(g => ({
      name: (g.members || []).map(nameOf).filter(Boolean).join(' + ') || null,
      text: cellText(g.text)
    }));
    return items.length > 0 ? [{ kind: 'entries', items }] : [];
  },

  relay(phase, data) {
    if (typeof data.text === 'string' && data.text.trim()) return [text(data.text)];
    return [];
  },

  'one-voice'(phase, data) {
    const blocks = [];
    if (typeof data.finalCount === 'number' && typeof data.target === 'number') {
      blocks.push(fact('Reached', `${data.finalCount} of ${data.target}`));
      blocks.push(fact('Made it', data.success ? 'Yes' : 'Not this time'));
    }
    if (typeof data.attempts === 'number') blocks.push(fact('Attempts', data.attempts));
    if (typeof data.bestRun === 'number') blocks.push(fact('Best run', data.bestRun));
    return blocks;
  },

  match(phase, data, nameOf) {
    return resultsListAndScores(data, nameOf);
  },

  sort(phase, data, nameOf) {
    return resultsListAndScores(data, nameOf);
  },

  checklist(phase, data) {
    const blocks = [];
    if (typeof data.resultsList === 'string' && data.resultsList.trim()) blocks.push(pre(data.resultsList));
    if (typeof data.doneCount === 'number' && typeof data.groupCount === 'number') {
      blocks.push(fact('Finished everything', `${data.doneCount} of ${data.groupCount}`));
    }
    return blocks;
  },

  wager(phase, data, nameOf) {
    const blocks = [];
    if (data.resolved != null) blocks.push(fact('Winning option', cellText(data.resolved)));
    const table = scoresTable(data.scores, nameOf);
    if (table) blocks.push(table);
    return blocks;
  },

  turn(phase, data) {
    const blocks = [];
    const teamScores = Object.entries(data.teamScores || {});
    if (teamScores.length > 0) {
      const rows = teamScores
        .map(([team, score]) => [team, Number(score) || 0])
        .sort((a, b) => b[1] - a[1]);
      blocks.push({ kind: 'table', columns: ['Team', 'Points'], rows, nameCol: null });
    }
    if (typeof data.itemCount === 'number' && data.itemCount > 0) {
      blocks.push(fact('Items in the pool', data.itemCount));
    }
    return blocks;
  }
};

function resultsListAndScores(data, nameOf) {
  const blocks = [];
  if (typeof data.resultsList === 'string' && data.resultsList.trim()) blocks.push(pre(data.resultsList));
  const table = scoresTable(data.scores, nameOf);
  if (table) blocks.push(table);
  return blocks;
}

// Types without a dedicated builder (buzz, eliminate, ai-eliminate, and any
// future phase type): a score map is the one shape worth showing generically.
// Anything else stays out of the report rather than dumping raw JSON at a
// teacher — add a builder above when a new type earns a real rendering.
function genericSection(phase, data, nameOf) {
  const table = scoresTable(data.scores, nameOf);
  return table ? [table] : [];
}
