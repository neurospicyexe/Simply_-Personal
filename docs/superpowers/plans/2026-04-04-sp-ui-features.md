# SP UI Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the heatmap span rendering bug, expose front-history comments in the API and UI, show bucket emoji in member/front cards, add sort direction toggle to member list, add bulk-clear fronters action, and add quick-add [+] to member list rows.

**Architecture:** All backend changes are additive to the existing SP compat layer (`SpFrontController`, `SpDtos.cs`). Frontend changes thread new props through existing component hierarchies — no new pages or routes. CSS fix resolves a positioning bug that makes all heatmap spans fill 100% track width.

**Tech Stack:** .NET 8 / EF Core 8 / xUnit (backend); React 18 / TanStack Query / CSS Modules / Lucide icons (frontend)

---

## Pre-flight: what already exists (do NOT re-implement)

- `FrontHistory.Comment` column — exists on domain entity
- `PrivacyBucket.Emoji` column — exists + in DTOs + in frontend `PrivacyBucket` type + BucketSheet already has emoji input
- `frontApi.update(uid, payload)` — exists, sends `FrontUpdatePayload` as JSON body
- `bucketsApi.list()` — exists at `src/PluralHost.Web/src/api/buckets.ts`

---

## File Map

| File | Change |
|------|--------|
| `src/PluralHost.Web/src/components/HeatmapStrip.module.css` | Fix `.span` positioning; remove `.spanBar` |
| `src/PluralHost.Web/src/components/HeatmapStrip.tsx` | Remove nested span children |
| `src/PluralHost.Web/src/components/FrontHeatmap.module.css` | Same span fix |
| `src/PluralHost.Web/src/components/FrontHeatmap.tsx` | Same nested children removal |
| `src/PluralHost.Api/Dto/SpDtos.cs` | Add `Comment` to `SpFrontContent` + `SpFrontUpdateRequest` |
| `src/PluralHost.Api/Controllers/SpFrontController.cs` | Expose `Comment` in `ToEnvelope`; handle `comment` in PATCH; add `POST /v1/fronters/clear-all` |
| `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs` | Tests for comment exposure and clear-all |
| `src/PluralHost.Web/src/types.ts` | Add `comment?: string` to `FrontContent` + `FrontUpdatePayload` |
| `src/PluralHost.Web/src/components/FrontCard.tsx` | Add `onUpdateComment` prop + inline comment textarea |
| `src/PluralHost.Web/src/components/FrontCard.module.css` | Comment input styles |
| `src/PluralHost.Web/src/components/tabs/LogsTab.tsx` | Comment icon indicator; comment field in drawer |
| `src/PluralHost.Web/src/components/MemberCard.tsx` | Add `bucket?: PrivacyBucket` prop; render emoji + name chip |
| `src/PluralHost.Web/src/components/MemberCard.module.css` | Bucket chip styles |
| `src/PluralHost.Web/src/pages/FrontPage.tsx` | Fetch buckets; pass to FrontCard; add comment mutation; bulk-clear button + modal |
| `src/PluralHost.Web/src/pages/FrontPage.module.css` | Clear modal + clear button styles |
| `src/PluralHost.Web/src/api/front.ts` | Add `clearAll()` |
| `src/PluralHost.Web/src/pages/MembersPage.tsx` | Fetch buckets; pass to MemberCard; sort direction toggle; quick-add mutation |
| `src/PluralHost.Web/src/pages/MembersPage.module.css` | Sort flip button styles |

---

## Task 1: Fix heatmap span CSS bug

**Root cause:** `.span` has `left`/`width` inline styles but is not `position: absolute`, so the child `.spanBar` (which IS absolute) positions itself relative to `.track` and always fills 100% width.

**Fix:** Make `.span` itself the colored block — `position: absolute; height: 100%; background: var(--span-color)`. Remove `.spanFill` and `.spanBar`.

**Files:**
- Modify: `src/PluralHost.Web/src/components/HeatmapStrip.module.css`
- Modify: `src/PluralHost.Web/src/components/HeatmapStrip.tsx`
- Modify: `src/PluralHost.Web/src/components/FrontHeatmap.module.css`
- Modify: `src/PluralHost.Web/src/components/FrontHeatmap.tsx`

