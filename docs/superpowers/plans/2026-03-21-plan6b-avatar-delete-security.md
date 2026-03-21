# Plan 6b — Avatar Upload, Delete Member, Security Settings

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add avatar upload, member deletion with Gatekeeper PIN + 72h cooldown, and a Security settings section (PIN management + password change) to reach a demo-ready state.

**Architecture:** Four new backend endpoints (upload, delete member, PIN set/change, secure status) and three frontend feature areas (EssenceTab avatar, AccessTab danger zone, SettingsPage security). All endpoints are `[Authorize]`, use PIN in request body, and follow existing EF Core + soft-delete patterns. Frontend uses TanStack Query v5, the existing `BottomSheet` component, and CSS Modules.

**Tech Stack:** .NET 8 / ASP.NET Core, EF Core 8 / SQLite, BCrypt.Net-Next; React + Vite + TypeScript, TanStack Query v5, Vitest + Testing Library, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-03-21-plan6b-avatar-delete-security.md`

---

## Critical corrections from reading the actual code

- The backend and frontend both use **`AvatarPath`** (a filename string like `"uuid.jpg"`), not `AvatarId`. `types.ts` already has `avatarPath?: string` on `Member`. The upload endpoint returns `{ id: "uuid.jpg" }` and the PATCH uses `{ avatarPath: id }`.
- `POST /api/auth/change-password` takes `{ NewPassword, GatekeeperPin }` — it requires the **Gatekeeper PIN** to authorize the change, not the current login password. Returns 403 for wrong PIN.
- `IGatekeeperService` method names: `ValidatePinAsync(string pin)`, `IsPinSetAsync()`, `SetPinAsync(string pin)`.
- `MemberUpdateRequest` does **not** currently include `AvatarPath` — Task 0 adds it.
- `apiFetch` in `client.ts` must be checked before using it with multipart form data — it likely forces `Content-Type: application/json`. For file upload, use `fetch` directly or omit the Content-Type header.

---

## File Map

| File | Action |
|------|--------|
| `src/PluralHost.Api/Controllers/MediaController.cs` | Add `POST /api/media/upload` action |
| `src/PluralHost.Api/Controllers/MembersController.cs` | Add `AvatarPath` to update handler; add `DELETE /api/members/{id}`; add `IGatekeeperService` to constructor |
| `src/PluralHost.Api/Controllers/SecureActionController.cs` | Add `GET /api/secure/status` and `PUT /api/secure/pin` |
| `src/PluralHost.Api/Dto/NativeDtos.cs` | Add `UploadResponse`, `DeleteMemberRequest`, `SetPinRequest`, `SecureStatusResponse`; add `AvatarPath?` to `MemberUpdateRequest` |
| `tests/PluralHost.Tests/Controllers/MediaControllerTests.cs` | New — 4 upload tests |
| `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs` | Add `IGatekeeperService` mock to constructor; add 4 delete tests |
| `tests/PluralHost.Tests/Controllers/SecureActionControllerTests.cs` | Add 5 status + PIN tests |
| `src/PluralHost.Web/src/types.ts` | Add `avatarPath?` to `MemberUpdatePayload` |
| `src/PluralHost.Web/src/api/media.ts` | New — `mediaApi.upload` |
| `src/PluralHost.Web/src/api/secure.ts` | New — `secureApi.status`, `secureApi.setPin` |
| `src/PluralHost.Web/src/api/members.ts` | Add `delete` method |
| `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx` | Add avatar section + pencil button + upload flow |
| `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css` | Add avatar overlay styles |
| `src/PluralHost.Web/src/components/tabs/AccessTab.tsx` | Add Danger Zone section + delete sheet |
| `src/PluralHost.Web/src/components/tabs/AccessTab.module.css` | Add danger zone styles |
| `src/PluralHost.Web/src/pages/SettingsPage.tsx` | Add collapsible Security section |
| `src/PluralHost.Web/src/pages/SettingsPage.module.css` | Add collapsible section styles |
| `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx` | Add 2 avatar upload tests |
| `src/PluralHost.Web/src/__tests__/AccessTab.test.tsx` | Rewrite with 5 tests including delete + cooldown |
| `src/PluralHost.Web/src/__tests__/SettingsPage.test.tsx` | New — 4 security section tests |

---

## Task 0: Backend — AvatarPath in MemberUpdateRequest

**Context:** `MemberUpdateRequest` in `NativeDtos.cs` lacks `AvatarPath`. Add it and wire it in the PATCH handler so the avatar upload flow can link the file to a member.

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/MembersController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`

- [ ] **Step 1: Write failing test**

Add to `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs` (after the existing tests):

```csharp
[Fact]
public async Task Update_AvatarPath_PersistsValue()
{
    var m = new Member { Name = "Ash" };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();

    var result = await _controller.UpdateAsync(m.Id,
        new MemberUpdateRequest(AvatarPath: "abc123.jpg")) as OkObjectResult;
    var response = result!.Value as MemberResponse;
    Assert.Equal("abc123.jpg", response!.AvatarPath);
}
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd C:/dev/simply-personal
dotnet test tests/PluralHost.Tests --filter "Update_AvatarPath_PersistsValue" -v minimal
```

Expected: FAIL — `AvatarPath` not a parameter on `MemberUpdateRequest`.

- [ ] **Step 3: Add `AvatarPath?` to `MemberUpdateRequest` in NativeDtos.cs**

Read `src/PluralHost.Api/Dto/NativeDtos.cs` first. Find the `MemberUpdateRequest` record. **Do NOT replace it wholesale** — only append `string? AvatarPath = null` as the final parameter, after `List<Guid>? ParentIds = null`:

```csharp
    List<Guid>? ParentIds = null, string? AvatarPath = null);
```

The record may have parameters not shown here that were added after this plan was written. Append; do not replace.

- [ ] **Step 4: Handle AvatarPath in MembersController.UpdateAsync**

In `src/PluralHost.Api/Controllers/MembersController.cs`, in `UpdateAsync`, add after the final `if (body.ParentIds is not null)` block:

