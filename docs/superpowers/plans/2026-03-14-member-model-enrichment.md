# Member Model Enrichment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 new fields to Member, introduce FrontStatus picklist, BoardMessage and MemberNote entities, native member/board/notes API endpoints, cycle detection on ParentIds, and fix SP API compatibility.

**Architecture:** Domain-first TDD — each entity gets tests before the context wires it up, then controllers are added with failing tests first. Ghost Mode filters are applied to all new queryable entities. PIN-gated deletes follow existing GatekeeperService pattern.

**Tech Stack:** .NET 8, ASP.NET Core, EF Core 8 + SQLite, xUnit + Moq, EF Core InMemory (tests), System.Text.Json (ExtraImages serialization)

**Pre-existing failures:** 3 tests in `AuthServiceTests` fail due to a JWT TODO stub — these are unrelated to this plan and should remain unchanged throughout.

---

## File Map

### New files
| File | Purpose |
|---|---|
| `src/PluralHost.Api/Domain/FrontStatus.cs` | Picklist entity + stable seed GUIDs |
| `src/PluralHost.Api/Domain/BoardMessage.cs` | Per-alter message board entity |
| `src/PluralHost.Api/Domain/MemberNote.cs` | Per-alter notes entity |
| `src/PluralHost.Api/Services/IMemberService.cs` | Cycle detection interface |
| `src/PluralHost.Api/Services/MemberService.cs` | Cycle detection implementation |
| `src/PluralHost.Api/Dto/NativeDtos.cs` | DTOs for native (non-SP) endpoints |
| `src/PluralHost.Api/Controllers/FrontStatusController.cs` | `GET/POST/PATCH/DELETE /api/front-statuses` |
| `src/PluralHost.Api/Controllers/MembersController.cs` | `GET/POST/PATCH /api/members` |
| `src/PluralHost.Api/Controllers/BoardController.cs` | `GET/POST/DELETE /api/members/{id}/board` |
| `src/PluralHost.Api/Controllers/MemberNotesController.cs` | `GET/POST/PATCH/DELETE /api/members/{id}/notes` |
| `tests/PluralHost.Tests/Domain/FrontStatusTests.cs` | FrontStatus domain tests |
| `tests/PluralHost.Tests/Domain/BoardMessageTests.cs` | BoardMessage domain tests |
| `tests/PluralHost.Tests/Domain/MemberNoteTests.cs` | MemberNote domain tests |
| `tests/PluralHost.Tests/Services/MemberServiceTests.cs` | Cycle detection tests |
| `tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs` | FrontStatus API tests |
| `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs` | Native member API tests |
| `tests/PluralHost.Tests/Controllers/BoardControllerTests.cs` | Board API tests |
| `tests/PluralHost.Tests/Controllers/MemberNotesControllerTests.cs` | Notes API tests |

### Modified files
| File | Change |
|---|---|
| `src/PluralHost.Api/Domain/Member.cs` | +7 fields: IsPinned, IsArchived, IsUntracked, ExtraImages, PreventFrontNotification, ReceiveBoardNotifications, SpMemberId |
| `src/PluralHost.Api/Domain/FrontHistory.cs` | Remove `Note`, add `Comment` + `CustomStatusId` + nav property |
| `src/PluralHost.Api/Data/PluralHostContext.cs` | +3 DbSets, +2 HasQueryFilter, ExtraImages ValueConverter+Comparer, FrontStatus HasData |
| `src/PluralHost.Api/Dto/SpDtos.cs` | Fix `Archived` comment on `SpMemberContent` |
| `src/PluralHost.Api/Controllers/SpMembersController.cs` | Map `Archived` from `m.IsArchived` not `m.Status` |
| `src/PluralHost.Api/Controllers/SpFrontController.cs` | Include FrontStatus nav; map `CustomStatus` from `fh.CustomStatus?.Label` |
| `src/PluralHost.Api/Program.cs` | Register `IMemberService` → `MemberService` |
| `tests/PluralHost.Tests/Domain/MemberTests.cs` | Tests for 7 new fields |
| `tests/PluralHost.Tests/Data/GhostModeFilterTests.cs` | +2 tests: BoardMessage + MemberNote Ghost Mode |
| `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs` | Fix: Archived maps from IsArchived |
| `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs` | Fix: CustomStatus from FrontStatus nav |

---

## Chunk 1: Domain Entities + Database

### Task 1: FrontStatus entity

**Files:**
- Create: `src/PluralHost.Api/Domain/FrontStatus.cs`
- Create: `tests/PluralHost.Tests/Domain/FrontStatusTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Domain/FrontStatusTests.cs
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class FrontStatusTests
{
    [Fact]
    public void FrontStatus_DefaultValues_AreCorrect()
    {
        var status = new FrontStatus { Label = "Co-con" };
        Assert.False(status.IsDefault);
        Assert.False(status.IsHidden);
        Assert.Null(status.Color);
    }

    [Fact]
    public void SeedIds_AreStableGuids()
    {
        Assert.Equal(new Guid("a1000000-0000-0000-0000-000000000001"), FrontStatus.SeedIds.CoCon);
        Assert.Equal(new Guid("a1000000-0000-0000-0000-000000000010"), FrontStatus.SeedIds.FrontingAlone);
    }

    [Fact]
    public void SeedIds_AllTenAreDistinct()
    {
        var ids = new[]
        {
            FrontStatus.SeedIds.CoCon, FrontStatus.SeedIds.Blending,
            FrontStatus.SeedIds.Switching, FrontStatus.SeedIds.Stressed,
            FrontStatus.SeedIds.Dissociating, FrontStatus.SeedIds.Foggy,
            FrontStatus.SeedIds.PassiveInfluence, FrontStatus.SeedIds.FullSwitch,
            FrontStatus.SeedIds.PartialSwitch, FrontStatus.SeedIds.FrontingAlone
        };
        Assert.Equal(10, ids.Distinct().Count());
    }
}
```

- [ ] **Step 2: Run — expect compile error (type not found)**
```bash
dotnet test tests/PluralHost.Tests --filter "FrontStatusTests" --no-build 2>&1 | tail -5
```

- [ ] **Step 3: Create the entity**

```csharp
// src/PluralHost.Api/Domain/FrontStatus.cs
namespace PluralHost.Api.Domain;

public class FrontStatus : BaseEntity
{
    public required string Label { get; set; }
    public string? Color { get; set; }
    public bool IsDefault { get; set; } = false;
    public bool IsHidden { get; set; } = false;

    public List<FrontHistory> FrontHistories { get; set; } = [];

    // Stable GUIDs — never change these; they are baked into migrations
    public static class SeedIds
    {
        public static readonly Guid CoCon            = new("a1000000-0000-0000-0000-000000000001");
        public static readonly Guid Blending         = new("a1000000-0000-0000-0000-000000000002");
        public static readonly Guid Switching        = new("a1000000-0000-0000-0000-000000000003");
        public static readonly Guid Stressed         = new("a1000000-0000-0000-0000-000000000004");
        public static readonly Guid Dissociating     = new("a1000000-0000-0000-0000-000000000005");
        public static readonly Guid Foggy            = new("a1000000-0000-0000-0000-000000000006");
        public static readonly Guid PassiveInfluence = new("a1000000-0000-0000-0000-000000000007");
        public static readonly Guid FullSwitch       = new("a1000000-0000-0000-0000-000000000008");
        public static readonly Guid PartialSwitch    = new("a1000000-0000-0000-0000-000000000009");
        public static readonly Guid FrontingAlone    = new("a1000000-0000-0000-0000-000000000010");
    }
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "FrontStatusTests" -v minimal
```
Expected: `Passed: 3`

