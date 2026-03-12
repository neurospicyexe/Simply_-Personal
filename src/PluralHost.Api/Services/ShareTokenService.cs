using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public class ShareTokenService(PluralHostContext context) : IShareTokenService
{
    public async Task<AccessToken> CreateTokenAsync(
        string? label,
        TokenPermission permission,
        DateTime? expiresAt)
    {
        var token = new AccessToken
        {
            TokenValue = GenerateToken(),
            Label = label,
            Permission = permission,
            ExpiresAt = expiresAt
        };
        context.AccessTokens.Add(token);
        await context.SaveChangesAsync();
        return token;
    }

    public async Task RevokeTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue)
            ?? throw new KeyNotFoundException($"Token '{tokenValue}' not found.");

        token.RevokedAt = DateTime.UtcNow;
        await context.SaveChangesAsync();
    }

    public async Task<AccessToken?> ResolveTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue);

        return token?.IsValid() == true ? token : null;
    }

    private static string GenerateToken() =>
        Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
}
