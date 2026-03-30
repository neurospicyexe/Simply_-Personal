# Plan A — Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 bugs: duplicate relationship guard, missing BottomNav scroll clearance, front history missing duration, SystemMap cramped viewport.

**Architecture:** Pure bug fixes — no new endpoints, no migrations, no new files. Each task is self-contained and safe to ship independently.

**Tech Stack:** .NET 8 / ASP.NET Core (C#), xUnit, React + TypeScript, Vitest + Testing Library, CSS Modules.

---

## File Map

| File | Change |
|------|--------|
| `src/PluralHost.Api/Controllers/MemberRelationshipsController.cs` | Add AnyAsync duplicate check in CreateAsync |
| `tests/PluralHost.Tests/Controllers/MemberRelationshipsControllerTests.cs` | Add 2 new tests for duplicate guard |
| `src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx` | Add isError state + inline error display |
| `src/PluralHost.Web/src/pages/FrontPage.module.css` | Add padding-bottom to .page |
| `src/PluralHost.Web/src/pages/MembersPage.module.css` | Add padding-bottom to .page |
| `src/PluralHost.Web/src/pages/SettingsPage.module.css` | Add padding-bottom to .page |
| `src/PluralHost.Web/src/pages/LogsPage.module.css` | Standardise padding-bottom to calc() form |
| `src/PluralHost.Web/src/pages/LogsPage.tsx` | Add formatDuration helper + update History tab render |
| `src/PluralHost.Web/src/__tests__/LogsPage.test.tsx` | Add 2 tests for duration display |
| `src/PluralHost.Web/src/pages/MembersPage.module.css` | Change .mapContent height to full viewport |

---

## Task 1: Duplicate relationship guard — backend

**Files:**
- Modify: `src/PluralHost.Api/Controllers/MemberRelationshipsController.cs:43-45`
- Test: `tests/PluralHost.Tests/Controllers/MemberRelationshipsControllerTests.cs`

- [ ] **Step 1: Write the two failing tests**

Add these two tests to `MemberRelationshipsControllerTests.cs` after the existing `Create_WithLabelTooLong_Returns400` test:

```csharp
[Fact]
public async Task Create_ReturnConflict_WhenSamePairAndLabelExists()
{
    var (ctx, ctrl) = Setup(nameof(Create_ReturnConflict_WhenSamePairAndLabelExists));
    var fromId = SeedMember(ctx);
    var toId = SeedMember(ctx);
    ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "siblings" });
    ctx.SaveChanges();

    var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "siblings", false));
    Assert.IsType<ConflictObjectResult>(result);
}

[Fact]
public async Task Create_Returns201_WhenSamePairDifferentLabel()
{
    var (ctx, ctrl) = Setup(nameof(Create_Returns201_WhenSamePairDifferentLabel));
    var fromId = SeedMember(ctx);
    var toId = SeedMember(ctx);
    ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "mom" });
    ctx.SaveChanges();

    var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "caretaker", false));
    Assert.IsType<CreatedAtActionResult>(result);
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/dev/simply-personal
dotnet test tests/PluralHost.Tests --filter "Create_ReturnConflict_WhenSamePairAndLabelExists|Create_Returns201_WhenSamePairDifferentLabel" -v minimal
```

Expected: 2 failing tests.

- [ ] **Step 3: Add the duplicate check to CreateAsync**

In `MemberRelationshipsController.cs`, insert after line 43 (the `toExists` check), before the `var rel = new MemberRelationship` block:

```csharp
var duplicate = await context.MemberRelationships.AnyAsync(r =>
    r.FromMemberId == body.FromMemberId &&
    r.ToMemberId == body.ToMemberId &&
    r.Label.ToLower() == body.Label.Trim().ToLower() &&
    r.DeletedAt == null);
if (duplicate)
    return Conflict(new { error = "A relationship with this label already exists between these alters." });
```

The method should now look like:

```csharp
[HttpPost]
public async Task<IActionResult> CreateAsync([FromBody] MemberRelationshipCreateRequest body)
{
    if (string.IsNullOrWhiteSpace(body.Label))
        return BadRequest(new { error = "Label is required" });

    if (body.Label.Trim().Length > 100)
        return BadRequest(new { error = "Label must be 100 characters or fewer" });

    if (body.FromMemberId == body.ToMemberId)
        return BadRequest(new { error = "A member cannot have a relationship with themselves" });

    var fromExists = await context.Members.AnyAsync(m => m.Id == body.FromMemberId);
    if (!fromExists) return BadRequest(new { error = "FromMember not found or deleted" });

    var toExists = await context.Members.AnyAsync(m => m.Id == body.ToMemberId);
    if (!toExists) return BadRequest(new { error = "ToMember not found or deleted" });

    var duplicate = await context.MemberRelationships.AnyAsync(r =>
        r.FromMemberId == body.FromMemberId &&
        r.ToMemberId == body.ToMemberId &&
        r.Label.ToLower() == body.Label.Trim().ToLower() &&
        r.DeletedAt == null);
    if (duplicate)
        return Conflict(new { error = "A relationship with this label already exists between these alters." });

    var rel = new MemberRelationship
    {
        FromMemberId = body.FromMemberId,
        ToMemberId = body.ToMemberId,
        Label = body.Label.Trim(),
        IsDirected = body.IsDirected
    };
    context.MemberRelationships.Add(rel);
    await context.SaveChangesAsync();
    return CreatedAtAction(nameof(GetAllAsync), ToResponse(rel));
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
dotnet test tests/PluralHost.Tests --filter "Create_ReturnConflict_WhenSamePairAndLabelExists|Create_Returns201_WhenSamePairDifferentLabel" -v minimal
```

Expected: 2 passing.

- [ ] **Step 5: Run full test suite**

```bash
dotnet test tests/PluralHost.Tests -v minimal
```

Expected: all tests pass (was 309 before this task).

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/MemberRelationshipsController.cs tests/PluralHost.Tests/Controllers/MemberRelationshipsControllerTests.cs
git commit -m "fix: block duplicate (pair + label) member relationships with 409 Conflict"
```

---

## Task 2: Duplicate relationship guard — frontend error display

**Files:**
- Modify: `src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx`

- [ ] **Step 1: Add isError to the mutation and show inline error**

In `NewRelationshipSheet.tsx`, replace the `useMutation` block and add the error display:

```tsx
const { mutate, isPending, isError, reset } = useMutation({
  mutationFn: () =>
    relationshipsApi.create({
      fromMemberId: fromMember.id,
      toMemberId: toMember.id,
      label: label.trim(),
      isDirected,
    }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['relationships'] })
    setLabel('')
    setIsDirected(false)
    onClose()
  },
})
```

Update `handleClose` to reset error state when closing:

```tsx
function handleClose() {
  setLabel('')
  setIsDirected(false)
  reset()
  onClose()
}
```

Add the error message in the JSX, between the input and the direction buttons (after the `<input>` block, before the `<div style={{ display: 'flex', gap: 6 }}>` direction toggle):

```tsx
{isError && (
  <p style={{ color: 'var(--color-danger)', fontSize: 11, margin: '0' }}>
    A &quot;{label.trim()}&quot; connection already exists between these alters.
  </p>
)}
```

- [ ] **Step 2: Run frontend tests**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web
npx vitest run
```

