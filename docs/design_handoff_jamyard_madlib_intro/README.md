# Handoff: Jamyard madlib intro

## Overview
A first-screen intro for jamyard.org that explains what Jamyard is in one madlib sentence. Three blanks are wooden "blocks" (the Totem motif) that spin like slot-machine reels and land on different words. Scrolling fades the intro away, the JAM/YARD wordmark flies into the header's top-left position, and the visitor lands on the existing homepage.

Sentence (wide layout, 3 lines):
> **[JAM][YARD]** is a **[blank 1]**
> of whole-class activities for **[blank 2]**.
> Use them, **[blank 3]** them, or create your own.

Blank word lists (all combinations read correctly):
- Blank 1: YARD, TOOLBOX, SWISS ARMY KNIFE, ONE-STOP SHOP
- Blank 2: CONNECTING, THINKING, REVIEWING, HAVING FUN
- Blank 3: REMIX, CUSTOMIZE, ADAPT, BUILD ON

## About the design files
The files here are **design references built in HTML**: prototypes showing the intended look and behavior, not production code. Recreate them in the jamyard.org codebase (github.com/moosetermoox/jamyard) using its existing patterns. The intro should become the first section of the real, responsive homepage. `screens/home-fold.html` is a fixed-width 1366px snapshot of the handoff homepage, used only so the prototype has something to scroll to.

## Fidelity
**High-fidelity.** Colors, type, sizes, timings and easing are final. Match them exactly.

## Screens / views

### 1. Intro (first viewport)
- **Layer:** `position: fixed; inset: 0; z-index: 2; background: #F2EEE5`. Content is vertically and horizontally centered.
- **Sentence container:** `max-width: 1400px; padding: 0 4vw`. The madlib is authored on a **1280×440** canvas (wide) or **640×640** (stacked, used when the container is under 760px wide). It is scaled uniformly to the container width, up to a maximum of 1.15×.
  - Wide canvas: `padding: 0 72px`, lines stacked with `gap: 6px`. Each line is `display:flex; align-items:center; gap:16px; min-height:84px`.
  - Stacked canvas: `padding: 0 40px`, 6 lines: `[JAM][YARD] is a` / `[blank 1]` / `of whole-class activities` / `for [blank 2].` / `Use them, [blank 3]` / `them, or create your own.`
