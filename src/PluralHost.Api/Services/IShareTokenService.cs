using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public interface IShareTokenService
{
    Task<AccessToken> CreateTokenAsync(string? label, TokenPermission permission, DateTime? expiresAt);
    Task RevokeTokenAsync(string tokenValue);
    Task<AccessToken?> ResolveTokenAsync(string tokenValue);
}
