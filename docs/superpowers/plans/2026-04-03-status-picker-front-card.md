# Status Picker on FrontCard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the freetext status input on FrontCard with a BottomSheet picker that shows predefined front statuses plus a freetext fallback.

**Architecture:** New `StatusPickerSheet` component wraps the existing `BottomSheet`. `FrontPage` fetches `FrontStatus[]` once via TanStack Query and passes the array as a prop to each `FrontCard`. `FrontCard` replaces the `editingStatus`/`<input>` state with `showStatusSheet` boolean state and renders `StatusPickerSheet`.

**Tech Stack:** React + TypeScript, CSS Modules, Vitest + @testing-library/react + userEvent

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/PluralHost.Web/src/components/StatusPickerSheet.tsx` | Create | Sheet UI: None option, predefined list, freetext input |
| `src/PluralHost.Web/src/components/StatusPickerSheet.module.css` | Create | Row/dot/freetext styles |
| `src/PluralHost.Web/src/__tests__/StatusPickerSheet.test.tsx` | Create | Unit tests for the sheet |
| `src/PluralHost.Web/src/components/FrontCard.tsx` | Modify | Swap editingStatus/input for showStatusSheet + StatusPickerSheet; add frontStatuses prop |
| `src/PluralHost.Web/src/components/FrontCard.module.css` | Modify | Add `.statusDot`; update `.statusTap` to flex; remove unused `.statusInput` |
| `src/PluralHost.Web/src/__tests__/FrontCard.test.tsx` | Modify | Add `frontStatuses: []` to BASE; add status-picker interaction tests |
| `src/PluralHost.Web/src/pages/FrontPage.tsx` | Modify | Query `frontStatusesApi.list`; pass `frontStatuses` to each FrontCard |

---

### Task 1: StatusPickerSheet — tests first

**Files:**
- Create: `src/PluralHost.Web/src/__tests__/StatusPickerSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/PluralHost.Web/src/__tests__/StatusPickerSheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import StatusPickerSheet from '../components/StatusPickerSheet'
import type { FrontStatus } from '../api/frontStatuses'

const STATUSES: FrontStatus[] = [
  { id: 's1', label: 'Present', color: '#b6ff00', isDefault: true, isHidden: false, createdAt: '' },
  { id: 's2', label: 'Co-con', color: '#00d4ff', isDefault: false, isHidden: false, createdAt: '' },
  { id: 's3', label: 'Hidden', color: null, isDefault: false, isHidden: true, createdAt: '' },
]

const BASE = {
  isOpen: true,
  currentStatus: '',
  statuses: STATUSES,
  onSelect: vi.fn(),
  onClose: vi.fn(),
}

test('renders nothing when closed', () => {
  render(<StatusPickerSheet {...BASE} isOpen={false} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('shows None and visible statuses only', () => {
  render(<StatusPickerSheet {...BASE} />)
  expect(screen.getByRole('button', { name: /^none$/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^present$/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^co-con$/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^hidden$/i })).not.toBeInTheDocument()
})

test('selecting a predefined status calls onSelect and onClose', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<StatusPickerSheet {...BASE} onSelect={onSelect} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: /^present$/i }))
  expect(onSelect).toHaveBeenCalledWith('Present')
  expect(onClose).toHaveBeenCalled()
})

test('selecting None calls onSelect with empty string', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<StatusPickerSheet {...BASE} onSelect={onSelect} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: /^none$/i }))
  expect(onSelect).toHaveBeenCalledWith('')
  expect(onClose).toHaveBeenCalled()
})

test('typing freetext and clicking Set calls onSelect', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<StatusPickerSheet {...BASE} onSelect={onSelect} onClose={onClose} />)
  await userEvent.type(screen.getByLabelText(/custom status/i), 'Tired')
  await userEvent.click(screen.getByRole('button', { name: /^set$/i }))
  expect(onSelect).toHaveBeenCalledWith('Tired')
  expect(onClose).toHaveBeenCalled()
})

