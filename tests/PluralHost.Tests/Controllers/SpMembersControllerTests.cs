using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class SpMembersControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly SpMembersController _controller;

    public SpMembersControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _controller = new SpMembersController(_context);
    }

    [Fact]
    public async Task List_NoMembers_ReturnsEmptyArray()
    {
        var result = await _controller.ListAsync("owner") as OkObjectResult;
        Assert.NotNull(result);
        var list = Assert.IsAssignableFrom<IEnumerable<object>>(result.Value);
        Assert.Empty(list);
    }

    [Fact]
    public async Task List_WithMembers_ReturnsEnvelopes()
    {
        _context.Members.Add(new Member { Name = "Ada" });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync("owner") as OkObjectResult;
        var items = Assert.IsAssignableFrom<IEnumerable<object>>(result!.Value);
        Assert.Single(items);
    }

    [Fact]
    public async Task Get_ExistingMember_ReturnsEnvelope()
    {
        var m = new Member { Name = "Ada" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync("owner", m.Id.ToString()) as OkObjectResult;
        Assert.NotNull(result);
        var env = Assert.IsType<SpEnvelope<SpMemberContent>>(result.Value);
        Assert.True(env.Exists);
        Assert.Equal("Ada", env.Content.Name);
    }

    [Fact]
    public async Task Get_NonexistentMember_Returns404()
    {
        var result = await _controller.GetAsync("owner", Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsMemberId()
    {
        var result = await _controller.CreateAsync(new SpMemberCreateRequest("Bex")) as OkObjectResult;
        Assert.NotNull(result);
        var id = Assert.IsType<string>(result.Value);
        Assert.False(string.IsNullOrEmpty(id));
        Assert.Equal(1, await _context.Members.CountAsync());
    }

    [Fact]
    public async Task Create_EmptyName_Returns400()
    {
        var result = await _controller.CreateAsync(new SpMemberCreateRequest(""));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_ExistingMember_UpdatesFields()
    {
        var m = new Member { Name = "Old", Description = "old desc" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(m.Id.ToString(),
            new SpMemberUpdateRequest(Desc: "new desc"));
        Assert.IsType<OkResult>(result);

        var updated = await _context.Members.FindAsync(m.Id);
        Assert.Equal("new desc", updated!.Description);
    }

    [Fact]
    public async Task Update_NonexistentMember_Returns404()
    {
        var result = await _controller.UpdateAsync(Guid.NewGuid().ToString(),
            new SpMemberUpdateRequest(Name: "X"));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_ExistingMember_SoftDeletes()
    {
        var m = new Member { Name = "Ada" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteAsync(m.Id.ToString());
        Assert.IsType<OkResult>(result);

        var raw = await _context.Members.IgnoreQueryFilters()
            .FirstAsync(x => x.Id == m.Id);
        Assert.NotNull(raw.DeletedAt);
    }

    [Fact]
    public async Task Delete_NonexistentMember_Returns404()
    {
        var result = await _controller.DeleteAsync(Guid.NewGuid().ToString());
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Create_WithPrivateTrue_SetsBucketToPrivate()
    {
        var result = await _controller.CreateAsync(
            new SpMemberCreateRequest("Ash", Private: true)) as OkObjectResult;

        var id = Guid.Parse(result!.Value!.ToString()!);
        var member = await _context.Members.FindAsync(id);
        Assert.Equal(PrivacyBucket.PrivateId, member!.BucketId);
    }

    [Fact]
    public async Task Create_WithPrivateFalse_SetsBucketToPublic()
    {
        var result = await _controller.CreateAsync(
            new SpMemberCreateRequest("Ash", Private: false)) as OkObjectResult;

        var id = Guid.Parse(result!.Value!.ToString()!);
        var member = await _context.Members.FindAsync(id);
        Assert.Equal(PrivacyBucket.PublicId, member!.BucketId);
    }

    [Fact]
    public async Task Update_PrivateFalse_OnFriendBucket_LeavesUnchanged()
    {
        var m = new Member { Name = "Ash", BucketId = PrivacyBucket.FriendId };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        await _controller.UpdateAsync(m.Id.ToString(),
            new SpMemberUpdateRequest { Private = false });

        var updated = await _context.Members.FindAsync(m.Id);
        Assert.Equal(PrivacyBucket.FriendId, updated!.BucketId);
    }

    [Fact]
    public async Task Update_PrivateFalse_OnPrivateBucket_SetsToPublic()
    {
        var m = new Member { Name = "Ash", BucketId = PrivacyBucket.PrivateId };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        await _controller.UpdateAsync(m.Id.ToString(),
            new SpMemberUpdateRequest { Private = false });

        var updated = await _context.Members.FindAsync(m.Id);
        Assert.Equal(PrivacyBucket.PublicId, updated!.BucketId);
    }

    [Fact]
    public async Task ToEnvelope_PrivateBucketMember_ReturnsPrivateTrue()
    {
        var m = new Member { Name = "Ash", BucketId = PrivacyBucket.PrivateId };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync("owner", m.Id.ToString()) as OkObjectResult;
        var envelope = result!.Value as SpEnvelope<SpMemberContent>;
        Assert.True(envelope!.Content.Private);
    }

    [Fact]
    public async Task ToEnvelope_FriendBucketMember_ReturnsPrivateFalse()
    {
        var m = new Member { Name = "Ash", BucketId = PrivacyBucket.FriendId };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.GetAsync("owner", m.Id.ToString()) as OkObjectResult;
        var envelope = result!.Value as SpEnvelope<SpMemberContent>;
        Assert.False(envelope!.Content.Private);
    }

    public void Dispose() => _context.Dispose();
}
