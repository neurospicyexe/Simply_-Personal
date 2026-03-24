# Frontend Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a system-wide visual pass — member accent colors on cards, eyebrow+accent-word page headers, TabBar member-color underline, BottomNav dot indicator, "Fronting now" badge on MemberDetail.

**Architecture:** CSS-first wherever possible — `--member-color` is already set on card roots via inline style. Structural TSX changes only where CSS alone cannot reach: TabBar `activeColor` prop, MemberDetail first-letter `<span>` and "Fronting now" badge, eyebrow labels inserted in page JSX.

**Tech Stack:** React 18 + TypeScript, CSS Modules, Vite, Vitest + @testing-library/react

---

## File Map

| File | What changes |
|------|-------------|
| `src/components/BottomNav.module.css` | `.active::before` dot indicator, darker bg, lighter inactive |
| `src/components/TabBar.tsx` | Add optional `activeColor?: string` prop; set `--tab-active-color` on bar |
| `src/components/TabBar.module.css` | `.active` uses `var(--tab-active-color, var(--color-primary))` |
| `src/components/MemberCard.module.css` | `::before` gradient top bar; front-dot background removed (set inline) |
| `src/components/MemberCard.tsx` | Compact front-dot: add `style={{ background: member.color }}` |
| `src/components/FrontCard.module.css` | `::before` 3px gradient top bar; `.timer` uses `var(--member-color)` |
| `src/pages/FrontPage.tsx` | Replace old title with eyebrow + accent-word h1 |
| `src/pages/FrontPage.module.css` | `.eyebrow`, `.pageTitle`, `.accentWord` classes; remove old `.title` |
| `src/pages/MembersPage.tsx` | Insert eyebrow + title above `.searchRow` |
| `src/pages/MembersPage.module.css` | `.eyebrow`, `.pageTitle`, `.accentWord` |
| `src/pages/SettingsPage.tsx` | Insert page title above first CollapsibleSection |
| `src/pages/SettingsPage.module.css` | `.pageTitle`, `.accentWord` |
| `src/pages/SystemPage.tsx` | Insert eyebrow + title above TabBar |
| `src/pages/SystemPage.module.css` | `.eyebrow`, `.pageTitle`, `.accentWord` |
| `src/pages/LogsPage.tsx` | Insert eyebrow + title above TabBar |
| `src/pages/LogsPage.module.css` | `.eyebrow`, `.pageTitle`, `.accentWord` |
| `src/pages/MemberDetailPage.tsx` | First-letter `<span>` on name; `activeColor` prop on TabBar; "Fronting now" badge via `frontApi.getCurrent` query |
| `src/pages/MemberDetailPage.module.css` | `.name` font size bump; `.frontingBadge` pill style |
| `src/components/tabs/AccessTab.tsx` | Privacy tier colored dot indicator next to label |
| `src/components/tabs/AccessTab.module.css` | `.tierDot` style |
| `src/__tests__/MembersPage.test.tsx` | Assert eyebrow text present |
| `src/__tests__/MemberDetailPage.test.tsx` | Update name assertion for split-span; assert fronting badge |

---

## Shared CSS pattern

The following classes are identical across all five page CSS modules. Copy them into each:

```css
.eyebrow {
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #444;
  display: block;
  margin-bottom: 3px;
}

.pageTitle {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1;
  color: var(--color-text);
  margin: 0 0 18px;
}

.accentWord {
  color: var(--color-primary);
}
```

---

## Task 1: BottomNav — dot indicator (CSS only)

**Files:**
- Modify: `src/PluralHost.Web/src/components/BottomNav.module.css`

No TSX changes. The dot is a CSS `::before` pseudo-element on the `.active` tab. Current BottomNav renders NavLinks with `isActive`-based className; the `.active` class already exists.

- [ ] **Step 1: Replace BottomNav.module.css**

```css
.nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex;
  background: #111;
  border-top: 1px solid #1e1e1e;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  z-index: var(--z-base);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-min);
  gap: var(--space-1);
  color: #333;
  font-size: var(--text-xs);
  transition: color 150ms;
  padding: var(--space-2) 0;
  text-decoration: none;
  position: relative;
}

.tab:hover {
  color: #666;
}

.active {
  color: var(--color-primary);
}

.active::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-primary);
}

.icon {
  font-size: var(--text-lg);
  line-height: 1;
}

.label {
  font-size: 10px;
}

@media (prefers-reduced-motion: reduce) {
  .tab {
    transition: none;
  }
}
```