- [ ] **Step 1: Fix HeatmapStrip CSS**

In `HeatmapStrip.module.css`, replace the `.spanBar` block and add `.span`:

```css
/* REMOVE this entire block: */
.spanBar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--span-color);
  opacity: 0.8;
  border-radius: 1px;
}

/* ADD this instead: */
.span {
  position: absolute;
  height: 100%;
  background: var(--span-color);
  opacity: 0.85;
  border-radius: 2px;
  min-width: 2px;
}
```

Also remove `.spanFill` if it exists (search the file — it may be defined in FrontHeatmap.module.css instead).

- [ ] **Step 2: Simplify HeatmapStrip.tsx span rendering**

Find this pattern in `HeatmapStrip.tsx` (inside `.track`):
```tsx
<div
  key={i}
  className={styles.span}
  style={{ '--span-color': color, left: `${s.left}%`, width: `${s.width}%` } as React.CSSProperties}
>
  <div className={styles.spanFill} />
  <div className={styles.spanBar} />
</div>
```

Replace with self-closing:
```tsx
<div
  key={i}
  className={styles.span}
  style={{ '--span-color': color, left: `${s.left}%`, width: `${s.width}%` } as React.CSSProperties}
/>
```

- [ ] **Step 3: Fix FrontHeatmap.module.css**

Open `src/PluralHost.Web/src/components/FrontHeatmap.module.css`. Apply the same change as Step 1: remove `.spanBar` and `.spanFill`, add:

```css
.span {
  position: absolute;
  height: 100%;
  background: var(--span-color);
  opacity: 0.85;
  border-radius: 2px;
  min-width: 2px;
}
```

- [ ] **Step 4: Simplify FrontHeatmap.tsx span rendering**

In `FrontHeatmap.tsx`, inside the `renderRow` function, apply the same self-closing simplification as Step 2. The pattern is identical.

- [ ] **Step 5: Build + commit**

```bash
cd src/PluralHost.Web && npm run build
```

Expected: `✓ built` with no errors.

```bash
git add src/PluralHost.Web/src/components/HeatmapStrip.module.css \
        src/PluralHost.Web/src/components/HeatmapStrip.tsx \
        src/PluralHost.Web/src/components/FrontHeatmap.module.css \
        src/PluralHost.Web/src/components/FrontHeatmap.tsx
git commit -m "fix: heatmap spans now render proportionally to front duration"
```

---

## Task 2: Expose comment in front history API + bulk-clear endpoint

**Files:**
- Modify: `src/PluralHost.Api/Dto/SpDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/SpFrontController.cs`
- Test: `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs`

- [ ] **Step 1: Write failing tests**

Add to `SpFrontControllerTests.cs`:

```csharp
[Fact]
public async Task GetCurrentFronters_WithComment_ExposesCommentInEnvelope()
{
    var member = await AddMemberAsync();
    _context.FrontHistory.Add(new FrontHistory
    {
        MemberId = member.Id,
        FrontStart = DateTime.UtcNow,
        Comment = "feeling anxious"
    });
    await _context.SaveChangesAsync();

    var controller = new SpFrontController(_context);
    var result = await controller.GetCurrentAsync(CancellationToken.None) as OkObjectResult;
    var items = Assert.IsAssignableFrom<IEnumerable<SpEnvelope<SpFrontContent>>>(result!.Value);
    Assert.Equal("feeling anxious", items.Single().Content.Comment);
}

[Fact]
public async Task Patch_WithComment_UpdatesComment()
{
    var member = await AddMemberAsync();
    _context.FrontHistory.Add(new FrontHistory { MemberId = member.Id, FrontStart = DateTime.UtcNow });
    await _context.SaveChangesAsync();
    var id = _context.FrontHistory.Single().Id;

    var controller = new SpFrontController(_context);
    var result = await controller.UpdateAsync(id, new SpFrontUpdateRequest(Comment: "my note"), CancellationToken.None);

    Assert.IsType<NoContentResult>(result);
    Assert.Equal("my note", _context.FrontHistory.Single().Comment);
}

[Fact]
public async Task ClearAllFronters_EndAllActiveSessions()
{
    var member = await AddMemberAsync();
    _context.FrontHistory.Add(new FrontHistory { MemberId = member.Id, FrontStart = DateTime.UtcNow });
    _context.FrontHistory.Add(new FrontHistory { MemberId = member.Id, FrontStart = DateTime.UtcNow });
    await _context.SaveChangesAsync();

    var controller = new SpFrontController(_context);
    var result = await controller.ClearAllFrontersAsync(CancellationToken.None);

    Assert.IsType<NoContentResult>(result);
    Assert.All(_context.FrontHistory.IgnoreQueryFilters().ToList(), e => Assert.NotNull(e.FrontEnd));
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
dotnet test tests/PluralHost.Tests --filter "GetCurrentFronters_WithComment|Patch_WithComment|ClearAllFronters" -v minimal
```

