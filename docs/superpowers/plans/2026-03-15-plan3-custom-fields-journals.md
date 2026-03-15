# Plan 3: JWT Fix, Custom Fields, and Global Journals

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix JWT login so it actually works, then add custom member fields (system-wide definitions with per-member values and privacy tiers) and global journal entries (with share-token visibility).

**Architecture:** JWT fix is a single method replacement. Custom fields use two new entities (`CustomField` definition + `CustomFieldValue` per-member), both inheriting `BaseEntity`, with a unique constraint on `(FieldId, MemberId)`. Journals use one new entity (`JournalEntry`) with an `IsPrivate` boolean. All three entities get `HasQueryFilter(x => x.DeletedAt == null)` in `PluralHostContext`. The share endpoint gains a `customFields` array per member and a new `/journals` sub-endpoint.

**Tech Stack:** .NET 8, ASP.NET Core, EF Core 8 + SQLite, xUnit + Moq, EF Core InMemory (tests)

**Spec:** `docs/superpowers/specs/2026-03-15-plan3-custom-fields-journals.md`

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/PluralHost.Api/Services/AuthService.cs` | Implement JWT generation |
| Create | `src/PluralHost.Api/Domain/CustomField.cs` | Field definition entity |
| Create | `src/PluralHost.Api/Domain/CustomFieldValue.cs` | Per-member value entity |
| Create | `src/PluralHost.Api/Domain/JournalEntry.cs` | Journal entry entity |
| Modify | `src/PluralHost.Api/Data/PluralHostContext.cs` | Add DbSets, HasQueryFilters, FK config |
| Modify | `src/PluralHost.Api/Dto/NativeDtos.cs` | Add field/value/journal DTOs |
| Create | `src/PluralHost.Api/Controllers/FieldsController.cs` | GET/POST/PATCH/DELETE /api/fields |
| Create | `src/PluralHost.Api/Controllers/MemberFieldsController.cs` | GET/PUT/DELETE /api/members/{id}/fields |
| Create | `src/PluralHost.Api/Controllers/JournalsController.cs` | GET/POST/PATCH/DELETE /api/journals |
| Modify | `src/PluralHost.Api/Controllers/ShareController.cs` | customFields on members + journals endpoint |
| Create | `tests/PluralHost.Tests/Controllers/FieldsControllerTests.cs` | Field definition tests |
| Create | `tests/PluralHost.Tests/Controllers/MemberFieldsControllerTests.cs` | Field value tests |
| Create | `tests/PluralHost.Tests/Controllers/JournalsControllerTests.cs` | Journal tests |

---

## Chunk 1: JWT Fix and Domain Models

### Task 1: Implement JWT Generation

**Context:** `AuthService.LoginAsync` throws `NotImplementedException` — login returns 500. Three `AuthServiceTests` already exist and fail because of this. Implement `GenerateTokenAsync` inline in `LoginAsync` and the tests will pass.

**Files:**
- Modify: `src/PluralHost.Api/Services/AuthService.cs`

- [ ] **Step 1: Run the currently-failing tests to confirm they fail**

```bash
dotnet test --filter "AuthServiceTests" -v minimal
```
Expected: 3 failures mentioning `NotImplementedException`.

- [ ] **Step 2: Replace the `throw` in `LoginAsync` with JWT generation**

Replace lines 37–50 in `src/PluralHost.Api/Services/AuthService.cs` (the TODO block and throw):

```csharp
public async Task<string?> LoginAsync(string plainPassword)
{
    var settings = await context.SystemSettings.FirstAsync();
    if (string.IsNullOrEmpty(settings.LoginPasswordHash))
        return null;

    if (!BCrypt.Net.BCrypt.Verify(plainPassword, settings.LoginPasswordHash))
        return null;

    var key = new SymmetricSecurityKey(
        Encoding.UTF8.GetBytes(configuration["Jwt:SigningKey"]!));
    var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256Signature);

    var expiryHours = int.TryParse(configuration["Jwt:ExpiryHours"], out var h) ? h : 24;

    var token = new JwtSecurityToken(
        issuer: configuration["Jwt:Issuer"],
        audience: configuration["Jwt:Audience"],
        claims: new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, "owner"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(JwtRegisteredClaimNames.Iat,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                ClaimValueTypes.Integer64)
        },
        expires: DateTime.UtcNow.AddHours(expiryHours),
        signingCredentials: creds);

    return new JwtSecurityTokenHandler().WriteToken(token);
}
```

- [ ] **Step 3: Run the AuthServiceTests**

```bash
dotnet test --filter "AuthServiceTests" -v minimal
```
Expected: all 3 tests PASS. Total passing count increases from 183 to 186.

- [ ] **Step 4: Run full test suite to confirm no regressions**

```bash
dotnet test -v minimal
```
Expected: 186/186 passing.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Services/AuthService.cs
git commit -m "feat: implement JWT generation in AuthService.LoginAsync"
```

---

### Task 2: Custom Field and Journal Domain Models

**Context:** Three new entities all follow the same `BaseEntity` pattern as `Member`, `MemberNote`, etc. `CustomFieldValue` adds a unique constraint on `(FieldId, MemberId)` — this is configured in `PluralHostContext`, not on the entity itself. `FieldType` is a new enum.

**Files:**
- Create: `src/PluralHost.Api/Domain/CustomField.cs`
- Create: `src/PluralHost.Api/Domain/CustomFieldValue.cs`
- Create: `src/PluralHost.Api/Domain/JournalEntry.cs`

- [ ] **Step 1: Create `CustomField.cs`**

```csharp
// src/PluralHost.Api/Domain/CustomField.cs
namespace PluralHost.Api.Domain;

public enum FieldType { Text, Multiline, Number, Date, Boolean }

public class CustomField : BaseEntity
{
    public string Label { get; set; } = string.Empty;
    public FieldType FieldType { get; set; } = FieldType.Text;
    public int SortOrder { get; set; } = 0;

    public ICollection<CustomFieldValue> Values { get; set; } = new List<CustomFieldValue>();
}
```

- [ ] **Step 2: Create `CustomFieldValue.cs`**

