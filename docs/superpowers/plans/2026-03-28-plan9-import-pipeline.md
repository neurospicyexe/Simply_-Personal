# Import Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement SP JSON file-upload import + PK live API-pull import, landing member data, avatars, custom fields, and front history into PluralHost with configurable conflict strategies.

**Architecture:** Backend exposes two `POST /api/import/*` endpoints backed by `ImportService` (member upsert, conflict resolution, field/history import) and a SSRF-safe `AvatarDownloadService` (HTTP fetch → `secure_uploads/`). PK live pull uses a named `HttpClient` with the session-only token; the token is never written to the database. Frontend adds a collapsible Import section to SettingsPage with an SP card (paste/upload JSON) and a PK card (token input), both showing a result summary on completion.

**Tech Stack:** .NET 8 / ASP.NET Core / EF Core 8 InMemory (tests) / xUnit + Moq; React 18 + TanStack Query + TypeScript + CSS Modules.

---

## File Map

**Create:**
- `src/PluralHost.Api/Dto/ImportDtos.cs` — all import request/response types
- `src/PluralHost.Api/Services/AvatarDownloadService.cs` — SSRF-safe avatar downloader
- `src/PluralHost.Api/Services/ImportService.cs` — SP + PK import logic
- `src/PluralHost.Api/Controllers/ImportController.cs` — two endpoints
- `tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs`
- `tests/PluralHost.Tests/Services/ImportServiceTests.cs`
- `tests/PluralHost.Tests/Controllers/ImportControllerTests.cs`
- `src/PluralHost.Web/src/api/import.ts`

**Modify:**
- `src/PluralHost.Api/Dto/NativeDtos.cs` — remove stale import stubs (lines ~155–213)
- `src/PluralHost.Api/Program.cs` — register new services
- `src/PluralHost.Web/src/pages/SettingsPage.tsx` — add Import section
- `src/PluralHost.Web/src/pages/SettingsPage.module.css` — import card styles

---

### Task 1: Replace stale import stubs in NativeDtos.cs with ImportDtos.cs

**Files:**
- Create: `src/PluralHost.Api/Dto/ImportDtos.cs`
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`

The existing stubs (lines ~155–213 of NativeDtos.cs) use the old `{ Id, Content: {...} }` envelope format and the old PK design where members were passed directly instead of fetched live. All of them must be removed.

- [ ] **Step 1: Create `src/PluralHost.Api/Dto/ImportDtos.cs`**

```csharp
using System.Text.Json.Serialization;

namespace PluralHost.Api.Dto;

// ── SP export format (flat — no content wrapper) ──────────────────────

public record SpMemberEntry(
    [property: JsonPropertyName("_id")] string Id,
    string? Name,
    string? Desc,
    string? Pronouns,
    string? Color,
    string? AvatarUrl,
    bool? Private,
    bool? Archived,
    string? PkId,
    bool? PreventsFrontNotifs,
    bool? ReceiveMessageBoardNotifs,
    Dictionary<string, string>? Info);

public record SpCustomFieldEntry(
    [property: JsonPropertyName("_id")] string Id,
    string? Name,
    string? Order);

public record SpFrontHistoryEntry(
    [property: JsonPropertyName("_id")] string Id,
    string? Member,
    long StartTime,
    long? EndTime);

public record SpImportRequest(
    string ConflictStrategy,
    bool IncludeCustomFields,
    bool IncludeFrontHistory,
    bool IncludeAvatars,
    IReadOnlyList<SpMemberEntry> Members,
    IReadOnlyList<SpCustomFieldEntry>? CustomFields,
    IReadOnlyList<SpFrontHistoryEntry>? FrontHistory);

// ── PK live pull ──────────────────────────────────────────────────────

public record PkImportRequest(
    string Token,
    string ConflictStrategy,
    bool IncludeFrontHistory,
    bool IncludeAvatars);

// ── PK API response types (deserialized from PluralKit v2) ────────────

public record PkApiMember(
    string Uuid,
    string? Name,
    [property: JsonPropertyName("display_name")] string? DisplayName,
    string? Pronouns,
    string? Color,
    [property: JsonPropertyName("avatar_url")] string? AvatarUrl,
    string? Description,
    string? Birthday,
    PkApiMemberPrivacy? Privacy);

public record PkApiMemberPrivacy(string? Visibility);

public record PkApiSwitch(
    string Id,
    string Timestamp,
    IReadOnlyList<string> Members);

// ── Shared result ─────────────────────────────────────────────────────

public record ImportMemberError(string SourceId, string? Name, string Reason);

public record ImportResult(
    int Created,
    int Updated,
    int Skipped,
    IReadOnlyList<ImportMemberError> Errors,
    int AvatarsDownloaded,
    int AvatarsFailed,
    int FrontHistoryImported);
```

- [ ] **Step 2: Remove stale stubs from NativeDtos.cs**

Open `src/PluralHost.Api/Dto/NativeDtos.cs`. Delete everything from the comment `// SP import` down through the end of the file (the `ImportResult` record). This covers:
- `ImportConflictStrategy` enum
- `SpImportMemberContent`, `SpMemberEntry`, `SpCustomFieldContent`, `SpCustomFieldEntry`, `SpImportRequest`
- `PkMemberPrivacy`, `PkMemberEntry`, `PkImportRequest`
- `ImportMemberError`, `ImportResult`

All of these now live in `ImportDtos.cs`.

- [ ] **Step 3: Build to verify no compile errors**

```bash
cd C:\dev\simply-personal && dotnet build src/PluralHost.Api
```

Expected: `Build succeeded, 0 Error(s)`. If any file references the removed types, add `using PluralHost.Api.Dto;` or fix the reference.

- [ ] **Step 4: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Api/Dto/ImportDtos.cs src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: ImportDtos.cs — flat SP/PK import types, remove stale NativeDtos stubs"
```

---

### Task 2: AvatarDownloadService

**Files:**
- Create: `src/PluralHost.Api/Services/AvatarDownloadService.cs`
- Create: `tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs`:

```csharp
using System.Net;
using Microsoft.AspNetCore.Hosting;
using Moq;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class AvatarDownloadServiceTests
{
    private static AvatarDownloadService Build(HttpMessageHandler handler, string? root = null)
    {
        root ??= Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(Path.Combine(root, "secure_uploads"));
        var client = new HttpClient(handler);
        var env = new Mock<IWebHostEnvironment>();
        env.Setup(e => e.ContentRootPath).Returns(root);
        return new AvatarDownloadService(client, env.Object);
    }

    [Fact]
    public async Task DownloadAsync_PrivateIp_192_168_ReturnsNull()
    {
        var svc = Build(new FakeHandler(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF], "image/jpeg"));
        Assert.Null(await svc.DownloadAsync("http://192.168.1.1/img.jpg"));
    }

    [Fact]
    public async Task DownloadAsync_PrivateIp_10_x_ReturnsNull()
    {
        var svc = Build(new FakeHandler(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF], "image/jpeg"));
        Assert.Null(await svc.DownloadAsync("http://10.0.0.1/img.jpg"));
    }

    [Fact]
    public async Task DownloadAsync_PrivateIp_127_ReturnsNull()
    {
        var svc = Build(new FakeHandler(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF], "image/jpeg"));
        Assert.Null(await svc.DownloadAsync("http://127.0.0.1/img.jpg"));
    }

    [Fact]
    public async Task DownloadAsync_NonHttpScheme_ReturnsNull()
    {
        var svc = Build(new FakeHandler(HttpStatusCode.OK, [], "image/jpeg"));
        Assert.Null(await svc.DownloadAsync("ftp://example.com/img.jpg"));
    }

    [Fact]
    public async Task DownloadAsync_WrongMagicBytes_ReturnsNull()
    {
        // Content-Type says JPEG but bytes are not JPEG
        var svc = Build(new FakeHandler(HttpStatusCode.OK, [0x00, 0x01, 0x02, 0x03], "image/jpeg"));
        Assert.Null(await svc.DownloadAsync("http://cdn.example.com/img.jpg"));
    }

    [Fact]
    public async Task DownloadAsync_OversizedFile_ReturnsNull()
    {
        var bigData = new byte[6 * 1024 * 1024];
        bigData[0] = 0xFF; bigData[1] = 0xD8; bigData[2] = 0xFF;
        var svc = Build(new FakeHandler(HttpStatusCode.OK, bigData, "image/jpeg"));
        Assert.Null(await svc.DownloadAsync("http://cdn.example.com/big.jpg"));
    }

    [Fact]
    public async Task DownloadAsync_ValidJpeg_ReturnsSavedFilename()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var jpeg = new byte[100];
        jpeg[0] = 0xFF; jpeg[1] = 0xD8; jpeg[2] = 0xFF;
        var svc = Build(new FakeHandler(HttpStatusCode.OK, jpeg, "image/jpeg"), root);

        var result = await svc.DownloadAsync("http://cdn.example.com/img.jpg");

        Assert.NotNull(result);
        Assert.EndsWith(".jpg", result);
        Assert.True(File.Exists(Path.Combine(root, "secure_uploads", result)));
        Directory.Delete(root, true);
    }

    [Fact]
    public async Task DownloadAsync_ValidPng_ReturnsSavedFilename()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        var png = new byte[100];
        png[0] = 0x89; png[1] = 0x50; png[2] = 0x4E; png[3] = 0x47;
        var svc = Build(new FakeHandler(HttpStatusCode.OK, png, "image/png"), root);

        var result = await svc.DownloadAsync("http://cdn.example.com/img.png");

        Assert.NotNull(result);
        Assert.EndsWith(".png", result);
        Directory.Delete(root, true);
    }
}