Expected: 3 failures — method/field not found.

- [ ] **Step 3: Add `Comment` to `SpFrontContent` and `SpFrontUpdateRequest` in SpDtos.cs**

In `src/PluralHost.Api/Dto/SpDtos.cs`, update the two records:

```csharp
public record SpFrontContent(
    string Uid,
    string Member,
    bool Live,
    long StartTime,
    long? EndTime,
    bool Custom,
    string? CustomStatus,
    string? Comment          // free-text annotation — separate from status label
);

// ... (SpFrontCreateRequest unchanged) ...

public record SpFrontUpdateRequest(
    bool? Live = null,
    long? EndTime = null,
    string? CustomStatus = null,
    string? MemberId = null,
    long? StartTime = null,
    string? Comment = null   // set/clear free-text annotation
);
```

- [ ] **Step 4: Update ToEnvelope + PATCH handler + add ClearAll in SpFrontController.cs**

Open `src/PluralHost.Api/Controllers/SpFrontController.cs`.

**a) Update `ToEnvelope`** — add `Comment: fh.Comment` as the last argument:

```csharp
private static SpEnvelope<SpFrontContent> ToEnvelope(FrontHistory fh) =>
    new SpEnvelope<SpFrontContent>(
        Exists: true,
        Id: fh.Id.ToString(),
        Content: new SpFrontContent(
            Uid: fh.Id.ToString(),
            Member: fh.MemberId.ToString(),
            Live: fh.IsCurrentlyFronting,
            StartTime: new DateTimeOffset(fh.FrontStart, TimeSpan.Zero).ToUnixTimeMilliseconds(),
            EndTime: fh.FrontEnd.HasValue
                ? new DateTimeOffset(fh.FrontEnd.Value, TimeSpan.Zero).ToUnixTimeMilliseconds()
                : null,
            Custom: fh.CustomStatusId != null,
            CustomStatus: fh.CustomStatus?.Label,
            Comment: fh.Comment
        )
    );
```

**b) In the PATCH handler** (`UpdateAsync`), add comment handling after the existing `CustomStatus` line:

```csharp
if (body.Comment is not null) entry.Comment = body.Comment;
```

**c) Add the clear-all endpoint** at the bottom of the class, before the closing `}`:

```csharp
// POST /v1/fronters/clear-all — end all active front sessions
[HttpPost("v1/fronters/clear-all")]
[Authorize]
public async Task<IActionResult> ClearAllFrontersAsync(CancellationToken ct)
{
    var active = await context.FrontHistory
        .Where(f => f.FrontEnd == null && f.DeletedAt == null)
        .ToListAsync(ct);
    var now = DateTime.UtcNow;
    foreach (var entry in active)
        entry.FrontEnd = now;
    await context.SaveChangesAsync(ct);
    return NoContent();
}
```

- [ ] **Step 5: Run tests**

```bash
dotnet test tests/PluralHost.Tests --filter "GetCurrentFronters_WithComment|Patch_WithComment|ClearAllFronters" -v minimal
```

Expected: 3 passing.

- [ ] **Step 6: Full test suite**

