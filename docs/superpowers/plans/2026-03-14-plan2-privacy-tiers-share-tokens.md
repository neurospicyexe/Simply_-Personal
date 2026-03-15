# Plan 2: Privacy Tiers, Share Tokens, and Board Posting Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `IsPrivate` boolean with a four-tier privacy system, upgrade the token permission ladder to match, and add token-holder board posting with Ghost Mode safety.

**Architecture:** Domain changes cascade through DTOs → services → controllers. A new `ITokenVisibilityService` encapsulates all tier-comparison logic so controllers stay thin. `IShareTokenService` gets an updated interface with a discriminated resolve result and a `bool`-returning revoke. One EF Core migration handles the schema and data changes (including an explicit SQL UPDATE to swap the swapped `TokenPermission` integer values).

**Tech Stack:** .NET 8, ASP.NET Core Web API, EF Core 8 + SQLite, xUnit, Moq

**Spec:** `docs/superpowers/specs/2026-03-14-plan2-share-tokens-privacy-tiers-design.md`

---

## File Map

**Modify:**
- `src/PluralHost.Api/Domain/Member.cs` — add `MemberPrivacy` enum, replace `IsPrivate` with `PrivacyTier`, add `AllowsBoardPosting`
- `src/PluralHost.Api/Domain/AccessToken.cs` — update `TokenPermission` enum (explicit ints, rename ReadOnly→Public, add Friend/Trusted), add `AllowsBoardPosting`
- `src/PluralHost.Api/Domain/BoardMessage.cs` — add `TokenId` (string?, nullable FK)
- `src/PluralHost.Api/Data/PluralHostContext.cs` — add FK config for `BoardMessage.TokenId`
- `src/PluralHost.Api/Services/IShareTokenService.cs` — updated signatures + `TokenResolveResult` / `TokenResolveStatus` types
- `src/PluralHost.Api/Services/ShareTokenService.cs` — implement updated interface
- `src/PluralHost.Api/Dto/NativeDtos.cs` — update Member DTOs (PrivacyTier/AllowsBoardPosting), update `BoardMessageResponse` (add TokenId), add Token DTOs
- `src/PluralHost.Api/Controllers/MembersController.cs` — update `ToResponse`, `CreateAsync`, `UpdateAsync`
- `src/PluralHost.Api/Controllers/SpMembersController.cs` — update `Private` read + write mapping
- `src/PluralHost.Api/Controllers/BoardController.cs` — add Ghost Mode guard on PostAsync, include TokenId in response
- `src/PluralHost.Api/Controllers/ShareController.cs` — fix Ghost Mode order, use `ITokenVisibilityService`, add board POST endpoint
- `src/PluralHost.Api/Program.cs` — register `ITokenVisibilityService`

**Create:**
- `src/PluralHost.Api/Services/ITokenVisibilityService.cs` — interface + `TokenResolveResult` / `TokenResolveStatus`
- `src/PluralHost.Api/Services/TokenVisibilityService.cs` — implementation
- `src/PluralHost.Api/Controllers/TokensController.cs` — GET/POST/DELETE `/api/tokens`
- Migration file (generated via `dotnet ef`)

**Test files — modify:**
- `tests/PluralHost.Tests/Services/ShareTokenServiceTests.cs`
- `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`
- `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs`
- `tests/PluralHost.Tests/Controllers/BoardControllerTests.cs`

**Test files — create:**
- `tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs`
- `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs`
- `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`

---

## Chunk 1: Domain Models + ITokenVisibilityService

### Task 1: Update domain models

**Key context:**
- `Member.IsPrivate` (bool) → replace with `PrivacyTier` (MemberPrivacy enum). `IsPrivate` is referenced in `MembersController`, `SpMembersController`, `ShareController`, `NativeDtos.cs` — all updated in later tasks.
- `TokenPermission` currently has **implicit** ints: `ReadOnly=0, ReadFrontOnly=1`. The new enum needs **explicit** ints: `ReadFrontOnly=0, Public=1, Friend=2, Trusted=3`. This requires a SQL data migration (see Task 5).
- `BoardMessage.TokenId` is `string?` — same type as `AccessToken.TokenValue` (the PK).

**Files:**
- Modify: `src/PluralHost.Api/Domain/Member.cs`
- Modify: `src/PluralHost.Api/Domain/AccessToken.cs`
- Modify: `src/PluralHost.Api/Domain/BoardMessage.cs`
- Test: `tests/PluralHost.Tests/Domain/MemberTests.cs` (existing, add cases)

- [ ] **Step 1: Add `MemberPrivacy` enum and update `Member`**

Replace `IsPrivate` with `PrivacyTier` and add `AllowsBoardPosting` in `src/PluralHost.Api/Domain/Member.cs`:

```csharp
namespace PluralHost.Api.Domain;

public enum MemberPrivacy
{
    Public  = 0,   // visible to all token levels
    Friend  = 1,   // visible to Friend and Trusted tokens
    Trusted = 2,   // visible to Trusted tokens only
    Private = 3    // never visible to any token
}

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
    public MemberPrivacy PrivacyTier { get; set; } = MemberPrivacy.Public;
    public bool AllowsBoardPosting { get; set; } = true;
    public MemberStatus Status { get; set; } = MemberStatus.Active;
    public List<Guid> ParentIds { get; set; } = [];
    public List<Group> Groups { get; set; } = [];
    public bool IsPinned { get; set; } = false;
    public bool IsArchived { get; set; } = false;
    public bool IsUntracked { get; set; } = false;
    public List<string> ExtraImages { get; set; } = [];
    public bool PreventFrontNotification { get; set; } = false;
    public bool ReceiveBoardNotifications { get; set; } = true;
    public string? SpMemberId { get; set; }
}
```

- [ ] **Step 2: Update `TokenPermission` enum and `AccessToken`**

Replace the entire `AccessToken.cs`:

```csharp
namespace PluralHost.Api.Domain;

public enum TokenPermission
{
    ReadFrontOnly = 0,   // current fronters only, no member list
    Public        = 1,   // renamed from ReadOnly — public-tier members
    Friend        = 2,   // public + friend-tier members
    Trusted       = 3    // public + friend + trusted-tier members
}

public class AccessToken
{
    public required string TokenValue { get; set; }
    public TokenPermission Permission { get; set; } = TokenPermission.ReadFrontOnly;
    public bool AllowsBoardPosting { get; set; } = false;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? Label { get; set; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public bool IsValid() =>
        RevokedAt == null &&
        (ExpiresAt == null || ExpiresAt.Value > DateTime.UtcNow);
}
```

- [ ] **Step 3: Add `TokenId` to `BoardMessage`**

Add one property to `src/PluralHost.Api/Domain/BoardMessage.cs`:

```csharp
public string? TokenId { get; set; }   // nullable FK → AccessToken.TokenValue; null = owner-posted
public AccessToken? Token { get; set; }
```

- [ ] **Step 4: Write failing tests for domain changes**

Add to `tests/PluralHost.Tests/Domain/MemberTests.cs`:

```csharp
[Fact]
public void Member_DefaultPrivacyTier_IsPublic()
{
    var m = new Member { Name = "Ash" };
    Assert.Equal(MemberPrivacy.Public, m.PrivacyTier);
}

[Fact]
public void Member_DefaultAllowsBoardPosting_IsTrue()
{
    var m = new Member { Name = "Ash" };
    Assert.True(m.AllowsBoardPosting);
}
```

Add to `tests/PluralHost.Tests/Domain/AccessTokenTests.cs`:

```csharp
[Fact]
public void AccessToken_DefaultAllowsBoardPosting_IsFalse()
{
    var t = new AccessToken { TokenValue = "test" };
    Assert.False(t.AllowsBoardPosting);
}

[Fact]
public void TokenPermission_PublicHasIntValue1()
{
    Assert.Equal(1, (int)TokenPermission.Public);
}

[Fact]
public void TokenPermission_ReadFrontOnlyHasIntValue0()
{
    Assert.Equal(0, (int)TokenPermission.ReadFrontOnly);
}
```

- [ ] **Step 5: Build check (expect compile errors)**

```bash
cd C:\dev\simply-personal
dotnet build
```