Expected: all tests pass (no test changes needed for this task — NewRelationshipSheet has no existing tests).

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx
git commit -m "fix: show inline error in NewRelationshipSheet on duplicate connection attempt"
```

---

## Task 3: BottomNav scroll clearance

**Files:**
- Modify: `src/PluralHost.Web/src/pages/FrontPage.module.css`
- Modify: `src/PluralHost.Web/src/pages/MembersPage.module.css`
- Modify: `src/PluralHost.Web/src/pages/SettingsPage.module.css`
- Modify: `src/PluralHost.Web/src/pages/LogsPage.module.css`

No tests needed — pure CSS layout fix.

- [ ] **Step 1: Fix FrontPage.module.css**

Change `.page` from:
```css
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}
```
To:
```css
.page {
  padding: 16px;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  max-width: 600px;
  margin: 0 auto;
}
```

- [ ] **Step 2: Fix MembersPage.module.css**

Change `.page` from:
```css
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}
```
To:
```css
.page {
  padding: 16px;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  max-width: 600px;
  margin: 0 auto;
}
```

- [ ] **Step 3: Fix SettingsPage.module.css**

Change `.page` from:
```css
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}
```
To:
```css
.page {
  padding: 16px;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  max-width: 600px;
  margin: 0 auto;
}
```

- [ ] **Step 4: Standardise LogsPage.module.css**

Change `.page` from:
```css
.page {
  padding: 16px;
  padding-bottom: 80px;
}
```
To:
```css
.page {
  padding: 16px;
  padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
}
```

- [ ] **Step 5: Run frontend tests to confirm no regressions**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/pages/FrontPage.module.css src/PluralHost.Web/src/pages/MembersPage.module.css src/PluralHost.Web/src/pages/SettingsPage.module.css src/PluralHost.Web/src/pages/LogsPage.module.css
git commit -m "fix: add BottomNav scroll clearance to all pages missing padding-bottom"
```