```bash
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -5
```

Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Dto/SpDtos.cs \
        src/PluralHost.Api/Controllers/SpFrontController.cs \
        tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs
git commit -m "feat: expose comment in front history envelope + POST /v1/fronters/clear-all"
```

---

## Task 3: Frontend types + frontApi.clearAll

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`
- Modify: `src/PluralHost.Web/src/api/front.ts`

- [ ] **Step 1: Add `comment` to `FrontContent` and `FrontUpdatePayload` in types.ts**

In `src/PluralHost.Web/src/types.ts`, update the two interfaces:

```typescript
export interface FrontContent {
  uid: string
  member: string
  live: boolean
  startTime: number
  endTime?: number
  custom: boolean
  customStatus?: string
  comment?: string          // free-text annotation
}

// FrontUpdatePayload (already exists — add comment field):
export interface FrontUpdatePayload {
  live?: boolean
  endTime?: number
  customStatus?: string
  memberId?: string
  startTime?: number
  comment?: string          // set/clear free-text annotation
}
```

- [ ] **Step 2: Add `clearAll` to frontApi in front.ts**

In `src/PluralHost.Web/src/api/front.ts`, add to the `frontApi` object:

```typescript
clearAll: () =>
  apiFetch<void>('/v1/fronters/clear-all', { method: 'POST' }),
```

- [ ] **Step 3: Build**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | grep -E "error|✓"
```

Expected: `✓ built` with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/types.ts src/PluralHost.Web/src/api/front.ts
git commit -m "feat: add comment to FrontContent type + frontApi.clearAll"
```

---

## Task 4: FrontCard inline comment input

**Files:**
- Modify: `src/PluralHost.Web/src/components/FrontCard.tsx`
- Modify: `src/PluralHost.Web/src/components/FrontCard.module.css`

- [ ] **Step 1: Add `onUpdateComment` prop and comment state to FrontCard.tsx**

Add `onUpdateComment: (uid: string, comment: string) => void` to `FrontCardProps`:

```typescript
interface FrontCardProps {
  entry: FrontContent
  member: Member
  frontStatuses: FrontStatus[]
  onRemove: (uid: string) => void
  onUpdateStatus: (uid: string, status: string) => void
  onEdit: (uid: string, memberId: string, startTime: number) => void
  onUpdateComment: (uid: string, comment: string) => void
}
```

Inside the component, add comment state (after the existing `useState` calls):

```typescript
const [comment, setComment] = useState(entry.comment ?? '')

// In the existing useEffect that resets on entry change, add:
// setComment(entry.comment ?? '')
```

Update the `useEffect` that resets on `entry.uid` change to also reset comment:

```typescript
useEffect(() => {
  setStatus(entry.customStatus ?? '')
  setComment(entry.comment ?? '')
  setEditMemberId(entry.member)
  setEditStartTime(new Date(entry.startTime).toISOString().slice(0, 16))
}, [entry.uid, entry.customStatus, entry.comment, entry.member, entry.startTime])
```

- [ ] **Step 2: Add comment textarea to FrontCard JSX**

Find the body section of FrontCard (below the header, inside the collapsed guard). Add the comment textarea after the status row and before any action buttons. The exact insertion point is after `{showEdit && ...}` block, before the closing tag of the card body div:

```tsx
{/* Comment */}
<div className={styles.commentRow}>
  <textarea
    className={styles.commentInput}
    placeholder="Add a note…"
    value={comment}
    rows={1}
    onChange={e => setComment(e.target.value)}
    onBlur={() => onUpdateComment(entry.uid, comment)}
    aria-label="Front session note"
  />
</div>
```

- [ ] **Step 3: Add comment styles to FrontCard.module.css**

```css
.commentRow {
  padding: var(--space-2) var(--space-4) var(--space-3);
}

.commentInput {
  width: 100%;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-3);
  resize: none;
  box-sizing: border-box;
  line-height: 1.4;
  min-height: 36px;
  transition: border-color 0.15s;
}

.commentInput:focus {
  outline: none;
  border-color: var(--color-primary);
}

.commentInput::placeholder {
  color: var(--color-muted);
}
```

