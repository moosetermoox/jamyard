# Totem migration status

Living checklist for the `totem` branch. The handoff spec is `README.md`
in this folder; reference screens in `screens/`. Master still wears
Paste-up; nothing here deploys until totem merges.

Last updated: 2026-08-19.

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

Also done: `totem` theme preset (host+player default; per-game themes
still win), emoji glyphs retired from migrated button labels, guide and
teacher copy updated to match ("Copy teacher link").

## Still to do

1. **9d editor layout**: rounds AS a draggable totem (blocks on a plinth,
   selected = yellow with inset ink ring, dashed "+ ADD A ROUND" slot,
   right-side detail card). Structural editor.js / builder work.
2. **Unmigrated surfaces** (still Paste-up): `/teacher`, `/guide`,
   `/prototype` chrome, `/privacy`, `/feedback`, and
   `shared/feedback-widget.js`.
3. **Open product question**: the plank popup shipped with full actions
   (Customize red when untouched, Host + Preview once tried, heart,
   delete). Confirm or pare back to Customize-only.
4. Residue: some hard paste shadows remain in the designer; mic button
   and editor palette icons still use emoji glyphs (icon slots); the
   7-goal emoji labels survive on owner-mode cards only.
5. Pile placement uses an activity's FIRST recognized goal tag; reorder
   tags in a config to move its home pile.
6. When Totem proves out: merge `totem` into master (that deploys).
   Re-check drift against master before merging.
