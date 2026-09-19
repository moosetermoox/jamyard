# Jamyard

Live classroom activities where the class's own answers become the next step.

A teacher projects a host screen. Students join from their Chromebooks with a
four-letter code and a first name. What they write gets grouped, passed to a
classmate, voted on, or ranked, and the class talks about what came back.
No student accounts, nothing to install, student work deleted when the room
closes. The live site is [jamyard.org](https://jamyard.org).

## Run it locally

Node 24 and npm.

```
npm install
npm start          # http://localhost:3000
npm test           # Vitest, about five seconds
```

Without an `ANTHROPIC_API_KEY` the AI runs in mock mode, which is enough to
play every activity. Without a `DATABASE_URL` saved activities, feedback, and
the owner's logs live in files under `data/` and `games/user/`. The full list
of environment variables is in [CLAUDE.md](CLAUDE.md) under Environment.

## Where things are

- `server.js` is Express plus the Socket.io handlers.
- `engine/` runs an activity: a state machine over phases, with a handler per
  phase type in `engine/phase-handlers/` and the pure rules in `engine/phases/`.
- `games/*/config.json` are the built-in activities. `recipes/*.json` are the
  templates a teacher fills in on the Create page. `recipes/prompt-banks/`
  hold the question banks.
- `screens/` are the pages: `host` (the projector), `player` (a student's
  device), `teacher` (the private console), `home`, `make`, `designer`, and
  the shared modules.
- `docs/` holds the design history. Start with `docs/NEXT-STEPS.md` and
  `docs/ARCHITECTURE.md`.

[CLAUDE.md](CLAUDE.md) is the working handbook: the standing rules, the
gotchas, and how to add an activity or a phase type. It is written for an AI
coding assistant and reads fine for a person.

## License

The code is free software under the
[GNU Affero General Public License, version 3](LICENSE) (AGPL-3.0-only).
In plain words: you may run it, study it, change it, and share it, for any
purpose, including in a school district or a paid product. If you share it,
or run a changed version as a service that others use over a network, you
must offer them your changed source under the same license. That network
clause is the one thing that sets the AGPL apart from the ordinary GPL, and
it is why this project chose it: a hosted copy of Jamyard must stay open.

Some things in this repository are not code and are not covered by the AGPL:

- **The prompt banks** in `recipes/prompt-banks/` carry their own credits.
  The Along bank reproduces reflection questions from "Along Reflection
  Questions" (Gradient Learning / Chan Zuckerberg Initiative and partners),
  each prompt naming its author. Keep the attribution if you reuse them.
- **The name Jamyard** and the look of the live site identify one
  deployment. Run your own copy under your own name.
- **Student work** never lives in this repository, by rule. Saved
  activities contain only what a teacher wrote.

Copyright (C) 2026 Max Cady.