test('Set button disabled when freetext is empty', () => {
  render(<StatusPickerSheet {...BASE} />)
  expect(screen.getByRole('button', { name: /^set$/i })).toBeDisabled()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/StatusPickerSheet.test.tsx
```

Expected: all 6 tests FAIL (StatusPickerSheet not found).

---

### Task 2: StatusPickerSheet — implementation

**Files:**
- Create: `src/PluralHost.Web/src/components/StatusPickerSheet.tsx`
- Create: `src/PluralHost.Web/src/components/StatusPickerSheet.module.css`

- [ ] **Step 1: Create CSS module**

Create `src/PluralHost.Web/src/components/StatusPickerSheet.module.css`:

```css
.list {
  display: flex;
  flex-direction: column;
  padding: var(--space-2) 0 var(--space-4);
}

.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  min-height: 48px;
  border-radius: var(--radius-md);
  text-align: left;
  width: 100%;
  transition: background 150ms;
}

.item:hover {
  background: var(--color-bg);
}

.item.active {
  background: rgba(182, 255, 0, 0.08);
  color: var(--color-primary);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.label {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 600;
}

.divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--space-2) var(--space-4);
}

.freetextRow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4) 0;
}

.freetextInput {
  flex: 1;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 var(--space-3);
  color: var(--color-text);
  font-size: var(--text-sm);
  min-height: 44px;
  box-sizing: border-box;
}

.freetextInput:focus {
  outline: none;
  border-color: var(--color-primary);
}

.setBtn {
  background: var(--color-primary);
  color: var(--color-bg);
  border: none;
  border-radius: var(--radius-md);
  padding: 0 var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  cursor: pointer;
  min-height: 44px;
  flex-shrink: 0;
}

.setBtn:disabled {
  opacity: 0.4;
  cursor: default;
}
```

- [ ] **Step 2: Create component**

Create `src/PluralHost.Web/src/components/StatusPickerSheet.tsx`:

```tsx
import { useState } from 'react'
import BottomSheet from './BottomSheet'
import type { FrontStatus } from '../api/frontStatuses'
import styles from './StatusPickerSheet.module.css'

interface StatusPickerSheetProps {
  isOpen: boolean
  currentStatus: string
  statuses: FrontStatus[]
  onSelect: (value: string) => void
  onClose: () => void
}

