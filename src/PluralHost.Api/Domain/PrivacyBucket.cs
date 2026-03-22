namespace PluralHost.Api.Domain;

public class PrivacyBucket : BaseEntity
{
    // Fixed GUIDs for the 4 default buckets — used in migrations and SP compat
    public static readonly Guid PublicId  = Guid.Parse("00000000-0000-0000-0000-000000000001");
    public static readonly Guid FriendId  = Guid.Parse("00000000-0000-0000-0000-000000000002");
    public static readonly Guid TrustedId = Guid.Parse("00000000-0000-0000-0000-000000000003");
    public static readonly Guid PrivateId = Guid.Parse("00000000-0000-0000-0000-000000000004");

    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Emoji { get; set; }
    public string? Color { get; set; }
    public int SortOrder { get; set; }
    public bool IsDefault { get; set; }

    public ICollection<Member> Members { get; set; } = new List<Member>();
}