internal sealed class FakeHandler(
    HttpStatusCode status,
    byte[] body,
    string contentType) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
    {
        var response = new HttpResponseMessage(status)
        {
            Content = new ByteArrayContent(body)
        };
        response.Content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        return Task.FromResult(response);
    }
}
```

- [ ] **Step 2: Run tests to confirm build failure**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "AvatarDownloadServiceTests" -v minimal
```

Expected: Build error — `AvatarDownloadService` does not exist.

- [ ] **Step 3: Create `src/PluralHost.Api/Services/AvatarDownloadService.cs`**

```csharp
using Microsoft.AspNetCore.Hosting;

namespace PluralHost.Api.Services;

public interface IAvatarDownloadService
{
    Task<string?> DownloadAsync(string url);
}

public class AvatarDownloadService(HttpClient http, IWebHostEnvironment env) : IAvatarDownloadService
{
    private static readonly HashSet<string> AllowedTypes =
        ["image/jpeg", "image/png", "image/gif", "image/webp"];

    private static readonly Dictionary<string, byte[]> Magic = new()
    {
        ["image/jpeg"] = [0xFF, 0xD8, 0xFF],
        ["image/png"]  = [0x89, 0x50, 0x4E, 0x47],
        ["image/gif"]  = [0x47, 0x49, 0x46],
        ["image/webp"] = [0x52, 0x49, 0x46, 0x46],
    };

    public async Task<string?> DownloadAsync(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != "http" && uri.Scheme != "https") return null;
        if (IsPrivateIp(uri.Host)) return null;

        HttpResponseMessage response;
        try { response = await http.GetAsync(url); }
        catch { return null; }

        if (!response.IsSuccessStatusCode) return null;

        var ct = response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant() ?? "";
        if (!AllowedTypes.Contains(ct)) return null;

        var data = await response.Content.ReadAsByteArrayAsync();
        if (data.Length > 5 * 1024 * 1024) return null;
        if (!HasValidMagic(ct, data)) return null;

        var ext = ct switch
        {
            "image/jpeg" => "jpg",
            "image/png"  => "png",
            "image/gif"  => "gif",
            "image/webp" => "webp",
            _            => "bin"
        };

        var filename = $"{Guid.NewGuid()}.{ext}";
        var dest = Path.Combine(env.ContentRootPath, "secure_uploads", filename);
        await File.WriteAllBytesAsync(dest, data);
        return filename;
    }

    private static bool IsPrivateIp(string host)
    {
        if (!System.Net.IPAddress.TryParse(host, out var ip)) return false;
        var b = ip.GetAddressBytes();
        return b[0] == 127
            || b[0] == 10
            || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
            || (b[0] == 192 && b[1] == 168)
            || (b[0] == 169 && b[1] == 254);
    }

    private static bool HasValidMagic(string contentType, byte[] data)
    {
        if (!Magic.TryGetValue(contentType, out var magic)) return false;
        if (data.Length < magic.Length) return false;
        if (contentType == "image/webp")
        {
            if (data.Length < 12) return false;
            return data[0..4].SequenceEqual([0x52, 0x49, 0x46, 0x46])
                && data[8..12].SequenceEqual([0x57, 0x45, 0x42, 0x50]);
        }
        return data[0..magic.Length].SequenceEqual(magic);
    }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "AvatarDownloadServiceTests" -v minimal
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Api/Services/AvatarDownloadService.cs tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs
git commit -m "feat: AvatarDownloadService — SSRF protection, magic byte validation, 5 MB limit"
```

---

### Task 3: ImportService — SP path (members, custom fields, front history)

**Files:**
- Create: `src/PluralHost.Api/Services/ImportService.cs`
- Create: `tests/PluralHost.Tests/Services/ImportServiceSpTests.cs`

- [ ] **Step 1: Write failing SP tests**

