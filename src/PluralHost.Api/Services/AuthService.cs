using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PluralHost.Api.Data;

namespace PluralHost.Api.Services;

public class AuthService(
    PluralHostContext context,
    IGatekeeperService gatekeeper,
    IConfiguration configuration) : IAuthService
{
    private const int BcryptWorkFactor = 12;

    public async Task<bool> SetupPasswordAsync(string plainPassword)
    {
        var settings = await context.SystemSettings.FirstAsync();
        if (settings.IsLoginSetup)
            return false;

        settings.LoginPasswordHash = BCrypt.Net.BCrypt.HashPassword(plainPassword, BcryptWorkFactor);
        await context.SaveChangesAsync();
        return true;
    }

    public async Task<string?> LoginAsync(string plainPassword)
    {
        var settings = await context.SystemSettings.FirstAsync();
        if (string.IsNullOrEmpty(settings.LoginPasswordHash))
            return null;

        if (!BCrypt.Net.BCrypt.Verify(plainPassword, settings.LoginPasswordHash))
            return null;

        // TODO: Build and return the JWT string here.
        // You have access to:
        //   - configuration["Jwt:Issuer"], ["Jwt:Audience"], ["Jwt:SigningKey"], ["Jwt:ExpiryHours"]
        //   - JwtSecurityToken, SigningCredentials, SymmetricSecurityKey, SecurityAlgorithms.HmacSha256Signature
        //   - JwtSecurityTokenHandler to write the token to a string
        //   - Claims to include: sub="owner", jti=Guid.NewGuid().ToString()
        //
        // Trade-off to consider: what expiry strategy makes sense for a self-hosted personal app?
        // - Short expiry (1h): more secure, but annoying if you're actively using it
        // - Long expiry (7d): convenient, but a stolen token has a long window
        // - 24h with manual revocation: what we planned — balanced for personal use
        //
        // The ExpiryHours value comes from configuration (default 24).
        throw new NotImplementedException("JWT generation not yet implemented — see TODO above.");
    }

    public async Task<bool> ChangePasswordAsync(string newPlainPassword, string gatekeeperPin)
    {
        if (!await gatekeeper.ValidatePinAsync(gatekeeperPin))
            return false;

        var settings = await context.SystemSettings.FirstAsync();
        settings.LoginPasswordHash = BCrypt.Net.BCrypt.HashPassword(newPlainPassword, BcryptWorkFactor);
        await context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> IsPasswordSetAsync()
    {
        var settings = await context.SystemSettings.FirstAsync();
        return settings.IsLoginSetup;
    }
}
