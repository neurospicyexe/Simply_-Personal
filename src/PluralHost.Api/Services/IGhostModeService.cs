namespace PluralHost.Api.Services;

public interface IGhostModeService
{
    Task FreezeAsync(TimeSpan? duration);
    Task UnfreezeAsync();
    Task CheckAutoUnfreezeAsync();
    Task<bool> IsFrozenAsync();
}
