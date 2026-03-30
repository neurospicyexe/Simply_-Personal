# Plan A — Quick Fixes Spec

**Date:** 2026-03-30
**Status:** Approved for implementation

## Overview

Four self-contained bug fixes identified from user-reported issues and multi-agent code review.
No new features. No schema migrations. Shippable in one session.

---

## Fix 1 — Duplicate Connection Guard

**Bug:** `MemberRelationshipsController.CreateAsync` has no uniqueness check. Users can create
identical connections (same two alters, same label) unlimited times with no feedback.

**Rule:** `(FromMemberId, ToMemberId, Label)` — case-insensitive label comparison — must be unique
among non-deleted relationships. Two alters CAN have multiple connections with different labels
(e.g., Ada → Ezekiel as "mom" AND "caretaker" are both valid; two "mom" entries are a duplicate).

### Backend

- `MemberRelationshipsController.CreateAsync` — before inserting, run:
  ```csharp
  var duplicate = await context.MemberRelationships.AnyAsync(r =>
      r.FromMemberId == body.FromMemberId &&
      r.ToMemberId == body.ToMemberId &&
      r.Label.ToLower() == body.Label.ToLower() &&
      r.DeletedAt == null);
  if (duplicate) return Conflict(new { error = "A relationship with this label already exists between these alters." });
  ```
- Return **409 Conflict** (not 400 — this is a state conflict, not a malformed request).
- No migration needed — enforced in code.

### Frontend

- `NewRelationshipSheet.tsx` — on mutation error (409), show inline error message:
  `"A '[label]' connection already exists between these alters."`
- On success, sheet closes with brief confirmation (sheet closes + parent list refetches — no toast
  needed, the new entry appearing in the list is confirmation enough).

### Tests

- Add `CreateAsync_Returns409_WhenDuplicateLabelExists` to `MemberRelationshipsControllerTests`
- Add `CreateAsync_Returns201_WhenSamePairDifferentLabel` (verify multi-label is allowed)
- Case-insensitive: "Mom" and "mom" should be treated as duplicates

---

## Fix 2 — BottomNav Scroll Clearance

**Bug:** Most pages clip their last ~64px of content behind the fixed BottomNav bar.
`LogsPage` already applies the correct fix (`padding-bottom: 80px`). All other pages need
the same treatment.

### Audit scope

Check and fix these page CSS modules:
- `FrontPage.module.css`
- `MembersPage.module.css`
- `SystemPage.module.css`
- `MemberDetailPage.module.css` (if applicable — has no BottomNav on mobile but verify)
- `SettingsPage.module.css`

### Fix pattern

For each `.page` class missing bottom clearance, add:
```css
padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
```

`LogsPage` uses `80px` flat — standardise all pages to the `calc()` form for proper iOS safe area
support. Update LogsPage to match while we're in there.

---

## Fix 3 — Front History Duration Display

**Bug:** History tab in LogsPage shows only `startTime`. `endTime` is already returned by the API
and present in `FrontContent` type — just never rendered.

### Display format

| State | Display |
|-------|---------|
| Has end time, duration >= 1h | `2:00 PM → 5:20 PM · (3h 20m)` |
| Has end time, duration < 1h | `2:00 PM → 5:20 PM · (20m)` |
| Has end time, duration < 1m | `2:00 PM → 5:20 PM · (< 1m)` |
| No end time (currently fronting) | `2:00 PM → now · (ongoing)` |

### Implementation

- Update `LogsPage.tsx` History tab render (around line 131) to compute and display the range.
- Add a `formatDuration(startMs: number, endMs: number | null): string` helper near `formatDate`.
- Add `.historyTimeRange` CSS class for the secondary time row styling (muted color, smaller text).

### Tests

- Add to `LogsPage.test.tsx`:
  - Duration display when `endTime` is present
  - `(ongoing)` display when `endTime` is null

---

## Fix 4 — SystemMap Full Viewport

**Bug:** SystemMap is embedded in `MembersPage` map view mode with a hardcoded `height: 600px`,
making it cramped. No dedicated page exists.

**Decision:** Keep map inside MembersPage (no new route), but expand to full usable viewport
when `viewMode === 'map'` is active.

### Implementation

- `MembersPage.module.css` `.mapContent` — replace `height: 600px` with:
  ```css
  height: calc(100vh - 64px);
  ```
  (full viewport minus BottomNav height)
- Optionally remove horizontal padding when map is active so the canvas uses full width.
- List and folder view modes: unchanged.

---

## Out of Scope

- SP groups import (Plan B — separate session)
- Code quality debt: loading/error states, ReactMarkdown allowedElements, memoization, aria labels
- Per-alter theming

---

## Success Criteria

- [ ] Cannot create duplicate `(alter pair + label)` connection; 409 returned with clear message
- [ ] UI shows inline error on duplicate attempt
- [ ] All pages scroll to their last element without content clipped by nav bar
- [ ] History tab shows `startTime → endTime · (duration)` or `(ongoing)`
- [ ] SystemMap fills full viewport height when map view is active
- [ ] All existing tests still pass; new tests pass
