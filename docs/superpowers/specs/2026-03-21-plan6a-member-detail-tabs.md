# Plan 6a — Member Detail Tabs (Essence / Specs / Dossier / Comms / Logs / Access)

**Date:** 2026-03-21
**Status:** Approved for implementation
**Branch:** claude/init-project-setup-sO5k5

---

## Overview

Extends `MemberDetailPage` from 2 tabs (Profile, Options) to 6 tabs with distinct identities. The page is refactored into a pure shell that routes between isolated tab components. Four new tabs are built in parallel by independent agents; two existing tabs are extracted and renamed.

---

## Tab Bar

**Layout:** Single horizontally-scrolling pill row. Extends the existing `TabBar` component — no layout change, just more entries.

**Tab order and labels:**

| Label | Former name | Route value |
|-------|-------------|-------------|
| Essence | Profile | `essence` |
| Specs | — (new) | `specs` |
| Dossier | — (new) | `dossier` |
| Comms | — (new) | `comms` |
| Logs | — (new) | `logs` |
| Access | Options | `access` |

---

## Architecture

### MemberDetailPage (shell)

Owns only:
- `activeTab` state (default `essence`)
- `GET /api/members/{id}` query (member data)
- `GET /api/groups` query (group list)
- Renders `<TabBar>` and the active tab component

Passes to each tab: `member`, `groups` (where needed). No business logic, no inline tab JSX.

### File structure

```
src/
  components/
    BottomSheet.tsx          # new shared component (created by Agent B, used by C and D)
    BottomSheet.module.css
    Drawer.tsx               # new shared component (right-side slide panel, created by Agent A)
    Drawer.module.css
    tabs/
      EssenceTab.tsx         # extracted from current Profile inline code
      EssenceTab.module.css
      SpecsTab.tsx           # new
      SpecsTab.module.css
      DossierTab.tsx         # new
      DossierTab.module.css
      CommsTab.tsx           # new
      CommsTab.module.css
      LogsTab.tsx            # new
      LogsTab.module.css
      AccessTab.tsx          # extracted from current Options inline code
      AccessTab.module.css
  api/
    notes.ts                 # new
    board.ts                 # new
    fields.ts                # new (field defs + member field values)
    front.ts                 # additions to existing file (history list, PATCH, DELETE)
```

### Shared components created in Phase 1

**`BottomSheet.tsx`** — created by Agent B. A bottom-anchored slide-up sheet with a dark overlay, matching the `CreateMemberSheet` visual style (same background, border-radius, padding, animation). Props: `isOpen: boolean`, `onClose: () => void`, `title: string`, `children: ReactNode`. Agents C and D import this component.

**`Drawer.tsx`** — created by Agent A. A right-side slide-in panel that overlays the content without displacing it (position: fixed, right-anchored). Props: `isOpen: boolean`, `onClose: () => void`, `title: string`, `children: ReactNode`. Used only by `LogsTab`.

### Execution phases

**Phase 0 (sequential prerequisite — single agent):**
Creates `BottomSheet.tsx` and `BottomSheet.module.css`. This must complete before Phase 1 begins. Agents C and D import from this file; they cannot start until it exists.

`BottomSheet` props: `isOpen: boolean`, `onClose: () => void`, `title: string`, `children: ReactNode`. Visual style matches `CreateMemberSheet`: same dark overlay, slide-up animation, border-radius, padding.

**Pre-phase (types):**
New types live locally in each tab's file during Phase 1 (not in `types.ts` — avoids parallel merge conflicts). Phase 2 moves all new interfaces into `types.ts`.

**Phase 1 (parallel — 4 independent agents):**
Each agent creates one new tab component + its API module + any assigned shared component. None touch `MemberDetailPage.tsx` or `types.ts`.

- Agent A: `LogsTab` + `Drawer.tsx` + `api/front.ts` additions
- Agent B: `DossierTab` + `api/notes.ts`
- Agent C: `CommsTab` + `api/board.ts`
- Agent D: `SpecsTab` + `api/fields.ts`

All four agents may import `BottomSheet` from `src/components/BottomSheet.tsx` (created in Phase 0).

**Phase 2 (single integration agent):**
- Moves all tab-local type interfaces into `types.ts`
- Extracts `EssenceTab` and `AccessTab` from `MemberDetailPage` by reading the current source to identify which local state and hooks belong to each section
  - **Essence source:** the inline Profile section currently renders: name (`isEditing` state), displayName, pronouns, description (all inline-editable), and group chips (read-only). Approximately 120–150 lines of JSX.
  - **Access source:** the inline Options section renders: privacy tier selector and four boolean toggles. Approximately 60–80 lines.