```csharp
// src/PluralHost.Api/Domain/CustomFieldValue.cs
namespace PluralHost.Api.Domain;

public class CustomFieldValue : BaseEntity
{
    public Guid FieldId { get; set; }
    public CustomField Field { get; set; } = null!;

    public Guid MemberId { get; set; }
    public Member Member { get; set; } = null!;

    public string Value { get; set; } = string.Empty;
    public MemberPrivacy PrivacyTier { get; set; } = MemberPrivacy.Public;
}
```

- [ ] **Step 3: Create `JournalEntry.cs`**

```csharp
// src/PluralHost.Api/Domain/JournalEntry.cs
namespace PluralHost.Api.Domain;

public class JournalEntry : BaseEntity
{
    public string? Title { get; set; }
    public string Content { get; set; } = string.Empty;
    public bool IsPrivate { get; set; } = true;
}
```

- [ ] **Step 4: Build to confirm no compile errors**

```bash
dotnet build
```
Expected: Build succeeded, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/CustomField.cs \
        src/PluralHost.Api/Domain/CustomFieldValue.cs \
        src/PluralHost.Api/Domain/JournalEntry.cs
git commit -m "feat: add CustomField, CustomFieldValue, JournalEntry domain models"
```

---

### Task 3: Register Entities in PluralHostContext

**Context:** Add three `DbSet` properties, three `HasQueryFilter` calls (soft-delete only — no Ghost Mode on these), and configure the `CustomFieldValue` unique constraint and FKs. The pattern is identical to how `FrontStatus` is configured (soft-delete-only filter). Do NOT follow `MemberNote`, `BoardMessage`, or `Member` — those entities have a double Ghost Mode + soft-delete filter.

**Files:**
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs`

- [ ] **Step 1: Add DbSet properties after the existing `MemberNotes` DbSet (line 19)**

Add after `public DbSet<MemberNote> MemberNotes => Set<MemberNote>();`:

```csharp
public DbSet<CustomField> CustomFields => Set<CustomField>();
public DbSet<CustomFieldValue> CustomFieldValues => Set<CustomFieldValue>();
public DbSet<JournalEntry> JournalEntries => Set<JournalEntry>();
```

- [ ] **Step 2: Add HasQueryFilters and FK config at the end of `OnModelCreating`, before the closing brace**

Add after the existing `modelBuilder.Entity<FrontStatus>().HasQueryFilter(...)` block:

```csharp
// CustomField + CustomFieldValue: soft-delete only (not Ghost Mode)
modelBuilder.Entity<CustomField>()
    .HasQueryFilter(cf => cf.DeletedAt == null);

modelBuilder.Entity<CustomFieldValue>()
    .HasQueryFilter(cfv => cfv.DeletedAt == null);

// CustomFieldValue: unique constraint on (FieldId, MemberId)
// Note: covers soft-deleted rows — upsert must use IgnoreQueryFilters() to find them
modelBuilder.Entity<CustomFieldValue>()
    .HasIndex(cfv => new { cfv.FieldId, cfv.MemberId })
    .IsUnique();

// CustomFieldValue FKs — no cascade delete (preserve values if field/member soft-deleted)
modelBuilder.Entity<CustomFieldValue>()
    .HasOne(cfv => cfv.Field)
    .WithMany(cf => cf.Values)
    .HasForeignKey(cfv => cfv.FieldId)
    .OnDelete(DeleteBehavior.NoAction);

modelBuilder.Entity<CustomFieldValue>()
    .HasOne(cfv => cfv.Member)
    .WithMany()
    .HasForeignKey(cfv => cfv.MemberId)
    .OnDelete(DeleteBehavior.NoAction);

// JournalEntry: soft-delete only
modelBuilder.Entity<JournalEntry>()
    .HasQueryFilter(j => j.DeletedAt == null);
```

- [ ] **Step 3: Build**

```bash
dotnet build
```
Expected: Build succeeded, 0 errors.

- [ ] **Step 4: Run existing tests to confirm nothing broken**

```bash
dotnet test -v minimal
```
Expected: 186/186 passing.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Data/PluralHostContext.cs
git commit -m "feat: register CustomField, CustomFieldValue, JournalEntry in PluralHostContext"
```

---

### Task 4: EF Core Migration

**Context:** Generate the migration that adds the three new tables. The migration should add `CustomFields`, `CustomFieldValues` (with unique index), and `JournalEntries`. No data migrations — all new tables.

**Files:**
- Generated: `src/PluralHost.Api/Data/Migrations/<timestamp>_CustomFieldsAndJournals.cs`

- [ ] **Step 1: Generate the migration**

```bash
dotnet ef migrations add CustomFieldsAndJournals --project src/PluralHost.Api --output-dir Data/Migrations
```
Expected: Migration file created.

- [ ] **Step 2: Inspect the generated migration**

Open the generated `Up()` method and verify it contains:
- `migrationBuilder.CreateTable(name: "CustomFields", ...)`
- `migrationBuilder.CreateTable(name: "CustomFieldValues", ...)`
- `migrationBuilder.CreateTable(name: "JournalEntries", ...)`
- A `CreateIndex` call with `unique: true` on `CustomFieldValues.FieldId + MemberId`
- No `UpdateData` or `DeleteData` calls — this is new tables only

If the migration looks wrong (e.g., missing tables), delete it (`dotnet ef migrations remove --project src/PluralHost.Api`) and re-check Task 3.

- [ ] **Step 3: Apply migration locally**

```bash
dotnet ef database update --project src/PluralHost.Api
```
Expected: Applied successfully.

- [ ] **Step 4: Build and test**

```bash
dotnet build && dotnet test -v minimal
```
Expected: Build succeeded, 186/186 passing.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Data/Migrations/
git commit -m "feat: add CustomFieldsAndJournals migration"
```

---

## Chunk 2: DTOs and Field Definition CRUD

### Task 5: Add DTOs to NativeDtos.cs

**Context:** Add request/response records for custom fields (definitions + values) and journals. Follow the existing `record` pattern in `NativeDtos.cs`. The `CustomFieldValueResponse` is used by both `MemberFieldsController` (owner) and `ShareController` (public share), but with different shapes — the owner response includes `id`, `fieldId`, etc. while the share response uses a slimmed `SharedCustomFieldDto`. Add both.

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`

- [ ] **Step 1: Add custom field DTOs at the end of `NativeDtos.cs`**

```csharp
// ── CustomField (definitions) ─────────────────────────────────────────
public record CustomFieldResponse(
    Guid Id, string Label, FieldType FieldType, int SortOrder,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? DeletedAt);