---

## Task 4: Front history duration display

**Files:**
- Modify: `src/PluralHost.Web/src/pages/LogsPage.tsx`
- Modify: `src/PluralHost.Web/src/__tests__/LogsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

First, add these imports near the top of `LogsPage.test.tsx`, after the existing `vi.mock(...)` blocks and before `import LogsPage`:

```tsx
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
```

Then add these two tests inside the existing `describe('LogsPage', ...)` block:

```tsx
it('shows time range and duration for history entry with endTime', async () => {
  const START = new Date('2026-01-01T14:00:00Z').getTime()
  const END = new Date('2026-01-01T17:20:00Z').getTime() // 3h 20m after START
  vi.mocked(frontApi.history).mockResolvedValue([
    { content: { uid: 'uid1', member: 'member-id', startTime: START, endTime: END, live: false } },
  ])
  vi.mocked(membersApi.list).mockResolvedValue([])
  render(wrap('/logs?tab=history'))
  expect(await screen.findByText(/→/)).toBeInTheDocument()
  expect(await screen.findByText(/3h 20m/)).toBeInTheDocument()
})

it('shows ongoing when history entry has no endTime', async () => {
  const START = new Date('2026-01-01T14:00:00Z').getTime()
  vi.mocked(frontApi.history).mockResolvedValue([
    { content: { uid: 'uid2', member: 'member-id', startTime: START, live: true } },
  ])
  vi.mocked(membersApi.list).mockResolvedValue([])
  render(wrap('/logs?tab=history'))
  expect(await screen.findByText(/ongoing/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web
npx vitest run --reporter=verbose 2>&1 | grep -A3 "duration\|ongoing"
```

Expected: 2 failing tests.

- [ ] **Step 3: Add formatDuration helper and update History tab render in LogsPage.tsx**

After the existing `formatDate` function (line 26), add:

```tsx
function formatDuration(startMs: number, endMs: number): string {
  const totalMinutes = Math.floor((endMs - startMs) / 60000)
  if (totalMinutes < 1) return '< 1m'
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}
```

Replace the History tab render block (lines 121-138) with:

```tsx
{activeTab === 'History' && (
  <div>
    {(frontHistory as SpEnvelope<FrontContent>[])
      .slice()
      .sort((a, b) => b.content.startTime - a.content.startTime)
      .map(e => {
        const m = memberMap[e.content.member]
        const endMs = e.content.endTime ?? null
        const endDisplay = endMs ? formatDate(endMs) : 'now'
        const duration = endMs
          ? formatDuration(e.content.startTime, endMs)
          : 'ongoing'
        return (
          <div key={e.content.uid} className={styles.historyCard}>
            <div className={styles.historyMember}>{m?.name ?? e.content.member}</div>
            <div className={styles.historyTime}>
              {formatDate(e.content.startTime)} → {endDisplay} · ({duration})
            </div>
          </div>
        )
      })}
    {frontHistory.length === 0 && (
      <p className={styles.empty}>No switches logged yet. Front changes will show up here.</p>
    )}
  </div>
)}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web
npx vitest run
```

Expected: all tests pass including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/pages/LogsPage.tsx src/PluralHost.Web/src/__tests__/LogsPage.test.tsx
git commit -m "fix: show start → end time and duration in front history tab"
```

---

## Task 5: SystemMap full viewport height

**Files:**
- Modify: `src/PluralHost.Web/src/pages/MembersPage.module.css:137-142`

No tests needed — CSS layout only.

- [ ] **Step 1: Update .mapContent height**

In `MembersPage.module.css`, change `.mapContent` from:

```css
.mapContent {
  height: 600px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-surface);
}
```

To:

```css
.mapContent {
  height: calc(100vh - 64px);
  border-radius: 10px;
  overflow: hidden;
  background: var(--color-surface);
}
```

- [ ] **Step 2: Run frontend tests**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/pages/MembersPage.module.css
git commit -m "fix: expand SystemMap to full viewport height in map view mode"
```

---

## Final check

- [ ] **Run full backend test suite**

```bash
cd C:/dev/simply-personal
dotnet test tests/PluralHost.Tests -v minimal
```

Expected: all tests pass (was 309 before; should be 311 after Tasks 1).

- [ ] **Run full frontend test suite**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web
npx vitest run
```

Expected: all tests pass (was 107 before; should be 109 after Task 4).
