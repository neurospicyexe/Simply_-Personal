using System.IdentityModel.Tokens.Jwt;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PluralHost.Api.Data;
using PluralHost.Api.Services;

namespace PluralHost.Tests.Services;

public class AuthServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly GatekeeperService _gatekeeper;
    private readonly AuthService _service;

    public AuthServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();

        _gatekeeper = new GatekeeperService(_context);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:SigningKey"] = "test-signing-key-at-least-32-chars-long",
                ["Jwt:Issuer"] = "plural-host",
                ["Jwt:Audience"] = "plural-host",
                ["Jwt:ExpiryHours"] = "24"
            })
            .Build();

        _service = new AuthService(_context, _gatekeeper, config);
    }

    [Fact]
    public async Task Setup_StoresHash_NotPlaintext()
    {
        await _service.SetupPasswordAsync("correct-horse-battery");

        var settings = await _context.SystemSettings.FirstAsync();
        Assert.NotNull(settings.LoginPasswordHash);
        Assert.NotEqual("correct-horse-battery", settings.LoginPasswordHash);
    }

    [Fact]
    public async Task Setup_WhenAlreadySet_ReturnsFalse()
    {
        await _service.SetupPasswordAsync("first-password");
        var result = await _service.SetupPasswordAsync("second-password");
        Assert.False(result);
    }

    [Fact]
    public async Task Setup_WhenNotSet_ReturnsTrue()
    {
        var result = await _service.SetupPasswordAsync("my-password");
        Assert.True(result);
    }

    [Fact]
    public async Task Login_WithCorrectPassword_ReturnsNonNullToken()
    {
        await _service.SetupPasswordAsync("my-password");
        var token = await _service.LoginAsync("my-password");
        Assert.NotNull(token);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsNull()
    {
        await _service.SetupPasswordAsync("my-password");
        var token = await _service.LoginAsync("wrong-password");
        Assert.Null(token);
    }

    [Fact]
    public async Task Login_WhenNoPasswordSet_ReturnsNull()
    {
        var token = await _service.LoginAsync("anything");
        Assert.Null(token);
    }

    [Fact]
    public async Task Login_ValidToken_ContainsExpectedClaims()
    {
        await _service.SetupPasswordAsync("my-password");
        var tokenString = await _service.LoginAsync("my-password");
        Assert.NotNull(tokenString);

        var handler = new JwtSecurityTokenHandler();
        var token = handler.ReadJwtToken(tokenString);

        Assert.Equal("owner", token.Subject);
        Assert.Equal("plural-host", token.Issuer);
        Assert.True(token.ValidTo > DateTime.UtcNow);
    }

    [Fact]
    public async Task ChangePassword_WithValidPin_UpdatesHash()
    {
        await _gatekeeper.SetPinAsync("my-pin");
        await _service.SetupPasswordAsync("old-password");

        var result = await _service.ChangePasswordAsync("new-password", "my-pin");
        Assert.True(result);

        // Old password should no longer work
        var token = await _service.LoginAsync("old-password");
        Assert.Null(token);

        // New password should work
        var newToken = await _service.LoginAsync("new-password");
        Assert.NotNull(newToken);
    }

    [Fact]
    public async Task ChangePassword_WithInvalidPin_ReturnsFalse()
    {
        await _gatekeeper.SetPinAsync("my-pin");
        await _service.SetupPasswordAsync("old-password");

        var result = await _service.ChangePasswordAsync("new-password", "wrong-pin");
        Assert.False(result);
    }

    [Fact]
    public async Task IsPasswordSet_BeforeSetup_ReturnsFalse()
    {
        Assert.False(await _service.IsPasswordSetAsync());
    }

    [Fact]
    public async Task IsPasswordSet_AfterSetup_ReturnsTrue()
    {
        await _service.SetupPasswordAsync("my-password");
        Assert.True(await _service.IsPasswordSetAsync());
    }

    public void Dispose() => _context.Dispose();
}
