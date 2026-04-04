# Share View Portal + Bucket Field Suppression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bucket-level custom field suppression and redesign the share view into a full-featured portal with member detail pages (Essence, Specs, Comms, Logs tabs).

**Architecture:** Backend: `BucketFieldExclusion` join entity; CRUD endpoints on `BucketsController`; `ShareController` updated to include `id`/`avatarPath`/`description` on share members, `id`/`customStatus`/`color` on front entries, apply exclusion filter, and add per-member board + history endpoints. Frontend: new `api/share.ts` typed module; `SharePage` full rewrite (Option B: split panel); new `ShareMemberDetailPage` (4-tab); `BucketSheet` updated with excluded fields section.

**Tech Stack:** .NET 8 / EF Core 8 / SQLite / xUnit, React 18 / TypeScript / TanStack Query / CSS Modules / React Router v6 / Lucide icons

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/PluralHost.Api/Domain/BucketFieldExclusion.cs` |
| Modify | `src/PluralHost.Api/Domain/PrivacyBucket.cs` |
| Modify | `src/PluralHost.Api/Data/PluralHostContext.cs` |
| Modify | `src/PluralHost.Api/Dto/NativeDtos.cs` |
| Modify | `src/PluralHost.Api/Controllers/BucketsController.cs` |
| Modify | `src/PluralHost.Api/Controllers/ShareController.cs` |
| Generate | EF Core migration `AddBucketFieldExclusions` |
| Modify | `tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs` |
| Modify | `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs` |
| Create | `src/PluralHost.Web/src/api/share.ts` |
| Modify | `src/PluralHost.Web/src/api/buckets.ts` |
| Modify | `src/PluralHost.Web/src/pages/SharePage.tsx` |
| Create | `src/PluralHost.Web/src/pages/SharePage.module.css` |
| Create | `src/PluralHost.Web/src/pages/ShareMemberDetailPage.tsx` |
| Create | `src/PluralHost.Web/src/pages/ShareMemberDetailPage.module.css` |
| Modify | `src/PluralHost.Web/src/components/BucketSheet.tsx` |
| Modify | `src/PluralHost.Web/src/App.tsx` |

---

## Task 1: BucketFieldExclusion entity + EF Core migration

**Files:**
- Create: `src/PluralHost.Api/Domain/BucketFieldExclusion.cs`
- Modify: `src/PluralHost.Api/Domain/PrivacyBucket.cs`
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs`

- [ ] **Step 1: Create `BucketFieldExclusion.cs`**

```csharp
// src/PluralHost.Api/Domain/BucketFieldExclusion.cs
namespace PluralHost.Api.Domain;

public class BucketFieldExclusion : BaseEntity
{
    public Guid BucketId { get; set; }
    public PrivacyBucket Bucket { get; set; } = null!;
    public Guid FieldId { get; set; }
    public CustomField Field { get; set; } = null!;
}
```

- [ ] **Step 2: Add nav property to `PrivacyBucket`**

In `src/PluralHost.Api/Domain/PrivacyBucket.cs`, add after `public ICollection<Member> Members`:

```csharp
public ICollection<BucketFieldExclusion> ExcludedFields { get; set; } = new List<BucketFieldExclusion>();
```

- [ ] **Step 3: Register in `PluralHostContext`**

Add DbSet after `PrivacyBuckets`:
```csharp
public DbSet<BucketFieldExclusion> BucketFieldExclusions => Set<BucketFieldExclusion>();
```

In `OnModelCreating`, after the PrivacyBucket block, add:
```csharp
// ── BucketFieldExclusion ──────────────────────────────────────────────
modelBuilder.Entity<BucketFieldExclusion>(b =>
{
    b.HasQueryFilter(e => e.DeletedAt == null);
    b.HasIndex(e => new { e.BucketId, e.FieldId }).IsUnique();
    b.HasOne(e => e.Bucket)
        .WithMany(bk => bk.ExcludedFields)
        .HasForeignKey(e => e.BucketId)
        .OnDelete(DeleteBehavior.Cascade);
    b.HasOne(e => e.Field)
        .WithMany()
        .HasForeignKey(e => e.FieldId)
        .OnDelete(DeleteBehavior.Cascade);
});
```

- [ ] **Step 4: Generate and apply migration**

```bash
cd C:/dev/simply-personal
dotnet ef migrations add AddBucketFieldExclusions --project src/PluralHost.Api --output-dir Data/Migrations
dotnet ef database update --project src/PluralHost.Api
```

Expected: migration file created in `Data/Migrations/`, `dotnet build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/BucketFieldExclusion.cs
git add src/PluralHost.Api/Domain/PrivacyBucket.cs
git add src/PluralHost.Api/Data/PluralHostContext.cs
git add src/PluralHost.Api/Data/Migrations/
git commit -m "feat: add BucketFieldExclusion entity and migration"
```

---

## Task 2: NativeDtos + BucketsController excluded fields CRUD

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/BucketsController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs`

- [ ] **Step 1: Write failing tests**

Open `tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs`. At the bottom of the class, add:

```csharp
// ── Excluded Fields ───────────────────────────────────────────────────

[Fact]
public async Task GetExcludedFields_ReturnsEmptyForNewBucket()
{
    var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10, IsDefault = false };
    _context.PrivacyBuckets.Add(bucket);
    await _context.SaveChangesAsync();

    var result = await _controller.GetExcludedFieldsAsync(bucket.Id);
    var ok = Assert.IsType<OkObjectResult>(result.Result);
    var list = Assert.IsAssignableFrom<IEnumerable<BucketExcludedFieldDto>>(ok.Value);
    Assert.Empty(list);
}

