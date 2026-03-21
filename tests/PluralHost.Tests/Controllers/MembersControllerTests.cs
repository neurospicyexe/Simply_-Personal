using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Controllers;

public class MembersControllerTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IMemberService> _memberService;
    private readonly MembersController _controller;

    public MembersControllerTests()
    {
        var options = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        _context = new PluralHostContext(options);
        _context.Database.EnsureCreated();
        _memberService = new Mock<IMemberService>();
        _controller = new MembersController(_context, _memberService.Object);
    }

    [Fact]
    public async Task List_ExcludesArchivedByDefault()
    {
        _context.Members.Add(new Member { Name = "Active" });
        _context.Members.Add(new Member { Name = "Archived", IsArchived = true });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync(includeArchived: false) as OkObjectResult;
        var members = result!.Value as IEnumerable<MemberResponse>;
        Assert.Single(members!);
        Assert.Equal("Active", members!.First().Name);
    }

    [Fact]
    public async Task List_IncludesArchivedWhenRequested()
    {
        _context.Members.Add(new Member { Name = "Active" });
        _context.Members.Add(new Member { Name = "Archived", IsArchived = true });
        await _context.SaveChangesAsync();

        var result = await _controller.ListAsync(includeArchived: true) as OkObjectResult;
        var members = result!.Value as IEnumerable<MemberResponse>;
        Assert.Equal(2, members!.Count());
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsMemberResponse()
    {
        var result = await _controller.CreateAsync(
            new MemberCreateRequest("Ash", Pronouns: "they/them")) as OkObjectResult;
        var member = result!.Value as MemberResponse;
        Assert.Equal("Ash", member!.Name);
        Assert.Equal("they/them", member.Pronouns);
    }

    [Fact]
    public async Task Update_ExtraImages_MoreThanThree_Returns400()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(m.Id,
            new MemberUpdateRequest(ExtraImages: ["a", "b", "c", "d"]));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Update_ParentIds_CallsMemberService()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        _memberService
            .Setup(s => s.ValidateParentIdsAsync(m.Id, It.IsAny<List<Guid>>()))
            .ReturnsAsync(ValidationResult.Ok());

        await _controller.UpdateAsync(m.Id,
            new MemberUpdateRequest(ParentIds: [Guid.NewGuid()]));

        _memberService.Verify(s => s.ValidateParentIdsAsync(m.Id, It.IsAny<List<Guid>>()), Times.Once);
    }

    [Fact]
    public async Task Update_ParentIdsCycle_Returns400()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        _memberService
            .Setup(s => s.ValidateParentIdsAsync(m.Id, It.IsAny<List<Guid>>()))
            .ReturnsAsync(ValidationResult.Fail("Circular parent reference detected"));

        var result = await _controller.UpdateAsync(m.Id,
            new MemberUpdateRequest(ParentIds: [m.Id]));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_DefaultPrivacyTier_IsPublic()
    {
        var result = await _controller.CreateAsync(
            new MemberCreateRequest("Ash")) as OkObjectResult;
        var member = result!.Value as MemberResponse;
        Assert.Equal(MemberPrivacy.Public, member!.PrivacyTier);
    }

    [Fact]
    public async Task Update_PrivacyTier_Persists()
    {
        var created = _context.Members.Add(new Member { Name = "Ash" });
        await _context.SaveChangesAsync();

        await _controller.UpdateAsync(created.Entity.Id,
            new MemberUpdateRequest(PrivacyTier: MemberPrivacy.Trusted));

        var updated = await _context.Members.FindAsync(created.Entity.Id);
        Assert.Equal(MemberPrivacy.Trusted, updated!.PrivacyTier);
    }

    [Fact]
    public async Task Update_AllowsBoardPosting_Persists()
    {
        var created = _context.Members.Add(new Member { Name = "Ash" });
        await _context.SaveChangesAsync();

        await _controller.UpdateAsync(created.Entity.Id,
            new MemberUpdateRequest(AllowsBoardPosting: false));

        var updated = await _context.Members.FindAsync(created.Entity.Id);
        Assert.False(updated!.AllowsBoardPosting);
    }

    [Fact]
    public async Task Update_AvatarPath_PersistsValue()
    {
        var m = new Member { Name = "Ash" };
        _context.Members.Add(m);
        await _context.SaveChangesAsync();

        var result = await _controller.UpdateAsync(m.Id,
            new MemberUpdateRequest(AvatarPath: "abc123.jpg")) as OkObjectResult;
        var response = result!.Value as MemberResponse;
        Assert.Equal("abc123.jpg", response!.AvatarPath);
    }

    public void Dispose() => _context.Dispose();
}