- **Sentence words:** Bricolage Grotesque 800, 38px, line-height 1.1, letter-spacing -0.01em, color #2A2620, `white-space: nowrap`.
- **Wordmark (in sentence):** JAM = birch block (#E3C8A0 + grain), INK text, rotate(-2deg). YARD = #E5482B, #FDF9F0 text, rotate(1.5deg). Both Bricolage 800 32px, padding 8px 16px 10px, shadow `0 3px 5px rgba(50,35,15,0.30)`, gap 7px, bottom-aligned.
- **Blank blocks:** Bricolage 800 32px, letter-spacing 0.04em, line-height 1, padding 12px 20px 14px (row height 58px), `clip-path: polygon(2% 8%,98% 0,100% 90%,0 100%)`. Alternate rotation ±1.2deg per row. Drop shadow on the reel window: `drop-shadow(4px 6px 0 rgba(80,60,30,0.14))`.
  - Block colors: YARD walnut #B08350 + grain, INK text. TOOLBOX oak #C29A67 + grain. SWISS ARMY KNIFE pine #D2B285 + grain. ONE-STOP SHOP birch #E3C8A0 + grain. CONNECTING #B0197E / #FDF9F0 text. THINKING #1BA9C4 / INK. REVIEWING #22A05A / INK. HAVING FUN #F08C1E / INK. REMIX oak. CUSTOMIZE pine. ADAPT birch. BUILD ON #FFC800 / INK.
  - The period after blank 2 sits in an inline-flex with the reel at `gap: 3px`, so it hugs the block.
- **Top bar:** absolutely positioned at the top of the intro, `padding: 22px 4vw`, right-aligned. One link, "STUDENT? JOIN A ROOM": Bricolage 800 14px, letter-spacing 0.06em, INK on #FFC800, padding 11px 18px 12px, shadow `0 3px 5px rgba(50,35,15,0.26)`, no radius; hover #FFD63A. It links to the same place as the homepage header tab.
- **Scroll cue:** centered, `bottom: 32px`. The word "scroll" (DM Sans 500 14px, letter-spacing 0.08em, INK) above a 2×28px INK line, gap 10px. Hover color #E5482B. Click smooth-scrolls to the end of the fade distance. `aria-label="Scroll to the home page"`. Hidden once scroll progress exceeds 0.2.

### 2. Homepage (below)
This is the existing homepage, with two changes:
- The headline "Get the whole class in on it." is **hidden** when the intro is present, because the madlib replaces it. The projector + student-screen row is then centered.
- "What does your class need?" is promoted to a headline: Bricolage 800 30px, letter-spacing -0.01em, INK (it was DM Sans 13px uppercase grey).
- The prototype also changes the demo room code from YAHS to **KQTW** so it doesn't read as a word. Apply the same change to the real homepage demo.
- The 1-2-3 steps (already live on jamyard.org) sit under the totems, as on the live site.

## Interactions & behavior

### Timeline (first play, 7.5s total)
| Scene | Start | Duration | What happens |
|---|---|---|---|
| Wordmark | 0.0 | 1.0 | JAM lands at 0.1s, YARD at 0.35s (0.32s, easeOutCubic, from translateY(-18px) + opacity 0). "is a" fades in at 0.7s. |
| Sentence | 1.0 | 0.9 | The remaining words fade up (0.4s, easeInOutCubic, from translateY(8px)) at +0, +0.1, +0.2s per line. A dashed slot (3px dashed rgba(110,75,40,0.35)) marks each blank. |
| Spin | 1.9 | 3.2 | The reels start at 1.9s, 2.35s and 2.8s. Each spin lasts 2.2s: it travels two full laps plus the landing index, eases with `1-(1-t)^3.2`, and ends with a small overshoot (0.14 row, sine bump over the last 18%). The dashed slot fades out just before each reel starts. On landing, the block lifts 4px and settles back over 0.45s. |
| Hold | 5.1 | 2.4 | The sentence holds. |

- **First landing** is picked at random per page load from these curated sets (blank 1 / 2 / 3): YARD·HAVING FUN·REMIX; TOOLBOX·REVIEWING·CUSTOMIZE; SWISS ARMY KNIFE·THINKING·ADAPT; ONE-STOP SHOP·CONNECTING·REMIX; YARD·THINKING·BUILD ON; TOOLBOX·HAVING FUN·REMIX.
- **Reel mechanics:** rows are stacked with 18px extra spacing (row pitch = 58 + 18 = 76px) so neighbors never bleed into the window. The window clips (`overflow:hidden`).
- **Window width** matches the word on show. While spinning it stays at the widest word's width; over the last 30% of the first spin it eases (smoothstep) to the landed word's width. On later hops it eases between the old and new widths. The rest of the line closes up with it.

### After the first play (idle)
- The sentence stays. Every **6s** (1.5s after the loop point, then every 6s), **one** blank re-spins: a random slot, never the same slot twice in a row. It hops forward 1–3 words over 1.1s, with a 0.08-row overshoot. No blur, no shading.
- **Hover/tap:** entering a blank spins it after a **90ms** delay (cancelled on mouseleave). Click/tap spins immediately. This is ignored during the first spin or while that blank is already moving. Hops never overlap: a new hop queues until the current one finishes.
- **Proximity wiggle:** once per page load, after the first play, the first time the pointer comes within 120px of the sentence the middle block wiggles: ±3.5deg, 3 oscillations, decaying over 0.7s.

### Scroll
- Progress `p = clamp(scrollY / (0.6 × viewportHeight))`.
- Intro: `opacity: 1 - p; transform: translateY(-48px·p) scale(1 - 0.03·p)`. `pointer-events: none` once p > 0.5; `visibility: hidden` at p = 1.
- The spacer above the homepage is `0.6 × 100vh`, so the homepage rises while the intro fades and its top reaches the viewport top exactly at p = 1.
- **Wordmark flight:** when scrolling starts, measure the sentence wordmark's rect (source) and the homepage header wordmark's rect at p = 1 (target). Hide the sentence wordmark, and render a fixed copy at the homepage size (24px) above everything (z-index 3). Interpolate its translate from source to target and scale from `sourceWidth/targetWidth` to 1, with smoothstep easing on p (`transform-origin: 0 0`). Hide the homepage wordmark until p = 1, then swap back. Re-measure on resize.
- The scroll cue's line nudges 8px down and back (600ms, cubic-bezier(0.4,0,0.2,1), 700ms per half-cycle) after 4s with no scroll. It stops permanently on the first scroll.

### Reduced motion (`prefers-reduced-motion: reduce`)
Show the finished sentence (first landing) with no spin, idle spins, wiggle or cue nudge. The fade on scroll can stay.

### Accessibility
- The visual madlib is `aria-hidden="true"`.
- A visually hidden `<h1>` reads: "JAMYARD is a yard of whole-class activities for connecting, thinking, reviewing and having fun. Use them, remix them, or create your own."
- **Still to add:** a pause control for the idle re-spins (WCAG 2.2.2: motion that repeats for more than 5s must be pausable), or stop idle spins after about 3 hops.

## State
- `seed`: random per load. Picks the first landing and drives the idle schedule.
- `plays`: number of completed plays. Idle mode when `plays > 0`.
- `manual[slot]`: list of `{t, step}` hover spins, merged with the idle schedule into a sorted list of hops. The reel position is a pure function of time and that list.
- `p`: scroll progress. Also the measured source/target wordmark rects.
- `wiggled`: one-shot flag.

## Design tokens (from the Jamyard Totem system)
- Ink #2A2620 · Paper #FDF9F0 · Gesso (page) #F2EEE5
- Woods: Birch #E3C8A0 · Pine #D2B285 · Oak #C29A67 · Walnut #B08350 · Base #8F6438
- Paints: Red #E5482B · Yellow #FFC800 · Cyan #1BA9C4 · Green #22A05A · Magenta #B0197E · Orange #F08C1E
- Wood grain overlay: `repeating-linear-gradient(92deg,rgba(110,75,40,0.10) 0 1px,transparent 1px 6px), repeating-linear-gradient(88deg,rgba(70,45,20,0.06) 0 2px,transparent 2px 14px)`
- Block cut: `clip-path: polygon(2% 8%,98% 0,100% 90%,0 100%)`
- Shadows: tag `0 3px 5px rgba(50,35,15,0.26–0.30)`; block `drop-shadow(4px 6px 0 rgba(80,60,30,0.14))`
- Fonts: Bricolage Grotesque 700/800 (display), DM Sans 400/500/700 (UI), both from Google Fonts
- Easing: UI `cubic-bezier(0.4,0,0.2,1)`; entries easeOutCubic; fades easeInOutCubic
- No border radius anywhere; the corners are cut, not rounded.

## Assets
There are no images. Everything is type and CSS blocks.

## Screenshots
In `screenshots/`:
1. `1-wordmark-lands.png`: 0.9s. JAM/YARD are in and "is a" is fading in.
2. `2-sentence-with-slots.png`: 1.85s. The full sentence with the dashed slots, before the spin.
3. `3-reels-spinning.png`: 3.3s. All three reels mid-spin (staggered).
4. `4-landed.png`: 7.2s. A landed first sentence; each slot is sized to its word.
5. `5-landing-intro.png`: the intro in the page, with the top bar and scroll cue.

The scroll fade and wordmark flight don't survive a screenshot. Open `Jamyard Landing.dc.html` in a browser and scroll to see them.

## Files
- `Jamyard Landing.dc.html` — the full landing prototype (intro, scroll fade, wordmark flight, homepage).
- `madlib-banner.jsx` — the madlib itself: word lists, reel math (`reelState`), `Reel`, `Piece`, and `LiveMadlib` (a self-clocked version that scales to its container).
- `madlib-shim.js` — tiny `animate`/`Easing` helpers used by the landing page instead of the full engine.
- `Jamyard Madlib Banner.dc.html` + `animations-v3.jsx` + `tweaks-panel.jsx` — the same madlib on a timeline, with tweak controls, for reviewing timing.
- `screens/home-fold.html` — the homepage snapshot used under the intro.
- `support.js` — the prototype runtime, so the `.dc.html` files open in a browser. Not for production.
- `notes/landing-notes.md` — open question: what returning visitors should see.

## Open items
1. Returning visitors: skip or shorten the intro after the first visit (see notes).
2. Pause control for idle motion (WCAG 2.2.2).
3. Precompile: ship as plain JS/CSS with no in-browser JSX transform. Make sure the intro doesn't block the homepage's first paint.
4. Test the wordmark flight against the real responsive header at all breakpoints.
