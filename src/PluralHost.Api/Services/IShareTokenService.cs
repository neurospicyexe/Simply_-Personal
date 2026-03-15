using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public interface IShareTokenService
{
    Task<AccessToken> CreateTokenAsync(
        string? label,
        TokenPermission permission,
        bool allowsBoardPosting,
        DateTime? expiresAt);

    /// <returns>true if revoked, false if token not found or already revoked</returns>
    Task<bool> RevokeTokenAsync(string tokenValue);

    Task<TokenResolveResult> ResolveTokenAsync(string tokenValue);
}