- [ ] **Step 5: Commit**
```bash
git add src/PluralHost.Api/Domain/FrontStatus.cs tests/PluralHost.Tests/Domain/FrontStatusTests.cs
git commit -m "feat: add FrontStatus domain entity with stable seed GUIDs"
```

---

### Task 2: Update Member entity + tests

**Files:**
- Modify: `src/PluralHost.Api/Domain/Member.cs`
- Modify: `tests/PluralHost.Tests/Domain/MemberTests.cs`

- [ ] **Step 1: Write failing tests — add to end of existing MemberTests.cs**

```csharp
[Fact]
public void Member_NewBoolFields_DefaultToCorrectValues()
{
    var m = new Member { Name = "Ash" };
    Assert.False(m.IsPinned);
    Assert.False(m.IsArchived);
    Assert.False(m.IsUntracked);
    Assert.False(m.PreventFrontNotification);
    Assert.True(m.ReceiveBoardNotifications);
    Assert.Empty(m.ExtraImages);
    Assert.Null(m.SpMemberId);
}

[Fact]
public void Member_IsArchived_IsIndependentOfSoftDelete()
{
    var m = new Member { Name = "Ash" };
    m.IsArchived = true;
    Assert.Null(m.DeletedAt);   // soft-delete untouched
    m.SoftDelete();
    Assert.True(m.IsArchived);  // archive flag untouched
    Assert.NotNull(m.DeletedAt);
}
```

- [ ] **Step 2: Run — expect FAIL (properties not found)**
```bash
dotnet test tests/PluralHost.Tests --filter "MemberTests" -v minimal
```

- [ ] **Step 3: Update Member.cs**

Replace the entire file:

```csharp
// src/PluralHost.Api/Domain/Member.cs
namespace PluralHost.Api.Domain;

public enum MemberStatus { Active, Dormant, Fused, Gone }

public class Member : BaseEntity
{
    public required string Name { get; set; }
    public string? DisplayName { get; set; }
    public string? Pronouns { get; set; }
    public string? AvatarPath { get; set; }
    public string? Color { get; set; }
    public string? Role { get; set; }
    public string? Description { get; set; }
    public bool IsPrivate { get; set; } = false;
    public MemberStatus Status { get; set; } = MemberStatus.Active;

    // Lineage
    public List<Guid> ParentIds { get; set; } = [];

    // Many-to-many
    public List<Group> Groups { get; set; } = [];

    // ── New fields ────────────────────────────────────────────────────
    public bool IsPinned { get; set; } = false;
    public bool IsArchived { get; set; } = false;
    public bool IsUntracked { get; set; } = false;
    public List<string> ExtraImages { get; set; } = [];
    public bool PreventFrontNotification { get; set; } = false;
    public bool ReceiveBoardNotifications { get; set; } = true;
    public string? SpMemberId { get; set; }
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "MemberTests" -v minimal
```

- [ ] **Step 5: Commit**
```bash
git add src/PluralHost.Api/Domain/Member.cs tests/PluralHost.Tests/Domain/MemberTests.cs
git commit -m "feat: add 7 new fields to Member entity"
```

---

### Task 3: Update FrontHistory entity

**Files:**
- Modify: `src/PluralHost.Api/Domain/FrontHistory.cs`

- [ ] **Step 1: Replace FrontHistory.cs**

`Note` (was used as the SP CustomStatus string) is removed. `Comment` is free text. `CustomStatusId` is the FK to the new picklist.

```csharp
// src/PluralHost.Api/Domain/FrontHistory.cs
namespace PluralHost.Api.Domain;

public class FrontHistory : BaseEntity
{
    public required Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public DateTime FrontStart { get; set; } = DateTime.UtcNow;
    public DateTime? FrontEnd { get; set; }
    public bool IsCurrentlyFronting => FrontEnd == null;
    public string? Comment { get; set; }          // free-text annotation, max 500
    public Guid? CustomStatusId { get; set; }     // FK → FrontStatus
    public FrontStatus? CustomStatus { get; set; } // navigation property
}
```

- [ ] **Step 2: Build to confirm no compile errors**
```bash
dotnet build src/PluralHost.Api 2>&1 | tail -10
```

`SpFrontController` references `fh.Note` — it will now fail to compile. That's expected; it gets fixed in Task 18.

- [ ] **Step 3: Fix SpFrontController compilation stub**

In `SpFrontController.cs`, update the two references to `fh.Note` temporarily:

Find:
```csharp
CustomStatus: fh.Note
```
Replace with:
```csharp
CustomStatus: fh.CustomStatus?.Label
```

Find:
```csharp
if (body.CustomStatus is not null) entry.Note = body.CustomStatus;
```
Replace with:
```csharp
// CustomStatus via FK — full fix in Task 18
```

- [ ] **Step 4: Build cleanly**
```bash
dotnet build src/PluralHost.Api 2>&1 | tail -5
```
Expected: `Build succeeded`

- [ ] **Step 5: Add FrontHistory controller-level validation note**

The 500-char limit on `Comment` and the `CustomStatusId` round-trip are validated at the controller level in Chunk 3 (SpFrontController tests). No standalone domain test is required — the field is a plain string property with no domain logic.

> **Note for implementer:** `SpMembersController.Archived` still maps from `MemberStatus` at this point and will cause test failures in `SpMembersControllerTests`. This is intentional — it is fixed explicitly in **Task 15 (Chunk 4)**. Do not fix it here.

- [ ] **Step 6: Commit**
```bash
git add src/PluralHost.Api/Domain/FrontHistory.cs src/PluralHost.Api/Controllers/SpFrontController.cs
git commit -m "feat: replace FrontHistory.Note with Comment + CustomStatusId FK"
```

---

### Task 4: BoardMessage entity

**Files:**
- Create: `src/PluralHost.Api/Domain/BoardMessage.cs`
- Create: `tests/PluralHost.Tests/Domain/BoardMessageTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Domain/BoardMessageTests.cs
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class BoardMessageTests
{
    [Fact]
    public void BoardMessage_SoftDelete_SetsDeletedAt()
    {
        var msg = new BoardMessage { MemberId = Guid.NewGuid(), AuthorName = "Ash", Content = "hi" };
        Assert.Null(msg.DeletedAt);
        msg.SoftDelete();
        Assert.NotNull(msg.DeletedAt);
    }

    [Fact]
    public void BoardMessage_HasBaseEntityProperties()
    {
        var msg = new BoardMessage { MemberId = Guid.NewGuid(), AuthorName = "Ash", Content = "hello" };
        Assert.NotEqual(Guid.Empty, msg.Id);
        Assert.True(msg.CreatedAt <= DateTime.UtcNow);
    }
}
```

- [ ] **Step 2: Run — expect compile error**
```bash
dotnet test tests/PluralHost.Tests --filter "BoardMessageTests" --no-build 2>&1 | tail -5
```

- [ ] **Step 3: Create entity**

```csharp
// src/PluralHost.Api/Domain/BoardMessage.cs
namespace PluralHost.Api.Domain;

public class BoardMessage : BaseEntity
{
    public required Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public required string AuthorName { get; set; }  // max 100
    public required string Content { get; set; }     // max 1000
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "BoardMessageTests" -v minimal
```

- [ ] **Step 5: Commit**
```bash
git add src/PluralHost.Api/Domain/BoardMessage.cs tests/PluralHost.Tests/Domain/BoardMessageTests.cs
git commit -m "feat: add BoardMessage domain entity"
```

---

### Task 5: MemberNote entity

