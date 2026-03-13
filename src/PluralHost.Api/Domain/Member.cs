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
}
