using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class BoardMessageTests
{
    [Fact]
    public void BoardMessage_SoftDelete_SetsDeletedAt()
    {
        var msg = new BoardMessage { MemberId = Guid.NewGuid(), AuthorName = "Ash", Content = "hi" };
        Assert.Null(msg.DeletedAt);
        msg.SoftDelete();
        Assert.NotNull(msg.DeletedAt);
    }

    [Fact]
    public void BoardMessage_HasBaseEntityProperties()
    {
        var msg = new BoardMessage { MemberId = Guid.NewGuid(), AuthorName = "Ash", Content = "hello" };
        Assert.NotEqual(Guid.Empty, msg.Id);
        Assert.True(msg.CreatedAt <= DateTime.UtcNow);
    }
}