public record CustomFieldCreateRequest(
    string Label,
    FieldType? FieldType,   // nullable so missing JSON field returns 400, not silently default to Text
    int SortOrder = 0);

public record CustomFieldUpdateRequest(
    string? Label = null,
    int? SortOrder = null,
    FieldType? FieldType = null); // FieldType present → 400 (immutable)

// ── CustomFieldValue ──────────────────────────────────────────────────
public record CustomFieldValueResponse(
    Guid Id, Guid FieldId, Guid MemberId,
    string Value, MemberPrivacy PrivacyTier,
    DateTime CreatedAt, DateTime UpdatedAt);

// Used in GET /api/members/{id}/fields — one entry per field definition
public record MemberFieldEntry(
    Guid FieldId, string Label, FieldType FieldType, int SortOrder,
    string? Value, MemberPrivacy PrivacyTier);  // Value null = not set

public record CustomFieldValueUpsertRequest(
    string Value,
    MemberPrivacy PrivacyTier = MemberPrivacy.Public);

// Slim DTO used in GET /share/{token} member response
public record SharedCustomFieldDto(string Label, FieldType FieldType, string Value);

// ── JournalEntry ──────────────────────────────────────────────────────
public record JournalEntryResponse(
    Guid Id, string? Title, string Content, bool IsPrivate,
    DateTime CreatedAt, DateTime UpdatedAt);

public record JournalCreateRequest(
    string Content,
    string? Title = null,
    bool IsPrivate = true);

public record JournalUpdateRequest(
    string? Title = null,
    string? Content = null,
    bool? IsPrivate = null);

// Slim DTO for GET /share/{token}/journals
public record SharedJournalDto(Guid Id, string? Title, string Content, DateTime CreatedAt);
```

- [ ] **Step 2: Build**

```bash
dotnet build
```
Expected: Build succeeded, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: add CustomField, CustomFieldValue, JournalEntry DTOs"
```

---

### Task 6: FieldsController — Field Definition CRUD

**Context:** Owner-only endpoint for managing field definitions. `GET` uses `IgnoreQueryFilters()` to include soft-deleted entries. `DELETE` cascades to values inline. `PATCH` rejects `FieldType` changes with 400.

**Files:**
- Create: `src/PluralHost.Api/Controllers/FieldsController.cs`
- Create: `tests/PluralHost.Tests/Controllers/FieldsControllerTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/PluralHost.Tests/Controllers/FieldsControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class FieldsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly FieldsController _controller;

    public FieldsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new FieldsController(_context);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsField()
    {
        var result = await _controller.CreateAsync(
            new CustomFieldCreateRequest("Age", FieldType.Number, 0)) as OkObjectResult;
        var response = result!.Value as CustomFieldResponse;

        Assert.Equal("Age", response!.Label);
        Assert.Equal(FieldType.Number, response.FieldType);
        Assert.Null(response.DeletedAt);
    }

    [Fact]
    public async Task Create_MissingLabel_Returns400()
    {
        var result = await _controller.CreateAsync(
            new CustomFieldCreateRequest("", FieldType.Text));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_MissingFieldType_Returns400()
    {
        var result = await _controller.CreateAsync(
            new CustomFieldCreateRequest("Age", null));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task List_IncludesSoftDeletedEntries()
    {
        var field = new CustomField { Label = "Role", FieldType = FieldType.Text };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();
        field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var fields = (result!.Value as IEnumerable<CustomFieldResponse>)!.ToList();

        Assert.Single(fields);
        Assert.NotNull(fields[0].DeletedAt);
    }

    [Fact]
    public async Task Patch_WithFieldType_Returns400()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();

        var result = await _controller.PatchAsync(field.Id,
            new CustomFieldUpdateRequest(FieldType: FieldType.Text));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Patch_SoftDeletedField_Returns404()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();
        field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.PatchAsync(field.Id,
            new CustomFieldUpdateRequest(Label: "New Label"));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_CascadesSoftDeleteToValues()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        var member = new Member { Name = "Ember" };
        _context.CustomFields.Add(field);
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        var value = new CustomFieldValue
        {
            FieldId = field.Id, MemberId = member.Id, Value = "25"
        };
        _context.CustomFieldValues.Add(value);
        await _context.SaveChangesAsync();

        await _controller.DeleteAsync(field.Id);

        // Both field and value should be soft-deleted
        var fieldInDb = await _context.CustomFields
            .IgnoreQueryFilters()
            .FirstAsync(f => f.Id == field.Id);
        var valueInDb = await _context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstAsync(v => v.Id == value.Id);

        Assert.NotNull(fieldInDb.DeletedAt);
        Assert.NotNull(valueInDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_AlreadyDeleted_Returns200()
    {
        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();
        field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(field.Id);
        Assert.IsType<OkResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
dotnet test --filter "FieldsControllerTests" -v minimal
```
Expected: compile error or test failures — `FieldsController` does not exist yet.

- [ ] **Step 3: Create `FieldsController.cs`**

```csharp
// src/PluralHost.Api/Controllers/FieldsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/fields")]
public class FieldsController(PluralHostContext context) : ControllerBase
{
    private static CustomFieldResponse ToResponse(CustomField f) => new(
        f.Id, f.Label, f.FieldType, f.SortOrder, f.CreatedAt, f.UpdatedAt, f.DeletedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        var fields = await context.CustomFields
            .IgnoreQueryFilters()
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .ToListAsync();
        return Ok(fields.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] CustomFieldCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });
        if (!body.FieldType.HasValue)
            return BadRequest(new { error = "FieldType is required" });

        var field = new CustomField
        {
            Label = body.Label,
            FieldType = body.FieldType.Value,
            SortOrder = body.SortOrder
        };
        context.CustomFields.Add(field);
        await context.SaveChangesAsync();
        return Ok(ToResponse(field));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> PatchAsync(Guid id, [FromBody] CustomFieldUpdateRequest body)
    {
        if (body.FieldType.HasValue)
            return BadRequest(new { error = "FieldType cannot be changed after creation" });

        var field = await context.CustomFields
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == id);

        if (field is null || field.DeletedAt is not null) return NotFound();

        if (body.Label is not null) field.Label = body.Label;
        if (body.SortOrder.HasValue) field.SortOrder = body.SortOrder.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(field));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var field = await context.CustomFields
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == id);

        if (field is null) return NotFound();

        // Cascade: soft-delete all active values for this field
        var values = await context.CustomFieldValues
            .IgnoreQueryFilters()
            .Where(v => v.FieldId == id && v.DeletedAt == null)
            .ToListAsync();

        foreach (var v in values) v.SoftDelete();
        field.SoftDelete();

        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test --filter "FieldsControllerTests" -v minimal
```
Expected: all 8 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
dotnet test -v minimal
```
Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/FieldsController.cs \
        tests/PluralHost.Tests/Controllers/FieldsControllerTests.cs
git commit -m "feat: add FieldsController (GET/POST/PATCH/DELETE /api/fields)"
```