Expected: **build errors** on `IsPrivate` references in `MembersController`, `SpMembersController`, `ShareController`, and `NativeDtos`. This is expected — those references are fixed in Tasks 5–7. The domain model changes themselves are correct; the errors are in downstream consumers.

To run only domain tests while the build is broken, run against the test project directly after building just the test project's domain files — or simply proceed to Tasks 5–7 to clear the errors, then run the full test suite in Task 11.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Domain/Member.cs \
        src/PluralHost.Api/Domain/AccessToken.cs \
        src/PluralHost.Api/Domain/BoardMessage.cs \
        tests/PluralHost.Tests/Domain/MemberTests.cs \
        tests/PluralHost.Tests/Domain/AccessTokenTests.cs
git commit -m "feat: update domain models for privacy tiers and token upgrade"
```

---

### Task 2: ITokenVisibilityService + TokenVisibilityService + tests

**Key context:**
- `FilterByPermission` uses **strict less-than** (`<`) because the two enums are offset by 1: `TokenPermission.Public=1` maps to `MemberPrivacy.Public=0`. Verification table:
  - Public(1): tier < 1 → only Public(0) ✓
  - Friend(2): tier < 2 → Public(0), Friend(1) ✓
  - Trusted(3): tier < 3 → Public(0), Friend(1), Trusted(2) ✓
- Calling `FilterByPermission` with `ReadFrontOnly` is a programming error — throw `InvalidOperationException`.
- `FilterByPermission` must NOT call `.IgnoreQueryFilters()` — the EF combined filter (soft-delete + Ghost Mode) must stay active.
- `CanPostToBoard`: all three conditions must hold: permission is Friend or Trusted, token.AllowsBoardPosting, member.AllowsBoardPosting.
- `TokenResolveResult` and `TokenResolveStatus` live in this file (referenced by `IShareTokenService`).

**Files:**
- Create: `src/PluralHost.Api/Services/ITokenVisibilityService.cs`
- Create: `src/PluralHost.Api/Services/TokenVisibilityService.cs`
- Create: `tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs`

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class TokenVisibilityServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly TokenVisibilityService _service;

    public TokenVisibilityServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _service = new TokenVisibilityService();
    }

    private Member Make(MemberPrivacy tier, string name = "X") =>
        new() { Name = name, PrivacyTier = tier };

    // ── FilterByPermission ────────────────────────────────────────────

    [Fact]
    public void FilterByPermission_Public_SeesOnlyPublicMembers()
    {
        _context.Members.AddRange(
            Make(MemberPrivacy.Public, "Pub"),
            Make(MemberPrivacy.Friend, "Fri"),
            Make(MemberPrivacy.Trusted, "Tru"),
            Make(MemberPrivacy.Private, "Pri"));
        _context.SaveChanges();

        var result = _service
            .FilterByPermission(_context.Members, TokenPermission.Public)
            .ToList();

        Assert.Single(result);
        Assert.Equal("Pub", result[0].Name);
    }

    [Fact]
    public void FilterByPermission_Friend_SeePublicAndFriend()
    {
        _context.Members.AddRange(
            Make(MemberPrivacy.Public, "Pub"),
            Make(MemberPrivacy.Friend, "Fri"),
            Make(MemberPrivacy.Trusted, "Tru"),
            Make(MemberPrivacy.Private, "Pri"));
        _context.SaveChanges();

        var result = _service
            .FilterByPermission(_context.Members, TokenPermission.Friend)
            .OrderBy(m => m.Name).ToList();

        Assert.Equal(2, result.Count);
        Assert.Contains(result, m => m.Name == "Pub");
        Assert.Contains(result, m => m.Name == "Fri");
    }

    [Fact]
    public void FilterByPermission_Trusted_SeePublicFriendTrusted()
    {
        _context.Members.AddRange(
            Make(MemberPrivacy.Public, "Pub"),
            Make(MemberPrivacy.Friend, "Fri"),
            Make(MemberPrivacy.Trusted, "Tru"),
            Make(MemberPrivacy.Private, "Pri"));
        _context.SaveChanges();

        var result = _service
            .FilterByPermission(_context.Members, TokenPermission.Trusted)
            .OrderBy(m => m.Name).ToList();

        Assert.Equal(3, result.Count);
        Assert.DoesNotContain(result, m => m.Name == "Pri");
    }

    [Fact]
    public void FilterByPermission_PrivateMembersNeverReturned()
    {
        _context.Members.Add(Make(MemberPrivacy.Private, "Pri"));
        _context.SaveChanges();

        var result = _service
            .FilterByPermission(_context.Members, TokenPermission.Trusted)
            .ToList();

        Assert.Empty(result);
    }

    [Fact]
    public void FilterByPermission_ReadFrontOnly_ThrowsInvalidOperation()
    {
        Assert.Throws<InvalidOperationException>(() =>
            _service.FilterByPermission(_context.Members, TokenPermission.ReadFrontOnly));
    }

    // ── CanPostToBoard ────────────────────────────────────────────────

    private static AccessToken MakeToken(
        TokenPermission permission,
        bool allowsBoardPosting = true) =>
        new() { TokenValue = Guid.NewGuid().ToString(), Permission = permission, AllowsBoardPosting = allowsBoardPosting };

    private static Member MakeMember(bool allowsBoardPosting = true) =>
        new() { Name = "M", AllowsBoardPosting = allowsBoardPosting };

    [Fact]
    public void CanPostToBoard_FriendTokenBothFlagsTrue_ReturnsTrue()
        => Assert.True(_service.CanPostToBoard(MakeToken(TokenPermission.Friend), MakeMember()));

    [Fact]
    public void CanPostToBoard_TrustedTokenBothFlagsTrue_ReturnsTrue()
        => Assert.True(_service.CanPostToBoard(MakeToken(TokenPermission.Trusted), MakeMember()));

    [Fact]
    public void CanPostToBoard_PublicToken_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(TokenPermission.Public), MakeMember()));

    [Fact]
    public void CanPostToBoard_ReadFrontOnlyToken_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(TokenPermission.ReadFrontOnly), MakeMember()));

    [Fact]
    public void CanPostToBoard_TokenFlagFalse_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(TokenPermission.Friend, allowsBoardPosting: false), MakeMember()));

    [Fact]
    public void CanPostToBoard_MemberFlagFalse_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(TokenPermission.Friend), MakeMember(allowsBoardPosting: false)));

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
dotnet test --filter "TokenVisibilityServiceTests" -v minimal
```

Expected: FAIL — `TokenVisibilityService` does not exist yet.

- [ ] **Step 3: Create the interface**

Create `src/PluralHost.Api/Services/ITokenVisibilityService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public enum TokenResolveStatus { Valid, NotFound, Revoked, Expired }

public record TokenResolveResult(AccessToken? Token, TokenResolveStatus Status);

public interface ITokenVisibilityService
{
    /// <summary>
    /// Filters members to those visible at the given permission level.
    /// Throws InvalidOperationException if called with ReadFrontOnly.
    /// Must not call IgnoreQueryFilters — Ghost Mode + soft-delete filters stay active.
    /// Uses strict less-than: (int)member.PrivacyTier &lt; (int)permission.
    /// </summary>
    IQueryable<Member> FilterByPermission(IQueryable<Member> members, TokenPermission permission);

    /// <summary>
    /// Returns true when the token may post to the member's board.
    /// Requires: permission is Friend or Trusted, token.AllowsBoardPosting, member.AllowsBoardPosting.
    /// Token validity (not expired, not revoked) must be verified upstream.
    /// </summary>
    bool CanPostToBoard(AccessToken token, Member member);
}
```

- [ ] **Step 4: Create the implementation**

Create `src/PluralHost.Api/Services/TokenVisibilityService.cs`:

```csharp
using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public class TokenVisibilityService : ITokenVisibilityService
{
    public IQueryable<Member> FilterByPermission(
        IQueryable<Member> members, TokenPermission permission)
    {
        if (permission == TokenPermission.ReadFrontOnly)
            throw new InvalidOperationException(
                "ReadFrontOnly tokens must not call FilterByPermission. " +
                "The front endpoint handles this case separately.");

        // Strict less-than because token enum is offset +1 from member enum:
        //   Public(1)  → tier < 1 → only Public(0)
        //   Friend(2)  → tier < 2 → Public(0), Friend(1)
        //   Trusted(3) → tier < 3 → Public(0), Friend(1), Trusted(2)
        var permInt = (int)permission;
        return members.Where(m => (int)m.PrivacyTier < permInt);
    }

    public bool CanPostToBoard(AccessToken token, Member member) =>
        (token.Permission == TokenPermission.Friend ||
         token.Permission == TokenPermission.Trusted) &&
        token.AllowsBoardPosting &&
        member.AllowsBoardPosting;
}
```

