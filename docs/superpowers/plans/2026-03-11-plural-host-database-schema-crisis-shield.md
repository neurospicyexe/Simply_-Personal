# Plural-Host: Database Schema & Crisis Shield Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SQLite database schema, EF Core models, soft-delete infrastructure, Ghost Mode middleware, Gatekeeper PIN service, and AccessTokens sharing endpoint for Plural-Host — a PTSD/DID-safe self-hosted system management suite.

**Architecture:** ASP.NET Core 8 Web API with EF Core 8 on SQLite. All "safe delete" behavior is enforced via a global `HasQueryFilter` on `deleted_at IS NULL` — no data is ever hard-deleted by default. Ghost Mode (system freeze) is a second-layer EF Core global filter that makes all member/front/group data invisible to queries when `SystemSettings.IsFrozen = true`, returning 200 OK with empty arrays to the client.

**Tech Stack:** .NET 8, ASP.NET Core Web API, EF Core 8 (SQLite provider), xUnit, Moq, BCrypt.Net-Next, Docker (docker-compose)

---

## Chunk 1: Solution Setup & Core Domain Models

### Task 1: Create Solution & Project Structure

**Files:**
- Create: `PluralHost.sln`
- Create: `src/PluralHost.Api/PluralHost.Api.csproj`
- Create: `tests/PluralHost.Tests/PluralHost.Tests.csproj`

- [ ] **Step 1: Scaffold the solution**

```bash
cd /c/dev/simply-personal
dotnet new sln -n PluralHost
mkdir -p src/PluralHost.Api tests/PluralHost.Tests
dotnet new webapi -n PluralHost.Api -o src/PluralHost.Api --no-openapi
dotnet new xunit -n PluralHost.Tests -o tests/PluralHost.Tests
dotnet sln add src/PluralHost.Api/PluralHost.Api.csproj
dotnet sln add tests/PluralHost.Tests/PluralHost.Tests.csproj
```

Expected: Solution created with two projects.

- [ ] **Step 2: Add NuGet packages to API project**

```bash
cd src/PluralHost.Api
dotnet add package Microsoft.EntityFrameworkCore.Sqlite --version 8.*
dotnet add package Microsoft.EntityFrameworkCore.Design --version 8.*
dotnet add package BCrypt.Net-Next --version 4.*
```

- [ ] **Step 3: Add NuGet packages to test project**

```bash
cd ../../tests/PluralHost.Tests
dotnet add reference ../../src/PluralHost.Api/PluralHost.Api.csproj
dotnet add package Microsoft.EntityFrameworkCore.InMemory --version 8.*
dotnet add package Moq --version 4.*
```

- [ ] **Step 4: Verify build compiles clean**

```bash
cd /c/dev/simply-personal
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold solution, API project, and test project"
```

---

### Task 2: Soft-Delete Interface & Base Entity

**Files:**
- Create: `src/PluralHost.Api/Domain/ISoftDeletable.cs`
- Create: `src/PluralHost.Api/Domain/BaseEntity.cs`
- Create: `tests/PluralHost.Tests/Domain/BaseEntityTests.cs`

The `ISoftDeletable` interface is the contract for every table that supports soft-delete. Implementing it on a shared `BaseEntity` means the EF Core global filter only needs to be written once.

- [ ] **Step 1: Write the failing test**

Create `tests/PluralHost.Tests/Domain/BaseEntityTests.cs`:

```csharp
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class BaseEntityTests
{
    [Fact]
    public void NewEntity_HasNoDeletedAt()
    {
        var entity = new ConcreteEntity();
        Assert.Null(entity.DeletedAt);
    }

    [Fact]
    public void SoftDelete_SetsDeletedAt()
    {
        var entity = new ConcreteEntity();
        entity.SoftDelete();
        Assert.NotNull(entity.DeletedAt);
    }

    [Fact]
    public void Restore_ClearsDeletedAt()
    {
        var entity = new ConcreteEntity();
        entity.SoftDelete();
        entity.Restore();
        Assert.Null(entity.DeletedAt);
    }

    // Concrete subclass for testing
    private class ConcreteEntity : BaseEntity { }
}
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /c/dev/simply-personal
dotnet test tests/PluralHost.Tests --filter "BaseEntityTests" -v minimal
```

Expected: FAIL — `BaseEntity` type not found.

- [ ] **Step 3: Create the interface and base class**

Create `src/PluralHost.Api/Domain/ISoftDeletable.cs`:

```csharp
namespace PluralHost.Api.Domain;

public interface ISoftDeletable
{
    DateTime? DeletedAt { get; set; }
    bool IsDeleted => DeletedAt.HasValue;
    void SoftDelete();
    void Restore();
}
```

Create `src/PluralHost.Api/Domain/BaseEntity.cs`:

```csharp
namespace PluralHost.Api.Domain;

public abstract class BaseEntity : ISoftDeletable
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAt { get; set; }

    public bool IsDeleted => DeletedAt.HasValue;

    public void SoftDelete() => DeletedAt = DateTime.UtcNow;
    public void Restore() => DeletedAt = null;
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
dotnet test tests/PluralHost.Tests --filter "BaseEntityTests" -v minimal
```

Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/ tests/PluralHost.Tests/Domain/
git commit -m "feat: add ISoftDeletable interface and BaseEntity with soft-delete logic"
```

---

### Task 3: Member Domain Model

**Files:**
- Create: `src/PluralHost.Api/Domain/Member.cs`
- Create: `tests/PluralHost.Tests/Domain/MemberTests.cs`

`Member` is the core entity. It includes `IsPrivate` (hidden even from read-only share tokens) and lifecycle/lineage support (Active, Dormant, Fused, Gone).

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Domain/MemberTests.cs`:

