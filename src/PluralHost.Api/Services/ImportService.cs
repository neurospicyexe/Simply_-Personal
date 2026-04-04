using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Services;

public interface IImportService
{
    Task<ImportResult> ImportSpAsync(SpImportRequest request, CancellationToken ct = default);
    Task<ImportResult> ImportPkAsync(PkImportRequest request, CancellationToken ct = default);
}

public class ImportService(PluralHostContext context, IAvatarDownloadService avatars, IPluralKitClient pkClient) : IImportService
{
    public async Task<ImportResult> ImportSpAsync(SpImportRequest request, CancellationToken ct = default)
    {
        var strategy = ParseStrategy(request.ConflictStrategy);
        var created = 0; var updated = 0; var skipped = 0;
        var avatarsOk = 0; var avatarsFail = 0;
        var frontImported = 0; var groupsImported = 0;
        var errors = new List<ImportMemberError>();

        // Upsert custom field definitions first (needed for Info mapping)
        var fieldMap = new Dictionary<string, CustomField>(); // SpFieldId → entity
        if (request.IncludeCustomFields && request.CustomFields != null)
        {
            foreach (var spField in request.CustomFields)
            {
                if (string.IsNullOrWhiteSpace(spField.Name)) continue;
                var existing = await context.CustomFields
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(f => f.SpFieldId == spField.Id, ct);
                if (existing == null)
                {
                    existing = new CustomField
                    {
                        Label = spField.Name,
                        SpFieldId = spField.Id,
                        SortOrder = int.TryParse(spField.Order, out var ord) ? ord : 0
                    };
                    context.CustomFields.Add(existing);
                }
                else
                {
                    if (existing.DeletedAt != null) existing.Restore();
                }
                fieldMap[spField.Id] = existing;
            }
            await context.SaveChangesAsync(ct);
        }

        foreach (var spMember in request.Members)
        {
            if (string.IsNullOrWhiteSpace(spMember.Name))
            {
                errors.Add(new ImportMemberError(spMember.Id, spMember.Name, "Name is blank."));
                continue;
            }

            var isNew = false;
            Member? member = null;
            if (strategy != ImportConflictStrategy.Duplicate)
            {
                member = await context.Members
                    .Include(m => m.CustomFieldValues)
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(m => m.SpMemberId == spMember.Id && m.DeletedAt == null, ct);
            }

            if (member == null)
            {
                isNew = true;
                member = new Member { Name = spMember.Name!, SpMemberId = spMember.Id };
                context.Members.Add(member);
                created++;
            }
            else if (strategy == ImportConflictStrategy.Skip)
            {
                skipped++;
                continue;
            }
            else
            {
                updated++;
            }

            ApplySpFields(member, spMember, strategy, isNew);

            if (request.IncludeAvatars && !string.IsNullOrWhiteSpace(spMember.AvatarUrl))
            {
                var path = await avatars.DownloadAvatarAsync(spMember.AvatarUrl, ct);
                if (path != null) { member.AvatarPath = path; avatarsOk++; }
                else avatarsFail++;
            }

            // Custom field values (from SP's Info dict)
            if (request.IncludeCustomFields && spMember.Info != null)
            {
                await context.SaveChangesAsync(ct); // ensure member.Id is set for new members
                foreach (var (spFieldId, value) in spMember.Info)
                {
                    if (!fieldMap.TryGetValue(spFieldId, out var field)) continue;
                    var cfv = await context.CustomFieldValues
                        .IgnoreQueryFilters()
                        .FirstOrDefaultAsync(v => v.FieldId == field.Id && v.MemberId == member.Id, ct);
                    if (cfv == null)
                    {
                        cfv = new CustomFieldValue
                        {
                            FieldId = field.Id,
                            MemberId = member.Id,
                            Value = value,
                            BucketId = PrivacyBucket.PrivateId
                        };
                        context.CustomFieldValues.Add(cfv);
                    }
                    else
                    {
                        if (cfv.DeletedAt != null) cfv.Restore();
                        if (ShouldApply(cfv.Value, value, strategy, false))
                            cfv.Value = value;
                    }
                }
            }
        }

        // Build SpMemberId → Member.Id lookup (shared by front history + groups blocks)
        Dictionary<string, Guid>? spIdToMemberId = null;
        if ((request.IncludeFrontHistory && request.FrontHistory != null) ||
            (request.IncludeGroups && request.Groups != null))
        {
            spIdToMemberId = await context.Members
                .IgnoreQueryFilters()
                .Where(m => m.DeletedAt == null && m.SpMemberId != null)
                .Select(m => new { m.SpMemberId, m.Id })
                .ToDictionaryAsync(x => x.SpMemberId!, x => x.Id, ct);
        }

        // Front history
        if (request.IncludeFrontHistory && request.FrontHistory != null)
        {

            foreach (var entry in request.FrontHistory)
            {
                if (entry.Member == null || !spIdToMemberId!.TryGetValue(entry.Member, out var memberId))
                    continue;

                var start = DateTimeOffset.FromUnixTimeMilliseconds(entry.StartTime).UtcDateTime;
                var end = entry.EndTime.HasValue
                    ? DateTimeOffset.FromUnixTimeMilliseconds(entry.EndTime.Value).UtcDateTime
                    : (DateTime?)null;

                var alreadyExists = await context.FrontHistory
                    .IgnoreQueryFilters()
                    .AnyAsync(f => f.MemberId == memberId && f.FrontStart == start, ct);
                if (alreadyExists) continue;

                context.FrontHistory.Add(new FrontHistory
                {
                    MemberId = memberId,
                    FrontStart = start,
                    FrontEnd = end
                });
                frontImported++;
            }
        }

        // Groups
        if (request.IncludeGroups && request.Groups != null)
        {
            var spGroupIdToGroup = new Dictionary<string, Group>();

            // First pass: create/find groups, assign members
            foreach (var spGroup in request.Groups)
            {
                if (string.IsNullOrWhiteSpace(spGroup.Name)) continue;

                var group = await context.Groups
                    .Include(g => g.Members)
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(g => g.Name == spGroup.Name && g.DeletedAt == null, ct);

                if (group == null)
                {
                    group = new Group { Name = spGroup.Name };
                    context.Groups.Add(group);
                    groupsImported++;
                }

                if (!string.IsNullOrEmpty(spGroup.Desc)) group.Description = spGroup.Desc;
                if (!string.IsNullOrEmpty(spGroup.Color)) group.Color = NormalizeColor(spGroup.Color);
                if (!string.IsNullOrEmpty(spGroup.Emoji)) group.Emoji = spGroup.Emoji;

                spGroupIdToGroup[spGroup.Id] = group;

                if (spGroup.Members != null)
                {
                    foreach (var spMemberId in spGroup.Members)
                    {
                        if (!spIdToMemberId!.TryGetValue(spMemberId, out var memberId)) continue;
                        var member = await context.Members.FindAsync([memberId], ct);
                        if (member == null) continue;
                        if (!group.Members.Any(m => m.Id == memberId))
                            group.Members.Add(member);
                        if (!member.ParentIds.Contains(group.Id))
                            member.ParentIds.Add(group.Id);
                    }
                }
            }

            // Second pass: wire up parent–child relationships
            foreach (var spGroup in request.Groups)
            {
                if (string.IsNullOrWhiteSpace(spGroup.Parent)) continue;
                if (!spGroupIdToGroup.TryGetValue(spGroup.Id, out var childGroup)) continue;
                if (!spGroupIdToGroup.TryGetValue(spGroup.Parent, out var parentGroup)) continue;
                childGroup.ParentGroupId = parentGroup.Id;
            }
        }

        await context.SaveChangesAsync(ct);
        return new ImportResult(created, updated, skipped, errors, avatarsOk, avatarsFail, frontImported, groupsImported);
    }

