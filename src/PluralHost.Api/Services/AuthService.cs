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

        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(configuration["Jwt:SigningKey"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256Signature);

        var expiryHours = int.TryParse(configuration["Jwt:ExpiryHours"], out var h) ? h : 24;

        var token = new JwtSecurityToken(
            issuer: configuration["Jwt:Issuer"],
            audience: configuration["Jwt:Audience"],
            claims: new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, "owner"),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new Claim(JwtRegisteredClaimNames.Iat,
                    DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                    ClaimValueTypes.Integer64)
            },
            expires: DateTime.UtcNow.AddHours(expiryHours),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
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
