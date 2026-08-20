# Handoff: Jamyard "Totem" Design System

## Overview
A full visual redesign of Jamyard (the classroom-games app). The design language is **Totem**: every UI element is an offcut of painted scrap wood, cut slightly off-square, stacked into totems. Stacks mean sequence — rounds in an activity, steps in an editor, name-planks in a roster — so the interface literally builds as students use it. This replaces the earlier "Paste-up" system currently implemented in `screens/` (grained gesso + paper pieces + vermillion).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to ship. The task is to **recreate these designs in the classroom-games codebase's existing environment** (vanilla HTML/CSS/JS screens under `screens/`, shared styles in `screens/shared/design.css`) using its established patterns: keep the existing IDs, section structure, and JS hooks (`host.js`, `player.js`, `library.js`) and restyle them. This is a CSS + markup-decoration migration, same shape as the previous Paste-up migration.

One caveat about the prototype markup: hover states appear as `style-hover="…"` attributes (a prototyping convention). In production, express these as normal `:hover` rules.

## Fidelity
**High-fidelity.** Colors, typography, spacing, clip-path polygons, shadow values, and motion timings are final and should be recreated faithfully. Exact pixel dimensions of the 1000×780 frames are canvas sizes, not required page sizes — layouts should adapt to real viewport widths using the same proportions and spacing scale.

## Design Tokens

### Wood (structure — anything that holds content)
| Token | Hex | Use |
|---|---|---|
| Gesso | `#F2EEE5` | page background, drop slots |
| Paper | `#FDF9F0` | cards, secondary buttons, labels |
| Birch | `#E3C8A0` | light blocks |
| Pine | `#D2B285` | mid blocks, boards |
| Sanded | `#EAD9BA` | input planks |
| Oak | `#C29A67` | dark blocks |
| Walnut | `#B08350` | plinths only |
| Base | `#8F6438` | base boards only |

### Paint (meaning — a color is a job, not a decoration)
| Token | Hex | Job |
|---|---|---|
| Signal red | `#E5482B` | THE primary action. **One per screen.** |
| Yellow | `#FFC800` | now / selected / highlight / timer |
| Cyan | `#1BA9C4` | think / info |
| Green | `#22A05A` | done / progress counts |
| Magenta | `#B0197E` | play / social |
| Orange | `#F08C1E` | warn / last-call timer |
| Ink | `#2A2620` | all reading text |

Text-on-paint: Paper `#FDF9F0` (Ink on yellow/birch/pine). Muted text floor: `#6B6250` on gesso; `#8A7B62` for small spaced-caps labels only; `#6B4E2A` for meta on wood.

### Typography (sans only)
- **Display / block labels**: Bricolage Grotesque 800 (Google Fonts). Headlines 30–58px, line-height 1.1–1.16. Block labels are CAPS, letter-spacing 0.06em, 13–21px. Step numbers ride at 60% opacity.
- **Body / UI**: DM Sans. 500 for reading text (13–19px, line-height ~1.5), 700 for emphasis. Spaced-caps meta labels: DM Sans 700, letter-spacing 0.12–0.14em, 11–13px.
- Body text never rotates and never sits on raw wood grain — put it on Paper or Gesso.
- The "painted word" highlight in headlines: yellow band via `background: linear-gradient(180deg, transparent 12%, #FFC800 12%, #FFC800 88%, transparent 88%)`, `display: inline-block`, `transform: rotate(-1deg)`, slight horizontal padding. Max one per headline.

### Material recipes
- **Wood grain** (on every wood tone; paints get none except thin yellow):
  ```css
  background-image:
    repeating-linear-gradient(92deg, rgba(110,75,40,0.10) 0 1px, transparent 1px 6px),
    repeating-linear-gradient(88deg, rgba(70,45,20,0.06) 0 2px, transparent 2px 14px);
  ```