    public async Task<ImportResult> ImportPkAsync(PkImportRequest request, CancellationToken ct = default)
    {
        var strategy = ParseStrategy(request.ConflictStrategy);
        var created = 0; var updated = 0; var skipped = 0;
        var avatarsOk = 0; var avatarsFail = 0;
        var frontImported = 0;
        var errors = new List<ImportMemberError>();

        var pkMembers = await pkClient.GetMembersAsync(request.Token, ct);

        foreach (var pkMember in pkMembers)
        {
            if (string.IsNullOrWhiteSpace(pkMember.Uuid))
            {
                errors.Add(new ImportMemberError("(no uuid)", pkMember.Name, "UUID is blank."));
                continue;
            }

            if (string.IsNullOrWhiteSpace(pkMember.Name))
            {
                errors.Add(new ImportMemberError(pkMember.Uuid, pkMember.Name, "Name is blank."));
                continue;
            }

            var isNew = false;
            Member? member = null;
            if (strategy != ImportConflictStrategy.Duplicate)
            {
                member = await context.Members
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(m => m.PkId == pkMember.Uuid && m.DeletedAt == null, ct);
            }

            if (member == null)
            {
                isNew = true;
                member = new Member { Name = pkMember.Name!, PkId = pkMember.Uuid };
                context.Members.Add(member);
                created++;
            }
            else if (strategy == ImportConflictStrategy.Skip)
            {
                skipped++;
                continue;
            }
            else
            {
                updated++;
            }

            ApplyPkFields(member, pkMember, strategy, isNew);

            if (request.IncludeAvatars && !string.IsNullOrWhiteSpace(pkMember.AvatarUrl))
            {
                var path = await avatars.DownloadAvatarAsync(pkMember.AvatarUrl, ct);
                if (path != null) { member.AvatarPath = path; avatarsOk++; }
                else avatarsFail++;
            }
        }

        if (request.IncludeFrontHistory)
        {
            var switches = await pkClient.GetSwitchesAsync(request.Token, ct);
            var pkIdToMemberId = await context.Members
                .IgnoreQueryFilters()
                .Where(m => m.DeletedAt == null && m.PkId != null)
                .Select(m => new { m.PkId, m.Id })
                .ToDictionaryAsync(x => x.PkId!, x => x.Id, ct);

            for (var i = 0; i < switches.Count; i++)
            {
                var sw = switches[i];
                if (!DateTimeOffset.TryParse(sw.Timestamp, out var startOffset)) continue;
                var start = startOffset.UtcDateTime;
                var end = i + 1 < switches.Count && DateTimeOffset.TryParse(switches[i + 1].Timestamp, out var nextOffset)
                    ? nextOffset.UtcDateTime
                    : (DateTime?)null;

                foreach (var pkUuid in sw.Members)
                {
                    if (!pkIdToMemberId.TryGetValue(pkUuid, out var memberId)) continue;

                    var alreadyExists = await context.FrontHistory
                        .IgnoreQueryFilters()
                        .AnyAsync(f => f.MemberId == memberId && f.FrontStart == start, ct);
                    if (alreadyExists) continue;

                    context.FrontHistory.Add(new FrontHistory
                    {
                        MemberId = memberId,
                        FrontStart = start,
                        FrontEnd = end
                    });
                    frontImported++;
                }
            }
        }

        await context.SaveChangesAsync(ct);
        return new ImportResult(created, updated, skipped, errors, avatarsOk, avatarsFail, frontImported, 0);
    }

