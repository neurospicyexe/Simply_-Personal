using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public class ShareTokenService(PluralHostContext context) : IShareTokenService
{
    public async Task<AccessToken> CreateTokenAsync(
        string? label,
        TokenPermission permission,
        bool allowsBoardPosting,
        DateTime? expiresAt)
    {
        var token = new AccessToken
        {
            TokenValue = GenerateToken(),
            Label = label,
            Permission = permission,
            AllowsBoardPosting = allowsBoardPosting,
            ExpiresAt = expiresAt
        };
        context.AccessTokens.Add(token);
        await context.SaveChangesAsync();
        return token;
    }

    public async Task<bool> RevokeTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue && t.RevokedAt == null);

        if (token is null) return false;

        token.RevokedAt = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return true;
    }

    public async Task<TokenResolveResult> ResolveTokenAsync(string tokenValue)
    {
        var token = await context.AccessTokens
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(t => t.TokenValue == tokenValue);

        if (token is null)
            return new TokenResolveResult(null, TokenResolveStatus.NotFound);

        if (token.RevokedAt is not null)
            return new TokenResolveResult(null, TokenResolveStatus.Revoked);

        if (token.ExpiresAt.HasValue && token.ExpiresAt.Value <= DateTime.UtcNow)
            return new TokenResolveResult(null, TokenResolveStatus.Expired);

        return new TokenResolveResult(token, TokenResolveStatus.Valid);
    }

    private static string GenerateToken() =>
        Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');
}
