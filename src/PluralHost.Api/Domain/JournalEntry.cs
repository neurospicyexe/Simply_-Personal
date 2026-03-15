namespace PluralHost.Api.Domain;

public class JournalEntry : BaseEntity
{
    public string? Title { get; set; }
    public string Content { get; set; } = string.Empty;
    public bool IsPrivate { get; set; } = true;
}
