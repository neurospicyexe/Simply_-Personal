# 24h Front Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add swimlane heatmap visualizations showing who fronted over a time window — a compact 24h strip on FrontPage and a full 24h/7d/30d view as a new Heatmap tab on LogsPage.

**Architecture:** Add optional `?from`/`?to` ISO 8601 query params to the existing `GET /v1/frontHistory` endpoint for date-range filtering. Two new frontend components (`HeatmapStrip`, `FrontHeatmap`) compute swimlane positions client-side from the SP envelope format. No new backend controllers or DB changes.

**Tech Stack:** .NET 8 / ASP.NET Core, EF Core 8, React 18 + TypeScript, TanStack Query, CSS Modules, react-router-dom v6 `useSearchParams`

---

## File Map

**Backend — Modify:**
- `src/PluralHost.Api/Controllers/SpFrontController.cs` — add `from`/`to` params to `GetHistoryAsync`
- `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs` — add 3 filtering tests

**Frontend — Create:**
- `src/PluralHost.Web/src/components/HeatmapStrip.tsx`
- `src/PluralHost.Web/src/components/HeatmapStrip.module.css`
- `src/PluralHost.Web/src/components/FrontHeatmap.tsx`
- `src/PluralHost.Web/src/components/FrontHeatmap.module.css`

**Frontend — Modify:**
- `src/PluralHost.Web/src/api/front.ts` — add `historyInRange(from, to)`
- `src/PluralHost.Web/src/pages/FrontPage.tsx` — add `<HeatmapStrip />`
- `src/PluralHost.Web/src/pages/FrontPage.module.css` — strip divider style
- `src/PluralHost.Web/src/pages/LogsPage.tsx` — add Heatmap tab + `useSearchParams` deep-link
- `src/PluralHost.Web/src/pages/LogsPage.module.css` — toggle pill styles

---

## Task 1: Backend — date-range filtering on `GET /v1/frontHistory`

**Files:**
- Modify: `src/PluralHost.Api/Controllers/SpFrontController.cs`
- Test: `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs`

### Context

`SpFrontController.GetHistoryAsync()` currently fetches all `FrontHistory` rows with no filtering.
Overlap filter: an entry overlaps `[from, to]` when `FrontStart < ceiling && (FrontEnd == null || FrontEnd > from)` where `ceiling = to ?? DateTime.UtcNow`.

- [ ] **Step 1: Write the failing tests**

Add these three tests to `SpFrontControllerTests.cs`:

```csharp
[Fact]
public async Task GetHistory_WithFromParam_ReturnsOverlappingEntries()
{
    var m = await AddMemberAsync();
    var now = DateTime.UtcNow;
    // Entry inside window
    _context.FrontHistory.Add(new FrontHistory
    {
        MemberId = m.Id,
        FrontStart = now.AddHours(-12),
        FrontEnd = now.AddHours(-6)
    });
    // Entry outside window (too old)
    _context.FrontHistory.Add(new FrontHistory
    {
        MemberId = m.Id,
        FrontStart = now.AddHours(-30),
        FrontEnd = now.AddHours(-26)
    });
    await _context.SaveChangesAsync();

    var from = now.AddHours(-24);
    var result = await _controller.GetHistoryAsync(from, null) as OkObjectResult;
    var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value).ToList();
    Assert.Single(items);
}

[Fact]
public async Task GetHistory_OngoingEntry_IncludedWhenFromProvided()
{
    var m = await AddMemberAsync();
    var now = DateTime.UtcNow;
    // Ongoing entry started within window
    _context.FrontHistory.Add(new FrontHistory
    {
        MemberId = m.Id,
        FrontStart = now.AddHours(-2)
        // FrontEnd = null (ongoing)
    });
    await _context.SaveChangesAsync();

    var from = now.AddHours(-24);
    var result = await _controller.GetHistoryAsync(from, null) as OkObjectResult;
    var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value).ToList();
    Assert.Single(items);
}

[Fact]
public async Task GetHistory_NoParams_ReturnsAllEntries()
{
    var m = await AddMemberAsync();
    var now = DateTime.UtcNow;
    _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id, FrontStart = now.AddDays(-60), FrontEnd = now.AddDays(-59) });
    _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id, FrontStart = now.AddHours(-1) });
    await _context.SaveChangesAsync();

    var result = await _controller.GetHistoryAsync(null, null) as OkObjectResult;
    var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value).ToList();
    Assert.Equal(2, items.Count);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
dotnet test --filter "GetHistory_WithFromParam|GetHistory_OngoingEntry|GetHistory_NoParams" -v minimal
```

