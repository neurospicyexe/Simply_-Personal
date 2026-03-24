# Frontend Visual Overhaul — Design Spec
**Date:** 2026-03-24
**Status:** Approved by user
**Scope:** All pages and shared components — system-wide visual pass

---

## Problem

The current UI is flat and grey despite a vivid brand palette being defined in `tokens.css`. Specific issues:

- `--color-purple` (#b400ff) is completely absent from all CSS files
- `--color-pink` (#ff4db8) appears only on `.removeBtn`
- `--color-cyan` is the only accent color actually used (timers, page titles)
- `--color-primary` (lime) is limited to buttons and active toggle states
- All pages use `padding: 16px` and `gap: 8-12px` — no density variation = no visual hierarchy
- Page titles are `1.25rem` — same weight as body content
- `--font-display` (Space Grotesk) is declared but underused; only headers use it and they're small
- Member cards have no visual weight: just a hover state that barely changes background
- Each member has their own `color` property but it's only shown as a 32px swatch on the detail page

---

## Design Decisions

**Direction:** Full system — color AND layout together
**Color intensity on cards:** Medium — filled avatar + gradient top bar + tinted tags; card background stays dark
**Typography treatment:** Accent word — key noun in lime, rest in white, ~1.7-1.8rem Space Grotesk 800

---

## Design System Changes

### 1. Page Headers (all pages)

Every page gets a consistent header pattern:

```
[eyebrow label — small, muted, uppercase]
[Key Noun]   (with accent word in --color-primary)
```

- Eyebrow: `0.62rem`, `font-weight: 700`, `text-transform: uppercase`, `letter-spacing: 0.14em`, `color: #444`
- Title: `font-family: --font-display`, `font-size: 1.75rem`, `font-weight: 800`, `letter-spacing: -0.035em`
- Accent word: `color: var(--color-primary)` on the key noun only

Page-specific eyebrow + title pairs:
| Page | Eyebrow | Title |
|------|---------|-------|
| Front | "Right now" | **Fronting** |
| Members | "Your system" | **Members** |
| MemberDetail | — | **[Name]** (member's first letter in member color — see §5) |
| History | "Recent activity" | **History** |
| System | "Manage" | **System** |
| Settings | — | **Settings** |

**Layout order on pages with controls (Members):** eyebrow + title block comes first, then search bar, then view-mode toggle + add button row. The header is not sticky — it scrolls with the page.

### 2. Member Cards — Medium Color Treatment

Applied to both `FrontCard` and `MemberCard` (all views):

- **Top bar:** `height: 3px`, `background: linear-gradient(90deg, <member-color> 0%, transparent 100%)` — fades to transparent, not to purple, so any color works
- **Avatar:** filled circle (`background: <member-color>`), initial letter in `--color-bg` (#121212), `font-weight: 800`
- **Timer (FrontCard):** `color: <member-color>` — not always cyan
- **Co-fronter timers:** each co-fronter's timer tinted to their own color. `FrontCard` already receives `members: Member[]` (full member list) from its parent. Co-fronter rows look up `members.find(m => m.id === entry.memberId)?.color ?? 'var(--color-muted)'` for each `FrontHistory` entry in the co-fronting list.
- **Tags/chips:** member-color tinted pills — `background: <member-color-at-12%-opacity>`, `color: <member-color>`, `border: 1px solid <member-color-at-25%-opacity>`
- **Card background:** stays `--color-surface` (#1a1a1a) — no tint on card bg
- **Card border:** `1px solid #252525` (slightly lighter than surface, adds definition)

### 3. FrontCard Specific

- "Also fronting" section gets an eyebrow label: `font-size: 0.62rem`, `color: #444`, `text-transform: uppercase`, `letter-spacing: 0.14em`
- "Primary front" label above the main fronter card (same eyebrow style)
- Each co-fronter row: dot + name + their own timer in their color (replaces plain text list)

### 4. MemberCard List View

- Compact: 2px gradient top bar (`linear-gradient(90deg, <member-color>, transparent)`)
- Avatar filled with member color
- Front-indicator dot: member's own color (replaces always-cyan)

### 5. MemberDetail Header

- Avatar: 64px, filled with member color
- Name: `font-size: 1.5rem`, Space Grotesk 800; first letter wrapped in a `<span>` with `style={{ color: member.color }}` — use JSX, not `::first-letter` (CSS custom properties don't work on pseudo-elements reliably)
  ```tsx
  // MemberDetailPage.tsx
  <h1 className={styles.name}>
    <span style={{ color: member.color }}>{member.name[0]}</span>
    {member.name.slice(1)}
  </h1>
  ```
- Active tab underline: member's color via `activeColor` prop added to `TabBar`:
  ```tsx
  // TabBar.tsx — add optional prop
  interface TabBarProps {
    tabs: { id: string; label: string }[];
    activeTab: string;
    onTabChange: (id: string) => void;
    activeColor?: string; // defaults to var(--color-primary) if not set
  }
  // TabBar.module.css — use CSS variable set via inline style
  .tabActive { border-bottom-color: var(--tab-active-color, var(--color-primary)); }
  // Usage in MemberDetailPage.tsx
  <TabBar ... activeColor={member.color} />
  // In TabBar.tsx, set style={{ '--tab-active-color': activeColor } as React.CSSProperties} on the container
  ```
- "Fronting now" tag: `--color-pink` pill (shown when member is in current front)
- Tags from group membership: group chips use the group's own `.color` — no new "role" field needed; purple appears naturally when a group's color is `--color-purple`

### 6. Bottom Navigation

- Active item: `color: var(--color-primary)` (already correct)
- Add: `4px` lime dot indicator above the icon on active item (`width: 4px; height: 4px; border-radius: 50%; background: var(--color-primary); margin-bottom: -2px`)
- Inactive items: stay `#333` (slightly lighter than current `--color-muted` to reduce muddiness)
- Background: `#111` (one step darker than surface)
- Border top: `1px solid #1e1e1e`

### 7. Purple — Finally Earns Its Place

Purple (`--color-purple: #b400ff`) appears naturally rather than forced:
- Any member whose `member.color` is `#b400ff` (or close) gets purple avatar fill + gradient bar
- AccessTab bucket/privacy tier pills: the "Trusted" tier pill uses `--color-purple` as its accent
- Group chips on MemberDetail AccessTab: groups the owner has colored purple will render purple chips
- No new "role" or "type" field is added to the Member type — purple comes from data that already exists (member.color, group.color, bucket tier)

### 8. Spacing Rhythm

- Page padding: increase from `16px` to `18px 16px` (slightly more breathing room)
- Header margin-bottom: `20px` → `18px` (tighter after large title, feels intentional)
- Section eyebrow labels get `6px` top padding, `4px` bottom padding
- Card gap on list pages: `5px` (slightly tighter than current `12px` — creates denser, scannable list feel)
- Inside cards: keep `14px` padding — not changing card innards

### 9. Typography — Missing Usage

`--font-display` (Space Grotesk) currently only hits on `h1, h2, h3` globally and a few explicit classes. Ensure it applies to:
- All page title elements (confirmed via the header pattern above)
- Nothing else needs it — body/labels stay Inter

---

## Affected Files

| File | Changes |
|------|---------|
| `tokens.css` | No changes — tokens are correct |
| `globals.css` | No changes |
| `FrontPage.module.css` | Header pattern, section labels |
| `MembersPage.module.css` | Header pattern, card gap |
| `MemberDetailPage.module.css` | Header pattern, member-color tab underline |
| `SettingsPage.module.css` | Header pattern |
| `SystemPage.module.css` | Header pattern |
| `FrontCard.module.css` | Top bar, avatar fill, timer color, co-fronter row styles |
| `MemberCard.module.css` | Top bar, avatar fill, front-dot color |
| `BottomNav.module.css` | Nav dot indicator, slightly darker bg, lighter inactive |
| `MemberDetailPage.tsx` | Pass member color to tab underline via `activeColor` prop, first-letter `<span>` with inline style |
| `FrontCard.tsx` | Co-fronter timers colored by each co-fronter's `member.color` (looked up from `members[]` prop) |
| `MemberCard.tsx` | Avatar fill from `member.color` via inline style, front-dot from `member.color` |
| `TabBar.tsx` | Add optional `activeColor?: string` prop; set `--tab-active-color` CSS variable on container |
| `TabBar.module.css` | `.tabActive` uses `var(--tab-active-color, var(--color-primary))` for underline color |
| `AccessTab.module.css` | Trusted tier bucket pill uses `--color-purple` accent |

---

## Out of Scope

- No new pages or routes
- No backend changes
- No new tokens — working entirely with existing palette
- No font changes — Space Grotesk and Inter stay
- No layout restructuring (single-column mobile-first stays)
- Per-alter theming (different background per member) — deferred to future work

---

## Success Criteria

- At least one member with `color: '#b400ff'` (purple) renders correctly — avatar fill, gradient bar, timer all purple
- Pink (#ff4db8) appears on the "Fronting now" tag on MemberDetail (not just on the delete button)
- Every member card is identifiable by color at a glance without reading the name
- Page titles are `>= 1.75rem` Space Grotesk 800 with the key noun in `--color-primary`
- The Trusted tier bucket pill in AccessTab renders with a purple accent
- `TabBar` active underline on MemberDetail uses `member.color`, not always lime
