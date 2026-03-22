# Plan 7b -- Groups Management & Privacy Buckets Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "System" nav page with Groups and Buckets tabs, migrating the backend privacy model from a fixed enum to a first-class `PrivacyBucket` entity with CRUD endpoints.

**Architecture:** Two EF Core migrations -- Migration 1 adds the `PrivacyBuckets` table and seeds default buckets while data-transforming Members and AccessTokens; Migration 2 drops the legacy columns after code is updated. Backend-first: all domain changes compile before any migration runs. Frontend uses TanStack Query throughout.

**Tech Stack:** .NET 8, EF Core 8 / SQLite, xUnit + Moq, React + TypeScript, Vite, TanStack Query, CSS Modules, Lucide React

**Spec:** `docs/superpowers/specs/2026-03-22-plan7b-groups-buckets-design.md`

---

## File Map

### New Backend Files
- `src/PluralHost.Api/Domain/PrivacyBucket.cs` — entity with Id, Name, Description, Emoji, Color, SortOrder, IsDefault
- `src/PluralHost.Api/Controllers/BucketsController.cs` — GET/POST/PUT/DELETE/reorder /api/buckets
- `src/PluralHost.Api/Controllers/GroupsController.cs` — native groups CRUD + POST /api/groups/{id}/members
- `tests/PluralHost.Tests/Domain/PrivacyBucketTests.cs`
- `tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs`
- `tests/PluralHost.Tests/Controllers/GroupsControllerTests.cs`

### Modified Backend Files
- `src/PluralHost.Api/Domain/Member.cs` — remove `PrivacyTier`, add `BucketId` (Guid FK) + `Bucket` nav prop
- `src/PluralHost.Api/Domain/AccessToken.cs` — remove `Permission` enum, add `MinBucketSortOrder` (int)
- `src/PluralHost.Api/Services/ITokenVisibilityService.cs` — `FilterByPermission` takes `int` not `TokenPermission`
- `src/PluralHost.Api/Services/TokenVisibilityService.cs` — SortOrder comparison, ReadFrontOnly guard on `-1`
- `src/PluralHost.Api/Data/PluralHostContext.cs` — add `PrivacyBuckets` DbSet, configure entity, update global filters
- `src/PluralHost.Api/Dto/NativeDtos.cs` — add `BucketDto`, replace `PrivacyTier` with `BucketId` in request/response records, add `ReorderItem`, `SetGroupMembersRequest`
- `src/PluralHost.Api/Controllers/SpMembersController.cs` — `PrivacyTier` → `BucketId`, lookup default buckets
- `src/PluralHost.Api/Controllers/MembersController.cs` — `PrivacyTier` → `BucketId`
- `src/PluralHost.Api/Controllers/TokensController.cs` — `Permission` → `MinBucketSortOrder`
- `src/PluralHost.Api/Controllers/ShareController.cs` — `TokenPermission.ReadFrontOnly` check → `token.MinBucketSortOrder == -1`
- `tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs`
- `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs`
- `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`
- `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs`
- `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`

### New Frontend Files
- `src/PluralHost.Web/src/api/buckets.ts`
- `src/PluralHost.Web/src/pages/SystemPage.tsx` + `SystemPage.module.css`
- `src/PluralHost.Web/src/components/MemberPickerList.tsx` + `MemberPickerList.module.css`
- `src/PluralHost.Web/src/components/GroupSheet.tsx` + `GroupSheet.module.css`
- `src/PluralHost.Web/src/components/BucketSheet.tsx` + `BucketSheet.module.css`

### Modified Frontend Files
- `src/PluralHost.Web/src/types.ts` — add `PrivacyBucket`, update `Member` (`bucketId`), update `Group` (`memberCount`), update `MemberUpdatePayload`
- `src/PluralHost.Web/src/api/groups.ts` — add native API calls, `setGroupMembers` batch endpoint
- `src/PluralHost.Web/src/components/BottomNav.tsx` — add System tab
- `src/PluralHost.Web/src/App.tsx` — add `/system` route
- `src/PluralHost.Web/src/components/tabs/AccessTab.tsx` — `privacyTier` → `bucketId`, bucket picker from API

---

## Task 1: PrivacyBucket Entity

**Files:**
- Create: `src/PluralHost.Api/Domain/PrivacyBucket.cs`
- Create: `tests/PluralHost.Tests/Domain/PrivacyBucketTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
// tests/PluralHost.Tests/Domain/PrivacyBucketTests.cs
using PluralHost.Api.Domain;

public class PrivacyBucketTests
{
    [Fact]
    public void PrivacyBucket_HasRequiredName()
    {
        var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10 };
        Assert.Equal("Test", bucket.Name);
        Assert.Equal(10, bucket.SortOrder);
        Assert.False(bucket.IsDefault);
    }

    [Fact]
    public void PrivacyBucket_SoftDelete_SetsDeletedAt()
    {
        var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10 };
        bucket.SoftDelete();
        Assert.NotNull(bucket.DeletedAt);
    }

    [Fact]
    public void PrivacyBucket_DefaultBucketGuids_AreStable()
    {
        Assert.Equal(
            Guid.Parse("00000000-0000-0000-0000-000000000001"),
            PrivacyBucket.PublicId);
        Assert.Equal(
            Guid.Parse("00000000-0000-0000-0000-000000000004"),
            PrivacyBucket.PrivateId);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd C:/dev/simply-personal
dotnet test tests/PluralHost.Tests --filter "PrivacyBucketTests" -v minimal 2>&1 | tail -5
```

Expected: build error — `PrivacyBucket` not found.

- [ ] **Step 3: Create the entity**

```csharp
// src/PluralHost.Api/Domain/PrivacyBucket.cs
namespace PluralHost.Api.Domain;

public class PrivacyBucket : BaseEntity
{
    // Fixed GUIDs for the 4 default buckets — used in migrations and SP compat
    public static readonly Guid PublicId  = Guid.Parse("00000000-0000-0000-0000-000000000001");
    public static readonly Guid FriendId  = Guid.Parse("00000000-0000-0000-0000-000000000002");
    public static readonly Guid TrustedId = Guid.Parse("00000000-0000-0000-0000-000000000003");
    public static readonly Guid PrivateId = Guid.Parse("00000000-0000-0000-0000-000000000004");

    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Emoji { get; set; }
    public string? Color { get; set; }
    public int SortOrder { get; set; }
    public bool IsDefault { get; set; }

    public ICollection<Member> Members { get; set; } = new List<Member>();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
dotnet test tests/PluralHost.Tests --filter "PrivacyBucketTests" -v minimal 2>&1 | tail -5
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/PrivacyBucket.cs tests/PluralHost.Tests/Domain/PrivacyBucketTests.cs
git commit -m "feat: add PrivacyBucket entity with fixed default GUIDs"
```

---

## Task 2: Update PluralHostContext

