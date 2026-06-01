# Lanyard — Style Guide

> The source of truth for visual and interaction design decisions.
> Consult this before adding new UI. Update it when you establish a new pattern.

---

## Design Character

Lanyard has a deliberate **bold, graphic aesthetic** — thick black borders, flat color, warm cream canvas. The reference point is Keith Haring's public art: high-contrast, energetic, immediately readable from across a room. This isn't accidental: the host screen is literally projected to a class, so the UI must read at distance.

The aesthetic has two registers:

- **Teacher surfaces** (`/designer`, `/host`) — editorial and structured. Dense information, clear hierarchy, deliberate whitespace.
- **Student surfaces** (`/player`) — sparse and kinetic. One action at a time. Large tap targets. No navigation.

Both registers share the same color and type system. They differ in density and interaction complexity.

---

## Color

### Core palette

| Token | Hex | Use |
|---|---|---|
| `black` | `#000000` | Borders, headings, icon fills |
| `white` | `#FFFFFF` | Surface backgrounds, reversed text |
| `cream` | `#FFFDE7` | Page canvas background |
| `blue` | `#0057FF` | Primary accent — host-facing actions, links |
| `green` | `#00C853` | Confirm, success, primary CTA |
| `yellow` | `#FFD600` | Secondary CTA, highlights, warnings |
| `red` | `#FF2D2D` | Destructive actions, errors, elimination |
| `purple` | `#AA00FF` | AI features only |

### Semantic color roles

**Don't reach for a color because it looks nice — pick it because it means something.**

| Role | Color | When |
|---|---|---|
| Primary action | Green `#00C853` | The one thing you want the user to do |
| Secondary action | Yellow `#FFD600` | Alternative or neutral actions |
| Destructive | Red `#FF2D2D` | Delete, eliminate, kick |
| AI | Purple `#AA00FF` | Any AI-powered feature |
| Host surface | Blue `#BBDEFB` bg | Settings or content for the teacher screen |
| Player surface | Green `#C8E6C9` bg | Settings or content for student screens |
| Both surfaces | Yellow `#FFF9C4` bg | Shared content, flow/navigation |
| Flow / neutral | Gray `#F1F5F9` bg | Structural, flow-control settings |

### Phase type colors

Each phase type has a fixed background and border color so teachers can scan the canvas by color. Don't add new phase colors without a clear reason — visual distinction only works when the set is small.

| Phase | Background | Border |
|---|---|---|
| Lobby | `#BBDEFB` | `#0057FF` |
| Ask Players (collect) | `#C8E6C9` | `#00C853` |
| Multiple Choice | `#C8E6C9` | `#00C853` |
| AI Does Something | `#E1BEE7` | `#AA00FF` |
| AI Eliminates | `#FFCDD2` | `#FF2D2D` |
| Players Vote | `#FFE0B2` | `#FF6D00` |
| Eliminate Players | `#FFCDD2` | `#FF2D2D` |
| Show Everyone (reveal) | `#B2EBF2` | `#0057FF` |
| Show a Message (announce) | `#B2EBF2` | `#0057FF` |
| Teacher Reviews (preview) | `#FFF9C4` | `#FFD600` |
| Crown a Winner | `#FFE0B2` | `#FF6D00` |
| Leaderboard | `#FFF9C4` | `#FFD600` |
| Reveal One-by-One | `#FCE4EC` | `#FF4081` |
| Split Into Teams | `#B2EBF2` | `#00BCD4` |
| Rank Items | `#E8D5FF` | `#7C4DFF` |
| Rate on Scales | `#B2DFDB` | `#1DE9B6` |
| Place Wagers | `#FFE0B2` | `#FF6D00` |
| Relay | `#B2DFDB` | `#009688` |
| Go Through Answers (foreach) | `#E1BEE7` | `#6A1B9A` |
| Describe & Guess (turn) | `#FFCCBC` | `#D84315` |
| Game Over | `#E0E0E0` | `#555555` |

### Text colors

| Use | Color |
|---|---|
| Primary text | `#000` or `#222` |
| Secondary text | `#444` |
| Help text / captions | `#666` |
| Placeholder text | `#999` |
| Disabled text | `#bbb` |

**Rule:** Don't use more than three gray values in one view. If you need a fourth, question whether you need the element at all.

### What to avoid

- Don't use color as the only indicator of meaning — always pair with text or shape.
- Don't add colors outside the core palette without updating this guide.
- Don't use opacity for grays — use a specific hex so the value is predictable.

---

## Typography

### Fonts

```
Headings / buttons:   'Arial Black', Arial, sans-serif  (weight 900)
Body / labels:        Arial, sans-serif                 (weight 400–700)
Code / data:          ui-monospace, 'SF Mono', Menlo, monospace
```

