# Share Token UI Implementation Plan

**Status: COMPLETE (2026-03-29)**

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-featured share token management UI (create, copy, revoke) plus fix the HIGH-severity Gatekeeper PIN query-string security issue.

**Architecture:** Backend fix first (PIN → request body), then frontend-only work. New `TokenSheet` bottom sheet handles creation. System page gets a third "Tokens" tab with full list management. BucketSheet replaces its "coming soon" placeholder with a live token preview that reads from the shared `['tokens']` TanStack Query cache.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, CSS Modules, Vitest + Testing Library, .NET 8 / ASP.NET Core, xUnit + Moq, React Router v6 (`useSearchParams`)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/PluralHost.Api/Controllers/TokensController.cs` | Move PIN from `[FromQuery]` to `[FromBody]` |
| Modify | `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs` | Update revoke tests for body PIN |
| Modify | `src/PluralHost.Web/src/types.ts` | Add `AccessToken`, `TokenCreatePayload` |
| Create | `src/PluralHost.Web/src/api/tokens.ts` | CRUD calls to `/api/tokens` |
| Create | `src/PluralHost.Web/src/components/TokenSheet.tsx` | Create token bottom sheet |
| Create | `src/PluralHost.Web/src/components/TokenSheet.module.css` | Styles for TokenSheet |
| Create | `src/PluralHost.Web/src/__tests__/TokenSheet.test.tsx` | Tests for TokenSheet |
| Modify | `src/PluralHost.Web/src/pages/SystemPage.tsx` | Add Tokens tab + `useSearchParams` deep-link |
| Modify | `src/PluralHost.Web/src/components/BucketSheet.tsx` | Replace placeholder with token preview |

---

## Task 1: Backend — move PIN to request body

**Files:**
- Modify: `src/PluralHost.Api/Controllers/TokensController.cs` (line 45)
- Modify: `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs`

**Context:** `PinRequest` is defined in `SecureActionController.cs` as `public record PinRequest(string Pin)` — same assembly, already usable in `TokensController`. The existing tests call `RevokeAsync(tokenValue, pin)` with two string args; after the fix, the second arg becomes a `PinRequest`.

- [ ] **Step 1: Update `RevokeAsync` in `TokensController.cs`**

Replace the method:

```csharp
[HttpDelete("{tokenValue}")]
public async Task<IActionResult> RevokeAsync(string tokenValue, [FromQuery] string pin)
{
    if (!await gatekeeper.ValidatePinAsync(pin))
        return Forbid();

    var revoked = await tokenService.RevokeTokenAsync(tokenValue);
    return revoked ? Ok() : NotFound();
}
```

With:

```csharp
[HttpDelete("{tokenValue}")]
public async Task<IActionResult> RevokeAsync(string tokenValue, [FromBody] PinRequest body)
{
    if (body is null || string.IsNullOrWhiteSpace(body.Pin))
        return BadRequest(new { error = "PIN is required" });

    if (!await gatekeeper.ValidatePinAsync(body.Pin))
        return Forbid();

    var revoked = await tokenService.RevokeTokenAsync(tokenValue);
    return revoked ? Ok() : NotFound();
}
```

- [ ] **Step 2: Update tests in `TokensControllerTests.cs`**

Find the three revoke test methods (around line 92). Update each call from `RevokeAsync(tokenValue, pinString)` to `RevokeAsync(tokenValue, new PinRequest(pinString))`.

Also add a new test for the missing-body case:

```csharp
[Fact]
public async Task Revoke_MissingPin_Returns400()
{
    var result = await _controller.RevokeAsync("anytoken", new PinRequest(""));
    Assert.IsType<BadRequestObjectResult>(result);
}
```

- [ ] **Step 3: Run backend tests**

```bash
cd /c/dev/simply-personal && dotnet test tests/PluralHost.Tests --filter "TokensController" -v minimal 2>&1 | tail -10
```

Expected: all tokens controller tests pass.

- [ ] **Step 4: Run full backend test suite**

```bash
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -5
```

Expected: all tests pass (291+).

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/TokensController.cs \
        tests/PluralHost.Tests/Controllers/TokensControllerTests.cs
git commit -m "fix: move Gatekeeper PIN from query string to request body in token revoke"
```

---

