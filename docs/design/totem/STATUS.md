# Totem migration status

**MERGED TO MASTER AND LIVE 2026-08-20** (fast-forward, no drift; CI
green, Render deploy verified on jamyard.xyz). The handoff spec is
`README.md` in this folder; reference screens in `screens/`. Totem is
the site's design system now; this file is the migration's record.

Last updated: 2026-08-20 (merge day).

## Migrated (verified with headless screenshots, tests green)

| Surface | Reference | State |
|---|---|---|
| `shared/totem.css` + fonts | spec page | Done. Tokens, grain, stacks, motion, arrival, focus ring. Bricolage + DM Sans self-hosted variable woff2. |
| Home | 8a | Done. FIND is the red block; mock's HOST maps to CREATE (no bare host route). |
| Host lobby | 10a | Done. Letter-block code, roster plank pile, red START!. |
| Host projector collect | 10b | Done. Timer chip (m:ss, orange last call), submission pile IS the count (cap 10 + green chip). Other phases ride the skin. |
| Player join + collect | 10c | Done. Letters fill slot blocks, sanded planks, red Join/Submit. |
| Library | 10d | Done, including the interaction change: six piles (RECENT / FAVORITES / CUSTOMIZED / CONNECT / THINK / PLAY), balanced columns capped at 6, plank popup with full card actions. Owner mode keeps the card grid on purpose. |
| Designer create + editor chrome | 9d (partial) | Skin only: palette, type, motion, square cuts. |
| Create front door | jamyard-designer.png (12B) | Done (2026-08-20). Paper header bar, painted-word headline, sanded plank idea box + red MAKE IT, painted example planks. |
| Editor Simple view | simple-designer.png (12A) | Done (2026-08-20). Steps on a walnut spine with painted family number blocks, plank inputs, birch token chips, yellow timer chip, cyan Ask AI, dashed add slot, base-board footer. Editor header went paper (all views). |
| Try it out (prototype bench) | 14a-try-it-out.html + 15a-try-it-out-collect.html (2026-09-09) | Done (2026-09-09, branch try-it-out-14a). One header row: name chip, the plan as a row of blocks (click to skip ahead, folds to fit, "…" opens the full list), paper icon toolbar (reset, sound, full screen, help). Teacher screen with Class screen / Teacher controls tabs, ONE student screen with a ‹ N of M › pager, shortcuts pinned under it, "+ Add another student" slot. The yellow NEXT card points at the one control to press (three presses in a row hides it, ? brings it back). Superseded: preview-prototype.png round 11 (seat blocks, grid toggle, bench bar, left map rail, first-run card). |
| Guide, privacy, feedback inbox, prototype chrome, feedback widget | system grammar | Done (2026-08-20). Paper sheets on flat gesso, ink table bands, painted-word on the guide h1, yellow active tabs/toggles, prototype's host panel marked yellow (Launch keeps THE red; Host this goes ink), widget self-contained with literal Totem values. Inbox category emoji retired. |
| Teacher console `/teacher` | system grammar | Done. Sanded-plank join inputs, yellow attention chip (pulse retired: nothing moves at rest), paper entry/preview pieces, green checklist done-bar, one red go-action per state. |
| Editor Builder view | 9d | Superseded 2026-08-20: the editor collapsed to ONE face (below). Builder code parked (toggle hidden, no auto-restore, enterBuilder still callable). |
| ONE editor (9D stack) | 9d, owner's cut | Done (2026-08-20). Stack of painted family-color blocks left (click to pick up), detail card = the step's sentence form + "All settings" expander (adopts #phase-config-form), Design-with-AI chat right. Scrap bin, drop slots, and drag-reorder parked; structure changes go through the chat. |

Also done: `totem` theme preset (host+player default; per-game themes
still win), emoji glyphs retired from migrated button labels, guide and
teacher copy updated to match ("Copy teacher link").

## Still to do

1. Pile placement uses an activity's FIRST recognized goal tag; reorder
   tags in a config to move its home pile.
2. ~~Merge `totem` into master~~ DONE 2026-08-20: fast-forward (master
   had zero commits totem lacked), CI green, deploy verified live.
3. Parked for later (owner's calls, all behind easy re-enables): the
   editor's scrap bin / add-step slot / drag-reorder (structure changes
   go through Design with AI), the All-settings expander
   (SV_ALL_SETTINGS_ENABLED in simple-view.js), the hidden
   Simple|Builder toggle. Closer is unfeatured pending revision.

Residue resolved 2026-08-20: designer hard paste shadows softened to
Totem values (dead pre-skin #000 rules left in place, they never
render); mic button is a MIC text label; editor phase-catalog icons,
theme-picker icons, review-panel robots/sparkles, and preview-mock
crown retired; goal labels are plain words everywhere (GOAL_WORDS is
now an alias of GOAL_LABELS).

Resolved 2026-08-20: the plank popup follows the customize-first funnel
(owner call). Untouched = Customize only; Preview, Host, and the heart
appear once the activity has been used (the heart also shows when
already hearted, so a favorited-but-untried plank can be un-hearted);
Delete stays yours/owner-only.
