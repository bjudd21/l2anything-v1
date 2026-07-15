# Learning Hub — Design System & Style Guide

Authoritative rules for building UI in this app so every page looks and behaves like one product. Read this **before** touching any frontend surface, alongside the design-quality rules in `spec-assets/ui-ux-polish-skill/SKILL.md` (which this guide follows and specializes).

- **Design read:** a daily learning tool for a solo user (shareable to a friend on their own AWS). This is the **product register** — the UI serves the task and should disappear into it. Bar: a user fluent in good developer tools should trust it instantly.
- **Aesthetic:** dark-first, restrained, **one accent** (primary red). Calm neutrals; color carries meaning, never decoration.
- **Reference implementation:** `design/dashboard-redesign-mockup.html` is the visual north star for the dashboard. It is a static exploration — the **tokens and components below are the source of truth**, not its hardcoded hex values.

---

## 1. How to work here (non-negotiables)

1. **Never write raw hex or ad-hoc color.** Use the semantic tokens (§3) via Tailwind classes (`bg-card`, `text-muted-foreground`, `border-border`, `text-danger`, …). The codebase currently has **zero** raw hex in pages/components — keep it that way.
2. **Reuse the primitives** in `apps/web/src/components/ui.tsx` and `apps/web/src/components/ui/*` (shadcn). Do not invent a second button, card, or badge vocabulary.
3. **One accent per view.** Primary red = the single most important action + selection + attention. Everything else is neutral or a semantic status color.
4. **Both themes.** Dark is primary; light must stay legible (contrast parity). Never hardcode a color that only works in one theme.
5. **Follow the ui-ux-polish skill.** The "AI slop" bans (§9) block shipping.
6. **Vocabulary comes from the teach-skill spec.** Use *mission, lesson, learning record, review / due, active recall, resources, glossary* — not invented synonyms. See `spec-assets/teach-skill/`.

---

## 2. Where things live

| Concern | Location |
| --- | --- |
| Color/type/shadow tokens | `apps/web/src/styles.css` (`:root`, `:root[data-theme="light"]`, `@theme inline`) |
| Shared primitives | `apps/web/src/components/ui.tsx` |
| shadcn components | `apps/web/src/components/ui/*` |
| Icons | `apps/web/src/components/icons.tsx` (lucide-react, one family) |
| Shell (nav) | `apps/web/src/shell/{Sidebar,TopBar,CommandPalette}.tsx` |
| Pages | `apps/web/src/pages/*.tsx` |

---

## 3. Color tokens

Colors are **OKLCH semantic tokens** defined in `styles.css` and exposed to Tailwind via `@theme inline`. Use the Tailwind class, never the raw value.

### Core surfaces & text

| Token (class) | Meaning |
| --- | --- |
| `background` | App canvas (off-black in dark). Never pure `#000`. |
| `foreground` | Primary text. |
| `card` / `card-foreground` | Panel surface + its text. Panels use `bg-card/82` + `backdrop-blur` (the `card` primitive). |
| `secondary` | Deep neutral fill (chips, subtle fills). |
| `muted` / `muted-foreground` | Muted fill / secondary text. `muted-foreground` is the default for metadata. |
| `border` / `input` | Hairlines and field borders. |
| `ring` | Focus ring (never remove). |

### Accent (the one accent)

| Token | Use |
| --- | --- |
| `primary` | THE accent. Primary buttons, active selection, key attention. Red. |
| `primary-strong` | Hover/pressed state of primary. |
| `primary-soft` | Tinted background behind primary (badges, glows). |
| `primary-foreground` | Text/icon on a primary fill (white). |

### Status semantics (meaning, not decoration)

Each has a saturated tone + a `-soft` tinted background for pills/rows.

| Token | Semantic | Status label it powers |
| --- | --- | --- |
| `danger` / `danger-soft` (= `destructive`) | Needs attention / overdue / error | **Due**, **Overdue**, destructive actions, errors |
| `warning` / `warning-soft` | In-flight / caution | **In progress**, "Learning" strength |
| `success` / `success-soft` | Done / healthy | **Complete**, "Strong" strength |
| (neutral: `muted`/`secondary`) | Idle / informational | **Up next**, "New", generic |

**Rule:** status colors appear **only** on status elements (pills, dots, the overdue row, strength meter). Never use green/amber/blue as decoration elsewhere. Red (`primary`/`danger`) is reserved for action + attention.

### Sidebar

The sidebar has its own token scale (`sidebar`, `sidebar-foreground`, `sidebar-muted`, `sidebar-accent`, `sidebar-border`, …) so it can differ from the main canvas without breaking theming. Use `*-sidebar-*` classes inside the shell.

---

## 4. Typography

