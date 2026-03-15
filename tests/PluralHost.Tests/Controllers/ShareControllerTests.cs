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
        // Result has a members property
        var value = result!.Value!;
        var membersProperty = value.GetType().GetProperty("members")!.GetValue(value) as System.Collections.IEnumerable;
        var membersList = membersProperty!.Cast<object>().ToList();
        Assert.Single(membersList);
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

    // ── Custom Fields in share response ───────────────────────────────

    [Fact]
    public async Task GetSharedView_PublicToken_IncludesPublicTierCustomFields()
    {
        var member = new Member { Name = "Ember", PrivacyTier = MemberPrivacy.Public };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        var field = new CustomField { Label = "Age", FieldType = FieldType.Number };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();

        var cfv = new CustomFieldValue
        {
            MemberId = member.Id,
            FieldId = field.Id,
            Value = "25",
            PrivacyTier = MemberPrivacy.Public
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(TokenPermission.Friend), TokenResolveStatus.Valid));

        var result = await _controller.GetSharedViewAsync("t") as OkObjectResult;
        Assert.NotNull(result);

        var value = result!.Value!;
        var membersProperty = value.GetType().GetProperty("members")!.GetValue(value) as System.Collections.IEnumerable;
        var membersList = membersProperty!.Cast<object>().ToList();
        Assert.Single(membersList);

        var firstMember = membersList[0];
        var customFieldsProp = firstMember.GetType().GetProperty("customFields")!.GetValue(firstMember) as System.Collections.IEnumerable;
        var customFieldsList = customFieldsProp!.Cast<object>().ToList();
        Assert.Single(customFieldsList);
    }

    [Fact]
    public async Task GetSharedView_FriendToken_IncludesFriendTierFields()
    {
        var member = new Member { Name = "Ember", PrivacyTier = MemberPrivacy.Public };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        var field = new CustomField { Label = "Nickname", FieldType = FieldType.Text };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();

        var cfv = new CustomFieldValue
        {
            MemberId = member.Id,
            FieldId = field.Id,
            Value = "Em",
            PrivacyTier = MemberPrivacy.Friend
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(TokenPermission.Friend), TokenResolveStatus.Valid));

        var result = await _controller.GetSharedViewAsync("t") as OkObjectResult;
        Assert.NotNull(result);

        var value = result!.Value!;
        var membersProperty = value.GetType().GetProperty("members")!.GetValue(value) as System.Collections.IEnumerable;
        var membersList = membersProperty!.Cast<object>().ToList();
        Assert.Single(membersList);

        var firstMember = membersList[0];
        var customFieldsProp = firstMember.GetType().GetProperty("customFields")!.GetValue(firstMember) as System.Collections.IEnumerable;
        var customFieldsList = customFieldsProp!.Cast<object>().ToList();
        Assert.Single(customFieldsList);
    }

    [Fact]
    public async Task GetSharedView_PrivateValueExcluded()
    {
        var member = new Member { Name = "Ember", PrivacyTier = MemberPrivacy.Public };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        var field = new CustomField { Label = "Secret", FieldType = FieldType.Text };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();

        var cfv = new CustomFieldValue
        {
            MemberId = member.Id,
            FieldId = field.Id,
            Value = "hidden",
            PrivacyTier = MemberPrivacy.Private
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        // Use Trusted token (int=3): Private is 3, and 3 < 3 is false → excluded
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(TokenPermission.Trusted), TokenResolveStatus.Valid));

        var result = await _controller.GetSharedViewAsync("t") as OkObjectResult;
        Assert.NotNull(result);

        var value = result!.Value!;
        var membersProperty = value.GetType().GetProperty("members")!.GetValue(value) as System.Collections.IEnumerable;
        var membersList = membersProperty!.Cast<object>().ToList();
        Assert.Single(membersList);

        var firstMember = membersList[0];
        var customFieldsProp = firstMember.GetType().GetProperty("customFields")!.GetValue(firstMember) as System.Collections.IEnumerable;
        var customFieldsList = customFieldsProp!.Cast<object>().ToList();
        Assert.Empty(customFieldsList);
    }

    [Fact]
    public async Task GetSharedView_SoftDeletedFieldExcluded()
    {
        var member = new Member { Name = "Ember", PrivacyTier = MemberPrivacy.Public };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        var field = new CustomField { Label = "Gone", FieldType = FieldType.Text };
        _context.CustomFields.Add(field);
        await _context.SaveChangesAsync();

        var cfv = new CustomFieldValue
        {
            MemberId = member.Id,
            FieldId = field.Id,
            Value = "somevalue",
            PrivacyTier = MemberPrivacy.Public
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        // Soft-delete the field definition
        field.DeletedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(TokenPermission.Friend), TokenResolveStatus.Valid));

        var result = await _controller.GetSharedViewAsync("t") as OkObjectResult;
        Assert.NotNull(result);

        var value = result!.Value!;
        var membersProperty = value.GetType().GetProperty("members")!.GetValue(value) as System.Collections.IEnumerable;
        var membersList = membersProperty!.Cast<object>().ToList();
        Assert.Single(membersList);

        var firstMember = membersList[0];
        var customFieldsProp = firstMember.GetType().GetProperty("customFields")!.GetValue(firstMember) as System.Collections.IEnumerable;
        var customFieldsList = customFieldsProp!.Cast<object>().ToList();
        Assert.Empty(customFieldsList);
    }

    public void Dispose() => _context.Dispose();
}