**Files:**
- Create: `src/PluralHost.Api/Domain/MemberNote.cs`
- Create: `tests/PluralHost.Tests/Domain/MemberNoteTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Domain/MemberNoteTests.cs
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class MemberNoteTests
{
    [Fact]
    public void MemberNote_DefaultValues_AreCorrect()
    {
        var note = new MemberNote { MemberId = Guid.NewGuid(), Content = "some note" };
        Assert.False(note.IsPinned);
        Assert.False(note.IsLocked);
        Assert.Null(note.Title);
    }

    [Fact]
    public void MemberNote_SoftDelete_SetsDeletedAt()
    {
        var note = new MemberNote { MemberId = Guid.NewGuid(), Content = "content" };
        note.SoftDelete();
        Assert.NotNull(note.DeletedAt);
    }
}
```

- [ ] **Step 2: Run — expect compile error**

- [ ] **Step 3: Create entity**

```csharp
// src/PluralHost.Api/Domain/MemberNote.cs
namespace PluralHost.Api.Domain;

public class MemberNote : BaseEntity
{
    public required Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public string? Title { get; set; }        // max 100
    public required string Content { get; set; } // required, max 50000
    public bool IsPinned { get; set; } = false;
    public bool IsLocked { get; set; } = false;
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "MemberNoteTests" -v minimal
```

- [ ] **Step 5: Commit**
```bash
git add src/PluralHost.Api/Domain/MemberNote.cs tests/PluralHost.Tests/Domain/MemberNoteTests.cs
git commit -m "feat: add MemberNote domain entity"
```

---

### Task 6: Update PluralHostContext

**Files:**
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs`

- [ ] **Step 1: Replace PluralHostContext.cs**

```csharp
// src/PluralHost.Api/Data/PluralHostContext.cs
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using PluralHost.Api.Domain;

namespace PluralHost.Api.Data;