- [ ] **Step 5: Run tests**

```bash
dotnet test --filter "TokenVisibilityServiceTests" -v minimal
```

Expected: all 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Services/ITokenVisibilityService.cs \
        src/PluralHost.Api/Services/TokenVisibilityService.cs \
        tests/PluralHost.Tests/Services/TokenVisibilityServiceTests.cs
git commit -m "feat: add ITokenVisibilityService with privacy tier filtering and board post guard"
```

---

### Task 3: Update IShareTokenService + ShareTokenService + tests

**Key context:**
- `ResolveTokenAsync` now returns `TokenResolveResult` (not `AccessToken?`) so callers can distinguish `Expired` (401 "Token has expired") from `NotFound`/`Revoked` (401 "Token is invalid"). The `Revoked` and `NotFound` statuses produce the same HTTP response — `Revoked` is retained for internal audit purposes.
- `RevokeTokenAsync` now returns `bool` (true = revoked, false = not found) instead of throwing `KeyNotFoundException`. Callers return 404 on false.
- `CreateTokenAsync` gains a `bool allowsBoardPosting = false` parameter.
- `TokenResolveResult` and `TokenResolveStatus` are defined in `ITokenVisibilityService.cs` (Task 2).

**Files:**
- Modify: `src/PluralHost.Api/Services/IShareTokenService.cs`
- Modify: `src/PluralHost.Api/Services/ShareTokenService.cs`
- Modify: `tests/PluralHost.Tests/Services/ShareTokenServiceTests.cs`

- [ ] **Step 1: Update failing tests first**

Replace `tests/PluralHost.Tests/Services/ShareTokenServiceTests.cs`:

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
            permission: TokenPermission.Public,
            allowsBoardPosting: false,
            expiresAt: DateTime.UtcNow.AddDays(30));
        Assert.NotEmpty(token.TokenValue);
    }

    [Fact]
    public async Task CreateTwoTokens_HaveDifferentValues()
    {
        var t1 = await _service.CreateTokenAsync("A", TokenPermission.Public, false, null);
        var t2 = await _service.CreateTokenAsync("B", TokenPermission.Public, false, null);
        Assert.NotEqual(t1.TokenValue, t2.TokenValue);
    }

    [Fact]
    public async Task CreateToken_StoresAllowsBoardPosting()
    {
        var token = await _service.CreateTokenAsync("Blue", TokenPermission.Friend, true, null);
        var stored = await _context.AccessTokens.FindAsync(token.TokenValue);
        Assert.True(stored!.AllowsBoardPosting);
    }

    [Fact]
    public async Task RevokeToken_ExistingToken_ReturnsTrueAndSetsRevokedAt()
    {
        var token = await _service.CreateTokenAsync("Partner", TokenPermission.Public, false, null);
        var result = await _service.RevokeTokenAsync(token.TokenValue);

        Assert.True(result);
        var updated = await _context.AccessTokens
            .IgnoreQueryFilters()
            .FirstAsync(t => t.TokenValue == token.TokenValue);
        Assert.NotNull(updated.RevokedAt);
    }

    [Fact]
    public async Task RevokeToken_UnknownToken_ReturnsFalse()
    {
        var result = await _service.RevokeTokenAsync("does-not-exist");
        Assert.False(result);
    }

    [Fact]
    public async Task RevokeToken_AlreadyRevoked_ReturnsFalse()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.Public, false, null);
        await _service.RevokeTokenAsync(token.TokenValue);
        // Second revoke — token is now revoked, not "found as valid"
        var result = await _service.RevokeTokenAsync(token.TokenValue);
        Assert.False(result);
    }

    [Fact]
    public async Task ResolveToken_ValidToken_ReturnsValid()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.ReadFrontOnly, false,
            DateTime.UtcNow.AddDays(1));
        var result = await _service.ResolveTokenAsync(token.TokenValue);
        Assert.Equal(TokenResolveStatus.Valid, result.Status);
        Assert.NotNull(result.Token);
    }

    [Fact]
    public async Task ResolveToken_ExpiredToken_ReturnsExpired()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.ReadFrontOnly, false,
            DateTime.UtcNow.AddHours(-1));
        var result = await _service.ResolveTokenAsync(token.TokenValue);
        Assert.Equal(TokenResolveStatus.Expired, result.Status);
        Assert.Null(result.Token);
    }

    [Fact]
    public async Task ResolveToken_RevokedToken_ReturnsRevoked()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.ReadFrontOnly, false, null);
        await _service.RevokeTokenAsync(token.TokenValue);
        var result = await _service.ResolveTokenAsync(token.TokenValue);
        Assert.Equal(TokenResolveStatus.Revoked, result.Status);
        Assert.Null(result.Token);
    }

    [Fact]
    public async Task ResolveToken_NotFoundToken_ReturnsNotFound()
    {
        var result = await _service.ResolveTokenAsync("does-not-exist");
        Assert.Equal(TokenResolveStatus.NotFound, result.Status);
        Assert.Null(result.Token);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
dotnet test --filter "ShareTokenServiceTests" -v minimal
```

Expected: compile error or test failures — interface not updated yet.

- [ ] **Step 3: Update `IShareTokenService.cs`**

```csharp
using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public interface IShareTokenService
{
    Task<AccessToken> CreateTokenAsync(
        string? label,
        TokenPermission permission,
        bool allowsBoardPosting,
        DateTime? expiresAt);

    /// <returns>true if revoked, false if token not found or already revoked</returns>
    Task<bool> RevokeTokenAsync(string tokenValue);

    Task<TokenResolveResult> ResolveTokenAsync(string tokenValue);
}
```

- [ ] **Step 4: Update `ShareTokenService.cs`**

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
        bool allowsBoardPosting,
        DateTime? expiresAt)
    {
        var token = new AccessToken
        {
            TokenValue = GenerateToken(),
            Label = label,
            Permission = permission,
            AllowsBoardPosting = allowsBoardPosting,
            ExpiresAt = expiresAt
        };
        context.AccessTokens.Add(token);
        await context.SaveChangesAsync();
        return token;
    }

    public async Task<bool> RevokeTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue && t.RevokedAt == null);

        if (token is null) return false;

        token.RevokedAt = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return true;
    }

    public async Task<TokenResolveResult> ResolveTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue);

        if (token is null)
            return new TokenResolveResult(null, TokenResolveStatus.NotFound);

        if (token.RevokedAt is not null)
            return new TokenResolveResult(null, TokenResolveStatus.Revoked);

        if (token.ExpiresAt.HasValue && token.ExpiresAt.Value <= DateTime.UtcNow)
            return new TokenResolveResult(null, TokenResolveStatus.Expired);

        return new TokenResolveResult(token, TokenResolveStatus.Valid);
    }

    private static string GenerateToken() =>
        Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
}
```

- [ ] **Step 5: Run tests**

```bash
dotnet test --filter "ShareTokenServiceTests" -v minimal
```

Expected: all 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Services/IShareTokenService.cs \
        src/PluralHost.Api/Services/ShareTokenService.cs \
        tests/PluralHost.Tests/Services/ShareTokenServiceTests.cs
git commit -m "feat: update IShareTokenService with discriminated resolve result and bool revoke"
```

---

## Chunk 2: Migration + DTOs + Updated Controllers

### Task 4: EF Core migration

