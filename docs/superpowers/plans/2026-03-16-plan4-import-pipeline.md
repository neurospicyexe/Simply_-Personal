# Plan 4: Import Pipeline (Simply Plural + PluralKit)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/import/simply-plural` and `POST /api/import/plural-kit` endpoints that parse JSON exports, resolve conflicts with a configurable strategy, download avatars locally, and return an import summary.

**Architecture:** Two dedicated import endpoints share a single `ImportService` that handles matching, merge strategies, and error aggregation. Avatar download is a separate `AvatarDownloadService` with SSRF protection. SP custom field definitions and values are imported as `CustomField`/`CustomFieldValue` rows. A new `ImportController` wires everything together.

**Tech Stack:** .NET 8, ASP.NET Core, EF Core 8 + SQLite, `HttpClient` (avatar download), BCrypt-style magic-bytes validation in-process, xUnit + EF InMemory + Moq for tests.

**Spec:** `docs/superpowers/specs/2026-03-16-plan4-import-pipeline.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/PluralHost.Api/Domain/Member.cs` | Add `PkId`, `Birthday` fields |
| Modify | `src/PluralHost.Api/Domain/CustomField.cs` | Add `SpFieldId` field |
| Modify | `src/PluralHost.Api/Data/PluralHostContext.cs` | Register new fields, no new query filters |
| Create | `src/PluralHost.Api/Data/Migrations/` | EF migration for new columns |
| Modify | `src/PluralHost.Api/Dto/NativeDtos.cs` | Add import DTOs + update MemberResponse |
| Create | `src/PluralHost.Api/Services/AvatarDownloadService.cs` | SSRF-safe HTTP download, magic-byte check, local save |
| Create | `src/PluralHost.Api/Services/ImportService.cs` | SP + PK parsing, conflict resolution, EF upsert |
| Create | `src/PluralHost.Api/Controllers/ImportController.cs` | Two endpoints, wires services |
| Modify | `src/PluralHost.Api/Program.cs` | Register `IAvatarDownloadService`, `IImportService`, `HttpClient` |
| Modify | `tests/PluralHost.Tests/Controllers/` | `ImportControllerTests.cs` |
| Create | `tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs` | Unit tests for download service |
| Create | `tests/PluralHost.Tests/Services/ImportServiceTests.cs` | Unit tests for import logic |

---

## Chunk 1: Domain + Migration + DTOs

### Task 1: Add `PkId`, `Birthday` to Member; `SpFieldId` to CustomField

**Files:**
- Modify: `src/PluralHost.Api/Domain/Member.cs`
- Modify: `src/PluralHost.Api/Domain/CustomField.cs`
- Test: `tests/PluralHost.Tests/Domain/MemberTests.cs`

- [ ] **Step 1: Write failing test for new Member fields**

```csharp
// In MemberTests.cs — add to existing test class
[Fact]
public void Member_NewFields_DefaultNull()
{
    var m = new Member { Name = "Test" };
    Assert.Null(m.PkId);
    Assert.Null(m.Birthday);
}
```

Run: `dotnet test --filter MemberTests -v minimal`
Expected: FAIL — `PkId` and `Birthday` don't exist yet.

- [ ] **Step 2: Add fields to `Member.cs`**

Add after `SpMemberId`:
```csharp
public string? PkId { get; set; }
public string? Birthday { get; set; }   // "YYYY-MM-DD" or null
```

- [ ] **Step 3: Add `SpFieldId` to `CustomField.cs`**

Add after `SortOrder`:
```csharp
public string? SpFieldId { get; set; }   // SP MongoDB ObjectId, null if not imported from SP
```

- [ ] **Step 4: Run tests — verify pass**

Run: `dotnet test --filter MemberTests -v minimal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Domain/Member.cs src/PluralHost.Api/Domain/CustomField.cs tests/PluralHost.Tests/Domain/MemberTests.cs
git commit -m "feat: add PkId, Birthday to Member; SpFieldId to CustomField"
```

---

### Task 2: EF Core migration + PluralHostContext

**Files:**
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs` (no config change needed — new string fields are auto-mapped by convention)
- Create: `src/PluralHost.Api/Data/Migrations/` (generated)

- [ ] **Step 1: Generate migration**

```bash
dotnet ef migrations add ImportFields --project src/PluralHost.Api --output-dir Data/Migrations
```

Verify the migration creates `PkId TEXT`, `Birthday TEXT` on `Members`, and `SpFieldId TEXT` on `CustomFields`. No data migrations needed (all nullable).

- [ ] **Step 2: Run full test suite — no regressions**

```bash
dotnet test tests/PluralHost.Tests --no-build
```

Expected: all 229 tests passing (no new tests in this task).

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Api/Data/Migrations/ src/PluralHost.Api/Data/PluralHostContext.cs
git commit -m "feat: EF migration for PkId, Birthday, SpFieldId columns"
```

---