- **Family:** `--font-sans` = Inter (with system fallbacks). One sans family for all UI. `--font-mono` (JetBrains Mono) for lesson IDs, code, and tabular technical values.
- **Base:** 15px / line-height ~1.45 for UI; prose can go 1.5–1.6 (`typeset-chat` sets its own leading).
- **Hierarchy by weight and color first, then size.** No screaming H1s.
  - Page title: ~22px / 700.
  - Section title: ~15.5px / 650.
  - Card title: ~15.5px / 650.
  - Body/meta: 12.5–14px, `muted-foreground` for secondary.
  - Micro-label / eyebrow: use the `microLabel` primitive (`text-[10px] font-semibold uppercase text-muted-foreground`). **Max one eyebrow per ~3 sections.**
- **Numbers:** add `tnum` (tabular-nums) to any changing figure — counts, durations, percentages, lesson IDs.
- **`text-wrap: balance`** is applied to h1–h3 globally; `pretty` to `<p>`. Don't fight it.
- Emphasis in a heading = weight/italic of the **same** family, never a serif dropped in.

---

## 5. Spacing, radius, elevation

- **Radius:** `--radius` = 0.75rem base. Use `rounded-md` (fields, chips, nav rows), `rounded-lg` (cards/panels), `rounded-full` (pills, dots, progress tracks).
- **Shadows:** use the `--shadow-*` scale (`shadow-sm`…`shadow-xl`). Panels use `shadow-lg`; the resume hero and hover-lifted cards may go higher. Don't invent shadows.
- **Glass:** panels use `backdrop-blur` + translucent `bg-card/82` (the `card` primitive). This is the app's established elevation language — apply it to panels, sheets, sticky bars. Do **not** sprinkle glass as decoration on small elements (polish-skill: glass is rare and purposeful).
- **Page width:** content columns cap at `max-w-6xl` and center (`mx-auto`); reading columns (lesson/prose) go narrower (~65–75ch).
- **Grids:** use `grid`/`repeat(auto-fill, minmax(300px,1fr))` for card grids; never flexbox width math (`w-[calc(...)]`).

---

## 6. Status & progress system

This is the app's most load-bearing visual language. Keep it exact.

### Topic status pill

One pill per topic conveying its state. Built on the `Badge` primitive (`tone` → shadcn variant). Text is `font-semibold`, pill has a soft tinted background + hairline of the same hue.

| Status | Tone / token | When |
| --- | --- | --- |
| **In progress** | `warning` | A lesson is started but unfinished. |
| **Up next** | neutral | No unfinished lesson; a next lesson is ready. |
| **Complete** | `success` (+ check icon) | User has marked the topic complete (see below). |
| **Due** / **N due** | `danger` | Topic has due review items. May co-occur with the above as a second pill. |

**Topic completion is user self-attested.** Topics are open-ended (ZPD-driven) with a variable lesson count and **no computable "100%."** Completion requires a `topics.status` field (`active` | `complete`) set by a manual "Mark topic complete" action (optionally tutor-suggested). Completed topics generate no new lessons but **still surface due reviews** ("review only"). Do not fake a topic progress percentage.

### Strength meter (review table)

Three dots + a word, colored on a weak→strong scale. This is a semantic data scale, the one sanctioned multi-color element.

| Level | Dots filled | Color |
| --- | --- | --- |
| **New** | 1 | `danger` |
| **Learning** | 2 | `warning` |
| **Strong** | 3 | `success` |

### Due / overdue

- Due count anywhere: `danger`, always **labeled** ("4 reviews due" / "4 due" / a review-icon + count) — never a bare number badge (reads as an unread count).
- Overdue row in the review table: `danger` text ("Overdue · 1d") + a subtle left-to-right `danger` gradient tint on the row.

### Progress bar/ring

Use `ProgressBar` / `ProgressRing` (`ui.tsx`). Fill is `primary`; track is `muted/70` (or `sidebar-accent/70` on the sidebar). Only use these where a **real fraction** exists (e.g., lesson step position), never to imply topic completion.

---

## 7. Components & canonical patterns

Prefer these over bespoke markup. If a pattern recurs on 2+ pages, promote it to `ui.tsx`.

