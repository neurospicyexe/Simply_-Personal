# Photo Album Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Photos tab to MemberDetailPage that lets the owner upload, view, set-as-background, and delete per-alter photos stored in `Member.extraImages`.

**Architecture:** Pure frontend feature — `Member.ExtraImages: List<string>` already exists on the backend. Upload each photo via `POST /api/media/upload`, then PATCH the full `extraImages` array (add/remove). BottomSheet reused for per-photo actions.

**Tech Stack:** React, TypeScript, TanStack Query, CSS Modules, existing `mediaApi`, `membersApi`, `BottomSheet` component.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/PluralHost.Web/src/types.ts` | Modify | Add `extraImages` to `Member` + `MemberUpdatePayload` |
| `src/PluralHost.Web/src/components/tabs/PhotosTab.tsx` | Create | Photos tab component |
| `src/PluralHost.Web/src/components/tabs/PhotosTab.module.css` | Create | Photos tab styles |
| `src/PluralHost.Web/src/__tests__/PhotosTab.test.tsx` | Create | Unit tests for PhotosTab |
| `src/PluralHost.Web/src/pages/MemberDetailPage.tsx` | Modify | Add Photos as 7th tab |
| `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx` | Modify | Update tab count test + add Photos tab test |

---

### Task 1: Add `extraImages` to frontend types

**Context:** `Member.ExtraImages: List<string>` is persisted server-side and returned in `MemberResponse`, but the frontend `Member` interface and `MemberUpdatePayload` don't declare it yet. This causes TypeScript errors if any component references it.

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`

- [ ] **Step 1: Write the failing build check**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx tsc -b --noEmit 2>&1 | head -5`

This passes now. The next step adds new fields, so the build must still pass after.

- [ ] **Step 2: Add `extraImages` to `Member` interface**

In `src/PluralHost.Web/src/types.ts`, add one line inside the `Member` interface after `backgroundImagePath`:

```ts
export interface Member {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  backgroundImagePath?: string | null
  extraImages?: string[]          // ← add this line
  description?: string
  bucketId: string
  // ... rest unchanged
```

- [ ] **Step 3: Add `extraImages` to `MemberUpdatePayload`**

In the same file, add one line inside `MemberUpdatePayload` after `clearBackgroundImage`:

```ts
export interface MemberUpdatePayload {
  name?: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  backgroundImagePath?: string
  clearBackgroundImage?: boolean
  extraImages?: string[]          // ← add this line
  description?: string
  // ... rest unchanged
```

- [ ] **Step 4: Verify build passes**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx tsc -b --noEmit`
Expected: no output (clean build)

- [ ] **Step 5: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/types.ts
git commit -m "feat: add extraImages to Member and MemberUpdatePayload types"
```

---

### Task 2: PhotosTab component + tests

**Context:** New tab component. Follows the same patterns as `EssenceTab` — takes a `member` prop, uses `useQueryClient` internally, calls `qc.invalidateQueries` after mutations. Uses `BottomSheet` (default export from `../BottomSheet`) for per-photo actions. Upload via `mediaApi.upload(file)` which returns `{ id: string }` where `id` is the media path. PATCH full array on add/remove.

**Files:**
- Create: `src/PluralHost.Web/src/components/tabs/PhotosTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/PhotosTab.module.css`
- Create: `src/PluralHost.Web/src/__tests__/PhotosTab.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/PluralHost.Web/src/__tests__/PhotosTab.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PhotosTab from '../components/tabs/PhotosTab'
import type { Member } from '../types'
import * as mediaApiModule from '../api/media'
import * as membersApiModule from '../api/members'

vi.mock('../api/media', () => ({
  mediaApi: { upload: vi.fn().mockResolvedValue({ id: 'uploads/new.jpg' }) },
}))
vi.mock('../api/members', () => ({
  membersApi: { update: vi.fn().mockResolvedValue({}) },
}))

function baseMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    name: 'Aria',
    bucketId: '00000000-0000-0000-0000-000000000001',
    isArchived: false,
    isUntracked: false,
    isPinned: false,
    preventFrontNotification: false,
    receiveBoardNotifications: false,
    groupIds: [],
    parentIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function wrap(member: Member) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PhotosTab member={member} />
    </QueryClientProvider>
  )
}

