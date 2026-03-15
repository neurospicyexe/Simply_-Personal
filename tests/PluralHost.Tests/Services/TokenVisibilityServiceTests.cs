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