[Fact]
public async Task AddExcludedField_CreatesExclusion()
{
    var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10, IsDefault = false };
    var field = new CustomField { Label = "Trauma Notes", FieldType = FieldType.Text };
    _context.PrivacyBuckets.Add(bucket);
    _context.CustomFields.Add(field);
    await _context.SaveChangesAsync();

    var result = await _controller.AddExcludedFieldAsync(bucket.Id, new BucketExcludeFieldRequest(field.Id));
    var created = Assert.IsType<CreatedAtActionResult>(result.Result);
    var dto = Assert.IsType<BucketExcludedFieldDto>(created.Value);
    Assert.Equal(field.Id, dto.FieldId);
    Assert.Equal("Trauma Notes", dto.Label);
}

[Fact]
public async Task AddExcludedField_DuplicateIsIdempotent()
{
    var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10, IsDefault = false };
    var field = new CustomField { Label = "Notes", FieldType = FieldType.Text };
    _context.PrivacyBuckets.Add(bucket);
    _context.CustomFields.Add(field);
    await _context.SaveChangesAsync();
    _context.BucketFieldExclusions.Add(new BucketFieldExclusion { BucketId = bucket.Id, FieldId = field.Id });
    await _context.SaveChangesAsync();

    // Adding again should return 200 OK with existing record, not 500
    var result = await _controller.AddExcludedFieldAsync(bucket.Id, new BucketExcludeFieldRequest(field.Id));
    Assert.IsType<OkObjectResult>(result.Result);
}

[Fact]
public async Task RemoveExcludedField_SoftDeletesExclusion()
{
    var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10, IsDefault = false };
    var field = new CustomField { Label = "Notes", FieldType = FieldType.Text };
    _context.PrivacyBuckets.Add(bucket);
    _context.CustomFields.Add(field);
    await _context.SaveChangesAsync();
    _context.BucketFieldExclusions.Add(new BucketFieldExclusion { BucketId = bucket.Id, FieldId = field.Id });
    await _context.SaveChangesAsync();

    var result = await _controller.RemoveExcludedFieldAsync(bucket.Id, field.Id);
    Assert.IsType<NoContentResult>(result);
    Assert.Empty(_context.BucketFieldExclusions.Where(e => e.BucketId == bucket.Id && e.DeletedAt == null));
}
```

Run: `dotnet test tests/PluralHost.Tests/ --filter "GetExcludedFields|AddExcludedField|RemoveExcludedField" -v minimal`
Expected: FAIL (methods don't exist yet).

- [ ] **Step 2: Add DTOs to `NativeDtos.cs`**

In `NativeDtos.cs`, after the bucket DTOs (`BucketDto`, `BucketCreateRequest`, etc.), add:

```csharp
// ── BucketFieldExclusion ──────────────────────────────────────────────
public record BucketExcludedFieldDto(Guid FieldId, string Label);
public record BucketExcludeFieldRequest(Guid FieldId);
```

- [ ] **Step 3: Add excluded fields methods to `BucketsController`**

Add at the bottom of `BucketsController`, before the closing `}`:

```csharp
[HttpGet("{id:guid}/excluded-fields")]
public async Task<ActionResult<IEnumerable<BucketExcludedFieldDto>>> GetExcludedFieldsAsync(Guid id)
{
    var bucket = await context.PrivacyBuckets.FindAsync(id);
    if (bucket == null) return NotFound();

    var exclusions = await context.BucketFieldExclusions
        .Include(e => e.Field)
        .Where(e => e.BucketId == id)
        .Select(e => new BucketExcludedFieldDto(e.FieldId, e.Field.Label))
        .ToListAsync();

    return Ok(exclusions);
}

[HttpPost("{id:guid}/excluded-fields")]
public async Task<ActionResult<BucketExcludedFieldDto>> AddExcludedFieldAsync(Guid id, [FromBody] BucketExcludeFieldRequest req)
{
    var bucket = await context.PrivacyBuckets.FindAsync(id);
    if (bucket == null) return NotFound();

    var field = await context.CustomFields.FindAsync(req.FieldId);
    if (field == null) return NotFound();

    // Idempotent: if already excluded (including soft-deleted), restore or return existing
    var existing = await context.BucketFieldExclusions
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(e => e.BucketId == id && e.FieldId == req.FieldId);

    if (existing != null)
    {
        if (existing.DeletedAt != null) existing.Restore();
        await context.SaveChangesAsync();
        return Ok(new BucketExcludedFieldDto(existing.FieldId, field.Label));
    }

    var exclusion = new BucketFieldExclusion { BucketId = id, FieldId = req.FieldId };
    context.BucketFieldExclusions.Add(exclusion);
    await context.SaveChangesAsync();
    return CreatedAtAction(nameof(GetExcludedFieldsAsync), new { id }, new BucketExcludedFieldDto(req.FieldId, field.Label));
}

