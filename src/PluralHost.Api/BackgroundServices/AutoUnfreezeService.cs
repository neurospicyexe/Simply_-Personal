using PluralHost.Api.Services;

namespace PluralHost.Api.BackgroundServices;

public class AutoUnfreezeService(IServiceScopeFactory scopeFactory, ILogger<AutoUnfreezeService> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

            using var scope = scopeFactory.CreateScope();
            var ghostMode = scope.ServiceProvider.GetRequiredService<IGhostModeService>();

            try
            {
                await ghostMode.CheckAutoUnfreezeAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error checking auto-unfreeze");
            }
        }
    }
}