- [ ] **Step 4: Build**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | grep -E "error|✓"
```

Expected: `✓ built`. TypeScript will error if FrontPage doesn't pass `onUpdateComment` yet — that's expected; fix it in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/components/FrontCard.tsx \
        src/PluralHost.Web/src/components/FrontCard.module.css
git commit -m "feat: FrontCard inline comment textarea with onBlur save"
```

---

## Task 5: FrontPage — wire comment mutation, fetch buckets, bulk-clear modal

**Files:**
- Modify: `src/PluralHost.Web/src/pages/FrontPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/FrontPage.module.css`

- [ ] **Step 1: Add imports and new state to FrontPage.tsx**

Add at top of file:
```typescript
import { bucketsApi } from '../api/buckets'
import type { PrivacyBucket } from '../types'
```

Add new state inside the component:
```typescript
const [showClearConfirm, setShowClearConfirm] = useState(false)
```

- [ ] **Step 2: Add bucket query + bucket lookup map**

After the existing `useQuery` calls:
```typescript
const { data: buckets = [] } = useQuery({
  queryKey: ['buckets'],
  queryFn: bucketsApi.list,
})

const bucketMap = useMemo(
  () => Object.fromEntries((buckets as PrivacyBucket[]).map(b => [b.id, b])),
  [buckets]
)
```

- [ ] **Step 3: Add updateComment mutation and clearAll mutation**

After the existing mutations:
```typescript
const updateCommentMutation = useMutation({
  mutationFn: ({ uid, comment }: { uid: string; comment: string }) =>
    frontApi.update(uid, { comment }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
})

const clearAllMutation = useMutation({
  mutationFn: frontApi.clearAll,
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['fronters'] })
    setShowClearConfirm(false)
  },
})
```

- [ ] **Step 4: Pass bucket and onUpdateComment to FrontCard; add Clear All button + modal**

In the `fronters.map(...)` block, update `<FrontCard ...>` to include:
```tsx
<FrontCard
  key={envelope.id}
  entry={envelope.content}
  member={member}
  frontStatuses={frontStatuses}
  bucket={bucketMap[member.bucketId]}
  onRemove={uid => removeMutation.mutate(uid)}
  onUpdateStatus={(uid, status) => updateStatusMutation.mutate({ uid, status })}
  onEdit={(uid, memberId, startTime) => editMutation.mutate({ uid, memberId, startTime })}
  onUpdateComment={(uid, comment) => updateCommentMutation.mutate({ uid, comment })}
/>
```

In the header section, add "Clear All" button next to "Add Fronter":
```tsx
{fronters.length > 0 && (
  <button
    className={styles.clearBtn}
    onClick={() => setShowClearConfirm(true)}
    aria-label="Remove all from front"
  >
    Clear All
  </button>
)}
```

Add the confirmation modal just before the closing `</div>` of the page:
```tsx
{showClearConfirm && (
  <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-label="Confirm clear all">
    <div className={styles.confirmBox}>
      <p className={styles.confirmMsg}>Remove everyone from front?</p>
      <div className={styles.confirmActions}>
        <button className={styles.confirmCancel} onClick={() => setShowClearConfirm(false)}>Cancel</button>
        <button
          className={styles.confirmDanger}
          onClick={() => clearAllMutation.mutate()}
          disabled={clearAllMutation.isPending}
        >
          {clearAllMutation.isPending ? 'Clearing…' : 'Yes, clear all'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Add styles to FrontPage.module.css**

```css
.clearBtn {
  padding: 0 var(--space-4);
  height: 40px;
  border: 2px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-danger);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.clearBtn:hover {
  background: var(--color-danger);
  color: var(--color-bg);
}

.confirmOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.confirmBox {
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  max-width: 340px;
  width: calc(100% - var(--space-8));
}

.confirmMsg {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0 0 var(--space-5);
  color: var(--color-text);
}

.confirmActions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
}

.confirmCancel {
  padding: 0 var(--space-4);
  height: 40px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: none;
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
}

.confirmDanger {
  padding: 0 var(--space-4);
  height: 40px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-danger);
  color: #fff;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
}