**Key context:**
- The migration must execute a raw SQL UPDATE **before** EF applies the renamed columns, to swap `TokenPermission` integer values: `ReadOnly=0` → `Public=1` and `ReadFrontOnly=1` → `ReadFrontOnly=0`. EF Core doesn't know about this logical swap — it just sees columns adding/changing.
- `Member`: add `PrivacyTier` column (int, default 0), data migration `IsPrivate=1 → PrivacyTier=3`, drop `IsPrivate`. Add `AllowsBoardPosting` (bool, default 1).
- `AccessToken`: add `AllowsBoardPosting` (bool, default 0). The integer swap for `Permission` values is a raw SQL UPDATE — no column type change.
- `BoardMessage`: add `TokenId` (nullable string FK → `AccessToken.TokenValue`, no cascade delete).
- **Do not regenerate from scratch** — use `dotnet ef migrations add` which auto-scaffolds then you edit the `Up()` to add the raw SQL updates and correct the data migration.

**Files:**
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs` (FK config for BoardMessage.TokenId)
- Generate + edit: new migration file in `src/PluralHost.Api/Data/Migrations/`

- [ ] **Step 1: Add FK config for `BoardMessage.TokenId` in `PluralHostContext.cs`**

Add to `OnModelCreating` in `PluralHostContext.cs`, after the `BoardMessage` HasQueryFilter:

```csharp
// BoardMessage.TokenId → AccessToken.TokenValue (nullable FK, no cascade delete)
modelBuilder.Entity<BoardMessage>()
    .HasOne(b => b.Token)
    .WithMany()
    .HasForeignKey(b => b.TokenId)
    .OnDelete(DeleteBehavior.NoAction);
```

- [ ] **Step 2: Generate the migration scaffold**

```bash
cd C:\dev\simply-personal
dotnet ef migrations add PrivacyTierAndTokenUpgrade \
    --project src/PluralHost.Api \
    --output-dir Data/Migrations