```csharp
if (body.AvatarPath is not null)   member.AvatarPath = body.AvatarPath;
```

- [ ] **Step 5: Run test — expect pass**

```bash
dotnet test tests/PluralHost.Tests --filter "Update_AvatarPath_PersistsValue" -v minimal
```

- [ ] **Step 6: Run all tests — confirm no regressions**

```bash
dotnet test tests/PluralHost.Tests -v minimal
```

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs \
        src/PluralHost.Api/Controllers/MembersController.cs \
        tests/PluralHost.Tests/Controllers/MembersControllerTests.cs
git commit -m "feat: add AvatarPath to MemberUpdateRequest + PATCH handler"
```

---

## Task 1: Backend — POST /api/media/upload

**Context:** `MediaController.cs` already has `GET /api/media/{id}`. Add `POST /api/media/upload`. The controller needs to accept an injectable upload directory for testability (use a constructor parameter with a default).

**Files:**
- Modify: `src/PluralHost.Api/Controllers/MediaController.cs`
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Create: `tests/PluralHost.Tests/Controllers/MediaControllerTests.cs`

- [ ] **Step 1: Add `UploadResponse` to NativeDtos.cs**

```csharp
public record UploadResponse(string Id);
```

- [ ] **Step 2: Write failing tests**

Create `tests/PluralHost.Tests/Controllers/MediaControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using PluralHost.Api.Controllers;
using PluralHost.Api.Dto;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MediaControllerTests : IDisposable
{
    private readonly string _uploadDir;
    private readonly MediaController _controller;

    public MediaControllerTests()
    {
        _uploadDir = Path.Combine(Path.GetTempPath(), "ph-test-" + Guid.NewGuid());
        Directory.CreateDirectory(_uploadDir);
        _controller = new MediaController(_uploadDir);
    }

    public void Dispose() => Directory.Delete(_uploadDir, recursive: true);

    private static IFormFile MakeFile(byte[] content, string filename, string contentType)
    {
        var stream = new MemoryStream(content);
        return new FormFile(stream, 0, content.Length, "file", filename)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType,
        };
    }

    [Fact]
    public async Task Upload_ValidJpeg_Returns200WithId()
    {
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10 };
        var file = MakeFile(bytes, "photo.jpg", "image/jpeg");

        var result = await _controller.UploadAsync(file) as OkObjectResult;
        var response = result!.Value as UploadResponse;
        Assert.NotNull(response);
        Assert.EndsWith(".jpg", response!.Id);
        Assert.True(File.Exists(Path.Combine(_uploadDir, response.Id)));
    }

    [Fact]
    public async Task Upload_FileTooLarge_Returns413()
    {
        var bytes = new byte[6 * 1024 * 1024];
        var file = MakeFile(bytes, "big.jpg", "image/jpeg");

        var result = await _controller.UploadAsync(file);
        Assert.IsType<ObjectResult>(result);
        Assert.Equal(413, ((ObjectResult)result).StatusCode);
    }

    [Fact]
    public async Task Upload_DisallowedExtension_Returns400()
    {
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF };
        var file = MakeFile(bytes, "script.exe", "application/octet-stream");

        var result = await _controller.UploadAsync(file);
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Upload_MagicBytesMismatch_Returns400()
    {
        var bytes = new byte[] { 0xFF, 0xD8, 0xFF }; // JPEG bytes
        var file = MakeFile(bytes, "photo.png", "image/png"); // but .png extension

        var result = await _controller.UploadAsync(file);
        Assert.IsType<BadRequestObjectResult>(result);
    }
}
```

- [ ] **Step 3: Run tests — expect failure**

```bash
dotnet test tests/PluralHost.Tests --filter "MediaControllerTests" -v minimal
```

Expected: FAIL — `UploadAsync` not found; constructor mismatch.

- [ ] **Step 4: Implement UploadAsync in MediaController.cs**

Read the existing `MediaController.cs` first. Then replace the entire file with the following (preserving existing `GET` logic):

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("api/media")]
[Authorize]
public class MediaController : ControllerBase
{
    private readonly string _uploadDir;
    private const long MaxFileSizeBytes = 5 * 1024 * 1024;
    private static readonly HashSet<string> AllowedExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".png", ".gif", ".webp" };

    public MediaController(string? uploadDir = null)
    {
        _uploadDir = uploadDir ?? Path.Combine(Directory.GetCurrentDirectory(), "secure_uploads");
    }

    // GET /api/media/{id}
    [HttpGet("{id}")]
    public IActionResult GetFile(string id)
    {
        var safeName = Path.GetFileName(id);
        var filePath = Path.Combine(_uploadDir, safeName);
        if (!System.IO.File.Exists(filePath))
            return NotFound();

        var ext = Path.GetExtension(safeName).ToLowerInvariant();
        var contentType = ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png"            => "image/png",
            ".gif"            => "image/gif",
            ".webp"           => "image/webp",
            _                 => "application/octet-stream",
        };
        return PhysicalFile(filePath, contentType, safeName);
    }

    // POST /api/media/upload
    [HttpPost("upload")]
    public async Task<IActionResult> UploadAsync(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided." });

        if (file.Length > MaxFileSizeBytes)
            return StatusCode(413, new { error = "File exceeds 5 MB limit." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(ext))
            return BadRequest(new { error = $"Extension '{ext}' is not allowed." });

        var header = new byte[12];
        using (var stream = file.OpenReadStream())
        {
            var read = await stream.ReadAsync(header.AsMemory(0, 12));
            if (read < 3)
                return BadRequest(new { error = "File too small to validate." });
        }

        if (!IsValidMagicBytes(ext, header))
            return BadRequest(new { error = "File content does not match its extension." });

        var savedName = $"{Guid.NewGuid()}{ext}";
        var savePath = Path.Combine(_uploadDir, savedName);
        Directory.CreateDirectory(_uploadDir);

        using (var dest = System.IO.File.Create(savePath))
        {
            file.OpenReadStream().Seek(0, SeekOrigin.Begin);
            await file.CopyToAsync(dest);
        }

        return Ok(new UploadResponse(savedName));
    }

    private static bool IsValidMagicBytes(string ext, byte[] h) => ext switch
    {
        ".jpg" or ".jpeg" => h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF,
        ".png"  => h[0] == 0x89 && h[1] == 0x50 && h[2] == 0x4E && h[3] == 0x47,
        ".gif"  => h[0] == 0x47 && h[1] == 0x49 && h[2] == 0x46 && h[3] == 0x38
                   && (h[4] == 0x37 || h[4] == 0x39) && h[5] == 0x61,
        ".webp" => h[0] == 0x52 && h[1] == 0x49 && h[2] == 0x46 && h[3] == 0x46
                   && h[8] == 0x57 && h[9] == 0x45 && h[10] == 0x42 && h[11] == 0x50,
        _ => false,
    };
}
```