**Files:**
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs`

- [ ] **Step 1: Read the current context file**

Open `src/PluralHost.Api/Data/PluralHostContext.cs`. Locate:
- The `DbSet<Member>` declaration
- The `HasQueryFilter` calls for Member, FrontHistory, Group
- The `OnModelCreating` method

- [ ] **Step 2: Add PrivacyBuckets DbSet and configuration**

Add to the DbSet declarations:
```csharp
public DbSet<PrivacyBucket> PrivacyBuckets => Set<PrivacyBucket>();
```

Add to `OnModelCreating` (after Group configuration):
```csharp
modelBuilder.Entity<PrivacyBucket>(b =>
{
    b.HasKey(p => p.Id);
    b.Property(p => p.Name).IsRequired().HasMaxLength(150);
    b.Property(p => p.Description).HasMaxLength(500);
    b.Property(p => p.Emoji).HasMaxLength(10);
    b.HasQueryFilter(p => p.DeletedAt == null);
    // Ghost Mode does NOT apply — buckets are owner-only admin data
});
```

Add the FK relationship on Member (after Member configuration — Member.BucketId will be added in Task 3, but configure the relationship here):
```csharp
modelBuilder.Entity<Member>()
    .HasOne<PrivacyBucket>(m => m.Bucket)
    .WithMany(b => b.Members)
    .HasForeignKey(m => m.BucketId)
    .OnDelete(DeleteBehavior.Restrict);
```

- [ ] **Step 3: Do NOT commit yet**

The FK relationship references `Member.BucketId` which doesn't exist until Task 3. Committing here would leave the build broken. Continue to Task 3 and commit both together.

---

## Task 3: Update Member and AccessToken Entities (Phase 1 -- add new columns)

**Files:**
- Modify: `src/PluralHost.Api/Domain/Member.cs`
- Modify: `src/PluralHost.Api/Domain/AccessToken.cs`

Keep `PrivacyTier` and `Permission` on the entities for now — they'll be removed in Task 7 after all controllers are updated. Add the new columns alongside.

- [ ] **Step 1: Add BucketId to Member**

In `src/PluralHost.Api/Domain/Member.cs`, add after `PrivacyTier`:

```csharp
// Replaces PrivacyTier — kept temporarily for migration
public MemberPrivacy PrivacyTier { get; set; } = MemberPrivacy.Public;

// New: FK to PrivacyBucket (nullable until Migration 1 runs)
public Guid? BucketId { get; set; }
public PrivacyBucket? Bucket { get; set; }
```

- [ ] **Step 2: Add MinBucketSortOrder to AccessToken**

In `src/PluralHost.Api/Domain/AccessToken.cs`, add after `Permission`:

```csharp
// Replaces Permission — kept temporarily for migration
public TokenPermission Permission { get; set; } = TokenPermission.ReadFrontOnly;

