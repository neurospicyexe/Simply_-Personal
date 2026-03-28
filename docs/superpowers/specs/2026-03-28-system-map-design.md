# System Map Design Spec

**Date:** 2026-03-28

---

## Goal

Add a force-directed interactive graph view to MembersPage that visualizes two layers of system structure: group membership (existing data) and custom alter-to-alter relationships (new data). Toggle between List and Map view. Relationships can be created from the map via drag-to-connect or from a member's detail page.

---

## Architecture

### Backend

**New entity:** `MemberRelationship`
- Inherits `BaseEntity` (soft-delete, timestamps)
- `FromMemberId` — `Guid`, FK to Members
- `ToMemberId` — `Guid`, FK to Members
- `Label` — `string`, max 100 chars, trimmed
- `IsDirected` — `bool`
- Ghost Mode filter applies (relationship queries return empty when system is frozen)

**New controller:** `MemberRelationshipsController`
- `GET /api/members/relationships` — returns all non-deleted relationships
- `POST /api/members/relationships` — create; validates both member IDs exist and are not deleted
- `PATCH /api/members/relationships/{id}` — update `Label` and/or `IsDirected`
- `DELETE /api/members/relationships/{id}` — soft-delete

All endpoints `[Authorize]`.

**Migration:** `AddMemberRelationships` — adds `MemberRelationships` table with FK constraints to `Members`.

### Frontend

**New package dependencies:**
- `@xyflow/react` (React Flow v12)
- `d3-force`

**New files:**
- `src/PluralHost.Web/src/components/SystemMap/SystemMap.tsx`
- `src/PluralHost.Web/src/components/SystemMap/MemberNode.tsx`
- `src/PluralHost.Web/src/components/SystemMap/GroupNode.tsx`
- `src/PluralHost.Web/src/components/SystemMap/RelationshipEdge.tsx`
- `src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx`
- `src/PluralHost.Web/src/components/SystemMap/SystemMap.module.css`
- `src/PluralHost.Web/src/api/relationships.ts`

**Modified files:**
- `src/PluralHost.Web/src/pages/MembersPage.tsx` — List/Map toggle; renders `<SystemMap />` when Map active
- `src/PluralHost.Web/src/pages/MembersPage.module.css` — toggle styles
- `src/PluralHost.Web/src/components/tabs/DossierTab.tsx` — Connections section
- `src/PluralHost.Web/src/components/tabs/DossierTab.module.css`
- `src/PluralHost.Web/src/types.ts` — `MemberRelationship` type

---

## API

### `GET /api/members/relationships`

Returns all non-deleted relationships.

```json
[
  {
    "id": "...",
    "fromMemberId": "...",
    "toMemberId": "...",
    "label": "siblings",
    "isDirected": false,
    "createdAt": "...",
    "updatedAt": "..."
  }
]
```

### `POST /api/members/relationships`

```json
{ "fromMemberId": "...", "toMemberId": "...", "label": "parent of", "isDirected": true }
```

Returns 201 with created relationship. Returns 400 if either member ID is invalid/deleted or label is empty.

### `PATCH /api/members/relationships/{id}`

```json
{ "label": "former rivals", "isDirected": false }
```

Both fields optional. Returns 404 if not found.

### `DELETE /api/members/relationships/{id}`

Returns 204. Soft-deletes.

---

## Components

### `SystemMap`

**Location:** Rendered inside `MembersPage` when Map mode is active.

**Behavior:**
- Fetches members, groups, and relationships via TanStack Query
- Runs d3-force simulation to compute node positions on each load (no persisted positions)
- Mode filter chips: **Groups** / **Relationships** / **Both** — controls which node types and edge types are visible
- Groups mode: shows `MemberNode` + `GroupNode` + membership edges
- Relationships mode: shows `MemberNode` + `RelationshipEdge`
- Both mode: shows all of the above
- Drag from one `MemberNode` and release onto another → opens `NewRelationshipSheet`
- Pan and zoom enabled (React Flow default)
- Isolated members (no groups, no relationships in current mode) shown with dashed ring border

### `MemberNode`

