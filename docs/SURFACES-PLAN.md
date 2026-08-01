# Surfaces Plan: Library / Create / Editor

*Drafted 2026-08-01 from the teacher's observation: "/designer and /library
look very similar… the editor kind of feels like the designer and the
designer looks a lot like the library." Plan only — nothing here is built
until approved. Companion to [LIBRARY-FIRST-PLAN.md](LIBRARY-FIRST-PLAN.md).*

## 1. The diagnosis

There are three teacher-facing surfaces, and two of them are 90% the same
page:

| URL | What it says it is | What it actually contains |
|---|---|---|
| `/library` | "What do you want to do together?" | Search + goal chips + the activity grid (run-focused cards) + builder doorway |
| `/designer` | "Activity Designer" | Idea box ("What do you want to do with your class?" → Make it) + Browse recipes / Start from scratch + **the same activity grid** (search, chips, favorites, recents, delete, owner controls, ★) |
| `/designer/edit` | "Edit Activity" (the editor) | Simple/Advanced editing of ONE activity |

Why it happened: the designer grid came first; `/library` was cloned from
it (July 2026, library-first Phase 1) as the run-focused front door. The
designer kept its grid for building/housekeeping. Result: two near-identical
shelves, and the page named "Designer" isn't where designing happens — the
*editor* is.

The confusion is structural, not cosmetic. No amount of styling fixes two
grids with the same cards and slightly different buttons.

## 2. The target mental model

Three surfaces, three jobs, no overlap:

- **Library** (`/library`) — *the one shelf.* Find, run, and manage every
  activity: built-ins AND yours. Search, goal chips, favorites, recents,
  Host/Preview/Edit/Customize/Delete. Owner mode lives here too (unlock →
  see everything, ★ featured toggles, edit/delete built-ins).
- **Create** (`/designer`, retitled) — *the starting point for something
  new.* The idea box (AI recipe match), Browse recipes, Start from scratch.
  Small, focused page with NO grid. You leave it holding a new activity,
  which opens in the editor.
- **Editor** (`/designer/edit`) — *the workbench for one activity.*
  Unchanged role; clearer name in copy ("editor," never "designer").

One sentence a teacher can hold: **find it in the Library, start it in
Create, shape it in the Editor.**

## 3. Phase 1 — kill the duplicate shelf (small, mostly deletion)

1. `/designer` drops its activity grid, search, chips, favorites/recents
   sections. Keeps: idea hero, Browse recipes, Start from scratch. Retitle
   "Create an Activity". (The grid code moves nowhere — the library already
   has its own copy of everything worth keeping.)
2. Library absorbs the grid's unique leftovers:
   - ~~Delete for own activities~~ (shipped 2026-08-01)
   - Owner-mode entry ("Show full library (site owner)") + ★ featured
     toggles + built-in Edit/Delete when unlocked + feedback-inbox link
3. Re-point flows that assumed the designer grid:
   - Editor "Back to List" → always `/library` (the `from=library` param
     hack becomes unnecessary)
   - Post-delete/post-save landings, home footer link ("Activity Designer"
     → "Create an activity"), library builder doorway (keeps filing the
     `builder-request` signal, then lands on the new Create page)
4. Keep `/designer` as the URL (muscle memory, deep links, docs). Only its
   content changes.

Risk: low. It is almost entirely *removing* duplicated UI. Field tests run
out of the library, which barely changes. The one care point is owner-mode
wiring moving surfaces (verify with the owner-mode live checks).

## 4. Phase 2 — naming hygiene (copy only)

Sweep user-facing copy so "designer" disappears as a place-name: the editor
is "the editor," the create page is "Create." Internals (`/designer` routes,
file names, `designer.js`) stay — same rule as the activity/game vocabulary
sweep: copy-level, never a rename of internals.

## 5. Phase 3 — editor layout exploration (prototype first, decide after)

The teacher's sketch: **steps palette on the left** (a visible library of
step types you can drag into the activity), **canvas in the middle**,
**settings on the right**. Today: activity settings sit left, steps center,
step-config panel right-ish; adding a step goes through a modal picker.

Why it's promising: "editor should feel like Lego" is the product vision,
and a always-visible palette turns "what can this thing even do?" into
something you SEE (28 step types, grouped by verb: Ask / Show / Decide /
Team up / AI / Structure) instead of something hidden behind "+ Add a step".

Ground rules for the exploration:
- **Simple view stays the default and stays untouched.** Most teachers
  never open the canvas; the palette serves Advanced mode (which this may
  effectively rebrand as "Builder").
- Click-to-add stays first-class; drag-out is an enhancement (touch
  Chromebooks — reuse the HTML5-drag + touch pattern from the rank phase).
- Activity settings (name, description, theme) move right, joining the
  step-config panel as a tabbed/stacked right rail: *select nothing → see
  activity settings; select a step → see that step's settings.*
- Prototype as static screenshots/mock first; only build after the layout
  is approved. This is a renovation, not a tweak — sequence it after the
  August field tests unless testing goes so smoothly there's slack.

## 6. Phase 4 — AI as a building partner (ladder, cheapest first)

Already shipped: idea box → recipe match, per-step Ask AI, whole-config
generator, Check for Errors (Sonnet review + robot playtest), theme
generator. The gap is between "AI writes the whole thing" and "AI edits one
step." Rungs to climb, in rough order of value/effort:

1. **Topic re-skin** — "Make this about the water cycle": one AI call
   rewrites prompts/choices/messages while the validated structure stays
   frozen. Pairs perfectly with library Customize (clone → re-skin → host).
   Probably the highest-leverage AI feature not yet built.
2. **Fill from my materials** — paste a vocab list / lesson outline; AI
   builds the match pairs, sort buckets, or quiz questions. (Match/sort
   recipes are still owed — NEXT-STEPS #4 — and this is how they get filled
   without typing.)
3. **Storyboard-before-generate** (already parked in NEXT-STEPS wave 3) —
   from-description flow proposes a step outline as cards; teacher approves
   or nudges before any config is generated. Fixes "the AI built something
   I didn't want" at the cheap end.
4. **In-editor copilot** — the Ask AI button becomes a docked conversation
   that can see the whole activity and apply multi-step changes (existing
   ask-ai plumbing, kept within ai-budget guards).
5. **Palette suggestions** — in the Phase 3 layout, the palette can hint
   ("classes usually reflect after a debate — add a Reflect step?").

Safety spine for all of it (already in place): validator + robot playtest
catch structural breakage; ai-budget caps spend; generated content is
teacher-authored-by-adoption, so §49073.1 stays clean.

## 7. Open decisions (teacher's call)

1. **Direction**: one-shelf merge (this plan) vs. keeping two grids but
   differentiating them (e.g. designer grid shows only "my activities").
   The plan recommends the merge — differentiation still leaves two shelves
   and the "where do I find X?" question.
2. **Timing**: Phase 1 before August field tests (it's mostly deletion, and
   fewer confusing surfaces helps proxy playtests) or frozen until after.
3. **Phase 3 scope**: prototype-only for now, or schedule the build.
