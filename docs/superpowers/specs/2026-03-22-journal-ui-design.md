# Journal UI Design Spec

**Date:** 2026-03-22
**Plan:** Plan 8 -- Journal UI
**Status:** Approved, ready for implementation planning

---

## Overview

Implement a Journal UI as part of a new "Logs" page that replaces the existing `HistoryStubPage`. The backend (`JournalsController`, `JournalEntry` entity) is already fully implemented. This spec covers frontend-only work.

---

## Navigation Change

The current History nav entry (stub) becomes **Logs**, pointing to `/logs`.

- `BottomNav` entry: label `Logs`, route `/logs`, icon `BookOpen` (or similar from lucide-react)
- Route in `App.tsx`: `/history` → `/logs`, component `HistoryStubPage` → `LogsPage`
- `HistoryStubPage.tsx` is deleted and replaced by `LogsPage.tsx`

---

## LogsPage

**File:** `src/pages/LogsPage.tsx` + `LogsPage.module.css`

Two tabs rendered via the existing `TabBar` component:

```ts
const TABS = [
  { id: 'Journal', label: 'Journal' },
  { id: 'History', label: 'Front History' },
]
```

Tab state is local (`useState`). Front History tab only fetches when active (conditional `enabled` on `useQuery`).

### Journal Tab

- `useQuery(['journals'], journalsApi.list)` -- fetches on mount, newest-first (backend enforces ordering and 500-entry cap)
- Client-side `searchTerm` state; search bar filters across `title` and `content` (case-insensitive substring)
- Entry list renders `JournalEntryCard` components
- Plus button (top-right or floating) opens `EntrySheet` in create mode
- Tapping a card opens `EntrySheet` in view mode with that entry

### Front History Tab

- `useQuery(['front-history'], frontApi.getHistory)` -- only fetches when this tab is active
- Simple chronological list: member name + timestamp
- No sheet; read-only display (mirrors existing `LogsTab` behavior on member detail)
- Reuses the existing `frontApi.getHistory` call (already wired in `LogsTab`)

---

## JournalEntryCard

Minimal card style:

```
[Title or "Untitled"]            [Mar 22, 2:14 PM]
[🔒 Private]  (or nothing if public)
```

- Title falls back to `"Untitled"` if `entry.title` is null/empty
- Date formatted as `MMM DD, h:mm A`
- Privacy badge: small pill showing `🔒 Private` when `isPrivate === true`; hidden when public
- Full card is a tap target that opens `EntrySheet`

---

## EntrySheet

**File:** `src/components/EntrySheet.tsx` + `EntrySheet.module.css`

Wraps the existing `BottomSheet` component.

### Props

```ts
interface EntrySheetProps {
  entry: JournalEntry | null  // null = create new
  isOpen: boolean
  onClose: () => void
}
```

### Mode: View (existing entry, opened from list)

- Title displayed as heading (or "Untitled" if empty)
- Content rendered via `react-markdown` with `remark-gfm`
- Pencil icon button rendered at the top of the sheet content area (inside `children`, not in the `BottomSheet` header -- `BottomSheet` has no header action slot). Positioned with `display:flex; justify-content:flex-end` above the rendered markdown.
- `isPrivate` shown as a non-interactive badge
- No save/cancel controls

### Mode: Edit (new entry OR after tapping pencil)

- `<input>` for optional title
- `<textarea>` for content (required; save button disabled if empty)
- `IsPrivate` toggle: checkbox labeled "Private (hidden from share links)" -- defaults `true` for new entries
- **Save** -- calls `journalsApi.create` (new) or `journalsApi.update` (existing); invalidates `['journals']`; switches back to view mode on success
- **Cancel** -- discards changes; new entry closes sheet, existing entry returns to view mode
- **Delete** (edit mode only, existing entries) -- soft-delete via `journalsApi.delete`; invalidates `['journals']`; closes sheet. No PIN required.

### New entry flow

Sheet opens directly in edit mode (no view mode since there's nothing to view). Cancel closes the sheet entirely.

---

## API Module

**File:** `src/api/journals.ts`

```ts
interface JournalEntry {
  id: string
  title: string | null
  content: string
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

export const journalsApi = {
  list: () => apiFetch<JournalEntry[]>('/api/journals'),
  create: (body: { title?: string; content: string; isPrivate: boolean }) =>
    apiFetch<JournalEntry>('/api/journals', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { title?: string; content?: string; isPrivate?: boolean }) =>
    apiFetch<JournalEntry>(`/api/journals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) =>
    apiFetch<void>(`/api/journals/${id}`, { method: 'DELETE' }),
}
```

---

## Type Addition

Add `JournalEntry` to `src/types.ts`:

```ts
export interface JournalEntry {
  id: string
  title: string | null
  content: string
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}
```

---

## Dependencies

Add to `src/PluralHost.Web/package.json`:

- `react-markdown`
- `remark-gfm`

---

## State Summary

| State | Owner | Purpose |
|-------|-------|---------|
| `activeTab` | `LogsPage` | Journal vs History tab |
| `searchTerm` | `LogsPage` (Journal tab) | Client-side filter |
| `sheetOpen` | `LogsPage` | controls whether `EntrySheet` is visible |
| `selectedEntry` | `LogsPage` | `JournalEntry` = open existing; `null` + `sheetOpen=true` = create new |
| `mode` | `EntrySheet` | `'view'` or `'edit'`; initialises to `'edit'` when `entry` prop is `null` |

---

## Out of Scope

- Pagination or infinite scroll (500-entry cap is sufficient for now)
- Per-alter journal filtering (no `memberId` on `JournalEntry` backend)
- Share token UI integration (noted in backend; frontend deferred)
- Rich text editor (markdown textarea is sufficient)
- Tags or categories

---

## Files Created / Modified

| Action | File |
|--------|------|
| Delete | `src/pages/HistoryStubPage.tsx` |
| Create | `src/pages/LogsPage.tsx` |
| Create | `src/pages/LogsPage.module.css` |
| Create | `src/components/EntrySheet.tsx` |
| Create | `src/components/EntrySheet.module.css` |
| Create | `src/api/journals.ts` |
| Modify | `src/types.ts` (add `JournalEntry`) |
| Modify | `src/App.tsx` (route `/history` → `/logs`) |
| Modify | `src/components/BottomNav.tsx` (label + icon) |
| Modify | `src/PluralHost.Web/package.json` (add `react-markdown`, `remark-gfm`) |

---

## Testing

- Unit tests for `LogsPage`: renders tabs, search filters entries, plus button opens sheet in create mode
- Unit tests for `EntrySheet`: view mode renders markdown, pencil switches to edit, save calls correct API, cancel returns to view, delete closes sheet
- Fixture: `JournalEntry` with `title`, `content`, `isPrivate`, `createdAt`
- Mock `journalsApi` via `vi.mock('../api/journals')`
