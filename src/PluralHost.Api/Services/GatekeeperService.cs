using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class GatekeeperService(PluralHostContext context) : IGatekeeperService
{
    private const int BcryptWorkFactor = 12;

    public async Task SetPinAsync(string plainPin)
    {
        var settings = await context.SystemSettings.FirstAsync();
        settings.GatekeeperPinHash = BCrypt.Net.BCrypt.HashPassword(plainPin, BcryptWorkFactor);
        await context.SaveChangesAsync();
    }

    public async Task<bool> ValidatePinAsync(string plainPin)
    {
        var settings = await context.SystemSettings.FirstAsync();
        if (string.IsNullOrEmpty(settings.GatekeeperPinHash))
            return false; // No pin set — deny by default (safe)

        return BCrypt.Net.BCrypt.Verify(plainPin, settings.GatekeeperPinHash);
    }

    public async Task<bool> IsPinSetAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        return !string.IsNullOrEmpty(settings.GatekeeperPinHash);
    }
}