### Task 3: Import DTOs

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`

- [ ] **Step 1: Add import records to end of `NativeDtos.cs`**

```csharp
// --- Import pipeline DTOs ---

public enum ImportConflictStrategy
{
    MergePreferExisting,   // default — only fills blank fields
    MergePreferImported,   // imported wins on non-null fields
    Overwrite,             // imported wins on all fields it provides
    Skip,                  // if match exists, do nothing
    Duplicate              // always create new member
}

// SP import
public record SpImportMemberContent(
    string? Name, string? Desc, string? Pronouns, string? PkId,
    string? Color, string? AvatarUrl, bool Private,
    bool PreventsFrontNotifs, bool ReceiveMessageBoardNotifs,
    bool Archived, Dictionary<string, string>? Info);

public record SpMemberEntry(string Id, SpImportMemberContent? Content);

public record SpCustomFieldContent(string? Name, int Order, bool Private);
public record SpCustomFieldEntry(string Id, SpCustomFieldContent? Content);

public record SpImportRequest(
    IReadOnlyList<SpMemberEntry> Members,
    IReadOnlyList<SpCustomFieldEntry>? CustomFields = null,
    ImportConflictStrategy ConflictStrategy = ImportConflictStrategy.MergePreferExisting,
    bool IncludeCustomFields = true,
    bool IncludeAvatars = true);

// PK import
public record PkMemberPrivacy(string? Visibility);

public record PkMemberEntry(
    string? Uuid, string? Name, string? DisplayName, string? Pronouns,
    string? Color, string? AvatarUrl, string? Description,
    string? Birthday, PkMemberPrivacy? Privacy);

public record PkImportRequest(
    IReadOnlyList<PkMemberEntry> Members,
    ImportConflictStrategy ConflictStrategy = ImportConflictStrategy.MergePreferExisting,
    bool IncludeAvatars = true);

// Import result
public record ImportMemberError(string SourceId, string? Name, string Reason);

public record ImportResult(
    int Created,
    int Updated,
    int Skipped,
    int AvatarsDownloaded,
    int AvatarsFailed,
    IReadOnlyList<ImportMemberError> Errors);
```

Note on JSON deserialization: use `System.Text.Json` with `JsonPropertyName` where SP/PK fields use snake_case. Add these attributes:
- `SpImportMemberContent.AvatarUrl` → `[JsonPropertyName("avatarUrl")]`
- `SpImportMemberContent.PreventsFrontNotifs` → `[JsonPropertyName("preventsFrontNotifs")]`
- `SpImportMemberContent.ReceiveMessageBoardNotifs` → `[JsonPropertyName("receiveMessageBoardNotifs")]`
- `PkMemberEntry.DisplayName` → `[JsonPropertyName("display_name")]`
- `PkMemberEntry.AvatarUrl` → `[JsonPropertyName("avatar_url")]`

Add `using System.Text.Json.Serialization;` at top of file.

- [ ] **Step 2: Run full test suite — no regressions**

```bash
dotnet test tests/PluralHost.Tests --no-build
```

Expected: 229/229 passing.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: add import DTOs (SpImportRequest, PkImportRequest, ImportResult)"
```

---

## Chunk 2: Avatar Download Service

### Task 4: `AvatarDownloadService`

**Files:**
- Create: `src/PluralHost.Api/Services/AvatarDownloadService.cs`
- Test: `tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs`

The service downloads a URL to `secure_uploads/` with SSRF protection, file size limit, content-type check, and magic-byte validation.

- [ ] **Step 1: Define interface and create empty implementation**

Create `src/PluralHost.Api/Services/AvatarDownloadService.cs`:
```csharp
using Microsoft.Extensions.Configuration;

namespace PluralHost.Api.Services;

public interface IAvatarDownloadService
{
    /// <summary>
    /// Downloads the URL, validates content, stores in secure_uploads.
    /// Returns the local path on success, null on any failure (non-throwing).
    /// </summary>
    Task<string?> DownloadAvatarAsync(string url, CancellationToken ct = default);
}

public class AvatarDownloadService(HttpClient http, IConfiguration config) : IAvatarDownloadService
{
    private static readonly long MaxBytes = 5 * 1024 * 1024; // 5 MB

    private static readonly Dictionary<string, byte[]> MagicBytes = new()
    {
        ["jpg"] = [0xFF, 0xD8, 0xFF],
        ["png"] = [0x89, 0x50, 0x4E, 0x47],
        ["gif"] = [0x47, 0x49, 0x46],
        ["webp"] = [0x52, 0x49, 0x46, 0x46],
    };

    private static readonly HashSet<string> AllowedMimeTypes =
        ["image/jpeg", "image/png", "image/gif", "image/webp"];

    public async Task<string?> DownloadAvatarAsync(string url, CancellationToken ct = default)
    {
        // TODO: implement
        throw new NotImplementedException();
    }

    // Returns true if IP is private/loopback/link-local (SSRF protection)
    private static bool IsPrivateAddress(Uri uri)
    {
        // TODO: implement
        throw new NotImplementedException();
    }
}
```

