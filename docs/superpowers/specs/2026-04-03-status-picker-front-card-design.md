# Status Picker on FrontCard — Design Spec

**Date:** 2026-04-03  
**Approach:** Option C — Bottom Sheet picker with predefined statuses + freetext fallback

---

## Problem

Fronting alter cards have no way to set or change front status. The existing UI is a bare freetext
`<input>` toggled by `editingStatus` state -- users must type status labels manually with no
awareness of what statuses have been defined in System > Statuses.

---

## Design

### FrontCard changes

Replace the `editingStatus` / `<input>` flow with a tappable status row that opens a `BottomSheet`.

**New prop:**
```ts
frontStatuses: FrontStatus[]
```

Passed in from FrontPage (fetched once, not per-card). `FrontStatus` is the existing type from
`api/frontStatuses.ts` -- `{ id, label, color, isDefault, isHidden }`.

**Remove:** `editingStatus` state, `handleStatusSave`, the `<input>` block.

**Add:** `showStatusSheet` boolean state. The status row becomes:

```tsx
<button className={styles.statusTap} onClick={() => setShowStatusSheet(true)}>
  {status
    ? <><span className={styles.statusDot} style={{ background: currentStatusColor }} />{status}</>
    : <span className={styles.placeholder}>Set a status…</span>
  }
</button>
```

`currentStatusColor` = color of the matching `FrontStatus` by label, or `var(--color-muted)` if freetext.

### StatusPickerSheet component

New file: `src/components/StatusPickerSheet.tsx` (+ `.module.css`)

```
Props:
  open: boolean
  currentStatus: string          // may be freetext or match a FrontStatus.label
  statuses: FrontStatus[]        // predefined, filtered to isHidden === false
  onSelect: (value: string) => void  // empty string = "None"
  onClose: () => void
```

Sheet contents (top to bottom):
1. **None** row -- clears status; shows as active when `currentStatus === ''`
2. Predefined statuses list -- each row: colored dot + label; active row highlighted lime
3. Divider
4. Freetext input + confirm button ("Set") -- pre-filled with current value if it's a freetext entry

Selecting any predefined item or submitting freetext immediately calls `onSelect(value)` then `onClose()`.

Uses existing `BottomSheet` component (`import BottomSheet from './BottomSheet'`).

### FrontPage changes

Add one query:
```ts
const { data: frontStatuses = [] } = useQuery({
  queryKey: ['frontStatuses'],
  queryFn: frontStatusesApi.list,
})
```

Pass `frontStatuses={frontStatuses}` to each `<FrontCard>`.

The existing `onUpdateStatus` callback calls `frontApi.update(uid, { customStatus: status })` where
`status` is always a string. "None" sends `customStatus: ''` (empty string) -- consistent with how
the existing freetext input behaves when cleared. No null handling needed.

---

## Data Flow

```
FrontPage
  useQuery(['frontStatuses']) → FrontStatus[]
  ↓ frontStatuses prop
FrontCard
  statusTap button → setShowStatusSheet(true)
  ↓
StatusPickerSheet
  onSelect(value) → onUpdateStatus(uid, value) → PATCH /api/front/{uid}/status
  onClose() → setShowStatusSheet(false) + local status state updated
```

---

## Files to create / modify

| File | Change |
|------|--------|
| `src/components/StatusPickerSheet.tsx` | New component |
| `src/components/StatusPickerSheet.module.css` | New styles |
| `src/components/FrontCard.tsx` | Replace input flow with sheet; add `frontStatuses` prop |
| `src/components/FrontCard.module.css` | Add `.statusDot` style |
| `src/pages/FrontPage.tsx` | Fetch statuses, pass to FrontCard |

No backend changes required.

---

## Edge cases

- **No statuses defined in System**: Sheet shows only "None" + freetext. This is valid -- user can
  still set freetext status or go define statuses in System first.
- **isHidden statuses**: Filtered out of the picker list. If the current status matches a hidden
  one, it still displays correctly on the card (just not pickable again).
- **Empty status list query**: `frontStatuses` defaults to `[]`; sheet renders gracefully.
- **Freetext that matches a label**: Displayed with the matching color dot on the card.

---

## Out of scope

- Creating new statuses from the FrontCard (belongs in System > Statuses)
- Reordering statuses (System page concern)
- Per-entry status history