```csharp
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class MemberTests
{
    [Fact]
    public void NewMember_DefaultsToActiveStatus()
    {
        var member = new Member { Name = "Ash" };
        Assert.Equal(MemberStatus.Active, member.Status);
    }

    [Fact]
    public void NewMember_IsNotPrivateByDefault()
    {
        var member = new Member { Name = "Ash" };
        Assert.False(member.IsPrivate);
    }

    [Fact]
    public void FusedMember_CanLinkToParents()
    {
        var parent1 = new Member { Name = "A" };
        var parent2 = new Member { Name = "B" };
        var fused = new Member { Name = "AB", Status = MemberStatus.Fused };
        fused.ParentIds.Add(parent1.Id);
        fused.ParentIds.Add(parent2.Id);

        Assert.Equal(2, fused.ParentIds.Count);
    }
}
```

- [ ] **Step 2: Run — verify fails**

```bash
dotnet test tests/PluralHost.Tests --filter "MemberTests" -v minimal
```

Expected: FAIL — `Member` type not found.

- [ ] **Step 3: Implement Member model**

Create `src/PluralHost.Api/Domain/Member.cs`:

```csharp
namespace PluralHost.Api.Domain;

public enum MemberStatus { Active, Dormant, Fused, Gone }

public class Member : BaseEntity
{
    public required string Name { get; set; }
    public string? DisplayName { get; set; }
    public string? Pronouns { get; set; }
    public string? AvatarPath { get; set; }   // Relative path under /secure_uploads/
    public string? Color { get; set; }         // Hex color for UI
    public string? Role { get; set; }
    public string? Description { get; set; }
    public bool IsPrivate { get; set; } = false;
    public MemberStatus Status { get; set; } = MemberStatus.Active;

    // Lineage: for Fused members, the IDs of their parents
    public List<Guid> ParentIds { get; set; } = [];
}
```

- [ ] **Step 4: Run — verify passes**

```bash
dotnet test tests/PluralHost.Tests --filter "MemberTests" -v minimal
```

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/Member.cs tests/PluralHost.Tests/Domain/MemberTests.cs
git commit -m "feat: add Member domain model with lifecycle status and privacy flag"
```

---

### Task 4: SystemSettings Domain Model

**Files:**
- Create: `src/PluralHost.Api/Domain/SystemSettings.cs`
- Create: `tests/PluralHost.Tests/Domain/SystemSettingsTests.cs`

`SystemSettings` is a **singleton** table (only one row ever exists). It holds the Ghost Mode state and Gatekeeper PIN hash. The `ShouldAutoUnfreeze()` method encapsulates the timer logic.

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Domain/SystemSettingsTests.cs`:

```csharp
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class SystemSettingsTests
{
    [Fact]
    public void ShouldAutoUnfreeze_WhenFreezeEndDatePassed_ReturnsTrue()
    {
        var settings = new SystemSettings
        {
            IsFrozen = true,
            FreezeEndDate = DateTime.UtcNow.AddHours(-1)
        };
        Assert.True(settings.ShouldAutoUnfreeze());
    }

    [Fact]
    public void ShouldAutoUnfreeze_WhenFreezeEndDateFuture_ReturnsFalse()
    {
        var settings = new SystemSettings
        {
            IsFrozen = true,
            FreezeEndDate = DateTime.UtcNow.AddHours(1)
        };
        Assert.False(settings.ShouldAutoUnfreeze());
    }

    [Fact]
    public void ShouldAutoUnfreeze_WhenNoFreezeEndDate_ReturnsFalse()
    {
        var settings = new SystemSettings { IsFrozen = true };
        Assert.False(settings.ShouldAutoUnfreeze());
    }

    [Fact]
    public void HasPendingDeletion_WhenCooldownSet_ReturnsTrue()
    {
        var settings = new SystemSettings
        {
            DeletionCooldownEnd = DateTime.UtcNow.AddDays(2)
        };
        Assert.True(settings.HasPendingDeletion());
    }

    [Fact]
    public void DeletionIsFinalized_WhenCooldownPassed_ReturnsTrue()
    {
        var settings = new SystemSettings
        {
            DeletionCooldownEnd = DateTime.UtcNow.AddHours(-1)
        };
        Assert.True(settings.DeletionIsFinalized());
    }
}
```

- [ ] **Step 2: Run — verify fails**

```bash
dotnet test tests/PluralHost.Tests --filter "SystemSettingsTests" -v minimal
```

Expected: FAIL — `SystemSettings` not found.

- [ ] **Step 3: Implement SystemSettings**

Create `src/PluralHost.Api/Domain/SystemSettings.cs`:

```csharp
namespace PluralHost.Api.Domain;

public class SystemSettings
{
    // Singleton — always Id = 1
    public int Id { get; set; } = 1;

    // Ghost Mode
    public bool IsFrozen { get; set; } = false;
    public DateTime? FreezeEndDate { get; set; }

    // Gatekeeper PIN (BCrypt hash) — separate from login password
    public string? GatekeeperPinHash { get; set; }

    // Deletion cooldown: set when deletion is requested, finalized 72h later
    public DateTime? DeletionCooldownEnd { get; set; }

    public bool ShouldAutoUnfreeze() =>
        IsFrozen && FreezeEndDate.HasValue && FreezeEndDate.Value <= DateTime.UtcNow;

    public bool HasPendingDeletion() =>
        DeletionCooldownEnd.HasValue && DeletionCooldownEnd.Value > DateTime.UtcNow;

    public bool DeletionIsFinalized() =>
        DeletionCooldownEnd.HasValue && DeletionCooldownEnd.Value <= DateTime.UtcNow;
}
```

- [ ] **Step 4: Run — verify passes**

```bash
dotnet test tests/PluralHost.Tests --filter "SystemSettingsTests" -v minimal
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/SystemSettings.cs tests/PluralHost.Tests/Domain/SystemSettingsTests.cs
git commit -m "feat: add SystemSettings model with Ghost Mode and deletion cooldown logic"
```

---

### Task 5: AccessToken Domain Model

**Files:**
- Create: `src/PluralHost.Api/Domain/AccessToken.cs`
- Create: `tests/PluralHost.Tests/Domain/AccessTokenTests.cs`

