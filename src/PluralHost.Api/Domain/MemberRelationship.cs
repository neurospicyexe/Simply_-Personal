namespace PluralHost.Api.Domain;

public class MemberRelationship : BaseEntity
{
    public required Guid FromMemberId { get; set; }
    public Member? FromMember { get; set; }
    public required Guid ToMemberId { get; set; }
    public Member? ToMember { get; set; }
    public required string Label { get; set; } // trimmed, max 100
    public bool IsDirected { get; set; } = false;
}