- Circle, 36px diameter
- Border: 2px solid `member.color ?? var(--color-primary)`
- Background: `#1a1a1a`
- Label: member name, below the circle, 10px
- Currently fronting: lime pulsing ring animation (same as FrontCard indicator)
- Click: navigate to `/members/:id`

### `GroupNode`

- Pill shape (rounded rect), height 26px
- Border: 1.5px solid `group.color ?? #666`
- Background: `group.color` at 12% opacity
- Label: group name, 10px, inside pill
- Click: pulses (briefly brightens border) all member nodes that belong to this group
- Only visible in Groups / Both mode

### `RelationshipEdge`

- Custom React Flow edge
- Undirected: plain line, 1.5px, edge color `#555`
- Directed: line + arrowhead marker at target end, same color
- Label: displayed at edge midpoint, 9px, color `#888`
- Only visible in Relationships / Both mode

### `NewRelationshipSheet`

- Bottom sheet (uses existing `BottomSheet` component)
- Header: "New connection — [FromMember] → [ToMember]"
- Text input: label (placeholder: "e.g. siblings, parent of, rivals…", max 100 chars)
- Toggle: **Undirected** (line icon) / **Directed** (arrow icon) — pill buttons
- Save button: calls `POST /api/members/relationships`, invalidates `['relationships']` query, closes sheet
- Cancel button: closes sheet, no mutation
- Validation: label must be non-empty to enable Save

### DossierTab — Connections section

- Renders below Notes section, same card pattern
- Section heading: "Connections"
- List of relationships involving this member: shows other member's name + label + direction indicator (→ or ↔)
- "+ Add" button → opens `NewRelationshipSheet` with this member pre-set as `fromMemberId`
- Delete button on each row → soft-deletes relationship (with confirmation)

---

## Visual Design

**Mode chips:** Same pill button pattern as FrontHeatmap time range toggle (lime active, dark inactive).

**Canvas background:** `#0d0d0d` (matches app dark theme).

**Membership edges:** Thin lines (1px) in the connected group's color at 35% opacity — low contrast, structural.

**Relationship edges:** `#555` with label in `#888` — neutral so they don't fight member colors.

**Isolated member node:** Dashed border ring instead of solid, same color at 50% opacity.

**Currently-fronting member node:** Subtle lime pulse animation on the outer ring.

---

## Data Flow

```
SystemMap mounts
  → useQuery(['members']) → GET /api/members
  → useQuery(['groups']) → GET /api/groups
  → useQuery(['relationships']) → GET /api/members/relationships
  → useQuery(['front-current']) → GET /v1/fronters (for fronting indicator on nodes)
  → d3-force simulation runs with nodes + edges
  → React Flow renders with computed positions

Drag-to-connect:
  → NewRelationshipSheet opens
  → User fills label + direction → Save
  → POST /api/members/relationships
  → invalidate ['relationships']
  → map re-renders with new edge

DossierTab → Add connection:
  → NewRelationshipSheet opens (fromMemberId pre-filled)
  → same flow as above
```

---

## Testing

### Backend

`MemberRelationshipsControllerTests`:
- `GetAll_ReturnsNonDeletedRelationships`
- `GetAll_WhenFrozen_ReturnsEmpty`
- `Create_WithValidMembers_Returns201`
- `Create_WithDeletedMember_Returns400`
- `Create_WithEmptyLabel_Returns400`
- `Patch_UpdatesLabelAndDirection`
- `Patch_NotFound_Returns404`
- `Delete_SoftDeletesRelationship`

### Frontend

`SystemMap.test.tsx`:
- Member nodes render for each member
- Groups mode shows group nodes, hides relationship edges
- Relationships mode shows relationship edges, hides group nodes
- Clicking a member node navigates to `/members/:id`

`NewRelationshipSheet.test.tsx`:
- Renders with from/to member names in header
- Save disabled when label empty
- Directed/undirected toggle changes `isDirected` in payload
- Save calls `POST /api/members/relationships` with correct payload

---

## Scope Boundaries

- **No persisted node positions** — force layout re-runs on every load
- **No relationship types/categories** — free-form labels only
- **No filtering by relationship label** — mode chips only (Groups/Relationships/Both)
- **No bulk import of relationships** — manual creation only
- **Ghost Mode** — all relationship endpoints return empty when `IsFrozen = true`
