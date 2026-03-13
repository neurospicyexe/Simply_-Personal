namespace PluralHost.Api.Domain;

public class Group : BaseEntity
{
    public required string Name { get; set; }
    public string? Description { get; set; }
    public string? Color { get; set; }
    public string? Emoji { get; set; }
    public bool IsPrivate { get; set; } = false;

    // Many-to-many: members in this group
    public List<Member> Members { get; set; } = [];
}