Create `tests/PluralHost.Tests/Services/ImportServiceSpTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class ImportServiceSpTests
{
    private static PluralHostContext BuildDb()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var ctx = new PluralHostContext(opts);
        ctx.SystemSettings.Add(new SystemSettings { Id = 1 });
        ctx.PrivacyBuckets.AddRange(
            new PrivacyBucket { Id = PrivacyBucket.PublicId,  Name = "Public",  SortOrder = 0, IsDefault = true },
            new PrivacyBucket { Id = PrivacyBucket.PrivateId, Name = "Private", SortOrder = 3 });
        ctx.SaveChanges();
        return ctx;
    }

    private static ImportService BuildSvc(PluralHostContext ctx, IAvatarDownloadService? avatar = null)
        => new(ctx, avatar ?? Mock.Of<IAvatarDownloadService>(), Mock.Of<IHttpClientFactory>());

    private static SpMemberEntry Entry(string id, string? name, bool? @private = false) =>
        new(id, name, null, null, null, null, @private, false, null, false, false, null);

    // ── Create new member ─────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_NewMember_IsCreated()
    {
        using var ctx = BuildDb();
        var result = await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, false, false, [Entry("sp1", "Alice")], null, null));

        Assert.Equal(1, result.Created);
        Assert.Equal(0, result.Updated);
        Assert.Equal(0, result.Errors.Count);
        var m = ctx.Members.IgnoreQueryFilters().Single();
        Assert.Equal("Alice", m.Name);
        Assert.Equal("sp1", m.SpMemberId);
    }

    // ── Skip strategy ─────────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_Skip_ExistingMemberUnchanged()
    {
        using var ctx = BuildDb();
        ctx.Members.Add(new Member { Name = "Alice", SpMemberId = "sp1", BucketId = PrivacyBucket.PublicId });
        ctx.SaveChanges();

        var result = await BuildSvc(ctx).ImportSpAsync(
            new("skip", false, false, false, [Entry("sp1", "Alice Updated")], null, null));

        Assert.Equal(0, result.Updated);
        Assert.Equal(1, result.Skipped);
        Assert.Equal("Alice", ctx.Members.IgnoreQueryFilters().Single().Name);
    }

    // ── Overwrite strategy ────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_Overwrite_AllFieldsReplaced()
    {
        using var ctx = BuildDb();
        ctx.Members.Add(new Member { Name = "Alice", Pronouns = "she/her", SpMemberId = "sp1", BucketId = PrivacyBucket.PublicId });
        ctx.SaveChanges();

        var entry = Entry("sp1", "Alice New") with { Pronouns = "they/them" };
        var result = await BuildSvc(ctx).ImportSpAsync(
            new("overwrite", false, false, false, [entry], null, null));

        Assert.Equal(1, result.Updated);
        var m = ctx.Members.IgnoreQueryFilters().Single();
        Assert.Equal("Alice New", m.Name);
        Assert.Equal("they/them", m.Pronouns);
    }

    // ── MergePreferExisting strategy ──────────────────────────────────

    [Fact]
    public async Task ImportSp_MergePreferExisting_OnlyFillsNullFields()
    {
        using var ctx = BuildDb();
        ctx.Members.Add(new Member { Name = "Alice", Pronouns = "she/her", SpMemberId = "sp1", BucketId = PrivacyBucket.PublicId });
        ctx.SaveChanges();

        var entry = Entry("sp1", "Alice New") with { Pronouns = "they/them", Desc = "bio" };
        await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, false, false, [entry], null, null));

        var m = ctx.Members.IgnoreQueryFilters().Single();
        Assert.Equal("Alice", m.Name);        // existing wins
        Assert.Equal("she/her", m.Pronouns);  // existing wins
        Assert.Equal("bio", m.Description);   // was null — filled
    }

    // ── Duplicate strategy ────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_Duplicate_AlwaysCreatesNew()
    {
        using var ctx = BuildDb();
        ctx.Members.Add(new Member { Name = "Alice", SpMemberId = "sp1", BucketId = PrivacyBucket.PublicId });
        ctx.SaveChanges();

        var result = await BuildSvc(ctx).ImportSpAsync(
            new("duplicate", false, false, false, [Entry("sp1", "Alice")], null, null));

        Assert.Equal(1, result.Created);
        Assert.Equal(2, ctx.Members.IgnoreQueryFilters().Count());
    }

    // ── Blank name skipped ────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_BlankName_AddedToErrors()
    {
        using var ctx = BuildDb();
        var result = await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, false, false,
                [Entry("sp1", ""), Entry("sp2", "   ")], null, null));

        Assert.Equal(0, result.Created);
        Assert.Equal(2, result.Errors.Count);
    }

    // ── Privacy mapping ───────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_PrivateTrue_SetsBucketToPrivate()
    {
        using var ctx = BuildDb();
        await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, false, false,
                [Entry("sp1", "Alice", @private: true)], null, null));

        Assert.Equal(PrivacyBucket.PrivateId,
            ctx.Members.IgnoreQueryFilters().Single().BucketId);
    }

    [Fact]
    public async Task ImportSp_PrivateFalse_SetsPublicOnNewMember()
    {
        using var ctx = BuildDb();
        await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, false, false,
                [Entry("sp1", "Alice", @private: false)], null, null));

        Assert.Equal(PrivacyBucket.PublicId,
            ctx.Members.IgnoreQueryFilters().Single().BucketId);
    }

    // ── Custom fields ─────────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_CustomFields_CreatesDefsAndValues()
    {
        using var ctx = BuildDb();
        var fieldEntry  = new SpCustomFieldEntry("field1", "Role", "0|aaa:");
        var memberEntry = Entry("sp1", "Alice") with
        {
            Info = new Dictionary<string, string> { ["field1"] = "Tank" }
        };

        await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", true, false, false,
                [memberEntry], [fieldEntry], null));

        var field = ctx.CustomFields.IgnoreQueryFilters().Single();
        Assert.Equal("Role",   field.Label);
        Assert.Equal("field1", field.SpFieldId);

        var value = ctx.CustomFieldValues.IgnoreQueryFilters().Single();
        Assert.Equal("Tank", value.Value);
    }

    [Fact]
    public async Task ImportSp_CustomFields_RestoressoftDeletedField()
    {
        using var ctx = BuildDb();
        var existing = new CustomField { Label = "Role", SpFieldId = "field1" };
        existing.SoftDelete();
        ctx.CustomFields.Add(existing);
        ctx.SaveChanges();

        await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", true, false, false,
                [Entry("sp1", "Alice") with { Info = new() { ["field1"] = "Leader" } }],
                [new SpCustomFieldEntry("field1", "Role", null)], null));

        var field = ctx.CustomFields.IgnoreQueryFilters().Single();
        Assert.Null(field.DeletedAt); // restored
    }

    // ── Front history ─────────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_FrontHistory_CreatesEntries()
    {
        using var ctx = BuildDb();
        ctx.FrontStatuses.Add(new FrontStatus { Label = "Default", IsDefault = true });
        ctx.SaveChanges();

        var histEntry = new SpFrontHistoryEntry("h1", "sp1", 1710000000000L, 1710003600000L);
        var result = await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, true, false,
                [Entry("sp1", "Alice")], null, [histEntry]));

        Assert.Equal(1, result.FrontHistoryImported);
        var fh = ctx.FrontHistory.IgnoreQueryFilters().Single();
        Assert.Equal(
            DateTimeOffset.FromUnixTimeMilliseconds(1710000000000L).UtcDateTime,
            fh.FrontStart);
        Assert.NotNull(fh.FrontEnd);
    }

    [Fact]
    public async Task ImportSp_FrontHistory_SkipsDuplicates()
    {
        using var ctx = BuildDb();
        var member = new Member { Name = "Alice", SpMemberId = "sp1", BucketId = PrivacyBucket.PublicId };
        ctx.Members.Add(member);
        ctx.FrontStatuses.Add(new FrontStatus { Label = "Default", IsDefault = true });
        ctx.SaveChanges();

        var startMs = 1710000000000L;
        ctx.FrontHistory.Add(new FrontHistory
        {
            MemberId = member.Id,
            FrontStart = DateTimeOffset.FromUnixTimeMilliseconds(startMs).UtcDateTime
        });
        ctx.SaveChanges();

        var result = await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, true, false,
                [Entry("sp1", "Alice")], null,
                [new SpFrontHistoryEntry("h1", "sp1", startMs, null)]));

        Assert.Equal(0, result.FrontHistoryImported);
        Assert.Equal(1, ctx.FrontHistory.IgnoreQueryFilters().Count());
    }

    [Fact]
    public async Task ImportSp_FrontHistory_UnresolvableMember_AddedToErrors()
    {
        using var ctx = BuildDb();
        ctx.FrontStatuses.Add(new FrontStatus { Label = "Default", IsDefault = true });
        ctx.SaveChanges();

        // No member with SpMemberId "unknown"
        var result = await BuildSvc(ctx).ImportSpAsync(
            new("merge_prefer_existing", false, true, false, [], null,
                [new SpFrontHistoryEntry("h1", "unknown", 1710000000000L, null)]));

        Assert.Equal(1, result.Errors.Count);
        Assert.Equal(0, result.FrontHistoryImported);
    }

    // ── Avatar download ───────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_AvatarDownloaded_SetsAvatarPath()
    {
        using var ctx = BuildDb();
        var avatarSvc = new Mock<IAvatarDownloadService>();
        avatarSvc.Setup(a => a.DownloadAsync("https://cdn.example.com/img.jpg"))
                 .ReturnsAsync("abc123.jpg");

        var entry = Entry("sp1", "Alice") with { AvatarUrl = "https://cdn.example.com/img.jpg" };
        var result = await BuildSvc(ctx, avatarSvc.Object).ImportSpAsync(
            new("merge_prefer_existing", false, false, true, [entry], null, null));

        Assert.Equal(1, result.AvatarsDownloaded);
        Assert.Equal("abc123.jpg", ctx.Members.IgnoreQueryFilters().Single().AvatarPath);
    }

    [Fact]
    public async Task ImportSp_AvatarFails_MemberStillImported()
    {
        using var ctx = BuildDb();
        var avatarSvc = new Mock<IAvatarDownloadService>();
        avatarSvc.Setup(a => a.DownloadAsync(It.IsAny<string>())).ReturnsAsync((string?)null);

        var entry = Entry("sp1", "Alice") with { AvatarUrl = "https://cdn.example.com/img.jpg" };
        var result = await BuildSvc(ctx, avatarSvc.Object).ImportSpAsync(
            new("merge_prefer_existing", false, false, true, [entry], null, null));

        Assert.Equal(1, result.Created);
        Assert.Equal(1, result.AvatarsFailed);
        Assert.Equal(0, result.AvatarsDownloaded);
    }
}
```

