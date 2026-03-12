namespace PluralHost.Api.Domain;

public class Group : BaseEntity
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Color { get; set; }
    public bool IsPrivate { get; set; } = false;

    // Navigation: members in this group (managed via join table)
    public List<Member> Members { get; set; } = [];
}
