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

    [Fact]
    public async Task ImportSp_WithCustomFields_RespectsConflictStrategy_MergePreferExisting()
    {
        // Arrange: pre-seed custom field definition and a value
        var field = new PluralHost.Api.Domain.CustomField { Label = "Role", SpFieldId = "field-id-001" };
        _context.CustomFields.Add(field);
        var member = new Member { Name = "Ember", SpMemberId = "sp-001" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();
        var cfv = new PluralHost.Api.Domain.CustomFieldValue
        {
            FieldId = field.Id, MemberId = member.Id, Value = "OldRole",
            PrivacyTier = MemberPrivacy.Private
        };
        _context.CustomFieldValues.Add(cfv);
        await _context.SaveChangesAsync();

        // Act: import with MergePreferExisting — existing value should NOT be overwritten
        var req = new SpImportRequest(
            Members: [new SpMemberEntry("sp-001", new SpImportMemberContent(
                Name: "Ember", Desc: null, Pronouns: null,
                PkId: null, Color: null, AvatarUrl: null,
                Private: false,
                PreventsFrontNotifs: false, ReceiveMessageBoardNotifs: true,
                Archived: false, Info: new Dictionary<string, string> { ["field-id-001"] = "NewRole" }))],
            CustomFields: [new SpCustomFieldEntry("field-id-001", new SpCustomFieldContent("Role", 0, false))],
            ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
            IncludeCustomFields: true,
            IncludeAvatars: false);

        await _svc.ImportSpAsync(req);

        // Assert: OldRole kept (existing non-null wins with MergePreferExisting)
        var updated = await _context.CustomFieldValues.FirstAsync();
        Assert.Equal("OldRole", updated.Value);
    }

    // --- PK import tests ---

    [Fact]
    public async Task ImportPk_NewMember_CreatesRow()
    {
        var req = new PkImportRequest(
            Members: [new PkMemberEntry(
                Uuid: "pk-uuid-001", Name: "Ember",
                DisplayName: "Ember the Fire", Pronouns: "she/her",
                Color: "ff0000", AvatarUrl: null, Description: "Fire alter",
                Birthday: "1995-04-20", Privacy: null)],
            IncludeAvatars: false);

        var result = await _svc.ImportPkAsync(req);

        Assert.Equal(1, result.Created);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("Ember", member.Name);
        Assert.Equal("pk-uuid-001", member.PkId);
        Assert.Equal("#ff0000", member.Color); // # prepended
        Assert.Equal("1995-04-20", member.Birthday);
        Assert.Equal("Ember the Fire", member.DisplayName);
    }

    [Fact]
    public async Task ImportPk_ExistingMember_Skip()
    {
        _context.Members.Add(new Member { Name = "Ember", PkId = "pk-uuid-001" });
        await _context.SaveChangesAsync();

        var req = new PkImportRequest(
            Members: [new PkMemberEntry(
                Uuid: "pk-uuid-001", Name: "Ember Updated",
                DisplayName: null, Pronouns: null,
                Color: null, AvatarUrl: null, Description: null,
                Birthday: null, Privacy: null)],
            ConflictStrategy: ImportConflictStrategy.Skip,
            IncludeAvatars: false);

        var result = await _svc.ImportPkAsync(req);

        Assert.Equal(1, result.Skipped);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("Ember", member.Name); // unchanged
    }

    [Fact]
    public async Task ImportPk_PrivateVisibility_SetsPrivacyTierPrivate()
    {
        var req = new PkImportRequest(
            Members: [new PkMemberEntry(
                Uuid: "pk-uuid-001", Name: "Shadow",
                DisplayName: null, Pronouns: null,
                Color: null, AvatarUrl: null, Description: null,
                Birthday: null, Privacy: new PkMemberPrivacy("private"))],
            IncludeAvatars: false);

        await _svc.ImportPkAsync(req);

        var member = await _context.Members.FirstAsync();
        Assert.Equal(MemberPrivacy.Private, member.PrivacyTier);
    }

    [Fact]
    public async Task ImportPk_BlankUuid_AddsError()
    {
        var req = new PkImportRequest(
            Members: [new PkMemberEntry(
                Uuid: null, Name: "ValidName",
                DisplayName: null, Pronouns: null,
                Color: null, AvatarUrl: null, Description: null,
                Birthday: null, Privacy: null)],
            IncludeAvatars: false);

        var result = await _svc.ImportPkAsync(req);

        Assert.Equal(0, result.Created);
        Assert.Single(result.Errors);
        Assert.Equal("(no uuid)", result.Errors[0].SourceId);
    }

    [Fact]
    public async Task ImportPk_ExistingMember_MergePreferExisting_FillsBlanks()
    {
        _context.Members.Add(new Member { Name = "Ember", PkId = "pk-uuid-001", Pronouns = null });
        await _context.SaveChangesAsync();

        var req = new PkImportRequest(
            Members: [new PkMemberEntry(
                Uuid: "pk-uuid-001", Name: "Ember",
                DisplayName: null, Pronouns: "they/them",
                Color: null, AvatarUrl: null, Description: null,
                Birthday: null, Privacy: null)],
            ConflictStrategy: ImportConflictStrategy.MergePreferExisting,
            IncludeAvatars: false);

        var result = await _svc.ImportPkAsync(req);

        Assert.Equal(1, result.Updated);
        var member = await _context.Members.FirstAsync();
        Assert.Equal("they/them", member.Pronouns); // was null, now filled
    }

    public void Dispose() => _context.Dispose();
}