public class PluralHostContext(DbContextOptions<PluralHostContext> options)
    : DbContext(options)
{
    public DbSet<Member> Members => Set<Member>();
    public DbSet<FrontHistory> FrontHistory => Set<FrontHistory>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<AccessToken> AccessTokens => Set<AccessToken>();
    public DbSet<SystemSettings> SystemSettings => Set<SystemSettings>();
    public DbSet<FrontStatus> FrontStatuses => Set<FrontStatus>();
    public DbSet<BoardMessage> BoardMessages => Set<BoardMessage>();
    public DbSet<MemberNote> MemberNotes => Set<MemberNote>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Singleton SystemSettings ──────────────────────────────────────
        modelBuilder.Entity<SystemSettings>()
            .HasData(new SystemSettings { Id = 1 });

        // ── AccessToken: string PK ────────────────────────────────────────
        modelBuilder.Entity<AccessToken>()
            .HasKey(t => t.TokenValue);

        // ── Group ↔ Member: many-to-many ──────────────────────────────────
        modelBuilder.Entity<Group>()
            .HasMany(g => g.Members)
            .WithMany(m => m.Groups)
            .UsingEntity(j => j.ToTable("MemberGroups"));

        // ── Member.ParentIds: CSV + comparer ─────────────────────────────
        var guidListComparer = new ValueComparer<List<Guid>>(
            (a, b) => a != null && b != null && a.SequenceEqual(b),
            v => v.Aggregate(0, (h, g) => HashCode.Combine(h, g.GetHashCode())),
            v => v.ToList());

        modelBuilder.Entity<Member>()
            .Property(m => m.ParentIds)
            .HasConversion(
                v => string.Join(',', v),
                v => v.Split(',', StringSplitOptions.RemoveEmptyEntries)
                       .Select(Guid.Parse).ToList())
            .Metadata.SetValueComparer(guidListComparer);

        // ── Member.ExtraImages: JSON list + comparer ─────────────────────
        var stringListComparer = new ValueComparer<List<string>>(
            (a, b) => a != null && b != null && a.SequenceEqual(b),
            v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
            v => v.ToList());

        modelBuilder.Entity<Member>()
            .Property(m => m.ExtraImages)
            .HasConversion(
                v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
                v => JsonSerializer.Deserialize<List<string>>(v, (JsonSerializerOptions?)null) ?? new List<string>())
            .Metadata.SetValueComparer(stringListComparer);

        // ── FrontStatus: seeded defaults ─────────────────────────────────
        modelBuilder.Entity<FrontStatus>().HasData(
            Seed(FrontStatus.SeedIds.CoCon,            "Co-con"),
            Seed(FrontStatus.SeedIds.Blending,         "Blending"),
            Seed(FrontStatus.SeedIds.Switching,        "Switching"),
            Seed(FrontStatus.SeedIds.Stressed,         "Stressed"),
            Seed(FrontStatus.SeedIds.Dissociating,     "Dissociating"),
            Seed(FrontStatus.SeedIds.Foggy,            "Foggy"),
            Seed(FrontStatus.SeedIds.PassiveInfluence, "Passive influence"),
            Seed(FrontStatus.SeedIds.FullSwitch,       "Full switch"),
            Seed(FrontStatus.SeedIds.PartialSwitch,    "Partial switch"),
            Seed(FrontStatus.SeedIds.FrontingAlone,    "Fronting alone")
        );

        // ── GLOBAL FILTERS (soft-delete + Ghost Mode) ────────────────────
        // IMPORTANT: each entity gets exactly ONE HasQueryFilter call.
        // Both conditions are combined into a single expression.
        modelBuilder.Entity<Member>()
            .HasQueryFilter(m =>
                m.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        modelBuilder.Entity<FrontHistory>()
            .HasQueryFilter(f =>
                f.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        modelBuilder.Entity<Group>()
            .HasQueryFilter(g =>
                g.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        modelBuilder.Entity<BoardMessage>()
            .HasQueryFilter(b =>
                b.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        modelBuilder.Entity<MemberNote>()
            .HasQueryFilter(n =>
                n.DeletedAt == null &&
                !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

        // FrontStatus: soft-delete only (NOT Ghost Mode — it's a config picklist)
        modelBuilder.Entity<FrontStatus>()
            .HasQueryFilter(fs => fs.DeletedAt == null);
    }

    private static FrontStatus Seed(Guid id, string label) => new()
    {
        Id = id,
        Label = label,
        IsDefault = true,
        IsHidden = false,
        CreatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc),
        UpdatedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
    };

    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        foreach (var entry in ChangeTracker.Entries<BaseEntity>()
            .Where(e => e.State == EntityState.Modified))
        {
            entry.Entity.UpdatedAt = DateTime.UtcNow;
        }
        return base.SaveChangesAsync(ct);
    }
}
```

- [ ] **Step 2: Build**
```bash
dotnet build src/PluralHost.Api 2>&1 | tail -5
```
Expected: `Build succeeded`

- [ ] **Step 3: Run full test suite — existing tests must still pass**
```bash
dotnet test --no-build 2>&1 | tail -5
```
Expected: same pass/fail as before (92 pass, 3 fail on JWT)

- [ ] **Step 4: Commit**
```bash
git add src/PluralHost.Api/Data/PluralHostContext.cs
git commit -m "feat: add FrontStatus/BoardMessage/MemberNote to context with Ghost Mode filters and seed data"
```

---

### Task 7: Ghost Mode tests for new entities

**Files:**
- Modify: `tests/PluralHost.Tests/Data/GhostModeFilterTests.cs`

- [ ] **Step 1: Add two tests to the existing file**

Add after the last existing test method (before `Dispose`):

```csharp
[Fact]
public async Task WhenFrozen_BoardMessagesQueryReturnsEmpty()
{
    var member = new Member { Name = "Ash" };
    _context.Members.Add(member);
    _context.BoardMessages.Add(new BoardMessage
    {
        MemberId = member.Id,
        AuthorName = "System",
        Content = "hello"
    });
    await _context.SaveChangesAsync();

    await FreezeSystem();

    var result = await _context.BoardMessages.ToListAsync();
    Assert.Empty(result);
}

[Fact]
public async Task WhenFrozen_MemberNotesQueryReturnsEmpty()
{
    var member = new Member { Name = "Ash" };
    _context.Members.Add(member);
    _context.MemberNotes.Add(new MemberNote
    {
        MemberId = member.Id,
        Content = "a note"
    });
    await _context.SaveChangesAsync();

    await FreezeSystem();

    var result = await _context.MemberNotes.ToListAsync();
    Assert.Empty(result);
}
```

- [ ] **Step 2: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "GhostModeFilterTests" -v minimal
```
Expected: all 5 tests pass

- [ ] **Step 3: Commit**
```bash
git add tests/PluralHost.Tests/Data/GhostModeFilterTests.cs
git commit -m "test: add Ghost Mode filter coverage for BoardMessage and MemberNote"
```

---

### Task 8: EF Core migration

**Files:**
- Create: `src/PluralHost.Api/Data/Migrations/` (auto-generated)

- [ ] **Step 1: Generate migration**
```bash
cd C:/dev/simply-personal
dotnet ef migrations add MemberEnrichment --project src/PluralHost.Api --output-dir Data/Migrations
```

- [ ] **Step 2: Verify the migration contains expected changes**

Open the generated `*_MemberEnrichment.cs` and confirm it includes:
- `AddColumn` for `IsPinned`, `IsArchived`, `IsUntracked`, `ExtraImages`, `PreventFrontNotification`, `ReceiveBoardNotifications`, `SpMemberId` on `Members`
- `DropColumn` for `Note` on `FrontHistory`
- `AddColumn` for `Comment` and `CustomStatusId` on `FrontHistory`
- `CreateTable` for `FrontStatuses`
- `CreateTable` for `BoardMessages`
- `CreateTable` for `MemberNotes`
- `InsertData` for 10 FrontStatus rows

- [ ] **Step 3: Apply migration to local DB**
```bash
dotnet ef database update --project src/PluralHost.Api
```
Expected: `Done.`

- [ ] **Step 4: Run full test suite**
```bash
dotnet test 2>&1 | tail -5
```
Expected: 92 pass, 3 fail (JWT only)

- [ ] **Step 5: Commit**
```bash
git add src/PluralHost.Api/Data/Migrations/
git commit -m "feat: EF migration — member enrichment schema (FrontStatus, BoardMessage, MemberNote)"
```

---

## Chunk 2: MemberService (Cycle Detection)

### Task 9: IMemberService + MemberService

**Files:**
- Create: `src/PluralHost.Api/Services/IMemberService.cs`
- Create: `src/PluralHost.Api/Services/MemberService.cs`
- Create: `tests/PluralHost.Tests/Services/MemberServiceTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Services/MemberServiceTests.cs
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class MemberServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly MemberService _service;

    public MemberServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _service = new MemberService(_context);
    }

    [Fact]
    public async Task SetParentIds_ValidChain_Succeeds()
    {
        var a = new Member { Name = "A" };
        var b = new Member { Name = "B" };
        _context.Members.AddRange(a, b);
        await _context.SaveChangesAsync();

        var (success, error) = await _service.SetParentIdsAsync(b.Id, [a.Id]);

        Assert.True(success);
        Assert.Null(error);
    }

    [Fact]
    public async Task SetParentIds_DirectSelfReference_ReturnsCycleError()
    {
        var a = new Member { Name = "A" };
        _context.Members.Add(a);
        await _context.SaveChangesAsync();

        var (success, error) = await _service.SetParentIdsAsync(a.Id, [a.Id]);

        Assert.False(success);
        Assert.Contains("Circular", error);
    }

    [Fact]
    public async Task SetParentIds_IndirectCycle_ReturnsCycleError()
    {
        // A → B, then try to set B's parent to A (creating A→B→A)
        var a = new Member { Name = "A" };
        var b = new Member { Name = "B", ParentIds = [] };
        _context.Members.AddRange(a, b);
        await _context.SaveChangesAsync();

        // First set A's parent to B
        var r1 = await _service.SetParentIdsAsync(a.Id, [b.Id]);
        Assert.True(r1.Success);

        // Now try to set B's parent to A — creates B→A→B cycle
        var (success, error) = await _service.SetParentIdsAsync(b.Id, [a.Id]);

        Assert.False(success);
        Assert.Contains("Circular", error);
    }

    [Fact]
    public async Task SetParentIds_ChainExceedsMaxDepth_ReturnsDepthError()
    {
        // Build a chain of 21 members: m0 ← m1 ← ... ← m20
        var members = Enumerable.Range(0, 21)
            .Select(i => new Member { Name = $"M{i}" }).ToList();
        _context.Members.AddRange(members);
        await _context.SaveChangesAsync();

        // Chain: each member's parent is the previous one
        for (int i = 1; i < 21; i++)
            await _service.SetParentIdsAsync(members[i].Id, [members[i - 1].Id]);

        // Attempt to add member[20]'s parent as member[19] — depth 21
        var (success, error) = await _service.SetParentIdsAsync(members[20].Id, [members[19].Id]);

        Assert.False(success);
        Assert.Contains("depth", error);
    }

    [Fact]
    public async Task SetParentIds_MemberNotFound_ReturnsFalse()
    {
        var (success, error) = await _service.SetParentIdsAsync(Guid.NewGuid(), []);
        Assert.False(success);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — expect compile error**
```bash
dotnet test tests/PluralHost.Tests --filter "MemberServiceTests" --no-build 2>&1 | tail -5
```

- [ ] **Step 3: Create IMemberService**

```csharp
// src/PluralHost.Api/Services/IMemberService.cs
namespace PluralHost.Api.Services;

public interface IMemberService
{
    /// <summary>
    /// Validates proposed ParentIds for cycles and depth without persisting.
    /// Use this from controllers that manage their own SaveChangesAsync call.
    /// </summary>
    Task<(bool Success, string? Error)> ValidateParentIdsAsync(Guid memberId, List<Guid> proposedParentIds);

    /// <summary>
    /// Validates and persists ParentIds in a single operation.
    /// Use this for standalone parent-setting operations.
    /// </summary>
    Task<(bool Success, string? Error)> SetParentIdsAsync(Guid memberId, List<Guid> parentIds);
}
```

- [ ] **Step 4: Create MemberService**

```csharp
// src/PluralHost.Api/Services/MemberService.cs
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class MemberService(PluralHostContext context) : IMemberService
{
    private const int MaxDepth = 20;

    public async Task<(bool Success, string? Error)> ValidateParentIdsAsync(
        Guid memberId, List<Guid> proposedParentIds)
    {
        foreach (var parentId in proposedParentIds)
        {
            var (hasCycle, tooDeep) = await CheckAncestorsAsync(memberId, parentId, 0);
            if (hasCycle) return (false, "Circular parent reference detected");
            if (tooDeep)  return (false, "Parent chain exceeds maximum depth of 20");
        }
        return (true, null);
    }

    public async Task<(bool Success, string? Error)> SetParentIdsAsync(Guid memberId, List<Guid> parentIds)
    {
        var member = await context.Members
            .IgnoreQueryFilters()  // must find member even when system is frozen
            .FirstOrDefaultAsync(m => m.Id == memberId);
        if (member is null) return (false, "Member not found");

        var (ok, err) = await ValidateParentIdsAsync(memberId, parentIds);
        if (!ok) return (false, err);

        member.ParentIds = parentIds;
        await context.SaveChangesAsync();
        return (true, null);
    }

    private async Task<(bool hasCycle, bool tooDeep)> CheckAncestorsAsync(
        Guid targetId, Guid currentId, int depth)
    {
        if (depth >= MaxDepth) return (false, true);
        if (currentId == targetId) return (true, false);

        var current = await context.Members
            .IgnoreQueryFilters()  // must traverse even soft-deleted ancestors
            .FirstOrDefaultAsync(m => m.Id == currentId);
        if (current is null) return (false, false);

        foreach (var parentId in current.ParentIds)
        {
            var (hasCycle, tooDeep) = await CheckAncestorsAsync(targetId, parentId, depth + 1);
            if (hasCycle || tooDeep) return (hasCycle, tooDeep);
        }

        return (false, false);
    }
}
```

- [ ] **Step 5: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "MemberServiceTests" -v minimal
```
Expected: 5 tests pass

- [ ] **Step 6: Register in Program.cs**

Add after the existing `AddScoped` lines:
```csharp
builder.Services.AddScoped<IMemberService, MemberService>();
```

- [ ] **Step 7: Build + full test run**
```bash
dotnet build src/PluralHost.Api 2>&1 | tail -3
dotnet test 2>&1 | tail -5
```
Expected: build succeeds, 97 pass, 3 fail (JWT only)

- [ ] **Step 8: Commit**
```bash
git add src/PluralHost.Api/Services/IMemberService.cs \
        src/PluralHost.Api/Services/MemberService.cs \
        src/PluralHost.Api/Program.cs \
        tests/PluralHost.Tests/Services/MemberServiceTests.cs
git commit -m "feat: add MemberService with cycle detection for ParentIds"
```

---

## Chunk 3: FrontStatus API + Native Members API

### Task 10: Native DTOs

**Files:**
- Create: `src/PluralHost.Api/Dto/NativeDtos.cs`

- [ ] **Step 1: Create the file**

```csharp
// src/PluralHost.Api/Dto/NativeDtos.cs
using PluralHost.Api.Domain;

namespace PluralHost.Api.Dto;

// ── FrontStatus ───────────────────────────────────────────────────────
public record FrontStatusResponse(
    Guid Id, string Label, string? Color,
    bool IsDefault, bool IsHidden, DateTime CreatedAt);

public record FrontStatusCreateRequest(string Label, string? Color = null);

public record FrontStatusUpdateRequest(
    string? Label = null, string? Color = null, bool? IsHidden = null);

// ── Member (native) ───────────────────────────────────────────────────
public record MemberResponse(
    Guid Id, string Name, string? DisplayName, string? Pronouns,
    string? Color, string? Role, string? Description, string? AvatarPath,
    bool IsPrivate, bool IsPinned, bool IsArchived, bool IsUntracked,
    bool PreventFrontNotification, bool ReceiveBoardNotifications,
    List<string> ExtraImages, string? SpMemberId,
    MemberStatus Status, List<Guid> ParentIds, List<Guid> GroupIds,
    DateTime CreatedAt, DateTime UpdatedAt);

public record MemberCreateRequest(
    string Name, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    bool IsPrivate = false);

public record MemberUpdateRequest(
    string? Name = null, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    bool? IsPrivate = null, bool? IsPinned = null, bool? IsArchived = null,
    bool? IsUntracked = null, bool? PreventFrontNotification = null,
    bool? ReceiveBoardNotifications = null, List<string>? ExtraImages = null,
    string? SpMemberId = null, MemberStatus? Status = null,
    List<Guid>? ParentIds = null);

// ── BoardMessage ──────────────────────────────────────────────────────
public record BoardMessageResponse(
    Guid Id, Guid MemberId, string AuthorName, string Content, DateTime CreatedAt);

public record BoardMessageCreateRequest(string AuthorName, string Content);

// ── MemberNote ────────────────────────────────────────────────────────
public record MemberNoteResponse(
    Guid Id, Guid MemberId, string? Title, string Content,
    bool IsPinned, bool IsLocked, DateTime CreatedAt, DateTime UpdatedAt);

public record MemberNoteCreateRequest(string Content, string? Title = null);

public record MemberNoteUpdateRequest(
    string? Title = null, string? Content = null,
    bool? IsPinned = null, bool? IsLocked = null);
```

- [ ] **Step 2: Build**
```bash
dotnet build src/PluralHost.Api 2>&1 | tail -3
```

- [ ] **Step 3: Commit**
```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: add native API DTOs for FrontStatus, Member, BoardMessage, MemberNote"
```

---

### Task 11: FrontStatusController

**Files:**
- Create: `src/PluralHost.Api/Controllers/FrontStatusController.cs`
- Create: `tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class FrontStatusControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly FrontStatusController _controller;

    public FrontStatusControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _gatekeeper = new Mock<IGatekeeperService>();
        _controller = new FrontStatusController(_context, _gatekeeper.Object);
    }

    [Fact]
    public async Task GetAll_ReturnsVisibleStatuses()
    {
        // Seed data loads via HasData in EnsureCreated
        var result = await _controller.ListAsync() as OkObjectResult;
        Assert.NotNull(result);
        var statuses = result.Value as IEnumerable<FrontStatusResponse>;
        Assert.NotNull(statuses);
        Assert.Equal(10, statuses.Count()); // 10 seeded defaults
    }

    [Fact]
    public async Task GetAll_ExcludesHiddenStatuses()
    {
        var status = new FrontStatus { Label = "Test", IsDefault = false };
        status.IsHidden = true;
        _context.FrontStatuses.Add(status);
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var statuses = result!.Value as IEnumerable<FrontStatusResponse>;
        Assert.DoesNotContain(statuses!, s => s.Label == "Test");
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsNewStatus()
    {
        var result = await _controller.CreateAsync(
            new FrontStatusCreateRequest("Custom", "#ff0000")) as OkObjectResult;
        Assert.NotNull(result);
        var response = result.Value as FrontStatusResponse;
        Assert.Equal("Custom", response!.Label);
        Assert.Equal("#ff0000", response.Color);
    }

    [Fact]
    public async Task Delete_DefaultStatus_Returns400()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var defaultId = FrontStatus.SeedIds.CoCon;

        var result = await _controller.DeleteAsync(defaultId, "1234");
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Delete_UserStatus_WithValidPin_SoftDeletes()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var status = new FrontStatus { Label = "Mine" };
        _context.FrontStatuses.Add(status);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(status.Id, "1234");
        Assert.IsType<OkResult>(result);

        var inDb = await _context.FrontStatuses
            .IgnoreQueryFilters()
            .FirstAsync(s => s.Id == status.Id);
        Assert.NotNull(inDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_InvalidPin_Returns403()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("wrong")).ReturnsAsync(false);
        var status = new FrontStatus { Label = "Mine" };
        _context.FrontStatuses.Add(status);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(status.Id, "wrong");
        Assert.IsType<ForbidResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — expect compile error**

- [ ] **Step 3: Create FrontStatusController**

```csharp
// src/PluralHost.Api/Controllers/FrontStatusController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/front-statuses")]
public class FrontStatusController(
    PluralHostContext context,
    IGatekeeperService gatekeeper) : ControllerBase
{
    private static FrontStatusResponse ToResponse(FrontStatus s) =>
        new(s.Id, s.Label, s.Color, s.IsDefault, s.IsHidden, s.CreatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        var statuses = await context.FrontStatuses
            .Where(s => !s.IsHidden)
            .OrderBy(s => s.IsDefault ? 0 : 1)
            .ThenBy(s => s.Label)
            .ToListAsync();
        return Ok(statuses.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] FrontStatusCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });

        var status = new FrontStatus { Label = body.Label.Trim(), Color = body.Color };
        context.FrontStatuses.Add(status);
        await context.SaveChangesAsync();
        return Ok(ToResponse(status));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] FrontStatusUpdateRequest body)
    {
        var status = await context.FrontStatuses.FirstOrDefaultAsync(s => s.Id == id);
        if (status is null) return NotFound();

        if (body.Label is not null) status.Label = body.Label.Trim();
        if (body.Color is not null) status.Color = body.Color;
        if (body.IsHidden is not null) status.IsHidden = body.IsHidden.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(status));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id, [FromQuery] string pin)
    {
        if (!await gatekeeper.ValidatePinAsync(pin))
            return Forbid();

        var status = await context.FrontStatuses.FirstOrDefaultAsync(s => s.Id == id);
        if (status is null) return NotFound();

        if (status.IsDefault)
            return BadRequest(new { error = "Default statuses cannot be deleted" });

        status.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "FrontStatusControllerTests" -v minimal
```
Expected: 6 tests pass

- [ ] **Step 5: Full test run**
```bash
dotnet test 2>&1 | tail -5
```

- [ ] **Step 6: Commit**
```bash
git add src/PluralHost.Api/Controllers/FrontStatusController.cs \
        tests/PluralHost.Tests/Controllers/FrontStatusControllerTests.cs
git commit -m "feat: add FrontStatusController with PIN-gated delete"
```

---

### Task 12: Native MembersController

**Files:**
- Create: `src/PluralHost.Api/Controllers/MembersController.cs`
- Create: `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Controllers/MembersControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MembersControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IMemberService> _memberService;
    private readonly MembersController _controller;

    public MembersControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _memberService = new Mock<IMemberService>();
        _controller = new MembersController(_context, _memberService.Object);
    }

    [Fact]
    public async Task List_ExcludesArchivedByDefault()
    {
        _context.Members.Add(new Member { Name = "Active" });
        _context.Members.Add(new Member { Name = "Archived", IsArchived = true });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync(includeArchived: false) as OkObjectResult;
        var members = result!.Value as IEnumerable<MemberResponse>;
        Assert.Single(members!);
        Assert.Equal("Active", members!.First().Name);
    }

    [Fact]
    public async Task List_IncludesArchivedWhenRequested()
    {
        _context.Members.Add(new Member { Name = "Active" });
        _context.Members.Add(new Member { Name = "Archived", IsArchived = true });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync(includeArchived: true) as OkObjectResult;
        var members = result!.Value as IEnumerable<MemberResponse>;
        Assert.Equal(2, members!.Count());
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsMemberResponse()
    {
        var result = await _controller.CreateAsync(
            new MemberCreateRequest("Ash", Pronouns: "they/them")) as OkObjectResult;
        var member = result!.Value as MemberResponse;
        Assert.Equal("Ash", member!.Name);
        Assert.Equal("they/them", member.Pronouns);
    }

    [Fact]
    public async Task Update_ExtraImages_MoreThanThree_Returns400()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(m.Id,
            new MemberUpdateRequest(ExtraImages: ["a", "b", "c", "d"]));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_ParentIds_CallsMemberService()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        _memberService
            .Setup(s => s.ValidateParentIdsAsync(m.Id, It.IsAny<List<Guid>>()))
            .ReturnsAsync((true, (string?)null));

        await _controller.UpdateAsync(m.Id,
            new MemberUpdateRequest(ParentIds: [Guid.NewGuid()]));

        _memberService.Verify(s => s.ValidateParentIdsAsync(m.Id, It.IsAny<List<Guid>>()), Times.Once);
    }

    [Fact]
    public async Task Update_ParentIdsCycle_Returns400()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        _memberService
            .Setup(s => s.ValidateParentIdsAsync(m.Id, It.IsAny<List<Guid>>()))
            .ReturnsAsync((false, "Circular parent reference detected"));

        var result = await _controller.UpdateAsync(m.Id,
            new MemberUpdateRequest(ParentIds: [m.Id]));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — expect compile error**

