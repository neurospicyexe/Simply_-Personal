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

public class ImportService(PluralHostContext context, IAvatarDownloadService avatars) : IImportService
{
    public async Task<ImportResult> ImportSpAsync(SpImportRequest request, CancellationToken ct = default)
    {
        var created = 0; var updated = 0; var skipped = 0;
        var avatarsOk = 0; var avatarsFail = 0;
        var errors = new List<ImportMemberError>();

        // Upsert custom field definitions first (needed for Info mapping)
        var fieldMap = new Dictionary<string, CustomField>(); // SpFieldId → entity
        if (request.IncludeCustomFields && request.CustomFields != null)
        {
            foreach (var spField in request.CustomFields)
            {
                if (spField.Content == null) continue;
                var existing = await context.CustomFields
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(f => f.SpFieldId == spField.Id, ct);
                if (existing == null)
                {
                    existing = new CustomField
                    {
                        Label = spField.Content.Name ?? spField.Id,
                        SpFieldId = spField.Id,
                        SortOrder = spField.Content.Order
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
            var c = spMember.Content;
            if (c == null || string.IsNullOrWhiteSpace(c.Name))
            {
                errors.Add(new ImportMemberError(spMember.Id, c?.Name, "Name is blank."));
                continue;
            }

            // Find existing match
            var isNew = false;
            Member? member = null;
            if (request.ConflictStrategy != ImportConflictStrategy.Duplicate)
            {
                member = await context.Members
                    .Include(m => m.CustomFieldValues)
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(m => m.SpMemberId == spMember.Id && m.DeletedAt == null, ct);
            }

            if (member == null)
            {
                isNew = true;
                member = new Member { Name = c.Name!, SpMemberId = spMember.Id };
                context.Members.Add(member);
                created++;
            }
            else if (request.ConflictStrategy == ImportConflictStrategy.Skip)
            {
                skipped++;
                continue;
            }
            else
            {
                updated++;
            }

            ApplySpFields(member, c, request.ConflictStrategy, isNew);

            // Avatar
            if (request.IncludeAvatars && !string.IsNullOrWhiteSpace(c.AvatarUrl))
            {
                var path = await avatars.DownloadAvatarAsync(c.AvatarUrl, ct);
                if (path != null) { member.AvatarPath = path; avatarsOk++; }
                else avatarsFail++;
            }

            // Custom field values (from SP's Info dict)
            if (request.IncludeCustomFields && c.Info != null)
            {
                await context.SaveChangesAsync(ct); // ensure member.Id is set for new members
                foreach (var (spFieldId, value) in c.Info)
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
                            PrivacyTier = MemberPrivacy.Private
                        };
                        context.CustomFieldValues.Add(cfv);
                    }
                    else
                    {
                        if (cfv.DeletedAt != null) cfv.Restore();
                        if (ShouldApply(cfv.Value, value, request.ConflictStrategy, false))
                            cfv.Value = value;
                    }
                }
            }
        }

        await context.SaveChangesAsync(ct);
        return new ImportResult(created, updated, skipped, avatarsOk, avatarsFail, errors);
    }

    public async Task<ImportResult> ImportPkAsync(PkImportRequest request, CancellationToken ct = default)
    {
        var created = 0; var updated = 0; var skipped = 0;
        var avatarsOk = 0; var avatarsFail = 0;
        var errors = new List<ImportMemberError>();

        foreach (var pkMember in request.Members)
        {
            if (string.IsNullOrWhiteSpace(pkMember.Name))
            {
                errors.Add(new ImportMemberError(pkMember.Uuid ?? "(no uuid)", pkMember.Name, "Name is blank."));
                continue;
            }

            var isNew = false;
            Member? member = null;
            if (request.ConflictStrategy != ImportConflictStrategy.Duplicate && pkMember.Uuid != null)
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
            else if (request.ConflictStrategy == ImportConflictStrategy.Skip)
            {
                skipped++;
                continue;
            }
            else
            {
                updated++;
            }

            ApplyPkFields(member, pkMember, request.ConflictStrategy, isNew);

            if (request.IncludeAvatars && !string.IsNullOrWhiteSpace(pkMember.AvatarUrl))
            {
                var path = await avatars.DownloadAvatarAsync(pkMember.AvatarUrl, ct);
                if (path != null) { member.AvatarPath = path; avatarsOk++; }
                else avatarsFail++;
            }
        }

        await context.SaveChangesAsync(ct);
        return new ImportResult(created, updated, skipped, avatarsOk, avatarsFail, errors);
    }

    private static void ApplyPkFields(
        Member m, PkMemberEntry pk, ImportConflictStrategy strategy, bool isNew)
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
            m.PrivacyTier = MemberPrivacy.Private;
        else if (visibility == "public" && m.PrivacyTier == MemberPrivacy.Private)
            m.PrivacyTier = MemberPrivacy.Public;
    }

    private static void ApplySpFields(
        Member m, SpImportMemberContent c, ImportConflictStrategy strategy, bool isNew)
    {
        if (ShouldApply(m.Name, c.Name!, strategy, isNew)) m.Name = c.Name!;
        if (ShouldApply(m.Description, c.Desc, strategy, isNew)) m.Description = c.Desc;
        if (ShouldApply(m.Pronouns, c.Pronouns, strategy, isNew)) m.Pronouns = c.Pronouns;
        if (ShouldApply(m.Color, NormalizeColor(c.Color), strategy, isNew)) m.Color = NormalizeColor(c.Color);
        if (c.PkId != null) m.PkId = c.PkId; // cross-link always when present
        m.IsArchived = c.Archived;
        m.PreventFrontNotification = c.PreventsFrontNotifs;
        m.ReceiveBoardNotifications = c.ReceiveMessageBoardNotifs;
        if (c.Private)
            m.PrivacyTier = MemberPrivacy.Private;
        else if (m.PrivacyTier == MemberPrivacy.Private)
            m.PrivacyTier = MemberPrivacy.Public; // SP false only upgrades if currently Private
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

    private static string? NormalizeColor(string? color)
    {
        if (color == null) return null;
        return color.StartsWith('#') ? color : '#' + color;
    }
}
