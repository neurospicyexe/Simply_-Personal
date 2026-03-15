namespace PluralHost.Api.Domain;

public class CustomFieldValue : BaseEntity
{
    public Guid FieldId { get; set; }
    public CustomField Field { get; set; } = null!;

    public Guid MemberId { get; set; }
    public Member Member { get; set; } = null!;

    public string Value { get; set; } = string.Empty;
    public MemberPrivacy PrivacyTier { get; set; } = MemberPrivacy.Public;
}
