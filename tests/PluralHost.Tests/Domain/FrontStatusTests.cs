using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class FrontStatusTests
{
    [Fact]
    public void FrontStatus_DefaultValues_AreCorrect()
    {
        var status = new FrontStatus { Label = "Co-con" };
        Assert.False(status.IsDefault);
        Assert.False(status.IsHidden);
        Assert.Null(status.Color);
    }

    [Fact]
    public void SeedIds_AreStableGuids()
    {
        Assert.Equal(new Guid("a1000000-0000-0000-0000-000000000001"), FrontStatus.SeedIds.CoCon);
        Assert.Equal(new Guid("a1000000-0000-0000-0000-000000000010"), FrontStatus.SeedIds.FrontingAlone);
    }

    [Fact]
    public void SeedIds_AllTenAreDistinct()
    {
        var ids = new[]
        {
            FrontStatus.SeedIds.CoCon, FrontStatus.SeedIds.Blending,
            FrontStatus.SeedIds.Switching, FrontStatus.SeedIds.Stressed,
            FrontStatus.SeedIds.Dissociating, FrontStatus.SeedIds.Foggy,
            FrontStatus.SeedIds.PassiveInfluence, FrontStatus.SeedIds.FullSwitch,
            FrontStatus.SeedIds.PartialSwitch, FrontStatus.SeedIds.FrontingAlone
        };
        Assert.Equal(10, ids.Distinct().Count());
    }
}