- **The cut**: `clip-path` polygons, 4–8 vertices, every edge within 8% of square — sawed, never torn. Example block: `polygon(2% 8%, 98% 0, 100% 90%, 0 100%)`. Rotation ±2° max, alternate sign between stacked neighbors.
- **Shadows**: one flat `filter: drop-shadow(5px 8px 0 rgba(80,60,30,0.14))` on a whole stack's wrapper — pieces inside cast no shadow of their own. Free-standing pieces: `box-shadow: 0 4px 6px rgba(50,35,15,0.22–0.28)`. Nothing blurs more than ~6px. **Warning**: any transparent-background element (labels, dashed slots) placed *inside* a drop-shadow-filtered wrapper renders a ghost duplicate — give such elements a solid background or move them outside the wrapper.
- **Radius**: 0 everywhere. No gradients except the grain.

### The stack (core pattern)
Blocks overlap **−4px** vertical margin, alternate rotation sign, vary width 10–20%. Every stack stands on a **plinth** (Walnut, ~60% of widest block) + **base board** (Base, ~110%) — a stack never floats. Block states: yellow = current; 55% opacity + ✓ = done; plain wood = not yet. Cap ~6 blocks; beyond that, split into multiple piles.

### Motion
Interaction-only; nothing moves at rest. **120ms `cubic-bezier(0.4, 0, 0.2, 1)`** everywhere.
- Blocks in stacks: hover slides sideways ±10–12px (away from rotation direction).
- Free pieces/buttons: hover lifts `translateY(-5px)`; press settles back to 0.
- New block arrival (submission lands on a pile, student joins roster): translateY(−16px)→0, 180ms, same curve — the only entrance animation.
- No fades, scaling, springs, or ambient jitter.

## Screens / Views

Screens map to real files in classroom-games. Keep existing element IDs and JS behavior; restyle.

### 8a — Home (`screens/home/index.html`)
Wordmark: one painted block per letter-group, ±2° rotation. Actions (FIND / HOST / JOIN / GUIDE) are a totem — four labeled blocks stacked on plinth + base, hover slides each sideways. Right side: headline with painted-word highlight, sub-line, featured-activity board (Pine, jigsaw clip-path, title as a glued-on magenta painted piece). Footer: plain spaced links.

### 10a — Host lobby (`screens/host/index.html`, lobby section)
- Headline "The room is **open.**" (highlight on "open.").
- Room code = 4 large painted letter blocks (~92×110px, Bricolage 56px), one paint color each.
- `#copy-link-btn` / `#show-qr-btn`: Paper secondary buttons.
- Roster (`#player-list`): a growing pile — one name-plank per join (~36px tall, painted/wood mix, name in CAPS 13px), on plinth + base. New joins drop in with the arrival animation. "ANONYMOUS" gets a sanded plank.
- `#start-game-btn`: Signal red block "START!", with `#start-hint` beside it.

### 10b — Host projector, collect phase (`screens/host/index.html`, collect section)
Follows `docs/PROJECTOR-STYLE.md`: brand shrinks to a faint corner mark (`#C9BBA0`, spaced caps); content owns the screen.
- Prompt (`#prompt-display`): Bricolage 800, ~58px, left-aligned, max ~520px measure.
- Timer (`#collect-timer`): yellow painted chip "1:24 LEFT" (26px, nowrap) — replaces the SVG ring. Orange when nearly out.
- Submission count (`#submission-count`): the pile IS the count — one block per submission stacked live on plinth + base, plus a green chip "9 OF 24 IN".
- `#close-submissions-btn`: Paper secondary.

### 10c — Player phone (`screens/player/index.html`)
- Join: room code as 4 block slots — typed letters fill painted blocks, empty slots are dashed (3px dashed `rgba(110,75,40,0.35)` on solid gesso). Name input = sanded plank with dashed pencil line; hint "Leave blank to join as Anonymous." Red JOIN block. All targets ≥44px.
- Collect: activity + name meta row, yellow timer chip, prompt (Bricolage 24px), answer textarea = sanded plank (typed text Ink 500 above the dashed line, counter "52 / 280" bottom-right in `#8A7455`), red submit renamed visually "ADD MY BLOCK", mini pile at bottom showing group progress.