`AccessToken` models the read-only share links. `IsValid()` encapsulates expiry + revocation in one place.

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Domain/AccessTokenTests.cs`:

```csharp
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class AccessTokenTests
{
    [Fact]
    public void IsValid_WhenActiveAndNotExpired_ReturnsTrue()
    {
        var token = new AccessToken
        {
            TokenValue = "abc123",
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            Label = "Shared with Partner"
        };
        Assert.True(token.IsValid());
    }

    [Fact]
    public void IsValid_WhenExpired_ReturnsFalse()
    {
        var token = new AccessToken
        {
            TokenValue = "abc123",
            ExpiresAt = DateTime.UtcNow.AddHours(-1),
        };
        Assert.False(token.IsValid());
    }

    [Fact]
    public void IsValid_WhenRevoked_ReturnsFalse()
    {
        var token = new AccessToken
        {
            TokenValue = "abc123",
            ExpiresAt = DateTime.UtcNow.AddDays(7),
            RevokedAt = DateTime.UtcNow.AddMinutes(-5)
        };
        Assert.False(token.IsValid());
    }

    [Fact]
    public void IsValid_WhenNullExpiry_ReturnsTrue()
    {
        // Tokens with no expiry are permanent until revoked
        var token = new AccessToken { TokenValue = "abc123" };
        Assert.True(token.IsValid());
    }
}
```

- [ ] **Step 2: Run — verify fails**

```bash
dotnet test tests/PluralHost.Tests --filter "AccessTokenTests" -v minimal
```

- [ ] **Step 3: Implement AccessToken**

Create `src/PluralHost.Api/Domain/AccessToken.cs`:

```csharp
namespace PluralHost.Api.Domain;

public enum TokenPermission
{
    ReadOnly,        // Can see members + current front (respects IsPrivate flags)
    ReadFrontOnly    // Can only see who is currently fronting (most restricted)
}

public class AccessToken
{
    public required string TokenValue { get; set; }   // Primary key — the share URL fragment
    public TokenPermission Permission { get; set; } = TokenPermission.ReadFrontOnly;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? Label { get; set; }                // Human-readable, e.g. "Shared with Partner"
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public bool IsValid() =>
        RevokedAt == null &&
        (ExpiresAt == null || ExpiresAt.Value > DateTime.UtcNow);
}
```

- [ ] **Step 4: Run — verify passes**

```bash
dotnet test tests/PluralHost.Tests --filter "AccessTokenTests" -v minimal
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/AccessToken.cs tests/PluralHost.Tests/Domain/AccessTokenTests.cs
git commit -m "feat: add AccessToken model with permission levels and validity logic"
```

---

### Task 6: Remaining Domain Models (FrontHistory, Group)

**Files:**
- Create: `src/PluralHost.Api/Domain/FrontHistory.cs`
- Create: `src/PluralHost.Api/Domain/Group.cs`

These are simpler models but must inherit `BaseEntity` for soft-delete.

- [ ] **Step 1: Create FrontHistory**

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
    public string? Note { get; set; }
}
```

- [ ] **Step 2: Create Group**

```csharp
// src/PluralHost.Api/Domain/Group.cs
namespace PluralHost.Api.Domain;

public class Group : BaseEntity
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Color { get; set; }
    public bool IsPrivate { get; set; } = false;

    // Navigation: members in this group (managed via join table)
    public List<Member> Members { get; set; } = [];
}
```

- [ ] **Step 3: Verify build**

```bash
dotnet build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Api/Domain/FrontHistory.cs src/PluralHost.Api/Domain/Group.cs
git commit -m "feat: add FrontHistory and Group domain models"
```

---

## Chunk 2: DbContext with Global Filters

### Task 7: EF Core DbContext with Soft-Delete & Ghost Mode Global Filters

**Files:**
- Create: `src/PluralHost.Api/Data/PluralHostContext.cs`
- Create: `tests/PluralHost.Tests/Data/SoftDeleteFilterTests.cs`
- Create: `tests/PluralHost.Tests/Data/GhostModeFilterTests.cs`

This is the most architecturally important task. Two global filters are applied:
1. `deleted_at IS NULL` — filters out soft-deleted rows from every query
2. Ghost Mode filter — when `IsFrozen = true`, returns empty sets for Member/FrontHistory/Group

**Critical:** EF Core global filters are applied transparently. Any `.IgnoreQueryFilters()` call can bypass them — never use that in production paths.

- [ ] **Step 1: Write failing tests for soft-delete filter**

Create `tests/PluralHost.Tests/Data/SoftDeleteFilterTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Data;

public class SoftDeleteFilterTests : IDisposable
{
    private readonly PluralHostContext _context;

    public SoftDeleteFilterTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
    }

    [Fact]
    public async Task SoftDeletedMember_IsExcludedFromNormalQuery()
    {
        var member = new Member { Name = "Ash" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        member.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _context.Members.ToListAsync();
        Assert.Empty(result);
    }

    [Fact]
    public async Task SoftDeletedMember_IsVisibleWithIgnoreFilter()
    {
        var member = new Member { Name = "River" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        member.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _context.Members.IgnoreQueryFilters().ToListAsync();
        Assert.Single(result);
    }

    [Fact]
    public async Task RestoredMember_IsVisibleAgain()
    {
        var member = new Member { Name = "Sky" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        member.SoftDelete();
        await _context.SaveChangesAsync();
        member.Restore();
        await _context.SaveChangesAsync();

        var result = await _context.Members.ToListAsync();
        Assert.Single(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Write failing tests for Ghost Mode filter**

Create `tests/PluralHost.Tests/Data/GhostModeFilterTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Data;

public class GhostModeFilterTests : IDisposable
{
    private readonly PluralHostContext _context;