describe('PhotosTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows empty state when extraImages is empty', () => {
    wrap(baseMember({ extraImages: [] }))
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
  })

  it('shows empty state when extraImages is undefined', () => {
    wrap(baseMember({ extraImages: undefined }))
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
  })

  it('renders photo grid when extraImages has items', () => {
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg', 'uploads/photo2.jpg'] }))
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(2)
  })

  it('renders Add photo button', () => {
    wrap(baseMember({ extraImages: [] }))
    expect(screen.getByLabelText('Add photo')).toBeInTheDocument()
  })

  it('tapping a photo opens BottomSheet with actions', () => {
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Set as background')).toBeInTheDocument()
    expect(screen.getByText('Delete photo')).toBeInTheDocument()
  })

  it('Set as background calls membersApi.update with backgroundImagePath', async () => {
    const updateSpy = vi.spyOn(membersApiModule.membersApi, 'update').mockResolvedValue(baseMember() as any)
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByText('Set as background'))
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('member-1', { backgroundImagePath: 'uploads/photo1.jpg' })
    })
  })

  it('Delete calls membersApi.update with photo removed from array', async () => {
    const updateSpy = vi.spyOn(membersApiModule.membersApi, 'update').mockResolvedValue(baseMember() as any)
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg', 'uploads/photo2.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByText('Delete photo'))
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('member-1', { extraImages: ['uploads/photo2.jpg'] })
    })
  })

  it('shows upload error when mediaApi.upload fails', async () => {
    vi.spyOn(mediaApiModule.mediaApi, 'upload').mockRejectedValue(new Error('fail'))
    wrap(baseMember({ extraImages: [] }))
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
    })
  })

  it('shows sheet error when delete fails', async () => {
    vi.spyOn(membersApiModule.membersApi, 'update').mockRejectedValue(new Error('fail'))
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByText('Delete photo'))
    await waitFor(() => {
      expect(screen.getByText(/delete failed/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run src/__tests__/PhotosTab.test.tsx`
Expected: FAIL — "Cannot find module '../components/tabs/PhotosTab'"

- [ ] **Step 3: Create PhotosTab styles**

Create `src/PluralHost.Web/src/components/tabs/PhotosTab.module.css`:

```css
.tab {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
}

.addBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: none;
  border: 1px solid var(--member-color, var(--color-primary));
  border-radius: 8px;
  color: var(--member-color, var(--color-primary));
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.addBtn:disabled {
  opacity: 0.5;
  cursor: default;
}

.hiddenInput {
  display: none;
}

.grid {
  column-count: 2;
  column-gap: 6px;
}

.photo {
  break-inside: avoid;
  width: 100%;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 6px;
  display: block;
  transition: opacity 0.15s;
}

.photo:hover {
  opacity: 0.85;
}

.emptyState {
  margin-top: 8px;
  padding: 24px 16px;
  border: 1px dashed #2a2a2a;
  border-radius: 8px;
  text-align: center;
  color: #555;
  font-size: 13px;
}

.emptyIcon {
  font-size: 24px;
  margin-bottom: 8px;
}

.error {
  color: var(--color-danger);
  font-size: 12px;
  margin: 0;
}

.sheetContent {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sheetPreview {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  border-radius: 8px;
  background: #0a0a0a;
}

.sheetPrimary {
  width: 100%;
  padding: 10px;
  background: none;
  border: 1px solid var(--member-color, var(--color-primary));
  border-radius: 8px;
  color: var(--member-color, var(--color-primary));
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.sheetPrimary:disabled {
  opacity: 0.5;
  cursor: default;
}

.sheetDanger {
  width: 100%;
  padding: 10px;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid var(--color-danger);
  border-radius: 8px;
  color: var(--color-danger);
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.sheetDanger:disabled {
  opacity: 0.5;
  cursor: default;
}
```

- [ ] **Step 4: Create PhotosTab component**

Create `src/PluralHost.Web/src/components/tabs/PhotosTab.tsx`:

```tsx
import { useRef, useState } from 'react'
import type React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '../../api/media'
import { membersApi } from '../../api/members'
import type { Member } from '../../types'
import BottomSheet from '../BottomSheet'
import styles from './PhotosTab.module.css'

interface Props {
  member: Member
}

export default function PhotosTab({ member }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [sheetBusy, setSheetBusy] = useState(false)

  const photos = member.extraImages ?? []

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const { id } = await mediaApi.upload(file)
      await membersApi.update(member.id, { extraImages: [...photos, id] })
      qc.invalidateQueries({ queryKey: ['member', member.id] })
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSetBackground = async () => {
    if (!selectedPhoto) return
    setSheetBusy(true)
    setSheetError(null)
    try {
      await membersApi.update(member.id, { backgroundImagePath: selectedPhoto })
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      setSelectedPhoto(null)
    } catch {
      setSheetError('Failed to set background. Please try again.')
    } finally {
      setSheetBusy(false)
    }
  }

  const handleDeletePhoto = async () => {
    if (!selectedPhoto) return
    setSheetBusy(true)
    setSheetError(null)
    try {
      await membersApi.update(member.id, {
        extraImages: photos.filter(p => p !== selectedPhoto),
      })
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      setSelectedPhoto(null)
    } catch {
      setSheetError('Delete failed. Please try again.')
    } finally {
      setSheetBusy(false)
    }
  }

  return (
    <div className={styles.tab} role="tabpanel">
      <div className={styles.toolbar}>
        <button
          className={styles.addBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Add photo"
          type="button"
        >
          {uploading ? '…' : '+ Add photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={handleFileChange}
        />
      </div>

      {uploadError && <p className={styles.error} role="alert">{uploadError}</p>}

      {photos.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🖼</div>
          <p>No photos yet — add some above</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {photos.map(path => (
            <img
              key={path}
              src={`/api/media/${path}`}
              alt=""
              className={styles.photo}
              onClick={() => { setSheetError(null); setSelectedPhoto(path) }}
            />
          ))}
        </div>
      )}

      <BottomSheet
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        title="Photo options"
      >
        {selectedPhoto && (
          <div className={styles.sheetContent}>
            <img
              src={`/api/media/${selectedPhoto}`}
              alt="Selected photo"
              className={styles.sheetPreview}
            />
            {sheetError && <p className={styles.error} role="alert">{sheetError}</p>}
            <button
              className={styles.sheetPrimary}
              onClick={handleSetBackground}
              disabled={sheetBusy}
              type="button"
            >
              Set as background
            </button>
            <button
              className={styles.sheetDanger}
              onClick={handleDeletePhoto}
              disabled={sheetBusy}
              type="button"
            >
              Delete photo
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run src/__tests__/PhotosTab.test.tsx`
Expected: 8 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/components/tabs/PhotosTab.tsx \
        src/PluralHost.Web/src/components/tabs/PhotosTab.module.css \
        src/PluralHost.Web/src/__tests__/PhotosTab.test.tsx
git commit -m "feat: PhotosTab component — masonry grid, upload, set-as-background, delete"
```

---

### Task 3: Wire PhotosTab into MemberDetailPage

**Context:** `MemberDetailPage.tsx` has a `TABS` const array typed with `as const`. Adding a 7th entry requires updating `TABS`, importing `PhotosTab`, and adding the render case. The existing test `'all six tabs are rendered'` asserts exactly 6 tabs — update it to 7 and add a test that navigating to the Photos tab renders the component. Also add `vi.mock('../api/media', ...)` to the test file since PhotosTab uses `mediaApi`.

**Files:**
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.tsx`
- Modify: `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx`

- [ ] **Step 1: Write failing tests first**

In `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx`:

1. Find the test `'all six tabs are rendered'` and update it to assert 7 tabs including `photos`:

```ts
test('all seven tabs are rendered', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  expect(screen.getByRole('tab', { name: /essence/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /specs/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /dossier/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /comms/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /access/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /photos/i })).toBeInTheDocument()
})
```

2. Add a new test after the tab count test:

```ts
test('switching to Photos tab shows empty state', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  await userEvent.click(screen.getByRole('tab', { name: /photos/i }))
  expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
})
```

3. Add `mediaApi` mock at the top of the file alongside the other `vi.mock` calls:

```ts
vi.mock('../api/media', () => ({
  mediaApi: { upload: vi.fn().mockResolvedValue({ id: 'uploads/new.jpg' }) },
}))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run src/__tests__/MemberDetailPage.test.tsx`
Expected: FAIL — "photos" tab not found

- [ ] **Step 3: Update MemberDetailPage**

In `src/PluralHost.Web/src/pages/MemberDetailPage.tsx`:

3a. Add import after the `AccessTab` import:
```ts
import PhotosTab from '../components/tabs/PhotosTab'
```

3b. Update `TABS` array (add `photos` as 7th entry):
```ts
const TABS = [
  { id: 'essence', label: 'Essence' },
  { id: 'specs',   label: 'Specs'   },
  { id: 'dossier', label: 'Dossier' },
  { id: 'comms',   label: 'Comms'   },
  { id: 'logs',    label: 'Logs'    },
  { id: 'access',  label: 'Access'  },
  { id: 'photos',  label: 'Photos'  },
] as const
```

3c. Add render case inside the `<div className={styles.content}>` block after the `access` case:
```tsx
{activeTab === 'photos'   && <PhotosTab   member={member} />}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run src/__tests__/MemberDetailPage.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Run full frontend test suite**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run`
Expected: all tests PASS (115+ tests, no regressions)

- [ ] **Step 6: TypeScript build check**

Run: `cd /c/dev/simply-personal/src/PluralHost.Web && npx tsc -b --noEmit`
Expected: no output (clean)

- [ ] **Step 7: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/pages/MemberDetailPage.tsx \
        src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx
git commit -m "feat: wire PhotosTab as 7th tab in MemberDetailPage"
```