---

## Chunk 3: Member Field Values and Journal CRUD

### Task 7: MemberFieldsController — Field Value CRUD

**Context:** Returns all field definitions with each member's current value for the `GET`. Uses `IgnoreQueryFilters()` in the upsert to handle the unique-constraint-on-soft-deleted-rows problem. The `PUT` validates value type against field's `FieldType`.

**Files:**
- Create: `src/PluralHost.Api/Controllers/MemberFieldsController.cs`
- Create: `tests/PluralHost.Tests/Controllers/MemberFieldsControllerTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/PluralHost.Tests/Controllers/MemberFieldsControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MemberFieldsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly MemberFieldsController _controller;
    private Member _member = null!;
    private CustomField _field = null!;

    public MemberFieldsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new MemberFieldsController(_context);
    }

    private async Task SeedAsync()
    {
        _member = new Member { Name = "Ember" };
        _field = new CustomField { Label = "Age", FieldType = FieldType.Number, SortOrder = 0 };
        _context.Members.Add(_member);
        _context.CustomFields.Add(_field);
        await _context.SaveChangesAsync();
    }

    [Fact]
    public async Task Get_UnknownMember_Returns404()
    {
        var result = await _controller.GetAsync(Guid.NewGuid());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Get_ReturnsAllFieldsWithBlankForUnset()
    {
        await SeedAsync();

        var result = await _controller.GetAsync(_member.Id) as OkObjectResult;
        var entries = (result!.Value as IEnumerable<MemberFieldEntry>)!.ToList();

        Assert.Single(entries);
        Assert.Equal("Age", entries[0].Label);
        Assert.Null(entries[0].Value);  // not set yet
    }

    [Fact]
    public async Task Get_ReturnsSetValue()
    {
        await SeedAsync();
        _context.CustomFieldValues.Add(new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id,
            Value = "25", PrivacyTier = MemberPrivacy.Trusted
        });
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync(_member.Id) as OkObjectResult;
        var entries = (result!.Value as IEnumerable<MemberFieldEntry>)!.ToList();

        Assert.Equal("25", entries[0].Value);
        Assert.Equal(MemberPrivacy.Trusted, entries[0].PrivacyTier);
    }

    [Fact]
    public async Task Put_NewValue_CreatesRow()
    {
        await SeedAsync();

        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("25")) as OkObjectResult;
        var response = result!.Value as CustomFieldValueResponse;

        Assert.Equal("25", response!.Value);
        Assert.Equal(MemberPrivacy.Public, response.PrivacyTier);
    }

    [Fact]
    public async Task Put_ExistingValue_UpdatesRow()
    {
        await SeedAsync();
        _context.CustomFieldValues.Add(new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id, Value = "25"
        });
        await _context.SaveChangesAsync();

        await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("30"));

        var count = await _context.CustomFieldValues.CountAsync();
        var value = await _context.CustomFieldValues.FirstAsync();
        Assert.Equal(1, count);
        Assert.Equal("30", value.Value);
    }

    [Fact]
    public async Task Put_SoftDeletedValue_RestoresAndUpdates()
    {
        await SeedAsync();
        var val = new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id, Value = "25"
        };
        _context.CustomFieldValues.Add(val);
        await _context.SaveChangesAsync();
        val.SoftDelete();
        await _context.SaveChangesAsync();

        await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("99"));

        var restored = await _context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstAsync(v => v.Id == val.Id);

        Assert.Null(restored.DeletedAt);
        Assert.Equal("99", restored.Value);
    }

    [Fact]
    public async Task Put_DeletedField_Returns400()
    {
        await SeedAsync();
        _field.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("25"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_InvalidNumberValue_Returns400()
    {
        await SeedAsync(); // field is Number type

        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest("banana"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_InvalidDateValue_Returns400()
    {
        var member = new Member { Name = "X" };
        var dateField = new CustomField { Label = "Birthday", FieldType = FieldType.Date };
        _context.Members.Add(member);
        _context.CustomFields.Add(dateField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, dateField.Id,
            new CustomFieldValueUpsertRequest("not-a-date"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_InvalidBooleanValue_Returns400()
    {
        var member = new Member { Name = "X" };
        var boolField = new CustomField { Label = "Driving", FieldType = FieldType.Boolean };
        _context.Members.Add(member);
        _context.CustomFields.Add(boolField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, boolField.Id,
            new CustomFieldValueUpsertRequest("yes"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForTextField_Succeeds()
    {
        var member = new Member { Name = "X" };
        var textField = new CustomField { Label = "Notes", FieldType = FieldType.Text };
        _context.Members.Add(member);
        _context.CustomFields.Add(textField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, textField.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task Delete_SoftDeletesValue()
    {
        await SeedAsync();
        var val = new CustomFieldValue
        {
            FieldId = _field.Id, MemberId = _member.Id, Value = "25"
        };
        _context.CustomFieldValues.Add(val);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(_member.Id, _field.Id);
        Assert.IsType<OkResult>(result);

        var inDb = await _context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstAsync();
        Assert.NotNull(inDb.DeletedAt);
    }

    [Fact]
    public async Task Delete_NoValueRow_Returns404()
    {
        await SeedAsync();
        // No value row exists for this member+field pair
        var result = await _controller.DeleteAsync(_member.Id, _field.Id);
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForNumber_Returns400()
    {
        await SeedAsync(); // field is Number type
        var result = await _controller.UpsertAsync(
            _member.Id, _field.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForDate_Returns400()
    {
        var member = new Member { Name = "X" };
        var dateField = new CustomField { Label = "Birthday", FieldType = FieldType.Date };
        _context.Members.Add(member);
        _context.CustomFields.Add(dateField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, dateField.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_EmptyStringForBoolean_Returns400()
    {
        var member = new Member { Name = "X" };
        var boolField = new CustomField { Label = "Driving", FieldType = FieldType.Boolean };
        _context.Members.Add(member);
        _context.CustomFields.Add(boolField);
        await _context.SaveChangesAsync();

        var result = await _controller.UpsertAsync(
            member.Id, boolField.Id,
            new CustomFieldValueUpsertRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Put_BooleanValueCaseSensitive_UpperCaseRejected()
    {
        var member = new Member { Name = "X" };
        var boolField = new CustomField { Label = "Active", FieldType = FieldType.Boolean };
        _context.Members.Add(member);
        _context.CustomFields.Add(boolField);
        await _context.SaveChangesAsync();

        // Must be lowercase "true"/"false" only
        var result = await _controller.UpsertAsync(
            member.Id, boolField.Id,
            new CustomFieldValueUpsertRequest("True"));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
dotnet test --filter "MemberFieldsControllerTests" -v minimal
```
Expected: compile error — `MemberFieldsController` does not exist.

