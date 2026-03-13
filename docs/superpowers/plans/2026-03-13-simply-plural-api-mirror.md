# Simply Plural API Mirror Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose SP v1-compatible routes so existing MCP tools that speak Simply Plural's API work against this self-hosted server without reconfiguration.

**Architecture:** New controllers under the `/v1/` prefix return SP's response envelope (`{ exists, id, content }`). All field names match SP's schema. Ghost Mode, soft-delete, and Gatekeeper PIN enforcement are inherited from the existing domain layer. Auth uses JWT Bearer (deviation from SP's raw token — documented below). The Group-Member relationship is upgraded from one-to-many to many-to-many to match SP's model.

**Tech Stack:** .NET 8 / ASP.NET Core, EF Core 8, xUnit + Moq, existing `PluralHostContext`

**Auth deviation from SP:** SP sends a raw API token in `Authorization: <token>`. This mirror uses `Authorization: Bearer <jwt>`. Configure MCP tools accordingly.

**Single-tenant simplification:** SP routes include a `:system` UID parameter (e.g. `/v1/members/:system`). Since this app is single-owner, all `:system` parameters are accepted but ignored.

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/PluralHost.Api/Dto/SpDtos.cs` | All SP request/response records + `SpEnvelope<T>` helper |
| `src/PluralHost.Api/Controllers/SpMembersController.cs` | `/v1/member/:id`, `/v1/members/:system` CRUD |
| `src/PluralHost.Api/Controllers/SpFrontController.cs` | `/v1/fronters`, `/v1/frontHistory/*` CRUD |
| `src/PluralHost.Api/Controllers/SpGroupsController.cs` | `/v1/group/:id`, `/v1/groups/:system` CRUD |
| `src/PluralHost.Api/Controllers/SpSystemController.cs` | `GET /v1/me` |
| `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs` | Members endpoint tests |
| `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs` | Front endpoint tests |
| `tests/PluralHost.Tests/Controllers/SpGroupsControllerTests.cs` | Groups endpoint tests |

### Modified files
| File | Change |
|------|--------|
| `src/PluralHost.Api/Domain/Member.cs` | Add `Groups` navigation (many-to-many) |
| `src/PluralHost.Api/Domain/Group.cs` | Add `emoji` field, keep `Members` nav |
| `src/PluralHost.Api/Data/PluralHostContext.cs` | Configure many-to-many `MemberGroups` join table, remove shadow GroupId FK |
| `src/PluralHost.Api/Data/Migrations/` | New: `MigrateGroupMembersToJoinTable` |

---

## SP Response Shapes (reference)

### Envelope
```json
{ "exists": true, "id": "guid-string", "content": { ... } }
```
Collections return a bare JSON array of envelope objects.

### Member content
```json
{
  "uid": "owner",
  "name": "Ada",
  "desc": "bio text",
  "pronouns": "they/them",
  "color": "#abc123",
  "avatarUrl": null,
  "private": false,
  "archived": false
}
```

### FrontHistory content
```json
{
  "uid": "owner",
  "member": "guid",
  "live": true,
  "startTime": 1710000000000,
  "endTime": null,
  "custom": false,
  "customStatus": null
}
```

### Group content
```json
{
  "uid": "owner",
  "name": "Protectors",
  "desc": "description",
  "color": "#abc123",
  "emoji": "🛡️",
  "parent": "",
  "private": false,
  "members": ["guid1", "guid2"]
}
```

### System/Me content
```json
{
  "uid": "owner",
  "username": "owner",
  "desc": "",
  "isAsystem": true,
  "color": "",
  "avatarUrl": null
}
```

---

## Chunk 1: Domain Changes + DTOs

### Task 1: Upgrade Group-Member to Many-to-Many

**Background:** The current schema stores `GroupId` as a shadow FK on the `Members` table (one group per member). SP supports members in multiple groups. Upgrade to a join table now before building the API on top.

**Files:**
- Modify: `src/PluralHost.Api/Domain/Member.cs`
- Modify: `src/PluralHost.Api/Domain/Group.cs`
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs`
- Create: Migration `MigrateGroupMembersToJoinTable`

- [ ] **Step 1: Add `Groups` nav to `Member` and `Emoji` field to `Group`**

`src/PluralHost.Api/Domain/Member.cs`:
```csharp
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
    public List<Guid> ParentIds { get; set; } = [];

    // Many-to-many: a member can belong to multiple groups
    public List<Group> Groups { get; set; } = [];
}
```

`src/PluralHost.Api/Domain/Group.cs`:
```csharp
namespace PluralHost.Api.Domain;

public class Group : BaseEntity
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Color { get; set; }
    public string? Emoji { get; set; }
    public bool IsPrivate { get; set; } = false;
    public List<Member> Members { get; set; } = [];
}
```

- [ ] **Step 2: Configure many-to-many in `PluralHostContext.cs`**

Replace the `Group` query filter block in `OnModelCreating` and add the join table config. Add this after the existing Member ParentIds config:

```csharp
// ── Group ↔ Member: many-to-many via MemberGroups join table ──────
modelBuilder.Entity<Group>()
    .HasMany(g => g.Members)
    .WithMany(m => m.Groups)
    .UsingEntity(j => j.ToTable("MemberGroups"));
```

The existing `Group` query filter stays as-is (already combined ghost+softdelete).

- [ ] **Step 3: Run migration**

```bash
cd C:/dev/simply-personal
dotnet ef migrations add MigrateGroupMembersToJoinTable \
  --project src/PluralHost.Api --output-dir Data/Migrations
```

Expected: new migration file created. Check it — it should drop `Members.GroupId` and create `MemberGroups` table.

- [ ] **Step 4: Verify build passes**

```bash
dotnet build
```

Expected: 0 errors (1 CS9113 warning from AuthService is pre-existing and expected).

- [ ] **Step 5: Run existing tests to confirm nothing broken**

```bash
dotnet test -v minimal
```

Expected: 65 pass, 3 fail (the JWT TODO tests — pre-existing, expected).

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Domain/Member.cs \
        src/PluralHost.Api/Domain/Group.cs \
        src/PluralHost.Api/Data/PluralHostContext.cs \
        src/PluralHost.Api/Data/Migrations/
git commit -m "feat: upgrade Group-Member to many-to-many join table"
```

---

### Task 2: SP DTOs

All request and response types live in one file. This keeps the SP shape isolated from the domain models.

**Files:**
- Create: `src/PluralHost.Api/Dto/SpDtos.cs`

- [ ] **Step 1: Create the DTO file**

```csharp
// src/PluralHost.Api/Dto/SpDtos.cs
namespace PluralHost.Api.Dto;

// ── Envelope ─────────────────────────────────────────────────────────
public record SpEnvelope<T>(bool Exists, string Id, T Content)
{
    public static SpEnvelope<T> Of(string id, T content) => new(true, id, content);
    public static SpEnvelope<T> NotFound() => new(false, "", default!);
}

// Epoch-ms helper
public static class Epoch
{
    public static long ToMs(DateTime dt) =>
        new DateTimeOffset(dt, TimeSpan.Zero).ToUnixTimeMilliseconds();

    public static DateTime FromMs(long ms) =>
        DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;
}

// ── Member ────────────────────────────────────────────────────────────
public record SpMemberContent(
    string Uid,
    string Name,
    string? Desc,
    string? Pronouns,
    string? Color,
    string? AvatarUrl,
    bool Private,
    bool Archived          // maps to Member.Status == Gone || Dormant
);

public record SpMemberCreateRequest(
    string Name,
    string? Desc = null,
    string? Pronouns = null,
    string? Color = null,
    bool Private = false
);

public record SpMemberUpdateRequest(
    string? Name = null,
    string? Desc = null,
    string? Pronouns = null,
    string? Color = null,
    bool? Private = null,
    bool? Archived = null
);

// ── Front History ─────────────────────────────────────────────────────
public record SpFrontContent(
    string Uid,
    string Member,         // member ID
    bool Live,
    long StartTime,        // epoch ms
    long? EndTime,         // epoch ms, null if live
    bool Custom,
    string? CustomStatus
);

public record SpFrontCreateRequest(
    string Member,
    bool Live,
    long StartTime,
    long? EndTime = null,
    bool Custom = false,
    string? CustomStatus = null
);

public record SpFrontUpdateRequest(
    bool? Live = null,
    long? EndTime = null,
    string? CustomStatus = null
);

// ── Group ─────────────────────────────────────────────────────────────
public record SpGroupContent(
    string Uid,
    string Name,
    string? Desc,
    string? Color,
    string? Emoji,
    string Parent,
    bool Private,
    IReadOnlyList<string> Members
);

public record SpGroupCreateRequest(
    string Name,
    string? Desc = null,
    string? Color = null,
    string? Emoji = null,
    string Parent = "",
    bool Private = false,
    List<string>? Members = null
);

public record SpGroupUpdateRequest(
    string? Name = null,
    string? Desc = null,
    string? Color = null,
    string? Emoji = null,
    string? Parent = null,
    bool? Private = null,
    List<string>? Members = null
);

// PATCH /v1/group/members body
public record SpSetGroupMembershipsRequest(
    string Member,
    List<string> Groups
);

// ── System ────────────────────────────────────────────────────────────
public record SpSystemContent(
    string Uid,
    string Username,
    string Desc,
    bool IsAsystem,
    string Color,
    string? AvatarUrl
);
```

- [ ] **Step 2: Build to confirm DTO file compiles**

```bash
dotnet build src/PluralHost.Api
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Api/Dto/SpDtos.cs
git commit -m "feat: add Simply Plural response DTOs"
```

---

## Chunk 2: Members Endpoints

### Task 3: SpMembersController — Tests First

**Files:**
- Create: `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs`
- Create: `src/PluralHost.Api/Controllers/SpMembersController.cs` (stub, to make tests compile)

- [ ] **Step 1: Create a stub controller so tests compile**

```csharp
// src/PluralHost.Api/Controllers/SpMembersController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Dto;
using PluralHost.Api.Domain;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpMembersController(PluralHostContext context) : ControllerBase
{
    [HttpGet("v1/members/{system}")]
    public Task<IActionResult> ListAsync(string system) => throw new NotImplementedException();

    [HttpGet("v1/member/{system}/{id}")]
    public Task<IActionResult> GetAsync(string system, string id) => throw new NotImplementedException();

    [HttpPost("v1/member")]
    public Task<IActionResult> CreateAsync([FromBody] SpMemberCreateRequest body) => throw new NotImplementedException();

    [HttpPatch("v1/member/{id}")]
    public Task<IActionResult> UpdateAsync(string id, [FromBody] SpMemberUpdateRequest body) => throw new NotImplementedException();

    [HttpDelete("v1/member/{id}")]
    public Task<IActionResult> DeleteAsync(string id) => throw new NotImplementedException();
}
```

- [ ] **Step 2: Write the tests**

```csharp
// tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class SpMembersControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly SpMembersController _controller;

    public SpMembersControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new SpMembersController(_context);
    }

    [Fact]
    public async Task List_NoMembers_ReturnsEmptyArray()
    {
        var result = await _controller.ListAsync("owner") as OkObjectResult;
        Assert.NotNull(result);
        var list = Assert.IsAssignableFrom<IEnumerable<object>>(result.Value);
        Assert.Empty(list);
    }

    [Fact]
    public async Task List_WithMembers_ReturnsEnvelopes()
    {
        _context.Members.Add(new Member { Name = "Ada" });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync("owner") as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Single(items);
    }

    [Fact]
    public async Task Get_ExistingMember_ReturnsEnvelope()
    {
        var m = new Member { Name = "Ada" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync("owner", m.Id.ToString()) as OkObjectResult;
        Assert.NotNull(result);
        var env = Assert.IsType<SpEnvelope<SpMemberContent>>(result.Value);
        Assert.True(env.Exists);
        Assert.Equal("Ada", env.Content.Name);
    }

    [Fact]
    public async Task Get_NonexistentMember_Returns404()
    {
        var result = await _controller.GetAsync("owner", Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsMemberId()
    {
        var result = await _controller.CreateAsync(new SpMemberCreateRequest("Bex")) as OkObjectResult;
        Assert.NotNull(result);
        // SP returns the raw ID string
        var id = Assert.IsType<string>(result.Value);
        Assert.False(string.IsNullOrEmpty(id));
        Assert.Equal(1, await _context.Members.CountAsync());
    }

    [Fact]
    public async Task Create_EmptyName_Returns400()
    {
        var result = await _controller.CreateAsync(new SpMemberCreateRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_ExistingMember_UpdatesFields()
    {
        var m = new Member { Name = "Old", Description = "old desc" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(m.Id.ToString(),
            new SpMemberUpdateRequest(Desc: "new desc"));
        Assert.IsType<OkResult>(result);

        var updated = await _context.Members.FindAsync(m.Id);
        Assert.Equal("new desc", updated!.Description);
    }

    [Fact]
    public async Task Update_NonexistentMember_Returns404()
    {
        var result = await _controller.UpdateAsync(Guid.NewGuid().ToString(),
            new SpMemberUpdateRequest(Name: "X"));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_ExistingMember_SoftDeletes()
    {
        var m = new Member { Name = "Ada" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(m.Id.ToString());
        Assert.IsType<OkResult>(result);

        // Soft delete — row still exists with DeletedAt set
        var raw = await _context.Members.IgnoreQueryFilters()
            .FirstAsync(x => x.Id == m.Id);
        Assert.NotNull(raw.DeletedAt);
    }

    [Fact]
    public async Task Delete_NonexistentMember_Returns404()
    {
        var result = await _controller.DeleteAsync(Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 3: Run tests — confirm they fail (not just "not implemented")**

```bash
dotnet test --filter "SpMembersControllerTests" -v minimal
```

Expected: All 10 fail with `NotImplementedException`.

---

### Task 4: Implement SpMembersController

- [ ] **Step 1: Replace stub with full implementation**

```csharp
// src/PluralHost.Api/Controllers/SpMembersController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpMembersController(PluralHostContext context) : ControllerBase
{
    private static SpEnvelope<SpMemberContent> ToEnvelope(Member m) =>
        SpEnvelope<SpMemberContent>.Of(
            m.Id.ToString(),
            new SpMemberContent(
                Uid: "owner",
                Name: m.Name,
                Desc: m.Description,
                Pronouns: m.Pronouns,
                Color: m.Color,
                AvatarUrl: null,      // avatars served via /api/media/ — no direct URL
                Private: m.IsPrivate,
                Archived: m.Status is MemberStatus.Dormant or MemberStatus.Gone
            ));

    // GET /v1/members/:system — list all (Ghost Mode + soft-delete via global filter)
    [HttpGet("v1/members/{system}")]
    public async Task<IActionResult> ListAsync(string system)
    {
        var members = await context.Members.ToListAsync();
        return Ok(members.Select(ToEnvelope));
    }

    // GET /v1/member/:system/:id
    [HttpGet("v1/member/{system}/{id}")]
    public async Task<IActionResult> GetAsync(string system, string id)
    {
        if (!Guid.TryParse(id, out var guid))
            return NotFound();

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == guid);
        return member is null ? NotFound() : Ok(ToEnvelope(member));
    }

    // POST /v1/member — returns raw ID string (SP convention)
    [HttpPost("v1/member")]
    public async Task<IActionResult> CreateAsync([FromBody] SpMemberCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "name is required" });

        var member = new Member
        {
            Name = body.Name,
            Description = body.Desc,
            Pronouns = body.Pronouns,
            Color = body.Color,
            IsPrivate = body.Private
        };
        context.Members.Add(member);
        await context.SaveChangesAsync();
        return Ok(member.Id.ToString());
    }

    // PATCH /v1/member/:id — partial update
    [HttpPatch("v1/member/{id}")]
    public async Task<IActionResult> UpdateAsync(string id, [FromBody] SpMemberUpdateRequest body)
    {
        if (!Guid.TryParse(id, out var guid))
            return NotFound();

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == guid);
        if (member is null) return NotFound();

        if (body.Name is not null) member.Name = body.Name;
        if (body.Desc is not null) member.Description = body.Desc;
        if (body.Pronouns is not null) member.Pronouns = body.Pronouns;
        if (body.Color is not null) member.Color = body.Color;
        if (body.Private is not null) member.IsPrivate = body.Private.Value;
        if (body.Archived is true) member.Status = MemberStatus.Dormant;
        if (body.Archived is false && member.Status == MemberStatus.Dormant)
            member.Status = MemberStatus.Active;

        await context.SaveChangesAsync();
        return Ok();
    }

    // DELETE /v1/member/:id — soft-delete
    [HttpDelete("v1/member/{id}")]
    public async Task<IActionResult> DeleteAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid))
            return NotFound();

        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == guid);
        if (member is null) return NotFound();

        member.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 2: Run tests — all 10 should pass**

```bash
dotnet test --filter "SpMembersControllerTests" -v minimal
```

Expected: 10/10 pass.

- [ ] **Step 3: Run full test suite**

```bash
dotnet test -v minimal
```

Expected: 75 pass, 3 fail (JWT TODO tests — pre-existing).

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Api/Controllers/SpMembersController.cs \
        tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs
git commit -m "feat: add SP-compatible members endpoints (GET/POST/PATCH/DELETE)"
```

---

## Chunk 3: Front History Endpoints

### Task 5: SpFrontController — Tests First

**Files:**
- Create: `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs`
- Create: `src/PluralHost.Api/Controllers/SpFrontController.cs` (stub)

- [ ] **Step 1: Create stub controller**

```csharp
// src/PluralHost.Api/Controllers/SpFrontController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PluralHost.Api.Data;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpFrontController(PluralHostContext context) : ControllerBase
{
    [HttpGet("v1/fronters")]
    public Task<IActionResult> GetCurrentFrontersAsync() => throw new NotImplementedException();

    [HttpGet("v1/frontHistory")]
    public Task<IActionResult> GetHistoryAsync() => throw new NotImplementedException();

    [HttpGet("v1/frontHistory/{id}")]
    public Task<IActionResult> GetEntryAsync(string id) => throw new NotImplementedException();

    [HttpPost("v1/frontHistory")]
    public Task<IActionResult> CreateAsync([FromBody] SpFrontCreateRequest body) => throw new NotImplementedException();

    [HttpPatch("v1/frontHistory/{id}")]
    public Task<IActionResult> UpdateAsync(string id, [FromBody] SpFrontUpdateRequest body) => throw new NotImplementedException();

    [HttpDelete("v1/frontHistory/{id}")]
    public Task<IActionResult> DeleteEntryAsync(string id) => throw new NotImplementedException();
}
```

- [ ] **Step 2: Write the tests**

```csharp
// tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class SpFrontControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly SpFrontController _controller;

    public SpFrontControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new SpFrontController(_context);
    }

    private async Task<Member> AddMemberAsync(string name = "Ada")
    {
        var m = new Member { Name = name };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();
        return m;
    }

    [Fact]
    public async Task GetCurrentFronters_NoActiveFront_ReturnsEmpty()
    {
        var result = await _controller.GetCurrentFrontersAsync() as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Empty(items);
    }

    [Fact]
    public async Task GetCurrentFronters_ActiveEntry_ReturnsLiveEntry()
    {
        var m = await AddMemberAsync();
        _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id });
        await _context.SaveChangesAsync();

        var result = await _controller.GetCurrentFrontersAsync() as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Single(items);
    }

    [Fact]
    public async Task GetHistory_ReturnAllEntries()
    {
        var m = await AddMemberAsync();
        _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id, FrontEnd = DateTime.UtcNow });
        _context.FrontHistory.Add(new FrontHistory { MemberId = m.Id });
        await _context.SaveChangesAsync();

        var result = await _controller.GetHistoryAsync() as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Equal(2, items.Count());
    }

    [Fact]
    public async Task GetEntry_Existing_ReturnsEnvelope()
    {
        var m = await AddMemberAsync();
        var fh = new FrontHistory { MemberId = m.Id };
        _context.FrontHistory.Add(fh);
        await _context.SaveChangesAsync();

        var result = await _controller.GetEntryAsync(fh.Id.ToString()) as OkObjectResult;
        Assert.NotNull(result);
        var env = Assert.IsType<SpEnvelope<SpFrontContent>>(result.Value);
        Assert.True(env.Exists);
        Assert.True(env.Content.Live);
    }

    [Fact]
    public async Task GetEntry_Nonexistent_Returns404()
    {
        var result = await _controller.GetEntryAsync(Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_LiveEntry_PersistsWithNullFrontEnd()
    {
        var m = await AddMemberAsync();
        var startMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        var result = await _controller.CreateAsync(new SpFrontCreateRequest(
            Member: m.Id.ToString(), Live: true, StartTime: startMs)) as OkObjectResult;

        Assert.NotNull(result);
        var id = Assert.IsType<string>(result.Value);
        var entry = await _context.FrontHistory.FindAsync(Guid.Parse(id));
        Assert.NotNull(entry);
        Assert.Null(entry.FrontEnd);
    }

    [Fact]
    public async Task Create_InvalidMemberId_Returns400()
    {
        var result = await _controller.CreateAsync(new SpFrontCreateRequest(
            Member: Guid.NewGuid().ToString(), Live: true,
            StartTime: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_SetLiveFalse_SetsFrontEnd()
    {
        var m = await AddMemberAsync();
        var fh = new FrontHistory { MemberId = m.Id };
        _context.FrontHistory.Add(fh);
        await _context.SaveChangesAsync();

        var endMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var result = await _controller.UpdateAsync(fh.Id.ToString(),
            new SpFrontUpdateRequest(Live: false, EndTime: endMs));

        Assert.IsType<OkResult>(result);
        var updated = await _context.FrontHistory.FindAsync(fh.Id);
        Assert.NotNull(updated!.FrontEnd);
    }

    [Fact]
    public async Task Delete_ExistingEntry_SoftDeletes()
    {
        var m = await AddMemberAsync();
        var fh = new FrontHistory { MemberId = m.Id };
        _context.FrontHistory.Add(fh);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteEntryAsync(fh.Id.ToString());
        Assert.IsType<OkResult>(result);

        var raw = await _context.FrontHistory.IgnoreQueryFilters()
            .FirstAsync(x => x.Id == fh.Id);
        Assert.NotNull(raw.DeletedAt);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
dotnet test --filter "SpFrontControllerTests" -v minimal
```

Expected: 9 fail with `NotImplementedException`.

---

### Task 6: Implement SpFrontController

- [ ] **Step 1: Replace stub with full implementation**

```csharp
// src/PluralHost.Api/Controllers/SpFrontController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpFrontController(PluralHostContext context) : ControllerBase
{
    private static SpEnvelope<SpFrontContent> ToEnvelope(FrontHistory fh) =>
        SpEnvelope<SpFrontContent>.Of(
            fh.Id.ToString(),
            new SpFrontContent(
                Uid: "owner",
                Member: fh.MemberId.ToString(),
                Live: fh.FrontEnd == null,
                StartTime: Epoch.ToMs(fh.FrontStart),
                EndTime: fh.FrontEnd.HasValue ? Epoch.ToMs(fh.FrontEnd.Value) : null,
                Custom: false,
                CustomStatus: fh.Note
            ));

    // GET /v1/fronters — currently fronting (live entries)
    [HttpGet("v1/fronters")]
    public async Task<IActionResult> GetCurrentFrontersAsync()
    {
        var fronters = await context.FrontHistory
            .Where(f => f.FrontEnd == null)
            .ToListAsync();
        return Ok(fronters.Select(ToEnvelope));
    }

    // GET /v1/frontHistory — all entries
    [HttpGet("v1/frontHistory")]
    public async Task<IActionResult> GetHistoryAsync()
    {
        var history = await context.FrontHistory.ToListAsync();
        return Ok(history.Select(ToEnvelope));
    }

    // GET /v1/frontHistory/:id — single entry
    [HttpGet("v1/frontHistory/{id}")]
    public async Task<IActionResult> GetEntryAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var entry = await context.FrontHistory.FirstOrDefaultAsync(f => f.Id == guid);
        return entry is null ? NotFound() : Ok(ToEnvelope(entry));
    }

    // POST /v1/frontHistory — start fronting or log historical entry
    [HttpPost("v1/frontHistory")]
    public async Task<IActionResult> CreateAsync([FromBody] SpFrontCreateRequest body)
    {
        if (!Guid.TryParse(body.Member, out var memberId))
            return BadRequest(new { error = "Invalid member ID." });

        var memberExists = await context.Members.AnyAsync(m => m.Id == memberId);
        if (!memberExists)
            return BadRequest(new { error = "Member not found." });

        var entry = new FrontHistory
        {
            MemberId = memberId,
            FrontStart = Epoch.FromMs(body.StartTime),
            FrontEnd = body.EndTime.HasValue ? Epoch.FromMs(body.EndTime.Value) : null,
            Note = body.CustomStatus
        };
        context.FrontHistory.Add(entry);
        await context.SaveChangesAsync();
        return Ok(entry.Id.ToString());
    }

    // PATCH /v1/frontHistory/:id — update entry (end fronting = set live:false + endTime)
    [HttpPatch("v1/frontHistory/{id}")]
    public async Task<IActionResult> UpdateAsync(string id, [FromBody] SpFrontUpdateRequest body)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var entry = await context.FrontHistory.FirstOrDefaultAsync(f => f.Id == guid);
        if (entry is null) return NotFound();

        if (body.Live is false && body.EndTime.HasValue)
            entry.FrontEnd = Epoch.FromMs(body.EndTime.Value);
        if (body.CustomStatus is not null) entry.Note = body.CustomStatus;

        await context.SaveChangesAsync();
        return Ok();
    }

    // DELETE /v1/frontHistory/:id — soft-delete
    [HttpDelete("v1/frontHistory/{id}")]
    public async Task<IActionResult> DeleteEntryAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var entry = await context.FrontHistory.FirstOrDefaultAsync(f => f.Id == guid);
        if (entry is null) return NotFound();

        entry.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 2: Run tests**

```bash
dotnet test --filter "SpFrontControllerTests" -v minimal
```

Expected: 9/9 pass.

- [ ] **Step 3: Run full suite**

```bash
dotnet test -v minimal
```

Expected: 84 pass, 3 fail (JWT TODO).

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Api/Controllers/SpFrontController.cs \
        tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs
git commit -m "feat: add SP-compatible front history endpoints"
```

---

## Chunk 4: Groups + System Endpoints

### Task 7: SpGroupsController — Tests First

**Files:**
- Create: `tests/PluralHost.Tests/Controllers/SpGroupsControllerTests.cs`
- Create: `src/PluralHost.Api/Controllers/SpGroupsController.cs` (stub)

- [ ] **Step 1: Create stub controller**

```csharp
// src/PluralHost.Api/Controllers/SpGroupsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PluralHost.Api.Data;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpGroupsController(PluralHostContext context) : ControllerBase
{
    [HttpGet("v1/groups/{system}")]
    public Task<IActionResult> ListAsync(string system) => throw new NotImplementedException();

    [HttpGet("v1/group/{system}/{id}")]
    public Task<IActionResult> GetAsync(string system, string id) => throw new NotImplementedException();

    [HttpPost("v1/group")]
    public Task<IActionResult> CreateAsync([FromBody] SpGroupCreateRequest body) => throw new NotImplementedException();

    [HttpPatch("v1/group/{id}")]
    public Task<IActionResult> UpdateAsync(string id, [FromBody] SpGroupUpdateRequest body) => throw new NotImplementedException();

    [HttpPatch("v1/group/members")]
    public Task<IActionResult> SetMembershipsAsync([FromBody] SpSetGroupMembershipsRequest body) => throw new NotImplementedException();

    [HttpDelete("v1/group/{id}")]
    public Task<IActionResult> DeleteAsync(string id) => throw new NotImplementedException();
}
```

- [ ] **Step 2: Write the tests**

```csharp
// tests/PluralHost.Tests/Controllers/SpGroupsControllerTests.cs
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class SpGroupsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly SpGroupsController _controller;

    public SpGroupsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new SpGroupsController(_context);
    }

    [Fact]
    public async Task List_NoGroups_ReturnsEmptyArray()
    {
        var result = await _controller.ListAsync("owner") as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Empty(items);
    }

    [Fact]
    public async Task Get_ExistingGroup_ReturnsEnvelopeWithMembers()
    {
        var m = new Member { Name = "Ada" };
        var g = new Group { Name = "Protectors", Members = [m] };
        _context.Members.Add(m);
        _context.Groups.Add(g);
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync("owner", g.Id.ToString()) as OkObjectResult;
        var env = Assert.IsType<SpEnvelope<SpGroupContent>>(result!.Value);
        Assert.True(env.Exists);
        Assert.Single(env.Content.Members);
    }

    [Fact]
    public async Task Get_Nonexistent_Returns404()
    {
        var result = await _controller.GetAsync("owner", Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsGroupId()
    {
        var result = await _controller.CreateAsync(
            new SpGroupCreateRequest("Protectors")) as OkObjectResult;
        var id = Assert.IsType<string>(result!.Value);
        Assert.False(string.IsNullOrEmpty(id));
        Assert.Equal(1, await _context.Groups.CountAsync());
    }

    [Fact]
    public async Task Create_EmptyName_Returns400()
    {
        var result = await _controller.CreateAsync(new SpGroupCreateRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_ExistingGroup_UpdatesFields()
    {
        var g = new Group { Name = "Old" };
        _context.Groups.Add(g);
        await _context.SaveChangesAsync();

        await _controller.UpdateAsync(g.Id.ToString(), new SpGroupUpdateRequest(Name: "New"));
        var updated = await _context.Groups.FindAsync(g.Id);
        Assert.Equal("New", updated!.Name);
    }

    [Fact]
    public async Task SetMemberships_AssignsMemberToGroups()
    {
        var m = new Member { Name = "Ada" };
        var g1 = new Group { Name = "A" };
        var g2 = new Group { Name = "B" };
        _context.Members.Add(m);
        _context.Groups.AddRange(g1, g2);
        await _context.SaveChangesAsync();

        var result = await _controller.SetMembershipsAsync(new SpSetGroupMembershipsRequest(
            Member: m.Id.ToString(),
            Groups: [g1.Id.ToString(), g2.Id.ToString()]));
        Assert.IsType<OkResult>(result);

        var member = await _context.Members.Include(x => x.Groups).FirstAsync(x => x.Id == m.Id);
        Assert.Equal(2, member.Groups.Count);
    }

    [Fact]
    public async Task Delete_ExistingGroup_SoftDeletes()
    {
        var g = new Group { Name = "To Delete" };
        _context.Groups.Add(g);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(g.Id.ToString());
        Assert.IsType<OkResult>(result);

        var raw = await _context.Groups.IgnoreQueryFilters()
            .FirstAsync(x => x.Id == g.Id);
        Assert.NotNull(raw.DeletedAt);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 3: Confirm tests fail**

```bash
dotnet test --filter "SpGroupsControllerTests" -v minimal
```

Expected: 8 fail with `NotImplementedException`.

---

### Task 8: Implement SpGroupsController

- [ ] **Step 1: Replace stub with full implementation**

```csharp
// src/PluralHost.Api/Controllers/SpGroupsController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpGroupsController(PluralHostContext context) : ControllerBase
{
    private static SpEnvelope<SpGroupContent> ToEnvelope(Group g) =>
        SpEnvelope<SpGroupContent>.Of(
            g.Id.ToString(),
            new SpGroupContent(
                Uid: "owner",
                Name: g.Name,
                Desc: g.Description,
                Color: g.Color,
                Emoji: g.Emoji,
                Parent: "",
                Private: g.IsPrivate,
                Members: g.Members.Select(m => m.Id.ToString()).ToList()
            ));

    // GET /v1/groups/:system
    [HttpGet("v1/groups/{system}")]
    public async Task<IActionResult> ListAsync(string system)
    {
        var groups = await context.Groups.Include(g => g.Members).ToListAsync();
        return Ok(groups.Select(ToEnvelope));
    }

    // GET /v1/group/:system/:id
    [HttpGet("v1/group/{system}/{id}")]
    public async Task<IActionResult> GetAsync(string system, string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var group = await context.Groups.Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == guid);
        return group is null ? NotFound() : Ok(ToEnvelope(group));
    }

    // POST /v1/group — returns raw ID
    [HttpPost("v1/group")]
    public async Task<IActionResult> CreateAsync([FromBody] SpGroupCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Name))
            return BadRequest(new { error = "name is required" });

        var group = new Group
        {
            Name = body.Name,
            Description = body.Desc,
            Color = body.Color,
            Emoji = body.Emoji,
            IsPrivate = body.Private
        };

        if (body.Members is { Count: > 0 })
        {
            var memberGuids = body.Members
                .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
                .Where(g => g.HasValue).Select(g => g!.Value).ToList();
            var members = await context.Members
                .Where(m => memberGuids.Contains(m.Id)).ToListAsync();
            group.Members = members;
        }

        context.Groups.Add(group);
        await context.SaveChangesAsync();
        return Ok(group.Id.ToString());
    }

    // PATCH /v1/group/:id
    [HttpPatch("v1/group/{id}")]
    public async Task<IActionResult> UpdateAsync(string id, [FromBody] SpGroupUpdateRequest body)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var group = await context.Groups.Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == guid);
        if (group is null) return NotFound();

        if (body.Name is not null) group.Name = body.Name;
        if (body.Desc is not null) group.Description = body.Desc;
        if (body.Color is not null) group.Color = body.Color;
        if (body.Emoji is not null) group.Emoji = body.Emoji;
        if (body.Private is not null) group.IsPrivate = body.Private.Value;

        if (body.Members is not null)
        {
            var memberGuids = body.Members
                .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
                .Where(g => g.HasValue).Select(g => g!.Value).ToList();
            group.Members = await context.Members
                .Where(m => memberGuids.Contains(m.Id)).ToListAsync();
        }

        await context.SaveChangesAsync();
        return Ok();
    }

    // PATCH /v1/group/members — set all groups a member belongs to
    [HttpPatch("v1/group/members")]
    public async Task<IActionResult> SetMembershipsAsync([FromBody] SpSetGroupMembershipsRequest body)
    {
        if (!Guid.TryParse(body.Member, out var memberId)) return BadRequest();

        var member = await context.Members.Include(m => m.Groups)
            .FirstOrDefaultAsync(m => m.Id == memberId);
        if (member is null) return NotFound();

        var groupGuids = body.Groups
            .Select(s => Guid.TryParse(s, out var g) ? g : (Guid?)null)
            .Where(g => g.HasValue).Select(g => g!.Value).ToList();
        member.Groups = await context.Groups
            .Where(g => groupGuids.Contains(g.Id)).ToListAsync();

        await context.SaveChangesAsync();
        return Ok();
    }

    // DELETE /v1/group/:id — soft-delete
    [HttpDelete("v1/group/{id}")]
    public async Task<IActionResult> DeleteAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return NotFound();
        var group = await context.Groups.FirstOrDefaultAsync(g => g.Id == guid);
        if (group is null) return NotFound();

        group.SoftDelete();
        await context.SaveChangesAsync();
        return Ok();
    }
}
```

- [ ] **Step 2: Run group tests**

```bash
dotnet test --filter "SpGroupsControllerTests" -v minimal
```

Expected: 8/8 pass.

---

### Task 9: SpSystemController (GET /v1/me)

No tests needed — it's a single static response shaped from `SystemSettings`.

**Files:**
- Create: `src/PluralHost.Api/Controllers/SpSystemController.cs`

- [ ] **Step 1: Create controller**

```csharp
// src/PluralHost.Api/Controllers/SpSystemController.cs
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpSystemController(PluralHostContext context) : ControllerBase
{
    // GET /v1/me — returns the single-tenant system document
    [HttpGet("v1/me")]
    public async Task<IActionResult> GetMeAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        var content = new SpSystemContent(
            Uid: "owner",
            Username: "owner",
            Desc: "",
            IsAsystem: true,
            Color: "",
            AvatarUrl: null
        );
        return Ok(SpEnvelope<SpSystemContent>.Of("owner", content));
    }
}
```

- [ ] **Step 2: Run full test suite + build check**

```bash
dotnet test -v minimal
```

Expected: ~92 pass, 3 fail (JWT TODO).

- [ ] **Step 3: Commit everything**

```bash
git add src/PluralHost.Api/Controllers/SpGroupsController.cs \
        src/PluralHost.Api/Controllers/SpSystemController.cs \
        tests/PluralHost.Tests/Controllers/SpGroupsControllerTests.cs
git commit -m "feat: add SP-compatible groups and system endpoints"
```

---

## Verification

```bash
# All tests
dotnet test -v minimal
# Expected: ~92 pass, 3 fail (JWT LoginAsync — pre-existing, implement later)

# Manual smoke test (docker compose up -d first, with JWT_SIGNING_KEY set in .env)
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your-password"}' | jq -r .token)

# List members
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/v1/members/owner

# Create a member
curl -X POST http://localhost:8080/v1/member \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","pronouns":"they/them","color":"#a88bfa"}'

# Get current fronters
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/v1/fronters

# Get system
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/v1/me
```

**Note:** Manual smoke test requires JWT `LoginAsync` to be implemented first (current TODO in `AuthService.cs`).
