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

        // Seed all 4 buckets as fresh instances so EF change tracker doesn't share state across tests
        _context.PrivacyBuckets.AddRange(
            new PrivacyBucket { Id = PrivacyBucket.PublicId,  Name = "Public",  SortOrder = 0 },
            new PrivacyBucket { Id = PrivacyBucket.FriendId,  Name = "Friend",  SortOrder = 1 },
            new PrivacyBucket { Id = PrivacyBucket.TrustedId, Name = "Trusted", SortOrder = 2 },
            new PrivacyBucket { Id = PrivacyBucket.PrivateId, Name = "Private", SortOrder = 3 });
        _context.SaveChanges();

        _tokenService = new Mock<IShareTokenService>();
        _ghostMode = new Mock<IGhostModeService>();
        _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(false);
        _visibility = new TokenVisibilityService();
        _controller = new ShareController(_tokenService.Object, _ghostMode.Object, _context, _visibility);
    }

    // MinBucketSortOrder: -1=ReadFrontOnly, 0=Public, 1=Friend, 2=Trusted
    private static AccessToken MakeToken(int minBucketSortOrder, bool allowsBoardPosting = false) =>
        new() { TokenValue = "t", MinBucketSortOrder = minBucketSortOrder, AllowsBoardPosting = allowsBoardPosting };

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
            new Member { Name = "Pub", BucketId = PrivacyBucket.PublicId },
            new Member { Name = "Fri", BucketId = PrivacyBucket.FriendId },
            new Member { Name = "Pri", BucketId = PrivacyBucket.PrivateId });
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(0), TokenResolveStatus.Valid));

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
        var token = MakeToken(0, allowsBoardPosting: false);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var m = new Member { Name = "Ash", BucketId = PrivacyBucket.PublicId };
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
        var token = MakeToken(1, allowsBoardPosting: true);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var m = new Member { Name = "Ash", BucketId = PrivacyBucket.PublicId };
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
        var token = MakeToken(1, allowsBoardPosting: true);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var result = await _controller.PostToBoardAsync("t", Guid.NewGuid(),
            new ShareBoardPostRequest("Author", "Hello"));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task BoardPost_MemberTierTooHighForToken_Returns403()
    {
        // Public token (MinBucketSortOrder=0) cannot see Friend-tier member (SortOrder=1): 1 > 0 → 403
        var token = MakeToken(0, allowsBoardPosting: true);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var m = new Member { Name = "Fri", BucketId = PrivacyBucket.FriendId };
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
        var member = new Member { Name = "Ember", BucketId = PrivacyBucket.PublicId };
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
            BucketId = PrivacyBucket.PublicId
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(1), TokenResolveStatus.Valid));

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
        var member = new Member { Name = "Ember", BucketId = PrivacyBucket.PublicId };
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
            BucketId = PrivacyBucket.FriendId
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(1), TokenResolveStatus.Valid));

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
        var member = new Member { Name = "Ember", BucketId = PrivacyBucket.PublicId };
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
            BucketId = PrivacyBucket.PrivateId
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        // Use Trusted token (MinBucketSortOrder=2): Private SortOrder=3, and 3 > 2 → excluded
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(2), TokenResolveStatus.Valid));

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
        var member = new Member { Name = "Ember", BucketId = PrivacyBucket.PublicId };
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
            BucketId = PrivacyBucket.PublicId
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        // Soft-delete the field definition
        field.DeletedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(MakeToken(1), TokenResolveStatus.Valid));

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

    // ── GET /share/{token}/journals ───────────────────────────────────

    [Fact]
    public async Task GetSharedJournals_GhostMode_Returns200Empty()
    {
        _ghostMode.Setup(g => g.IsFrozenAsync()).ReturnsAsync(true);
        // tokenService NOT set up — would throw if called
        var result = await _controller.GetSharedJournalsAsync("anytoken") as OkObjectResult;
        Assert.NotNull(result);
        var items = result!.Value as System.Collections.IEnumerable;
        Assert.NotNull(items);
        Assert.Empty(items!.Cast<object>());
        _tokenService.Verify(s => s.ResolveTokenAsync(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task GetSharedJournals_InvalidToken_Returns401()
    {
        _tokenService.Setup(s => s.ResolveTokenAsync("bogus"))
            .ReturnsAsync(new TokenResolveResult(null, TokenResolveStatus.NotFound));

        var result = await _controller.GetSharedJournalsAsync("bogus") as UnauthorizedObjectResult;
        Assert.NotNull(result);
        Assert.Contains("invalid", result!.Value!.ToString()!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetSharedJournals_ReadFrontOnlyToken_Returns403()
    {
        var token = MakeToken(-1);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var result = await _controller.GetSharedJournalsAsync("t") as ObjectResult;
        Assert.NotNull(result);
        Assert.Equal(403, result!.StatusCode);
        Assert.Contains("Not permitted", result.Value!.ToString()!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetSharedJournals_ValidToken_ReturnsPublicJournals()
    {
        _context.JournalEntries.AddRange(
            new JournalEntry { Title = "Public Entry", Content = "visible", IsPrivate = false },
            new JournalEntry { Title = "Private Entry", Content = "hidden", IsPrivate = true });
        await _context.SaveChangesAsync();

        var token = MakeToken(0);
        _tokenService.Setup(s => s.ResolveTokenAsync("t"))
            .ReturnsAsync(new TokenResolveResult(token, TokenResolveStatus.Valid));

        var result = await _controller.GetSharedJournalsAsync("t") as OkObjectResult;
        Assert.NotNull(result);

        var journals = result!.Value as IList<SharedJournalDto>;
        Assert.NotNull(journals);
        Assert.Single(journals!);

        var entry = journals![0];
        Assert.Equal("Public Entry", entry.Title);
        Assert.Equal("visible", entry.Content);
        // isPrivate field must NOT be present on SharedJournalDto (it's a record with only 4 properties)
        var props = typeof(SharedJournalDto).GetProperties().Select(p => p.Name).ToList();
        Assert.Contains("Id", props);
        Assert.Contains("Title", props);
        Assert.Contains("Content", props);
        Assert.Contains("CreatedAt", props);
        Assert.DoesNotContain("IsPrivate", props);
        Assert.DoesNotContain("UpdatedAt", props);
    }

    public void Dispose() => _context.Dispose();
}
