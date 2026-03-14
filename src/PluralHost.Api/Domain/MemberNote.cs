namespace PluralHost.Api.Domain;

public class MemberNote : BaseEntity
{
    public required Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public string? Title { get; set; }        // max 100
    public required string Content { get; set; } // required, max 50000
    public bool IsPinned { get; set; } = false;
    public bool IsLocked { get; set; } = false;
}