- [ ] **Step 3: Create MembersController**

```csharp
// src/PluralHost.Api/Controllers/MembersController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members")]
public class MembersController(
    PluralHostContext context,
    IMemberService memberService) : ControllerBase
{
    private static MemberResponse ToResponse(Member m) => new(
        m.Id, m.Name, m.DisplayName, m.Pronouns, m.Color, m.Role,
        m.Description, m.AvatarPath, m.IsPrivate, m.IsPinned, m.IsArchived,
        m.IsUntracked, m.PreventFrontNotification, m.ReceiveBoardNotifications,
        m.ExtraImages, m.SpMemberId, m.Status, m.ParentIds,
        m.Groups.Select(g => g.Id).ToList(),
        m.CreatedAt, m.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync([FromQuery] bool includeArchived = false)
    {
        var query = context.Members.Include(m => m.Groups).AsQueryable();
        if (!includeArchived) query = query.Where(m => !m.IsArchived);
        var members = await query
            .OrderByDescending(m => m.IsPinned)
            .ThenBy(m => m.Name)
            .ToListAsync();
        return Ok(members.Select(ToResponse));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetAsync(Guid id)
    {
        var member = await context.Members.Include(m => m.Groups)
            .FirstOrDefaultAsync(m => m.Id == id);
        return member is null ? NotFound() : Ok(ToResponse(member));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] MemberCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "name is required" });

        var member = new Member
        {
            Name = body.Name,
            DisplayName = body.DisplayName,
            Pronouns = body.Pronouns,
            Color = body.Color,
            Role = body.Role,
            Description = body.Description,
            IsPrivate = body.IsPrivate
        };
        context.Members.Add(member);
        await context.SaveChangesAsync();
        return Ok(ToResponse(member));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] MemberUpdateRequest body)
    {
        var member = await context.Members.Include(m => m.Groups)
            .FirstOrDefaultAsync(m => m.Id == id);
        if (member is null) return NotFound();

        if (body.ExtraImages is not null && body.ExtraImages.Count > 3)
            return BadRequest(new { error = "Maximum 3 extra images allowed" });

        if (body.ParentIds is not null)
        {
            // Validate only — do NOT save here. ParentIds is set below and persisted
            // with the main SaveChangesAsync to avoid a double-save atomicity issue.
            var (ok, err) = await memberService.ValidateParentIdsAsync(id, body.ParentIds);
            if (!ok) return BadRequest(new { error = err });
            member.ParentIds = body.ParentIds;
        }

        if (body.Name is not null)                        member.Name = body.Name;
        if (body.DisplayName is not null)                 member.DisplayName = body.DisplayName;
        if (body.Pronouns is not null)                    member.Pronouns = body.Pronouns;
        if (body.Color is not null)                       member.Color = body.Color;
        if (body.Role is not null)                        member.Role = body.Role;
        if (body.Description is not null)                 member.Description = body.Description;
        if (body.IsPrivate is not null)                   member.IsPrivate = body.IsPrivate.Value;
        if (body.IsPinned is not null)                    member.IsPinned = body.IsPinned.Value;
        if (body.IsArchived is not null)                  member.IsArchived = body.IsArchived.Value;
        if (body.IsUntracked is not null)                 member.IsUntracked = body.IsUntracked.Value;
        if (body.PreventFrontNotification is not null)    member.PreventFrontNotification = body.PreventFrontNotification.Value;
        if (body.ReceiveBoardNotifications is not null)   member.ReceiveBoardNotifications = body.ReceiveBoardNotifications.Value;
        if (body.ExtraImages is not null)                 member.ExtraImages = body.ExtraImages;
        if (body.SpMemberId is not null)                  member.SpMemberId = body.SpMemberId;
        if (body.Status is not null)                      member.Status = body.Status.Value;
        // Note: ParentIds already set above via ValidateParentIdsAsync + direct assignment

        await context.SaveChangesAsync();
        return Ok(ToResponse(member));
    }
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "MembersControllerTests" -v minimal
```

