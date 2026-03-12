using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class MemberTests
{
    [Fact]
    public void NewMember_DefaultsToActiveStatus()
    {
        var member = new Member { Name = "Ash" };
        Assert.Equal(MemberStatus.Active, member.Status);
    }

    [Fact]
    public void NewMember_IsNotPrivateByDefault()
    {
        var member = new Member { Name = "Ash" };
        Assert.False(member.IsPrivate);
    }

    [Fact]
    public void FusedMember_CanLinkToParents()
    {
        var parent1 = new Member { Name = "A" };
        var parent2 = new Member { Name = "B" };
        var fused = new Member { Name = "AB", Status = MemberStatus.Fused };
        fused.ParentIds.Add(parent1.Id);
        fused.ParentIds.Add(parent2.Id);

        Assert.Equal(2, fused.ParentIds.Count);
    }
}