- [ ] **Step 2: Run to confirm build failure**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "ImportServiceSpTests" -v minimal
```

Expected: Build error — `ImportService` not found.

- [ ] **Step 3: Create `src/PluralHost.Api/Services/ImportService.cs`**

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Services;

public interface IImportService
{
    Task<ImportResult> ImportSpAsync(SpImportRequest request, CancellationToken ct = default);
    Task<ImportResult> ImportPkAsync(PkImportRequest request, CancellationToken ct = default);
}

public class ImportService(
    PluralHostContext db,
    IAvatarDownloadService avatarSvc,
    IHttpClientFactory httpFactory) : IImportService
{
    // ── SP ────────────────────────────────────────────────────────────

    public async Task<ImportResult> ImportSpAsync(SpImportRequest req, CancellationToken ct = default)
    {
        var errors = new List<ImportMemberError>();
        int created = 0, updated = 0, skipped = 0, avatarsOk = 0, avatarsFail = 0;

        // ── Members ───────────────────────────────────────────────────
        var existingBySpId = await db.Members.IgnoreQueryFilters()
            .Where(m => m.SpMemberId != null)
            .ToDictionaryAsync(m => m.SpMemberId!, ct);

        foreach (var entry in req.Members)
        {
            if (string.IsNullOrWhiteSpace(entry.Name))
            {
                errors.Add(new ImportMemberError(entry.Id, entry.Name, "Name is blank"));
                continue;
            }

            Member member;
            var hasMatch = existingBySpId.TryGetValue(entry.Id, out var existing)
                        && req.ConflictStrategy != "duplicate";

            if (hasMatch)
            {
                if (req.ConflictStrategy == "skip") { skipped++; continue; }
                member = existing!;
                ApplySpFields(member, entry, req.ConflictStrategy);
                updated++;
            }
            else
            {
                member = new Member { SpMemberId = req.ConflictStrategy == "duplicate" ? null : entry.Id };
                db.Members.Add(member);
                ApplySpFields(member, entry, "overwrite");
                created++;
            }

            if (!string.IsNullOrWhiteSpace(entry.PkId) && member.PkId == null)
                member.PkId = entry.PkId;

            if (req.IncludeAvatars && !string.IsNullOrWhiteSpace(entry.AvatarUrl))
            {
                var path = await avatarSvc.DownloadAsync(entry.AvatarUrl);
                if (path != null) { member.AvatarPath = path; avatarsOk++; }
                else avatarsFail++;
            }
        }

        await db.SaveChangesAsync(ct);

        // Build SpId → Member.Id map (includes freshly saved IDs)
        var spIdMap = await db.Members.IgnoreQueryFilters()
            .Where(m => m.SpMemberId != null)
            .ToDictionaryAsync(m => m.SpMemberId!, m => m.Id, ct);

        // ── Custom fields ─────────────────────────────────────────────
        if (req.IncludeCustomFields && req.CustomFields is { Count: > 0 })
        {
            var existingFields = await db.CustomFields.IgnoreQueryFilters()
                .Where(f => f.SpFieldId != null)
                .ToDictionaryAsync(f => f.SpFieldId!, ct);

            var fieldIdMap = new Dictionary<string, Guid>();

            foreach (var cf in req.CustomFields)
            {
                if (string.IsNullOrWhiteSpace(cf.Name)) continue;
                if (existingFields.TryGetValue(cf.Id, out var ef))
                {
                    if (ef.DeletedAt != null) ef.Restore();
                    fieldIdMap[cf.Id] = ef.Id;
                }
                else
                {
                    var newField = new CustomField { SpFieldId = cf.Id, Label = cf.Name };
                    db.CustomFields.Add(newField);
                    fieldIdMap[cf.Id] = newField.Id;
                }
            }
            await db.SaveChangesAsync(ct);

            // Refresh IDs for newly inserted fields
            var savedFieldIds = await db.CustomFields.IgnoreQueryFilters()
                .Where(f => f.SpFieldId != null)
                .ToDictionaryAsync(f => f.SpFieldId!, m => m.Id, ct);
            foreach (var kv in savedFieldIds) fieldIdMap[kv.Key] = kv.Value;

            foreach (var entry in req.Members)
            {
                if (entry.Info == null) continue;
                if (!spIdMap.TryGetValue(entry.Id, out var memberId)) continue;

                foreach (var (spFieldId, val) in entry.Info)
                {
                    if (!fieldIdMap.TryGetValue(spFieldId, out var fieldId)) continue;
                    var ev = await db.CustomFieldValues.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(v => v.FieldId == fieldId && v.MemberId == memberId, ct);
                    if (ev != null)
                    {
                        if (ev.DeletedAt != null) ev.Restore();
                        ev.Value = val;
                    }
                    else
                    {
                        db.CustomFieldValues.Add(new CustomFieldValue
                        {
                            FieldId = fieldId, MemberId = memberId,
                            Value = val, BucketId = PrivacyBucket.PrivateId
                        });
                    }
                }
            }
            await db.SaveChangesAsync(ct);
        }

        // ── Front history ─────────────────────────────────────────────
        int histCount = 0;
        if (req.IncludeFrontHistory && req.FrontHistory is { Count: > 0 })
        {
            var defaultStatus = await db.FrontStatuses.FirstOrDefaultAsync(s => s.IsDefault, ct);
            var existingFh = await db.FrontHistory.IgnoreQueryFilters()
                .Select(h => new { h.MemberId, h.FrontStart })
                .ToListAsync(ct);
            var dedup = existingFh.Select(x => (x.MemberId, x.FrontStart)).ToHashSet();

            foreach (var hist in req.FrontHistory)
            {
                if (hist.Member == null || !spIdMap.TryGetValue(hist.Member, out var memberId))
                {
                    errors.Add(new ImportMemberError(hist.Id, null,
                        $"SP member '{hist.Member}' could not be resolved"));
                    continue;
                }

                var start = DateTimeOffset.FromUnixTimeMilliseconds(hist.StartTime).UtcDateTime;
                if (dedup.Contains((memberId, start))) continue;

                db.FrontHistory.Add(new FrontHistory
                {
                    MemberId = memberId,
                    FrontStart = start,
                    FrontEnd = hist.EndTime.HasValue
                        ? DateTimeOffset.FromUnixTimeMilliseconds(hist.EndTime.Value).UtcDateTime
                        : null,
                    CustomStatusId = defaultStatus?.Id
                });
                dedup.Add((memberId, start));
                histCount++;
            }
            await db.SaveChangesAsync(ct);
        }

        return new ImportResult(created, updated, skipped, errors, avatarsOk, avatarsFail, histCount);
    }

    // ── PK — implemented in Task 4 ────────────────────────────────────

    public Task<ImportResult> ImportPkAsync(PkImportRequest req, CancellationToken ct = default)
        => throw new NotImplementedException();

    // ── Field helpers ─────────────────────────────────────────────────

    private static void ApplySpFields(Member m, SpMemberEntry e, string strategy)
    {
        bool prefer = strategy == "merge_prefer_existing";

        if (!prefer || string.IsNullOrEmpty(m.Name))
            m.Name = e.Name ?? m.Name ?? "";
        if (e.Desc != null && (!prefer || string.IsNullOrEmpty(m.Description)))
            m.Description = e.Desc;
        if (e.Pronouns != null && (!prefer || string.IsNullOrEmpty(m.Pronouns)))
            m.Pronouns = e.Pronouns;
        if (e.Color != null && (!prefer || string.IsNullOrEmpty(m.Color)))
            m.Color = e.Color.StartsWith('#') ? e.Color : $"#{e.Color}";
        if (e.Archived.HasValue)
            m.IsArchived = e.Archived.Value;
        if (e.PreventsFrontNotifs.HasValue)
            m.PreventFrontNotification = e.PreventsFrontNotifs.Value;
        if (e.ReceiveMessageBoardNotifs.HasValue)
            m.ReceiveBoardNotifications = e.ReceiveMessageBoardNotifs.Value;

        // Bucket
        if (e.Private == true)
            m.BucketId = PrivacyBucket.PrivateId;
        else if (e.Private == false && (m.BucketId == Guid.Empty || m.BucketId == PrivacyBucket.PrivateId || strategy == "overwrite"))
            m.BucketId = PrivacyBucket.PublicId;
        else if (m.BucketId == Guid.Empty)
            m.BucketId = PrivacyBucket.PublicId;
    }
}
```

- [ ] **Step 4: Run SP tests**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "ImportServiceSpTests" -v minimal
```

Expected: All tests pass (the `NotImplementedException` stub is on the PK path, which no test calls yet).

- [ ] **Step 5: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Api/Services/ImportService.cs tests/PluralHost.Tests/Services/ImportServiceSpTests.cs
git commit -m "feat: ImportService SP path — member upsert, custom fields, front history"
```