- [ ] **Step 3: Create `MemberFieldsController.cs`**

```csharp
// src/PluralHost.Api/Controllers/MemberFieldsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members/{memberId:guid}/fields")]
public class MemberFieldsController(PluralHostContext context) : ControllerBase
{
    private static bool IsValidForType(FieldType type, string value) => type switch
    {
        FieldType.Text      => true,
        FieldType.Multiline => true,
        FieldType.Number    => !string.IsNullOrEmpty(value) && decimal.TryParse(value, out _),
        FieldType.Date      => !string.IsNullOrEmpty(value) &&
                               DateOnly.TryParseExact(value, "yyyy-MM-dd", out _),
        FieldType.Boolean   => value is "true" or "false",
        _                   => false
    };

    private static CustomFieldValueResponse ToValueResponse(CustomFieldValue v) => new(
        v.Id, v.FieldId, v.MemberId, v.Value, v.PrivacyTier, v.CreatedAt, v.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> GetAsync(Guid memberId)
    {
        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var fields = await context.CustomFields
            .IgnoreQueryFilters()
            .Where(f => f.DeletedAt == null)
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .ToListAsync();

        var values = await context.CustomFieldValues
            .Where(v => v.MemberId == memberId)
            .ToListAsync();

        var valuesByFieldId = values.ToDictionary(v => v.FieldId);

        var entries = fields.Select(f =>
        {
            var hasValue = valuesByFieldId.TryGetValue(f.Id, out var val);
            return new MemberFieldEntry(
                f.Id, f.Label, f.FieldType, f.SortOrder,
                hasValue ? val!.Value : null,
                hasValue ? val!.PrivacyTier : MemberPrivacy.Public);
        });

        return Ok(entries);
    }

    [HttpPut("{fieldId:guid}")]
    public async Task<IActionResult> UpsertAsync(
        Guid memberId, Guid fieldId,
        [FromBody] CustomFieldValueUpsertRequest body)
    {
        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists) return NotFound();

        var field = await context.CustomFields
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(f => f.Id == fieldId);

        if (field is null) return NotFound();
        if (field.DeletedAt is not null)
            return BadRequest(new { error = "Field has been deleted" });

        if (!IsValidForType(field.FieldType, body.Value))
            return BadRequest(new { error = $"Value is not valid for field type {field.FieldType}" });

        // Upsert — must use IgnoreQueryFilters() because the unique constraint covers soft-deleted rows
        var existing = await context.CustomFieldValues
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(v => v.FieldId == fieldId && v.MemberId == memberId);

        if (existing is not null)
        {
            existing.Restore();
            existing.Value = body.Value;
            existing.PrivacyTier = body.PrivacyTier;
        }
        else
        {
            existing = new CustomFieldValue
            {
                FieldId = fieldId,
                MemberId = memberId,
                Value = body.Value,
                PrivacyTier = body.PrivacyTier
            };
            context.CustomFieldValues.Add(existing);
        }

        await context.SaveChangesAsync();
        return Ok(ToValueResponse(existing));
    }

    [HttpDelete("{fieldId:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid memberId, Guid fieldId)
    {
        var value = await context.CustomFieldValues
            .FirstOrDefaultAsync(v => v.FieldId == fieldId && v.MemberId == memberId);

        if (value is null) return NotFound();

        value.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test --filter "MemberFieldsControllerTests" -v minimal
```
Expected: all 17 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
dotnet test -v minimal
```
Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/MemberFieldsController.cs \
        tests/PluralHost.Tests/Controllers/MemberFieldsControllerTests.cs
git commit -m "feat: add MemberFieldsController (GET/PUT/DELETE /api/members/{id}/fields)"
```

---

### Task 8: JournalsController — Journal CRUD

**Context:** Straightforward CRUD following the same `[Authorize]` + `BaseEntity` pattern. `GET` uses `.Take(500)` safety limit. `PATCH` is a partial update (null-means-unchanged pattern matching all other PATCH endpoints in this codebase).

