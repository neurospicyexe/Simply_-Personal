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
    private readonly Mock<IPluralKitClient> _pkClient;
    private readonly IImportService _svc;

    public ImportServiceTests()
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        _context = new PluralHostContext(opts);
        _context.Database.EnsureCreated();

        // Seed required SystemSettings singleton
        if (!_context.SystemSettings.Any())
        {
            _context.SystemSettings.Add(new SystemSettings { Id = 1 });
        }

        // Seed the two PrivacyBuckets needed by ImportService
        if (!_context.PrivacyBuckets.Any())
        {
            _context.PrivacyBuckets.Add(new PrivacyBucket
            {
                Id = PrivacyBucket.PublicId,
                Name = "Public",
                SortOrder = 0
            });
            _context.PrivacyBuckets.Add(new PrivacyBucket
            {
                Id = PrivacyBucket.PrivateId,
                Name = "Private",
                SortOrder = 3
            });
        }
        _context.SaveChanges();

        _avatars = new Mock<IAvatarDownloadService>();
        _avatars.Setup(a => a.DownloadAvatarAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((string?)null);

        _pkClient = new Mock<IPluralKitClient>();
        _pkClient.Setup(c => c.GetMembersAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                 .ReturnsAsync(new List<PkApiMember>());
        _pkClient.Setup(c => c.GetSwitchesAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                 .ReturnsAsync(new List<PkApiSwitch>());

        _svc = new ImportService(_context, _avatars.Object, _pkClient.Object);
    }

    // ── SP import tests ──────────────────────────────────────────────

    [Fact]
    public async Task ImportSp_NewMember_IsCreated()
    {
        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Created);
        Assert.Equal(0, result.Errors.Count);
        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("Ember", member.Name);
        Assert.Equal("sp-001", member.SpMemberId);
    }

    [Fact]
    public async Task ImportSp_Skip_ExistingMemberUnchanged()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            ConflictStrategy: "Skip",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember Updated", null, null, null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Skipped);
        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("Ember", member.Name);
    }

    [Fact]
    public async Task ImportSp_Overwrite_AllFieldsReplaced()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            ConflictStrategy: "Overwrite",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember New", null, "they/them", null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Updated);
        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("Ember New", member.Name);
        Assert.Equal("they/them", member.Pronouns);
    }

    [Fact]
    public async Task ImportSp_MergePreferExisting_OnlyFillsNullFields()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001", Pronouns = "she/her", Description = null });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember", "Bio text", "they/them", null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("she/her", member.Pronouns);  // existing kept
        Assert.Equal("Bio text", member.Description); // null filled
    }

    [Fact]
    public async Task ImportSp_Duplicate_AlwaysCreatesNew()
    {
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001" });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            ConflictStrategy: "Duplicate",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Created);
        Assert.Equal(2, await _context.Members.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task ImportSp_BlankName_AddedToErrors()
    {
        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [
                new SpMemberEntry("sp-001", "", null, null, null, null, false, false, null, false, true, null),
                new SpMemberEntry("sp-002", "   ", null, null, null, null, false, false, null, false, true, null)
            ],
            CustomFields: null,
            FrontHistory: null);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(0, result.Created);
        Assert.Equal(2, result.Errors.Count);
    }

    [Fact]
    public async Task ImportSp_PrivateTrue_SetsBucketToPrivate()
    {
        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Shadow", null, null, null, null, true, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        await _svc.ImportSpAsync(req);

        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal(PrivacyBucket.PrivateId, member.BucketId);
    }

    [Fact]
    public async Task ImportSp_CustomFields_CreatesDefsAndValues()
    {
        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: true,
            IncludeFrontHistory: false,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, null, false, false, null, false, true,
                new Dictionary<string, string> { ["field-001"] = "Pyromancer" })],
            CustomFields: [new SpCustomFieldEntry("field-001", "Role", "0")],
            FrontHistory: null);

        await _svc.ImportSpAsync(req);

        var defs = await _context.CustomFields.IgnoreQueryFilters().ToListAsync();
        Assert.Single(defs);
        Assert.Equal("Role", defs[0].Label);

        var vals = await _context.CustomFieldValues.IgnoreQueryFilters().ToListAsync();
        Assert.Single(vals);
        Assert.Equal("Pyromancer", vals[0].Value);
    }

    [Fact]
    public async Task ImportSp_FrontHistory_CreatesEntries()
    {
        // Seed a member so the SP ID resolves
        _context.Members.Add(new Member { Name = "Ember", SpMemberId = "sp-001" });
        await _context.SaveChangesAsync();

        var startMs = new DateTimeOffset(2024, 1, 1, 12, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();
        var endMs = new DateTimeOffset(2024, 1, 1, 14, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();

        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: true,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: [new SpFrontHistoryEntry("fh-001", "sp-001", startMs, endMs)]);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.FrontHistoryImported);
        var entries = await _context.FrontHistory.IgnoreQueryFilters().ToListAsync();
        Assert.Single(entries);
        Assert.Equal(new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc), entries[0].FrontStart);
    }

    [Fact]
    public async Task ImportSp_FrontHistory_SkipsDuplicates()
    {
        var member = new Member { Name = "Ember", SpMemberId = "sp-001" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        var startMs = new DateTimeOffset(2024, 1, 1, 12, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();
        var start = DateTimeOffset.FromUnixTimeMilliseconds(startMs).UtcDateTime;

        // Pre-seed a front history entry for the same start time
        _context.FrontHistory.Add(new FrontHistory { MemberId = member.Id, FrontStart = start });
        await _context.SaveChangesAsync();

        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: true,
            IncludeAvatars: false,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, null, false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: [new SpFrontHistoryEntry("fh-001", "sp-001", startMs, null)]);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(0, result.FrontHistoryImported);
        Assert.Equal(1, await _context.FrontHistory.IgnoreQueryFilters().CountAsync());
    }

    [Fact]
    public async Task ImportSp_AvatarDownloaded_SetsAvatarPath()
    {
        _avatars.Setup(a => a.DownloadAvatarAsync("http://example.com/img.jpg", It.IsAny<CancellationToken>()))
                .ReturnsAsync("abc.jpg");

        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: true,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, "http://example.com/img.jpg", false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.AvatarsDownloaded);
        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("abc.jpg", member.AvatarPath);
    }

    [Fact]
    public async Task ImportSp_AvatarFails_MemberStillImported()
    {
        _avatars.Setup(a => a.DownloadAvatarAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((string?)null);

        var req = new SpImportRequest(
            ConflictStrategy: "MergePreferExisting",
            IncludeCustomFields: false,
            IncludeFrontHistory: false,
            IncludeAvatars: true,
            Members: [new SpMemberEntry("sp-001", "Ember", null, null, null, "http://example.com/img.jpg", false, false, null, false, true, null)],
            CustomFields: null,
            FrontHistory: null);

        var result = await _svc.ImportSpAsync(req);

        Assert.Equal(1, result.Created);
        Assert.Equal(0, result.AvatarsDownloaded);
        Assert.Equal(1, result.AvatarsFailed);
    }

    // ── PK import tests ──────────────────────────────────────────────

    [Fact]
    public async Task ImportPk_NewMember_IsCreated()
    {
        _pkClient.Setup(c => c.GetMembersAsync("my-token", It.IsAny<CancellationToken>()))
                 .ReturnsAsync(new List<PkApiMember>
                 {
                     new PkApiMember("pk-uuid-001", "Ember", "Ember the Fire", "she/her", "ff0000", null, "Fire alter", null, null)
                 });

        var req = new PkImportRequest(
            Token: "my-token",
            ConflictStrategy: "MergePreferExisting",
            IncludeFrontHistory: false,
            IncludeAvatars: false);

        var result = await _svc.ImportPkAsync(req);

        Assert.Equal(1, result.Created);
        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("Ember", member.Name);
        Assert.Equal("pk-uuid-001", member.PkId);
        Assert.Equal("she/her", member.Pronouns);
        Assert.Equal("#ff0000", member.Color);
    }

    [Fact]
    public async Task ImportPk_PrivateMember_SetsBucketToPrivate()
    {
        _pkClient.Setup(c => c.GetMembersAsync("my-token", It.IsAny<CancellationToken>()))
                 .ReturnsAsync(new List<PkApiMember>
                 {
                     new PkApiMember("pk-uuid-001", "Shadow", null, null, null, null, null, null, new PkApiMemberPrivacy("private"))
                 });

        var req = new PkImportRequest(
            Token: "my-token",
            ConflictStrategy: "MergePreferExisting",
            IncludeFrontHistory: false,
            IncludeAvatars: false);

        await _svc.ImportPkAsync(req);

        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal(PrivacyBucket.PrivateId, member.BucketId);
    }

    [Fact]
    public async Task ImportPk_TokenNotStoredInDb()
    {
        _pkClient.Setup(c => c.GetMembersAsync("super-secret", It.IsAny<CancellationToken>()))
                 .ReturnsAsync(new List<PkApiMember>
                 {
                     new PkApiMember("pk-uuid-001", "Ember", null, null, null, null, null, null, null)
                 });

        var req = new PkImportRequest(
            Token: "super-secret",
            ConflictStrategy: "MergePreferExisting",
            IncludeFrontHistory: false,
            IncludeAvatars: false);

        await _svc.ImportPkAsync(req);

        // Token must not appear anywhere in SystemSettings
        var settings = await _context.SystemSettings.IgnoreQueryFilters().FirstAsync();
        var settingsJson = System.Text.Json.JsonSerializer.Serialize(settings);
        Assert.DoesNotContain("super-secret", settingsJson);
    }

    [Fact]
    public async Task ImportPk_Switches_CreateFrontHistory()
    {
        // Seed a member with a PkId so the switch resolves
        var member = new Member { Name = "Ember", PkId = "pk-uuid-001" };
        _context.Members.Add(member);
        await _context.SaveChangesAsync();

        // Two switches ascending (as returned by PluralKitClient after sort)
        var switch1Ts = "2024-01-01T12:00:00Z";
        var switch2Ts = "2024-01-01T14:00:00Z";
        _pkClient.Setup(c => c.GetSwitchesAsync("my-token", It.IsAny<CancellationToken>()))
                 .ReturnsAsync(new List<PkApiSwitch>
                 {
                     new PkApiSwitch("sw-001", switch1Ts, new[] { "pk-uuid-001" }),
                     new PkApiSwitch("sw-002", switch2Ts, new[] { "pk-uuid-001" })
                 });

        var req = new PkImportRequest(
            Token: "my-token",
            ConflictStrategy: "MergePreferExisting",
            IncludeFrontHistory: true,
            IncludeAvatars: false);

        var result = await _svc.ImportPkAsync(req);

        Assert.Equal(2, result.FrontHistoryImported);
        var entries = await _context.FrontHistory.IgnoreQueryFilters()
            .OrderBy(f => f.FrontStart).ToListAsync();
        Assert.Equal(2, entries.Count);
        // First switch end = second switch start
        Assert.Equal(new DateTime(2024, 1, 1, 14, 0, 0, DateTimeKind.Utc), entries[0].FrontEnd);
        // Second switch has no successor — end is null
        Assert.Null(entries[1].FrontEnd);
    }

    [Fact]
    public async Task ImportPk_MergePreferExisting_ExistingFieldsNotOverwritten()
    {
        _context.Members.Add(new Member { Name = "Ember", PkId = "pk-uuid-001", Pronouns = "she/her" });
        await _context.SaveChangesAsync();

        _pkClient.Setup(c => c.GetMembersAsync("my-token", It.IsAny<CancellationToken>()))
                 .ReturnsAsync(new List<PkApiMember>
                 {
                     new PkApiMember("pk-uuid-001", "Ember", null, "they/them", null, null, null, null, null)
                 });

        var req = new PkImportRequest(
            Token: "my-token",
            ConflictStrategy: "MergePreferExisting",
            IncludeFrontHistory: false,
            IncludeAvatars: false);

        var result = await _svc.ImportPkAsync(req);

        Assert.Equal(1, result.Updated);
        var member = await _context.Members.IgnoreQueryFilters().FirstAsync();
        Assert.Equal("she/her", member.Pronouns); // existing kept
    }

    public void Dispose() => _context.Dispose();
}