---

### Task 4: ImportService — PK path

**Files:**
- Modify: `src/PluralHost.Api/Services/ImportService.cs`
- Create: `tests/PluralHost.Tests/Services/ImportServicePkTests.cs`

- [ ] **Step 1: Write failing PK tests**

Create `tests/PluralHost.Tests/Services/ImportServicePkTests.cs`:

```csharp
using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class ImportServicePkTests
{
    private static PluralHostContext BuildDb()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var ctx = new PluralHostContext(opts);
        ctx.SystemSettings.Add(new SystemSettings { Id = 1 });
        ctx.PrivacyBuckets.AddRange(
            new PrivacyBucket { Id = PrivacyBucket.PublicId,  Name = "Public",  SortOrder = 0 },
            new PrivacyBucket { Id = PrivacyBucket.PrivateId, Name = "Private", SortOrder = 3 });
        ctx.SaveChanges();
        return ctx;
    }

    private static ImportService BuildSvc(PluralHostContext ctx, IReadOnlyList<PkApiMember> members,
        IReadOnlyList<PkApiSwitch>? switches = null)
    {
        var factory = new FakePkHttpClientFactory(members, switches ?? []);
        return new ImportService(ctx, Mock.Of<IAvatarDownloadService>(), factory);
    }

    [Fact]
    public async Task ImportPk_NewMember_IsCreated()
    {
        using var ctx = BuildDb();
        var result = await BuildSvc(ctx, [new("uuid1", "Bob", null, "he/him", null, null, null, null, new("public"))])
            .ImportPkAsync(new("pk-token", "merge_prefer_existing", false, false));

        Assert.Equal(1, result.Created);
        var m = ctx.Members.IgnoreQueryFilters().Single();
        Assert.Equal("Bob",   m.Name);
        Assert.Equal("uuid1", m.PkId);
        Assert.Equal("he/him", m.Pronouns);
        Assert.Equal(PrivacyBucket.PublicId, m.BucketId);
    }

    [Fact]
    public async Task ImportPk_PrivateMember_SetsBucketToPrivate()
    {
        using var ctx = BuildDb();
        await BuildSvc(ctx, [new("uuid1", "Bob", null, null, null, null, null, null, new("private"))])
            .ImportPkAsync(new("pk-token", "merge_prefer_existing", false, false));

        Assert.Equal(PrivacyBucket.PrivateId,
            ctx.Members.IgnoreQueryFilters().Single().BucketId);
    }

    [Fact]
    public async Task ImportPk_TokenNotStoredInDb()
    {
        using var ctx = BuildDb();
        await BuildSvc(ctx, []).ImportPkAsync(new("super-secret-token", "merge_prefer_existing", false, false));

        // Token must not appear in system settings serialization
        var settings = ctx.SystemSettings.Find(1)!;
        Assert.DoesNotContain("super-secret-token",
            JsonSerializer.Serialize(settings));
    }

    [Fact]
    public async Task ImportPk_Switches_CreateFrontHistory()
    {
        using var ctx = BuildDb();
        ctx.FrontStatuses.Add(new FrontStatus { Label = "Default", IsDefault = true });
        ctx.SaveChanges();

        const string t1 = "2024-03-10T12:00:00Z";
        const string t2 = "2024-03-10T13:00:00Z";

        var result = await BuildSvc(ctx,
            [new("uuid1", "Bob", null, null, null, null, null, null, null)],
            [new("sw2", t2, ["uuid1"]), new("sw1", t1, ["uuid1"])])
            .ImportPkAsync(new("pk-token", "merge_prefer_existing", true, false));

        Assert.Equal(2, result.FrontHistoryImported);
        var history = ctx.FrontHistory.IgnoreQueryFilters().OrderBy(h => h.FrontStart).ToList();
        Assert.Equal(DateTime.Parse(t1, null, System.Globalization.DateTimeStyles.RoundtripKind), history[0].FrontStart);
        Assert.Equal(DateTime.Parse(t2, null, System.Globalization.DateTimeStyles.RoundtripKind), history[0].FrontEnd);
        Assert.Equal(DateTime.Parse(t2, null, System.Globalization.DateTimeStyles.RoundtripKind), history[1].FrontStart);
        Assert.Null(history[1].FrontEnd);
    }

    [Fact]
    public async Task ImportPk_MemberPreferExisting_ExistingFieldsNotOverwritten()
    {
        using var ctx = BuildDb();
        ctx.Members.Add(new Member { Name = "Bob", Pronouns = "he/him", PkId = "uuid1", BucketId = PrivacyBucket.PublicId });
        ctx.SaveChanges();

        await BuildSvc(ctx, [new("uuid1", "Bob Updated", null, "they/them", null, null, null, null, null)])
            .ImportPkAsync(new("pk-token", "merge_prefer_existing", false, false));

        var m = ctx.Members.IgnoreQueryFilters().Single();
        Assert.Equal("Bob", m.Name);
        Assert.Equal("he/him", m.Pronouns);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────

internal sealed class FakePkHttpHandler(
    IReadOnlyList<PkApiMember> members,
    IReadOnlyList<PkApiSwitch> switches) : HttpMessageHandler
{
    private static readonly JsonSerializerOptions Opts =
        new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken ct)
    {
        var path = request.RequestUri!.PathAndQuery;
        var json = path.Contains("/members")
            ? JsonSerializer.Serialize(members, Opts)
            : JsonSerializer.Serialize(switches, Opts);

        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
        });
    }
}

internal sealed class FakePkHttpClientFactory(
    IReadOnlyList<PkApiMember> members,
    IReadOnlyList<PkApiSwitch> switches) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) =>
        new(new FakePkHttpHandler(members, switches));
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "ImportServicePkTests" -v minimal
```

Expected: `NotImplementedException` from `ImportPkAsync`.

- [ ] **Step 3: Replace the `ImportPkAsync` stub in ImportService.cs**

Replace `public Task<ImportResult> ImportPkAsync(...)` with:

```csharp
public async Task<ImportResult> ImportPkAsync(PkImportRequest req, CancellationToken ct = default)
{
    var errors = new List<ImportMemberError>();
    int created = 0, updated = 0, skipped = 0, avatarsOk = 0, avatarsFail = 0, histCount = 0;

    var http = httpFactory.CreateClient("PluralKit");
    http.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", req.Token);

    // ── Fetch members ─────────────────────────────────────────────────
    var membersJson = await http.GetStringAsync(
        "https://api.pluralkit.me/v2/systems/@me/members", ct);
    var pkMembers = System.Text.Json.JsonSerializer.Deserialize<List<PkApiMember>>(membersJson,
        new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];

    var existingByPkId = await db.Members.IgnoreQueryFilters()
        .Where(m => m.PkId != null)
        .ToDictionaryAsync(m => m.PkId!, ct);

    var pkIdMap = new Dictionary<string, Guid>();

    foreach (var pk in pkMembers)
    {
        if (string.IsNullOrWhiteSpace(pk.Name))
        {
            errors.Add(new ImportMemberError(pk.Uuid, pk.Name, "Name is blank"));
            continue;
        }

        Member member;
        var hasMatch = existingByPkId.TryGetValue(pk.Uuid, out var existing)
                    && req.ConflictStrategy != "duplicate";

        if (hasMatch)
        {
            if (req.ConflictStrategy == "skip") { skipped++; pkIdMap[pk.Uuid] = existing!.Id; continue; }
            member = existing!;
            ApplyPkFields(member, pk, req.ConflictStrategy);
            updated++;
        }
        else
        {
            member = new Member { PkId = req.ConflictStrategy == "duplicate" ? null : pk.Uuid };
            db.Members.Add(member);
            ApplyPkFields(member, pk, "overwrite");
            created++;
        }

        if (req.IncludeAvatars && !string.IsNullOrWhiteSpace(pk.AvatarUrl))
        {
            var path = await avatarSvc.DownloadAsync(pk.AvatarUrl);
            if (path != null) { member.AvatarPath = path; avatarsOk++; }
            else avatarsFail++;
        }

        pkIdMap[pk.Uuid] = member.Id;
    }

    await db.SaveChangesAsync(ct);

    // Refresh IDs after save
    var savedByPkId = await db.Members.IgnoreQueryFilters()
        .Where(m => m.PkId != null)
        .ToDictionaryAsync(m => m.PkId!, m => m.Id, ct);
    foreach (var kv in savedByPkId) pkIdMap[kv.Key] = kv.Value;

    // ── Switches (paginated) ──────────────────────────────────────────
    if (req.IncludeFrontHistory)
    {
        var allSwitches = new List<PkApiSwitch>();
        string? before = null;
        for (int page = 0; page < 10; page++)
        {
            var url = "https://api.pluralkit.me/v2/systems/@me/switches?limit=100"
                + (before != null ? $"&before={Uri.EscapeDataString(before)}" : "");
            var json = await http.GetStringAsync(url, ct);
            var batch = System.Text.Json.JsonSerializer.Deserialize<List<PkApiSwitch>>(json,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];
            if (batch.Count == 0) break;
            allSwitches.AddRange(batch);
            if (batch.Count < 100) break;
            before = batch[^1].Timestamp;
        }

        // Sort ascending so we can compute EndTime = next switch's StartTime
        allSwitches.Sort((a, b) => string.Compare(a.Timestamp, b.Timestamp, StringComparison.Ordinal));

        var defaultStatus = await db.FrontStatuses.FirstOrDefaultAsync(s => s.IsDefault, ct);
        var existingFh = await db.FrontHistory.IgnoreQueryFilters()
            .Select(h => new { h.MemberId, h.FrontStart })
            .ToListAsync(ct);
        var dedup = existingFh.Select(x => (x.MemberId, x.FrontStart)).ToHashSet();

        for (int i = 0; i < allSwitches.Count; i++)
        {
            var sw = allSwitches[i];
            var start = DateTime.Parse(sw.Timestamp, null,
                System.Globalization.DateTimeStyles.RoundtripKind);
            DateTime? end = i < allSwitches.Count - 1
                ? DateTime.Parse(allSwitches[i + 1].Timestamp, null,
                    System.Globalization.DateTimeStyles.RoundtripKind)
                : null;

            foreach (var uuid in sw.Members)
            {
                if (!pkIdMap.TryGetValue(uuid, out var memberId)) continue;
                if (dedup.Contains((memberId, start))) continue;

                db.FrontHistory.Add(new FrontHistory
                {
                    MemberId = memberId,
                    FrontStart = start,
                    FrontEnd = end,
                    CustomStatusId = defaultStatus?.Id
                });
                dedup.Add((memberId, start));
                histCount++;
            }
        }
        await db.SaveChangesAsync(ct);
    }

    return new ImportResult(created, updated, skipped, errors, avatarsOk, avatarsFail, histCount);
}

private static void ApplyPkFields(Member m, PkApiMember pk, string strategy)
{
    bool prefer = strategy == "merge_prefer_existing";

    if (!prefer || string.IsNullOrEmpty(m.Name))
        m.Name = pk.Name ?? m.Name ?? "";
    if (pk.DisplayName != null && (!prefer || string.IsNullOrEmpty(m.DisplayName)))
        m.DisplayName = pk.DisplayName;
    if (pk.Pronouns != null && (!prefer || string.IsNullOrEmpty(m.Pronouns)))
        m.Pronouns = pk.Pronouns;
    if (pk.Color != null && (!prefer || string.IsNullOrEmpty(m.Color)))
        m.Color = pk.Color.StartsWith('#') ? pk.Color : $"#{pk.Color}";
    if (pk.Description != null && (!prefer || string.IsNullOrEmpty(m.Description)))
        m.Description = pk.Description;
    if (pk.Birthday != null && (!prefer || string.IsNullOrEmpty(m.Birthday)))
        m.Birthday = pk.Birthday;

    if (pk.Privacy?.Visibility == "private")
        m.BucketId = PrivacyBucket.PrivateId;
    else if (m.BucketId == Guid.Empty || (!prefer && pk.Privacy?.Visibility == "public"))
        m.BucketId = PrivacyBucket.PublicId;
}
```

- [ ] **Step 4: Run all import service tests**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "ImportService" -v minimal
```

Expected: All SP + PK tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Api/Services/ImportService.cs tests/PluralHost.Tests/Services/ImportServicePkTests.cs
git commit -m "feat: ImportService PK path — live member fetch, switch pagination, front history"
```

---

### Task 5: ImportController

**Files:**
- Create: `src/PluralHost.Api/Controllers/ImportController.cs`
- Create: `tests/PluralHost.Tests/Controllers/ImportControllerTests.cs`

- [ ] **Step 1: Write failing controller tests**

Create `tests/PluralHost.Tests/Controllers/ImportControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class ImportControllerTests
{
    private static ImportResult SampleResult() =>
        new(3, 1, 0, [], 2, 0, 5);

    [Fact]
    public async Task PostSp_ReturnsOkWithResult()
    {
        var svc = new Mock<IImportService>();
        var req = new SpImportRequest("merge_prefer_existing", true, true, true,
            [new("sp1", "Alice", null, null, null, null, false, false, null, false, false, null)],
            null, null);
        svc.Setup(s => s.ImportSpAsync(req, default)).ReturnsAsync(SampleResult());

        var result = await new ImportController(svc.Object).ImportSpAsync(req);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.IsType<ImportResult>(ok.Value);
    }

    [Fact]
    public async Task PostPk_ReturnsOkWithResult()
    {
        var svc = new Mock<IImportService>();
        var req = new PkImportRequest("pk-token", "merge_prefer_existing", true, true);
        svc.Setup(s => s.ImportPkAsync(req, default)).ReturnsAsync(SampleResult());

        var result = await new ImportController(svc.Object).ImportPkAsync(req);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.IsType<ImportResult>(ok.Value);
    }

    [Fact]
    public async Task PostSp_EmptyMembers_ReturnsOk()
    {
        var svc = new Mock<IImportService>();
        svc.Setup(s => s.ImportSpAsync(It.IsAny<SpImportRequest>(), default))
           .ReturnsAsync(new ImportResult(0, 0, 0, [], 0, 0, 0));

        var result = await new ImportController(svc.Object)
            .ImportSpAsync(new("merge_prefer_existing", false, false, false, [], null, null));

        Assert.IsType<OkObjectResult>(result);
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "ImportControllerTests" -v minimal
```

Expected: Build error — `ImportController` not found.

- [ ] **Step 3: Create `src/PluralHost.Api/Controllers/ImportController.cs`**

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/import")]
public class ImportController(IImportService importSvc) : ControllerBase
{
    [HttpPost("simply-plural")]
    public async Task<IActionResult> ImportSpAsync([FromBody] SpImportRequest request)
        => Ok(await importSvc.ImportSpAsync(request));

    [HttpPost("plural-kit")]
    public async Task<IActionResult> ImportPkAsync([FromBody] PkImportRequest request)
        => Ok(await importSvc.ImportPkAsync(request));
}
```

- [ ] **Step 4: Run tests**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests --filter "ImportControllerTests" -v minimal
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Api/Controllers/ImportController.cs tests/PluralHost.Tests/Controllers/ImportControllerTests.cs
git commit -m "feat: ImportController — POST /api/import/simply-plural and /plural-kit"
```

---

### Task 6: DI wiring

**Files:**
- Modify: `src/PluralHost.Api/Program.cs`

- [ ] **Step 1: Find the service registration block**

```bash
cd C:\dev\simply-personal && grep -n "AddScoped\|AddSingleton\|AddHttpClient" src/PluralHost.Api/Program.cs
```

Note the line numbers where other services are registered.

- [ ] **Step 2: Add registrations**

After the existing `AddScoped<IGatekeeperService, GatekeeperService>()` line (or equivalent grouping), add:

```csharp
builder.Services.AddScoped<IImportService, ImportService>();
builder.Services.AddHttpClient<IAvatarDownloadService, AvatarDownloadService>();
```

`AddHttpClient<TInterface, TImpl>()` registers `AvatarDownloadService` as a typed client — ASP.NET Core's `IHttpClientFactory` machinery injects a managed `HttpClient` instance into its constructor.

- [ ] **Step 3: Build and run all tests**

```bash
cd C:\dev\simply-personal && dotnet build src/PluralHost.Api && dotnet test tests/PluralHost.Tests -v minimal
```

Expected: Build succeeded, all tests pass (no regressions).