// New: replaces Permission enum. ReadFrontOnly → -1, Public → 0, Friend → 1, Trusted → 2+
public int MinBucketSortOrder { get; set; } = -1;
```

- [ ] **Step 3: Verify project builds**

```bash
dotnet build src/PluralHost.Api 2>&1 | tail -5
```

Expected: 0 errors, 0 warnings (or only unrelated warnings).

- [ ] **Step 4: Commit (includes context changes from Task 2)**

```bash
git add src/PluralHost.Api/Data/PluralHostContext.cs src/PluralHost.Api/Domain/Member.cs src/PluralHost.Api/Domain/AccessToken.cs
git commit -m "feat: add PrivacyBuckets context config, BucketId to Member, MinBucketSortOrder to AccessToken"
```

---

## Task 4: Migration 1 -- AddPrivacyBuckets

**Files:**
- Generate + modify: `src/PluralHost.Api/Data/Migrations/<timestamp>_AddPrivacyBuckets.cs`

- [ ] **Step 1: Generate the migration**

```bash
cd C:/dev/simply-personal
dotnet ef migrations add AddPrivacyBuckets --project src/PluralHost.Api --output-dir Data/Migrations 2>&1 | tail -5
```

Expected: `Build succeeded. Done. To undo this migration, use 'ef migrations remove'`

- [ ] **Step 2: Open the generated migration file**

Find the file at `src/PluralHost.Api/Data/Migrations/<timestamp>_AddPrivacyBuckets.cs`. It should contain `CreateTable("PrivacyBuckets", ...)`, `AddColumn Members.BucketId`, and `AddColumn AccessTokens.MinBucketSortOrder`.

- [ ] **Step 3: Manually add seed and data-migration SQL**

In the `Up()` method, immediately AFTER the `CreateTable("PrivacyBuckets", ...)` block, insert:

```csharp
// Seed the 4 default buckets with fixed GUIDs
migrationBuilder.Sql(@"
    INSERT INTO ""PrivacyBuckets""
        (""Id"", ""Name"", ""Description"", ""Emoji"", ""Color"", ""SortOrder"", ""IsDefault"",
         ""DeletedAt"", ""CreatedAt"", ""UpdatedAt"")
    VALUES
        ('00000000-0000-0000-0000-000000000001', 'Public',  'Visible to everyone',           '🌐', NULL, 0, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('00000000-0000-0000-0000-000000000002', 'Friend',  'Visible to friends',            '🤝', NULL, 1, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('00000000-0000-0000-0000-000000000003', 'Trusted', 'Visible to trusted people',     '💛', NULL, 2, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
        ('00000000-0000-0000-0000-000000000004', 'Private', 'Never visible to token holders','🔒', NULL, 3, 1, NULL, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
");
```

In the `Up()` method, immediately AFTER the `AddColumn Members.BucketId` block:

```csharp
// Map existing PrivacyTier enum values to bucket GUIDs
migrationBuilder.Sql(@"
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000001' WHERE ""PrivacyTier"" = 0 OR ""PrivacyTier"" IS NULL;
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000002' WHERE ""PrivacyTier"" = 1;
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000003' WHERE ""PrivacyTier"" = 2;
    UPDATE ""Members"" SET ""BucketId"" = '00000000-0000-0000-0000-000000000004' WHERE ""PrivacyTier"" = 3;
");
```

In the `Up()` method, immediately AFTER the `AddColumn AccessTokens.MinBucketSortOrder` block:

```csharp
// Map existing TokenPermission enum values to MinBucketSortOrder
migrationBuilder.Sql(@"
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" = -1 WHERE ""Permission"" = 0;
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" =  0 WHERE ""Permission"" = 1;
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" =  1 WHERE ""Permission"" = 2;
    UPDATE ""AccessTokens"" SET ""MinBucketSortOrder"" =  2 WHERE ""Permission"" = 3;
");
```

- [ ] **Step 4: Apply migration to verify it runs cleanly**

```bash
dotnet ef database update --project src/PluralHost.Api 2>&1 | tail -5
```

Expected: `Applying migration '..._AddPrivacyBuckets'. Done.`

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Data/Migrations/
git commit -m "feat: migration AddPrivacyBuckets -- seeds default buckets, populates BucketId and MinBucketSortOrder"
```

---

## Task 5: Update TokenVisibilityService

**Files:**
- Modify: `src/PluralHost.Api/Services/ITokenVisibilityService.cs`
- Modify: `src/PluralHost.Api/Services/TokenVisibilityService.cs`
- Modify: `tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs`

- [ ] **Step 1: Write updated failing tests**

Open `tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs`. Replace all `FilterByPermission(members, TokenPermission.X)` calls with `FilterByPermission(members, X)` where X is the new int:
- `TokenPermission.Public` → `0`
- `TokenPermission.Friend` → `1`
- `TokenPermission.Trusted` → `2`
- Any test calling with `ReadFrontOnly` → now calls with `-1`

Add a new test for the ReadFrontOnly guard:
```csharp
[Fact]
public void FilterByPermission_ThrowsOnReadFrontOnly()
{
    var svc = new TokenVisibilityService();
    var members = new List<Member>().AsQueryable();
    Assert.Throws<InvalidOperationException>(
        () => svc.FilterByPermission(members, -1).ToList());
}
```

- [ ] **Step 2: Update the interface**

In `ITokenVisibilityService.cs`:
```csharp
/// <summary>
/// Filters members to those visible at the given minimum bucket SortOrder.
/// Throws InvalidOperationException if called with -1 (ReadFrontOnly).
/// Uses less-than-or-equal: member.Bucket.SortOrder <= minBucketSortOrder.
/// (MinBucketSortOrder mapping absorbs the old enum offset: Public→0, Friend→1, Trusted→2.
/// Public members (SortOrder=0) ARE visible to Public tokens (minBucketSortOrder=0) via <=.)
/// </summary>
IQueryable<Member> FilterByPermission(IQueryable<Member> members, int minBucketSortOrder);

/// <summary>
/// Returns true when the token may post to the member's board.
/// Requires: MinBucketSortOrder >= 1 (Friend tier or more permissive),
/// token.AllowsBoardPosting, member.AllowsBoardPosting.
/// </summary>
bool CanPostToBoard(AccessToken token, Member member);
```

- [ ] **Step 3: Update the implementation**

In `TokenVisibilityService.cs`:
```csharp
public IQueryable<Member> FilterByPermission(IQueryable<Member> members, int minBucketSortOrder)
{
    if (minBucketSortOrder == -1)
        throw new InvalidOperationException(
            "ReadFrontOnly tokens (MinBucketSortOrder = -1) must not call FilterByPermission. " +
            "The front endpoint handles this case separately.");

    return members.Where(m => m.Bucket!.SortOrder <= minBucketSortOrder);
}

public bool CanPostToBoard(AccessToken token, Member member) =>
    token.MinBucketSortOrder >= 1 &&
    token.AllowsBoardPosting &&
    member.AllowsBoardPosting;
```

- [ ] **Step 4: Run tests**

```bash
dotnet test tests/PluralHost.Tests --filter "TokenVisibilityServiceTests" -v minimal 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Services/ tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs
git commit -m "feat: update TokenVisibilityService to use SortOrder int instead of TokenPermission enum"
```

---

## Task 6: Update NativeDtos

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`

- [ ] **Step 1: Add BucketDto and update Member records**

In `NativeDtos.cs`, add:
```csharp
public record BucketDto(
    Guid Id, string Name, string? Description, string? Emoji,
    string? Color, int SortOrder, bool IsDefault, int MemberCount);

public record ReorderItem(Guid Id, int SortOrder);

public record SetGroupMembersRequest(List<Guid> MemberIds);
```

Update `MemberResponse` (the outgoing DTO): replace `MemberPrivacy PrivacyTier` with `Guid BucketId`.

Update `MemberUpdateRequest`: replace `MemberPrivacy? PrivacyTier` with `Guid? BucketId`.

Update `MemberCreateRequest`: replace `MemberPrivacy PrivacyTier = MemberPrivacy.Public` with `Guid BucketId = default` (will default to Public bucket in controller).

Update `ShareMemberContent` (used in share endpoint): replace `MemberPrivacy PrivacyTier` with `Guid BucketId`.

- [ ] **Step 2: Build to find all compile errors**

```bash
dotnet build src/PluralHost.Api 2>&1 | grep "error CS" | head -20
```

Note all files with errors — these are the controllers to fix in the next task.

- [ ] **Step 3: Commit NativeDtos**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: update NativeDtos -- BucketDto, replace PrivacyTier with BucketId in Member DTOs"
```

---

## Task 7: Fix Controllers to Use BucketId

**Files:**
- Modify: `src/PluralHost.Api/Controllers/MembersController.cs`
- Modify: `src/PluralHost.Api/Controllers/SpMembersController.cs`
- Modify: `src/PluralHost.Api/Controllers/TokensController.cs`
- Modify: `src/PluralHost.Api/Controllers/ShareController.cs`

- [ ] **Step 1: Fix MembersController**

Find all references to `PrivacyTier` in `MembersController.cs`. Replace:
- `member.PrivacyTier = body.PrivacyTier` → `member.BucketId = body.BucketId ?? PrivacyBucket.PublicId`
- Any `Include(m => m.PrivacyTier)` → `Include(m => m.Bucket)`
- In query includes, add `.Include(m => m.Bucket)` so SortOrder is available
- `new MemberCreateRequest` default PrivacyTier → `BucketId = PrivacyBucket.PublicId`
- `MemberResponse` construction: `BucketId: member.BucketId ?? PrivacyBucket.PublicId`

- [ ] **Step 2: Fix SpMembersController**

Replace the `PrivacyTier` mapping logic:
```csharp
// ToEnvelope: Private flag
Private: member.BucketId == PrivacyBucket.PrivateId,
```

```csharp
// Create: default to Public bucket
BucketId = body.Private ? PrivacyBucket.PrivateId : PrivacyBucket.PublicId
```

```csharp
// Update: private flag mapping
if (body.Private is not null)
{
    if (body.Private.Value)
        member.BucketId = PrivacyBucket.PrivateId;
    else if (member.BucketId == PrivacyBucket.PrivateId)
        member.BucketId = PrivacyBucket.PublicId;
    // else: false on non-Private tier → leave unchanged
}
```

- [ ] **Step 3: Fix TokensController**

Find references to `TokenPermission` enum and `Permission`. Replace:
- `Permission = body.Permission` → `MinBucketSortOrder = body.MinBucketSortOrder`
- Update the `TokenCreateRequest` DTO in NativeDtos to use `int MinBucketSortOrder = -1` instead of `TokenPermission Permission`
- Update response DTO accordingly

- [ ] **Step 4: Fix ShareController**

Replace:
- `token.Permission == TokenPermission.ReadFrontOnly` → `token.MinBucketSortOrder == -1`
- `service.FilterByPermission(members, token.Permission)` → `service.FilterByPermission(members, token.MinBucketSortOrder)`
- `service.CanPostToBoard(token, member)` — no change needed, already uses `token`

- [ ] **Step 5: Verify build is clean**

```bash
dotnet build src/PluralHost.Api 2>&1 | grep "error CS"
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/ src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: update controllers to use BucketId and MinBucketSortOrder"
```

---

## Task 8: Remove Legacy Privacy Columns (Phase 2)

**Files:**
- Modify: `src/PluralHost.Api/Domain/Member.cs`
- Modify: `src/PluralHost.Api/Domain/AccessToken.cs`
- Generate: Migration `CleanupLegacyPrivacyColumns`

- [ ] **Step 1: Remove PrivacyTier from Member**

Delete from `Member.cs`:
```csharp
public MemberPrivacy PrivacyTier { get; set; } = MemberPrivacy.Public;
```
Also delete the `MemberPrivacy` enum from `Member.cs` (or keep it if still referenced elsewhere -- check with `dotnet build` first).

Make `BucketId` non-nullable:
```csharp
public Guid BucketId { get; set; } = PrivacyBucket.PublicId;
public PrivacyBucket? Bucket { get; set; }
```

- [ ] **Step 2: Remove Permission from AccessToken**

Delete from `AccessToken.cs`:
```csharp
public TokenPermission Permission { get; set; } = TokenPermission.ReadFrontOnly;
```
Also delete the `TokenPermission` enum from `AccessToken.cs`.

Make `MinBucketSortOrder` the authoritative field (already non-nullable with default -1).

- [ ] **Step 3: Build to verify no remaining references**

```bash
dotnet build src/PluralHost.Api 2>&1 | grep "error CS"
```

Fix any remaining compile errors.

- [ ] **Step 4: Generate the cleanup migration**

```bash
dotnet ef migrations add CleanupLegacyPrivacyColumns --project src/PluralHost.Api --output-dir Data/Migrations 2>&1 | tail -5
```

Expected: migration generated. It will contain table rebuilds for `Members` and `AccessTokens` (SQLite drops columns via table rebuild). Verify the generated migration does NOT try to drop data that was already migrated in Task 4.

- [ ] **Step 5: Apply migration**

```bash
dotnet ef database update --project src/PluralHost.Api 2>&1 | tail -5
```

Expected: Done.

- [ ] **Step 6: Run all existing backend tests**

```bash
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -10
```

Expected: many failures due to `PrivacyTier`/`TokenPermission` references in tests — that's Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Domain/ src/PluralHost.Api/Data/Migrations/
git commit -m "feat: remove legacy PrivacyTier and TokenPermission columns after data migration"
```

---

## Task 9: Fix Affected Tests

**Files:**
- Modify: `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`
- Modify: `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs`
- Modify: `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs`
- Modify: `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`

- [ ] **Step 1: Find all failing tests**

```bash
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | grep "FAILED\|error CS" | head -30
```

- [ ] **Step 2: Fix MembersControllerTests**

Replace `PrivacyTier = MemberPrivacy.X` → `BucketId = PrivacyBucket.XId` in test setup.

The InMemory DB provider doesn't enforce FK constraints, so just set the Guid directly. No need to seed PrivacyBucket rows in these tests unless the Include path is tested.

- [ ] **Step 3: Fix SpMembersControllerTests**

Replace assertions like `Assert.Equal(MemberPrivacy.Private, member.PrivacyTier)` with `Assert.Equal(PrivacyBucket.PrivateId, member.BucketId)`.

Replace `Private: true` response checks with bucket ID checks.

- [ ] **Step 4: Fix TokensControllerTests**

Replace `Permission = TokenPermission.X` → `MinBucketSortOrder = X` (where X is the mapped int).

- [ ] **Step 5: Fix ShareControllerTests**

Replace all `TokenPermission` references with `MinBucketSortOrder` ints. Replace `PrivacyTier` with `BucketId`.

- [ ] **Step 6: Run full test suite**

```bash
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -10
```

Expected: all 278 tests pass (or more, with new tests from Tasks 1 and 5).

- [ ] **Step 7: Commit**

```bash
git add tests/PluralHost.Tests/
git commit -m "test: update affected tests to use BucketId and MinBucketSortOrder"
```

---

## Task 10: BucketsController

**Files:**
- Create: `src/PluralHost.Api/Controllers/BucketsController.cs`
- Create: `tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs`

- [ ] **Step 1: Write the failing tests**

```csharp
// tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

public class BucketsControllerTests : IDisposable
{
    private readonly PluralHostContext _ctx;
    private readonly BucketsController _sut;

    public BucketsControllerTests()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _ctx = new PluralHostContext(opts);
        SeedDefaults();
        _sut = new BucketsController(_ctx);
    }

    private void SeedDefaults()
    {
        _ctx.PrivacyBuckets.AddRange(
            new PrivacyBucket { Id = PrivacyBucket.PublicId,  Name = "Public",  SortOrder = 0, IsDefault = true },
            new PrivacyBucket { Id = PrivacyBucket.FriendId,  Name = "Friend",  SortOrder = 1, IsDefault = true },
            new PrivacyBucket { Id = PrivacyBucket.TrustedId, Name = "Trusted", SortOrder = 2, IsDefault = true },
            new PrivacyBucket { Id = PrivacyBucket.PrivateId, Name = "Private", SortOrder = 3, IsDefault = true });
        _ctx.SaveChanges();
    }

    [Fact]
    public async Task GetAll_ReturnsFourDefaults()
    {
        var result = await _sut.GetAllAsync();
        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var buckets = Assert.IsAssignableFrom<IEnumerable<BucketDto>>(ok.Value);
        Assert.Equal(4, buckets.Count());
    }

    [Fact]
    public async Task Create_AddsCustomBucket()
    {
        var req = new BucketCreateRequest("Test", null, "🔥", null);
        var result = await _sut.CreateAsync(req);
        Assert.IsType<CreatedAtActionResult>(result.Result);
        Assert.Equal(5, _ctx.PrivacyBuckets.Count());
    }

    [Fact]
    public async Task Delete_DefaultBucket_Returns400()
    {
        var result = await _sut.DeleteAsync(PrivacyBucket.PublicId);
        var bad = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("Default", bad.Value!.ToString());
    }

    [Fact]
    public async Task Delete_CustomBucket_SoftDeletes()
    {
        var custom = new PrivacyBucket { Name = "Custom", SortOrder = 10, IsDefault = false };
        _ctx.PrivacyBuckets.Add(custom);
        _ctx.SaveChanges();

        await _sut.DeleteAsync(custom.Id);
        var found = _ctx.PrivacyBuckets.IgnoreQueryFilters().First(b => b.Id == custom.Id);
        Assert.NotNull(found.DeletedAt);
    }

    public void Dispose() => _ctx.Dispose();
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
dotnet test tests/PluralHost.Tests --filter "BucketsControllerTests" -v minimal 2>&1 | tail -5
```

Expected: build error — `BucketsController` not found.

- [ ] **Step 3: Add DTOs to NativeDtos.cs**

```csharp
public record BucketCreateRequest(
    string Name, string? Description, string? Emoji, string? Color);

public record BucketUpdateRequest(
    string? Name, string? Description, string? Emoji, string? Color, int? SortOrder);
```

- [ ] **Step 4: Create BucketsController**

```csharp
// src/PluralHost.Api/Controllers/BucketsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("api/buckets")]
[Authorize]
public class BucketsController(PluralHostContext context) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<BucketDto>>> GetAllAsync()
    {
        var buckets = await context.PrivacyBuckets
            .OrderBy(b => b.SortOrder)
            .Select(b => new BucketDto(
                b.Id, b.Name, b.Description, b.Emoji, b.Color, b.SortOrder, b.IsDefault,
                b.Members.Count(m => m.DeletedAt == null)))
            .ToListAsync();
        return Ok(buckets);
    }

    [HttpPost]
    public async Task<ActionResult<BucketDto>> CreateAsync([FromBody] BucketCreateRequest req)
    {
        var maxSort = await context.PrivacyBuckets.MaxAsync(b => (int?)b.SortOrder) ?? 3;
        var bucket = new PrivacyBucket
        {
            Name = req.Name,
            Description = req.Description,
            Emoji = req.Emoji,
            Color = req.Color,
            SortOrder = maxSort + 1,
            IsDefault = false,
        };
        context.PrivacyBuckets.Add(bucket);
        await context.SaveChangesAsync();
        var dto = new BucketDto(bucket.Id, bucket.Name, bucket.Description,
            bucket.Emoji, bucket.Color, bucket.SortOrder, bucket.IsDefault, 0);
        return CreatedAtAction(nameof(GetAllAsync), dto);
    }

    [HttpPut("reorder")]   // MUST be declared before {id} route
    public async Task<IActionResult> ReorderAsync([FromBody] List<ReorderItem> items)
    {
        foreach (var item in items)
        {
            var bucket = await context.PrivacyBuckets.FindAsync(item.Id);
            if (bucket == null || bucket.IsDefault) continue;
            bucket.SortOrder = item.SortOrder;
            bucket.UpdatedAt = DateTime.UtcNow;
        }
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<BucketDto>> UpdateAsync(Guid id, [FromBody] BucketUpdateRequest req)
    {
        var bucket = await context.PrivacyBuckets.FindAsync(id);
        if (bucket == null) return NotFound();

        if (req.Name is not null) bucket.Name = req.Name;
        if (req.Description is not null) bucket.Description = req.Description;
        if (req.Emoji is not null) bucket.Emoji = req.Emoji;
        if (req.Color is not null) bucket.Color = req.Color;
        if (req.SortOrder.HasValue && !bucket.IsDefault) bucket.SortOrder = req.SortOrder.Value;
        bucket.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync();
        var memberCount = await context.Members.CountAsync(m => m.BucketId == id);
        return Ok(new BucketDto(bucket.Id, bucket.Name, bucket.Description,
            bucket.Emoji, bucket.Color, bucket.SortOrder, bucket.IsDefault, memberCount));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var bucket = await context.PrivacyBuckets.FindAsync(id);
        if (bucket == null) return NotFound();
        if (bucket.IsDefault)
            return BadRequest("Default buckets cannot be removed.");
        bucket.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }
}
```

- [ ] **Step 5: Run tests**

```bash
dotnet test tests/PluralHost.Tests --filter "BucketsControllerTests" -v minimal 2>&1 | tail -5
```

Expected: all 4 pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/BucketsController.cs tests/PluralHost.Tests/Controllers/BucketsControllerTests.cs src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: add BucketsController with CRUD, reorder, and default-protection"
```

---

## Task 11: GroupsController (Native API + Batch Members)

**Files:**
- Create: `src/PluralHost.Api/Controllers/GroupsController.cs`
- Create: `tests/PluralHost.Tests/Controllers/GroupsControllerTests.cs`

- [ ] **Step 1: Write the failing test for batch membership**

```csharp
// tests/PluralHost.Tests/Controllers/GroupsControllerTests.cs
[Fact]
public async Task SetMembers_UpdatesGroupMembership()
{
    // Arrange: group + 2 members
    var group = new Group { Name = "Alpha" };
    var m1 = new Member { Name = "A", BucketId = PrivacyBucket.PublicId };
    var m2 = new Member { Name = "B", BucketId = PrivacyBucket.PublicId };
    _ctx.Groups.Add(group);
    _ctx.Members.AddRange(m1, m2);
    _ctx.SaveChanges();

    // Act
    var req = new SetGroupMembersRequest([m1.Id, m2.Id]);
    var result = await _sut.SetMembersAsync(group.Id, req);

    // Assert
    Assert.IsType<NoContentResult>(result);
    // Both members now have this group in their ParentIds
    var updated1 = await _ctx.Members.FindAsync(m1.Id);
    Assert.Contains(group.Id, updated1!.ParentIds);
}

[Fact]
public async Task SetMembers_RemovesMembersNotInList()
{
    var group = new Group { Name = "Beta" };
    var m1 = new Member { Name = "C", BucketId = PrivacyBucket.PublicId, ParentIds = [/* will be set */] };
    _ctx.Groups.Add(group);
    _ctx.Members.Add(m1);
    _ctx.SaveChanges();
    m1.ParentIds = [group.Id];
    _ctx.SaveChanges();

    // Act: set members to empty list
    var result = await _sut.SetMembersAsync(group.Id, new SetGroupMembersRequest([]));

    Assert.IsType<NoContentResult>(result);
    var updated = await _ctx.Members.FindAsync(m1.Id);
    Assert.DoesNotContain(group.Id, updated!.ParentIds);
}
```

- [ ] **Step 2: Create GroupsController**

```csharp
// src/PluralHost.Api/Controllers/GroupsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("api/groups")]
[Authorize]
public class GroupsController(PluralHostContext context) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAllAsync()
    {
        var groups = await context.Groups
            .Where(g => g.DeletedAt == null)
            .Select(g => new {
                id = g.Id, name = g.Name, color = g.Color,
                memberCount = context.Members
                    .Count(m => m.DeletedAt == null && m.ParentIds.Contains(g.Id.ToString()))
            })
            .ToListAsync();
        return Ok(groups);
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] GroupCreateRequest req)
    {
        var group = new Group { Name = req.Name, Color = req.Color };
        context.Groups.Add(group);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAllAsync), new { id = group.Id }, group);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] GroupUpdateRequest req)
    {
        var group = await context.Groups.FindAsync(id);
        if (group == null) return NotFound();
        if (req.Name is not null) group.Name = req.Name;
        if (req.Color is not null) group.Color = req.Color;
        group.UpdatedAt = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return Ok(group);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var group = await context.Groups.FindAsync(id);
        if (group == null) return NotFound();
        group.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// Atomically replaces all members of a group.
    /// Body: { memberIds: ["guid1", "guid2", ...] }
    /// </summary>
    [HttpPost("{id:guid}/members")]
    public async Task<IActionResult> SetMembersAsync(Guid id, [FromBody] SetGroupMembersRequest req)
    {
        var group = await context.Groups.FindAsync(id);
        if (group == null) return NotFound();

        // Members currently in this group
        var currentMembers = await context.Members
            .Where(m => m.ParentIds.Contains(id.ToString()))
            .ToListAsync();

        // Remove from members that are no longer in the group
        foreach (var m in currentMembers.Where(m => !req.MemberIds.Contains(m.Id)))
        {
            m.ParentIds = m.ParentIds.Where(pid => pid != id).ToList();
            m.UpdatedAt = DateTime.UtcNow;
        }

        // Add to new members
        var toAdd = req.MemberIds.Except(currentMembers.Select(m => m.Id)).ToList();
        if (toAdd.Count > 0)
        {
            var newMembers = await context.Members
                .Where(m => toAdd.Contains(m.Id))
                .ToListAsync();
            foreach (var m in newMembers)
            {
                if (!m.ParentIds.Contains(id))
                    m.ParentIds = [.. m.ParentIds, id];
                m.UpdatedAt = DateTime.UtcNow;
            }
        }

        await context.SaveChangesAsync();
        return NoContent();
    }
}
```

Also add to NativeDtos:
```csharp
public record GroupCreateRequest(string Name, string? Color);
public record GroupUpdateRequest(string? Name, string? Color);
```

- [ ] **Step 3: Run tests**

```bash
dotnet test tests/PluralHost.Tests --filter "GroupsControllerTests" -v minimal 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 4: Run full backend suite**

```bash
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/GroupsController.cs tests/PluralHost.Tests/Controllers/GroupsControllerTests.cs src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: add GroupsController with CRUD and atomic batch member assignment"
```

---

## Task 12: Frontend Types and API Modules

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`
- Modify: `src/PluralHost.Web/src/api/groups.ts`
- Create: `src/PluralHost.Web/src/api/buckets.ts`

- [ ] **Step 1: Update types.ts**

Add `PrivacyBucket` interface:
```typescript
export interface PrivacyBucket {
  id: string
  name: string
  description: string | null
  emoji: string | null
  color: string | null
  sortOrder: number
  isDefault: boolean
  memberCount: number
}
```

Update `Member` interface: replace `privacyTier: PrivacyTier` with `bucketId: string`.

Update `MemberUpdatePayload`: replace `privacyTier?: PrivacyTier` with `bucketId?: string`.

Update `Group` interface to add `memberCount: number`.

Remove the `PrivacyTier` type alias if no longer referenced (check with TypeScript build: `npm run build`).

- [ ] **Step 2: Create api/buckets.ts**

```typescript
// src/PluralHost.Web/src/api/buckets.ts
import { apiFetch } from './client'
import type { PrivacyBucket } from '../types'

// Fixed GUID for the Public default bucket -- used when removing a member from a custom bucket
export const PUBLIC_BUCKET_ID = '00000000-0000-0000-0000-000000000001'

export const bucketsApi = {
  list: () =>
    apiFetch<PrivacyBucket[]>('/api/buckets'),

  create: (data: { name: string; description?: string; emoji?: string; color?: string }) =>
    apiFetch<PrivacyBucket>('/api/buckets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{ name: string; description: string; emoji: string; color: string; sortOrder: number }>) =>
    apiFetch<PrivacyBucket>(`/api/buckets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/buckets/${id}`, { method: 'DELETE' }),

  reorder: (items: Array<{ id: string; sortOrder: number }>) =>
    apiFetch<void>('/api/buckets/reorder', {
      method: 'PUT',
      body: JSON.stringify(items),
    }),
}
```

- [ ] **Step 3: Update api/groups.ts**

```typescript
// src/PluralHost.Web/src/api/groups.ts
import { apiFetch } from './client'
import type { Group } from '../types'

export const groupsApi = {
  list: () =>
    apiFetch<Group[]>('/api/groups'),

  create: (data: { name: string; color?: string }) =>
    apiFetch<Group>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; color?: string }) =>
    apiFetch<Group>(`/api/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/groups/${id}`, { method: 'DELETE' }),

  setMembers: (groupId: string, memberIds: string[]) =>
    apiFetch<void>(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    }),
}
```

- [ ] **Step 4: Type-check the frontend**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -20
```

Fix any type errors (likely in AccessTab where `privacyTier` was used).

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/types.ts src/PluralHost.Web/src/api/groups.ts src/PluralHost.Web/src/api/buckets.ts
git commit -m "feat: add PrivacyBucket type, update Member type to bucketId, add buckets API module"
```

---

## Task 13: MemberPickerList Shared Component

**Files:**
- Create: `src/PluralHost.Web/src/components/MemberPickerList.tsx`
- Create: `src/PluralHost.Web/src/components/MemberPickerList.module.css`

This component is shared between GroupSheet and BucketSheet.

- [ ] **Step 1: Create the component**

```typescript
// src/PluralHost.Web/src/components/MemberPickerList.tsx
import { useState } from 'react'
import type { Member } from '../types'
import styles from './MemberPickerList.module.css'

interface Props {
  members: Member[]
  selectedIds: string[]
  onToggle: (id: string) => void
}

export default function MemberPickerList({ members, selectedIds, onToggle }: Props) {
  const [search, setSearch] = useState('')

  const filtered = members.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.displayName?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.container}>
      <input
        className={styles.search}
        type="search"
        placeholder="Search members…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-label="Filter members"
      />
      <ul className={styles.list} role="listbox" aria-multiselectable="true">
        {filtered.map(m => {
          const selected = selectedIds.includes(m.id)
          return (
            <li
              key={m.id}
              role="option"
              aria-selected={selected}
              className={[styles.item, selected && styles.selected].filter(Boolean).join(' ')}
              onClick={() => onToggle(m.id)}
              style={{ borderLeftColor: m.color ?? 'var(--color-primary)' }}
            >
              <span className={styles.name}>{m.displayName ?? m.name}</span>
              {selected && <span className={styles.check} aria-hidden="true">✓</span>}
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className={styles.empty}>No members match.</li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Create the CSS module**

```css
/* src/PluralHost.Web/src/components/MemberPickerList.module.css */
.container { display: flex; flex-direction: column; gap: 0.5rem; }

.search {
  padding: 0.5rem 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.875rem;
}

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; }

.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.75rem;
  border-left: 3px solid transparent;
  border-radius: 6px;
  background: var(--color-surface);
  cursor: pointer;
  transition: background 0.1s;
}
.item:hover { background: var(--color-surface-raised); }
.item.selected { background: color-mix(in srgb, var(--color-primary) 12%, transparent); }

.name { font-size: 0.875rem; }
.check { color: var(--color-primary); font-weight: 700; }
.empty { padding: 1rem; text-align: center; color: var(--color-text-muted); font-size: 0.875rem; }
```

- [ ] **Step 3: Type-check**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx tsc --noEmit 2>&1 | grep "MemberPickerList"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/MemberPickerList.tsx src/PluralHost.Web/src/components/MemberPickerList.module.css
git commit -m "feat: add MemberPickerList shared component with search and highlight"
```

---

## Task 14: GroupSheet Component

**Files:**
- Create: `src/PluralHost.Web/src/components/GroupSheet.tsx`
- Create: `src/PluralHost.Web/src/components/GroupSheet.module.css`

- [ ] **Step 1: Create the component**

```typescript
// src/PluralHost.Web/src/components/GroupSheet.tsx
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import BottomSheet from './BottomSheet'
import MemberPickerList from './MemberPickerList'
import { groupsApi } from '../api/groups'
import { membersApi } from '../api/members'
import type { Group } from '../types'
import styles from './GroupSheet.module.css'

interface Props {
  group: Group | null   // null = create mode
  isOpen: boolean
  onClose: () => void
}

export default function GroupSheet({ group, isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#888888')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  useEffect(() => {
    if (!isOpen) return
    setName(group?.name ?? '')
    setColor(group?.color ?? '#888888')
    // Derive which members belong to this group from member.parentIds
    if (group) {
      setSelectedIds(members.filter(m => m.parentIds?.includes(group.id)).map(m => m.id))
    } else {
      setSelectedIds([])
    }
    setConfirmDelete(false)
    setError(null)
  }, [isOpen, group, members])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (group) {
        await groupsApi.update(group.id, { name, color })
        await groupsApi.setMembers(group.id, selectedIds)
      } else {
        const created = await groupsApi.create({ name, color })
        await groupsApi.setMembers(created.id, selectedIds)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      onClose()
    },
    onError: () => setError('Failed to save. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => groupsApi.delete(group!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      onClose()
    },
  })

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={group ? 'Edit group' : 'New group'}>
      <div className={styles.form}>
        <input
          className={styles.nameInput}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Group name"
          aria-label="Group name"
        />
        <label className={styles.colorRow}>
          <span>Color</span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} />
        </label>
      </div>

      <MemberPickerList members={members} selectedIds={selectedIds} onToggle={toggle} />

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        {group && !confirmDelete && (
          <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)} type="button">
            <Trash2 size={16} /> Delete group
          </button>
        )}
        {confirmDelete && (
          <button
            className={styles.confirmDeleteBtn}
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            type="button"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
          </button>
        )}
        <button
          className={styles.saveBtn}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
          type="button"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Create CSS module**

```css
/* src/PluralHost.Web/src/components/GroupSheet.module.css */
.form { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1rem; }

.nameInput {
  padding: 0.625rem 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.9375rem;
}

.colorRow {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 0.875rem; color: var(--color-text-muted);
}

.actions {
  display: flex; gap: 0.5rem; justify-content: flex-end;
  margin-top: 1rem; padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.saveBtn {
  padding: 0.5rem 1.25rem;
  background: var(--color-primary);
  color: #000;
  border: none; border-radius: 8px;
  font-weight: 600; cursor: pointer;
}
.saveBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.deleteBtn {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
  border-radius: 8px; cursor: pointer; font-size: 0.875rem;
  margin-right: auto;
}

.confirmDeleteBtn {
  padding: 0.5rem 1rem;
  background: var(--color-danger);
  color: #fff; border: none; border-radius: 8px;
  cursor: pointer; font-weight: 600; margin-right: auto;
}

.error { color: var(--color-danger); font-size: 0.875rem; margin: 0; }
```

- [ ] **Step 3: Type-check**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx tsc --noEmit 2>&1 | grep "GroupSheet"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/GroupSheet.tsx src/PluralHost.Web/src/components/GroupSheet.module.css
git commit -m "feat: add GroupSheet component -- create/edit group with member picker"
```

---

## Task 15: BucketSheet Component

**Files:**
- Create: `src/PluralHost.Web/src/components/BucketSheet.tsx`
- Create: `src/PluralHost.Web/src/components/BucketSheet.module.css`

- [ ] **Step 1: Create the component**

```typescript
// src/PluralHost.Web/src/components/BucketSheet.tsx
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import BottomSheet from './BottomSheet'
import MemberPickerList from './MemberPickerList'
import { bucketsApi, PUBLIC_BUCKET_ID } from '../api/buckets'
import { membersApi } from '../api/members'
import type { PrivacyBucket } from '../types'
import styles from './BucketSheet.module.css'

interface Props {
  bucket: PrivacyBucket | null  // null = create mode
  isOpen: boolean
  onClose: () => void
}

export default function BucketSheet({ bucket, isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('#888888')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  useEffect(() => {
    if (!isOpen) return
    setName(bucket?.name ?? '')
    setDescription(bucket?.description ?? '')
    setEmoji(bucket?.emoji ?? '')
    setColor(bucket?.color ?? '#888888')
    setSelectedIds(members.filter(m => m.bucketId === bucket?.id).map(m => m.id))
    setConfirmDelete(false)
    setError(null)
  }, [isOpen, bucket, members])

  const saveMutation = useMutation({
    mutationFn: async () => {
      let targetBucketId = bucket?.id
      if (!bucket) {
        const created = await bucketsApi.create({ name, description, emoji, color })
        targetBucketId = created.id
      } else {
        await bucketsApi.update(bucket.id, { name, description, emoji, color })
      }
      // Reassign members: update bucketId on each affected member
      const previousIds = members.filter(m => m.bucketId === bucket?.id).map(m => m.id)
      const toAdd = selectedIds.filter(id => !previousIds.includes(id))
      const toRemove = previousIds.filter(id => !selectedIds.includes(id))
      await Promise.all([
        ...toAdd.map(id => membersApi.update(id, { bucketId: targetBucketId! })),
        // Removed members fall back to the Public bucket (bucketId is non-nullable on backend)
        ...toRemove.map(id => membersApi.update(id, { bucketId: PUBLIC_BUCKET_ID })),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buckets'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      onClose()
    },
    onError: () => setError('Failed to save. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => bucketsApi.delete(bucket!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buckets'] })
      onClose()
    },
  })

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const isNew = !bucket

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={isNew ? 'New bucket' : 'Edit bucket'}>
      <div className={styles.form}>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Bucket name"
          aria-label="Bucket name"
          maxLength={150}
        />
        <textarea
          className={styles.textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          maxLength={500}
          rows={2}
        />
        <div className={styles.row}>
          <input
            className={styles.emojiInput}
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            placeholder="Emoji"
            aria-label="Emoji"
            maxLength={4}
          />
          <label className={styles.colorRow}>
            <span>Color</span>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} />
          </label>
        </div>
      </div>

      <MemberPickerList members={members} selectedIds={selectedIds} onToggle={toggle} />

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        {!isNew && (
          bucket?.isDefault ? (
            <span className={styles.defaultNote} title="Default buckets cannot be removed">
              Default — cannot delete
            </span>
          ) : confirmDelete ? (
            <button
              className={styles.confirmDeleteBtn}
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              type="button"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
          ) : (
            <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)} type="button">
              <Trash2 size={16} /> Delete
            </button>
          )
        )}
        <button
          className={styles.saveBtn}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
          type="button"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {!isNew && (
        <p className={styles.futureNote}>Share token integration coming soon.</p>
      )}
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Create CSS module**

```css
/* src/PluralHost.Web/src/components/BucketSheet.module.css */
.form { display: flex; flex-direction: column; gap: 0.625rem; margin-bottom: 1rem; }

.input, .textarea {
  padding: 0.625rem 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.9375rem;
  resize: none;
}

.row { display: flex; gap: 0.75rem; align-items: center; }

.emojiInput {
  width: 5rem;
  padding: 0.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 1.25rem;
  text-align: center;
}

.colorRow {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.875rem; color: var(--color-text-muted); flex: 1; justify-content: flex-end;
}

.actions {
  display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center;
  margin-top: 1rem; padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}

.saveBtn {
  padding: 0.5rem 1.25rem;
  background: var(--color-primary); color: #000;
  border: none; border-radius: 8px; font-weight: 600; cursor: pointer;
}
.saveBtn:disabled { opacity: 0.5; cursor: not-allowed; }

.deleteBtn {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-danger); color: var(--color-danger);
  background: transparent; border-radius: 8px; cursor: pointer; font-size: 0.875rem;
  margin-right: auto;
}
.confirmDeleteBtn {
  padding: 0.5rem 1rem; background: var(--color-danger); color: #fff;
  border: none; border-radius: 8px; cursor: pointer; font-weight: 600; margin-right: auto;
}
.defaultNote { font-size: 0.75rem; color: var(--color-text-muted); margin-right: auto; }
.error { color: var(--color-danger); font-size: 0.875rem; margin: 0; }
.futureNote { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.5rem; text-align: center; }
```

- [ ] **Step 3: Type-check**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx tsc --noEmit 2>&1 | grep "BucketSheet"
```

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/BucketSheet.tsx src/PluralHost.Web/src/components/BucketSheet.module.css
git commit -m "feat: add BucketSheet component -- create/edit bucket with member picker"
```

---

## Task 16: SystemPage

**Files:**
- Create: `src/PluralHost.Web/src/pages/SystemPage.tsx`
- Create: `src/PluralHost.Web/src/pages/SystemPage.module.css`

- [ ] **Step 1: Create SystemPage**

```typescript
// src/PluralHost.Web/src/pages/SystemPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import TabBar from '../components/TabBar'
import GroupSheet from '../components/GroupSheet'
import BucketSheet from '../components/BucketSheet'
import { groupsApi } from '../api/groups'
import { bucketsApi } from '../api/buckets'
import type { Group, PrivacyBucket } from '../types'
import styles from './SystemPage.module.css'

const TABS = ['Groups', 'Buckets'] as const
type Tab = typeof TABS[number]

export default function SystemPage() {
  const [tab, setTab] = useState<Tab>('Groups')
  const [groupSheet, setGroupSheet] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null })
  const [bucketSheet, setBucketSheet] = useState<{ open: boolean; bucket: PrivacyBucket | null }>({ open: false, bucket: null })

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: buckets = [] } = useQuery({ queryKey: ['buckets'], queryFn: bucketsApi.list })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>System</h1>
        <button
          className={styles.addBtn}
          onClick={() =>
            tab === 'Groups'
              ? setGroupSheet({ open: true, group: null })
              : setBucketSheet({ open: true, bucket: null })
          }
          aria-label={`Add ${tab === 'Groups' ? 'group' : 'bucket'}`}
        >
          <Plus size={20} />
        </button>
      </header>

      <TabBar tabs={[...TABS]} active={tab} onChange={t => setTab(t as Tab)} />

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
              <span
                className={styles.colorDot}
                style={{ background: g.color ?? 'var(--color-primary)' }}
              />
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
              <span
                className={styles.colorBar}
                style={{ background: b.color ?? 'var(--color-primary)' }}
              />
              <span className={styles.cardName}>{b.name}</span>
              <span className={styles.cardCount}>{b.memberCount} member{b.memberCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
          <p className={styles.futureNote}>Share token integration coming soon.</p>
        </section>
      )}

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
    </div>
  )
}
```

- [ ] **Step 2: Create CSS module**

```css
/* src/PluralHost.Web/src/pages/SystemPage.module.css */
.page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1rem 0;
}
.title { font-size: 1.25rem; font-weight: 700; margin: 0; }
.addBtn {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px;
  background: var(--color-primary); color: #000;
  border: none; border-radius: 50%; cursor: pointer;
}

