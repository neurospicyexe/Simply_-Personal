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

// ── PrivacyBucket ─────────────────────────────────────────────────────
public record BucketDto(
    Guid Id, string Name, string? Description, string? Emoji,
    string? Color, int SortOrder, bool IsDefault, int MemberCount);

public record BucketCreateRequest(
    string Name, string? Description, string? Emoji, string? Color);

public record BucketUpdateRequest(
    string? Name, string? Description, string? Emoji, string? Color, int? SortOrder);

public record ReorderItem(Guid Id, int SortOrder);

// ── BucketFieldExclusion ──────────────────────────────────────────────
public record BucketExcludedFieldDto(Guid FieldId, string Label);
public record BucketExcludeFieldRequest(Guid FieldId);

// ── Group ─────────────────────────────────────────────────────────────
public record SetGroupMembersRequest(List<Guid> MemberIds);

public record GroupCreateRequest(string Name, string? Color);
public record GroupUpdateRequest(string? Name, string? Color);

// ── Member (native) ───────────────────────────────────────────────────
public record MemberResponse(
    Guid Id, string Name, string? DisplayName, string? Pronouns,
    string? Color, string? Role, string? Description, string? AvatarPath,
    string? BackgroundImagePath,
    Guid BucketId, bool AllowsBoardPosting,
    bool IsPinned, bool IsArchived, bool IsUntracked,
    bool PreventFrontNotification, bool ReceiveBoardNotifications,
    List<string> ExtraImages, string? SpMemberId,
    MemberStatus Status, List<Guid> ParentIds, List<Guid> GroupIds,
    DateTime CreatedAt, DateTime UpdatedAt, string? PkId, string? Birthday);

public record DeleteMemberRequest(string Pin);

public record MemberCreateRequest(
    string Name, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    Guid BucketId = default);

public record MemberUpdateRequest(
    string? Name = null, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    Guid? BucketId = null, bool? AllowsBoardPosting = null,
    bool? IsPinned = null, bool? IsArchived = null,
    bool? IsUntracked = null, bool? PreventFrontNotification = null,
    bool? ReceiveBoardNotifications = null, List<string>? ExtraImages = null,
    string? SpMemberId = null, MemberStatus? Status = null,
    List<Guid>? ParentIds = null, string? AvatarPath = null,
    string? BackgroundImagePath = null, bool ClearBackgroundImage = false);

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
    string TokenValue, string? Label, int MinBucketSortOrder,
    bool AllowsBoardPosting, DateTime? ExpiresAt,
    DateTime? RevokedAt, DateTime CreatedAt);

public record TokenCreateRequest(
    string Label,
    int MinBucketSortOrder,
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
    string Value, Guid BucketId,
    DateTime CreatedAt, DateTime UpdatedAt);

// Used in GET /api/members/{id}/fields — one entry per field definition
public record MemberFieldEntry(
    Guid FieldId, string Label, FieldType FieldType, int SortOrder,
    string? Value, Guid BucketId);  // Value null = not set

public record CustomFieldValueUpsertRequest(
    string Value,
    Guid BucketId = default);

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

// ── Secure actions ────────────────────────────────────────────────────
public record SetPinRequest(string? CurrentPin, string NewPin);
public record SecureStatusResponse(bool PinIsSet, DateTime? DeletionCooldownEnd);

// ── Media upload ───────────────────────────────────────────────────────
public record UploadResponse(string Id);

// ── MemberRelationship ────────────────────────────────────────────────
public record MemberRelationshipResponse(
    Guid Id,
    Guid FromMemberId,
    Guid ToMemberId,
    string Label,
    bool IsDirected,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record MemberRelationshipCreateRequest(
    Guid FromMemberId,
    Guid ToMemberId,
    string Label,
    bool IsDirected = false);

public record MemberRelationshipUpdateRequest(
    string? Label,
    bool? IsDirected);

