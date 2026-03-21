// src/PluralHost.Api/Dto/NativeDtos.cs
using PluralHost.Api.Domain;
using System.Text.Json.Serialization;

namespace PluralHost.Api.Dto;

// ── FrontStatus ───────────────────────────────────────────────────────
public record FrontStatusResponse(
    Guid Id, string Label, string? Color,
    bool IsDefault, bool IsHidden, DateTime CreatedAt);

public record FrontStatusCreateRequest(string Label, string? Color = null);

public record FrontStatusUpdateRequest(
    string? Label = null, string? Color = null, bool? IsHidden = null);

// ── Member (native) ───────────────────────────────────────────────────
public record MemberResponse(
    Guid Id, string Name, string? DisplayName, string? Pronouns,
    string? Color, string? Role, string? Description, string? AvatarPath,
    MemberPrivacy PrivacyTier, bool AllowsBoardPosting,
    bool IsPinned, bool IsArchived, bool IsUntracked,
    bool PreventFrontNotification, bool ReceiveBoardNotifications,
    List<string> ExtraImages, string? SpMemberId,
    MemberStatus Status, List<Guid> ParentIds, List<Guid> GroupIds,
    DateTime CreatedAt, DateTime UpdatedAt, string? PkId, string? Birthday);

public record MemberCreateRequest(
    string Name, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    MemberPrivacy PrivacyTier = MemberPrivacy.Public);

public record MemberUpdateRequest(
    string? Name = null, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    MemberPrivacy? PrivacyTier = null, bool? AllowsBoardPosting = null,
    bool? IsPinned = null, bool? IsArchived = null,
    bool? IsUntracked = null, bool? PreventFrontNotification = null,
    bool? ReceiveBoardNotifications = null, List<string>? ExtraImages = null,
    string? SpMemberId = null, MemberStatus? Status = null,
    List<Guid>? ParentIds = null, string? AvatarPath = null);

// ── BoardMessage ──────────────────────────────────────────────────────
public record BoardMessageResponse(
    Guid Id, Guid MemberId, string AuthorName, string Content,
    string? TokenId, DateTime CreatedAt);

public record BoardMessageCreateRequest(string AuthorName, string Content);

// ── MemberNote ────────────────────────────────────────────────────────
public record MemberNoteResponse(
    Guid Id, Guid MemberId, string? Title, string Content,
    bool IsPinned, bool IsLocked, DateTime CreatedAt, DateTime UpdatedAt);

public record MemberNoteCreateRequest(string Content, string? Title = null);

public record MemberNoteUpdateRequest(
    string? Title = null, string? Content = null,
    bool? IsPinned = null, bool? IsLocked = null);

// ── AccessToken ───────────────────────────────────────────────────────
public record TokenResponse(
    string TokenValue, string? Label, TokenPermission Permission,
    bool AllowsBoardPosting, DateTime? ExpiresAt,
    DateTime? RevokedAt, DateTime CreatedAt);

public record TokenCreateRequest(
    string Label,
    TokenPermission Permission,
    bool AllowsBoardPosting = false,
    DateTime? ExpiresAt = null);

// ── Share (token-holder endpoints) ───────────────────────────────────
public record ShareBoardPostRequest(string AuthorName, string Content);

// ── CustomField (definitions) ─────────────────────────────────────────
public record CustomFieldResponse(
    Guid Id, string Label, FieldType FieldType, int SortOrder,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? DeletedAt);

public record CustomFieldCreateRequest(
    string Label,
    FieldType? FieldType,   // nullable so missing JSON field returns 400, not silently default to Text
    int SortOrder = 0);

public record CustomFieldUpdateRequest(
    string? Label = null,
    int? SortOrder = null,
    FieldType? FieldType = null); // FieldType present → 400 (immutable)

// ── CustomFieldValue ──────────────────────────────────────────────────
public record CustomFieldValueResponse(
    Guid Id, Guid FieldId, Guid MemberId,
    string Value, MemberPrivacy PrivacyTier,
    DateTime CreatedAt, DateTime UpdatedAt);

// Used in GET /api/members/{id}/fields — one entry per field definition
public record MemberFieldEntry(
    Guid FieldId, string Label, FieldType FieldType, int SortOrder,
    string? Value, MemberPrivacy PrivacyTier);  // Value null = not set

public record CustomFieldValueUpsertRequest(
    string Value,
    MemberPrivacy PrivacyTier = MemberPrivacy.Public);

// Slim DTO used in GET /share/{token} member response
public record SharedCustomFieldDto(string Label, FieldType FieldType, string Value);

// ── JournalEntry ──────────────────────────────────────────────────────
public record JournalEntryResponse(
    Guid Id, string? Title, string Content, bool IsPrivate,
    DateTime CreatedAt, DateTime UpdatedAt);

public record JournalCreateRequest(
    string Content,
    string? Title = null,
    bool IsPrivate = true);

public record JournalUpdateRequest(
    string? Title = null,
    string? Content = null,
    bool? IsPrivate = null);

// Slim DTO for GET /share/{token}/journals
public record SharedJournalDto(Guid Id, string? Title, string Content, DateTime CreatedAt);

// ── Import pipeline DTOs ──────────────────────────────────────────────────
public enum ImportConflictStrategy
{
    MergePreferExisting,   // default — only fills blank fields
    MergePreferImported,   // imported wins on non-null fields
    Overwrite,             // imported wins on all fields it provides
    Skip,                  // if match exists, do nothing
    Duplicate              // always create new member regardless of match
}

// SP import
public record SpImportMemberContent(
    string? Name, string? Desc, string? Pronouns, string? PkId,
    string? Color,
    [property: JsonPropertyName("avatarUrl")] string? AvatarUrl,
    bool Private,
    [property: JsonPropertyName("preventsFrontNotifs")] bool PreventsFrontNotifs,
    [property: JsonPropertyName("receiveMessageBoardNotifs")] bool ReceiveMessageBoardNotifs,
    bool Archived, Dictionary<string, string>? Info);

public record SpMemberEntry(string Id, SpImportMemberContent? Content);

public record SpCustomFieldContent(string? Name, int Order, bool Private);
public record SpCustomFieldEntry(string Id, SpCustomFieldContent? Content);

public record SpImportRequest(
    IReadOnlyList<SpMemberEntry> Members,
    IReadOnlyList<SpCustomFieldEntry>? CustomFields = null,
    ImportConflictStrategy ConflictStrategy = ImportConflictStrategy.MergePreferExisting,
    bool IncludeCustomFields = true,
    bool IncludeAvatars = true);

// PK import
public record PkMemberPrivacy(string? Visibility);

public record PkMemberEntry(
    string? Uuid, string? Name,
    [property: JsonPropertyName("display_name")] string? DisplayName,
    string? Pronouns,
    string? Color,
    [property: JsonPropertyName("avatar_url")] string? AvatarUrl,
    string? Description,
    string? Birthday, PkMemberPrivacy? Privacy);

public record PkImportRequest(
    IReadOnlyList<PkMemberEntry> Members,
    ImportConflictStrategy ConflictStrategy = ImportConflictStrategy.MergePreferExisting,
    bool IncludeAvatars = true);

// Import result
public record ImportMemberError(string SourceId, string? Name, string Reason);

public record ImportResult(
    int Created,
    int Updated,
    int Skipped,
    int AvatarsDownloaded,
    int AvatarsFailed,
    IReadOnlyList<ImportMemberError> Errors);
