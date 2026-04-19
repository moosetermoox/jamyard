# Deferred Ideas

Things considered but not built. Living document — promote to design docs when ready to tackle.

## Editor UX

### Inline-expand step settings (Trello-style)
Today: clicking a phase card populates the right sidebar with its settings.
Idea: drop the sidebar; click a card to expand it inline, showing settings within the card itself (one open at a time so the canvas doesn't explode).

**Why deferred:** big rewrite (renderPhaseConfig mount target, layout, live preview & AI suggestion homes). Decided to nail the mechanics first (settings IA, visualization phases, pattern presets) before redesigning the canvas itself.

**When to revisit:** after the core feature set feels stable and we want to focus on first-time-user delight.

### Step-settings polish (UX expert review, 2026-04-19)

Ranked by impact for a brand-new teacher building their first game. Pick #1 first if shipping incrementally.

1. **Progressive disclosure on optional sections.** Collapse "Loop (Optional)", "Host screen (optional)", "Player screens (optional)" by default. Show "+ Loop" / "+ Customize host screen" chips to expand on demand. Cuts visual noise ~60% on common phase types.
2. **Move AI Suggestions to the top of the panel.** Currently buried at the bottom — teachers edit before seeing the warning. Pin just below the role-badge header. When zero issues, show "✓ This step looks good" so the absence of warnings is itself a signal.
3. **Inline preview button per phase.** "Preview this step" opens a modal with just host + one player view of *this* step in isolation. Reuses prototype machinery. Eliminates "launch full game to see one screen" friction.
4. **Smart defaults on phase creation.** When teacher adds a `collect`, pre-fill prompt = "What do you think?", timer = 60s, with banner "We added a typical setup — change anything you want." Three clicks to a working game instead of figuring out required fields.
5. **Hide "Next step" when there's only one option.** Surface only when there's branching (preview phases, foreach exits, manual reordering). Reduces cognitive load on the common path.
6. **Replace gray placeholder text with clickable example chips.** Below the field show 2-3 small chips like `[Weekend question]` `[Mood check]` — clicking fills the field. Teachers learn by example, not by reading hint text.
7. **Save-state indicator.** "Saved" / "Unsaved changes" pip near the phase title in the sidebar.
8. **Smaller win: rename "Flow" to "What's next".** "Flow" is an engineering word.

**Note on what's already good (don't redo):** color-coded role bands, friendly `[token]` insert chips, foreach pattern presets, Apply Fix flow, Bot Fill in prototype mode.

## Architecture (from external review, deferred)

### game-loader as a compiler
See conversation in session 2026-04-19. Estimated week of work. Resolves all references, applies defaults, expands foreach instances, validates dataflow at load time. Engine becomes pure executor. Biggest long-term win for AI-generated config reliability. Deferred until product is more settled.

### Per-phase runner extraction
Move the orchestration code in server.js into per-phase-type runner modules with consistent contracts (`enter`, `onCommand`, `cleanup`). Defer until the runtime hardening proves stable in classroom use.

### Socket.io integration tests
In-process tests using socket.io-client to cover golden paths the unit tests miss (race conditions, reconnects, AI timeouts). Three to five flows cover most risk.

### Tiny Playwright suite for E2E
Real browser tests for the most critical user flows. Deferred until a known gap can't be caught any other way.
