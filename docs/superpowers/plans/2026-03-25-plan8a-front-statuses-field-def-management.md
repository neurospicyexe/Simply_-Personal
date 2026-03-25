# Front Status Management UI + Field Definition Edit/Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `FrontStatusController` to a new Statuses tab on SystemPage, and add edit/delete actions for field definitions in SpecsTab.

**Architecture:** Two independent frontend features share one backend fix (PIN body migration). Backend changes come first (Tasks 1–2) so frontend can integrate against correct behaviour. Each task produces a green test suite and a commit.

**Tech Stack:** .NET 8 / ASP.NET Core, EF Core InMemory (tests), React 18 + TanStack Query, TypeScript, CSS Modules.

---

## File Map

**New files:**
- `src/PluralHost.Web/src/api/frontStatuses.ts` — API client for `/api/front-statuses`
- `src/PluralHost.Web/src/components/FrontStatusSheet.tsx` — create/edit bottom sheet for a front status

**Modified files:**
- `src/PluralHost.Api/Controllers/FrontStatusController.cs` — remove `IsHidden` filter from `ListAsync`; migrate `DeleteAsync` PIN from `[FromQuery]` to `[FromBody]`
- `tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs` — rename/flip hidden test; update `DeleteAsync` call sites
- `src/PluralHost.Web/src/api/fields.ts` — add `updateDef` and `deleteDef`
- `src/PluralHost.Web/src/pages/SystemPage.tsx` — add Statuses tab, import `FrontStatusSheet`, PIN confirmation for status delete
- `src/PluralHost.Web/src/pages/SystemPage.module.css` — status card styles
- `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx` — restructure field row to two-zone layout; add `···` menu, edit-def sheet, delete-def sheet
- `src/PluralHost.Web/src/components/tabs/SpecsTab.module.css` — updated/new CSS for restructured rows

---

## Task 1: Backend — `ListAsync` returns all statuses including hidden

**Files:**
- Modify: `src/PluralHost.Api/Controllers/FrontStatusController.cs:24-25`
- Modify: `tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs:41-52`

- [ ] **Step 1: Rename test and flip its assertion (makes it fail)**

In `FrontStatusControllerTests.cs`, replace the `GetAll_ExcludesHiddenStatuses` test:

```csharp
[Fact]
public async Task GetAll_IncludesHiddenStatuses()
{
    var status = new FrontStatus { Label = "Test", IsDefault = false };
    status.IsHidden = true;
    _context.FrontStatuses.Add(status);
    await _context.SaveChangesAsync();

    var result = await _controller.ListAsync() as OkObjectResult;
    var statuses = result!.Value as IEnumerable<FrontStatusResponse>;
    Assert.Contains(statuses!, s => s.Label == "Test" && s.IsHidden);
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd C:/dev/simply-personal
dotnet test --filter "GetAll_IncludesHiddenStatuses" -v minimal
```

Expected: FAIL — `Assert.Contains` fails because hidden status is excluded.

- [ ] **Step 3: Remove `IsHidden` filter from `ListAsync`**

In `FrontStatusController.cs`, change lines 24–28:

```csharp
// Before:
var statuses = await context.FrontStatuses
    .Where(s => !s.IsHidden)
    .OrderBy(s => s.IsDefault ? 0 : 1)
    .ThenBy(s => s.Label)
    .ToListAsync();

// After:
var statuses = await context.FrontStatuses
    .OrderBy(s => s.IsDefault ? 0 : 1)
    .ThenBy(s => s.Label)
    .ToListAsync();
```

- [ ] **Step 4: Run all FrontStatus tests**

```bash
dotnet test --filter "FrontStatusControllerTests" -v minimal
```

Expected: all 5 tests pass. `GetAll_ReturnsVisibleStatuses` still passes because no seeded default has `IsHidden = true`.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/FrontStatusController.cs \
        tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs
git commit -m "fix: FrontStatusController list returns all statuses including hidden"
```

---

## Task 2: Backend — Migrate `DeleteAsync` PIN from query string to request body

**Files:**
- Modify: `src/PluralHost.Api/Controllers/FrontStatusController.cs:58-73`
- Modify: `tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs:66-102`

**Context:** `PinRequest(string Pin)` is defined in `SecureActionController.cs` (line 11) — not in `NativeDtos.cs`. It is already used by `TokensController`. No import needed; same namespace.

- [ ] **Step 1: Update test call sites (they will stop compiling after the signature change)**

In `FrontStatusControllerTests.cs`, update the three `DeleteAsync` calls:

```csharp
// Line 71 — Delete_DefaultStatus_Returns400
var result = await _controller.DeleteAsync(defaultId, new PinRequest("1234"));