- [ ] **Step 2: Run tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass (BottomNav has no unit tests; this is visual only).

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/components/BottomNav.module.css
git commit -m "style: BottomNav lime dot indicator on active tab, darker bg"
```

---

## Task 2: TabBar — activeColor prop

**Files:**
- Modify: `src/PluralHost.Web/src/components/TabBar.tsx`
- Modify: `src/PluralHost.Web/src/components/TabBar.module.css`
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.tsx`

Current `TabBar.module.css` uses `--color-primary` for the active tab color. We add a CSS variable with fallback so callers can override it per-instance.

- [ ] **Step 1: Update TabBar.module.css — replace active color with CSS variable**

The current `TabBar.module.css` `.tab.active` rule (lines 21-24) is:
```css
.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
```

Replace it with:
```css
.tab.active {
  color: var(--tab-active-color, var(--color-primary));
  border-bottom-color: var(--tab-active-color, var(--color-primary));
}
```

- [ ] **Step 3: Update TabBar.tsx to accept and apply activeColor**

Replace the full content of `TabBar.tsx` with:

```tsx
import styles from './TabBar.module.css'

interface Tab {
  id: string
  label: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  activeColor?: string
}

export default function TabBar({ tabs, activeTab, onChange, activeColor }: TabBarProps) {
  return (
    <div
      className={styles.bar}
      role="tablist"
      style={activeColor ? ({ '--tab-active-color': activeColor } as React.CSSProperties) : undefined}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={[styles.tab, activeTab === tab.id && styles.active].filter(Boolean).join(' ')}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Pass activeColor in MemberDetailPage.tsx**

In `src/PluralHost.Web/src/pages/MemberDetailPage.tsx`, change line 61 from:
```tsx
<TabBar tabs={[...TABS]} activeTab={activeTab} onChange={tab => setActiveTab(tab as TabId)} />
```
to:
```tsx
<TabBar tabs={[...TABS]} activeTab={activeTab} onChange={tab => setActiveTab(tab as TabId)} activeColor={member.color} />
```

- [ ] **Step 5: Run tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass. `activeColor` is optional so all other TabBar usages (SystemPage, LogsPage) are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/TabBar.tsx src/PluralHost.Web/src/components/TabBar.module.css src/PluralHost.Web/src/pages/MemberDetailPage.tsx
git commit -m "feat: TabBar activeColor prop — MemberDetail tab underline uses member color"
```

---

## Task 3: MemberCard — gradient top bar + member-color front dot

**Files:**
- Modify: `src/PluralHost.Web/src/components/MemberCard.module.css`
- Modify: `src/PluralHost.Web/src/components/MemberCard.tsx`

`--member-color` is **already** set on the card root via `style={{ '--member-color': member.color }}` (MemberCard.tsx line 26). Use `::before` pseudo-element for the top bar — no structural TSX change needed for the bar. Only the compact mode front-dot needs a TSX change.

- [ ] **Step 1: Replace MemberCard.module.css**

```css
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  text-decoration: none;
  color: var(--color-text);
  min-height: var(--touch-min);
  border-radius: 8px;
  border: 1px solid #252525;
  background: var(--color-surface);
  position: relative;
  overflow: hidden;
  transition: background 150ms ease;
}

.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    var(--member-color, var(--color-muted)) 0%,
    transparent 100%
  );
}

.card:hover, .card:focus-visible {
  background: var(--color-surface);
  filter: brightness(1.08);
}

.info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 0.95rem;
  font-weight: 500;
}

.pronouns {
  font-size: 0.78rem;
  color: var(--color-muted);
}

.compactItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  text-decoration: none;
  color: var(--color-text);
  min-height: var(--touch-min);
  border-radius: 8px;
  transition: background 150ms ease;
}

.compactItem:hover, .compactItem:focus-visible {
  background: var(--color-surface);
}

.compactName {
  font-size: 0.9rem;
}

.frontDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  /* background set via inline style from member.color */
}

@media (prefers-reduced-motion: reduce) {
  .card, .compactItem { transition: none; }
}
```

- [ ] **Step 2: Update compact mode front-dot in MemberCard.tsx**

In `MemberCard.tsx`, the compact render (lines 13-19) renders:
```tsx
{isFronting && <span className={styles.frontDot} aria-label="Fronting" />}
```

Change to:
```tsx
{isFronting && (
  <span
    className={styles.frontDot}
    style={{ background: member.color ?? 'var(--color-cyan)' }}
    aria-label="Fronting"
  />
)}
```