- Wires all 6 tab components into the shell
- Updates `TabBar` entries
- Verifies `['front-history']` query key matches the key used in `FrontPage` (check `src/pages/FrontPage.tsx` and existing `api/front.ts`) so cache invalidation from `LogsTab` is shared correctly

---

## Types

The following interfaces are added to `types.ts` by the Phase 2 integration agent. During Phase 1 each agent defines these locally in their tab file.

```ts
export interface MemberNote {
  id: string
  memberId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface BoardMessage {
  id: string
  memberId: string
  authorName: string
  content: string
  createdAt: string
}

export interface FieldDef {
  id: string
  name: string
  createdAt: string
}

export interface MemberFieldEntry {
  fieldId: string
  memberId: string
  value: string
  updatedAt: string
}
```

**Note on `FrontContent`:** The Logs tab uses the existing `FrontContent` type already in `types.ts` (no new type needed). Confirmed fields: `uid: string`, `member: string`, `live: boolean`, `startTime: number`, `endTime?: number`, `custom: boolean`, `customStatus?: string`. `FrontContent.member` is the member's UUID string — used for client-side filtering (`entry.content.member === member.id`). `FrontContent.uid` is the value used as `{id}` in `PATCH /v1/frontHistory/{id}` and `DELETE /v1/frontHistory/{id}`.

**Note on `FrontUpdatePayload`:** Already defined in `types.ts` with fields: `live?: boolean`, `endTime?: number`, `customStatus?: string`, `memberId?: string`, `startTime?: number`. The Logs edit drawer uses `startTime`, `endTime`, and `customStatus` only.

---

## Tab Specifications

### Essence

**Source:** Extracted from current Profile inline code in `MemberDetailPage`. No behavior changes.

**Data:** `member` prop (from shell), `groups` prop (from shell).

**Interactions:**
- Name, displayName, pronouns, description: click to edit → inline input → blur/Enter → `PATCH /api/members/{id}`
- Group chips: read-only display

**Error states:** Mutation failure shows inline error below the edited field. Query error (member fails to load) is handled by the shell — Essence receives a valid `member` prop or nothing renders.

---

### Specs

**Purpose:** User-defined extended profile data for this alter.

**Data:**
- `GET /api/fields` → all field definitions (system-wide). Query key: `['field-defs']`
- `GET /api/members/{id}/fields` → this alter's field values. Query key: `['member-fields', memberId]`
  - Backend endpoint: `GET /api/members/{memberId}/fields` on `MemberFieldsController` returns all field values for the member in one call.
- Merged client-side: for each `FieldDef`, find the matching `MemberFieldEntry` by `fieldId`. Render as label + value (blank if no entry).

**Inline edit:** Click a value (or the blank placeholder) → becomes a text input → blur/Enter → `PUT /api/members/{id}/fields/{fieldId}`, invalidates `['member-fields', memberId]`.

**Empty-value entries:** A row with `value === ""` IS rendered (the backend entry exists). The row appears with the field name label and a blank/placeholder value ready for inline edit. It is not hidden.

**Delete field value:** Trash icon on each row → `DELETE /api/members/{id}/fields/{fieldId}`, invalidates `['member-fields', memberId]`. This removes the value entry only; the field definition remains in the system.

**Add field ("+" button → `BottomSheet`):**
- Preset chips: `Role`, `Age`, `Interests`, `Triggers`, `Likes`, `Dislikes`, `Trauma`, `Strengths`
  - Names chosen to match SP/PK field vocabulary for future import pipeline compatibility
- Text input below chips for custom field names
- Tapping a preset or submitting custom name:
  1. **Dedup check:** filter the `['field-defs']` cache client-side for entries where `deletedAt == null` (soft-deleted defs are excluded from matching). Compare the target name case-insensitively. If a match exists, use that `fieldId` — skip creation.
  2. If no match: `POST /api/fields` → creates definition, invalidates `['field-defs']`
  3. `PUT /api/members/{id}/fields/{fieldId}` with `value: ""` → creates the entry (user edits inline after)
  4. Invalidates `['member-fields', memberId]`
- Preset chips that already exist in the filtered `['field-defs']` list are shown with a dimmed/checked appearance.
- **Tapping a dimmed preset chip** (field def already exists): same action as a normal tap — finds the existing `fieldId` and runs step 3 directly (assigns the field to this alter with `value: ""`). If the alter already has a value for it (entry already in `['member-fields']`), no PUT is issued — the sheet closes and the existing row is already visible for inline edit.
- **Known limitation:** concurrent creation from two sessions can create duplicate field defs with the same name if both sessions pass the dedup check before either writes. Acceptable at this scale.

