using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class GhostModeService(PluralHostContext context) : IGhostModeService
{
    public async Task FreezeAsync(TimeSpan? duration)
    {
        var settings = await context.SystemSettings.FirstAsync();
        settings.IsFrozen = true;
        settings.FreezeEndDate = duration.HasValue
            ? DateTime.UtcNow.Add(duration.Value)
            : null;
        await context.SaveChangesAsync();
    }

    public async Task UnfreezeAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        settings.IsFrozen = false;
        settings.FreezeEndDate = null;
        await context.SaveChangesAsync();
    }

    public async Task CheckAutoUnfreezeAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        if (settings.ShouldAutoUnfreeze())
        {
            settings.IsFrozen = false;
            settings.FreezeEndDate = null;
            await context.SaveChangesAsync();
        }
    }

    public async Task<bool> IsFrozenAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        return settings.IsFrozen;
    }
}
