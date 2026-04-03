namespace PluralHost.Api.Domain;

public class BucketFieldExclusion : BaseEntity
{
    public Guid BucketId { get; set; }
    public PrivacyBucket Bucket { get; set; } = null!;
    public Guid FieldId { get; set; }
    public CustomField Field { get; set; } = null!;
}
