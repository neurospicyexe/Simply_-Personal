using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public enum TokenResolveStatus { Valid, NotFound, Revoked, Expired }

public record TokenResolveResult(AccessToken? Token, TokenResolveStatus Status);

public interface ITokenVisibilityService
{
    /// <summary>
    /// Filters members to those visible at the given permission level.
    /// Throws InvalidOperationException if called with ReadFrontOnly.
    /// Must not call IgnoreQueryFilters — Ghost Mode + soft-delete filters stay active.
    /// Uses strict less-than: (int)member.PrivacyTier &lt; (int)permission.
    /// </summary>
    IQueryable<Member> FilterByPermission(IQueryable<Member> members, TokenPermission permission);

    /// <summary>
    /// Returns true when the token may post to the member's board.
    /// Requires: permission is Friend or Trusted, token.AllowsBoardPosting, member.AllowsBoardPosting.
    /// Token validity (not expired, not revoked) must be verified upstream.
    /// </summary>
    bool CanPostToBoard(AccessToken token, Member member);
}
