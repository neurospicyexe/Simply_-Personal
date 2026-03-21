# Plan 6a — Member Detail Tabs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `MemberDetailPage` from 2 tabs to 6 named tabs (Essence / Specs / Dossier / Comms / Logs / Access) by refactoring the page into a pure shell and building 4 new isolated tab components.

**Architecture:** `MemberDetailPage` becomes a shell that owns member/groups queries and routes between tab components via `activeTab` state. Phase 0 creates the shared `BottomSheet` component; Phase 1 runs 4 agents in parallel to build new tabs; Phase 2 extracts the two existing inline tabs, moves types, and wires everything together.

**Tech Stack:** React 18 + TypeScript, Vite, TanStack Query v5, CSS Modules, Vitest + Testing Library. Backend: .NET 8 ASP.NET Core Web API. Run tests with `cd src/PluralHost.Web && npx vitest run`.

**Spec:** `docs/superpowers/specs/2026-03-21-plan6a-member-detail-tabs.md`

---

## Phase execution order

```
Phase 0 (sequential):  Task 0 — BottomSheet shared component
Phase 1 (parallel):    Tasks 1, 2, 3, 4 — one agent each, no shared file writes
Phase 2 (sequential):  Task 5 — Integration, types consolidation, shell wiring
```

Tasks 1–4 are fully independent and touch no shared files. Start them simultaneously after Task 0 completes.

---

## Task 0: BottomSheet shared component (Phase 0 prerequisite)

**Must complete before Tasks 2, 3, 4 start.**

**Files:**
- Create: `src/PluralHost.Web/src/components/BottomSheet.tsx`
- Create: `src/PluralHost.Web/src/components/BottomSheet.module.css`
- Create: `src/PluralHost.Web/src/__tests__/BottomSheet.test.tsx`

**Reference:** Study `src/PluralHost.Web/src/components/CreateMemberSheet.tsx` and `CreateMemberSheet.module.css` for the visual pattern (backdrop, sheet, handle, title, slide-up animation).

- [ ] **Step 1: Write the failing test**

```tsx
// src/PluralHost.Web/src/__tests__/BottomSheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import BottomSheet from '../components/BottomSheet'

describe('BottomSheet', () => {
  it('renders title and children when open', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="Test Sheet">
        <p>Sheet content</p>
      </BottomSheet>
    )
    expect(screen.getByText('Test Sheet')).toBeInTheDocument()
    expect(screen.getByText('Sheet content')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()} title="Test Sheet">
        <p>Sheet content</p>
      </BottomSheet>
    )
    expect(screen.queryByText('Test Sheet')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Test Sheet">
        <p>content</p>
      </BottomSheet>
    )
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/BottomSheet.test.tsx
```

Expected: FAIL with "Cannot find module '../components/BottomSheet'"

- [ ] **Step 3: Create BottomSheet.module.css**

```css
/* src/PluralHost.Web/src/components/BottomSheet.module.css */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.sheet {
  background: var(--color-surface, #1a1a1a);
  border-radius: 16px 16px 0 0;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  padding: 12px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.handle {
  width: 40px;
  height: 4px;
  background: #444;
  border-radius: 2px;
  align-self: center;
  flex-shrink: 0;
}

.title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text, #fff);
  margin: 0;
}
```

- [ ] **Step 4: Create BottomSheet.tsx**

