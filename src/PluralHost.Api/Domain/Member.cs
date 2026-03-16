namespace PluralHost.Api.Domain;

public enum MemberPrivacy
{
    Public  = 0,   // visible to all token levels
    Friend  = 1,   // visible to Friend and Trusted tokens
    Trusted = 2,   // visible to Trusted tokens only
    Private = 3    // never visible to any token
}

public enum MemberStatus { Active, Dormant, Fused, Gone }

public class Member : BaseEntity
{
    public required string Name { get; set; }
    public string? DisplayName { get; set; }
    public string? Pronouns { get; set; }
    public string? AvatarPath { get; set; }
    public string? Color { get; set; }
    public string? Role { get; set; }
    public string? Description { get; set; }
    public MemberPrivacy PrivacyTier { get; set; } = MemberPrivacy.Public;
    public bool AllowsBoardPosting { get; set; } = true;
    public MemberStatus Status { get; set; } = MemberStatus.Active;
    public List<Guid> ParentIds { get; set; } = [];
    public List<Group> Groups { get; set; } = [];
    public bool IsPinned { get; set; } = false;
    public bool IsArchived { get; set; } = false;
    public bool IsUntracked { get; set; } = false;
    public List<string> ExtraImages { get; set; } = [];
    public bool PreventFrontNotification { get; set; } = false;
    public bool ReceiveBoardNotifications { get; set; } = true;
    public string? SpMemberId { get; set; }
    public string? PkId { get; set; }
    public string? Birthday { get; set; }   // "YYYY-MM-DD" or null
    public ICollection<CustomFieldValue> CustomFieldValues { get; set; } = new List<CustomFieldValue>();
}