    public GhostModeFilterTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
    }

    private async Task FreezeSystem()
    {
        var settings = await _context.SystemSettings.FirstOrDefaultAsync()
            ?? new SystemSettings();
        settings.IsFrozen = true;
        _context.SystemSettings.Update(settings);
        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear(); // Force re-read
    }

    [Fact]
    public async Task WhenFrozen_MembersQueryReturnsEmpty()
    {
        _context.Members.Add(new Member { Name = "Ash" });
        await _context.SaveChangesAsync();

        await FreezeSystem();

        var result = await _context.Members.ToListAsync();
        Assert.Empty(result);
    }

    [Fact]
    public async Task WhenFrozen_FrontHistoryQueryReturnsEmpty()
    {
        var member = new Member { Name = "Ash" };
        _context.Members.Add(member);
        _context.FrontHistory.Add(new FrontHistory { MemberId = member.Id });
        await _context.SaveChangesAsync();

        await FreezeSystem();

        var result = await _context.FrontHistory.ToListAsync();
        Assert.Empty(result);
    }

    [Fact]
    public async Task WhenUnfrozen_MembersQueryReturnsData()
    {
        _context.Members.Add(new Member { Name = "Ash" });
        await _context.SaveChangesAsync();

        // Confirm unfrozen by default
        var result = await _context.Members.ToListAsync();
        Assert.Single(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 3: Run — verify all tests fail**

```bash
dotnet test tests/PluralHost.Tests --filter "SoftDeleteFilterTests|GhostModeFilterTests" -v minimal
```

Expected: FAIL — `PluralHostContext` not found.

- [ ] **Step 4: Implement PluralHostContext**

Create `src/PluralHost.Api/Data/PluralHostContext.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ── Singleton SystemSettings (always Id=1) ──────────────────────
        modelBuilder.Entity<SystemSettings>()
            .HasData(new SystemSettings { Id = 1 });

        // ── AccessToken: string primary key ─────────────────────────────
        modelBuilder.Entity<AccessToken>()
            .HasKey(t => t.TokenValue);

        // ── Member: JSON column for ParentIds list ───────────────────────
        modelBuilder.Entity<Member>()
            .Property(m => m.ParentIds)
            .HasConversion(
                v => string.Join(',', v),
                v => v.Split(',', StringSplitOptions.RemoveEmptyEntries)
                       .Select(Guid.Parse).ToList());

        // ── GLOBAL FILTER 1: Soft-Delete ─────────────────────────────────
        // Applied to all entities that inherit BaseEntity.
        // WHERE deleted_at IS NULL
        modelBuilder.Entity<Member>()
            .HasQueryFilter(m => m.DeletedAt == null);
        modelBuilder.Entity<FrontHistory>()
            .HasQueryFilter(f => f.DeletedAt == null);
        modelBuilder.Entity<Group>()
            .HasQueryFilter(g => g.DeletedAt == null);

        // ── GLOBAL FILTER 2: Ghost Mode ──────────────────────────────────
        // If SystemSettings.IsFrozen = true, these sets return empty.
        // The filter is re-evaluated per-query using EF's inline subquery.
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
    }

    // Auto-update UpdatedAt on save
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

- [ ] **Step 5: Run — verify tests pass**

```bash
dotnet test tests/PluralHost.Tests --filter "SoftDeleteFilterTests|GhostModeFilterTests" -v minimal
```

Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Data/ tests/PluralHost.Tests/Data/
git commit -m "feat: add PluralHostContext with soft-delete and Ghost Mode global query filters"
```

---

### Task 8: EF Core Migration & SQLite Wire-up

**Files:**
- Create: `src/PluralHost.Api/Data/Migrations/` (auto-generated)
- Modify: `src/PluralHost.Api/Program.cs`
- Create: `src/PluralHost.Api/appsettings.json`

- [ ] **Step 1: Configure connection string in appsettings.json**

```json
{
  "ConnectionStrings": {
    "Default": "Data Source=pluralhost.db"
  },
  "Logging": {
    "LogLevel": { "Default": "Warning" }
  }
}
```

- [ ] **Step 2: Wire up DbContext in Program.cs**

Replace the contents of `src/PluralHost.Api/Program.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<PluralHostContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddControllers();

var app = builder.Build();

// Auto-run migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PluralHostContext>();
    db.Database.Migrate();
}

app.MapControllers();
app.Run();
```

- [ ] **Step 3: Create initial migration**

```bash
cd /c/dev/simply-personal/src/PluralHost.Api
dotnet ef migrations add InitialSchema --output-dir Data/Migrations
```

Expected: Migration files created in `Data/Migrations/`.

- [ ] **Step 4: Apply migration to verify schema**

```bash
dotnet ef database update
```

Expected: `pluralhost.db` created with all tables.

- [ ] **Step 5: Verify tables exist**

```bash
sqlite3 pluralhost.db ".tables"
```

Expected output includes: `Members FrontHistory Groups AccessTokens SystemSettings`

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Program.cs src/PluralHost.Api/appsettings.json src/PluralHost.Api/Data/Migrations/
git commit -m "feat: wire up SQLite DbContext with auto-migration on startup"
```

---

## Chunk 3: Ghost Mode & Gatekeeper Services

### Task 9: Ghost Mode Service

**Files:**
- Create: `src/PluralHost.Api/Services/IGhostModeService.cs`
- Create: `src/PluralHost.Api/Services/GhostModeService.cs`
- Create: `tests/PluralHost.Tests/Services/GhostModeServiceTests.cs`

The service layer provides the `Freeze`/`Unfreeze` operations and handles the auto-unfreeze timer check. Controllers call this service — they never touch `SystemSettings` directly.

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Services/GhostModeServiceTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class GhostModeServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly GhostModeService _service;

    public GhostModeServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _service = new GhostModeService(_context);
    }

    [Fact]
    public async Task Freeze_SetsFrozenFlag()
    {
        await _service.FreezeAsync(duration: null);
        var settings = await _context.SystemSettings.FirstAsync();
        Assert.True(settings.IsFrozen);
    }

    [Fact]
    public async Task Freeze_WithDuration_SetsFreezeEndDate()
    {
        await _service.FreezeAsync(duration: TimeSpan.FromHours(48));
        var settings = await _context.SystemSettings.FirstAsync();
        Assert.NotNull(settings.FreezeEndDate);
        Assert.True(settings.FreezeEndDate > DateTime.UtcNow.AddHours(47));
    }

    [Fact]
    public async Task Unfreeze_ClearsFrozenFlagAndEndDate()
    {
        await _service.FreezeAsync(duration: TimeSpan.FromHours(24));
        await _service.UnfreezeAsync();

        var settings = await _context.SystemSettings.FirstAsync();
        Assert.False(settings.IsFrozen);
        Assert.Null(settings.FreezeEndDate);
    }

    [Fact]
    public async Task CheckAutoUnfreeze_WhenTimerExpired_UnfreezesSystem()
    {
        // Simulate an expired timer by setting FreezeEndDate in the past
        var settings = await _context.SystemSettings.FirstAsync();
        settings.IsFrozen = true;
        settings.FreezeEndDate = DateTime.UtcNow.AddHours(-1);
        await _context.SaveChangesAsync();

        await _service.CheckAutoUnfreezeAsync();

        _context.ChangeTracker.Clear();
        var updated = await _context.SystemSettings.FirstAsync();
        Assert.False(updated.IsFrozen);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — verify fails**

```bash
dotnet test tests/PluralHost.Tests --filter "GhostModeServiceTests" -v minimal
```

- [ ] **Step 3: Create the interface**

Create `src/PluralHost.Api/Services/IGhostModeService.cs`:

```csharp
namespace PluralHost.Api.Services;

public interface IGhostModeService
{
    Task FreezeAsync(TimeSpan? duration);
    Task UnfreezeAsync();
    Task CheckAutoUnfreezeAsync();
    Task<bool> IsFrozenAsync();
}
```

- [ ] **Step 4: Implement the service**

Create `src/PluralHost.Api/Services/GhostModeService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class GhostModeService(PluralHostContext context) : IGhostModeService
{
    public async Task FreezeAsync(TimeSpan? duration)
    {
        var settings = await context.SystemSettings.FirstAsync();
        settings.IsFrozen = true;
        settings.FreezeEndDate = duration.HasValue
            ? DateTime.UtcNow.Add(duration.Value)
            : null;
        await context.SaveChangesAsync();
    }

    public async Task UnfreezeAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        settings.IsFrozen = false;
        settings.FreezeEndDate = null;
        await context.SaveChangesAsync();
    }

    public async Task CheckAutoUnfreezeAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        if (settings.ShouldAutoUnfreeze())
        {
            settings.IsFrozen = false;
            settings.FreezeEndDate = null;
            await context.SaveChangesAsync();
        }
    }

    public async Task<bool> IsFrozenAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        return settings.IsFrozen;
    }
}
```

- [ ] **Step 5: Run — verify passes**

```bash
dotnet test tests/PluralHost.Tests --filter "GhostModeServiceTests" -v minimal
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Services/ tests/PluralHost.Tests/Services/GhostModeServiceTests.cs
git commit -m "feat: add GhostModeService with freeze/unfreeze and auto-unfreeze timer"
```

---

### Task 10: Gatekeeper PIN Service

**Files:**
- Create: `src/PluralHost.Api/Services/IGatekeeperService.cs`
- Create: `src/PluralHost.Api/Services/GatekeeperService.cs`
- Create: `tests/PluralHost.Tests/Services/GatekeeperServiceTests.cs`

The Gatekeeper PIN is hashed with BCrypt (work factor 12) and stored separately from the user's login password. This service validates it before any destructive or irreversible action.

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Services/GatekeeperServiceTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class GatekeeperServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly GatekeeperService _service;

    public GatekeeperServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _service = new GatekeeperService(_context);
    }

    [Fact]
    public async Task SetPin_StoresHashedValue()
    {
        await _service.SetPinAsync("correct-horse-battery-staple");

        var settings = await _context.SystemSettings.FirstAsync();
        Assert.NotNull(settings.GatekeeperPinHash);
        Assert.NotEqual("correct-horse-battery-staple", settings.GatekeeperPinHash);
    }

    [Fact]
    public async Task ValidatePin_WithCorrectPin_ReturnsTrue()
    {
        await _service.SetPinAsync("vault-password");
        var valid = await _service.ValidatePinAsync("vault-password");
        Assert.True(valid);
    }

    [Fact]
    public async Task ValidatePin_WithWrongPin_ReturnsFalse()
    {
        await _service.SetPinAsync("vault-password");
        var valid = await _service.ValidatePinAsync("wrong-password");
        Assert.False(valid);
    }

    [Fact]
    public async Task ValidatePin_WhenNoPinSet_ReturnsFalse()
    {
        // No pin set — system is unprotected, deny as safe default
        var valid = await _service.ValidatePinAsync("anything");
        Assert.False(valid);
    }

    [Fact]
    public async Task IsPinSet_WhenHashExists_ReturnsTrue()
    {
        await _service.SetPinAsync("some-pin");
        Assert.True(await _service.IsPinSetAsync());
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — verify fails**

```bash
dotnet test tests/PluralHost.Tests --filter "GatekeeperServiceTests" -v minimal
```

- [ ] **Step 3: Create interface**

Create `src/PluralHost.Api/Services/IGatekeeperService.cs`:

```csharp
namespace PluralHost.Api.Services;

