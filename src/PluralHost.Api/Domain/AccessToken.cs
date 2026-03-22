namespace PluralHost.Api.Domain;

public class AccessToken
{
    public required string TokenValue { get; set; }
    public int MinBucketSortOrder { get; set; } = -1;
    public bool AllowsBoardPosting { get; set; } = false;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? Label { get; set; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    public bool IsValid() =>
        RevokedAt == null &&
        (ExpiresAt == null || ExpiresAt.Value > DateTime.UtcNow);
}