Arial Black is the voice of the brand. Its weight and width make it readable at distance (host screen projection) and at small sizes (phase box labels). Everything else uses plain Arial.

**Rule:** Never introduce a third font family. If something needs more expressiveness, solve it with weight, size, or color.

### Type scale

| Level | Size | Weight | Transform | Use |
|---|---|---|---|---|
| Page title | `1.4rem` | 900 | uppercase | Header h1, hero headings |
| Section title | `1.1rem` | 900 | uppercase | Panel headers |
| Component title | `1rem` | 900 | uppercase | Phase box names, card titles |
| Label | `0.85rem` | 700 | none | Form labels, button text |
| Body | `0.85rem` | 400 | none | Descriptions, help text |
| Caption | `0.78rem` | 400–700 | varies | Section headers, status indicators |
| Fine print | `0.75rem` | 400 | none | Phase descriptions, timestamps |

**Rules:**
- Use `rem` units, not `px`, for font sizes.
- Labels in forms should be sentence case, not ALL CAPS. ALL CAPS is reserved for structural chrome (section bands, header titles).
- Line height for body text: `1.5`. For headings: `1.1–1.2`. Never set line height below `1` on anything the user reads.
- Maximum line length for readable prose: 60–70 characters (~440px). Don't let descriptive text span the full width of a wide container.

---

## Spacing

Use multiples of **4px** as your base unit. The most-used values:

| Token | Value | Use |
|---|---|---|
| `xs` | `4px` | Gaps between tiny related elements (chip parts, badge padding) |
| `sm` | `8px` | Internal padding on small components, gaps between form elements |
| `md` | `12px` | Standard internal padding, gap between label and input |
| `lg` | `16px` | Form group vertical spacing, panel section gaps |
| `xl` | `20–24px` | Between major sections, card padding |
| `2xl` | `32px` | Page-level padding, modal internal spacing |
| `3xl` | `48–60px` | Page canvas padding, hero spacing |

**Rules:**
- Form group `margin-bottom`: `20px`. Don't compress below `16px` — the eye needs air between fields.
- Section header `margin-top`: `24px`, `margin-bottom`: `12px`.
- Don't use arbitrary values like `7px`, `11px`, `13px` — if you need that precision, something is probably misaligned.
- Whitespace is load-bearing. When something feels cluttered, the answer is almost always more space, not less.

---

## Borders

Lanyard uses thick black borders as a deliberate visual signature. Don't fight them.

| Context | Width | Color | Radius |
|---|---|---|---|
| Phase boxes (canvas) | `3px` | `#000` | `16px` |
| Primary buttons | `3px` | `#000` | `12px` |
| Header / main chrome | `4px` | `#000` | — |
| Modals / menus | `2.5px` | `#000` | `16px` |
| Form inputs (inline settings) | `2px` | `#bbb` (focus: `#0057FF`) | `10px` |
| Subtle dividers | `1px` | `#ddd` | — |
| Section bands (role-coded) | `2px` | `rgba(0,0,0,0.15)` | `6px` |
| Token chips | `1.5px` | `#F57F17` | `6px` |

**Rules:**
- The `3px solid #000` border on phase boxes and primary buttons is part of the brand. Don't soften it elsewhere just to be consistent — use it where it matters and use lighter borders inside those containers.
- Inside an already-bordered container (inline settings inside a phase box), drop to `2px` and a gray color. Nested black borders compete with the container.
- Focus states: always use `border-color: #0057FF` with a `transition: border-color 0.15s`. Never use the default browser outline unless it's the only option.
- Don't use `box-shadow` as a border substitute — use it only for elevation (modals, menus).

---

## Elevation & Shadows

Lanyard uses a flat design with a **hard offset shadow** for elements that float above the canvas (modals, menus).

| Level | Shadow | Use |
|---|---|---|
| Flat | none | Everything on the canvas |
| Raised | `4px 4px 0 rgba(0,0,0,0.15)` | Popup menus, dropdowns |
| Modal | `8px 8px 0 rgba(0,0,0,0.2)` | Dialogs, overlays |
| Toast | `0 4px 12px rgba(0,0,0,0.25)` | Notification toasts |

The hard offset shadow (no blur) matches the graphic aesthetic. The blurred shadow on toasts is intentional — it's the one element that floats independently of the grid.

---

## Buttons

### Hierarchy