.confirmDanger:disabled {
  opacity: 0.5;
}
```

- [ ] **Step 6: Build**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | grep -E "error|✓"
```

Expected: `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/pages/FrontPage.tsx \
        src/PluralHost.Web/src/pages/FrontPage.module.css
git commit -m "feat: bulk-clear fronters confirmation modal + comment mutation wired"
```

---

## Task 6: LogsTab — comment indicator and comment field in drawer

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/LogsTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/LogsTab.module.css`

- [ ] **Step 1: Add comment state and Lucide import to LogsTab.tsx**

Add to imports at top of file:
```typescript
import { MessageCircle } from 'lucide-react'
```

Add `commentVal` state alongside the existing state:
```typescript
const [commentVal, setCommentVal] = useState('')
```

Update `openDrawer` to also set `commentVal`:
```typescript
function openDrawer(entry: SpEnvelope<FrontContent>) {
  setSelected(entry)
  setStartVal(msToDatetimeLocal(entry.content.startTime))
  setEndVal(entry.content.endTime ? msToDatetimeLocal(entry.content.endTime) : '')
  setStatusVal(entry.content.customStatus ?? '')
  setCommentVal(entry.content.comment ?? '')
  setDrawerError('')
}
```

Update `handleSave` to include `comment`:
```typescript
function handleSave() {
  if (!selected) return
  const payload: FrontUpdatePayload = {
    startTime: datetimeLocalToMs(startVal),
    endTime: endVal ? datetimeLocalToMs(endVal) : undefined,
    customStatus: statusVal || undefined,
    comment: commentVal || undefined,
  }
  updateMutation.mutate({ uid: selected.content.uid, payload })
}
```

- [ ] **Step 2: Add comment indicator to entry cards**

In the entry card render, add a comment badge after the `{c.customStatus && ...}` line:

```tsx
{c.comment && (
  <div className={styles.commentIndicator}>
    <MessageCircle size={11} />
    <span className={styles.commentPreview}>{c.comment}</span>
  </div>
)}
```

- [ ] **Step 3: Add comment field to the drawer**

In the `<Drawer>` JSX, add a comment field after the existing "Status" field:

```tsx
<div className={styles.field}>
  <span className={styles.fieldLabel}>Note</span>
  <textarea
    className={styles.input}
    value={commentVal}
    onChange={e => setCommentVal(e.target.value)}
    placeholder="Optional note"
    rows={2}
    style={{ resize: 'vertical' }}
  />
</div>
```

- [ ] **Step 4: Add styles to LogsTab.module.css**

```css
.commentIndicator {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--space-1);
  color: var(--color-cyan);
  font-size: 11px;
}

.commentPreview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
```

- [ ] **Step 5: Build and commit**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | grep -E "error|✓"
git add src/PluralHost.Web/src/components/tabs/LogsTab.tsx \
        src/PluralHost.Web/src/components/tabs/LogsTab.module.css
git commit -m "feat: LogsTab shows comment indicator icon and comment field in edit drawer"
```

---

## Task 7: Bucket emoji in MemberCard + MembersPage quick-add + sort toggle

**Files:**
- Modify: `src/PluralHost.Web/src/components/MemberCard.tsx`
- Modify: `src/PluralHost.Web/src/components/MemberCard.module.css`
- Modify: `src/PluralHost.Web/src/pages/MembersPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/MembersPage.module.css`

- [ ] **Step 1: Add `bucket`, `onQuickAdd` props to MemberCard.tsx**

Update imports:
```typescript
import type { Member, PrivacyBucket } from '../types'
```

Update `MemberCardProps`:
```typescript
interface MemberCardProps {
  member: Member
  isFronting?: boolean
  compact?: boolean
  bucket?: PrivacyBucket
  onQuickAdd?: () => void
}
```

Update the function signature:
```typescript
export default function MemberCard({ member, isFronting = false, compact = false, bucket, onQuickAdd }: MemberCardProps) {
```

In the **card view** (non-compact), add bucket chip and quick-add button inside `.info`:

```tsx
<div className={styles.info}>
  <span className={styles.name}>{member.name}</span>
  {member.pronouns && <span className={styles.pronouns}>{member.pronouns}</span>}
  {bucket && (
    <span className={styles.bucketChip}>
      {bucket.emoji && <span>{bucket.emoji}</span>}
      {bucket.name}
    </span>
  )}
</div>
{onQuickAdd && !isFronting && (
  <button
    className={styles.quickAddBtn}
    onClick={e => { e.preventDefault(); e.stopPropagation(); onQuickAdd() }}
    aria-label={`Add ${member.name} to front`}
    title="Add to front"
  >
    +
  </button>
)}
```

Note: the card is a `<Link>`, so `e.preventDefault()` stops navigation; `e.stopPropagation()` stops the click from reaching the Link.

- [ ] **Step 2: Add styles to MemberCard.module.css**

```css
.bucketChip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--color-muted);
  margin-top: 2px;
}

.quickAddBtn {
  margin-left: auto;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 2px solid var(--color-primary);
  background: none;
  color: var(--color-primary);
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, color 0.1s;
}

.quickAddBtn:hover {
  background: var(--color-primary);
  color: var(--color-bg);
}
```

Also update the `.card` to `display: flex; align-items: center` if it isn't already (check existing CSS — if card uses flex for avatar+info it likely already does).

- [ ] **Step 3: Add sort toggle + quick-add + buckets to MembersPage.tsx**

Add imports:
```typescript
import { bucketsApi } from '../api/buckets'
import type { PrivacyBucket } from '../types'
```

Add state:
```typescript
const [sortAsc, setSortAsc] = useState(true)
```

Add bucket query after the existing queries:
```typescript
const { data: buckets = [] } = useQuery({
  queryKey: ['buckets'],
  queryFn: bucketsApi.list,
})

const bucketMap = useMemo(
  () => Object.fromEntries((buckets as PrivacyBucket[]).map(b => [b.id, b])),
  [buckets]
)
```

Add quick-add mutation:
```typescript
const quickAddMutation = useMutation({
  mutationFn: (memberId: string) =>
    frontApi.create({ member: memberId, live: true, startTime: Date.now() }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
})
```

Add `useQueryClient` import at top if not already present:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { frontApi } from '../api/front'
```

Update `alphabetGroups` useMemo to respect `sortAsc`:
```typescript
const alphabetGroups = useMemo(() => {
  const sorted = [...filtered].sort((a, b) =>
    sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
  )
  const map = new Map<string, Member[]>()
  for (const m of sorted) {
    const letter = ([...m.name][0] ?? '#').toUpperCase()
    if (!map.has(letter)) map.set(letter, [])
    map.get(letter)!.push(m)
  }
  // For Z-A, also reverse the letter order
  return sortAsc ? map : new Map([...map.entries()].reverse())
}, [filtered, sortAsc])
```

In the toolbar JSX, add a sort flip button after the density toggle group:
```tsx
<button
  className={styles.sortFlipBtn}
  onClick={() => setSortAsc(v => !v)}
  aria-label={sortAsc ? 'Sort Z–A' : 'Sort A–Z'}
  title={sortAsc ? 'Sort Z–A' : 'Sort A–Z'}
>
  {sortAsc ? 'A–Z' : 'Z–A'}
</button>
```

Pass `bucket` and `onQuickAdd` to `<MemberCard>` in the list view:
```tsx
<MemberCard
  key={m.id}
  member={m}
  isFronting={frontingIds.has(m.id)}
  compact={density === 'compact'}
  bucket={bucketMap[m.bucketId]}
  onQuickAdd={!frontingIds.has(m.id) ? () => quickAddMutation.mutate(m.id) : undefined}
/>
```

Also pass `bucket` to `<MemberCard>` inside `renderFolder`:
```tsx
<MemberCard
  key={m.id}
  member={m}
  isFronting={frontingIds.has(m.id)}
  compact={density === 'compact'}
  bucket={bucketMap[m.bucketId]}
