using System.Text.Json.Serialization;

namespace PluralHost.Api.Dto;

// ── SP export format (flat — no content wrapper) ──────────────────────

public record SpMemberEntry(
    [property: JsonPropertyName("_id")] string Id,
    string? Name,
    string? Desc,
    string? Pronouns,
    string? Color,
    string? AvatarUrl,
    bool? Private,
    bool? Archived,
    string? PkId,
    bool? PreventsFrontNotifs,
    bool? ReceiveMessageBoardNotifs,
    Dictionary<string, string>? Info);

public record SpCustomFieldEntry(
    [property: JsonPropertyName("_id")] string Id,
    string? Name,
    string? Order);

public record SpFrontHistoryEntry(
    [property: JsonPropertyName("_id")] string Id,
    string? Member,
    long StartTime,
    long? EndTime);

public record SpImportRequest(
    string ConflictStrategy,
    bool IncludeCustomFields,
    bool IncludeFrontHistory,
    bool IncludeAvatars,
    IReadOnlyList<SpMemberEntry> Members,
    IReadOnlyList<SpCustomFieldEntry>? CustomFields,
    IReadOnlyList<SpFrontHistoryEntry>? FrontHistory);

// ── PK live pull ──────────────────────────────────────────────────────

public record PkImportRequest(
    string Token,
    string ConflictStrategy,
    bool IncludeFrontHistory,
    bool IncludeAvatars);

// ── PK API response types (deserialized from PluralKit v2) ────────────

public record PkApiMember(
    string Uuid,
    string? Name,
    [property: JsonPropertyName("display_name")] string? DisplayName,
    string? Pronouns,
    string? Color,
    [property: JsonPropertyName("avatar_url")] string? AvatarUrl,
    string? Description,
    string? Birthday,
    PkApiMemberPrivacy? Privacy);

public record PkApiMemberPrivacy(string? Visibility);

public record PkApiSwitch(
    string Id,
    string Timestamp,
    IReadOnlyList<string> Members);

// ── Conflict strategy ─────────────────────────────────────────────────

public enum ImportConflictStrategy
{
    MergePreferExisting,   // default — only fills blank fields
    MergePreferImported,   // imported wins on non-null fields
    Overwrite,             // imported wins on all fields it provides
    Skip,                  // if match exists, do nothing
    Duplicate              // always create new member regardless of match
}

// ── Shared result ─────────────────────────────────────────────────────

public record ImportMemberError(string SourceId, string? Name, string Reason);

public record ImportResult(
    int Created,
    int Updated,
    int Skipped,
    IReadOnlyList<ImportMemberError> Errors,
    int AvatarsDownloaded,
    int AvatarsFailed,
    int FrontHistoryImported);