public interface IGatekeeperService
{
    Task SetPinAsync(string plainPin);
    Task<bool> ValidatePinAsync(string plainPin);
    Task<bool> IsPinSetAsync();
}
```

- [ ] **Step 4: Implement Gatekeeper service**

Create `src/PluralHost.Api/Services/GatekeeperService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class GatekeeperService(PluralHostContext context) : IGatekeeperService
{
    private const int BcryptWorkFactor = 12;

    public async Task SetPinAsync(string plainPin)
    {
        var settings = await context.SystemSettings.FirstAsync();
        settings.GatekeeperPinHash = BCrypt.Net.BCrypt.HashPassword(plainPin, BcryptWorkFactor);
        await context.SaveChangesAsync();
    }

    public async Task<bool> ValidatePinAsync(string plainPin)
    {
        var settings = await context.SystemSettings.FirstAsync();
        if (string.IsNullOrEmpty(settings.GatekeeperPinHash))
            return false; // No pin set — deny by default (safe)

        return BCrypt.Net.BCrypt.Verify(plainPin, settings.GatekeeperPinHash);
    }

    public async Task<bool> IsPinSetAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        return !string.IsNullOrEmpty(settings.GatekeeperPinHash);
    }
}
```

- [ ] **Step 5: Run — verify passes**

```bash
dotnet test tests/PluralHost.Tests --filter "GatekeeperServiceTests" -v minimal
```

Expected: PASS — 5 tests.

- [ ] **Step 6: Register services in Program.cs**

Add to `Program.cs` before `builder.Build()`:

```csharp
builder.Services.AddScoped<IGhostModeService, GhostModeService>();
builder.Services.AddScoped<IGatekeeperService, GatekeeperService>();
```

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Services/ tests/PluralHost.Tests/Services/GatekeeperServiceTests.cs
git commit -m "feat: add GatekeeperService with BCrypt PIN hashing for destructive action protection"
```