// Line 83 — Delete_UserStatus_WithValidPin_SoftDeletes
var result = await _controller.DeleteAsync(status.Id, new PinRequest("1234"));

// Line 100 — Delete_InvalidPin_Returns403
var result = await _controller.DeleteAsync(status.Id, new PinRequest("wrong"));
```

- [ ] **Step 2: Change `DeleteAsync` signature and body**

In `FrontStatusController.cs`, replace lines 58–73:

```csharp
[HttpDelete("{id:guid}")]
public async Task<IActionResult> DeleteAsync(Guid id, [FromBody] PinRequest body)
{
    if (!await gatekeeper.ValidatePinAsync(body.Pin))
        return Forbid();

    var status = await context.FrontStatuses.FirstOrDefaultAsync(s => s.Id == id);
    if (status is null) return NotFound();

    if (status.IsDefault)
        return BadRequest(new { error = "Default statuses cannot be deleted" });

    status.SoftDelete();
    await context.SaveChangesAsync();
    return Ok();
}
```

- [ ] **Step 3: Run all FrontStatus tests**

```bash
dotnet test --filter "FrontStatusControllerTests" -v minimal
```

Expected: all 5 pass.

- [ ] **Step 4: Run full test suite to confirm nothing regressed**

```bash
dotnet test -v minimal
```

Expected: all tests pass (same count as before, currently 291).

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/FrontStatusController.cs \
        tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs
git commit -m "fix: FrontStatusController DeleteAsync PIN in request body not query string"
```

---

## Task 3: Frontend — API modules

**Files:**
- Create: `src/PluralHost.Web/src/api/frontStatuses.ts`
- Modify: `src/PluralHost.Web/src/api/fields.ts`

- [ ] **Step 1: Create `frontStatuses.ts`**