- [ ] **Step 3: Run tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/MemberCard.tsx src/PluralHost.Web/src/components/MemberCard.module.css
git commit -m "style: MemberCard gradient top bar and member-color front dot"
```

---

## Task 4: FrontCard — gradient top bar + timer in member color

**Files:**
- Modify: `src/PluralHost.Web/src/components/FrontCard.module.css`

`--member-color` is already set on `FrontCard`'s root div (FrontCard.tsx line 63). No TSX changes — use `::before` and CSS variable reference on `.timer`.

- [ ] **Step 1: Note what you're changing in FrontCard.module.css**

The current `.card` rule starts with `background: var(--color-surface); border-radius: 12px; overflow: hidden;` — it already has `overflow: hidden` but is missing `position: relative` and `border`.

The current `.timer` rule has `color: var(--color-cyan)`.

You will: (a) add `position: relative` and `border: 1px solid #252525` to `.card`, (b) add a `::before` rule after `.card`, and (c) change `.timer` color. Leave all other rules (`.header`, `.body`, `.statusRow`, etc.) completely unchanged.

- [ ] **Step 2: Apply targeted changes to FrontCard.module.css**

Make these three targeted changes (do NOT replace the entire file — preserve all other rules):

**Change 1 — `.card`:** Add `position: relative`, `overflow: hidden`, and `border: 1px solid #252525` to the existing `.card` rule.

**Change 2 — Add `::before` after the `.card` rule:**
```css
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--member-color, var(--color-primary)) 0%,
    transparent 60%
  );
}
```

**Change 3 — `.timer`:** Change `color: var(--color-cyan)` to `color: var(--member-color, var(--color-cyan))`.

- [ ] **Step 3: Run FrontCard tests**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/FrontCard.test.tsx --reporter=verbose
```

Expected: all tests pass (only CSS changed, no behavior).

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/FrontCard.module.css
git commit -m "style: FrontCard gradient top bar and member-color timer"
```

---

## Task 5: Page headers — eyebrow + accent-word title on all five pages

Current state of each page's JSX before this task:
- **FrontPage:** Has `<div className={styles.header}><h1 className={styles.title}>{fronters.length} fronting now</h1><button>+ Add Fronter</button></div>`
- **MembersPage:** No header — render starts directly with `<div className={styles.searchRow}>`. Eyebrow + title must be inserted BEFORE `.searchRow`.
- **SettingsPage:** No page title — render starts directly with `<CollapsibleSection>` inside a wrapper div. Insert a title `<h1>` ABOVE the first `<CollapsibleSection>`.
- **SystemPage:** No page title — render starts with a `<TabBar>`. Insert eyebrow + title ABOVE the TabBar.
- **LogsPage:** No page title — render starts with a `<TabBar>`. Insert eyebrow + title ABOVE the TabBar.

**Files:**
- Modify all five `.tsx` and corresponding `.module.css` files

- [ ] **Step 1: Add shared CSS to all five module.css files**

Add the shared eyebrow/title CSS block (shown in "Shared CSS pattern" section above) to each of these files:
- `src/PluralHost.Web/src/pages/FrontPage.module.css`
- `src/PluralHost.Web/src/pages/MembersPage.module.css`
- `src/PluralHost.Web/src/pages/SettingsPage.module.css`
- `src/PluralHost.Web/src/pages/SystemPage.module.css`
- `src/PluralHost.Web/src/pages/LogsPage.module.css`

Also delete the old `.title` rule from `FrontPage.module.css` — it is a top-level `.title { ... }` selector (not nested). It will be replaced by `.pageTitle`.

- [ ] **Step 2: Update FrontPage.tsx header**

Find and replace the `<div className={styles.header}>...</div>` block in `FrontPage.tsx`:

```tsx
// BEFORE:
<div className={styles.header}>
  <h1 className={styles.title}>
    {fronters.length} fronting now
  </h1>
  <button
    className={styles.addBtn}
    onClick={() => setShowPicker(s => !s)}
    aria-label="Add fronter"
  >
    + Add Fronter
  </button>
</div>

// AFTER:
<div className={styles.header}>
  <div>
    <span className={styles.eyebrow}>Right now</span>
    <h1 className={styles.pageTitle}>
      <span className={styles.accentWord}>Fronting</span>
    </h1>
  </div>
  <button
    className={styles.addBtn}
    onClick={() => setShowPicker(s => !s)}
    aria-label="Add fronter"
  >
    + Add
  </button>
</div>
```

Also update `FrontPage.module.css` — the `.header` rule needs `align-items: flex-end` so the button aligns to the bottom of the tall header:
```css
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}
```

- [ ] **Step 3: Update MembersPage.tsx — insert header above search**

In `MembersPage.tsx`, the `return` statement's JSX starts with:
```tsx
<div className={styles.page}>
  {/* Search */}
  <div className={styles.searchRow}>
```

