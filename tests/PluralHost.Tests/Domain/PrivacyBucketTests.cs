using PluralHost.Api.Domain;

namespace PluralHost.Tests.Domain;

public class PrivacyBucketTests
{
    [Fact]
    public void PrivacyBucket_HasRequiredName()
    {
        var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10 };
        Assert.Equal("Test", bucket.Name);
        Assert.Equal(10, bucket.SortOrder);
        Assert.False(bucket.IsDefault);
    }

    [Fact]
    public void PrivacyBucket_SoftDelete_SetsDeletedAt()
    {
        var bucket = new PrivacyBucket { Name = "Test", SortOrder = 10 };
        bucket.SoftDelete();
        Assert.NotNull(bucket.DeletedAt);
    }

    [Fact]
    public void PrivacyBucket_DefaultBucketGuids_AreStable()
    {
        Assert.Equal(
            Guid.Parse("00000000-0000-0000-0000-000000000001"),
            PrivacyBucket.PublicId);
        Assert.Equal(
            Guid.Parse("00000000-0000-0000-0000-000000000004"),
            PrivacyBucket.PrivateId);
    }
}
