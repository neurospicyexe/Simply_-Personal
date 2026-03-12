namespace PluralHost.Api.Domain;

public enum TokenPermission
{
    ReadOnly,        // Can see members + current front (respects IsPrivate flags)
    ReadFrontOnly    // Can only see who is currently fronting (most restricted)
}

public class AccessToken
{
    public required string TokenValue { get; set; }   // Primary key — the share URL fragment
    public TokenPermission Permission { get; set; } = TokenPermission.ReadFrontOnly;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? Label { get; set; }                // Human-readable, e.g. "Shared with Partner"
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public bool IsValid() =>
        RevokedAt == null &&
        (ExpiresAt == null || ExpiresAt.Value > DateTime.UtcNow);
}