Insert the header block between `<div className={styles.page}>` and the search row:
```tsx
<div className={styles.page}>
  <div>
    <span className={styles.eyebrow}>Your system</span>
    <h1 className={styles.pageTitle}>
      <span className={styles.accentWord}>Members</span>
    </h1>
  </div>
  {/* Search */}
  <div className={styles.searchRow}>
```

- [ ] **Step 4: Update SettingsPage.tsx — insert title above first section**

Read `SettingsPage.tsx` to find the render `return`. The page renders a `<div className={styles.page}>` (or similar) containing `<CollapsibleSection>` elements. Add a title before the first one:

```tsx
// Add before the first <CollapsibleSection>:
<h1 className={styles.pageTitle}>
  <span className={styles.accentWord}>Settings</span>
</h1>
```

No eyebrow on Settings — it's a utility page with no contextual framing needed.

- [ ] **Step 5: Update SystemPage.tsx — insert eyebrow + title above TabBar**

Read `SystemPage.tsx` to find the render `return`. The page renders a `<TabBar>` near the top. Insert before the TabBar:

```tsx
<span className={styles.eyebrow}>Manage</span>
<h1 className={styles.pageTitle}>
  <span className={styles.accentWord}>System</span>
</h1>
```

- [ ] **Step 6: Update LogsPage.tsx — insert eyebrow + title above TabBar**

Read `LogsPage.tsx` to find the render `return`. Insert before the TabBar:

```tsx
<span className={styles.eyebrow}>Recent activity</span>
<h1 className={styles.pageTitle}>
  <span className={styles.accentWord}>Logs</span>
</h1>
```

- [ ] **Step 7: Run all frontend tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: tests pass. If `MembersPage.test.tsx` or `FrontPage` tests assert on old title text (e.g. `"fronting now"`), update those assertions to match new text. Search for `getByText('fronting')` or `getByRole('heading')` in test files and update.

- [ ] **Step 8: Commit**

```bash
git add src/PluralHost.Web/src/pages/
git commit -m "style: eyebrow + accent-word page headers on all five pages"
```

---

## Task 6: MemberDetail — first-letter color + Fronting Now badge

**Files:**
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.module.css`
- Modify: `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx`

- [ ] **Step 1: Update the name heading in MemberDetailPage.tsx**

Current (line 56):
```tsx
<h1 className={styles.name}>{member.name}</h1>
```

Replace with:
```tsx
<h1 className={styles.name}>
  <span style={{ color: member.color }}>{member.name[0]}</span>
  {member.name.slice(1)}
</h1>
```

- [ ] **Step 2: Add "Fronting now" badge — add fronters query**

MemberDetailPage currently does NOT call `frontApi.getCurrent`. `frontApi.getCurrent` is already used in `FrontPage.tsx` (line 17) — same function, same shape. Add the import and query at the top of the component:

```tsx
// Add import at top of file:
import { frontApi } from '../api/front'

// Add inside the component, after the existing queries:
const { data: fronters = [] } = useQuery({
  queryKey: ['fronters'],
  queryFn: frontApi.getCurrent,
})

const isFronting = fronters.some((f: { content: { member: string } }) => f.content.member === member.id)
```

Then in the JSX, add a badge after the pronouns line:
```tsx
{isFronting && (
  <span className={styles.frontingBadge} aria-label="Currently fronting">
    Fronting now
  </span>
)}
```

- [ ] **Step 3: Add styles to MemberDetailPage.module.css**

Update the `.name` rule (bump font size to 1.75rem, weight to 800):
```css
.name {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--color-text);
  margin: 0;
}
```

Add `.frontingBadge`:
```css
.frontingBadge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(255, 77, 184, 0.12);
  color: var(--color-pink);
  border: 1px solid rgba(255, 77, 184, 0.25);
  margin-top: 6px;
}
```

- [ ] **Step 4: Run MemberDetailPage tests and fix any failures**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/MemberDetailPage.test.tsx --reporter=verbose
```

Two kinds of failures to expect and fix:

**A — Split name assertion:** If a test uses `screen.getByText('Riven')` (exact match), it will fail because the name is now split across two DOM nodes. Replace any such assertion with:
```tsx
expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Riven')
```
This applies to any query pattern that does an exact string match on the full name — `getByText`, `queryByText`, `findByText` with exact matching.

**B — Missing `frontApi.getCurrent` mock:** The component now calls `frontApi.getCurrent`. If tests mock API modules, add:
```tsx
// In the mock setup section of MemberDetailPage.test.tsx:
vi.mocked(frontApi.getCurrent).mockResolvedValue([])
```
If `frontApi` is not already mocked in the file, add it alongside existing API mocks.