- [ ] **Step 4: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Api/Program.cs
git commit -m "feat: register ImportService and AvatarDownloadService in DI"
```

---

### Task 7: Frontend `api/import.ts`

**Files:**
- Create: `src/PluralHost.Web/src/api/import.ts`

- [ ] **Step 1: Create `src/PluralHost.Web/src/api/import.ts`**

```typescript
import { apiFetch } from './apiFetch'

// ── SP types (flat SP export format) ─────────────────────────────────

export interface SpMemberEntry {
  _id: string
  name?: string
  desc?: string
  pronouns?: string
  color?: string
  avatarUrl?: string
  private?: boolean
  archived?: boolean
  pkId?: string
  preventsFrontNotifs?: boolean
  receiveMessageBoardNotifs?: boolean
  info?: Record<string, string>
}

export interface SpCustomFieldEntry {
  _id: string
  name?: string
  order?: string
}

export interface SpFrontHistoryEntry {
  _id: string
  member?: string
  startTime: number
  endTime?: number
}

export interface SpImportPayload {
  conflictStrategy: string
  includeCustomFields: boolean
  includeFrontHistory: boolean
  includeAvatars: boolean
  members: SpMemberEntry[]
  customFields: SpCustomFieldEntry[]
  frontHistory: SpFrontHistoryEntry[]
}

// ── PK types ──────────────────────────────────────────────────────────

export interface PkImportPayload {
  token: string
  conflictStrategy: string
  includeFrontHistory: boolean
  includeAvatars: boolean
}

// ── Shared result ─────────────────────────────────────────────────────

export interface ImportError {
  sourceId: string
  name: string | null
  reason: string
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: ImportError[]
  avatarsDownloaded: number
  avatarsFailed: number
  frontHistoryImported: number
}

// ── API calls ─────────────────────────────────────────────────────────