    private static void ApplyPkFields(
        Member m, PkApiMember pk, ImportConflictStrategy strategy, bool isNew)
    {
        if (ShouldApply(m.Name, pk.Name!, strategy, isNew)) m.Name = pk.Name!;
        if (ShouldApply(m.DisplayName, pk.DisplayName, strategy, isNew)) m.DisplayName = pk.DisplayName;
        if (ShouldApply(m.Pronouns, pk.Pronouns, strategy, isNew)) m.Pronouns = pk.Pronouns;
        if (ShouldApply(m.Description, pk.Description, strategy, isNew)) m.Description = pk.Description;
        if (ShouldApply(m.Color, NormalizeColor(pk.Color), strategy, isNew)) m.Color = NormalizeColor(pk.Color);
        if (ShouldApply(m.Birthday, pk.Birthday, strategy, isNew)) m.Birthday = pk.Birthday;
        if (pk.Uuid != null) m.PkId = pk.Uuid; // always sync the match key

        var visibility = pk.Privacy?.Visibility?.ToLowerInvariant();
        if (visibility == "private")
            m.BucketId = PrivacyBucket.PrivateId;
        else if (visibility == "public" && m.BucketId == PrivacyBucket.PrivateId)
            m.BucketId = PrivacyBucket.PublicId;
    }

    private static void ApplySpFields(
        Member m, SpMemberEntry sp, ImportConflictStrategy strategy, bool isNew)
    {
        if (ShouldApply(m.Name, sp.Name!, strategy, isNew)) m.Name = sp.Name!;
        if (ShouldApply(m.Description, sp.Desc, strategy, isNew)) m.Description = sp.Desc;
        if (ShouldApply(m.Pronouns, sp.Pronouns, strategy, isNew)) m.Pronouns = sp.Pronouns;
        if (ShouldApply(m.Color, NormalizeColor(sp.Color), strategy, isNew)) m.Color = NormalizeColor(sp.Color);
        if (sp.PkId != null) m.PkId = sp.PkId; // cross-link always when present
        m.IsArchived = sp.Archived ?? false;
        m.PreventFrontNotification = sp.PreventsFrontNotifs ?? false;
        m.ReceiveBoardNotifications = sp.ReceiveMessageBoardNotifs ?? false;
        if (sp.Private == true)
            m.BucketId = PrivacyBucket.PrivateId;
        else if (sp.Private == false && m.BucketId == PrivacyBucket.PrivateId)
            m.BucketId = PrivacyBucket.PublicId; // SP false only upgrades if currently Private
    }

    private static bool ShouldApply(string? existing, string? incoming, ImportConflictStrategy strategy, bool isNew)
    {
        if (isNew) return true;
        return strategy switch
        {
            ImportConflictStrategy.Overwrite => incoming != null,
            ImportConflictStrategy.MergePreferExisting => string.IsNullOrEmpty(existing) && incoming != null,
            ImportConflictStrategy.MergePreferImported => incoming != null,
            ImportConflictStrategy.Skip => false,
            ImportConflictStrategy.Duplicate => incoming != null,
            _ => false
        };
    }

    private static ImportConflictStrategy ParseStrategy(string raw) =>
        Enum.TryParse<ImportConflictStrategy>(raw, ignoreCase: true, out var s) ? s : ImportConflictStrategy.MergePreferExisting;

    private static string? NormalizeColor(string? color)
    {
        if (color == null) return null;
        return color.StartsWith('#') ? color : '#' + color;
    }
}