.list { flex: 1; overflow-y: auto; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }

.card {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  cursor: pointer; text-align: left; width: 100%;
  transition: background 0.1s;
}
.card:hover { background: var(--color-surface-raised); }

.colorDot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.colorBar { width: 4px; height: 36px; border-radius: 2px; flex-shrink: 0; }
.emoji { font-size: 1.25rem; flex-shrink: 0; }
.cardName { flex: 1; font-size: 0.9375rem; font-weight: 500; }
.cardCount { font-size: 0.8125rem; color: var(--color-text-muted); }

.empty { text-align: center; color: var(--color-text-muted); padding: 2rem; }
.futureNote { font-size: 0.75rem; color: var(--color-text-muted); text-align: center; padding: 0.5rem; }
```

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/pages/SystemPage.tsx src/PluralHost.Web/src/pages/SystemPage.module.css
git commit -m "feat: add SystemPage with Groups and Buckets tabs"
```

---

## Task 17: Wire Navigation and Router

**Files:**
- Modify: `src/PluralHost.Web/src/components/BottomNav.tsx`
- Modify: `src/PluralHost.Web/src/App.tsx`

- [ ] **Step 1: Update BottomNav**

```typescript
// src/PluralHost.Web/src/components/BottomNav.tsx
import { Radio, Users, Layers, Clock, Settings } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

const TABS = [
  { to: '/front',    label: 'Front',    Icon: Radio },
  { to: '/members',  label: 'Members',  Icon: Users },
  { to: '/system',   label: 'System',   Icon: Layers },
  { to: '/history',  label: 'History',  Icon: Clock },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [styles.tab, isActive && styles.active].filter(Boolean).join(' ')
          }
        >
          <Icon size={20} aria-hidden="true" className={styles.icon} />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Update App.tsx**

Add import:
```typescript
import SystemPage from './pages/SystemPage'
```

Add route (between /members/:id and /history):
```tsx
<Route path="/system" element={<Protected><SystemPage /></Protected>} />
```

- [ ] **Step 3: Type-check**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/BottomNav.tsx src/PluralHost.Web/src/App.tsx
git commit -m "feat: add System nav entry and /system route"
```

