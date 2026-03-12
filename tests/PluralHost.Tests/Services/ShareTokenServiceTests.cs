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
            permission: TokenPermission.ReadOnly,
            expiresAt: DateTime.UtcNow.AddDays(30));

        Assert.NotEmpty(token.TokenValue);
    }

    [Fact]
    public async Task CreateTwoTokens_HaveDifferentValues()
    {
        var t1 = await _service.CreateTokenAsync("A", TokenPermission.ReadOnly, null);
        var t2 = await _service.CreateTokenAsync("B", TokenPermission.ReadOnly, null);
        Assert.NotEqual(t1.TokenValue, t2.TokenValue);
    }

    [Fact]
    public async Task RevokeToken_SetsRevokedAt()
    {
        var token = await _service.CreateTokenAsync("Partner", TokenPermission.ReadOnly, null);
        await _service.RevokeTokenAsync(token.TokenValue);

        var updated = await _context.AccessTokens
            .IgnoreQueryFilters()
            .FirstAsync(t => t.TokenValue == token.TokenValue);
        Assert.NotNull(updated.RevokedAt);
    }

    [Fact]
    public async Task ResolveToken_WithValidToken_ReturnsToken()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.ReadFrontOnly,
            DateTime.UtcNow.AddDays(1));

        var resolved = await _service.ResolveTokenAsync(token.TokenValue);
        Assert.NotNull(resolved);
    }

    [Fact]
    public async Task ResolveToken_WithExpiredToken_ReturnsNull()
    {
        var token = await _service.CreateTokenAsync("Test", TokenPermission.ReadFrontOnly,
            DateTime.UtcNow.AddHours(-1));

        var resolved = await _service.ResolveTokenAsync(token.TokenValue);
        Assert.Null(resolved);
    }

    public void Dispose() => _context.Dispose();
}
