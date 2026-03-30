# Journal UI Implementation Plan

**Status: COMPLETE (2026-03-29)**

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the History stub with a "Logs" page containing a Journal tab (full CRUD with markdown rendering) and a Front History tab (read-only system-wide view).

**Architecture:** Frontend-only work -- the backend (`JournalsController`, `GET/POST/PATCH/DELETE /api/journals`) is already complete. `LogsPage` owns tab state and sheet open/close state. `EntrySheet` owns view/edit mode state internally. Markdown rendering uses `react-markdown` + `remark-gfm`.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, CSS Modules, Vitest + Testing Library, `react-markdown`, `remark-gfm`, lucide-react

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Delete | `src/pages/HistoryStubPage.tsx` | (replaced) |
| Create | `src/api/journals.ts` | CRUD calls to `/api/journals` |
| Modify | `src/types.ts` | Add `JournalEntry` interface |
| Create | `src/pages/LogsPage.tsx` | Tab container, search, sheet state |
| Create | `src/pages/LogsPage.module.css` | Styles for Logs page |
| Create | `src/components/EntrySheet.tsx` | View/edit bottom sheet for a journal entry |
| Create | `src/components/EntrySheet.module.css` | Styles for EntrySheet |
| Modify | `src/App.tsx` | `/history` → `/logs`, import `LogsPage` |
| Modify | `src/components/BottomNav.tsx` | History → Logs (label + icon) |
| Modify | `src/PluralHost.Web/package.json` | Add `react-markdown`, `remark-gfm` |
| Create | `src/__tests__/LogsPage.test.tsx` | Tests for LogsPage |
| Create | `src/__tests__/EntrySheet.test.tsx` | Tests for EntrySheet |

---

## Task 1: Install dependencies

**Files:**
- Modify: `src/PluralHost.Web/package.json`

- [ ] **Step 1: Install react-markdown and remark-gfm**

```bash
cd src/PluralHost.Web && npm install react-markdown remark-gfm
```

Expected: packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: `dist/` built with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd src/PluralHost.Web && git add package.json package-lock.json
git commit -m "chore: add react-markdown and remark-gfm"
```

---

## Task 2: Add JournalEntry type + API module

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`
- Create: `src/PluralHost.Web/src/api/journals.ts`

- [ ] **Step 1: Add JournalEntry to types.ts**

Open `src/PluralHost.Web/src/types.ts` and add at the end:

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

- [ ] **Step 2: Create src/api/journals.ts**