---

## Chunk 4: Controllers — SecureAction & Share Endpoints

### Task 11: SecureAction Controller (Freeze / Unfreeze / Delete Cooldown)

**Files:**
- Create: `src/PluralHost.Api/Controllers/SecureActionController.cs`
- Create: `tests/PluralHost.Tests/Controllers/SecureActionControllerTests.cs`

This controller gates all destructive or state-changing actions behind the Gatekeeper PIN. Unfreeze requires PIN. Deletion request starts the 72-hour cooldown.

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Controllers/SecureActionControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class SecureActionControllerTests
{
    private readonly Mock<IGhostModeService> _ghostMock = new();
    private readonly Mock<IGatekeeperService> _gatekeeperMock = new();
    private SecureActionController CreateController() =>
        new(_ghostMock.Object, _gatekeeperMock.Object);

    [Fact]
    public async Task Freeze_NoPin_ReturnsOk()
    {
        // Freezing doesn't require PIN — anyone can freeze (safe action)
        var controller = CreateController();
        var result = await controller.FreezeAsync(new FreezeRequest { DurationHours = 48 });
        Assert.IsType<OkResult>(result);
    }

    [Fact]
    public async Task Unfreeze_WithCorrectPin_ReturnsOk()
    {
        _gatekeeperMock.Setup(g => g.ValidatePinAsync("correct")).ReturnsAsync(true);
        var controller = CreateController();
        var result = await controller.UnfreezeAsync(new PinRequest { Pin = "correct" });
        Assert.IsType<OkResult>(result);
    }

    [Fact]
    public async Task Unfreeze_WithWrongPin_ReturnsUnauthorized()
    {
        _gatekeeperMock.Setup(g => g.ValidatePinAsync("wrong")).ReturnsAsync(false);
        var controller = CreateController();
        var result = await controller.UnfreezeAsync(new PinRequest { Pin = "wrong" });
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public async Task RequestDeletion_WithCorrectPin_ReturnsOkWithCooldown()
    {
        _gatekeeperMock.Setup(g => g.ValidatePinAsync("correct")).ReturnsAsync(true);
        var controller = CreateController();
        var result = await controller.RequestDeletionAsync(new PinRequest { Pin = "correct" });
        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task RequestDeletion_WithWrongPin_ReturnsUnauthorized()
    {
        _gatekeeperMock.Setup(g => g.ValidatePinAsync("bad")).ReturnsAsync(false);
        var controller = CreateController();
        var result = await controller.RequestDeletionAsync(new PinRequest { Pin = "bad" });
        Assert.IsType<UnauthorizedObjectResult>(result);
    }
}
```

- [ ] **Step 2: Run — verify fails**

```bash
dotnet test tests/PluralHost.Tests --filter "SecureActionControllerTests" -v minimal
```

- [ ] **Step 3: Create the controller and request models**

Create `src/PluralHost.Api/Controllers/SecureActionController.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

public record FreezeRequest(int? DurationHours);
public record PinRequest(string Pin);

[ApiController]
[Route("api/secure")]
public class SecureActionController(
    IGhostModeService ghostMode,
    IGatekeeperService gatekeeper) : ControllerBase
{
    // POST /api/secure/freeze — Anyone can freeze (it's a safety action)
    [HttpPost("freeze")]
    public async Task<IActionResult> FreezeAsync([FromBody] FreezeRequest request)
    {
        var duration = request.DurationHours.HasValue
            ? TimeSpan.FromHours(request.DurationHours.Value)
            : (TimeSpan?)null;
        await ghostMode.FreezeAsync(duration);
        return Ok();
    }

    // POST /api/secure/unfreeze — Requires Gatekeeper PIN
    [HttpPost("unfreeze")]
    public async Task<IActionResult> UnfreezeAsync([FromBody] PinRequest request)
    {
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });

        await ghostMode.UnfreezeAsync();
        return Ok();
    }

    // POST /api/secure/request-deletion — Requires PIN, starts 72h cooldown
    [HttpPost("request-deletion")]
    public async Task<IActionResult> RequestDeletionAsync(
        [FromBody] PinRequest request,
        [FromServices] PluralHostContext context)
    {
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });

        var settings = await context.SystemSettings.FirstAsync();
        var cooldownEnd = DateTime.UtcNow.AddHours(72);
        settings.DeletionCooldownEnd = cooldownEnd;
        await context.SaveChangesAsync();

        return Ok(new
        {
            message = "Deletion cooldown started. Account will be permanently deleted after:",
            finalizeAt = cooldownEnd
        });
    }

    // DELETE /api/secure/cancel-deletion — Requires PIN, cancels pending deletion
    [HttpDelete("cancel-deletion")]
    public async Task<IActionResult> CancelDeletionAsync(
        [FromBody] PinRequest request,
        [FromServices] PluralHostContext context)
    {
        if (!await gatekeeper.ValidatePinAsync(request.Pin))
            return Unauthorized(new { error = "Invalid Gatekeeper PIN." });

        var settings = await context.SystemSettings.FirstAsync();
        settings.DeletionCooldownEnd = null;
        await context.SaveChangesAsync();

        return Ok(new { message = "Deletion cancelled. Your data is safe." });
    }
}
```

- [ ] **Step 4: Run — verify passes**

```bash
dotnet test tests/PluralHost.Tests --filter "SecureActionControllerTests" -v minimal
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/SecureActionController.cs tests/PluralHost.Tests/Controllers/SecureActionControllerTests.cs
git commit -m "feat: add SecureActionController with PIN-gated freeze/unfreeze and 72h deletion cooldown"
```

---

### Task 12: Share Token Service & Endpoint

**Files:**
- Create: `src/PluralHost.Api/Services/IShareTokenService.cs`
- Create: `src/PluralHost.Api/Services/ShareTokenService.cs`
- Create: `src/PluralHost.Api/Controllers/ShareController.cs`
- Create: `tests/PluralHost.Tests/Services/ShareTokenServiceTests.cs`

The `GET /share/{token}` endpoint returns a public-safe view. If the system is frozen, even valid tokens return empty data — preserving Ghost Mode privacy.

- [ ] **Step 1: Write failing tests for ShareTokenService**

Create `tests/PluralHost.Tests/Services/ShareTokenServiceTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class ShareTokenServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly ShareTokenService _service;

    public ShareTokenServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _service = new ShareTokenService(_context);
    }

    [Fact]
    public async Task CreateToken_ReturnsTokenWithUniqueValue()
    {
        var token = await _service.CreateTokenAsync(
            label: "Partner",
            permission: TokenPermission.ReadOnly,
            expiresAt: DateTime.UtcNow.AddDays(30));

        Assert.NotEmpty(token.TokenValue);
    }

    [Fact]
    public async Task CreateTwoTokens_HaveDifferentValues()
    {
        var t1 = await _service.CreateTokenAsync("A", TokenPermission.ReadOnly, null);
        var t2 = await _service.CreateTokenAsync("B", TokenPermission.ReadOnly, null);
        Assert.NotEqual(t1.TokenValue, t2.TokenValue);
    }

    [Fact]
    public async Task RevokeToken_SetsRevokedAt()
    {
        var token = await _service.CreateTokenAsync("Partner", TokenPermission.ReadOnly, null);
        await _service.RevokeTokenAsync(token.TokenValue);

        var updated = await _context.AccessTokens
            .IgnoreQueryFilters()
            .FirstAsync(t => t.TokenValue == token.TokenValue);
        Assert.NotNull(updated.RevokedAt);
    }

    [Fact]
    public async Task ResolveToken_WithValidToken_ReturnsToken()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.ReadFrontOnly,
            DateTime.UtcNow.AddDays(1));

        var resolved = await _service.ResolveTokenAsync(token.TokenValue);
        Assert.NotNull(resolved);
    }

    [Fact]
    public async Task ResolveToken_WithExpiredToken_ReturnsNull()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.ReadFrontOnly,
            DateTime.UtcNow.AddHours(-1));

        var resolved = await _service.ResolveTokenAsync(token.TokenValue);
        Assert.Null(resolved);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run — verify fails**

