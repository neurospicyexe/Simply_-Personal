using Microsoft.EntityFrameworkCore;
using Moq;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;
using PluralHost.Api.Services;
using Xunit;

namespace PluralHost.Tests.Services;

public class ImportServiceTests : IDisposable
{
    private readonly PluralHostContext _context;
    private readonly Mock<IAvatarDownloadService> _avatars;
    private readonly IImportService _svc;

    public ImportServiceTests()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        _context = new PluralHostContext(opts);
        _context.Database.EnsureCreated();
        _avatars = new Mock<IAvatarDownloadService>();
        _avatars.Setup(a => a.DownloadAvatarAsync(It.IsAny<string>(), default))
                .ReturnsAsync((string?)null);
        _svc = new ImportService(_context, _avatars.Object);
    }

    // --- SP import tests ---

    [Fact]
    public async Task ImportSp_NewMember_CreatesRow()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: "Fire alter", Pronouns: "she/her",
                PkId: null, Color: "#ff0000", AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Created);
        Assert.Equal(0, result.Errors.Count);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("Ember", member.Name);
        Assert.Equal("sp-001", member.SpMemberId);
        Assert.Equal("#ff0000", member.Color);
    }

    [Fact]
    public async Task ImportSp_ExistingMember_Skip()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember Updated", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.Skip,
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Skipped);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("Ember", member.Name); // unchanged
    }

    [Fact]
    public async Task ImportSp_ExistingMember_MergePreferExisting_FillsBlanks()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = null });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: "Bio", Pronouns: "they/them",
                PkId: null, Color: "#ff0000", AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Updated);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("they/them", member.Pronouns); // was null, now filled
        Assert.Equal("Bio", member.Description);    // was null, now filled
    }

    [Fact]
    public async Task ImportSp_ExistingMember_MergePreferExisting_KeepsExistingPronouns()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: "they/them",
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("she/her", member.Pronouns); // kept — existing is not null
    }

    [Fact]
    public async Task ImportSp_ExistingMember_MergePreferImported_OverwritesNonNull()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: "they/them",
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.MergePreferImported,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("they/them", member.Pronouns); // imported non-null wins
    }

    [Fact]
    public async Task ImportSp_ExistingMember_Overwrite_ReplacesFields()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: "they/them",
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.Overwrite,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("they/them", member.Pronouns);
    }

    [Fact]
    public async Task ImportSp_Duplicate_CreatesNewEvenIfMatchExists()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.Duplicate,
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Created);
        Assert.Equal(2, await _context.Members.CountAsync()); // original + duplicate
    }

    [Fact]
    public async Task ImportSp_BlankName_AddsError()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(0, result.Created);
        Assert.Single(result.Errors);
        Assert.Equal("sp-001", result.Errors[0].SourceId);
    }

    [Fact]
    public async Task ImportSp_SetsSpPrivateTrue_SetsPrivacyTierPrivate()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Shadow", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: true,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal(MemberPrivacy.Private, member.PrivacyTier);
    }

    [Fact]
    public async Task ImportSp_WithPkId_SetsPkIdOnMember()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: "pk-uuid-abc", Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal("pk-uuid-abc", member.PkId);
    }

    [Fact]
    public async Task ImportSp_WithCustomFields_CreatesFieldValues()
    {
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: new Dictionary<string, string> { ["field-id-001"] = "Pyromancer" }))],
            CustomFields: [new SpCustomFieldEntry("field-id-001", new SpCustomFieldContent("Role", 0, false))],
            IncludeCustomFields: true,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var cfvs = await _context.CustomFieldValues.ToListAsync();
        Assert.Single(cfvs);
        Assert.Equal("Pyromancer", cfvs[0].Value);
        Assert.Equal(MemberPrivacy.Private, cfvs[0].PrivacyTier); // always private on import
    }

    [Fact]
    public async Task ImportSp_SpPrivateFalse_WhenCurrentlyPrivate_SetsPublic()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", PrivacyTier = MemberPrivacy.Private });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: null))],
            ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal(MemberPrivacy.Public, member.PrivacyTier); // false + currently Private → Public
    }

    public void Dispose() => _context.Dispose();
}
