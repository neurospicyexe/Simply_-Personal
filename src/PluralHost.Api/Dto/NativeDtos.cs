namespace PluralHost.Api.Dto;

// ── FrontStatus DTOs ────────────────────────────────────────────────────────

public record FrontStatusResponse(
    Guid Id,
    string Label,
    string? Color,
    bool IsDefault,
    bool IsHidden
);

public record FrontStatusCreateRequest(
    string Label,
    string? Color
);

public record FrontStatusUpdateRequest(
    string? Label,
    string? Color,
    bool? IsHidden
);

// ── Member DTOs ─────────────────────────────────────────────────────────────

public record MemberResponse(
    Guid Id,
    string Name,
    string? DisplayName,
    string? Pronouns,
    string? Color,
    string? AvatarPath,
    string? Role,
    string? Description,
    bool IsPrivate,
    bool IsPinned,
    bool IsArchived,
    bool IsUntracked,
    List<string> ExtraImages,
    bool PreventFrontNotification,
    bool ReceiveBoardNotifications,
    string? SpMemberId,
    List<Guid> ParentIds,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record MemberCreateRequest(
    string Name,
    string? DisplayName,
    string? Pronouns,
    string? Color,
    string? Role,
    string? Description,
    bool? IsPrivate,
    bool? IsPinned,
    bool? IsArchived,
    bool? IsUntracked,
    List<string>? ExtraImages,
    bool? PreventFrontNotification,
    bool? ReceiveBoardNotifications,
    string? SpMemberId,
    List<Guid>? ParentIds
);

public record MemberUpdateRequest(
    string? Name,
    string? DisplayName,
    string? Pronouns,
    string? Color,
    string? Role,
    string? Description,
    bool? IsPrivate,
    bool? IsPinned,
    bool? IsArchived,
    bool? IsUntracked,
    List<string>? ExtraImages,
    bool? PreventFrontNotification,
    bool? ReceiveBoardNotifications,
    string? SpMemberId,
    List<Guid>? ParentIds
);

// ── BoardMessage DTOs ───────────────────────────────────────────────────────

public record BoardMessageResponse(
    Guid Id,
    string AuthorName,
    string Content,
    DateTime CreatedAt
);

public record BoardMessageCreateRequest(
    string AuthorName,
    string Content
);

// ── MemberNote DTOs ─────────────────────────────────────────────────────────

public record MemberNoteResponse(
    Guid Id,
    string? Title,
    string Content,
    bool IsPinned,
    bool IsLocked,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record MemberNoteCreateRequest(
    string Content,
    string? Title
);

public record MemberNoteUpdateRequest(
    string? Content,
    string? Title,
    bool? IsPinned,
    bool? IsLocked
);