- [ ] **Step 5: Run all tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/pages/MemberDetailPage.tsx src/PluralHost.Web/src/pages/MemberDetailPage.module.css src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx
git commit -m "feat: MemberDetail first-letter member color, Fronting Now badge, larger name"
```

---

## Task 7: AccessTab — privacy tier colored dot indicator

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/AccessTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/AccessTab.module.css`

The Privacy field uses a `<select>` element (not pills). We add a small colored dot indicator next to the "Privacy" label that reflects the current bucket's tier. Color map: sortOrder 0 = lime, 1 = cyan, 2 = purple (Trusted), 3 = pink/danger.

Current render (lines 88-102 of AccessTab.tsx):
```tsx
<div className={styles.field}>
  <span className={styles.fieldLabel}>Privacy</span>
  <select
    className={styles.bucketSelect}
    value={member.bucketId}
    onChange={e => updateMutation.mutate({ bucketId: e.target.value })}
    aria-label="Privacy bucket"
  >
    {buckets.map(b => (
      <option key={b.id} value={b.id}>
        {b.emoji ? `${b.emoji} ` : ''}{b.name}
      </option>
    ))}
  </select>
</div>
```

- [ ] **Step 1: Add tier color lookup and dot to AccessTab.tsx**

`buckets` is already in scope — `AccessTab.tsx` line 16 fetches it: `const { data: buckets = [] } = useQuery({ queryKey: ['buckets'], queryFn: bucketsApi.list })`. After that existing line, add a helper constant:

```tsx
const TIER_COLORS: Record<number, string> = {
  0: 'var(--color-primary)',  // Public — lime
  1: 'var(--color-cyan)',     // Friend — cyan
  2: 'var(--color-purple)',   // Trusted — purple
  3: 'var(--color-pink)',     // Private — pink
}

const selectedBucket = buckets.find(b => b.id === member.bucketId)
const tierColor = TIER_COLORS[selectedBucket?.sortOrder ?? 0] ?? 'var(--color-muted)'
```

Then update the Privacy field render to add a dot beside the label:

```tsx
<div className={styles.field}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
    <span className={styles.fieldLabel}>Privacy</span>
    <span
      className={styles.tierDot}
      style={{ background: tierColor }}
      aria-hidden="true"
    />
  </div>
  <select
    className={styles.bucketSelect}
    value={member.bucketId}
    onChange={e => updateMutation.mutate({ bucketId: e.target.value })}
    aria-label="Privacy bucket"
  >
    {buckets.map(b => (
      <option key={b.id} value={b.id}>
        {b.emoji ? `${b.emoji} ` : ''}{b.name}
      </option>
    ))}
  </select>
</div>
```

- [ ] **Step 2: Add `.tierDot` to AccessTab.module.css**

```css
.tierDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-block;
}
```

- [ ] **Step 3: Run AccessTab tests**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/AccessTab.test.tsx --reporter=verbose
```

Expected: all tests pass. The dot is `aria-hidden` so it doesn't affect accessible role queries.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/AccessTab.tsx src/PluralHost.Web/src/components/tabs/AccessTab.module.css
git commit -m "style: AccessTab privacy tier colored dot indicator (purple for Trusted)"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: TypeScript type check**

```bash
cd src/PluralHost.Web && npm run build
```

Expected: zero TypeScript errors. This catches type errors that vitest skips (e.g. `as React.CSSProperties` on CSS variables).

- [ ] **Step 3: Check each success criterion from the spec**

From `docs/superpowers/specs/2026-03-24-frontend-visual-overhaul-design.md`:

- [ ] A member whose `color` is `#b400ff` shows purple avatar fill, gradient bar, and timer — confirmed by MemberCard `::before` and FrontCard `::before` using `--member-color`
- [ ] Pink "Fronting now" badge visible on MemberDetail when a member is in front — added in Task 6
- [ ] Every member card identifiable by color without reading the name — confirmed by avatar fill (Avatar already uses `member.color`) + top gradient bar
- [ ] All page titles `>= 1.75rem` Space Grotesk 800 with accent word in lime — added in Task 5
- [ ] Privacy tier dot in AccessTab is purple when member is in Trusted bucket (sortOrder 2) — added in Task 7
- [ ] MemberDetail tab underline uses `member.color` via `activeColor` prop — added in Task 2. Manual check: open MemberDetail for a member whose `color` is NOT `#b6ff00` (e.g. `#ff4db8`). The active tab underline should be that member's color, not lime.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "style: frontend visual overhaul — final cleanup"
```