export const importApi = {
  importSp: (payload: SpImportPayload) =>
    apiFetch<ImportResult>('/api/import/simply-plural', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  importPk: (payload: PkImportPayload) =>
    apiFetch<ImportResult>('/api/import/plural-kit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
```

- [ ] **Step 2: Build frontend to verify no type errors**

```bash
cd C:\dev\simply-personal\src\PluralHost.Web && npm run build
```

Expected: Build completes with 0 TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Web/src/api/import.ts
git commit -m "feat: import.ts API client — SP and PK import endpoints"
```

---

### Task 8: SettingsPage Import UI

**Files:**
- Modify: `src/PluralHost.Web/src/pages/SettingsPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/SettingsPage.module.css`

- [ ] **Step 1: Read current SettingsPage.tsx to understand the collapsible section pattern**

Read `src/PluralHost.Web/src/pages/SettingsPage.tsx`. Note:
- How `useState` is used for collapsible sections (e.g. `securityOpen`)
- The existing import list at the top of the file
- Where the Security `<section>` ends — the Import section goes immediately after it

- [ ] **Step 2: Add imports and state to SettingsPage.tsx**

Add to the import block at the top:
```tsx
import { useMutation } from '@tanstack/react-query'
import { importApi, type ImportResult, type SpImportPayload, type PkImportPayload } from '../api/import'
```

Add the following state and handlers inside the component, after the existing security section state:

```tsx
// ── Import ─────────────────────────────────────────────────────────
const [importOpen, setImportOpen] = useState(false)

// SP
const [spJson, setSpJson] = useState('')
const [spConflict, setSpConflict] = useState('merge_prefer_existing')
const [spAdvanced, setSpAdvanced] = useState(false)
const [spIncludeFields, setSpIncludeFields] = useState(true)
const [spIncludeHistory, setSpIncludeHistory] = useState(true)
const [spIncludeAvatars, setSpIncludeAvatars] = useState(true)
const [spResult, setSpResult] = useState<ImportResult | null>(null)

const spMutation = useMutation({
  mutationFn: (payload: SpImportPayload) => importApi.importSp(payload),
  onSuccess: (data) => setSpResult(data),
})

function handleSpFile(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => setSpJson((ev.target?.result as string) ?? '')
  reader.readAsText(file)
}

function handleSpImport() {
  let parsed: any
  try { parsed = JSON.parse(spJson) } catch { return }
  spMutation.mutate({
    conflictStrategy: spConflict,
    includeCustomFields: spIncludeFields,
    includeFrontHistory: spIncludeHistory,
    includeAvatars: spIncludeAvatars,
    members: parsed.members ?? [],
    customFields: parsed.customFields ?? [],
    frontHistory: parsed.frontHistory ?? [],
  })
}

// PK
const [pkToken, setPkToken] = useState('')
const [pkConflict, setPkConflict] = useState('merge_prefer_existing')
const [pkAdvanced, setPkAdvanced] = useState(false)
const [pkIncludeHistory, setPkIncludeHistory] = useState(true)
const [pkIncludeAvatars, setPkIncludeAvatars] = useState(true)
const [pkResult, setPkResult] = useState<ImportResult | null>(null)

const pkMutation = useMutation({
  mutationFn: (payload: PkImportPayload) => importApi.importPk(payload),
  onSuccess: (data) => setPkResult(data),
})
```

- [ ] **Step 3: Add Import JSX section to the render**

Add this block after the closing `</section>` of the Security section, before the component's closing `</div>`:

```tsx
{/* ── Import ─────────────────────────────────────────────── */}
<section className={styles.section}>
  <button
    className={styles.sectionToggle}
    onClick={() => setImportOpen(o => !o)}
    aria-expanded={importOpen}
  >
    <span className={styles.sectionTitle}>Import</span>
    <span className={styles.sectionChevron}>{importOpen ? '▲' : '▼'}</span>
  </button>

  {importOpen && (
    <div className={styles.importGrid}>

      {/* SP card */}
      <div className={styles.importCard}>
        <h3 className={styles.importCardTitle}>Simply Plural</h3>
        <div className={styles.importFileRow}>
          <label className={styles.fileBtn}>
            Choose file
            <input type="file" accept=".json" hidden onChange={handleSpFile} />
          </label>
          <span className={styles.fileHint}>{spJson ? 'JSON loaded ✓' : 'or paste below'}</span>
        </div>
        <textarea
          className={styles.jsonTextarea}
          placeholder="Paste SP export JSON here…"
          value={spJson}
          onChange={e => setSpJson(e.target.value)}
          rows={5}
        />
        <label className={styles.checkRow}>
          <input type="checkbox" checked={spIncludeFields}
            onChange={e => setSpIncludeFields(e.target.checked)} />
          Import custom fields
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={spIncludeHistory}
            onChange={e => setSpIncludeHistory(e.target.checked)} />
          Import front history
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={spIncludeAvatars}
            onChange={e => setSpIncludeAvatars(e.target.checked)} />
          Download avatars
        </label>
        <div className={styles.conflictRow}>
          <span className={styles.conflictPill}>Safe merge</span>
          <button className={styles.advancedToggle} onClick={() => setSpAdvanced(v => !v)}>
            Advanced {spAdvanced ? '▲' : '▾'}
          </button>
        </div>
        {spAdvanced && (
          <select className={styles.conflictSelect} value={spConflict}
            onChange={e => setSpConflict(e.target.value)}>
            <option value="merge_prefer_existing">Safe merge (keep existing)</option>
            <option value="merge_prefer_imported">Prefer imported</option>
            <option value="overwrite">Overwrite all</option>
            <option value="skip">Skip existing</option>
            <option value="duplicate">Always duplicate</option>
          </select>
        )}
        <button
          className={styles.importBtn}
          disabled={!spJson.trim() || spMutation.isPending}
          onClick={handleSpImport}
        >
          {spMutation.isPending ? 'Importing…' : 'Import from Simply Plural'}
        </button>
        {spMutation.isError && <p className={styles.importError}>Import failed. Check JSON format.</p>}
        {spResult && <ImportResultCard result={spResult} />}
      </div>

      {/* PK card */}
      <div className={styles.importCard}>
        <h3 className={styles.importCardTitle}>PluralKit</h3>
        <p className={styles.importHint}>Token is used once and never stored.</p>
        <input
          type="password"
          className={styles.tokenInput}
          placeholder="PluralKit token"
          value={pkToken}
          onChange={e => setPkToken(e.target.value)}
        />
        <label className={styles.checkRow}>
          <input type="checkbox" checked={pkIncludeHistory}
            onChange={e => setPkIncludeHistory(e.target.checked)} />
          Import front history
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={pkIncludeAvatars}
            onChange={e => setPkIncludeAvatars(e.target.checked)} />
          Download avatars
        </label>
        <div className={styles.conflictRow}>
          <span className={styles.conflictPill}>Safe merge</span>
          <button className={styles.advancedToggle} onClick={() => setPkAdvanced(v => !v)}>
            Advanced {pkAdvanced ? '▲' : '▾'}
          </button>
        </div>
        {pkAdvanced && (
          <select className={styles.conflictSelect} value={pkConflict}
            onChange={e => setPkConflict(e.target.value)}>
            <option value="merge_prefer_existing">Safe merge (keep existing)</option>
            <option value="merge_prefer_imported">Prefer imported</option>
            <option value="overwrite">Overwrite all</option>
            <option value="skip">Skip existing</option>
            <option value="duplicate">Always duplicate</option>
          </select>
        )}
        <button
          className={styles.importBtn}
          disabled={!pkToken.trim() || pkMutation.isPending}
          onClick={() => pkMutation.mutate({
            token: pkToken,
            conflictStrategy: pkConflict,
            includeFrontHistory: pkIncludeHistory,
            includeAvatars: pkIncludeAvatars,
          })}
        >
          {pkMutation.isPending ? 'Importing…' : 'Import from PluralKit'}
        </button>
        {pkMutation.isError && <p className={styles.importError}>Import failed. Check token.</p>}
        {pkResult && <ImportResultCard result={pkResult} />}
      </div>

    </div>
  )}
</section>
```

- [ ] **Step 4: Add `ImportResultCard` below the main component export**

Add at the bottom of `SettingsPage.tsx` (outside the default export function):

```tsx
function ImportResultCard({ result }: { result: ImportResult }) {
  return (
    <div className={styles.resultCard}>
      <div className={styles.resultRow}>
        <span className={styles.resultStat}>{result.created} created</span>
        <span className={styles.resultStat}>{result.updated} updated</span>
        <span className={styles.resultStat}>{result.skipped} skipped</span>
      </div>
      {result.frontHistoryImported > 0 && (
        <p className={styles.resultMeta}>{result.frontHistoryImported} front entries imported</p>
      )}
      {(result.avatarsDownloaded > 0 || result.avatarsFailed > 0) && (
        <p className={styles.resultMeta}>
          {result.avatarsDownloaded} avatars downloaded
          {result.avatarsFailed > 0 && `, ${result.avatarsFailed} failed`}
        </p>
      )}
      {result.errors.length > 0 && (
        <details className={styles.errorDetails}>
          <summary>{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</summary>
          <ul className={styles.errorList}>
            {result.errors.map((e, i) => (
              <li key={i}>{e.name ?? e.sourceId}: {e.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Append import CSS to SettingsPage.module.css**

```css
/* ── Import section ───────────────────────────────────────────────── */
.importGrid { display: flex; flex-direction: column; gap: 24px; padding-top: 16px; }
@media (min-width: 768px) { .importGrid { flex-direction: row; } }
.importCard { flex: 1; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.importCardTitle { font-size: 1rem; font-weight: 700; color: var(--color-text); margin: 0; }
.importFileRow { display: flex; align-items: center; gap: 10px; }
.fileBtn { background: var(--color-surface-2, #222); border: 1px solid var(--color-border); color: var(--color-text); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
.fileHint { font-size: 0.8rem; color: var(--color-text-muted); }
.jsonTextarea { width: 100%; box-sizing: border-box; background: #111; border: 1px solid var(--color-border); color: var(--color-text); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.8rem; resize: vertical; }
.tokenInput { width: 100%; box-sizing: border-box; background: #111; border: 1px solid var(--color-border); color: var(--color-text); padding: 10px 12px; border-radius: 6px; font-size: 0.9rem; }
.checkRow { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; color: var(--color-text); cursor: pointer; }
.checkRow input[type="checkbox"] { accent-color: var(--color-primary); width: 16px; height: 16px; }
.conflictRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.conflictPill { background: rgba(182,255,0,0.1); border: 1px solid rgba(182,255,0,0.3); color: var(--color-primary); padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; }
.advancedToggle { background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: 0.8rem; padding: 0; }
.conflictSelect { width: 100%; background: #111; border: 1px solid var(--color-border); color: var(--color-text); padding: 6px 10px; border-radius: 6px; font-size: 0.85rem; }
.importBtn { background: var(--color-primary); color: #000; border: none; border-radius: 8px; padding: 10px 14px; font-weight: 700; cursor: pointer; font-size: 0.9rem; }
.importBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.importError { color: var(--color-danger); font-size: 0.85rem; margin: 0; }
.importHint { color: var(--color-text-muted); font-size: 0.82rem; margin: 0; }
.resultCard { background: #0f0f0f; border: 1px solid #2a2a2a; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.resultRow { display: flex; gap: 16px; flex-wrap: wrap; }
.resultStat { font-size: 0.9rem; font-weight: 700; color: var(--color-primary); }
.resultMeta { font-size: 0.82rem; color: var(--color-text-muted); margin: 0; }
.errorDetails { font-size: 0.82rem; color: var(--color-danger); }
.errorDetails summary { cursor: pointer; }
.errorList { margin: 6px 0 0 16px; padding: 0; list-style: disc; }
```

- [ ] **Step 6: Build and run frontend tests**

```bash
cd C:\dev\simply-personal\src\PluralHost.Web && npm run build && npx vitest run
```

Expected: Build succeeds, all existing tests pass.

- [ ] **Step 7: Run full backend test suite one final time**

```bash
cd C:\dev\simply-personal && dotnet test tests/PluralHost.Tests -v minimal
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
cd C:\dev\simply-personal
git add src/PluralHost.Web/src/pages/SettingsPage.tsx src/PluralHost.Web/src/pages/SettingsPage.module.css
git commit -m "feat: SettingsPage Import section — SP JSON upload + PK token input with result card"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| `POST /api/import/simply-plural` with `[Authorize]` | Task 5 |
| `POST /api/import/plural-kit` with `[Authorize]` | Task 5 |
| Flat SP export format (`_id`, no `content` wrapper) | Tasks 1, 3 |
| All 5 conflict strategies | Task 3 (`ApplySpFields`) + tests |
| SP member matching by `SpMemberId` | Task 3 |
| PK member matching by `PkId` | Task 4 |
| All SP field mappings (name/desc/pronouns/color/private/archived/etc.) | Task 3 `ApplySpFields` |
| All PK field mappings (uuid/name/display_name/color/birthday/privacy) | Task 4 `ApplyPkFields` |
| SP custom field defs + values upsert | Task 3 + tests |
| SP front history (flat, _id/member/startTime/endTime) | Task 3 + tests |
| PK switch import with `before` cursor pagination (10-page cap) | Task 4 |
| Switch → FrontHistory EndTime = next switch StartTime | Task 4 test |
| SSRF protection (private IP ranges, scheme) | Task 2 + tests |
| Magic byte validation (JPEG/PNG/GIF/WebP) | Task 2 + tests |
| 5 MB size limit | Task 2 + test |
| Avatar failure non-fatal | Task 3 test |
| Token never written to DB | Task 4 test |
| `ImportResult` response shape (created/updated/skipped/errors/avatars/history) | Task 1 |
| DI wiring | Task 6 |
| SP card: textarea + file upload + checkboxes + conflict toggle | Task 8 |
| PK card: password input + checkboxes + conflict toggle | Task 8 |
| Result card with error details list | Task 8 |

**Placeholder scan:** None. Every step has complete code.

**Type consistency:**
- `SpMemberEntry._id` uses `[JsonPropertyName("_id")]` in backend and `_id` key in frontend TS interface ✓
- `ImportResult` fields match between `ImportDtos.cs`, `ImportService` return sites, and `import.ts` ✓
- `IAvatarDownloadService.DownloadAsync` returns `string?` — used consistently in `ImportService` ✓
- `FakePkHttpClientFactory.CreateClient` returns a fresh `HttpClient` per call — no shared header state between tests ✓
- `ApplySpFields` / `ApplyPkFields` are private static helpers called from both create and update paths ✓