**Files:**
- Create: `src/PluralHost.Api/Controllers/JournalsController.cs`
- Create: `tests/PluralHost.Tests/Controllers/JournalsControllerTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/PluralHost.Tests/Controllers/JournalsControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class JournalsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly JournalsController _controller;

    public JournalsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new JournalsController(_context);
    }

    [Fact]
    public async Task Create_DefaultsIsPrivateToTrue()
    {
        var result = await _controller.CreateAsync(
            new JournalCreateRequest("Today was okay.")) as OkObjectResult;
        var response = result!.Value as JournalEntryResponse;

        Assert.True(response!.IsPrivate);
    }

    [Fact]
    public async Task Create_MissingContent_Returns400()
    {
        var result = await _controller.CreateAsync(
            new JournalCreateRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_WithTitle_StoresTitle()
    {
        var result = await _controller.CreateAsync(
            new JournalCreateRequest("Body", "My Title")) as OkObjectResult;
        var response = result!.Value as JournalEntryResponse;

        Assert.Equal("My Title", response!.Title);
    }

    [Fact]
    public async Task List_OrdersByCreatedAtDesc()
    {
        _context.JournalEntries.AddRange(
            new JournalEntry { Content = "First", CreatedAt = DateTime.UtcNow.AddDays(-2) },
            new JournalEntry { Content = "Second", CreatedAt = DateTime.UtcNow.AddDays(-1) }
        );
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var entries = (result!.Value as IEnumerable<JournalEntryResponse>)!.ToList();

        Assert.Equal("Second", entries[0].Content);
        Assert.Equal("First", entries[1].Content);
    }

    [Fact]
    public async Task List_ExcludesSoftDeleted()
    {
        var entry = new JournalEntry { Content = "Gone" };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();
        entry.SoftDelete();
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var entries = (result!.Value as IEnumerable<JournalEntryResponse>)!.ToList();

        Assert.Empty(entries);
    }

    [Fact]
    public async Task Patch_UpdatesIsPrivate()
    {
        var entry = new JournalEntry { Content = "Hello", IsPrivate = true };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();

        await _controller.PatchAsync(entry.Id,
            new JournalUpdateRequest(IsPrivate: false));

        var updated = await _context.JournalEntries.FirstAsync();
        Assert.False(updated.IsPrivate);
    }

    [Fact]
    public async Task Patch_UpdatesContent()
    {
        var entry = new JournalEntry { Content = "Original" };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();

        await _controller.PatchAsync(entry.Id,
            new JournalUpdateRequest(Content: "Updated"));

        var updated = await _context.JournalEntries.FirstAsync();
        Assert.Equal("Updated", updated.Content);
    }

    [Fact]
    public async Task Delete_SoftDeletesOnly()
    {
        var entry = new JournalEntry { Content = "Hello" };
        _context.JournalEntries.Add(entry);
        await _context.SaveChangesAsync();

        await _controller.DeleteAsync(entry.Id);

        var inDb = await _context.JournalEntries
            .IgnoreQueryFilters()
            .FirstAsync();

        Assert.NotNull(inDb.DeletedAt);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
dotnet test --filter "JournalsControllerTests" -v minimal
```
Expected: compile error — `JournalsController` does not exist.

- [ ] **Step 3: Create `JournalsController.cs`**

```csharp
// src/PluralHost.Api/Controllers/JournalsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/journals")]
public class JournalsController(PluralHostContext context) : ControllerBase
{
    private static JournalEntryResponse ToResponse(JournalEntry e) => new(
        e.Id, e.Title, e.Content, e.IsPrivate, e.CreatedAt, e.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        var entries = await context.JournalEntries
            .OrderByDescending(e => e.CreatedAt)
            .Take(500)
            .ToListAsync();
        return Ok(entries.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] JournalCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Content))
            return BadRequest(new { error = "Content is required" });

        var entry = new JournalEntry
        {
            Title = body.Title,
            Content = body.Content,
            IsPrivate = body.IsPrivate
        };
        context.JournalEntries.Add(entry);
        await context.SaveChangesAsync();
        return Ok(ToResponse(entry));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> PatchAsync(Guid id, [FromBody] JournalUpdateRequest body)
    {
        var entry = await context.JournalEntries.FirstOrDefaultAsync(e => e.Id == id);
        if (entry is null) return NotFound();

        if (body.Title is not null) entry.Title = body.Title;
        if (body.Content is not null) entry.Content = body.Content;
        if (body.IsPrivate.HasValue) entry.IsPrivate = body.IsPrivate.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(entry));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var entry = await context.JournalEntries.FirstOrDefaultAsync(e => e.Id == id);
        if (entry is null) return NotFound();

        entry.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test --filter "JournalsControllerTests" -v minimal
```
Expected: all 8 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
dotnet test -v minimal
```
Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/JournalsController.cs \
        tests/PluralHost.Tests/Controllers/JournalsControllerTests.cs
git commit -m "feat: add JournalsController (GET/POST/PATCH/DELETE /api/journals)"
```

---

## Chunk 4: Share Token Integration

### Task 9: Add `customFields` to ShareController Member Response

**Context:** `ShareController.GetSharedViewAsync` currently projects members to `{ Name, DisplayName, Pronouns, Color, Status }`. It needs to also load each member's field values, filter by `(int)value.PrivacyTier < (int)token.Permission` (inline — NOT via `FilterByPermission`, which takes `IQueryable<Member>`), and include them as a `customFields` array. The `currentFront` (ReadFrontOnly) path does NOT get `customFields`.

**Files:**
- Modify: `src/PluralHost.Api/Controllers/ShareController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`

- [ ] **Step 1: Write the failing tests**

Add to the existing `ShareControllerTests.cs` class (after the existing tests):

