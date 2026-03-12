using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class BaseEntityTests
{
    [Fact]
    public void NewEntity_HasNoDeletedAt()
    {
        var entity = new ConcreteEntity();
        Assert.Null(entity.DeletedAt);
    }

    [Fact]
    public void SoftDelete_SetsDeletedAt()
    {
        var entity = new ConcreteEntity();
        entity.SoftDelete();
        Assert.NotNull(entity.DeletedAt);
    }

    [Fact]
    public void Restore_ClearsDeletedAt()
    {
        var entity = new ConcreteEntity();
        entity.SoftDelete();
        entity.Restore();
        Assert.Null(entity.DeletedAt);
    }

    [Fact]
    public void SoftDelete_UpdatesUpdatedAt()
    {
        var entity = new ConcreteEntity();
        var before = entity.UpdatedAt;
        System.Threading.Thread.Sleep(1); // ensure time advances
        entity.SoftDelete();
        Assert.True(entity.UpdatedAt > before);
    }

    [Fact]
    public void Restore_UpdatesUpdatedAt()
    {
        var entity = new ConcreteEntity();
        entity.SoftDelete();
        var afterDelete = entity.UpdatedAt;
        System.Threading.Thread.Sleep(1);
        entity.Restore();
        Assert.True(entity.UpdatedAt > afterDelete);
    }

    // Concrete subclass for testing the abstract base
    private class ConcreteEntity : BaseEntity { }
}