Every screen should have at most **one primary button**. If you're tempted to add a second, one of them should be secondary or the task needs rethinking.

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| Primary | `#00C853` | white | `3px #000` | The main action on the screen |
| Secondary | `#FFD600` | `#000` | `3px #000` | Alternative or neutral actions |
| Danger | `#FF2D2D` | white | `3px #000` | Delete, kick, eliminate |
| AI | `#AA00FF` | white | `3px #000` | AI-powered actions only |
| Ghost / text | transparent | `#0057FF` | none or `1px` | Low-priority navigation |

### Sizing and style

```css
padding: 8px 18px;
border-radius: 12px;
font-family: 'Arial Black', Arial, sans-serif;
font-size: 0.9rem;
font-weight: 900;
text-transform: uppercase;
letter-spacing: 0.5px;
cursor: pointer;
```

**Rules:**
- All buttons use uppercase labels. This distinguishes them from body text at a glance.
- Hover states: lighten the background by one step (e.g., `#00C853` → `#00E676`). Never remove the border on hover.
- Disabled buttons: `opacity: 0.5`, `cursor: not-allowed`. Don't hide them — show that the action exists but isn't available.
- Destructive actions (delete, kick, eliminate): always require a confirmation step or be clearly reversible. Don't put a destructive button next to a primary button without a visual gap.
- Icon buttons (`×`, `←`) use `btn-icon` class: no background, no border, large hit area (`min 32px × 32px`).

---

## Form Fields

### Labels

```css
font-size: 0.85rem;
font-weight: 700;
color: #222;
text-transform: none;   /* sentence case */
margin-bottom: 6px;
display: block;
```

Labels are sentence case, not all-caps. ALL CAPS is for structural chrome, not content fields. The label should complete the sentence "Tell me your ___" naturally.

### Inputs and textareas

```css
/* Inside inline settings form (inside phase box) */
border: 2px solid #bbb;
border-radius: 10px;
padding: 8px 10px;
font-size: 0.9rem;
font-family: Arial, sans-serif;
background: white;
transition: border-color 0.15s;

/* Focus */
border-color: #0057FF;
outline: none;
```

Textareas in the primary field (on phase boxes) auto-resize to fit content, capped at one-third of viewport height.

### Help text

```css
font-size: 0.78rem;
color: #666;
margin-top: 5px;
line-height: 1.4;
display: block;
```

Help text appears below the input. Write it as a short clarifying phrase, not a sentence. "Shown above the choices on the player screen" not "This text will be shown above the choices on the player's screen when they are voting."

### Rules

- Every input that accepts free text must have a `placeholder` that shows a realistic example (not "Enter value here").
- Validation errors appear inline, below the field, in red. Never alert-dialog a validation error.
- Required fields don't need an asterisk — make required fields the ones that logically must exist, and explain it in the label.
- Group related fields under a section header. Don't mix host settings and player settings in the same unseparated block.

---

## Section Headers (Role-Coded Bands)

Settings panels use color-coded section bands to tell the teacher which surface a setting affects.

| Band | Color | Meaning |
|---|---|---|
| Blue `#DBEAFE` | Host | Affects what the teacher sees on the projector |
| Green `#DCFCE7` | Player | Affects what students see on their devices |
| Purple `#F3E8FF` | AI | Affects how AI processes the data |
| Yellow `#FEF9C3` | Both | Affects both screens equally |
| Gray `#F1F5F9` | Flow | Game structure — looping, transitions, next step |

```css
font-size: 0.78rem;
font-weight: 700;
text-transform: uppercase;
letter-spacing: 0.6px;
padding: 9px 14px;
border-radius: 6px;
border: 2px solid rgba(0,0,0,0.15);
margin-top: 24px;
margin-bottom: 12px;
```

**Rules:**
- Use exactly one of the five variants — don't create new band colors.
- Every group of related settings gets a band, even if it's just one field.
- The band label should be the role name only: "Host screen", "Player screen", "AI settings", "Both screens", "What's next". Don't put instructions in the band.

---

## Cards

Cards are clickable containers with a lift effect on hover.

```css
border: 3px solid #000;
border-radius: 20px;
padding: 32px 28px 28px;
box-shadow: 4px 4px 0 #000;
transition: transform 0.12s, box-shadow 0.12s;

/* Hover */
transform: translate(-2px, -2px);
box-shadow: 6px 6px 0 #000;

/* Active */
transform: translate(1px, 1px);
box-shadow: 2px 2px 0 #000;
```

The lift-and-settle on hover/active makes cards feel physically pressable — they push into the surface when clicked. This is an affordance, not decoration.

**Rules:**
- Cards that navigate somewhere are `<a>` elements, not `<div>`s with click handlers.
- Card content hierarchy: icon or image → title (900 weight) → description (400 weight) → CTA.
- Don't put more than 3–4 cards side-by-side. Above that, use a list.

---

## Phase Boxes (Canvas)

Phase boxes are the main building blocks of the editor canvas.

