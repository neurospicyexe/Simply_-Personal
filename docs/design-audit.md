# Design Audit — PluralHost Web

**Reviewed:** 2026-03-23
**Status:** Pending — run /critique before making changes

---

## Anti-Patterns Verdict: ⚠️ PARTIAL FAIL

Would someone say "AI made this"? Yes, with moderate confidence.

**Tells:**
- Inter font — #1 overused developer font, zero typographic personality
- Dark mode + neon accent — `#121212` bg + `#b6ff00` lime is the canonical AI "cool dark tool" aesthetic
- Palette includes `#00d4ff` (cyan) and `#b400ff` (purple) — AI color palette fingerprints
- Uniform `padding: 16px; gap: 12px` on every content pane — no visual rhythm

**What saves it:** Lime accent is distinctive (not purple-to-blue), no glassmorphism/hero metrics/gradient text, internally consistent.

---

## Issues by Severity

### CRITICAL

#### ~~outline: none Removes Keyboard Focus Indicator~~ ✅ FIXED
**Fixed 2026-03-23.** `outline: 2px solid var(--color-primary); outline-offset: 2px;` — proper focus ring restored in `SettingsPage.module.css`.

---

### HIGH

#### ~~Missing `--color-border` Token~~ ✅ FIXED
**Fixed 2026-03-23.** `--color-border: #2a2a2a` added to `tokens.css`.

#### ~~Missing `--color-text-muted` Token~~ ✅ FIXED
**Fixed 2026-03-23.** `--color-text-muted: var(--color-muted)` alias added to `tokens.css`.

#### ~~CommsTab Touch Target Below Minimum~~ ✅ FIXED
**Fixed 2026-03-23.** `.addBtn` updated to `width: 44px; height: 44px` in `CommsTab.module.css`.

---

### MEDIUM

#### ~~CommsTab.module.css Ignores Design System~~ ✅ FIXED
**Fixed 2026-03-23.** All ~18 hardcoded hex values replaced with design tokens throughout `CommsTab.module.css`.

#### ~~Font Loaded via CSS `@import` (Render-Blocking)~~ ✅ FIXED
**Fixed 2026-03-23.** `@import` removed from `globals.css`; font now loaded in `index.html` via `<link rel="preconnect">` + `<link rel="stylesheet">`.

#### ~~Missing `role="status"` on Loading States~~ ✅ FIXED
**Fixed 2026-03-23.** `role="status" aria-live="polite"` added to loading elements in `MemberDetailPage.tsx` and `SystemPage.tsx`.

#### Inter + Single-Font Stack — No Typographic Personality
**Location:** `src/PluralHost.Web/src/styles/tokens.css:13`, `globals.css:1`
**Description:** Inter used at every typographic level — headings, body, labels, captions. No display font. Inter is the most common "developer tool" font.
**Impact:** Zero typographic identity. Every screen resembles default React SaaS.
**Fix:** Pair a display font for headings (DM Sans, Outfit, Syne, or similar). Add `--font-display` token.
**Command:** `/typeset`

#### ~~Page Title is a Package Name~~ ✅ FIXED
**Fixed 2026-03-23.** `<title>Plural Host</title>` in `index.html`.

---

### LOW

#### Single Breakpoint — No Tablet Layout
**Location:** `App.css` — single breakpoint at `max-width: 1024px`
**Description:** No intermediate breakpoint at ~768px. No `@container` queries.
**Command:** `/adapt`

#### `box-shadow` Animated (Non-GPU)
**Location:** `src/PluralHost.Web/src/App.css:128`
**Description:** `transition: box-shadow 0.3s` — not GPU-accelerated. Likely dead Vite template code.
**Command:** `/optimize`

#### Scattered Hardcoded Colors (Secondary Files)
**Location:** `BottomSheet.module.css:25` (`#444`), `Drawer.module.css:15,36` (`#333`), `Avatar.module.css:58` (`#fff`), `BottomNav.module.css:6` (`#2a2a2a`)
**Description:** Non-CommsTab files with occasional hardcoded values
**Command:** `/normalize`

#### Uniform Spacing — No Visual Rhythm
**Location:** All tab components — CommsTab, DossierTab, LogsTab, SpecsTab all use identical `padding: 16px; gap: 12px`
**Description:** Every content pane has the same density. No variation to indicate hierarchy or emphasis.
**Command:** `/arrange`

#### Empty States Give No Guidance
**Location:** `MembersPage.tsx:139`, `FrontPage.tsx:114`, `LogsPage.tsx:90`
**Description:** Most empty states are plain text. Only SystemPage's "No groups yet. Tap + to create one." teaches the interface.
**Command:** `/onboard`

---

## Systemic Issues

1. **Phantom tokens** — `--color-border` and `--color-text-muted` referenced everywhere but not defined. All new components inherit this pattern.
2. **Token adoption gap** — older tab components (CommsTab, DossierTab) predate or ignored the token system; newer ones (TokenSheet, SystemPage) use it correctly. Gap widening.
3. **Inconsistent focus styles** — correct pattern (`outline: 2px solid var(--color-primary)`) exists in 4 files; `outline: none` slipped into one.
4. **No loading skeletons** — all loading states are plain text strings.

---

## Positive Findings

- Global touch target baseline in `globals.css` (`button, a, [role="button"] { min-height: 44px }`) — rare to see done correctly at global level
- `prefers-reduced-motion` respected in every animated component — thorough
- Z-index scale in tokens (`--z-base/overlay/modal/toast`) — correct architecture
- `safe-area-inset-bottom` in BottomNav — correct PWA iPhone home bar handling
- `role="alert"` on error states (AccessTab), `role="status"` on loading (CommsTab, DossierTab) — good patterns, just need consistent application

---

## Recommended Fix Order (after /critique)

| Priority | Issue | Command |
|----------|-------|---------|
| 1 | `outline: none` WCAG violation | `/harden` |
| 2 | Add phantom tokens to tokens.css | `/normalize` |
| 3 | CommsTab hardcoded colors | `/normalize` |
| 4 | CommsTab touch target | `/harden` |
| 5 | Loading state `role="status"` | `/harden` |
| 6 | Font loading (CSS import → HTML link) | `/optimize` |
| 7 | Page title | `/clarify` |
| 8 | Typography — display font | `/typeset` |
| 9 | Empty state copy | `/onboard` |
| 10 | Secondary hardcoded colors | `/normalize` |
| 11 | Spacing rhythm | `/arrange` |
| 12 | Tablet breakpoint | `/adapt` |
| 13 | Aesthetic direction review | `/critique` → then `/typeset` or `/bolder` |
