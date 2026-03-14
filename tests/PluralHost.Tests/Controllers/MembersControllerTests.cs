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

    public void Dispose() => _context.Dispose();
}