---

## Task 18: Update AccessTab (privacyTier → bucketId)

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/AccessTab.tsx`

The current AccessTab shows a 4-button segmented control for fixed tiers. After migration it should use a dropdown of all available buckets fetched from the API.

- [ ] **Step 1: Update AccessTab**

Remove the `PRIVACY_TIERS` constant and the segmented control. Replace with a bucket selector:

```typescript
// Add to imports
import { useQuery } from '@tanstack/react-query'
import { bucketsApi } from '../../api/buckets'

// Inside component, add query
const { data: buckets = [] } = useQuery({
  queryKey: ['buckets'],
  queryFn: bucketsApi.list,
})

// Replace the Privacy field section (lines 88-101) with:
<div className={styles.field}>
  <span className={styles.fieldLabel}>Privacy</span>
  <select
    className={styles.bucketSelect}
    value={member.bucketId}
    onChange={e => updateMutation.mutate({ bucketId: e.target.value })}
    aria-label="Privacy bucket"
  >
    {buckets.map(b => (
      <option key={b.id} value={b.id}>
        {b.emoji ? `${b.emoji} ` : ''}{b.name}
      </option>
    ))}
  </select>
</div>
```

Add `.bucketSelect` to `AccessTab.module.css`:
```css
.bucketSelect {
  padding: 0.5rem 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 0.9375rem;
  cursor: pointer;
}
```

- [ ] **Step 2: Type-check**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx tsc --noEmit 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/AccessTab.tsx src/PluralHost.Web/src/components/tabs/AccessTab.module.css
git commit -m "feat: update AccessTab to use bucket selector instead of fixed tier segmented control"
```