- [ ] **Step 2: Write failing tests**

Create `tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs`:

```csharp
using System.Net;
using System.Net.Http;
using Microsoft.Extensions.Configuration;
using Moq;
using Moq.Protected;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class AvatarDownloadServiceTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly IConfiguration _config;

    public AvatarDownloadServiceTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(_tempRoot);
        _config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SecureUploads:Root"] = _tempRoot
            }).Build();
    }

    private static IAvatarDownloadService BuildService(
        HttpStatusCode status, byte[] content, string contentType = "image/jpeg")
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage(status)
            {
                Content = new ByteArrayContent(content)
                { Headers = { ContentType = new(contentType) } }
            });
        var http = new HttpClient(handler.Object);
        return new AvatarDownloadService(http, new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["SecureUploads:Root"] = Path.Combine(Path.GetTempPath(), "av-test-" + Guid.NewGuid())
            }).Build());
    }

    [Fact]
    public async Task Download_ValidJpeg_ReturnsPath()
    {
        // JPEG magic bytes + enough padding
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
        var svc = BuildService(HttpStatusCode.OK, bytes, "image/jpeg");

        var result = await svc.DownloadAvatarAsync("http://example.com/avatar.jpg");

        Assert.NotNull(result);
        Assert.EndsWith(".jpg", result);
    }

    [Fact]
    public async Task Download_PrivateIpUrl_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("http://192.168.1.1/evil.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_LocalhostUrl_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("http://localhost/evil.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_AwsMetadataUrl_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("http://169.254.169.254/latest/meta-data/");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_OversizeFile_ReturnsNull()
    {
        var big = new byte[6 * 1024 * 1024]; // 6 MB
        big[0] = 0xFF; big[1] = 0xD8; big[2] = 0xFF;
        var svc = BuildService(HttpStatusCode.OK, big, "image/jpeg");

        var result = await svc.DownloadAvatarAsync("http://example.com/big.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_WrongMimeType_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF], "text/html");

        var result = await svc.DownloadAvatarAsync("http://example.com/page.html");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_BadMagicBytes_ReturnsNull()
    {
        // Content-type says jpeg but magic bytes are wrong
        var svc = BuildService(HttpStatusCode.OK, [0x00, 0x00, 0x00], "image/jpeg");

        var result = await svc.DownloadAvatarAsync("http://example.com/fake.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_Http404_ReturnsNull()
    {
        var svc = BuildService(HttpStatusCode.NotFound, []);

        var result = await svc.DownloadAvatarAsync("http://example.com/missing.jpg");

        Assert.Null(result);
    }

    [Fact]
    public async Task Download_NonHttpUrl_ReturnsNull()
    {
        // file:// URLs must not be attempted
        var svc = BuildService(HttpStatusCode.OK, [0xFF, 0xD8, 0xFF]);

        var result = await svc.DownloadAvatarAsync("file:///etc/passwd");

        Assert.Null(result);
    }

    public void Dispose() => Directory.Delete(_tempRoot, recursive: true);
}
```

Run: `dotnet test --filter AvatarDownloadServiceTests -v minimal`
Expected: FAIL (NotImplementedException).

- [ ] **Step 3: Implement `DownloadAvatarAsync`**

```csharp
public async Task<string?> DownloadAvatarAsync(string url, CancellationToken ct = default)
{
    try
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != "http" && uri.Scheme != "https") return null;
        if (IsPrivateAddress(uri)) return null;

        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode) return null;

        var mime = response.Content.Headers.ContentType?.MediaType?.ToLowerInvariant() ?? "";
        if (!AllowedMimeTypes.Contains(mime)) return null;

        var ext = mime switch
        {
            "image/jpeg" => "jpg",
            "image/png"  => "png",
            "image/gif"  => "gif",
            "image/webp" => "webp",
            _ => null
        };
        if (ext == null) return null;

        var stream = await response.Content.ReadAsStreamAsync(ct);
        var buffer = new byte[MaxBytes + 1];
        var bytesRead = await stream.ReadAsync(buffer.AsMemory(0, buffer.Length), ct);

        if (bytesRead > MaxBytes) return null;

        // Magic bytes check
        var magic = MagicBytes[ext];
        if (bytesRead < magic.Length) return null;
        for (var i = 0; i < magic.Length; i++)
            if (buffer[i] != magic[i]) return null;

        // WebP extra check: bytes 8-11 must be "WEBP"
        if (ext == "webp")
        {
            if (bytesRead < 12) return null;
            var webp = "WEBP"u8;
            for (var i = 0; i < 4; i++)
                if (buffer[8 + i] != webp[i]) return null;
        }

        var root = config["SecureUploads:Root"] ?? "secure_uploads";
        Directory.CreateDirectory(root);
        var filename = $"{Guid.NewGuid()}.{ext}";
        var path = Path.Combine(root, filename);
        await File.WriteAllBytesAsync(path, buffer[..bytesRead], ct);
        return path;
    }
    catch
    {
        return null; // any failure is non-fatal
    }
}
```