```

This creates a new file. Note the filename — it will be something like `20260314XXXXXX_PrivacyTierAndTokenUpgrade.cs`.

- [ ] **Step 3: Edit the generated migration**

Open the new migration file. The scaffold will have columns for `PrivacyTier`, `AllowsBoardPosting` on Member and AccessToken, and `TokenId` on BoardMessage. You need to **insert the raw SQL data migrations** in the correct order.

The final `Up()` method must look like this (adjust timestamps to match what EF generated for other columns):

```csharp
protected override void Up(MigrationBuilder migrationBuilder)
{
    // 1. Add PrivacyTier (default 0 = Public)
    migrationBuilder.AddColumn<int>(
        name: "PrivacyTier",
        table: "Members",
        type: "INTEGER",
        nullable: false,
        defaultValue: 0);

    // 2. Data migration: IsPrivate=1 → PrivacyTier=3 (Private)
    migrationBuilder.Sql(
        "UPDATE Members SET PrivacyTier = 3 WHERE IsPrivate = 1;");

    // 3. Drop IsPrivate
    migrationBuilder.DropColumn(
        name: "IsPrivate",
        table: "Members");

    // 4. Add Member.AllowsBoardPosting (default true = 1)
    migrationBuilder.AddColumn<bool>(
        name: "AllowsBoardPosting",
        table: "Members",
        type: "INTEGER",
        nullable: false,
        defaultValue: true);

    // 5. Swap TokenPermission integer values BEFORE any rename:
    //    ReadOnly(0) → Public(1), ReadFrontOnly(1) → ReadFrontOnly(0)
    migrationBuilder.Sql(@"
        UPDATE AccessTokens SET Permission = CASE
            WHEN Permission = 0 THEN 1
            WHEN Permission = 1 THEN 0
            ELSE Permission
        END;");

    // 6. Add AccessToken.AllowsBoardPosting (default false = 0)
    migrationBuilder.AddColumn<bool>(
        name: "AllowsBoardPosting",
        table: "AccessTokens",
        type: "INTEGER",
        nullable: false,
        defaultValue: false);

    // 7. Add BoardMessage.TokenId (nullable FK)
    migrationBuilder.AddColumn<string>(
        name: "TokenId",
        table: "BoardMessages",
        type: "TEXT",
        nullable: true);

    migrationBuilder.CreateIndex(
        name: "IX_BoardMessages_TokenId",
        table: "BoardMessages",
        column: "TokenId");

    migrationBuilder.AddForeignKey(
        name: "FK_BoardMessages_AccessTokens_TokenId",
        table: "BoardMessages",
        column: "TokenId",
        principalTable: "AccessTokens",
        principalColumn: "TokenValue");
}

protected override void Down(MigrationBuilder migrationBuilder)
{
    migrationBuilder.DropForeignKey(
        name: "FK_BoardMessages_AccessTokens_TokenId",
        table: "BoardMessages");

    migrationBuilder.DropIndex(
        name: "IX_BoardMessages_TokenId",
        table: "BoardMessages");

    migrationBuilder.DropColumn(name: "TokenId", table: "BoardMessages");
    migrationBuilder.DropColumn(name: "AllowsBoardPosting", table: "AccessTokens");
    migrationBuilder.DropColumn(name: "AllowsBoardPosting", table: "Members");

    // Reverse the TokenPermission swap
    migrationBuilder.Sql(@"
        UPDATE AccessTokens SET Permission = CASE
            WHEN Permission = 1 THEN 0
            WHEN Permission = 0 THEN 1
            ELSE Permission
        END;");

    migrationBuilder.AddColumn<bool>(
        name: "IsPrivate",
        table: "Members",
        type: "INTEGER",
        nullable: false,
        defaultValue: false);

    migrationBuilder.Sql(
        "UPDATE Members SET IsPrivate = 1 WHERE PrivacyTier = 3;");

    migrationBuilder.DropColumn(name: "PrivacyTier", table: "Members");
}
```

**Important:** If EF's scaffold added extra columns or re-ordered things, merge carefully. The scaffold may differ slightly — the key requirement is that the raw SQL `UPDATE` statements appear in the right positions as described above.

- [ ] **Step 4: Build to check for compile errors**

```bash
dotnet build src/PluralHost.Api
```

Expected: success. Any reference to `IsPrivate` that hasn't been updated yet will cause a compile error — fix those references now (or note that Task 5–7 fix them).

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Data/PluralHostContext.cs \
        src/PluralHost.Api/Data/Migrations/
git commit -m "feat: add PrivacyTierAndTokenUpgrade migration"
```

---

### Task 5: Update NativeDtos

**Key context:**
- `MemberResponse`: replace `bool IsPrivate` with `MemberPrivacy PrivacyTier`, add `bool AllowsBoardPosting`.
- `MemberCreateRequest`: replace `bool IsPrivate = false` with `MemberPrivacy PrivacyTier = MemberPrivacy.Public`.
- `MemberUpdateRequest`: replace `bool? IsPrivate` with `MemberPrivacy? PrivacyTier`, add `bool? AllowsBoardPosting`.
- `BoardMessageResponse`: add `string? TokenId`.
- Add `TokenResponse` (for GET /api/tokens list) and `TokenCreateRequest` (for POST /api/tokens).

**Files:**
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`

- [ ] **Step 1: Replace `NativeDtos.cs` content**

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
    MemberPrivacy PrivacyTier, bool AllowsBoardPosting,
    bool IsPinned, bool IsArchived, bool IsUntracked,
    bool PreventFrontNotification, bool ReceiveBoardNotifications,
    List<string> ExtraImages, string? SpMemberId,
    MemberStatus Status, List<Guid> ParentIds, List<Guid> GroupIds,
    DateTime CreatedAt, DateTime UpdatedAt);

public record MemberCreateRequest(
    string Name, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    MemberPrivacy PrivacyTier = MemberPrivacy.Public);

public record MemberUpdateRequest(
    string? Name = null, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    MemberPrivacy? PrivacyTier = null, bool? AllowsBoardPosting = null,
    bool? IsPinned = null, bool? IsArchived = null,
    bool? IsUntracked = null, bool? PreventFrontNotification = null,
    bool? ReceiveBoardNotifications = null, List<string>? ExtraImages = null,
    string? SpMemberId = null, MemberStatus? Status = null,
    List<Guid>? ParentIds = null);

// ── BoardMessage ──────────────────────────────────────────────────────
public record BoardMessageResponse(
    Guid Id, Guid MemberId, string AuthorName, string Content,
    string? TokenId, DateTime CreatedAt);

public record BoardMessageCreateRequest(string AuthorName, string Content);

// ── MemberNote ────────────────────────────────────────────────────────
public record MemberNoteResponse(
    Guid Id, Guid MemberId, string? Title, string Content,
    bool IsPinned, bool IsLocked, DateTime CreatedAt, DateTime UpdatedAt);

public record MemberNoteCreateRequest(string Content, string? Title = null);

public record MemberNoteUpdateRequest(
    string? Title = null, string? Content = null,
    bool? IsPinned = null, bool? IsLocked = null);

// ── AccessToken ───────────────────────────────────────────────────────
public record TokenResponse(
    string TokenValue, string? Label, TokenPermission Permission,
    bool AllowsBoardPosting, DateTime? ExpiresAt,
    DateTime? RevokedAt, DateTime CreatedAt);

public record TokenCreateRequest(
    string Label,
    TokenPermission Permission,
    bool AllowsBoardPosting = false,
    DateTime? ExpiresAt = null);
```

- [ ] **Step 2: Build**

```bash
dotnet build src/PluralHost.Api
```

Expected: compile errors in `MembersController`, `BoardController`, `SpMembersController` where `IsPrivate` is still referenced — these are fixed in Tasks 6 and 7.

- [ ] **Step 3: Commit**

```bash
git add src/PluralHost.Api/Dto/NativeDtos.cs
git commit -m "feat: update NativeDtos for privacy tier, board posting, and token DTOs"
```

---

### Task 6: Update MembersController + tests

**Key context:**
- `ToResponse`: replace `m.IsPrivate` with `m.PrivacyTier`, add `m.AllowsBoardPosting`.
- `CreateAsync`: replace `IsPrivate = body.IsPrivate` with `PrivacyTier = body.PrivacyTier`.
- `UpdateAsync`: replace `body.IsPrivate` with `body.PrivacyTier`; add `body.AllowsBoardPosting`.
- The test file uses `MemberCreateRequest` and `MemberResponse` — update to use `PrivacyTier`.

**Files:**
- Modify: `src/PluralHost.Api/Controllers/MembersController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`

- [ ] **Step 1: Update `MembersController.cs`**

Change the `ToResponse` helper (line ~18):

```csharp
private static MemberResponse ToResponse(Member m) => new(
    m.Id, m.Name, m.DisplayName, m.Pronouns, m.Color, m.Role,
    m.Description, m.AvatarPath, m.PrivacyTier, m.AllowsBoardPosting,
    m.IsPinned, m.IsArchived, m.IsUntracked,
    m.PreventFrontNotification, m.ReceiveBoardNotifications,
    m.ExtraImages, m.SpMemberId, m.Status, m.ParentIds,
    m.Groups.Select(g => g.Id).ToList(),
    m.CreatedAt, m.UpdatedAt);
```

Change `CreateAsync` member construction:

```csharp
var member = new Member
{
    Name = body.Name,
    DisplayName = body.DisplayName,
    Pronouns = body.Pronouns,
    Color = body.Color,
    Role = body.Role,
    Description = body.Description,
    PrivacyTier = body.PrivacyTier
};
```

In `UpdateAsync`, replace the `IsPrivate` line and add `AllowsBoardPosting`:

```csharp
if (body.PrivacyTier is not null)                   member.PrivacyTier = body.PrivacyTier.Value;
if (body.AllowsBoardPosting is not null)            member.AllowsBoardPosting = body.AllowsBoardPosting.Value;
```

Remove the old `if (body.IsPrivate is not null) member.IsPrivate = body.IsPrivate.Value;` line.

- [ ] **Step 2: Fix compile errors in test file**

In `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`, find all references to `IsPrivate` and `MemberCreateRequest` and update:

```csharp
// Any test creating a MemberCreateRequest with IsPrivate: replace with PrivacyTier
// e.g.:
new MemberCreateRequest("Ash", Pronouns: "they/them")
// stays the same (PrivacyTier defaults to Public)

// Any assertion on response.IsPrivate — change to response.PrivacyTier
```

Also add two new tests:

```csharp
[Fact]
public async Task Create_DefaultPrivacyTier_IsPublic()
{
    var result = await _controller.CreateAsync(
        new MemberCreateRequest("Ash")) as OkObjectResult;
    var member = result!.Value as MemberResponse;
    Assert.Equal(MemberPrivacy.Public, member!.PrivacyTier);
}

[Fact]
public async Task Update_PrivacyTier_Persists()
{
    var created = _context.Members.Add(new Member { Name = "Ash" });
    await _context.SaveChangesAsync();

    await _controller.UpdateAsync(created.Entity.Id,
        new MemberUpdateRequest(PrivacyTier: MemberPrivacy.Trusted));

    var updated = await _context.Members.FindAsync(created.Entity.Id);
    Assert.Equal(MemberPrivacy.Trusted, updated!.PrivacyTier);
}

[Fact]
public async Task Update_AllowsBoardPosting_Persists()
{
    var created = _context.Members.Add(new Member { Name = "Ash" });
    await _context.SaveChangesAsync();

    await _controller.UpdateAsync(created.Entity.Id,
        new MemberUpdateRequest(AllowsBoardPosting: false));

    var updated = await _context.Members.FindAsync(created.Entity.Id);
    Assert.False(updated!.AllowsBoardPosting);
}
```

- [ ] **Step 3: Run tests**

```bash
dotnet test --filter "MembersControllerTests" -v minimal
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Api/Controllers/MembersController.cs \
        tests/PluralHost.Tests/Controllers/MembersControllerTests.cs
git commit -m "feat: update MembersController for PrivacyTier and AllowsBoardPosting"
```

---

### Task 7: Update SpMembersController + tests

**Key context:**
- SP protocol is binary (`Private: true/false`). Read mapping: `m.PrivacyTier == MemberPrivacy.Private`. Write mapping (carefully):
  - `body.Private = true` → `member.PrivacyTier = MemberPrivacy.Private` (always)
  - `body.Private = false` AND current tier is `Private` → `member.PrivacyTier = MemberPrivacy.Public`
  - `body.Private = false` AND current tier is `Public`/`Friend`/`Trusted` → leave tier unchanged (don't downgrade)
- This applies to both `CreateAsync` (new member) and `UpdateAsync` (patch).

**Files:**
- Modify: `src/PluralHost.Api/Controllers/SpMembersController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs`

- [ ] **Step 1: Update `SpMembersController.cs`**

In `ToEnvelope`, change:

```csharp
Private: m.PrivacyTier == MemberPrivacy.Private,
```

In `CreateAsync`, change member construction:

```csharp
var member = new Member
{
    Name = body.Name,
    Description = body.Desc,
    Pronouns = body.Pronouns,
    Color = body.Color,
    PrivacyTier = body.Private ? MemberPrivacy.Private : MemberPrivacy.Public
};
```

In `UpdateAsync`, replace the `Private` mapping with:

```csharp
if (body.Private is not null)
{
    if (body.Private.Value)
        member.PrivacyTier = MemberPrivacy.Private;
    else if (member.PrivacyTier == MemberPrivacy.Private)
        member.PrivacyTier = MemberPrivacy.Public;
    // else: Private=false on a non-Private tier → leave unchanged (SP has no intermediate tiers)
}
```

- [ ] **Step 2: Add tests in `SpMembersControllerTests.cs`**

Add these test cases (find where the existing `Create` and `Update` tests are and add alongside):

```csharp
[Fact]
public async Task Create_WithPrivateTrue_SetsPrivacyTierToPrivate()
{
    var result = await _controller.CreateAsync(
        new SpMemberCreateRequest { Name = "Ash", Private = true }) as OkObjectResult;

    var id = Guid.Parse(result!.Value!.ToString()!);
    var member = await _context.Members.FindAsync(id);
    Assert.Equal(MemberPrivacy.Private, member!.PrivacyTier);
}

[Fact]
public async Task Create_WithPrivateFalse_SetsPrivacyTierToPublic()
{
    var result = await _controller.CreateAsync(
        new SpMemberCreateRequest { Name = "Ash", Private = false }) as OkObjectResult;

    var id = Guid.Parse(result!.Value!.ToString()!);
    var member = await _context.Members.FindAsync(id);
    Assert.Equal(MemberPrivacy.Public, member!.PrivacyTier);
}

[Fact]
public async Task Update_PrivateFalse_OnFriendTier_LeavesUnchanged()
{
    var m = new Member { Name = "Ash", PrivacyTier = MemberPrivacy.Friend };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();

    await _controller.UpdateAsync(m.Id.ToString(),
        new SpMemberUpdateRequest { Private = false });

    var updated = await _context.Members.FindAsync(m.Id);
    Assert.Equal(MemberPrivacy.Friend, updated!.PrivacyTier);
}

[Fact]
public async Task Update_PrivateFalse_OnPrivateTier_SetsToPublic()
{
    var m = new Member { Name = "Ash", PrivacyTier = MemberPrivacy.Private };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();

    await _controller.UpdateAsync(m.Id.ToString(),
        new SpMemberUpdateRequest { Private = false });

    var updated = await _context.Members.FindAsync(m.Id);
    Assert.Equal(MemberPrivacy.Public, updated!.PrivacyTier);
}

[Fact]
public async Task ToEnvelope_PrivateTierMember_ReturnsPrivateTrue()
{
    var m = new Member { Name = "Ash", PrivacyTier = MemberPrivacy.Private };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();

    var result = await _controller.GetAsync("owner", m.Id.ToString()) as OkObjectResult;
    var envelope = result!.Value as SpEnvelope<SpMemberContent>;
    Assert.True(envelope!.Content.Private);
}

[Fact]
public async Task ToEnvelope_FriendTierMember_ReturnsPrivateFalse()
{
    var m = new Member { Name = "Ash", PrivacyTier = MemberPrivacy.Friend };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();

    var result = await _controller.GetAsync("owner", m.Id.ToString()) as OkObjectResult;
    var envelope = result!.Value as SpEnvelope<SpMemberContent>;
    Assert.False(envelope!.Content.Private);
}
```

- [ ] **Step 3: Run tests**

```bash
dotnet test --filter "SpMembersControllerTests" -v minimal
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Api/Controllers/SpMembersController.cs \
        tests/PluralHost.Tests/Controllers/SpMembersControllerTests.cs
git commit -m "feat: update SP members controller for PrivacyTier read/write mapping"
```

---

## Chunk 3: New Controllers + Share API Update

### Task 8: Update BoardController (Ghost Mode guard + TokenId) + tests

**Key context:**
- `BoardController.PostAsync` (`POST /api/members/{memberId}/board`) needs a Ghost Mode guard: if `IsFrozen`, return `Ok()` silently (consistent with other owner-side write endpoints).
- `ToResponse` must now include `TokenId`.
- `PostAsync` sets `TokenId = null` (owner post — no token).
- `BoardController` needs `IGhostModeService` injected.

**Files:**
- Modify: `src/PluralHost.Api/Controllers/BoardController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/BoardControllerTests.cs`

- [ ] **Step 1: Write failing test**

Add to `tests/PluralHost.Tests/Controllers/BoardControllerTests.cs`:

```csharp
// At top of test class, add IGhostModeService mock:
private readonly Mock<IGhostModeService> _ghostMode;

// In constructor, add:
_ghostMode = new Mock<IGhostModeService>();
_ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(false);
_controller = new BoardController(_context, _gatekeeper.Object, _ghostMode.Object);

// New tests:
[Fact]
public async Task Post_WhenFrozen_ReturnsOkSilently()
{
    _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(true);
    var m = new Member { Name = "Ash" };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();

    var result = await _controller.PostAsync(m.Id,
        new BoardMessageCreateRequest("Author", "Hello"));

    Assert.IsType<OkResult>(result);
    Assert.Empty(_context.BoardMessages.IgnoreQueryFilters().ToList());
}

[Fact]
public async Task Post_OwnerPost_HasNullTokenId()
{
    var m = new Member { Name = "Ash" };
    _context.Members.Add(m);
    await _context.SaveChangesAsync();

    var result = await _controller.PostAsync(m.Id,
        new BoardMessageCreateRequest("Ash", "Hello")) as OkObjectResult;
    var response = result!.Value as BoardMessageResponse;

    Assert.Null(response!.TokenId);
}
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
dotnet test --filter "BoardControllerTests" -v minimal
```

Expected: compile errors (wrong constructor signature, missing ghost mode).

- [ ] **Step 3: Update `BoardController.cs`**

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
    IGatekeeperService gatekeeper,
    IGhostModeService ghostMode) : ControllerBase
{
    private static BoardMessageResponse ToResponse(BoardMessage m) =>
        new(m.Id, m.MemberId, m.AuthorName, m.Content, m.TokenId, m.CreatedAt);

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
        if (await ghostMode.IsFrozenAsync()) return Ok();

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
            Content = body.Content.Trim(),
            TokenId = null   // owner post
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

- [ ] **Step 4: Run tests**

```bash
dotnet test --filter "BoardControllerTests" -v minimal
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/BoardController.cs \
        tests/PluralHost.Tests/Controllers/BoardControllerTests.cs
git commit -m "feat: add Ghost Mode guard to BoardController.PostAsync, include TokenId in response"
```

---

### Task 9: TokensController + tests

**Key context:**
- `GET /api/tokens` — list all, ordered `CreatedAt DESC`. Returns token values (intentional — owner needs them to share links).
- `POST /api/tokens` — create with label (required), permission (required), allowsBoardPosting (default false), expiresAt (optional, null = indefinite).
- `DELETE /api/tokens/{tokenValue}?pin=` — revoke; Gatekeeper PIN required. `RevokeTokenAsync` returns bool; return 404 if false.
- All endpoints `[Authorize]`.

**Files:**
- Create: `src/PluralHost.Api/Controllers/TokensController.cs`
- Create: `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs`

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Controllers/TokensControllerTests.cs`:

```csharp
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

public class TokensControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IShareTokenService> _tokenService;
    private readonly Mock<IGatekeeperService> _gatekeeper;
    private readonly TokensController _controller;

    public TokensControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _tokenService = new Mock<IShareTokenService>();
        _gatekeeper = new Mock<IGatekeeperService>();
        _controller = new TokensController(_context, _tokenService.Object, _gatekeeper.Object);
    }

    [Fact]
    public async Task List_ReturnsAllTokensOrderedByCreatedAtDesc()
    {
        var older = new AccessToken
        {
            TokenValue = "old",
            Label = "Old",
            Permission = TokenPermission.Public,
            CreatedAt = DateTime.UtcNow.AddDays(-2)
        };
        var newer = new AccessToken
        {
            TokenValue = "new",
            Label = "New",
            Permission = TokenPermission.Friend,
            CreatedAt = DateTime.UtcNow.AddDays(-1)
        };
        _context.AccessTokens.AddRange(older, newer);
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync() as OkObjectResult;
        var tokens = (result!.Value as IEnumerable<TokenResponse>)!.ToList();

        Assert.Equal(2, tokens.Count);
        Assert.Equal("new", tokens[0].TokenValue);   // newest first
        Assert.Equal("old", tokens[1].TokenValue);
    }

    [Fact]
    public async Task Create_MissingLabel_Returns400()
    {
        var result = await _controller.CreateAsync(
            new TokenCreateRequest("", TokenPermission.Friend));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_ValidRequest_CallsServiceAndReturnsToken()
    {
        var created = new AccessToken
        {
            TokenValue = "abc123",
            Label = "Blue",
            Permission = TokenPermission.Friend,
            AllowsBoardPosting = true
        };
        _tokenService
            .Setup(s => s.CreateTokenAsync("Blue", TokenPermission.Friend, true, null))
            .ReturnsAsync(created);

        var result = await _controller.CreateAsync(
            new TokenCreateRequest("Blue", TokenPermission.Friend, AllowsBoardPosting: true)) as OkObjectResult;
        var response = result!.Value as TokenResponse;

        Assert.Equal("abc123", response!.TokenValue);
        Assert.Equal(TokenPermission.Friend, response.Permission);
        Assert.True(response.AllowsBoardPosting);
    }

    [Fact]
    public async Task Revoke_InvalidPin_Returns403()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("bad")).ReturnsAsync(false);

        var result = await _controller.RevokeAsync("sometoken", "bad");
        Assert.IsType<ForbidResult>(result);
    }

    [Fact]
    public async Task Revoke_TokenNotFound_Returns404()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("good")).ReturnsAsync(true);
        _tokenService.Setup(s => s.RevokeTokenAsync("missing")).ReturnsAsync(false);

        var result = await _controller.RevokeAsync("missing", "good");
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Revoke_ValidToken_Returns200()
    {
        _gatekeeper.Setup(g => g.ValidatePinAsync("good")).ReturnsAsync(true);
        _tokenService.Setup(s => s.RevokeTokenAsync("valid")).ReturnsAsync(true);

        var result = await _controller.RevokeAsync("valid", "good");
        Assert.IsType<OkResult>(result);
    }

    public void Dispose() => _context.Dispose();
}
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
dotnet test --filter "TokensControllerTests" -v minimal
```

Expected: FAIL — `TokensController` does not exist.

- [ ] **Step 3: Create `TokensController.cs`**

```csharp
// src/PluralHost.Api/Controllers/TokensController.cs
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
[Route("api/tokens")]
public class TokensController(
    PluralHostContext context,
    IShareTokenService tokenService,
    IGatekeeperService gatekeeper) : ControllerBase
{
    private static TokenResponse ToResponse(AccessToken t) => new(
        t.TokenValue, t.Label, t.Permission, t.AllowsBoardPosting,
        t.ExpiresAt, t.RevokedAt, t.CreatedAt);

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        var tokens = await context.AccessTokens
// AccessToken has no HasQueryFilter — IgnoreQueryFilters() not needed here
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();
        return Ok(tokens.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] TokenCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });

        var token = await tokenService.CreateTokenAsync(
            body.Label, body.Permission, body.AllowsBoardPosting, body.ExpiresAt);
        return Ok(ToResponse(token));
    }

    [HttpDelete("{tokenValue}")]
    public async Task<IActionResult> RevokeAsync(string tokenValue, [FromQuery] string pin)
    {
        if (!await gatekeeper.ValidatePinAsync(pin))
            return Forbid();

        var revoked = await tokenService.RevokeTokenAsync(tokenValue);
        return revoked ? Ok() : NotFound();
    }
}
```

- [ ] **Step 4: Run tests**

```bash
dotnet test --filter "TokensControllerTests" -v minimal
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/TokensController.cs \
        tests/PluralHost.Tests/Controllers/TokensControllerTests.cs