Expected: 3 failures (method signature mismatch or no `from`/`to` params yet)

- [ ] **Step 3: Update `GetHistoryAsync` to accept `from`/`to` params**

Replace in `src/PluralHost.Api/Controllers/SpFrontController.cs`:

```csharp
// GET /v1/frontHistory — all entries
[HttpGet("v1/frontHistory")]
public async Task<IActionResult> GetHistoryAsync()
{
    var history = await context.FrontHistory
        .Include(f => f.CustomStatus)
        .ToListAsync();
    return Ok(history.Select(ToEnvelope));
}
```

With:

```csharp
// GET /v1/frontHistory — all entries, optionally filtered by ?from=&to= (ISO 8601)
[HttpGet("v1/frontHistory")]
public async Task<IActionResult> GetHistoryAsync(
    [FromQuery] DateTime? from = null,
    [FromQuery] DateTime? to = null)
{
    var query = context.FrontHistory
        .Include(f => f.CustomStatus)
        .AsQueryable();

    if (from.HasValue)
    {
        var ceiling = to ?? DateTime.UtcNow.AddSeconds(1);
        query = query.Where(f =>
            f.FrontStart < ceiling &&
            (f.FrontEnd == null || f.FrontEnd > from.Value));
    }

    var history = await query.ToListAsync();
    return Ok(history.Select(ToEnvelope));
}
```

- [ ] **Step 4: Run all backend tests**

```bash
dotnet test --filter "SpFrontControllerTests" -v minimal
```

Expected: all SpFrontControllerTests pass

- [ ] **Step 5: Run full suite**

```bash
dotnet test 2>&1 | tail -3
```

Expected: `Passed! - Failed: 0`

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/SpFrontController.cs tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs
git commit -m "feat: from/to date filtering on GET /v1/frontHistory"
```

---

## Task 2: Frontend API — `frontApi.historyInRange`

**Files:**
- Modify: `src/PluralHost.Web/src/api/front.ts`
- Test: `src/PluralHost.Web/src/__tests__/front-api.test.ts` (create)

### Context

`frontApi` is in `src/PluralHost.Web/src/api/front.ts`. Add a method that passes `from`/`to` as ISO 8601 strings. No existing tests for this file — write a simple unit test.

- [ ] **Step 1: Write the failing test**

Create `src/PluralHost.Web/src/__tests__/front-api.test.ts`:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock apiFetch before importing frontApi
vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../api/client'
import { frontApi } from '../api/front'

describe('frontApi.historyInRange', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls /v1/frontHistory with from and to params', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const from = '2026-03-28T00:00:00.000Z'
    const to   = '2026-03-29T00:00:00.000Z'
    await frontApi.historyInRange(from, to)
    expect(apiFetch).toHaveBeenCalledWith(
      `/v1/frontHistory?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/front-api.test.ts