**Loading state:** Spinner while either query is in-flight.
**Error state (query):** Inline "Failed to load fields" with retry button.
**Empty state:** "No specs defined yet. Use + to add the first one."

---

### Dossier

**Purpose:** Private notes about this alter (owner-only, never shared via tokens).

**Data:** `GET /api/members/{id}/notes`. Query key: `['member-notes', memberId]`

**Display:** List of note cards, newest first. Each card: bold title, content body (truncated at 3 lines with expand), relative timestamp, trash icon.

**Bottom sheet component:** `NoteSheet` uses `BottomSheet.tsx` with `title="New Note"` (create) or `title="Edit Note"` (edit). It is one component instance with a `note?: MemberNote` prop — presence of `note` determines create vs edit mode.

**Create ("+" button → NoteSheet with no `note` prop):**
- Title input (required, blocks Save if empty)
- Multiline content textarea
- Save → `POST /api/members/{id}/notes`, invalidates `['member-notes', memberId]`

**Edit (tap note card → NoteSheet with `note` prop pre-filled):**
- Same fields, pre-populated
- Title remains required (blocks Save if empty — same validation as create)
- Save → `PATCH /api/members/{id}/notes/{noteId}`, invalidates `['member-notes', memberId]`

**Delete:** Trash icon → `window.confirm()` dialog (simple browser confirm, no custom modal) → `DELETE /api/members/{id}/notes/{noteId}`, invalidates `['member-notes', memberId]`. No Gatekeeper PIN (notes are not destructive per security model).

**Loading state:** Spinner while query in-flight.
**Error state (query):** Inline "Failed to load notes" with retry button.
**Error state (mutation):** Inline error inside the sheet below the Save button.
**Empty state:** "No notes yet. Use + to add the first one."

---

### Comms

**Purpose:** Message board for this alter. Newest messages at top. Messages are immutable once posted (no edit — matching SP behavior).

**Data:** `GET /api/members/{id}/board`. Query key: `['member-board', memberId]`

**Display:** Cards newest-at-top. Each card: author name (bold), content, relative timestamp, trash icon (owner delete only).

**Post ("+" button → `BottomSheet`):**
- Author name input (required — blocks Post if empty, no pre-fill)
- Message textarea (required)
- Post → `POST /api/members/{id}/board`, invalidates `['member-board', memberId]`

**Delete:** Trash icon → `DELETE /api/members/{id}/board/{msgId}`, invalidates `['member-board', memberId]`. No PIN required.

**Loading state:** Spinner while query in-flight.
**Error state (query):** Inline "Failed to load messages" with retry button.
**Error state (mutation):** Inline error inside the sheet below the Post button.
**Empty state:** "No messages yet."

---

### Logs

**Purpose:** Front history entries for this alter.

**Data:** `GET /v1/frontHistory`. Query key: `['front-history']`

The endpoint returns all front history entries as `SpEnvelope<FrontContent>[]`. Filter client-side: `entries.filter(e => e.content.member === member.id)`. The backend does not support server-side filtering or pagination on this endpoint.

**Pagination (client-side):** Load all entries once. Display the first 20 matching entries. "Load more" button increments the visible count by 20 — no additional fetch required.

**Display:** Cards, most recent first (sort by `content.startTime` descending). Each card:
- Date (formatted from `content.startTime` unix ms, e.g. "Mar 20")
- Time range (e.g. "14:32 – 16:46", or "14:32 – ongoing" if `content.live === true`)
- Duration (computed from `endTime - startTime`, formatted as "2h 14m"; omitted if live)
- Custom status (if `content.customStatus` is set, shown below as secondary text)

**Edit (click card → `Drawer` slides open, list stays visible):**
- Editable fields:
  - Start time: `datetime-local` input. Convert `content.startTime` (unix ms) to display value with `new Date(ms).toISOString().slice(0, 16)`. On save, convert back with `new Date(inputValue).getTime()`.
  - End time: same conversion. Disabled and empty when `content.live === true` (live entry has no `endTime`). `content.endTime` is `undefined` for live entries — initialize the input to empty string.
  - Custom status: plain text input, empty string if `content.customStatus` is unset.
- Save → `PATCH /v1/frontHistory/{uid}` where `uid = entry.content.uid`, using `FrontUpdatePayload` fields `{ startTime, endTime, customStatus }`, invalidates `['front-history']`
- The drawer title shows the formatted date of the entry
- Delete entry: trash icon in drawer footer → `window.confirm()` → `DELETE /v1/frontHistory/{uid}`, invalidates `['front-history']`