```csharp
// ── Custom fields on share ─────────────────────────────────────────

[Fact]
public async Task GetSharedView_PublicToken_IncludesOnlyPublicTierFieldValues()
{
    var token = MakeToken(TokenPermission.Public);
    _context.AccessTokens.Add(token);

    var member = new Member { Name = "Ember", PrivacyTier = MemberPrivacy.Public };
    _context.Members.Add(member);

    var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
    var trustedField = new CustomField { Label = "Secret", FieldType = FieldType.Text };
    _context.CustomFields.AddRange(field, trustedField);
    await _context.SaveChangesAsync();

    _context.CustomFieldValues.AddRange(
        new CustomFieldValue { FieldId = field.Id, MemberId = member.Id, Value = "25", PrivacyTier = MemberPrivacy.Public },
        new CustomFieldValue { FieldId = trustedField.Id, MemberId = member.Id, Value = "hidden", PrivacyTier = MemberPrivacy.Trusted }
    );
    await _context.SaveChangesAsync();

    _tokenService.Setup(s => s.ResolveTokenAsync("t"))
        .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

    dynamic result = ((await _controller.GetSharedViewAsync("t") as OkObjectResult)!.Value)!;
    var members = (IEnumerable<dynamic>)result.members;
    var fields = (IEnumerable<dynamic>)members.First().customFields;

    Assert.Single(fields); // only Public-tier visible to Public token
    Assert.Equal("Age", ((dynamic)fields.First()).label);
}

[Fact]
public async Task GetSharedView_TrustedToken_ExcludesPrivateTierValues()
{
    var token = MakeToken(TokenPermission.Trusted);
    _context.AccessTokens.Add(token);

    var member = new Member { Name = "X", PrivacyTier = MemberPrivacy.Public };
    _context.Members.Add(member);

    var field = new CustomField { Label = "Private", FieldType = FieldType.Text };
    _context.CustomFields.Add(field);
    await _context.SaveChangesAsync();

    _context.CustomFieldValues.Add(
        new CustomFieldValue { FieldId = field.Id, MemberId = member.Id, Value = "secret", PrivacyTier = MemberPrivacy.Private }
    );
    await _context.SaveChangesAsync();

    _tokenService.Setup(s => s.ResolveTokenAsync("t"))
        .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

    dynamic result = ((await _controller.GetSharedViewAsync("t") as OkObjectResult)!.Value)!;
    var members = (IEnumerable<dynamic>)result.members;
    var fields = (IEnumerable<dynamic>)members.First().customFields;

    Assert.Empty(fields); // Private (3) is never visible — 3 < 3 is false
}

[Fact]
public async Task GetSharedView_FriendToken_IncludesPublicAndFriendTierValues()
{
    var token = MakeToken(TokenPermission.Friend);
    _context.AccessTokens.Add(token);

    var member = new Member { Name = "Z", PrivacyTier = MemberPrivacy.Public };
    _context.Members.Add(member);

    var publicField = new CustomField { Label = "Color", FieldType = FieldType.Text };
    var friendField = new CustomField { Label = "Nickname", FieldType = FieldType.Text };
    var trustedField = new CustomField { Label = "Secret", FieldType = FieldType.Text };
    _context.CustomFields.AddRange(publicField, friendField, trustedField);
    await _context.SaveChangesAsync();

    _context.CustomFieldValues.AddRange(
        new CustomFieldValue { FieldId = publicField.Id, MemberId = member.Id, Value = "blue", PrivacyTier = MemberPrivacy.Public },
        new CustomFieldValue { FieldId = friendField.Id, MemberId = member.Id, Value = "Zippy", PrivacyTier = MemberPrivacy.Friend },
        new CustomFieldValue { FieldId = trustedField.Id, MemberId = member.Id, Value = "hidden", PrivacyTier = MemberPrivacy.Trusted }
    );
    await _context.SaveChangesAsync();

    _tokenService.Setup(s => s.ResolveTokenAsync("t"))
        .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

    dynamic result = ((await _controller.GetSharedViewAsync("t") as OkObjectResult)!.Value)!;
    var members = (IEnumerable<dynamic>)result.members;
    var fields = (IEnumerable<dynamic>)members.First().customFields;

    Assert.Equal(2, fields.Count()); // Public and Friend visible; Trusted excluded
}

[Fact]
public async Task GetSharedView_SoftDeletedFieldDef_ExcludedFromCustomFields()
{
    var token = MakeToken(TokenPermission.Public);
    _context.AccessTokens.Add(token);

    var member = new Member { Name = "Y", PrivacyTier = MemberPrivacy.Public };
    _context.Members.Add(member);

    var field = new CustomField { Label = "Old", FieldType = FieldType.Text };
    _context.CustomFields.Add(field);
    await _context.SaveChangesAsync();

    _context.CustomFieldValues.Add(
        new CustomFieldValue { FieldId = field.Id, MemberId = member.Id, Value = "val", PrivacyTier = MemberPrivacy.Public }
    );
    field.SoftDelete();
    await _context.SaveChangesAsync();

    _tokenService.Setup(s => s.ResolveTokenAsync("t"))
        .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

    dynamic result = ((await _controller.GetSharedViewAsync("t") as OkObjectResult)!.Value)!;
    var members = (IEnumerable<dynamic>)result.members;
    var fields = (IEnumerable<dynamic>)members.First().customFields;

    Assert.Empty(fields);
}
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
dotnet test --filter "GetSharedView_PublicToken_IncludesOnlyPublicTierFieldValues|GetSharedView_TrustedToken_ExcludesPrivateTierValues|GetSharedView_SoftDeletedFieldDef" -v minimal
```
Expected: FAIL — `customFields` does not exist yet on the response.

- [ ] **Step 3: Update `GetSharedViewAsync` in `ShareController.cs`**

Replace the projection in the `Public/Friend/Trusted` path (the `var members = await visibility.FilterByPermission(...)` section) with a version that loads and attaches custom fields.

Find this section in `ShareController.cs`:
```csharp
var members = await visibility
    .FilterByPermission(context.Members, accessToken.Permission)
    .Select(m => new { m.Name, m.DisplayName, m.Pronouns, m.Color, m.Status })
    .ToListAsync();
```

Replace with:
```csharp
var permInt = (int)accessToken.Permission;

var members = await visibility
    .FilterByPermission(context.Members, accessToken.Permission)
    .Select(m => new
    {
        m.Id,
        m.Name,
        m.DisplayName,
        m.Pronouns,
        m.Color,
        m.Status,
        // Load values for this member filtered by permission tier
        // Must match ITokenVisibilityService.FilterByPermission tier logic
        CustomFields = m.CustomFieldValues
            .Where(v => v.DeletedAt == null &&
                        v.Field.DeletedAt == null &&
                        (int)v.PrivacyTier < permInt)
            .Select(v => new { label = v.Field.Label, fieldType = v.Field.FieldType, value = v.Value })
            .ToList()
    })
    .ToListAsync();

var memberResponse = members.Select(m => new
{
    m.Name,
    m.DisplayName,
    m.Pronouns,
    m.Color,
    m.Status,
    customFields = m.CustomFields
});
```

Also update `Member` entity to add the `CustomFieldValues` navigation property (add to `Member.cs`):

Open `src/PluralHost.Api/Domain/Member.cs` and add the following navigation property at the end of the class (after the existing properties):

```csharp
public List<CustomFieldValue> CustomFieldValues { get; set; } = [];
```

Then update `PluralHostContext.OnModelCreating` to wire the inverse navigation — find the `CustomFieldValue → Member` FK config added in Task 3 and change `WithMany()` to `WithMany(m => m.CustomFieldValues)`:

```csharp
// Before (Task 3):
modelBuilder.Entity<CustomFieldValue>()
    .HasOne(cfv => cfv.Member)
    .WithMany()
    .HasForeignKey(cfv => cfv.MemberId)
    .OnDelete(DeleteBehavior.NoAction);

// After (Task 9):
modelBuilder.Entity<CustomFieldValue>()
    .HasOne(cfv => cfv.Member)
    .WithMany(m => m.CustomFieldValues)
    .HasForeignKey(cfv => cfv.MemberId)
    .OnDelete(DeleteBehavior.NoAction);
```

