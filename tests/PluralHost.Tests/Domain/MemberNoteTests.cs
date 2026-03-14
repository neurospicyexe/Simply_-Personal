using PluralHost.Api.Domain;
using Xunit;

namespace PluralHost.Tests.Domain;

public class MemberNoteTests
{
    [Fact]
    public void MemberNote_DefaultValues_AreCorrect()
    {
        var note = new MemberNote { MemberId = Guid.NewGuid(), Content = "some note" };
        Assert.False(note.IsPinned);
        Assert.False(note.IsLocked);
        Assert.Null(note.Title);
    }

    [Fact]
    public void MemberNote_SoftDelete_SetsDeletedAt()
    {
        var note = new MemberNote { MemberId = Guid.NewGuid(), Content = "content" };
        note.SoftDelete();
        Assert.NotNull(note.DeletedAt);
    }
}
