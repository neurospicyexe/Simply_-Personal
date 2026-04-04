namespace PluralHost.Api.Dto;

// ── Envelope ──────────────────────────────────────────────────────────
public record SpEnvelope<T>(bool Exists, string Id, T Content)
{
    public static SpEnvelope<T> Of(string id, T content) => new(true, id, content);
    public static SpEnvelope<T> NotFound() => new(false, "", default!);
}

// Epoch-ms helpers (SP uses JavaScript-style milliseconds, not Unix seconds)
public static class Epoch
{
    public static long ToMs(DateTime dt) =>
        new DateTimeOffset(dt, TimeSpan.Zero).ToUnixTimeMilliseconds();

    public static DateTime FromMs(long ms) =>
        DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime;
}

// ── Member ────────────────────────────────────────────────────────────
public record SpMemberContent(
    string Uid,
    string Name,
    string? Desc,
    string? Pronouns,
    string? Color,
    string? AvatarUrl,
    bool Private,
    bool Archived,         // maps to Member.IsArchived
    string? PkId           // maps to Member.PkId
);

public record SpMemberCreateRequest(
    string Name,
    string? Desc = null,
    string? Pronouns = null,
    string? Color = null,
    bool Private = false
);

public record SpMemberUpdateRequest(
    string? Name = null,
    string? Desc = null,
    string? Pronouns = null,
    string? Color = null,
    bool? Private = null,
    bool? Archived = null
);

// ── Front History ─────────────────────────────────────────────────────
public record SpFrontContent(
    string Uid,
    string Member,         // member ID string
    bool Live,
    long StartTime,        // epoch ms
    long? EndTime,         // epoch ms, null if live
    bool Custom,
    string? CustomStatus,
    string? Comment        // free-text annotation -- separate from status label
);

public record SpFrontCreateRequest(
    string Member,
    bool Live,
    long StartTime,
    long? EndTime = null,
    bool Custom = false,
    string? CustomStatus = null
);

public record SpFrontUpdateRequest(
    bool? Live = null,
    long? EndTime = null,
    string? CustomStatus = null,
    string? MemberId = null,
    long? StartTime = null,
    string? Comment = null   // set/clear free-text annotation
);

// ── Group ─────────────────────────────────────────────────────────────
public record SpGroupContent(
    string Uid,
    string Name,
    string? Desc,
    string? Color,
    string? Emoji,
    string Parent,
    bool Private,
    IReadOnlyList<string> Members
);

public record SpGroupCreateRequest(
    string Name,
    string? Desc = null,
    string? Color = null,
    string? Emoji = null,
    string Parent = "",
    bool Private = false,
    List<string>? Members = null
);

public record SpGroupUpdateRequest(
    string? Name = null,
    string? Desc = null,
    string? Color = null,
    string? Emoji = null,
    string? Parent = null,
    bool? Private = null,
    List<string>? Members = null
);

// PATCH /v1/group/members — set all groups a member belongs to
public record SpSetGroupMembershipsRequest(
    string Member,
    List<string> Groups
);

// ── System ────────────────────────────────────────────────────────────
public record SpSystemContent(
    string Uid,
    string Username,
    string Desc,
    bool IsAsystem,
    string Color,
    string? AvatarUrl
);