Then update the return in `ShareController.GetSharedViewAsync` to use `memberResponse` instead of `members`:

```csharp
return Ok(new { members = memberResponse, currentFront = visibleFront });
```

- [ ] **Step 4: Build**

```bash
dotnet build
```
Expected: Build succeeded, 0 errors.

- [ ] **Step 5: Run the new tests**

```bash
dotnet test --filter "GetSharedView_PublicToken_IncludesOnlyPublicTierFieldValues|GetSharedView_TrustedToken_ExcludesPrivateTierValues|GetSharedView_FriendToken_IncludesPublicAndFriendTierValues|GetSharedView_SoftDeletedFieldDef" -v minimal
```
Expected: all 4 PASS.

- [ ] **Step 6: Run full suite**

```bash
dotnet test -v minimal
```
Expected: all tests passing.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Controllers/ShareController.cs \
        src/PluralHost.Api/Domain/Member.cs \
        src/PluralHost.Api/Data/PluralHostContext.cs \
        tests/PluralHost.Tests/Controllers/ShareControllerTests.cs
git commit -m "feat: add customFields to GET /share/{token} member response"
```

---

### Task 10: Add GET /share/{token}/journals Endpoint

**Context:** New endpoint on `ShareController`. Ghost Mode-first ordering (returns 200 `[]`, not 204 — GET share endpoints use empty array, not No Content). ReadFrontOnly gets 403. All other valid tokens get non-private journal entries.

**Files:**
- Modify: `src/PluralHost.Api/Controllers/ShareController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`

- [ ] **Step 1: Write the failing tests**

Add to the existing `ShareControllerTests.cs` class:

```csharp
// ── Shared journals ────────────────────────────────────────────────

[Fact]
public async Task GetSharedJournals_GhostMode_Returns200EmptyArray()
{
    _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(true);

    var result = await _controller.GetSharedJournalsAsync("anytoken") as OkObjectResult;

    Assert.NotNull(result);
    _tokenService.Verify(s => s.ResolveTokenAsync(It.IsAny<string>()), Times.Never);
    var journals = result!.Value as IEnumerable<object>;
    Assert.Empty(journals!);
}

[Fact]
public async Task GetSharedJournals_ExpiredToken_Returns401()
{
    _tokenService.Setup(s => s.ResolveTokenAsync("t"))
        .ReturnsAsync(new TokenResolveResult(null, TokenResolveStatus.Expired));

    var result = await _controller.GetSharedJournalsAsync("t");
    Assert.IsType<UnauthorizedObjectResult>(result);
}

[Fact]
public async Task GetSharedJournals_ReadFrontOnlyToken_Returns403()
{
    var token = MakeToken(TokenPermission.ReadFrontOnly);
    _tokenService.Setup(s => s.ResolveTokenAsync("t"))
        .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

    var result = await _controller.GetSharedJournalsAsync("t");
    Assert.IsType<ObjectResult>(result);
    Assert.Equal(403, ((ObjectResult)result).StatusCode);
}

[Fact]
public async Task GetSharedJournals_ValidToken_ReturnsOnlyPublicEntries()
{
    var token = MakeToken(TokenPermission.Public);
    _context.AccessTokens.Add(token);
    _context.JournalEntries.AddRange(
        new JournalEntry { Content = "Private", IsPrivate = true },
        new JournalEntry { Content = "Public", IsPrivate = false }
    );
    await _context.SaveChangesAsync();

    _tokenService.Setup(s => s.ResolveTokenAsync("t"))
        .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

    var result = await _controller.GetSharedJournalsAsync("t") as OkObjectResult;
    var journals = (result!.Value as IEnumerable<SharedJournalDto>)!.ToList();

    Assert.Single(journals);
    Assert.Equal("Public", journals[0].Content);
}
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
dotnet test --filter "GetSharedJournals" -v minimal
```
Expected: FAIL — method does not exist.

- [ ] **Step 3: Add `GetSharedJournalsAsync` to `ShareController.cs`**

Add this method after the existing `PostToBoardAsync` method:

```csharp
// GET /share/{token}/journals
[HttpGet("{token}/journals")]
public async Task<IActionResult> GetSharedJournalsAsync(string token)
{
    // 1. Ghost Mode first — GET share endpoints return 200 [] when frozen
    if (await ghostMode.IsFrozenAsync())
        return Ok(Array.Empty<object>());

    // 2. Token validation
    var result = await tokenService.ResolveTokenAsync(token);
    if (result.Status == TokenResolveStatus.Expired)
        return Unauthorized(new { error = "Token has expired." });
    if (result.Status != TokenResolveStatus.Valid)
        return Unauthorized(new { error = "Token is invalid." });

    // 3. ReadFrontOnly tokens cannot access journals
    if (result.Token!.Permission == TokenPermission.ReadFrontOnly)
        return StatusCode(403, new { error = "Not permitted." });

    // 4. Return non-private entries
    var entries = await context.JournalEntries
        .Where(j => !j.IsPrivate)
        .OrderByDescending(j => j.CreatedAt)
        .Select(j => new SharedJournalDto(j.Id, j.Title, j.Content, j.CreatedAt))
        .ToListAsync();

    return Ok(entries);
}
```

- [ ] **Step 4: Run the new tests**

```bash
dotnet test --filter "GetSharedJournals" -v minimal
```
Expected: all 4 PASS.

- [ ] **Step 5: Run full suite**

```bash
dotnet test -v minimal
```
Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/ShareController.cs \
        tests/PluralHost.Tests/Controllers/ShareControllerTests.cs
git commit -m "feat: add GET /share/{token}/journals endpoint"
```

---

## Final Verification

- [ ] **Run the full test suite one last time**

```bash
dotnet test -v minimal
```
Expected: all tests passing. Count should be significantly higher than the starting 186.

- [ ] **Build in Release mode**

```bash
dotnet build --configuration Release
```
Expected: Build succeeded, 0 errors, 0 warnings.

- [ ] **Verify Docker still builds**

```bash
docker compose build
```
Expected: Image builds clean.