git commit -m "feat: add TokensController (GET/POST/DELETE /api/tokens)"
```

---

### Task 10: Update ShareController + tests

**Key context:**
- **Bug fix first:** current code calls `ResolveTokenAsync` before `IsFrozenAsync` — must invert.
- `ResolveTokenAsync` now returns `TokenResolveResult` — use `Status` to pick the right 401 message.
- Replace `!m.IsPrivate` filter with `ITokenVisibilityService.FilterByPermission`.
- `ReadFrontOnly` path: update the `!f.Member.IsPrivate` filter to use `f.Member.PrivacyTier < (int)TokenPermission.ReadFrontOnly`... wait — actually for `ReadFrontOnly` tokens, the spec says we show current front regardless of member tier (the token is just restricted to front info, not by privacy tier). Re-reading spec: "ReadFrontOnly: only front, no member list" — the front endpoint returns the currently-fronting members regardless of their tier for ReadFrontOnly (same behaviour as before but with privacy removed). Actually the current code shows members where `!f.Member.IsPrivate` — this should become: only members whose PrivacyTier is Public (i.e., ReadFrontOnly shows the current front, but only for Public-tier members). Check spec: ReadFrontOnly → sees only front, not member list. The existing logic filtered `!IsPrivate` — the equivalent is `PrivacyTier < (int)TokenPermission.ReadFrontOnly` = tier < 0 = nothing... that's wrong. For ReadFrontOnly, show current front for members visible at Public tier (i.e. `PrivacyTier == MemberPrivacy.Public`). Actually since ReadFrontOnly corresponds to showing the minimum info, it should show fronters whose tier is Public (visible to everyone). Use `m.PrivacyTier == MemberPrivacy.Public` for the ReadFrontOnly front query.
- New endpoint: `POST /share/{token}/board/{memberId}`.
- `ShareController` now injects `ITokenVisibilityService`.

**Files:**
- Modify: `src/PluralHost.Api/Controllers/ShareController.cs`
- Create: `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`

- [ ] **Step 1: Write failing tests**

Create `tests/PluralHost.Tests/Controllers/ShareControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class ShareControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IShareTokenService> _tokenService;
    private readonly Mock<IGhostModeService> _ghostMode;
    private readonly TokenVisibilityService _visibility;
    private readonly ShareController _controller;

    public ShareControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _tokenService = new Mock<IShareTokenService>();
        _ghostMode = new Mock<IGhostModeService>();
        _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(false);
        _visibility = new TokenVisibilityService();
        _controller = new ShareController(_tokenService.Object, _ghostMode.Object, _context, _visibility);
    }

    private AccessToken MakeToken(TokenPermission permission, bool allowsBoardPosting = false) =>
        new() { TokenValue = "t", Permission = permission, AllowsBoardPosting = allowsBoardPosting };

    // ── Ghost Mode ────────────────────────────────────────────────────

    [Fact]
    public async Task GetSharedView_WhenFrozen_ReturnsEmptyBeforeTokenCheck()
    {
        _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(true);
        // tokenService is NOT set up — if it were called, it would throw
        var result = await _controller.GetSharedViewAsync("anytoken") as OkObjectResult;
        Assert.NotNull(result);
        _tokenService.Verify(s => s.ResolveTokenAsync(It.IsAny<string>()), Times.Never);
    }

    // ── Token validation ──────────────────────────────────────────────

    [Fact]
    public async Task GetSharedView_ExpiredToken_Returns401WithExpiredMessage()
    {
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(null, TokenResolveStatus.Expired));

        var result = await _controller.GetSharedViewAsync("t") as UnauthorizedObjectResult;
        Assert.NotNull(result);
        Assert.Contains("expired", result.Value!.ToString()!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetSharedView_InvalidToken_Returns401WithInvalidMessage()
    {
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(null, TokenResolveStatus.NotFound));

        var result = await _controller.GetSharedViewAsync("t") as UnauthorizedObjectResult;
        Assert.NotNull(result);
    }

    // ── Privacy filtering ─────────────────────────────────────────────

    [Fact]
    public async Task GetSharedView_PublicToken_ReturnsOnlyPublicMembers()
    {
        _context.Members.AddRange(
            new Member { Name = "Pub", PrivacyTier = MemberPrivacy.Public },
            new Member { Name = "Fri", PrivacyTier = MemberPrivacy.Friend },
            new Member { Name = "Pri", PrivacyTier = MemberPrivacy.Private });
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(TokenPermission.Public), TokenResolveStatus.Valid));

        var result = await _controller.GetSharedViewAsync("t") as OkObjectResult;
        // Result is an anonymous object with members property
        var members = ((dynamic)result!.Value!).members as IEnumerable<object>;
        Assert.Single(members!);
    }

    // ── Board posting ─────────────────────────────────────────────────

    [Fact]
    public async Task BoardPost_WhenFrozen_Returns204()
    {
        _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(true);
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.PostToBoardAsync("anytoken", m.Id,
            new ShareBoardPostRequest("Author", "Hello"));
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public async Task BoardPost_InvalidInput_Returns400BeforeTokenCheck()
    {
        // Token service NOT set up — if called it would fail
        var result = await _controller.PostToBoardAsync("t", Guid.NewGuid(),
            new ShareBoardPostRequest("", "content"));
        Assert.IsType<BadRequestObjectResult>(result);
        _tokenService.Verify(s => s.ResolveTokenAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task BoardPost_ExpiredToken_Returns401()
    {
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(null, TokenResolveStatus.Expired));

        var result = await _controller.PostToBoardAsync("t", Guid.NewGuid(),
            new ShareBoardPostRequest("Author", "Hello"));
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public async Task BoardPost_TokenCannotPost_Returns403()
    {
        var token = MakeToken(TokenPermission.Public, allowsBoardPosting: false);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var m = new Member { Name = "Ash", PrivacyTier = MemberPrivacy.Public };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.PostToBoardAsync("t", m.Id,
            new ShareBoardPostRequest("Author", "Hello"));
        Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, ((ObjectResult)result).StatusCode);
    }

    [Fact]
    public async Task BoardPost_ValidRequest_CreatesBoardMessageWithTokenId()
    {
        var token = MakeToken(TokenPermission.Friend, allowsBoardPosting: true);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var m = new Member { Name = "Ash", PrivacyTier = MemberPrivacy.Public };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.PostToBoardAsync("t", m.Id,
            new ShareBoardPostRequest("Blue", "Hey!")) as OkObjectResult;

        Assert.NotNull(result);
        var msg = _context.BoardMessages.IgnoreQueryFilters().First();
        Assert.Equal("t", msg.TokenId);
        Assert.Equal("Blue", msg.AuthorName);
    }

    [Fact]
    public async Task BoardPost_MemberDoesNotExist_Returns404()
    {
        var token = MakeToken(TokenPermission.Friend, allowsBoardPosting: true);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var result = await _controller.PostToBoardAsync("t", Guid.NewGuid(),
            new ShareBoardPostRequest("Author", "Hello"));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task BoardPost_MemberTierTooHighForToken_Returns403()
    {
        // Public token (int=1) cannot see Friend-tier member (int=1): 1 >= 1 → 403
        var token = MakeToken(TokenPermission.Public, allowsBoardPosting: true);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var m = new Member { Name = "Fri", PrivacyTier = MemberPrivacy.Friend };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.PostToBoardAsync("t", m.Id,
            new ShareBoardPostRequest("Author", "Hello"));
        Assert.IsType<ObjectResult>(result);
        Assert.Equal(403, ((ObjectResult)result).StatusCode);
    }

    public void Dispose() => _context.Dispose();
}
```

Note: `ShareBoardPostRequest` is a new DTO — add it to `NativeDtos.cs`:
```csharp
public record ShareBoardPostRequest(string AuthorName, string Content);
```

- [ ] **Step 2: Add `ShareBoardPostRequest` to `NativeDtos.cs`**

Append to `src/PluralHost.Api/Dto/NativeDtos.cs`:

```csharp
// ── Share (token-holder endpoints) ───────────────────────────────────
public record ShareBoardPostRequest(string AuthorName, string Content);
```

- [ ] **Step 3: Run tests to confirm failure**

```bash
dotnet test --filter "ShareControllerTests" -v minimal
```

Expected: FAIL — `ShareController` has wrong constructor, missing `PostToBoardAsync`.

- [ ] **Step 4: Rewrite `ShareController.cs`**

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;

namespace PluralHost.Api.Controllers;

[ApiController]
[Route("share")]
[AllowAnonymous]
public class ShareController(
    IShareTokenService tokenService,
    IGhostModeService ghostMode,
    PluralHostContext context,
    ITokenVisibilityService visibility) : ControllerBase
{
    // GET /share/{token}
    [HttpGet("{token}")]
    public async Task<IActionResult> GetSharedViewAsync(string token)
    {
        // Ghost Mode FIRST — before any token DB lookup
        if (await ghostMode.IsFrozenAsync())
            return Ok(new { members = Array.Empty<object>(), currentFront = Array.Empty<object>() });

        var result = await tokenService.ResolveTokenAsync(token);
        if (result.Status == TokenResolveStatus.Expired)
            return Unauthorized(new { error = "Token has expired." });
        if (result.Status != TokenResolveStatus.Valid)
            return Unauthorized(new { error = "Token is invalid." });

        var accessToken = result.Token!;

        if (accessToken.Permission == TokenPermission.ReadFrontOnly)
        {
            var front = await context.FrontHistory
                .Include(f => f.Member)
                .Where(f => f.FrontEnd == null &&
                            f.Member != null &&
                            f.Member.PrivacyTier == MemberPrivacy.Public)
                .Select(f => new { f.Member!.Name, f.Member.DisplayName, f.Member.Color })
                .ToListAsync();
            return Ok(new { currentFront = front });
        }

        var members = await visibility
            .FilterByPermission(context.Members, accessToken.Permission)
            .Select(m => new { m.Name, m.DisplayName, m.Pronouns, m.Color, m.Status })
            .ToListAsync();

        var currentFront = await context.FrontHistory
            .Include(f => f.Member)
            .Where(f => f.FrontEnd == null &&
                        f.Member != null &&
                        f.Member.DeletedAt == null &&   // guard: Include bypasses Member's query filter
                        (int)f.Member.PrivacyTier < (int)accessToken.Permission)
            .ToListAsync();

        var visibleFront = currentFront
            .Select(f => new { f.Member!.Name, f.Member.DisplayName })
            .ToList();

        return Ok(new { members, currentFront = visibleFront });
    }

    // POST /share/{token}/board/{memberId}
    [HttpPost("{token}/board/{memberId:guid}")]
    public async Task<IActionResult> PostToBoardAsync(
        string token, Guid memberId,
        [FromBody] ShareBoardPostRequest body)
    {
        // 1. Ghost Mode — silent, no state revealed
        if (await ghostMode.IsFrozenAsync()) return NoContent();

        // 2. Input validation — cheap, before DB work
        if (string.IsNullOrWhiteSpace(body.AuthorName) || body.AuthorName.Length > 100)
            return BadRequest(new { error = "AuthorName is required and must be 100 characters or fewer." });
        if (string.IsNullOrWhiteSpace(body.Content) || body.Content.Length > 1000)
            return BadRequest(new { error = "Content is required and must be 1000 characters or fewer." });

        // 3. Token validation
        var result = await tokenService.ResolveTokenAsync(token);
        if (result.Status == TokenResolveStatus.Expired)
            return Unauthorized(new { error = "Token has expired." });
        if (result.Status != TokenResolveStatus.Valid)
            return Unauthorized(new { error = "Token is invalid." });

        var accessToken = result.Token!;

        // 4. Member lookup — IgnoreQueryFilters to distinguish 404 (gone) vs 403 (private tier)
        var member = await context.Members
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.Id == memberId);

        if (member is null || member.DeletedAt is not null) return NotFound();

        // Invisible to this token (tier too high) → 403, don't leak existence
        if ((int)member.PrivacyTier >= (int)accessToken.Permission)
            return StatusCode(403, new { error = "Board posting not permitted." });

        // 5. Posting permission check
        if (!visibility.CanPostToBoard(accessToken, member))
        {
            var msg = !member.AllowsBoardPosting
                ? "This member is not accepting messages."
                : "Board posting not permitted.";
            return StatusCode(403, new { error = msg });
        }

        // 6. Insert
        var message = new BoardMessage
        {
            MemberId = memberId,
            AuthorName = body.AuthorName.Trim(),
            Content = body.Content.Trim(),
            TokenId = accessToken.TokenValue
        };
        context.BoardMessages.Add(message);
        await context.SaveChangesAsync();
        return Ok(new { id = message.Id });
    }
}
```

- [ ] **Step 5: Run tests**

```bash
dotnet test --filter "ShareControllerTests" -v minimal
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/ShareController.cs \
        src/PluralHost.Api/Dto/NativeDtos.cs \
        tests/PluralHost.Tests/Controllers/ShareControllerTests.cs
git commit -m "feat: update ShareController with privacy tier filtering and board post endpoint"
```

---

### Task 11: Register services + full test run

**Key context:**
- `ITokenVisibilityService` must be registered in `Program.cs`.
- `ShareController` now requires `ITokenVisibilityService` — DI won't resolve at startup without it.

**Files:**
- Modify: `src/PluralHost.Api/Program.cs`

- [ ] **Step 1: Register `ITokenVisibilityService` in `Program.cs`**

Add after the existing service registrations:

```csharp
builder.Services.AddScoped<ITokenVisibilityService, TokenVisibilityService>();
```

- [ ] **Step 2: Build**

```bash
dotnet build src/PluralHost.Api
```

Expected: zero errors.

- [ ] **Step 3: Run all tests**

```bash
cd C:\dev\simply-personal
dotnet test -v minimal
```

Expected: all tests pass (the number will be higher than before Plan 2). If any tests reference the old `ReadOnly` enum value, update them to `Public`.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Api/Program.cs
git commit -m "feat: register ITokenVisibilityService in DI"
```

---

## Chunk 4: Plan 2 complete — run full suite

- [ ] **Final build + test run**

```bash
dotnet build
dotnet test -v minimal
```

Expected: all tests pass, zero build warnings about obsolete references.

- [ ] **Final commit if any loose files**

```bash
git status
# If anything unstaged, add and commit
```