- [ ] **Step 4: Implement `IsPrivateAddress`**

```csharp
private static bool IsPrivateAddress(Uri uri)
{
    var host = uri.Host.ToLowerInvariant();
    if (host == "localhost") return true;

    if (!System.Net.IPAddress.TryParse(host, out var ip))
    {
        // Hostname — attempt DNS? No. Reject ambiguous hostnames that look internal.
        // Any host that doesn't parse as IP is allowed (external DNS resolves it).
        // Only raw IPs need SSRF checking here. Public hostnames are fine.
        return false;
    }

    var bytes = ip.GetAddressBytes();
    if (bytes.Length != 4) return false; // IPv6 not supported for avatars

    return (bytes[0] == 10) ||                                                   // 10.x.x.x
           (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||             // 172.16-31.x.x
           (bytes[0] == 192 && bytes[1] == 168) ||                              // 192.168.x.x
           (bytes[0] == 127) ||                                                   // 127.x.x.x loopback
           (bytes[0] == 169 && bytes[1] == 254) ||                              // 169.254.x.x link-local
           (bytes[0] == 0);                                                      // 0.x.x.x
}
```

- [ ] **Step 5: Run tests**

```bash
dotnet test --filter AvatarDownloadServiceTests -v minimal
```

Expected: 9/9 PASS.

- [ ] **Step 6: Register in `Program.cs`**

Add after existing service registrations:
```csharp
builder.Services.AddHttpClient<IAvatarDownloadService, AvatarDownloadService>();
```

- [ ] **Step 7: Run full test suite — no regressions**

```bash
dotnet test tests/PluralHost.Tests --no-build
```

Expected: 238/238 passing.

- [ ] **Step 8: Commit**

```bash
git add src/PluralHost.Api/Services/AvatarDownloadService.cs src/PluralHost.Api/Program.cs tests/PluralHost.Tests/Services/AvatarDownloadServiceTests.cs
git commit -m "feat: AvatarDownloadService with SSRF protection, magic-byte validation"
```

---

## Chunk 3: Import Service

### Task 5: `ImportService` — SP import

**Files:**
- Create: `src/PluralHost.Api/Services/ImportService.cs`
- Test: `tests/PluralHost.Tests/Services/ImportServiceTests.cs`

- [ ] **Step 1: Write failing tests for SP import**

Create `tests/PluralHost.Tests/Services/ImportServiceTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class ImportServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IAvatarDownloadService> _avatars;
    private readonly IImportService _svc;

    public ImportServiceTests()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        _context = new PluralHostContext(opts);
        _context.Database.EnsureCreated();
        _avatars = new Mock<IAvatarDownloadService>();
        _avatars.Setup(a => a.DownloadAvatarAsync(It.IsAny<string>(), default))
                .ReturnsAsync((string?)null); // default: avatar download disabled in most tests
        _svc = new ImportService(_context, _avatars.Object);
    }

    // --- SP import tests ---

    [Fact]
    public async Task ImportSp_NewMember_CreatesRow()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: "Fire alter", Pronouns: "she/her",
                PkId: null, Color: "#ff0000", AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Created);
        Assert.Equal(0, result.Errors.Count);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("Ember", member.Name);
        Assert.Equal("sp-001", member.SpMemberId);
        Assert.Equal("#ff0000", member.Color);
    }

    [Fact]
    public async Task ImportSp_ExistingMember_Skip()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember Updated", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.Skip,
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Skipped);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("Ember", member.Name); // unchanged
    }

    [Fact]
    public async Task ImportSp_ExistingMember_MergePreferExisting_FillsBlanks()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = null });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: "Bio", Pronouns: "they/them",
                PkId: null, Color: "#ff0000", AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Updated);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("they/them", member.Pronouns); // was null, now filled
        Assert.Equal("Bio", member.Description);    // was null, now filled
    }

    [Fact]
    public async Task ImportSp_ExistingMember_MergePreferExisting_KeepsExistingPronouns()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: "they/them",
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("she/her", member.Pronouns); // kept — existing is not null
    }

    [Fact]
    public async Task ImportSp_ExistingMember_MergePreferImported_OverwritesNonNull()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: "they/them",
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.MergePreferImported,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("they/them", member.Pronouns); // imported non-null wins
    }

    [Fact]
    public async Task ImportSp_ExistingMember_Overwrite_ReplacesFields()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: "they/them",
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.Overwrite,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("they/them", member.Pronouns);
    }

    [Fact]
    public async Task ImportSp_Duplicate_CreatesNewEvenIfMatchExists()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.Duplicate,
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Created);
        Assert.Equal(2, await _context.Members.CountAsync()); // original + duplicate
    }

    [Fact]
    public async Task ImportSp_BlankName_AddsError()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(0, result.Created);
        Assert.Single(result.Errors);
        Assert.Equal("sp-001", result.Errors[0].SourceId);
    }

    [Fact]
    public async Task ImportSp_SetsSpPrivateTrue_SetsPrivacyTierPrivate()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Shadow", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: true,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal(MemberPrivacy.Private, member.PrivacyTier);
    }

    [Fact]
    public async Task ImportSp_WithPkId_SetsPkIdOnMember()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: "pk-uuid-abc", Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("pk-uuid-abc", member.PkId);
    }

    public void Dispose() => _context.Dispose();
}
```