```css
width: 380px;              /* collapsed */
width: 720px;              /* selected/expanded */
border: 3px solid #000;
border-radius: 16px;
padding: 14px 18px 10px;
background: white;         /* overridden by phase type color */
```

**Box anatomy (top to bottom):**
1. **Header row** — phase type name (bold, uppercase) + next-phase reference
2. **Description** — 0.75rem gray, one line
3. **Primary field** — auto-sizing textarea showing the main content
4. **"Will show:" preview** — appears when the primary field contains `{{tokens}}`; shows deletable chips
5. **"+ Insert from earlier step"** — appears only when upstream phases have insertable data
6. **Inline settings form** — appears when the box is selected (expanded)
7. **Done editing button** — collapses the box

**Rules:**
- Phase boxes are not modals — they expand in place. Don't open a separate dialog for phase settings.
- The primary field auto-saves on every keystroke (`isDirty = true`). Settings auto-save when the teacher clicks away. Don't require manual save for individual field changes.
- The `{{token}}` preview chips must be readable without knowing the template syntax. Each chip shows a friendly label, not the raw `{{phaseId.field}}` string.

---

## Motion & Transitions

Lanyard is nearly animation-free by design. Motion is used only where it carries information.

| Element | Property | Duration | Easing |
|---|---|---|---|
| Input focus | `border-color` | `0.15s` | ease |
| Phase box expand | `width`, `background` | `0.15s` | ease |
| Card hover lift | `transform`, `box-shadow` | `0.12s` | ease |
| Toast appear | `opacity`, `transform` | `0.2s` | ease |
| Phase transitions (host/player screens) | `opacity` | CSS fade | — |

**Rules:**
- Don't animate layout (height, margin) — it's expensive and rarely necessary.
- Never animate at more than `0.3s` for UI feedback. Longer motion is for loading states only.
- Prefer `transform` and `opacity` over properties that trigger layout (width, height, margin).
- No bounce, spring, or elastic easing — the aesthetic is graphic, not playful.

---

## Accessibility Baseline

These are non-negotiable minimums, not stretch goals.

**Color contrast:**
- Normal text on any background: minimum 4.5:1 ratio (WCAG AA).
- Large text (1rem+ bold) on any background: minimum 3:1 ratio.
- Don't use yellow text on white — it fails contrast. Yellow backgrounds with black text are fine.

**Keyboard navigation:**
- Every interactive element must be reachable by Tab and operable by Enter/Space.
- Focus indicators must be visible. Don't remove `outline` without providing a visible replacement.
- Modals must trap focus while open and return focus to the trigger on close.

**Semantic HTML:**
- Buttons that trigger actions: `<button>`. Links that navigate: `<a href>`. Don't use `<div onclick>`.
- Form inputs must have associated `<label>` elements (via `for`/`id` or wrapping).
- Headings must follow a logical hierarchy (`h1` → `h2` → `h3`). Don't skip levels.

**Touch targets:**
- Minimum tap target size: 44×44px (especially on student `/player` screen).
- Don't place two tappable elements closer than 8px apart.

---

## Tone of Voice (Labels & Microcopy)

The UI speaks in plain, direct English. No jargon, no technical terms where everyday words work.

| Technical term | Plain alternative |
|---|---|
| collect phase | Ask Players |
| ai-process phase | AI Does Something |
| foreach phase | Go Through Answers |
| team-split phase | Split Into Teams |
| Data reference | Earlier step |
| Phase ID | Step name |
| Submit | Send / Done |
| Close submissions | Stop collecting answers |

**Rules:**
- Button labels: verb + noun. "Start Game", "Add Step", "Save as Recipe". Not "Submit" alone.
- Error messages: say what went wrong and what to do. "Missing prompt — add a question for players to answer." Not "Invalid config."
- Empty states: explain what will appear here and how to get there. Not just "No items."
- Confirmations for destructive actions: "Delete this step? This can't be undone." State the consequence, not just "Are you sure?"

---

## What Not to Do

- **Don't use emoji in UI labels or titles.** The aesthetic is typographic. Emoji render inconsistently across OS.
- **Don't use more than two font families.** Arial Black for brand; Arial for everything else.
- **Don't use color as the only way to convey meaning.** Pair color with text or shape.
- **Don't add a new section band color.** The five existing bands cover every case.
- **Don't put more than one primary (green) button on a screen.**
- **Don't open a modal for something that can be done inline.**
- **Don't use `alert()`, `confirm()`, or `prompt()`** — build UI equivalents.
- **Don't auto-advance critical phases** without giving the host a visible countdown and a way to stop it.
- **Don't use all-caps for body text or form labels** — reserve it for structural chrome.
