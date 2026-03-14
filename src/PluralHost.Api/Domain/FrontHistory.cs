namespace PluralHost.Api.Domain;

public class FrontHistory : BaseEntity
{
    public required Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public DateTime FrontStart { get; set; } = DateTime.UtcNow;
    public DateTime? FrontEnd { get; set; }
    public bool IsCurrentlyFronting => FrontEnd == null;
    public string? Comment { get; set; }          // free-text annotation, max 500
    public Guid? CustomStatusId { get; set; }     // FK → FrontStatus
    public FrontStatus? CustomStatus { get; set; } // navigation property
}