- [ ] **Step 5: Run MediaController tests — expect 4/4 pass**

```bash
dotnet test tests/PluralHost.Tests --filter "MediaControllerTests" -v minimal
```

- [ ] **Step 6: Run all tests**

```bash
dotnet test tests/PluralHost.Tests -v minimal
```

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Controllers/MediaController.cs \
        src/PluralHost.Api/Dto/NativeDtos.cs \
        tests/PluralHost.Tests/Controllers/MediaControllerTests.cs
git commit -m "feat: POST /api/media/upload — image upload with magic byte validation"
```

---

## Task 2: Backend — DELETE /api/members/{id}

**Context:** Soft-deletes a member after PIN verification. Checks the system-wide 72h cooldown on `SystemSettings.DeletionCooldownEnd`. `MembersController` currently uses primary constructor syntax with `(PluralHostContext context, IMemberService memberService)` — extend it to include `IGatekeeperService gatekeeper`.

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/MembersController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`

- [ ] **Step 1: Add `DeleteMemberRequest` to NativeDtos.cs**

```csharp
public record DeleteMemberRequest(string Pin);
```

- [ ] **Step 2: Write failing tests**

In `MembersControllerTests.cs`, add a `Mock<IGatekeeperService> _gatekeeper` field. Update the constructor to create it and pass it to the controller:

```csharp
private readonly Mock<IGatekeeperService> _gatekeeper;

// In MembersControllerTests() constructor, add:
_gatekeeper = new Mock<IGatekeeperService>();
_controller = new MembersController(_context, _memberService.Object, _gatekeeper.Object);
```

Add using: `using Microsoft.EntityFrameworkCore;` (if not present).

Add the four new tests:

```csharp
[Fact]
public async Task Delete_ValidPin_SoftDeletesMember()
{
    var m = new Member { Name = "Ash" };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();
    _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);

    var result = await _controller.DeleteAsync(m.Id, new DeleteMemberRequest("1234"));

    Assert.IsType<NoContentResult>(result);
    var row = await _context.Members.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == m.Id);
    Assert.NotNull(row!.DeletedAt);
}

[Fact]
public async Task Delete_InvalidPin_Returns403()
{
    var m = new Member { Name = "Ash" };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();
    _gatekeeper.Setup(g => g.ValidatePinAsync(It.IsAny<string>())).ReturnsAsync(false);

    var result = await _controller.DeleteAsync(m.Id, new DeleteMemberRequest("wrong"));
    var obj = Assert.IsType<ObjectResult>(result);
    Assert.Equal(403, obj.StatusCode);
}

[Fact]
public async Task Delete_CooldownActive_Returns409()
{
    var m = new Member { Name = "Ash" };
    _context.Members.Add(m);
    var settings = await _context.SystemSettings.FirstAsync();
    settings.DeletionCooldownEnd = DateTime.UtcNow.AddHours(48);
    await _context.SaveChangesAsync();
    _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);

    var result = await _controller.DeleteAsync(m.Id, new DeleteMemberRequest("1234"));
    var obj = Assert.IsType<ObjectResult>(result);
    Assert.Equal(409, obj.StatusCode);
}

[Fact]
public async Task Delete_NotFound_Returns404()
{
    _gatekeeper.Setup(g => g.ValidatePinAsync("1234")).ReturnsAsync(true);

    var result = await _controller.DeleteAsync(Guid.NewGuid(), new DeleteMemberRequest("1234"));
    Assert.IsType<NotFoundResult>(result);
}
```

- [ ] **Step 3: Run tests — expect failure**

```bash
dotnet test tests/PluralHost.Tests --filter "MembersControllerTests" -v minimal
```

Expected: FAIL — constructor mismatch, `DeleteAsync` missing.

- [ ] **Step 4: Add `IGatekeeperService` to MembersController and implement DeleteAsync**

In `src/PluralHost.Api/Controllers/MembersController.cs`:

1. Add `IGatekeeperService gatekeeper` to the primary constructor.
2. Add the delete action:

```csharp
[HttpDelete("{id:guid}")]
public async Task<IActionResult> DeleteAsync(Guid id, [FromBody] DeleteMemberRequest body)
{
    var member = await context.Members.FirstOrDefaultAsync(m => m.Id == id);
    if (member == null)
        return NotFound();

    if (!await gatekeeper.ValidatePinAsync(body.Pin))
        return StatusCode(403, new { error = "Invalid Gatekeeper PIN." });

    var settings = await context.SystemSettings.FirstAsync();
    if (settings.DeletionCooldownEnd.HasValue && settings.DeletionCooldownEnd.Value > DateTime.UtcNow)
        return StatusCode(409, new { cooldownEnd = settings.DeletionCooldownEnd.Value });

    member.SoftDelete();
    settings.DeletionCooldownEnd = DateTime.UtcNow.AddHours(72);
    await context.SaveChangesAsync();

    return NoContent();
}
```

Also verify `IGatekeeperService` is registered in `Program.cs`. If not, add `builder.Services.AddScoped<IGatekeeperService, GatekeeperService>();`.