- **Panel/card** — `card` class (`glass-panel rounded-lg border border-border bg-card/82 shadow-lg backdrop-blur-xl`). Status-tinted cards add a low-alpha radial wash + hue border in the status color (see mockup `.card.s-*`).
- **Buttons** — `Button` (shadcn) via `variant`: `default` (primary red, the ONE strong CTA per view), `secondary`, `ghost`. Icon-only buttons = `ghost` + `size="icon"` + lucide icon + `aria-label`. Overflow menus (rename/move/delete) = shadcn **Dropdown Menu** with a ghost `Ellipsis` trigger; destructive item uses `variant="destructive"`.
- **CTA hierarchy** — exactly one primary (solid red) action per view. The resume hero owns it. Card CTAs are secondary: a bordered button that takes its card's **status hue** as a gradient (amber/blue/green), deliberately a step below the hero red.
- **Badge** — `Badge` primitive, `tone`: `neutral | accent | success | warning`. This is the status-pill engine.
- **Section header** — icon tile + title + optional count chip + a hairline rule that fades right (mockup `.sec`). Icon tile is `primary-soft`/`primary` for attention sections, neutral otherwise. Use for "Due for review", "All topics", the page title. This is the sanctioned alternative to plain bold text and to eyebrow-spam.
- **Resume hero** — the persistent "pick up where you left off" panel: one topic (last-active), the mission "why", a user-only lesson stepper (Read → Exercise → Quiz), one primary CTA, richer primary gradient + soft glow. Always distinct from the topic cards below.
- **Review table** — five columns only: Concept · Topic · Last reviewed · Due · Strength. Rows are clickable (hover highlight + pointer) into that topic's review. No extra action column.
- **InlineNotice** — `InlineNotice` primitive for inline messages, `tone`: `neutral | error | warning`. Errors sit next to their field.
- **Stat / scoreboard** — `Stat` primitive; the top-bar scoreboard is the single global metrics home (lessons done, reviews due, streak). Don't duplicate these tiles elsewhere.
- **Skeletons** — `PageSkeleton` / `ShellSkeleton`, shaped like the final layout. Never a centered spinner.
- **Empty states teach the interface** — e.g. "No topics yet. Start with what you want to learn." + the primary action, not a dead end.

---

## 8. Motion

Follow the polish-skill framework. Product register = 150–250ms, no page-load choreography.

- Animate **only** `transform` and `opacity`.
- Easing: enter/exit `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out); never ease-in for UI; no bounce.
- Durations: button feedback 100–160ms; dropdowns 150–250ms; drawers/sheets 200–500ms.
- **Never animate keyboard-initiated actions** (command palette, nav).
- Every animation needs a `prefers-reduced-motion` path — the global reset in `styles.css` handles the baseline; don't defeat it.
- Tactile press: `active:translate-y-px` (already the app convention).

---

## 9. Do / Don't (blocks shipping)

**Don't:**
- Raw hex or one-off colors; a second accent color; status colors as decoration.
- Purple→blue gradients, neon/outer glows as default, gradient text, pure `#000`/`#fff`. (The intentional soft primary glows on the hero/nav are the *only* sanctioned glow, kept subtle.)
- Colored `border-left` side-stripes on cards/callouts; nested cards.
- An eyebrow over every section (max ~1 per 3); numbered `01/02/03` scaffolding; poetic section labels.
- Bare number badges for counts that need a noun; placeholder-as-label; em-dashes as flourish in UI copy.
- Emoji as icons; mixing icon families/stroke widths.

**Do:**
- Semantic tokens; one accent; status color only on status.
- One primary CTA per view; labels above inputs; inline errors; visible focus rings.
- Ship every interactive state: default/hover/focus/active/disabled/loading/error.
- Touch targets ≥44×44 with ≥8px spacing.

---

## 10. Accessibility floor

- Contrast: body ≥ 4.5:1, large text ≥ 3:1, in **both** themes. Verify status-pill text on its soft background (all current pills clear 6:1).
- Focus rings visible and never removed (`ring` token; `focusRing` helper in `ui.tsx`).
- Keyboard nav throughout; tab order matches visual order; `aria-label` on every icon-only button.
- Sequential heading hierarchy; never color as the only signal (status pills pair color with text/icon).
- `prefers-reduced-motion` honored; `alt`/`aria-hidden` correct on decorative vs meaningful SVG.

---

## 11. Adding a new page — checklist

1. Wrap content in the standard layout (`mx-auto max-w-6xl`, section headers via the §7 pattern).
2. Use `card`, `Button`, `Badge`, `InlineNotice`, `ProgressBar/Ring`, `Stat` — no bespoke equivalents.
3. Colors via tokens only; status via the §6 system.
4. One primary CTA; secondary actions are `secondary`/`ghost`.
5. All interactive states + skeleton + empty state present.
6. Test **light and dark**; verify contrast.
7. Run `pnpm typecheck && pnpm lint && pnpm test`; take a screenshot and actually look at it before calling it done.

---

## 12. References

- Design quality (authoritative): `spec-assets/ui-ux-polish-skill/SKILL.md`
- Pedagogy & vocabulary (authoritative): `spec-assets/teach-skill/`
- Visual north star (dashboard): `design/dashboard-redesign-mockup.html`
- Tokens: `apps/web/src/styles.css` · Primitives: `apps/web/src/components/ui.tsx`
