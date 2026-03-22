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

    // Buckets matching the 4 default tiers
    private static PrivacyBucket MakeBucket(int sortOrder, string name) =>
        new() { Id = Guid.NewGuid(), Name = name, SortOrder = sortOrder };

    private static readonly PrivacyBucket PublicBucket  = MakeBucket(0, "Public");
    private static readonly PrivacyBucket FriendBucket  = MakeBucket(1, "Friend");
    private static readonly PrivacyBucket TrustedBucket = MakeBucket(2, "Trusted");
    private static readonly PrivacyBucket PrivateBucket = MakeBucket(3, "Private");

    private static Member Make(PrivacyBucket bucket, string name = "X") =>
        new() { Name = name, BucketId = bucket.Id, Bucket = bucket };

    // ── FilterByPermission ────────────────────────────────────────────

    [Fact]
    public void FilterByPermission_Public_SeesOnlyPublicMembers()
    {
        var members = new List<Member>
        {
            Make(PublicBucket,  "Pub"),
            Make(FriendBucket,  "Fri"),
            Make(TrustedBucket, "Tru"),
            Make(PrivateBucket, "Pri"),
        }.AsQueryable();

        var result = _service.FilterByPermission(members, 0).ToList();

        Assert.Single(result);
        Assert.Equal("Pub", result[0].Name);
    }

    [Fact]
    public void FilterByPermission_Friend_SeePublicAndFriend()
    {
        var members = new List<Member>
        {
            Make(PublicBucket,  "Pub"),
            Make(FriendBucket,  "Fri"),
            Make(TrustedBucket, "Tru"),
            Make(PrivateBucket, "Pri"),
        }.AsQueryable();

        var result = _service.FilterByPermission(members, 1).OrderBy(m => m.Name).ToList();

        Assert.Equal(2, result.Count);
        Assert.Contains(result, m => m.Name == "Pub");
        Assert.Contains(result, m => m.Name == "Fri");
    }

    [Fact]
    public void FilterByPermission_Trusted_SeePublicFriendTrusted()
    {
        var members = new List<Member>
        {
            Make(PublicBucket,  "Pub"),
            Make(FriendBucket,  "Fri"),
            Make(TrustedBucket, "Tru"),
            Make(PrivateBucket, "Pri"),
        }.AsQueryable();

        var result = _service.FilterByPermission(members, 2).OrderBy(m => m.Name).ToList();

        Assert.Equal(3, result.Count);
        Assert.DoesNotContain(result, m => m.Name == "Pri");
    }

    [Fact]
    public void FilterByPermission_PrivateMembersNeverReturned()
    {
        var members = new List<Member>
        {
            Make(PrivateBucket, "Pri"),
        }.AsQueryable();

        var result = _service.FilterByPermission(members, 2).ToList();

        Assert.Empty(result);
    }

    [Fact]
    public void FilterByPermission_ThrowsOnReadFrontOnly()
    {
        var svc = new TokenVisibilityService();
        var members = new List<Member>().AsQueryable();
        Assert.Throws<InvalidOperationException>(
            () => svc.FilterByPermission(members, -1).ToList());
    }

    // ── CanPostToBoard ────────────────────────────────────────────────

    private static AccessToken MakeToken(
        int minBucketSortOrder,
        bool allowsBoardPosting = true) =>
        new() { TokenValue = Guid.NewGuid().ToString(), MinBucketSortOrder = minBucketSortOrder, AllowsBoardPosting = allowsBoardPosting };

    private static Member MakeMember(bool allowsBoardPosting = true) =>
        new() { Name = "M", AllowsBoardPosting = allowsBoardPosting };

    [Fact]
    public void CanPostToBoard_FriendTokenBothFlagsTrue_ReturnsTrue()
        => Assert.True(_service.CanPostToBoard(MakeToken(1), MakeMember()));

    [Fact]
    public void CanPostToBoard_TrustedTokenBothFlagsTrue_ReturnsTrue()
        => Assert.True(_service.CanPostToBoard(MakeToken(2), MakeMember()));

    [Fact]
    public void CanPostToBoard_PublicToken_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(0), MakeMember()));

    [Fact]
    public void CanPostToBoard_ReadFrontOnlyToken_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(-1), MakeMember()));

    [Fact]
    public void CanPostToBoard_TokenFlagFalse_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(1, allowsBoardPosting: false), MakeMember()));

    [Fact]
    public void CanPostToBoard_MemberFlagFalse_ReturnsFalse()
        => Assert.False(_service.CanPostToBoard(MakeToken(1), MakeMember(allowsBoardPosting: false)));

    public void Dispose() => _context.Dispose();
}
