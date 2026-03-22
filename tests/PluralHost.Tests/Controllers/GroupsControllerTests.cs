using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class GroupsControllerTests : IDisposable
{
    private readonly PluralHostContext _ctx;
    private readonly GroupsController _sut;

    public GroupsControllerTests()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _ctx = new PluralHostContext(opts);
        _sut = new GroupsController(_ctx);
    }

    [Fact]
    public async Task SetMembers_AddsNewMembers()
    {
        var group = new Group { Name = "Alpha" };
        var m1 = new Member { Name = "A", BucketId = PrivacyBucket.PublicId };
        var m2 = new Member { Name = "B", BucketId = PrivacyBucket.PublicId };
        _ctx.Groups.Add(group);
        _ctx.Members.AddRange(m1, m2);
        _ctx.SaveChanges();

        var req = new SetGroupMembersRequest([m1.Id, m2.Id]);
        var result = await _sut.SetMembersAsync(group.Id, req);

        Assert.IsType<NoContentResult>(result);
        var updated1 = await _ctx.Members.FindAsync(m1.Id);
        var updated2 = await _ctx.Members.FindAsync(m2.Id);
        Assert.Contains(group.Id, updated1!.ParentIds);
        Assert.Contains(group.Id, updated2!.ParentIds);
    }

    [Fact]
    public async Task SetMembers_RemovesMembersNotInList()
    {
        var group = new Group { Name = "Beta" };
        var m1 = new Member { Name = "C", BucketId = PrivacyBucket.PublicId };
        _ctx.Groups.Add(group);
        _ctx.Members.Add(m1);
        _ctx.SaveChanges();
        m1.ParentIds = [group.Id];
        _ctx.SaveChanges();

        var result = await _sut.SetMembersAsync(group.Id, new SetGroupMembersRequest([]));

        Assert.IsType<NoContentResult>(result);
        var updated = await _ctx.Members.FindAsync(m1.Id);
        Assert.DoesNotContain(group.Id, updated!.ParentIds);
    }

    [Fact]
    public async Task SetMembers_UnknownGroup_Returns404()
    {
        var result = await _sut.SetMembersAsync(Guid.NewGuid(), new SetGroupMembersRequest([]));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task GetAll_ReturnsMemberCount()
    {
        var group = new Group { Name = "Counted" };
        var m1 = new Member { Name = "X", BucketId = PrivacyBucket.PublicId };
        _ctx.Groups.Add(group);
        _ctx.Members.Add(m1);
        _ctx.SaveChanges();
        m1.ParentIds = [group.Id];
        _ctx.SaveChanges();

        var result = await _sut.GetAllAsync();
        var ok = Assert.IsType<OkObjectResult>(result);
        var list = Assert.IsAssignableFrom<System.Collections.IEnumerable>(ok.Value);
        var first = list.Cast<object>().First();
        var memberCount = (int)first.GetType().GetProperty("memberCount")!.GetValue(first)!;
        Assert.Equal(1, memberCount);
    }

    [Fact]
    public async Task Create_AddsGroup()
    {
        var result = await _sut.CreateAsync(new GroupCreateRequest("Gamma", "#ff0000"));
        Assert.IsType<CreatedAtActionResult>(result);
        Assert.Equal(1, _ctx.Groups.Count());
    }

    [Fact]
    public async Task Delete_SoftDeletesGroup()
    {
        var group = new Group { Name = "Delta" };
        _ctx.Groups.Add(group);
        _ctx.SaveChanges();

        await _sut.DeleteAsync(group.Id);
        var found = _ctx.Groups.IgnoreQueryFilters().First(g => g.Id == group.Id);
        Assert.NotNull(found.DeletedAt);
    }

    public void Dispose() => _ctx.Dispose();
}