- [ ] **Step 5: Run MembersController tests — expect 8/8 pass**

```bash
dotnet test tests/PluralHost.Tests --filter "MembersControllerTests" -v minimal
```

- [ ] **Step 6: Run all tests**

```bash
dotnet test tests/PluralHost.Tests -v minimal
```

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs \
        src/PluralHost.Api/Controllers/MembersController.cs \
        tests/PluralHost.Tests/Controllers/MembersControllerTests.cs
git commit -m "feat: DELETE /api/members/{id} — soft-delete with PIN gate + 72h cooldown"
```

---

## Task 3: Backend — GET /api/secure/status + PUT /api/secure/pin

**Context:** `SecureActionController` already has `gatekeeper` in scope. `IGatekeeperService` already has `IsPinSetAsync` and `SetPinAsync`. Add two new actions. The `[FromServices]` pattern for `PluralHostContext` is already used in the file — follow it.

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/SecureActionController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/SecureActionControllerTests.cs`

- [ ] **Step 1: Add DTOs to NativeDtos.cs**

```csharp
public record SetPinRequest(string? CurrentPin, string NewPin);
public record SecureStatusResponse(bool PinIsSet, DateTime? DeletionCooldownEnd);
```

- [ ] **Step 2: Write failing tests**

The existing `SecureActionControllerTests` uses `_ghostMock` and `_gatekeeperMock` fields and a `CreateController()` factory — there is no stored `_controller` field and no `_context` field. Match that pattern exactly. `GetStatusAsync` takes `[FromServices] PluralHostContext? context` — pass an EF InMemory context inline.

Add the following using directives at the top of the file if not present:
```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Dto;
```

Add a private helper to create an InMemory context with the seeded SystemSettings row:
```csharp
private static async Task<PluralHostContext> MakeContextAsync()
{
    var opts = new DbContextOptionsBuilder<PluralHostContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options;
    var ctx = new PluralHostContext(opts);
    await ctx.Database.EnsureCreatedAsync();
    return ctx;
}
```

Add the five new tests:

```csharp
[Fact]
public async Task GetStatus_ReturnsPinFlagAndCooldown()
{
    _gatekeeperMock.Setup(g => g.IsPinSetAsync()).ReturnsAsync(true);
    var ctx = await MakeContextAsync();
    var settings = await ctx.SystemSettings.FirstAsync();
    settings.DeletionCooldownEnd = new DateTime(2026, 4, 1, 0, 0, 0, DateTimeKind.Utc);
    await ctx.SaveChangesAsync();

    var controller = CreateController();
    var result = await controller.GetStatusAsync(ctx) as OkObjectResult;
    var response = result!.Value as SecureStatusResponse;
    Assert.True(response!.PinIsSet);
    Assert.Equal(new DateTime(2026, 4, 1, 0, 0, 0, DateTimeKind.Utc), response.DeletionCooldownEnd);
}

[Fact]
public async Task SetPin_FirstTime_SetsPin()
{
    _gatekeeperMock.Setup(g => g.IsPinSetAsync()).ReturnsAsync(false);
    _gatekeeperMock.Setup(g => g.SetPinAsync("5678")).Returns(Task.CompletedTask);

    var controller = CreateController();
    var result = await controller.SetPinAsync(new SetPinRequest(null, "5678"));
    Assert.IsType<NoContentResult>(result);
    _gatekeeperMock.Verify(g => g.SetPinAsync("5678"), Times.Once);
}

[Fact]
public async Task SetPin_ChangePin_CorrectCurrentPin_Succeeds()
{
    _gatekeeperMock.Setup(g => g.IsPinSetAsync()).ReturnsAsync(true);
    _gatekeeperMock.Setup(g => g.ValidatePinAsync("old")).ReturnsAsync(true);
    _gatekeeperMock.Setup(g => g.SetPinAsync("new1")).Returns(Task.CompletedTask);

    var controller = CreateController();
    var result = await controller.SetPinAsync(new SetPinRequest("old", "new1"));
    Assert.IsType<NoContentResult>(result);
}

[Fact]
public async Task SetPin_ChangePin_WrongCurrentPin_Returns403()
{
    _gatekeeperMock.Setup(g => g.IsPinSetAsync()).ReturnsAsync(true);
    _gatekeeperMock.Setup(g => g.ValidatePinAsync("wrong")).ReturnsAsync(false);

    var controller = CreateController();
    var result = await controller.SetPinAsync(new SetPinRequest("wrong", "newpin"));
    var obj = Assert.IsType<ObjectResult>(result);
    Assert.Equal(403, obj.StatusCode);
}

[Fact]
public async Task SetPin_MissingCurrentPin_WhenPinSet_Returns400()
{
    _gatekeeperMock.Setup(g => g.IsPinSetAsync()).ReturnsAsync(true);

    var controller = CreateController();
    var result = await controller.SetPinAsync(new SetPinRequest(null, "newpin"));
    Assert.IsType<BadRequestObjectResult>(result);
}
```

- [ ] **Step 3: Run tests — expect failure**

```bash
dotnet test tests/PluralHost.Tests --filter "SecureActionControllerTests" -v minimal
```

- [ ] **Step 4: Implement in SecureActionController.cs**

Add after the existing actions:

```csharp
// GET /api/secure/status
[HttpGet("status")]
public async Task<IActionResult> GetStatusAsync(
    [FromServices] PluralHostContext? context = null)
{
    if (context == null)
        return BadRequest(new { error = "Context unavailable." });

    var pinIsSet = await gatekeeper.IsPinSetAsync();
    var settings = await context.SystemSettings.FirstAsync();
    DateTime? cooldownEnd = null;
    if (settings.DeletionCooldownEnd.HasValue
        && settings.DeletionCooldownEnd.Value > DateTime.UtcNow)
        cooldownEnd = settings.DeletionCooldownEnd;

    return Ok(new SecureStatusResponse(pinIsSet, cooldownEnd));
}

// PUT /api/secure/pin
[HttpPut("pin")]
public async Task<IActionResult> SetPinAsync([FromBody] SetPinRequest request)
{
    if (string.IsNullOrWhiteSpace(request.NewPin)
        || request.NewPin.Length < 4 || request.NewPin.Length > 64)
        return BadRequest(new { error = "PIN must be between 4 and 64 characters." });

    var pinIsSet = await gatekeeper.IsPinSetAsync();
    if (pinIsSet)
    {
        if (string.IsNullOrEmpty(request.CurrentPin))
            return BadRequest(new { error = "Current PIN is required to change the PIN." });
        if (!await gatekeeper.ValidatePinAsync(request.CurrentPin))
            return StatusCode(403, new { error = "Invalid current Gatekeeper PIN." });
    }

    await gatekeeper.SetPinAsync(request.NewPin);
    return NoContent();
}
```

- [ ] **Step 5: Run SecureActionController tests — expect all pass**

```bash
dotnet test tests/PluralHost.Tests --filter "SecureActionControllerTests" -v minimal
```

- [ ] **Step 6: Run all tests**

```bash
dotnet test tests/PluralHost.Tests -v minimal
```

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs \
        src/PluralHost.Api/Controllers/SecureActionController.cs \
        tests/PluralHost.Tests/Controllers/SecureActionControllerTests.cs
git commit -m "feat: GET /api/secure/status + PUT /api/secure/pin"
```

---

## Task 4: Frontend — API modules + types.ts

**Context:** Two new API modules and small updates to `types.ts` and `members.ts`. No component changes yet.

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`
- Create: `src/PluralHost.Web/src/api/media.ts`
- Create: `src/PluralHost.Web/src/api/secure.ts`
- Modify: `src/PluralHost.Web/src/api/members.ts`

- [ ] **Step 1: Add `avatarPath?` to `MemberUpdatePayload` in types.ts**

In `MemberUpdatePayload`, add:

```typescript
  avatarPath?: string
```

- [ ] **Step 2: Add `delete` to members.ts**

In `src/PluralHost.Web/src/api/members.ts`, add to the `membersApi` object:

```typescript
  delete: (id: string, pin: string) =>
    apiFetch<void>(`/api/members/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    }),
```

- [ ] **Step 3: Create media.ts**

Read `src/PluralHost.Web/src/api/client.ts` first to understand how `apiFetch` works. If it always sets `Content-Type: application/json`, use raw `fetch` for the upload call. Otherwise use `apiFetch`.

Create `src/PluralHost.Web/src/api/media.ts`:

```typescript
// Note: do NOT set Content-Type for multipart — the browser sets it with boundary
export const mediaApi = {
  upload: async (file: File): Promise<{ id: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
    if (!res.ok) throw res
    return res.json()
  },
}
```

- [ ] **Step 4: Create secure.ts**

Create `src/PluralHost.Web/src/api/secure.ts`:

```typescript
import { apiFetch } from './client'

export interface SecureStatus {
  pinIsSet: boolean
  deletionCooldownEnd: string | null
}