```bash
dotnet test tests/PluralHost.Tests --filter "ShareTokenServiceTests" -v minimal
```

- [ ] **Step 3: Create interface and service**

Create `src/PluralHost.Api/Services/IShareTokenService.cs`:

```csharp
using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public interface IShareTokenService
{
    Task<AccessToken> CreateTokenAsync(string? label, TokenPermission permission, DateTime? expiresAt);
    Task RevokeTokenAsync(string tokenValue);
    Task<AccessToken?> ResolveTokenAsync(string tokenValue);
}
```

Create `src/PluralHost.Api/Services/ShareTokenService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public class ShareTokenService(PluralHostContext context) : IShareTokenService
{
    public async Task<AccessToken> CreateTokenAsync(
        string? label,
        TokenPermission permission,
        DateTime? expiresAt)
    {
        var token = new AccessToken
        {
            TokenValue = GenerateToken(),
            Label = label,
            Permission = permission,
            ExpiresAt = expiresAt
        };
        context.AccessTokens.Add(token);
        await context.SaveChangesAsync();
        return token;
    }

    public async Task RevokeTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue)
            ?? throw new KeyNotFoundException($"Token '{tokenValue}' not found.");

        token.RevokedAt = DateTime.UtcNow;
        await context.SaveChangesAsync();
    }

    public async Task<AccessToken?> ResolveTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue);

        return token?.IsValid() == true ? token : null;
    }

    private static string GenerateToken() =>
        Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
}
```

- [ ] **Step 4: Run — verify passes**