```typescript
// src/PluralHost.Web/src/api/frontStatuses.ts
import { apiFetch } from './client'

export interface FrontStatus {
  id: string
  label: string
  color: string | null
  isDefault: boolean
  isHidden: boolean
  createdAt: string
}

export const frontStatusesApi = {
  list: () =>
    apiFetch<FrontStatus[]>('/api/front-statuses'),

  create: (label: string, color?: string | null) =>
    apiFetch<FrontStatus>('/api/front-statuses', {
      method: 'POST',
      body: JSON.stringify({ label, color: color ?? null }),
    }),

  update: (id: string, data: { label?: string; color?: string | null; isHidden?: boolean }) =>
    apiFetch<FrontStatus>(`/api/front-statuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string, pin: string) =>
    apiFetch<void>(`/api/front-statuses/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    }),
}
```

- [ ] **Step 2: Add `updateDef` and `deleteDef` to `fields.ts`**

Append to the `fieldsApi` object in `src/PluralHost.Web/src/api/fields.ts`:

```typescript
  updateDef: (id: string, label: string) =>
    apiFetch<FieldDef>(`/api/fields/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label }),
    }),

  deleteDef: (id: string) =>
    apiFetch<void>(`/api/fields/${id}`, { method: 'DELETE' }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | tail -20
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/api/frontStatuses.ts \
        src/PluralHost.Web/src/api/fields.ts
git commit -m "feat: frontStatuses API module + updateDef/deleteDef on fields API"
```

---

## Task 4: Frontend — `FrontStatusSheet` component

**Files:**
- Create: `src/PluralHost.Web/src/components/FrontStatusSheet.tsx`

This sheet handles both create mode (no status passed) and edit mode (existing status passed). For edit mode on a non-default status, it shows a Delete button that passes PIN confirmation up to the parent.

- [ ] **Step 1: Create `FrontStatusSheet.tsx`**

```tsx
// src/PluralHost.Web/src/components/FrontStatusSheet.tsx
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import BottomSheet from './BottomSheet'
import { frontStatusesApi } from '../api/frontStatuses'
import type { FrontStatus } from '../api/frontStatuses'

interface Props {
  status: FrontStatus | null   // null = create mode
  isOpen: boolean
  onClose: () => void
  onDeleteRequest: (id: string) => void  // parent handles PIN confirmation
}

const COLOR_SWATCHES = [
  '#7c3aed', '#0ea5e9', '#f59e0b', '#10b981',
  '#f87171', '#ff4db8', '#b6ff00', '#00d4ff',
  '#b400ff', '#64748b',
]

export default function FrontStatusSheet({ status, isOpen, onClose, onDeleteRequest }: Props) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setLabel(status?.label ?? '')
      setColor(status?.color ?? null)
      setIsHidden(status?.isHidden ?? false)
    }
  }, [isOpen, status])

  const createMutation = useMutation({
    mutationFn: () => frontStatusesApi.create(label.trim(), color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-statuses'] })
      onClose()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => frontStatusesApi.update(status!.id, {
      label: label.trim(),
      color,
      isHidden,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-statuses'] })
      onClose()
    },
  })

  const isCreate = status === null
  const isDirty = isCreate
    ? label.trim().length > 0
    : label.trim() !== status.label || color !== status.color || isHidden !== status.isHidden

  function handleSave() {
    if (!label.trim()) return
    if (isCreate) createMutation.mutate()
    else updateMutation.mutate()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={isCreate ? 'New Status' : 'Edit Status'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Status name…"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: '8px', padding: '8px 10px',
              color: 'var(--color-text)', fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Color
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {COLOR_SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => setColor(c === color ? null : c)}
                aria-label={c}
                style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: c, border: 'none', cursor: 'pointer',
                  outline: color === c ? '2px solid var(--color-primary)' : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
            <button
              onClick={() => setColor(null)}
              style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                cursor: 'pointer', fontSize: '12px', color: '#888',
                outline: color === null ? '2px solid var(--color-primary)' : 'none',
                outlineOffset: '2px',
              }}
              aria-label="No color"
            >✕</button>
          </div>
        </div>

        {!isCreate && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', color: 'var(--color-text)' }}>
              Hidden — exclude from front logging
            </label>
            <button
              role="switch"
              aria-checked={isHidden}
              onClick={() => setIsHidden(v => !v)}
              style={{
                width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                background: isHidden ? 'var(--color-primary)' : 'var(--color-border)',
                cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: '3px',
                left: isHidden ? '21px' : '3px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: isHidden ? '#000' : '#888',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        )}

        {status?.isDefault && (
          <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', margin: 0 }}>
            Default statuses cannot be deleted — only hidden.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={handleSave}
            disabled={!label.trim() || !isDirty || isPending}
            style={{
              background: 'var(--color-primary)', color: '#000',
              border: 'none', borderRadius: '8px', padding: '10px',
              fontWeight: 700, cursor: 'pointer', opacity: (!label.trim() || !isDirty || isPending) ? 0.5 : 1,
            }}
          >
            {isPending ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </button>

          {!isCreate && !status?.isDefault && (
            <button
              onClick={() => onDeleteRequest(status!.id)}
              style={{
                background: 'none', border: '1px solid var(--color-danger)',
                borderRadius: '8px', padding: '10px',
                color: 'var(--color-danger)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Delete Status
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/components/FrontStatusSheet.tsx
git commit -m "feat: FrontStatusSheet component (create/edit/hide/delete)"
```

---

## Task 5: Frontend — Statuses tab on SystemPage

**Files:**
- Modify: `src/PluralHost.Web/src/pages/SystemPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/SystemPage.module.css`

- [ ] **Step 1: Add CSS for status cards**

Append to `SystemPage.module.css`:

```css
/* Status cards */
.statusRow {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transition: opacity 0.2s;
}
.statusRow.hiddenStatus { opacity: 0.38; }

.defaultBadge {
  font-size: 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}

.statusLabel { flex: 1; font-size: 0.9375rem; font-weight: 500; }
.statusLabel.strikethrough { text-decoration: line-through; }

.statusEditBtn {
  background: none; border: none;
  color: var(--color-text-muted); cursor: pointer;
  padding: 4px; font-size: 14px; flex-shrink: 0;
}
.statusEditBtn:hover { color: var(--color-text); }

.statusDeleteBtn {
  background: none; border: none;
  color: var(--color-danger); cursor: pointer;
  padding: 4px; font-size: 14px; flex-shrink: 0;
  opacity: 0.7;
}
.statusDeleteBtn:hover { opacity: 1; }
```

- [ ] **Step 2: Wire up Statuses tab in `SystemPage.tsx`**

Replace the full `SystemPage.tsx` with the following (all changes relative to current file: add Statuses tab, add `FrontStatusSheet` import, add state/queries/mutations, add status list render, add delete PIN sheet):

```tsx
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import TabBar from '../components/TabBar'
import GroupSheet from '../components/GroupSheet'
import BucketSheet from '../components/BucketSheet'
import TokenSheet from '../components/TokenSheet'
import FrontStatusSheet from '../components/FrontStatusSheet'
import BottomSheet from '../components/BottomSheet'
import { groupsApi } from '../api/groups'
import { bucketsApi } from '../api/buckets'
import { tokensApi } from '../api/tokens'
import { frontStatusesApi } from '../api/frontStatuses'
import type { FrontStatus } from '../api/frontStatuses'
import type { Group, PrivacyBucket } from '../types'
import styles from './SystemPage.module.css'

const TABS = [
  { id: 'Groups', label: 'Groups' },
  { id: 'Buckets', label: 'Buckets' },
  { id: 'Tokens', label: 'Tokens' },
  { id: 'Statuses', label: 'Statuses' },
]
type Tab = 'Groups' | 'Buckets' | 'Tokens' | 'Statuses'
const validTabs = ['Groups', 'Buckets', 'Tokens', 'Statuses'] as const

function bucketName(sortOrder: number, buckets: PrivacyBucket[]): string {
  return buckets.find(b => b.sortOrder === sortOrder)?.name ?? `Level ${sortOrder}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SystemPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab = (validTabs.includes(rawTab as Tab) ? rawTab : 'Groups') as Tab
  function setTab(t: Tab) { setSearchParams({ tab: t }) }

  const queryClient = useQueryClient()

  // ── sheet state ────────────────────────────────────────────────────────
  const [groupSheet, setGroupSheet] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null })
  const [bucketSheet, setBucketSheet] = useState<{ open: boolean; bucket: PrivacyBucket | null }>({ open: false, bucket: null })
  const [tokenSheetOpen, setTokenSheetOpen] = useState(false)
  const [statusSheet, setStatusSheet] = useState<{ open: boolean; status: FrontStatus | null }>({ open: false, status: null })
  const [statusDeleteTarget, setStatusDeleteTarget] = useState<string | null>(null)
  const [statusDeletePin, setStatusDeletePin] = useState('')

  // ── token revoke state ─────────────────────────────────────────────────
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [revokePin, setRevokePin] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // ── queries ────────────────────────────────────────────────────────────
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: buckets = [] } = useQuery({ queryKey: ['buckets'], queryFn: bucketsApi.list })
  const { data: tokens = [], isLoading: tokensLoading, isError: tokensError } = useQuery({
    queryKey: ['tokens'],
    queryFn: tokensApi.list,
    enabled: tab === 'Tokens',
  })
  const { data: statuses = [], isLoading: statusesLoading, isError: statusesError } = useQuery({
    queryKey: ['front-statuses'],
    queryFn: frontStatusesApi.list,
    enabled: tab === 'Statuses',
  })

  // ── mutations ──────────────────────────────────────────────────────────
  const revokeMutation = useMutation({
    mutationFn: () => tokensApi.revoke(revokeTarget!, revokePin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
      setRevokeTarget(null)
      setRevokePin('')
    },
  })

  const statusDeleteMutation = useMutation({
    mutationFn: () => frontStatusesApi.delete(statusDeleteTarget!, statusDeletePin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['front-statuses'] })
      setStatusDeleteTarget(null)
      setStatusDeletePin('')
    },
  })

  function copyUrl(tokenValue: string) {
    navigator.clipboard.writeText(`${window.location.origin}/share/${tokenValue}`)
    setCopiedToken(tokenValue)
    setTimeout(() => setCopiedToken(t => t === tokenValue ? null : t), 2000)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className="eyebrow">Manage</span>
          <h1 className={`pageTitle ${styles.pageTitle}`}><span className="accentWord">System</span></h1>
        </div>
        {tab !== 'Tokens' && (
          <button
            className={styles.addBtn}
            onClick={() => {
              if (tab === 'Groups') setGroupSheet({ open: true, group: null })
              else if (tab === 'Buckets') setBucketSheet({ open: true, bucket: null })
              else if (tab === 'Statuses') setStatusSheet({ open: true, status: null })
            }}
            aria-label={`Add ${tab === 'Groups' ? 'group' : tab === 'Buckets' ? 'bucket' : 'status'}`}
          >
            <Plus size={20} />
          </button>
        )}
      </header>

      <TabBar tabs={[...TABS]} activeTab={tab} onChange={t => setTab(t as Tab)} />

      {tab === 'Groups' && (
        <section className={styles.list}>
          {groups.length === 0 && (
            <p className={styles.empty}>No groups yet. Tap + to create one.</p>
          )}
          {groups.map(g => (
            <button
              key={g.id}
              className={styles.card}
              onClick={() => setGroupSheet({ open: true, group: g })}
            >
              <span className={styles.colorDot} style={{ background: g.color ?? 'var(--color-primary)' }} />
              <span className={styles.cardName}>{g.name}</span>
              <span className={styles.cardCount}>{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </section>
      )}

      {tab === 'Buckets' && (
        <section className={styles.list}>
          {buckets.map(b => (
            <button
              key={b.id}
              className={styles.card}
              onClick={() => setBucketSheet({ open: true, bucket: b })}
            >
              <span className={styles.emoji}>{b.emoji ?? '🪣'}</span>
              <span className={styles.colorBar} style={{ background: b.color ?? 'var(--color-primary)' }} />
              <span className={styles.cardName}>{b.name}</span>
              <span className={styles.cardCount}>{b.memberCount} member{b.memberCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </section>
      )}

      {tab === 'Tokens' && (
        <>
          <div className={styles.tabHeader}>
            <button className={styles.addBtn} onClick={() => setTokenSheetOpen(true)} aria-label="Add token">
              <Plus size={20} />
            </button>
          </div>
          {tokensLoading && <p className={styles.empty} role="status">Loading…</p>}
          {tokensError && <p className={styles.empty}>Failed to load tokens.</p>}
          {!tokensLoading && !tokensError && tokens.length === 0 && (
            <p className={styles.empty}>No share links yet. Create one to share your system.</p>
          )}
          <div className={styles.list}>
            {tokens.filter(t => !t.revokedAt).map(t => (
              <div key={t.tokenValue} className={styles.tokenRow}>
                <div className={styles.tokenInfo}>
                  <span className={styles.tokenLabel}>{t.label ?? 'Untitled'}</span>
                  <div className={styles.tokenMeta}>
                    <span className={styles.badge}>
                      {t.minBucketSortOrder === -1 ? 'Front Only' : bucketName(t.minBucketSortOrder, buckets)}
                    </span>
                    {t.expiresAt && <span className={styles.metaItem}>expires {fmtDate(t.expiresAt)}</span>}
                    {!t.expiresAt && <span className={styles.metaItem}>no expiry</span>}
                    {t.allowsBoardPosting && <span className={styles.metaItem}>board ✓</span>}
                  </div>
                </div>
                <div className={styles.tokenActions}>
                  <button className={styles.copyBtn} onClick={() => copyUrl(t.tokenValue)} aria-label={`Copy URL for ${t.label}`}>
                    {copiedToken === t.tokenValue ? 'Copied!' : '📋 Copy'}
                  </button>
                  <button className={styles.revokeBtn} onClick={() => setRevokeTarget(t.tokenValue)} aria-label={`Revoke ${t.label}`}>
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {tokens.filter(t => t.revokedAt).slice(0, 10).map(t => (
              <div key={t.tokenValue} className={`${styles.tokenRow} ${styles.revoked}`}>
                <span className={styles.tokenLabel}>{t.label ?? 'Untitled'}</span>
                <span className={styles.badge}>revoked</span>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'Statuses' && (
        <section className={styles.list}>
          {statusesLoading && <p className={styles.empty} role="status">Loading…</p>}
          {statusesError && <p className={styles.empty}>Failed to load statuses.</p>}
          {!statusesLoading && !statusesError && statuses.length === 0 && (
            <p className={styles.empty}>No statuses yet.</p>
          )}
          {statuses.map(s => (
            <div
              key={s.id}
              className={`${styles.statusRow} ${s.isHidden ? styles.hiddenStatus : ''}`}
            >
              <span
                className={styles.colorDot}
                style={{ background: s.color ?? 'var(--color-text-muted)' }}
              />
              <span className={`${styles.statusLabel} ${s.isHidden ? styles.strikethrough : ''}`}>
                {s.label}
              </span>
              {s.isDefault && (
                <span className={styles.defaultBadge}>
                  {s.isHidden ? 'default · hidden' : 'default'}
                </span>
              )}
              {!s.isDefault && s.isHidden && (
                <span className={styles.defaultBadge}>hidden</span>
              )}
              <button
                className={styles.statusEditBtn}
                onClick={() => setStatusSheet({ open: true, status: s })}
                aria-label={`Edit ${s.label}`}
              >
                <Pencil size={14} />
              </button>
              {!s.isDefault && (
                <button
                  className={styles.statusDeleteBtn}
                  onClick={() => { setStatusDeleteTarget(s.id); setStatusSheet({ open: false, status: null }) }}
                  aria-label={`Delete ${s.label}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── Sheets ─────────────────────────────────────────────────────── */}
      <GroupSheet
        group={groupSheet.group}
        isOpen={groupSheet.open}
        onClose={() => setGroupSheet({ open: false, group: null })}
      />
      <BucketSheet
        bucket={bucketSheet.bucket}
        isOpen={bucketSheet.open}
        onClose={() => setBucketSheet({ open: false, bucket: null })}
      />
      <TokenSheet isOpen={tokenSheetOpen} onClose={() => setTokenSheetOpen(false)} />
      <FrontStatusSheet
        status={statusSheet.status}
        isOpen={statusSheet.open}
        onClose={() => setStatusSheet({ open: false, status: null })}
        onDeleteRequest={id => { setStatusDeleteTarget(id); setStatusSheet({ open: false, status: null }) }}
      />

      {/* Token revoke confirmation */}
      <BottomSheet isOpen={revokeTarget !== null} onClose={() => { setRevokeTarget(null); setRevokePin('') }} title="Confirm Revoke">
        <p className={styles.revokeHint}>Enter your Gatekeeper PIN to revoke this link.</p>
        <input type="password" className={styles.pinInput} placeholder="PIN" value={revokePin} onChange={e => setRevokePin(e.target.value)} aria-label="Gatekeeper PIN" />
        <div className={styles.revokeActions}>
          <button onClick={() => { setRevokeTarget(null); setRevokePin('') }}>Cancel</button>
          <button onClick={() => revokeMutation.mutate()} disabled={!revokePin.trim() || revokeMutation.isPending} className={styles.revokeBtn} aria-label="Confirm revoke">
            {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </BottomSheet>

      {/* Status delete PIN confirmation */}
      <BottomSheet isOpen={statusDeleteTarget !== null} onClose={() => { setStatusDeleteTarget(null); setStatusDeletePin('') }} title="Delete Status">
        <p className={styles.revokeHint}>Enter your Gatekeeper PIN to permanently delete this status.</p>
        <input type="password" className={styles.pinInput} placeholder="PIN" value={statusDeletePin} onChange={e => setStatusDeletePin(e.target.value)} aria-label="Gatekeeper PIN" />
        <div className={styles.revokeActions}>
          <button onClick={() => { setStatusDeleteTarget(null); setStatusDeletePin('') }}>Cancel</button>
          <button onClick={() => statusDeleteMutation.mutate()} disabled={!statusDeletePin.trim() || statusDeleteMutation.isPending} className={styles.revokeBtn} aria-label="Confirm delete status">
            {statusDeleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

Start the API and frontend:
```bash
# Terminal 1
cd src/PluralHost.Api && dotnet run

# Terminal 2
cd src/PluralHost.Web && npm run dev
```

Navigate to System → Statuses. Verify: 10 statuses listed, pencil opens sheet, save works, + creates a new status, trash on custom status opens PIN sheet.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/components/FrontStatusSheet.tsx \
        src/PluralHost.Web/src/pages/SystemPage.tsx \
        src/PluralHost.Web/src/pages/SystemPage.module.css
git commit -m "feat: Statuses tab on SystemPage with FrontStatusSheet"
```

---

## Task 6: Frontend — SpecsTab field definition `···` menu

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/SpecsTab.module.css`

This task restructures the `.fieldRow` from a flat flex row to a two-zone card (def header + value row), adds the `···` menu, and wires up edit/delete mutations.

- [ ] **Step 1: Update CSS in `SpecsTab.module.css`**

Replace `.fieldRow` and add new classes (keep all other rules unchanged):

```css
/* replace existing .fieldRow rule */
.fieldRow {
  display: flex; flex-direction: column;
  background: #1a1a1a; border: 1px solid #2a2a2a;
  border-radius: 8px; overflow: hidden;
}

/* new */
.defHeader {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 14px;
  border-bottom: 1px solid #222;
}
.defLabel {
  color: #888; font-size: 0.8rem;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.menuBtn {
  background: none; border: none;
  color: var(--color-primary, #b6ff00);
  cursor: pointer; padding: 2px 6px;
  font-size: 1.1rem; line-height: 1;
  letter-spacing: 2px;
}
.valueRow {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px;
}

/* action sheet rows inside BottomSheet */
.actionRow {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 0; border-bottom: 1px solid #2a2a2a;
  cursor: pointer; font-size: 14px; color: var(--color-text);
  background: none; border-left: none; border-right: none; border-top: none;
  width: 100%; text-align: left;
}
.actionRow:last-child { border-bottom: none; }
.actionRow.danger { color: var(--color-danger); }
.actionRow:hover { opacity: 0.8; }

/* edit-def label input */
.defLabelInput {
  width: 100%; box-sizing: border-box;
  background: #222; border: 1px solid var(--color-primary, #b6ff00);
  color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem;
  margin-bottom: 12px;
}
.saveDefBtn {
  background: var(--color-primary, #b6ff00); color: #000;
  border: none; border-radius: 6px; padding: 8px 14px;
  font-weight: 700; cursor: pointer; width: 100%;
}
.saveDefBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

Also remove the old `.fieldName` rule (replaced by `.defLabel`) and update `.fieldValue` and `.fieldInput` to use the new `.valueRow` context — they remain the same rules, just used inside `.valueRow` now.

- [ ] **Step 2: Rewrite `SpecsTab.tsx`**

```tsx
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldsApi } from '../../api/fields'
import BottomSheet from '../BottomSheet'
import type { Member, FieldDef } from '../../types'
import styles from './SpecsTab.module.css'

interface Props { member: Member }

const PRESETS = ['Role', 'Age', 'Interests', 'Triggers', 'Likes', 'Dislikes', 'Trauma', 'Strengths']

export default function SpecsTab({ member }: Props) {
  const qc = useQueryClient()

  // value editing
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  // add-field sheet
  const [sheetOpen, setSheetOpen] = useState(false)
  const [customName, setCustomName] = useState('')

  // ··· menu
  const [menuId, setMenuId] = useState<string | null>(null)

  // edit definition sheet
  const [editDefId, setEditDefId] = useState<string | null>(null)
  const [editDefLabel, setEditDefLabel] = useState('')

  // delete definition confirmation
  const [deleteDefId, setDeleteDefId] = useState<string | null>(null)

  const defsQuery = useQuery({ queryKey: ['field-defs'], queryFn: fieldsApi.listDefs })
  const valuesQuery = useQuery({ queryKey: ['member-fields', member.id], queryFn: () => fieldsApi.getMemberFields(member.id) })

  const upsertMutation = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: string }) =>
      fieldsApi.upsertMemberField(member.id, fieldId, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const deleteMemberFieldMutation = useMutation({
    mutationFn: (fieldId: string) => fieldsApi.deleteMemberField(member.id, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const addDefMutation = useMutation({
    mutationFn: (label: string) => fieldsApi.createDef(label),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['field-defs'] }),
  })

  const updateDefMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      fieldsApi.updateDef(id, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-defs'] })
      setEditDefId(null)
    },
  })

  const deleteDefMutation = useMutation({
    mutationFn: (id: string) => fieldsApi.deleteDef(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-defs'] })
      qc.invalidateQueries({ queryKey: ['member-fields', member.id] })
      setDeleteDefId(null)
    },
  })

  const activeDefs = (defsQuery.data ?? []).filter((d: FieldDef) => d.deletedAt === null)
  const valueMap = new Map((valuesQuery.data ?? []).map(v => [v.fieldId, v]))

  async function handleAddField(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    let fieldId: string
    const existing = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      fieldId = existing.id
    } else {
      const created = await addDefMutation.mutateAsync(trimmed)
      fieldId = created.id
    }
    if (!valueMap.has(fieldId)) {
      await upsertMutation.mutateAsync({ fieldId, value: '' })
    }
    setSheetOpen(false)
    setCustomName('')
  }

  function startValueEdit(fieldId: string, currentValue: string) {
    setEditingFieldId(fieldId)
    setEditVal(currentValue)
  }

  function commitValueEdit(fieldId: string) {
    upsertMutation.mutate({ fieldId, value: editVal })
    setEditingFieldId(null)
  }

  function openMenu(def: FieldDef) {
    setMenuId(def.id)
  }

  function openEditDef(def: FieldDef) {
    setMenuId(null)
    setEditDefId(def.id)
    setEditDefLabel(def.label)
  }

  function openDeleteDef(defId: string) {
    setMenuId(null)
    setDeleteDefId(defId)
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

  const memberDefIds = new Set((valuesQuery.data ?? []).map(v => v.fieldId))
  const menuDef = activeDefs.find((d: FieldDef) => d.id === menuId) ?? null
  const deleteDefLabel = activeDefs.find((d: FieldDef) => d.id === deleteDefId)?.label ?? ''

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={() => setSheetOpen(true)} aria-label="Add spec">
          <Plus size={16} />
        </button>
      </div>

      {activeDefs.length === 0 && (
        <p className={styles.empty}>No specs defined yet. Use + to add the first one.</p>
      )}

      {activeDefs.map((def: FieldDef) => {
        const entry = valueMap.get(def.id)
        const isEditing = editingFieldId === def.id
        return (
          <div key={def.id} className={styles.fieldRow}>
            {/* Definition header row */}
            <div className={styles.defHeader}>
              <span className={styles.defLabel}>{def.label}</span>
              <button
                className={styles.menuBtn}
                onClick={() => openMenu(def)}
                aria-label={`Options for ${def.label}`}
              >
                ···
              </button>
            </div>

            {/* Member value row */}
            <div className={styles.valueRow}>
              {isEditing ? (
                <input
                  className={styles.fieldInput}
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => commitValueEdit(def.id)}
                  onKeyDown={e => e.key === 'Enter' && commitValueEdit(def.id)}
                  autoFocus
                />
              ) : (
                <span
                  className={`${styles.fieldValue} ${!entry?.value ? styles.placeholder : ''}`}
                  onClick={() => startValueEdit(def.id, entry?.value ?? '')}
                >
                  {entry?.value || 'Click to add…'}
                </span>
              )}
              <button
                className={styles.deleteIcon}
                onClick={() => deleteMemberFieldMutation.mutate(def.id)}
                aria-label={`Clear ${def.label} value`}
              >
                🗑
              </button>
            </div>
          </div>
        )
      })}

      {/* Add field sheet */}
      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Spec">
        <p className={styles.presetLabel}>Common fields</p>
        <div className={styles.presets}>
          {PRESETS.map(name => {
            const exists = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === name.toLowerCase())
            const alreadyAssigned = exists && memberDefIds.has(exists.id)
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

      {/* ··· action menu */}
      <BottomSheet
        isOpen={menuId !== null}
        onClose={() => setMenuId(null)}
        title={menuDef?.label ?? ''}
      >
        <button className={styles.actionRow} onClick={() => menuDef && openEditDef(menuDef)}>
          ✏️ Edit definition
        </button>
        <button className={`${styles.actionRow} ${styles.danger}`} onClick={() => menuId && openDeleteDef(menuId)}>
          🗑 Delete definition
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#666' }}>removes from all members</span>
        </button>
      </BottomSheet>

      {/* Edit definition sheet */}
      <BottomSheet
        isOpen={editDefId !== null}
        onClose={() => setEditDefId(null)}
        title="Edit Definition"
      >
        <input
          className={styles.defLabelInput}
          value={editDefLabel}
          onChange={e => setEditDefLabel(e.target.value)}
          placeholder="Field name…"
          onKeyDown={e => e.key === 'Enter' && editDefId && updateDefMutation.mutate({ id: editDefId, label: editDefLabel })}
          autoFocus
        />
        <button
          className={styles.saveDefBtn}
          disabled={!editDefLabel.trim() || updateDefMutation.isPending}
          onClick={() => editDefId && updateDefMutation.mutate({ id: editDefId, label: editDefLabel })}
        >
          {updateDefMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </BottomSheet>

      {/* Delete definition confirmation */}
      <BottomSheet
        isOpen={deleteDefId !== null}
        onClose={() => setDeleteDefId(null)}
        title="Delete Definition"
      >
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Delete <strong style={{ color: 'var(--color-text)' }}>{deleteDefLabel}</strong>?
          This removes the field from all members and cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setDeleteDefId(null)}
            style={{ flex: 1, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px', color: 'var(--color-text)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => deleteDefId && deleteDefMutation.mutate(deleteDefId)}
            disabled={deleteDefMutation.isPending}
            style={{ flex: 1, background: 'var(--color-danger)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: deleteDefMutation.isPending ? 0.5 : 1 }}
          >
            {deleteDefMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all frontend tests pass (any SpecsTab fixture tests should still pass; check for stale field name references if any fail).

- [ ] **Step 5: Smoke test in browser**

On a member with some fields: tap `···` → Edit definition → rename, save → label updates everywhere. Tap `···` → Delete definition → confirm → field disappears. Verify the existing trash icon on the value row still only clears that member's value.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/SpecsTab.tsx \
        src/PluralHost.Web/src/components/tabs/SpecsTab.module.css
git commit -m "feat: SpecsTab field def edit/delete via ··· menu"
```

---

## Final Verification

- [ ] Run full backend test suite: `dotnet test -v minimal` — expect all tests pass
- [ ] Run frontend tests: `cd src/PluralHost.Web && npx vitest run` — expect all tests pass
- [ ] Run TypeScript build: `cd src/PluralHost.Web && npm run build` — no errors
