# System Map v2 — Design Spec
**Date:** 2026-04-05
**Status:** Approved

## Overview

Replace the embedded SystemMap on MembersPage with a dedicated full-page map experience at `/map`. The new map uses Dagre for layout, supports focus/filter modes for large systems, and shows a slide-in detail panel on node click. Node design upgrades to circle + initial + name + pronouns. The old embedded `SystemMap` component remains untouched until the new page is proven.

---

## Architecture & Routing

### New files
- `src/pages/MapPage.tsx` — page shell, owns all state, queries, focus logic
- `src/components/Map/MemberNodeV2.tsx` — upgraded member node
- `src/components/Map/GroupNodeV2.tsx` — upgraded group node
- `src/components/Map/DetailPanel.tsx` — overlay panel, slides in on selection
- `src/pages/MapPage.module.css`
- `src/components/Map/MemberNodeV2.module.css`
- `src/components/Map/GroupNodeV2.module.css`
- `src/components/Map/DetailPanel.module.css`
- `src/hooks/useMapLayout.ts` — takes members/groups/relationships + filter, runs Dagre, returns React Flow nodes/edges

### Routing
- Add `/map` route to React Router in `App.tsx`
- Add "Map" entry to `BottomNav` (5th item, map icon from Lucide)
- MembersPage map-view toggle remains for now; becomes a link to `/map` in a follow-up

### Layout engine
- Replace `d3-force` with `@dagrejs/dagre` for all layout computation
- Dagre runs synchronously: call `dagre.layout(graph)`, read `node.x`/`node.y`, pass to React Flow
- `useMapLayout` hook encapsulates all layout logic — `MapPage` never touches Dagre directly
- Dagre config varies by filter type:
  - `all` + `group` focus: `rankdir: 'TB'` (top-to-bottom), `ranksep: 80`, `nodesep: 60`
  - `member` focus (1-hop radial): `rankdir: 'LR'` (left-to-right), `ranksep: 100`, `nodesep: 50` — focal member on the left, connections fanning right

---

## Focus / Filter System

### ViewFilter type
```ts
type ViewFilter =
  | { type: 'all' }
  | { type: 'group'; id: string; name: string }
  | { type: 'member'; id: string; name: string }
```

### Subgraph computation (inside `useMapLayout`)
- **All** — all members + group/relationship edges per current mode chip
- **Group focus** — only members belonging to that group + their inter-relationships; group node is Dagre root
- **Member focus** — that member + all directly connected members (1 hop via relationships); member node is Dagre root, connections radiate outward

### Setting the filter — two paths
1. **Toolbar dropdown** — "Viewing: All" button in floating top bar. Opens a searchable picker: groups listed first, then members. Works on touch and keyboard. Selecting an item sets `viewFilter`.
2. **Double-click a node** — sets `viewFilter` to that group or member. Desktop shortcut, does not replace the dropdown.

### Breadcrumb
- When filter is active, "Viewing: All" is replaced by: `"[Name]'s connections  ✕"` (group) or `"[Name]  ✕"` (member)
- Clicking ✕ resets `viewFilter` to `{ type: 'all' }`
- Mode chips (Groups / Relationships / Both) continue to work within any filter

---

## Node Design

### MemberNodeV2
- Colored circle (member's `color` value), white initial letter centered inside
- Member name below circle, white, `--font-display`, semibold
- Pronouns below name, muted color, small size — hidden at zoom < 0.5 via CSS
- **Fronting:** bright ring (member color at full opacity) + soft glow pulse animation; `prefers-reduced-motion` disables pulse, keeps ring
- **Isolated** (no connections in current view): 40% opacity
- **Selected:** ring highlight, slight scale-up (1.05)
- Click → opens DetailPanel
- Double-click → sets `viewFilter` to this member

### GroupNodeV2
- Pill/chip shape (rounded rectangle), group color as border + 8% opacity fill
- Group name inside, member count badge on right edge (e.g. `·4`)
- Click → opens DetailPanel showing group name + member list
- Double-click → sets `viewFilter` to this group

### RelationshipEdge
- Keep existing component, minor style update: use member color at 60% opacity instead of static `#555`
- Directed edges keep arrowhead; label stays at midpoint

---

## Detail Panel

### Behavior
- Fixed position, right edge of canvas, width 220px on desktop/tablet
- On mobile (viewport width < 480px): renders as a bottom sheet instead (slides up from bottom, full width, max-height 50vh) — same content, different position
- Slides in with `transform: translateX(100%)` → `translateX(0)` on desktop, `translateY(100%)` → `translateY(0)` on mobile (200ms ease-out)
- Does **not** resize the canvas — overlays it
- Dismissed by: clicking outside the panel, pressing Escape, or clicking the ✕ button
- When panel is open and user double-clicks a node to focus, panel updates in place (does not close first)

### Content — Member
- Color swatch circle + name (large) + pronouns
- Bucket chip (bucket name + emoji)
- Fronting badge if currently fronting (`● Fronting` in lime)
- Relationships list: `→ Mira  partners` / `↔ Orin  headmate` — directed/undirected shown with different arrow glyphs
- "Open Profile →" button — navigates to `/members/:id`

### Content — Group
- Group color + name (large)
- Member count
- Member chips (name + color dot) — up to 8, then "+ N more"
- No "open profile" link (groups have no detail page yet)

---

## FloatingToolbar (inside MapPage)

```
[ Viewing: All ▾ ]   [ Groups | Relationships | Both ]   [ ⊕ Add ]  [ ⤢ Fit ]
```

- Centered top, floats above canvas
- "Viewing" dropdown replaces breadcrumb when filter is active
- "⊕ Add" opens `NewRelationshipSheet` (existing component) if mode includes relationships; opens `GroupSheet` if mode is groups-only
- "⤢ Fit" calls React Flow's `fitView()`

### Minimap + Zoom
- Minimap: bottom-left, 80×60px, dark theme
- Zoom controls: bottom-right, − and + buttons

---

## Data Flow

```
useQuery(['members'])        ─┐
useQuery(['groups'])          ├─→ useMapLayout(members, groups, relationships, fronters, viewFilter, mode)
useQuery(['relationships'])   │        └─→ { nodes: Node[], edges: Edge[] }
useQuery(['front-current'])  ─┘                    │
                                                    ▼
                                            ReactFlow (nodes, edges)
                                                    │
                                         onNodeClick → setSelectedNode → DetailPanel
                                        onNodeDoubleClick → setViewFilter
```

---

## Error Handling

- Empty state (no members): centered message "No members yet — add one to get started"
- Empty state after filter (no connections): "No connections found for [name]" with a "Clear filter" link
- Query errors: silent fallback to empty arrays (existing pattern)

---

## Testing

- `useMapLayout.test.ts` — unit tests: all-mode output, group-focus subgraph, member-focus subgraph, isolated node detection
- `MapPage.test.tsx` — render smoke test, filter dropdown interaction, detail panel open/close, Escape dismiss
- `DetailPanel.test.tsx` — renders member data, renders group data, "Open Profile" navigation
- No new backend tests needed (no new API endpoints)

---

## Out of Scope (this plan)

- Export to PNG
- Keyboard navigation between nodes
- Undo/redo for relationship edits
- Retiring the embedded SystemMap from MembersPage
- Per-alter theming on nodes