```bash
dotnet test tests/PluralHost.Tests --filter "ShareTokenServiceTests" -v minimal
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Create ShareController**

Create `src/PluralHost.Api/Controllers/ShareController.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("share")]
public class ShareController(
    IShareTokenService tokenService,
    IGhostModeService ghostMode,
    PluralHostContext context) : ControllerBase
{
    // GET /share/{token} — Public read-only view (respects Ghost Mode + privacy flags)
    [HttpGet("{token}")]
    public async Task<IActionResult> GetSharedViewAsync(string token)
    {
        var accessToken = await tokenService.ResolveTokenAsync(token);
        if (accessToken == null)
            return Unauthorized(new { error = "Invalid or expired share token." });

        // Ghost Mode: even valid tokens return empty during a freeze
        if (await ghostMode.IsFrozenAsync())
            return Ok(new { members = Array.Empty<object>(), currentFront = Array.Empty<object>() });

        // ReadFrontOnly: only return current fronters
        if (accessToken.Permission == TokenPermission.ReadFrontOnly)
        {
            var front = await context.FrontHistory
                .Include(f => f.Member)
                .Where(f => f.FrontEnd == null && f.Member != null && !f.Member.IsPrivate)
                .Select(f => new { f.Member!.Name, f.Member.DisplayName, f.Member.Color })
                .ToListAsync();
            return Ok(new { currentFront = front });
        }

        // ReadOnly: return public members + current front
        var members = await context.Members
            .Where(m => !m.IsPrivate)
            .Select(m => new { m.Name, m.DisplayName, m.Pronouns, m.Color, m.Status })
            .ToListAsync();

        var currentFront = await context.FrontHistory
            .Include(f => f.Member)
            .Where(f => f.FrontEnd == null && f.Member != null && !f.Member.IsPrivate)
            .Select(f => new { f.Member!.Name, f.Member.DisplayName })
            .ToListAsync();

        return Ok(new { members, currentFront });
    }
}
```

- [ ] **Step 6: Register ShareTokenService in Program.cs**

Add:
```csharp
builder.Services.AddScoped<IShareTokenService, ShareTokenService>();
```

- [ ] **Step 7: Verify full build**

```bash
cd /c/dev/simply-personal
dotnet build
```

Expected: 0 errors.

- [ ] **Step 8: Run all tests**

```bash
dotnet test -v minimal
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/PluralHost.Api/Services/IShareTokenService.cs src/PluralHost.Api/Services/ShareTokenService.cs src/PluralHost.Api/Controllers/ShareController.cs tests/PluralHost.Tests/Services/ShareTokenServiceTests.cs
git commit -m "feat: add ShareTokenService and GET /share/{token} endpoint with Ghost Mode awareness"
```

---

## Chunk 5: Docker & Auto-Unfreeze Background Service

### Task 13: Auto-Unfreeze Background Service

**Files:**
- Create: `src/PluralHost.Api/BackgroundServices/AutoUnfreezeService.cs`

Periodically checks if a timed freeze has expired and automatically unfreezes the system.

- [ ] **Step 1: Create the background service**

```csharp
// src/PluralHost.Api/BackgroundServices/AutoUnfreezeService.cs
using PluralHost.Api.Services;

namespace PluralHost.Api.BackgroundServices;

public class AutoUnfreezeService(IServiceScopeFactory scopeFactory, ILogger<AutoUnfreezeService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

            using var scope = scopeFactory.CreateScope();
            var ghostMode = scope.ServiceProvider.GetRequiredService<IGhostModeService>();

            try
            {
                await ghostMode.CheckAutoUnfreezeAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error checking auto-unfreeze");
            }
        }
    }
}
```

- [ ] **Step 2: Register in Program.cs**

Add:
```csharp
builder.Services.AddHostedService<AutoUnfreezeService>();
```

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Api/BackgroundServices/
git commit -m "feat: add AutoUnfreezeService background service for timed freeze expiry"
```

---

### Task 14: Dockerfile & docker-compose

**Files:**
- Create: `src/PluralHost.Api/Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# src/PluralHost.Api/Dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/PluralHost.Api/PluralHost.Api.csproj", "src/PluralHost.Api/"]
RUN dotnet restore "src/PluralHost.Api/PluralHost.Api.csproj"
COPY . .
RUN dotnet publish "src/PluralHost.Api/PluralHost.Api.csproj" -c Release -o /app/publish

FROM base AS final
WORKDIR /app

# Data directory for SQLite and secure uploads
RUN mkdir -p /app/data /app/secure_uploads

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "PluralHost.Api.dll"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
# docker-compose.yml
services:
  pluralhost:
    build:
      context: .
      dockerfile: src/PluralHost.Api/Dockerfile
    ports:
      - "8080:8080"
    volumes:
      # SQLite database persisted to host
      - ./data:/app/data
      # Secure uploads (avatars, logs) — never served directly
      - ./secure_uploads:/app/secure_uploads
    environment:
      - ConnectionStrings__Default=Data Source=/app/data/pluralhost.db
      - ASPNETCORE_URLS=http://+:8080
    restart: unless-stopped
```

- [ ] **Step 3: Update appsettings.json for Docker path**

Ensure `appsettings.json` has a production-friendly default that docker-compose's env var will override:

```json
{
  "ConnectionStrings": {
    "Default": "Data Source=pluralhost.db"
  }
}
```

- [ ] **Step 4: Verify Docker build**

```bash
cd /c/dev/simply-personal
docker compose build
```

Expected: Image builds successfully.

- [ ] **Step 5: Smoke test via Docker**

```bash
docker compose up -d
curl http://localhost:8080/share/invalid-token
# Expected: 401 {"error":"Invalid or expired share token."}
docker compose down
```

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Dockerfile docker-compose.yml
git commit -m "feat: add Dockerfile and docker-compose with persistent SQLite and secure_uploads volumes"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
dotnet test -v normal
```

Expected: All tests pass, 0 failures.

- [ ] **Run the app locally and verify key behaviors**

```bash
cd src/PluralHost.Api && dotnet run &

# 1. Freeze the system
curl -X POST http://localhost:5000/api/secure/freeze \
  -H "Content-Type: application/json" \
  -d '{"durationHours": 48}'

# 2. Try to read a share link — should return empty even for valid tokens
# (Create a token first via direct DB insert for smoke test)

# 3. Unfreeze without PIN — should fail
curl -X POST http://localhost:5000/api/secure/unfreeze \
  -H "Content-Type: application/json" \
  -d '{"pin": "wrong"}'
# Expected: 401

kill %1
```

- [ ] **Final commit with tag**

```bash
git add -A
git commit -m "chore: complete Crisis Shield v1 — schema, Ghost Mode, Gatekeeper, AccessTokens"
git tag v0.1.0-crisis-shield
```

---

## What's Next (Separate Plans)

This plan intentionally excludes these subsystems — each warrants its own plan:

1. **Simply Plural API Mirror** — Replicate SP v1 routes, JSON parity for MCP tools
2. **Auth Layer** — JWT login, session management, secure media endpoint (`/media/{id}`)
3. **Members & Fronting CRUD API** — Full REST API for members, front history, groups
4. **Visualization** — React Flow mind map, 24h heatmaps, PWA shell
5. **Admin UI** — Settings page, token management, freeze/unfreeze controls
