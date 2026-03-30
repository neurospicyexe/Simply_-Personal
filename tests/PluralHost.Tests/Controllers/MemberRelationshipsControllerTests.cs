using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class MemberRelationshipsControllerTests
{
    private static (PluralHostContext ctx, MemberRelationshipsController ctrl) Setup(string db)
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(db)
            .Options;
        var ctx = new PluralHostContext(opts);
        ctx.SystemSettings.Add(new SystemSettings { Id = 1 });
        ctx.SaveChanges();
        return (ctx, new MemberRelationshipsController(ctx));
    }

    private static Guid SeedMember(PluralHostContext ctx)
    {
        var id = Guid.NewGuid();
        ctx.Members.Add(new Member { Id = id, Name = "Test", BucketId = PrivacyBucket.PublicId });
        ctx.SaveChanges();
        return id;
    }

    [Fact]
    public async Task GetAll_ReturnsNonDeletedRelationships()
    {
        var (ctx, ctrl) = Setup(nameof(GetAll_ReturnsNonDeletedRelationships));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "siblings" });
        var deleted = new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "old" };
        deleted.SoftDelete();
        ctx.MemberRelationships.Add(deleted);
        ctx.SaveChanges();

        var result = await ctrl.GetAllAsync();
        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IEnumerable<MemberRelationshipResponse>>(ok.Value);
        Assert.Single(items);
        Assert.Equal("siblings", items.First().Label);
    }

    [Fact]
    public async Task GetAll_WhenFrozen_ReturnsEmpty()
    {
        var (ctx, ctrl) = Setup(nameof(GetAll_WhenFrozen_ReturnsEmpty));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "siblings" });
        var settings = ctx.SystemSettings.First();
        settings.IsFrozen = true;
        ctx.SaveChanges();

        var result = await ctrl.GetAllAsync();
        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IEnumerable<MemberRelationshipResponse>>(ok.Value);
        Assert.Empty(items);
    }

    [Fact]
    public async Task Create_WithValidMembers_Returns201()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithValidMembers_Returns201));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "parent of", true));
        var created = Assert.IsType<CreatedAtActionResult>(result);
        var rel = Assert.IsType<MemberRelationshipResponse>(created.Value);
        Assert.Equal("parent of", rel.Label);
        Assert.True(rel.IsDirected);
        Assert.Equal(fromId, rel.FromMemberId);
        Assert.Equal(toId, rel.ToMemberId);
    }

    [Fact]
    public async Task Create_WithDeletedMember_Returns400()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithDeletedMember_Returns400));
        var fromId = SeedMember(ctx);
        var member = ctx.Members.Find(fromId)!;
        member.SoftDelete();
        ctx.SaveChanges();
        var toId = SeedMember(ctx);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "siblings", false));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_WithEmptyLabel_Returns400()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithEmptyLabel_Returns400));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "   ", false));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_WithSelfRelationship_Returns400()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithSelfRelationship_Returns400));
        var memberId = SeedMember(ctx);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(memberId, memberId, "self", false));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_WithLabelTooLong_Returns400()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithLabelTooLong_Returns400));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        var longLabel = new string('x', 101);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, longLabel, false));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_ReturnConflict_WhenSamePairAndLabelExists()
    {
        var (ctx, ctrl) = Setup(nameof(Create_ReturnConflict_WhenSamePairAndLabelExists));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "siblings" });
        ctx.SaveChanges();

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "siblings", false));
        Assert.IsType<ConflictObjectResult>(result);
    }

    [Fact]
    public async Task Create_Returns201_WhenSamePairDifferentLabel()
    {
        var (ctx, ctrl) = Setup(nameof(Create_Returns201_WhenSamePairDifferentLabel));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "mom" });
        ctx.SaveChanges();

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "caretaker", false));
        Assert.IsType<CreatedAtActionResult>(result);
    }

    [Fact]
    public async Task Patch_UpdatesLabelAndDirection()
    {
        var (ctx, ctrl) = Setup(nameof(Patch_UpdatesLabelAndDirection));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        var rel = new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "old", IsDirected = false };
        ctx.MemberRelationships.Add(rel);
        ctx.SaveChanges();

        var result = await ctrl.UpdateAsync(rel.Id, new MemberRelationshipUpdateRequest("new label", true));
        var ok = Assert.IsType<OkObjectResult>(result);
        var updated = Assert.IsType<MemberRelationshipResponse>(ok.Value);
        Assert.Equal("new label", updated.Label);
        Assert.True(updated.IsDirected);
    }

    [Fact]
    public async Task Patch_NotFound_Returns404()
    {
        var (_, ctrl) = Setup(nameof(Patch_NotFound_Returns404));
        var result = await ctrl.UpdateAsync(Guid.NewGuid(), new MemberRelationshipUpdateRequest("x", null));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_SoftDeletesRelationship()
    {
        var (ctx, ctrl) = Setup(nameof(Delete_SoftDeletesRelationship));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        var rel = new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "rivals" };
        ctx.MemberRelationships.Add(rel);
        ctx.SaveChanges();

        var result = await ctrl.DeleteAsync(rel.Id);
        Assert.IsType<NoContentResult>(result);

        var inDb = ctx.MemberRelationships.IgnoreQueryFilters().First(r => r.Id == rel.Id);
        Assert.NotNull(inDb.DeletedAt);
    }
}