export default function StatusPickerSheet({
  isOpen,
  currentStatus,
  statuses,
  onSelect,
  onClose,
}: StatusPickerSheetProps) {
  const visible = statuses.filter(s => !s.isHidden)
  const isCustom = currentStatus !== '' && !visible.some(s => s.label === currentStatus)
  const [freetext, setFreetext] = useState(isCustom ? currentStatus : '')

  const handleSelect = (value: string) => {
    onSelect(value)
    onClose()
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Set Status">
      <div className={styles.list}>
        <button
          className={[styles.item, currentStatus === '' ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => handleSelect('')}
        >
          <span className={styles.dot} style={{ background: 'var(--color-border)' }} />
          <span className={styles.label}>None</span>
        </button>

        {visible.map(s => (
          <button
            key={s.id}
            className={[styles.item, currentStatus === s.label ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => handleSelect(s.label)}
          >
            <span className={styles.dot} style={{ background: s.color ?? 'var(--color-muted)' }} />
            <span className={styles.label}>{s.label}</span>
          </button>
        ))}

        <hr className={styles.divider} />

        <div className={styles.freetextRow}>
          <input
            className={styles.freetextInput}
            placeholder="or type a custom status…"
            value={freetext}
            onChange={e => setFreetext(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && freetext.trim() && handleSelect(freetext.trim())}
            aria-label="Custom status"
          />
          <button
            className={styles.setBtn}
            onClick={() => freetext.trim() && handleSelect(freetext.trim())}
            disabled={!freetext.trim()}
          >
            Set
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 3: Run tests — all should pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/StatusPickerSheet.test.tsx
```

Expected: 6/6 PASS.

- [ ] **Step 4: Commit**

```bash
cd src/PluralHost.Web && git add src/components/StatusPickerSheet.tsx src/components/StatusPickerSheet.module.css src/__tests__/StatusPickerSheet.test.tsx && git commit -m "feat: add StatusPickerSheet component with predefined statuses + freetext"
```

---

### Task 3: Update FrontCard — tests first

**Files:**
- Modify: `src/PluralHost.Web/src/__tests__/FrontCard.test.tsx`

- [ ] **Step 1: Update BASE fixture and add new tests**

Replace the entire `src/PluralHost.Web/src/__tests__/FrontCard.test.tsx` with:

```tsx
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FrontCard from '../components/FrontCard'
import type { FrontStatus } from '../api/frontStatuses'

const STATUSES: FrontStatus[] = [
  { id: 's1', label: 'Present', color: '#b6ff00', isDefault: true, isHidden: false, createdAt: '' },
]

const BASE = {
  entry: { uid: 'e1', member: 'm1', live: true, startTime: Date.now() - 5000, custom: false },
  member: {
    id: 'm1',
    name: 'Kai',
    color: '#b6ff00',
    pronouns: 'they/them',
    bucketId: '00000000-0000-0000-0000-000000000001',
    isArchived: false,
    groupIds: [],
    parentIds: [],
    isPinned: false,
    isUntracked: false,
    preventFrontNotification: false,
    receiveBoardNotifications: false,
    createdAt: '',
    updatedAt: '',
  },
  frontStatuses: [],
  onRemove: vi.fn(),
  onUpdateStatus: vi.fn(),
  onEdit: vi.fn(),
}

test('renders member name', () => {
  render(<FrontCard {...BASE} />)
  expect(screen.getByText('Kai')).toBeInTheDocument()
})

test('shows live timer counting seconds', async () => {
  vi.useFakeTimers()
  render(<FrontCard {...BASE} />)
  const timerBefore = screen.getByTestId('live-timer').textContent
  act(() => { vi.advanceTimersByTime(1000) })
  const timerAfter = screen.getByTestId('live-timer').textContent
  expect(timerAfter).not.toBe(timerBefore)
  vi.useRealTimers()
})

test('remove button calls onRemove', async () => {
  render(<FrontCard {...BASE} />)
  await userEvent.click(screen.getByRole('button', { name: /remove/i }))
  expect(BASE.onRemove).toHaveBeenCalledWith('e1')
})

test('collapse toggles compact view', async () => {
  render(<FrontCard {...BASE} />)
  expect(screen.getByText('they/them')).toBeInTheDocument()
  await userEvent.click(screen.getByTestId('card-header'))
  expect(screen.queryByText('they/them')).not.toBeInTheDocument()
})

test('shows placeholder when no status set', () => {
  render(<FrontCard {...BASE} />)
  expect(screen.getByRole('button', { name: /edit status/i })).toBeInTheDocument()
  expect(screen.getByText(/set a status/i)).toBeInTheDocument()
})

test('tapping status button opens picker sheet', async () => {
  render(<FrontCard {...BASE} frontStatuses={STATUSES} />)
  await userEvent.click(screen.getByRole('button', { name: /edit status/i }))
  expect(screen.getByRole('dialog', { name: /set status/i })).toBeInTheDocument()
})

test('selecting a status from sheet calls onUpdateStatus', async () => {
  const onUpdateStatus = vi.fn()
  render(<FrontCard {...BASE} frontStatuses={STATUSES} onUpdateStatus={onUpdateStatus} />)
  await userEvent.click(screen.getByRole('button', { name: /edit status/i }))
  await userEvent.click(screen.getByRole('button', { name: /^present$/i }))
  expect(onUpdateStatus).toHaveBeenCalledWith('e1', 'Present')
})

test('sheet closes after selecting a status', async () => {
  render(<FrontCard {...BASE} frontStatuses={STATUSES} />)
  await userEvent.click(screen.getByRole('button', { name: /edit status/i }))
  await userEvent.click(screen.getByRole('button', { name: /^present$/i }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests — new tests should fail**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/FrontCard.test.tsx
```

Expected: existing 4 tests PASS (they still work before the refactor), new 4 tests FAIL.

---

### Task 4: Update FrontCard — implementation

**Files:**
- Modify: `src/PluralHost.Web/src/components/FrontCard.tsx`
- Modify: `src/PluralHost.Web/src/components/FrontCard.module.css`

- [ ] **Step 1: Update FrontCard.module.css**

Remove the `.statusInput` block (lines 106–115) and update `.statusTap` to flex layout, and add `.statusDot`.

Replace from `.statusTap {` through the end of `.statusInput { ... }`:

```css
.statusTap {
  background: none;
  border: none;
  padding: 10px 0;
  color: var(--color-text);
  font-size: 0.9rem;
  cursor: pointer;
  text-align: left;
  min-height: var(--touch-min);
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.statusDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Update FrontCard.tsx**

Replace the entire file content with:

```tsx
import { useState, useEffect } from 'react'
import type { FrontContent, Member } from '../types'
import Avatar from './Avatar'
import StatusPickerSheet from './StatusPickerSheet'
import { useReducedMotion } from '../hooks/useReducedMotion'
import type { FrontStatus } from '../api/frontStatuses'
import styles from './FrontCard.module.css'

interface FrontCardProps {
  entry: FrontContent
  member: Member
  frontStatuses: FrontStatus[]
  onRemove: (uid: string) => void
  onUpdateStatus: (uid: string, status: string) => void
  onEdit: (uid: string, memberId: string, startTime: number) => void
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function FrontCard({ entry, member, frontStatuses, onRemove, onUpdateStatus, onEdit }: FrontCardProps) {
  const reduced = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)
  const [elapsed, setElapsed] = useState(Date.now() - entry.startTime)
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [status, setStatus] = useState(entry.customStatus ?? '')
  const [showEdit, setShowEdit] = useState(false)
  const [editMemberId, setEditMemberId] = useState(entry.member)
  const [editStartTime, setEditStartTime] = useState(
    new Date(entry.startTime).toISOString().slice(0, 16)
  )

  useEffect(() => {
    setStatus(entry.customStatus ?? '')
    setEditMemberId(entry.member)
    setEditStartTime(new Date(entry.startTime).toISOString().slice(0, 16))
  }, [entry.uid, entry.customStatus, entry.member, entry.startTime])

  useEffect(() => {
    if (reduced) return
    const id = setInterval(() => setElapsed(Date.now() - entry.startTime), 1000)
    return () => clearInterval(id)
  }, [entry.startTime, reduced])

  const handleEditSave = () => {
    onEdit(entry.uid, editMemberId, new Date(editStartTime).getTime())
    setShowEdit(false)
  }

  const currentStatusColor = frontStatuses.find(s => s.label === status)?.color ?? 'var(--color-muted)'

  const startDisplay = new Date(entry.startTime).toLocaleString([], {
    hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric',
  })

  return (
    <div className={styles.card} data-member style={{ '--member-color': member.color } as React.CSSProperties}>
      {/* Header — tap to collapse */}
      <div
        className={styles.header}
        data-testid="card-header"
        onClick={() => setCollapsed(c => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <Avatar
          name={member.name}
          color={member.color ?? '#888'}
          avatarPath={member.avatarPath}
          isFronting
        />
        <div className={styles.headerInfo}>
          <span className={styles.name}>{member.name}</span>
          {!collapsed && member.pronouns && (
            <span className={styles.pronouns}>{member.pronouns}</span>
          )}
        </div>
        <span
          className={styles.timer}
          data-testid="live-timer"
          style={reduced ? { display: 'none' } : undefined}
        >
          {formatDuration(elapsed)}
        </span>
      </div>

      {!collapsed && (
        <div className={styles.body}>
          <div className={styles.startTime}>Started {startDisplay}</div>

          {/* Status */}
          <div className={styles.statusRow}>
            <button
              className={styles.statusTap}
              onClick={() => setShowStatusSheet(true)}
              aria-label="Edit status"
            >
              {status ? (
                <>
                  <span className={styles.statusDot} style={{ background: currentStatusColor }} />
                  {status}
                </>
              ) : (
                <span className={styles.placeholder}>Set a status…</span>
              )}
            </button>
          </div>

          <StatusPickerSheet
            isOpen={showStatusSheet}
            currentStatus={status}
            statuses={frontStatuses}
            onSelect={value => {
              setStatus(value)
              onUpdateStatus(entry.uid, value)
            }}
            onClose={() => setShowStatusSheet(false)}
          />

          {/* Edit form */}
          {showEdit && (
            <div className={styles.editForm}>
              <label className={styles.editLabel}>
                Member ID
                <input
                  className={styles.editInput}
                  value={editMemberId}
                  onChange={e => setEditMemberId(e.target.value)}
                />
              </label>
              <label className={styles.editLabel}>
                Start time
                <input
                  type="datetime-local"
                  className={styles.editInput}
                  value={editStartTime}
                  onChange={e => setEditStartTime(e.target.value)}
                />
              </label>
              <div className={styles.editActions}>
                <button className={styles.saveBtn} onClick={handleEditSave}>Save</button>
                <button className={styles.cancelBtn} onClick={() => setShowEdit(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <button
              className={styles.editBtn}
              onClick={() => setShowEdit(s => !s)}
              aria-label="Edit entry"
            >
              Edit
            </button>
            <button
              className={styles.removeBtn}
              onClick={() => onRemove(entry.uid)}
              aria-label="Remove fronter"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run all FrontCard tests**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/FrontCard.test.tsx
```

Expected: 8/8 PASS.

- [ ] **Step 4: Commit**

```bash
cd src/PluralHost.Web && git add src/components/FrontCard.tsx src/components/FrontCard.module.css src/__tests__/FrontCard.test.tsx && git commit -m "feat: replace status freetext input with StatusPickerSheet on FrontCard"
```

---

### Task 5: Wire FrontPage

**Files:**
- Modify: `src/PluralHost.Web/src/pages/FrontPage.tsx`

- [ ] **Step 1: Add frontStatuses query and pass to FrontCard**

In `FrontPage.tsx`, add the import and query, then pass the prop:

After the existing imports add:
```tsx
import { frontStatusesApi } from '../api/frontStatuses'
```

After the `members` query (around line 24), add:
```tsx
  const { data: frontStatuses = [] } = useQuery({
    queryKey: ['frontStatuses'],
    queryFn: frontStatusesApi.list,
  })
```

In the `fronters.map(...)` render, add `frontStatuses={frontStatuses}` to `<FrontCard>`:
```tsx
            <FrontCard
              key={envelope.id}
              entry={envelope.content}
              member={member}
              frontStatuses={frontStatuses}
              onRemove={uid => removeMutation.mutate(uid)}
              onUpdateStatus={(uid, status) => updateStatusMutation.mutate({ uid, status })}
              onEdit={(uid, memberId, startTime) => editMutation.mutate({ uid, memberId, startTime })}
            />
```

- [ ] **Step 2: Run full test suite**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass (same count as before + 12 new).

- [ ] **Step 3: TypeScript check**

```bash
cd src/PluralHost.Web && npm run build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
cd src/PluralHost.Web && git add src/pages/FrontPage.tsx && git commit -m "feat: pass frontStatuses to FrontCard from FrontPage"
```

---

## Self-Review Checklist

- [x] **Spec: None option** — Task 2 sheet shows "None" row calling `onSelect('')`
- [x] **Spec: predefined list filtered to isHidden=false** — `visible = statuses.filter(s => !s.isHidden)` in StatusPickerSheet
- [x] **Spec: freetext fallback** — freetextRow with input + Set button
- [x] **Spec: dot color on FrontCard when status matches predefined** — `currentStatusColor` lookup, `.statusDot` style
- [x] **Spec: FrontPage fetches once, passes as prop** — Task 5 adds single `useQuery(['frontStatuses'])`
- [x] **Spec: no backend changes** — confirmed, `onUpdateStatus` unchanged
- [x] **Spec: isHidden statuses still display on card** — `currentStatusColor` uses all `frontStatuses` (not filtered), only the picker list is filtered
- [x] **Spec: empty statuses list** — `frontStatuses=[]` renders gracefully (no list items, freetext still works)
- [x] **Type consistency** — `FrontStatus` imported from `api/frontStatuses` in all 3 files; `isOpen` matches BottomSheet's prop name throughout