## Task 2: Frontend types + API module

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`
- Create: `src/PluralHost.Web/src/api/tokens.ts`

- [ ] **Step 1: Add types to `src/PluralHost.Web/src/types.ts`**

Append at the end of the file:

```ts
export interface AccessToken {
  tokenValue: string
  label: string | null
  minBucketSortOrder: number   // -1 = ReadFrontOnly sentinel
  allowsBoardPosting: boolean
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface TokenCreatePayload {
  label: string
  minBucketSortOrder: number
  allowsBoardPosting: boolean
  expiresAt?: string           // ISO 8601 UTC string, omit for "never"
}
```

- [ ] **Step 2: Create `src/PluralHost.Web/src/api/tokens.ts`**

```ts
import { apiFetch } from './client'
import type { AccessToken, TokenCreatePayload } from '../types'

export const tokensApi = {
  list: (): Promise<AccessToken[]> =>
    apiFetch<AccessToken[]>('/api/tokens'),

  create: (body: TokenCreatePayload): Promise<AccessToken> =>
    apiFetch<AccessToken>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  revoke: (tokenValue: string, pin: string): Promise<void> =>
    apiFetch<void>(`/api/tokens/${tokenValue}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    }),
}
```

- [ ] **Step 3: Build to verify**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npm run build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/types.ts src/PluralHost.Web/src/api/tokens.ts
git commit -m "feat: add AccessToken types and tokens API module"
```

---

## Task 3: TokenSheet component (TDD)

**Files:**
- Create: `src/PluralHost.Web/src/__tests__/TokenSheet.test.tsx`
- Create: `src/PluralHost.Web/src/components/TokenSheet.module.css`
- Create: `src/PluralHost.Web/src/components/TokenSheet.tsx`

**Context:** TokenSheet is a `BottomSheet` wrapping a create form. It fetches buckets from `['buckets']` query for the access level list. `minBucketSortOrder = -1` maps to the "Front Only" option. Board posting toggle is hidden when Front Only is selected. Default expiry is "Never".

- [ ] **Step 1: Write failing tests**

Create `src/PluralHost.Web/src/__tests__/TokenSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TokenSheet from '../components/TokenSheet'
import type { PrivacyBucket } from '../types'

vi.mock('../api/tokens', () => ({
  tokensApi: {
    create: vi.fn().mockResolvedValue({
      tokenValue: 'abc', label: 'Test', minBucketSortOrder: 1,
      allowsBoardPosting: false, expiresAt: null, revokedAt: null, createdAt: '',
    }),
  },
}))

vi.mock('../api/buckets', () => ({
  bucketsApi: { list: vi.fn().mockResolvedValue([]) },
}))

const mockBuckets: PrivacyBucket[] = [
  { id: '1', name: 'Public', description: null, emoji: null, color: null, sortOrder: 0, isDefault: true, memberCount: 0 },
  { id: '2', name: 'Friend', description: null, emoji: null, color: null, sortOrder: 1, isDefault: true, memberCount: 0 },
]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('TokenSheet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when closed', () => {
    wrap(<TokenSheet isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders form when open', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/friend link/i)).toBeInTheDocument()
  })

  it('disables Create when label is empty', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled()
  })

  it('enables Create when label is filled', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/friend link/i), { target: { value: 'My Link' } })
    expect(screen.getByRole('button', { name: /create/i })).not.toBeDisabled()
  })

  it('shows bucket options when buckets loaded', async () => {
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(await screen.findByText('Public')).toBeInTheDocument()
    expect(screen.getByText('Friend')).toBeInTheDocument()
  })

  it('shows Front Only option', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(screen.getByText(/front only/i)).toBeInTheDocument()
  })

  it('hides board posting toggle when Front Only selected', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    // Front Only is default — board posting should not be visible
    expect(screen.queryByLabelText(/board posting/i)).not.toBeInTheDocument()
  })

  it('shows board posting toggle when a bucket is selected', async () => {
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    await screen.findByText('Public')
    fireEvent.click(screen.getByText('Public'))
    expect(screen.getByLabelText(/board posting/i)).toBeInTheDocument()
  })

  it('calls tokensApi.create with correct payload on submit', async () => {
    const { tokensApi } = await import('../api/tokens')
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    const onClose = vi.fn()
    wrap(<TokenSheet isOpen onClose={onClose} />)
    await screen.findByText('Public')
    fireEvent.click(screen.getByText('Public'))
    fireEvent.change(screen.getByPlaceholderText(/friend link/i), { target: { value: 'My Link' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(tokensApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'My Link', minBucketSortOrder: 0 })
    ))
  })

  it('calls onClose after successful create', async () => {
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    const onClose = vi.fn()
    wrap(<TokenSheet isOpen onClose={onClose} />)
    await screen.findByText('Public')
    fireEvent.click(screen.getByText('Public'))
    fireEvent.change(screen.getByPlaceholderText(/friend link/i), { target: { value: 'My Link' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('selecting a preset chip clears the custom date input', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    // Open custom date by clicking calendar chip
    fireEvent.click(screen.getByRole('button', { name: /custom date/i }))
    expect(screen.getByDisplayValue('')).toBeInTheDocument() // date input visible
    // Select a preset chip — custom date input should disappear
    fireEvent.click(screen.getByRole('button', { name: /30 days/i }))
    expect(screen.queryByDisplayValue('')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests -- expect failures**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run src/__tests__/TokenSheet.test.tsx 2>&1 | tail -8
```

Expected: all fail (component doesn't exist yet).

- [ ] **Step 3: Create `TokenSheet.module.css`**

```css
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
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

.accessList {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.accessOption {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.accessOption.selected {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.accessDesc {
  font-size: 11px;
  color: var(--color-text-muted);
}

.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chip {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--color-text-muted);
  cursor: pointer;
}

.chip.selected {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.dateInput {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--color-text);
  font-size: 13px;
  margin-top: 8px;
  width: 100%;
  box-sizing: border-box;
}

.toggleRow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}

.createBtn {
  background: var(--color-primary);
  color: #000;
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.createBtn:disabled {
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
```

- [ ] **Step 4: Create `TokenSheet.tsx`**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import BottomSheet from './BottomSheet'
import { tokensApi } from '../api/tokens'
import { bucketsApi } from '../api/buckets'
import type { PrivacyBucket } from '../types'
import styles from './TokenSheet.module.css'

const FRONT_ONLY = -1

type ExpiryPreset = '7d' | '30d' | '90d' | 'never' | 'custom'

function computeExpiresAt(preset: ExpiryPreset, customDate: string): string | undefined {
  if (preset === 'never') return undefined
  if (preset === 'custom' && customDate) {
    // End-of-day UTC for the selected date (YYYY-MM-DD → ISO 8601)
    return new Date(customDate + 'T23:59:59Z').toISOString()
  }
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function TokenSheet({ isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [accessLevel, setAccessLevel] = useState<number>(FRONT_ONLY)
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>('never')
  const [customDate, setCustomDate] = useState('')
  const [allowsBoardPosting, setAllowsBoardPosting] = useState(false)

  const { data: buckets = [] } = useQuery({
    queryKey: ['buckets'],
    queryFn: bucketsApi.list,
  })

  const mutation = useMutation({
    mutationFn: () => tokensApi.create({
      label,
      minBucketSortOrder: accessLevel,
      allowsBoardPosting: accessLevel === FRONT_ONLY ? false : allowsBoardPosting,
      expiresAt: computeExpiresAt(expiryPreset, customDate),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tokens'] })
      resetAndClose()
    },
  })

  function resetAndClose() {
    setLabel('')
    setAccessLevel(FRONT_ONLY)
    setExpiryPreset('never')
    setCustomDate('')
    setAllowsBoardPosting(false)
    onClose()
  }

  function selectPreset(p: ExpiryPreset) {
    setExpiryPreset(p)
    if (p !== 'custom') setCustomDate('')
  }

  const isFrontOnly = accessLevel === FRONT_ONLY

  return (
    <BottomSheet isOpen={isOpen} onClose={resetAndClose} title="New Share Link">
      {/* Label */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="token-label">Label</label>
        <input
          id="token-label"
          className={styles.input}
          placeholder="e.g. Friend Link"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
      </div>

      {/* Access Level */}
      <div className={styles.field}>
        <div className={styles.label}>Access Level</div>
        <div className={styles.accessList}>
          <div
            className={`${styles.accessOption} ${isFrontOnly ? styles.selected : ''}`}
            onClick={() => setAccessLevel(FRONT_ONLY)}
          >
            Front Only
            <span className={styles.accessDesc}>Who's fronting, no member list</span>
          </div>
          {(buckets as PrivacyBucket[]).map(b => (
            <div
              key={b.id}
              className={`${styles.accessOption} ${accessLevel === b.sortOrder ? styles.selected : ''}`}
              onClick={() => setAccessLevel(b.sortOrder)}
            >
              {b.name}
            </div>
          ))}
        </div>
      </div>

      {/* Expiry */}
      <div className={styles.field}>
        <div className={styles.label}>Expires</div>
        <div className={styles.chips}>
          {(['7d', '30d', '90d', 'never'] as ExpiryPreset[]).map(p => (
            <button
              key={p}
              className={`${styles.chip} ${expiryPreset === p ? styles.selected : ''}`}
              onClick={() => selectPreset(p)}
            >
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : p === '90d' ? '90 days' : 'Never'}
            </button>
          ))}
          <button
            className={`${styles.chip} ${expiryPreset === 'custom' ? styles.selected : ''}`}
            onClick={() => selectPreset('custom')}
            aria-label="Custom date"
          >
            📅
          </button>
        </div>
        {expiryPreset === 'custom' && (
          <input
            type="date"
            className={styles.dateInput}
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
          />
        )}
      </div>

      {/* Board posting toggle -- hidden for Front Only */}
      {!isFrontOnly && (
        <label className={styles.toggleRow} aria-label="Allow board posting">
          <input
            type="checkbox"
            checked={allowsBoardPosting}
            onChange={e => setAllowsBoardPosting(e.target.checked)}
          />
          Allow board posting
        </label>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={resetAndClose}>Cancel</button>
        <button
          className={styles.createBtn}
          onClick={() => mutation.mutate()}
          disabled={!label.trim() || mutation.isPending}
          aria-label="Create token"
        >
          {mutation.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 5: Run tests -- expect pass**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run src/__tests__/TokenSheet.test.tsx 2>&1 | tail -8
```

Expected: all 9 tests pass.

- [ ] **Step 6: Build**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/components/TokenSheet.tsx \
        src/PluralHost.Web/src/components/TokenSheet.module.css \
        src/PluralHost.Web/src/__tests__/TokenSheet.test.tsx
git commit -m "feat: add TokenSheet create form with access level, expiry, board posting"
```

---

## Task 4: System Page — Tokens tab

**Files:**
- Modify: `src/PluralHost.Web/src/pages/SystemPage.tsx`

**Context:** Current SystemPage uses `useState<Tab>('Groups')` for tab state. We need to switch to `useSearchParams` so `/system?tab=Tokens` deep-links from BucketSheet work. The Tokens tab renders the token list, copy-URL button, and revoke flow (PIN confirmation sheet).

- [ ] **Step 1: Read `SystemPage.tsx` to understand current structure**

The file uses: `useState`, `useQuery` (groups + buckets), `useMutation`, `TabBar`, `BottomSheet`, `GroupSheet`, `BucketSheet`. Tabs are `['Groups', 'Buckets']` as a `const` array.

- [ ] **Step 2: Update `SystemPage.tsx`**

Replace the file with the updated version that:

1. Adds `useSearchParams` import from `react-router-dom`
2. Adds `'Tokens'` to the `TABS` const and `Tab` type
3. Replaces `useState<Tab>('Groups')` with `useSearchParams`-based active tab:

```tsx
const [searchParams, setSearchParams] = useSearchParams()
const rawTab = searchParams.get('tab')
const validTabs = ['Groups', 'Buckets', 'Tokens'] as const
const tab = (validTabs.includes(rawTab as Tab) ? rawTab : 'Groups') as Tab
function setTab(t: Tab) { setSearchParams({ tab: t }) }
```

4. Adds tokens query:

```tsx
const { data: tokens = [], isLoading: tokensLoading, isError: tokensError } = useQuery({
  queryKey: ['tokens'],
  queryFn: tokensApi.list,
  enabled: tab === 'Tokens',
})
```

5. Adds state for token sheet and revoke PIN confirmation:

```tsx
const [tokenSheetOpen, setTokenSheetOpen] = useState(false)
const [revokeTarget, setRevokeTarget] = useState<string | null>(null)  // tokenValue
const [revokePin, setRevokePin] = useState('')
```

6. Adds revoke mutation:

```tsx
const revokeMutation = useMutation({
  mutationFn: () => tokensApi.revoke(revokeTarget!, revokePin),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tokens'] })
    setRevokeTarget(null)
    setRevokePin('')
  },
})
```

7. Adds a `copyUrl` helper:

```tsx
const [copiedToken, setCopiedToken] = useState<string | null>(null)
function copyUrl(tokenValue: string) {
  navigator.clipboard.writeText(`${window.location.origin}/share/${tokenValue}`)
  setCopiedToken(tokenValue)
  setTimeout(() => setCopiedToken(t => t === tokenValue ? null : t), 2000)
}
```

8. Renders the Tokens tab content inside the existing tab switch.

9. Adds `<TokenSheet isOpen={tokenSheetOpen} onClose={() => setTokenSheetOpen(false)} />` and a PIN confirmation `<BottomSheet>` for revoke.

The Tokens tab render block:

```tsx
{tab === 'Tokens' && (
  <>
    {tokensLoading && <p className={styles.empty}>Loading…</p>}
    {tokensError && <p className={styles.empty}>Failed to load tokens.</p>}
    {!tokensLoading && !tokensError && tokens.length === 0 && (
      <p className={styles.empty}>No share links yet.</p>
    )}
    <div className={styles.list}>
      {(tokens as AccessToken[])
        .filter(t => !t.revokedAt)
        .map(t => (
          <div key={t.tokenValue} className={styles.tokenRow}>
            <div className={styles.tokenInfo}>
              <span className={styles.tokenLabel}>{t.label ?? 'Untitled'}</span>
              <div className={styles.tokenMeta}>
                <span className={styles.badge}>
                  {t.minBucketSortOrder === -1 ? 'Front Only' : bucketName(t.minBucketSortOrder, buckets as PrivacyBucket[])}
                </span>
                {t.expiresAt && <span className={styles.metaItem}>expires {fmtDate(t.expiresAt)}</span>}
                {!t.expiresAt && <span className={styles.metaItem}>no expiry</span>}
                {t.allowsBoardPosting && <span className={styles.metaItem}>board ✓</span>}
              </div>
            </div>
            <div className={styles.tokenActions}>
              <button
                className={styles.copyBtn}
                onClick={() => copyUrl(t.tokenValue)}
                aria-label={`Copy URL for ${t.label}`}
              >
                {copiedToken === t.tokenValue ? 'Copied!' : '📋 Copy'}
              </button>
              <button
                className={styles.revokeBtn}
                onClick={() => setRevokeTarget(t.tokenValue)}
                aria-label={`Revoke ${t.label}`}
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      {/* Revoked tokens -- dimmed, max 10 */}
      {(tokens as AccessToken[])
        .filter(t => t.revokedAt)
        .slice(0, 10)
        .map(t => (
          <div key={t.tokenValue} className={`${styles.tokenRow} ${styles.revoked}`}>
            <span className={styles.tokenLabel}>{t.label ?? 'Untitled'}</span>
            <span className={styles.badge}>revoked</span>
          </div>
        ))}
    </div>
  </>
)}
```

Helper functions (add before the component):

```tsx
function bucketName(sortOrder: number, buckets: PrivacyBucket[]): string {
  return buckets.find(b => b.sortOrder === sortOrder)?.name ?? `Level ${sortOrder}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
```

Add CSS classes to `SystemPage.module.css` (or whatever CSS module SystemPage uses):

```css
.tokenRow {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.tokenRow.revoked {
  opacity: 0.4;
}

.tokenInfo {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tokenLabel {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.tokenMeta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.badge {
  font-size: 11px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--color-primary);
}

.metaItem {
  font-size: 11px;
  color: var(--color-text-muted);
}

.tokenActions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.copyBtn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.revokeBtn {
  background: none;
  border: none;
  color: var(--color-danger);
  font-size: 12px;
  cursor: pointer;
}
```

PIN confirmation sheet (add near the bottom of the JSX, before `</>`):

```tsx
<BottomSheet
  isOpen={revokeTarget !== null}
  onClose={() => { setRevokeTarget(null); setRevokePin('') }}
  title="Confirm Revoke"
>
  <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginBottom: 12 }}>
    Enter your Gatekeeper PIN to revoke this link.
  </p>
  <input
    type="password"
    className={styles.pinInput}
    placeholder="PIN"
    value={revokePin}
    onChange={e => setRevokePin(e.target.value)}
    aria-label="Gatekeeper PIN"
  />
  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
    <button onClick={() => { setRevokeTarget(null); setRevokePin('') }}>Cancel</button>
    <button
      onClick={() => revokeMutation.mutate()}
      disabled={!revokePin.trim() || revokeMutation.isPending}
      style={{ color: 'var(--color-danger)' }}
      aria-label="Confirm revoke"
    >
      {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
    </button>
  </div>
</BottomSheet>
```

Also add `.pinInput` CSS:

```css
.pinInput {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--color-text);
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}
```

- [ ] **Step 3: Build to verify no type errors**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npm run build 2>&1 | tail -8
```

Expected: clean build.

- [ ] **Step 4: Run frontend tests**

```bash
npx vitest run 2>&1 | tail -8
```

Expected: all pass (existing tests should not regress; `useSearchParams` must be available in the test environment via `MemoryRouter`).

**Note:** If existing SystemPage tests fail because they render SystemPage inside `MemoryRouter` but don't provide a `?tab=` param, the component will correctly default to 'Groups' -- tests should still pass. If `useSearchParams` throws outside a router, wrap the component in `<MemoryRouter>` in any new SystemPage tests.

- [ ] **Step 5: Add SystemPage Tokens tab tests**

Extend (or create) `src/PluralHost.Web/src/__tests__/SystemPage.test.tsx` with these cases. The component needs `MemoryRouter` wrapping (it uses `useSearchParams`):

```tsx
vi.mock('../api/tokens', () => ({
  tokensApi: {
    list: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue(undefined),
  },
}))

// wrap helper must include MemoryRouter — check existing SystemPage tests;
// if they already use MemoryRouter, add these cases alongside existing ones.
// If not, use: <MemoryRouter initialEntries={['/system?tab=Tokens']}> wrapper.

it('Tokens tab renders token list', async () => {
  const { tokensApi } = await import('../api/tokens')
  vi.mocked(tokensApi.list).mockResolvedValue([
    { tokenValue: 'tok1', label: 'My Link', minBucketSortOrder: 0,
      allowsBoardPosting: false, expiresAt: null, revokedAt: null, createdAt: '' },
  ])
  // render SystemPage with ?tab=Tokens active
  // assert 'My Link' is visible
})

it('copy button shows Copied! then reverts', async () => {
  // render with a token, click the copy button
  // assert aria-label or button text changes to 'Copied!'
  // (2s revert can be tested with vi.useFakeTimers if desired)
})

it('revoke button opens PIN sheet', async () => {
  // render with an active token, click Revoke
  // assert PIN input appears (role=dialog or aria-label="Gatekeeper PIN")
})
```

Fill in the wrapper and assertions using the same pattern as the existing `LogsPage.test.tsx` tests.

- [ ] **Step 6: Run tests**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run src/__tests__/SystemPage.test.tsx 2>&1 | tail -8
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/pages/SystemPage.tsx src/PluralHost.Web/src/pages/SystemPage.module.css \
        src/PluralHost.Web/src/__tests__/SystemPage.test.tsx
git commit -m "feat: add Tokens tab to System page with list, copy, and revoke"
```

---

## Task 5: BucketSheet — token preview section

**Files:**
- Modify: `src/PluralHost.Web/src/components/BucketSheet.tsx`
- Modify: `src/PluralHost.Web/src/components/BucketSheet.module.css`

**Context:** BucketSheet.tsx currently has a placeholder `<p className={styles.futureNote}>Share token integration coming soon.</p>`. Replace it with a live token preview section. BucketSheet calls its own `useQuery(['tokens'])` -- TanStack Query deduplicates against the Tokens tab if both are mounted.

- [ ] **Step 1: Read `BucketSheet.tsx` to find the placeholder and understand component structure**

Search for the text `"Share token integration coming soon."` in the file to find the exact location.

- [ ] **Step 2: Add tokens query to `BucketSheet.tsx`**

Add these imports:

```tsx
import { useNavigate } from 'react-router-dom'
import { tokensApi } from '../api/tokens'
import type { AccessToken } from '../types'
```

Add inside the component (alongside existing queries):

```tsx
const navigate = useNavigate()
const { data: allTokens = [] } = useQuery({
  queryKey: ['tokens'],
  queryFn: tokensApi.list,
})

const bucketTokens = (allTokens as AccessToken[]).filter(
  t => !t.revokedAt && t.minBucketSortOrder === (bucket?.sortOrder ?? -999)
)

const [copiedToken, setCopiedToken] = useState<string | null>(null)
function copyUrl(tokenValue: string) {
  navigator.clipboard.writeText(`${window.location.origin}/share/${tokenValue}`)
  setCopiedToken(tokenValue)
  setTimeout(() => setCopiedToken(v => v === tokenValue ? null : v), 2000)
}
```

- [ ] **Step 3: Replace the placeholder**

Find the line:
```tsx
<p className={styles.futureNote}>Share token integration coming soon.</p>
```

Replace with:

```tsx
<div className={styles.tokenSection}>
  <div className={styles.sectionLabel}>Share Links</div>
  {bucketTokens.length === 0 ? (
    <p className={styles.tokenEmpty}>No links for this bucket yet.</p>
  ) : (
    <div className={styles.tokenList}>
      {bucketTokens.map(t => (
        <div key={t.tokenValue} className={styles.tokenPreviewRow}>
          <span className={styles.tokenPreviewLabel}>{t.label ?? 'Untitled'}</span>
          <button
            className={styles.tokenCopyBtn}
            onClick={() => copyUrl(t.tokenValue)}
            aria-label={`Copy URL for ${t.label}`}
          >
            {copiedToken === t.tokenValue ? 'Copied!' : '📋 Copy'}
          </button>
        </div>
      ))}
    </div>
  )}
  <button
    className={styles.manageLink}
    onClick={() => navigate('/system?tab=Tokens')}
  >
    Manage in Tokens tab →
  </button>
</div>
```

- [ ] **Step 4: Add CSS to `BucketSheet.module.css`**

```css
.tokenSection {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
}

.sectionLabel {
  font-size: 11px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.tokenEmpty {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0 0 8px;
}

.tokenList {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.tokenPreviewRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tokenPreviewLabel {
  font-size: 13px;
  color: var(--color-text);
}

.tokenCopyBtn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
}

.manageLink {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-top: 4px;
}

.manageLink:hover {
  color: var(--color-text);
}
```

- [ ] **Step 5: Build to verify**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/BucketSheet.tsx \
        src/PluralHost.Web/src/components/BucketSheet.module.css
git commit -m "feat: replace BucketSheet token placeholder with live token preview"
```

---

## Task 6: Full test run + final commit

- [ ] **Step 1: Run all frontend tests**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npx vitest run 2>&1 | tail -8
```

Expected: all tests pass.

- [ ] **Step 2: Run all backend tests**

```bash
cd /c/dev/simply-personal && dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 3: Final build**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Plan 9 complete -- Share Token UI with Tokens tab, TokenSheet, BucketSheet preview"
```

---

## Verification Checklist

Before marking complete, verify manually:

- [ ] Backend: `DELETE /api/tokens/{value}` with PIN in body revokes correctly
- [ ] Backend: `DELETE /api/tokens/{value}?pin=...` (old format) no longer works (returns 400)
- [ ] System page `/system?tab=Tokens` renders Tokens tab directly
- [ ] Tokens tab: active tokens show label, access badge, expiry, copy button, revoke button
- [ ] Tokens tab: revoked tokens appear dimmed (max 10)
- [ ] Copy button: shows "Copied!" for 2 seconds then reverts
- [ ] Revoke: PIN sheet appears, revoke calls backend with PIN in body
- [ ] TokenSheet: Front Only is default; board posting toggle hidden
- [ ] TokenSheet: selecting a bucket shows board posting toggle
- [ ] TokenSheet: Create disabled until label filled
- [ ] TokenSheet: "Never" expiry sends no `expiresAt`; custom date sends ISO 8601 UTC
- [ ] BucketSheet: shows active tokens for that bucket's sortOrder
- [ ] BucketSheet: "Manage in Tokens tab →" navigates to `/system?tab=Tokens`
- [ ] `npx vitest run` -- all tests pass
- [ ] `npm run build` -- clean
