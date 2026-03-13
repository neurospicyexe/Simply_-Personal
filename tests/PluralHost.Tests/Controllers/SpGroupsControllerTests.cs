using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class SpGroupsControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly SpGroupsController _controller;

    public SpGroupsControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new SpGroupsController(_context);
    }

    [Fact]
    public async Task List_NoGroups_ReturnsEmptyArray()
    {
        var result = await _controller.ListAsync("owner") as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Empty(items);
    }

    [Fact]
    public async Task Get_ExistingGroup_ReturnsEnvelopeWithMembers()
    {
        var m = new Member { Name = "Ada" };
        var g = new Group { Name = "Protectors", Members = [m] };
        _context.Members.Add(m);
        _context.Groups.Add(g);
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync("owner", g.Id.ToString()) as OkObjectResult;
        var env = Assert.IsType<SpEnvelope<SpGroupContent>>(result!.Value);
        Assert.True(env.Exists);
        Assert.Single(env.Content.Members);
    }

    [Fact]
    public async Task Get_Nonexistent_Returns404()
    {
        var result = await _controller.GetAsync("owner", Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsGroupId()
    {
        var result = await _controller.CreateAsync(
            new SpGroupCreateRequest("Protectors")) as OkObjectResult;
        var id = Assert.IsType<string>(result!.Value);
        Assert.False(string.IsNullOrEmpty(id));
        Assert.Equal(1, await _context.Groups.CountAsync());
    }

    [Fact]
    public async Task Create_EmptyName_Returns400()
    {
        var result = await _controller.CreateAsync(new SpGroupCreateRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_ExistingGroup_UpdatesFields()
    {
        var g = new Group { Name = "Old" };
        _context.Groups.Add(g);
        await _context.SaveChangesAsync();

        await _controller.UpdateAsync(g.Id.ToString(), new SpGroupUpdateRequest(Name: "New"));
        var updated = await _context.Groups.FindAsync(g.Id);
        Assert.Equal("New", updated!.Name);
    }

    [Fact]
    public async Task SetMemberships_AssignsMemberToGroups()
    {
        var m = new Member { Name = "Ada" };
        var g1 = new Group { Name = "A" };
        var g2 = new Group { Name = "B" };
        _context.Members.Add(m);
        _context.Groups.AddRange(g1, g2);
        await _context.SaveChangesAsync();

        var result = await _controller.SetMembershipsAsync(new SpSetGroupMembershipsRequest(
            Member: m.Id.ToString(),
            Groups: [g1.Id.ToString(), g2.Id.ToString()]));
        Assert.IsType<OkResult>(result);

        var member = await _context.Members.Include(x => x.Groups).FirstAsync(x => x.Id == m.Id);
        Assert.Equal(2, member.Groups.Count);
    }

    [Fact]
    public async Task Delete_ExistingGroup_SoftDeletes()
    {
        var g = new Group { Name = "To Delete" };
        _context.Groups.Add(g);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(g.Id.ToString());
        Assert.IsType<OkResult>(result);

        var raw = await _context.Groups.IgnoreQueryFilters()
            .FirstAsync(x => x.Id == g.Id);
        Assert.NotNull(raw.DeletedAt);
    }

    public void Dispose() => _context.Dispose();
}