[HttpDelete("{id:guid}/excluded-fields/{fieldId:guid}")]
public async Task<IActionResult> RemoveExcludedFieldAsync(Guid id, Guid fieldId)
{
    var exclusion = await context.BucketFieldExclusions
        .FirstOrDefaultAsync(e => e.BucketId == id && e.FieldId == fieldId);
    if (exclusion == null) return NotFound();

    exclusion.SoftDelete();
    await context.SaveChangesAsync();
    return NoContent();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
dotnet test tests/PluralHost.Tests/ --filter "GetExcludedFields|AddExcludedField|RemoveExcludedField" -v minimal
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
dotnet test tests/PluralHost.Tests/ -v minimal
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs src/PluralHost.Api/Controllers/BucketsController.cs tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs
git commit -m "feat: add bucket excluded-fields CRUD endpoints"
```

---

## Task 3: ShareController — enrich response + exclusion filter + member detail endpoints

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/ShareController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`

### What changes in `GET /share/{token}`:
1. Member response gains: `id`, `avatarPath`, `description`
2. Front entries gain: `id` (member id), `color`, `avatarPath`, `customStatusLabel`, `customStatusColor`
3. Custom fields exclude any field whose `FieldId` is in the member's bucket's `ExcludedFields`
4. Must `.Include(m => m.Bucket.ExcludedFields)` when loading members

- [ ] **Step 1: Add `SharedFrontEntryDto` to `NativeDtos.cs`**

In `NativeDtos.cs`, in the "Share (token-holder endpoints)" section, add:

```csharp
public record SharedFrontEntryDto(
    Guid MemberId,
    string Name,
    string? DisplayName,
    string? Color,
    string? AvatarPath,
    string? CustomStatusLabel,
    string? CustomStatusColor);
```

- [ ] **Step 2: Write failing ShareController tests**

In `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`, add:

```csharp
[Fact]
public async Task GetSharedView_MemberResponseIncludesId()
{
    // Arrange: set up a valid token + member in Public bucket
    var token = await CreateTokenWithPermission(0); // Public
    var member = CreatePublicMember("Raziel");
    _context.Members.Add(member);
    await _context.SaveChangesAsync();

    // Act
    var result = await _shareController.GetSharedViewAsync(token.TokenValue);

    // Assert
    var ok = Assert.IsType<OkObjectResult>(result);
    var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
    Assert.Contains(member.Id.ToString(), json);
}

[Fact]
public async Task GetSharedView_ExcludedFieldsAreHidden()
{
    // Arrange
    var bucket = _context.PrivacyBuckets.First(b => b.Id == PrivacyBucket.PublicId);
    var field = new CustomField { Label = "Trauma Notes", FieldType = FieldType.Text };
    _context.CustomFields.Add(field);
    await _context.SaveChangesAsync();

    // Exclude "Trauma Notes" from the Public bucket
    _context.BucketFieldExclusions.Add(new BucketFieldExclusion { BucketId = bucket.Id, FieldId = field.Id });

    var member = CreatePublicMember("Raziel");
    _context.Members.Add(member);
    await _context.SaveChangesAsync();
    // Add field value for member
    _context.CustomFieldValues.Add(new CustomFieldValue
    {
        FieldId = field.Id, MemberId = member.Id,
        Value = "sensitive", BucketId = bucket.Id
    });
    await _context.SaveChangesAsync();

    var token = await CreateTokenWithPermission(0);

    // Act
    var result = await _shareController.GetSharedViewAsync(token.TokenValue);

    // Assert: "sensitive" should NOT appear in the response
    var ok = Assert.IsType<OkObjectResult>(result);
    var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
    Assert.DoesNotContain("sensitive", json);
}

[Fact]
public async Task GetSharedBoard_ReturnsBoardMessagesForVisibleMember()
{
    var token = await CreateTokenWithPermission(0);
    var member = CreatePublicMember("Raziel");
    _context.Members.Add(member);
    await _context.SaveChangesAsync();
    _context.BoardMessages.Add(new BoardMessage
    {
        MemberId = member.Id, AuthorName = "Friend", Content = "Hello Raziel"
    });
    await _context.SaveChangesAsync();

    var result = await _shareController.GetSharedBoardAsync(token.TokenValue, member.Id);

    var ok = Assert.IsType<OkObjectResult>(result);
    var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
    Assert.Contains("Hello Raziel", json);
}

[Fact]
public async Task GetSharedHistory_ReturnsFrontHistoryForVisibleMember()
{
    var token = await CreateTokenWithPermission(0);
    var member = CreatePublicMember("Raziel");
    _context.Members.Add(member);
    await _context.SaveChangesAsync();
    _context.FrontHistory.Add(new FrontHistory
    {
        MemberId = member.Id,
        FrontStart = DateTime.UtcNow.AddHours(-2),
        FrontEnd = DateTime.UtcNow.AddHours(-1),
    });
    await _context.SaveChangesAsync();

    var result = await _shareController.GetSharedHistoryAsync(token.TokenValue, member.Id);

    var ok = Assert.IsType<OkObjectResult>(result);
    var json = System.Text.Json.JsonSerializer.Serialize(ok.Value);
    Assert.Contains(member.Id.ToString(), json);
}
```

(If `CreateTokenWithPermission` / `CreatePublicMember` helpers don't exist in the test file yet, add them as private helpers that seed a valid AccessToken and a Public-bucket Member respectively.)

Run tests — expected: FAIL (new methods don't exist yet).

- [ ] **Step 3: Update `ShareController.GetSharedViewAsync`**

Replace the `rawMembers` load + `members` projection with:

```csharp
var rawMembers = await visibility
    .FilterByPermission(context.Members, accessToken.MinBucketSortOrder)
    .Include(m => m.CustomFieldValues)
        .ThenInclude(cfv => cfv.Field)
    .Include(m => m.CustomFieldValues)
        .ThenInclude(cfv => cfv.Bucket)
    .Include(m => m.Bucket!)
        .ThenInclude(b => b.ExcludedFields)
    .ToListAsync();

var members = rawMembers.Select(m =>
{
    var excludedFieldIds = m.Bucket?.ExcludedFields
        .Select(e => e.FieldId).ToHashSet() ?? new HashSet<Guid>();

    return new
    {
        id = m.Id,
        m.Name,
        m.DisplayName,
        m.Pronouns,
        m.Color,
        m.AvatarPath,
        m.Description,
        m.Status,
        customFields = m.CustomFieldValues
            .Where(cfv => cfv.Field != null &&
                          cfv.Field.DeletedAt == null &&
                          cfv.Bucket != null &&
                          cfv.Bucket.SortOrder <= accessToken.MinBucketSortOrder &&
                          !excludedFieldIds.Contains(cfv.FieldId))
            .Select(cfv => new SharedCustomFieldDto(cfv.Field!.Label, cfv.Field.FieldType, cfv.Value))
            .ToList()
    };
}).ToList();
```

Replace the `currentFront` projection:

```csharp
var currentFront = await context.FrontHistory
    .Include(f => f.Member)
        .ThenInclude(m => m!.Bucket)
    .Include(f => f.CustomStatus)
    .Where(f => f.FrontEnd == null &&
                f.Member != null &&
                f.Member.DeletedAt == null &&
                f.Member.Bucket != null &&
                f.Member.Bucket.SortOrder <= accessToken.MinBucketSortOrder)
    .ToListAsync();

var visibleFront = currentFront
    .Select(f => new SharedFrontEntryDto(
        f.Member!.Id,
        f.Member.Name,
        f.Member.DisplayName,
        f.Member.Color,
        f.Member.AvatarPath,
        f.CustomStatus?.Label,
        f.CustomStatus?.Color))
    .ToList();
```

Return: `return Ok(new { members, currentFront = visibleFront });`

- [ ] **Step 4: Add `GET /share/{token}/board/{memberId}` to ShareController**

```csharp
// GET /share/{token}/board/{memberId}
[HttpGet("{token}/board/{memberId:guid}")]
public async Task<IActionResult> GetSharedBoardAsync(string token, Guid memberId)
{
    if (await ghostMode.IsFrozenAsync())
        return Ok(Array.Empty<object>());

    var result = await tokenService.ResolveTokenAsync(token);
    if (result.Status == TokenResolveStatus.Expired)
        return Unauthorized(new { error = "Token has expired." });
    if (result.Status != TokenResolveStatus.Valid)
        return Unauthorized(new { error = "Token is invalid." });

    var accessToken = result.Token!;
    if (accessToken.MinBucketSortOrder == -1)
        return StatusCode(403, new { error = "Not permitted" });

    // Verify member is visible to this token
    var member = await visibility
        .FilterByPermission(context.Members, accessToken.MinBucketSortOrder)
        .FirstOrDefaultAsync(m => m.Id == memberId);

    if (member == null) return NotFound();

    var messages = await context.BoardMessages
        .Where(b => b.MemberId == memberId)
        .OrderByDescending(b => b.CreatedAt)
        .Select(b => new BoardMessageResponse(b.Id, b.MemberId, b.AuthorName, b.Content, b.TokenId, b.CreatedAt))
        .ToListAsync();

    return Ok(messages);
}
```

- [ ] **Step 5: Add `GET /share/{token}/history/{memberId}` to ShareController**

```csharp
// GET /share/{token}/history/{memberId}
[HttpGet("{token}/history/{memberId:guid}")]
public async Task<IActionResult> GetSharedHistoryAsync(string token, Guid memberId)
{
    if (await ghostMode.IsFrozenAsync())
        return Ok(Array.Empty<object>());

    var result = await tokenService.ResolveTokenAsync(token);
    if (result.Status == TokenResolveStatus.Expired)
        return Unauthorized(new { error = "Token has expired." });
    if (result.Status != TokenResolveStatus.Valid)
        return Unauthorized(new { error = "Token is invalid." });

    var accessToken = result.Token!;
    if (accessToken.MinBucketSortOrder == -1)
        return StatusCode(403, new { error = "Not permitted" });

    var member = await visibility
        .FilterByPermission(context.Members, accessToken.MinBucketSortOrder)
        .FirstOrDefaultAsync(m => m.Id == memberId);

    if (member == null) return NotFound();

    var history = await context.FrontHistory
        .Include(f => f.CustomStatus)
        .Where(f => f.MemberId == memberId)
        .OrderByDescending(f => f.FrontStart)
        .Take(100)
        .Select(f => new
        {
            frontStart = f.FrontStart,
            frontEnd = f.FrontEnd,
            statusLabel = f.CustomStatus != null ? f.CustomStatus.Label : (string?)null,
            statusColor = f.CustomStatus != null ? f.CustomStatus.Color : (string?)null,
        })
        .ToListAsync();

    return Ok(history);
}
```

- [ ] **Step 6: Run all tests**

```bash
dotnet test tests/PluralHost.Tests/ -v minimal
```

Expected: all tests pass (including the 4 new ones from Step 2).

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs src/PluralHost.Api/Controllers/ShareController.cs tests/PluralHost.Tests/Controllers/ShareControllerTests.cs
git commit -m "feat: enrich share response with member IDs, exclusion filter, board+history endpoints"
```

---

## Task 4: Frontend API modules

**Files:**
- Create: `src/PluralHost.Web/src/api/share.ts`
- Modify: `src/PluralHost.Web/src/api/buckets.ts`

- [ ] **Step 1: Create `src/PluralHost.Web/src/api/share.ts`**

```typescript
// src/PluralHost.Web/src/api/share.ts

export interface ShareMember {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  description?: string
  customFields: { label: string; fieldType: number; value: string }[]
}

export interface ShareFrontEntry {
  memberId: string
  name: string
  displayName?: string
  color?: string
  avatarPath?: string
  customStatusLabel?: string
  customStatusColor?: string
}

export interface ShareData {
  members: ShareMember[]
  currentFront: ShareFrontEntry[]
}

export interface ShareBoardMessage {
  id: string
  memberId: string
  authorName: string
  content: string
  createdAt: string
}

export interface ShareHistoryEntry {
  frontStart: string
  frontEnd?: string
  statusLabel?: string
  statusColor?: string
}

const BASE = '/share'

async function shareGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (res.status === 204 || res.status === 401 || res.status === 403)
    return [] as unknown as T
  if (!res.ok) throw new Error(res.status.toString())
  return res.json()
}

export const shareApi = {
  get: (token: string): Promise<ShareData> =>
    fetch(`${BASE}/${token}`, { credentials: 'include' })
      .then(r => {
        if (r.status === 204 || r.status === 401) return { members: [], currentFront: [] }
        if (!r.ok) throw new Error(r.status.toString())
        return r.json()
      }),

  getBoard: (token: string, memberId: string): Promise<ShareBoardMessage[]> =>
    shareGet(`${BASE}/${token}/board/${memberId}`),

  getHistory: (token: string, memberId: string): Promise<ShareHistoryEntry[]> =>
    shareGet(`${BASE}/${token}/history/${memberId}`),
}
```

- [ ] **Step 2: Add excluded fields methods to `api/buckets.ts`**

Add to `bucketsApi` object (after `reorder`):

```typescript
listExcludedFields: (bucketId: string) =>
  apiFetch<{ fieldId: string; label: string }[]>(`/api/buckets/${bucketId}/excluded-fields`),

addExcludedField: (bucketId: string, fieldId: string) =>
  apiFetch<{ fieldId: string; label: string }>(`/api/buckets/${bucketId}/excluded-fields`, {
    method: 'POST',
    body: JSON.stringify({ fieldId }),
  }),

removeExcludedField: (bucketId: string, fieldId: string) =>
  apiFetch<void>(`/api/buckets/${bucketId}/excluded-fields/${fieldId}`, { method: 'DELETE' }),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd src/PluralHost.Web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/api/share.ts src/PluralHost.Web/src/api/buckets.ts
git commit -m "feat: add share API module and bucket excluded-fields methods"
```

---

## Task 5: SharePage.tsx rewrite — Option B split panel

**Files:**
- Modify: `src/PluralHost.Web/src/pages/SharePage.tsx`
- Create: `src/PluralHost.Web/src/pages/SharePage.module.css`

The split panel layout: left panel (240px) shows fronting alters; right panel (flex: 1) shows member list. On mobile (`<640px`): stacked, fronting on top. Members are clickable links to `/view/:token/members/:id`.

- [ ] **Step 1: Write `SharePage.module.css`**

```css
/* src/PluralHost.Web/src/pages/SharePage.module.css */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&display=swap');

.page {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  padding: var(--space-6) var(--space-5) var(--space-8);
  max-width: 1000px;
  margin: 0 auto;
}

.header {
  margin-bottom: var(--space-7);
}

.eyebrow {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--color-muted);
  margin-bottom: var(--space-1);
}

.pageTitle {
  font-family: 'Space Grotesk', var(--font-sans);
  font-size: 2rem;
  font-weight: 800;
  line-height: 1.1;
  margin: 0;
}

.accent {
  color: var(--color-primary);
}

.split {
  display: flex;
  gap: var(--space-6);
  align-items: flex-start;
}

.leftPanel {
  width: 240px;
  flex-shrink: 0;
  position: sticky;
  top: var(--space-6);
}

.rightPanel {
  flex: 1;
  min-width: 0;
}

.panelLabel {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-muted);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-border);
}

