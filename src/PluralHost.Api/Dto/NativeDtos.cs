// src/PluralHost.Api/Dto/NativeDtos.cs
using PluralHost.Api.Domain;

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
    DateTime CreatedAt, DateTime UpdatedAt);

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
    List<Guid>? ParentIds = null);

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
