namespace PluralHost.Api.Domain;

public class BoardMessage : BaseEntity
{
    public required Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public required string AuthorName { get; set; }  // max 100
    public required string Content { get; set; }     // max 1000
}