Run: `dotnet test --filter ImportServiceTests -v minimal`
Expected: FAIL (type and method don't exist yet).

- [ ] **Step 2: Create `ImportService.cs` with SP import**

Create `src/PluralHost.Api/Services/ImportService.cs`:

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

public class ImportService(PluralHostContext context, IAvatarDownloadService avatars) : IImportService
{
    public async Task<ImportResult> ImportSpAsync(SpImportRequest request, CancellationToken ct = default)
    {
        int created = 0, updated = 0, skipped = 0, avatarsOk = 0, avatarsFail = 0;
        var errors = new List<ImportMemberError>();

        // Process custom field definitions first (needed to upsert values)
        var fieldMap = new Dictionary<string, Guid>(); // SP field id → our CustomField.Id
        if (request.IncludeCustomFields && request.CustomFields != null)
        {
            foreach (var spField in request.CustomFields)
            {
                if (string.IsNullOrWhiteSpace(spField.Content?.Name)) continue;

                var existing = await context.CustomFields
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(f => f.SpFieldId == spField.Id, ct);

                if (existing == null)
                {
                    existing = new CustomField
                    {
                        Label = spField.Content.Name,
                        FieldType = FieldType.Text,
                        SortOrder = spField.Content.Order,
                        SpFieldId = spField.Id
                    };
                    context.CustomFields.Add(existing);
                }
                else if (existing.DeletedAt != null)
                {
                    existing.Restore();
                }

                await context.SaveChangesAsync(ct);
                fieldMap[spField.Id] = existing.Id;
            }
        }

        foreach (var entry in request.Members)
        {
            var c = entry.Content;
            if (c == null || string.IsNullOrWhiteSpace(c.Name))
            {
                errors.Add(new ImportMemberError(entry.Id, c?.Name, "Name is blank"));
                continue;
            }

            // Match
            var existing = request.ConflictStrategy != ImportConflictStrategy.Duplicate
                ? await context.Members.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(m => m.SpMemberId == entry.Id, ct)
                : null;

            if (existing != null && request.ConflictStrategy == ImportConflictStrategy.Skip)
            {
                skipped++;
                continue;
            }

            Member member;
            bool isNew = existing == null;

            if (isNew)
            {
                member = new Member { Name = c.Name, SpMemberId = entry.Id };
                context.Members.Add(member);
                created++;
            }
            else
            {
                member = existing!;
                updated++;
            }

            ApplySpFields(member, c, request.ConflictStrategy, isNew);

            // Avatar
            if (request.IncludeAvatars && !string.IsNullOrWhiteSpace(c.AvatarUrl))
            {
                var path = await avatars.DownloadAvatarAsync(c.AvatarUrl, ct);
                if (path != null)
                {
                    if (ShouldApply(member.AvatarPath, path, request.ConflictStrategy, isNew))
                        member.AvatarPath = path;
                    avatarsOk++;
                }
                else
                {
                    avatarsFail++;
                }
            }

            await context.SaveChangesAsync(ct);

            // Custom field values
            if (request.IncludeCustomFields && c.Info != null)
            {
                foreach (var kv in c.Info)
                {
                    if (!fieldMap.TryGetValue(kv.Key, out var fieldId)) continue;
                    if (string.IsNullOrWhiteSpace(kv.Value)) continue;

                    var cfv = await context.CustomFieldValues.IgnoreQueryFilters()
                        .FirstOrDefaultAsync(v => v.FieldId == fieldId && v.MemberId == member.Id, ct);

                    if (cfv == null)
                    {
                        cfv = new CustomFieldValue
                        {
                            FieldId = fieldId, MemberId = member.Id,
                            Value = kv.Value, PrivacyTier = MemberPrivacy.Private
                        };
                        context.CustomFieldValues.Add(cfv);
                    }
                    else
                    {
                        if (cfv.DeletedAt != null) cfv.Restore();
                        if (ShouldApply(cfv.Value, kv.Value, request.ConflictStrategy, false))
                            cfv.Value = kv.Value;
                    }
                }
                await context.SaveChangesAsync(ct);
            }
        }

        return new ImportResult(created, updated, skipped, avatarsOk, avatarsFail, errors);
    }

    private static void ApplySpFields(
        Member m, SpImportMemberContent c, ImportConflictStrategy strategy, bool isNew)
    {
        if (ShouldApply(m.Name, c.Name!, strategy, isNew)) m.Name = c.Name!;
        if (ShouldApply(m.Description, c.Desc, strategy, isNew)) m.Description = c.Desc;
        if (ShouldApply(m.Pronouns, c.Pronouns, strategy, isNew)) m.Pronouns = c.Pronouns;
        if (ShouldApply(m.Color, NormalizeColor(c.Color), strategy, isNew)) m.Color = NormalizeColor(c.Color);
        if (ShouldApply(m.PkId, c.PkId, strategy, isNew)) m.PkId = c.PkId;
        m.IsArchived = c.Archived;
        m.PreventFrontNotification = c.PreventsFrontNotifs;
        m.ReceiveBoardNotifications = c.ReceiveMessageBoardNotifs;
        if (c.Private)
            m.PrivacyTier = MemberPrivacy.Private;
        else if (m.PrivacyTier == MemberPrivacy.Private)
            m.PrivacyTier = MemberPrivacy.Public; // SP false only upgrades if currently Private
    }

    private static bool ShouldApply(
        string? existing, string? incoming, ImportConflictStrategy strategy, bool isNew)
    {
        if (isNew) return incoming != null;
        return strategy switch
        {
            ImportConflictStrategy.Overwrite => incoming != null,
            ImportConflictStrategy.MergePreferExisting => string.IsNullOrEmpty(existing) && incoming != null,
            ImportConflictStrategy.MergePreferImported => incoming != null,
            ImportConflictStrategy.Skip => false,
            ImportConflictStrategy.Duplicate => incoming != null,
            _ => false
        };
    }

    private static string? NormalizeColor(string? color) =>
        color == null ? null :
        color.StartsWith('#') ? color : $"#{color}";

    public Task<ImportResult> ImportPkAsync(PkImportRequest request, CancellationToken ct = default)
        => throw new NotImplementedException(); // Task 6
}
```

- [ ] **Step 3: Run tests**

```bash
dotnet test --filter ImportServiceTests -v minimal
```

Expected: 10 SP import tests PASS (PK tests don't exist yet — all 10 pass).

- [ ] **Step 4: Run full suite**

```bash
dotnet test tests/PluralHost.Tests --no-build
```

Expected: 248/248 passing.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Services/ImportService.cs tests/PluralHost.Tests/Services/ImportServiceTests.cs
git commit -m "feat: ImportService SP import with all 5 conflict strategies"
```

---

### Task 6: `ImportService` — PK import

**Files:**
- Modify: `src/PluralHost.Api/Services/ImportService.cs`
- Modify: `tests/PluralHost.Tests/Services/ImportServiceTests.cs`

- [ ] **Step 1: Add failing PK tests**

Add to `ImportServiceTests.cs`:

```csharp
// --- PK import tests ---

[Fact]
public async Task ImportPk_NewMember_CreatesRow()
{
    var req = new PkImportRequest(
        Members: [new PkMemberEntry(
            Uuid: "pk-uuid-001", Name: "Ember", DisplayName: "Em",
            Pronouns: "she/her", Color: "ff0000",
            AvatarUrl: null, Description: "Fire alter",
            Birthday: "1999-03-15", Privacy: null)],
        IncludeAvatars: false);

    var result = await _svc.ImportPkAsync(req);

    Assert.Equal(1, result.Created);
    var member = await _context.Members.FirstAsync();
    Assert.Equal("Ember", member.Name);
    Assert.Equal("pk-uuid-001", member.PkId);
    Assert.Equal("#ff0000", member.Color); // # prepended
    Assert.Equal("1999-03-15", member.Birthday);
    Assert.Equal("Em", member.DisplayName);
}

[Fact]
public async Task ImportPk_ExistingByPkId_MergePreferExisting_FillsBlanks()
{
    _context.Members.Add(new Member { Name = "Ember", PkId = "pk-uuid-001", Description = null });
    await _context.SaveChangesAsync();

    var req = new PkImportRequest(
        Members: [new PkMemberEntry(
            Uuid: "pk-uuid-001", Name: "Ember", DisplayName: null,
            Pronouns: null, Color: null, AvatarUrl: null,
            Description: "Fire alter", Birthday: null, Privacy: null)],
        ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
        IncludeAvatars: false);

    await _svc.ImportPkAsync(req);

    var member = await _context.Members.FirstAsync();
    Assert.Equal("Fire alter", member.Description);
}

[Fact]
public async Task ImportPk_PrivateVisibility_SetsPrivacyTierPrivate()
{
    var req = new PkImportRequest(
        Members: [new PkMemberEntry(
            Uuid: "pk-uuid-001", Name: "Shadow", DisplayName: null,
            Pronouns: null, Color: null, AvatarUrl: null,
            Description: null, Birthday: null,
            Privacy: new PkMemberPrivacy("private"))],
        IncludeAvatars: false);

    await _svc.ImportPkAsync(req);

    var member = await _context.Members.FirstAsync();
    Assert.Equal(MemberPrivacy.Private, member.PrivacyTier);
}

[Fact]
public async Task ImportPk_BlankUuid_AddsError()
{
    var req = new PkImportRequest(
        Members: [new PkMemberEntry(
            Uuid: null, Name: "Ember", DisplayName: null,
            Pronouns: null, Color: null, AvatarUrl: null,
            Description: null, Birthday: null, Privacy: null)],
        IncludeAvatars: false);

    var result = await _svc.ImportPkAsync(req);

    Assert.Single(result.Errors);
    Assert.Equal(0, result.Created);
}
```

Run: `dotnet test --filter ImportServiceTests_Pk -v minimal`
Expected: FAIL.

- [ ] **Step 2: Implement `ImportPkAsync`**

Replace `throw new NotImplementedException()` in `ImportService.cs`:

```csharp
public async Task<ImportResult> ImportPkAsync(PkImportRequest request, CancellationToken ct = default)
{
    int created = 0, updated = 0, skipped = 0, avatarsOk = 0, avatarsFail = 0;
    var errors = new List<ImportMemberError>();

    foreach (var entry in request.Members)
    {
        if (string.IsNullOrWhiteSpace(entry.Uuid))
        {
            errors.Add(new ImportMemberError("(no uuid)", entry.Name, "UUID is blank"));
            continue;
        }
        if (string.IsNullOrWhiteSpace(entry.Name))
        {
            errors.Add(new ImportMemberError(entry.Uuid, entry.Name, "Name is blank"));
            continue;
        }

        var existing = request.ConflictStrategy != ImportConflictStrategy.Duplicate
            ? await context.Members.IgnoreQueryFilters()
                .FirstOrDefaultAsync(m => m.PkId == entry.Uuid, ct)
            : null;

        if (existing != null && request.ConflictStrategy == ImportConflictStrategy.Skip)
        {
            skipped++;
            continue;
        }

        bool isNew = existing == null;
        Member member;

        if (isNew)
        {
            member = new Member { Name = entry.Name, PkId = entry.Uuid };
            context.Members.Add(member);
            created++;
        }
        else
        {
            member = existing!;
            updated++;
        }

        ApplyPkFields(member, entry, request.ConflictStrategy, isNew);

        if (request.IncludeAvatars && !string.IsNullOrWhiteSpace(entry.AvatarUrl))
        {
            var path = await avatars.DownloadAvatarAsync(entry.AvatarUrl, ct);
            if (path != null) { member.AvatarPath = path; avatarsOk++; }
            else avatarsFail++;
        }

        await context.SaveChangesAsync(ct);
    }

    return new ImportResult(created, updated, skipped, avatarsOk, avatarsFail, errors);
}

private static void ApplyPkFields(
    Member m, PkMemberEntry e, ImportConflictStrategy strategy, bool isNew)
{
    if (ShouldApply(m.Name, e.Name, strategy, isNew)) m.Name = e.Name!;
    if (ShouldApply(m.DisplayName, e.DisplayName, strategy, isNew)) m.DisplayName = e.DisplayName;
    if (ShouldApply(m.Pronouns, e.Pronouns, strategy, isNew)) m.Pronouns = e.Pronouns;
    if (ShouldApply(m.Color, NormalizeColor(e.Color), strategy, isNew)) m.Color = NormalizeColor(e.Color);
    if (ShouldApply(m.Description, e.Description, strategy, isNew)) m.Description = e.Description;
    if (ShouldApply(m.Birthday, e.Birthday, strategy, isNew)) m.Birthday = e.Birthday;

    var visibility = e.Privacy?.Visibility?.ToLowerInvariant();
    if (visibility == "private") m.PrivacyTier = MemberPrivacy.Private;
    else if (visibility == "public" && m.PrivacyTier == MemberPrivacy.Private)
        m.PrivacyTier = MemberPrivacy.Public;
}
```

- [ ] **Step 3: Run all import service tests**

```bash
dotnet test --filter ImportServiceTests -v minimal
```

Expected: 14/14 PASS.

- [ ] **Step 4: Run full suite**

```bash
dotnet test tests/PluralHost.Tests --no-build
```

Expected: 252/252 passing.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Services/ImportService.cs tests/PluralHost.Tests/Services/ImportServiceTests.cs
git commit -m "feat: ImportService PK import with all conflict strategies"
```

---

## Chunk 4: Controller + Wiring

### Task 7: Register services + `ImportController`

**Files:**
- Create: `src/PluralHost.Api/Controllers/ImportController.cs`
- Modify: `src/PluralHost.Api/Program.cs`
- Test: `tests/PluralHost.Tests/Controllers/ImportControllerTests.cs`

- [ ] **Step 1: Register services in `Program.cs`**

Add after existing service registrations:
```csharp
builder.Services.AddScoped<IImportService, ImportService>();
```

(`IAvatarDownloadService` was registered in Task 4.)

- [ ] **Step 2: Write failing controller tests**

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
    private readonly Mock<IImportService> _svc = new();
    private readonly ImportController _controller;

    public ImportControllerTests()
    {
        _controller = new ImportController(_svc.Object);
    }

    [Fact]
    public async Task ImportSp_ValidRequest_Returns200WithResult()
    {
        var expected = new ImportResult(5, 2, 1, 3, 0, []);
        _svc.Setup(s => s.ImportSpAsync(It.IsAny<SpImportRequest>(), default))
            .ReturnsAsync(expected);

        var result = await _controller.ImportSpAsync(new SpImportRequest([]));

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(expected, ok.Value);
    }

    [Fact]
    public async Task ImportPk_ValidRequest_Returns200WithResult()
    {
        var expected = new ImportResult(3, 0, 0, 2, 1, []);
        _svc.Setup(s => s.ImportPkAsync(It.IsAny<PkImportRequest>(), default))
            .ReturnsAsync(expected);

        var result = await _controller.ImportPkAsync(new PkImportRequest([]));

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.Equal(expected, ok.Value);
    }

    [Fact]
    public async Task ImportSp_EmptyMembers_Returns200ZeroCounts()
    {
        _svc.Setup(s => s.ImportSpAsync(It.IsAny<SpImportRequest>(), default))
            .ReturnsAsync(new ImportResult(0, 0, 0, 0, 0, []));

        var result = await _controller.ImportSpAsync(new SpImportRequest([]));

        var ok = Assert.IsType<OkObjectResult>(result);
        var importResult = Assert.IsType<ImportResult>(ok.Value);
        Assert.Equal(0, importResult.Created);
    }
}
```

Run: `dotnet test --filter ImportControllerTests -v minimal`
Expected: FAIL.

- [ ] **Step 3: Create `ImportController.cs`**

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/import")]
public class ImportController(IImportService importService) : ControllerBase
{
    [HttpPost("simply-plural")]
    public async Task<IActionResult> ImportSpAsync([FromBody] SpImportRequest request, CancellationToken ct = default)
    {
        var result = await importService.ImportSpAsync(request, ct);
        return Ok(result);
    }

    [HttpPost("plural-kit")]
    public async Task<IActionResult> ImportPkAsync([FromBody] PkImportRequest request, CancellationToken ct = default)
    {
        var result = await importService.ImportPkAsync(request, ct);
        return Ok(result);
    }
}
```

- [ ] **Step 4: Run controller tests**

```bash
dotnet test --filter ImportControllerTests -v minimal
```

Expected: 3/3 PASS.

- [ ] **Step 5: Run full suite**

```bash
dotnet test tests/PluralHost.Tests --no-build
```

Expected: 255/255 passing.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/ImportController.cs src/PluralHost.Api/Program.cs tests/PluralHost.Tests/Controllers/ImportControllerTests.cs
git commit -m "feat: ImportController POST /api/import/simply-plural and /plural-kit"
```

---

### Task 8: Update NativeDtos + SpDtos to expose PkId/Birthday in member responses

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs` (add `PkId`, `Birthday` to `MemberResponse`)
- Modify: `src/PluralHost.Api/Controllers/MembersController.cs` (include new fields in projection)

The SP API mirror (`SpMembersController`) already handles `SpMemberId` but should also return `PkId` for interop. Check the existing SP member response and add `pkId` if missing.

- [ ] **Step 1: Update `MemberResponse` in `NativeDtos.cs`**

Find the existing `MemberResponse` record and add `PkId` and `Birthday`:
```csharp
// Existing record — add the two new parameters
public record MemberResponse(..., string? PkId, string? Birthday);
```

- [ ] **Step 2: Update `MembersController` projection to include new fields**

In `MembersController`, wherever members are projected to `MemberResponse`, add `m.PkId` and `m.Birthday`.

- [ ] **Step 3: Run full test suite — fix any projection failures**

```bash
dotnet test tests/PluralHost.Tests --no-build
```

Expected: all tests pass (test failures here indicate a projection was missed).

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs src/PluralHost.Api/Controllers/MembersController.cs
git commit -m "feat: expose PkId and Birthday in member response DTOs"
```

---

## Final Check

- [ ] **Run complete test suite one last time**

```bash
dotnet test tests/PluralHost.Tests
```

Expected: all tests passing. Record final count in commit message.

- [ ] **Smoke test in Bruno** (optional but recommended)

1. Create a small SP-format JSON with 2-3 fake members.
2. `POST http://localhost:5179/api/import/simply-plural` with JWT auth.
3. Verify `GET /api/members` shows the imported members.
4. Re-run the import with `conflictStrategy: "skip"` — counts should show `skipped: 2` not `created: 2`.

- [ ] **Final commit**

```bash
git commit -m "docs: update CLAUDE.md for Plan 4 completion"
```
