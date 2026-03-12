using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class GatekeeperServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly GatekeeperService _service;

    public GatekeeperServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _service = new GatekeeperService(_context);
    }

    [Fact]
    public async Task SetPin_StoresHashedValue()
    {
        await _service.SetPinAsync("correct-horse-battery-staple");

        var settings = await _context.SystemSettings.FirstAsync();
        Assert.NotNull(settings.GatekeeperPinHash);
        Assert.NotEqual("correct-horse-battery-staple", settings.GatekeeperPinHash);
    }

    [Fact]
    public async Task ValidatePin_WithCorrectPin_ReturnsTrue()
    {
        await _service.SetPinAsync("vault-password");
        var valid = await _service.ValidatePinAsync("vault-password");
        Assert.True(valid);
    }

    [Fact]
    public async Task ValidatePin_WithWrongPin_ReturnsFalse()
    {
        await _service.SetPinAsync("vault-password");
        var valid = await _service.ValidatePinAsync("wrong-password");
        Assert.False(valid);
    }

    [Fact]
    public async Task ValidatePin_WhenNoPinSet_ReturnsFalse()
    {
        // No pin set — deny as safe default
        var valid = await _service.ValidatePinAsync("anything");
        Assert.False(valid);
    }

    [Fact]
    public async Task IsPinSet_WhenHashExists_ReturnsTrue()
    {
        await _service.SetPinAsync("some-pin");
        Assert.True(await _service.IsPinSetAsync());
    }

    public void Dispose() => _context.Dispose();
}
