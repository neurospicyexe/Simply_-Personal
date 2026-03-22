using PluralHost.Api.Domain;

namespace PluralHost.Api.Services;

public enum TokenResolveStatus { Valid, NotFound, Revoked, Expired }

public record TokenResolveResult(AccessToken? Token, TokenResolveStatus Status);

public interface ITokenVisibilityService
{
    /// <summary>
    /// Filters members to those visible at the given minimum bucket SortOrder.
    /// Throws InvalidOperationException if called with -1 (ReadFrontOnly).
    /// Uses less-than-or-equal: member.Bucket.SortOrder &lt;= minBucketSortOrder.
    /// (MinBucketSortOrder mapping absorbs the old enum offset: Public→0, Friend→1, Trusted→2.
    /// Public members (SortOrder=0) ARE visible to Public tokens (minBucketSortOrder=0) via &lt;=.)
    /// </summary>
    IQueryable<Member> FilterByPermission(IQueryable<Member> members, int minBucketSortOrder);

    /// <summary>
    /// Returns true when the token may post to the member's board.
    /// Requires: MinBucketSortOrder >= 1 (Friend tier or more permissive),
    /// token.AllowsBoardPosting, member.AllowsBoardPosting.
    /// Token validity (not expired, not revoked) must be verified upstream.
    /// </summary>
    bool CanPostToBoard(AccessToken token, Member member);
}
