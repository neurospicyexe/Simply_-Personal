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
    front.ts                 # additions: history list, PATCH, DELETE
```

### Execution phases

**Phase 1 (parallel — 4 independent agents):**
Each agent creates one new tab component + its API module. None touch `MemberDetailPage.tsx`.

- Agent A: `LogsTab` + `api/front.ts` additions
- Agent B: `DossierTab` + `api/notes.ts`
- Agent C: `CommsTab` + `api/board.ts`
- Agent D: `SpecsTab` + `api/fields.ts`

**Phase 2 (single integration agent):**
- Extracts `EssenceTab` and `AccessTab` from `MemberDetailPage`
- Wires all 6 tab components into the shell
- Updates `TabBar` entries

---

## New Types (types.ts)

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

export interface FieldValue {
  fieldId: string
  memberId: string
  value: string
  updatedAt: string
}

export interface MemberFieldEntry {
  field: FieldDef
  value: string | null
}

export interface FrontEntry {
  uid: string
  member: string
  live: boolean
  startTime: number
  endTime?: number
  customStatus?: string
}
```

---

## Tab Specifications

### Essence

**Source:** Extracted from current Profile inline code in `MemberDetailPage`. No behavior changes.

**Data:** `member` prop (from shell), `groups` prop (from shell).

**Interactions:**
- Name, displayName, pronouns, description: click to edit → inline input → blur/Enter → `PATCH /api/members/{id}`
- Group chips: read-only display

---

### Specs

**Purpose:** User-defined extended profile data for this alter.

**Data:**
- `GET /api/fields` → field definitions (system-wide)
- `GET /api/members/{id}/fields` → this alter's field values
- Merged client-side: render each definition with its value (blank if unset)

**Inline edit:** Click a value → becomes input → blur/Enter → `PUT /api/members/{id}/fields/{fieldId}`

**Add field ("+" button → bottom sheet):**
- Preset chips: Role, Age, Interests, Triggers, Likes, Dislikes, Trauma, Strengths
  - Names chosen to match SP/PK field vocabulary for future import pipeline compatibility
- Text input for custom field names
- Tapping a preset or submitting a custom name:
  1. If field name is new: `POST /api/fields` to create definition
  2. `PUT /api/members/{id}/fields/{fieldId}` to set initial value (empty string, editable inline after)
- If a preset field definition already exists (created via another alter): skip step 1, reuse existing `fieldId`

**Empty state:** "No specs defined yet. Use + to add the first one."

---

### Dossier

**Purpose:** Private notes about this alter (owner-only, never shared via tokens).

**Data:** `GET /api/members/{id}/notes`

**Display:** List of note cards, newest first. Each card: bold title, content body, relative timestamp, trash icon.

**Create ("+" button → bottom sheet):**
- Title input (required)
- Multiline content textarea
- Save → `POST /api/members/{id}/notes`, invalidates `['member-notes', memberId]`

**Edit:** Tap note card → same bottom sheet pre-filled → Save → `PATCH /api/members/{id}/notes/{noteId}`

**Delete:** Trash icon → confirm → `DELETE /api/members/{id}/notes/{noteId}`. No Gatekeeper PIN (notes are not destructive per security model).

**Empty state:** "No notes yet. Use + to add the first one."

---

### Comms

**Purpose:** Message board for this alter. Newest messages at top. Messages are immutable once posted (matching SP behavior).

**Data:** `GET /api/members/{id}/board`

**Display:** Cards newest-at-top. Each card: author name (bold), content, relative timestamp, trash icon (owner delete only).

**Post ("+" button → bottom sheet):**
- Author name input
- Message textarea
- Post → `POST /api/members/{id}/board`, invalidates `['member-board', memberId]`

**Delete:** Trash icon → `DELETE /api/members/{id}/board/{msgId}`. No PIN required.

**Empty state:** "No messages yet."

---

### Logs

**Purpose:** Front history entries for this alter.

**Data:** `GET /v1/frontHistory`, filtered client-side to entries where `content.member === member.id`.

**Display:** Cards, most recent first. Each card shows:
- Date (e.g. "Mar 20")
- Time range (e.g. "14:32 – 16:46")
- Duration (computed, e.g. "2h 14m")
- Custom status (if set, shown below)

**Load more:** Offset-based pagination. "Load more" button at list bottom fetches next batch.

**Edit (side drawer):**
- Clicking a card slides open a right-side drawer (list stays visible)
- Editable fields: start time, end time, custom status
- Save → `PATCH /v1/frontHistory/{uid}`, invalidates `['front-history']`
- Delete entry: trash icon in drawer → `DELETE /v1/frontHistory/{uid}`

**Empty state:** "No front history for this alter."

---

### Access

**Source:** Extracted from current Options inline code in `MemberDetailPage`. No behavior changes.

**Data:** `member` prop.

**Interactions:**
- Privacy tier selector (Public / Friend / Trusted / Private) → `PATCH /api/members/{id}`
- Toggle switches: isArchived, isPinned, preventFrontNotification, receiveBoardNotifications → `PATCH /api/members/{id}`

---

## API Modules

### api/notes.ts
```ts
notesApi.list(memberId)                          // GET /api/members/{id}/notes
notesApi.create(memberId, { title, content })    // POST
notesApi.update(memberId, noteId, { title?, content? }) // PATCH
notesApi.delete(memberId, noteId)                // DELETE
```

### api/board.ts
```ts
boardApi.list(memberId)                                    // GET /api/members/{id}/board
boardApi.post(memberId, { authorName, content })           // POST
boardApi.delete(memberId, msgId)                           // DELETE
```

### api/fields.ts
```ts
fieldsApi.listDefs()                                       // GET /api/fields
fieldsApi.createDef(name)                                  // POST /api/fields
fieldsApi.getMemberFields(memberId)                        // GET /api/members/{id}/fields
fieldsApi.upsertMemberField(memberId, fieldId, value)      // PUT /api/members/{id}/fields/{fieldId}
fieldsApi.deleteMemberField(memberId, fieldId)             // DELETE
```

### api/front.ts (additions)
```ts
frontApi.history()                                         // GET /v1/frontHistory
frontApi.updateEntry(uid, { startTime?, endTime?, customStatus? }) // PATCH /v1/frontHistory/{uid}
frontApi.deleteEntry(uid)                                  // DELETE /v1/frontHistory/{uid}
```

---

## Query Keys

| Key | Data |
|-----|------|
| `['member-notes', memberId]` | Notes for one alter |
| `['member-board', memberId]` | Board messages for one alter |
| `['member-fields', memberId]` | Field values for one alter |
| `['field-defs']` | System-wide field definitions |
| `['front-history']` | All front history (filtered client-side per tab) |

---

## Error Handling

- Failed mutations: inline error message inside the active sheet or drawer — not a toast
- Loading states: existing spinner/skeleton patterns
- Empty states: per-tab strings as specified above

---

## Testing

Each tab component gets a focused test in `src/__tests__/`:
- Mock the relevant API module
- Assert rendered output for loaded, loading, and empty states
- Assert mutation calls on user interaction

`MemberDetailPage` test: verify each `activeTab` value renders the correct component.

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
- Specs (custom fields) UX improves on SP's settings-page-first flow
- Logs edit drawer improves on SP's lack of in-app front history editing
