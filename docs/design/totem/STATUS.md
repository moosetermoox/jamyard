# Totem migration status

Living checklist for the `totem` branch. The handoff spec is `README.md`
in this folder; reference screens in `screens/`. Master still wears
Paste-up; nothing here deploys until totem merges.

Last updated: 2026-08-20.

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
| Prototype test bench | preview-prototype.png (round 11) | Done (2026-08-20). Seat blocks for player count, empty-stands prelaunch scene, pieces on stands with painted player bars, red swaps LAUNCH → ▶ HOST THIS on launch, live "+ Add a player" late-join slot. |
| Guide, privacy, feedback inbox, prototype chrome, feedback widget | system grammar | Done (2026-08-20). Paper sheets on flat gesso, ink table bands, painted-word on the guide h1, yellow active tabs/toggles, prototype's host panel marked yellow (Launch keeps THE red; Host this goes ink), widget self-contained with literal Totem values. Inbox category emoji retired. |
| Teacher console `/teacher` | system grammar | Done. Sanded-plank join inputs, yellow attention chip (pulse retired: nothing moves at rest), paper entry/preview pieces, green checklist done-bar, one red go-action per state. |
| Editor Builder view | 9d | Done. Steps are painted blocks in one stack (family colors = data coding), plinth + base, selected = yellow + inset ink ring, dashed "+ ADD A STEP" frontier slot, scrap-bin palette, gesso rail with paper detail board. Drag markers became inset ink bars (outset shadows die under clip-path). Simple view untouched by design (it is the sentences face, not the blocks face). |

Also done: `totem` theme preset (host+player default; per-game themes
still win), emoji glyphs retired from migrated button labels, guide and
teacher copy updated to match ("Copy teacher link").

## Still to do

1. Residue: some hard paste shadows remain in the designer; mic button
   and editor palette icons still use emoji glyphs (icon slots); the
   7-goal emoji labels survive on owner-mode cards only.
2. Pile placement uses an activity's FIRST recognized goal tag; reorder
   tags in a config to move its home pile.
3. When Totem proves out: merge `totem` into master (that deploys).
   Re-check drift against master before merging.

Resolved 2026-08-20: the plank popup follows the customize-first funnel
(owner call). Untouched = Customize only; Preview, Host, and the heart
appear once the activity has been used (the heart also shows when
already hearted, so a favorited-but-untried plank can be un-hearted);
Delete stays yours/owner-only.