export const secureApi = {
  status: (): Promise<SecureStatus> =>
    apiFetch<SecureStatus>('/api/secure/status'),

  setPin: (body: { currentPin?: string; newPin: string }): Promise<void> =>
    apiFetch<void>('/api/secure/pin', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
}
```

- [ ] **Step 5: Run frontend tests — confirm no regressions**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/types.ts \
        src/PluralHost.Web/src/api/media.ts \
        src/PluralHost.Web/src/api/secure.ts \
        src/PluralHost.Web/src/api/members.ts
git commit -m "feat: media + secure API modules; avatarPath + delete in members API"
```

---

## Task 5: Frontend — EssenceTab avatar upload

**Context:** EssenceTab currently has no avatar section. Add one at the top with a pencil button. Check `src/PluralHost.Web/src/components/Avatar.tsx` to understand its props before wiring it — if it accepts `{ avatarPath?, name, color? }`, use it; otherwise render a simple circle directly as shown below.

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css`
- Modify: `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx`, add at top of the file (after existing mocks):

```typescript
vi.mock('../api/media', () => ({
  mediaApi: { upload: vi.fn().mockResolvedValue({ id: 'new-avatar.jpg' }) },
}))
```

Add tests to the `describe` block:

```typescript
it('renders pencil button for avatar upload', () => {
  wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
  expect(screen.getByLabelText(/change avatar/i)).toBeInTheDocument()
})

it('has hidden file input for avatar selection', () => {
  const { container } = wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
  const input = container.querySelector('input[type="file"]')
  expect(input).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests — expect 2 failures**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

- [ ] **Step 3: Add avatar section to EssenceTab.tsx**

At the top of the file, replace `import { useState }` with:

```typescript
import { useRef, useState } from 'react'
import { mediaApi } from '../../api/media'
```

Add inside `EssenceTab` component, after the `updateMutation` declaration:

```typescript
const fileInputRef = useRef<HTMLInputElement>(null)
const [uploading, setUploading] = useState(false)
const [uploadError, setUploadError] = useState<string | null>(null)

const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  const previousAvatarPath = member.avatarPath ?? null
  setUploading(true)
  setUploadError(null)
  try {
    const { id } = await mediaApi.upload(file)
    await membersApi.update(member.id, { avatarPath: id })
    qc.invalidateQueries({ queryKey: ['member', member.id] })
  } catch {
    // Revert to previous avatar on failure (spec requirement)
    await membersApi.update(member.id, { avatarPath: previousAvatarPath ?? undefined }).catch(() => {})
    setUploadError('Upload failed. Please try again.')
  } finally {
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
}
```

Add at the top of the returned JSX, before the first `<EditableField>`:

```tsx
<div className={styles.avatarSection}>
  <div className={styles.avatarWrap}>
    <div
      className={styles.avatarCircle}
      style={{ background: member.color ?? '#555' }}
    >
      {member.avatarPath
        ? <img src={`/api/media/${member.avatarPath}`} alt={member.name} className={styles.avatarImg} />
        : <span className={styles.avatarInitial}>{member.name[0]?.toUpperCase()}</span>
      }
    </div>
    {uploading && <div className={styles.avatarSpinner} aria-label="Uploading…" />}
    <button
      className={styles.avatarPencil}
      onClick={() => fileInputRef.current?.click()}
      aria-label="Change avatar"
      disabled={uploading}
      type="button"
    >
      ✏
    </button>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className={styles.avatarInput}
      onChange={handleFileChange}
      aria-hidden="true"
    />
  </div>
  {uploadError && <p className={styles.uploadError} role="alert">{uploadError}</p>}
</div>
```

- [ ] **Step 4: Add avatar styles to EssenceTab.module.css**

Append to the end of the file:

```css
.avatarSection {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0 8px;
  gap: 8px;
}

.avatarWrap {
  position: relative;
  width: 80px;
  height: 80px;
}

.avatarCircle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.avatarImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatarInitial {
  font-size: 1.8rem;
  font-weight: 700;
  color: #fff;
}

.avatarPencil {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-bg);
  border: 2px solid var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0;
}

.avatarPencil:disabled { opacity: 0.5; cursor: not-allowed; }

.avatarSpinner {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0,0,0,0.4);
}

.avatarInput { display: none; }

.uploadError {
  font-size: 0.8rem;
  color: var(--color-danger, #f87171);
  text-align: center;
  margin: 0;
}
```

- [ ] **Step 5: Run frontend tests — expect all pass**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/EssenceTab.tsx \
        src/PluralHost.Web/src/components/tabs/EssenceTab.module.css \
        src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx
git commit -m "feat: EssenceTab — avatar display + pencil upload button"
```

---

## Task 6: Frontend — AccessTab Danger Zone

**Context:** AccessTab currently has privacy + toggles. Add a Danger Zone at the bottom. On mount, query `GET /api/secure/status` for `deletionCooldownEnd`. Use the existing `BottomSheet` for the PIN confirmation flow.

**Before writing any code:** Read `src/PluralHost.Web/src/api/client.ts` and confirm whether `apiFetch` throws the raw `Response` object or an `Error` on non-2xx responses. The `onError` handler in the plan uses `err instanceof Response` — if `apiFetch` throws an `Error` instead, adjust the handler to extract status from the `Error`. The implementation below assumes `apiFetch` throws a raw `Response` (which is the existing pattern) but wraps it defensively.

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/AccessTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/AccessTab.module.css`
- Modify: `src/PluralHost.Web/src/__tests__/AccessTab.test.tsx`

- [ ] **Step 1: Write failing tests**

Replace the contents of `src/PluralHost.Web/src/__tests__/AccessTab.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AccessTab from '../components/tabs/AccessTab'
import type { Member } from '../types'

vi.mock('../api/members', () => ({
  membersApi: { update: vi.fn(), delete: vi.fn() },
}))
vi.mock('../api/secure', () => ({
  secureApi: {
    status: vi.fn().mockResolvedValue({ pinIsSet: true, deletionCooldownEnd: null }),
  },
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const mockMember: Member = {
  id: 'm1', name: 'Aria', privacyTier: 'Public',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('AccessTab', () => {
  it('renders privacy tier selector', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getByText(/privacy/i)).toBeInTheDocument()
  })

  it('renders toggle switches', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
  })

  it('renders delete button when no cooldown active', async () => {
    wrap(<AccessTab member={mockMember} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /delete aria/i })).toBeInTheDocument()
    )
  })

  it('opens delete sheet when delete button clicked', async () => {
    wrap(<AccessTab member={mockMember} />)
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /delete aria/i })))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows cooldown message when cooldown is active', async () => {
    const { secureApi } = await import('../api/secure')
    vi.mocked(secureApi.status).mockResolvedValueOnce({
      pinIsSet: true,
      deletionCooldownEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    })
    wrap(<AccessTab member={mockMember} />)
    await waitFor(() =>
      expect(screen.getByText(/deletion available/i)).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run tests — expect failures on new tests**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

- [ ] **Step 3: Implement AccessTab.tsx with Danger Zone**

Full replacement for `src/PluralHost.Web/src/components/tabs/AccessTab.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { membersApi } from '../../api/members'
import { secureApi } from '../../api/secure'
import BottomSheet from '../BottomSheet'
import type { Member, MemberUpdatePayload } from '../../types'
import styles from './AccessTab.module.css'

interface Props { member: Member }

const PRIVACY_TIERS = ['Public', 'Friend', 'Trusted', 'Private'] as const

export default function AccessTab({ member }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [cooldownEnd, setCooldownEnd] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    secureApi.status().then(s => {
      if (s.deletionCooldownEnd) {
        const end = new Date(s.deletionCooldownEnd)
        if (end > new Date()) setCooldownEnd(end)
      }
    })
  }, [member.id])

  useEffect(() => {
    if (!cooldownEnd) return
    intervalRef.current = setInterval(() => {
      if (new Date() >= cooldownEnd) {
        setCooldownEnd(null)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [cooldownEnd])

  const updateMutation = useMutation({
    mutationFn: (payload: MemberUpdatePayload) => membersApi.update(member.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (p: string) => membersApi.delete(member.id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      navigate('/members')
    },
    onError: async (err: unknown) => {
      // apiFetch throws the raw Response on non-2xx (confirmed in client.ts).
      // Be defensive in case a network Error is thrown instead.
      const res = err instanceof Response ? err : null
      const status = res?.status
      if (status === 403) {
        setDeleteError('Incorrect PIN.')
      } else if (status === 409) {
        try {
          const body = await res!.clone().json()
          setCooldownEnd(new Date(body.cooldownEnd))
        } catch { /* ignore */ }
        setDeleteOpen(false)
      } else {
        setDeleteError('Something went wrong. Please try again.')
      }
    },
  })

  const formatCooldown = (end: Date): string => {
    const ms = end.getTime() - Date.now()
    const hours = Math.floor(ms / 3_600_000)
    const mins = Math.floor((ms % 3_600_000) / 60_000)
    return `${hours}h ${mins}m`
  }

  return (
    <div className={styles.tab} role="tabpanel">
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Privacy</span>
        <div className={styles.segmented} role="group" aria-label="Privacy tier">
          {PRIVACY_TIERS.map(tier => (
            <button
              key={tier}
              className={[styles.segBtn, member.privacyTier === tier && styles.segActive].filter(Boolean).join(' ')}
              onClick={() => updateMutation.mutate({ privacyTier: tier })}
              aria-pressed={member.privacyTier === tier}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Archived</span>
        <input type="checkbox" checked={member.isArchived}
          onChange={() => updateMutation.mutate({ isArchived: !member.isArchived })} aria-label="Archived" />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Pinned</span>
        <input type="checkbox" checked={member.isPinned}
          onChange={() => updateMutation.mutate({ isPinned: !member.isPinned })} aria-label="Pinned" />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Prevent front notifications</span>
        <input type="checkbox" checked={member.preventFrontNotification}
          onChange={() => updateMutation.mutate({ preventFrontNotification: !member.preventFrontNotification })}
          aria-label="Prevent front notifications" />
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Receive board notifications</span>
        <input type="checkbox" checked={member.receiveBoardNotifications}
          onChange={() => updateMutation.mutate({ receiveBoardNotifications: !member.receiveBoardNotifications })}
          aria-label="Receive board notifications" />
      </div>

      <div className={styles.dangerZone}>
        <span className={styles.dangerLabel}>Danger Zone</span>
        {cooldownEnd ? (
          <p className={styles.cooldownMsg}>
            Deletion available in {formatCooldown(cooldownEnd)}
          </p>
        ) : (
          <button
            className={styles.deleteBtn}
            onClick={() => { setDeleteError(null); setPin(''); setDeleteOpen(true) }}
            type="button"
            aria-label={`Delete ${member.name}`}
          >
            Delete {member.name}
          </button>
        )}
      </div>

      <BottomSheet
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete member"
      >
        <p className={styles.deleteWarning}>
          This will remove {member.name} from your system. This action requires your Gatekeeper PIN.
        </p>
        <input
          type="password"
          className={styles.pinInput}
          placeholder="Gatekeeper PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          aria-label="Gatekeeper PIN"
          autoComplete="off"
        />
        {deleteError && <p className={styles.deleteError} role="alert">{deleteError}</p>}
        <button
          className={styles.confirmDeleteBtn}
          onClick={() => deleteMutation.mutate(pin)}
          disabled={deleteMutation.isPending || !pin}
          type="button"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
        </button>
      </BottomSheet>
    </div>
  )
}
```

- [ ] **Step 4: Add Danger Zone styles to AccessTab.module.css**

Append to the end of the file:

```css
.dangerZone {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--color-danger, #f87171);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dangerLabel {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-danger, #f87171);
}

.deleteBtn {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-danger, #f87171);
  background: transparent;
  color: var(--color-danger, #f87171);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  min-height: var(--touch-min);
  text-align: left;
}

.cooldownMsg {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin: 0;
}

.deleteWarning {
  font-size: 0.9rem;
  color: var(--color-text);
  margin: 0 0 16px;
}

.pinInput {
  background: var(--color-bg);
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--color-text);
  font-size: 0.95rem;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 12px;
}

.deleteError {
  font-size: 0.85rem;
  color: var(--color-danger, #f87171);
  margin: 0 0 12px;
}

.confirmDeleteBtn {
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: none;
  background: var(--color-danger, #f87171);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  min-height: var(--touch-min);
}

.confirmDeleteBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Run frontend tests — expect all pass**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/AccessTab.tsx \
        src/PluralHost.Web/src/components/tabs/AccessTab.module.css \
        src/PluralHost.Web/src/__tests__/AccessTab.test.tsx
git commit -m "feat: AccessTab — danger zone, delete member with PIN gate + cooldown"
```

---

## Task 7: Frontend — SettingsPage Security Section

**Context:** SettingsPage currently has an Account section (logout) and a "coming soon" stub. Replace the stub with a collapsible Security section. **API correction:** `POST /api/auth/change-password` takes `{ NewPassword, GatekeeperPin }` — the form uses the Gatekeeper PIN to authorize the password change, not the current login password.

**Before writing any code:** Read `src/PluralHost.Api/Controllers/AuthController.cs` and confirm the exact HTTP status code returned when the Gatekeeper PIN is wrong. The plan wires a 403 error handler — if the endpoint returns 400 instead, change the catch branch to `status === 400`. The implementation below uses 403 based on the established pattern, but this must be verified.

**Files:**
- Modify: `src/PluralHost.Web/src/pages/SettingsPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/SettingsPage.module.css`
- Create: `src/PluralHost.Web/src/__tests__/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/PluralHost.Web/src/__tests__/SettingsPage.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SettingsPage from '../pages/SettingsPage'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}))
vi.mock('../api/secure', () => ({
  secureApi: {
    status: vi.fn().mockResolvedValue({ pinIsSet: false, deletionCooldownEnd: null }),
    setPin: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('SettingsPage', () => {
  it('renders Security section toggle button', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument()
  })

  it('Security section is collapsed by default', () => {
    render(<SettingsPage />)
    expect(
      screen.getByRole('button', { name: /security/i })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands Security section on click', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /security/i }))
    expect(
      screen.getByRole('button', { name: /security/i })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows Change Password and Gatekeeper PIN headings when expanded', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /security/i }))
    expect(screen.getByText(/change password/i)).toBeInTheDocument()
    expect(screen.getByText(/gatekeeper pin/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect 3-4 failures**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

- [ ] **Step 3: Implement SettingsPage.tsx**

Full replacement for `src/PluralHost.Web/src/pages/SettingsPage.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { secureApi } from '../api/secure'
import { apiFetch } from '../api/client'
import styles from './SettingsPage.module.css'

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className={styles.section}>
      <button
        className={styles.sectionToggle}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={title}
        type="button"
      >
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={[styles.chevron, open ? styles.chevronOpen : ''].filter(Boolean).join(' ')}>›</span>
      </button>
      {open && (
        <div className={styles.sectionBody}>
          {children}
        </div>
      )}
    </section>
  )
}

export default function SettingsPage() {
  const { logout } = useAuth()
  const [pinIsSet, setPinIsSet] = useState(false)

  useEffect(() => {
    secureApi.status().then(s => setPinIsSet(s.pinIsSet))
  }, [])

  // Change Password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [gatekeeperPinForPw, setGatekeeperPinForPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwPending, setPwPending] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }
    setPwPending(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword, gatekeeperPin: gatekeeperPinForPw }),
      })
      setPwSuccess(true)
      setNewPassword(''); setConfirmPassword(''); setGatekeeperPinForPw('')
    } catch (err: unknown) {
      const status = (err as Response)?.status
      if (status === 403) setPwError('Invalid Gatekeeper PIN.')
      else setPwError('Something went wrong. Please try again.')
    } finally {
      setPwPending(false)
    }
  }

  // Set/Change PIN
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [pinPending, setPinPending] = useState(false)

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinError(null)
    setPinSuccess(false)
    if (newPin.length < 4 || newPin.length > 64) { setPinError('PIN must be 4–64 characters.'); return }
    if (newPin !== confirmPin) { setPinError('PINs do not match.'); return }
    setPinPending(true)
    try {
      await secureApi.setPin({ currentPin: pinIsSet ? currentPin : undefined, newPin })
      setPinSuccess(true)
      setPinIsSet(true)
      setCurrentPin(''); setNewPin(''); setConfirmPin('')
    } catch (err: unknown) {
      const status = (err as Response)?.status
      if (status === 403) setPinError('Current PIN is incorrect.')
      else if (status === 400) setPinError('Invalid input. Check PIN length.')
      else setPinError('Something went wrong.')
    } finally {
      setPinPending(false)
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Account</h2>
        <button className={styles.logoutBtn} onClick={logout} aria-label="Log out">
          Log out
        </button>
      </section>

      <CollapsibleSection title="Security">
        <div className={styles.subSection}>
          <h3 className={styles.subTitle}>Change Password</h3>
          <form onSubmit={handleChangePassword} className={styles.form}>
            <label className={styles.label}>
              New password
              <input type="password" className={styles.input} value={newPassword}
                onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label className={styles.label}>
              Confirm new password
              <input type="password" className={styles.input} value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label className={styles.label}>
              Gatekeeper PIN (to authorize)
              <input type="password" className={styles.input} value={gatekeeperPinForPw}
                onChange={e => setGatekeeperPinForPw(e.target.value)} autoComplete="off" />
            </label>
            {pwError && <p className={styles.error} role="alert">{pwError}</p>}
            {pwSuccess && <p className={styles.success} role="status">Password updated.</p>}
            <button type="submit" className={styles.submitBtn} disabled={pwPending}>
              {pwPending ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>

        <div className={styles.subSection}>
          <h3 className={styles.subTitle}>Gatekeeper PIN</h3>
          <form onSubmit={handleSetPin} className={styles.form}>
            {pinIsSet && (
              <label className={styles.label}>
                Current PIN
                <input type="password" className={styles.input} value={currentPin}
                  onChange={e => setCurrentPin(e.target.value)} autoComplete="off" />
              </label>
            )}
            <label className={styles.label}>
              New PIN
              <input type="password" className={styles.input} value={newPin}
                onChange={e => setNewPin(e.target.value)} autoComplete="new-password" />
            </label>
            <label className={styles.label}>
              Confirm new PIN
              <input type="password" className={styles.input} value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)} autoComplete="new-password" />
            </label>
            {pinError && <p className={styles.error} role="alert">{pinError}</p>}
            {pinSuccess && <p className={styles.success} role="status">PIN {pinIsSet ? 'updated' : 'set'}.</p>}
            <button type="submit" className={styles.submitBtn} disabled={pinPending}>
              {pinPending ? 'Saving…' : pinIsSet ? 'Change PIN' : 'Set PIN'}
            </button>
          </form>
        </div>
      </CollapsibleSection>
    </div>
  )
}
```

- [ ] **Step 4: Update SettingsPage.module.css**

Read the existing file first. Keep all existing rules. Append:

```css
.sectionToggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.chevron {
  color: var(--color-muted);
  font-size: 1.2rem;
  transition: transform 150ms ease;
  display: inline-block;
}

.chevronOpen { transform: rotate(90deg); }

@media (prefers-reduced-motion: reduce) {
  .chevron { transition: none; }
}

.sectionBody {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-top: 16px;
}

.subSection { display: flex; flex-direction: column; gap: 12px; }

.subTitle {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.form { display: flex; flex-direction: column; gap: 12px; }

.label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--color-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.input {
  background: var(--color-bg);
  border: 1px solid var(--color-surface);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--color-text);
  font-size: 0.95rem;
  width: 100%;
  box-sizing: border-box;
}

.input:focus { border-color: var(--color-primary); outline: none; }

.error { font-size: 0.85rem; color: var(--color-danger, #f87171); margin: 0; }
.success { font-size: 0.85rem; color: var(--color-primary); margin: 0; }

.submitBtn {
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-bg);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  min-height: var(--touch-min);
  align-self: flex-start;
}

.submitBtn:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Run all frontend tests — expect all pass**

```bash
cd C:/dev/simply-personal/src/PluralHost.Web && npx vitest run
```

- [ ] **Step 6: Run all backend tests**

```bash
cd C:/dev/simply-personal && dotnet test tests/PluralHost.Tests -v minimal
```

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/pages/SettingsPage.tsx \
        src/PluralHost.Web/src/pages/SettingsPage.module.css \
        src/PluralHost.Web/src/__tests__/SettingsPage.test.tsx
git commit -m "feat: SettingsPage — collapsible Security section (change password + Gatekeeper PIN)"
```