```

Expected: FAIL — `frontApi.historyInRange is not a function`

- [ ] **Step 3: Add `historyInRange` to `front.ts`**

Add after the `history` entry in `src/PluralHost.Web/src/api/front.ts`:

```typescript
  historyInRange: (from: string, to: string) =>
    apiFetch<SpEnvelope<FrontContent>[]>(
      `/v1/frontHistory?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    ),
```

Full updated file:

```typescript
import { apiFetch } from './client'
import type { SpEnvelope, FrontContent, FrontCreatePayload, FrontUpdatePayload } from '../types'

export const frontApi = {
  getCurrent: () =>
    apiFetch<SpEnvelope<FrontContent>[]>('/v1/fronters'),

  history: () =>
    apiFetch<SpEnvelope<FrontContent>[]>('/v1/frontHistory'),

  historyInRange: (from: string, to: string) =>
    apiFetch<SpEnvelope<FrontContent>[]>(
      `/v1/frontHistory?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    ),

  create: (payload: FrontCreatePayload) =>
    apiFetch<string>('/v1/frontHistory', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: FrontUpdatePayload) =>
    apiFetch<void>(`/v1/frontHistory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/v1/frontHistory/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/front-api.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/api/front.ts src/PluralHost.Web/src/__tests__/front-api.test.ts
git commit -m "feat: frontApi.historyInRange for date-windowed front history"
```

---

## Task 3: `HeatmapStrip` component

**Files:**
- Create: `src/PluralHost.Web/src/components/HeatmapStrip.tsx`
- Create: `src/PluralHost.Web/src/components/HeatmapStrip.module.css`
- Test: `src/PluralHost.Web/src/__tests__/HeatmapStrip.test.tsx` (create)

### Context

Swimlane strip showing top 5 members by total front time in the last 24h. Each row: 14px color dot + track with tint fill + 2px solid bottom bar. "Full view →" navigates to `/logs?tab=heatmap`. Used on FrontPage — not standalone.

Member color is a hex string like `#b6ff00`. Span color applied via CSS custom property `--span-color`.

Position math:
- `left = max(0, (max(startTime, windowStart) - windowStart) / windowMs * 100)`
- `width = max(0, (min(endTime ?? now, now) - max(startTime, windowStart)) / windowMs * 100)`

- [ ] **Step 1: Write tests**

Create `src/PluralHost.Web/src/__tests__/HeatmapStrip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../api/front', () => ({
  frontApi: {
    historyInRange: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../api/members', () => ({
  membersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

import HeatmapStrip from '../components/HeatmapStrip'

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
)

describe('HeatmapStrip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders empty state when no history', async () => {
    render(wrap(<HeatmapStrip />))
    expect(await screen.findByText(/no front activity/i)).toBeInTheDocument()
  })

  it('renders full view link', () => {
    render(wrap(<HeatmapStrip />))
    expect(screen.getByRole('button', { name: /full view/i })).toBeInTheDocument()
  })

  it('renders Last 24h label', () => {
    render(wrap(<HeatmapStrip />))
    expect(screen.getByText('Last 24h')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/HeatmapStrip.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `HeatmapStrip.tsx`**

Create `src/PluralHost.Web/src/components/HeatmapStrip.tsx`:

```tsx
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import type { Member, SpEnvelope, FrontContent } from '../types'
import styles from './HeatmapStrip.module.css'

const WINDOW_MS = 24 * 60 * 60 * 1000

interface Span { left: number; width: number }

export default function HeatmapStrip() {
  const navigate = useNavigate()
  const now = useMemo(() => Date.now(), [])
  const windowStart = now - WINDOW_MS

  const { data: history = [] } = useQuery({
    queryKey: ['front-history-24h'],
    queryFn: () => frontApi.historyInRange(
      new Date(windowStart).toISOString(),
      new Date(now).toISOString()
    ),
    refetchInterval: 30_000,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const memberMap = useMemo(
    () => Object.fromEntries((members as Member[]).map(m => [m.id, m])),
    [members]
  )

  const top5 = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const start = Math.max(e.content.startTime, windowStart)
      const end = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (end > start) {
        totals[e.content.member] = (totals[e.content.member] ?? 0) + (end - start)
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id)
  }, [history, windowStart, now])

  const spansByMember = useMemo(() => {
    const result: Record<string, Span[]> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const id = e.content.member
      if (!top5.includes(id)) continue
      const clampedStart = Math.max(e.content.startTime, windowStart)
      const clampedEnd = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (clampedEnd <= clampedStart) continue
      const left = (clampedStart - windowStart) / WINDOW_MS * 100
      const width = (clampedEnd - clampedStart) / WINDOW_MS * 100
      result[id] = [...(result[id] ?? []), { left, width }]
    }
    return result
  }, [history, top5, windowStart, now])

  return (
    <div className={styles.strip}>
      <div className={styles.header}>
        <span className={styles.label}>Last 24h</span>
        <button
          className={styles.fullLink}
          onClick={() => navigate('/logs?tab=heatmap')}
          aria-label="Full view"
        >
          Full view →
        </button>
      </div>
      <div className={styles.axis}>
        {['-24h', '-18h', '-12h', '-6h', 'now'].map(l => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {top5.length === 0 ? (
        <p className={styles.empty}>No front activity in the last 24h.</p>
      ) : (
        <div className={styles.rows}>
          {top5.map(memberId => {
            const member = memberMap[memberId]
            const color = member?.color ?? 'var(--color-primary)'
            return (
              <div key={memberId} className={styles.row}>
                <div className={styles.dot} style={{ background: color }} />
                <div className={styles.track}>
                  {(spansByMember[memberId] ?? []).map((s, i) => (
                    <div
                      key={i}
                      className={styles.span}
                      style={{ '--span-color': color, left: `${s.left}%`, width: `${s.width}%` } as React.CSSProperties}
                    >
                      <div className={styles.spanFill} />
                      <div className={styles.spanBar} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `HeatmapStrip.module.css`**

Create `src/PluralHost.Web/src/components/HeatmapStrip.module.css`:

```css
.strip {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #222;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted, #666);
}

.fullLink {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}

.axis {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #444;
  margin-bottom: 6px;
  padding-left: 20px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.track {
  flex: 1;
  height: 12px;
  background: #1a1a1a;
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}

.span {
  position: absolute;
  top: 0;
  height: 100%;
}

.spanFill {
  position: absolute;
  inset: 0;
  background: var(--span-color);
  opacity: 0.13;
}

.spanBar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--span-color);
}

.empty {
  font-size: 13px;
  color: var(--color-text-muted, #666);
  padding: 8px 0;
  margin: 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/HeatmapStrip.test.tsx
```

Expected: 3 PASS

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/HeatmapStrip.tsx src/PluralHost.Web/src/components/HeatmapStrip.module.css src/PluralHost.Web/src/__tests__/HeatmapStrip.test.tsx
git commit -m "feat: HeatmapStrip component — compact 24h swimlane"
```

---

## Task 4: Integrate `HeatmapStrip` into `FrontPage`

**Files:**
- Modify: `src/PluralHost.Web/src/pages/FrontPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/FrontPage.module.css`

### Context

`FrontPage.tsx` renders a list of `FrontCard` components and a member picker. Add `<HeatmapStrip />` after the fronters section and before the picker overlay. No new tests needed — HeatmapStrip has its own tests.

- [ ] **Step 1: Add `HeatmapStrip` import and render it in `FrontPage.tsx`**

Add the import at the top of `src/PluralHost.Web/src/pages/FrontPage.tsx`:

```tsx
import HeatmapStrip from '../components/HeatmapStrip'
```

Find the closing `</div>` of the page (just before the `return`'s final `</div>`) and add `<HeatmapStrip />` after the fronters list. The JSX return currently ends around:

```tsx
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        ...
      </div>
      {/* fronters list / empty state */}
      ...
      {showPicker && (
        ...
      )}
    </div>
  )
```

Insert `<HeatmapStrip />` between the fronters section and the `{showPicker && ...}` block:

```tsx
      {/* 24h history strip */}
      <HeatmapStrip />

      {showPicker && (
```

- [ ] **Step 2: Run the frontend tests**

```bash
cd src/PluralHost.Web && npx vitest run 2>&1 | tail -5
```

Expected: all pass, no regressions

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/pages/FrontPage.tsx
git commit -m "feat: add HeatmapStrip to FrontPage below current fronters"
```

---

## Task 5: `FrontHeatmap` component (full view)

**Files:**
- Create: `src/PluralHost.Web/src/components/FrontHeatmap.tsx`
- Create: `src/PluralHost.Web/src/components/FrontHeatmap.module.css`
- Test: `src/PluralHost.Web/src/__tests__/FrontHeatmap.test.tsx` (create)

### Context

Full heatmap with 24h / 7d / 30d toggle. Shows all members — active members sorted by front time desc, inactive members dimmed and sorted alpha by name. Rows are 16px tall (vs 12px in HeatmapStrip). Same span math as HeatmapStrip. Time axis labels are 5 evenly spaced labels computed from the window.

`TimeRange` type: `'24h' | '7d' | '30d'`

Window sizes in ms:
```
24h  →  24 * 60 * 60 * 1000
7d   →   7 * 24 * 60 * 60 * 1000
30d  →  30 * 24 * 60 * 60 * 1000
```

Axis label helper — 5 labels at 0%, 25%, 50%, 75%, 100% of the window:
```typescript
function axisLabels(windowMs: number): string[] {
  const now = Date.now()
  return [0, 0.25, 0.5, 0.75, 1].map(t => {
    if (t === 1) return 'now'
    const ts = new Date(now - windowMs * (1 - t))
    return windowMs <= 24 * 3600 * 1000
      ? ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
}
```

- [ ] **Step 1: Write tests**

Create `src/PluralHost.Web/src/__tests__/FrontHeatmap.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../api/front', () => ({
  frontApi: { historyInRange: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/members', () => ({
  membersApi: { list: vi.fn().mockResolvedValue([]) },
}))

import FrontHeatmap from '../components/FrontHeatmap'

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
)

describe('FrontHeatmap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders empty state when no history', async () => {
    render(wrap(<FrontHeatmap />))
    expect(await screen.findByText(/no front activity/i)).toBeInTheDocument()
  })

  it('renders time range toggle buttons', () => {
    render(wrap(<FrontHeatmap />))
    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument()
  })

  it('24h is active by default', () => {
    render(wrap(<FrontHeatmap />))
    const btn = screen.getByRole('button', { name: '24h' })
    expect(btn.className).toMatch(/active/i)
  })

  it('clicking 7d changes active range', async () => {
    render(wrap(<FrontHeatmap />))
    await userEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(screen.getByRole('button', { name: '7d' }).className).toMatch(/active/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/FrontHeatmap.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `FrontHeatmap.tsx`**

Create `src/PluralHost.Web/src/components/FrontHeatmap.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import type { Member, SpEnvelope, FrontContent } from '../types'
import styles from './FrontHeatmap.module.css'

type TimeRange = '24h' | '7d' | '30d'

const RANGE_MS: Record<TimeRange, number> = {
  '24h':  24 * 60 * 60 * 1000,
  '7d':    7 * 24 * 60 * 60 * 1000,
  '30d':  30 * 24 * 60 * 60 * 1000,
}

function axisLabels(windowMs: number): string[] {
  const now = Date.now()
  return [0, 0.25, 0.5, 0.75, 1].map(t => {
    if (t === 1) return 'now'
    const ts = new Date(now - windowMs * (1 - t))
    return windowMs <= 24 * 3600 * 1000
      ? ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
}

interface Span { left: number; width: number }

export default function FrontHeatmap() {
  const [range, setRange] = useState<TimeRange>('24h')
  const windowMs = RANGE_MS[range]
  const now = useMemo(() => Date.now(), [range])
  const windowStart = now - windowMs

  const { data: history = [] } = useQuery({
    queryKey: ['front-history-range', range],
    queryFn: () => frontApi.historyInRange(
      new Date(windowStart).toISOString(),
      new Date(now).toISOString()
    ),
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const memberList = members as Member[]

  const { activeMemberIds, inactiveMemberIds, totals } = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const start = Math.max(e.content.startTime, windowStart)
      const end = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (end > start) {
        totals[e.content.member] = (totals[e.content.member] ?? 0) + (end - start)
      }
    }
    const activeSet = new Set(Object.keys(totals))
    const activeMemberIds = memberList
      .filter(m => activeSet.has(m.id))
      .sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
      .map(m => m.id)
    const inactiveMemberIds = memberList
      .filter(m => !activeSet.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => m.id)
    return { activeMemberIds, inactiveMemberIds, totals }
  }, [history, memberList, windowStart, now])

  const spansByMember = useMemo(() => {
    const result: Record<string, Span[]> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const id = e.content.member
      const clampedStart = Math.max(e.content.startTime, windowStart)
      const clampedEnd = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (clampedEnd <= clampedStart) continue
      const left = (clampedStart - windowStart) / windowMs * 100
      const width = (clampedEnd - clampedStart) / windowMs * 100
      result[id] = [...(result[id] ?? []), { left, width }]
    }
    return result
  }, [history, windowStart, now, windowMs])

  const memberMap = useMemo(
    () => Object.fromEntries(memberList.map(m => [m.id, m])),
    [memberList]
  )

  const labels = useMemo(() => axisLabels(windowMs), [windowMs])
  const allEmpty = activeMemberIds.length === 0

  function renderRow(memberId: string, dimmed = false) {
    const member = memberMap[memberId]
    const color = member?.color ?? 'var(--color-primary)'
    return (
      <div key={memberId} className={`${styles.row} ${dimmed ? styles.dimmed : ''}`}>
        <div className={styles.dot} style={{ background: color }} />
        <div className={styles.track}>
          {(spansByMember[memberId] ?? []).map((s, i) => (
            <div
              key={i}
              className={styles.span}
              style={{ '--span-color': color, left: `${s.left}%`, width: `${s.width}%` } as React.CSSProperties}
            >
              <div className={styles.spanFill} />
              <div className={styles.spanBar} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.heatmap}>
      <div className={styles.toggle}>
        {(['24h', '7d', '30d'] as TimeRange[]).map(r => (
          <button
            key={r}
            className={`${styles.rangeBtn} ${range === r ? styles.active : ''}`}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div className={styles.axis}>
        {labels.map(l => <span key={l}>{l}</span>)}
      </div>

      {allEmpty ? (
        <p className={styles.empty}>No front activity in the last {range}.</p>
      ) : (
        <div className={styles.rows}>
          {activeMemberIds.map(id => renderRow(id, false))}
          {inactiveMemberIds.map(id => renderRow(id, true))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `FrontHeatmap.module.css`**

Create `src/PluralHost.Web/src/components/FrontHeatmap.module.css`:

```css
.heatmap {
  padding: 0;
}

.toggle {
  display: flex;
  gap: 6px;
  margin-bottom: 16px;
}

.rangeBtn {
  padding: 4px 12px;
  border-radius: 20px;
  border: none;
  background: #1a1a1a;
  color: #666;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.rangeBtn.active {
  background: var(--color-primary);
  color: #000;
  font-weight: 700;
}

.axis {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #444;
  margin-bottom: 8px;
  padding-left: 24px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row.dimmed {
  opacity: 0.35;
}

.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
}

.track {
  flex: 1;
  height: 16px;
  background: #1a1a1a;
  border-radius: 3px;
  position: relative;
  overflow: hidden;
}

.span {
  position: absolute;
  top: 0;
  height: 100%;
}

.spanFill {
  position: absolute;
  inset: 0;
  background: var(--span-color);
  opacity: 0.13;
}

.spanBar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--span-color);
}

.empty {
  font-size: 13px;
  color: var(--color-text-muted, #666);
  padding: 24px 0;
  margin: 0;
  text-align: center;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/FrontHeatmap.test.tsx
```

Expected: 4 PASS

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/FrontHeatmap.tsx src/PluralHost.Web/src/components/FrontHeatmap.module.css src/PluralHost.Web/src/__tests__/FrontHeatmap.test.tsx
git commit -m "feat: FrontHeatmap component — full 24h/7d/30d swimlane view"
```

---

## Task 6: Add Heatmap tab to `LogsPage`

**Files:**
- Modify: `src/PluralHost.Web/src/pages/LogsPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/LogsPage.module.css`
- Test: `src/PluralHost.Web/src/__tests__/LogsPage.test.tsx` (create)

### Context

LogsPage currently uses `useState('Journal')` for the active tab. Replace with `useSearchParams` so `?tab=heatmap` deep-links from HeatmapStrip's "Full view →" button work. Add `FrontHeatmap` as the Heatmap tab content. Add toggle pill CSS for the time range buttons (already written in `FrontHeatmap.module.css`, but LogsPage needs no new CSS — the module is self-contained).

- [ ] **Step 1: Write tests**

Create `src/PluralHost.Web/src/__tests__/LogsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'

vi.mock('../api/journals', () => ({
  journalsApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/front', () => ({
  frontApi: { history: vi.fn().mockResolvedValue([]), historyInRange: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/members', () => ({
  membersApi: { list: vi.fn().mockResolvedValue([]) },
}))

import LogsPage from '../pages/LogsPage'

const wrap = (initialPath: string) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/logs" element={<LogsPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
)

describe('LogsPage', () => {
  it('shows Journal tab by default', () => {
    render(wrap('/logs'))
    expect(screen.getByRole('button', { name: /journal/i })).toBeInTheDocument()
  })

  it('shows Heatmap tab in tab bar', () => {
    render(wrap('/logs'))
    expect(screen.getByRole('button', { name: /heatmap/i })).toBeInTheDocument()
  })

  it('deep-links to heatmap tab via ?tab=heatmap', async () => {
    render(wrap('/logs?tab=heatmap'))
    // FrontHeatmap renders the toggle buttons when active
    expect(await screen.findByRole('button', { name: '24h' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/LogsPage.test.tsx
```

Expected: FAIL — `Heatmap tab in tab bar` and `deep-links` fail (tab doesn't exist yet)

- [ ] **Step 3: Update `LogsPage.tsx`**

Replace the full contents of `src/PluralHost.Web/src/pages/LogsPage.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import TabBar from '../components/TabBar'
import EntrySheet from '../components/EntrySheet'
import FrontHeatmap from '../components/FrontHeatmap'
import { journalsApi } from '../api/journals'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import type { JournalEntry, Member, SpEnvelope, FrontContent } from '../types'
import styles from './LogsPage.module.css'

const TABS = [
  { id: 'Journal', label: 'Journal' },
  { id: 'History', label: 'Front History' },
  { id: 'Heatmap', label: 'Heatmap' },
]

function formatDate(isoOrMs: string | number) {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'Journal'
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: journals = [] } = useQuery({
    queryKey: ['journals'],
    queryFn: journalsApi.list,
  })

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
        <div>
          <span className="eyebrow">Recent activity</span>
          <h1 className="pageTitle"><span className="accentWord">Logs</span></h1>
        </div>
        {activeTab === 'Journal' && (
          <button className={styles.addBtn} onClick={openNew} aria-label="New entry">
            <Plus size={18} />
          </button>
        )}
      </div>

      <TabBar
        tabs={[...TABS]}
        activeTab={activeTab}
        onChange={tab => setSearchParams({ tab })}
      />

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
              {searchTerm ? 'No entries match your search.' : 'No journal entries yet. Tap + to write something.'}
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
            <p className={styles.empty}>No switches logged yet. Front changes will show up here.</p>
          )}
        </div>
      )}

      {activeTab === 'Heatmap' && <FrontHeatmap />}

      <EntrySheet
        entry={selectedEntry}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/LogsPage.test.tsx
```

Expected: 3 PASS

- [ ] **Step 5: Run full frontend suite**

```bash
cd src/PluralHost.Web && npx vitest run 2>&1 | tail -5
```

Expected: all pass, no regressions

- [ ] **Step 6: Run backend suite (smoke check)**

```bash
dotnet test 2>&1 | tail -3
```

Expected: `Passed! - Failed: 0`

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/pages/LogsPage.tsx src/PluralHost.Web/src/__tests__/LogsPage.test.tsx
git commit -m "feat: Heatmap tab on LogsPage with useSearchParams deep-link"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Compact strip on FrontPage (top 5, 24h fixed) → Task 3 + 4
  - Full view on LogsPage (Heatmap tab, all members, 24h/7d/30d toggle) → Task 5 + 6
  - Swimlane style C (dot + tint fill + bottom bar) → Task 3 CSS + Task 5 CSS
  - "Full view →" deep-link to `/logs?tab=heatmap` → Task 3 (`navigate`), Task 6 (`useSearchParams`)
  - Backend date filtering → Task 1
  - Empty state → Task 3 + 5
  - Inactive members dimmed → Task 5
  - 30s refetch on HeatmapStrip (matches FrontPage polling) → Task 3 (`refetchInterval: 30_000`)
- [x] **No placeholders** — all code written out in full
- [x] **Type consistency** — `SpEnvelope<FrontContent>` used throughout; `FrontContent.endTime` treated as optional (`!= null` check, not `!e.content.endTime`)