---

## Task 19: Final Verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd C:/dev/simply-personal && dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -10
```

Expected: all tests pass (target: 290+).

- [ ] **Step 2: Run frontend tests**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (target: 52+).

- [ ] **Step 3: Build the frontend**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npm run build 2>&1 | tail -5
```

Expected: build success, 0 TypeScript errors.

- [ ] **Step 4: Commit and tag completion**

```bash
cd C:/dev/simply-personal
git add -A
git commit -m "feat: Plan 7b complete -- Groups Management and Privacy Buckets"
```

---

## Notes for Implementer

- **Migration order is critical:** Tasks 1-4 must complete and compile before running `dotnet ef migrations add`. Task 8 must compile before running the second migration.
- **InMemory tests and FK constraints:** EF Core InMemory provider does not enforce FK constraints. Tests that create Members with `BucketId` do not need to seed `PrivacyBucket` rows unless the `Include(m => m.Bucket)` navigation path is exercised.
- **ParentIds on Member:** Stored as comma-separated GUIDs in SQLite but deserialized as `List<Guid>` in EF Core. The `GroupsController.SetMembersAsync` uses `m.ParentIds.Contains(id.ToString())` — note the `.ToString()` to match the stored format.
- **Default bucket GUIDs:** The fixed GUIDs `00000000-0000-0000-0000-00000000000{1-4}` are defined as `static readonly` on `PrivacyBucket` and used in both migrations and runtime code. Never hardcode them elsewhere — always reference the static fields.
- **PUBLIC_BUCKET_ID constant:** Exported from `api/buckets.ts` as `'00000000-0000-0000-0000-000000000001'`. Used in `BucketSheet` when toggling a member OUT of a custom bucket -- since `bucketId` is non-nullable, they fall back to Public. Never hardcode this string elsewhere; always import the constant.
- **FilterByPermission uses `<=` not `<`:** The MinBucketSortOrder mapping (Public=0, Friend=1, Trusted=2) already absorbs the old enum offset, so `SortOrder <= minBucketSortOrder` correctly includes same-tier members. Old system used `<` because the enum was offset +1.
- **Ghost Mode:** The `/api/buckets` endpoints are `[Authorize]` only. Ghost Mode filters on `Member` queries remain active — member counts in bucket/group cards will reflect the Ghost Mode state correctly because `Members` has the combined filter.
