using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class GhostModeServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly GhostModeService _service;

    public GhostModeServiceTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _service = new GhostModeService(_context);
    }

    [Fact]
    public async Task Freeze_SetsFrozenFlag()
    {
        await _service.FreezeAsync(duration: null);
        var settings = await _context.SystemSettings.FirstAsync();
        Assert.True(settings.IsFrozen);
    }

    [Fact]
    public async Task Freeze_WithDuration_SetsFreezeEndDate()
    {
        await _service.FreezeAsync(duration: TimeSpan.FromHours(48));
        var settings = await _context.SystemSettings.FirstAsync();
        Assert.NotNull(settings.FreezeEndDate);
        Assert.True(settings.FreezeEndDate > DateTime.UtcNow.AddHours(47));
    }

    [Fact]
    public async Task Unfreeze_ClearsFrozenFlagAndEndDate()
    {
        await _service.FreezeAsync(duration: TimeSpan.FromHours(24));
        await _service.UnfreezeAsync();

        var settings = await _context.SystemSettings.FirstAsync();
        Assert.False(settings.IsFrozen);
        Assert.Null(settings.FreezeEndDate);
    }

    [Fact]
    public async Task CheckAutoUnfreeze_WhenTimerExpired_UnfreezesSystem()
    {
        var settings = await _context.SystemSettings.FirstAsync();
        settings.IsFrozen = true;
        settings.FreezeEndDate = DateTime.UtcNow.AddHours(-1);
        await _context.SaveChangesAsync();

        await _service.CheckAutoUnfreezeAsync();

        _context.ChangeTracker.Clear();
        var updated = await _context.SystemSettings.FirstAsync();
        Assert.False(updated.IsFrozen);
    }

    public void Dispose() => _context.Dispose();
}
