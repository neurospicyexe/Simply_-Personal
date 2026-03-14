namespace PluralHost.Api.Domain;

public enum MemberStatus { Active, Dormant, Fused, Gone }

public class Member : BaseEntity
{
    public required string Name { get; set; }
    public string? DisplayName { get; set; }
    public string? Pronouns { get; set; }
    public string? AvatarPath { get; set; }   // Relative path under /secure_uploads/
    public string? Color { get; set; }         // Hex color for UI
    public string? Role { get; set; }
    public string? Description { get; set; }
    public bool IsPrivate { get; set; } = false;
    public MemberStatus Status { get; set; } = MemberStatus.Active;

    // Lineage: for Fused members, the IDs of their parents
    public List<Guid> ParentIds { get; set; } = [];

    // Many-to-many: a member can belong to multiple groups
    public List<Group> Groups { get; set; } = [];

    // ── New fields ────────────────────────────────────────────────────
    public bool IsPinned { get; set; } = false;
    public bool IsArchived { get; set; } = false;
    public bool IsUntracked { get; set; } = false;
    public List<string> ExtraImages { get; set; } = [];
    public bool PreventFrontNotification { get; set; } = false;
    public bool ReceiveBoardNotifications { get; set; } = true;
    public string? SpMemberId { get; set; }
}