.frontCard {
  background: var(--color-surface);
  border-radius: 10px;
  padding: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  border-left: 3px solid var(--color-primary);
}

.frontInfo {
  flex: 1;
  min-width: 0;
}

.memberName {
  font-weight: 700;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.memberPronouns {
  font-size: 0.72rem;
  color: var(--color-muted);
}

.statusRow {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: 2px;
}

.statusDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.statusLabel {
  font-size: 0.7rem;
}

.liveBadge {
  font-size: 0.58rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(182, 255, 0, 0.12);
  color: var(--color-primary);
  margin-left: var(--space-1);
}

.memberRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: 10px;
  margin-bottom: var(--space-2);
  cursor: pointer;
  border: 1px solid transparent;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s;
  width: 100%;
  text-align: left;
}

.memberRow:hover {
  border-color: var(--color-border);
}

.memberInfo {
  flex: 1;
  min-width: 0;
}

.fieldChips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.fieldChip {
  font-size: 0.68rem;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--color-surface-2, #1f1f1f);
  border: 1px solid var(--color-border);
  color: var(--color-muted);
}

.frontingDot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 6px var(--color-primary);
  flex-shrink: 0;
}

.empty {
  color: var(--color-muted);
  padding: var(--space-6) 0;
  font-size: 0.9rem;
}

