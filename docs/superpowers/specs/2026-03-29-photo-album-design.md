# Photo Album Design Spec

## Overview

A Photos tab on MemberDetailPage for storing multiple per-alter images. Uses the existing `Member.extraImages` string array — no backend changes required.

## Feature Scope

- 7th tab (`Photos`) added to `MemberDetailPage`
- Upload, view, set-as-background, and delete per-alter photos
- Architecture: full-array PATCH on `extraImages` (same pattern as other media fields)

## Architecture

### Backend (no changes)
`Member.ExtraImages: List<string>` already persisted. `MemberUpdateRequest.ExtraImages` already accepted in PATCH. Upload via existing `POST /api/media/upload`.

### Frontend files
- Create: `src/PluralHost.Web/src/components/tabs/PhotosTab.tsx`
- Create: `src/PluralHost.Web/src/components/tabs/PhotosTab.module.css`
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.tsx` — add Photos tab entry

## Components

### PhotosTab
Props: `memberId: string`, `extraImages: string[]`, `memberColor: string`, `onUpdate: (images: string[]) => void`

State:
- `uploading: boolean` — upload in-flight
- `uploadError: string | null`
- `selectedPhoto: string | null` — path of tapped photo; drives BottomSheet open state
- `sheetError: string | null` — error inside the action sheet
- `sheetBusy: boolean` — action in-flight inside sheet

### Grid
CSS `column-count: 2; column-gap: 6px`. Each `<img>` has `break-inside: avoid; width: 100%; border-radius: 6px; cursor: pointer; margin-bottom: 6px`. Heights vary naturally by aspect ratio — no fixed heights, no JS layout library.

### Upload
Top-right `+ Add photo` button (ghost style, member-color border). Hidden `<input type="file" accept="image/*">`. On change: upload → append path to local copy of extraImages → PATCH full array → call `onUpdate`. Error shown inline below button.

### BottomSheet (tap to open)
Tapping any photo sets `selectedPhoto`. Sheet contains:
- `<img>` preview: `width: 100%; max-height: 180px; object-fit: contain; border-radius: 8px`
- `Set as background` button: full width, member-color accent (same style as other primary actions)
- `Delete` button: danger red, full width
- `sheetError` text below buttons if action fails

**Set as background:** PATCH `{ backgroundImagePath: selectedPhoto }` → close sheet.
**Delete:** remove `selectedPhoto` from extraImages → PATCH full array → close sheet.

### Empty state
Shown when `extraImages.length === 0`. Dashed border box (`border: 1px dashed #2a2a2a`), centered, contains small icon + "No photos yet — add some above."

## Data Flow

```
Upload:
  file input change
    → POST /api/media/upload
    → append path to extraImages copy
    → PATCH /api/members/:id { extraImages: [..., newPath] }
    → onUpdate([...updated])

Delete:
  tap photo → open sheet
  tap Delete
    → filter path from extraImages copy
    → PATCH /api/members/:id { extraImages: [...remaining] }
    → onUpdate([...remaining])
    → close sheet

Set as background:
  tap photo → open sheet
  tap Set as background
    → PATCH /api/members/:id { backgroundImagePath: selectedPath }
    → close sheet
```

## Error Handling

- Upload failure: set `uploadError`, revert optimistic state (no array mutation on failure)
- Delete/set-bg failure: set `sheetError`, keep sheet open so user can retry

## Tests

- `PhotosTab` renders empty state when `extraImages` is empty
- `PhotosTab` renders photo grid when `extraImages` has items
- Upload button triggers file input
- Tapping a photo opens BottomSheet
- "Set as background" calls PATCH with `backgroundImagePath`
- "Delete" calls PATCH with photo removed from array
- Upload error shown on media upload failure
- Sheet error shown on delete failure

## Tab Integration

`MemberDetailPage` TABS array gains `{ id: 'photos', label: 'Photos' }` as 7th entry. Switch case renders `<PhotosTab memberId={id} extraImages={member.extraImages ?? []} memberColor={memberColor} onUpdate={handlePhotosUpdate} />`.

`handlePhotosUpdate` calls `qc.invalidateQueries({ queryKey: ['member', id] })` and optimistically updates local member state.