```tsx
// src/PluralHost.Web/src/components/BottomSheet.tsx
import type { ReactNode } from 'react'
import styles from './BottomSheet.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function BottomSheet({ isOpen, onClose, title, children }: Props) {
  if (!isOpen) return null

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.handle} />
        <h2 className={styles.title}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/BottomSheet.test.tsx
```

Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
cd src/PluralHost.Web && git add src/components/BottomSheet.tsx src/components/BottomSheet.module.css src/__tests__/BottomSheet.test.tsx
git commit -m "feat: BottomSheet shared component (Plan 6a Phase 0)"
```

---

## Task 1: LogsTab + Drawer + api/front.ts addition (Phase 1 — Agent A)

**No dependency on other Phase 1 tasks. Does not touch MemberDetailPage.tsx or types.ts.**

**Files:**
- Modify: `src/PluralHost.Web/src/api/front.ts` (add `history()` only — `update` and `delete` already exist)
- Create: `src/PluralHost.Web/src/components/Drawer.tsx`
- Create: `src/PluralHost.Web/src/components/Drawer.module.css`
- Create: `src/PluralHost.Web/src/components/tabs/LogsTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/LogsTab.module.css`
- Create: `src/PluralHost.Web/src/__tests__/LogsTab.test.tsx`

**Important — read first:** `src/PluralHost.Web/src/api/front.ts` to see existing exports before adding. The file already has `update(id, payload)` and `delete(id)` — do NOT duplicate them. Only add `history()`.

**Local types (do not add to types.ts):** Define at top of `LogsTab.tsx`. Phase 2 will move them.

```ts
// local to LogsTab.tsx until Phase 2
import type { SpEnvelope, FrontContent, FrontUpdatePayload } from '../../types'
// FrontContent fields: uid, member, live, startTime, endTime?, custom, customStatus?
// FrontUpdatePayload fields: live?, endTime?, customStatus?, memberId?, startTime?
```

**Helper functions (define inline in LogsTab.tsx):**
```ts
function msToDatetimeLocal(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16)
}
function datetimeLocalToMs(value: string): number {
  return new Date(value).getTime()
}
function formatDuration(startMs: number, endMs: number): string {
  const mins = Math.round((endMs - startMs) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}
```

- [ ] **Step 1: Add `history()` to api/front.ts**

Open `src/PluralHost.Web/src/api/front.ts`. Add `history` to the existing `frontApi` object:

```ts
history: () =>
  apiFetch<SpEnvelope<FrontContent>[]>('/v1/frontHistory'),
```

- [ ] **Step 2: Write the failing tests**

```tsx
// src/PluralHost.Web/src/__tests__/LogsTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LogsTab from '../components/tabs/LogsTab'
import type { Member } from '../types'

vi.mock('../api/front', () => ({
  frontApi: {
    history: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { frontApi } from '../api/front'

const mockMember: Member = {
  id: 'member-1',
  name: 'Aria',
  privacyTier: 'Public',
  isArchived: false,
  isUntracked: false,
  isPinned: false,
  preventFrontNotification: false,
  receiveBoardNotifications: false,
  groupIds: [],
  parentIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('LogsTab', () => {
  it('shows loading state initially', () => {
    vi.mocked(frontApi.history).mockReturnValue(new Promise(() => {}))
    wrap(<LogsTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no entries match this member', async () => {
    vi.mocked(frontApi.history).mockResolvedValue([
      { exists: true, id: 'other', content: { uid: 'other', member: 'other-member', live: false, startTime: 1000, custom: false } },
    ])
    wrap(<LogsTab member={mockMember} />)
    await screen.findByText('No front history for this alter.')
  })

  it('renders a matching log card', async () => {
    const now = Date.now()
    vi.mocked(frontApi.history).mockResolvedValue([
      { exists: true, id: 'e1', content: { uid: 'e1', member: 'member-1', live: false, startTime: now - 7200000, endTime: now, custom: false } },
    ])
    wrap(<LogsTab member={mockMember} />)
    await screen.findByText(/2h/)
  })

  it('shows error state when query fails', async () => {
    vi.mocked(frontApi.history).mockRejectedValue(new Error('Network error'))
    wrap(<LogsTab member={mockMember} />)
    await screen.findByText('Failed to load history')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/LogsTab.test.tsx
```

Expected: FAIL with "Cannot find module '../components/tabs/LogsTab'"

- [ ] **Step 4: Create Drawer.module.css**

```css
/* src/PluralHost.Web/src/components/Drawer.module.css */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: min(360px, 90vw);
  background: var(--color-surface, #1a1a1a);
  border-left: 1px solid #333;
  z-index: 101;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 200ms ease;
}

.drawer.open {
  transform: translateX(0);
}

.drawer.reduced {
  transition: none;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text, #fff);
  margin: 0;
}

.closeBtn {
  background: none;
  border: none;
  color: #aaa;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 4px 8px;
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

- [ ] **Step 5: Create Drawer.tsx**

```tsx
// src/PluralHost.Web/src/components/Drawer.tsx
import type { ReactNode } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import styles from './Drawer.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Drawer({ isOpen, onClose, title, children }: Props) {
  const reduced = useReducedMotion()
  if (!isOpen) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div
        className={[styles.drawer, styles.open, reduced ? styles.reduced : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Create LogsTab.module.css**

```css
/* src/PluralHost.Web/src/components/tabs/LogsTab.module.css */
.container { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.empty { color: #666; text-align: center; padding: 40px 0; }
.error { color: #f87171; text-align: center; padding: 20px; }
.retryBtn { background: none; border: 1px solid #444; color: #aaa; padding: 6px 14px; border-radius: 6px; cursor: pointer; margin-top: 8px; }
.card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: border-color 200ms; }
.card:hover { border-color: #444; }
.cardTop { display: flex; justify-content: space-between; align-items: baseline; }
.date { font-weight: 700; color: var(--color-text, #fff); }
.duration { color: #888; font-size: 0.85rem; }
.timeRange { color: #aaa; font-size: 0.85rem; margin-top: 2px; }
.status { color: var(--color-primary, #b6ff00); font-size: 0.85rem; margin-top: 4px; }
.loadMore { background: none; border: 1px solid #333; color: #aaa; padding: 8px 20px; border-radius: 8px; cursor: pointer; align-self: center; margin-top: 8px; }

/* Drawer form */
.field { display: flex; flex-direction: column; gap: 6px; }
.fieldLabel { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
.input { background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; width: 100%; }
.input:disabled { opacity: 0.4; cursor: not-allowed; }
.drawerActions { display: flex; gap: 8px; margin-top: auto; padding-top: 16px; border-top: 1px solid #333; }
.saveBtn { flex: 1; background: var(--color-primary, #b6ff00); color: #000; border: none; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; }
.deleteBtn { background: none; border: 1px solid #7f1d1d; color: #f87171; padding: 10px 14px; border-radius: 8px; cursor: pointer; }
.drawerError { color: #f87171; font-size: 0.85rem; }
```

- [ ] **Step 7: Create LogsTab.tsx**

```tsx
// src/PluralHost.Web/src/components/tabs/LogsTab.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { frontApi } from '../../api/front'
import Drawer from '../Drawer'
import type { Member, SpEnvelope, FrontContent, FrontUpdatePayload } from '../../types'
import styles from './LogsTab.module.css'

interface Props {
  member: Member
}

const PAGE_SIZE = 20

function msToDatetimeLocal(ms: number) { return new Date(ms).toISOString().slice(0, 16) }
function datetimeLocalToMs(v: string) { return new Date(v).getTime() }
function formatDuration(s: number, e: number) {
  const mins = Math.round((e - s) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function formatDate(ms: number) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function formatTime(ms: number) { return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) }

export default function LogsTab({ member }: Props) {
  const qc = useQueryClient()
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<SpEnvelope<FrontContent> | null>(null)
  const [startVal, setStartVal] = useState('')
  const [endVal, setEndVal] = useState('')
  const [statusVal, setStatusVal] = useState('')
  const [drawerError, setDrawerError] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['front-history'],
    queryFn: frontApi.history,
  })

  const updateMutation = useMutation({
    mutationFn: ({ uid, payload }: { uid: string; payload: FrontUpdatePayload }) =>
      frontApi.update(uid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-history'] })
      setSelected(null)
    },
    onError: (e: Error) => setDrawerError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => frontApi.delete(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-history'] })
      setSelected(null)
    },
    onError: (e: Error) => setDrawerError(e.message),
  })

  function openDrawer(entry: SpEnvelope<FrontContent>) {
    setSelected(entry)
    setStartVal(msToDatetimeLocal(entry.content.startTime))
    setEndVal(entry.content.endTime ? msToDatetimeLocal(entry.content.endTime) : '')
    setStatusVal(entry.content.customStatus ?? '')
    setDrawerError('')
  }

  function handleSave() {
    if (!selected) return
    const payload: FrontUpdatePayload = {
      startTime: datetimeLocalToMs(startVal),
      endTime: endVal ? datetimeLocalToMs(endVal) : undefined,
      customStatus: statusVal || undefined,
    }
    updateMutation.mutate({ uid: selected.content.uid, payload })
  }

  function handleDelete() {
    if (!selected) return
    if (!window.confirm('Delete this front history entry?')) return
    deleteMutation.mutate(selected.content.uid)
  }

  if (isLoading) return <div role="status" className={styles.container}>Loading…</div>
  if (isError) return (
    <div className={styles.error}>
      Failed to load history
      <br />
      <button className={styles.retryBtn} onClick={() => refetch()}>Retry</button>
    </div>
  )

  const entries = (data ?? [])
    .filter(e => e.content.member === member.id)
    .sort((a, b) => b.content.startTime - a.content.startTime)

  const shown = entries.slice(0, visible)

  return (
    <div className={styles.container}>
      {entries.length === 0 && (
        <p className={styles.empty}>No front history for this alter.</p>
      )}

      {shown.map(entry => {
        const c = entry.content
        return (
          <div key={c.uid} className={styles.card} onClick={() => openDrawer(entry)}>
            <div className={styles.cardTop}>
              <span className={styles.date}>{formatDate(c.startTime)}</span>
              {!c.live && c.endTime && (
                <span className={styles.duration}>{formatDuration(c.startTime, c.endTime)}</span>
              )}
            </div>
            <div className={styles.timeRange}>
              {formatTime(c.startTime)} – {c.live ? 'ongoing' : c.endTime ? formatTime(c.endTime) : '?'}
            </div>
            {c.customStatus && <div className={styles.status}>{c.customStatus}</div>}
          </div>
        )
      })}

      {entries.length > visible && (
        <button className={styles.loadMore} onClick={() => setVisible(v => v + PAGE_SIZE)}>
          Load more
        </button>
      )}

      <Drawer
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? formatDate(selected.content.startTime) : ''}
      >
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Start time</span>
          <input type="datetime-local" className={styles.input} value={startVal} onChange={e => setStartVal(e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>End time</span>
          <input
            type="datetime-local"
            className={styles.input}
            value={endVal}
            onChange={e => setEndVal(e.target.value)}
            disabled={selected?.content.live ?? false}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <input type="text" className={styles.input} value={statusVal} onChange={e => setStatusVal(e.target.value)} placeholder="Optional" />
        </div>
        {drawerError && <p className={styles.drawerError}>{drawerError}</p>}
        <div className={styles.drawerActions}>
          <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Drawer>
    </div>
  )
}
```

- [ ] **Step 8: Run tests — verify they pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/LogsTab.test.tsx
```

Expected: 4 tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/PluralHost.Web/src/api/front.ts \
        src/PluralHost.Web/src/components/Drawer.tsx \
        src/PluralHost.Web/src/components/Drawer.module.css \
        src/PluralHost.Web/src/components/tabs/LogsTab.tsx \
        src/PluralHost.Web/src/components/tabs/LogsTab.module.css \
        src/PluralHost.Web/src/__tests__/LogsTab.test.tsx
git commit -m "feat: LogsTab + Drawer component + frontApi.history (Plan 6a Task 1)"
```

---

## Task 2: DossierTab + api/notes.ts (Phase 1 — Agent B)

**No dependency on Tasks 1, 3, 4. Does not touch MemberDetailPage.tsx or types.ts. Requires BottomSheet from Task 0.**

**Files:**
- Create: `src/PluralHost.Web/src/api/notes.ts`
- Create: `src/PluralHost.Web/src/components/tabs/DossierTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/DossierTab.module.css`
- Create: `src/PluralHost.Web/src/__tests__/DossierTab.test.tsx`

**Local type (define at top of DossierTab.tsx — do not add to types.ts):**
```ts
interface MemberNote {
  id: string
  memberId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 1: Create api/notes.ts**

```ts
// src/PluralHost.Web/src/api/notes.ts
import { apiFetch } from './client'

interface MemberNote {
  id: string
  memberId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export const notesApi = {
  list: (memberId: string) =>
    apiFetch<MemberNote[]>(`/api/members/${memberId}/notes`),

  create: (memberId: string, body: { title: string; content: string }) =>
    apiFetch<MemberNote>(`/api/members/${memberId}/notes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (memberId: string, noteId: string, body: { title?: string; content?: string }) =>
    apiFetch<MemberNote>(`/api/members/${memberId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (memberId: string, noteId: string) =>
    apiFetch<void>(`/api/members/${memberId}/notes/${noteId}`, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
// src/PluralHost.Web/src/__tests__/DossierTab.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DossierTab from '../components/tabs/DossierTab'
import type { Member } from '../types'

vi.mock('../api/notes', () => ({
  notesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { notesApi } from '../api/notes'

const mockMember: Member = {
  id: 'member-1', name: 'Aria', privacyTier: 'Public',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('DossierTab', () => {
  it('shows loading state', () => {
    vi.mocked(notesApi.list).mockReturnValue(new Promise(() => {}))
    wrap(<DossierTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no notes', async () => {
    vi.mocked(notesApi.list).mockResolvedValue([])
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('No notes yet. Use + to add the first one.')
  })

  it('renders note cards', async () => {
    vi.mocked(notesApi.list).mockResolvedValue([
      { id: 'n1', memberId: 'member-1', title: 'First note', content: 'Some content', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ])
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('First note')
    expect(screen.getByText('Some content')).toBeInTheDocument()
  })

  it('shows error state when query fails', async () => {
    vi.mocked(notesApi.list).mockRejectedValue(new Error('fail'))
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('Failed to load notes')
  })

  it('opens create sheet when + is clicked', async () => {
    vi.mocked(notesApi.list).mockResolvedValue([])
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('No notes yet. Use + to add the first one.')
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))
    expect(screen.getByRole('dialog', { name: 'New Note' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/DossierTab.test.tsx
```

Expected: FAIL with "Cannot find module '../components/tabs/DossierTab'"

- [ ] **Step 4: Create DossierTab.module.css**

```css
/* src/PluralHost.Web/src/components/tabs/DossierTab.module.css */
.container { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.addBtn { background: var(--color-primary, #b6ff00); color: #000; border: none; border-radius: 50%; width: 36px; height: 36px; font-size: 1.4rem; cursor: pointer; line-height: 1; font-weight: 700; }
.empty { color: #666; text-align: center; padding: 40px 0; }
.error { color: #f87171; text-align: center; padding: 20px; }
.retryBtn { background: none; border: 1px solid #444; color: #aaa; padding: 6px 14px; border-radius: 6px; cursor: pointer; margin-top: 8px; }
.card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 14px 16px; cursor: pointer; }
.card:hover { border-color: #444; }
.cardHeader { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.noteTitle { font-weight: 700; color: var(--color-text, #fff); margin: 0 0 6px; }
.noteContent { color: #aaa; font-size: 0.9rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.meta { color: #555; font-size: 0.75rem; margin-top: 8px; }
.deleteIcon { background: none; border: none; color: #555; cursor: pointer; font-size: 1rem; padding: 2px 6px; flex-shrink: 0; }
.deleteIcon:hover { color: #f87171; }

/* Sheet form */
.form { display: flex; flex-direction: column; gap: 14px; }
.label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: #aaa; }
.input { background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; width: 100%; }
.textarea { background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; width: 100%; min-height: 120px; resize: vertical; }
.sheetError { color: #f87171; font-size: 0.85rem; }
.actions { display: flex; gap: 8px; }
.cancelBtn { flex: 1; background: none; border: 1px solid #444; color: #aaa; padding: 10px; border-radius: 8px; cursor: pointer; }
.saveBtn { flex: 2; background: var(--color-primary, #b6ff00); color: #000; border: none; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; }
.saveBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Create DossierTab.tsx**

```tsx
// src/PluralHost.Web/src/components/tabs/DossierTab.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notesApi } from '../../api/notes'
import BottomSheet from '../BottomSheet'
import type { Member } from '../../types'
import styles from './DossierTab.module.css'

interface MemberNote {
  id: string; memberId: string; title: string; content: string
  createdAt: string; updatedAt: string
}

interface Props { member: Member }

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function DossierTab({ member }: Props) {
  const qc = useQueryClient()
  const [sheetNote, setSheetNote] = useState<MemberNote | null | undefined>(undefined) // undefined=closed, null=create
  const [titleVal, setTitleVal] = useState('')
  const [contentVal, setContentVal] = useState('')
  const [sheetError, setSheetError] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['member-notes', member.id],
    queryFn: () => notesApi.list(member.id),
  })

  const createMutation = useMutation({
    mutationFn: () => notesApi.create(member.id, { title: titleVal.trim(), content: contentVal.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-notes', member.id] }); closeSheet() },
    onError: (e: Error) => setSheetError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => notesApi.update(member.id, sheetNote!.id, { title: titleVal.trim(), content: contentVal.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-notes', member.id] }); closeSheet() },
    onError: (e: Error) => setSheetError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => notesApi.delete(member.id, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-notes', member.id] }),
  })

  function openCreate() { setSheetNote(null); setTitleVal(''); setContentVal(''); setSheetError('') }
  function openEdit(note: MemberNote) { setSheetNote(note); setTitleVal(note.title); setContentVal(note.content); setSheetError('') }
  function closeSheet() { setSheetNote(undefined) }

  function handleSave() {
    if (!titleVal.trim()) return
    sheetNote === null ? createMutation.mutate() : updateMutation.mutate()
  }

  function handleDelete(e: React.MouseEvent, noteId: string) {
    e.stopPropagation()
    if (!window.confirm('Delete this note?')) return
    deleteMutation.mutate(noteId)
  }

  if (isLoading) return <div role="status" className={styles.container}>Loading…</div>
  if (isError) return (
    <div className={styles.error}>
      Failed to load notes<br />
      <button className={styles.retryBtn} onClick={() => refetch()}>Retry</button>
    </div>
  )

  const notes = [...(data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={openCreate} aria-label="Add note">+</button>
      </div>

      {notes.length === 0 && <p className={styles.empty}>No notes yet. Use + to add the first one.</p>}

      {notes.map(note => (
        <div key={note.id} className={styles.card} onClick={() => openEdit(note)}>
          <div className={styles.cardHeader}>
            <p className={styles.noteTitle}>{note.title}</p>
            <button className={styles.deleteIcon} onClick={e => handleDelete(e, note.id)} aria-label="Delete note">🗑</button>
          </div>
          <p className={styles.noteContent}>{note.content}</p>
          <p className={styles.meta}>{relativeTime(note.updatedAt)}</p>
        </div>
      ))}

      <BottomSheet
        isOpen={sheetNote !== undefined}
        onClose={closeSheet}
        title={sheetNote === null ? 'New Note' : 'Edit Note'}
      >
        <div className={styles.form}>
          <label className={styles.label}>
            Title *
            <input className={styles.input} value={titleVal} onChange={e => setTitleVal(e.target.value)} placeholder="Note title" autoFocus />
          </label>
          <label className={styles.label}>
            Content
            <textarea className={styles.textarea} value={contentVal} onChange={e => setContentVal(e.target.value)} placeholder="Write something…" />
          </label>
          {sheetError && <p className={styles.sheetError}>{sheetError}</p>}
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={closeSheet}>Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={isPending || !titleVal.trim()}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/DossierTab.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/api/notes.ts \
        src/PluralHost.Web/src/components/tabs/DossierTab.tsx \
        src/PluralHost.Web/src/components/tabs/DossierTab.module.css \
        src/PluralHost.Web/src/__tests__/DossierTab.test.tsx
git commit -m "feat: DossierTab + api/notes.ts (Plan 6a Task 2)"
```

---

## Task 3: CommsTab + api/board.ts (Phase 1 — Agent C)

**No dependency on Tasks 1, 2, 4. Does not touch MemberDetailPage.tsx or types.ts. Requires BottomSheet from Task 0.**

**Files:**
- Create: `src/PluralHost.Web/src/api/board.ts`
- Create: `src/PluralHost.Web/src/components/tabs/CommsTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/CommsTab.module.css`
- Create: `src/PluralHost.Web/src/__tests__/CommsTab.test.tsx`

**Local type (define at top of CommsTab.tsx — do not add to types.ts):**
```ts
interface BoardMessage {
  id: string  // Guid serialized as string; used as msgId in DELETE
  memberId: string
  authorName: string
  content: string
  createdAt: string
}
```

- [ ] **Step 1: Create api/board.ts**

```ts
// src/PluralHost.Web/src/api/board.ts
import { apiFetch } from './client'

interface BoardMessage {
  id: string; memberId: string; authorName: string; content: string; createdAt: string
}

export const boardApi = {
  list: (memberId: string) =>
    apiFetch<BoardMessage[]>(`/api/members/${memberId}/board`),

  post: (memberId: string, body: { authorName: string; content: string }) =>
    apiFetch<BoardMessage>(`/api/members/${memberId}/board`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  delete: (memberId: string, msgId: string) =>
    apiFetch<void>(`/api/members/${memberId}/board/${msgId}`, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
// src/PluralHost.Web/src/__tests__/CommsTab.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CommsTab from '../components/tabs/CommsTab'
import type { Member } from '../types'

vi.mock('../api/board', () => ({
  boardApi: { list: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import { boardApi } from '../api/board'

const mockMember: Member = {
  id: 'member-1', name: 'Aria', privacyTier: 'Public',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('CommsTab', () => {
  it('shows loading state', () => {
    vi.mocked(boardApi.list).mockReturnValue(new Promise(() => {}))
    wrap(<CommsTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    vi.mocked(boardApi.list).mockResolvedValue([])
    wrap(<CommsTab member={mockMember} />)
    await screen.findByText('No messages yet.')
  })

  it('renders message cards newest first', async () => {
    vi.mocked(boardApi.list).mockResolvedValue([
      { id: 'm1', memberId: 'member-1', authorName: 'Cypher', content: 'First post', createdAt: '2026-01-01T10:00:00Z' },
      { id: 'm2', memberId: 'member-1', authorName: 'Drevan', content: 'Second post', createdAt: '2026-01-02T10:00:00Z' },
    ])
    wrap(<CommsTab member={mockMember} />)
    await screen.findByText('Drevan') // newest first
    const names = screen.getAllByText(/Cypher|Drevan/).map(el => el.textContent)
    expect(names[0]).toBe('Drevan')
  })

  it('shows error state', async () => {
    vi.mocked(boardApi.list).mockRejectedValue(new Error('fail'))
    wrap(<CommsTab member={mockMember} />)
    await screen.findByText('Failed to load messages')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/CommsTab.test.tsx
```

Expected: FAIL with "Cannot find module '../components/tabs/CommsTab'"

- [ ] **Step 4: Create CommsTab.module.css**

```css
/* src/PluralHost.Web/src/components/tabs/CommsTab.module.css */
.container { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.addBtn { background: var(--color-primary, #b6ff00); color: #000; border: none; border-radius: 50%; width: 36px; height: 36px; font-size: 1.4rem; cursor: pointer; font-weight: 700; }
.empty { color: #666; text-align: center; padding: 40px 0; }
.error { color: #f87171; text-align: center; padding: 20px; }
.retryBtn { background: none; border: 1px solid #444; color: #aaa; padding: 6px 14px; border-radius: 6px; cursor: pointer; margin-top: 8px; }
.card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 14px 16px; }
.cardHeader { display: flex; justify-content: space-between; align-items: flex-start; }
.author { font-weight: 700; color: var(--color-text, #fff); }
.meta { color: #555; font-size: 0.75rem; }
.content { color: #ccc; font-size: 0.9rem; margin-top: 6px; white-space: pre-wrap; }
.deleteIcon { background: none; border: none; color: #555; cursor: pointer; padding: 2px 6px; }
.deleteIcon:hover { color: #f87171; }
.form { display: flex; flex-direction: column; gap: 14px; }
.label { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; color: #aaa; }
.input { background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; width: 100%; }
.textarea { background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; width: 100%; min-height: 100px; resize: vertical; }
.sheetError { color: #f87171; font-size: 0.85rem; }
.actions { display: flex; gap: 8px; }
.cancelBtn { flex: 1; background: none; border: 1px solid #444; color: #aaa; padding: 10px; border-radius: 8px; cursor: pointer; }
.postBtn { flex: 2; background: var(--color-primary, #b6ff00); color: #000; border: none; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; }
.postBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Create CommsTab.tsx**

```tsx
// src/PluralHost.Web/src/components/tabs/CommsTab.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { boardApi } from '../../api/board'
import BottomSheet from '../BottomSheet'
import type { Member } from '../../types'
import styles from './CommsTab.module.css'

interface BoardMessage {
  id: string; memberId: string; authorName: string; content: string; createdAt: string
}

interface Props { member: Member }

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function CommsTab({ member }: Props) {
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [authorVal, setAuthorVal] = useState('')
  const [contentVal, setContentVal] = useState('')
  const [sheetError, setSheetError] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['member-board', member.id],
    queryFn: () => boardApi.list(member.id),
  })

  const postMutation = useMutation({
    mutationFn: () => boardApi.post(member.id, { authorName: authorVal.trim(), content: contentVal.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-board', member.id] }); setSheetOpen(false) },
    onError: (e: Error) => setSheetError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => boardApi.delete(member.id, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-board', member.id] }),
  })

  function openSheet() { setAuthorVal(''); setContentVal(''); setSheetError(''); setSheetOpen(true) }
  const canPost = authorVal.trim().length > 0 && contentVal.trim().length > 0

  if (isLoading) return <div role="status" className={styles.container}>Loading…</div>
  if (isError) return (
    <div className={styles.error}>
      Failed to load messages<br />
      <button className={styles.retryBtn} onClick={() => refetch()}>Retry</button>
    </div>
  )

  const messages = [...(data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={openSheet} aria-label="Post message">+</button>
      </div>

      {messages.length === 0 && <p className={styles.empty}>No messages yet.</p>}

      {messages.map(msg => (
        <div key={msg.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.author}>{msg.authorName}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={styles.meta}>{relativeTime(msg.createdAt)}</span>
              <button className={styles.deleteIcon} onClick={() => deleteMutation.mutate(msg.id)} aria-label="Delete message">🗑</button>
            </div>
          </div>
          <p className={styles.content}>{msg.content}</p>
        </div>
      ))}

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="New Message">
        <div className={styles.form}>
          <label className={styles.label}>
            Author *
            <input className={styles.input} value={authorVal} onChange={e => setAuthorVal(e.target.value)} placeholder="Who is posting?" autoFocus />
          </label>
          <label className={styles.label}>
            Message *
            <textarea className={styles.textarea} value={contentVal} onChange={e => setContentVal(e.target.value)} placeholder="Write a message…" />
          </label>
          {sheetError && <p className={styles.sheetError}>{sheetError}</p>}
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={() => setSheetOpen(false)}>Cancel</button>
            <button className={styles.postBtn} onClick={() => postMutation.mutate()} disabled={postMutation.isPending || !canPost}>
              {postMutation.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/CommsTab.test.tsx
```

Expected: 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/api/board.ts \
        src/PluralHost.Web/src/components/tabs/CommsTab.tsx \
        src/PluralHost.Web/src/components/tabs/CommsTab.module.css \
        src/PluralHost.Web/src/__tests__/CommsTab.test.tsx
git commit -m "feat: CommsTab + api/board.ts (Plan 6a Task 3)"
```

---

## Task 4: SpecsTab + api/fields.ts (Phase 1 — Agent D)

**No dependency on Tasks 1, 2, 3. Does not touch MemberDetailPage.tsx or types.ts. Requires BottomSheet from Task 0.**

**Files:**
- Create: `src/PluralHost.Web/src/api/fields.ts`
- Create: `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/SpecsTab.module.css`
- Create: `src/PluralHost.Web/src/__tests__/SpecsTab.test.tsx`

**Local types (define at top of SpecsTab.tsx — do not add to types.ts):**
```ts
interface FieldDef {
  id: string; name: string; createdAt: string
  deletedAt: string | null  // null = active; non-null = soft-deleted
}
interface MemberFieldEntry {
  fieldId: string; memberId: string; value: string; updatedAt: string
}
```

**Preset field names (SP/PK vocabulary aligned):**
```ts
const PRESETS = ['Role', 'Age', 'Interests', 'Triggers', 'Likes', 'Dislikes', 'Trauma', 'Strengths']
```

- [ ] **Step 1: Create api/fields.ts**

```ts
// src/PluralHost.Web/src/api/fields.ts
import { apiFetch } from './client'

interface FieldDef {
  id: string; name: string; createdAt: string; deletedAt: string | null
}
interface MemberFieldEntry {
  fieldId: string; memberId: string; value: string; updatedAt: string
}

export const fieldsApi = {
  listDefs: () =>
    apiFetch<FieldDef[]>('/api/fields'),

  createDef: (name: string) =>
    apiFetch<FieldDef>('/api/fields', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  getMemberFields: (memberId: string) =>
    apiFetch<MemberFieldEntry[]>(`/api/members/${memberId}/fields`),

  upsertMemberField: (memberId: string, fieldId: string, value: string) =>
    apiFetch<MemberFieldEntry>(`/api/members/${memberId}/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  deleteMemberField: (memberId: string, fieldId: string) =>
    apiFetch<void>(`/api/members/${memberId}/fields/${fieldId}`, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Write the failing tests**

```tsx
// src/PluralHost.Web/src/__tests__/SpecsTab.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SpecsTab from '../components/tabs/SpecsTab'
import type { Member } from '../types'

vi.mock('../api/fields', () => ({
  fieldsApi: {
    listDefs: vi.fn(),
    createDef: vi.fn(),
    getMemberFields: vi.fn(),
    upsertMemberField: vi.fn(),
    deleteMemberField: vi.fn(),
  },
}))
import { fieldsApi } from '../api/fields'

const mockMember: Member = {
  id: 'member-1', name: 'Aria', privacyTier: 'Public',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('SpecsTab', () => {
  it('shows loading state', () => {
    vi.mocked(fieldsApi.listDefs).mockReturnValue(new Promise(() => {}))
    vi.mocked(fieldsApi.getMemberFields).mockReturnValue(new Promise(() => {}))
    wrap(<SpecsTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no field defs exist', async () => {
    vi.mocked(fieldsApi.listDefs).mockResolvedValue([])
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('No specs defined yet. Use + to add the first one.')
  })

  it('renders a field row with its value', async () => {
    vi.mocked(fieldsApi.listDefs).mockResolvedValue([
      { id: 'f1', name: 'Role', createdAt: '2026-01-01T00:00:00Z', deletedAt: null },
    ])
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([
      { fieldId: 'f1', memberId: 'member-1', value: 'Protector', updatedAt: '2026-01-01T00:00:00Z' },
    ])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('Role')
    expect(screen.getByText('Protector')).toBeInTheDocument()
  })

  it('hides soft-deleted field defs', async () => {
    vi.mocked(fieldsApi.listDefs).mockResolvedValue([
      { id: 'f1', name: 'Role', createdAt: '2026-01-01T00:00:00Z', deletedAt: null },
      { id: 'f2', name: 'OldField', createdAt: '2026-01-01T00:00:00Z', deletedAt: '2026-02-01T00:00:00Z' },
    ])
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('Role')
    expect(screen.queryByText('OldField')).not.toBeInTheDocument()
  })

  it('shows error state when query fails', async () => {
    vi.mocked(fieldsApi.listDefs).mockRejectedValue(new Error('fail'))
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('Failed to load fields')
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/SpecsTab.test.tsx
```

Expected: FAIL with "Cannot find module '../components/tabs/SpecsTab'"

- [ ] **Step 4: Create SpecsTab.module.css**

```css
/* src/PluralHost.Web/src/components/tabs/SpecsTab.module.css */
.container { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.addBtn { background: var(--color-primary, #b6ff00); color: #000; border: none; border-radius: 50%; width: 36px; height: 36px; font-size: 1.4rem; cursor: pointer; font-weight: 700; }
.empty { color: #666; text-align: center; padding: 40px 0; }
.error { color: #f87171; text-align: center; padding: 20px; }
.retryBtn { background: none; border: 1px solid #444; color: #aaa; padding: 6px 14px; border-radius: 6px; cursor: pointer; margin-top: 8px; }
.fieldRow { display: flex; align-items: center; gap: 12px; background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 10px 14px; }
.fieldName { color: #888; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; min-width: 80px; flex-shrink: 0; }
.fieldValue { flex: 1; color: var(--color-text, #fff); cursor: pointer; min-height: 24px; }
.fieldInput { flex: 1; background: #222; border: 1px solid var(--color-primary, #b6ff00); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 0.9rem; }
.placeholder { color: #555; font-style: italic; }
.deleteIcon { background: none; border: none; color: #555; cursor: pointer; padding: 2px 6px; }
.deleteIcon:hover { color: #f87171; }

/* Sheet */
.presetLabel { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 8px; }
.presets { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.chip { background: rgba(182, 255, 0, 0.1); color: var(--color-primary, #b6ff00); border: 1px solid rgba(182, 255, 0, 0.3); padding: 5px 12px; border-radius: 16px; cursor: pointer; font-size: 0.85rem; }
.chip.dimmed { opacity: 0.45; }
.customLabel { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin-bottom: 6px; }
.customRow { display: flex; gap: 8px; }
.customInput { flex: 1; background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
.customBtn { background: var(--color-primary, #b6ff00); color: #000; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; }
.customBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Create SpecsTab.tsx**

```tsx
// src/PluralHost.Web/src/components/tabs/SpecsTab.tsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldsApi } from '../../api/fields'
import BottomSheet from '../BottomSheet'
import type { Member } from '../../types'
import styles from './SpecsTab.module.css'

interface FieldDef { id: string; name: string; createdAt: string; deletedAt: string | null }
interface MemberFieldEntry { fieldId: string; memberId: string; value: string; updatedAt: string }
interface Props { member: Member }

const PRESETS = ['Role', 'Age', 'Interests', 'Triggers', 'Likes', 'Dislikes', 'Trauma', 'Strengths']

export default function SpecsTab({ member }: Props) {
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const defsQuery = useQuery({ queryKey: ['field-defs'], queryFn: fieldsApi.listDefs })
  const valuesQuery = useQuery({ queryKey: ['member-fields', member.id], queryFn: () => fieldsApi.getMemberFields(member.id) })

  const upsertMutation = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: string }) =>
      fieldsApi.upsertMemberField(member.id, fieldId, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (fieldId: string) => fieldsApi.deleteMemberField(member.id, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const addDefMutation = useMutation({
    mutationFn: (name: string) => fieldsApi.createDef(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['field-defs'] }),
  })

  const activeDefs = (defsQuery.data ?? []).filter(d => d.deletedAt === null)
  const valueMap = new Map((valuesQuery.data ?? []).map(v => [v.fieldId, v]))

  async function handleAddField(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    let fieldId: string

    const existing = activeDefs.find(d => d.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      fieldId = existing.id
    } else {
      const created = await addDefMutation.mutateAsync(trimmed)
      fieldId = created.id
    }

    const alreadyHasValue = valueMap.has(fieldId)
    if (!alreadyHasValue) {
      await upsertMutation.mutateAsync({ fieldId, value: '' })
    }
    setSheetOpen(false)
    setCustomName('')
  }

  function startEdit(fieldId: string, currentValue: string) {
    setEditingFieldId(fieldId)
    setEditVal(currentValue)
  }

  function commitEdit(fieldId: string) {
    upsertMutation.mutate({ fieldId, value: editVal })
    setEditingFieldId(null)
  }

  if (defsQuery.isLoading || valuesQuery.isLoading)
    return <div role="status" className={styles.container}>Loading…</div>
  if (defsQuery.isError || valuesQuery.isError)
    return (
      <div className={styles.error}>
        Failed to load fields<br />
        <button className={styles.retryBtn} onClick={() => { defsQuery.refetch(); valuesQuery.refetch() }}>Retry</button>
      </div>
    )

  // Only show defs where this member has a value entry
  const memberDefIds = new Set((valuesQuery.data ?? []).map(v => v.fieldId))
  const displayedDefs = activeDefs.filter(d => memberDefIds.has(d.id))

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={() => setSheetOpen(true)} aria-label="Add spec">+</button>
      </div>

      {displayedDefs.length === 0 && <p className={styles.empty}>No specs defined yet. Use + to add the first one.</p>}

      {displayedDefs.map(def => {
        const entry = valueMap.get(def.id)
        const isEditing = editingFieldId === def.id
        return (
          <div key={def.id} className={styles.fieldRow}>
            <span className={styles.fieldName}>{def.name}</span>
            {isEditing ? (
              <input
                className={styles.fieldInput}
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => commitEdit(def.id)}
                onKeyDown={e => e.key === 'Enter' && commitEdit(def.id)}
                autoFocus
              />
            ) : (
              <span
                className={`${styles.fieldValue} ${!entry?.value ? styles.placeholder : ''}`}
                onClick={() => startEdit(def.id, entry?.value ?? '')}
              >
                {entry?.value || 'Click to add…'}
              </span>
            )}
            <button className={styles.deleteIcon} onClick={() => deleteMutation.mutate(def.id)} aria-label={`Delete ${def.name}`}>🗑</button>
          </div>
        )
      })}

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Spec">
        <p className={styles.presetLabel}>Common fields</p>
        <div className={styles.presets}>
          {PRESETS.map(name => {
            const exists = activeDefs.some(d => d.name.toLowerCase() === name.toLowerCase())
            const alreadyAssigned = exists && memberDefIds.has(activeDefs.find(d => d.name.toLowerCase() === name.toLowerCase())!.id)
            return (
              <button
                key={name}
                className={`${styles.chip} ${alreadyAssigned ? styles.dimmed : ''}`}
                onClick={() => handleAddField(name)}
              >
                {name}
              </button>
            )
          })}
        </div>
        <p className={styles.customLabel}>Or define your own</p>
        <div className={styles.customRow}>
          <input
            className={styles.customInput}
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="Field name…"
            onKeyDown={e => e.key === 'Enter' && handleAddField(customName)}
          />
          <button
            className={styles.customBtn}
            onClick={() => handleAddField(customName)}
            disabled={!customName.trim()}
          >
            Add
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/SpecsTab.test.tsx
```

Expected: 5 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/api/fields.ts \
        src/PluralHost.Web/src/components/tabs/SpecsTab.tsx \
        src/PluralHost.Web/src/components/tabs/SpecsTab.module.css \
        src/PluralHost.Web/src/__tests__/SpecsTab.test.tsx
git commit -m "feat: SpecsTab + api/fields.ts (Plan 6a Task 4)"
```

---

## Task 5: Integration — extract tabs, consolidate types, wire shell (Phase 2)

**Runs after all Phase 1 tasks complete. This agent reads MemberDetailPage.tsx before making any changes.**

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts` (add new interfaces)
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.tsx` (refactor into shell)
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.module.css` (minor additions if needed)
- Create: `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css`
- Create: `src/PluralHost.Web/src/components/tabs/AccessTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/AccessTab.module.css`
- Modify: `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx`
- Create: `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx`
- Create: `src/PluralHost.Web/src/__tests__/AccessTab.test.tsx`

- [ ] **Step 1: Read current MemberDetailPage.tsx in full**

Open `src/PluralHost.Web/src/pages/MemberDetailPage.tsx` and read it entirely before touching anything. Identify:
- The Profile section (inline JSX for name/displayName/pronouns/description with `isEditing` state and mutation)
- The Options section (privacy tier selector + toggle switches)
- The current tab array and `activeTab` state
- All imports

- [ ] **Step 2: Add new types to types.ts**

Append to `src/PluralHost.Web/src/types.ts`:

```ts
export interface MemberNote {
  id: string
  memberId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface BoardMessage {
  id: string             // Guid serialized as string
  memberId: string
  authorName: string
  content: string
  createdAt: string
}

export interface FieldDef {
  id: string
  name: string
  createdAt: string
  deletedAt: string | null
}

export interface MemberFieldEntry {
  fieldId: string
  memberId: string
  value: string
  updatedAt: string
}
```

Then remove the local interface definitions from `DossierTab.tsx`, `CommsTab.tsx`, and `SpecsTab.tsx` (they defined them locally during Phase 1) and replace with imports from `../../types`. (`LogsTab.tsx` imports directly from `../../types` already — no local interfaces to remove.)

- [ ] **Step 3: Create EssenceTab (extract Profile inline code)**

Move the Profile section JSX, state, and mutation from `MemberDetailPage` into a new file. The extracted content includes: `isEditing` state, the `membersApi.update` mutation, and all Profile JSX. Pass `member`, `groups`, and `queryClient` (or let the tab own the mutation itself) as props.

**Props interface:**
```ts
interface Props {
  member: Member
  groups: Group[]
}
```

- [ ] **Step 4: Write EssenceTab test**

```tsx
// src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EssenceTab from '../components/tabs/EssenceTab'
import type { Member, Group } from '../types'

vi.mock('../api/members', () => ({ membersApi: { update: vi.fn() } }))

const mockMember: Member = {
  id: 'm1', name: 'Aria', displayName: 'The Aria', pronouns: 'she/her',
  privacyTier: 'Public', isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: ['g1'], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const mockGroups: Group[] = [{ id: 'g1', name: 'Protectors', members: ['m1'] }]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('EssenceTab', () => {
  it('renders member name and pronouns', () => {
    wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
    expect(screen.getByText('Aria')).toBeInTheDocument()
    expect(screen.getByText('she/her')).toBeInTheDocument()
  })

  it('renders group chip', () => {
    wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
    expect(screen.getByText('Protectors')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Create AccessTab (extract Options inline code)**

Move the Options section JSX and mutations into a new file.

**Props interface:**
```ts
interface Props {
  member: Member
}
```

- [ ] **Step 6: Write AccessTab test**

```tsx
// src/PluralHost.Web/src/__tests__/AccessTab.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AccessTab from '../components/tabs/AccessTab'
import type { Member } from '../types'

vi.mock('../api/members', () => ({ membersApi: { update: vi.fn() } }))

const mockMember: Member = {
  id: 'm1', name: 'Aria', privacyTier: 'Public',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('AccessTab', () => {
  it('renders privacy tier selector', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getByText(/privacy/i)).toBeInTheDocument()
  })

  it('renders toggle switches', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 7: Refactor MemberDetailPage into shell**

Replace the current `MemberDetailPage` content with:

```tsx
// Tabs array (update existing activeTab state to use these values)
const TABS = [
  { label: 'Essence', value: 'essence' },
  { label: 'Specs',   value: 'specs'   },
  { label: 'Dossier', value: 'dossier' },
  { label: 'Comms',   value: 'comms'   },
  { label: 'Logs',    value: 'logs'    },
  { label: 'Access',  value: 'access'  },
] as const

type TabValue = typeof TABS[number]['value']
```

The shell renders:
- Member header (avatar + name) — keep as-is
- `<TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />`
- A `switch` or conditional rendering of the active tab component, passing `member` and `groups` props

- [ ] **Step 8: Verify `['front-history']` query key alignment**

Check `src/PluralHost.Web/src/pages/FrontPage.tsx`. If FrontPage uses a different query key for front history data, align it to `['front-history']` so LogsTab cache invalidation is shared. If FrontPage only uses `getCurrent` (fronters list) and not history, no change needed.

- [ ] **Step 9: Run all tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: All tests pass. If MemberDetailPage tests reference old Profile/Options inline code, update them to assert the new tab components render instead.

- [ ] **Step 10: Commit**

```bash
git add src/PluralHost.Web/src/types.ts \
        src/PluralHost.Web/src/pages/MemberDetailPage.tsx \
        src/PluralHost.Web/src/pages/MemberDetailPage.module.css \
        src/PluralHost.Web/src/components/tabs/EssenceTab.tsx \
        src/PluralHost.Web/src/components/tabs/EssenceTab.module.css \
        src/PluralHost.Web/src/components/tabs/AccessTab.tsx \
        src/PluralHost.Web/src/components/tabs/AccessTab.module.css \
        src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx \
        src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx \
        src/PluralHost.Web/src/__tests__/AccessTab.test.tsx
git commit -m "feat: Plan 6a complete — 6-tab MemberDetailPage (Essence/Specs/Dossier/Comms/Logs/Access)"
```