.errorState {
  color: var(--color-muted);
  padding: var(--space-8) 0;
}

@media (max-width: 640px) {
  .split {
    flex-direction: column;
  }

  .leftPanel {
    width: 100%;
    position: static;
  }
}
```

- [ ] **Step 2: Rewrite `SharePage.tsx`**

```tsx
// src/PluralHost.Web/src/pages/SharePage.tsx
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Avatar from '../components/Avatar'
import { shareApi } from '../api/share'
import styles from './SharePage.module.css'

export default function SharePage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['share', token],
    queryFn: () => shareApi.get(token!),
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 30_000,
  })

  const frontingIds = new Set((data?.currentFront ?? []).map(f => f.memberId))

  if (isLoading) return (
    <div className={styles.page}>
      <p className={styles.empty}>Loading…</p>
    </div>
  )

  if (isError) return (
    <div className={styles.page}>
      <p className={styles.errorState}>This link is invalid or has expired.</p>
    </div>
  )

  if (!data?.members.length && !data?.currentFront.length) return (
    <div className={styles.page}>
      <p className={styles.empty}>Nothing to show right now.</p>
    </div>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>System View</span>
        <h1 className={styles.pageTitle}>
          Currently <span className={styles.accent}>Fronting</span>
        </h1>
      </header>

      <div className={styles.split}>
        <aside className={styles.leftPanel}>
          <p className={styles.panelLabel}>
            {data.currentFront.length > 0 ? `${data.currentFront.length} active` : 'No one fronting'}
          </p>
          {data.currentFront.length === 0 && (
            <p className={styles.empty} style={{ fontSize: '0.8rem' }}>Quiet right now.</p>
          )}
          {data.currentFront.map(f => (
            <Link
              key={f.memberId}
              to={`/view/${token}/members/${f.memberId}`}
              className={styles.memberRow}
              style={{ marginBottom: 'var(--space-2)', borderLeftColor: f.color ?? 'var(--color-primary)', borderLeftWidth: 3 }}
            >
              <Avatar
                name={f.displayName || f.name}
                color={f.color}
                avatarPath={f.avatarPath}
                isFronting
                size="sm"
              />
              <div className={styles.frontInfo}>
                <div className={styles.memberName}>
                  {f.displayName || f.name}
                  <span className={styles.liveBadge}>Live</span>
                </div>
                {f.customStatusLabel && (
                  <div className={styles.statusRow}>
                    <span
                      className={styles.statusDot}
                      style={{ background: f.customStatusColor ?? 'var(--color-muted)' }}
                    />
                    <span className={styles.statusLabel} style={{ color: f.customStatusColor ?? 'var(--color-muted)' }}>
                      {f.customStatusLabel}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </aside>

        <main className={styles.rightPanel}>
          <p className={styles.panelLabel}>Members · {data.members.length}</p>
          {data.members.map(m => (
            <Link
              key={m.id}
              to={`/view/${token}/members/${m.id}`}
              className={styles.memberRow}
            >
              {frontingIds.has(m.id) && <span className={styles.frontingDot} />}
              <Avatar
                name={m.displayName || m.name}
                color={m.color}
                avatarPath={m.avatarPath}
                size="sm"
              />
              <div className={styles.memberInfo}>
                <div className={styles.memberName}>{m.displayName || m.name}</div>
                {m.pronouns && <div className={styles.memberPronouns}>{m.pronouns}</div>}
                {m.customFields.length > 0 && (
                  <div className={styles.fieldChips}>
                    {m.customFields.slice(0, 3).map(f => (
                      <span key={f.label} className={styles.fieldChip}>{f.label}: {f.value}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd src/PluralHost.Web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/pages/SharePage.tsx src/PluralHost.Web/src/pages/SharePage.module.css
git commit -m "feat: rewrite SharePage with split-panel layout and CSS Modules"
```

---

## Task 6: ShareMemberDetailPage

**Files:**
- Create: `src/PluralHost.Web/src/pages/ShareMemberDetailPage.tsx`
- Create: `src/PluralHost.Web/src/pages/ShareMemberDetailPage.module.css`

This page shows a member's full profile within the share view. Route: `/view/:token/members/:memberId`.
Data sources:
- **Essence + Specs**: from cached `['share', token]` query — find member by ID, no extra fetch
- **Comms**: `GET /share/{token}/board/{memberId}`
- **Logs**: `GET /share/{token}/history/{memberId}`

- [ ] **Step 1: Create `ShareMemberDetailPage.module.css`**

```css
/* src/PluralHost.Web/src/pages/ShareMemberDetailPage.module.css */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700;800&display=swap');

.page {
  min-height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  padding: var(--space-5) var(--space-5) var(--space-10);
  max-width: 680px;
  margin: 0 auto;
}

.backLink {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: 0.8rem;
  color: var(--color-muted);
  text-decoration: none;
  margin-bottom: var(--space-5);
}

.backLink:hover {
  color: var(--color-text);
}

.hero {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.heroInfo {
  flex: 1;
}

.memberName {
  font-family: 'Space Grotesk', var(--font-sans);
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0 0 var(--space-1);
}

.pronouns {
  font-size: 0.8rem;
  color: var(--color-muted);
}

.tabBar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-5);
}

.tab {
  padding: var(--space-2) var(--space-4);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s;
}

.tab:hover {
  color: var(--color-text);
}

.tabActive {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.description {
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--color-muted);
  margin-bottom: var(--space-4);
}

.fieldRow {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.875rem;
}

.fieldLabel {
  color: var(--color-muted);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.fieldValue {
  color: var(--color-text);
}

.boardMessage {
  background: var(--color-surface);
  border-radius: 10px;
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-2);
}

.messageAuthor {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-muted);
  margin-bottom: var(--space-1);
}

.messageContent {
  font-size: 0.875rem;
  line-height: 1.5;
}

.historyRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 0.85rem;
}

.historyTime {
  color: var(--color-muted);
  font-size: 0.75rem;
}

.statusBadge {
  font-size: 0.72rem;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.empty {
  color: var(--color-muted);
  padding: var(--space-6) 0;
  font-size: 0.85rem;
}

.notFound {
  color: var(--color-muted);
  padding: var(--space-8) 0;
}
```

- [ ] **Step 2: Create `ShareMemberDetailPage.tsx`**

```tsx
// src/PluralHost.Web/src/pages/ShareMemberDetailPage.tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import Avatar from '../components/Avatar'
import { shareApi } from '../api/share'
import styles from './ShareMemberDetailPage.module.css'

const TABS = ['Essence', 'Specs', 'Comms', 'Logs'] as const
type Tab = typeof TABS[number]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function ShareMemberDetailPage() {
  const { token, memberId } = useParams<{ token: string; memberId: string }>()
  const [activeTab, setActiveTab] = useState<Tab>('Essence')

  const { data: shareData } = useQuery({
    queryKey: ['share', token],
    queryFn: () => shareApi.get(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const { data: board = [] } = useQuery({
    queryKey: ['share-board', token, memberId],
    queryFn: () => shareApi.getBoard(token!, memberId!),
    enabled: !!token && !!memberId && activeTab === 'Comms',
  })

  const { data: history = [] } = useQuery({
    queryKey: ['share-history', token, memberId],
    queryFn: () => shareApi.getHistory(token!, memberId!),
    enabled: !!token && !!memberId && activeTab === 'Logs',
  })

  const member = shareData?.members.find(m => m.id === memberId)

  if (shareData && !member) return (
    <div className={styles.page}>
      <p className={styles.notFound}>Member not found.</p>
    </div>
  )

  return (
    <div className={styles.page}>
      <Link to={`/view/${token}`} className={styles.backLink}>
        <ChevronLeft size={14} />
        Back to system view
      </Link>

      {member && (
        <>
          <div className={styles.hero}>
            <Avatar
              name={member.displayName || member.name}
              color={member.color}
              avatarPath={member.avatarPath}
              size="lg"
            />
            <div className={styles.heroInfo}>
              <h1 className={styles.memberName}>{member.displayName || member.name}</h1>
              {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
            </div>
          </div>

          <div className={styles.tabBar}>
            {TABS.map(tab => (
              <button
                key={tab}
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Essence' && (
            <div>
              {member.description
                ? <p className={styles.description}>{member.description}</p>
                : <p className={styles.empty}>No description.</p>
              }
            </div>
          )}

          {activeTab === 'Specs' && (
            <div>
              {member.customFields.length === 0
                ? <p className={styles.empty}>No fields to display.</p>
                : member.customFields.map(f => (
                  <div key={f.label} className={styles.fieldRow}>
                    <span className={styles.fieldLabel}>{f.label}</span>
                    <span className={styles.fieldValue}>{f.value}</span>
                  </div>
                ))
              }
            </div>
          )}

          {activeTab === 'Comms' && (
            <div>
              {board.length === 0
                ? <p className={styles.empty}>No board messages.</p>
                : board.map(msg => (
                  <div key={msg.id} className={styles.boardMessage}>
                    <div className={styles.messageAuthor}>{msg.authorName} · {formatDate(msg.createdAt)}</div>
                    <div className={styles.messageContent}>{msg.content}</div>
                  </div>
                ))
              }
            </div>
          )}

          {activeTab === 'Logs' && (
            <div>
              {history.length === 0
                ? <p className={styles.empty}>No front history.</p>
                : history.map((h, i) => (
                  <div key={i} className={styles.historyRow}>
                    <div>
                      <div>{formatDate(h.frontStart)}</div>
                      <div className={styles.historyTime}>
                        {formatTime(h.frontStart)}{h.frontEnd ? ` → ${formatTime(h.frontEnd)}` : ' (active)'}
                      </div>
                    </div>
                    {h.statusLabel && (
                      <span
                        className={styles.statusBadge}
                        style={{ color: h.statusColor ?? undefined, borderColor: h.statusColor ?? undefined }}
                      >
                        {h.statusLabel}
                      </span>
                    )}
                  </div>
                ))
              }
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd src/PluralHost.Web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/pages/ShareMemberDetailPage.tsx src/PluralHost.Web/src/pages/ShareMemberDetailPage.module.css
git commit -m "feat: add ShareMemberDetailPage with Essence/Specs/Comms/Logs tabs"
```

---

## Task 7: App.tsx — add member detail route

**Files:**
- Modify: `src/PluralHost.Web/src/App.tsx`

- [ ] **Step 1: Add import and route**

In `App.tsx`, add import:
```tsx
import ShareMemberDetailPage from './pages/ShareMemberDetailPage'
```

Add route after the existing `/view/:token` route:
```tsx
<Route path="/view/:token/members/:memberId" element={<ShareMemberDetailPage />} />
```

- [ ] **Step 2: Verify TypeScript and run frontend tests**

```bash
cd src/PluralHost.Web && npx tsc --noEmit && npx vitest run
```

Expected: TypeScript clean, existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/App.tsx
git commit -m "feat: add share member detail route /view/:token/members/:memberId"
```

---

## Task 8: BucketSheet — excluded fields management UI

**Files:**
- Modify: `src/PluralHost.Web/src/components/BucketSheet.tsx`
- Modify: `src/PluralHost.Web/src/components/BucketSheet.module.css`

This adds a collapsible "Hidden Fields" section below the member picker. Only shown in edit mode (when `bucket !== null`).

- [ ] **Step 1: Add excluded fields state + query to `BucketSheet.tsx`**

After the existing `const [error, setError] = useState...` line, add:
```tsx
const qc = useQueryClient() // already exists at top

const { data: allFields = [] } = useQuery({
  queryKey: ['fields'],
  queryFn: () => apiFetch<{ id: string; label: string; fieldType: number; sortOrder: number }[]>('/api/fields'),
  enabled: isOpen && !!bucket,
})

const { data: excludedFields = [], refetch: refetchExcluded } = useQuery({
  queryKey: ['bucket-excluded-fields', bucket?.id],
  queryFn: () => bucketsApi.listExcludedFields(bucket!.id),
  enabled: isOpen && !!bucket,
})
```

You'll need to add `import { apiFetch } from '../api/client'` if not already imported.

- [ ] **Step 2: Add mutation handlers**

After the `saveMutation`, add:

```tsx
const addExclusionMutation = useMutation({
  mutationFn: (fieldId: string) => bucketsApi.addExcludedField(bucket!.id, fieldId),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['bucket-excluded-fields', bucket?.id] })
    refetchExcluded()
  },
})

const removeExclusionMutation = useMutation({
  mutationFn: (fieldId: string) => bucketsApi.removeExcludedField(bucket!.id, fieldId),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['bucket-excluded-fields', bucket?.id] })
    refetchExcluded()
  },
})
```

- [ ] **Step 3: Add Hidden Fields section to the JSX**

In the BucketSheet JSX, after the member picker section and before the delete button section, add (only when `bucket !== null`):

```tsx
{bucket && (
  <div className={styles.section}>
    <p className={styles.sectionLabel}>Hidden Fields</p>
    <p className={styles.sectionHint}>Fields suppressed for all members in this bucket</p>
    {excludedFields.length > 0 && (
      <div className={styles.excludedList}>
        {excludedFields.map(ef => (
          <div key={ef.fieldId} className={styles.excludedItem}>
            <span>{ef.label}</span>
            <button
              className={styles.removeBtn}
              onClick={() => removeExclusionMutation.mutate(ef.fieldId)}
              aria-label={`Remove ${ef.label} from hidden fields`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    )}
    {allFields.filter(f => !excludedFields.some(e => e.fieldId === f.id)).length > 0 && (
      <select
        className={styles.fieldSelect}
        value=""
        onChange={e => { if (e.target.value) addExclusionMutation.mutate(e.target.value) }}
      >
        <option value="">+ Add hidden field…</option>
        {allFields
          .filter(f => !excludedFields.some(e => e.fieldId === f.id))
          .map(f => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
      </select>
    )}
  </div>
)}
```

Add `X` to the Lucide import: `import { Trash2, X } from 'lucide-react'`

- [ ] **Step 4: Add CSS for new section to `BucketSheet.module.css`**

Read the current file first, then append:

```css
.sectionHint {
  font-size: 0.72rem;
  color: var(--color-muted);
  margin-bottom: var(--space-2);
}

.excludedList {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}

.excludedItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-2, #1f1f1f);
  border-radius: 8px;
  font-size: 0.85rem;
}

.removeBtn {
  background: none;
  border: none;
  color: var(--color-muted);
  cursor: pointer;
  padding: 2px;
  line-height: 0;
}

.removeBtn:hover {
  color: var(--color-danger);
}

.fieldSelect {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.85rem;
  cursor: pointer;
}
```

- [ ] **Step 5: Build and verify**

```bash
cd src/PluralHost.Web && npx tsc --noEmit && npx vitest run
```

Expected: no errors, no test regressions.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/BucketSheet.tsx src/PluralHost.Web/src/components/BucketSheet.module.css
git commit -m "feat: add excluded fields management to BucketSheet"
```

---

## Task 9: Full test run + branch push

- [ ] **Step 1: Run full backend test suite**

```bash
dotnet test tests/PluralHost.Tests/ -v minimal
```

Expected: all tests pass.

- [ ] **Step 2: Run full frontend test suite + build**

```bash
cd src/PluralHost.Web && npx vitest run && npm run build
```

Expected: all tests pass, build succeeds with no TypeScript errors.

- [ ] **Step 3: Push branch**

```bash
git push origin HEAD
```

---

## Self-Review Checklist

- [x] **BucketFieldExclusion entity** → Task 1
- [x] **Excluded fields CRUD endpoints** → Task 2
- [x] **Share response includes member `id`** → Task 3
- [x] **Exclusion filter applied in share response** → Task 3
- [x] **`customStatus` (label + color) on front entries** → Task 3
- [x] **Per-member board messages endpoint** → Task 3
- [x] **Per-member front history endpoint** → Task 3
- [x] **`api/share.ts` typed module** → Task 4
- [x] **`api/buckets.ts` excluded fields methods** → Task 4
- [x] **SharePage Option B split panel layout** → Task 5
- [x] **SharePage uses CSS Modules** → Task 5
- [x] **Member list items link to detail page** → Task 5
- [x] **ShareMemberDetailPage Essence tab** → Task 6
- [x] **ShareMemberDetailPage Specs tab (custom fields)** → Task 6
- [x] **ShareMemberDetailPage Comms tab (board messages)** → Task 6
- [x] **ShareMemberDetailPage Logs tab (front history)** → Task 6
- [x] **Route `/view/:token/members/:memberId`** → Task 7
- [x] **BucketSheet hidden fields section** → Task 8
- [x] **Space Grotesk headers on all share pages** → Task 5 + 6