- [ ] **Step 5: Full test run**
```bash
dotnet test 2>&1 | tail -5
```

- [ ] **Step 6: Commit**
```bash
git add src/PluralHost.Api/Controllers/MembersController.cs \
        tests/PluralHost.Tests/Controllers/MembersControllerTests.cs
git commit -m "feat: add native MembersController with all enriched fields"
```

---

## Chunk 4: Board, Notes, SP Fixes

### Task 13: BoardController

**Files:**
- Create: `src/PluralHost.Api/Controllers/BoardController.cs`
- Create: `tests/PluralHost.Tests/Controllers/BoardControllerTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Controllers/BoardControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class BoardControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly BoardController _controller;
    private readonly Member _member;

    public BoardControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _member = new Member { Name = "Ash" };
        _context.Members.Add(_member);
        _context.SaveChanges();
        _gatekeeper = new Mock<IGatekeeperService>();
        _controller = new BoardController(_context, _gatekeeper.Object);
    }

    [Fact]
    public async Task List_ReturnsMemberMessages()
    {
        _context.BoardMessages.Add(new BoardMessage
            { MemberId = _member.Id, AuthorName = "Sol", Content = "hello" });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync(_member.Id) as OkObjectResult;
        var messages = result!.Value as IEnumerable<BoardMessageResponse>;
        Assert.Single(messages!);
    }

    [Fact]
    public async Task Post_ValidMessage_Saves()
    {
        var result = await _controller.PostAsync(_member.Id,
            new BoardMessageCreateRequest("Sol", "hello board")) as OkObjectResult;
        var response = result!.Value as BoardMessageResponse;
        Assert.Equal("Sol", response!.AuthorName);
    }

    [Fact]
    public async Task Post_EmptyContent_Returns400()
    {
        var result = await _controller.PostAsync(_member.Id,
            new BoardMessageCreateRequest("Sol", "  "));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Post_EmptyAuthorName_Returns400()
    {
        var result = await _controller.PostAsync(_member.Id,
            new BoardMessageCreateRequest("  ", "hello"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Delete_WithValidPin_SoftDeletes()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var msg = new BoardMessage
            { MemberId = _member.Id, AuthorName = "Sol", Content = "hi" };
        _context.BoardMessages.Add(msg);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, msg.Id, "1234");
        Assert.IsType<OkResult>(result);

        var inDb = await _context.BoardMessages
            .IgnoreQueryFilters()
            .FirstAsync(m => m.Id == msg.Id);
        Assert.NotNull(inDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_InvalidPin_Returns403()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("bad")).ReturnsAsync(false);
        var msg = new BoardMessage
            { MemberId = _member.Id, AuthorName = "Sol", Content = "hi" };
        _context.BoardMessages.Add(msg);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, msg.Id, "bad");
        Assert.IsType<ForbidResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — expect compile error**

- [ ] **Step 3: Create BoardController**

```csharp
// src/PluralHost.Api/Controllers/BoardController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members/{memberId:guid}/board")]
public class BoardController(
    PluralHostContext context,
    IGatekeeperService gatekeeper) : ControllerBase
{
    private static BoardMessageResponse ToResponse(BoardMessage m) =>
        new(m.Id, m.MemberId, m.AuthorName, m.Content, m.CreatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync(Guid memberId)
    {
        var messages = await context.BoardMessages
            .Where(m => m.MemberId == memberId)
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();
        return Ok(messages.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> PostAsync(Guid memberId,
        [FromBody] BoardMessageCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Content))
            return BadRequest(new { error = "Content is required" });
        if (string.IsNullOrWhiteSpace(body.AuthorName))
            return BadRequest(new { error = "AuthorName is required" });

        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var msg = new BoardMessage
        {
            MemberId = memberId,
            AuthorName = body.AuthorName.Trim(),
            Content = body.Content.Trim()
        };
        context.BoardMessages.Add(msg);
        await context.SaveChangesAsync();
        return Ok(ToResponse(msg));
    }

    [HttpDelete("{msgId:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid memberId, Guid msgId,
        [FromQuery] string pin)
    {
        if (!await gatekeeper.ValidatePinAsync(pin))
            return Forbid();

        var msg = await context.BoardMessages
            .FirstOrDefaultAsync(m => m.Id == msgId && m.MemberId == memberId);
        if (msg is null) return NotFound();

        msg.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "BoardControllerTests" -v minimal
```

- [ ] **Step 5: Commit**
```bash
git add src/PluralHost.Api/Controllers/BoardController.cs \
        tests/PluralHost.Tests/Controllers/BoardControllerTests.cs
git commit -m "feat: add BoardController with PIN-gated delete"
```

---

### Task 14: MemberNotesController

**Files:**
- Create: `src/PluralHost.Api/Controllers/MemberNotesController.cs`
- Create: `tests/PluralHost.Tests/Controllers/MemberNotesControllerTests.cs`

- [ ] **Step 1: Write failing tests**

```csharp
// tests/PluralHost.Tests/Controllers/MemberNotesControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MemberNotesControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly MemberNotesController _controller;
    private readonly Member _member;

    public MemberNotesControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _member = new Member { Name = "Ash" };
        _context.Members.Add(_member);
        _context.SaveChanges();
        _gatekeeper = new Mock<IGatekeeperService>();
        _controller = new MemberNotesController(_context, _gatekeeper.Object);
    }

    [Fact]
    public async Task Create_ValidNote_Returns200()
    {
        var result = await _controller.CreateAsync(_member.Id,
            new MemberNoteCreateRequest("My note", "Title")) as OkObjectResult;
        var note = result!.Value as MemberNoteResponse;
        Assert.Equal("My note", note!.Content);
        Assert.Equal("Title", note.Title);
    }

    [Fact]
    public async Task Create_EmptyContent_Returns400()
    {
        var result = await _controller.CreateAsync(_member.Id,
            new MemberNoteCreateRequest("   "));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_LockedNote_Returns400()
    {
        var note = new MemberNote
            { MemberId = _member.Id, Content = "note", IsLocked = true };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(Content: "changed"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_UnlockThenEdit_Succeeds()
    {
        var note = new MemberNote
            { MemberId = _member.Id, Content = "note", IsLocked = true };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        // Unlock first
        await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(IsLocked: false));

        // Now edit
        var result = await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(Content: "changed"));
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Update_UnlockAndEditInSameRequest_Returns400()
    {
        // Single request with both IsLocked: false AND Content — should be rejected.
        // Unlock must be a separate request.
        var note = new MemberNote { MemberId = _member.Id, Content = "note", IsLocked = true };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(_member.Id, note.Id,
            new MemberNoteUpdateRequest(IsLocked: false, Content: "changed"));
        Assert.IsType<BadRequestObjectResult>(result);

        // Confirm note is still locked (no partial save)
        var inDb = await _context.MemberNotes.IgnoreQueryFilters()
            .FirstAsync(n => n.Id == note.Id);
        Assert.True(inDb.IsLocked);
        Assert.Equal("note", inDb.Content);
    }

    [Fact]
    public async Task Delete_WithValidPin_SoftDeletes()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);
        var note = new MemberNote { MemberId = _member.Id, Content = "note" };
        _context.MemberNotes.Add(note);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, note.Id, "1234");
        Assert.IsType<OkResult>(result);

        var inDb = await _context.MemberNotes
            .IgnoreQueryFilters()
            .FirstAsync(n => n.Id == note.Id);
        Assert.NotNull(inDb.DeletedAt);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — expect compile error**

- [ ] **Step 3: Create MemberNotesController**

```csharp
// src/PluralHost.Api/Controllers/MemberNotesController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members/{memberId:guid}/notes")]
public class MemberNotesController(
    PluralHostContext context,
    IGatekeeperService gatekeeper) : ControllerBase
{
    private static MemberNoteResponse ToResponse(MemberNote n) =>
        new(n.Id, n.MemberId, n.Title, n.Content, n.IsPinned, n.IsLocked,
            n.CreatedAt, n.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync(Guid memberId)
    {
        var notes = await context.MemberNotes
            .Where(n => n.MemberId == memberId)
            .OrderByDescending(n => n.IsPinned)
            .ThenByDescending(n => n.UpdatedAt)
            .ToListAsync();
        return Ok(notes.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync(Guid memberId,
        [FromBody] MemberNoteCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Content))
            return BadRequest(new { error = "Note content is required" });

        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var note = new MemberNote
        {
            MemberId = memberId,
            Title = body.Title?.Trim(),
            Content = body.Content.Trim()
        };
        context.MemberNotes.Add(note);
        await context.SaveChangesAsync();
        return Ok(ToResponse(note));
    }

    [HttpPatch("{noteId:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid memberId, Guid noteId,
        [FromBody] MemberNoteUpdateRequest body)
    {
        var note = await context.MemberNotes
            .FirstOrDefaultAsync(n => n.Id == noteId && n.MemberId == memberId);
        if (note is null) return NotFound();

        // Check lock guard BEFORE applying any changes.
        // If the note is currently locked and content/title edits are requested,
        // reject even if IsLocked: false is also in the same request.
        // Unlocking must be a separate request with no content/title changes.
        if (note.IsLocked && (body.Content is not null || body.Title is not null))
            return BadRequest(new { error = "Note is locked. Unlock it before editing." });

        if (body.IsLocked is not null) note.IsLocked = body.IsLocked.Value;

        if (body.Content is not null)
        {
            if (string.IsNullOrWhiteSpace(body.Content))
                return BadRequest(new { error = "Note content is required" });
            note.Content = body.Content.Trim();
        }
        if (body.Title is not null)  note.Title = body.Title.Trim();
        if (body.IsPinned is not null) note.IsPinned = body.IsPinned.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(note));
    }

    [HttpDelete("{noteId:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid memberId, Guid noteId,
        [FromQuery] string pin)
    {
        if (!await gatekeeper.ValidatePinAsync(pin))
            return Forbid();

        var note = await context.MemberNotes
            .FirstOrDefaultAsync(n => n.Id == noteId && n.MemberId == memberId);
        if (note is null) return NotFound();

        note.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 4: Run — expect PASS**
```bash
dotnet test tests/PluralHost.Tests --filter "MemberNotesControllerTests" -v minimal
```

- [ ] **Step 5: Commit**
```bash
git add src/PluralHost.Api/Controllers/MemberNotesController.cs \
        tests/PluralHost.Tests/Controllers/MemberNotesControllerTests.cs
git commit -m "feat: add MemberNotesController with lock guard and PIN-gated delete"
```

---

### Task 15: Fix SP compatibility

**Files:**
- Modify: `src/PluralHost.Api/Dto/SpDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/SpMembersController.cs`
- Modify: `src/PluralHost.Api/Controllers/SpFrontController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs`
- Modify: `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs`

- [ ] **Step 1: Fix SpDtos.cs comment**

In `SpDtos.cs`, update the comment on `SpMemberContent.Archived`:

Find:
```csharp
bool Archived          // maps to Member.Status == Dormant or Gone
```
Replace with:
```csharp
bool Archived          // maps to Member.IsArchived
```

- [ ] **Step 2: Fix SpMembersController — ToEnvelope**

In `SpMembersController.cs`, find:
```csharp
Archived: m.Status is MemberStatus.Dormant or MemberStatus.Gone
```
Replace with:
```csharp
Archived: m.IsArchived
```

Also find and remove the Status-based Archived logic in `UpdateAsync`:
```csharp
if (body.Archived is true) member.Status = MemberStatus.Dormant;
if (body.Archived is false && member.Status == MemberStatus.Dormant)
    member.Status = MemberStatus.Active;
```
Replace with:
```csharp
if (body.Archived is not null) member.IsArchived = body.Archived.Value;
```

- [ ] **Step 3: Fix SpFrontController — complete the CustomStatus fix from Task 3**

Update all front history queries to include the navigation property.

In `SpFrontController.cs`:

Find `GetCurrentFrontersAsync`:
```csharp
var fronters = await context.FrontHistory
    .Where(f => f.FrontEnd == null)
    .ToListAsync();
```
Replace with:
```csharp
var fronters = await context.FrontHistory
    .Include(f => f.CustomStatus)
    .Where(f => f.FrontEnd == null)
    .ToListAsync();
```

Find `GetHistoryAsync`:
```csharp
var history = await context.FrontHistory.ToListAsync();
```
Replace with:
```csharp
var history = await context.FrontHistory
    .Include(f => f.CustomStatus)
    .ToListAsync();
```

Find `GetEntryAsync`:
```csharp
var entry = await context.FrontHistory.FirstOrDefaultAsync(f => f.Id == guid);
```
Replace with:
```csharp
var entry = await context.FrontHistory
    .Include(f => f.CustomStatus)
    .FirstOrDefaultAsync(f => f.Id == guid);
```

In `CreateAsync`, the `Note` field is already removed from `FrontHistory`. Update the entry creation to use `Comment`:
```csharp
var entry = new FrontHistory
{
    MemberId = memberId,
    FrontStart = Epoch.FromMs(body.StartTime),
    FrontEnd = body.EndTime.HasValue ? Epoch.FromMs(body.EndTime.Value) : null,
    Comment = body.CustomStatus   // stored as plain comment via SP compat layer
};
```

In `UpdateAsync`, the stub left from Task 3 needs a real implementation. Since SP sends a string status, store it as `Comment` (SP compat only — no FrontStatus lookup):
```csharp
if (body.CustomStatus is not null) entry.Comment = body.CustomStatus;
```

- [ ] **Step 4: Build cleanly**
```bash
dotnet build 2>&1 | tail -5
```
Expected: `Build succeeded`

- [ ] **Step 5: Run SP-related tests**
```bash
dotnet test tests/PluralHost.Tests --filter "SpMembersControllerTests|SpFrontControllerTests" -v minimal
```

- [ ] **Step 6: Fix SP test failures from the Archived mapping change**

In `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs`:

Find any test that sets up archived state via `Status`:
```csharp
Status = MemberStatus.Dormant
```
Replace with:
```csharp
IsArchived = true
```

Find any assertion that checks `Archived` via status:
```csharp
m.Status is MemberStatus.Dormant or MemberStatus.Gone
// or
Assert.Equal(MemberStatus.Dormant, member.Status)  // in Archived context
```
Replace with:
```csharp
m.IsArchived == true
// or
Assert.True(member.IsArchived)
```

In `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs`, find any test setup that sets `Note` on a front history entry:
```csharp
Note = "Co-con"
```
Replace with:
```csharp
Comment = "Co-con"
```

- [ ] **Step 7: Run full test suite — final check**
```bash
dotnet test 2>&1 | tail -8
```
Expected: all tests pass except the 3 pre-existing JWT stubs. Total should be significantly higher than 95.

- [ ] **Step 8: Final commit**
```bash
git add src/PluralHost.Api/Dto/SpDtos.cs \
        src/PluralHost.Api/Controllers/SpMembersController.cs \
        src/PluralHost.Api/Controllers/SpFrontController.cs \
        tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs \
        tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs
git commit -m "fix: update SP controllers — Archived maps from IsArchived, CustomStatus from FrontStatus nav"
```

---

## Final Verification

- [ ] Run full test suite
```bash
dotnet test 2>&1 | tail -8
```
Expected: 3 failures (pre-existing JWT stubs), all others pass

- [ ] Build Docker image
```bash
docker compose build 2>&1 | tail -5
```

- [ ] Confirm API starts cleanly (migrations auto-apply)
```bash
docker compose up -d && sleep 3 && docker compose logs --tail=10 && docker compose down
```
Expected: no errors, `Done applying migrations`