### 9a — Student mid-activity, pair round (player collect-choice/vote pattern)
Left rail: the activity's rounds as a totem (done = 55% + ✓, current = yellow "PAIR ← NOW"). Main: prompt with highlight, two candidate answer cards (yours = Pine board; partner's = Paper board; picked = `box-shadow: inset 0 0 0 3px #E5482B` or Ink), red "SEND IT UP", progress meta "9 of 12 pairs done".

### 9d — Editor (`screens/designer/`)
The activity's rounds ARE a totem: each round is a block (label + meta line), drag to reorder, selected = inset 3px Ink ring on yellow. "+ ADD A ROUND" dashed drop slot above the stack (solid gesso fill). Right: activity name on a Paper piece with red underline bar, selected-round detail card (Paper: prompt text, divider, meta row ⏱ 4 MIN · PAIRS OF 2 · ANONYMOUS: OFF), red "TRY IT" + paper "SHARE".

### 10d / 9g — Library (`screens/library/`)
Two accepted variants; 10d is the primary.
- 10d: headline "What do you want to do **together**?", search plank + goal chips (selected = yellow painted chip, unselected = paper), activities as **goal piles** (CONNECT / THINK / PLAY) — one plank per activity (name + ~min), hover pulls plank out +12px. Builder doorway: "Want something that isn't here?" + dashed "+ BUILD YOUR OWN" slot. Footer: teacher guide · privacy · back to home.
- 9g: same piles plus a right rail with search and a "picked up" detail board (description, meta, red HOST THIS) shown when a plank is selected.

## Interactions & Behavior
- Hover/press per Motion above. Selection is always an inset Ink ring (`box-shadow: inset 0 0 0 3px #2A2620`), never a color change.
- Live events (join, submission, vote) add blocks to piles with the arrival animation; counts tick by swapping the number — no progress bars.
- Timer: yellow chip, flips to orange `#F08C1E` for last call. Replaces both the SVG timer ring (host) and the timer bar (player).
- Drop slots (dashed) are the affordance for "add/create" everywhere: add round, build your own, empty code letters.
- Focus visible: keep the existing `:focus-visible` outline pattern, but use `3px solid #2A2620`.

## State Management
No new state. All states shown map to existing engine states: lobby/roster, collect (+ timer, submission count), preview, reveal, vote, elimination, winner. The pile size = existing submission/roster counts. Phases not mocked here (reveal, vote options, winner, announce) should follow the same grammar: content on Paper boards, one red action, progress as piles/chips.

## Assets
None. No images, no icon font, no emoji. Everything is CSS (clip-path + gradients). Fonts from Google Fonts: Bricolage Grotesque (700, 800) and DM Sans (400, 500, 700) — replace the current Nunito/Archivo/Garamond loads.

## Never (hard rules)
Serifs · torn or curved edges · border-radius · gradients except the grain · floating stacks (no plinth) · two red actions on one screen · body text on raw grain · rotation past 2° · blurry shadows · emoji (replace the current 🔗/👁/🛠 button glyphs with text or CSS shapes).

## Files
- `spec/Jamyard Totem System.dc.html` — the design system spec page (palette, type, material, stack grammar, components with live hovers, motion, never-list). Open in a browser.
- `screens/8a-home.html` — Home
- `screens/10a-host-lobby.html` — Host lobby
- `screens/10b-host-projector-collect.html` — Host projector, collect
- `screens/10c-player-phone.html` — Player join + collect (two phones)
- `screens/10d-library.html` — Library (primary)
- `screens/9g-library-alt-with-detail.html` — Library variant with detail rail
- `screens/9d-editor.html` — Editor
- `screens/9a-student-pair-round.html` — Student pair round

Each screen file is standalone — open in a browser. Frames are 1000×780 canvases (phones 340×660 inside 10c).
