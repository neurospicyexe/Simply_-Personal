using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class SystemSettingsTests
{
    [Fact]
    public void ShouldAutoUnfreeze_WhenFreezeEndDatePassed_ReturnsTrue()
    {
        var settings = new SystemSettings
        {
            IsFrozen = true,
            FreezeEndDate = DateTime.UtcNow.AddHours(-1)
        };
        Assert.True(settings.ShouldAutoUnfreeze());
    }

    [Fact]
    public void ShouldAutoUnfreeze_WhenFreezeEndDateFuture_ReturnsFalse()
    {
        var settings = new SystemSettings
        {
            IsFrozen = true,
            FreezeEndDate = DateTime.UtcNow.AddHours(1)
        };
        Assert.False(settings.ShouldAutoUnfreeze());
    }

    [Fact]
    public void ShouldAutoUnfreeze_WhenNoFreezeEndDate_ReturnsFalse()
    {
        var settings = new SystemSettings { IsFrozen = true };
        Assert.False(settings.ShouldAutoUnfreeze());
    }

    [Fact]
    public void HasPendingDeletion_WhenCooldownSet_ReturnsTrue()
    {
        var settings = new SystemSettings
        {
            DeletionCooldownEnd = DateTime.UtcNow.AddDays(2)
        };
        Assert.True(settings.HasPendingDeletion());
    }

    [Fact]
    public void DeletionIsFinalized_WhenCooldownPassed_ReturnsTrue()
    {
        var settings = new SystemSettings
        {
            DeletionCooldownEnd = DateTime.UtcNow.AddHours(-1)
        };
        Assert.True(settings.DeletionIsFinalized());
    }
}
