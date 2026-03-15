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