**`api/front.ts` additions:** This file already exists for the FrontPage. Agent A appends the following functions without modifying or duplicating existing exports:
```ts
frontApi.history()                                              // GET /v1/frontHistory → SpEnvelope<FrontContent>[]
frontApi.updateEntry(uid, payload: FrontUpdatePayload)          // PATCH /v1/frontHistory/{uid}
frontApi.deleteEntry(uid)                                       // DELETE /v1/frontHistory/{uid}
```
`FrontUpdatePayload` is already defined in `types.ts`.

**Loading state:** Spinner while query in-flight.
**Error state (query):** Inline "Failed to load history" with retry button.
**Error state (mutation):** Inline error inside the drawer below Save.
**Empty state:** "No front history for this alter."

---

### Access

**Source:** Extracted from current Options inline code in `MemberDetailPage`. No behavior changes.

**Data:** `member` prop.

**Interactions:**
- Privacy tier selector (Public / Friend / Trusted / Private) → `PATCH /api/members/{id}`
- Toggle switches: isArchived, isPinned, preventFrontNotification, receiveBoardNotifications → `PATCH /api/members/{id}`

**Error states:** Mutation failure shows inline error below the changed control.

---

## API Modules

### api/notes.ts
```ts
notesApi.list(memberId)                              // GET  /api/members/{id}/notes
notesApi.create(memberId, { title, content })        // POST /api/members/{id}/notes
notesApi.update(memberId, noteId, { title?, content? }) // PATCH /api/members/{id}/notes/{noteId}
notesApi.delete(memberId, noteId)                    // DELETE /api/members/{id}/notes/{noteId}
```

### api/board.ts
```ts
boardApi.list(memberId)                              // GET    /api/members/{id}/board
boardApi.post(memberId, { authorName, content })     // POST   /api/members/{id}/board
boardApi.delete(memberId, msgId)                     // DELETE /api/members/{id}/board/{msgId}
```

### api/fields.ts
```ts
fieldsApi.listDefs()                                 // GET    /api/fields
fieldsApi.createDef(name)                            // POST   /api/fields
fieldsApi.getMemberFields(memberId)                  // GET    /api/members/{id}/fields
fieldsApi.upsertMemberField(memberId, fieldId, value)// PUT    /api/members/{id}/fields/{fieldId}
fieldsApi.deleteMemberField(memberId, fieldId)       // DELETE /api/members/{id}/fields/{fieldId}
```

### api/front.ts (additions to existing file)
```ts
frontApi.history()                                   // GET    /v1/frontHistory
frontApi.updateEntry(uid, payload)                   // PATCH  /v1/frontHistory/{uid}
frontApi.deleteEntry(uid)                            // DELETE /v1/frontHistory/{uid}
```

---

## Query Keys

| Key | Data | Invalidated by |
|-----|------|----------------|
| `['member-notes', memberId]` | Notes for one alter | create, update, delete note |
| `['member-board', memberId]` | Board messages for one alter | post, delete message |
| `['member-fields', memberId]` | Field values for one alter | upsert, delete field value |
| `['field-defs']` | System-wide field definitions | create field def |
| `['front-history']` | All front history entries | update, delete entry |

---

## Error Handling

**Query failures:** Each tab shows an inline error message with a retry button in place of its content area. No tab propagates query errors to the shell.

**Mutation failures:** Inline error message inside the active `BottomSheet` or `Drawer`, below the primary action button. The sheet/drawer stays open so the user can retry or cancel.

**Loading states:** Existing spinner pattern from the codebase.

**Empty states:** Per-tab strings as specified in each tab section above.

---

## Testing

Each tab component gets a focused test in `src/__tests__/`:
- Mock the relevant API module
- Assert rendered output for loaded, loading, empty, and error states
- Assert mutation calls on user interaction

`MemberDetailPage` test: verify each `activeTab` value renders the correct component. Existing tests for the Profile and Options inline sections are replaced by `EssenceTab` and `AccessTab` tests respectively.

---

## Out of Scope (future plans)

- Import pipeline UI (SP/PluralKit token → merge alters) — Plan 6b
  - Preset field names in Specs are chosen to align with SP/PK vocabulary to ease future mapping
- Avatar upload — separate plan
- Journal UI — separate plan
- Groups management UI — separate plan
- Delete member flow (Gatekeeper PIN) — separate plan

---

## SP UI Reference Alignment

Per `docs/reference/simply-plural-ui.md`: SP has 6 tabs (Groups / Profile / Board / History / Notes / Options). Plan 6a delivers the equivalent 6-tab structure with renamed labels and improved UX:
- Groups tab deferred (no native `/api/groups` CRUD yet)
- Specs (custom fields) UX eliminates SP's settings-page-first friction
- Logs edit drawer adds in-app front history editing that SP lacks
