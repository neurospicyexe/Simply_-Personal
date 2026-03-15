namespace PluralHost.Api.Domain;

public enum TokenPermission
{
    ReadFrontOnly = 0,   // current fronters only, no member list
    Public        = 1,   // renamed from ReadOnly — public-tier members
    Friend        = 2,   // public + friend-tier members
    Trusted       = 3    // public + friend + trusted-tier members
}

public class AccessToken
{
    public required string TokenValue { get; set; }
    public TokenPermission Permission { get; set; } = TokenPermission.ReadFrontOnly;
    public bool AllowsBoardPosting { get; set; } = false;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? Label { get; set; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public bool IsValid() =>
        RevokedAt == null &&
        (ExpiresAt == null || ExpiresAt.Value > DateTime.UtcNow);
}
