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
    bool IsPrivate, bool IsPinned, bool IsArchived, bool IsUntracked,
    bool PreventFrontNotification, bool ReceiveBoardNotifications,
    List<string> ExtraImages, string? SpMemberId,
    MemberStatus Status, List<Guid> ParentIds, List<Guid> GroupIds,
    DateTime CreatedAt, DateTime UpdatedAt);

public record MemberCreateRequest(
    string Name, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    bool IsPrivate = false);

public record MemberUpdateRequest(
    string? Name = null, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    bool? IsPrivate = null, bool? IsPinned = null, bool? IsArchived = null,
    bool? IsUntracked = null, bool? PreventFrontNotification = null,
    bool? ReceiveBoardNotifications = null, List<string>? ExtraImages = null,
    string? SpMemberId = null, MemberStatus? Status = null,
    List<Guid>? ParentIds = null);

// ── BoardMessage ──────────────────────────────────────────────────────
public record BoardMessageResponse(
    Guid Id, Guid MemberId, string AuthorName, string Content, DateTime CreatedAt);

public record BoardMessageCreateRequest(string AuthorName, string Content);

// ── MemberNote ────────────────────────────────────────────────────────
public record MemberNoteResponse(
    Guid Id, Guid MemberId, string? Title, string Content,
    bool IsPinned, bool IsLocked, DateTime CreatedAt, DateTime UpdatedAt);

public record MemberNoteCreateRequest(string Content, string? Title = null);

public record MemberNoteUpdateRequest(
    string? Title = null, string? Content = null,
    bool? IsPinned = null, bool? IsLocked = null);