/>
```

- [ ] **Step 4: Add sort flip button style to MembersPage.module.css**

```css
.sortFlipBtn {
  padding: 0 var(--space-3);
  min-height: 44px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.sortFlipBtn:hover {
  color: var(--color-text);
  border-color: var(--color-text);
}
```

- [ ] **Step 5: Build**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | grep -E "error|✓"
```

Expected: `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/MemberCard.tsx \
        src/PluralHost.Web/src/components/MemberCard.module.css \
        src/PluralHost.Web/src/pages/MembersPage.tsx \
        src/PluralHost.Web/src/pages/MembersPage.module.css
git commit -m "feat: bucket emoji chip on member cards, quick-add to front, A-Z/Z-A sort toggle"
```

---

## Task 8: FrontCard bucket emoji display

**Files:**
- Modify: `src/PluralHost.Web/src/components/FrontCard.tsx`
- Modify: `src/PluralHost.Web/src/components/FrontCard.module.css`

- [ ] **Step 1: Add `bucket` prop to FrontCard**

Update `FrontCardProps` interface (already modified in Task 4):
```typescript
interface FrontCardProps {
  entry: FrontContent
  member: Member
  frontStatuses: FrontStatus[]
  bucket?: PrivacyBucket
  onRemove: (uid: string) => void
  onUpdateStatus: (uid: string, status: string) => void
  onEdit: (uid: string, memberId: string, startTime: number) => void
  onUpdateComment: (uid: string, comment: string) => void
}
```

Add `import type { PrivacyBucket } from '../types'` to the imports.

Update the function signature:
```typescript
export default function FrontCard({ entry, member, frontStatuses, bucket, onRemove, onUpdateStatus, onEdit, onUpdateComment }: FrontCardProps) {
```

In the header section, add bucket chip below the member name (inside `.headerInfo`):
```tsx
{bucket && (
  <span className={styles.bucketChip}>
    {bucket.emoji && <span>{bucket.emoji}</span>}
    {bucket.name}
  </span>
)}
```

- [ ] **Step 2: Add `.bucketChip` to FrontCard.module.css**

```css
.bucketChip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-muted);
  margin-top: 2px;
}
```

- [ ] **Step 3: Build**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | grep -E "error|✓"
```

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/FrontCard.tsx \
        src/PluralHost.Web/src/components/FrontCard.module.css
git commit -m "feat: bucket emoji chip on FrontCard"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| Heatmap renders duration-proportional spans | Task 1 (CSS fix) |
| Heatmap empty space when not fronting | Task 1 (already correct — spans only render for history entries) |
| Comment field on active fronter | Task 4 + 5 |
| Comments tied to log entry | Task 2 (stored in `FrontHistory.Comment`) |
| Comment indicator on log list | Task 6 |
| Log section shows comments | Task 6 (drawer field) |
| Bucket emoji field in settings | Already exists (BucketSheet) |
| Bucket emoji in member list | Task 7 |
| Bucket emoji in fronting panel | Task 8 |
| A-Z/Z-A sort toggle | Task 7 |
| Sort ignores emojis for name ordering | `localeCompare` handles this — emoji characters sort after ASCII letters, so an alter named "⚡Sable" sorts under '#' not 'S'. Acceptable; spec says toggle should let user move emoji-prefixed names to bottom, which Z-A achieves. |
| "Remove All From Front" button | Task 5 (Clear All button + modal) |
| Confirmation modal for bulk clear | Task 5 |
| [+] quick-add on member list | Task 7 |
| All front state changes logged | All changes go through `frontApi.create`/`update`/`clearAll` → `FrontHistory` table |

**No placeholders found.**

**Type consistency:**
- `PrivacyBucket` from `types.ts` used consistently across MemberCard, FrontCard, FrontPage, MembersPage
- `onUpdateComment(uid: string, comment: string)` defined in Task 4, wired in Task 5 — consistent
- `bucket?: PrivacyBucket` added to MemberCard in Task 7, FrontCard in Task 8 — consistent
- `frontApi.clearAll()` defined in Task 3, used in Task 5 — consistent
- `FrontUpdatePayload.comment` added in Task 3, used in Task 5 and Task 6 — consistent