```ts
import { apiFetch } from './client'
import type { JournalEntry } from '../types'

export const journalsApi = {
  list: (): Promise<JournalEntry[]> =>
    apiFetch<JournalEntry[]>('/api/journals'),

  create: (body: { title?: string; content: string; isPrivate: boolean }): Promise<JournalEntry> =>
    apiFetch<JournalEntry>('/api/journals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: string, body: { title?: string; content?: string; isPrivate?: boolean }): Promise<JournalEntry> =>
    apiFetch<JournalEntry>(`/api/journals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (id: string): Promise<void> =>
    apiFetch<void>(`/api/journals/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 3: Build to verify types**

```bash
cd src/PluralHost.Web && npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/types.ts src/PluralHost.Web/src/api/journals.ts
git commit -m "feat: add JournalEntry type and journals API module"
```

---

## Task 3: Update navigation (route + nav)

**Files:**
- Modify: `src/PluralHost.Web/src/App.tsx`
- Modify: `src/PluralHost.Web/src/components/BottomNav.tsx`

- [ ] **Step 1: Update BottomNav.tsx**

Change the History entry to Logs. Replace the `Clock` import with `BookOpen`:

```ts
// Before:
import { Radio, Users, Layers, Clock, Settings } from 'lucide-react'
// ...
{ to: '/history',  label: 'History',  Icon: Clock },

// After:
import { Radio, Users, Layers, BookOpen, Settings } from 'lucide-react'
// ...
{ to: '/logs',  label: 'Logs',  Icon: BookOpen },
```

- [ ] **Step 2: Update App.tsx**

```ts
// Remove:
import HistoryStubPage from './pages/HistoryStubPage'

// Add:
import LogsPage from './pages/LogsPage'

// Change route:
// Before:
<Route path="/history" element={<Protected><HistoryStubPage /></Protected>} />
// After:
<Route path="/logs" element={<Protected><LogsPage /></Protected>} />
```

At this point `LogsPage` doesn't exist yet -- the build will fail. That's expected. Proceed to Task 4 immediately.

- [ ] **Step 3: Commit (after Task 4 passes build)**

Defer this commit until after Task 4 so the build is green.

---

## Task 4: LogsPage -- tabs + journal list

**Files:**
- Create: `src/PluralHost.Web/src/pages/LogsPage.tsx`
- Create: `src/PluralHost.Web/src/pages/LogsPage.module.css`

- [ ] **Step 1: Create LogsPage.module.css**

```css
.page {
  padding: 16px;
  padding-bottom: 80px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.addBtn {
  background: var(--color-primary);
  color: #000;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.searchBar {
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--color-text);
  font-size: 14px;
  margin-bottom: 12px;
  box-sizing: border-box;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty {
  color: var(--color-text-muted);
  font-size: 14px;
  text-align: center;
  margin-top: 40px;
}

.card {
  background: var(--color-surface);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  border: 1px solid var(--color-border);
}

.card:hover {
  border-color: var(--color-primary);
}

.cardTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.cardTitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.cardDate {
  font-size: 11px;
  color: var(--color-text-muted);
}

.privacyBadge {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Front history tab */
.historyCard {
  background: var(--color-surface);
  border-radius: 10px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  margin-bottom: 8px;
}

.historyMember {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.historyTime {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
```

- [ ] **Step 2: Create LogsPage.tsx**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import TabBar from '../components/TabBar'
import EntrySheet from '../components/EntrySheet'
import { journalsApi } from '../api/journals'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import type { JournalEntry, Member, SpEnvelope, FrontContent } from '../types'
import styles from './LogsPage.module.css'

const TABS = [
  { id: 'Journal', label: 'Journal' },
  { id: 'History', label: 'Front History' },
]

function formatDate(isoOrMs: string | number) {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState('Journal')
  const [searchTerm, setSearchTerm] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)

  // Journal data
  const { data: journals = [] } = useQuery({
    queryKey: ['journals'],
    queryFn: journalsApi.list,
  })

  // Front history data -- only fetch when that tab is active
  const { data: frontHistory = [] } = useQuery({
    queryKey: ['front-history'],
    queryFn: frontApi.history,
    enabled: activeTab === 'History',
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
    enabled: activeTab === 'History',
  })

  const memberMap = Object.fromEntries((members as Member[]).map(m => [m.id, m]))

  const filtered = journals.filter(e => {
    const q = searchTerm.toLowerCase()
    return (
      (e.title ?? '').toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q)
    )
  })

  function openNew() {
    setSelectedEntry(null)
    setSheetOpen(true)
  }

  function openEntry(entry: JournalEntry) {
    setSelectedEntry(entry)
    setSheetOpen(true)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Logs</h1>
        {activeTab === 'Journal' && (
          <button className={styles.addBtn} onClick={openNew} aria-label="New entry">
            <Plus size={18} />
          </button>
        )}
      </div>

      <TabBar tabs={[...TABS]} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'Journal' && (
        <>
          <input
            className={styles.searchBar}
            placeholder="Search journal…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {filtered.length === 0 ? (
            <p className={styles.empty}>
              {searchTerm ? 'No entries match your search.' : 'No journal entries yet.'}
            </p>
          ) : (
            <div className={styles.list}>
              {filtered.map(entry => (
                <div key={entry.id} className={styles.card} onClick={() => openEntry(entry)}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardTitle}>{entry.title || 'Untitled'}</span>
                    <span className={styles.cardDate}>{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.isPrivate && <span className={styles.privacyBadge}>🔒 Private</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'History' && (
        <div>
          {(frontHistory as SpEnvelope<FrontContent>[])
            .slice()
            .sort((a, b) => b.content.startTime - a.content.startTime)
            .map(e => {
              const m = memberMap[e.content.member]
              return (
                <div key={e.content.uid} className={styles.historyCard}>
                  <div className={styles.historyMember}>{m?.name ?? e.content.member}</div>
                  <div className={styles.historyTime}>{formatDate(e.content.startTime)}</div>
                </div>
              )
            })}
          {frontHistory.length === 0 && (
            <p className={styles.empty}>No front history yet.</p>
          )}
        </div>
      )}

      <EntrySheet
        entry={selectedEntry}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Build to verify**

```bash
cd src/PluralHost.Web && npm run build
```

Expected: passes. If `EntrySheet` doesn't exist yet, create a placeholder first (see note below).

**Note:** If build fails because `EntrySheet` doesn't exist, create a temporary placeholder:
```tsx
// src/components/EntrySheet.tsx (temporary -- replace in Task 5)
export default function EntrySheet(_: { entry: unknown; isOpen: boolean; onClose: () => void }) {
  return null
}
```

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/pages/LogsPage.tsx \
        src/PluralHost.Web/src/pages/LogsPage.module.css \
        src/PluralHost.Web/src/components/BottomNav.tsx \
        src/PluralHost.Web/src/App.tsx
git commit -m "feat: add LogsPage with Journal and Front History tabs"
```

---

## Task 5: EntrySheet (view + edit modes)

**Files:**
- Create: `src/PluralHost.Web/src/components/EntrySheet.tsx`
- Create: `src/PluralHost.Web/src/components/EntrySheet.module.css`

- [ ] **Step 1: Write failing tests**

Create `src/PluralHost.Web/src/__tests__/EntrySheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EntrySheet from '../components/EntrySheet'
import type { JournalEntry } from '../types'

vi.mock('../api/journals', () => ({
  journalsApi: {
    create: vi.fn().mockResolvedValue({ id: 'new', title: 'T', content: 'C', isPrivate: true, createdAt: '', updatedAt: '' }),
    update: vi.fn().mockResolvedValue({ id: 'e1', title: 'T', content: 'C', isPrivate: true, createdAt: '', updatedAt: '' }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

const mockEntry: JournalEntry = {
  id: 'e1',
  title: 'Test Entry',
  content: '**Hello world**',
  isPrivate: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('EntrySheet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when closed', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens in view mode for existing entry', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('opens in edit mode for new entry (null)', () => {
    wrap(<EntrySheet entry={null} isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/content/i)).toBeInTheDocument()
  })

  it('switches to edit mode when pencil clicked', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Test Entry')).toBeInTheDocument()
  })

  it('disables save when content is empty', () => {
    wrap(<EntrySheet entry={null} isOpen onClose={vi.fn()} />)
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn).toBeDisabled()
  })

  it('calls journalsApi.create on save for new entry', async () => {
    const { journalsApi } = await import('../api/journals')
    wrap(<EntrySheet entry={null} isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/content/i), { target: { value: 'My content' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(journalsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'My content' })
    ))
  })

  it('calls journalsApi.update on save for existing entry', async () => {
    const { journalsApi } = await import('../api/journals')
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Test Entry'), { target: { value: 'New Title' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(journalsApi.update).toHaveBeenCalledWith(
      'e1', expect.objectContaining({ title: 'New Title' })
    ))
  })

  it('shows delete button in edit mode for existing entry', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('calls onClose after delete', async () => {
    const onClose = vi.fn()
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run tests -- expect failures**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/EntrySheet.test.tsx
```

Expected: all fail (component doesn't exist yet).

- [ ] **Step 3: Create EntrySheet.module.css**

```css
.viewActions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.editBtn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.editBtn:hover {
  color: var(--color-text);
}

.privacyBadge {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 12px;
}

.markdown {
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.7;
}

.markdown h1, .markdown h2, .markdown h3 {
  margin: 12px 0 6px;
}

.markdown p {
  margin: 0 0 8px;
}

.markdown code {
  background: var(--color-surface);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.label {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--color-text);
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}

.textarea {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--color-text);
  font-size: 14px;
  width: 100%;
  min-height: 180px;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  line-height: 1.6;
}

.toggleRow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
}

.saveBtn {
  background: var(--color-primary);
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.saveBtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.cancelBtn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 16px;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
}

.deleteBtn {
  background: none;
  border: none;
  color: var(--color-danger);
  font-size: 14px;
  cursor: pointer;
  margin-right: auto;
}
```

- [ ] **Step 4: Create EntrySheet.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BottomSheet from './BottomSheet'
import { journalsApi } from '../api/journals'
import type { JournalEntry } from '../types'
import styles from './EntrySheet.module.css'

interface Props {
  entry: JournalEntry | null  // null = create new
  isOpen: boolean
  onClose: () => void
}

type Mode = 'view' | 'edit'

export default function EntrySheet({ entry, isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const isNew = entry === null

  const [mode, setMode] = useState<Mode>(isNew ? 'edit' : 'view')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [isPrivate, setIsPrivate] = useState(entry?.isPrivate ?? true)

  // Reset state when entry changes (different entry opened or new)
  useEffect(() => {
    setMode(entry === null ? 'edit' : 'view')
    setTitle(entry?.title ?? '')
    setContent(entry?.content ?? '')
    setIsPrivate(entry?.isPrivate ?? true)
  }, [entry, isOpen])

  const createMutation = useMutation({
    mutationFn: () => journalsApi.create({ title: title.trim() || undefined, content, isPrivate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journals'] }); onClose() },
  })

  const updateMutation = useMutation({
    mutationFn: () => journalsApi.update(entry!.id, { title: title.trim() || undefined, content, isPrivate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journals'] }); setMode('view') },
  })

  const deleteMutation = useMutation({
    mutationFn: () => journalsApi.delete(entry!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journals'] }); onClose() },
  })

  function handleSave() {
    if (isNew) createMutation.mutate()
    else updateMutation.mutate()
  }

  function handleCancel() {
    if (isNew) { onClose() }
    else { setTitle(entry!.title ?? ''); setContent(entry!.content); setIsPrivate(entry!.isPrivate); setMode('view') }
  }

  const sheetTitle = isNew ? 'New Entry' : (entry?.title || 'Untitled')
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={sheetTitle}>
      {mode === 'view' && entry && (
        <>
          <div className={styles.viewActions}>
            <button
              className={styles.editBtn}
              onClick={() => setMode('edit')}
              aria-label="Edit entry"
            >
              <Pencil size={14} /> Edit
            </button>
          </div>
          {entry.isPrivate && <div className={styles.privacyBadge}>🔒 Private</div>}
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
          </div>
        </>
      )}

      {mode === 'edit' && (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="entry-title">Title (optional)</label>
            <input
              id="entry-title"
              className={styles.input}
              placeholder="Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="entry-content">Content</label>
            <textarea
              id="entry-content"
              className={styles.textarea}
              placeholder="Content (markdown supported)"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
            />
            Private (hidden from share links)
          </label>
          <div className={styles.actions}>
            {!isNew && (
              <button
                className={styles.deleteBtn}
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                aria-label="Delete entry"
              >
                Delete
              </button>
            )}
            <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={!content.trim() || isSaving}
              aria-label="Save entry"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}
```

- [ ] **Step 5: Run tests -- expect pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/EntrySheet.test.tsx
```

Expected: all 9 tests pass.

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/components/EntrySheet.tsx \
        src/PluralHost.Web/src/components/EntrySheet.module.css \
        src/PluralHost.Web/src/__tests__/EntrySheet.test.tsx
git commit -m "feat: add EntrySheet with view/edit modes and markdown rendering"
```

---

## Task 6: LogsPage tests

**Files:**
- Create: `src/PluralHost.Web/src/__tests__/LogsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/PluralHost.Web/src/__tests__/LogsPage.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import LogsPage from '../pages/LogsPage'
import type { JournalEntry } from '../types'

vi.mock('../api/journals', () => ({
  journalsApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../api/front', () => ({
  frontApi: {
    history: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../api/members', () => ({
  membersApi: { list: vi.fn().mockResolvedValue([]) },
}))

const mockEntries: JournalEntry[] = [
  { id: 'j1', title: 'Day one', content: 'First entry', isPrivate: true, createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z' },
  { id: 'j2', title: 'Day two', content: 'Second entry', isPrivate: false, createdAt: '2026-01-02T10:00:00Z', updatedAt: '2026-01-02T10:00:00Z' },
]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('LogsPage', () => {
  it('renders Journal and Front History tabs', () => {
    wrap(<LogsPage />)
    expect(screen.getByText('Journal')).toBeInTheDocument()
    expect(screen.getByText('Front History')).toBeInTheDocument()
  })

  it('shows journal entries when loaded', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    expect(await screen.findByText('Day one')).toBeInTheDocument()
    expect(screen.getByText('Day two')).toBeInTheDocument()
  })

  it('shows private badge for private entries', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    await screen.findByText('Day one')
    expect(screen.getByText('🔒 Private')).toBeInTheDocument()
  })

  it('filters entries by search term', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    await screen.findByText('Day one')
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'two' } })
    expect(screen.queryByText('Day one')).not.toBeInTheDocument()
    expect(screen.getByText('Day two')).toBeInTheDocument()
  })

  it('opens sheet when plus button clicked', async () => {
    wrap(<LogsPage />)
    fireEvent.click(screen.getByRole('button', { name: /new entry/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens sheet when entry card clicked', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    await screen.findByText('Day one')
    fireEvent.click(screen.getByText('Day one'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows empty state when no entries', async () => {
    wrap(<LogsPage />)
    expect(await screen.findByText(/no journal entries yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/LogsPage.test.tsx
```

Expected: all 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/__tests__/LogsPage.test.tsx
git commit -m "test: add LogsPage tests"
```

---

## Task 7: Delete stub + full test run + build

**Files:**
- Delete: `src/PluralHost.Web/src/pages/HistoryStubPage.tsx`

- [ ] **Step 1: Delete HistoryStubPage**

```bash
rm src/PluralHost.Web/src/pages/HistoryStubPage.tsx
```

- [ ] **Step 2: Run all frontend tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass (including existing tests -- check for regressions).

- [ ] **Step 3: Full build**

```bash
npm run build
```

Expected: clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: Plan 8 complete -- Journal UI with Logs page and EntrySheet"
```

---

## Verification Checklist

Before marking complete, verify manually (or via tests):

- [ ] `/logs` route renders correctly (not redirecting to login)
- [ ] Journal tab shows entries with title, date, privacy badge
- [ ] Search filters in real time
- [ ] Plus button opens sheet in edit mode (no view mode, Cancel closes sheet)
- [ ] Tapping an entry opens sheet in view mode (rendered markdown visible)
- [ ] Pencil button switches to edit mode
- [ ] Save creates/updates correctly (entry appears in list after save)
- [ ] Delete removes entry and closes sheet
- [ ] IsPrivate toggle defaults to true for new entries
- [ ] Front History tab shows all front history entries (names resolved)
- [ ] BottomNav shows "Logs" with BookOpen icon, active state highlights correctly
- [ ] `npx vitest run` -- all tests pass
- [ ] `npm run build` -- clean
